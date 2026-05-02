# dashboard — 设计草案 v0.2

> **状态**: v0.2（2026-5-2 brainstorm 10 决策锁定，进入实装）
> **创建**: 2026-5-1
> **对应蓝图**: §3.B? 观察层（新增），元思想"组织镜像"的可视化具象——把 harness 自身活动**镜面化**到浏览器
> **触发原因（v0.0）**: Alex 2026-5-1 brainstorm —"是否可以做一个实时性的可观看数据变化的界面"
> **触发原因（v0.2 重构）**: Alex 2026-5-2 — "token/费用统计解决不了，直接重构整个页面"

## 修订历史

| 版本 | 时间 | 变更 |
|---|---|---|
| v0.0 | 2026-5-1 | brainstorm 三轮拍板：A 推流实时 / E1 hook 驱动 / B+C 卡片墙+双栏 / 端口 7777 单 session 本地 only 不持久化 |
| v0.1 | 2026-5-1 ~ 5-2 | v0.0 → 实装现有 dashboard（504+1246+412 = 2162 行），跑通基础推流；token/费用统计触礁 |
| **v0.2** | **2026-5-2** | **重构：3 tab SPA（实时/历史/升级）+ URL 路由 + Session→Task 两层数据模型 + 装 PostToolUse hook + 深色开发者风**；放弃 token/费用准确显示 |

---

## §0 一句话责任 + 边界

### 一句话（v0.2）

**用 PostToolUse hook 把 Claude Code 每次工具调用 append 到 `_meta/live-events.jsonl`，本地 Node server 按 Session→Task 两层聚合，通过 SSE 推给浏览器；前端 3 tab SPA（实时 / 历史 / 升级）+ URL 路由，深色开发者风，让 Alex 看到 harness 自身在干啥、用了哪些 skill、走过什么坑。**

### 适用 / 不适用

| 适用 | 不适用 |
|------|--------|
| 实时观察当前 session 当前 task 的事件流 | Token 用量 / 费用 / 缓存命中率（v0.2 故意不展示——hook 数据不可靠） |
| 翻历史 session、查每个 task 详情、看用了哪些 skill | 跨 session 趋势分析（v0.3+） |
| 区分独立模式 vs team 模式（Claude 多 agent 并行） | 远程访问 / 多用户 / auth |
| 看项目自我升级痕迹（task_plan / progress / findings / git / helix-runs） | 改 14 个 skill 的代码（**零侵入**底线） |
| 任务详情可分享（URL 路由 `/task/:id`） | 替代 Claude Code 自带 transcript |
| 飞书总结产出 | 性能 profiling / 跑得最慢的 5 个 skill 等 metric 视图 |

---

## §1 「元」5 特征自检（v0.2 重检）

| 特征 | 评估 | 理由 |
|------|------|------|
| 独立 | ✅ | 输入只读 hook payload + 现有 jsonl + progress/findings/git；输出只写 live-events.jsonl 和 DOM；不依赖任何 skill |
| 足够小 | ⚠️ | 三组件（hook < 80 行 / server < 600 行 / 前端 < 1500 行）。比 v0.0 大，但分摊到 3 个 view + URL 路由后单文件可控 |
| 边界清晰 | ✅ | hook 只 append 不阻塞；server 只读 jsonl + 推 SSE + 服务静态；前端只渲染 |
| 可替换 | ✅ | 渲染层替换不影响数据；server 可换语言；hook 脚本可独立复用 |
| 可复用 | ✅ | hook 脚本可搬到任何 CC 项目；server 参数化"读哪个 jsonl"+"项目根目录" |

---

## §2 v0.2 brainstorm 决策记录（10 锁）

