// Repro: actors authored on empty/void ("abyss") cells vs pushed onto them.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine, terrainTypes } = window.MazeEngine;

const floor = () => ({ type: "floor" });
const empty = () => ({ type: "empty" });

function dump(label, engine, state, actorLabels) {
  const out = actorLabels.map(
    (name, i) =>
      `${name}: pos=(${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
  );
  console.log(label);
  out.forEach((line) => console.log("  " + line));
}

console.log("=== A1: floating_floor AUTHORED on empty void cell (1,0) ===");
{
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain: [[floor(), empty(), floor()]],
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, removed: false },
      { type: "gem", x: 2, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("initial state:", engine, state, ["player", "ffloor", "gem"]);
  console.log(
    "  terrain(1,0) byte =",
    state.terrain[engine.cellIndex ? engine.cellIndex(1, 0) : 1],
    "(empty=0 floor=1)"
  );
}

console.log("\n=== A2 control: floating_floor PUSHED from floor (1,0) into empty void (2,0) ===");
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: [[floor(), floor(), empty(), floor()]],
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const res = engine.move(state, 1, 0); // push right
  console.log("  move.moved =", res.moved);
  dump("after push:", engine, state, ["player", "ffloor"]);
  console.log(
    "  terrain(2,0) byte =",
    state.terrain[engine.cellIndex ? engine.cellIndex(2, 0) : 2],
    "(empty=0 floor=1) -> filled?",
    state.terrain[2] === terrainTypes.floor
  );
}

console.log("\n=== B1: box AUTHORED on empty void cell (1,0); then push it off to safety ===");
{
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain: [[floor(), empty(), floor()]],
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("initial state:", engine, state, ["player", "box"]);
  const res = engine.move(state, 1, 0); // push box right onto floor at (2,0)
  console.log("  push-off move.moved =", res.moved);
  dump("after push-off attempt:", engine, state, ["player", "box"]);
}

console.log("\n=== B2 control: box PUSHED from floor (1,0) into empty void (2,0) ===");
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: [[floor(), floor(), empty(), floor()]],
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const res = engine.move(state, 1, 0);
  console.log("  move.moved =", res.moved);
  dump("after push:", engine, state, ["player", "box"]);
}

console.log("\n=== C: same as A1/B1 but with explicit hole terrain instead of empty ===");
{
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain: [[floor(), { type: "hole" }, floor()]],
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false },
      { type: "floating_floor", x: 2, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("initial state (box authored on hole terrain):", engine, state, [
    "player",
    "box",
    "ffloor(on floor at 2,0)"
  ]);
}
