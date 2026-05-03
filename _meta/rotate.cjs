#!/usr/bin/env node
// _meta/rotate.cjs
// helix-runs.jsonl 月度归档脚本（E1）
// 用法：
//   node _meta/rotate.cjs              # 默认归档"上一个月"
//   node _meta/rotate.cjs --month 2026-04
//   node _meta/rotate.cjs --month 2026-4   # 也接受不带前导 0 的（CLAUDE.md 时间格式）
//
// 行为：
//   1. 读 _meta/helix-runs.jsonl 全文
//   2. 按 ts 字段筛出指定月份的行
//   3. 写到 _meta/archive/helix-runs-<month>.jsonl（追加模式，去重）
//   4. 把主文件备份成 .bak，然后从主文件删除已归档的行
//   5. 写后双重 JSON 校验：归档文件 + 主文件每行 parse 一次
//   6. 输出归档行数 + 剩余行数
//
// 安全约束：
//   - 主文件备份永远先写，再覆盖原文件
//   - 任何错误都不删原文件、不动 .bak
//   - 跨平台：用 fs.* 不调外部命令

"use strict";

const fs = require("fs");
const path = require("path");

const META_DIR = __dirname;
const SRC = path.join(META_DIR, "helix-runs.jsonl");
const ARCHIVE_DIR = path.join(META_DIR, "archive");

function parseArgs(argv) {
  const args = { month: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--month" && argv[i + 1]) {
      args.month = argv[i + 1];
      i++;
    }
  }
  return args;
}

// "2026-4" / "2026-04" → "2026-4"（与 ts 字段格式 YYYY-M-D 对齐，CLAUDE.md 工作约定 #7）
function normalizeMonth(m) {
  if (!m) return null;
  const mm = m.match(/^(\d{4})-(\d{1,2})$/);
  if (!mm) {
    throw new Error(
      `--month 格式错误：${m}（应为 YYYY-MM 或 YYYY-M，如 2026-4 / 2026-04）`,
    );
  }
  const year = mm[1];
  const monthNum = parseInt(mm[2], 10);
  if (monthNum < 1 || monthNum > 12) {
    throw new Error(`--month 月份越界：${m}`);
  }
  return `${year}-${monthNum}`;
}

// 默认上个月（北京时间）
function defaultLastMonth() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  let y = bj.getUTCFullYear();
  let m = bj.getUTCMonth(); // 0-11，本月
  // 上个月
  m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  return `${y}-${m + 1}`;
}

// 行的 ts 是否落在目标月份？ts 形如 "2026-4-30 22:18:40"
function tsInMonth(ts, targetMonth) {
  if (!ts || typeof ts !== "string") return false;
  const m = ts.match(/^(\d{4})-(\d{1,2})-/);
  if (!m) return false;
  const lineMonth = `${m[1]}-${parseInt(m[2], 10)}`;
  return lineMonth === targetMonth;
}

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function readJsonlLines(file) {
  if (!fs.existsSync(file)) return { lines: [], objects: [] };
  const raw = stripBom(fs.readFileSync(file, "utf-8"));
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const clean = stripBom(line); // 保险：每行也去 BOM
    if (!clean.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(clean);
    } catch (e) {
      throw new Error(`无法 parse 行: ${clean.slice(0, 200)} — ${e.message}`);
    }
    out.push({ raw: clean, obj });
  }
  return { lines, parsed: out };
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function validateJsonl(file) {
  const raw = stripBom(fs.readFileSync(file, "utf-8"));
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  let n = 0;
  for (const line of lines) {
    JSON.parse(stripBom(line)); // 抛异常 = 校验失败
    n++;
  }
  return n;
}

function main() {
  const args = parseArgs(process.argv);
  const targetMonth = normalizeMonth(args.month) || defaultLastMonth();

  if (!fs.existsSync(SRC)) {
    console.error(`[rotate] 源文件不存在: ${SRC}`);
    process.exit(1);
  }

  console.log(`[rotate] target month = ${targetMonth}`);
  console.log(`[rotate] source = ${SRC}`);

  const { parsed } = readJsonlLines(SRC);
  const totalBefore = parsed.length;

  const matched = [];
  const remaining = [];
  for (const p of parsed) {
    if (tsInMonth(p.obj.ts, targetMonth)) matched.push(p);
    else remaining.push(p);
  }

  console.log(
    `[rotate] total=${totalBefore}  matched=${matched.length}  remaining=${remaining.length}`,
  );

  if (matched.length === 0) {
    console.log(`[rotate] 该月无数据，无需归档`);
    return;
  }

  // 1) 写归档文件（追加模式，避免覆盖之前的归档）
  ensureDir(ARCHIVE_DIR);
  const archivePath = path.join(ARCHIVE_DIR, `helix-runs-${targetMonth}.jsonl`);

  // 简单去重：若归档已存在，把已存在的 helix_run_id+type+ts 去掉再追加
  let existing = new Set();
  if (fs.existsSync(archivePath)) {
    try {
      const { parsed: prev } = readJsonlLines(archivePath);
      for (const p of prev) {
        existing.add(`${p.obj.helix_run_id}|${p.obj.type}|${p.obj.ts}`);
      }
    } catch {
      // 老归档损坏就当空集合，不阻断
      existing = new Set();
    }
  }

  const toAppend = matched.filter(
    (p) => !existing.has(`${p.obj.helix_run_id}|${p.obj.type}|${p.obj.ts}`),
  );
  const archiveBody =
    (fs.existsSync(archivePath) && fs.statSync(archivePath).size > 0
      ? ""
      : "") +
    toAppend.map((p) => p.raw).join("\n") +
    (toAppend.length ? "\n" : "");

  fs.appendFileSync(archivePath, archiveBody);

  // 校验归档
  const archiveCount = validateJsonl(archivePath);
  console.log(
    `[rotate] archive wrote ${toAppend.length} new lines → ${archivePath} (total ${archiveCount} lines, validated)`,
  );

  // 2) 主文件先备份
  const bakPath = SRC + ".bak";
  fs.copyFileSync(SRC, bakPath);
  console.log(`[rotate] backup → ${bakPath}`);

  // 3) 写新主文件（只剩 remaining）
  const newBody =
    remaining.map((p) => p.raw).join("\n") + (remaining.length ? "\n" : "");
  fs.writeFileSync(SRC, newBody);

  // 校验新主文件
  const newCount = validateJsonl(SRC);
  console.log(`[rotate] main file rewritten: ${newCount} lines (validated)`);

  console.log(
    `[rotate] DONE  archived=${matched.length}  remaining=${newCount}  backup=${bakPath}`,
  );
}

try {
  main();
} catch (e) {
  console.error(`[rotate] FAILED: ${e.message}`);
  process.exit(1);
}
