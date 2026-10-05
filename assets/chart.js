// Draws a layered architecture map into an <svg> from a map's data (see atlas/game-engine/data.js).
// Bands are drawn top to bottom; every box in a band shares one width, and each band uses the
// fewest rows whose columns still fit at MINBOX.
window.AtlasChart = (() => {
  const W = 1700, PAD = 16, AXIS = 50, PILLAR = 210, GAP = 14, GP = 10, BG = 8, HEAD = 34, LH = 15,
    MINBOX = 108, BANDGAP = 14, BANDLABEL = 20;
  const FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const TITLE_FONT = 'bold 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const ctx = document.createElement("canvas").getContext("2d");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function wrap(text, width) {
    ctx.font = FONT;
    const lines = []; let cur = "";
    for (const w of text.split(" ")) {
      const test = cur ? cur + " " + w : w;
      if (!cur || ctx.measureText(test).width <= width) cur = test; else { lines.push(cur); cur = w; }
    }
    lines.push(cur); return lines;
  }
  function textBlock(lines, cx, cy) {
    const top = cy - (lines.length - 1) * LH / 2 + 4;
    return `<text text-anchor="middle">` +
      lines.map((l, i) => `<tspan x="${cx}" y="${top + i * LH}">${esc(l)}</tspan>`).join("") + `</text>`;
  }
  function box(item, x, y, w, h) {
    const [label, detail] = item.split("|");
    return `<g class="box"><title>${esc(label + (detail ? ": " + detail : ""))}</title>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>` +
      textBlock(wrap(label, w - 14), x + w / 2, y + h / 2) + `</g>`;
  }

  function render(svgEl, data) {
    const x0 = PAD + AXIS, pillarX = W - PAD - PILLAR, contentW = pillarX - GAP - x0;
    let svg = `<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>`;
    let y = PAD, firstTop = null;

    for (const band of data.bands) {
      const groups = band.groups.map(k => ({ k, ...data.groups[k] }));
      const n = groups.length;
      let cols, boxW;
      for (let R = 1; ; R++) {
        cols = groups.map(g => Math.ceil(g.items.length / R));
        const total = cols.reduce((a, b) => a + b, 0);
        boxW = (contentW - GAP * (n - 1) - n * 2 * GP - cols.reduce((a, c) => a + (c - 1) * BG, 0)) / total;
        if (boxW >= MINBOX || R > 40) break;
      }
      const rows = Math.max(...groups.map((g, i) => Math.ceil(g.items.length / cols[i])));
      const maxLines = Math.max(...groups.flatMap(g => g.items.map(it => wrap(it.split("|")[0], boxW - 14).length)));
      const boxH = maxLines * LH + 14;
      const gh = HEAD + rows * boxH + (rows - 1) * BG + GP;

      svg += `<text class="bandlabel" x="${x0}" y="${y + 13}">${esc(band.label.toUpperCase())}</text>`;
      y += BANDLABEL;
      if (firstTop === null) firstTop = y;
      let gx = x0;
      groups.forEach((g, i) => {
        const gw = cols[i] * boxW + (cols[i] - 1) * BG + 2 * GP;
        // The border style already says core or optional; drop the badge where it would collide with the title.
        ctx.font = TITLE_FONT;
        const badgeFits = ctx.measureText(g.title).width + 76 < gw - 2 * GP;
        const title = `<text class="gt" x="${gx + GP + 2}" y="${y + 22}">${esc(g.title)}</text>`;
        svg += `<g class="grp${g.optional ? " opt" : ""}" style="--accent:var(--c${g.color})">` +
          `<rect class="bg" x="${gx}" y="${y}" width="${gw}" height="${gh}" rx="10"/>` +
          (g.link ? `<a href="${esc(g.link)}">${title}</a>` : title) +
          (badgeFits ? `<text class="badge" x="${gx + gw - GP - 2}" y="${y + 21}" text-anchor="end">${g.optional ? "OPTIONAL" : "CORE"}</text>` : "");
        g.items.forEach((it, j) => {
          const r = Math.floor(j / cols[i]), c = j % cols[i];
          svg += box(it, gx + GP + c * (boxW + BG), y + HEAD + r * (boxH + BG), boxW, boxH);
        });
        svg += `</g>`;
        gx += gw + GAP;
      });
      y += gh + BANDGAP;
    }
    const bottom = y - BANDGAP;

    // Cross-cutting pillar beside every layer.
    const pH = bottom - firstTop, pIn = PILLAR - 2 * GP;
    svg += `<text class="bandlabel" x="${pillarX}" y="${firstTop - 7}">APPLIES TO ALL</text>` +
      `<g class="grp pillar" style="--accent:var(--c-cross)"><rect class="bg" x="${pillarX}" y="${firstTop}" width="${PILLAR}" height="${pH}" rx="10"/>` +
      `<text class="gt" x="${pillarX + GP + 2}" y="${firstTop + 22}">Cross-cutting concerns</text>` +
      `<text class="note" x="${pillarX + GP + 2}" y="${firstTop + 40}">Shape the design of every layer</text>`;
    const cb = data.cross.map(it => ({ it, h: wrap(it.split("|")[0], pIn - 14).length * LH + 14 }));
    const spare = (pH - 52 - GP - cb.reduce((a, b) => a + b.h, 0)) / (cb.length + 1);
    let py = firstTop + 52 + spare;
    for (const b of cb) { svg += box(b.it, pillarX + GP, py, pIn, b.h); py += b.h + spare; }
    svg += `</g>`;

    // What the software sits on.
    const gy = bottom + 12;
    svg += `<g class="ground"><rect x="${x0}" y="${gy}" width="${W - PAD - x0}" height="36" rx="8"/>` +
      `<text x="${(x0 + W - PAD) / 2}" y="${gy + 23}" text-anchor="middle">${esc(data.ground.join("  ·  ").toUpperCase())}</text></g>`;

    // Dependency axis.
    const ax = PAD + 16, H = gy + 36 + PAD;
    svg += `<g class="axis"><line x1="${ax}" y1="${firstTop}" x2="${ax}" y2="${gy + 30}" marker-end="url(#ah)"/>` +
      `<text transform="translate(${ax + 20} ${(firstTop + gy) / 2}) rotate(-90)" text-anchor="middle">HIGHER LAYERS DEPEND ON LOWER LAYERS</text></g>`;

    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svgEl.innerHTML = svg;
  }

  // Wires up a map page: chart, fit toggle, theme toggle and the per-layer notes.
  function mountPage(data) {
    document.title = `${data.title} · Architecture Atlas`;
    document.getElementById("mapTitle").textContent = data.title;
    document.getElementById("mapLede").textContent = data.lede;
    const chart = document.getElementById("chart");
    chart.setAttribute("aria-label", `Layered architecture map of ${data.title.toLowerCase()}`);
    render(chart, data);

    let fit = innerWidth >= 900;
    const fitBtn = document.getElementById("fitBtn");
    const applyFit = () => {
      chart.style.width = fit ? "100%" : W + "px";
      chart.style.maxWidth = fit ? W + "px" : "none";
      fitBtn.textContent = fit ? "Actual size" : "Fit to window";
    };
    fitBtn.onclick = () => { fit = !fit; applyFit(); };
    applyFit();

    const notes = document.getElementById("layers");
    if (notes) {
      let html = `<h2>The layers, top to bottom</h2>`;
      for (const band of data.bands) {
        html += `<h2 style="font-size:17px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">${esc(band.label)}</h2>`;
        if (band.intro) html += `<p>${esc(band.intro)}</p>`;
        for (const k of band.groups) {
          const g = data.groups[k];
          html += `<h3><span class="sw" style="background:var(--c${g.color})"></span>${esc(g.title)}` +
            `<span class="tag">${g.optional ? "OPTIONAL" : "CORE"}</span></h3>`;
          if (g.about) html += `<p>${esc(g.about)}</p>`;
        }
      }
      if (data.crossIntro) html += `<h2>Cross-cutting concerns</h2><p>${esc(data.crossIntro)}</p>`;
      notes.innerHTML = html;
    }
  }

  return { render, mountPage };
})();

// Theme toggle shared by every page.
document.addEventListener("click", e => {
  if (!e.target.closest("[data-theme-toggle]")) return;
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("atlas-theme", r.dataset.theme); } catch {}
});
try { const t = localStorage.getItem("atlas-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
