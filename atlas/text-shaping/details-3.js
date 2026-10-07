// Details for the text shaping plate, part 3: font selection and font file parsing.
ATLAS.details("text-shaping", {
  "font-catalog": {
    s: "The index of every font available to the process: installed, bundled and downloaded, with names, styles, weights, languages and file locations, built without opening every file fully.",
    d: "At startup or on change, the catalog enumerates font directories and the system font service, reads each file's name and style tables, and records family, weight, width, slant, supported scripts and file path. It watches for installation and removal. Many stacks persist the index to disk and validate it by modification time so startup is quick. The hard part is scale and drift: thousands of fonts mean enumeration costs seconds, user fonts appear while the program runs, and the same family may exist in several versions.",
    k: ["Persistent cached index versus rescanning at startup: a cache starts fast, but stale entries after font changes need robust invalidation.", "Loading metadata eagerly versus lazily: eager makes matching instant, while lazy cuts startup time and memory for fonts never used."],
    p: ["A cached entry for an uninstalled font makes matching choose a file that no longer exists.", "Scanning all fonts on the main thread at startup stalls the first window."],
    v: "Install and remove a font while the program runs and confirm the catalog reflects each change without a restart, and cold-start enumeration time stays within its budget on a machine with thousands of fonts.",
    dep: ["font-name-and-metadata", "platform-font-service", "container-and-directory"]
  },
  "font-matching": {
    s: "Chooses the best available face for a requested family, weight, width and slant, using defined distance rules when the exact face is missing.",
    d: "A request names one or more families plus style properties. The matcher finds faces in the first available family and ranks them by distance: width first, then slant, then weight, with defined direction preferences when the weight is between available faces. Generic names such as serif or monospace map to configured families. The result is a face, possibly with variation settings applied. The challenge is predictability: users expect the same result on every platform, but available fonts, name aliases and metric-compatible substitutes differ.",
    k: ["Standardized matching distance versus platform behavior: a standard gives consistent results, but ignores the system's own configured preferences.", "Matching by family name only versus also by metrics: names are simple, but metric-compatible substitutes keep layout when a family is missing."],
    p: ["A bold request in a family with only regular synthesizes bold instead of using a close real face in a related family.", "Aliases that map a missing brand family to a different design change the layout of existing documents."],
    v: "Request every combination of weight and style from a family with only some faces installed and confirm the selected face follows the documented distance order and is the same on repeat runs.",
    dep: ["font-catalog", "variation-axes", "language-default-fonts"]
  },
  "fallback-chains": {
    s: "The ordered list of fonts tried after the requested family, combining author-supplied lists, language defaults and system fallbacks, used when characters are missing from earlier fonts.",
    d: "A chain is built per run: the requested families first, then fonts configured for the language and script, then system-wide candidates ordered by general coverage, and last a font that shows a placeholder glyph. The chain is cached by style and language. The first font that covers a character wins, with preference for keeping an entire cluster in one font. The challenge is cost and stability: the chain may include dozens of fonts, evaluating it must be cheap, and the outcome must not change between runs or between machines more than necessary.",
    k: ["Static configured chains versus dynamic search by coverage: static chains are predictable, while dynamic search finds a font for any character at the cost of variability.", "Per-language chains versus one global chain: per-language gives correct glyph forms, but needs tagging and maintenance."],
    p: ["A chain that puts a symbol font early supplies its glyphs for ordinary punctuation.", "No font at the end of the chain leaves empty boxes, with no hint of which font to install."],
    v: "Render a string covering many scripts with only a Latin font requested and confirm every character resolves to a font in the chain, with a consistent choice on repeated runs.",
    dep: ["font-catalog", "coverage-index", "language-default-fonts"]
  },
  "per-character-fallback": {
    s: "Splits a run when the primary font lacks a character, picking a substitute font for the missing characters, and keeping clusters and sequences together in one font.",
    d: "For each cluster in the run, the selector asks the first font in the chain whether it covers every character in the cluster, including joiners and variation selectors. If not, it tries the next font. Adjacent clusters resolved to the same font are merged into one run, which is handed to the shaper. Emoji presentation selectors decide between text and emoji fonts. Matching on clusters rather than code points avoids splitting a base from its marks. The difficulty is the quantity of runs it creates and the visual mismatch between fonts.",
    k: ["Selecting by cluster versus by code point: clusters keep sequences intact, but requires cluster analysis before shaping.", "Preferring one font for a whole word versus the best font per character: whole-word fonts look consistent, but may drop to a worse font for all characters."],
    p: ["Selecting for a base letter alone puts its combining mark in a different font and breaks attachment.", "Fragmented runs from many fallbacks break kerning and cost many extra shaping calls."],
    v: "Shape a sentence with Latin text, an ideograph and an emoji sequence from a Latin-only requested font and confirm each cluster resolves to a font covering it entirely, and no cluster is split across fonts.",
    dep: ["fallback-chains", "grapheme-clusters", "coverage-index", "emoji-sequences"]
  },
  "language-default-fonts": {
    s: "Maps a language and script to preferred fonts, so shared characters, such as ideographs used by several languages, show the glyph forms that readers of that language expect.",
    d: "The same code point can have different accepted forms in different languages. The system holds default font lists per language tag, and the language of a run selects among them, along with locale-specific substitution features inside the font. Defaults come from operating system settings, configuration files and the user's preferred languages. Generic family names resolve through the same table. The challenge is wrong or missing language tags: text without a tag uses the interface language, which is often not the content language.",
    k: ["Trusting the language tag versus guessing from content: tags are accurate when present, but guessing from content is the only option for untagged text and is unreliable.", "System-wide defaults versus per-application configuration: system defaults match user expectations, but applications want consistent output across machines."],
    p: ["Untagged text in an ideographic script shows another language's glyph forms, which readers see as errors.", "A language list order change on one machine changes the fonts used for the same document."],
    v: "Render a fixed set of shared ideographs with three language tags and confirm the glyph forms and chosen fonts differ in the expected ways, and untagged text follows the documented default.",
    dep: ["font-catalog", "style-resolution"]
  },
  "web-font-loading": {
    s: "Fetches fonts named by a document, tracks their loading state and tells layout when to swap them in, with policies for what to show while waiting.",
    d: "A document declares font families with source locations, style ranges and a character range. The loader fetches only when text needs the font, decodes and sanitizes the file, and registers it in the catalog. Display policy decides whether text is invisible, shown in a fallback font, or shown in the fallback and swapped. A swap changes metrics, so layout must run again. Caches and range subsets reduce transfer. The difficulty is the trade-off between flashes of invisible or unstyled text and layout shifts.",
    k: ["Block briefly versus show fallback immediately: blocking avoids a visible swap, but delays readable content on slow networks.", "Metric-adjusted fallback versus plain fallback: adjustment reduces layout shift when the real font arrives, but needs per-font override data."],
    p: ["A swap after first paint shifts the layout of surrounding content and moves what the user was reading.", "A font that fails to load leaves invisible text indefinitely unless a timeout falls back."],
    v: "Throttle the network, load a page using a downloadable font, and confirm text appears per the declared policy, the swap triggers one relayout, and the final glyphs match a page with the font preinstalled.",
    dep: ["font-sanitizer", "compressed-wrappers", "font-catalog", "style-resolution"]
  },
  "font-synthesis": {
    s: "Fakes a missing style by slanting outlines for italic or thickening them for bold, so a request for a style the family lacks still displays something close.",
    d: "When matching finds no face with the requested slant or weight, the renderer applies a shear transform to simulate italic and an outline expansion or repeated drawing to simulate bold. It also adjusts advances for the heavier look. Small capitals can be synthesized by scaling capital letters. Style properties allow turning this off. Results are always inferior to real faces. The challenge is that the synthesis must be visible to the layout, since bold changes advance widths, and that it applies to scripts where slanting or thickening is wrong.",
    k: ["Synthesizing styles versus showing the nearest real face: synthesis honors the request visibly, but a nearest face keeps designed shapes and spacing.", "Shearing a fixed angle versus using the font's italic angle: the fixed angle is simple, but the font angle matches its design."],
    p: ["Synthetic bold applied to a font that already has a bold face doubles the weight when the matcher fails.", "Synthetic italic applied to ideographic text looks distorted and some readers consider it wrong."],
    v: "Request italic and bold from a family with only a regular face and confirm the outlines are sheared and thickened, advances widen consistently, and the same request with a real italic face uses that face untouched.",
    dep: ["font-matching", "outline-scaling", "stem-darkening"]
  },
  "coverage-index": {
    s: "A compact structure recording which characters each font can display, so fallback can find a covering font without opening and scanning the font's character map.",
    d: "For every cataloged font the index stores a set of covered code points, usually as sorted ranges or bitmaps built from the character map table. Queries ask for a font covering a given character or cluster, and results come from intersecting the sets of fonts in a chain. It is persisted with the catalog. Variation selector sequences and color presentation need extra coverage data. The challenge is size and update: thousands of fonts at a million code points need efficient compression, and the index is rebuilt when fonts change.",
    k: ["Ranges versus bitmaps: ranges are compact for contiguous coverage, while bitmaps are quicker for random lookups in sparse sets.", "Index of code points versus of sequences: code points are small, but sequences are needed to answer for emoji and variation selectors."],
    p: ["A font that claims coverage in its character map but has empty glyphs is chosen and shows blanks.", "An index not rebuilt after a font update returns a font that no longer covers the character."],
    v: "Query a set of characters against the index and then shape each with the chosen font, confirming no result is the missing glyph and the index matches a direct scan of each font's character map.",
    dep: ["character-to-glyph-mapping", "font-catalog"]
  },
  "container-and-directory": {
    s: "Reads the outer structure of a font file: a signature, a count of tables, and a directory giving each table's tag, offset and length, which every other parser step depends on.",
    d: "The parser checks the file signature and reads the table directory, then validates each entry: offsets inside the file, lengths that fit, no overlaps beyond what is allowed, and checksums where enforced. Required tables for the font's type must be present. Table access is by tag, returning a pointer and length over the mapped file, not a copy. The challenge is trust: every offset is attacker-controlled, so every read must be bounds-checked, and real-world fonts violate the specification in many harmless ways that must still load.",
    k: ["Strict validation versus tolerance of known real-world defects: strictness blocks malformed fonts, while tolerance keeps thousands of old fonts working.", "Zero-copy views of mapped memory versus copying tables: views are fast and small, but any validation gap becomes a memory safety issue."],
    p: ["An offset plus length that overflows an integer passes a naive bounds check and reads outside the file.", "Overlapping tables that were accepted let one parser's edit corrupt another table."],
    v: "Load a corpus of known-good fonts and confirm all open, then load truncated and corrupted variants and confirm each is rejected with an error and no read falls outside the file.",
    dep: []
  },
  "character-to-glyph-mapping": {
    s: "Looks up the glyph for a character code in the font's mapping tables, with several formats for different ranges and support for variation selectors.",
    d: "A font can hold several mapping subtables, each for a platform and encoding, with formats from simple arrays to segmented ranges and trimmed tables for the full code point range. The reader selects the best subtable for Unicode and builds or uses a lookup, binary searching segments. A separate subtable maps a base character plus a variation selector to a specific glyph. Unmapped characters yield glyph zero, the missing-glyph shape. The challenge is speed, since every character of every run is looked up, and the variety of formats.",
    k: ["Binary searching the font's table versus building a flat array: searching saves memory, while a flat table makes lookups constant-time for hot ranges.", "Treating glyph zero as missing versus checking coverage first: glyph zero is cheap, but fallback needs to know before shaping."],
    p: ["Choosing a legacy subtable when a full-range one exists drops characters outside the basic range.", "Variation selector sequences ignored by the lookup show the default glyph instead of the requested form."],
    v: "Map every character in a test string, including supplementary-plane characters and variation sequences, and confirm each glyph id equals the id from an independent parser, with unmapped characters returning the missing glyph.",
    dep: ["container-and-directory"]
  },
  "glyph-outlines": {
    s: "Decodes the shape of each glyph from the font's outline data, quadratic or cubic curves, composite glyphs built from parts, and the instructions that go with them.",
    d: "Each glyph is a set of contours made of on-curve and off-curve points, or path commands in the cubic format. Composite glyphs reference other glyphs with a transform and offset, such as an accent over a letter, and can nest. The loader decodes the points into a path in font units, applies the variation deltas when needed, and hands it to scaling. It checks recursion depth and point counts. The difficulty is untrusted data: a composite referencing itself, huge point counts or invalid indices must be rejected rather than followed.",
    k: ["Decoding on demand versus the whole font: on demand saves memory and startup, while pre-decoding avoids work during first draw.", "Quadratic versus cubic curve formats: quadratics are simpler to rasterize and hint, while cubics describe designs with fewer points."],
    p: ["A composite glyph that references itself recurses until the stack overflows.", "Contour points not closing correctly leave a stray line from the last point to the origin."],
    v: "Decode every glyph in a test font and compare the resulting paths with those from an independent decoder within a small tolerance, and confirm self-referencing composites are rejected with an error.",
    dep: ["container-and-directory", "variation-deltas"]
  },
  "horizontal-metrics": {
    s: "Reads advance widths, side bearings and vertical metrics from the font, giving the spacing data used by layout, line height and caret placement.",
    d: "Per-glyph advance widths and left side bearings live in a metrics table, with a compact form for runs of glyphs sharing the last advance. Font-wide values such as ascent, descent and line gap exist in several tables, some set for particular platforms. Vertical fonts have a parallel set. Variable fonts adjust these values per axis. Underline and strikeout positions come from other tables. The challenge is inconsistency: the tables disagree in many real fonts, and the choice of which to use changes line height across platforms.",
    k: ["Trusting one metrics table versus a documented preference order: one table is simple, while an order handles fonts where tables disagree.", "Unscaled font units versus pre-scaled values: font units keep precision for scaling, but pre-scaled values avoid repeated multiplication."],
    p: ["Choosing a different metrics table than other platforms yields different line spacing for the same font.", "Advance widths read as signed instead of unsigned corrupt layout for wide glyphs."],
    v: "Read ascent, descent and advances for a set of fonts and confirm they match the values an independent tool reports, and that the same font yields the same line height on each platform.",
    dep: ["container-and-directory", "variation-deltas"]
  },
  "layout-tables": {
    s: "Parses the font's rule tables for substitution, positioning and glyph classes: scripts, languages, features and lookups, the data the shaper interprets.",
    d: "The substitution, positioning and definition tables share a structure: a script list pointing to language systems, a feature list pointing to lookups, and a lookup list with subtables in several formats. Glyph classes and coverage tables are compressed sets. The parser builds indexes so a script, language and feature can be resolved to lookups quickly, and it must tolerate offsets that point anywhere. The challenge is size and complexity: large fonts have thousands of lookups with deep subtable trees, and parsing must be lazy and bounds-checked.",
    k: ["Lazy parsing of subtables versus eager parsing at load: lazy saves startup, but moves cost and failures into the first shaping call.", "Resolving features per run versus per font: per run is exact, while caching the resolution per script and language saves repeated work."],
    p: ["A cyclic or very deep subtable chain from a malformed font makes parsing or shaping run for a very long time.", "Missing default language system makes features for unlisted languages silently not apply."],
    v: "Parse the tables of a complex font, resolve a script, language and feature to lookups, and confirm the lookup list equals the one produced by an independent tool, while a font with a cyclic offset is rejected.",
    dep: ["container-and-directory"]
  },
  "font-collections": {
    s: "Reads files that bundle several fonts sharing tables, and handles font selection by index within the file, so families can ship as one smaller file.",
    d: "A collection file begins with a header listing the offsets of each member font's directory. Members point to shared tables, such as outlines used by several variants, which saves space. The loader exposes each member as its own font with an index in the catalog entry. Identity is file plus index. Some fonts are later updated by replacing the whole file. The challenge is that the sharing creates aliasing: a table modified or unloaded for one member affects others, and unusual layouts need validation.",
    k: ["Treating each member as an independent font versus a shared object: independence simplifies logic, but sharing saves memory for large families.", "Selecting by index versus by name: index is exact and fast, but breaks when a file is updated and members reorder."],
    p: ["A catalog that stores only the file path loads the first member for every request.", "Reordered members in an updated file make stored indices point at the wrong face."],
    v: "Open a collection with several members, load each by index, and confirm every member reports its own names and metrics and shared tables are mapped once in memory.",
    dep: ["container-and-directory", "font-name-and-metadata"]
  },
  "font-name-and-metadata": {
    s: "Reads the naming and style records of a font: family and style names in several languages, weight and width classes, version, and flags used for matching and display.",
    d: "The naming table stores strings keyed by platform, encoding, language and name id, such as family, subfamily, full name and a stable identifier used to refer to the font uniquely. A style table holds numeric weight, width, slant flags, and the classification that tells whether the font is monospaced or serif. Strings use legacy encodings that need conversion. The challenge is messy data: many fonts have inconsistent family names, so grouping by name needs both legacy and typographic family entries.",
    k: ["Using the legacy family name versus the typographic family: the legacy name matches old documents, while the typographic name groups large families correctly.", "Localized names versus a single canonical name: localized names suit display, while canonical names are required for stable matching."],
    p: ["Two fonts with the same full name from different vendors collide in the catalog.", "A name string in a legacy encoding decoded as UTF-16 produces garbage names."],
    v: "Read names and style values from a set of fonts and confirm the grouped families, weights and localized names equal those from an independent inspection tool, with legacy-only fonts grouped correctly.",
    dep: ["container-and-directory"]
  },
  "compressed-wrappers": {
    s: "Unpacks fonts delivered in compressed container formats, restoring the original tables with checks, so downloaded fonts are smaller without changing how they are parsed.",
    d: "A wrapper holds the same tables as an ordinary font but compressed per table or as one stream, sometimes with a preprocessing transform for outline data that makes it compress better. The decoder checks sizes, decompresses into a buffer, reverses the transform and rebuilds the table directory and checksums. Output size limits stop decompression bombs. The difficulty is safety and speed: decompression runs on untrusted data and often on the loading path, and the reconstructed font must match what a plain font would be.",
    k: ["Decompressing the whole font eagerly versus per table: whole font is simple, while per table saves memory for tables never read.", "Strict size limits versus permissive: strict limits block decompression bombs, but may reject legitimately large fonts."],
    p: ["No cap on the declared uncompressed size lets a tiny file allocate gigabytes.", "A reversed transform that differs from the encoder's by one byte yields outlines with small corruptions."],
    v: "Decompress a set of wrapped fonts and confirm the rebuilt tables equal the originals byte for byte, while a file declaring an absurd uncompressed size is rejected before allocation.",
    dep: ["container-and-directory", "font-sanitizer"]
  },
  "font-sanitizer": {
    s: "A validation pass that checks a font's structure and either rewrites it into a safe form or rejects it, run before untrusted fonts reach the main parsers.",
    d: "The sanitizer parses every table with strict bounds checks and consistency rules: counts match lengths, indices are in range, glyph data is well formed, and instructions are structurally valid. It can drop unsupported or risky tables, and writes out a clean copy so later stages parse only known-good data. It often runs in a separate low-privilege process. The challenge is false rejections: strict rules reject fonts that render fine elsewhere, while lax rules leave a large attack surface in code that handles many table types.",
    k: ["Rewriting to a clean copy versus validating in place: rewriting gives a known-good output, but costs time and may change rendering.", "Sandboxed process versus in-process checks: a separate process contains bugs, while in-process is faster and simpler to deploy."],
    p: ["A sanitizer that accepts a table its renderer parses differently lets malformed data through.", "Rejecting fonts for harmless checksum errors breaks documents that worked for years."],
    v: "Feed the sanitizer a corpus of mutated fonts and confirm none cause a crash or out-of-range read in the downstream parsers, while a set of real-world fonts is still accepted and renders identically.",
    dep: ["container-and-directory", "layout-tables", "glyph-outlines"]
  },
});
