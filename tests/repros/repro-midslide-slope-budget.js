// Repro: mid-slide slope-blocker pushes compute the player-train budget
// from the player's PRE-MOVE ORIGIN (state.actorX/Y), not the slide position.
const { loadBrowserScript } = require("../helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function wallStack(count, startElevation = 0) {
  return {
    type: "wall",
    layers: Array.from({ length: count }, (_, index) => ({
      type: "wall",
      elevation: startElevation + index
    }))
  };
}

function iceSlopeLayer(direction = "right", elevation = 0) {
  return {
    type: "ice_slope",
    layers: [{ type: "ice_slope", direction, elevation }]
  };
}

function run(label, actors) {
  // x: 0..2 floor | 3 ice | 4 ice | 5 slope(right, e0) | 6 wall1 | 7 wall1 | 8 wall1
  const terrain = [[
    { type: "floor" },
    { type: "floor" },
    { type: "floor" },
    { type: "ice" },
    { type: "ice" },
    iceSlopeLayer("right", 0),
    wallStack(1),
    wallStack(1),
    wallStack(1)
  ]];
  const engine = createEngine({ width: 9, height: 1, terrain, actors });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  console.log("=== " + label + " ===");
  console.log("moved:", result.moved);
  actors.forEach((a, i) => {
    console.log(
      `  actor ${i} (${a.type}) start (${a.x},${a.y},e${a.elevation ?? 0})` +
      ` -> (${state.actorX[i]},${state.actorY[i]},e${state.actorElevation[i]})`
    );
  });
  console.log();
  return state;
}

// S1: finding's exact layout — 3-player train behind origin, box A on ice ahead.
run("S1 finding layout: [P][P][P][boxA on ice][ice][slope>][wall+B][wall+C][wall]", [
  { type: "player", x: 0, y: 0, elevation: 0, removed: false },
  { type: "player", x: 1, y: 0, elevation: 0, removed: false },
  { type: "player", x: 2, y: 0, elevation: 0, removed: false },
  { type: "box", x: 3, y: 0, elevation: 0, removed: false },
  { type: "box", x: 6, y: 0, elevation: 1, removed: false },
  { type: "box", x: 7, y: 0, elevation: 1, removed: false }
]);

// S2: control — identical physics at the point of impact (lone pusher slides
// from x=2 over vacated ice, rams slope at x=5). Only difference: no players
// standing behind the ORIGIN. Tiles behind the SLIDE position are empty ice
// in both runs.
run("S2 control: [.][.][P][boxA on ice][ice][slope>][wall+B][wall+C][wall]", [
  { type: "player", x: 2, y: 0, elevation: 0, removed: false },
  { type: "box", x: 3, y: 0, elevation: 0, removed: false },
  { type: "box", x: 6, y: 0, elevation: 1, removed: false },
  { type: "box", x: 7, y: 0, elevation: 1, removed: false }
]);

// S3: same claim without box A — player slides across empty ice x3,x4 and
// rams the slope itself mid-slide.
run("S3 no boxA: [P][P][P][ice][ice][slope>][wall+B][wall+C][wall]", [
  { type: "player", x: 0, y: 0, elevation: 0, removed: false },
  { type: "player", x: 1, y: 0, elevation: 0, removed: false },
  { type: "player", x: 2, y: 0, elevation: 0, removed: false },
  { type: "box", x: 6, y: 0, elevation: 1, removed: false },
  { type: "box", x: 7, y: 0, elevation: 1, removed: false }
]);

// S4: control for S3 — lone slider, identical contact.
run("S4 control: [.][.][P][ice][ice][slope>][wall+B][wall+C][wall]", [
  { type: "player", x: 2, y: 0, elevation: 0, removed: false },
  { type: "box", x: 6, y: 0, elevation: 1, removed: false },
  { type: "box", x: 7, y: 0, elevation: 1, removed: false }
]);
