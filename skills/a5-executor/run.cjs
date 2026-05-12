"use strict";
// a5-executor/run.cjs — 骨架版
// passes 判定（v0.6.1，兼容二层 manager_worker）：
//   1. input 含 PlanDoc
//   2. 用户已确认（confirmed=true）
//   3. 若 preferred_skills 非空，skills_used 必须覆盖至少 1 项（5.5 闭环：禁止绕过强匹配 skill）
//   4. 若 mode 给定（来自 5.7 mode-router --fine 输出）：
//      - mode=team → subagent_run_ids 必须 ≥1 个 ≥4 字符（不允许绕过）
//        · 若 team_plan.shape=="manager_worker"：此处的 ID 总数 = manager + workers（≥1 即可，
//          通常 ≥1+fan_out；manager 自己也算一个 subagent run）
//        · 若 team_plan.shape=="subagent_parallel"：此处的 ID 数应等于 fan_out
//        · 若 team_plan.shape=="peer_review"：通常 2 个（implementer + reviewer）
//      - mode=solo → subagent_run_ids 必须为空（防伪派 team）
// 真正执行（改文件）由 LLM 按 SKILL.md + a8-risk-guard 配合完成。

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a5-executor";

// v0.8 #10：与 helix/run.cjs stableHash 保持一致
function stableHash(obj) {
  if (!obj || typeof obj !== "object") return null;
  const sorted = (o) => {
    if (Array.isArray(o)) return o.map(sorted);
    if (o && typeof o === "object") {
      return Object.keys(o)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sorted(o[k]);
          return acc;
        }, {});
    }
    return o;
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sorted(obj)))
    .digest("hex")
    .slice(0, 16);
}

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

  const plan = input.plan || input.plan_doc || input.planDoc;
  const hasPlan =
    !!plan && (typeof plan === "object" || typeof plan === "string");
  const confirmed = input.user_confirmed === true || input.confirmed === true;
  const filesChanged = Array.isArray(input.files_changed)
    ? input.files_changed
    : [];

  // 5.5 闭环：preferred_skills（来自 a4-planner.output.preferred_skills 或 task_card 直传）
  // skills_used：LLM 调用 a5 时必须填，列出本次实际调用的 skill 名（含 namespace）
  const preferredSkills = Array.isArray(input.preferred_skills)
    ? input.preferred_skills.filter((s) => typeof s === "string" && s.trim())
    : [];
  const skillsUsed = Array.isArray(input.skills_used)
    ? input.skills_used.filter((s) => typeof s === "string" && s.trim())
    : [];
  const skillsBypassedReason =
    typeof input.skills_bypassed_reason === "string"
      ? input.skills_bypassed_reason.trim()
      : "";

  // 覆盖判定：preferred 中至少 1 个出现在 used 里（前缀匹配，容许 ecc:foo 匹配 foo 等变体）
  const norm = (s) => s.toLowerCase().trim();
  const usedNorm = skillsUsed.map(norm);
  const coveredAny =
    preferredSkills.length === 0 ||
    preferredSkills.some((p) => {
      const np = norm(p);
      return usedNorm.some(
        (u) => u === np || u.endsWith(":" + np) || np.endsWith(":" + u),
      );
    });

  // 允许显式声明绕过（必须给出 reason 至少 10 字符）——便于"扫过都不匹配"的合规留笔
  const explicitBypass =
    preferredSkills.length > 0 &&
    !coveredAny &&
    skillsBypassedReason.length >= 10;

  const skillsCheckPasses = coveredAny || explicitBypass;

  // v0.6.0 5.7 闭环：mode 硬契约（不允许绕过）
  // mode 来自 5.7 mode-router --fine 输出；缺失视为兼容旧任务 → 跳过检查
  const mode =
    typeof input.mode === "string" && /^(solo|team)$/.test(input.mode)
      ? input.mode
      : null;
  const teamType = typeof input.team_type === "string" ? input.team_type : null;
  // v0.6.1：可选 shape 透传（manager_worker / subagent_parallel / peer_review），仅日志展示
  const shape =
    typeof input.shape === "string" &&
    /^(manager_worker|subagent_parallel|peer_review)$/.test(input.shape)
      ? input.shape
      : null;
  const subagentRunIds = Array.isArray(input.subagent_run_ids)
    ? input.subagent_run_ids.filter(
        (s) => typeof s === "string" && s.trim().length >= 4,
      )
    : [];

  let modeCheckPasses = true;
  let modeReason = null;
  if (mode === "team") {
    if (subagentRunIds.length < 1) {
      modeCheckPasses = false;
      modeReason = "team_mode_no_subagents";
    }
  } else if (mode === "solo") {
    if (subagentRunIds.length > 0) {
      modeCheckPasses = false;
      modeReason = "solo_mode_with_subagents";
    }
  }
  // mode === null → 旧任务，向后兼容，跳过检查

  const passes = hasPlan && confirmed && skillsCheckPasses && modeCheckPasses;

  let failReason = null;
  if (!hasPlan) failReason = "missing_plan";
  else if (!confirmed) failReason = "missing_user_confirmation";
  else if (!skillsCheckPasses) failReason = "skipped_recommended_skill";
  else if (!modeCheckPasses) failReason = modeReason;

  const modeBadge = mode
    ? mode === "team"
      ? `team/${teamType || "?"}${shape ? "[" + shape + "]" : ""}[${subagentRunIds.length} agents]`
      : "solo"
    : "(无 mode 契约)";

  const summaryFor = () => {
    if (passes) {
      return `执行授权已获（plan + 用户确认 + skill 覆盖${preferredSkills.length ? `[${skillsUsed.length}/${preferredSkills.length}]` : "(无强匹配)"} + mode=${modeBadge}），LLM 按 SKILL.md 逐文件改`;
    }
    switch (failReason) {
      case "missing_plan":
        return "缺 plan，无法执行";
      case "missing_user_confirmation":
        return "缺用户确认（不在确认前执行 — Ralph 反对自宣告）";
      case "skipped_recommended_skill":
        return `绕过了 5.5 强匹配 skill（preferred=[${preferredSkills.join(",")}], used=[${skillsUsed.join(",")}]）。要么调用其中 ≥1 个；要么传 skills_bypassed_reason 写明 ≥10 字符的绕过理由。`;
      case "team_mode_no_subagents":
        return `5.7 mode-router 判定 mode=team/${teamType || "?"} 但 subagent_run_ids 为空。LLM 必须用 Agent tool 派 ≥1 个 subagent，并把返回 ID 填进 subagent_run_ids[]。**100% 精确契约不允许绕过**。`;
      case "solo_mode_with_subagents":
        return `5.7 mode-router 判定 mode=solo 但 subagent_run_ids 非空（${subagentRunIds.length} 个）。solo 模式禁止派 team——若任务真需要并行，回到 5.7 重判。`;
      default:
        return "未知失败";
    }
  };

  // v0.8 #10：透传 task_card hash 给 helix --report 校验单源契约
  // a5 入参可选 input.task_card；若提供，算 hash 透传；helix 校验是否与 a4 锁定一致
  const taskCardHash = input.task_card ? stableHash(input.task_card) : null;

  const result = {
    phase: PHASE,
    passes,
    summary: summaryFor(),
    output: {
      plan_received: hasPlan,
      user_confirmed: confirmed,
      files_changed: filesChanged,
      preferred_skills: preferredSkills,
      skills_used: skillsUsed,
      skills_bypassed_reason: skillsBypassedReason || null,
      skills_check: {
        covered_any: coveredAny,
        explicit_bypass: explicitBypass,
        passes: skillsCheckPasses,
      },
      mode,
      team_type: teamType,
      shape,
      subagent_run_ids: subagentRunIds,
      task_card_hash: taskCardHash,
      mode_check: {
        passes: modeCheckPasses,
        reason: modeReason,
      },
      next_step: passes
        ? "LLM 按 plan 逐 file 改；破坏性操作前 inject a8-risk-guard"
        : failReason === "skipped_recommended_skill"
          ? "回 a4-planner 修计划用上 preferred_skills，或重跑 a5 时传 skills_bypassed_reason"
          : failReason === "team_mode_no_subagents"
            ? "调 Agent tool 派 ≥1 subagent，把返回 ID 填进 subagent_run_ids[] 后重跑 a5"
            : failReason === "solo_mode_with_subagents"
              ? "清空 subagent_run_ids 重跑 a5；或回 5.7 重判 mode"
              : "等用户在 helix Step 6 确认 plan",
    },
    duration_ms: Date.now() - startMs,
    errors: passes ? [] : [failReason],
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
