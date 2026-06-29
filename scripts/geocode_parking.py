"""
批量逆地理编码停车场坐标 v3
用每个项目的 city 字段作为 region 参数，不锁死深圳。
多策略回退：完整地址 → 名称+地址 → 名称
"""
import json
import urllib.request
import urllib.parse
import time
import os
import re

API_KEY = "BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV"
BASE_URL = "https://apis.map.qq.com/ws/geocoder/v1/"

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "cloudfunctions", "parking")

RATE_LIMIT = 0.22

def extract_region(city_str):
    """从 city 字段提取 region 名称，如 '深圳市'→'深圳', '东莞市'→'东莞'"""
    if not city_str:
        return None
    # 去掉"市"字作为 region 参数
    m = re.search(r'([\u4e00-\u9fff]+)(?:市|区|县)?', city_str)
    return m.group(1) if m else city_str


def geocode_once(address, region=None):
    params = {"address": address, "key": API_KEY}
    if region:
        params["region"] = region
    url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode())
        if data.get("status") == 0 and data.get("result"):
            loc = data["result"].get("location", {})
            lat = loc.get("lat")
            lng = loc.get("lng")
            if lat and lng:
                return lat, lng
        return None, None
    except:
        return None, None


def geocode(item):
    """多策略 geocode: 每个策略都用项目的 city 作为 region 参数"""
    name = item.get("name", "")
    address = item.get("address", "")
    city = item.get("city", "")
    region = extract_region(city)

    # 策略1: 完整地址 (city + district + street + address)
    parts = [item.get("city",""), item.get("district",""), item.get("street",""), address]
    full_addr = "".join([p for p in parts if p]) or address
    if full_addr:
        lat, lng = geocode_once(full_addr, region)
        if lat and lng:
            return lat, lng

    # 策略2: 只用 address + region
    if address:
        lat, lng = geocode_once(address, region)
        if lat and lng:
            return lat, lng

    # 策略3: name + region
    if name:
        lat, lng = geocode_once(name, region)
        if lat and lng:
            return lat, lng

    # 策略4: 最后尝试不加 region
    if full_addr:
        lat, lng = geocode_once(full_addr)
        if lat and lng:
            return lat, lng

    return None, None


def process_file(filename):
    path = os.path.join(BASE_DIR, filename)
    print(f"\n处理: {filename}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = len(data)
    updated = 0
    failed = 0

    for i, item in enumerate(data):
        lat, lng = geocode(item)

        if lat and lng:
            item["latitude"] = lat
            item["longitude"] = lng
            updated += 1
            if updated % 100 == 0:
                print(f"  [{i+1}/{total}] ✅ {updated}, ❌ {failed} | {item.get('name','?')[:25]} ({lat:.4f},{lng:.4f})")
        else:
            failed += 1
            # 只打印部分失败项
            if failed <= 30 or failed % 50 == 0:
                print(f"  [{i+1}/{total}] ❌ {item.get('name','?')[:30]} | addr={item.get('address','?')[:25]} region={extract_region(item.get('city',''))}")

        time.sleep(RATE_LIMIT)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n完成: {filename}")
    print(f"  总数 {total}, 成功 {updated} ({updated/total*100:.1f}%), 失败 {failed} ({failed/total*100:.1f}%)")
    return updated, failed


if __name__ == "__main__":
    print("=" * 60)
    print("批量地理编码 v3（按项目自身 city 设定 region + 多策略）")
    print(f"预计耗时: ~{(1161+361) * RATE_LIMIT / 60:.1f} 分钟")
    print("=" * 60)

    tu = tf = 0
    for fn in ["parking_lots_monthly.json", "parking_lots_count.json"]:
        u, f = process_file(fn)
        tu += u
        tf += f

    print(f"\n===== 全部完成 =====")
    print(f"总成功: {tu}, 总失败: {tf}")
