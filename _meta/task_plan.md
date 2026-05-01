# Task Plan: Personal Agent Harness

## 当前阶段

**Phase 4 / M4（5-1 起）：mode-router (B4) + B2 session-reporter 补全**

> **M1 正式关闭**（2026-5-1，task 1.9）：39/45 任务完成；3 skills 建成；meta-loop 全闭合；详见 `_meta/reviews/m1-retrospective.md`
> **M2 提前完成**（4-29）：evolution-tracker v0.1.0
> **M3 提前完成**（4-30）：context-curator v0.1.0（B3 adjacent）
> **执行顺序**（用户 2026-5-1 决策）：① mode-router (B4) → ② B2 补全「推飞书成长日志」

## Phase 0 子任务（已完成）

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 0.1 | 创建项目元信息（CLAUDE.md, _meta/, design/） | ✅ 完成 | 2026-4-28 |
| 0.2 | 创建蓝图骨架 `design/harness-blueprint.md`（v0.0） | ✅ 完成 | 2026-4-28 |
| 0.3 | 创建 global memory（项目/用户/参考） | ✅ 完成 | 2026-4-28 |
| 0.4 | 用户回答 Q1-Q5 | ✅ 完成 | 2026-4-28（含 §0 三问） |
| 0.5 | 读"元思想"文档 + 整合蓝图 §2-§6（v0.1） | ✅ 完成 | 2026-4-28 |
| 0.6 | 用户拍板：接受 Q5 降级（M1-M5） | ✅ 完成 | 2026-4-28（A 接受） |

## Phase 1 / M1 子任务（W1, 4-28 → 5-4）

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 1.1 | **D1**: 给 4-28 wiki 那条 runs.jsonl 补 user_feedback | ✅ 完成 | 2026-4-28（rating=5；fix_notes 含"不会自我进化"信号） |
| 1.x1 | **D1 加塞**: 修复 runs.jsonl JSON 损坏（windows 路径未转义） | ✅ 完成 | 2026-4-28；同时项目时间格式统一为北京时间 |
| 1.2 | D1: 第 2 次跑 = 分析 https://github.com/KimYx0207/Meta_Kim | ❌ ABORTED | 2026-4-28 22:30；GFW 拦截 github；runs.jsonl L3 记 errors=network_unreachable_github |
| 1.x2 | **D1 加塞**: 项目目录整体迁入 `harness/` | ✅ 完成 | 2026-4-28 22:36；memory 已 cp 到预测新路径 `~/.claude/projects/E--ai-study-person-harness/memory/` |
| 1.2-retry | M1.2 重新跑（用户选 a/b/c） | ✅ 用户选 **C** | 2026-4-28；跳过 1.2，把"第 2 次跑"挪到 1.5（用国内可达素材） |
| 1.3 | ~~D2-D3: 跑第 2 次 knowledge-curator~~ | ⏭ 跳过（合并到 1.5） | 因 1.2 aborted + 用户选 C |
| 1.4 | D3: 给第 2 次跑打 user_feedback | ⏸ 等 1.3 | |
| 1.5 | 用户列出第 2 次跑的国内可达素材 → 跑 → 打 user_feedback | ✅ 完成 | 2026-4-29；GFW 解封后改回 GitHub Meta_Kim；rating=3；产出 wiki NBNLwMjOziZHOtkyYb2ch91tnug；L4 写入；F-010/F-011/F-012 入账；议案候选 #2 = Phase 7 PUSH |
| 1.6 | 用户列出第 3 次素材 | ✅ 完成 | 2026-4-29；用户给 URL #3 投资理财 baijiahao 1824283363061572650 |
| 1.7 | 跑第 3 次 + 打 user_feedback | ✅ 完成 | 2026-4-29 21:42；wiki Vcr1wVQPgit8nwk88q3cbsyRnhd；user rating=5 "完全没问题，非常仔细"；议案池保持空（NORMAL_NO_SIGNAL）= 治理元 R2 正向证据 |
| 1.8 | 手动 L2 复盘 → 写 `references/weekly-review-2026-W18.md` | ✅ 完成 | 2026-4-29 21:42；机器 stub（evolution-tracker 自动）+ 人工 augment（4 部分：时间线 / W0→W1 数据 / 3 个关键复盘点 / W2 决策待你拍） |
| 1.9 | M1 总结 + 决定 M2 第一个治理元 skill 的细节 | ✅ 完成 | 2026-5-1；m1-retrospective.md 写成；M1 正式关闭；M4 mode-router 下一目标 |

