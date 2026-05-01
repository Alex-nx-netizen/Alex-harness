# A1 task-understander — 任务理解元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P5（依赖 A2 上下文才能精准理解）
> **职责**: 解析用户模糊意图 → 结构化 TaskCard

## 解析维度

- **任务类型**: feat / fix / refactor / docs / test / chore / research
- **作用域**: 单文件 / 模块 / 跨模块 / 全仓库
- **依赖关系**: 需要先完成什么
- **完成标准**: 怎么算做完（可验证的）
- **风险信号**: 是否涉及破坏性操作

## 输出格式（TaskCard）

```json
{
  "title": "重构认证模块 token 刷新逻辑",
  "type": "refactor",
  "scope": "src/auth/",
  "done_criteria": ["所有 auth 测试通过", "token 刷新不再有竞态"],
  "dependencies": [],
  "risk_signals": ["涉及 session 状态变更"],
  "recommended_approach": "solo+tools"
}
```

## 触发方式

- helix 编排时，在 A2 之后自动调用
- `/a1-task-understander <模糊描述>` 手动触发
