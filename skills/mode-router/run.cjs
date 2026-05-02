"use strict";
// mode-router/run.cjs v0.2 — 双阶段 solo/team 路由（接入 helix）
//
// 子命令：
//   --coarse "<task>"          Step 0.5：基于任务文本粗判（关键词 + 长度 + 跨域）
//   --fine '<json>'            Step 5.7：基于 a4 plan 信号细判（files_changed + steps + scope）
//   --list                     查看最近 10 条路由记录
//   --log "task" mode ...      手动记录（旧 v0.1 兼容）
//
// 决策维度（v0.2 加权评分，threshold ≥3 → team）：
//   显式 "team" 词 → +999（强制 team）
//   显式 "solo" 词 → -999（强制 solo）
//   并行词命中 → +2/词（最多 +4）
//   审查词命中 → +2（peer_review 路由）
//   跨前后端域 → +2
//   任务长度 >150 字 → +1
//   重构/迁移/upgrade 词 → +1
//   plan.files_changed > 5 → +2，>10 → +3（fine）
//   plan.steps > 8 → +1，>15 → +2（fine）
//
// 接入 helix：每次 --coarse / --fine 都向 helix --report 上报，进 helix-runs.jsonl

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const ROUTER_LOG = path.join(PROJECT_DIR, "_meta", "mode-router-log.jsonl");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");

// --- signal patterns ---
const PARALLEL_PATS = [
  "并行",
  "前端.*后端",
  "后端.*前端",
  "同时做",
  "同步进行",
  "拆分",
  "多模块",
  "分别做",
  "parallel",
];
const REVIEW_PATS = [
  "review",
  "审查",
  "审核",
  "一写一审",
  "code review",
  "审阅",
  "独立.*审",
];
const SOLO_PATS = ["\\bsolo\\b", "单.*模式", "solo 跑", "单 agent"];
const TEAM_PATS = ["\\bteam\\b", "team 模式", "团队.*模式", "多 agent"];
const REFACTOR_PATS = [
  "重构",
  "refactor",
  "迁移",
  "migration",
  "upgrade",
  "升级",
  "重写",
];
const FRONTEND_PATS = [
  "前端",
  "frontend",
  "ui",
  "react",
  "vue",
  "页面",
  "组件",
];
const BACKEND_PATS = ["后端", "backend", "api", "数据库", "database", "server"];

function matchAll(text, pats) {
  return pats.filter((p) => new RegExp(p, "i").test(text));
}

function isClaudeLLM() {
  const m = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || "";
  return m === "" || /claude/i.test(m);
}

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

// --- v0.2 multi-dim scorer ---
function score(taskDesc, planSignals) {
  const text = String(taskDesc || "");
  const breakdown = {};
  let total = 0;

  const soloHits = matchAll(text, SOLO_PATS);
  const teamHits = matchAll(text, TEAM_PATS);
  const parallelHits = matchAll(text, PARALLEL_PATS);
  const reviewHits = matchAll(text, REVIEW_PATS);
  const refactorHits = matchAll(text, REFACTOR_PATS);
  const feHits = matchAll(text, FRONTEND_PATS);
  const beHits = matchAll(text, BACKEND_PATS);

  if (soloHits.length > 0) {
    breakdown.solo_explicit = -999;
    total = -999;
  } else if (teamHits.length > 0) {
    breakdown.team_explicit = 999;
    total = 999;
  } else {
    if (parallelHits.length > 0) {
      const v = Math.min(parallelHits.length * 2, 4);
      breakdown.parallel = v;
      total += v;
    }
    if (reviewHits.length > 0) {
      // review 任务天然适合 peer_review，加权 +3 直接达阈值
      breakdown.review = 3;
      total += 3;
    }
    if (feHits.length > 0 && beHits.length > 0) {
      breakdown.cross_domain = 2;
      total += 2;
    }
    if (text.length > 150) {
      breakdown.long_task = 1;
      total += 1;
    }
    if (refactorHits.length > 0) {
      breakdown.refactor = 1;
      total += 1;
    }
    if (planSignals) {
      const files = Number(planSignals.files_changed_count || 0);
      const steps = Number(planSignals.steps_count || 0);
      if (files > 10) {
        breakdown.files_many = 3;
        total += 3;
      } else if (files > 5) {
        breakdown.files_some = 2;
        total += 2;
      }
      if (steps > 15) {
        breakdown.steps_many = 2;
        total += 2;
      } else if (steps > 8) {
        breakdown.steps_some = 1;
        total += 1;
      }
    }
  }

  let mode, team_type;
  if (total <= -999) {
    mode = "solo";
    team_type = null;
  } else if (total >= 999 || total >= 3) {
    mode = "team";
    team_type =
      reviewHits.length > parallelHits.length ? "peer_review" : "subagent";
  } else {
    mode = "solo";
    team_type = null;
  }

  return {
    mode,
    team_type,
    score: total,
    threshold: 3,
    breakdown,
    signals: {
      solo: soloHits,
      team: teamHits,
      parallel: parallelHits,
      review: reviewHits,
      refactor: refactorHits,
      frontend: feHits,
      backend: beHits,
    },
  };
}

