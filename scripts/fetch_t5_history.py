#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""表5 涨跌停统计历史铺底 v2：7/17~8/27 每交易日
- 东财涨停/跌停池（8/10 起有历史；更早东财不保留）
- 同花顺涨停池（支持全历史，提供概念 reason_type / 板型 / 连板）
- 东财无数据时回退同花顺补涨停；跌停 7/17~8/7 因无源留空
"""
import json, time, urllib.request, os, re, datetime

BASE = '/Users/kan/WorkBuddy/2026-08-29-14-40-58'
OUT = f'{BASE}/data/raw/limitup/t5_history_payload.json'

HDR_EM = {"Referer": "https://quote.eastmoney.com/", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
HDR_10JQKA = {"Referer": "https://data.10jqka.com.cn/", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

def fetch(url, headers, timeout=15, retry=3):
    for i in range(retry):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode('utf-8', 'ignore')
        except Exception:
            if i == retry - 1:
                return ''
            time.sleep(1.2 * (i + 1))
    return ''

def em_pool(url, timeout=15):
    try:
        txt = fetch(url, HDR_EM, timeout)
        if not txt: return []
        d = json.loads(txt)
        return d.get('data', {}).get('pool', []) or []
    except Exception:
        return []

def em_zt_pool(date8):
    return em_pool(f"https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=400&sort=fbt%3Aasc&date={date8}")

def em_dt_pool(date8):
    return em_pool(f"https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fund%3Aasc&date={date8}")

def ths_zt_pool(date8, limit=200):
    """同花顺涨停池，分页拉全（单页 limit 上限 200）"""
    fields = "199112,10,9001,330323,330324,330325,330326,9002,330329,133971,133970,1968584,3475914,9003,9004,3475915,330328,330327,133969,133968"
    out = []
    for page in (1, 2, 3):
        url = (f"https://data.10jqka.com.cn/dataapi/limit_up/limit_up_pool?page={page}&limit={limit}"
               f"&field={fields}&filter=HS,GEM2STAR&order_field=330324&order_type=0&date={date8}")
        try:
            txt = fetch(url, HDR_10JQKA)
            if not txt:
                break
            d = json.loads(txt)
            info = d.get('data', {}).get('info', []) or []
            if not info:
                break
            out += info
            total = d.get('data', {}).get('page', {}).get('total', 0)
            if len(out) >= total:
                break
            time.sleep(0.4)
        except Exception:
            break
    return out

def fmt_hhmm(v):
    if v is None: return ''
    s = str(int(v)).zfill(6)
    return f"{s[:2]}:{s[2:4]}"

def ts_to_hhmm(ts):
    if not ts: return ''
    try:
        return datetime.datetime.fromtimestamp(int(ts)).strftime('%H:%M')
    except Exception:
        return ''

def build_day(date8):
    zt = em_zt_pool(date8)
    dt = em_dt_pool(date8)
    ths = ths_zt_pool(date8)
    ths_by_code = {}
    for x in ths:
        ths_by_code[str(x.get('code', ''))] = x

    zt_list, industry_cnt, concept_cnt = [], {}, {}
    for p in zt:
        code = str(p.get('c', ''))
        hy = p.get('hybk', '') or ''
        industry_cnt[hy] = industry_cnt.get(hy, 0) + 1
        ths_x = ths_by_code.get(code, {})
        reason = ths_x.get('reason_type') or ''
        for r in re.split(r'[+]', str(reason)):
            r = r.strip()
            if r:
                concept_cnt[r] = concept_cnt.get(r, 0) + 1
        zt_list.append({
            'code': code, 'name': p.get('n', ''),
            'price': round(p.get('p', 0)/1000, 2) if isinstance(p.get('p'), (int, float)) else 0,
            'chg': round(p.get('zdp', 0), 2),
            'reason': reason,
            'type': str(ths_x.get('limit_up_type') or ''),
            'days': p.get('lbc', 1),
            'first': fmt_hhmm(p.get('fbt')),
            'last': fmt_hhmm(p.get('lbt')),
            'industry': hy,
        })

    # 东财无涨停数据 → 回退同花顺
    fallback = False
    if not zt_list and ths:
        fallback = True
        for x in ths:
            code = str(x.get('code', ''))
            reason = x.get('reason_type') or ''
            for r in re.split(r'[+]', str(reason)):
                r = r.strip()
                if r:
                    concept_cnt[r] = concept_cnt.get(r, 0) + 1
            zt_list.append({
                'code': code, 'name': x.get('name', ''),
                'price': round(x.get('latest') or 0, 2),
                'chg': round(x.get('change_rate') or 0, 2),
                'reason': reason,
                'type': str(x.get('limit_up_type') or ''),
                'days': x.get('high_days') or 1,
                'first': ts_to_hhmm(x.get('first_limit_up_time')),
                'last': ts_to_hhmm(x.get('last_limit_up_time')),
                'industry': '',
            })

    dt_list = []
    for p in dt:
        dt_list.append({
            'code': str(p.get('c', '')), 'name': p.get('n', ''),
            'price': round(p.get('p', 0)/1000, 2) if isinstance(p.get('p'), (int, float)) else 0,
            'chg': round(p.get('zdp', 0), 2),
            'industry': p.get('hybk', '') or '',
            'first': fmt_hhmm(p.get('lbt')),
            'days': p.get('lbc', 1),
        })

    concept_top = sorted(concept_cnt.items(), key=lambda x: -x[1])[:20]
    industry_top = sorted(industry_cnt.items(), key=lambda x: -x[1])[:12]

    return {
        '交易日期': date8,
        '涨停数': len(zt_list),
        '跌停数': len(dt_list),
        '涨停列表': zt_list[:20],
        '跌停列表': dt_list[:20],
        '概念统计': [{'name': k, 'cnt': v} for k, v in concept_top],
        '行业统计': [{'name': k, 'cnt': v} for k, v in industry_top],
        '数据源': '东财+同花顺' if not fallback else '同花顺(东财无历史)',
    }

def main():
    by_date = json.load(open(f'{BASE}/data/raw/boards/by_date.json'))
    dates = sorted(d for d in by_date if '20260717' <= d <= '20260827')
    print(f"目标 {len(dates)} 个交易日", flush=True)

    out = {}
    for i, d in enumerate(dates):
        try:
            rec = build_day(d)
            out[d] = rec
            print(f"[{i+1}/{len(dates)}] {d} 涨停{rec['涨停数']} 跌停{rec['跌停数']} 概念{len(rec['概念统计'])} 行业{len(rec['行业统计'])} src={rec['数据源']}", flush=True)
        except Exception as e:
            print(f"[{i+1}/{len(dates)}] {d} ERR {e}", flush=True)
        time.sleep(0.5)

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"已落盘 {OUT}")

if __name__ == '__main__':
    main()
