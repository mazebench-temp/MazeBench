const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { collectedAllWorldGems } = require("../server/agent-runs");
const { createTrainingService } = require("../server/training");

const ROOT_DIR = path.resolve(__dirname, "..");

assert.equal(collectedAllWorldGems(1, 69), false);
assert.equal(collectedAllWorldGems(68, 69), false);
assert.equal(collectedAllWorldGems(69, 69), true);
assert.equal(collectedAllWorldGems(70, 69), true);
assert.equal(collectedAllWorldGems(1, null), false);

const service = createTrainingService({
  buildWorlds: { countWorldGems: () => 69 },
  getGame: () => ({ worldMap: { levels: new Array(256) } }),
  rootDir: ROOT_DIR,
  worldMaps: { defaultLevelIdForGame: () => "level_HxI" }
});
const toml = service.trainingConfigToml({
  name: "MazeBench smoke",
  model: "Qwen/Qwen3.5-0.8B",
  maxSteps: 10,
  batchSize: 32,
  rolloutsPerExample: 8,
  maxTokens: 1024,
  temperature: 1
});
assert.match(toml, /model = "Qwen\/Qwen3\.5-0\.8B"/);
assert.match(toml, /rollouts_per_example = 8/);
assert.match(toml, /\[\[env\]\]\nid = "mazebench\/mazebench"/);

const input = [
  { command: "observe" },
  { command: "move", direction: "right" },
  { command: "scorecard" },
  { command: "close" }
]
  .map((command) => JSON.stringify(command))
  .join("\n");
const output = execFileSync(
  process.execPath,
  [path.join(ROOT_DIR, "scripts", "maze-bridge.js"), "--level", "level_HxB", "--view", "top"],
  { cwd: ROOT_DIR, encoding: "utf8", input: `${input}\n` }
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
assert.equal(output[0].push_count, 0);
assert.equal(output[1].pushes_this_action, 19);
assert.equal(output[1].novel_push_count, 19);
assert.deepEqual(output[2].scorecard.blocks, { pushes: 19, novel_positions: 19 });

console.log("training tests passed");