// v0.2 — 100% 精确执行强化：mode=team 时直接产出 team_plan（具体 Agent 调用清单）
// + enforcement（硬契约指令），减少 LLM 决策空间
function buildTeamPlan(taskDesc, planSignals, s) {
  if (s.mode !== "team") return null;
  const tt = s.team_type;
  const taskShort = String(taskDesc || "").slice(0, 200);
  if (tt === "peer_review") {
    return {
      shape: "peer_review",
      agents: [
        {
          role: "implementer",
          subagent_type: "general-purpose",
          description: "实现任务",
          prompt: `按 plan 实现以下任务（不做 review，只实现）：\n${taskShort}\n\n要求：\n- 严格按 a4 plan 改动文件\n- 每个文件改完输出 ✅\n- 完成后产出"实现摘要"（修改清单 + 设计取舍）`,
        },
        {
          role: "reviewer",
          subagent_type: "ecc:code-reviewer",
          description: "独立 review",
          prompt: `独立 review 上一个 agent 的实现（你看不到他的思路，只看代码 diff + 任务描述）：\n${taskShort}\n\n输出：\n- CRITICAL/HIGH/MEDIUM 问题清单\n- 至少 3 个具体改进建议\n- 通过/不通过判定`,
        },
      ],
    };
  }
  // subagent (parallel)：基于 plan 信号决定 fan-out 数
  const fanOut = (() => {
    const f = Number((planSignals && planSignals.files_changed_count) || 0);
    if (f > 10) return 3;
    if (f > 5) return 2;
    return 2;
  })();
  return {
    shape: "subagent_parallel",
    fan_out: fanOut,
    agents: Array.from({ length: fanOut }).map((_, i) => ({
      role: `worker_${i + 1}`,
      subagent_type: "general-purpose",
      description: `并行分片 ${i + 1}/${fanOut}`,
      prompt: `你是 ${fanOut} 个并行 worker 之一（编号 ${i + 1}）。任务总览：\n${taskShort}\n\n你负责的分片：[等 LLM 在 0.5/5.7 之后按 plan.files_changed 拆分给你]\n\n要求：\n- 只改自己分片范围内的文件\n- 不读不改其他分片\n- 完成后产出"分片摘要"`,
    })),
  };
}

function buildEnforcement(r) {
  if (r.mode === "solo") {
    return {
      level: "MUST",
      directive: "立即按 solo 模式执行：a5-executor 接 plan 直接逐文件改",
      forbid: [
        "禁止调用 Agent tool 派 subagent（mode=solo 时若 a5 入参含 subagent_run_ids → passes=false）",
      ],
      a5_required_input: {
        mode: "solo",
        subagent_run_ids: "[] (必须为空数组)",
      },
    };
  }
  // team
  return {
    level: "MUST",
    directive: `立即按 team/${r.team_type} 模式执行：你必须**调 Agent tool**派 ${r.team_type === "peer_review" ? "2 个" : "≥2 个"} subagent，按 team_plan.agents 的 subagent_type / prompt 配置`,
    steps: [
      "1. 读 mode-router --fine 输出的 team_plan.agents 数组",
      "2. 对每个 agent 调一次 Agent tool（subagent_type + prompt）",
      "3. 收集每个 agent 返回的 result（用其内部生成的 ID 或自定义 run_id 标识）",
      "4. 把 ID 列表填进 a5-executor 入参的 subagent_run_ids[]",
      "5. team_plan.shape='peer_review' 时必须串行（implementer → reviewer）；'subagent_parallel' 时并行（一个消息多个 Agent 调用）",
    ],
    forbid: [
      "禁止 solo 跑（mode=team 时若 a5 入参 subagent_run_ids 为空 → passes=false）",
      "禁止填假 ID（每个 ID 必须 ≥4 字符；事后写入 helix-runs.jsonl 留痕，人审兜底）",
    ],
    a5_required_input: {
      mode: "team",
      team_type: r.team_type,
      subagent_run_ids: "['<id1>', '<id2>', ...] (≥1 项，每项 ≥4 字符)",
    },
  };
}

