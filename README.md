# Architecture Atlas

Plates of how software is built: one layered architecture map per kind of software, for agentic engineers. Every
component opens into what it does, the design decisions behind it, its pitfalls, how to verify it, and what it depends
on. Language- and product-agnostic throughout.

A static site with no build step at runtime and no dependencies besides Google Fonts. Open `index.html` directly, or
serve the folder with any static server.

## Layout

- `index.html`, `atlas/<slug>/index.html`: generated pages (do not edit; see `tools/build.mjs`).
- `assets/atlas.css`: design tokens (light and dark), page and chart styles.
- `assets/atlas.js`: the data registry (`ATLAS.register`, `ATLAS.details`) and theme toggle.
- `assets/chart.js`: draws a plate as SVG, plus home-page thumbnails.
- `assets/site.js`: home page and plate page (tooltip, detail drawer, search, field notes).
- `assets/catalog.js`: all 50 plates, by domain. Plate numbers come from order.
- `assets/manifest.js`: generated list of drawn plates and their data files.
- `atlas/<slug>/data.js`: a plate's structure. `atlas/<slug>/details*.js`: its component entries.

## Adding a plate

1. Write `atlas/<slug>/data.js` (`ATLAS.register({...})`) using `atlas/game-engine/data.js` as the model: bands top to
   bottom, 8-15 groups each with a unique `color` 1-15, `optional: true` where many implementations omit the system.
2. Write `atlas/<slug>/details*.js` (`ATLAS.details(slug, { id: { s, d, k, p, v, dep } })`) for every component and
   cross-cutting concern: hover summary, detail, decisions, pitfalls, how to verify, direct dependencies.
3. `node tools/check-map.mjs <slug>` until it prints `ok` (structure, word counts, ids, dependencies, banned names).
4. `node tools/build.mjs` to regenerate pages and the manifest.

Data loads through script tags rather than `fetch`, so pages also work when opened from disk.
