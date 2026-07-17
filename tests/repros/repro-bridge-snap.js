// Repro: slope exit into unsupported air under a bridge — does the endpoint
// snap teleport the player UP onto the bridge top instead of falling to floor?
const { loadBrowserScript } = require("../helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function run(label, bridgeCell) {
  const terrain = [[
    { type: "floor" },
    { type: "ice_slope", layers: [{ type: "ice_slope", direction: "right", elevation: 0 }] },
    bridgeCell,
    { type: "floor" }
  ]];
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain,
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0); // move right into the slope
  console.log(label);
  console.log("  moved:", result.moved);
  console.log("  player pos:", state.actorX[0], state.actorY[0], "elevation:", state.actorElevation[0]);
  console.log("  path:", JSON.stringify(result.moves?.[0]?.path ?? null));
  return { x: state.actorX[0], y: state.actorY[0], elev: state.actorElevation[0] };
}

// Control: plain floor at (2,0). Expected: player slides up slope, exits at
// elevation 1, falls to floor elevation 0 (matches existing test at
// tests/maze-engine.test.js:952).
const control = run("CONTROL (floor only at x=2):", { type: "floor" });

// Bridge: floor@0 plus block_asset@2 (body occupies elevation 2, top surface 3).
// Elevation 1 at (2,0) is open air; player exits the slope there.
const bridge = run("BRIDGE (floor@0 + block_asset@2 at x=2):", {
  type: "floor",
  layers: [
    { type: "floor", elevation: 0 },
    { type: "block_asset", elevation: 2 }
  ]
});

console.log("");
if (bridge.elev === 3) {
  console.log("FINDING CONFIRMED: player teleported UP to elevation 3 (bridge top);");
  console.log("control landed at elevation " + control.elev + ".");
} else if (bridge.elev === control.elev) {
  console.log("FINDING REFUTED: bridge case landed at elevation " + bridge.elev + ", same as control.");
} else {
  console.log("UNEXPECTED: bridge elev=" + bridge.elev + " control elev=" + control.elev);
}
