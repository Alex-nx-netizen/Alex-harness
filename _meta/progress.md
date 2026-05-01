# Progress Log

> 每次有产出就追加一条。**最新的在最上面**。

---

## 2026-5-1

### 会话 15：M4b session-reporter v0.1.0 落地（task 4.6-4.8 全完成）

- ✅ **task 4.6**：设计草案 Q1-Q5 全选推荐确认；Base(token: Se8obIsyTa5SmfsOMK8cA9d3nNc / table: tbl6hG1Ldp6o2RWN) + IM 双写；每会话粒度；✅行+结构化；cursor 增量；Stop hook 触发
- ✅ **task 4.7**：`.claude/skills/session-reporter/SKILL.md` 写成（218 行；4 phase PARSE/DIFF/PUSH/LOG；6 失败模式；cursor 幂等机制）
- ✅ **task 4.8**：`run.cjs` (~200 行) 实现 + 跑通；关键 bug 修复：`+records-create`→`+record-upsert`（lark-cli 实际命令）/ `{"fields":{...}}`→平铺格式 / IM `|`→`·`（cmd.exe shell 解析冲突）；**35/35 会话成功推 Base**；IM 验证通过
- ✅ **Stop hook** 接通：`settings.local.json` 写入 Stop hook + `Bash(lark-cli base *)` 权限
- 🎯 **M4b (session-reporter B2) 完成**：所有历史会话入 Base；后续每次会话结束自动增量推送

### 会话 14：M4a mode-router v0.1.0 落地（task 4.2-4.5 全完成）

- ✅ **task 4.2**：用户答 Q1-Q5（Q1=并行+审查 / Q2=C推荐+确认 / Q3=subagent+peer_review / Q4=A自动降级 / Q5=打印+日志）；design/mode-router-draft.md → v0.1
- ✅ **task 4.3**：`.claude/skills/mode-router/SKILL.md` 写成（241 行；4 phase DETECT/ROUTE/RECOMMEND/LOG；5 特征自检；8 验收项；output schema 13 字段）
- ✅ **task 4.4**：`run.cjs` 实现（130 行；信号词检测→决策矩阵→格式化打印→JSONL 双写）；LLM 降级检测 / 显式覆盖 / 推荐等确认 3 路径全通
- ✅ **task 4.5**：5/5 验收通过：并行信号→team/subagent ✅ / review 信号→peer_review ✅ / 无信号→solo ✅ / 显式 solo 自动记录 ✅ / --log+--list 日志正常 ✅
- 🎯 **M4a (mode-router B4) 完成**：`_meta/mode-router-log.jsonl` + `logs/runs.jsonl` 双写，已接入 evolution-tracker 消费路径

### 会话 13：task 1.9 M1 正式关闭 + M4 规划

- ✅ **task 1.9 完成**：`_meta/reviews/m1-retrospective.md` 写成（19 findings 分类 / 7 超出原计划产出 / M1 核心数据表 / M2 起点声明）
- ✅ **M1 正式关闭**：task_plan.md 当前阶段 → Phase 4/M4；1.9 重复行合并；M4 任务树（4.1-4.8）新增
- 📋 **M4 计划确定**（用户 2026-5-1）：① mode-router (B4) → ② B2 「推飞书成长日志」

## 2026-4-30

### 会话 12（续 3）：diff 假阳性修复完成 + 蓝图 gap 分析
- ✅ **context-curator diff 假阳性修复**（Change 3 of 3）：`extractPrevSnapshotIds` 重写——优先读 frontmatter `task_ids` / `finding_ids` / `proposal_ids` JSON 数组；只有旧 snapshot 无这些字段时才 fallback 到 body regex。前两个 Change（phase3Summarize 返回 curr_ids + phase4Emit 写 frontmatter）上一会话已完成。
- ✅ **验证通过**：第 1 次跑（写入含 frontmatter 的新 snapshot）→ 第 2 次跑立即显示"**无变化**"——假阳性从"37 新 task + 17 新 finding"归零。
- ✅ **蓝图 gap 分析完成**（详见会话记录）：16 元中已建 3 个（evolution-tracker ✅ / context-curator ✅ / knowledge-curator ✅），缺 A1/A2/A4/A6/A8（业务元）+ B2/B4（治理元）+ C1/C2（节奏元）；M1 85%+ 完成 / M2 已提前建 / M3 context-curator 替代；M4 (mode-router) 是下一个合理节点

### 会话 12（续 2）：P-003/P-004 落地 + P-001/P-002 清理
- ✅ **P-2026-4-30-003 approved + applied**（run.cjs Level 5.5）：在 Level 5（current clip）和 Level 6（compact_mode）之间插入 Level 5.5——progress → 1 entry ≤60字 / findings → 1 finding ≤60字，truncated_sections 加 "micro_compress"；node --check 语法 OK
- ✅ **P-2026-4-30-004 approved + applied**（SKILL.md Phase 4.5 VERIFY）：插入 3 步强制校验章节（响应解析 j.data.doc_id / chunks 全落盘顺序 / 写后 JSON.parse）；来源标注 F-008 + F-010 + F-011
- ✅ **P-2026-4-30-001 + P-002 rejected**：与 P-003 重复且 evidence_runs 更少；_index.jsonl 写后校验 OK（4 entries all valid JSON）
- 🎯 **context-curator v0.1 meta-loop 完整闭合**：5 次 run → 4 valid rated → tracker 产 4 条议案 → 2 rejected / 2 approved + applied → SKILL.md + run.cjs 升级