## Phase 2 / M2 子任务（W2，原计划 5-5，因 M1 阻塞提前启动）

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 2.0 | 写 `design/evolution-tracker-draft.md` v0.0 骨架 + 5 特征自检 + 待答问题 | ✅ 完成 | 2026-4-28 会话 8 |
| 2.1 | 用户答 §8 Q1-Q6 | ✅ 完成 | 2026-4-28 会话 8（全选推荐 b+d/b/a/b/M2人审M3飞书/要） |
| 2.2 | 整合用户答案 → v0.1 草案 | ✅ 完成 | 2026-4-28 会话 8（agent-teams-playbook 走 Scenario 1 单 agent；6 处下放 + §10 验收清单） |
| 2.2.5 | **v0.2 草案完善**：写真实议案产物范例 | ✅ 完成 | 2026-4-29；输入升级为 2 条真实 valid run（L2 r=5 + L4 r=3）+ F-008/F-010/F-011/F-012；§11 含 10 子节，3 议案 P1+P2+P3 已锁；倒逼 3 件事全落地（NL+diff 格式 / _index.jsonl 13 字段 / 飞书表头 4 规则）；frontmatter schema 5 参数锁；§10 同步加基线测试 B |
| 2.2.6 | （可选）v0.3 草案完善：SKILL.md frontmatter 模板 | ⏭ 跳过 | v0.2 §11.7 已含 frontmatter 完整 schema，无需单独 v0.3 |
| 2.3.1 | 写 evolution-tracker SKILL.md（位置 = **A 项目级** `.claude/skills/evolution-tracker/`） | ✅ 完成 | 2026-4-29；327 行；frontmatter 5 evolution 参数 + 5 特征自检 + 4 phase + §5 6 失败模式 + §7 13 字段议案池 schema + §8 验收清单 8 项 + §9 基线测试 A/B + §11 实现状态明示 `can_run=false`；skill 已被 Claude Code 注册 |
| 2.3.2 | 实现 executor 代码（READ/ANALYZE/PROPOSE/WRITE 4 phase + 自循环 + 基线测试 A/B 通过） | ✅ 完成 | 2026-4-29 11:46；4 phase 全部跑通 + 自循环 append；基线 B 通过（断言 P1+P2+P3 复现，direction 全对：phase4_robustness/phase7_push/self_evolution-rejected）；can_run=true；产出 6 文件（weekly-review + 1 .md rejected + 2 .diff + _index.jsonl + cursor）；NL 长度限制 200 字铁律真触发了一次（设计自带契约校验起作用） |
| 2.4 | 跑一次 evolution-tracker（基于现有 runs.jsonl） | ✅ 完成 | 2026-4-30 14:47 跑 context-curator 弱信号档（valid=1, proposals=0 因 fix_notes="..."）；2.3 已拆为 2.3.1+2.3.2 全 ✅，dangling 通过完成此任务而清；F-016 实证修复 |

## Phase 3 / M3 子任务（W2-W3，4-30 启动）

