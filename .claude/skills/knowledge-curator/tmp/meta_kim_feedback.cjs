// Update runs.jsonl L4 user_feedback (rating=3, fix_notes 含 Phase 7 PUSH 议案信号)
const fs = require("fs");
const path = require("path");

const LOG = path.join(__dirname, "..", "logs", "runs.jsonl");

const lines = fs.readFileSync(LOG, "utf-8").split("\n").filter(Boolean);
if (lines.length !== 4) {
  console.error(`[ERR] expected 4 lines, got ${lines.length}`);
  process.exit(1);
}

const obj = JSON.parse(lines[3]);
if (obj.run_id !== "2026-4-29-meta-kim") {
  console.error(`[ERR] L4 run_id mismatch: ${obj.run_id}`);
  process.exit(2);
}

obj.user_feedback = {
  rating: 3,
  fix_notes:
    "Q4-29=3。Good: §4 三层记忆体系、§5 八个 Meta Agent 治理矩阵、§5 Meta-Unit 5 条判定标准、§5 Capability-First Dispatch 是用户愿意反复回看的 4 个章节。Bad/Fix: knowledge-curator 缺 Phase 7 PUSH——产出后应直推到飞书 IM（user open_id=ou_835b575f2e109b0f16569558480d202c），而不是只丢链接让用户自己开。user_id 不可得时用手机号兜底（已在 global memory：18716985612）。每次文档创建/更新都要直推。映射到 skill 层 = knowledge-curator SKILL.md 缺 §Phase 7 PUSH（M2.2.5 evolution-tracker 议案候选 #2，议案候选 #1 = 4-28 fix_notes '不会自我进化'）。本次跑已用 lark-cli im +messages-send 手动直推证明可行（message_id om_x100b5022b61c58e0b3931be54f133ad，2026-4-29 10:40:13），下次跑前 SKILL.md 应吸收。Feedback 日期: 2026-4-29。",
};

lines[3] = JSON.stringify(obj);

// Validate all 4 lines parse before writing
lines.forEach((l, i) => JSON.parse(l));

fs.writeFileSync(LOG, lines.join("\n") + "\n", "utf-8");

// Re-read and re-validate
const recheck = fs.readFileSync(LOG, "utf-8").split("\n").filter(Boolean);
recheck.forEach((l, i) => JSON.parse(l));
console.log(
  `[OK] L4 user_feedback updated; ${recheck.length} lines, all valid JSON`,
);
