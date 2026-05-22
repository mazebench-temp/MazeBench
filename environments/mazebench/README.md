# mazebench

### Overview
- **Environment ID**: `mazebench`
- **Short description**: JS-backed ASCII maze navigation benchmark for multi-turn language models.
- **Tags**: maze, game, ascii, reasoning, train, eval

### Datasets
- **Primary dataset(s)**: local world-map levels from the PixelGameTest maze game.
- **Default starter level**: `level_HxI`.
- **Source links**: `games/maze/levels`, `games/maze/world_map.json`, `scripts/maze-terminal.js`, and `scripts/maze-bridge.js`.
- **Split sizes**: configurable; defaults to 1 train / 1 eval task.

### Task
- **Default type**: custom `vf.MultiTurnEnv` text-action navigation against the real JS maze runtime.
- **Default commands**: `up`, `down`, `left`, `right`, `rotate camera <direction>`, `undo`, `reset`, `go to level X Y`, `quit`.
- **Goal**: collect `game_won_gem_count` unique gems across the run. Not every room has a gem, and some rooms have multiple gems.
- **Terminal states**: `game_won` fires when the run has collected `game_won_gem_count` unique gems. `game_lost` fires when the model types `quit`. Both terminal states end the loop and return a final scorecard.
- **Scorecard result**: includes `won` and `percent`. `percent` is `100 * collected_gems / game_won_gem_count`.
- **Rubric overview**: default reward is the number of unique gems collected, plus a small `0.1` shaped reward for each newly visited room after the start room. If `target_gems > 0`, the gem reward is normalized to that target, but the semantic win condition remains `game_won_gem_count`.

Each assistant response should be exactly one text command. The environment then replies as the next `user` message with the current ASCII room layout, metadata, and the allowed commands. Multi-turn prompts keep full conversation history by default. When the estimated prompt tokens reach `90%` of the model context limit, the environment automatically runs an internal memory-maintenance model call. The model summarizes the full gameplay so far, including any prior gameplay summary, then the next game-action prompt resumes as system instructions, the model-authored memory summary, and the current observation. New turns append normally until the next compaction.

### Quickstart
Run an evaluation with default settings:

```bash
prime eval run mazebench
```

Configure model and sampling:

```bash
prime eval run mazebench -m openai/gpt-4.1-mini -n 1 -r 3 -t 512 -T 0.2
```

Save replay data and the JS scorecard:

```bash
prime eval run mazebench \
  -m openai/gpt-5-nano \
  -n 1 -r 1 -T 0 \
  --env-args '{"max_turns": 8}' \
  -C "maze_actions,maze_scorecard,maze_replay" \
  -d
```

The saved `results.jsonl` row will include `maze_actions` as the normalized action list,
`maze_scorecard` as the final JS scorecard, and `maze_replay` as a compact replay
payload with initial state, actions, and scorecard.

Export standalone replay artifacts from a saved eval directory:

```bash
npm run maze:replay -- environments/mazebench/outputs/evals/<model>/<run-id>
```

This writes `maze_scorecard.json`, `maze_actions.txt` (one action per line),
and `maze_replay.mp4` (perspective Three.js H.264 from the native square maze canvas)
beside `results.jsonl`.
The default video is 60 FPS; movement actions run at 5x replay speed and
camera actions run at 2x replay speed.
Use `--no-video` to write only the JSON/TXT sidecars. If `maze_actions` was
not saved as a state column, the exporter falls back to recovering actions
from the saved assistant turns and replaying them through the JS bridge to
rebuild the scorecard.
Use `--move-speed`, `--camera-speed`, or `--speed` to tune replay timing.
Use `--tail-seconds 0` to remove the short final hold after the last action.

Preview the exact default multi-turn prompt/action surface locally:

```bash
npm run maze:model -- --level level_HxI --view top-diagonal --target-gems 1
```

Notes:
- Local runs prefer the live PixelGameTest repo when you run from its root. Built wheels also include the required JS runtime files so clean installs can load without a background server.
- Set `MAZEBENCH_REPO_ROOT=/path/to/PixelGameTest` when you want an installed package to use a specific checkout instead of its bundled runtime.
- The JS bridge tracks visited rooms and globally unique collected gem IDs. `go to level X Y` is only allowed for rooms already present in `visited_levels`.

### Command Contract
| Command | Arguments | Description |
| ---- | --------- | ----------- |
| `up`, `down`, `left`, `right` | none | Move one screen-relative step. |
| `rotate camera up`, `rotate camera down`, `rotate camera left`, `rotate camera right` | none | Change camera pitch or yaw. |
| `undo` | none | Undo the most recent movement action. Gem score remains monotonic. |
| `reset` | none | Reset the current room to its entry state. Gem score remains monotonic. |
| `go to level X Y` | world column and row letters | Spawn at a previously visited room, preserving camera and run score. |
| `quit` | none | End the rollout as `game_lost` and return the final scorecard. |

Accepted text forms include `up`, `rotate camera left`, `undo`, `reset`, `go to level H I`, and `quit`.

### Environment Arguments
| Arg | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `num_train_examples` | int | `1` | Number of training rows to build. |
| `num_eval_examples` | int | `1` | Number of eval rows to build. |
| `start_level_id` | str | `level_HxI` | Starter level used when `level_ids` is not provided. |
| `level_ids` | str/list | `None` | Optional comma/space-separated level IDs. Accepts `HxI` or `level_HxI`. |
| `view` | str | `top-diagonal` | Initial ASCII camera view. |
| `yaw` | int | `0` | Initial camera yaw. Movement actions are screen-relative. |
| `game_won_gem_count` | int | package default | Unique gems required for `game_won`. This value is also passed into the JS bridge/scorecard. |
| `max_turns` | int | `40` | Multi-turn rollout action budget. |
| `memory_compaction` | bool | `true` | Enable automatic model-authored memory compaction before prompts grow too large. |
| `memory_compaction_token_ratio` | float | `0.9` | Fraction of the model's inferred context limit that triggers automatic compaction. |
| `memory_compaction_max_tokens` | int | `1024` | Minimum output budget used for the internal memory summary call. |
| `model_context_tokens` | int/null | `None` | Optional explicit context limit override. By default Mazebench infers common model family limits from the selected model name. |
| `target_gems` | int | `0` | Optional gem-reward/prompt target for smoke runs. `0` uses the `game_won_gem_count` objective. The semantic `game_won` condition remains `game_won_gem_count`. |
| `repo_root` | str/null | `None` | PixelGameTest repo root. Falls back to `MAZEBENCH_REPO_ROOT` or current working directory. |
| `node_bin` | str | `node` | Node executable used to run the JS benchmark bridge. |
| `timeout_seconds` | int | `20` | Subprocess timeout for JS observation/scoring calls. |
| `system_prompt` | str | built in | Optional instruction override. |

### Metrics
| Metric | Meaning |
| ------ | ------- |
| `gem_score` | Reward: raw unique gems collected, or normalized if `target_gems > 0`. |
| `room_exploration_score` | Reward: unique rooms visited after the start room, weighted by `0.1`. |
| `collected_gems` | Number of unique gem IDs collected across the run. |
| `current_level_solved` | Whether the current room's JS solved condition is true. |
| `visited_level_count` | Number of rooms visited during the rollout. |
