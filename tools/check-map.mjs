// Validates one map's data and details files: node tools/check-map.mjs <slug>
// Exits 1 and lists every problem; prints a summary when the map is clean.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const slug = process.argv[2];
if (!slug) { console.error("usage: node tools/check-map.mjs <slug>"); process.exit(2); }
const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "atlas", slug);
if (!fs.existsSync(path.join(dir, "data.js"))) { console.error(`no ${dir}/data.js`); process.exit(2); }

const ATLAS = { maps: {}, det: {}, register(m) { this.maps[m.slug] = m; },
  details(s, e) { for (const [k, v] of Object.entries(e)) { if ((this.det[s] ||= {})[k]) dupDetail.push(k); this.det[s][k] = v; } } };
const dupDetail = [];
const files = fs.readdirSync(dir).filter(f => /^(data|details.*)\.js$/.test(f)).sort((a, b) => (a === "data.js" ? -1 : b === "data.js" ? 1 : a.localeCompare(b)));
const ctx = vm.createContext({ ATLAS, window: { ATLAS } });
const errs = [];
for (const f of files) {
  try { vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f }); }
  catch (e) { errs.push(`${f}: does not run: ${e.message}`); }
}
const map = ATLAS.maps[slug];
if (!map) { console.error(errs.concat(`data.js must call ATLAS.register({ slug: "${slug}", ... })`).join("\n")); process.exit(1); }
const det = ATLAS.det[slug] || {};

const words = s => (typeof s === "string" ? s.trim().split(/\s+/).filter(Boolean).length : 0);
const range = (what, s, lo, hi) => { const n = words(s); if (n < lo || n > hi) errs.push(`${what}: ${n} words (want ${lo}-${hi})`); };
// Products, brands and implementation languages: the atlas describes kinds of software, not products.
const BRANDS = /\b(Unity|Unreal|Godot|Bevy|Linux|Windows|macOS|FreeBSD|Android|iOS|Chrome|Chromium|Firefox|Safari|WebKit|Blink|Gecko|Servo|V8|SpiderMonkey|LLVM|GCC|Clang|MSVC|PostgreSQL|Postgres|MySQL|SQLite|Oracle|SQL Server|InnoDB|Redis|Kafka|Vulkan|DirectX|Direct3D|D3D12|OpenGL|Metal|PhysX|Havok|Box2D|Wwise|FMOD|Steam|PlayStation|Xbox|Nintendo|React|Node\.js|Java|Python|Rust|C\+\+|C#|Golang|NVIDIA|AMD|Intel|ARM|x86|Apple|Microsoft|Google|Mozilla)\b/;
const brand = (what, s) => { const m = typeof s === "string" && s.match(BRANDS); if (m) errs.push(`${what}: names a product, brand or language ("${m[0]}")`); };
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

for (const k of ["title", "lede", "crossIntro"]) if (!map[k]) errs.push(`map.${k} missing`);
range("map.lede", map.lede, 15, 60);
range("map.crossIntro", map.crossIntro, 25, 90);
if (!Array.isArray(map.ground) || map.ground.length < 3 || map.ground.length > 6) errs.push("map.ground: want 3-6 strings");
if (!Array.isArray(map.bands) || map.bands.length < 4 || map.bands.length > 7) errs.push("map.bands: want 4-7 bands");
const groups = map.groups || {};
const gids = Object.keys(groups);
if (gids.length < 8 || gids.length > 15) errs.push(`map.groups: ${gids.length} groups (want 8-15)`);

const ids = new Map();
const addId = (id, where) => {
  if (!ID.test(id || "")) errs.push(`${where}: id "${id}" is not kebab-case`);
  else if (ids.has(id)) errs.push(`${where}: id "${id}" also used in ${ids.get(id)}`);
  else ids.set(id, where);
};
const placed = new Set();
for (const [i, b] of (map.bands || []).entries()) {
  if (!b.label) errs.push(`band ${i}: label missing`);
  range(`band "${b.label}".intro`, b.intro, 12, 60);
  if (!b.groups?.length || b.groups.length > 6) errs.push(`band "${b.label}": want 1-6 groups`);
  for (const g of b.groups || []) { if (!groups[g]) errs.push(`band "${b.label}": unknown group "${g}"`); if (placed.has(g)) errs.push(`group "${g}" placed twice`); placed.add(g); }
}
const colors = new Set();
for (const [gid, g] of Object.entries(groups)) {
  if (!placed.has(gid)) errs.push(`group "${gid}" is in no band`);
  if (!g.title) errs.push(`group "${gid}": title missing`);
  if (!(g.color >= 1 && g.color <= 15)) errs.push(`group "${gid}": color must be 1-15`);
  else if (colors.has(g.color)) errs.push(`group "${gid}": color ${g.color} already used`); else colors.add(g.color);
  range(`group "${gid}".about`, g.about, 20, 70);
  brand(`group "${gid}".about`, g.about);
  if (!g.items || g.items.length < 3 || g.items.length > 18) errs.push(`group "${gid}": want 3-18 items`);
  for (const it of g.items || []) {
    addId(it.id, `group ${gid}`);
    if (!it.n || it.n.length > 32) errs.push(`${it.id}: name missing or over 32 characters`);
    brand(`${it.id}.n`, it.n);
  }
}
for (const c of map.cross || []) addId(c.id, "cross");
if (!map.cross || map.cross.length < 4 || map.cross.length > 7) errs.push("map.cross: want 4-7 concerns");

for (const [id, where] of ids) {
  const d = det[id];
  if (!d) { errs.push(`${id}: no details entry`); continue; }
  range(`${id}.s`, d.s, 10, 35);
  range(`${id}.d`, d.d, 50, 130);
  range(`${id}.v`, d.v, 10, 60);
  if (!Array.isArray(d.k) || d.k.length < 2 || d.k.length > 4) errs.push(`${id}.k: want 2-4 decisions`);
  else d.k.forEach((x, i) => range(`${id}.k[${i}]`, x, 6, 45));
  if (!Array.isArray(d.p) || d.p.length < 1 || d.p.length > 3) errs.push(`${id}.p: want 1-3 pitfalls`);
  else d.p.forEach((x, i) => range(`${id}.p[${i}]`, x, 6, 40));
  if (!Array.isArray(d.dep) || d.dep.length > 6) errs.push(`${id}.dep: want an array of 0-6 ids`);
  else for (const x of d.dep) { if (x === id) errs.push(`${id}.dep: depends on itself`); else if (!ids.has(x)) errs.push(`${id}.dep: unknown id "${x}"`); }
  for (const f of ["s", "d", "v"]) brand(`${id}.${f}`, d[f]);
  for (const f of ["k", "p"]) (d[f] || []).forEach((x, i) => brand(`${id}.${f}[${i}]`, x));
}
for (const id of Object.keys(det)) if (!ids.has(id)) errs.push(`details entry "${id}" matches no item`);
for (const id of dupDetail) errs.push(`details entry "${id}" written twice`);

if (errs.length) { console.error(`${slug}: ${errs.length} problem(s)\n` + errs.map(e => "  - " + e).join("\n")); process.exit(1); }
const items = gids.reduce((a, g) => a + groups[g].items.length, 0);
console.log(`${slug}: ok. ${map.bands.length} bands, ${gids.length} groups, ${items} components, ${map.cross.length} cross-cutting, files: ${files.join(", ")}`);
