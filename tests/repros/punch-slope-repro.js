// Repro: punched boxes vs ice slopes, compared to pushed boxes.
const path = require("path");
const { loadBrowserScript } = require(path.join(
  "/Users/jpappas/code/GitHub/PixelGameTest",
  "tests/helpers/browser-module-loader"
));
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function iceSlopeLayer(direction = "right", elevation = 0) {
  return {
    type: "ice_slope",
    layers: [{ type: "ice_slope", direction, elevation }]
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

function createState(playData) {
  const engine = createEngine(playData);
  return { engine, state: engine.cloneState(engine.initialState) };
}

function dumpActors(label, state, actors) {
  console.log(label);
  actors.forEach((name, i) => {
    console.log(
      `  ${i} ${name}: x=${state.actorX[i]} y=${state.actorY[i]} elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  });
}

// ---------------------------------------------------------------
// CONTROL: player pushes box right into an uphill slope, wall top beyond
// board 5x1: player(1,0) box(2,0) slope-right e0 (3,0) wall h1 (4,0)
{
  const terrain = floorTerrain(5, 1);
  terrain[0][3] = iceSlopeLayer("right", 0);
  terrain[0][4] = wallStack(1, 0);
  const { engine, state } = createState({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 1, y: 0, removed: false },
      { type: "box", x: 2, y: 0, removed: false }
    ]
  });
  const result = engine.move(state, 1, 0);
  console.log("=== CONTROL: player push right into slope ===");
  console.log("moved:", result.moved);
  dumpActors("after:", state, ["player", "box"]);
}

// ---------------------------------------------------------------
// FINDING: punched box toward the same slope
// board 5x3:
//   player (2,0)
//   box    (2,1)
//   puncher facing right (2,2)
//   ice_slope right e0 at (3,2)
//   wall h1 at (4,2)
// Player moves down, pushing box onto the puncher cell -> punch should
// fire rightward toward the slope.
{
  const terrain = floorTerrain(5, 3);
  terrain[2][3] = iceSlopeLayer("right", 0);
  terrain[2][4] = wallStack(1, 0);
  const { engine, state } = createState({
    width: 5,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 2, y: 0, removed: false },
      { type: "box", x: 2, y: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 2, elevation: 0, removed: false }
    ]
  });
  const result = engine.move(state, 0, 1);
  console.log("\n=== FINDING: punch right into slope ===");
  console.log("moved:", result.moved);
  dumpActors("after:", state, ["player", "box", "puncher"]);
  const boxMove = result.moves.find((m) => m.actorIndex === 1 && !m.visualOnly);
  console.log("box move record:", JSON.stringify(boxMove));
  const punchMoves = result.moves.filter((m) => m.punchSlide);
  console.log("any punchSlide moves:", punchMoves.length);
}

// ---------------------------------------------------------------
// SANITY: identical punch setup but plain floor instead of slope,
// to prove the punch itself fires in this geometry.
{
  const terrain = floorTerrain(5, 3);
  terrain[2][4] = wallStack(1, 0);
  const { engine, state } = createState({
    width: 5,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 2, y: 0, removed: false },
      { type: "box", x: 2, y: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 2, elevation: 0, removed: false }
    ]
  });
  const result = engine.move(state, 0, 1);
  console.log("\n=== SANITY: same geometry, no slope (floor) ===");
  console.log("moved:", result.moved);
  dumpActors("after:", state, ["player", "box", "puncher"]);
  const punchMoves = result.moves.filter((m) => m.punchSlide);
  console.log("any punchSlide moves:", punchMoves.length);
}

// ---------------------------------------------------------------
// DOWNHILL variant: box at elevation 1 on a wall ledge, punched left toward
// a downhill slope (direction 'left', e0) which pushes can descend.
// Control first: player at e1 pushes box at e1 left onto slope.
{
  // board 5x1: wall h1 at (3,0),(4,0); slope 'left' e0 at (2,0); floor (0,0),(1,0)
  const terrain = floorTerrain(5, 1);
  terrain[0][2] = iceSlopeLayer("left", 0);
  terrain[0][3] = wallStack(1, 0);
  terrain[0][4] = wallStack(1, 0);
  const { engine, state } = createState({
    width: 5,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 4, y: 0, elevation: 1, removed: false },
      { type: "box", x: 3, y: 0, elevation: 1, removed: false }
    ]
  });
  const result = engine.move(state, -1, 0);
  console.log("\n=== CONTROL 2: player push left down slope from ledge ===");
  console.log("moved:", result.moved);
  dumpActors("after:", state, ["player", "box"]);
}

{
  // board 5x3 downhill punch:
  //   column x=3: player(3,0,e1)? need player push at e1... simpler: puncher at e1 on ledge.
  //   wall h1 at (3,1),(3,2),(4,2)... let's mirror the uphill layout:
  //   player (3,0,e1), box (3,1,e1), puncher facing left (3,2,e1) all on wall h1;
  //   slope 'left' e0 at (2,2), floor at (0,2),(1,2)
  const terrain = floorTerrain(5, 3);
  terrain[0][3] = wallStack(1, 0);
  terrain[1][3] = wallStack(1, 0);
  terrain[2][3] = wallStack(1, 0);
  terrain[2][2] = iceSlopeLayer("left", 0);
  const { engine, state } = createState({
    width: 5,
    height: 3,
    terrain,
    actors: [
      { type: "player", x: 3, y: 0, elevation: 1, removed: false },
      { type: "box", x: 3, y: 1, elevation: 1, removed: false },
      { type: "puncher", direction: "left", x: 3, y: 2, elevation: 1, removed: false }
    ]
  });
  const result = engine.move(state, 0, 1);
  console.log("\n=== FINDING 2: punch left toward downhill slope from ledge ===");
  console.log("moved:", result.moved);
  dumpActors("after:", state, ["player", "box", "puncher"]);
  const punchMoves = result.moves.filter((m) => m.punchSlide);
  console.log("any punchSlide moves:", punchMoves.length);
}
