# Alex-harness

> Alex 的私人 SDLC Agent Harness —— 基于 OpenAI Harness Engineering 三部曲 + 元思想，让 Claude 在编程协作中更可控、可观测、可自我进化。

## 核心思想

引自元思想四层模型：

```
元（思想/意图）
  ↓
组织镜像（将现实结构映射成 AI 可处理的数据）
  ↓
节奏编排（Task → Plan → Execute → Validate 的循环节拍）
  ↓
意图放大（最小输入，撬动最大产出）
```

本项目将这四层具象化为：

| 层 | 对应组件 | 职责 |
|----|---------|------|
| 元层 | helix + A8 风险守卫 | 意图保真 + 安全边界 |
| 组织镜像层 | A1 + A2 + A3 | 把现实映射成可处理结构 |
| 节奏编排层 | A4 → A5 → A6 | SDLC 执行节拍 |
| 意图放大层 | A7 + mode-router + context-curator | 最小输入产生最大产出 |

## 安装

### 方式一：插件安装（推荐）

在 Claude Code 中执行 ：

```
/plugin marketplace add Alex-nx-netizen/Alex-harness
```

安装后在任意项目目录下，所有 skill 命令（`/helix`、`/a1-task-understander` 等）即可使用。

### 方式二：克隆到项目目录

```bash
git clone https://github.com/Alex-nx-netizen/Alex-harness.git
cd Alex-harness
```

用 Claude Code 打开此目录，`.claude/skills/` 下的所有 skill 自动加载。

## 快速上手

### 统一入口：/helix

`/helix` 是 harness 的指挥官，自动编排 A1-A8 全部业务元：

```
/helix 帮我给这个项目加用户认证模块
/helix 修复 src/api/payment.ts 里的并发 bug
/helix 解释 _meta/task_plan.md 里的任务计划
```

你只需一句话描述目标，helix 负责：理解任务 → 感知仓库 → 规划方案 → 等你确认 → 执行 → 校验 → 生成 commit message。

### 单独调用业务元

```
/a1-task-understander 加一个用户登录功能
/a2-repo-sensor
/a3-retriever auth middleware
/a4-planner
/a5-executor
/a6-validator
/a7-explainer
/a8-risk-guard git reset --hard HEAD~3
```

### 治理层工具

```
/context-curator       # 压缩上下文，跨会话保持 Claude 连贯
/mode-router 任务描述  # 推荐 solo / solo+tools / team 路由
/evolution-tracker     # runs.jsonl → L2 复盘 → 改进议案
/knowledge-curator     # 整理资料 → 飞书 wiki
```

`session-reporter` 在每次会话结束时由 Stop hook 自动触发，无需手动调用。

## 架构

```
用户: /helix <一句话>
          │
          ▼
    ┌─────────────┐
    │    helix    │  统一入口，SDLC 编排者
    └──────┬──────┘
           │
    ┌──────▼──────────────────────────────────┐
    │              业务层 (A1-A8)              │
    │                                          │
    │  A1 任务理解  ←─────  A2 仓库感知        │
    │       ↓                    ↓             │
    │       └──────→  A3 检索 ←─┘             │
    │                    ↓                     │
    │             A4 方案规划                  │
    │                    ↓                     │
    │             用户确认（关键决策点）         │
    │                    ↓                     │
    │  A8 风险守卫 ←─  A5 执行（检测破坏性操作）│
    │                    ↓                     │
    │             A6 校验（测试/lint/typecheck） │
    │                    ↓                     │
    │             A7 说明（commit/PR 描述）      │
    └──────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │              治理层                      │
    │  context-curator  │  session-reporter   │
    │  evolution-tracker │  mode-router       │
    │  knowledge-curator                      │
    └──────────────────────────────────────────┘
```

## Skills 全览

### 业务元（SDLC 执行链）

