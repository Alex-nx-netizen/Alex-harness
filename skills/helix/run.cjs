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
const path = require("path");
const crypto = require("crypto");
const { nowBJ, safeAppend, projectRoot } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

// v0.8.1+：用 projectRoot() 解析，cwd 无关（修复 user 报"helix state 在 --start 后被 cwd 切换吞掉"）
const PROJECT_DIR = projectRoot();
const META_DIR = path.join(PROJECT_DIR, "_meta");
const HELIX_RUNS = path.join(META_DIR, "helix-runs.jsonl");
const HELIX_STATE = path.join(META_DIR, ".helix-current-run.json");
const PROGRESS_MD = path.join(META_DIR, "progress.md");
const SOUL_MD = path.join(META_DIR, "SOUL.md");

// helix 编排默认 phase 顺序（a8 按需 inject，不固定列；a3 retriever 也按需触发）
// v0.6：mode-router 进主链——0.5 粗判 + 5.7 细判（100% 精确硬契约）
// v0.7：meta-audit 进主链（Step 9.5，a6 之后、a7 之前）；治理元 PHASES_GOVERNANCE 软约束接入
// v0.7.2：code-review 进主链（Step 8.5，a5 之后、a6 之前）；SOFT_PHASES 软失败白名单
// v0.8 #11：a3-retriever 默认从主链移除（数据：16 个 run 13 次跳过 = 装饰）；
//   仍保留文件可手动调（research 类任务）；composedPhases by type 也跟随调整
// v0.8 #6/#12：mode-router-coarse 默认从主链移除（数据：43 log 99% 自检；fine 已覆盖完整决策）；
//   保留 --coarse 子命令向后兼容；想跑可手动 `node skills/mode-router/run.cjs --coarse "..."`
const PHASES_DEFAULT = [
  "a1-task-understander",
  "a2-repo-sensor",
  "a4-planner",
  "mode-router-fine",
  "a5-executor",
  "code-review",
  "a6-validator",
  "meta-audit",
  "a7-explainer",
];

// v0.7.2：失败语义为「软」的 phase——passes=false 不进 failed_phases，仅进 soft_failures + warnings
// 用户对这些 phase 的失败有最终决定权（不自动 NOT_COMPLETE）
const SOFT_PHASES = ["code-review"];

// v0.7 治理元（默认在主链跑；finalize 时缺失只警告不卡）
//   evolution-tracker：每次 finalize 前跑一次趋势分析（可缺）
//   context-curator：每次 finalize 前更新一次 snapshot（可缺）
// knowledge-curator / session-reporter 不在 PHASES_GOVERNANCE，因为它们在 finalize 后或 Stop hook 触发
const PHASES_GOVERNANCE = ["evolution-tracker", "context-curator"];

