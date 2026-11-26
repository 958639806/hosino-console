# 消耗详情生产契约（2026-11-14 SGT）

生产接口使用下述真实统计契约；不发布草稿示例字段、整数 micros、模拟刷新或 demo。

## 接口与权限

复用 GET /api/usage/cost?days=30；详情未新增匿名接口。仍经原server全局登录权限、
同一rawReq认证失效处理及同源安全策略；未改设备/模型认证。refresh=1仅强制刷新统计内存缓存。
支持startDate/endDate，日期含首尾，新加坡自然日。数据来自全部agent的保留OpenClaw usage，以及采集上线后写入的记忆抽取账本；
不擅自合入未关联的原生CLI增量。记忆抽取账本不在网关监视的 ~/.openclaw 下。
采集上线前的抽取没有 token 记录，无法补计，未计入。合计为 API 等价估价（USD），
不是 DeepSeek 实付账单。明细维度为模型 / 服务商 / 日期 / 来源（会话或记忆抽取）。
四个维度各自逐桶、逐金额加和与 totals 一致。

## 金额和维度

金额是USD浮点数，不是micro单位。totals / models / providers / daily拥有同样四桶字段：
input/output/cacheRead/cacheWrite及totalTokens；inputCost等四桶下界，inputCostUpper等四桶上界；
totalCost / totalCostUpper为区间。三个维度各自逐桶、逐金额加和与totals一致。
model维度key为provider/model，provider维度key为provider，daily以SGT的date分组。

referenceCost/referenceCostUpper、referenceTokens/referencePriceEntries为变体参考价格部分，
已包含于合计。Fast不能冒称公共API同型号官方价。tokenCoverage为全部数值估算率；
officialTokenCoverage排除Fast参考及自定义价。customPriceEntries另列。所有值非实际账单、不含订阅费。

未知模型、缺usage、无效或不完整分量分别保留计数；真实零桶与未知分开显示。
无可计算记录时不显示伪造$0；部分可计算时显示可估金额并列异常，已知token仍保留。
TTL未知的Claude/OpenAI写入与DeepSeek峰谷按公开上下界计价，未跳过相关token。

## 刷新

refresh.status=fresh|stale，pending=false（返回前等待真实读取完成）。客户端等待期间显示refreshing。
refresh包含ttlMs=120000、generatedAt、expiresAt、ageMs、cacheHit。相同窗读取single-flight；
请求时刻锁定SGT日期，跨午夜换缓存key。强制刷新失败保留旧快照且明确stale，不伪称fresh。
初次读取失败显示重试，不用示例或旧接口金额代替。没有定时模拟完成逻辑。

## 生产资源

#/models/cost二级页复用已验布局/CSS，只部署usage-detail.js/css；不部署usage-detail-example.js、
demo.html、demo-guard、mock server。index与service-worker注册URL版本已更新，原其他功能不变。

验证覆盖逐桶对账、鉴权与同源、缓存与真实刷新状态、DOM 交互、完整进程启动和资源完整性。
HTTP 测试使用独立临时会话和明确的合成 usage，不注入或绕过生产进程会话。
DOM 模拟测试不等同浏览器视觉验收。
