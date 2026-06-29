"""
多策略重试脚本 - 208条验证失败的深圳停车场坐标
策略：省份前缀 + 地点搜索API + 区级坐标兜底
"""
import json
import urllib.request
import urllib.parse
import time
import os
import sys

API_KEY = "BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV"
GEO_URL = "https://apis.map.qq.com/ws/geocoder/v1/"
SEARCH_URL = "https://apis.map.qq.com/ws/place/v1/search/"
RATE_LIMIT = 0.22  # ~4.5 QPS
SAVE_EVERY = 30

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "cloudfunctions", "parking")

# 深圳各区中心坐标（腾讯地图 API 获取）
DISTRICT_CENTERS = {
    "南山区": (22.5332, 113.9307),
    "福田区": (22.5218, 114.0552),
    "罗湖区": (22.5484, 114.1318),
    "宝安区": (22.5554, 113.8830),
    "龙岗区": (22.7199, 114.2484),
    "龙华区": (22.6564, 114.0200),
    "光明区": (22.7487, 113.9356),
    "坪山区": (22.6908, 114.3462),
    "盐田区": (22.5570, 114.2369),
    "大鹏新区": (22.5950, 114.4740),
}

# 深圳市范围
SZ_BOUNDS = {"lat_min": 22.40, "lat_max": 22.90, "lng_min": 113.70, "lng_max": 114.70}

def is_valid_sz(lat, lng):
    if lat is None or lng is None:
        return False
    return (SZ_BOUNDS["lat_min"] <= lat <= SZ_BOUNDS["lat_max"] and
            SZ_BOUNDS["lng_min"] <= lng <= SZ_BOUNDS["lng_max"])

def geocode(address, region="深圳"):
    """腾讯地图逆地理编码"""
    params = urllib.parse.urlencode({
        "address": address,
        "key": API_KEY,
        "region": region,
    })
    url = f"{GEO_URL}?{params}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        if data.get("status") == 0 and data.get("result"):
            loc = data["result"].get("location", {})
            lat, lng = loc.get("lat"), loc.get("lng")
            if lat and lng:
                return lat, lng
    except:
        pass
    return None, None

def place_search(keyword, region="深圳"):
    """腾讯地图地点搜索API - 对POI名称搜索更准确"""
    params = urllib.parse.urlencode({
        "keyword": keyword,
        "boundary": f"region({urllib.parse.quote(region)},0)",
        "key": API_KEY,
        "page_size": 3,
    })
    url = f"{SEARCH_URL}?{params}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        if data.get("status") == 0 and data.get("data"):
            # 取第一个结果
            for r in data["data"]:
                loc = r.get("location", {})
                lat, lng = loc.get("lat"), loc.get("lng")
                if lat and lng and is_valid_sz(lat, lng):
                    return lat, lng
    except:
        pass
    return None, None

def build_strategies(item):
    """为每条数据构建多个查询策略"""
    city = (item.get("city") or "").strip()
    district = (item.get("district") or "").strip()
    street = (item.get("street") or "").strip()
    name = (item.get("name") or "").strip()
    address = (item.get("address") or "").strip()
    
    strategies = []
    
    # 策略1: 广东省 + 区 + 街道 + 名称（加省份前缀增强约束）
    parts1 = []
    if "广东" not in city and "广东" not in address:
        parts1.append("广东省")
    if city:
        parts1.append(city)
    if district and district != "nan":
        parts1.append(district)
    if street and street != "nan":
        parts1.append(street)
    if name:
        parts1.append(name)
    s1 = " ".join(parts1)
    if s1:
        strategies.append(("ADDR+省", s1))
    
    # 策略2: 深圳市 + 区 + 名称（精简版，避免街道名干扰）
    parts2 = []
    parts2.append("深圳市")
    if district and district != "nan":
        parts2.append(district)
    if name:
        parts2.append(name)
    s2 = " ".join(parts2)
    if s2 and s2 != s1:
        strategies.append(("ADDR+精简", s2))
    
    # 策略3: 用原始 address 字段（可能包含更多细节）
    if address and address != name and len(address) > 5:
        strategies.append(("ADDR+原始", address))
    
    # 策略4: 地点搜索 - 停车场名称
    if name:
        strategies.append(("SEARCH", name))
    
    return strategies

def process_file(filename):
    path = os.path.join(BASE_DIR, filename)
    print(f"\n{'='*60}")
    print(f"处理: {filename}")
    
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    null_items = [(i, item) for i, item in enumerate(data) if item.get("latitude") is None]
    total_null = len(null_items)
    
    if total_null == 0:
        print(f"  无需处理 - 全部已定位")
        return 0, 0
    
    print(f"  待处理: {total_null} 条")
    
    updated = 0
    failed = 0
    strategy_stats = {}
    
    for idx, (orig_i, item) in enumerate(null_items):
        strategies = build_strategies(item)
        found = False
        
        for strategy_name, query in strategies:
            if strategy_name == "SEARCH":
                lat, lng = place_search(query)
            else:
                lat, lng = geocode(query)
            
            if lat and lng and is_valid_sz(lat, lng):
                item["latitude"] = lat
                item["longitude"] = lng
                updated += 1
                strategy_stats[strategy_name] = strategy_stats.get(strategy_name, 0) + 1
                found = True
                break
        
        if not found:
            # 策略5: 区级坐标兜底
            district = item.get("district", "").strip()
            if district in DISTRICT_CENTERS:
                lat, lng = DISTRICT_CENTERS[district]
                item["latitude"] = lat
                item["longitude"] = lng
                updated += 1
                strategy_stats["FALLBACK+区中心"] = strategy_stats.get("FALLBACK+区中心", 0) + 1
                found = True
        
        if not found:
            failed += 1
        
        if (idx + 1) % 20 == 0:
            print(f"  [{idx+1}/{total_null}] ✓{updated} ✗{failed} | {item['name'][:25]}", flush=True)
        
        time.sleep(RATE_LIMIT)
        
        # 增量保存
        if updated > 0 and updated % SAVE_EVERY == 0:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"  💾 存盘 [{idx+1}/{total_null}]", flush=True)
    
    # 最终保存
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n  完成: {filename}")
    print(f"  待处理: {total_null} | 定位成功: {updated} | 仍失败: {failed}")
    print(f"  策略统计: {strategy_stats}")
    return updated, failed


if __name__ == "__main__":
    print("=" * 60)
    print("多策略重试 - 208条失败坐标")
    print(f"策略: 省份前缀 → 精简地址 → 原始地址 → 地点搜索 → 区中心兜底")
    print(f"QPS: ~{1/RATE_LIMIT:.1f}/秒")
    
    total_updated = 0
    total_failed = 0
    
    for fn in ["parking_lots_monthly.json", "parking_lots_count.json"]:
        u, f = process_file(fn)
        total_updated += u
        total_failed += f
    
    print(f"\n{'='*60}")
    print(f"全部完成!")
    print(f"  本次新增: {total_updated}")
    print(f"  仍失败: {total_failed}")
