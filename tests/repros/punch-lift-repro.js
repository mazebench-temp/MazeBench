const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function playerLiftLayer(elevation = 0, raised = false) {
  return {
    type: "player_lift",
    layers: [{ type: "player_lift", elevation, raised }],
    raised
  };
}

function wallStack(count, startElevation = 0) {
  return {
    type: "wall",
    layers: Array.from({ length: count }, (_, index) => ({
      type: "wall",
      elevation: startElevation + index
    }))
  };
}

function cellIndex(width, x, y) {
  return y * width + x;
}

// --- Case A: player punched onto a lowered player_lift ---
{
  const terrain = [
    [{ type: "floor" }, { type: "floor" }, playerLiftLayer(0, false), wallStack(2)]
  ];
  const engine = createEngine({
    width: 4,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);

  console.log("=== Case A: punched onto lowered lift at (2,0) ===");
  console.log("moved:", result.moved);
  console.log("player pos:", state.actorX[0], state.actorY[0], "elevation:", state.actorElevation[0]);
  console.log("liftToggles:", JSON.stringify(result.liftToggles));
  console.log("liftRaised at (2,0):", state.liftRaised[cellIndex(4, 2, 0)]);
  const playerMove = result.moves.find((m) => m.actorIndex === 0 && !m.visualOnly);
  console.log("playerMove punchSlide:", playerMove && playerMove.punchSlide, "to:", playerMove && [playerMove.toX, playerMove.toY, playerMove.toElevation]);
}

// --- Case B (control): player walks directly onto the same lowered lift ---
{
  const terrain = [[{ type: "floor" }, playerLiftLayer(0, false)]];
  const engine = createEngine({
    width: 2,
    height: 1,
    terrain,
    actors: [{ type: "player", x: 0, y: 0, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);

  console.log("\n=== Case B: walked onto lowered lift at (1,0) ===");
  console.log("moved:", result.moved);
  console.log("player pos:", state.actorX[0], state.actorY[0], "elevation:", state.actorElevation[0]);
  console.log("liftToggles:", JSON.stringify(result.liftToggles));
  console.log("liftRaised at (1,0):", state.liftRaised[cellIndex(2, 1, 0)]);
}
