// ============================================================
// HARNESS · Views (Live, Insights, Health, Findings, Tasks, Data)
// ============================================================
const html = window.__html;
const { useState, useEffect, useMemo, useRef } = window.__hooks;
const useStore = window.__useStore;
import './components.js';   // ensures __C is populated before destructure
const C = window.__C;
const { Sparkline, MiniBars, Gauge, Kpi, Card, Tag, BarInline, relTime, fmtNum, fmtMs, fmtPct, StatusDot } = C;

import { $events, $tasks, $helixRuns, $skills, $findings, $hypotheses, $questions, $progress, $anomalies, $nextActions, $health, $kpis, $heatmap, $drawerSkill } from './stores.js';

// ============================================================
// LIVE VIEW
// ============================================================
export function LiveView() {
  const events    = useStore($events);
  const tasks     = useStore($tasks);
  const skills    = useStore($skills);
  const kpis      = useStore($kpis);
  const findings  = useStore($findings);
  const progress  = useStore($progress);
  const health    = useStore($health);
  const helixRuns = useStore($helixRuns);

  const activeHelix = helixRuns.find(r => r.status === 'running');
  const recentDoneHelix = helixRuns.filter(r => r.status === 'done').slice(0, 2);

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ live · 实时驾驶舱</div>
          <h1 class="page-title">Live · 现在 agent 在干什么</h1>
        </div>
        <div class="page-actions">
          <button class="btn ghost"><span>过滤</span></button>
          <button class="btn"><span>暂停</span></button>
          <button class="btn primary"><span>导出</span></button>
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:18px">
        <${Kpi} label="EVENTS · 24H" value=${fmtNum(kpis.events_24h)} delta="+312 / 1h" deltaDir="up" spark=${health.event_rate_series.slice(-30)} />
        <${Kpi} label="TASKS · 24H" value=${kpis.tasks_24h}            delta="${kpis.tasks_24h - 78 > 0 ? '+' : ''}${kpis.tasks_24h - 78} vs 7d" deltaDir="up" />
        <${Kpi} label="PASS RATE"   value=${fmtPct(kpis.pass_rate)}    delta="−2.1pp vs 7d" deltaDir="down" sparkColor="var(--st-live)" spark=${[.86,.85,.84,.85,.86,.85,.84,.83,.85,.85,.86,.84]} />
        <${Kpi} label="ACTIVE SKILLS" value=${kpis.active_skill_count} delta="${kpis.finding_alive} alive findings" />
        <${Kpi} label="UNREAD ACTIONS" value=${kpis.unread_actions}    delta="点击 → /insights" deltaDir="up" />
      </div>

      <${Card} eyebrow="HELIX RUNS · 活跃工作流" title=${activeHelix ? activeHelix.id : '当前无活跃 helix'} actions=${activeHelix ? html`<${Tag} kind="live">${activeHelix.phases_done.length}/${activeHelix.phases_planned.length} phases · ${activeHelix.current}<//>` : html`<${Tag}>idle<//>`} style=${{marginBottom:'16px'}}>
        ${activeHelix ? html`
          <div class="helix-phase-bar" style="margin-bottom:8px">
            ${activeHelix.phases_planned.map(p => {
              const isDone = activeHelix.phases_done.includes(p);
              const isCurrent = activeHelix.current === p;
              return html`<span class=${'phase-pill' + (isDone?' done':'') + (isCurrent?' current':'')}>${p}</span>`;
            })}
          </div>
          <div class="text-xs muted">
            该 helix run 包含 ${activeHelix.task_ids.length} 个 sub-task · 当前在 <span class="mono accent" style="color:var(--accent)">${activeHelix.current}</span> phase ·
            session <span class="mono">${tasks.find(t=>t.helix_id===activeHelix.id)?.session_id || '?'}</span>
          </div>
          <div class="text-xs muted" style="margin-top:6px; opacity:.7; font-style:italic">最近完成 helix:
            ${recentDoneHelix.map((r, i) => html`<span style="margin-left:8px"><span class="mono">${r.id}</span> · ${r.phases_planned.length} phases · <span style="color:#90c290">${r.promise || 'done'}</span></span>${i < recentDoneHelix.length-1 ? html`<span style="margin-left:8px">·</span>` : ''}`)}
          </div>
        ` : html`
          <div class="text-sm muted">空闲 · 上次 helix 在 ${relTime(recentDoneHelix[0]?.started_ms)} 完成 (${recentDoneHelix[0]?.id || '—'})</div>
        `}
      <//>

      <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:16px">

        <!-- LEFT: timeline -->
        <${Card} eyebrow="LIVE · 事件时间线" title="最近 60 条" actions=${html`<${Tag} kind="live">SSE patch · ${health.event_rate.toFixed(1)} evt/s<//>`}>
          <div class="timeline">
            ${events.slice(0, 18).map(ev => html`
              <div class=${'tl-row' + (ev.__new ? ' new' : '')}>
                <div class="ts">${new Date(ev.ts_ms).toLocaleTimeString('zh-CN', { hour12: false })}</div>
                <div class="type">${ev.type}</div>
                <div class="body">
                  <span class="ref">${ev.skill_id}</span>
                  ${ev.payload.duration_ms != null ? html` · ${fmtMs(ev.payload.duration_ms)}` : ''}
                  ${ev.payload.tool ? html` · tool=${ev.payload.tool}` : ''}
                  ${ev.payload.file ? html` · ${ev.payload.file}` : ''}
                  ${ev.payload.status === 'failed' ? html` · <${Tag} kind="err">FAILED<//>` : ''}
                </div>
                <div class="mono text-xs muted">#${ev.id.toString(36)}</div>
              </div>
            `)}
          </div>
        <//>

        <!-- RIGHT: skills + tasks -->
        <div class="flex-col gap-4">
          <${Card} eyebrow="SKILLS · 今日" title="频次 / 通过率 / 平均耗时" actions=${html`<button class="btn ghost">展开<//>`}>
            <table class="data">
              <thead><tr><th>SKILL</th><th class="right">RUNS</th><th class="right">PASS</th><th class="right">AVG</th></tr></thead>
              <tbody>
                ${skills.slice(0,7).map(s => html`
                  <tr class="row" onClick=${() => $drawerSkill.set(s.id)}>
                    <td><span class="mono">${s.id}</span></td>
                    <td class="num">${s.freq}</td>
                    <td><${BarInline} value=${s.pass} color=${s.pass < 0.7 ? 'err' : s.pass < 0.85 ? 'warn' : 'ok'} format=${v => (v*100).toFixed(0) + '%'} /></td>
                    <td class="num mono">${fmtMs(s.avgMs)}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          <//>

          <${Card} eyebrow="TASKS · ACTIVE" title="进行中 / 最近完成">
            <table class="data">
              <tbody>
                ${tasks.slice(0,5).map(t => html`
                  <tr class="row">
                    <td><${StatusDot} status=${t.status}/><span class="mono">${t.task_id}</span></td>
                    <td><span class="muted text-xs">${t.skill}</span></td>
                    <td class="num mono">${t.duration_ms ? fmtMs(t.duration_ms) : '运行中'}</td>
                    <td class="right">
                      ${t.status === 'failed' ? html`<${Tag} kind="err">failed<//>` :
                        t.status === 'running' ? html`<${Tag} kind="live">running<//>` :
                        t.feedback === 1 ? html`<${Tag} kind="acc">👍<//>` :
                        t.feedback === -1 ? html`<${Tag} kind="err">👎<//>` :
                        html`<${Tag}>done<//>`}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          <//>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px">
        <${Card} eyebrow="FINDINGS · 活跃" title="问题与发现" actions=${html`<${Tag} kind="acc">${findings.filter(f=>f.status==='alive').length} alive<//>`}>
          ${findings.filter(f => f.status === 'alive').slice(0,4).map(f => html`
            <div style="padding:10px 0; border-bottom:1px solid var(--border-soft)">
              <div class="flex gap-2" style="align-items:center; margin-bottom:4px">
                <span class="mono accent" style="color:var(--accent); font-size:11px">${f.id}</span>
                <span class="fw-500" style="color:var(--t1); font-size:13px">${f.title}</span>
                <span class="mono muted text-xs" style="margin-left:auto">${relTime(f.updated_ms)}</span>
              </div>
              <div class="text-xs muted">${f.body}</div>
              ${(f.related_q.length || f.related_h.length) ? html`
                <div class="flex gap-2" style="margin-top:6px">
                  ${f.related_q.map(q => html`<${Tag} kind="info">${q}<//>`)}
                  ${f.related_h.map(h => html`<${Tag} kind="acc">${h}<//>`)}
                </div>` : ''}
            </div>
          `)}
        <//>

        <${Card} eyebrow="PROGRESS · 铁律 1" title="commit ↔ 进度对账" actions=${html`<${Tag} kind="warn">7 missing<//>`}>
          ${progress.slice(0,5).map(p => html`
            <div style="padding:10px 0; border-bottom:1px solid var(--border-soft)">
              <div class="flex gap-2" style="align-items:center; margin-bottom:4px">
                <span class="mono" style="color:var(--accent); font-size:11px">${p.commit}</span>
                <span class="muted mono text-xs" style="margin-left:auto">${relTime(p.ts_ms)}</span>
              </div>
              <div class="text-sm" style="color:var(--t1)">${p.body}</div>
              ${p.findings.length ? html`<div class="flex gap-2" style="margin-top:6px">${p.findings.map(f => html`<${Tag} kind="acc">${f}<//>`)}</div>` : ''}
            </div>
          `)}
        <//>
      </div>
    </div>
  `;
}

// ============================================================
// INSIGHTS VIEW
// ============================================================
export function InsightsView() {
  const skills = useStore($skills);
  const anomalies = useStore($anomalies);
  const nextActions = useStore($nextActions);
  const heatmap = useStore($heatmap);

  // 四象限: x = freq, y = pass
  const maxFreq = Math.max(...skills.map(s => s.freq));
  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ insights · 为什么</div>
          <h1 class="page-title">从「发生了什么」到「该做什么」</h1>
        </div>
        <div class="page-actions">
          <span class="muted text-xs mono">每 60s 重算 · 上次 ${relTime(Date.now() - 23_000)} 前</span>
          <button class="btn"><span>立即重算</span></button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:16px; margin-bottom:16px">
        <${Card} eyebrow="ROI QUADRANT" title="Skill 频次 × 通过率" actions=${html`<span class="muted text-xs mono">气泡大小 = 平均耗时<//>`}>
          <div class="quad">
            <div class="axis-v"></div>
            <div class="axis-h"></div>
            <div class="label" style="left:8px; top:8px">↑ 通过率</div>
            <div class="label" style="right:8px; bottom:8px">频次 →</div>
            <div class="quad-tag" style="left:54%; top:8px; color:var(--st-live)">⭐ 主力</div>
            <div class="quad-tag" style="left:8px; top:8px; color:var(--t3)">低频高过</div>
            <div class="quad-tag" style="left:8px; bottom:24px; color:var(--t3)">低频低过</div>
            <div class="quad-tag" style="right:8px; bottom:24px; color:var(--st-error)">⚠ 注意</div>
            ${skills.map(s => {
              const x = 8 + (s.freq / maxFreq) * 84;
              const y = 8 + (1 - s.pass) * 84;
              const size = 18 + (s.avgMs / 9200) * 36;
              const color = s.pass < 0.7 ? 'var(--st-error)' : s.pass < 0.85 ? 'var(--st-warn)' : 'var(--st-live)';
              const bg = s.pass < 0.7 ? 'rgba(201,120,112,.35)' : s.pass < 0.85 ? 'rgba(212,168,67,.3)' : 'rgba(136,201,144,.3)';
              return html`
                <div class="bubble"
                     style=${`left:${x}%; top:${y}%; width:${size}px; height:${size}px; transform:translate(-50%,-50%); background:${bg}; border-color:${color}`}
                     title=${s.id + ' · ' + s.freq + ' runs · ' + (s.pass*100).toFixed(0) + '% pass · ' + fmtMs(s.avgMs)}
                     onClick=${() => $drawerSkill.set(s.id)}
                  >${s.id.split('-')[0]}</div>
              `;
            })}
          </div>
          <div class="text-xs muted" style="margin-top:8px">a2-repo-sensor 在右下角红圈 · 高频低过 · 关联 Q6 / F-012 · 点击气泡查看 skill 详情</div>
        <//>

        <${Card} eyebrow="USAGE HEATMAP" title="过去 14 天 × 每小时调用密度">
          <div class="heatmap">
            ${heatmap.map(v => {
              const op = v < 0.05 ? 0.04 : v;
              return html`<div class="cell" style=${'background:rgba(201,169,110,' + op.toFixed(2) + ')'}></div>`;
            })}
          </div>
          <div class="heatmap-axis"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
          <div class="text-xs muted" style="margin-top:10px">深夜 22-2 点是主力工作时段 · 周末活动减半 · D-9 14-17 点黑洞 = ingest 中断（已修）</div>
        <//>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1.4fr; gap:16px">
        <${Card} eyebrow="ANOMALY · 60min" title="z-score > 2 的指标">
          ${anomalies.map(a => html`
            <div class=${'anomaly-row ' + a.severity + (a.skill ? ' clickable' : '')}
                 onClick=${a.skill ? () => $drawerSkill.set(a.skill) : null}>
              <div class="meta" style=${'color:' + (a.severity==='err' ? 'var(--st-error)' : a.severity==='warn' ? 'var(--st-warn)' : 'var(--st-info)')}>
                ${a.sigma > 0 ? '+' : ''}${a.sigma.toFixed(1)}σ
              </div>
              <div>
                <div class="body" style="color:var(--t1)">${a.metric} <span class="mono accent">${a.value}</span></div>
                <div class="text-xs muted">基线 ${a.baseline}${a.skill ? ' · ' + a.skill : ''}</div>
              </div>
              <button class="btn ghost text-xs">详情</button>
            </div>
          `)}
        <//>

        <${Card} eyebrow="NEXT ACTIONS · 可执行" title="基于规则引擎的推荐" actions=${html`<${Tag} kind="acc">${nextActions.length} 待办<//>`}>
          ${nextActions.map(a => html`
            <div class=${'action-card' + (a.priority === 'high' ? ' priority' : '') + (a.skill ? ' clickable' : '')}
                 onClick=${a.skill ? (e) => { if (e.target.classList.contains('copy')) return; $drawerSkill.set(a.skill); } : null}
                 title=${a.skill ? '点击查看 ' + a.skill + ' 详情' : ''}>
              <div class="row1">
                <${Tag} kind=${a.priority === 'high' ? 'acc' : a.priority === 'med' ? 'info' : 'warn'}>${a.id}<//>
                <span class="title">${a.title}</span>
                ${a.skill ? html`<span class="mono text-xs" style="color:var(--accent); opacity:.8">→ ${a.skill}</span>` : ''}
                <span class="muted mono text-xs" style="margin-left:auto">${a.priority}</span>
              </div>
              <div class="body">${a.body}</div>
              <div class="cmd">
                <span style="color:var(--t3)">$</span>
                <span>${a.cmd}</span>
                <span class="copy" onClick=${(e) => { e.stopPropagation(); navigator.clipboard?.writeText(a.cmd); e.target.textContent = '已复制 ✓'; setTimeout(() => e.target.textContent = '复制', 1200); }}>复制</span>
              </div>
            </div>
          `)}
        <//>
      </div>
    </div>
  `;
}

// ============================================================
// HEALTH VIEW
// ============================================================
export function HealthView() {
  const health = useStore($health);
  const kpis = useStore($kpis);

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ health · 系统自观测</div>
          <h1 class="page-title">harness 自己跑得健不健康</h1>
        </div>
        <div class="page-actions">
          <${Tag} kind="live">所有 worker 在线<//>
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:18px">
        <${Kpi} label="INGEST LAG" value=${health.ingest_lag_ms.toFixed(0) + 'ms'}
                delta=${health.ingest_lag_ms < 500 ? '< SLO 500ms' : '⚠ 超 SLO'}
                deltaDir=${health.ingest_lag_ms < 500 ? 'up' : 'down'}
                spark=${health.ingest_lag_series.slice(-30)}
                sparkColor="var(--st-info)" />
        <${Kpi} label="EVENT RATE" value=${health.event_rate.toFixed(1) + ' /s'} delta="p99 < 80ms" deltaDir="up"
                spark=${health.event_rate_series.slice(-30)} sparkColor="var(--st-live)" />
        <${Kpi} label="DB SIZE" value=${health.db_size_mb.toFixed(1) + ' MB'} delta="+0.3MB / 1h" />
        <${Kpi} label="MEMORY" value=${health.mem_mb + ' MB'} delta="< 120MB SLO" deltaDir="up" />
        <${Kpi} label="CPU IDLE" value=${(health.cpu_idle*100).toFixed(0) + '%'} delta="≥ 95% SLO" deltaDir="up" />
        <${Kpi} label="EVENTS TOTAL" value=${fmtNum(kpis.events_total)} delta="自 v2 上线" />
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
        <${Card} eyebrow="WORKERS · 心跳" title="独立进程状态">
          <table class="data">
            <thead><tr><th>WORKER</th><th>状态</th><th class="right">最后心跳</th><th class="right">指标</th></tr></thead>
            <tbody>
              ${health.workers.map(w => html`
                <tr>
                  <td><span class="mono fw-500" style="color:var(--t1)">${w.name}</span></td>
                  <td><${StatusDot} status=${w.status}/>${w.status}</td>
                  <td class="num mono"><span class=${(Date.now() - w.last_beat_ms) > 30_000 ? 'warn' : ''}>${relTime(w.last_beat_ms)} 前</span></td>
                  <td class="right text-xs muted mono">${Object.entries(w.payload).map(([k,v]) => k + '=' + v).join(' · ')}</td>
                </tr>
              `)}
            </tbody>
          </table>
        <//>

        <${Card} eyebrow="SLO 看板" title="目标 vs 实际">
          <table class="data">
            <tbody>
              <tr><td>事件吞吐</td><td><${BarInline} value=${health.event_rate} max=${30} color="ok" format=${v => v.toFixed(1) + '/s'} /></td><td class="right text-xs muted">≥ 5/s · ✓</td></tr>
              <tr><td>db 写入 p99</td><td><${BarInline} value=${0.42} max=${1} color="ok" format=${v => v.toFixed(2) + 'ms'} /></td><td class="right text-xs muted">${'< 1ms · ✓'}</td></tr>
              <tr><td>SSE p99</td><td><${BarInline} value=${health.ingest_lag_ms / 1000} max=${0.08} color=${health.ingest_lag_ms > 80 ? 'warn' : 'ok'} format=${v => (v*1000).toFixed(0) + 'ms'} /></td><td class="right text-xs muted">${'< 80ms'}</td></tr>
              <tr><td>parse 失败率</td><td><${BarInline} value=${0.04} max=${1} color="ok" format=${v => v.toFixed(2) + '%'} /></td><td class="right text-xs muted">${'< 0.1% · ✓'}</td></tr>
              <tr><td>内存稳态</td><td><${BarInline} value=${health.mem_mb} max=${120} color="ok" format=${v => v.toFixed(0) + 'MB'} /></td><td class="right text-xs muted">${'< 120MB · ✓'}</td></tr>
              <tr><td>CPU idle</td><td><${BarInline} value=${health.cpu_idle} max=${1} color="ok" format=${v => (v*100).toFixed(0) + '%'} /></td><td class="right text-xs muted">≥ 95% · ✓</td></tr>
            </tbody>
          </table>
        <//>
      </div>

      <div style="margin-top:16px">
        <${Card} eyebrow="DEAD LETTER · parse 失败" title="未识别的事件原文" actions=${html`<button class="btn">修 parser<//>`}>
          <table class="data">
            <thead><tr><th>TS</th><th>SOURCE</th><th>错误</th><th>原文</th></tr></thead>
            <tbody>
              <tr><td class="mono text-xs muted">15:42:11</td><td class="mono text-xs">hook/post-tool</td><td><${Tag} kind="err">unexpected schema_v3<//></td><td class="mono text-xs muted">{"v":3,"kind":"obs",...}</td></tr>
              <tr><td class="mono text-xs muted">15:38:02</td><td class="mono text-xs">hook/post-tool</td><td><${Tag} kind="err">unexpected schema_v3<//></td><td class="mono text-xs muted">{"v":3,"kind":"obs",...}</td></tr>
              <tr><td class="mono text-xs muted">15:24:55</td><td class="mono text-xs">log_file</td><td><${Tag} kind="warn">malformed ts<//></td><td class="mono text-xs muted">[??] task_start ...</td></tr>
            </tbody>
          </table>
        <//>
      </div>
    </div>
  `;
}

// ============================================================
// FINDINGS VIEW
// ============================================================
export function FindingsView() {
  const findings = useStore($findings);
  const hypotheses = useStore($hypotheses);
  const questions = useStore($questions);
  const [filter, setFilter] = useState('alive');

  const filtered = findings.filter(f => filter === 'all' || f.status === filter);

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ findings · 知识闭环</div>
          <h1 class="page-title">Findings · 假设 · 问题</h1>
        </div>
        <div class="page-actions">
          <button class=${'btn' + (filter==='alive'?' primary':'')} onClick=${() => setFilter('alive')}>alive (${findings.filter(f=>f.status==='alive').length})</button>
          <button class=${'btn' + (filter==='stale'?' primary':'')} onClick=${() => setFilter('stale')}>stale (${findings.filter(f=>f.status==='stale').length})</button>
          <button class=${'btn' + (filter==='archived'?' primary':'')} onClick=${() => setFilter('archived')}>archived (${findings.filter(f=>f.status==='archived').length})</button>
          <button class=${'btn' + (filter==='all'?' primary':'')} onClick=${() => setFilter('all')}>all</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:16px">
        <${Card} eyebrow="FINDINGS" title=${filtered.length + ' 条'}>
          ${filtered.map(f => html`
            <div style="padding:14px 0; border-bottom:1px solid var(--border-soft)">
              <div class="flex gap-2" style="align-items:center; margin-bottom:6px">
                <${StatusDot} status=${f.status}/>
                <span class="mono fw-600" style="color:var(--accent); font-size:12px">${f.id}</span>
                <span class="fw-500" style="color:var(--t1); font-size:14px">${f.title}</span>
                <span class="mono muted text-xs" style="margin-left:auto">${relTime(f.updated_ms)}</span>
              </div>
              <div class="text-sm muted" style="margin-bottom:8px; line-height:1.6">${f.body}</div>
              <div class="flex gap-2">
                ${f.related_q.map(q => html`<${Tag} kind="info">Q ${q}<//>`)}
                ${f.related_h.map(h => html`<${Tag} kind="acc">H ${h}<//>`)}
                ${f.status === 'stale' && html`<button class="btn ghost text-xs" style="margin-left:auto">归档<//>`}
              </div>
            </div>
          `)}
        <//>

        <div class="flex-col gap-4">
          <${Card} eyebrow="HYPOTHESES" title=${hypotheses.length + ' 个假设'}>
            ${hypotheses.map(h => html`
              <div style="padding:10px 0; border-bottom:1px solid var(--border-soft)">
                <div class="flex gap-2" style="margin-bottom:4px">
                  <span class="mono" style="color:var(--accent); font-size:11px">${h.id}</span>
                  <${Tag} kind=${h.status==='validated'?'live':h.status==='refuted'?'err':'info'}>${h.status}<//>
                </div>
                <div class="text-sm" style="color:var(--t1)">${h.title}</div>
                <div class="text-xs muted" style="margin-top:4px">证据: ${h.evidence.join(', ')}</div>
              </div>
            `)}
          <//>
          <${Card} eyebrow="QUESTIONS" title=${questions.length + ' 个问题'}>
            ${questions.map(q => html`
              <div style="padding:10px 0; border-bottom:1px solid var(--border-soft)">
                <div class="flex gap-2" style="margin-bottom:4px">
                  <span class="mono" style="color:var(--accent); font-size:11px">${q.id}</span>
                  <${Tag} kind=${q.status==='answered'?'live':'warn'}>${q.status}<//>
                  ${q.answer && html`<span class="muted mono text-xs">→ ${q.answer}</span>`}
                </div>
                <div class="text-sm" style="color:var(--t1)">${q.title}</div>
              </div>
            `)}
          <//>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TASKS VIEW (simple)
// ============================================================
export function TasksView() {
  const tasks = useStore($tasks);
  const helixRuns = useStore($helixRuns);
  const [groupBy, setGroupBy] = useState('session');   // session | helix | mode | flat
  const [filterMode, setFilterMode] = useState('all'); // all | team | independent

  const filtered = filterMode === 'all' ? tasks : tasks.filter(t => t.mode === filterMode);

  // group
  let groups = [];
  if (groupBy === 'session') {
    const map = new Map();
    for (const t of filtered) {
      if (!map.has(t.session_id)) map.set(t.session_id, []);
      map.get(t.session_id).push(t);
    }
    groups = [...map.entries()].map(([k, ts]) => ({
      key: k, label: 'session ' + k, sub: `${ts.length} tasks · ${ts.filter(x=>x.mode==='team').length} team`,
      ts,
    }));
  } else if (groupBy === 'helix') {
    const map = new Map([['__none', []]]);
    for (const t of filtered) {
      const key = t.helix_id || '__none';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    groups = [...map.entries()].filter(([_,ts]) => ts.length).map(([k, ts]) => {
      const run = helixRuns.find(r => r.id === k);
      return {
        key: k,
        label: k === '__none' ? '无 helix run（独立任务）' : k,
        sub: run ? `${run.status} · ${run.phases_done.length}/${run.phases_planned.length} phases` : `${ts.length} tasks`,
        run, ts,
      };
    });
  } else if (groupBy === 'mode') {
    const map = { team: [], independent: [] };
    for (const t of filtered) (map[t.mode] || (map[t.mode]=[])).push(t);
    groups = ['team','independent'].filter(k=>map[k]?.length).map(k => ({
      key: k, label: 'MODE = ' + k.toUpperCase(), sub: `${map[k].length} tasks`, ts: map[k],
    }));
  } else {
    groups = [{ key:'all', label:'全部任务', sub:`${filtered.length} 条`, ts: filtered }];
  }

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ tasks · session × helix × mode</div>
          <h1 class="page-title">任务历史</h1>
        </div>
        <div class="page-actions">
          <div class="seg">
            ${['session','helix','mode','flat'].map(g => html`
              <button class=${'seg-btn' + (groupBy===g?' active':'')} onClick=${() => setGroupBy(g)}>by ${g}</button>
            `)}
          </div>
          <div class="seg">
            ${['all','team','independent'].map(m => html`
              <button class=${'seg-btn' + (filterMode===m?' active':'')} onClick=${() => setFilterMode(m)}>${m}</button>
            `)}
          </div>
        </div>
      </div>

      <div class="flex-col gap-3">
        ${groups.map(g => html`
          <${Card} eyebrow=${groupBy.toUpperCase()} title=${g.label} actions=${html`<span class="muted text-xs mono">${g.sub}</span>`}>
            ${g.run ? html`
              <div class="helix-phase-bar">
                ${g.run.phases_planned.map(p => {
                  const isDone = g.run.phases_done.includes(p);
                  const isCurrent = g.run.current === p;
                  return html`<span class=${'phase-pill' + (isDone?' done':'') + (isCurrent?' current':'')}>${p}</span>`;
                })}
                ${g.run.promise ? html`<span class="phase-promise">${g.run.promise}</span>` : null}
              </div>
            ` : null}
            <table class="data" style="margin-top:${g.run?'10px':'0'}">
              <thead><tr><th>TASK</th><th>LABEL</th><th>SKILL</th><th>MODE</th><th>状态</th><th class="right">耗时</th><th class="right">tools</th><th class="right">files</th><th class="right">started</th><th class="right">FB</th></tr></thead>
              <tbody>
                ${g.ts.map(t => html`
                  <tr class="row" onClick=${() => $drawerSkill.set(t.skill)} style="cursor:pointer">
                    <td><span class="mono fw-500" style="color:var(--t1)">${t.task_id}</span></td>
                    <td><span class="text-sm" style="color:var(--t2)">${t.label || '—'}</span></td>
                    <td><span class="muted text-xs mono">${t.skill}</span></td>
                    <td><span class=${'mode-badge mode-' + t.mode}>${t.mode}</span></td>
                    <td><${StatusDot} status=${t.status}/><span class="text-xs">${t.status}</span></td>
                    <td class="num mono">${t.duration_ms ? fmtMs(t.duration_ms) : '—'}</td>
                    <td class="num mono">${t.tools}</td>
                    <td class="num mono">${t.files}</td>
                    <td class="num mono muted">${relTime(t.started_ms)}</td>
                    <td class="right">${t.feedback === 1 ? '👍' : t.feedback === -1 ? '👎' : t.feedback === 0 ? '·' : '—'}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          <//>
        `)}
      </div>
    </div>
  `;
}

// ============================================================
// DATA VIEW (schema browser)
// ============================================================
export function DataView() {
  const tables = [
    { name: 'raw_events',       rows: 248_017, size: '94.2 MB', desc: 'append-only · 事件主表' },
    { name: 'fact_tasks',       rows: 12_402,  size: '6.1 MB',  desc: '从 raw_events 汇总 · 索引: started_ms, status' },
    { name: 'findings',         rows: 8,       size: '12 KB',   desc: 'Q/F/H 三件套 · liveness 字段' },
    { name: 'hypotheses',       rows: 3,       size: '4 KB',    desc: '关联 finding ids' },
    { name: 'questions',        rows: 4,       size: '3 KB',    desc: 'open / answered / deprecated' },
    { name: 'progress_entries', rows: 142,     size: '38 KB',   desc: '与 commit 一一对应（铁律 1）' },
    { name: 'insights',         rows: 18,      size: '24 KB',   desc: 'worker 缓存 · roi / anomaly / next_action' },
    { name: 'events_5min',      rows: 4_032,   size: '720 KB',  desc: '5 分钟桶 rollup · 14 天保留' },
    { name: 'events_1h',        rows: 336,     size: '60 KB',   desc: '小时桶 rollup' },
    { name: 'events_1d',        rows: 14,      size: '3 KB',    desc: '天桶 rollup' },
    { name: 'worker_heartbeat', rows: 4,       size: '1 KB',    desc: '每 5s 写一次' },
    { name: 'ingest_cursor',    rows: 6,       size: '2 KB',    desc: '断点续读偏移量' },
    { name: 'dead_letter',      rows: 23,      size: '8 KB',    desc: 'parse 失败的原始行' },
    { name: 'search_idx',       rows: 8_241,   size: '2.1 MB',  desc: 'FTS5 虚拟表 · unicode61' },
  ];
  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ data · 数据层</div>
          <h1 class="page-title">SQLite WAL · 14 张表 · 142.7 MB</h1>
        </div>
        <div class="page-actions">
          <button class="btn">.backup</button>
          <button class="btn">VACUUM</button>
        </div>
      </div>
      <${Card}>
        <table class="data">
          <thead><tr><th>TABLE</th><th class="right">ROWS</th><th class="right">SIZE</th><th>说明</th></tr></thead>
          <tbody>
            ${tables.map(t => html`
              <tr class="row">
                <td><span class="mono fw-500" style="color:var(--t1)">${t.name}</span></td>
                <td class="num mono">${fmtNum(t.rows)}</td>
                <td class="num mono">${t.size}</td>
                <td class="text-sm muted">${t.desc}</td>
              </tr>
            `)}
          </tbody>
        </table>
      <//>
    </div>
  `;
}

window.__VIEWS = { LiveView, InsightsView, HealthView, FindingsView, TasksView, DataView };
