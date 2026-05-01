# context-curator (M3 候选 #1) — 设计草案

> **状态**: v0.1（Alex 4-30 拍 §6 Q1-Q5 全选推荐 ✅；进入 SKILL.md 实现条件已满足）
> **创建**: 2026-4-29 22:00；**v0.1 锁**: 2026-4-30 10:30
> **对应蓝图**: §1.Q3 第二大脑 / §3.B3 上下文聚合 / 元思想"节奏编排"的低层基础设施
> **触发原因**: 每次会话开头我都在重读 `_meta/task_plan.md + progress.md + memory/MEMORY.md + 各 skill SKILL.md`——重复劳动 + 容易漏（如 4-29 早上从压缩恢复时多花了 15min）

## 修订历史

| 版本 | 时间 | 变更 |
|---|---|---|
| v0.0 | 2026-4-29 22:00 | 骨架；§6 5 个 Q 待 Alex 拍 |
| v0.1 | 2026-4-30 10:30 | Alex 全选推荐 ✅；§6 锁定为决策记录；进 SKILL.md 实现门槛 |

---

## §0 一句话责任 + 边界

### 一句话

**会话开头扫聚 `_meta/ + memory/ + design/ + 当前 task` → 产出"本会话摘要包"，让 Claude 5 秒内进入状态。**

### 适用 / 不适用

| 适用 | 不适用 |
|------|--------|
| 会话开头快速进入状态（替代我现在每次手动读 _meta/task_plan + progress 前 3 条） | 会话中段实时调取上下文（那是 CC 自带 memory 的事） |
| 会话压缩后恢复 | 跨项目 / 跨工作区聚合 |
| 给特定 task ID 时聚合相关 finding + 历史议案 | 自动决定"该读哪些 skill"（那是 intent-router 的事） |
| 输出有时效标记（哪些是新的 / 哪些是 stale） | 直接修改 _meta 或 memory（绝不） |

### 与 CC 自带 memory 的区别

- CC memory：分散的小文件，按需调取；自动 inject 但**不主动聚合**
- context-curator：**主动聚合 + 时序整理 + 优先级排序**；输出是"本会话开场白"，不替代 memory

---

## §1 「元」5 特征自检

| 特征 | 评估 | 理由 |
|------|------|------|
| 独立 | ✅ | 输入只读 `_meta/ + memory/ + design/`，输出只写 `_meta/context-snapshots/`；运行时不依赖其他 skill |
| 足够小 | ⚠️ 待定 | 3 phase 草案：SCAN → SUMMARIZE → EMIT。担心 SUMMARIZE 长出来。如长出来应拆 = scanner 元 + summarizer 元 |
| 边界清晰 | ✅ | "只读源文件 + 只写 snapshot 目录"，绝不改源 |
| 可替换 | ✅ | 输出 = 标准 markdown 包；摘要引擎可换（rule-based / Claude / GPT） |
| 可复用 | ⚠️ 待定 | 现在为本项目写；要复用到其他项目需要参数化"扫哪几个目录" |

### 4 判断问题

1. **拿出来能说清它负责什么吗？** → ✅ "会话开场摘要包"
2. **出问题能定位到它吗？** → ✅ 输入只读 + 输出落盘，diff 可查
3. **替换它会拖死整个系统吗？** → ✅ 不会（人工读 _meta 也能跑）
4. **下次相近任务能复用吗？** → ⚠️ 见上"可复用"

---

## §2 输入 / 输出 / state

### 输入（observation space）

| 来源 | 用途 | 必需 |
|------|------|------|
| `_meta/task_plan.md` | 当前阶段 + in_progress task | ✅ |
| `_meta/progress.md` 最新 N 条 | 上次到哪了 | ✅ |
| `_meta/findings.md` 最新 N 条 | 已知坑 | ✅ |
| `memory/MEMORY.md` | 用户偏好 + 项目惯例 | ✅ |
| `design/harness-blueprint.md` 关键章节 | 蓝图状态 | 推荐 |
| 各 skill `SKILL.md` 顶部 frontmatter | skill 状态/版本 | 推荐 |
| 上一次 snapshot（diff 用） | 增量发现 | 推荐 |

### 输出（action space）

| 产物 | 位置 | 用途 |
|------|------|------|
| 会话摘要包 | `_meta/context-snapshots/<YYYY-M-D-HHMMSS>.md` | 喂下次会话 |
| 摘要 index | `_meta/context-snapshots/_index.jsonl` | 时序追踪 |
| 终端打印 | stdout | 即时人审 |

### state

