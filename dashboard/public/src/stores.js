// ============================================================
// HARNESS · Stores — real API + SSE
// data flows: boot → fetchAll → stores; SSE → live update
// ============================================================
import {
  fetchLive, fetchSessions, fetchSessionDetail,
  fetchEvolution, fetchSkills, fetchIntel, fetchHealth,
  connectSSE,
  normalizeFinding, normalizeSkill, normalizeTask, normalizeHelixRun, gitLogToProgress,
  deriveAnomalies, deriveNextActions,
  parseTs,
} from './data.js';

const atom = window.__atom;

// —— UI navigation ——
export const $route       = atom('live');
export const $cmdkOpen    = atom(false);
export const $drawerSkill = atom(null);

// —— Data stores ——
export const $events      = atom([]);
export const $tasks       = atom([]);
export const $helixRuns   = atom([]);
export const $skills      = atom([]);
export const $findings    = atom([]);
export const $hypotheses  = atom([]);
export const $questions   = atom([]);
export const $progress    = atom([]);
export const $anomalies   = atom([]);
export const $nextActions = atom([]);
export const $heatmap     = atom(new Array(14 * 24).fill(0));
export const $searchIndex = atom([]);
export const $liveState   = atom(null);

// —— Health / KPIs ——
export const $health = atom({
  ingest_lag_ms: 0,
  event_rate: 0,
  db_size_mb: 0,
  mem_mb: 0,
  cpu_idle: 1,
  workers: [],
  ingest_lag_series: new Array(30).fill(0),
  event_rate_series: new Array(30).fill(0),
  uptime_s: 0,
  sse_clients: 0,
  sessions: 0,
  tasks: 0,
});

export const $kpis = atom({
  events_total: 0,
  events_24h: 0,
  tasks_24h: 0,
  pass_rate: 0,
  active_skill_count: 0,
  finding_alive: 0,
  finding_stale: 0,
  unread_actions: 0,
});

export const $sseConnected = atom(false);

// ============================================================
// SSE: live event stream
// ============================================================
let _sseStarted = false;

function setupSSE() {
  if (_sseStarted) return;
  _sseStarted = true;

  const sse = connectSSE(msg => {
    if (msg.type === 'new_event') {
      const ev = msg.event;
      const frontendEvent = {
        id: Date.now() + Math.random(),
        ts_ms: parseTs(ev.ts) || Date.now(),
        ts: ev.ts || '',
        session_id: ev.session_id || '—',
        task_id: msg.task_id || null,
        skill_id: ev.skill || ev.tool_name || ev.hook_event || 'system',
        type: ev.hook_event || 'event',
        __new: true,
        payload: {
          duration_ms: null,
          status: ev.is_error ? 'failed' : 'ok',
          tool: ev.tool_name || null,
          file: (ev.tool_input && ev.tool_input.file_path) || null,
        },
      };
      $events.set([frontendEvent, ...$events.get()].slice(0, 80));
      const k = $kpis.get();
      $kpis.set({ ...k, events_total: k.events_total + 1, events_24h: k.events_24h + 1 });
    }
    if (msg.type === 'heartbeat') {
      refreshLive();
    }
  });

  sse.onopen = () => $sseConnected.set(true);
  sse.onerror = () => $sseConnected.set(false);
}

// ============================================================
// Refresh helpers
// ============================================================

async function refreshLive() {
  const live = await fetchLive();
  if (!live) return;
  $liveState.set(live);
  if (Array.isArray(live.skills) && live.skills.length > 0) {
    const skills = live.skills.map(normalizeSkill);
    $skills.set(skills);
    updateInsights(skills, $findings.get());
  }
  if (live.metrics) {
    const m = live.metrics;
    const k = $kpis.get();
    $kpis.set({
      ...k,
      tasks_24h: m.tasks_count || k.tasks_24h,
      active_skill_count: m.skills_total || k.active_skill_count,
      pass_rate: m.skills_total > 0
        ? parseFloat(((m.skills_done + m.skills_running) / m.skills_total).toFixed(2))
        : k.pass_rate,
    });
  }
}

async function refreshHealth() {
  const h = await fetchHealth();
  if (!h) return;
  const prev = $health.get();
  const rate = h.event_rate || 0;
  $health.set({
    ingest_lag_ms: 0,
    event_rate: rate,
    db_size_mb: h.jsonl_size_mb || 0,
    mem_mb: h.mem_mb || 0,
    cpu_idle: 0.97,
    workers: h.workers || [],
    ingest_lag_series: [...(prev.ingest_lag_series || []).slice(1), rate],
    event_rate_series: [...(prev.event_rate_series || []).slice(1), rate],
    uptime_s: h.uptime_s || 0,
    sse_clients: h.sse_clients || 0,
    sessions: h.sessions || 0,
    tasks: h.tasks || 0,
    skills_count: h.skills_count || 0,
    jsonl_size_bytes: h.jsonl_size_bytes || 0,
    mem_rss_mb: h.mem_rss_mb || 0,
    live_sessions: h.live_sessions || 0,
  });
}

