#!/usr/bin/env node
// _meta/e2e-fixtures/replay.cjs
// E2E 回归 replay 脚本（E4）
//
// 用法：
//   node _meta/e2e-fixtures/replay.cjs                          # 跑所有 fixture
//   node _meta/e2e-fixtures/replay.cjs --fixture 01-simple-task.json
//
// 行为：
//   1. 加载所有 (或指定) fixture .json
//   2. 对每个 fixture：
//      - 从 _meta/helix-runs.jsonl 读历史 phase_report 行（ground truth 池）
//      - 找一组近似的 phase 序列做 diff（不真调 LLM；回归探针模式）
//      - 比对 expected_phases vs observed phases，逐项产 diff
//   3. 输出 .last-replay-report.json
//
// 重要：
//   - 不强制全 phase 通过；回归报告可读即 PASS
//   - 写完 JSON 必校验

"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const META = path.dirname(HERE);
const HELIX_RUNS_PATH = path.join(META, "helix-runs.jsonl");
const REPORT_PATH = path.join(HERE, ".last-replay-report.json");

const PHASE_CHAIN = [
  "mode-router-coarse",
  "a1-task-understander",
  "a2-repo-sensor",
  "a4-planner",
  "mode-router-fine",
  "a5-executor",
  "a6-validator",
  "a7-explainer",
];

function bjTime(d = new Date()) {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const Y = bj.getUTCFullYear();
  const M = bj.getUTCMonth() + 1;
  const D = bj.getUTCDate();
  const h = String(bj.getUTCHours()).padStart(2, "0");
  const m = String(bj.getUTCMinutes()).padStart(2, "0");
  const s = String(bj.getUTCSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function parseArgs(argv) {
  const args = { fixture: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--fixture" && argv[i + 1]) {
      args.fixture = argv[i + 1];
      i++;
    }
  }
  return args;
}

function listFixtures() {
  return fs
    .readdirSync(HERE)
    .filter((n) => /^\d.*\.json$/.test(n))
    .sort();
}

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function readJsonlLines(file) {
  if (!fs.existsSync(file)) return [];
  const raw = stripBom(fs.readFileSync(file, "utf-8"));
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const clean = stripBom(line);
    if (!clean.trim()) continue;
    try {
      out.push(JSON.parse(clean));
    } catch {
      // 容错：跳过破损行，不阻断 replay
    }
  }
  return out;
}

// 从历史 helix runs 里挑一个最近的、phase 覆盖最全的 run，作为 dry-run "observed" 池
function pickReferenceRun(allLines) {
  // group by helix_run_id
  const groups = new Map();
  for (const e of allLines) {
    const id = e.helix_run_id;
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(e);
  }
  // 选 phase_report 数量最多 + 最新的那一组
  let best = null;
  let bestScore = -1;
  for (const [id, items] of groups.entries()) {
    const phases = items.filter((x) => x.type === "phase_report");
    const score = phases.length;
    const lastTs = items[items.length - 1]?.ts || "";
    if (
      score > bestScore ||
      (score === bestScore && lastTs > (best?.lastTs || ""))
    ) {
      bestScore = score;
      best = { id, items, phases, lastTs };
    }
  }
  return best;
}

function diffFixture(fixture, reference) {
  const diffs = [];
  const observedPhases = (reference?.phases || []).map((p) => p.phase);
  const expected = fixture.expected_phases || [];

  // 1) 缺失 phase
  for (const exp of expected) {
    if (!observedPhases.includes(exp.phase)) {
      diffs.push({
        phase: exp.phase,
        kind: "missing_phase",
        detail: `expected phase '${exp.phase}' not in observed reference run`,
      });
      continue;
    }
    // 2) passes 不一致
    const obs = reference.phases.find((p) => p.phase === exp.phase);
    if (typeof exp.passes === "boolean" && obs && obs.passes !== exp.passes) {
      diffs.push({
        phase: exp.phase,
        kind: "passes_mismatch",
        expected: exp.passes,
        observed: obs.passes,
      });
    }
    // 3) must_have_keys（references look at output_keys array on phase_report）
    if (Array.isArray(exp.must_have_keys) && obs) {
      const obsKeys = obs.output_keys || [];
      for (const k of exp.must_have_keys) {
        if (!obsKeys.includes(k)) {
          diffs.push({
            phase: exp.phase,
            kind: "missing_key",
            key: k,
            observed_keys: obsKeys,
          });
        }
      }
    }
  }
  // 4) phase 顺序简单检查（仅警告级，不阻塞）
  for (let i = 1; i < expected.length; i++) {
    const a = expected[i - 1].phase;
    const b = expected[i].phase;
    const ia = observedPhases.indexOf(a);
    const ib = observedPhases.indexOf(b);
    if (ia >= 0 && ib >= 0 && ia > ib) {
      diffs.push({
        kind: "phase_order_warning",
        detail: `phase '${a}' observed AFTER '${b}' in reference (expected before)`,
      });
    }
  }
  return { observedPhases, diffs };
}

function main() {
  const args = parseArgs(process.argv);
  const fixtureNames = args.fixture ? [args.fixture] : listFixtures();

  if (fixtureNames.length === 0) {
    console.error("[replay] 没有 fixture 文件");
    process.exit(1);
  }

  if (!fs.existsSync(HELIX_RUNS_PATH)) {
    console.error(`[replay] 缺少 ${HELIX_RUNS_PATH} — 没有历史可比对`);
    process.exit(1);
  }

  const allLines = readJsonlLines(HELIX_RUNS_PATH);
  const reference = pickReferenceRun(allLines);
  if (!reference) {
    console.error(`[replay] 未能从历史 helix-runs 找到可用的 reference run`);
    process.exit(1);
  }

  console.log(
    `[replay] reference run = ${reference.id}  (phase_reports=${reference.phases.length})`,
  );

  const report = {
    ts: bjTime(),
    reference_run_id: reference.id,
    fixtures: [],
  };

  for (const name of fixtureNames) {
    const file = path.join(HERE, name);
    if (!fs.existsSync(file)) {
      report.fixtures.push({
        fixture_id: name,
        ok: false,
        error: "fixture file not found",
      });
      console.warn(`[replay] ${name} not found, skipping`);
      continue;
    }
    let fixture;
    try {
      fixture = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (e) {
      report.fixtures.push({
        fixture_id: name,
        ok: false,
        error: `parse fail: ${e.message}`,
      });
      console.warn(`[replay] ${name} parse fail: ${e.message}`);
      continue;
    }

    const { observedPhases, diffs } = diffFixture(fixture, reference);
    const ok = diffs.length === 0;
    report.fixtures.push({
      fixture_id: fixture.fixture_id || name,
      ok,
      phases_observed: observedPhases,
      phases_expected: (fixture.expected_phases || []).map((p) => p.phase),
      diffs,
    });
    console.log(
      `[replay] ${name}  ${ok ? "OK" : "DIFF"}  diffs=${diffs.length}  observed=${observedPhases.length}/${(fixture.expected_phases || []).length}`,
    );
  }

  // 写报告 + 校验
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(REPORT_PATH, json);
  try {
    JSON.parse(fs.readFileSync(REPORT_PATH, "utf-8")); // 自校验
  } catch (e) {
    console.error(`[replay] 报告 JSON 校验失败: ${e.message}`);
    process.exit(1);
  }
  console.log(`[replay] report → ${REPORT_PATH}`);
}

try {
  main();
} catch (e) {
  console.error(`[replay] FAILED: ${e.message}`);
  process.exit(1);
}
