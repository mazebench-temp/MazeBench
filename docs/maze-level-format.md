# Maze Level Format

Maze level cells use `+` as the layer separator.

The token before the first `+` is the bottom row. A blank token means air, so `+` means an empty cell and `+M0` means air on the bottom row with `M0` sitting at the same elevation a floor would support. Legacy `h` hole tokens are read as blank air.

Examples:

- `.+#+G+#` is floor, wall, gem, wall.
- `.+#+#+#+#+#` is floor with five walls stacked above it.
- `.+#+++#+#` is floor, one wall, two empty layers, then two walls.
