"use strict";
// v0.8 #8: 给 15 SKILL.md 加 Anthropic Skills spec 对齐字段（idempotent，已存在不重复加）
// 字段：harness_role / model_recommendation / runs_in / tools_required / alex_harness_v08
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");

const MAP = {
  "helix": { harness_role: "orchestrator", model_recommendation: "opus", runs_in: ["main"], tools_required: ["Bash", "Read", "Edit", "Write"] },
  "a1-task-understander": { harness_role: "business_meta", model_recommendation: "sonnet", runs_in: ["main"], tools_required: ["Bash", "Read"] },
  "a2-repo-sensor": { harness_role: "business_meta", model_recommendation: "sonnet", runs_in: ["main"], tools_required: ["Bash", "Read", "Glob", "Grep"] },
  "a3-retriever": { harness_role: "business_meta", model_recommendation: "haiku", runs_in: ["main"], tools_required: ["Bash", "Grep", "Glob"], deprecated: "v0.8 (#11): scope 已明确时跳过；保留备用" },
  "a4-planner": { harness_role: "business_meta", model_recommendation: "opus", runs_in: ["main"], tools_required: ["Bash", "Read"] },
  "a5-executor": { harness_role: "business_meta", model_recommendation: "sonnet", runs_in: ["main", "subagent"], tools_required: ["Bash", "Read", "Edit", "Write"] },
  "a6-validator": { harness_role: "business_meta", model_recommendation: "haiku", runs_in: ["main"], tools_required: ["Bash"] },
  "a7-explainer": { harness_role: "business_meta", model_recommendation: "haiku", runs_in: ["main"], tools_required: ["Bash", "Read"] },
  "a8-risk-guard": { harness_role: "guard", model_recommendation: "opus", runs_in: ["main"], tools_required: ["Bash"] },
  "code-review": { harness_role: "quality_gate", model_recommendation: "sonnet", runs_in: ["subagent"], tools_required: ["Read", "Grep", "Glob", "Bash"] },
  "meta-audit": { harness_role: "quality_gate", model_recommendation: "opus", runs_in: ["subagent"], tools_required: ["Read", "Grep", "Bash"] },
  "context-curator": { harness_role: "governance_meta", model_recommendation: "sonnet", runs_in: ["main"], tools_required: ["Read", "Bash"] },
  "evolution-tracker": { harness_role: "governance_meta", model_recommendation: "sonnet", runs_in: ["main"], tools_required: ["Read", "Bash", "Write"] },
  "knowledge-curator": { harness_role: "governance_meta", model_recommendation: "sonnet", runs_in: ["main"], tools_required: ["Bash", "Read"] },
  "mode-router": { harness_role: "governance_meta", model_recommendation: "haiku", runs_in: ["main"], tools_required: ["Bash"] },
  "session-reporter": { harness_role: "governance_meta", model_recommendation: "haiku", runs_in: ["main"], tools_required: ["Bash"] },
};

const HARNESS_KEY = "alex_harness_v08";
const MARKER_LINE = `${HARNESS_KEY}: true`;

function patchSkill(skillName, meta) {
  const file = path.join(SKILLS_DIR, skillName, "SKILL.md");
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${skillName} — no SKILL.md`);
    return false;
  }
  const orig = fs.readFileSync(file, "utf-8");
  if (orig.includes(MARKER_LINE)) {
    console.log(`OK ${skillName} — already patched`);
    return false;
  }
  // 找开头 `---\n` 和后续 `---\n` 之间的 frontmatter 区
  const lines = orig.split("\n");
  if (lines[0] !== "---") {
    console.log(`SKIP ${skillName} — no frontmatter`);
    return false;
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) {
    console.log(`SKIP ${skillName} — frontmatter not closed`);
    return false;
  }
  // 在 endIdx 之前插入新字段
  const insertion = [
    `${HARNESS_KEY}: true`,
    `harness_role: ${meta.harness_role}`,
    `model_recommendation: ${meta.model_recommendation}`,
    `runs_in: [${meta.runs_in.map((s) => `"${s}"`).join(", ")}]`,
    `tools_required: [${meta.tools_required.map((s) => `"${s}"`).join(", ")}]`,
  ];
  if (meta.deprecated) {
    insertion.push(`deprecated: "${meta.deprecated}"`);
  }
  const newLines = [
    ...lines.slice(0, endIdx),
    ...insertion,
    ...lines.slice(endIdx),
  ];
  fs.writeFileSync(file, newLines.join("\n"), "utf-8");
  console.log(`PATCHED ${skillName}`);
  return true;
}

let n = 0;
for (const [name, meta] of Object.entries(MAP)) {
  if (patchSkill(name, meta)) n++;
}
console.log(`---\nDone: ${n} files patched.`);
