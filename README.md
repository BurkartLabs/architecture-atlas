# Architecture Atlas

Maps of how software is built: one layered architecture chart per kind of software, explained without reference to any
language or product.

A static site with no build step and no dependencies. Open `index.html` directly, or serve the folder with any static
server.

## Layout

- `index.html`: home page and catalogue of every planned map.
- `assets/style.css`: colour tokens (light and dark), page chrome and chart styles.
- `assets/chart.js`: draws a map from its data file and wires up the map page.
- `assets/catalog.js`: the list of planned maps, by domain.
- `atlas/<slug>/index.html` and `atlas/<slug>/data.js`: one folder per map.

## Adding a map

1. Copy `atlas/game-engine/` to `atlas/<slug>/`.
2. Rewrite `data.js`: `bands` run top (highest level) to bottom (foundation); each group has a `title`, a `color`
   (1 to 15, see `--c1`...`--c15`), `optional: true` if not every implementation needs it, an `about` paragraph and its
   `items`. An item is `"Label|detail shown on hover"`.
3. Add the slug as the third value of its entry in `assets/catalog.js`, which marks it "Map ready" on the home page.

Data is loaded with `<script>` tags rather than `fetch`, so pages also work when opened from disk.
