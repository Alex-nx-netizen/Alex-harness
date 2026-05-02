// ============================================================
// HARNESS · Mock data generator
// 模拟真实后端会推过来的事件 / 任务 / finding / insight
// ============================================================

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const SKILLS = [
  { id: 'helix-coder',     family: 'code',   freq: 142, pass: 0.94, avgMs: 6400  },
  { id: 'a4-planner',      family: 'plan',   freq: 88,  pass: 0.89, avgMs: 4200  },
  { id: 'a2-repo-sensor',  family: 'sense',  freq: 76,  pass: 0.62, avgMs: 1800  },
  { id: 'doc-curator',     family: 'doc',    freq: 54,  pass: 0.91, avgMs: 3100  },
  { id: 'test-runner',     family: 'verify', freq: 48,  pass: 0.83, avgMs: 9200  },
  { id: 'progress-writer', family: 'doc',    freq: 31,  pass: 0.95, avgMs: 1200  },
  { id: 'fs-scanner',      family: 'sense',  freq: 26,  pass: 0.81, avgMs: 800   },
  { id: 'cmd-executor',    family: 'exec',   freq: 19,  pass: 0.74, avgMs: 5500  },
  { id: 'finding-archiver',family: 'doc',    freq: 12,  pass: 0.92, avgMs: 600   },
];

const SESSIONS = [
  's-2026-05-03-001',
  's-2026-05-03-002',
  's-2026-05-02-014',
];

// —— Events ——
const EVT_TYPES = ['task_start','task_done','tool_call','skill_load','skill_done','finding_added','progress_appended','file_touched'];

function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randBetween(a,b){ return a + Math.random() * (b-a); }

function genEvent(ts) {
  const skill = rand(SKILLS);
  const type = rand(EVT_TYPES);
  const failed = type === 'skill_done' && Math.random() > skill.pass;
  return {
    id: Math.floor(ts),
    ts_ms: ts,
    ts: new Date(ts).toISOString(),
    session_id: rand(SESSIONS),
    task_id: 'T-' + Math.floor(ts/1000 % 99999).toString(36),
    skill_id: skill.id,
    type,
    payload: {
      duration_ms: type === 'skill_done' ? Math.floor(skill.avgMs * randBetween(0.7, 1.5)) : null,
      status: failed ? 'failed' : 'ok',
      tool: type === 'tool_call' ? rand(['fs.read','fs.write','sh.run','sqlite.query']) : null,
      file: type === 'file_touched' ? rand(['src/server.js','progress.md','findings.md','schema.sql']) : null,
    },
  };
}

const events = [];
for (let i = 0; i < 240; i++) {
  events.push(genEvent(NOW - i * randBetween(8_000, 60_000)));
}
events.sort((a,b) => b.ts_ms - a.ts_ms);

// —— Helix runs (multi-phase workflows) ——
const helixRuns = [
  { id: 'helix-2k4f1', status: 'running', started_ms: NOW - 4*MIN,  phases_planned: ['analyze','plan','code','test','review','commit'], phases_done: ['analyze','plan'], current: 'code', task_ids: ['T-2k4f1'] },
  { id: 'helix-2k4c8', status: 'done',    started_ms: NOW - 47*MIN, phases_planned: ['analyze','plan','code','test','commit'],         phases_done: ['analyze','plan','code','test','commit'], current: null, task_ids: ['T-2k4c8','T-2k4b1','T-2k49a'], promise: 'COMPLETE' },
  { id: 'helix-2k47b', status: 'done',    started_ms: NOW - 142*MIN,phases_planned: ['analyze','plan','code','test','commit'],         phases_done: ['analyze','plan','code','test','commit'], current: null, task_ids: ['T-2k47b'], promise: 'COMPLETE' },
];

