// Shared utilities for evolution-tracker
// Per project CLAUDE.md 铁律:
//   #6 北京时间 YYYY-M-D HH:MM:SS, no leading zeros on month/day
//   #8 写 JSON/JSONL 后必须立刻 parse 验证
const fs = require("fs");
const path = require("path");

// ---- Paths ----
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SKILLS_ROOT = path.join(PROJECT_ROOT, ".claude", "skills");
const META_DIR = path.join(PROJECT_ROOT, "_meta");
const SELF_SKILL_DIR = path.join(SKILLS_ROOT, "evolution-tracker");
const SELF_LOGS_DIR = path.join(SELF_SKILL_DIR, "logs");

function subjectSkillPath(skill) {
  return path.join(SKILLS_ROOT, skill);
}

// ---- Time (北京时间, 无前导零) ----
function bjNow() {
  const d = new Date();
  // assume runtime is in 北京 timezone or convert; we use locale parts
  const Y = d.getFullYear();
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function bjToday() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---- JSONL helpers (with mandatory roundtrip validation, 铁律 #8) ----
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      parsed.push(JSON.parse(lines[i]));
    } catch (e) {
      throw new Error(
        `JSONL parse error at ${filePath} line ${i + 1}: ${e.message}\n  content: ${lines[i].slice(0, 120)}`,
      );
    }
  }
  return parsed;
}

function appendJsonl(filePath, obj) {
  const line = JSON.stringify(obj);
  // validate roundtrip
  const re = JSON.parse(line);
  if (re.run_id && obj.run_id && re.run_id !== obj.run_id) {
    throw new Error("JSONL roundtrip mismatch");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, line + "\n", "utf-8");
  // re-validate full file
  const all = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  all.forEach((l, i) => {
    try {
      JSON.parse(l);
    } catch (e) {
      throw new Error(
        `Post-append JSONL corruption at ${filePath} line ${i + 1}: ${e.message}`,
      );
    }
  });
}

// ---- Frontmatter parser (limited shape, no external dep) ----
function parseFrontmatter(mdContent) {
  const m = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const yaml = m[1];
  const out = {
    name: null,
    version: null,
    description: null,
    metadata: { evolution: {}, status: {} },
  };

  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  if (nameMatch) out.name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
  const versionMatch = yaml.match(/^version:\s*(.+)$/m);
  if (versionMatch)
    out.version = versionMatch[1].trim().replace(/^["']|["']$/g, "");

  // evolution params (numbers)
  for (const key of [
    "THRESHOLD_N",
    "COOLDOWN_HOURS",
    "BLACKLIST_WEEKS",
    "MIN_VALID_RUN_FOR_NORMAL",
  ]) {
    const m2 = yaml.match(new RegExp("^\\s+" + key + ":\\s*(\\d+)\\s*$", "m"));
    if (m2) out.metadata.evolution[key] = parseInt(m2[1], 10);
  }

  // SIGNAL_KEYWORDS list
  const kwBlock = yaml.match(/SIGNAL_KEYWORDS:\s*\n((?:\s+-\s+.+\n?)+)/);
  if (kwBlock) {
    const items = kwBlock[1].match(/^\s+-\s+(.+)$/gm) || [];
    out.metadata.evolution.SIGNAL_KEYWORDS = items.map((s) =>
      s
        .replace(/^\s+-\s+/, "")
        .trim()
        .replace(/^["']|["']$/g, ""),
    );
  }

  // can_run
  const canRunMatch = yaml.match(/can_run:\s*(true|false)/);
  if (canRunMatch) out.metadata.status.can_run = canRunMatch[1] === "true";

  return out;
}

// ---- findings.md F-NNN extractor ----
function extractFindings(findingsMdContent) {
  const re = /^### (F-\d+):\s*(.+)$/gm;
  const out = [];
  let m;
  while ((m = re.exec(findingsMdContent)) !== null) {
    out.push({ id: m[1], title: m[2].trim() });
  }
  return out;
}

// ---- Logger ----
function writeLog(name, content) {
  const p = path.join(SELF_LOGS_DIR, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

// ---- run_id ----
function makeRunId(subjectSkill) {
  const d = new Date();
  const seq = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `evt-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${subjectSkill}-${seq}`;
}

module.exports = {
  PROJECT_ROOT,
  SKILLS_ROOT,
  META_DIR,
  SELF_SKILL_DIR,
  SELF_LOGS_DIR,
  subjectSkillPath,
  bjNow,
  bjToday,
  readJsonl,
  appendJsonl,
  parseFrontmatter,
  extractFindings,
  writeLog,
  makeRunId,
};
