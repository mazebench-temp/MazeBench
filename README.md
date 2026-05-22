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

To play locally through the same prompt/action surface that Prime Verifiers models see:

```bash
npm run maze:model -- --level level_HxI --view top-diagonal --target-gems 1
```

This prints the model-facing system prompt and user prompt, then accepts text commands such as `up`, `rotate camera left`, `undo`, `reset`, `go to level H I`, or `quit`.

Prime/Verifiers setup lives under `environments/`. The `mazebench` package now uses the JS runtime as the benchmark contract: the default environment is a `vf.MultiTurnEnv` text-action game loop backed by `scripts/maze-bridge.js`, observations render through `scripts/maze-terminal.js`, and gem/visited-room state is tracked during the rollout. The default starter task is `level_HxI`.
