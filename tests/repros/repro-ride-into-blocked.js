const path = require("path");
process.chdir("/Users/jpappas/code/GitHub/PixelGameTest");
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine, terrainTypes } = window.MazeEngine;

function createState(playData) {
  const engine = createEngine(playData);
  return { engine, state: engine.cloneState(engine.initialState) };
}

function dump(label, engine, state) {
  const gateSet = engine.computeRaisedPlayerGateSet(state);
  console.log(label);
  for (let i = 0; i < engine.actorCount; i += 1) {
    console.log(
      `  actor ${i} (${engine.actorTypes[i]}): x=${state.actorX[i]} y=${state.actorY[i]} elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  }
  console.log(`  gateRaisedAt(2,0)=${gateSet.has(engine.cellIndex(2, 0))}`);
  console.log(`  orangeButtonsPressed=${engine.areOrangeButtonsPressed(state)}`);
}

console.log("=== VARIANT A: player_gate elev0 + wall elev1 in the same cell ===");
{
  const terrain = [[
    { type: "wall", layers: [{ type: "wall", elevation: 0 }] },          // (0,0)
    { type: "wall", layers: [{ type: "wall", elevation: 0 }] },          // (1,0)
    {
      type: "player_gate",
      layers: [
        { type: "player_gate", elevation: 0 },
        { type: "wall", elevation: 1 }                                    // bridge above the gate
      ]
    },                                                                    // (2,0)
    { type: "floor" }                                                     // (3,0)
  ]];

  const { engine, state } = createState({
    width: 4,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 1, removed: false },       // on wall top
      { type: "box", x: 2, y: 0, elevation: 0, removed: false }           // resting on lowered gate
    ]
  });

  dump("initial:", engine, state);

  const r1 = engine.move(state, 1, 0); // player (0,0)e1 -> (1,0)e1, now adjacent to gate at different elevation
  console.log(`move right: moved=${r1.moved}`);
  dump("after player steps adjacent (gate should raise):", engine, state);

  console.log(
    `  >>> box elevation is ${state.actorElevation[1]} in a cell whose wall layer sits at elevation 1` +
    ` (wall layer blocks elevation 1) => box embedded in terrain: ${state.actorElevation[1] === 1}`
  );

  // Try to push the box (player at (1,0) elev 1, box at (2,0) elev 1)
  const r2 = engine.move(state, 1, 0);
  console.log(`push attempt on embedded box: moved=${r2.moved}`);
  dump("after push attempt:", engine, state);
}

console.log("");
console.log("=== VARIANT B: orange_wall elev0 + wall elev1, orange_button actor ===");
{
  const terrain = [[
    { type: "floor" },                                                    // (0,0)
    { type: "floor" },                                                    // (1,0) button actor here
    {
      type: "orange_wall",
      layers: [
        { type: "orange_wall", elevation: 0 },
        { type: "wall", elevation: 1 }                                    // bridge above the orange wall
      ]
    }                                                                     // (2,0)
  ]];

  const { engine, state } = createState({
    width: 3,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 1, y: 0, elevation: 0, removed: false },       // standing on button => pressed
      { type: "orange_button", x: 1, y: 0, elevation: 0, removed: false },
      { type: "box", x: 2, y: 0, elevation: 0, removed: false }           // resting on lowered orange wall
    ]
  });

  dump("initial (button pressed, wall lowered):", engine, state);

  const r1 = engine.move(state, -1, 0); // step off the button => wall rises
  console.log(`move left off button: moved=${r1.moved}`);
  dump("after stepping off button (orange wall rises):", engine, state);

  console.log(
    `  >>> box elevation is ${state.actorElevation[2]} in a cell whose wall layer sits at elevation 1` +
    ` => box embedded in terrain: ${state.actorElevation[2] === 1}`
  );
}
