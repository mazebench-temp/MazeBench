const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeSolutionExportRequest,
  solutionExportFileName
} = require("../server/solver-exports");
const { replayOptions, solutionActions } = require("../scripts/maze-export-solution");

const root = path.join(__dirname, "..");
const authorSource = fs.readFileSync(path.join(root, "public", "author.js"), "utf8");
const replaySource = fs.readFileSync(
  path.join(root, "scripts", "maze-export-replay.js"),
  "utf8"
);
const routerSource = fs.readFileSync(path.join(root, "server", "router.js"), "utf8");

const playData = {
  actors: [{ type: "player", x: 0, y: 0 }],
  editorRender: false,
  height: 1,
  terrain: [[{ type: "floor" }]],
  width: 1
};

assert.deepEqual(normalizeSolutionExportRequest({ path: "uDlR", playData }, "GIF"), {
  format: "gif",
  path: "UDLR",
  playData
});
assert.throws(
  () => normalizeSolutionExportRequest({ path: "UX", playData }, "mp4"),
  /only U, D, L, and R/
);
assert.throws(
  () => normalizeSolutionExportRequest({ path: "U", playData }, "webm"),
  /mp4 or gif/
);
assert.throws(
  () => normalizeSolutionExportRequest({ path: "U", playData: { width: 0 } }, "mp4"),
  /snapshot is invalid/
);
assert.equal(
  solutionExportFileName("draft / one", "level_AxB", "mp4"),
  "draft-one-level_AxB-solution.mp4"
);
assert.deepEqual(solutionActions("UDLR"), ["up", "down", "left", "right"]);
assert.equal(replayOptions().format, "mp4");
assert.equal(replayOptions().accelerated, true);

assert.match(authorSource, /class="solver-dock__minimize"/);
assert.match(authorSource, /function setSolverDockMinimized\(minimized\)/);
assert.match(authorSource, /Download MP4/);
assert.match(authorSource, /Download GIF/);
assert.match(authorSource, /function downloadSolutionExport\(requestedFormat\)/);
assert.match(authorSource, /editorRender: false/);
assert.match(authorSource, /authorData\.solutionExportApiUrl/);
assert.match(routerSource, /segments\[4\] === "solution-export"/);
assert.match(routerSource, /Content-Disposition/);
assert.match(replaySource, /if \(mazeOptions\.playData\)/);
assert.match(replaySource, /app\.applyLevelState\(playData/);

console.log("solver-export: OK — solver solutions minimize and export through play mode.");
