// Phase 3: PROPOSE
// 每条议案 = What/Why/Where/Risk/Diff 5 字段 + NL summary ≤200 字。缺一个 abort。
// out_of_scope 议案不出 .diff，只出 .md (rejected)。
// blacklisted direction 完全跳过（已在 phase2 标记）。
const C = require("./common.cjs");

// Direction → 议案模板。
// 模板里用占位符 ${SUBJECT_SKILL} / ${EVIDENCE_RUNS} / ${EVIDENCE_FINDINGS}。
// 加新 direction 时来这里扩。
const PROPOSAL_TEMPLATES = {
  phase4_robustness: {
    nl: "${SUBJECT_SKILL} Phase 4 WRITE 缺响应解析与 chunks 落盘顺序硬化。证据 ${EVIDENCE_FINDINGS}。建议 Phase 4 末尾插 Phase 4.5 VERIFY 三步：解析 j.data.doc_id / chunks 全落盘再 create / 写后 JSON.parse 校验。",
    what: "在 .claude/skills/${SUBJECT_SKILL}/SKILL.md 的 Phase 4 之后、Phase 5 LOG 之前插入 Phase 4.5 VERIFY 章节",
    where: ".claude/skills/${SUBJECT_SKILL}/SKILL.md @ Phase 4 末尾",
    risk: "Phase 4.5 加进来要保持 Phase 5 LOG 即使 4.5 abort 也能记错。M2.3 实现时务必双向 try/finally。",
    diff: `--- a/.claude/skills/\${SUBJECT_SKILL}/SKILL.md
+++ b/.claude/skills/\${SUBJECT_SKILL}/SKILL.md
@@ Phase 4: WRITE @@
   \`\`\`bash
   lark-cli docs +update --doc "<doc_id>" --mode <chosen> ...
   \`\`\`
+
+### Phase 4.5: VERIFY（写入后强制校验）
+
+\`+create\` / \`+update\` 调用后**必须**：
+
+1. **响应解析**：从 \`j.data.doc_id\` 和 \`j.data.doc_url\` 取 token（**不是**顶层）。失败立即 abort，不重试。
+2. **chunks 落盘顺序**：分块写入时**必须先把所有 chunks 写到 \`tmp/chunk_*.md\`**，再开始 create + append 循环。中途失败可从 \`tmp/\` 恢复，不必重切源文件。
+3. **写后校验**：任何写入 JSONL 后立刻对每行 \`JSON.parse\`；失败 abort 并提示行号。
+
+> **来源**：\${EVIDENCE_FINDINGS}（写后不验 + parser 漏 data.doc_id + chunks 落盘顺序反模式）

 ### Phase 5: LOG（写日志，供自我进化）`,
  },

  phase7_push: {
    nl: "${SUBJECT_SKILL} 缺 Phase 7 PUSH——产出只打印 doc_url，用户得手动点。证据 L4 fix_notes rating=3 + ${EVIDENCE_FINDINGS}。已用 lark-cli im 验证可行。建议 Phase 6 之前插 Phase 7：默认 user open_id（global memory），缺失时手机号兜底。",
    what: "在 .claude/skills/${SUBJECT_SKILL}/SKILL.md 的 Phase 5 LOG 之后、Phase 6 REPORT 之前插入 Phase 7 PUSH 章节",
    where: ".claude/skills/${SUBJECT_SKILL}/SKILL.md @ Phase 5 末尾",
    risk: '推送失败的兜底——若 lark-cli contact 也失败，要明示用户"手动复制 URL"，不要静默吃错。Mitigation: 在 Phase 7 写明 try/catch + errors[] 字段记 push_failed: <reason>，不影响 doc 创建。',
    diff: `--- a/.claude/skills/\${SUBJECT_SKILL}/SKILL.md
+++ b/.claude/skills/\${SUBJECT_SKILL}/SKILL.md
@@ Phase 5: LOG @@
   "user_feedback": { "rating": null, "fix_notes": null }
   }
   \`\`\`
+
+### Phase 7: PUSH（产出直推飞书 IM）
+
+**铁律**：成功跑完（含 user_feedback 待填）后、Phase 6 REPORT 之前，**必须**直推。
+
+1. **目标**：默认 user open_id（从 global memory 读，如 \`ou_835b...\`）
+2. **兜底**：user_id 缺失 → 询问用户手机号 → \`lark-cli contact +users-search --mobile <phone>\` 取 open_id
+3. **内容**：doc 标题 + URL + 关键章节摘要 + errors 摘要（≤300 字）
+4. **命令**：\`lark-cli im +messages-send --user-id <ou_xxx> --as bot --markdown "$(cat tmp/push.md)"\`
+5. **失败处理**：推送失败时**不**回滚 doc 创建（doc 已成事实），只在 runs.jsonl 的 errors 字段记 \`push_failed: <reason>\`
+
+> **来源**：\${EVIDENCE_FINDINGS} + L4 user_feedback "飞书文档应直推 IM 而不是给链接"

 ### Phase 6: REPORT（向用户汇报）`,
  },

  curator_truncate_aggressive: {
    nl: "context-curator 截断阶梯过激——Level 6 compact_mode 直跳 count-only，具体进度全不可见。证据 ${EVIDENCE_RUNS}。建议在 Level 5 后插 Level 5.5：progress/findings 各保留最新 1 条（≤60字），不空手到 compact_mode。",
    what: "在 run.cjs Level 5（current clip）之后、Level 6（compact_mode）之前插入 Level 5.5：progress → 1 entry / findings → 1 finding（各 ≤60字），保留最小可读单元",
    where:
      ".claude/skills/context-curator/run.cjs @ Level 5 末尾与 Level 6 之间（// Level 6: progress + findings → counts only 注释上方）",
    risk: "Level 5.5 字数收益有限（约 50-100 字），若仍超限则 compact_mode 正常接力，无副作用。Mitigation: Level 8 hard_trim 已实装（2026-4-30），永不 FATAL。",
    diff: `--- a/.claude/skills/context-curator/run.cjs
+++ b/.claude/skills/context-curator/run.cjs
@@ Level 5 末尾 / Level 6 之前 @@
   truncated.push("current");
   body = rebuild();
   chars = uniChars(body);
 }
+  // Level 5.5: progress → 1 entry + findings → 1 finding（保留最小可读单元）
+  if (chars > SUMMARY_CHAR_LIMIT) {
+    const p1 = p2.progress.entries.slice(0, 1);
+    sections.progress = p1.map((e) => \`- \${e.title.slice(0, 60)}\`).join("\\n") +
+      (p2.progress.entries.length > 1 ? \`\\n_[+\${p2.progress.entries.length - 1}]_\` : "");
+    const f1 = p2.findings.findings.slice(0, 1);
+    sections.findings = f1.map((f) => \`- **\${f.id}** \${f.title.slice(0, 60)}\`).join("\\n") +
+      (p2.findings.findings.length > 1 ? \`\\n_[+\${p2.findings.findings.length - 1}]_\` : "");
+    truncated.push("micro_compress");
+    body = rebuild();
+    chars = uniChars(body);
+  }
   // Level 6: progress + findings → counts only`,
  },

  self_evolution: {
    // out_of_scope: 不出 diff，只出 NL + reject_reason
    nl: 'L2 fix_notes "不会自我进化" 映射到治理元缺失（蓝图 §3.B1）。evolution-tracker 自身就是这个的答案——不应在 ${SUBJECT_SKILL} SKILL.md 加"复盘逻辑"。reject_reason: out_of_scope。direction self_evolution 首次出现，记 1/3，未上黑名单。',
    what: "(no-op, rejected)",
    where: "(n/a)",
    risk: "若误把 self_evolution 当 actionable 议案，会让 subject skill 试图自我进化 → 违反治理元铁律 → 元自我退化。Mitigation: out_of_scope 字段强制 reject，不出 diff。",
    diff: null, // 明示 null
  },
};

