// Phase 5 LOG: append run entry to logs/runs.jsonl + validate all lines
const fs = require("fs");
const path = require("path");

const LOG = path.join(__dirname, "..", "logs", "runs.jsonl");

const entry = {
  run_id: "2026-4-29-meta-kim",
  timestamp: "2026-4-29 10:12:40",
  input: {
    source_type: "url",
    source_summary:
      "https://github.com/KimYx0207/Meta_Kim — 老金'元'方法论开源落地项目；M1.5 第 2 次跑（M1.2 重启，4-28 GFW 阻塞已解除）",
    intent: "学习",
    target_doc_id_provided: false,
  },
  decision: {
    mode: "CREATE_NEW",
    search_results_count: 2,
    search_top_score: null,
    update_mode: null,
    user_confirmed: true,
    plan_question_count: 0,
    user_choices: { plan_choice: "A (按推荐方案直接执行)" },
  },
  output: {
    doc_url: "https://www.feishu.cn/wiki/NBNLwMjOziZHOtkyYb2ch91tnug",
    doc_token: "CvoddVmcDo2wyOxlm5tcq6DhnzW",
    title: '[AI学习] Meta_Kim — 老金"元"方法论的开源工程落地',
    char_count: 15016,
    sections: [
      "阅读地图",
      "TL;DR",
      "核心概念速查表",
      "§1 八阶段隐藏骨架",
      "§2 十张动态发牌",
      "§3 协议+门",
      "§4 三层记忆",
      "§5 八个 Meta Agent",
      "§6 跨平台映射",
      "§7 与 Harness 三部曲对照",
      "§8 安装与命令",
      "§9 我的批注 (placeholder)",
      "来源",
    ],
    chunks_appended: 2,
    chunks_total: 3,
  },
  duration_ms: null,
  errors: [
    "create_parser_bug_doc_id_path_missed: 初次 meta_kim_create.cjs 只解析 j.objToken/token/docToken，未读 j.data.doc_id，触发 FATAL exit；recovery 脚本 v2 重新切分源文件并 append 成功；候选 F-009",
  ],
  learnings: [
    "lark-cli docs +create 成功响应 JSON 路径是 j.data.doc_id + j.data.doc_url（不是顶层 objToken）",
    "lark-cli docs +update --mode append 直接吃 doc_id 作为 --doc 参数（不必转 wiki_url）",
    "正确套路：所有 chunks 先全部落盘再 create，避免脚本中途 fail 后 chunks 1+ 丢失（这次 recovery 通过重读源文件重切补救成功）",
    "15K JS 字符的中文 markdown，6K 上限切出 3 chunk",
  ],
  user_feedback: { rating: null, fix_notes: null },
};

// Validate the entry can stringify and re-parse
const line = JSON.stringify(entry);
const parsed = JSON.parse(line);
if (parsed.run_id !== entry.run_id) {
  console.error("[FATAL] roundtrip mismatch");
  process.exit(1);
}

// Append to runs.jsonl
fs.appendFileSync(LOG, line + "\n", "utf-8");

// Validate every line in the file (per CLAUDE.md F-008)
const all = fs.readFileSync(LOG, "utf-8").split("\n").filter(Boolean);
let bad = 0;
all.forEach((l, i) => {
  try {
    JSON.parse(l);
  } catch (e) {
    bad++;
    console.error(`[ERR] line ${i + 1}:`, e.message);
    console.error(`  content: ${l.slice(0, 100)}`);
  }
});
if (bad > 0) {
  console.error(`[FATAL] ${bad} bad lines`);
  process.exit(2);
}

console.log(`[OK] runs.jsonl now has ${all.length} lines, all valid JSON`);
console.log(`     L${all.length} = ${entry.run_id}`);
