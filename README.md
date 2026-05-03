# Alex-harness

> Alex 的私人 SDLC Agent Harness —— 基于 OpenAI Harness Engineering 三部曲 + 元思想，让 Claude 在编程协作中更可控、可观测、可自我进化。
>
> **当前版本：v0.7.0**（2026-5-4）

---

## v0.7 亮点

核心思路 —— **层级 + 独立评审是真正的胜负手，单纯并行 agent 效应有限** —— v0.7 把这条洞落地为机器化契约：

- 🛡 **Embedded meta-audit phase** —— 在 a6 之后、finalize 之前，独立 subagent（code-reviewer + security-reviewer）独立审，输出 `correctness/security/maintainability/alignment_with_plan` 4 维 0-5 分
- 📊 **a6-validator 4 维评分** —— `accuracy/completeness/actionability/format` 0-5 分；helix-runs.jsonl 自动多带 score 字段，evolution-tracker 长期分析
- 👥 **Manager-Worker 二层 team_plan** —— `mode-router score≥6` 时输出含 `subordinates[]` 的二层结构（论文 §6①）
- 🧬 **_meta/SOUL.md 长期记忆** —— evolution-tracker `--promote-soul` 把高频议案沉淀为跨 run 稳定行为规则（论文 §6③）
- ⏰ **HEARTBEAT cron** —— `hooks/cron-heartbeat.cjs` 每天写当日摘要到 `_meta/heartbeat.log`（论文 §6⑦）
- 🔧 **Phase 链由 a4 动态决定** —— research/design 跳 a5/a6/a7，feature/bugfix 跑全 phase（论文 §6⑤）
- 📁 **Dashboard Sessions 视图** —— 17+ 历史 Claude 会话按 session_id 分类钻取，每个会话显示工具柱状图 + helix 运行 + 散落事件
- 📅 **Heatmap** —— 14 天 × 24 小时调用密度热力图
- 🔄 **helix-runs.jsonl 月度轮转** + **E2E fixture 回归** + **mode-router config 外置**

完整变更见 `_meta/progress.md` 会话 27 + `_meta/reviews/v0.7.0-feishu-report.md`。

---

## 核心思想

引自元思想四层模型：

```
元（思想/意图）
  ↓
组织镜像（将现实结构映射成 AI 可处理的数据）
  ↓
节奏编排（Task → Plan → Execute → Validate → Audit 的循环节拍）
  ↓
意图放大（最小输入，撬动最大产出）
```

本项目将这四层具象化为：

| 层 | 对应组件 | 职责 |
|----|---------|------|
| 元层 | helix + a8-risk-guard + meta-audit | 意图保真 + 安全边界 + 独立审 |
| 组织镜像层 | a1 + a2 + a3 | 把现实映射成可处理结构 |
| 节奏编排层 | a4 → a5 → a6 → meta-audit → a7 | SDLC 执行节拍 |
| 意图放大层 | mode-router + context-curator + evolution-tracker | 最小输入产生最大产出 |

---

## 安装

### 方式一：插件安装（推荐）

```
/plugin marketplace add Alex-nx-netizen/Alex-harness
/plugin install alex-harness@Alex-nx-netizen/Alex-harness
```

安装后 **唯一暴露 `/helix` 入口**，13 个下属 skill 不再单独可见，统一从 helix 派下去。

### 方式二：克隆到项目

```bash
git clone https://github.com/Alex-nx-netizen/Alex-harness.git
cd Alex-harness
# 用 Claude Code 打开此目录，skills/ 下自动加载
```

---

## 快速上手

### 唯一入口：/helix

```
/helix 帮我给这个项目加用户认证模块
/helix 修复 src/api/payment.ts 里的并发 bug
/helix 解释 _meta/task_plan.md 里的任务计划
```

helix 自动按以下 phase 链编排（v0.7 9 phase）：

```
mode-router-coarse (Step 0.5)
  ↓
a1-task-understander (Step 3)
  ↓
a2-repo-sensor (Step 4)
  ↓
[a3-retriever]                    ← scope 明确时可跳
  ↓
[skill-discovery 5.5]              ← 强匹配 skill 必须复用
  ↓
a4-planner (Step 6)               ← 输出 composedPhases
  ↓
mode-router-fine (Step 5.7)        ← 100% 精确硬契约：solo/team
  ↓
🛑 用户确认 plan + mode (Step 7)   ← Ralph 反对自宣告完成
  ↓
a5-executor (Step 8)              ← 5.5 + 5.7 双闭环卡点
  ↓
a6-validator (Step 9)             ← 4 维 0-5 评分
  ↓
meta-audit (Step 9.5)             ← v0.7: 独立 subagent 审
  ↓
a7-explainer (Step 10)
  ↓
helix --finalize                  ← Ralph 二元 passes 契约
```

