// Repro: verify that M0 vs M4 weightless boxes behave identically on an ice slide.
// M-tokens map to actor type "weightless_box" with groupId = token (server/maze-levels.js:519-523).
const { loadBrowserScript } = require("../helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function buildLevel(groupId) {
  // Row: player, box, ice, ice, ice, wall
  const terrain = [
    [
      { type: "floor" },
      { type: "floor" },
      { type: "ice", layers: [{ type: "ice", elevation: 0 }] },
      { type: "ice", layers: [{ type: "ice", elevation: 0 }] },
      { type: "ice", layers: [{ type: "ice", elevation: 0 }] },
      { type: "wall", layers: [{ type: "wall", elevation: 0 }] }
    ]
  ];
  return {
    width: 6,
    height: 1,
    terrain,
    actors: [
      { type: "player", x: 0, y: 0, removed: false },
      { type: "weightless_box", groupId, x: 1, y: 0, elevation: 0, removed: false }
    ]
  };
}

function snapshot(engine, state) {
  return JSON.stringify({
    key: engine.stateKey ? engine.stateKey(state) : null,
    actorX: Array.from(state.actorX),
    actorY: Array.from(state.actorY),
    actorElevation: state.actorElevation ? Array.from(state.actorElevation) : null,
    actorRemoved: Array.from(state.actorRemoved)
  });
}

function run(groupId, moves) {
  const engine = createEngine(buildLevel(groupId));
  const state = engine.cloneState(engine.initialState);
  const trace = [];
  moves.forEach(([dx, dy]) => {
    const result = engine.move(state, dx, dy);
    trace.push({ moved: result.moved, snap: snapshot(engine, state) });
  });
  return trace;
}

// Push the box onto the ice repeatedly (it slides), then keep pushing into the wall.
const moves = [
  [1, 0],
  [1, 0],
  [1, 0],
  [1, 0]
];

const traceM0 = run("M0", moves);
const traceM4 = run("M4", moves);

let identical = true;
traceM0.forEach((step, i) => {
  const same = step.moved === traceM4[i].moved && step.snap === traceM4[i].snap;
  if (!same) identical = false;
  console.log(`move ${i + 1}: moved(M0)=${step.moved} moved(M4)=${traceM4[i].moved} sameState=${same}`);
  console.log(`  M0: ${step.snap}`);
  console.log(`  M4: ${traceM4[i].snap}`);
});

// Contrast: a weighted "box" on the same layout to show pushWeightForType matters for type, not token.
function runTyped(type, extra) {
  const level = buildLevel(null);
  level.actors[1] = Object.assign({ type, x: 1, y: 0, elevation: 0, removed: false }, extra);
  const engine = createEngine(level);
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  return { moved: result.moved, boxX: state.actorX[1], playerX: state.actorX[0] };
}

console.log("\ncontrast weighted box (type=box):", JSON.stringify(runTyped("box")));
console.log("weightless M0:", JSON.stringify(runTyped("weightless_box", { groupId: "M0" })));
console.log("weightless M4:", JSON.stringify(runTyped("weightless_box", { groupId: "M4" })));

console.log(identical ? "\nRESULT: M0 and M4 behavior IDENTICAL" : "\nRESULT: M0 and M4 behavior DIFFERS");
process.exit(identical ? 0 : 1);
