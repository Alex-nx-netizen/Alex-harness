#!/usr/bin/env node
// _meta/rotate_check.cjs — 轮转健康检查（不动数据，只检查）
//
// 用法：node _meta/rotate_check.cjs
//
// 行为：
//   - 扫 _meta/*.jsonl 与 skills/*/logs/*.jsonl 体量
//   - 超阈值（默认 100KB）的列出建议命令
//   - 退出码 0 = 无需轮转；1 = 建议轮转（不强制；可用于 hook / refactor-cycle Step 0）
//
// 接 hook（可选）：在 hooks/hooks.json 的 SessionStart 或自定义事件挂这个脚本，
//   stdout 会显示在 Claude 上下文里作为提醒。

"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT = path.join(__dirname, "..");
const THRESHOLD_KB = parseInt(process.env.ROTATE_KB || "100", 10);

function statSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function scanDir(dir, ext) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      found.push(...scanDir(p, ext));
    } else if (e.name.endsWith(ext)) {
      found.push(p);
    }
  }
  return found;
}

function main() {
  const targets = [
    ...scanDir(path.join(PROJECT, "_meta"), ".jsonl"),
    ...scanDir(path.join(PROJECT, "skills"), ".jsonl"),
  ].filter((p) => !p.includes("/archive/")); // 已归档的不算

  const overSize = [];
  for (const t of targets) {
    const sizeKb = Math.round(statSize(t) / 1024);
    if (sizeKb >= THRESHOLD_KB) {
      overSize.push({ path: path.relative(PROJECT, t), sizeKb });
    }
  }

  if (overSize.length === 0) {
    console.log(`[rotate-check] OK · 所有 jsonl < ${THRESHOLD_KB}KB`);
    process.exit(0);
  }

  console.log(`[rotate-check] ⚠️ ${overSize.length} 个 jsonl ≥ ${THRESHOLD_KB}KB：`);
  for (const o of overSize) {
    console.log(`  ${o.path}  ${o.sizeKb}KB`);
  }
  console.log("");
  console.log("建议命令：");
  console.log(`  node _meta/rotate.cjs           # 归档 helix-runs.jsonl 上个月数据`);
  console.log(`  node _meta/rotate.cjs --month 2026-4   # 指定月份`);
  console.log("");
  console.log("（skill 自留 logs 不参与 rotate.cjs；体量大时人工删旧条目）");
  process.exit(1);
}

main();
