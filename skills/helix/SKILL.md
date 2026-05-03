---
name: helix
version: 0.2.0
description: "Alex-harness 唯一入口（领导视角）。所有下属 skill 必须向 helix 汇报。/helix 启动一次完整工作流：start → a1-a8 phase 顺序执行 → 每步 passes 二元判定 → finalize 生成 promise=COMPLETE|NOT_COMPLETE。Ralph 契约嵌入。"
status:
  can_run: true
---

# helix — 唯一入口 / 领导视角

> **设计源**：`design/helix-draft.md` v0.1 + Ralph 嫁接（P-2026-4-30-001 + ralph_graft_push.md）
> **地位**：整个 Alex-harness 的点火开关。**13 个下属 skill 不再单独暴露为 / 命令**，统一从 /helix 派下去。

## §0 一句话责任

**用户一句话 → helix 派任务给下属 → 每个下属跑完必须汇报 → helix 收账判定 promise。**

## §1 调用方式

```
/helix                          # 打开 harness，等待任务描述
/helix 帮我重构认证模块          # 直接带任务进入
/helix 给这个项目加 E2E 测试     # 任何开发任务
```

## §2 硬契约（Ralph 嵌入）

接到 `/helix` 后**必须**按下面顺序执行。每一步都不能跳过。

### Step 1：启动 helix run（必跑）

```bash
node skills/helix/run.cjs --start "<用户的任务描述>"
```

输出 JSON 含 `helix_run_id`、`phases` 计划，以及 **`dashboard` 字段**（含 `url` + `status`）。**记下 helix_run_id**，后续 phase 都关联到它。

**Dashboard 自动启动 + 必须告知用户**：

`run.cjs --start` 内部已做了 dashboard 端口 health check：
- `status=already_running` → dashboard 早就在跑，直接复用
- `status=starting` → 本次启动了一个新的（detached 进程，不影响 helix 流程）
- `status=missing` / `spawn_failed` → 文件不存在 / 启动失败，记录但不阻塞

**LLM 在 Step 1 输出 JSON 后，必须用一句中文提示用户**（即使用户没问也要主动说），格式参考：

> 📊 Dashboard 已就绪: http://localhost:7777 (status=already_running) — 浏览器打开可看到 a1-a8 phase 实时进度、skill 状态和本次 helix run 详情。
>
> ⚠ URL 后必须用 ASCII 半角空格 + 半角括号 ` (...)` 包状态，**不要**用全角 `（）`——会让终端把 `（status=...)` 吃进 URL，链接点不对（参见 v0.5.1 修复）。

不打开也不影响 helix 流程；这是给用户的可观察性入口。

### Step 2：上下文加载

读以下文件建立认知：
- `_meta/task_plan.md`（当前阶段/任务）
- `_meta/progress.md`（最近 3 条进展）
- 当前项目 `CLAUDE.md`

输出 1 句状态摘要。

### Step 3-9：phase 链 — **每步用 run.cjs 执行 + 自动汇报 helix**

按以下顺序逐 phase 跑（脚本会自动 `--report` 给 helix；你**不要**自己手动调 `--report`）：

| Step | 命令 | 何时跳过 |
|---|---|---|
| 0.5 | `node skills/mode-router/run.cjs --coarse "<task>"` （**Step 5.7 细判前的预判**，见 §2.6）| 永不跳过 |
| 3 | `node skills/a1-task-understander/run.cjs '{"task":"..."}'` | 永不跳过 |
| 4 | `node skills/a2-repo-sensor/run.cjs` | 永不跳过 |
| 5 | `node skills/a3-retriever/run.cjs '{"keywords":[...]}'` | task scope 已明确时可跳 |
| 5.5 | **skill 最优选择**（LLM 行为约束，不跑脚本，见下方 §2.5） | 永不跳过 |
| 6 | `node skills/a4-planner/run.cjs '<task_card>'` | 永不跳过 |
| 5.7 | `node skills/mode-router/run.cjs --fine '{"task":"...","files_changed_count":N,"steps_count":N}'` （**100% 精确硬契约**，见 §2.7）| 永不跳过 |
| 7 | **用户确认 plan + mode**（不跳过；Ralph 反对自宣告完成）|
| 8 | `node skills/a5-executor/run.cjs '{"plan":...,"user_confirmed":true,"preferred_skills":[...],"skills_used":[...],"mode":"<solo\|team>","team_type":"<subagent\|peer_review>","subagent_run_ids":[...]}'` | 仅 research 类任务可跳 |
| 9 | `node skills/a6-validator/run.cjs '{"score":{...}}'` | 仅纯文档任务可跳 |
| 9.5 | `node skills/meta-audit/run.cjs '<input-json>'`（**v0.7 新增**：先调 code-reviewer + security-reviewer subagent 拿 4 维评分 + findings，再喂给本脚本）| `composedPhases` 不含或纯文档任务可跳 |
| 10 | `node skills/a7-explainer/run.cjs` | 无变更可跳 |

