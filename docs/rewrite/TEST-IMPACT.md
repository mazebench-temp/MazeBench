# TEST-IMPACT — maze-engine rewrite test inventory

Scope: every assertion in `tests/maze-engine.test.js`, `tests/weightless-push.test.js`,
`tests/maze-solver.test.js`, `tests/world-solver.test.js`, `tests/engine-parity.test.js`,
`tests/runtime-drift.test.js`, and the engine-relevant parts of
`tests/author-play-data.test.js` that is affected by the rewrite's fix list (see
`scratchpad/review-artifacts/findings-full.txt`). Line numbers are as of commit `465a474`.

Fix legend used below:
- **F-search-slip** — searchMode ice-slip-off now kills (parity with play mode)
- **F-undo-gem** — undoMove restores gem elevation exactly (gem records carry from/toElevation)
- **F-solved** — isSolved co-location clause removed; punched/carried main players collect on
  exact landing; clones never collect
- **F-punch-land** — punched actors land at proper elevation (fall like pushed boxes, at the
  punch STOP); punches traverse ice slopes; punches use move-start device state; punched
  players toggle lifts on landing
- **F-slope-budget** — slope-exit push budget propagated through slides (no hardcoded 1);
  mid-slide slope-blocker budget computed at contact
- **F-bounce-pusher** — blocked-slope bounce-back cannot pass through the pusher's cell
- **F-hole-fill** — hole fill preserves other terrain layers in the cell
- **F-lift-block** — lift toggle refused into terrain-blocked elevation; `l+l` normalized at
  load; device rides never hoist into blocked voxels
- **F-exit-flank** — `exit` added to terrainSideBlockingSupportTypes
- **F-clone-ride** — clone-carried riders validated per step; carried main players run
  endpoint interactions; buttons ride clones; punched clones fall/die like players
- **F-load-validate** — load-time grounding of unsupported explicit elevations (gems exempt);
  actors authored on holes resolve at load
- **F-bounce-moved** — play-mode blocked-slope bounce returns `moved:false` (visualOnly
  records still emitted)
- **F-heuristic** — admissible ice heuristic; `astar` returns minimal move counts; expansion
  counts change

---

## MUST-UPDATE

### MU-1. Blocked-slope bounce must return `moved:false`
- **Where:** `tests/maze-engine.test.js:992-1018` (assertions at 1009, 1012, 1013-1017)
- **Test:** `[floor P][ice_slope right][2-high wall]`, `engine.move(state, 1, 0)`.
- **Asserts today:** `result.moved === true`; player back at `(0,0)` elev 0;
  `result.moves[0].visualOnly === true` with bounce path
  `[(0,0,e0),(1,0,e1),(0,0,e0)]`.
- **Changed by:** F-bounce-moved.
- **New assertion:** `assert.equal(result.moved, false)`. Keep the position assertion and the
  `visualOnly` record + path assertions unchanged (the fix explicitly still emits the visual
  bounce record). Implementation note: `result.moved` can no longer be a bare
  `moves.length > 0` — visualOnly-only results must report `moved:false`, matching
  `moveForSearch` which already returns `moved:false` here.
- **Ripple:** `play-movement.js`'s `performPlayerMove` must report the same `moved:false` or
  `engine-parity.test.js` fails on its moved-flag drift check (engine-parity.test.js:328-334).

### MU-2. Slope-exit push budget: 1-player box-mediated single blocker
- **Where:** `tests/maze-engine.test.js:1415-1441` (assertions at 1429-1440)
- **Test:** `[P][box A][ice_slope right][ice_block + box B@e1][ice_block]`, one player pushes
  right. Asserts today: `moved:true`, box A ends `(3,0,e1)`, box B pushed to `(4,0,e1)` —
  i.e. a single player effectively pushes TWO heavy boxes because the slide's slope-blocker
  push uses the hardcoded budget 1.
