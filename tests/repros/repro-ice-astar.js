// Repro: A* heuristic inadmissibility over ice slides.
// Board 8x2: row y=0 all ice, row y=1 all floor.
// Player (0,1), gem (7,1). Claim: optimal is 3 moves (U, R slide, D),
// but algorithm "astar" returns 7 (RRRRRRR).
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
loadBrowserScript("public/maze-solver.js");

const { createEngine } = window.MazeEngine;
const { solveWithAStar } = window.MazeSolver;

function buildPlayData() {
  const width = 8;
  const height = 2;
  const terrain = [
    Array.from({ length: width }, () => ({
      type: "ice",
      layers: [{ type: "ice", elevation: 0 }]
    })),
    Array.from({ length: width }, () => ({ type: "floor" }))
  ];
  return {
    width,
    height,
    terrain,
    actors: [
      { type: "player", x: 0, y: 1, removed: false },
      { type: "gem", x: 7, y: 1, removed: false }
    ]
  };
}

(async () => {
  // 1) Manual replay of U, R, D — confirm it solves.
  const engine = createEngine(buildPlayData());
  const state = engine.cloneState(engine.initialState);
  const steps = [
    ["U", 0, -1],
    ["R", 1, 0],
    ["D", 0, 1]
  ];
  for (const [label, dx, dy] of steps) {
    const result = engine.move(state, dx, dy);
    console.log(
      `move ${label}: moved=${!!(result && result.moved)} player=(${state.actorX[0]},${state.actorY[0]}) solved=${engine.isSolved(state)}`
    );
  }
  console.log("manual URD solves:", engine.isSolved(state));

  // 2) astar
  const astarEngine = createEngine(buildPlayData());
  const astar = await solveWithAStar(astarEngine, {
    algorithm: "astar",
    maxExpandedStates: 100000
  });
  console.log("astar:", JSON.stringify(astar));

  // 3) bfs (uniform cost)
  const bfsEngine = createEngine(buildPlayData());
  const bfs = await solveWithAStar(bfsEngine, {
    algorithm: "bfs",
    maxExpandedStates: 100000
  });
  console.log("bfs:", JSON.stringify(bfs));

  // 4) Heuristic admissibility check at the state after "U":
  // player on ice at (0,0); true remaining cost is 2 (R slide + D),
  // heuristic says |0-7| + |0-1| = 8.
  const hEngine = createEngine(buildPlayData());
  const hState = hEngine.cloneState(hEngine.initialState);
  hEngine.move(hState, 0, -1);
  console.log(
    `after U: player=(${hState.actorX[0]},${hState.actorY[0]}) heuristic=${hEngine.heuristic(hState)} (true remaining cost = 2)`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
