# Editing toolbox items

Edit [`toolbox.json`](./toolbox.json) to change the editor toolbox. MazeBench is the source of truth; MazeJam receives the same catalog during its normal build.

Each item is keyed by its internal token and supports:

- `name`: the label shown in the hotbar and toolbox.
- `description`: the text shown in the toolbox detail pane.
- `demo.layout`: short, space-separated rows describing the preview room.
- `demo.moves`: the tiny animation as a string of `U`, `D`, `L`, and `R` moves.
- `demo.zoom`: optional camera zoom.
- `demo.ambient`: optional continuous idle animation for animated models.

Use `$` anywhere in a layout cell to mean the item currently being previewed. For example:

```json
"M0": {
  "name": "Weightless Box 0",
  "description": "A featherweight crate that glides when pushed.",
  "demo": {
    "layout": ["p $ . ."],
    "moves": "RR"
  }
}
```

Cells use the same compact values as a room. A stacked floor and button is written as `.+o`. Restart MazeBench after editing the catalog; rebuild MazeJam with `npm run build` to copy the change there.
