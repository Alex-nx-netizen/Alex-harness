---
name: context-curator
version: 0.1.0
description: "会话开头扫聚 _meta/ + memory + design + 各 skill SKILL.md → 产出本会话摘要包，让 Claude 5 秒内进入状态。当用户说『开始』『/curator』『恢复』『压缩后接着上次』『新会话』时使用，或会话开头自动 invoke。蓝图 §1.Q3 第二大脑 / §3.B3 上下文聚合。"
status:
  can_run: true
metadata:
  curator:
    SUMMARY_CHAR_LIMIT: 800
    SNAPSHOT_RETAIN_DAYS: 14
    PROGRESS_RECENT_N: 5
    FINDINGS_RECENT_N: 5
    RUNS_ANOMALY_LOOKBACK: 2
    RUNS_STALE_HOURS: 24
alex_harness_v08: true
harness_role: governance_meta
model_recommendation: sonnet
runs_in: ["main"]
tools_required: ["Read", "Bash"]
---

# context-curator (M3 #1)

> **设计源**：`design/context-curator-draft.md` v0.1（Alex 2026-4-30 全选推荐 ✅）
> **状态**：v0.1.0 — `can_run=true`
> **蓝图**：§1.Q3 第二大脑 / §3.B3 上下文聚合 / 元思想"节奏编排"低层基础设施

## §0 一句话责任 + 边界

**会话开头扫聚 `_meta/ + memory/ + design/ + 各 skill SKILL.md` → 产出"本会话摘要包"，让 Claude 5 秒内进入状态。**

| 适用 | 不适用 |
|------|--------|
| 会话开头快速进入状态（替代手动读 _meta/task_plan + progress 前 3 条） | 会话中段实时调取上下文（CC 自带 memory 的事） |
| 会话压缩后恢复 | 跨项目 / 跨工作区聚合（M5+） |
| 给特定 task ID 时聚合相关 finding + 历史议案 | 自动决定"该读哪些 skill"（intent-router 的事，已 deprecated） |
| 输出有时效标记 + diff（哪些是新的 / 哪些是 stale） | 直接修改 _meta 或 memory（绝不） |

**与 CC 自带 memory 的区别**：CC memory 分散小文件按需调取；context-curator **主动聚合 + 时序整理 + 优先级排序**，输出"本会话开场白"，不替代 memory。

## §1 「元」5 特征自检

| 特征 | 评估 | 理由 |
|------|------|------|
| 独立 | ✅ | 输入只读，输出只写 `_meta/context-snapshots/` 与自己 logs |
| 足够小 | ✅ 验过 | 4 phase（SCAN / EXTRACT / SUMMARIZE / EMIT），单文件 executor < 500 行 |
| 边界清晰 | ✅ | 只读源文件 + 只写 snapshot 目录，绝不改源 |
| 可替换 | ✅ | 输出 = 标准 markdown 包；摘要引擎可换 |
| 可复用 | ⚠️ | 现为本项目硬编码 source list；M5 跨项目时参数化 `--sources <path>` |

## §2 输入 / 输出 / state

### 输入（observation space）

| 来源 | 用途 | 必需 |
|------|------|------|
| `_meta/task_plan.jsonl`（优先） + `task_plan.md`（fallback） | 当前阶段 + in_progress + ready_to_unblock | ✅ |
| `_meta/progress.md` 最新 N=5 条 | 上次到哪了 | ✅ |
| `_meta/findings.md` 最新 N=5 条（按 F-NNN 倒序） | 已知坑 | ✅ |
| `memory/MEMORY.md` (project 级) | 用户偏好 + 项目惯例 TOC | ✅ |
| `design/harness-blueprint.md` h1/h2（TOC 级） | 蓝图状态 | 推荐 |
| `.claude/skills/*/SKILL.md` frontmatter | skill 状态/版本 | 推荐 |
| 上一次 snapshot（diff 用） | 增量发现 | 推荐 |
| 各 skill `logs/runs.jsonl` 最近 2 条（异常过滤） | 运行时异常信号 | 推荐 |