| # | 决策点 | 锁定方案 | 关键理由 |
|---|---|---|---|
| 1 | **数据采集** | A：装 PostToolUse hook（实装 v0.0 §4.1 设计） | 不装 hook，需求 1/2/4/5 都是空中楼阁；侵入面 60 行可控 |
| 2 | **数据模型层级** | A：两层 = **Session**（CC 启动→关闭，hook 自带 session_id）→ **Task**（一次 / 命令，按 UserPromptSubmit 切分） | 直接对应 Alex 用语；hook 自带 session_id 零额外标记成本 |
| 3 | **team 模式定义** | B（修正版）：**team = 一个 task 里 Claude 并行调度 ≥2 个 Agent() / Task() sub-agent**；helix 串行多 phase = 独立 | Alex 补丁："team 模式就是 Claude 自带的多个 agent 并行" |
| 4 | **自我升级数据子集** | B：5 源 = `progress.md` + `findings.md` + `git log` + `task_plan.md(.jsonl)` + `helix-runs.jsonl` | 三件套（事/坑/码）+ 任务进度 + harness 自用记录；reviews / 设计修订 / 议案池只做链接跳转 |
| 5 | **IA + 顶层导航** | B：SPA 3 tab（**实时 / 历史 / 升级**）+ URL 路由（`/live`、`/history`、`/evolution`、`/task/:id`） | 可分享链接、可 back、未来加快捷键也顺手 |
| 5b | **team 详情语义** | (i)：同一 task 里点不同 sub-agent 看每个 agent 的事件流 | 不是"跨 task 比较 team 配置" |
| 6 | **实时视图布局** | B：三段 = 顶 60px session 概览条 / 主区当前 task 详情（独立=timeline，team=N 列）/ 右栏 300px 全局事件流 | 空闲时主区显示"最近一次 task 回放"，对应 Alex 需求 1 后半句 |
| 7 | **历史视图列表** | B：两层折叠 = 左栏 session 列表（一行=一次 CC 周期，标"3 tasks · 12min · 2 helix runs"）→ 右栏该 session 下 task 列表 | 直接对应两层数据模型 |
| 8 | **升级视图布局** | C：三段 = 顶（task_plan 树 + helix-run 状态徽章）/ 中（progress + git log 合并时间线）/ 下（findings 卡片列表） | 三段对应"在哪 / 怎么走的 / 学到啥" |
| 9 | **UI 风格** | A：深色开发者风（Linear / Vercel / GitHub Dark / Raycast 参照），用 ui-ux-pro-max 出具体 token | 高信息密度 + 长时间不刺眼 + 事件流像 terminal log 自然 |
| 10a | **实装节奏** | B：4 段交付 = ① hook + 后端 + 数据契约 → ② 实时视图 → ③ 历史 + 升级视图 → ④ ui-ux-pro-max 风格落地；in-place 改 dashboard/（不新建 v2 目录） | 每段可见进度；in-place 不维护两份 |
| 10b | **飞书总结内容** | B：10 决策 + 验收报告（§8 清单逐项打勾）+ 关键截图 4-6 张 + 数据契约 + v0.3 路线（YAGNI 列表） | 6 个月后回看也知道"为什么这么定" |

---

## §3 数据契约

### 3.1 `_meta/live-events.jsonl`（hook 写入）

每行一个 JSON 对象，**原样落 hook payload + 项目派生字段**。所有时间戳用北京时间 `YYYY-M-D HH:MM:SS` 格式（项目铁律 §工作约定 #7）。

```jsonc
{
  "ts": "2026-5-2 23:45:12",
  "session_id": "abc123",            // CC 提供，CC 启动到退出唯一
  "task_id": "abc123-t-005",         // 派生：session_id + 该 session 内 task 序号
  "task_label": "/helix",            // 派生：UserPromptSubmit 时记录，前 60 字符或斜杠命令名
  "hook_event": "PostToolUse",       // PreToolUse / PostToolUse / UserPromptSubmit / Stop
  "tool_name": "Bash",
  "tool_input": { "command": "..." },
  "tool_output_truncated": "...",    // 截断到 2KB
  "tool_output_size": 12345,
  "duration_ms": 320,
  "is_error": false,
  "skill": "helix",                  // 推断：tool_input cwd 命中 .claude/skills/<name>/ 或 helix-runs.jsonl 当前 run 的 phase
  "phase": null,                     // v0.2 仍 null；v0.3 升 E3 后才有值
  "subagent_type": null,             // 当 tool_name = "Agent"/"Task" 时，从 tool_input.subagent_type 拷贝
  "is_parallel_agent": false,        // 派生：同一 task 内 200ms 内 ≥2 条 Agent 调用 → 全部置 true
  "hook_payload_raw": { ... }        // 兜底：保留整个原始 payload，UI 缺字段时 fallback
}
```

