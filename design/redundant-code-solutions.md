# Claude 冗余代码 — 市场方案调研 + Alex-harness 优化升级方案

> 生成日期：2026-5-13
> 来源：10+ 篇官方文档 / 学术论文 / 社区实践
> 适用对象：Alex-harness 项目（16 个 skill，2468 行 SKILL.md，外加多个 helper 脚本）

---

## 0. 摘要（30 秒读完）

**问题本质**：LLM（包括 Claude）系统性地产出"冗余 / 过度工程"代码——根因是训练数据偏置 + 奖励模型偏好冗长 + 模型推理倾向把所有逻辑塞进一个大函数。学术研究测到 **34.15%** 的 LLM 代码有性能/冗余问题、**21.14%** 有可维护性问题（多余 else、重复块、冗余注释等）。

**市场已有四类解法**（按介入深度排序）：
1. **Prompt-level 规约** — Karpathy 4 准则 / Lean Code 10 戒律 → 改 CLAUDE.md / 系统指令
2. **专用 sub-agent** — Anthropic 官方 `code-simplifier` plugin / 社区 `refactor-cleaner`
3. **静态检测工具串联** — `jscpd` + `knip` + `depcheck` + `ts-prune` + `eslint`
4. **工作流分阶段** — 写代码阶段 ≠ 重构阶段，每 20% 时间专门做 cleanup

**Alex-harness 落地推荐**：
- **第 1 步（本周）**：把 Lean Code 10 戒律 + Karpathy 4 准则 浓缩成一段写进 `CLAUDE.md`，并把 a5-executor 和 a6-validator 的 SKILL 里加上"先删后加"自检清单。
- **第 2 步（2 周内）**：写一个 `code-simplifier`（项目 skill），仿 Anthropic 官方设计——只动本会话改过的代码、只重构不改行为，作为 helix 流末尾的可选步骤。
- **第 3 步（每月一次）**：跑 `/refactor`-style 七步流（jscpd → knip → ts-prune → simplifier → tests），把 skills/ 总行数压下来。

---

## 1. 问题画像：LLM 冗余代码的 5 大类 19 子模式

