const assert = require("node:assert/strict");
const {
  centeredEdgeOpeningRange,
  defaultEditorState,
  defaultLevel
} = require("../shared/default-world-template");

assert.deepEqual(centeredEdgeOpeningRange(16), { start: 6, end: 9 });

const state = defaultEditorState({ height: 3, title: "Corridors", width: 3 });
assert.equal(state.title, "Corridors");
assert.equal(state.levels.length, 9);
assert.deepEqual(state.world, { height: 3, width: 3 });

for (const level of state.levels) {
  assert.equal(level.width, 16);
  assert.equal(level.height, 16);
  assert.equal(level.cells.length, 16);
  assert.ok(level.cells.every((row) => row.length === 16));
  assert.equal(level.cells[7][7], ".+p");

  const columnIndex = level.column.charCodeAt(0) - 65;
  const rowIndex = level.row.charCodeAt(0) - 65;
  const expectedTop = rowIndex > 0 ? [6, 7, 8, 9] : [];
  const expectedBottom = rowIndex < 2 ? [6, 7, 8, 9] : [];
  const expectedLeft = columnIndex > 0 ? [6, 7, 8, 9] : [];
  const expectedRight = columnIndex < 2 ? [6, 7, 8, 9] : [];
  const openings = (values) =>
    values.map((value, index) => (value === "." ? index : -1)).filter((index) => index >= 0);

  assert.deepEqual(openings(level.cells[0]), expectedTop);
  assert.deepEqual(openings(level.cells[15]), expectedBottom);
  assert.deepEqual(openings(level.cells.map((row) => row[0])), expectedLeft);
  assert.deepEqual(openings(level.cells.map((row) => row[15])), expectedRight);

  level.cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      if (cell === ".+p") return;
      assert.ok(cell === "." || (border && cell === ".+#"));
    });
  });
}

const center = defaultLevel({ column: "B", row: "B", worldWidth: 3, worldHeight: 3 });
assert.deepEqual(center.cells[0].slice(6, 10), Array(4).fill("."));
assert.deepEqual(center.cells[15].slice(6, 10), Array(4).fill("."));
assert.deepEqual(center.cells.slice(6, 10).map((row) => row[0]), Array(4).fill("."));
assert.deepEqual(center.cells.slice(6, 10).map((row) => row[15]), Array(4).fill("."));

console.log("default-world-template: OK — floored rooms share four-tile corridors.");
