// Synthetic benchmark levels for the MazeBench engine/solver.
// Terrain cells: { type, layers?: [{ type, elevation, direction?, raised? }] }

function grid(width, height, fill = "floor") {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: fill }))
  );
}

function set(terrain, x, y, cell) {
  terrain[y][x] = cell;
}

function wall() {
  return { type: "wall", layers: [{ type: "wall", elevation: 0 }] };
}

function ice() {
  return { type: "ice" };
}

function slope(direction) {
  return { type: "ice_slope", layers: [{ type: "ice_slope", direction, elevation: 0 }] };
}

function lift(raised = false) {
  return {
    type: "player_lift",
    layers: [{ type: "player_lift", elevation: 0, raised }],
    raised
  };
}

function orangeButton() {
  // floor underlay so actors pushed onto the button have support
  return {
    type: "orange_button",
    layers: [
      { type: "floor", elevation: 0 },
      { type: "orange_button", elevation: 0 }
    ]
  };
}

function orangeWall() {
  return { type: "orange_wall", layers: [{ type: "orange_wall", elevation: 0 }] };
}

// ---------------------------------------------------------------------------
// Small: 10x10, player + 3 boxes + ice patch + gem.
// ---------------------------------------------------------------------------
function smallLevel() {
  const width = 10;
  const height = 10;
  const terrain = grid(width, height);
  // border-ish walls to constrain the space a bit
  for (let x = 3; x <= 6; x += 1) set(terrain, x, 3, wall());
  for (let y = 5; y <= 7; y += 1) set(terrain, 2, y, wall());
  // ice patch in the middle-right
  for (let y = 4; y <= 7; y += 1) {
    for (let x = 5; x <= 8; x += 1) set(terrain, x, y, ice());
  }
  // pocket around the gem: only entry is from below (8,9) -> up
  set(terrain, 7, 7, wall());
  set(terrain, 8, 7, wall());
  set(terrain, 9, 7, wall());
  set(terrain, 7, 8, wall());
  const actors = [
    { type: "player", x: 0, y: 0, removed: false },
    { type: "box", x: 3, y: 1, removed: false },
    { type: "box", x: 4, y: 5, removed: false },
    { type: "box", x: 6, y: 6, removed: false },
    { type: "gem", x: 8, y: 8, removed: false }
  ];
  return { width, height, terrain, actors };
}

// ---------------------------------------------------------------------------
// Medium: 20x20, ~10 boxes, ice field, 2 slopes, orange button + wall, puncher.
// ---------------------------------------------------------------------------
function mediumLevel() {
  const width = 20;
  const height = 20;
  const terrain = grid(width, height);
  // interior wall segments
  for (let x = 4; x <= 12; x += 1) set(terrain, x, 4, wall());
  for (let y = 8; y <= 14; y += 1) set(terrain, 15, y, wall());
  for (let x = 2; x <= 7; x += 1) set(terrain, x, 12, wall());
  // ice field
  for (let y = 6; y <= 11; y += 1) {
    for (let x = 8; x <= 13; x += 1) set(terrain, x, y, ice());
  }
  // two ice slopes at the edge of the field
  set(terrain, 7, 8, slope("right"));
  set(terrain, 14, 9, slope("left"));
  // sealed gem room in the bottom-right corner: walls on y=15 (x=15..19) and
  // x=15 (y=16..19), with the ONLY entrance an orange wall at (15,17).
  // Opening it requires pushing the box at (5,15) down onto the button at (5,16).
  for (let x = 15; x <= 19; x += 1) set(terrain, x, 15, wall());
  for (let y = 16; y <= 19; y += 1) set(terrain, 15, y, wall());
  set(terrain, 15, 17, orangeWall());
  set(terrain, 5, 16, orangeButton());
  const actors = [
    { type: "player", x: 1, y: 1, removed: false },
    { type: "box", x: 3, y: 2, removed: false },
    { type: "box", x: 6, y: 6, removed: false },
    { type: "box", x: 10, y: 13, removed: false },
    { type: "box", x: 12, y: 15, removed: false },
    { type: "box", x: 2, y: 8, removed: false },
    { type: "box", x: 17, y: 5, removed: false },
    { type: "box", x: 18, y: 12, removed: false },
    { type: "box", x: 5, y: 15, removed: false }, // pushable onto orange button
    { type: "box", x: 9, y: 17, removed: false },
    { type: "box", x: 13, y: 3, removed: false },
    { type: "puncher", direction: "right", x: 3, y: 18, elevation: 0, removed: false },
    { type: "gem", x: 18, y: 17, removed: false }
  ];
  return { width, height, terrain, actors };
}

// ---------------------------------------------------------------------------
// Large: 40x40, ~25 boxes, big ice regions, slopes, lifts, 2 clones.
// ---------------------------------------------------------------------------
function largeLevel() {
  const width = 40;
  const height = 40;
  const terrain = grid(width, height);
  // long wall segments creating rooms
  for (let x = 5; x <= 30; x += 1) set(terrain, x, 10, wall());
  for (let y = 12; y <= 30; y += 1) set(terrain, 20, y, wall());
  for (let x = 25; x <= 38; x += 1) set(terrain, x, 25, wall());
  // gaps
  set(terrain, 18, 10, { type: "floor" });
  set(terrain, 20, 20, { type: "floor" });
  set(terrain, 32, 25, { type: "floor" });
  // big ice regions
  for (let y = 2; y <= 8; y += 1) {
    for (let x = 24; x <= 36; x += 1) set(terrain, x, y, ice());
  }
  for (let y = 26; y <= 36; y += 1) {
    for (let x = 4; x <= 15; x += 1) set(terrain, x, y, ice());
  }
  for (let y = 14; y <= 20; y += 1) {
    for (let x = 28; x <= 36; x += 1) set(terrain, x, y, ice());
  }
  // slopes
  set(terrain, 23, 5, slope("right"));
  set(terrain, 37, 4, slope("left"));
  set(terrain, 3, 30, slope("right"));
  set(terrain, 16, 32, slope("left"));
  // lifts
  set(terrain, 12, 12, lift(false));
  set(terrain, 30, 30, lift(false));
  // sealed gem room bottom-right: walls on y=35 (x=34..39) and x=34 (y=36..39),
  // single plain-floor opening at (34,37) reachable only by looping around.
  for (let x = 34; x <= 39; x += 1) set(terrain, x, 35, wall());
  for (let y = 36; y <= 39; y += 1) set(terrain, 34, y, wall());
  set(terrain, 34, 37, { type: "floor" });
  const actors = [
    { type: "player", x: 1, y: 1, removed: false },
    { type: "clone", groupId: "c0", x: 38, y: 1, removed: false },
    { type: "clone", groupId: "c1", x: 1, y: 38, removed: false },
    { type: "gem", x: 38, y: 38, removed: false }
  ];
  // ~25 boxes scattered deterministically, away from walls/slopes/lifts
  const boxSpots = [
    [3, 3], [7, 2], [11, 5], [15, 3], [19, 6], [23, 12], [9, 8], [2, 14],
    [6, 16], [10, 18], [14, 15], [17, 22], [3, 22], [8, 23], [13, 24],
    [22, 16], [25, 18], [27, 12], [33, 12], [36, 22], [24, 28], [28, 33],
    [33, 30], [36, 32], [22, 36]
  ];
  for (const [x, y] of boxSpots) {
    actors.push({ type: "box", x, y, removed: false });
  }
  return { width, height, terrain, actors };
}

module.exports = { smallLevel, mediumLevel, largeLevel };
