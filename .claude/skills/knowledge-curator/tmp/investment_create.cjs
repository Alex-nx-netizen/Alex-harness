// Knowledge-curator M1.6 Phase 4 executor: chunked create + append
// Lessons applied:
//   F-010: parse j.data.doc_id / j.data.doc_url (NOT j.objToken)
//   F-011: pre-write ALL chunks to disk BEFORE first network call
//   F-013: log every step so failure mid-run is recoverable
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SHELL = "E:\\java\\tools\\git\\Git\\usr\\bin\\bash.exe";
const SRC = path.join(__dirname, "investment_full.md");
const TITLE = "[AI学习] 穷人理财 10 种低门槛方法（百家号思守一财经）";
const WIKI_SPACE = "my_library";

function shInherit(cmd) {
  const scriptPath = path.join(__dirname, `_run_inv_${Date.now()}.sh`);
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

function writeChunkToFile(chunk, idx) {
  const p = path.join(
    __dirname,
    `inv_chunk_${String(idx).padStart(3, "0")}.md`,
  );
  fs.writeFileSync(p, chunk, "utf-8");
  return p;
}

function main() {
  const md = fs.readFileSync(SRC, "utf-8");
  const chunks = chunkMarkdown(md, 6000);
  console.log(
    `[INFO] split into ${chunks.length} chunk(s); total JS chars=${md.length}`,
  );
  chunks.forEach((c, i) =>
    console.log(
      `  chunk ${i}: ${c.length} chars, lines=${c.split("\n").length}`,
    ),
  );

  // F-011 fix: pre-write ALL chunks to disk BEFORE any network call
  const chunkPaths = chunks.map((c, i) => writeChunkToFile(c, i));
  console.log(`\n[F-011] all ${chunks.length} chunk files pre-written to disk`);

  // Step 1: create doc with chunk 0
  console.log(
    `\n[STEP 1] Creating doc with chunk 0 (${chunks[0].length} chars)...`,
  );
  const createCmd = [
    `lark-cli docs +create`,
    `--title "${TITLE.replace(/"/g, '\\"')}"`,
    `--wiki-space ${WIKI_SPACE}`,
    `--as user`,
    `--markdown "$(cat '${chunkPaths[0]}')"`,
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

  // F-010 fix: parse j.data.doc_id / j.data.doc_url (NOT j.objToken)
  let docId = null;
  let docUrl = null;
  try {
    const j = JSON.parse(createOut);
    docId = j.data && (j.data.doc_id || j.data.docId || j.data.token);
    docUrl = j.data && (j.data.doc_url || j.data.docUrl || j.data.url);
  } catch (_) {
    // fallback: regex
    const tokenMatch = createOut.match(/([A-Za-z0-9]{20,})/g);
    const urlMatch = createOut.match(/https:\/\/[^\s'"]+/);
    if (urlMatch) docUrl = urlMatch[0];
    if (!docId && tokenMatch) docId = tokenMatch[tokenMatch.length - 1];
  }

  console.log(`[CREATED] docId=${docId}, docUrl=${docUrl}`);

  if (!docId && !docUrl) {
    console.error("[FATAL] could not parse doc token from create output");
    process.exit(2);
  }

  // Step 2: append remaining chunks
  const docRef = docUrl || docId;
  for (let i = 1; i < chunks.length; i++) {
    console.log(
      `\n[STEP 2.${i}] Appending chunk ${i} (${chunks[i].length} chars)...`,
    );
    const appendCmd = [
      `lark-cli docs +update`,
      `--doc "${docRef}"`,
      `--mode append`,
      `--as user`,
      `--markdown "$(cat '${chunkPaths[i]}')"`,
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
    }
  }

  console.log("\n[DONE]");
  console.log(`docId:    ${docId}`);
  console.log(`docUrl:   ${docUrl}`);
  console.log(`chunks_total: ${chunks.length}`);

  // Persist result for next phase
  const result = {
    doc_id: docId,
    doc_url: docUrl,
    chunks_total: chunks.length,
    title: TITLE,
    wiki_space: WIKI_SPACE,
    created_at_bj: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    })(),
  };
  fs.writeFileSync(
    path.join(__dirname, "investment_result.json"),
    JSON.stringify(result, null, 2),
    "utf-8",
  );
  console.log("[RESULT] persisted to investment_result.json");
}

main();
