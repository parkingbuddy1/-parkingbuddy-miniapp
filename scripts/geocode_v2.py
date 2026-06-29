"""
改进版批量逆地理编码 - 使用结构化地址信息提升命中率
策略：city + district + street + name + address 组合，同时保留 region=深圳
"""
import json
import urllib.request
import urllib.parse
import time
import os
import sys

API_KEY = "BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV"
BASE_URL = "https://apis.map.qq.com/ws/geocoder/v1/"
RATE_LIMIT = 0.2  # 5 QPS，腾讯地图免费额度上限
SAVE_EVERY = 50   # 每50条存一次盘

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "cloudfunctions", "parking")

def build_search_address(item):
    """构建多层次查询地址"""
    city = (item.get("city") or "").strip()
    district = (item.get("district") or "").strip()
    street = (item.get("street") or "").strip()
    name = (item.get("name") or "").strip()
    address = (item.get("address") or "").strip()
    
    # 去掉"市"字后的冗余（如"深圳市" -> "深圳"）
    city_short = city.rstrip("市")
    
    # 组合：城市 + 区 + 街道 + 停车场名
    parts = []
    if city:
        parts.append(city)
    if district:
        parts.append(district)
    if street:
        parts.append(street)
    if name:
        parts.append(name)
    
    full_addr = " ".join(parts)
    
    # 如果原始地址包含有用的补充信息（如具体门牌号），追加
    if address and address != name:
        # 避免重复：如果 address 已经包含 name，不重复加
        if name and name not in address:
            # 从 address 中提取可能补充的信息
            # 去掉 city/district/street 部分避免冗余
            addr_clean = address
            for part in [city, city_short, district, street]:
                if part and part in addr_clean:
                    addr_clean = addr_clean.replace(part, "")
            addr_clean = addr_clean.strip(" ,，")
            if addr_clean and len(addr_clean) > 1:
                full_addr = full_addr + " " + addr_clean
    
    return full_addr

def geocode(address):
    """调用腾讯地图 API"""
    params = urllib.parse.urlencode({
        "address": address,
        "key": API_KEY,
        "region": "深圳"
    })
    url = f"{BASE_URL}?{params}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        
        status = data.get("status", -1)
        if status == 0 and data.get("result"):
            loc = data["result"].get("location", {})
            lat = loc.get("lat")
            lng = loc.get("lng")
            if lat and lng:
                # 检查可靠性（level 越高越精确）
                reliability = data["result"].get("reliability", 0)
                return lat, lng, reliability
        return None, None, status
    except Exception as e:
        return None, None, f"error:{e}"


def process_file(filename):
    path = os.path.join(BASE_DIR, filename)
    print(f"\n{'='*60}")
    print(f"处理: {filename}")
    
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    total = len(data)
    skipped = 0  # 已有坐标的
    updated = 0
    failed = 0
    
    for i, item in enumerate(data):
        # 跳过已有坐标的
        if item.get("latitude") and item.get("longitude"):
            skipped += 1
            continue
        
        # 构建搜索地址
        search_addr = build_search_address(item)
        
        if not search_addr:
            failed += 1
            continue
        
        lat, lng, status = geocode(search_addr)
        
        if lat and lng:
            item["latitude"] = lat
            item["longitude"] = lng
            updated += 1
            if updated % 20 == 0:
                print(f"  [{i+1}/{total}] ✓ 已更新:{updated} 失败:{failed} | {item.get('name')[:20]} ({lat:.4f},{lng:.4f})", flush=True)
        else:
            failed += 1
            if failed % 30 == 0:
                print(f"  [{i+1}/{total}] ✗ 已更新:{updated} 失败:{failed} | {item.get('name')[:20]} status={status}", flush=True)
        
        time.sleep(RATE_LIMIT)
        
        # 增量保存
        if updated > 0 and updated % SAVE_EVERY == 0:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"  💾 已存盘 [{i+1}/{total}] updated={updated} failed={failed}", flush=True)
    
    # 最终保存
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n完成: {filename}")
    print(f"  总数: {total} | 已有坐标: {skipped} | 本次更新: {updated} | 失败: {failed}")
    print(f"  成功率: {updated}/{updated+failed} = {updated/(updated+failed)*100:.1f}%" if (updated+failed) > 0 else "  无需处理")
    return updated, failed


if __name__ == "__main__":
    print("=" * 60)
    print("批量逆地理编码 V2 - 结构化地址优化")
    print(f"API Key: {API_KEY[:10]}...")
    print(f"策略: city+district+street+name+address 组合查询")
    print(f"QPS: ~{1/RATE_LIMIT:.1f}/秒")
    
    total_updated = 0
    total_failed = 0
    
    for fn in ["parking_lots_monthly.json", "parking_lots_count.json"]:
        u, f = process_file(fn)
        total_updated += u
        total_failed += f
    
    print(f"\n{'='*60}")
    print(f"全部完成!")
    print(f"  本次更新: {total_updated}")
    print(f"  本次失败: {total_failed}")
    print(f"  成功率: {total_updated}/{total_updated+total_failed} = {total_updated/(total_updated+total_failed)*100:.1f}%" if (total_updated+total_failed) > 0 else "")
