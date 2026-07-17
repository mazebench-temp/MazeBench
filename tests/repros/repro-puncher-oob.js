// Repro: sticky-carrier puncher relocated off the board with no bounds check
// Scenario from finding: 3x1 all floor, player (0,0), box (1,0),
// puncher facing right at (2,0). Player pushes box right onto puncher's cell.
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
  width: 3,
  height: 1,
  terrain: floorTerrain(3, 1),
  actors: [
    { type: "player", x: 0, y: 0, removed: false },
    { type: "box", x: 1, y: 0, elevation: 0, removed: false },
    { type: "puncher", direction: "right", x: 2, y: 0, elevation: 0, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);
const result = engine.move(state, 1, 0);

console.log("moved:", result.moved);
for (let i = 0; i < 3; i += 1) {
  console.log(
    `actor ${i} (${["player", "box", "puncher"][i]}):`,
    "x=", state.actorX[i],
    "y=", state.actorY[i],
    "elev=", state.actorElevation[i],
    "removed=", state.actorRemoved[i]
  );
}
console.log("puncher x === 3 (out of bounds on width-3 board)?", state.actorX[2] === 3);
console.log("stateKey:", engine.stateKey(state));
console.log(
  "moves:",
  JSON.stringify(
    result.moves.map((m) => ({
      actorIndex: m.actorIndex,
      actorType: m.actorType,
      visualOnly: m.visualOnly === true,
      fromX: m.fromX,
      fromY: m.fromY,
      toX: m.toX,
      toY: m.toY
    })),
    null,
    2
  )
);

// Follow-up: engine keeps running; off-board puncher persists across further moves
const r2 = engine.move(state, 1, 0); // push box again (edge -> blocked)
console.log("second push moved:", r2.moved, "| puncher still at x =", state.actorX[2]);
const r3 = engine.move(state, -1, 0); // player steps back left
console.log("step left moved:", r3.moved, "| puncher still at x =", state.actorX[2]);