function fillTemplate(tpl, ctx) {
  if (tpl === null) return null;
  return tpl
    .replace(/\$\{SUBJECT_SKILL\}/g, ctx.subjectSkill)
    .replace(/\$\{EVIDENCE_RUNS\}/g, ctx.evidenceRuns.join(", "))
    .replace(
      /\$\{EVIDENCE_FINDINGS\}/g,
      ctx.evidenceFindings.length > 0
        ? ctx.evidenceFindings.join(" + ")
        : "(none)",
    );
}

// F-015 修: 全局递增——读现有 _index.jsonl 找当日 prefix 最大 idx，新议案从 max+1 开始
function generateProposalId(subjectSkill, idx, existingIndex) {
  const prefix = `P-${C.bjToday()}-`;
  let maxExisting = 0;
  for (const entry of existingIndex || []) {
    if (entry.proposal_id && entry.proposal_id.startsWith(prefix)) {
      const n = parseInt(entry.proposal_id.slice(prefix.length), 10);
      if (!isNaN(n) && n > maxExisting) maxExisting = n;
    }
  }
  return `${prefix}${String(maxExisting + idx).padStart(3, "0")}`;
}

function propose(p2result) {
  const result = {
    subject_skill: p2result.subject_skill,
    proposals: [], // each = { proposal_id, direction, status, nl_summary, what, where, risk, diff, evidence_runs, evidence_findings, reject_reason, ... }
    skipped_blacklisted: p2result.skipped_blacklisted,
    skipped_workaround: p2result.skipped_workaround,
    skipped_already_approved: p2result.skipped_already_approved || [],
    skipped_already_out_of_scope: p2result.skipped_already_out_of_scope || [],
    skipped_progress_md_only: [], // P-001: 待 ≥1 valid run 实证后再 propose
    proposals_failed_validation: [],
  };

  // F-015: 拿现有 _index.jsonl 算 max idx
  const existingIndex = p2result.existing_index || [];

  let idx = 0;
  for (const dir of Object.keys(p2result.clusters)) {
    const cluster = p2result.clusters[dir];

    // 跳过黑名单 / workaround / 已 approved / 已 out_of_scope direction（终端注明，不入 proposals）
    if (cluster.blacklist_status === "blacklisted") {
      continue;
    }
    if (cluster.blacklist_status === "skipped_workaround") {
      continue;
    }
    // F-014: 已决策的 direction 不再重提
    if (cluster.blacklist_status === "skip_already_approved") {
      continue;
    }
    if (cluster.blacklist_status === "skip_already_out_of_scope") {
      continue;
    }

    // P-001: progress_md_only cluster 等待 ≥1 valid run 实证才 propose
    if (cluster.progress_md_only) {
      result.skipped_progress_md_only.push({
        direction: dir,
        reason: "progress_md_only: 需补 ≥1 valid run 实证后再 propose",
      });
      continue;
    }

    const tpl = PROPOSAL_TEMPLATES[dir];
    if (!tpl) {
      // 没有模板 → 不生成议案，但不阻断（terminal 注明）
      result.proposals_failed_validation.push({
        direction: dir,
        reason: "该 direction 无 proposal template；M2.3.2.3 时手动加",
      });
      continue;
    }

    const ctx = {
      subjectSkill: p2result.subject_skill,
      evidenceRuns: cluster.evidence_runs,
      evidenceFindings: cluster.evidence_findings,
    };

    idx += 1;
    const proposalId = generateProposalId(
      p2result.subject_skill,
      idx,
      existingIndex,
    );

    const nl = fillTemplate(tpl.nl, ctx);
    const what = fillTemplate(tpl.what, ctx);
    const where = fillTemplate(tpl.where, ctx);
    const risk = fillTemplate(tpl.risk, ctx);
    const diff = fillTemplate(tpl.diff, ctx);

    // 5 字段校验：NL/What/Where/Risk 必须；Diff 可 null（仅 out_of_scope 议案）
    const validation = validateProposal(
      { nl, what, where, risk, diff },
      cluster.out_of_scope,
    );
    if (!validation.valid) {
      result.proposals_failed_validation.push({
        direction: dir,
        reason: validation.reason,
      });
      continue;
    }

    // NL ≤ 200 字
    if (nl.length > 200) {
      result.proposals_failed_validation.push({
        direction: dir,
        reason: `NL summary 超长 (${nl.length} > 200 字)：${nl.slice(0, 50)}...`,
      });
      continue;
    }

    const proposal = {
      proposal_id: proposalId,
      created_at: C.bjNow(),
      subject_skill: p2result.subject_skill,
      subject_skill_version: "0.1.0", // TODO: 从 phase1 拿
      direction: dir,
      nl_summary: nl,
      what,
      where,
      risk,
      diff_path: cluster.out_of_scope
        ? null
        : `references/skill-proposals/${proposalId}.diff`,
      diff_content: diff,
      evidence_runs: cluster.evidence_runs,
      evidence_findings: cluster.evidence_findings,
      status: cluster.out_of_scope ? "out_of_scope" : "pending",
      decided_at: null,
      decided_by: null,
      reject_reason: cluster.out_of_scope ? cluster.out_of_scope_reason : null,
      reject_count_same_direction: cluster.reject_count_same_direction,
    };

    result.proposals.push(proposal);
  }

  return result;
}

