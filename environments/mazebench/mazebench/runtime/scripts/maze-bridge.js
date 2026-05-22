#!/usr/bin/env node

const readline = require("node:readline");

const {
  applyMove,
  buildScorecard,
  createTerminalContext,
  GAME_WON_GEM_COUNT,
  loadMazeEngine,
  normalizeGameWonGemCount,
  renderScreen,
  resetLevel,
  undoMove
} = require("./maze-terminal");

const VIEW_NAMES = ["top", "top-diagonal", "diagonal", "side-diagonal", "side"];
const DIRECTION_TO_MOVE = {
  down: "D",
  left: "L",
  right: "R",
  up: "U"
};
const LEVEL_PATTERN = /^(?:level_)?([A-Z])x([A-Z])$/;
const COORDINATE_PATTERN = /^[A-Z]$/i;

function normalizeLevelId(value) {
  const raw = String(value || "level_HxI").trim();
  const match = raw.match(LEVEL_PATTERN);
  return match ? `level_${match[1]}x${match[2]}` : raw;
}

function normalizeCoordinate(value, name) {
  const raw = String(value || "").trim();

  if (!COORDINATE_PATTERN.test(raw)) {
    throw new Error(`${name} must be a single world coordinate letter`);
  }

  return raw.toUpperCase();
}

function levelIdFromCoordinates(x, y) {
  return `level_${normalizeCoordinate(x, "x")}x${normalizeCoordinate(y, "y")}`;
}

function gotoLevelFromMessage(message) {
  if (message.x !== undefined || message.y !== undefined) {
    return levelIdFromCoordinates(message.x, message.y);
  }

  if (message.level !== undefined) {
    return normalizeLevelId(message.level);
  }

  throw new Error("goto_level requires x and y coordinate parameters");
}

function normalizeYaw(value) {
  const number = Number(value);
  const integerValue = Number.isInteger(number) ? number : 0;
  return ((integerValue % 4) + 4) % 4;
}

function clampPitch(value) {
  const number = Number(value);
  return Math.max(0, Math.min(4, Number.isInteger(number) ? number : 1));
}

function pitchFromView(value) {
  const index = VIEW_NAMES.indexOf(String(value || "").toLowerCase());
  return index === -1 ? 1 : index;
}