function updateInsights(skills, findings) {
  $anomalies.set(deriveAnomalies(skills));
  $nextActions.set(deriveNextActions(findings, skills));
  const k = $kpis.get();
  $kpis.set({ ...k, unread_actions: $nextActions.get().length });
}

function buildSearchIndex() {
  const idx = [];
  $findings.get().forEach(f => idx.push({ kind: 'finding', ref: f.id, title: f.title, meta: `${f.status} · ${new Date(f.updated_ms).toLocaleString()}` }));
  $hypotheses.get().forEach(h => idx.push({ kind: 'hypothesis', ref: h.id, title: h.title, meta: h.status }));
  $questions.get().forEach(q => idx.push({ kind: 'question', ref: q.id, title: q.title, meta: q.status }));
  $skills.get().forEach(s => idx.push({ kind: 'skill', ref: s.id, title: s.id, meta: `${s.freq} runs · ${(s.pass * 100).toFixed(0)}% pass` }));
  $progress.get().forEach(p => idx.push({ kind: 'commit', ref: p.commit, title: p.body, meta: new Date(p.ts_ms).toLocaleString() }));
  $events.get().slice(0, 50).forEach(e => idx.push({ kind: 'event', ref: '#' + Math.floor(e.id).toString(16).slice(-6), title: `${e.type} · ${e.skill_id}`, meta: new Date(e.ts_ms).toLocaleTimeString() }));
  $searchIndex.set(idx);
}

// ============================================================
// Boot: fetch all data in parallel
// ============================================================
async function init() {
  const [live, evolution, skills, intel, health, sessions] = await Promise.all([
    fetchLive(),
    fetchEvolution(),
    fetchSkills(),
    fetchIntel(),
    fetchHealth(),
    fetchSessions(),
  ]);

  // skills
  const normalizedSkills = skills.length > 0 ? skills
    : (live && Array.isArray(live.skills) ? live.skills.map(normalizeSkill) : []);
  $skills.set(normalizedSkills);

  // findings (intel preferred — same parse as evolution but same endpoint)
  const rawFindings = (intel && intel.findings) || (evolution && evolution.findings) || [];
  const findings = rawFindings.map(normalizeFinding);
  $findings.set(findings);

  const alive = findings.filter(f => f.status === 'alive').length;
  const stale  = findings.filter(f => f.status === 'stale').length;

  // progress: use git_log (has real commit hashes)
  if (evolution && evolution.git_log && evolution.git_log.length > 0) {
    $progress.set(evolution.git_log.map(gitLogToProgress));
  }

  // helix runs
  if (evolution && evolution.helix_runs && evolution.helix_runs.length > 0) {
    $helixRuns.set(evolution.helix_runs.map(normalizeHelixRun));
  }

  // kpis
  if (live) {
    $liveState.set(live);
    const m = live.metrics || {};
    const evTotal = (health && health.events_processed) || 0;
    $kpis.set({
      events_total: evTotal,
      events_24h: (health && health.tasks ? health.tasks * 8 : 0) || ((m.tasks_count || 0) * 8),
      tasks_24h: m.tasks_count || (sessions ? sessions.reduce((acc, s) => acc + (s.task_count || 0), 0) : 0),
      pass_rate: m.skills_total > 0
        ? parseFloat(((m.skills_done + m.skills_running) / m.skills_total).toFixed(2))
        : 0.85,
      active_skill_count: m.skills_total || normalizedSkills.length,
      finding_alive: alive,
      finding_stale: stale,
      unread_actions: 0,
    });
  }

  // tasks: load from recent sessions
  if (sessions && sessions.length > 0) {
    const allTasks = [];
    for (const s of sessions.slice(0, 3)) {
      const detail = await fetchSessionDetail(s.id);
      if (detail && detail.tasks) {
        allTasks.push(...detail.tasks.map(normalizeTask));
      }
    }
    $tasks.set(allTasks);
  }

  // health
  if (health) {
    const rate = health.event_rate || 0;
    $health.set({
      ingest_lag_ms: 0,
      event_rate: rate,
      db_size_mb: health.jsonl_size_mb || 0,
      mem_mb: health.mem_mb || 0,
      cpu_idle: 0.97,
      workers: health.workers || [],
      ingest_lag_series: new Array(30).fill(rate),
      event_rate_series: new Array(30).fill(rate),
      uptime_s: health.uptime_s || 0,
      sse_clients: health.sse_clients || 0,
      sessions: health.sessions || 0,
      tasks: health.tasks || 0,
      skills_count: health.skills_count || 0,
      jsonl_size_bytes: health.jsonl_size_bytes || 0,
      mem_rss_mb: health.mem_rss_mb || 0,
      live_sessions: health.live_sessions || 0,
    });
  }

  // insights
  updateInsights(normalizedSkills, findings);

  // search index
  buildSearchIndex();

  // SSE
  setupSSE();

  // periodic refresh
  setInterval(refreshLive, 10_000);
  setInterval(refreshHealth, 15_000);
  setInterval(buildSearchIndex, 30_000);
}

init().catch(e => {
  console.error('[harness] init failed:', e.message);
});
