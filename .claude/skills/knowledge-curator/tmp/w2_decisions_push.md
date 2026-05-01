**🎯 W2 三项决策落地 + 2 个 Ralph 衍生议题**

@2026-4-30 10:40

---

**✅ 决策 1：W2 大方向 = "C 优先 B 暂缓"**

| 旧推荐 | 你拍的新方向 | 影响 |
|---|---|---|
| A dogfooding 期 | **C 优先 B 暂缓** | context-curator 现在做（M3 #1），intent-router deprecated，dogfooding 在做 C 的过程中天然发生 |

> 旧推荐 A 的隐含假设是"开新 skill 会打断 dogfooding"——你给的合并路径更省事：做 C = 写它 + 跑它 = 自动产生 dogfooding 数据。

---

**✅ 决策 2：context-curator §6 Q1-Q5 全选推荐**

| Q | 决策 | 落地约束 |
|---|---|---|
| Q1 触发 | **a 手动**（"开始" / "/curator" / 我自己 invoke） | 不挂 hook；M3 末若手动率 < 50% 再换 b |
| Q2 摘要长度 | **800 字** 硬上限 | 超出按"design 蓝图先削 → progress 旧条 → findings 旧条 → task_plan 不削"优先级削 |
| Q3 是否扫各 skill `runs.jsonl` 异常 | **是，但有界** | 每 skill 最近 1-2 条 + 仅 `rating ≤ 2 OR errors_count > 0 OR (rating IS NULL AND age > 24h)` |
| Q4 snapshot 历史 | **保留 14 天** | 第 15 天起归档到 `_archive/<YYYY-M>/` |
| Q5 输出 diff | **要** | 顶部固定 `## 自上次以来变化`；无变化时显式写"无变化" |

design/context-curator-draft.md 已锁 v0.1。

---

**✅ 决策 3：intent-router = D / deprecated**

3 条复活硬门槛（写在 design/intent-router-draft.md §0）：
1. 累积 ≥ 5 例真实"CC 自带 skill 选错"的 case，按 finding 模板记录
2. 这 5 例**清晰指向同一个差异化方向**（A/B/C 之一），分散就继续等
3. context-curator 已稳定运行 ≥ 2 周

满足全部 3 条 → 重写为 v0.1 → 进 SKILL.md 实现。

---

**🦅 Ralph 议题 1：议案候选 P-2026-4-30-001 已写入**

> 你的指令："把 evolution-tracker 加 progress.md 扫描 phase 写成议案候选"

**位置**：`.claude/skills/evolution-tracker/references/skill-proposals/P-2026-4-30-001.md` + `_index.jsonl`

**direction**: `cross_session_pattern_mining`
**status**: `pending`
**source**: `external_inspiration / human_seeded`（区别于 tracker 自动产出）

**核心思想**：让 evolution-tracker Phase 1 加读 `_meta/progress.md` 最近 14 天 session entries（关键词过滤 `踩坑/失败/abort/F-/没生效/重复/自跑/dangling`）→ Phase 2 ANALYZE 第三个证据流。这样 F-014/F-015/F-016 这种"自跑发现自身 bug"的跨 session 模式才能被结构化捕捉。

**4 个 Risk 都写了 mitigation**（详见 P-2026-4-30-001.md），其中最值得注意的是 R3：context-curator 也要扫 progress.md，两者**目的不同 + 都只读**所以无写冲突，但 14 天窗口/过滤规则 M3 末统一审视。

**我的备注**：建议你 **defer 到 W3 末** 一并审视，不立刻 approve——届时 context-curator 已跑过几次，有数据决定 progress.md 的消费策略是分摊给两个 skill 还是统一到一个 reader 里。

---

**🦅 Ralph 议题 2：task_plan.jsonl 怎么发挥得更像 Ralph？**

> 你的问题："觉得 Ralph 模式更彻底 → 不知道现在是否有这个思想，我觉得这个可以借鉴"

**已经借鉴的**（4-29 ralph_graft 那次）：
| Ralph 概念 | 我们的落地 | 状态 |
|---|---|---|
| `prd.json passes` | `task_plan.jsonl passes:true/false` | ✅ |
| 单一事实源 | md 主权 + jsonl 镜像 | ✅ |
| `<promise>COMPLETE</promise>` | sync 末尾 `<promise>` 输出 | ✅ |
| 撤销 story | `subject_has_strikethrough` | ✅ |
| 依赖关系 | `blocked_by` 自动从 notes 解析 + dangling 校验 | ✅ |

**Ralph 有但我们明示反对的**：
- ❌ bash 外循环（违背蓝图 §1.Q4 可观察性）
- ❌ agent 自宣告完成（坚持人审）
- ❌ 每次清空上下文（我们 session 连续）

**还能借鉴而不违反原则的 3 件事**（读侧增强，不引入写侧自动化）：

| 候选 | 是什么 | 价值 | 复杂度 | 推荐 |
|---|---|---|---|---|
| **B1 staleness 字段** | 给每个 task 加 `last_status_change_at`，sync 时 compute `stale_days`；blocked > 7 天打 ⚠️ | 让 2.4 这种早就该解锁的 blocked task 自动显形 | 中（要扫 git history 或加新源） | ⭐⭐⭐ |
| **B2 readiness queue 命令** | 新脚本 `_meta/next_actions.cjs` → 列出"blocked_by 全空 AND status=pending"的 task | 替代我每次会话开头眼睛扫 task_plan 找下一步 | 低（现有 jsonl 直接查） | ⭐⭐⭐⭐ |
| **B3 explicit promise check** | 新脚本 `_meta/check_promise.cjs` → 只打 `COMPLETE/NOT_COMPLETE` + 阶段计数 | sync 已经打了，独立命令更适合脚本化（Phase 7 PUSH 类自动化引用） | 低（10 行） | ⭐⭐ |

**我的强推荐**：**先做 B2**（最小代价 + 最大日常价值）。等我用了 1-2 周觉得需要"哪个 blocked 太久了"再补 B1。B3 价值低，不优先。

**反对**：把 ralph.sh 那种外循环搬过来。我们的"人审驱动 + 会话连续"和 Ralph 的"AI 自驱 + 上下文清空"是**互斥的两种 harness 范式**，混合会两边都不像。

---

**🤔 你下次会话需要做的决定**

1. **context-curator SKILL.md 什么时候装**？
   - a) 现在装（v0.1 design 直接进实现）
   - b) ⭐ **推荐**：让 v0.1 sit 一晚，明天再装（feedback_design_before_install memory 里的偏好）
   - c) 等更长时间（sit 1 周）

2. **议案候选 P-2026-4-30-001 现在拍还是 W3 末**？
   - a) 现在 approve（让下次跑 evolution-tracker 自动消费）
   - b) ⭐ **推荐**：defer 到 W3 末（等 context-curator 跑过几次再决策）
   - c) 现在 reject（不喜欢这个方向）

3. **Ralph B1/B2/B3 三选 N**（N=0/1/2/3）？
   - 我推荐：**仅 B2**（readiness queue 命令）
   - 你也可以：B2+B1，或全做，或全不做

---

**🎯 下一步**

我现在停下，等你拍这 3 个决定（或直接说"按你推荐的来"）。

睡前要点：
- W2 决策 3 项已落盘（design + task_plan + progress）
- task_plan.jsonl 跑 sync ✅ — 34 tasks，dangling 还是那个老的 2.4→2.3（F-016 已知）
- Ralph 分析已推飞书，议案候选已落地
