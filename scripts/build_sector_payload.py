#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""组装表1 板块资金流向铺底 payload：7/17~8/27 每交易日，同花顺行业板块涨跌幅前10+后10，inflow 置 null"""
import json, re, os

BASE = '/Users/kan/WorkBuddy/2026-08-29-14-40-58'
by_date = json.load(open(f'{BASE}/data/raw/boards/by_date.json'))

# 目标交易日（铺底范围 7/17~8/27，8/28 已有数据不动）
TARGET = [d for d in sorted(by_date.keys()) if '20260717' <= d <= '20260827']

out = {}
for d in TARGET:
    rows = sorted(by_date[d], key=lambda x: -x['pct'])
    top = [{'name': r['name'], 'pct': r['pct'], 'inflow': None} for r in rows[:10]]
    bot = [{'name': r['name'], 'pct': r['pct'], 'inflow': None} for r in rows[-10:][::-1]]
    out[d] = top + bot

with open(f'{BASE}/data/raw/boards/t1_sector_payload.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print(f"铺底交易日数: {len(TARGET)} 天")
print("范围:", TARGET[0], "->", TARGET[-1])
d = TARGET[-1]
print(f"\n{d} 样例（前5+后5）:")
rows = out[d]
for r in rows[:5] + rows[-5:]:
    print(f"  {r['name']}  {r['pct']}%")
