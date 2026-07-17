const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function dump(label, engine, state, actors) {
  const parts = actors.map(
    (i) =>
      `#${i} (${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
  );
  console.log(label, parts.join(" | "));
}

// Scenario A (finding's exact board):
// (0,0) floor + orange_button ACTOR + player
// (1,0) ice + box
// (2,0) ice
// (3,0) floor cell with orange_wall elevation 0
// (4,0) floor
{
  const terrain = [
    [
      { type: "floor" },
      { type: "ice" },
      { type: "ice" },
      { type: "orange_wall" },
      { type: "floor" }
    ]
  ];
  const engine = createEngine({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false },
      { type: "orange_button", x: 0, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);

  console.log("=== Scenario A: button actor under player, box on ice ===");
  dump("before:", engine, state, [0, 1]);
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after :", engine, state, [0, 1]);
  const boxMove = result.moves.find((m) => m.actorIndex === 1);
  console.log("boxMove:", JSON.stringify(boxMove));
}

// Scenario B: orange_button TERRAIN under player (like existing test at
// maze-engine.test.js:2122), otherwise same layout.
{
  const terrain = [
    [
      { type: "orange_button" },
      { type: "ice" },
      { type: "ice" },
      { type: "orange_wall" },
      { type: "floor" }
    ]
  ];
  const engine = createEngine({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);

  console.log("=== Scenario B: button terrain under player, box on ice ===");
  dump("before:", engine, state, [0, 1]);
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after :", engine, state, [0, 1]);
  const boxMove = result.moves.find((m) => m.actorIndex === 1);
  console.log("boxMove:", JSON.stringify(boxMove));
}

// Scenario C (control): the only button is pressed by a STATIONARY box, and
// the player starts on plain floor. The button stays pressed after the move,
// so the wall stays down: the pushed box should stop on the lowered wall cell
// at elevation 0 and stay at elevation 0.
{
  const terrain = [
    [
      { type: "floor" },
      { type: "ice" },
      { type: "ice" },
      { type: "orange_wall" },
      { type: "floor" }
    ],
    [
      { type: "orange_button" },
      { type: "floor" },
      { type: "floor" },
      { type: "floor" },
      { type: "floor" }
    ]
  ];
  const engine = createEngine({
    width: 5,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, removed: false },
      { type: "box", x: 0, y: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);

  console.log("=== Scenario C (control): button held by stationary box ===");
  dump("before:", engine, state, [0, 1, 2]);
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after :", engine, state, [0, 1, 2]);
}
