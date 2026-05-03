"use strict";
// helix/run.cjs — 编排器（领导视角，所有下属向他汇报）
//
// 三个子命令：
//   --start "<task>"          启动一次 /helix run，写 helix-runs.jsonl L1
//   --report <phase> <json>   下属上报（passes / summary / output_keys / duration_ms）
//   --finalize                收尾，按 Ralph passes 契约判定 promise=COMPLETE|NOT_COMPLETE
//   --status                  查看当前 active run（若有）
//
// Ralph 契约（来自 P-2026-4-30-001 + ralph_graft_push.md）：
//   ✅ passes: true|false 二元判定（机器层）
//   ✅ <promise>COMPLETE</promise> 全 passes 通过才 COMPLETE
//   ✅ progress.md 追加式学习日志（finalize 后 append）
//   ❌ 不引入 bash 外循环（违背 §1.Q4 可观察性）
//   ❌ 不自宣告完成（promise 仅机器判定，归档由用户人审）
//   ❌ 不脱离 session 粒度（一次 /helix = 一条 session record）

const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const PROJECT_DIR = process.cwd();
const META_DIR = path.join(PROJECT_DIR, "_meta");
const HELIX_RUNS = path.join(META_DIR, "helix-runs.jsonl");
const HELIX_STATE = path.join(META_DIR, ".helix-current-run.json");
const PROGRESS_MD = path.join(META_DIR, "progress.md");

// helix 编排默认 phase 顺序（a8 按需 inject，不固定列；a3 retriever 也按需触发）
// v0.6：mode-router 进主链——0.5 粗判 + 5.7 细判（100% 精确硬契约）
const PHASES_DEFAULT = [
  "mode-router-coarse",
  "a1-task-understander",
  "a2-repo-sensor",
  "a4-planner",
  "mode-router-fine",
  "a5-executor",
  "a6-validator",
  "a7-explainer",
];

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

