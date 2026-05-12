#!/usr/bin/env node
/**
 * context-curator run.cjs — 4-phase executor
 *
 * Phase 1 SCAN     → 列源 + mtime + 上次 snapshot 引用
 * Phase 2 EXTRACT  → 抽关键片段
 * Phase 3 SUMMARIZE→ 800 字硬上限 + diff
 * Phase 4 EMIT     → 写 snapshot.md + _index.jsonl + 自循环 runs.jsonl
 *
 * Usage: node run.cjs [--dry-run]
 *        node run.cjs --phase=1|2|3|4|all   (debug)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ---- Paths ----
// v0.8 #2 修：项目布局是 skills/<name>/，不是 .claude/skills/<name>/，
// 所以 PROJECT_ROOT = ../..（不是 ../../..）；SKILLS_DIR 也直接用 skills/
const SELF_DIR = __dirname;
const PROJECT_ROOT = process.env.HARNESS_PROJECT_ROOT
  ? process.env.HARNESS_PROJECT_ROOT
  : path.resolve(SELF_DIR, "..", "..");
const META_DIR = path.join(PROJECT_ROOT, "_meta");
const SKILLS_DIR = path.join(PROJECT_ROOT, "skills");
const DESIGN_DIR = path.join(PROJECT_ROOT, "design");
const SNAPSHOTS_DIR = path.join(META_DIR, "context-snapshots");
const ARCHIVE_DIR = path.join(SNAPSHOTS_DIR, "_archive");
const SELF_LOGS_DIR = path.join(SELF_DIR, "logs");
const SELF_RUNS_JSONL = path.join(SELF_LOGS_DIR, "runs.jsonl");

// project-level memory dir — v0.8 #2 修跨平台（mac 路径名）；不存在 graceful skip
const MEMORY_MD = path.join(
  os.homedir(),
  ".claude",
  "projects",
  "-Users-a1234-person-ai-study-Alex-harness",
  "memory",
  "MEMORY.md",
);

// ---- Frontmatter constants (mirror SKILL.md) ----
const SUMMARY_CHAR_LIMIT = 800;
const SNAPSHOT_RETAIN_DAYS = 14;
const PROGRESS_RECENT_N = 5;
const FINDINGS_RECENT_N = 5;
const RUNS_ANOMALY_LOOKBACK = 2;
const RUNS_STALE_HOURS = 24;

// ---- Args ----
const FLAGS = process.argv.slice(2);
const DRY_RUN = FLAGS.includes("--dry-run");
let PHASE = "all";
for (const f of FLAGS) {
  if (f.startsWith("--phase=")) PHASE = f.slice(8);
}

// ---- Time (北京时间 / no leading zeros) ----
function bjNow() {
  const d = new Date();
  const Y = d.getFullYear();
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
function bjMtime(file) {
  if (!fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  const d = new Date(st.mtime);
  const Y = d.getFullYear();
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}`;
}
function ageHours(file) {
  if (!fs.existsSync(file)) return Infinity;
  const st = fs.statSync(file);
  return (Date.now() - st.mtime.getTime()) / 1000 / 3600;
}
function makeRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function uniChars(s) {
  return [...s].length;
}

// ---- Safe writer (banned outside snapshots and self logs) ----
function safeWrite(filePath, content) {
  const abs = path.resolve(filePath);
  const allowed = [SNAPSHOTS_DIR, SELF_LOGS_DIR];
  const ok = allowed.some((dir) => abs.startsWith(path.resolve(dir)));
  if (!ok) {
    throw new Error(
      `[FATAL] context-curator 拒绝写入非 snapshot/log 目录：${abs}`,
    );
  }
  if (DRY_RUN) {
    console.log(
      `[dry-run] would write ${path.relative(PROJECT_ROOT, abs)} (${uniChars(content)} chars)`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
}
function safeAppendJsonl(filePath, obj) {
  const abs = path.resolve(filePath);
  const allowed = [SNAPSHOTS_DIR, SELF_LOGS_DIR];
  const ok = allowed.some((dir) => abs.startsWith(path.resolve(dir)));
  if (!ok) throw new Error(`[FATAL] 拒绝 jsonl append 到非允许目录：${abs}`);
  const line = JSON.stringify(obj);
  // roundtrip
  JSON.parse(line);
  if (DRY_RUN) {
    console.log(
      `[dry-run] would append jsonl ${path.relative(PROJECT_ROOT, abs)}`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, line + "\n", "utf-8");
  // re-validate full file
  const all = fs.readFileSync(abs, "utf-8").split("\n").filter(Boolean);
  all.forEach((l, i) => {
    try {
      JSON.parse(l);
    } catch (e) {
      throw new Error(
        `[FATAL] post-append jsonl corruption at ${abs} L${i + 1}: ${e.message}`,
      );
    }
  });
}

function writeLog(name, content) {
  const p = path.join(SELF_LOGS_DIR, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!DRY_RUN) fs.writeFileSync(p, content, "utf-8");
}

// =========================================================
// Phase 1 SCAN
// =========================================================
function phase1Scan() {
  const sources = {
    "task_plan.jsonl": path.join(META_DIR, "task_plan.jsonl"),
    "task_plan.md": path.join(META_DIR, "task_plan.md"),
    "progress.md": path.join(META_DIR, "progress.md"),
    "findings.md": path.join(META_DIR, "findings.md"),
    "MEMORY.md": MEMORY_MD,
    "harness-blueprint.md": path.join(DESIGN_DIR, "harness-blueprint.md"),
  };

  const seen = {};
  const missing = [];
  const mtimes = {};
  for (const [k, p] of Object.entries(sources)) {
    if (fs.existsSync(p)) {
      seen[k] = p;
      mtimes[k] = bjMtime(p);
    } else {
      missing.push(k);
    }
  }

  // skills SKILL.md
  const skillDirs = fs.existsSync(SKILLS_DIR)
    ? fs.readdirSync(SKILLS_DIR).filter((d) => {
        const s = path.join(SKILLS_DIR, d, "SKILL.md");
        return fs.existsSync(s);
      })
    : [];
  const skills = {};
  for (const d of skillDirs) {
    skills[d] = path.join(SKILLS_DIR, d, "SKILL.md");
    mtimes[`skill:${d}`] = bjMtime(skills[d]);
  }

  // last snapshot
  const latestPath = path.join(SNAPSHOTS_DIR, "_latest.txt");
  let prevSnapshot = null;
  if (fs.existsSync(latestPath)) {
    const p = fs.readFileSync(latestPath, "utf-8").trim();
    if (p && fs.existsSync(p)) prevSnapshot = p;
  }
  const isFirstRun = !prevSnapshot;

  const log = [
    `[Phase 1 SCAN] @ ${bjNow()}`,
    `  sources_seen: ${Object.keys(seen).length} (${Object.keys(seen).join(", ")})`,
    `  sources_missing: ${missing.length} (${missing.join(", ") || "none"})`,
    `  skills_found: ${Object.keys(skills).length} (${Object.keys(skills).join(", ")})`,
    `  prev_snapshot: ${prevSnapshot ? path.relative(PROJECT_ROOT, prevSnapshot) : "(first run)"}`,
    `  first_run: ${isFirstRun}`,
  ].join("\n");

  return {
    sources_seen: seen,
    sources_missing: missing,
    skills,
    mtimes,
    prev_snapshot: prevSnapshot,
    is_first_run: isFirstRun,
    log,
  };
}

// =========================================================
// Phase 2 EXTRACT
// =========================================================
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  return lines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      throw new Error(`JSONL parse fail at ${file} L${i + 1}: ${e.message}`);
    }
  });
}

function extractTaskPlan(p1) {
  const jsonl = p1.sources_seen["task_plan.jsonl"];
  if (!jsonl) return { error: "task_plan.jsonl missing — abort core source" };
  const tasks = readJsonl(jsonl);
  if (tasks.length === 0) return { error: "task_plan.jsonl empty" };

  // current phase = phase of the first non-completed task in array order
  let currentPhase = null;
  for (const t of tasks) {
    if (!t.passes) {
      currentPhase = t.phase;
      break;
    }
  }
  if (!currentPhase) currentPhase = tasks[tasks.length - 1].phase;

  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const ready = [];
  const blocked = [];
  for (const t of tasks) {
    if (t.passes || ["aborted", "skipped", "scheduled"].includes(t.status))
      continue;
    if (t.status === "in_progress") continue;
    const blockers = Array.isArray(t.blocked_by) ? t.blocked_by : [];
    if (blockers.length === 0) {
      ready.push(t);
      continue;
    }
    const unresolved = blockers.filter((id) => {
      const dep = byId.get(id);
      return !dep || !dep.passes;
    });
    if (unresolved.length === 0) ready.push(t);
    else blocked.push({ ...t, _unresolved: unresolved });
  }

  // task ID set for diff
  const taskIds = new Set(tasks.map((t) => t.task_id));

  return {
    current_phase: currentPhase,
    in_progress: inProgress.map((t) => ({
      task_id: t.task_id,
      subject: t.subject,
    })),
    ready: ready.map((t) => ({ task_id: t.task_id, subject: t.subject })),
    blocked_count: blocked.length,
    total: tasks.length,
    completed: tasks.filter((t) => t.passes).length,
    task_ids: [...taskIds],
  };
}

function extractProgress(p1) {
  const file = p1.sources_seen["progress.md"];
  if (!file) return { entries: [] };
  const md = fs.readFileSync(file, "utf-8");
  // find ### 会话 X / ### 会话 N（续 K） entries; top of file = newest
  const lines = md.split("\n");
  const entries = [];
  let cur = null;
  for (const line of lines) {
    if (/^###\s+/.test(line)) {
      if (cur) entries.push(cur);
      cur = { title: line.replace(/^###\s+/, "").trim(), bullets: [] };
    } else if (cur && /^[-*]\s+/.test(line)) {
      cur.bullets.push(line.replace(/^[-*]\s+/, "").trim());
    }
  }
  if (cur) entries.push(cur);
  return {
    entries: entries.slice(0, PROGRESS_RECENT_N),
  };
}

function extractFindings(p1) {
  const file = p1.sources_seen["findings.md"];
  if (!file) return { findings: [] };
  const md = fs.readFileSync(file, "utf-8");
  const re = /^### (F-\d+):\s*(.+)$/gm;
  const all = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    all.push({ id: m[1], title: m[2].trim() });
  }
  // Reverse-sorted by numeric id (latest = highest)
  all.sort((a, b) => parseInt(b.id.slice(2), 10) - parseInt(a.id.slice(2), 10));
  return {
    findings: all.slice(0, FINDINGS_RECENT_N),
    total: all.length,
    finding_ids: all.map((f) => f.id),
  };
}

function extractMemory(p1) {
  const file = p1.sources_seen["MEMORY.md"];
  if (!file) return { items: [] };
  const md = fs.readFileSync(file, "utf-8");
  const re = /^- \[(.+?)\]\((.+?)\)\s*[—–-]\s*(.+)$/gm;
  const items = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    items.push({ title: m[1], file: m[2], hook: m[3] });
  }
  return { items };
}

function extractBlueprintTOC(p1) {
  const file = p1.sources_seen["harness-blueprint.md"];
  if (!file) return { headings: [] };
  const md = fs.readFileSync(file, "utf-8");
  const headings = md
    .split("\n")
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, "").trim());
  return { headings };
}

function extractSkills(p1) {
  const out = [];
  for (const [name, p] of Object.entries(p1.skills)) {
    const md = fs.readFileSync(p, "utf-8");
    const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let version = "?",
      can_run = "?",
      desc = "";
    if (fm) {
      const yaml = fm[1];
      const v = yaml.match(/^version:\s*(.+)$/m);
      if (v) version = v[1].trim().replace(/^["']|["']$/g, "");
      const cr = yaml.match(/can_run:\s*(true|false)/);
      if (cr) can_run = cr[1];
      const d = yaml.match(/^description:\s*"([\s\S]*?)"\s*$/m);
      if (d) desc = d[1].slice(0, 60).replace(/\n/g, " ");
    }
    out.push({ name, version, can_run, desc });
  }
  return out;
}

function extractRunsAnomalies(p1) {
  const anomalies = [];
  for (const [skillName] of Object.entries(p1.skills)) {
    const runsFile = path.join(SKILLS_DIR, skillName, "logs", "runs.jsonl");
    if (!fs.existsSync(runsFile)) continue;
    const runs = readJsonl(runsFile);
    const recent = runs.slice(-RUNS_ANOMALY_LOOKBACK);
    for (const r of recent) {
      const rating = r.user_feedback?.rating;
      const errs = Array.isArray(r.errors) ? r.errors.length : 0;
      const ts = r.timestamp || r.completed_at || null;
      let staleHours = 0;
      if (ts) {
        // attempt loose parse "YYYY-M-D HH:MM:SS"
        const m = ts.match(/^(\d+)-(\d+)-(\d+)\s+(\d+):(\d+)(?::(\d+))?/);
        if (m) {
          const dt = new Date(
            +m[1],
            +m[2] - 1,
            +m[3],
            +m[4],
            +m[5],
            +(m[6] || 0),
          );
          staleHours = (Date.now() - dt.getTime()) / 3600000;
        }
      }
      const isAnomaly =
        (rating != null && rating <= 2) ||
        errs > 0 ||
        (rating == null && staleHours > RUNS_STALE_HOURS);
      if (isAnomaly) {
        anomalies.push({
          skill: skillName,
          run_id: r.run_id || null,
          timestamp: ts,
          rating,
          errors_count: errs,
          stale_hours: Math.round(staleHours),
          reason:
            rating != null && rating <= 2
              ? `low_rating(${rating})`
              : errs > 0
                ? `errors(${errs})`
                : `unrated_stale(${Math.round(staleHours)}h)`,
        });
      }
    }
  }
  return anomalies;
}

function extractPrevSnapshotIds(p1) {
  if (!p1.prev_snapshot) return null;
  const md = fs.readFileSync(p1.prev_snapshot, "utf-8");
  // Read from frontmatter if available (fix for diff false-positive on truncated snapshots)
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const tryParse = (key) => {
      const m = fm.match(new RegExp(`^${key}:\\s*(\\[.*\\])`, "m"));
      try {
        return m ? JSON.parse(m[1]) : null;
      } catch {
        return null;
      }
    };
    const taskIds = tryParse("task_ids");
    const findingIds = tryParse("finding_ids");
    const proposalIds = tryParse("proposal_ids");
    if (taskIds && findingIds && proposalIds) {
      return { taskIds, findingIds, proposalIds };
    }
  }
  // fallback for old snapshots without ID arrays in frontmatter
  const taskIds = [...new Set(md.match(/\b\d+\.\d+(?:\.\d+)?\b/g) || [])];
  const findingIds = [...new Set(md.match(/F-\d+/g) || [])];
  const proposalIds = [...new Set(md.match(/P-\d+-\d+-\d+-\d+/g) || [])];
  return { taskIds, findingIds, proposalIds };
}

function phase2Extract(p1) {
  const out = {
    task_plan: extractTaskPlan(p1),
    progress: extractProgress(p1),
    findings: extractFindings(p1),
    memory: extractMemory(p1),
    blueprint_toc: extractBlueprintTOC(p1),
    skills: extractSkills(p1),
    anomalies: extractRunsAnomalies(p1),
    prev_ids: extractPrevSnapshotIds(p1),
  };

  const log = [
    `[Phase 2 EXTRACT] @ ${bjNow()}`,
    `  task_plan: phase=${out.task_plan.current_phase || "?"} in_progress=${out.task_plan.in_progress?.length || 0} ready=${out.task_plan.ready?.length || 0} blocked=${out.task_plan.blocked_count || 0} (${out.task_plan.completed}/${out.task_plan.total} done)`,
    `  progress entries: ${out.progress.entries.length}`,
    `  findings: ${out.findings.findings.length} of ${out.findings.total}`,
    `  memory items: ${out.memory.items.length}`,
    `  blueprint h2: ${out.blueprint_toc.headings.length}`,
    `  skills: ${out.skills.length}`,
    `  anomalies: ${out.anomalies.length}`,
    `  prev_ids: ${out.prev_ids ? `tasks=${out.prev_ids.taskIds.length} findings=${out.prev_ids.findingIds.length} proposals=${out.prev_ids.proposalIds.length}` : "(first run)"}`,
  ].join("\n");
  out.log = log;
  return out;
}

// =========================================================
// Phase 3 SUMMARIZE
// =========================================================
function buildSection(title, body) {
  return `## ${title}\n\n${body.trim()}\n`;
}

function diffIds(prev, curr) {
  if (!prev) return null;
  const newTasks = curr.taskIds.filter((id) => !prev.taskIds.includes(id));
  const newFindings = curr.findingIds.filter(
    (id) => !prev.findingIds.includes(id),
  );
  const newProposals = curr.proposalIds.filter(
    (id) => !prev.proposalIds.includes(id),
  );
  return { newTasks, newFindings, newProposals };
}

function phase3Summarize(p1, p2, runId) {
  // current IDs for diff
  const currIds = {
    taskIds: p2.task_plan.task_ids || [],
    findingIds: p2.findings.finding_ids || [],
    proposalIds: collectProposalIds(p1),
  };
  const diff = diffIds(p2.prev_ids, currIds);

  // Section builders
  const sections = {};

  // 1. 当前阶段
  {
    const tp = p2.task_plan;
    if (tp.error) sections.current = `${tp.error}`;
    else {
      const lines = [
        `**${tp.current_phase || "(no phase)"}** — ${tp.completed}/${tp.total} done`,
      ];
      if (tp.in_progress.length) {
        lines.push(
          `🔄 in_progress：${tp.in_progress.map((t) => `${t.task_id} ${t.subject}`).join(" / ")}`,
        );
      }
      if (tp.ready.length) {
        lines.push(
          `🟢 ready：${tp.ready
            .slice(0, 5)
            .map((t) => `${t.task_id} ${t.subject}`)
            .join(" / ")}`,
        );
      }
      if (tp.blocked_count) lines.push(`⏸ blocked：${tp.blocked_count}`);
      sections.current = lines.join("\n");
    }
  }

  // 2. 自上次以来变化
  if (!p2.prev_ids) {
    sections.diff = "_首次跑，无对比基准。_";
  } else if (
    diff &&
    (diff.newTasks.length ||
      diff.newFindings.length ||
      diff.newProposals.length)
  ) {
    const parts = [];
    if (diff.newTasks.length)
      parts.push(`新 task：${diff.newTasks.join(", ")}`);
    if (diff.newFindings.length)
      parts.push(`新 finding：${diff.newFindings.join(", ")}`);
    if (diff.newProposals.length)
      parts.push(`新 议案：${diff.newProposals.join(", ")}`);
    sections.diff = parts.join("\n");
  } else {
    sections.diff =
      "**无变化**（自上次 snapshot 起，task / finding / 议案 ID 集合无新增）";
  }

  // 3. 上次到哪了
  if (p2.progress.entries.length) {
    sections.progress = p2.progress.entries
      .slice(0, PROGRESS_RECENT_N)
      .map((e) => {
        const head = e.title;
        const first = e.bullets[0] ? ` — ${e.bullets[0].slice(0, 80)}` : "";
        return `- ${head}${first}`;
      })
      .join("\n");
  } else {
    sections.progress = "_(progress.md 无 ### 会话 标题)_";
  }

  // 4. 已知坑
  if (p2.findings.findings.length) {
    sections.findings = p2.findings.findings
      .map((f) => `- **${f.id}** ${f.title.slice(0, 70)}`)
      .join("\n");
  } else {
    sections.findings = "_(无 finding)_";
  }

  // 5. 用户偏好
  if (p2.memory.items.length) {
    sections.memory = p2.memory.items
      .slice(0, 8)
      .map((it) => `- ${it.title}：${it.hook.slice(0, 60)}`)
      .join("\n");
  } else {
    sections.memory = "_(memory 暂空)_";
  }

  // 6. skill 状态
  sections.skills = p2.skills
    .map((s) => `- **${s.name}** v${s.version} can_run=${s.can_run}`)
    .join("\n");

  // 7. 运行时异常
  if (p2.anomalies.length) {
    sections.anomalies = p2.anomalies
      .map((a) => `- ⚠️ ${a.skill} ${a.run_id || ""} reason=${a.reason}`)
      .join("\n");
  } else {
    sections.anomalies = "**无异常**（最近 runs.jsonl 都健康）";
  }

  // 8. 蓝图 TOC
  if (p2.blueprint_toc.headings.length) {
    sections.blueprint = p2.blueprint_toc.headings
      .slice(0, 10)
      .map((h) => `- ${h}`)
      .join("\n");
  } else {
    sections.blueprint = "_(无 h2)_";
  }

  // build full body, then trim by ladder
  const truncated = [];
  function rebuild() {
    const order = [
      ["当前阶段", sections.current],
      ["自上次以来变化", sections.diff],
      ["上次到哪了", sections.progress],
      ["已知坑", sections.findings],
      ["用户偏好", sections.memory],
      ["skill 状态", sections.skills],
      ["运行时异常", sections.anomalies],
      ["蓝图 TOC", sections.blueprint],
    ];
    return order.map(([t, b]) => buildSection(t, b)).join("\n");
  }
  let body = rebuild();
  let chars = uniChars(body);

  // Level 1: drop blueprint TOC entirely
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.blueprint = "_[truncated]_";
    truncated.push("blueprint");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 2: progress → 3 entries, titles only (no bullet)
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.progress =
      p2.progress.entries
        .slice(0, 3)
        .map((e) => `- ${e.title.slice(0, 50)}`)
        .join("\n") +
      (p2.progress.entries.length > 3
        ? `\n_[truncated, total=${p2.progress.entries.length}]_`
        : "");
    truncated.push("progress");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 3: findings → 3 with short title
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.findings =
      p2.findings.findings
        .slice(0, 3)
        .map((f) => `- **${f.id}** ${f.title.slice(0, 40)}`)
        .join("\n") +
      (p2.findings.findings.length > 3
        ? `\n_[truncated, total=${p2.findings.findings.length}]_`
        : "");
    truncated.push("findings");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 4: memory → top 5, hook 40 chars
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.memory =
      p2.memory.items
        .slice(0, 5)
        .map((it) => `- ${it.title}：${it.hook.slice(0, 40)}`)
        .join("\n") +
      (p2.memory.items.length > 5
        ? `\n_[truncated, total=${p2.memory.items.length}]_`
        : "");
    truncated.push("memory");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 5: 当前阶段 — clip subjects
  if (chars > SUMMARY_CHAR_LIMIT) {
    const tp = p2.task_plan;
    if (!tp.error) {
      const phaseShort = (tp.current_phase || "?")
        .replace(/^Phase\s+\d+\s*\/\s*/, "")
        .replace(/\s*子任务.*$/, "");
      const lines = [`**${phaseShort}** ${tp.completed}/${tp.total}`];
      if (tp.in_progress.length)
        lines.push(
          `🔄 ${tp.in_progress.map((t) => `${t.task_id} ${t.subject.slice(0, 25)}`).join(" / ")}`,
        );
      if (tp.ready.length)
        lines.push(
          `🟢 ${tp.ready
            .slice(0, 3)
            .map((t) => `${t.task_id} ${t.subject.slice(0, 25)}`)
            .join(" / ")}`,
        );
      if (tp.blocked_count) lines.push(`⏸ ${tp.blocked_count}`);
      sections.current = lines.join("\n");
    }
    truncated.push("current");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 5.5: progress → 1 entry + findings → 1 finding（保留最小可读单元）
  if (chars > SUMMARY_CHAR_LIMIT) {
    const p1 = p2.progress.entries.slice(0, 1);
    sections.progress =
      p1.map((e) => `- ${e.title.slice(0, 60)}`).join("\n") +
      (p2.progress.entries.length > 1
        ? `\n_[+${p2.progress.entries.length - 1}]_`
        : "");
    const f1 = p2.findings.findings.slice(0, 1);
    sections.findings =
      f1.map((f) => `- **${f.id}** ${f.title.slice(0, 60)}`).join("\n") +
      (p2.findings.findings.length > 1
        ? `\n_[+${p2.findings.findings.length - 1}]_`
        : "");
    truncated.push("micro_compress");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 6: progress + findings → counts only
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.progress = `_[${p2.progress.entries.length} entries; truncated]_`;
    sections.findings = `_[${p2.findings.findings.length} findings (of ${p2.findings.total}); truncated]_`;
    truncated.push("compact_mode");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 7a: memory titles-only (no hook)
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.memory =
      p2.memory.items
        .slice(0, 5)
        .map((it) => `- ${it.title}`)
        .join("\n") +
      (p2.memory.items.length > 5
        ? `\n_[+${p2.memory.items.length - 5}]_`
        : "");
    truncated.push("memory_titles_only");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 7b: skills → name+version (no desc, no can_run)
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.skills = p2.skills
      .map((s) => `- ${s.name} v${s.version}`)
      .join("\n");
    truncated.push("skills_compact");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 7c: anomalies → count only
  if (chars > SUMMARY_CHAR_LIMIT && p2.anomalies.length) {
    sections.anomalies = `⚠️ ${p2.anomalies.length} 个异常（详 logs）`;
    truncated.push("anomalies_count_only");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 7d: memory → 3 titles
  if (chars > SUMMARY_CHAR_LIMIT) {
    sections.memory =
      p2.memory.items
        .slice(0, 3)
        .map((it) => `- ${it.title}`)
        .join("\n") +
      (p2.memory.items.length > 3
        ? `\n_[+${p2.memory.items.length - 3}]_`
        : "");
    truncated.push("memory_top3");
    body = rebuild();
    chars = uniChars(body);
  }
  // Level 8: hard truncate body to SUMMARY_CHAR_LIMIT (last resort, never FATAL)
  if (chars > SUMMARY_CHAR_LIMIT) {
    const bodyArr = [...body];
    body = bodyArr.slice(0, SUMMARY_CHAR_LIMIT - 1).join("") + "…";
    chars = uniChars(body);
    truncated.push("hard_trim");
  }

  return {
    body,
    chars,
    truncated_sections: truncated,
    diff_summary: diff || { firstRun: true },
    curr_ids: currIds,
    log: [
      `[Phase 3 SUMMARIZE] @ ${bjNow()}`,
      `  final chars: ${chars}/${SUMMARY_CHAR_LIMIT}`,
      `  truncated: ${truncated.length ? truncated.join(", ") : "(none)"}`,
    ].join("\n"),
  };
}

function collectProposalIds(p1) {
  const ids = [];
  for (const [skillName] of Object.entries(p1.skills)) {
    const idx = path.join(
      SKILLS_DIR,
      skillName,
      "references",
      "skill-proposals",
      "_index.jsonl",
    );
    if (!fs.existsSync(idx)) continue;
    try {
      const arr = readJsonl(idx);
      for (const a of arr) if (a.proposal_id) ids.push(a.proposal_id);
    } catch {}
  }
  return ids;
}

// =========================================================
// Phase 4 EMIT
// =========================================================
function archiveOldSnapshots() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  const archived = [];
  const cutoffMs = Date.now() - SNAPSHOT_RETAIN_DAYS * 24 * 3600 * 1000;
  const entries = fs.readdirSync(SNAPSHOTS_DIR);
  for (const e of entries) {
    const full = path.join(SNAPSHOTS_DIR, e);
    if (!fs.statSync(full).isFile()) continue;
    if (!/\.md$/.test(e)) continue;
    if (e.startsWith("_")) continue;
    const st = fs.statSync(full);
    if (st.mtime.getTime() < cutoffMs) {
      const d = new Date(st.mtime);
      const ymDir = path.join(
        ARCHIVE_DIR,
        `${d.getFullYear()}-${d.getMonth() + 1}`,
      );
      if (!DRY_RUN) {
        fs.mkdirSync(ymDir, { recursive: true });
        fs.renameSync(full, path.join(ymDir, e));
      }
      archived.push(e);
    }
  }
  return archived;
}

