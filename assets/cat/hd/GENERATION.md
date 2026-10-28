# Miso artwork replacement

Generated with the built-in imagegen tool on 19 October 2026, using the original `idle.png`, `walk_1.png`, `hat.png`, `pumpkin.png`, and `box.png` as design references. The output is `source-sheet.png` (1254 × 1254, RGBA). The prompt requested 4096 × 4096; the tool returned 1254 × 1254. These files are not advertised as 4K.

`scripts/prepare-sprites.cjs` slices the actual transparent gutters, then centers each sprite on a 320 × 320 canvas with a shared baseline. No per-pose resizing, upscaling, or redrawing is applied. `frames.json` records source bounds. Walking source frames face **right**; mirror only when traveling left. All four skins have idle, two walking, and sleeping poses. Reactions animate the existing skin rather than replacing its artwork.

Regenerate the files from the saved sheet with:

```sh
npx electron scripts/prepare-sprites.cjs
```

## Exact generation prompt

Use case: identity-preserve. Asset type: production transparent desktop pet sprite sheet. Redraw these exact Miso ghost cat designs at substantially higher resolution with beautifully clean smooth anti-aliased curved dark charcoal outlines, warm ivory white body, two simple dark vertical eyes, small blush cheeks, pointed cat ears, tiny scalloped ghost paws and the curled wispy flame tail. Preserve the reference silhouette, proportions, colors, accessory designs and cute minimal identity. NOT pixel art, NOT low-poly, no blocky stair-step edges. Keep the simple original design rather than adding fur, realism, extra features, or extra effects. Output a square 4096x4096 sprite sheet with EXACTLY 4 columns and 4 rows of equal square cells, 16 sprites total. No visible grid. Column 1: plain white ghost cat. Column 2: identical cat wearing reference purple floppy witch hat with gold band and tiny star. Column 3: identical cat wearing orange pumpkin cap with green stem. Column 4: identical cat sitting in reference small cardboard box. Row 1: front facing idle. Row 2: right facing walking pose, nose/body facing RIGHT and curled tail on LEFT, first step. Row 3: same right facing walking pose, second alternating step, maintain exact scale/placement. Row 4: resting asleep with closed eyes, each KEEPING its accessory. For boxed cat, a gentle right facing shuffle inside box for walking rows. ALL sprites centered in their cells with a common body size and baseline at 86% of cell height; cat body excluding accessories approximately 52% of cell height, accessory fits within 12%-86% of cell. Generous transparent padding separates cells, absolutely no overlap. Crisp clean isolated shapes, actual alpha transparency. No background, checkerboard, ground shadows, dust, stray floating pixels, crop marks, registration marks, text, labels, hearts or symbols outside the character. This is a faithful high quality replacement sprite sheet, not a change of character design.
