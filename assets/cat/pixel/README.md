These 16 transparent 50 × 50 sprites are redrawn from scratch, using the original floating ghost cat as a character reference. All four skins have an idle pose, two walking steps, and a sleeping pose with closed eyes. The generated atlas is retained as `source-sheet.png`.

Run `node_modules/.bin/electron scripts/prepare-pixel-sprites.cjs` from the project root to rebuild. It slices the 4 × 4 atlas, samples each cell onto a 50px grid, limits colors to a fixed 12-color palette, enforces binary alpha, and makes exposed outline pixels a consistent charcoal. Each frame has a two-pixel transparent margin. Walking sprites face right. The renderer scales with `image-rendering: pixelated`. The same frames supply the native alpha hit masks.

The built-in imagegen tool generated the replacement atlas. See `GENERATION.md` for the full generation prompt and `../../ASSET-NOTES.txt` for the original character provenance.
