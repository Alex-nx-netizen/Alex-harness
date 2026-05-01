# A2 repo-sensor — 仓库感知元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P1（所有元的基础，先建）
> **职责**: 读仓库结构/历史/依赖 → 输出 RepoContext JSON

## 感知内容

| 维度 | 来源 | 产出字段 |
|------|------|---------|
| 目录结构 | glob 扫描 | `tree`（深度3，忽略 node_modules/.git） |
| 技术栈 | package.json/Cargo.toml/go.mod/requirements.txt | `tech_stack` |
| 关键文件 | CLAUDE.md/README/配置文件 | `key_files` |
| 最近变更 | git log --oneline -10 | `recent_commits` |
| 当前状态 | git status --short | `dirty_files` |
| 依赖概览 | package.json dependencies | `dependencies` |

## 输出格式

```json
{
  "root": "/path/to/project",
  "tech_stack": ["Node.js", "TypeScript", "React"],
  "key_files": ["CLAUDE.md", "package.json", "src/index.ts"],
  "tree": "src/\n  components/\n  ...",
  "recent_commits": ["feat: add auth", "fix: token refresh"],
  "dirty_files": ["M src/auth.ts"],
  "dependencies": {"react": "^18.0.0"},
  "generated_at": "2026-5-1 14:00:00"
}
```

## 触发条件

- helix 编排时自动调用
- 用户说"看看这个仓库"/"先了解项目" 时
- `/a2-repo-sensor` 手动触发
