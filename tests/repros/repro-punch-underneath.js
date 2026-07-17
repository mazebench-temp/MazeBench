// Sub-claim: a hovering punched box lets another player walk UNDERNEATH it at e0.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}
function wall1() {
  return { type: "wall", layers: [{ type: "wall", elevation: 0 }] };
}

const terrain = floorTerrain(5, 3);
terrain[0][2] = wall1();
terrain[1][2] = wall1();
terrain[2][2] = wall1();

const engine = createEngine({
  width: 5,
  height: 3,
  terrain,
  actors: [
    { type: "player", x: 2, y: 0, elevation: 1, removed: false },
    { type: "box", x: 2, y: 1, elevation: 1, removed: false },
    { type: "puncher", direction: "right", x: 2, y: 2, elevation: 1, removed: false },
    { type: "circle_player", x: 4, y: 0, elevation: 0, removed: false }
  ]
});
const state = engine.cloneState(engine.initialState);

function dump(label) {
  console.log(label);
  ["player", "box", "puncher", "circle"].forEach((name, i) => {
    console.log(
      `  ${name}: pos=(${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  });
}

dump("initial");
let r = engine.move(state, 0, 1);
console.log("move down (push box onto puncher): moved=" + r.moved);
dump("after punch");

r = engine.move(state, 0, 1);
console.log("move down again: moved=" + r.moved);
dump("after second down");

console.log(
  "circle underneath box (same x/y, lower elev):",
  state.actorX[3] === state.actorX[1] &&
    state.actorY[3] === state.actorY[1] &&
    state.actorElevation[3] < state.actorElevation[1]
);