### 输出（action space）

| 产物 | 位置 | 用途 |
|------|------|------|
| 会话摘要包 | `_meta/context-snapshots/<YYYY-M-D-HHMMSS>.md` | 喂下次会话 |
| 摘要 index | `_meta/context-snapshots/_index.jsonl` | 时序追踪 + 检索 |
| 终端打印 | stdout | 即时人审 (≤30 行) |
| 自循环 run | `.claude/skills/context-curator/logs/runs.jsonl` | 元自检 / 给 evolution-tracker 看 |

### state

| 状态 | 文件 |
|------|------|
| 上次扫描的 source mtimes | snapshot frontmatter `source_mtimes` |
| 上次扫描时间（北京时间） | snapshot frontmatter `scanned_at_bj` |
| 上次 snapshot 路径 | `_meta/context-snapshots/_latest.txt` |

## §3 触发条件

**a 手动触发**（Q1 = a，Alex 拍）：
- 用户说"开始" / "恢复" / "新会话" / "/curator" / "压缩后接上"
- 我自己在会话开头 invoke（看到没有最近 snapshot 就跑）
- M3 末若手动率 < 50% 再考虑 b 自动 hook

## §4 4 phase

```
Phase 1 SCAN     → 列出要扫的源 + mtimes + 上次 snapshot 引用
Phase 2 EXTRACT  → 从每个源抽关键片段
Phase 3 SUMMARIZE→ 800 字硬上限 + diff vs 上次
Phase 4 EMIT     → 写 snapshot.md + _index.jsonl + 自循环 runs.jsonl + 终端 ≤30 行
```

### Phase 1 SCAN

**操作**：
1. 检查每个源的存在 + 读 mtime（北京时间字符串）
2. 读 `_meta/context-snapshots/_latest.txt`（不存在 = 首次跑）
3. 列出所有 `.claude/skills/*/SKILL.md` 路径

**输出（log）**：`logs/phase1-scan-<run_id>.log` 含每源路径 + mtime + 是否首次跑

### Phase 2 EXTRACT

**操作**：
1. **task_plan.jsonl**：parse → 抽 in_progress / ready_to_unblock（依赖 next_actions 同款分类逻辑）/ still_blocked count
2. **progress.md**：从顶部读，抽前 PROGRESS_RECENT_N=5 个 `### 会话 X` 标题 + 第一行
3. **findings.md**：grep `^### F-\d+` 倒序取前 FINDINGS_RECENT_N=5
4. **MEMORY.md**：抽 `^- \[.+?\]\(.+?\)` TOC 行
5. **harness-blueprint.md**：抽 `^##` h2 行（TOC 级）
6. **每个 skill SKILL.md**：parse frontmatter `name / version / can_run`
7. **runs.jsonl 异常**（Q3）：每个 skill 最近 RUNS_ANOMALY_LOOKBACK=2 条；过滤 `rating <= 2 OR errors_count > 0 OR (rating IS NULL AND age_hours > RUNS_STALE_HOURS=24)`
8. **上次 snapshot 内容**（diff 用）：读 `_latest.txt` 指向的文件

**输出（log）**：`logs/phase2-extract-<run_id>.log`

### Phase 3 SUMMARIZE

**操作**：build snapshot.md，章节顺序 + 削减优先级（Q2 / Q5）：

```
1. ## 当前阶段          ← task_plan 当前 phase + in_progress 数 + actionable 数（不削）
2. ## 自上次以来变化     ← diff vs 上次 snapshot 的 ID 集合（无变化时显式写"无变化"）（Q5）
3. ## 上次到哪了        ← progress 最新 N 条（可削旧）
4. ## 已知坑            ← findings 最新 N 条（可削旧）
5. ## 用户偏好          ← MEMORY.md TOC（不削）
6. ## skill 状态        ← 每 skill name + version + can_run（不削）
7. ## 运行时异常        ← runs.jsonl 异常（最高优先；空时显式写"无"）
8. ## 蓝图 TOC          ← harness-blueprint.md h2（最先削）
```

