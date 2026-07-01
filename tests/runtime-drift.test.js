const { computeRuntimeDrift } = require("../scripts/sync-runtime");

const drift = computeRuntimeDrift();
const driftedCount = drift.missing.length + drift.modified.length + drift.stale.length;

if (driftedCount === 0) {
  console.log("runtime-drift: OK — runtime bundle matches the live sources.");
  process.exit(0);
}

function report(label, files) {
  if (files.length === 0) {
    return;
  }

  console.error(`\n${label} (${files.length}):`);
  files.forEach((file) => {
    console.error(`  ${file}`);
  });
}

console.error("runtime-drift: environments/mazebench/mazebench/runtime has drifted from the live tree.");
report("Missing from runtime (present in live tree)", drift.missing);
report("Modified (runtime copy differs from live source)", drift.modified);
report("Stale (no longer present in live tree)", drift.stale);
console.error(
  `\nruntime-drift: ${driftedCount} drifted file(s). Run "npm run sync-runtime" to update the runtime bundle.`
);
process.exit(1);
