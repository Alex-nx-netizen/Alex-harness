**🦅 Ralph 嫁接完成 — task_plan.jsonl 镜像**

@2026-4-29 16:15

---

**🛠️ 干了什么**

新建 2 个文件：

1. **`_meta/sync_task_plan.cjs`**（单向同步脚本，112 行）
   - md 是用户主权区，jsonl 是机器可读镜像
   - 绝不改 task_plan.md
   - 幂等（跑 N 次产出相同结果，除 synced_at）

2. **`_meta/task_plan.jsonl`**（26 行 JSONL，每 task 一条）
   - schema：`task_id / phase / subject / status / passes / blocked_by / notes / synced_at`

---

**🦅 借鉴 Ralph 的核心思想**

| Ralph 概念 | 落地到 task_plan.jsonl |
|---|---|
| `prd.json` passes 字段 | `passes: true/false`（机器判定通/不通） |
| 单一事实源 | jsonl 自动从 md 生成，无人工编辑 |
| `<promise>COMPLETE</promise>` | 全部 passes:true → 输出 COMPLETE，否则 NOT_COMPLETE |
| 撤销 story | `subject_has_strikethrough: true` 单独标记 |
| 依赖关系 | `blocked_by: ["1.6"]` 自动从 "等 X.Y" 解析；范围 "等 1.5-1.7" 展开为 ["1.5","1.6","1.7"] |

**不抄 Ralph 的部分（明示反对）**：
- ❌ bash 外循环（违背蓝图 §1.Q4 可观察性）
- ❌ agent 自宣告完成（你已人审驱动）
- ❌ iteration 粒度（保持 session 粒度）

---

**📊 首次同步统计（你的项目当前真实状态）**

```
✅ completed:   17/26  (65.4%)
⏸ blocked:      5
🔄 in_progress: 1   (M1.9)
⏭ skipped:      2   (M1.3 ~~划掉~~ + M2.2.6)
❌ aborted:      1   (M1.2 GFW)
🌙 scheduled:   0
<promise>NOT_COMPLETE</promise>  // 9 项未完成
```

主要 blocked 链路：M1.4 → M1.3，M1.7 → M1.6，M1.8 → M1.5/1.6/1.7，M2.4 → M2.3。**M1.6 是关键阻塞点**（你给国内可达素材就解锁 1.6/1.7/1.8）。

---

**🐛 路上修了 1 个 parser bug**

"等 1.5-1.7" 一开始被单点 regex 截成 "1.5"。调整正则顺序（范围优先）+ 范围内展开成 `["1.5","1.6","1.7"]`。再跑一次：✅ 正确。

---

**🎯 这个文件未来怎么用**

- **现在**：手动跑 `node _meta/sync_task_plan.cjs`（30 秒），看完成度 + 阻塞图
- **下一步候选**：evolution-tracker 加一个 phase——"读 task_plan.jsonl，发现某 task 阻塞 ≥ N 天 → 提议案"
- **更远**：M5 之后接飞书 Bitable，jsonl 一行 = 一行飞书表格

---

**📊 整场会话最终战绩**（10:12 → 16:15，约 6h3min）

```
✅ M1.5 + M2.2.5 + M2.3.1 + M2.3.2
✅ 议案落地 P-002 + P-003 (knowledge-curator v0.1.1)
✅ F-014/F-015 自我重跑发现 + A+B+C 修
✅ Ralph 嫁接（task_plan.jsonl 镜像，passes 字段）
✅ 6 次飞书 IM 直推
```

**Findings 总数**: 9 → 15（今天加 6 条，全是工程实证）
**新文件**: evolution-tracker SKILL.md + 4 lib + run + sync_task_plan.cjs + task_plan.jsonl + 4+ 议案产物

---

**🎯 接下来**

强烈推荐 **STOP**——6h3min，无脑动手已超出"小步迭代"边界。明天可以：
- 跑 M1.6 第 3 次 knowledge-curator（解锁 1.6/1.7/1.8）
- 或：写 evolution-tracker 的"task_plan.jsonl 读取阶段"
