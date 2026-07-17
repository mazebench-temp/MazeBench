// Repro: floating_floor filling a hole rewrites the whole cell to a single
// floor layer, deleting the bridge (block_asset elevation 1) layer and leaving
// a box hovering unsupported at elevation 2.
const { loadBrowserScript } = require(
  "/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader"
);

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine, terrainTypes } = window.MazeEngine;

// Board 3x1:
//  (0,0) floor  -> player
//  (1,0) floor  -> floating_floor
//  (2,0) bridge cell: nothing at e0 (void), block_asset at e1 (top surface e2)
//        -> box actor resting on the bridge top at elevation 2
// This matches the "++b1" cell stack produced by server/maze-levels.js
// buildCellStack: two "+" air entries then b1 => block_asset layer elevation 1.
const terrain = [
  [
    { type: "floor" },
    { type: "floor" },
    { type: "block_asset", layers: [{ type: "block_asset", elevation: 1 }] }
  ]
];

function freshState() {
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, removed: false },
      { type: "box", x: 2, y: 0, elevation: 2, removed: false }
    ]
  });
  return { engine, state: engine.cloneState(engine.initialState) };
}

// ---- Baseline sanity: bridge supports the box in the initial state ----
{
  const { engine, state } = freshState();
  console.log("[baseline] box at:", state.actorX[2], state.actorY[2],
    "elev:", state.actorElevation[2], "removed:", state.actorRemoved[2]);
}

// ---- Main repro ----
const { engine, state } = freshState();

const push = engine.move(state, 1, 0); // player pushes floating_floor into the void at e0
console.log("[push] moved:", push.moved);
console.log("[push] terrain byte at (2,0):", state.terrain[engine.cellIndex(2, 0)],
  "(floor =", terrainTypes.floor + ", block_asset =", terrainTypes.block_asset + ")");
console.log("[push] floating_floor removed (consumed filling hole):",
  state.actorRemoved[1] === 1);
console.log("[push] box after fill -> x,y:", state.actorX[2], state.actorY[2],
  "elev:", state.actorElevation[2], "removed:", state.actorRemoved[2]);

if (state.actorRemoved[2] === 0 && state.actorElevation[2] === 2) {
  console.log(">>> box is HOVERING at elevation 2: its supporting bridge layer");
  console.log(">>> (block_asset e1, surface e2) vanished from physics after the fill.");
}

// Player walks into the cell at e0 (formerly the space under the bridge)
const walk = engine.move(state, 1, 0);
console.log("[walk] moved:", walk.moved,
  "player x,y:", state.actorX[0], state.actorY[0],
  "elev:", state.actorElevation[0], "removed:", state.actorRemoved[0]);
if (walk.moved && state.actorX[0] === 2 && state.actorElevation[0] === 0 &&
    state.actorRemoved[0] === 0) {
  console.log(">>> player stands at (2,0) e0 directly under the box hovering at e2.");
}

// ---- Solver flip-flop: undoMove restores the terrain byte, resurrecting the bridge ----
{
  const { engine, state } = freshState();
  const record = engine.moveForSearch(state, 1, 0);
  console.log("[search] after fill terrain byte:", state.terrain[engine.cellIndex(2, 0)]);
  engine.undoMove(state, record);
  console.log("[undo] terrain byte restored to:", state.terrain[engine.cellIndex(2, 0)],
    "(block_asset =", terrainTypes.block_asset + ") -> bridge layers back in force");
}