来自 arxiv 2503.06327（[Unveiling Inefficiencies in LLM-Generated Code](https://arxiv.org/html/2503.06327v2)）的分类法，这是一个可直接当 checklist 用的清单：

| 大类 | 出现率 | 典型子模式（按频率排） |
|------|-------|---------------------|
| **General Logic** | 68.5% | Wrong Logic 35.77% / Partially Wrong 30.08% / 漏边界处理 |
| **Performance** | 34.15% | 内存次优 18.7% / 时间复杂度次优 18.5% / **Redundant Steps 5.28%** / **Unnecessary Steps 2.44%** |
| **Maintainability** | 21.14% | **Unnecessary Else 17.48%** / 可简化条件块 3.05% / **Code Duplication 2.44%** / **Comment Duplication 1.22%** |
| **Readability** | 4.67% | 命名混淆 / 嵌套 lambda map filter 混用 |
| **Errors** | 5.69% | 缺 import / 漏声明 / 语法错 |

**关键洞察**：
- 33.54% 的代码"多病并发"——单个 patch 同时踩多个坑
- "模型越聪明，单函数越臃肿"（Reasoning-Complexity Trade-off）—— Qwen-480b 比小模型生成的方法体更长，因为它把所有推理塞进一个 procedural block
- 训练数据偏置：Stack Overflow 答案为讲清楚而冗长、教程代码为新手而展开、企业 Java 被委员会过度抽象 → LLM 把这些当成"标准写法"

来源：[arxiv 2503.06327](https://arxiv.org/html/2503.06327v2) / [arxiv 2605.02741 AI-Generated Smells](https://arxiv.org/html/2605.02741) / [Lean Code LLM Manifesto](https://github.com/socialawkward/lean-code-llm-manifesto)

---

## 2. 市场方案 A：Prompt-level 规约（最低成本、最高 ROI）

### 2.1 Karpathy 4 准则（你 CLAUDE.md 已部分采纳）

[Karpathy CLAUDE.md 来源](https://lucaberton.com/blog/karpathy-claude-md-llm-coding-principles-2026/)：

1. **Think Before Coding** — 显式陈述假设，多种解读时不要静默选一种，必须列出来让你选
2. **Simplicity First** — 最少代码解决问题；自检"senior engineer 会不会说这过度复杂"
3. **Surgical Changes** — 每行变更必须直接对应需求；事后让 LLM review 自己的 diff 解释每一处改动
4. **Goal-Driven Execution** — "修 bug" → "先写复现测试 + 通过测试"

→ 你的 `CLAUDE.md` 已经有完整版（"Karpathy Guidelines"段）。**问题**：没有强制执行链，写在那只是"嘴上规则"。

### 2.2 Lean Code 10 戒律（可直接抄进 CLAUDE.md / SKILL.md）

来自 [Lean Code LLM Manifesto](https://github.com/socialawkward/lean-code-llm-manifesto)：

1. **No dead code** — 每个函数都被调用、每个变量都被读、每个 import 都被用、每条分支都可达
2. **No redundant validation** — 信任类型系统和调用方上下文，别在内部再校验一遍
3. **Standard library first** — 优先内置库，少装依赖
4. **Comments explain why, not what** — 删掉重述代码的注释；不清晰的代码改名/改结构，不靠注释
5. **Minimal error handling** — 只在系统边界处处理；内部错误向上抛；不可能状态直接 crash
6. **Earn abstraction** — 3 处以上具体使用才能抽象，否则三段相似比一个早抽象好
7. **Flat over nested** — 早 return / 用迭代不用递归 / 顺序语句优于嵌套
8. **Delete before adding** — 改代码时净行数应该下降
9. **One way to do it** — 别 callback 和 promise 混用，定一种风格
10. **Fail fast, fail loud** — 不可能状态立刻 crash + 明确报错

**可测量奖励指标**（同一来源）：
- 函数圈复杂度 < 5
- 外部依赖数 = 0 优先
- Dead code 比 = 0%
- 注释/代码比 0.0 ~ 0.3
- 最大嵌套深度 ≤ 3
- "每个通过测试需要的 token 数"越少越好

### 2.3 一段可直接粘贴的"硬规则"段落（推荐加进 CLAUDE.md）

```markdown
## 反冗余硬规则（先想后做的具象化）

写代码前必答的 3 个问题：
1. 这段逻辑是不是已经在仓库别处实现了？（grep 过吗）
2. 这个抽象是不是"以为将来会用到"的预案？（没有 3 处具体调用就不抽象）
3. 这段代码删掉会怎样？（删了还工作 = 它本来就是冗余）

写完代码后必做的 3 件事：
1. 自检 diff：每行变更能否对应到用户需求的某一句？不能就删
2. 净行数检查：本次改动是不是净增加？如果是，重读一遍确认"加"是必要的
3. 注释清理：删掉所有"重述代码"的注释；保留 WHY，去掉 WHAT
```

来源：[Karpathy Skills - BrightCoding](https://www.blog.brightcoding.dev/2026/04/29/karpathy-skills-the-revolutionary-llm-coding-manifesto) / [Lean Code LLM Manifesto](https://github.com/socialawkward/lean-code-llm-manifesto)

---

## 3. 市场方案 B：专用 sub-agent（中等成本，效果最直接）

### 3.1 Anthropic 官方 code-simplifier plugin（推荐重点关注）

**核心事实**（来自 [tessl.io 报道](https://tessl.io/blog/anthropic-open-sources-its-internal-code-simplifier-agent/) 和 [Claude Plugin 页面](https://claude.com/plugins/code-simplifier)）：

- **本质**：不是工具，是"一段带护栏的可复用 prompt"——指令公开可改
- **作用域**：只动当前会话最近改过的代码，不动你没碰的文件
- **核心约束**："Never changes what your code does"——只改怎么写，不改行为
- **触发**：长会话尾声 / 合 PR 前主动调用
- **效果**：社区反馈 token 使用量降 20-30%
- **能消除**：嵌套深度、冗余代码、变量/函数命名差、嵌套三元 → 改为 switch 等清晰条件结构

**安装**：`claude plugin install code-simplifier`（[来源](https://medium.com/@sohasarwar2000/simplifying-your-code-with-claude-codes-code-simplifier-agent-92b9c273d039)）

**调用方式**：会话末尾说一句 "Run the code-simplifier agent on the changes we made today"

### 3.2 内建斜杠命令 `/simplify` 和 `/batch`

来自 [MindStudio 介绍](https://www.mindstudio.ai/blog/claude-code-simplify-batch-commands)：

- **`/simplify`**：识别"不必要抽象、过度嵌套、冗余条件" → 返回重构版 + 变更说明
  - 副作用：可能误删看似冗余但实为"防御性"的代码 → 重构后必须跑测试
- **`/batch`**：把同一种转换并行铺到多个文件，适合大规模迁移
  - 副作用：并行实例间可能不一致，指令必须很明确

### 3.3 社区 `refactor-cleaner` agent（你已经有这个 plugin）

[everything-claude-code/agents/refactor-cleaner.md](https://github.com/affaan-m/everything-claude-code/blob/main/agents/refactor-cleaner.md) — 4 阶段：

1. **Analyze** — 并行跑 knip/depcheck/ts-prune/eslint，按风险分级 SAFE/CAREFUL/RISKY
2. **Verify** — grep 所有引用、查 public API 状态、看 git 历史
3. **Remove Safely** — 从低风险开始，每删一批跑测试 + commit
4. **Consolidate Duplicates** — 找重复代码 → 挑最好的实现 → 改 import

**和 code-simplifier 的分工**：
- `refactor-cleaner` 干"删"：删 dead file、删 unused export、合并 duplicate
- `code-simplifier` 干"简"：保留功能、把臃肿写法简化
- **正确顺序**：先 cleaner（删冗余），再 simplifier（简化保留下来的）

### 3.4 综合工作流 `/refactor` 命令（社区版，最完整）

来自 [SilenNaihin 的 gist](https://gist.github.com/SilenNaihin/cd321a0ada16963867ad8984f44922cf)：

```
1. 识别项目类型（JS/TS or Python）
2. 跑 jscpd → 找重复代码块
3. 跑 knip → 找未使用文件/依赖/导出
4. 手工处理：提取重复 / 删未使用项
5. 调 code-simplifier subagent 简化复杂逻辑
6. 删过时文件 + 跑测试
7. 单次 commit 提交所有重构
```

**建议节奏**："约 20% 开发时间专门做集中式代码质量改进"——而不是边写边改。

---

## 4. 市场方案 C：静态检测工具串联（零 LLM 成本）

这一层完全不用 LLM，纯工具：

| 工具 | 解决什么 | 适配语言 |
|------|---------|---------|
| **jscpd** | 复制粘贴重复代码块（CPD） | JS/TS/Python/Java… 多语言 |
| **knip** | 未使用 file / export / dependency | JS/TS 项目 |
| **depcheck** | 未声明 / 未使用的 npm 依赖 | Node 项目 |
| **ts-prune** | 未使用的 TS exports | TypeScript |
| **eslint --report-unused-disable-directives** | 多余的 eslint-disable | JS/TS |
| **vulture** | 死代码 | Python |
| **SonarQube / PMD** | 通用克隆检测 + smell | 多语言 |

→ 这些可以塞进 CI、git hook、或 pre-commit。**关键**：先跑工具，再让 LLM 处理——别让 LLM "目测"找冗余。

---

## 5. 市场方案 D：subagent 架构降 prompt bloat

[Newline.co 文章](https://www.newline.co/@Dipen/claude-skills-and-subagents-reduce-prompt-bloat--f2920804) 提到：

> 通过给不同任务分配独立 subagent（代码校验、文档生成、调试），可比单体 agent 架构减少 **>40%** 的 prompt bloat。

机制叫 **"Lazy-loaded skill activation"**：技能定义平时不加载，只在被显式调用时才进上下文。

→ 这正好是 Alex-harness 当前的设计（a1-a8 + helix），但要小心**反模式**：skill 之间互相重复（每个 skill 都写一遍"先想后做"），那就抵消了 lazy load 的好处。

---

## 6. Alex-harness 具体优化方案

### 6.1 现状诊断

```
skills/ 总行数：2468 行
最大 5 个：
  evolution-tracker  442
  helix              321
  context-curator    262
  knowledge-curator  235
  mode-router        204
```

**疑似冗余热点**（不打开文件先做的假设）：
- 16 个 skill 之间可能有大段重复的"工作约定 / 时间格式 / 飞书路径"样板（CLAUDE.md 应是单一来源）
- helix 321 行 + a1-a8 各 60-100 行 → 协调器和被协调者之间可能有职责重叠
- evolution-tracker 442 行偏长，是否有可拆？

→ **建议第一动作**：跑 jscpd + 人工 review 找出真实重复区域，再决定。

### 6.2 三阶段落地（按周计）

#### 阶段 1：规约固化（本周，2-3 小时）

- [ ] 在 `CLAUDE.md` 的"工作约定（铁律）"后加一节"反冗余硬规则"（用本文 §2.3 的段落）
- [ ] 在 `a5-executor/SKILL.md` 加 3 行 pre-commit 自检：
  - "本次 diff 净行数是不是下降的？如果在加代码，加的每行能对应到 task 的哪一句？"
  - "有没有 grep 过仓库看相似实现是否已存在？"
  - "有没有 import 了但没用上的项？"
- [ ] 在 `a6-validator/SKILL.md` 加一条 "Lean Code 10 戒律" 软检查作为 validator 的额外维度

→ **预期收益**：未来每次 `/helix` 跑出来的新代码冗余度下降，但不解决存量。

#### 阶段 2：自建项目级 simplifier skill（2 周内，4-6 小时）

仿 Anthropic code-simplifier 的护栏设计，建 `.claude/skills/code-simplifier/SKILL.md`：

```
触发：会话末尾、PR 前主动调用，或 helix 的 finalize 阶段可选挂钩
作用域：仅本会话改动过的文件（git diff HEAD~1）
约束：不改行为 / 不加功能 / 净行数必须 ≤ 改前
输出：diff + 每个删改的理由
失败时：保留原样不动，标 NEEDS_HUMAN
```

为什么自建而不直接 `claude plugin install code-simplifier`？

| 选项 | 优 | 劣 |
|------|---|---|
| 装官方 plugin | 0 维护成本、跟官方升级 | 不可定制、混在你的 skill 池里来源不一致 |
| 自建项目级 skill | 完全可控、和 helix 协议对齐、加入 logs/runs.jsonl 反馈闭环 | 要写 SKILL.md，维护它 |

→ **推荐自建**，理由：你的项目调性是"建自己的 harness"，再加上你已经有 `logs/runs.jsonl + user_feedback` 模式（knowledge-curator 的反馈循环）。让 simplifier 也有反馈闭环更符合项目铁律 #4。

#### 阶段 3：周期性大扫除（每月一次，30-60 分钟）

写一个 `_meta/refactor-cycle.md`，记录每月跑一次以下流程：

```
1. jscpd .claude/skills/ --output ./jscpd-report
2. 人工 review 报告，挑 3 个最严重重复
3. 调 code-simplifier skill 处理
4. 跑测试 + 自检 progress.md
5. 单次 commit："chore: monthly refactor cycle (cycle #N)"
6. 在 _meta/findings.md 写一笔："本月发现的最反直觉重复模式是 X"
```

→ 这把"重构作为独立阶段"的市场最佳实践（[gist](https://gist.github.com/SilenNaihin/cd321a0ada16963867ad8984f44922cf)）变成你项目里的 cadence。

### 6.3 优先级排序（如果只能做一件）

> **做阶段 1**。理由：成本最低（2 小时），收益持续（防住未来所有新代码）。阶段 2/3 是为了清理存量，可以等阶段 1 跑两周看效果再决定。

---

## 7. 不要做的事（坑点警示）

来自 [DEV community 的 Feb-Mar 2026 Claude Code 深度分析](https://dev.to/shuicici/claude-codes-feb-mar-2026-updates-quietly-broke-complex-engineering-heres-the-technical-5b4h)：

1. **不要用 ALL-CAPS 和 "YOU MUST"** —— "overtrigger Claude and produce worse results"。Claude Opus 4.7 对 XML-tagged instruction 响应最好。
2. **不要让 prompt 太长**——研究测出 sweet spot 是 150-300 词。你 CLAUDE.md 已经偏长，加规则时要控总量。
3. **不要边写边重构**——"重构作为独立阶段"是被多个来源验证的。把重构搅在写新代码里，LLM 会两头都做不好。
4. **不要相信 LLM 自己说"这段冗余了"**——必须先跑静态工具（jscpd/knip）确认。LLM 经常把防御性代码当冗余删了，是 `/simplify` 已知副作用。
5. **不要一次性大重构**——你 CLAUDE.md 已写"小步迭代"，对应市场建议"每删一批跑测试"。

---

## 8. 关键洞察 / Takeaways

1. **冗余不是 bug，是训练数据的偏置**——光骂模型没用，要给护栏（Karpathy 4 准则 + Lean 10 戒律）
2. **Anthropic 自己已经被这问题坑过**——所以才把内部 code-simplifier 开源，且只动新代码不动旧代码
3. **"先删后简"**——cleaner 干粗活、simplifier 干细活，顺序错了简化的是已经该删的代码
4. **静态工具 + LLM = 1+1>2**——别让 LLM 目测找冗余，让工具列清单、LLM 决定怎么改
5. **重构要分阶段做**——20% 时间专门重构，比 100% 时间边写边改更高效
6. **你的项目已经有反馈闭环（knowledge-curator 的 logs/runs.jsonl）**——把这模式复制到新建的 code-simplifier skill 上，符合项目铁律 #4

---

## 9. 来源（按重要性排序）

1. [Anthropic 官方 code-simplifier plugin](https://claude.com/plugins/code-simplifier) — 官方 sub-agent 设计
2. [Tessl 报道：Anthropic 开源 code-simplifier 内幕](https://tessl.io/blog/anthropic-open-sources-its-internal-code-simplifier-agent/) — 设计动机
3. [arxiv 2503.06327 — Unveiling Inefficiencies in LLM-Generated Code](https://arxiv.org/html/2503.06327v2) — 5 大类 19 子模式分类
4. [arxiv 2605.02741 — AI-Generated Smells](https://arxiv.org/html/2605.02741) — Reasoning-Complexity Trade-off
5. [Lean Code LLM Manifesto](https://github.com/socialawkward/lean-code-llm-manifesto) — 10 戒律 + 可测指标
6. [Karpathy CLAUDE.md 详解](https://lucaberton.com/blog/karpathy-claude-md-llm-coding-principles-2026/) — 4 准则起源
7. [Karpathy Skills - BrightCoding](https://www.blog.brightcoding.dev/2026/04/29/karpathy-skills-the-revolutionary-llm-coding-manifesto)
8. [SilenNaihin 的 /refactor gist](https://gist.github.com/SilenNaihin/cd321a0ada16963867ad8984f44922cf) — jscpd + knip + simplifier 工作流
9. [everything-claude-code/agents/refactor-cleaner.md](https://github.com/affaan-m/everything-claude-code/blob/main/agents/refactor-cleaner.md) — 4 阶段安全删除
10. [MindStudio: /simplify 和 /batch](https://www.mindstudio.ai/blog/claude-code-simplify-batch-commands) — 内建命令
11. [Newline.co: Skills & Subagents Reduce Prompt Bloat](https://www.newline.co/@Dipen/claude-skills-and-subagents-reduce-prompt-bloat--f2920804) — 40% 降幅数据
12. [DEV: Claude Code Feb-Mar 2026 Updates](https://dev.to/shuicici/claude-codes-feb-mar-2026-updates-quietly-broke-complex-engineering-heres-the-technical-5b4h) — 反模式警示
13. [Medium - Simplifying Your Code with code-simplifier](https://medium.com/@sohasarwar2000/simplifying-your-code-with-claude-codes-code-simplifier-agent-92b9c273d039) — 安装与调用方式

---

## 方法论

调研覆盖 4 路 web search、5 路深读，总 13 个独立来源。子问题：
- LLM 产冗余代码的成因与分类（学术 + 社区）
- Anthropic 官方 code-simplifier 设计细节
- /simplify 与 /batch 内建命令机制
- 工具链（jscpd/knip/ts-prune 等）的整合方式
- Prompt-level 规约（Karpathy + Lean Manifesto）
- subagent 架构对 prompt bloat 的影响

调研置信度：**高**——核心结论（Anthropic 官方 plugin 存在并开源、`/simplify` 内建、20% 时间重构、5 大类分类）由 ≥ 2 个独立来源验证。