// —— Tasks (derived) ——
const tasks = [
  { task_id: 'T-2k4f1', session_id: 's-2026-05-03-001', skill: 'helix-coder',    mode: 'team',        helix_id: 'helix-2k4f1', helix_phase: 'code',   status: 'running', started_ms: NOW - 4*MIN,  duration_ms: null,    tools: 8,  files: 3, feedback: null, label: '为 dashboard v2 加 ⌘K' },
  { task_id: 'T-2k4ee', session_id: 's-2026-05-03-001', skill: 'a4-planner',     mode: 'team',        helix_id: 'helix-2k4f1', helix_phase: 'plan',   status: 'done',    started_ms: NOW - 18*MIN, duration_ms: 320_000, tools: 12, files: 1, feedback: 1,    label: '规划 cmdk + skill drawer' },
  { task_id: 'T-2k4d2', session_id: 's-2026-05-03-001', skill: 'a2-repo-sensor', mode: 'independent', helix_id: null,           helix_phase: null,     status: 'failed',  started_ms: NOW - 32*MIN, duration_ms: 8_400,   tools: 3,  files: 0, feedback: -1,   label: '扫描仓库改动' },
  { task_id: 'T-2k4c8', session_id: 's-2026-05-03-001', skill: 'helix-coder',    mode: 'team',        helix_id: 'helix-2k4c8', helix_phase: 'code',   status: 'done',    started_ms: NOW - 47*MIN, duration_ms: 412_000, tools: 22, files: 8, feedback: 1,    label: '实现 SSE patch worker' },
  { task_id: 'T-2k4b1', session_id: 's-2026-05-03-001', skill: 'test-runner',    mode: 'team',        helix_id: 'helix-2k4c8', helix_phase: 'test',   status: 'done',    started_ms: NOW - 73*MIN, duration_ms: 89_000,  tools: 4,  files: 0, feedback: 0,    label: '跑 SSE worker 单测' },
  { task_id: 'T-2k49a', session_id: 's-2026-05-03-001', skill: 'doc-curator',    mode: 'team',        helix_id: 'helix-2k4c8', helix_phase: 'commit', status: 'done',    started_ms: NOW - 92*MIN, duration_ms: 156_000, tools: 6,  files: 4, feedback: 1,    label: '更新 progress.md + 提交' },
  { task_id: 'T-2k48f', session_id: 's-2026-05-03-002', skill: 'a2-repo-sensor', mode: 'independent', helix_id: null,           helix_phase: null,     status: 'failed',  started_ms: NOW - 115*MIN,duration_ms: 2_100,   tools: 1,  files: 0, feedback: -1,   label: 'fs.statSync EACCES 复现' },
  { task_id: 'T-2k47b', session_id: 's-2026-05-03-002', skill: 'helix-coder',    mode: 'team',        helix_id: 'helix-2k47b', helix_phase: 'code',   status: 'done',    started_ms: NOW - 142*MIN,duration_ms: 268_000, tools: 14, files: 5, feedback: 1,    label: '修 dead_letter 处理路径' },
];

// —— Findings ——
const findings = [
  { id: 'F-012', title: 'a2-repo-sensor 在 node_modules 路径上 fs.statSync 抛 EACCES', status: 'alive',    related_q: ['Q6'], related_h: ['H-008'], updated_ms: NOW - 12*MIN,  body: '24h 内 3 次失败均落在 fs.statSync(/Users/.../node_modules/.bin) · 建议 try/catch 后跳过。' },
  { id: 'F-011', title: 'helix-coder plan 阶段时长 +2.4σ',                            status: 'alive',    related_q: ['Q3'], related_h: ['H-006'], updated_ms: NOW - 38*MIN,  body: '最近 20 次 plan 平均 18.2s · 7 天基线 6.4s · 可能是 prompt 膨胀。' },
  { id: 'F-010', title: 'progress.md 与 commit 不对齐（铁律 1）',                      status: 'alive',    related_q: [],     related_h: [],         updated_ms: NOW - 2*HOUR,  body: '7 commit 未在 progress.md 留痕 · post-commit hook 缺失。' },
  { id: 'F-009', title: 'tool_calls/task 中位数下降至 6.2',                           status: 'alive',    related_q: ['Q7'], related_h: [],         updated_ms: NOW - 4*HOUR,  body: '从 12.8 降到 6.2 · 可能是过度精炼了 prompt 让 agent 跳步骤。' },
  { id: 'F-008', title: 'WAL 文件在 ARM64 macOS 上需要显式 fsync',                    status: 'alive',    related_q: ['Q8'], related_h: ['H-005'], updated_ms: NOW - 1*DAY,   body: '断电测试 3/10 出现部分写入 · 加 PRAGMA synchronous=FULL 解决。' },
  { id: 'F-007', title: '命令注入：cmd-executor 接受未转义参数',                       status: 'alive',    related_q: [],     related_h: [],         updated_ms: NOW - 2*DAY,   body: '所有命令必须走 execFile · 已在 Q9 改造中修复。' },
  { id: 'F-006', title: 'SSE 全量推导致前端 jank',                                    status: 'archived', related_q: [],     related_h: [],         updated_ms: NOW - 18*DAY,  body: 'M2 已上线 patch 协议 · 归档。' },
  { id: 'F-005', title: 'hypothesis H-005 14 天未被引用',                             status: 'stale',    related_q: [],     related_h: ['H-005'],  updated_ms: NOW - 16*DAY,  body: '建议归档或重新验证。' },
];

