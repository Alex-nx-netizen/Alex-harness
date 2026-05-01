---
name: a8-risk-guard
version: 0.1.0
description: "风险治理元。破坏性/不可逆操作前的强制守卫。自动 inject 到 helix 编排流程，也可手动 /a8-risk-guard <操作描述>。不可绕过。"
status:
  can_run: true
---

# A8 risk-guard — 风险治理元

> **设计源**：`design/a8-risk-guard-draft.md` v0.1

## §0 职责

在任何破坏性操作执行前，**强制评估风险、展示后果、等待明确确认**。这是 harness 的最后防线。

## §1 强制触发条件（不可绕过）

以下操作**必须**先经过 risk-guard：

**Git**
- `git push --force` / `--force-with-lease`
- `git reset --hard`
- `git branch -D`
- `git rebase`（改变历史的）

**文件系统**
- `rm -rf` 或删除超过 3 个文件
- 覆盖未备份的配置文件

**数据库**
- `DROP TABLE` / `DROP DATABASE`
- `TRUNCATE`
- 不可回滚的 migration

**部署/配置**
- 覆盖生产环境配置
- 修改 CI/CD pipeline
- 更改权限/密钥

**代码**
- 同时修改超过 10 个文件
- 删除/重命名公共 API

## §2 风险评估流程

**Step 1：识别操作**
明确说出"你要执行的操作是：XXX"

**Step 2：列出后果**
- 最坏情况：什么会不可逆地丢失？
- 影响范围：影响哪些用户/系统？
- 恢复成本：出了问题需要多久恢复？

**Step 3：提供防护**
- 是否有备份/快照？
- 是否有回滚方案？
- 是否需要通知他人？

**Step 4：分级处理**

| 级别 | 条件 | 行动 |
|------|------|------|
| 🔴 CRITICAL | 数据丢失/生产不可恢复 | 强制停止，不执行，等用户明确说"我确认执行" |
| 🟡 HIGH | 可恢复但代价高 | 列出风险 + 回滚步骤，等用户确认 |
| 🟢 LOW | 常规操作有轻微风险 | 简要提示，可继续 |

## §3 确认格式

CRITICAL/HIGH 级别，必须用户明确回复：
> `"确认执行"` 或 `"yes proceed"` 或 `"继续"`

收到确认前，**不执行任何操作**。

## §4 不做的事

- ❌ 不自行判断"这个应该没问题"然后跳过
- ❌ 不因为用户"催"就降低风险评级
- ❌ 不在用户没有明确确认时执行 CRITICAL 操作

## §5 触发方式

```
/a8-risk-guard git push --force origin main
/a8-risk-guard 删除 _meta/ 目录下所有文件
```

或由 helix / A5 在检测到破坏性操作时自动调用。
