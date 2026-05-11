# code-review — 代码审查元设计草案

> **状态**: v0.1 草案（2026-5-11）—— 骨架 + 开放问题，待 Alex 拍板
> **优先级**: P1（专业开发者必备能力）
> **职责**: 在代码改动后，**显式**地做安全审查 + 质量审查 + 性能/优化建议，输出可执行的修改清单

---

## §0 起源

Alex 反馈："我在使用过程中，好像没有代码审查这一块" → 实际上 `meta-audit` 已覆盖 correctness / security / maintainability / alignment_with_plan，**但**：

1. **命名问题**：meta-audit 名字太抽象，用户用的时候没意识到它就是 code review
2. **维度缺口**：没有显式的 **performance / optimization** 维度
3. **触发时机**：meta-audit 在 a6 之后（Step 9.5）才跑，藏在流程末尾；专业 code review 应该更早、更显眼

**用户决策**：新设计一个独立 code-review skill，不在 meta-audit 上加东西。

---

## §1 与 meta-audit 的边界（草案推荐）

| | meta-audit（保留） | code-review（新增） |
|---|---|---|
| **本质** | 审计元（Ralph 二元闸） | 质量元（专业开发者视角） |
| **维度** | correctness / security / maintainability / alignment | quality / security / performance / readability / testability |
| **输出** | 0-20 总分 + passes 二元闸 | findings 清单 + severity + 修改建议（**不卡 finalize**） |
| **触发** | helix Step 9.5（a6 之后） | helix Step 8.5（a5 之后、a6 之前）—— **更早**，让 a6 跑测试时已经修了 |
| **失败成本** | 软失败 → needs_revision 回 a5 | 软失败 → findings 进 PR description，不阻断 |
| **subagent** | code-reviewer + security-reviewer | code-reviewer + security-reviewer + performance-optimizer + 语言专属 reviewer（typescript-reviewer / python-reviewer 等） |

**核心区别**：
- meta-audit 关心**「这次修改值不值得 ship」**（决策闸）
- code-review 关心**「怎么把这次修改改得更好」**（建议清单）

---

## §2 触发条件

- helix Step 8.5：`a5-executor passes=true` 之后自动 inject（**早于 a6**）
- 单独触发：`node skills/code-review/run.cjs '<input-json>'`
- 与 meta-audit 并存：code-review 出 findings → a5 改一轮 → a6 跑测试 → meta-audit 做最终二元判定

---

## §3 维度（5 维 0-5 分，满分 25）

| 维度 | 含义 | 谁来判 |
|---|---|---|
| `quality` | 代码质量：命名 / 重复 / 复杂度 / 异常处理 | code-reviewer subagent |
| `security` | 安全：注入 / 越权 / 泄漏 / 依赖漏洞 | security-reviewer subagent |
| `performance` | 性能：算法复杂度 / N+1 / 内存 / 同步阻塞 | performance-optimizer subagent |
| `readability` | 可读性：注释 / 命名 / 抽象层次 | code-reviewer subagent |
| `testability` | 可测性：副作用隔离 / 依赖注入 / mock 友好度 | code-reviewer subagent |

**阈值（草案）**：
- ≥20/25 → `passes=true`，无 findings 或仅 LOW
- 12-19 → `passes=true` + `has_recommendations=true`，findings 进 PR 描述
- <12 → `passes=false`，建议回 a5 改一轮（但不强制，由用户决定）

---

## §4 输入 schema

```json
{
  "plan": "...a4-planner 输出的 plan...",
  "files_changed": ["src/foo.ts", "src/bar.ts"],
  "execution_summary": "a5-executor 干了啥",
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
        "note": "for 循环里 await fetch，O(n) 串行；改 Promise.all",
        "suggestion": "const results = await Promise.all(items.map(fetch))"
      }
    ]
  }
}
```

> 跟 meta-audit 一样：脚本**不真的派 subagent**。LLM 在主进程用 Task tool 派 code-reviewer / security-reviewer / performance-optimizer 等，合并输出后喂给本脚本。脚本只校验 schema + 算分 + 上报 helix。

---

## §5 输出 schema

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
    "by_severity": {"HIGH": 0, "MEDIUM": 3, "LOW": 2},
    "by_dimension": {"performance": 2, "readability": 2, "testability": 1},
    "findings": [...],
    "suggested_next": "回 a5 处理 3 个 MEDIUM 后再进 a6"
  },
  "duration_ms": 15,
  "ts": "2026-5-11 18:00:00"
}
```

---

## §6 在 helix phase 链中的位置（草案）

```
... a5-executor (Step 8)
        ↓
🆕 code-review (Step 8.5)        ← 新增：早期 findings，给 a5 修的机会
        ↓
    a6-validator (Step 9)         ← 跑测试/lint
        ↓
    meta-audit (Step 9.5)         ← 最终二元闸
        ↓
    a7-explainer (Step 10)        ← findings 进 PR 描述
        ↓
    helix --finalize
```

---

## §7 自留底

`skills/code-review/logs/runs.jsonl` 每次跑追加一行（含 5 维分 + findings 计数 + user_feedback 占位）。

---

## §8 边界

| 适用 | 不适用 |
|---|---|
| feature / refactor / bugfix（files_changed ≥ 1） | 纯文档 / 纯研究任务 |
| a4 planner composedPhases 含 code-review 时 | 一次性 throwaway 脚本 |
| 想要早期质量信号 + 优化建议 | 仅想要 binary ship/no-ship 决策（用 meta-audit） |

---

## §9 开放决策点（请 Alex 拍板）

| # | 问题 | 草案推荐 | trade-off |
|---|---|---|---|
| **Q1** | 跟 meta-audit 并存还是替换？ | **并存** | 并存 = 双层防护但 token 翻倍；替换 = 简洁但失去最终二元闸 |
| **Q2** | 触发时机：Step 8.5（早）还是 Step 9.7（晚）？ | **Step 8.5（早）** | 早 = 留时间给 a5 修；晚 = 一次性所有 findings 但太晚 |
| **Q3** | 维度 5 还是 4？performance 单独还是合到 quality？ | **5 维** | 5 维 = performance 单独可见；4 维 = 复用 meta-audit 心智模型 |
| **Q4** | 失败处理：soft（建议）还是 hard（卡 helix）？ | **soft** | soft = 不打断节奏；hard = 强制修但用户可能催促降级 |
| **Q5** | 是否引入语言专属 subagent（typescript-reviewer / python-reviewer）？ | **是，按 language_hints 动态派** | 引入 = 更专业；不引入 = 实现简单 |
| **Q6** | composedPhases 默认含 code-review 还是 opt-in？ | **默认含**（type=feature/refactor/bugfix） | 默认 = 一致体验；opt-in = 灵活 |

---

## §10 跟现有 SDLC 链的最小化影响

- ✅ **不动 meta-audit**（保留 4 维 0-20 二元闸）
- ✅ **不动 a6-validator**（仍负责跑测试/lint）
- 🔧 **改 a4-planner**：composedPhases 默认插入 code-review（type 满足时）
- 🔧 **改 helix run.cjs**：PHASES_DEFAULT 新增 `code-review`
- 🔧 **改 README**：图 2 + 图 3 + Skills 全览表加 code-review

---

## §11 v0.1 之后

- v0.2：language-specific subagent 路由（按 files_changed 后缀 + language_hints 动态派 reviewer）
- v0.3：findings 自动转 a5 修复 task（auto-fix loop，阈值化）
- v0.4：performance benchmark 集成（不仅静态审，跑 micro-benchmark 验证优化）
