// Registry that every map's data and details files write into, plus helpers shared by all pages.
window.ATLAS = {
  maps: {},
  det: {},
  register(map) { this.maps[map.slug] = map; },
  details(slug, entries) { Object.assign(this.det[slug] || (this.det[slug] = {}), entries); },

  // Flat list of catalog entries with plate numbers.
  plates() {
    const out = [];
    for (const d of window.ATLAS_CATALOG) for (const [slug, name, blurb] of d.entries)
      out.push({ slug, name, blurb, domain: d.domain, no: String(out.length + 1).padStart(2, "0") });
    return out;
  },
  ready(slug) { return !!(window.ATLAS_MANIFEST && window.ATLAS_MANIFEST[slug]); },

  // Loads scripts in order; resolves when the last one has run. Script tags (not fetch) so pages work from disk.
  load(srcs) {
    return srcs.reduce((p, src) => p.then(() => new Promise(res => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => { console.warn("missing", src); res(); };
      document.head.appendChild(s);
    })), Promise.resolve());
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