### 会话 12（续）：phase4_robustness 解锁 + 4 valid run 闭环
- ✅ **L2 评分**（run 2026-4-30-111943 → 4/5）：fix_notes="diff 假阳性严重——prev_ids 被截后 31 个 task 全显示为新；progress/findings 压成 count；800/800 满载"
- ✅ **L4 评分**（run 2026-4-30-215512 → 3/5）：fix_notes="hard_trim 触底（11 级全触）；diff 假阳性 37 tasks 全新；Phase 4 EMIT 写入后无校验步骤（F-008 模式）"
- ✅ **evolution-tracker 跑（4 valid runs, mode=normal）**：
  - `clusters_found: 2 (0 progress_md_only)` — phase4_robustness 解锁（L4 fix_notes 含 "Phase 4"/"校验"/"写入" 提供 run 实证）
  - `P-2026-4-30-003 (curator_truncate_aggressive) [PENDING]`：Level 5.5 插入平滑截断曲线
  - `P-2026-4-30-004 (phase4_robustness) [PENDING]`：Phase 4.5 VERIFY（j.data.doc_id 解析 + chunks 落盘 + 写后 JSON.parse 校验）；evidence_findings=F-008/F-010/F-011
- 🎯 **P-001 第三证据流完整闭合**：progress_md_only → 有 run 实证 → 解锁 → 产出真议案

### 会话 12：P-2026-4-30-001 实施 — progress.md 第三证据流落地
- ✅ **phase1_read.cjs**：加 `PROGRESS_KEYWORDS`（9 个正则：踩坑/坑/失败/abort/F-NNN/没生效/重复/自跑/dangling）；加 `progressPath` 入 paths 对象；加 `progress_entries: []`；步骤 4.6 调用 `readProgressMd(progressPath, 14)`；`formatPhase1Log` 补 progress_entries 摘要段；新增 `readProgressMd(progressPath, windowDays)` 函数（按 `## YYYY-M-D` 切日、`### ` 切 session、14 天窗口过滤、关键词行保留）
- ✅ **phase2_analyze.cjs**：加 `progress_entries_count` 统计；主循环后加 progress_entries 消费循环；加 `progress_md_only` 标记（evidence_runs.length === 0 的 cluster 打标）；新增 `addProgressEvidence(result, rule, entry)` 函数（source="progress_md", run_id=null）；`formatPhase2Log` 补 `progress_entries_consumed` + `(N progress_md_only)` 展示
- ✅ **phase3_propose.cjs**：加 `skipped_progress_md_only: []`；proposal 循环加 progress_md_only gate（continue + push 到 skipped 列表）；`formatPhase3Log` 补 skipped_progress_md_only 段
- ✅ **验证跑**（context-curator 模式）：
  - `progress_entries: 20`（14 天内含坑/失败等信号的 progress.md 段落）
  - `clusters_found: 2 (1 progress_md_only)`
  - `skipped_progress_md_only: 1` → `phase4_robustness`（仅 progress_md 证据，无 run 实证）
  - `proposals: 1 (actionable=1)` → `P-2026-4-30-002 curator_truncate_aggressive [PENDING]`
- 🎯 **P-2026-4-30-001 全链路闭合**：approved → 实施 → 验证通 → task 3.17 ✅

### 会话 11：context-curator FATAL 修复 + task 3.16 PROPOSAL_TEMPLATE 落地 + 首条真议案
- ✅ **context-curator Level 8 hard_trim**：削减阶梯全跑完仍超 800 字时不再 FATAL，直接截断 body 到 800 字兜底；run_id=2026-4-30-215512 成功 800/800
- ✅ **task 3.16 完成（F-018 修复路径）**：在 phase3_propose.cjs 加 `curator_truncate_aggressive` PROPOSAL_TEMPLATE（5 字段全，NL=165字）
- ✅ **evolution-tracker 产出第一条真议案**：跑 `context-curator` 模式 → clusters_found=1 → proposals=1 → `P-2026-4-30-001 (curator_truncate_aggressive) [PENDING]`（diff_path=references/skill-proposals/P-2026-4-30-001.diff）
- 🎯 **F-018 物质化闭合**：之前暴露"新 direction 缺 PROPOSAL_TEMPLATE → 0 议案"，今天修复后立刻产出真议案，验证路径通

### 会话 10（续 6）：第 3 次跑 + meta-loop 真闭合 + 暴露 F-018/F-019
- ✅ **修 dangling 2.4→2.3**（F-016 cleanup）：标 2.4 ✅；tracker 已多次运行
- ✅ **第 3 次跑 context-curator**：run_id=2026-4-30-154503 / 654 字
- ✅ **真 fix_notes 评分**（≥30 字 + 含 6 个新 SIGNAL_KEYWORDS）：rated 4
- 🔴 **跑 tracker 第 1 次**：clusters_found=0 仍是 0 议案 — 暴露 **F-019**
  - SKILL.md SIGNAL_KEYWORDS frontmatter **从未被 ANALYZE 真用**
  - 真正驱动聚类的是 phase2_analyze.cjs **硬编码 DIRECTION_RULES**
  - P-002 B 的 13 个关键词扩展实际是 no-op（设计-实施双源真理）
- ✅ **修 F-019**：在 phase2_analyze.cjs 加 `curator_truncate_aggressive` + `curator_diff_falsepositive` 两条 DIRECTION_RULE
- 🟡 **跑 tracker 第 2 次**：clusters_found=1 / direction=curator_truncate_aggressive ✅；但 proposals=0 — 暴露 **F-018**
  - 新 DIRECTION_RULE 缺 PROPOSAL_TEMPLATE 配套，PROPOSE 阶段静默跳过
  - 完整加新 direction 需 2 处改动：DIRECTION_RULES + PROPOSAL_TEMPLATES
- ✅ **mode 从 weak_signal 升 normal**（valid_run_count=2 ≥ 阈值）
- ✅ **F-018 + F-019 写入 findings.md**
- ✅ **P-001 status=approved**（实施 defer W3，按原推荐）；3.16 task 跟踪 PROPOSAL_TEMPLATE 补充
- 🎯 **里程碑级元洞察**：personal harness 在自我使用过程中暴露了**两个隐藏的设计-实施双源真理**，比理论思考强得多