| Skill | 职责 | 输出 | 调用方式 |
|-------|------|------|---------|
| `helix` | 统一入口，编排 A1-A8 完整 SDLC | 自然语言交互 | `/helix <任务>` |
| `a1-task-understander` | 解析任务意图 → TaskCard | `{title, type, scope, done_criteria, risk_signals}` | `/a1-task-understander <描述>` |
| `a2-repo-sensor` | 扫描仓库结构、技术栈、脏文件 | RepoContext JSON | `/a2-repo-sensor` |
| `a3-retriever` | 关键词 + 语义代码检索 | SearchResult[] | `/a3-retriever <查询>` |
| `a4-planner` | 生成 2-3 个方案 + 最优推荐 | PlanDoc（含文件列表、步骤数、风险） | `/a4-planner` |
| `a5-executor` | 逐文件执行，最小化改动 | ✅/❌ 逐步反馈 | `/a5-executor` |
| `a6-validator` | 自动检测项目类型运行测试/lint | ValidationReport | `/a6-validator` |
| `a7-explainer` | 生成 commit message / PR 描述 | 英文 commit（≤72 字符）+ 中文 PR desc | `/a7-explainer` |
| `a8-risk-guard` | 破坏性操作前强制风险评估 | 🔴/🟡/🟢 分级处置 | 自动注入 / `/a8-risk-guard <操作>` |

### 治理层（可观测性 + 自我进化）

| Skill | 职责 | 调用方式 |
|-------|------|---------|
| `session-reporter` | 会话结束自动推飞书成长日志 Base | Stop hook 全自动 |
| `mode-router` | 分析任务信号，推荐执行路由 | Claude 自动 / `/mode-router <描述>` |
| `context-curator` | 跨会话上下文压缩，保持 Claude 连贯 | `/context-curator` |
| `evolution-tracker` | runs.jsonl → L2 复盘 → 具体改进议案 | `/evolution-tracker` |
| `knowledge-curator` | 整理飞书/网页资料 → 飞书 wiki | `/knowledge-curator` |

## 设计原则

**最小输入，最大产出**：一句话触发 `/helix`，完整 SDLC 自动编排，无需手动串联各环节。

**强制安全边界**：A8 在任何破坏性操作（`git reset --hard`、`rm -rf`、`DROP TABLE`、同时改超 10 个文件）前强制评估，不可被催促降级。

**可观测、可追溯**：每个 skill 输出结构化数据，`session-reporter` 自动持久化到飞书，`evolution-tracker` 读取历史数据出改进建议。

**最小变更**：A5 执行时只改必须改的，不做未请求的重构或抽象。

**先想后做**：A4 出方案后，`helix` 在 Step 6 强制等用户确认再执行，不自作主张。

## 项目结构

```
Alex-harness/
├── .claude/
│   ├── skills/
│   │   ├── helix/                    # 统一入口
│   │   ├── a1-task-understander/     # 任务理解元
│   │   ├── a2-repo-sensor/           # 仓库感知元（含 run.cjs）
│   │   ├── a3-retriever/             # 检索元
│   │   ├── a4-planner/               # 方案元
│   │   ├── a5-executor/              # 执行元
│   │   ├── a6-validator/             # 校验元（含 run.cjs）
│   │   ├── a7-explainer/             # 说明元
│   │   ├── a8-risk-guard/            # 风险守卫元
│   │   ├── session-reporter/         # 会话日志（含 run.cjs）
│   │   ├── mode-router/              # 路由决策（含 run.cjs）
│   │   ├── context-curator/          # 上下文压缩
│   │   ├── evolution-tracker/        # 自我进化
│   │   └── knowledge-curator/        # 知识整理
│   └── settings.local.json           # 本地 Bash 权限（node + lark-cli）
├── .claude-plugin/
│   └── marketplace.json              # Claude Code 插件清单
├── design/                           # 设计文档（用户主权区）
├── _meta/                            # 任务追踪 + 执行日志 + 踩坑记录
├── CLAUDE.md                         # 项目级 Claude 指令
└── README.md
```

## 里程碑

| 版本 | 目标 | 状态 |
|------|------|------|
| M1 | knowledge-curator 反馈闭环 | ✅ 2026-4-29 |
| M2 | evolution-tracker v0.1 | ✅ 2026-4-29 |
| M3 | context-curator v0.1 | ✅ 2026-4-30 |
| M4 | mode-router + session-reporter | ✅ 2026-5-1 |
| v0.2 | A1-A8 业务元 + helix + 插件化 | ✅ 2026-5-1 |
| M5 | 真实项目验证 + 自我进化闭环 | 🔲 进行中 |

## 参考资料

- [Harness Engineering 三部曲（飞书合集）](https://www.feishu.cn/wiki/UtW0wUbPbifCX4kk3ypcGcyinGg)
- [元思想](https://waytoagi.feishu.cn/wiki/KGbewcwM1ic0kFk2A58cL8OanFh)
- [飞书成长日志 Base](https://my.feishu.cn/base/Se8obIsyTa5SmfsOMK8cA9d3nNc)
