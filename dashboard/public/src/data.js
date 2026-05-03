// ============================================================
// HARNESS · API client
// 调用后端 REST + SSE，规范化数据形状供 stores 使用
// ============================================================

// —— 时间解析（Beijing wall-clock → 真 UTC ms）
// F-021: 字符串是北京时间（CLAUDE.md 工作约定 #7），需要减 8h 才是 UTC ms
// 否则 vs Date.now() 比较会出现 8 小时偏差（"-28144s ago" 负数 bug 源头）
export function parseTs(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/);
  if (!m) return 0;
  return (
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 8 * 3600 * 1000
  );
}

// —— Generic fetch ——
export async function apiFetch(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status + " " + path);
  return r.json();
}

// ============================================================
// Normalization helpers
// ============================================================

// findings.md §section → display status
function sectionToStatus(section) {
  const map = { confirmed: "alive", hypothesis: "stale", dead_end: "archived" };
  return map[section] || "alive";
}

export function normalizeFinding(f) {
  return {
    id: f.id,
    title: f.title,
    status: sectionToStatus(f.section),
    body: f.body || "",
    related_q: [],
    related_h: [],
    updated_ms: f.ts ? parseTs(f.ts) : Date.now(),
  };
}

export function normalizeSkill(s) {
  // last_run_passes: null = never run, true = pass, false = error
  const pass =
    s.last_run_passes == null ? 0.5 : s.last_run_passes ? 0.92 : 0.35;
  return {
    id: s.name,
    family: "skill",
    freq: s.logs_count || s.calls_in_task || 0,
    pass,
    avgMs: 0,
    state: s.state || "idle",
    last_run_ts: s.last_run_ts,
    last_run_summary: s.last_run_summary || "",
    calls_in_task: s.calls_in_task || 0,
  };
}

export function normalizeTask(t) {
  return {
    task_id: t.id,
    session_id: t.session_id,
    label: t.label || "—",
    skill:
      Array.isArray(t.skills_used) && t.skills_used.length > 0
        ? t.skills_used[0]
        : "—",
    mode: t.mode || "unknown",
    helix_id: null,
    helix_phase: null,
    status: t.status || "done",
    started_ms: parseTs(t.started_at),
    duration_ms: t.duration_ms || null,
    tools: t.tool_calls || 0,
    files: 0,
    feedback: null,
    errors: t.errors || 0,
  };
}

export function normalizeHelixRun(r) {
  const phases_done = (r.phases || []).map((p) => p.phase);
  // current phase: next planned phase after last done
  let current = null;
  if (
    r.status === "running" &&
    r.phases_planned &&
    r.phases_planned.length > 0
  ) {
    const lastDone = phases_done[phases_done.length - 1];
    const idx = lastDone ? r.phases_planned.indexOf(lastDone) : -1;
    current = r.phases_planned[idx + 1] || r.phases_planned[0];
  }
  return {
    id: r.id,
    status: r.status || "done",
    started_ms: parseTs(r.started_at),
    phases_planned: r.phases_planned || [],
    phases_done,
    current,
    task_ids: [],
    promise: r.promise || (r.passes_all ? "COMPLETE" : null),
    task: r.task || "",
    failed_phases: r.failed_phases || [],
  };
}

// git log entry → progress entry
export function gitLogToProgress(g) {
  return {
    ts_ms: parseTs(g.date),
    commit: g.hash || "—",
    body: g.subject || "",
    findings: [],
  };
}

// ============================================================
// API fetch functions
// ============================================================

export async function fetchLive() {
  try {
    return await apiFetch("/api/live");
  } catch {
    return null;
  }
}

export async function fetchSessions() {
  try {
    return await apiFetch("/api/sessions");
  } catch {
    return [];
  }
}

export async function fetchSessionDetail(id) {
  try {
    return await apiFetch("/api/sessions/" + id);
  } catch {
    return null;
  }
}

export async function fetchEvolution() {
  try {
    return await apiFetch("/api/evolution");
  } catch {
    return {
      progress: [],
      findings: [],
      git_log: [],
      helix_runs: [],
      helix_latest: null,
    };
  }
}

export async function fetchSkills() {
  try {
    const raw = await apiFetch("/api/skills");
    return raw.map(normalizeSkill);
  } catch {
    return [];
  }
}

export async function fetchIntel() {
  try {
    return await apiFetch("/api/intel");
  } catch {
    return { findings: [], progress: [] };
  }
}

export async function fetchHealth() {
  try {
    return await apiFetch("/api/health");
  } catch {
    return null;
  }
}

export async function fetchHelixDetails(runId) {
  if (!runId) return null;
  try {
    return await apiFetch(
      "/api/helix/" + encodeURIComponent(runId) + "/details",
    );
  } catch {
    return null;
  }
}

export async function fetchSessionTimeline(sessionId) {
  if (!sessionId) return null;
  try {
    return await apiFetch(
      "/api/sessions/" + encodeURIComponent(sessionId) + "/timeline",
    );
  } catch {
    return null;
  }
}

// ============================================================
// SSE connection
// ============================================================

export function connectSSE(onMessage) {
  const es = new EventSource("/sse");
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };
  es.onerror = () => {};
  return es;
}

// ============================================================
// Derived insights (computed from real skill/finding data)
// ============================================================

export function deriveAnomalies(skills) {
  const anomalies = [];
  for (const s of skills) {
    if (s.pass < 0.5 && s.freq > 0) {
      anomalies.push({
        sigma: +2.5,
        severity: "err",
        metric: s.id + " 错误率",
        value: Math.round((1 - s.pass) * 100) + "%",
        baseline: "10%",
        skill: s.id,
      });
    } else if (s.state === "error") {
      anomalies.push({
        sigma: +2.0,
        severity: "warn",
        metric: s.id + " 最近运行失败",
        value: "error",
        baseline: "pass",
        skill: s.id,
      });
    }
  }
  return anomalies.slice(0, 4);
}

export function deriveNextActions(findings, skills) {
  const actions = [];
  let n = 1;

  for (const s of skills) {
    if (s.state === "error" && n <= 3) {
      actions.push({
        id: "N-" + String(n).padStart(3, "0"),
        priority: "high",
        title: "修复 " + s.id,
        body: "最近运行失败。" + (s.last_run_summary || ""),
        cmd: "node skills/" + s.id + "/run.cjs --check",
        skill: s.id,
      });
      n++;
    }
  }

  for (const f of findings) {
    if (f.status === "stale" && n <= 4) {
      actions.push({
        id: "N-" + String(n).padStart(3, "0"),
        priority: "med",
        title: "验证假设: " + f.id,
        body: f.title,
        cmd: 'grep -A 10 "' + f.id + '" _meta/findings.md',
        skill: null,
      });
      n++;
    }
  }

  if (actions.length === 0) {
    actions.push({
      id: "N-001",
      priority: "low",
      title: "检查 progress.md 更新",
      body: "确认最近任务已记录在进度日志中（铁律 1）。",
      cmd: "head -50 _meta/progress.md",
      skill: null,
    });
  }

  return actions;
}
