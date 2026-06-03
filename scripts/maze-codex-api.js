#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const readline = require("node:readline");

const ROOT_DIR = path.resolve(__dirname, "..");
const bridgeScript = path.join(ROOT_DIR, "scripts", "maze-bridge.js");
const promptDir = path.join(ROOT_DIR, "prompts", "maze-codex");
const defaultStateDir = path.join(ROOT_DIR, "outputs", "maze-codex");
const latestSessionFile = "latest-session.txt";
const VIEW_NAMES = new Set(["top", "top-diagonal", "diagonal", "side-diagonal", "side"]);
const DIRECTIONS = new Set(["up", "down", "left", "right"]);
const MUTATING_COMMANDS = new Set([
  "goto_level",
  "move",
  "quit",
  "reset_level",
  "rotate_camera",
  "undo"
]);

function usage() {
  return `Usage: npm run maze:codex -- <command> [args] [options]

Commands:
  start                  Start a new persistent game session.
  prompt [name]          Print a rendered Codex prompt.
  observe                Re-render the current session.
  up|down|left|right     Move one screen-relative step.
  move <direction>       Move one screen-relative step.
  rotate <direction>     Rotate camera up/down/left/right.
  undo                   Undo the most recent movement action.
  reset                  Reset the current room.
  goto <X> <Y>           Jump to a previously visited room.
  scorecard              Print the current scorecard.
  quit                   End the run as a loss and print scorecard.
  video                  Export replay sidecars and optionally render MP4.
  list                   List saved Codex maze sessions.

Options:
  --session <id|path>    Session id or JSON path. Defaults to latest session.
  --state-dir <path>     Session directory. Defaults to outputs/maze-codex.
  --prompt <name|path>   Prompt file name from prompts/maze-codex or path.
  --level <id>           Start level, e.g. level_HxI or HxI. start only.
  --view <name>          top, top-diagonal, diagonal, side-diagonal, side.
  --yaw <0-3>            Initial camera yaw. start only.
  --target-gems <n>      Prompt target. start only.
  --game-won-gems <n>    Unique gems required for game_won. start only.
  --max-turns <n>        Action budget shown to Codex. start only.
  --out-dir <path>       Replay export directory. video only.
  --video                Render MP4 without asking. video only.
  --no-video             Export JSON/TXT sidecars only. video only.
  --fps <n>              Replay video FPS. video only.
  --width <px>           Replay video width. video only.
  --height <px>          Replay video height. video only.
  --fast                 Render settled states only. video only.
  --draft                Lower DPR and disable effects. video only.
  --json                 Print raw JSON instead of text.
  --force                Overwrite an existing named session on start.
`;
}

