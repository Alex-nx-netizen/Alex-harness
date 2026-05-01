// Phase 1: READ
// Per SKILL.md §3 Phase 1 — load runs.jsonl, SKILL.md, findings.md, cursor; compute valid_run_count + mode.
// Hard rule: any JSONL parse fail = abort (don't analyze on bad data).
const fs = require("fs");
const path = require("path");
const C = require("./common.cjs");

// P-2026-4-30-001: progress.md 关键词 (cross_session_pattern_mining)
const PROGRESS_KEYWORDS = [
  /踩坑/,
  /坑/,
  /失败/,
  /abort/i,
  /F-\d+/,
  /没生效/,
  /重复/,
  /自跑/,
  /dangling/i,
];

function readPhase1(subjectSkill, opts = {}) {
  const skillDir = C.subjectSkillPath(subjectSkill);
  const runsPath = path.join(skillDir, "logs", "runs.jsonl");
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const findingsPath = path.join(C.META_DIR, "findings.md");
  const cursorPath = path.join(skillDir, "logs", ".evolution-cursor");
  const taskPlanPath = path.join(C.META_DIR, "task_plan.jsonl");
  const progressPath = path.join(C.META_DIR, "progress.md");

  const result = {
    subject_skill: subjectSkill,
    paths: {
      runsPath,
      skillMdPath,
      findingsPath,
      cursorPath,
      taskPlanPath,
      progressPath,
    },
    runs: [],
    valid_run_count: 0,
    valid_runs: [],
    aborted_runs: [],
    skill_frontmatter: null,
    skill_md_lines: 0,
    findings: [],
    progress_entries: [], // P-001: 14 天内含坑/失败等关键词的 progress.md 段落
    cursor: null,
    mode: null, // 'aborted' | 'weak_signal' | 'normal'
    weak_signal_banner: false,
    abort_reason: null,
    task_plan: null, // { tasks, stats, hot_blocked_by, blocked_chains, synced_at, missing }
  };

  // 1. runs.jsonl — parse each line, abort on any failure
  if (!fs.existsSync(runsPath)) {
    result.mode = "aborted";
    result.abort_reason = `runs.jsonl not found: ${runsPath}`;
    return result;
  }
  let rawRuns;
  try {
    rawRuns = C.readJsonl(runsPath);
  } catch (e) {
    result.mode = "aborted";
    result.abort_reason = `runs.jsonl JSONL parse error: ${e.message}`;
    return result;
  }
  // skip leading comment lines (lines with _comment field)
  result.runs = rawRuns.filter((r) => !r._comment);

  // 2. classify valid / aborted
  for (const run of result.runs) {
    const isCompleted = run.completed !== false; // default true if missing
    const hasRating =
      run.user_feedback &&
      run.user_feedback.rating !== null &&
      run.user_feedback.rating !== undefined;
    if (isCompleted && hasRating) {
      result.valid_runs.push(run);
    } else if (!isCompleted) {
      result.aborted_runs.push(run);
    }
  }
  result.valid_run_count = result.valid_runs.length;

  // 3. SKILL.md
  if (!fs.existsSync(skillMdPath)) {
    result.mode = "aborted";
    result.abort_reason = `SKILL.md not found: ${skillMdPath}`;
    return result;
  }
  const skillMd = fs.readFileSync(skillMdPath, "utf-8");
  result.skill_md_lines = skillMd.split("\n").length;
  result.skill_frontmatter = C.parseFrontmatter(skillMd);

  // 4. findings.md (optional)
  if (fs.existsSync(findingsPath)) {
    const findingsMd = fs.readFileSync(findingsPath, "utf-8");
    result.findings = C.extractFindings(findingsMd);
  }

  // 4.5. task_plan.jsonl (optional, Ralph 嫁接产物)
  // 边界：当前只读不消费——不转成 ANALYZE 的 direction，不出议案。
  // 用途：Phase 1 log 出 task 健康度摘要，让人审看到当前阻塞图谱。
  result.task_plan = readTaskPlan(taskPlanPath);

  // 4.6. progress.md (optional) — P-2026-4-30-001 cross_session_pattern_mining
  // 读最近 14 天 session entries，按关键词过滤，供 Phase 2 聚类消费。
  result.progress_entries = readProgressMd(progressPath, 14);

  // 5. cursor (optional, treat missing as first run = process all valid)
  if (fs.existsSync(cursorPath)) {
    const cursorContent = fs.readFileSync(cursorPath, "utf-8");
    const lpMatch = cursorContent.match(/last_processed_run_id=(.+)/);
    result.cursor = {
      raw: cursorContent.trim(),
      last_processed_run_id: lpMatch ? lpMatch[1].trim() : null,
    };
  }

  // 6. determine mode (per SKILL.md §3 Phase 1 最小数门槛)
  // Get MIN_VALID_RUN_FOR_NORMAL from self SKILL.md (own frontmatter, not subject)
  const selfSkillMdPath = path.join(C.SELF_SKILL_DIR, "SKILL.md");
  const selfMd = fs.readFileSync(selfSkillMdPath, "utf-8");
  const selfFm = C.parseFrontmatter(selfMd);
  const minNormal =
    (selfFm && selfFm.metadata.evolution.MIN_VALID_RUN_FOR_NORMAL) || 2;

  if (result.valid_run_count === 0) {
    result.mode = "aborted";
    result.abort_reason = "无 valid run，无法复盘（valid_run_count=0）";
  } else if (result.valid_run_count < minNormal) {
    result.mode = "weak_signal";
    result.weak_signal_banner = true;
  } else {
    result.mode = "normal";
  }
  result.config = selfFm ? selfFm.metadata.evolution : null;

  return result;
}

