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
