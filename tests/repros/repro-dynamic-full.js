const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

// Fully dynamic: gem authored on a box (auto-stacks to e1), clone+riding player
// push the box away; the gem is left floating at e1; the carried player lands
// exactly on it.
const engine = createEngine({
  width: 5,
  height: 1,
  terrain: floorTerrain(5, 1),
  actors: [
    { type: "box", x: 2, y: 0, removed: false },
    { type: "gem", x: 2, y: 0, removed: false }, // auto e1 on box
    { type: "clone", groupId: "c0", x: 1, y: 0, removed: false },
    { type: "player", x: 1, y: 0, elevation: 1, removed: false } // riding clone
  ]
});
const state = engine.cloneState(engine.initialState);
console.log(
  "initial: box e" + state.actorElevation[0],
  "gem e" + state.actorElevation[1],
  "clone e" + state.actorElevation[2],
  "player e" + state.actorElevation[3]
);
const result = engine.move(state, 1, 0);
console.log("moved=" + result.moved);
result.moves.forEach((m) =>
  console.log(
    "  move:",
    m.actorType,
    "#" + m.actorIndex,
    "(" + m.fromX + "," + m.fromY + ")e" + m.fromElevation,
    "->",
    "(" + m.toX + "," + m.toY + ")e" + m.toElevation,
    m.toRemoved ? "REMOVED" : ""
  )
);
console.log(
  "after: box=(" + state.actorX[0] + "," + state.actorY[0] + ")e" + state.actorElevation[0],
  "gem=(" + state.actorX[1] + "," + state.actorY[1] + ")e" + state.actorElevation[1],
  "clone=(" + state.actorX[2] + "," + state.actorY[2] + ")e" + state.actorElevation[2],
  "player=(" + state.actorX[3] + "," + state.actorY[3] + ")e" + state.actorElevation[3]
);
console.log(
  "player exactly on gem:",
  state.actorX[3] === state.actorX[1] &&
    state.actorY[3] === state.actorY[1] &&
    state.actorElevation[3] === state.actorElevation[1],
  "| gemRemoved=" + state.actorRemoved[1],
  "| isSolved=" + engine.isSolved(state)
);
