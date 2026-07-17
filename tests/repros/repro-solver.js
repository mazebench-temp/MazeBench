const path = require("path");
const { loadBrowserScript } = require(path.join(
  "/Users/jpappas/code/GitHub/PixelGameTest",
  "tests/helpers/browser-module-loader"
));

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

function makeEngine() {
  return createEngine({
    width: 4,
    height: 1,
    terrain: floorTerrain(4, 1),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "clone", groupId: "c0", x: 2, y: 0, removed: false },
      { type: "gem", x: 3, y: 0, removed: false }
    ]
  });
}

(async () => {
  const engine = makeEngine();
  const result = await solveWithAStar(engine, { maxExpandedStates: 1000 });
  console.log("solver status:", result.status);
  console.log("solver path:", result.path);
  console.log("solver moves:", result.moves);

  // Replay the solver's path on a fresh engine and check whether the gem is
  // ever collected (actorRemoved) or a toRemoved record emitted.
  const engine2 = makeEngine();
  const state = engine2.cloneState(engine2.initialState);
  const dirs = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  let sawToRemoved = false;
  for (const ch of result.path || "") {
    const [dx, dy] = dirs[ch];
    const mv = engine2.move(state, dx, dy);
    if ((mv.moves || []).some((m) => m.actorType === "gem" && m.toRemoved === true)) {
      sawToRemoved = true;
    }
  }
  console.log("replay: gem actorRemoved =", state.actorRemoved[2]);
  console.log("replay: gem toRemoved record emitted =", sawToRemoved);
  console.log("replay: isSolved =", engine2.isSolved(state));
  console.log(
    "replay: clone pos =",
    [state.actorX[1], state.actorY[1]],
    "gem pos =",
    [state.actorX[2], state.actorY[2]]
  );
})();