function parseArgs(argv) {
  const command = argv[0] || "help";
  const options = {
    command,
    force: false,
    json: false,
    positional: [],
    stateDir: defaultStateDir,
    video: null
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--video") {
      options.video = true;
    } else if (arg === "--no-video") {
      options.video = false;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--session") {
      options.session = next();
    } else if (arg === "--state-dir") {
      options.stateDir = path.resolve(next());
    } else if (arg === "--prompt") {
      options.prompt = next();
    } else if (arg === "--level") {
      options.level = next();
    } else if (arg === "--view") {
      options.view = next();
    } else if (arg === "--yaw") {
      options.yaw = next();
    } else if (arg === "--target-gems") {
      options.targetGems = next();
    } else if (arg === "--game-won-gems" || arg === "--game-won-gem-count") {
      options.gameWonGemCount = next();
    } else if (arg === "--max-turns") {
      options.maxTurns = next();
    } else if (arg === "--out-dir") {
      options.outDir = path.resolve(next());
    } else if (arg === "--fps") {
      options.fps = Number(next());
    } else if (arg === "--width") {
      options.width = Number(next());
    } else if (arg === "--height") {
      options.height = Number(next());
    } else if (arg === "--fast" || arg === "--fast-render") {
      options.fast = true;
    } else if (arg === "--no-fast") {
      options.fast = false;
    } else if (arg === "--draft" || arg === "--draft-render") {
      options.draft = true;
    } else if (arg === "--no-draft") {
      options.draft = false;
    } else if (arg === "--node-bin") {
      options.nodeBin = next();
    } else if (arg === "--help" || arg === "-h") {
      options.command = "help";
    } else {
      options.positional.push(arg);
    }
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeLevelId(value) {
  const raw = String(value || "level_HxI").trim();
  const match = raw.match(/^(?:level_)?([A-Z])x([A-Z])$/i);
  return match ? `level_${match[1].toUpperCase()}x${match[2].toUpperCase()}` : raw;
}

function normalizeView(value) {
  const view = String(value || "top-diagonal").trim().toLowerCase();
  return VIEW_NAMES.has(view) ? view : "top-diagonal";
}

function normalizeYaw(value) {
  const number = Number(value);
  const integer = Number.isInteger(number) ? number : 0;
  return ((integer % 4) + 4) % 4;
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function nonnegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function slug(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "maze-codex";
}

function defaultSessionId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  return `maze-${stamp}`;
}

function latestPath(stateDir) {
  return path.join(stateDir, latestSessionFile);
}

function resolveSessionPath(stateDir, sessionValue) {
  if (sessionValue) {
    const raw = String(sessionValue);
    if (raw.includes("/") || raw.endsWith(".json")) {
      return path.resolve(raw);
    }
    return path.join(stateDir, `${slug(raw)}.json`);
  }

  const pointer = latestPath(stateDir);
  if (!fs.existsSync(pointer)) {
    throw new Error("No latest maze Codex session found. Run `npm run maze:codex -- start` first.");
  }

  const stored = fs.readFileSync(pointer, "utf8").trim();
  if (!stored) {
    throw new Error("Latest maze Codex session pointer is empty. Start a new session.");
  }
  return path.resolve(stored);
}

function writeLatestSession(stateDir, sessionPath) {
  ensureDir(stateDir);
  fs.writeFileSync(latestPath(stateDir), `${path.resolve(sessionPath)}\n`);
}

function readSession(sessionPath) {
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  session.path = sessionPath;
  session.actions = Array.isArray(session.actions) ? session.actions : [];
  return session;
}

function sessionReplayDir(sessionPath, outDir = "") {
  if (outDir) {
    return path.resolve(outDir);
  }

  const parsed = path.parse(sessionPath);
  return path.join(parsed.dir, `${parsed.name}-replay`);
}

function writeSession(sessionPath, session) {
  const saved = { ...session };
  delete saved.path;
  saved.updatedAt = new Date().toISOString();
  ensureDir(path.dirname(sessionPath));
  fs.writeFileSync(sessionPath, `${JSON.stringify(saved, null, 2)}\n`);
}

function withSessionLock(sessionPath, fn) {
  const lockPath = `${sessionPath}.lock`;
  let fd = null;

  try {
    fd = fs.openSync(lockPath, "wx");
  } catch (error) {
    if (error && error.code === "EEXIST") {
      throw new Error(`Session is locked by another maze API command: ${lockPath}`);
    }
    throw error;
  }

  try {
    return fn();
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Best effort cleanup. A stale lock can be removed manually.
    }
  }
}

function bridgeArgs(session) {
  const options = session.options || {};
  const args = [
    bridgeScript,
    "--game",
    options.gameId || "maze",
    "--level",
    normalizeLevelId(options.levelId),
    "--view",
    normalizeView(options.view),
    "--yaw",
    String(normalizeYaw(options.yaw)),
    "--game-won-gem-count",
    String(positiveInt(options.gameWonGemCount, 100))
  ];
  return args;
}

function runBridge(session, message) {
  const replayMessages = session.actions
    .filter((action) => action && action.message && action.replay !== false)
    .map((action) => action.message);
  const messages = [...replayMessages, message, { command: "close" }];
  const input = `${messages.map((item) => JSON.stringify(item)).join("\n")}\n`;
  const nodeBin = session.options?.nodeBin || process.execPath;
  const result = spawnSync(nodeBin, bridgeArgs(session), {
    cwd: ROOT_DIR,
    encoding: "utf8",
    input,
    maxBuffer: 80 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "").trim() || `maze bridge exited ${result.status}`);
  }

  const lines = String(result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const responses = lines.map((line) => JSON.parse(line));
  const previousFailure = responses.slice(0, replayMessages.length).find((response) => !response.ok);

  if (previousFailure) {
    throw new Error(`Replay failed before requested command: ${previousFailure.error || "unknown error"}`);
  }

  const response = responses[replayMessages.length];
  if (!response) {
    throw new Error("maze bridge returned no response for requested command");
  }
  return response;
}

