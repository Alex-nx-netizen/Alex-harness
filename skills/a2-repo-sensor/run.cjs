"use strict";
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { nowBJ } = require("../../_meta/lib/common.cjs");

const SKILL_DIR = __dirname;
const HELIX_RUN = path.join(process.cwd(), "skills", "helix", "run.cjs");
const RUNS_LOG = path.join(SKILL_DIR, "logs", "runs.jsonl");
const PHASE = "a2-repo-sensor";

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

// v0.8 #7：轻量 repo-map（无 tree-sitter 依赖）
// 用 grep 在常见源目录抽 function/class/export/def/struct 的第一行签名
// 上限 80 行；超出说明仓库太大，应该让 LLM 用 Glob/Grep 精准查
function buildRepoMap(root) {
  const SRC_DIRS = ["src", "lib", "skills", "app", "packages", "internal", "pkg", "cmd"];
  const exists = SRC_DIRS.filter((d) => fs.existsSync(path.join(root, d)));
  if (exists.length === 0) return { dirs_scanned: [], symbols: [], note: "no standard src dirs" };

  // 跨语言通用：JS/TS export+function+class / Python def+class / Go func+type / Rust fn+struct+pub fn
  // 每个文件只抽前 5 个符号，整体上限 80
  const pattern =
    "^(export\\s+(async\\s+)?function|export\\s+(default\\s+)?(async\\s+)?function|" +
    "export\\s+(default\\s+)?class|" +
    "export\\s+(const|let|var)\\s+\\w+\\s*=\\s*(async\\s+)?\\(|" +
    "function\\s+\\w+|class\\s+\\w+|" +
    "def\\s+\\w+|class\\s+\\w+\\s*[:\\(]|" +
    "func\\s+\\w+|type\\s+\\w+|" +
    "(pub\\s+)?fn\\s+\\w+|struct\\s+\\w+|trait\\s+\\w+)";

  const symbols = [];
  for (const d of exists) {
    const cmd = `grep -rEn "${pattern}" "${path.join(root, d)}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.kt" 2>/dev/null | head -100`;
    let out = "";
    try {
      out = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      continue;
    }
    for (const line of out.split("\n")) {
      if (!line) continue;
      // 格式：path:line_no:source
      const m = line.match(/^([^:]+):(\d+):(.*)$/);
      if (!m) continue;
      const file = path.relative(root, m[1]);
      symbols.push({
        file,
        line: parseInt(m[2], 10),
        sig: m[3].trim().slice(0, 120),
      });
      if (symbols.length >= 80) break;
    }
    if (symbols.length >= 80) break;
  }
  return {
    dirs_scanned: exists,
    symbols,
    truncated: symbols.length >= 80,
    note: "v0.8 grep-based; 升级到 tree-sitter 是 v0.9 plan",
  };
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
    repo_map: buildRepoMap(root), // v0.8 #7: 轻量函数签名地图
    generated_at: ts,
  };

  const out = JSON.stringify(ctx, null, 2);

  // v0.9：曾经写 `<root>/_tmp_repo_ctx.json` 中转给 helix 用，实际无 phase 读取（死代码）。
  // 历史污染：外部业务项目根目录都遗留该文件。
  // 现在：把完整 ctx 写到 `_meta/repo-ctx-snapshot.json`（meta 内部，不污染项目根），
  // 同时 unlink 旧的 `<root>/_tmp_repo_ctx.json`（如果存在），向后兼容清理
  const metaDir = path.join(root, "_meta");
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  const tmpPath = path.join(metaDir, "repo-ctx-snapshot.json");
  fs.writeFileSync(tmpPath, out, "utf-8");
  process.stderr.write(`[a2-repo-sensor] RepoContext written to ${tmpPath}\n`);
  const legacyPath = path.join(root, "_tmp_repo_ctx.json");
  if (fs.existsSync(legacyPath)) {
    try { fs.unlinkSync(legacyPath); } catch (_) {}
  }

  // Ralph passes 判定：成功扫到根目录 + 至少识别 1 项（key_file/tech/commit）即 pass
  const passes =
    ctx.key_files.length > 0 ||
    ctx.tech_stack.length > 0 ||
    ctx.recent_commits.length > 0;
  const result = {
    phase: PHASE,
    passes,
    summary: passes
      ? `扫到 ${ctx.tech_stack.join("/") || "未知栈"}，${ctx.key_files.length} 个关键文件，${ctx.dirty_files.length} 个脏文件，repo_map ${ctx.repo_map.symbols.length} 符号`
      : "未识别到任何技术栈/关键文件/提交记录",
    output: {
      tech_stack: ctx.tech_stack,
      key_files: ctx.key_files,
      dirty_count: ctx.dirty_files.length,
      repo_map_symbols: ctx.repo_map.symbols.length,
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
