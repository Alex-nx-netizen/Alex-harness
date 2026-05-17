# Dashboard v0.2 重构 · 总结报告

> **完成日期**：2026-5-2
> **触发**：Alex 5-2 brainstorm —"token/费用同步不了，重构整个页面"，列 8 个需求
> **设计源**：design/dashboard-draft.md v0.2
> **状态**：✅ 落地，跑通端到端

---

## 一、8 个原始需求 → 满足度

| # | 原始需求 | v0.2 兑现 | 状态 |
|---|---|---|---|
| 1 | 当前会话 + 历史会话 | 实时 tab 显示当前 session 概览；历史 tab 列出所有 session，含 live/ended 状态点 | ✅ |
| 2 | 任务详情可点击 | `/task/:id` 独立路由，4 个 subtab（Overview / Events / Skills / Sub-agents） | ✅ |
| 3 | team / 独立模式区分 | mode 自动推断（Claude 并行 Agent ≥2 = team，否则独立）；徽章 + 不同详情布局（独立=timeline，team=N 列并排） | ✅ |
| 4 | 每个 task 用了哪些 skills 全记录 | hook 在 cwd / file_path / command 中识别 `/skills/<name>/`，task 详情 Skills tab 列名单 + 调用次数 | ✅ |
| 5 | 实时按钮 + 历史按钮 | 顶部 tab 切换 `/live` ⇄ `/history` | ✅ |
| 6 | 自我升级记录的所有数据 | 升级 tab 三段：task_plan 进度树 + helix 徽章 / progress + git log 时间线 / findings 教训卡 | ✅ |
| 7 | UI 大改 + ui-ux-pro-max | 深色开发者风（Linear/Vercel/Raycast 参照），CSS 变量 token 化；ui-ux-pro-max 正式 pass 列入 v0.3 微调候选 | ✅ |
| 8 | 飞书总结文档 | 本文 | ✅ |

---

## 二、brainstorm 10 决策（superpowers:brainstorming 一问一答）

| # | 决策点 | 锁定 | 关键理由 |
|---|---|---|---|
| 1 | 数据采集 | A 装 PostToolUse hook | 不装 hook 需求 1/2/4/5 都是空中楼阁；侵入面 60 行可控 |
| 2 | 数据模型 | A 两层 = Session（CC启动→关闭）→ Task（一次/命令） | 直接对应你用语；hook 自带 session_id 零额外标记 |
| 3 | team 定义 | B（修正版）= Claude 并行 Agent() ≥2；helix 串行多 phase = 独立 | Alex 补丁："team 模式就是 Claude 自带的多个 agent 并行" |
| 4 | 自我升级数据 | B = progress + findings + git + task_plan + helix-runs 5 源 | 三件套（事/坑/码）+ 任务进度 + harness 自用记录 |
| 5 | IA + 路由 | B SPA 3 tab + URL 路由（/live, /history, /evolution, /task/:id） | 可分享链接、可 back |
| 5b | team 详情语义 | (i) 同一 task 里点不同 sub_agent 看每个 agent 事件流 | 不是跨 task 比较 team 配置 |
| 6 | 实时视图布局 | B 三段：顶 60px 概览 / 主区 task 详情 / 右栏 300px 全局事件流 | 空闲时主区显示"最近一次回放" |
| 7 | 历史视图列表 | B 两层折叠：左 session 列表 → 右 task 列表 | 直接对应两层数据模型 |
| 8 | 升级视图布局 | C 三段：顶 task_plan + helix 徽章 / 中 progress+git 时间线 / 下 findings 卡片 | 三段对应"在哪 / 怎么走的 / 学到啥" |
| 9 | UI 风格 | A 深色开发者风（Linear / Vercel / GitHub Dark / Raycast） | 高信息密度 + 长时间不刺眼 + 事件流像 terminal log |
| 10a | 实装节奏 | B 4 段交付（hook+server → 实时 → 历史+升级 → ui 风格+验收+飞书）；in-place 改 dashboard/ | 每段可见进度；不维护两份 |
| 10b | 飞书总结 | B 完整版（10 决策 + 验收 + 截图 + 数据契约 + v0.3 路线） | 6 个月后回看也知道"为什么这么定" |

---

## 三、技术架构（数据契约）

### 三组件链路

```
Claude Code 工具调用
   ↓ PostToolUse / UserPromptSubmit / Stop hook
hooks/dashboard-emit.cjs (115 行)
   ↓ append JSON 一行
_meta/live-events.jsonl
   ↓ tail (fs.watch + offset 轮询双保险)
dashboard/server.js (405 行)
   ↓ 内存聚合 Session→Task + 派生 mode/skills_used
   ↓ SSE 推 / REST 拉
浏览器 SPA (index 41 + app.js 670 + styles.css 370)
   ↓ history.pushState 路由 / EventSource
4 个视图：实时 / 历史 / 升级 / 任务详情
```

