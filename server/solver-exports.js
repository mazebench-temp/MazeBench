const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const SOLUTION_PATH_PATTERN = /^[UDLR]*$/;
const SOLUTION_PATH_MAX_LENGTH = 10000;
const SOLUTION_PLAY_DATA_MAX_BYTES = 4 * 1024 * 1024;
const SOLUTION_EXPORT_FORMATS = new Set(["gif", "mp4"]);

function normalizeSolutionExportRequest(payload, requestedFormat) {
  const format = String(requestedFormat || "mp4").trim().toLowerCase();
  if (!SOLUTION_EXPORT_FORMATS.has(format)) {
    throw new Error("Solution export format must be mp4 or gif.");
  }

  const solutionPath = String(payload?.path ?? "").trim().toUpperCase();
  if (
    solutionPath.length > SOLUTION_PATH_MAX_LENGTH ||
    !SOLUTION_PATH_PATTERN.test(solutionPath)
  ) {
    throw new Error("Solution path must contain only U, D, L, and R moves.");
  }

  const playData = payload?.playData;
  if (!playData || typeof playData !== "object" || Array.isArray(playData)) {
    throw new Error("Solution export needs a play-mode room snapshot.");
  }

  const width = Number(playData.width);
  const height = Number(playData.height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 256 ||
    height > 256 ||
    !Array.isArray(playData.terrain) ||
    !Array.isArray(playData.actors)
  ) {
    throw new Error("Solution export room snapshot is invalid.");
  }

  const serializedPlayData = JSON.stringify(playData);
  if (Buffer.byteLength(serializedPlayData, "utf8") > SOLUTION_PLAY_DATA_MAX_BYTES) {
    throw new Error("Solution export room snapshot is too large.");
  }

  return {
    format,
    path: solutionPath,
    playData: JSON.parse(serializedPlayData)
  };
}

function safeExportNamePart(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function solutionExportFileName(gameId, levelId, format) {
  return [
    safeExportNamePart(gameId, "maze"),
    safeExportNamePart(levelId, "level"),
    "solution"
  ].join("-") + `.${format}`;
}

function createSolverExportService({ env = process.env, rootDir }) {
  const exportScript = path.join(rootDir, "scripts", "maze-export-solution.js");

  async function render({ format, gameId, levelId, payload }) {
    const request = normalizeSolutionExportRequest(payload, format);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mazebench-solver-export-"));
    const inputPath = path.join(outputDir, "solution.json");
    const fileName = solutionExportFileName(gameId, levelId, request.format);
    const filePath = path.join(outputDir, fileName);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      fs.rmSync(outputDir, { force: true, recursive: true });
    };

    fs.writeFileSync(
      inputPath,
      `${JSON.stringify({
        gameId,
        levelId,
        path: request.path,
        playData: request.playData
      })}\n`,
      "utf8"
    );

    try {
      await execFileAsync(
        process.execPath,
        [exportScript, inputPath, outputDir, request.format, fileName],
        {
          cwd: rootDir,
          env,
          maxBuffer: 4 * 1024 * 1024,
          timeout: 12 * 60 * 1000
        }
      );

      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        throw new Error("Solution renderer did not create a downloadable file.");
      }

      return {
        cleanup,
        contentType: request.format === "gif" ? "image/gif" : "video/mp4",
        fileName,
        filePath,
        format: request.format
      };
    } catch (error) {
      cleanup();
      const stderr = String(error?.stderr || "").trim();
      const message = stderr || (error instanceof Error ? error.message : String(error));
      throw new Error(`Could not render the solution ${request.format.toUpperCase()}: ${message}`);
    }
  }

  return { render };
}

module.exports = {
  createSolverExportService,
  normalizeSolutionExportRequest,
  solutionExportFileName
};
