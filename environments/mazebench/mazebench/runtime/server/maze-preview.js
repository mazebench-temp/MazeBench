const fs = require("fs");
const path = require("path");

function createMazePreviewService({ buildGameAssetUrl, ensureDirectory, gamesDir }) {
  function getMazePreviewFileName(fileName) {
    return `${path.parse(fileName).name}.png`;
  }

  function getMazePreviewsDir(gameId) {
    return path.join(gamesDir, String(gameId || ""), "previews");
  }

  function getMazePreviewFilePath(gameId, fileName) {
    return path.join(getMazePreviewsDir(gameId), getMazePreviewFileName(fileName));
  }

  function writeMazePreviewImageData(game, level, imageDataUrl) {
    const match = String(imageDataUrl || "").match(/^data:image\/png;base64,(.+)$/);

    if (!match) {
      throw new Error("Preview payload must be a PNG data URL.");
    }

    const previewBuffer = Buffer.from(match[1], "base64");

    if (previewBuffer.length === 0) {
      throw new Error("Preview payload is empty.");
    }

    if (previewBuffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Preview payload must be a PNG image.");
    }

    ensureDirectory(getMazePreviewsDir(game.id));
    const previewPath = getMazePreviewFilePath(game.id, level.fileName);
    fs.writeFileSync(previewPath, previewBuffer);
    return previewPath;
  }

  function buildMazePreviewData(game, fileName) {
    if (!game?.id || typeof fileName !== "string" || !fileName) {
      return {
        previewUrl: null
      };
    }

    const previewPath = getMazePreviewFilePath(game.id, fileName);

    if (!previewPath || !fs.existsSync(previewPath)) {
      return {
        previewUrl: null
      };
    }

    const previewVersion = Math.round(fs.statSync(previewPath).mtimeMs);

    return {
      previewUrl: `${buildGameAssetUrl(game.id, `previews/${getMazePreviewFileName(fileName)}`)}?v=${previewVersion}`
    };
  }

  return {
    buildMazePreviewData,
    getMazePreviewFileName,
    getMazePreviewFilePath,
    writeMazePreviewImageData
  };
}

module.exports = {
  createMazePreviewService
};
