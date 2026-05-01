---
name: knowledge-curator
version: 0.1.1
description: "知识整理与飞书文档同步：把任意来源（网页/截图/聊天/笔记）整理成结构化飞书云文档。自动判断'新建文档'还是'更新已有文档'，支持 append/insert/replace 等增量写入模式（默认不用 overwrite，避免丢内容）。每次执行写一条 JSONL 日志到 logs/runs.jsonl，供周复盘和自我进化使用。当用户说'整理成飞书文档''帮我做笔记''把这些资料汇总到飞书''更新昨天那篇文档'时使用。"
metadata:
  requires:
    bins: ["lark-cli"]
    skills: ["lark-doc", "lark-drive", "lark-shared"]
  cliHelp: "lark-cli docs --help"
---

# knowledge-curator (v0.1.0)

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../lark-shared/SKILL.md`](../lark-shared/SKILL.md)**（认证、权限）。本 skill 是 [`lark-doc`](../lark-doc/SKILL.md) 和 [`lark-drive`](../lark-drive/SKILL.md) 的**编排层**，不直接调 OpenAPI。

## 适用场景

- "把这几个链接/截图整理成飞书文档发我"
- "把昨天那篇 Harness Engineering 的文档补充上 X"
- "我每周看的资料帮我归档到飞书"
- "这是聊天记录，提炼成会议纪要存飞书"

## 不适用 / 边界

- ❌ 编辑画板内容 → 用 [`lark-whiteboard`](../lark-whiteboard/SKILL.md)
- ❌ 多维表格写入 → 用 [`lark-base`](../lark-base/SKILL.md)
- ❌ 代码相关知识库 → 这个 skill 也能写，但建议用 wiki 而非 docx

## 决策树（核心 Harness 逻辑）

```
INPUT: source(URL/text/img), intent(学习/分享/存档), target_doc_id?, parent_folder?

┌─ user 给了 target_doc_id？
│   ├─ 是 → MODE = UPDATE_EXISTING
│   └─ 否 → 走 search
│
├─ search 已有文档（按 intent 关键词 + 用户最近 30 天文档）
│   ├─ 找到相似度 ≥ 0.8 → 显示 top-3 候选，让用户选 (UPDATE / CREATE_NEW)
│   ├─ 相似度 0.5-0.8 → 提示"是否追加到《X》"，默认 CREATE_NEW
│   └─ 找不到 → MODE = CREATE_NEW
│
└─ 决策 → 进入对应分支
```

## 执行流程

### Phase 1: INTAKE（输入归一化）

| 来源类型 | 处理 |
|---------|------|
| URL | `WebFetch` 抓取，截留 markdown |
| 本地文件 | `Read` 读取 |
| 截图 | 多模态识别（vision），输出文本 + 关键截图描述 |
| 聊天/粘贴文本 | 直接当原文 |

**必出**：`source_meta = {type, url_or_path, fetched_at, raw_length}`

### Phase 2: STRUCTURE（结构化）

按 intent 选模板：

| intent | 模板 |
|--------|------|
| 学习 | 一级标题 / 摘要 / 关键概念表格 / 全文正文 / 引用来源 |
| 分享 | 一级标题 / TL;DR(3 行) / 主要观点 bullet / 行动建议 / 来源 |
| 存档 | 一级标题 / 元数据表(日期/来源/标签) / 原文 / 我的批注 |
| 会议纪要 | 一级标题 / 决议 / 行动项(责任人+ddl) / 讨论要点 / 原始记录 |

> **铁律**：每篇文档末尾必须有 "## 来源" 章节，列出所有原始 URL/文件路径。可观测性。

### Phase 3: PLAN（计划写入，dry-run）

在真正写入之前，**必须**输出预览：

```
[预览]
模式: UPDATE_EXISTING / CREATE_NEW
目标: <doc_url 或 待新建>
位置: <append / insert_after "## 章节X" / replace_range "..." 等>
新增字数: ~XXX 字
受影响章节: <列表>
风险: <如 overwrite / 跨章节替换 等>
```

**用户确认后**才执行 Phase 4。低置信度（如 search 命中 0.5-0.8）必须等待用户。

### Phase 4: WRITE（写入飞书）

#### CREATE_NEW

```bash
lark-cli docs +create \
  --title "<生成的标题>" \
  --markdown "<结构化后的 markdown>" \
  --folder-token "<parent_folder?>"