### 会话 10（续 5）：P-2026-4-30-002 A+B 同时落地（Alex "一起做了"）
- ✅ **A：skill_feedback rateRun 加 fix_notes 质量门**
  - `MIN_FIX_NOTES_CHARS = 30` 常量
  - trim 去掉首尾空白 + 标点（含中文：。·…）
  - 短于阈值 → 友好错误（含 2 个 ✅ 范例 + 3 个 ❌ 范例 + 绕过提示）
  - `--allow-short` 转义放行（明示该 run 在 tracker 中标 uncategorized）
  - main() 加 isAllowShort 解析
- ✅ **B：SKILL.md SIGNAL_KEYWORDS 加 13 个具象词**
  - 压成 / 看不到 / 激进 / 不到 / 太激 / 太多 / 截断 / 假阳性 / 噪声 / 漏 / 重复 / 想要 / 希望
  - 老 14 词保留；新词带注释 `# P-2026-4-30-002 B 扩展`
- ✅ **3 case 测试**：
  - "ok" (2 字) → 拒
  - "ok" + `--allow-short` → 通
  - "二跑 800/800 字满载，diff 工作但有假阳性" (27 字) → 拒（边界正确）
- ✅ **P-2026-4-30-002 status=approved**（_index.jsonl 加 decided_at + decided_by + applied_notes）
- 🎯 **议案池第一次走完完整闭环**：pending → approved → applied
- 🔮 **回溯效益**：未来任何 user_feedback 驱动的 skill 都受益；F-017 模式被制度化

### 会话 10（续 4）：meta-loop 第一次在 context-curator 上闭合 + F-017 暴露
- ✅ Alex 自己用 skill_feedback CLI 给 context-curator run 1 打 4 分（fix_notes="..."；rated_at 2026-4-30 13:42:53）
- ✅ 跑 evolution-tracker context-curator → mode=weak_signal / valid=1 / proposals=0 / 1 uncategorized
  - run_id: `evt-2026-4-30-context-curator-144737`
  - 产出：`weekly-review-2026-W18.md` + `_index.jsonl` 初始化 + cursor + 自循环 runs.jsonl
- 🔍 **0 议案 = 信号缺失**（不是 bug）：fix_notes "..." 不含任何 SIGNAL_KEYWORDS（不会/缺/Phase/应该/fix 等）→ Phase 2 进 uncategorized → Phase 3 不产 direction
- ✅ **F-017 finding 落地**：空/极简 fix_notes 让 tracker 跑 0 议案——meta-loop 看似闭合实空转的死循环；任何 user_feedback 驱动的 skill 都受影响
- ✅ **P-2026-4-30-002 议案候选**（meta_loop_observation 来源）：
  - A = skill_feedback CLI 加 fix_notes ≥30 字质量门 + `--allow-short` 转义（推荐立刻做）
  - B = evolution-tracker SIGNAL_KEYWORDS 扩展具象词（推荐 W3 末再决定）
- 🎯 **里程碑意义**：personal harness 第一次出现"系统暴露自身设计假设漏洞"的实证——比理论强；evolution-tracker 在自己产物上发现"打分 ≠ 进化"

### 会话 10（续 3）：skill_feedback.cjs — meta-loop 触发器
- ✅ 新文件 `_meta/skill_feedback.cjs`（227 行）：通用 user_feedback 更新 CLI
  - `--list` 模式：扫 skill runs.jsonl，标 ⚪ unrated / ⭐ rated
  - 主用法：`<skill> <run_id> <rating 1-5> [fix_notes]`
  - 安全：写前后双 JSON 校验 + `.bak` 自动备份；roundtrip 验证
  - 防错：rating 必须 1-5 整数 / run_id 不存在打印可用列表 / 已评分需 `--force`
  - immutable update（铁律：不 mutate）
- ✅ 4 case 测试通过：list ✓ / dry-run ✓ / 无效 rating ✓ / 不存在 run_id ✓
- ✅ context-curator SKILL.md §8 加评分入口指引
- 🎯 **打通 meta-loop**：knowledge-curator 已用此模式（runs.jsonl L2/L4 有 rating），现在 context-curator 也接入；evolution-tracker 一旦看到 rated run 就能跑复盘
- ⏸ **下一步等 Alex 评分**：用了 context-curator 之后给个 rating + fix_notes → tracker 自动启动

### 会话 10（续 2）：context-curator v0.1.0 落地 + 端到端跑通
- ⚠️ 用户"今天就要用"覆盖了"sit 一晚"推荐 → 立即装 + 实现 + 跑
- ✅ **`.claude/skills/context-curator/SKILL.md`**（241 行）：frontmatter 6 curator 参数 + 5 特征自检 + 4 phase + 决策记录（§6 = Q1-Q5 全选推荐）+ 7 失败模式 + 自循环 schema
- ✅ **`run.cjs`** 单文件 executor（~600 行）：
  - Phase 1 SCAN：扫 6 源 + skills + prev snapshot + mtime
  - Phase 2 EXTRACT：task_plan / progress / findings / memory / blueprint TOC / skill frontmatter / runs.jsonl 异常过滤
  - Phase 3 SUMMARIZE：800 字硬上限 + **7 级削减阶梯**（blueprint→progress→findings→memory→current→compact_mode→memory_titles_only/skills/anomalies/memory_top3）；超 800 abort
  - Phase 4 EMIT：snapshot.md + _index.jsonl + _latest.txt + 自循环 runs.jsonl + 14 天归档