function promptPath(value) {
  const name = value || "default";
  if (String(name).includes("/") || String(name).endsWith(".md")) {
    return path.resolve(name);
  }
  return path.join(promptDir, `${name}.md`);
}

function readPrompt(value) {
  const filePath = promptPath(value);
  return {
    path: filePath,
    text: fs.readFileSync(filePath, "utf8").trimEnd()
  };
}

function renderTemplate(text, values) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(String(value || "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDimensions(value, fallback) {
  const match = String(value || "").trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);

  if (!match) {
    return fallback;
  }

  return {
    height: parsePositiveInteger(match[2], fallback.height),
    width: parsePositiveInteger(match[1], fallback.width)
  };
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function replayVideoOverrides(options = {}) {
  const overrides = {};

  if (Number.isFinite(options.fps) && options.fps > 0) {
    overrides.fps = options.fps;
  }

  if (Number.isFinite(options.width) && options.width > 0) {
    overrides.width = options.width;
  }

  if (Number.isFinite(options.height) && options.height > 0) {
    overrides.height = options.height;
  }

  if (typeof options.fast === "boolean") {
    overrides.fast = options.fast;
  }

  if (typeof options.draft === "boolean") {
    overrides.draft = options.draft;
  }

  return overrides;
}

async function promptReplayVideoOptions(options = {}) {
  const { defaultReplayOptions } = require("./maze-export-replay");
  const defaults = {
    ...defaultReplayOptions(),
    ...replayVideoOverrides(options)
  };

  const hasFullOverrides =
    options.video === true &&
    Number.isFinite(options.fps) &&
    Number.isFinite(options.width) &&
    Number.isFinite(options.height) &&
    typeof options.fast === "boolean" &&
    typeof options.draft === "boolean";

  if (hasFullOverrides) {
    return defaults;
  }

  if (options.video === false) {
    return null;
  }

  process.stdin.resume();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    if (options.video !== true) {
      const answer = String(await askQuestion(rl, "\nGenerate replay video now? [y/N] "))
        .trim()
        .toLowerCase();

      if (answer !== "y" && answer !== "yes") {
        return null;
      }
    }

    const fpsAnswer = Number.isFinite(options.fps)
      ? String(options.fps)
      : await askQuestion(rl, `FPS [${defaults.fps}]: `);
    const dimensionsAnswer =
      Number.isFinite(options.width) && Number.isFinite(options.height)
        ? `${options.width}x${options.height}`
        : await askQuestion(rl, `Dimensions WxH [${defaults.width}x${defaults.height}]: `);
    const fastAnswer =
      typeof options.fast === "boolean"
        ? (options.fast ? "y" : "n")
        : String(await askQuestion(rl, "Fast mode? [y/N] ")).trim().toLowerCase();
    const draftAnswer =
      typeof options.draft === "boolean"
        ? (options.draft ? "y" : "n")
        : String(await askQuestion(rl, "Draft speed mode (DPR-scaled + effects off)? [y/N] "))
          .trim()
          .toLowerCase();
    const dimensions = parseDimensions(dimensionsAnswer, {
      height: defaults.height,
      width: defaults.width
    });

    return {
      draft: draftAnswer === "y" || draftAnswer === "yes",
      fast: fastAnswer === "y" || fastAnswer === "yes",
      fps: parsePositiveInteger(fpsAnswer, defaults.fps),
      height: dimensions.height,
      width: dimensions.width
    };
  } finally {
    rl.close();
    process.stdin.pause();
  }
}

function commandPrefix(session) {
  void session;
  return "npm run --silent maze:codex --";
}