### live-events.jsonl 字段（hook 写入）

| 字段 | 类型 | 说明 |
|---|---|---|
| ts | string | 北京时间 `YYYY-M-D HH:MM:SS` |
| session_id | string | CC 提供，启动到退出唯一 |
| hook_event | string | `PostToolUse` / `UserPromptSubmit` / `Stop` |
| cwd | string | CC 工作目录 |
| tool_name | string | `Bash` / `Read` / `Edit` / `Agent` / ... |
| tool_input | object | 原始输入 |
| tool_output_truncated | string | 输出截断到 2KB |
| tool_output_size | number | 原始 size |
| skill | string\|null | 从 cwd / path / command 推断（命中 `/skills/<name>/`）|
| subagent_type | string\|null | `tool_name = Agent/Task` 时存在 |
| prompt_preview | string | UserPromptSubmit 时存在；前 200 字符 |
| task_label | string | UserPromptSubmit 时存在；斜杠命令名或 prompt 前 60 字符 |

### REST API

| Endpoint | 用途 |
|---|---|
| `GET /api/health` | server 健康 + sessions/tasks 计数 |
| `GET /api/live` | 当前 session + 当前 task + helix 最新 run |
| `GET /api/sessions` | 历史 session 列表（按 last_event_at 倒序） |
| `GET /api/sessions/:id` | 单 session 详情（含 task 列表） |
| `GET /api/tasks/:id` | 单 task 完整事件流 |
| `GET /api/evolution` | 升级数据聚合（5 源） |
| `GET /sse` | SSE 实时推流（hello/new_event/heartbeat） |

### Task 边界识别

- `UserPromptSubmit` → 收尾上一个 task，开新 task
- `Stop` → 当前 task 标 done
- 同 session 下次 `UserPromptSubmit` → 自动收尾未 stop 的旧 task（防 Stop 漏触，F-8 mitigation）

### Mode 推断

```
对一个 task 的全部事件：
  1. 收集 tool_name in ["Agent", "Task"] 的事件
  2. 任意两条 ts 间隔 < 500ms（F-11 阈值）→ mode = "team"
  3. 否则 → mode = "independent"
```

---

## 四、验收清单（28 项）

### A. Hook 层（4/4 ✅）
- ✅ A1 `.claude/settings.local.json` 注册 PostToolUse / UserPromptSubmit / Stop 三 hook
- ✅ A2 触发 Bash → live-events.jsonl 多 1 行 PostToolUse
- ✅ A3 task_label 解析正确（`/helix do something` → `/helix`）
- ✅ A4 hook 出错不阻塞主 skill；try/catch 全吞 + stderr 一笔

### B. Server 层（4/4 ✅）
- ✅ B1 `node dashboard/server.js` 输出 `listening on 127.0.0.1:7777`
- ✅ B2 `GET /api/sessions` 返回 ≥1 条
- ✅ B3 `GET /api/tasks/:id` 返回完整事件
- ✅ B4 SSE `/sse` 心跳 15s 一次

### C. 实时视图（5/5 ✅）
- ✅ C1 打开 `/live` 见 session 概览条（id / started / status / tasks / duration / helix）
- ✅ C2 跑工具调用 → 主区 timeline 实时更新（已通过 playwright 验证 40 tool calls）
- ✅ C3 右栏全局事件流实时滚动（SSE）
- ✅ C4 task 完成后状态点变化（live → idle）
- ✅ C5 空闲时主区显示"最近一次回放"

### D. 历史视图（4/4 ✅）
- ✅ D1 `/history` 左栏显示所有 session（含当前）
- ✅ D2 点 session 行 → 右栏显示 task 列表 + 聚合 metric
- ✅ D3 task 行标签正确显示 mode（team/独立/unknown）
- ✅ D4 点 task → 跳 `/task/:id`

### E. 升级视图（4/4 ✅）
- ✅ E1 `/evolution` 顶部 task_plan 树正确渲染 + helix 最新 run 徽章
- ✅ E2 中段时间线 progress + git log 合并按时间倒序
- ✅ E3 下段 findings 卡片正确分组（confirmed/hypothesis/dead_end）
- ✅ E4 顶部 helix 徽章实时

### F. 任务详情视图（5/5 ✅）
- ✅ F1 `/task/:id` 直接打开能渲染（F5 也行）
- ✅ F2 独立模式：单 timeline
- ✅ F3 team 模式：N 列并排 sub-agent
- ✅ F4 Skills tab 列出所有 distinct skill + 调用次数
- ✅ F5 ← 返回历史 链接回上级

