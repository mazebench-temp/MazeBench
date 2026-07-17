const { loadBrowserScript } = require("../helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function dump(label, engine, state, indices) {
  const parts = indices.map(
    (i) =>
      `${engine.actorTypes[i]}[${i}] @(${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
  );
  console.log(label, "|", parts.join(" | "), "| isSolved=", engine.isSolved(state));
}

console.log("=== Scenario (a): push box out from under auto-stacked gem ===");
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: floorTerrain(4, 1),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false },
      { type: "gem", x: 1, y: 0, removed: false } // auto-stacks on box
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("initial:", engine, state, [0, 1, 2]);

  const r1 = engine.move(state, 1, 0); // push box right
  console.log("move right ->", r1.moved);
  dump("after push:", engine, state, [0, 1, 2]);
  console.log(
    "player now directly under gem:",
    state.actorX[0] === state.actorX[2] &&
      state.actorY[0] === state.actorY[2] &&
      state.actorElevation[0] === 0 &&
      state.actorElevation[2] === 1
  );
}

console.log("\n=== Scenario (b): gate lowers, box rides down, gem on box? ===");
{
  const wallStack1 = { type: "wall", layers: [{ type: "wall", elevation: 0 }] };
  const engine = createEngine({
    width: 3,
    height: 1,
    terrain: [
      [wallStack1, wallStack1, { type: "player_gate", layers: [{ type: "player_gate", elevation: 0 }] }]
    ],
    actors: [
      { type: "player", x: 1, y: 0, elevation: 1, removed: false }, // adjacent -> gate raised
      { type: "box", x: 2, y: 0, elevation: 1, removed: false }, // on raised gate
      { type: "gem", x: 2, y: 0, elevation: 2, removed: false } // on box
    ]
  });
  const state = engine.cloneState(engine.initialState);
  console.log(
    "gate raised initially:",
    engine.computeRaisedPlayerGateSet(state).has(engine.cellIndex(2, 0))
  );
  dump("initial:", engine, state, [0, 1, 2]);

  const r1 = engine.move(state, -1, 0); // walk away -> gate lowers
  console.log("move left ->", r1.moved);
  console.log(
    "gate raised after:",
    engine.computeRaisedPlayerGateSet(state).has(engine.cellIndex(2, 0))
  );
  dump("after walk away:", engine, state, [0, 1, 2]);
  console.log(
    "box rode down but gem floats:",
    state.actorElevation[1] === 0 && state.actorElevation[2] === 2
  );
}

console.log("\n=== Scenario (c): lift raises under gem; player shares cell above it ===");
{
  const engine = createEngine({
    width: 2,
    height: 1,
    terrain: [
      [
        { type: "floor" },
        { type: "player_lift", layers: [{ type: "player_lift", elevation: 0, raised: false }], raised: false }
      ]
    ],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "gem", x: 1, y: 0, elevation: 0, removed: false } // sitting on lowered lift
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("initial:", engine, state, [0, 1]);

  const r1 = engine.move(state, 1, 0); // step onto lift -> raises
  console.log("move right ->", r1.moved, "liftToggles:", JSON.stringify(r1.liftToggles));
  dump("after lift raise:", engine, state, [0, 1]);
  console.log(
    "player and gem share cell at different elevations:",
    state.actorX[0] === state.actorX[1] &&
      state.actorElevation[0] !== state.actorElevation[1] &&
      state.actorRemoved[1] === 0
  );
}

console.log("\n=== Scenario (a2): can the level still be solved? try box-return trick ===");
{
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain: floorTerrain(4, 1),
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false },
      { type: "gem", x: 1, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  engine.move(state, 1, 0); // push box to (2,0); player (1,0); gem floats (1,0,1)
  dump("t1:", engine, state, [0, 1, 2]);
  engine.move(state, 1, 0); // push box to (3,0); player (2,0)
  dump("t2:", engine, state, [0, 1, 2]);
  const climb = engine.move(state, 1, 0); // box at wall edge -> climb?
  console.log("attempt climb onto box:", climb.moved);
  dump("t3:", engine, state, [0, 1, 2]);
  const stepOff = engine.move(state, -1, 0); // step off box westward across gem cell?
  console.log("step off:", stepOff.moved);
  dump("t4:", engine, state, [0, 1, 2]);
}