function validateProposal(p, isOutOfScope) {
  // 铁律：5 字段缺一个 abort（不许半成品）
  if (!p.nl) return { valid: false, reason: "缺 NL summary" };
  if (!p.what) return { valid: false, reason: "缺 What" };
  if (!p.where) return { valid: false, reason: "缺 Where" };
  if (!p.risk) return { valid: false, reason: "缺 Risk" };
  // Diff 只对 actionable 议案必需
  if (!isOutOfScope && !p.diff)
    return { valid: false, reason: "缺 Diff (actionable 议案必需)" };
  return { valid: true };
}

function formatPhase3Log(r) {
  const lines = [];
  lines.push(`# Phase 3 PROPOSE log — subject: ${r.subject_skill}`);
  lines.push(`time: ${C.bjNow()}`);
  lines.push("");
  lines.push(`proposals: ${r.proposals.length}`);
  lines.push(
    `  actionable (status=pending): ${r.proposals.filter((p) => p.status === "pending").length}`,
  );
  lines.push(
    `  rejected/out_of_scope: ${r.proposals.filter((p) => p.status === "out_of_scope").length}`,
  );
  lines.push(`failed_validation: ${r.proposals_failed_validation.length}`);
  lines.push(`skipped_blacklisted: ${r.skipped_blacklisted.length}`);
  lines.push(`skipped_workaround: ${r.skipped_workaround.length}`);
  lines.push(
    `skipped_progress_md_only: ${(r.skipped_progress_md_only || []).length} (待 ≥1 valid run 实证)`,
  );
  for (const s of r.skipped_progress_md_only || []) {
    lines.push(`  - ${s.direction}: ${s.reason}`);
  }
  lines.push("");
  for (const p of r.proposals) {
    lines.push(`## ${p.proposal_id} (${p.direction}) [status=${p.status}]`);
    lines.push(`  NL (${p.nl_summary.length}字): ${p.nl_summary}`);
    lines.push(`  What: ${p.what}`);
    lines.push(`  Where: ${p.where}`);
    lines.push(`  Risk: ${p.risk}`);
    lines.push(`  evidence_runs: ${p.evidence_runs.join(", ")}`);
    lines.push(`  evidence_findings: ${p.evidence_findings.join(", ")}`);
    if (p.diff_path) lines.push(`  diff_path: ${p.diff_path}`);
    if (p.reject_reason) lines.push(`  reject_reason: ${p.reject_reason}`);
    lines.push("");
  }
  if (r.proposals_failed_validation.length > 0) {
    lines.push("## failed_validation");
    for (const f of r.proposals_failed_validation) {
      lines.push(`  - ${f.direction}: ${f.reason}`);
    }
  }
  return lines.join("\n");
}

module.exports = { propose, formatPhase3Log, PROPOSAL_TEMPLATES };
