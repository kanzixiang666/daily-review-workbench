#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""拉取同花顺行业板块(881xxx)近30日K线，计算每日板块涨跌幅，落盘供铺底使用"""
import json, re, time, urllib.request, os

OUT_DIR = '/Users/kan/WorkBuddy/2026-08-29-14-40-58/data/raw/boards'
os.makedirs(OUT_DIR, exist_ok=True)

HDRS = {
    "Referer": "https://q.10jqka.com.cn/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
}

def get_board(code):
    """返回 (name, data_str) 或 None"""
    url = f"https://d.10jqka.com.cn/v6/line/bk_{code}/01/last.js"
    req = urllib.request.Request(url, headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            txt = r.read().decode('utf-8', 'ignore')
        m = re.search(r'"name":"([^"]+)"', txt)
        d = re.search(r'"data":"([^"]*)"', txt)
        if not m or not d:
            return None
        return (m.group(1), d.group(1))
    except Exception:
        return None

# 1. 探测并收集所有有效板块（881100~881200）
boards = []          # (code, name)
for c in range(881100, 881201):
    res = get_board(c)
    if res:
        boards.append((c, res[0]))
    time.sleep(0.08)
print(f"有效板块数: {len(boards)}")

# 2. 对每个板块拉近30日K线（重新请求拿 data）
klines = {}   # code -> {date: [open, high, low, close, volume]}
for c, name in boards:
    res = get_board(c)
    if not res:
        continue
    data_str = res[1]
    per = {}
    for line in data_str.split(';'):
        parts = line.split(',')
        if len(parts) < 6 or not re.match(r'^\d{8}$', parts[0]):
            continue
        per[parts[0]] = {
            'open': float(parts[1]), 'high': float(parts[2]),
            'low': float(parts[3]), 'close': float(parts[4]),
            'volume': float(parts[5]),
        }
    klines[c] = per
    time.sleep(0.08)

# 3. 组装：date -> [(name, pct, close), ...]（按涨跌幅降序）
by_date = {}
for c, name in boards:
    per = klines.get(c, {})
    dates = sorted(per.keys())
    for i, d in enumerate(dates):
        if i == 0:
            continue  # 第一天无昨收
        prev = per[dates[i-1]]['close']
        cur = per[d]['close']
        if not prev:
            continue
        pct = round((cur - prev) / prev * 100, 2)
        by_date.setdefault(d, []).append({'name': name, 'pct': pct, 'close': cur})

# 4. 落盘
with open(f'{OUT_DIR}/boards.json', 'w', encoding='utf-8') as f:
    json.dump([{'code': c, 'name': n} for c, n in boards], f, ensure_ascii=False, indent=1)
with open(f'{OUT_DIR}/klines.json', 'w', encoding='utf-8') as f:
    json.dump(klines, f, ensure_ascii=False)
with open(f'{OUT_DIR}/by_date.json', 'w', encoding='utf-8') as f:
    json.dump(by_date, f, ensure_ascii=False, indent=1)

print(f"覆盖交易日: {len(by_date)} 天")
all_dates = sorted(by_date.keys())
print("日期范围:", all_dates[0], "->", all_dates[-1])
# 展示最近一天样例
last = all_dates[-1]
rows = sorted(by_date[last], key=lambda x: -x['pct'])
print(f"\n{last} 板块数: {len(rows)}")
print("涨前5:", [(r['name'], r['pct']) for r in rows[:5]])
print("跌前5:", [(r['name'], r['pct']) for r in rows[-5:]])