- ✅ **安全写入器**：拒绝任何非 `_meta/context-snapshots/` 或自己 logs 的写入路径（铁律 #5）
- ✅ **首跑** `2026-4-30-111721`：611/800 字；触发 7 级中的 5 级削减；6 sources 全见；anomalies=1（meta-kim errors=1）
- ✅ **二跑** `2026-4-30-111943`：800/800 字（满）；diff 段触发 — 列出 31 task / 15 finding / 4 议案"新"（注：因首跑被 compact_mode 削减，prev_ids 残缺导致假阳性，是已知设计权衡）
- 🔍 **暴露的小问题**：truncate 阶梯过激（compact_mode 一来 progress/findings 直接变成"5 entries; truncated"）→ 未来 v0.2 可优化为更平滑曲线
- ✅ **task_plan 3.3/3.4/3.5 全 ✅**；M3 #1 context-curator 进入 dogfooding 期

### 会话 10（续 1）：B2 落地 — next_actions.cjs（readiness queue）
- ✅ Alex 拍"按推荐"= 三选一 仅 B2
- ✅ 新文件 `_meta/next_actions.cjs`（197 行）：
  - 读 task_plan.jsonl，分 9 类 bucket
  - 顶部建议算法：优先 in_progress > ready_to_unblock > unknown_ready
  - `--all` 显示终态；`--json` 给脚本化用
  - 只读 jsonl，绝不改 md（沿用 sync_task_plan 的"md 主权"原则）
- ✅ 首跑暴露 3 个真 actionable：
  - 🔄 1.9（in_progress，但其实是历史遗留 dup row，下次手动收）
  - 🟢 3.3 写 context-curator SKILL.md（解锁自 3.0）— 但 Alex 推荐 b "sit 一晚"，所以今天不做
  - 🟢 3.6 自己（已在做）
- 🛑 决策 1 + 2 不动手：
  - context-curator SKILL.md → sit 一晚（Alex 拍"按推荐"= b）
  - P-2026-4-30-001 → defer 到 W3 末（Alex 拍"按推荐"= b）

### 会话 10：W2 决策落地 + Ralph 复盘
- ✅ **Ralph (snarktank/ralph) 分析推飞书 IM**：msg_id `om_x100b501ff196f480b4cd5bb9156643d`（10:18:30）；明确借鉴/反对/待考虑边界
- ✅ **W2 大方向决策（Alex 拍 "C 优先 B 暂缓"）**：
  - **C = context-curator** 优先做（M3 #1）
  - **B = intent-router** 暂缓 / deprecated（等 dogfooding ≥5 case 再说）
  - 旧推荐 A（dogfooding 期）被覆盖 — Alex 选了"做 C 同时事实上也在 dogfooding"的合并路径
- ✅ **`design/context-curator-draft.md` v0.1**：§6 5 问全选推荐 ✅（a 手动触发 / 800 字 / 异常有界扫 / 14 天保留 / 输出 diff）；进 SKILL.md 实现门槛已满足
- ✅ **`design/intent-router-draft.md` deprecated 锁**：§0 Q0=D；写明 3 条复活硬门槛（5 真实 case + 单方向聚焦 + curator ≥2 周稳定）
- ✅ **议案候选 P-2026-4-30-001 写入**（手动种子，灵感: Ralph progress.txt）：
  - 位置：`.claude/skills/evolution-tracker/references/skill-proposals/P-2026-4-30-001.md` + `_index.jsonl`
  - direction: `cross_session_pattern_mining`
  - 让 evolution-tracker Phase 1 加读 `_meta/progress.md` → Phase 2 第三个证据流
  - status=pending；Alex 备注建议 defer 到 W3 末复盘一并审视
- 🎯 **下个决策点**：context-curator 进 SKILL.md 实现（要不要现在就装项目级 skill？还是等 design v0.1 再 sit 1-2 天再装）；以及 task_plan.jsonl Ralph 模式深化的具体落地（见会话末讨论）

---

## 2026-4-29

### 会话 9（续 9）：W2 启动 — 改名 + BC draft v0.0
- ✅ **黄聪 → Alex 全局改名**：51 次替换 / 31 个活配置文件（项目内 + 全局 memory + 跨项目 memory + 旧路径）；归档 / 会话历史 / 日志（789 处）保留作不可变审计
- ✅ **`design/context-curator-draft.md` v0.0**：5 特征 3 ✅ 2 ⚠️；3 phase SCAN→SUMMARIZE→EMIT；§6 5 个 Q 待 Alex 拍
- ✅ **`design/intent-router-draft.md` v0.0**：⚠️ §0 reality check 摆出"和 CC 自带 skill 选择重复"的核心风险 + 3 个有意义的差异化方向（A 多 skill 链路 / B 歧义反问 / C 阶段感知）；推荐 D=deprecated 直到 dogfooding 收集 ≥5 case
- 🛑 **明天 Alex 审 draft 后再启动**：先答 context-curator §6 Q1-Q5 + intent-router §6 Q0 → 进 v0.1 → 才写 SKILL.md + executor

### 会话 9（续 8）：A 全包跑完 → M1 正式完结
- ✅ **P0 完成**：补 L5 user_feedback（rating=5，"完全没问题，非常仔细"忠实记录 + skill 含义）
- ✅ **P1 完成**：跑 evolution-tracker → mode=normal / valid_runs=3 / proposals=0 (actionable=0)
  - 3 cluster 全部分类正确：self_evolution=skip_already_out_of_scope / phase7_push=skip_already_approved / phase4_robustness=skip_already_approved
  - investment run 的 fix_notes 进入 uncategorized（无 actionable 信号）= 正确行为
  - **议案池保持空 = 治理元 R2 物质化证据**（不为了进化而进化）
- ✅ **P2 完成**：weekly-review-2026-W18.md（双产物模式）
  - 机器 stub（evolution-tracker 自动产出）= 透明数据
  - 人工 augment 4 部分：时间线 / W0→W1 数据对比 / 3 个关键复盘点 / W2 决策待用户拍
- ✅ **task_plan**：1.6/1.7/1.8/1.9 全部 ✅；M1 正式收线
- 🎯 **M1 完结**：5 周路线图启动准备就绪，下个决策点 = W2 大方向 A/B/C

