const path = require("path");
process.chdir("/Users/jpappas/code/GitHub/PixelGameTest");
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

// Scenario from finding: 4x1, player (0,0), puncher facing right (1,0), gem (2,0), wall (3,0)
const terrain = floorTerrain(4, 1);
terrain[0][3] = { type: "wall" };

const engine = createEngine({
  width: 4,
  height: 1,
  terrain,
  actors: [
    { type: "player", x: 0, y: 0, removed: false },              // index 0
    { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false }, // index 1
    { type: "gem", x: 2, y: 0, removed: false }                  // index 2
  ]
});

const state = engine.cloneState(engine.initialState);
const result = engine.move(state, 1, 0);

console.log("moved:", result.moved);
console.log("player pos:", [state.actorX[0], state.actorY[0]], "removed:", state.actorRemoved[0]);
console.log("gem pos:", [state.actorX[2], state.actorY[2]], "gem actorRemoved:", state.actorRemoved[2]);
console.log("gem move records:", JSON.stringify(result.moves.filter((m) => m.actorIndex === 2)));
console.log("isSolved:", engine.isSolved(state));
console.log("all move records actorIndex/type/toRemoved:",
  result.moves.map((m) => ({ i: m.actorIndex, t: m.actorType, visualOnly: !!m.visualOnly, toRemoved: !!m.toRemoved, from: [m.fromX, m.fromY], to: [m.toX, m.toY] })));

// CONTROL: same layout but no puncher — player walks onto gem directly
{
  const terrain2 = floorTerrain(2, 1);
  const engine2 = createEngine({
    width: 2,
    height: 1,
    terrain: terrain2,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "gem", x: 1, y: 0, removed: false }
    ]
  });
  const state2 = engine2.cloneState(engine2.initialState);
  const result2 = engine2.move(state2, 1, 0);
  console.log("\nCONTROL walk-onto-gem: gem actorRemoved:", state2.actorRemoved[1],
    "gem move record present:", result2.moves.some((m) => m.actorIndex === 1 && m.toRemoved),
    "isSolved:", engine2.isSolved(state2));
}
