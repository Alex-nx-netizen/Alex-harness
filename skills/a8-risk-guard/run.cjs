"use strict";
// a8-risk-guard/run.cjs — 骨架版
// passes 判定：操作非破坏性 OR 用户已明确确认
// 关键：默认 fail-safe（拿不准一律 passes=false 触发暂停）

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a8-risk-guard";

// 黑名单 — 命中即 CRITICAL/HIGH（必须用户明确确认）
const CRITICAL_PATTERNS = [
  /\bgit\s+push\s+(--force|--force-with-lease|-f\b)/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+branch\s+-D\b/i,
  /\bgit\s+rebase\b/i,
  /\brm\s+-rf\b/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)/i,
  /\bTRUNCATE\b/i,
  /\bdrop\s+database\b/i,
];
const HIGH_PATTERNS = [
  /覆盖.*配置/i,
  /\boverwrite\b.*\.env/i,
  /CI[\/_-]?(config|pipeline)/i,
];

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

function classify(opStr) {
  for (const re of CRITICAL_PATTERNS) {
    if (re.test(opStr)) return { level: "CRITICAL", matched: re.toString() };
  }
  for (const re of HIGH_PATTERNS) {
    if (re.test(opStr)) return { level: "HIGH", matched: re.toString() };
  }
  return { level: "LOW", matched: null };
}

function main() {
  const startMs = Date.now();
  let input = {};
  try {
    input = JSON.parse(process.argv[2] || "{}");
  } catch {
    input = { operation: process.argv.slice(2).join(" ") };
  }

  const op = (input.operation || input.cmd || "").toString();
  const userConfirmed = input.user_confirmed === true;
  const { level, matched } = classify(op);

  // passes 规则：
  //   LOW       → passes=true（可继续）
  //   HIGH      → 需 user_confirmed=true 才 passes
  //   CRITICAL  → 必须 user_confirmed=true 才 passes（且必须是当前会话明确给）
  let passes;
  let reason;
  if (level === "LOW") {
    passes = true;
    reason = "操作未命中风险黑名单，可继续";
  } else if (level === "HIGH") {
    passes = userConfirmed;
    reason = userConfirmed
      ? `${level} 操作已获用户确认`
      : `${level} 操作 (${matched}) 必须先获用户确认`;
  } else {
    passes = userConfirmed;
    reason = userConfirmed
      ? `${level} 操作已获用户明确确认`
      : `${level} 操作 (${matched}) 强制 ABORT；需用户原话回复"确认执行"`;
  }

  const result = {
    phase: PHASE,
    passes,
    summary: `${level} · ${reason}`,
    output: {
      operation: op.slice(0, 200),
      level,
      pattern_matched: matched,
      user_confirmed: userConfirmed,
      action: passes
        ? "PROCEED（继续执行）"
        : level === "CRITICAL"
          ? "ABORT — 等用户原话确认"
          : "PAUSE — 列出风险后等确认",
    },
    duration_ms: Date.now() - startMs,
    errors: passes ? [] : [`risk_${level.toLowerCase()}_unconfirmed`],
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
  // CRITICAL 不通过时 exit code 非 0，方便 shell 链路 abort
  if (!passes && level === "CRITICAL") process.exit(3);
}

main();
