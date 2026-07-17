// Parse a V8 .cpuprofile and print top-N functions by self time.
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
const topN = Number(process.argv[3] || 10);
const profile = JSON.parse(fs.readFileSync(file, "utf8"));

const { nodes, samples, timeDeltas } = profile;
const selfMicros = new Map(); // nodeId -> micros
for (let i = 0; i < samples.length; i += 1) {
  const delta = timeDeltas[i] > 0 ? timeDeltas[i] : 0;
  selfMicros.set(samples[i], (selfMicros.get(samples[i]) || 0) + delta);
}

const byId = new Map(nodes.map((n) => [n.id, n]));
const agg = new Map(); // fn key -> { micros, hits }
let totalMicros = 0;
for (const [nodeId, micros] of selfMicros) {
  const node = byId.get(nodeId);
  if (!node) continue;
  const cf = node.callFrame;
  const name = cf.functionName || "(anonymous)";
  const url = cf.url ? path.basename(cf.url) : "";
  const key = `${name} ${url}:${cf.lineNumber + 1}`;
  const entry = agg.get(key) || { micros: 0 };
  entry.micros += micros;
  agg.set(key, entry);
  totalMicros += micros;
}

const rows = [...agg.entries()]
  .map(([key, { micros }]) => ({ key, ms: micros / 1000, pct: (100 * micros) / totalMicros }))
  .sort((a, b) => b.ms - a.ms);

console.log(`total sampled: ${(totalMicros / 1e6).toFixed(2)}s across ${rows.length} functions`);
for (const row of rows.slice(0, topN)) {
  console.log(`${row.pct.toFixed(2).padStart(6)}%  ${row.ms.toFixed(0).padStart(7)}ms  ${row.key}`);
}
