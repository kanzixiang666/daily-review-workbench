#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取三大指数 5 分钟 K 线（腾讯 mkline m5，最近 10 交易日），落盘 data/raw/m5/"""
import json, urllib.request, os, time, collections

BASE = '/Users/kan/WorkBuddy/2026-08-29-14-40-58'
OUT = f'{BASE}/data/raw/m5'
os.makedirs(OUT, exist_ok=True)

IDX = {'sh': 'sh000001', 'sz': 'sz399001', 'cyb': 'sz399006'}
HDRS = {"Referer": "https://gu.qq.com/", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

def fetch_m5(sym):
    url = f"https://ifzq.gtimg.cn/appstock/app/kline/mkline?param={sym},m5,,,4800"
    req = urllib.request.Request(url, headers=HDRS)
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read().decode('utf-8', 'ignore'))
    return d.get('data', {}).get(sym, {}).get('m5', []) or []

raw = {}
for key, sym in IDX.items():
    bars = fetch_m5(sym)
    raw[key] = bars
    print(f"{key} {sym}: {len(bars)} 根 | 最早 {bars[0][0]} | 最晚 {bars[-1][0]}", flush=True)
    time.sleep(0.3)

# 按交易日分组统计
by_date = collections.OrderedDict()
for key, bars in raw.items():
    for b in bars:
        d8 = b[0][:8]
        by_date.setdefault(d8, {}).setdefault(key, []).append(b)
print(f"\n覆盖交易日: {len(by_date)} 天")
for d8 in sorted(by_date):
    cnt = {k: len(v) for k, v in by_date[d8].items()}
    print(f"  {d8}: {cnt}")

with open(f'{OUT}/m5_raw.json', 'w', encoding='utf-8') as f:
    json.dump(raw, f, ensure_ascii=False)
with open(f'{OUT}/m5_by_date.json', 'w', encoding='utf-8') as f:
    json.dump(by_date, f, ensure_ascii=False)
print("\n已落盘 data/raw/m5/")
