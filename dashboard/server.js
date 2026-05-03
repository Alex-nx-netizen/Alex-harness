"use strict";
/**
 * HARNESS Dashboard Server v0.3
 * - Tails _meta/live-events.jsonl
 * - Aggregates Session → Task two-layer model in memory
 * - REST API + SSE
 * - Zero external deps; Node stdlib only
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PORT = parseInt(process.env.HARNESS_DASHBOARD_PORT || "7777", 10);

// 项目根目录解析优先级：
//   1. HARNESS_PROJECT_ROOT  (用户自定义)
//   2. CLAUDE_PROJECT_DIR    (CC hook 注入；plugin 模式自动有)
//   3. process.cwd()         (从哪里启动就用哪里)
//   4. path.resolve(__dirname, "..")  (dashboard 装在 PROJ/dashboard/ 时的 fallback)
function resolveProjectRoot() {
  const candidates = [
    process.env.HARNESS_PROJECT_ROOT,
    process.env.CLAUDE_PROJECT_DIR,
    process.cwd(),
    path.resolve(__dirname, ".."),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      // 项目根的判定：含 _meta 或 skills 或 CLAUDE.md
      if (
        fs.existsSync(path.join(c, "_meta")) ||
        fs.existsSync(path.join(c, "skills")) ||
        fs.existsSync(path.join(c, "CLAUDE.md"))
      ) {
        return c;
      }
    } catch {}
  }
  return path.resolve(__dirname, "..");
}
const ROOT = resolveProjectRoot();
const META = path.join(ROOT, "_meta");
const PUBLIC = path.join(__dirname, "public");
const JSONL_PATH = path.join(META, "live-events.jsonl");

const TEAM_MODE_PARALLEL_WINDOW_MS = 500; // F-11: 设计 §6 mode 误判 mitigation
const TASK_EVENTS_CAP = 1000; // F-9: 内存 cap

/* ─────────────────────────────── time helpers ─────────────────────────────── */

