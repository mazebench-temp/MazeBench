// Control: same board, but no player A toggling the lift.
// B punched up onto the lowered lift cell should survive at (1,0) e0.
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
    { type: "player", x: 0, y: 3, elevation: 0, removed: false }, // B only
    { type: "puncher", direction: "up", x: 1, y: 3, elevation: 0, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);
const result = engine.move(state, 1, 0);

console.log("moved:", result.moved);
console.log(
  `player B: x=${state.actorX[0]} y=${state.actorY[0]} elev=${state.actorElevation[0]} removed=${state.actorRemoved[0]}`
);
console.log(
  state.actorRemoved[0] === 0 && state.actorX[0] === 1 && state.actorY[0] === 0
    ? "CONTROL OK: B survives on lowered lift"
    : "CONTROL UNEXPECTED"
);
