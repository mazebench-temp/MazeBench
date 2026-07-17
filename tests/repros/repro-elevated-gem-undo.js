// Repro: elevated gem ("#+G") corrupts undoMove — gem elevation reset to 0.
const { loadBrowserScript } = require("../helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function wallStack(count, startElevation = 0) {
  return {
    type: "wall",
    layers: Array.from({ length: count }, (_, index) => ({
      type: "wall",
      elevation: startElevation + index
    }))
  };
}

// Board: two adjacent wall-top cells. Editor cells "#+p" and "#+G":
// player on wall top, gem stacked on wall top (parser emits elevation: 1).
const engine = createEngine({
  width: 2,
  height: 1,
  terrain: [[wallStack(1), wallStack(1)]],
  actors: [
    { type: "player", x: 0, y: 0, removed: false },
    { type: "gem", x: 1, y: 0, elevation: 1, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);
console.log("initial: player elev =", state.actorElevation[0], "| gem elev =", state.actorElevation[1]);

const beforeKey = engine.stateKey(state);
const beforeGemElev = state.actorElevation[1];

// Player walks right onto the gem (exactly what maze-solver.js does).
const result = engine.moveForSearch(state, 1, 0);
console.log("after move: moved =", result.moved,
  "| gem removed =", state.actorRemoved[1],
  "| gem elev =", state.actorElevation[1],
  "| isSolved =", engine.isSolved(state));

// Backtrack (every A*/DFS backtrack does this).
engine.undoMove(state, result);
const afterKey = engine.stateKey(state);
console.log("after undo: gem removed =", state.actorRemoved[1],
  "| gem elev =", state.actorElevation[1], "(was", beforeGemElev + ")");
console.log("keyRoundTrips =", beforeKey === afterKey);

// Functional consequence: retry the exact same move after the undo.
// If undo were correct, the gem would be collectible again.
const retry = engine.moveForSearch(state, 1, 0);
console.log("retry same move: moved =", retry.moved,
  "| gem removed =", state.actorRemoved[1],
  "| isSolved =", engine.isSolved(state));

const corrupted = beforeKey !== afterKey || state.actorRemoved[1] !== 1;
console.log(corrupted ? "FINDING CONFIRMED" : "FINDING REFUTED");
process.exit(0);