### 会话 9（续 7）：M1.6 完成 — investment 第 3 次跑 → H-001 达标
- ✅ **Phase 1 INTAKE**：WebFetch baijiahao 1824283363061572650（投资理财 10 种方法）
- ✅ **Phase 2 STRUCTURE**：写 `tmp/investment_full.md`（188 行 / 5140 JS chars / 9822 UTF-8 bytes）；含 §6 用户主权区 + 5 个 skill 边界观察点
- ✅ **Phase 4 EXECUTE**：`tmp/investment_create.cjs`（应用 F-010 解析 j.data.doc_id + F-011 chunks 全预写）；单 chunk 一次创建成功
- ✅ **Phase 4.5 VERIFY**（首次完整跑通）：
  - parse `j.data.doc_id` ✓（不再走 j.objToken 弯路）
  - chunks 预写到磁盘 ✓（中途不会丢）
  - `JSON.parse` roundtrip ✓（runs.jsonl 5/5 lines 全 parse）
- ✅ **Phase 5 LOG**：runs.jsonl L5 加入；包含 5 条 learnings
- ✅ **Phase 7 PUSH**：lark-cli IM 直推 user open_id；message_id=om_x100b502b9ad56ca4b4c7a7cdf63ef50（2026-4-29 20:44:49）
- 📄 **产出文档**：`[AI学习] 穷人理财 10 种低门槛方法（百家号思守一财经）` - https://www.feishu.cn/wiki/Vcr1wVQPgit8nwk88q3cbsyRnhd
- 🎯 **H-001 达标**（M1 关键里程碑）：3 valid runs（harness-trilogy + meta-kim + investment）→ evolution-tracker 启动条件满足
- 🧪 **议案落地零意外验证**：P-002 (Phase 4.5 VERIFY) + P-003 (Phase 7 PUSH) 第一次跑就一发命中，**evolution-tracker 自我进化产出工程价值的真实证据**
- 🔍 **暴露 skill 边界**（待用户填 fix_notes）：模板"核心概念速查表"对方法论文档不太合适，本次手动改成"10 种方法对照表"——候选议案：模板按 intent 子类（理论/实操）分流
- ⏸ **下一步等用户**：§6 给 rating + fix_notes → 才能触发 1.7 完结 + 1.8 weekly-review

### 会话 9（续 6）：F-016 修（sync_task_plan.cjs 加引用完整性校验）
- ✅ **F-016 短期方案落地**：`sync_task_plan.cjs` 加 blocked_by 引用完整性校验
- ✅ **新字段 `dangling_blocked_by`**：野指针时为 `["2.3"]`，干净时为 `null`
- ✅ **首次跑暴露**：1 个 dangling（2.4 → 2.3，因为 2.3 已拆 2.3.1+2.3.2）
- ✅ **evolution-tracker Phase 1 自动读到**：下次跑就能在 task_plan section 看到引用完整性 warn

### 会话 9（续 5）：Ralph 嫁接 — task_plan.jsonl 镜像
- ✅ **新文件 `_meta/sync_task_plan.cjs`**（112 行）：单向 md → jsonl，task_plan.md 保持用户主权区
- ✅ **新文件 `_meta/task_plan.jsonl`**：26 行（每 task 一条），含 task_id/phase/subject/status/passes/blocked_by/notes/synced_at
- ✅ **借鉴 Ralph 的设计**：
  - **passes 字段**：每 task 机器判定通/不通（≈ Ralph prd.json `passes:true`）
  - **blocked_by 解析**："等 X.Y" → `[X.Y]`，"等 1.5-1.7" 范围展开成 `["1.5","1.6","1.7"]`
  - **subject_has_strikethrough**：被 ~~划掉~~ 的 task 单独标记（≈ Ralph 的"撤销 story"）
  - **完成信号**：全部 passes:true → `<promise>COMPLETE</promise>`，否则 `<promise>NOT_COMPLETE</promise>`
- ✅ **不抄 Ralph 的部分**（明示）：
  - ❌ bash 外循环（违背蓝图 §1.Q4 可观察性）
  - ❌ agent 自宣告完成（你已是人审驱动）
  - ❌ iteration 粒度（保持 session 粒度）
- 📊 **首次 sync 统计**：26 task / 17 完成 (65.4%) / 5 blocked / 1 in_progress / 2 skipped / 1 aborted；NOT_COMPLETE
- 🐛 **修了 1 个解析 bug**：范围 "等 1.5-1.7" 一开始被单点 regex 截成 "1.5"，调整 regex 顺序（范围优先）+ 范围展开逻辑
- 🎯 **未来用途**：evolution-tracker 可读 jsonl 算"M1 阻塞天数"等量化指标；现在不动；改 task_plan.md 后手动跑 `node _meta/sync_task_plan.cjs`

### 会话 9（续 4）：A + B + C 全修完 + 自我修复闭环验证 PASS
- ✅ **A: F-014 修**（`phase2_analyze.cjs`）：ANALYZE 同时算 approved_count + out_of_scope_count + reject_count；任一 ≥ 1 → cluster 标 `skip_already_approved` / `skip_already_out_of_scope` / `blacklisted`
- ✅ **B: F-015 修**（`phase3_propose.cjs`）：`generateProposalId` 读 _index.jsonl 找当日 prefix max idx，新议案从 max+1 开始
- ✅ **C: cleanup**：删 `_index.jsonl` L4-L6 重复条目；保留 L1-L3 真状态
- ✅ **验证 PASS**：第 3 次跑 → mode=normal / proposals=0 / actionable=0 / _index.jsonl 稳 3 行 → "安静期"= 议案池稳定，正确行为
- 🪞 **自我进化完整证据链**：self-loop runs.jsonl 3 条记录 = 治理元 R2 物质化（能跑 → 暴露自身 bug → 修自身 → 验证修复 → 静默）

