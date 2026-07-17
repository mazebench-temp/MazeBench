// Repro for finding: "puncher one cell in front of a pushable is treated as attached"
// Scenario A (finding): player (0,0), floating_floor (1,0), puncher facing right (2,0)
// Scenario B (tested layout, maze-engine.test.js:3197): same but box + second box at (3,0)
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function dump(label, state, engine, names) {
  const out = names.map((name, i) =>
    `${name}@(${state.actorX[i]},${state.actorY[i]})${state.actorRemoved[i] ? " REMOVED" : ""}`
  );
  console.log(label, out.join("  "));
}

// --- Scenario A: finding's exact layout (floating_floor) ---
{
  const engine = createEngine({
    width: 6,
    height: 1,
    terrain: floorTerrain(6, 1),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 0, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const names = ["player", "ffloor", "puncherR"];
  dump("A start:", state, engine, names);
  let r = engine.move(state, 1, 0);
  dump("A push1 (moved=" + r.moved + "):", state, engine, names);
  const punchFired1 = r.moves.some((m) => m.visualOnly && m.punchEffect);
  console.log("A push1 punchEffect fired:", punchFired1);
  r = engine.move(state, 1, 0);
  dump("A push2 (moved=" + r.moved + "):", state, engine, names);
}

// --- Scenario B: identical geometry but with a box target in front (test 3197 layout) ---
{
  const engine = createEngine({
    width: 6,
    height: 1,
    terrain: (() => { const t = floorTerrain(6, 1); t[0][5] = { type: "wall" }; return t; })(),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, elevation: 0, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 0, elevation: 0, removed: false },
      { type: "box", x: 3, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const names = ["player", "box1", "puncherR", "box2"];
  dump("B start:", state, engine, names);
  const r = engine.move(state, 1, 0);
  dump("B push1 (moved=" + r.moved + "):", state, engine, names);
  const punchFired = r.moves.some((m) => m.visualOnly && m.punchEffect);
  console.log("B push1 punchEffect fired:", punchFired,
    "(carried puncher DOES punch what it lands on, just not its own carrier)");
}

// --- Scenario C: left-facing puncher at same spot (finding's control case) ---
{
  const engine = createEngine({
    width: 6,
    height: 1,
    terrain: floorTerrain(6, 1),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 0, removed: false },
      { type: "puncher", direction: "left", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const names = ["player", "ffloor", "puncherL"];
  dump("C start:", state, engine, names);
  const r = engine.move(state, 1, 0);
  dump("C push1 (moved=" + r.moved + "):", state, engine, names);
}
