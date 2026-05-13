"use strict";
// _meta/lib/common.cjs — 项目级 skill 共享工具
//
// 由 2026-5-13 体检 8.1.D 抽取（原本 14 处 nowBJ + 6 处 safeAppend 重复定义）。
// 任何 skill 的 run.cjs 都可以 `require("../../_meta/lib/common.cjs")`。
//
// 设计约束：
//   - 只放真正"被多 skill 字节级重复"的函数；不放业务逻辑
//   - 不引入新依赖；只用 Node 内置
//   - 改这里前，必须先在所有依赖 skill 跑一遍冒烟（_meta/audit_fill_feedback.cjs 不算）
//   - 任何新加 API 必须在 SKILL.md 或 CLAUDE.md 留一笔（铁律 #3）

const fs = require("fs");
const path = require("path");

/**
 * 北京时间 `YYYY-M-D HH:MM:SS`（无前导 0 月/日，HH/MM/SS 有 0 pad）
 * 符合 CLAUDE.md 工作约定 §7。
 */
function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

/**
 * 写一行 JSON 到文件，写前先 `JSON.parse(line)` 自校验（CLAUDE.md 铁律 #8）。
 * 自动 mkdir -p 父目录。
 */
function safeAppend(p, obj) {
  const line = JSON.stringify(obj);
  JSON.parse(line); // CLAUDE.md 铁律 #8：写 JSONL 立刻校验
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, line + "\n", "utf-8");
}

module.exports = { nowBJ, safeAppend };
