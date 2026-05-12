---
name: a4-planner
version: 0.1.0
description: "方案元。基于 TaskCard + RepoContext 生成 2-3 个实现方案对比，推荐最优路径。helix 编排 Step 5 调用，也可手动 /a4-planner。"
status:
  can_run: true
alex_harness_v08: true
harness_role: business_meta
model_recommendation: opus
runs_in: ["main"]
tools_required: ["Bash", "Read"]
---

# A4 planner — 方案元

> **设计源**：`design/a4-planner-draft.md` v0.1

## §0 职责

给出**可以直接执行**的方案，而不是模糊的方向。每个方案都要精确到"改哪些文件、分几步"。

## §1 制定流程

**Step 1：理解约束**
- 从 TaskCard 读取：类型、作用域、完成标准、风险信号
- 从 RepoContext 读取：技术栈、目录结构、测试覆盖情况
- 调用 A3 retriever 找相关代码（如果还没有）

**Step 2：生成方案**
生成 2-3 个方案，每个方案必须包含：
- 一句话核心思路
- 具体改动文件（精确到文件名）
- 步骤数估算
- 主要风险
- 是否推荐（只能有一个推荐）

**Step 3：输出对比表**
用 Markdown 表格展示，清晰对比。

## §2 输出格式（PlanDoc）

```markdown
## 方案 A（✅ 推荐）：直接重构 refresh 函数
**思路**：在 src/auth/refresh.ts 内重写 token 刷新逻辑，增加锁机制防竞态
**改动文件**：
- `src/auth/refresh.ts`（主要修改）
- `src/auth/refresh.test.ts`（更新测试）
**步骤**：4 步，预计 30 分钟
**风险**：需同步更新测试；session 并发测试需补充
**推荐原因**：最小改动范围，不影响其他模块

## 方案 B：抽取独立 TokenService
**思路**：新建 src/services/token.ts，把刷新逻辑迁移过去
**改动文件**：
- `src/services/token.ts`（新建）
- `src/auth/refresh.ts`（改为调用 service）
- 所有 import refresh 的文件（~5 个）
**步骤**：8 步
**风险**：改动范围大，需要全面回归测试
```

## §3 规则

- 方案数量：2-3 个，不多不少
- 必须有明确的推荐，并说明理由
- 如果信息不足以生成精确方案，先调用 A3 检索
- 不生成"可能""也许"的模糊方案

## §4 触发方式

```
/a4-planner
```

或由 helix Step 5 在 TaskCard 确认后自动调用。
