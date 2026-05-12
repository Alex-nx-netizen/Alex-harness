---
name: evolution-tracker
version: 0.1.0
description: "读 <skill>/logs/runs.jsonl + 当前 SKILL.md，跨 run 找共性，输出 L2 复盘文档 + SKILL.md 改动议案（PR-style .diff + NL 摘要二合一）。**绝不直接改 SKILL.md**——只产议案，人审拍板。当用户说『复盘 X skill』『跑 evolution-tracker』『M1.5 跑了几次了，看看哪些 fix_notes 该入 skill』『knowledge-curator 攒了 N 条 run，复盘下吧』时使用。蓝图 §3.B1 治理元，对应 4-28 wiki run fix_notes『不会自我进化』的根本解。"
metadata:
  requires:
    bins: ["node"]
    skills: []
  evolution:
    THRESHOLD_N: 2
    SIGNAL_KEYWORDS:
      - "不会"
      - "不能"
      - "没改"
      - "没变"
      - "静默"
      - "凭空"
      - "捏造"
      - "失败"
      - "进化"
      - "自我"
      - "缺"
      - "Phase"
      - "应该"
      - "fix"
      # P-2026-4-30-002 B 扩展（具象描述词，2026-4-30 加入）
      - "压成"
      - "看不到"
      - "激进"
      - "不到"
      - "太激"
      - "太多"
      - "截断"
      - "假阳性"
      - "噪声"
      - "漏"
      - "重复"
      - "想要"
      - "希望"
    COOLDOWN_HOURS: 12
    BLACKLIST_WEEKS: 4
    MIN_VALID_RUN_FOR_NORMAL: 2
  status:
    skill_md: "v0.1 完整"
    executor: "v0.1 完整 (M2.3.2 完成 2026-4-29)"
    can_run: true
alex_harness_v08: true
harness_role: governance_meta
model_recommendation: sonnet
runs_in: ["main"]
tools_required: ["Read", "Bash", "Write"]
---

# evolution-tracker (v0.1.0)

> **治理元**：蓝图 §3.B1，对应 2026-4-28 wiki run user_feedback "不会自我进化" 的根本解
>
> **一句话责任**：读 `<skill>/logs/runs.jsonl` 和当前 `<skill>/SKILL.md`，产出 L2 复盘文档 + SKILL.md 改动议案（**绝不直接改 SKILL.md**）
>
> **不可让步铁律**：永远只产 `.diff` 议案，永远不动 subject 的 SKILL.md。这条违反则项目元自我退化（蓝图 §6.R2）。

---

## §0 「元」5 特征自检（强制声明 / 蓝图 R4）

| 特征 | 评估 | 理由 |
|------|------|------|
| 独立 | ✅ | 输入只读 `runs.jsonl + SKILL.md + findings.md`；输出只写 `references/` + 自循环 `logs/runs.jsonl`；不依赖运行时其他 skill |
| 足够小 | ⚠️ 待观察 | 4 phase 草案（READ/ANALYZE/PROPOSE/WRITE）线性；如果 ANALYZE 长出来到 200+ 行，应拆 `pattern-finder` 元 + `criticism-engine` 元 |
| 边界清晰 | ✅ | "只提议不动 SKILL.md" 是最硬边界；任何 Edit/Write 到 subject SKILL.md 的代码路径直接 abort |
| 可替换 | ✅ | 议案格式（NL+diff）稳定后，分析引擎可换实现（GPT/Claude/本地模型） |
| 可复用 | ✅ | 同一份模板可用于任何带 `logs/runs.jsonl + SKILL.md` 的 skill |

### 4 判断问题（自答）

1. **拿出来能说清它负责什么吗？** → ✅ "L2 复盘 + SKILL.md 改议"
2. **出问题能定位到它吗？** → ✅ 见 §5；每个 phase 有独立 logs `logs/<phase>-<run_id>.log`
3. **替换它会拖死整个系统吗？** → ✅ 不会（功能 skill 没它也能跑，只是不会自我进化）
4. **下次相近任务能复用吗？** → ✅ 任何 skill 都需要复盘

---

