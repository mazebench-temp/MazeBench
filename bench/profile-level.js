// Profile move throughput + a weighted solve on one shipped level.
// Usage: node [--cpu-prof] bench/profile-level.js <levelFile.txt> [--seconds 8] [--solve-cap 40000]
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const { loadBrowserScript } = require(path.join(ROOT, "tests", "helpers", "browser-module-loader"));

global.window = {};
loadBrowserScript("public/author-play-data.js");
loadBrowserScript(process.env.MAZE_ENGINE_PATH || "public/maze-engine.js");
loadBrowserScript("public/maze-solver.js");

const args = process.argv.slice(2);
const levelFile = args.find((a) => a.endsWith(".txt"));
const seconds = args.includes("--seconds") ? Number(args[args.indexOf("--seconds") + 1]) : 8;
const solveCap = args.includes("--solve-cap") ? Number(args[args.indexOf("--solve-cap") + 1]) : 40000;

const gameDir = path.join(ROOT, "games", "maze");
const parsing = JSON.parse(fs.readFileSync(path.join(gameDir, "level_parsing.json"), "utf8"));
const palette = [];
for (const [name, def] of Object.entries(parsing.objects)) {
  const tokens = Array.isArray(def.tokens) ? def.tokens : [def];
  tokens.forEach((entry) => {
    const token = typeof entry === "string" ? entry : entry.token;
    if (!token) return;
    palette.push({
      direction: typeof entry === "object" ? entry.direction ?? null : null,
      raised: typeof entry === "object" ? entry.raised === true : false,
      imageUrl: null,
      label: (typeof entry === "object" && entry.label) || name,
      name,
      token,
      type: name
    });
  });
}
const adapter = window.AuthorPlayData.createAdapter({
  blockAdder: parsing.rules.block_adder || "+",
  defaultFloorToken: ".",
  game: { id: "maze" },
  palette
});

const text = fs.readFileSync(path.join(gameDir, "levels", levelFile), "utf8");
const rows = text.split("\n").filter((line) => line.trim().length > 0);
const cells = rows.map((line) => line.split(parsing.rules.separator || " "));
const width = Math.max(...cells.map((row) => row.length));
const height = cells.length;
cells.forEach((row) => { while (row.length < width) row.push(""); });

const playData = adapter.buildPlayData({
  cells, height, levelId: levelFile, levelLabel: levelFile, sourceFileName: levelFile, width
});

const engine = window.MazeEngine.createEngine(playData);
console.error(`${levelFile}: ${width}x${height}, ${engine.actorCount} actors`);

// 1) moveForSearch throughput on a scripted sequence
const DIRS = [[1,0],[0,1],[-1,0],[0,-1]];
const scratch = engine.cloneState(engine.initialState);
const reset = engine.cloneState(engine.initialState);
let moves = 0;
let start = process.hrtime.bigint();
const budgetNs = BigInt(Math.floor(seconds / 2 * 1e9));
let i = 0;
while (process.hrtime.bigint() - start < budgetNs) {
  const [dx, dy] = DIRS[i % 4];
  const r = engine.moveForSearch(scratch, dx, dy);
  moves += 1;
  i += 1;
  if (i % 64 === 0) engine.copyStateInto(scratch, reset);
}
let elapsed = Number(process.hrtime.bigint() - start) / 1e9;
console.error(`moveForSearch: ${(moves / elapsed).toFixed(0)}/s (${moves} moves in ${elapsed.toFixed(2)}s)`);

// 2) weighted solve
(async () => {
  const t0 = process.hrtime.bigint();
  const result = await window.MazeSolver.solveWithAStar(engine, {
    algorithm: "weighted_astar",
    maxExpandedStates: solveCap,
    progressYieldStateInterval: 100000
  });
  const dt = Number(process.hrtime.bigint() - t0) / 1e9;
  console.error(`weighted solve: ${result.status} moves=${result.moves ?? "-"} expanded=${result.expanded} in ${dt.toFixed(2)}s (${(result.expanded / dt).toFixed(0)} exp/s)`);
})();
