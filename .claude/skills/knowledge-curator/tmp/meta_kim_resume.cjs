// Recovery: append chunks 1 and 2 to existing doc CvoddVmcDo2wyOxlm5tcq6DhnzW
// (Initial create succeeded but parser missed the data.doc_id path)
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SHELL = "E:\\java\\tools\\git\\Git\\usr\\bin\\bash.exe";
const DOC_ID = "CvoddVmcDo2wyOxlm5tcq6DhnzW";
const DOC_URL = "https://www.feishu.cn/wiki/NBNLwMjOziZHOtkyYb2ch91tnug";

function shInherit(cmd) {
  const scriptPath = path.join(__dirname, `_run_${Date.now()}.sh`);
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

const chunksToAppend = [1, 2];
for (const i of chunksToAppend) {
  const cp = path.join(__dirname, `chunk_${String(i).padStart(3, "0")}.md`);
  if (!fs.existsSync(cp)) {
    console.error(`[ERR] chunk ${i} missing at ${cp}`);
    process.exit(3);
  }
  const size = fs.statSync(cp).size;
  console.log(`\n[APPEND ${i}] (${size} bytes)...`);
  const cmd = [
    `lark-cli docs +update`,
    `--doc "${DOC_ID}"`,
    `--mode append`,
    `--as user`,
    `--markdown "$(cat '${cp}')"`,
  ].join(" ");
  try {
    const out = shInherit(cmd);
    console.log(`  [OK]`, out.trim().slice(0, 300));
  } catch (e) {
    console.error(`  [ERR] chunk ${i} append failed:`, e.message);
    if (e.stdout) console.error("  stdout:", e.stdout.toString().slice(0, 600));
    if (e.stderr) console.error("  stderr:", e.stderr.toString().slice(0, 600));
  }
}

console.log("\n[DONE]");
console.log(`docId:  ${DOC_ID}`);
console.log(`docUrl: ${DOC_URL}`);
