// Repro for finding: actor punched off a b1 ledge keeps its elevation and
// hovers mid-air over lower floor; player becomes frozen, box unpushable.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorTerrain(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

function blockTop() {
  // b1 editor block: block_asset occupying elevation 0, standable top at elevation 1
  return { type: "block_asset", layers: [{ type: "block_asset", elevation: 0 }] };
}

function dump(state, engine, labels) {
  return labels
    .map(
      (label, i) =>
        `${label}: (${state.actorX[i]},${state.actorY[i]}) e${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    )
    .join(" | ");
}

console.log("=== PROBE A: player punched off ledge ===");
{
  const width = 6, height = 3;
  const terrain = floorTerrain(width, height);
  terrain[0][2] = blockTop();
  terrain[1][2] = blockTop();
  terrain[2][2] = blockTop();

  const engine = createEngine({
    width,
    height,
    terrain,
    actors: [
      { type: "player", x: 2, y: 1, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 2, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const labels = ["player", "puncher"];

  console.log("start:", dump(state, engine, labels));

  const r1 = engine.move(state, 0, 1); // walk down onto puncher
  console.log(`move down: moved=${r1.moved}`);
  console.log("after punch:", dump(state, engine, labels));

  const dirs = [
    ["right", 1, 0],
    ["left", -1, 0],
    ["up", 0, -1],
    ["down", 0, 1]
  ];
  for (const [name, dx, dy] of dirs) {
    const snapshot = engine.cloneState(state);
    const r = engine.move(snapshot, dx, dy);
    console.log(
      `subsequent move ${name}: moved=${r.moved} -> (${snapshot.actorX[0]},${snapshot.actorY[0]}) e${snapshot.actorElevation[0]}`
    );
  }
}

console.log("\n=== PROBE A2 (control): player walks off ledge normally (no punch) ===");
{
  // Same ledge but player just walks from block top toward floor - does the
  // engine normally allow stepping down? (to compare intended behavior)
  const width = 4, height = 1;
  const terrain = floorTerrain(width, height);
  terrain[0][0] = blockTop();
  const engine = createEngine({
    width,
    height,
    terrain,
    actors: [{ type: "player", x: 0, y: 0, elevation: 1, removed: false }]
  });
  const state = engine.cloneState(engine.initialState);
  const r = engine.move(state, 1, 0);
  console.log(
    `walk right off block: moved=${r.moved} -> (${state.actorX[0]},${state.actorY[0]}) e${state.actorElevation[0]}`
  );
}

console.log("\n=== PROBE B: box punched off ledge ===");
{
  const width = 6, height = 1;
  const terrain = floorTerrain(width, height);
  terrain[0][0] = blockTop();
  terrain[0][1] = blockTop();
  terrain[0][2] = blockTop();
  // (3,0),(4,0),(5,0) plain floor

  const engine = createEngine({
    width,
    height,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 1, removed: false },
      { type: "box", x: 1, y: 0, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const labels = ["player", "box", "puncher"];

  console.log("start:", dump(state, engine, labels));
  const r1 = engine.move(state, 1, 0); // push box onto puncher
  console.log(`move right: moved=${r1.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r2 = engine.move(state, 1, 0); // step onto puncher / approach box
  console.log(`move right again: moved=${r2.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r3 = engine.move(state, 1, 0); // try to push hovering box
  console.log(`move right (push hovering box): moved=${r3.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r4 = engine.move(state, -1, 0); // can player retreat?
  console.log(`move left (retreat): moved=${r4.moved}`);
  console.log("after:", dump(state, engine, labels));
}

console.log("\n=== PROBE C: floating_floor punched off ledge ===");
{
  const width = 6, height = 1;
  const terrain = floorTerrain(width, height);
  terrain[0][0] = blockTop();
  terrain[0][1] = blockTop();
  terrain[0][2] = blockTop();

  const engine = createEngine({
    width,
    height,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, elevation: 1, removed: false },
      { type: "floating_floor", x: 1, y: 0, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const labels = ["player", "ffloor", "puncher"];

  console.log("start:", dump(state, engine, labels));
  const r1 = engine.move(state, 1, 0);
  console.log(`move right: moved=${r1.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r2 = engine.move(state, 1, 0);
  console.log(`move right again: moved=${r2.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r3 = engine.move(state, 1, 0);
  console.log(`move right (push hovering floating_floor): moved=${r3.moved}`);
  console.log("after:", dump(state, engine, labels));
}

for (const victimType of ["box", "floating_floor"]) {
  console.log(`=== PROBE: ${victimType} punched off ledge (victim in front of puncher) ===`);
  const width = 7, height = 1;
  const terrain = floorTerrain(width, height);
  terrain[0][1] = blockTop();
  terrain[0][2] = blockTop();
  terrain[0][3] = blockTop();
  // (0,0),(4,0),(5,0),(6,0) plain floor

  const engine = createEngine({
    width,
    height,
    terrain,
    actors: [
      { type: "player", x: 1, y: 0, elevation: 1, removed: false },
      { type: "puncher", direction: "right", x: 2, y: 0, elevation: 1, removed: false },
      { type: victimType, x: 3, y: 0, elevation: 1, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  const labels = ["player", "puncher", "victim"];

  console.log("start:", dump(state, engine, labels));
  const r1 = engine.move(state, 1, 0); // player steps onto puncher -> punch train [player, victim]
  console.log(`move right: moved=${r1.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r2 = engine.move(state, 1, 0); // try to advance / push hovering victim
  console.log(`move right again: moved=${r2.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r3 = engine.move(state, 1, 0);
  console.log(`move right 3rd: moved=${r3.moved}`);
  console.log("after:", dump(state, engine, labels));

  const r4 = engine.move(state, -1, 0);
  console.log(`move left (retreat): moved=${r4.moved}`);
  console.log("after:", dump(state, engine, labels));
  console.log("");
}