### 会话 9（续 3）：议案落地 + F-014/F-015 重跑发现
- ✅ **真落地 P-002 + P-003**：knowledge-curator/SKILL.md 加 §Phase 4.5 VERIFY + §Phase 7 PUSH，版本 0.1.0 → 0.1.1
- ✅ **_index.jsonl 翻 status**：L2/L3 pending → approved + decided_at/by + applied_via=manual_edit
- ✅ **F-013 入账**：议案 .diff 不是真 unified diff（缺行号 hunks），git apply 会失败，走 Edit 工具手动应用
- 🔥 **重跑暴露 F-014 + F-015**：第 2 次跑（15:33）依然产出完全相同 P-001/002/003，因为 ANALYZE 不识别 approved 状态（F-014）+ proposal_id 同日重跑 idx 重置（F-015）—— 治理元 R2 在自己身上验证

### 会话 9（续 2）：M2.3.1 完成 → evolution-tracker SKILL.md v0.1.0
- ✅ **创建 skill 目录结构**：`.claude/skills/evolution-tracker/{logs,references/skill-proposals,tmp}/`
- ✅ **SKILL.md v0.1.0 写完**（327 行）落到 `.claude/skills/evolution-tracker/SKILL.md`：
  - frontmatter：name + version + description（含触发场景） + `metadata.requires` + `metadata.evolution` 5 参数 + `metadata.status.can_run=false`
  - §0 5 特征自检 + 4 判断问题
  - §1 适用 / 不适用边界
  - §2 触发逻辑（手动 + 阈值 + 关键词，反对周期自动）
  - §3 4 Phase 工作流（含每 phase 输入输出 + 最小数门槛 + log 路径）
  - §4 议案产出格式（NL+diff 二合一，附 P-2026-4-29-002 完整范例）
  - §5 6 条失败模式 + Guardrails 表
  - §6 自循环 schema（10+ 字段）
  - §7 状态文件 + cursor + 议案池 13 字段 schema + 飞书表头预对齐 4 规则
  - §8 实现验收清单 8 项
  - §9 基线测试 A（弱信号档）+ B（normal 档，断言复现 §11.4 P1+P2+P3）
  - §10 输出文件清单（normal 档 5 文件 + 自循环）
  - §11 实现状态明示 ⚠️ `can_run=false` + 防止"假装跑完"
- ✅ **Claude Code 已注册**：available skills 列表里能看到 `evolution-tracker: 读 <skill>/logs/runs.jsonl + 当前 SKILL.md ...`
- 🎯 **下一步 M2.3.2**：实现 executor 代码（4 phase JS + 基线测试 A/B），完成后 `can_run=true`

### 会话 9（续）：M2.2.5 完成 → evolution-tracker v0.2 范例
- ✅ **§11 假想范例**新增到 `design/evolution-tracker-draft.md`（v0.1 → v0.2，约 +320 行）
- ✅ **输入实测升级**：从原计划"1 条 valid run + 弱信号"升级到 **2 条 valid run + normal 档**（L2 r=5 + L4 r=3 + L3 aborted），更扎实
- ✅ **3 条议案锁定**（M2.3 基线测试 B 必复现）：
  - **P1** `phase4_robustness`：加 Phase 4.5 VERIFY（解析 `data.doc_id` + chunks 全落盘 + 写后 JSON.parse）→ 证据 F-008/F-010/F-011
  - **P2** `phase7_push`：加 Phase 7 PUSH（lark-cli im 直推 + 手机号兜底）→ 证据 F-012 + L4 user_feedback
  - **P3** `self_evolution` (REJECTED out_of_scope)：L2 "不会自我进化" 是治理元自身的事，不在 knowledge-curator 修改范围；首次出现，记 1/3
- ✅ **倒逼 3 件事全部落地**：
  - 议案 NL+diff 格式具体化（§11.4 实例 + Risk 段）
  - `_index.jsonl` 13 字段 schema（含飞书 Bitable 类型映射）
  - 飞书表头预对齐 4 规则（snake_case / 北京时间 / array<string> / 不用 nested object）
- ✅ **SKILL.md frontmatter schema 锁定**（§11.7）：5 个 `evolution.*` 参数
- ✅ **§10 验收清单同步增强**：加 BLACKLIST_WEEKS / MIN_VALID_RUN_FOR_NORMAL；加 accepted_count / rejected_count；新增基线测试 B（断言 §11.4 P1+P2+P3 必复现）
- 🎯 **下一步**：等用户信号进 M2.3（按 §10 + §11.4 落地代码）

### 会话 9：M1.5 跑通 + L4 + 直推证明 + F-010-F-012
- ✅ **M1.5 完成**: knowledge-curator 第 2 次跑，源 = `https://github.com/KimYx0207/Meta_Kim`
  - 输入: README + README.zh-CN + CLAUDE.md + AGENTS.md（4 个 raw URL via WebFetch）
  - 决策: CREATE_NEW（search 命中 2 个无关 doc，相似度低）
  - 产出: <https://www.feishu.cn/wiki/NBNLwMjOziZHOtkyYb2ch91tnug> = "[AI学习] Meta_Kim — 元思想方法论的开源工程落地"
  - 内容: 15K JS 字符 / 449 行 / 13 章节（含 §7 Harness 三部曲对照、§9 用户主权 placeholder）
  - 写入: 3 chunks（chunk 0 via create + chunk 1, 2 via append）
  - 耗时: ~16 分钟（10:12:40 → 10:28:35）
