# intent-router (M3 候选 #2) — 设计草案

> **状态**: 🛑 **DEPRECATED**（Alex 4-30 拍 §6 Q0 = D）
> **创建**: 2026-4-29 22:00；**deprecated 锁**: 2026-4-30 10:30
> **对应蓝图**: §1.Q5 节奏编排 / 老金"元思想"中"意图放大"的入口
> **触发原因**: Alex 提出"说一句话 → 自动选 skill 跑"

## 修订历史

| 版本 | 时间 | 变更 |
|---|---|---|
| v0.0 | 2026-4-29 22:00 | 骨架；§0 reality-check 列出 A/B/C 三个差异化方向 + D=deprecated |
| deprecated | 2026-4-30 10:30 | Alex 选 D；先做 context-curator（M3 #1）+ dogfooding 收集 ≥5 例 "CC 自动选错" 再复活；本草案保留作为 W3+ 决策的参考 |

## 复活条件（解封 deprecated 的硬门槛）

1. dogfooding 期间累积 **≥ 5 例** 真实"CC 自带 skill 选择选错"的 case，按 `_meta/findings.md` 的 finding 模板记录
2. 这 5 例**清晰指向同一个差异化方向**（A 多 skill 链路 / B 歧义反问 / C 阶段感知），如果分散无法聚焦，继续等
3. context-curator 已稳定运行 ≥ 2 周（避免在另一个新 skill 还没收敛时再开一个）

满足这 3 条 → 重写本草案为 v0.1 → 进 SKILL.md 实现。

---

## §0 ⚠️ 这个 skill 可能不该建

**Reality check 在 §0**——比设计本身更重要：

Claude Code 已经**自带** skill 自动选择（基于 SKILL.md 的 description 字段）。你输入"我想学..."CC 已经会自动选 knowledge-curator。

所以 intent-router 必须解决 CC 不擅长的，否则就是重复造轮子。**3 个有意义的差异化方向**（你必须选一个，否则建议 deprecated）：

| 方向 | CC 不擅长之处 | intent-router 能做到的 |
|------|-------------|------------------|
| **A 多 skill 链路** | CC 一次只调一个 skill | "整理这篇文章 + 推飞书 + 触发评估" → kc → push → evolution-tracker 一条龙 |
| **B 意图歧义解析** | CC 看 description 配不上时随便选 | "看看这个" 太模糊 → router 反问"你想 a 整理还是 b 评估？" |
| **C 上下文感知调度** | CC 不知项目当前阶段 | M1.6 已完结时若说"再来一次" → 提示"M1 已完结，启动 M2 还是补 M1.7?" |

**§6 Q0 必答**：A / B / C / 都不做（deprecated）

---

## §1 一句话责任 + 边界（仅在 §0 选了 A/B/C 后有效）

### 一句话

**接收用户意图（自然语言或 /<cmd>）→ 决定调哪个 skill / 哪条链路 / 是否反问 → 调度执行。**

### 适用 / 不适用

| 适用 | 不适用 |
|------|--------|
| 多 skill 链路（A 方向） | 单 skill 直接调（CC 已经能做） |
| 模糊意图反问（B 方向） | 命令式明确指令（"跑 evolution-tracker"） |
| 项目阶段感知（C 方向） | 通用 skill 选择（CC 自带） |

---

## §2 「元」5 特征自检

| 特征 | 评估 | 理由 |
|------|------|------|
| 独立 | ⚠️ 待定 | 必须读各 skill 的 SKILL.md / `_meta/task_plan.md` / 上下文，依赖面大 |
| 足够小 | ❌ 警告 | 3 phase 草案：PARSE → DECIDE → DISPATCH。但 DECIDE 含意图理解 + 链路规划 + 反问逻辑，太胖。**必须先选 §0 一个方向再判断** |
| 边界清晰 | ⚠️ 待定 | "调度而不执行"是硬边界，但"何时该反问 vs 何时直接调"边界模糊 |
| 可替换 | ✅ | 输出 = 调度计划 JSON；决策引擎可换 |
| 可复用 | ⚠️ 待定 | 强依赖本项目的 skill 集 + 阶段；跨项目复用需大改 |

**5 特征 3 项 ⚠️ → 这是个高风险 skill**。建议如果选 A 方向，先做最小子集（仅 2-skill 链路：kc → 推送），不要一开始全功能。