// —— Hypotheses ——
const hypotheses = [
  { id: 'H-008', title: 'fs 错误集中在 node_modules 子树',  status: 'validated', evidence: ['F-012'], updated_ms: NOW - 12*MIN },
  { id: 'H-006', title: 'plan 阶段慢 = prompt 注入了过多上下文', status: 'proposed',  evidence: ['F-011'], updated_ms: NOW - 38*MIN },
  { id: 'H-005', title: 'WAL 在断电时损坏需要 synchronous=FULL', status: 'validated', evidence: ['F-008'], updated_ms: NOW - 1*DAY },
];

// —— Questions ——
const questions = [
  { id: 'Q6', title: '为什么 a2-repo-sensor 错误率持续高位?', status: 'answered',  answer: 'F-012', updated_ms: NOW - 12*MIN },
  { id: 'Q3', title: 'plan 阶段为何越来越慢?',              status: 'open',      answer: null,    updated_ms: NOW - 38*MIN },
  { id: 'Q7', title: 'tool_calls/task 下降是好事还是坏事?',  status: 'open',      answer: null,    updated_ms: NOW - 4*HOUR },
  { id: 'Q8', title: 'sqlite WAL 需要哪些 PRAGMA 才稳?',    status: 'answered',  answer: 'F-008', updated_ms: NOW - 1*DAY },
];

// —— Progress entries ——
const progress = [
  { ts_ms: NOW - 8*MIN,  commit: 'c8f3a21', body: 'fix(a2-repo): try/catch on fs.statSync (F-012)', findings: ['F-012'] },
  { ts_ms: NOW - 36*MIN, commit: 'b1d4e09', body: 'feat(insight): z-score anomaly worker landed (F-011)', findings: ['F-011'] },
  { ts_ms: NOW - 2*HOUR, commit: 'a9c721d', body: 'chore(db): rollup 5min/1h/1d tables', findings: [] },
  { ts_ms: NOW - 5*HOUR, commit: '7e2f190', body: 'feat(ui): /v2 live view goes live', findings: [] },
  { ts_ms: NOW - 1*DAY,  commit: '4b8a019', body: 'fix(wal): synchronous=FULL on darwin-arm64 (F-008)', findings: ['F-008'] },
];

// —— Anomalies (insights) ——
const anomalies = [
  { sigma: +3.2, severity: 'err',  metric: 'a2-repo-sensor 错误率',     value: '60%',    baseline: '4%',    skill: 'a2-repo-sensor' },
  { sigma: +2.4, severity: 'warn', metric: 'helix plan 时长',          value: '18.2s',  baseline: '6.4s',  skill: 'helix-coder' },
  { sigma: -2.1, severity: 'info', metric: 'tool_calls / task',        value: '6.2',    baseline: '12.8',  skill: null },
  { sigma: +2.0, severity: 'warn', metric: 'dead_letter 增长',          value: '23/h',   baseline: '0.4/h', skill: null },
];