function reasonFor(s) {
  if (s.breakdown.solo_explicit) return "用户显式指定 solo 模式";
  if (s.breakdown.team_explicit) return "用户显式指定 team 模式";
  if (s.mode === "team") {
    const reasons = [];
    if (s.breakdown.parallel)
      reasons.push(`并行信号(+${s.breakdown.parallel})`);
    if (s.breakdown.review) reasons.push(`审查信号(+3)`);
    if (s.breakdown.cross_domain) reasons.push("跨前后端域(+2)");
    if (s.breakdown.files_many) reasons.push("plan>10 文件(+3)");
    if (s.breakdown.files_some) reasons.push("plan>5 文件(+2)");
    if (s.breakdown.steps_many) reasons.push("plan>15 步(+2)");
    if (s.breakdown.steps_some) reasons.push("plan>8 步(+1)");
    if (s.breakdown.long_task) reasons.push("任务长(+1)");
    if (s.breakdown.refactor) reasons.push("重构/迁移(+1)");
    return `综合评分 ${s.score} ≥3 触发 team：${reasons.join("、")}`;
  }
  return `综合评分 ${s.score} <3，默认 solo`;
}

// --- output ---
function printRecommendation(taskDesc, r, stage) {
  const snip = taskDesc.length > 42 ? taskDesc.slice(0, 42) + "..." : taskDesc;
  const modeStr = r.mode === "solo" ? "SOLO" : `TEAM (${r.team_type})`;
  const stageBadge =
    stage === "coarse"
      ? "[Step 0.5 粗判]"
      : stage === "fine"
        ? "[Step 5.7 细判]"
        : "";
  const TEAM_FORMS = {
    subagent:
      "派出并行 subagent 分别执行（LLM 必须用 Agent tool 派 + 填 subagent_run_ids）",
    peer_review: "Agent A 实现 → Agent B 独立 review",
  };

  const lines = [
    "",
    `┌─ mode-router ${stageBadge} ────────────────────┐`,
    `│ 任务：${snip}`,
    `│ 评分：${r.score} (阈值 ${r.threshold})`,
    "├────────────────────────────────────────────┤",
    `│ 路由结果：${modeStr}`,
    `│ 原因：${r.reason}`,
  ];
  if (r.mode === "team" && TEAM_FORMS[r.team_type]) {
    lines.push(`│ 形式：${TEAM_FORMS[r.team_type]}`);
  }
  lines.push("└────────────────────────────────────────────┘");
  console.error(lines.join("\n"));
}

// --- log helpers ---
function safeAppend(logPath, obj) {
  const line = JSON.stringify(obj);
  JSON.parse(line);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line + "\n", "utf-8");
}

function reportToHelix(stage, result) {
  if (!fs.existsSync(HELIX_RUN)) return;
  const phase = stage === "coarse" ? "mode-router-coarse" : "mode-router-fine";
  const payload = {
    passes: true,
    summary: `${phase}: ${result.mode}${result.team_type ? "/" + result.team_type : ""} (score=${result.score})`,
    output: {
      mode: result.mode,
      team_type: result.team_type,
      score: result.score,
      reason: result.reason,
    },
    duration_ms: 0,
    errors: [],
  };
  spawnSync("node", [HELIX_RUN, "--report", phase, JSON.stringify(payload)], {
    stdio: "inherit",
    cwd: PROJECT_DIR,
  });
}

// --- subcommands ---
function cmdCoarse(taskDesc) {
  if (!isClaudeLLM()) {
    const r = {
      mode: "solo",
      team_type: null,
      score: 0,
      threshold: 3,
      forced: true,
      reason: "非 Claude 模型，team 不可用，强制 solo",
      signals: {},
      stage: "coarse",
    };
    console.log(JSON.stringify(r, null, 2));
    safeAppend(ROUTER_LOG, {
      ...r,
      run_id: nowBJ(),
      task_desc: taskDesc.slice(0, 200),
      timestamp_ms: Date.now(),
    });
    return;
  }
  const s = score(taskDesc, null);
  const r = {
    ...s,
    reason: reasonFor(s),
    stage: "coarse",
    enforcement: buildEnforcement(s),
    note: "粗判仅给 a4 提前打 buff，最终决策以 Step 5.7 细判为准（不可绕过）",
  };
  printRecommendation(taskDesc, r, "coarse");
  safeAppend(ROUTER_LOG, {
    run_id: nowBJ(),
    stage: "coarse",
    task_desc: taskDesc.slice(0, 200),
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    breakdown: r.breakdown,
    reason: r.reason,
    timestamp_ms: Date.now(),
  });
  safeAppend(RUNS_LOG, {
    run_id: nowBJ(),
    skill: "mode-router",
    stage: "coarse",
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    task_snippet: taskDesc.slice(0, 80),
    user_feedback: { rating: null, fix_notes: null },
  });
  reportToHelix("coarse", r);
  console.log(JSON.stringify(r, null, 2));
}

