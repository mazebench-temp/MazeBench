// Repro: clone-carried rider dragged into solid terrain (block_asset at elevation 1)
// Finding: cloneRidersForMove validates only the FIRST step of the ride; when the
// clone slides on ice for multiple cells, the rider is placed at the end of the
// support path with no terrain check (maze-engine.js:4536-4578).

const { loadBrowserScript } = require("../helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function fmtActors(engine, state, labels) {
  return labels
    .map(
      (label, i) =>
        `${label}: (${state.actorX[i]},${state.actorY[i]}) e${state.actorElevation[i]}${
          state.actorRemoved[i] ? " REMOVED" : ""
        }`
    )
    .join(" | ");
}

// --- Main scenario -----------------------------------------------------------
// 1x5 row: (0,0) floor, (1,0) ice, (2,0) ice, (3,0) floor + block_asset@e1, (4,0) floor
// Clone c0 at (1,0) e0, main player riding on it at (1,0) e1. Press Right.
const terrain = [
  [
    { type: "floor" },
    { type: "ice", layers: [{ type: "ice", elevation: 0 }] },
    { type: "ice", layers: [{ type: "ice", elevation: 0 }] },
    {
      type: "floor",
      layers: [
        { type: "floor", elevation: 0 },
        { type: "block_asset", elevation: 1 }
      ]
    },
    { type: "floor" }
  ]
];

const engine = createEngine({
  width: 5,
  height: 1,
  terrain,
  actors: [
    { type: "clone", groupId: "c0", x: 1, y: 0, elevation: 0, removed: false },
    { type: "player", x: 1, y: 0, elevation: 1, removed: false }
  ]
});

const state = engine.cloneState(engine.initialState);
console.log("Before:", fmtActors(engine, state, ["clone", "player"]));

const result = engine.move(state, 1, 0);
console.log("moved:", result.moved);
console.log("After :", fmtActors(engine, state, ["clone", "player"]));
result.moves.forEach((m) =>
  console.log(
    `  move: ${m.actorType}#${m.actorIndex} (${m.fromX},${m.fromY})e${m.fromElevation} -> (${m.toX},${m.toY})e${m.toElevation}` +
      (m.path ? ` path=${JSON.stringify(m.path)}` : "")
  )
);

const playerX = state.actorX[1];
const playerY = state.actorY[1];
const playerE = state.actorElevation[1];
const embedded = playerX === 3 && playerY === 0 && playerE === 1;
console.log(
  embedded
    ? "BUG REPRODUCED: player is at (3,0) e1, inside block_asset@e1"
    : `Player ended at (${playerX},${playerY}) e${playerE} — not embedded`
);

// Follow-up: what happens on subsequent moves while embedded?
if (embedded) {
  const r2 = engine.move(state, 1, 0);
  console.log(
    `Next move right: moved=${r2.moved} ->`,
    fmtActors(engine, state, ["clone", "player"])
  );
}

// --- Control test ------------------------------------------------------------
// Player standing on an ice_block at e1 walks right into a cell whose e1 is
// occupied by block_asset@e1 (with block_asset@e0 as would-be support).
// Expect: blocked (moved=false / player stays).
const controlEngine = createEngine({
  width: 2,
  height: 1,
  terrain: [
    [
      { type: "ice_block", layers: [{ type: "ice_block", elevation: 0 }] },
      {
        type: "block_asset",
        layers: [
          { type: "block_asset", elevation: 0 },
          { type: "block_asset", elevation: 1 }
        ]
      }
    ]
  ],
  actors: [{ type: "player", x: 0, y: 0, elevation: 1, removed: false }]
});

const controlState = controlEngine.cloneState(controlEngine.initialState);
const controlResult = controlEngine.move(controlState, 1, 0);
console.log(
  `\nControl (player@e1 walks into block_asset@e1): moved=${controlResult.moved}, ` +
    `player at (${controlState.actorX[0]},${controlState.actorY[0]}) e${controlState.actorElevation[0]}`
);

// --- First-step control -------------------------------------------------------
// Same setup but the block_asset@e1 is at (2,0), the FIRST cell of the ride.
// cloneRidersForMove DOES validate this step, so the rider should not be carried
// into the block. This demonstrates the first-step / later-step asymmetry.
const firstStepEngine = createEngine({
  width: 5,
  height: 1,
  terrain: [
    [
      { type: "floor" },
      { type: "ice", layers: [{ type: "ice", elevation: 0 }] },
      {
        type: "ice",
        layers: [
          { type: "ice", elevation: 0 },
          { type: "block_asset", elevation: 1 }
        ]
      },
      { type: "floor" },
      { type: "floor" }
    ]
  ],
  actors: [
    { type: "clone", groupId: "c0", x: 1, y: 0, elevation: 0, removed: false },
    { type: "player", x: 1, y: 0, elevation: 1, removed: false }
  ]
});
const firstStepState = firstStepEngine.cloneState(firstStepEngine.initialState);
const firstStepResult = firstStepEngine.move(firstStepState, 1, 0);
console.log(
  `\nFirst-step control (block_asset@e1 on the FIRST ride cell): moved=${firstStepResult.moved}`
);
console.log("After :", fmtActors(firstStepEngine, firstStepState, ["clone", "player"]));
