# MazeCore build plan (revised strategy)

## Strategy: substrate rewrite + verbatim logic port + audited fixes

The CPU profile showed ~65% of solve time is substrate (GC, string keys, string
occupancy Sets, O(cells) stateKey scans, snapshot clones, unconditional passes) —
NOT the rules logic. The rules logic (slopes, clusters, clones) is intricate,
self-consistent, and mostly correct. Therefore:

- **Replace the substrate entirely** (the perf win, ~10-25x on search):
  1. `stateKey`: incremental 64-bit hash (two Uint32 lanes) maintained by
     journaled setters; key = 4-char string. Full recompute fallback for
     buffers built outside the engine (`hashValid` flag on buffers).
  2. `undoMove`: journal-based exact rollback (fixes gem-elevation corruption
     by construction). Journal = flat Int32Array of (field, index, oldValue).
     moveResult carries hidden `_jStart`/`_jEnd` marks.
  3. Occupancy: stamped Int32Array grid `(cell*ELEV_SLOTS+e)`, behind the SAME
     helper names (`isOccupiedAtElevation(occupied,x,y,e)` etc.) — the
     `occupied` token param is kept for signature compatibility; one active
     grid per move() call.
  4. Push-attempt snapshots: journal marks + `journalRollback` +
     `occupancyRebuild` instead of Int16Array state clones.
  5. Pass gating: capability mask per level (GATES/LIFTS/ORANGE/PUNCHERS/
     HOLES/SLOPES/ICE/WEIGHTLESS/CLONES/ATTACHMENTS) computed at createEngine;
     post-move passes skip wholesale when the level lacks the mechanic.
  6. All state writes routed through jSet* setters (journal + hash).
     NO direct `state.actorX[i] = ...` assignments outside the setters,
     createInitialState, and load-time normalization.
- **Port the mid-level logic verbatim** (slopes, slides, cluster collect/move,
  clone groups/riders, push chains, travel loop, punchers, passes) keeping
  legacy signatures `(gateState, orangeButtonsPressed)` — gateState stays a
  real Set (EMPTY_SET reused when the level has no gates).
- **Apply the ~30 semantic fixes** from SEMANTICS.md at the audited sites
  (each fix commented `// FIX(SEMANTICS §...)`).
- **Registry layer**: ACTOR_TYPES flag table replaces the scattered isXType
  predicates (extensibility win, zero perf cost). Terrain masks
  (compileStaticMasksForLayers, already drafted in the first skeleton) are a
  PHASE B optimization applied behind green tests, guided by re-benchmark.

## Phase A steps (correctness + substrate)
1. `maze-engine-next.js` = legacy copy; graft in: registry flags, journal,
   hash, setters, occupancy grid, journal-undo, stateKey, gating, loadWarnings.
2. Systematic write-routing: grep `state.actor|state.terrain\[|state.liftRaised\[` assignments → jSet*.
3. Apply fixes at audited sites (checklist below).
4. Terrain fill fix: `terrainLayersForCell` returns precompiled filled-variant
   layers (hole@0→floor@0, others preserved) instead of single synthetic floor.
5. Flip: legacy → `maze-engine-legacy.js`; next → `maze-engine.js`.
6. Green existing suite (per TEST-IMPACT.md), audit repros show fixed/preserved
   as decided, differential fuzz vs legacy with fix carve-outs.

## Phase B (perf, behind green tests)
- Mask-based terrainSupports/Blocks/isIce/surfaceHeights hot paths.
- Search-mode allocation audit (10k moves under --expose-gc ≈ 0 heap delta).
- Solver: numeric dedup keyed on (hashLo,hashHi) + memcmp, bucket queue.
- Re-run bench harness; target ≥1M actions/s medium board.

## Progress (2026-07-16)
DONE in public/maze-engine-next.js (smoke-tested: journal undo round-trips, incremental hash == recompute):
- [x] Substrate: hash+journal+setters, grid occupancy (ELEV_BASE=2 for negative elevations),
      journal-based undoMove w/ record fallback, stateKey 4-char hash, all ~30 write sites routed,
      3 snapshot sites → journal marks (captureAttemptBefore for ride-support reads),
      play-mode move() sets hashValid=false (maze-bridge direct writes), createInitialState
      recomputes hash + resets journal.
- [x] moved:false for pure-visual bounces (result block counts non-visualOnly)
- [x] pushSlopeBlocker contact-position budget via countSupportingPlayersAt (R3b)
- [x] hole fill preserves layers (filledLayersForCell cache) — terrainLayersForCell
- [x] exit in terrainSideBlockingSupportTypes
- [x] stacked-lift load normalization + loadWarnings exposed on engine
- [x] applyLoadNormalization: grounding (gems+weightless exempt), authored-on-hole
      (floating_floor fills, others fall), authored-over-void removed, OOB removed

