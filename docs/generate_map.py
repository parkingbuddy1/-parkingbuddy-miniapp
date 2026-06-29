"""
生成停车场全量地图 HTML
读取月卡 + 次卡 JSON，生成 Leaflet 交互式地图
"""
import json, os, sys

BASE = os.path.join(os.path.dirname(__file__), '..', 'cloudfunctions', 'parking')
OUT = os.path.join(os.path.dirname(__file__), 'parking_map.html')

def load_all():
    """加载月卡 + 次卡数据，提取地图打点所需字段"""
    markers = []
    for src, card_type, color in [
        ('parking_lots_monthly.json', '月卡', '#FF6B35'),
        ('parking_lots_count.json', '次卡', '#3B82F6'),
    ]:
        path = os.path.join(BASE, src)
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for item in data:
            lat = item.get('latitude')
            lng = item.get('longitude')
            if lat and lng:
                name = item.get('name', '').replace('"', '\\"')
                addr = (item.get('address', '') or '').replace('"', '\\"')
                dist = item.get('district', '') or ''
                mp = item.get('minPrice', 0) or 0
                pc = len(item.get('packages', [])) or 0
                markers.append({
                    'lat': lat, 'lng': lng,
                    'name': name, 'addr': addr, 'dist': dist,
                    'mp': mp, 'ct': card_type, 'pc': pc, 'color': color,
                })
    return markers

def gen_html(markers):
    total = len(markers)
    monthly = sum(1 for m in markers if m['ct'] == '月卡')
    count = sum(1 for m in markers if m['ct'] == '次卡')

    # 生成 JS 数据
    js_data_lines = []
    for m in markers:
        js_data_lines.append(
            f'{{lat:{m["lat"]:.6f},lng:{m["lng"]:.6f},n:"{m["name"]}",a:"{m["addr"]}",d:"{m["dist"]}",mp:{m["mp"]:.0f},ct:"{m["ct"]}",pc:{m["pc"]},c:"{m["color"]}"}}'
        )
    js_data = ',\n'.join(js_data_lines)

    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>粤停汇 · 停车场全量地图</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: -apple-system, "Microsoft YaHei", sans-serif; }}
#map {{ width:100vw; height:100vh; }}

