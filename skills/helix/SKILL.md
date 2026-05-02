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

输出 JSON 含 `helix_run_id` 和 `phases` 计划。**记下 helix_run_id**，后续 phase 都关联到它。

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
| 3 | `node skills/a1-task-understander/run.cjs '{"task":"..."}'` | 永不跳过 |
| 4 | `node skills/a2-repo-sensor/run.cjs` | 永不跳过 |
| 5 | `node skills/a3-retriever/run.cjs '{"keywords":[...]}'` | task scope 已明确时可跳 |
| 5.5 | **skill 最优选择**（LLM 行为约束，不跑脚本，见下方 §2.5） | 永不跳过 |
| 6 | `node skills/a4-planner/run.cjs '<task_card>'` | 永不跳过 |
| 7 | **用户确认 plan**（不跳过；Ralph 反对自宣告完成）|
| 8 | `node skills/a5-executor/run.cjs '{"plan":...,"user_confirmed":true}'` | 仅 research 类任务可跳 |
| 9 | `node skills/a6-validator/run.cjs` | 仅纯文档任务可跳 |
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

**示例：**

```
任务："给 dashboard 加飞书消息推送"
→ Step 5.5.1 本地扫描：knowledge-curator (写飞书 doc 工作流) ⭐强匹配；session-reporter (Stop hook 推飞书) ⭐强匹配
→ Step 5.5.2 全局：lark-im / lark-doc / lark-shared 强匹配
→ Step 5.5.3 写入 task_card.preferred_skills = ["session-reporter", "lark-im"]
→ Step 6 a4-planner 见到这两条会输出"复用 session-reporter 框架 + lark-im 发消息"，而非"自己写一个 IM 客户端"
```

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
| a1-task-understander | 任务描述非空 |
| a2-repo-sensor | 至少识别 1 项（key_file / tech_stack / commit）|
| a3-retriever | 提供了 keywords 或 scope |
| a4-planner | TaskCard 含 type + scope + done_criteria |
| a5-executor | 有 plan + user_confirmed=true |
| a6-validator | 所有检查通过（或无检查可跑）|
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
 ├─ a1-task-understander    ← phase
 ├─ a2-repo-sensor          ← phase
 ├─ a3-retriever            ← phase
 ├─ a4-planner              ← phase
 ├─ a5-executor             ← phase
 ├─ a6-validator            ← phase
 ├─ a7-explainer            ← phase
 ├─ a8-risk-guard           ← phase（按需 inject）
 ├─ context-curator         ← 治理元（被 helix 内部调用）
 ├─ mode-router             ← 治理元
 ├─ knowledge-curator       ← 治理元
 ├─ evolution-tracker       ← 治理元（消费 logs）
 └─ session-reporter        ← 治理元（Stop hook 自动跑）
```

13 个下属的 SKILL.md 仍存在（提示词层 + LLM 加载），但**它们不再是顶级 / 命令**——`.claude-plugin/plugin.json` 已改为只暴露 `./skills/helix`。

## §8 子命令速查

```bash
node skills/helix/run.cjs --start "<task>"        # 启动一次 run
node skills/helix/run.cjs --report <phase> <json> # phase 上报（自动调用，一般不手敲）
node skills/helix/run.cjs --finalize              # 收尾，生成 promise
node skills/helix/run.cjs --status                # 查看当前 active run
```
