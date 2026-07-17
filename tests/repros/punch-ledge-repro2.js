// Probe D/E: box / floating_floor IN FRONT of puncher gets punched off ledge.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}
function blockTop() {
  return { type: "block_asset", layers: [{ type: "block_asset", elevation: 0 }] };
}
function dump(state, labels) {
  return labels
    .map(
      (label, i) =>
        `${label}: (${state.actorX[i]},${state.actorY[i]}) e${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    )
    .join(" | ");
}

for (const victimType of ["box", "floating_floor"]) {
  console.log(`=== PROBE: ${victimType} punched off ledge (victim in front of puncher) ===`);
  const width = 7, height = 1;
  const terrain = floorTerrain(width, height);
  terrain[0][1] = blockTop();
  terrain[0][2] = blockTop();
  terrain[0][3] = blockTop();
  // (0,0),(4,0),(5,0),(6,0) plain floor

  const engine = createEngine({
    width,
    height,
    terrain,
    actors: [
      { type: "player", x: 1, y: 0, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 0, elevation: 1, removed: false },
      { type: victimType, x: 3, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const labels = ["player", "puncher", "victim"];

  console.log("start:", dump(state, labels));
  const r1 = engine.move(state, 1, 0); // player steps onto puncher -> punch train [player, victim]
  console.log(`move right: moved=${r1.moved}`);
  console.log("after:", dump(state, labels));

  const r2 = engine.move(state, 1, 0); // try to advance / push hovering victim
  console.log(`move right again: moved=${r2.moved}`);
  console.log("after:", dump(state, labels));

  const r3 = engine.move(state, 1, 0);
  console.log(`move right 3rd: moved=${r3.moved}`);
  console.log("after:", dump(state, labels));

  const r4 = engine.move(state, -1, 0);
  console.log(`move left (retreat): moved=${r4.moved}`);
  console.log("after:", dump(state, labels));
  console.log("");
}
