const { loadBrowserScript } = require("../helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");

const { createEngine } = window.MazeEngine;

function floorCell() {
  return { type: "floor" };
}

function raisedLayerCell(type, elevation = 1) {
  return { type, layers: [{ type, elevation }] };
}

function runScenario(label, flankCellFactory, boxType) {
  const terrain = [[floorCell(), floorCell(), flankCellFactory(), floorCell()]];
  const actors = [
    { type: "player", x: 0, y: 0, removed: false },
    boxType === "weightless_box"
      ? { type: "weightless_box", groupId: "M0", x: 1, y: 0, elevation: 0, removed: false }
      : { type: "box", x: 1, y: 0, elevation: 0, removed: false }
  ];

  const engine = createEngine({ width: 4, height: 1, terrain, actors });
  const state = engine.cloneState(engine.initialState);

  const result = engine.move(state, 1, 0);

  console.log(
    `${label}: moved=${result.moved}` +
      ` | box pos=(${state.actorX[1]},${state.actorY[1]})` +
      ` elevation=${state.actorElevation[1]}` +
      ` removed=${state.actorRemoved[1]}` +
      ` | player pos=(${state.actorX[0]},${state.actorY[0]})` +
      ` elev=${state.actorElevation[0]} removed=${state.actorRemoved[0]}`
  );
}

console.log("--- weightless box (M0) pushed right into flank of raised layer at (2,0) ---");
runScenario("exit@1 ", () => raisedLayerCell("exit"), "weightless_box");
runScenario("floor@1", () => raisedLayerCell("floor"), "weightless_box");
runScenario("ice@1  ", () => raisedLayerCell("ice"), "weightless_box");

console.log("--- heavy box pushed right into same flank ---");
runScenario("exit@1 heavy ", () => raisedLayerCell("exit"), "box");
runScenario("floor@1 heavy", () => raisedLayerCell("floor"), "box");
