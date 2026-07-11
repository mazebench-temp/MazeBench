(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MazeBenchDefaultWorldTemplate = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BUILD_WORLD_VERSION = "mazebench-build-world-v1";
  const DEFAULT_AUTHOR_HOTBAR_TOKENS = Object.freeze([
    "__select_only__",
    "__erase_top__",
    "p",
    "G",
    "#",
    ".",
    "i",
    "M1",
    "M2",
    "l"
  ]);

  // Same centered four-tile opening the editor's Frame tool leaves.
  function centeredEdgeOpeningRange(length) {
    const openingSize = Math.max(0, Math.min(4, length - 2));
    if (openingSize === 0) return null;
    const start = Math.floor((length - openingSize) / 2);
    return { end: start + openingSize - 1, start };
  }

  function defaultLevel({ column = "A", row = "A", worldWidth = 1, worldHeight = 1 } = {}) {
    const width = 16;
    const height = 16;
    const columnIndex = column.charCodeAt(0) - 65;
    const rowIndex = row.charCodeAt(0) - 65;
    const openLeft = columnIndex > 0;
    const openRight = columnIndex < worldWidth - 1;
    const openTop = rowIndex > 0;
    const openBottom = rowIndex < worldHeight - 1;
    const horizontalOpening = centeredEdgeOpeningRange(width);
    const verticalOpening = centeredEdgeOpeningRange(height);
    const cells = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        const inHorizontalOpening =
          horizontalOpening && x >= horizontalOpening.start && x <= horizontalOpening.end;
        const inVerticalOpening =
          verticalOpening && y >= verticalOpening.start && y <= verticalOpening.end;

        // Every cell is floored. Border cells stack a wall on that floor,
        // except for a centered four-cell doorway where another room exists.
        if (y === 0) return openTop && inHorizontalOpening ? "." : ".+#";
        if (y === height - 1) return openBottom && inHorizontalOpening ? "." : ".+#";
        if (x === 0) return openLeft && inVerticalOpening ? "." : ".+#";
        if (x === width - 1) return openRight && inVerticalOpening ? "." : ".+#";
        if (x === 7 && y === 7) return ".+p";
        return ".";
      })
    );

    return {
      cells,
      column,
      height,
      id: `level_${column}x${row}`,
      row,
      title: `${column}x${row}`,
      width
    };
  }

  function defaultEditorState({ height = 3, title = "Untitled World", width = 3 } = {}) {
    const levels = [];

    for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
        levels.push(
          defaultLevel({
            column: String.fromCharCode(65 + columnIndex),
            row: String.fromCharCode(65 + rowIndex),
            worldHeight: height,
            worldWidth: width
          })
        );
      }
    }

    return {
      version: BUILD_WORLD_VERSION,
      title,
      hotbar_tokens: [...DEFAULT_AUTHOR_HOTBAR_TOKENS],
      world: { height, width },
      levels
    };
  }

  return {
    BUILD_WORLD_VERSION,
    DEFAULT_AUTHOR_HOTBAR_TOKENS,
    centeredEdgeOpeningRange,
    defaultEditorState,
    defaultLevel
  };
});