function renderPrompt(promptName, session) {
  const prompt = readPrompt(promptName || session?.prompt || "default");
  const options = session?.options || {};
  return renderTemplate(prompt.text, {
    API_COMMAND: commandPrefix(session),
    GAME_WON_GEMS: options.gameWonGemCount || 100,
    LEVEL: options.levelId || "level_HxI",
    MAX_TURNS: options.maxTurns || 40,
    PROMPT_NAME: promptName || session?.prompt || "default",
    SESSION_ID: session?.id || "(start will create one)",
    TARGET_GEMS: options.targetGems || 1,
    VIEW: options.view || "top-diagonal",
    YAW: options.yaw ?? 0
  });
}

function startSession(options) {
  const id = options.session && !options.session.includes("/") && !options.session.endsWith(".json")
    ? slug(options.session)
    : defaultSessionId();
  const sessionPath = options.session && (options.session.includes("/") || options.session.endsWith(".json"))
    ? path.resolve(options.session)
    : path.join(options.stateDir, `${id}.json`);

  if (fs.existsSync(sessionPath) && !options.force) {
    throw new Error(`Session already exists: ${sessionPath}. Pass --force to overwrite.`);
  }

  const session = {
    actions: [],
    createdAt: new Date().toISOString(),
    id,
    options: {
      gameId: "maze",
      gameWonGemCount: positiveInt(options.gameWonGemCount, 100),
      levelId: normalizeLevelId(options.level),
      maxTurns: positiveInt(options.maxTurns, 40),
      nodeBin: options.nodeBin || process.execPath,
      targetGems: nonnegativeInt(options.targetGems, 1),
      view: normalizeView(options.view),
      yaw: normalizeYaw(options.yaw)
    },
    prompt: options.prompt || "default",
    version: 1
  };
  const status = runBridge(session, { command: "observe" });
  session.lastStatus = slimStatus(status);
  writeSession(sessionPath, session);
  writeLatestSession(options.stateDir, sessionPath);
  session.path = sessionPath;
  return { session, status };
}

function normalizeCoordinate(value, name) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]$/.test(text)) {
    throw new Error(`${name} must be one world coordinate letter`);
  }
  return text;
}

function normalizeAction(options) {
  const command = String(options.command || "").toLowerCase();
  const args = options.positional || [];

  if (DIRECTIONS.has(command)) {
    return { command: "move", direction: command };
  }
  if (command === "move") {
    const direction = String(args[0] || "").toLowerCase();
    if (!DIRECTIONS.has(direction)) {
      throw new Error("move requires one of: up, down, left, right");
    }
    return { command: "move", direction };
  }
  if (command === "rotate") {
    const direction = String(args[0] === "camera" ? args[1] : args[0] || "").toLowerCase();
    if (!DIRECTIONS.has(direction)) {
      throw new Error("rotate requires one of: up, down, left, right");
    }
    return { command: "rotate_camera", direction };
  }
  if (command === "rotate_camera") {
    const direction = String(args[0] || "").toLowerCase();
    if (!DIRECTIONS.has(direction)) {
      throw new Error("rotate_camera requires one of: up, down, left, right");
    }
    return { command: "rotate_camera", direction };
  }
  if (command === "undo") {
    return { command: "undo" };
  }
  if (command === "reset" || command === "reset_level") {
    return { command: "reset_level" };
  }
  if (command === "goto" || command === "go_to_level" || command === "goto_level") {
    return {
      command: "goto_level",
      x: normalizeCoordinate(args[0], "x"),
      y: normalizeCoordinate(args[1], "y")
    };
  }
  if (command === "scorecard") {
    return { command: "scorecard" };
  }
  if (command === "observe" || command === "status") {
    return { command: "observe" };
  }
  if (command === "quit") {
    return { command: "quit" };
  }

  throw new Error(`Unknown command: ${options.command}`);
}

function actionText(message) {
  if (message.command === "move") {
    return message.direction;
  }
  if (message.command === "rotate_camera") {
    return `rotate camera ${message.direction}`;
  }
  if (message.command === "reset_level") {
    return "reset";
  }
  if (message.command === "goto_level") {
    return `go to level ${message.x} ${message.y}`;
  }
  return message.command;
}

