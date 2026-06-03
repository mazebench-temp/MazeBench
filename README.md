# PixelGameTest

Browser-first maze game experiments with a new Prime Intellect Verifiers workspace for `mazebench`.

The web app still runs with Node:

```bash
npm install
npm test
npm run dev
```

There is also a terminal ASCII/isometric prototype that uses the same level parser and JS movement engine as the browser:

```bash
npm run maze:terminal -- --level level_HxI --view top-diagonal
```

Use arrow keys to move, `i/k` to rotate the camera up/down, `j/l` to rotate left/right, and `q` to quit. For a non-interactive smoke run:

```bash
npm run maze:terminal -- --level level_HxI --view top-diagonal --moves U --once
```

ASCII objects use unique `top -> side` glyph pairs. Terrain: `A -> a` floor,
`W -> w` wall, `E -> e` exit, `I -> i` ice, `K -> k` ice block, `T -> t`
tree, `S -> s` shrub, `O -> o` orange wall, `N -> n` orange button terrain,
`Y -> y` player gate, `L -> l` player lift, `H -> h` configured hole glyph,
and space for empty. Block assets: `! -> 1` Block 1, `@ -> 2` Block 2,
`# -> 3` Block 3, `$ -> 4` Block 4. Ice slopes: `R -> r` right, `< -> ,`
left, `^ -> 6` up, `V -> v` down. Actors: `P -> p` player, `B -> b` box,
`F -> f` floating floor, `G -> g` gem, `* -> 8` orange button actor,
`C -> c` clone 0, `D -> d` clone 1, `J -> j` clone 2. Weightless pushboxes:
`U -> u` M0, `0 -> 9` M1, `( -> )` M2, `+ -> =` M3, `. -> :` M4,
`; -> _` unknown weightless box. Punchers: `Q -> q` right, `X -> x` left,
`Z -> z` up, `% -> 5` down.
The repo-local terminal runner and the packaged mazebench runtime use this same
glyph contract.

Interactive terminal runs now write local replay artifacts when the run ends:
`outputs/maze-terminal/<timestamp>/maze_scorecard.json`,
`maze_actions.txt`, `maze_replay.json`, `results.jsonl`, and
optionally `maze_replay.mp4`. After the scorecard is written, the terminal asks
whether to render a video; if you say yes, it asks for FPS and dimensions. Use
`--replay-out-dir <path>` to choose a directory, `--no-video` to skip the video
prompt, or `--no-replay` to disable artifacts for an interactive run. The video
prompt defaults to 20 FPS and 400x400. It also asks for fast mode, which
captures only the settled result of each action instead of animation tweens, and
draft speed mode, which lowers replay DPR and disables fuzzy/edge effects for
faster capture. Video rendering reports capture/encode progress with ETA and a
rough expected MP4 size. For
non-interactive runs, opt in with `--record-replay`; add `--video --fast
--draft --fps <n> --width <px> --height <px>` when you want a faster MP4:

```bash
npm run maze:terminal -- --level level_HxI --view top-diagonal --moves U --once --record-replay
```

To play locally through the same prompt/action surface that Prime Verifiers models see:

```bash
npm run maze:model -- --level level_HxI --view top-diagonal --target-gems 1
```

This prints the model-facing system prompt and user prompt, then accepts text commands such as `up`, `rotate camera left`, `undo`, `reset`, `go to level H I`, or `quit`.

To let Codex itself play through a persistent local API, render a prompt and
hand it to Codex:

```bash
npm run --silent maze:codex -- prompt default
```

Or start a non-interactive Codex run directly:

```bash
codex exec --sandbox workspace-write "$(npm run --silent maze:codex -- prompt default)"
```

The prompt tells Codex to use `npm run --silent maze:codex -- start`, then one
API action at a time such as `npm run --silent maze:codex -- up` or
`npm run --silent maze:codex -- rotate left`. Session files live under
`outputs/maze-codex`, so Codex can compact its own context and recover the
authoritative game state with `npm run --silent maze:codex -- observe`.

Generate replay artifacts or a video from a Codex session JSON:

```bash
npm run --silent maze:codex -- video --session outputs/maze-codex/maze-20260603T001600.json
```

That writes `maze_scorecard.json`, `maze_actions.txt`, `maze_replay.json`,
`results.jsonl`, and, if you answer yes, `maze_replay.mp4`. To skip prompts,
pass video options directly, for example `--video --fast --draft --fps 12
--width 1280 --height 720`.

Prime/Verifiers setup lives under `environments/`. The `mazebench` package now uses the JS runtime as the benchmark contract: the default environment is a `vf.MultiTurnEnv` text-action game loop backed by `scripts/maze-bridge.js`, observations render through `scripts/maze-terminal.js`, and gem/visited-room state is tracked during the rollout. The default starter task is `level_HxI`.
