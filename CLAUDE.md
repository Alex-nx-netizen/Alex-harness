# Person Project — Personal Agent Harness

> 这是Alex的私人 agent harness 项目。
> 目标：基于 OpenAI Harness Engineering 三部曲 + 元思想，搭建属于自己的 agent harness。
> 状态：v0.1（蓝图已整合，进入 Phase 1 / M1），持续迭代。
> 工作目录：`/Users/a1234/person/ai/study/Alex-harness/`（2026-5-8 从 Win `E:\ai\study\person\Alex-harness\` 迁 mac；4-28 在 Win 下从 `E:\ai\study\person\harness\` 重命名）

## 项目定位

**是什么**：一组协作的 skill + 文档 + 工作流，让 Claude 在帮我做事时更可控、可观测、可演进。

**不是什么**：
- 不是商业产品
- 不是 Claude Code 的 fork
- 不是教程项目
- 不是一次性脚本集合

## 工作目录约定

| 路径 | 用途 | 谁主要写 |
|------|------|---------|
| `CLAUDE.md`（本文件） | 项目级 Claude 指令，约束所有会话行为 | 用户 + 协商 |
| `design/` | 设计文档、蓝图、架构思考 | **用户主权**，Claude 只填骨架 |
| `design/harness-blueprint.md` | 当前 harness 蓝图（持续 v0.x → v1.0） | **用户主权** |
| `_meta/task_plan.md` | 当前在做什么、阶段、子任务、错误（**人读主源**） | Claude 维护，用户审 |
| `_meta/task_plan.jsonl` | task_plan.md 的机器可读镜像（Ralph 风格 passes 字段） | 自动生成（运行 `node _meta/sync_task_plan.cjs`） |
| `_meta/sync_task_plan.cjs` | task_plan.md → task_plan.jsonl 单向同步脚本（绝不改 md） | Claude 维护 |
| `_meta/progress.md` | 执行日志，每次产出追加（最新在最上面） | Claude 维护 |
| `_meta/findings.md` | 学到的、踩过的坑、待验证的假设、死路 | Claude 维护 |
| `skills/` | 项目级 skill（已提交 GitHub） | Claude 实现，用户审 |
| `skills/knowledge-curator/` | v0.1.0 已落地，整理输入 → 飞书 | - |

## 工作约定（铁律）

1. **小步迭代**：一次只做一件事，做完更新 `_meta/progress.md`，再决定下一步
2. **先想后做**：动代码前必须先在 `design/` 写出"为什么这么做"
3. **不静默修改 SKILL.md**：每次改 skill 都要在 `_meta/progress.md` 留一笔（什么 / 为什么 / 影响）
4. **每个 skill 都有反馈循环**：参考 `knowledge-curator` 的 `logs/runs.jsonl + user_feedback` 模式
5. **失败比成功更值钱**：`_meta/findings.md` 必须专门记"这条路走不通"
6. **永远不直接改 `design/harness-blueprint.md` 的实质内容**——这是用户的主权区域，Claude 只能填骨架/格式
7. **时间格式统一**：所有时间戳/日期一律用北京时间，格式 `YYYY-M-D HH:MM:SS`（含时刻）或 `YYYY-M-D`（仅日期）。**禁用** ISO 8601 `T+08:00`、UTC、前导 0 月份/日期。例：`2026-4-28 22:18:40` ✅；`2026-04-28T15:20:00+08:00` ❌
8. **写 JSON/JSONL 后必须立刻校验**：用 `node -e "JSON.parse(require('fs').readFileSync('path','utf-8'))"` 或脚本逐行 parse。Windows 路径里的 `\` 在 JSON 字符串中必须转义为 `\\`。这条是 F-008 的产物（蓝图 §3.A6 校验元缺失的具象化）

## 反冗余硬规则（v0.8.1 新增 · Karpathy + Lean Code 落地）

> 来源：`design/redundant-code-solutions.md`（2026-5-13 调研报告 §2.3）。
> 旨在把"先想后做"具象成可执行清单，对应 [Lean Code Manifesto](https://github.com/socialawkward/lean-code-llm-manifesto) 10 戒律精华版。

### 写代码**前**必答的 3 个问题

1. 这段逻辑是不是已经在仓库别处实现了？（必须 grep 过）
2. 这个抽象是不是"以为将来会用到"的预案？（没有 3 处以上具体使用就不抽象，三段相似 > 一个早抽象）
3. 这段代码删掉会怎样？（删了还工作 = 它本来就是冗余）

### 写代码**后**必做的 3 件事

1. **自检 diff**：每行变更能否对应到用户需求的某一句？不能对应就删
2. **净行数检查**：本次改动是不是净增加？如果是，重读一遍确认"加"是必要的（铁律：能删则删，先删后加）
3. **注释清理**：删掉所有"重述代码"的注释；保留 WHY，去掉 WHAT；不清晰的代码改名/改结构，不靠注释解释

### 10 条软戒律（评审参考，不卡通过）

`no dead code` · `no redundant validation` · `standard library first` · `comments explain WHY not WHAT` · `minimal error handling`（只在系统边界处理） · `earn abstraction`（≥3 处具体使用才抽象） · `flat over nested`（早 return / 迭代优于递归） · `delete before adding` · `one way to do it`（不混用模式） · `fail fast, fail loud`

> 触发：`/code-simplifier`（专项重构）/ `_meta/refactor-cycle.md`（每月一次大扫除）/ a5-executor §1.5 pre-commit 自检（写代码前后双向卡）。

## 给 Claude 的提示

### 进入项目时必读顺序
1. 本文件（CLAUDE.md）
2. `_meta/task_plan.md`（当前阶段/子任务）
3. `_meta/progress.md` 最新 1-3 条（上次到哪了）
4. 如果任务涉及蓝图：`design/harness-blueprint.md`
5. 如果任务涉及具体 skill：对应 `skills/<name>/SKILL.md`

### 用户偏好
- 直接给推荐 + 主要 trade-off，不要罗列 5 个选项
- 小步、先想后做；不一次性大重构
- 反复迭代，不追求一次性正确——文档要带 `v0.x` 和修订历史
- 飞书相关任务遵循 `lark-shared` 的 SKILL.md 认证规则
- 用户已用 RTK，命令前缀 `rtk` 节省 token

### 边界
- 危险/不可逆操作必须先确认（git push --force, rm -rf, 覆盖飞书文档全文 等）
- 不替用户下设计决定——`design/` 实质内容须用户拍板
- 凡引用 OpenAI Harness 三部曲，先去飞书合集 wiki（见下）找原文，不凭记忆

## 关键参考

- **飞书 Harness 合集 wiki**: <https://www.feishu.cn/wiki/UtW0wUbPbifCX4kk3ypcGcyinGg>
  - 13.2 万字，由 knowledge-curator 第一次运行（2026-4-28）整合三篇 docx 而成
  - 是 harness 设计的主要理论依据

## 当前里程碑

- **Phase -1（已完成）**: knowledge-curator skill v0.1.0 落地
- **Phase 0（已完成）**: 蓝图骨架 → v0.1 蓝图
- **v0.7-v0.8.1（已完成）**: helix + 9 phase + Ralph 契约 + 反冗余三阶段
- **v0.9.0（进行中）**: 真实数据承认版 —— minimal-mode 默认 / `--deep` opt-in；mode-router 中文 keyword 修复；stale auto-finalize；治理元 plugin path fallback。详见 `design/v0.9-minimal-mode.md`
- **v0.9.x+（未开始）**: tree-sitter a2 升级 + a3 真删 + 真实任务积累 ≥10 run
