# Findings

> 学到的、踩过的、待验证的、死路。这里写"事实和洞察"，不写"待办"。
> 待办去 `task_plan.md`，日志去 `progress.md`。

## 状态总览（2026-5-13 体检后整理）

| 类别 | 编号 | 含义 |
|---|---|---|
| **✅ 已修（Fixed）** | F-008 · F-010 · F-011 · F-012 · F-013 · F-014 · F-015 · F-016 · F-017 · F-018 · F-019 · F-020 · F-021 · F-022 · F-023 · F-024 · F-025 | 当时 bug 已 hotfix；长期候选另作新议案 |
| **📐 设计洞察（Design）** | F-001 · F-002 · F-003 · F-004 · F-005 · F-006 · F-007 · F-009 | 工具/API 限制 + 元思想原则；不是 bug |
| **🟢 当前活跃（Active）** | F-026 · F-027（皆已 hotfix）| 新发现的活跃问题用 F-028 起编号 |

> **新增 finding 守则**：编号从 F-026 起递增；写入时必须明示状态（**fixed** / **design** / **active**），并把它登记到上表。状态变化（active → fixed）同步本表，否则视为流程外。

## 已验证（Confirmed）

### F-027: `helix --start` 后 cwd 切换让 state 文件"丢失"（status=fixed-but-13-others-vulnerable）

- **来源**：2026-5-13 用户报告 "helix state 在 --start 后被 cwd 切换吞掉了（工具侧问题，不影响代码）。手动收尾汇报"
- **现象**：helix `run.cjs` 第 24 行 `const PROJECT_DIR = process.cwd()`。`--start` 时 cwd=A → state 写到 `A/_meta/.helix-current-run.json`；后续 `--report` / `--finalize` / `--status` 若 cwd=B → 读 `B/_meta/.helix-current-run.json` → 看似"no active run"，实际是被 cwd 切换骗了
- **结论**：所有"读项目内文件"的 skill 都不该信任 `process.cwd()`；要么用 env 锚，要么用 `__dirname` 锚
- **解决（这次，helix 单点）**：
  - `_meta/lib/common.cjs` 新增 `projectRoot()`，多层回退：`HARNESS_PROJECT_ROOT` env → `CLAUDE_PROJECT_DIR` env → 含 `_meta/` 的 cwd → `path.resolve(__dirname, '..', '..')`（锚到 common.cjs 自身位置）
  - `skills/helix/run.cjs` 第 24 行 `process.cwd()` → `projectRoot()`
  - 4 场景验证：cwd 在项目根 / cwd 在 /tmp / env 显式注入 / helix --status 从 /tmp 跑 — 全部正确解析到项目根
- **解决（长期，未做，排进 cycle #2）**：13 个 skill run.cjs 仍用 `process.cwd()`（grep `'process\.cwd()'`），多数被 helix spawn 时 cwd 已正确传入而幸免，但单独跑就坏。下次 cycle 批量替换为 `projectRoot()`：
  ```
  a1 a3 a4 a5 a7 a8 a2 a6 code-review code-simplifier meta-audit （helix 已修）
  evolution-tracker / session-reporter 用法不同需评估
  ```
- **影响**：同源 F-025（dashboard plugin cache fallback）+ F-020（session-reporter Stop hook ENOENT）。三者根因都是"用 cwd 隐式定位项目"
- **关联**：`_meta/lib/common.cjs` `projectRoot()` / 铁律 #8 边缘扩展

---

### F-026: `_meta/helix-runs.jsonl` 首行 BOM 让 JSON.parse 静默失败（status=active-root-cause）

