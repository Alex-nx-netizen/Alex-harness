#!/usr/bin/env node
"use strict";
// hooks/cron-heartbeat.cjs — 论文 §6⑦ HEARTBEAT cron（独立脚本）
//
// 默认行为（不推飞书，避免 F-020 重蹈）：
//   1. 跑 context-curator --autoreport（若 skill 不存在，则自己做最小汇总）
//   2. 把当天 helix-runs 摘要追加到 _meta/heartbeat.log
//
// --push-feishu flag 才推飞书；此时复用 session-reporter 的 cursor 机制（若可用）
//
// 触发方式（脚本本身只跑一次；定时由外部触发器决定）：
//   Linux cron:  */30 * * * * cd /path/to/Alex-harness && node hooks/cron-heartbeat.cjs
//   Windows Task Scheduler: 同上
//   Claude Code Skill schedule: 见 schedule skill
//
// CLI:
//   node hooks/cron-heartbeat.cjs              默认 local-only
//   node hooks/cron-heartbeat.cjs --push-feishu  额外推飞书
//   node hooks/cron-heartbeat.cjs --dry-run      不写文件、不推

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const HEARTBEAT_LOG = path.join(PROJECT_ROOT, "_meta", "heartbeat.log");
const HELIX_RUNS_JSONL = path.join(PROJECT_ROOT, "_meta", "helix-runs.jsonl");
const CONTEXT_CURATOR_RUN = path.join(
  PROJECT_ROOT,
  "skills",
  "context-curator",
  "run.cjs",
);
const SESSION_REPORTER_RUN = path.join(
  PROJECT_ROOT,
  "skills",
  "session-reporter",
  "run.cjs",
);

const FLAGS = process.argv.slice(2);
const PUSH_FEISHU = FLAGS.includes("--push-feishu");
const DRY_RUN = FLAGS.includes("--dry-run");

function bjNow() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

function bjToday() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  return `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()}`;
}

function readJsonlSafe(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  const out = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l));
    } catch {
      // skip corrupt lines, don't crash the heartbeat
    }
  }
  return out;
}

// 摘要：当天的 helix runs 数 / phase 通过率 / 最近一个 run 的状态
function summarizeHelixRuns() {
  const all = readJsonlSafe(HELIX_RUNS_JSONL);
  const today = bjToday();
  const todayEntries = all.filter((e) => {
    const ts = e.ts || "";
    return ts.startsWith(today + " ");
  });
  const startCount = todayEntries.filter((e) => e.type === "start").length;
  const phaseReports = todayEntries.filter((e) => e.type === "phase_report");
  const passes = phaseReports.filter((e) => e.passes === true).length;
  const fails = phaseReports.filter((e) => e.passes === false).length;
  const finalizes = todayEntries.filter((e) => e.type === "finalize").length;

  const lastRun = todayEntries[todayEntries.length - 1];
  return {
    date: today,
    today_starts: startCount,
    today_phase_reports: phaseReports.length,
    today_passes: passes,
    today_fails: fails,
    today_finalizes: finalizes,
    last_phase: lastRun ? lastRun.phase || lastRun.type : null,
    last_ts: lastRun ? lastRun.ts : null,
    total_lines: all.length,
  };
}

function tryRunContextCuratorAutoReport() {
  if (!fs.existsSync(CONTEXT_CURATOR_RUN)) return null;
  // context-curator 当前没有 --autoreport flag，但 dry-run 等价 read-only 摘要
  // 我们调用 dry-run；如果未来加了 --autoreport，可改这一行
  try {
    const r = spawnSync(
      "node",
      [CONTEXT_CURATOR_RUN, DRY_RUN ? "--dry-run" : "--phase=2"],
      {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
        timeout: 30000,
      },
    );
    return {
      exit: r.status,
      stdout_tail: (r.stdout || "").split("\n").slice(-10).join("\n"),
      stderr_tail: (r.stderr || "").split("\n").slice(-3).join("\n"),
    };
  } catch (e) {
    return { error: e.message };
  }
}

function tryPushFeishu(summary) {
  if (!fs.existsSync(SESSION_REPORTER_RUN)) {
    return {
      pushed: false,
      reason: "session-reporter/run.cjs missing",
    };
  }
  // 复用 session-reporter 的 cursor 机制（其 SKILL.md / run.cjs 已实现）
  // 这里只调它的 push 入口；具体 cursor 逻辑由 session-reporter 自己管
  try {
    const payload = JSON.stringify({
      source: "cron-heartbeat",
      summary,
      ts: bjNow(),
    });
    const r = spawnSync("node", [SESSION_REPORTER_RUN, "--push", payload], {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
      timeout: 60000,
    });
    return {
      pushed: r.status === 0,
      exit: r.status,
      stderr_tail: (r.stderr || "").split("\n").slice(-3).join("\n"),
    };
  } catch (e) {
    return { pushed: false, error: e.message };
  }
}

function appendHeartbeat(line) {
  if (DRY_RUN) {
    console.log(`[dry-run] would append: ${line}`);
    return;
  }
  fs.mkdirSync(path.dirname(HEARTBEAT_LOG), { recursive: true });
  fs.appendFileSync(HEARTBEAT_LOG, line + "\n", "utf-8");
}

function main() {
  const ts = bjNow();
  const summary = summarizeHelixRuns();
  const cc = tryRunContextCuratorAutoReport();

  const lineParts = [
    `[${ts}]`,
    `helix_today: starts=${summary.today_starts} phases=${summary.today_phase_reports} passes=${summary.today_passes} fails=${summary.today_fails} finalizes=${summary.today_finalizes}`,
    `last_phase=${summary.last_phase || "n/a"}`,
    cc ? `cc_exit=${cc.exit ?? "?"}` : "cc_skipped",
  ];

  let pushResult = null;
  if (PUSH_FEISHU) {
    pushResult = tryPushFeishu(summary);
    lineParts.push(
      `feishu_push=${pushResult.pushed ? "ok" : "fail(" + (pushResult.reason || pushResult.exit || pushResult.error || "?") + ")"}`,
    );
  } else {
    lineParts.push("feishu_push=skipped");
  }

  const line = lineParts.join("  ");
  appendHeartbeat(line);

  // 也打到 stdout，cron job 把它写到自己日志
  console.log(line);
  if (DRY_RUN) console.log("[dry-run] no files written");
}

try {
  main();
} catch (e) {
  // 永不阻塞 cron — 捕获所有错误，写到 stderr
  process.stderr.write(`[cron-heartbeat] non-fatal: ${e.message}\n`);
  process.exit(0);
}