### 3.2 Task 边界识别

| 信号 | 含义 |
|---|---|
| `UserPromptSubmit` 触发 | 当前 session 开新 task；递增 task 序号；task_label 取自 prompt 前 60 字符（如以 `/` 开头则取斜杠命令名） |
| `Stop` 触发 | 当前 task 收尾；server 在内存里把该 task 标 `done` |
| 同 session 下次 `UserPromptSubmit` | 自动收尾上一个未 stop 的 task（防 Stop hook 漏触） |

### 3.3 mode 推导（独立 vs team）

```
对一个 task 的全部事件：
  1. 找出 tool_name in ["Agent", "Task"] 的事件
  2. 如有 ≥2 条且任意两条 ts 间隔 < 200ms → mode = "team"
  3. 否则 → mode = "independent"
team 模式下：sub_agents = distinct(subagent_type)，每个 sub_agent 自有事件流
```

### 3.4 SSE 协议（server → browser）

```
event: hello
data: { "session_id": "...", "server_started_at": "..." }

event: new_event              // 每条 hook 事件
data: { ...上面那个 JSON... }

event: task_started
data: { "task_id": "...", "session_id": "...", "label": "...", "started_at": "..." }

event: task_finished
data: { "task_id": "...", "duration_ms": 12345, "events_count": 87, "mode": "team" }

event: heartbeat
data: { "ts": "..." }         // 每 15s
```

### 3.5 server 内存聚合

```
sessions: Map<session_id, {
  started_at, last_event_at, status: "live" | "ended",
  tasks: [task_id...]
}>
tasks: Map<task_id, {
  session_id, label, started_at, ended_at, status,
  events: [...] (最多 1000 条/task，超出按 ts 滚动),
  mode, sub_agents,
  skills_used: Set<string>
}>
```

---

## §4 三组件设计（v0.2）

### 4.1 PostToolUse / UserPromptSubmit / Stop Hook（`hooks/dashboard-emit.cjs`）

- **触发**：CC 三个事件（v0.0 只有 PostToolUse，v0.2 加 UserPromptSubmit + Stop 用于 task 边界）
- **行为**：append 一行到 `_meta/live-events.jsonl`
- **关键约束**：
  - try/catch 全吞，stderr 一笔；主流程绝不感知
  - 行 size > 8KB 截断 tool_output 字段；保留 size 字段
  - JSON.stringify 失败的事件跳过，不写入
- **代码量目标**：< 80 行
- **配置**：`.claude/settings.local.json` 注册三个 hook 各自指向同一 cjs

### 4.2 Dashboard Server（`dashboard/server.js` 替换）

- **职责**：tail jsonl + 维护 sessions/tasks 内存聚合 + SSE 广播 + REST API + 服务静态
- **依赖**：纯 Node stdlib
- **路由**：
  - `GET /` → 静态 `public/index.html`
  - `GET /api/sessions` → 历史 session 列表
  - `GET /api/sessions/:id` → 单 session 详情（含其 task 列表）
  - `GET /api/tasks/:id` → 单 task 完整事件流
  - `GET /api/evolution` → 升级数据聚合（progress + findings + git + task_plan + helix-runs）
  - `GET /sse` → SSE 实时推流
- **代码量目标**：< 600 行（拆 `server.js` + `aggregator.js` + `evolution.js`）

### 4.3 Dashboard 前端（`dashboard/public/index.html` + `app.js` + `styles.css` 替换）

- **架构**：原生 SPA；`history.pushState` 路由；`EventSource` SSE
- **路由**：
  - `/` 或 `/live` → 实时视图
  - `/history` → 历史视图
  - `/evolution` → 升级视图
  - `/task/:id` → 任务详情（独立顶层路由，可分享）
- **样式**：CSS Grid + CSS variables，深色风（ui-ux-pro-max 输出 token）
- **代码量目标**：HTML < 200 行 + app.js < 1500 行 + styles.css < 600 行

---

## §5 三视图布局（v0.2 核心）

### 5.1 实时视图 `/live`

