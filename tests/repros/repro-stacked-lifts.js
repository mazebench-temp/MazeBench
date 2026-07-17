// Repro: stacked player lifts ("l+l") share one per-cell liftRaised bit.
// Run: node repro-stacked-lifts.js
//
// Verified facts:
//  1. The editor produces "l+l" (appendCellToken and placeCellElevationTokenIfVacant),
//     yielding player_lift layers at elevations 0 AND 1 in one cell; createEngine
//     accepts them with a single shared liftRaised bit per cell.
//  2. Standing on a raised lift with no adjacent elevation-1 surface strands the
//     player — but that is BASELINE single-lift behavior (case A == case D), per the
//     toolbox demo ("p . . .+l .+# .+#") and maze-engine.test.js lines 628-673.
//  3. The DISTINCTIVE stacked-lift defect: the raised upper layer (shared bit) blocks
//     re-entry at elevation 1. A single raised lift accepts a player from elevation 1
//     and lowers them (the only descent mechanism); a stacked lift refuses (round
//     trip below). So "l+l" is a one-way lift: any elevation-1 region reachable only
//     through it becomes a permanent trap.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/author-play-data.js");
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

const adapter = window.AuthorPlayData.createAdapter({
  blockAdder: "+",
  defaultFloorToken: ".",
  game: { id: "maze" },
  palette: [
    { imageUrl: null, label: "Floor", name: "floor", token: "." },
    { imageUrl: null, label: "Player", name: "player", token: "p" },
    { imageUrl: null, initialRaised: false, label: "Player Lift l", name: "player_lift", token: "l", type: "player_lift" }
  ]
});

console.log("=== 1. Editor producibility ===");
console.log("appendCellToken('l','l') ->", JSON.stringify(adapter.appendCellToken("l", "l")));
console.log("placeCellElevationTokenIfVacant('l','l',1) ->",
  JSON.stringify(adapter.placeCellElevationTokenIfVacant("l", "l", 1)));
const editorPlayData = adapter.buildPlayData({ width: 3, height: 1, cells: [["p", "l+l", "."]] });
console.log("'l+l' engine layers:",
  JSON.stringify(editorPlayData.terrain[0][1].layers.map((l) => [l.type, l.elevation])));

function floorCell() { return { type: "floor", layers: [{ type: "floor", elevation: 0 }] }; }
function wallCell() { return { type: "wall", layers: [{ type: "wall", elevation: 0 }] }; }
function liftCell(elevs) {
  return { type: "player_lift", layers: elevs.map((e) => ({ type: "player_lift", elevation: e, raised: false })) };
}

function makeState(terrainRow) {
  const engine = createEngine({
    width: terrainRow.length, height: 1, terrain: [terrainRow],
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  });
  return { engine, state: engine.cloneState(engine.initialState) };
}

function probeAllDirs(label, terrainRow) {
  const { engine, state } = makeState(terrainRow);
  console.log("\n--- " + label + " ---");
  const r1 = engine.move(state, 1, 0);
  console.log("step onto lift: moved=" + r1.moved,
    "pos=(" + state.actorX[0] + ",0) elev=" + state.actorElevation[0],
    "liftRaised=" + state.liftRaised[1]);
  for (const [name, dx, dy] of [["right", 1, 0], ["left", -1, 0], ["up", 0, -1], ["down", 0, 1]]) {
    const t = engine.cloneState(state);
    const r = engine.move(t, dx, dy);
    console.log("  then " + name + ": moved=" + r.moved +
      (r.moved ? " -> pos=(" + t.actorX[0] + "," + t.actorY[0] + ") elev=" + t.actorElevation[0] : ""));
  }
}

console.log("\n=== 2. Standing-on-lift immobility is NOT specific to stacking ===");
probeAllDirs("A: floor | l | floor (single lift, finding's layout)", [floorCell(), liftCell([0]), floorCell()]);
probeAllDirs("D: floor | l+l | floor (stacked, finding's probe)", [floorCell(), liftCell([0, 1]), floorCell()]);

console.log("\n=== 3. The real shared-bit defect: stacked lift blocks re-entry at elevation 1 ===");
function roundTrip(label, terrainRow) {
  const { engine, state } = makeState(terrainRow);
  console.log("\n--- " + label + " ---");
  const log = (tag, r) => console.log("  " + tag + ": moved=" + r.moved,
    "pos=(" + state.actorX[0] + ",0)", "elev=" + state.actorElevation[0],
    "liftRaised=" + state.liftRaised[1]);
  log("R onto lift ", engine.move(state, 1, 0));
  log("R onto wall ", engine.move(state, 1, 0));
  log("L back->lift", engine.move(state, -1, 0)); // single lift: lowers player; stacked: refused
  log("L off lift  ", engine.move(state, -1, 0));
}
roundTrip("single lift: floor | l | wall (works)", [floorCell(), liftCell([0]), wallCell()]);
roundTrip("stacked lifts: floor | l+l | wall (player stranded at elevation 1)", [floorCell(), liftCell([0, 1]), wallCell()]);
