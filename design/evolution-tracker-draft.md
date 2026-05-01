# evolution-tracker (B1) — 设计草案

> **状态**: v0.1（用户 4-28 答完 §8 Q1-Q6，全选推荐方案；可进 M2.3 实现）
> **创建**: 2026-4-28（v0.0 骨架）
> **最后更新**: 2026-4-28（v0.1 整合用户决策）
> **对应蓝图**: §3.B1 进化元 / §6.R2 治理元自身可能改坏 SKILL.md / §1.Q4 用户要"自我进化"
> **触发原因**: 4-28 wiki 那次跑的 user_feedback 直接写了 "**不会自我进化**" → 这就是 B1 要解决的问题

---

## §0 一句话责任 + 边界

### 一句话
**读 `runs.jsonl` 和现有 SKILL.md，产出 L2 复盘文档 + SKILL.md 改动提议（绝不直接改 SKILL.md）。**

### 适用 / 不适用

| 适用 | 不适用 |
|------|--------|
| 累计了 N 条 run（N 待定）后做周期复盘 | 单次 run 失败的现场修复（那是 skill 自己的事） |
| 把 user_feedback fix_notes 翻译成 SKILL.md 改议 | 直接 commit 改议（必须人审） |
| 跨多次 run 找共性 / pattern | 跨多个不同 skill 的元-元复盘（M3+ 才做） |
| 写出 PR-style diff 给用户 | 给用户做"哪个 skill 该建"的决策（那是蓝图层的事） |

---

## §1 「元」5 特征自检（强制）

| 特征 | 评估 | 理由 |
|------|------|------|
| 独立 | ✅ | 输入只读 `runs.jsonl + SKILL.md`，输出只写 `references/` 和 PR-draft；不依赖运行时其他 skill |
| 足够小 | ⚠️ 待定 | 4 phase 草案：READ → ANALYZE → PROPOSE → WRITE。担心 ANALYZE 太胖；如果分析逻辑长出来，应拆 ANALYZE = pattern-finder 元 + criticism-engine 元 |
| 边界清晰 | ✅ | 明示"只提议不动 SKILL.md" 是最硬的边界 |
| 可替换 | ✅ | 输出格式（L2 文档 + diff）若稳定，分析引擎可换（GPT/Claude/本地模型） |
| 可复用 | ✅ | 同一份模板可用于任何带 `runs.jsonl + SKILL.md` 的 skill |

### 4 判断问题

1. **拿出来能说清它负责什么吗？** → ✅ "L2 复盘 + 改 SKILL.md 议案"
2. **出问题能定位到它吗？** → ⚠️ 看 §5 是否给齐 logs / 中间产物落盘
3. **替换它会拖死整个系统吗？** → ✅ 不会（功能 skill 没它也能跑）
4. **下次相近任务能复用吗？** → ✅ 任何 skill 都需要复盘

---

## §2 输入 / 输出 / state

### 输入（observation space）

| 来源 | 格式 | 必需 |
|------|------|------|
| `<skill>/logs/runs.jsonl` | JSONL | ✅ |
| `<skill>/SKILL.md` 当前版 | Markdown | ✅ |
| `_meta/findings.md` | Markdown | 推荐（找已知坑） |
| 上一次 L2 复盘文档 | Markdown | 推荐（避免重复议） |

### 输出（action space）

> **v0.1 锁定（Q2=b）**：议案格式 = 自然语言摘要在前 + 可执行 diff 附后

