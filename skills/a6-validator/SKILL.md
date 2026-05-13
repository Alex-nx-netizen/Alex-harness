---
name: a6-validator
version: 0.1.0
description: "校验元。A5 执行完后自动检测项目类型，跑测试/lint/类型检查，输出结构化 ValidationReport。/a6-validator 手动触发，或 helix 编排 Step 8 自动调用。"
status:
  can_run: true
alex_harness_v08: true
harness_role: business_meta
model_recommendation: haiku
runs_in: ["main"]
tools_required: ["Bash"]
---

# A6 validator — 校验元

> **设计源**：`design/a6-validator-draft.md` v0.1

## §0 职责

执行完代码修改后，自动跑验证命令，给出通过/失败的明确结论，**不让 A5 的输出停留在"未验证"状态**。

## §1 执行方式

运行脚本检测项目类型并执行验证：
```bash
node .claude/skills/a6-validator/run.cjs
```

## §2 检测逻辑

脚本按以下顺序检测并执行：

| 检测文件 | 执行命令 |
|---------|---------|
| `tsconfig.json` | `npx tsc --noEmit` |
| `.eslintrc*` / `eslint.config.*` | `npx eslint src/` |
| `package.json` → `scripts.test` | `npm test` / `pnpm test` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |
| `requirements.txt` / `pyproject.toml` | `python -m pytest` |

## §3 4 维评分（v0.7 新增）

> 来源：OpenAI Harness Engineering 三部曲 §6⑥ "评估 / 多维评分"层
> 设计目的：除了「机器 check 是否过」(`passes` 二元)，再让 LLM 自评一次「这次输出对用户有多大价值」(`score` 连续维度)。两者**正交**——passes=true 不等于 score=20。

| 维度 | 含义 | 0-5 分语义 |
|---|---|---|
| `accuracy` | 输出内容是否准确，事实/数据/路径有没有错 | 0=错的；3=半对；5=完全准确 |
| `completeness` | 是否覆盖了 a4 plan 承诺的全部要点 | 0=缺关键项；3=主体齐了；5=完整 |
| `actionability` | 用户能不能直接照着干，还是要再加工 | 0=空话；3=方向明；5=可执行 |
| `format` | 结构、排版、长度是否合适 | 0=乱；3=可读；5=结构清晰 |

**总分 = 4 维之和（0-20）**。**注意：score 不影响 passes**——passes 仍由机器层 check 决定。score 只用于 evolution-tracker 长期趋势分析。

> **v0.8.1 补充**：`actionability` 评分时可纳入"反冗余"维度作为软信号——本次 diff 是否净行数下降、是否无未用 import、是否复用了已有实现。但**不新增第 5 维**——专项检测交给 `code-simplifier` skill（`skills/code-simplifier/SKILL.md`），a6 仍专注机器 check 的二元结论。

### 调用约定

a6-validator 接收**可选**入参 JSON，含 score 字段：

```bash
node skills/a6-validator/run.cjs '{"score":{"accuracy":5,"completeness":4,"actionability":4,"format":5}}'
```

**LLM 行为约束**：
- 调 a6 之前，LLM 自评 4 维 0-5（参考表格语义）
- 透传给脚本；脚本只负责 clamp 到 [0,5] + 算总分 + 写日志
- **如果 LLM 没传 score**：每维默认 4 分（中庸默认，不阻塞 finalize）

### 输出 schema 升级

新增字段：`score: { accuracy, completeness, actionability, format, total }`，同时挂在顶层和 `output.score` 两处，方便 evolution-tracker 直接抓。

## §4 输出格式（ValidationReport · v0.7）

```json
{
  "phase": "a6-validator",
  "passes": false,
  "summary": "2/3 checks passed · score 17/20",
  "score": {
    "accuracy": 5, "completeness": 4, "actionability": 4, "format": 4, "total": 17
  },
  "output": {
    "checks": [
      {"name": "tsc", "status": "pass", "duration_ms": 1200},
      {"name": "eslint", "status": "fail", "output": "src/auth.ts:23 error: ..."},
      {"name": "tests", "status": "pass", "output": "42 passed"}
    ],
    "action_required": "Fix: eslint",
    "score": {"accuracy": 5, "completeness": 4, "actionability": 4, "format": 4, "total": 17}
  }
}
```

## §5 触发方式

```
/a6-validator
```

或由 helix Step 8 / A5 完成后自动调用。
