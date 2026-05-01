**🔄 meta-loop 第一次在 context-curator 上闭合 — 系统暴露自己**

@2026-4-30 14:55

---

**🎯 这一步发生了什么**

```
你: 4 分 + fix_notes="..."
  ↓
evolution-tracker context-curator
  ↓
mode=weak_signal / valid=1 / proposals=0 / 1 uncategorized
  ↓
weekly-review-2026-W18.md 产出
  ↓
F-017 finding + P-2026-4-30-002 议案候选 写入
```

---

**🔍 关键洞察：0 议案 不是 bug，是 feature**

evolution-tracker 没产出议案的根因：你的 fix_notes 是 `"..."`，**不含任何 SIGNAL_KEYWORDS**（当前关键词集：不会/不能/没改/没变/静默/凭空/捏造/失败/进化/自我/缺/Phase/应该/fix）。

Phase 2 ANALYZE → 1 个 uncategorized piece → 不进 cluster → 不产 direction → Phase 3 不产议案。

**整个链路工作正常**——只是输入决定输出。

---

**💡 但这本身就是一个发现 = F-017**

> **空/极简 fix_notes 让 evolution-tracker 跑出 0 议案 — meta-loop 看似闭合实空转**

任何 user_feedback 驱动的 skill 都受此影响：
- knowledge-curator 跑过 5 次 4 valid run，是因为你写得详细——**运气成分大**
- context-curator 第一次跑就用 "..." 打分 → 暴露了 skill_feedback CLI 的假设漏洞
- 制度化是必须的：CLI 不应假设用户会写好 fix_notes

---

**🛠️ 议案候选 P-2026-4-30-002（meta_loop_observation 来源）**

| 选项 | 是什么 | 复杂度 | 推荐 |
|---|---|---|---|
| **A** skill_feedback CLI 加 fix_notes ≥30 字质量门 + `--allow-short` 转义 | 卡输入端 | 30 行代码 | ⭐ 立刻做 |
| **B** evolution-tracker SIGNAL_KEYWORDS 扩展具象词（压成/激进/截断/假阳性等） | 扩匹配端 | 5 分钟 | ⏸ W3 末再决定 |

A 强推：这是"输入端 vs 检测端"的经典权衡，输入端兜底更省事。B 等 1-2 周看 false positive 数据再做。

---

**📊 进度 31/38 (81.5%)**

| 项 | 状态 |
|---|---|
| 3.6 next_actions.cjs | ✅ |
| 3.7 B1+B3 future | 🌙 |
| 3.8 skill_feedback.cjs | ✅ |
| 3.9 评分+跑 tracker | ✅ |
| 3.10 F-017 + P-002 | ✅ |

next_actions 显示当前可动任务为 0（除 1.9 历史 dup）。**这是自然停顿点**。

---

**🎯 里程碑级意义（不夸张）**

这是 personal harness 第一次出现：
1. **系统暴露自身设计假设漏洞**（skill_feedback 假设用户会写好 fix_notes）
2. **议案来自 meta-loop 自我观察**（不是用户提案，不是抽象推理）
3. **evidence_runs 真的指向真实 evt run**（`evt-2026-4-30-context-curator-144737`）

老金"元思想"中的"自我反观"被一个真实数据点物质化。

---

**🤔 你下次会话需要做的**

按推荐顺序：

1. **5 分钟**：approve P-2026-4-30-002 选项 A → 我立刻做（30 行 patch）
2. **可选**：再用一次 context-curator + 写真实 fix_notes（例：再跑一次会话开头 → 写"compact_mode 把 progress 压成 count，看不到具体进度"）→ 让 tracker 在质量 fix_notes 上重跑一次，应能产 1+ 真议案
3. **W3 末复盘**：P-002 选项 B 的 SIGNAL_KEYWORDS 扩展决策

按里程碑约定，停下等你拍 P-2026-4-30-002（拒/接 A/接 A+B）。