> **W2 决策（Alex 2026-4-30 拍 "C 优先 B 暂缓"）**：context-curator 优先做，intent-router 暂缓 / deprecated。

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 3.0 | `design/context-curator-draft.md` v0.1（§6 Q1-Q5 全选推荐 ✅） | ✅ 完成 | 2026-4-30 10:30；a 手动触发 / 800 字 / runs.jsonl 异常有界扫 / 保留 14 天 / 输出 diff |
| 3.1 | `design/intent-router-draft.md` 锁定 deprecated（§0 Q0=D） | ✅ 完成 | 2026-4-30 10:30；3 条复活硬门槛写明 |
| 3.2 | 议案候选 P-2026-4-30-001 写入（progress.md 扫描 phase / 灵感: Ralph） | ✅ 完成 | 2026-4-30 10:35；evolution-tracker skill-proposals 池；status=pending；source=external_inspiration |
| 3.3 | 写 `.claude/skills/context-curator/SKILL.md`（位置 = 项目级） | ✅ 完成 | 2026-4-30 11:10；241 行；frontmatter 6 curator 参数 + 5 特征自检 + 4 phase + §6 决策记录 + §7 6 失败模式 + §8 自循环 schema + §9 验收清单 8 项；"sit 一晚"被覆盖：用户"今天就要用" |
| 3.4 | 实现 context-curator executor（4 phase: SCAN/EXTRACT/SUMMARIZE/EMIT） | ✅ 完成 | 2026-4-30 11:17；单文件 run.cjs ~600 行；4 phase 全跑通；800 字硬上限 + 7 级削减阶梯（blueprint→progress→findings→memory→current→compact_mode→memory_titles_only/skills/anomalies/memory_top3）；安全写入器（绝不写源） |
| 3.5 | 跑一次 context-curator（用本会话开头作为 fixture） | ✅ 完成 | 2026-4-30 11:17 首跑 611 字；11:19 二跑 800 字（diff 工作）；snapshot/index/latest 全产出；自循环 runs.jsonl 写自己 |
| 3.6 | task_plan.jsonl Ralph 模式深化 — B2 落地（readiness queue 命令） | ✅ 完成 | 2026-4-30 10:52；Alex 拍"按推荐 = 仅 B2"；新文件 `_meta/next_actions.cjs`（197 行）；分 9 类 bucket（ready_to_unblock / in_progress / unknown_ready / still_blocked / dangling / scheduled / skipped / aborted / completed）；支持 `--all` `--json`；只读 jsonl，绝不改 md |
| 3.7 | （未来）B1 staleness 字段 + B3 promise-only 命令 | 🌙 待 1-2 周 dogfooding | 用了 next_actions 一段时间觉得需要再加；时间门控 |
| 3.8 | `_meta/skill_feedback.cjs` 通用评分 CLI | ✅ 完成 | 2026-4-30 12:25；227 行；支持 `--list` / `<rating> [notes]` / `--dry-run` / `--force`；写前后双 JSON 校验 + 自动 .bak 备份；error case 全覆盖（无效 rating / 缺 run_id / 已评分需 --force） |
| 3.9 | Alex 评分 ≥ 1 条 context-curator run + 跑 evolution-tracker | ✅ 完成 | 2026-4-30 14:47；Alex 自己用 CLI 打 4 分（fix_notes="..."）；evt run mode=weak_signal valid=1 proposals=0；产出 weekly-review-2026-W18.md；meta-loop 第一次在 context-curator 上闭合 |
| 3.10 | F-017 finding + P-2026-4-30-002 议案候选 | ✅ 完成 | 2026-4-30 14:55；F-017 写入 findings.md（"..." 不命中 SIGNAL_KEYWORDS 全链路定位）；P-2026-4-30-002 写入议案池（A=skill_feedback CLI 加 fix_notes 质量门 / B=tracker 关键词扩展，推荐 A 立刻 + B 缓做） |
| 3.11 | P-2026-4-30-002 A+B 同时落地（Alex 拍 "一起做了"） | ✅ 完成 | 2026-4-30 15:08；A 落地：skill_feedback rateRun 加 fix_notes ≥30 字质量门 + 标点 trim + `--allow-short` 转义 + 友好错误信息（含 ✅/❌ 范例）；B 落地：SKILL.md SIGNAL_KEYWORDS 加 13 个具象词（压成/看不到/激进/不到/太激/太多/截断/假阳性/噪声/漏/重复/想要/希望）；3 case 测试通过（短拒/--allow-short 通/边界 27 字仍拒）；P-002 status=approved |
| 3.12 | 第 3 次跑 context-curator + 真 fix_notes + 跑 tracker 验证 | ✅ 完成 | 2026-4-30 15:45；run_id=2026-4-30-154503 654/800 字；rated 4 含 "太激进/压成/看不到/假阳性/希望" 关键词；首跑 tracker 仍 0 cluster 暴露 F-019（SKILL.md SIGNAL_KEYWORDS ≠ DIRECTION_RULES 双源）；加 2 条 DIRECTION_RULE → 第 2 次 cluster 命中=1 但无 PROPOSAL_TEMPLATE 暴露 F-018；2 valid_run 模式从 weak_signal 升 normal |
| 3.13 | 修 dangling 2.4→2.3 (F-016) | ✅ 完成 | 2026-4-30 15:30；标 2.4 ✅ 完成（实质：tracker 已多次运行）；F-016 实证 cleanup |
| 3.14 | P-2026-4-30-001 状态批准（实施 defer 到 W3） | ✅ 完成 | 2026-4-30 15:55；_index.jsonl L1 status: pending → approved；applied_notes 注明完整 phase1_read.cjs + phase2 消费 defer 到 W3 末，按原推荐分阶段 |
| 3.15 | F-018 + F-019 落入 findings | ✅ 完成 | 2026-4-30 15:55；F-019: SKILL.md vs DIRECTION_RULES 双源真理；F-018: 新 direction 缺 PROPOSAL_TEMPLATE 配套；都从 P-002 B + 议案校验过程中暴露 |
| 3.16 | 补 PROPOSAL_TEMPLATE for curator_truncate_aggressive | ✅ 完成 | 2026-4-30 21:58；phase3_propose.cjs 加模板；tracker 首次产真议案 P-2026-4-30-001 (context-curator)；F-018 闭合 |
| 3.17 | 实施 P-2026-4-30-001（cross_session_pattern_mining）：progress.md 第三证据流 | ✅ 完成 | 2026-4-30 会话 12；phase1_read.cjs 加 readProgressMd() + PROGRESS_KEYWORDS；phase2_analyze.cjs 加 addProgressEvidence() + progress_md_only 标记；phase3_propose.cjs 加 progress_md_only gate；验证跑：20 progress entries 消费，2 clusters（1 progress_md_only），1 议案产出 P-2026-4-30-002 |