### §2.5 Step 5.5：skill 最优选择（必跑）

> **来源**：Alex 2026-5-2 19:xx —"每次任务选择最优 skills 使用，这入口 helix 进入的时候，注意一下"
> 借鉴 `agent-teams-playbook` 阶段 1 的"Skill 完整回退链"。

a3-retriever 输出 keywords + scope 后，**a4-planner 之前**，必须执行 3 步 skill 发现链，把"能复用现成 skill"标注进 plan，避免从头重写已有能力。

| 步骤 | 动作 | 输出 |
|---|---|---|
| 5.5.1 | **本地 skill 扫描** — 列出本项目 `skills/` 下的 14 个 skill（a1-a8 + context-curator / evolution-tracker / helix / knowledge-curator / mode-router / session-reporter）+ `dashboard/api/skills` 当前状态 | 候选名单 + 状态 |
| 5.5.2 | **全局/外部 skill 搜索** — 检查 system-reminder 里 available skills 列表（含 ECC、superpowers、ui-ux-pro-max 等）；若仍无匹配，调 `Skill(skill="find-skills", args="<task keywords>")` 拉外部 | 命中的 skill 名 + 用途 |
| 5.5.3 | **匹配评估** — 对每个候选给"匹配度"（强/弱/无）；强匹配的 skill 写入 a4-planner 输入的 `task_card.preferred_skills` 数组 | preferred_skills 注入 plan |

**判定规则**：
- 候选 skill ≥1 强匹配 → 必须把它写入 plan，a5-executor 优先调用 skill 而非自行实现
- 候选 skill 全弱/无匹配 → plan 走 general-purpose 路径，但 §2.5 仍要留笔（在 progress 里写"扫过 X 个 skill 都不匹配，故自行实现"），便于将来沉淀新 skill
- **铁律**：**禁止**没扫 skill 就直接进 a4-planner

**v0.5.1 机器闭环**（不是装饰，是 passes 判据）：
- a4-planner 把 `task_card.preferred_skills` 透传到 `output.preferred_skills`
- a5-executor 入参必须含 `skills_used: [...]`（LLM 实际调用的 skill 名清单）
- a5 校验：若 `preferred_skills` 非空且 `skills_used` 一个都没覆盖 → `passes=false, errors:["skipped_recommended_skill"]`，阻断 finalize
- 合规绕过：传 `skills_bypassed_reason: "<≥10 字符理由>"`（例：CDP 启动失败、skill 自身有 bug）→ 视为 explicit_bypass，pass 通过但 5.5 留痕
- 名字匹配宽松：`ecc:foo` 可匹配 `foo`（前缀变体兼容）

**示例：**

```
任务："给 dashboard 加飞书消息推送"
→ Step 5.5.1 本地扫描：knowledge-curator (写飞书 doc 工作流) ⭐强匹配；session-reporter (Stop hook 推飞书) ⭐强匹配
→ Step 5.5.2 全局：lark-im / lark-doc / lark-shared 强匹配
→ Step 5.5.3 写入 task_card.preferred_skills = ["session-reporter", "lark-im"]
→ Step 6 a4-planner 见到这两条会输出"复用 session-reporter 框架 + lark-im 发消息"，而非"自己写一个 IM 客户端"
```

### §2.6 Step 0.5：mode-router 粗判（必跑）

