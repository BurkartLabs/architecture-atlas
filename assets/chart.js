// Draws a plate (a layered architecture map) as SVG, and the small schematic thumbnails used on the home page.
// Layout: bedrock at the top, then the foundation as layer I, rising to the user-facing layer, then the
// cross-cutting concerns as one strip. Every box in a band shares one width, and each band uses the fewest rows whose
// columns still fit at MINBOX. Group backgrounds, dependency lines and boxes are separate layers so lines run
// under the boxes they connect.
window.AtlasChart = (() => {
  const W = 1600, M = 20, HEADER = 46, RUL = 22, GUT = 82, GAP = 14, GP = 12, BG = 8, HEAD = 46,
    LH = 18, MINBOX = 138, BANDGAP = 20, CELL = 120, ROCK = 44;
  const FONT = '14px Geist, ui-sans-serif, system-ui, sans-serif';
  const TITLE = '600 18px Fraunces, Georgia, serif';
  const MONO = '10.5px "Geist Mono", ui-monospace, monospace';
  const ctx = document.createElement("canvas").getContext("2d");
  const esc = s => window.ATLAS.esc(s);
  const measure = (t, font) => { ctx.font = font; return ctx.measureText(t).width; };
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function wrap(text, width) {
    ctx.font = FONT;
    // Words wider than the box ("Snapshot-at-the-beginning") are split after their hyphens first.
    const words = text.split(" ").flatMap(w => ctx.measureText(w).width <= width ? [w] : w.split(/(?<=-)/));
    const lines = []; let cur = "";
    for (const w of words) {
      const t = !cur ? w : cur.endsWith("-") ? cur + w : cur + " " + w;
      if (!cur || ctx.measureText(t).width <= width) cur = t; else { lines.push(cur); cur = w; }
    }
    lines.push(cur); return lines;
  }
  function label(lines, x, cy, maxW) {
    const top = cy - (lines.length - 1) * LH / 2 + 5;
    // A fragment that still does not fit (no hyphen to break at) shrinks rather than running past the box.
    const widest = maxW ? Math.max(...lines.map(l => measure(l, FONT))) : 0;
    const shrink = widest > maxW ? ` style="font-size:${(14 * maxW / widest).toFixed(1)}px"` : "";
    return `<text${shrink}>` + lines.map((l, i) => `<tspan x="${x}" y="${top + i * LH}">${esc(l)}</tspan>`).join("") + `</text>`;
  }
  function hatch(id, color, gap, op) {
    return `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<line x1="0" y1="0" x2="0" y2="${gap}" style="stroke:${color};stroke-width:1.2;opacity:${op}"/></pattern>`;
  }

  function render(svgEl, map, det) {
    const cx0 = M + RUL + GUT, cxR = W - M - 16, contentW = cxR - cx0;
    const cy0 = M + HEADER + RUL + 16;
    const meta = new Map();
    let bgs = "", boxes = "", gutter = "";
    let defs = `<defs>${Array.from({ length: 15 }, (_, i) => hatch(`hx${i + 1}`, `var(--c${i + 1})`, 7, .32)).join("")}` +
      hatch("rock", "var(--ink)", 6, .55) + `</defs>`;
    const nb = map.bands.length;
    const items = [], groupsN = Object.keys(map.groups).length;

    // Bedrock first: the plate reads from what the software runs on, up through its layers.
    let y = cy0;
    const ground = map.ground.join("   ·   ").toUpperCase();
    const lw = measure(ground, '12px "Geist Mono", monospace') * 1.2 + 44;
    const lx = cx0 + contentW / 2 - lw / 2;
    const rock = `<g class="bedrock"><rect class="rock" x="${cx0}" y="${y}" width="${contentW}" height="${ROCK}" rx="3" fill="url(#rock)"/>` +
      `<rect class="label" x="${lx}" y="${y + 9}" width="${lw}" height="${ROCK - 18}" rx="2"/>` +
      `<text x="${cx0 + contentW / 2}" y="${y + ROCK / 2 + 4.5}" text-anchor="middle">${esc(ground)}</text></g>`;
    gutter += `<text class="bandname" transform="translate(${M + RUL + 60} ${y + ROCK / 2}) rotate(-90)" text-anchor="middle" style="font-size:8px">BEDROCK</text>`;
    y += ROCK + BANDGAP;

    // Lays out one band: every box shares one width, using the fewest rows whose columns still fit at MINBOX.
    function place(groups, label, numeral, cross) {
      const n = groups.length;
      let cols, boxW;
      for (let R = 1; ; R++) {
        cols = groups.map(g => Math.ceil(g.items.length / R));
        const total = cols.reduce((a, b) => a + b, 0);
        boxW = (contentW - GAP * (n - 1) - n * 2 * GP - cols.reduce((a, c) => a + (c - 1) * BG, 0)) / total;
        if (boxW >= MINBOX || R > 40) break;
      }
      const rows = Math.max(...groups.map((g, i) => Math.ceil(g.items.length / cols[i])));
      const maxLines = Math.max(...groups.flatMap(g => g.items.map(it => wrap(it.n, boxW - 24).length)));
      const boxH = maxLines * LH + 18;
      const gh = HEAD + rows * boxH + (rows - 1) * BG + GP;

      // Gutter: numeral, rotated band name (when it fits) and a bracket spanning the band.
      const mid = y + gh / 2;
      gutter += `<text class="numeral" x="${M + RUL + 25}" y="${mid + 10}" text-anchor="middle">${numeral}</text>`;
      const name = label.toUpperCase();
      if (measure(name, MONO) * 1.18 < gh - 16)
        gutter += `<text class="bandname" transform="translate(${M + RUL + 60} ${mid}) rotate(-90)" text-anchor="middle">${esc(name)}</text>`;
      gutter += `<path class="bracket" d="M${cx0 - 6},${y + .5} H${cx0 - 11} V${y + gh - .5} H${cx0 - 6}"/>`;

      let gx = cx0;
      groups.forEach((g, i) => {
        const gw = cols[i] * boxW + (cols[i] - 1) * BG + 2 * GP;
        const tW = measure(g.title, TITLE);
        // Long titles in narrow systems shrink to fit rather than run past the border.
        const fit = Math.min(1, (gw - 2 * GP - 6) / tW);
        const acc = cross ? "--accent:var(--ink)" : `--accent:var(--c${g.color})`;
        bgs += `<g class="grp${cross ? " pillar" : ""}${g.optional ? " opt" : ""}" data-g="${g.k}" style="${acc}">` +
          `<rect class="bg" x="${gx}" y="${y}" width="${gw}" height="${gh}" rx="6"/>` +
          (cross ? `<rect class="bg2" x="${gx + 4}" y="${y + 4}" width="${gw - 8}" height="${gh - 8}" rx="4"/>` : "") +
          (g.optional ? `<rect x="${gx}" y="${y}" width="${gw}" height="${gh}" rx="6" fill="url(#hx${g.color})" pointer-events="none"/>` : "") +
          `<text class="gt" x="${gx + GP + 1}" y="${y + 29}"${fit < 1 ? ` style="font-size:${(18 * fit).toFixed(1)}px"` : ""}>${esc(g.title)}</text>` +
          (tW + 30 < gw - 2 * GP ? `<text class="gc" x="${gx + GP + tW + 9}" y="${y + 29}">${g.items.length}</text>` : "") +
          (cross ? `<text class="badge" x="${gx + gw - GP}" y="${y + 28}" text-anchor="end">SHAPE EVERY LAYER</text>` :
            g.optional && tW + 120 < gw - 2 * GP ? `<text class="badge" x="${gx + gw - GP}" y="${y + 28}" text-anchor="end">OPTIONAL</text>` : "") +
          `</g>`;
        g.items.forEach((it, j) => {
          const r = Math.floor(j / cols[i]), c = j % cols[i];
          items.push({ it, g: g.k, group: cross ? { title: g.title, color: 0 } : g, band: cross ? null : { label },
            numeral: cross ? "" : numeral, x: gx + GP + c * (boxW + BG), y: y + HEAD + r * (boxH + BG), w: boxW, h: boxH,
            acc, opt: !!g.optional });
        });
        gx += gw + GAP;
      });
      y += gh + BANDGAP;
    }

    // Layers from the foundation (I) up to the layer people and programs use. The data lists bands top-down, so reverse.
    [...map.bands].reverse().forEach((band, bi) =>
      place(band.groups.map(k => ({ k, ...map.groups[k] })), band.label, window.ATLAS.roman(bi + 1), false));
    // Cross-cutting concerns close the plate as one full-width strip.
    place([{ k: "cross", title: "Cross-cutting concerns", items: map.cross }], "Every layer", "∗", true);

    const innerB = y - BANDGAP + 16, H = innerB + M;

    // Rulers and graticule: letters across, numbers down. Grid references come from these cells.
    const nCols = Math.ceil((cxR - cx0) / CELL), nRows = Math.ceil((innerB - 8 - cy0) / CELL);
    let ruler = `<g class="ruler">`, grat = `<g class="graticule">`;
    const rTop = M + HEADER;
    for (let i = 0; i <= nCols; i++) {
      const x = Math.min(cx0 + i * CELL, cxR);
      ruler += `<line x1="${x}" y1="${rTop + RUL - 6}" x2="${x}" y2="${rTop + RUL}"/>`;
      if (i < nCols) ruler += `<text x="${Math.min(x + CELL / 2, (x + cxR) / 2)}" y="${rTop + 13}" text-anchor="middle">${LETTERS[i]}</text>`;
      if (i > 0 && i < nCols) grat += `<line x1="${x}" y1="${cy0}" x2="${x}" y2="${innerB - 8}"/>`;
    }
    for (let j = 0; j <= nRows; j++) {
      const yy = Math.min(cy0 + j * CELL, innerB - 8);
      ruler += `<line x1="${M + RUL - 6}" y1="${yy}" x2="${M + RUL}" y2="${yy}"/>`;
      if (j < nRows) ruler += `<text x="${M + RUL / 2}" y="${Math.min(yy + CELL / 2, (yy + innerB - 8) / 2) + 3}" text-anchor="middle">${j + 1}</text>`;
      if (j > 0 && j < nRows) grat += `<line x1="${cx0}" y1="${yy}" x2="${cxR}" y2="${yy}"/>`;
    }
    ruler += `</g>`; grat += `</g>`;
    const ref = (x, yy) => LETTERS[Math.max(0, Math.min(nCols - 1, Math.floor((x - cx0) / CELL)))] + (Math.max(0, Math.floor((yy - cy0) / CELL)) + 1);

    // Boxes.
    for (const b of items) {
      const lines = wrap(b.it.n, b.w - 24);
      const r = ref(b.x + b.w / 2, b.y + b.h / 2);
      meta.set(b.it.id, { ...b, id: b.it.id, n: b.it.n, ref: r, cx: b.x + b.w / 2, cy: b.y + b.h / 2 });
      boxes += `<g class="box${b.opt ? " opt" : ""}" data-id="${b.it.id}" style="${b.acc}" tabindex="0" role="button" aria-label="${esc(b.it.n)}">` +
        `<rect class="face" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3"/>` +
        `<rect class="tick" x="${b.x + 4}" y="${b.y + 5}" width="2.5" height="${b.h - 10}" rx="1.25"/>` +
        label(lines, b.x + 15, b.y + b.h / 2, b.w - 22) + `</g>`;
    }

    // Header strip and frames.
    const comps = items.length - map.cross.length;
    const head = `<text class="t-head" x="${M + 16}" y="${M + 27}">PLATE ${esc(map.no || "")}  ·  ${esc(map.title.toUpperCase())}</text>` +
      `<text class="t-mono" x="${W - M - 16}" y="${M + 27}" text-anchor="end">${comps} COMPONENTS  ·  ${groupsN} SYSTEMS  ·  ${nb} LAYERS  ·  NOT TO SCALE</text>`;
    const frames = `<rect class="frame" x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" rx="3"/>` +
      `<line class="frame" x1="${M}" y1="${M + HEADER}" x2="${W - M}" y2="${M + HEADER}"/>` +
      `<rect class="frame-in" x="${M + RUL}" y="${M + HEADER + RUL}" width="${W - 2 * M - RUL}" height="${innerB - (M + HEADER + RUL)}"/>`;

    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svgEl.innerHTML = defs + frames + head + ruler + grat + gutter + bgs + `<g class="links"></g>` + boxes + rock;

    // Interaction state.
    const usedBy = new Map();
    for (const [id, d] of Object.entries(det || {})) for (const t of d.dep || []) {
      if (!usedBy.has(t)) usedBy.set(t, []);
      usedBy.get(t).push(id);
    }
    const linksEl = svgEl.querySelector(".links");
    const boxEl = id => svgEl.querySelector(`.box[data-id="${CSS.escape(id)}"]`);
    function curve(a, b) {
      const dy = b.cy - a.cy;
      if (Math.abs(dy) < 20) {
        const lift = Math.min(90, 30 + Math.abs(b.cx - a.cx) / 6);
        return `M${a.cx},${a.cy} C${a.cx},${a.cy - lift} ${b.cx},${b.cy - lift} ${b.cx},${b.cy}`;
      }
      const my = (a.cy + b.cy) / 2;
      return `M${a.cx},${a.cy} C${a.cx},${my} ${b.cx},${my} ${b.cx},${b.cy}`;
    }
    function clear() {
      svgEl.classList.remove("focus");
      svgEl.querySelectorAll(".box.sel,.box.dep,.box.used").forEach(e => e.classList.remove("sel", "dep", "used"));
      linksEl.innerHTML = "";
    }
    function select(id) {
      clear();
      const m = meta.get(id); if (!m) return;
      svgEl.classList.add("focus");
      boxEl(id)?.classList.add("sel");
      let paths = "";
      for (const t of (det?.[id]?.dep || [])) {
        const tm = meta.get(t); if (!tm) continue;
        boxEl(t)?.classList.add("dep");
        paths += `<path class="l-dep" d="${curve(m, tm)}"/>`;
      }
      for (const t of (usedBy.get(id) || [])) {
        const tm = meta.get(t); if (!tm) continue;
        boxEl(t)?.classList.add("used");
        paths += `<path class="l-used" d="${curve(tm, m)}"/>`;
      }
      linksEl.innerHTML = paths;
    }
    function search(q) {
      const v = q.trim().toLowerCase();
      let hits = 0;
      svgEl.querySelectorAll(".box").forEach(e => {
        const id = e.dataset.id, d = det?.[id];
        const hit = !v || (meta.get(id).n + " " + (d?.s || "")).toLowerCase().includes(v);
        e.classList.toggle("miss", !hit);
        if (hit && v) hits++;
      });
      return hits;
    }
    return { meta, usedBy, select, clear, search, width: W, height: H };
  }

  // A small schematic of a plate: bands as strips, groups sized by component count.
  function thumb(map, prefix) {
    // Same order as the plate: bedrock, the foundation (layer I) up to the top layer, then the cross-cutting strip.
    const w = 320, h = 210, pad = 8, rockH = 12, crossH = 14, gap = 4;
    const innerW = w - pad * 2, avail = h - pad * 2 - rockH - crossH - gap * 2;
    const bands = [...map.bands].reverse();
    const weights = bands.map(b => Math.max(...b.groups.map(g => map.groups[g].items.length)) + 6);
    const tot = weights.reduce((a, b) => a + b, 0);
    let s = `<defs>${hatch(prefix + "r", "var(--ink)", 4, .5)}` +
      Array.from({ length: 15 }, (_, i) => hatch(`${prefix}h${i + 1}`, `var(--c${i + 1})`, 4, .45)).join("") + `</defs>`;
    s += `<rect x="${pad}" y="${pad}" width="${innerW}" height="${rockH}" rx="2" fill="url(#${prefix}r)" style="stroke:var(--ink);stroke-width:.8"/>`;
    let y = pad + rockH + gap;
    bands.forEach((b, i) => {
      const bh = (avail - gap * (bands.length - 1)) * weights[i] / tot;
      const counts = b.groups.map(g => map.groups[g].items.length + 3);
      const ct = counts.reduce((a, c) => a + c, 0);
      let x = pad;
      b.groups.forEach((g, j) => {
        const gw = (innerW - gap * (b.groups.length - 1)) * counts[j] / ct, G = map.groups[g];
        s += `<rect x="${x}" y="${y}" width="${gw}" height="${bh}" rx="2" style="fill:color-mix(in srgb, var(--c${G.color}) 26%, var(--card));stroke:var(--c${G.color});stroke-width:.8"/>`;
        if (G.optional) s += `<rect x="${x}" y="${y}" width="${gw}" height="${bh}" rx="2" fill="url(#${prefix}h${G.color})"/>`;
        x += gw + gap;
      });
      y += bh + gap;
    });
    s += `<rect x="${pad}" y="${y}" width="${innerW}" height="${crossH}" rx="2" style="fill:var(--paper-2);stroke:var(--ink);stroke-width:.8"/>`;
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${s}</svg>`;
  }

  return { render, thumb, W };
})();