function phase4Emit(p1, p2, p3, runId, durationMs) {
  const snapshotPath = path.join(SNAPSHOTS_DIR, `${runId}.md`);
  const indexPath = path.join(SNAPSHOTS_DIR, "_index.jsonl");
  const latestPath = path.join(SNAPSHOTS_DIR, "_latest.txt");

  // frontmatter
  const fm = [
    "---",
    `run_id: ${runId}`,
    `scanned_at_bj: "${bjNow()}"`,
    `char_count: ${p3.chars}`,
    `char_limit: ${SUMMARY_CHAR_LIMIT}`,
    `prev_snapshot: ${p1.prev_snapshot ? `"${path.relative(PROJECT_ROOT, p1.prev_snapshot).replace(/\\/g, "/")}"` : "null"}`,
    `sources_seen: [${Object.keys(p1.sources_seen)
      .map((s) => `"${s}"`)
      .join(", ")}]`,
    `sources_missing: [${p1.sources_missing.map((s) => `"${s}"`).join(", ")}]`,
    `truncated_sections: [${p3.truncated_sections.map((s) => `"${s}"`).join(", ")}]`,
    `task_ids: ${JSON.stringify((p3.curr_ids || {}).taskIds || [])}`,
    `finding_ids: ${JSON.stringify((p3.curr_ids || {}).findingIds || [])}`,
    `proposal_ids: ${JSON.stringify((p3.curr_ids || {}).proposalIds || [])}`,
    "---",
    "",
  ].join("\n");

  const content = fm + p3.body;
  safeWrite(snapshotPath, content);

  // index entry
  const idxEntry = {
    run_id: runId,
    timestamp: bjNow(),
    snapshot_path: path
      .relative(PROJECT_ROOT, snapshotPath)
      .replace(/\\/g, "/"),
    char_count: p3.chars,
    truncated_sections: p3.truncated_sections,
    sources_count: Object.keys(p1.sources_seen).length,
    anomalies_count: p2.anomalies.length,
    diff_summary: p3.diff_summary,
  };
  safeAppendJsonl(indexPath, idxEntry);

  // _latest.txt
  if (!DRY_RUN) {
    fs.writeFileSync(
      latestPath,
      path.relative(PROJECT_ROOT, snapshotPath).replace(/\\/g, "/") + "\n",
      "utf-8",
    );
  }

  // archive old
  const archived = archiveOldSnapshots();

  // self-loop runs.jsonl
  const runRecord = {
    run_id: runId,
    timestamp: bjNow(),
    input: {
      sources_seen: Object.keys(p1.sources_seen),
      sources_missing: p1.sources_missing,
      previous_snapshot: p1.prev_snapshot
        ? path.relative(PROJECT_ROOT, p1.prev_snapshot).replace(/\\/g, "/")
        : null,
    },
    output: {
      snapshot_path: path
        .relative(PROJECT_ROOT, snapshotPath)
        .replace(/\\/g, "/"),
      char_count: p3.chars,
      char_limit: SUMMARY_CHAR_LIMIT,
      truncated_sections: p3.truncated_sections,
      diff_summary: p3.diff_summary,
      anomalies_count: p2.anomalies.length,
      wrote_files: [
        path.relative(PROJECT_ROOT, snapshotPath).replace(/\\/g, "/"),
        path.relative(PROJECT_ROOT, indexPath).replace(/\\/g, "/"),
        path.relative(PROJECT_ROOT, latestPath).replace(/\\/g, "/"),
      ],
      archived_count: archived.length,
    },
    duration_ms: durationMs,
    errors: [],
    user_feedback: { rating: null, fix_notes: null },
  };
  safeAppendJsonl(SELF_RUNS_JSONL, runRecord);

  return {
    snapshot_path: snapshotPath,
    index_path: indexPath,
    latest_path: latestPath,
    archived,
    log: [
      `[Phase 4 EMIT] @ ${bjNow()}`,
      `  snapshot: ${path.relative(PROJECT_ROOT, snapshotPath)}`,
      `  index: append L${readJsonl(indexPath).length}`,
      `  latest: updated`,
      `  archived: ${archived.length}`,
      `  self runs.jsonl: append L${readJsonl(SELF_RUNS_JSONL).length}`,
    ].join("\n"),
  };
}

