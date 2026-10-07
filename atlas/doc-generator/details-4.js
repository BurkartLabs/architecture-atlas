// Details for the documentation generator plate, part 4: content assembly, versions and locales.
ATLAS.details("doc-generator", {
  "front-matter": {
    s: "A block of structured metadata at the top of a prose file giving title, description, order, tags, version applicability and display options.",
    d: "The block is delimited, parsed as structured data and validated against a schema, then stored on the page model. Titles, summaries and ordering come from it. Other fields control search weight, hidden pages, redirects from old paths and edit links. A schema catches typos in field names. It is where authors express intent that cannot be inferred from the file, so incorrect parsing causes invisible failures such as pages that vanish from navigation.",
    k: ["Metadata in the file versus in a central manifest: in-file metadata moves with the page; a manifest gives one overview and separates facts about one page.", "Strict schema versus free-form fields: strict catches typos; free-form lets themes and plugins add fields and hides mistakes."],
    p: ["A misspelled draft field is ignored and an unfinished page publishes.", "A colon or quote in a title breaks parsing and the whole block is read as text."],
    v: "Add a page with a title containing a colon and a hidden flag, and one with a misspelled field. The first is excluded from navigation and search; the second is rejected with the field name.",
    dep: ["prose-files","project-config"]
  },
  "navigation-manifest": {
    s: "The definition of the site's tree and order: sections, pages, external links and where generated reference sections attach.",
    d: "A manifest lists top-level sections and children explicitly, or declares rules, such as alphabetical order or file layout. It names where generated reference trees attach and how deep they go. It is the single place to reorder the site and is validated: every page appears once, there are no dangling entries, and orphan pages are flagged. Large sites split the manifest per section so teams can own parts.",
    k: ["Explicit manifest versus derived from files: explicit order teaches concepts well and needs edits for each page; derived is automatic and arbitrary.", "One manifest versus per-section manifests: one is easy to audit; per-section manifests scale with teams and can conflict at the top."],
    p: ["A page missing from the manifest is built but unreachable and no check reports it.", "A renamed file leaves a manifest entry pointing at nothing."],
    v: "Add a page without listing it and remove a listed page. The build reports the orphan and the dangling entry, and after fixing both every page is reachable from the home page by links in navigation.",
    dep: ["front-matter","page-model"]
  },
  "includes-and-snippets": {
    s: "Reuse of text and code across pages by including named fragments or regions from other files, with variables and conditional content.",
    d: "Includes pull shared paragraphs, such as warnings or install steps, into many pages from one source. Code includes pull a marked region from a real file. The include resolver runs before parsing so included text participates in headings, links and search. Paths are restricted to the project. Conditionals show content per version or product edition. Overuse makes pages hard to read in source and hard to debug, so errors should show the chain.",
    k: ["Include at source level versus at the tree level: source-level includes can mix markup and break structure; tree-level includes are safe and need parser support.", "Variables and conditions in content versus separate pages: conditions avoid duplication and make source hard to read; separate pages are clear and diverge."],
    p: ["An include of a file that includes the first loops until the build runs out of memory.", "An error inside an included snippet is reported against the including page only."],
    v: "Include one snippet in three pages and edit it once. All three change after rebuild, an include path that escapes the project fails, and a circular include reports the chain.",
    dep: ["prose-files","path-and-url-model"]
  },
  "symbol-page-generator": {
    s: "Creates a reference page for each package, module, type and callable from the declaration model, with signature, description, members and cross-links.",
    d: "For each declaration the generator picks a page shape by kind and fills it from the model: signature, summary, details, parameters, examples, members grouped by kind, inheritance, related items and source link. It decides page granularity: one page per type or one per member. It names the file with a stable slug and registers the page in navigation. Large packages mean thousands of pages, so page count, size and build time are all concerns.",
    k: ["One page per type versus per member: per type keeps related members together and gets long; per member is precise and creates many small pages.", "Group members by kind versus alphabetically: by kind helps browsing; alphabetical helps lookup and mixes kinds."],
    p: ["A type with hundreds of members produces a page too long to load or navigate.", "Generated pages have no hand-written context, and readers get a list of signatures with no guidance."],
    v: "Generate pages for a package with nested types and overloads. The number of pages matches the model, each links to its parent and members, and every public declaration is reachable from navigation.",
    dep: ["declaration-model","slug-generation","page-model"]
  },
  "glossary": {
    s: "A maintained list of project terms and definitions, linked from first use in text and shared with the spelling and style checks.",
    d: "Terms are defined once, with a short definition and optional aliases. When a term appears in a page, the generator links it or shows a tooltip. The same list feeds the spelling dictionary and prose lint rules, and the translation tools so terms are translated consistently. It prevents ten different definitions across pages. Linking every occurrence is noisy, so rules usually link only the first on each page.",
    k: ["Link every occurrence versus first only: every occurrence is thorough and visually noisy; first only is clean and misses deep entries.", "Central glossary versus definitions in each page: central ensures consistency; inline definitions are local and diverge."],
    p: ["A common word is defined as a term and is linked everywhere it appears.", "Translators translate a term differently on each page because the glossary was not shared."],
    v: "Define a term with an alias and use it on two pages. Only the first use on each page is linked, the alias also resolves, and the spelling check accepts both.",
    dep: ["page-model","prose-linting"]
  },
  "release-notes-pages": {
    s: "Pages per release that present generated and hand-written change information, linked from the affected items and the version switcher.",
    d: "Each release gets a page or section with sections for new features, fixes, deprecations and breaking changes, filled from the changelog pipeline and linked to reference pages. A cumulative page and a feed let readers see what changed over several versions. Notes belong to a version and must remain in that version's documentation, even after later releases. Upgrade guidance may link to dedicated pages.",
    k: ["Per-release pages versus one running page: per-release pages are linkable and numerous; one page is easy to scan and gets long.", "Notes in the docs repository versus in the release tool: in the docs, notes are indexed with everything else; in the release tool they are close to the code and separate."],
    p: ["Notes for an old release are edited later and no longer match what shipped.", "Links to items removed in a later version break in old notes."],
    v: "Open the notes for a release. Each entry links to a live page in that release's documentation, and the feed lists releases newest first with correct dates.",
    dep: ["page-model","version-model"]
  },
  "version-model": {
    s: "The representation of releases, channels and branches the site documents, with ordering, status such as stable, development or end-of-life, and the revision each was built from.",
    d: "Each documented version has an identifier, a sortable number, a label, a source revision, a status and a publication date. The model orders them by semantic rules and defines relations: which is latest, which are supported, which are previews. It feeds the switcher, search filters, banners, canonical URLs and sitemap. Versions with different structures, such as renamed packages, must still map to each other.",
    k: ["Semantic ordering versus date ordering: semantic ordering handles patch releases of old lines; date ordering is simple and breaks when old lines are patched later.", "Version per release versus per minor line: per release is precise and heavy; per line is lighter and merges patch-level differences."],
    p: ["Versions sorted as text place 1.10 before 1.2.", "A development branch is labeled as stable because the status was not updated."],
    v: "Load a list including 1.2, 1.10 and a pre-release. The model sorts them correctly, marks the latest stable release, and the switcher, sitemap and search filter list the same entries.",
    dep: ["project-config","repo-checkout"]
  },
  "version-snapshots": {
    s: "Stored builds of each released version, either as finished sites or as models, so old versions stay available without being rebuilt.",
    d: "Once released, a version's documentation is frozen: its output is stored and mounted under its own path, or its model is stored and rendered again by the current theme. Storing output is cheap and reproducible but keeps old themes. Storing models allows uniform appearance and global features, but makes old versions subject to new tool bugs. The choice also decides how corrections to old documentation are applied.",
    k: ["Store rendered sites versus store models and re-render: rendered sites are exact and frozen with old design; re-rendering unifies design and risks changing history.", "Immutable old versions versus allowing corrections: immutability is trustworthy; corrections fix errors and need a patch process."],
    p: ["A new theme feature, such as search filters, is missing from old versions' pages.", "Old snapshots depend on a toolchain version that is later deleted."],
    v: "Publish a new release and fetch a page from an earlier version. It is unchanged byte for byte from when it was published, and fixing a typo through the correction process updates only the targeted version.",
    dep: ["version-model","model-cache","static-hosting"]
  },
  "version-aliases": {
    s: "Named pointers such as latest, stable and next that map to specific versions, so addresses and links can stay constant while the target moves.",
    d: "A URL with an alias resolves to the current target of that alias. Aliases can be implemented as redirects, copies of the target's files, or edge rewrites. They matter for links from outside, which should point to latest and not to a specific number. When a release is published, aliases are updated atomically with the manifest. Canonical links on alias pages point to the real version to avoid duplicate content.",
    k: ["Alias as redirect versus as a copy: redirects change the address in the browser and never duplicate; copies keep the address and duplicate content for search engines.", "Link examples to latest versus a pinned version: latest never needs updating and may describe the wrong release; pinned links are exact and age."],
    p: ["The alias moves before the new version finishes publishing, and readers see not-found pages.", "Search engines index both alias and numbered pages as separate pages."],
    v: "Publish a new stable version. The latest address now shows the new content, the previous number still serves the old content, and the alias page's canonical link points to the numbered page.",
    dep: ["version-model","redirect-map"]
  },
  "canonical-urls": {
    s: "Declared preferred addresses for pages that are reachable under several URLs, such as aliases, versions and locales, so search engines and tools treat one as authoritative.",
    d: "Each page emits a canonical link element pointing to its preferred address, typically the latest version for a given page, and alternate links for other locales. The rules rely on a mapping between equivalent pages in different versions, which breaks when a page is renamed or removed. Sitemaps list canonical addresses only. Wrong canonical settings are hard to notice because the site still works for readers.",
    k: ["Canonical to the latest version versus to each version itself: pointing at latest concentrates search traffic on current docs; self-canonical keeps old versions findable.", "One canonical per page versus an equivalence group: single is simple; groups handle moves and renames and need a maintained mapping."],
    p: ["Every old version declares the latest as canonical, including pages that do not exist there.", "A canonical link uses the preview host name and ships to production."],
    v: "Fetch a page in an older version and in the latest. Their canonical and alternate links match the stated policy, point to existing pages, and use the production host name.",
    dep: ["version-model","path-and-url-model"]
  },
  "translation-catalogs": {
    s: "Extracted translatable strings from pages and theme, stored in per-language catalogs that translators fill and the build merges back.",
    d: "The extractor splits prose into segments, usually paragraphs, and writes them to catalog files keyed by source text or by identifier. Translators supply the target text, aided by memory of earlier translations and the glossary. The build replaces segments in the doc tree with translations, keeping markup, links and code intact. Keys that are the source text make the catalogs resilient to reordering and fragile against small edits that invalidate a translation.",
    k: ["Key by source text versus by stable identifier: source-text keys need no ids and break on any edit; identifiers are stable and must be maintained.", "Translate whole pages versus segments: whole-page translation reads naturally and is hard to keep current; segments update locally and can lose flow."],
    p: ["A small English edit invalidates a long paragraph's translation, and translators redo it.", "Translators alter a link target or code token inside a segment and break the page."],
    v: "Extract a page, translate two segments and build the locale. The translated text appears with links and code intact, and untranslated segments fall back with a marker.",
    dep: ["markup-parser","glossary","page-model"]
  },
  "locale-fallback": {
    s: "The rule for what a locale shows when a page, string or asset is not translated: another language, the source language, or a notice.",
    d: "Complete translation is rare, so every locale has a fallback chain, for example a regional variant, then the base language, then the source language. Fallback may happen per page or per string. Pages in fallback are labeled so readers know. Search, navigation and the switcher must follow the same rules. Fallback decisions affect canonical links, since a page identical across locales should not compete with itself in search.",
    k: ["Show source-language page with a notice versus not found: fallback gives content and mixes languages; not found is honest and loses the reader.", "Fall back per string versus per page: per string maximizes translated text and produces mixed-language pages; per page is coherent and less complete."],
    p: ["Fallback pages are indexed as duplicates under each locale's address.", "The navigation shows translated titles for pages that open in the source language."],
    v: "Request an untranslated page in a regional locale. It shows the base-language or source text with a visible notice, the switcher still works and the canonical link points to the source page.",
    dep: ["translation-catalogs","canonical-urls"]
  },
  "stale-translations": {
    s: "Detection and flagging of translated content whose source text has changed, with reports and visible markers for readers and translators.",
    d: "Each translated segment records the source text or hash it was made from. When the source changes, the translation is marked stale. Policies include hiding it, showing it with a warning, or showing the source. Reports rank pages by traffic and staleness for translators. Without detection, translations drift silently and contradict current behavior, particularly dangerous for security or migration instructions.",
    k: ["Show stale translation with warning versus fall back to source: warning keeps familiar language and risks wrong guidance; fallback is right and switches language.", "Hash of the whole segment versus fuzzy match: hashes are exact and flag trivial edits; fuzzy matching tolerates small changes and may miss meaningful ones."],
    p: ["A translated page instructs readers to use a removed option and no one is notified.", "A typo fix in English marks hundreds of translations stale."],
    v: "Change one sentence in a source page. The translated segment is marked stale in the report and shows the configured warning on the page, while unchanged segments remain current.",
    dep: ["translation-catalogs","content-hashing"]
  }
});
