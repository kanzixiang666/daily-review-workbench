# Kevin 每日复盘台

A 股个人投资复盘工作台：按日查看大盘走势、全球市场联动、个人持仓表现与涨跌停统计。部署于 WorkBuddy 资料库 page，交易日 8:30/15:30 自动更新。

> 注意：本仓库含个人持仓数据，公开后所有人可见。

## 在线页面
https://www.workbuddy.cn/space/d/yBrpn61HWbuSLSU2lvWdjx

## License
MIT License — 见 [LICENSE](LICENSE)

## 功能模块
| 模块 | 内容 | 数据表 |
|---|---|---|
| 今日要处理 | 复盘提醒 + 未来一周财经日历 | 表1 + 表4 |
| ① 今日大盘速览 | 三大指数/成交额/市场情绪、上证近12日K线、涨停跌停统计、当日分时、板块资金流 | 表1 + 表5 |
| ② 全球市场联动 | 美股/恒指/日经/KOSPI/A50/美元指数/汇率 | 表1 |
| ③ 每日持仓表现 | 10 只标的涨跌幅、组合 vs 上证累计、个股走势弹窗 | 表2 + 表3 |

## 数据表（databaseId 勿改）
- 表1 每日行情总表 `cLcxNlQynomKfZa92Ptryc`：每交易日 1 行，大盘+全球+复盘四栏手填+分时+板块+OHLC
- 表2 每日持仓表现 `rOEUCAdnBUZXNJpMNg1WNd`：每股票每交易日 1 行（股票代码用无前缀 6 位，如 002353）
- 表3 持仓清单 `Ca9lZzGvP8gCYCWoXoljoT`：手工维护（8 持仓 + 2 观察仓，成本/股数/触发价待补）
- 表4 财经日历 `WE6AI38GWioyyd3aGraNRg`：自动化滚动维护未来 7 天
- 表5 涨跌停统计 `zAZyyUzHJidu3Z2TEdg3qv`：每交易日 1 行，涨停/跌停列表 + 概念/行业统计 JSON

## 自动化
「每日复盘台行情自动更新」`61057e84-4bd8-431c-a0dd-e6c1b7dd0961`
- 交易日 8:30：隔夜全球市场 + 财经日历维护
- 交易日 15:30：收盘价/OHLC/分时(1分钟)/板块资金流/涨跌停统计/表2 持仓快照
- 铁律：不覆盖用户手填的 大盘判断/持仓操作/明日计划/风险提示

## 目录结构
```
daily-review-workbench.html   页面源码（唯一事实源，改版后 import_html.py --node-block-id yBrpn61HWbuSLSU2lvWdjx 重导入）
CHANGELOG.md                  版本历史
overview.md                   交付说明
README.md                     本文件
scripts/                      抓数与组装脚本
data/raw/                     原始行情抓取（month=月铺底、limitup=涨跌停、schema、batches）
data/output/                  最终写入 payload + 回执 + verify/ 回读验证
data/mock/                    本地 mock DSDK 渲染验证页
screenshots/                  渲染验证截图
docs/                         用户模板
.workbuddy/memory/            工作日志 + 长期笔记（勿删）
```

## 关键接口备忘
- 腾讯日K：`web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,起,止,40,qfq`（带 Referer: https://gu.qq.com/）
- 腾讯分时(1分钟)：`web.ifzq.gtimg.cn/appstock/app/minute/query?code=sh000001`
- 东方财富K线（含成交额）：`push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&...`（沪 1.000001/深 0.399001/创业板 0.399006）
- 涨停池：同花顺 `data.10jqka.com.cn/dataapi/limit_up/limit_up_pool`；行业/跌停池：东财 `push2ex.eastmoney.com/getTopicZTPool` / `getTopicDTPool`
- 日经历史：`indexes.nikkei.co.jp/en/nkave/archives/data`；KOSPI：FT Markets `markets.ft.markitdigital.com/data/indices/tearsheet/historical?s=KSPI:KSC`
- 坑：东财 pool 价格 p 为千分之单位（/1000 才是元）；东财时间 fbt/lbt 为 HHMMSS 整数（92500=09:25）；data_kline 的 exchange 字段是换手率不是涨跌幅

## 开发习惯
- 改页面 → 本地 mock 验证（data/mock/）→ import_html.py 重导入 → `git add -A && git commit -m "vN: ..."`
- 数据操作 → 脚本存 scripts/，原始/输出/验证分存 data/raw|output|verify，可完整复现
- 详细踩坑记录见 `.workbuddy/memory/2026-08-29.md`

## 新会话恢复上下文（给 AI/模型）
开始工作前按顺序读取：
1. `.workbuddy/memory/MEMORY.md` —— 项目长期笔记（核心资产 ID、约定、铁律）
2. `.workbuddy/memory/2026-08-29.md` —— 当日工作日志（含踩坑细节）
3. `CHANGELOG.md` —— 版本历史，快速了解已做什么
4. `daily-review-workbench.html` —— 页面源码（唯一事实源），重点看 state/loadData/refreshAll/渲染函数
5. `scripts/build_payload.py` —— 数据组装示例

关键铁律：
- 页面 databaseId 必须用字符串字面量（DSDK lint），多表页面每表写专用查询函数
- 自动化禁止覆盖用户手填的 大盘判断/持仓操作/明日计划/风险提示
- 表2 股票代码用无前缀 6 位（002353），勿带 sz/sh
- 改版重导入必须带 `--node-block-id yBrpn61HWbuSLSU2lvWdjx`，否则产生重复页
- token（connect_open_platform）有效期 1800 秒，过期换新即可
