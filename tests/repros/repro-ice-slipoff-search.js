const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function iceSlopeLayer(direction = "right", elevation = 0) {
  return {
    type: "ice_slope",
    layers: [{ type: "ice_slope", direction, elevation }]
  };
}

function dump(label, engine, state, actorIdx) {
  console.log(
    `${label}: x=${state.actorX[actorIdx]} y=${state.actorY[actorIdx]} elev=${state.actorElevation[actorIdx]} removed=${state.actorRemoved[actorIdx]}`
  );
}

// --- Scenario A: player walks up slope over void ---
// [P floor][ice_slope right][empty]
{
  const playData = {
    width: 3,
    height: 1,
    terrain: [[{ type: "floor" }, iceSlopeLayer("right", 0), { type: "empty" }]],
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  };

  const engineA = createEngine(playData);
  const playState = engineA.cloneState(engineA.initialState);
  const playRes = engineA.move(playState, 1, 0);
  dump("A play   player", engineA, playState, 0);
  console.log("A play   move flags:", JSON.stringify(playRes.moves.map(m => ({ i: m.actorIndex, iceSlipOff: m.iceSlipOff, toRemoved: m.toRemoved }))));

  const engineB = createEngine(playData);
  const searchState = engineB.cloneState(engineB.initialState);
  const searchRes = engineB.moveForSearch(searchState, 1, 0);
  dump("A search player", engineB, searchState, 0);
  console.log("A search move flags:", JSON.stringify(searchRes.moves.map(m => ({ i: m.actorIndex, iceSlipOff: m.iceSlipOff, toRemoved: m.toRemoved }))));

  console.log("A DIVERGES:", playState.actorRemoved[0] !== searchState.actorRemoved[0]);
  console.log("A stateKey equal:", engineA.stateKey ? undefined : "n/a");
}

console.log("---");

// --- Scenario B: player pushes a box up slope over void ---
// [P floor][box floor][ice_slope right][empty]
{
  const playData = {
    width: 4,
    height: 1,
    terrain: [[{ type: "floor" }, { type: "floor" }, iceSlopeLayer("right", 0), { type: "empty" }]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "box", x: 1, y: 0, elevation: 0, removed: false }
    ]
  };

  const engineA = createEngine(playData);
  const playState = engineA.cloneState(engineA.initialState);
  engineA.move(playState, 1, 0);
  dump("B play   player", engineA, playState, 0);
  dump("B play   box   ", engineA, playState, 1);

  const engineB = createEngine(playData);
  const searchState = engineB.cloneState(engineB.initialState);
  engineB.moveForSearch(searchState, 1, 0);
  dump("B search player", engineB, searchState, 0);
  dump("B search box   ", engineB, searchState, 1);

  console.log("B box DIVERGES:", playState.actorRemoved[1] !== searchState.actorRemoved[1]);
}

console.log("---");

// --- Scenario C: flat ice sliding off the board edge / into empty ---
// [P floor][ice][empty]  (elevation 0)
{
  const playData = {
    width: 3,
    height: 1,
    terrain: [[{ type: "floor" }, { type: "ice", layers: [{ type: "ice", elevation: 0 }] }, { type: "empty" }]],
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  };

  const engineA = createEngine(playData);
  const playState = engineA.cloneState(engineA.initialState);
  engineA.move(playState, 1, 0);
  dump("C play   player", engineA, playState, 0);

  const engineB = createEngine(playData);
  const searchState = engineB.cloneState(engineB.initialState);
  engineB.moveForSearch(searchState, 1, 0);
  dump("C search player", engineB, searchState, 0);

  console.log("C DIVERGES:", playState.actorRemoved[0] !== searchState.actorRemoved[0]);
}

console.log("---");

// --- Scenario D: ice-block elevated slide off edge (matches test at line 846) ---
// [iceblock][iceblock][empty], player at elevation 1
{
  const iceBlock = { type: "ice_block", layers: [{ type: "ice_block", elevation: 0 }] };
  const playData = {
    width: 3,
    height: 1,
    terrain: [[iceBlock, iceBlock, { type: "empty" }]],
    actors: [{ type: "player", x: 0, y: 0, elevation: 1, removed: false }]
  };

  const engineA = createEngine(playData);
  const playState = engineA.cloneState(engineA.initialState);
  engineA.move(playState, 1, 0);
  dump("D play   player", engineA, playState, 0);

  const engineB = createEngine(playData);
  const searchState = engineB.cloneState(engineB.initialState);
  engineB.moveForSearch(searchState, 1, 0);
  dump("D search player", engineB, searchState, 0);

  console.log("D DIVERGES:", playState.actorRemoved[0] !== searchState.actorRemoved[0]);
}
