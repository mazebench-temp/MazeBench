// Repro: slope-exit push during a box slide hardcodes budget 1 (maze-engine.js:2877)
const { loadBrowserScript } = require("/Users/jpappas/code/GitHub/PixelGameTest/tests/helpers/browser-module-loader");
global.window = {};
loadBrowserScript("public/maze-engine.js");
const { createEngine } = window.MazeEngine;

const floor = () => ({ type: "floor" });
const ice = () => ({ type: "ice", layers: [{ type: "ice", elevation: 0 }] });
const slopeR = () => ({ type: "ice_slope", layers: [{ type: "ice_slope", direction: "right", elevation: 0 }] });
const wall1 = () => ({ type: "wall", layers: [{ type: "wall", elevation: 0 }] });

function run(label, terrainRow, actors) {
  const engine = createEngine({
    width: terrainRow.length,
    height: 1,
    terrain: [terrainRow],
    actors
  });
  const state = engine.cloneState(engine.initialState);
  const result = engine.move(state, 1, 0);
  const positions = actors.map((a, i) =>
    `${a.type}#${i}@(${state.actorX[i]},${state.actorY[i]},e${state.actorElevation[i]})`
  );
  console.log(`${label}: moved=${result.moved}`);
  console.log(`  final: ${positions.join(" ")}`);
  return { result, state };
}

const P = (x) => ({ type: "player", x, y: 0, elevation: 0, removed: false });
const B = (x, e = 0) => ({ type: "box", x, y: 0, elevation: e, removed: false });

console.log("=== F1: 3 players push box across ice into slope; 2-box chain at slope exit ===");
// x: 0=P 1=P 2=P 3=box 4=ice 5=slope-right 6=wall1+box@e1 7=wall1+box@e1 8=wall1(empty)
const f1 = run(
  "F1 (sliding box vs 2-box chain, 3-player train)",
  [floor(), floor(), floor(), floor(), ice(), slopeR(), wall1(), wall1(), wall1()],
  [P(0), P(1), P(2), B(3), B(6, 1), B(7, 1)]
);

console.log("\n=== C1: same 3 players stand directly at slope, same 2-box chain ===");
// x: 0=P 1=P 2=P 3=slope-right 4=wall1+box@e1 5=wall1+box@e1 6=wall1(empty)
const c1 = run(
  "C1 (players directly at slope vs 2-box chain)",
  [floor(), floor(), floor(), slopeR(), wall1(), wall1(), wall1()],
  [P(0), P(1), P(2), B(4, 1), B(5, 1)]
);

console.log("\n=== C2: sliding box vs SINGLE box at slope exit (budget 1 suffices) ===");
// x: 0=P 1=P 2=P 3=box 4=ice 5=slope-right 6=wall1+box@e1 7=wall1(empty)
const c2 = run(
  "C2 (sliding box vs 1 blocker)",
  [floor(), floor(), floor(), floor(), ice(), slopeR(), wall1(), wall1()],
  [P(0), P(1), P(2), B(3), B(6, 1)]
);

console.log("\n=== C3: sanity — sliding box, empty slope exit ===");
const c3 = run(
  "C3 (sliding box, no blockers)",
  [floor(), floor(), floor(), floor(), ice(), slopeR(), wall1(), wall1()],
  [P(0), P(1), P(2), B(3)]
);

console.log("\n=== C4: 1 player directly at slope vs 2-box chain (budget=1 direct) ===");
const c4 = run(
  "C4 (single player vs 2-box chain)",
  [floor(), slopeR(), wall1(), wall1(), wall1()],
  [P(0), B(2, 1), B(3, 1)]
);

console.log("\n--- summary ---");
console.log("F1 moved (finding says false):", f1.result.moved);
console.log("C1 moved (finding says true):", c1.result.moved);
console.log("C2 moved (expect true):", c2.result.moved);
console.log("C3 moved (expect true):", c3.result.moved);
console.log("C4 moved (expect false, 1 player insufficient):", c4.result.moved);

console.log("\n=== S3a: box STARTS on ice; 2-box chain at slope exit; 3 players ===");
// x: 0=P 1=P 2=P 3=ice(box) 4=ice 5=slope-right 6=wall1+box@e1 7=wall1+box@e1 8=wall1(empty)
const s3a = run(
  "S3a (box on ice, 3-player train, 2-box chain)",
  [floor(), floor(), floor(), ice(), ice(), slopeR(), wall1(), wall1(), wall1()],
  [P(0), P(1), P(2), B(3), B(6, 1), B(7, 1)]
);
console.log("S3a moved:", s3a.result.moved);
console.log("S3a moves:", JSON.stringify(s3a.result.moves ? s3a.result.moves.map(m => ({i: m.actorIndex, t: m.actorType, from: [m.fromX, m.fromY, m.fromElevation], to: [m.toX, m.toY, m.toElevation]})) : null));
