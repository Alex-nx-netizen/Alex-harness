// ============================================================
// HARNESS · Stores (nanostores)
// 模拟 SSE 推送 -> store -> view 的反应式数据流
// ============================================================
import M from './data.js';        // ensures data.js loads first
const atom = window.__atom;

// —— Atomic stores ——
export const $route       = atom('live');           // live | insights | health | findings | tasks | data
export const $events      = atom(M.events.slice(0, 60));
export const $tasks       = atom(M.tasks);
export const $helixRuns   = atom(M.helixRuns);
export const $skills      = atom(M.SKILLS);
export const $findings    = atom(M.findings);
export const $hypotheses  = atom(M.hypotheses);
export const $questions   = atom(M.questions);
export const $progress    = atom(M.progress);
export const $anomalies   = atom(M.anomalies);
export const $nextActions = atom(M.nextActions);
export const $health      = atom(M.health);
export const $kpis        = atom(M.kpis);
export const $heatmap     = atom(M.heatmap);

// —— UI state ——
export const $cmdkOpen     = atom(false);
export const $drawerSkill  = atom(null);     // skill_id 或 null

// —— Simulated SSE: every 5-12s a new event ——
function tick() {
  const ev = M.genEvent(Date.now());
  ev.__new = true;                            // 用于 flash 动画
  $events.set([ev, ...$events.get()].slice(0, 80));

  // 偶尔更新 KPI
  const kpis = $kpis.get();
  $kpis.set({
    ...kpis,
    events_total: kpis.events_total + 1,
    events_24h:   kpis.events_24h   + 1,
  });

  // 抖动 health 指标
  const h = $health.get();
  $health.set({
    ...h,
    ingest_lag_ms: Math.max(80, h.ingest_lag_ms + (Math.random() - 0.5) * 100),
    event_rate:    Math.max(2, h.event_rate + (Math.random() - 0.5) * 4),
    ingest_lag_series: [...h.ingest_lag_series.slice(1), Math.max(80, h.ingest_lag_ms + (Math.random()-0.5)*200)],
    event_rate_series: [...h.event_rate_series.slice(1), Math.max(2, h.event_rate + (Math.random()-0.5)*8)],
  });

  setTimeout(tick, 4_000 + Math.random() * 6_000);
}
setTimeout(tick, 1_500);

// —— Global search index (mock FTS) ——
function buildSearchIndex() {
  const idx = [];
  M.findings.forEach(f => idx.push({ kind: 'finding',  ref: f.id,           title: f.title,                meta: `${f.status} · ${new Date(f.updated_ms).toLocaleString()}` }));
  M.hypotheses.forEach(h => idx.push({ kind: 'hypothesis', ref: h.id,        title: h.title,                meta: h.status }));
  M.questions.forEach(q => idx.push({ kind: 'question', ref: q.id,           title: q.title,                meta: q.status }));
  M.SKILLS.forEach(s => idx.push({ kind: 'skill',    ref: s.id,             title: s.id,                   meta: `${s.freq} runs · ${(s.pass*100).toFixed(0)}% pass` }));
  M.progress.forEach(p => idx.push({ kind: 'commit',   ref: p.commit,        title: p.body,                 meta: new Date(p.ts_ms).toLocaleString() }));
  M.events.slice(0, 50).forEach(e => idx.push({ kind: 'event', ref: '#' + e.id, title: `${e.type} · ${e.skill_id}`, meta: new Date(e.ts_ms).toLocaleTimeString() }));
  return idx;
}
export const $searchIndex = atom(buildSearchIndex());
