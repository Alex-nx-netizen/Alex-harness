---
name: helix
version: 0.1.0
description: "Alex-harness 统一入口。调用后自动编排整个工作流：上下文加载 → 仓库感知 → 任务解析 → 路由 → 方案 → 执行 → 校验 → 风险守护。/helix = 给 harness 完整执行授权。"
status:
  can_run: true
---

# helix — 统一入口

> **设计源**：`design/helix-draft.md` v0.1
> **地位**：整个 Alex-harness 的点火开关

## §0 一句话责任

**用户一句话 → helix 负责编排所有 skill，完整执行，无需用户手动串联。**

## §1 调用方式

```
/helix                        # 打开 harness，等待任务描述
/helix 帮我重构认证模块        # 直接带任务进入
/helix 给这个项目加 E2E 测试   # 任何开发任务
```

## §2 编排流程

接到 `/helix` 后，按以下顺序执行：

### Step 1：上下文加载
读取以下文件，快速建立项目认知：
- `_meta/task_plan.md`（当前阶段和任务）
- `_meta/progress.md`（最近 3 条进展）
- `memory/MEMORY.md`（持久记忆索引）
- 当前项目 `CLAUDE.md`（项目指令）

输出：一句话状态摘要（"当前在 M5，上次做了 X，活跃任务 Y 个"）

### Step 2：仓库感知（invoke a2-repo-sensor）
运行 `node .claude/skills/a2-repo-sensor/run.cjs`，获取：
- 技术栈、目录结构、近期提交、脏文件列表

### Step 3：任务解析（invoke a1-task-understander）
基于用户输入 + RepoContext，输出 TaskCard：
- 任务类型、作用域、完成标准、风险信号

### Step 4：路由决策（invoke mode-router）
根据 TaskCard 判断：solo / solo+tools / team

### Step 5：方案制定（invoke a4-planner）
输出 2-3 个方案对比，让用户选择或直接推荐

### Step 6：用户确认
展示方案，等用户确认后再执行。**不跳过这一步。**

### Step 7：执行（invoke a5-executor）
按确认的方案逐步执行，遇到破坏性操作自动调用 a8-risk-guard

### Step 8：校验（invoke a6-validator）
执行完后自动跑测试/lint/类型检查

### Step 9：说明（invoke a7-explainer，按需）
生成 commit message / PR 描述 / 里程碑推送

## §3 风险守护（a8-risk-guard 自动 inject）

以下操作**强制**暂停并调用 risk-guard，不可跳过：
- git push --force / reset --hard / branch -D
- rm -rf 或大规模删除
- 数据库 drop / truncate
- 覆盖线上配置

## §4 边界

| 适用 | 不适用 |
|------|--------|
| 任何开发任务的起点 | 已经在执行中途 |
| 不确定该走哪条路 | 明确只需要某个具体 skill |
| 想让 harness 全权处理 | 只是问个问题 |

## §5 与其他 skill 的关系

helix 是**编排者**，不是替代者。它调用其他 skill，其他 skill 也可以独立运行：

```
/helix            → 全流程编排
/a2-repo-sensor   → 只看仓库状态
/a4-planner       → 只要方案
/a8-risk-guard    → 只做风险检查
```
