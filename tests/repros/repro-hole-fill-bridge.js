// Repro: floating_floor fills a hole in a cell that also has an authored
// block_asset bridge layer at elevation 2. Claim: the fill replaces ALL
// terrain layers with a single synthetic floor@0 layer, so the bridge
// vanishes from physics and actors on it float forever.
const path = require("path");
const { loadBrowserScript } = require(
  "/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader"
);
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine, terrainTypes } = window.MazeEngine;

const floor = () => ({ type: "floor" });
const bridgeOverHole = () => ({
  type: "block_asset",
  layers: [
    { type: "hole", elevation: 0 },
    { type: "block_asset", elevation: 2 }
  ]
});
const tower3 = () => ({
  type: "block_asset",
  layers: [
    { type: "block_asset", elevation: 0 },
    { type: "block_asset", elevation: 1 },
    { type: "block_asset", elevation: 2 }
  ]
});

function show(engine, state, label, indexes) {
  const parts = indexes.map(
    (i) =>
      `#${i}(${engine.actorTypes[i]})=(${state.actorX[i]},${state.actorY[i]},e${state.actorElevation[i]})rm=${state.actorRemoved[i]}`
  );
  console.log("  " + label + ": " + parts.join(" "));
}

console.log("=== Scenario 1: CONTROL — bridge top is standable from adjacent tower (no fill) ===");
{
  const terrain = [
    [floor(), floor(), bridgeOverHole(), floor()],
    [floor(), tower3(), tower3(), floor()]
  ];
  const engine = createEngine({
    width: 4,
    height: 2,
    terrain,
    actors: [{ type: "player", x: 1, y: 1, elevation: 3, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);
  const r1 = engine.move(state, 1, 0); // tower (1,1,3) -> tower (2,1,3)
  console.log("  move right on tower: moved=" + r1.moved);
  const r2 = engine.move(state, 0, -1); // tower (2,1,3) -> bridge (2,0,3)
  console.log("  step onto bridge top: moved=" + r2.moved);
  show(engine, state, "final", [0]);
  console.log(
    "  terrain@(2,0) code=" +
      state.terrain[engine.cellIndex(2, 0)] +
      " (block_asset=" + terrainTypes.block_asset + ")"
  );
}

console.log("\n=== Scenario 2: FILL then try the SAME step onto the bridge top ===");
{
  const terrain = [
    [floor(), floor(), bridgeOverHole(), floor()],
    [floor(), tower3(), tower3(), floor()]
  ];
  const engine = createEngine({
    width: 4,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 1, y: 1, elevation: 3, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 0, elevation: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const r1 = engine.move(state, 1, 0);
  // player tower->tower; clone (0,0)->(1,0) pushes floating_floor into (2,0) hole
  console.log("  move right: moved=" + r1.moved);
  show(engine, state, "after fill turn", [0, 1, 2]);
  console.log(
    "  terrain@(2,0) code=" +
      state.terrain[engine.cellIndex(2, 0)] +
      " (floor=" + terrainTypes.floor +
      ", base was block_asset=" + terrainTypes.block_asset + ") -> fill happened? " +
      (state.terrain[engine.cellIndex(2, 0)] === terrainTypes.floor)
  );
  const r2 = engine.move(state, 0, -1); // same step onto bridge top as control
  console.log("  step onto bridge top after fill: moved=" + r2.moved);
  show(engine, state, "final", [0, 1, 2]);
}

console.log("\n=== Scenario 3: box authored on bridge top; fill underneath; does it ever fall? ===");
{
  const terrain = [[floor(), floor(), bridgeOverHole(), floor()]];
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 0, removed: false },
      { type: "box", x: 2, y: 0, elevation: 3, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const r1 = engine.move(state, 1, 0); // push floating_floor into hole -> fill
  console.log("  push ff into hole: moved=" + r1.moved);
  console.log(
    "  terrain@(2,0) now floor? " +
      (state.terrain[engine.cellIndex(2, 0)] === terrainTypes.floor)
  );
  show(engine, state, "after fill", [0, 1, 2]);
  const r2 = engine.move(state, 1, 0); // player walks to (2,0) elev 0, under the box
  console.log("  player walks into filled cell: moved=" + r2.moved);
  show(engine, state, "after walk", [0, 1, 2]);
  const r3 = engine.move(state, 1, 0);
  show(engine, state, "one more move", [0, 1, 2]);
  console.log(
    "  box floating at elevation " + state.actorElevation[2] +
      " above a floor-only cell, player stood under it at elev " +
      state.actorElevation[0]
  );
}

console.log("\n=== Scenario 4: player ON the bridge when the hole under it is filled (softlock probe) ===");
{
  const terrain = [
    [floor(), floor(), bridgeOverHole(), { type: "wall" }]
  ];
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 2, y: 0, elevation: 3, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 0, elevation: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const r1 = engine.move(state, 1, 0);
  // player blocked by wall at (3,0) (no support at elev 3); clone pushes ff into hole under player
  console.log("  fill turn: moved=" + r1.moved);
  console.log(
    "  terrain@(2,0) now floor? " +
      (state.terrain[engine.cellIndex(2, 0)] === terrainTypes.floor)
  );
  show(engine, state, "after fill", [0, 1, 2]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 0], [-1, 0]];
  dirs.forEach(([dx, dy], n) => {
    const r = engine.move(state, dx, dy);
    console.log(
      `  attempt ${n + 1} (${dx},${dy}): moved=${r.moved} player=(` +
        `${state.actorX[0]},${state.actorY[0]},e${state.actorElevation[0]})`
    );
  });
}

console.log("\n=== Scenario 5: same as 2 but bridge over an implicit void (no explicit hole layer) ===");
{
  const bridgeOverVoid = () => ({
    type: "block_asset",
    layers: [{ type: "block_asset", elevation: 2 }]
  });
  const terrain = [
    [floor(), floor(), bridgeOverVoid(), floor()],
    [floor(), tower3(), tower3(), floor()]
  ];
  const engine = createEngine({
    width: 4,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 1, y: 1, elevation: 3, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 0, elevation: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const r1 = engine.move(state, 1, 0);
  console.log("  move right: moved=" + r1.moved);
  show(engine, state, "after fill turn", [0, 1, 2]);
  console.log(
    "  terrain@(2,0) now floor? " +
      (state.terrain[engine.cellIndex(2, 0)] === terrainTypes.floor)
  );
  const r2 = engine.move(state, 0, -1);
  console.log("  step onto bridge top after fill: moved=" + r2.moved);
  show(engine, state, "final", [0, 1, 2]);
}
