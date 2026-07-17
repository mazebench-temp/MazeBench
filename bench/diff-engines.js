// Differential replay: run identical seeded-random move sequences through the
// NEW engine (public/maze-engine.js) and the LEGACY engine
// (public/maze-engine-legacy.js) on every shipped level, comparing canonical
// state after every move. Divergences are expected ONLY where the rewrite
// deliberately fixed audited bugs (docs/rewrite/SEMANTICS.md).
//
// Usage: node bench/diff-engines.js [--moves 80] [--seed 7]
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function loadEngineExport(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: relativePath });
  return sandbox.window.MazeEngine;
}

const NewEngine = loadEngineExport("public/maze-engine.js");
// The legacy engine was removed from the repo after the rewrite was accepted
// (2026-07). To diff against it again, restore it from git history:
//   git show <pre-rewrite-sha>:public/maze-engine.js > /tmp/maze-engine-legacy.js
// and pass the path via MAZE_LEGACY_ENGINE_PATH.
const legacyPath = process.env.MAZE_LEGACY_ENGINE_PATH || "public/maze-engine-legacy.js";
if (!fs.existsSync(path.join(ROOT, legacyPath)) && !fs.existsSync(legacyPath)) {
  console.error("diff-engines: no legacy engine found at " + legacyPath + " — set MAZE_LEGACY_ENGINE_PATH (see comment in this file).");
  process.exit(2);
}
const LegacyEngine = loadEngineExport(fs.existsSync(path.join(ROOT, legacyPath)) ? legacyPath : path.resolve(legacyPath));

// author-play-data for level parsing (shared, engine-agnostic)
global.window = {};
const { loadBrowserScript } = require(path.join(ROOT, "tests", "helpers", "browser-module-loader"));
loadBrowserScript("public/author-play-data.js");

const args = process.argv.slice(2);
const MOVES = args.includes("--moves") ? Number(args[args.indexOf("--moves") + 1]) : 80;
const SEED = args.includes("--seed") ? Number(args[args.indexOf("--seed") + 1]) : 7;

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

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  [1, 0, "R"],
  [-1, 0, "L"],
  [0, 1, "D"],
  [0, -1, "U"]
];

function canonical(engine, state) {
  const actors = [];
  for (let index = 0; index < engine.actorCount; index += 1) {
    actors.push(
      state.actorX[index],
      state.actorY[index],
      state.actorElevation[index],
      state.actorRemoved[index]
    );
  }
  return (
    actors.join(",") +
    "|" +
    Array.from(state.terrain).join(",") +
    "|" +
    Array.from(state.liftRaised).join(",")
  );
}

const levelsDir = path.join(gameDir, "levels");
const files = fs.readdirSync(levelsDir).filter((f) => f.endsWith(".txt")).sort();
const separator = parsing.rules.separator || " ";

let identical = 0;
let initialDiverged = [];
const diverged = [];
let parseErrors = 0;

for (const file of files) {
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
    parseErrors += 1;
    continue;
  }

  const engineNew = NewEngine.createEngine(playData);
  const engineOld = LegacyEngine.createEngine(playData);
  const stateNew = engineNew.cloneState(engineNew.initialState);
  const stateOld = engineOld.cloneState(engineOld.initialState);

  if (canonical(engineNew, stateNew) !== canonical(engineOld, stateOld)) {
    initialDiverged.push({
      file,
      warnings: engineNew.loadWarnings.slice(0, 3)
    });
    continue; // load normalization changed the starting state (intentional)
  }

  const rand = mulberry32(SEED + files.indexOf(file));
  let divergence = null;
  const movesTaken = [];

  for (let step = 0; step < MOVES; step += 1) {
    const [dx, dy, label] = DIRS[(rand() * 4) | 0];
    movesTaken.push(label);
    const resultNew = engineNew.move(stateNew, dx, dy);
    const resultOld = engineOld.move(stateOld, dx, dy);
    const stateMatches = canonical(engineNew, stateNew) === canonical(engineOld, stateOld);
    const movedMatches = resultNew.moved === resultOld.moved;

    if (!stateMatches || !movedMatches) {
      divergence = {
        file,
        step: step + 1,
        move: label,
        path: movesTaken.join(""),
        movedNew: resultNew.moved,
        movedOld: resultOld.moved,
        stateMatches
      };
      break;
    }
  }

  if (!divergence) {
    identical += 1;
  } else {
    diverged.push(divergence);
  }
}

console.log(
  JSON.stringify(
    {
      levels: files.length,
      movesPerLevel: MOVES,
      identicalThroughout: identical,
      initialStateNormalized: initialDiverged,
      divergedDuringPlay: diverged,
      parseErrors
    },
    null,
    1
  )
);