## §1 适用场景 / 不适用

### 适用

- 一个 skill 累积 ≥ `MIN_VALID_RUN_FOR_NORMAL` 条 valid run 后做周期复盘
- 把 `user_feedback.fix_notes` 翻译成 SKILL.md 改议
- 跨多次 run 找共性 / pattern（同方向 errors / 重复 fix_notes）
- 写出 PR-style `.diff` 议案给用户人审

### 不适用 / 边界

- ❌ **单次 run 现场修复**——那是 skill 自己的事
- ❌ **直接 commit 改议**——铁律：永远人审
- ❌ **跨多个不同 skill 的元-元复盘**——M3+ 才做（meta-evolution-tracker）
- ❌ **给用户做"哪个 skill 该建"的决策**——蓝图层的事

---

## §2 触发逻辑（v0.1 锁定 = 手动 + 阈值 + 关键词，**不**做周期自动）

### 三种触发方式

```
1. 手动 (主要):
   user: /evolve <skill>
   → 直接进 §3 Phase 1（无前置门槛，但 §3 Phase 1 仍校验 valid_run_count）

2. 阈值提示 (被动):
   on each new run appended to <skill>/logs/runs.jsonl:
     unprocessed_count = count(runs since cursor.last_processed_run_id)
     if unprocessed_count >= THRESHOLD_N (默认 2):
       → 提示用户："已攒 <N> 条未复盘 run，要不要跑 evolution-tracker？(Y/N)"

3. 关键词信号 (被动):
   on each new user_feedback.fix_notes:
     if fix_notes matches SIGNAL_KEYWORDS:
       → 提示用户："信号触发：『<匹配片段>』，建议立即跑 evolution-tracker？(Y/N)"

抑制：
- COOLDOWN_HOURS (默认 12): 阈值 + 关键词同时触发时只提示一次
- 用户明示拒绝后下个 cooldown 周期内不再提
```

### 反对的做法（明示不做）

- ❌ **周期自动跑（cron）**：违背蓝图 §1.Q4"实时观察"——cron 在你看不见时动议案违背可观察原则
- ❌ **无门槛自动 commit**：永远人审（见 §5 R2）

---

## §3 工作流（4 phase 线性）

```
READ ──► ANALYZE ──► PROPOSE ──► WRITE
 │         │           │           │
 │         │           │           └─► references/ + .diff + _index.jsonl
 │         │           └─► 终端摘要（≤30 行）+ 等用户拍板（accept / reject / modify）
 │         └─► 内部分析（findings 引用 + 跨 run 共性 + fix_notes 关键词聚类）
 └─► JSON 校验 runs.jsonl 健康（每行 parse 否则 abort）
```

### Phase 1: READ

**输入**：subject skill path

**操作**：
1. `node` parse `<skill>/logs/runs.jsonl` 每一行；任何 parse fail **立即 abort**（铁律 #3，不能在坏数据上分析）
2. 读 `<skill>/logs/.evolution-cursor`（不存在则视为首次跑，cursor=null）
3. 读 `<skill>/SKILL.md` 全文 + frontmatter
4. 读项目 `_meta/findings.md`（取所有 F-NNN 引用）
4.5. 读 `_meta/task_plan.jsonl`（可选）：只作观察窗口，在 Phase 1 log 中展示任务健康度摘要；**不转成 direction，不出议案**
4.6. 读 `_meta/progress.md`（可选，P-2026-4-30-001）：取最近 14 天内含关键词（踩坑/失败/abort/F-NNN 等）的 session 段落，作为**第三证据流**供 Phase 2 消费；`progress_md_only` 的 cluster 需 ≥1 valid run 实证后才进入 PROPOSE 阶段
5. 计算 `valid_run_count = count(runs where completed != false && user_feedback.rating != null)`

**最小数门槛**（Q3 锁定）：
- `valid_run_count == 0` → **abort**，提示"无 valid run，无法复盘"
- `valid_run_count == 1` → 继续，但产物头部强制 banner：`⚠️ 样本量=1，议案为弱信号，建议补足 ≥${MIN_VALID_RUN_FOR_NORMAL} 条再决定 SKILL.md 改动`
- `valid_run_count >= MIN_VALID_RUN_FOR_NORMAL` → 正常

