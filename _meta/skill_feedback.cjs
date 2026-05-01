#!/usr/bin/env node
/**
 * skill_feedback.cjs — universal user_feedback updater for any skill's runs.jsonl
 *
 * 让用户给 skill 跑过的 run 打分 + 写 fix_notes。这是 evolution-tracker 的输入：
 * 没有 user_feedback.rating 的 run，evolution-tracker 不当 valid_run，无法自我进化。
 *
 * Usage:
 *   node _meta/skill_feedback.cjs <skill_name> --list             # 列出待打分的 run
 *   node _meta/skill_feedback.cjs <skill_name> <run_id> <rating> [fix_notes]
 *   node _meta/skill_feedback.cjs <skill_name> <run_id> <rating> [fix_notes] --dry-run
 *   node _meta/skill_feedback.cjs <skill_name> <run_id> <rating> [fix_notes] --force   # 覆盖已有评分
 *
 * Examples:
 *   node _meta/skill_feedback.cjs context-curator --list
 *   node _meta/skill_feedback.cjs context-curator 2026-4-30-111721 4 "首跑摘要可用，但 progress/findings 被压成 count，看不到细节"
 *   node _meta/skill_feedback.cjs knowledge-curator 2026-4-29-investment 5
 *
 * 铁律：
 *   - 只改 user_feedback 字段，绝不动其他字段
 *   - 写完立刻 JSON.parse 整文件（铁律 #8）
 *   - 默认不覆盖已有评分（防误操作）；--force 才覆盖
 *   - rating 必须 1-5 整数
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.join(PROJECT_ROOT, ".claude", "skills");

function bjNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function usage(msg) {
  if (msg) console.error(`[ERROR] ${msg}\n`);
  console.error(
    `Usage:
  node _meta/skill_feedback.cjs <skill> --list
  node _meta/skill_feedback.cjs <skill> <run_id> <rating 1-5> [fix_notes] [--dry-run] [--force] [--allow-short]

Flags:
  --dry-run     preview without writing
  --force       overwrite existing rating
  --allow-short bypass fix_notes 长度门（≥30 字默认；F-017 缓解）

Examples:
  node _meta/skill_feedback.cjs context-curator --list
  node _meta/skill_feedback.cjs context-curator 2026-4-30-111721 4 "progress/findings 太激进被 compact_mode 压成 count，希望平滑曲线"`,
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set();
  const pos = [];
  for (const a of args) {
    if (a.startsWith("--")) flags.add(a);
    else pos.push(a);
  }
  return { pos, flags };
}

function loadRuns(skillName) {
  const runsPath = path.join(SKILLS_ROOT, skillName, "logs", "runs.jsonl");
  if (!fs.existsSync(runsPath)) {
    usage(`runs.jsonl not found at ${runsPath}`);
  }
  const lines = fs
    .readFileSync(runsPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  const records = [];
  lines.forEach((line, i) => {
    try {
      const obj = JSON.parse(line);
      records.push({ raw: line, obj, lineNo: i + 1 });
    } catch (e) {
      console.error(`[WARN] L${i + 1} invalid JSON, skipping: ${e.message}`);
    }
  });
  return { runsPath, records, lines };
}

function listRuns(skillName) {
  const { runsPath, records } = loadRuns(skillName);
  console.log(`📋 ${skillName}/logs/runs.jsonl  (${records.length} records)\n`);
  for (const r of records) {
    const o = r.obj;
    if (o._comment) {
      console.log(`L${r.lineNo}  [comment]  ${o._comment.slice(0, 60)}`);
      continue;
    }
    const rating = o.user_feedback?.rating;
    const notes = o.user_feedback?.fix_notes;
    const ratingStr = rating == null ? "⚪ unrated" : `⭐ ${rating}/5`;
    const completedStr = o.completed === false ? " [aborted]" : "";
    const noteStr = notes ? `  notes: ${String(notes).slice(0, 50)}...` : "";
    console.log(
      `L${r.lineNo}  ${o.run_id}  ${ratingStr}${completedStr}${noteStr}`,
    );
  }
  console.log(
    `\n💡 To rate: node _meta/skill_feedback.cjs ${skillName} <run_id> <1-5> "<fix_notes>"`,
  );
}

// F-017 mitigation: minimum fix_notes length so evolution-tracker has signal
const MIN_FIX_NOTES_CHARS = 30;

function rateRun(
  skillName,
  runId,
  ratingStr,
  fixNotes,
  isDryRun,
  isForce,
  isAllowShort,
) {
  const rating = parseInt(ratingStr, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    usage(`rating must be integer 1-5, got "${ratingStr}"`);
  }

  // F-017 (P-2026-4-30-002 A): fix_notes 质量门
  // 拒绝空 / 仅标点 / 短于阈值的 fix_notes（除非 --allow-short）
  const trimmed = (fixNotes || "")
    .trim()
    .replace(/^[.\s。·…\-_]+|[.\s。·…\-_]+$/g, "");
  if (!isAllowShort && trimmed.length < MIN_FIX_NOTES_CHARS) {
    console.error(
      `[ERROR] fix_notes 太短 / 无内容（"${fixNotes || ""}" → trimmed 长度 ${trimmed.length} < ${MIN_FIX_NOTES_CHARS}）

evolution-tracker 需要含具象词的描述才能聚类生成议案：
  - 哪个 Phase / 哪节产物有问题？
  - 缺什么 / 多什么 / 哪里不对？
  - 你希望它怎么改？

例：
  ✅ "Phase 4 EMIT 后 progress 节被 compact_mode 压成 count，看不到具体进度，希望 truncate 阶梯更平滑"
  ✅ "首跑 6 sources 全见 + 安全写入器工作；但 800 字硬上限触发太早，希望提到 1200"
  ❌ "..." / "ok" / "good"

绕过：加 --allow-short （此 run 在 evolution-tracker 中会被标 uncategorized，不进议案）`,
    );
    process.exit(9);
  }

  const { runsPath, records, lines } = loadRuns(skillName);

  const idx = records.findIndex((r) => r.obj.run_id === runId);
  if (idx === -1) {
    console.error(`[ERROR] run_id "${runId}" not found in ${runsPath}`);
    console.error(`Available run_ids:`);
    records
      .filter((r) => !r.obj._comment)
      .forEach((r) => console.error(`  - ${r.obj.run_id}`));
    process.exit(3);
  }

  const target = records[idx];
  const existing = target.obj.user_feedback;
  if (existing && existing.rating != null && !isForce) {
    console.error(
      `[ERROR] run "${runId}" already has rating=${existing.rating}. Use --force to overwrite.`,
    );
    if (existing.fix_notes)
      console.error(`  existing fix_notes: ${existing.fix_notes}`);
    process.exit(4);
  }

  // build new record (immutable update — 铁律：don't mutate existing)
  const updated = {
    ...target.obj,
    user_feedback: {
      rating,
      fix_notes: fixNotes || null,
      rated_at: bjNow(),
    },
  };
  const newLine = JSON.stringify(updated);

  // roundtrip validate
  const re = JSON.parse(newLine);
  if (re.run_id !== runId) {
    console.error(`[FATAL] roundtrip mismatch on rebuild`);
    process.exit(5);
  }

  // build new file content
  const newLines = lines.slice();
  // find which line index in `lines` corresponds to this record
  // we matched by parsed object, but lines are filtered to non-empty
  // simple approach: find by exact substring match of run_id
  let lineIdx = -1;
  for (let i = 0; i < newLines.length; i++) {
    if (newLines[i].includes(`"run_id":"${runId}"`)) {
      lineIdx = i;
      break;
    }
  }
  if (lineIdx === -1) {
    console.error(`[FATAL] could not locate line for run_id ${runId}`);
    process.exit(6);
  }
  newLines[lineIdx] = newLine;
  const newContent = newLines.join("\n") + "\n";

  // pre-write validate (parse every line)
  for (let i = 0; i < newLines.length; i++) {
    try {
      JSON.parse(newLines[i]);
    } catch (e) {
      console.error(
        `[FATAL] pre-write JSONL validation fail at L${i + 1}: ${e.message}`,
      );
      process.exit(7);
    }
  }

  if (isDryRun) {
    console.log(`[dry-run] would update ${runsPath}`);
    console.log(`[dry-run] target line ${lineIdx + 1}:`);
    console.log(`[dry-run] before: ${target.raw.slice(0, 200)}...`);
    console.log(`[dry-run] after:  ${newLine.slice(0, 200)}...`);
    console.log(
      `[dry-run] new user_feedback: ${JSON.stringify(updated.user_feedback)}`,
    );
    return;
  }

  // backup
  const backupPath = runsPath + ".bak";
  fs.copyFileSync(runsPath, backupPath);

  // write
  fs.writeFileSync(runsPath, newContent, "utf-8");

  // post-write re-parse all lines
  const recheck = fs
    .readFileSync(runsPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  recheck.forEach((l, i) => {
    try {
      JSON.parse(l);
    } catch (e) {
      console.error(
        `[FATAL] post-write JSONL corruption at L${i + 1}: ${e.message}`,
      );
      console.error(`Restoring from ${backupPath}`);
      fs.copyFileSync(backupPath, runsPath);
      process.exit(8);
    }
  });

  console.log(`✅ ${skillName} run "${runId}" rated ${rating}/5`);
  if (fixNotes) console.log(`   fix_notes: ${fixNotes}`);
  console.log(`   rated_at: ${updated.user_feedback.rated_at}`);
  console.log(`   backup: ${path.relative(PROJECT_ROOT, backupPath)}`);
  console.log("");
  console.log(`💡 Next: 评分 ≥ N 条 valid run 后跑 evolution-tracker 复盘:`);
  console.log(`   node .claude/skills/evolution-tracker/run.cjs ${skillName}`);
}

function main() {
  const { pos, flags } = parseArgs(process.argv);
  if (pos.length === 0) usage("missing skill name");
  const skill = pos[0];

  if (flags.has("--list")) {
    listRuns(skill);
    return;
  }

  if (pos.length < 3) usage("missing run_id and/or rating");
  const runId = pos[1];
  const rating = pos[2];
  const fixNotes = pos[3] || null;
  const isDryRun = flags.has("--dry-run");
  const isForce = flags.has("--force");
  const isAllowShort = flags.has("--allow-short");

  rateRun(skill, runId, rating, fixNotes, isDryRun, isForce, isAllowShort);
}

main();
