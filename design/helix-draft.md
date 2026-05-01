# helix — 统一入口 Skill 设计草案

> **状态**: v0.1（2026-5-1）
> **对应蓝图**: §1.Q5 意图放大 / 全 harness 编排入口
> **核心**: 用户输入 /helix → harness 自动编排所有 skill，按元思想四层执行

## 职责

用户只需说一句话，helix 负责把意图放大成完整执行流：

```
用户: /helix 帮我重构认证模块
helix:
  1. 加载项目上下文（context-curator 逻辑）
  2. 感知仓库现状（A2 repo-sensor）
  3. 解析任务意图（A1 task-understander）
  4. 路由决策（mode-router）
  5. 制定方案（A4 planner）
  6. 执行（A5 executor）
  7. 校验（A6 validator）
  8. 文档（A7 explainer，按需）
  9. 风险检查（A8 risk-guard，破坏性操作前强制）
```

## 边界

| 适用 | 不适用 |
|------|--------|
| 任何开发任务的起点 | 已经在执行中途（直接用对应 skill） |
| 不确定该走哪条路 | 明确知道只需要某个具体 skill |

## 触发方式

- `/helix` — 打开 harness，等用户说任务
- `/helix <任务描述>` — 直接带任务进入，跳过询问
