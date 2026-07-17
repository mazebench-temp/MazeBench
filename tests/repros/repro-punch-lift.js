const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function playerLiftLayer(elevation = 0, raised = false) {
  return {
    type: "player_lift",
    layers: [{ type: "player_lift", elevation, raised }],
    raised
  };
}

function dump(label, engine, state, result) {
  console.log(`--- ${label} ---`);
  if (result) {
    console.log("moved:", result.moved);
    console.log("liftToggles:", JSON.stringify(result.liftToggles));
    console.log(
      "moves:",
      JSON.stringify(
        result.moves.map((m) => ({
          idx: m.actorIndex,
          type: m.actorType,
          from: [m.fromX, m.fromY, m.fromElevation],
          to: [m.toX, m.toY, m.toElevation],
          punchSlide: m.punchSlide,
          visualOnly: m.visualOnly
        }))
      )
    );
  }
  console.log("player pos:", state.actorX[0], state.actorY[0], "elev:", state.actorElevation[0]);
  console.log("liftRaised buffer:", Array.from(state.liftRaised));
  console.log();
}

// CASE A (finding scenario): player punched onto a lowered lift.
// 3x1: [player on floor][floor + puncher facing right][player_lift lowered]
{
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain: [[{ type: "floor" }, { type: "floor" }, playerLiftLayer(0, false)]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  dump("CASE A: punched onto lowered lift", engine, state, result);
}

// CASE B (control): player walks onto the identical lowered lift cell.
// 2x1: [player on floor][player_lift lowered]
{
  const engine = createEngine({
    width: 2,
    height: 1,
    terrain: [[{ type: "floor" }, playerLiftLayer(0, false)]],
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  dump("CASE B: walked onto lowered lift", engine, state, result);
}

// CASE C: punched toward a RAISED lift (raised lift blocks at elevation 0,
// so the punch is stopped one cell short and the lift stays raised).
{
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain: [[{ type: "floor" }, { type: "floor" }, playerLiftLayer(0, true)]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  dump("CASE C: punched toward raised lift", engine, state, result);
}
