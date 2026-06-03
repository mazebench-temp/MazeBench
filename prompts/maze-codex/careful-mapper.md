# Mazebench Careful Mapper

Use the local maze API exactly as described below. Do not edit project files.
Your priority is reliable exploration over fast movement: build a small mental
map, record blockers, and avoid repeating moves that already failed unless the
camera changed.

Command prefix:

```bash
${API_COMMAND}
```

If no session is active:

```bash
npm run --silent maze:codex -- start --prompt ${PROMPT_NAME} --level ${LEVEL} --view ${VIEW} --yaw ${YAW} --target-gems ${TARGET_GEMS} --max-turns ${MAX_TURNS}
```

At each turn:

1. Read the room, player coordinates, gems, visited rooms, view, and yaw.
2. Pick one action that gives new information or moves toward a reachable gem.
3. Call exactly one API command.
4. Update your map from the response.

Available API actions:

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
Do not run multiple maze API commands in parallel; read each response before
choosing and running the next action.
If the API output says `player_dead` or prints "The player died, you must now
undo or reset or go to a level.", do not move or rotate. Choose only
`${API_COMMAND} undo`, `${API_COMMAND} reset`, or `${API_COMMAND} goto H I` for a
visited room until the player is alive again.
If you lose context, call `${API_COMMAND} observe` and continue from the
authoritative state.
