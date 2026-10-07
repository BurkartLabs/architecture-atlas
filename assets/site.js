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
  // One catalogue grouped by domain, with a sticky domain list (a chip bar on phones) and a filter.
  async function home(root) {
    const plates = A.plates();
    const ready = plates.filter(p => A.ready(p.slug));
    await A.load(ready.map(p => `${root}atlas/${p.slug}/data.js`));
    const size = slug => { const m = A.maps[slug]; return m ? Object.values(m.groups).reduce((s, g) => s + g.items.length, 0) : 0; };
    const comps = ready.reduce((a, p) => a + size(p.slug), 0);
    const domains = window.ATLAS_CATALOG.map((d, i) => ({ ...d, id: `d${i + 1}`, plates: plates.filter(p => p.domain === d.domain) }));

    const tile = p => {
      const m = A.maps[p.slug];
      return `<a class="tile${m ? "" : " pending"}" href="${root}atlas/${p.slug}/index.html" data-q="${esc((p.name + " " + p.blurb).toLowerCase())}">
        <span class="tthumb">${m ? AtlasChart.thumb(m, "t" + p.no) : ""}</span>
        <span class="tbody"><span class="tno mono">${p.no}</span><b>${esc(p.name)}</b><span class="tbl">${esc(p.blurb)}</span>
        <span class="tmeta mono">${m ? `${size(p.slug)} components · ${m.bands.length} layers` : "In preparation"}</span></span></a>`;
    };

    const app = document.getElementById("app");
    app.innerHTML = topbar(root) + `
    <main class="wrap">
      <section class="intro">
        <div>
          <div class="eyebrow mono">A field atlas for agentic engineers</div>
          <h1>How software is <em>built</em>, plate by plate.</h1>
          <p class="lede">Each plate maps one kind of software layer by layer. Open any component for what it does, the decisions behind it, how it fails and how to prove it works.</p>
        </div>
        <div class="intro-stats mono">
          <div><b>${plates.length}</b><span>Plates</span></div>
          <div><b>${domains.length}</b><span>Domains</span></div>
          <div><b>${comps.toLocaleString("en-US")}</b><span>Components</span></div>
        </div>
      </section>

      <div class="catalog" id="index">
        <aside class="cat-nav" aria-label="Domains">
          <label class="search">${ICON.search}<input id="q" type="search" placeholder="Find a kind of software…" aria-label="Filter plates"><kbd class="kbd">/</kbd></label>
          <nav>${domains.map(d => `<a href="#${d.id}" data-d="${d.id}"><span>${esc(d.domain)}</span><i class="mono" data-count="${d.id}">${d.plates.length}</i></a>`).join("")}</nav>
          <p class="cat-count mono" id="count"></p>
        </aside>
        <div class="cat-main">
          ${domains.map(d => `<section class="cat" id="${d.id}">
            <h2><span>${esc(d.domain)}</span><i class="mono">${d.plates.length} plates</i></h2>
            <div class="tiles">${d.plates.map(tile).join("")}</div>
          </section>`).join("")}
          <p class="no-hits" id="noHits" hidden>No plate matches that. Try a broader word, such as “database” or “compiler”.</p>
        </div>
      </div>

      <details class="reading">
        <summary><span>Reading a plate</span><i class="mono">Layers, core and optional, dependencies, margins</i></summary>
        <div class="howto">
          <div><svg viewBox="0 0 46 28"><text x="2" y="22" style="font:italic 22px var(--f-display);fill:var(--mark)">II</text><path d="M34 3h-4v22h4" style="fill:none;stroke:var(--ink-3)"/></svg><b>Layers build upward</b><p>Bedrock is at the top, and layer I, the foundation, sits on it. Each numeral after it is built on the ones before; the highest is what people and programs use.</p></div>
          <div><svg viewBox="0 0 46 28">${SW.core.replace('viewBox="0 0 26 14"', 'x="0" y="7" width="20" height="14" viewBox="0 0 26 14"')}${SW.opt.replace('viewBox="0 0 26 14"', 'x="24" y="7" width="20" height="14" viewBox="0 0 26 14"').replace(/lg-h/g, "lg-h2")}</svg><b>Core or optional</b><p>Solid systems appear in almost every implementation. Hatched ones are added for particular needs.</p></div>
          <div><svg viewBox="0 0 46 28"><rect x="1" y="16" width="14" height="10" rx="2" style="fill:var(--card);stroke:var(--mark)"/><rect x="31" y="2" width="14" height="10" rx="2" style="fill:var(--card);stroke:var(--ink-3)"/><path d="M8 16 C8 8, 38 20, 38 12" style="fill:none;stroke:var(--mark);stroke-width:1.5"/></svg><b>Lines are dependencies</b><p>Open a component: solid red lines run to what it depends on, dashed lines to what depends on it.</p></div>
          <div><svg viewBox="0 0 46 28"><defs><pattern id="lg-r" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--ink)"/></pattern></defs><rect x="1" y="2" width="44" height="7" rx="1.5" fill="url(#lg-r)" style="stroke:var(--ink)"/><rect x="1" y="12" width="44" height="5" rx="1" style="fill:var(--card);stroke:var(--ink-3)"/><rect x="1" y="20" width="44" height="6" rx="1.5" style="fill:var(--paper-2);stroke:var(--ink)"/></svg><b>Bedrock and cross-cutting</b><p>The hatched strip at the top is what the software runs on. The strip at the end holds the concerns that shape every layer.</p></div>
        </div>
      </details>
    </main>` + colophon;

    // Filter: hides tiles and empty domains, and updates each domain's count in the nav.
    const q = document.getElementById("q"), count = document.getElementById("count"), noHits = document.getElementById("noHits");
    function filter() {
      const v = q.value.trim().toLowerCase();
      let shown = 0;
      document.querySelectorAll(".cat").forEach(sec => {
        let n = 0;
        sec.querySelectorAll(".tile").forEach(t => { const hit = !v || t.dataset.q.includes(v); t.hidden = !hit; if (hit) n++; });
        sec.hidden = n === 0;
        const c = document.querySelector(`[data-count="${sec.id}"]`);
        c.textContent = n; c.closest("a").classList.toggle("empty", n === 0);
        shown += n;
      });
      count.textContent = v ? `${shown} of ${plates.length} plates` : `${plates.length} plates`;
      noHits.hidden = shown > 0;
    }
    q.addEventListener("input", filter);
    addEventListener("keydown", e => {
      if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
      if (e.key === "Escape" && document.activeElement === q) { q.value = ""; filter(); q.blur(); }
    });
    filter();

    // Highlight the domain in view, and keep the active chip visible in the phone chip bar.
    const links = [...document.querySelectorAll(".cat-nav nav a")];
    const setActive = id => links.forEach(a => {
      const on = a.dataset.d === id;
      a.classList.toggle("on", on);
      if (on && a.parentElement.scrollWidth > a.parentElement.clientWidth) a.scrollIntoView({ block: "nearest", inline: "center" });
    });
    // The active domain is the last one whose heading has passed under the sticky bars. (Picking the most visible
    // section highlighted the previous domain on phones, whose tail was still on screen after a jump.)
    const sections = [...document.querySelectorAll(".cat")];
    let ticking = false;
    let clickedAt = -Infinity; // not 0: a page that renders within 400 ms of load would skip its first highlight
    function track() {
      ticking = false;
      if (performance.now() - clickedAt < 400) return; // a jump near the page end must keep the domain that was clicked
      const line = (innerWidth <= 900 ? 190 : 110);
      const live = sections.filter(s => !s.hidden);
      let cur = live[0];
      for (const s of live) if (s.getBoundingClientRect().top - line <= 0) cur = s;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = live.at(-1) || cur;
      if (cur) setActive(cur.id);
    }
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(track); } }, { passive: true });
    links.forEach(a => a.addEventListener("click", () => { clickedAt = performance.now(); setActive(a.dataset.d); }));
    track();
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
    const up = [...map.bands].reverse(); // foundation first, as layer I, matching the plate
    notes.innerHTML = `<nav aria-label="Layers">${up.map((b, i) => `<a href="#layer-${i}"><i>${A.roman(i + 1)}</i>${esc(b.label)}</a>`).join("")}
        <a href="#layer-cross"><i>∗</i>Cross-cutting</a></nav>
      <div>${up.map((b, i) => `<article class="band-note" id="layer-${i}">
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
