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

function report(label, engine, state, result) {
  console.log(label, {
    moved: result ? result.moved : null,
    liftToggles: result ? result.liftToggles : null,
    player: [state.actorX[0], state.actorY[0]],
    elevation: state.actorElevation[0],
    liftRaisedCenter: state.liftRaised[4] // 3x3 board, cell (1,1) index 4
  });
}

// --- Scenario A: stacked double lift "l+l" (elevations 0 and 1) ---
{
  const terrain = floorTerrain(3, 3);
  terrain[1][1] = {
    type: "player_lift",
    layers: [
      { type: "player_lift", elevation: 0, raised: false },
      { type: "player_lift", elevation: 1, raised: false }
    ],
    raised: false
  };

  const engine = createEngine({
    width: 3,
    height: 3,
    terrain,
    actors: [{ type: "player", x: 0, y: 1, elevation: 0, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);

  console.log("=== A: double lift l+l ===");
  const step = engine.move(state, 1, 0); // step onto (1,1)
  report("step onto lift:", engine, state, step);

  const dirs = [
    ["right", 1, 0],
    ["left", -1, 0],
    ["up", 0, -1],
    ["down", 0, 1]
  ];
  for (const [name, dx, dy] of dirs) {
    const trial = engine.cloneState(state);
    const r = engine.move(trial, dx, dy);
    report("  move " + name + ":", engine, trial, r);
  }

  // Exhaustive: is ANY state reachable off the cell? BFS a few plies deep.
  let frontier = [state];
  let escaped = false;
  const seen = new Set([engine.stateKey(state)]);
  for (let depth = 0; depth < 6 && !escaped; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const [, dx, dy] of dirs) {
        const t = engine.cloneState(s);
        const r = engine.move(t, dx, dy);
        if (!r.moved) continue;
        const key = engine.stateKey(t);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(t);
        if (t.actorX[0] !== 1 || t.actorY[0] !== 1) {
          escaped = true;
          console.log("  ESCAPED at depth", depth + 1, "to", [t.actorX[0], t.actorY[0]], "e", t.actorElevation[0]);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  console.log("escaped from double-lift cell:", escaped, "| states explored:", seen.size);
}

// --- Scenario B: control, single lift (intended behavior) ---
{
  const terrain = floorTerrain(3, 3);
  terrain[1][1] = {
    type: "player_lift",
    layers: [{ type: "player_lift", elevation: 0, raised: false }],
    raised: false
  };

  const engine = createEngine({
    width: 3,
    height: 3,
    terrain,
    actors: [{ type: "player", x: 0, y: 1, elevation: 0, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);

  console.log("=== B: single lift l (control) ===");
  const step = engine.move(state, 1, 0);
  report("step onto lift:", engine, state, step);
  const off = engine.move(state, 1, 0); // try to continue right off the raised lift
  report("step off right:", engine, state, off);
}
