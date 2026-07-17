// Can the EDITOR pipeline (author-play-data.js) actually produce an actor
// hovering over an empty/void cell, and does the engine then leave it there?
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/author-play-data.js");
loadBrowserScript("public/maze-engine.js");
const { createEngine, terrainTypes } = window.MazeEngine;

// Palette mirroring games/maze tokens (level_parsing.json / toolbox.json)
const authorData = {
  blockAdder: "+",
  defaultFloorToken: ".",
  game: { id: "maze" },
  palette: [
    { label: "Floor", name: "floor", token: "." },
    { label: "Wall", name: "wall", token: "#" },
    { label: "Player", name: "player", token: "p" },
    { label: "Gem", name: "gem", token: "G" },
    { label: "Floating Floor", name: "floating_floor", token: "f", type: "floating_floor" },
    { label: "Box", name: "box", token: "b", type: "box" },
    { label: "Weightless Box", name: "weightless_box", token: "M1", type: "weightless_box" }
  ]
};

const adapter = window.AuthorPlayData.createAdapter(authorData);

function show(label, playData) {
  console.log(label);
  console.log(
    "  terrain row0:",
    playData.terrain[0].map((c) => `${c.type}[${(c.layers || []).map((l) => l.type + "@" + l.elevation).join(",")}]`).join(" | ")
  );
  console.log(
    "  actors:",
    playData.actors.map((a) => `${a.type}@(${a.x},${a.y}) elev=${a.elevation ?? "n/a"}`).join(" ; ")
  );
}

console.log("=== 1: paint 'f' directly on an erased cell ('+') ===");
{
  const appended = adapter.appendCellToken("+", "f");
  console.log("  cell value after paint:", JSON.stringify(appended));
  const playData = adapter.buildPlayData({
    cells: [["p", appended, "."]],
    width: 3,
    height: 1
  });
  show("  playData:", playData);
}

console.log("\n=== 2: floating_floor authored on wall, then wall erased at elevation 0 ===");
{
  const stacked = "#+f"; // wall with floating floor on top
  const erased = adapter.eraseCellElevationValue(stacked, 0);
  console.log("  cell value after erasing wall layer:", JSON.stringify(erased));
  const playData = adapter.buildPlayData({
    cells: [["p", erased, "."]],
    width: 3,
    height: 1
  });
  show("  playData:", playData);

  const engine = createEngine(playData);
  const state = engine.cloneState(engine.initialState);
  console.log(
    "  ENGINE initial: ffloor removed =",
    state.actorRemoved[1],
    "| terrain(1,0) byte =",
    state.terrain[1],
    "(empty=0, floor=1)"
  );

  // Push it right onto the floor at (2,0): can it escape the void?
  const res = engine.move(state, 1, 0);
  console.log(
    "  after push right: moved =", res.moved,
    "| ffloor pos=(", state.actorX[1] + "," + state.actorY[1], ") removed =", state.actorRemoved[1]
  );
}

console.log("\n=== 3: same but weightless box M1 on erased-out wall ===");
{
  const erased = adapter.eraseCellElevationValue("#+M1", 0);
  console.log("  cell value:", JSON.stringify(erased));
  const playData = adapter.buildPlayData({
    cells: [["p", erased, "."]],
    width: 3,
    height: 1
  });
  show("  playData:", playData);
  const engine = createEngine(playData);
  const state = engine.cloneState(engine.initialState);
  console.log(
    "  ENGINE initial: M1 removed =", state.actorRemoved[1],
    "elev =", state.actorElevation[1],
    "| terrain(1,0) byte =", state.terrain[1]
  );
}

console.log("\n=== 4: control — push floating_floor into the SAME void produced by the editor ===");
{
  // player, ffloor on floor, void cell from erased wall, floor
  const voidCell = adapter.eraseCellElevationValue("#", 0);
  console.log("  erased bare wall cell value:", JSON.stringify(voidCell));
  const playData = adapter.buildPlayData({
    cells: [["p", "f", voidCell === "#" ? "+" : voidCell, "."]],
    width: 4,
    height: 1
  });
  show("  playData:", playData);
  const engine = createEngine(playData);
  const state = engine.cloneState(engine.initialState);
  const res = engine.move(state, 1, 0);
  console.log(
    "  after push: moved =", res.moved,
    "| ffloor removed =", state.actorRemoved[1],
    "| terrain(2,0) byte =", state.terrain[2],
    "-> filled to floor?", state.terrain[2] === terrainTypes.floor
  );
}
