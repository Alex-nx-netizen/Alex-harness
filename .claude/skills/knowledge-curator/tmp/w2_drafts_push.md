**🌱 W2 启动 — Alex 改名完成 + BC draft 待你审**

@2026-4-29 22:15

---

**✅ 改名完成**

51 次替换 / 31 个活配置文件：
- 项目内（CLAUDE 已是 Alex，其他文档 14 处替换）
- 全局 memory（user_lark_info.md / cross-project user_identity 等）
- 旧路径 memory（E--ai-study-person / E--ai-study-person-harness）

⚠️ 归档 / 会话历史 / file-history（789 处）**保留**——那些是不可变审计记录，改了破坏完整性。

---

**📐 两份 draft 写好等你审**

| Draft | 路径 | 关键 Q |
|------|------|--------|
| **context-curator** | `design/context-curator-draft.md` | Q1 触发(a 推荐) / Q2 摘要长度(800 字推荐) / Q5 是否输出 diff |
| **intent-router** | `design/intent-router-draft.md` | ⚠️ **Q0 方向**：A/B/C/D，**强烈推荐 D=deprecated** |

---

**🚨 intent-router 的 reality check 在 §0**

CC 已经自带 skill 自动选择。intent-router 必须解决 CC 不擅长的，否则就是重复造轮子。

3 个有差异化的方向：
- **A 多 skill 链路**："整理 + 推送 + 评估"一条龙
- **B 歧义反问**：意图不明时反问，而非 CC 随便选
- **C 阶段感知**：M1 完结时若说"再来一次" → 提示是 M1.7 还是 M2

我**诚实推荐 D（暂不做）**：
1. 现在没有"CC 选错"的真实数据（dogfooding 期可收集）
2. 5 特征自检 3 项 ⚠️——高风险
3. context-curator 立即有用且差异化清晰，先做这个

如果你**坚持现在就启动 intent-router**，推荐选 **A 方向**且第一版只吐 plan 不真调。

---

**📋 接下来等你**

明天回我：

1. **context-curator §6**：Q1=? / Q2=? / Q3=? / Q4=? / Q5=?
2. **intent-router §6 Q0**：A/B/C/D？

简单一句话答完即可。我拿到答案就进 v0.1 草案 → SKILL.md → executor。

---

**📊 11h59min 收工**（10:12 → 22:15）

```
✅ 改名 51 次 / 31 文件
✅ context-curator-draft.md v0.0
✅ intent-router-draft.md v0.0（含 §0 reality check）
✅ 10 次飞书 IM 直推
```

晚安 🙏 — 真这次了。