function genRunId() {
  // 紧凑形式：YYYY-M-D-HHMMSS
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()}-` +
    `${p(bj.getUTCHours())}${p(bj.getUTCMinutes())}${p(bj.getUTCSeconds())}`
  );
}

// v0.9：解析 nowBJ 输出的字符串（YYYY-M-D HH:MM:SS）→ epoch ms
// 用于计算 stale current-run 的年龄；不依赖系统时区
function parseBJ(s) {
  const m = String(s || "").match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/,
  );
  if (!m) return 0;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, se) - 8 * 3600 * 1000;
}

// v0.9：stale 阈值 — 超过这个时长的 current-run 自动 abandoned
// 数据依据：2026-5-13 体检发现 9/35 = 25.7% 触发 abort_stale（>30min 用户根本不会回来 finalize）
const STALE_MS = 30 * 60 * 1000;

function ensureMeta() {
  fs.mkdirSync(META_DIR, { recursive: true });
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

// v0.8 #10：task_card 不可变契约——计算稳定 hash（key 排序后再 stringify）
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

// --- subcommands ---

function cmdStart(args) {
  // v0.9：解析 --deep flag — 默认 minimal mode（仅 start+finalize，不强求 9 phase）
  // 数据驱动：2026-5 体检 24/24 finalize phases_run=0，用户实际工作流就是 minimal
  let deep = false;
  const taskParts = [];
  for (const a of args || []) {
    if (a === "--deep") deep = true;
    else taskParts.push(a);
  }
  const taskStr = taskParts.join(" ").trim();
  const mode = deep ? "deep" : "minimal";
  const helix_run_id = genRunId();

  ensureMeta();
  // v0.9：旧 state 处理 — >30min 自动 abandoned，否则保留旧 abort_stale 流程
  const prev = readState();
  if (prev) {
    const prevStartedMs = parseBJ(prev.started_at);
    const ageMs = prevStartedMs > 0 ? Date.now() - prevStartedMs : 0;
    if (ageMs > STALE_MS) {
      safeAppend(HELIX_RUNS, {
        helix_run_id: prev.helix_run_id,
        type: "finalize",
        status: "abandoned",
        promise: "ABANDONED",
        passes_all: false,
        phases_run: (prev.phase_reports || []).length,
        reason: `auto-abandoned: stale >${Math.round(STALE_MS / 60000)}min (age=${Math.round(ageMs / 60000)}min)`,
        task: (prev.task || "").slice(0, 200),
        started_at: prev.started_at,
        finished_at: nowBJ(),
        mode: prev.mode || "deep",
      });
    } else {
      safeAppend(HELIX_RUNS, {
        helix_run_id: prev.helix_run_id,
        type: "abort_stale",
        reason: "new --start invoked while previous run still active",
        ts: nowBJ(),
      });
    }
  }

  const phasesPlanned = mode === "deep" ? PHASES_DEFAULT : [];
  const startEntry = {
    helix_run_id,
    type: "start",
    task: taskStr.slice(0, 500),
    project_dir: PROJECT_DIR,
    status: "started",
    mode,
    phases_planned: phasesPlanned,
    ts: nowBJ(),
  };
  safeAppend(HELIX_RUNS, startEntry);
  writeState({
    helix_run_id,
    started_at: nowBJ(),
    task: taskStr,
    mode,
    phase_reports: [],
  });

  // v0.8 #5：SOUL.md 自动注入——helix --start 把 SOUL.md 全文塞进 plan 输出
  // SOUL.md 是跨 run 的稳定行为规则（evolution-tracker --promote-soul --apply 沉淀），
  // LLM 必须在 a1 之前先读完，作为本次 run 的"宪法"
  let soulContent = null;
  let soulNote = null;
  if (fs.existsSync(SOUL_MD)) {
    try {
      soulContent = fs.readFileSync(SOUL_MD, "utf-8");
      soulNote = `SOUL.md 已注入（${soulContent.length} 字）；LLM 必须将其作为本 run 的不可变行为规则`;
    } catch (e) {
      soulNote = `SOUL.md 读取失败：${e.message}`;
    }
  } else {
    soulNote = "SOUL.md 不存在（项目尚未沉淀稳定规则）；evolution-tracker --promote-soul --apply 会创建";
  }

  // v0.9：minimal mode 输出极简 plan，不要求 9 phase；--deep 才回到完整 Ralph 契约
  const minimalInstructions = [
    "**第一件事**：读上面的 soul.content（若 present=true）作为本 run 不可变行为规则",
    "v0.9 minimal mode：你直接干活即可，不强制跑 9 phase（数据驱动：2026-5 体检 24/24 phases_run=0）",
    "破坏性操作（git push --force / rm -rf / drop / 改 CI 等）→ 仍必须先 a8-risk-guard",
    "做完后 → node skills/helix/run.cjs --finalize，promise=COMPLETE_MINIMAL",
    "需要完整 9 phase 流程时用 --deep flag 重启",
  ];
  const deepInstructions = [
    "**第一件事**：读上面的 soul.content（若 present=true）作为本 run 不可变行为规则",
    "你必须严格按 phases 顺序执行；每个 phase 调用对应 run.cjs（脚本会自动 --report 给 helix）",
    "任何 phase passes=false → 立刻暂停 + 报告用户决策；不自动重试（Ralph 反对自宣告）",
    "破坏性操作（git push --force / rm -rf / drop / 改 CI 等）→ 强制 inject a8-risk-guard",
    "全部 phase 完成 → node skills/helix/run.cjs --finalize 检查 promise",
  ];
  const plan = {
    helix_run_id,
    mode,
    promise: mode === "minimal" ? "PENDING_MINIMAL" : "NOT_COMPLETE",
    project_dir: PROJECT_DIR,
    soul: {
      present: soulContent !== null,
      note: soulNote,
      content: soulContent,
    },
    instructions: mode === "minimal" ? minimalInstructions : deepInstructions,
    phases:
      mode === "minimal"
        ? []
        : PHASES_DEFAULT.map((p, i) => ({
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
        mode === "minimal"
          ? "helix-runs.jsonl 收尾行（promise=COMPLETE_MINIMAL）+ progress.md append"
          : "helix-runs.jsonl 收尾行 + progress.md append（Ralph 追加式学习日志）",
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
  // v0.7 C2：a4-planner 输出的 composedPhases 抓到 state，finalize 时按此判定必跑 phase
  if (phase === "a4-planner" && payload.output) {
    const composed =
      payload.output.composedPhases || payload.output.composed_phases;
    if (Array.isArray(composed) && composed.length > 0) {
      state.composedPhases = composed.filter(
        (p) => typeof p === "string" && p.trim(),
      );
      entry.composedPhases = state.composedPhases;
    }
    // v0.8 #10：a4 通过 task_card 校验 → 锁定 task_card hash 到 state
    // 后续 phase（特别是 a5）若带 task_card，必须 hash 一致；否则视为 task_card_mutated
    const tc = payload.output.task_card_validated;
    if (tc && typeof tc === "object") {
      state.task_card = tc;
      state.task_card_hash = stableHash(tc);
      entry.task_card_hash = state.task_card_hash;
    }
  }
  // v0.8 #10：a5-executor 报告时若带 task_card_hash，校验一致性
  if (phase === "a5-executor" && payload.output && state.task_card_hash) {
    const submitted = payload.output.task_card_hash;
    if (submitted && submitted !== state.task_card_hash) {
      entry.passes = false;
      entry.errors = [
        ...(entry.errors || []),
        "task_card_mutated",
      ];
      entry.summary =
        `🚨 task_card 被篡改（a4 锁定 hash=${state.task_card_hash}, a5 提交 hash=${submitted}）— Ralph 单源契约违反`;
    }
  }
  // v0.7 B2：a6-validator 的 score 字段抓到 phase report，便于 evolution-tracker 长期分析
  if (phase === "a6-validator" && payload.score) {
    entry.score = payload.score;
  }
  // v0.7 B1：meta-audit 的 score 字段抓到 phase report
  if (phase === "meta-audit" && payload.output && payload.output.score) {
    entry.score = payload.output.score;
  }
  // v0.7.2：code-review 的 score 字段抓到 phase report，便于 evolution-tracker 长期分析
  if (phase === "code-review" && payload.output && payload.output.score) {
    entry.score = payload.output.score;
    entry.has_recommendations = payload.output.has_recommendations === true;
  }
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
  const isMinimal = state.mode === "minimal";
  // v0.7.2：SOFT_PHASES（如 code-review）失败不计入 allPasses；只进 soft_failures + warnings
  const blockingReports = reports.filter(
    (r) => !SOFT_PHASES.includes(r.phase),
  );
  const softFailures = reports
    .filter((r) => SOFT_PHASES.includes(r.phase) && !r.passes)
    .map((r) => r.phase);
  const allPasses =
    blockingReports.length > 0 &&
    blockingReports.every((r) => r.passes === true);
  const failed = blockingReports
    .filter((r) => !r.passes)
    .map((r) => r.phase);
  // v0.9：minimal mode → promise=COMPLETE_MINIMAL（不卡 phases_run=0，承认用户工作流）
  // deep mode → 维持 Ralph 原契约（全 passes 才 COMPLETE）
  let promise;
  if (isMinimal) {
    promise = failed.length > 0 ? "NOT_COMPLETE" : "COMPLETE_MINIMAL";
  } else {
    promise = allPasses ? "COMPLETE" : "NOT_COMPLETE";
  }

  // v0.7 B3：治理元软约束——若 PHASES_GOVERNANCE 没跑过，警告但不卡 promise
  const phaseSet = new Set(reports.map((r) => r.phase));
  let governanceMissing = PHASES_GOVERNANCE.filter((p) => !phaseSet.has(p));

  // v0.8 #2：lonely skill 接入 — finalize 时自动 fire-and-forget 触发缺席的治理元
  // fail-safe：5s 超时 + 错误捕获，绝不因治理元失败影响 promise
  // 关闭方式：HARNESS_AUTO_GOVERNANCE=off
  const autoGovernance = process.env.HARNESS_AUTO_GOVERNANCE !== "off";
  const governanceResults = [];
  // v0.9 P4：plugin 安装目录的 fallback —— 外部业务项目下 PROJECT_DIR 没有 skills/，要回退到 plugin
  // __dirname = <plugin>/skills/helix，所以 <plugin>/skills/<gp>/run.cjs 是 fallback
  const pluginSkillsDir = path.resolve(__dirname, "..");
  // v0.9 P4：evolution-tracker 无参数会 print usage exit 2；fire-and-forget 用 read-only 模式
  const GOVERNANCE_ARGS = {
    "evolution-tracker": ["--promote-soul", "--dry-run"],
    "context-curator": [],
  };
  if (autoGovernance) {
    for (const gp of governanceMissing.slice()) {
      let govScript = path.join(PROJECT_DIR, "skills", gp, "run.cjs");
      let resolvedFrom = "project";
      if (!fs.existsSync(govScript)) {
        const fb = path.join(pluginSkillsDir, gp, "run.cjs");
        if (fs.existsSync(fb)) {
          govScript = fb;
          resolvedFrom = "plugin";
        } else {
          governanceResults.push({
            phase: gp,
            status: "skip",
            reason: "script not found (project+plugin both miss)",
            tried: [
              path.join(PROJECT_DIR, "skills", gp, "run.cjs"),
              fb,
            ],
          });
          continue;
        }
      }
      try {
        const extraArgs = GOVERNANCE_ARGS[gp] || [];
        const r = spawnSync("node", [govScript, ...extraArgs], {
          encoding: "utf-8",
          cwd: PROJECT_DIR,
          timeout: 8000,
          env: { ...process.env, HARNESS_PROJECT_ROOT: PROJECT_DIR },
        });
        const ok = r.status === 0;
        governanceResults.push({
          phase: gp,
          status: ok ? "ok" : "fail",
          resolved_from: resolvedFrom,
          args: extraArgs,
          exit: r.status,
          stderr_tail: (r.stderr || "").slice(-200),
        });
        if (ok) {
          governanceMissing = governanceMissing.filter((p) => p !== gp);
        }
      } catch (e) {
        governanceResults.push({ phase: gp, status: "error", error: e.message });
      }
    }
  }

  // v0.7 C2：a4-planner composedPhases 决定哪些 phase 必跑
  // 若 state 有 composedPhases，把缺的 phase 列出来（仅警告级，不卡 promise）
  const composedPhases = Array.isArray(state.composedPhases)
    ? state.composedPhases
    : null;
  const composedMissing = composedPhases
    ? composedPhases.filter(
        (p) => !phaseSet.has(p) && !p.startsWith("mode-router"),
      )
    : [];

  const warnings = [];
  if (governanceMissing.length > 0) {
    warnings.push(
      `governance phases not run (soft): ${governanceMissing.join(", ")}`,
    );
  }
  if (composedMissing.length > 0) {
    warnings.push(
      `a4 composedPhases missing (soft): ${composedMissing.join(", ")}`,
    );
  }
  if (softFailures.length > 0) {
    warnings.push(
      `soft-fail phases (advisory, user decides): ${softFailures.join(", ")}`,
    );
  }

  // v0.8 #3：score 真实化警告 — 任何 phase 用了 default_fallback / uniform_suspect → warn
  // 不卡 promise，但人审看 finalize 输出能立刻发现"这次评分可能没真评"
  const suspectScores = [];
  // 重新读最近 N 行 helix-runs.jsonl 拿本 run 的 score 详情
  try {
    const tail = fs
      .readFileSync(HELIX_RUNS, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-200)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((o) => o && o.helix_run_id === state.helix_run_id);
    for (const e of tail) {
      const s = e.score;
      if (!s) continue;
      if (s._source === "default_fallback") {
        suspectScores.push(`${e.phase}=default_fallback`);
      } else if (s._uniform_suspect) {
        suspectScores.push(`${e.phase}=uniform(${s.total})`);
      }
    }
  } catch {}
  if (suspectScores.length > 0) {
    warnings.push(
      `score 真实化嫌疑 (LLM 可能没真评): ${suspectScores.join(", ")}`,
    );
  }

  const finalEntry = {
    helix_run_id: state.helix_run_id,
    type: "finalize",
    status: "done",
    mode: state.mode || "deep",
    promise,
    passes_all: allPasses,
    phases_run: reports.length,
    failed_phases: failed,
    soft_failures: softFailures,
    composedPhases: composedPhases || null,
    governance_missing: governanceMissing,
    governance_auto_results: governanceResults,
    composed_missing: composedMissing,
    warnings,
    task: (state.task || "").slice(0, 200),
    started_at: state.started_at,
    finished_at: nowBJ(),
    note: isMinimal
      ? promise === "COMPLETE_MINIMAL"
        ? "v0.9 minimal mode：无 phase 失败，承认用户直接干活的工作流"
        : `${failed.length} phase 未通过（minimal mode 也尊重失败），需用户决策`
      : allPasses
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

    // v0.8 #9：Ralph 完整版 — promise=NOT_COMPLETE 必写"失败专属段"，固定 4 字段，给 evolution-tracker 直接消费
    if (promise === "NOT_COMPLETE") {
      const failureBlock = [
        "",
        `## ❌ helix-run-${state.helix_run_id} NOT_COMPLETE`,
        `- phase: ${failed.join(", ") || "(unknown)"}`,
        `- reason: ${reports
          .filter((r) => !r.passes)
          .map((r) => `${r.phase}=passes_false`)
          .join("; ") || "(no phase report)"}`,
        `- 已修: 否`,
        `- 复盘 link: 待写（findings.md F-NNN 或 progress.md 同会话）`,
        `- task: ${(state.task || "").slice(0, 200)}`,
        "",
      ].join("\n");
      fs.appendFileSync(PROGRESS_MD, failureBlock, "utf-8");
    }
  }

  // v0.8 #4: OTLP 导出 — fire-and-forget，HARNESS_OTLP_ENDPOINT 未设则 no-op
  try {
    const { exportRun } = require("./lib/otlp_exporter.cjs");
    exportRun(state.helix_run_id, PROJECT_DIR);
  } catch (e) {
    // 不阻塞 finalize
    console.error(`[helix] otlp exporter load failed: ${e.message}`);
  }

  // v0.9 P3：兜底清理 a2 历史遗留的 `<root>/_tmp_repo_ctx.json`（如果存在）
  // 不删 `_meta/repo-ctx-snapshot.json`，它是当次 run 的 ctx 快照，留给下次 a2 覆盖
  try {
    const legacy = path.join(PROJECT_DIR, "_tmp_repo_ctx.json");
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
  } catch (_) {}

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

