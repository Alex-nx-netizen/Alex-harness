"use strict";
// code-review/run.cjs — 质量元（专业开发者视角）
//
// 脚本职责：
//   - 接收 LLM 喂回的 review_report（5 维评分 + findings）
//   - 校验 schema：dimensions 5 项 0-5、findings 数组
//   - 算总分，按阈值判 passes（≥12 true、<12 false）
//   - 自留底 + 上报 helix
//
// 不做的事（重要）：
//   - 不真的派 subagent（subagent 派遣由 LLM 在主进程通过 Task tool 完成）
//   - 不替 LLM 打分（脚本只是稳定的载体）
//
// 软失败语义（与 meta-audit 不同）：
//   - passes=false 不卡 helix --finalize；helix 把 code-review 放进 SOFT_PHASES 白名单
//
// 用法：
//   node skills/code-review/run.cjs '<input-json>'
//
// 输入示例（参见 SKILL.md §2）：
//   {
//     "plan": "...",
//     "files_changed": ["src/foo.ts"],
//     "execution_summary": "...",
//     "language_hints": ["typescript"],
//     "review_report": {
//       "dimensions": { "quality": 4, "security": 5, "performance": 3, "readability": 4, "testability": 3 },
//       "findings": [ {"severity":"HIGH","dimension":"performance","file":"src/foo.ts","line":42,"note":"...","suggestion":"..."} ]
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
const PHASE = "code-review";

const DIMENSIONS = [
  "quality",
  "security",
  "performance",
  "readability",
  "testability",
];

const PASS_THRESHOLD = 20; // ≥20 → passes=true，无 findings 或仅 LOW
const RECOMMEND_FLOOR = 12; // 12-19 → passes=true + has_recommendations；<12 → 软失败
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function validateReviewReport(reviewReport) {
  const errors = [];
  if (!reviewReport || typeof reviewReport !== "object") {
    return { ok: false, errors: ["review_report_missing"] };
  }
  const dims = reviewReport.dimensions;
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
  const findings = reviewReport.findings;
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
    return {
      passes: true,
      has_recommendations: false,
      severity: "ok",
    };
  }
  if (total >= RECOMMEND_FLOOR) {
    return {
      passes: true,
      has_recommendations: true,
      severity: "recommendations",
    };
  }
  return {
    passes: false,
    has_recommendations: true,
    severity: "soft_blocked",
  };
}

function tallyFindings(findings) {
  const by_severity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const by_dimension = {};
  for (const d of DIMENSIONS) by_dimension[d] = 0;

  for (const f of findings) {
    if (!f || typeof f !== "object") continue;
    const sev = SEVERITIES.includes(f.severity) ? f.severity : "LOW";
    by_severity[sev] += 1;
    if (typeof f.dimension === "string" && DIMENSIONS.includes(f.dimension)) {
      by_dimension[f.dimension] += 1;
    }
  }
  return { by_severity, by_dimension };
}

function suggestNext(verdict, by_severity) {
  const hi = (by_severity.CRITICAL || 0) + (by_severity.HIGH || 0);
  const me = by_severity.MEDIUM || 0;
  if (verdict.severity === "ok") return "ship as-is";
  if (hi > 0)
    return `回 a5 处理 ${hi} 个 HIGH/CRITICAL 后再进 a6（建议；soft）`;
  if (me > 0)
    return `${me} 个 MEDIUM 进 PR 描述，由用户决定是否回 a5`;
  return "仅 LOW，可 ship；findings 进 PR 描述备忘";
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
      output: {
        score: null,
        findings: [],
        has_recommendations: false,
        soft_fail: true,
      },
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

  const reviewReport = input.review_report || {};
  const { ok, errors: schemaErrors } = validateReviewReport(reviewReport);

  if (!ok) {
    const err = {
      phase: PHASE,
      passes: false,
      summary: `review_report schema 不合法：${schemaErrors.join(", ")}`,
      output: {
        score: null,
        findings: [],
        has_recommendations: false,
        soft_fail: true,
        next_step:
          "LLM 派 code-reviewer + security-reviewer (+ performance-optimizer + 语言专属) subagent，把输出合并成 review_report.dimensions(5) + findings[]，再调本脚本",
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
    process.exit(0); // phase 失败由 passes 表达，不靠 exit code
  }

  const score = computeScore(reviewReport.dimensions);
  const verdict = judge(score.total);
  const findings = Array.isArray(reviewReport.findings)
    ? reviewReport.findings
    : [];
  const { by_severity, by_dimension } = tallyFindings(findings);

  const filesChanged = Array.isArray(input.files_changed)
    ? input.files_changed
    : [];
  const languageHints = Array.isArray(input.language_hints)
    ? input.language_hints
    : [];

  const result = {
    phase: PHASE,
    passes: verdict.passes,
    summary: `总分 ${score.total}/25（${verdict.severity}） · findings ${findings.length}（HIGH/CRITICAL ${(by_severity.HIGH || 0) + (by_severity.CRITICAL || 0)}） · files ${filesChanged.length}`,
    output: {
      score,
      has_recommendations: verdict.has_recommendations,
      soft_fail: !verdict.passes, // 标记给 helix --finalize：失败也走软通道
      findings_count: findings.length,
      by_severity,
      by_dimension,
      findings: findings.slice(0, 30), // 截断，避免 helix-runs.jsonl 过大
      files_changed: filesChanged.slice(0, 30),
      language_hints: languageHints,
      suggested_next: suggestNext(verdict, by_severity),
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
