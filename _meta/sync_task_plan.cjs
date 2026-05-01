#!/usr/bin/env node
/**
 * sync_task_plan.cjs — Ralph-inspired task_plan.md → task_plan.jsonl mirror
 *
 * 单向：md 是用户主权区，jsonl 是机器可读镜像。绝不改 task_plan.md。
 * 幂等：跑 N 次产出相同 jsonl（除了 synced_at）。
 * 借鉴 Ralph 的 prd.json 精神：每个 task 有 passes 字段（机器判定通/不通）。
 *
 * Usage: node _meta/sync_task_plan.cjs
 */

const fs = require("fs");
const path = require("path");

const META_DIR = __dirname;
const SRC = path.join(META_DIR, "task_plan.md");
const OUT = path.join(META_DIR, "task_plan.jsonl");

// ---- 北京时间，铁律 #6 ----
function bjNow() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// ---- 状态解析（emoji → enum + passes）----
// 参考 Ralph：passes=true 等价于 prd.json 的 "story 验证通过"
function parseStatus(raw) {
  const s = (raw || "").trim();
  if (/^✅/.test(s)) return { status: "completed", passes: true };
  if (/^⏸/.test(s)) return { status: "blocked", passes: false };
  if (/^⏭/.test(s)) return { status: "skipped", passes: false };
  if (/^🌙/.test(s)) return { status: "scheduled", passes: false };
  if (/^🔄/.test(s)) return { status: "in_progress", passes: false };
  if (/^❌/.test(s)) return { status: "aborted", passes: false };
  return { status: "unknown", passes: false };
}

// ---- 依赖提取：从 status 或 notes 里挖 "等 1.5" "等 1.5-1.7" ----
// 注意顺序：范围匹配优先（避免 "1.5-1.7" 被单点 regex 截成 "1.5"）
function extractBlockedBy(statusRaw, notes) {
  const text = `${statusRaw} ${notes || ""}`;
  // 优先：范围 "等 1.5-1.7"
  const range = text.match(/等\s*([\d]+)\.([\d]+)\s*-\s*([\d]+)\.([\d]+)/);
  if (range) {
    const [, majA, minA, majB, minB] = range;
    if (majA === majB) {
      // 同 phase 内展开：1.5-1.7 → ["1.5","1.6","1.7"]
      const out = [];
      for (let n = parseInt(minA, 10); n <= parseInt(minB, 10); n++)
        out.push(`${majA}.${n}`);
      return out;
    }
    return [`${majA}.${minA}`, `${majB}.${minB}`]; // 跨 phase 只取端点
  }
  // 单点 "等 1.6" / "等 2.2.5" / "等 1.2-retry"
  const single = text.match(/等\s*([\d]+(?:\.[\dx]+)*(?:-retry)?)/);
  if (single) return [single[1]];
  return null;
}

// ---- 主解析 ----
function parse(md) {
  const lines = md.split("\n");
  const tasks = [];
  let currentPhase = null;
  let inTaskTable = false;
  let inErrorsTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H2 header → 更新 phase
    const h2 = line.match(/^##\s+(.+?)\s*(?:\(.*\))?$/);
    if (h2) {
      currentPhase = h2[1].trim();
      inTaskTable = false;
      inErrorsTable = false;
      continue;
    }

    // 表头检测
    if (/^\|\s*#\s*\|\s*任务\s*\|\s*状态\s*\|\s*备注\s*\|/.test(line)) {
      inTaskTable = true;
      inErrorsTable = false;
      continue;
    }
    if (/^\|\s*时间\s*\|\s*错误\s*\|\s*处理\s*\|/.test(line)) {
      inErrorsTable = true;
      inTaskTable = false;
      continue;
    }

    // 表分隔符 |---| 跳过
    if (/^\|[\s-:|]+\|\s*$/.test(line)) continue;

    // 空行 / 非表行 → 退出表
    if (!line.startsWith("|")) {
      inTaskTable = false;
      inErrorsTable = false;
      continue;
    }

    // 解析 task table 行
    if (inTaskTable) {
      const cols = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cols.length < 4) continue;
      const [id, subjectRaw, statusRaw, notes] = cols;
      if (!id || id === "#") continue;

      // 清理 subject markdown 装饰（保留 URL/code）
      const subject = subjectRaw
        .replace(/\*\*(.+?)\*\*/g, "$1") // 加粗
        .replace(/~~(.+?)~~/g, "$1") // 删除线
        .trim();

      const { status, passes } = parseStatus(statusRaw);
      const blocked_by = extractBlockedBy(statusRaw, notes);

      tasks.push({
        task_id: id,
        phase: currentPhase,
        subject,
        subject_has_strikethrough: /~~.+?~~/.test(subjectRaw), // Ralph 风格：被划掉的 task 单独标记
        status,
        status_raw: statusRaw,
        passes,
        blocked_by,
        notes: notes || null,
        synced_from_md_line: i + 1,
      });
    }
  }

  return tasks;
}

