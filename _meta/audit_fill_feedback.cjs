"use strict";
// One-shot 2026-5-13 体检 8.1.C：给 14 条 logs/runs.jsonl 加 audit 标注。
//
// 设计：不伪造 rating；用 fix_notes 写诚实的"这是什么类型的 run"标签 +
// bootstrap_status 字段（smoke_test / bootstrap_test / real_run_likely / unknown）。
// 让 evolution-tracker 后续读取时知道哪些是真实输入。
//
// 用法：node _meta/audit_fill_feedback.cjs

const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(__dirname, "..", "skills");

// 每条 entry 的分类规则（基于内容签名）
function classify(entry, skill) {
  const summary = (entry.summary || "").toLowerCase();
  const taskSnippet = (entry.task_snippet || "").toLowerCase();
  const errors = Array.isArray(entry.errors) ? entry.errors : [];

  if (errors.includes("invalid_input_json") || errors.includes("dimensions_missing")) {
    return {
      status: "smoke_test",
      note: "[2026-5-13 audit] schema 错误冒烟（验证脚本兜底路径），非真实用户任务",
    };
  }
  if (skill === "code-simplifier" && entry.ts && entry.ts.startsWith("2026-5-13")) {
    return {
      status: "bootstrap_test",
      note: "[2026-5-13 audit] 项目 v0.8.1 落地时的 3 场景冒烟（本人执行），非用户真实任务",
    };
  }
  if (skill === "code-review" && entry.ts && entry.ts.startsWith("2026-5-11")) {
    return {
      status: "bootstrap_test",
      note: "[2026-5-13 audit] v0.7.2 code-review 落地冒烟，非用户真实任务",
    };
  }
  if (skill === "a4-planner" && entry.ts && entry.ts.startsWith("2026-5-11")) {
    return {
      status: "bootstrap_test",
      note: "[2026-5-13 audit] v0.7.2 a4 端到端冒烟（TaskCard add auth），非用户真实任务",
    };
  }
  if (skill === "a2-repo-sensor" && entry.ts && entry.ts.startsWith("2026-5-12")) {
    return {
      status: "bootstrap_test",
      note: "[2026-5-13 audit] v0.8.0 落地时扫项目自身（未知栈/32 脏文件），非用户真实任务",
    };
  }
  if (skill === "context-curator" && entry.timestamp && entry.timestamp.startsWith("2026-5-12")) {
    return {
      status: "bootstrap_test",
      note: "[2026-5-13 audit] v0.8.0 落地时跑的 context snapshot（自我扫描），非用户真实任务",
    };
  }
  if (skill === "mode-router" && taskSnippet) {
    return {
      status: "bootstrap_test",
      note: "[2026-5-13 audit] mode-router fixture（如 \"前端+后端 重构 OAuth\"），dogfood 测试用例非用户真实任务",
    };
  }
  return {
    status: "unknown",
    note: "[2026-5-13 audit] 无法判定来源；rating 留 null 等用户复盘",
  };
}

let totalEntries = 0;
let modifiedEntries = 0;
const report = [];

for (const skillDir of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!skillDir.isDirectory()) continue;
  const logFile = path.join(SKILLS_DIR, skillDir.name, "logs", "runs.jsonl");
  if (!fs.existsSync(logFile)) continue;

  const original = fs.readFileSync(logFile, "utf-8");
  const lines = original.split("\n").filter(Boolean);
  const updated = [];

  for (const line of lines) {
    totalEntries += 1;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      throw new Error(`PARSE FAIL in ${logFile}: ${e.message}`);
    }

    // 确保 user_feedback 字段存在
    if (!entry.user_feedback || typeof entry.user_feedback !== "object") {
      entry.user_feedback = { rating: null, fix_notes: null };
    }

    // 只填还没填过的（保留任何手动填的）
    if (entry.user_feedback.rating == null && entry.user_feedback.fix_notes == null) {
      const c = classify(entry, skillDir.name);
      entry.user_feedback.fix_notes = c.note;
      entry.user_feedback.bootstrap_status = c.status;
      modifiedEntries += 1;
      report.push(`  ${skillDir.name} → ${c.status}`);
    }
    updated.push(JSON.stringify(entry));
  }

  // 写回 + 立刻校验（铁律 #8）
  const out = updated.join("\n") + "\n";
  fs.writeFileSync(logFile, out, "utf-8");
  // 验证每行可 parse
  for (const [i, l] of out.split("\n").filter(Boolean).entries()) {
    try {
      JSON.parse(l);
    } catch (e) {
      throw new Error(`POST-WRITE VALIDATE FAIL ${logFile} row ${i + 1}: ${e.message}`);
    }
  }
}

console.log(`✅ 已审计 ${totalEntries} 条 entry，修改 ${modifiedEntries} 条 user_feedback`);
console.log(`   保留 ${totalEntries - modifiedEntries} 条（已有手动填的，未覆盖）`);
console.log("");
console.log("逐条分类：");
console.log(report.join("\n"));
