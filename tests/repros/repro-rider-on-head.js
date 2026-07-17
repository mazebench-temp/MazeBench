const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function dump(label, state) {
  const names = ["P1(pusher)", "BOX", "P2(rider)"];
  console.log(label);
  for (let i = 0; i < 3; i += 1) {
    console.log(
      `  ${names[i]}: x=${state.actorX[i]} y=${state.actorY[i]} elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  }
}

// Row: [floor][floor P1][floor: box + P2 on top at elev 1][floor][floor]
const engine = createEngine({
  width: 5,
  height: 1,
  terrain: floorTerrain(5, 1),
  actors: [
    { type: "player", x: 1, y: 0, elevation: 0, removed: false }, // P1 pusher
    { type: "box", x: 2, y: 0, elevation: 0, removed: false },    // box
    { type: "player", x: 2, y: 0, elevation: 1, removed: false }  // P2 rider on box
  ]
});

const state = engine.cloneState(engine.initialState);
dump("initial:", state);

const r1 = engine.move(state, 1, 0);
console.log("move right #1 -> moved:", r1.moved);
dump("after move 1:", state);

// Finding claims: P2 stays at (2,0) elev 1 standing on P1's head.
const stuckOnHead =
  state.actorX[2] === 2 &&
  state.actorY[2] === 0 &&
  state.actorElevation[2] === 1 &&
  state.actorX[0] === 2 &&
  state.actorY[0] === 0 &&
  state.actorElevation[0] === 0;
console.log("P2 standing directly on P1's head:", stuckOnHead);

// Follow-up moves to observe whether P2 is stuck / eventually falls.
const r2 = engine.move(state, 1, 0);
console.log("move right #2 -> moved:", r2.moved);
dump("after move 2:", state);

const r3 = engine.move(state, 1, 0);
console.log("move right #3 -> moved:", r3.moved);
dump("after move 3:", state);

// Control test: can a player ever WALK onto another player's head via movement?
// P2 at elev 1 on a block adjacent to P1 standing on floor; moving toward P1
// should NOT put P2 on P1's head (canPlayerStandAtElevation excludes players).
const engine2 = createEngine({
  width: 3,
  height: 1,
  terrain: [[
    { type: "floor" },
    { type: "floor" },
    { type: "ice_block", layers: [{ type: "ice_block", elevation: 0 }] }
  ]],
  actors: [
    { type: "player", x: 1, y: 0, elevation: 0, removed: false }, // P1 on floor
    { type: "player", x: 2, y: 0, elevation: 1, removed: false }  // P2 on block
  ]
});
const state2 = engine2.cloneState(engine2.initialState);
const w = engine2.move(state2, -1, 0);
console.log("\ncontrol (walk-onto-head): moved:", w.moved);
console.log(
  `  P1: x=${state2.actorX[0]} elev=${state2.actorElevation[0]}  P2: x=${state2.actorX[1]} elev=${state2.actorElevation[1]}`
);
console.log(
  "  P2 ended on P1's head via walking:",
  state2.actorX[1] === state2.actorX[0] &&
    state2.actorElevation[1] === state2.actorElevation[0] + 1
);
