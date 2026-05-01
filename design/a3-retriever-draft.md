# A3 retriever — 检索元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P7
> **职责**: 按关键词/语义在仓库内检索相关代码、文件、注释

## 检索模式

| 模式 | 命令 | 场景 |
|------|------|------|
| 关键词搜索 | grep + Grep tool | 找特定函数/变量名 |
| 文件搜索 | glob | 找特定类型文件 |
| 语义搜索 | Claude 分析 | 找"负责 XX 功能的代码" |
| 依赖追踪 | import 分析 | 找所有用到某模块的文件 |

## 输出格式（SearchResult[]）

```json
[
  {
    "file": "src/auth/refresh.ts",
    "lines": [23, 45],
    "relevance": "high",
    "snippet": "async function refreshToken(..."
  }
]
```

## 触发方式

- A4 planner 规划时自动调用
- `/a3-retriever <查询描述>` 手动触发
