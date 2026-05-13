"use strict";
// a7-explainer/run.cjs — 骨架版
// passes 判定：检测到 git diff 有变更（commit message / PR description 有原料）

const fs = require("fs");
const path = require("path");
const { nowBJ } = require("../../_meta/lib/common.cjs");
const { spawnSync, execSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a7-explainer";

function safeRun(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: PROJECT_DIR,
    }).trim();
  } catch {
    return "";
  }
}

function main() {
  const startMs = Date.now();
  let input = {};
  try {
    input = JSON.parse(process.argv[2] || "{}");
  } catch {}

  const dirty = safeRun("git status --short").split("\n").filter(Boolean);
  const stagedDiffStat = safeRun("git diff --cached --shortstat");
  const unstagedDiffStat = safeRun("git diff --shortstat");
  const hasChanges = dirty.length > 0 || stagedDiffStat || unstagedDiffStat;

  const passes = hasChanges;

  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `检测到 ${dirty.length} 个变更文件，LLM 按 CLAUDE.md commit 规范出英文 ≤72 字 subject`
      : "无变更，跳过 explainer（Ralph: passes=true 才算下一步）",
    output: {
      dirty_count: dirty.length,
      dirty_files: dirty.slice(0, 10),
      staged_diff_stat: stagedDiffStat,
      unstaged_diff_stat: unstagedDiffStat,
      next_step: passes
        ? "LLM 出 commit message（type(scope): short desc，英文 ≤72 字）+ PR description"
        : "无变更可解释",
    },
    duration_ms: Date.now() - startMs,
    errors: [],
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
