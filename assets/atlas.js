// Registry that every map's data and details files write into, plus helpers shared by all pages.
window.ATLAS = {
  maps: {},
  det: {},
  register(map) { this.maps[map.slug] = map; },
  details(slug, entries) { Object.assign(this.det[slug] || (this.det[slug] = {}), entries); },

  // Flat list of catalog entries with plate numbers.
  plates() {
    // An entry's fourth value is its plate number. The first 50 plates have none and are numbered by position, so
    // plates added inside an existing domain never renumber the ones already published.
    const out = [];
    let n = 0;
    for (const d of window.ATLAS_CATALOG) for (const [slug, name, blurb, no] of d.entries)
      out.push({ slug, name, blurb, domain: d.domain, no: String(no ?? ++n).padStart(2, "0") });
    return out;
  },
  ready(slug) { return !!(window.ATLAS_MANIFEST && window.ATLAS_MANIFEST[slug]); },

  // Loads scripts in parallel; resolves when all have run. Order does not matter, because every data and details file
  // only registers itself. Script tags (not fetch) so pages work from disk. Loading one at a time left the home page
  // blank for about 8 seconds once it needed all 50 plates.
  load(srcs) {
    return Promise.all(srcs.map(src => new Promise(res => {
      const s = document.createElement("script");
      s.src = window.ATLAS_BUILD ? `${src}?v=${window.ATLAS_BUILD}` : src; s.async = true; s.onload = res; s.onerror = () => { console.warn("missing", src); res(); };
      document.head.appendChild(s);
    })));
  },
  esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); },
  roman(n) {
    return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || String(n);
  },
};

// Theme: data-theme on <html> is set before paint by the inline snippet in each page's <head>.
document.addEventListener("click", e => {
  if (!e.target.closest("[data-theme-toggle]")) return;
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("atlas-theme", r.dataset.theme); } catch {}
});