**字数控制**：硬上限 SUMMARY_CHAR_LIMIT=800（Unicode 字符数）。超出按上方"最先削 → 不削"顺序逐节缩减；任何节被削时在节末加 `[truncated, original=N]`。

**输出（log）**：`logs/phase3-summarize-<run_id>.log` 含字符数统计 + 削减日志

### Phase 4 EMIT

**操作**：
1. 写 `_meta/context-snapshots/<run_id>.md`（含 frontmatter + 主体）
2. append 一行到 `_meta/context-snapshots/_index.jsonl`
3. 更新 `_meta/context-snapshots/_latest.txt` ← 新 snapshot 路径
4. 自循环：append 一行到 `.claude/skills/context-curator/logs/runs.jsonl`
5. 14 天归档（SNAPSHOT_RETAIN_DAYS=14）：扫 `_meta/context-snapshots/*.md`，age > 14 天的移到 `_archive/<YYYY-M>/`
6. 终端打印 ≤30 行（snapshot 主体头部）

**校验**（铁律 #8）：每 JSON/JSONL 写完立刻 `JSON.parse` 重读

### Phase 4.5: VERIFY（写入后强制校验）

`+create` / `+update` 调用后**必须**：

1. **响应解析**：从 `j.data.doc_id` 和 `j.data.doc_url` 取 token（**不是**顶层）。失败立即 abort，不重试。
2. **chunks 落盘顺序**：分块写入时**必须先把所有 chunks 写到 `tmp/chunk_*.md`**，再开始 create + append 循环。中途失败可从 `tmp/` 恢复，不必重切源文件。
3. **写后校验**：任何写入 JSONL 后立刻对每行 `JSON.parse`；失败 abort 并提示行号。

> **来源**：F-008 + F-010 + F-011（写后不验 + parser 漏 data.doc_id + chunks 落盘顺序反模式）

## §5 边界声明（不做什么）

- ❌ 改 `_meta/` 或 `memory/` 或 `design/` 任何源（绝不）
- ❌ 决定哪个 skill 该跑（intent-router 的事，已 deprecated）
- ❌ 跨项目聚合（M5+）
- ❌ 实时同步（snapshot 是会话开头快照，不是流）
- ❌ 调用 LLM 做摘要（v0.1 全部 rule-based；LLM 路径留给 v0.2）

## §6 决策记录（v0.1，Alex 2026-4-30 全选推荐）

| Q | 决策 | 落地 |
|---|------|------|
| Q1 触发 | a 手动 | 不挂 hook |
| Q2 摘要长度 | 800 字硬上限 | 削减优先级表见 Phase 3 |
| Q3 runs.jsonl 异常扫 | 是，但有界 | 每 skill 最近 2 条 + `rating ≤ 2 OR errors > 0 OR (rating IS NULL AND age > 24h)` |
| Q4 snapshot 历史 | 14 天 | 第 15 天起 `_archive/<YYYY-M>/` |
| Q5 输出 diff | 要 | `## 自上次以来变化` 节，无变化显式写"无变化" |

## §7 失败模式 + Guardrails

