"use strict";
// a5-executor/run.cjs — 骨架版
// passes 判定：input 含 PlanDoc + 用户已确认（confirmed=true）
// 真正执行（改文件）由 LLM 按 SKILL.md + a8-risk-guard 配合完成。

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a5-executor";

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

function main() {
  const startMs = Date.now();
  let input = {};
  try {
    input = JSON.parse(process.argv[2] || "{}");
  } catch {}

  const plan = input.plan || input.plan_doc || input.planDoc;
  const hasPlan =
    !!plan && (typeof plan === "object" || typeof plan === "string");
  const confirmed = input.user_confirmed === true || input.confirmed === true;
  const filesChanged = Array.isArray(input.files_changed)
    ? input.files_changed
    : [];

  const passes = hasPlan && confirmed;

  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `执行授权已获（plan + 用户确认），LLM 按 SKILL.md 逐文件改并通过 a8-risk-guard`
      : !hasPlan
        ? "缺 plan，无法执行"
        : "缺用户确认（不在确认前执行 — Ralph 反对自宣告）",
    output: {
      plan_received: hasPlan,
      user_confirmed: confirmed,
      files_changed: filesChanged,
      next_step: passes
        ? "LLM 按 plan 逐 file 改；破坏性操作前 inject a8-risk-guard"
        : "等用户在 helix Step 6 确认 plan",
    },
    duration_ms: Date.now() - startMs,
    errors: passes
      ? []
      : [!hasPlan ? "missing_plan" : "missing_user_confirmation"],
    ts: nowBJ(),
  };

  fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true });
  const line = JSON.stringify({
    ...result,
    user_feedback: { rating: null, fix_notes: null },
  });
  JSON.parse(line);
  fs.appendFileSync(RUNS_LOG, line + "\n", "utf-8");

  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: PROJECT_DIR,
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
