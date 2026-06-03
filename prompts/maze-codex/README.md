# Codex Maze Prompts

These prompts are for running Codex itself as the maze player. The game state
lives in `outputs/maze-codex/*.json`, so Codex can compact or lose transcript
details and still continue by calling the API again.

Render a prompt for Codex:

```bash
npm run --silent maze:codex -- prompt default
```

Start a manual API session:

```bash
npm run --silent maze:codex -- start --prompt default --level level_HxI --view top-diagonal --target-gems 1 --max-turns 40
```

Then play one action at a time:

```bash
npm run --silent maze:codex -- up
npm run --silent maze:codex -- rotate left
npm run --silent maze:codex -- scorecard
```

Do not run multiple commands against the same session in parallel. Each command
replays the action log, applies one new action, and writes the updated session.

To try a different strategy, copy one of these Markdown files, edit the
instructions, and pass its name with `--prompt`.
