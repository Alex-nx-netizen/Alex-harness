"use strict";
// promote_soul.cjs — 把议案池中高频已通过的议案沉淀到 _meta/SOUL.md
// 论文 Organizational Mirroring §6③ 简化版（不做完整 SOUL 系统，只做规则沉淀）
//
// 算法：
//   1. 读 skill-proposals/_index.jsonl
//   2. 过滤 status=approved
//   3. 按 direction 聚合，统计每个 direction 的"引用次数"
//      - 引用次数 = 议案池中同 direction 的 approved 议案数（最直接的"高频"信号）
//   4. 选 ≥ minRefs 的 direction（默认 3）
//   5. 对每条候选，取该 direction 中最早 approved 的议案作为「来源议案」
//   6. 读 _meta/SOUL.md，按 source_proposal_id 去重
//   7. 写一行：- [auto-YYYY-M-D-NNN] (P-...) <规则文本>
//   8. 默认 dry-run；--apply 才真写

const fs = require("fs");
const path = require("path");

const SELF_DIR = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(SELF_DIR, "..", "..");
const INDEX_PATH = path.join(
  SELF_DIR,
  "references",
  "skill-proposals",
  "_index.jsonl",
);
const PROPOSALS_DIR = path.join(SELF_DIR, "references", "skill-proposals");
const SOUL_PATH = path.join(PROJECT_ROOT, "_meta", "SOUL.md");

function bjToday() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      out.push(JSON.parse(lines[i]));
    } catch (e) {
      throw new Error(
        `[promote-soul] _index.jsonl line ${i + 1} parse error: ${e.message}`,
      );
    }
  }
  return out;
}

// 读取 SOUL.md，返回已存在的 source_proposal_id 集合（去重锚点）
function readExistingSoulIds() {
  if (!fs.existsSync(SOUL_PATH)) {
    return new Set();
  }
  const content = fs.readFileSync(SOUL_PATH, "utf-8");
  // 行格式：- [auto-YYYY-M-D-NNN] (P-2026-4-30-001) <文本>
  const re = /^\s*-\s+\[auto-[^\]]+\]\s+\((P-[^\)]+)\)/gm;
  const ids = new Set();
  let m;
  while ((m = re.exec(content)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

// 截一个简短的规则文本（≤120 字）。优先用 nl_summary 第一句。
function ruleTextFrom(proposal) {
  const nl = String(proposal.nl_summary || "").trim();
  if (!nl) return `(direction=${proposal.direction})`;
  // first sentence by Chinese 。/！/？ or 换行；不在 . 处切（避开 .md 误切）
  const m = nl.match(/^([^。！？\n]+)[。！？\n]?/);
  let text = m ? m[1].trim() : nl;
  if (text.length > 120) text = text.slice(0, 117) + "...";
  return text;
}

function nextRuleId(existingLines, today) {
  // existingLines: 同 today 的 auto rule_id 已存在数量
  let n = 1;
  // count by parsing lines
  if (!fs.existsSync(SOUL_PATH)) return `auto-${today}-001`;
  const content = fs.readFileSync(SOUL_PATH, "utf-8");
  const re = new RegExp(
    `^\\s*-\\s+\\[auto-${today.replace(/-/g, "\\-")}-(\\d+)\\]`,
    "gm",
  );
  const seen = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    seen.push(parseInt(m[1], 10));
  }
  if (seen.length > 0) n = Math.max(...seen) + 1;
  // include in-batch count too
  n += existingLines.filter((l) => /\[auto-/.test(l)).length;
  return `auto-${today}-${String(n).padStart(3, "0")}`;
}

function promoteToSoul({ apply = false, minRefs = 3 } = {}) {
  const all = readJsonl(INDEX_PATH);
  const approved = all.filter((p) => p.status === "approved");

  // 聚合 direction 引用次数
  const byDir = new Map();
  for (const p of approved) {
    const dir = p.direction || "unknown";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(p);
  }

  // 选高频
  const highFreq = [];
  for (const [dir, list] of byDir.entries()) {
    if (list.length >= minRefs) {
      // 取最早 approved 的议案做来源（按 decided_at 升序，缺失则 created_at）
      const sorted = list.slice().sort((a, b) => {
        const ta = a.decided_at || a.created_at || "";
        const tb = b.decided_at || b.created_at || "";
        return ta.localeCompare(tb);
      });
      highFreq.push({
        direction: dir,
        count: list.length,
        source: sorted[0],
        all_proposal_ids: list.map((p) => p.proposal_id),
      });
    }
  }

  // 去重
  const existingIds = readExistingSoulIds();
  const today = bjToday();
  const newRules = [];
  const alreadyIn = [];
  const linesToAppend = [];

  for (const cand of highFreq) {
    if (existingIds.has(cand.source.proposal_id)) {
      alreadyIn.push(cand.source.proposal_id);
      continue;
    }
    const ruleId = nextRuleId(linesToAppend, today);
    const text = ruleTextFrom(cand.source);
    const line = `- [${ruleId}] (${cand.source.proposal_id}) ${text}  _<refs=${cand.count}, direction=${cand.direction}>_`;
    linesToAppend.push(line);
    newRules.push({
      rule_id: ruleId,
      source_proposal_id: cand.source.proposal_id,
      direction: cand.direction,
      refs: cand.count,
      line,
    });
  }

  // 真正写入
  if (apply && linesToAppend.length > 0) {
    if (!fs.existsSync(SOUL_PATH)) {
      throw new Error(
        `[promote-soul] SOUL.md 不存在：${SOUL_PATH}（请先创建骨架文件）`,
      );
    }
    const original = fs.readFileSync(SOUL_PATH, "utf-8");
    // 在末尾追加（不破坏 markdown 结构；SOUL.md 末尾有占位 "（初始为空，由 evolution-tracker 自动追加）"）
    const sep = original.endsWith("\n") ? "" : "\n";
    const append = sep + "\n" + linesToAppend.join("\n") + "\n";
    fs.writeFileSync(SOUL_PATH, original + append, "utf-8");
  }

  return {
    scanned: all.length,
    approved: approved.length,
    highFreq,
    alreadyIn,
    newRules,
    soulPath: SOUL_PATH,
    indexPath: INDEX_PATH,
  };
}

module.exports = { promoteToSoul };
