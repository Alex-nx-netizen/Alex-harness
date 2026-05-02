// ============================================================
// HARNESS · App shell — sidebar / topbar / cmdk / drawer
// ============================================================
const html = window.__html;
const render = window.__render;
const { useState, useEffect, useMemo, useRef } = window.__hooks;
const useStore = window.__useStore;
import './views.js';                 // pulls components + stores transitively
const { Tag, StatusDot, Sparkline, fmtMs, fmtNum, fmtPct, relTime } = window.__C;

import { $route, $cmdkOpen, $drawerSkill, $events, $health, $kpis, $skills, $findings, $searchIndex } from './stores.js';
const { LiveView, InsightsView, HealthView, FindingsView, TasksView, DataView } = window.__VIEWS;

// —— Sidebar —— 
function Sidebar() {
  const route = useStore($route);
  const kpis = useStore($kpis);

  const items = [
    { id: 'live',     glyph: '◉', label: 'Live',          badge: '●' },
    { id: 'insights', glyph: '✦', label: 'Insights',      badge: kpis.unread_actions },
    { id: 'tasks',    glyph: '▤', label: 'Tasks',         badge: kpis.tasks_24h },
    { id: 'findings', glyph: '◆', label: 'Findings',      badge: kpis.finding_alive },
    { id: 'health',   glyph: '♥', label: 'Health',        badge: null },
    { id: 'data',     glyph: '▦', label: 'Data',          badge: null },
  ];

  return html`
    <aside class="sidebar">
      <div class="group">视图</div>
      ${items.map(it => html`
        <div class=${'nav-item' + (route === it.id ? ' active' : '')} onClick=${() => $route.set(it.id)}>
          <span class="glyph">${it.glyph}</span>
          <span>${it.label}</span>
          ${it.badge != null && html`<span class="badge">${it.badge}</span>`}
        </div>
      `)}

      <div class="group" style="margin-top:18px">SHORTCUTS</div>
      <div class="nav-item" onClick=${() => $cmdkOpen.set(true)}>
        <span class="glyph">⌘</span><span>搜索</span><span class="badge">⌘K</span>
      </div>
      <div class="nav-item">
        <span class="glyph">⤓</span><span>导出今日</span>
      </div>
      <div class="nav-item">
        <span class="glyph">⚙</span><span>设置</span>
      </div>

      <div style="margin-top:auto; padding:14px 12px; font-family:var(--ff-mono); font-size:10px; color:var(--t4); letter-spacing:.04em">
        v2.0.0-rc1 · darwin/arm64<br/>
        SQLite 3.45.1 + WAL<br/>
        4 workers · 8.2k events/min
      </div>
    </aside>
  `;
}

// —— Topbar ——
function Topbar() {
  const health = useStore($health);
  return html`
    <header class="topbar">
      <div class="brand">
        <span class="logo">H</span>
        <span class="name">HARNESS</span>
        <span class="ver">v2</span>
      </div>
      <div class="search" onClick=${() => $cmdkOpen.set(true)}>
        <span class="icon">⌕</span>
        <span class="placeholder">搜索 finding · progress · event · skill · commit ...</span>
        <span class="kbd">⌘K</span>
      </div>
      <div class="right">
        <div class="pill"><span class="dot"></span><span>SSE 已连</span></div>
        <span>ingest <span class="mono" style=${'color:' + (health.ingest_lag_ms < 500 ? 'var(--st-live)' : 'var(--st-warn)')}>${health.ingest_lag_ms.toFixed(0)}ms</span></span>
        <span>rate <span class="mono" style="color:var(--t1)">${health.event_rate.toFixed(1)}/s</span></span>
      </div>
    </header>
  `;
}

