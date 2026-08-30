#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""表1 板块资金流向铺底：查 record_id → 组装 batch_update records → 落盘 payload
用法：TOKEN 环境变量改为下方常量后运行；或参考 fetch_boards.py 流程整体执行。
依赖 scripts/fetch_boards.py + scripts/build_sector_payload.py 先行产出 t1_sector_payload.json
"""
import json, subprocess, sys, os

BASE = '/Users/kan/WorkBuddy/2026-08-29-14-40-58'
LIB = '/Users/kan/.workbuddy/plugins/cache/workbuddy-builtin/skill-library/0.5.13'
DB1 = 'cLcxNlQynomKfZa92Ptryc'
TOKEN = os.environ.get('OPEN_PLATFORM_TOKEN', '')  # 由调用方注入

def q(args):
    p = subprocess.run([sys.executable, 'database/query_database_record.py'] + args,
                       input=TOKEN, capture_output=True, text=True, cwd=LIB)
    return json.loads(p.stdout)

def main():
    rows = []
    data = q(['--database-id', DB1, '--page-size', '300'])
    rows += data.get('results', [])
    while data.get('has_more') and data.get('next_cursor'):
        data = q(['--database-id', DB1, '--page-size', '300', '--start-cursor', data['next_cursor']])
        rows += data.get('results', [])
    print(f"表1 共 {len(rows)} 条", flush=True)

    sector_payload = json.load(open(f'{BASE}/data/raw/boards/t1_sector_payload.json'))
    idmap = {}
    for r in rows:
        d = r.get('交易日期', '')
        if isinstance(d, str):
            idmap[d[:10]] = r.get('record_id')

    records = []
    for d8, slist in sorted(sector_payload.items()):
        d = f"{d8[:4]}-{d8[4:6]}-{d8[6:]}"
        if d not in idmap:
            print(f"!! 未匹配 {d}", flush=True)
            continue
        records.append({"record_id": idmap[d],
                        "properties": {"板块资金流向": {"text": json.dumps(slist, ensure_ascii=False)}}})
    with open(f'{BASE}/data/output/t1_sector_update.json', 'w', encoding='utf-8') as f:
        json.dump({"database_id": DB1, "records": records}, f, ensure_ascii=False, indent=1)
    print(f"payload 已写入，共 {len(records)} 条", flush=True)

if __name__ == '__main__':
    main()
