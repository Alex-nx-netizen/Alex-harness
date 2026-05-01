**🔍 evolution-tracker Phase 1 加读 task_plan.jsonl**

@2026-4-29 16:22

---

**🛠️ 干了什么**

`lib/phase1_read.cjs` 扩展：

1. **新增 `readTaskPlan()`**（~50 行）：parse jsonl + 算 stats + 找 hot_blocked_by + blocked_chains
2. **Phase 1 log 加 task_plan section**：当前阻塞图谱直接出现在每次跑的 log 顶部
3. **Phase 2/3/4 不动**（明示边界）：不把 task 信号转 direction，不出议案——防一个 skill 处理两类 subject（蓝图 §1 元 5 特征"职责单一"）

---

**🔥 第一次跑揭示什么**

```
synced_at: 2026-4-29 16:14:53
stats: 17/26 completed (65.4%) | blocked=5 | in_progress=1 | skipped=2 | aborted=1
completion_signal: <promise>NOT_COMPLETE</promise>

hot blockers (解锁这些是关键路径):
  - 1.6: blocking 2 other task(s)   ← M1 卡点
  - 1.3, 1.5, 1.7, 2.3: blocking 1 each

blocked chains:
  - 1.4 ← 1.3:skipped               ← 1.3 已废，1.4 应该可以解锁
  - 1.6 ← (no blocker info)         ← 等用户给素材
  - 1.7 ← 1.6:blocked               ← 链式阻塞
  - 1.8 ← 1.5:passed, 1.6, 1.7      ← 1.5 已通过但 1.6/1.7 还堵
  - 2.4 ← 2.3:?                     ← ⚠️ 野指针！
```

---

**🐛 意外发现 F-016**

`2.4 ← 2.3:?` 暴露：task_plan.md 已把 2.3 拆成 2.3.1+2.3.2，但 2.4 的 notes 还写"等 2.3"。**sync 脚本只做字面镜像，不做引用完整性校验。**

已记 findings.md F-016：
- **影响**：blocked_by 看上去是死链
- **解决（短期）**：sync_task_plan.cjs 加引用完整性校验
- **解决（长期）**：禁止 task_id 重命名（只能 deprecate）
- **去向**：M2.4 evolution-tracker 自我复盘候选议案

这又是一个**通过自己跑暴露自己 bug** 的案例（F-014/F-015 同款机制）。

---

**📊 边界声明（设计纪律）**

| 这次做 | 不做（防职责膨胀） |
|---|---|
| ✅ 数据通路打通 | ❌ task signal → ANALYZE direction（留给独立 task-progress-tracker skill） |
| ✅ 人审看到健康度 | ❌ 出 task 议案 |
| ✅ Phase 1 log 出 stats + 阻塞图 | ❌ 算 aging（jsonl 是快照不是历史） |

---

**🎯 接下来强烈推荐 STOP**

6h11min 持续高强度。今天累计：
- 6 次飞书 IM 直推
- evolution-tracker 4 phase + 自我修复闭环 + Ralph 嫁接 + Phase 1 task_plan 扩展
- 8 个新 finding（F-009 到 F-016）

明天可以处理：
- 修 F-016（短期方案：sync 加完整性校验）
- 跑 M1.6（解锁 1.7/1.8/H-001 收尾）
- 或等需要时再扩 evolution-tracker 消费 task signal
