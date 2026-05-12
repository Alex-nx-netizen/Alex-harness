---
name: a3-retriever
version: 0.1.0
description: "检索元。在当前仓库内按关键词或语义检索相关代码、文件、注释。由 A4 planner 编排时调用，也可手动 /a3-retriever <查询>。"
status:
  can_run: true
alex_harness_v08: true
harness_role: business_meta
model_recommendation: haiku
runs_in: ["main"]
tools_required: ["Bash", "Grep", "Glob"]
deprecated: "v0.8 (#11): scope 已明确时跳过；保留备用"
---

# A3 retriever — 检索元

> **设计源**：`design/a3-retriever-draft.md` v0.1

## §0 职责

在仓库内找到"和当前任务相关的代码"，让后续元不需要自己盲目探索。

## §1 检索模式

收到查询后，**按顺序尝试**：

**1. 精确关键词搜索**（用 Grep tool）
```
pattern: 函数名 / 类名 / 常量 / 报错信息
```
→ 直接返回命中行 + 文件路径

**2. 文件名搜索**（用 Glob tool）
```
pattern: **/*auth* / **/*token* 等
```
→ 返回匹配文件列表

**3. 语义推断**（Claude 分析）
当关键词搜索结果过多或过少时，根据 RepoContext 推断"最可能相关"的文件并 Read 确认

**4. 依赖追踪**（按需）
找到目标文件后，分析 import/require 关系，找出所有依赖方

## §2 输出格式（SearchResult[]）

```json
[
  {
    "file": "src/auth/refresh.ts",
    "lines": [23, 45],
    "relevance": "high",
    "reason": "包含 refreshToken 函数定义",
    "snippet": "async function refreshToken(..."
  },
  {
    "file": "src/middleware/auth.ts",
    "lines": [12],
    "relevance": "medium",
    "reason": "调用 refreshToken",
    "snippet": "await refreshToken(req.user.id)"
  }
]
```

## §3 触发方式

```
/a3-retriever refreshToken 相关代码
/a3-retriever 处理支付失败的逻辑在哪
```

或由 A4 planner 在制定方案时自动调用。
