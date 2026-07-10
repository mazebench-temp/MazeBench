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
  temperature: 1,
  startLevelId: "level_HxI",
  gameWonGemCount: 69,
  rewards: { gems: 1, rooms: 0.1, pushes: 0.05 },
  maxActions: 256,
  observationMode: "ascii"
});
assert.match(toml, /model = "Qwen\/Qwen3\.5-0\.8B"/);
assert.match(toml, /rollouts_per_example = 8/);
assert.match(toml, /\[\[env\]\]\nid = "mazebench\/mazebench"/);
assert.match(toml, /\[env\.args\]/);
assert.match(toml, /game_won_gem_count = 69/);
assert.match(toml, /push_reward_weight = 0\.05/);
assert.match(toml, /max_actions = 256/);
assert.match(toml, /allow_quit = false/);
assert.match(toml, /observation_mode = "ascii"/);
const parsedToml = JSON.parse(
  execFileSync(
    "python3",
    ["-c", "import json,sys,tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))"],
    { encoding: "utf8", input: toml }
  )
);
assert.equal(parsedToml.env[0].id, "mazebench/mazebench");
assert.deepEqual(parsedToml.env[0].args, {
  num_train_examples: 1,
  num_eval_examples: 1,
  start_level_id: "level_HxI",
  game_won_gem_count: 69,
  gem_reward_weight: 1,
  room_reward_weight: 0.1,
  push_reward_weight: 0.05,
  max_actions: 256,
  allow_quit: false,
  observation_mode: "ascii"
});

const legacyProbe = execFileSync(
  "uv",
  [
    "run",
    "--project",
    path.join(ROOT_DIR, "environments", "mazebench"),
    "python",
    "-c",
    [
      "import verifiers",
      "env=verifiers.load_environment('mazebench', max_actions=1, allow_quit=False)",
      "assert env.env_id == 'mazebench'",
      "assert env.__class__.__name__ == 'LegacyMazeEnv'",
      "assert len(env.get_dataset(-1)) == 1",
      "print('legacy hosted adapter ready')"
    ].join("; ")
  ],
  { cwd: ROOT_DIR, encoding: "utf8" }
);
assert.match(legacyProbe, /legacy hosted adapter ready/);

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
