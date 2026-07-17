// Repro: punch carries a box through a raised orange wall via transient
// mid-pipeline button press.
//
// Board 4x3:
//   (1,2) floor cell of type orange_button, puncher actor facing right on it
//   (2,2) orange_wall
//   (3,2) floor
//   player at (1,0), box at (1,1)
// Move DOWN: player pushes box onto the button+puncher cell.

const path = require("path");
const repoRoot = "/Users/jpappas/code/GitHub/PixelGameTest";
const { loadBrowserScript } = require(path.join(repoRoot, "tests/helpers/browser-module-loader"));
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function dumpActors(label, engine, state, actors) {
  console.log(label);
  actors.forEach((a, i) => {
    console.log(
      `  [${i}] ${a.type} at (${state.actorX[i]},${state.actorY[i]}) e${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  });
}

// ---------- Main run: box pushed onto button+puncher ----------
{
  const terrain = floorTerrain(4, 3);
  terrain[2][1] = { type: "orange_button" }; // (x=1, y=2)
  terrain[2][2] = { type: "orange_wall" };   // (x=2, y=2)

  const actors = [
    { type: "player", x: 1, y: 0, removed: false },
    { type: "box", x: 1, y: 1, elevation: 0, removed: false },
    { type: "puncher", direction: "right", x: 1, y: 2, elevation: 0, removed: false }
  ];

  const engine = createEngine({ width: 4, height: 3, terrain, actors });
  const state = engine.cloneState(engine.initialState);

  dumpActors("BEFORE main run:", engine, state, actors);
  const result = engine.move(state, 0, 1); // push down
  console.log("move down -> moved =", result.moved);
  dumpActors("AFTER main run:", engine, state, actors);

  const boxX = state.actorX[1];
  const boxY = state.actorY[1];
  console.log(
    boxX === 3 && boxY === 2
      ? ">>> BOX ENDED AT (3,2): it passed THROUGH the orange wall cell (2,2)."
      : `>>> Box ended at (${boxX},${boxY}) — did NOT pass through the wall.`
  );
}

// ---------- Control A: same wall, button unpressed, player walks into wall ----------
{
  const terrain = floorTerrain(4, 3);
  terrain[2][1] = { type: "orange_button" };
  terrain[2][2] = { type: "orange_wall" };

  const actors = [{ type: "player", x: 2, y: 1, removed: false }];
  const engine = createEngine({ width: 4, height: 3, terrain, actors });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 0, 1); // try to walk into (2,2)
  console.log(
    "\nControl A (walk into raised orange wall): moved =",
    result.moved,
    "player at",
    `(${state.actorX[0]},${state.actorY[0]})`,
    result.moved === false ? "-> wall blocks walking, as expected" : "-> UNEXPECTED"
  );
}

// ---------- Control B: player pushes box RIGHT into the raised wall (no puncher) ----------
// Box starts ON the button; pushing it right moves it off the button toward the wall.
{
  const terrain = floorTerrain(4, 3);
  terrain[2][1] = { type: "orange_button" };
  terrain[2][2] = { type: "orange_wall" };

  const actors = [
    { type: "player", x: 0, y: 2, removed: false },
    { type: "box", x: 1, y: 2, elevation: 0, removed: false } // on the button -> wall lowered NOW
  ];
  const engine = createEngine({ width: 4, height: 3, terrain, actors });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0); // push box right toward wall cell
  console.log(
    "Control B (push box off button into wall cell, walking-phase semantics): moved =",
    result.moved,
    "box at",
    `(${state.actorX[1]},${state.actorY[1]})`
  );
}
