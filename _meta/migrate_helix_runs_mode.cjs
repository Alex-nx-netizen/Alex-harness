"use strict";
// _meta/migrate_helix_runs_mode.cjs — 一次性 schema 迁移
//
// 背景：2026-5-14 体检发现 helix-runs.jsonl 27 finalize 里 24 条 mode=undefined（v0.9 前格式）。
// evolution-tracker 按 mode 分桶分析时这 24 条直接被 '?' 桶吞掉，看不到真实历史。
//
// 行为：
//   - 只动 type=finalize 且 mode 字段缺失的行
//   - 注入 mode=legacy_pre_v0.9
//   - 写后逐行 JSON.parse 校验（CLAUDE.md 铁律 #8）
//   - dry-run 默认；--apply 才真改
//   - 自动 .bak 备份
//
// Usage:
//   node _meta/migrate_helix_runs_mode.cjs           # dry-run
//   node _meta/migrate_helix_runs_mode.cjs --apply   # 真改

const fs = require("fs");
const path = require("path");

const HELIX_RUNS = path.join(__dirname, "helix-runs.jsonl");
const apply = process.argv.includes("--apply");

if (!fs.existsSync(HELIX_RUNS)) {
  console.error("[migrate] helix-runs.jsonl missing:", HELIX_RUNS);
  process.exit(1);
}

// BOM 处理：v0.8.1 F-026 已修，但兜底再去一次
const raw = fs.readFileSync(HELIX_RUNS, "utf-8").replace(/^﻿/, "");
const lines = raw.split("\n");
let migrated = 0;
let skipped = 0;
let invalid = 0;
const out = [];

for (const ln of lines) {
  if (!ln.trim()) {
    out.push(ln);
    continue;
  }
  let obj;
  try {
    obj = JSON.parse(ln);
  } catch {
    invalid++;
    out.push(ln);
    continue;
  }
  if (obj.type === "finalize" && (obj.mode === undefined || obj.mode === null)) {
    obj.mode = "legacy_pre_v0.9";
    obj._migrated_from = "mode_field_missing";
    migrated++;
    out.push(JSON.stringify(obj));
  } else {
    skipped++;
    out.push(ln);
  }
}

console.log(`[migrate] finalize 行迁移: ${migrated}`);
console.log(`[migrate] 跳过（无需迁移）: ${skipped}`);
console.log(`[migrate] JSON 损坏行: ${invalid}`);

if (!apply) {
  console.log("[migrate] dry-run（用 --apply 真改）");
  process.exit(0);
}

if (migrated === 0) {
  console.log("[migrate] 无需迁移，退出");
  process.exit(0);
}

// 备份
const bak = HELIX_RUNS + ".bak-" + Date.now();
fs.copyFileSync(HELIX_RUNS, bak);
console.log(`[migrate] 备份到: ${bak}`);

// 写
fs.writeFileSync(HELIX_RUNS, out.join("\n"), "utf-8");

// 写后逐行 JSON.parse 校验（铁律 #8）
const verifyLines = fs.readFileSync(HELIX_RUNS, "utf-8").split("\n").filter(Boolean);
let parseErr = 0;
for (let i = 0; i < verifyLines.length; i++) {
  try {
    JSON.parse(verifyLines[i]);
  } catch (e) {
    parseErr++;
    console.error(`[migrate] L${i + 1} JSON.parse fail: ${e.message}`);
  }
}
if (parseErr > 0) {
  console.error(`[migrate] ❌ ${parseErr} 行解析失败，回滚`);
  fs.copyFileSync(bak, HELIX_RUNS);
  process.exit(2);
}
console.log(`[migrate] ✅ 全 ${verifyLines.length} 行 JSON.parse 通过`);
console.log(`[migrate] ✅ 迁移完成: ${migrated} 条 finalize 标记为 mode=legacy_pre_v0.9`);
