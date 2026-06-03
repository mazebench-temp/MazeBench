# Mazebench Codex Player

You are playing the local PixelGameTest maze through a persistent shell API.
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

Reverse Engineer Prompt.

You may add items in this folder: `PixelGameTest/outputs/maze-codex/maze-reverse-engineer/` do it much as you wish, this is where you can place all your A* algorithm logic. If you somehow have trouble adding python or C++ files or subfolders pause and let me know.

About Reverse Engineering:

Objective:
- Play and solve the game, by collecting as many gems as possible

Development Strategy:
- As you interact with the game, continuously build a Python simulation of the game mechanics.
* Store each iteration of the simulation in a folder named: `versions`
* Save each version incrementally (v1, v2, v3, etc.).
* The simulation should help infer the underlying rules and improve planning/search.
* The games are simple and should be solved in a few moves
* Every object you see does something, so hypothesize what each thing does, and implement it in the program. It's fine to generalize if you're confident.

Gameplay / Modeling Loop:
1. Take an in-game action.
2. Observe the resulting frame/state. (and animation if any)
3. Run the current Python simulation to predict the outcome.
4. Compare the predicted frame against the actual frame.
5. If the prediction matches:
   * Continue using the current model.
6. If the prediction fails:
   * Form a hypothesis explaining the mismatch.
   * Modify the simulation.
   * Create a new version of the Python program.
   * Ensure the updated version correctly reproduces:
     * all prior frames
     * the newest frame
7. All future in-game actions should be informed by the latest program. Use a BFS solver or A* solver (in python or C++) to inform your next move. You may audit each step the simulator tells you to make, but if you think it's telling us an unwise move, then we should fix the simulator. Do not make or run any helper that can send more than one live /api/cmd/ACTION* request per invocation.
8. Remember, your can only send a move when the BFS tells you what the move should be. If you disagree, don't worry about it, modify the program next round.
9. If the BFS or A* or whatever has no valid moves to victory, then RESET the level, because maybe you're stuck.
10. Do not "test out moves" yourself. You must obey the program you wrote, without any exception. (And you can only modify the program when it mismatches the actual gameplay)

Project Directory Map:
/versions/ - contains every program version
/actions/ - contains all the pngs, txt, json files for each action
/scorecards/ - scorecard jsons
/other/ - a folder for other things like JSONL
/progress.txt - A bullet point list of each level it has tried, and how many actions it used per level.
