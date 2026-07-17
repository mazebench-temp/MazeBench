const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function show(label, engine, state, gemIndex, playerIndex) {
  console.log(
    label,
    "player=(" + state.actorX[playerIndex] + "," + state.actorY[playerIndex] + ") e" + state.actorElevation[playerIndex],
    "gem=(" + state.actorX[gemIndex] + "," + state.actorY[gemIndex] + ") e" + state.actorElevation[gemIndex],
    "gemRemoved=" + state.actorRemoved[gemIndex],
    "isSolved=" + engine.isSolved(state)
  );
}

// ---- Test 1: main player carried by clone group onto a gem at e1 ----
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: floorTerrain(4, 1),
    actors: [
      { type: "clone", groupId: "c0", x: 1, y: 0, elevation: 0, removed: false },
      { type: "player", x: 1, y: 0, elevation: 1, removed: false },
      { type: "gem", x: 2, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  console.log("TEST1 carried-by-clone: moved=" + result.moved);
  result.moves.forEach((m) =>
    console.log(
      "  move:",
      m.actorType,
      "#" + m.actorIndex,
      "(" + m.fromX + "," + m.fromY + ")e" + m.fromElevation,
      "->",
      "(" + m.toX + "," + m.toY + ")e" + m.toElevation,
      m.toRemoved ? "REMOVED" : ""
    )
  );
  show("TEST1 result:", engine, state, 2, 1);
  console.log(
    "TEST1 player on gem cell+elev:",
    state.actorX[1] === state.actorX[2] &&
      state.actorY[1] === state.actorY[2] &&
      state.actorElevation[1] === state.actorElevation[2]
  );
  console.log("");
}

// ---- Test 2: control — same player walks onto a gem (floor level) ----
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: floorTerrain(4, 1),
    actors: [
      { type: "player", x: 1, y: 0, removed: false },
      { type: "gem", x: 2, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  console.log("TEST2 walked control: moved=" + result.moved);
  show("TEST2 result:", engine, state, 1, 0);
  console.log("");
}

// ---- Test 3: carried player onto a player_lift at rider elevation (lift toggle check) ----
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: [
      [
        { type: "floor" },
        { type: "floor" },
        {
          type: "player_lift",
          layers: [
            { type: "wall", elevation: 0 },
            { type: "player_lift", elevation: 1, raised: false }
          ],
          raised: false
        },
        { type: "floor" }
      ]
    ],
    actors: [
      { type: "clone", groupId: "c0", x: 1, y: 0, elevation: 0, removed: false },
      { type: "player", x: 1, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const before = Array.from(state.liftRaised);
  const result = engine.move(state, 1, 0);
  console.log("TEST3 carried onto lift: moved=" + result.moved);
  console.log(
    "TEST3 player=(" + state.actorX[1] + "," + state.actorY[1] + ") e" + state.actorElevation[1],
    "liftRaised before=" + JSON.stringify(before),
    "after=" + JSON.stringify(Array.from(state.liftRaised))
  );
  console.log("");
}

// ---- Test 4: reachability — gem authored on a box, box pushed away; does the gem float at e1? ----
{
  const engine = createEngine({
    width: 5,
    height: 1,
    terrain: floorTerrain(5, 1),
    actors: [
      { type: "box", x: 1, y: 0, removed: false },
      { type: "gem", x: 1, y: 0, removed: false }, // auto-stacked on box -> e1
      { type: "player", x: 0, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  console.log(
    "TEST4 initial gem elevation (on box):",
    state.actorElevation[1]
  );
  engine.move(state, 1, 0); // push box right
  console.log(
    "TEST4 after push: box=(" + state.actorX[0] + "," + state.actorY[0] + ")e" + state.actorElevation[0],
    "gem=(" + state.actorX[1] + "," + state.actorY[1] + ")e" + state.actorElevation[1],
    "gemRemoved=" + state.actorRemoved[1]
  );
}
