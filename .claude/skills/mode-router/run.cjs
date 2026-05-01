"use strict";
const fs = require("fs");
const path = require("path");

const SKILL_DIR = __dirname;
const PROJECT_DIR = path.resolve(SKILL_DIR, "..", "..", "..");
const ROUTER_LOG = path.join(PROJECT_DIR, "_meta", "mode-router-log.jsonl");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");

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

// --- detection ---
function detectAndRoute(taskDesc) {
  if (!isClaudeLLM()) {
    return {
      mode: "solo",
      team_type: null,
      forced: true,
      reason: "LLM 不支持 Agent spawning，自动降级",
      warning: "⚠️ team mode 不可用 → solo fallback（检测到非 Claude 模型）",
      parallel_hits: [],
      review_hits: [],
      explicit_override: null,
      llm_is_claude: false,
    };
  }
  const soloHits = matchAll(taskDesc, SOLO_PATS);
  const teamHits = matchAll(taskDesc, TEAM_PATS);
  const parallelHits = matchAll(taskDesc, PARALLEL_PATS);
  const reviewHits = matchAll(taskDesc, REVIEW_PATS);

  if (soloHits.length > 0) {
    return {
      mode: "solo",
      team_type: null,
      forced: false,
      warning: null,
      reason: "用户显式指定 solo 模式",
      parallel_hits: parallelHits,
      review_hits: reviewHits,
      explicit_override: "solo",
      llm_is_claude: true,
    };
  }
  if (teamHits.length > 0) {
    const tt =
      reviewHits.length > parallelHits.length ? "peer_review" : "subagent";
    return {
      mode: "team",
      team_type: tt,
      forced: false,
      warning: null,
      reason: "用户显式指定 team 模式",
      parallel_hits: parallelHits,
      review_hits: reviewHits,
      explicit_override: "team",
      llm_is_claude: true,
    };
  }
  if (parallelHits.length > 0) {
    return {
      mode: "team",
      team_type: "subagent",
      forced: false,
      warning: null,
      reason: `检测到并行拆分信号：${parallelHits.slice(0, 3).join("、")}`,
      parallel_hits: parallelHits,
      review_hits: reviewHits,
      explicit_override: null,
      llm_is_claude: true,
    };
  }
  if (reviewHits.length > 0) {
    return {
      mode: "team",
      team_type: "peer_review",
      forced: false,
      warning: null,
      reason: `检测到审查信号：${reviewHits.slice(0, 3).join("、")}`,
      parallel_hits: [],
      review_hits: reviewHits,
      explicit_override: null,
      llm_is_claude: true,
    };
  }
  return {
    mode: "solo",
    team_type: null,
    forced: false,
    warning: null,
    reason: "未检测到并行或审查信号，默认 solo",
    parallel_hits: [],
    review_hits: [],
    explicit_override: null,
    llm_is_claude: true,
  };
}

// --- output ---
function printRecommendation(taskDesc, r) {
  const snip = taskDesc.length > 42 ? taskDesc.slice(0, 42) + "..." : taskDesc;
  const modeStr = r.mode === "solo" ? "SOLO" : `TEAM (${r.team_type})`;
  const badge = r.forced ? "[强制]" : r.explicit_override ? "[显式]" : "[推荐]";
  const TEAM_FORMS = {
    subagent: "派出并行 subagent 分别执行拆分任务",
    peer_review: "Agent A 实现 → Agent B 独立 review",
  };

  const lines = [
    "",
    "┌─ mode-router ──────────────────────────────┐",
    `│ 任务：${snip}`,
    "├────────────────────────────────────────────┤",
  ];
  if (r.warning) {
    lines.push(`│ ${r.warning}`);
    lines.push("├────────────────────────────────────────────┤");
  }
  lines.push(`│ 路由结果：${modeStr} ${badge}`);
  lines.push(`│ 原因：${r.reason}`);
  if (r.mode === "team" && TEAM_FORMS[r.team_type]) {
    lines.push(`│ 形式：${TEAM_FORMS[r.team_type]}`);
  }
  lines.push("└────────────────────────────────────────────┘");
  if (!r.forced && !r.explicit_override) {
    lines.push("");
    lines.push("↑ 向用户展示推荐，确认后用 --log 记录决策。");
  }
  console.log(lines.join("\n"));
}

