"""
ParkingBuddy 数据导入脚本
从 Excel 读取停车场数据 → 生成 CloudBase 可导入的 JSON 文件
"""
import openpyxl
import json
import os
from collections import OrderedDict

EXCEL_PATH = r"C:\Users\Administrator\Desktop\捷停车数据\捷停车数据采集_合并去重_v3.xlsx"
OUTPUT_DIR = r"C:\Users\Administrator\WorkBuddy\2026-06-01-10-22-45\parkingbuddy-miniapp\scripts\output"

os.makedirs(OUTPUT_DIR, exist_ok=True)

wb = openpyxl.load_workbook(EXCEL_PATH)
ws = wb.active

# 读取所有行
rows = list(ws.iter_rows(min_row=2, values_only=True))

# 按项目名称分组
projects = OrderedDict()  # key=项目名称, value={info, packages}
current_project_name = None

for row in rows:
    name = str(row[0]).strip() if row[0] else ""
    address = str(row[1]).strip() if row[1] else ""
    fee = str(row[2]).strip() if row[2] else ""
    pkg_name = str(row[4]).strip() if row[4] else ""
    pkg_recommend = str(row[5]).strip() if row[5] else ""
    pkg_period = str(row[6]).strip() if row[6] else ""
    pkg_original = row[7]  # may be int
    pkg_price = row[8]  # may be int

    # 车位数据（列10-34 = 索引9-33）
    park_space = []
    for col_idx in range(9, 34):
        val = row[col_idx]
        park_space.append(int(val) if val else 0)

    # 有项目名称 → 新项目
    if name:
        current_project_name = name
        if name not in projects:
            projects[name] = {
                "name": name,
                "address": address,
                "feeStandard": fee,
                "parkSpace": park_space,
                "packages": [],
            }
        elif address:
            projects[name]["address"] = address
        elif fee:
            projects[name]["feeStandard"] = fee

    # 套餐数据
    if pkg_name and current_project_name:
        proj = projects.get(current_project_name)
        if proj and len(proj["packages"]) < 3:
            proj["packages"].append({
                "name": pkg_name,
                "period": pkg_period,
                "originalPrice": int(pkg_original) if pkg_original else 0,
                "price": int(pkg_price) if pkg_price else 0,
                "recommended": "推荐" in pkg_recommend or "推荐" in pkg_name,
            })

# 统计数据
total_projects = len(projects)
total_packages = sum(len(p["packages"]) for p in projects.values())
empty_pkg_projects = [name for name, p in projects.items() if len(p["packages"]) == 0]

print(f"总计项目数: {total_projects}")
print(f"总计套餐数: {total_packages}")
print(f"无套餐项目数: {len(empty_pkg_projects)}")

# 生成 parking_lots JSON
parking_lots = []
packages = []

for p_name, proj in projects.items():
    pkgs = proj["packages"]
    prices = [p["price"] for p in pkgs] if pkgs else [0]
    original_prices = [p["originalPrice"] for p in pkgs] if pkgs else [0]

    lot_id = f"lot_{len(parking_lots) + 1:04d}"
    parking_lots.append({
        "_id": lot_id,
        "name": proj["name"],
        "address": proj["address"],
        "feeStandard": proj["feeStandard"],
        "images": [],
        "tags": [],
        "latitude": 0,
        "longitude": 0,
        "minPrice": min(prices),
        "minOriginalPrice": min(original_prices),
        "packageCount": len(pkgs),
        "packageTags": [p["name"] for p in pkgs],
        "parkSpace": proj["parkSpace"],
        "status": "active",
        "sort": 100,
    })

    for i, pkg in enumerate(pkgs):
        packages.append({
            "_id": f"pkg_{len(packages) + 1:05d}",
            "parkingId": lot_id,
            "name": pkg["name"],
            "period": pkg["period"],
            "originalPrice": pkg["originalPrice"],
            "price": pkg["price"],
            "recommended": pkg["recommended"],
            "unit": "月",
            "sort": i + 1,
            "status": "active",
        })

# 写入 JSON 文件
with open(os.path.join(OUTPUT_DIR, "parking_lots.json"), "w", encoding="utf-8") as f:
    json.dump(parking_lots, f, ensure_ascii=False, indent=2)

with open(os.path.join(OUTPUT_DIR, "packages.json"), "w", encoding="utf-8") as f:
    json.dump(packages, f, ensure_ascii=False, indent=2)

print(f"\n✅ JSON 文件已生成:")
print(f"   parking_lots.json → {len(parking_lots)} 条")
print(f"   packages.json     → {len(packages)} 条")
print(f"\n📁 输出目录: {OUTPUT_DIR}")

# 打印几个样本
print("\n=== 前3个项目预览 ===")
for lot in parking_lots[:3]:
    print(f"\n  🅿️ {lot['name']}")
    print(f"     📍 {lot['address'][:50]}")
    print(f"     💰 最低 ¥{lot['minPrice']} | {lot['packageCount']}个套餐")
    print(f"     🏷️ {lot['packageTags']}")

print("\n=== 前5个套餐预览 ===")
for pkg in packages[:5]:
    print(f"  📦 {pkg['name'][:50]}")
    print(f"     ⏰ {pkg['period']}")
    print(f"     💰 ¥{pkg['originalPrice']} → ¥{pkg['price']} {'⭐推荐' if pkg['recommended'] else ''}")