/* 图例面板 */
.legend-panel {{
  position:absolute; top:16px; right:16px; z-index:1000;
  background:rgba(26,26,46,0.95); border-radius:12px; padding:16px 20px;
  color:#fff; font-size:13px; min-width:200px;
  backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1);
  box-shadow:0 4px 24px rgba(0,0,0,0.4);
}}
.legend-title {{ font-size:15px; font-weight:700; margin-bottom:12px; color:#F97316; }}
.legend-row {{ display:flex; align-items:center; margin-bottom:8px; }}
.legend-dot {{ width:14px; height:14px; border-radius:50%; margin-right:10px; flex-shrink:0; }}
.legend-dot.monthly {{ background:#FF6B35; box-shadow:0 0 8px rgba(255,107,53,0.5); }}
.legend-dot.count {{ background:#3B82F6; box-shadow:0 0 8px rgba(59,130,246,0.5); }}
.legend-count {{ color:rgba(255,255,255,0.5); margin-left:auto; font-size:11px; }}

/* 搜索栏 */
.search-panel {{
  position:absolute; top:16px; left:50%; transform:translateX(-50%); z-index:1000;
}}
.search-input {{
  width:320px; padding:10px 16px; border:none; border-radius:24px;
  font-size:14px; outline:none; background:rgba(26,26,46,0.95);
  color:#fff; border:1px solid rgba(255,255,255,0.15);
  box-shadow:0 4px 24px rgba(0,0,0,0.4);
  backdrop-filter:blur(10px);
}}
.search-input::placeholder {{ color:rgba(255,255,255,0.4); }}

/* 统计栏 */
.stat-bar {{
  position:absolute; bottom:24px; left:50%; transform:translateX(-50%); z-index:1000;
  background:rgba(26,26,46,0.95); border-radius:24px; padding:8px 20px;
  color:#fff; font-size:13px; border:1px solid rgba(255,255,255,0.1);
  box-shadow:0 4px 24px rgba(0,0,0,0.4); backdrop-filter:blur(10px);
  display:flex; gap:20px;
}}
.stat-item {{ display:flex; align-items:center; gap:6px; }}
.stat-val {{ font-weight:700; color:#F97316; }}

/* 自定义弹出窗 */
.custom-popup {{ font-size:12px; line-height:1.6; }}
.custom-popup .popup-name {{ font-weight:700; font-size:14px; color:#1A1A2E; }}
.custom-popup .popup-addr {{ color:#666; }}
.custom-popup .popup-price {{ color:#F97316; font-weight:700; font-size:16px; }}
.custom-popup .popup-tag {{
  display:inline-block; padding:2px 6px; border-radius:4px; font-size:10px;
  margin-right:4px; margin-top:4px;
}}
</style>
</head>
<body>
<div id="map"></div>

<!-- 图例 -->
<div class="legend-panel">
  <div class="legend-title">🅿️ 粤停汇 · 停车场地图</div>
  <div class="legend-row">
    <div class="legend-dot monthly"></div>
    <span>月卡停车场</span>
    <span class="legend-count">{monthly} 个</span>
  </div>
  <div class="legend-row">
    <div class="legend-dot count"></div>
    <span>次卡停车场</span>
    <span class="legend-count">{count} 个</span>
  </div>
  <div class="legend-row" style="margin-top:4px;color:rgba(255,255,255,0.4);font-size:11px;">
    共 <b style="color:#fff;">{total}</b> 个停车场 · 点击查看详情
  </div>
  <div class="legend-row" style="margin-top:4px;color:rgba(255,255,255,0.3);font-size:10px;">
    坐标来源：腾讯地图API · 100%覆盖
  </div>
</div>

<!-- 搜索 -->
<div class="search-panel">
  <input class="search-input" id="searchInput" placeholder="🔍 搜索停车场名称或地址..." oninput="onSearch(this.value)">
</div>

<!-- 底部统计 -->
<div class="stat-bar">
  <div class="stat-item"><span>可见：</span><span class="stat-val" id="visibleCount">{total}</span></div>
  <div class="stat-item">|</div>
  <div class="stat-item">缩放查看簇点</div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
// ====== 停车场数据 ======
const parkingData = [
{js_data}
];

// ====== 初始化地图 ======
const map = L.map('map').setView([22.543, 114.058], 11);

// 地图底图
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19,
}}).addTo(map);

// ====== 颜色映射 ======
const colorMap = {{ '月卡':'#FF6B35', '次卡':'#3B82F6' }};

// ====== 创建 SVG 图标 ======
function createIcon(color, size) {{
  const s = size || 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${{s}}" height="${{s}}" viewBox="0 0 ${{s}} ${{s}}">
    <circle cx="${{s/2}}" cy="${{s/2}}" r="${{s/2-1}}" fill="${{color}}" stroke="white" stroke-width="1" opacity="0.9"/>
  </svg>`;
  return L.divIcon({{
    html: svg,
    className: '',
    iconSize: [s, s],
    iconAnchor: [s/2, s/2],
  }});
}}

// ====== 标记簇 ======
const markers = L.markerClusterGroup({{
  chunkedLoading: true,
  maxClusterRadius: function(zoom) {{ return zoom < 12 ? 60 : 40; }},
  iconCreateFunction: function(cluster) {{
    const count = cluster.getChildCount();
    const monthlyCount = cluster.getAllChildMarkers().filter(m => m.options.ct === '月卡').length;
    const size = count < 10 ? 32 : count < 50 ? 40 : count < 100 ? 48 : 56;
    const html = `<div style="
      width:${{size}}px;height:${{size}}px;border-radius:50%;
      background:linear-gradient(135deg,#1A1A2E,#16213E);
      border:2px solid #F97316;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${{Math.max(11, size/4)}}px;
      box-shadow:0 0 16px rgba(249,115,22,0.3);
      line-height:1.2;
    ">
      <span>${{count}}</span>
      ${{monthlyCount && monthlyCount < count ? `<span style="font-size:${{Math.max(9, size/5.5)}}px;color:rgba(255,255,255,0.5)">橙${{monthlyCount}}·蓝${{count-monthlyCount}}</span>` : ''}}
    </div>`;
    return L.divIcon({{ html, className:'', iconSize:[size,size], iconAnchor:[size/2, size/2] }});
  }},
}});

// ====== 添加标记 ======
parkingData.forEach(function(p) {{
  const icon = createIcon(p.c, 10);
  const marker = L.marker([p.lat, p.lng], {{ icon, ct: p.ct }});
  const tagHtml = p.ct === '月卡'
    ? '<span class="popup-tag" style="background:#FFF3E0;color:#E65100">月卡</span>'
    : '<span class="popup-tag" style="background:#E3F2FD;color:#1565C0">次卡</span>';
  marker.bindPopup(`
    <div class="custom-popup">
      <div class="popup-name">${{p.n}}</div>
      <div class="popup-addr">📍 ${{p.a}} | ${{p.d}}</div>
      <div style="margin-top:6px;">
        ${{tagHtml}}
        <span class="popup-tag" style="background:#F5F5F5;color:#666">${{p.pc}}个套餐</span>
      </div>
      <div style="margin-top:6px;">最低 <span class="popup-price">¥${{p.mp}}</span>/月</div>
    </div>
  `);
  markers.addLayer(marker);
}});

map.addLayer(markers);

// ====== 搜索 ======
function onSearch(q) {{
  const kw = q.toLowerCase().trim();
  const cnt = document.getElementById('visibleCount');
  if (!kw) {{
    markers.eachLayer(function(layer) {{ layer.setOpacity(1); }});
    cnt.textContent = parkingData.length;
    return;
  }}
  let visible = 0;
  markers.eachLayer(function(layer) {{
    // 从 popup 中提取名称和地址
    const name = (layer._popup && layer._popup._content || '').toLowerCase();
    if (name.includes(kw)) {{
      layer.setOpacity(1);
      visible++;
    }} else {{
      layer.setOpacity(0.1);
    }}
  }});
  cnt.textContent = visible;
}}

// 初始统计
document.getElementById('visibleCount').textContent = parkingData.length;
</script>
</body>
</html>'''

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'✅ 生成完成: {OUT}')
    print(f'   月卡: {monthly} 个点')
    print(f'   次卡: {count} 个点')
    print(f'   总计: {total} 个点')
    file_size_mb = os.path.getsize(OUT) / (1024 * 1024)
    print(f'   文件大小: {file_size_mb:.1f}MB')

if __name__ == '__main__':
    markers = load_all()
    gen_html(markers)
