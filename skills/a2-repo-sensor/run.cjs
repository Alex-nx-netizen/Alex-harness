"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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
  const root = process.cwd();
  const now = new Date();
  const ts = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

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
  console.log(out);

  // Write to tmp for helix to read
  const tmpPath = path.join(root, "_tmp_repo_ctx.json");
  fs.writeFileSync(tmpPath, out, "utf-8");
  process.stderr.write(`[a2-repo-sensor] RepoContext written to ${tmpPath}\n`);
}

main();