---

## §3 输入 / 输出 / state

### 输入

| 来源 | 用途 | 必需 |
|------|------|------|
| 用户输入（NL 或 /<cmd>） | 意图源 | ✅ |
| 各 skill `SKILL.md` description + 输入契约 | 选 skill 的依据 | ✅ |
| `_meta/task_plan.md`（C 方向需要） | 阶段感知 | ⚠️ 视方向 |
| `context-curator` 最新 snapshot（C 方向） | 当前会话状态 | ⚠️ 视方向 |

### 输出

| 产物 | 用途 |
|------|------|
| 调度计划 `_meta/dispatch-plans/<YYYY-M-D-HHMMSS>.json` | 落盘可审 |
| 反问消息（B 方向）| 终端 |
| skill 调用（实际执行） | CC 自动 |

---

## §4 触发条件

天然就是用户输入触发，不需要单独触发条件。

---

## §5 4 phase 大致结构（依方向不同）

**如果 §0 选 A（多 skill 链路）**：
```
Phase 1 PARSE     → 把 NL 切成 sub-intents
Phase 2 PLAN      → 找出 skill 依赖图（kc → push → evt）
Phase 3 DISPATCH  → 顺序调用每个 skill，把 output 喂下个
Phase 4 LOG       → 写 dispatch-plan.json
```

**如果 §0 选 B（歧义反问）**：
```
Phase 1 PARSE     → 计算意图置信度 score
Phase 2 ASK       → score < 阈值 → 反问；> 阈值 → 直接调
Phase 3 DISPATCH  → 调 skill
Phase 4 LOG       → 写 dispatch-plan.json
```

**如果 §0 选 C（阶段感知）**：
```
Phase 1 SCAN      → 读 context-curator snapshot 拿当前阶段
Phase 2 ALIGN     → 用户意图 vs 阶段 → 一致直接调 / 不一致提示
Phase 3 DISPATCH  → 调 skill 或返回提示
Phase 4 LOG       → 写 dispatch-plan.json
```

---

## §6 待 Alex 拍的问题

- **Q0 ⭐ 方向选择**：A 多 skill 链路 / B 歧义反问 / C 阶段感知 / D 全部不做（deprecated）
- **Q1（仅 A）**：链路最长几跳？2 / 3 / 不限？（推荐 2）
- **Q2（仅 B）**：反问后用户答了再调，还是降级到 CC 自动选？
- **Q3（仅 C）**：阶段不一致时是阻塞还是只提示？（推荐只提示）
- **Q4 整体**：第一版要做"调度"还是仅"决策计划"（不真调，吐 plan 给人审）？（推荐第一版只吐 plan，第二版才真调）

---

## §7 风险

- **R1 与 CC 冲突**：CC 自带 skill 选择 + 我的 router 也选 → 双重决策 → mitigate: router 必须明确不接管 CC 已做好的部分（仅做 §0 选定方向）
- **R2 决策错调错 skill**：用户意图被误判 → 跑了不该跑的 skill → mitigate: §6 Q4 推荐第一版只吐 plan 不真调
- **R3 跨阶段误用**：A/B/C 三个方向其实差异巨大，把它们做成一个 skill 容易膨胀 → mitigate: 选定单一方向后，**以后不混入另外两个**（要做就分 skill）
- **R4 ROI 不明**：M1 期 CC 自带 skill 选择已够用，intent-router 解决的痛在哪没数据支撑 → mitigate: dogfooding 期间记录"CC 自动选错"的 case，达到 ≥ 5 例再启动

---

## §8 v0.1 进入条件 / 或 deprecated 条件

- 进 v0.1：Alex 答 §6 Q0 = A 或 B 或 C，且 R4 mitigation 也定了
- deprecated：Alex 答 Q0 = D（推迟到 R4 数据齐了再说）

**我（Claude）的诚实评估**：现在没有"CC 自动选错"的真实数据，建议选 **D（推迟到 W3）**，先把 context-curator（M3 #1）做好，dogfooding 期收集 CC 选错的案例，再决定 intent-router 的方向。

但你说"BC 并行"——如果坚持现在就启动，推荐 **A 方向**（多 skill 链路）作为第一个有差异化的版本。