function codexActionCommands(session) {
  return (session.actions || [])
    .filter((action) => action && action.message && action.replay !== false)
    .map((action) => String(action.command || actionText(action.message) || "").trim())
    .filter(Boolean);
}

function sessionScorecard(session, status) {
  if (status?.scorecard && Object.keys(status.scorecard).length > 0) {
    return status.scorecard;
  }

  if (session.lastStatus?.scorecard && Object.keys(session.lastStatus.scorecard).length > 0) {
    return session.lastStatus.scorecard;
  }

  return null;
}

function buildReplayRow(session, status) {
  const options = session.options || {};
  const actions = (session.actions || [])
    .filter((action) => action && action.message && action.replay !== false)
    .map((action, index) => ({
      args: action.message || {},
      command: String(action.command || actionText(action.message) || "").trim(),
      error: null,
      normalized_action: action.message?.command || "",
      raw_response: String(action.command || actionText(action.message) || "").trim(),
      status: action.result || {},
      turn: index + 1,
      valid: true
    }));
  const scorecard = sessionScorecard(session, status) || {};
  const replay = {
    actions,
    game_id: options.gameId || "maze",
    game_won_gem_count: positiveInt(options.gameWonGemCount, 100),
    initial: {
      view: normalizeView(options.view),
      yaw: normalizeYaw(options.yaw)
    },
    scorecard,
    start_level_id: normalizeLevelId(options.levelId)
  };

  return {
    info: {
      mazebench: {
        game_id: replay.game_id,
        game_won_gem_count: replay.game_won_gem_count,
        level_id: replay.start_level_id,
        view: replay.initial.view,
        yaw: replay.initial.yaw
      }
    },
    maze_actions: actions,
    maze_replay: replay,
    maze_scorecard: scorecard
  };
}

function writeReplayJsonFiles(outDir, row, session) {
  ensureDir(outDir);
  const replayPath = path.join(outDir, "maze_replay.json");
  const resultsPath = path.join(outDir, "results.jsonl");
  const metadataPath = path.join(outDir, "metadata.json");
  const metadata = {
    created_at: new Date().toISOString(),
    session_id: session.id,
    session_path: session.path,
    source: "maze-codex"
  };

  fs.writeFileSync(replayPath, `${JSON.stringify(row.maze_replay, null, 2)}\n`);
  fs.writeFileSync(resultsPath, `${JSON.stringify(row)}\n`);
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return { metadataPath, replayPath, resultsPath };
}

async function exportSessionReplay(options) {
  const sessionPath = resolveSessionPath(options.stateDir, options.session || options.positional[0]);
  const session = readSession(sessionPath);
  const outDir = sessionReplayDir(sessionPath, options.outDir);
  const status = runBridge(session, { command: "scorecard" });
  const actions = codexActionCommands(session);

  if (actions.length === 0) {
    throw new Error("Session has no recorded actions to replay.");
  }

  session.path = sessionPath;
  const row = buildReplayRow(session, status);
  const {
    defaultReplayOptions,
    humanSize,
    renderReplayVideo,
    validateReplayOptions,
    writeSidecarFiles
  } = require("./maze-export-replay");
  const sidecars = writeSidecarFiles(outDir, actions, row.maze_scorecard);
  const replayFiles = writeReplayJsonFiles(outDir, row, session);
  let video = null;

  if (!options.json) {
    console.log(`\nReplay artifacts: ${outDir}`);
    console.log(`Wrote ${sidecars.scorecardPath}`);
    console.log(`Wrote ${sidecars.actionsPath}`);
    console.log(`Wrote ${replayFiles.replayPath}`);
    console.log(`Wrote ${replayFiles.resultsPath}`);
  }

  const videoOptions = await promptReplayVideoOptions(options);

  if (videoOptions) {
    const replayOptions = validateReplayOptions({
      ...defaultReplayOptions(),
      ...videoOptions,
      video: true
    });
    const mazeOptions = {
      gameId: row.maze_replay.game_id,
      gameWonGemCount: row.maze_replay.game_won_gem_count,
      levelId: row.maze_replay.start_level_id,
      view: row.maze_replay.initial.view,
      yaw: row.maze_replay.initial.yaw
    };
    console.log("Rendering maze replay video...");
    video = await renderReplayVideo(actions, mazeOptions, outDir, replayOptions);
    console.log(`Wrote ${video.videoPath} (${humanSize(video.videoPath)})`);
  }

  return {
    actions,
    outDir,
    row,
    sidecars,
    replayFiles,
    session,
    status,
    video
  };
}

