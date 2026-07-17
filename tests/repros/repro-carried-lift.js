const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

// Carried rider lands on a player_lift at e1 while the clone passes underneath at e0.
const engine = createEngine({
  width: 4,
  height: 1,
  terrain: [
    [
      { type: "floor" },
      { type: "floor" },
      {
        type: "player_lift",
        layers: [{ type: "player_lift", elevation: 1, raised: false }],
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
const result = engine.move(state, 1, 0);
console.log("moved=" + result.moved);
result.moves.forEach((m) =>
  console.log(
    "  move:",
    m.actorType,
    "#" + m.actorIndex,
    "(" + m.fromX + "," + m.fromY + ")e" + m.fromElevation,
    "->",
    "(" + m.toX + "," + m.toY + ")e" + m.toElevation
  )
);
console.log(
  "clone=(" + state.actorX[0] + "," + state.actorY[0] + ")e" + state.actorElevation[0],
  "player=(" + state.actorX[1] + "," + state.actorY[1] + ")e" + state.actorElevation[1],
  "liftRaised=" + JSON.stringify(Array.from(state.liftRaised))
);
