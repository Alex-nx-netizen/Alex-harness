**🔄 meta-loop 触发器就绪 — `skill_feedback.cjs` 落地**

@2026-4-30 12:26

---

**🎯 这一步解决什么**

context-curator 跑了 2 次但 `user_feedback.rating` 都是 `null`。evolution-tracker 的 `valid_run_count` 只算 `rating != null` 的 → 没评分 = 没复盘 = 没自我进化。

**装个 CLI 让你 30 秒打分**，整个 meta-loop（knowledge-curator → evolution-tracker → context-curator → evolution-tracker → ...）就活了。

---

**🛠️ 你现在能用**

```bash
# 看哪些 run 还没评分
node _meta/skill_feedback.cjs context-curator --list

# 给一条 run 打分（1-5）+ fix_notes
node _meta/skill_feedback.cjs context-curator 2026-4-30-111721 4 \
  "首跑 6 sources 全见，但 progress/findings 被压成 count，看不到细节"

# Dry-run 预览
node _meta/skill_feedback.cjs context-curator <run_id> 4 "..." --dry-run

# 已评分要覆盖加 --force
node _meta/skill_feedback.cjs context-curator <run_id> 5 "..." --force

# 同样的 CLI 也能给 knowledge-curator / evolution-tracker 打分
node _meta/skill_feedback.cjs knowledge-curator --list
```

---

**🛡️ 安全保障**

- 写前后双 JSON 校验（铁律 #8）
- 自动 `.bak` 备份；写崩自动恢复
- rating 必须 1-5 整数 / 不存在的 run_id 打印可用列表
- 已评分默认拒绝覆盖（防误操作），`--force` 才覆盖
- immutable update（铁律：不 mutate object）

---

**▶️ 接下来一条龙**

```bash
# 1. 你打分 context-curator 的某一条 run
node _meta/skill_feedback.cjs context-curator 2026-4-30-111721 4 "..."

# 2. 跑 evolution-tracker 复盘 context-curator
node .claude/skills/evolution-tracker/run.cjs context-curator

# 3. 看议案：弱信号 banner（valid_run=1）+ 0-N 条议案
ls .claude/skills/context-curator/references/skill-proposals/ 2>/dev/null
# (首次跑会创建该目录)
```

---

**📊 进度**

| 项 | 状态 |
|---|---|
| 3.6 next_actions.cjs (B2) | ✅ |
| 3.7 B1+B3 future | 🌙 |
| 3.8 skill_feedback.cjs | ✅ |
| 3.9 评分 + 跑 tracker | 🟢 ready (等你) |

完成度 28/37 (75.7%)，next_actions 显示 3.9 是当前 ready_to_unblock。

---

**🤔 你下次会话需要做的（按推荐顺序）**

1. **30 秒事情**：给 context-curator 的 `2026-4-30-111721` 评分（你今天用了它的 snapshot 进入会话有没有帮你节省时间？）
2. **5 分钟事情**：跑 `node .claude/skills/evolution-tracker/run.cjs context-curator` 看议案池能不能产出
3. **更长**：基于议案决定 v0.2 优化方向（最可能：truncate 阶梯）

按里程碑约定，我现在停下等你打分。今天三连击：next_actions / context-curator / skill_feedback ✅。