### 子命令

```bash
node skills/helix/run.cjs --start "<task>"         # 启动 run + 自启 dashboard
node skills/helix/run.cjs --finalize               # 收尾，生成 promise
node skills/helix/run.cjs --finalize-session       # v0.7: 推送当日 session 摘要到飞书
node skills/helix/run.cjs --status                 # 查看当前 active run
```

---

## 📊 Dashboard

启动 helix 时自动开启 `http://localhost:7777`，浏览器访问即可看到：

| 视图 | 内容 |
|------|------|
| **Live** | 当前会话实时事件流 + HELIX RUNS 卡片可点击展开 phase 时间线 + Team 视图 |
| **Sessions** | 17+ 历史 Claude 会话下拉选择 + 每会话工具柱状图 + helix runs + 散落事件 |
| **Insights** | 14 天 × 24 小时调用密度热力图 + skill ROI 象限 + anomaly z-score |
| **Tasks / Findings / Health / Data** | 任务流 / findings.md / 健康度 / 原始 data |

数据架构（**Node stdlib · no SQLite · no external deps**）：

```
hooks/dashboard-emit.cjs ──(每个 tool 调用)──→ _meta/live-events.jsonl
   (注入 helix_run_id + helix_phase + session_id)
                                        │
                                        ▼ tail + SSE
                                  dashboard/server.js
                                        │
   _meta/helix-runs.jsonl ──── ❶ 启动加载 + ❷ 增量 tail ────┘
   (每个 helix --start/--report/--finalize 追加)
                                        │
                                        ▼
                              内存 Map<session_id, Session>
                                        │
                                        ▼ REST + SSE
                                       前端 Preact + nanostores
```

---

## Skills 全览

### 业务元（SDLC 执行链 · a1-a8）

| Skill | 职责 | 输出 |
|-------|------|------|
| `helix` | 唯一入口，编排 a1-a8 + meta-audit | `helix-runs.jsonl` 三类行 + `promise: COMPLETE\|NOT_COMPLETE` |
| `a1-task-understander` | 解析任务意图 → TaskCard | `{type, scope, out_of_scope, done_criteria, risk_level, preferred_skills}` |
| `a2-repo-sensor` | 扫仓库结构、技术栈、commit、dirty | RepoContext JSON |
| `a3-retriever` | 关键词检索 | `keywords[]` + scope（多数任务可跳） |
| `a4-planner` | TaskCard 校验 + 输出 `composedPhases[]`（v0.7 动态） | PlanDoc + preferred_skills 透传 |
| `a5-executor` | 用户确认后执行 + 5.5/5.7 双闭环 | passes + skills_check + mode_check |
| `a6-validator` | 自动检测项目类型跑测试/lint + **4 维评分** | `{passes, score:{accuracy,completeness,actionability,format,total:0-20}}` |
| `meta-audit` 🆕 | **独立 subagent 评审** | `{score:{correctness,security,maintainability,alignment,total:0-20}, findings[]}` |
| `a7-explainer` | 生成 commit message / PR 描述 | 英文 commit ≤72 字符 + 中文 PR 描述 |
| `a8-risk-guard` | 破坏性操作前强制风险评估 | LOW/HIGH/CRITICAL 分级 |

### 治理元（可观测性 + 自我进化）

| Skill | 职责 | 触发 |
|-------|------|------|
| `mode-router` | 双阶段路由（粗 0.5 + 细 5.7），输出 `solo / team[subagent_parallel\|manager_worker\|peer_review]` | helix 自动 |
| `context-curator` | 跨会话上下文压缩 + 7 级削减阶梯（800 字硬上限） | helix 软约束 |
| `evolution-tracker` | runs.jsonl → L2 复盘 → 改进议案；`--promote-soul` 沉淀 SOUL.md | helix 软约束 / 手动 |
| `knowledge-curator` | 整理飞书/网页资料 → 飞书 wiki | `--finalize-session` 触发 |
| `session-reporter` | 推飞书成长日志 Base + IM | `--finalize-session` 触发（Stop hook 已禁用） |

---

