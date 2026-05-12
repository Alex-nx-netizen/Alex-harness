#!/usr/bin/env node
"use strict";
// v0.8 #1: dogfood suite — 全 fixture 跑一遍 helix 全链，断言 promise + warnings
//
// 用法：
//   node _meta/dogfood/run-suite.cjs                # 跑所有
//   node _meta/dogfood/run-suite.cjs 03-team-mode   # 跑指定 fixture
//
// 设计：
//   - 每个 fixture 用 helix --start → 注入 synthetic_phases 通过 helix --report → --finalize
//   - 断言 finalize 输出的 promise / soft_failures / warnings 与 fixture 期望一致
//   - 报告写 _meta/dogfood/last-suite-report.json
//   - PROCESS exit code = 失败 fixture 数量

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HERE = __dirname;
const PROJECT_ROOT = path.resolve(HERE, "..", "..");
const FIXTURES_DIR = path.join(HERE, "fixtures");
const HELIX_RUN = path.join(PROJECT_ROOT, "skills", "helix", "run.cjs");
const REPORT_PATH = path.join(HERE, "last-suite-report.json");

function colorize(s, code) {
  if (!process.stdout.isTTY) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}
const green = (s) => colorize(s, "32");
const red = (s) => colorize(s, "31");
const yellow = (s) => colorize(s, "33");

function listFixtures(filter) {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((n) => n.endsWith(".json"))
    .filter((n) => !filter || n.includes(filter))
    .sort();
}