// --- log helpers ---
function safeAppend(logPath, obj) {
  const line = JSON.stringify(obj);
  JSON.parse(line); // validate
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line + "\n", "utf-8");
}

function buildRouterEntry(taskDesc, r, confirmed, userOverride) {
  return {
    run_id: nowBJ(),
    task_desc: taskDesc.slice(0, 200),
    mode: r.mode,
    team_type: r.team_type || null,
    reason: r.reason,
    forced: r.forced || false,
    confirmed,
    parallel_signals_hit: r.parallel_hits || [],
    review_signals_hit: r.review_hits || [],
    explicit_override: r.explicit_override || null,
    llm_is_claude: r.llm_is_claude !== false,
    user_override: userOverride || null,
    timestamp_ms: Date.now(),
  };
}

function buildRunEntry(taskDesc, r, confirmed) {
  return {
    run_id: nowBJ(),
    skill: "mode-router",
    mode: r.mode,
    team_type: r.team_type || null,
    forced: r.forced || false,
    confirmed,
    task_snippet: taskDesc.slice(0, 80),
    user_feedback: { rating: null, fix_notes: null },
  };
}

// --- subcommands ---
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
    .map((l) => JSON.parse(l));
  const recent = entries.slice(-10);
  console.log(`\n最近 ${recent.length} 条路由记录：\n`);
  recent.forEach((e) => {
    const conf = e.confirmed === null ? "—" : e.confirmed ? "✅" : "❌";
    const modeStr = (e.mode + (e.team_type ? "/" + e.team_type : "")).padEnd(
      18,
    );
    console.log(
      `${e.run_id}  ${modeStr}  ${conf}  ${e.task_desc.slice(0, 40)}`,
    );
  });
}

function logDecision(args) {
  // --log "task" mode [team_type|true|false] [true|false]
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

  const synth = {
    mode,
    team_type,
    forced: false,
    reason: "手动记录",
    parallel_hits: [],
    review_hits: [],
    explicit_override: null,
    llm_is_claude: true,
  };
  safeAppend(ROUTER_LOG, buildRouterEntry(taskDesc, synth, confirmed, null));
  safeAppend(RUNS_LOG, buildRunEntry(taskDesc, synth, confirmed));
  console.log(
    `✅ 已记录：${mode}${team_type ? "/" + team_type : ""} confirmed=${confirmed}`,
  );
}

// --- main ---
function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--list") {
    showList();
    return;
  }
  if (args[0] === "--log") {
    logDecision(args.slice(1));
    return;
  }

  const taskDesc = args.join(" ").trim();
  if (!taskDesc) {
    console.error("用法：");
    console.error(
      '  node run.cjs "task description"                    # 分析并打印推荐',
    );
    console.error(
      '  node run.cjs --log "task" solo true                # 记录 solo 决策',
    );
    console.error(
      '  node run.cjs --log "task" team subagent true       # 记录 team/subagent',
    );
    console.error(
      '  node run.cjs --log "task" team peer_review true    # 记录 team/peer_review',
    );
    console.error(
      "  node run.cjs --list                                # 查看最近记录",
    );
    process.exit(1);
  }

  const result = detectAndRoute(taskDesc);
  printRecommendation(taskDesc, result);

  // Auto-log for forced degradation or explicit overrides (no confirmation needed)
  if (result.forced || result.explicit_override) {
    safeAppend(ROUTER_LOG, buildRouterEntry(taskDesc, result, true, null));
    safeAppend(RUNS_LOG, buildRunEntry(taskDesc, result, true));
    console.log("\n（已自动记录到 _meta/mode-router-log.jsonl）");
  }
}

main();
