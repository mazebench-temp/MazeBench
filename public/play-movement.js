(function () {
  const modules = window.PlayModules || (window.PlayModules = {});

  modules.createMovementController = function createMovementController(app) {
    const {
      state,
      moveHistory,
      HOLE_SINK_DISTANCE
    } = app;
    const {
      posKey,
      cloneActorPositions,
      cloneTerrainState,
      restoreActorPositions,
      buildOccupiedSet,
      actorsAt,
      actorAt,
      pushEntityKey,
      isPlayerActor,
      actorElevation,
      isCollectibleActor,
      pushWeight,
      isPushableActor,
      pushActorMembers,
      weightlessGroupMembers,
      isInsideBoard,
      isWall,
      terrainSurfaceHeightAt,
      playerSurfaceHeightAt,
      isPlayerLift,
      isRaisedPlayerLift,
      setPlayerLiftRaised,
      computeRaisedPlayerGateSet,
      isIce,
      isHole,
      isIceOrHole
    } = app;

    function canMoveInto(x, y, occupied, gateState = app.liveRaisedPlayerGates) {
      if (!isInsideBoard(x, y)) {
        return false;
      }

      if (isWall(x, y, gateState)) {
        return false;
      }

      return !occupied.has(posKey(x, y));
    }

    function findSlideDestination(startX, startY, dx, dy, occupied, gateState = app.liveRaisedPlayerGates) {
      let nextX = startX;
      let nextY = startY;

      while (canMoveInto(nextX + dx, nextY + dy, occupied, gateState)) {
        nextX += dx;
        nextY += dy;

        if (!isIce(nextX, nextY)) {
          break;
        }
      }

      return { x: nextX, y: nextY };
    }

    function moveBox(box, dx, dy, occupied, moves, gateState = app.liveRaisedPlayerGates) {
      const fromX = box.x;
      const fromY = box.y;
      occupied.delete(posKey(fromX, fromY));

      const target = findSlideDestination(fromX, fromY, dx, dy, occupied, gateState);

      if (target.x === fromX && target.y === fromY) {
        occupied.add(posKey(fromX, fromY));
        return false;
      }

      box.x = target.x;
      box.y = target.y;
      const distance = Math.abs(target.x - fromX) + Math.abs(target.y - fromY);
      moves.push({
        actor: box,
        fromX,
        fromY,
        toX: target.x,
        toY: target.y,
        iceSlide: distance > 1
      });
      occupied.add(posKey(box.x, box.y));
      return true;
    }

    function countSupportingPlayers(player, dx, dy) {
      let count = 1;
      let checkX = player.x;
      let checkY = player.y;

      while (true) {
        checkX -= dx;
        checkY -= dy;

        if (
          !actorAt(
            checkX,
            checkY,
            (actor) => isPlayerActor(actor) && actorElevation(actor) === actorElevation(player)
          )
        ) {
          break;
        }

        count += 1;
      }

      return count;
    }

    function blockingActorAtElevation(x, y, elevation, mover) {
      return actorAt(
        x,
        y,
        (actor) =>
          actor !== mover &&
          !isCollectibleActor(actor) &&
          actorElevation(actor) === elevation
      );
    }

    function collectGemsAt(
      x,
      y,
      moves,
      collectedGems,
      { fadeStartProgress = 0, fadeEndProgress = 1 } = {}
    ) {
      actorsAt(x, y, (actor) => isCollectibleActor(actor) && !collectedGems.has(actor)).forEach((gem) => {
        collectedGems.add(gem);
        moves.push({
          actor: gem,
          fromX: gem.x,
          fromY: gem.y,
          toX: gem.x,
          toY: gem.y,
          fromRemoved: false,
          toRemoved: true,
          fadeOut: true,
          fadeStartProgress,
          fadeEndProgress,
          skipHoleFall: true,
          visibleDuringMove: true
        });
      });
    }

    function collectGemsAlongPath(fromX, fromY, toX, toY, moves, collectedGems) {
      if (fromX === toX && fromY === toY) {
        return;
      }

      const stepX = Math.sign(toX - fromX);
      const stepY = Math.sign(toY - fromY);
      const totalSteps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
      let stepIndex = 1;
      let currentX = fromX + stepX;
      let currentY = fromY + stepY;

      while (true) {
        collectGemsAt(currentX, currentY, moves, collectedGems, {
          fadeStartProgress: (stepIndex - 1) / totalSteps,
          fadeEndProgress: stepIndex / totalSteps
        });

        if (currentX === toX && currentY === toY) {
          return;
        }

        currentX += stepX;
        currentY += stepY;
        stepIndex += 1;
      }
    }

    function collectGemsAtEndpoint(fromX, fromY, toX, toY, moves, collectedGems) {
      const travelDistance = Math.abs(toX - fromX) + Math.abs(toY - fromY);
      collectGemsAt(toX, toY, moves, collectedGems, {
        fadeStartProgress: travelDistance > 1 ? (travelDistance - 1) / travelDistance : 0,
        fadeEndProgress: 1
      });
    }

    function canMoveWeightlessGroup(members, dx, dy, occupied, gateState = app.liveRaisedPlayerGates) {
      return members.every((member) => {
        const targetX = member.x + dx;
        const targetY = member.y + dy;

        if (!isInsideBoard(targetX, targetY) || isWall(targetX, targetY, gateState)) {
          return false;
        }

        return !occupied.has(posKey(targetX, targetY));
      });
    }

    function weightlessClusterMembers(groupIds) {
      const groupIdSet = new Set(groupIds);

      return app.state.actors.filter(
        (actor) =>
          !actor.removed &&
          actor.type === "weightless_box" &&
          groupIdSet.has(actor.groupId)
      );
    }

    function collectWeightlessPushCluster(
      groupId,
      dx,
      dy,
      gateState = app.liveRaisedPlayerGates,
      ignoredActors = new Set()
    ) {
      const clusterGroupIds = new Set([groupId]);
      const blockers = [];
      const blockerKeys = new Set();
      let expanded = true;

      while (expanded) {
        expanded = false;

        for (const currentGroupId of Array.from(clusterGroupIds)) {
          const members = weightlessGroupMembers(currentGroupId);

          for (const member of members) {
            const targetX = member.x + dx;
            const targetY = member.y + dy;

            if (!isInsideBoard(targetX, targetY) || isWall(targetX, targetY, gateState)) {
              return null;
            }

            const blocker = actorAt(
              targetX,
              targetY,
              (candidate) =>
                !ignoredActors.has(candidate) &&
                candidate !== member &&
                !isCollectibleActor(candidate) &&
                !(candidate.type === "weightless_box" && clusterGroupIds.has(candidate.groupId))
            );

            if (!blocker) {
              continue;
            }

            if (!isPushableActor(blocker)) {
              return null;
            }

            if (blocker.type === "weightless_box") {
              if (!clusterGroupIds.has(blocker.groupId)) {
                clusterGroupIds.add(blocker.groupId);
                expanded = true;
              }

              continue;
            }

            const blockerKey = pushEntityKey(blocker);

            if (!blockerKeys.has(blockerKey)) {
              blockers.push(blocker);
              blockerKeys.add(blockerKey);
            }
          }
        }
      }

      return {
        blockers,
        groupIds: Array.from(clusterGroupIds)
      };
    }

    function iceSlideMoveMetadata(moves) {
      return moves
        .filter(({ iceSlide = false }) => iceSlide)
        .map(({ actor, fromX, fromY, toX, toY }) => ({
          actorIndex: state.actors.indexOf(actor),
          fromX,
          fromY,
          toX,
          toY
        }))
        .filter(({ actorIndex }) => actorIndex !== -1);
    }

    function applyUndoIceSlideMetadata(moves, previousState) {
      if (!Array.isArray(previousState.iceSlideMoves) || previousState.iceSlideMoves.length === 0) {
        return;
      }

      const iceSlideMoveByActorIndex = new Map(
        previousState.iceSlideMoves.map((move) => [move.actorIndex, move])
      );

      moves.forEach((move) => {
        const originalMove = iceSlideMoveByActorIndex.get(move.actorIndex);

        if (!originalMove) {
          return;
        }

        const isReverseMove =
          move.fromX === originalMove.toX &&
          move.fromY === originalMove.toY &&
          move.toX === originalMove.fromX &&
          move.toY === originalMove.fromY;

        if (!isReverseMove) {
          return;
        }

        move.iceSlide = true;
        move.reverseIceSlide = true;
      });
    }

    function moveWeightlessGroup(groupId, dx, dy, occupied, moves, gateState = app.liveRaisedPlayerGates) {
      return moveWeightlessCluster([groupId], dx, dy, occupied, moves, gateState);
    }

    function moveWeightlessCluster(groupIds, dx, dy, occupied, moves, gateState = app.liveRaisedPlayerGates) {
      const members = weightlessClusterMembers(groupIds);

      if (members.length === 0) {
        return false;
      }

      const startPositions = members.map((actor) => ({
        actor,
        fromX: actor.x,
        fromY: actor.y
      }));

      members.forEach((member) => {
        occupied.delete(posKey(member.x, member.y));
      });

      let moved = false;

      while (canMoveWeightlessGroup(members, dx, dy, occupied, gateState)) {
        members.forEach((member) => {
          member.x += dx;
          member.y += dy;
        });

        moved = true;

        if (members.every((member) => isHole(member.x, member.y))) {
          break;
        }

        if (!members.every((member) => isIceOrHole(member.x, member.y))) {
          break;
        }
      }

      if (!moved) {
        startPositions.forEach(({ fromX, fromY }) => {
          occupied.add(posKey(fromX, fromY));
        });
        return false;
      }

      startPositions.forEach(({ actor, fromX, fromY }) => {
        const distance = Math.abs(actor.x - fromX) + Math.abs(actor.y - fromY);
        moves.push({
          actor,
          fromX,
          fromY,
          toX: actor.x,
          toY: actor.y,
          iceSlide: distance > 1
        });
      });

      members.forEach((member) => {
        occupied.add(posKey(member.x, member.y));
      });

      return true;
    }

    function attemptPushActor(
      actor,
      dx,
      dy,
      occupied,
      moves,
      budget,
      handled = new Set(),
      gateState = app.liveRaisedPlayerGates,
      ignoredActors = new Set()
    ) {
      const entityKey = pushEntityKey(actor);

      if (handled.has(entityKey)) {
        return budget;
      }

      const cost = pushWeight(actor);

      if (budget < cost) {
        return null;
      }

      let remainingBudget = budget - cost;
      const weightlessCluster =
        actor.type === "weightless_box"
          ? collectWeightlessPushCluster(actor.groupId, dx, dy, gateState, ignoredActors)
          : null;
      const members = actor.type === "weightless_box" ? null : pushActorMembers(actor);
      const memberSet = members ? new Set(members) : null;
      const blockers = [];

      if (actor.type === "weightless_box") {
        if (!weightlessCluster) {
          return null;
        }

        blockers.push(...weightlessCluster.blockers);
      } else {
        const blockerKeys = new Set();

        for (const member of members) {
          const targetX = member.x + dx;
          const targetY = member.y + dy;

          if (!isInsideBoard(targetX, targetY) || isWall(targetX, targetY, gateState)) {
            return null;
          }

          const blocker = actorAt(
            targetX,
            targetY,
            (candidate) =>
              !ignoredActors.has(candidate) &&
              !memberSet.has(candidate) &&
              !isCollectibleActor(candidate)
          );

          if (!blocker) {
            continue;
          }

          if (!isPushableActor(blocker)) {
            return null;
          }

          const blockerKey = pushEntityKey(blocker);

          if (!blockerKeys.has(blockerKey)) {
            blockers.push(blocker);
            blockerKeys.add(blockerKey);
          }
        }
      }

      for (const blocker of blockers) {
        const result = attemptPushActor(
          blocker,
          dx,
          dy,
          occupied,
          moves,
          remainingBudget,
          handled,
          gateState,
          ignoredActors
        );

        if (result === null) {
          return null;
        }

        remainingBudget = result;
      }

      const moved =
        actor.type === "weightless_box"
          ? moveWeightlessCluster(weightlessCluster.groupIds, dx, dy, occupied, moves, gateState)
          : moveBox(actor, dx, dy, occupied, moves, gateState);

      if (!moved) {
        return null;
      }

      if (actor.type === "weightless_box") {
        weightlessCluster.groupIds.forEach((clusterGroupId) => {
          handled.add(`weightless:${clusterGroupId}`);
        });
      } else {
        handled.add(entityKey);
      }
      return remainingBudget;
    }

    function applyHoleFalls(moves) {
      const moveByActor = new Map(moves.map((move) => [move.actor, move]));
      const handledGroups = new Set();

      moves.forEach((move) => {
        move.fromRemoved = Boolean(move.fromRemoved);
        move.toRemoved = Boolean(move.toRemoved);

        if (move.actor.type === "weightless_box") {
          if (handledGroups.has(move.actor.groupId)) {
            return;
          }

          handledGroups.add(move.actor.groupId);
          const members = weightlessGroupMembers(move.actor.groupId);

          if (members.length > 0 && members.every((member) => isHole(member.x, member.y))) {
            members.forEach((member) => {
              const memberMove = moveByActor.get(member);

              if (memberMove) {
                memberMove.toRemoved = true;
              }
            });
          }

          return;
        }

        if (move.actor.type === "floating_floor" && isHole(move.actor.x, move.actor.y)) {
          move.toRemoved = true;
          move.skipHoleFall = true;
          move.visibleDuringMove = true;
          move.fillsHole = true;
          move.fillHoleX = move.actor.x;
          move.fillHoleY = move.actor.y;
          return;
        }

        if (isHole(move.actor.x, move.actor.y)) {
          move.toRemoved = true;
        }
      });
    }

    function buildFloorTerrainCell() {
      return {
        type: "floor",
        label: "Floor",
        imageUrl: null,
        underlay: null,
        raised: false
      };
    }

    function fillHoleAt(x, y) {
      if (!isInsideBoard(x, y)) {
        return;
      }

      state.terrain[y][x] = buildFloorTerrainCell();
    }

    function applyMoveFinalState(moves) {
      moves.forEach(
        ({
          actor,
          toX,
          toY,
          toRemoved = false,
          skipHoleFall = false,
          toElevation = actor.elevation ?? 0
        }) => {
          actor.renderX = toX;
          actor.renderY = toY;
          actor.elevation = toElevation;
          actor.renderElevation = toElevation;
          actor.renderScale = toRemoved ? 0 : 1;
          actor.renderAlpha = toRemoved ? 0 : 1;
          actor.renderSink = toRemoved && !skipHoleFall ? HOLE_SINK_DISTANCE : 0;
          actor.renderInHole = false;
          actor.removed = Boolean(toRemoved);
        }
      );

      moves.forEach(({ fillsHole = false, fillHoleX = null, fillHoleY = null }) => {
        if (!fillsHole || typeof fillHoleX !== "number" || typeof fillHoleY !== "number") {
          return;
        }

        fillHoleAt(fillHoleX, fillHoleY);
      });
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

    function performPlayerMove(dx, dy, options = {}) {
      const animate = options.animate !== false;
      const recordHistory = options.recordHistory !== false;
      const players = state.actors.filter((actor) => isPlayerActor(actor) && !actor.removed);
      let occupied = buildOccupiedSet();
      const raisedPlayerGates = computeRaisedPlayerGateSet();
      const orderedPlayers = players.slice().sort(sortActorsForMove(dx, dy));
      const previousState = {
        actors: cloneActorPositions(),
        terrain: cloneTerrainState(state.terrain)
      };
      const moves = [];
      const collectedGems = new Set();
      const pendingLiftToggles = [];

      orderedPlayers.forEach((player) => {
        const fromX = player.x;
        const fromY = player.y;
        const fromElevation = actorElevation(player);
        occupied.delete(posKey(player.x, player.y));

        let nextX = fromX;
        let nextY = fromY;

        while (true) {
          const targetX = nextX + dx;
          const targetY = nextY + dy;
          const isInitialStep = nextX === fromX && nextY === fromY;
          const targetSurfaceHeight =
            fromElevation === 1
              ? playerSurfaceHeightAt(targetX, targetY, raisedPlayerGates)
              : terrainSurfaceHeightAt(targetX, targetY, raisedPlayerGates);
          const canEnterHole = fromElevation === 0 && isHole(targetX, targetY);

          if (
            !isInsideBoard(targetX, targetY) ||
            (!canEnterHole && targetSurfaceHeight !== fromElevation)
          ) {
            break;
          }

          const blockingActor = blockingActorAtElevation(targetX, targetY, fromElevation, player);

          if (blockingActor) {
            let didMoveBlockingActor = false;

            if (fromElevation === 0 && isInitialStep && isPushableActor(blockingActor)) {
              const attemptSnapshot = cloneActorPositions();
              const moveCount = moves.length;
              const pushBudget = countSupportingPlayers(player, dx, dy);
              const result = attemptPushActor(
                blockingActor,
                dx,
                dy,
                occupied,
                moves,
                pushBudget,
                new Set(),
                raisedPlayerGates,
                new Set([player])
              );

              if (result !== null) {
                didMoveBlockingActor = true;
              } else {
                restoreActorPositions(attemptSnapshot);
                moves.length = moveCount;
                occupied = buildOccupiedSet(player);
              }
            }

            if (!didMoveBlockingActor) {
              break;
            }
          }

          nextX = targetX;
          nextY = targetY;

          if (fromElevation !== 0 || !isIce(nextX, nextY)) {
            break;
          }
        }

        if (nextX !== fromX || nextY !== fromY) {
          player.x = nextX;
          player.y = nextY;
          let toElevation = fromElevation;

          if (isPlayerLift(nextX, nextY)) {
            const toRaised = !isRaisedPlayerLift(nextX, nextY);
            pendingLiftToggles.push({
              x: nextX,
              y: nextY,
              raised: toRaised
            });
            toElevation = toRaised ? 1 : 0;
          } else {
            toElevation = playerSurfaceHeightAt(nextX, nextY, raisedPlayerGates) ?? fromElevation;
          }

          const travelDistance = Math.abs(nextX - fromX) + Math.abs(nextY - fromY);
          moves.push({
            actor: player,
            fromX,
            fromY,
            toX: nextX,
            toY: nextY,
            fromElevation,
            toElevation,
            iceSlide: travelDistance > 1
          });

          if (
            !isHole(nextX, nextY) &&
            (toElevation === 0 || (fromElevation === 0 && isPlayerLift(nextX, nextY)))
          ) {
            collectGemsAtEndpoint(fromX, fromY, nextX, nextY, moves, collectedGems);
          }
        }

        occupied.add(posKey(player.x, player.y));
      });

      if (moves.length > 0) {
        applyHoleFalls(moves);
        if (recordHistory) {
          previousState.iceSlideMoves = iceSlideMoveMetadata(moves);
          moveHistory.push(previousState);
        }

        if (animate) {
          app.gateRenderOverride = raisedPlayerGates;
          app.animateMoves(moves, null, {
            startLiftPhase: () => {
              pendingLiftToggles.forEach(({ x, y, raised }) => {
                setPlayerLiftRaised(x, y, raised);
              });
            }
          });
        } else {
          pendingLiftToggles.forEach(({ x, y, raised }) => {
            setPlayerLiftRaised(x, y, raised);
          });
          applyMoveFinalState(moves);
          app.gateRenderOverride = null;
        }
      }

      return {
        moved: moves.length > 0,
        moves,
        previousState
      };
    }

    return {
      applyMoveFinalState,
      applyUndoIceSlideMetadata,
      performPlayerMove,
      testHooks: {
        attemptPushActor
      }
    };
  };

  modules.registerMovementFunctions = function registerMovementFunctions(app) {
    const movement = modules.createMovementController(app);
    app.movement = movement;
    return movement;
  };
})();
