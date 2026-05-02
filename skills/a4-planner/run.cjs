"use strict";
// a4-planner/run.cjs — 骨架版
// passes 判定：input 含完整 TaskCard（type + scope + done_criteria）

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a4-planner";

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

function main() {
  const startMs = Date.now();
  let input = {};
  try {
    input = JSON.parse(process.argv[2] || "{}");
  } catch {}

  const card = input.task_card || input.taskCard || input;
  const required = ["type", "scope", "done_criteria"];
  const missing = required.filter(
    (k) =>
      !card[k] ||
      (Array.isArray(card[k]) && card[k].length === 0) ||
      (typeof card[k] === "string" && !card[k].trim()),
  );
  const passes = missing.length === 0;

  // helix Step 5.5 输出：把强匹配的 skill 名（含 namespace 前缀）暴露给 a5
  // 数据来源：LLM 在 5.5 阶段把强匹配 skill 列表写进 task_card.preferred_skills
  // 形如：["knowledge-curator", "lark-doc", "canghe-url-to-markdown"]
  const preferredSkills = Array.isArray(card.preferred_skills)
    ? card.preferred_skills.filter((s) => typeof s === "string" && s.trim())
    : [];

  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `TaskCard 校验通过（type=${card.type}, scope=${card.scope}），preferred_skills=${preferredSkills.length} 项，等 LLM 按 SKILL.md §2 出 2-3 个方案`
      : `TaskCard 缺字段：${missing.join(", ")}`,
    output: {
      task_card_validated: passes ? card : null,
      missing_fields: missing,
      preferred_skills: preferredSkills,
      next_step: passes
        ? "LLM 按 a4-planner/SKILL.md §2 生成 PlanDoc（含推荐方案）；preferred_skills 必须透传到 a5-executor 入参"
        : "回到 a1-task-understander 补全 TaskCard",
    },
    duration_ms: Date.now() - startMs,
    errors: passes ? [] : missing.map((f) => `missing_${f}`),
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
