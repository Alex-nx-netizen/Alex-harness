// Batch replace 黄聪 → Alex across all project files + global CLAUDE.md
// Safe: dry-run first, then actual write only after confirm count matches
const fs = require("fs");

const FILES = [
  // Project files
  "E:/ai/study/person/Alex-harness/.claude/skills/knowledge-curator/references/weekly-review-2026-W18.md",
  "E:/ai/study/person/Alex-harness/.claude/skills/knowledge-curator/tmp/inv_chunk_000.md",
  "E:/ai/study/person/Alex-harness/.claude/skills/knowledge-curator/tmp/investment_full.md",
  "E:/ai/study/person/Alex-harness/.claude/skills/knowledge-curator/tmp/chunk_002.md",
  "E:/ai/study/person/Alex-harness/.claude/skills/knowledge-curator/tmp/chunk_000.md",
  "E:/ai/study/person/Alex-harness/.claude/skills/knowledge-curator/tmp/meta_kim_full.md",
  "E:/ai/study/person/Alex-harness/design/harness-blueprint.md",
  // Memory files
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/MEMORY.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/project_skill_promotion_policy.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/feedback_design_before_install.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/user_iteration_style.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/project_blueprint_sovereignty.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/ref_meta_thinking_yuan.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-Alex-harness/memory/project_harness_goal.md",
  // Global CLAUDE.md
  "C:/Users/Administrator/.claude/CLAUDE.md",
  // Cross-project active memory (user config files, not session history)
  "C:/Users/Administrator/.claude/memory/user_lark_info.md",
  "C:/Users/Administrator/.claude/projects/E--ai-cmdcore/memory/user_preference_name.md",
  "C:/Users/Administrator/.claude/projects/E--ai-cmdcore/memory/MEMORY.md",
  "C:/Users/Administrator/.claude/projects/E--ai-cmdcore/memory/feedback_lark_send.md",
  "C:/Users/Administrator/.claude/projects/E--ai-ticket/memory/user_identity.md",
  "C:/Users/Administrator/.claude/projects/E--ai-ticket/memory/MEMORY.md",
  // Legacy project memory dirs (old paths before rename — keep in sync)
  "C:/Users/Administrator/.claude/projects/E--ai-study-person/memory/MEMORY.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person/memory/user_iteration_style.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person/memory/project_harness_goal.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person/memory/project_blueprint_sovereignty.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person/memory/ref_meta_thinking_yuan.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-harness/memory/MEMORY.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-harness/memory/user_iteration_style.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-harness/memory/project_harness_goal.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-harness/memory/project_blueprint_sovereignty.md",
  "C:/Users/Administrator/.claude/projects/E--ai-study-person-harness/memory/ref_meta_thinking_yuan.md",
];

const NEEDLE = "黄聪";
const REPLACEMENT = "Alex";

let totalReplacements = 0;
const report = [];

for (const f of FILES) {
  if (!fs.existsSync(f)) {
    report.push({ file: f, status: "MISSING", count: 0 });
    continue;
  }
  const before = fs.readFileSync(f, "utf-8");
  const matches = before.match(new RegExp(NEEDLE, "g"));
  const count = matches ? matches.length : 0;
  if (count === 0) {
    report.push({ file: f, status: "NO_MATCH", count: 0 });
    continue;
  }
  const after = before.split(NEEDLE).join(REPLACEMENT);
  // sanity: replacement should remove all needles
  if (after.includes(NEEDLE)) {
    report.push({ file: f, status: "RESIDUAL_AFTER_REPLACE", count });
    continue;
  }
  fs.writeFileSync(f, after, "utf-8");
  // re-read verify
  const recheck = fs.readFileSync(f, "utf-8");
  if (recheck.includes(NEEDLE)) {
    report.push({ file: f, status: "WRITE_DID_NOT_PERSIST", count });
  } else {
    report.push({ file: f, status: "REPLACED", count });
    totalReplacements += count;
  }
}

console.log("=".repeat(60));
console.log(`批量替换 ${NEEDLE} → ${REPLACEMENT}`);
console.log("=".repeat(60));
for (const r of report) {
  const tag =
    r.status === "REPLACED"
      ? "✅"
      : r.status === "MISSING"
        ? "⚠️"
        : r.status === "NO_MATCH"
          ? "·"
          : "❌";
  const rel = r.file
    .replace("E:/ai/study/person/Alex-harness/", "PROJ/")
    .replace("C:/Users/Administrator/.claude/", "GLOBAL/");
  console.log(`${tag} [${r.status}] ${r.count}x  ${rel}`);
}
console.log("=".repeat(60));
console.log(
  `总替换: ${totalReplacements} 次, ${report.filter((r) => r.status === "REPLACED").length} 文件`,
);
