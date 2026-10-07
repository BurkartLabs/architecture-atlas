# Writing a plate

The brief every plate is written against. A plate is one layered architecture map of one *kind* of software, with a
full entry for every component.

## Readers

Agentic engineers: engineers, and the AI agents working with them, who design, build and change these systems. They
want the real structure, the real decisions and the real failure modes, not an introduction.

## Rules

- **Kinds, not products.** Never name products, projects, vendors, companies, CPU architectures by brand, or
  implementation languages. Open standards and protocols (HTTP, TLS, SQL, POSIX, TCP, DNS, UEFI, USB, JSON, HTML, CSS,
  JavaScript, WebAssembly) are fine. `tools/check-map.mjs` rejects a list of common names, but it cannot catch them
  all, so check yourself.
- US spelling. No marketing tone, no filler ("plays a crucial role", "robust", "seamless").
- Write only inside `atlas/<slug>/`. Do not run git. Other plates are being written at the same time.

## Files

Read `atlas/game-engine/data.js` and one details file (for example `atlas/relational-database/details.js`) first. They
are finished plates and show the exact format and level of granularity.

1. `atlas/<slug>/data.js`: `ATLAS.register({ slug, title, lede, ground, crossIntro, cross, bands, groups })`.
   - `bands`: 5-7 layers listed **top (closest to the people or programs using the software) to bottom (foundation)**,
     each `{ label, intro (12-60 words), groups: [group ids] }`, at most 6 groups per band.
   - `groups`: 9-15 groups, each `{ title, color (1-15, unique within the plate), optional: true only if many real
     implementations omit it, about (20-70 words), items: [{ id, n }] }`, with 3-18 items each.
   - Aim for **80-110 components** in total. `n` is at most 32 characters (it sits in a small box), and shorter titles
     (under about 28 characters) for groups that will be narrow. Ids are kebab-case and unique across the plate.
   - `cross`: 5-7 cross-cutting concerns `{ id, n }`: decisions that shape every layer. `crossIntro` is 25-90 words.
   - `ground`: 3-6 short strings naming what the software sits on. `lede`: 15-60 words.
2. `atlas/<slug>/details.js` (split into `details-2.js` and so on if long; write in chunks):
   `ATLAS.details("<slug>", { "<id>": { s, d, k, p, v, dep }, ... })` with an entry for **every item and every cross
   entry**:
   - `s` (10-35 words): a tooltip summary that stands alone.
   - `d` (50-130 words): how it works, what it talks to, and what makes it hard.
   - `k`: 2-4 design decisions (6-45 words each), each phrased as the choice and its trade-off, in the form
     "Option A vs option B: consequence; consequence."
   - `p`: 1-3 pitfalls (6-40 words each): concrete ways it goes wrong in practice.
   - `v` (10-60 words): a concrete, observable check that proves it works. Not a proxy such as "unit tests pass".
   - `dep`: 0-6 ids of components this one directly depends on, from anywhere in the plate, not itself. Prefer
     lower-layer components. These draw dependency lines on the chart, so be correct and sparing.
   - Valid JavaScript: double-quoted strings, with inner double quotes escaped.

## Done

Run `node tools/check-map.mjs <slug>` from the project folder and fix everything until it prints `<slug>: ok`. Then
report its final line and anything you were unsure about.
