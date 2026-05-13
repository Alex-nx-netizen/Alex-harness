---
name: code-simplifier
version: 0.1.0
description: "反冗余专项重构 skill。仿 Anthropic 官方 code-simplifier 设计：仅对本会话改过的代码做 simplification，不改行为只改写法，输出 5 维评分 + findings + diff 提案，写 logs/runs.jsonl 供反馈闭环。/code-simplifier 手动触发，或月度 refactor-cycle 自动调用。soft-fail 不卡 helix。"
metadata:
  requires:
    bins: ["node", "git"]
    skills: []
status:
  can_run: true
alex_harness_v08: true
harness_role: business_meta
model_recommendation: sonnet
runs_in: ["main", "subagent"]
tools_required: ["Bash", "Read", "Edit", "Grep", "Glob"]
---

# code-simplifier — 反冗余专项重构元

> **设计源**：`design/redundant-code-solutions.md` v1（2026-5-13 调研报告）
> **官方对标**：[Anthropic code-simplifier plugin](https://claude.com/plugins/code-simplifier) — 同样的"只动新改的代码 / 不改行为 / 只重构不加功能"护栏。
> **与 a6-validator 区别**：a6 = 机器二元 check；本 skill = 5 维质量评分 + 建议清单，**soft-fail 不卡 finalize**。
> **与 code-review 区别**：code-review = 跨 quality/security/performance/readability/testability 全维度审查；本 skill 专攻"反冗余"——只看冗余/死码/复杂度/命名/抽象 5 个维度，更聚焦。

## §0 职责

把"会话末尾积累的臃肿写法"清理掉，**不改行为只改形态**。具体做：

- 减少嵌套深度
- 消除冗余代码（重复 validation、unnecessary else、unnecessary steps）
- 改进变量/函数命名
- 替换嵌套三元 / 嵌套 lambda 为清晰条件块
- 标记 dead code（不直接删——删交给 a5-executor + a8-risk-guard 走破坏性变更通道）

## §1 不做的事（铁律）

1. ❌ **不改行为**：任何函数的返回值、副作用、抛出的错误，都必须与改前一致
2. ❌ **不加功能**：不顺手"完善"参数校验、不补"应该有"的错误处理
3. ❌ **不动你没改过的代码**：仅作用于 `git diff HEAD~1` 涵盖的文件（默认）或用户显式指定的 paths
4. ❌ **不删 file**：dead code 只标记，删除走 a5+a8（破坏性确认）
5. ❌ **不重命名 public API**：导出符号改名风险高，仅在用户明示时操作

## §2 5 维评分

> 与 code-review 5 维**正交**：code-review 看"质量地基"，本 skill 看"冗余水位"。两个 skill 都跑，互不替代。

| 维度 | 含义 | 0-5 分语义 | 对应 Lean 戒律 |
|---|---|---|---|
| `redundancy` | 重复代码块、重复 validation、重复注释 | 0=多处重复未提取；3=有少量重复；5=零重复 | #1 no dead code · #2 no redundant validation |
| `dead_code` | 未使用的 import / export / 变量 / 分支 | 0=多处未用未删；3=个别未用；5=全部触达 | #1 no dead code |
| `complexity` | 嵌套深度、unnecessary else、长函数、过度抽象 | 0=深嵌套+早抽象；3=可读但偏深；5=扁平且 earned | #6 earn abstraction · #7 flat over nested |
| `naming` | 变量名清晰度、变量遮蔽、隐喻一致性 | 0=`dict=...` 之类反模式；3=能读懂；5=自解释 | (Lean 隐含) |
| `comments_signal` | 注释信噪比（WHY vs WHAT） | 0=注释多但都是 WHAT；3=半 WHY 半 WHAT；5=全 WHY | #4 comments explain why not what |

**总分 = 5 维之和（0-25）**。

| 总分区间 | 语义 | 行动 |
|---|---|---|
| ≥ 20 | `ok` | ship as-is（passes=true） |
| 12-19 | `recommendations` | findings 进 PR 描述（passes=true + has_recommendations） |
| < 12 | `soft_blocked` | 建议回 a5 处理；但 helix 走 SOFT_PHASES 不卡（passes=false + soft_fail=true） |

## §3 触发方式

### A. 手动触发（最常用）

```bash
# 1. LLM 派子 agent（code-simplifier / refactor-cleaner / 语言专属 reviewer）
#    分析 git diff，自评 5 维 0-5，列 findings
# 2. 把合并后的 simplification_report 喂给本脚本：

node skills/code-simplifier/run.cjs '<input-json>'
```

### B. 月度 refactor-cycle

由 `_meta/refactor-cycle.md` 编排：jscpd → knip → ts-prune → **本 skill** → tests → commit。每月 1 次。

### C. helix 可选挂钩（v0.8.2 候选，未实装）

不进默认 phases 链（避免每次都跑增加延迟）；用户在 `/helix` 时显式开 `--with-simplifier` 才挂在 a5 之后、code-review 之前。

## §4 输入 Schema

```json
{
  "plan": "本次 simplification 的目标（来自 LLM 自总结）",
  "files_changed": ["skills/helix/run.cjs", "skills/a4-planner/run.cjs"],
  "scope_hint": "session_diff | manual_paths | monthly_cycle",
  "language_hints": ["javascript", "typescript"],
  "simplification_report": {
    "dimensions": {
      "redundancy": 4,
      "dead_code": 5,
      "complexity": 3,
      "naming": 4,
      "comments_signal": 4
    },
    "findings": [
      {
        "severity": "HIGH|MEDIUM|LOW",
        "dimension": "redundancy",
        "file": "skills/helix/run.cjs",
        "line_range": "120-145",
        "note": "phase_report 解析逻辑与 cmdFinalize 的 finalEntry 解析逻辑重复，可提取 parsePhaseReport(raw)",
        "suggestion": "新建 parsePhaseReport helper，两处共用；净行数 -18",
        "behavior_safe": true
      }
    ],
    "diff_proposal": null
  }
}
```

**校验规则**（脚本强制）：
- `simplification_report` 必须存在
- `dimensions` 必须有 5 项全 0-5（type === number、Number.isFinite）
- `findings` 可空数组，每项有 `behavior_safe: boolean`——若 false → severity 强制 ≥ HIGH（行为变更属高风险，不该出现在本 skill）

## §5 输出 Schema（SimplificationReport）

```json
{
  "phase": "code-simplifier",
  "passes": true,
  "summary": "总分 19/25（recommendations） · findings 4（HIGH 1） · files 2",
  "output": {
    "score": {
      "redundancy": 4, "dead_code": 5, "complexity": 3, "naming": 4, "comments_signal": 3,
      "total": 19, "_source": "llm_provided", "_uniform_suspect": false
    },
    "has_recommendations": true,
    "soft_fail": false,
    "findings_count": 4,
    "by_severity": {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 1},
    "by_dimension": {"redundancy": 2, "dead_code": 0, "complexity": 1, "naming": 1, "comments_signal": 0},
    "findings": [/* 截断到前 30 */],
    "files_changed": [/* 截断到前 30 */],
    "language_hints": ["javascript"],
    "behavior_violations": 0,
    "suggested_next": "回 a5 处理 1 个 HIGH 后再 ship（建议；soft）"
  },
  "errors": [],
  "duration_ms": 87,
  "ts": "2026-5-13 22:30:15"
}
```

## §6 反馈闭环（参考 knowledge-curator L1-L3 三级进化）

### L1 被动记录（自动）

每次跑完，追加一行 JSON 到 `logs/runs.jsonl`：

```json
{
  "phase": "code-simplifier",
  "passes": true,
  "score": {...},
  "findings_count": 4,
  "behavior_violations": 0,
  "duration_ms": 87,
  "ts": "2026-5-13 22:30:15",
  "user_feedback": {
    "rating": null,
    "fix_notes": null,
    "regressed": null
  }
}
```

**`user_feedback` 字段事后手动填**：
- `rating`: 1-5（这次 simplification 是否真的让代码更好读？）
- `fix_notes`: 你额外改了什么 / 撤销了哪条建议
- `regressed`: 是否引入了行为回归？（true/false）—— **这条最重要**，因为铁律 #1 是不改行为

### L2 月度复盘

每月跑 `_meta/refactor-cycle.md` 时，先看本月 runs.jsonl：
- `regressed=true` 的 run 总数 → 0 是底线；>0 则 5 维评分校准失败，必须人工调本 SKILL.md
- `findings_count` 趋势 → 持续下降意味着代码库在变干净
- 哪个 dimension 上 LLM 最容易高估（自评高、用户 rating 低）→ 把语义在 §2 表里改细

### L3 升级（人审）

L2 复盘文档写明"建议改 SKILL.md 哪几条"，由 Alex 决定是否落地 + git commit。

> 不允许 skill 自己改自己（与 knowledge-curator 同纪律）。

## §7 失败处理

| 失败 | 应对 |
|---|---|
| 输入 JSON parse 失败 | soft_fail=true，不阻塞，runs.jsonl 记 `invalid_input_json` |
| `simplification_report` schema 错 | soft_fail=true，next_step 提示"派 code-simplifier subagent 重新跑" |
| `behavior_safe=false` 出现在 findings | 强制升级 severity；提示用户走 a5+a8 而不是本 skill |
| 5 维评分全相同（uniform） | `_uniform_suspect=true` 标记；提示 LLM 重新自评（疑似敷衍） |
| git diff 为空（没改过文件） | 直接返回 score=25/25 + summary="no changes to simplify" |

## §8 与官方 code-simplifier plugin 对比

| 维度 | Anthropic 官方 plugin | 本项目 skill |
|---|---|---|
| 安装方式 | `claude plugin install code-simplifier` | 项目级 `skills/code-simplifier/` |
| 作用域 | 本会话改过的代码 | git diff HEAD~1 + 用户指定 paths |
| 行为保护 | "Never changes what your code does" | 同；且 `behavior_violations` 计数器显式追踪 |
| 输出 | 自然语言 + diff | 5 维结构化评分 + JSONL 日志 |
| 反馈闭环 | 无（每次一次性） | L1 logs + L2 月度复盘 + L3 人审升级 |
| Helix 集成 | 无 | soft_fail 上报 helix；月度 cycle 编排 |

→ **核心差异**：官方为"通用 Claude Code 用户"设计，本 skill 为"Alex-harness 量身定制"——和 a6/code-review/evolution-tracker 协同。

## §9 第一次试跑建议

```bash
# 1. 让 LLM 派 code-simplifier subagent，分析最近 git diff
# 2. LLM 给出 5 维自评 + findings 列表，组装成 input.json
# 3. node skills/code-simplifier/run.cjs "$(cat input.json)"
# 4. 看 logs/runs.jsonl 最后一行，验证结构正确
# 5. 跑 3-5 次后，做第一次 L2 复盘
```

## §10 TODO（v0.2 路线图）

- [ ] `--dry-run`：只输出 score 不写 diff 提案
- [ ] 集成 jscpd 输出作为 `redundancy` 维度的客观参考
- [ ] 集成 knip / ts-prune 作为 `dead_code` 维度的客观参考
- [ ] helix `--with-simplifier` 显式挂钩（位置：a5 之后、code-review 之前）
- [ ] 与 evolution-tracker 联动：本 skill findings 累计 N 条触发议案
