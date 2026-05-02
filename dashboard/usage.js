"use strict";
/**
 * Claude Code session token aggregator — algorithm aligned to ccstatusline.
 *
 * Key correctness fixes vs naive `sum(message.usage)`:
 *   1. Streaming dedup — Claude writes ~3 partial JSONL rows per API turn.
 *      Only the row with non-null stop_reason is the final / authoritative one.
 *      Keep: stop_reason truthy, OR (stop_reason===null AND last entry overall).
 *      If no entry has stop_reason field at all → keep everything (older format).
 *   2. Skip isSidechain (subagent transcript duplicates parent tokens).
 *   3. Skip isApiErrorMessage.
 *   4. Use cache_creation_input_tokens (NOT ephemeral_5m + ephemeral_1h —
 *      those are nested sub-fields and would double-count).
 *   5. Context length = single most-recent main-chain entry, not a sum.
 *
 * Cost (Anthropic public per-million-token rates):
 *   sonnet-4-6 / 4-5: $3 in, $15 out, 0.1× in (cache_read), 1.25× in (5m),
 *                     2× in (1h)
 *   opus-4-7   / 4-5: $15, $75, 0.1×, 1.25×, 2×
 *   haiku-4-5       : $1,  $5,  0.1×, 1.25×, 2×
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const PRICE = {
  // Sonnet 4.5/4.6 — verified vs /status: $12.53 = 3.4K×$3 + 212.9K×$15 + 20.8M×$0.30 + 826.1K×$3.75
  "claude-sonnet-4-6": {
    in: 3,
    out: 15,
    cacheR: 0.3,
    cacheW5m: 3.75,
    cacheW1h: 6.0,
  },
  "claude-sonnet-4-5": {
    in: 3,
    out: 15,
    cacheR: 0.3,
    cacheW5m: 3.75,
    cacheW1h: 6.0,
  },
  // Opus 4-6/4-7 — verified vs /status: $6.15 = 82×$5 + 38.1K×$25 + 8M×$0.50 + 189.4K×$6.25
  "claude-opus-4-7": {
    in: 5,
    out: 25,
    cacheR: 0.5,
    cacheW5m: 6.25,
    cacheW1h: 10.0,
  },
  "claude-opus-4-6": {
    in: 5,
    out: 25,
    cacheR: 0.5,
    cacheW5m: 6.25,
    cacheW1h: 10.0,
  },
  // Older Opus 4.5 (legacy premium tier — kept for back-compat)
  "claude-opus-4-5": {
    in: 15,
    out: 75,
    cacheR: 1.5,
    cacheW5m: 18.75,
    cacheW1h: 30.0,
  },
  "claude-haiku-4-5": {
    in: 1,
    out: 5,
    cacheR: 0.1,
    cacheW5m: 1.25,
    cacheW1h: 2.0,
  },
};
function priceFor(model) {
  if (!model) return PRICE["claude-sonnet-4-6"];
  for (const k of Object.keys(PRICE)) if (model.startsWith(k)) return PRICE[k];
  return PRICE["claude-sonnet-4-6"];
}

const DEFAULT_CTX_LIMIT = 200000;

function projectIdFor(cwd) {
  return cwd.replace(/[:\\/]/g, "-");
}
function projectsDir() {
  return path.join(os.homedir(), ".claude", "projects");
}
/** Recursively collect *.jsonl files under a directory (so subagent JSONLs in
 *  <session>/subagents/agent-*.jsonl are included). */