```
┌──────────────────────────────────────────────────────────────┐
│ Session: abc123 · 18:42:10 起 · 3 tasks · 12m34s · ● live    │ 60px
├────────────────────────────────────────────┬─────────────────┤
│                                            │  Live Stream    │
│   当前 Task: /helix [team mode · 3 agents] │  ─────────────  │
│   ┌─[planner]───┬─[code-reviewer]─┬─[...]─┐│  21:33:45 Bash  │
│   │ 03:12 Bash  │ 02:45 Read       │ ...   ││  21:33:42 Read  │
│   │ 03:11 Read  │ 02:44 Grep       │       ││  21:33:38 Edit  │
│   │ ...         │ ...              │       ││  21:33:35 Bash  │
│   └─────────────┴──────────────────┴───────┘│  ...            │
│                                            │  (滚动)         │
│   独立模式时此区为单 timeline               │                 │
└────────────────────────────────────────────┴─────────────────┘
                                              300px
```

- 空闲：主区显示"最近一次 task 回放"，灰底加 "IDLE" 标
- 状态点：● live / ◐ recently / ○ idle / ✗ error

### 5.2 历史视图 `/history`

```
┌──────────────────────┬───────────────────────────────────────┐
│ Sessions             │ Session abc123 (selected)             │
│ ─────────────────    │ ───────────────────────────────────   │
│ ● abc123  now        │ Started: 2026-5-2 18:42                │
│   3 tasks · 12m      │ Status: ● live · 12m34s                │
│   2 helix · 1 team   │ ─────────────────────────────────     │
│ ─────────────────    │ Tasks (3):                             │
│ ○ def456  1h ago     │ ┌────────────────────────────────────┐ │
│   1 task · 3m        │ │ ① /helix [team] 3m12s · 87 events  │ │
│ ─────────────────    │ │ ② /knowledge-curator 4m · 23 events│ │
│ ○ ghi789  yesterday  │ │ ③ free chat 5m · 12 events         │ │
│   ...                │ └────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────┘
   左 320px              点 task 行 → 跳 /task/:id
```

### 5.3 升级视图 `/evolution`

```
┌──────────────────────────────────────────────────────────────┐
│ ▌当前进度树（task_plan.md 渲染） + helix 最新 run 徽章         │ 顶
│   Phase 1 ─ M5 ─ in_progress                                  │
│     ✅ 4.1 mode-router design  ✅ 4.2 mode-router impl         │
│     ⏳ 4.3 mode-router test    ⬜ 4.4 promote                 │
├──────────────────────────────────────────────────────────────┤
│ ▌进展时间线（progress.md + git log，按时间）                   │ 中
│   2026-5-2 21:55  feat(dashboard): rebuild v0.2  [git]        │
│   2026-5-2 18:42  PROGRESS Q10 brainstorm 锁定   [progress]   │
│   2026-5-2 15:56  fix(session-reporter): kill flood  [git]    │
│   ...                                                          │
├──────────────────────────────────────────────────────────────┤
│ ▌教训面板（findings.md 卡片）                                  │ 下
│   F-008 写 JSONL 后必须立刻校验  · 2026-4-29  [✓ 已沉淀]      │
│   F-017/18/19 待物质化（task 3.16）   ...                     │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 任务详情视图 `/task/:id`

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back · Task abc123-t-005 · /helix · team · 3m12s · ✅       │
│ Session: abc123 · started 18:42:33                            │
├──────────────────────────────────────────────────────────────┤
│ Tabs: [Overview] [Events] [Skills Used] [Sub-agents]          │
├──────────────────────────────────────────────────────────────┤
│ Overview:                                                     │
│   • Mode: team (3 parallel agents)                            │
│   • Skills used: helix, planner, code-reviewer (12 unique)    │
│   • Total tool calls: 87 · Errors: 0                          │
│   • Phases: a1 → a4 → a5 → a6 (helix-runs.jsonl)              │
│ Events (按 sub_agent 分列；独立模式则单列时间线)               │
│ Skills Used: 名单 + 各自调用次数 + 总耗时                       │
│ Sub-agents: 仅 team 模式可见，每 sub-agent 自己的事件流卡片    │
└──────────────────────────────────────────────────────────────┘
```

---

## §6 失败模式 + mitigation（v0.2 增补）

