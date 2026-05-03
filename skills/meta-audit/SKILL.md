---
name: meta-audit
version: 0.1.0
description: "审计元（论文 §6②）。在 a6-validator 通过后、helix --finalize 之前，独立 subagent 跑 code-reviewer + security-reviewer 双审，输出 4 维评分 + findings 清单。passes 与 a6 共同决定 finalize 是否放行。"
status:
  can_run: true
---

# meta-audit — 审计元（独立审视位）

> **设计源**：OpenAI Harness Engineering 三部曲 §6② "审计 / 反思 / 评分"层
> **地位**：v0.7 起作为 helix phase Step 9.5，在 a6-validator 之后、a7-explainer 之前。

## §0 一句话责任

**a6-validator 是「机器层语法/类型/测试是否过」；meta-audit 是「人类层这次修改值不值得 ship」。**

它把决策放给独立 subagent（code-reviewer + security-reviewer），不让 a5 的执行者本人为自己打分。

## §1 何时跑

- helix Step 9.5：`a6-validator passes=true` 之后自动 inject
- a6 失败时也可跑（只审；不强制 finalize）
- 单独触发：`node skills/meta-audit/run.cjs '<input-json>'`（用于回归调试）

## §2 输入

```json
{
  "plan": "...a4-planner 输出的 plan...",
  "files_changed": ["src/foo.ts", "src/bar.ts"],
  "execution_summary": "a5-executor 干了啥的简短描述",
  "audit_report": {
    "dimensions": {
      "correctness": 4,
      "security": 5,
      "maintainability": 3,
      "alignment_with_plan": 5
    },
    "findings": [
      {"severity": "HIGH", "file": "src/foo.ts", "note": "漏处理 null"}
    ]
  }
}
```

> **重要**：脚本 **不真的派 subagent**。subagent 派遣由 LLM 在主进程做（用 Task tool 调 code-reviewer 和 security-reviewer agent），LLM 把两个 subagent 的输出合并成 `audit_report` 字段，喂给本脚本。脚本只校验 schema + 算分 + 上报 helix。

## §3 评分规则

`audit_report.dimensions` 是 4 维 0-5 分：

| 维度 | 含义 |
|---|---|
| `correctness` | 代码正确性，逻辑/边界/错误处理是否对 |
| `security` | 安全性，是否有注入/越权/泄漏 |
| `maintainability` | 可维护性，命名/分层/复杂度/复用 |
| `alignment_with_plan` | 是否实现了 a4 plan 的承诺，没多没少 |

**总分 = 4 维之和（0-20）**，阈值：

| 总分 | passes | 含义 |
|---|---|---|
| ≥16 | `true` | 通过审计，可以 ship |
| 10-15 | `false` + `needs_revision` | 不致命但需要修，回 a5 改一轮 |
| <10 | `false` | 重大问题，停下来等用户决策 |

## §4 输出

```json
{
  "phase": "meta-audit",
  "passes": true,
  "summary": "总分 18/20（needs_revision=false）",
  "output": {
    "score": {
      "correctness": 4, "security": 5, "maintainability": 4, "alignment_with_plan": 5,
      "total": 18
    },
    "needs_revision": false,
    "findings_count": 1,
    "high_severity_count": 0,
    "findings": [...]
  },
  "errors": [],
  "duration_ms": 12,
  "ts": "2026-5-4 00:30:00"
}
```

## §5 与 a6-validator 的边界

| | a6-validator | meta-audit |
|---|---|---|
| 谁判 | 机器（tsc / eslint / 测试） | LLM subagent（独立审视位） |
| 维度 | 1 维：所有 check 是否过 | 4 维：correctness × security × maintainability × alignment |
| 失败成本 | 必须修，不修不能合并 | 软失败（10-15 分），可标 needs_revision |
| 在 helix 中的位置 | Step 9 | Step 9.5（a6 之后、a7 之前）|

## §6 finalize 兼容性（向后软约束）

旧 helix run（v0.6.x 起的）没有 meta-audit phase_report，finalize 不应卡住：

- helix --finalize 计算 passes_all 时，**如果 helix-runs.jsonl 没看到 meta-audit phase_report**，不算失败（视为 v0.6 兼容模式）
- 一旦看到 meta-audit phase_report 且 `passes=false` → 计入 failed_phases，promise=NOT_COMPLETE

## §7 自留底

`skills/meta-audit/logs/runs.jsonl` 每次跑追加一行（含 score 全字段 + findings 计数 + user_feedback 占位）。

## §8 边界

| 适用 | 不适用 |
|---|---|
| feature / refactor / bugfix 类任务 | 纯文档 / 纯研究任务（a4 plan composedPhases 决定）|
| files_changed ≥ 1 的真实改动 | 0 改动（本来就没东西审）|
| 想要独立审视防自夸 | 一次性 throwaway 脚本 |
