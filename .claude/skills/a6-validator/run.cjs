"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

function main() {
  const root = process.cwd();
  const checks = detect(root);

  if (checks.length === 0) {
    console.log(
      JSON.stringify(
        {
          passed: true,
          checks: [],
          summary: "No checks detected",
          action_required: null,
        },
        null,
        2,
      ),
    );
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
  const report = {
    passed: failed.length === 0,
    checks: results,
    summary: `${results.length - failed.length}/${results.length} checks passed`,
    action_required:
      failed.length > 0 ? `Fix: ${failed.map((f) => f.name).join(", ")}` : null,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