// —— Next actions ——
const nextActions = [
  { id: 'N-001', priority: 'high', title: '修 a2-repo-sensor/run.cjs', body: '24h 内失败 3 次，全部在 fs.statSync 上。', cmd: 'tail -n 200 logs/a2-repo-sensor.log | grep ERROR', skill: 'a2-repo-sensor' },
  { id: 'N-002', priority: 'med',  title: '追加 progress.md 条目',     body: '7 commit 未对应 progress 条目（铁律 1）。',  cmd: 'git log --since="7 days" --pretty=format:"%h %s" > /tmp/missed.txt', skill: null },
  { id: 'N-003', priority: 'low',  title: '归档 H-005 假设',           body: '14 天未被任何 finding 引用，建议归档。',     cmd: 'echo "H-005 archived" >> findings.md', skill: null },
  { id: 'N-004', priority: 'med',  title: '检查 dead_letter 表',       value: '23 行未解析 / 1h（基线 0.4）',             cmd: 'sqlite3 harness.db "SELECT * FROM dead_letter ORDER BY id DESC LIMIT 50"', skill: null, body: '可能是新事件类型未被 parser 覆盖。' },
];

// —— Heatmap (14 days × 24 hours) ——
function genHeatmap() {
  const cells = [];
  for (let d = 0; d < 14; d++) {
    for (let h = 0; h < 24; h++) {
      // 22-2 高峰，6-9 低谷，周末减半
      const isPeak = h >= 22 || h <= 2;
      const isWeekend = d % 7 === 5 || d % 7 === 6;
      const base = isPeak ? 0.85 : (h >= 9 && h <= 17 ? 0.55 : 0.2);
      const v = base * (isWeekend ? 0.5 : 1) * randBetween(0.6, 1.2);
      // 模拟一段 ingest 中断
      const blackout = (d === 4 && h >= 14 && h <= 17) ? 0 : 1;
      cells.push(Math.min(1, v) * blackout);
    }
  }
  return cells;
}
const heatmap = genHeatmap();

// —— Health metrics (time series, last 60 mins) ——
function genTimeSeries(min, max, n) {
  const out = [];
  let v = (min + max) / 2;
  for (let i = 0; i < n; i++) {
    v += randBetween(-0.15, 0.15) * (max - min);
    v = Math.max(min, Math.min(max, v));
    out.push(v);
  }
  return out;
}
const health = {
  ingest_lag_ms: 340,
  ingest_lag_series: genTimeSeries(150, 800, 60),
  event_rate: 18.4,
  event_rate_series: genTimeSeries(8, 35, 60),
  db_size_mb: 142.7,
  db_size_series: genTimeSeries(140, 144, 60),
  cpu_idle: 0.97,
  mem_mb: 108,
  workers: [
    { name: 'ingest',  status: 'running', last_beat_ms: NOW - 800,    payload: { processed: 12_402 } },
    { name: 'insight', status: 'running', last_beat_ms: NOW - 2_300,  payload: { runs: 144 } },
    { name: 'rollup',  status: 'running', last_beat_ms: NOW - 14_200, payload: { last: '5min' } },
    { name: 'fts-idx', status: 'running', last_beat_ms: NOW - 4_700,  payload: { docs: 8_241 } },
  ],
};

// —— KPI snapshots ——
const kpis = {
  events_total: 248_017,
  events_24h: 4_212,
  tasks_24h: 86,
  pass_rate: 0.847,
  active_skill_count: 9,
  finding_alive: 7,
  finding_stale: 1,
  unread_actions: 4,
};

// expose (legacy global + ES exports)
window.__MOCK = {
  SKILLS, SESSIONS, helixRuns,
  events, tasks,
  findings, hypotheses, questions, progress,
  anomalies, nextActions,
  heatmap,
  health,
  kpis,
  NOW,
  genEvent,
};
export { SKILLS, SESSIONS, helixRuns, events, tasks, findings, hypotheses, questions, progress, anomalies, nextActions, heatmap, health, kpis, NOW, genEvent };
export default window.__MOCK;
