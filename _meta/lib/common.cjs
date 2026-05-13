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

/**
 * 去 UTF-8 BOM（F-026 防御）。任何 fs.readFileSync(...,'utf-8') 后该过一遍。
 */
function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * 安全读取 jsonl：strip BOM + 按 /\r?\n/ split（F-023 CRLF 防御）+ filter 空行。
 * 返回解析后对象数组；遇 parse 错抛带行号的异常，调用者必须捕获。
 */
function safeReadJsonl(filePath) {
  const fs = require("fs");
  const raw = stripBom(fs.readFileSync(filePath, "utf-8"));
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`safeReadJsonl ${filePath} row ${idx + 1}: ${e.message}`);
    }
  });
}

/**
 * 输出 skill 结果：TTY → 人类友好摘要；管道 → 原 JSON（行为安全保护）。
 *
 * 收益：人手跑 `node skills/xxx/run.cjs ...` 不再翻 20 行 JSON；
 *      helix 通过 spawnSync 调用时 stdout 非 TTY，自动走 JSON 路径，
 *      pipeline 行为 100% 不变。
 *
 * @param {object} result 标准 phase result（含 phase / passes / summary / output / errors）
 * @param {object} [opts]
 * @param {boolean} [opts.force] 强制 pretty 模式（如调试）
 * @param {boolean} [opts.hint=true] 是否打印"查看完整结果"提示
 */
function printResult(result, opts = {}) {
  const force = opts.force === true;
  const isTTY = process.stdout.isTTY === true || force;
  if (!isTTY) {
    // pipeline / 重定向 / spawnSync — 原 JSON 输出（不改行为）
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  // 终端 — 紧凑摘要
  const softFail = !!(result.output && result.output.soft_fail);
  const hasRec = !!(result.output && result.output.has_recommendations);
  let icon;
  if (softFail) icon = "⚠️ ";
  else if (result.passes === true) icon = hasRec ? "🟡" : "✅";
  else if (result.passes === false) icon = "❌";
  else icon = "📋";

  const head = result.phase ? `${icon} ${result.phase}` : icon;
  const summary = result.summary || "";
  console.log(`${head}  ${summary}`);

  const next = result.output && result.output.suggested_next;
  if (next) console.log(`   → ${next}`);

  if (Array.isArray(result.errors) && result.errors.length) {
    console.log(`   ! errors: ${result.errors.join(", ")}`);
  }

  const nextStep = result.output && result.output.next_step;
  if (nextStep && result.passes === false) {
    // schema fail / 输入错时给一句可执行提示
    console.log(`   ℹ ${nextStep}`);
  }

  if (opts.hint !== false) {
    console.log(`   (full JSON: pipe stdout, or check logs/runs.jsonl)`);
  }
}

module.exports = { nowBJ, safeAppend, stripBom, safeReadJsonl, printResult };
