// ============================================================
// HARNESS · Views (Live, Insights, Health, Findings, Tasks, Data)
// ============================================================
const html = window.__html;
const { useState, useEffect, useMemo, useRef } = window.__hooks;
const useStore = window.__useStore;
import "./components.js"; // ensures __C is populated before destructure
import { parseTs } from "./data.js";
const C = window.__C;
const {
  Sparkline,
  MiniBars,
  Gauge,
  Kpi,
  Card,
  Tag,
  BarInline,
  relTime,
  fmtNum,
  fmtMs,
  fmtPct,
  StatusDot,
} = C;

import {
  $events,
  $tasks,
  $helixRuns,
  $skills,
  $findings,
  $hypotheses,
  $questions,
  $progress,
  $anomalies,
  $nextActions,
  $health,
  $kpis,
  $heatmap,
  $drawerSkill,
  $route,
  $sessions,
  $expandedSessionId,
  $sessionTimelineCache,
  $sessionsFilter,
  $sessionsSearch,
  $sessionsPickerOpen,
  $liveState,
  loadSessionTimeline,
  loadSessions,
} from "./stores.js";

// ============================================================
// LIVE VIEW
// ============================================================
export function LiveView() {
  const events = useStore($events);
  const tasks = useStore($tasks);
  const skills = useStore($skills);
  const kpis = useStore($kpis);
  const findings = useStore($findings);
  const progress = useStore($progress);
  const health = useStore($health);
  const helixRuns = useStore($helixRuns);

  const activeHelix = helixRuns.find((r) => r.status === "running");
  const recentDoneHelix = helixRuns
    .filter((r) => r.status === "done")
    .slice(0, 2);
  const liveState = useStore($liveState);
  const currentSessionShort =
    liveState && liveState.session && liveState.session.id
      ? liveState.session.id.slice(0, 8)
      : null;

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">
            / live · 实时驾驶舱
            ${currentSessionShort
              ? html`<span class="live-breadcrumb">
                  · 当前会话:
                  <span class="mono" style="color:var(--accent)"
                    >${currentSessionShort}</span
                  >
                  ·
                  <a
                    class="live-breadcrumb-link"
                    onClick=${() => $route.set("sessions")}
                    >查看全部历史 →</a
                  >
                </span>`
              : html`<span class="live-breadcrumb">
                  ·
                  <a
                    class="live-breadcrumb-link"
                    onClick=${() => $route.set("sessions")}
                    >查看全部历史 →</a
                  >
                </span>`}
          </div>
          <h1 class="page-title">Live · 现在 agent 在干什么</h1>
        </div>
        <div class="page-actions">
          <button class="btn ghost"><span>过滤</span></button>
          <button class="btn"><span>暂停</span></button>
          <button class="btn primary"><span>导出</span></button>
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:18px">
        <${Kpi}
          label="EVENTS · 24H"
          value=${fmtNum(kpis.events_24h)}
          delta="+312 / 1h"
          deltaDir="up"
          spark=${health.event_rate_series.slice(-30)}
        />
        <${Kpi}
          label="TASKS · 24H"
          value=${kpis.tasks_24h}
          delta="${kpis.tasks_24h - 78 > 0 ? "+" : ""}${kpis.tasks_24h -
          78} vs 7d"
          deltaDir="up"
        />
        <${Kpi}
          label="PASS RATE"
          value=${fmtPct(kpis.pass_rate)}
          delta="−2.1pp vs 7d"
          deltaDir="down"
          sparkColor="var(--st-live)"
          spark=${[
            0.86, 0.85, 0.84, 0.85, 0.86, 0.85, 0.84, 0.83, 0.85, 0.85, 0.86,
            0.84,
          ]}
        />
        <${Kpi}
          label="ACTIVE SKILLS"
          value=${kpis.active_skill_count}
          delta="${kpis.finding_alive} alive findings"
        />
        <${Kpi}
          label="UNREAD ACTIONS"
          value=${kpis.unread_actions}
          delta="点击 → /insights"
          deltaDir="up"
        />
      </div>

      <${Card}
        eyebrow="HELIX RUNS · 活跃工作流"
        title=${activeHelix ? activeHelix.id : "当前无活跃 helix"}
        actions=${activeHelix
          ? html`<${Tag} kind="live"
              >${activeHelix.phases_done.length}/${activeHelix.phases_planned
                .length}
              phases · ${activeHelix.current}<//
            >`
          : html`<${Tag}>idle<//>`}
        style=${{ marginBottom: "16px" }}
      >
        ${activeHelix
          ? html`
              <div class="helix-phase-bar" style="margin-bottom:8px">
                ${activeHelix.phases_planned.map((p) => {
                  const isDone = activeHelix.phases_done.includes(p);
                  const isCurrent = activeHelix.current === p;
                  return html`<span
                    class=${"phase-pill" +
                    (isDone ? " done" : "") +
                    (isCurrent ? " current" : "")}
                    >${p}</span
                  >`;
                })}
              </div>
              <div class="text-xs muted">
                该 helix run 包含 ${activeHelix.task_ids.length} 个 sub-task ·
                当前在
                <span class="mono accent" style="color:var(--accent)"
                  >${activeHelix.current}</span
                >
                phase · session
                <span class="mono"
                  >${tasks.find((t) => t.helix_id === activeHelix.id)
                    ?.session_id || "?"}</span
                >
              </div>
              <div
                class="text-xs muted"
                style="margin-top:6px; opacity:.7; font-style:italic"
              >
                最近完成 helix:
                ${recentDoneHelix.map(
                  (r, i) =>
                    html`<span style="margin-left:8px"
                        ><span class="mono">${r.id}</span> ·
                        ${r.phases_planned.length} phases ·
                        <span style="color:#90c290"
                          >${r.promise || "done"}</span
                        ></span
                      >${i < recentDoneHelix.length - 1
                        ? html`<span style="margin-left:8px">·</span>`
                        : ""}`,
                )}
              </div>
            `
          : html`
              <div class="text-sm muted">
                空闲 · 上次 helix 在 ${relTime(recentDoneHelix[0]?.started_ms)}
                完成 (${recentDoneHelix[0]?.id || "—"})
              </div>
            `}
      <//>

      <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:16px">
        <!-- LEFT: timeline -->
        <${Card}
          eyebrow="LIVE · 事件时间线"
          title="最近事件"
          actions=${html`<${Tag} kind="live"
            >SSE · ${health.event_rate.toFixed(2)} evt/s<//
          >`}
        >
          <div class="timeline">
            ${events.length === 0
              ? html`
                  <div
                    style="padding:32px; text-align:center; color:var(--t3); font-family:var(--ff-mono); font-size:12px"
                  >
                    等待事件 · 运行 Claude Code 时事件会实时出现
                  </div>
                `
              : events.slice(0, 18).map(
                  (ev) => html`
                    <div class=${"tl-row" + (ev.__new ? " new" : "")}>
                      <div class="ts">
                        ${new Date(ev.ts_ms).toLocaleTimeString("zh-CN", {
                          hour12: false,
                        })}
                      </div>
                      <div class="type">${ev.type}</div>
                      <div class="body">
                        <span class="ref">${ev.skill_id}</span>
                        ${ev.payload.duration_ms != null
                          ? html` · ${fmtMs(ev.payload.duration_ms)}`
                          : ""}
                        ${ev.payload.tool
                          ? html` · tool=${ev.payload.tool}`
                          : ""}
                        ${ev.payload.file
                          ? html` · ${ev.payload.file.split("/").slice(-1)[0]}`
                          : ""}
                        ${ev.payload.status === "failed"
                          ? html` · <${Tag} kind="err">FAILED<//>`
                          : ""}
                      </div>
                      <div class="mono text-xs muted">
                        #${ev.session_id ? ev.session_id.slice(-4) : "—"}
                      </div>
                    </div>
                  `,
                )}
          </div>
        <//>

        <!-- RIGHT: skills + tasks -->
        <div class="flex-col gap-4">
          <${Card}
            eyebrow="SKILLS · 项目"
            title="状态 / 运行次数 / 通过率"
            actions=${html`<button class="btn ghost">展开<//>`}
          >
            ${skills.length === 0
              ? html`
                  <div
                    class="muted text-sm"
                    style="padding:16px; text-align:center"
                  >
                    加载中...
                  </div>
                `
              : html`
                  <table class="data">
                    <thead>
                      <tr>
                        <th>SKILL</th>
                        <th>状态</th>
                        <th class="right">RUNS</th>
                        <th class="right">PASS</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${skills.slice(0, 7).map(
                        (s) => html`
                          <tr
                            class="row"
                            onClick=${() => $drawerSkill.set(s.id)}
                          >
                            <td><span class="mono">${s.id}</span></td>
                            <td>
                              <${StatusDot}
                                status=${s.state === "running"
                                  ? "running"
                                  : s.state === "error"
                                    ? "failed"
                                    : s.state === "done"
                                      ? "done"
                                      : "archived"}
                              /><span class="text-xs muted">${s.state}</span>
                            </td>
                            <td class="num">${s.freq}</td>
                            <td>
                              <${BarInline}
                                value=${s.pass}
                                color=${s.pass < 0.5
                                  ? "err"
                                  : s.pass < 0.8
                                    ? "warn"
                                    : "ok"}
                                format=${(v) => (v * 100).toFixed(0) + "%"}
                              />
                            </td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                `}
          <//>

          <${Card} eyebrow="TASKS · 最近" title="进行中 / 最近完成">
            ${tasks.length === 0
              ? html`
                  <div
                    class="muted text-sm"
                    style="padding:16px; text-align:center"
                  >
                    暂无任务记录
                  </div>
                `
              : html`
                  <table class="data">
                    <tbody>
                      ${tasks.slice(0, 5).map(
                        (t) => html`
                          <tr class="row">
                            <td>
                              <${StatusDot} status=${t.status} /><span
                                class="mono text-xs"
                                >${t.task_id}</span
                              >
                            </td>
                            <td>
                              <span
                                class="muted text-xs"
                                style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block"
                                >${t.label || t.skill}</span
                              >
                            </td>
                            <td class="num mono">
                              ${t.duration_ms ? fmtMs(t.duration_ms) : "—"}
                            </td>
                            <td class="right">
                              ${t.status === "failed"
                                ? html`<${Tag} kind="err">failed<//>`
                                : t.status === "running"
                                  ? html`<${Tag} kind="live">running<//>`
                                  : html`<${Tag}>done<//>`}
                            </td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                `}
          <//>
        </div>
      </div>

      <div
        style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px"
      >
        <${Card}
          eyebrow="FINDINGS · 活跃"
          title="已验证的发现"
          actions=${html`<${Tag} kind="acc"
            >${findings.filter((f) => f.status === "alive").length} alive<//
          >`}
        >
          ${findings.filter((f) => f.status === "alive").length === 0
            ? html`<div
                class="muted text-sm"
                style="padding:16px; text-align:center"
              >
                暂无活跃 findings · 查看 _meta/findings.md
              </div>`
            : findings
                .filter((f) => f.status === "alive")
                .slice(0, 4)
                .map(
                  (f) => html`
                    <div
                      style="padding:10px 0; border-bottom:1px solid var(--border-soft)"
                    >
                      <div
                        class="flex gap-2"
                        style="align-items:center; margin-bottom:4px"
                      >
                        <span
                          class="mono accent"
                          style="color:var(--accent); font-size:11px"
                          >${f.id}</span
                        >
                        <span
                          class="fw-500"
                          style="color:var(--t1); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:280px"
                          >${f.title}</span
                        >
                      </div>
                      <div class="text-xs muted" style="line-height:1.5">
                        ${(f.body || "").slice(0, 120)}${f.body &&
                        f.body.length > 120
                          ? "…"
                          : ""}
                      </div>
                    </div>
                  `,
                )}
        <//>

        <${Card} eyebrow="PROGRESS · git log" title="最近提交记录">
          ${progress.length === 0
            ? html`<div
                class="muted text-sm"
                style="padding:16px; text-align:center"
              >
                暂无提交记录
              </div>`
            : progress.slice(0, 5).map(
                (p) => html`
                  <div
                    style="padding:10px 0; border-bottom:1px solid var(--border-soft)"
                  >
                    <div
                      class="flex gap-2"
                      style="align-items:center; margin-bottom:4px"
                    >
                      <span
                        class="mono"
                        style="color:var(--accent); font-size:11px"
                        >${p.commit}</span
                      >
                      <span class="muted mono text-xs" style="margin-left:auto"
                        >${p.ts_ms ? relTime(p.ts_ms) : "—"}</span
                      >
                    </div>
                    <div
                      class="text-sm"
                      style="color:var(--t1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap"
                    >
                      ${p.body}
                    </div>
                  </div>
                `,
              )}
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
  const maxFreq = Math.max(...skills.map((s) => s.freq));
  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ insights · 为什么</div>
          <h1 class="page-title">从「发生了什么」到「该做什么」</h1>
        </div>
        <div class="page-actions">
          <span class="muted text-xs mono"
            >每 60s 重算 · 上次 ${relTime(Date.now() - 23_000)} 前</span
          >
          <button class="btn"><span>立即重算</span></button>
        </div>
      </div>

      <div
        style="display:grid; grid-template-columns: 1.2fr 1fr; gap:16px; margin-bottom:16px"
      >
        <${Card}
          eyebrow="ROI QUADRANT"
          title="Skill 频次 × 通过率"
          actions=${html`<span class="muted text-xs mono"
            >气泡大小 = 平均耗时<//
          >`}
        >
          <div class="quad">
            <div class="axis-v"></div>
            <div class="axis-h"></div>
            <div class="label" style="left:8px; top:8px">↑ 通过率</div>
            <div class="label" style="right:8px; bottom:8px">频次 →</div>
            <div
              class="quad-tag"
              style="left:54%; top:8px; color:var(--st-live)"
            >
              ⭐ 主力
            </div>
            <div class="quad-tag" style="left:8px; top:8px; color:var(--t3)">
              低频高过
            </div>
            <div
              class="quad-tag"
              style="left:8px; bottom:24px; color:var(--t3)"
            >
              低频低过
            </div>
            <div
              class="quad-tag"
              style="right:8px; bottom:24px; color:var(--st-error)"
            >
              ⚠ 注意
            </div>
            ${skills.map((s) => {
              const x = 8 + (s.freq / maxFreq) * 84;
              const y = 8 + (1 - s.pass) * 84;
              const size = 18 + (s.avgMs / 9200) * 36;
              const color =
                s.pass < 0.7
                  ? "var(--st-error)"
                  : s.pass < 0.85
                    ? "var(--st-warn)"
                    : "var(--st-live)";
              const bg =
                s.pass < 0.7
                  ? "rgba(201,120,112,.35)"
                  : s.pass < 0.85
                    ? "rgba(212,168,67,.3)"
                    : "rgba(136,201,144,.3)";
              return html`
                <div
                  class="bubble"
                  style=${`left:${x}%; top:${y}%; width:${size}px; height:${size}px; transform:translate(-50%,-50%); background:${bg}; border-color:${color}`}
                  title=${s.id +
                  " · " +
                  s.freq +
                  " runs · " +
                  (s.pass * 100).toFixed(0) +
                  "% pass · " +
                  fmtMs(s.avgMs)}
                  onClick=${() => $drawerSkill.set(s.id)}
                >
                  ${s.id.split("-")[0]}
                </div>
              `;
            })}
          </div>
          <div class="text-xs muted" style="margin-top:8px">
            ${skills.filter((s) => s.pass < 0.5 && s.freq > 0).length > 0
              ? skills
                  .filter((s) => s.pass < 0.5 && s.freq > 0)
                  .slice(0, 2)
                  .map((s) => s.id)
                  .join("、") + " 在右下角 · 高频低过 · 点击气泡查看详情"
              : skills.length > 0
                ? "所有活跃 skill 运行正常 · 点击气泡查看 skill 详情"
                : "暂无 skill 数据 · 运行 Claude Code 后自动出现"}
          </div>
        <//>

        <${Card} eyebrow="USAGE HEATMAP" title="过去 14 天 × 每小时调用密度">
          <div class="heatmap">
            ${heatmap.map((v) => {
              const op = v < 0.05 ? 0.04 : v;
              return html`<div
                class="cell"
                style=${"background:rgba(201,169,110," + op.toFixed(2) + ")"}
              ></div>`;
            })}
          </div>
          <div class="heatmap-axis">
            <span>0:00</span><span>6:00</span><span>12:00</span
            ><span>18:00</span><span>23:00</span>
          </div>
          <div class="text-xs muted" style="margin-top:10px">
            颜色深度 = 调用密度 · 浅色 = 低活动 · 深色 = 高活动 ·
            历史数据积累后自动填充
          </div>
        <//>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1.4fr; gap:16px">
        <${Card} eyebrow="ANOMALY · 60min" title="z-score > 2 的指标">
          ${anomalies.map(
            (a) => html`
              <div
                class=${"anomaly-row " +
                a.severity +
                (a.skill ? " clickable" : "")}
                onClick=${a.skill ? () => $drawerSkill.set(a.skill) : null}
              >
                <div
                  class="meta"
                  style=${"color:" +
                  (a.severity === "err"
                    ? "var(--st-error)"
                    : a.severity === "warn"
                      ? "var(--st-warn)"
                      : "var(--st-info)")}
                >
                  ${a.sigma > 0 ? "+" : ""}${a.sigma.toFixed(1)}σ
                </div>
                <div>
                  <div class="body" style="color:var(--t1)">
                    ${a.metric} <span class="mono accent">${a.value}</span>
                  </div>
                  <div class="text-xs muted">
                    基线 ${a.baseline}${a.skill ? " · " + a.skill : ""}
                  </div>
                </div>
                <button class="btn ghost text-xs">详情</button>
              </div>
            `,
          )}
        <//>

        <${Card}
          eyebrow="NEXT ACTIONS · 可执行"
          title="基于规则引擎的推荐"
          actions=${html`<${Tag} kind="acc">${nextActions.length} 待办<//>`}
        >
          ${nextActions.map(
            (a) => html`
              <div
                class=${"action-card" +
                (a.priority === "high" ? " priority" : "") +
                (a.skill ? " clickable" : "")}
                onClick=${a.skill
                  ? (e) => {
                      if (e.target.classList.contains("copy")) return;
                      $drawerSkill.set(a.skill);
                    }
                  : null}
                title=${a.skill ? "点击查看 " + a.skill + " 详情" : ""}
              >
                <div class="row1">
                  <${Tag}
                    kind=${a.priority === "high"
                      ? "acc"
                      : a.priority === "med"
                        ? "info"
                        : "warn"}
                    >${a.id}<//
                  >
                  <span class="title">${a.title}</span>
                  ${a.skill
                    ? html`<span
                        class="mono text-xs"
                        style="color:var(--accent); opacity:.8"
                        >→ ${a.skill}</span
                      >`
                    : ""}
                  <span class="muted mono text-xs" style="margin-left:auto"
                    >${a.priority}</span
                  >
                </div>
                <div class="body">${a.body}</div>
                <div class="cmd">
                  <span style="color:var(--t3)">$</span>
                  <span>${a.cmd}</span>
                  <span
                    class="copy"
                    onClick=${(e) => {
                      e.stopPropagation();
                      navigator.clipboard?.writeText(a.cmd);
                      e.target.textContent = "已复制 ✓";
                      setTimeout(() => (e.target.textContent = "复制"), 1200);
                    }}
                    >复制</span
                  >
                </div>
              </div>
            `,
          )}
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

  const allOk =
    health.workers.length === 0 ||
    health.workers.every((w) => w.status === "running");

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ health · 系统自观测</div>
          <h1 class="page-title">harness 自己跑得健不健康</h1>
        </div>
        <div class="page-actions">
          <${Tag} kind=${allOk ? "live" : "warn"}
            >${allOk ? "所有 worker 在线" : "有 worker 异常"}<//
          >
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:18px">
        <${Kpi}
          label="EVENT RATE"
          value=${health.event_rate.toFixed(2) + " /s"}
          delta="实时事件摄入速率"
          spark=${health.event_rate_series.slice(-30)}
          sparkColor="var(--st-live)"
        />
        <${Kpi}
          label="JSONL SIZE"
          value=${health.db_size_mb.toFixed(2) + " MB"}
          delta="live-events.jsonl"
        />
        <${Kpi}
          label="MEMORY"
          value=${health.mem_mb.toFixed(0) + " MB"}
          delta=${"RSS " + (health.mem_rss_mb || 0).toFixed(0) + " MB"}
          deltaDir="up"
        />
        <${Kpi}
          label="UPTIME"
          value=${health.uptime_s > 3600
            ? (health.uptime_s / 3600).toFixed(1) + "h"
            : health.uptime_s > 60
              ? (health.uptime_s / 60).toFixed(0) + "m"
              : (health.uptime_s || 0) + "s"}
          delta="服务器运行时长"
        />
        <${Kpi}
          label="SESSIONS"
          value=${health.sessions || 0}
          delta=${"活跃 " + (health.live_sessions || 0) + " 个"}
        />
        <${Kpi}
          label="TASKS TOTAL"
          value=${fmtNum(health.tasks || 0)}
          delta="已聚合"
        />
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
        <${Card} eyebrow="WORKERS · 实时进程" title="服务器组件状态">
          <table class="data">
            <thead>
              <tr>
                <th>WORKER</th>
                <th>状态</th>
                <th class="right">指标</th>
              </tr>
            </thead>
            <tbody>
              ${health.workers.length === 0
                ? html`<tr>
                    <td
                      colspan="3"
                      class="muted text-sm"
                      style="padding:16px; text-align:center"
                    >
                      服务器未报告 worker 状态
                    </td>
                  </tr>`
                : health.workers.map(
                    (w) => html`
                      <tr>
                        <td>
                          <span class="mono fw-500" style="color:var(--t1)"
                            >${w.name}</span
                          >
                        </td>
                        <td><${StatusDot} status=${w.status} />${w.status}</td>
                        <td class="right text-xs muted mono">
                          ${w.payload
                            ? Object.entries(w.payload)
                                .map(([k, v]) => k + "=" + v)
                                .join(" · ")
                            : "—"}
                        </td>
                      </tr>
                    `,
                  )}
              <tr>
                <td>
                  <span class="mono fw-500" style="color:var(--t1)"
                    >sse-broker</span
                  >
                </td>
                <td><${StatusDot} status="running" />running</td>
                <td class="right text-xs muted mono">
                  clients=${health.sse_clients || 0}
                </td>
              </tr>
            </tbody>
          </table>
        <//>

        <${Card} eyebrow="SLO 看板" title="目标 vs 实际">
          <table class="data">
            <tbody>
              <tr>
                <td>事件摄入速率</td>
                <td>
                  <${BarInline}
                    value=${Math.min(health.event_rate, 10)}
                    max=${10}
                    color="ok"
                    format=${(v) => v.toFixed(2) + "/s"}
                  />
                </td>
                <td class="right text-xs muted">实时</td>
              </tr>
              <tr>
                <td>内存使用</td>
                <td>
                  <${BarInline}
                    value=${health.mem_mb}
                    max=${512}
                    color=${health.mem_mb > 400 ? "warn" : "ok"}
                    format=${(v) => v.toFixed(0) + "MB"}
                  />
                </td>
                <td class="right text-xs muted">&lt; 512MB</td>
              </tr>
              <tr>
                <td>SSE 客户端</td>
                <td>
                  <${BarInline}
                    value=${health.sse_clients || 0}
                    max=${10}
                    color="ok"
                    format=${(v) => v.toFixed(0) + " 个"}
                  />
                </td>
                <td class="right text-xs muted">当前连接</td>
              </tr>
              <tr>
                <td>日志文件</td>
                <td>
                  <${BarInline}
                    value=${health.db_size_mb}
                    max=${100}
                    color=${health.db_size_mb > 80 ? "warn" : "ok"}
                    format=${(v) => v.toFixed(1) + "MB"}
                  />
                </td>
                <td class="right text-xs muted">&lt; 100MB</td>
              </tr>
            </tbody>
          </table>
        <//>
      </div>

      <div style="margin-top:16px">
        <${Card} eyebrow="JSONL · live-events" title="事件文件信息">
          <div
            style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px"
          >
            <div
              class="kpi sub"
              style="background:var(--bg-sub); padding:14px; border-radius:8px"
            >
              <div class="lbl">FILE SIZE</div>
              <div class="val" style="font-size:20px">
                ${health.db_size_mb.toFixed(2)} MB
              </div>
              <div class="muted text-xs" style="margin-top:4px">
                ${fmtNum(health.jsonl_size_bytes || 0)} bytes
              </div>
            </div>
            <div
              class="kpi sub"
              style="background:var(--bg-sub); padding:14px; border-radius:8px"
            >
              <div class="lbl">BYTES READ</div>
              <div class="val" style="font-size:20px">
                ${fmtNum(health.jsonl_size_bytes || 0)}
              </div>
              <div class="muted text-xs" style="margin-top:4px">
                已处理字节数
              </div>
            </div>
            <div
              class="kpi sub"
              style="background:var(--bg-sub); padding:14px; border-radius:8px"
            >
              <div class="lbl">SKILLS</div>
              <div class="val" style="font-size:20px">
                ${health.skills_count || 0}
              </div>
              <div class="muted text-xs" style="margin-top:4px">
                项目 skill 总数
              </div>
            </div>
          </div>
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
  const [filter, setFilter] = useState("alive");

  const filtered = findings.filter(
    (f) => filter === "all" || f.status === filter,
  );

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ findings · 知识闭环</div>
          <h1 class="page-title">Findings · 假设 · 问题</h1>
        </div>
        <div class="page-actions">
          <button
            class=${"btn" + (filter === "alive" ? " primary" : "")}
            onClick=${() => setFilter("alive")}
          >
            alive (${findings.filter((f) => f.status === "alive").length})
          </button>
          <button
            class=${"btn" + (filter === "stale" ? " primary" : "")}
            onClick=${() => setFilter("stale")}
          >
            stale (${findings.filter((f) => f.status === "stale").length})
          </button>
          <button
            class=${"btn" + (filter === "archived" ? " primary" : "")}
            onClick=${() => setFilter("archived")}
          >
            archived (${findings.filter((f) => f.status === "archived").length})
          </button>
          <button
            class=${"btn" + (filter === "all" ? " primary" : "")}
            onClick=${() => setFilter("all")}
          >
            all
          </button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:16px">
        <${Card} eyebrow="FINDINGS" title=${filtered.length + " 条"}>
          ${filtered.map(
            (f) => html`
              <div
                style="padding:14px 0; border-bottom:1px solid var(--border-soft)"
              >
                <div
                  class="flex gap-2"
                  style="align-items:center; margin-bottom:6px"
                >
                  <${StatusDot} status=${f.status} />
                  <span
                    class="mono fw-600"
                    style="color:var(--accent); font-size:12px"
                    >${f.id}</span
                  >
                  <span class="fw-500" style="color:var(--t1); font-size:14px"
                    >${f.title}</span
                  >
                  <span class="mono muted text-xs" style="margin-left:auto"
                    >${relTime(f.updated_ms)}</span
                  >
                </div>
                <div
                  class="text-sm muted"
                  style="margin-bottom:8px; line-height:1.6"
                >
                  ${f.body}
                </div>
                <div class="flex gap-2">
                  ${f.related_q.map(
                    (q) => html`<${Tag} kind="info">Q ${q}<//>`,
                  )}
                  ${f.related_h.map((h) => html`<${Tag} kind="acc">H ${h}<//>`)}
                  ${f.status === "stale" &&
                  html`<button
                    class="btn ghost text-xs"
                    style="margin-left:auto"
                  >
                    归档
                  <//>`}
                </div>
              </div>
            `,
          )}
        <//>

        <div class="flex-col gap-4">
          <${Card} eyebrow="HYPOTHESES" title=${hypotheses.length + " 个假设"}>
            ${hypotheses.map(
              (h) => html`
                <div
                  style="padding:10px 0; border-bottom:1px solid var(--border-soft)"
                >
                  <div class="flex gap-2" style="margin-bottom:4px">
                    <span
                      class="mono"
                      style="color:var(--accent); font-size:11px"
                      >${h.id}</span
                    >
                    <${Tag}
                      kind=${h.status === "validated"
                        ? "live"
                        : h.status === "refuted"
                          ? "err"
                          : "info"}
                      >${h.status}<//
                    >
                  </div>
                  <div class="text-sm" style="color:var(--t1)">${h.title}</div>
                  <div class="text-xs muted" style="margin-top:4px">
                    证据: ${h.evidence.join(", ")}
                  </div>
                </div>
              `,
            )}
          <//>
          <${Card} eyebrow="QUESTIONS" title=${questions.length + " 个问题"}>
            ${questions.map(
              (q) => html`
                <div
                  style="padding:10px 0; border-bottom:1px solid var(--border-soft)"
                >
                  <div class="flex gap-2" style="margin-bottom:4px">
                    <span
                      class="mono"
                      style="color:var(--accent); font-size:11px"
                      >${q.id}</span
                    >
                    <${Tag} kind=${q.status === "answered" ? "live" : "warn"}
                      >${q.status}<//
                    >
                    ${q.answer &&
                    html`<span class="muted mono text-xs">→ ${q.answer}</span>`}
                  </div>
                  <div class="text-sm" style="color:var(--t1)">${q.title}</div>
                </div>
              `,
            )}
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
  const [groupBy, setGroupBy] = useState("session"); // session | helix | mode | flat
  const [filterMode, setFilterMode] = useState("all"); // all | team | independent

  const filtered =
    filterMode === "all" ? tasks : tasks.filter((t) => t.mode === filterMode);

  // group
  let groups = [];
  if (groupBy === "session") {
    const map = new Map();
    for (const t of filtered) {
      if (!map.has(t.session_id)) map.set(t.session_id, []);
      map.get(t.session_id).push(t);
    }
    groups = [...map.entries()].map(([k, ts]) => ({
      key: k,
      label: "session " + k,
      sub: `${ts.length} tasks · ${ts.filter((x) => x.mode === "team").length} team`,
      ts,
    }));
  } else if (groupBy === "helix") {
    const map = new Map([["__none", []]]);
    for (const t of filtered) {
      const key = t.helix_id || "__none";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    groups = [...map.entries()]
      .filter(([_, ts]) => ts.length)
      .map(([k, ts]) => {
        const run = helixRuns.find((r) => r.id === k);
        return {
          key: k,
          label: k === "__none" ? "无 helix run（独立任务）" : k,
          sub: run
            ? `${run.status} · ${run.phases_done.length}/${run.phases_planned.length} phases`
            : `${ts.length} tasks`,
          run,
          ts,
        };
      });
  } else if (groupBy === "mode") {
    const map = { team: [], independent: [] };
    for (const t of filtered) (map[t.mode] || (map[t.mode] = [])).push(t);
    groups = ["team", "independent"]
      .filter((k) => map[k]?.length)
      .map((k) => ({
        key: k,
        label: "MODE = " + k.toUpperCase(),
        sub: `${map[k].length} tasks`,
        ts: map[k],
      }));
  } else {
    groups = [
      {
        key: "all",
        label: "全部任务",
        sub: `${filtered.length} 条`,
        ts: filtered,
      },
    ];
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
            ${["session", "helix", "mode", "flat"].map(
              (g) => html`
                <button
                  class=${"seg-btn" + (groupBy === g ? " active" : "")}
                  onClick=${() => setGroupBy(g)}
                >
                  by ${g}
                </button>
              `,
            )}
          </div>
          <div class="seg">
            ${["all", "team", "independent"].map(
              (m) => html`
                <button
                  class=${"seg-btn" + (filterMode === m ? " active" : "")}
                  onClick=${() => setFilterMode(m)}
                >
                  ${m}
                </button>
              `,
            )}
          </div>
        </div>
      </div>

      <div class="flex-col gap-3">
        ${groups.map(
          (g) => html`
            <${Card}
              eyebrow=${groupBy.toUpperCase()}
              title=${g.label}
              actions=${html`<span class="muted text-xs mono">${g.sub}</span>`}
            >
              ${g.run
                ? html`
                    <div class="helix-phase-bar">
                      ${g.run.phases_planned.map((p) => {
                        const isDone = g.run.phases_done.includes(p);
                        const isCurrent = g.run.current === p;
                        return html`<span
                          class=${"phase-pill" +
                          (isDone ? " done" : "") +
                          (isCurrent ? " current" : "")}
                          >${p}</span
                        >`;
                      })}
                      ${g.run.promise
                        ? html`<span class="phase-promise"
                            >${g.run.promise}</span
                          >`
                        : null}
                    </div>
                  `
                : null}
              <table class="data" style="margin-top:${g.run ? "10px" : "0"}">
                <thead>
                  <tr>
                    <th>TASK</th>
                    <th>LABEL</th>
                    <th>SKILL</th>
                    <th>MODE</th>
                    <th>状态</th>
                    <th class="right">耗时</th>
                    <th class="right">tools</th>
                    <th class="right">files</th>
                    <th class="right">started</th>
                    <th class="right">FB</th>
                  </tr>
                </thead>
                <tbody>
                  ${g.ts.map(
                    (t) => html`
                      <tr
                        class="row"
                        onClick=${() => $drawerSkill.set(t.skill)}
                        style="cursor:pointer"
                      >
                        <td>
                          <span class="mono fw-500" style="color:var(--t1)"
                            >${t.task_id}</span
                          >
                        </td>
                        <td>
                          <span class="text-sm" style="color:var(--t2)"
                            >${t.label || "—"}</span
                          >
                        </td>
                        <td>
                          <span class="muted text-xs mono">${t.skill}</span>
                        </td>
                        <td>
                          <span class=${"mode-badge mode-" + t.mode}
                            >${t.mode}</span
                          >
                        </td>
                        <td>
                          <${StatusDot} status=${t.status} /><span
                            class="text-xs"
                            >${t.status}</span
                          >
                        </td>
                        <td class="num mono">
                          ${t.duration_ms ? fmtMs(t.duration_ms) : "—"}
                        </td>
                        <td class="num mono">${t.tools}</td>
                        <td class="num mono">${t.files}</td>
                        <td class="num mono muted">${relTime(t.started_ms)}</td>
                        <td class="right">
                          ${t.feedback === 1
                            ? "👍"
                            : t.feedback === -1
                              ? "👎"
                              : t.feedback === 0
                                ? "·"
                                : "—"}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            <//>
          `,
        )}
      </div>
    </div>
  `;
}

// ============================================================
// DATA VIEW (storage browser)
// ============================================================
export function DataView() {
  const health = useStore($health);
  const kpis = useStore($kpis);

  const stores = [
    {
      name: "live-events.jsonl",
      kind: "append-only log",
      count: fmtNum(health.jsonl_size_bytes || 0) + " bytes",
      size: health.db_size_mb.toFixed(2) + " MB",
      desc: "事件主日志 · tail 实时摄入 · SSE 广播",
      status: health.db_size_mb > 0 ? "ok" : "warn",
    },
    {
      name: "sessions (memory)",
      kind: "in-memory map",
      count: fmtNum(health.sessions || 0),
      size: "—",
      desc: "Session 聚合层 · 每次启动从 JSONL 重建",
      status: health.sessions > 0 ? "ok" : "idle",
    },
    {
      name: "tasks (memory)",
      kind: "in-memory map",
      count: fmtNum(health.tasks || 0),
      size: "—",
      desc: "Task 聚合层 · 2 层 session→task 模型",
      status: health.tasks > 0 ? "ok" : "idle",
    },
    {
      name: "_meta/findings.md",
      kind: "markdown",
      count: fmtNum(kpis.finding_alive + kpis.finding_stale) + " findings",
      size: "—",
      desc: "已验证 / 待验证 / 死路 三分类 · server 解析",
      status: "ok",
    },
    {
      name: "_meta/helix-runs.jsonl",
      kind: "append-only log",
      count: "—",
      size: "—",
      desc: "Helix 多阶段 run 记录 · phase_report + finalize",
      status: "ok",
    },
    {
      name: "_meta/progress.md",
      kind: "markdown",
      count: "—",
      size: "—",
      desc: "进度日志 · 铁律 1: 每任务对应一条记录",
      status: "ok",
    },
    {
      name: "skills/*/logs/runs.jsonl",
      kind: "per-skill log",
      count: fmtNum(health.skills_count || 0) + " skills",
      size: "—",
      desc: "Skill 运行记录 · passes / summary · 每 skill 独立文件",
      status: health.skills_count > 0 ? "ok" : "idle",
    },
    {
      name: "SSE broker (memory)",
      kind: "in-process",
      count: (health.sse_clients || 0) + " clients",
      size: "—",
      desc: "Server-Sent Events · /sse endpoint · 实时推送",
      status: health.sse_clients > 0 ? "ok" : "idle",
    },
  ];

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ data · 数据层</div>
          <h1 class="page-title">JSONL + Markdown · 零依赖存储架构</h1>
        </div>
        <div class="page-actions">
          <span class="muted text-xs mono"
            >Node stdlib only · no SQLite · no external deps</span
          >
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:18px">
        <${Kpi}
          label="JSONL SIZE"
          value=${health.db_size_mb.toFixed(2) + " MB"}
          delta="live-events.jsonl"
        />
        <${Kpi}
          label="SESSIONS"
          value=${fmtNum(health.sessions || 0)}
          delta=${"live: " + (health.live_sessions || 0)}
        />
        <${Kpi}
          label="TASKS"
          value=${fmtNum(health.tasks || 0)}
          delta="内存中"
        />
        <${Kpi}
          label="SKILLS"
          value=${health.skills_count || 0}
          delta="已扫描"
        />
        <${Kpi}
          label="FINDINGS"
          value=${kpis.finding_alive + kpis.finding_stale}
          delta=${kpis.finding_alive + " alive"}
        />
        <${Kpi}
          label="EVENT RATE"
          value=${health.event_rate.toFixed(2) + "/s"}
          delta="滚动 60s"
          sparkColor="var(--st-live)"
          spark=${health.event_rate_series.slice(-30)}
        />
      </div>

      <${Card} eyebrow="STORAGE · 数据源" title="存储层组件">
        <table class="data">
          <thead>
            <tr>
              <th>组件</th>
              <th>类型</th>
              <th class="right">数量</th>
              <th class="right">大小</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${stores.map(
              (s) => html`
                <tr class="row">
                  <td>
                    <span class="mono fw-500" style="color:var(--t1)"
                      >${s.name}</span
                    >
                  </td>
                  <td><span class="muted text-xs mono">${s.kind}</span></td>
                  <td class="num mono">${s.count}</td>
                  <td class="num mono">${s.size}</td>
                  <td class="text-sm muted">${s.desc}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      <//>

      <div style="margin-top:16px">
        <${Card} eyebrow="ARCHITECTURE · 架构说明" title="数据流">
          <div
            style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px"
          >
            <div
              class="kpi sub"
              style="background:var(--bg-sub); padding:14px; border-radius:8px"
            >
              <div class="lbl">INGEST</div>
              <div class="val" style="font-size:14px; margin-top:4px">
                tail JSONL → processEvent → sessions/tasks maps
              </div>
            </div>
            <div
              class="kpi sub"
              style="background:var(--bg-sub); padding:14px; border-radius:8px"
            >
              <div class="lbl">BROADCAST</div>
              <div class="val" style="font-size:14px; margin-top:4px">
                new event → SSE broadcast → frontend stores
              </div>
            </div>
            <div
              class="kpi sub"
              style="background:var(--bg-sub); padding:14px; border-radius:8px"
            >
              <div class="lbl">QUERY</div>
              <div class="val" style="font-size:14px; margin-top:4px">
                REST /api/* → in-memory read → JSON response
              </div>
            </div>
          </div>
        <//>
      </div>
    </div>
  `;
}

// ============================================================
// SESSIONS VIEW — Claude 会话历史 + 持久化时间线
// 每个 session 独立成块；展开可看 helix runs + 散落事件 + 工具使用统计
// ============================================================
export function SessionsView() {
  const sessions = useStore($sessions);
  const expanded = useStore($expandedSessionId);
  const cache = useStore($sessionTimelineCache);
  const filter = useStore($sessionsFilter);
  const search = useStore($sessionsSearch);

  // 展开切换：点击触发懒加载
  function toggle(sid) {
    if (expanded === sid) {
      $expandedSessionId.set(null);
    } else {
      $expandedSessionId.set(sid);
      if (!cache[sid]) loadSessionTimeline(sid);
    }
  }

  // 过滤：今日/本周/全部 + 搜索
  const now = Date.now();
  const dayMs = 86400000;
  const filtered = sessions.filter((s) => {
    const t = parseTs(s.last_event_at);
    if (filter === "today" && now - t > dayMs) return false;
    if (filter === "week" && now - t > 7 * dayMs) return false;
    if (search && !s.id.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const counts = {
    all: sessions.length,
    today: sessions.filter((s) => now - parseTs(s.last_event_at) <= dayMs)
      .length,
    week: sessions.filter((s) => now - parseTs(s.last_event_at) <= 7 * dayMs)
      .length,
  };

  return html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-subtitle">/ sessions · Claude 会话历史</div>
          <h1 class="page-title">Sessions · 按会话回看</h1>
        </div>
        <div class="page-actions">
          <div class="seg">
            ${[
              ["all", "全部"],
              ["today", "今日"],
              ["week", "本周"],
            ].map(
              ([k, label]) => html`
                <button
                  class=${"seg-btn" + (filter === k ? " active" : "")}
                  onClick=${() => $sessionsFilter.set(k)}
                >
                  ${label} (${counts[k]})
                </button>
              `,
            )}
          </div>
          <input
            class="sessions-search"
            placeholder="搜索 session_id…"
            value=${search}
            onInput=${(e) => $sessionsSearch.set(e.target.value)}
          />
          <button class="btn ghost" onClick=${() => loadSessions()}>
            刷新
          </button>
        </div>
      </div>

      ${sessions.length === 0
        ? html`<${Card}>
            <div class="muted text-sm" style="padding:32px; text-align:center">
              加载中... · 若长时间无数据，运行
              <span class="mono">curl /api/sessions</span>
              检查后端
            </div>
          <//>`
        : filtered.length === 0
          ? html`<${Card}>
              <div
                class="muted text-sm"
                style="padding:32px; text-align:center"
              >
                ${search ? "无匹配的 session" : "当前过滤条件下无 session"}
              </div>
            <//>`
          : html`
              <!-- v0.7.2: 自定义 dropdown（深色主题），native select 在浏览器里会变白 -->
              <${SessionPicker}
                sessions=${filtered}
                selectedId=${expanded || filtered[0].id}
                onPick=${(sid) => {
                  $expandedSessionId.set(sid);
                  $sessionsPickerOpen.set(false);
                  if (!cache[sid]) loadSessionTimeline(sid);
                }}
              />

              <div style="height:12px"></div>

              ${(() => {
                const sid = expanded || filtered[0].id;
                const s = filtered.find((x) => x.id === sid) || filtered[0];
                const tl = cache[s.id];
                if (!tl) {
                  if (!cache[s.id]) loadSessionTimeline(s.id);
                  return html`<${Card}>
                    <div
                      class="muted text-sm"
                      style="padding:24px; text-align:center"
                    >
                      加载会话详情中...
                    </div>
                  <//>`;
                }
                return html`
                  <${Card}>
                    <div class="session-detail-header">
                      <div class="session-detail-title">
                        <span class="session-short-id mono">
                          ${s.id.slice(0, 8)}
                        </span>
                        ${s.status === "live"
                          ? html`<${Tag} kind="live">LIVE<//>`
                          : html`<${Tag}>ended<//>`}
                        <span class="muted text-xs mono">${s.id}</span>
                      </div>
                      <div class="session-detail-stats text-xs">
                        <span>
                          <span class="mono fw-500">${s.task_count}</span>
                          <span class="muted"> tasks</span>
                        </span>
                        <span class="dot-sep">·</span>
                        <span>
                          <span class="mono fw-500">
                            ${s.helix_runs_in_session}
                          </span>
                          <span class="muted"> helix</span>
                        </span>
                        ${s.team_tasks > 0
                          ? html`<span class="dot-sep">·</span>
                              <span>
                                <span class="mono fw-500">
                                  ${s.team_tasks}
                                </span>
                                <span class="muted"> team</span>
                              </span>`
                          : ""}
                        <span class="dot-sep">·</span>
                        <span class="muted">
                          ${formatBjShort(s.started_at)}
                        </span>
                      </div>
                    </div>
                    <${SessionTimelineDetail} session=${s} timeline=${tl} />
                  <//>
                `;
              })()}
            `}
    </div>
  `;
}

// v0.7.2: 自定义 SessionPicker — 深色主题下拉控件（native select 会被浏览器渲染成白底）
function SessionPicker({ sessions, selectedId, onPick }) {
  const open = useStore($sessionsPickerOpen);
  const { useEffect, useRef } = window.__hooks;
  const ref = useRef(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        $sessionsPickerOpen.set(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") $sessionsPickerOpen.set(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function row(s) {
    const sid = s.id.slice(0, 8);
    const dur = Math.max(0, Math.round(s.duration_ms / 60000));
    const durLabel =
      dur >= 60 ? Math.floor(dur / 60) + "h" + (dur % 60) + "m" : dur + "m";
    return { s, sid, dur, durLabel };
  }
  const selected = sessions.find((x) => x.id === selectedId) || sessions[0];
  const sel = row(selected);

  return html`
    <${Card}>
      <div class="session-picker-row" ref=${ref}>
        <span class="muted text-xs mono session-picker-label">SESSION</span>
        <button
          class=${"session-picker-btn" + (open ? " open" : "")}
          onClick=${(e) => {
            e.stopPropagation();
            $sessionsPickerOpen.set(!open);
          }}
        >
          <span class="session-picker-btn-line">
            <span
              class=${"dot " + (sel.s.status === "live" ? "live" : "ended")}
            >
              ●
            </span>
            ${sel.s.status === "live"
              ? html`<${Tag} kind="live">LIVE<//>`
              : html`<${Tag}>ended<//>`}
            <span class="session-short-id mono">${sel.sid}</span>
            <span class="muted text-xs">·</span>
            <span class="text-xs mono">${sel.s.task_count} tasks</span>
            <span class="muted text-xs">·</span>
            <span class="text-xs mono">
              ${sel.s.helix_runs_in_session} helix
            </span>
            <span class="muted text-xs">·</span>
            <span class="text-xs muted">${sel.durLabel}</span>
            <span class="muted text-xs">·</span>
            <span class="text-xs muted">
              ${formatBjShort(sel.s.started_at)}
            </span>
          </span>
          <span class="session-picker-arrow">${open ? "▲" : "▼"}</span>
        </button>
        ${open
          ? html`
              <div class="session-picker-pop">
                ${sessions.map((s) => {
                  const r = row(s);
                  const isSel = s.id === selectedId;
                  return html`
                    <div
                      class=${"session-picker-item" + (isSel ? " active" : "")}
                      onClick=${() => onPick(s.id)}
                    >
                      <span
                        class=${"dot " +
                        (s.status === "live" ? "live" : "ended")}
                      >
                        ●
                      </span>
                      ${s.status === "live"
                        ? html`<${Tag} kind="live">LIVE<//>`
                        : html`<${Tag}>ended<//>`}
                      <span class="session-short-id mono">${r.sid}</span>
                      <span class="muted text-xs">·</span>
                      <span class="text-xs mono">${s.task_count} tasks</span>
                      <span class="muted text-xs">·</span>
                      <span class="text-xs mono">
                        ${s.helix_runs_in_session} helix
                      </span>
                      <span class="muted text-xs">·</span>
                      <span class="text-xs muted">${r.durLabel}</span>
                      <span class="muted text-xs">·</span>
                      <span class="text-xs muted">
                        ${formatBjShort(s.started_at)}
                      </span>
                    </div>
                  `;
                })}
              </div>
            `
          : ""}
        <span class="muted text-xs session-picker-count">
          共 ${sessions.length} 个
        </span>
      </div>
    <//>
  `;
}

// 单个 session card：折叠态显示概要，展开态显示完整 timeline
function SessionCard({ session, open, timeline, onToggle }) {
  const isLive = session.status === "live";
  const shortId = session.id.slice(0, 8);
  const lastSeen = relTime(parseTs(session.last_event_at));
  const startedDate = formatBjShort(session.started_at);
  const durMin = Math.max(0, Math.round(session.duration_ms / 60000));
  const durLabel =
    durMin >= 60
      ? Math.floor(durMin / 60) + "h " + (durMin % 60) + "min"
      : durMin + "min";

  return html`
    <div
      class=${"session-card" +
      (isLive ? " live" : " ended") +
      (open ? " open" : "")}
    >
      <div class="session-card-head" onClick=${onToggle}>
        <div class="session-card-meta">
          <span class="session-short-id mono">${shortId}</span>
          ${isLive
            ? html`<${Tag} kind="live">LIVE<//>`
            : html`<${Tag}>ended<//>`}
          <span class="session-last-seen muted text-xs mono">
            ${isLive ? "活跃 · " + lastSeen + " ago" : startedDate}
          </span>
        </div>
        <div class="session-card-stats">
          <span><span class="muted">${durLabel}</span></span>
          <span class="dot-sep">·</span>
          <span>
            <span class="mono fw-500">${session.task_count}</span>
            <span class="muted"> tasks</span>
          </span>
          <span class="dot-sep">·</span>
          <span>
            <span class="mono fw-500">${session.helix_runs_in_session}</span>
            <span class="muted"> helix</span>
          </span>
          ${session.team_tasks > 0
            ? html`
                <span class="dot-sep">·</span>
                <span>
                  <span class="mono fw-500">${session.team_tasks}</span>
                  <span class="muted"> team</span>
                </span>
              `
            : null}
        </div>
        <div class="session-card-toggle">${open ? "收起 ▴" : "展开 →"}</div>
      </div>

      ${open
        ? html`
            <div class="session-card-body">
              ${!timeline
                ? html`<div
                    class="muted text-sm"
                    style="padding:18px; text-align:center"
                  >
                    加载 timeline...
                  </div>`
                : html`<${SessionTimelineDetail} timeline=${timeline} />`}
            </div>
          `
        : null}
    </div>
  `;
}

function SessionTimelineDetail({ timeline }) {
  const tools = Object.entries(timeline.tool_usage || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const maxToolCount = tools.length > 0 ? tools[0][1] : 1;

  return html`
    <div class="session-detail">
      <!-- 工具使用统计柱状图 -->
      ${tools.length > 0
        ? html`
            <div class="session-detail-section">
              <div class="session-detail-eyebrow">
                工具使用 · ${timeline.event_count} events
              </div>
              <div class="session-tools">
                ${tools.slice(0, 10).map(
                  ([name, n]) => html`
                    <div class="session-tool-bar">
                      <span class="session-tool-name mono">${name}</span>
                      <div class="session-tool-track">
                        <div
                          class="session-tool-fill"
                          style=${"width:" +
                          ((n / maxToolCount) * 100).toFixed(1) +
                          "%"}
                        ></div>
                      </div>
                      <span class="session-tool-count mono">${n}</span>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : null}

      <!-- helix runs -->
      <div class="session-detail-section">
        <div class="session-detail-eyebrow">
          HELIX RUNS · ${timeline.helix_runs.length}
        </div>
        ${timeline.helix_runs.length === 0
          ? html`<div class="muted text-sm" style="padding:8px 0">
              该会话内未触发 helix run
            </div>`
          : timeline.helix_runs.map(
              (r) => html`
                <div class="session-helix-row">
                  <div class="session-helix-head">
                    <span
                      class="mono fw-500"
                      style="color:var(--accent); font-size:12px"
                      >${r.helix_run_id}</span
                    >
                    ${r.promise === "COMPLETE"
                      ? html`<${Tag} kind="live">COMPLETE<//>`
                      : r.promise === "NOT_COMPLETE"
                        ? html`<${Tag} kind="err">NOT_COMPLETE<//>`
                        : r.status === "running"
                          ? html`<${Tag} kind="warn">running<//>`
                          : html`<${Tag}>${r.status || "—"}<//>`}
                    <span class="muted text-xs mono" style="margin-left:auto">
                      ${r.phases_done}/${r.phases_total} phases
                      ${r.team_plan ? " · " + r.team_plan.shape : ""}
                    </span>
                  </div>
                  ${r.task_summary
                    ? html`<div class="session-helix-summary text-xs muted">
                        ${r.task_summary}
                      </div>`
                    : null}
                </div>
              `,
            )}
      </div>

      <!-- 散落事件 -->
      ${timeline.loose_events && timeline.loose_events.length > 0
        ? html`
            <div class="session-detail-section">
              <div class="session-detail-eyebrow">
                散落事件 · ${timeline.loose_events_total}
                ${timeline.loose_events_total > timeline.loose_events.length
                  ? "（显示最近 " + timeline.loose_events.length + " 条）"
                  : ""}
              </div>
              <div class="session-loose-events">
                ${timeline.loose_events.slice(0, 30).map(
                  (ev) => html`
                    <div class="session-loose-row">
                      <span class="mono text-xs muted"
                        >${(ev.ts || "").slice(-8)}</span
                      >
                      <span class="mono text-xs" style="color:var(--accent)"
                        >${ev.tool_name || ev.hook_event || "—"}</span
                      >
                      <span
                        class="text-xs muted"
                        style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap"
                      >
                        ${ev.tool_input_summary || ev.skill || ""}
                      </span>
                      ${ev.is_error ? html`<${Tag} kind="err">err<//>` : null}
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : null}
    </div>
  `;
}

// 只取 "M-D HH:MM" 形式
function formatBjShort(ts) {
  if (!ts) return "—";
  // 北京时间格式 "YYYY-M-D HH:MM:SS" → "M-D HH:MM"
  const m = ts.match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+):/);
  if (!m) return ts;
  return m[2] + "-" + m[3] + " " + m[4] + ":" + m[5];
}

window.__VIEWS = {
  LiveView,
  InsightsView,
  HealthView,
  FindingsView,
  TasksView,
  DataView,
  SessionsView,
};
