#!/usr/bin/env node
/**
 * next_actions.cjs — Ralph-inspired readiness queue (B2)
 *
 * 读 _meta/task_plan.jsonl，分类输出当前会话能立刻动手的 task。
 * 只读 — 绝不改 jsonl 或 md。
 *
 * 类别：
 *   🟢 ready_to_unblock：status=blocked 但所有 blocked_by 已 passes:true（解锁了，可以做）
 *   🔄 in_progress     ：状态正在做，继续
 *   🟡 unknown_ready   ：status=unknown（新加的 task 还没标 emoji）且无 blocked_by
 *   ⏸ still_blocked   ：status=blocked 且至少 1 条 blocker 未完成
 *   ⚠️ dangling        ：有 dangling_blocked_by（F-016 类）
 *   🌙 scheduled       ：时间门控，单列
 *   ⏭ skipped / ❌ aborted：终态，仅在 --all 时打印
 *
 * Usage:
 *   node _meta/next_actions.cjs           # 默认：只打可动的 + 阻塞情况
 *   node _meta/next_actions.cjs --all     # 含终态
 *   node _meta/next_actions.cjs --json    # JSON 输出（脚本化）
 */

const fs = require("fs");
const path = require("path");

const META_DIR = __dirname;
const SRC = path.join(META_DIR, "task_plan.jsonl");

const FLAGS = new Set(process.argv.slice(2));
const SHOW_ALL = FLAGS.has("--all");
const JSON_OUT = FLAGS.has("--json");

function loadTasks() {
  if (!fs.existsSync(SRC)) {
    console.error(`[FATAL] ${SRC} not found. Run sync_task_plan.cjs first.`);
    process.exit(2);
  }
  const lines = fs.readFileSync(SRC, "utf-8").split("\n").filter(Boolean);
  return lines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      console.error(`[FATAL] L${i + 1} invalid JSON: ${e.message}`);
      process.exit(3);
    }
  });
}

function classify(tasks) {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  const buckets = {
    ready_to_unblock: [],
    in_progress: [],
    unknown_ready: [],
    still_blocked: [],
    dangling: [],
    scheduled: [],
    skipped: [],
    aborted: [],
    completed: [],
  };

  for (const t of tasks) {
    if (t.passes) {
      buckets.completed.push(t);
      continue;
    }
    if (t.status === "aborted") {
      buckets.aborted.push(t);
      continue;
    }
    if (t.status === "skipped") {
      buckets.skipped.push(t);
      continue;
    }
    if (t.status === "scheduled") {
      buckets.scheduled.push(t);
      continue;
    }
    if (t.status === "in_progress") {
      buckets.in_progress.push(t);
      continue;
    }

    // 引用完整性优先
    if (
      Array.isArray(t.dangling_blocked_by) &&
      t.dangling_blocked_by.length > 0
    ) {
      buckets.dangling.push(t);
      continue;
    }

    // 无 blocked_by 或全空 → 看 status
    const blockers = Array.isArray(t.blocked_by) ? t.blocked_by : [];
    if (blockers.length === 0) {
      if (t.status === "unknown") buckets.unknown_ready.push(t);
      else if (t.status === "blocked") buckets.ready_to_unblock.push(t); // 标 blocked 但其实没 blocker 数据 → 可动
      continue;
    }

    // 有 blocked_by → 看是否全部 passes:true
    const unresolved = blockers.filter((id) => {
      const dep = byId.get(id);
      return !dep || !dep.passes;
    });
    if (unresolved.length === 0) {
      buckets.ready_to_unblock.push({ ...t, _resolved_blockers: blockers });
    } else {
      buckets.still_blocked.push({ ...t, _unresolved_blockers: unresolved });
    }
  }

  return buckets;
}

function fmtTask(t) {
  const phase = t.phase
    ? ` [${t.phase.replace(/^Phase\s+\d+\s*\/\s*/, "").replace(/\s*子任务.*$/, "")}]`
    : "";
  const tail = t._unresolved_blockers
    ? `  ⏳ 等：${t._unresolved_blockers.join(", ")}`
    : t._resolved_blockers
      ? `  ✓ 解锁自：${t._resolved_blockers.join(", ")}`
      : t.dangling_blocked_by
        ? `  ⚠️ dangling：${t.dangling_blocked_by.join(", ")}`
        : "";
  return `   - ${t.task_id}${phase} ${t.subject}${tail}`;
}