function cmdFine(jsonStr) {
  let input = {};
  try {
    input = JSON.parse(jsonStr || "{}");
  } catch (e) {
    console.error("[mode-router] --fine 入参 JSON 解析失败:", e.message);
    process.exit(2);
  }
  const taskDesc = String(input.task || input.task_desc || "");
  const planSignals = {
    files_changed_count: Number(input.files_changed_count || 0),
    steps_count: Number(input.steps_count || 0),
  };
  const s = score(taskDesc, planSignals);
  const r = {
    ...s,
    reason: reasonFor(s),
    stage: "fine",
    plan_signals: planSignals,
    enforcement: buildEnforcement(s),
    team_plan: buildTeamPlan(taskDesc, planSignals, s),
    contract: {
      enforcement_level: "MUST",
      a5_passes_requires:
        s.mode === "team"
          ? "subagent_run_ids 至少 1 个 ≥4 字符"
          : "subagent_run_ids 必须为空数组",
      bypass_allowed: false,
      finalize_consequence:
        "a5 不满足契约 → passes=false → finalize promise=NOT_COMPLETE",
    },
  };
  printRecommendation(taskDesc || "(plan based)", r, "fine");
  safeAppend(ROUTER_LOG, {
    run_id: nowBJ(),
    stage: "fine",
    task_desc: taskDesc.slice(0, 200),
    plan_signals: planSignals,
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    breakdown: r.breakdown,
    reason: r.reason,
    timestamp_ms: Date.now(),
  });
  safeAppend(RUNS_LOG, {
    run_id: nowBJ(),
    skill: "mode-router",
    stage: "fine",
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    files_changed_count: planSignals.files_changed_count,
    steps_count: planSignals.steps_count,
    task_snippet: taskDesc.slice(0, 80),
    user_feedback: { rating: null, fix_notes: null },
  });
  reportToHelix("fine", r);
  console.log(JSON.stringify(r, null, 2));
}

function showList() {
  if (!fs.existsSync(ROUTER_LOG)) {
    console.log("（暂无路由记录）");
    return;
  }
  const entries = fs
    .readFileSync(ROUTER_LOG, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const recent = entries.slice(-10);
  console.log(`\n最近 ${recent.length} 条路由记录：\n`);
  recent.forEach((e) => {
    const stage = e.stage || "v1";
    const modeStr = (e.mode + (e.team_type ? "/" + e.team_type : "")).padEnd(
      18,
    );
    console.log(
      `${e.run_id}  [${stage}]  ${modeStr}  score=${e.score ?? "-"}  ${(e.task_desc || "").slice(0, 40)}`,
    );
  });
}

function cmdLogManual(args) {
  // 兼容 v0.1 --log "task" mode ...
  const taskDesc = args[0] || "";
  const mode = args[1] || "solo";
  let team_type = null;
  let confirmed = true;
  if (args[2] === "subagent" || args[2] === "peer_review") {
    team_type = args[2];
    confirmed = args[3] !== "false";
  } else if (args[2] === "true" || args[2] === "false") {
    confirmed = args[2] === "true";
  }
  safeAppend(ROUTER_LOG, {
    run_id: nowBJ(),
    stage: "manual",
    task_desc: taskDesc.slice(0, 200),
    mode,
    team_type,
    confirmed,
    reason: "手动记录",
    timestamp_ms: Date.now(),
  });
  safeAppend(RUNS_LOG, {
    run_id: nowBJ(),
    skill: "mode-router",
    stage: "manual",
    mode,
    team_type,
    confirmed,
    task_snippet: taskDesc.slice(0, 80),
    user_feedback: { rating: null, fix_notes: null },
  });
  console.log(
    `✅ 已记录：${mode}${team_type ? "/" + team_type : ""} confirmed=${confirmed}`,
  );
}

function usage() {
  console.error("Usage:");
  console.error(
    '  node skills/mode-router/run.cjs --coarse "<task description>"',
  );
  console.error(
    '  node skills/mode-router/run.cjs --fine \'{"task":"...","files_changed_count":N,"steps_count":N}\'',
  );
  console.error("  node skills/mode-router/run.cjs --list");
  console.error('  node skills/mode-router/run.cjs --log "task" solo true');
}

function main() {
  const args = process.argv.slice(2);
  const sub = args[0];
  if (sub === "--coarse") {
    cmdCoarse(args.slice(1).join(" "));
  } else if (sub === "--fine") {
    cmdFine(args[1] || "{}");
  } else if (sub === "--list") {
    showList();
  } else if (sub === "--log") {
    cmdLogManual(args.slice(1));
  } else if (sub && !sub.startsWith("--")) {
    // 兼容 v0.1：直接传 task → 等价 --coarse
    cmdCoarse(args.join(" "));
  } else {
    usage();
    process.exit(1);
  }
}

main();
