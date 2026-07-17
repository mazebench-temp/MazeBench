// Part 2: is the puncher recoverable by toggling the lift back down?
// Player steps onto an initially RAISED lift with a puncher at elevation 0:
// toggle lowers the lift, player lands at elevation 0 == puncher elevation.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function playerLiftLayer(elevation = 0, raised = false) {
  return {
    type: "player_lift",
    layers: [{ type: "player_lift", elevation, raised }],
    raised
  };
}

function dumpActors(label, state, types) {
  console.log(label);
  for (let i = 0; i < types.length; i += 1) {
    console.log(
      `  actor${i} (${types[i]}): x=${state.actorX[i]} y=${state.actorY[i]} ` +
        `elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  }
}

// [floor P][RAISED lift + right puncher@0][floor][floor][wall]
{
  const terrain = floorTerrain(5, 1);
  terrain[0][1] = playerLiftLayer(0, true);
  terrain[0][4] = { type: "wall" };
  const engine = createEngine({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const types = ["player", "puncher"];
  const state = engine.cloneState(engine.initialState);

  console.log("=== RAISED lift + puncher@0, player enters (lift toggles DOWN) ===");
  dumpActors("initial:", state, types);
  console.log("lift raised initially?", state.liftRaised.join(","));

  const r1 = engine.move(state, 1, 0);
  console.log("move right onto raised lift -> moved:", r1.moved);
  dumpActors("after:", state, types);
  console.log("lift raised now?", state.liftRaised.join(","));
  console.log(
    "punch fired (player launched past lift)?",
    state.actorX[0] > 1 ? `YES (player at x=${state.actorX[0]})` : "NO"
  );
}