function collectJsonl(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      collectJsonl(fp, out);
    } else if (name.endsWith(".jsonl")) {
      out.push({ file: fp, mtime: st.mtimeMs, name });
    }
  }
}
function listSessions(projectId) {
  const dir = path.join(projectsDir(), projectId);
  const acc = [];
  collectJsonl(dir, acc);
  return acc
    .map((s) => ({
      id: s.name.replace(/\.jsonl$/, ""),
      file: s.file,
      mtime: s.mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}
function listAllProjectSessions() {
  const root = projectsDir();
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const proj of fs.readdirSync(root)) {
    const dir = path.join(root, proj);
    if (!fs.statSync(dir).isDirectory()) continue;
    const acc = [];
    collectJsonl(dir, acc);
    for (const s of acc) {
      out.push({
        project: proj,
        id: s.name.replace(/\.jsonl$/, ""),
        file: s.file,
        mtime: s.mtime,
      });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
/** For "current session" we want main session JSONL + its subagents/ */
function listCurrentSessionFiles(projectId) {
  const dir = path.join(projectsDir(), projectId);
  if (!fs.existsSync(dir)) return [];
  // Find the most recently modified top-level jsonl (main session)
  const top = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      return { file: fp, mtime: st.mtimeMs, base: f.replace(/\.jsonl$/, "") };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (top.length === 0) return [];
  const main = top[0];
  const result = [main.file];
  // Look for matching subagent dir
  const subDir = path.join(dir, main.base, "subagents");
  if (fs.existsSync(subDir)) {
    for (const f of fs
      .readdirSync(subDir)
      .filter((x) => x.endsWith(".jsonl"))) {
      result.push(path.join(subDir, f));
    }
  }
  return result;
}

/** Parse a JSONL file → array of entries that have message.usage */
function readUsageEntries(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const entries = [];
  for (const ln of lines) {
    if (!ln) continue;
    try {
      const d = JSON.parse(ln);
      if (d && d.message && d.message.usage) entries.push(d);
    } catch {
      /* skip malformed */
    }
  }
  return entries;
}

/** Dedup by message.id — Claude Code appends the same final message multiple
 *  times to the JSONL on resume/reconnect. Each duplicate carries identical
 *  usage values, so the correct fix is "first occurrence wins per msgId".
 *  This matches the magnitude of `claude --status`. */
function dedupByMsgId(entries) {
  const seen = new Set();
  const out = [];
  for (const d of entries) {
    const id = d.message && d.message.id;
    if (!id) {
      out.push(d);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out;
}

/** Cost for a single entry given its model */
function entryCost(entry) {
  const u = entry.message.usage || {};
  const m = entry.message.model || "claude-sonnet-4-6";
  const p = priceFor(m);
  const inT = u.input_tokens || 0;
  const outT = u.output_tokens || 0;
  const cR = u.cache_read_input_tokens || 0;
  const cC = u.cache_creation_input_tokens || 0;
  // Anthropic: cache_read = 0.1× in, cache_create_5m = 1.25× in, cache_create_1h = 2× in
  // We don't know the 5m/1h split per-entry without ephemeral sub-fields,
  // so fall back to an effective rate. ccusage uses sub-fields; we read them
  // ONLY for cost (not for token totals), to avoid double-count of cC.
  const c5 =
    (u.cache_creation && u.cache_creation.ephemeral_5m_input_tokens) || 0;
  const c1h =
    (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  let cacheCreateCost;
  if (c5 + c1h > 0) {
    cacheCreateCost = (c5 * (p.in * 1.25) + c1h * (p.in * 2)) / 1e6;
  } else {
    // No split available — approximate at 1.25× (5m default)
    cacheCreateCost = (cC * (p.in * 1.25)) / 1e6;
  }
  return (
    (inT * p.in) / 1e6 +
    (outT * p.out) / 1e6 +
    (cR * (p.in * 0.1)) / 1e6 +
    cacheCreateCost
  );
}

/** Aggregate one or more JSONL files (main session + its subagent files) → totals */
function aggregateSession(file) {
  const files = Array.isArray(file) ? file : [file];
  let all = [];
  for (const f of files) all = all.concat(readUsageEntries(f));
  if (all.length === 0) return null;
  // Dedup across all files by message.id (so subagent dups don't double-count
  // if Claude wrote the same message to both main and subagent jsonl)
  const kept = dedupByMsgId(all).filter(
    (d) => !d.isApiErrorMessage,
    // NOTE: We keep isSidechain entries when they come from subagent files,
    // since those represent real billable activity. The main session file
    // has no sidechain entries in current Claude Code format anyway.
  );

  let inTok = 0,
    outTok = 0,
    cacheRead = 0,
    cacheCreate = 0;
  let cost = 0;
  const models = {};
  const byModel = {}; // /status-style breakdown per model
  let toolCalls = 0;
  let firstTs = "",
    lastTs = "";

  for (const d of kept) {
    const u = d.message.usage;
    const it = u.input_tokens || 0;
    const ot = u.output_tokens || 0;
    const cR = u.cache_read_input_tokens || 0;
    const cC = u.cache_creation_input_tokens || 0;
    inTok += it;
    outTok += ot;
    cacheRead += cR;
    cacheCreate += cC;
    const c = entryCost(d);
    cost += c;
    const m = d.message.model || "unknown";
    models[m] = (models[m] || 0) + 1;
    const bm = (byModel[m] = byModel[m] || {
      msgs: 0,
      input: 0,
      output: 0,
      cache_read: 0,
      cache_create: 0,
      cost: 0,
    });
    bm.msgs += 1;
    bm.input += it;
    bm.output += ot;
    bm.cache_read += cR;
    bm.cache_create += cC;
    bm.cost += c;
    const blocks = (d.message.content || []).filter(
      (b) => b && b.type === "tool_use",
    );
    toolCalls += blocks.length;
    if (d.timestamp) {
      if (!firstTs || d.timestamp < firstTs) firstTs = d.timestamp;
      if (!lastTs || d.timestamp > lastTs) lastTs = d.timestamp;
    }
  }

  // Context length = single most-recent main-chain entry's input + cache_read + cache_creation
  const ctxCandidate = kept
    .filter((d) => d.timestamp)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  let lastCtx = 0;
  if (ctxCandidate) {
    const u = ctxCandidate.message.usage;
    lastCtx =
      (u.input_tokens || 0) +
      (u.cache_read_input_tokens || 0) +
      (u.cache_creation_input_tokens || 0);
  }
  const ctxPct = Math.min(100, Math.round((lastCtx / DEFAULT_CTX_LIMIT) * 100));

  // Cache hit rate
  const totalLookup = cacheRead + cacheCreate + inTok;
  const cacheHitPct =
    totalLookup > 0 ? Math.round((cacheRead / totalLookup) * 100) : 0;

  return {
    file,
    entries_total: all.length,
    entries_kept: kept.length,
    msgCount: kept.length,
    input_tokens: inTok,
    output_tokens: outTok,
    cache_read_tokens: cacheRead,
    cache_create_tokens: cacheCreate,
    cache_hit_pct: cacheHitPct,
    last_ctx_tokens: lastCtx,
    last_ctx_pct: ctxPct,
    ctx_limit: DEFAULT_CTX_LIMIT,
    cost_usd: Math.round(cost * 10000) / 10000,
    models,
    by_model: byModel,
    tool_calls: toolCalls,
    first_ts: firstTs,
    last_ts: lastTs,
  };
}

function currentSession(projectId) {
  const files = listCurrentSessionFiles(projectId);
  if (files.length === 0) return null;
  const result = aggregateSession(files);
  if (result) result.files_used = files;
  return result;
}

/** Aggregate sessions whose any entry timestamp falls within [sinceMs, now] across ALL projects */
function aggregateSince(sinceMs, options) {
  options = options || {};
  const all = options.allProjects
    ? listAllProjectSessions()
    : listSessions(options.projectId).map((s) => ({
        ...s,
        project: options.projectId,
      }));
  const out = {
    sessions: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    cost_usd: 0,
    msgCount: 0,
    tool_calls: 0,
    by_model: {},
  };
  const sinceIso = new Date(sinceMs).toISOString();
  for (const s of all) {
    const all_entries = readUsageEntries(s.file);
    if (all_entries.length === 0) continue;
    const kept = dedupByMsgId(all_entries)
      .filter((d) => d.isSidechain !== true && !d.isApiErrorMessage)
      .filter((d) => d.timestamp && d.timestamp >= sinceIso);
    if (kept.length === 0) continue;
    out.sessions += 1;
    for (const d of kept) {
      const u = d.message.usage;
      out.input_tokens += u.input_tokens || 0;
      out.output_tokens += u.output_tokens || 0;
      out.cache_read_tokens += u.cache_read_input_tokens || 0;
      out.cache_create_tokens += u.cache_creation_input_tokens || 0;
      out.cost_usd += entryCost(d);
      out.msgCount += 1;
      const m = d.message.model || "unknown";
      out.by_model[m] = (out.by_model[m] || 0) + 1;
      const blocks = (d.message.content || []).filter(
        (b) => b && b.type === "tool_use",
      );
      out.tool_calls += blocks.length;
    }
  }
  out.cost_usd = Math.round(out.cost_usd * 10000) / 10000;
  return out;
}

/** Mode auto-detect */
function detectMode(state) {
  if (!state) return "独立";
  const task = (state.task || "").toLowerCase();
  if (/team|多.?agent|并行|parallel|协作|协同|多人|swarm/i.test(task))
    return "团队";
  return "独立";
}

module.exports = {
  projectIdFor,
  listSessions,
  listAllProjectSessions,
  aggregateSession,
  currentSession,
  aggregateSince,
  detectMode,
  PRICE,
};
