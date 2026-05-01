"use strict";
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SKILL_DIR = __dirname;
const HELIX_RUN = path.join(process.cwd(), "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a6-validator";

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
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

function main() {
  const startMs = Date.now();
  const root = process.cwd();
  const checks = detect(root);

  if (checks.length === 0) {
    const report = {
      phase: PHASE,
      passes: true,
      summary:
        "No checks detected (no tsc/eslint/test/cargo/go/python markers)",
      output: { checks: [], action_required: null },
      duration_ms: Date.now() - startMs,
      errors: [],
      ts: nowBJ(),
      // legacy fields for backward compat with LLM consumers
      passed: true,
      checks: [],
      action_required: null,
    };
    reportToHelix(report, root);
    console.log(JSON.stringify(report, null, 2));
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
    summary: `${results.length - failed.length}/${results.length} checks passed`,
    output: {
      checks: results,
      action_required:
        failed.length > 0
          ? `Fix: ${failed.map((f) => f.name).join(", ")}`
          : null,
    },
    duration_ms: Date.now() - startMs,
    errors: failed.map((f) => f.name),
    ts: nowBJ(),
    // legacy fields
    passed: passes,
    checks: results,
    action_required:
      failed.length > 0 ? `Fix: ${failed.map((f) => f.name).join(", ")}` : null,
  };

  reportToHelix(report, root);
  console.log(JSON.stringify(report, null, 2));
}

main();
