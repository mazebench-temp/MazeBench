const path = require("path");
process.chdir("/Users/jpappas/code/GitHub/PixelGameTest");
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function wallStack(count, startElevation = 0) {
  return {
    type: "wall",
    layers: Array.from({ length: count }, (_, i) => ({ type: "wall", elevation: startElevation + i }))
  };
}
function playerGateLayer(elevation = 0) {
  return { type: "player_gate", layers: [{ type: "player_gate", elevation }] };
}

function dump(engine, state, label) {
  const gateRaised = engine.computeRaisedPlayerGateSet(state).has(engine.cellIndex(2, 0));
  console.log(label);
  console.log("  gate(2,0) raised:", gateRaised);
  for (let i = 0; i < state.actorX.length; i += 1) {
    console.log(
      `  actor${i}: pos=(${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  }
}

console.log("=== Scenario A: finding's exact setup, regular box on gate ===");
{
  const terrain = [[wallStack(1), wallStack(1), playerGateLayer(0), { type: "floor" }]];
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 1, removed: false },
      { type: "box", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump(engine, state, "initial (player at (0,0) elev1, box on gate)");
  const r1 = engine.move(state, 1, 0);
  console.log("move right ->", r1.moved, JSON.stringify(r1.moves));
  dump(engine, state, "after player moves to (1,0), adjacent off-level");
  const r2 = engine.move(state, -1, 0);
  console.log("move left ->", r2.moved, JSON.stringify(r2.moves));
  dump(engine, state, "after player walks back to (0,0)");
}

console.log("\n=== Scenario B: same, weightless box M0 on gate ===");
{
  const terrain = [[wallStack(1), wallStack(1), playerGateLayer(0), { type: "floor" }]];
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 1, removed: false },
      { type: "weightless_box", groupId: "M0", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump(engine, state, "initial");
  const r1 = engine.move(state, 1, 0);
  console.log("move right ->", r1.moved, JSON.stringify(r1.moves));
  dump(engine, state, "after player moves to (1,0)");
  const r2 = engine.move(state, -1, 0);
  console.log("move left ->", r2.moved, JSON.stringify(r2.moves));
  dump(engine, state, "after player walks back to (0,0)");
}

console.log("\n=== Scenario C: same-elevation control (floor-level player, box on gate) ===");
{
  const terrain = [[{ type: "floor" }, playerGateLayer(0), { type: "floor" }]];
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "box", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const raised = engine.computeRaisedPlayerGateSet(state).has(engine.cellIndex(1, 0));
  console.log("  same-level adjacent player + box on gate -> raised:", raised, "(expected false: suppression active)");
}
