"use strict";
// v0.8 #4: helix-runs.jsonl → OpenTelemetry traces (OTLP/HTTP JSON)
//
// 用法（helix --finalize 内部 fire-and-forget）：
//   const { exportRun } = require("./lib/otlp_exporter.cjs");
//   exportRun(helix_run_id, projectDir);
//
// 关键设计：
//   - 默认无副作用：HARNESS_OTLP_ENDPOINT 不设 → 直接 return（绝不阻塞 finalize）
//   - 不引入第三方依赖：用 node 内置 https / http fetch
//   - 失败 swallow + console.error 警告（绝不抛错）
//   - 所有 phase_report 转成 child span，root span = start→finalize

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");

function hexId(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function bjToUnixNano(ts) {
  // ts 形如 "2026-5-12 21:30:45"（北京时间）→ 转 UTC unix nano
  if (!ts || typeof ts !== "string") return null;
  const m = ts.match(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  // 北京时间 UTC+8 → UTC = -8h
  const utcMs = Date.UTC(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10) - 8,
    parseInt(m[5], 10),
    parseInt(m[6], 10),
  );
  return String(utcMs * 1_000_000); // ms → ns
}

function buildTraces(runId, entries, serviceName) {
  if (!entries || entries.length === 0) return null;
  const traceId = crypto
    .createHash("sha256")
    .update(runId)
    .digest("hex")
    .slice(0, 32);

  const start = entries.find((e) => e.type === "start");
  const finalize = entries.find((e) => e.type === "finalize");
  const phases = entries.filter((e) => e.type === "phase_report");

  const startNano = start ? bjToUnixNano(start.ts) : null;
  const endNano = finalize
    ? bjToUnixNano(finalize.finished_at || finalize.ts)
    : startNano
    ? String(BigInt(startNano) + BigInt(60_000_000_000))
    : null;
  if (!startNano || !endNano) return null;

  const rootSpanId = hexId(8);
  const spans = [
    {
      traceId,
      spanId: rootSpanId,
      name: "helix.run",
      kind: 2,
      startTimeUnixNano: startNano,
      endTimeUnixNano: endNano,
      attributes: [
        { key: "helix.run_id", value: { stringValue: runId } },
        {
          key: "helix.task",
          value: { stringValue: ((start && start.task) || "").slice(0, 200) },
        },
        {
          key: "helix.promise",
          value: { stringValue: (finalize && finalize.promise) || "STILL_RUNNING" },
        },
        {
          key: "helix.phases_run",
          value: { intValue: String(phases.length) },
        },
      ],
      status: {
        code: finalize && finalize.promise === "COMPLETE" ? 1 : 2,
      },
    },
  ];

  // 每个 phase_report 一个 child span（按时间序）
  let cursor = startNano;
  for (const p of phases) {
    const pStart = bjToUnixNano(p.ts) || cursor;
    const dur = typeof p.duration_ms === "number" ? p.duration_ms : 0;
    const pEnd = String(BigInt(pStart) + BigInt(Math.max(dur, 1) * 1_000_000));
    spans.push({
      traceId,
      spanId: hexId(8),
      parentSpanId: rootSpanId,
      name: `helix.phase.${p.phase}`,
      kind: 1,
      startTimeUnixNano: pStart,
      endTimeUnixNano: pEnd,
      attributes: [
        { key: "helix.phase", value: { stringValue: p.phase } },
        { key: "helix.passes", value: { boolValue: p.passes === true } },
        {
          key: "helix.summary",
          value: { stringValue: (p.summary || "").slice(0, 200) },
        },
      ],
      status: { code: p.passes ? 1 : 2 },
    });
    cursor = pEnd;
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "telemetry.sdk.name", value: { stringValue: "alex-harness" } },
            { key: "telemetry.sdk.version", value: { stringValue: "0.8.0" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "helix", version: "0.2.0" },
            spans,
          },
        ],
      },
    ],
  };
}

function postOtlp(endpoint, body, cb) {
  let url;
  try {
    url = new URL(endpoint);
  } catch (e) {
    return cb && cb(e);
  }
  const data = JSON.stringify(body);
  const opts = {
    method: "POST",
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + (url.search || ""),
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
    timeout: 3000,
  };
  const lib = url.protocol === "https:" ? https : http;
  const req = lib.request(opts, (res) => {
    res.resume();
    res.on("end", () => cb && cb(null, res.statusCode));
  });
  req.on("error", (e) => cb && cb(e));
  req.on("timeout", () => {
    req.destroy(new Error("OTLP timeout"));
  });
  req.write(data);
  req.end();
}

function exportRun(runId, projectDir) {
  const endpoint = process.env.HARNESS_OTLP_ENDPOINT;
  if (!endpoint) return; // 未配置 → no-op
  try {
    const helixRunsPath = path.join(projectDir, "_meta", "helix-runs.jsonl");
    if (!fs.existsSync(helixRunsPath)) return;
    const lines = fs
      .readFileSync(helixRunsPath, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-300);
    const entries = [];
    for (const ln of lines) {
      try {
        const o = JSON.parse(ln);
        if (o.helix_run_id === runId) entries.push(o);
      } catch {}
    }
    const traces = buildTraces(
      runId,
      entries,
      process.env.HARNESS_OTLP_SERVICE || "alex-harness",
    );
    if (!traces) return;
    postOtlp(endpoint, traces, (err, status) => {
      if (err) {
        console.error(`[otlp] export failed: ${err.message}`);
      } else if (status >= 400) {
        console.error(`[otlp] backend rejected: HTTP ${status}`);
      }
    });
  } catch (e) {
    // 绝不抛错（fire-and-forget）
    console.error(`[otlp] export error: ${e.message}`);
  }
}

module.exports = { exportRun, buildTraces, bjToUnixNano };
