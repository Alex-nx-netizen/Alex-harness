"use strict";
// mode-router/run.cjs v0.3 — 双阶段 solo/team 路由 + Manager-Worker 二层 + per-phase model tier
//
// 子命令：
//   --coarse "<task>"          Step 0.5：基于任务文本粗判（关键词 + 长度 + 跨域）
//   --fine '<json>'            Step 5.7：基于 a4 plan 信号细判（files_changed + steps + scope）
//   --list                     查看最近 10 条路由记录
//   --log "task" mode ...      手动记录（旧 v0.1 兼容）
//
// 决策维度（v0.3 加权评分，权重外置 config.json）：
//   显式 "team" 词 → +999（强制 team）
//   显式 "solo" 词 → -999（强制 solo）
//   并行词命中 → +2/词（最多 +4）
//   审查词命中 → +3（peer_review 路由）
//   跨前后端域 → +2
//   任务长度 >150 字 → +1
//   重构/迁移/upgrade 词 → +1
//   plan.files_changed > 5 → +2，>10 → +3（fine）
//   plan.steps > 8 → +1，>15 → +2（fine）
//
// v0.3 新增（论文 §6① §6⑧）：
//   - score ≥ 6 → shape = "manager_worker"（二层结构，论文 Organizational Mirroring）
//   - 3 ≤ score < 6 → shape = "subagent_parallel"（扁平 fan-out）
//   - 含 review 词 → shape = "peer_review"
//   - team_plan.agents[*].model：manager/planner=opus，worker/executor/reviewer=sonnet，explainer/summarizer=haiku
//
// 接入 helix：每次 --coarse / --fine 都向 helix --report 上报，进 helix-runs.jsonl

const fs = require("fs");
const path = require("path");
const { nowBJ, safeAppend } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const ROUTER_LOG = path.join(PROJECT_DIR, "_meta", "mode-router-log.jsonl");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const CONFIG_PATH = path.join(SKILL_DIR, "config.json");

// --- load externalized config ---
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`[mode-router] config.json missing at ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[mode-router] config.json parse failed: ${e.message}`);
  }
  // sanity defaults
  cfg.thresholds = cfg.thresholds || { team: 3, manager_worker: 6 };
  cfg.weights = cfg.weights || {};
  cfg.keywords = cfg.keywords || {};
  cfg.model_tiers = cfg.model_tiers || {};
  return cfg;
}

const CFG = loadConfig();

function matchAll(text, pats) {
  if (!Array.isArray(pats)) return [];
  return pats.filter((p) => new RegExp(p, "i").test(text));
}

function isClaudeLLM() {
  const m = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || "";
  return m === "" || /claude/i.test(m);
}

