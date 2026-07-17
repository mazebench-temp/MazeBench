const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

// [orange_button + player][orange_wall][floor]
// Player steps off its own button directly onto the lowered wall cell.
const terrain = [
  [{ type: "orange_button" }, { type: "orange_wall" }, { type: "floor" }]
];
const engine = createEngine({
  width: 3,
  height: 1,
  terrain,
  actors: [{ type: "player", x: 0, y: 0, removed: false }]
});
const state = engine.cloneState(engine.initialState);
const result = engine.move(state, 1, 0);
console.log("moved:", result.moved);
console.log("player:", state.actorX[0], state.actorY[0], "elev", state.actorElevation[0]);
console.log("moves:", JSON.stringify(result.moves));
