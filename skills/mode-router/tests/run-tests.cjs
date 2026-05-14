"use strict";
// mode-router/tests/run-tests.cjs — v0.3 单元测试
// 跑：node skills/mode-router/tests/run-tests.cjs
//
// 覆盖（C1 任务要求 + 历史 case）：
//   T1 score=7+ → manager_worker
//   T2 3 ≤ score < 6 → subagent_parallel
//   T3 含 review → peer_review
//   T4 score < 3 → solo
//   T5 显式 solo → forced solo
//   T6 model 字段：manager=opus，worker=sonnet

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const RUN = path.join(ROOT, "skills", "mode-router", "run.cjs");

let pass = 0;
let fail = 0;
const failures = [];

function runFine(input) {
  const r = spawnSync("node", [RUN, "--fine", JSON.stringify(input)], {
    encoding: "utf-8",
    cwd: ROOT,
  });
  // stdout has the JSON; helix --report banner goes to stderr
  // but we may also see "[helix] ✅" interleaved as side-effect. Take first valid JSON object.
  const out = r.stdout || "";
  // find first '{'
  const i = out.indexOf("{");
  if (i < 0) {
    throw new Error(
      `no JSON in stdout. stdout=${out.slice(0, 200)} stderr=${(r.stderr || "").slice(0, 200)}`,
    );
  }
  return JSON.parse(out.slice(i));
}

function assert(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(`${name}: ${detail}`);
    console.log(`  ❌ ${name}  ${detail || ""}`);
  }
}

console.log("=== mode-router v0.3 tests ===\n");

// T1: 高分 → manager_worker
console.log("T1 score≥6 → manager_worker");
{
  const r = runFine({
    task: "前端 + 后端 同时做，重构 OAuth 模块",
    files_changed_count: 12,
    steps_count: 12,
  });
  assert("T1.mode=team", r.mode === "team", `mode=${r.mode}`);
  assert("T1.score≥6", r.score >= 6, `score=${r.score}`);
  assert(
    "T1.shape=manager_worker",
    r.team_plan && r.team_plan.shape === "manager_worker",
    `shape=${r.team_plan && r.team_plan.shape}`,
  );
  // 检查二层结构
  const mgr = r.team_plan && r.team_plan.agents && r.team_plan.agents[0];
  assert(
    "T1.agents[0].role=manager",
    mgr && mgr.role === "manager",
    `role=${mgr && mgr.role}`,
  );
  assert(
    "T1.manager.model=opus",
    mgr && mgr.model === "opus",
    `model=${mgr && mgr.model}`,
  );
  assert(
    "T1.manager.subordinates ≥2",
    mgr && Array.isArray(mgr.subordinates) && mgr.subordinates.length >= 2,
    `subordinates=${mgr && mgr.subordinates && mgr.subordinates.length}`,
  );
  assert(
    "T1.subordinates[0].model=sonnet",
    mgr && mgr.subordinates[0] && mgr.subordinates[0].model === "sonnet",
    `model=${mgr && mgr.subordinates[0] && mgr.subordinates[0].model}`,
  );
  assert(
    "T1.subordinates[0].role contains worker",
    mgr && mgr.subordinates[0] && /worker/.test(mgr.subordinates[0].role),
    `role=${mgr && mgr.subordinates[0] && mgr.subordinates[0].role}`,
  );
}

// T2: 3 ≤ score < 6 → subagent_parallel (扁平)
console.log("\nT2 3≤score<6 → subagent_parallel");
{
  const r = runFine({
    task: "前端拆分多模块",
    files_changed_count: 2,
    steps_count: 3,
  });
  assert("T2.mode=team", r.mode === "team", `mode=${r.mode}`);
  assert("T2.score<6", r.score < 6 && r.score >= 3, `score=${r.score}`);
  assert(
    "T2.shape=subagent_parallel",
    r.team_plan && r.team_plan.shape === "subagent_parallel",
    `shape=${r.team_plan && r.team_plan.shape}`,
  );
  // 扁平：agents 都是 worker，没有 manager
  const ags = r.team_plan && r.team_plan.agents;
  assert(
    "T2.agents 全是 worker",
    ags && ags.every((a) => /worker/.test(a.role)),
    `roles=${ags && ags.map((a) => a.role).join(",")}`,
  );
  assert(
    "T2.agents 无 subordinates",
    ags && ags.every((a) => !a.subordinates),
    ``,
  );
  assert(
    "T2.worker.model=sonnet",
    ags && ags[0] && ags[0].model === "sonnet",
    `model=${ags && ags[0] && ags[0].model}`,
  );
}

// T3: review → peer_review
console.log("\nT3 含 review → peer_review");
{
  const r = runFine({
    task: "独立 review 这个模块",
    files_changed_count: 1,
    steps_count: 2,
  });
  assert("T3.mode=team", r.mode === "team", `mode=${r.mode}`);
  assert(
    "T3.team_type=peer_review",
    r.team_type === "peer_review",
    `team_type=${r.team_type}`,
  );
  assert(
    "T3.shape=peer_review",
    r.team_plan && r.team_plan.shape === "peer_review",
    `shape=${r.team_plan && r.team_plan.shape}`,
  );
  const ags = r.team_plan && r.team_plan.agents;
  assert(
    "T3.has implementer + reviewer",
    ags &&
      ags.length === 2 &&
      ags[0].role === "implementer" &&
      ags[1].role === "reviewer",
    `roles=${ags && ags.map((a) => a.role).join(",")}`,
  );
  assert(
    "T3.implementer.model=sonnet",
    ags && ags[0] && ags[0].model === "sonnet",
    ``,
  );
  assert(
    "T3.reviewer.model=sonnet",
    ags && ags[1] && ags[1].model === "sonnet",
    ``,
  );
}

