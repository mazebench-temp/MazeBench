// Repro: play-mode move() vs moveForSearch() disagree on `moved` for a
// blocked-ice-slope bounce that is a pure visual no-op.
// Layout (3x1): [player on floor][ice_slope right, elev 0][wall stack elev 0-1]
const { loadBrowserScript } = require("../helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function makePlayData() {
  return {
    width: 3,
    height: 1,
    terrain: [[
      { type: "floor" },
      { type: "ice_slope", layers: [{ type: "ice_slope", direction: "right", elevation: 0 }] },
      {
        type: "wall",
        layers: [
          { type: "wall", elevation: 0 },
          { type: "wall", elevation: 1 }
        ]
      }
    ]],
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  };
}

// --- Play mode ---
{
  const engine = createEngine(makePlayData());
  const state = engine.cloneState(engine.initialState);
  const keyBefore = engine.stateKey(state);
  const result = engine.move(state, 1, 0); // input Right
  const keyAfter = engine.stateKey(state);
  console.log("PLAY MODE  move(state, 1, 0):");
  console.log("  moved            =", result.moved);
  console.log("  moves.length     =", result.moves.length);
  console.log("  moves[0].visualOnly =", result.moves[0]?.visualOnly);
  console.log("  moves[0].path    =", JSON.stringify(result.moves[0]?.path));
  console.log("  player pos after =", [state.actorX[0], state.actorY[0], state.actorElevation[0]]);
  console.log("  stateKey unchanged =", keyBefore === keyAfter);
}

// --- Search mode ---
{
  const engine = createEngine(makePlayData());
  const state = engine.cloneState(engine.initialState);
  const keyBefore = engine.stateKey(state);
  const result = engine.moveForSearch(state, 1, 0); // identical state + input
  const keyAfter = engine.stateKey(state);
  console.log("SEARCH MODE moveForSearch(state, 1, 0):");
  console.log("  moved            =", result.moved);
  console.log("  moves.length     =", result.moves.length);
  console.log("  stateKey unchanged =", keyBefore === keyAfter);
}
