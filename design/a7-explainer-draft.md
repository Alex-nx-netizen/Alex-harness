# A7 explainer — 说明元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P8（最低，先人工写）
> **职责**: 基于代码变更，自动生成 PR 描述、commit message、注释

## 输出类型

| 类型 | 触发条件 | 输出 |
|------|---------|------|
| commit message | 执行完 A5 | `type(scope): description` |
| PR description | 用户要发 PR | Summary + Test plan |
| 代码注释 | 非显而易见的逻辑 | 单行 why 注释 |
| 变更说明 | 里程碑完成 | 推飞书 IM 摘要 |

## 原则

- commit message 遵循全局 `rules/git-workflow.md` 风格（简短英文）
- PR description 用中文（因为是个人项目）
- 代码注释**只写 WHY**，不写 WHAT

## 触发方式

- helix 编排，A5 执行完成后按需调用
- `/a7-explainer` 手动触发