function bjTime(d = new Date()) {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const Y = bj.getUTCFullYear();
  const M = bj.getUTCMonth() + 1;
  const D = bj.getUTCDate();
  const h = String(bj.getUTCHours()).padStart(2, "0");
  const m = String(bj.getUTCMinutes()).padStart(2, "0");
  const s = String(bj.getUTCSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function parseTs(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function tsDiffMs(a, b) {
  return parseTs(a) - parseTs(b);
}

/* ─────────────────────────────── jsonl helpers ─────────────────────────────── */

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
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
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/* ─────────────────────────────── Session/Task aggregator ─────────────────────────────── */

const sessions = new Map(); // session_id → Session
const tasks = new Map(); // task_id → Task
const taskCounters = new Map(); // session_id → next task n
const currentTaskBySession = new Map(); // session_id → task_id

function ensureSession(sid, ts) {
  if (sessions.has(sid)) return sessions.get(sid);
  const s = {
    id: sid,
    started_at: ts,
    last_event_at: ts,
    status: "live",
    task_ids: [],
  };
  sessions.set(sid, s);
  taskCounters.set(sid, 0);
  return s;
}

function newTask(sid, label, ts) {
  const n = (taskCounters.get(sid) || 0) + 1;
  taskCounters.set(sid, n);
  const tid = `${sid.slice(0, 8)}-t-${String(n).padStart(3, "0")}`;
  const t = {
    id: tid,
    session_id: sid,
    label: label || "<unlabeled>",
    started_at: ts,
    ended_at: null,
    status: "running",
    events: [],
    mode: "unknown",
    sub_agents: new Map(), // subagent_type → {name, events:[]}
    skills_used: new Set(),
    tool_calls: 0,
    errors: 0,
    agent_call_buffer: [],
    events_overflowed: 0,
  };
  tasks.set(tid, t);
  sessions.get(sid).task_ids.push(tid);
  currentTaskBySession.set(sid, tid);
  return t;
}

function finalizeTask(t, ts) {
  if (!t || t.status === "done") return;
  t.status = "done";
  t.ended_at = ts;
  if (t.mode === "unknown") t.mode = "independent";
}

function processEvent(ev) {
  const sid = ev.session_id;
  if (!sid) return null;
  const s = ensureSession(sid, ev.ts);
  s.last_event_at = ev.ts;

  if (ev.hook_event === "UserPromptSubmit") {
    const prevTid = currentTaskBySession.get(sid);
    if (prevTid) finalizeTask(tasks.get(prevTid), ev.ts);
    const t = newTask(sid, ev.task_label, ev.ts);
    t.events.push(ev);
    return t.id;
  }

  if (ev.hook_event === "Stop") {
    const tid = currentTaskBySession.get(sid);
    if (tid) {
      const t = tasks.get(tid);
      if (t) {
        t.events.push(ev);
        finalizeTask(t, ev.ts);
      }
    }
    return tid;
  }

  // PostToolUse / PreToolUse / 其他
  let tid = currentTaskBySession.get(sid);
  if (!tid) {
    const t = newTask(sid, "<no prompt seen>", ev.ts);
    tid = t.id;
  }
  const t = tasks.get(tid);
  t.events.push(ev);
  t.tool_calls += ev.hook_event === "PostToolUse" ? 1 : 0;
  // 只把"本项目内的 skill 名"加入 skills_used；外部 skill 路径误命中不算
  if (ev.skill && isProjectSkill(ev.skill)) t.skills_used.add(ev.skill);
  if (ev.is_error) t.errors += 1;

  // team mode 推断（设计 v0.2 §3.3）
  if (ev.tool_name === "Agent" || ev.tool_name === "Task") {
    if (ev.subagent_type) {
      if (!t.sub_agents.has(ev.subagent_type)) {
        t.sub_agents.set(ev.subagent_type, {
          name: ev.subagent_type,
          events: [],
        });
      }
      t.sub_agents.get(ev.subagent_type).events.push(ev);
    }
    t.agent_call_buffer.push({ ts: ev.ts, subagent_type: ev.subagent_type });
    const last = t.agent_call_buffer[t.agent_call_buffer.length - 1];
    for (const a of t.agent_call_buffer) {
      if (a === last) continue;
      if (Math.abs(tsDiffMs(a.ts, last.ts)) < TEAM_MODE_PARALLEL_WINDOW_MS) {
        t.mode = "team";
        break;
      }
    }
  }

  // 事件 cap (F-9)
  if (t.events.length > TASK_EVENTS_CAP) {
    t.events = t.events.slice(-TASK_EVENTS_CAP);
    t.events_overflowed += 1;
  }

  return tid;
}

/* ─────────────────────────────── tail live-events.jsonl ─────────────────────────────── */

let tailOffset = 0;
let tailBuffer = "";

// Rolling event rate: count events in last 60s windows
let _eventTimes = [];
function recordEventTime() {
  const now = Date.now();
  _eventTimes.push(now);
  // keep only last 60s
  const cutoff = now - 60_000;
  _eventTimes = _eventTimes.filter(t => t > cutoff);
}
function getEventRate() {
  const now = Date.now();
  const cutoff = now - 60_000;
  const recent = _eventTimes.filter(t => t > cutoff);
  return parseFloat((recent.length / 60).toFixed(2)); // per second
}

function tailRead() {
  try {
    if (!fs.existsSync(JSONL_PATH)) return;
    const stat = fs.statSync(JSONL_PATH);
    if (stat.size < tailOffset) {
      // file shrunk (truncated externally) — restart from 0
      tailOffset = 0;
      tailBuffer = "";
    }
    if (stat.size === tailOffset) return;
    const fd = fs.openSync(JSONL_PATH, "r");
    const len = stat.size - tailOffset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, tailOffset);
    fs.closeSync(fd);
    tailOffset = stat.size;
    tailBuffer += buf.toString("utf8");
    let nl;
    while ((nl = tailBuffer.indexOf("\n")) >= 0) {
      const line = tailBuffer.slice(0, nl);
      tailBuffer = tailBuffer.slice(nl + 1);
      if (!line.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      const tid = processEvent(ev);
      recordEventTime();
      broadcast({ type: "new_event", event: ev, task_id: tid });
    }
  } catch (e) {
    process.stderr.write(`[tail] ${e.message}\n`);
  }
}

function bootstrapFromDisk() {
  // load all existing events on boot
  const all = readJsonl(JSONL_PATH);
  for (const ev of all) processEvent(ev);
  try {
    tailOffset = fs.existsSync(JSONL_PATH) ? fs.statSync(JSONL_PATH).size : 0;
  } catch {}
  // mark sessions whose last event > 30 min as ended
  for (const s of sessions.values()) {
    if (parseTs(bjTime()) - parseTs(s.last_event_at) > 30 * 60 * 1000) {
      s.status = "ended";
      for (const tid of s.task_ids) {
        const t = tasks.get(tid);
        if (t && t.status === "running") finalizeTask(t, s.last_event_at);
      }
    }
  }
}

/* ─────────────────────────────── skills scan ─────────────────────────────── */

// 项目内的 skill 目录候选（不扫全局 ~/.claude/skills/）
function projectSkillDirs() {
  const candidates = new Set();
  if (process.env.HARNESS_SKILLS_DIRS) {
    for (const d of process.env.HARNESS_SKILLS_DIRS.split(path.delimiter)) {
      if (d) candidates.add(d);
    }
  }
  candidates.add(path.join(ROOT, "skills"));
  candidates.add(path.join(ROOT, ".claude", "skills"));
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    candidates.add(path.join(process.env.CLAUDE_PLUGIN_ROOT, "skills"));
  }
  return Array.from(candidates).filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

// 缓存项目 skill 名集合（启动后扫一次，每 30s 续期）
let _projectSkillsCache = null;
let _projectSkillsCacheAt = 0;
function getProjectSkillNamesSet() {
  const now = Date.now();
  if (_projectSkillsCache && now - _projectSkillsCacheAt < 30_000)
    return _projectSkillsCache;
  const set = new Set();
  for (const dir of projectSkillDirs()) {
    try {
      for (const name of fs.readdirSync(dir)) {
        const sub = path.join(dir, name);
        try {
          if (
            fs.statSync(sub).isDirectory() &&
            fs.existsSync(path.join(sub, "SKILL.md"))
          ) {
            set.add(name);
          }
        } catch {}
      }
    } catch {}
  }
  _projectSkillsCache = set;
  _projectSkillsCacheAt = now;
  return set;
}
function isProjectSkill(name) {
  return getProjectSkillNamesSet().has(name);
}

function listAllSkills() {
  const out = new Map();
  for (const dir of projectSkillDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const skillDir = path.join(dir, name);
      try {
        if (!fs.statSync(skillDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const skillMd = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      if (out.has(name)) continue;
      const logs = readJsonl(path.join(skillDir, "logs", "runs.jsonl"));
      out.set(name, {
        name,
        dir: skillDir,
        logs_count: logs.length,
        last_log: logs[logs.length - 1] || null,
      });
    }
  }
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getCurrentTaskSkillUsage() {
  // 看当前 live session 的 current task 的 events
  const list = Array.from(sessions.values()).sort(
    (a, b) => parseTs(b.last_event_at) - parseTs(a.last_event_at),
  );
  const live = list.find((s) => s.status === "live") || list[0];
  if (!live)
    return {
      task: null,
      skills_in_task: new Map(),
      latest_skill: null,
      latest_event_ts: null,
    };
  const tid = currentTaskBySession.get(live.id);
  if (!tid)
    return {
      task: null,
      skills_in_task: new Map(),
      latest_skill: null,
      latest_event_ts: null,
    };
  const t = tasks.get(tid);
  if (!t)
    return {
      task: null,
      skills_in_task: new Map(),
      latest_skill: null,
      latest_event_ts: null,
    };
  const counts = new Map();
  let latestSkill = null,
    latestTs = null;
  for (const ev of t.events) {
    if (ev.skill) {
      counts.set(ev.skill, (counts.get(ev.skill) || 0) + 1);
      latestSkill = ev.skill;
      latestTs = ev.ts;
    }
  }
  return {
    task: t,
    skills_in_task: counts,
    latest_skill: latestSkill,
    latest_event_ts: latestTs,
  };
}

function getSkillsWithState() {
  const all = listAllSkills();
  const usage = getCurrentTaskSkillUsage();
  const helix = latestHelixRun();
  const helixActivePhase =
    helix && helix.status === "running"
      ? (helix.phases || []).slice(-1)[0]?.phase
      : null;
  const nowMs = parseTs(bjTime());
  return all.map((s) => {
    let state = "idle";
    let last_seen = null;
    let calls_in_task = 0;
    if (usage.skills_in_task.has(s.name)) {
      calls_in_task = usage.skills_in_task.get(s.name);
      // is it currently active?
      if (
        usage.latest_skill === s.name &&
        usage.latest_event_ts &&
        nowMs - parseTs(usage.latest_event_ts) < 60_000
      ) {
        state = "running";
      } else {
        state = "done";
      }
      last_seen = usage.latest_event_ts;
    }
    if (s.last_log?.passes === false) state = "error";
    if (helixActivePhase === s.name) state = "running";
    return {
      name: s.name,
      state,
      calls_in_task,
      logs_count: s.logs_count,
      last_run_ts: s.last_log?.ts || last_seen,
      last_run_passes: s.last_log?.passes ?? null,
      last_run_summary: (s.last_log?.summary || "").slice(0, 80),
    };
  });
}

/* ─────────────────────────────── helix-runs ─────────────────────────────── */

function getHelixRuns(limit = 50) {
  const lines = readJsonl(path.join(META, "helix-runs.jsonl"));
  const runs = new Map();
  for (const e of lines) {
    const id = e.helix_run_id;
    if (!id) continue;
    if (!runs.has(id)) runs.set(id, { id, phases: [], status: "running" });
    const r = runs.get(id);
    if (e.type === "start") {
      Object.assign(r, {
        task: (e.task || "").slice(0, 200),
        started_at: e.ts,
        phases_planned: e.phases_planned || [],
        status: "running",
      });
    } else if (e.type === "phase_report") {
      r.phases.push({
        phase: e.phase,
        passes: e.passes,
        ts: e.ts,
        summary: (e.summary || "").slice(0, 120),
        duration_ms: e.duration_ms,
        errors: Array.isArray(e.errors) ? e.errors : [],
      });
    } else if (e.type === "finalize") {
      Object.assign(r, {
        status: e.status || "done",
        promise: e.promise,
        finished_at: e.ts,
        passes_all: e.passes_all,
        failed_phases: e.failed_phases || [],
      });
    }
  }
  return Array.from(runs.values()).slice(-limit).reverse();
}

function latestHelixRun() {
  const runs = getHelixRuns(1);
  return runs[0] || null;
}

/* ─────────────────────────────── evolution data ─────────────────────────────── */

function readProgressEntries(limit = 60) {
  const file = path.join(META, "progress.md");
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const entries = [];
  let cur = null;
  // progress.md：约定"最新在最上"，每条以 `## ` 或 `### ` 标题开头，下面带正文
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (m) {
      if (cur) entries.push(cur);
      cur = { title: m[2].trim(), level: m[1].length, body: "" };
      // 标题里抓 ts 信息（如有 "2026-5-2"）
      const tsM = m[2].match(
        /(\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?)/,
      );
      cur.ts = tsM ? tsM[1] : null;
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    }
    if (entries.length >= limit) break;
  }
  if (cur && entries.length < limit) entries.push(cur);
  return entries
    .slice(0, limit)
    .map((e) => ({ ...e, body: e.body.slice(0, 500) }));
}

function readFindings(limit = 30) {
  const file = path.join(META, "findings.md");
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, "utf8");
  const out = [];
  let cur = null;
  let section = "confirmed";
  for (const line of content.split(/\r?\n/)) {
    if (/^## 已验证/.test(line)) {
      if (cur) out.push(cur);
      cur = null;
      section = "confirmed";
      continue;
    }
    if (/^## 待验证/.test(line)) {
      if (cur) out.push(cur);
      cur = null;
      section = "hypothesis";
      continue;
    }
    if (/^## 死路/.test(line)) {
      if (cur) out.push(cur);
      cur = null;
      section = "dead_end";
      continue;
    }
    const m = line.match(/^### (F-\d+|H-\d+|D-\d+)[:\s]+(.*)/);
    if (m) {
      if (cur) out.push(cur);
      cur = { id: m[1], title: m[2].trim(), section, body: "" };
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    }
  }
  if (cur) out.push(cur);
  return out
    .slice(0, limit)
    .map((f) => ({ ...f, body: f.body.trim().slice(0, 400) }));
}

function readGitLog(limit = 40) {
  try {
    const out = execFileSync(
      "git",
      [
        "-C",
        ROOT,
        "log",
        `-${limit}`,
        "--pretty=format:%h%ad%s",
        "--date=format:%Y-%m-%d %H:%M:%S",
      ],
      { encoding: "utf8" },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [hash, date, subject] = l.split("");
        return { hash, date, subject };
      });
  } catch (e) {
    return [];
  }
}

function readTaskPlan() {
  const file = path.join(META, "task_plan.md");
  if (!fs.existsSync(file)) return { content: "", entries: [] };
  const content = fs.readFileSync(file, "utf8");
  // 简化：返回原文 + 顶层结构（前 200 行裁剪）
  const lines = content.split("\n").slice(0, 250);
  return { content: lines.join("\n"), totalLines: content.split("\n").length };
}

function getEvolution() {
  return {
    progress: readProgressEntries(50),
    findings: readFindings(30),
    git_log: readGitLog(40),
    task_plan: readTaskPlan(),
    helix_latest: latestHelixRun(),
    helix_runs: getHelixRuns(20),
  };
}

/* ─────────────────────────────── REST views ─────────────────────────────── */

function viewSession(s) {
  return {
    id: s.id,
    started_at: s.started_at,
    last_event_at: s.last_event_at,
    status: s.status,
    task_count: s.task_ids.length,
    duration_ms: parseTs(s.last_event_at) - parseTs(s.started_at),
    helix_runs_in_session: s.task_ids
      .map((tid) => tasks.get(tid))
      .filter((t) => t && t.label && t.label.startsWith("/helix")).length,
    team_tasks: s.task_ids
      .map((tid) => tasks.get(tid))
      .filter((t) => t && t.mode === "team").length,
  };
}

function viewTaskSummary(t) {
  return {
    id: t.id,
    session_id: t.session_id,
    label: t.label,
    started_at: t.started_at,
    ended_at: t.ended_at,
    status: t.status,
    mode: t.mode,
    duration_ms: t.ended_at
      ? parseTs(t.ended_at) - parseTs(t.started_at)
      : null,
    tool_calls: t.tool_calls,
    errors: t.errors,
    skills_used: Array.from(t.skills_used),
    sub_agents: Array.from(t.sub_agents.keys()),
    events_count: t.events.length,
    events_overflowed: t.events_overflowed,
  };
}

function viewTaskDetail(t) {
  return {
    ...viewTaskSummary(t),
    events: t.events,
    sub_agents_detail: Array.from(t.sub_agents.entries()).map(
      ([name, info]) => ({
        name,
        events: info.events,
        events_count: info.events.length,
      }),
    ),
  };
}

function getCurrentLiveState() {
  // 最近活跃 session（按 last_event_at 倒序）
  const list = Array.from(sessions.values()).sort(
    (a, b) => parseTs(b.last_event_at) - parseTs(a.last_event_at),
  );
  const live = list.find((s) => s.status === "live") || list[0] || null;
  if (!live) return { session: null, current_task: null, recent_event: null };
  const lastTid = currentTaskBySession.get(live.id);
  const curTask = lastTid ? tasks.get(lastTid) : null;
  return {
    session: viewSession(live),
    current_task: curTask ? viewTaskDetail(curTask) : null,
    helix_latest: latestHelixRun(),
    skills: getSkillsWithState(),
    metrics: computeMetrics(live, curTask),
  };
}

function computeMetrics(session, currentTask) {
  // 用户视角的 6 个有意义 metric（替代 token/费用）
  const helix = latestHelixRun();
  const phaseDone = helix?.phases?.length || 0;
  const phaseTotal = (helix?.phases_planned || []).length || 0;
  const skills = getSkillsWithState();
  const runningSkill = skills.find((s) => s.state === "running");
  return {
    tasks_count: session?.task_count ?? 0,
    duration_ms: session
      ? parseTs(session.last_event_at) - parseTs(session.started_at)
      : 0,
    current_skill:
      runningSkill?.name || currentTask?.events?.slice(-1)[0]?.skill || null,
    mode: currentTask?.mode || "—",
    errors: currentTask?.errors ?? 0,
    helix_phase: phaseTotal ? `${phaseDone}/${phaseTotal}` : "—",
    helix_status: helix?.status || null,
    helix_id: helix?.id || null,
    skills_running: skills.filter((s) => s.state === "running").length,
    skills_done: skills.filter((s) => s.state === "done").length,
    skills_error: skills.filter((s) => s.state === "error").length,
    skills_idle: skills.filter((s) => s.state === "idle").length,
    skills_total: skills.length,
  };
}

/* ─────────────────────────────── SSE ─────────────────────────────── */

const clients = new Set();

function broadcast(msg) {
  if (clients.size === 0) return;
  let payload;
  try {
    payload = JSON.stringify(msg);
  } catch {
    return;
  }
  const line = `data: ${payload}\n\n`;
  for (const res of clients) {
    try {
      res.write(line);
    } catch {
      clients.delete(res);
    }
  }
}

setInterval(() => broadcast({ type: "heartbeat", ts: bjTime() }), 15000);

/* ─────────────────────────────── HTTP ─────────────────────────────── */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, data, status = 200) {
  let body;
  try {
    body = JSON.stringify(data);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(`{"error":"${e.message}"}`);
    return;
  }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const reqPath = url === "/" ? "/index.html" : url;
  // SPA fallback：如果路径不是已知静态扩展且不是 /api、/sse，回 index.html
  let file = path.join(PUBLIC, reqPath);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (!path.extname(reqPath)) {
      file = path.join(PUBLIC, "index.html"); // SPA fallback
    } else {
      res.writeHead(404);
      res.end("not found");
      return;
    }
  }
  const ct = MIME[path.extname(file).toLowerCase()] || "text/plain";
  res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/sse") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");
    res.write(`data: ${JSON.stringify({ type: "hello", ts: bjTime() })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url === "/api/live") return sendJson(res, getCurrentLiveState());
  if (url === "/api/sessions") {
    const list = Array.from(sessions.values())
      .sort((a, b) => parseTs(b.last_event_at) - parseTs(a.last_event_at))
      .map(viewSession);
    return sendJson(res, list);
  }
  const sm = url.match(/^\/api\/sessions\/([^/]+)$/);
  if (sm) {
    const s = sessions.get(sm[1]);
    if (!s) return sendJson(res, { error: "not found" }, 404);
    return sendJson(res, {
      ...viewSession(s),
      tasks: s.task_ids
        .map((tid) => tasks.get(tid))
        .filter(Boolean)
        .map(viewTaskSummary),
    });
  }
  const tm = url.match(/^\/api\/tasks\/([^/]+)$/);
  if (tm) {
    const t = tasks.get(tm[1]);
    if (!t) return sendJson(res, { error: "not found" }, 404);
    return sendJson(res, viewTaskDetail(t));
  }
  if (url === "/api/evolution") return sendJson(res, getEvolution());
  if (url === "/api/skills") return sendJson(res, getSkillsWithState());
  if (url === "/api/intel") {
    return sendJson(res, {
      findings: readFindings(40),
      progress: readProgressEntries(40),
    });
  }
  if (url === "/api/health") {
    const memUsage = process.memoryUsage();
    let jsonlSize = 0;
    try { jsonlSize = fs.existsSync(JSONL_PATH) ? fs.statSync(JSONL_PATH).size : 0; } catch {}
    return sendJson(res, {
      ok: true,
      port: PORT,
      sessions: sessions.size,
      tasks: tasks.size,
      live_sessions: Array.from(sessions.values()).filter(s => s.status === 'live').length,
      sse_clients: clients.size,
      event_rate: getEventRate(),
      events_processed: tailOffset,
      jsonl_size_bytes: jsonlSize,
      jsonl_size_mb: parseFloat((jsonlSize / 1024 / 1024).toFixed(2)),
      mem_mb: parseFloat((memUsage.heapUsed / 1024 / 1024).toFixed(1)),
      mem_rss_mb: parseFloat((memUsage.rss / 1024 / 1024).toFixed(1)),
      uptime_s: Math.floor(process.uptime()),
      skills_count: getProjectSkillNamesSet().size,
      workers: [
        { name: 'ingest',  status: 'running', last_beat_ms: Date.now(), payload: { processed: tailOffset } },
        { name: 'sse',     status: clients.size > 0 ? 'running' : 'idle', last_beat_ms: Date.now(), payload: { clients: clients.size } },
      ],
    });
  }

  serveStatic(req, res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(
      `[dashboard] port ${PORT} 已被占用 — 可能已在运行 → http://127.0.0.1:${PORT}`,
    );
  } else {
    console.error(`[dashboard] error: ${err.message}`);
  }
  process.exit(0);
});

/* ─────────────────────────────── boot ─────────────────────────────── */

bootstrapFromDisk();
try {
  fs.watch(JSONL_PATH, { persistent: true }, () => tailRead());
} catch {
  // file may not exist yet — poll fallback
  setInterval(tailRead, 1000);
}
// also poll every 1s as belt-and-suspenders (fs.watch unreliable on Win)
setInterval(tailRead, 1000);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[dashboard] listening on 127.0.0.1:${PORT}`);
  console.log(
    `[dashboard] sessions=${sessions.size} tasks=${tasks.size} (loaded from disk)`,
  );
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