**输出**（log）：`logs/phase1-read-<run_id>.log` 含 valid_run_count / mode / cursor / SKILL.md 字数

### Phase 2: ANALYZE

**操作**：
1. 跨 run 找共性（聚类维度：`errors[]` 关键词、`learnings[]` 主题、`fix_notes` 词频）
2. 每条 fix_notes / errors → 给一个 `direction`（关键词聚类 ID，如 `phase4_robustness` / `phase7_push` / `self_evolution` / `chunk_size_limit`）
3. 对照 SKILL.md：
   - "已经写了但还在重复犯" → 说明 SKILL.md 写得位置不对/不够强
   - "反复出现但 SKILL.md 没提" → 说明缺规则
4. 对照 findings.md：合并相关 F-NNN 作为 `evidence_findings`
5. 检查 `_index.jsonl` 中同 `direction` 的 `reject_count_same_direction`：
   - ≥ 3 → **跳过这条 direction**（黑名单 N 周，Q4=b 三振规则）

**输出**（log）：`logs/phase2-analyze-<run_id>.log` 含每条 direction 的 cluster + 对照结论

### Phase 3: PROPOSE

**每条议案的 5 字段** + diff（铁律 #2）：

| 字段 | 说明 |
|------|------|
| **What** | 改 SKILL.md 哪一段（具体到章节 / 行号） |
| **Why** | 哪几条 run 的哪条数据支持（含 evidence_runs + evidence_findings） |
| **Where** | 文件:行号 |
| **Risk** | 这条议案如果错了会怎样 + 至少 1 个具体 mitigation |
| **Diff** | before/after，标准 unified format（≤ 200 字 NL summary 在前，` ```diff ` block 在后） |

**铁律**：
- ⚠️ **绝不直接 Edit SKILL.md**——只产 .diff 文件 + 终端打印
- ⚠️ 每条议案必须 5 字段齐全，缺一个就报"议案不完整"abort（不许半成品）
- ⚠️ NL summary ≤ 200 字 / 条
- ⚠️ direction 已上黑名单的不出议案（但要在终端注明"被黑名单跳过：<reason>"）

### Phase 4: WRITE

**写产物**（详见 §10）：
1. `references/weekly-review-<YYYY>-W<NN>.md`（人审复盘 markdown）
2. `references/skill-proposals/P-<YYYY-M-D>-<NNN>.diff`（每条议案一个 .diff）
3. `references/skill-proposals/P-<YYYY-M-D>-<NNN>.md`（被拒议案的 NL 文件，无 diff）
4. `references/skill-proposals/_index.jsonl`（议案池 + 状态，**append 不重写**）
5. 自循环：`.claude/skills/evolution-tracker/logs/runs.jsonl` append 一行（subject_skill 等字段，见 §6）
6. 更新 cursor：`<skill>/logs/.evolution-cursor` ← 写入前先 `cp .evolution-cursor.bak`

**校验**（铁律 #3）：每写完一个 JSON/JSONL 文件，立刻 `JSON.parse` 重读校验；失败 abort 并提示行号。

**终端打印**（≤ 30 行摘要）：
```
✅ evolution-tracker 完成 (<时间戳>)
  subject: <skill> v<version>
  valid_runs: <N> (L<i> r=<r>, ...)
  mode: normal / weak_signal / aborted
  proposals: <N> (<actionable> actionable + <rejected> rejected + <blacklisted> blacklisted)
    P-<id>  <direction>   评估"<NL 一句话>"
    ...
  files written: <N>
  next: 运行 `git apply <diff_path>` 接受议案；或 `evolution-tracker --reject <P-id> --reason "..."` 留拒因。
```

---

## §4 议案产出格式（双产物 / Q2 锁定）

> 议案 = **自然语言摘要在前 + 末尾 ` ```diff ` block 二合一**。
> NL 让人读，diff 让 `git apply` 仍能用。

### 范例（参考 design/evolution-tracker-draft.md §11.4 P2）