function formatPhase1Log(r) {
  const lines = [];
  lines.push(`# Phase 1 READ log — subject: ${r.subject_skill}`);
  lines.push(`time: ${C.bjNow()}`);
  lines.push("");
  lines.push(`mode: ${r.mode}`);
  if (r.abort_reason) lines.push(`abort_reason: ${r.abort_reason}`);
  if (r.weak_signal_banner) lines.push(`weak_signal_banner: true`);
  lines.push("");
  lines.push(
    `runs.jsonl: ${r.runs.length} entries (excl comment), ${r.valid_run_count} valid, ${r.aborted_runs.length} aborted`,
  );
  lines.push(
    `valid run_ids: ${r.valid_runs.map((v) => v.run_id).join(", ") || "(none)"}`,
  );
  lines.push(
    `aborted run_ids: ${r.aborted_runs.map((v) => v.run_id).join(", ") || "(none)"}`,
  );
  lines.push("");
  if (r.skill_frontmatter) {
    lines.push(
      `SKILL.md: ${r.skill_md_lines} lines, name=${r.skill_frontmatter.name} v${r.skill_frontmatter.version}`,
    );
  } else {
    lines.push(`SKILL.md: parse failed (no frontmatter)`);
  }
  lines.push(`findings.md: ${r.findings.length} F-NNN entries`);
  lines.push(
    `cursor: ${r.cursor ? r.cursor.last_processed_run_id : "(none, first run)"}`,
  );
  lines.push("");
  lines.push(
    `config (self frontmatter): ${JSON.stringify(r.config || {}, null, 2)}`,
  );

  // task_plan.jsonl section（观察窗口；不消费成议案）
  lines.push("");
  lines.push("--- task_plan.jsonl (observed, not consumed by ANALYZE) ---");
  if (!r.task_plan || r.task_plan.missing) {
    lines.push(
      `task_plan: ${r.task_plan ? r.task_plan.reason : "(not loaded)"}`,
    );
  } else if (r.task_plan.parse_error) {
    lines.push(`⚠️ task_plan parse error: ${r.task_plan.parse_error}`);
  } else {
    const s = r.task_plan.stats;
    lines.push(`synced_at: ${r.task_plan.synced_at}`);
    lines.push(
      `stats: ${s.completed}/${s.total} completed (${s.completion_pct}%) | blocked=${s.blocked} | in_progress=${s.in_progress} | skipped=${s.skipped} | aborted=${s.aborted} | scheduled=${s.scheduled}`,
    );
    lines.push(
      `completion_signal: <promise>${r.task_plan.completion_signal}</promise>`,
    );
    if (r.task_plan.hot_blocked_by.length > 0) {
      lines.push(`hot blockers (解锁这些是关键路径):`);
      for (const h of r.task_plan.hot_blocked_by) {
        lines.push(
          `  - ${h.task_id}: blocking ${h.blocking_count} other task(s)`,
        );
      }
    }
    if (r.task_plan.in_progress_list.length > 0) {
      lines.push(`in_progress:`);
      for (const t of r.task_plan.in_progress_list) {
        lines.push(`  - ${t.task_id}: ${t.subject}`);
      }
    }
    if (r.task_plan.blocked_chains.length > 0) {
      lines.push(`blocked chains:`);
      for (const b of r.task_plan.blocked_chains) {
        lines.push(
          `  - ${b.task_id} ← ${b.blocker_status.join(", ") || "(no blocker info)"}: ${b.subject}`,
        );
      }
    }
  }

  // progress.md section（P-001 cross_session_pattern_mining；供 ANALYZE 消费）
  lines.push("");
  lines.push(
    "--- progress.md (P-001: cross_session_pattern_mining, consumed by ANALYZE) ---",
  );
  lines.push(`progress_entries: ${(r.progress_entries || []).length}`);
  for (const e of r.progress_entries || []) {
    lines.push(
      `  [${e.date_str}] "${e.session_title}" → ${e.line_count} matching line(s) / keywords: ${e.keywords_matched.slice(0, 4).join(", ")}`,
    );
  }

  return lines.join("\n");
}