// —— Status bar (always visible) ——
function StatusBar() {
  const health = useStore($health);
  const kpis = useStore($kpis);
  const events = useStore($events);
  return html`
    <footer class="statusbar">
      <div class="item"><span class="lbl">events:</span><span class="val">${fmtNum(kpis.events_total)}</span></div>
      <div class="item"><span class="lbl">24h:</span><span class="val">${fmtNum(kpis.events_24h)}</span></div>
      <div class="item"><span class="lbl">ingest_lag:</span><span class=${'val ' + (health.ingest_lag_ms < 500 ? 'ok' : 'warn')}>${health.ingest_lag_ms.toFixed(0)}ms</span></div>
      <div class="item"><span class="lbl">db:</span><span class="val">${health.db_size_mb.toFixed(1)}MB</span></div>
      <div class="item"><span class="lbl">mem:</span><span class="val ok">${health.mem_mb}MB</span></div>
      <div class="item"><span class="lbl">cpu_idle:</span><span class="val ok">${(health.cpu_idle*100).toFixed(0)}%</span></div>
      <div class="item"><span class="lbl">workers:</span><span class="val ok">4/4 ●</span></div>
      <div class="spacer"></div>
      <div class="item"><span class="lbl">last_event:</span><span class="val mono">${events[0] ? new Date(events[0].ts_ms).toLocaleTimeString('zh-CN', {hour12:false}) : '—'}</span></div>
      <div class="item"><span class="lbl">build:</span><span class="val">2026-05-03 a9c721d</span></div>
    </footer>
  `;
}