## Remaining fix map (implementation decisions made)
- moveBox slope budget 1 → Math.max(1, pushContext.remainingBudget ?? 1); attemptPushActor
  stashes remaining budget into pushContext before moveBox (read attemptPushActor first).
- iceSlipOff → set in BOTH modes (zero external consumers per API-CONTRACT); keep iceSlide
  play-only. moveBox + player-branch (move iceSlipOff logic out of !searchMode gates).
- LIFT ORDER REDESIGN: apply pendingLiftToggles BEFORE puncher passes (right after first
  collapseSequentialActorMoves). Fixes punched-player-erased (audit #3). Then post-punch
  endpoint lift toggle for punched players landing on lifts (immediate apply + liftToggles record).
- Lift toggle REFUSED if toElevation terrain-blocked at (nextX,nextY) → stand on lift unraised.
- applyPunchers: thread move-start raisedPlayerGates+orangeButtonsPressed (R1) — kills
  punch-through-orange-wall + gate distance dependence. Punch landing: after group slide,
  land each punched actor via landingElevationAtLocation + pit removal BOTH modes (also fixes
  punched clones over pits). Slope traversal for punched SINGLE actors via slide machinery;
  multi-actor punch trains still stop at slopes (documented). Puncher relocate: skip if
  !isInsideBoard (detach).
- ENDPOINT SWEEP (R5, after final passes): for each live MAIN player with a non-visual move
  record this turn → collectGemsAt(final pos/elev). Covers punched + carried players.
  Walking lift-arrival gems: collect at lift-surface arrival elevation pre-toggle.
- dynamicTerrainRideElevation: ride to highest non-blocked elevation in [current..target],
  else stay (no embedding in bridges).
- Dynamic sync loop: RIDES_DEVICE actors (puncher/button) also ride device transitions
  (they never fall — fixtures). canActorCarrySurfaceAttachment += clone.
- dynamicUnsupportedFallElevation: includePlayers = !isPlayerActor(fallingActor)
  (players don't rest on heads; boxes still may).
- playerSurfaceHeightAt fallback: when currentElevation != null, filter heights <= current
  (never snap upward through blocks); null currentElevation (spawn) keeps max.
- isSolved: remove co-location clause. heuristic: admissible axis-count default.
- clone rider path: validate each ride step (terrain blocks + blockingActor), truncate.
- bounce-through-player (R4): DECISION PENDING — read tests/maze-engine.test.js:1052-1122
  first; rule must keep codified pusher/box swap legal while blocking pass-through.
- applyHoleFalls clone early-return: keep general exemption, but punch-landing fix covers
  punched clones (remove exemption only for punchSlide records if needed by repro).

## Fix checklist (site → fix) — keep in sync with SEMANTICS.md
- [ ] moveBox pushSlopeBlocker budget `1` → pushContext.remainingBudget (R3)
- [ ] pushSlopeBlocker in move() budget from contact position, not origin (R3)
- [ ] findSlideDestination reversed leg: collide with pusher/mover cells (R4)
- [ ] iceSlipOff flags + hole-fall removal in BOTH modes (R2/parity)
- [ ] moved=false for pure visualOnly bounce results (both modes)
- [ ] applyPunchers: use move-start device snapshot (R1); slope traversal for
      punched actors via slide machinery; landing snap after punch (R2);
      endpoint lift toggle + gem collect for punched main players (R5);
      bounds clamp on sticky-carrier puncher relocation
- [ ] lift toggle refused when rider destination elevation terrain-blocked
- [ ] pendingLiftToggles applied before punch-landing resolution (no silent erase)
- [ ] dynamicTerrainRideElevation: never ride into blocked voxel (stop below)
- [ ] gems: exempt from ride/fall (float) but undo restores elevation via journal
- [ ] carried main players: endpoint interactions run (collect/toggle) (R5)
- [ ] clone riders: per-step ride path validation, truncate at block
- [ ] punched clones: same fall/removal as players (R2)
- [ ] buttons/punchers ride device surfaces; attachments ride clones too
- [ ] exit in SIDE_BLOCKING_SUPPORT_TYPES; weightless never below elevation 0
- [ ] isSolved: remove co-location clause (R5)
- [ ] heuristic: admissible axis-count default; legacy heuristic for weighted mode
- [ ] load validation: stacked lifts normalized; non-gem actors grounded when
      authored floating; authored-on-hole resolution; loadWarnings[]
- [ ] hole fill preserves other layers (filled-variant compiled layers)

## Files
- Substrate draft (registry/masks/journal/hash/grid): first skeleton preserved
  in `docs/rewrite/substrate-draft.js` (source for grafting).
- Legacy rule maps: LEGACY-RULES.md. Verdicts: SEMANTICS.md.
- Contracts: API-CONTRACT.md, TEST-IMPACT.md (agent-written).
- Repros: tests/repros/*.js (59 scripts; load engine via tests/helpers/browser-module-loader).