| # | 失败模式 | 触发 | mitigation |
|---|----------|---------|-----------|
| F-1 | hook 写 jsonl 失败阻塞主 skill | 磁盘满 / 文件锁 | hook try/catch 全吞 + stderr |
| F-2 | jsonl 行过长把 SSE 卡死 | tool_output 1MB | hook 截断 2KB |
| F-3 | 多 CC session 同时写互相覆盖 | append race | `fs.appendFileSync` 原子；不行就 v0.3 上锁 |
| F-4 | server 跑两份占用同端口 | 7777 已占 | 启动检测 → exit 1 + 提示 |
| F-5 | 卡片状态推导漂移（一直 running） | session 崩没 Stop | 30s 心跳超时降 idle |
| F-6 | session_id 缺失 | hook payload 没带 | UI 归到 "default" session |
| F-7 | 浏览器和 server 时间不同步 | 都本地 | 一律用 server 写入时的 `ts` |
| F-8（新） | UserPromptSubmit hook 漏触 → task 不切分 | CC 版本差异 | 用相邻事件 ts gap > 30s 启发式切分作 fallback |
| F-9（新） | task 内事件 > 1000 → 内存爆 | 超长任务 | 滚动保留最新 1000，老的写 `task_id-overflow.jsonl` |
| F-10（新） | 浏览器 SPA 路由 reload 丢失 state | F5 / 直接打开 URL | 路由从 URL 解析；首次 load 走 REST API 拉数据 |
| F-11（新） | mode 误判（200ms 阈值不合适） | 慢启动 sub-agent | 阈值改为可配，默认 500ms；UI 显示 mode 时带 "auto-detected" 标 |

---

## §7 故意不做（YAGNI）

| 不做的 | 重新评估时机 |
|--------|-------------|
| Token 用量 / 费用 / cache hit rate | 永不（v0.2 明确放弃；hook 数据不可靠） |
| 跨 session 趋势图 | v0.3，跑 ≥ 50 session 再说 |
| 跑得最慢的 5 个 tool（profiler） | v0.3 或独立 skill |
| Phase 级别 emit（E2/E3） | v0.3，根据"有没有遗憾" |
| 远程访问 / auth | 可能永不 |
| 历史回放（rewind） | v0.4+ |
| WebSocket 双向 | 永不 |
| 多用户 / 协作 | 永不 |
| 桌面通知 | session-reporter 已做 |
| 议案池视图（PROPOSALS） | task 3.16 落地后 v0.3 |
| reviews / 设计修订 渲染 | 现阶段链接跳转即可 |
| 日历 heatmap | 数据密度不够，v0.3+ |

---

## §8 验收清单（v0.2 跑通定义）

### A. Hook 层（4 项）
- [ ] A1 `.claude/settings.local.json` 注册 PostToolUse / UserPromptSubmit / Stop 三个 hook
- [ ] A2 触发一次 Bash → live-events.jsonl 多 1 行 PostToolUse
- [ ] A3 发一次 prompt → 多 1 行 UserPromptSubmit；该行 task_id 自增
- [ ] A4 hook 出错（如手动只读 jsonl）不阻塞主 skill；stderr 有 dashboard 报错

### B. Server 层（4 项）
- [ ] B1 `node dashboard/server.js` 输出 "listening on 127.0.0.1:7777"
- [ ] B2 `GET /api/sessions` 返回 ≥1 条
- [ ] B3 `GET /api/tasks/:id` 返回完整事件
- [ ] B4 SSE `/sse` 心跳 15s 一次

### C. 实时视图（5 项）
- [ ] C1 打开 `/live` 见 session 概览条
- [ ] C2 跑一次 `/helix` → 主区显示 timeline 实时更新
- [ ] C3 右栏全局事件流实时滚动
- [ ] C4 task 完成 → 状态点 ● → ◐
- [ ] C5 空闲时主区显示"最近一次回放"且加 IDLE 标

### D. 历史视图（4 项）
- [ ] D1 `/history` 左栏显示所有 session（含当前）
- [ ] D2 点 session 行 → 右栏显示其 task 列表 + 聚合 metric
- [ ] D3 task 行标签正确显示 mode（team / 独立）
- [ ] D4 点 task → 跳 `/task/:id`