// ---- progress.md reader (P-2026-4-30-001) ----
// 按 ## YYYY-M-D 标题切日，按 ### 切 session，关键词过滤保留有信号的行。
// 返回 { date_str, session_title, text, keywords_matched, line_count }[]
function readProgressMd(progressPath, windowDays) {
  if (!fs.existsSync(progressPath)) return [];
  const content = fs.readFileSync(progressPath, "utf-8");
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const entries = [];

  let currentDateStr = null;
  let currentDateInWindow = false;
  let currentSession = null;
  let sessionLines = [];

  const flushSession = () => {
    if (!currentSession || !currentDateInWindow || sessionLines.length === 0)
      return;
    const matchingLines = sessionLines.filter((line) =>
      PROGRESS_KEYWORDS.some((kw) => kw.test(line)),
    );
    if (matchingLines.length === 0) return;
    const matchedKeywords = PROGRESS_KEYWORDS.filter((kw) =>
      matchingLines.some((l) => kw.test(l)),
    ).map((kw) => kw.source || String(kw));
    entries.push({
      date_str: currentDateStr,
      session_title: currentSession,
      text: matchingLines.join("\n"),
      keywords_matched: matchedKeywords,
      line_count: matchingLines.length,
    });
  };

  for (const line of content.split("\n")) {
    const dayMatch = line.match(/^## (\d{4}-(\d{1,2})-(\d{1,2}))\s*$/);
    if (dayMatch) {
      flushSession();
      currentSession = null;
      sessionLines = [];
      currentDateStr = dayMatch[1];
      const [year, month, day] = dayMatch[1].split("-").map(Number);
      currentDateInWindow =
        new Date(year, month - 1, day).getTime() >= cutoffMs;
      continue;
    }
    if (line.startsWith("### ")) {
      flushSession();
      sessionLines = [];
      currentSession = line.slice(4).trim();
      continue;
    }
    if (currentSession && currentDateInWindow) {
      sessionLines.push(line);
    }
  }
  flushSession();
  return entries;
}

// ---- task_plan.jsonl reader ----
// 不在 ANALYZE 阶段消费这些数据；只为 Phase 1 log 提供观察窗口。
// 未来要消费成议案时，应该新建 task-progress-tracker skill（独立职责），不污染 evolution-tracker。
function readTaskPlan(taskPlanPath) {
  if (!fs.existsSync(taskPlanPath)) {
    return {
      missing: true,
      reason: "task_plan.jsonl not found（先跑 _meta/sync_task_plan.cjs）",
    };
  }
  let tasks;
  try {
    tasks = C.readJsonl(taskPlanPath);
  } catch (e) {
    return { missing: false, parse_error: e.message };
  }

  // stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.passes).length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    skipped: tasks.filter((t) => t.status === "skipped").length,
    aborted: tasks.filter((t) => t.status === "aborted").length,
    scheduled: tasks.filter((t) => t.status === "scheduled").length,
    unknown: tasks.filter((t) => t.status === "unknown").length,
  };
  stats.completion_pct =
    stats.total > 0
      ? Math.round((stats.completed / stats.total) * 1000) / 10
      : 0;

  // hot_blocked_by: 哪些 task_id 被最多其他 task 引用为 blocked_by → 解锁这些是关键路径
  const blockerCount = {};
  for (const t of tasks) {
    if (Array.isArray(t.blocked_by)) {
      for (const blockerId of t.blocked_by) {
        blockerCount[blockerId] = (blockerCount[blockerId] || 0) + 1;
      }
    }
  }
  const hot_blocked_by = Object.entries(blockerCount)
    .map(([id, count]) => ({ task_id: id, blocking_count: count }))
    .sort((a, b) => b.blocking_count - a.blocking_count)
    .slice(0, 5);

  // blocked_chains: 当前 blocked 状态的 task + 它们的 blocker（含 blocker 当前是否也 blocked）
  const taskById = Object.fromEntries(tasks.map((t) => [t.task_id, t]));
  const blocked_chains = tasks
    .filter((t) => t.status === "blocked")
    .map((t) => ({
      task_id: t.task_id,
      subject: t.subject ? t.subject.slice(0, 60) : "",
      blocked_by: t.blocked_by || [],
      blocker_status: (t.blocked_by || []).map((bid) => {
        const b = taskById[bid];
        return b
          ? `${bid}:${b.status}${b.passes ? "(passed)" : ""}`
          : `${bid}:?`;
      }),
    }));

  // in_progress 列表（短）
  const in_progress_list = tasks
    .filter((t) => t.status === "in_progress")
    .map((t) => ({
      task_id: t.task_id,
      subject: t.subject ? t.subject.slice(0, 60) : "",
    }));

  // synced_at（每行都同 — 取首条）
  const synced_at = tasks.length > 0 ? tasks[0].synced_at : null;

  return {
    missing: false,
    synced_at,
    stats,
    hot_blocked_by,
    blocked_chains,
    in_progress_list,
    completion_signal:
      stats.completed === stats.total && stats.total > 0
        ? "COMPLETE"
        : "NOT_COMPLETE",
  };
}

module.exports = { readPhase1, formatPhase1Log };
