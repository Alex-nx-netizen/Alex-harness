// Phase 4: WRITE + 自循环
// 写 weekly-review.md / 议案 .diff / _index.jsonl / cursor / 自循环 runs.jsonl
// 铁律：写后立刻 JSON.parse 校验；cursor 写前 cp .bak；不动 subject SKILL.md
const fs = require("fs");
const path = require("path");
const C = require("./common.cjs");

function isoWeek(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function write(p1, p2, p3, opts = {}) {
  const subject = p3.subject_skill;
  const skillDir = C.subjectSkillPath(subject);
  const proposalsDir = path.join(skillDir, "references", "skill-proposals");
  const reviewDir = path.join(skillDir, "references");
  const cursorPath = path.join(skillDir, "logs", ".evolution-cursor");
  const indexPath = path.join(proposalsDir, "_index.jsonl");

  fs.mkdirSync(proposalsDir, { recursive: true });
  fs.mkdirSync(reviewDir, { recursive: true });

  const wrote = [];

  // 1. weekly-review markdown
  const now = new Date();
  const week = String(isoWeek(now)).padStart(2, "0");
  const reviewPath = path.join(
    reviewDir,
    `weekly-review-${now.getFullYear()}-W${week}.md`,
  );
  const reviewMd = formatWeeklyReview(p1, p2, p3);
  fs.writeFileSync(reviewPath, reviewMd, "utf-8");
  wrote.push(reviewPath);

  // 2. 议案 .diff / .md
  for (const proposal of p3.proposals) {
    if (proposal.status === "out_of_scope") {
      // rejected 议案：只写 .md (NL + reject_reason)，不出 diff
      const p = path.join(proposalsDir, `${proposal.proposal_id}.md`);
      fs.writeFileSync(p, formatRejectedProposal(proposal), "utf-8");
      wrote.push(p);
    } else {
      // actionable 议案：写 .diff（含 NL + diff block 二合一）
      const p = path.join(proposalsDir, `${proposal.proposal_id}.diff`);
      fs.writeFileSync(p, formatActionableProposal(proposal), "utf-8");
      wrote.push(p);
    }
  }

  // 3. _index.jsonl (append)
  for (const proposal of p3.proposals) {
    const indexEntry = {
      proposal_id: proposal.proposal_id,
      created_at: proposal.created_at,
      subject_skill: proposal.subject_skill,
      subject_skill_version: proposal.subject_skill_version,
      direction: proposal.direction,
      nl_summary: proposal.nl_summary,
      diff_path: proposal.diff_path,
      evidence_runs: proposal.evidence_runs,
      evidence_findings: proposal.evidence_findings,
      status: proposal.status,
      decided_at: proposal.decided_at,
      decided_by: proposal.decided_by,
      reject_reason: proposal.reject_reason,
      reject_count_same_direction: proposal.reject_count_same_direction,
    };
    C.appendJsonl(indexPath, indexEntry);
  }
  wrote.push(indexPath);

  // 4. cursor: 先 cp .bak，再写最新 last_processed_run_id (= 最后一个 valid run)
  if (fs.existsSync(cursorPath)) {
    fs.copyFileSync(cursorPath, cursorPath + ".bak");
  }
  const lastValidRunId =
    p1.valid_runs.length > 0
      ? p1.valid_runs[p1.valid_runs.length - 1].run_id
      : null;
  const cursorContent =
    [
      `last_processed_run_id=${lastValidRunId || "none"}`,
      `last_run_at=${C.bjNow()}`,
      `last_evolution_run_id=${opts.evolutionRunId || "unknown"}`,
    ].join("\n") + "\n";
  fs.writeFileSync(cursorPath, cursorContent, "utf-8");
  wrote.push(cursorPath);

  // 5. 自循环：append 自己的 runs.jsonl
  const selfRunsPath = path.join(C.SELF_LOGS_DIR, "runs.jsonl");
  const selfRunEntry = {
    run_id: opts.evolutionRunId,
    timestamp: opts.startedAt || C.bjNow(),
    input: {
      subject_skill: subject,
      subject_skill_version:
        proposalsLookup(p3, "subject_skill_version") || "unknown",
      valid_run_count: p1.valid_run_count,
      cursor_at_start: p1.cursor ? p1.cursor.last_processed_run_id : null,
    },
    decision: {
      mode: p1.mode,
      weak_signal_banner: p1.weak_signal_banner,
    },
    output: {
      weekly_review_path: path
        .relative(C.PROJECT_ROOT, reviewPath)
        .replace(/\\/g, "/"),
      proposals_count: p3.proposals.length,
      actionable_count: p3.proposals.filter((p) => p.status === "pending")
        .length,
      rejected_count: p3.proposals.filter((p) => p.status === "out_of_scope")
        .length,
      blacklisted_count: p3.skipped_blacklisted.length,
      wrote_files: wrote.map((w) =>
        path.relative(C.PROJECT_ROOT, w).replace(/\\/g, "/"),
      ),
    },
    duration_ms: opts.durationMs || null,
    errors: [],
    user_feedback: { rating: null, fix_notes: null },
  };
  C.appendJsonl(selfRunsPath, selfRunEntry);

  return {
    wrote,
    review_path: reviewPath,
    index_path: indexPath,
    cursor_path: cursorPath,
    self_runs_path: selfRunsPath,
    self_run_entry: selfRunEntry,
  };
}

function proposalsLookup(p3, key) {
  for (const p of p3.proposals) if (p[key]) return p[key];
  return null;
}

function formatWeeklyReview(p1, p2, p3) {
  const lines = [];
  lines.push(`# Weekly Review — ${p3.subject_skill}`);
  lines.push("");
  lines.push(
    `> 由 evolution-tracker 自动生成 (${C.bjNow()})。**这是议案的 NL 综述**，actionable diff 在 \`references/skill-proposals/*.diff\`，需 \`git apply\` 接受。`,
  );
  lines.push("");
  if (p1.weak_signal_banner) {
    lines.push(`## ⚠️ 弱信号 banner`);
    lines.push(
      `样本量=${p1.valid_run_count}，议案为弱信号，建议补足 ≥${p1.config.MIN_VALID_RUN_FOR_NORMAL || 2} 条 valid run 再决定 SKILL.md 改动。`,
    );
    lines.push("");
  }
  lines.push(`## 输入快照`);
  lines.push(
    `- valid runs: ${p1.valid_run_count}（${p1.valid_runs.map((v) => v.run_id).join(", ")}）`,
  );
  lines.push(
    `- aborted runs: ${p1.aborted_runs.length}（${p1.aborted_runs.map((v) => v.run_id).join(", ") || "(none)"}）`,
  );
  lines.push(`- mode: ${p1.mode}`);
  lines.push(`- findings 引用: ${p1.findings.map((f) => f.id).join(", ")}`);
  lines.push("");

  lines.push(`## Pattern 聚类`);
  for (const dir of Object.keys(p2.clusters)) {
    const c = p2.clusters[dir];
    lines.push(
      `- **${dir}** (${c.category}): ${c.evidence_runs.length} runs, ${c.evidence_findings.length} findings; status=${c.blacklist_status || "active"}; out_of_scope=${c.out_of_scope}`,
    );
  }
  if (p2.uncategorized.length > 0) {
    lines.push(
      `- _uncategorized_: ${p2.uncategorized.length} pieces (尚无 direction rule)`,
    );
  }
  lines.push("");

  lines.push(`## 议案概览（${p3.proposals.length} 条）`);
  for (const p of p3.proposals) {
    const tag = p.status === "out_of_scope" ? "🔴 REJECTED" : "🟢 PENDING";
    lines.push(`### ${tag} ${p.proposal_id} — ${p.direction}`);
    lines.push(`> ${p.nl_summary}`);
    lines.push("");
    lines.push(`- **What**: ${p.what}`);
    lines.push(`- **Where**: ${p.where}`);
    lines.push(`- **Risk**: ${p.risk}`);
    if (p.diff_path)
      lines.push(`- **Diff**: \`${p.diff_path}\` （\`git apply\` 接受）`);
    if (p.reject_reason) lines.push(`- **Reject reason**: ${p.reject_reason}`);
    lines.push(`- **Evidence runs**: ${p.evidence_runs.join(", ")}`);
    lines.push(
      `- **Evidence findings**: ${p.evidence_findings.join(", ") || "(none)"}`,
    );
    lines.push("");
  }

  lines.push(`## 黑名单 / 跳过`);
  if (
    p2.skipped_blacklisted.length === 0 &&
    p2.skipped_workaround.length === 0
  ) {
    lines.push(`- (无)`);
  } else {
    for (const b of p2.skipped_blacklisted)
      lines.push(
        `- 🚫 ${b.direction}: 同方向已 reject ${b.reject_count} 次，黑名单中`,
      );
    for (const w of p2.skipped_workaround)
      lines.push(`- ⏭️ ${w.direction}: ${w.reason}`);
  }
  lines.push("");

  lines.push(`## 接下来你做什么`);
  const actionable = p3.proposals.filter((p) => p.status === "pending");
  if (actionable.length > 0) {
    lines.push(
      `审议案，**人审拍板**（铁律：evolution-tracker 永远不动 SKILL.md）：`,
    );
    for (const p of actionable) {
      lines.push(`- 接受 \`${p.proposal_id}\`：\`git apply ${p.diff_path}\``);
      lines.push(
        `- 拒绝 \`${p.proposal_id}\`：在 \`_index.jsonl\` 把 status 改 \`rejected\` + 填 reject_reason`,
      );
    }
  } else {
    lines.push(
      `- 无 actionable 议案。可能：所有信号都在 out_of_scope / 黑名单 / 已有 workaround。`,
    );
  }

  return lines.join("\n");
}

function formatActionableProposal(p) {
  const lines = [];
  lines.push(`# ${p.proposal_id}: ${p.direction}`);
  lines.push("");
  lines.push(`> NL summary (${p.nl_summary.length}字)：${p.nl_summary}`);
  lines.push("");
  lines.push(`## What`);
  lines.push(p.what);
  lines.push("");
  lines.push(`## Why`);
  lines.push(`Evidence runs: ${p.evidence_runs.join(", ")}`);
  lines.push(`Evidence findings: ${p.evidence_findings.join(", ")}`);
  lines.push("");
  lines.push(`## Where`);
  lines.push(p.where);
  lines.push("");
  lines.push(`## Risk`);
  lines.push(p.risk);
  lines.push("");
  lines.push(`## Diff`);
  lines.push("```diff");
  lines.push(p.diff_content);
  lines.push("```");
  lines.push("");
  lines.push(`---`);
  lines.push(
    `status=${p.status} | created_at=${p.created_at} | reject_count_same_direction=${p.reject_count_same_direction}`,
  );
  return lines.join("\n");
}

function formatRejectedProposal(p) {
  const lines = [];
  lines.push(`# ${p.proposal_id}: ${p.direction} [REJECTED]`);
  lines.push("");
  lines.push(`> NL summary (${p.nl_summary.length}字)：${p.nl_summary}`);
  lines.push("");
  lines.push(`## Reject reason`);
  lines.push(p.reject_reason || "(no reason)");
  lines.push("");
  lines.push(`## Evidence`);
  lines.push(`- runs: ${p.evidence_runs.join(", ")}`);
  lines.push(`- findings: ${p.evidence_findings.join(", ") || "(none)"}`);
  lines.push("");
  lines.push(`## What/Where/Risk (record only)`);
  lines.push(`- What: ${p.what}`);
  lines.push(`- Where: ${p.where}`);
  lines.push(`- Risk: ${p.risk}`);
  lines.push("");
  lines.push(`---`);
  lines.push(
    `status=${p.status} | reject_count_same_direction=${p.reject_count_same_direction}`,
  );
  return lines.join("\n");
}

module.exports = { write, formatWeeklyReview };
