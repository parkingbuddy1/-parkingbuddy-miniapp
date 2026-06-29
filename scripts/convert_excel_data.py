"""
Excel数据 → 小程序JSON 转换脚本 v1
将月卡统计表和次卡甘特图转换为结构化JSON
"""
import pandas as pd
import json
import math
import os

EXCEL_MONTHLY = r'C:/Users/Administrator/Desktop/深圳停车场月卡统计图（月卡比价数据）.xlsx'
EXCEL_COUNT = r'C:/Users/Administrator/Desktop/深圳停车场次卡套餐明细_甘特图.xlsx'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

os.makedirs(OUTPUT_DIR, exist_ok=True)

def safe_float(v):
    """安全转浮点数，NaN→null"""
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None

def safe_str(v):
    """安全转字符串"""
    try:
        return str(v).strip()
    except (ValueError, TypeError):
        return ''

def extract_latlng(addr):
    """从地址中提取经纬度（如有）"""
    return None, None  # Excel数据不含经纬度，后续可补充

# ====== 月卡数据转换 ======
print('=== 处理月卡数据 ===')
df_m = pd.read_excel(EXCEL_MONTHLY, sheet_name='Sheet1')

# 只保留月卡/季卡/年卡/半年卡（排除次卡和其他）
df_m_filtered = df_m[df_m['卡的周期'].isin(['月卡', '季卡', '年卡', '半年卡'])].copy()
print(f'月卡数据: {len(df_m_filtered)} 条 (原始 {len(df_m)} 条, 排除次卡{len(df_m[df_m["卡的周期"]=="次卡"])}条)')

# 按项目分组，每个项目聚合其所有套餐
# Excel中同一项目的多行套餐数据通过NaN前向填充关联
parking_map = {}
last_name = None
for _, row in df_m_filtered.iterrows():
    raw_name = safe_str(row.get('项目名称'))
    name = raw_name if raw_name and raw_name.lower() != 'nan' else None
    
    if not name:
        # 前向填充：此行的套餐属于上一个项目
        name = last_name
    
    if not name:
        continue  # 第一行无名称则跳过
    
    if name not in parking_map:
        last_name = name
        parking_map[name] = {
            '_id': f'pk_month_{len(parking_map):04d}',
            'name': name,
            'city': safe_str(row.get('市')),
            'district': safe_str(row.get('区')),
            'street': safe_str(row.get('街道')),
            'address': safe_str(row.get('项目地址')),
            'feeDesc': safe_str(row.get('收费标准')),
            'freeMinutes': safe_float(row.get('免费时长（分钟）')),
            'firstHourFee': safe_float(row.get('首小时（元）')),
            'hourlyFee': safe_float(row.get('首小时后X元/小时')),
            'halfHourlyFee': safe_float(row.get('首小时后X元/半小时（30分钟）')),
            'dailyCap': safe_float(row.get('封顶/最高收费/日上限（元）')),
            'latitude': None,
            'longitude': None,
            'sort': 0,
            'packages': [],
            'packageTags': [],
            'minPrice': None,
            'cardType': 'monthly',  # 标识为月卡类
        }
    elif raw_name and raw_name.lower() != 'nan':
        last_name = name
    
    parking = parking_map[name]
    
    # 补充缺失字段
    if not parking['district']:
        parking['district'] = safe_str(row.get('区'))
    if not parking['street']:
        parking['street'] = safe_str(row.get('街道'))
    if not parking['address']:
        parking['address'] = safe_str(row.get('项目地址'))
    if not parking['feeDesc']:
        parking['feeDesc'] = safe_str(row.get('收费标准'))
    
    pkg = {
        '_id': f'pkg_{len(parking["packages"]):02d}_{name[:4]}',
        'period': safe_str(row.get('卡的周期')),        # 月卡/季卡/年卡/半年卡
        'packageType': safe_str(row.get('套餐类型')),    # 全天/日间/夜间/其他
        'subType': safe_str(row.get('套餐细分')),         # 长停/停充/夜间+周末全天等
        'name': safe_str(row.get('套餐名称')),
        'recommend': safe_str(row.get('套餐推荐')),
        'timeRange': safe_str(row.get('套餐时限')),
        'originalPrice': safe_float(row.get('套餐原价')),
        'price': safe_float(row.get('套餐现价')),
        'tags': [],
    }
    
    if pkg['subType']:
        pkg['tags'].append(pkg['subType'])
    if pkg['packageType']:
        pkg['tags'].append(pkg['packageType'])
    
    parking['packages'].append(pkg)
    
    # 更新packageTags
    if pkg['period'] and pkg['period'] not in parking['packageTags']:
        parking['packageTags'].append(pkg['period'])
    if pkg['packageType'] and pkg['packageType'] not in parking['packageTags']:
        parking['packageTags'].append(pkg['packageType'])
    if pkg['subType'] and pkg['subType'] not in parking['packageTags']:
        parking['packageTags'].append(pkg['subType'])

# 计算最低价并排序
parking_list = list(parking_map.values())
for p in parking_list:
    prices = [pkg['price'] for pkg in p['packages'] if pkg['price'] is not None]
    p['minPrice'] = min(prices) if prices else None
    p['sort'] = len(p['packages']) * 10  # 套餐越多排名越高