function printText(buckets) {
  const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);

  console.log(`📋 next_actions @ ${new Date().toLocaleString("zh-CN")}`);
  console.log(`   total tasks: ${total}\n`);

  if (buckets.ready_to_unblock.length) {
    console.log(
      `🟢 ready_to_unblock (${buckets.ready_to_unblock.length})  — blockers 全部 passes:true，现在可以做：`,
    );
    buckets.ready_to_unblock.forEach((t) => console.log(fmtTask(t)));
    console.log("");
  }

  if (buckets.in_progress.length) {
    console.log(`🔄 in_progress (${buckets.in_progress.length})  — 继续：`);
    buckets.in_progress.forEach((t) => console.log(fmtTask(t)));
    console.log("");
  }

  if (buckets.unknown_ready.length) {
    console.log(
      `🟡 unknown_ready (${buckets.unknown_ready.length})  — 新加的 task 还没标 status，可以做：`,
    );
    buckets.unknown_ready.forEach((t) => console.log(fmtTask(t)));
    console.log("");
  }

  if (buckets.still_blocked.length) {
    console.log(
      `⏸ still_blocked (${buckets.still_blocked.length})  — 等 blockers：`,
    );
    buckets.still_blocked.forEach((t) => console.log(fmtTask(t)));
    console.log("");
  }

  if (buckets.dangling.length) {
    console.log(
      `⚠️  dangling (${buckets.dangling.length})  — F-016 类引用错（修 notes 或 deprecate 重命名的 task）：`,
    );
    buckets.dangling.forEach((t) => console.log(fmtTask(t)));
    console.log("");
  }

  if (buckets.scheduled.length) {
    console.log(`🌙 scheduled (${buckets.scheduled.length})  — 时间门控：`);
    buckets.scheduled.forEach((t) => console.log(fmtTask(t)));
    console.log("");
  }

  if (SHOW_ALL) {
    if (buckets.skipped.length) {
      console.log(`⏭ skipped (${buckets.skipped.length}):`);
      buckets.skipped.forEach((t) => console.log(fmtTask(t)));
      console.log("");
    }
    if (buckets.aborted.length) {
      console.log(`❌ aborted (${buckets.aborted.length}):`);
      buckets.aborted.forEach((t) => console.log(fmtTask(t)));
      console.log("");
    }
    if (buckets.completed.length) {
      console.log(
        `✅ completed (${buckets.completed.length}) — 不打详情（用 --all 也只看终态前两类）`,
      );
    }
  }

  // 顶部建议（最重要的下一步）
  const actionable =
    buckets.ready_to_unblock.length +
    buckets.in_progress.length +
    buckets.unknown_ready.length;
  console.log(`────`);
  if (actionable === 0) {
    console.log(
      `💤 当前无可动 task —— 所有未完成 task 都在等 blockers / dangling / scheduled 中。`,
    );
    console.log(
      `   建议：要么给现有 task 补依赖数据；要么开新 task；要么收线该 phase。`,
    );
  } else {
    console.log(`💡 现在可动 ${actionable} 个 task；优先级建议：`);
    if (buckets.in_progress.length)
      console.log(
        `   1. 先收 in_progress（${buckets.in_progress[0].task_id}）`,
      );
    else if (buckets.ready_to_unblock.length)
      console.log(
        `   1. 选 ready_to_unblock 中最小依赖的（${buckets.ready_to_unblock[0].task_id}）`,
      );
    else if (buckets.unknown_ready.length)
      console.log(
        `   1. 标 unknown_ready 的 status emoji（${buckets.unknown_ready[0].task_id}）`,
      );
  }
}

function printJson(buckets) {
  const out = {
    generated_at: new Date().toISOString(),
    counts: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, v.length]),
    ),
    buckets: SHOW_ALL
      ? buckets
      : {
          ready_to_unblock: buckets.ready_to_unblock,
          in_progress: buckets.in_progress,
          unknown_ready: buckets.unknown_ready,
          still_blocked: buckets.still_blocked,
          dangling: buckets.dangling,
          scheduled: buckets.scheduled,
        },
  };
  console.log(JSON.stringify(out, null, 2));
}

function main() {
  const tasks = loadTasks();
  const buckets = classify(tasks);
  if (JSON_OUT) printJson(buckets);
  else printText(buckets);
}

main();
