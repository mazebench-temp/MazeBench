// Repro: pressed orange wall "lowers as block" into the elevation band occupied
// by the player who just pressed the button, with no crush/blocking handling.
//
// Board (3x1):
//   (0,0) floor
//   (1,0) floor@0 + orange_wall@1  (floating arch, authorable as ".++O")
//   (2,0) floor
// Actors: player (0,0,e0), box (1,0,e0), orange_button actor (2,0,e0)
//
// Player moves right: pushes box onto button -> buttons pressed at move end.
// Player ends at (1,0) elevation 0, directly under the elevated orange wall.
// The wall has no non-orange support at elevation 1, so it "lowers as block"
// and starts blocking elevation 0 -- the exact cell+elevation of the player.

const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorCell() {
  return { type: "floor", layers: [{ type: "floor", elevation: 0 }] };
}

const terrain = [[
  floorCell(),
  {
    type: "orange_wall",
    layers: [
      { type: "floor", elevation: 0 },
      { type: "orange_wall", elevation: 1 }
    ]
  },
  floorCell()
]];

const engine = createEngine({
  width: 3,
  height: 1,
  terrain,
  actors: [
    { type: "player", x: 0, y: 0, elevation: 0, removed: false },
    { type: "box", x: 1, y: 0, elevation: 0, removed: false },
    { type: "orange_button", x: 2, y: 0, elevation: 0, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);

console.log("--- initial ---");
console.log("buttons pressed:", engine.areOrangeButtonsPressed(state));
console.log("wall lowers as block @ (1,0,elev1):",
  engine.pressedOrangeWallLowersAsBlock(state, 1, 0, 1));

console.log("\n--- move right (push box onto button) ---");
const result = engine.move(state, 1, 0);
console.log("moved:", result.moved);
console.log("player:", { x: state.actorX[0], y: state.actorY[0], elev: state.actorElevation[0], removed: state.actorRemoved[0] });
console.log("box:", { x: state.actorX[1], y: state.actorY[1], elev: state.actorElevation[1], removed: state.actorRemoved[1] });
console.log("buttons pressed:", engine.areOrangeButtonsPressed(state));

// Key probe: with buttons pressed, does the elevated orange wall at (1,0)
// elevation 1 now "lower as block" (i.e. terrain-block elevation 0)?
const lowers = engine.pressedOrangeWallLowersAsBlock(state, 1, 0, 1);
console.log("wall lowers as block @ (1,0,elev1):", lowers);

const playerInsideBlock =
  lowers &&
  state.actorX[0] === 1 && state.actorY[0] === 0 &&
  state.actorElevation[0] === 0 && !state.actorRemoved[0];
console.log("\nPLAYER CO-LOCATED WITH BLOCKING TERRAIN VOLUME:", playerInsideBlock);

// Can the player walk back out of the solid block?
console.log("\n--- move left (walk out of the block) ---");
const out = engine.move(state, -1, 0);
console.log("moved:", out.moved);
console.log("player:", { x: state.actorX[0], y: state.actorY[0], elev: state.actorElevation[0] });
console.log("buttons still pressed:", engine.areOrangeButtonsPressed(state));
console.log("wall still lowered as block:", engine.pressedOrangeWallLowersAsBlock(state, 1, 0, 1));

// And now that the player is outside, is re-entry blocked (proving the cell
// really is a solid block at elevation 0)?
console.log("\n--- move right again (try to re-enter the lowered block) ---");
const reenter = engine.move(state, 1, 0);
console.log("moved:", reenter.moved);
console.log("player:", { x: state.actorX[0], y: state.actorY[0], elev: state.actorElevation[0] });