// --- v0.3 multi-dim scorer (config-driven) ---
function score(taskDesc, planSignals) {
  const text = String(taskDesc || "");
  const W = CFG.weights;
  const K = CFG.keywords;
  const breakdown = {};
  let total = 0;

  const soloHits = matchAll(text, K.solo);
  const teamHits = matchAll(text, K.team);
  const parallelHits = matchAll(text, K.parallel);
  const reviewHits = matchAll(text, K.review);
  const refactorHits = matchAll(text, K.refactor);
  const feHits = matchAll(text, K.frontend);
  const beHits = matchAll(text, K.backend);

  if (soloHits.length > 0) {
    breakdown.solo_explicit = W.explicit_solo;
    total = W.explicit_solo;
  } else if (teamHits.length > 0) {
    breakdown.team_explicit = W.explicit_team;
    total = W.explicit_team;
  } else {
    if (parallelHits.length > 0) {
      const v = Math.min(
        parallelHits.length * (W.parallel_per_hit || 2),
        W.parallel_max || 4,
      );
      breakdown.parallel = v;
      total += v;
    }
    if (reviewHits.length > 0) {
      // review 任务天然适合 peer_review，加权直接达阈值
      breakdown.review = W.review;
      total += W.review;
    }
    if (feHits.length > 0 && beHits.length > 0) {
      breakdown.cross_domain = W.frontend_backend_cross;
      total += W.frontend_backend_cross;
    }
    const longTaskChars = (CFG.thresholds && CFG.thresholds.long_task_chars) || 100;
    if (text.length > longTaskChars) {
      breakdown.long_task = W.long_task;
      total += W.long_task;
    }
    if (refactorHits.length > 0) {
      breakdown.refactor = W.refactor;
      total += W.refactor;
    }
    if (planSignals) {
      const files = Number(planSignals.files_changed_count || 0);
      const steps = Number(planSignals.steps_count || 0);
      if (files > 10) {
        breakdown.files_many = W.files_many_15;
        total += W.files_many_15;
      } else if (files > 5) {
        breakdown.files_some = W.files_many_5;
        total += W.files_many_5;
      }
      if (steps > 15) {
        breakdown.steps_many = W.steps_many_15;
        total += W.steps_many_15;
      } else if (steps > 8) {
        breakdown.steps_some = W.steps_many_8;
        total += W.steps_many_8;
      }
    }
  }

  let mode, team_type;
  const teamThreshold = CFG.thresholds.team || 3;
  if (total <= -999) {
    mode = "solo";
    team_type = null;
  } else if (total >= 999 || total >= teamThreshold) {
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
    threshold: teamThreshold,
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

// v0.3 — Manager-Worker 二层（论文 §6①）
// shape 决策：
//   review 词 → "peer_review"（implementer + reviewer 串行）
//   score ≥ thresholds.manager_worker (默认 6) → "manager_worker"（manager + workers 二层委派）
//   else → "subagent_parallel"（扁平 fan-out）
function buildTeamPlan(taskDesc, planSignals, s) {
  if (s.mode !== "team") return null;
  const tt = s.team_type;
  const taskShort = String(taskDesc || "").slice(0, 200);
  const MT = CFG.model_tiers || {};
  const mwThreshold = CFG.thresholds.manager_worker || 6;

  if (tt === "peer_review") {
    return {
      shape: "peer_review",
      agents: [
        {
          role: "implementer",
          subagent_type: "general-purpose",
          model: MT.executor_role || "sonnet",
          description: "实现任务",
          prompt: `按 plan 实现以下任务（不做 review，只实现）：\n${taskShort}\n\n要求：\n- 严格按 a4 plan 改动文件\n- 每个文件改完输出 ✅\n- 完成后产出"实现摘要"（修改清单 + 设计取舍）`,
        },
        {
          role: "reviewer",
          subagent_type: "ecc:code-reviewer",
          model: MT.reviewer_role || "sonnet",
          description: "独立 review",
          prompt: `独立 review 上一个 agent 的实现（你看不到他的思路，只看代码 diff + 任务描述）：\n${taskShort}\n\n输出：\n- CRITICAL/HIGH/MEDIUM 问题清单\n- 至少 3 个具体改进建议\n- 通过/不通过判定`,
        },
      ],
    };
  }

  // subagent / manager_worker：基于 score 和 plan 信号决定 shape + fan-out 数
  const fanOut = (() => {
    const f = Number((planSignals && planSignals.files_changed_count) || 0);
    if (f > 10) return 3;
    if (f > 5) return 2;
    return 2;
  })();

  if (s.score >= mwThreshold) {
    // 二层：manager + N workers as subordinates
    const workers = Array.from({ length: fanOut }).map((_, i) => ({
      role: `worker_${i + 1}`,
      subagent_type: "general-purpose",
      model: MT.worker_role || "sonnet",
      description: `manager 分派的 worker ${i + 1}/${fanOut}`,
      prompt: `你是 manager 分派给你的 worker（编号 ${i + 1}/${fanOut}）。\n任务总览：\n${taskShort}\n\n你只负责 manager 在派发时给你的具体分片（manager 会基于 plan.files_changed 拆分）。\n\n要求：\n- 只改自己分片范围内的文件，不读不改其他分片\n- 改完输出"分片摘要"（修改清单 + 设计取舍）回报给 manager\n- 遇到边界冲突或不确定 → 回 manager 协调，不要私自扩大范围`,
    }));
    return {
      shape: "manager_worker",
      fan_out: fanOut,
      agents: [
        {
          role: "manager",
          subagent_type: "general-purpose",
          model: MT.manager_role || "opus",
          description: `manager：拆任务给 ${fanOut} 个 worker + 汇总产出`,
          prompt: `你是这个团队的 manager（论文 Organizational Mirroring 二层委派）。\n任务总览：\n${taskShort}\n\n你的职责：\n1. **拆分**：按 plan.files_changed 把任务切成 ${fanOut} 个互不重叠的分片，每个分片明确：(a) 该分片负责的文件列表 (b) done_criteria (c) 不可碰的边界\n2. **派发**：调 Agent tool 派 ${fanOut} 个 worker（subagent_type 见 subordinates[].subagent_type；prompt 用 subordinates[i].prompt + 你拆好的具体分片）\n3. **汇总**：收集每个 worker 的"分片摘要"，做一致性检查（边界冲突？重复改？遗漏？）\n4. **回报**：产出 manager 摘要 = (a) 各分片完成状态 (b) 跨分片的不一致点和如何裁决 (c) 整体 done_criteria 是否满足\n\n禁止：\n- 自己动手改文件（你只协调；改文件由 worker 干）\n- 信息黑盒：每个 worker 的输入 / 输出都要在你的 manager 摘要里可追溯`,
          subordinates: workers,
        },
      ],
    };
  }

  // 扁平：3 ≤ score < manager_worker_threshold
  return {
    shape: "subagent_parallel",
    fan_out: fanOut,
    agents: Array.from({ length: fanOut }).map((_, i) => ({
      role: `worker_${i + 1}`,
      subagent_type: "general-purpose",
      model: MT.worker_role || "sonnet",
      description: `并行分片 ${i + 1}/${fanOut}`,
      prompt: `你是 ${fanOut} 个并行 worker 之一（编号 ${i + 1}）。任务总览：\n${taskShort}\n\n你负责的分片：[等 LLM 在 0.5/5.7 之后按 plan.files_changed 拆分给你]\n\n要求：\n- 只改自己分片范围内的文件\n- 不读不改其他分片\n- 完成后产出"分片摘要"`,
    })),
  };
}

// v0.9.1：把 team_plan.agents 抽成 LLM-targeted "AGENT_DISPATCH" 块——直接告诉 Claude 该怎么调 Agent tool
// 这是 mode-router → 真 team 执行闭环的核心：让推荐 → 调度 之间不再是空气
function buildAgentDispatchPlan(r, runId) {
  if (r.mode !== "team" || !r.team_plan) return null;
  const shape = r.team_plan.shape;
  const agents = r.team_plan.agents || [];

  // 展平 manager_worker 的 subordinates 一起算 dispatch 总数
  let dispatchCount = agents.length;
  if (shape === "manager_worker") {
    const mgr = agents[0];
    const subs = (mgr && mgr.subordinates) || [];
    dispatchCount = 1 + subs.length;
  }

  const directive =
    shape === "peer_review"
      ? `你（Claude）必须**串行**调 Agent tool 2 次：先 implementer → 等其完成 → 再 reviewer（独立看 diff）`
      : shape === "manager_worker"
        ? `你（Claude）必须**先**调 Agent tool 1 次（manager），让它内部协调；不要直接派 worker——manager 会拆分后再调 ${dispatchCount - 1} 个 worker`
        : `你（Claude）必须**并行**调 Agent tool ${dispatchCount} 次（一条消息里多个 Agent 调用块）`;

  const agentSpecs = agents.map((a) => ({
    description: a.description || a.role || "subagent",
    subagent_type: a.subagent_type || "general-purpose",
    model: a.model || "sonnet",
    prompt_summary: (a.prompt || "").slice(0, 240) + (a.prompt && a.prompt.length > 240 ? "..." : ""),
    full_prompt: a.prompt || "",
    ...(a.subordinates ? { subordinates: a.subordinates.length } : {}),
  }));

  return {
    blocking: true,
    must_act: true,
    rule_source: "mode-router v0.9.1 闭环硬契约 — 见 CLAUDE.md '反 mode-router 空挂' 段",
    shape,
    fan_out: r.team_plan.fan_out || agents.length,
    dispatch_count: dispatchCount,
    directive,
    dispatch_steps:
      shape === "peer_review"
        ? [
            "1. 调 Agent tool（subagent_type=general-purpose）— implementer，按 agent_specs[0].full_prompt 派",
            "2. 等 implementer 返回后，调 Agent tool — reviewer（subagent_type=ecc:code-reviewer or general-purpose），按 agent_specs[1].full_prompt 派",
            "3. 跑 node skills/mode-router/run.cjs --record-dispatch '" + runId + "' <impl_id>,<rev_id>",
          ]
        : shape === "manager_worker"
          ? [
              "1. 调 1 次 Agent tool（manager，subagent_type=general-purpose, model=opus），按 agent_specs[0].full_prompt + agent_specs[0].subordinates 数派",
              "2. manager 内部会再调 N 个 worker——你不需要自己派",
              "3. 收到 manager 摘要后，跑 node skills/mode-router/run.cjs --record-dispatch '" + runId + "' <manager_id>,<worker1_id>,...",
            ]
          : [
              `1. 在**一条消息**里调 ${dispatchCount} 个 Agent tool 块（并行），分别按 agent_specs[i].full_prompt 派`,
              `2. 每个 Agent 的 subagent_type / model 见 agent_specs[i]`,
              "3. 收到所有 worker 返回后，跑 node skills/mode-router/run.cjs --record-dispatch '" + runId + "' <id1>,<id2>,...",
            ],
    agent_specs: agentSpecs,
    forbid: [
      "禁止直接 solo 干活（mode=team 推荐时这样做 = 推荐空挂，违反 v0.9.1 闭环契约）",
      "禁止填假 ID 来 --record-dispatch（每个 ID 必须 ≥4 字符，来自 Agent tool 实际返回）",
      "禁止跳过 --record-dispatch（不写 ID = evolution-tracker 拿不到执行证据 = mode-router 永远学不会）",
    ],
    after_dispatch_cmd: `node skills/mode-router/run.cjs --record-dispatch '${runId}' <id1,id2,...>`,
    if_you_disagree:
      "若你判断推荐错了，跑 node skills/mode-router/run.cjs --feedback '" + runId + "' --override=solo --notes='<原因>'，然后再 solo 执行",
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
    directive: `立即按 team/${r.team_type} 模式执行：你必须**调 Agent tool**派 ${r.team_type === "peer_review" ? "2 个" : "≥2 个"} subagent，按 team_plan.agents 的 subagent_type / prompt / model 配置`,
    steps: [
      "1. 读 mode-router --fine 输出的 team_plan.agents 数组",
      "2. 检查 team_plan.shape：peer_review / subagent_parallel / manager_worker",
      "3. 若 shape=manager_worker：先调 1 个 manager Agent，让它再调 N 个 worker（manager.subordinates 数组定义）；最终 subagent_run_ids 含 manager + 所有 worker 的 ID",
      "4. 若 shape=subagent_parallel：直接对每个 agent 调一次 Agent tool，并行（一个消息多个 Agent 调用）",
      "5. 若 shape=peer_review：串行（implementer → reviewer）",
      "6. 把所有返回的 ID 列表填进 a5-executor 入参的 subagent_run_ids[]",
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
    if (s.breakdown.review) reasons.push(`审查信号(+${s.breakdown.review})`);
    if (s.breakdown.cross_domain)
      reasons.push(`跨前后端域(+${s.breakdown.cross_domain})`);
    if (s.breakdown.files_many)
      reasons.push(`plan>10 文件(+${s.breakdown.files_many})`);
    if (s.breakdown.files_some)
      reasons.push(`plan>5 文件(+${s.breakdown.files_some})`);
    if (s.breakdown.steps_many)
      reasons.push(`plan>15 步(+${s.breakdown.steps_many})`);
    if (s.breakdown.steps_some)
      reasons.push(`plan>8 步(+${s.breakdown.steps_some})`);
    if (s.breakdown.long_task)
      reasons.push(`任务长(+${s.breakdown.long_task})`);
    if (s.breakdown.refactor)
      reasons.push(`重构/迁移(+${s.breakdown.refactor})`);
    return `综合评分 ${s.score} ≥${s.threshold} 触发 team：${reasons.join("、")}`;
  }
  return `综合评分 ${s.score} <${s.threshold}，默认 solo`;
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
  const shape = r.team_plan ? r.team_plan.shape : null;
  const TEAM_FORMS = {
    subagent_parallel:
      "派出并行 subagent 分别执行（LLM 必须用 Agent tool 派 + 填 subagent_run_ids）",
    manager_worker:
      "二层 Manager-Worker：1 个 manager + N 个 worker（论文 §6①）",
    peer_review: "Agent A 实现 → Agent B 独立 review",
  };

  const lines = [
    "",
    `┌─ mode-router ${stageBadge} ────────────────────┐`,
    `│ 任务：${snip}`,
    `│ 评分：${r.score} (阈值 team≥${r.threshold} / manager_worker≥${CFG.thresholds.manager_worker || 6})`,
    "├────────────────────────────────────────────┤",
    `│ 路由结果：${modeStr}`,
    `│ 原因：${r.reason}`,
  ];
  if (r.mode === "team" && shape && TEAM_FORMS[shape]) {
    lines.push(`│ 形式：${TEAM_FORMS[shape]}`);
  }
  lines.push("└────────────────────────────────────────────┘");

  // v0.9.1：mode=team 时打 loud banner，提醒 Claude 必须按 agent_dispatch_plan 调 Agent tool
  if (r.mode === "team" && r.agent_dispatch_plan) {
    const adp = r.agent_dispatch_plan;
    lines.push("");
    lines.push("⚠️  === AGENT_DISPATCH_REQUIRED (Claude 必读) ===");
    lines.push(`   shape: ${adp.shape} | dispatch_count: ${adp.dispatch_count}`);
    lines.push(`   directive: ${adp.directive}`);
    lines.push("   详细 spec 见 stdout JSON 的 agent_dispatch_plan 字段");
    lines.push(`   完成后必须跑：${adp.after_dispatch_cmd}`);
    lines.push("================================================");
  }
  console.error(lines.join("\n"));
}

// --- log helpers ---
function reportToHelix(stage, result) {
  if (!fs.existsSync(HELIX_RUN)) return;
  const phase = stage === "coarse" ? "mode-router-coarse" : "mode-router-fine";
  const payload = {
    passes: true,
    summary: `${phase}: ${result.mode}${result.team_type ? "/" + result.team_type : ""} (score=${result.score}${result.team_plan ? ", shape=" + result.team_plan.shape : ""})`,
    output: {
      mode: result.mode,
      team_type: result.team_type,
      score: result.score,
      shape: result.team_plan ? result.team_plan.shape : null,
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
      threshold: CFG.thresholds.team || 3,
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
  const routerRunId = nowBJ();
  const r = {
    ...s,
    reason: reasonFor(s),
    stage: "coarse",
    enforcement: buildEnforcement(s),
    // v0.9.1：coarse 也算 team_plan，用于 minimal-mode helix 直接闭环（无 plan 信号也能派 subagent）
    team_plan: buildTeamPlan(taskDesc, null, s),
    router_run_id: routerRunId,
    note: "v0.9.1：coarse 路径重新激活——minimal-mode helix 自动调用 + 直接产 agent_dispatch_plan",
  };
  r.agent_dispatch_plan = buildAgentDispatchPlan(r, routerRunId);
  printRecommendation(taskDesc, r, "coarse");
  safeAppend(ROUTER_LOG, {
    run_id: routerRunId,
    stage: "coarse",
    task_desc: taskDesc.slice(0, 200),
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    breakdown: r.breakdown,
    reason: r.reason,
    timestamp_ms: Date.now(),
    shape: r.team_plan ? r.team_plan.shape : null,
    agent_dispatch_required: r.agent_dispatch_plan ? true : false,
    dispatched_subagent_ids: null,
    user_override: null,
  });
  safeAppend(RUNS_LOG, {
    run_id: routerRunId,
    skill: "mode-router",
    stage: "coarse",
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    shape: r.team_plan ? r.team_plan.shape : null,
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
  const routerRunId = nowBJ();
  const r = {
    ...s,
    reason: reasonFor(s),
    stage: "fine",
    plan_signals: planSignals,
    enforcement: buildEnforcement(s),
    team_plan: buildTeamPlan(taskDesc, planSignals, s),
    router_run_id: routerRunId,
    contract: {
      enforcement_level: "MUST",
      a5_passes_requires:
        s.mode === "team"
          ? "subagent_run_ids 至少 1 个 ≥4 字符（manager + workers 总数）"
          : "subagent_run_ids 必须为空数组",
      bypass_allowed: false,
      finalize_consequence:
        "a5 不满足契约 → passes=false → finalize promise=NOT_COMPLETE",
    },
  };
  r.agent_dispatch_plan = buildAgentDispatchPlan(r, routerRunId);
  printRecommendation(taskDesc || "(plan based)", r, "fine");
  safeAppend(ROUTER_LOG, {
    run_id: routerRunId,
    stage: "fine",
    task_desc: taskDesc.slice(0, 200),
    plan_signals: planSignals,
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    shape: r.team_plan ? r.team_plan.shape : null,
    breakdown: r.breakdown,
    reason: r.reason,
    timestamp_ms: Date.now(),
    agent_dispatch_required: r.agent_dispatch_plan ? true : false,
    dispatched_subagent_ids: null,
    user_override: null,
  });
  safeAppend(RUNS_LOG, {
    run_id: routerRunId,
    skill: "mode-router",
    stage: "fine",
    mode: r.mode,
    team_type: r.team_type,
    score: r.score,
    shape: r.team_plan ? r.team_plan.shape : null,
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
    const shapeStr = e.shape ? `[${e.shape}]` : "";
    console.log(
      `${e.run_id}  [${stage}]  ${modeStr}  ${shapeStr}  score=${e.score ?? "-"}  ${(e.task_desc || "").slice(0, 40)}`,
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

// v0.9.1：闭环命令——LLM 在按 agent_dispatch_plan 派完 subagent 后必须回填 IDs
// 写入 ROUTER_LOG 对应 run_id 的 entry.dispatched_subagent_ids
// evolution-tracker 后续按 "dispatched_subagent_ids != null" 来判断推荐是否真被执行
function patchRouterLogEntry(runId, patch) {
  if (!fs.existsSync(ROUTER_LOG)) {
    return { ok: false, reason: "ROUTER_LOG missing" };
  }
  const lines = fs.readFileSync(ROUTER_LOG, "utf-8").split("\n");
  let found = false;
  const out = [];
  for (const raw of lines) {
    if (!raw.trim()) {
      out.push(raw);
      continue;
    }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      out.push(raw);
      continue;
    }
    if (obj.run_id === runId) {
      Object.assign(obj, patch);
      found = true;
      out.push(JSON.stringify(obj));
    } else {
      out.push(raw);
    }
  }
  if (!found) return { ok: false, reason: `run_id=${runId} not found in ROUTER_LOG` };
  fs.writeFileSync(ROUTER_LOG, out.join("\n"), "utf-8");
  // 写后立即逐行校验（CLAUDE.md 铁律 #8）
  for (const ln of out.filter(Boolean)) {
    try {
      JSON.parse(ln);
    } catch (e) {
      return { ok: false, reason: `JSON.parse fail after write: ${e.message}` };
    }
  }
  return { ok: true };
}

function cmdRecordDispatch(args) {
  const runId = args[0];
  if (!runId) {
    console.error('Usage: --record-dispatch <run_id> <id1,id2,...>');
    process.exit(2);
  }
  // 兼容 --ids=a,b 或裸位置参数 a,b
  let idsRaw = "";
  for (const a of args.slice(1)) {
    if (a.startsWith("--ids=")) idsRaw = a.slice(6);
    else if (!a.startsWith("--")) idsRaw = a;
  }
  const ids = idsRaw.split(/[,\s]+/).filter(Boolean);
  if (ids.length === 0) {
    console.error("[mode-router] --record-dispatch 需要至少 1 个 subagent ID");
    process.exit(2);
  }
  const invalid = ids.filter((x) => x.length < 4);
  if (invalid.length > 0) {
    console.error(`[mode-router] 这些 ID < 4 字符（违反契约，看起来像假 ID）: ${invalid.join(", ")}`);
    process.exit(2);
  }
  const r = patchRouterLogEntry(runId, {
    dispatched_subagent_ids: ids,
    dispatched_at: nowBJ(),
  });
  if (!r.ok) {
    console.error(`[mode-router] --record-dispatch 失败：${r.reason}`);
    process.exit(2);
  }
  console.log(JSON.stringify({ ok: true, run_id: runId, ids_count: ids.length, ids }, null, 2));
}

function cmdFeedback(args) {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: --feedback <run_id> [--rating=0|1] [--override=solo|team|none] [--notes=...]");
    process.exit(2);
  }
  const patch = {};
  for (const a of args.slice(1)) {
    if (a.startsWith("--rating=")) {
      const v = Number(a.slice(9));
      if (![0, 1].includes(v)) {
        console.error("[mode-router] --rating 必须 0 或 1（命中/没命中）");
        process.exit(2);
      }
      patch.user_rating = v;
    } else if (a.startsWith("--override=")) {
      const v = a.slice(11);
      if (!["solo", "team", "none"].includes(v)) {
        console.error("[mode-router] --override 只接受 solo / team / none");
        process.exit(2);
      }
      patch.user_override = v === "none" ? null : v;
    } else if (a.startsWith("--notes=")) {
      patch.user_notes = a.slice(8).slice(0, 300);
    }
  }
  if (Object.keys(patch).length === 0) {
    console.error("[mode-router] 至少传一个：--rating / --override / --notes");
    process.exit(2);
  }
  patch.feedback_at = nowBJ();
  const r = patchRouterLogEntry(runId, patch);
  if (!r.ok) {
    console.error(`[mode-router] --feedback 失败：${r.reason}`);
    process.exit(2);
  }
  console.log(JSON.stringify({ ok: true, run_id: runId, patched: patch }, null, 2));
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
  console.error("  node skills/mode-router/run.cjs --record-dispatch <run_id> <id1,id2,...>");
  console.error("  node skills/mode-router/run.cjs --feedback <run_id> [--rating=0|1] [--override=solo|team] [--notes=...]");
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
  } else if (sub === "--record-dispatch") {
    cmdRecordDispatch(args.slice(1));
  } else if (sub === "--feedback") {
    cmdFeedback(args.slice(1));
  } else if (sub && !sub.startsWith("--")) {
    // 兼容 v0.1：直接传 task → 等价 --coarse
    cmdCoarse(args.join(" "));
  } else {
    usage();
    process.exit(1);
  }
}

main();
