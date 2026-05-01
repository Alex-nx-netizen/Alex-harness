// Phase 2: ANALYZE
// 跨 run 找共性 → 关键词聚类成 direction → 关联 findings → 检查黑名单
const fs = require("fs");
const path = require("path");
const C = require("./common.cjs");

// Direction 关键词映射（明示规则，不用 ML）
// 每条 direction = 一个聚类锚点；用户加 fix_notes 出现新 pattern 时手动加这里
const DIRECTION_RULES = [
  {
    direction: "phase4_robustness",
    keywords: [
      /Phase\s*4/i,
      /解析失败/,
      /data\.doc_id/,
      /parser/i,
      /chunks?\s*(?:没|落盘|丢失|fail)/,
      /JSON\.?parse/i,
      /校验/,
      /验证(?!元)/,
      /写后/,
      /写入后/,
    ],
    category: "鲁棒性缺口",
    finding_filter: ["F-008", "F-010", "F-011"],
  },
  {
    direction: "phase7_push",
    keywords: [
      /Phase\s*7/i,
      /PUSH/i,
      /直推/,
      /飞书\s*IM/,
      /发到我的飞书/,
      /给.*链接/,
      /im\s*\+messages-send/i,
    ],
    category: "工作流缺口",
    finding_filter: ["F-012"],
  },
  {
    direction: "self_evolution",
    keywords: [/不会自我进化/, /自我进化/, /不会自我/, /治理元缺失/, /B1/],
    category: "元元（不在本 skill 范围）",
    finding_filter: [],
    out_of_scope_reason:
      'L2 fix_notes 这类映射到治理元自身（蓝图 §3.B1），即 evolution-tracker 本身。subject skill 不该改自己来"自我进化"——它的答案是被 evolution-tracker 复盘。',
  },
  {
    direction: "chunk_size_limit",
    keywords: [
      /shell.*大小/,
      /argv.*限制/,
      /E2BIG/,
      /chunked/i,
      /chunk\s*大小/,
    ],
    category: "已有 workaround",
    finding_filter: ["F-001", "F-004"],
    skip_reason: "F-001 + F-004 已识别且已落 workaround，无新议案需要",
  },
  // 2026-4-30 加（context-curator dogfooding 暴露 + P-2026-4-30-002 B 落地的真正实现）
  {
    direction: "curator_truncate_aggressive",
    keywords: [
      /truncate.*(?:太激|过激|激进)/,
      /阶梯.*(?:太激|过激|激进)/,
      /compact_mode/,
      /压成\s*count/,
      /看不到\s*(?:任何|具体|内容|进度|entries)/,
      /假阳性/,
      /平滑\s*曲线/,
      /先削细节/,
    ],
    category: "上下文聚合鲁棒性",
    finding_filter: [], // 暂无 finding；等用户反复触发再固化
  },
  {
    direction: "curator_diff_falsepositive",
    keywords: [
      /diff.*(?:假阳性|误报)/,
      /prev_ids.*(?:残缺|不到一半|被截)/,
      /都是新的/,
      /全是新的/,
    ],
    category: "上下文聚合鲁棒性",
    finding_filter: [],
  },
];

function matchDirection(text) {
  if (!text) return null;
  for (const rule of DIRECTION_RULES) {
    for (const re of rule.keywords) {
      if (re.test(text)) return rule;
    }
  }
  return null; // uncategorized
}

