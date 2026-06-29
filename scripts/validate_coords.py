"""
坐标验证脚本 - 检查深圳范围内的坐标合理性
深圳粗略范围: lat 22.45~22.85, lng 113.75~114.65
"""
import json
import os

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "cloudfunctions", "parking")

# 深圳市范围（宽松边界）
SHENZHEN_BOUNDS = {
    "lat_min": 22.40,
    "lat_max": 22.90,
    "lng_min": 113.70,
    "lng_max": 114.70,
}

def is_valid_shenzhen(lat, lng):
    """检查坐标是否在深圳范围内"""
    if lat is None or lng is None:
        return False
    return (SHENZHEN_BOUNDS["lat_min"] <= lat <= SHENZHEN_BOUNDS["lat_max"] and
            SHENZHEN_BOUNDS["lng_min"] <= lng <= SHENZHEN_BOUNDS["lng_max"])

def validate_file(filename):
    path = os.path.join(BASE_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    total = len(data)
    valid = 0
    invalid = 0
    null_coords = 0
    
    for item in data:
        lat = item.get("latitude")
        lng = item.get("longitude")
        
        if lat is None or lng is None:
            null_coords += 1
            continue
        
        if is_valid_shenzhen(lat, lng):
            valid += 1
        else:
            print(f"  ✗ 无效坐标: {item['name'][:30]:30s} | ({lat:.4f}, {lng:.4f}) | {item.get('district','?')}/{item.get('street','?')}")
            item["latitude"] = None
            item["longitude"] = None
            invalid += 1
    
    # 保存修复后的文件
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n{filename}:")
    print(f"  总数: {total} | 有效: {valid} | 无效已清除: {invalid} | 原本为空: {null_coords}")
    return valid, invalid


if __name__ == "__main__":
    print("坐标验证 - 深圳范围检查")
    print(f"范围: lat[{SHENZHEN_BOUNDS['lat_min']}~{SHENZHEN_BOUNDS['lat_max']}], lng[{SHENZHEN_BOUNDS['lng_min']}~{SHENZHEN_BOUNDS['lng_max']}]")
    print()
    
    total_valid = 0
    total_invalid = 0
    
    for fn in ["parking_lots_monthly.json", "parking_lots_count.json"]:
        v, iv = validate_file(fn)
        total_valid += v
        total_invalid += iv
    
    print(f"\n===== 总结 =====")
    print(f"总有效坐标: {total_valid}")
    print(f"总无效已清除: {total_invalid}")
    print(f"总数据: {1162+361}")
