# A8 risk-guard — 风险治理元设计草案

> **状态**: v0.1（2026-5-1）
> **优先级**: P2（破坏性操作前的最后防线）
> **职责**: 在执行破坏性/不可逆操作前，强制风险评估 + 用户确认

## 触发条件（强制，不可绕过）

- git push --force / reset --hard / branch -D
- rm -rf / 大规模文件删除
- 数据库 drop / truncate / migrate（不可逆）
- 覆盖线上配置 / secrets
- 大规模重构（>10 文件同时改）
- 删除/覆盖 production 数据

## 风险分级

| 级别 | 描述 | 行动 |
|------|------|------|
| 🔴 CRITICAL | 数据丢失/线上不可恢复 | 强制停止，列出后果，要求明确确认 |
| 🟡 HIGH | 可恢复但麻烦 | 列出风险 + 回滚步骤，等确认 |
| 🟢 LOW | 常规操作有轻微风险 | 简要提示，不阻断 |

## 输出格式（RiskReport）

```json
{
  "level": "HIGH",
  "action": "git push --force",
  "risks": ["覆盖远程提交", "协作者本地分支冲突"],
  "mitigations": ["先 git log 确认 HEAD", "通知其他协作者"],
  "proceed": false
}
```

## 边界

| 适用 | 不适用 |
|------|--------|
| 不可逆操作前的检查 | 读文件、查询、只读操作 |
| helix 编排时自动 inject | 常规代码修改 |
