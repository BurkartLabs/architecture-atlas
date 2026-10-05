# Architecture Atlas

Plates of how software is built: one layered architecture map per kind of software, written for engineers (human and
AI) who need to understand a system before changing it. Every component opens into what it does, the design decisions
behind it, its pitfalls, how to verify it, and what it depends on. The maps describe kinds of software, not products,
so they stay language- and vendor-agnostic.

It is a static site. There is no build step to view it and no runtime dependencies other than Google Fonts.

## What it does today

- A home page listing all 50 planned plates by domain, with a search box and a thumbnail for each plate that is drawn.
- Five plates are drawn: `game-engine`, `os-kernel`, `compiler`, `web-browser` and `relational-database`. The other 45
  are catalogued and have a placeholder page.
- Each drawn plate renders as an SVG chart of numbered layers, groups and components, with optional components marked
  and a hover tooltip.
- Clicking a component opens a detail drawer with its summary, design decisions, pitfalls, how to verify it, and its
  direct dependencies.
- Light and dark themes with a toggle.
- Data loads through script tags rather than `fetch`, so the site also works when opened from disk.

## Getting started

Prerequisites: a web browser. Node.js is needed only for the validation and page-generation scripts, which use ES
modules and have no npm dependencies, so there is nothing to install.

To view the site, open `index.html` in a browser, or serve the folder with any static file server, for example:

```
python -m http.server 8000
```

There is no `package.json`, test suite or `.env` file. The only checks are the two scripts described below.

## Layout

- `index.html`, `atlas/<slug>/index.html`: generated pages; do not edit by hand.
- `assets/atlas.css`: design tokens (light and dark), page and chart styles.
- `assets/atlas.js`: the data registry (`ATLAS.register`, `ATLAS.details`) and the theme toggle.
- `assets/chart.js`: draws a plate as SVG, plus the home-page thumbnails.
- `assets/site.js`: home page and plate page (tooltip, detail drawer, search).
- `assets/catalog.js`: all 50 plates, by domain. Plate numbers come from the order.
- `assets/manifest.js`: generated list of drawn plates and their data files.
- `atlas/<slug>/data.js`: a plate's structure. `atlas/<slug>/details*.js`: its component entries.
- `tools/check-map.mjs`, `tools/build.mjs`: validation and page generation.

## Adding a plate

1. Write `atlas/<slug>/data.js` (`ATLAS.register({...})`), using `atlas/game-engine/data.js` as the model: bands from
   top to bottom, 8-15 groups each with a unique `color` from 1 to 15, and `optional: true` where many implementations
   omit the system.
2. Write `atlas/<slug>/details*.js` (`ATLAS.details(slug, { id: { s, d, k, p, v, dep } })`) for every component and
   cross-cutting concern: hover summary, detail, decisions, pitfalls, how to verify, direct dependencies.
3. Run `node tools/check-map.mjs <slug>` until it reports a clean map. It checks structure, word counts, ids,
   dependencies, and that no product, brand or language names appear.
4. Run `node tools/build.mjs` to regenerate the pages and the manifest.

## Configuration

None. There are no environment variables or config files.

## Tech stack

Plain HTML, CSS and JavaScript (no framework, no bundler), SVG for the charts, Google Fonts (Fraunces, Geist, Geist
Mono), and Node.js scripts for tooling.

## Status

Early. The site and the plate format work, but only 5 of the 50 planned plates have content.

## Licence

All rights reserved. The source is public to read, not to reuse: see [LICENSE](LICENSE).
