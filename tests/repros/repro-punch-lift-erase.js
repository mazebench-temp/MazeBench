// Repro: punched player silently erased when another player toggles a lift
// in the same move (finding family "puncher-x-all", maze-engine.js ~8071).
//
// Board 3 wide x 4 tall, all floor except lowered player_lift at (1,0).
//   Player A (index 0) at (0,0)
//   Player B (index 1) at (0,3)
//   Puncher facing up (index 2) at (1,3)
// One 'right' input:
//   A steps onto the lift -> queues raise, elevation pre-set to 1.
//   B steps onto the puncher -> punched up (1,2)->(1,1)->(1,0), stops at
//   board edge on the lift cell at elevation 0 (lift still lowered during
//   applyPunchers).
//   pendingLiftToggles then raise the lift; final applyHoleFalls sees B's
//   punchSlide with no support at-or-below e0 -> B removed.
const path = require("node:path");
const { loadBrowserScript } = require(path.join(
  "/Users/jpappas/code/GitHub/PixelGameTest",
  "tests/helpers/browser-module-loader"
));

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

const width = 3;
const height = 4;
const terrain = Array.from({ length: height }, () =>
  Array.from({ length: width }, () => ({ type: "floor" }))
);
terrain[0][1] = {
  type: "player_lift",
  layers: [{ type: "player_lift", elevation: 0, raised: false }],
  raised: false
};

const engine = createEngine({
  width,
  height,
  terrain,
  actors: [
    { type: "player", x: 0, y: 0, elevation: 0, removed: false }, // A
    { type: "player", x: 0, y: 3, elevation: 0, removed: false }, // B
    { type: "puncher", direction: "up", x: 1, y: 3, elevation: 0, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);

// Sanity: no hole anywhere on the board.
const terrainHasHole = terrain.some((row) =>
  row.some(
    (cell) =>
      cell.type === "hole" ||
      (cell.layers || []).some((layer) => layer.type === "hole")
  )
);
console.log("board has any hole terrain:", terrainHasHole);

const result = engine.move(state, 1, 0); // one 'right' input

console.log("moved:", result.moved);
console.log("liftToggles:", JSON.stringify(result.liftToggles));

function dumpActor(label, i) {
  console.log(
    `${label}: x=${state.actorX[i]} y=${state.actorY[i]} elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
  );
}
dumpActor("player A (0)", 0);
dumpActor("player B (1)", 1);
dumpActor("puncher (2)", 2);

const bMove = result.moves.find((m) => m.actorIndex === 1 && !m.visualOnly);
console.log(
  "B move record:",
  JSON.stringify(
    bMove && {
      fromX: bMove.fromX,
      fromY: bMove.fromY,
      toX: bMove.toX,
      toY: bMove.toY,
      fromElevation: bMove.fromElevation,
      toElevation: bMove.toElevation,
      punchSlide: bMove.punchSlide,
      toRemoved: bMove.toRemoved
    }
  )
);

const bugReproduced =
  state.actorRemoved[1] === 1 &&
  state.actorRemoved[0] === 0 &&
  state.actorX[0] === 1 &&
  state.actorY[0] === 0 &&
  state.actorElevation[0] === 1 &&
  !terrainHasHole;

console.log(bugReproduced ? "BUG REPRODUCED" : "BUG NOT REPRODUCED");
process.exit(bugReproduced ? 0 : 1);
