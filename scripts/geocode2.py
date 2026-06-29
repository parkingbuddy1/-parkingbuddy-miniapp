"""独立地理编码脚本 - 批量给停车场添加坐标"""
import json, urllib.request, urllib.parse, time, os, sys

API_KEY = "BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV"
BASE_DIR = r"C:\Users\Administrator\WorkBuddy\2026-06-01-10-22-45\parkingbuddy-miniapp\cloudfunctions\parking"

def geocode(addr):
    try:
        p = urllib.parse.urlencode({"address": addr, "key": API_KEY})
        req = urllib.request.Request(f"https://apis.map.qq.com/ws/geocoder/v1/?{p}")
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        if d.get("status") == 0 and d.get("result"):
            loc = d["result"]["location"]
            return loc["lat"], loc["lng"]
    except: pass
    return None, None

def doit(fn):
    path = os.path.join(BASE_DIR, fn)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    t, up, fl = len(data), 0, 0
    for i, item in enumerate(data):
        if item.get("latitude") and item.get("longitude"): continue
        a = item.get("address", "")
        if not a: fl += 1; continue
        la, lo = geocode(a)
        if la and lo:
            item["latitude"] = la; item["longitude"] = lo
            up += 1
            if up % 50 == 0: sys.stdout.write(f"  [{i+1}/{t}] done:{up} fail:{fl} - {item['name']}\n"); sys.stdout.flush()
        else: fl += 1
        time.sleep(0.15)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    sys.stdout.write(f"FINISH {fn}: total={t} updated={up} failed={fl}\n"); sys.stdout.flush()
    return up, fl

print("Starting...")
for f in ["parking_lots_monthly.json", "parking_lots_count.json"]:
    doit(f)
print("ALL DONE")