- ✅ **runs.jsonl L4 写入** (`2026-4-29-meta-kim`)，4 lines all valid JSON
- ✅ **user_feedback rating=3**（L4），4 个高价值章节 + Phase 7 PUSH 缺失反馈
- ✅ **手动直推证明**: `lark-cli im +messages-send --user-id ou_835b... --as bot --markdown ...` → message_id `om_x100b5022b61c58e0b3931be54f133ad`，2026-4-29 10:40:13；用户 fix_notes "飞书文档应直推 IM" 这条路验证通
- 🐛 **创建脚本 parser bug**: 首次 `meta_kim_create.cjs` 找 `objToken/token/docToken`，飞书实际返回 `data.doc_id` → FATAL exit，chunks 1+ 没落盘 → recovery v2 重切源补救成功 → **F-010 + F-011 入账**
- 📋 **3 条新 finding**:
  - **F-010**: lark-cli docs +create 响应路径 `data.doc_id`
  - **F-011**: chunked-create 必须先全落盘再 create
  - **F-012**: knowledge-curator 缺 Phase 7 PUSH（议案候选 #2，喂 M2.2.5）
- 🔢 **H-001 进展**: 2/3 valid runs；2 条 fix_notes 给出 2 个议案信号，密度看着够支撑 L2 复盘
- 🌐 **网络通了**: 4-28 GFW github 阻塞已解，原 M1.2 aborted 转 M1.5 跑成
- 🎯 **下一步**: Task #4 M2.2.5（evolution-tracker v0.2 范例，喂 2 条 fix_notes）

---

## 2026-4-28

### 会话 8（收尾）：用户决策 + 排明日任务
- ✅ **skill 安装位置 = A 项目级** `.claude/skills/evolution-tracker/`（M5 跑顺后再考虑 promote 全局）
- ✅ **顺序原则**：先完善设计 → 满意后再装/写代码（不提前建空目录）
- 🌙 **明天第一件事 = M2.2.5 v0.2 范例**：基于 4-28 wiki run 的 fix_notes "不会自我进化" 假想 evolution-tracker 跑完产出什么 markdown；范例顶加 "⚠️ v0.2 假想，M2.3 实跑后校准" banner
- 📝 **同时倒逼定 3 件事**：议案格式具体化 / `_index.jsonl` schema 字段 / 飞书表头对齐（Q5）
- 🛑 **本会话结束**：用户 4-28 22:54+ 报"明天干"

### 会话 8（续 2）：用户全选推荐答 §8 Q1-Q6 → v0.1 整合（agent-teams-playbook Scenario 1）
- ✅ **走 playbook 6 阶段**：阶段 0 复用项目 `_meta/` 三件套；阶段 1 push back（单文件 markdown 整合 = Scenario 1，不组队）；阶段 2 跳过；阶段 3 直接执行；阶段 4 grep 校验 6 处下放
- ✅ **`design/evolution-tracker-draft.md` v0.0 → v0.1**（200 → 256 行）：
  - §3 锁触发逻辑（伪码 + 默认参数表 + 反对周期自动）
  - §2 输出表锁议案格式（NL 段落 + diff block）
  - §4 Phase 1 加最小数门槛（valid_run=0/1/≥2 三档）
  - §5 加 R2 三振黑名单 + 新增"兜底机制不足"行（M2 人审 / M3 飞书）
  - §5 静默失败行明示自循环（写自己 runs.jsonl）
  - §8 改为"用户决策（v0.1 已锁定）"6 行表
  - §9 累积铁律 6 → 12 条
  - **新增 §10 M2.3 实现验收清单**（7 项 + 1 个基线测试用例）
- ✅ **task_plan.md**：M2.0/2.1/2.2 标 ✅；M2.3 标 ⏳ 待启动
- 🎯 **下一步**：可以进 M2.3 实现（按 §10 验收清单），或等用户给信号

### 会话 8（续）：M1.5 网络阻塞 → 提前启动 M2 草案（B1 evolution-tracker）
- 🚧 **决策**：用户报飞书也不通的可能性高，按上轮 trade-off 选 "M2 草案" 而非死等
- ✅ **task_plan.md**：新增 Phase 2 / M2 子任务表（2.0-2.4）；M1.5/1.6/1.7 标 `⏸ 网络阻塞中`；M1.9 标 `🔄 提前并行`
- ✅ **新文件 `design/evolution-tracker-draft.md` v0.0**（约 200 行）：
  - §0 一句话责任 + 边界（适用/不适用）
  - §1 元 5 特征自检（足够小⚠️ 待定，其余✅）+ 4 判断问题
  - §2 输入/输出/state（含 cursor + 议案 index）
  - §3 触发条件 4 候选模式
  - §4 4 phase 工作流（READ → ANALYZE → PROPOSE → WRITE）
  - §5 失败模式表对应用户 Q3 致命四怕 + R2
  - §6 5 步落地法套用
  - §7 与现有组件关系图
  - §8 **待用户答的 Q1-Q6**（v0.0 → v0.1 阻塞点）
  - §9 已经定下不动的 6 条铁律
- 🎯 **下一步**：等用户答 §8 Q1-Q6（推荐答案已写在每个 Q 下面，可直接 +/- 勾选）