function slimStatus(status) {
  const keys = [
    "action",
    "action_count",
    "allowed_commands",
    "collected_gems",
    "collected_this_action",
    "current_room",
    "current_view",
    "death_message",
    "destination_room",
    "game_lost",
    "game_won",
    "gem_count",
    "moved",
    "player",
    "player_dead",
    "quit",
    "room_changed",
    "scorecard",
    "solved",
    "visited_levels",
    "yaw"
  ];
  const slim = {};
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(status, key)) {
      slim[key] = status[key];
    }
  });
  return slim;
}

function allowedCommandToApiCommand(session, command) {
  const prefix = commandPrefix(session);
  const text = String(command || "").trim().toLowerCase();

  if (DIRECTIONS.has(text)) {
    return `${prefix} ${text}`;
  }
  if (text.startsWith("rotate camera ")) {
    const direction = text.replace(/^rotate camera\s+/, "").trim();
    return DIRECTIONS.has(direction) ? `${prefix} rotate ${direction}` : "";
  }
  if (text === "undo") {
    return `${prefix} undo`;
  }
  if (text === "reset") {
    return `${prefix} reset`;
  }
  if (text.startsWith("go to level")) {
    return `${prefix} goto X Y`;
  }
  if (text === "quit") {
    return `${prefix} quit`;
  }

  return "";
}

function nextApiCommands(session, status) {
  const allowed = Array.isArray(status.allowed_commands) ? status.allowed_commands : [
    "up",
    "down",
    "left",
    "right",
    "rotate camera left",
    "undo",
    "reset",
    "go to level X Y",
    "quit"
  ];
  return allowed
    .map((command) => allowedCommandToApiCommand(session, command))
    .filter(Boolean);
}

function applyCommand(options) {
  const sessionPath = resolveSessionPath(options.stateDir, options.session);
  return withSessionLock(sessionPath, () => {
    const session = readSession(sessionPath);
    const message = normalizeAction(options);
    const status = runBridge(session, message);

    if (!status.ok) {
      throw new Error(status.error || "maze command failed");
    }

    if (MUTATING_COMMANDS.has(message.command)) {
      session.actions.push({
        at: new Date().toISOString(),
        command: actionText(message),
        message,
        result: slimStatus(status)
      });
    }
    session.lastStatus = slimStatus(status);
    writeSession(sessionPath, session);
    writeLatestSession(options.stateDir, sessionPath);
    session.path = sessionPath;
    return { session, status };
  });
}

