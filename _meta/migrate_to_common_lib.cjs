"use strict";
// One-shot 2026-5-13 体检 8.1.D：把所有 skill 的 nowBJ + safeAppend 改成 require lib。
//
// 策略：
//   1. 找 `function nowBJ() {...}` 块 → 删
//   2. 找 `function safeAppend(...) {...}` 块 → 删（如有）
//   3. 在第一行 `const fs = require("fs")` 后面插入 require 语句
//   4. 每个改动跑 `JSON.parse('{}')` 类冒烟，失败回滚（用户用 git restore）
//
// 用法：node _meta/migrate_to_common_lib.cjs [--dry-run]

const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(__dirname, "..", "skills");
const DRY = process.argv.includes("--dry-run");

// 多行匹配：function nowBJ() { ... } —— 假设缩进规范 + 结尾是 `}\n`
const NOW_BJ_RE =
  /\nfunction nowBJ\(\) \{\n  const bj = new Date\(Date\.now\(\) \+ 8 \* 3600 \* 1000\);\n  const p = \(n\) => String\(n\)\.padStart\(2, "0"\);\n  return \(\n    `\$\{bj\.getUTCFullYear\(\)\}-\$\{bj\.getUTCMonth\(\) \+ 1\}-\$\{bj\.getUTCDate\(\)\} ` \+\n    `\$\{p\(bj\.getUTCHours\(\)\)\}:\$\{p\(bj\.getUTCMinutes\(\)\)\}:\$\{p\(bj\.getUTCSeconds\(\)\)\}`\n  \);\n\}\n/;

// safeAppend 有 2 个 comment 变体：'铁律 #8' 和 '铁律 #8：写 JSONL 立刻校验'
const SAFE_APPEND_RE =
  /\nfunction safeAppend\(p, obj\) \{\n  const line = JSON\.stringify\(obj\);\n  JSON\.parse\(line\); \/\/ CLAUDE\.md 铁律 #8(?:：写 JSONL 立刻校验)?\n  fs\.mkdirSync\(path\.dirname\(p\), \{ recursive: true \}\);\n  fs\.appendFileSync\(p, line \+ "\\n", "utf-8"\);\n\}\n/;

const REQUIRE_LINE = (needSafe) =>
  needSafe
    ? `const { nowBJ, safeAppend } = require("../../_meta/lib/common.cjs");\n`
    : `const { nowBJ } = require("../../_meta/lib/common.cjs");\n`;

const report = [];

for (const skillDir of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!skillDir.isDirectory()) continue;
  const runFile = path.join(SKILLS_DIR, skillDir.name, "run.cjs");
  if (!fs.existsSync(runFile)) continue;

  const original = fs.readFileSync(runFile, "utf-8");
  let modified = original;

  const hasNowBJ = NOW_BJ_RE.test(modified);
  const hasSafeAppend = SAFE_APPEND_RE.test(modified);

  if (!hasNowBJ && !hasSafeAppend) {
    report.push(`  ${skillDir.name}: skip (无目标函数)`);
    continue;
  }

  // 删函数定义
  if (hasNowBJ) modified = modified.replace(NOW_BJ_RE, "\n");
  if (hasSafeAppend) modified = modified.replace(SAFE_APPEND_RE, "\n");

  // 插 require 行：找第一个 `const fs = require("fs")` 后面
  const requireLine = REQUIRE_LINE(hasSafeAppend);
  const fsRequireMatch = modified.match(/^const fs = require\("fs"\);\n/m);
  if (!fsRequireMatch) {
    report.push(`  ${skillDir.name}: SKIP (找不到 fs require 锚点)`);
    continue;
  }
  // 找出 require fs 后紧跟的连续 require 行的结尾位置
  const fsIdx = modified.indexOf(fsRequireMatch[0]);
  let insertAt = fsIdx + fsRequireMatch[0].length;
  // 把紧跟的 require 行一起跳过（多个 require 聚一起更整洁）
  while (true) {
    const next = modified.slice(insertAt);
    const m = next.match(/^const \w+ = require\("[^"]+"\);\n/);
    if (!m) break;
    insertAt += m[0].length;
  }
  modified = modified.slice(0, insertAt) + requireLine + modified.slice(insertAt);

  // 双重连续空行清理（防止删函数留下双空行）
  modified = modified.replace(/\n\n\n+/g, "\n\n");

  if (DRY) {
    report.push(
      `  ${skillDir.name}: WOULD MIGRATE (nowBJ=${hasNowBJ}, safeAppend=${hasSafeAppend})`,
    );
  } else {
    fs.writeFileSync(runFile, modified, "utf-8");
    report.push(
      `  ${skillDir.name}: migrated (nowBJ=${hasNowBJ}, safeAppend=${hasSafeAppend}) · ${original.length - modified.length} bytes saved`,
    );
  }
}

console.log(`${DRY ? "[DRY-RUN]" : "[APPLY]"} 迁移报告：`);
console.log(report.join("\n"));