## Phase 4 / M4 子任务（5-1 起）

### 4a: mode-router (B4)

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 4.1 | `design/mode-router-draft.md` v0.1（Q1-Q5 + 5 特征 + 决策矩阵） | ✅ 完成 | 2026-5-1；v0.0 草案写成 |
| 4.2 | 用户答 Q1-Q5 | ✅ 完成 | 2026-5-1；Q1=并行+审查 / Q2=C / Q3=a+c / Q4=A / Q5=a+b；design v0.1 锁定 |
| 4.3 | 写 `.claude/skills/mode-router/SKILL.md` | ✅ 完成 | 2026-5-1；241 行；4 phase / 5 特征 / 8 验收项 |
| 4.4 | 实现 executor run.cjs（信号检测 + 路由 + 打印 + log） | ✅ 完成 | 2026-5-1；并行/审查/显式/降级 4 路径全通；--log / --list 子命令 |
| 4.5 | 跑验收测试 5 条 | ✅ 完成 | 2026-5-1；5/5 通过（并行→team/subagent / review→peer_review / 无信号→solo / 显式 solo / --log+--list） |

### 4b: B2 session-reporter 补全

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 4.6 | 设计「增量推飞书成长日志」规则（哪些 progress.md 段推/格式/目标文档） | ✅ 完成 | 2026-5-1；Q1=d(Base+IM) / Q2=a(每会话) / Q3=b+d(✅行+结构化) / Q4=a(cursor) / Q5=c(Stop hook)；Base token Se8obIsyTa5SmfsOMK8cA9d3nNc |
| 4.7 | 写 `.claude/skills/session-reporter/SKILL.md` 或扩展 context-curator Phase 5 | ✅ 完成 | 2026-5-1；218 行；4 phase PARSE/DIFF/PUSH/LOG；cursor 机制；6 失败模式 |
| 4.8 | 实现 + 跑通 + 评分 | ✅ 完成 | 2026-5-1；run.cjs ~200 行；35/35 会话推 Base 成功；IM 修复(·替换|)；Stop hook 接通；`lark-cli base +record-upsert` 平铺字段格式 |

## Errors Encountered

| 时间 | 错误 | 处理 |
|------|------|------|
| 2026-4-28 | runs.jsonl L2 JSON 解析失败（windows 路径 `E:\java\...` 未转义反斜杠） | 用 node 修复 → 加 finding F-008（knowledge-curator 缺写入后校验） → 蓝图 §6 R5 / §3 A6 已识别为待建组件 |
| 2026-4-28 22:30 | M1.2 跑 GitHub Meta_Kim aborted：本机网络不通 github（curl SSL handshake fail / WebFetch socket closed / gh api EOF / ghproxy mirror 也 fail；百度可达） | 按 SKILL.md "网络抓取失败 → 不要凭空造内容"，aborted at INTAKE phase；runs.jsonl L3 记录；用户决定 retry 方案 a/b/c |

## 历史阶段

- **Phase -1（完成）**: knowledge-curator skill v0.1.0 创建并跑通一次，产出 wiki UtW0wUbPbifCX4kk3ypcGcyinGg
  - 遗留：`runs.jsonl` 第一条 `user_feedback.rating` 还是 `null`，按 skill 自己的铁律下次跑前要补
