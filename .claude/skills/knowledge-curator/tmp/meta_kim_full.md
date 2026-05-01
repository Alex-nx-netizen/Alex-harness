# [AI学习] Meta_Kim — 老金"元"方法论的开源工程落地

> **维护**：Alex | **创建**：2026-4-29 | **来源**：<https://github.com/KimYx0207/Meta_Kim>
>
> **与已有学习材料的关系（必读）**：
> - **理论**：waytoagi 老金《元：从混沌许愿到系统治理》（已读，原文 wiki KGbewcwM1ic0kFk2A58cL8OanFh）
> - **工程视角参照**：OpenAI Harness Engineering 三部曲（已整合到飞书 [AI学习] wiki UtW0wUbPbifCX4kk3ypcGcyinGg）
> - **本文 = 老金的 IMPLEMENTATION**——不是新理论，是把"元思想"落到 npm 包、八个 agent、三层记忆和四个 IDE runtime
> - **最关键的差异**：waytoagi 是"为什么"和"怎么想"，Meta_Kim 是"怎么落"，落到 `canonical/agents/*.md` + `config/contracts/*.json` 这种**真能跑的工件**
>
> **方法论论文依据**：[Zenodo 18957649](https://zenodo.org/records/18957649)（DOI: 10.5281/zenodo.18957649，"meta-based intent amplification"）

---

## 阅读地图

| 时间预算 | 看什么 | 期望产出 |
|---------|--------|---------|
| **30 秒** | TL;DR + 8 阶段图 | 知道这玩意定位"AI above AI" |
| **5 分钟** | 核心概念速查表 + §1 八阶段 | 能讲清"intent → contract → gate"主轴 |
| **30 分钟** | §1-§5 全读 | 能对比 Meta_Kim 8 agent 和我自己的 harness 设计 |
| **3 小时** | `npx --yes github:KimYx0207/Meta_Kim meta-kim` 实跑 | 真的把它装到本地 sandbox，跑一次 `meta:doctor:governance` |

---

## TL;DR（3 行核心结论）

1. **Meta_Kim 不是一个 AI 编码工具，是一套治理系统**——给 Claude Code/Codex/Cursor 这些"手"装一个统一的"大脑"。"先搞清楚要干什么 → 再决定谁去干 → 干完审查 → 审完沉淀经验 → 经验反哺下一轮。"
2. **核心结构 = 8 阶段隐藏骨架 + 10 张动态发牌 + 三层记忆**——固定骨架保底线，动态卡牌补灵活，三层记忆做长期进化。
3. **canonical/ 是 source of truth**——所有内容统一维护在一处，通过 `meta:sync` 投影到 `.claude/`、`.codex/`、`.cursor/`、`openclaw/` 四个 runtime，避免多平台漂移。

---

## 核心概念速查表

| 概念 | 一句话定义 | 重要性 | 对应 Harness 三部曲 |
|------|-----------|--------|--------------------|
| **Hidden skeleton** | 隐藏在可见工作流下始终存在的后端框架 | ⭐⭐⭐ | ≈ Thoughtworks 工程框架的"棘轮规则" |
| **8-stage workflow** | 人类可读的执行脊柱 | ⭐⭐⭐ | ≈ OpenAI 11 核心组件的简化版 |
| **10-stage workflow** | 8 阶段基础上的进展工作流 | ⭐⭐ | ≈ 7 关键设计决策的展开 |
| **Dealing（10 张牌）** | 围绕 8 阶段动态控制的卡牌系统 | ⭐⭐⭐ | Harness 三部曲没明示对应物，是 Meta_Kim 独创 |
| **Gate（门）** | 通行证 / 关卡条件，"阶段说明你走到哪儿，门说明你配不配往前走" | ⭐⭐⭐ | ≈ 验证元（蓝图 §3.A6）的硬化版 |
| **Contract（协议产物）** | 结构化数据包而非口头约定 | ⭐⭐⭐ | ≈ 三部曲讲的"observation/action 标准化" |
| **Agent-unit governance** | 管理边界、能力、升级和回滚 | ⭐⭐ | ≈ 老金"组织镜像"在工程层的落地 |
| **Three-layer memory** | Memory / Graphify / SQL 分层 | ⭐⭐ | 比 OpenAI 三部曲讲的 memory 更系统化 |
| **Capability-first dispatch** | 先描述能力 → 搜索声明拥有者 → 派发 | ⭐⭐⭐ | 跟蓝图 §1.Q4"自我进化"用 capability 注册表的思路一致 |
| **Meta-unit** | 拥有一类职责、明示拒绝、独立可审、可替换、安全回滚 | ⭐⭐⭐ | **这就是蓝图 §1 我自己定的"元 5 特征"的工程版本** |

> **关键口诀**："The 8 stages together form the execution spine. Why are they only 'relatively' fixed? Because some stages can be skipped in simple cases — but the system must explicitly record why they were skipped. **Nothing is skipped silently.**"

---

## §1 八阶段隐藏骨架（Hidden Skeleton）

### 总览

```
Critical    → 锁定真实意图，防止漂移            (输出: intentPacket)
Fetch       → 搜索现有能力优于发明新能力        (输出: 能力搜索结果)
Thinking    → 定义边界、所有者、序列、交付物    (输出: dispatchBoard)
Execution   → 向专家代理派发工作                (输出: 实际工作成果)
Review      → 检查质量和边界合规                (输出: reviewPacket)
Meta-Review → 检查评审标准本身是否有偏差        (输出: meta-review 结果)
Verification → 确认现实与声明匹配                (输出: verificationResult)
Evolution   → 将经验写回系统                    (输出: writebackDecision)
```

### 每阶段的契约（contract）

| # | 阶段 | 目标 | 输入 | 输出（contract） | 可跳过条件 |
|---|------|------|------|----------------|-----------|
| 1 | **Critical** | 防止"用户说 A 你做 B"——锁定真实意图 | 用户原始 prompt | `intentPacket`（结构化意图，含约束、非目标、成功标准） | 极简单的单文件改动可跳过，但**必须显式记录原因**（"skipped because: trivial typo fix"） |
| 2 | **Fetch** | 能力优先：先看现有 skill/agent 能否覆盖 | `intentPacket` | 能力候选列表 + 匹配度 | 没有候选时跳过，进 Thinking 直接定义新能力（但要记） |
| 3 | **Thinking** | 把意图分解到具体责任人 + 交付物 | `intentPacket` + 候选能力 | `dispatchBoard`（含 owner、依赖、时序、产出标准） | 单 agent 单步可简化为内联 dispatch |
| 4 | **Execution** | 真正动手干活，但**仍可治理** | `dispatchBoard` + `workerTaskPacket` | 实际产出（代码 / 文档 / 状态变更） | 不可跳过 |
| 5 | **Review** | 检查代码质量、安全性、合规 | 执行产出 + dispatchBoard 标准 | `reviewPacket`（含 finding、severity、建议） | 只读查询类任务可跳 |
| 6 | **Meta-Review** | 反思评审本身——评审标准会不会跑偏？ | `reviewPacket` + 历史 review 模式 | meta-review 结论（评审是否需要校准） | Review 全 pass 且无新模式时可简化 |
| 7 | **Verification** | 确认"声称的修复"和"真实状态"匹配 | reviewPacket + 实际系统状态 | `verificationResult`（含 reality vs claim 对比） | **不可跳过**——这是 publicDisplay gate 的硬条件 |
| 8 | **Evolution** | 写回经验、更新 memory、调整 agent 边界 | 完整链路所有 contract | `writebackDecision`（决定写哪一层 memory + 是否要调 agent） | 全链路无新洞察时可记 "no writeback this run" |

### 关键设计哲学

**"Nothing is skipped silently."**

每个被跳过的阶段都必须留下显式记录（在哪个 packet 里、为什么）。这条铁律呼应你蓝图 R4：**可观察性优先于自动化**——有"跳过"是可以的，"偷偷跳过"不可以。

> **对比你自己的 personal-harness 蓝图**：
> - 蓝图 §1.Q4 要"实时观察 + 自我进化"——Meta_Kim 的 Evolution 阶段 + Three-Layer Memory 直接对应
> - 蓝图 §3.A6 验证元——Meta_Kim 的 Verification 阶段是它的硬化版（含 gate 机制，不通过不许往下走）
> - 蓝图 §3.B1 evolution-tracker——Meta_Kim 的 Meta-Review + Evolution 是它的成熟版本

---

## §2 十张动态发牌（Dynamic Dealing）

### 为什么要有发牌？

固定的 8 阶段保证底线，但现实任务千变万化。Meta_Kim 用动态发牌补充灵活性——10 张卡牌按触发条件动态打出，叠在 8 阶段骨架之上。

### 10 张牌一览

| # | 卡牌 | 触发条件 | 作用 | 反例（什么时候不该出） |
|---|------|---------|------|---------------------|
| 1 | **Clarify** | intent 模糊度 > 阈值 | 反问用户澄清，不猜 | 当 intent 已经很清楚还问，是浪费 |
| 2 | **Shrink scope** | 任务超出 dispatch 边界 | 把"全栈重构"砍成"先做登录页" | 微小改动用 shrink 是过度治理 |
| 3 | **Options** | 多个合理路径 | 列出 2-3 个方案 + tradeoff | 只有一条路时不应该假装有选择 |
| 4 | **Execute** | dispatchBoard 已就绪 | 真正分派给专家 agent | 边界没定就 execute → 失控 |
| 5 | **Verify** | 执行声称完成 | 拉真实状态比对 | 只读任务无需 verify |
| 6 | **Fix** | review 或 verify 找到问题 | 定向修复，不扩散 | fix 时擅自重构 = 越界 |
| 7 | **Rollback** | fix 三振失败 / 风险升级 | 回到上一个稳定 contract 状态 | 第一次失败就 rollback = 浪费 |
| 8 | **Risk** | 检测到安全 / 不可逆风险 | **抢占当前流程**，强制升级到 sentinel | 把所有警告都当 risk = 噪声 |
| 9 | **Nudge** | 用户行为模式可观察的偏离 | 软提醒（"你最近 3 次跑都跳过了 verify"） | 单次行为就 nudge = 烦 |
| 10 | **Pause** | 连续 3 张高强度牌后 | **强制留白**——不是等用户提醒 | 每次 execute 都 pause = 节奏死 |

### 关键机制：Pause 是被强制的

> "当连续 3 张高强度牌后，系统**强制插入 Pause（留白）**，不是等用户提醒。"

这是 Meta_Kim 一个**反直觉但很重要**的设计：高强度连击会让 agent（和用户）失去判断力，所以系统主动叫停。这跟蓝图 §1.Q4 你担心的"agent 自动化跑飞了用户看不见"是同一个治理问题的两面。

### Risk 牌可以抢占

> "当检测到安全风险，**Risk 牌会抢占**，打断当前流程。"

这不是"提醒"——是**强制中断**。对应到你蓝图的 `evolution-tracker` 设计：议案的"高风险"分支（涉及 SKILL.md 删改、security 风险）也应该有抢占机制，而不只是排队等审。

---

## §3 协议（Contracts）与门（Gates）

### Contract = 结构化产物，不是口头约定

每个流程阶段都对应**具体的协议产物**——不可选，是系统的"事实来源"（source of truth）。

| Contract 名 | 产生阶段 | 关键字段（推断） | 作用 |
|------------|---------|----------------|------|
| `intentPacket` | Critical | original_prompt, locked_intent, constraints, non_goals, success_criteria | 锁定意图防漂移 |
| `dispatchBoard` | Thinking | tasks[], owners, dependencies, timing, deliverable_specs | 把意图分解到责任人 |
| `workerTaskPacket` | Thinking → Execution | task_id, owner_agent, contract_input, expected_output | 单个 agent 的任务单 |
| `reviewPacket` | Review | findings[], severity, suggestions, scope_compliance | 评审产出 |
| `verificationResult` | Verification | claimed_state, real_state, diff, gate_passed | 真实 vs 声称的硬比对 |
| `writebackDecision` | Evolution | memory_layer, content, agent_boundary_change?, no_writeback_reason? | 写哪层、写什么 |

### Gate = 准入条件，不是阶段本身

> "阶段说明你走到哪儿，门说明你配不配往前走。"

最关键的 gate：

#### `publicDisplay` gate（最后堡垒）

不通过 publicDisplay gate 的产物**不能宣称"已完成"**。它的硬条件：

1. ✅ 验证（verification）已通过
2. ✅ 摘要已闭合（summary 不是半吊子）
3. ✅ 交付链未断（每一步都有 contract 链路可追）

任何一条不满足 → gate 拒绝 → agent 不能向用户说"完成了"。

> **对照你蓝图**：这跟你 §3.A6 验证元 + §6.R2 治理元防"假装完成"是同一种思路——把"完成"变成可机械验证的硬条件，而不是 agent 自己说了算。

### Gate 和 Contract 的关系

```
contract → 产物（必出）
gate     → 准入（必过）
阶段     → 流程（可跳，但要记）
```

三者解耦：阶段可以简化（小任务跳过 Meta-Review），contract 可以简化（dispatchBoard 单 agent 时退化为内联），但 **gate 不能简化**——因为它是"完成"的定义。

---

## §4 三层记忆体系

### 设计目标

直指两件事：
1. **大幅降低幻觉**——基于事实回答，不靠 token 上下文猜
2. **大幅减少 token 消耗**——不需要把整个项目塞 prompt

### 三层职责

#### Layer 1：Memory

- **存什么**：Agent 升级决策、能力调整记录、边界更新历史
- **何时读**：每次运行前读取，决定 agent 是否需要调整
- **何时写**：Evolution 阶段的 `writebackDecision` 产出
- **类比**：跟你蓝图 §3.B1 evolution-tracker 写 `_index.jsonl` 议案池是同一个层

#### Layer 2：Graphify（核心创新）

- **存什么**：项目代码的知识图谱
- **触发条件**：源文件 > 20 时自动生成
- **关键指标**：通过子图提取，**最高压缩 71 倍**
- **回答方式**：基于图谱事实回答，不编造
- **类比**：相当于把 codebase 变成可查询的"概念图"，agent 不用重读所有文件就能定位关键点

#### Layer 3：SQL（sqlite-vec 向量索引）

- **存什么**：跨会话的对话内容向量
- **检索方式**：向量级语义相似度
- **核心价值**：跨会话**接力**而非**重复**——上次会话的判断、决策、踩坑可以被这次召回
- **类比**：你 `MEMORY.md` 的工程化版本，但是向量检索而不是手维护索引

### 三层协同

```
新会话开始
  ↓
Layer 1（Memory）→ 读 agent 当前能力 + 历史调整
  ↓
Layer 2（Graphify）→ 读 codebase 知识图谱
  ↓
Layer 3（SQL）→ 检索语义相关的历史会话
  ↓
8 阶段开始执行
  ↓
（执行过程中，三层都在被读 + 写）
  ↓
Evolution 阶段
  ↓
writebackDecision → 决定写哪一层
```

### 平台自动化对比

Meta_Kim 三层记忆**不是绑定 Claude Code**——它在 Codex、OpenClaw、Cursor 上也工作，但具体机制有差异（README 有 "Platform Automation Comparison" 章节）。

> **对你蓝图的启发**：你目前的 `_meta/` + `MEMORY.md` 大致对应 Layer 1 + Layer 3 的人工版。Layer 2（Graphify）是你蓝图里完全没设想的——值得在 M3 之后考虑。

---

## §5 八个 Meta Agent 治理矩阵

Meta_Kim 不是单 agent，是**8 个治理 agent 协同**。每个 agent 拥有一类清晰职责，定义明确的拒绝边界、可独立审查、可替换、可安全回滚——**这正是合法 meta-unit 的 5 个判定标准**。

### 8 个 Agent 一览

| # | Agent | 职责 | 关键能力 | 与你蓝图的对应 |
|---|-------|------|---------|--------------|
| 1 | **meta-warden** | 公共入口 + 协调与综合 | 接受用户 prompt → 触发 8 阶段 → 综合产出 | ≈ 你目前 Claude Code 主线 |
| 2 | **meta-conductor** | 节奏编排 | 控制阶段间转换、Pause 触发 | 蓝图 §1 老金"节奏编排"层 |
| 3 | **meta-genesis** | Persona / 身份 | 定义 agent 的人格、风格、语气边界 | 暂无对应（你 personal-harness 单用户暂不需要） |
| 4 | **meta-artisan** | Skills 管理 | 创建、更新、合规检查 skill | ≈ 你的 evolution-tracker（M2 设计中） |
| 5 | **meta-sentinel** | 安全 / 风险 | Risk 牌的发牌人，拦截不可逆动作 | 蓝图 §6 安全元 |
| 6 | **meta-librarian** | 长期记忆 | 三层 memory 的读写中枢 | ≈ knowledge-curator + 未来 memory-curator |
| 7 | **meta-prism** | 质量 | review / meta-review / verification 链 | 蓝图 §3.A6 验证元的强化版 |
| 8 | **meta-scout** | 外部发现 | 搜外部资源、新 skill、新 agent | 蓝图 §3 没明示，可对应未来"外部能力发现元" |

### 关键设计：Capability-First Dispatch

> "first describe the capability needed → search for who declares ownership → then dispatch the best fit."

这是 Meta_Kim 跟传统 agent 系统的最大架构差异：

| 传统方式 | Meta_Kim |
|---------|----------|
| `Agent({type: "code-reviewer"})` 硬编码名字 | `dispatch({capability: "review-typescript-security"})` |
| 改名字要全局改 | 名字变化不影响 dispatch |
| 看不到能力空间 | 能力声明形成可查询的注册表 |

> **对你 personal-harness 的启发**：你目前 `_meta/findings.md` + 蓝图 §3 的"元目录"思路是 capability 描述的雏形。但要做到 dispatch 级别，需要每个 skill / agent 在 frontmatter 显式声明 `capabilities: [...]`，并有运行时查询机制。这是 M3+ 的事。

### Meta-Unit 的 5 条判定标准

合法的 meta-unit 必须：

1. ✅ 拥有**一类**清晰职责（不混搭）
2. ✅ 明示拒绝边界（"我不做 X"）
3. ✅ 可独立审查（不依赖其他 agent 才能评判它）
4. ✅ 可替换（接口稳定，实现可换）
5. ✅ 安全回滚（有上一稳定状态可退）

> **直接对应蓝图 §1**：你"元 5 特征"（独立 / 足够小 / 边界清晰 / 可替换 / 可复用）跟 Meta_Kim 这 5 条几乎是同构的。验证了你蓝图的判断没跑偏。

---

## §6 跨平台映射（Canonical → Projections）

### 设计原则：单一事实源

```
canonical/                    ← 唯一真相
  ├── agents/*.md            ← 8 个 meta-agent 定义
  ├── skills/meta-theory/    ← 核心 skill
  └── ...

config/contracts/
  └── workflow-contract.json  ← 阶段与契约的形式化定义

   ↓ 通过 npm run meta:sync 投影 ↓

.claude/    .codex/    openclaw/    .cursor/
（运行时 mirror，禁止手改，改了 sync 会覆盖）
```

### 维护纪律

每次改 canonical 后必跑：

```bash
npm run meta:sync               # 同步到四个 runtime
npm run discover:global         # 重建能力注册表
npm run meta:validate           # 完整性校验
```

### 为什么这么设计？

避免 4 个平台漂移——你想想自己 personal-harness 现在的痛：项目级 `.claude/skills/knowledge-curator/` 和全局 `~/.claude/skills/knowledge-curator/` 已经可能 logs 不同步（你 CLAUDE.md 已经标记了这个 TODO）。Meta_Kim 用的就是同一个药方：**单源 + 投影 + 校验**。

> **对你蓝图的启发**：M5 之后如果你的 personal-harness 要多机器同步（家里 PC + 办公笔记本），就需要 canonical 模式。现在单机暂不需要。

---

## §7 与 OpenAI Harness 三部曲的对照

这一节是**学习 Meta_Kim 时最值得深挖的部分**——你已经把三部曲整合到飞书 wiki，对它们烂熟。Meta_Kim 是同一问题的另一个解。

### 总览对比表

| 维度 | OpenAI Harness 三部曲 | Meta_Kim |
|------|---------------------|----------|
| **方法论起源** | 工程团队最佳实践（Thoughtworks 棘轮规则等） | 老金"元思想" + 工程实现 |
| **核心抽象** | 11 个核心组件 + 7 关键设计决策 | 8 阶段骨架 + 10 张牌 + 8 agent |
| **可观测性** | 强调 logs + traces，但实现自由 | 用 contract 强制结构化产物 |
| **可治理性** | 用 evals 硬化 | 用 gate 硬化（更前置） |
| **Memory** | 提及但不展开 | 三层显式：Memory / Graphify / SQL |
| **跨平台** | 不强调 | 显式 canonical → 4 runtime 投影 |
| **开源** | 论文 + 部分代码 | npm 一行可装 |

### 三部曲 11 核心组件 vs Meta_Kim 8 阶段

11 组件不是 1:1 对应到 8 阶段，但有近似映射：

| 11 组件（三部曲） | 对应 Meta_Kim 阶段 |
|------------------|------------------|
| Intent capture | Critical |
| Capability lookup | Fetch |
| Plan / decompose | Thinking |
| Tool call | Execution |
| Quality check | Review |
| Self-critique | Meta-Review |
| Reality grounding | Verification |
| Knowledge update | Evolution |
| Logging | （横切，所有阶段都写） |
| Eval | （隐含在 gate 中） |
| Memory | （Three-Layer Memory 独立子系统） |

### 三部曲 7 关键设计决策 vs Meta_Kim 的 gates

三部曲讲的"决策"是设计阶段的，Meta_Kim 的 gates 是**运行时硬化的设计决策**——这是质的不同。

举例：
- 三部曲说"要有 review 步骤" → 是建议
- Meta_Kim 说"publicDisplay gate 不通过不许出 result" → 是机器强制

### Thoughtworks 棘轮规则 vs Meta_Kim 8 阶段

- 棘轮规则核心：**质量门只允许向上不允许回退**
- Meta_Kim 8 阶段没有显式"棘轮"——但 gate 机制 + Verification 的硬验证是它的等价物
- **差异**：棘轮规则关注"长时间维度的质量演化"，Meta_Kim gate 关注"单次任务的强制完整性"

### 关键启发：你 personal-harness 应该选哪条路？

| 你的现状 | 推荐方向 |
|---------|---------|
| 单用户、迭代中、还在 M1 | 三部曲思路足够，不需要 Meta_Kim 的复杂度 |
| M3+ 之后多 skill、多 agent 协同 | 借 Meta_Kim 的 contract + gate 机制硬化 |
| 想做"自动派发到合适 agent" | 必学 Meta_Kim 的 capability-first dispatch |
| 想做"跨会话连续学习" | 必看 Meta_Kim 的 Three-Layer Memory（尤其 Layer 2 Graphify） |

---

## §8 安装与命令速查

### 一行安装（推荐）

```bash
npx --yes github:KimYx0207/Meta_Kim meta-kim
```

### 传统安装

```bash
git clone https://github.com/KimYx0207/Meta_Kim.git
cd Meta_Kim
npm install
node setup.mjs
```

### 核心运维命令

| 命令 | 何时用 |
|------|-------|
| `npm run meta:sync` | 改了 canonical/ 后立刻跑，否则各 runtime 漂移 |
| `npm run meta:validate` | 仓库完整性检查（contracts、agents 是否齐） |
| `npm run meta:doctor:governance` | 治理健康检查（gate / contract 是否被绕过） |
| `npm run discover:global` | 重建能力注册表（capability-first dispatch 的索引） |

### 四个支持的 runtime

- **Claude Code**（首选，能力最完整）
- **Codex**
- **OpenClaw**
- **Cursor**

---

## §9 我的批注 / 启发对 personal-harness

> ⚠️ **此节为用户主权区**——以下 placeholder 待Alex手动填，knowledge-curator 不代写。

### 9.1 直接可借鉴到 personal-harness 的设计（待填）

- [ ] capability-first dispatch 在 evolution-tracker M3 议案池阶段的应用
- [ ] gate 机制硬化"完成"定义——publicDisplay gate 是否要在 personal-harness 接入飞书前作为强制检查
- [ ] Three-Layer Memory 的 Layer 2 Graphify 对 codebase 大于 20 文件的 skill 是否值得做

### 9.2 暂不学的部分（待填）

- [ ] 8 agent 体系——单用户 personal-harness 暂用不上 meta-genesis、meta-scout
- [ ] canonical → 4 runtime 投影——单机暂无多 IDE 同步需求

### 9.3 对蓝图 §3.B1 evolution-tracker 的具体修订（待填）

- [ ] 议案 contract 字段对齐 Meta_Kim 的 `writebackDecision` 结构
- [ ] failure mode "议案被反复拒"的处理——参考 Meta_Kim 的 Risk 牌抢占机制

---

## 来源

- **GitHub 主页**：<https://github.com/KimYx0207/Meta_Kim>
- **README.md**（英文）：<https://raw.githubusercontent.com/KimYx0207/Meta_Kim/main/README.md>
- **README.zh-CN.md**（中文）：<https://raw.githubusercontent.com/KimYx0207/Meta_Kim/main/README.zh-CN.md>
- **CLAUDE.md**（Claude Code 集成指令）：<https://raw.githubusercontent.com/KimYx0207/Meta_Kim/main/CLAUDE.md>
- **AGENTS.md**（Codex 集成指令）：<https://raw.githubusercontent.com/KimYx0207/Meta_Kim/main/AGENTS.md>
- **方法论论文**：<https://zenodo.org/records/18957649>（DOI: 10.5281/zenodo.18957649）
- **作者**：KimYx0207（GitHub / X / aiking.dev / 公众号"老金带你玩 AI"）

### 学习参照（已有飞书材料）

- **理论原典**：waytoagi 老金《元：从混沌许愿到系统治理》<https://waytoagi.feishu.cn/wiki/KGbewcwM1ic0kFk2A58cL8OanFh>
- **工程视角参照**：[AI学习] Harness Engineering 完整学习指南（Vol.1+2+3 合集）<https://www.feishu.cn/wiki/UtW0wUbPbifCX4kk3ypcGcyinGg>

---

> 🤖 本文档由 `knowledge-curator` skill 于 2026-4-29 自动整理（M1.5 第 2 次跑），后续 §9 用户主权区由Alex手动迭代。
