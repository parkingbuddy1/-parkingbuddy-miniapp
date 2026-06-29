"""处理新版Excel → 生成数据库导入文件"""
import openpyxl, json, os
from collections import OrderedDict

INPUT = r"C:\Users\Administrator\WorkBuddy\2026-05-30-15-30-14\深圳捷停车数据采集_调整终版.xlsx"
OUTPUT = r"C:\Users\Administrator\WorkBuddy\2026-06-01-10-22-45\parkingbuddy-miniapp\scripts\output"

wb = openpyxl.load_workbook(INPUT)
ws = wb.active
rows = list(ws.iter_rows(min_row=2, values_only=True))

projects = OrderedDict()
current = None

for row in rows:
    name = str(row[0]).strip() if row[0] else ""
    district = str(row[1]).strip() if row[1] else ""
    address = str(row[2]).strip() if row[2] else ""
    fee = str(row[3]).strip() if row[3] else ""
    pkg_name = str(row[5]).strip() if row[5] else ""
    pkg_recommend = str(row[6]).strip() if row[6] else ""
    pkg_period = str(row[7]).strip() if row[7] else ""
    pkg_original = row[8]
    pkg_price = row[9]

    # 车位数据（列11-34 = 索引10-33）
    park_space = [int(row[i]) if row[i] else 0 for i in range(10, 34)]

    if name:
        current = name
        if name not in projects:
            projects[name] = {
                "name": name, "district": district, "address": address,
                "feeStandard": fee, "parkSpace": park_space, "packages": []
            }
        else:
            if district: projects[name]["district"] = district
            if address: projects[name]["address"] = address
            if fee: projects[name]["feeStandard"] = fee

    if pkg_name and current and current in projects and len(projects[current]["packages"]) < 3:
        projects[current]["packages"].append({
            "name": pkg_name, "period": pkg_period,
            "originalPrice": int(pkg_original or 0),
            "price": int(pkg_price or 0),
            "recommended": "推荐" in str(pkg_recommend) or "推荐" in str(pkg_name),
        })

# 生成数据
parking_lots = []
packages = []
for name, proj in projects.items():
    pkgs = proj["packages"]
    prices = [p["price"] for p in pkgs] if pkgs else [0]
    ops = [p["originalPrice"] for p in pkgs] if pkgs else [0]
    lot_id = f"lot_{len(parking_lots) + 1:04d}"

    parking_lots.append({
        "_id": lot_id, "name": name, "district": proj["district"],
        "address": proj["address"], "feeStandard": proj["feeStandard"],
        "images": [], "tags": [],
        "latitude": 0, "longitude": 0,
        "minPrice": min(prices), "minOriginalPrice": min(ops),
        "packageCount": len(pkgs),
        "packageTags": [p["name"] for p in pkgs],
        "parkSpace": proj["parkSpace"],
        "status": "active", "sort": 100,
    })

    for i, pkg in enumerate(pkgs):
        packages.append({
            "_id": f"pkg_{len(packages) + 1:05d}",
            "parkingId": lot_id, "name": pkg["name"],
            "period": pkg["period"],
            "originalPrice": pkg["originalPrice"], "price": pkg["price"],
            "recommended": pkg["recommended"],
            "unit": "月", "sort": i + 1, "status": "active",
        })

print(f"Projects: {len(parking_lots)} | Packages: {len(packages)}")

# 生成 JSONL + JSON 数组
for name, data in [("parking_lots", parking_lots), ("packages", packages)]:
    # JSONL
    with open(os.path.join(OUTPUT, f"{name}.jsonl"), "w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    # JSON 数组（全量）
    with open(os.path.join(OUTPUT, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    # 分块 .json（200条/份，JSON Lines格式用.json后缀）
    for idx, chunk_start in enumerate(range(0, len(data), 200), 1):
        chunk = data[chunk_start:chunk_start+200]
        chunk_file = os.path.join(OUTPUT, f"{name}_{idx:02d}.json")
        with open(chunk_file, "w", encoding="utf-8") as f:
            for item in chunk:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        print(f"  {name}_{idx:02d}.json: {len(chunk)} records")

print("Done! All files ready for import.")
