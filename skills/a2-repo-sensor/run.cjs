"use strict";
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SKILL_DIR = __dirname;
const HELIX_RUN = path.join(process.cwd(), "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a2-repo-sensor";

function nowBJ() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${bj.getUTCFullYear()}-${bj.getUTCMonth() + 1}-${bj.getUTCDate()} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

const IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "__pycache__",
  ".venv",
];
const TECH_MARKERS = {
  "package.json": "Node.js",
  "tsconfig.json": "TypeScript",
  "Cargo.toml": "Rust",
  "go.mod": "Go",
  "requirements.txt": "Python",
  "pyproject.toml": "Python",
  "pom.xml": "Java/Maven",
  "build.gradle": "Java/Gradle",
  Gemfile: "Ruby",
  "composer.json": "PHP",
};

function run(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function buildTree(dir, depth = 0, maxDepth = 3) {
  if (depth >= maxDepth) return "";
  let lines = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return "";
  }
  entries
    .filter((e) => !IGNORE.includes(e.name) && !e.name.startsWith("."))
    .slice(0, 20)
    .forEach((e) => {
      const indent = "  ".repeat(depth);
      lines.push(`${indent}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory())
        lines.push(buildTree(path.join(dir, e.name), depth + 1, maxDepth));
    });
  return lines.filter(Boolean).join("\n");
}

function detectStack(root) {
  return Object.entries(TECH_MARKERS)
    .filter(([file]) => fs.existsSync(path.join(root, file)))
    .map(([, tech]) => tech);
}

function findKeyFiles(root) {
  const candidates = [
    "CLAUDE.md",
    "README.md",
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    ".env.example",
  ];
  return candidates.filter((f) => fs.existsSync(path.join(root, f)));
}

function main() {
  const startMs = Date.now();
  const root = process.cwd();
  const ts = nowBJ();

  const recentCommits = run("git log --oneline -10")
    .split("\n")
    .filter(Boolean);
  const dirtyFiles = run("git status --short").split("\n").filter(Boolean);
  const hasTests =
    fs.existsSync(path.join(root, "test")) ||
    fs.existsSync(path.join(root, "__tests__")) ||
    fs.existsSync(path.join(root, "spec"));
  const hasCi =
    fs.existsSync(path.join(root, ".github/workflows")) ||
    fs.existsSync(path.join(root, ".gitlab-ci.yml"));

  let deps = {};
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {}
  }

  const ctx = {
    root,
    tech_stack: detectStack(root),
    key_files: findKeyFiles(root),
    tree: buildTree(root),
    recent_commits: recentCommits,
    dirty_files: dirtyFiles,
    has_tests: hasTests,
    has_ci: hasCi,
    dependencies: Object.keys(deps).slice(0, 20),
    generated_at: ts,
  };

  const out = JSON.stringify(ctx, null, 2);

  // Write to tmp for helix to read
  const tmpPath = path.join(root, "_tmp_repo_ctx.json");
  fs.writeFileSync(tmpPath, out, "utf-8");
  process.stderr.write(`[a2-repo-sensor] RepoContext written to ${tmpPath}\n`);

  // Ralph passes 判定：成功扫到根目录 + 至少识别 1 项（key_file/tech/commit）即 pass
  const passes =
    ctx.key_files.length > 0 ||
    ctx.tech_stack.length > 0 ||
    ctx.recent_commits.length > 0;
  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `扫到 ${ctx.tech_stack.join("/") || "未知栈"}，${ctx.key_files.length} 个关键文件，${ctx.dirty_files.length} 个脏文件`
      : "未识别到任何技术栈/关键文件/提交记录",
    output: {
      tech_stack: ctx.tech_stack,
      key_files: ctx.key_files,
      dirty_count: ctx.dirty_files.length,
      tmp_path: tmpPath,
    },
    duration_ms: Date.now() - startMs,
    errors: passes ? [] : ["empty_repo_context"],
    ts,
  };

  // 1) 自留底
  fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true });
  const line = JSON.stringify({
    ...result,
    user_feedback: { rating: null, fix_notes: null },
  });
  JSON.parse(line);
  fs.appendFileSync(RUNS_LOG, line + "\n", "utf-8");

  // 2) 上报 helix（领导汇报）
  if (fs.existsSync(HELIX_RUN)) {
    spawnSync("node", [HELIX_RUN, "--report", PHASE, JSON.stringify(result)], {
      stdio: "inherit",
      cwd: root,
    });
  }

  // 3) stdout 给 LLM（保留原 RepoContext 全文，让 LLM 用）
  console.log(out);
}

main();
