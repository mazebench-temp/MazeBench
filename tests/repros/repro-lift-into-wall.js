// Repro: lift toggle raises player into a wall layer stacked above the lift.
// Board: 3x1  [floor][player_lift@0 + wall@1][floor]
// Editor text equivalent: ". l+# ."
const { loadBrowserScript } = require("../helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function liftWithWallAbove() {
  return {
    type: "wall",
    layers: [
      { type: "player_lift", elevation: 0, raised: false },
      { type: "wall", elevation: 1 }
    ]
  };
}

const engine = createEngine({
  width: 3,
  height: 1,
  terrain: [[{ type: "floor" }, liftWithWallAbove(), { type: "floor" }]],
  actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
});
const state = engine.cloneState(engine.initialState);

function dump(label, result) {
  console.log(label, {
    moved: result ? result.moved : null,
    liftToggles: result ? result.liftToggles : null,
    player: { x: state.actorX[0], y: state.actorY[0], elev: state.actorElevation[0] },
    liftRaised: Array.from(state.liftRaised)
  });
}

// Step 1: move right onto the lowered lift (wall stacked at elevation 1 above it)
const r1 = engine.move(state, 1, 0);
dump("after move right onto lift:", r1);

// Step 2: try to leave — left and right
const r2 = engine.move(state, -1, 0);
dump("after attempted move left:", r2);
const r3 = engine.move(state, 1, 0);
dump("after attempted move right:", r3);

// Step 3: exhaustive escape probe: try all 4 directions repeatedly
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let anyMoved = false;
for (const [dx, dy] of dirs) {
  const r = engine.move(state, dx, dy);
  if (r.moved) anyMoved = true;
  console.log(`probe dir (${dx},${dy}): moved=${r.moved}, toggles=${JSON.stringify(r.liftToggles)}`);
}
console.log("any escape move possible:", anyMoved);

// Control A: same board WITHOUT the wall layer — confirm lift itself works
{
  const engineC = createEngine({
    width: 3,
    height: 1,
    terrain: [
      [
        { type: "floor" },
        { type: "player_lift", layers: [{ type: "player_lift", elevation: 0, raised: false }] },
        { type: "floor" }
      ]
    ],
    actors: [{ type: "player", x: 0, y: 0, elevation: 0, removed: false }]
  });
  const stateC = engineC.cloneState(engineC.initialState);
  const c1 = engineC.move(stateC, 1, 0);
  console.log("CONTROL no-wall: after step onto lift:", {
    moved: c1.moved,
    toggles: c1.liftToggles,
    player: { x: stateC.actorX[0], elev: stateC.actorElevation[0] },
    liftRaised: Array.from(stateC.liftRaised)
  });
  const c2 = engineC.move(stateC, -1, 0);
  console.log("CONTROL no-wall: try step off raised lift to floor:", {
    moved: c2.moved,
    player: { x: stateC.actorX[0], elev: stateC.actorElevation[0] }
  });
}

// Control B: does terrain report the wall blocking elevation 1 at the lift cell?
// (indirect: put a plain wall stack next to floor and check player can't enter elev1)
console.log(
  "final: player embedded at same cell+elevation as wall layer?",
  state.actorX[0] === 1 && state.actorY[0] === 0 && state.actorElevation[0] === 1
);
