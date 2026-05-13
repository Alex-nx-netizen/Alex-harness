"use strict";
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { nowBJ, printResult } = require("../../_meta/lib/common.cjs");

const SKILL_DIR = __dirname;
const HELIX_RUN = path.join(process.cwd(), "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a6-validator";

// v0.7：4 维评分（参见 SKILL.md §3）。LLM 透传，脚本兜底默认 4 分。
// v0.8 #3：标记 score_source 防止默认值伪装成"真实评分"
const SCORE_DIMENSIONS = [
  "accuracy",
  "completeness",
  "actionability",
  "format",
];
const DEFAULT_SCORE_VALUE = 4;

function buildScore(rawScore) {
  const score = {};
  let total = 0;
  let fallbackCount = 0;
  for (const d of SCORE_DIMENSIONS) {
    const provided =
      rawScore &&
      typeof rawScore[d] === "number" &&
      Number.isFinite(rawScore[d]);
    let v = provided ? rawScore[d] : DEFAULT_SCORE_VALUE;
    if (!provided) fallbackCount += 1;
    if (v < 0) v = 0;
    if (v > 5) v = 5;
    score[d] = v;
    total += v;
  }
  score.total = total;
  // 真实化诊断：detect uniform pattern（4 维全等）+ fallback 来源
  const vals = SCORE_DIMENSIONS.map((d) => score[d]);
  const uniform = vals.every((v) => v === vals[0]);
  score._source =
    fallbackCount === SCORE_DIMENSIONS.length
      ? "default_fallback"
      : fallbackCount > 0
      ? "partial_fallback"
      : "llm_provided";
  score._uniform_suspect = uniform; // LLM 全维度填同分 → 大概率没真评
  return score;
}

function run(cmd, cwd) {
  try {
    const out = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      timeout: 60000,
    });
    return { ok: true, output: out.trim() };
  } catch (e) {
    return { ok: false, output: (e.stdout || "") + (e.stderr || "") };
  }
}

function detect(root) {
  const checks = [];
  if (fs.existsSync(path.join(root, "tsconfig.json"))) {
    checks.push({ name: "tsc", cmd: "npx tsc --noEmit" });
  }
  const eslintConfigs = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.cjs",
    "eslint.config.js",
    "eslint.config.mjs",
  ];
  if (eslintConfigs.some((f) => fs.existsSync(path.join(root, f)))) {
    checks.push({ name: "eslint", cmd: "npx eslint src/ --max-warnings=0" });
  }
  if (fs.existsSync(path.join(root, "package.json"))) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8"),
    );
    if (pkg.scripts && pkg.scripts.test) {
      checks.push({ name: "tests", cmd: "npm test --if-present" });
    }
  }
  if (fs.existsSync(path.join(root, "Cargo.toml"))) {
    checks.push({ name: "cargo-test", cmd: "cargo test" });
  }
  if (fs.existsSync(path.join(root, "go.mod"))) {
    checks.push({ name: "go-test", cmd: "go test ./..." });
  }
  if (
    fs.existsSync(path.join(root, "requirements.txt")) ||
    fs.existsSync(path.join(root, "pyproject.toml"))
  ) {
    checks.push({ name: "pytest", cmd: "python -m pytest -q" });
  }
  return checks;
}

function reportToHelix(result, root) {
  // 1) 自留底
  fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true });
  const line = JSON.stringify({
    ...result,
    user_feedback: { rating: null, fix_notes: null },
  });
  JSON.parse(line);
  fs.appendFileSync(RUNS_LOG, line + "\n", "utf-8");

  // 2) 上报 helix
  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: root,
    });
  }
}

function parseInput() {
  // a6 v0.7：可选入参 JSON，含 score（4 维 0-5）
  // 兼容老调用：node run.cjs（无参） → 走默认 4 分
  const raw = process.argv[2];
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function main() {
  const startMs = Date.now();
  const root = process.cwd();
  const input = parseInput();
  const score = buildScore(input.score);
  const checks = detect(root);

  if (checks.length === 0) {
    const report = {
      phase: PHASE,
      passes: true,
      summary:
        "No checks detected (no tsc/eslint/test/cargo/go/python markers)",
      output: { checks: [], action_required: null, score },
      duration_ms: Date.now() - startMs,
      errors: [],
      ts: nowBJ(),
      score,
      // legacy fields for backward compat with LLM consumers
      passed: true,
      checks: [],
      action_required: null,
    };
    reportToHelix(report, root);
    printResult(report);
    return;
  }

  const results = [];
  for (const { name, cmd } of checks) {
    process.stderr.write(`[a6-validator] running ${name}...\n`);
    const start = Date.now();
    const { ok, output } = run(cmd, root);
    results.push({
      name,
      status: ok ? "pass" : "fail",
      duration_ms: Date.now() - start,
      output: ok ? "" : output.slice(0, 500),
    });
  }

  const failed = results.filter((r) => r.status === "fail");
  const passes = failed.length === 0;
  const report = {
    phase: PHASE,
    passes,
    summary: `${results.length - failed.length}/${results.length} checks passed · score ${score.total}/20`,
    output: {
      checks: results,
      action_required:
        failed.length > 0
          ? `Fix: ${failed.map((f) => f.name).join(", ")}`
          : null,
      score,
    },
    duration_ms: Date.now() - startMs,
    errors: failed.map((f) => f.name),
    ts: nowBJ(),
    score,
    // legacy fields
    passed: passes,
    checks: results,
    action_required:
      failed.length > 0 ? `Fix: ${failed.map((f) => f.name).join(", ")}` : null,
  };

  reportToHelix(report, root);
  printResult(report);
}

main();
