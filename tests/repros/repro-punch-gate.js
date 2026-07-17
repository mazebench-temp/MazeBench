const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorRow(width) {
  return [Array.from({ length: width }, () => ({ type: "floor" }))];
}

function gateCell() {
  return { type: "player_gate", layers: [{ type: "player_gate", elevation: 0 }] };
}

// ---- Case A: 5x1 — player(0,0), puncher-right(1,0), floor(2,0), gate(3,0), wall(4,0)
{
  const terrain = floorRow(5);
  terrain[0][3] = gateCell();
  terrain[0][4] = { type: "wall" };

  const engine = createEngine({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "puncher", direction: "right", x: 1, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);

  const result = engine.move(state, 1, 0); // walk right onto puncher
  console.log("CASE A (punch starts 2 cells from gate):");
  console.log("  moved:", result.moved);
  console.log("  player final:", [state.actorX[0], state.actorY[0], state.actorElevation[0]]);
  console.log("  gate raised set has (3,0):", engine.computeRaisedPlayerGateSet(state).has(engine.cellIndex(3, 0)));
  console.log("  player standing ON gate:", state.actorX[0] === 3 && state.actorY[0] === 0);
}

// ---- Case B: 4x1 — player(0,0), puncher-right(1,0), gate(2,0), wall(3,0)
{
  const terrain = floorRow(4);
  terrain[0][2] = gateCell();
  terrain[0][3] = { type: "wall" };

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

  const result = engine.move(state, 1, 0); // walk right onto puncher
  console.log("CASE B (punch starts adjacent to gate):");
  console.log("  moved:", result.moved);
  console.log("  player final:", [state.actorX[0], state.actorY[0], state.actorElevation[0]]);
}

// ---- Control: can the player ever WALK onto a gate? gate at (1,0), player at (0,0)
{
  const terrain = floorRow(2);
  terrain[0][1] = gateCell();

  const engine = createEngine({
    width: 2,
    height: 1,
    terrain,
    actors: [{ type: "player", x: 0, y: 0, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);

  const result = engine.move(state, 1, 0);
  console.log("CONTROL (walk toward adjacent gate):");
  console.log("  moved:", result.moved);
  console.log("  player final:", [state.actorX[0], state.actorY[0], state.actorElevation[0]]);
}
