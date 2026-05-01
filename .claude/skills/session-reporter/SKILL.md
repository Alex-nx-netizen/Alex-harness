---
name: session-reporter
version: 0.1.0
description: 会话结束时自动把 _meta/progress.md 新会话段落增量推送到飞书（Base 主存储 + IM 摘要）
trigger: stop_hook
can_run: true
evolution_target: logs/runs.jsonl
evolution_min_runs: 3
evolution_signal_keywords:
  - 推送失败
  - 漏推
  - 重复推
  - 格式错
  - 乱码
  - 没收到
blueprint_ref: §3.B2
design_ref: design/session-reporter-draft.md v0.1
---

# session-reporter

> **一句话责任**：读 `_meta/progress.md` → 找上次 push 之后的新会话段 → 提取 ✅ 行 + 结构化字段 → 推飞书 Base（一行一会话）+ IM 摘要。

## §1 产物位置

| 产物 | 路径 |
|------|------|
| 飞书 Base | https://my.feishu.cn/base/Se8obIsyTa5SmfsOMK8cA9d3nNc |
| Base Token | Se8obIsyTa5SmfsOMK8cA9d3nNc |
| Table ID | tbl6hG1Ldp6o2RWN |
| cursor | `.claude/skills/session-reporter/logs/push-cursor.json` |
| runs log | `.claude/skills/session-reporter/logs/runs.jsonl` |

## §2 Base 字段结构

| 字段名 | 类型 | 内容 |
|--------|------|------|
| 会话标题 | text | `### 会话 N：xxx` 去掉 `###` |
| 日期 | datetime | `## YYYY-M-D` 转 Unix ms |
| 完成项 | text | 所有含 ✅ 的行（≤2000 字）|
| 涉及Skill | text | 正则提取 skill 名，逗号分隔 |
| 里程碑 | checkbox | 标题或内容含 M\d+…完成/落地/关闭 |
| run_id | text | `{date}_{会话标题}`（唯一键）|

## §3 4 个执行 Phase

### Phase 1 PARSE
读 progress.md → 按 `## YYYY-M-D` 和 `### ` 切分 → 得到 sessions 列表

### Phase 2 DIFF
加载 `logs/push-cursor.json`（已推送 run_id 集合）→ filter 出新会话

### Phase 3 PUSH
对每个新会话：
1. `lark-cli base +records-create` → Base 存一行
2. `lark-cli im +messages-send` → IM 推一行摘要
3. 追加 run_id 到 cursor

### Phase 4 LOG
写 `logs/runs.jsonl` 供 evolution-tracker 消费；cursor 更新；写后 JSON.parse 校验

## §4 CLI 用法

```bash
# 手动推（和 Stop hook 效果相同）
node .claude/skills/session-reporter/run.cjs

# 查看已推送记录
node .claude/skills/session-reporter/run.cjs --list

# 重置 cursor（下次全量重推）
node .claude/skills/session-reporter/run.cjs --reset
```

## §5 触发配置（Stop hook）

在 `.claude/settings.local.json` 的 `hooks.Stop` 加：
```json
{
  "type": "command",
  "command": "node \"E:\\ai\\study\\person\\Alex-harness\\.claude\\skills\\session-reporter\\run.cjs\""
}
```

## §6 5 特征自检

| 特征 | 评估 | 说明 |
|------|------|------|
| 独立 | ✅ | 只读 progress.md，不写；只增量追加 Base 记录 |
| 足够小 | ✅ | 单文件 executor < 250 行 |
| 边界清晰 | ✅ | 不修改 progress.md；cursor 是唯一状态 |
| 可替换 | ✅ | 换 Base 只改 BASE_TOKEN/TABLE_ID 两个常量 |
| 可复用 | ⚠️ | v0.1 特化飞书；v0.2 抽象 output adapter |

## §7 失败模式

| 失败 | 场景 | Guardrail |
|------|------|-----------|
| Base push 失败 → 跳过不更新 cursor | 网络/token | 失败时不追加 run_id，下次重试 |
| cursor 损坏 → 默认只推最近 3 条 | JSON 解析失败 | 安全 fallback，不全量重推 |
| progress.md 格式变化 → parse 失败 | 手动改了格式 | 不匹配则跳过，不 crash |
| IM 失败 → 仍标记 Base 成功 | bot token 过期 | Base 是主存储；IM 失败只警告 |

## §8 验收清单

- [ ] `node run.cjs` 第一次跑 → 推送现有所有会话到 Base
- [ ] `node run.cjs` 第二次跑 → "无新会话，跳过"
- [ ] Base 每行 run_id 唯一，JSON 有效
- [ ] IM 收到摘要消息
- [ ] Stop hook 触发后自动执行
- [ ] `logs/runs.jsonl` 写入正常

## 修订历史

| 版本 | 时间 | 变更 |
|------|------|------|
| 0.1.0 | 2026-5-1 | 初版；Q1=d / Q2=a / Q3=b+d / Q4=a / Q5=c(Stop hook) |
