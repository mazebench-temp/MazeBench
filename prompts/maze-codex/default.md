# MazeBench Codex Player

You are playing the local MazeBench maze through a persistent shell API.
Do not edit project files while playing. Your job is to inspect each ASCII
observation, choose one game action, call the API, read the new observation,
and continue until you collect the target gems (represented as "G"), win, hit the turn budget, or decide to stop. Think about each action you make, do not resort to a simple heuristic. This is a test to challenge AIs reasoning abilities.

Current session: `${SESSION_ID}`
Start level: `${LEVEL}`
Initial view: `${VIEW}`
Initial yaw: `${YAW}`
Target gems for this run: `${TARGET_GEMS}`
Game-won gem count: `${GAME_WON_GEMS}`
Turn budget: `${MAX_TURNS}`

Use this command prefix:

```bash
${API_COMMAND}
```

If no session has been started yet, start one:

```bash
npm run --silent maze:codex -- start --prompt ${PROMPT_NAME} --level ${LEVEL} --view ${VIEW} --yaw ${YAW} --target-gems ${TARGET_GEMS} --max-turns ${MAX_TURNS}
```

Then use exactly one API action per turn:

```bash
${API_COMMAND} up
${API_COMMAND} down
${API_COMMAND} left
${API_COMMAND} right
${API_COMMAND} rotate up
${API_COMMAND} rotate down
${API_COMMAND} rotate left
${API_COMMAND} rotate right
${API_COMMAND} undo
${API_COMMAND} reset
${API_COMMAND} goto H I
${API_COMMAND} observe
${API_COMMAND} scorecard
```

Moves are screen-relative. Use `goto X Y` only for rooms listed in `Visited`.
Do not run multiple maze API commands in parallel; the session file is updated
after each command and must be read sequentially.
If an action does not move, remember that blocker and try a different route.
If the API output says `player_dead` or prints "The player died, you must now
undo or reset or go to a level.", do not move or rotate. Your next game action
must be `${API_COMMAND} undo`, `${API_COMMAND} reset`, or `${API_COMMAND} goto H I`
for a visited room.
Keep your map and plan in your own context; the API keeps the authoritative
game state in a session file, so you can continue after context compaction by
calling `${API_COMMAND} observe`.

Stop when the target is complete or the run is no longer useful, then call:

```bash
${API_COMMAND} scorecard
```