| 状态 | 文件 |
|------|------|
| 上次扫描到的 _meta/progress.md 哪一行 | snapshot frontmatter `last_progress_line` |
| 上次扫描时间 | snapshot frontmatter `scanned_at_bj` |

---

## §3 触发条件

3 选 1 待 Alex 拍（v0.0 草案推荐 a）：

- **a 手动触发**（推荐）：用户说"开始" / "/curator" / 会话开头我自己 invoke
- **b 自动触发**：每个会话第一条用户消息后自动跑（需要 hook）
- **c 阈值触发**：上次 snapshot > N 小时则强制重新跑

---

## §4 4 phase 大致结构

```
Phase 1 SCAN     → 列出要扫的源文件 + 各自 mtime
Phase 2 EXTRACT  → 从每个源提取关键片段（task_plan 取 in_progress + blocked / progress 取最新 5 条）
Phase 3 SUMMARIZE→ 按"5 秒读懂"标准合并（≤ 800 字 / 含时间线 + TODO + 当前阻塞）
Phase 4 EMIT     → 写 snapshot.md + _index.jsonl + 终端打印 ≤ 30 行
```

---

## §5 边界声明（不做什么）

- ❌ 改 `_meta/` 或 `memory/` 或 `design/`（绝不）
- ❌ 决定哪个 skill 该跑（intent-router 的事）
- ❌ 跨项目聚合（M5 之后再说）
- ❌ 实时同步（snapshot 是会话开头的快照，不是流）

---

## §6 决策记录（v0.1，Alex 2026-4-30 全选推荐 ✅）

| Q | 问题 | 决策 | 落地约束 |
|---|------|------|--------|
| Q1 | 触发模式 = a/b/c | **a 手动触发**（用户说"开始" / "/curator" / 会话开头我自己 invoke） | 不挂 hook；不强制；M3 末若手动率 < 50% 再考虑 b |
| Q2 | 摘要长度上限 | **800 字** | 硬上限；超出 → 削减优先级低的源（design 蓝图先削，task_plan + progress 不削） |
| Q3 | 是否扫各 skill 的 `runs.jsonl` 找最近异常 | **是，但有界** | 每个 skill **只看最近 1-2 条** runs.jsonl，且**只挑 rating ≤ 2 或 errors 非空**的写入 snapshot；其余忽略。多 source 但聚焦异常，避免噪声 |
| Q4 | snapshot 留几份历史 | **保留最近 14 天** | 第 15 天起每日归档到 `_meta/context-snapshots/_archive/<YYYY-M>/`；archive 不进 _index.jsonl |
| Q5 | 是否输出"和上次 snapshot 的 diff"突出本次新东西 | **要** | snapshot 顶部固定区块 `## 自上次以来变化`：列出新 finding ID、新 in_progress task、新 议案池条目；无变化时显式写"无变化"，不省略 |

### 进 SKILL.md 前还需要写明（v0.1 阶段已就绪，留给 SKILL.md 实现时确认）

- 800 字上限超出后的削减优先级表（design 先 / progress 次新条 / findings 旧条 → task_plan 不削）
- runs.jsonl 异常判定的精确表达：`rating <= 2 OR errors_count > 0 OR (rating IS NULL AND age_hours > 24)`
- 14 天归档脚本：M3 SKILL.md 实现时附 `archive_old_snapshots.cjs`

---

## §7 风险

- **R1 摘要漏关键**：算法选错该取哪几条 finding → 用户看不到关键阻塞 → mitigate: 输出含"全量 finding 数 vs 摘要数"，让人警觉
- **R2 上下文 stale**：snapshot 写完后 _meta 又被改 → 下次会话用了过期 → mitigate: snapshot frontmatter 含 source mtime；超 N 小时强制刷新
- **R3 与 CC memory 冲突**：CC memory 自动注入 + 我的 snapshot 也注入 → 信息重复 → mitigate: snapshot 主动**减去** CC memory 已含的，只补差集
- **R4 自循环依赖**：context-curator 自己也是 skill，自己的 runs.jsonl 也要被 evolution-tracker 看 → 没问题但要明示

---

## §8 进入条件

- ✅ **v0.1 已进**：Alex 4-30 全选推荐
- 🔄 **进 SKILL.md 实现门槛**：需要先在 task_plan.md 增加 Phase 3 / W2 子任务表，再开 `.claude/skills/context-curator/` 目录（per memory: feedback_design_before_install）
- 🔮 **v0.2 触发条件**（未来）：跑过 ≥3 个真实会话开场，发现 §6 决策有不当之处，或 §0 边界需收缩
