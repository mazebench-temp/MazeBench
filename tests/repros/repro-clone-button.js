// Repro: orange button stacked on a clone (editor stack "c0"+"o") is stranded
// in mid-air when the clone mirrors a player move, and it locks orange walls raised.
const { loadBrowserScript } = require(
  "/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader"
);

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function orangeWallStack(count, startElevation = 0) {
  return {
    type: "orange_wall",
    layers: Array.from({ length: count }, (_, index) => ({
      type: "orange_wall",
      elevation: startElevation + index
    }))
  };
}

function dump(label, engine, state, actorNames) {
  const rows = actorNames.map((name, i) => {
    return `${name}: (${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`;
  });
  console.log(label);
  rows.forEach((r) => console.log("  " + r));
  console.log("  areOrangeButtonsPressed:", engine.areOrangeButtonsPressed(state));
}

// ---------- Scenario A: button attached to a CLONE ----------
console.log("=== Scenario A: orange button stacked on clone (c0 + o) ===");
{
  const terrain = floorTerrain(6, 1);
  terrain[0][5] = orangeWallStack(1); // orange wall 'O' elsewhere
  const engine = createEngine({
    width: 6,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "clone", groupId: "c0", x: 2, y: 0, elevation: 0, removed: false },
      { type: "orange_button", x: 2, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const names = ["player", "clone", "button"];

  dump("before move:", engine, state, names);

  const result = engine.move(state, 1, 0); // move right
  console.log("move right -> moved:", result.moved);

  dump("after move:", engine, state, names);

  const buttonMoved =
    state.actorX[2] !== 2 || state.actorElevation[2] !== 1;
  console.log(
    buttonMoved
      ? "RESULT: button rode the clone (finding refuted)"
      : "RESULT: button stranded at (2,0) elev=1 in mid-air (finding confirmed)"
  );

  // Show the orange wall stays raised: run several more moves and confirm the
  // button can never be pressed, so areOrangeButtonsPressed stays false.
  engine.move(state, 1, 0);
  engine.move(state, 1, 0);
  dump("after two more right moves:", engine, state, names);
}

// ---------- Scenario B (contrast): button attached to a BOX ----------
console.log("\n=== Scenario B: orange button stacked on box (M1 + o) ===");
{
  const terrain = floorTerrain(6, 1);
  const engine = createEngine({
    width: 6,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "box", x: 1, y: 0, elevation: 0, removed: false },
      { type: "orange_button", x: 1, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const names = ["player", "box", "button"];

  dump("before move:", engine, state, names);
  const result = engine.move(state, 1, 0); // push box right
  console.log("move right -> moved:", result.moved);
  dump("after move (box pushed):", engine, state, names);
  console.log(
    state.actorX[2] === state.actorX[1] && state.actorElevation[2] === 1
      ? "RESULT: button rode the box (engine intent for box carriers)"
      : "RESULT: button did NOT ride the box"
  );
}
