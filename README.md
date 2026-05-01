# Alex-harness

> Alex 的私人 Agent Harness —— 基于 OpenAI Harness Engineering 三部曲 + 老金"元思想"搭建的个人工作流自动化系统。

## 项目定位

用一组协作的 skill + 文档 + 工作流，让 Claude 在帮我做事时更可控、可观测、可自我进化。

最终目标：产品需求 → 代码落地的全流程 SDLC harness，支持多语言、多角色、自我进化。

## 当前已落地 Skills（治理层）

| Skill | 职责 | 触发方式 |
|-------|------|---------|
| `session-reporter` | 会话结束自动推飞书 Base（成长日志） | Stop hook 全自动 |
| `evolution-tracker` | 读 runs.jsonl → 出 L2 复盘 → 提改进议案 | 手动 |
| `context-curator` | 跨会话上下文压缩，保持 Claude 连贯性 | 手动 |
| `mode-router` | 检测任务信号，推荐 solo vs team 路由 | Claude 自动调用 |
| `knowledge-curator` | 整理飞书/网页资料 → 飞书 wiki | 手动 |

## 架构

```
用户行为 + 反馈
     ↓
治理层（本项目 M1-M4 已完成）
  ├── evolution-tracker   ← 自我进化
  ├── session-reporter    ← 成长日志
  ├── context-curator     ← 记忆压缩
  └── mode-router         ← 路由决策
     ↓
业务层（v0.2 规划中）
  ├── A1 任务理解元
  ├── A2 仓库感知元
  ├── A4 方案元
  ├── A6 校验元
  └── A8 风险治理元
```

## 技术栈

- **运行时**：Node.js（CJS）
- **AI**：Claude Code（claude-sonnet-4-6 / claude-opus-4-7）
- **飞书集成**：lark-cli（Base 多维表格 + IM Bot）
- **状态管理**：`_meta/` 三件套 + cursor JSON 增量

## 进度追踪

- 飞书成长日志 Base：`https://my.feishu.cn/base/Se8obIsyTa5SmfsOMK8cA9d3nNc`
- 任务计划：`_meta/task_plan.md`
- 执行日志：`_meta/progress.md`
- 踩坑记录：`_meta/findings.md`

## 快速开始

```bash
# 查看当前任务
node _meta/next_actions.cjs

# 手动推飞书成长日志
node .claude/skills/session-reporter/run.cjs

# 跑 evolution-tracker（需要 runs.jsonl 有记录）
node .claude/skills/evolution-tracker/run.cjs

# 查看 mode-router 对某任务的路由建议
node .claude/skills/mode-router/run.cjs "任务描述"
```

## 里程碑

| 阶段 | 目标 | 状态 |
|------|------|------|
| M1 | knowledge-curator 反馈闭环 | ✅ 完成 2026-4-29 |
| M2 | evolution-tracker v0.1 | ✅ 完成 2026-4-29 |
| M3 | context-curator v0.1 | ✅ 完成 2026-4-30 |
| M4 | mode-router + session-reporter | ✅ 完成 2026-5-1 |
| M5 | 练手项目验证 + promote 全局 | 🔲 进行中 |
| v0.2 | A1-A8 业务元 | 🔲 规划中 |

## 参考资料

- [Harness Engineering 三部曲（飞书合集）](https://www.feishu.cn/wiki/UtW0wUbPbifCX4kk3ypcGcyinGg)
- [老金"元思想"](https://waytoagi.feishu.cn/wiki/KGbewcwM1ic0kFk2A58cL8OanFh)
