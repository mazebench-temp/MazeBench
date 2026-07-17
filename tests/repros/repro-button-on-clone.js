const { loadBrowserScript } = require("../helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function dump(label, engine, state, actorLabels) {
  console.log(label);
  actorLabels.forEach((name, index) => {
    console.log(
      `  [${index}] ${name}: x=${state.actorX[index]} y=${state.actorY[index]} elev=${state.actorElevation[index]} removed=${state.actorRemoved[index]}`
    );
  });
}

// --- Case 1: orange_button riding a clone -------------------------------
{
  const terrain = floorTerrain(6, 1);
  terrain[0][5] = { type: "orange_wall" };
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
  const labels = ["player", "clone", "button"];

  dump("CLONE CARRIER — before move:", engine, state, labels);
  const result = engine.move(state, 1, 0);
  console.log("  moved:", result.moved);
  dump("CLONE CARRIER — after move right:", engine, state, labels);
  const buttonMove = result.moves.find((m) => m.actorIndex === 2 && !m.visualOnly);
  console.log("  button move record:", buttonMove || "(none)");

  // A second move to show the button stays stranded permanently
  engine.move(state, 1, 0);
  dump("CLONE CARRIER — after second move right:", engine, state, labels);
}

// --- Case 2 (control): orange_button riding a pushed box ----------------
{
  const terrain = floorTerrain(6, 1);
  terrain[0][5] = { type: "orange_wall" };
  const engine = createEngine({
    width: 6,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 1, y: 0, removed: false },
      { type: "box", x: 2, y: 0, removed: false },
      { type: "orange_button", x: 2, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const labels = ["player", "box", "button"];

  dump("BOX CARRIER — before move:", engine, state, labels);
  const result = engine.move(state, 1, 0);
  console.log("  moved:", result.moved);
  dump("BOX CARRIER — after push right:", engine, state, labels);
  const buttonMove = result.moves.find((m) => m.actorIndex === 2 && !m.visualOnly);
  console.log("  button move record:", buttonMove ? { fromX: buttonMove.fromX, toX: buttonMove.toX, toElevation: buttonMove.toElevation } : "(none)");
}

// --- Case 3: can the stranded button ever be pressed on bare floor? -----
// Button stranded at (2,0) elev 1 over plain floor. Walk the player through
// the cell underneath: at elev 0 it does not press (elevation mismatch).
{
  const terrain = floorTerrain(6, 1);
  terrain[0][5] = { type: "orange_wall" };
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

  engine.move(state, 1, 0); // clone leaves, button stranded at (2,0) elev 1
  engine.move(state, 1, 0); // player now at (2,0) elev 0, directly under button
  console.log("PRESS PROBE — player under stranded button:");
  console.log(
    `  player: x=${state.actorX[0]} y=${state.actorY[0]} elev=${state.actorElevation[0]}`
  );
  console.log(
    `  button: x=${state.actorX[2]} y=${state.actorY[2]} elev=${state.actorElevation[2]}`
  );
  // Orange wall raised = clone blocked from entering (4,0)->(5,0)? The wall is
  // terrain; probe by trying to walk the player onto the orange wall cell.
  engine.move(state, 1, 0); // player 3,0 / clone gone? clone at 5? let's see
  const r = engine.move(state, 1, 0);
  console.log(
    `  after walking right twice more: player x=${state.actorX[0]}, moved=${r.moved} (orange wall at x=5 blocks if buttons unpressed)`
  );
}
