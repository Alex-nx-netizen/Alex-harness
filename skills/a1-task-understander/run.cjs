"use strict";
// a1-task-understander/run.cjs — 骨架版（接 input → passes 判定 → 自留底 + 上报 helix）
// 真正智能（生成 TaskCard）由 LLM 按 SKILL.md 完成；本脚本是"汇报通道"。

const fs = require("fs");
const path = require("path");
const { nowBJ } = require("../../_meta/lib/common.cjs");
const { spawnSync } = require("child_process");

const SKILL_DIR = __dirname;
const PROJECT_DIR = process.cwd();
const HELIX_RUN = path.join(PROJECT_DIR, "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a1-task-understander";

function main() {
  const startMs = Date.now();
  let input = {};
  try {
    input = JSON.parse(process.argv[2] || "{}");
  } catch {
    input = { task: process.argv.slice(2).join(" ") };
  }

  const taskDesc = (input.task || input.description || "").trim();
  const passes = taskDesc.length > 0;

  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `任务描述已接收（${taskDesc.length} 字），等 LLM 按 SKILL.md §1-§2 生成 TaskCard`
      : "缺任务描述，无法生成 TaskCard",
    output: {
      task_received: taskDesc,
      next_step: passes
        ? "LLM 按 a1-task-understander/SKILL.md §1-§2 输出 TaskCard JSON"
        : "需用户补充任务描述",
    },
    duration_ms: Date.now() - startMs,
    errors: passes ? [] : ["empty_task_description"],
    ts: nowBJ(),
  };

  // 1) 自留底（evolution-tracker 消费源）
  fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true });
  const line = JSON.stringify({
    ...result,
    user_feedback: { rating: null, fix_notes: null },
  });
  JSON.parse(line);
  fs.appendFileSync(RUNS_LOG, line + "\n", "utf-8");

  // 2) 上报 helix（领导汇报）
  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: PROJECT_DIR,
    });
  }

  // 3) stdout 给 LLM
  console.log(JSON.stringify(result, null, 2));
}

main();
