# A4 planner — 方案元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P3
> **职责**: 基于 TaskCard + RepoContext，生成可执行的实现方案对比

## 输入

- A1 输出的 TaskCard
- A2 输出的 RepoContext
- （可选）用户补充约束

## 方案格式

每个方案包含：
- 实现思路（一句话）
- 改动文件列表
- 预估步骤数
- 主要风险
- 是否推荐

## 输出格式（PlanDoc）

```markdown
## 方案 A（推荐）：直接重构 token 刷新
- 改动：src/auth/refresh.ts, src/auth/middleware.ts
- 步骤：4步
- 风险：需要同步更新测试
- 推荐原因：最小改动范围，测试覆盖完整

## 方案 B：提取独立 refresh service
- 改动：src/auth/refresh.ts, src/services/token.ts（新建）
- 步骤：7步
- 风险：需要更新所有 import
```

## 触发方式

- helix 编排时，A1 之后自动调用
- `/a4-planner` 手动触发（需先有 TaskCard）
