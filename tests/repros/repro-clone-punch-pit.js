// Repro: punched clone floats over a pit while an identically punched player dies.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function blockAsset(elevation = 0) {
  return { type: "block_asset", layers: [{ type: "block_asset", elevation }] };
}
function wallStack(count, startElevation = 0) {
  return {
    type: "wall",
    layers: Array.from({ length: count }, (_, i) => ({
      type: "wall",
      elevation: startElevation + i
    }))
  };
}

function buildTerrain() {
  // 5 wide x 2 tall
  // Row 0: block_asset@0 at x=0..2 (walk on top => e1), hole at x=3, 2-high wall at x=4
  // Row 1: floor
  return [
    [blockAsset(0), blockAsset(0), blockAsset(0), { type: "hole" }, wallStack(2)],
    [{ type: "floor" }, { type: "floor" }, { type: "floor" }, { type: "floor" }, { type: "floor" }]
  ];
}

function dumpActors(label, engine, state, actors) {
  console.log(label);
  actors.forEach((a, i) => {
    console.log(
      `  [${i}] ${a.type}${a.groupId ? "(" + a.groupId + ")" : ""} x=${state.actorX[i]} y=${state.actorY[i]} elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  });
}

// ---- Scenario A: clone gets punched over the pit ----
{
  const actors = [
    { type: "player", x: 0, y: 1, elevation: 0, removed: false },
    { type: "clone", groupId: "c0", x: 0, y: 0, elevation: 1, removed: false },
    { type: "puncher", direction: "right", x: 1, y: 0, elevation: 1, removed: false }
  ];
  const engine = createEngine({
    width: 5,
    height: 2,
    terrain: buildTerrain(),
    actors
  });
  const state = engine.cloneState(engine.initialState);

  dumpActors("A: initial", engine, state, actors);
  const r1 = engine.move(state, 1, 0); // Right
  console.log("A: move Right -> moved =", r1.moved);
  const cloneMove = r1.moves.find((m) => m.actorType === "clone" && !m.visualOnly);
  console.log("A: clone move record:", JSON.stringify(cloneMove));
  dumpActors("A: after Right", engine, state, actors);

  // a few more moves to show the clone persists floating
  engine.move(state, 0, 1); // Down (player), clone mirrors down? blocked by wall/hole edges
  dumpActors("A: after Down", engine, state, actors);
  engine.move(state, 0, -1); // Up
  dumpActors("A: after Up", engine, state, actors);

  console.log(
    "A RESULT: clone removed =",
    state.actorRemoved[1],
    "at",
    state.actorX[1],
    state.actorY[1],
    "elev",
    state.actorElevation[1]
  );
}

// ---- Scenario B (control): a second main player in the clone's place ----
{
  const actors = [
    { type: "player", x: 0, y: 1, elevation: 0, removed: false },
    { type: "player", x: 0, y: 0, elevation: 1, removed: false },
    { type: "puncher", direction: "right", x: 1, y: 0, elevation: 1, removed: false }
  ];
  const engine = createEngine({
    width: 5,
    height: 2,
    terrain: buildTerrain(),
    actors
  });
  const state = engine.cloneState(engine.initialState);

  dumpActors("B: initial", engine, state, actors);
  const r1 = engine.move(state, 1, 0); // Right
  console.log("B: move Right -> moved =", r1.moved);
  const punchedMove = r1.moves.find((m) => m.actorIndex === 1 && !m.visualOnly);
  console.log("B: punched player move record:", JSON.stringify(punchedMove));
  dumpActors("B: after Right", engine, state, actors);

  console.log(
    "B RESULT: punched player removed =",
    state.actorRemoved[1],
    "at",
    state.actorX[1],
    state.actorY[1],
    "elev",
    state.actorElevation[1]
  );
}
