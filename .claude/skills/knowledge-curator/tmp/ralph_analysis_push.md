**🦅 Ralph (snarktank) 分析 — github.com/snarktank/ralph**

@2026-4-30 10:30

---

**📌 是什么**

一句话：**自主 AI 代理循环系统**——基于 Geoffrey Huntley 的 "Ralph 模式"，反复迭代直到 PRD 中所有 user story 全部 `passes:true`。

> 不是工具产品，是一个"工作模式"的 reference 实现。

---

**🧬 核心思想**

| 维度 | 做法 |
|---|---|
| 上下文管理 | 每次迭代**清空** AI 上下文，用 git history + `progress.txt` + `prd.json` 维持跨迭代记忆 |
| 任务驱动 | `prd.json` = user story 列表 + `passes` 状态字段 |
| 完成判定 | 全部 `passes:true` → 输出 `COMPLETE`；否则继续循环 |
| 反馈循环 | `progress.txt` append-only 学习日志 / `AGENTS.md` 项目约定 |
| 工具抽象 | 默认 Amp，可换 Claude Code（`--tool claude`） |

---

**🗂️ 关键文件**

```
ralph.sh        ← bash 外循环（核心 ~50 行）
prd.json        ← 任务列表（passes 字段）
prompt.md       ← AI 提示词模板
CLAUDE.md       ← Claude 用提示词
progress.txt    ← 追加式学习记录
AGENTS.md       ← 项目约定
```

---

**▶️ 怎么用**

```bash
./scripts/ralph/ralph.sh [max_iterations]            # 默认 Amp
./scripts/ralph/ralph.sh --tool claude [max_iter]    # 用 Claude Code
```

---

**🎯 适合场景**

- 需求**明确**的功能开发（加字段 / 加 UI 组件 / 单测覆盖）
- 任务可拆成**单个上下文窗口能完成**的小 story
- 有**质量门**（单测 / 类型检查 / lint）

❌ 不适合：研究型 / 探索型 / 设计未定 的任务（一拍脑袋的需求 → Ralph 会跑歪）

---

**🔗 跟我们项目的关系**

**已经借鉴的**（4-29 ralph_graft 那次）：
- ✅ `prd.json passes 字段` → 我们的 `task_plan.jsonl passes:true/false`
- ✅ 单一事实源（md 主权 + jsonl 镜像）
- ✅ `<promise>COMPLETE</promise>` 完成判定语义

**明示反对的**：
- ❌ bash 外循环（违背蓝图 §1.Q4 可观察性）
- ❌ agent 自宣告完成（坚持人审驱动）
- ❌ 每次清空上下文（我们是连续 session + curator snapshot）

**还没借鉴但可考虑的**：
- 💡 `progress.txt append-only 学习日志` → 跟我们 `_meta/progress.md` 思路一致，但 Ralph 是 AI **自己写**，我们是 Claude 写人审。可以考虑给 evolution-tracker 加个"读 progress.md 找模式"phase
- 💡 `AGENTS.md 项目约定` → 跟我们 `CLAUDE.md` 重合，没必要再加一个

---

**🧠 我的判断**

Ralph 的价值是**用最少的代码把"自主迭代直到完成"模式跑通**——bash + 4 个 md 文件 = 一个 mini autonomous harness。

它不解决"如何决定该做什么"（PRD 是人写的）、也不解决"如何评估质量"（依赖外部测试）。**它只解决"循环 + 上下文持久化"这一层**。

跟你的 personal harness 关系：**借鉴模式，不抄实现**。我们已经把 `passes` 借过来了，再借鉴一个就够：让 evolution-tracker 自动读 `progress.md` 找重复 finding 模式。

> 不建议接 ralph.sh——bash 外循环 + AI 自宣告完成在我们 §1.Q4 可观察性约束下不达标。

---

**🎯 接下来你可能想做的**

1. 看完点头 → 我把 "evolution-tracker 加 progress.md 扫描 phase" 写成议案候选
2. 觉得 Ralph 模式更彻底 → 我们讨论 `_meta/task_plan.jsonl` 怎么发挥得更像 Ralph
3. 仅了解 → ✅ done，无需后续

---

源仓库：<https://github.com/snarktank/ralph>
原始 Ralph 模式作者博客：Geoffrey Huntley
