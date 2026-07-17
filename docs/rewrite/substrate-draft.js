/*
 * MazeCore — MazeBench simulation engine (rewrite, 2026-07).
 *
 * Drop-in replacement for the legacy maze-engine.js behind the same
 * window.MazeEngine API and state-buffer shape. Design goals:
 *
 *  - Zero allocation on the search path (moveForSearch/undoMove/stateKey).
 *  - Terrain queries via precompiled per-cell bitmasks (bit e = elevation e),
 *    not per-layer object scans.
 *  - Occupancy via a stamped typed-array grid, not string Sets.
 *  - Journaled mutation: every state write goes through jSet* helpers that
 *    record undo entries and maintain an incremental 64-bit hash, so
 *    undoMove restores exactly and stateKey is O(1).
 *  - One device clock: gate/button/lift state is snapshotted once per move
 *    and used for every traversal decision in that move (R1 in
 *    docs/rewrite/SEMANTICS.md).
 *  - Declarative type registry: actor capabilities are flag bits in
 *    ACTOR_TYPES; adding a type means adding a registry row, and
 *    createEngine validates that every type referenced by a level resolves.
 *
 * Behavior is transcribed from the legacy engine (see
 * docs/rewrite/LEGACY-RULES.md) with the deliberate fixes catalogued in
 * docs/rewrite/SEMANTICS.md. Where this file diverges from legacy on
 * purpose, the code comments cite the SEMANTICS rule (R1..R5).
 */
