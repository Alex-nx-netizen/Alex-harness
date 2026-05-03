#!/usr/bin/env node
// hooks/dashboard-emit.cjs
// PostToolUse / UserPromptSubmit / Stop hook for dashboard v0.2
// Appends raw + derived fields to _meta/live-events.jsonl
// MUST NEVER block main flow: try/catch all, stderr only, exit 0 always
// Design: design/dashboard-draft.md §4.1

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const JSONL_PATH = path.join(PROJECT_ROOT, "_meta", "live-events.jsonl");
const HELIX_CURRENT_RUN_PATH = path.join(
  PROJECT_ROOT,
  "_meta",
  ".helix-current-run.json",
);
const MAX_TOOL_OUTPUT_BYTES = 2048;
const MAX_LINE_BYTES = 8192;

// B4 + v0.7 dashboard 可视化：读 _meta/.helix-current-run.json
// 返回 {helix_run_id, last_completed_phase, last_phase_ts}（任意字段可为 null）
function readCurrentHelixState() {
  try {
    if (!fs.existsSync(HELIX_CURRENT_RUN_PATH)) return {};
    const obj = JSON.parse(fs.readFileSync(HELIX_CURRENT_RUN_PATH, "utf-8"));
    if (!obj || typeof obj !== "object") return {};
    return {
      helix_run_id:
        typeof obj.helix_run_id === "string" ? obj.helix_run_id : null,
      last_completed_phase:
        typeof obj.last_completed_phase === "string"
          ? obj.last_completed_phase
          : null,
      last_phase_ts:
        typeof obj.last_phase_ts === "string" ? obj.last_phase_ts : null,
    };
  } catch {
    return {};
  }
}

// 北京时间 YYYY-M-D HH:MM:SS（CLAUDE.md §工作约定 #7）
function bjTime(d = new Date()) {
  // d.getTime() 是 UTC ms；+8h 后用 UTC 方法读 = 北京 wall-clock，不依赖系统时区
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const Y = bj.getUTCFullYear();
  const M = bj.getUTCMonth() + 1;
  const D = bj.getUTCDate();
  const h = String(bj.getUTCHours()).padStart(2, "0");
  const m = String(bj.getUTCMinutes()).padStart(2, "0");
  const s = String(bj.getUTCSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function truncStr(s, max) {
  if (typeof s !== "string") return s;
  if (s.length <= max) return s;
  return s.slice(0, max) + `...[truncated; full=${s.length}]`;
}

function readStdinSync() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf-8"));
  } catch {
    return null;
  }
}

function deriveSkill(payload) {
  try {
    const ti = payload.tool_input || {};
    const txt = [ti.cwd, ti.path, ti.file_path, ti.command, payload.cwd]
      .filter(Boolean)
      .join(" ");
    const m = txt.match(/[\\/]skills[\\/]([^\\/\s'"]+)/);
    if (m) return m[1];
  } catch {}
  return null;
}

function buildEvent(p) {
  const helixState = readCurrentHelixState();
  const ev = {
    ts: bjTime(),
    session_id: p.session_id || null,
    hook_event: p.hook_event_name || "unknown",
    cwd: p.cwd || null,
    helix_run_id: helixState.helix_run_id || null, // B4
    helix_phase: helixState.last_completed_phase || null, // v0.7: 最近完成的 phase
    helix_phase_ts: helixState.last_phase_ts || null,
  };
  const he = ev.hook_event;
  if (he === "PostToolUse" || he === "PreToolUse") {
    ev.tool_name = p.tool_name || null;
    ev.tool_input = p.tool_input || null;
    let outStr = "";
    try {
      outStr =
        typeof p.tool_response === "string"
          ? p.tool_response
          : JSON.stringify(p.tool_response || "");
    } catch {}
    ev.tool_output_size = outStr.length;
    ev.tool_output_truncated = truncStr(outStr, MAX_TOOL_OUTPUT_BYTES);
    ev.skill = deriveSkill(p);
    ev.subagent_type =
      ev.tool_name === "Agent" || ev.tool_name === "Task"
        ? (p.tool_input || {}).subagent_type || null
        : null;
  } else if (he === "UserPromptSubmit") {
    const prompt = p.prompt || "";
    ev.prompt_preview = truncStr(prompt, 200);
    ev.prompt_size = prompt.length;
    const t = prompt.trim();
    ev.task_label = t.startsWith("/") ? t.split(/\s+/)[0] : truncStr(t, 60);
  } else if (he === "Stop") {
    ev.stop_hook_active = !!p.stop_hook_active;
  }
  return ev;
}

function main() {
  try {
    const payload = readStdinSync();
    if (!payload) return;
    const ev = buildEvent(payload);
    let line;
    try {
      line = JSON.stringify(ev);
    } catch (e) {
      process.stderr.write(`[dashboard-emit] stringify fail: ${e.message}\n`);
      return;
    }
    if (line.length > MAX_LINE_BYTES) {
      process.stderr.write(
        `[dashboard-emit] line too long (${line.length}); skipped\n`,
      );
      return;
    }
    // 校验可逆（CLAUDE.md §工作约定 #8）
    try {
      JSON.parse(line);
    } catch (e) {
      process.stderr.write(
        `[dashboard-emit] JSON validate fail: ${e.message}\n`,
      );
      return;
    }
    fs.mkdirSync(path.dirname(JSONL_PATH), { recursive: true });
    fs.appendFileSync(JSONL_PATH, line + "\n");
  } catch (e) {
    process.stderr.write(`[dashboard-emit] non-fatal: ${e.message}\n`);
  }
}

main();
process.exit(0);
