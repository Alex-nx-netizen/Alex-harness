"use strict";
const fs = require("fs");
const path = require("path");
const { nowBJ } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
// PROJECT_DIR：优先用 process.cwd()（Stop hook 触发时是用户当前工作目录）
// 兼容旧路径推断（开发期直接 node 跑）：如果 cwd 没有 _meta/progress.md 但 ../../../有，回退
const _CWD = process.cwd();
const _CWD_HAS_PROGRESS = fs.existsSync(
  path.join(_CWD, "_meta", "progress.md"),
);
const _LEGACY_DIR = path.resolve(SKILL_DIR, "..", "..", "..");
const _LEGACY_HAS_PROGRESS = fs.existsSync(
  path.join(_LEGACY_DIR, "_meta", "progress.md"),
);
const PROJECT_DIR = _CWD_HAS_PROGRESS
  ? _CWD
  : _LEGACY_HAS_PROGRESS
    ? _LEGACY_DIR
    : _CWD;
const PROGRESS_PATH = path.join(PROJECT_DIR, "_meta", "progress.md");
const CURSOR_PATH = path.join(SKILL_DIR, "logs", "push-cursor.json");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const TMP_RECORD = path.join(PROJECT_DIR, "_tmp_sr_record.json");

const BASE_TOKEN = "Se8obIsyTa5SmfsOMK8cA9d3nNc";
const TABLE_ID = "tbl6hG1Ldp6o2RWN";
const BASE_URL = "https://my.feishu.cn/base/Se8obIsyTa5SmfsOMK8cA9d3nNc";
const BOT_USER_ID = "ou_835b575f2e109b0f16569558480d202c";

const MILESTONE_RE = /M\d+.*(?:完成|落地|关闭)/;
const KNOWN_SKILLS = [
  "mode-router",
  "context-curator",
  "evolution-tracker",
  "knowledge-curator",
  "session-reporter",
  "skill-feedback",
];

// --- utils ---

