// Repro: player stacked above a gem via editor cell ".+G+p"
// Verifies: (1) the authoring adapter emits gem@e0 + player@e1 with explicit
// elevations, (2) the engine then rejects every move from turn 0.
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");

global.window = {};
loadBrowserScript("public/maze-engine.js");
loadBrowserScript("public/author-play-data.js");

const { createEngine } = window.MazeEngine;

// Palette mirroring games/maze/toolbox.json + level_parsing.json tokens.
const authorData = {
  blockAdder: "+",
  defaultFloorToken: ".",
  game: { id: "maze" },
  palette: [
    { imageUrl: null, label: "Floor", name: "floor", token: "." },
    { imageUrl: null, label: "Player", name: "player", token: "p" },
    {
      imageUrl: "/assets/maze/images/gem.png",
      label: "Gem",
      modelUrl: "/assets/maze/assets_3d/gem.glb",
      name: "gem",
      token: "G"
    },
    { direction: "right", imageUrl: null, label: "Puncher", name: "puncher", token: "pr", type: "puncher" },
    { imageUrl: null, label: "Orange Button", name: "orange_button", token: "o", type: "orange_button" },
    { imageUrl: null, label: "Exit", name: "exit", token: "E", type: "exit" }
  ]
};

const adapter = window.AuthorPlayData.createAdapter(authorData);

function run(label, centerCell) {
  const playData = adapter.buildPlayData({
    cells: [
      [".", ".", "."],
      [".", centerCell, "."],
      [".", ".", "."]
    ],
    height: 3,
    width: 3,
    levelId: "__repro__"
  });

  console.log("=== " + label + " (cell: " + centerCell + ") ===");
  console.log(
    "actors emitted:",
    playData.actors.map((a) => `${a.type}@(${a.x},${a.y}) e${a.elevation}`)
  );

  const engine = createEngine(playData);
  const state = engine.cloneState(engine.initialState);
  const playerIndex = playData.actors.findIndex((a) => a.type === "player");

  console.log(
    "initial player elevation:",
    state.actorElevation[playerIndex],
    "pos:",
    state.actorX[playerIndex],
    state.actorY[playerIndex]
  );

  const dirs = [["R", 1, 0], ["L", -1, 0], ["D", 0, 1], ["U", 0, -1]];

  for (const [name, dx, dy] of dirs) {
    const s = engine.cloneState(state);
    const res = engine.move(s, dx, dy);
    let search = null;
    if (typeof engine.moveForSearch === "function") {
      const s2 = engine.cloneState(state);
      search = engine.moveForSearch(s2, dx, dy);
    }
    console.log(
      `move ${name}: moved=${res.moved}` +
        (search ? ` | moveForSearch: moved=${search.moved}` : "") +
        ` | player now (${s.actorX[playerIndex]},${s.actorY[playerIndex]}) e${s.actorElevation[playerIndex]}`
    );
  }

  console.log("isSolved:", engine.isSolved(state));
  console.log("");
}

// Main scenario from the finding: player dropped on a gem.
run("player over gem", ".+G+p");

// Control: player alone on floor (should move fine).
run("control: plain player", ".+p");

// Extra scenarios from the finding: player over puncher / orange button.
run("player over puncher", ".+pr+p");
run("player over orange button", ".+o+p");
