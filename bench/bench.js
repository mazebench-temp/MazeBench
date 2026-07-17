// MazeBench engine + solver micro/macro benchmark harness.
// Usage:
//   node bench/bench.js                 -> run all benchmarks, print JSON
//   node bench/bench.js --profile-medium -> only run the medium A* solve (for --cpu-prof)
const path = require("path");
const { loadBrowserScript } = require(path.join(__dirname, "..", "tests", "helpers", "browser-module-loader"));

global.window = {};
loadBrowserScript(process.env.MAZE_ENGINE_PATH || "public/maze-engine.js");
loadBrowserScript("public/maze-solver.js");

const { createEngine } = window.MazeEngine;
const { solveWithAStar } = window.MazeSolver;
const { smallLevel, mediumLevel, largeLevel } = require("./levels");

const DIRS = {
  U: { dx: 0, dy: -1 },
  D: { dx: 0, dy: 1 },
  L: { dx: -1, dy: 0 },
  R: { dx: 1, dy: 0 }
};

function hr() {
  return process.hrtime.bigint();
}

function secondsSince(start) {
  return Number(hr() - start) / 1e9;
}

// (a) engine move applications per second: apply a scripted sequence using
// moveForSearch (the solver-facing path), resetting the state each pass.
function benchMoves(engine, script, targetSeconds = 1.5) {
  const work = engine.cloneState(engine.initialState);
  const steps = script.split("").map((label) => DIRS[label]);
  // warmup
  for (let w = 0; w < 3; w += 1) {
    engine.copyStateInto(work, engine.initialState);
    for (const { dx, dy } of steps) engine.moveForSearch(work, dx, dy);
  }
  let moves = 0;
  const start = hr();
  let elapsed = 0;
  do {
    engine.copyStateInto(work, engine.initialState);
    for (const { dx, dy } of steps) {
      engine.moveForSearch(work, dx, dy);
      moves += 1;
    }
    elapsed = secondsSince(start);
  } while (elapsed < targetSeconds);
  return { moves, seconds: elapsed, movesPerSec: moves / elapsed };
}

// (b) stateKey calls/sec on a live (mid-game) state.
function benchStateKey(engine, targetSeconds = 1.0) {
  const work = engine.cloneState(engine.initialState);
  // make it a "live" state: a few moves applied
  for (const label of "RRDDLU") {
    const { dx, dy } = DIRS[label];
    engine.moveForSearch(work, dx, dy);
  }
  for (let w = 0; w < 1000; w += 1) engine.stateKey(work); // warmup
  let calls = 0;
  let sink = 0;
  const start = hr();
  let elapsed = 0;
  do {
    for (let i = 0; i < 2000; i += 1) {
      sink += engine.stateKey(work).length;
      calls += 1;
    }
    elapsed = secondsSince(start);
  } while (elapsed < targetSeconds);
  return { calls, seconds: elapsed, callsPerSec: calls / elapsed, sink };
}

// (c) cloneState calls/sec.
function benchCloneState(engine, targetSeconds = 1.0) {
  for (let w = 0; w < 1000; w += 1) engine.cloneState(engine.initialState); // warmup
  let calls = 0;
  let sink = 0;
  const start = hr();
  let elapsed = 0;
  do {
    for (let i = 0; i < 2000; i += 1) {
      sink += engine.cloneState(engine.initialState).actorX[0];
      calls += 1;
    }
    elapsed = secondsSince(start);
  } while (elapsed < targetSeconds);
  return { calls, seconds: elapsed, callsPerSec: calls / elapsed, sink };
}

// (d) full A* solve.
async function benchSolve(level, opts = {}) {
  const engine = createEngine(level);
  let lastProgress = null;
  const start = hr();
  const result = await solveWithAStar(engine, {
    algorithm: "astar",
    maxExpandedStates: opts.maxExpandedStates ?? 1000000,
    progressYieldStateInterval: 1 << 30, // avoid await overhead skewing timing
    onProgress: (p) => {
      lastProgress = p;
    }
  });
  const seconds = secondsSince(start);
  const expanded = result.expanded ?? lastProgress?.expanded ?? null;
  return {
    status: result.status,
    moves: result.moves ?? null,
    pathLength: result.path ? result.path.length : null,
    expanded,
    seconds,
    expandedPerSec: expanded != null ? expanded / seconds : null
  };
}

async function main() {
  const profileOnly = process.argv.includes("--profile-medium");

  const levels = {
    small: smallLevel(),
    medium: mediumLevel(),
    large: largeLevel()
  };

  if (profileOnly) {
    const r = await benchSolve(levels.medium, { maxExpandedStates: 1000000 });
    console.log(JSON.stringify({ profileMediumSolve: r }, null, 2));
    return;
  }

  const out = { node: process.version, levels: {} };

  const scripts = {
    small: "RRDDRRDDLURDRDLU",
    medium: "RRRRDDDDRRRRDDDDLLUURRDD",
    large: "RRRRRRDDDDDDRRRRRRDDDDDDLLLLUUUURRDD"
  };

  for (const name of ["small", "medium", "large"]) {
    const level = levels[name];
    const engine = createEngine(level);
    const info = {
      width: level.width,
      height: level.height,
      actorCount: engine.actorCount,
      cellCount: engine.cellCount
    };
    info.moveForSearch = benchMoves(engine, scripts[name]);
    info.stateKey = benchStateKey(engine);
    info.cloneState = benchCloneState(engine);
    out.levels[name] = info;
  }

  out.levels.small.solve = await benchSolve(levels.small, { maxExpandedStates: 1000000 });
  out.levels.medium.solve = await benchSolve(levels.medium, { maxExpandedStates: 1000000 });
  out.levels.large.solve = await benchSolve(levels.large, { maxExpandedStates: 300000 });

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