function runFixture(fname) {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, fname), "utf-8"),
  );
  const errors = [];

  // 1. start
  const startRes = spawnSync(
    "node",
    [HELIX_RUN, "--start", fixture.task],
    { encoding: "utf-8", cwd: PROJECT_ROOT, timeout: 10000 },
  );
  if (startRes.status !== 0) {
    return {
      fixture_id: fixture.fixture_id,
      pass: false,
      errors: ["start_failed: " + (startRes.stderr || "").slice(0, 200)],
    };
  }
  let plan;
  try {
    plan = JSON.parse(startRes.stdout);
  } catch (e) {
    return {
      fixture_id: fixture.fixture_id,
      pass: false,
      errors: ["start_output_unparseable: " + e.message],
    };
  }

  // 2. 按 fixture.synthetic_phases 顺序 --report 每个 phase
  const phases = Object.keys(fixture.synthetic_phases || {});
  for (const phase of phases) {
    const cfg = fixture.synthetic_phases[phase];
    const payload = {
      passes: cfg.passes !== false,
      summary: `dogfood synthetic for ${phase}`,
      output: {},
      duration_ms: 5,
      errors: cfg.errors || [],
    };
    // 透传 score（让 #3 真实化检测能跑）
    // dogfood 模拟 a6/meta-audit/code-review 的 buildScore 行为：补 _source / _uniform_suspect
    if (cfg.score) {
      const dims = Object.entries(cfg.score).filter(([k]) => k !== "total");
      const vals = dims.map(([, v]) => v);
      const uniform = vals.every((v) => v === vals[0]);
      const enrichedScore = {
        ...cfg.score,
        total: cfg.score.total || vals.reduce((a, b) => a + b, 0),
        _source: "llm_provided",
        _uniform_suspect: uniform,
      };
      payload.score = enrichedScore;
      payload.output.score = enrichedScore;
    }
    // fixture 05 显式触发 default_fallback（模拟 a6 没传 score）
    if (cfg.no_score_provided) {
      const enrichedScore = {
        accuracy: 4, completeness: 4, actionability: 4, format: 4,
        total: 16,
        _source: "default_fallback",
        _uniform_suspect: true,
      };
      payload.score = enrichedScore;
      payload.output.score = enrichedScore;
    }
    // a4-planner 透传 composedPhases + task_card_validated（让 #10 hash 能存）
    if (phase === "a4-planner") {
      payload.output.composedPhases = phases.filter(
        (p) => p !== "mode-router-coarse",
      );
      if (fixture.task_card) {
        payload.output.task_card_validated = fixture.task_card;
      }
    }
    // a5-executor 透传 mode + subagent_run_ids
    if (phase === "a5-executor" && cfg.mode) {
      payload.output.mode = cfg.mode;
      payload.output.team_type = cfg.team_type || null;
      payload.output.subagent_run_ids = cfg.subagent_run_ids || [];
    }
    // code-review 标 has_recommendations
    if (phase === "code-review" && cfg.score) {
      payload.output.has_recommendations = cfg.score && cfg.score.quality < 5;
    }
    const r = spawnSync(
      "node",
      [HELIX_RUN, "--report", phase, JSON.stringify(payload)],
      { encoding: "utf-8", cwd: PROJECT_ROOT, timeout: 5000 },
    );
    if (r.status !== 0) {
      errors.push(`report_${phase}_failed: ${(r.stderr || "").slice(0, 100)}`);
    }
  }

  // 3. finalize
  const finRes = spawnSync(
    "node",
    [HELIX_RUN, "--finalize"],
    {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
      timeout: 15000,
      env: { ...process.env, HARNESS_AUTO_GOVERNANCE: "off" }, // dogfood 期间不自动跑 governance
    },
  );
  if (finRes.status !== 0) {
    return {
      fixture_id: fixture.fixture_id,
      pass: false,
      errors: [
        ...errors,
        "finalize_failed: " + (finRes.stderr || "").slice(0, 200),
      ],
    };
  }
  let finalEntry;
  try {
    finalEntry = JSON.parse(finRes.stdout);
  } catch (e) {
    return {
      fixture_id: fixture.fixture_id,
      pass: false,
      errors: [...errors, "finalize_output_unparseable: " + e.message],
    };
  }

  // 4. 断言
  if (finalEntry.promise !== fixture.expected_promise) {
    errors.push(
      `promise mismatch: expected ${fixture.expected_promise}, got ${finalEntry.promise}`,
    );
  }
  if (fixture.expected_soft_failures) {
    const got = finalEntry.soft_failures || [];
    for (const sf of fixture.expected_soft_failures) {
      if (!got.includes(sf)) errors.push(`expected soft_failure ${sf} missing`);
    }
  }
  if (fixture.expected_warnings_contains) {
    const w = (finalEntry.warnings || []).join("; ");
    if (!w.includes(fixture.expected_warnings_contains)) {
      errors.push(
        `expected warning containing "${fixture.expected_warnings_contains}" missing; got: ${w}`,
      );
    }
  }
  if (fixture.expected_failure_log) {
    // #9：promise=NOT_COMPLETE 必写"失败专属段"到 progress.md
    const progress = fs.readFileSync(
      path.join(PROJECT_ROOT, "_meta", "progress.md"),
      "utf-8",
    );
    if (!progress.includes(`helix-run-${finalEntry.helix_run_id} NOT_COMPLETE`)) {
      errors.push("expected failure log block not appended to progress.md");
    }
  }

  return {
    fixture_id: fixture.fixture_id,
    pass: errors.length === 0,
    errors,
    promise: finalEntry.promise,
    soft_failures: finalEntry.soft_failures,
    warnings: finalEntry.warnings,
    helix_run_id: finalEntry.helix_run_id,
  };
}

function main() {
  const filter = process.argv[2] || null;
  const fixtures = listFixtures(filter);
  if (fixtures.length === 0) {
    console.error(`no fixtures matched ${filter || "(all)"}`);
    process.exit(1);
  }

  console.log(`\n=== Alex-harness v0.8 dogfood suite (${fixtures.length} fixtures) ===\n`);
  const results = [];
  for (const f of fixtures) {
    process.stdout.write(`[${f}] `);
    const r = runFixture(f);
    results.push(r);
    if (r.pass) {
      console.log(green("PASS") + ` (${r.promise || "?"})`);
    } else {
      console.log(red("FAIL"));
      r.errors.forEach((e) => console.log("  - " + yellow(e)));
    }
  }

  const passN = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(
    `\n${passN === total ? green("✅") : red("❌")} ${passN}/${total} fixtures passed\n`,
  );

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        total,
        passed: passN,
        failed: total - passN,
        results,
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(`report: ${REPORT_PATH}`);
  process.exit(total - passN);
}

main();