- **来源**：2026-5-13 体检 UX 优化阶段冒烟，跑 `rotate_check` 升级版全行 parse 校验，发现 `_meta/helix-runs.jsonl` 第 1 行从 2026-5-2 起就有 UTF-8 BOM (`EF BB BF`)，254 行里只有这 1 条 fail
- **现象**：`JSON.parse('﻿{...}')` 抛 `Unexpected token`；过去用 `.split('\n').forEach(JSON.parse)` 的脚本在第 1 行就死掉，但因为多数读取器有 try/catch 兜底（吞掉错误），从未浮出
- **结论**：写 jsonl 时下游写入器没用 BOM（safeAppend 用 `JSON.stringify` 干净），那么这个 BOM 是某次编辑器（VS Code "UTF-8 with BOM" 模式）保存留下的。**任何**读 _meta/*.jsonl 的脚本都该入口 `stripBom`，参考 `_meta/rotate.cjs` `stripBom()` 实现
- **解决（这次）**：本次冒烟直接 `fs.writeFileSync(file, raw.charCodeAt(0)===0xfeff ? raw.slice(1) : raw)`；254 行全部恢复 parse
- **解决（长期）**：把 `stripBom` 提到 `_meta/lib/common.cjs`，提供 `safeReadJsonl(path)` 让所有读取器走同一入口；同时建议在 `_meta/rotate.cjs` 触发的归档校验里也加 BOM 防御（已有，但仅本地化）
- **影响**：F-026 同源于 F-008（写后必校验）+ F-023（CRLF）—— 都是"编码层异质性"导致 JSON parse 静默失败
- **关联**: `_meta/rotate.cjs` `stripBom()` / `_meta/lib/common.cjs` / 铁律 #8

---

### F-025: Dashboard plugin cache fallback 静默失败 — 与 F-020 同源（plugin cache vs 项目源代码路径错配）

- **来源**: 2026-5-4 会话 27（v0.7 升级 Worker A）
- **现象**: dashboard 进程从 plugin cache 启动且无 `HARNESS_PROJECT_ROOT` / `CLAUDE_PROJECT_DIR` 时，`resolveProjectRoot()` fallback 到 `__dirname/..`（即 plugin 目录），那里 `_meta/live-events.jsonl` 不存在，`/api/health` 报 `jsonl_size_bytes: 0`，所有卡片空，但 SSE 仍连得上 → 假象「已连」让人以为后端在运转。
- **结论**: plugin cache 路径 fallback 是反模式；任何「读相对路径」的 plugin 内脚本都要先校验 cwd / `__dirname` 是否落在 `plugins/cache/` 之下，是的话 fail-fast，不是静默兜底。
- **修复**: A1+A2 已落地（`dashboard/server.js`）：
  - `resolveProjectRoot()` 加 `isPluginCachePath()` 守门，路径含 `\plugins\cache\` 或 `/plugins/cache/` 直接 `process.exit(1)`，并打印中英文双语错误指出必须设置环境变量
  - 启动后 1 秒做自检：`helix-runs.jsonl` 存在但 `live-events.jsonl` 缺失 → `console.warn` 提醒路径可能错配；两个都缺 → 警告 ROOT 错配
- **影响**:
  - F-025 关联 F-020（同源：plugin cache vs 源码路径错配 + 静默失败）
  - 「写后必校验、启动必自检」应当成为所有 plugin 内进程的标配
  - 其他 plugin 脚本（hooks/、skills/ 内 .cjs）若也读 `_meta/` 相对路径，需补同款守门
- **关联**: `dashboard/server.js` `resolveProjectRoot()` / `isPluginCachePath()`；F-020；CLAUDE.md 工作约定 #8

---

### F-024: helix 流程缺"skill 最优复用"门槛——每次都从 a1 → a4 → a5 重写一遍，复用率为 0

- **来源**: 2026-5-2 19:xx Alex 触发 /agent-teams-playbook 后给约束："每次任务选择最优 skills 使用，这入口 helix 进入的时候，注意一下"
- **现象**: helix v0.2 phase 链是 a1 → a2 → a3 → a4 → a5 → a6 → a7（+a8）。a4-planner 在生成 plan 时**只看任务卡 + repo 信号**，**完全不看本项目已有 14 个 skill 或全局 ECC/superpowers/MCP skill 库**。结果：每次任务都在 a5-executor 里"白手起家"，已有 `knowledge-curator` 写飞书的能力、`session-reporter` 推 IM 的能力、`lark-im/doc/sheets` 一整套 CLI 工具，**全都跳过去自己重新写**。复用率 0。
- **结论**: helix 在 a3-retriever 和 a4-planner 之间必须加一个**强制 skill 发现节点**（借鉴 agent-teams-playbook 阶段 1 的 3 步回退链），把"强匹配 skill"写进 task_card.preferred_skills，让 a4-planner 必须复用。
- **修复**: skills/helix/SKILL.md 加 §2.5 Step 5.5（同步到 plugin cache 0.3.1）；§3 Phase passes 不加新行（这是 LLM 行为约束不是脚本）；§6 Ralph 接受清单加"skill 最优复用"。
- **影响**:
  - 立刻生效：下次 /helix 启动后，LLM 必须扫 skills/ 14 项 + system-reminder 里 available skills（含 ECC + superpowers + lark + ui-ux-pro-max）+ 必要时调 find-skills 拉外部
  - 中期：跑过 5-10 次后回看 progress.md，统计"强匹配命中率"——若长期 0 命中，说明已有 skill 库不覆盖 Alex 任务类型，转向"沉淀新 skill"
- **关联**:
  - skills/helix/SKILL.md §2.5 / §6
  - agent-teams-playbook §阶段1 Skill 完整回退链
  - 蓝图：harness-blueprint.md "组织镜像" 元思想（让镜子里看到自己已经有什么）

---

### F-023: 在 Windows 写出的 markdown 文件（CRLF 行尾）经 `.split("\n")` 后正则 `(.+)$` 会全部失败

- **来源**: 2026-5-2 17:55 dashboard v0.3 evolution 视图升级后 `/api/evolution.progress` 永远返回 0 条；本地 `cat -A progress.md` 看到每行末尾是 `\r$\n$`（CRLF）。
- **现象**: `for (const line of fs.readFileSync(file, "utf8").split("\n"))` 后 `line` 仍带 `\r`。JS 正则 `^(#{2,3})\s+(.+)$`：
  - `.` 不匹配 `\n` 但 **不匹配 `\r` 也不匹配**（与 PCRE 不同）
  - `(.+)` 贪婪到 `2026-5-2`（停在 `\r` 前），然后 `$` 检查"end-of-string 或 newline 前"，发现 `\r` 不是 `\n` → 不匹配 → 整体回溯失败
- **结论**: Windows / 跨平台代码读 markdown，必须用 `.split(/\r?\n/)` 或 `.replace(/\r/g, "")` 兜底，不能直接 `.split("\n")`。
- **修复**: dashboard/server.js 里 `readProgressEntries` + `readFindings` 全部改 `/\r?\n/`。
- **影响**: 所有读 `_meta/*.md` 的 helper；以后写 markdown 解析器一律走这个 split。
- **关联**: 项目铁律 §工作约定 #8（写 JSON 后立即校验）—— 同精神扩展到"读 markdown 后立即抽样校验"，但这次是发现得早因为 UI 立刻可见。

---

### F-022: CSS Grid `auto 1fr auto` 行三段，底部 auto 内容过长会把 1fr 中段挤没

- **来源**: 2026-5-2 17:03 dashboard v0.2 evolution 视图首跑—顶部 task_plan + 底部 findings 卡片墙都正确出，但中段"进展时间线"塌陷成只有标题条。/api/evolution 数据齐全（8 progress + 12 git + 22 findings）。
- **现象**: `.evo-grid { grid-template-rows: auto 1fr auto }` + `.evo-mid { min-height: 0 }`。findings 卡片用 `repeat(auto-fill, minmax(280px, 1fr))` 多行展开，`.evo-bot` `auto` 行无 max → 撑到很大；`.evo-mid` 1fr 在 min-height: 0 下被压成 0。
- **结论**: Grid 行 `auto` 没有 max 时会贪心拉满；想要"中段必占主体"需要让旁段都有 max，或者改用 flex column + 比例约束。
- **修复**: 改 `.evo-grid` 为 flex column；`.evo-top { max-height: 220px }` `.evo-mid { flex: 1 }` `.evo-bot { max-height: 38% }`，三段各自 overflow:auto 独立滚动。
- **影响**: 所有"三段竖排"布局的下游 skill UI——遵循"边段必须有 max-height，中段 1fr/flex-1"原则。
- **关联**: §蓝图 3.B 观察层；dashboard-draft.md v0.2 §5.3。

---

### F-021: hook 时区校正用 `getTimezoneOffset()` 在 Beijing 系统下被抵消成 UTC

- **来源**: 2026-5-2 16:39 hook 落地后看 jsonl `ts: "2026-5-2 08:39:00"`，与系统 `date` 输出 16:39 差 8 小时——明显时区错。
- **现象**: 第一版 `bjTime` 写法是 `d.getTime() + d.getTimezoneOffset() * 60 * 1000 + 8h`。当系统已是 UTC+8（Beijing），`getTimezoneOffset()` 返回 -480（分钟），所以 `× 60 × 1000 = -8h`，加 8h offset → 净 0；再用 `getUTCHours()` 读 = UTC 时间，不是 Beijing。
- **结论**: 想要"无论系统时区都吐 Beijing wall-clock"，正确公式是 `d.getTime() + 8 * 3600 * 1000` 然后用 `getUTCxxx()` 读。`getTime()` 已经是 UTC ms，与本地时区无关；不要二次加 `getTimezoneOffset()` 校正。
- **修复**: 见 hooks/dashboard-emit.cjs `bjTime()`；同步 dashboard/server.js 同名函数。
- **影响**: 所有"系统时区不可知 → 想要 Beijing 输出"的 helper（lark-cli 工具、dashboard）都要走这个公式。
- **关联**: 项目铁律 §工作约定 #7（北京时间 YYYY-M-D HH:MM:SS）。

---

### F-020: session-reporter Stop hook + saveCursor ENOENT bug 联手向飞书 IM 推了 30+ 条重复消息
- **来源**: 2026-5-1 22:41 用户飞书截图：Dick's Process CLI bot 收到大量 `[里程碑]` / `2026-4-30` / `2026-4-29` 重复消息；同期终端 Stop hook 报 `ENOENT: no such file or directory, open '...0.3.0/skills/session-reporter/logs/push-cursor.json'`
- **现象**: 每次会话 Stop 触发 hook → loadCursor() 因目录不存在返回空 → progress.md 全部会话被判"未推" → 全推飞书 Base + IM → saveCursor() writeFileSync 因目录缺失抛 ENOENT → cursor 没存住 → 下次 Stop 重复同样流程
- **根因（双重）**:
  1. **代码 bug**：`saveCursor()` 直接 `fs.writeFileSync(CURSOR_PATH, ...)`，没有 `mkdirSync(path.dirname, recursive: true)`；同文件 `writeRunLog()` 有这一步——同一文件一处加一处漏
  2. **打包 bug**：v0.3.0 plugin cache 目录只复制了 `run.cjs` + `SKILL.md`，没带 `logs/` 子目录；首次运行就走进 ENOENT 路径
  3. **设计 bug（更根本）**：Stop hook 每次会话结束都自动推飞书的设计本身违反用户偏好——用户要的是"整体任务完成时手动推一次总结性文档"，不是"每会话/每里程碑都推"
- **结论**: 自动化推送 + 静默失败 + 默认设计与用户偏好错位，三者叠加 = 飞书消息洪水
- **解决（这次）**:
  - 止血：`hooks/hooks.json` 的 Stop key 改名 `_disabled_Stop_2026-5-1`（Claude Code 不识别 → 等同禁用）
  - 修代码 bug：项目源码 + plugin cache 两份 `run.cjs:71` 的 `saveCursor` 都加 `fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true })`
  - 同步 cursor：把项目源码 `logs/push-cursor.json`（含 36 条已推 run_id）复制到 plugin cache，让重启后即使误启也不会重复推
  - 更新 memory：`feedback_milestone_push_to_feishu.md` 整体重写——从"每里程碑必推 IM"改为"整体任务完成才推总结文档"
- **解决（长期候选）**:
  - session-reporter 重构为"summary 模式"：手动调用 `--finalize`，把 N 个会话聚合成 1 篇飞书云文档 + 1 条 IM 链接
  - 任何 hook 都需"幂等性 + 写前 mkdirSync + 失败显式日志"三件套（蓝图 §3.A6 校验元的具象延伸）
  - plugin 打包必须带运行期需要的所有目录（即使空目录也要 .gitkeep）
- **影响**:
  - 旧 memory `feedback_milestone_push_to_feishu.md` 已重写
  - hooks.json 在 v0.3.1 之前不再注册 Stop hook
  - F-020 与 F-008（"写后必校验"）同源——都是"静默失败 + 没有写后验证"

### F-019: SKILL.md SIGNAL_KEYWORDS frontmatter ≠ ANALYZE clustering 真实驱动（双源真理）
- **来源**: 2026-4-30 15:45 P-2026-4-30-002 B 落地后跑 evolution-tracker 验证：用了 13 个新关键词的扩展 SKILL.md → tracker 仍报 clusters_found=0；查 phase2_analyze.cjs 才发现真正用的是文件内**硬编码 DIRECTION_RULES**，frontmatter SIGNAL_KEYWORDS 只被 frontmatter parser 读入但**从未参与聚类**
- **现象**: 改 SKILL.md SIGNAL_KEYWORDS = no-op；改 lib/phase2_analyze.cjs DIRECTION_RULES 才生效
- **根因**: 设计期假设"frontmatter 即契约"，实施时图省事直接硬编码 patterns；SKILL.md 沦为静态文档
- **结论**: 任何议案带"扩 SKILL.md SIGNAL_KEYWORDS"语义都需同步改 phase2_analyze.cjs；M2.2.5 frontmatter schema 锁定时漏了这条**约束-实施一致性**校验
- **解决（这次）**: 在 phase2_analyze.cjs 加 `curator_truncate_aggressive` + `curator_diff_falsepositive` 两条 DIRECTION_RULE；SKILL.md SIGNAL_KEYWORDS 保留作"未来扩展白名单"语义但不删
- **解决（长期候选）**: 让 ANALYZE 真正读 frontmatter SIGNAL_KEYWORDS（未来议案）；或在 SKILL.md 里删 SIGNAL_KEYWORDS 字段（去除假语义）
- **影响**: F-017 mitigation 的 B 部分（关键词扩展）实际效果为 no-op；A 部分（fix_notes 质量门）效果真实

### F-018: 新 DIRECTION_RULE 不会自动产 proposal — 需手动加 PROPOSAL_TEMPLATE 配套
- **来源**: 2026-4-30 15:50 加 `curator_truncate_aggressive` 后跑 tracker：cluster 命中 (clusters_found=1) 但 phase3_propose 报 "该 direction 无 proposal template；M2.3.2.3 时手动加" → proposals=0
- **现象**: ANALYZE 聚类成功，PROPOSE 跳过；终端摘要显示 "actionable=0"
- **根因**: phase3_propose.cjs 用模板字典生成议案的 What/Why/Risk/Diff，新 direction 没对应 template = 静默跳过（虽然有提示）
- **结论**: 完整加新 direction 需要 2 处：phase2_analyze.cjs DIRECTION_RULES + phase3_propose.cjs PROPOSAL_TEMPLATES。漏一个 = cluster 但无议案
- **解决（候选）**: M2.3.2.3 任务（评估其状态）；或加 fallback：无 template 时产"草稿议案"骨架让人审填
- **影响**: 当前 context-curator 的 truncate_aggressive 模式被识别但无 actionable 议案；待手动加 template 或人手种子

### F-017: 空/极简 fix_notes 让 evolution-tracker 跑出 0 议案（信号关键词不命中）
- **来源**: 2026-4-30 14:47 evolution-tracker 跑 context-curator 第一次：valid_run=1 但 fix_notes 仅 "..."（Alex 4-30 自己用 skill_feedback CLI 打分时输入）
- **现象**: Phase 2 ANALYZE → 1 个 uncategorized piece，clusters_found=0；Phase 3 PROPOSE → 0 议案
- **根因**: evolution-tracker SIGNAL_KEYWORDS 是 `[不会, 不能, 没改, 没变, 静默, 凭空, 捏造, 失败, 进化, 自我, 缺, Phase, 应该, fix]`；"..." 不含任何关键词 → 不进任何 cluster → 不产 direction → 不产议案
- **结论**: meta-loop 正确工作但**输入决定输出**——skill_feedback 没强制 / 没 nudge fix_notes 长度+内容质量 → 形成"打分 ≠ 进化"的死循环
- **对应蓝图**: §3.B1 治理元设计假设是"用户写得动 fix_notes"——这条假设需 CLI 主动捍卫
- **解决（候选）**: 见 P-2026-4-30-002（skill_feedback CLI 加 ≥30 字 + 关键词覆盖检查）；或 evolution-tracker SKILL.md 加更宽容的关键词集（包括"压成"/"看不到"/"激进"等具象词）
- **影响**: 任何 user_feedback 驱动的 skill 都受此影响——目前 knowledge-curator 跑过 5 次有 4 个 valid run 是因 Alex 写得详细，运气成分大；制度化是必须的

### F-008: knowledge-curator skill 缺"写入后校验"环节（具象化为 runs.jsonl JSON 损坏）
- **来源**: 2026-4-28 给第 1 条 runs.jsonl 写 user_feedback 时，发现整个 L2 早就 parse 失败——windows 路径 `E:\java\tools\git\Git\usr\bin\bash.exe` 里的反斜杠没在 JSON 字符串里转义为 `\\`
- **结论**: skill 把 JSON 写入磁盘后**没有立刻 parse 验证**——这是"静默失败"的典型场景（蓝图 §1.Q3 用户最害怕的失败之一）
- **对应蓝图**: §3.A6 校验元缺失 / §6.R5 user_feedback 链条断开
- **解决（这次）**: node 脚本批量替换 + 全文件 JSON.parse 验证
- **解决（长期）**: M2 做 evolution-tracker 时，read 阶段就 parse；M3 之前给 knowledge-curator 加 Phase 5.5 "校验后确认"
- **影响**: 项目铁律 #8 写入 CLAUDE.md（"写 JSON 后必须立刻校验"）；任何写 JSONL 的 skill 都受此影响

### F-009: 项目时间格式约定 = 北京时间 `YYYY-M-D HH:MM:SS`
- **来源**: 用户 2026-4-28 14:20 明示要求"全部改"
- **结论**: 项目所有时间戳一律北京时间，去前导零，空格分隔（不用 ISO 8601 `T` 和 `+08:00`）
- **范围**: 含 runs.jsonl `timestamp` 字段、文档日期、修订历史日期、run_id 时间部分
- **对应铁律**: CLAUDE.md #7
- **影响**: 未来任何 skill 写入 timestamp 都按这个格式；新 skill 创建时要在 SKILL.md 顶部声明遵守此约定

### F-005: 元思想的 5 特征 + 4 判断问题可作为 skill 验收 checklist
- **来源**: waytoagi 元思想文档 `KGbewcwM1ic0kFk2A58cL8OanFh`（已读 2026-4-28）
- **5 特征**: 独立 / 足够小 / 边界清晰 / 可替换 / 可复用
- **4 判断问题**:
  1. 拿出来能说清它负责什么吗？（不能 = 还不是元）
  2. 出问题能定位到它吗？（不能 = 还不是元）
  3. 替换它会拖死整个系统吗？（会 = 还不成熟）
  4. 下次相近任务能复用吗？（不能 = 还不成熟）
- **应用**: 每个新 skill 的 SKILL.md 顶部强制声明 5 特征自检（v0.1 蓝图 §6.R4）

### F-006: "元 → 组织镜像 → 节奏编排 → 意图放大" 是不可分主线
- **来源**: 同上
- **结论**: 这四步**不是并排**，是**接力**——只拆元不组织 = 散沙；组织好不编排节奏 = 全在抢话；编排了不发牌 = 系统跟不上变化；前三步都做了不放大意图 = 上层口号落不下去
- **影响**: harness 不能只做单层，必须 4 层都到位

### F-007: 元思想"编程协作场景"给出 8 元拆分
- **来源**: 同上 §九
- **8 元**: 任务理解 / 仓库感知 / 检索 / 方案 / 执行 / 校验 / 说明 / 风险治理
- **应用**: 直接套用为蓝图 §3 的 A1-A8



### F-001: lark-cli markdown 入参的 shell 大小限制
- **来源**: knowledge-curator 第一次运行（run_id `2026-4-28-harness-trilogy`）
- **结论**: `lark-cli docs +create --markdown <huge>` 会因为 shell argv 限制失败（E2BIG）
- **解决**: chunk + 用 `execSync` 显式指定 `E:\java\tools\git\Git\usr\bin\bash.exe`
- **影响**: 任何要写大文档的 skill 都需要这个 workaround；建议提取为 lark-shared 的 helper

### F-002: 飞书 drive API 不支持 folder listing（lark-cli 层）
- **来源**: 同上
- **结论**: 不能 list 用户飞书云空间的文件夹列表
- **解决**: 要么让用户给 folder URL，要么写到 wiki space `my_library`
- **影响**: 任何"自动找正确文件夹"的需求都要重新设计为"用户给指针 / 退化到 wiki"

### F-003: lark-cli `docs +create` 不接受 `--format` flag
- **来源**: 同上
- **结论**: 创建文档时 markdown 是默认且唯一格式，传 `--format markdown` 会报错
- **影响**: 别再手贱加 `--format`

### F-004: UTF-8 字节计数 ≈ 中文字符数 × 3
- **来源**: 同上
- **结论**: `wc -c` 输出 ≈ JS `string.length` × 3（中文）
- **影响**: 估算 chunk 大小时按字节算，不按 char 算

### F-010: `lark-cli docs +create` 成功响应的 doc 标识路径是 `data.doc_id` + `data.doc_url`
- **来源**: M1.5 第 2 次跑（run_id `2026-4-29-meta-kim`），首次写的 chunked-create 脚本去顶层找 `objToken / token / docToken`，全部 undefined → FATAL exit
- **结论**: lark-cli 飞书 docs +create 的 JSON envelope 是 `{ok, identity, data: {doc_id, doc_url, log_id, message}}`——别去顶层找 token/url
- **解决（这次）**: 写 recovery 脚本重切源文件 + 直接 append 剩余 chunks 到已知 `doc_id`
- **影响**: 任何 lark-cli docs +create 之后要做 update 的脚本都按 `j.data.doc_id` 解析；建议提取为 lark-shared 的 helper（`parseCreateResponse(out) → {docId, docUrl}`）

### F-011: chunked-create 脚本必须**先把所有 chunks 全落盘**再发首次 create 调用
- **来源**: 同上 F-010；FATAL exit 后 chunks 1+ 没写盘，recovery 不得不重切源文件
- **结论**: "create 一次 + 边切边 append" 是反模式——任何中间步骤 fail 都会丢未落盘的 chunks
- **正确套路**:
  1. 先 split → 全部 `chunk_*.md` 写盘
  2. 再 create chunk_000
  3. 再循环 append chunk_001..N
  4. 失败重启时只读 chunks 目录，不必重切源
- **影响**: knowledge-curator SKILL.md Phase 4 应吸收（M2.2.5 议案候选）

### F-016 (FIXED 2026-4-29): task_plan.jsonl 的 blocked_by 是野指针（task_id 拆分/重命名时不会自动更新）

**修复状态**: ✅ 短期方案已落地（sync_task_plan.cjs 加引用完整性校验）

修复后行为：
- 同步时如发现 `blocked_by` 引用不存在的 task_id，jsonl 输出 `dangling_blocked_by` 字段标
- 终端 warn：`⚠️ 1 task(s) have dangling blocked_by references: 2.4: blocked_by=["2.3"] → dangling=["2.3"]`
- 长期方案（task_plan.md 改 task_id 同步改 notes 或禁止重命名）仍未做，留给未来


- **来源**: 2026-4-29 16:21 evolution-tracker Phase 1 跑出 task plan section，看到 `2.4 ← 2.3:?`——因为 task_plan.md 已经把 2.3 拆成 2.3.1+2.3.2，但 2.4 的 notes 还写"等 2.3"
- **结论**: sync_task_plan.cjs 只是 markdown → jsonl 的字面镜像，不做引用完整性检查；task_plan.md 改 task_id 时 blocked_by 的引用会变野指针
- **影响**: 健康度图谱误导（看上去 2.4 在等一个不存在的 task）；evolution-tracker 未来如果消费 blocked_by 做议案，会出错
- **解决（短期）**: sync_task_plan.cjs 加一步"完整性校验"——blocked_by 中的每个 id 必须能在 task list 中找到，否则 status 字段标 `dangling: true` 或 warn
- **解决（长期）**: task_plan.md 改 task_id 时应同步改其他行的 "等 X.Y" 引用；或干脆禁止重命名（只能 deprecate 后新增）
- **应用**: M2.4 evolution-tracker 自我复盘的候选议案（task_plan-progress 类 direction）

### F-015: 同日重跑 evolution-tracker 时 proposal_id 冲突
- **来源**: 2026-4-29 15:33 第 2 次重跑后 `_index.jsonl` L4-L6 的 proposal_id 跟 L1-L3 完全一样（P-2026-4-29-001/002/003）
- **结论**: `phase3_propose.cjs` 用 `P-${bjToday()}-${idx}` 生成 ID，但 `idx` 是每次跑从 1 重置的本地计数器——同一天重跑必冲突
- **影响**: `_index.jsonl` 出现 2 套相同 P-id；下次想"接受 P-002"时无法区分指哪一条；这是 ID 设计 bug，不是数据 bug
- **解决（长期）**: ID 生成应基于 `_index.jsonl` 现存最大 idx + 1（全局递增，不跨天重置；或用 timestamp 后缀如 `P-2026-4-29-1533-001`）
- **应用**: M2.4 evolution-tracker 自我复盘时应翻成议案

### F-014: evolution-tracker ANALYZE 阶段不识别 `approved` 状态，会无限重提同 direction
- **来源**: 2026-4-29 15:33 第 2 次跑：phase7_push + phase4_robustness 在第 1 次跑后已 status=approved 且真落地到 knowledge-curator/SKILL.md v0.1.1，但第 2 次跑还是产出完全一样的 P-002/P-003 (status=pending)
- **结论**: `phase2_analyze.cjs` 的黑名单逻辑只检查 `reject_count_same_direction`，不检查同 direction 是否有已 approved 议案
- **影响**: 即使议案已落地，evolution-tracker 还会反复提"应该加 Phase 7 / Phase 4.5"——产生噪音、稀释新信号
- **解决（长期）**: ANALYZE 阶段加 `approved_skip` 逻辑：如果某 direction 在 `_index.jsonl` 中有任何 `status=approved` 议案，跳过该 direction（或只在 subject_skill_version 大于 `applied_to_skill_version` 时才再提）
- **应用**: M2.4 evolution-tracker 自我复盘的最高优先级议案

### F-013: evolution-tracker 议案 .diff 不是真 unified diff，`git apply` 会失败
- **来源**: 2026-4-29 11:55 真落地 P-002 + P-003 时发现，`@@ Phase 5: LOG @@` 缺真行号 hunk header（标准 unified diff 应该是 `@@ -lineX,Y +lineA,B @@`）
- **结论**: 当前 `lib/phase3_propose.cjs` 模板写的是"伪 diff"（只有上下文 + +/- 行），人读 OK，机器 `git apply` 不行
- **解决（这次）**: 用 Edit 工具按议案意图手动应用，记 applied_via=`manual_edit (F-013 候选)`
- **解决（长期）**: M2.4（下一轮 evolution-tracker 自我复盘）应当把 F-013 翻成议案，真正的 unified diff 生成需要：
  1. 读 subject SKILL.md 找精确插入行号
  2. 生成带 `@@ -X,Y +X,Z @@` 的 hunk header
  3. 测试 `git apply --check` 在 staging 通过再写
- **影响**: M2 阶段议案产物只能"人读手 apply"；M3 之前需要修；这条是 evolution-tracker 自己进化的第一个真实信号

### F-012: knowledge-curator 缺 Phase 7 PUSH——产出后只给链接不直推飞书
- **来源**: M1.5 第 2 次跑用户 fix_notes（`runs.jsonl` L4，rating=3）："飞书文档可以直接发到我的飞书上面去 ... 而不是给一个链接，自己还要打开！"
- **结论**: 当前 SKILL.md Phase 6 REPORT 只在终端打印 doc_url，把"开链接"的成本留给用户。这违反了"工具应吸收摩擦"
- **本次手动绕路**: `lark-cli im +messages-send --user-id ou_835b575f2e109b0f16569558480d202c --as bot --markdown <summary>`，message_id `om_x100b5022b61c58e0b3931be54f133ad`，验证此路通
- **议案设计**:
  - SKILL.md 加 Phase 7 PUSH（在 LOG 之后、REPORT 之前 / 之内）
  - 默认目标 = 用户 open_id（global memory 已存）
  - 兜底 = 询问手机号 → `lark-cli contact` 查 open_id（需校 lark-cli 是否有此 helper）
  - 内容 = doc 标题 + URL + 关键章节摘要 + errors 摘要
- **对应蓝图**: §1.Q4 用户要"实时观察"——直推到 IM 是观察成本最低的形式
- **下一步**: M2.2.5 evolution-tracker v0.2 范例 = 把 F-012 + L2 fix_notes "不会自我进化" 作为 2 条议案候选输入，假想 evolution-tracker 跑完产出什么 markdown

## 待验证（Hypotheses）

### H-001: knowledge-curator 在 3-5 次运行后能否触发有意义的 L2 复盘？
- **状态**: 已跑 **2 次 valid run**（4-28 wiki rating=5 + 4-29 meta_kim rating=3）；M1 目标 3 次还差 1 次
- **行动**: 跑第 3 次（M1.6/1.7）后做第一次手动 L2 复盘——验证 `user_feedback` 提供的信号够不够指导 SKILL.md 改动
- **何时验证**: 跑够 3 次后
- **当前迹象**: 2 次 fix_notes 已经给出 2 个清晰议案信号（F-012 PUSH + L2 "不会自我进化"），密度看着够

### H-002: 蓝图先于代码这种工作流是否真的能少走弯路？
- **状态**: 这个项目自己就是这个假设的实验
- **行动**: 等 Phase 1（实现下一个 skill）后回顾——比起"凭直觉先开干"，是不是少改了？
- **何时验证**: 完成第二个 skill 之后

## 死路（Dead Ends）

> 留给"以后差点想再试一次但其实试过了"的提醒。

（暂无）