```markdown
## P-2026-4-29-002 加 Phase 7 PUSH（产出直推飞书 IM）

**direction**: `phase7_push`
**evidence_runs**: `["2026-4-29-meta-kim"]`
**evidence_findings**: `["F-012"]`

**What**: 在 `.claude/skills/knowledge-curator/SKILL.md` 的 Phase 5 LOG 之后、Phase 6 REPORT 之前插入 Phase 7 PUSH 章节。

**Why**: L4 user_feedback rating=3 直接说"飞书文档可以直接发到我的飞书上面去 ... 而不是给一个链接"+ F-012。已用 lark-cli im 手动验证此路通（msg_id om_x100b...，2026-4-29 10:40）。

**Where**: `.claude/skills/knowledge-curator/SKILL.md` Phase 5 LOG 之后

**Risk**: 推送失败的兜底——若 lark-cli contact 也失败，要明示用户"手动复制 URL"，不要静默吃错。Mitigation: 在 Phase 7 写明 try/catch + errors[] 字段记 `push_failed: <reason>`，不影响 doc 创建。

**Diff**:

```diff
--- a/.claude/skills/knowledge-curator/SKILL.md
+++ b/.claude/skills/knowledge-curator/SKILL.md
@@ Phase 5: LOG @@
   ```
+
+### Phase 7: PUSH（产出直推飞书 IM）
+
+**铁律**：成功跑完后、Phase 6 REPORT 之前**必须**直推。
+
+1. 默认 user open_id（global memory 读）
+2. 兜底：user_id 缺失 → 询问手机号 → lark-cli contact 查 open_id
+3. 内容：doc 标题 + URL + 关键章节摘要 + errors 摘要（≤300 字）
+4. 命令：lark-cli im +messages-send --user-id <ou_xxx> --as bot --markdown ...
+5. 失败处理：errors 字段记 push_failed，不回滚 doc 创建
 
 ### Phase 6: REPORT（向用户汇报）
```
```

---

## §5 失败模式 + Guardrails（蓝图 R2 / Q3 致命四怕）

| Failure Mode | 触发场景 | Guardrail |
|--------------|---------|----------|
| **误删数据** | 改 SKILL.md 时改坏 | **铁律：永远不动 subject SKILL.md，只产 .diff**；改 cursor 前先 `cp .evolution-cursor .evolution-cursor.bak` |
| **凭空捏造** | 数据不足时硬出议案 | Phase 1 `MIN_VALID_RUN_FOR_NORMAL` 阈值；不够 → abort 或弱信号 banner |
| **静默失败** | 跑完没产出但用户以为跑了 | Phase 4 末尾必须打印产物绝对路径；**自循环**（§6）跑完写自己 runs.jsonl |
| **产出不符合期望** | 议案不靠谱 | 每条议案强制 What/Why/Where/Risk + Diff 5 字段；缺一个 abort |
| **JSON 损坏（F-008 复刻）** | 自己写产物时格式坏 | 写完立刻 `JSON.parse` 校验；F-008 教训 |
| **自我进化变自我退化（R2）** | 议案被接受但其实是错的 | `_index.jsonl` 记 `rejected` / `rejected_after_apply`；同方向 3 次 rejected → `BLACKLIST_WEEKS` 周冷冻不再提（Q4=b） |
| **兜底机制不足（Q5）** | M2 议案产生量大人审跟不上 | M2 仅人审；M3 加飞书 PR-style review；`_index.jsonl` 字段提前对齐飞书 Bitable（见 §7.3） |

---

## §6 自循环（Q6=要 / 元自我可被复盘）

evolution-tracker 跑完后**必须** append 一行到自己的 `.claude/skills/evolution-tracker/logs/runs.jsonl`：

```json
{
  "run_id": "<YYYY-M-D>-<subject_skill>-<seq>",
  "timestamp": "<北京时间>",
  "input": {
    "subject_skill": "knowledge-curator",
    "subject_skill_version": "0.1.0",
    "valid_run_count": 2,
    "cursor_at_start": null
  },
  "decision": {
    "mode": "normal",
    "weak_signal_banner": false
  },
  "output": {
    "weekly_review_path": "references/weekly-review-2026-W18.md",
    "proposals_count": 3,
    "actionable_count": 2,
    "rejected_count": 1,
    "blacklisted_count": 0,
    "wrote_files": [...]
  },
  "duration_ms": 12345,
  "errors": [],
  "user_feedback": { "rating": null, "fix_notes": null }
}
```

> 这是 evolution-tracker"成为元"的标志——4 判断问题第 2 条（出问题能定位到它吗）的物质化。

---

## §7 状态文件 / cursor / 议案池

### §7.1 cursor

`<subject_skill>/logs/.evolution-cursor`（subject 侧，**单行**）：

```
last_processed_run_id=<run_id>
last_run_at=<北京时间>
last_evolution_run_id=<self run_id>
```

写前必先 `cp .evolution-cursor .evolution-cursor.bak`（铁律 #1 物质化）。

### §7.2 议案池 `_index.jsonl`

位置：`<subject_skill>/references/skill-proposals/_index.jsonl`（subject 侧）

每条议案一行 JSON，13 字段：

| 字段 | 类型 | 飞书 Bitable 字段类型（M3 同步） | 说明 |
|------|------|----------------------------|------|
| `proposal_id` | string PK | 文本（主索引列） | `P-YYYY-M-D-NNN` |
| `created_at` | string | 日期时间 | 北京时间，铁律 #6 |
| `subject_skill` | string | 单选 | 如 `knowledge-curator` |
| `subject_skill_version` | string | 文本 | semver |
| `direction` | string | 单选 | 同方向聚类 ID |
| `nl_summary` | string ≤200 字 | 多行文本 | 人读用 |
| `diff_path` | string \| null | 文本 | 项目相对路径（rejected 议案为 null） |
| `evidence_runs` | array<string> | 多选 | run_id list |
| `evidence_findings` | array<string> | 多选 | F-NNN list |
| `status` | enum | 单选 | `pending / approved / rejected / superseded / blacklisted / out_of_scope` |
| `decided_at` | string \| null | 日期时间 | 决策时刻 |
| `decided_by` | enum \| null | 单选 | `user / auto`（M2 全 user） |
| `reject_reason` | string \| null | 多行文本 | 自由 |
| `reject_count_same_direction` | number | 数字 | 同方向累计；触发 3 振 → `status=blacklisted` + 冻结 BLACKLIST_WEEKS 周 |

### §7.3 飞书表头预对齐（Q5 / M3 不必再迁移）

- ✅ JSONL key 全部 snake_case
- ✅ 时间戳全用北京时间字符串（飞书 datetime 字段直吃）
- ✅ 多值字段用 `array<string>`（M3 转 multi-select 时 join `,`）
- ❌ **不用** nested object（飞书 Bitable 不支持嵌套）
- ❌ **不用** 不可枚举 string 做 single-select；除非该字段就是文本

---

## §8 实现验收清单（M2.3.2 executor 必过）

> 每项 = 跑代码必须验证的硬指标。任意一项不满足 = SKILL.md 与代码契约不一致 = 必须修。

- [ ] **frontmatter 5 参数全有效**：THRESHOLD_N / SIGNAL_KEYWORDS / COOLDOWN_HOURS / BLACKLIST_WEEKS / MIN_VALID_RUN_FOR_NORMAL
- [ ] **4 phase 各自能独立失败 + 各自有 logs**：`logs/phase{1-4}-<run_id>.log`
- [ ] **§5 表里 6 条 failure mode 都有对应代码路径**（每条 → 至少 1 个 try/catch 或 assert）
- [ ] **自循环 runs.jsonl 字段完整**（§6 schema）：含 `subject_skill / valid_run_count / proposals_count / actionable_count / rejected_count / blacklisted_count / wrote_files[]`
- [ ] **议案产物 NL ≤ 200 字 / 条**；diff 块标准 unified format
- [ ] **cursor 文件先 cp .bak 再写**
- [ ] **5 字段议案缺任一 → abort 不许半成品**
- [ ] **绝对禁止 Edit/Write 到 subject SKILL.md**：代码层 grep 拒绝任何写入 subject SKILL.md 的路径

---

## §9 基线测试（M2.3.2 必复现）

### §9.1 基线测试 A（弱信号档）

**输入**：构造只剩 1 条 valid run 的 fixture（如 `tests/fixtures/runs-1valid.jsonl`）
**期望**：mode=`weak_signal`；产物头部有 ⚠️ 弱信号 banner；至少 1 条议案

### §9.2 基线测试 B（normal 档，**核心断言**）

**输入**：2026-4-29 时刻的真实 `knowledge-curator/logs/runs.jsonl`（L1 comment + L2 wiki r=5 + L3 aborted + L4 meta_kim r=3 = 2 valid + 1 aborted）

**期望**：
- mode=`normal`，无弱信号 banner
- **至少**复现以下 3 条议案（id 可不同，direction 必须一致）：
  - `phase4_robustness`：合并 F-008 / F-010 / F-011，建议加 Phase 4.5 VERIFY
  - `phase7_push`：合并 F-012 + L4 fix_notes，建议加 Phase 7 PUSH
  - `self_evolution`：L2 fix_notes "不会自我进化" → REJECTED out_of_scope，记 1/3
- proposals_count >= 3，actionable_count >= 2，rejected_count >= 1
- 写产物 5 个：`weekly-review-*.md` + 2 条 .diff + 1 条 .md (rejected) + `_index.jsonl`
- 自循环 runs.jsonl 写一条（subject_skill = knowledge-curator）

> **设计 vs 实现一致性的硬指标**：基线 B 通过 = v0.2 §11 设计 = executor 行为对齐。

---

## §10 输出文件清单（normal 档每次跑产出）

| 文件 | 路径（`<skill>` = subject skill path） | 用途 |
|------|---------------------------------|------|
| L2 复盘 markdown | `<skill>/references/weekly-review-<YYYY>-W<NN>.md` | 人审复盘叙事 |
| 议案 .diff | `<skill>/references/skill-proposals/P-<id>.diff` | `git apply` 接受 |
| 被拒议案 .md | `<skill>/references/skill-proposals/P-<id>.md` | 留 reject_reason |
| 议案池 | `<skill>/references/skill-proposals/_index.jsonl` | append-only 状态机 |
| cursor | `<skill>/logs/.evolution-cursor` + `.bak` | 增量复盘起点 |
| 自循环 | `.claude/skills/evolution-tracker/logs/runs.jsonl` | 元自我可被复盘 |

---

## §11 当前实现状态

| 项 | 状态 |
|---|------|
| SKILL.md 设计 | ✅ v0.1.0（本文件） |
| design/evolution-tracker-draft.md | ✅ v0.2（含 §11 假想范例） |
| Executor 代码（READ/ANALYZE/PROPOSE/WRITE） | ❌ **未实现** |
| 基线测试 A | ❌ 未实现 |
| 基线测试 B | ❌ 未实现 |

> ⚠️ **本 skill 当前不可执行**——`metadata.status.can_run = false`。
>
> 当用户调用 `/evolve <skill>` 或 evolution-tracker 被触发时：
> 1. 提示用户："evolution-tracker SKILL.md 已写但 executor 未实现（M2.3.2 待开工）"
> 2. 引用 `design/evolution-tracker-draft.md` §11.4 给出 v0.2 假想范例（让用户大致看到能产什么）
> 3. **不要假装跑完**——这是 §5 "静默失败" 的反例
>
> M2.3.2 实现完成后将更新 `metadata.status.can_run = true` + 删除本节末的 ⚠️ banner。

---

## 修订历史

- 2026-4-29 v0.1.0：基于 `design/evolution-tracker-draft.md` v0.2 §1-§11 翻译生成。frontmatter 5 evolution 参数 + 5 特征自检 + 4 phase + §5 6 条 failure mode + §7 13 字段议案池 schema + §8 验收清单 8 项 + §9 基线测试 A/B + §10 输出清单 + §11 当前实现状态明示。**executor 代码未实现**，待 M2.3.2。