| 产物 | 落盘位置 | 同步飞书 |
|------|---------|---------|
| L2 复盘文档 | `references/weekly-review-<YYYY>-W<NN>.md` | ✅ M3 后由 session-reporter 推送 |
| SKILL.md 改动提议 | `references/skill-proposals/<skill>-<YYYY-M-D>.md`（自然语言段落 + 末尾 ` ```diff ` block） | ❌ M2 阶段；M3 后改议案 frontmatter 同步飞书 PR-style 表格（Q5） |
| 议案摘要 | 终端打印（≤ 30 行） | ❌ |

### state（自己维护的）

| 状态 | 文件 | 说明 |
|------|------|------|
| 上次复盘到哪条 run | `<skill>/logs/.evolution-cursor` | 单行：last_processed_run_id |
| 历次议案是否被接受 | `references/skill-proposals/_index.jsonl` | accepted / rejected / modified-then-accepted |

> **关键**：被拒绝的议案也要存——下次别再提同样的。

---

## §3 触发条件（v0.1 已锁，Q1=b+d）

**最终方案 = 手动 + 阈值提示 + 关键词信号**（三选混合，**不**做周期自动）。

### 触发逻辑（伪码）

```
on each new run appended to runs.jsonl:
  if user_feedback.fix_notes matches /不会|不能|没改|没变|静默|凭空|捏造|失败|进化|自我/:
    → 主动提示用户："信号触发：『<匹配片段>』，建议立即跑 evolution-tracker？(Y/N)"
  unprocessed_count = count(runs since last_processed_run_id)
  if unprocessed_count >= THRESHOLD_N:
    → 提示用户："已攒 <N> 条未复盘 run，要不要跑 evolution-tracker？(Y/N)"

on user command /evolve <skill>:
  → 直接跑（无前置门槛，但 §4 Phase 1 仍校验最小 valid run 数）
```

### 关键参数（默认值，可在 SKILL.md 顶部 frontmatter 覆盖）

| 参数 | 默认 | 说明 |
|------|------|------|
| `THRESHOLD_N` | 3 | 阈值提示门槛（跟 §8.Q3 锁的"最小 1 条就能跑"不冲突——阈值是"提示"层，最小数是"产出"层） |
| `SIGNAL_KEYWORDS` | `不会|不能|没改|没变|静默|凭空|捏造|失败|进化|自我` | 关键词正则；可加可删 |
| `COOLDOWN_HOURS` | 12 | 信号 + 阈值同时触发时只提示一次 |

### 反对的做法（明示不做）

- ❌ **周期自动跑**：你 §1.Q4 要"实时观察"——cron 在你看不见的时候动了 SKILL.md 议案，违背可观察原则
- ❌ **无门槛自动 commit**：永远人审（见 §5.R2）

---

## §4 工作流（4 phase 草案）

```
READ ──► ANALYZE ──► PROPOSE ──► WRITE
 │         │           │           │
 │         │           │           └─► references/ + diff
 │         │           └─► 终端摘要 + 等用户拍板（accept / reject / modify）
 │         └─► 内部分析（findings + 跨 run 共性 + fix_notes 聚类）
 └─► 校验 runs.jsonl 健康（每行 parse；F-008 教训）
