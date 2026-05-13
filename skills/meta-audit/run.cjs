"use strict";
// meta-audit/run.cjs — 审计元（论文 §6②）
//
// 脚本职责：
//   - 接收 LLM 喂回的 audit_report（4 维评分 + findings）
//   - 校验 schema：dimensions 4 项 0-5、findings 数组
//   - 算总分，按阈值判 passes
//   - 自留底 + 上报 helix
//
// 不做的事（重要）：
//   - 不真的派 subagent（subagent 派遣由 LLM 在主进程通过 Task tool 完成）
//   - 不替 LLM 打分（脚本只是稳定的载体）
//
// 用法：
//   node skills/meta-audit/run.cjs '<input-json>'
//
// 输入示例（参见 SKILL.md §2）：
//   {
//     "plan": "...",
//     "files_changed": ["src/foo.ts"],
//     "execution_summary": "...",
//     "audit_report": {
//       "dimensions": { "correctness": 4, "security": 5, "maintainability": 3, "alignment_with_plan": 5 },
//       "findings": [ {"severity":"HIGH","file":"src/foo.ts","note":"..."} ]
//     }
//   }

const fs = require("fs");
const path = require("path");
const { nowBJ, safeAppend, printResult } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "meta-audit";

const DIMENSIONS = [
  "correctness",
  "security",
  "maintainability",
  "alignment_with_plan",
];

const PASS_THRESHOLD = 16; // ≥16 → passes
const REVISION_FLOOR = 10; // 10-15 → needs_revision；<10 → 重大问题

function validateAuditReport(auditReport) {
  const errors = [];
  if (!auditReport || typeof auditReport !== "object") {
    return { ok: false, errors: ["audit_report_missing"] };
  }
  const dims = auditReport.dimensions;
  if (!dims || typeof dims !== "object") {
    errors.push("dimensions_missing");
  } else {
    for (const d of DIMENSIONS) {
      const v = dims[d];
      if (typeof v !== "number" || v < 0 || v > 5 || !Number.isFinite(v)) {
        errors.push(`dim_invalid_${d}`);
      }
    }
  }
  const findings = auditReport.findings;
  if (findings !== undefined && !Array.isArray(findings)) {
    errors.push("findings_not_array");
  }
  return { ok: errors.length === 0, errors };
}

function computeScore(dims) {
  const score = {};
  let total = 0;
  let fallbackCount = 0;
  for (const d of DIMENSIONS) {
    const provided = typeof dims[d] === "number";
    const v = provided ? dims[d] : 0;
    if (!provided) fallbackCount += 1;
    score[d] = v;
    total += v;
  }
  score.total = total;
  // v0.8 #3：score 真实化 — 标记来源 + uniform 检测
  const vals = DIMENSIONS.map((d) => score[d]);
  const uniform = vals.every((v) => v === vals[0]);
  score._source =
    fallbackCount === DIMENSIONS.length
      ? "default_fallback"
      : fallbackCount > 0
      ? "partial_fallback"
      : "llm_provided";
  score._uniform_suspect = uniform;
  return score;
}

function judge(total) {
  if (total >= PASS_THRESHOLD) {
    return { passes: true, needs_revision: false, severity: "ok" };
  }
  if (total >= REVISION_FLOOR) {
    return { passes: false, needs_revision: true, severity: "needs_revision" };
  }
  return { passes: false, needs_revision: false, severity: "blocked" };
}

function main() {
  const startMs = Date.now();
  const rawInput = process.argv[2] || "{}";

  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (e) {
    const err = {
      phase: PHASE,
      passes: false,
      summary: `输入 JSON 解析失败：${e.message}`,
      output: { score: null, findings: [], needs_revision: false },
      errors: ["invalid_input_json"],
      duration_ms: Date.now() - startMs,
      ts: nowBJ(),
    };
    safeAppend(RUNS_LOG, {
      ...err,
      user_feedback: { rating: null, fix_notes: null },
    });
    printResult(err);
    process.exit(2);
  }

  const auditReport = input.audit_report || {};
  const { ok, errors: schemaErrors } = validateAuditReport(auditReport);

  if (!ok) {
    const err = {
      phase: PHASE,
      passes: false,
      summary: `audit_report schema 不合法：${schemaErrors.join(", ")}`,
      output: {
        score: null,
        findings: [],
        needs_revision: false,
        next_step:
          "LLM 派 code-reviewer + security-reviewer subagent，把输出合并成 audit_report.dimensions(4) + findings[]，再调本脚本",
      },
      errors: schemaErrors,
      duration_ms: Date.now() - startMs,
      ts: nowBJ(),
    };
    safeAppend(RUNS_LOG, {
      ...err,
      user_feedback: { rating: null, fix_notes: null },
    });
    if (fs.existsSync(HELIX_RUN)) {
      spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(err)], {
        stdio: "inherit",
        cwd: PROJECT_DIR,
      });
    }
    printResult(err);
    process.exit(0); // exit 0：phase 失败由 passes=false 表达，不靠 exit code
  }

  const score = computeScore(auditReport.dimensions);
  const verdict = judge(score.total);
  const findings = Array.isArray(auditReport.findings)
    ? auditReport.findings
    : [];
  const high = findings.filter(
    (f) => (f && (f.severity === "HIGH" || f.severity === "CRITICAL")) || false,
  ).length;

  const filesChanged = Array.isArray(input.files_changed)
    ? input.files_changed
    : [];

  const result = {
    phase: PHASE,
    passes: verdict.passes,
    summary: `总分 ${score.total}/20（${verdict.severity}） · findings ${findings.length}（HIGH/CRITICAL ${high}） · files ${filesChanged.length}`,
    output: {
      score,
      needs_revision: verdict.needs_revision,
      findings_count: findings.length,
      high_severity_count: high,
      findings: findings.slice(0, 20), // 截断，避免 helix-runs.jsonl 过大
      files_changed: filesChanged.slice(0, 30),
    },
    errors: verdict.passes ? [] : [verdict.severity],
    duration_ms: Date.now() - startMs,
    ts: nowBJ(),
  };

  // 自留底
  safeAppend(RUNS_LOG, {
    ...result,
    user_feedback: { rating: null, fix_notes: null },
  });

  // 上报 helix
  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: PROJECT_DIR,
    });
  }

  printResult(result);
}

main();