function analyze(p1result) {
  const result = {
    subject_skill: p1result.subject_skill,
    valid_run_count: p1result.valid_run_count,
    clusters: {}, // direction → { evidence_runs[], evidence_findings[], evidence_quotes[], rule, blacklist_status }
    uncategorized: [], // pieces that didn't match any direction
    skipped_blacklisted: [], // direction with reject_count_same_direction >= 3
    skipped_workaround: [], // direction marked skip_reason
    skipped_already_approved: [], // F-014: direction has prior approved proposal in _index.jsonl
    skipped_already_out_of_scope: [], // F-014 extended: direction has prior out_of_scope proposal
    existing_index: [], // surface to phase3 for proposal_id collision avoidance (F-015)
    progress_entries_count: (p1result.progress_entries || []).length, // P-001 stats
  };

  // 读现有 _index.jsonl 算 reject_count_same_direction
  const indexPath = path.join(
    C.subjectSkillPath(p1result.subject_skill),
    "references",
    "skill-proposals",
    "_index.jsonl",
  );
  let existingIndex = [];
  if (fs.existsSync(indexPath)) {
    try {
      existingIndex = C.readJsonl(indexPath);
    } catch (e) {
      // index 损坏不阻塞分析；只是没有黑名单数据
      result.index_parse_error = e.message;
    }
  }
  result.existing_index = existingIndex; // F-015: phase3 needs to compute max idx for non-colliding ID
  const rejectCountByDir = {};
  const approvedCountByDir = {}; // F-014
  const outOfScopeCountByDir = {}; // F-014 extended
  for (const entry of existingIndex) {
    if (!entry.direction) continue;
    if (entry.status && entry.status.startsWith("rejected")) {
      rejectCountByDir[entry.direction] =
        (rejectCountByDir[entry.direction] || 0) + 1;
    }
    if (entry.status === "approved") {
      approvedCountByDir[entry.direction] =
        (approvedCountByDir[entry.direction] || 0) + 1;
    }
    if (entry.status === "out_of_scope") {
      outOfScopeCountByDir[entry.direction] =
        (outOfScopeCountByDir[entry.direction] || 0) + 1;
    }
  }

  // 扫每条 valid run，把 fix_notes / errors 拆条聚类
  for (const run of p1result.valid_runs) {
    const fxNotes = (run.user_feedback && run.user_feedback.fix_notes) || "";
    const errs = run.errors || [];

    // fix_notes 整体作为一段（NL 内不再细切——保持上下文）
    if (fxNotes) {
      const rule = matchDirection(fxNotes);
      addEvidence(result, rule, run, "fix_notes", fxNotes.slice(0, 200));
    }
    // errors 每一条单独聚类（更精细）
    for (const e of errs) {
      const rule = matchDirection(e);
      addEvidence(result, rule, run, "errors", e.slice(0, 200));
    }
  }

  // P-2026-4-30-001: 消费 progress.md entries（第三证据流）
  for (const entry of p1result.progress_entries || []) {
    const rule = matchDirection(entry.text);
    addProgressEvidence(result, rule, entry);
  }

  // 标记 progress_md_only：仅有 progress.md 证据、无 run-based 证据的 cluster
  for (const dir of Object.keys(result.clusters)) {
    const cluster = result.clusters[dir];
    if (cluster.evidence_runs.length === 0) {
      cluster.progress_md_only = true;
    }
  }

  // 关联 findings：每个 cluster 用 rule.finding_filter 直接关联（明示映射，不靠语义猜）
  for (const dir of Object.keys(result.clusters)) {
    const cluster = result.clusters[dir];
    const rule = cluster.rule;
    if (rule && rule.finding_filter) {
      const findingsPresent = rule.finding_filter.filter((fid) =>
        p1result.findings.find((f) => f.id === fid),
      );
      cluster.evidence_findings = findingsPresent;
    }
  }

  // skip 状态机处理（优先级：approved > out_of_scope > blacklisted > workaround > active）
  // F-014：approved/out_of_scope 已决策的 direction 不再重提
  for (const dir of Object.keys(result.clusters)) {
    const cluster = result.clusters[dir];
    const rejectCount = rejectCountByDir[dir] || 0;
    const approvedCount = approvedCountByDir[dir] || 0;
    const outOfScopeCount = outOfScopeCountByDir[dir] || 0;
    cluster.reject_count_same_direction = rejectCount;
    cluster.approved_count_same_direction = approvedCount;
    cluster.out_of_scope_count_same_direction = outOfScopeCount;

    // F-014: 已 approved → 已落地，不再重提（除非 subject 版本超过 applied_to_skill_version；KISS 暂不做版本比对）
    if (approvedCount >= 1) {
      cluster.blacklist_status = "skip_already_approved";
      result.skipped_already_approved.push({
        direction: dir,
        approved_count: approvedCount,
      });
      continue; // 优先级最高，其他 skip 不再叠加
    }

    // F-014 扩展: 已 out_of_scope → 已决策不在范围内，不再重提
    if (outOfScopeCount >= 1) {
      cluster.blacklist_status = "skip_already_out_of_scope";
      result.skipped_already_out_of_scope.push({
        direction: dir,
        out_of_scope_count: outOfScopeCount,
      });
      continue;
    }

    if (rejectCount >= 3) {
      cluster.blacklist_status = "blacklisted";
      result.skipped_blacklisted.push({
        direction: dir,
        reject_count: rejectCount,
      });
    }
    if (cluster.rule && cluster.rule.skip_reason) {
      cluster.blacklist_status = "skipped_workaround";
      result.skipped_workaround.push({
        direction: dir,
        reason: cluster.rule.skip_reason,
      });
    }
  }

  return result;
}

