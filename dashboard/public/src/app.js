// ============================================================
// HARNESS · App shell — sidebar / topbar / cmdk / drawer
// ============================================================
const html = window.__html;
const render = window.__render;
const { useState, useEffect, useMemo, useRef } = window.__hooks;
const useStore = window.__useStore;
import './views.js';                 // pulls components + stores transitively
const { Tag, StatusDot, Sparkline, fmtMs, fmtNum, fmtPct, relTime } = window.__C;

import { $route, $cmdkOpen, $drawerSkill, $events, $health, $kpis, $skills, $findings, $searchIndex, $sseConnected } from './stores.js';
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
  const sseOk = useStore($sseConnected);
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
        <div class="pill">
          <span class="dot" style=${sseOk ? '' : 'background:var(--st-warn); box-shadow:0 0 8px var(--st-warn)'}></span>
          <span>${sseOk ? 'SSE 已连' : 'SSE 断开'}</span>
        </div>
        <span>rate <span class="mono" style="color:var(--t1)">${health.event_rate.toFixed(2)}/s</span></span>
        <span>mem <span class="mono" style="color:var(--t1)">${health.mem_mb.toFixed(0)}MB</span></span>
      </div>
    </header>
  `;
}

// —— Status bar (always visible) ——
function StatusBar() {
  const health = useStore($health);
  const kpis = useStore($kpis);
  const events = useStore($events);
  const sseOk = useStore($sseConnected);
  return html`
    <footer class="statusbar">
      <div class="item"><span class="lbl">sessions:</span><span class="val">${health.sessions || 0}</span></div>
      <div class="item"><span class="lbl">tasks:</span><span class="val">${fmtNum(health.tasks || 0)}</span></div>
      <div class="item"><span class="lbl">jsonl:</span><span class="val">${health.db_size_mb.toFixed(2)}MB</span></div>
      <div class="item"><span class="lbl">mem:</span><span class="val ok">${health.mem_mb.toFixed(0)}MB</span></div>
      <div class="item"><span class="lbl">rate:</span><span class="val ok">${health.event_rate.toFixed(2)}/s</span></div>
      <div class="item"><span class="lbl">skills:</span><span class="val">${health.skills_count || kpis.active_skill_count || 0}</span></div>
      <div class="item"><span class="lbl">sse:</span><span class=${'val ' + (sseOk ? 'ok' : 'warn')}>${sseOk ? '●' : '○'}</span></div>
      <div class="spacer"></div>
      <div class="item"><span class="lbl">last_event:</span><span class="val mono">${events[0] ? new Date(events[0].ts_ms).toLocaleTimeString('zh-CN', {hour12:false}) : '—'}</span></div>
      <div class="item"><span class="lbl">uptime:</span><span class="val mono">${health.uptime_s > 3600 ? (health.uptime_s/3600).toFixed(1)+'h' : health.uptime_s > 60 ? Math.floor(health.uptime_s/60)+'m' : (health.uptime_s||0)+'s'}</span></div>
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
  const related = skillId ? findings.filter(f =>
    (f.body && f.body.includes(skillId)) || (f.title && f.title.includes(skillId.split('-')[0]))
  ) : [];

  const passColor = !skill ? '' : skill.pass < 0.5 ? 'var(--st-error)' : skill.pass < 0.8 ? 'var(--st-warn)' : 'var(--st-live)';
  const stateColor = !skill ? '' : skill.state === 'running' ? 'var(--st-live)' : skill.state === 'error' ? 'var(--st-error)' : 'var(--t3)';

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
              <div class="kpi sub" style="background:var(--bg-sub); padding:14px">
                <div class="lbl">RUNS</div>
                <div class="val" style="font-size:24px">${skill.freq}</div>
              </div>
              <div class="kpi sub" style="background:var(--bg-sub); padding:14px">
                <div class="lbl">PASS</div>
                <div class="val" style=${'font-size:24px; color:' + passColor}>${(skill.pass * 100).toFixed(0)}%</div>
              </div>
              <div class="kpi sub" style="background:var(--bg-sub); padding:14px">
                <div class="lbl">STATE</div>
                <div class="val" style=${'font-size:18px; color:' + stateColor}>${skill.state}</div>
              </div>
            </div>
            ${skill.last_run_summary ? html`
              <div class="text-xs muted" style="margin-top:10px; padding:8px; background:var(--bg-sub); border-radius:4px; line-height:1.5">
                ${skill.last_run_summary}
              </div>
            ` : ''}
          </div>

          <div class="drawer-section">
            <h4>本次任务中的事件 · ${recent.length}</h4>
            ${recent.length === 0
              ? html`<div class="muted text-sm">当前任务中尚未出现此 skill 的事件</div>`
              : html`
                <table class="data">
                  <tbody>
                    ${recent.map(e => html`
                      <tr>
                        <td class="mono text-xs muted">${new Date(e.ts_ms).toLocaleTimeString('zh-CN', {hour12:false})}</td>
                        <td class="mono text-xs">${e.type}</td>
                        <td>${e.payload.status === 'failed' ? html`<${Tag} kind="err">failed<//>` : html`<${Tag} kind="live">ok<//>`}</td>
                        <td class="text-xs muted">${e.payload.tool ? 'tool=' + e.payload.tool : ''}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              `}
          </div>

          <div class="drawer-section">
            <h4>关联 findings</h4>
            ${related.length === 0 ? html`<div class="muted text-sm">无关联 finding</div>` : related.map(f => html`
              <div style="padding:10px; background:var(--bg-sub); border-radius:6px; margin-bottom:6px">
                <div class="flex gap-2">
                  <span class="mono" style="color:var(--accent); font-size:11px">${f.id}</span>
                  <span class="text-sm" style="color:var(--t1)">${f.title}</span>
                </div>
                <div class="text-xs muted" style="margin-top:4px">${(f.body || '').slice(0, 120)}${f.body && f.body.length > 120 ? '…' : ''}</div>
              </div>
            `)}
          </div>

          <div class="drawer-section">
            <h4>命令</h4>
            <div class="action-card">
              <div class="cmd">
                <span style="color:var(--t3)">$</span>
                <span>node skills/${skill.id}/run.cjs</span>
                <span class="copy" onClick=${() => { navigator.clipboard?.writeText('node skills/' + skill.id + '/run.cjs'); }}>复制</span>
              </div>
            </div>
            ${skill.last_run_ts ? html`
              <div class="text-xs muted" style="margin-top:6px">最后运行: ${skill.last_run_ts}</div>
            ` : ''}
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
