"""
重新定位所有停车场坐标 v4 — 微信地图地点搜索
策略：
  1. 城市+项目名称 在微信地图（腾讯地图地点搜索）中搜索
  2. 搜索结果与项目名一致的，直接标记坐标
  3. 搜不到或用地址搜索，在 Excel 中备注
API: 腾讯地图地点搜索 https://apis.map.qq.com/ws/place/v1/search
"""
import json
import urllib.request
import urllib.parse
import time
import os
import re
import csv

API_KEY = "BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV"
PLACE_URL = "https://apis.map.qq.com/ws/place/v1/search"

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "cloudfunctions", "parking")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

RATE_LIMIT = 0.25  # 腾讯地图QPS限制

# 需要人工核对的项（地址定位的）
address_located = []


def extract_clean_city(city_str):
    """提取城市名用于搜索，如 '深圳市'→'深圳'"""
    if not city_str:
        return None
    m = re.search(r'([\u4e00-\u9fff]+)(?:市|区|县)?', city_str)
    return m.group(1) if m else city_str


def place_search(keyword, region):
    """腾讯地图地点搜索
    返回最佳匹配的 {lat, lng, title}，或 None
    """
    params = {
        "keyword": keyword,
        "key": API_KEY,
        "page_size": 5,
    }
    if region:
        params["boundary"] = f"region({region},0)"

    url = f"{PLACE_URL}?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        if data.get("status") == 0 and data.get("data"):
            results = data["data"]
            if len(results) > 0:
                best = results[0]
                return {
                    "lat": best["location"]["lat"],
                    "lng": best["location"]["lng"],
                    "title": best.get("title", ""),
                    "address": best.get("address", ""),
                }
        return None
    except Exception as e:
        print(f"    ⚠️ API异常: {e}")
        return None


def normalize(s):
    """标准化字符串用于比较"""
    if not s:
        return ""
    # 去空格、常见后缀
    s = s.strip()
    s = re.sub(r'[（(].*?[)）]', '', s)  # 去括号内容
    s = s.replace("停车场", "").replace("停车", "").replace(" ", "")
    return s.strip()


def names_match(name1, name2):
    """判断两个名称是否指向同一地点"""
    n1 = normalize(name1)
    n2 = normalize(name2)
    if not n1 or not n2:
        return False
    # 精确匹配
    if n1 == n2:
        return True
    # 包含匹配（较短的包含在较长的里）
    shorter = n1 if len(n1) <= len(n2) else n2
    longer = n2 if len(n1) <= len(n2) else n1
    if shorter and shorter in longer:
        return True
    return False


def locate_project(item):
    """定位单个项目
    返回 (lat, lng, source) 其中 source='name'/'address'/None
    """
    name = item.get("name", "").strip()
    address = item.get("address", "").strip()
    city = item.get("city", "").strip()
    clean_city = extract_clean_city(city)

    if not name:
        return None, None, None

    # ====== 策略1: 城市+项目名称 搜索 ======
    keyword = f"{clean_city}{name}" if clean_city else name
    result = place_search(keyword, clean_city)
    if result:
        if names_match(name, result.get("title", "")):
            return result["lat"], result["lng"], "name"

    # 再尝试只用项目名称（不带城市前缀）
    if clean_city and clean_city not in name:
        result2 = place_search(name, clean_city)
        if result2 and names_match(name, result2.get("title", "")):
            return result2["lat"], result2["lng"], "name"

    # ====== 策略2: 城市+地址 搜索 ======
    if address:
        addr_keyword = f"{clean_city}{address}" if clean_city else address
        result3 = place_search(addr_keyword, clean_city)
        if result3:
            return result3["lat"], result3["lng"], "address"

    return None, None, None


def process_file(filename):
    path = os.path.join(BASE_DIR, filename)
    print(f"\n{'='*60}")
    print(f"处理: {filename}")
    print(f"{'='*60}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = len(data)
    name_hits = 0
    addr_hits = 0
    failed = 0

    for i, item in enumerate(data):
        name = item.get("name", "?")[:30]
        lat, lng, source = locate_project(item)

        if lat and lng:
            item["latitude"] = lat
            item["longitude"] = lng
            if source == "name":
                name_hits += 1
            else:
                addr_hits += 1
                address_located.append({
                    "序号": i + 1,
                    "文件": filename,
                    "项目名称": item.get("name", ""),
                    "项目地址": item.get("address", ""),
                    "城市": item.get("city", ""),
                    "经度": lng,
                    "纬度": lat,
                    "定位方式": "地址搜索",
                })

            if (name_hits + addr_hits) % 200 == 0:
                print(f"  [{i+1}/{total}] 名称✅{name_hits} 地址✅{addr_hits} ❌{failed} | {name} ({lat:.4f},{lng:.4f})")
        else:
            failed += 1
            address_located.append({
                "序号": i + 1,
                "文件": filename,
                "项目名称": item.get("name", ""),
                "项目地址": item.get("address", ""),
                "城市": item.get("city", ""),
                "经度": "",
                "纬度": "",
                "定位方式": "定位失败",
            })
            if failed <= 20 or failed % 30 == 0:
                print(f"  [{i+1}/{total}] ❌ 定位失败 | {name} | city={item.get('city','')}")

        time.sleep(RATE_LIMIT)

    # 保存更新后的 JSON
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n完成: {filename}")
    print(f"  总数 {total} | 名称定位 {name_hits} ({name_hits/total*100:.1f}%) | 地址定位 {addr_hits} ({addr_hits/total*100:.1f}%) | 失败 {failed}")
    return name_hits, addr_hits, failed


def save_address_report():
    """保存地址定位项目到 Excel CSV"""
    if not address_located:
        print("\n✅ 无需输出地址定位报告——所有项目均通过名称定位成功！")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    csv_path = os.path.join(OUTPUT_DIR, "address_located_projects.csv")

    fieldnames = ["序号", "文件", "项目名称", "项目地址", "城市", "经度", "纬度", "定位方式"]
    # 去重：按项目名称
    seen = set()
    unique = []
    for row in address_located:
        key = (row["项目名称"], row["城市"])
        if key not in seen:
            seen.add(key)
            unique.append(row)

    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(unique)

    print(f"\n📋 地址定位报告: {csv_path}")
    print(f"   共 {len(unique)} 个项目需要人工核对")


if __name__ == "__main__":
    print("=" * 60)
    print("停车场坐标重新定位 v4 — 微信地图地点搜索")
    print("策略: 城市+项目名称搜索 → 城市+地址搜索")
    print(f"API: {PLACE_URL}")
    total_est = 1161 + 361
    print(f"预计耗时: ~{total_est * RATE_LIMIT / 60:.1f} 分钟")
    print("=" * 60)

    tn = ta = tf = 0
    for fn in ["parking_lots_monthly.json", "parking_lots_count.json"]:
        n, a, f = process_file(fn)
        tn += n
        ta += a
        tf += f

    print(f"\n{'='*60}")
    print(f"===== 全部完成 =====")
    print(f"总名称定位: {tn}, 总地址定位: {ta}, 总失败: {tf}")
    print(f"名称定位率: {tn/(tn+ta+tf)*100:.1f}%")
    print(f"{'='*60}")

    save_address_report()
