// Solve every shipped level with the current engine + solver.
// Usage: node bench/solve-all-levels.js [--algorithm astar] [--cap 500000]
const fs = require("node:fs");
const path = require("node:path");
const { loadBrowserScript } = require(path.join(__dirname, "..", "tests", "helpers", "browser-module-loader"));

global.window = {};
loadBrowserScript("public/author-play-data.js");
loadBrowserScript("public/maze-engine.js");
loadBrowserScript("public/maze-solver.js");

const args = process.argv.slice(2);
const algorithm = args.includes("--algorithm") ? args[args.indexOf("--algorithm") + 1] : "astar";
const cap = args.includes("--cap") ? Number(args[args.indexOf("--cap") + 1]) : 500000;

const gameDir = path.join(__dirname, "..", "games", "maze");
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
      groupId: typeof entry === "object" ? entry.groupId : undefined,
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

const levelsDir = path.join(gameDir, "levels");
const files = fs.readdirSync(levelsDir).filter((file) => file.endsWith(".txt")).sort();
const separator = parsing.rules.separator || " ";

(async () => {
  const results = [];

  for (const file of files) {
    process.stderr.write(file + "\n");
    const text = fs.readFileSync(path.join(levelsDir, file), "utf8");
    const rows = text.split("\n").filter((line) => line.trim().length > 0);
    const cells = rows.map((line) => line.split(separator));
    const width = Math.max(...cells.map((row) => row.length));
    const height = cells.length;
    cells.forEach((row) => {
      while (row.length < width) row.push("");
    });

    let playData;
    try {
      playData = adapter.buildPlayData({
        cells,
        height,
        levelId: file,
        levelLabel: file,
        sourceFileName: file,
        width
      });
    } catch (error) {
      results.push({ file, status: "parse-error", error: String(error.message || error) });
      continue;
    }

    const hasGem = (playData.actors || []).some((actor) => actor.type === "gem" && !actor.removed);
    if (!hasGem) {
      results.push({ file, status: "no-gem" });
      continue;
    }

    const engine = window.MazeEngine.createEngine(playData);
    const started = process.hrtime.bigint();
    let result;
    try {
      result = await window.MazeSolver.solveWithAStar(engine, {
        algorithm,
        maxExpandedStates: cap,
        progressYieldStateInterval: 100000
      });
    } catch (error) {
      results.push({ file, status: "solver-error", error: String(error.message || error) });
      continue;
    }
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;

    results.push({
      file,
      status: result.status,
      moves: result.moves ?? null,
      expanded: result.expanded,
      seconds: Number(seconds.toFixed(3)),
      warnings: engine.loadWarnings.length
    });
  }

  const solved = results.filter((r) => r.status === "solved");
  const capped = results.filter((r) => r.status === "capped");
  const unsolvable = results.filter((r) => r.status === "unsolvable");
  const other = results.filter((r) => !["solved", "capped", "unsolvable", "no-gem"].includes(r.status));
  const noGem = results.filter((r) => r.status === "no-gem");

  console.log(JSON.stringify({
    algorithm,
    cap,
    total: results.length,
    solved: solved.length,
    capped: capped.map((r) => r.file),
    unsolvable: unsolvable.map((r) => r.file),
    noGem: noGem.length,
    other,
    slowest: solved.sort((a, b) => b.seconds - a.seconds).slice(0, 8),
    withWarnings: results.filter((r) => r.warnings > 0).map((r) => `${r.file}:${r.warnings}`)
  }, null, 1));
})();