// P-001: progress.md 证据（无 run_id；source 标 "progress_md"）
function addProgressEvidence(result, rule, entry) {
  const quote = entry.text.slice(0, 200);
  if (!rule) {
    result.uncategorized.push({
      run_id: null,
      source: "progress_md",
      session: entry.session_title,
      quote,
    });
    return;
  }
  const dir = rule.direction;
  if (!result.clusters[dir]) {
    result.clusters[dir] = {
      direction: dir,
      rule,
      category: rule.category,
      evidence_runs: [],
      evidence_findings: [],
      evidence_quotes: [],
      reject_count_same_direction: 0,
      blacklist_status: null,
      out_of_scope: !!rule.out_of_scope_reason,
      out_of_scope_reason: rule.out_of_scope_reason || null,
      progress_md_only: false,
    };
  }
  result.clusters[dir].evidence_quotes.push({
    run_id: null,
    source: "progress_md",
    session: entry.session_title,
    quote,
  });
}

function addEvidence(result, rule, run, source, quote) {
  if (!rule) {
    result.uncategorized.push({ run_id: run.run_id, source, quote });
    return;
  }
  const dir = rule.direction;
  if (!result.clusters[dir]) {
    result.clusters[dir] = {
      direction: dir,
      rule,
      category: rule.category,
      evidence_runs: [],
      evidence_findings: [],
      evidence_quotes: [],
      reject_count_same_direction: 0,
      blacklist_status: null,
      out_of_scope: !!rule.out_of_scope_reason,
      out_of_scope_reason: rule.out_of_scope_reason || null,
    };
  }
  const c = result.clusters[dir];
  if (!c.evidence_runs.includes(run.run_id)) c.evidence_runs.push(run.run_id);
  c.evidence_quotes.push({ run_id: run.run_id, source, quote });
}

function formatPhase2Log(r) {
  const lines = [];
  lines.push(`# Phase 2 ANALYZE log — subject: ${r.subject_skill}`);
  lines.push(`time: ${C.bjNow()}`);
  lines.push("");
  lines.push(`valid_run_count: ${r.valid_run_count}`);
  lines.push(`progress_entries_consumed: ${r.progress_entries_count || 0}`);
  const progressMdOnlyCount = Object.values(r.clusters).filter(
    (c) => c.progress_md_only,
  ).length;
  lines.push(
    `clusters_found: ${Object.keys(r.clusters).length} (${progressMdOnlyCount} progress_md_only)`,
  );
  lines.push(`uncategorized_pieces: ${r.uncategorized.length}`);
  lines.push(`skipped_blacklisted: ${r.skipped_blacklisted.length}`);
  lines.push(`skipped_workaround: ${r.skipped_workaround.length}`);
  lines.push(`skipped_already_approved: ${r.skipped_already_approved.length}`);
  lines.push(
    `skipped_already_out_of_scope: ${r.skipped_already_out_of_scope.length}`,
  );
  if (r.index_parse_error)
    lines.push(`⚠️ _index.jsonl parse error: ${r.index_parse_error}`);
  lines.push("");

  for (const dir of Object.keys(r.clusters)) {
    const c = r.clusters[dir];
    lines.push(`## direction: ${dir}`);
    lines.push(`  category: ${c.category}`);
    lines.push(`  out_of_scope: ${c.out_of_scope}`);
    if (c.out_of_scope_reason)
      lines.push(`  out_of_scope_reason: ${c.out_of_scope_reason}`);
    lines.push(`  evidence_runs: ${c.evidence_runs.join(", ")}`);
    lines.push(
      `  evidence_findings: ${c.evidence_findings.join(", ") || "(none)"}`,
    );
    lines.push(
      `  reject_count_same_direction: ${c.reject_count_same_direction}`,
    );
    lines.push(`  blacklist_status: ${c.blacklist_status || "active"}`);
    lines.push(`  evidence_quotes (${c.evidence_quotes.length}):`);
    for (const q of c.evidence_quotes) {
      lines.push(`    - [${q.run_id} / ${q.source}] ${q.quote}`);
    }
    lines.push("");
  }

  if (r.uncategorized.length > 0) {
    lines.push("## uncategorized");
    for (const u of r.uncategorized) {
      lines.push(`  - [${u.run_id} / ${u.source}] ${u.quote}`);
    }
  }

  return lines.join("\n");
}

module.exports = { analyze, formatPhase2Log, DIRECTION_RULES };
