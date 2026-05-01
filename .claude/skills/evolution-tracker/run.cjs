#!/usr/bin/env node
// evolution-tracker entry point
// Usage: node run.cjs <subject_skill_name> [--phase=1|2|3|4|all]
const path = require("path");
const C = require("./lib/common.cjs");
const { readPhase1, formatPhase1Log } = require("./lib/phase1_read.cjs");
const { analyze, formatPhase2Log } = require("./lib/phase2_analyze.cjs");
const { propose, formatPhase3Log } = require("./lib/phase3_propose.cjs");
const { write } = require("./lib/phase4_write.cjs");

function parseArgs(argv) {
  const args = { subject: null, phase: "all" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--phase=")) args.phase = a.slice(8);
    else if (!args.subject) args.subject = a;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.subject) {
    console.error(
      "Usage: node run.cjs <subject_skill_name> [--phase=1|2|3|4|all]",
    );
    process.exit(2);
  }

  const runId = C.makeRunId(args.subject);
  const startedAt = C.bjNow();
  console.log(
    `[evolution-tracker] run_id=${runId}  subject=${args.subject}  started=${startedAt}`,
  );

  // Phase 1
  const p1 = readPhase1(args.subject);
  const p1log = formatPhase1Log(p1);
  C.writeLog(`phase1-read-${runId}.log`, p1log);
  console.log("\n--- Phase 1 READ ---");
  console.log(p1log);

  if (p1.mode === "aborted") {
    console.log(`\n[ABORT] ${p1.abort_reason}`);
    process.exit(3);
  }

  if (args.phase === "1") {
    console.log(`\n[STOP after phase 1] mode=${p1.mode}`);
    process.exit(0);
  }

  // Phase 2
  const p2 = analyze(p1);
  const p2log = formatPhase2Log(p2);
  C.writeLog(`phase2-analyze-${runId}.log`, p2log);
  console.log("\n--- Phase 2 ANALYZE ---");
  console.log(p2log);

  if (args.phase === "2") {
    console.log(
      `\n[STOP after phase 2] clusters=${Object.keys(p2.clusters).length}`,
    );
    process.exit(0);
  }

  // Phase 3
  const p3 = propose(p2);
  const p3log = formatPhase3Log(p3);
  C.writeLog(`phase3-propose-${runId}.log`, p3log);
  console.log("\n--- Phase 3 PROPOSE ---");
  console.log(p3log);

  if (args.phase === "3") {
    console.log(
      `\n[STOP after phase 3] proposals=${p3.proposals.length} (actionable=${p3.proposals.filter((p) => p.status === "pending").length}, rejected=${p3.proposals.filter((p) => p.status === "out_of_scope").length})`,
    );
    process.exit(0);
  }

  // Phase 4
  const startedAtMs = Date.now();
  const w = write(p1, p2, p3, {
    evolutionRunId: runId,
    startedAt,
    durationMs: Date.now() - startedAtMs,
  });
  console.log("\n--- Phase 4 WRITE ---");
  console.log(`[WRITE] ${w.wrote.length} files written:`);
  for (const f of w.wrote) {
    console.log(`  ${path.relative(process.cwd(), f).replace(/\\/g, "/")}`);
  }
  console.log(
    `[CURSOR] updated: ${path.relative(process.cwd(), w.cursor_path).replace(/\\/g, "/")}`,
  );
  console.log(`[SELF-LOOP] appended evolution-tracker/logs/runs.jsonl`);

  // Phase 6 REPORT (终端摘要 ≤30 行)
  console.log("\n=== ✅ evolution-tracker 完成 ===");
  console.log(`run_id:    ${runId}`);
  console.log(
    `subject:   ${p3.subject_skill} v${(p1.skill_frontmatter && p1.skill_frontmatter.version) || "?"}`,
  );
  console.log(
    `mode:      ${p1.mode}${p1.weak_signal_banner ? " (⚠️ 弱信号)" : ""}`,
  );
  console.log(
    `valid_runs: ${p1.valid_run_count} (${p1.valid_runs.map((v) => v.run_id).join(", ")})`,
  );
  const actionable = p3.proposals.filter((x) => x.status === "pending");
  const rejected = p3.proposals.filter((x) => x.status === "out_of_scope");
  console.log(
    `proposals: ${p3.proposals.length} (actionable=${actionable.length}, rejected=${rejected.length}, blacklisted=${p3.skipped_blacklisted.length})`,
  );
  for (const p of p3.proposals) {
    const tag =
      p.status === "out_of_scope" ? "🔴 REJECTED out_of_scope" : "🟢 PENDING";
    console.log(`  ${p.proposal_id}  ${p.direction.padEnd(20)} [${tag}]`);
  }
  console.log(
    `\n📄 Weekly review: ${path.relative(process.cwd(), w.review_path).replace(/\\/g, "/")}`,
  );
  console.log(
    `📋 Index:         ${path.relative(process.cwd(), w.index_path).replace(/\\/g, "/")}`,
  );
  if (actionable.length > 0) {
    console.log(`\nNext:`);
    for (const p of actionable) {
      console.log(`  git apply ${p.diff_path}    # 接受 ${p.proposal_id}`);
    }
  }
}

main();