// T4: 小任务 → solo
console.log("\nT4 score<3 → solo");
{
  const r = runFine({
    task: "修个 typo",
    files_changed_count: 1,
    steps_count: 1,
  });
  assert("T4.mode=solo", r.mode === "solo", `mode=${r.mode}`);
  assert(
    "T4.no team_plan",
    r.team_plan == null,
    `team_plan=${JSON.stringify(r.team_plan)}`,
  );
}

// T5: 显式 solo
console.log("\nT5 显式 solo 覆盖");
{
  const r = runFine({
    task: "前端 + 后端 同时做（但 solo 跑就行）",
    files_changed_count: 12,
    steps_count: 12,
  });
  assert("T5.mode=solo", r.mode === "solo", `mode=${r.mode}`);
  assert("T5.score=-999", r.score === -999, `score=${r.score}`);
}

// T6: 配置外置后阈值仍生效（manager_worker 阈值 6）
console.log("\nT6 manager_worker 阈值 = 6");
{
  // score 恰好 = 6（review +3 + cross_domain +2 + long_task +1 = 6）
  // 但 review 优先 peer_review，所以构造另一个：files_many +3 + parallel +2 = 5 → subagent_parallel
  // 然后 +1 拉到 6
  const r = runFine({
    task: "重构前端组件并行拆分",
    files_changed_count: 12, // +3 files_many
    steps_count: 12, // +1 steps_some
  });
  // parallel(并行/拆分=+4 max) + refactor(+1) + files_many(+3) + steps_some(+1) = 9 → manager_worker
  assert("T6.score≥6", r.score >= 6, `score=${r.score}`);
  assert(
    "T6.shape=manager_worker",
    r.team_plan && r.team_plan.shape === "manager_worker",
    `shape=${r.team_plan && r.team_plan.shape}`,
  );
}

// R 系列：v0.9 真实日志回归（基于 2026-5 真实使用样本，已脱敏）
// 旧版正则 100% 漏匹配中文 task_desc，R1-R5 保证不再回退
console.log("\n--- R series: real-log regression (v0.9) ---");

console.log("\nR1 真实样本：跨端任务（接口+页）应触发 cross_domain");
{
  const r = runFine({
    task: "对接已发布的接口 + 新建相册详情页 + 跳转链路收口 + 自测",
    files_changed_count: 3,
    steps_count: 4,
  });
  assert(
    "R1.has cross_domain",
    r.breakdown && r.breakdown.cross_domain > 0,
    `breakdown=${JSON.stringify(r.breakdown)}`,
  );
  assert("R1.score>0", r.score > 0, `score=${r.score}`);
}

console.log("\nR2 真实样本：纯后端 controller/repository → score>0");
{
  const r = runFine({
    task: "调研 controller 入口的自动退款倒计时逻辑，定位 service 写在哪个 repository",
    files_changed_count: 2,
    steps_count: 3,
  });
  assert(
    "R2.matched backend",
    r.signals && r.signals.backend && r.signals.backend.length > 0,
    `backend signals=${JSON.stringify(r.signals && r.signals.backend)}`,
  );
  // 单端任务不要求达 team 阈值，但至少要有信号
  assert(
    "R2.has long_task or backend signal logged",
    r.score > 0 || (r.signals.backend && r.signals.backend.length > 0),
    `score=${r.score}`,
  );
}

console.log("\nR3 真实样本：纯前端表单/弹窗 → 命中 frontend 信号");
{
  const r = runFine({
    task: "上传文件页表单修复：自动写文案默认关闭；用户偏好默认收起；弹窗按钮对齐设计稿",
    files_changed_count: 2,
    steps_count: 3,
  });
  assert(
    "R3.matched frontend",
    r.signals && r.signals.frontend && r.signals.frontend.length > 0,
    `frontend signals=${JSON.stringify(r.signals && r.signals.frontend)}`,
  );
}

console.log("\nR4 真实样本：长 cross-domain 任务（>100 字） → 应进 team");
{
  const r = runFine({
    task:
      "三段任务：(1) /init 初始化项目；约束图片处理（后端返相对路径 + 域名接口）；建本地 .claude/ 目录存所有产物（含 CLAUDE.md），加 .gitignore；(2) 核对 lib/modules 是否对应 3 张截图；理清模块逻辑；(3) 整理跳转逻辑 + 接口逻辑，生成文档",
    files_changed_count: 5,
    steps_count: 6,
  });
  assert(
    "R4.has cross_domain",
    r.breakdown && r.breakdown.cross_domain > 0,
    `breakdown=${JSON.stringify(r.breakdown)}`,
  );
  assert(
    "R4.has long_task",
    r.breakdown && r.breakdown.long_task > 0,
    `breakdown=${JSON.stringify(r.breakdown)}`,
  );
  assert("R4.mode=team", r.mode === "team", `mode=${r.mode}, score=${r.score}`);
}

console.log("\nR5 真实样本：rest/spring controller → backend 信号");
{
  const r = runFine({
    task: "Spring controller 用 @PreAuthorize 拦截 REST 接口返回 403，定位是哪个注解配错",
    files_changed_count: 1,
    steps_count: 2,
  });
  assert(
    "R5.matched backend",
    r.signals && r.signals.backend && r.signals.backend.length > 0,
    `backend=${JSON.stringify(r.signals && r.signals.backend)}`,
  );
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
