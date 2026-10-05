// Page logic for the home page (AtlasHome) and every plate page (AtlasPlate).
(() => {
  const A = window.ATLAS, esc = A.esc;
  const ICON = {
    logo: `<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="1.5" y="1.5" width="25" height="25" rx="4" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="6" y="17.5" width="16" height="4" rx="1" fill="currentColor"/><rect x="6" y="12" width="11" height="4" rx="1" fill="currentColor" opacity=".55"/><rect x="6" y="6.5" width="6" height="4" rx="1" fill="currentColor" opacity=".3"/><circle cx="19.5" cy="8.5" r="2.6" fill="var(--mark)"/></svg>`,
    search: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.8"/><path d="m10.6 10.6 3.6 3.6" stroke-linecap="round"/></svg>`,
    moon: `<svg class="theme-moon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" stroke-linejoin="round"/></svg>`,
    sun: `<svg class="theme-sun" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" stroke-linecap="round"/></svg>`,
    close: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke-linecap="round"/></svg>`,
    grid: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="3" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1"/></svg>`,
  };
  const SW = {
    core: `<svg viewBox="0 0 26 14"><rect x=".5" y=".5" width="25" height="13" rx="2.5" style="fill:color-mix(in srgb,var(--ink) 7%,var(--card));stroke:var(--ink-3)"/></svg>`,
    opt: `<svg viewBox="0 0 26 14"><defs><pattern id="lg-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--ink-3)"/></pattern></defs><rect x=".5" y=".5" width="25" height="13" rx="2.5" fill="url(#lg-h)" style="stroke:var(--ink-3);stroke-dasharray:3 2"/></svg>`,
    dep: `<svg viewBox="0 0 26 14"><path d="M1 12 C 8 12, 18 2, 25 2" fill="none" style="stroke:var(--mark);stroke-width:1.6"/></svg>`,
    used: `<svg viewBox="0 0 26 14"><path d="M1 12 C 8 12, 18 2, 25 2" fill="none" style="stroke:var(--ink-3);stroke-width:1.6;stroke-dasharray:3 3"/></svg>`,
  };

  function topbar(root, crumbs) {
    return `<header class="topbar">
      <a class="wordmark" href="${root}index.html" aria-label="Architecture Atlas home">${ICON.logo}<b>Architecture <i>Atlas</i></b></a>
      ${crumbs ? `<div class="crumbs mono">${crumbs.map(c => `<span class="sep"></span><span>${esc(c)}</span>`).join("")}</div>` : ""}
      <nav>
        <a class="navlink" href="${root}index.html#index">${ICON.grid}<span class="lbl">All plates</span></a>
        <button class="iconbtn" data-theme-toggle aria-label="Switch between light and dark">${ICON.moon}${ICON.sun}</button>
      </nav>
    </header>`;
  }
  const colophon = `<footer class="wrap"><div class="colophon mono"><span>Architecture Atlas</span><span>How software is built, in any language</span></div></footer>`;

  // ── Home ────────────────────────────────────────────────────────────────
  async function home(root) {
    const plates = A.plates();
    const ready = plates.filter(p => A.ready(p.slug));
    await A.load(ready.map(p => `${root}atlas/${p.slug}/data.js`));
    const comps = ready.reduce((a, p) => a + Object.values(A.maps[p.slug]?.groups || {}).reduce((s, g) => s + g.items.length, 0), 0);
    const domains = window.ATLAS_CATALOG;
    const stack = ready.slice(0, 3).reverse();

    const app = document.getElementById("app");
    app.innerHTML = topbar(root) + `
    <main class="wrap">
      <section class="hero">
        <div>
          <div class="eyebrow mono">A field atlas for agentic engineers</div>
          <h1>How software is <em>built</em>, plate by plate.</h1>
          <p class="lede">Every kind of software has an architecture that outlives the language it is written in. Each plate maps one kind, layer by layer, and opens every component into what it does, the decisions behind it, how it fails and how to prove it works.</p>
          <div class="hero-stats mono">
            <div><b>${plates.length}</b><span>Plates</span></div>
            <div><b>${domains.length}</b><span>Domains</span></div>
            <div><b>${ready.length}</b><span>Drawn</span></div>
            <div><b>${comps}</b><span>Components mapped</span></div>
          </div>
        </div>
        <div class="stack">${stack.map(p => `<a href="${root}atlas/${p.slug}/index.html" aria-label="${esc(p.name)}">${AtlasChart.thumb(A.maps[p.slug], "st" + p.no)}<div class="cap mono"><span>Pl. ${p.no}</span><span>${esc(p.name)}</span></div></a>`).join("")}</div>
      </section>

      <div class="section-head"><h2>Drawn plates <em>— open one</em></h2><span class="rule"></span><span class="mono" style="color:var(--ink-3)">${ready.length} of ${plates.length}</span></div>
      <div class="drawn">${ready.map(p => {
        const m = A.maps[p.slug], n = Object.values(m.groups).reduce((s, g) => s + g.items.length, 0);
        return `<a class="plate-card" href="${root}atlas/${p.slug}/index.html"><div class="thumb">${AtlasChart.thumb(m, "c" + p.no)}</div>
          <div class="meta"><span class="no mono">Plate ${p.no}</span><h3>${esc(m.title)}</h3><p>${n} components · ${Object.keys(m.groups).length} systems · ${m.bands.length} layers</p></div></a>`;
      }).join("")}</div>

      <div class="section-head" id="index"><h2>Index of plates</h2><span class="rule"></span></div>
      <div class="index-tools">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Find a kind of software…" aria-label="Filter plates"></label>
        <button class="chip-toggle" id="onlyReady" aria-pressed="false">Drawn only</button>
        <span class="count mono" id="count"></span>
      </div>
      <div class="index" id="idx">${domains.map(d => `<section class="domain-block"><h3>${esc(d.domain)} <span class="mono">${d.entries.length}</span></h3>
        ${d.entries.map(([slug]) => {
          const p = plates.find(x => x.slug === slug), r = A.ready(slug);
          return `<a class="row${r ? " ready" : ""}" href="${root}atlas/${slug}/index.html" data-q="${esc((p.name + " " + p.blurb).toLowerCase())}">
            <span class="no">${p.no}</span><span class="nm">${esc(p.name)}</span><span class="st">${r ? "Drawn" : "In prep."}</span><span class="bl">${esc(p.blurb)}</span></a>`;
        }).join("")}</section>`).join("")}</div>

      <div class="section-head"><h2>Reading a plate</h2><span class="rule"></span></div>
      <div class="howto">
        <div><svg viewBox="0 0 46 28"><text x="2" y="22" style="font:italic 22px var(--f-display);fill:var(--mark)">II</text><path d="M34 3h-4v22h4" style="fill:none;stroke:var(--ink-3)"/></svg><b>Layers read top down</b><p>Layer I is closest to the people using the software; the highest numeral sits on the bedrock. Each layer is built on the ones beneath it and should not reach above itself.</p></div>
        <div><svg viewBox="0 0 46 28">${SW.core.replace('viewBox="0 0 26 14"', 'x="0" y="7" width="20" height="14" viewBox="0 0 26 14"')}${SW.opt.replace('viewBox="0 0 26 14"', 'x="24" y="7" width="20" height="14" viewBox="0 0 26 14"').replace(/lg-h/g, "lg-h2")}</svg><b>Core or optional</b><p>Solid systems appear in almost every implementation. Hatched ones are added for particular needs and can be left out.</p></div>
        <div><svg viewBox="0 0 46 28"><rect x="1" y="16" width="14" height="10" rx="2" style="fill:var(--card);stroke:var(--mark)"/><rect x="31" y="2" width="14" height="10" rx="2" style="fill:var(--card);stroke:var(--ink-3)"/><path d="M8 16 C8 8, 38 20, 38 12" style="fill:none;stroke:var(--mark);stroke-width:1.5"/></svg><b>Lines are dependencies</b><p>Open any component: solid red lines run to what it depends on, dashed lines to what depends on it.</p></div>
        <div><svg viewBox="0 0 46 28"><defs><pattern id="lg-r" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--ink)"/></pattern></defs><rect x="1" y="18" width="44" height="8" rx="1.5" fill="url(#lg-r)" style="stroke:var(--ink)"/><rect x="33" y="1" width="12" height="14" rx="1.5" style="fill:var(--paper-2);stroke:var(--ink)"/></svg><b>Margins and bedrock</b><p>The right-hand panel holds concerns that shape every layer. The hatched strip below is what the software runs on.</p></div>
      </div>
    </main>` + colophon;

    const q = document.getElementById("q"), only = document.getElementById("onlyReady"), count = document.getElementById("count");
    function filter() {
      const v = q.value.trim().toLowerCase(), o = only.getAttribute("aria-pressed") === "true";
      let shown = 0;
      document.querySelectorAll("#idx .domain-block").forEach(b => {
        let any = false;
        b.querySelectorAll(".row").forEach(r => {
          const hit = (!v || r.dataset.q.includes(v)) && (!o || r.classList.contains("ready"));
          r.classList.toggle("hidden", !hit); if (hit) { any = true; shown++; }
        });
        b.classList.toggle("hidden", !any);
      });
      count.textContent = `${shown} of ${plates.length} plates`;
    }
    q.addEventListener("input", filter);
    only.onclick = () => { only.setAttribute("aria-pressed", only.getAttribute("aria-pressed") !== "true"); filter(); };
    filter();
  }

  // ── Plate page ──────────────────────────────────────────────────────────
  async function plate(slug, root) {
    const plates = A.plates(), p = plates.find(x => x.slug === slug);
    const files = (window.ATLAS_MANIFEST || {})[slug];
    if (files) await A.load(files.map(f => `${root}atlas/${slug}/${f}`));
    const map = A.maps[slug];
    document.title = `${p.name} · Architecture Atlas`;
    const app = document.getElementById("app");
    const readyPlates = plates.filter(x => A.ready(x.slug));
    const idx = readyPlates.findIndex(x => x.slug === slug);
    const pager = idx < 0 ? "" : `<nav class="plate-pager">
      ${idx > 0 ? `<a href="${root}atlas/${readyPlates[idx - 1].slug}/index.html"><span class="mono">← Plate ${readyPlates[idx - 1].no}</span><b>${esc(readyPlates[idx - 1].name)}</b></a>` : "<span></span>"}
      ${idx < readyPlates.length - 1 ? `<a class="next" href="${root}atlas/${readyPlates[idx + 1].slug}/index.html"><span class="mono">Plate ${readyPlates[idx + 1].no} →</span><b>${esc(readyPlates[idx + 1].name)}</b></a>` : ""}
    </nav>`;

    if (!map) {
      app.innerHTML = topbar(root, [`Plate ${p.no}`, p.domain]) + `<main class="plate-main"><div class="wrap wide">
        <section class="plate-hero"><div><div class="eyebrow mono">Plate ${p.no} · ${esc(p.domain)}</div><h1>${esc(p.name)}</h1><p class="lede">${esc(p.blurb)}.</p></div></section>
        <div class="pending">${ghost()}<div class="msg"><div><span class="mono" style="color:var(--mark)">In preparation</span><b>This plate is still being drawn.</b>
          <p>Its layers, systems and components will appear here. Drawn so far: ${readyPlates.map(r => `<a href="${root}atlas/${r.slug}/index.html">${esc(r.name)}</a>`).join(", ")}.</p></div></div></div>
        <nav class="plate-pager">${readyPlates[0] ? `<a href="${root}index.html#index"><span class="mono">← Back to</span><b>Index of plates</b></a>` : ""}</nav>
      </div>${colophon}</main>`;
      return;
    }

    map.no = p.no;
    const det = A.det[slug] || {};
    const groups = Object.values(map.groups);
    const comps = groups.reduce((a, g) => a + g.items.length, 0);
    const optN = groups.filter(g => g.optional).length;

    app.innerHTML = topbar(root, [`Plate ${p.no}`, p.domain]) + `<main class="plate-main"><div class="wrap wide">
      <section class="plate-hero">
        <div><div class="eyebrow mono">Plate ${p.no} · ${esc(p.domain)}</div><h1>${esc(map.title)}</h1><p class="lede">${esc(map.lede)}</p></div>
        <div class="plate-stats mono">
          <div><b>${comps}</b><span>Components</span></div><div><b>${groups.length}</b><span>Systems</span></div>
          <div><b>${map.bands.length}</b><span>Layers</span></div><div><b>${optN}</b><span>Optional</span></div>
        </div>
      </section>
      <div class="toolbar">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Find a component…" aria-label="Find a component"></label>
        <div class="seg" role="group" aria-label="Zoom"><button id="zFit">Fit</button><button id="zFull">1:1</button></div>
        <button class="chip-toggle" id="coreOnly" aria-pressed="false">Core only</button>
        <div class="legend"><span>${SW.core}Core</span><span>${SW.opt}Optional</span><span>${SW.dep}Depends on</span><span>${SW.used}Used by</span></div>
      </div>
      <div class="plate-frame" id="frame"><svg class="atlas-chart" id="chart" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plate ${p.no}: ${esc(map.title)}"></svg></div>
      <p class="hint"><span id="hintText">Hover a component for a summary. Click it to open the full entry.</span> <kbd>Esc</kbd> closes.</p>
      <section class="notes" id="notes"></section>
      ${pager}
    </div>${colophon}</main>
    <aside class="drawer" id="drawer" aria-label="Component entry" aria-hidden="true"></aside>
    <div class="tip" id="tip" role="tooltip"></div>`;

    if (document.fonts?.ready) await document.fonts.ready;
    const svg = document.getElementById("chart"), frame = document.getElementById("frame");
    const chart = AtlasChart.render(svg, map, det);
    const tip = document.getElementById("tip"), drawer = document.getElementById("drawer");
    const color = m => m.group.color ? `var(--c${m.group.color})` : "var(--ink)";

    // Zoom.
    const zFit = document.getElementById("zFit"), zFull = document.getElementById("zFull");
    function zoom(fit) {
      svg.classList.toggle("native", !fit); frame.classList.toggle("scroll", !fit);
      zFit.setAttribute("aria-pressed", fit); zFull.setAttribute("aria-pressed", !fit);
    }
    zFit.onclick = () => zoom(true); zFull.onclick = () => zoom(false);
    zoom(frame.clientWidth >= 1000);
    // Drag to pan at 1:1.
    let drag = null;
    frame.addEventListener("pointerdown", e => { if (svg.classList.contains("native") && !e.target.closest(".box")) drag = { x: e.clientX, y: e.clientY, l: frame.scrollLeft, t: frame.scrollTop }; });
    addEventListener("pointermove", e => { if (drag) { frame.scrollLeft = drag.l - (e.clientX - drag.x); frame.scrollTop = drag.t - (e.clientY - drag.y); } });
    addEventListener("pointerup", () => drag = null);

    // Search and core-only.
    const q = document.getElementById("q"), hint = document.getElementById("hintText");
    const hintDefault = hint.textContent;
    q.addEventListener("input", () => {
      const n = chart.search(q.value);
      hint.textContent = q.value.trim() ? `${n} component${n === 1 ? "" : "s"} match “${q.value.trim()}”.` : hintDefault;
    });
    const core = document.getElementById("coreOnly");
    core.onclick = () => { const on = core.getAttribute("aria-pressed") !== "true"; core.setAttribute("aria-pressed", on); svg.classList.toggle("core-only", on); };

    // Tooltip.
    function showTip(id, x, y) {
      const m = chart.meta.get(id), d = det[id];
      tip.innerHTML = `<div class="k"><i style="background:${color(m)}"></i>${esc(m.ref)} · ${esc(m.group.title)}</div><b>${esc(m.n)}</b>${d?.s ? `<p>${esc(d.s)}</p>` : ""}<div class="more">Click for the full entry →</div>`;
      tip.classList.add("on");
      const r = tip.getBoundingClientRect();
      let left = x + 18, top = y + 18;
      if (left + r.width > innerWidth - 12) left = x - r.width - 18;
      if (top + r.height > innerHeight - 12) top = y - r.height - 18;
      tip.style.left = Math.max(8, left) + "px"; tip.style.top = Math.max(66, top) + "px";
    }
    const hideTip = () => tip.classList.remove("on");
    svg.addEventListener("pointermove", e => { const b = e.target.closest(".box"); b ? showTip(b.dataset.id, e.clientX, e.clientY) : hideTip(); });
    svg.addEventListener("pointerleave", hideTip);
    svg.addEventListener("focusin", e => { const b = e.target.closest(".box"); if (b) { const r = b.getBoundingClientRect(); showTip(b.dataset.id, r.right - 10, r.bottom - 6); } });
    svg.addEventListener("focusout", hideTip);

    // Drawer.
    const order = [...chart.meta.keys()];
    function chips(ids) {
      if (!ids.length) return `<span class="none">Nothing on this plate.</span>`;
      return ids.map(i => { const m = chart.meta.get(i); return m ? `<button data-go="${esc(i)}"><i style="background:${color(m)}"></i>${esc(m.n)}</button>` : ""; }).join("");
    }
    function decision(s) {
      const i = s.indexOf(": ");
      return i > 0 && i < 70 ? `<strong>${esc(s.slice(0, i))}:</strong> ${esc(s.slice(i + 2))}` : esc(s);
    }
    function open(id, { scroll = true } = {}) {
      const m = chart.meta.get(id); if (!m) return;
      const d = det[id] || {};
      chart.select(id); hideTip();
      const sib = order.filter(i => chart.meta.get(i).g === m.g), k = sib.indexOf(id);
      const layer = m.band ? `Layer ${m.numeral} · ${esc(m.band.label)}` : "Every layer";
      drawer.style.setProperty("--accent", color(m));
      drawer.innerHTML = `<div class="bar"><div class="ref"><b>${esc(m.ref)}</b><span>${layer}</span></div><span class="sp"></span>
          <button class="iconbtn" id="dClose" aria-label="Close entry">${ICON.close}</button></div>
        <div class="body">
          <div class="grp-tag"><i style="background:${color(m)}"></i>${esc(m.group.title)}${m.g === "cross" ? "" : `<span class="pill">${m.opt ? "Optional" : "Core"}</span>`}</div>
          <h2>${esc(m.n)}</h2>
          ${d.s ? `<p class="summary">${esc(d.s)}</p>` : ""}
          ${d.d ? `<p class="detail">${esc(d.d)}</p>` : `<p class="detail" style="color:var(--ink-3)">The full entry for this component is still being written.</p>`}
          ${d.k?.length ? `<h4>Design decisions</h4><ol class="decisions">${d.k.map(x => `<li>${decision(x)}</li>`).join("")}</ol>` : ""}
          ${d.p?.length ? `<h4>Pitfalls</h4><ul class="pitfalls">${d.p.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${d.v ? `<div class="verify"><span class="lbl">How to verify</span><p>${esc(d.v)}</p></div>` : ""}
          <h4>Depends on</h4><div class="links-list">${chips(d.dep || [])}</div>
          <h4>Used by</h4><div class="links-list">${chips(chart.usedBy.get(id) || [])}</div>
        </div>
        <div class="pager"><button id="dPrev" ${k > 0 ? "" : "disabled"}>← ${k > 0 ? esc(chart.meta.get(sib[k - 1]).n) : "Previous"}</button>
          <button id="dNext" ${k < sib.length - 1 ? "" : "disabled"}>${k < sib.length - 1 ? esc(chart.meta.get(sib[k + 1]).n) : "Next"} →</button></div>`;
      drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
      document.body.classList.add("drawer-open");
      document.getElementById("dClose").onclick = close;
      document.getElementById("dPrev").onclick = () => open(sib[k - 1]);
      document.getElementById("dNext").onclick = () => open(sib[k + 1]);
      drawer.querySelector(".body").scrollTop = 0;
      history.replaceState(null, "", "#" + id);
      if (scroll) {
        const r = svg.querySelector(`.box[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
        if (r && (r.top < 120 || r.bottom > innerHeight - 20)) scrollBy({ top: r.top - innerHeight / 2.4, behavior: "smooth" });
        if (r && svg.classList.contains("native")) {
          const fr = frame.getBoundingClientRect();
          if (r.left < fr.left || r.right > fr.right) frame.scrollBy({ left: r.left - fr.left - fr.width / 3, behavior: "smooth" });
        }
      }
    }
    function close() {
      chart.clear(); drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true");
      document.body.classList.remove("drawer-open"); history.replaceState(null, "", location.pathname + location.search);
    }
    svg.addEventListener("click", e => { const b = e.target.closest(".box"); if (b) open(b.dataset.id, { scroll: false }); });
    svg.addEventListener("keydown", e => { const b = e.target.closest(".box"); if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(b.dataset.id, { scroll: false }); } });
    drawer.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) open(g.dataset.go); });
    addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("open")) close(); });

    // Field notes.
    const notes = document.getElementById("notes");
    notes.innerHTML = `<nav aria-label="Layers">${map.bands.map((b, i) => `<a href="#layer-${i}"><i>${A.roman(i + 1)}</i>${esc(b.label)}</a>`).join("")}
        <a href="#layer-cross"><i>∗</i>Cross-cutting</a></nav>
      <div>${map.bands.map((b, i) => `<article class="band-note" id="layer-${i}">
        <header><i>${A.roman(i + 1)}</i><h3>${esc(b.label)}</h3></header><p>${esc(b.intro)}</p>
        ${b.groups.map(gk => { const g = map.groups[gk]; return `<div class="grp-note"><i style="background:var(--c${g.color})"></i>
          <h4>${esc(g.title)} <span class="pill">${g.optional ? "Optional" : "Core"}</span></h4><p>${esc(g.about)}</p>
          <div class="comps">${g.items.map(it => `<button data-open="${esc(it.id)}">${esc(it.n)}</button>`).join("")}</div></div>`; }).join("")}
      </article>`).join("")}
        <article class="band-note" id="layer-cross"><header><i>∗</i><h3>Cross-cutting concerns</h3></header><p>${esc(map.crossIntro)}</p>
          <div class="grp-note"><i style="background:var(--ink)"></i><h4>Concerns</h4><p></p><div class="comps">${map.cross.map(c => `<button data-open="${esc(c.id)}">${esc(c.n)}</button>`).join("")}</div></div></article>
      </div>`;
    notes.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) open(b.dataset.open); });

    const h = decodeURIComponent(location.hash.slice(1));
    if (h && chart.meta.has(h)) open(h);
  }

  // Skeleton plate for pages still in preparation.
  function ghost() {
    const rows = [[3, 2, 2], [4, 3, 3, 2, 2, 3], [7], [6], [7]];
    let y = 20, s = `<defs><pattern id="gh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--rule-2)"/></pattern></defs>`;
    for (const r of rows) {
      const tot = r.reduce((a, b) => a + b, 0), h = r.length > 3 ? 120 : 70;
      let x = 20;
      for (const c of r) { const w = (1100 - 20 * (r.length - 1)) * c / tot; s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#gh)" style="stroke:var(--rule-2);stroke-dasharray:5 4"/>`; x += w + 20; }
      y += h + 16;
    }
    s += `<rect x="1140" y="20" width="140" height="${y - 36}" rx="5" fill="none" style="stroke:var(--rule-2);stroke-dasharray:5 4"/>`;
    return `<svg viewBox="0 0 1300 ${y + 10}" aria-hidden="true">${s}</svg>`;
  }

  window.AtlasHome = { boot: root => home(root), topbar };
  window.AtlasPlate = { boot: (slug, root) => plate(slug, root) };
})();
