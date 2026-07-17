// Repro: punched actors keep their old elevation (never fall) when knocked
// off a ledge onto lower terrain, but are removed over void.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function wall1() {
  return { type: "wall", layers: [{ type: "wall", elevation: 0 }] };
}

function createState(playData) {
  const engine = createEngine(playData);
  return { engine, state: engine.cloneState(engine.initialState) };
}

function dump(state, i, label) {
  console.log(
    `${label}: pos=(${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
  );
}

console.log("=== TEST A: player punched off 1-high wall ledge onto e0 floor ===");
{
  // 4x3 board, column x=2 is a 1-high wall (stand on top at e1).
  const terrain = floorTerrain(4, 3);
  terrain[0][2] = wall1();
  terrain[1][2] = wall1();
  terrain[2][2] = wall1();

  const { engine, state } = createState({
    width: 4,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 2, y: 1, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 2, elevation: 1, removed: false }
    ]
  });

  const result = engine.move(state, 0, 1); // player steps down onto puncher
  console.log("move down onto puncher: moved=" + result.moved);
  dump(state, 0, "player after punch");
  // Terrain under (3,2) is plain floor with surface height 0.
  // Expected (per finding): player at (3,2) elev=1, hovering, not removed.

  const dirs = [["right", 1, 0], ["left", -1, 0], ["up", 0, -1], ["down", 0, 1]];
  for (const [name, dx, dy] of dirs) {
    const clone = engine.cloneState(state);
    const r = engine.move(clone, dx, dy);
    console.log(
      `  followup move ${name}: moved=${r.moved} -> pos=(${clone.actorX[0]},${clone.actorY[0]}) elev=${clone.actorElevation[0]} removed=${clone.actorRemoved[0]}`
    );
  }
}

console.log("\n=== TEST B: box punched off ledge, hovers; player walks underneath ===");
{
  // 5x3 board, column x=2 is a 1-high wall. Player pushes box onto puncher.
  const terrain = floorTerrain(5, 3);
  terrain[0][2] = wall1();
  terrain[1][2] = wall1();
  terrain[2][2] = wall1();

  const { engine, state } = createState({
    width: 5,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 2, y: 0, elevation: 1, removed: false },
      { type: "box", x: 2, y: 1, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 2, elevation: 1, removed: false }
    ]
  });

  const r1 = engine.move(state, 0, 1); // push box down onto puncher
  console.log("push box onto puncher: moved=" + r1.moved);
  dump(state, 0, "player");
  dump(state, 1, "box");
  // Expected (per finding): box hovers at elev=1 over e0 floor.

  // Now walk the player underneath the hovering box.
  const steps = [[0, 1, "down (onto puncher cell? no - player at (2,1))"], [1, 0, "right"], [0, 1, "down"], [1, 0, "right"], [1, 0, "right"]];
  for (const [dx, dy, name] of steps) {
    const r = engine.move(state, dx, dy);
    console.log(
      `  player move ${name}: moved=${r.moved} -> pos=(${state.actorX[0]},${state.actorY[0]}) elev=${state.actorElevation[0]}`
    );
  }
  dump(state, 1, "box at end");
  console.log(
    "  player and box overlap in x/y:",
    state.actorX[0] === state.actorX[1] && state.actorY[0] === state.actorY[1],
    "(player elev", state.actorElevation[0] + ", box elev", state.actorElevation[1] + ")"
  );
}

console.log("\n=== TEST C: identical geometry but (3,2) is empty void ===");
{
  const terrain = floorTerrain(4, 3);
  terrain[0][2] = wall1();
  terrain[1][2] = wall1();
  terrain[2][2] = wall1();
  terrain[2][3] = { type: "empty" };

  const { engine, state } = createState({
    width: 4,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 2, y: 1, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 2, elevation: 1, removed: false }
    ]
  });

  const result = engine.move(state, 0, 1);
  console.log("move down onto puncher: moved=" + result.moved);
  dump(state, 0, "player after punch over void");
  // Expected (per finding): removed=1 (deleted), unlike TEST A where it hovers.
}

console.log("\n=== TEST D: contrast - plain PUSH off the same ledge is refused ===");
{
  // walls at (1,1) and (2,1); player and box on top; floor at (3,1).
  const terrain = floorTerrain(5, 3);
  terrain[1][1] = wall1();
  terrain[1][2] = wall1();

  const { engine, state } = createState({
    width: 5,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 1, y: 1, elevation: 1, removed: false },
      { type: "box", x: 2, y: 1, elevation: 1, removed: false }
    ]
  });

  const result = engine.move(state, 1, 0); // push box right, off the ledge
  console.log("push box off ledge: moved=" + result.moved);
  dump(state, 0, "player");
  dump(state, 1, "box");
  // Engine convention: push onto unsupported cell refused (attemptPushActor).
}
