# MazeCore rewrite — semantics decisions

Every behavioral decision for the engine rewrite, decided against the 2026-07-16 audit
(42 confirmed findings; full details in [AUDIT-FINDINGS.txt](AUDIT-FINDINGS.txt), legacy
behavior maps in [LEGACY-RULES.md](LEGACY-RULES.md)).

Product directives from the owner:
- **Full rewrite** behind the existing `window.MazeEngine` API.
- **Gems float.** When a gem's support leaves, the gem stays at its elevation. Never falls. (Owner decision.)
- Fix the rest, with special care that **pushing blocks on/around ice slopes** behaves consistently.

## The five unified rules

Most fixes below are corollaries of five rules. When a case is ambiguous, resolve it with these:

**R1 — One device clock.** Button/gate/orange-wall/lift state is sampled once at `move()` start and
used for every traversal decision in the move (walking, pushing, sliding, punching). Device state
changes caused by the move (button pressed/released, lift toggled) take effect in the post-move
device-sync pass, all at once. No mechanic may see transient mid-pipeline device state.

**R2 — One landing rule.** Any actor that ends a horizontal step in unsupported air lands at the
highest support at-or-below its travel elevation (`landing snap`). It never snaps upward. If there
is no support at-or-below (true void), it is removed — identically in play mode and search mode.
Exception: gems (R-gem below) and actors whose type opts out of gravity via the registry.

**R3 — One push budget.** A push event's budget = 1 + contiguous same-elevation player-type actors
directly behind the pusher *at the position where contact happens, at the time it happens*.
The budget is spent as the push chain resolves and the **remaining** budget propagates through
slides: if a pushed box slides across ice into a slope whose exit is blocked by pushables, the
follow-up push uses the original event's remaining budget (not a hardcoded 1, not the pre-move
origin train). Rule kept from legacy: a player sliding on **flat ice** does not initiate pushes
mid-slide (tested, intended). A player exiting a **slope** may push what blocks the exit (legacy
behavior, kept) — with the correct contact-time budget.

**R4 — Occupancy is never stale.** The moving entity's origin is freed only for genuinely vacated
cells; a bouncing/reversing slide re-collides with everything currently occupying cells on the
return path, including the pusher.

**R5 — Solved means collected.** `isSolved` = all gems removed (collected) AND exit condition per
level (as legacy, minus the co-location clause). Any **main player** (walked, punched, or carried)
whose move endpoint coincides exactly (cell + elevation) with a live gem collects it. Clones never
collect. Search mode and play mode produce identical successor states for identical inputs.

## Verdict table (by audit finding)

### Fixed — solver soundness
| Finding | Verdict |
|---|---|
| Search skips ice-slip-off deaths (legacy :6101) | **Fix** via R2: landing/removal identical in both modes. |
| undoMove zeroes elevated gem on backtrack (:8142) | **Fix**: journaled undo restores every mutated word exactly; stateKey round-trips by construction. |
| isSolved clone/punched/carried-on-gem co-location (:8185) | **Fix** via R5. Punched/carried main players now collect on exact landing; clones never. |
| Inadmissible A* heuristic on ice (:8219) | **Fix**: default heuristic = admissible axis-count bound (see Heuristic below). Legacy distance heuristic remains available as the weighted-mode heuristic. |
| Play-mode `moved:true` for visual-only bounces (:7532) | **Fix**: `moved` reflects state change in both modes; visual bounce records still emitted in play mode with `visualOnly:true` alongside `moved:false`. |