// v0.7 E2: --finalize-session
//   收集本会话的 helix runs（按 last N 或 since timestamp），拼装 markdown 总结，
//   调 session-reporter 的 --finalize 走干跑。默认不推飞书；--push-feishu 才真推。
function cmdFinalizeSession(args) {
  const opts = {
    last: 5, // 默认拿最近 5 条 run
    since: null, // ISO-like "2026-5-4" 北京日期
    pushFeishu: false,
    dryRun: true,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--last") {
      opts.last = parseInt(args[++i], 10) || 5;
    } else if (a === "--since") {
      opts.since = args[++i];
    } else if (a === "--push-feishu") {
      opts.pushFeishu = true;
      opts.dryRun = false;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
      opts.pushFeishu = false;
    }
  }

  if (!fs.existsSync(HELIX_RUNS)) {
    console.error(
      "[helix] _meta/helix-runs.jsonl 不存在，没法 finalize-session",
    );
    process.exit(1);
  }

  const lines = fs
    .readFileSync(HELIX_RUNS, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);
  // 解析每行 + 按 helix_run_id 分组
  const runs = new Map(); // run_id → { start, finalize, phases[] }
  for (const ln of lines) {
    let obj;
    try {
      obj = JSON.parse(ln);
    } catch {
      continue;
    }
    const id = obj.helix_run_id;
    if (!id) continue;
    if (!runs.has(id)) {
      runs.set(id, { id, start: null, finalize: null, phases: [] });
    }
    const r = runs.get(id);
    if (obj.type === "start") r.start = obj;
    else if (obj.type === "finalize") r.finalize = obj;
    else if (obj.type === "phase_report") r.phases.push(obj);
  }

  // 过滤 + 排序：finalize 完成的优先，按 finished_at 倒序
  let arr = [...runs.values()].filter((r) => r.start || r.finalize);
  if (opts.since) {
    arr = arr.filter((r) => {
      const ts =
        (r.finalize && r.finalize.finished_at) || (r.start && r.start.ts) || "";
      return ts >= opts.since;
    });
  }
  arr.sort((a, b) => {
    const ta =
      (a.finalize && a.finalize.finished_at) || (a.start && a.start.ts) || "";
    const tb =
      (b.finalize && b.finalize.finished_at) || (b.start && b.start.ts) || "";
    return tb.localeCompare(ta);
  });
  arr = arr.slice(0, opts.last);

  // 拼装 markdown 总结
  const mdLines = [];
  mdLines.push(`# Helix Session 总结 · 生成于 ${nowBJ()}`);
  mdLines.push("");
  mdLines.push(
    `本次总结涵盖 ${arr.length} 条 helix run（last=${opts.last}${opts.since ? `, since=${opts.since}` : ""}）。`,
  );
  mdLines.push("");
  let promiseComplete = 0;
  let promiseNotComplete = 0;
  for (const r of arr) {
    const taskShort = (
      (r.start && r.start.task) ||
      (r.finalize && r.finalize.task) ||
      "(unknown)"
    ).slice(0, 80);
    const promise = (r.finalize && r.finalize.promise) || "STILL_RUNNING";
    if (promise === "COMPLETE") promiseComplete++;
    else if (promise === "NOT_COMPLETE") promiseNotComplete++;
    const phaseLine = r.phases
      .map((p) => `${(p.phase || "").split("-")[0]}${p.passes ? "✅" : "❌"}`)
      .join(" ");
    mdLines.push(`## ${r.id} · ${promise}`);
    mdLines.push(`- task: ${taskShort}`);
    mdLines.push(`- phases: ${phaseLine || "(none)"}`);
    if (
      r.finalize &&
      r.finalize.failed_phases &&
      r.finalize.failed_phases.length
    ) {
      mdLines.push(`- failed: ${r.finalize.failed_phases.join(", ")}`);
    }
    if (r.finalize && r.finalize.warnings && r.finalize.warnings.length) {
      mdLines.push(`- warnings: ${r.finalize.warnings.join("; ")}`);
    }
    mdLines.push("");
  }
  mdLines.push("---");
  mdLines.push(
    `合计：COMPLETE ${promiseComplete} · NOT_COMPLETE ${promiseNotComplete} · running ${arr.length - promiseComplete - promiseNotComplete}`,
  );
  const md = mdLines.join("\n");

  const summaryJson = {
    generated_at: nowBJ(),
    runs_total: arr.length,
    promise_complete: promiseComplete,
    promise_not_complete: promiseNotComplete,
    runs_summary: arr.map((r) => ({
      id: r.id,
      task: ((r.start && r.start.task) || "").slice(0, 120),
      promise: (r.finalize && r.finalize.promise) || "STILL_RUNNING",
      phases_count: r.phases.length,
      failed_phases: (r.finalize && r.finalize.failed_phases) || [],
    })),
    markdown: md,
    dry_run: opts.dryRun,
    push_feishu: opts.pushFeishu,
  };

  // 调 session-reporter --finalize（如果支持）
  // 注意：仅在 --push-feishu 显式开启时才真调，否则 dry-run 默认绝不触发飞书副作用
  // TODO(worker-c): session-reporter 暂不识别 --finalize 子命令（会落到 default 真推飞书的危险路径）；
  //   等 worker-c 在 session-reporter/run.cjs 里加 if (args[0] === '--finalize') 分支再启用真调用
  const reporterPath = path.join(
    PROJECT_DIR,
    "skills",
    "session-reporter",
    "run.cjs",
  );
  let reporterResult = null;
  if (opts.pushFeishu && fs.existsSync(reporterPath)) {
    const r = spawnSync(
      "node",
      [reporterPath, "--finalize", JSON.stringify(summaryJson)],
      {
        encoding: "utf-8",
        cwd: PROJECT_DIR,
        timeout: 20000,
      },
    );
    reporterResult = {
      stdout: (r.stdout || "").slice(0, 500),
      stderr: (r.stderr || "").slice(0, 500),
      status: r.status,
      note:
        r.status === 0
          ? "session-reporter --finalize 调用成功"
          : "session-reporter 不识别 --finalize（worker-c 后续在 session-reporter 里加 --finalize 分支）",
    };
  } else {
    reporterResult = {
      skipped: true,
      reason: opts.pushFeishu
        ? "session-reporter run.cjs 不存在"
        : "dry-run 模式（未带 --push-feishu），不调 session-reporter，避免触发飞书副作用",
    };
  }

  // 输出（dry-run 默认）
  const out = {
    ok: true,
    summary: summaryJson,
    reporter: reporterResult,
    feishu_pushed: opts.pushFeishu,
    note: opts.pushFeishu
      ? "已尝试推飞书（具体由 session-reporter 控制）"
      : "dry-run 模式，未推飞书；要推请加 --push-feishu",
  };
  console.log(JSON.stringify(out, null, 2));
}

function usage() {
  console.error("Usage:");
  console.error('  node skills/helix/run.cjs --start "<task description>"');
  console.error("  node skills/helix/run.cjs --report <phase> <json>");
  console.error("  node skills/helix/run.cjs --finalize");
  console.error("  node skills/helix/run.cjs --status");
  console.error(
    "  node skills/helix/run.cjs --finalize-session [--last N] [--since YYYY-M-D] [--push-feishu]",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0];
  if (sub === "--start") {
    cmdStart(args.slice(1));
  } else if (sub === "--report") {
    cmdReport(args[1], args[2] || "{}");
  } else if (sub === "--finalize") {
    cmdFinalize();
  } else if (sub === "--finalize-session") {
    cmdFinalizeSession(args.slice(1));
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
