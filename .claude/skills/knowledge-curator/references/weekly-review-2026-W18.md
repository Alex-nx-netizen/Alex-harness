# Weekly Review — knowledge-curator

> 由 evolution-tracker 自动生成 (2026-4-29 21:42:00)。**这是议案的 NL 综述**，actionable diff 在 `references/skill-proposals/*.diff`，需 `git apply` 接受。

## 输入快照
- valid runs: 3（2026-4-28-harness-trilogy, 2026-4-29-meta-kim, 2026-4-29-investment-edge-test）
- aborted runs: 1（2026-4-28-meta-kim-aborted）
- mode: normal
- findings 引用: F-008, F-009, F-005, F-006, F-007, F-001, F-002, F-003, F-004, F-010, F-011, F-015, F-014, F-013, F-012

## Pattern 聚类
- **self_evolution** (元元（不在本 skill 范围）): 1 runs, 0 findings; status=skip_already_out_of_scope; out_of_scope=true
- **phase7_push** (工作流缺口): 1 runs, 1 findings; status=skip_already_approved; out_of_scope=false
- **phase4_robustness** (鲁棒性缺口): 1 runs, 3 findings; status=skip_already_approved; out_of_scope=false
- _uncategorized_: 2 pieces (尚无 direction rule)

## 议案概览（0 条）
## 黑名单 / 跳过
- (无)

## 接下来你做什么
- 无 actionable 议案。可能：所有信号都在 out_of_scope / 黑名单 / 已有 workaround。

---

# 人工 L2 复盘（W1, 4-28 → 4-29）

> 本节由 Claude 起草供Alex审改。**机器产物在上半部分，人工故事在下半部分**——蓝图 §3 双产物模式。

## 时间线

| 时点 | 事件 | 信号 |
|------|------|------|
| 4-28 12:00 | M1.1 Harness 三部曲跑通（132K 字 / 15 chunks） | rating=5；fix_notes "不会自我进化" → 触发 evolution-tracker 设计 |
| 4-28 22:30 | M1.2 GFW 拦 GitHub，aborted | "失败 = 数据"——按 SKILL.md 规则不凭空造内容，记 finding F-9 |
| 4-29 10:24 | M1.5 Meta_Kim 跑通 + 暴露 F-010/F-011 | rating=3；fix_notes 提出 Phase 7 PUSH 议案 |
| 4-29 11:46 | evolution-tracker 第一跑 → 产出 P-001/002/003 | 治理元 R2 首次产出真实工程价值 |
| 4-29 11:55 | 议案 P-002 + P-003 真落地（knowledge-curator v0.1.1） | 闭环跑通：runs.jsonl → 分析 → 议案 → SKILL 改 |
| 4-29 15:35 | 重跑 evolution-tracker → 暴露 F-014/F-015 | **自我跑暴露自身 bug** = 治理元自我进化 |
| 4-29 16:22 | Ralph 嫁接 + Phase 1 加读 task_plan → 暴露 F-016 | 多个机制相互校验产出新发现 |
| 4-29 20:42 | M1.6 投资理财跑通 → H-001 达标（3 valid runs） | rating=5 "完全没问题，非常仔细" → 议案池保持空，安静期信号 |

## 数据对比 W0 → W1

| 指标 | W0（4-28 之前） | W1（4-28 至 4-29） |
|------|---------------|-------------------|
| valid runs | 1 | 3 |
| aborted runs | 0 | 1 |
| findings | 7 | 16（+9：F-008..F-016） |
| 议案池 | 0 | 3（1 out_of_scope / 2 approved+applied） |
| skill 数 | 1 (knowledge-curator v0.1.0) | 2（curator v0.1.1 + evolution-tracker v0.1.0） |
| 数据基础设施 | 仅 runs.jsonl | + task_plan.jsonl 镜像 + cursor + _index.jsonl |

## 三个值得复盘的关键点

1. **议案落地零意外**（M1.6 vs M1.5）：P-002+P-003 应用后第一次跑就一发命中，**evolution-tracker 不是在画饼**——这是治理元 R2 的物质化证据
2. **自我跑暴露自身 bug**（F-014/F-015/F-016）：今天 3 个 finding 都不是用户报的，是 skill 跑自己的时候发现自己的问题。这呼应蓝图 §1 元 5 特征"自我审计"——治理元真的在工作
3. **rating=5 "完全没问题" 是好信号**（M1.6）：没产生议案≠系统不工作。议案池保持空 = "不为了进化而进化" = 治理元 R2 的精神

## W2（5 月 1-4 日）决策待你拍

蓝图本身需要补 4 件事（基于今天暴露的）：

- [ ] §3.X 议案双路径：定时（evolution-tracker） + 即兴（人/agent 当下发现，如 F-016）
- [ ] §3.Y 数据源消费矩阵：哪个 skill 读 runs.jsonl / task_plan.jsonl / findings.md
- [ ] §1.Z 嵌套主权区：产出文档可含用户主权 section（如 investment doc §6）
- [ ] §3 weekly-review 双产物：机器 stub + 人工 L2 augment（本文件就是范例）

**W2 大方向 3 选 1**：

- **A**: dogfooding 期（不开新 skill，让数据自然累积到 4-6 valid runs）
- **B**: 第二个 skill — `intent-router`（说一句话 → 自动选 skill 跑）
- **C**: 第二个 skill — `context-curator`（_meta + memory + design 喂下次会话）

**推荐 A**——先观察 evolution-tracker 在更多数据下是否仍准。如果 W2 末仍是安静期（议案池稳定），说明当前 2 个 skill 已收敛，再开 M3。

## 风险

- **议案池长期为空 ≠ 系统稳定**：可能是数据太少（3 valid runs）触不到边界。需要 W2 数据补强才能判断
- **F-016 dangling 还在**（2.4 ← 2.3）：短期 sync 校验已加，长期"禁止重命名"未落地，下次 task_plan.md 被改可能再触发
- **`_meta/findings.md` 16 条未做归档**：旧 finding 还堆在主文件，无生命周期管理

---

> M1 完结线（task_plan 1.8）：本文件存在 + 用户 ack ≥1 处 = 标记 M1 ✅，正式进入 M2。