### Fixed — punchers
| Finding | Verdict |
|---|---|
| Punched actors never fall (hover/soft-lock vs deleted) (:5496) | **Fix** via R2: punched actors land like pushed boxes; removed over true void in both modes. |
| Punch tunnels through raised orange wall via transient press (:5514) | **Fix** via R1: punches use move-start device state. |
| Punched player erased by simultaneous lift toggle (:8071) | **Fix**: lift cells about to toggle are resolved before punch landing; a punched actor ending on a toggling lift rides it (or is blocked per R1); never removed on a hole-free board. |
| Punches blocked absolutely by ice slopes (:5418) | **Fix**: punched actors traverse slopes with the same rules as pushed boxes (entry along axis ascends/descends; blocked exits bounce per slide rules). |
| Gate traversal depends on punch start distance (:5513) | **Fix** via R1: gate set sampled at move start, one consistent outcome. |
| Punched player on gem doesn't collect (:8175) | **Fix** via R5. |
| Punched player on lift doesn't toggle (:7831/:7820) | **Fix**: endpoint-on-lift toggles regardless of arrival mode. |
| Sticky-carrier puncher relocated off-board (:5865) | **Fix**: ride writes clamp to board; carrier ride that would exit the grid detaches the puncher at the last in-bounds cell. |
| Puncher on lift entombed at stale elevation (:6357) | **Fix**: punchers (and buttons) ride device surface transitions beneath them. They still don't fall (they're fixtures), they ride. |

### Fixed — elevation & support
| Finding | Verdict |
|---|---|
| Hole fill deletes all other terrain layers (:534) | **Fix**: fill adds a floor layer at elevation 0 in the COW overlay; other layers untouched. |
| Endpoint snap to MAX cell surface (teleport up through blocks) (:2028) | **Fix** via R2: snap only downward to support at-or-below travel elevation. |
| Gems have no support/ride/fall | **Preserve floating** (owner). Gems never fall, never ride. Clarified: collection remains exact cell+elevation (R5 widens *who* collects, not *where*). |
| exit missing from side-blocking support types (:31) | **Fix**: exit side-blocks like floor/ice; nothing ever reaches negative elevation (clamped + validated). |
| Actors authored on holes never resolve (:6042) | **Fix** at load: authored floating_floor on a hole fills it; other actors over a true void are removed at load with a level-load warning list; over a supported lower surface they ground (except gems). |
| Actors authored at unsupported elevations frozen (:280) | **Fix** at load: non-gem actors ground to the highest support at-or-below (gems keep authored elevation). |
| Rider left standing on pusher's head (:6294) | **Fix**: fall pass uses the same "main players are not support" rule as movement; rider falls past the head to the floor. |

### Fixed — devices & timing
| Finding | Verdict |
|---|---|
| Lift raises player into bridge layer above (:7838) | **Fix**: a lift toggle that would move its rider into a blocked voxel does not fire (move succeeds; lift stays; no toggle recorded). |
| Device ride hoists actors into blocked voxels (:6211) | **Fix**: ride stops below the blocked elevation (actor stays at highest legal elevation ≤ target). |
| Stacked lifts `l+l` share one raised bit (:1549) | **Fix** at load: stacked lift layers normalized to the lowest lift layer only (+ load warning). |
| Orange wall lowers-as-block into occupied voxel (:1558) | **Fix**: grandfather rule made explicit — the embedded actor may leave but outside actors are blocked; the wall never *newly* embeds an actor when an unoccupied adjacent-legal displacement exists upward (ride per R1 sync); if truly trapped, actor keeps position and may walk out. (Matches legacy observable behavior; now deliberate and documented.) |
| Lift toggle applied before co-location checks (:7942) | **Fix**: endpoint interactions (gem collect, puncher trigger, button press) evaluate at the arrival elevation *before* the toggle raises the player. Step-down-collect behavior unchanged. |
| Frozen button state + post-move ride puts player on wall top (:7071) | **Fix**: R1 keeps traversal on move-start state (player may legally cross the cell), but the post-move device sync will not hoist an actor into/onto a rising wall unless the destination voxel is standable AND reachable — if the wall rises under a player mid-cell, the player is displaced back to the last legal cell of their path instead of gaining elevation. |

### Fixed — pushing × ice × slopes (owner's priority area)
| Finding | Verdict |
|---|---|
| Slope-exit push during box slide hardcodes budget 1 (:2877) | **Fix** via R3: remaining event budget propagates. The audit's F1 layout (3 players, box slides into slope, 2-box chain at exit) now succeeds; lone pusher still fails. |
| Mid-slide slope-blocker budget from pre-move origin (:7340) | **Fix** via R3: contact-time trailing train. In the audit's S3a layout the sliding lone player at contact has no trailing train → push fails → consistent with flat-ice rule. |
| Bounce-back slides box through pusher's cell (:2795) | **Fix** via R4: returning box stops in the cell in front of the pusher. |
| Flat-ice mid-slide pushes disallowed | **Preserve** (tested, intended). |
| Heavy boxes need terrain support to be pushed; weightless don't | **Preserve** (documented asymmetry). |
| Boxes may land on player heads; players may not stand on main players | **Preserve** (legacy, tested). |
| M0–M4 identical except groupId | **Preserve** (by design; toolbox text already says so). |