// =========================================================
// MAIN
// =========================================================
function main() {
  const startedMs = Date.now();
  const runId = makeRunId();

  console.log(
    `[context-curator] run_id=${runId} start=${bjNow()}${DRY_RUN ? " (dry-run)" : ""}`,
  );

  const p1 = phase1Scan();
  writeLog(`phase1-scan-${runId}.log`, p1.log);
  console.log("\n" + p1.log);
  if (PHASE === "1") return;

  if (!p1.sources_seen["task_plan.jsonl"]) {
    console.error(
      "\n[ABORT] task_plan.jsonl missing — 核心源缺失，先跑 sync_task_plan.cjs",
    );
    process.exit(3);
  }

  const p2 = phase2Extract(p1);
  writeLog(`phase2-extract-${runId}.log`, p2.log);
  console.log("\n" + p2.log);
  if (PHASE === "2") return;

  const p3 = phase3Summarize(p1, p2, runId);
  writeLog(`phase3-summarize-${runId}.log`, p3.log);
  console.log("\n" + p3.log);
  if (PHASE === "3") return;

  const durationMs = Date.now() - startedMs;
  const p4 = phase4Emit(p1, p2, p3, runId, durationMs);
  writeLog(`phase4-emit-${runId}.log`, p4.log);
  console.log("\n" + p4.log);

  // ≤30 行最终摘要打印
  console.log("\n" + "=".repeat(60));
  console.log(
    `📋 SNAPSHOT (${p3.chars}/${SUMMARY_CHAR_LIMIT} chars)  ${path.relative(PROJECT_ROOT, p4.snapshot_path)}`,
  );
  console.log("=".repeat(60));
  // print first 28 lines of body
  const lines = p3.body.split("\n").slice(0, 28);
  lines.forEach((l) => console.log(l));
  console.log("=".repeat(60));
  console.log(`Total run: ${durationMs}ms`);
}

try {
  main();
} catch (e) {
  console.error(`\n[FATAL] ${e.message}`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