> **来源**：Alex 2026-5-3 — "根据用户输入的内容复杂度判断单 agent 还是 team 模式"
> **作用**：在 a1 之前给 a4 提前打 buff，让 plan 知道任务大致复杂度

```bash
node skills/mode-router/run.cjs --coarse "<用户原话任务描述>"
```

输出 `{mode, team_type, score, breakdown, enforcement}`：
- 评分维度：显式 solo/team 词、并行词、跨前后端域、任务长度 >150 字、重构/迁移词
- 阈值 ≥3 → team；否则 solo
- **粗判仅是参考**——最终决策以 §2.7 Step 5.7 细判为准，不可绕过

### §2.7 Step 5.7：mode-router 细判（**100% 精确硬契约**，必跑）

> **核心**：这是 v0.6 Alex 主诉求"team / solo 自动判断"的执行端

a4-planner 出 plan 后立即跑（Step 6 → 5.7 → 7），把 plan 信号喂回 mode-router：

```bash
node skills/mode-router/run.cjs --fine '{
  "task": "<原任务>",
  "files_changed_count": <a4 plan 中改动文件数>,
  "steps_count": <a4 plan 中步骤数>
}'
```

输出（关键字段）：
- `mode`：`solo` 或 `team`（**不可绕过的最终决策**）
- `team_type`：`subagent`（并行）或 `peer_review`（一写一审）
- `team_plan.agents[]`：mode=team 时直接产出**具体 Agent 调用清单**（含 `subagent_type` + `prompt`），LLM 只需"复制粘贴"调 Agent tool
- `enforcement.directive`：硬契约执行指令
- `contract.bypass_allowed`: **false**（不允许绕过）

**LLM 行为契约（必须执行）**：

| 5.7 输出 mode | LLM 必须做的 | a5 入参约束 |
|---|---|---|
| `solo` | 直接进 a5 逐文件改 | `mode:"solo", subagent_run_ids:[]` |
| `team/subagent` | 按 `team_plan.agents[]` 调 N 次 Agent tool（一个消息多个 tool 调用，并行） | `mode:"team", team_type:"subagent", subagent_run_ids:["<id1>","<id2>",...]` |
| `team/peer_review` | 串行调 2 次 Agent：implementer → reviewer | `mode:"team", team_type:"peer_review", subagent_run_ids:["<implementer_id>","<reviewer_id>"]` |

**a5-executor 卡点（无 bypass）**：
- mode=team → `subagent_run_ids` 必须 ≥1 个 ≥4 字符 → 否则 `passes=false, errors:["team_mode_no_subagents"]`
- mode=solo → `subagent_run_ids` 必须为空 → 否则 `passes=false, errors:["solo_mode_with_subagents"]`（防伪派）

**与 v0.5.1 Q1 决议一致**：硬卡，不允许 bypass。撒谎填假 ID 仍能过机器层，但每次 a5/mode-router 决策都进 helix-runs.jsonl 留痕，人审兜底。

### §2.8 Phase 链动态化（v0.7 新增 / 论文 §6⑤）

> **核心**：让 a4-planner 根据任务 type 决定本次该跑哪些 phase，而不是无脑全跑。

a4-planner 输出 `composedPhases:[<phase names>]`，按 `task_card.type` 拼装：

| task_card.type | composedPhases |
|---|---|
| `research` | `mode-router-coarse → a1 → a2 → a3` （只认知/检索，不动代码）|
| `design_consulting` | `mode-router-coarse → a1 → a2 → a4` （纯文档/方案）|
| `feature` / `refactor` / `bugfix` | 全 phase 链 + meta-audit |
| 其它/未识别 | 全链（默认安全）|

**helix 行为契约**：
- helix --report a4-planner 看到 `payload.output.composedPhases` 时，把它存入 state（`.helix-current-run.json`）
- helix --finalize 时，若 state 含 composedPhases，缺的 phase 进 `composed_missing` 警告，但**不卡 promise**（v0.7 起步软约束）
- 没 a4 输出（或 type=unknown）→ 自动回退到 PHASES_DEFAULT 全链