// ---- 主入口 ----
function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`[FATAL] task_plan.md not found at ${SRC}`);
    process.exit(2);
  }

  const md = fs.readFileSync(SRC, "utf-8");
  const tasks = parse(md);
  const synced_at = bjNow();

  // F-016 修：blocked_by 引用完整性校验
  // 检测 blocked_by 中每个 id 是否在 task list；找不到 = 野指针（task 重命名/拆分时常见）
  const taskIdSet = new Set(tasks.map((t) => t.task_id));
  const integrityWarnings = [];
  for (const t of tasks) {
    if (!Array.isArray(t.blocked_by) || t.blocked_by.length === 0) {
      t.dangling_blocked_by = null;
      continue;
    }
    const dangling = t.blocked_by.filter((id) => !taskIdSet.has(id));
    if (dangling.length > 0) {
      t.dangling_blocked_by = dangling;
      integrityWarnings.push({
        task_id: t.task_id,
        dangling,
        full_blocked_by: t.blocked_by,
      });
    } else {
      t.dangling_blocked_by = null;
    }
  }

  // 写 jsonl（每行 1 task），追加 synced_at 字段
  const lines = tasks.map((t) => JSON.stringify({ ...t, synced_at }));
  const content = lines.join("\n") + "\n";

  // 校验（铁律 #8：写后 parse 验证）
  for (const l of lines) {
    JSON.parse(l);
  }

  // 写
  fs.writeFileSync(OUT, content, "utf-8");

  // 重读校验
  const recheck = fs.readFileSync(OUT, "utf-8").split("\n").filter(Boolean);
  recheck.forEach((l, i) => {
    try {
      JSON.parse(l);
    } catch (e) {
      console.error(`[FATAL] L${i + 1} invalid: ${e.message}`);
      process.exit(3);
    }
  });

  // 统计输出（Ralph 风格：完成度量）
  const total = tasks.length;
  const completed = tasks.filter((t) => t.passes).length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const in_progress = tasks.filter((t) => t.status === "in_progress").length;
  const scheduled = tasks.filter((t) => t.status === "scheduled").length;
  const aborted = tasks.filter((t) => t.status === "aborted").length;

  console.log(
    `[OK] synced ${total} tasks → ${path.relative(process.cwd(), OUT)}`,
  );
  console.log(`     synced_at: ${synced_at}`);
  console.log(
    `     ✅ completed: ${completed}/${total}  (${((completed / total) * 100).toFixed(1)}%)`,
  );
  console.log(`     ⏸ blocked:    ${blocked}`);
  console.log(`     🔄 in_progress: ${in_progress}`);
  console.log(`     🌙 scheduled:  ${scheduled}`);
  console.log(`     ⏭ skipped:    ${skipped}`);
  console.log(`     ❌ aborted:    ${aborted}`);

  // Ralph 风格"完成信号"：所有 task 都 passes:true
  if (completed === total) {
    console.log(`     <promise>COMPLETE</promise>  // 全部 task passes:true`);
  } else {
    console.log(
      `     <promise>NOT_COMPLETE</promise>  // ${total - completed} 项未完成`,
    );
  }

  // F-016 修：引用完整性 warn
  if (integrityWarnings.length > 0) {
    console.log("");
    console.log(
      `⚠️  ${integrityWarnings.length} task(s) have dangling blocked_by references:`,
    );
    for (const w of integrityWarnings) {
      console.log(
        `   - ${w.task_id}: blocked_by=${JSON.stringify(w.full_blocked_by)} → dangling=${JSON.stringify(w.dangling)}`,
      );
    }
    console.log(
      `   修复建议：在 task_plan.md 修 notes 引用，或 deprecate task 而非重命名（F-016）`,
    );
  }
}

main();
