// Knowledge-curator Phase 4 executor: chunked create + append
// Lessons from prior run (2026-4-28-harness-trilogy):
//   1. lark-cli --markdown has shell-imposed size limit -> chunk
//   2. must use explicit Git bash at E:\java\tools\git\Git\usr\bin\bash.exe
//   3. UTF-8 bytes ~3x JS char count for Chinese
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SHELL = "E:\\java\\tools\\git\\Git\\usr\\bin\\bash.exe";
const SRC = path.join(__dirname, "meta_kim_full.md");
const TITLE = '[AI学习] Meta_Kim — 老金"元"方法论的开源工程落地';
const WIKI_SPACE = "my_library";

function sh(cmd) {
  return execSync(cmd, {
    shell: SHELL,
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function shInherit(cmd) {
  // For very long commands, write to a temp shell script
  const scriptPath = path.join(__dirname, `_run_${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, cmd, "utf-8");
  try {
    const out = execSync(`"${SHELL}" "${scriptPath}"`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
    return out;
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch (_) {}
  }
}

// Chunking strategy: split by ## major headings, ensure each chunk <= 6000 JS chars
function chunkMarkdown(md, maxChars = 6000) {
  const lines = md.split("\n");
  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const line of lines) {
    const lineLen = line.length + 1;
    // Boundary: start of a top-level heading we want as chunk break (## or ---)
    const isMajorBreak = /^##\s/.test(line) || /^---\s*$/.test(line);
    if (isMajorBreak && curLen + lineLen > maxChars && cur.length > 0) {
      chunks.push(cur.join("\n"));
      cur = [];
      curLen = 0;
    }
    cur.push(line);
    curLen += lineLen;
    if (curLen > maxChars * 1.5) {
      // emergency split
      chunks.push(cur.join("\n"));
      cur = [];
      curLen = 0;
    }
  }
  if (cur.length > 0) chunks.push(cur.join("\n"));
  return chunks;
}

function writeChunkToFile(chunk, idx) {
  const p = path.join(__dirname, `chunk_${String(idx).padStart(3, "0")}.md`);
  fs.writeFileSync(p, chunk, "utf-8");
  return p;
}

function main() {
  const md = fs.readFileSync(SRC, "utf-8");
  const chunks = chunkMarkdown(md, 6000);
  console.log(
    `[INFO] split into ${chunks.length} chunks; total JS chars=${md.length}`,
  );
  chunks.forEach((c, i) =>
    console.log(
      `  chunk ${i}: ${c.length} chars, lines=${c.split("\n").length}`,
    ),
  );

  // Step 1: create doc with first chunk
  const chunk0Path = writeChunkToFile(chunks[0], 0);
  console.log(
    `\n[STEP 1] Creating doc with chunk 0 (${chunks[0].length} chars)...`,
  );
  const createCmd = [
    `lark-cli docs +create`,
    `--title "${TITLE.replace(/"/g, '\\"')}"`,
    `--wiki-space ${WIKI_SPACE}`,
    `--as user`,
    `--markdown "$(cat '${chunk0Path}')"`,
  ].join(" ");

  let createOut;
  try {
    createOut = shInherit(createCmd);
  } catch (e) {
    console.error("[ERR] create failed:", e.message);
    if (e.stdout) console.error("stdout:", e.stdout.toString());
    if (e.stderr) console.error("stderr:", e.stderr.toString());
    process.exit(1);
  }

  console.log("[CREATE OUT]", createOut);

  // Parse doc_token / doc_url from output (JSON or pretty)
  let docToken = null;
  let docUrl = null;
  try {
    const j = JSON.parse(createOut);
    docToken = j.objToken || j.obj_token || j.token || j.docToken;
    docUrl = j.url || j.docUrl;
  } catch (_) {
    // pretty / table; try regex
    const tokenMatch = createOut.match(/([A-Za-z0-9]{20,})/g);
    const urlMatch = createOut.match(/https:\/\/[^\s'"]+/);
    if (urlMatch) docUrl = urlMatch[0];
    if (!docToken && tokenMatch) docToken = tokenMatch[tokenMatch.length - 1];
  }

  console.log(`[CREATED] docToken=${docToken}, docUrl=${docUrl}`);

  if (!docToken && !docUrl) {
    console.error("[FATAL] could not parse doc token from create output");
    process.exit(2);
  }

  // Step 2: append remaining chunks
  const docRef = docUrl || docToken;
  for (let i = 1; i < chunks.length; i++) {
    const cp = writeChunkToFile(chunks[i], i);
    console.log(
      `\n[STEP 2.${i}] Appending chunk ${i} (${chunks[i].length} chars)...`,
    );
    const appendCmd = [
      `lark-cli docs +update`,
      `--doc "${docRef}"`,
      `--mode append`,
      `--as user`,
      `--markdown "$(cat '${cp}')"`,
    ].join(" ");
    try {
      const out = shInherit(appendCmd);
      console.log(`  [OK] chunk ${i}:`, out.trim().slice(0, 200));
    } catch (e) {
      console.error(`  [ERR] chunk ${i} append failed:`, e.message);
      if (e.stdout)
        console.error("  stdout:", e.stdout.toString().slice(0, 500));
      if (e.stderr)
        console.error("  stderr:", e.stderr.toString().slice(0, 500));
      // continue to next chunk; report errors at end
    }
  }

  console.log("\n[DONE]");
  console.log(`docToken: ${docToken}`);
  console.log(`docUrl:   ${docUrl}`);
  console.log(`chunks_total: ${chunks.length}`);
}

main();