(function () {
  "use strict";

  const terrainTypes = {
    empty: 0,
    floor: 1,
    wall: 2,
    exit: 3,
    ice: 4,
    hole: 5,
    player_gate: 6,
    player_lift: 7,
    orange_wall: 8,
    orange_button: 9,
    tree: 10,
    ice_block: 11,
    shrub: 12,
    block_asset: 13,
    ice_slope: 14
  };

  const MAX_ELEVATION = 14; // bitmask width guard; elevations are clamped into [0, 14]
  const STATE_ELEVATION_KEY_OFFSET = 1024; // kept for stateKey fallback compatibility

  // ---------------------------------------------------------------------------
  // Type registry.
  //
  // Every actor type declares its capabilities once. The engine core never
  // tests type names directly on hot paths — it tests flag bits. Adding a new
  // object type = adding a row here (and, if it participates in a system pass,
  // declaring it in the pass's participation mask below).
  // ---------------------------------------------------------------------------
  const F = {
    PLAYER: 1 << 0,        // moves on player input
    MAIN_PLAYER: 1 << 1,   // the controlled player (not a clone)
    CLONE: 1 << 2,         // mirrors main-player input as a clone group
    COLLECTIBLE: 1 << 3,   // collected on exact co-location by a main player
    NON_BLOCKING: 1 << 4,  // never blocks movement (gems, buttons, punchers)
    PUSHABLE: 1 << 5,      // can be pushed
    SUPPORT: 1 << 6,       // its top is a standing surface for other actors
    WEIGHTLESS_GROUP: 1 << 7, // rigid weightless group keyed by groupId
    PUNCHER: 1 << 8,       // launches actors that step onto it
    BUTTON: 1 << 9,        // orange button actor
    FILLS_HOLE: 1 << 10,   // fills an elevation-0 hole when it enters one
    FALLS: 1 << 11,        // subject to gravity/landing rules (gems deliberately do NOT set this)
    RIDES_DEVICE: 1 << 12, // rides gate/lift/orange-wall surface transitions beneath it
    ATTACHABLE_BASE: 1 << 13 // surface attachments (buttons/punchers) ride on top of it
  };

  const ACTOR_TYPES = {
    player: {
      flags: F.PLAYER | F.MAIN_PLAYER | F.SUPPORT | F.FALLS | F.RIDES_DEVICE,
      pushWeight: 0
    },
    circle_player: {
      flags: F.PLAYER | F.MAIN_PLAYER | F.SUPPORT | F.FALLS | F.RIDES_DEVICE,
      pushWeight: 0
    },
    clone: {
      // FIX (SEMANTICS §clones): clones fall/die like players (legacy exempted them).
      // FIX: clones are ATTACHABLE_BASE so buttons authored on clone stacks ride along.
      flags: F.PLAYER | F.CLONE | F.SUPPORT | F.FALLS | F.RIDES_DEVICE | F.ATTACHABLE_BASE,
      pushWeight: 0
    },
    gem: {
      // PRESERVE (owner decision): gems float — no F.FALLS, no F.RIDES_DEVICE.
      flags: F.COLLECTIBLE | F.NON_BLOCKING,
      pushWeight: 0
    },
    orange_button: {
      // FIX (SEMANTICS §devices): buttons ride device surfaces so a button on a
      // lift/gate keeps working after a toggle (legacy left them entombed).
      flags: F.BUTTON | F.NON_BLOCKING | F.RIDES_DEVICE,
      pushWeight: 0
    },
    puncher: {
      flags: F.PUNCHER | F.NON_BLOCKING | F.RIDES_DEVICE,
      pushWeight: 0
    },
    box: {
      flags: F.PUSHABLE | F.SUPPORT | F.FALLS | F.RIDES_DEVICE | F.ATTACHABLE_BASE,
      pushWeight: 1
    },
    floating_floor: {
      flags: F.PUSHABLE | F.SUPPORT | F.FILLS_HOLE | F.FALLS | F.RIDES_DEVICE | F.ATTACHABLE_BASE,
      pushWeight: 1
    },
    weightless_box: {
      flags: F.PUSHABLE | F.SUPPORT | F.WEIGHTLESS_GROUP | F.FALLS | F.RIDES_DEVICE | F.ATTACHABLE_BASE,
      pushWeight: 0
    }
  };

  const UNKNOWN_ACTOR_TYPE = { flags: 0, pushWeight: 0 };

  // Static terrain layer geometry: how each terrain type contributes to the
  // per-cell surface and blocking masks. Device types (gate/lift/orange wall)
  // contribute dynamically and are compiled into per-cell device descriptors.
  // surface: fn(elev) -> surface height or null; blocks: fn(elev) -> [lo, hi] inclusive blocked band or null.
  const TERRAIN_GEOMETRY = {
    [terrainTypes.floor]: { surface: 0, blocksLo: null, blocksHi: null },
    [terrainTypes.exit]: { surface: 0, blocksLo: null, blocksHi: null },
    [terrainTypes.ice]: { surface: 0, blocksLo: null, blocksHi: null },
    [terrainTypes.wall]: { surface: 1, blocksLo: 0, blocksHi: 0 },
    [terrainTypes.ice_block]: { surface: 1, blocksLo: 0, blocksHi: 0 },
    [terrainTypes.block_asset]: { surface: 1, blocksLo: 0, blocksHi: 0 },
    [terrainTypes.ice_slope]: { surface: 1, blocksLo: 0, blocksHi: 1 },
    [terrainTypes.shrub]: { surface: 1, blocksLo: 0, blocksHi: 1 },
    [terrainTypes.tree]: { surface: 3, blocksLo: 0, blocksHi: 2 },
    [terrainTypes.hole]: { surface: null, blocksLo: null, blocksHi: null },
    [terrainTypes.orange_button]: { surface: null, blocksLo: null, blocksHi: null }
  };

  // Side-blocking support types: standing surfaces whose exposed flank refuses
  // weightless entry at (surface-1). FIX (SEMANTICS §elevation): exit included
  // (legacy omitted it, letting boxes sink into raised exit flanks).
  const SIDE_BLOCKING_SUPPORT_TYPES = new Set([
    terrainTypes.floor,
    terrainTypes.ice,
    terrainTypes.exit
  ]);

  const directionNames = {
    "-1,0": "L",
    "0,-1": "U",
    "0,1": "D",
    "1,0": "R"
  };

  const ICE_SLOPE_VISUAL_CLEARANCE = 0.08;

  function actorTypeName(actor) {
    return typeof actor?.type === "string" ? actor.type : "";
  }

  function typeDescriptor(typeName) {
    return ACTOR_TYPES[typeName] || UNKNOWN_ACTOR_TYPE;
  }

  function normalizePuncherDirection(direction) {
    const value = String(direction || "").toLowerCase();
    if (value === "left" || value === "l" || value === "-1,0") return "left";
    if (value === "up" || value === "u" || value === "0,-1") return "up";
    if (value === "down" || value === "d" || value === "0,1") return "down";
    return "right";
  }

  function puncherDirectionVector(direction) {
    const normalized = normalizePuncherDirection(direction);
    if (normalized === "left") return { dx: -1, dy: 0 };
    if (normalized === "up") return { dx: 0, dy: -1 };
    if (normalized === "down") return { dx: 0, dy: 1 };
    return { dx: 1, dy: 0 };
  }

  function normalizedTerrainType(type) {
    return terrainTypes[type] ?? terrainTypes.empty;
  }

  function normalizedTerrainLayers(cell, fallbackType) {
    const sourceLayers = Array.isArray(cell?.layers) ? cell.layers : null;
    const layers = sourceLayers
      ? sourceLayers
      : [
          {
            type: cell?.type,
            elevation: 0,
            direction: cell?.direction ?? null,
            raised: cell?.raised === true
          }
        ];

    return layers
      .map((layer) => {
        const elevation = Number.isInteger(layer?.elevation) ? layer.elevation : 0;
        return {
          type: normalizedTerrainType(
            typeof layer?.type === "string" ? layer.type : fallbackType
          ),
          elevation: Math.max(0, Math.min(MAX_ELEVATION, elevation)),
          direction: typeof layer?.direction === "string" ? layer.direction : null,
          raised: layer?.raised === true
        };
      })
      .filter((layer) => layer.type !== terrainTypes.empty)
      .sort((left, right) => left.elevation - right.elevation);
  }

  // Legacy raw-type normalization accepts either numeric or string cell types.
  function rawCellType(cell) {
    if (typeof cell?.type === "number") return cell.type;
    return normalizedTerrainType(cell?.type);
  }

  function encodeKeyValue(value) {
    return String.fromCharCode(Math.max(0, Math.min(65534, value | 0)));
  }

  // splitmix32-style mixer for incremental hashing (no giant Zobrist tables;
  // deterministic across sessions so cached solver results stay valid).
  function mix32(value) {
    let z = (value + 0x9e3779b9) | 0;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) | 0;
  }

  function createEngine(playData) {
    const width = Math.max(1, Number(playData?.width) || 1);
    const height = Math.max(1, Number(playData?.height) || 1);
    const cellCount = width * height;
    const sourceTerrain = Array.isArray(playData?.terrain) ? playData.terrain : [];
    const actorSource = Array.isArray(playData?.actors) ? playData.actors : [];
    const actorCount = actorSource.length;
    const loadWarnings = [];

    // ---- Actor tables -------------------------------------------------------
    const actorTypes = actorSource.map((actor) => actorTypeName(actor));
    const actorFlags = new Int32Array(actorCount);
    const actorPushWeights = new Uint8Array(actorCount);
    const actorGroupIds = actorSource.map((actor) => actor?.groupId ?? "");
    const actorDirections = actorSource.map((actor) =>
      normalizePuncherDirection(actor?.direction || actor?.facing)
    );

    for (let index = 0; index < actorCount; index += 1) {
      const descriptor = typeDescriptor(actorTypes[index]);
      if (descriptor === UNKNOWN_ACTOR_TYPE && actorTypes[index] !== "") {
        loadWarnings.push(
          `actor ${index}: unknown type "${actorTypes[index]}" — treated as inert`
        );
      }
      actorFlags[index] = descriptor.flags;
      actorPushWeights[index] = descriptor.pushWeight;
    }

    function hasFlag(index, flag) {
      return (actorFlags[index] & flag) !== 0;
    }
    function isPlayerActor(index) {
      return hasFlag(index, F.PLAYER);
    }
    function isMainPlayerActor(index) {
      return hasFlag(index, F.MAIN_PLAYER);
    }
    function isCloneActor(index) {
      return hasFlag(index, F.CLONE);
    }
    function isCollectibleActor(index) {
      return hasFlag(index, F.COLLECTIBLE);
    }
    function isNonBlockingActor(index) {
      return hasFlag(index, F.NON_BLOCKING);
    }
    function isPushableActor(index) {
      return hasFlag(index, F.PUSHABLE);
    }
    function isSupportActor(index) {
      return hasFlag(index, F.SUPPORT);
    }
    function isPuncherActor(index) {
      return hasFlag(index, F.PUNCHER);
    }
    function isWeightlessActor(index) {
      return hasFlag(index, F.WEIGHTLESS_GROUP);
    }

    // ---- Terrain compile ----------------------------------------------------
    // Per cell we keep: the normalized layer list (play data / renderer
    // contract), plus compiled masks. Masks encode elevation membership in
    // bits 0..15. Device layers (gate/lift/orange wall) contribute at
    // query time from the device snapshot; everything else is static.
    const baseTerrain = new Uint8Array(cellCount);
    const baseLiftRaised = new Uint8Array(cellCount);
    const terrainLayers = Array.from({ length: cellCount }, () => []);

    // static (device-independent) masks
    const staticSurfaceMask = new Uint16Array(cellCount);
    const staticBlockMask = new Uint16Array(cellCount);
    const iceSurfaceMask = new Uint16Array(cellCount); // ice / ice_block surfaces (isIce query)
    const holeMask = new Uint16Array(cellCount); // hole layers by layer elevation (bit e)
    const sideBlockMask = new Uint16Array(cellCount); // side-blocking flank elevations (bit = surface-1)
    // “filled” variants: what the masks become when the cell's hole is filled
    // by a floating floor (the only terrain mutation in the game).
    // FIX (SEMANTICS §elevation): fill replaces only the hole layer with floor;
    // all other layers survive (legacy nuked the whole cell to one floor layer).
    const filledSurfaceMask = new Uint16Array(cellCount);
    const filledBlockMask = new Uint16Array(cellCount);
    const filledIceSurfaceMask = new Uint16Array(cellCount);
    const filledSideBlockMask = new Uint16Array(cellCount);
    const filledTerrainLayers = Array.from({ length: cellCount }, () => null);

    // dynamic layer descriptors
    const gateLayersByCell = new Map(); // cell -> [{elevation}]
    const liftLayersByCell = new Map(); // cell -> {elevation} (post-normalization: single lift layer)
    const orangeWallLayersByCell = new Map(); // cell -> [{elevation}]
    const orangeButtonLayersByCell = new Map(); // cell -> [{elevation}]
    const slopeLayersByCell = new Map(); // cell -> [{elevation, direction, uphillDx, uphillDy}]
    const playerGateCells = [];
    const playerLiftCells = [];
    const orangeWallCells = [];
    const orangeButtonCells = [];

    function cellIndex(x, y) {
      return y * width + x;
    }
    function cellX(index) {
      return index % width;
    }
    function cellY(index) {
      return (index / width) | 0;
    }
    function isInsideBoard(x, y) {
      return x >= 0 && x < width && y >= 0 && y < height;
    }

    function compileStaticMasksForLayers(layers, into) {
      let surface = 0;
      let block = 0;
      let ice = 0;
      let holes = 0;
      let side = 0;

      for (const layer of layers) {
        const e = layer.elevation;
        switch (layer.type) {
          case terrainTypes.floor:
          case terrainTypes.exit:
            surface |= 1 << e;
            if (e > 0) side |= 1 << (e - 1);
            break;
          case terrainTypes.ice:
            surface |= 1 << e;
            ice |= 1 << e;
            if (e > 0) side |= 1 << (e - 1);
            break;
          case terrainTypes.wall:
          case terrainTypes.block_asset:
            surface |= 1 << (e + 1);
            block |= 1 << e;
            break;
          case terrainTypes.ice_block:
            surface |= 1 << (e + 1);
            ice |= 1 << (e + 1);
            block |= 1 << e;
            break;
          case terrainTypes.ice_slope:
            surface |= 1 << (e + 1);
            block |= (1 << e) | (1 << (e + 1));
            break;
          case terrainTypes.shrub:
            surface |= 1 << (e + 1);
            block |= (1 << e) | (1 << (e + 1));
            break;
          case terrainTypes.tree:
            surface |= 1 << (e + 3);
            block |= (1 << e) | (1 << (e + 1)) | (1 << (e + 2));
            break;
          case terrainTypes.hole:
            holes |= 1 << e;
            break;
          default:
            break; // devices handled dynamically; empty/button contribute nothing static
        }
      }

      into.surface = surface;
      into.block = block;
      into.ice = ice;
      into.holes = holes;
      into.side = side;
    }

    const maskScratch = { surface: 0, block: 0, ice: 0, holes: 0, side: 0 };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = sourceTerrain[y]?.[x] || { type: "empty" };
        const index = cellIndex(x, y);
        const terrainType = rawCellType(cell);
        baseTerrain[index] = terrainType;

        let layers = normalizedTerrainLayers(cell, cell?.type);

        // Load-time normalization: stacked lifts share one raised bit per cell
        // in the public state contract, so multiple lift layers in one cell are
        // physically unrepresentable. Keep the lowest. (SEMANTICS §devices.)
        const liftLayers = layers.filter((l) => l.type === terrainTypes.player_lift);
        if (liftLayers.length > 1) {
          const keep = liftLayers[0];
          layers = layers.filter(
            (l) => l.type !== terrainTypes.player_lift || l === keep
          );
          loadWarnings.push(
            `cell (${x},${y}): stacked player lifts normalized to a single lift at elevation ${keep.elevation}`
          );
        }

        terrainLayers[index] = layers;

        compileStaticMasksForLayers(layers, maskScratch);
        staticSurfaceMask[index] = maskScratch.surface;
        staticBlockMask[index] = maskScratch.block;
        iceSurfaceMask[index] = maskScratch.ice;
        holeMask[index] = maskScratch.holes;
        sideBlockMask[index] = maskScratch.side;

        if (maskScratch.holes & 1) {
          // Precompile the filled variant (hole@0 -> floor@0, others kept).
          const filled = layers
            .filter((l) => !(l.type === terrainTypes.hole && l.elevation === 0))
            .concat([{ type: terrainTypes.floor, elevation: 0, direction: null, raised: false }])
            .sort((a, b) => a.elevation - b.elevation);
          filledTerrainLayers[index] = filled;
          compileStaticMasksForLayers(filled, maskScratch);
          filledSurfaceMask[index] = maskScratch.surface;
          filledBlockMask[index] = maskScratch.block;
          filledIceSurfaceMask[index] = maskScratch.ice;
          filledSideBlockMask[index] = maskScratch.side;
        }

        for (const layer of layers) {
          if (layer.type === terrainTypes.player_gate) {
            if (!gateLayersByCell.has(index)) {
              gateLayersByCell.set(index, []);
              playerGateCells.push(index);
            }
            gateLayersByCell.get(index).push(layer);
          } else if (layer.type === terrainTypes.player_lift) {
            liftLayersByCell.set(index, layer);
            playerLiftCells.push(index);
            if (layer.raised || cell?.raised === true) {
              baseLiftRaised[index] = 1;
            }
          } else if (layer.type === terrainTypes.orange_wall) {
            if (!orangeWallLayersByCell.has(index)) {
              orangeWallLayersByCell.set(index, []);
              orangeWallCells.push(index);
            }
            orangeWallLayersByCell.get(index).push(layer);
          } else if (layer.type === terrainTypes.orange_button) {
            if (!orangeButtonLayersByCell.has(index)) {
              orangeButtonLayersByCell.set(index, []);
              orangeButtonCells.push(index);
            }
            orangeButtonLayersByCell.get(index).push(layer);
          } else if (layer.type === terrainTypes.ice_slope) {
            if (!slopeLayersByCell.has(index)) {
              slopeLayersByCell.set(index, []);
            }
            const uphill = puncherDirectionVector(layer.direction);
            slopeLayersByCell.get(index).push({
              elevation: layer.elevation,
              direction: layer.direction,
              uphillDx: uphill.dx,
              uphillDy: uphill.dy
            });
          }
        }

        // slope layers sorted top-down for fall traversal scans
        const slopes = slopeLayersByCell.get(index);
        if (slopes) slopes.sort((a, b) => b.elevation - a.elevation);
      }
    }

    // Orange button actor list (actor-based buttons, distinct from terrain buttons).
    const orangeButtonActors = [];
    for (let index = 0; index < actorCount; index += 1) {
      if (hasFlag(index, F.BUTTON)) orangeButtonActors.push(index);
    }

    // Capability mask for pass gating: which mechanics does this level use at all?
    const CAP = {
      GATES: 1 << 0,
      LIFTS: 1 << 1,
      ORANGE: 1 << 2,
      PUNCHERS: 1 << 3,
      HOLES: 1 << 4,
      SLOPES: 1 << 5,
      ICE: 1 << 6,
      WEIGHTLESS: 1 << 7,
      CLONES: 1 << 8,
      ATTACHMENTS: 1 << 9,
      MULTI_ELEVATION: 1 << 10
    };
    let capabilityMask = 0;
    if (playerGateCells.length) capabilityMask |= CAP.GATES;
    if (playerLiftCells.length) capabilityMask |= CAP.LIFTS;
    if (orangeWallCells.length || orangeButtonCells.length || orangeButtonActors.length) {
      capabilityMask |= CAP.ORANGE;
    }
    if (slopeLayersByCell.size) capabilityMask |= CAP.SLOPES;
    for (let c = 0; c < cellCount; c += 1) {
      if (holeMask[c]) capabilityMask |= CAP.HOLES;
      if (iceSurfaceMask[c]) capabilityMask |= CAP.ICE;
      if (staticSurfaceMask[c] & ~3) capabilityMask |= CAP.MULTI_ELEVATION;
    }
    for (let index = 0; index < actorCount; index += 1) {
      if (isPuncherActor(index)) capabilityMask |= CAP.PUNCHERS;
      if (isWeightlessActor(index)) capabilityMask |= CAP.WEIGHTLESS;
      if (isCloneActor(index)) capabilityMask |= CAP.CLONES;
      if (hasFlag(index, F.BUTTON) || isPuncherActor(index)) capabilityMask |= CAP.ATTACHMENTS;
    }

    // ---- Incremental hash ---------------------------------------------------
    // Contribution of one actor = mix of (actorIndex, x, y, elevation, removed).
    // Contribution of one changed terrain byte / lift bit is mixed similarly.
    // hashLo/hashHi live as plain properties on state buffers and are
    // maintained by the journaled setters. Buffers that were built outside the
    // engine get a full recompute on first stateKey call.
    const HASH_SEED_LO = 0x8f1bbcdc | 0;
    const HASH_SEED_HI = 0x5be0cd19 | 0;

    function actorHashLo(index, x, y, elevation, removed) {
      return mix32(
        (index * 0x1000193) ^ (x + 1) ^ ((y + 1) << 8) ^ ((elevation + 16) << 16) ^ (removed << 24)
      );
    }
    function actorHashHi(index, x, y, elevation, removed) {
      return mix32(
        0x517cc1b7 ^ (index * 0x85ebca77) ^ ((x + 1) << 4) ^ ((y + 1) << 12) ^ ((elevation + 16) << 20) ^ (removed << 28)
      );
    }
    function terrainHashLo(cell, value) {
      return mix32(0x27d4eb2f ^ (cell * 0x9e3779b1) ^ (value << 16));
    }
    function terrainHashHi(cell, value) {
      return mix32(0x165667b1 ^ (cell * 0xc2b2ae3d) ^ (value << 12));
    }
    function liftHashLo(cell) {
      return mix32(0x62a9d9ed ^ (cell * 0x2545f491));
    }
    function liftHashHi(cell) {
      return mix32(0x94d049bb ^ (cell * 0x633d9abf));
    }

    function recomputeHash(state) {
      let lo = HASH_SEED_LO;
      let hi = HASH_SEED_HI;
      for (let index = 0; index < actorCount; index += 1) {
        lo ^= actorHashLo(index, state.actorX[index], state.actorY[index], state.actorElevation[index], state.actorRemoved[index]);
        hi ^= actorHashHi(index, state.actorX[index], state.actorY[index], state.actorElevation[index], state.actorRemoved[index]);
      }
      for (let cell = 0; cell < cellCount; cell += 1) {
        if (state.terrain[cell] !== baseTerrain[cell]) {
          lo ^= terrainHashLo(cell, state.terrain[cell]);
          hi ^= terrainHashHi(cell, state.terrain[cell]);
        }
      }
      for (let i = 0; i < playerLiftCells.length; i += 1) {
        const cell = playerLiftCells[i];
        if (state.liftRaised[cell] !== baseLiftRaised[cell]) {
          lo ^= liftHashLo(cell);
          hi ^= liftHashHi(cell);
        }
      }
      state.hashLo = lo;
      state.hashHi = hi;
      state.hashValid = true;
    }

    // ---- Journal ------------------------------------------------------------
    // Entries are (field, index, oldValue) triplets in a flat Int32Array.
    // Fields: 0=actorX 1=actorY 2=actorElevation 3=actorRemoved 4=terrain 5=liftRaised
    let journal = new Int32Array(1024);
    let journalLength = 0;

    function journalPush(field, index, oldValue) {
      if (journalLength + 3 > journal.length) {
        const grown = new Int32Array(journal.length * 2);
        grown.set(journal);
        journal = grown;
      }
      journal[journalLength] = field;
      journal[journalLength + 1] = index;
      journal[journalLength + 2] = oldValue;
      journalLength += 3;
    }

    function hashActorOut(state, index) {
      if (!state.hashValid) return;
      state.hashLo ^= actorHashLo(index, state.actorX[index], state.actorY[index], state.actorElevation[index], state.actorRemoved[index]);
      state.hashHi ^= actorHashHi(index, state.actorX[index], state.actorY[index], state.actorElevation[index], state.actorRemoved[index]);
    }
    function hashActorIn(state, index) {
      if (!state.hashValid) return;
      state.hashLo ^= actorHashLo(index, state.actorX[index], state.actorY[index], state.actorElevation[index], state.actorRemoved[index]);
      state.hashHi ^= actorHashHi(index, state.actorX[index], state.actorY[index], state.actorElevation[index], state.actorRemoved[index]);
    }

    function jSetActorX(state, index, value) {
      if (state.actorX[index] === value) return;
      journalPush(0, index, state.actorX[index]);
      hashActorOut(state, index);
      state.actorX[index] = value;
      hashActorIn(state, index);
    }
    function jSetActorY(state, index, value) {
      if (state.actorY[index] === value) return;
      journalPush(1, index, state.actorY[index]);
      hashActorOut(state, index);
      state.actorY[index] = value;
      hashActorIn(state, index);
    }
    function jSetActorElevation(state, index, value) {
      if (state.actorElevation[index] === value) return;
      journalPush(2, index, state.actorElevation[index]);
      hashActorOut(state, index);
      state.actorElevation[index] = value;
      hashActorIn(state, index);
    }
    function jSetActorRemoved(state, index, value) {
      if (state.actorRemoved[index] === value) return;
      journalPush(3, index, state.actorRemoved[index]);
      hashActorOut(state, index);
      state.actorRemoved[index] = value;
      hashActorIn(state, index);
    }
    function jSetTerrain(state, cell, value) {
      if (state.terrain[cell] === value) return;
      journalPush(4, cell, state.terrain[cell]);
      if (state.hashValid) {
        if (state.terrain[cell] !== baseTerrain[cell]) {
          state.hashLo ^= terrainHashLo(cell, state.terrain[cell]);
          state.hashHi ^= terrainHashHi(cell, state.terrain[cell]);
        }
        if (value !== baseTerrain[cell]) {
          state.hashLo ^= terrainHashLo(cell, value);
          state.hashHi ^= terrainHashHi(cell, value);
        }
      }
      state.terrain[cell] = value;
    }
    function jSetLiftRaised(state, cell, value) {
      const next = value ? 1 : 0;
      if (state.liftRaised[cell] === next) return;
      journalPush(5, cell, state.liftRaised[cell]);
      if (state.hashValid) {
        // toggling relative to base flips the same contribution either way
        state.hashLo ^= liftHashLo(cell);
        state.hashHi ^= liftHashHi(cell);
      }
      state.liftRaised[cell] = next;
    }

    function journalMark() {
      return journalLength;
    }

    function journalRollback(state, mark) {
      while (journalLength > mark) {
        journalLength -= 3;
        const field = journal[journalLength];
        const index = journal[journalLength + 1];
        const oldValue = journal[journalLength + 2];
        switch (field) {
          case 0:
            hashActorOut(state, index);
            state.actorX[index] = oldValue;
            hashActorIn(state, index);
            break;
          case 1:
            hashActorOut(state, index);
            state.actorY[index] = oldValue;
            hashActorIn(state, index);
            break;
          case 2:
            hashActorOut(state, index);
            state.actorElevation[index] = oldValue;
            hashActorIn(state, index);
            break;
          case 3:
            hashActorOut(state, index);
            state.actorRemoved[index] = oldValue;
            hashActorIn(state, index);
            break;
          case 4:
            if (state.hashValid) {
              if (state.terrain[index] !== baseTerrain[index]) {
                state.hashLo ^= terrainHashLo(index, state.terrain[index]);
                state.hashHi ^= terrainHashHi(index, state.terrain[index]);
              }
              if (oldValue !== baseTerrain[index]) {
                state.hashLo ^= terrainHashLo(index, oldValue);
                state.hashHi ^= terrainHashHi(index, oldValue);
              }
            }
            state.terrain[index] = oldValue;
            break;
          case 5:
            if (state.hashValid) {
              state.hashLo ^= liftHashLo(index);
              state.hashHi ^= liftHashHi(index);
            }
            state.liftRaised[index] = oldValue;
            break;
          default:
            break;
        }
      }
    }

    // ---- State buffers (public shape preserved) -----------------------------
    function createStateBuffer() {
      return {
        actorElevation: new Int16Array(actorCount),
        actorRemoved: new Uint8Array(actorCount),
        actorX: new Int16Array(actorCount),
        actorY: new Int16Array(actorCount),
        liftRaised: new Uint8Array(cellCount),
        terrain: new Uint8Array(cellCount),
        hashLo: 0,
        hashHi: 0,
        hashValid: false
      };
    }

    function cloneState(state) {
      return {
        actorElevation: new Int16Array(state.actorElevation),
        actorRemoved: new Uint8Array(state.actorRemoved),
        actorX: new Int16Array(state.actorX),
        actorY: new Int16Array(state.actorY),
        liftRaised: new Uint8Array(state.liftRaised),
        terrain: new Uint8Array(state.terrain),
        hashLo: state.hashLo | 0,
        hashHi: state.hashHi | 0,
        hashValid: state.hashValid === true
      };
    }

    function copyStateInto(target, source) {
      target.actorElevation.set(source.actorElevation);
      target.actorRemoved.set(source.actorRemoved);
      target.actorX.set(source.actorX);
      target.actorY.set(source.actorY);
      target.liftRaised.set(source.liftRaised);
      target.terrain.set(source.terrain);
      target.hashLo = source.hashLo | 0;
      target.hashHi = source.hashHi | 0;
      target.hashValid = source.hashValid === true;
    }

    function actorElevation(state, index) {
      return state.actorElevation[index] || 0;
    }

    function stateKey(state) {
      if (state.hashValid !== true) {
        recomputeHash(state);
      }
      // 4 chars from each 32-bit lane: compact, Map-friendly, collision-checked
      // at the solver layer by exact-state comparison where it matters.
      const lo = state.hashLo >>> 0;
      const hi = state.hashHi >>> 0;
      return String.fromCharCode(
        (lo & 0xffff), (lo >>> 16), (hi & 0xffff), (hi >>> 16)
      );
    }

    // ---- Occupancy grid -----------------------------------------------------
    // occupancy[cell * ELEV_SLOTS + elevation] = (stamp << 8) | (actorIndex+1).
    // A stamped grid avoids clearing between moves. Occupancy tracks BLOCKING
    // actors only (same as the legacy occupied Set). The moving entity is
    // removed from the grid for genuinely vacated positions only (R4).
    const ELEV_SLOTS = MAX_ELEVATION + 2;
    const occupancyGrid = new Int32Array(cellCount * ELEV_SLOTS);
    let occupancyStamp = 0;

    function occupancyRebuild(state, excludedActor) {
      occupancyStamp += 1;
      if (occupancyStamp >= 0x7fffff) {
        occupancyGrid.fill(0);
        occupancyStamp = 1;
      }
      for (let index = 0; index < actorCount; index += 1) {
        if (index === excludedActor || state.actorRemoved[index] || isNonBlockingActor(index)) {
          continue;
        }
        const e = state.actorElevation[index] || 0;
        if (e < 0 || e >= ELEV_SLOTS) continue;
        const slot = cellIndex(state.actorX[index], state.actorY[index]) * ELEV_SLOTS + e;
        occupancyGrid[slot] = (occupancyStamp << 8) | (index + 1);
      }
    }

    function isOccupiedAt(x, y, elevation) {
      if (elevation < 0 || elevation >= ELEV_SLOTS || !isInsideBoard(x, y)) return false;
      const value = occupancyGrid[cellIndex(x, y) * ELEV_SLOTS + elevation];
      return (value >>> 8) === occupancyStamp && (value & 0xff) !== 0;
    }

    function occupancyAdd(x, y, elevation, index) {
      if (elevation < 0 || elevation >= ELEV_SLOTS || !isInsideBoard(x, y)) return;
      occupancyGrid[cellIndex(x, y) * ELEV_SLOTS + elevation] =
        (occupancyStamp << 8) | ((index ?? 0) + 1);
    }

    function occupancyRemove(x, y, elevation) {
      if (elevation < 0 || elevation >= ELEV_SLOTS || !isInsideBoard(x, y)) return;
      occupancyGrid[cellIndex(x, y) * ELEV_SLOTS + elevation] = 0;
    }

    // ---- Device snapshot (R1: one device clock per move) --------------------
    // gateRaised: Uint8Array(cellCount)-backed bitset via stamped ints;
    // orangeButtonsPressed: boolean. Snapshots are plain objects reused via a
    // small pool because slope traversal helpers need to be able to consult
    // them without threading dozens of params.
    const gateRaisedStamped = new Int32Array(cellCount);
    let gateStamp = 0;

    function computeGateRaisedIntoGrid(state) {
      // Marks raised gate cells in gateRaisedStamped with a fresh stamp.
      gateStamp += 1;
      if (playerGateCells.length === 0) return gateStamp;

      for (let g = 0; g < playerGateCells.length; g += 1) {
        const gateCell = playerGateCells[g];
        const x = cellX(gateCell);
        const y = cellY(gateCell);
        const layers = cellIsFilled(state, gateCell)
          ? null
          : gateLayersByCell.get(gateCell);
        if (!layers) continue;

        for (const gateLayer of layers) {
          const gateElevation = gateLayer.elevation;
          let sameLevelBlockOnGate = false;
          for (let index = 0; index < actorCount; index += 1) {
            if (
              !state.actorRemoved[index] &&
              !isPlayerActor(index) &&
              !isNonBlockingActor(index) &&
              state.actorX[index] === x &&
              state.actorY[index] === y &&
              (state.actorElevation[index] || 0) === gateElevation
            ) {
              sameLevelBlockOnGate = true;
              break;
            }
          }

          let raised = false;
          for (let index = 0; index < actorCount; index += 1) {
            if (state.actorRemoved[index] || !isPlayerActor(index)) continue;
            const playerElevation = state.actorElevation[index] || 0;
            const xyDistance =
              Math.abs(state.actorX[index] - x) + Math.abs(state.actorY[index] - y);
            const standingOnGate = xyDistance === 0 && playerElevation === gateElevation;
            if (
              xyDistance <= 1 &&
              !standingOnGate &&
              (playerElevation !== gateElevation || !sameLevelBlockOnGate)
            ) {
              raised = true;
              break;
            }
          }

          if (raised) {
            gateRaisedStamped[gateCell] = gateStamp;
            break;
          }
        }
      }

      return gateStamp;
    }

    function isOrangeButtonLayerPressed(state, cell, layerElevation) {
      const x = cellX(cell);
      const y = cellY(cell);
      for (let index = 0; index < actorCount; index += 1) {
        if (state.actorRemoved[index] || isNonBlockingActor(index)) continue;
        if (
          state.actorX[index] === x &&
          state.actorY[index] === y &&
          (state.actorElevation[index] || 0) === layerElevation
        ) {
          return true;
        }
      }
      return false;
    }

    function isOrangeButtonActorPressed(state, buttonIndex) {
      const x = state.actorX[buttonIndex];
      const y = state.actorY[buttonIndex];
      const elevation = state.actorElevation[buttonIndex] || 0;
      for (let index = 0; index < actorCount; index += 1) {
        if (index === buttonIndex || state.actorRemoved[index] || isNonBlockingActor(index)) {
          continue;
        }
        if (
          state.actorX[index] === x &&
          state.actorY[index] === y &&
          (state.actorElevation[index] || 0) === elevation
        ) {
          return true;
        }
      }
      return false;
    }

    function areOrangeButtonsPressed(state) {
      if (orangeButtonCells.length === 0 && orangeButtonActors.length === 0) {
        return false;
      }
      for (let i = 0; i < orangeButtonCells.length; i += 1) {
        const cell = orangeButtonCells[i];
        if (cellIsFilled(state, cell)) return false;
        const layers = orangeButtonLayersByCell.get(cell);
        for (const layer of layers) {
          if (!isOrangeButtonLayerPressed(state, cell, layer.elevation)) return false;
        }
      }
      for (let i = 0; i < orangeButtonActors.length; i += 1) {
        const button = orangeButtonActors[i];
        if (state.actorRemoved[button] || !isOrangeButtonActorPressed(state, button)) {
          return false;
        }
      }
      return true;
    }

    // The device snapshot threaded through a move resolution.
    function makeDeviceSnapshot(state) {
      return {
        gateStamp: computeGateRaisedIntoGrid(state),
        orangePressed: areOrangeButtonsPressed(state)
      };
    }

    function gateRaisedAt(snapshot, cell) {
      return gateRaisedStamped[cell] === snapshot.gateStamp;
    }

    // Legacy-compatible gate set (public API: computeRaisedPlayerGateSet).
    function computeRaisedPlayerGateSet(state) {
      const snapshot = makeDeviceSnapshot(state);
      const raised = new Set();
      for (const cell of playerGateCells) {
        if (gateRaisedAt(snapshot, cell)) raised.add(cell);
      }
      return raised;
    }

    // ---- Terrain queries (mask-based) ---------------------------------------
    function cellIsFilled(state, cell) {
      return state.terrain[cell] !== baseTerrain[cell];
    }

    function layersForCell(state, cell) {
      if (cellIsFilled(state, cell)) {
        return filledTerrainLayers[cell] || terrainLayers[cell];
      }
      return terrainLayers[cell];
    }

    function staticSurfaceMaskFor(state, cell) {
      return cellIsFilled(state, cell) ? filledSurfaceMask[cell] : staticSurfaceMask[cell];
    }
    function staticBlockMaskFor(state, cell) {
      return cellIsFilled(state, cell) ? filledBlockMask[cell] : staticBlockMask[cell];
    }
    function iceMaskFor(state, cell) {
      return cellIsFilled(state, cell) ? filledIceSurfaceMask[cell] : iceSurfaceMask[cell];
    }
    function holeMaskFor(state, cell) {
      return cellIsFilled(state, cell) ? 0 : holeMask[cell];
    }
    function sideBlockMaskFor(state, cell) {
      return cellIsFilled(state, cell) ? filledSideBlockMask[cell] : sideBlockMask[cell];
    }

    // Orange wall "lowers as block" rule (legacy :591-637): a pressed orange
    // wall layer with no non-orange terrain support at its elevation (or with
    // another orange wall directly below) occupies elevation-1 as a block.
    function orangeWallLayersFor(state, cell) {
      if (cellIsFilled(state, cell)) return null;
      return orangeWallLayersByCell.get(cell) || null;
    }

    function hasNonOrangeTerrainSupportAtElevation(state, cell, elevation, snapshot, ignoredLayer) {
      const layers = layersForCell(state, cell);
      for (const layer of layers) {
        if (layer === ignoredLayer || layer.type === terrainTypes.orange_wall) continue;
        if (layerSurfaceHeight(state, cell, layer, snapshot) === elevation) return true;
      }
      return false;
    }

    function hasOrangeWallLayerAtElevation(state, cell, elevation) {
      const walls = orangeWallLayersFor(state, cell);
      if (!walls) return false;
      for (const layer of walls) {
        if (layer.elevation === elevation) return true;
      }
      return false;
    }

    function shouldLowerPressedOrangeWallAsBlock(state, cell, layer, snapshot) {
      const elevation = layer.elevation;
      return (
        elevation > 0 &&
        (hasOrangeWallLayerAtElevation(state, cell, elevation - 1) ||
          !hasNonOrangeTerrainSupportAtElevation(state, cell, elevation, snapshot, layer))
      );
    }

    // Per-layer surface height with device snapshot (legacy :639-675).
    function layerSurfaceHeight(state, cell, layer, snapshot) {
      switch (layer.type) {
        case terrainTypes.empty:
        case terrainTypes.hole:
        case terrainTypes.orange_button:
          return null;
        case terrainTypes.wall:
        case terrainTypes.ice_block:
        case terrainTypes.ice_slope:
        case terrainTypes.shrub:
        case terrainTypes.block_asset:
          return layer.elevation + 1;
        case terrainTypes.tree:
          return layer.elevation + 3;
        case terrainTypes.player_gate:
          return gateRaisedAt(snapshot, cell) ? layer.elevation + 1 : layer.elevation;
        case terrainTypes.player_lift:
          return state.liftRaised[cell] === 1 ? layer.elevation + 1 : layer.elevation;
        case terrainTypes.orange_wall:
          return snapshot.orangePressed ? layer.elevation : layer.elevation + 1;
        default:
          return layer.elevation;
      }
    }

    // Full surface mask for a cell = static mask + dynamic device layers.
    function terrainSurfaceMaskAt(state, x, y, snapshot) {
      if (!isInsideBoard(x, y)) return 0;
      const cell = cellIndex(x, y);
      let mask = staticSurfaceMaskFor(state, cell);

      if (!cellIsFilled(state, cell)) {
        const gates = gateLayersByCell.get(cell);
        if (gates) {
          const raised = gateRaisedAt(snapshot, cell);
          for (const layer of gates) {
            mask |= 1 << (raised ? layer.elevation + 1 : layer.elevation);
          }
        }
        const lift = liftLayersByCell.get(cell);
        if (lift) {
          mask |= 1 << (state.liftRaised[cell] === 1 ? lift.elevation + 1 : lift.elevation);
        }
        const walls = orangeWallLayersByCell.get(cell);
        if (walls) {
          for (const layer of walls) {
            mask |= 1 << (snapshot.orangePressed ? layer.elevation : layer.elevation + 1);
          }
        }
      }

      return mask;
    }

    // Full blocking mask for a cell (legacy terrainLayerBlocksElevation).
    function terrainBlockMaskAt(state, x, y, snapshot) {
      if (!isInsideBoard(x, y)) return 0xffff;
      const cell = cellIndex(x, y);
      let mask = staticBlockMaskFor(state, cell);

      if (!cellIsFilled(state, cell)) {
        const gates = gateLayersByCell.get(cell);
        if (gates && gateRaisedAt(snapshot, cell)) {
          for (const layer of gates) mask |= 1 << layer.elevation;
        }
        const lift = liftLayersByCell.get(cell);
        if (lift && state.liftRaised[cell] === 1) {
          mask |= 1 << lift.elevation;
        }
        const walls = orangeWallLayersByCell.get(cell);
        if (walls) {
          for (const layer of walls) {
            if (!snapshot.orangePressed) {
              mask |= 1 << layer.elevation;
            } else if (
              shouldLowerPressedOrangeWallAsBlock(state, cell, layer, snapshot) &&
              layer.elevation > 0
            ) {
              mask |= 1 << (layer.elevation - 1);
            }
          }
        }
      }

      return mask;
    }

    function terrainBlocksElevation(state, x, y, elevation, snapshot) {
      if (!isInsideBoard(x, y)) return true;
      if (elevation < 0 || elevation > MAX_ELEVATION) return elevation < 0;
      return (terrainBlockMaskAt(state, x, y, snapshot) & (1 << elevation)) !== 0;
    }

    function terrainSupportsElevation(state, x, y, elevation, snapshot) {
      if (!isInsideBoard(x, y) || elevation < 0 || elevation > MAX_ELEVATION + 1) return false;
      return (terrainSurfaceMaskAt(state, x, y, snapshot) & (1 << elevation)) !== 0;
    }

    function isHoleAt(state, x, y, elevation) {
      if (!isInsideBoard(x, y)) return false;
      return (holeMaskFor(state, cellIndex(x, y)) & (1 << elevation)) !== 0;
    }

    function isIce(state, x, y, elevation, snapshot) {
      if (!isInsideBoard(x, y)) return false;
      return (iceMaskFor(state, cellIndex(x, y)) & (1 << elevation)) !== 0;
    }

    // Snapshot that reports every gate lowered and buttons unpressed —
    // matches the legacy isEmptyVoidAtElevation convention (:795-813).
    const NEUTRAL_SNAPSHOT = { gateStamp: -1, orangePressed: false };

    function isEmptyVoidAtElevation(state, x, y, elevation) {
      if (!isInsideBoard(x, y) || elevation !== 0) return false;
      const cell = cellIndex(x, y);
      if (holeMaskFor(state, cell) & 1) return false;
      const surface = terrainSurfaceMaskAt(state, x, y, NEUTRAL_SNAPSHOT);
      const block = terrainBlockMaskAt(state, x, y, NEUTRAL_SNAPSHOT);
      return ((surface | block) & 1) === 0;
    }

    // slope descriptors
    function slopeLayersAt(state, x, y) {
      if (!isInsideBoard(x, y)) return null;
      const cell = cellIndex(x, y);
      if (cellIsFilled(state, cell)) return null;
      return slopeLayersByCell.get(cell) || null;
    }
  }

  window.MazeEngine = {
    createEngine,
    terrainTypes
  };
})();