**不替 LLM 拍板**：composedPhases 是脚本根据 type 给出的"建议"，LLM 仍可按需手动跑/跳某 phase。passes 判定依据是 **真实跑过的 phase reports**，不是 composedPhases 计划值。

### §2.9 治理元接入（v0.7 新增）

`PHASES_GOVERNANCE = ["evolution-tracker", "context-curator"]` —— 这两个治理元从 v0.7 起进入"软约束"列表：

- **触发时机**：可在 a7-explainer 后、--finalize 前手动跑（暂未自动化）
- **缺失影响**：finalize 时若没跑过会进 `governance_missing` 警告，但**不卡 promise**
- **后续演进**：v0.7.1 起可以考虑把"自动 spawn"挂在 finalize 头上

`knowledge-curator` 和 `session-reporter` **不放 PHASES_GOVERNANCE**：
- knowledge-curator 由用户手动调用（推飞书 doc）
- session-reporter 由 Stop hook 触发，或由 `helix --finalize-session` 主动调用（见 §8）

### Step 任意：风险守护（按需 inject）

任何破坏性/不可逆操作前**必须**先跑：

```bash
node skills/a8-risk-guard/run.cjs '{"operation":"<操作描述>","user_confirmed":<bool>}'
```

`passes=false` → **强制 ABORT，等用户原话确认**。a8 默认 fail-safe（拿不准一律不通过）。

### Step Final：收尾（必跑）

```bash
node skills/helix/run.cjs --finalize
```

输出 `promise: COMPLETE|NOT_COMPLETE`。**这只是机器判定，归档由用户人审**（Ralph: 不自宣告完成）。

## §3 Phase passes 判定（Ralph 二元契约）

| Phase | passes=true 条件 |
|---|---|
| mode-router-coarse (0.5) | 总是 passes=true（仅决策，不卡 finalize）|
| a1-task-understander | 任务描述非空 |
| a2-repo-sensor | 至少识别 1 项（key_file / tech_stack / commit）|
| a3-retriever | 提供了 keywords 或 scope |
| a4-planner | TaskCard 含 type + scope + done_criteria（preferred_skills + composedPhases 透传到 output）|
| mode-router-fine (5.7) | 总是 passes=true（决策本身不失败；不合规通过 a5 卡点暴露）|
| a5-executor | plan + user_confirmed=true + 5.5 闭环(skills) + 5.7 闭环(mode×subagent_run_ids) 全过|
| a6-validator | 所有检查通过（或无检查可跑）；附带 score 4 维 0-5（不影响 passes）|
| meta-audit (9.5) | audit_report.dimensions 4 项 0-5 + findings[]；总分 ≥16 → passes=true；10-15 → needs_revision；<10 → 重大问题 |
| a7-explainer | git status 检测到变更 |
| a8-risk-guard | LOW 自动通过；HIGH/CRITICAL 必须 user_confirmed=true |

任一 phase `passes=false` → **暂停 + 报告用户**。不自动重试。

## §4 数据流（领导视角）

```
用户 /helix → helix --start ────┐
                               │ 写 _meta/helix-runs.jsonl L1（start）
                               │ 写 _meta/.helix-current-run.json（state）
                               ▼
                    [LLM 按 §2 顺序跑]
                               │
                               ├─→ aN/run.cjs 执行
                               │     ├─ 自留底 skills/aN/logs/runs.jsonl
                               │     └─ spawn helix --report aN '<json>'
                               │           ↓
                               │       写 _meta/helix-runs.jsonl L2..N
                               │
                               ▼
                    helix --finalize ────┐
                                         │ 计算 passes_all
                                         │ promise=COMPLETE|NOT_COMPLETE
                                         │ 写 helix-runs.jsonl Last
                                         │ append _meta/progress.md（Ralph 学习日志）
                                         ▼
                                    清理 .helix-current-run.json
```

## §5 边界

| 适用 | 不适用 |
|------|--------|
| 任何开发任务的起点 | 已经在 phase 中途（不要重启）|
| 需要完整 9 步流程 | 只是问问题（直接答即可）|
| 想让 harness 全权处理 | 单纯的文件读写 |

## §6 Ralph 接受/反对清单（来自 ralph_graft_push.md）

