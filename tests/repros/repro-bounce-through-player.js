const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function ice() {
  return { type: "ice", layers: [{ type: "ice", elevation: 0 }] };
}
function floor() {
  return { type: "floor" };
}
function slopeRight() {
  return { type: "ice_slope", layers: [{ type: "ice_slope", direction: "right", elevation: 0 }] };
}
function wall2() {
  return {
    type: "wall",
    layers: [
      { type: "wall", elevation: 0 },
      { type: "wall", elevation: 1 }
    ]
  };
}

function dump(label, state, actors) {
  console.log(label);
  actors.forEach((name, i) => {
    console.log(
      `  ${name}: (${state.actorX[i]},${state.actorY[i]}) elev=${state.actorElevation[i]} removed=${state.actorRemoved[i]}`
    );
  });
}

console.log("=== F4: [floor][P ice][box ice][ice][slope right][wall2][wall2] ===");
{
  const engine = createEngine({
    width: 7,
    height: 1,
    terrain: [[floor(), ice(), ice(), ice(), slopeRight(), wall2(), wall2()]],
    actors: [
      { type: "player", x: 1, y: 0, elevation: 0, removed: false },
      { type: "box", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("before:", state, ["player", "box"]);
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  result.moves.forEach((m) => {
    console.log(
      `  move actor=${m.actorIndex} visualOnly=${m.visualOnly} iceSlide=${m.iceSlide} path=${JSON.stringify(m.path)}`
    );
  });
  dump("after:", state, ["player", "box"]);
}

console.log("");
console.log("=== F5: [P floor][P floor][box ice][ice][slope right][wall2][wall2] ===");
{
  const engine = createEngine({
    width: 7,
    height: 1,
    terrain: [[floor(), floor(), ice(), ice(), slopeRight(), wall2(), wall2()]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "player", x: 1, y: 0, elevation: 0, removed: false },
      { type: "box", x: 2, y: 0, elevation: 0, removed: false }
    ]
  });
  const state = engine.cloneState(engine.initialState);
  dump("before:", state, ["playerA", "playerB(pusher)", "box"]);
  const result = engine.move(state, 1, 0);
  console.log("moved:", result.moved);
  result.moves.forEach((m) => {
    console.log(
      `  move actor=${m.actorIndex} visualOnly=${m.visualOnly} iceSlide=${m.iceSlide} path=${JSON.stringify(m.path)}`
    );
  });
  dump("after:", state, ["playerA", "playerB(pusher)", "box"]);

  // overlap check
  const cells = new Map();
  for (let i = 0; i < 3; i += 1) {
    const key = `${state.actorX[i]},${state.actorY[i]},${state.actorElevation[i]}`;
    if (!state.actorRemoved[i]) {
      if (cells.has(key)) {
        console.log(`  OVERLAP: actors ${cells.get(key)} and ${i} both at ${key}`);
      }
      cells.set(key, i);
    }
  }
}
