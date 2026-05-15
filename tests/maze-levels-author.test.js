const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMazeLevelService } = require("../server/maze-levels");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-game-author-"));
const gamesDir = path.join(tempRoot, "games");
const levelDir = path.join(gamesDir, "maze", "levels");

fs.mkdirSync(levelDir, { recursive: true });

const game = {
  id: "maze",
  levels: [],
  levelFiles: ["test-empty.txt"],
  parser: {
    rules: {
      block_adder: "+",
      separator: " "
    },
    objects: {
      floor: { token: "." },
      wall: { token: "#" },
      ice: { token: "i" }
    }
  },
  worldMap: {
    byPosition: new Map([
      [
        "level_AxA",
        {
          fileName: "test-empty.txt",
          id: "level_AxA",
          label: "Level AxA"
        }
      ]
    ])
  }
};

fs.writeFileSync(path.join(levelDir, "test-empty.txt"), "+ . +++#\n", "utf8");

const service = createMazeLevelService({
  buildGameAssetUrl: () => "",
  buildMazeFallbackLevelFileName: () => "fallback.txt",
  buildMazePreviewData: () => ({ previewUrl: null }),
  buildMazeWorldLevel: (levelId, options = {}) => ({
    fileName: options.fileName || "fallback.txt",
    id: levelId,
    label: levelId
  }),
  buildMazeWorldMapState: () => ({}),
  defaultLevelIdForGame: () => "level_AxA",
  gamesDir,
  isMazeWorldLevelId: (levelId) => /^level_[A-Z]x[A-Z]$/.test(levelId),
  listTopLevelFiles: () => [],
  loadJson: () => ({}),
  loadText: (filePath, fallback) => fs.readFileSync(filePath, "utf8") || fallback,
  mazeAuthorDefaultHeight: 1,
  mazeAuthorDefaultWidth: 3,
  mazeDefaultLevelId: "level_AxA",
  mazeLevelGridHeight: 16,
  mazeLevelGridWidth: 16,
  mazeLevelLabel: (levelId) => levelId,
  mazeWorldConfig: {
    cameraView: { width: 3, height: 1 },
    worldColumns: ["A"],
    worldRows: ["A"]
  },
  resolveGameAssetPath: () => null,
  rootDir: tempRoot,
  titleCase: (value) => String(value)
});

const editorState = service.getLevelEditorState(game, game.worldMap.byPosition.get("level_AxA"));

assert.deepEqual(editorState.cells[0].slice(0, 3), ["+", ".", "+++#"]);
assert.equal(editorState.rawText, "+ . +++#");

const sanitized = service.sanitizeEditorPayload(game, {
  cells: [["+", ".", "+++#"]],
  height: 1,
  width: 3
});

assert.deepEqual(sanitized.cells[0], ["+", ".", "+++#"]);
assert.equal(sanitized.rawText, "+ . +++#");

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log("maze author level serialization tests passed");
