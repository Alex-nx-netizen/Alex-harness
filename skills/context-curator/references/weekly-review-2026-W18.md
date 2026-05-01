# Weekly Review — context-curator

> 由 evolution-tracker 自动生成 (2026-4-30 23:23:51)。**这是议案的 NL 综述**，actionable diff 在 `references/skill-proposals/*.diff`，需 `git apply` 接受。

## 输入快照
- valid runs: 4（2026-4-30-111721, 2026-4-30-111943, 2026-4-30-154503, 2026-4-30-215512）
- aborted runs: 0（(none)）
- mode: normal
- findings 引用: F-019, F-018, F-017, F-008, F-009, F-005, F-006, F-007, F-001, F-002, F-003, F-004, F-010, F-011, F-015, F-014, F-013, F-012

## Pattern 聚类
- **curator_truncate_aggressive** (上下文聚合鲁棒性): 2 runs, 0 findings; status=active; out_of_scope=false
- **phase4_robustness** (鲁棒性缺口): 1 runs, 3 findings; status=active; out_of_scope=false
- _uncategorized_: 12 pieces (尚无 direction rule)

## 议案概览（2 条）
### 🟢 PENDING P-2026-4-30-003 — curator_truncate_aggressive
> context-curator 截断阶梯过激——Level 6 compact_mode 直跳 count-only，具体进度全不可见。证据 2026-4-30-111943, 2026-4-30-154503。建议在 Level 5 后插 Level 5.5：progress/findings 各保留最新 1 条（≤60字），不空手到 compact_mode。

- **What**: 在 run.cjs Level 5（current clip）之后、Level 6（compact_mode）之前插入 Level 5.5：progress → 1 entry / findings → 1 finding（各 ≤60字），保留最小可读单元
- **Where**: .claude/skills/context-curator/run.cjs @ Level 5 末尾与 Level 6 之间（// Level 6: progress + findings → counts only 注释上方）
- **Risk**: Level 5.5 字数收益有限（约 50-100 字），若仍超限则 compact_mode 正常接力，无副作用。Mitigation: Level 8 hard_trim 已实装（2026-4-30），永不 FATAL。
- **Diff**: `references/skill-proposals/P-2026-4-30-003.diff` （`git apply` 接受）
- **Evidence runs**: 2026-4-30-111943, 2026-4-30-154503
- **Evidence findings**: (none)

### 🟢 PENDING P-2026-4-30-004 — phase4_robustness
> context-curator Phase 4 WRITE 缺响应解析与 chunks 落盘顺序硬化。证据 F-008 + F-010 + F-011。建议 Phase 4 末尾插 Phase 4.5 VERIFY 三步：解析 j.data.doc_id / chunks 全落盘再 create / 写后 JSON.parse 校验。

- **What**: 在 .claude/skills/context-curator/SKILL.md 的 Phase 4 之后、Phase 5 LOG 之前插入 Phase 4.5 VERIFY 章节
- **Where**: .claude/skills/context-curator/SKILL.md @ Phase 4 末尾
- **Risk**: Phase 4.5 加进来要保持 Phase 5 LOG 即使 4.5 abort 也能记错。M2.3 实现时务必双向 try/finally。
- **Diff**: `references/skill-proposals/P-2026-4-30-004.diff` （`git apply` 接受）
- **Evidence runs**: 2026-4-30-215512
- **Evidence findings**: F-008, F-010, F-011

## 黑名单 / 跳过
- (无)

## 接下来你做什么
审议案，**人审拍板**（铁律：evolution-tracker 永远不动 SKILL.md）：
- 接受 `P-2026-4-30-003`：`git apply references/skill-proposals/P-2026-4-30-003.diff`
- 拒绝 `P-2026-4-30-003`：在 `_index.jsonl` 把 status 改 `rejected` + 填 reject_reason
- 接受 `P-2026-4-30-004`：`git apply references/skill-proposals/P-2026-4-30-004.diff`
- 拒绝 `P-2026-4-30-004`：在 `_index.jsonl` 把 status 改 `rejected` + 填 reject_reason