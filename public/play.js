(function () {
  const playData = window.__PLAY_DATA__;
  const canvas = document.getElementById("maze-canvas");

  if (!playData || !canvas) {
    return;
  }

  const TILE_SIZE = 64;
  const MOVE_DURATION_MS = 98;
  const state = {
    width: playData.width,
    height: playData.height,
    terrain: playData.terrain,
    actors: playData.actors.map((actor) => ({
      ...actor,
      renderX: actor.x,
      renderY: actor.y
    }))
  };

  const imageUrls = new Set();
  state.terrain.forEach((row) => {
    row.forEach((cell) => {
      if (cell.imageUrl) {
        imageUrls.add(cell.imageUrl);
      }
    });
  });
  state.actors.forEach((actor) => {
    if (actor.imageUrl) {
      imageUrls.add(actor.imageUrl);
    }
  });

  const imageCache = new Map();
  const ctx = canvas.getContext("2d");
  const boardRect = {
    width: state.width * TILE_SIZE,
    height: state.height * TILE_SIZE
  };
  const initialPositions = state.actors.map((actor) => ({ x: actor.x, y: actor.y }));
  const moveHistory = [];
  let animationFrameId = null;
  let isAnimating = false;
  let queuedAction = null;

  function posKey(x, y) {
    return `${x},${y}`;
  }

  function cloneActorPositions() {
    return state.actors.map((actor) => ({ x: actor.x, y: actor.y }));
  }

  function isInsideBoard(x, y) {
    return x >= 0 && x < state.width && y >= 0 && y < state.height;
  }

  function terrainAt(x, y) {
    return state.terrain[y]?.[x] || { type: "empty", label: "Empty", imageUrl: null };
  }

  function isWall(x, y) {
    return terrainAt(x, y).type === "wall";
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = boardRect.width * dpr;
    canvas.height = boardRect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.aspectRatio = `${state.width} / ${state.height}`;
  }

  function preloadImages() {
    return Promise.all(
      Array.from(imageUrls).map((url) => {
        return new Promise((resolve) => {
          const image = new Image();
          image.onload = function () {
            imageCache.set(url, image);
            resolve();
          };
          image.onerror = function () {
            imageCache.set(url, null);
            resolve();
          };
          image.src = url;
        });
      })
    );
  }

  function roundRectPath(x, y, width, height, radii) {
    ctx.beginPath();
    ctx.moveTo(x + radii.tl, y);
    ctx.lineTo(x + width - radii.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radii.tr);
    ctx.lineTo(x + width, y + height - radii.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radii.br, y + height);
    ctx.lineTo(x + radii.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radii.bl);
    ctx.lineTo(x, y + radii.tl);
    ctx.quadraticCurveTo(x, y, x + radii.tl, y);
    ctx.closePath();
  }

  function paintFloorTile(x, y, cell) {
    const tileSize = TILE_SIZE;
    const left = x * tileSize;
    const top = y * tileSize;
    const image = cell.imageUrl ? imageCache.get(cell.imageUrl) : null;

    if (image) {
      ctx.drawImage(image, left, top, tileSize, tileSize);
      return;
    }

    ctx.fillStyle = "#cdb18d";
    ctx.fillRect(left, top, tileSize, tileSize);

    ctx.strokeStyle = "rgba(126, 94, 58, 0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, tileSize - 1, tileSize - 1);
  }

  function paintWallTile(x, y, cell) {
    const tileSize = TILE_SIZE;
    const left = x * tileSize;
    const top = y * tileSize;
    const image = cell.imageUrl ? imageCache.get(cell.imageUrl) : null;

    paintFloorTile(x, y, { imageUrl: null });

    if (image) {
      ctx.drawImage(image, left, top, tileSize, tileSize);
      return;
    }

    const radius = tileSize * 0.18;
    const radii = {
      tl: !isWall(x, y - 1) && !isWall(x - 1, y) ? radius : 0,
      tr: !isWall(x, y - 1) && !isWall(x + 1, y) ? radius : 0,
      br: !isWall(x, y + 1) && !isWall(x + 1, y) ? radius : 0,
      bl: !isWall(x, y + 1) && !isWall(x - 1, y) ? radius : 0
    };

    if (x === 0 && y === 0) {
      radii.tl = 0;
    }
    if (x === state.width - 1 && y === 0) {
      radii.tr = 0;
    }
    if (x === state.width - 1 && y === state.height - 1) {
      radii.br = 0;
    }
    if (x === 0 && y === state.height - 1) {
      radii.bl = 0;
    }

    roundRectPath(left, top, tileSize, tileSize, radii);
    ctx.fillStyle = "#262b34";
    ctx.fill();

    if (y < state.height - 1 && !isWall(x, y + 1)) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      roundRectPath(left + 1.5, top + tileSize * 0.78, tileSize - 3, tileSize * 0.18, {
        tl: 0,
        tr: 0,
        br: Math.max(0, radii.br - 1.5),
        bl: Math.max(0, radii.bl - 1.5)
      });
      ctx.fill();
    }
  }

  function paintExit(x, y, cell) {
    paintFloorTile(x, y, cell);

    const tileSize = TILE_SIZE;
    const left = x * tileSize + tileSize / 2;
    const top = y * tileSize + tileSize / 2;
    const image = cell.imageUrl ? imageCache.get(cell.imageUrl) : null;

    if (image) {
      ctx.drawImage(image, x * tileSize, y * tileSize, tileSize, tileSize);
      return;
    }

    ctx.fillStyle = "#8d412d";
    ctx.beginPath();
    ctx.arc(left, top, tileSize * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#c96d4e";
    ctx.beginPath();
    ctx.arc(left, top, tileSize * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintTerrain() {
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const cell = terrainAt(x, y);

        if (cell.type === "wall") {
          continue;
        }

        if (cell.type === "exit") {
          paintExit(x, y, cell);
          continue;
        }

        paintFloorTile(x, y, cell);
      }
    }

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const cell = terrainAt(x, y);
        if (cell.type === "wall") {
          paintWallTile(x, y, cell);
        }
      }
    }
  }

  function paintActor(actor) {
    const tileSize = TILE_SIZE;
    const left = actor.renderX * tileSize;
    const top = actor.renderY * tileSize;
    const image = actor.imageUrl ? imageCache.get(actor.imageUrl) : null;

    if (image) {
      ctx.drawImage(image, left, top, tileSize, tileSize);
      return;
    }

    if (actor.type === "player") {
      ctx.fillStyle = "#2d6637";
      ctx.beginPath();
      ctx.arc(left + tileSize / 2, top + tileSize / 2, tileSize * 0.338, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#6ba562";
      ctx.beginPath();
      ctx.arc(left + tileSize / 2, top + tileSize / 2, tileSize * 0.273, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render() {
    ctx.clearRect(0, 0, boardRect.width, boardRect.height);
    paintTerrain();
    state.actors.forEach(paintActor);
  }

  function canMoveInto(x, y, occupied) {
    if (!isInsideBoard(x, y)) {
      return false;
    }

    if (isWall(x, y)) {
      return false;
    }

    return !occupied.has(posKey(x, y));
  }

  function easeInOutQuad(progress) {
    if (progress < 0.5) {
      return 2 * progress * progress;
    }

    return 1 - Math.pow(-2 * progress + 2, 2) / 2;
  }

  function finishAnimation(moves) {
    moves.forEach(({ actor, toX, toY }) => {
      actor.renderX = toX;
      actor.renderY = toY;
    });

    isAnimating = false;
    animationFrameId = null;
    render();

    if (queuedAction) {
      const nextAction = queuedAction;
      queuedAction = null;
      runAction(nextAction);
    }
  }

  function animateMoves(moves) {
    if (moves.length === 0) {
      return;
    }

    isAnimating = true;
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min(1, (now - startTime) / MOVE_DURATION_MS);
      const eased = easeInOutQuad(progress);

      moves.forEach(({ actor, fromX, fromY, toX, toY }) => {
        actor.renderX = fromX + (toX - fromX) * eased;
        actor.renderY = fromY + (toY - fromY) * eased;
      });

      render();

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
        return;
      }

      finishAnimation(moves);
    }

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = window.requestAnimationFrame(step);
  }

  function sortActorsForMove(dx, dy) {
    return function (left, right) {
      if (dx > 0) {
        return right.x - left.x || left.y - right.y;
      }
      if (dx < 0) {
        return left.x - right.x || left.y - right.y;
      }
      if (dy > 0) {
        return right.y - left.y || left.x - right.x;
      }
      return left.y - right.y || left.x - right.x;
    };
  }

  function buildMovesToPositions(targetPositions) {
    const moves = [];

    state.actors.forEach((actor, index) => {
      const target = targetPositions[index];
      if (!target) {
        return;
      }

      const fromX = actor.x;
      const fromY = actor.y;
      actor.x = target.x;
      actor.y = target.y;

      if (fromX === target.x && fromY === target.y) {
        actor.renderX = target.x;
        actor.renderY = target.y;
        return;
      }

      moves.push({
        actor,
        fromX,
        fromY,
        toX: target.x,
        toY: target.y
      });
    });

    return moves;
  }

  function movePlayers(dx, dy) {
    if (isAnimating) {
      queuedAction = { type: "move", dx, dy };
      return;
    }

    const players = state.actors.filter((actor) => actor.type === "player");
    const occupied = new Set(state.actors.map((actor) => posKey(actor.x, actor.y)));
    const orderedPlayers = players.slice().sort(sortActorsForMove(dx, dy));
    const previousPositions = cloneActorPositions();
    const moves = [];

    orderedPlayers.forEach((player) => {
      const fromX = player.x;
      const fromY = player.y;
      occupied.delete(posKey(player.x, player.y));

      const nextX = player.x + dx;
      const nextY = player.y + dy;

      if (canMoveInto(nextX, nextY, occupied)) {
        player.x = nextX;
        player.y = nextY;
        moves.push({
          actor: player,
          fromX,
          fromY,
          toX: nextX,
          toY: nextY
        });
      }

      occupied.add(posKey(player.x, player.y));
    });

    if (moves.length > 0) {
      moveHistory.push(previousPositions);
      animateMoves(moves);
    }
  }

  function undoMove() {
    if (isAnimating) {
      queuedAction = { type: "undo" };
      return;
    }

    const previousPositions = moveHistory.pop();
    if (!previousPositions) {
      return;
    }

    const moves = buildMovesToPositions(previousPositions);
    if (moves.length > 0) {
      animateMoves(moves);
      return;
    }

    render();
  }

  function resetPositions() {
    if (isAnimating) {
      queuedAction = { type: "reset" };
      return;
    }

    moveHistory.length = 0;
    const moves = buildMovesToPositions(initialPositions);

    if (moves.length > 0) {
      animateMoves(moves);
      return;
    }

    render();
  }

  function runAction(action) {
    if (!action) {
      return;
    }

    if (action.type === "move") {
      movePlayers(action.dx, action.dy);
      return;
    }

    if (action.type === "undo") {
      undoMove();
      return;
    }

    if (action.type === "reset") {
      resetPositions();
    }
  }

  function handleKeydown(event) {
    const directionalMoves = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0]
    };
    const key = event.key.toLowerCase();

    if (directionalMoves[event.key]) {
      event.preventDefault();
      const [dx, dy] = directionalMoves[event.key];
      movePlayers(dx, dy);
      return;
    }

    if (key === "z" || key === "u") {
      event.preventDefault();
      undoMove();
      return;
    }

    if (key === "r") {
      event.preventDefault();
      resetPositions();
    }
  }

  function preventScroll(event) {
    event.preventDefault();
  }

  setupCanvas();
  preloadImages().finally(render);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("wheel", preventScroll, { passive: false });
  window.addEventListener("resize", function () {
    setupCanvas();
    render();
  });
})();
