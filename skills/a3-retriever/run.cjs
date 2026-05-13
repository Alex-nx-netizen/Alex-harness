"use strict";
// a3-retriever/run.cjs — 骨架版
// passes 判定：找到 ≥1 关联文件 → true
// 真正语义检索由 LLM 用 Grep/Glob 完成，本脚本做基础文件名匹配作为提示。

const fs = require("fs");
const path = require("path");
const { nowBJ } = require("../../_meta/lib/common.cjs");
const { spawnSync, execSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a3-retriever";

function quickScan(keywords) {
  const hits = [];
  for (const kw of keywords) {
    if (!kw || kw.length < 2) continue;
    try {
      const out = execSync(
        `git ls-files | grep -i "${kw.replace(/[^a-zA-Z0-9_-]/g, "")}"`,
        {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          cwd: PROJECT_DIR,
        },
      ).trim();
      if (out) hits.push(...out.split("\n").slice(0, 5));
    } catch {}
  }
  return [...new Set(hits)].slice(0, 20);
}

function main() {
  const startMs = Date.now();
  let input = {};
  try {
    input = JSON.parse(process.argv[2] || "{}");
  } catch {}

  const keywords = Array.isArray(input.keywords)
    ? input.keywords
    : input.scope
      ? input.scope.split(/[\s,/]+/).filter(Boolean)
      : [];

  const candidates = keywords.length > 0 ? quickScan(keywords) : [];
  const passes = keywords.length > 0; // 有 keywords 即视为 phase 跑通；语义匹配由 LLM 补

  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `候选文件 ${candidates.length} 条；LLM 按 SKILL.md 做语义筛选`
      : "缺 keywords/scope，无法启动检索",
    output: {
      keywords,
      candidate_files: candidates,
      next_step: passes
        ? "LLM 用 Grep/Glob 做精细检索 + 按相关性排序"
        : "需 a1 提供 scope 或显式 keywords",
    },
    duration_ms: Date.now() - startMs,
    errors: passes ? [] : ["empty_keywords"],
    ts: nowBJ(),
  };

  fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true });
  const line = JSON.stringify({
    ...result,
    user_feedback: { rating: null, fix_notes: null },
  });
  JSON.parse(line);
  fs.appendFileSync(RUNS_LOG, line + "\n", "utf-8");

  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: PROJECT_DIR,
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
