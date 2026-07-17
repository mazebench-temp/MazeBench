// Repro for: "Lift toggle elevation is applied before co-location checks"
const path = require("path");
const { loadBrowserScript } = require(path.join(
  "/Users/jpappas/code/GitHub/PixelGameTest",
  "tests/helpers/browser-module-loader"
));

global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

function floorCell() {
  return { type: "floor" };
}
function playerLiftCell(elevation = 0, raised = false) {
  return {
    type: "player_lift",
    layers: [{ type: "player_lift", elevation, raised }],
    raised
  };
}
function wallCell() {
  return { type: "wall", layers: [{ type: "wall", elevation: 0 }] };
}

function run(label, playData, moves, report) {
  const engine = createEngine(playData);
  const state = engine.cloneState(engine.initialState);
  const results = moves.map(([dx, dy]) => engine.move(state, dx, dy));
  console.log("=== " + label + " ===");
  report(engine, state, results);
  console.log("");
}

// PROBE A: gem resting on a LOWERED lift (elev 0); player steps right onto lift.
run(
  "A: gem on lowered lift, player steps on",
  {
    width: 2,
    height: 1,
    terrain: [[floorCell(), playerLiftCell(0, false)]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "gem", x: 1, y: 0, elevation: 0, removed: false }
    ]
  },
  [[1, 0]],
  (engine, state, [r]) => {
    console.log("moved:", r.moved, "liftToggles:", JSON.stringify(r.liftToggles));
    console.log("player pos/elev:", state.actorX[0], state.actorY[0], state.actorElevation[0]);
    console.log("gem removed:", state.actorRemoved[1], "gem elev:", state.actorElevation[1]);
    console.log("isSolved:", engine.isSolved(state));
  }
);

// PROBE B (control): gem on plain floor; player steps on -> collected.
run(
  "B (control): gem on floor",
  {
    width: 2,
    height: 1,
    terrain: [[floorCell(), floorCell()]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "gem", x: 1, y: 0, elevation: 0, removed: false }
    ]
  },
  [[1, 0]],
  (engine, state) => {
    console.log("gem removed:", state.actorRemoved[1], "isSolved:", engine.isSolved(state));
  }
);

// PROBE C (mirror): RAISED lift, gem embedded at elev 0; player at elev 1 on wall steps onto lift.
// Lift toggles to lowered -> toElevation = 0 -> matches gem elev 0 -> collected per finding.
run(
  "C (mirror): raised lift, gem at elev 0, player steps down onto it",
  {
    width: 2,
    height: 1,
    terrain: [[wallCell(), playerLiftCell(0, true)]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 1, removed: false },
      { type: "gem", x: 1, y: 0, elevation: 0, removed: false }
    ]
  },
  [[1, 0]],
  (engine, state, [r]) => {
    console.log("moved:", r.moved, "liftToggles:", JSON.stringify(r.liftToggles));
    console.log("player pos/elev:", state.actorX[0], state.actorY[0], state.actorElevation[0]);
    console.log("gem removed:", state.actorRemoved[1], "isSolved:", engine.isSolved(state));
  }
);

// PROBE D: puncher on a lowered lift, pointing right; player steps onto lift.
// Per finding: puncher never fires because player ends at elev 1 vs puncher elev 0.
run(
  "D: puncher on lowered lift (points right), player steps on",
  {
    width: 3,
    height: 1,
    terrain: [[floorCell(), playerLiftCell(0, false), floorCell()]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "puncher", x: 1, y: 0, elevation: 0, direction: "right", removed: false }
    ]
  },
  [[1, 0]],
  (engine, state, [r]) => {
    console.log("moved:", r.moved);
    console.log("player pos/elev:", state.actorX[0], state.actorY[0], state.actorElevation[0]);
    console.log(
      "punched?", state.actorX[0] === 2 ? "yes (player pushed to x=2)" : "no"
    );
  }
);

// PROBE D-control: puncher on floor, player steps on -> punched.
run(
  "D-control: puncher on floor, player steps on",
  {
    width: 3,
    height: 1,
    terrain: [[floorCell(), floorCell(), floorCell()]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "puncher", x: 1, y: 0, elevation: 0, direction: "right", removed: false }
    ]
  },
  [[1, 0]],
  (engine, state, [r]) => {
    console.log("moved:", r.moved);
    console.log("player pos/elev:", state.actorX[0], state.actorY[0], state.actorElevation[0]);
    console.log(
      "punched?", state.actorX[0] === 2 ? "yes (player pushed to x=2)" : "no"
    );
  }
);

// PROBE E: orange_button ACTOR on a lowered lift; player steps onto lift.
// Pressed-ness is queried via move availability through an orange_wall:
// build 1x3 col: player, lift-with-button, then check via engine internals is hard;
// instead directly check isOrangeButtonActorPressed indirectly through orange_wall passability.
// Layout: [floor][lift+buttonActor][orange_wall floor beyond]... simpler: 3x1
// orange_wall at x=2 blocks unless buttons pressed. Player on lift at x=1; then try move right.
run(
  "E: orange_button actor on lowered lift; does standing on lift press it?",
  {
    width: 4,
    height: 1,
    terrain: [
      [
        floorCell(),
        playerLiftCell(0, false),
        {
          type: "orange_wall",
          layers: [
            { type: "floor", elevation: 0 },
            { type: "orange_wall", elevation: 1 }
          ]
        },
        floorCell()
      ]
    ],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "orange_button", x: 1, y: 0, elevation: 0, removed: false }
    ]
  },
  [[1, 0], [1, 0]],
  (engine, state, [r1, r2]) => {
    console.log("step onto lift moved:", r1.moved, "player elev:", state.actorElevation[0]);
    console.log(
      "second move right (orange_wall at elev1 ahead) moved:",
      r2.moved,
      "-> player x:",
      state.actorX[0]
    );
    console.log(
      "(if button were pressed, orange_wall lowers/opens; movement result shows pressed-ness)"
    );
  }
);

// PROBE F: after A, can the gem EVER be collected? Step off then back on:
// board 2x1 only lets us go left then right again. Lift is now raised.
run(
  "F: A-board continued: step off raised lift, step back on (lift lowers)",
  {
    width: 2,
    height: 1,
    terrain: [[floorCell(), playerLiftCell(0, false)]],
    actors: [
      { type: "player", x: 0, y: 0, elevation: 0, removed: false },
      { type: "gem", x: 1, y: 0, elevation: 0, removed: false }
    ]
  },
  [[1, 0], [-1, 0], [1, 0]],
  (engine, state, [r1, r2, r3]) => {
    console.log("m1 (onto lift):", r1.moved, "player elev:", undefined);
    console.log("m2 (off lift) moved:", r2.moved, "player x/elev:", state.actorX[0], state.actorElevation[0]);
    console.log("m3 (back on) moved:", r3.moved, "player x/elev:", state.actorX[0], state.actorElevation[0]);
    console.log("gem removed:", state.actorRemoved[1], "isSolved:", engine.isSolved(state));
    console.log("liftToggles m3:", JSON.stringify(r3.liftToggles));
  }
);