- **Changed by:** F-slope-budget. The audited fix propagates the *remaining* train budget
  (countSupportingPlayers minus cost already spent). With 1 player and box A costing 1, the
  remaining budget at the slope exit is 0, so box B can no longer move; this matches the
  direct-path rule (1 player pushing a 2-box chain at a slope fails).
- **New assertion (if strict remaining-budget semantics):** `result.moved === false`
  (blocked-slope bounce, F-bounce-moved + F-bounce-pusher: box A bounces but cannot pass the
  pusher; net state unchanged), box A at `(1,0,e0)`, box B at `(3,0,e1)`, player at `(0,0)`,
  plus a `visualOnly` bounce record for box A.
- **CAUTION (see Trickiest #1):** if the rewrite instead defines the slide budget as the full
  train budget available *to the slide head* (slider's own cost not double-counted), this test
  stays green exactly as written and only the multi-blocker case changes. Decide the budget
  formula first, then update or keep. The neighbouring weightless-mediated test
  (`maze-engine.test.js:1543-1569`, weightless slider costs 0, remaining ≥ 1) is green under
  BOTH readings and belongs to MUST-STAY-GREEN.

### MU-3. Weightless group authored floating over plain floor is grounded at load
- **Where:** `tests/maze-engine.test.js:675-688` (assertions at 686-687)
- **Test:** 2x1 floor board; `M0` members authored at `(0,0,e2)` and `(1,0,e3)`; asserts the
  initial state keeps elevations `[2, 3]`.
- **Changed by:** F-load-validate. Nothing supports the component (floor surface is 0);
  weightless-group settle applied at load drops the component by 2.
- **New assertion:** `state.actorElevation[0] === 0`, `state.actorElevation[1] === 1`.
- **CAUTION:** only holds if load grounding applies component settle to weightless groups
  (only gems are named exempt). If weightless groups are also exempted, keep as-is — record
  the decision either way (Trickiest #2).

### MU-4. Actor authored on a hole resolves at load
- **Where:** `tests/maze-engine.test.js:715-737` (assertions at 731-736)
- **Test:** `[wall][hole][floor]`; player authored on the wall (snapped to e1),
  `weightless_box M0` authored at `(1,0)` on the hole. Asserts today: box survives at load
  (`actorRemoved[1] === 0`), player moves right and stands at `(1,0,e1)` on top of the
  hovering box.
- **Changed by:** F-load-validate ("actors authored on holes resolve at load"): the lone
  weightless box falls into the hole at load, matching push-into-hole physics
  (cf. `maze-engine.test.js:2475-2500` removal semantics).
- **New assertion (proposed):** initial `state.actorRemoved[1] === 1`; then
  `engine.move(state, 1, 0).moved === false` and player unchanged at `(0,0,e1)` — with the
  box gone, stepping from the e1 wall top into the open hole is a >1-level drop, which the
  engine already rejects (cf. `maze-engine.test.js:891-908`).
- **CAUTION (Trickiest #2):** if "resolve" instead means *sink to the hole bottom alive at
  e-1* rather than remove, the new assertions differ (box alive at `(1,0,e-1)`, player move
  right likely still blocked from e1). Pin the resolution rule before rewriting the test.

### MU-5. A* expansion bound with the new admissible heuristic
- **Where:** `tests/maze-solver.test.js:91-111` (assertions at 108-110)
- **Test:** 16x16 all-floor, gem at (15,0), `algorithm:"astar"`. Asserts `moves === 15` and
  `expanded <= 20`.
- **Changed by:** F-heuristic ("expansion counts change").
- **New assertion:** keep `result.moves === 15` (must hold — admissible A* returns minimal
  cost, and it already did on ice-free boards). Re-derive the `expanded` bound against the
  new heuristic. If the new heuristic degenerates to plain Manhattan on ice-free boards
  (recommended: only discount distance across ice/slope-reachable cells), `expanded <= 20`
  stays green and no edit is needed; if the heuristic is globally weakened, raise the bound
  to the measured value. Consider also ADDING a regression here for the audited case: 8x2
  board (row 0 all ice, row 1 all floor, P(0,1), gem(7,1)) where `astar` must now return
  `moves === 3` (`URD`), equal to `bfs`.

---

## MUST-STAY-GREEN

Behaviors pinned by existing assertions that the rewrite must preserve. Grouped by area;
all references `tests/maze-engine.test.js` unless stated.

### Preserved quirks (explicit product decisions — do NOT "fix")
| Behavior | Pinned at |
|---|---|
| Sliding player on flat ice cannot push a box mid-slide | 1475-1493 (player stops at (1,0), box unmoved) |
| Boxes can land on / rest on player heads; load keeps box at e1 above player | 2544-2556 (`[0,1]`); 584-600 & 602-626 (players ride clone heads) |
| Gems never fall / exempt from load grounding | no direct engine pin; parse-level pin of gem authored at e3 in author-play-data.test.js:323-344; collection tests below assume gem elevation is stable |
| Heavy boxes need terrain support to be pushed | 3519-3541 (push onto weightless-stack top fails, `moved:false`) |

### F-search-slip (search now kills on slip-off)
No test pins the buggy search-mode survival — nothing to update. Play-mode death/landing
pins that now describe BOTH modes:
- 846-866: slip off elevated ice into `empty` → `removed:1`, `iceSlipOff:true`, `toRemoved:true`
- 975-990: slope slip-off over `empty` → `removed:1`, `iceSlipOff:true`
- 868-889: slip-off onto floor lands at e0 (`toElevation:0`, `toRemoved:false`)
- 952-973: slope exit slip-off landing path `[(0,0,e0),(1,0,e1),(2,0,e1),(2,0,e0)]`
- 1571-1592, 3543-3567: other slip-off landings (`iceSlipOff` flags)
- weightless-push.test.js:450-464 (walk into hole dies), 917-931 (ice slide into hole dies)
Recommended: add sibling `moveForSearch` variants of 846-866 / 975-990 asserting identical
removal, plus undo round-trip of the new search-mode `iceSlipOff` removal.

### F-undo-gem (undo round-trips exactly)
- 1791-1815: push+gem `moveForSearch`/`undoMove` — `stateKey` round-trip must stay exact.
  Gem records growing `fromElevation`/`toElevation` fields must not break this (no test
  deep-equals a full gem record, so adding fields is safe).
- 760-783 and 1817-1842: floating_floor fill undo restores terrain byte (`empty`/`hole`)
  and box position — must survive the F-hole-fill representation change.
Recommended: add an elevated-gem undo test (gem at e1 per the audited repro, mirroring
2594-2617) asserting `stateKey` round-trip.

### F-solved (collection required; carried/punched mains collect; clones never)
All existing isSolved pins already go through real collection and must stay green:
- 98-115: walk onto gem → `removed:1`, `isSolved:true`
- 117-143: pre-collected gems don't insta-solve; solving requires collecting the live gem
- 690-713: box pushed twice, gem collected on arrival
- 786-806: ice slide collects only the LANDING gem, not pass-through gems
  (also weightless-push.test.js:301-321)
- 824-844: slide across ice_block tops onto gem at e1 → `isSolved:true`. NOTE: today this
  could be satisfied by either clause; post-rewrite it must pass via actual collection.
  Recommended: strengthen with `assert.equal(state.actorRemoved[1], 1)`.
- 2594-2617: walk onto gem at e1 (exact elevation match) → `removed:1`, `isSolved:true`
- 2558-2592: gem inside blocked stack unreachable; `moved:false` (level not falsely solvable)
- maze-solver.test.js:30-42, 44-67, 69-89 (RR solves), 134-163 & 189-221
  (findHardestGemPlacement incl. e1 candidate collected via exact-elevation landing),
  165-187 (findReachablePositions)

### F-punch-land / punch semantics
- 2670-2736: flat-floor punch — **exact `deepEqual` of the full player punch move record**
  (fields: `iceSlide`, `punchSlide`, `punchSegments[...]`, `punchStart*`, `to*`). The rewrite
  must emit byte-identical record shape for flat punches; any new landing metadata field
  breaks this deepEqual (Trickiest #3).
- 2776-2793: `continuePunchSlide` at e2 across plain floor keeps elevation 2 and exits the
  level (`levelExitElevation: 2`) — punched actors must NOT drop mid-slide; landing happens
  only at a stop.
- 2795-2814: `continuePunchSlide` at e2 stopped by wallStack(3) → lands at e0 with
  `pathControlsElevation:true`, path ends `(2,0,e0)` — the pre-existing landing precedent the
  in-level punch fix must match.
- weightless-push.test.js:1875-1906, 1908-1946, 1948-1984, 1986-2028, 2030-2061: cross-level
  punch chains preserve elevation across levels and land (e2→e0) only where the slide stops.
- 2914-2933, 2935-2957, 2959-2983, 3016-3041, 3043-3068: punched actor stopping over
  hole/void is removed (same outcome whether by "over open pit" rule or by the new
  fall-then-die landing).
- 2985-3014: punched box stops on plain floor, `removed:0`.
- 2851-2912: chained punchers — `punchSegments` sequences and puncher visualOnly records.
- 3070-3091, 3093-3118, 3120-3145: attached-puncher skip rules (punch not fired when puncher
  attaches at box-start+direction).
- 3147-3195, 3197-3254, 3256-3293: sticky-carrier puncher relocation records.
- 3296-3323 / 3325-3354: punched weightless box + sticky puncher over one hole survives,
  over two holes both removed.
- 3356-3409, 3411-3456: simultaneous opposing punches / multi-group punch resolution.
- 3458-3485, 3487-3517: a punch pushes a multi-box heavy train (punch strength is NOT the
  player push budget — keep F-slope-budget away from punch resolution).
- 2738-2755, 2757-2774, 2816-2849: `continuePunchSlide` level-exit flags and segments.
No existing test pins slope-blocks-punch, stale device state, hover, or missing lift toggle,
so the new punch behaviors need NEW tests, not edits.

### F-slope-budget (unchanged neighbours)
- 1543-1569: weightless slider (cost 0) pushes a single heavy blocker at the slope exit —
  green under any remaining-budget formula (spent cost 0).
- 1475-1493: flat-ice mid-slide no-push quirk (see preserved quirks).
- 1373-1392 / 1394-1413: slope-arriving player pushes the box waiting at the exit
  (direct-contact push, full train) — no visualOnly records.

### F-bounce-pusher / bounce paths
- 1052-1086 (heavy box) and 1088-1122 (weightless): the *benign* bounce-back where pusher and
  box swap cells (pusher advances into the vacated square, box ends on the pusher's ORIGIN
  cell). The audit codified this as intended; the fix must only block passing through the
  pusher's *occupied* cell (F4/F5 net-stationary cases). Boundary case — Trickiest #4.
- 1020-1050: player self-bounce off blocked slope with net movement → `moved:true`,
  `iceSlide:true`, full bounce path (NOT visualOnly — ends away from start).
- 1443-1473: push-left down-slope; pinned box path `(2,0)→(1,0)→(0,0,e0)` and player bounce
  path `(3,0)→(2,0)→(1,0)→(2,0)→(3,0)` with `moved:true` (box moved).

### F-hole-fill (plain-cell fills keep the same observable results)
- 739-758: floating_floor fills a hole → `state.terrain[cellIndex] === terrainTypes.floor`
- 760-783: fills `empty` → floor; undo restores `terrainTypes.empty`
- 1817-1842: fill + undo restores `terrainTypes.hole`
- 4104-4139: box→hole stays `hole`; floating_floor→`floor`; clone→`hole`
NOTE: these assert the per-cell terrain BYTE (`state.terrain[engine.cellIndex(..)]`) and the
exported `terrainTypes`. If the rewrite moves hole-fill to per-layer edits, the byte view and
`terrainTypes` export must remain consistent for single-layer cells or these assertions need
mechanical rewrites (they pin behavior we keep, so prefer keeping the byte view).

### F-lift-block / lifts and device rides (unblocked cases)
- 628-647: walk onto lowered lift → toggle raised, `toElevation:1`, `liftToggles`,
  `path === undefined`
- 649-673: step from e1 onto raised lift → toggle lowered, `toElevation:0`,
  `iceSlipOff:undefined`, `toRemoved:false`
- Gates: 2305-2321, 2323-2340, 2342-2359, 2361-2373 (standingOnGate keeps lowered),
  2375-2400 / 2402-2429 (weightless box + rider ride gate up/down 0↔1), 2431-2456
  (gate under wall@2: traversal at e1 allowed)
- Orange walls: 1844-1858, 1926-1945, 1947-1966 (button actor), 1968-1986 (2-high),
  1988-2008 / 2010-2030 / 2032-2052 (elevated stacks), 2101-2120 (multi-button AND),
  2122-2146 / 2148-2174 / 2176-2202 (box + rider ride wall up/down), 2204-2227 / 2229-2252
  (pressed-wall traversal), 2475-2500 (box rides wall down into hole → removed),
  2502-2527 (player drops when wall lowers under them)
- Buttons: 2054-2074 (slide across button cell), 2076-2099 (button rides weightless box with
  a real move record — the model for F-clone-ride's "buttons ride clones")
- engine-parity.test.js:17-25 comment contract: engine applies pendingLiftToggles internally;
  runtime applies returned `liftToggles` via `setPlayerLiftRaised` — keep both halves.
- author-play-data.test.js:243-305: `.+W+l+W` parses to `player_lift@1` under `wall@2` —
  the parse output is pinned; F-lift-block's `l+l` normalization must happen in
  `createEngine`, NOT in `buildPlayData`.

### F-exit-flank
No test in scope uses `exit` terrain; nothing pinned. Add new coverage (weightless push into
raised exit flank must be refused like floor/ice, per
weightless side-block behavior pinned indirectly by 3519-3541).

### F-clone-ride / clones
- 145-162, 164-180: clone mirrors / blocked mirror blocks the whole move
- 182-201, 203-219, 221-239: clone stacks and groups move rigidly (incl. a member hovering at
  e1 over floor sustained by GROUP support — load grounding must respect clone-group support)
- 241-255, 257-275, 277-294, 296-310, 312-330, 428-447, 449-468: clone falls into
  empty/holes with group-support semantics (member over hole survives while group supported;
  fully unsupported groups removed with staggered elevations)
- 370-386, 388-404, 406-426: clones push boxes/weightless groups
- 470-506: clone riding a weightless raft across ice — pinned 5-point path
- 508-539, 541-582: clone trains over slopes — pinned paths, `pathEndElevation`
- 584-600, 602-626: main player carried by clone/clone-cluster on open floor (per-step
  validation must be a no-op when nothing blocks)
- 4141-4176: clone/circle_player riders on weightless box pushed into hole → all removed
No test pins the buggy behaviors (ride-through-terrain, carried-player non-collection,
stranded clone buttons, floating punched clones) — new behaviors need NEW tests.

### F-load-validate (supported authored states must NOT be disturbed)
- 2458-2473: `M2/M3` auto-stack at load → `[0,0,1,0,1]`
- 2529-2542: weightless stack `[0,1,0]`
- 2544-2556: box on player head `[0,1]` (actor support counts as support)
- 332-349: weightless member at `(1,0,e-1)` under floor level blocks the push (`moved:false`)
- 351-368: member at `e-2` does not block (`moved:true`) — sub-floor negatives are legal
  states; grounding must never lift or delete them
- 3930-3957: stack `-1/0/1` inside a hole (rests on hole bottom) blocks entry
- 4047-4065: member at `(1,0,e-1)` inside hole supports the player walking on at e0
- 4067-4102: actors at `-1/-2` inside a hole row move as a supported group
- 4178-4196: box authored at e5 over a hole — assertions only cover the player's death;
  grounding may remove/sink the box without breaking the test, but verify
- 4198-4215: floating wall layer at e5 only → walking under it falls into void (`removed:1`)
- author-play-data.test.js:414-423: actor over explicit void parses with `elevation:0` —
  parse output pinned; the engine-side resolution happens after this
- author-play-data.test.js:323-344: gem at e3 / weightless at e2 on `W+L` (raised lift) —
  supported chain, must survive engine load untouched

### F-heuristic / solver harness
- maze-solver.test.js:30-42 (progress events), 44-67, 69-89 (bfs), 113-132 (abort),
  134-163, 165-187, 189-221 — all must stay green; they rely on `undoMove` soundness
  (helped by F-undo-gem) and on `isSolved` = real collection (F-solved keeps these true).
- world-solver.test.js: source-shape assertions only (`importScripts("maze-engine.js", ...)`,
  `solveWithAStar` / `findReachablePositions` references). Stays green as long as the file
  names `maze-engine.js` / `maze-solver.js` and the exported API names survive the rewrite.

### Runtime layer (weightless-push.test.js) — engine-output consumers
- 356-385: slope-with-wall-exit landing on the wall top (e1) + undo ice-slide metadata
  (reverse path pinned)
- 387-411: chained slope path including the synthetic dip point `{x:2.5, elevation:0.08}` —
  the runtime derives this from engine path records; engine path SHAPE for slope traversal
  must stay stable
- 413-448: single `performPlayerMove` per input on long ice (no per-cell re-entry)
- 466-499, 501-552, 554-594, 596-640, 642-732, 734-773, 775-813, 815-915: animation sampling
  driven by engine `path` / `pathControlsElevation` / `pathEndElevation` / `punchSlide` /
  `punchStart*` fields — the record field CONTRACT is pinned here even where positions are
  synthetic
- 933-1017: `preTerrainLiftMoves` / `startLiftPhase` ordering contract
- 1744-1766, 1768-1776, 1778-1805, 1807-1833, 1835-1856: weightless cluster pull/push
  geometry via the runtime
- 1061-1103 & transition tests: `edgeTransitionForMove` / level-exit flags (`levelExit`,
  `levelExitElevation`) produced by the engine

---

## Harness mechanics

### engine-parity.test.js (tests/engine-parity.test.js)
- Loads `public/play-rules.js`, `public/maze-engine.js`, `public/play-core.js`,
  `public/play-movement.js`, `public/play-world-transitions.js`, `public/play-gameplay.js`
  into a stubbed browser global (lines 111-116).
- Picks the first 10 parseable real levels (sorted by file name) containing a main player
  from `games/maze/levels` via `server/app.getGame/getLevelState` (146-188).
- Two sides per level, deep-copied playData each:
  1. **Runtime:** `createPlayCore` + `registerGameplayFunctions`; each move goes through
     `movement.performPlayerMove(dx,dy,{animate:false})`, which builds a FRESH engine from
     the current runtime state every move and copies results back.
  2. **Engine:** one persistent `MazeEngine.createEngine(playData)` + one mutating state,
     driven by `engine.move`.
- 40 LCG-seeded pseudo-random moves per level. After EVERY move it asserts (a) `moved` flags
  equal (328-334) and (b) every actor's `{type,x,y,elevation,removed}` snapshot equal
  (238-278). **Move 0** compares `createInitialState` against the runtime's level init (313).
- Rewrite implications:
  - The runtime rebuilds an engine **every move**, so `createEngine`-time normalization
    (F-load-validate grounding/hole resolution, F-lift-block `l+l` normalization) runs 40x
    on the runtime side but once on the persistent side. Load validation must therefore be a
    **no-op on every reachable state**: count actor support (boxes/players/clone heads) as
    support, keep gems exempt, never touch legal negative-elevation members, and rely on
    F-punch-land eliminating hover states. Otherwise parity drifts mid-sequence.
  - Move-0 parity requires the runtime init to apply the SAME load normalization as
    `createEngine` (or for none of the 10 sampled levels to contain author-degenerate
    states — do not rely on that).
  - F-bounce-moved requires `performPlayerMove` to report `moved:false` for visual-only
    bounces, in lockstep with the engine.
  - The legacy file `public/maze-engine-legacy.js` plays NO role here: both sides load
    `public/maze-engine.js`. If the runtime were ever pointed at the legacy engine while the
    test loads the new one (or vice versa), parity would fail wholesale — keep both sides on
    the same file.

### runtime-drift.test.js (tests/runtime-drift.test.js)
- Thin wrapper over `scripts/sync-runtime.js:computeRuntimeDrift()`. It diffs the mirror
  bundle at `environments/mazebench/mazebench/runtime/` against the live tree for an explicit
  allowlist: `MIRRORED_DIRECTORIES` (games assets/levels, `server/`) plus `MIRRORED_FILES`
  (which includes `public/maze-engine.js`, `public/maze-solver.js`, all `public/play-*.js`,
  scripts, etc.). Reports `missing` / `modified` (byte-compare) / `stale` (in runtime but not
  in the allowlist) and the test fails on any nonzero drift.
- Rewrite implications:
  - Any edit to `public/maze-engine.js` makes its runtime copy `modified` → the test fails
    until `npm run sync-runtime` is run (commit the synced bundle with the rewrite).
  - `public/maze-engine-legacy.js` is **not** in `MIRRORED_FILES`, so creating it does NOT
    trip the drift test (files outside the allowlist are ignored; `stale` only flags files
    inside the runtime dir). If the MazeBench runtime bundle should ship the legacy engine,
    add it to `MIRRORED_FILES` in `scripts/sync-runtime.js` AND run sync; if not, no action.
  - Do NOT copy the legacy file into `environments/.../runtime/public/` manually without
    allowlisting it — that would register as `stale` and fail the test.

---

## Trickiest cases

1. **Slope-exit budget formula vs `maze-engine.test.js:1415-1441` (MU-2).** "Remaining
   budget = train − spent" kills today's 1-player/1-blocker success; "full train available to
   the slide head" keeps it. The finding's own verification notes today's test passes only
   because of the hardcode. Pick the formula explicitly; MU-2 gives both outcomes.
2. **Load-validation scope (MU-3, MU-4, and the negative-elevation pins at 332-368,
   3930-3957, 4067-4102).** "Grounded" must mean *drop to nearest support counting actor
   support and hole bottoms, never lift, never touch gems or supported sub-floor members*;
   "resolve on holes" needs a decision between remove-like-push vs sink-alive. Every reachable
   state must be a fixed point or engine-parity's per-move rebuild drifts.
3. **The exact punch-record deepEqual at `maze-engine.test.js:2670-2736`** combined with
   `2776-2793` (elevation preserved through level exit) and weightless-push
   1948-1984 (cross-level landing at the stop): punched-actor landing must trigger only at
   the slide STOP and must not add fields to flat punch records, or these break.
4. **Bounce-back pass-through boundary (`1052-1086` / `1088-1122`).** The pusher-swap bounce
   is codified intent; blocking must key off the pusher's occupied cell during the reversed
   leg, not its origin cell, or these two go red while fixing F4/F5.
5. **`moved` semantics change (MU-1) across three layers.** Engine play mode, search mode,
   and `play-movement.js` must all agree that visualOnly-only results are `moved:false`;
   engine-parity's moved-flag check and agent-run "blocked" labeling both key off it.
