---
name: a2-repo-sensor
version: 0.1.0
description: "仓库感知元。扫描当前仓库的目录结构、技术栈、近期提交、脏文件，输出 RepoContext JSON。helix 编排 Step 2 自动调用，也可手动 /a2-repo-sensor。"
status:
  can_run: true
metadata:
  sensor:
    TREE_DEPTH: 3
    COMMIT_LOOKBACK: 10
    IGNORE_DIRS: ["node_modules", ".git", "dist", "build", ".next", "target"]
---

# A2 repo-sensor — 仓库感知元

> **设计源**：`design/a2-repo-sensor-draft.md` v0.1

## §0 职责

扫描当前项目目录，生成一份 **RepoContext**，让后续元（A1/A4/A5）不需要自己重复探索仓库。

## §1 执行方式

运行脚本获取机器可读上下文：
```bash
node .claude/skills/a2-repo-sensor/run.cjs
```

脚本自动感知：目录结构 / 技术栈 / 关键文件 / 近期 commits / 当前脏文件

## §2 Claude 补充分析

脚本输出后，Claude 做以下补充判断：
- 项目规模（小/中/大）
- 代码质量信号（有无测试、CI、lint 配置）
- 热点区域（最近改动最多的目录）
- 潜在风险区域（auth/payment/database 目录）

## §3 输出格式（RepoContext）

```json
{
  "root": "/path/to/project",
  "tech_stack": ["Node.js", "TypeScript"],
  "key_files": ["CLAUDE.md", "package.json"],
  "tree": "src/\n  auth/\n  ...",
  "recent_commits": ["feat: add login", "fix: session"],
  "dirty_files": ["M src/auth.ts"],
  "has_tests": true,
  "has_ci": true,
  "generated_at": "2026-5-1 14:00:00"
}
```

## §4 触发方式

```
/a2-repo-sensor
```

或由 helix Step 2 自动调用。
