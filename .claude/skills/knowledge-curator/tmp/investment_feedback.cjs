// P0: 补 L5 user_feedback（M1.6 用户反馈："完全没问题，非常仔细"）
// 解析 → rating=5（最高满意），fix_notes 忠实记录用户原话 + skill 含义
// 安全做法：JSON.parse → modify → JSON.stringify，不手动 grep/sed
const fs = require("fs");
const path = require("path");

const RUNS = path.join(__dirname, "..", "logs", "runs.jsonl");

const lines = fs.readFileSync(RUNS, "utf-8").split("\n").filter(Boolean);
console.log(`[INFO] runs.jsonl has ${lines.length} lines`);

// L5 = index 4（L1 是 comment marker）
const targetIdx = lines.findIndex((l) => {
  try {
    const j = JSON.parse(l);
    return j.run_id === "2026-4-29-investment-edge-test";
  } catch {
    return false;
  }
});

if (targetIdx === -1) {
  console.error("[FATAL] could not find investment run line");
  process.exit(1);
}

const j = JSON.parse(lines[targetIdx]);
console.log(`[INFO] found target at L${targetIdx + 1}: ${j.run_id}`);
console.log(`[BEFORE] user_feedback:`, JSON.stringify(j.user_feedback));

// Update
j.user_feedback = {
  rating: 5,
  fix_notes:
    'Q4-29-2=5。用户原话："完全没问题，非常仔细"。Good: 整篇结构（10 种方法对照表 + §3 避坑 + §4 实操案例 + §5 核心观点 5 条 + §6 用户主权区）都被肯定，未指出任何 fix。§6 5 个 skill 边界观察点（模板按 intent 分流 / 数字格式化 / 本地化跳转 / 数据时效 disclaimer / 行动清单 vs 开放问题）用户未明确勾选 → 视为"模板对此类实操类非技术内容也通过验收"，不构成议案信号。意义：议案池保持空（NORMAL_NO_SIGNAL）= evolution-tracker 治理元 R2 的正向证据（不为了进化而进化）。Feedback 日期: 2026-4-29。',
};

console.log(`[AFTER]  user_feedback:`, JSON.stringify(j.user_feedback));

// Write back
lines[targetIdx] = JSON.stringify(j);
const content = lines.join("\n") + "\n";

// Validate every line still parses
for (let i = 0; i < lines.length; i++) {
  try {
    JSON.parse(lines[i]);
  } catch (e) {
    console.error(`[FATAL] L${i + 1} would be broken: ${e.message}`);
    process.exit(2);
  }
}

fs.writeFileSync(RUNS, content, "utf-8");

// Re-read and verify
const recheck = fs.readFileSync(RUNS, "utf-8").split("\n").filter(Boolean);
recheck.forEach((l, i) => {
  try {
    JSON.parse(l);
  } catch (e) {
    console.error(`[FATAL] re-read L${i + 1} invalid: ${e.message}`);
    process.exit(3);
  }
});
console.log(`[OK] all ${recheck.length} lines parse OK after write`);
console.log(`[DONE] L5 user_feedback updated: rating=5`);