## 设计原则

1. **最小输入，最大产出** —— 一句话触发 `/helix`，9 个 phase 自动编排
2. **强制安全边界** —— a8-risk-guard 在破坏性操作前强制评估，不可催促降级
3. **独立审兜底** —— meta-audit 不是 a4 同款，必须独立 subagent 评，避免自审自荐（论文 V3）
4. **二元 passes 契约（Ralph）** —— 所有 phase 输出 `passes:true|false`，agent 自宣告 COMPLETE 也得人审
5. **机器化卡点** —— 5.5 闭环（preferred_skills × skills_used）+ 5.7 闭环（mode × subagent_run_ids）；`bypass_allowed=false`
6. **可观测、可追溯** —— 每个 skill 自留底 `runs.jsonl`，helix 全程进 `helix-runs.jsonl`，dashboard 实时可视
7. **写后必校验** —— JSON/JSONL 写完 `JSON.parse` 立刻校验（CLAUDE.md 工作约定 #8，源于 F-008/F-020/F-025）
8. **小步迭代** —— 一次只做一件事，每件事进 progress.md，文档带 `v0.x` 修订历史

---

## 项目结构

```
Alex-harness/
├── .claude-plugin/
│   ├── plugin.json                   # 插件清单（v0.7.0）
│   └── marketplace.json
├── skills/                           # 14 个 skill（plugin 模式）
│   ├── helix/                        # 唯一入口
│   ├── a1-task-understander/
│   ├── a2-repo-sensor/
│   ├── a3-retriever/
│   ├── a4-planner/
│   ├── a5-executor/
│   ├── a6-validator/
│   ├── a7-explainer/
│   ├── a8-risk-guard/
│   ├── meta-audit/                   # v0.7 新增
│   ├── context-curator/
│   ├── evolution-tracker/
│   │   └── lib/promote_soul.cjs      # v0.7: SOUL.md 沉淀
│   ├── knowledge-curator/
│   ├── mode-router/
│   │   ├── config.json               # v0.7: 权重外置
│   │   └── tests/run-tests.cjs       # 26 case
│   └── session-reporter/
├── dashboard/                        # v2 (Preact + Node stdlib)
│   ├── server.js                     # REST + SSE，jsonl tail
│   └── public/src/
│       ├── app.js / views.js         # Live / Sessions / Insights / ...
│       ├── stores.js                 # nanostores
│       └── styles.css
├── hooks/
│   ├── dashboard-emit.cjs            # 注入 helix_run_id + helix_phase
│   └── cron-heartbeat.cjs            # v0.7: 每日心跳
├── design/                           # 设计文档（用户主权区）
├── _meta/
│   ├── task_plan.md / progress.md / findings.md
│   ├── helix-runs.jsonl              # 所有 helix run 三类行
│   ├── SOUL.md                       # v0.7: 跨 run 稳定行为规则
│   ├── rotate.cjs                    # v0.7: jsonl 月度轮转
│   ├── e2e-fixtures/                 # v0.7: replay diff 回归
│   ├── archive/                      # 月度归档目标
│   └── reviews/                      # 里程碑总报告
├── CLAUDE.md                         # 项目级 Claude 指令
└── README.md
```

---

## 里程碑

| 版本 | 目标 | 状态 |
|------|------|------|
| M1 | knowledge-curator 反馈闭环 | ✅ 2026-4-29 |
| M2 | evolution-tracker v0.1 | ✅ 2026-4-29 |
| M3 | context-curator v0.1 | ✅ 2026-4-30 |
| M4 | mode-router + session-reporter v0.1 | ✅ 2026-5-1 |
| **v0.4-v0.5** | a1-a8 业务元 + helix + 5.5 闭环 + dashboard v2 | ✅ 2026-5-1 ~ 5-2 |
| **v0.6** | mode-router 双阶段路由 + 5.7 100% 精确硬契约 | ✅ 2026-5-3 |
| **v0.7** 🆕 | meta-audit + 4 维评分 + Manager-Worker + SOUL.md + dashboard sessions view | ✅ 2026-5-4 |
| v0.8 | 真实项目验证 + meta-audit 实战 5-10 次 + SOUL.md 沉淀 | 🔲 进行中 |

---

## 贡献

这是 Alex 的**私人 harness**，不接受 PR；但欢迎 fork 改造适配你自己的工作流。

设计文档在 `design/`，铁律 CLAUDE.md，进展在 `_meta/progress.md`。