### E. 升级视图（4 项）
- [ ] E1 `/evolution` 顶部 task_plan 树正确渲染
- [ ] E2 中段时间线 progress + git log 合并按时间倒序
- [ ] E3 下段 findings 卡片正确分组
- [ ] E4 顶部 helix 最新 run 徽章实时

### F. 任务详情视图（5 项）
- [ ] F1 `/task/:id` 直接打开能渲染（F5 也行）
- [ ] F2 独立模式：单 timeline
- [ ] F3 team 模式：N 列并排 sub-agent
- [ ] F4 Skills Used tab 列出所有 distinct skill
- [ ] F5 Back 按钮回上级（`/history` 或 `/live`）

### G. UI 风格（3 项）
- [ ] G1 深色背景 + 高对比 + 等宽字体辅助
- [ ] G2 状态点配色一致（live/recently/idle/error）
- [ ] G3 ui-ux-pro-max 出的风格 token（颜色 / spacing / 字号）落地一致

### H. 端到端（3 项）
- [ ] H1 hook 链路 → 浏览器 → 跑一次 task 全程可见
- [ ] H2 关浏览器、关 server、重启全流程不丢已落 jsonl 数据
- [ ] H3 飞书总结文档已推送（含决策 + 验收 + 截图 + 数据契约 + v0.3 路线）

---

## §9 实装顺序（4 段交付）

```
段 1（hook + 后端 + 数据）：约 2-3h
  1.1 写 hooks/dashboard-emit.cjs（PostToolUse / UserPromptSubmit / Stop 三入口）
  1.2 注册 .claude/settings.local.json
  1.3 跑一次 Bash + 一次 prompt 验证 live-events.jsonl 增长（A1-A4）
  1.4 重写 dashboard/server.js（含 aggregator + evolution endpoint）
  1.5 验 B1-B4

段 2（实时视图）：约 2h
  2.1 重写 dashboard/public/index.html 骨架 + 路由
  2.2 实时视图三段（C1-C5）
  2.3 mode 推导逻辑（独立 / team）

段 3（历史 + 升级 + 任务详情）：约 3h
  3.1 历史视图两层折叠（D1-D4）
  3.2 升级视图三段（E1-E4）
  3.3 任务详情独立路由（F1-F5）

段 4（ui-ux-pro-max 风格落地 + 验收 + 飞书）：约 2h
  4.1 调用 ui-ux-pro-max 出深色风 token
  4.2 落 styles.css（G1-G3）
  4.3 端到端验收（H1-H2）
  4.4 推飞书总结（H3）
```

每段完成都要：
- 更新 `_meta/progress.md`（最新在最上）
- 失败/惊讶 → `_meta/findings.md` 一笔
- 不静默改 SKILL.md（dashboard 不是 skill，但同理：改 design 留笔）

---

## §10 与现有 skill 的关系

| 现有 skill | 关系 | 备注 |
|-----------|------|-----|
| **helix** | dashboard 监控的主对象之一 | 其 phases_planned 数据被升级视图渲染 |
| **session-reporter** | 职责不重叠 | 写"会话总结报告"（事后归档+推飞书）；dashboard 是"实时观察" |
| **evolution-tracker** | 可消费 dashboard 数据 | 未来读 live-events.jsonl 找异常信号 |
| **mode-router** | 可作为附加显示 | UI 在 task 详情区可附加显示 mode-router 的标签（v0.3） |
| **ui-ux-pro-max** | 在段 4 调用 | 出深色风 token；不参与运行时 |

---

## §11 v0.0 → v0.2 演化对照（精简）

| 维度 | v0.0 | v0.2 |
|---|---|---|
| 核心隐喻 | 14 个 skill 卡片墙顶栏 + 双栏 | 3 tab SPA（实时/历史/升级）+ URL 路由 |
| 数据模型 | 扁平事件流 | Session→Task 两层 |
| Hook 类型 | 仅 PostToolUse | + UserPromptSubmit + Stop |
| Token / 费用 | 暂存 | 明确放弃 |
| Mode 区分 | 不区分 | 独立 vs team（Claude 并行 Agent）|
| 升级视图 | 无 | 顶进度树 / 中时间线 / 下教训 |
| URL 路由 | 无 | `/live` `/history` `/evolution` `/task/:id` |
| UI 风格 | 未定 | 深色开发者风 |

---

**v0.2 锁定，进入实装。**
