// Repro: puncher sitting on a player_lift does not ride the lift surface.
// Finding: once the lift raises, the puncher stays at elevation 0 while actors
// standing on the raised lift are at elevation 1, so puncherActorAt's exact
// elevation match never fires again.

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

function dumpActors(label, state, engine, types) {
  console.log(label);
  for (let i = 0; i < types.length; i += 1) {
    console.log(
      `  actor${i} (${types[i]}): x=${state.actorX[i]} y=${state.actorY[i]} ` +
        `elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  }
}

// ---------------------------------------------------------------------------
// CONTROL: puncher on plain floor. Player steps onto it -> punched right.
// ---------------------------------------------------------------------------
{
  const terrain = floorTerrain(5, 1);
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
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  console.log("=== CONTROL (floor puncher) ===");
  console.log("moved:", result.moved);
  dumpActors("after step onto puncher:", state, engine, ["player", "puncher"]);
  console.log(
    "player punched to x=3?",
    state.actorX[0] === 3 ? "YES (puncher works on floor)" : "NO"
  );
  console.log();
}

// ---------------------------------------------------------------------------
// SCENARIO: [floor P][lowered lift + right puncher][floor box][floor][wall]
// Player steps right onto the lift. Per finding: lift raises, player ends at
// (1,0) elev 1, puncher stays at elev 0, box at (2,0) is NOT punched.
// ---------------------------------------------------------------------------
{
  const terrain = floorTerrain(5, 1);
  terrain[0][1] = playerLiftLayer(0, false);
  terrain[0][4] = { type: "wall" };
  const engine = createEngine({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false },
      { type: "box", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const types = ["player", "puncher", "box"];
  const state = engine.cloneState(engine.initialState);

  console.log("=== SCENARIO (puncher on lowered lift) ===");
  dumpActors("initial:", state, engine, types);

  const r1 = engine.move(state, 1, 0);
  console.log("move right onto lift -> moved:", r1.moved);
  dumpActors("after step onto lift:", state, engine, types);
  console.log("lift raised?", state.liftRaised.join(","));
  console.log(
    "player elevation:", state.actorElevation[0],
    "| puncher elevation:", state.actorElevation[1]
  );
  console.log(
    "box punched?",
    state.actorX[2] !== 2 ? `YES (box at x=${state.actorX[2]})` : "NO (box still at x=2)"
  );
  console.log(
    "player punch-slid?",
    state.actorX[0] !== 1 ? `YES (player at x=${state.actorX[0]})` : "NO (player parked on lift)"
  );

  // Now the raised-lift surface is at elevation 1. Push a box onto the lift
  // cell or step again: does the stale-elevation puncher ever fire?
  // Step off to the left, then push the box... box is to the right of lift, so
  // instead: move left off the lift (lift stays raised? toggles only on player
  // entering lift), then re-enter to see toggle behavior.
  const r2 = engine.move(state, -1, 0); // step back off lift
  console.log("\nmove left off lift -> moved:", r2.moved);
  dumpActors("after stepping off:", state, engine, types);
  console.log("lift raised?", state.liftRaised.join(","));

  const r3 = engine.move(state, 1, 0); // step onto (now raised?) lift again
  console.log("\nmove right onto lift again -> moved:", r3.moved);
  dumpActors("after second entry:", state, engine, types);
  console.log("lift raised?", state.liftRaised.join(","));
  console.log(
    "puncher elevation now:", state.actorElevation[1],
    "| player elevation now:", state.actorElevation[0]
  );
  console.log(
    "punch fired on second entry?",
    state.actorX[0] !== 1 || state.actorX[2] !== 2 ? "YES" : "NO"
  );
}