### Fixed — clones & multi-actor
| Finding | Verdict |
|---|---|
| Clone-carried rider dragged through solid terrain (:4546) | **Fix**: every ride step validated (terrain + occupancy at rider elevation); ride truncates at last legal cell, rider then lands per R2. |
| Carried main player skips endpoint interactions (:7083) | **Fix** via R5: carried main players collect gems/toggle lifts at their endpoint. |
| Punched clone floats over pit where player dies (:6058) | **Fix** via R2: clones fall/are removed under the same landing rules as players. |
| Button stranded midair when its clone carrier moves (:4878) | **Fix**: surface attachments ride any support actor (clones included). |

### Refuted in audit → unchanged
Frozen device state for pushed-box slides (now subsumed by R1), gate hold-down elevation
semantics, puncher attachment inference: legacy behavior confirmed correct, carried over.

## Heuristic (new default)

Admissible bound: a single move changes position along exactly one axis (slides/slopes included),
so for target set G (live gems, then exit): `h = max over g in G of (xdiff?1:0)+(ydiff?1:0)`,
plus 1 if any gem remains and the player is not on a gem axis-aligned... **keep it simple and
provably admissible**: `h = max_g [(x≠gx)+(y≠gy)]`, h=0 iff at a target. Weighted A* mode
(`algorithm:'weighted_astar'`) keeps the legacy Manhattan+elevation heuristic (explicitly
non-optimal, faster). `algorithm:'astar'` is now optimal; expansion counts will change in tests.

## Search/play parity invariant

`moveForSearch(s, d)` and `move(s, d)` must produce byte-identical successor state buffers for
every state and direction; play mode additionally produces records. Enforced by a fuzz test
(part of the new suite) — this is the invariant the legacy engine violated.

## Load-time validation (new)

At `createEngine`: normalize stacked lifts, resolve authored-on-hole actors (floating floors
fill; others fall in), ground floating boxes/floating-floors to real support below, reject
out-of-board actors. Each normalization is recorded in `engine.loadWarnings` (array of strings)
so the editor can surface them to authors.

Scope decisions forced by pinned behavior (differs from the draft verdicts above):
- **Players are warned, never grounded/moved** — cross-room punch continuations legitimately
  rebuild engines with players mid-flight at unsupported elevations, and engine-parity rebuilds
  a fresh engine every move; grounding would break both.
- **Punchers/buttons are fixtures** — legally authorable anywhere, including directly on holes
  (a puncher on a hole punches actors as they arrive; tested).
- **Weightless boxes and clones keep authored group formations** (their group-settle passes own
  their elevations); a box floating over a hole/void keeps its authored elevation (pinned:
  such boxes take part in scripted fall sequences).

## Known limitations (verified, deliberate)

1. **Board-edge punch stops keep flight elevation.** A punch that stops exactly at the board
   edge does not land — the elevation belongs to the cross-room continuation (pinned by the
   weightless-push transition tests). On a standalone board this preserves the legacy
   edge-hover. Interior punch stops land correctly in both modes.
2. **Rider-on-pusher's-head is observably unchanged.** The fall pass no longer *counts* player
   heads as support, but a rider above an occupied cell has nowhere legal to fall (the cell
   below is occupied), so it stays put until the pusher moves away — same as legacy. A true fix
   needs sideways displacement mechanics, deliberately out of scope.
3. **Multi-actor punch trains stop at ice slopes.** Single punched actors traverse slopes like
   pushed boxes (fixed); simultaneous trains still treat slopes as walls (documented).
4. **Punch gate/wall traversal uses move-start device state uniformly** (R1) — a gate lowered at
   move start stays traversable for that punch regardless of distance. Outcomes are consistent;
   they no longer depend on where the punch started.
