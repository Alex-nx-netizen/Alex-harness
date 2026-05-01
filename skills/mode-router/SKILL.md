---
name: mode-router
version: 0.1.0
description: 根据任务描述检测并行/审查信号，推荐 solo 或 team 路由并等用户确认；记录决策到 _meta/mode-router-log.jsonl
trigger: manual
can_run: true
evolution_target: runs.jsonl + _meta/mode-router-log.jsonl
evolution_min_runs: 3
evolution_signal_keywords:
  - 误判
  - 漏检
  - 噪声
  - 不该推荐
  - 应该team
  - 应该solo
  - 没触发
  - 多余提示
blueprint_ref: §3.B4
design_ref: design/mode-router-draft.md v0.1
---

# mode-router

> **一句话责任**：根据任务描述检测并行/审查信号 → 推荐 solo 或 team（subagent/peer_review）→ 等用户确认 → 记录决策。

## §1 触发场景

用户描述任务时，在任务开头显式调用或自动调用：

```bash
node .claude/skills/mode-router/run.cjs "实现用户登录页面 + 后端 API，同时做"
node .claude/skills/mode-router/run.cjs --list     # 查看最近路由记录
node .claude/skills/mode-router/run.cjs --log "task" solo true   # 手动记录
```

**典型使用时机**：
- 开始一个复杂任务前
- 用户说"帮我规划一下这个任务"
- context-curator 会话摘要里有多个并发 skill 出现

## §2 路由决策矩阵

| 信号 | 判断 | 路由结果 |
|------|------|---------|
| 并行信号（并行/前端+后端/同时做/拆分/同步进行） | 高并行性 | 推荐 team/subagent，等确认 |
| 审查信号（review/审查/审核/一写一审/code review） | 审查需求 | 推荐 team/peer_review，等确认 |
| 无信号 | 默认 | 推荐 solo，等确认 |
| 用户说"solo" | 显式指令 | solo（直接记录，不等确认） |
| 用户说"team" | 显式指令 | team（直接记录，不等确认） |
| LLM ≠ Claude | 能力限制 | 强制 solo + ⚠️ 提示（不等确认） |

## §3 4 个执行 Phase

### Phase 1 DETECT
读取任务描述 → 匹配并行信号 / 审查信号 / 显式指令 / LLM 类型。

### Phase 2 ROUTE
按矩阵得出 `{ mode, team_type, reason, forced }`。

优先级：LLM 检测 > 显式指令 > 信号匹配 > 默认 solo

### Phase 3 RECOMMEND
打印格式化推荐框到终端（含任务摘要 + 路由结果 + 原因 + team 形式说明）。

- 非 forced：Claude 停下来，将推荐结果展示给用户，等待确认（"确认" / "solo" / "team" / 取消）
- forced（非 Claude 降级）：直接打印警告，跳过确认

### Phase 4 LOG
将决策写入 `_meta/mode-router-log.jsonl`（13 字段），同时写 `logs/runs.jsonl`（skill 自循环）。写后立即 JSON.parse 校验。

## §4 输出格式

**终端打印**（Phase 3 产物）：
```
┌─ mode-router ──────────────────────────────┐
│ 任务：实现用户登录页面 + 后端 API，同时做...
├────────────────────────────────────────────┤
│ 路由结果：TEAM (subagent) [推荐]
│ 原因：检测到并行拆分信号
│ 形式：派出并行 subagent 分别执行拆分任务
└────────────────────────────────────────────┘
确认后继续，或输入 solo/team 覆盖：
```

**_meta/mode-router-log.jsonl 字段**：
```json
{
  "run_id": "2026-5-1 12:00:00",
  "task_desc": "任务描述（前200字）",
  "mode": "team",
  "team_type": "subagent",
  "reason": "检测到并行拆分信号",
  "forced": false,
  "confirmed": true,
  "parallel_signals_hit": ["并行", "同时做"],
  "review_signals_hit": [],
  "explicit_override": null,
  "llm_is_claude": true,
  "user_override": null,
  "timestamp_ms": 1746057600000
}
```

## §5 5 特征自检

| 特征 | 评估 | 说明 |
|------|------|------|
| 独立 | ✅ | 只读任务描述 + 环境变量，输出路由推荐，不执行任务 |
| 足够小 | ✅ | 单文件 executor < 250 行；决策矩阵 + log 写入 |
| 边界清晰 | ✅ | 不执行 team，只推荐；不修改其他 skill |
| 可替换 | ✅ | 输出 JSON 格式标准（solo/team + reason），下游无硬依赖 |
| 可复用 | ⚠️ | v0.1 硬编码信号词；v0.2 参数化（从 SKILL.md frontmatter 读） |

## §6 失败模式

| 失败 | 场景 | Guardrail |
|------|------|-----------|
| 误判并行 → 推荐 team 但不该 team | 信号词误触发 | Q2=C 确认机制拦截；反例写入 log 供未来 review |
| 漏检信号 → 推荐 solo 但应 team | 关键词不全 | 用户说"team"显式覆盖；log 中 user_override 记录 |
| 非 Claude 降级未触发 | env 变量未设 | 默认保守：无 ANTHROPIC_MODEL/CLAUDE_MODEL 则假设 Claude |
| log 写入损坏 | JSON 字段错误 | 写后立即 JSON.parse；失败则打印 warning 不静默 |

## §7 验收清单

- [ ] `node run.cjs "并行拆分前后端"` → 输出 team/subagent 推荐
- [ ] `node run.cjs "需要 code review"` → 输出 team/peer_review 推荐
- [ ] `node run.cjs "写一个函数"` → 输出 solo 推荐
- [ ] `node run.cjs "solo 跑这个"` → 直接记录 solo，无推荐框
- [ ] `node run.cjs --list` → 显示最近 10 条记录
- [ ] `_meta/mode-router-log.jsonl` 每条 JSON 有效
- [ ] `logs/runs.jsonl` 每次执行写一条（供 evolution-tracker 消费）
- [ ] 非 Claude 环境（ANTHROPIC_MODEL 不含 claude）→ 强制 solo + ⚠️

## §8 实现状态

```
can_run: true
phases_implemented: DETECT / ROUTE / RECOMMEND / LOG
executor: run.cjs
log_path: _meta/mode-router-log.jsonl
runs_log: logs/runs.jsonl
```

## 修订历史

| 版本 | 时间 | 变更 |
|------|------|------|
| 0.1.0 | 2026-5-1 | 初版；Q1-Q5 锁定；4 phase；验收清单 8 项 |
