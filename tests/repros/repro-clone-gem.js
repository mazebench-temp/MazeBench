const path = require("path");
const { loadBrowserScript } = require(path.join(
  "/Users/jpappas/code/GitHub/PixelGameTest",
  "tests/helpers/browser-module-loader"
));

global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

// Scenario from finding: [P][.][C][G] on a 4x1 all-floor strip.
const engine = createEngine({
  width: 4,
  height: 1,
  terrain: floorTerrain(4, 1),
  actors: [
    { type: "player", x: 0, y: 0, removed: false },
    { type: "clone", groupId: "c0", x: 2, y: 0, removed: false },
    { type: "gem", x: 3, y: 0, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);
console.log("initial isSolved:", engine.isSolved(state));

const result = engine.move(state, 1, 0);

console.log("moved:", result.moved);
console.log(
  "positions after Right:",
  JSON.stringify({
    player: [state.actorX[0], state.actorY[0]],
    clone: [state.actorX[1], state.actorY[1]],
    gem: [state.actorX[2], state.actorY[2]]
  })
);
console.log("gem actorRemoved:", state.actorRemoved[2]);
console.log("isSolved:", engine.isSolved(state));
const gemRecords = (result.moves || []).filter((m) => m.actorType === "gem");
console.log("gem move records:", JSON.stringify(gemRecords));
console.log(
  "any toRemoved===true record:",
  (result.moves || []).some((m) => m.toRemoved === true)
);
console.log(
  "all move records (index,type,from->to,toRemoved):",
  (result.moves || []).map(
    (m) =>
      `${m.actorIndex}:${m.actorType} (${m.fromX},${m.fromY})->(${m.toX},${m.toY}) rem=${m.toRemoved === true}`
  )
);

// stateKey comparison: same layout built directly (clone already on gem, nothing collected)
const engine2 = createEngine({
  width: 4,
  height: 1,
  terrain: floorTerrain(4, 1),
  actors: [
    { type: "player", x: 1, y: 0, removed: false },
    { type: "clone", groupId: "c0", x: 3, y: 0, removed: false },
    { type: "gem", x: 3, y: 0, removed: false }
  ]
});
console.log(
  "stateKey(after move) === stateKey(direct layout):",
  engine.stateKey(state) === engine2.stateKey(engine2.cloneState(engine2.initialState))
);

// Part 2: main player PUSHED onto gem? Use a puncher? Simpler: pushed player via clone?
// Check the simpler documented case first; then run the solver over this level.
loadBrowserScript("public/maze-solver.js");
const solver = window.MazeSolver || window.MazeEngine;
console.log("MazeSolver keys:", Object.keys(window.MazeSolver || {}));