// —— Command palette (⌘K) ——
function CmdK() {
  const open = useStore($cmdkOpen);
  const idx = useStore($searchIndex);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return idx.slice(0, 8);
    const term = q.toLowerCase();
    return idx.filter(r => r.title.toLowerCase().includes(term) || r.ref.toLowerCase().includes(term) || r.kind.includes(term)).slice(0, 12);
  }, [q, idx]);

  function onKey(e) {
    if (e.key === 'Escape') $cmdkOpen.set(false);
    else if (e.key === 'ArrowDown') { setSel(s => Math.min(results.length-1, s+1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSel(s => Math.max(0, s-1)); e.preventDefault(); }
    else if (e.key === 'Enter') {
      const r = results[sel];
      if (r) {
        if (r.kind === 'skill') $drawerSkill.set(r.ref);
        else if (r.kind === 'finding') $route.set('findings');
        $cmdkOpen.set(false);
      }
    }
  }

  if (!open) return null;
  return html`
    <div class="cmdk-overlay" onClick=${(e) => e.target === e.currentTarget && $cmdkOpen.set(false)}>
      <div class="cmdk">
        <div class="cmdk-input-row">
          <span class="icon">⌕</span>
          <input ref=${inputRef} class="cmdk-input" placeholder="搜索 · 用 kind:finding 等过滤" value=${q} onInput=${(e) => { setQ(e.target.value); setSel(0); }} onKeyDown=${onKey} />
          <span class="muted text-xs mono">${results.length} 结果</span>
        </div>
        <div class="cmdk-results">
          ${results.length === 0 ? html`<div class="cmdk-empty">无匹配 · 试试 a2-repo · helix · F-012 · skill: · commit:</div>` : results.map((r, i) => html`
            <div class=${'cmdk-row' + (i === sel ? ' active' : '')} onMouseEnter=${() => setSel(i)} onClick=${() => onKey({ key:'Enter', preventDefault: ()=>{} })}>
              <span class="kind">${r.kind}</span>
              <div>
                <div class="title">${r.title}</div>
                <div class="text-xs muted mono">${r.ref}</div>
              </div>
              <span class="meta">${r.meta}</span>
            </div>
          `)}
        </div>
        <div class="cmdk-footer">
          <span><span class="kbd">↑↓</span> 选择</span>
          <span><span class="kbd">⏎</span> 跳转</span>
          <span><span class="kbd">esc</span> 关闭</span>
          <span style="margin-left:auto">FTS5 · unicode61 · ${idx.length} 文档</span>
        </div>
      </div>
    </div>
  `;
}

// —— Skill drawer ——
function SkillDrawer() {
  const skillId = useStore($drawerSkill);
  const skills = useStore($skills);
  const events = useStore($events);
  const findings = useStore($findings);

  const skill = skills.find(s => s.id === skillId);
  const recent = events.filter(e => e.skill_id === skillId).slice(0, 8);
  const related = skillId ? findings.filter(f => f.body.includes(skillId) || f.title.includes(skillId.split('-')[0])) : [];

  return html`
    <div class=${'drawer-overlay' + (skill ? ' open' : '')} onClick=${() => $drawerSkill.set(null)}></div>
    <div class=${'drawer' + (skill ? ' open' : '')}>
      ${skill && html`
        <div class="drawer-header">
          <div>
            <div class="card-eyebrow">SKILL · DRILLDOWN</div>
            <div class="card-title mono">${skill.id}</div>
          </div>
          <button class="btn ghost" onClick=${() => $drawerSkill.set(null)}>✕</button>
        </div>
        <div class="drawer-body">
          <div class="drawer-section">
            <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr); gap:10px">
              <div class="kpi sub" style="background:var(--bg-sub); padding:14px"><div class="lbl">RUNS</div><div class="val" style="font-size:24px">${skill.freq}</div></div>
              <div class="kpi sub" style="background:var(--bg-sub); padding:14px"><div class="lbl">PASS</div><div class="val" style="font-size:24px; color:${skill.pass<0.7?'var(--st-error)':skill.pass<0.85?'var(--st-warn)':'var(--st-live)'}">${(skill.pass*100).toFixed(0)}%</div></div>
              <div class="kpi sub" style="background:var(--bg-sub); padding:14px"><div class="lbl">AVG MS</div><div class="val" style="font-size:24px">${fmtMs(skill.avgMs)}</div></div>
            </div>
          </div>

          <div class="drawer-section">
            <h4>最近调用 · ${recent.length}</h4>
            <table class="data">
              <tbody>
                ${recent.map(e => html`
                  <tr><td class="mono text-xs muted">${new Date(e.ts_ms).toLocaleTimeString('zh-CN', {hour12:false})}</td>
                      <td class="mono text-xs">${e.type}</td>
                      <td>${e.payload.status === 'failed' ? html`<${Tag} kind="err">failed<//>` : html`<${Tag} kind="live">ok<//>`}</td>
                      <td class="text-xs muted">${e.payload.duration_ms ? fmtMs(e.payload.duration_ms) : ''}</td></tr>
                `)}
              </tbody>
            </table>
          </div>

          <div class="drawer-section">
            <h4>关联 findings</h4>
            ${related.length === 0 ? html`<div class="muted text-sm">无</div>` : related.map(f => html`
              <div style="padding:10px; background:var(--bg-sub); border-radius:6px; margin-bottom:6px">
                <div class="flex gap-2"><span class="mono accent" style="color:var(--accent); font-size:11px">${f.id}</span><span class="text-sm" style="color:var(--t1)">${f.title}</span></div>
                <div class="text-xs muted" style="margin-top:4px">${f.body}</div>
              </div>
            `)}
          </div>

          <div class="drawer-section">
            <h4>USER FEEDBACK · 最近 5</h4>
            <div class="flex gap-2">
              ${[1,1,-1,1,0].map(f => html`<span style=${'width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:6px; background:var(--bg-sub); font-size:14px'}>${f===1?'👍':f===-1?'👎':'·'}</span>`)}
            </div>
          </div>

          <div class="drawer-section">
            <h4>命令</h4>
            <div class="action-card">
              <div class="cmd"><span style="color:var(--t3)">$</span><span>tail -n 100 logs/${skill.id}.log</span><span class="copy" onClick=${() => navigator.clipboard?.writeText('tail -n 100 logs/'+skill.id+'.log')}>复制</span></div>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}

// —— Root App ——
function App() {
  const route = useStore($route);

  // global ⌘K listener
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $cmdkOpen.set(!$cmdkOpen.get());
      }
      if (e.key === 'Escape') {
        $cmdkOpen.set(false);
        $drawerSkill.set(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view =
    route === 'live'     ? html`<${LiveView}/>`     :
    route === 'insights' ? html`<${InsightsView}/>` :
    route === 'health'   ? html`<${HealthView}/>`   :
    route === 'findings' ? html`<${FindingsView}/>` :
    route === 'tasks'    ? html`<${TasksView}/>`    :
    route === 'data'     ? html`<${DataView}/>`     : null;

  return html`
    <div class="app">
      <${Topbar}/>
      <${Sidebar}/>
      <main class="main">${view}</main>
      <${StatusBar}/>
      <${CmdK}/>
      <${SkillDrawer}/>
    </div>
  `;
}

render(html`<${App}/>`, document.getElementById('app'));
