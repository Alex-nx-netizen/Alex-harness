"use strict";
// code-simplifier/run.cjs — 反冗余专项重构元
//
// 脚本职责：
//   - 接收 LLM 喂回的 simplification_report（5 维评分 + findings）
//   - 校验 schema：dimensions 5 项 0-5、findings 每项含 behavior_safe
//   - 算总分，按阈值判 passes（≥20 ok、12-19 recommendations、<12 soft_blocked）
//   - 行为安全统计：behavior_violations（findings 中 behavior_safe=false 计数）
//   - 自留底 + 上报 helix（与 code-review 同 soft-fail 通道）
//
// 设计约束（铁律）：
//   - 不真的派 subagent（subagent 派遣由 LLM 在主进程通过 Task tool 完成）
//   - 不替 LLM 打分（脚本只是稳定的载体）
//   - 不改行为 → 任何 behavior_safe=false 的 finding 自动升级 severity ≥ HIGH
//
// 用法：
//   node skills/code-simplifier/run.cjs '<input-json>'

const fs = require("fs");
const path = require("path");
const { nowBJ, safeAppend, printResult } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "code-simplifier";

const DIMENSIONS = [
  "redundancy",
  "dead_code",
  "complexity",
  "naming",
  "comments_signal",
];

const PASS_THRESHOLD = 20;
const RECOMMEND_FLOOR = 12;
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function validateReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return { ok: false, errors: ["simplification_report_missing"] };
  }
  const dims = report.dimensions;
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
  const findings = report.findings;
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
    return { passes: true, has_recommendations: false, severity: "ok" };
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

// 行为安全检查：behavior_safe=false 的 finding 必须 ≥ HIGH
function enforceBehaviorSafety(findings) {
  let violations = 0;
  for (const f of findings) {
    if (!f || typeof f !== "object") continue;
    if (f.behavior_safe === false) {
      violations += 1;
      // 强制升级 severity
      const sev = SEVERITIES.includes(f.severity) ? f.severity : "LOW";
      const sevIdx = SEVERITIES.indexOf(sev);
      const highIdx = SEVERITIES.indexOf("HIGH");
      if (sevIdx > highIdx) {
        f.severity = "HIGH";
        f._severity_upgraded = true;
      }
    }
  }
  return violations;
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

function suggestNext(verdict, by_severity, violations, filesCount) {
  if (filesCount === 0) return "no changes to simplify";
  const hi = (by_severity.CRITICAL || 0) + (by_severity.HIGH || 0);
  const me = by_severity.MEDIUM || 0;
  if (violations > 0)
    return `检测到 ${violations} 处行为变更建议（behavior_safe=false）—— 走 a5+a8 流程，不在本 skill 处理`;
  if (verdict.severity === "ok") return "ship as-is";
  if (hi > 0)
    return `回 a5 处理 ${hi} 个 HIGH/CRITICAL 后再 ship（建议；soft）`;
  if (me > 0) return `${me} 个 MEDIUM 进 PR 描述，由用户决定是否回 a5`;
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
        behavior_violations: 0,
      },
      errors: ["invalid_input_json"],
      duration_ms: Date.now() - startMs,
      ts: nowBJ(),
    };
    safeAppend(RUNS_LOG, {
      ...err,
      user_feedback: { rating: null, fix_notes: null, regressed: null },
    });
    printResult(err);
    process.exit(2);
  }

  const report = input.simplification_report || {};
  const { ok, errors: schemaErrors } = validateReport(report);

  if (!ok) {
    const err = {
      phase: PHASE,
      passes: false,
      summary: `simplification_report schema 不合法：${schemaErrors.join(", ")}`,
      output: {
        score: null,
        findings: [],
        has_recommendations: false,
        soft_fail: true,
        behavior_violations: 0,
        next_step:
          "LLM 派 code-simplifier subagent，分析 git diff，给 5 维评分（redundancy/dead_code/complexity/naming/comments_signal）+ findings[behavior_safe]，再调本脚本",
      },
      errors: schemaErrors,
      duration_ms: Date.now() - startMs,
      ts: nowBJ(),
    };
    safeAppend(RUNS_LOG, {
      ...err,
      user_feedback: { rating: null, fix_notes: null, regressed: null },
    });
    if (fs.existsSync(HELIX_RUN)) {
      spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(err)], {
        stdio: "inherit",
        cwd: PROJECT_DIR,
      });
    }
    printResult(err);
    process.exit(0);
  }

  const score = computeScore(report.dimensions);
  const verdict = judge(score.total);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const behavior_violations = enforceBehaviorSafety(findings);
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
    summary: `总分 ${score.total}/25（${verdict.severity}） · findings ${findings.length}（HIGH/CRITICAL ${(by_severity.HIGH || 0) + (by_severity.CRITICAL || 0)}） · files ${filesChanged.length} · 行为违规 ${behavior_violations}`,
    output: {
      score,
      has_recommendations: verdict.has_recommendations,
      soft_fail: !verdict.passes,
      findings_count: findings.length,
      by_severity,
      by_dimension,
      findings: findings.slice(0, 30),
      files_changed: filesChanged.slice(0, 30),
      language_hints: languageHints,
      behavior_violations,
      scope_hint: typeof input.scope_hint === "string" ? input.scope_hint : null,
      suggested_next: suggestNext(
        verdict,
        by_severity,
        behavior_violations,
        filesChanged.length,
      ),
    },
    errors: verdict.passes ? [] : [verdict.severity],
    duration_ms: Date.now() - startMs,
    ts: nowBJ(),
  };

  safeAppend(RUNS_LOG, {
    ...result,
    user_feedback: { rating: null, fix_notes: null, regressed: null },
  });

  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: PROJECT_DIR,
    });
  }

  printResult(result);
}

main();
