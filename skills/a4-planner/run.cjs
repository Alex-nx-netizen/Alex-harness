"use strict";
// a4-planner/run.cjs — 骨架版
// passes 判定：input 含完整 TaskCard（type + scope + done_criteria）

const fs = require("fs");
const path = require("path");
const { nowBJ } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a4-planner";

// v0.7 C2：phase 链动态化（论文 §6⑤）
// 输入：task_card.type，输出：本次该跑的 phase 列表（mode-router-coarse 始终在最前）
function composePhasesByType(type) {
  const t = (type || "").toLowerCase();
  if (t === "research") {
    // 研究类：只认知/检索，不动代码（v0.8: research 仍保留 a3，唯一保留场景）
    return [
      "mode-router-coarse",
      "a1-task-understander",
      "a2-repo-sensor",
      "a3-retriever",
    ];
  }
  if (t === "design_consulting" || t === "design" || t === "consulting") {
    // 设计/咨询：跑到 a4 plan 出即可
    return [
      "mode-router-coarse",
      "a1-task-understander",
      "a2-repo-sensor",
      "a4-planner",
    ];
  }
  if (t === "feature" || t === "refactor" || t === "bugfix") {
    // v0.8 #6/#12: mode-router-coarse 已从主链移除（数据：99% 是自检），fine 单独决策即可
    return [
      "a1-task-understander",
      "a2-repo-sensor",
      "a4-planner",
      "mode-router-fine",
      "a5-executor",
      "code-review", // v0.7.2: 质量元（专业开发者视角），soft 失败
      "a6-validator",
      "meta-audit",
      "a7-explainer",
    ];
  }
  // 默认：全链（最安全）
  return [
    "a1-task-understander",
    "a2-repo-sensor",
    "a4-planner",
    "mode-router-fine",
    "a5-executor",
    "code-review", // v0.7.2: 同上
    "a6-validator",
    "meta-audit",
    "a7-explainer",
  ];
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

  // v0.7 C2：phase 链由任务 type 动态决定
  // research        → 只跑认知/检索阶段，不动代码（无 a5/a6/a7/meta-audit）
  // design_consulting → 纯文档/方案，跑到 a4 即可
  // feature/refactor/bugfix → 全 phase 链 + meta-audit
  // 其它/unknown    → 全 phase 链（默认安全）
  const composedPhases = composePhasesByType(card.type);

  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `TaskCard 校验通过（type=${card.type}, scope=${card.scope}），preferred_skills=${preferredSkills.length} 项，composedPhases=${composedPhases.length}，等 LLM 按 SKILL.md §2 出 2-3 个方案`
      : `TaskCard 缺字段：${missing.join(", ")}`,
    output: {
      task_card_validated: passes ? card : null,
      missing_fields: missing,
      preferred_skills: preferredSkills,
      composedPhases,
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
