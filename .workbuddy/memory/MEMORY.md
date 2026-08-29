# 项目长期笔记（Kevin 每日复盘台）

## 核心资产 ID（勿变）
- Page：Kevin每日复盘台 nodeId `yBrpn61HWbuSLSU2lvWdjx`（https://www.workbuddy.cn/space/d/yBrpn61HWbuSLSU2lvWdjx）
- 表1 每日行情总表：`cLcxNlQynomKfZa92Ptryc`
- 表2 每日持仓表现：`rOEUCAdnBUZXNJpMNg1WNd`
- 表3 持仓清单：`Ca9lZzGvP8gCYCWoXoljoT`
- 表4 财经日历：`WE6AI38GWioyyd3aGraNRg`（事件日期/事件/类别/重要度/关联标的/备注/数据来源）
- 自动化「每日复盘台行情自动更新」：`61057e84-4bd8-431c-a0dd-e6c1b7dd0961`（交易日 8:30/15:30）
- 本地源码副本：工作区根目录 `daily-review-workbench.html`；改版后用 import_html.py 带 --node-block-id yBrpn61HWbuSLSU2lvWdjx 重导入。
- 表5 涨跌停统计：`zAZyyUzHJidu3Z2TEdg3qv`（交易日期/涨停数/跌停数/涨停列表/跌停列表/概念统计/行业统计/数据来源）

## 仓库结构（2026-08-29 起 git 管理）
- `daily-review-workbench.html` 页面源码（唯一事实源，改版→import_html 重导入→git commit）
- `overview.md` 交付说明；`CHANGELOG.md` 版本历史；`README.md` 项目总览
- `scripts/` 抓数与组装脚本（build_payload.py 等）
- `data/raw` 原始行情抓取、`data/output` 最终写入 payload+回执、`data/output/verify` 回读验证、`data/mock` mock 页面、`data/raw/{batches,schema,month,limitup}` 中间产物
- `screenshots/` 渲染验证截图；`docs/` 用户模板
- 提交习惯：每次页面改版/数据操作完成后 `git add -A && git commit`，message 用 `vN: 一句话说明`

## 约定
- 页面数据结构：表1 每天 1 行（大盘+全球+复盘四栏手填+分时数据 JSON）；表2 每股票每交易日 1 行；表3 手工维护持仓（成本/股数/触发价）；表4 财经日历（自动化维护，未来7天事件滚动入库）。
- 板块资金流向字段为 JSON 数组文本：[{"name","pct","inflow"}]。
- 分时数据字段 JSON：{"sh/sz/cyb":{"pts":[["09:30",价格]...],"amt":[["09:30",累计亿]...]}}，**完整 1 分钟粒度（约 242 点），严禁降采样**。
- 用户手填字段：大盘判断/持仓操作/明日计划/风险提示——自动化严禁覆盖。
- 示例数据标记：数据来源=示例数据，页面「清空示例」可一键删除（现已覆盖表1/2/4）。
- 页面 v2 功能：分时走势 tab（模块①）、财经日历（今日要处理卡片内）、个股走势弹窗（模块③行内「走势」按钮）。
- 踩坑细节见 2026-08-29 日志（DSDK lint 字面量要求、RRULE 双 BYHOUR 写法、token 时效、import_html 重导必须带 --node-block-id 否则产生重复页）。
