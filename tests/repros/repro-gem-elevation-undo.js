// Repro: undoMove restores collected elevated gems to elevation 0
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

// Mirrors tests/maze-engine.test.js lines 2594-2617 (elevated ice, gem at elevation 1)
const elevatedIce = {
  type: "ice",
  layers: [
    { type: "ice", elevation: 0 },
    { type: "ice", elevation: 1 }
  ]
};

const engine = createEngine({
  width: 2,
  height: 1,
  terrain: [[elevatedIce, elevatedIce]],
  actors: [
    { type: "player", x: 0, y: 0, elevation: 1, removed: false },
    { type: "gem", x: 1, y: 0, elevation: 1, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);

const keyBefore = engine.stateKey(state);
const gemElevBefore = state.actorElevation[1];
const heurBefore = engine.heuristic(state);
console.log("BEFORE move:   gem elevation =", gemElevBefore, " removed =", state.actorRemoved[1]);
console.log("stateKey before:", JSON.stringify(keyBefore));

const result = engine.moveForSearch(state, 1, 0);
console.log("moveForSearch moved =", result.moved, " gem removed =", state.actorRemoved[1], " gem elevation =", state.actorElevation[1]);
const gemMoveRecord = result.moves.find((m) => m.actorIndex === 1);
console.log("gem move record keys:", Object.keys(gemMoveRecord).join(","), " fromElevation =", gemMoveRecord.fromElevation);

engine.undoMove(state, result);

const keyAfter = engine.stateKey(state);
const gemElevAfter = state.actorElevation[1];
const heurAfter = engine.heuristic(state);
console.log("AFTER undo:    gem elevation =", gemElevAfter, " removed =", state.actorRemoved[1]);
console.log("stateKey after: ", JSON.stringify(keyAfter));
console.log("");
console.log("round-trip stateKey equal?      ", keyBefore === keyAfter);
console.log("gem elevation preserved?        ", gemElevBefore === gemElevAfter);
console.log("heuristic before/after undo:    ", heurBefore, "/", heurAfter);

// Second-order corruption: expand another direction from the "restored" state
// and show the phantom state is now recorded/solvable differently.
const result2 = engine.moveForSearch(state, 1, 0);
console.log("re-expand right from corrupted state: moved =", result2.moved,
  " gem removed =", state.actorRemoved[1],
  " isSolved =", engine.isSolved(state));

if (keyBefore !== keyAfter || gemElevBefore !== gemElevAfter) {
  console.log("\nVERDICT: BUG REPRODUCED");
  process.exitCode = 1;
} else {
  console.log("\nVERDICT: behavior correct, finding refuted");
}
