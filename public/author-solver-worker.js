// Editor solver worker: runs A*/BFS searches off the main thread so the
// editor never freezes and a run can be cancelled instantly (the host page
// terminates the worker). Loaded as a classic worker from the site root.
//
// Protocol
//   in : { type: "run", id, op: "solve" | "place_gem", playData, options }
//         options.solve     -> { algorithm, maxExpandedStates }
//         options.placeGem  -> { maxExpandedStates,
//                                surfaces: { valid: [], blocked: [], width, height } }
//   out: { type: "progress", id, expanded, maxExpanded }
//   out: { type: "done", id, result }
//   out: { type: "error", id, message }

self.window = self;
importScripts("maze-engine.js", "maze-solver.js");

const PROGRESS_POST_INTERVAL_MS = 66;

function createProgressPoster(id) {
  let lastPostAt = 0;

  return function postProgress(progress, force) {
    const now = Date.now();

    if (!force && now - lastPostAt < PROGRESS_POST_INTERVAL_MS) {
      return;
    }

    lastPostAt = now;
    self.postMessage({
      type: "progress",
      id,
      expanded: Math.max(0, progress?.expanded ?? 0),
      maxExpanded: Math.max(1, progress?.maxExpanded ?? 1)
    });
  };
}

function createGemSurfacePredicate(surfaces) {
  const validSurfaces = new Set(surfaces?.valid || []);
  const blockedSurfaces = new Set(surfaces?.blocked || []);
  const width = Math.max(0, Number(surfaces?.width) || 0);
  const height = Math.max(0, Number(surfaces?.height) || 0);

  return function canPlaceGemAt(x, y, elevation) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
      return false;
    }

    const key = x + "," + y + "," + Math.max(0, Math.floor(Number(elevation) || 0));
    return validSurfaces.has(key) && !blockedSurfaces.has(key);
  };
}

async function runJob(message) {
  const engine = self.MazeEngine.createEngine(message.playData);
  const options = message.options || {};
  const onProgress = createProgressPoster(message.id);

  if (message.op === "solve") {
    return self.MazeSolver.solveWithAStar(engine, {
      algorithm: options.algorithm,
      maxExpandedStates: options.maxExpandedStates,
      onProgress,
      progressYieldStateInterval: options.progressYieldStateInterval
    });
  }

  if (message.op === "place_gem") {
    return self.MazeSolver.findHardestGemPlacement(engine, {
      canPlaceGemAt: createGemSurfacePredicate(options.surfaces),
      maxExpandedStates: options.maxExpandedStates,
      onProgress,
      progressYieldStateInterval: options.progressYieldStateInterval
    });
  }

  throw new Error("Unknown solver worker op: " + message.op + ".");
}

self.onmessage = function (event) {
  const message = event.data || {};

  if (message.type !== "run") {
    return;
  }

  runJob(message)
    .then((result) => {
      self.postMessage({ type: "done", id: message.id, result });
    })
    .catch((error) => {
      self.postMessage({
        type: "error",
        id: message.id,
        message: error instanceof Error ? error.message : "Solver worker failed."
      });
    });
};
