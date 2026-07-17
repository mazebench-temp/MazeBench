// Repro: actor authored with explicit elevation over plain floor.
// Mirrors editor output: buildPlayData always sets `elevation` on actors
// (author-play-data.js:808); ".+++p" cell => floor terrain + actor elevation 3.
process.chdir("/Users/jpappas/code/GitHub/PixelGameTest");
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      type: "floor",
      layers: [{ type: "floor", elevation: 0 }]
    }))
  );
}

// --- Scenario A: player authored at elevation 3 over plain floor ---
{
  const engine = createEngine({
    width: 3,
    height: 3,
    terrain: floorTerrain(3, 3),
    actors: [
      { type: "player", x: 1, y: 1, elevation: 3, removed: false },
      { type: "gem", x: 2, y: 2, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  console.log("A: initial player elevation:", state.actorElevation[0]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const s = engine.cloneState(engine.initialState);
    const r = engine.move(s, dx, dy);
    console.log(
      `A: move(${dx},${dy}) moved=${r.moved} pos=(${s.actorX[0]},${s.actorY[0]},e${s.actorElevation[0]})`
    );
  }
  // Try repeated moves in case something settles after multiple turns
  const s2 = engine.cloneState(engine.initialState);
  let anyMoved = false;
  for (let i = 0; i < 8; i++) {
    for (const [dx, dy] of dirs) {
      const r = engine.move(s2, dx, dy);
      if (r.moved) anyMoved = true;
    }
  }
  console.log(
    "A: after 32 attempted moves anyMoved=" + anyMoved +
    " pos=(" + s2.actorX[0] + "," + s2.actorY[0] + ",e" + s2.actorElevation[0] + ")"
  );
}

// --- Scenario B: control — same player WITHOUT explicit elevation ---
{
  const engine = createEngine({
    width: 3,
    height: 3,
    terrain: floorTerrain(3, 3),
    actors: [
      { type: "player", x: 1, y: 1, removed: false },
      { type: "gem", x: 2, y: 2, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  console.log("B: control (no explicit elevation) initial elevation:", state.actorElevation[0]);
  const r = engine.move(state, 1, 0);
  console.log(`B: move(1,0) moved=${r.moved} pos=(${state.actorX[0]},${state.actorY[0]},e${state.actorElevation[0]})`);
}

// --- Scenario C: control — player with explicit elevation 0 (normal editor output) ---
{
  const engine = createEngine({
    width: 3,
    height: 3,
    terrain: floorTerrain(3, 3),
    actors: [
      { type: "player", x: 1, y: 1, elevation: 0, removed: false },
      { type: "gem", x: 2, y: 2, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const r = engine.move(state, 1, 0);
  console.log(`C: explicit e0 move(1,0) moved=${r.moved} pos=(${state.actorX[0]},${state.actorY[0]},e${state.actorElevation[0]})`);
}

// --- Scenario D: box authored at elevation 3, player at ground pushes it ---
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: floorTerrain(4, 1),
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "box", x: 1, y: 0, elevation: 3, removed: false },
      { type: "gem", x: 3, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  console.log("D: initial box elevation:", state.actorElevation[1]);
  const r1 = engine.move(state, 1, 0);
  console.log(
    `D: move1 moved=${r1.moved} player=(${state.actorX[0]},${state.actorY[0]},e${state.actorElevation[0]}) box=(${state.actorX[1]},${state.actorY[1]},e${state.actorElevation[1]})`
  );
  const r2 = engine.move(state, 1, 0);
  console.log(
    `D: move2 moved=${r2.moved} player=(${state.actorX[0]},${state.actorY[0]},e${state.actorElevation[0]}) box=(${state.actorX[1]},${state.actorY[1]},e${state.actorElevation[1]})`
  );
}
