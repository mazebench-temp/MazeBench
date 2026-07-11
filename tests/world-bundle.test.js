const assert = require("node:assert/strict");
const { buildGameWorldBundle } = require("../server/app");

const bundle = buildGameWorldBundle("maze");
assert.equal(bundle.defaultLevelId, "level_HxI");
assert.equal(bundle.levels.length, 256);
assert.equal(Object.keys(bundle.levelStates).length, 256);
assert.equal(bundle.levels[0].column, "A");
assert.equal(bundle.levels[0].row, "A");
assert.equal(bundle.levelStates.level_HxI.levelId, "level_HxI");
assert.match(bundle.worldRevision, /^[a-f0-9]{64}$/);

console.log(`world-bundle: OK — canonical default world ${bundle.worldRevision.slice(0, 12)}.`);
