const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

// Plain push, NO ice: [orange_button + player][floor + box][orange_wall][floor]
// Player moves right: pushes box onto the lowered wall cell while stepping off
// the button. Does the box ride the rising wall to elevation 1?
const terrain = [
  [
    { type: "orange_button" },
    { type: "floor" },
    { type: "orange_wall" },
    { type: "floor" }
  ]
];
const engine = createEngine({
  width: 4,
  height: 1,
  terrain,
  actors: [
    { type: "player", x: 0, y: 0, removed: false },
    { type: "box", x: 1, y: 0, removed: false }
  ]
});
const state = engine.cloneState(engine.initialState);
const result = engine.move(state, 1, 0);
console.log("moved:", result.moved);
console.log("player:", state.actorX[0], state.actorY[0], "elev", state.actorElevation[0]);
console.log("box   :", state.actorX[1], state.actorY[1], "elev", state.actorElevation[1]);
const boxMove = result.moves.find((m) => m.actorIndex === 1);
console.log("boxMove:", JSON.stringify(boxMove));
