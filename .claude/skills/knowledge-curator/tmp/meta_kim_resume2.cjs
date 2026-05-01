// Recovery v2: re-split source markdown, append chunks 1+ to existing doc
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SHELL = "E:\\java\\tools\\git\\Git\\usr\\bin\\bash.exe";
const SRC = path.join(__dirname, "meta_kim_full.md");
const DOC_ID = "CvoddVmcDo2wyOxlm5tcq6DhnzW";
const DOC_URL = "https://www.feishu.cn/wiki/NBNLwMjOziZHOtkyYb2ch91tnug";

function shInherit(cmd) {
  const scriptPath = path.join(
    __dirname,
    `_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.sh`,
  );
  fs.writeFileSync(scriptPath, cmd, "utf-8");
  try {
    return execSync(`"${SHELL}" "${scriptPath}"`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch (_) {}
  }
}

function chunkMarkdown(md, maxChars = 6000) {
  const lines = md.split("\n");
  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const line of lines) {
    const lineLen = line.length + 1;
    const isMajorBreak = /^##\s/.test(line) || /^---\s*$/.test(line);
    if (isMajorBreak && curLen + lineLen > maxChars && cur.length > 0) {
      chunks.push(cur.join("\n"));
      cur = [];
      curLen = 0;
    }
    cur.push(line);
    curLen += lineLen;
    if (curLen > maxChars * 1.5) {
      chunks.push(cur.join("\n"));
      cur = [];
      curLen = 0;
    }
  }
  if (cur.length > 0) chunks.push(cur.join("\n"));
  return chunks;
}

const md = fs.readFileSync(SRC, "utf-8");
const chunks = chunkMarkdown(md, 6000);
console.log(`[INFO] re-split into ${chunks.length} chunks`);
chunks.forEach((c, i) => console.log(`  chunk ${i}: ${c.length} chars`));

// Skip chunk 0 (already in doc), append chunks 1..end
for (let i = 1; i < chunks.length; i++) {
  const cp = path.join(__dirname, `chunk_${String(i).padStart(3, "0")}.md`);
  fs.writeFileSync(cp, chunks[i], "utf-8");
  console.log(`\n[APPEND ${i}] (${chunks[i].length} chars)...`);
  const cmd = [
    `lark-cli docs +update`,
    `--doc "${DOC_ID}"`,
    `--mode append`,
    `--as user`,
    `--markdown "$(cat '${cp}')"`,
  ].join(" ");
  try {
    const out = shInherit(cmd);
    console.log(`  [OK]`, out.trim().slice(0, 200));
  } catch (e) {
    console.error(`  [ERR] chunk ${i}:`, e.message);
    if (e.stdout) console.error("  stdout:", e.stdout.toString().slice(0, 500));
    if (e.stderr) console.error("  stderr:", e.stderr.toString().slice(0, 500));
  }
}

console.log("\n[DONE]");
console.log(`docId:  ${DOC_ID}`);
console.log(`docUrl: ${DOC_URL}`);
console.log(`chunks_appended: ${chunks.length - 1}`);