### 会话 8：新会话启动 + memory 二次迁移（harness/ → Alex-harness/）
- 📂 **目录又改名了**：`E:\ai\study\person\harness\` → `E:\ai\study\person\Alex-harness\`（用户在会话 7 → 8 之间手动改）
- ✅ **memory cp**：`~/.claude/projects/E--ai-study-person-harness/memory/` → `~/.claude/projects/E--ai-study-person-Alex-harness/memory/`（6 个文件全部到位）
- ✅ **CLAUDE.md 备忘节更新**：记录三段 memory 路径变迁链 + "重命名工作目录都要 cp memory" 教训
- ✅ **runs.jsonl 健康检查**：3 条都 parse 成功（L1 旧记录 feedback=null，L2 wiki run feedback=5，L3 meta-kim aborted）
- 🎯 **下一步**：等用户给 M1.5 第 2 次跑 knowledge-curator 的素材（国内可达 URL / 截图 / 聊天记录都行） + intent

### 会话 7：M1.2 第 2 次跑 ABORTED（GFW）+ 项目目录整体迁入 harness/
- ❌ **M1.2 失败**：第 2 次跑目标是分析 https://github.com/KimYx0207/Meta_Kim（元思想开源落地项目）。本机不通 github（curl SSL handshake fail / WebFetch socket closed / gh api EOF / ghproxy 镜像也 fail；百度可达 → GFW）。按 SKILL.md "网络抓取失败 → 不要凭空造内容"，aborted 在 INTAKE 阶段
- ✅ **logs 记录**：runs.jsonl L3 已写入 aborted record（completed=false / errors=network_unreachable_github），通过 JSON.parse 校验（铁律 #8）
- ✅ **目录整体迁入**：`E:\ai\study\person\` → `E:\ai\study\person\harness\`。所有 4 项（CLAUDE.md / _meta / design / .claude）move 到 harness/。父目录 `person/` 现在只剩 harness/ 一项
- ✅ **memory 复制（不删旧）**：`~/.claude/projects/E--ai-study-person/memory/` → `~/.claude/projects/E--ai-study-person-harness/memory/`；旧路径保留作 fallback，等用户验证后再清理
- 🎯 **下一步（用户）**：退出当前会话，从 `E:\ai\study\person\harness\` 重启 claude；新会话第一件事是验证 memory 是否自动加载
- 🎯 **下一步（M1.2 retry 选项）**：a) 用户开代理后 retry github / b) 换素材（国内可达的 URL/截图/聊天记录）/ c) 跳过此次直接进 M1.3
- ✅ **用户决策：选 C** —— 跳过 1.2，把"第 2 次跑"挪到 1.5（合并原 1.3/1.4），用国内可达素材
- 🎯 **新会话第一个动作**：等用户给 1.5 的素材 + intent，然后跑 knowledge-curator

### 会话 6：M1.1 完成 + JSON 修复 + 时间格式统一
- ✅ **M1.1 完成**：4-28 wiki 那条 runs.jsonl 的 `user_feedback` 已写入（rating=5；fix_notes 含"不会自我进化"——直接是 M2 evolution-tracker 的需求金矿）
- 🐛 **发现并修复老 bug**：runs.jsonl L2 因 windows 路径 `E:\java\...` 反斜杠未转义导致 JSON parse 失败。用 node 修复 → 加 finding F-008 → 这条直接对应蓝图 §3.A6 校验元缺失
- ✅ **时间格式统一**：所有项目文件（含 SKILL.md，已按铁律 #3 在此条留一笔）的时间戳/日期改为北京时间格式 `YYYY-M-D HH:MM:SS`。CLAUDE.md 加铁律 #7 + #8 固化约定
- 影响清单：CLAUDE.md / 5 个 _meta&design / SKILL.md / runs.jsonl / 4 个 memory 文件
- 🎯 **下一步（M1.2）**：用户给第 2 次跑 knowledge-curator 的素材（URL/截图/聊天记录都行）

### 会话 5：进入 Phase 1 / M1
- ✅ 用户决策：**接受** Q5 降级方案（A），M1-M5 路线图启动
- ✅ task_plan.md 切到 Phase 1 / M1，列 9 条 M1 子任务（1.1-1.9）
- ⏳ 当前：等用户答 5 个引导问题，给 4-28 wiki 那条 runs.jsonl 补 user_feedback（1.1）
- 🎯 下一步：用户答完 → Claude 写入 `runs.jsonl` → 进 1.2（列第 2 次素材）

### 会话 4：蓝图 v0.1 整合
- ✅ 用户填完 §1 Q1-Q5 + §0 三问
- ✅ 读"元思想"文档（waytoagi `KGbewcwM1ic0kFk2A58cL8OanFh`，2.4 万字）—— 主线："元 → 组织镜像 → 节奏编排 → 意图放大"
- ✅ 整合 `design/harness-blueprint.md` § 2-§6 → v0.1
  - §2 用"元 5 特征"评估当前组件
  - §3 列 16 个 Gap 元（A1-A8 业务 / B1-B5 治理 / C1-C3 节奏）
  - §4 push back Q5：把"1 月完成 SDLC"降级为 M1-M5
  - §5 三层架构图（治理层 / 功能元层 / 外部世界）
  - §6 风险表 R1-R6
- ⏳ **阻塞**：等用户拍板是否接受 Q5 降级
- 🎯 **下一步**：用户答 yes → 进入 M1（knowledge-curator 反馈闭环）

### 会话 3：项目骨架初始化
- ✅ 创建 `CLAUDE.md`（项目级 Claude 指令，120 行内）
- ✅ 创建 `_meta/task_plan.md`、`_meta/progress.md`、`_meta/findings.md`
- ✅ 创建 `design/harness-blueprint.md`（v0.0 骨架，含 5 个引导问题）
- ✅ 创建 global memory：`project_harness_goal.md`、`user_iteration_style.md`、`ref_harness_trilogy_wiki.md`
- ⚠️ 遗留：knowledge-curator `runs.jsonl` 第一条 `user_feedback` 还是 `null`，下次跑 skill 前要补
- 🎯 **下一步**：用户回答蓝图 Q1-Q5，然后 Claude 整合成 v0.1 蓝图

### 会话 2：knowledge-curator settings 验证
- ✅ 跑 `rtk git status` 验证 settings 修改后不再报之前那个错（"Not a git repository" 是预期行为，因为 person 目录还没 git init）

---

## 2026-4-28（更早，之前会话）

### 会话 1：knowledge-curator skill 落地
- ✅ skill 复制到 `.claude/skills/knowledge-curator/`
- ✅ 跑通一次，输出 13.2 万字 wiki: `UtW0wUbPbifCX4kk3ypcGcyinGg`
- 📝 学习：lark-cli markdown 入参有 shell argv 限制，必须 chunk + 显式调用 git bash
- 📝 学习：UTF-8 字节数 ≈ 中文字符数 × 3
- 📝 学习：lark-cli 不支持 drive 文件夹列表，要么用户给 URL，要么写 wiki my_library
