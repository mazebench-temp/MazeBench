const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const runScript = fs.readFileSync(path.join(root, "public", "agent-run.js"), "utf8");
const siteTheme = fs.readFileSync(path.join(root, "public", "local-site.css"), "utf8");

assert.match(runScript, /type="number" min="1" max="60" step="1"[^>]+data-replay-rate/);
assert.match(runScript, />FPS<\/span>/);
assert.doesNotMatch(runScript, /<select data-replay-rate/);
assert.match(runScript, /function updateReplayControlsInPlace\(container, viewId\)/);
assert.match(runScript, /document\.activeElement !== rateInput/);
assert.match(runScript, /playbackGeneration: 0/);
assert.match(runScript, /state\.playbackGeneration \+= 1/);
assert.match(runScript, /function isCurrentPlayback\(viewId, generation\)/);
assert.match(runScript, /playbackRequest && !isCurrentPlayback\(viewId, playbackGeneration\)/);
assert.match(runScript, /state\.playbackDeadline \+= replayDelay\(viewId\)/);
assert.match(runScript, /state\.playbackDeadline - performance\.now\(\)/);
assert.match(runScript, /control\.addEventListener\("input", \(event\) => updateRate\(event\)\)/);
assert.match(siteTheme, /\.replay-rate input \{/);
assert.doesNotMatch(siteTheme, /\.replay-rate select \{/);

console.log("agent-run-playback-source: OK — playback has editable FPS and race-safe scheduling.");
