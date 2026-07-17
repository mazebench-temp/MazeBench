// Repro for finding: "Button/gate state frozen at move() start"
// Clone steps OFF an orange button while the player crosses the orange wall
// in the same input -> does the player end ON TOP of the raised wall?

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

function createState(playData) {
  const engine = createEngine(playData);
  return { engine, state: engine.cloneState(engine.initialState) };
}

function dump(label, engine, state, actorLabels) {
  const parts = actorLabels.map(
    (name, i) =>
      `${name}=(${state.actorX[i]},${state.actorY[i]}) e${state.actorElevation[i]}${
        state.actorRemoved[i] ? " REMOVED" : ""
      }`
  );
  console.log(`${label}: ${parts.join("  ")}`);
}

// ---------------------------------------------------------------
// Scenario A: player first in processing order.
// Row y=0: floor | orange_wall | floor        player at (0,0)
// Row y=1: orange_button | floor | floor      clone c0 at (0,1) (pressing)
// Input: Right. Clone releases the button; player crosses the wall cell.
{
  const terrain = floorTerrain(3, 2);
  terrain[0][1] = { type: "orange_wall" };
  terrain[1][0] = { type: "orange_button" };
  const { engine, state } = createState({
    width: 3,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 1, removed: false }
    ]
  });

  console.log("--- Scenario A: release button + cross wall in one input ---");
  console.log("buttons pressed before move:", engine.areOrangeButtonsPressed
    ? engine.areOrangeButtonsPressed(state)
    : "(not exported)");
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after Right", engine, state, ["player", "clone"]);
}

// ---------------------------------------------------------------
// Scenario A-mirrored: clone first in processing order (clone row above).
// Row y=0: orange_button | floor | floor      clone c0 at (0,0) (pressing)
// Row y=1: floor | orange_wall | floor        player at (0,1)
{
  const terrain = floorTerrain(3, 2);
  terrain[0][0] = { type: "orange_button" };
  terrain[1][1] = { type: "orange_wall" };
  const { engine, state } = createState({
    width: 3,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 0, y: 1, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 0, removed: false }
    ]
  });

  console.log("--- Scenario A': clone processed first ---");
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after Right", engine, state, ["player", "clone"]);
}

// ---------------------------------------------------------------
// Scenario B (control): walking into the RAISED wall is blocked.
// Same terrain as A but nobody on the button; player at (0,0) moves Right.
{
  const terrain = floorTerrain(3, 2);
  terrain[0][1] = { type: "orange_wall" };
  terrain[1][0] = { type: "orange_button" };
  const { engine, state } = createState({
    width: 3,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "clone", groupId: "c0", x: 2, y: 1, removed: false }
    ]
  });

  console.log("--- Scenario B: raised wall blocks entry (control) ---");
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after Right", engine, state, ["player", "clone"]);
}

// ---------------------------------------------------------------
// Scenario C (inverse): clone steps ONTO the button in the same input;
// player tries to cross the wall which "will be" lowered.
// Row y=0: floor | orange_wall | floor        player at (0,0)
// Row y=1: floor | orange_button | floor      clone at (0,1), button at (1,1)
{
  const terrain = floorTerrain(3, 2);
  terrain[0][1] = { type: "orange_wall" };
  terrain[1][1] = { type: "orange_button" };
  const { engine, state } = createState({
    width: 3,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 1, removed: false }
    ]
  });

  console.log("--- Scenario C: press button + cross wall in one input ---");
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after Right", engine, state, ["player", "clone"]);
  // follow-up move: now wall is lowered, player should be able to cross at e0
  const result2 = engine.move(state, 1, 0);
  console.log("moved (2nd Right):", result2.moved);
  dump("after 2nd Right", engine, state, ["player", "clone"]);
}

// ---------------------------------------------------------------
// Scenario D (legitimacy check): player standing ON the lowered wall when the
// button is released rides up to e1 -- i.e. is wall-top e1 reachable by the
// intended "passenger" mechanic too?
// Row y=0: wall(blocks player) is simulated by board edge: player on (1,0)
// which is the orange wall cell, moving Right is off-board for clone? Use:
// Row y=0: floor | orange_wall  (player standing on lowered wall at (1,0))
// Row y=1: orange_button | floor (clone on button at (0,1))
// Input: Right. Player blocked by board edge, clone steps off button.
{
  const terrain = floorTerrain(2, 2);
  terrain[0][1] = { type: "orange_wall" };
  terrain[1][0] = { type: "orange_button" };
  const { engine, state } = createState({
    width: 2,
    height: 2,
    terrain,
    actors: [
      { type: "player", x: 1, y: 0, elevation: 0, removed: false },
      { type: "clone", groupId: "c0", x: 0, y: 1, removed: false }
    ]
  });

  console.log("--- Scenario D: stationary player on lowered wall rides up ---");
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  dump("after Right", engine, state, ["player", "clone"]);
}
