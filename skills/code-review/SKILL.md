---
name: code-review
version: 0.1.0
description: "质量元（专业开发者视角）。helix Step 8.5：a5-executor 之后、a6-validator 之前。独立 subagent 跑 code-reviewer + security-reviewer + performance-optimizer + 语言专属 reviewer，输出 5 维评分（quality/security/performance/readability/testability）+ findings 清单。soft 失败（不卡 finalize）。"
status:
  can_run: true
alex_harness_v08: true
harness_role: quality_gate
model_recommendation: sonnet
runs_in: ["subagent"]
tools_required: ["Read", "Grep", "Glob", "Bash"]
---

# code-review — 质量元（专业开发者视角）

> **设计源**：`design/code-review-draft.md` v0.1（2026-5-11，Alex 拍板"全按草案推荐"）
> **地位**：v0.7.2 新增 phase Step 8.5，在 a5-executor 之后、a6-validator 之前。

## §0 一句话责任

**meta-audit 关心"这次修改值不值得 ship"（二元闸）；code-review 关心"怎么把这次修改改得更好"（建议清单）。**

它把决策放给独立 subagent（code-reviewer + security-reviewer + performance-optimizer + 语言专属 reviewer），早于 a6/meta-audit，让 a5 还有时间修。

## §1 何时跑

- helix Step 8.5：`a5-executor passes=true` 之后自动 inject（**早于** a6-validator）
- a4-planner composedPhases 默认含（type=feature/refactor/bugfix/默认链）
- 单独触发：`node skills/code-review/run.cjs '<input-json>'`（调试/回归）

## §2 输入

```json
{
  "plan": "...a4-planner 输出的 plan...",
  "files_changed": ["src/foo.ts", "src/bar.py"],
  "execution_summary": "a5-executor 干了啥的简短描述",
  "language_hints": ["typescript", "python"],
  "review_report": {
    "dimensions": {
      "quality": 4,
      "security": 5,
      "performance": 3,
      "readability": 4,
      "testability": 3
    },
    "findings": [
      {
        "severity": "HIGH",
        "dimension": "performance",
        "file": "src/foo.ts",
        "line": 42,
        "note": "for 循环里 await fetch，O(n) 串行",
        "suggestion": "const results = await Promise.all(items.map(fetch))"
      }
    ]
  }
}
```

> **重要**：跟 meta-audit 一样，脚本**不真的派 subagent**。LLM 在主进程用 Task tool 派下面 4 类 subagent，合并输出后喂给本脚本。脚本只校验 schema + 算分 + 上报 helix。

### §2.1 subagent 派遣建议（LLM 行为约束）

| subagent | 必派 | 派遣条件 |
|---|---|---|
| `code-reviewer` | ✅ | 总是派 |
| `security-reviewer` | ✅ | 总是派 |
| `performance-optimizer` | 推荐 | files_changed 含 `.ts/.js/.py/.go/.rs/.java` 等可执行代码 |
| 语言专属（如 `typescript-reviewer` / `python-reviewer` / `go-reviewer` / `rust-reviewer`） | 按需 | 按 `language_hints` 或 `files_changed` 后缀动态选 |

LLM 合并各 subagent 输出时，5 维取**最低分**（最严格的 reviewer 说了算），findings 合并去重。

## §3 评分规则

`review_report.dimensions` 是 5 维 0-5 分：

| 维度 | 含义 | 主审 subagent |
|---|---|---|
| `quality` | 代码质量：异常处理 / 重复 / 复杂度 / 死代码 | code-reviewer |
| `security` | 安全：注入 / 越权 / 泄漏 / 依赖漏洞 | security-reviewer |
| `performance` | 性能：算法复杂度 / N+1 / 内存 / 同步阻塞 | performance-optimizer |
| `readability` | 可读性：命名 / 注释 / 抽象层次 / API 设计 | code-reviewer + 语言专属 |
| `testability` | 可测性：副作用隔离 / DI / mock 友好度 / 覆盖率 | code-reviewer |

**总分 = 5 维之和（0-25）**，阈值：

| 总分 | passes | 含义 |
|---|---|---|
| ≥20 | `true` | 通过，无 findings 或仅 LOW |
| 12-19 | `true` + `has_recommendations` | 有建议，进 PR 描述但不强制回 a5 |
| <12 | `false` | 严重问题，**软失败**（不卡 finalize，由用户决定是否回 a5）|

## §4 输出

```json
{
  "phase": "code-review",
  "passes": true,
  "summary": "总分 19/25（has_recommendations=true，3 个 MEDIUM）",
  "output": {
    "score": {
      "quality": 4, "security": 5, "performance": 3, "readability": 4, "testability": 3,
      "total": 19
    },
    "has_recommendations": true,
    "findings_count": 5,
    "by_severity": { "HIGH": 0, "MEDIUM": 3, "LOW": 2 },
    "by_dimension": { "performance": 2, "readability": 2, "testability": 1 },
    "findings": [...],
    "suggested_next": "回 a5 处理 3 个 MEDIUM 后再进 a6"
  },
  "errors": [],
  "duration_ms": 15,
  "ts": "2026-5-11 18:00:00"
}
```

## §5 与 a6-validator / meta-audit 的边界

| | a6-validator | code-review | meta-audit |
|---|---|---|---|
| 谁判 | 机器（tsc / eslint / 测试） | LLM subagent × 多 | LLM subagent（独立审视位） |
| 维度 | 1 维：所有 check 是否过 | **5 维**：quality × security × **performance** × readability × testability | 4 维：correctness × security × maintainability × alignment |
| 失败成本 | 必须修 | **软失败**（不卡 finalize） | 软失败 → needs_revision 回 a5 |
| 位置 | Step 9 | **Step 8.5**（早于 a6） | Step 9.5（a6 之后） |
| 关心 | "能不能跑" | "怎么改更好" | "值不值得 ship" |

## §6 finalize 兼容性

helix --finalize 把 `code-review` 作为 **SOFT_PHASES**：

- `passes=false` → **不**计入 `failed_phases`，**不**变成 `promise=NOT_COMPLETE`
- 出现在 `soft_failures[]` 字段，进 `warnings[]`，由用户人审决定是否回 a5
- 缺失（compose 没含）→ 跟其他 phase 一样，按 `composedPhases` 软警告

## §7 自留底

`skills/code-review/logs/runs.jsonl` 每次跑追加一行（含 5 维分 + findings 计数 + by_severity + user_feedback 占位）。

## §8 边界

| 适用 | 不适用 |
|---|---|
| feature / refactor / bugfix（files_changed ≥ 1） | 纯文档 / 纯研究任务 |
| a4 planner composedPhases 含 code-review 时 | 一次性 throwaway 脚本 |
| 想要早期质量信号 + 优化建议 | 仅想要 binary ship/no-ship（用 meta-audit） |

## §9 v0.1 之后

- v0.2：findings 自动转 a5 修复 task（auto-fix loop，阈值化）
- v0.3：performance benchmark 集成（不仅静态审，跑 micro-benchmark 验证优化）
- v0.4：跨 run 趋势分析（5 维分长期走势进 evolution-tracker）