✅ **接受**：
- `passes: true|false` 二元判定
- `<promise>COMPLETE</promise>` 契约
- progress.md 追加式学习日志
- 单一事实源（helix-runs.jsonl 是镜像，state 在 .helix-current-run.json）
- **skill 最优复用**（2026-5-2 加入）：每次进 a4-planner 前必扫 skill 列表，强匹配的必须复用，弱/无匹配才允许自行实现且必须留笔

❌ **反对**：
- bash 外循环重跑 helix（违背可观察性）
- agent 自宣告完成（必须人审）
- iteration 粒度（保持 session 粒度）

## §7 与下属的关系（不再是平级）

```
helix（领导，唯一 / 命令）
 ├─ mode-router (Step 0.5)  ← phase（粗判 solo/team，v0.6 提为主链）
 ├─ a1-task-understander    ← phase
 ├─ a2-repo-sensor          ← phase
 ├─ a3-retriever            ← phase
 ├─ a4-planner              ← phase
 ├─ mode-router (Step 5.7)  ← phase（细判 + 100% 精确硬契约，v0.6 提为主链）
 ├─ a5-executor             ← phase（含 5.5 + 5.7 双闭环卡点）
 ├─ a6-validator            ← phase（v0.7 起带 4 维 score）
 ├─ meta-audit              ← phase（v0.7 新增 Step 9.5：独立审视位 + 4 维 0-5 评分）
 ├─ a7-explainer            ← phase
 ├─ a8-risk-guard           ← phase（按需 inject）
 ├─ context-curator         ← 治理元（v0.7 已接入软约束 / PHASES_GOVERNANCE）
 ├─ knowledge-curator       ← 治理元（v0.7 已接入：用户手动调用 / 推飞书 doc）
 ├─ evolution-tracker       ← 治理元（v0.7 已接入软约束 / PHASES_GOVERNANCE）
 └─ session-reporter        ← 治理元（v0.7 已接入：Stop hook + helix --finalize-session 手动总结）
```

**v0.7 治理元接入状态（已落地）**：

| 治理元 | 接入方式 | 触发条件 |
|---|---|---|
| evolution-tracker | PHASES_GOVERNANCE 软约束 | 可在 a7 后手动跑 `node skills/evolution-tracker/run.cjs <subject>`；finalize 缺失只警告 |
| context-curator | PHASES_GOVERNANCE 软约束 | 可在 a7 后手动跑 `node skills/context-curator/run.cjs`；finalize 缺失只警告 |
| knowledge-curator | 用户手动 | 任务完成后由用户决定是否整理为飞书 doc |
| session-reporter | Stop hook + `helix --finalize-session` | Stop hook 自动跑 / 用户主动调 finalize-session 总结一段时间窗口 |

13 个下属的 SKILL.md 仍存在（提示词层 + LLM 加载），但**它们不再是顶级 / 命令**——`.claude-plugin/plugin.json` 已改为只暴露 `./skills/helix`。

## §8 子命令速查

```bash
node skills/helix/run.cjs --start "<task>"        # 启动一次 run
node skills/helix/run.cjs --report <phase> <json> # phase 上报（自动调用，一般不手敲）
node skills/helix/run.cjs --finalize              # 收尾，生成 promise
node skills/helix/run.cjs --status                # 查看当前 active run

# v0.7 新增：会话级总结（跨多个 helix run）
node skills/helix/run.cjs --finalize-session                    # dry-run 默认，输出 markdown 总结
node skills/helix/run.cjs --finalize-session --last 10          # 总结最近 10 条 run
node skills/helix/run.cjs --finalize-session --since 2026-5-4   # 总结某日起所有 run
node skills/helix/run.cjs --finalize-session --push-feishu      # 真推飞书（默认 dry-run，不推）
```

`--finalize-session` 行为：
- 读 `_meta/helix-runs.jsonl`，按 `helix_run_id` 分组拼装 markdown 总结
- 调 `node skills/session-reporter/run.cjs --finalize <summary-json>`（如 session-reporter 还未支持，会留 stdout note）
- **dry-run 默认**：不推飞书，只输出到 stdout；用户决定 `--push-feishu` 才真推