```

#### UPDATE_EXISTING

1. **先 fetch 现有内容**（必须）：
   ```bash
   lark-cli docs +fetch --doc "<doc_id>"
   ```
2. **决定 update mode**（按下表）：

   | 场景 | mode | 说明 |
   |------|------|------|
   | 在末尾追加新章节 | `append` | 最安全，默认 |
   | 在指定章节后插入 | `insert_after` + `--selection-by-title` | 中等风险 |
   | 替换某个具体章节 | `replace_range` + `--selection-by-title` | 高风险，需用户明确 |
   | 修正错别字/小段文字 | `replace_all` + `--selection-with-ellipsis` | 低风险但要精确匹配 |
   | 全文重写 | `overwrite` | **禁用**（除非用户显式说"全文替换"） |

3. **执行**：
   ```bash
   lark-cli docs +update --doc "<doc_id>" --mode <chosen> ...
   ```

### Phase 4.5: VERIFY（写入后强制校验）

> 由 evolution-tracker 议案 P-2026-4-29-003 落地（2026-4-29），来源 F-008 + F-010 + F-011

`+create` / `+update` 调用后**必须**：

1. **响应解析**：从 `j.data.doc_id` 和 `j.data.doc_url` 取 token（**不是**顶层）。失败立即 abort，不重试。
2. **chunks 落盘顺序**：分块写入时**必须先把所有 chunks 写到 `tmp/chunk_*.md`**，再开始 create + append 循环。中途失败可从 `tmp/` 恢复，不必重切源文件。
3. **写后校验**：任何写入 JSONL 后立刻对每行 `JSON.parse`；失败 abort 并提示行号。

> **来源**：F-008（写后不验通病）+ F-10（parser 漏 data.doc_id）+ F-011（chunks 落盘顺序反模式）

### Phase 5: LOG（写日志，供自我进化）

**强制**：每次执行结束（成功或失败），追加一行 JSON 到 `logs/runs.jsonl`：

```json
{
  "run_id": "uuid",
  "timestamp": "2026-4-28 14:30:00",
  "input": {
    "source_type": "url|file|text|image",
    "source_summary": "first 100 chars",
    "intent": "学习|分享|存档|会议纪要",
    "target_doc_id_provided": false
  },
  "decision": {
    "mode": "CREATE_NEW|UPDATE_EXISTING",
    "search_results_count": 3,
    "search_top_score": 0.72,
    "update_mode": "append|insert_after|replace_range|...",
    "user_confirmed": true
  },
  "output": {
    "doc_url": "https://...",
    "doc_token": "...",
    "title": "...",
    "char_count": 4321
  },
  "duration_ms": 12345,
  "errors": [],
  "user_feedback": {
    "rating": null,
    "fix_notes": null
  }
}
```

> `user_feedback` 字段**事后**手动填：你下次跑这个 skill 时，先看 logs/runs.jsonl 最近 5 条，给上一条打分（1-5）+ 写下你修改了什么。这是自我进化的输入。

### Phase 7: PUSH（产出直推飞书 IM）

> 由 evolution-tracker 议案 P-2026-4-29-002 落地（2026-4-29），来源 F-012 + L4 user_feedback

**铁律**：成功跑完（含 user_feedback 待填）后、Phase 6 REPORT 之前，**必须**直推。

1. **目标**：默认 user open_id（从 global memory 读，如 `ou_835b...`）
2. **兜底**：user_id 缺失 → 询问用户手机号 → `lark-cli contact +users-search --mobile <phone>` 取 open_id
3. **内容**：doc 标题 + URL + 关键章节摘要 + errors 摘要（≤300 字）
4. **命令**：`lark-cli im +messages-send --user-id <ou_xxx> --as bot --markdown "$(cat tmp/push.md)"`
5. **失败处理**：推送失败时**不**回滚 doc 创建（doc 已成事实），只在 runs.jsonl 的 errors 字段记 `push_failed: <reason>`

> **来源**：F-012 + L4 user_feedback "飞书文档应直推 IM 而不是给链接"

### Phase 6: REPORT（向用户汇报）

```
✅ knowledge-curator 完成
- 模式: UPDATE_EXISTING (append)
- 文档: <doc_url>
- 写入: ~XXX 字 / 新增 1 章节 "## 2026-4-28 补充"
- 耗时: 12.3s
- 日志: logs/runs.jsonl#last
- ⚠️ 请在下次使用时为本次执行打分（编辑 last 条的 user_feedback）
```

## 失败处理

| 失败 | 应对 |
|------|------|
| `lark-cli` 未配置 / token 失效 | 立刻报错，让用户跑 `lark-cli auth status`，**不要重试** |
| search 返回多个高分候选 | 必须等用户选，**不允许默认选第一个** |
| `+update` 因 selection 没匹配上而失败 | 退化为 `append` 模式 + 在文档顶部加一段 "原计划修改 X 但定位失败" |
| 网络抓取失败 | 让用户提供原文，**不要凭空造内容** |
| 用户拒绝预览 | 直接终止，记录 `errors: ["user_rejected"]` |

## 自我进化（人审升级，禁止自动改 SKILL.md）

- L1 被动记录：每次运行写 logs/runs.jsonl（自动）
- L2 周复盘：每周日由 `knowledge-curator-reviewer` skill 读最近 7 天日志，输出 `references/weekly-review-YYYY-WW.md`，列出"用户修改最多的 3 类问题"和"建议的 SKILL.md 改动"
- L3 升级：你看完 review，**人工**让 Claude 改本 SKILL.md（一次小改 + git commit）

> 不允许跳过 L2 直接 L3，也不允许 skill 自己改自己。

## 第一次试跑建议

```
"用 knowledge-curator 把 https://openai.com/zh-Hans-CN/index/harness-engineering 整理成学习类飞书文档，存到我的'AI学习'文件夹"
```

跑完后：
1. 看生成的飞书文档质量
2. 在 `logs/runs.jsonl` 末条填 `rating` 和 `fix_notes`
3. 跑 3-5 次后，再做第一次 L2 复盘

## TODO（v0.2 路线图）

- [ ] 加 `--dry-run` 标记，只输出 plan 不写飞书
- [ ] 集成 `lark-wiki` 支持知识库写入
- [ ] 多文档跨链接（biidirectional links）
- [ ] 标签系统（按 intent + 来源 + 主题三维度打标）