```

### Phase 详细

**Phase 1: READ**
- `node` parse runs.jsonl 每一行；任何 parse fail 立即 abort（不能在坏数据上分析）
- 读 cursor，确定本次要分析哪些 run
- 读现有 SKILL.md 全文
- **最小数门槛（Q3=a）**：`valid_run_count = sum(completed != false && user_feedback.rating != null)`
  - `valid_run_count == 0` → abort，提示"无 valid run，无法复盘"
  - `valid_run_count == 1` → 继续，但产物头部强制 banner：`⚠️ 样本量=1，议案为弱信号，建议补足 ≥3 条再决定 SKILL.md 改动`
  - `valid_run_count >= 2` → 正常运行

**Phase 2: ANALYZE**
- 跨 run 找共性（errors[]、learnings[]、fix_notes 关键词）
- 对照 SKILL.md，找"已经写了但还在重复犯"的（说明 SKILL.md 写的位置不对/不够强）
- 对照 SKILL.md，找"反复出现但 SKILL.md 没提的"（说明缺规则）

**Phase 3: PROPOSE**
- 每条议案要包含：
  - **What**: 改 SKILL.md 哪一段
  - **Why**: 哪几条 run 的哪条数据支持
  - **Where**: 文件:行号
  - **Risk**: 这条议案如果错了会怎样
  - **Diff**: before/after
- ⚠️ **绝不直接 Edit SKILL.md**——只产出 .diff 文件 + 终端打印

**Phase 4: WRITE**
- 写 L2 复盘 markdown
- 写 .diff 文件
- 更新 cursor + 议案 index
- 终端：≤ 30 行摘要 + "运行 `git apply <path>` 接受第 N 条议案"

---

## §5 Failure Modes & Guardrails

直接对应用户 §1.Q3 致命怕的四类 + 蓝图 R2：

| Failure Mode | 触发场景 | Guardrail |
|--------------|---------|----------|
| 误删数据 | 改 SKILL.md 时改坏 | **铁律：永远不动 SKILL.md，只产 .diff**；改 cursor 前先 `cp .evolution-cursor .evolution-cursor.bak` |
| 凭空捏造 | 数据不足时硬出议案 | "≥ N 条 valid run 才能跑"；不够直接退出 + 提示 |
| 静默失败 | 跑完没产出但用户以为跑了 | Phase 4 末尾必须打印产物绝对路径；**自循环（Q6=要）**：跑完后自己写一条 run 到 `.claude/skills/evolution-tracker/logs/runs.jsonl`，字段含 `subject_skill / proposals_count / accepted_count`，让 evolution-tracker 也能被自己复盘——这是它"成为元"的标志（4 判断问题第 2 条） |
| 产出不符合期望 | 议案不靠谱 | 每条议案强制 What/Why/Where/Risk 5 字段；缺一个就报"议案不完整"abort |
| JSON 损坏（F-008 复刻） | 自己写产物时格式坏 | 写完立刻 `JSON.parse` 再读一次校验 |
| 自我进化变自我退化（R2） | 议案被接受但其实是错的 | 议案 index 里记 `rejected` / `rejected_after_apply`；**同方向（按 fix_notes 主关键词聚类）累计 3 次 `rejected*` → 进黑名单 N 周不再提**（Q4=b 三振规则） |
| 兜底机制不足（Q5） | M2 阶段议案产生量大，人审跟不上 | M2 仅靠人审（Q5）；M3 加飞书 PR-style review 表（议案 index 字段同步 frontmatter，便于后续上飞书）；M2 的 `_index.jsonl` 字段必须**对齐未来飞书表头**，避免 M3 数据迁移痛 |

---

## §6 5 步落地法套用

| Step | 具体化 |
|------|-------|
| 1. 拆元 | evolution-tracker 自身 = 1 个治理元；内部 4 phase 还在元的尺度内（如果 ANALYZE 长太大再拆） |
| 2. 写边界 | §0 表已写明 |
| 3. 顺序 + 跳过/插队 | READ → ANALYZE → PROPOSE → WRITE 线性；跳过条件: run 数 < N（§8.Q3 决） |
| 4. 触发 + 指标 | 触发见 §3；成功指标: (a) 议案被接受率 ≥ 30%；(b) 接受后 SKILL.md 不再产生同类 fix_notes |
| 5. 校验/修复/回滚 | 见 §5 |

---

## §7 与现有组件的关系

```
runs.jsonl ──┐
SKILL.md  ───┼──► [evolution-tracker] ──► references/weekly-review-*.md ──► [session-reporter (M3)] ──► 飞书
             │                       └──► references/skill-proposals/*.diff ──► 用户人审 ──► git apply
findings.md ─┘
```

- **依赖**: knowledge-curator（提供 runs.jsonl 数据源）；当前只有它一个数据源
- **被依赖**: session-reporter（M3，把 L2 同步飞书）
- **同层关系**: B3 memory 与 B1 互补——memory 是跨会话事实，B1 是跨 run 模式

---

## §8 用户决策（v0.1 已锁定）

> 用户 2026-4-28 答完全部 6 题，全选推荐方案。

| Q | 问题 | 决策 | 落地章节 |
|---|------|------|---------|
| Q1 | 触发模式 | **b+d**（手动 + 阈值提示 + 关键词信号；不做周期自动） | §3 触发逻辑伪码 + 反对的做法 |
| Q2 | 议案格式 | **b**（自然语言摘要在前 + 末尾 diff block） | §2 输出表 |
| Q3 | 最少 valid run 数 | **a**（1 条就能跑，弱信号要打 banner） | §4 Phase 1 最小数门槛 |
| Q4 | 议案被拒规则 | **b**（同方向 3 次 rejected → 黑名单 N 周） | §5 R2 行 |
| Q5 | evolution-tracker 兜底 | **M2 仅人审；M3 加飞书 PR-style review** | §5 新增"兜底机制不足"行 + §2 输出表 frontmatter 备注 |
| Q6 | 自循环（写自己的 runs.jsonl） | **要** | §5 静默失败行 |

### 决策衍生的新约束（已写入 §9）

- 议案 `_index.jsonl` 字段必须对齐"未来飞书表头"，避免 M3 数据迁移痛
- 关键词正则、阈值 N、cooldown 写在 SKILL.md frontmatter 可覆盖
- 议案产物末尾必须有 ` ```diff ` block 让 `git apply` 仍然能用

---

## §9 已决定不动的事（v0.1 累积）

### v0.0 起的铁律
1. **永远不动 SKILL.md**（铁律级，不可让步）
2. **每条议案必须 What/Why/Where/Risk + Diff 5 字段**
3. **写产物后立即 JSON.parse 校验**（F-008 教训）
4. **议案被拒也要存**（_index.jsonl）
5. **5 特征自检写在 SKILL.md 顶部**（蓝图 R4）
6. **产出报告时间格式遵守 CLAUDE.md 铁律 #7（北京时间）**

### v0.1 新增（来自 Q1-Q6 决策）
7. **不做周期自动跑**——可观察性优先于自动化（Q1）
8. **议案产物 = NL summary + ` ```diff ` block 二合一**（Q2）
9. **valid_run=0 → abort；valid_run=1 → banner+继续；≥2 → 正常**（Q3）
10. **同方向 3 次 rejected → 黑名单 N 周**（Q4，N 默认值待 M2.3 实现时再定）
11. **议案 `_index.jsonl` 字段对齐未来飞书表头**——M3 不必再迁移（Q5）
12. **evolution-tracker 自己写 runs.jsonl**——元自我可被复盘（Q6）

---

## §10 实现验收清单（M2.3 用）

> 写代码前的 spike 边界：以下任意一项不满足，v0.1 SKILL.md 不算完成。

- [ ] SKILL.md 顶部强制有 5 特征自检 + frontmatter 含 `THRESHOLD_N / SIGNAL_KEYWORDS / COOLDOWN_HOURS / BLACKLIST_WEEKS / MIN_VALID_RUN_FOR_NORMAL`
- [ ] 4 个 phase 各自能独立失败 + 各自有 logs（`logs/<phase>-<run_id>.log`）
- [ ] §5 表里 6 条 failure mode 都有对应代码路径（每条 → 至少 1 个 try/catch 或 assert）
- [ ] 自循环：跑完后 append 一行到自己的 `runs.jsonl`（含 `subject_skill / valid_run_count / proposals_count / wrote_files[] / accepted_count / rejected_count`）
- [ ] 议案产物 NL 部分 ≤ 200 字 / 条；diff 块标准 unified format
- [ ] cursor 文件先 `cp .bak` 再写
- [ ] **基线测试 A（弱信号档）**：构造只剩 1 条 valid run 的 fixture，应得"⚠️ 弱信号"banner + 至少 1 条议案
- [ ] **基线测试 B（normal 档，对应 §11 范例）**：用 2026-4-29 时刻的真实 runs.jsonl（L2 r=5 + L4 r=3 = 2 valid + L3 aborted）做输入，应**至少**复现 §11.4 的 P1 + P2 两条议案 + P3 reject

---

## §11 v0.2 假想范例（喂给 M2.3 校准）

> ⚠️ **v0.2 假想，M2.3 实跑后校准**——本节模拟 evolution-tracker 跑在 **knowledge-curator 当前 runs.jsonl + SKILL.md** 上**应该**产出什么。M2.3 实现后第一次 normal-档跑应能复现下述结构（§11.4 的 P1/P2/P3 是断言级别的硬指标，写入 §10 基线测试 B）。

### §11.0 输入快照（2026-4-29 10:50 时刻）

| 项 | 值 |
|---|---|
| `subject_skill` | `knowledge-curator` |
| `subject_skill_version` | `0.1.0` |
| `runs.jsonl` 行数 | 4（L1 comment + L2 wiki + L3 aborted + L4 meta_kim） |
| `valid_run_count` | **2**（L2 r=5 + L4 r=3；L3 因 `completed=false` 不计） |
| `mode` | `normal`（≥2 → 不打弱信号 banner） |
| 引用 finding | F-008, F-010, F-011, F-012 |
| cursor (`.evolution-cursor`) | 不存在（首次跑）→ 创建空 cursor + 处理全部 valid run |

### §11.1 触发回放（§3 触发逻辑命中情况）

```
on user command /evolve knowledge-curator:
  → 直接进 §4 Phase 1（无前置门槛）

[假设触发是因为关键词匹配，回放命中]
fix_notes scan against /不会|不能|没改|没变|静默|凭空|捏造|失败|进化|自我|缺|Phase|应该|fix/:
  L2.fix_notes: "不会自我进化"             → 命中 "不会" "进化" "自我"
  L4.fix_notes: "缺 Phase 7 PUSH ... 而不是" → 命中 "缺" "Phase" "应该"

unprocessed_count = 2 (L2, L4) >= THRESHOLD_N (2) → 阈值也命中
COOLDOWN: 上次提示是 2026-4-28，> 12h → 不抑制
→ 用户应该看过提示后跑了 /evolve
```

### §11.2 Phase 1 READ 产出

```
[READ] runs.jsonl 4 lines, all valid JSON ✓
[READ] cursor: not found → start from L2
[READ] SKILL.md: knowledge-curator v0.1.0, 205 lines, frontmatter parsed
[READ] 计算 valid_run_count = 2 (L2, L4)；mode = normal
```

### §11.3 Phase 2 ANALYZE 产出（pattern 聚类）

跨 run 共性表：

| pattern_id | 关键词聚类（direction） | 来源 | 类别 | 是否在 SKILL.md 已有 | 推断 |
|------------|---------------------|------|------|-------------------|------|
| `phase4_robustness` | "解析失败 / 写入丢失 / 校验" | L4 errors[0] (F-010) + 历史 F-008 + F-011 | 鲁棒性缺口 | 部分（Phase 5 LOG 提及但 Phase 4 WRITE 没硬化） | 缺 Phase 4.5 VERIFY |
| `phase7_push` | "直推 / 飞书 IM / 链接" | L4 fix_notes 主诉 + F-012 | 工作流缺口 | ❌ 全无 | 加 Phase 7 PUSH |
| `self_evolution` | "自我进化 / 治理元" | L2 fix_notes | 元元（不在本 skill 范围） | N/A | reject_out_of_scope |
| `chunk_size_limit` | "shell 大小 / chunked" | F-001 + L2 errors | 已有 workaround | 已在 Phase 4 提到 | 跳过（已解决） |

**关键判断**：
- `phase4_robustness` 和 `phase7_push` 都是 knowledge-curator 自身职责范围内 → **议案**
- `self_evolution` 是治理元自身的事（蓝图 §3.B1）→ **out_of_scope reject**

### §11.4 Phase 3 PROPOSE 产出（3 条议案，**核心**）

> 每条 = NL summary（≤200 字）→ ` ```diff ` block。被拒议案也写 `_index.jsonl`，带 `reject_reason`。

#### **P1：加 Phase 4.5 VERIFY（写入鲁棒性）**

**direction**: `phase4_robustness`
**evidence_runs**: `["2026-4-29-meta-kim"]`
**evidence_findings**: `["F-008", "F-010", "F-011"]`

**NL summary**（150 字）：
> knowledge-curator Phase 4 WRITE 缺**响应解析路径校验**和 **chunks 落盘顺序**两层硬化。证据：F-010 (parser 漏 `data.doc_id` 触发 FATAL exit)、F-011 (chunks 没全落盘 → 中断丢失需重切源恢复)、F-008 (写后不验通病)。建议在 Phase 4 末尾、Phase 5 LOG 之前插 Phase 4.5 VERIFY，三步硬化：解析 `j.data.doc_id` / chunks 必须先全部落盘再 create / 写后立刻 JSON.parse 校验。

```diff
--- a/.claude/skills/knowledge-curator/SKILL.md
+++ b/.claude/skills/knowledge-curator/SKILL.md
@@ Phase 4: WRITE @@
   ```bash
   lark-cli docs +update --doc "<doc_id>" --mode <chosen> ...
   ```
+
+### Phase 4.5: VERIFY（写入后强制校验）
+
+`+create` / `+update` 调用后**必须**：
+
+1. **响应解析**：从 `j.data.doc_id` 和 `j.data.doc_url` 取 token（**不是**顶层）。失败立即 abort，不重试。
+2. **chunks 落盘顺序**：分块写入时**必须先把所有 chunks 写到 `tmp/chunk_*.md`**，再开始 create + append 循环。中途失败可从 `tmp/` 恢复，不必重切源文件。
+3. **写后校验**：任何写入 JSONL 后立刻对每行 `JSON.parse`；失败 abort 并提示行号。
+
+> **来源**：F-008（写后不验）+ F-010（parser 漏 `data.doc_id`）+ F-011（chunks 落盘顺序反模式）
 
 ### Phase 5: LOG（写日志，供自我进化）
```

**Risk**: Phase 4.5 加进来要保持 `Phase 5 LOG` 即使 4.5 abort 也能记错。M2.3 实现时务必双向 try/finally。

---

#### **P2：加 Phase 7 PUSH（产出直推飞书 IM）**

**direction**: `phase7_push`
**evidence_runs**: `["2026-4-29-meta-kim"]`
**evidence_findings**: `["F-012"]`

**NL summary**（197 字）：
> knowledge-curator 缺 Phase 7 PUSH——产出后只在终端打印 doc_url，用户必须手动点链接。证据：L4 user_feedback rating=3 直接说"飞书文档可以直接发到我的飞书上面去 ... 而不是给一个链接，自己还要打开"+ F-012。**已用 lark-cli im 手动验证此路通**（msg_id `om_x100b...`，2026-4-29 10:40）。建议在 Phase 6 REPORT 之前插 Phase 7 PUSH：默认 `--user-id <open_id from global memory>`；user_id 缺失时询问手机号 → `lark-cli contact` 查 open_id 兜底。

```diff
--- a/.claude/skills/knowledge-curator/SKILL.md
+++ b/.claude/skills/knowledge-curator/SKILL.md
@@ Phase 5: LOG @@
   "user_feedback": { "rating": null, "fix_notes": null }
   }
   ```
+
+### Phase 7: PUSH（产出直推飞书 IM）
+
+**铁律**：成功跑完（含 user_feedback 待填）后、Phase 6 REPORT 之前，**必须**直推。
+
+1. **目标**：默认 user open_id（从 global memory 读，如 `ou_835b...`）
+2. **兜底**：user_id 缺失 → 询问用户手机号 → `lark-cli contact +users-search --mobile <phone>` 取 open_id
+3. **内容**：doc 标题 + URL + 关键章节摘要 + errors 摘要（≤300 字）
+4. **命令**：`lark-cli im +messages-send --user-id <ou_xxx> --as bot --markdown "$(cat tmp/push.md)"`
+5. **失败处理**：推送失败时**不**回滚 doc 创建（doc 已成事实），只在 runs.jsonl 的 errors 字段记 `push_failed: <reason>`
+
+> **来源**：F-012 + L4 user_feedback "飞书文档应直推 IM 而不是给链接"
 
 ### Phase 6: REPORT（向用户汇报）
```

**Risk**: 推送失败的兜底——M2.3 实现时若 `lark-cli contact` 也失败，要明示用户"手动复制 URL"，不要静默吃掉错误。

---

#### **P3 (rejected, out_of_scope)：L2 "不会自我进化"**

**direction**: `self_evolution`
**evidence_runs**: `["2026-4-28-harness-trilogy"]`
**status**: `out_of_scope`
**reject_reason**: `这是治理元自身的事（蓝图 §3.B1），即 evolution-tracker 本身。knowledge-curator 不该改自己来"自我进化"。`
**reject_count_same_direction**: 1（首现，未上黑名单；连续 3 次同方向才进 BLACKLIST_WEEKS=4 周冷冻）

**NL summary**（130 字）：
> L2 fix_notes "不会自我进化" 映射到治理元缺失（蓝图 §3.B1）。evolution-tracker 自身就是这个的答案——不应在 knowledge-curator SKILL.md 加"复盘逻辑"。reject_reason: out_of_scope。direction `self_evolution` 首次出现，记 1/3，未上黑名单。

### §11.5 Phase 4 WRITE 产出（5 个文件 + cursor）

```
[WRITE]
  references/weekly-review-2026-W18.md            (人审复盘 markdown)
  references/skill-proposals/P-2026-4-29-001.diff  (P1 完整 diff)
  references/skill-proposals/P-2026-4-29-002.diff  (P2 完整 diff)
  references/skill-proposals/P-2026-4-29-003.md    (P3 仅 NL，rejected 不出 diff)
  references/skill-proposals/_index.jsonl          (议案池 + 状态)
[UPDATE]
  .claude/skills/knowledge-curator/logs/.evolution-cursor → 2026-4-29-meta-kim
  .claude/skills/knowledge-curator/logs/.evolution-cursor.bak (备份)
[SELF-LOOP]
  .claude/skills/evolution-tracker/logs/runs.jsonl 追加 1 条（subject_skill=knowledge-curator）
```

**终端打印**（≤30 行）：
```
✅ evolution-tracker 完成 (2026-4-29 11:45:23)
  subject: knowledge-curator v0.1.0
  valid_runs: 2 (L2 r=5, L4 r=3)
  mode: normal
  proposals: 3 (2 actionable + 1 rejected)
    P-2026-4-29-001  phase4_robustness   评估"加 Phase 4.5 VERIFY"
    P-2026-4-29-002  phase7_push         评估"加 Phase 7 PUSH 直推飞书"
    P-2026-4-29-003  self_evolution      [REJECTED out_of_scope, 1/3]
  files written: 5
  next: 运行 `git apply references/skill-proposals/P-2026-4-29-00{1,2}.diff` 接受议案；或 `evolution-tracker --reject P-2026-4-29-001 --reason "..."` 留拒因。
```

### §11.6 `_index.jsonl` Schema（M2.3 锁定，对齐飞书 Bitable）

```jsonl
{"proposal_id":"P-2026-4-29-001","created_at":"2026-4-29 11:45:23","subject_skill":"knowledge-curator","subject_skill_version":"0.1.0","direction":"phase4_robustness","nl_summary":"<≤200字>","diff_path":"references/skill-proposals/P-2026-4-29-001.diff","evidence_runs":["2026-4-29-meta-kim"],"evidence_findings":["F-008","F-010","F-011"],"status":"pending","decided_at":null,"decided_by":null,"reject_reason":null,"reject_count_same_direction":0}
```

| 字段 | 类型 | 飞书 Bitable 字段类型（M3 同步） | 说明 |
|------|------|----------------------------|------|
| `proposal_id` | string PK | 文本（主索引列） | `P-YYYY-M-D-NNN` |
| `created_at` | string | 日期时间 | 北京时间，铁律 #6 |
| `subject_skill` | string | 单选 | 枚举 = 项目所有 skill |
| `subject_skill_version` | string | 文本 | semver |
| `direction` | string | 单选 | 同方向聚类用，`*_robustness` / `*_push` / `*_evolution` 等 |
| `nl_summary` | string ≤200 字 | 多行文本 | 人读用 |
| `diff_path` | string | 文本（链接列） | 项目相对路径；M3 转飞书附件 |
| `evidence_runs` | array<string> | 多选 | run_id list；多选枚举 |
| `evidence_findings` | array<string> | 多选 | F-NNN list |
| `status` | enum | 单选 | `pending / approved / rejected / superseded / blacklisted / out_of_scope` |
| `decided_at` | string \| null | 日期时间 | 决策时刻 |
| `decided_by` | enum \| null | 单选 | `user / auto`（M2 全 user） |
| `reject_reason` | string \| null | 多行文本 | 自由 |
| `reject_count_same_direction` | number | 数字 | 同方向累计；触发 3 振 → `status=blacklisted` + 冻结 4 周（BLACKLIST_WEEKS） |

> **关键约束**：飞书 Bitable 单选枚举支持动态加值——`subject_skill` / `direction` 不必预定义全部，按需扩。M3 只需 `csvexporter` 把 jsonl 列对齐 csv header 即可一键导。

### §11.7 SKILL.md frontmatter Schema（M2.3 锁定）

```yaml
---
name: evolution-tracker
version: 0.1.0
description: "..."
metadata:
  requires:
    bins: ["node"]
    skills: []  # 不依赖其他 skill 运行时
  evolution:
    THRESHOLD_N: 2                # 阈值提示门槛
    SIGNAL_KEYWORDS:              # 关键词正则（or 关系）
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
    COOLDOWN_HOURS: 12            # 同时触发抑制
    BLACKLIST_WEEKS: 4            # 同方向 3 振冷冻周数（Q4=b）
    MIN_VALID_RUN_FOR_NORMAL: 2   # < 2 时打 ⚠️ 弱信号 banner
---
```

### §11.8 飞书表头预对齐（Q5 落地）

M3 阶段把 `_index.jsonl` 灌进飞书 Bitable 时的字段一一对应（见 §11.6 表第 3 列）。M2 阶段不动飞书，只**保证字段名 + 类型不会让 M3 重写**。具体：

- ✅ JSONL key 全部用 snake_case（飞书 Bitable 字段名也支持 snake_case）
- ✅ 时间戳全用北京时间字符串（飞书 datetime 字段直接吃）
- ✅ 多值字段用 array of string（M3 转 multi-select 时 join `,` 即可）
- ❌ **不用** nested object（飞书 Bitable 不支持嵌套 → 平铺）
- ❌ **不用** 不可枚举 string（如自由 UUID）做 single-select；除非该字段就是文本

### §11.9 倒逼定下来的 3 件事 ✅

| 倒逼项 | 状态 | 落地位置 |
|--------|------|---------|
| 议案 NL+diff 格式具体化 | ✅ | §11.4 P1/P2 实例（NL 含字数 + diff 标准 unified format + Risk 段） |
| `_index.jsonl` schema 字段 | ✅ | §11.6 表（含飞书 Bitable 类型映射） |
| 飞书表头对齐（Q5） | ✅ | §11.8 4 条规则 |

### §11.10 对 §10 验收清单的修订（已写回）

§11 写完发现 §10 应补强：

- ✅ 已加 `BLACKLIST_WEEKS / MIN_VALID_RUN_FOR_NORMAL` 到 frontmatter checklist
- ✅ 已加自循环字段 `accepted_count / rejected_count`
- ✅ 已加**基线测试 B**（normal 档），断言至少复现 P1+P2+P3
- 保留**基线测试 A**（弱信号档），用人造 fixture 单独验证

---

## 修订历史

- 2026-4-28 v0.0: 骨架创建。会话 8 因 M1.5 网络阻塞，提前启动 M2 草案。等用户答 §8 Q1-Q6 → 整合 v0.1。
- 2026-4-28 v0.1: 用户全选推荐方案；§3 锁触发逻辑（b+d 混合 + 反对周期自动）；§2 锁议案格式（NL + diff 二合一）；§4 Phase 1 加最小数门槛；§5 加 3 振黑名单 + M2/M3 兜底分层；§9 累积 12 条铁律；新增 §10 M2.3 实现验收清单。可进 M2.3 实现。
- 2026-4-29 v0.2: M2.2.5 完成。基于真实 runs.jsonl（L2 r=5 + L4 r=3 = 2 valid + L3 aborted）+ findings F-008/F-010/F-011/F-012，新增 §11 假想范例（10 节）：触发回放、4 phase 产出、3 条议案（P1 Phase 4.5 VERIFY + P2 Phase 7 PUSH + P3 reject self_evolution as out_of_scope）、`_index.jsonl` schema（13 字段含飞书 Bitable 类型映射）、SKILL.md frontmatter schema（5 个 evolution 参数）、飞书表头预对齐 4 规则。倒逼定的 3 件事全部落地。§10 同步加 frontmatter 字段 + 基线测试 B（断言 §11.4 P1+P2+P3 必复现）。可进 M2.3 实现。
