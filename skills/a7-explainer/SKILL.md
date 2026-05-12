---
name: a7-explainer
version: 0.1.0
description: "说明元。基于代码变更自动生成 commit message、PR 描述、必要注释。遵循项目 git-workflow 风格。helix Step 9 按需调用，也可手动 /a7-explainer。"
status:
  can_run: true
alex_harness_v08: true
harness_role: business_meta
model_recommendation: haiku
runs_in: ["main"]
tools_required: ["Bash", "Read"]
---

# A7 explainer — 说明元

> **设计源**：`design/a7-explainer-draft.md` v0.1

## §0 职责

把代码变更翻译成人类可读的说明，**只写 WHY，不写 WHAT**（代码已经说明了 WHAT）。

## §1 输出类型

### commit message
遵循全局 git-workflow 规则：
- 格式：`type(scope): description`（英文，≤72 字符，只写 subject 行）
- 示例：`refactor(auth): prevent token refresh race condition`
- 不写多段 body，设计取舍放 PR description

### PR description（中文，个人项目）
```markdown
## 变更内容
- 重构 token 刷新逻辑，增加锁机制
- 补充并发场景测试 2 个

## 为什么这么做
session 并发请求导致 refreshToken 被多次调用，产生竞态。

## 测试
- [ ] auth 单测全通过
- [ ] 手动测试并发登录场景
```

### 代码注释
只在以下情况加注释：
- 有隐藏约束（如：这里必须同步，不能用 async）
- 反直觉的实现（如：故意不用更短的写法）
- 绕过特定 bug 的 workaround
不注释"这个函数做了 X"——函数名已经说了。

### 里程碑推送
完成里程碑时，用 lark-cli 推飞书 IM：
```bash
lark-cli im +messages-send --user-id ou_... --as bot --text "..."
```

## §2 触发方式

```
/a7-explainer
```

或由 helix Step 9 在 A6 通过后按需调用（不是每次都需要完整 PR 描述）。