function genRunId() {
  // 紧凑形式：YYYY-M-D-HHMMSS
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()}-` +
    `${p(bj.getUTCHours())}${p(bj.getUTCMinutes())}${p(bj.getUTCSeconds())}`
  );
}

function ensureMeta() {
  fs.mkdirSync(META_DIR, { recursive: true });
}

function safeAppend(p, obj) {
  const line = JSON.stringify(obj);
  JSON.parse(line); // CLAUDE.md 铁律 #8：写 JSONL 立刻校验
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, line + "\n", "utf-8");
}

function readState() {
  if (!fs.existsSync(HELIX_STATE)) return null;
  try {
    return JSON.parse(fs.readFileSync(HELIX_STATE, "utf-8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  ensureMeta();
  const json = JSON.stringify(state, null, 2);
  JSON.parse(json);
  fs.writeFileSync(HELIX_STATE, json, "utf-8");
}

function clearState() {
  if (fs.existsSync(HELIX_STATE)) fs.unlinkSync(HELIX_STATE);
}

function checkPortInUse(port, host = "127.0.0.1", timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (inUse) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

// --- subcommands ---

async function cmdStart(task) {
  const taskStr = (task || "").trim();
  const helix_run_id = genRunId();

  ensureMeta();
  // 若有残留 state，先 abort 上一次（不阻塞，记录残留）
  const prev = readState();
  if (prev) {
    safeAppend(HELIX_RUNS, {
      helix_run_id: prev.helix_run_id,
      type: "abort_stale",
      reason: "new --start invoked while previous run still active",
      ts: nowBJ(),
    });
  }

  const startEntry = {
    helix_run_id,
    type: "start",
    task: taskStr.slice(0, 500),
    project_dir: PROJECT_DIR,
    status: "started",
    phases_planned: PHASES_DEFAULT,
    ts: nowBJ(),
  };
  safeAppend(HELIX_RUNS, startEntry);
  writeState({
    helix_run_id,
    started_at: nowBJ(),
    task: taskStr,
    phase_reports: [],
  });

  // Dashboard 自检 + 自启（health check 优先，已运行时不重复 spawn）
  // dashboard 是 plugin 自带文件，必须从 __dirname 解析（不能用 process.cwd()）
  // —— 否则用户从其它目录调 /helix 时会误报 "missing"。
  // 候选路径按优先级：plugin 内 ../../dashboard → 用户 cwd（兼容 dev 时项目根 ≠ plugin 根）
  const dashboardPort = parseInt(
    process.env.HARNESS_DASHBOARD_PORT || "7777",
    10,
  );
  const dashboardCandidates = [
    path.resolve(__dirname, "..", "..", "dashboard", "server.js"),
    path.join(PROJECT_DIR, "dashboard", "server.js"),
  ];
  const dashboardJs = dashboardCandidates.find((p) => fs.existsSync(p));
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  let dashboardStatus;
  if (!dashboardJs) {
    dashboardStatus = "missing";
  } else if (await checkPortInUse(dashboardPort)) {
    dashboardStatus = "already_running";
  } else {
    try {
      const child = spawn(process.execPath, [dashboardJs], {
        detached: true,
        stdio: "ignore",
        cwd: path.dirname(dashboardJs),
        env: {
          ...process.env,
          HARNESS_DASHBOARD_PORT: String(dashboardPort),
          // 让 dashboard 把用户当前项目当作 ROOT（即使 dashboard 装在别处）
          CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || PROJECT_DIR,
        },
      });
      child.unref();
      dashboardStatus = "starting";
    } catch (e) {
      dashboardStatus = `spawn_failed: ${e.message}`;
    }
  }
  console.error(
    `\n${"━".repeat(56)}\n` +
      `🟣  HARNESS Dashboard  →  ${dashboardUrl}  [${dashboardStatus}]\n` +
      `    实时查看 phase 进度 / skill 状态 / helix run\n` +
      `${"━".repeat(56)}\n`,
  );

  const plan = {
    helix_run_id,
    promise: "NOT_COMPLETE",
    project_dir: PROJECT_DIR,
    dashboard: {
      url: dashboardUrl,
      status: dashboardStatus,
      note: "可选——不打开也不影响 helix 流程；但建议打开以监控 a1-a8 phase 实时状态",
    },
    instructions: [
      `📊 Dashboard: ${dashboardUrl} (status=${dashboardStatus}) — 建议打开浏览器查看实时进度`,
      "你必须严格按 phases 顺序执行；每个 phase 调用对应 run.cjs（脚本会自动 --report 给 helix）",
      "任何 phase passes=false → 立刻暂停 + 报告用户决策；不自动重试（Ralph 反对自宣告）",
      "破坏性操作（git push --force / rm -rf / drop / 改 CI 等）→ 强制 inject a8-risk-guard",
      "全部 phase 完成 → node skills/helix/run.cjs --finalize 检查 promise",
    ],
    phases: PHASES_DEFAULT.map((p, i) => ({
      step: i + 1,
      phase: p,
      cmd: `node skills/${p}/run.cjs '<input-json>'`,
    })),
    risk_guard: {
      cmd: `node skills/a8-risk-guard/run.cjs '<operation-json>'`,
      when: "任何破坏性/不可逆操作之前；passes=false 则 ABORT",
    },
    finalize: {
      cmd: `node skills/helix/run.cjs --finalize`,
      output:
        "helix-runs.jsonl 收尾行 + progress.md append（Ralph 追加式学习日志）",
    },
  };
  console.log(JSON.stringify(plan, null, 2));
}

function cmdReport(phase, jsonStr) {
  if (!phase) {
    console.error("[helix] --report 需要 <phase> <json> 两个参数");
    process.exit(1);
  }
  const state = readState();
  if (!state) {
    // 不强制 fail：允许 phase skill 独立跑（兼容 helix 未启动场景）
    console.error(
      `[helix] no active run; ${phase} 报告被跳过（独立 skill 运行 OK）`,
    );
    return;
  }
  let payload;
  try {
    payload = JSON.parse(jsonStr || "{}");
  } catch (e) {
    console.error(`[helix] invalid JSON in --report ${phase}:`, e.message);
    process.exit(2);
  }
  const entry = {
    helix_run_id: state.helix_run_id,
    type: "phase_report",
    phase,
    passes: payload.passes === true,
    summary: (payload.summary || "").slice(0, 300),
    output_keys: Object.keys(payload.output || {}),
    duration_ms:
      typeof payload.duration_ms === "number" ? payload.duration_ms : null,
    errors: Array.isArray(payload.errors) ? payload.errors.slice(0, 5) : [],
    ts: nowBJ(),
  };
  safeAppend(HELIX_RUNS, entry);
  state.phase_reports.push({
    phase,
    passes: entry.passes,
    ts: entry.ts,
  });
  writeState(state);
  console.error(
    `[helix] ✅ ${phase} 已汇报 (passes=${entry.passes}, run=${state.helix_run_id})`,
  );
}

function cmdFinalize() {
  const state = readState();
  if (!state) {
    console.error("[helix] 无 active run；nothing to finalize");
    process.exit(1);
  }
  const reports = state.phase_reports || [];
  const allPasses =
    reports.length > 0 && reports.every((r) => r.passes === true);
  const failed = reports.filter((r) => !r.passes).map((r) => r.phase);
  const promise = allPasses ? "COMPLETE" : "NOT_COMPLETE";

  const finalEntry = {
    helix_run_id: state.helix_run_id,
    type: "finalize",
    status: "done",
    promise,
    passes_all: allPasses,
    phases_run: reports.length,
    failed_phases: failed,
    task: (state.task || "").slice(0, 200),
    started_at: state.started_at,
    finished_at: nowBJ(),
    note: allPasses
      ? "Ralph 契约：promise=COMPLETE 仅机器判定，归档由用户人审"
      : `${failed.length} phase 未通过，需用户决策（不自动重试）`,
  };
  safeAppend(HELIX_RUNS, finalEntry);

  // Ralph 追加式学习日志：append 到 progress.md
  if (fs.existsSync(PROGRESS_MD)) {
    const phaseLine = reports
      .map((r) => `${r.phase.split("-")[0]}${r.passes ? "✅" : "❌"}`)
      .join(" ");
    const taskShort = (state.task || "").slice(0, 80);
    const block = [
      "",
      `### /helix run ${state.helix_run_id} · "${taskShort}"`,
      `- promise: **${promise}**`,
      `- phases: ${phaseLine || "(none reported)"}`,
      failed.length ? `- failed: ${failed.join(", ")}` : null,
      `- task: ${state.task || ""}`,
      `- started → finished: ${state.started_at} → ${finalEntry.finished_at}`,
      "",
    ]
      .filter((x) => x !== null)
      .join("\n");
    fs.appendFileSync(PROGRESS_MD, block, "utf-8");
  }

  clearState();
  console.log(JSON.stringify(finalEntry, null, 2));
}

function cmdStatus() {
  const state = readState();
  if (!state) {
    console.log(JSON.stringify({ active: false }, null, 2));
    return;
  }
  console.log(
    JSON.stringify(
      {
        active: true,
        helix_run_id: state.helix_run_id,
        task: state.task,
        started_at: state.started_at,
        phases_done: state.phase_reports.length,
        phase_reports: state.phase_reports,
      },
      null,
      2,
    ),
  );
}

function usage() {
  console.error("Usage:");
  console.error('  node skills/helix/run.cjs --start "<task description>"');
  console.error("  node skills/helix/run.cjs --report <phase> <json>");
  console.error("  node skills/helix/run.cjs --finalize");
  console.error("  node skills/helix/run.cjs --status");
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0];
  if (sub === "--start") {
    await cmdStart(args.slice(1).join(" "));
  } else if (sub === "--report") {
    cmdReport(args[1], args[2] || "{}");
  } else if (sub === "--finalize") {
    cmdFinalize();
  } else if (sub === "--status") {
    cmdStatus();
  } else {
    usage();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[helix] fatal: ${e.message}`);
  process.exit(1);
});