function renderStatusText(session, status, extra = {}) {
  const options = session.options || {};
  const lines = [];
  const action = status.action || extra.action || "observe";
  const maxTurns = positiveInt(options.maxTurns, 40);
  const targetGems = nonnegativeInt(options.targetGems, 0);
  const turn = Number(status.action_count || 0);

  lines.push(`Session: ${session.id}`);
  lines.push(`Session file: ${session.path}`);
  lines.push(`Action: ${actionTextForStatus(action, status)}`);
  lines.push(`Turn: ${turn}/${maxTurns}`);
  lines.push(`Room: ${status.current_room || "?"} | view=${status.current_view || "?"} | yaw=${status.yaw ?? "?"}`);
  if (status.player) {
    lines.push(`Player: x=${status.player.x} y=${status.player.y} elevation=${status.player.elevation}`);
  }
  lines.push(`Gems: ${status.gem_count || 0}${targetGems > 0 ? `/${targetGems} target` : ""} | game_won_gems=${options.gameWonGemCount || 100}`);
  lines.push(`Visited: ${(status.visited_levels || []).join(", ") || "(none)"}`);
  if (status.player_dead) {
    lines.push(status.death_message || "The player died, you must now undo or reset or go to a level.");
  }
  if (Array.isArray(status.allowed_commands) && status.allowed_commands.length > 0) {
    lines.push(`Allowed commands: ${status.allowed_commands.join(", ")}`);
  }

  if (Object.prototype.hasOwnProperty.call(status, "moved")) {
    lines.push(`Moved: ${Boolean(status.moved)}`);
  }
  if (status.room_changed) {
    lines.push(`Entered room: ${status.current_room}`);
  }
  if (status.destination_room) {
    lines.push(`Jumped to room: ${status.destination_room}`);
  }
  if (Array.isArray(status.collected_this_action) && status.collected_this_action.length > 0) {
    lines.push(`Collected this action: ${status.collected_this_action.join(", ")}`);
  }

  if (status.level) {
    lines.push("");
    lines.push("```text");
    lines.push(`maze ${status.current_room} | view=${status.current_view} yaw=${status.yaw}`);
    lines.push(String(status.level).trimEnd());
    lines.push("```");
  }

  if (status.scorecard) {
    lines.push("");
    lines.push("Scorecard:");
    lines.push("```json");
    lines.push(JSON.stringify(status.scorecard, null, 2));
    lines.push("```");
  }

  if (status.game_won) {
    lines.push("");
    lines.push("Game won.");
  } else if (status.game_lost || status.quit) {
    lines.push("");
    lines.push("Run ended with quit.");
  } else {
    lines.push("");
    lines.push("Next API commands:");
    nextApiCommands(session, status).forEach((command) => {
      lines.push(command);
    });
  }

  return `${lines.join("\n")}\n`;
}

function actionTextForStatus(action, status) {
  if (action === "move" && status.direction) {
    return status.direction;
  }
  if (action === "rotate_camera" && status.direction) {
    return `rotate camera ${status.direction}`;
  }
  if (action === "reset_level") {
    return "reset";
  }
  if (action === "goto_level") {
    return `go to level ${status.x || "?"} ${status.y || "?"}`;
  }
  return action;
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function listSessions(options) {
  if (!fs.existsSync(options.stateDir)) {
    return [];
  }
  return fs.readdirSync(options.stateDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const sessionPath = path.join(options.stateDir, file);
      try {
        const session = readSession(sessionPath);
        return {
          actions: session.actions.length,
          id: session.id,
          path: sessionPath,
          prompt: session.prompt,
          updatedAt: session.updatedAt || session.createdAt
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "help") {
    process.stdout.write(usage());
    return;
  }

  if (options.command === "start") {
    const { session, status } = startSession(options);
    if (options.json) {
      printJson({ session, status });
    } else {
      process.stdout.write(`${renderPrompt(session.prompt, session)}\n\n`);
      process.stdout.write(renderStatusText(session, status, { action: "start" }));
    }
    return;
  }

  if (options.command === "prompt") {
    let session = null;
    try {
      session = readSession(resolveSessionPath(options.stateDir, options.session));
    } catch {
      session = null;
    }
    const promptName = options.positional[0] || options.prompt || session?.prompt || "default";
    process.stdout.write(`${renderPrompt(promptName, session)}\n`);
    return;
  }

  if (options.command === "list") {
    const sessions = listSessions(options);
    if (options.json) {
      printJson(sessions);
      return;
    }
    if (sessions.length === 0) {
      process.stdout.write("No maze Codex sessions found.\n");
      return;
    }
    sessions.forEach((session) => {
      process.stdout.write(`${session.id}\t${session.actions} actions\t${session.updatedAt}\t${session.path}\n`);
    });
    return;
  }

  if (options.command === "video") {
    const exported = await exportSessionReplay(options);
    if (options.json) {
      printJson({
        actionCount: exported.actions.length,
        outDir: exported.outDir,
        replayFiles: exported.replayFiles,
        scorecard: exported.row.maze_scorecard,
        session: {
          id: exported.session.id,
          path: exported.session.path
        },
        sidecars: exported.sidecars,
        video: exported.video
      });
    }
    return;
  }

  const { session, status } = applyCommand(options);
  if (options.json) {
    printJson({ session: { ...session, path: session.path }, status });
  } else {
    process.stdout.write(renderStatusText(session, status));
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
