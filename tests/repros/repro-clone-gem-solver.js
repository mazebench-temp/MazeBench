// Solver-facing consequence: A* declares "solved" with a clone parked on a gem.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");
loadBrowserScript("public/maze-solver.js");

const { createEngine } = window.MazeEngine;
const { solveWithAStar } = window.MazeSolver;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

(async () => {
  const engine = createEngine({
    width: 5,
    height: 1,
    terrain: floorTerrain(5, 1),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "clone", groupId: "c0", x: 2, y: 0, removed: false },
      { type: "gem", x: 3, y: 0, removed: false }
    ]
  });

  const result = await solveWithAStar(engine, { maxExpandedStates: 1000 });
  console.log("solver result:", result);

  // Replay the solver's path on a fresh state and check the gem.
  const state = engine.cloneState(engine.initialState);
  const dirs = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
  for (const ch of result.path || "") {
    const [dx, dy] = dirs[ch];
    engine.move(state, dx, dy);
  }
  console.log("after replaying solver path:", {
    gemRemoved: state.actorRemoved[2],
    isSolved: engine.isSolved(state),
    clone: [state.actorX[1], state.actorY[1]]
  });
})();
