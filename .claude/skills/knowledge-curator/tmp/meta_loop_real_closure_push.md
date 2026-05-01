**🔄 meta-loop 真闭合 + 系统暴露两个隐藏漏洞（F-018 + F-019）**

@2026-4-30 15:55

---

**🎯 三件事都做完**

| 项 | 结果 |
|---|---|
| **1** 修 dangling 2.4→2.3（F-016） | ✅ 标 2.4 完成；clean |
| **2** 第 3 次跑 curator + 真 fix_notes + 跑 tracker | ✅ 但暴露 2 个漏洞 |
| **3** 批准 P-2026-4-30-001 | ✅ status=approved；实施 defer W3 |

---

**🔴 关键发现 1：F-019 — SKILL.md vs DIRECTION_RULES 双源真理**

我以为 P-002 B 把 13 个关键词加到 SKILL.md SIGNAL_KEYWORDS 就完事了。**错。**

第 3 次 run + 真 fix_notes 跑 tracker → clusters_found 仍是 0。查代码才发现：
- SKILL.md `SIGNAL_KEYWORDS` 只被 frontmatter parser 读入
- 真正驱动聚类的是 `lib/phase2_analyze.cjs` 里**硬编码** `DIRECTION_RULES`
- 改 SKILL.md = no-op；改 phase2_analyze.cjs = 真生效

> SKILL.md 是契约文档，DIRECTION_RULES 是真实运行时——两者写之前没对齐，**SKILL.md 沦为静态装饰**。

**修复**：在 phase2_analyze.cjs 加 2 条 DIRECTION_RULE：`curator_truncate_aggressive` + `curator_diff_falsepositive`。

---

**🟡 关键发现 2：F-018 — 新 DIRECTION_RULE 缺 PROPOSAL_TEMPLATE 配套**

加完 DIRECTION_RULE 再跑 tracker：
```
clusters_found: 1 ✅ direction=curator_truncate_aggressive
proposals: 0 ⚠️ "该 direction 无 proposal template；M2.3.2.3 时手动加"
```

**ANALYZE 命中 cluster，PROPOSE 静默跳过**——因为 phase3_propose.cjs 用模板字典生成议案，新 direction 没对应 template。

完整加新 direction 需要 **2 处** 改动：
1. `phase2_analyze.cjs` DIRECTION_RULES（聚类）
2. `phase3_propose.cjs` PROPOSAL_TEMPLATES（议案）

漏一个就是"识别但不出议案"。

---

**📊 进度跳跃 32 → 37/44 (84.1%)**

```
3.12 ✅ 第 3 次 curator + tracker 验证
3.13 ✅ 修 dangling
3.14 ✅ P-001 approved
3.15 ✅ F-018 + F-019 写入 findings.md
3.16 🌙 (未来) 补 PROPOSAL_TEMPLATE for curator_truncate_aggressive
3.7  🌙 (未来) B1+B3
```

---

**🧠 元层面价值（不夸张）**

今天的 personal harness 在**自我使用过程中暴露了两个设计-实施双源真理**：

1. F-019: 契约层（SKILL.md frontmatter）≠ 实施层（lib/phase2_analyze.cjs DIRECTION_RULES）
2. F-018: 聚类层（DIRECTION_RULES）≠ 议案层（PROPOSAL_TEMPLATES）

**这种漏洞不靠看代码能找到——只能靠真用 + 真出 fix_notes + 真跑 tracker 才能撞出来**。dogfooding 的元价值在此物质化。

老金"元思想"的"自我反观"再一次被真实数据点支持。

---

**▶️ 下一步候选**（按推荐顺序）

1. **现在/明天**：3.16 补 `curator_truncate_aggressive` 的 PROPOSAL_TEMPLATE → 完整 unblock 上下文聚合议案产出
2. **W3 末**：P-001 完整实施（progress.md 扫描 phase）
3. **W3 末**：B1 staleness + B3 promise-only 命令

按里程碑约定停下。今日 11 连击：Ralph 分析 / W2 三决策 / B2 readiness / context-curator 端到端 / skill_feedback CLI / meta-loop 第 1 次闭合 / F-017 / P-002 完整闭环 / **第 3 次跑真闭合 / F-018 / F-019**。
