# SOUL — Alex-harness 跨 run 稳定行为规则

> v0.1 起步版；evolution-tracker 自动沉淀高频议案到这里

## 边界（与项目其他元素的分工）

| 文件 | 角色 | 谁写 |
|------|------|------|
| `CLAUDE.md` | 不变的设计契约（项目宪法） | 用户主权，Claude 协商 |
| `~/.claude/projects/.../memory/MEMORY.md` | 用户的偏好历史 | Claude 写，用户审 |
| `_meta/progress.md` | 时间序列事件日志 | Claude 写，用户审 |
| `_meta/findings.md` | 学到的、踩过的坑 | Claude 写，用户审 |
| **`_meta/SOUL.md`（本文件）** | harness 自己学到的「行为规则」（跨 run 稳定模式） | evolution-tracker `--promote-soul` 自动追加；用户可手动审/删 |

## 来源

每条规则由 evolution-tracker `--promote-soul` 从议案池 `skill-proposals/_index.jsonl` 中**高频**（被引用 ≥3 次）且 status=approved 的议案沉淀而来。

每条规则一行格式：
```
- [<rule_id>] (<source_proposal_id>) <规则文本>
```

- `rule_id`：`auto-YYYY-M-D-NNN`，由 evolution-tracker 生成
- `source_proposal_id`：源议案 ID（去重锚点 — 同一议案不会重复写）
- 规则文本：从议案 `nl_summary` 或议案文件中提取的核心行为规则

## 当前规则

<!-- evolution-tracker --promote-soul --apply 会把高频规则追加在下面 -->

（初始为空，由 evolution-tracker 自动追加）
