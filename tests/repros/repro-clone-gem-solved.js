// Repro: isSolved returns true for a clone standing on a gem, then false after next move.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

const engine = createEngine({
  width: 5,
  height: 1,
  terrain: floorTerrain(5, 1),
  actors: [
    { type: "player", x: 0, y: 0, removed: false },     // index 0
    { type: "clone", groupId: "c0", x: 2, y: 0, removed: false }, // index 1
    { type: "gem", x: 3, y: 0, removed: false }         // index 2
  ]
});

const state = engine.cloneState(engine.initialState);
const GEM = 2;

function dump(label) {
  console.log(label, {
    player: [state.actorX[0], state.actorY[0]],
    clone: [state.actorX[1], state.actorY[1]],
    gemPos: [state.actorX[GEM], state.actorY[GEM]],
    gemRemoved: state.actorRemoved[GEM],
    isSolved: engine.isSolved(state)
  });
}

dump("initial:");

const m1 = engine.move(state, 1, 0);
console.log("move1.moved =", m1.moved);
dump("after move 1 (clone lands on gem):");

const m2 = engine.move(state, 1, 0);
console.log("move2.moved =", m2.moved);
dump("after move 2 (clone steps off gem):");

// Also confirm what the solver would do with this level.
loadBrowserScript("public/maze-solver.js");
const solver = window.MazeSolver || window.MazeEngineSolver || null;
console.log("solver export keys:", Object.keys(window).filter((k) => /solver/i.test(k)));