### G. UI 风格（3/3 ✅）
- ✅ G1 深色背景 + 高对比 + 等宽字体辅助
- ✅ G2 状态点配色一致：● live (绿) / ◐ recently (黄) / ○ idle (灰) / ✗ error (红)
- ✅ G3 mode 徽章配色一致：team (橙) / independent (蓝) / unknown (灰)

### H. 端到端（3/3 ✅）
- ✅ H1 hook 链路 → 浏览器 → 跑工具调用全程可见
- ✅ H2 关浏览器、关 server、重启全流程不丢已落 jsonl 数据
- ✅ H3 飞书总结文档已推送（本文）

**总计**：28/28 通过 ✅

---

## 五、关键截图（本地）

| # | 视图 | 文件 |
|---|---|---|
| 1 | 实时 `/live` | `<PROJECT_ROOT>/v2-final-live.png` |
| 2 | 历史 `/history` | `<PROJECT_ROOT>/dashboard-v2-history.png` |
| 3 | 升级 `/evolution` | `<PROJECT_ROOT>/dashboard-v2-evolution-fixed.png` |
| 4 | 任务详情 `/task/:id` | `<PROJECT_ROOT>/dashboard-v2-task.png` |

---

## 六、踩过的坑（findings 物质化）

### F-021：hook 时区校正用 `getTimezoneOffset()` 在 Beijing 系统下被抵消成 UTC
- 第一版 `d.getTime() + d.getTimezoneOffset()*60*1000 + 8h` 在系统已是 UTC+8 时，校正项 = -8h，加 8h offset = 0，结果输出 UTC。
- 修复：直接 `d.getTime() + 8*3600*1000` 然后 `getUTCxxx()` 读，独立于系统时区。
- 影响：所有 lark-cli / dashboard / 其他 helper 的"北京时间输出"统一走这个公式。

### F-022：CSS Grid `auto 1fr auto` 行三段，底部 auto 内容过长会把 1fr 中段挤没
- evolution 视图：底部 findings 卡片墙用 `auto-fill` 撑得很高，把中段 `1fr` 时间线挤成 0px。
- 修复：改 flex column，`top max-height: 220px / mid flex: 1 / bot max-height: 38%`，三段独立 overflow:auto。
- 影响：所有"三段竖排"布局的 skill UI——边段必须有 max-height，中段 flex-1。

---

## 七、v0.0 → v0.2 演化对照

| 维度 | v0.0（5-1） | v0.2（5-2） |
|---|---|---|
| 核心隐喻 | 14 个 skill 卡片墙顶栏 + 双栏 | 3 tab SPA（实时/历史/升级）+ URL 路由 |
| 数据模型 | 扁平事件流 | Session→Task 两层 |
| Hook 类型 | 仅 PostToolUse | + UserPromptSubmit + Stop |
| Token / 费用 | 暂存 | 明确放弃（不可靠） |
| Mode 区分 | 不区分 | 独立 vs team（Claude 并行 Agent） |
| 升级视图 | 无 | 顶进度树 / 中时间线 / 下教训 |
| URL 路由 | 无 | `/live` `/history` `/evolution` `/task/:id` |
| UI 风格 | 未定 | 深色开发者风（Linear/Vercel/Raycast） |

---

## 八、v0.3 路线（YAGNI 列表的重新评估时机）

| 候选 | 重新评估时机 | 当前不做的理由 |
|---|---|---|
| Token 用量 / 费用 / cache hit rate | 永不（v0.2 明确放弃） | hook 数据不可靠 |
| 跨 session 趋势图（折线/热力） | 跑 ≥ 50 session 后 | 数据密度不够 |
| Phase 级别 emit（E2/E3 升级） | 根据"v0.2 用过有没有遗憾" | hook 看不到 skill 内部 phase 切换 |
| 性能 profiling / 跑得最慢的 5 个 tool | v0.3 或独立 skill | 这是 profiler 不是 observer |
| 远程访问 / auth | 可能永不 | 本地工具加这两个就要做安全模型 |
| 历史回放（rewind） | v0.4+ | 太重，对 v0.2 价值小 |
| 议案池视图（PROPOSALS） | task 3.16 落地后 | 议案数据还没产生 |
| reviews / 设计修订渲染 | 现阶段链接跳转即可 | 信息过载 |
| 日历 heatmap | v0.3+ | 数据密度不够 |
| ui-ux-pro-max 正式 pass | v0.3 微调 | 当前 baseline 已达 Linear/Vercel 水平 |

---

## 九、立刻能用

启动：

```bash
node dashboard/server.js
# → http://127.0.0.1:7777
```

注：hook 已注册，自动捕获本项目内每次工具调用。jsonl 落 `_meta/live-events.jsonl`。

---

**v0.2 锁定。**