function parseArgs(argv) {
  const options = {
    gameId: "maze",
    gameWonGemCount: GAME_WON_GEM_COUNT,
    levelId: "level_HxI",
    pitch: 1,
    yaw: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";

    if (arg === "--game") {
      options.gameId = next();
    } else if (arg === "--level") {
      options.levelId = normalizeLevelId(next());
    } else if (arg === "--game-won-gem-count" || arg === "--game-won-gems") {
      options.gameWonGemCount = normalizeGameWonGemCount(next());
    } else if (arg === "--view") {
      options.pitch = pitchFromView(next());
    } else if (arg === "--pitch") {
      options.pitch = clampPitch(Number(next()));
    } else if (arg === "--yaw") {
      options.yaw = normalizeYaw(Number(next()));
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage: node scripts/maze-bridge.js [options]

Options:
  --level <id>       Maze world level id, for example level_HxI.
  --game-won-gem-count <n>
                     Unique gems required for the game_won condition.
  --view <name>      top, top-diagonal, diagonal, side-diagonal, or side.
  --pitch <0-4>      Camera pitch; 0 is top-down, 4 is side.
  --yaw <0-3>        Camera yaw rotation.

Commands are JSON lines on stdin:
  {"command":"observe"}
  {"command":"move","direction":"up"}
  {"command":"rotate_camera","direction":"left"}
  {"command":"undo"}
  {"command":"reset_level"}
  {"command":"goto_level","x":"H","y":"I"}
  {"command":"scorecard"}
  {"command":"quit"}
  {"command":"close"}
`);
      process.exit(0);
    }
  }

  return options;
}

function isPlayerActorType(type) {
  return type === "player" || type === "circle_player";
}

function actorId(context, index) {
  const actor = context.playData.actors[index] || {};
  const type = context.engine.actorTypes[index] || actor.type || "actor";
  const x = actor.x ?? context.state.actorX[index] ?? 0;
  const y = actor.y ?? context.state.actorY[index] ?? 0;
  const elevation = actor.elevation ?? context.state.actorElevation[index] ?? 0;
  return `${context.level.id}:${type}:${index}:${x},${y},${elevation}`;
}

function visibleGemIds(context) {
  const ids = [];

  for (let index = 0; index < context.engine.actorCount; index += 1) {
    const type = context.engine.actorTypes[index] || context.playData.actors[index]?.type || "";

    if (type === "gem" && !context.state.actorRemoved[index]) {
      ids.push(actorId(context, index));
    }
  }

  return ids;
}

function activePlayer(context) {
  for (let index = 0; index < context.engine.actorCount; index += 1) {
    const type = context.engine.actorTypes[index] || context.playData.actors[index]?.type || "";

    if (!context.state.actorRemoved[index] && isPlayerActorType(type)) {
      return {
        elevation: context.state.actorElevation[index] || 0,
        type,
        x: context.state.actorX[index],
        y: context.state.actorY[index]
      };
    }
  }

  return null;
}

function recordSessionVisit(session) {
  const stats = session?.context?.stats;
  const player = activePlayer(session.context);

  if (!stats || !player) {
    return;
  }

  const tileKey = `${session.context.level.id}:${player.x},${player.y}`;
  const elevationTileKey = `${tileKey},${player.elevation ?? 0}`;
  stats.uniqueTiles.add(tileKey);
  stats.uniqueElevationTiles.add(elevationTileKey);
  stats.visitedRooms.add(session.context.level.id);
  stats.minElevation =
    stats.minElevation === null ? player.elevation : Math.min(stats.minElevation, player.elevation);
  stats.maxElevation =
    stats.maxElevation === null ? player.elevation : Math.max(stats.maxElevation, player.elevation);
}

function recordCollectedGems(session, beforeIds) {
  const before = new Set(beforeIds || []);
  const after = new Set(visibleGemIds(session.context));
  const collected = [];

  before.forEach((id) => {
    if (!after.has(id) && !session.collectedGemIds.has(id)) {
      session.collectedGemIds.add(id);
      session.context.stats?.collectedGemIds?.add(id);
      collected.push(id);
    }
  });

  return collected;
}

function syncSessionStats(session) {
  const stats = session?.context?.stats;

  if (!stats) {
    return;
  }

  session.collectedGemIds.forEach((id) => stats.collectedGemIds.add(id));
  session.visitedLevels.forEach((level) => stats.visitedRooms.add(level));
  recordSessionVisit(session);
}

function sessionScorecard(session) {
  syncSessionStats(session);
  const payload = JSON.parse(buildScorecard(session.context));
  const scorecard = payload.scorecard || {};
  const actions = scorecard.actions || {};
  const extraActions = session.extraActionCounts || {};
  actions.go_to_level = extraActions.goto_level || 0;
  actions.quit = extraActions.quit || 0;
  actions.total = (actions.total || 0) + actions.go_to_level + actions.quit;
  scorecard.actions = actions;
  return scorecard;
}

function applyCollectedGemsToContext(session) {
  if (!session?.context || !session.collectedGemIds?.size) {
    return;
  }

  const { context } = session;

  for (let index = 0; index < context.engine.actorCount; index += 1) {
    const type = context.engine.actorTypes[index] || context.playData.actors[index]?.type || "";

    if (type === "gem" && session.collectedGemIds.has(actorId(context, index))) {
      context.state.actorRemoved[index] = 1;
    }
  }
}

function splitRenderedScreen(rendered) {
  const [header = "", ...rows] = String(rendered || "").split("\n");
  return {
    header,
    level: rows.join("\n")
  };
}

function sessionSnapshot(session, extra = {}) {
  const context = session.context;
  applyCollectedGemsToContext(session);
  session.visitedLevels.add(context.level.id);
  syncSessionStats(session);
  const currentView = VIEW_NAMES[context.options.pitch];
  const rendered = splitRenderedScreen(renderScreen(context));
  const gameWonGemCount = normalizeGameWonGemCount(context.options?.gameWonGemCount);
  const gameWon = session.collectedGemIds.size === gameWonGemCount;
  const terminalExtra = { ...extra };

  if (gameWon && !terminalExtra.scorecard) {
    terminalExtra.game_won = true;
    terminalExtra.scorecard = sessionScorecard(session);
  }

  return {
    ok: true,
    action_count: session.actionCount,
    collected_gems: Array.from(session.collectedGemIds),
    current_room: context.level.id,
    current_view: currentView,
    gem_count: session.collectedGemIds.size,
    level: rendered.level,
    player: activePlayer(context),
    solved: context.engine.isSolved(context.state),
    visited_levels: Array.from(session.visitedLevels),
    yaw: context.options.yaw,
    ...terminalExtra
  };
}

function createSession(options) {
  const mazeEngine = loadMazeEngine();
  const context = createTerminalContext(mazeEngine, {
    gameId: options.gameId,
    gameWonGemCount: options.gameWonGemCount,
    levelId: options.levelId,
    moves: "",
    once: true,
    pitch: options.pitch,
    yaw: options.yaw
  });
  const session = {
    actionCount: 0,
    collectedGemIds: new Set(),
    context,
    extraActionCounts: {
      goto_level: 0,
      quit: 0
    },
    initialOptions: { ...options },
    mazeEngine,
    visitedLevels: new Set([context.level.id])
  };

  return session;
}

function resetSession(session) {
  const next = createSession(session.initialOptions);
  session.actionCount = 0;
  session.collectedGemIds = next.collectedGemIds;
  session.context = next.context;
  session.extraActionCounts = next.extraActionCounts;
  session.visitedLevels = next.visitedLevels;
}

function handleCommand(session, message) {
  const command = String(message.command || "observe");

  if (command === "observe") {
    return sessionSnapshot(session, { action: "observe" });
  }

  if (command === "move") {
    const move = DIRECTION_TO_MOVE[String(message.direction || "").toLowerCase()];

    if (!move) {
      throw new Error("move direction must be one of: up, down, left, right");
    }

    const beforeLevel = session.context.level.id;
    const beforeGems = visibleGemIds(session.context);
    const result = applyMove(session.context, move);
    const roomChanged = beforeLevel !== session.context.level.id;
    const collected = roomChanged ? [] : recordCollectedGems(session, beforeGems);
    session.actionCount += 1;
    session.visitedLevels.add(session.context.level.id);

    return sessionSnapshot(session, {
      action: "move",
      collected_this_action: collected,
      direction: String(message.direction).toLowerCase(),
      moved: Boolean(result === true || result?.moved),
      room_changed: roomChanged
    });
  }

  if (command === "rotate_camera") {
    const direction = String(message.direction || "").toLowerCase();

    if (direction === "up") {
      session.context.options.pitch = clampPitch(session.context.options.pitch - 1);
    } else if (direction === "down") {
      session.context.options.pitch = clampPitch(session.context.options.pitch + 1);
    } else if (direction === "left") {
      session.context.options.yaw = normalizeYaw(session.context.options.yaw - 1);
    } else if (direction === "right") {
      session.context.options.yaw = normalizeYaw(session.context.options.yaw + 1);
    } else {
      throw new Error("rotate_camera direction must be one of: up, down, left, right");
    }

    if (session.context.stats) {
      session.context.stats.actionCounts.rotateCamera += 1;
      if (direction === "up" || direction === "down") {
        session.context.stats.pitchRotations[direction] += 1;
      } else {
        session.context.stats.yawRotations[direction] += 1;
      }
    }

    session.actionCount += 1;
    return sessionSnapshot(session, {
      action: "rotate_camera",
      direction
    });
  }

  if (command === "undo") {
    const beforeGems = new Set(session.collectedGemIds);
    const undone = undoMove(session.context);

    // Keep gem score monotonic for the rollout: undo changes position, not achievement history.
    beforeGems.forEach((id) => session.collectedGemIds.add(id));
    session.actionCount += 1;

    return sessionSnapshot(session, {
      action: "undo",
      undone
    });
  }

  if (command === "reset_level") {
    const reset = resetLevel(session.context);
    session.actionCount += 1;

    return sessionSnapshot(session, {
      action: "reset_level",
      reset
    });
  }

  if (command === "goto_level") {
    const level = gotoLevelFromMessage(message);

    if (!session.visitedLevels.has(level)) {
      throw new Error(`cannot goto unvisited level: ${level}`);
    }

    const previousVisited = new Set(session.visitedLevels);
    const previousGems = new Set(session.collectedGemIds);
    const previousStats = session.context.stats;
    const next = createSession({
      ...session.initialOptions,
      levelId: level,
      pitch: session.context.options.pitch,
      yaw: session.context.options.yaw
    });

    session.context = next.context;
    session.context.stats = previousStats || session.context.stats;
    previousVisited.forEach((visited) => session.visitedLevels.add(visited));
    previousGems.forEach((gemId) => session.collectedGemIds.add(gemId));
    session.extraActionCounts.goto_level += 1;
    session.actionCount += 1;

    return sessionSnapshot(session, {
      action: "goto_level",
      destination_room: level,
      x: level.match(LEVEL_PATTERN)?.[1] || null,
      y: level.match(LEVEL_PATTERN)?.[2] || null
    });
  }

  if (command === "reset_run") {
    resetSession(session);
    return sessionSnapshot(session, { action: "reset_run" });
  }

  if (command === "scorecard") {
    return sessionSnapshot(session, {
      action: "scorecard",
      scorecard: sessionScorecard(session)
    });
  }

  if (command === "quit") {
    session.extraActionCounts.quit += 1;
    session.actionCount += 1;
    return sessionSnapshot(session, {
      action: "quit",
      game_lost: true,
      quit: true,
      scorecard: sessionScorecard(session)
    });
  }

  if (command === "close") {
    return { ok: true, action: "close" };
  }

  throw new Error(`unknown command: ${command}`);
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const session = createSession(options);
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  rl.on("line", (line) => {
    let message;

    try {
      message = JSON.parse(line);
      const response = handleCommand(session, message);
      write(response);

      if (message.command === "close") {
        process.exit(0);
      }
    } catch (error) {
      write({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    write({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}