parking_list.sort(key=lambda x: x['sort'], reverse=True)

with open(os.path.join(OUTPUT_DIR, 'parking_lots_monthly.json'), 'w', encoding='utf-8') as f:
    json.dump(parking_list, f, ensure_ascii=False, indent=2)

print(f'月卡项目: {len(parking_list)} 个停车场')

# ====== 次卡数据转换 ======
print('\n=== 处理次卡数据 ===')
df_c = pd.read_excel(EXCEL_COUNT, sheet_name='Sheet1')

# 跳过第一行标题行(actual column names are in row 0)
df_c_clean = df_c.iloc[1:].copy()
df_c_clean = df_c_clean.dropna(subset=['项目名称'])

print(f'次卡数据: {len(df_c_clean)} 条')

# 按项目分组 - 前向填充缺失的项目名
count_parking_map = {}
last_cname = None
for _, row in df_c_clean.iterrows():
    raw_name = safe_str(row.get('项目名称'))
    name = raw_name if raw_name and raw_name.lower() != 'nan' else None
    
    if not name:
        name = last_cname
    
    if not name:
        continue
    
    if name not in count_parking_map:
        last_cname = name
        count_parking_map[name] = {
            '_id': f'pk_count_{len(count_parking_map):04d}',
            'name': name,
            'city': safe_str(row.get('市')),
            'district': safe_str(row.get('区')),
            'street': safe_str(row.get('街道')),
            'address': safe_str(row.get('项目地址')),
            'latitude': None,
            'longitude': None,
            'sort': 0,
            'packages': [],
            'packageTags': [],
            'minPrice': None,
            'cardType': 'count',  # 标识为次卡类
        }
    
    elif raw_name and raw_name.lower() != 'nan':
        last_cname = name
    
    parking = count_parking_map[name]
    if not parking['district']:
        parking['district'] = safe_str(row.get('区'))
    if not parking['street']:
        parking['street'] = safe_str(row.get('街道'))
    
    # 次卡特有字段
    time_range = safe_str(row.get('套餐时限'))
    limit_type_raw = safe_str(row.get('限定可用'))
    limit_type = limit_type_raw if (limit_type_raw and limit_type_raw.lower() not in ('nan','')) else '不限'
    per_use_time_limit = safe_str(row.get('单次停车时限'))
    per_use_time_limit = per_use_time_limit if (per_use_time_limit and per_use_time_limit.lower() != 'nan') else None
    
    pkg = {
        '_id': f'pkg_{len(parking["packages"]):02d}_{name[:4]}',
        'period': '次卡',
        'packageType': safe_str(row.get('套餐类型')),    # 全天/日间/夜间
        'subType': safe_str(row.get('套餐细分')),         # 日间/夜间/全天/工作日夜间等
        'limitType': limit_type if limit_type else '不限',  # 限定可用
        'name': safe_str(row.get('套餐名称')),
        'timeRange': time_range,
        'validDays': safe_float(row.get('限定有效天数')),    # 有效天数
        'inOutCount': safe_float(row.get('限定进出次数')),   # 进出次数
        'originalPrice': safe_float(row.get('套餐原价')),
        'price': safe_float(row.get('套餐现价')),
        'perUsePrice': safe_float(row.get('单次停放价格')),  # 单次停放价格
        'perUseTimeLimit': per_use_time_limit, # 单次时限
        'tags': [],
    }
    
    if pkg['subType']:
        pkg['tags'].append(pkg['subType'])
    if pkg['packageType']:
        pkg['tags'].append(pkg['packageType'])
    if limit_type and limit_type != '不限':
        pkg['tags'].append(limit_type)
    if time_range and time_range.lower() != 'nan':
        pkg['tags'].append(time_range)
    
    parking['packages'].append(pkg)
    
    # 更新packageTags
    for tag in [pkg['packageType'], pkg['subType'], limit_type, pkg['timeRange']]:
        if tag and tag not in parking['packageTags']:
            parking['packageTags'].append(tag)

count_parking_list = list(count_parking_map.values())
for p in count_parking_list:
    prices = [pkg['price'] for pkg in p['packages'] if pkg['price'] is not None]
    p['minPrice'] = min(prices) if prices else None
    p['sort'] = len(p['packages']) * 10

count_parking_list.sort(key=lambda x: x['sort'], reverse=True)

with open(os.path.join(OUTPUT_DIR, 'parking_lots_count.json'), 'w', encoding='utf-8') as f:
    json.dump(count_parking_list, f, ensure_ascii=False, indent=2)

print(f'次卡项目: {len(count_parking_list)} 个停车场')

# ====== 统计 ======
monthly_total = 0
for p in parking_list:
    monthly_total += len(p['packages'])

count_total = 0
for p in count_parking_list:
    count_total += len(p['packages'])

print(f'\n=== 转换完成 ===')
print(f'月卡JSON: {len(parking_list)} 个停车场, {monthly_total} 个套餐')
print(f'次卡JSON: {len(count_parking_list)} 个停车场, {count_total} 个套餐')
print(f'输出目录: {OUTPUT_DIR}')
print(f'文件: parking_lots_monthly.json, parking_lots_count.json')
