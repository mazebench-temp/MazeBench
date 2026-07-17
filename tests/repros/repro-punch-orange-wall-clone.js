const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

// Editor-producible level (every cell is a standard token stack):
// Row 0:  p      .+o     .      .      .
// Row 1:  c0     .+pr    .+O    .      .
// Actors: player(0,0), orange_button actor (1,0), clone c0 (0,1),
//         puncher right (1,1). Orange wall terrain at (2,1).
const terrain = floorTerrain(5, 2);
terrain[1][2] = { type: "orange_wall" };

const engine = createEngine({
  width: 5,
  height: 2,
  terrain,
  actors: [
    { type: "player", x: 0, y: 0, elevation: 0, removed: false },
    { type: "orange_button", x: 1, y: 0, elevation: 0, removed: false },
    { type: "clone", groupId: "c0", x: 0, y: 1, elevation: 0, removed: false },
    { type: "puncher", direction: "right", x: 1, y: 1, elevation: 0, removed: false }
  ]
});
const state = engine.cloneState(engine.initialState);

function report(label) {
  console.log(
    `${label}: player=(${state.actorX[0]},${state.actorY[0]}) clone=(${state.actorX[2]},${state.actorY[2]}) pressed=${engine.areOrangeButtonsPressed(state)}`
  );
}

console.log("=== Clone variant: button pressed mid-move by player's walk ===");
report("move start (wall at (2,1) raised)");
const result = engine.move(state, 1, 0);
report("after one input right");
console.log("moved:", result.moved);
const cloneMove = result.moves.find((m) => m.actorIndex === 2 && !m.visualOnly);
console.log("clone move record:", JSON.stringify(cloneMove));

// Control: same board WITHOUT puncher; clone standing at (1,1) tries to WALK
// into the wall cell in the same move that the player steps on the button.
{
  const terrain2 = floorTerrain(5, 2);
  terrain2[1][2] = { type: "orange_wall" };
  const engine2 = createEngine({
    width: 5,
    height: 2,
    terrain: terrain2,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "orange_button", x: 1, y: 0, elevation: 0, removed: false },
      { type: "clone", groupId: "c0", x: 1, y: 1, elevation: 0, removed: false }
    ]
  });
  const s2 = engine2.cloneState(engine2.initialState);
  console.log("\n=== Control: WALK version of the same timing ===");
  console.log(
    `move start: player=(${s2.actorX[0]},${s2.actorY[0]}) clone=(${s2.actorX[2]},${s2.actorY[2]}) pressed=${engine2.areOrangeButtonsPressed(s2)}`
  );
  const r2 = engine2.move(s2, 1, 0);
  console.log(
    `after right: player=(${s2.actorX[0]},${s2.actorY[0]}) clone=(${s2.actorX[2]},${s2.actorY[2]}) pressed=${engine2.areOrangeButtonsPressed(s2)}`
  );
  console.log("moved:", r2.moved, "(clone should be blocked by wall frozen-raised at move start)");
}
