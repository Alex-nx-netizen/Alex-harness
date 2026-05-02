// Alex-harness Dashboard v0.3 — SPA
// Design: design/dashboard-draft.md v0.3
// 三栏 IA：左 nav + 中工作区 (metric strip + subtabs + body) + 右情报中心
(() => {
  "use strict";

  /* ============ helpers ============ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      n.appendChild(
        typeof c === "string" || typeof c === "number"
          ? document.createTextNode(String(c))
          : c,
      );
    }
    return n;
  };
  const fmtMs = (ms) => {
    if (ms == null || ms < 0 || isNaN(ms)) return "—";
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60),
      ss = s % 60;
    if (m < 60) return `${m}m${ss}s`;
    const h = Math.floor(m / 60),
      mm = m % 60;
    return `${h}h${mm}m`;
  };
  const truncate = (s, n) => {
    s = String(s ?? "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  };
  const parseTs = (s) => {
    if (!s) return 0;
    const m = String(s).match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/);
    if (!m) return 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  };
  const tsAgo = (ts) => {
    const ref = state.serverTs || nowBjStr();
    const diff = parseTs(ref) - parseTs(ts);
    if (diff < 0) return "just now";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  };
  const nowBjStr = () => {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
  };
  const timePart = (ts) => (ts || "").split(" ")[1] || "";
  const shortTool = (name) => {
    if (!name) return "";
    if (name.length <= 22) return name;
    const m = name.match(/^mcp__([^_]+)__([^_]+)__(.+)$/);
    if (m) return `${m[2]}/${m[3]}`;
    return name.slice(0, 20) + "…";
  };

  /* ============ state ============ */
  const state = {
    route: null,
    subtab: "overview", // overview | skills | timeline | intel
    intelTab: "findings", // findings | progress | feedback
    skillFilter: "all", // all | running | done | error | idle
    selectedSessionId: null,
    selectedTaskId: null,
    sessionsList: [],
    sessionDetail: null,
    taskCache: new Map(),
    eventStream: [],
    eventStreamMax: 300,
    live: null,
    intel: null,
    evolution: null,
    sseStatus: "connecting",
    serverTs: null,
    activeTdfTab: "overview",
  };

  /* ============ api ============ */
  async function api(p) {
    try {
      const r = await fetch(p, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      console.error(`[api] ${p}: ${e.message}`);
      return null;
    }
  }

  /* ============ router ============ */
  function parseRoute() {
    const p = location.pathname;
    if (p === "/" || p === "/live") return { name: "live" };
    if (p === "/history") return { name: "history" };
    if (p === "/evolution") return { name: "evolution" };
    const m = p.match(/^\/task\/(.+)$/);
    if (m) return { name: "task", id: decodeURIComponent(m[1]) };
    return { name: "live" };
  }
  async function navigate(href, push = true) {
    if (push) history.pushState(null, "", href);
    state.route = parseRoute();
    await render();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-route]");
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute("href"));
  });
  window.addEventListener("popstate", () => {
    state.route = parseRoute();
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === "l") navigate("/live");
    if (k === "h") navigate("/history");
    if (k === "e") navigate("/evolution");
    // F1-F4 = live 视图的 4 个子 tab；在非 live 视图按 F1-F4 自动跳到 /live + 切到对应 subtab
    const fkeyMap = {
      F1: "overview",
      F2: "skills",
      F3: "timeline",
      F4: "intel",
    };
    if (fkeyMap[e.key]) {
      e.preventDefault();
      state.subtab = fkeyMap[e.key];
      if (state.route?.name !== "live") navigate("/live");
      else render();
    }
  });

  /* ============ SSE ============ */
  let es = null;
  function connectSSE() {
    if (es)
      try {
        es.close();
      } catch {}
    es = new EventSource("/sse");
    setSseStatus("connecting");
    es.onopen = () => setSseStatus("live");
    es.onerror = () => {
      setSseStatus("error");
      setTimeout(connectSSE, 3000);
    };
    es.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      handleSseMsg(m);
    };
  }
  function setSseStatus(s) {
    state.sseStatus = s;
    const c = $("#conn");
    c.className =
      "conn " + (s === "live" ? "live" : s === "error" ? "error" : "");
    $("#connText").textContent = s === "live" ? "SSE live" : s;
  }
  function handleSseMsg(m) {
    if (m.type === "heartbeat") {
      state.serverTs = m.ts;
      $("#footStat").textContent = `last beat ${m.ts}`;
      $("#crumbTs").textContent = m.ts;
      return;
    }
    if (m.type === "hello") {
      state.serverTs = m.ts;
      return;
    }
    if (m.type === "new_event") onNewEvent(m.event, m.task_id);
  }
  function onNewEvent(ev, taskId) {
    state.eventStream.unshift(ev);
    if (state.eventStream.length > state.eventStreamMax)
      state.eventStream.length = state.eventStreamMax;
    state.serverTs = ev.ts;
    $("#crumbTs").textContent = ev.ts;
    if (state.route?.name === "live") refreshLiveLight();
    if (state.route?.name === "history") refreshHistoryLight();
    if (state.route?.name === "task" && state.route.id === taskId)
      refreshTaskLight(taskId);
  }

  /* ============ topbar / footer ============ */
  function updateTopbar() {
    const live = state.live;
    if (!live?.session) {
      $("#crumbBadge").style.display = "none";
      $("#crumbSid").textContent = "no session";
      $("#footSid").textContent = "—";
      $("#uptime").textContent = "—";
      return;
    }
    const s = live.session;
    $("#crumbBadge").style.display =
      s.status === "live" ? "inline-flex" : "none";
    $("#crumbBadge").textContent = s.status.toUpperCase();
    $("#crumbSid").textContent = "session " + truncate(s.id, 8);
    $("#footSid").textContent = "session " + truncate(s.id, 12);
    $("#uptime").textContent = "运行 " + fmtMs(s.duration_ms);
  }

  /* ============ render entry ============ */
  async function render() {
    const view = $("#view");
    const r = state.route;
    if (!r) return;
    if (r.name === "live") return renderLive(view);
    if (r.name === "history") return renderHistory(view);
    if (r.name === "evolution") return renderEvolution(view);
    if (r.name === "task") return renderTaskDetail(view, r.id);
  }

  /* ===========================================================
     LIVE VIEW = 左 nav + 中工作区 (metric+subtab+body) + 右 intel
     =========================================================== */
  async function renderLive(view) {
    view.innerHTML = "";
    const [live, intel] = await Promise.all([
      api("/api/live"),
      api("/api/intel"),
    ]);
    state.live = live || {};
    state.intel = intel || {};
    updateTopbar();

    view.appendChild(renderLeftNav());
    view.appendChild(renderWorkArea());
    view.appendChild(renderRightIntel());
  }
  async function refreshLiveLight() {
    const [live, intel] = await Promise.all([
      api("/api/live"),
      api("/api/intel"),
    ]);
    state.live = live || {};
    state.intel = intel || {};
    updateTopbar();
    if (state.route?.name !== "live") return;
    // re-render in place (cheap enough)
    const view = $("#view");
    view.innerHTML = "";
    view.appendChild(renderLeftNav());
    view.appendChild(renderWorkArea());
    view.appendChild(renderRightIntel());
  }

  /* ---------- left nav ---------- */
  function renderLeftNav() {
    const live = state.live || {};
    const m = live.metrics || {};
    const s = live.session;
    const nav = el("aside", { class: "left-nav" });

    nav.appendChild(
      el(
        "section",
        { class: "nav-section" },
        el("div", { class: "nav-section-title" }, "会话信息"),
        el(
          "dl",
          { class: "nav-kv" },
          el("dt", {}, "session"),
          el("dd", {}, s ? truncate(s.id, 14) : "—"),
          el("dt", {}, "started"),
          el("dd", {}, s?.started_at ? timePart(s.started_at) : "—"),
          el("dt", {}, "mode"),
          el("dd", { class: m.mode === "team" ? "muted" : "" }, m.mode || "—"),
          el("dt", {}, "phase"),
          el("dd", {}, m.helix_phase || "—"),
          el("dt", {}, "uptime"),
          el("dd", {}, fmtMs(m.duration_ms)),
        ),
      ),
    );

    nav.appendChild(
      el(
        "section",
        { class: "nav-section" },
        el("div", { class: "nav-section-title" }, "导航"),
        el(
          "div",
          { class: "nav-tabs" },
          navTab("F1", "总览", "overview"),
          navTab("F2", "技能", "skills", m.skills_running || 0),
          navTab(
            "F3",
            "时间线",
            "timeline",
            live.current_task?.events_count || 0,
          ),
          navTab("F4", "情报", "intel", state.intel?.findings?.length || 0),
        ),
      ),
    );

    nav.appendChild(
      el(
        "section",
        { class: "nav-section" },
        el("div", { class: "nav-section-title" }, "视图"),
        el(
          "div",
          { class: "nav-tabs" },
          topRouteTab("L", "实时 /live", "/live", "live"),
          topRouteTab("H", "历史 /history", "/history", "history"),
          topRouteTab("E", "升级 /evolution", "/evolution", "evolution"),
        ),
      ),
    );

    nav.appendChild(
      el(
        "section",
        { class: "nav-section" },
        el("div", { class: "nav-section-title" }, "快捷键"),
        el(
          "div",
          { class: "shortcut-list" },
          el(
            "div",
            { class: "shortcut-row" },
            el("span", { class: "lbl" }, "切视图"),
            el(
              "span",
              {},
              el("kbd", {}, "L"),
              " ",
              el("kbd", {}, "H"),
              " ",
              el("kbd", {}, "E"),
            ),
          ),
          el(
            "div",
            { class: "shortcut-row" },
            el("span", { class: "lbl" }, "切子 tab"),
            el("span", {}, el("kbd", {}, "F1"), "–", el("kbd", {}, "F4")),
          ),
        ),
      ),
    );
    return nav;
  }
  function navTab(key, label, name, badgeN) {
    const isActive = state.subtab === name;
    return el(
      "div",
      {
        class: `nav-tab ${isActive && state.route?.name === "live" ? "active" : ""}`,
        title:
          state.route?.name === "live"
            ? `切换到 ${label}`
            : `跳到 /live → ${label}`,
        onclick: () => {
          state.subtab = name;
          if (state.route?.name !== "live") navigate("/live");
          else render();
        },
      },
      el("span", { class: "key" }, key),
      el("span", {}, label),
      badgeN != null && badgeN !== ""
        ? el("span", { class: "badge" }, String(badgeN))
        : null,
    );
  }
  function topRouteTab(key, label, href, routeName) {
    const isActive = state.route?.name === routeName;
    return el(
      "a",
      {
        class: `nav-tab ${isActive ? "active" : ""}`,
        href,
        "data-route": "",
      },
      el("span", { class: "key" }, key),
      el("span", {}, label),
    );
  }

  /* ---------- work area ---------- */
  function renderWorkArea() {
    const live = state.live || {};
    const m = live.metrics || {};
    const work = el("section", { class: "work" });

    // metric strip 6 cards
    const strip = el("div", { class: "metric-strip" });
    strip.appendChild(
      metricCard(
        "当前 SKILL",
        m.current_skill || "—",
        null,
        m.current_skill ? "is-live" : "",
      ),
    );
    strip.appendChild(
      metricCard(
        "MODE",
        m.mode || "—",
        m.helix_id ? `helix ${m.helix_id.slice(-6)}` : "",
      ),
    );
    strip.appendChild(
      metricCard(
        "HELIX 进度",
        m.helix_phase || "—",
        m.helix_status ? `phases · ${m.helix_status}` : "phases",
        m.helix_status === "running" ? "is-live" : "",
        m.helix_id
          ? `helix run ${m.helix_id} 已完成 ${m.helix_phase} 个 phase`
          : "暂无活跃 helix run",
      ),
    );
    strip.appendChild(
      metricCard("TASKS", String(m.tasks_count ?? 0), "本 session 总任务数"),
    );
    strip.appendChild(
      metricCard(
        "错误",
        String(m.errors ?? 0),
        null,
        (m.errors ?? 0) > 0 ? "is-error" : "",
      ),
    );
    strip.appendChild(metricCard("运行时长", fmtMs(m.duration_ms ?? 0)));
    work.appendChild(strip);

    // subtabs
    const subt = el("div", { class: "subtabs" });
    const skills = live.skills || [];
    subt.appendChild(makeSubtab("overview", "总览"));
    subt.appendChild(makeSubtab("skills", "技能", skills.length));
    subt.appendChild(
      makeSubtab("timeline", "时间线", live.current_task?.events_count),
    );
    subt.appendChild(
      makeSubtab("intel", "情报", state.intel?.findings?.length),
    );
    work.appendChild(subt);

    // body
    const body = el("div", { class: "work-body" });
    if (state.subtab === "overview") body.appendChild(renderOverview());
    else if (state.subtab === "skills") body.appendChild(renderSkillsFull());
    else if (state.subtab === "timeline")
      body.appendChild(renderTimelineFull());
    else if (state.subtab === "intel") body.appendChild(renderIntelEmbedded());
    work.appendChild(body);
    return work;
  }
  function metricCard(label, value, sub, cls, title) {
    const isString = typeof value === "string" && value.length > 8;
    const valNode = el(
      "div",
      {
        class:
          "value " +
          (label === "当前 SKILL" || label === "MODE" || isString
            ? "muted"
            : ""),
      },
      value,
    );
    return el(
      "div",
      {
        class: `metric-card ${cls || ""}`,
        title: title || `${label}: ${value}${sub ? " · " + sub : ""}`,
      },
      el("div", { class: "label" }, label),
      valNode,
      sub ? el("div", { class: "sub" }, sub) : null,
    );
  }
  function makeSubtab(name, label, count) {
    const isActive = state.subtab === name;
    return el(
      "div",
      {
        class: `subtab ${isActive ? "active" : ""}`,
        onclick: () => {
          state.subtab = name;
          render();
        },
      },
      el("span", {}, label),
      count != null && count !== ""
        ? el("span", { class: "count" }, String(count))
        : null,
    );
  }

  /* ---------- overview = skills+current run / timeline 双段 ---------- */
  function renderOverview() {
    const wrap = el("div", { class: "overview-pane" });
    const top = el("div", { class: "overview-top" });
    top.appendChild(renderSkillsPanel(false));
    top.appendChild(renderCurrentRunPanel());
    wrap.appendChild(top);
    wrap.appendChild(renderTimelinePanel(false));
    return wrap;
  }

  /* ---------- skills panel ---------- */
  function renderSkillsPanel(full) {
    const live = state.live || {};
    const skills = live.skills || [];
    const filtered =
      state.skillFilter === "all"
        ? skills
        : skills.filter((s) => s.state === state.skillFilter);
    const counts = {
      all: skills.length,
      running: skills.filter((s) => s.state === "running").length,
      done: skills.filter((s) => s.state === "done").length,
      error: skills.filter((s) => s.state === "error").length,
      idle: skills.filter((s) => s.state === "idle").length,
    };
    const pane = el("section", { class: "skills-pane" });
    pane.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "技能列表"),
        el("span", { class: "live-pulse" }, "实时"),
        el(
          "div",
          { class: "filter-chips" },
          skillFilterChip("all", "全部", counts.all),
          skillFilterChip("running", "运行", counts.running),
          skillFilterChip("done", "完成", counts.done),
          skillFilterChip("error", "错误", counts.error),
          skillFilterChip("idle", "空闲", counts.idle),
        ),
        el("span", { class: "meta" }, `${filtered.length} / ${skills.length}`),
      ),
    );
    const body = el("div", { class: "pane-body" });
    if (!filtered.length) {
      body.appendChild(
        el(
          "div",
          { class: "muted tiny", style: "padding:16px" },
          "无匹配 skill",
        ),
      );
    } else {
      for (const sk of filtered) body.appendChild(renderSkillRow(sk));
    }
    pane.appendChild(body);
    return pane;
  }
  function skillFilterChip(name, label, count) {
    const isAct = state.skillFilter === name;
    return el(
      "span",
      {
        class: `filter-chip ${isAct ? "active" : ""}`,
        onclick: (e) => {
          e.stopPropagation();
          state.skillFilter = name;
          render();
        },
      },
      `${label} ${count}`,
    );
  }
  function renderSkillRow(s) {
    const stateIcons = { running: "●", done: "✓", error: "✗", idle: "○" };
    const lastWhen = s.last_run_ts
      ? timePart(s.last_run_ts) || s.last_run_ts.slice(0, 10)
      : "—";
    const isInTask = s.calls_in_task > 0;
    return el(
      "div",
      {
        class: `skill-row s-${s.state} ${isInTask ? "is-active-task" : ""}`,
        title: s.last_run_summary || s.name,
      },
      el("span", { class: "icon" }, stateIcons[s.state] || "○"),
      el("span", { class: "name" }, s.name),
      el(
        "span",
        { class: "calls" },
        isInTask
          ? `×${s.calls_in_task}`
          : s.logs_count
            ? `${s.logs_count} runs`
            : "—",
      ),
      el("span", { class: "last" }, lastWhen),
    );
  }

  /* ---------- current run panel ---------- */
  function renderCurrentRunPanel() {
    const live = state.live || {};
    const task = live.current_task;
    const m = live.metrics || {};
    const pane = el("section", { class: "current-run-pane" });
    pane.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "当前运行"),
        el(
          "span",
          { class: `mode-badge mode-${m.mode || "unknown"}` },
          m.mode || "—",
        ),
      ),
    );
    const body = el("div", { class: "pane-body" });
    if (!task || task.status === "done") {
      body.appendChild(
        el(
          "div",
          { class: "current-run-empty" },
          task ? `空闲 · 最近 task ${task.id}` : "无活跃运行",
        ),
      );
    } else {
      const skills = task.skills_used || [];
      const list = el("div", { class: "current-run-list" });
      list.appendChild(
        el(
          "div",
          { class: "cr-row s-running" },
          el("span", { class: "dot" }),
          el("span", { class: "name" }, task.label || "<unlabeled>"),
          el(
            "span",
            { class: "when" },
            `${task.tool_calls || 0} calls · ${tsAgo(task.started_at)}`,
          ),
        ),
      );
      if (skills.length === 0) {
        list.appendChild(
          el(
            "div",
            { class: "muted tiny", style: "padding:8px" },
            "本 task 暂未识别 skill 调用",
          ),
        );
      } else {
        for (const sk of skills) {
          list.appendChild(
            el(
              "div",
              { class: "cr-row s-running" },
              el("span", { class: "dot" }),
              el("span", { class: "name" }, "└ " + sk),
              el("span", { class: "when" }, ""),
            ),
          );
        }
      }
      pane.appendChild(body);
      body.appendChild(list);
      return pane;
    }
    pane.appendChild(body);
    return pane;
  }

  /* ---------- timeline panel ---------- */
  function renderTimelinePanel(showStream) {
    const live = state.live || {};
    const task = live.current_task;
    const events = task ? task.events || [] : [];
    const pane = el("section", { class: "timeline-pane" });
    pane.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "时间线 · 工具调用"),
        el("span", { class: "live-pulse" }, "实时"),
        el("span", { class: "meta" }, `${events.length} 条 · 倒序`),
      ),
    );
    const body = el("div", { class: "pane-body" });
    if (!events.length) {
      body.appendChild(
        el("div", { class: "muted tiny", style: "padding:16px" }, "暂无事件"),
      );
    } else {
      const list = el("div", { class: "timeline-list" });
      for (const ev of events.slice().reverse())
        list.appendChild(renderTlRow(ev));
      body.appendChild(list);
    }
    pane.appendChild(body);
    return pane;
  }
  function renderTlRow(ev) {
    const tool = ev.tool_name || ev.hook_event;
    const skill = ev.skill || "";
    const desc = describeEvent(ev);
    const isErr = !!ev.is_error;
    const stateClass = isErr
      ? "s-error"
      : ev.hook_event === "UserPromptSubmit"
        ? "s-running"
        : "s-done";
    const icon =
      ev.hook_event === "UserPromptSubmit"
        ? "▸"
        : ev.hook_event === "Stop"
          ? "■"
          : isErr
            ? "✗"
            : "·";
    return el(
      "div",
      {
        class: `tl-row ${stateClass} ${isErr ? "is-error" : ""}`,
        title: desc,
      },
      el("span", { class: "ic" }, icon),
      el("span", { class: "ts" }, timePart(ev.ts)),
      el("span", { class: "skill", title: tool }, shortTool(tool)),
      el("span", { class: "desc" }, desc),
      el("span", { class: "meta" }, skill || ""),
    );
  }
  function describeEvent(ev) {
    const ti = ev.tool_input || {};
    if (ev.hook_event === "UserPromptSubmit")
      return "PROMPT: " + (ev.prompt_preview || "");
    if (ev.hook_event === "Stop") return "STOP";
    if (ev.tool_name === "Bash" || ev.tool_name === "PowerShell")
      return ti.command || ti.description || "";
    if (ev.tool_name === "Read") return ti.file_path || ti.path || "";
    if (ev.tool_name === "Edit" || ev.tool_name === "Write")
      return ti.file_path || "";
    if (ev.tool_name === "Glob") return ti.pattern || "";
    if (ev.tool_name === "Grep")
      return (ti.pattern || "") + (ti.path ? ` @ ${ti.path}` : "");
    if (ev.tool_name === "Agent" || ev.tool_name === "Task")
      return (
        (ti.subagent_type ? `[${ti.subagent_type}] ` : "") +
        truncate(ti.description || ti.prompt || "", 80)
      );
    if (ev.tool_name === "ToolSearch") return ti.query || "";
    return JSON.stringify(ti).slice(0, 80);
  }

  /* ---------- skills FULL subtab ---------- */
  function renderSkillsFull() {
    const wrap = el("div", {
      style: "overflow:hidden;display:grid;grid-template-rows:1fr;height:100%",
    });
    wrap.appendChild(renderSkillsPanel(true));
    return wrap;
  }
  /* ---------- timeline FULL subtab ---------- */
  function renderTimelineFull() {
    const wrap = el("div", {
      style: "overflow:hidden;display:grid;grid-template-rows:1fr;height:100%",
    });
    wrap.appendChild(renderTimelinePanel(true));
    return wrap;
  }
  /* ---------- intel embedded subtab (镜像右栏) ---------- */
  function renderIntelEmbedded() {
    const wrap = el("div", {
      style: "overflow:auto;padding:16px;background:var(--bg-pane)",
    });
    const intel = state.intel || {};
    wrap.appendChild(
      el(
        "h3",
        {
          style:
            "color:var(--text-1);font-size:14px;margin:0 0 12px;font-family:var(--ff-mono)",
        },
        "情报中心 · 嵌入版",
      ),
    );
    for (const f of (intel.findings || []).slice(0, 12)) {
      wrap.appendChild(renderFindingCard(f));
    }
    return wrap;
  }

  /* ---------- right intel sidebar ---------- */
  function renderRightIntel() {
    const intel = state.intel || {};
    const aside = el("aside", { class: "right-intel" });
    const tabs = el("div", { class: "intel-tabs" });
    const counts = {
      findings: (intel.findings || []).length,
      progress: (intel.progress || []).length,
    };
    tabs.appendChild(intelTab("findings", "发现", counts.findings));
    tabs.appendChild(intelTab("progress", "进度", counts.progress));
    aside.appendChild(tabs);
    const body = el("div", { class: "intel-body" });
    if (state.intelTab === "findings") {
      const list = (intel.findings || []).slice(0, 30);
      if (!list.length)
        body.appendChild(el("div", { class: "muted tiny" }, "暂无 findings"));
      for (const f of list) body.appendChild(renderFindingCard(f));
    } else if (state.intelTab === "progress") {
      const list = (intel.progress || []).slice(0, 30);
      if (!list.length)
        body.appendChild(el("div", { class: "muted tiny" }, "暂无 progress"));
      for (const p of list) body.appendChild(renderProgressEntry(p));
    }
    aside.appendChild(body);
    return aside;
  }
  function intelTab(name, label, count) {
    const isAct = state.intelTab === name;
    return el(
      "div",
      {
        class: `intel-tab ${isAct ? "active" : ""}`,
        onclick: () => {
          state.intelTab = name;
          render();
        },
      },
      el("span", {}, label),
      count != null ? el("span", { class: "count" }, String(count)) : null,
    );
  }
  function renderFindingCard(f) {
    return el(
      "div",
      { class: `intel-card section-${f.section}` },
      el(
        "div",
        { class: "id-row" },
        el("span", { class: "id" }, f.id),
        el("span", { class: "badge" }, f.section),
      ),
      el("div", { class: "title" }, f.title),
      el("div", { class: "body" }, truncate(f.body, 240)),
    );
  }
  function renderProgressEntry(p) {
    return el(
      "div",
      { class: "progress-entry" },
      el("div", { class: "when" }, p.ts || ""),
      el("div", { class: "title" }, truncate(p.title, 120)),
      el("div", { class: "body" }, truncate(p.body, 200)),
    );
  }

  /* ===========================================================
     HISTORY VIEW = sessions / tasks / task summary 三栏
     =========================================================== */
  async function renderHistory(view) {
    view.innerHTML = "";
    state.sessionsList = (await api("/api/sessions")) || [];
    if (!state.selectedSessionId && state.sessionsList[0]) {
      state.selectedSessionId = state.sessionsList[0].id;
    }
    if (state.selectedSessionId) {
      state.sessionDetail = await api(
        "/api/sessions/" + encodeURIComponent(state.selectedSessionId),
      );
      if (!state.selectedTaskId && state.sessionDetail?.tasks?.[0]) {
        state.selectedTaskId = state.sessionDetail.tasks[0].id;
      }
    }
    // 拉当前选中 task 的完整 detail（含 events，用于右栏事件预览填充黑空白）
    if (state.selectedTaskId) {
      state.selectedTaskDetail = await api(
        "/api/tasks/" + encodeURIComponent(state.selectedTaskId),
      );
    } else {
      state.selectedTaskDetail = null;
    }
    state.intel = (await api("/api/intel")) || {};
    state.live = (await api("/api/live")) || {};
    updateTopbar();

    // 始终渲染 [left nav, work, intel sidebar] 三栏
    view.appendChild(renderLeftNav());

    const grid = el(
      "section",
      { class: "history-grid" },
      renderHistoryPaneSessions(),
      renderHistoryPaneTasks(),
    );
    view.appendChild(grid);

    // intel 侧用 task summary
    view.appendChild(renderHistoryIntelSidebar());
  }
  function renderHistoryIntelSidebar() {
    const aside = el("aside", { class: "right-intel" });
    aside.appendChild(
      el(
        "div",
        { class: "intel-tabs" },
        el("div", { class: "intel-tab active" }, el("span", {}, "任务摘要")),
      ),
    );
    const body = el("div", { class: "intel-body" });
    const sd = state.sessionDetail;
    const tid = state.selectedTaskId;
    const t = sd?.tasks?.find((x) => x.id === tid);
    if (!t) {
      body.appendChild(
        el(
          "div",
          { class: "muted tiny", style: "padding:16px" },
          "选择中间任务查看摘要",
        ),
      );
    } else {
      body.appendChild(renderTaskSummaryContent(t));
    }
    aside.appendChild(body);
    return aside;
  }
  function renderTaskSummaryContent(t) {
    return el(
      "div",
      { class: "body" },
      el(
        "h3",
        {
          style:
            "color:var(--text-1);font-size:13px;margin:0 0 12px;font-family:var(--ff-mono);word-break:break-all",
        },
        t.label || "<unlabeled>",
      ),
      el(
        "dl",
        { class: "kv-pairs" },
        el("dt", {}, "task_id"),
        el("dd", {}, t.id),
        el("dt", {}, "mode"),
        el(
          "dd",
          {},
          el(
            "span",
            { class: `mode-badge mode-${t.mode || "unknown"}` },
            t.mode || "?",
          ),
        ),
        el("dt", {}, "status"),
        el("dd", {}, t.status),
        el("dt", {}, "started"),
        el("dd", {}, t.started_at),
        el("dt", {}, "ended"),
        el("dd", {}, t.ended_at || "—"),
        el("dt", {}, "duration"),
        el("dd", {}, t.duration_ms ? fmtMs(t.duration_ms) : "—"),
        el("dt", {}, "tool_calls"),
        el("dd", {}, String(t.tool_calls || 0)),
        el("dt", {}, "errors"),
        el("dd", {}, String(t.errors || 0)),
        el("dt", {}, "events"),
        el("dd", {}, String(t.events_count || 0)),
      ),
      el(
        "div",
        { style: "margin-top:12px" },
        el(
          "div",
          {
            style:
              "color:var(--text-3);font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px",
          },
          "Skills used",
        ),
        el(
          "div",
          { class: "skills-chips" },
          (t.skills_used || []).map((s) =>
            el("span", { class: "skill-chip" }, s),
          ),
          (t.skills_used || []).length
            ? null
            : el("span", { class: "muted tiny" }, "—"),
        ),
      ),
      el(
        "a",
        {
          class: "open-detail",
          href: "/task/" + encodeURIComponent(t.id),
          "data-route": "",
        },
        "→ 打开任务详情",
      ),
      // 事件预览：填满 intel sidebar 下半，避免大块黑空白
      renderTaskSummaryEvents(t.id),
    );
  }
  function renderTaskSummaryEvents(taskId) {
    const detail = state.selectedTaskDetail;
    const wrap = el("div", {
      style:
        "margin-top:20px;padding-top:16px;border-top:1px solid var(--border-soft)",
    });
    wrap.appendChild(
      el(
        "div",
        {
          style:
            "color:var(--text-3);font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center",
        },
        el("span", {}, "最近事件"),
        detail
          ? el(
              "span",
              { style: "color:var(--text-3)" },
              `${Math.min(40, (detail.events || []).length)} / ${detail.events_count}`,
            )
          : null,
      ),
    );
    if (!detail || detail.id !== taskId) {
      wrap.appendChild(el("div", { class: "muted tiny" }, "加载中…"));
      return wrap;
    }
    const events = (detail.events || []).slice(-40).reverse();
    if (!events.length) {
      wrap.appendChild(el("div", { class: "muted tiny" }, "无事件"));
      return wrap;
    }
    const list = el("div", { class: "timeline-list", style: "font-size:10px" });
    for (const ev of events) list.appendChild(renderTlRowCompact(ev));
    wrap.appendChild(list);
    return wrap;
  }
  function renderTlRowCompact(ev) {
    const tool = ev.tool_name || ev.hook_event;
    const desc = describeEvent(ev);
    const isErr = !!ev.is_error;
    return el(
      "div",
      {
        class: `tl-row ${isErr ? "is-error" : "s-done"}`,
        style:
          "grid-template-columns:12px 56px 1fr;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-soft);font-size:10px",
        title: `${ev.ts} · ${tool} · ${desc}`,
      },
      el("span", { class: "ic" }, isErr ? "✗" : "·"),
      el("span", { class: "ts" }, timePart(ev.ts)),
      el("span", { class: "desc" }, truncate(`${shortTool(tool)} ${desc}`, 40)),
    );
  }
  async function refreshHistoryLight() {
    if (state.route?.name !== "history") return;
    const list = await api("/api/sessions");
    state.sessionsList = list || [];
    const view = $("#view");
    const oldGrid = view.querySelector(".history-grid");
    if (oldGrid) renderHistory(view);
  }
  function renderHistoryPaneSessions() {
    const pane = el("div", { class: "history-pane" });
    pane.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "会话列表"),
        el("span", { class: "meta" }, `${state.sessionsList.length} sessions`),
      ),
    );
    const body = el("div", { class: "pane-body" });
    if (!state.sessionsList.length) {
      body.appendChild(
        el(
          "div",
          { class: "muted tiny", style: "padding:16px" },
          "暂无 session",
        ),
      );
    } else {
      for (const s of state.sessionsList) {
        body.appendChild(
          el(
            "div",
            {
              class: `session-row s-${s.status} ${s.id === state.selectedSessionId ? "active" : ""}`,
              onclick: async () => {
                state.selectedSessionId = s.id;
                state.selectedTaskId = null;
                state.selectedTaskDetail = null;
                state.sessionDetail = await api(
                  "/api/sessions/" + encodeURIComponent(s.id),
                );
                if (state.sessionDetail?.tasks?.[0]) {
                  state.selectedTaskId = state.sessionDetail.tasks[0].id;
                  state.selectedTaskDetail = await api(
                    "/api/tasks/" + encodeURIComponent(state.selectedTaskId),
                  );
                }
                render();
              },
            },
            el(
              "div",
              { class: "top" },
              el("span", { class: "dot" }),
              el("span", { class: "sid" }, truncate(s.id, 18)),
              el("span", { class: "ago" }, tsAgo(s.last_event_at)),
            ),
            el(
              "div",
              { class: "meta" },
              el(
                "span",
                { class: "meta-tag" },
                "tasks ",
                el("span", { class: "v" }, String(s.task_count)),
              ),
              el(
                "span",
                { class: "meta-tag" },
                "dur ",
                el("span", { class: "v" }, fmtMs(s.duration_ms)),
              ),
              s.helix_runs_in_session
                ? el(
                    "span",
                    { class: "meta-tag" },
                    "helix ",
                    el("span", { class: "v" }, String(s.helix_runs_in_session)),
                  )
                : null,
              s.team_tasks
                ? el(
                    "span",
                    { class: "meta-tag" },
                    "team ",
                    el("span", { class: "v" }, String(s.team_tasks)),
                  )
                : null,
            ),
          ),
        );
      }
    }
    pane.appendChild(body);
    return pane;
  }
  function renderHistoryPaneTasks() {
    const pane = el("div", { class: "history-pane" });
    const sd = state.sessionDetail;
    pane.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "任务列表"),
        el(
          "span",
          { class: "meta" },
          sd
            ? `session ${truncate(sd.id, 8)} · ${sd.task_count} tasks`
            : "未选 session",
        ),
      ),
    );
    const body = el("div", { class: "pane-body" });
    if (!sd) {
      body.appendChild(
        el(
          "div",
          { class: "muted tiny", style: "padding:16px" },
          "选择左侧 session 查看 task 列表",
        ),
      );
      pane.appendChild(body);
      return pane;
    }
    const grouped = { team: [], independent: [], unknown: [] };
    (sd.tasks || []).forEach((t, i) => {
      grouped[t.mode || "unknown"]?.push({ ...t, _idx: i + 1 });
    });
    const order = ["team", "independent", "unknown"];
    for (const mode of order) {
      const list = grouped[mode] || [];
      if (!list.length) continue;
      body.appendChild(
        el(
          "div",
          {
            style:
              "padding:8px 16px;font-family:var(--ff-mono);font-size:11px;color:var(--text-3);border-bottom:1px solid var(--border-soft)",
          },
          `MODE = ${mode.toUpperCase()} · ${list.length}`,
        ),
      );
      for (const t of list) {
        body.appendChild(
          el(
            "div",
            {
              class: "task-row-hist",
              onclick: async () => {
                state.selectedTaskId = t.id;
                state.selectedTaskDetail = await api(
                  "/api/tasks/" + encodeURIComponent(t.id),
                );
                render();
              },
            },
            el("div", { class: "idx" }, "#" + t._idx),
            el(
              "div",
              {},
              el(
                "div",
                { class: "label" },
                truncate(t.label || "<unlabeled>", 48),
              ),
              el(
                "div",
                { class: "label-meta" },
                `${t.tool_calls || 0} calls · ${(t.skills_used || []).length} skills · ${t.events_count} events`,
              ),
            ),
            el(
              "div",
              { class: "right-meta" },
              el(
                "span",
                { class: `mode-badge mode-${t.mode || "unknown"}` },
                t.mode || "?",
              ),
              el(
                "span",
                { class: "calls" },
                t.duration_ms
                  ? fmtMs(t.duration_ms)
                  : t.status === "running"
                    ? "running"
                    : "—",
              ),
            ),
          ),
        );
      }
    }
    if (!sd.tasks?.length) {
      body.appendChild(
        el(
          "div",
          { class: "muted tiny", style: "padding:16px" },
          "本 session 无 task",
        ),
      );
    }
    pane.appendChild(body);
    return pane;
  }
  function renderHistoryPaneSummary() {
    const pane = el("div", { class: "history-pane task-summary-pane" });
    pane.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "任务摘要"),
      ),
    );
    const sd = state.sessionDetail;
    const tid = state.selectedTaskId;
    const t = sd?.tasks?.find((x) => x.id === tid);
    if (!t) {
      pane.appendChild(el("div", { class: "empty" }, "选择中间任务查看摘要"));
      return pane;
    }
    pane.appendChild(
      el(
        "div",
        { class: "body" },
        el("h3", {}, t.label || "<unlabeled>"),
        el(
          "dl",
          { class: "kv-pairs" },
          el("dt", {}, "task_id"),
          el("dd", {}, t.id),
          el("dt", {}, "mode"),
          el(
            "dd",
            {},
            el(
              "span",
              { class: `mode-badge mode-${t.mode || "unknown"}` },
              t.mode || "?",
            ),
          ),
          el("dt", {}, "status"),
          el("dd", {}, t.status),
          el("dt", {}, "started"),
          el("dd", {}, t.started_at),
          el("dt", {}, "ended"),
          el("dd", {}, t.ended_at || "—"),
          el("dt", {}, "duration"),
          el("dd", {}, t.duration_ms ? fmtMs(t.duration_ms) : "—"),
          el("dt", {}, "tool_calls"),
          el("dd", {}, String(t.tool_calls || 0)),
          el("dt", {}, "errors"),
          el("dd", {}, String(t.errors || 0)),
          el("dt", {}, "events"),
          el("dd", {}, String(t.events_count || 0)),
        ),
        el(
          "div",
          { style: "margin-top:16px" },
          el(
            "div",
            {
              style:
                "color:var(--text-3);font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px",
            },
            "Skills used",
          ),
          el(
            "div",
            { class: "skills-chips" },
            (t.skills_used || []).map((s) =>
              el("span", { class: "skill-chip" }, s),
            ),
            (t.skills_used || []).length
              ? null
              : el("span", { class: "muted tiny" }, "—"),
          ),
        ),
        el(
          "a",
          {
            class: "open-detail",
            href: "/task/" + encodeURIComponent(t.id),
            "data-route": "",
          },
          "→ 打开任务详情",
        ),
      ),
    );
    return pane;
  }

  /* ===========================================================
     EVOLUTION VIEW
     =========================================================== */
  async function renderEvolution(view) {
    view.innerHTML = "";
    state.evolution = await api("/api/evolution");
    state.intel = (await api("/api/intel")) || {};
    state.live = (await api("/api/live")) || {};
    updateTopbar();
    const ev = state.evolution || {};

    // 始终 [left nav, work, intel sidebar]
    view.appendChild(renderLeftNav());

    const grid = el("section", { class: "evolution-grid" });
    const main = el("div", { class: "evo-main" });
    main.appendChild(renderEvoTopBar(ev));
    main.appendChild(renderEvoContent(ev));
    grid.appendChild(main);
    view.appendChild(grid);

    view.appendChild(renderEvoSide(ev));
  }
  function renderEvoTopBar(ev) {
    const helix = ev.helix_latest;
    const bar = el("div", { class: "evo-top-bar" });
    bar.appendChild(
      el(
        "span",
        { style: "color:var(--text-1);font-weight:600;font-size:14px" },
        "项目自我升级 · 进度树",
      ),
    );
    if (helix) {
      const cls =
        helix.status === "done" || helix.promise === "COMPLETE"
          ? "done"
          : helix.status === "error"
            ? "error"
            : "";
      bar.appendChild(
        el(
          "span",
          { class: `evo-helix-badge ${cls}` },
          el("span", {}, helix.id || "?"),
          el("span", { style: "color:var(--text-3)" }, " · "),
          el("span", {}, helix.status || "?"),
          el(
            "span",
            { style: "color:var(--text-3)" },
            ` · ${helix.phases?.length || 0}/${helix.phases_planned?.length || 0} phases`,
          ),
        ),
      );
    }
    return bar;
  }
  function renderEvoContent(ev) {
    const wrap = el("div", { class: "evo-content" });

    // top: task plan
    const top = el("div", { class: "evo-pane" });
    top.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "TASK PLAN（task_plan.md）"),
        el(
          "span",
          { class: "meta" },
          ev.task_plan?.totalLines ? `${ev.task_plan.totalLines} 行` : "",
        ),
      ),
    );
    top.appendChild(
      el(
        "pre",
        { class: "taskplan-pre" },
        truncate(ev.task_plan?.content || "task_plan.md 不存在", 5000),
      ),
    );
    wrap.appendChild(top);

    // bottom: progress + git timeline
    const bot = el("div", { class: "evo-pane" });
    bot.appendChild(
      el(
        "div",
        { class: "pane-head" },
        el("span", { class: "title" }, "进展时间线 · progress + git log"),
        el(
          "span",
          { class: "meta" },
          `${(ev.progress || []).length + (ev.git_log || []).length} 条`,
        ),
      ),
    );
    const list = el("div", { class: "tl-mix" });
    const entries = [];
    for (const p of ev.progress || [])
      entries.push({ when: p.ts || "", src: "progress", body: p.title });
    for (const g of ev.git_log || [])
      entries.push({
        when: g.date || "",
        src: "git",
        body: `${g.hash} ${g.subject}`,
      });
    entries.sort((a, b) => (b.when || "").localeCompare(a.when || ""));
    for (const e of entries.slice(0, 100)) {
      list.appendChild(
        el(
          "div",
          { class: "tl-mix-row" },
          el("span", { class: "when" }, truncate(e.when, 19)),
          el("span", { class: `src ${e.src}` }, e.src),
          el("span", { class: "body" }, truncate(e.body, 200)),
        ),
      );
    }
    bot.appendChild(list);
    wrap.appendChild(bot);
    return wrap;
  }
  function renderEvoSide(ev) {
    const aside = el("div", { class: "right-intel" });
    aside.appendChild(
      el(
        "div",
        { class: "intel-tabs" },
        el(
          "div",
          { class: "intel-tab active" },
          el("span", {}, "教训面板"),
          el("span", { class: "count" }, String((ev.findings || []).length)),
        ),
      ),
    );
    const body = el("div", { class: "intel-body" });
    for (const f of (ev.findings || []).slice(0, 30))
      body.appendChild(renderFindingCard(f));
    if (!(ev.findings || []).length)
      body.appendChild(el("div", { class: "muted tiny" }, "暂无 findings"));
    aside.appendChild(body);
    return aside;
  }

  /* ===========================================================
     TASK DETAIL VIEW
     =========================================================== */
  async function renderTaskDetail(view, taskId) {
    view.innerHTML = "";
    const t = await api("/api/tasks/" + encodeURIComponent(taskId));
    state.live = (await api("/api/live")) || {};
    state.intel = (await api("/api/intel")) || {};
    if (!t) {
      view.appendChild(renderLeftNav());
      view.appendChild(
        el(
          "section",
          { class: "task-detail-full" },
          el("div", { class: "muted" }, "task not found"),
          el(
            "a",
            { class: "tdf-back", href: "/history", "data-route": "" },
            "← 返回历史",
          ),
        ),
      );
      view.appendChild(renderRightIntel());
      return;
    }
    state.taskCache.set(taskId, t);
    updateTopbar();

    // 始终 [left nav, work, intel sidebar]
    view.appendChild(renderLeftNav());

    const wrap = el("section", { class: "task-detail-full" });
    wrap.appendChild(
      el(
        "a",
        { class: "tdf-back", href: "/history", "data-route": "" },
        "← 返回历史",
      ),
    );
    wrap.appendChild(
      el(
        "div",
        { class: "tdf-header" },
        el("span", { class: "label" }, t.label || "<unlabeled>"),
        el(
          "span",
          { class: `mode-badge mode-${t.mode || "unknown"}` },
          t.mode || "?",
        ),
        el(
          "span",
          { class: "meta" },
          `${t.tool_calls || 0} calls · ${(t.skills_used || []).length} skills · ${t.events_count} events · ${t.duration_ms ? fmtMs(t.duration_ms) : t.status}`,
        ),
      ),
    );
    const tabs = ["overview", "events", "skills", "sub_agents"];
    const bar = el("div", { class: "tdf-tabs" });
    for (const tab of tabs) {
      const isAct = state.activeTdfTab === tab;
      bar.appendChild(
        el(
          "div",
          {
            class: `tdf-tab ${isAct ? "active" : ""}`,
            onclick: () => {
              state.activeTdfTab = tab;
              renderTaskDetail(view, taskId);
            },
          },
          tab.replace("_", " "),
        ),
      );
    }
    wrap.appendChild(bar);

    if (state.activeTdfTab === "overview")
      wrap.appendChild(renderTdfOverview(t));
    else if (state.activeTdfTab === "events")
      wrap.appendChild(renderTdfEvents(t));
    else if (state.activeTdfTab === "skills")
      wrap.appendChild(renderTdfSkills(t));
    else if (state.activeTdfTab === "sub_agents")
      wrap.appendChild(renderTdfSubAgents(t));

    view.appendChild(wrap);

    // intel sidebar：当前 task 的 sub-agents 或最近 events 预览
    view.appendChild(renderTaskDetailIntel(t));
  }
  function renderTaskDetailIntel(t) {
    const aside = el("aside", { class: "right-intel" });
    aside.appendChild(
      el(
        "div",
        { class: "intel-tabs" },
        el(
          "div",
          { class: "intel-tab active" },
          "事件预览 ",
          el("span", { class: "count" }, String(t.events_count || 0)),
        ),
      ),
    );
    const body = el("div", { class: "intel-body" });
    const recent = (t.events || []).slice(-30).reverse();
    if (!recent.length) {
      body.appendChild(el("div", { class: "muted tiny" }, "无事件"));
    } else {
      const list = el("div", { class: "timeline-list" });
      for (const ev of recent) list.appendChild(renderTlRow(ev));
      body.appendChild(list);
    }
    aside.appendChild(body);
    return aside;
  }
  async function refreshTaskLight(taskId) {
    if (state.route?.name !== "task") return;
    renderTaskDetail($("#view"), taskId);
  }
  function renderTdfOverview(t) {
    return el(
      "dl",
      { class: "task-overview-grid" },
      ...[
        ["task_id", t.id],
        ["session_id", t.session_id],
        ["label", t.label],
        ["mode", t.mode],
        ["status", t.status],
        ["started_at", t.started_at],
        ["ended_at", t.ended_at || "—"],
        ["duration", t.duration_ms ? fmtMs(t.duration_ms) : "—"],
        ["tool_calls", String(t.tool_calls || 0)],
        ["errors", String(t.errors || 0)],
        ["events_count", String(t.events_count || 0)],
        ["events_overflowed", String(t.events_overflowed || 0)],
        ["skills_used", (t.skills_used || []).join(", ") || "—"],
        ["sub_agents", (t.sub_agents || []).join(", ") || "—"],
      ].flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, String(v))]),
    );
  }
  function renderTdfEvents(t) {
    const list = el("div", { class: "timeline-list" });
    for (const ev of (t.events || []).slice().reverse())
      list.appendChild(renderTlRow(ev));
    return list;
  }
  function renderTdfSkills(t) {
    const counts = new Map();
    for (const ev of t.events || [])
      if (ev.skill) counts.set(ev.skill, (counts.get(ev.skill) || 0) + 1);
    const wrap = el("div", { style: "padding:0" });
    if (!counts.size) {
      wrap.appendChild(el("div", { class: "muted tiny" }, "未识别 skill 调用"));
      return wrap;
    }
    for (const [name, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      wrap.appendChild(
        el(
          "span",
          { class: "skill-chip" },
          el("span", {}, name + " "),
          el("span", { style: "color:var(--text-3)" }, "× " + n),
        ),
      );
    }
    return wrap;
  }
  function renderTdfSubAgents(t) {
    const wrap = el("div", { style: "padding:0" });
    if (t.mode !== "team") {
      wrap.appendChild(
        el(
          "div",
          { class: "muted tiny" },
          "本 task mode = " + (t.mode || "?") + "；无 sub_agent",
        ),
      );
      return wrap;
    }
    const cols = el("div", { class: "team-cols" });
    for (const sa of t.sub_agents_detail || []) {
      const col = el("div", { class: "team-col" });
      col.appendChild(
        el(
          "div",
          { class: "team-col-head" },
          el("span", { class: "name" }, sa.name),
          el("span", { class: "count" }, `${sa.events_count} events`),
        ),
      );
      for (const ev of sa.events) col.appendChild(renderTlRow(ev));
      cols.appendChild(col);
    }
    wrap.appendChild(cols);
    return wrap;
  }

  /* ============ boot ============ */
  async function boot() {
    state.route = parseRoute();
    connectSSE();
    await render();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
