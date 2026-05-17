---
name: mode-router
version: 0.9.1
description: 根据任务描述检测并行/审查信号，推荐 solo 或 team 路由并等用户确认；v0.9.1 加 AGENT_DISPATCH 闭环硬契约（推荐 team 即 LLM 必须按 agent_specs 调 Agent tool）+ --record-dispatch / --feedback 闭环；记录决策到 _meta/mode-router-log.jsonl
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
alex_harness_v08: true
harness_role: governance_meta
model_recommendation: haiku
runs_in: ["main"]
tools_required: ["Bash"]
---

# mode-router

> **一句话责任**：根据任务描述检测并行/审查信号 → 推荐 solo 或 team（subagent/peer_review）→ 等用户确认 → 记录决策。

## §1 触发场景

用户描述任务时，在任务开头显式调用或自动调用：

```bash
node skills/mode-router/run.cjs --coarse "实现用户登录页面 + 后端 API，同时做"
node skills/mode-router/run.cjs --fine '{"task":"...","files_changed_count":N,"steps_count":N}'
node skills/mode-router/run.cjs --list                        # 查看最近路由记录
node skills/mode-router/run.cjs --log "task" solo true        # 手动记录
node skills/mode-router/run.cjs --record-dispatch '<run_id>' '<id1,id2,...>'   # v0.9.1：派完 Agent 后回填
node skills/mode-router/run.cjs --feedback '<run_id>' --rating=0|1 --override=solo|team --notes='...'
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

## §9 模型分层建议（v0.3 / 论文 §6⑧）

`team_plan.agents[*].model` 字段是给 LLM 派 subagent 时的**建议**值（不强制），可作为 Agent tool 的 `model` 参数：

| 角色 | 推荐模型 | 理由 |
|------|---------|------|
| `manager` / planner 类 | **opus** | 拆任务 + 跨分片协调 = 最深推理 |
| `worker` / `implementer` / `executor` / `reviewer` | **sonnet** | 实现/审查 = 最佳代码模型 |
| `explainer` / summarizer / 简单 phase | **haiku** | 高频小任务 = 3x 成本节省 |

config.json `model_tiers` 段可调（per-project override）。LLM 派 subagent 时**可以**忽略此字段（v0.3 是建议而非硬契约）。

## §10 Manager-Worker 二层结构（v0.3 / 论文 §6①）

`team_plan.shape` 字段三种值：

| shape | 触发条件 | 结构 | 用法 |
|-------|---------|------|------|
| `manager_worker` | score ≥ `thresholds.manager_worker`（默认 6） | 1 manager + N workers as `subordinates[]` | LLM 先调 manager → manager 拆任务 → 调 N 个 worker |
| `subagent_parallel` | 3 ≤ score < 6 | 扁平 N 个 worker | 并行调 Agent tool（一个消息多个 Agent 调用） |
| `peer_review` | 含 review 词 | implementer + reviewer 串行 | implementer 完成 → reviewer 独立 review |

manager 的 prompt 模板明确说"只协调，不动手；信息黑盒禁止"。subordinates 数组里的 worker 也带 model 字段。

a5-executor 兼容二层：mode=team 时 subagent_run_ids 总数 ≥ 1（manager + workers 都算），不区分 shape。

## §11 配置外置（v0.3 / E3）

`skills/mode-router/config.json` 是评分权重的**唯一真源**：

| 字段 | 用途 |
|------|------|
| `version` | 配置文件版本 |
| `thresholds.team` | mode=team 阈值（默认 3） |
| `thresholds.manager_worker` | shape=manager_worker 阈值（默认 6） |
| `weights.*` | 各信号的加权值（explicit_solo=-999、parallel_per_hit=2、review=3 等） |
| `keywords.{solo,team,parallel,review,refactor,frontend,backend}` | 各信号关键词 regex 数组 |
| `model_tiers.{manager,worker,reviewer,explainer}_role` | per-phase model tier 建议 |

run.cjs 启动时读 config.json，权重不再硬编码。要调整决策行为：改 config.json，不动 run.cjs。

## §12 单元测试

```bash
node skills/mode-router/tests/run-tests.cjs
```

覆盖 6 case：T1 manager_worker（score≥6）/ T2 subagent_parallel（3≤score<6）/ T3 peer_review（review 词）/ T4 solo（score<3）/ T5 显式 solo 覆盖 / T6 阈值。当前 26 项断言 100% 通过。

## §13 v0.9.1 AGENT_DISPATCH 闭环硬契约（解决"推荐空挂"）

**问题**：截至 2026-5-14 mode-router-log 81 条 / 36 team 推荐 / 0 真实派 Agent。helix-runs.jsonl 27 finalize 里 mode=team **0 条**。推荐和执行之间断裂。

**v0.9.1 契约**：

1. **mode-router 输出新增 `agent_dispatch_plan` 字段**（mode=team 时必产）：
   - `blocking: true / must_act: true`
   - `directive` —— 给 LLM 看的强契约句
   - `agent_specs[]` —— 每个 subagent 的 `{description, subagent_type, model, full_prompt}` 可直接套 Agent tool
   - `after_dispatch_cmd` —— LLM 派完必须跑的回填命令
2. **LLM（Claude）契约**（CLAUDE.md "反 mode-router 空挂" 段引用）：
   - 看到 `mode=team` + `agent_dispatch_plan.must_act=true` → 必须在**本回合**调 Agent tool（数量 = `dispatch_count`，shape 决定串/并/二层）
   - 派完后 → 必须跑 `--record-dispatch <run_id> <ids,...>` 把真 ID 写回 log
   - 如果不同意推荐 → 必须先跑 `--feedback <run_id> --override=solo --notes='<原因>'`，再 solo
   - 跳过任意一步 = mode-router 这次推荐永远学不到（evolution-tracker 拿不到执行证据）
3. **evolution-tracker 监督信号**（待 v0.9.2 接入）：
   - `dispatched_subagent_ids != null` = 真闭环；`null` = 空挂
   - 连续 3 次 mode=team 但 dispatched=null → 触发 P-NN 议案"contract 失效，需加 helix-side 强校验"

**配套子命令**：
- `--record-dispatch '<run_id>' <id1,id2,...>`：派完回填，ID 必须 ≥4 字符
- `--feedback '<run_id>' --rating=0|1 --override=solo|team --notes='...'`：用户验收信号

## 修订历史

| 版本 | 时间 | 变更 |
|------|------|------|
| 0.1.0 | 2026-5-1 | 初版；Q1-Q5 锁定；4 phase；验收清单 8 项 |
| 0.2.0 | 2026-5-3 | 双阶段路由（--coarse/--fine）+ 100% 精确硬契约（5.7 闭环）+ team_plan.agents[] |
| 0.3.0 | 2026-5-4 | Manager-Worker 二层（论文 §6①）+ per-phase model tier（论文 §6⑧）+ 评分外置 config.json（E3）+ 单元测试 26 断言 |
| 0.9.1 | 2026-5-17 | **AGENT_DISPATCH 闭环硬契约**：mode=team 推荐时输出 `agent_dispatch_plan`，LLM 必须按 spec 调 Agent tool；`--record-dispatch` / `--feedback` 子命令；coarse 路径取消 deprecated（v0.9 minimal mode 主路径） |
