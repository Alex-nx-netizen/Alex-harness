// Fix L4 errors[0] reference: "F-009" → "F-010"（F-009 已被时间格式占用）
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "..", "logs", "runs.jsonl");

const lines = fs.readFileSync(LOG, "utf-8").split("\n").filter(Boolean);
const obj = JSON.parse(lines[3]);
if (obj.run_id !== "2026-4-29-meta-kim") {
  console.error("[ERR] L4 run_id mismatch");
  process.exit(1);
}
obj.errors[0] = obj.errors[0].replace("F-009", "F-010");
lines[3] = JSON.stringify(obj);
lines.forEach((l) => JSON.parse(l));
fs.writeFileSync(LOG, lines.join("\n") + "\n", "utf-8");
const recheck = fs.readFileSync(LOG, "utf-8").split("\n").filter(Boolean);
recheck.forEach((l) => JSON.parse(l));
console.log(
  `[OK] L4 errors[0] F-009→F-010; ${recheck.length} lines all valid JSON`,
);
