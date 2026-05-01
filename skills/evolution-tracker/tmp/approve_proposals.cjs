// 把 P-002 + P-003 status: pending → approved，写 decided_at + decided_by + applied_via
const fs = require("fs");
const path = require("path");
const INDEX = path.join(
  __dirname,
  "..",
  "..",
  "knowledge-curator",
  "references",
  "skill-proposals",
  "_index.jsonl",
);
const lines = fs.readFileSync(INDEX, "utf-8").split("\n").filter(Boolean);
const NOW = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
})();

let approved = 0;
const out = lines.map((line) => {
  const obj = JSON.parse(line);
  if (
    obj.proposal_id === "P-2026-4-29-002" ||
    obj.proposal_id === "P-2026-4-29-003"
  ) {
    obj.status = "approved";
    obj.decided_at = NOW;
    obj.decided_by = "user";
    obj.applied_via =
      "manual_edit (Edit tool, F-013 候选: .diff 不是真 unified diff)";
    approved++;
  }
  return JSON.stringify(obj);
});
out.forEach((l) => JSON.parse(l));
fs.writeFileSync(INDEX, out.join("\n") + "\n", "utf-8");
const recheck = fs.readFileSync(INDEX, "utf-8").split("\n").filter(Boolean);
recheck.forEach((l) => JSON.parse(l));
console.log(
  `[OK] ${approved} proposals approved; ${recheck.length} lines all valid JSON`,
);
