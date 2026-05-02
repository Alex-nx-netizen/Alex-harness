// ============================================================
// HARNESS · Reusable components
// ============================================================
const html = window.__html;
const { useState, useEffect, useMemo, useRef } = window.__hooks;

// —— Sparkline —— produces an SVG path
export function Sparkline({ data, width=60, height=24, color='var(--accent)', fill=true }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = path + ` L ${width.toFixed(1)},${height} L 0,${height} Z`;
  return html`
    <svg class="spark-svg" width=${width} height=${height} viewBox="0 0 ${width} ${height}">
      ${fill && html`<path d=${areaPath} fill=${color} fill-opacity="0.12" stroke="none"/>`}
      <path d=${path} fill="none" stroke=${color} stroke-width="1.4"/>
    </svg>
  `;
}

// —— Mini bar chart ——
export function MiniBars({ data, width=80, height=24, color='var(--accent)' }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data) || 1;
  const barW = width / data.length - 1;
  return html`
    <svg width=${width} height=${height} viewBox="0 0 ${width} ${height}">
      ${data.map((v, i) => html`
        <rect x=${(i * (barW + 1)).toFixed(1)} y=${height - (v/max)*height} width=${barW.toFixed(1)} height=${((v/max)*height).toFixed(1)} fill=${color} fill-opacity="0.7" rx="1"/>
      `)}
    </svg>
  `;
}

// —— Donut gauge ——
export function Gauge({ value, max=1, label, sub, color='var(--st-live)' }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 30;
  const c = 2 * Math.PI * r;
  return html`
    <div class="gauge">
      <div class="ring">
        <svg width="80" height="80">
          <circle cx="40" cy="40" r=${r} fill="none" stroke="var(--bg-elev)" stroke-width="6"/>
          <circle cx="40" cy="40" r=${r} fill="none" stroke=${color} stroke-width="6"
                  stroke-dasharray=${c} stroke-dashoffset=${c * (1 - pct)}
                  stroke-linecap="round" />
        </svg>
        <div class="num">${(pct*100).toFixed(0)}%</div>
      </div>
      <div class="info">
        <div class="lbl">${label}</div>
        <div class="sub">${sub}</div>
      </div>
    </div>
  `;
}

// —— KPI tile ——
export function Kpi({ label, value, delta, deltaDir, spark, sparkColor }) {
  return html`
    <div class="kpi">
      <div class="lbl">${label}</div>
      <div class="val">${value}</div>
      ${delta && html`<div class=${'delta ' + (deltaDir || '')}>${delta}</div>`}
      ${spark && html`<div class="spark"><${Sparkline} data=${spark} color=${sparkColor || 'var(--accent)'} /></div>`}
    </div>
  `;
}

// —— Card ——
export function Card({ eyebrow, title, actions, children, padding='18px', style }) {
  const s = style ? { padding, ...style } : { padding };
  return html`
    <div class="card" style=${s}>
      ${(eyebrow || title || actions) && html`
        <div class="card-header">
          <div>
            ${eyebrow && html`<div class="card-eyebrow">${eyebrow}</div>`}
            ${title && html`<div class="card-title">${title}</div>`}
          </div>
          ${actions && html`<div class="flex gap-2">${actions}</div>`}
        </div>
      `}
      ${children}
    </div>
  `;
}

// —— Tag pill ——
export function Tag({ kind, children }) {
  return html`<span class=${'tag ' + (kind || '')}>${children}</span>`;
}

// —— Inline bar ——
export function BarInline({ value, max=1, color, format }) {
  const pct = Math.max(0, Math.min(1, value/max)) * 100;
  return html`
    <div class=${'bar-inline ' + (color || '')}>
      <div class="track"><div class="fill" style=${'width:' + pct.toFixed(1) + '%'}></div></div>
      <div class="v">${format ? format(value) : value.toFixed(2)}</div>
    </div>
  `;
}

// —— Relative time ——
export function relTime(ms) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return Math.floor(diff/1000) + 's';
  if (diff < 3_600_000) return Math.floor(diff/60_000) + 'm';
  if (diff < 86_400_000) return Math.floor(diff/3_600_000) + 'h';
  return Math.floor(diff/86_400_000) + 'd';
}

// —— Format helpers ——
export function fmtNum(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return n.toString();
}
export function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return ms.toFixed(0) + 'ms';
  if (ms < 60_000) return (ms/1000).toFixed(1) + 's';
  return (ms/60_000).toFixed(1) + 'm';
}
export function fmtPct(p) { return (p*100).toFixed(0) + '%'; }

// —— Status dot ——
export function StatusDot({ status }) {
  const map = {
    running: 'var(--st-live)',
    done:    'var(--st-info)',
    failed:  'var(--st-error)',
    aborted: 'var(--t4)',
    alive:   'var(--st-live)',
    stale:   'var(--st-warn)',
    archived:'var(--t4)',
  };
  return html`<span style=${'display:inline-block; width:7px; height:7px; border-radius:50%; background:' + (map[status] || 'var(--t4)') + '; margin-right:6px; vertical-align:middle'}></span>`;
}

// expose for other view modules
window.__C = { Sparkline, MiniBars, Gauge, Kpi, Card, Tag, BarInline, relTime, fmtNum, fmtMs, fmtPct, StatusDot };
export const __ready = true;