| Failure Mode | 触发场景 | Guardrail |
|--------------|---------|----------|
| **改了源文件** | 写错路径 | 代码层 grep 拒绝任何非 `_meta/context-snapshots/` 或自己 logs 的写入 |
| **凭空捏造** | 源缺失时硬出摘要 | 缺源在 frontmatter `sources_missing[]` 明示；缺核心源（task_plan.jsonl）→ abort |
| **静默失败** | 跑完没产出 | Phase 4 末必打印产物绝对路径；自循环 runs.jsonl 必 append |
| **JSON 损坏（F-008 复刻）** | 写 jsonl 时格式坏 | 写完立刻 JSON.parse 整文件；Windows 路径 `\` 在 JSON 里转义为 `\\` |
| **800 字超限静默** | 削减没生效 | 终端打印 final char count；超 800 → abort 并指定哪节没削 |
| **diff 算法假阳性** | 未变化误报变化 | diff 基于 ID 集合（task_id / F-NNN / proposal_id），不基于文本相似度 |

## §8 自循环（runs.jsonl 写自己）+ 用户评分

**评分入口（meta-loop 触发器）**：
```bash
node _meta/skill_feedback.cjs context-curator --list           # 看哪些 run 没评分
node _meta/skill_feedback.cjs context-curator <run_id> <1-5> "fix_notes"
```

> 评分 ≥ 1 → evolution-tracker 把这条算作 `valid_run`，能跑复盘出议案。
> 评分 = null → 该 run 不进 `valid_run_count`，evolution-tracker 等数据。


每跑完 append 一行到 `.claude/skills/context-curator/logs/runs.jsonl`：

```json
{
  "run_id": "<YYYY-M-D>-<HHMMSS>",
  "timestamp": "<北京时间>",
  "input": {
    "sources_seen": ["task_plan.jsonl", "progress.md", "findings.md", "MEMORY.md", ...],
    "sources_missing": [],
    "previous_snapshot": "<path or null>"
  },
  "output": {
    "snapshot_path": "_meta/context-snapshots/<run_id>.md",
    "char_count": 760,
    "char_limit": 800,
    "truncated_sections": [],
    "diff_summary": { "new_findings": 1, "new_tasks": 0, "new_proposals": 0 },
    "anomalies_count": 0,
    "wrote_files": [...]
  },
  "duration_ms": 1234,
  "errors": [],
  "user_feedback": { "rating": null, "fix_notes": null }
}
```

## §9 实现验收清单（v0.1.0 必过）

- [x] frontmatter 6 参数：`SUMMARY_CHAR_LIMIT / SNAPSHOT_RETAIN_DAYS / PROGRESS_RECENT_N / FINDINGS_RECENT_N / RUNS_ANOMALY_LOOKBACK / RUNS_STALE_HOURS`
- [x] 4 phase 每个有 logs/phaseN-...-log
- [x] §7 6 条 failure mode 都有对应代码路径或 assert
- [x] 自循环 runs.jsonl schema 完整
- [x] 800 字硬上限不被静默突破（超 abort）
- [x] 绝对禁止写源（`_meta` 非 snapshot 目录、memory/、design/、CLAUDE.md）
- [x] diff 基于 ID 集合
- [x] 14 天归档脚本就位（首次跑可能无产物）

## §10 输出文件清单

| 文件 | 路径 | 用途 |
|------|------|------|
| 会话摘要 | `_meta/context-snapshots/<run_id>.md` | 喂下次会话 |
| 摘要 index | `_meta/context-snapshots/_index.jsonl` | append-only 时序 |
| latest pointer | `_meta/context-snapshots/_latest.txt` | 单行指向最新 |
| 自循环 run | `.claude/skills/context-curator/logs/runs.jsonl` | 元自检 |
| Phase logs | `.claude/skills/context-curator/logs/phase{1-4}-...-<run_id>.log` | debug |
| 归档 | `_meta/context-snapshots/_archive/<YYYY-M>/<run_id>.md` | 老 snapshot |

## §11 当前实现状态

- ✅ 2026-4-30 v0.1.0：本 SKILL.md + `run.cjs` 单文件 executor 都落盘
- ✅ 首跑见 `logs/runs.jsonl` L1
- 🔮 v0.2 触发：跑过 ≥3 次真实会话开场后，发现 §6 决策有不当之处，或 §0 边界需收缩

## §12 修订历史

| 版本 | 时间 | 变更 |
|------|------|------|
| 0.1.0 | 2026-4-30 | v0.1 design 翻译为 SKILL.md + executor；首跑 fixture = 本会话开场 |