function parseDateMs(dateStr) {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return Date.now();
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

// --- cursor ---
function loadCursor() {
  if (!fs.existsSync(CURSOR_PATH)) return { pushed: [] };
  try {
    return JSON.parse(fs.readFileSync(CURSOR_PATH, "utf-8"));
  } catch {
    return { pushed: [], corrupt: true };
  }
}

function saveCursor(cursor) {
  const json = JSON.stringify(cursor, null, 2);
  JSON.parse(json);
  fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
  fs.writeFileSync(CURSOR_PATH, json, "utf-8");
}

// --- progress.md parser ---
function parseSessions(content) {
  const sessions = [];
  // Split by date headings
  const parts = content.split(/^(## \d{4}-\d{1,2}-\d{1,2})\s*$/m);

  for (let i = 1; i < parts.length; i += 2) {
    const dateHeading = parts[i].replace("## ", "").trim();
    const block = parts[i + 1] || "";

    // Split by ### headings
    const chunks = block.split(/^(### .+)$/m);

    let j = 0;
    while (j < chunks.length) {
      const heading = (chunks[j] || "").trim();
      if (!heading.startsWith("###")) {
        j++;
        continue;
      }
      const body = (chunks[j + 1] || "").trim();
      j += 2;

      const title = heading.replace(/^###\s*/, "").trim();
      const runId = `${dateHeading}__${title}`.slice(0, 200);

      const doneLines = body
        .split("\n")
        .filter((l) => l.includes("✅"))
        .map((l) => l.trim())
        .filter(Boolean);

      const skills = KNOWN_SKILLS.filter(
        (s) => body.includes(s) || title.includes(s),
      );

      const isMilestone = MILESTONE_RE.test(title) || MILESTONE_RE.test(body);

      sessions.push({
        run_id: runId,
        date: dateHeading,
        date_ms: parseDateMs(dateHeading),
        title,
        done_lines: doneLines,
        skills: [...new Set(skills)],
        is_milestone: isMilestone,
      });
    }
  }
  return sessions;
}

// --- lark calls ---
function lark(args) {
  const result = spawnSync("lark-cli", args, {
    shell: true,
    encoding: "utf-8",
    cwd: PROJECT_DIR,
    timeout: 20000,
  });
  const out = (result.stdout || "").trim();
  try {
    return JSON.parse(out);
  } catch {
    return { ok: false, error: result.stderr || out || "no output" };
  }
}

function pushToBase(session) {
  const fields = {
    会话标题: session.title.slice(0, 200),
    日期: session.date_ms,
    完成项: session.done_lines.join("\n").slice(0, 2000) || "（无 ✅ 完成项）",
    涉及Skill: session.skills.join(", ") || "—",
    里程碑: session.is_milestone,
    run_id: session.run_id.slice(0, 200),
  };

  fs.writeFileSync(TMP_RECORD, JSON.stringify(fields), "utf-8");

  const result = lark([
    "base",
    "+record-upsert",
    "--base-token",
    BASE_TOKEN,
    "--table-id",
    TABLE_ID,
    "--json",
    "@_tmp_sr_record.json",
    "--as",
    "user",
  ]);

  try {
    fs.unlinkSync(TMP_RECORD);
  } catch {}
  return result;
}

function pushIM(session) {
  const milestone = session.is_milestone ? "[里程碑] " : "";
  const skills = session.skills.length ? ` · ${session.skills.join("/")}` : "";
  const done = session.done_lines.length;
  const text = `${milestone}${session.date} ${session.title} · ✅${done}项${skills} · ${BASE_URL}`;

  return lark([
    "im",
    "+messages-send",
    "--user-id",
    BOT_USER_ID,
    "--as",
    "bot",
    "--text",
    text,
  ]);
}

// --- runs log ---
function writeRunLog(pushed, errors) {
  const entry = {
    run_id: nowBJ(),
    skill: "session-reporter",
    sessions_pushed: pushed,
    errors: errors.length,
    user_feedback: { rating: null, fix_notes: null },
  };
  const line = JSON.stringify(entry);
  JSON.parse(line);
  fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true });
  fs.appendFileSync(RUNS_LOG, line + "\n", "utf-8");
}

// --- main ---
function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--list") {
    const cursor = loadCursor();
    console.log(`已推送 ${cursor.pushed.length} 条`);
    cursor.pushed.slice(-8).forEach((id) => console.log(" ", id));
    return;
  }

  if (args[0] === "--reset") {
    saveCursor({ pushed: [] });
    console.log("cursor 已重置，下次将推送全量");
    return;
  }

  if (!fs.existsSync(PROGRESS_PATH)) {
    console.log("session-reporter: progress.md 不存在，跳过");
    return;
  }

  const content = fs.readFileSync(PROGRESS_PATH, "utf-8");
  const sessions = parseSessions(content);
  const cursor = loadCursor();

  // Safe fallback if cursor was corrupt: only push recent 3
  const pushedSet = new Set(cursor.pushed);
  let newSessions = sessions.filter((s) => !pushedSet.has(s.run_id));
  if (cursor.corrupt && newSessions.length > 3) {
    console.warn("session-reporter: cursor 损坏，安全模式：只推最近 3 条");
    newSessions = newSessions.slice(-3);
  }

  if (newSessions.length === 0) {
    console.log("session-reporter: 无新会话，跳过");
    return;
  }

  console.log(
    `session-reporter: 发现 ${newSessions.length} 条新会话，推送中...`,
  );

  const errors = [];
  let pushed = 0;

  for (const session of newSessions) {
    const baseResult = pushToBase(session);
    if (!baseResult.ok) {
      errors.push(
        `Base: ${session.run_id.slice(0, 60)} → ${JSON.stringify(baseResult.error).slice(0, 80)}`,
      );
      console.error(`  ❌ Base 失败: ${session.title}`);
      continue;
    }

    cursor.pushed.push(session.run_id);
    pushed++;
    console.log(`  ✅ ${session.title}`);

    // IM is best-effort; failure doesn't block cursor update
    const imResult = pushIM(session);
    if (!imResult.ok) {
      errors.push(
        `IM: ${session.title.slice(0, 40)} → ${JSON.stringify(imResult.error).slice(0, 60)}`,
      );
    }
  }

  if (pushed > 0) {
    cursor.last_push_time = nowBJ();
    delete cursor.corrupt;
    saveCursor(cursor);
  }

  writeRunLog(pushed, errors);

  if (errors.length) {
    console.error(`\n⚠️ ${errors.length} 条警告：`);
    errors.forEach((e) => console.error("  ", e));
  }

  console.log(`\n完成：推送 ${pushed}/${newSessions.length} 条 → ${BASE_URL}`);
}

main();
