---
name: a1-task-understander
version: 0.1.0
description: "任务理解元。把用户的模糊描述解析成结构化 TaskCard：类型/作用域/完成标准/风险信号。helix 编排时在 A2 之后自动调用，也可手动 /a1-task-understander <描述>。"
status:
  can_run: true
---

# A1 task-understander — 任务理解元

> **设计源**：`design/a1-task-understander-draft.md` v0.1

## §0 职责

把用户的模糊任务描述，结合当前仓库上下文，解析成可执行的 **TaskCard**。

## §1 解析流程

拿到任务描述后，依次分析：

**1. 任务类型**（选一个）
- `feat` — 新功能
- `fix` — Bug 修复
- `refactor` — 重构（不改功能）
- `test` — 测试相关
- `docs` — 文档
- `chore` — 构建/依赖/配置
- `research` — 调研，不直接改代码

**2. 作用域**
- 精确到目录或文件（如 `src/auth/`）
- 如果不确定，列出"可能涉及"的文件

**3. 完成标准**（可验证的，至少一条）
- 测试通过、功能能跑、文档更新、PR 可以合并

**4. 风险信号**（有则列出）
- 涉及 auth/session/token → 安全风险
- 改数据库 schema → 数据风险
- 改公共 API → 兼容性风险
- 大规模重命名 → 引用风险

**5. 推荐方法**
- solo：单人 Claude 完成
- solo+tools：Claude + 工具调用
- team：拆 agent 并行

## §2 输出（TaskCard）

以 JSON 代码块输出：

```json
{
  "title": "简短任务标题",
  "type": "refactor",
  "scope": "src/auth/",
  "done_criteria": ["auth 测试全通过", "token 刷新无竞态"],
  "risk_signals": ["涉及 session 状态"],
  "recommended_approach": "solo+tools",
  "estimated_steps": 4
}
```

## §3 如果信息不足

缺关键信息时，**最多问 2 个问题**，不要问 5 个。
问完立刻生成 TaskCard，不要等用户确认每一个字。

## §4 触发方式

```
/a1-task-understander 帮我重构认证模块的 token 刷新逻辑
```

或由 helix 在 Step 3 自动调用。
