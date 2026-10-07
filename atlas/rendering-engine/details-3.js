// Details for the rendering engine plate, part 3: layout, layout modes, text and fonts, images and embedded content.
ATLAS.details("rendering-engine", {
  "layout-tree": {
    s: "The tree of boxes built from the flat tree and computed style, including anonymous boxes the standard requires, which layout algorithms operate on.",
    d: "Each element whose display is not none gets one or more boxes, text gets text boxes, and pseudo-elements get their own. The builder inserts anonymous wrappers where the rules demand them, for example around inline content next to blocks or missing table parts. Display values select the formatting context a box establishes. The tree is updated incrementally when style or DOM changes, by recreating only the boxes whose display category changed. Hard parts are anonymous box bookkeeping, which complicates every insert and remove, and keeping DOM and box trees consistent.",
    k: ["A separate box tree vs laying out DOM nodes directly: display values and anonymous boxes can differ from the DOM, but two trees must be kept in sync.", "Reattaching only changed subtrees vs rebuilding on any display change: much cheaper updates, but anonymous wrapper repair logic is subtle."],
    p: ["Inserting a block into inline content without splitting the anonymous wrapper leaves invalid box nesting.", "Rebuilding the whole tree for a single class change makes simple updates cost a full layout."],
    v: "Toggle display between inline, block, flex and none on an element inside mixed content, and verify the box tree structure and rendering after each, including anonymous wrappers, against a fresh load of the same final state.",
    dep: ["computed-style", "flat-tree", "pseudo-elements", "mutation-model"]
  },
  "constraint-space": {
    s: "The input and output contract of layout: a parent passes available size and context in, and gets back an immutable fragment with a size and positioned children.",
    d: "A layout function takes a box and a constraint space: available inline and block size, whether sizes are fixed or to be determined, the writing mode, percentage resolution sizes, and the state of floats and margin collapsing. It returns a fragment: a size, child fragments with offsets, and information such as baselines, overflow and break tokens. Fragments are immutable, which allows safe caching and reuse across frames. The design problem is exactly what goes into the constraint space, because anything omitted makes cached results wrong and anything extra makes caching useless.",
    k: ["Immutable fragments from pure-looking functions vs mutating boxes in place: results can be cached and shared, but some data, such as final offsets, must be passed back through return values.", "A rich constraint space vs a minimal one: fewer wrong cache hits, but more constraint values that must match for reuse."],
    p: ["Forgetting an input such as percentage basis in the constraint space returns a stale cached size.", "Mutable data hidden in a box leaks one layout's state into the next."],
    v: "Lay out the same subtree under several parent widths and percentage bases, then repeat and confirm cached results are used only when every constraint matches, with output identical to a cold layout.",
    dep: ["layout-tree", "layout-caching", "writing-modes"]
  },
  "block-formatting": {
    s: "Lays out block-level boxes in a vertical stack, resolving widths, margins, margin collapsing, and the interaction with floats in a block formatting context.",
    d: "A block container's children are placed one after another in the block direction. Each child's width is resolved from its container, auto margins and sizing properties, then its height from content. Adjoining vertical margins collapse under rules involving padding, borders, clearance and emptiness. Boxes that establish a new block formatting context contain their floats and stop margins from escaping. Percentage heights need an input that may not be known yet. The hard parts are margin collapsing, which depends on siblings and descendants, and keeping cache correctness around it.",
    k: ["Handling margin collapsing as state passed through layout vs a post-pass: one pass, but constraint space must carry the collapsing margin and clearance.", "Separate formatting contexts for isolation vs one big one: contained layout and cheaper invalidation, but each context has setup and may change margin and float behavior."],
    p: ["Margins collapsing through an empty box makes a spacing bug that appears only when content is removed.", "Percentage heights inside an auto height parent silently compute as auto."],
    v: "Lay out nested blocks with collapsing margins, empty boxes, clearance and a new formatting context, then compare positions with the specification's worked examples, including after resizing.",
    dep: ["constraint-space", "layout-tree", "floats", "intrinsic-sizing"]
  },
  "inline-formatting": {
    s: "Lays out text and inline boxes into lines within a block, handling baselines, line height, inline-block and replaced content, and text-align.",
    d: "Inline content is first flattened into a stream of items: text runs, open and close tags, atomic inlines and floats. Items are measured, then broken into lines to fit the available width, which may be shortened by floats. Each line box is sized from the tallest content and aligned on baselines, with vertical-align offsets. Text-align and justification distribute the remaining space. The result is a set of line fragments referencing runs of shaped text. Difficult parts are mixed fonts, bidirectional order, and relayout of one line when only one word changed.",
    k: ["A flattened item list vs a recursive inline tree: simpler and faster line breaking and shaping across element boundaries, but tag style changes must be tracked per item.", "Relaying out a paragraph from the changed line vs from the start: much faster edits, but state at each line start must be saved."],
    p: ["Treating font height as line height clips or spaces text wrongly when mixed fonts have different metrics.", "Ignoring floats while measuring makes lines overlap them or leave gaps."],
    v: "Lay out a paragraph with mixed font sizes, inline-block, an image, and a float, at several widths. Check line boxes and baselines against reference renderings and confirm editing a word near the end does not relayout earlier lines.",
    dep: ["line-breaking", "text-shaping", "bidi-text", "floats", "constraint-space"]
  },
  "floats": {
    s: "Takes boxes out of normal flow to the left or right edge of their container, and shortens neighboring line boxes around them using exclusion areas.",
    d: "A float is placed as high as possible at the edge of its containing block without overlapping earlier floats, and below earlier content in the flow. Layout tracks an exclusion space: a set of rectangles that line boxes must avoid. Content in later lines checks available width against exclusions at its vertical position. Clear moves a box below floats. Shape-outside lets exclusions follow a shape. The hard part is that float positions depend on the flow and the flow depends on the floats, and the exclusion list must travel through siblings, children and cached layout.",
    k: ["A shared exclusion space passed through layout vs per-context float lists: correct interaction across nested boxes, but it widens the constraint space and weakens caching.", "Supporting shape-based exclusions vs rectangles only: richer text wrapping, but per-line queries become geometry computations."],
    p: ["A float that straddles a page or column break must be moved by fragmentation rules, or it overlaps content.", "Cached layout reused when an earlier float changed leaves lines with the wrong width."],
    v: "Place left and right floats of varied heights with clear and a block formatting context, then resize. Line box positions and float edges must match reference output at every width, with no overlaps.",
    dep: ["block-formatting", "inline-formatting", "constraint-space", "fragmentation"]
  },
  "positioned-boxes": {
    s: "Places relatively, absolutely and fixed positioned boxes against their containing block or the viewport, with offsets, static position and overflow rules.",
    d: "Absolute boxes are removed from flow and sized and placed against their containing block, the nearest positioned ancestor or a box with a transform or containment. They resolve left, right, top, bottom, width and height as a system of equations, with a static position used when offsets are auto. Fixed boxes use the viewport or a transformed ancestor. Because their containing block may be far up the tree, the engine collects them as candidates during layout and finishes them once the container's size is known. Hard cases are static position, nested contexts and anchoring to other boxes.",
    k: ["Deferring positioned boxes until the container is done vs laying them out in tree order: the container size is known, but they need a second pass and a candidate list.", "Treating transforms as containing-block creators vs not: matches the specification, but surprises authors when a transform makes fixed children scroll."],
    p: ["A transform added to an ancestor changes what fixed descendants are positioned against and moves them unexpectedly.", "Static position computed before sibling layout finishes places the box in the wrong spot."],
    v: "Nest absolute and fixed boxes inside transformed and untransformed ancestors, resize and scroll, and compare placement with reference output, including auto-offset static positions.",
    dep: ["block-formatting", "layout-tree", "constraint-space", "stacking-contexts"]
  },
  "intrinsic-sizing": {
    s: "Computes how small and how large a box wants to be, the min-content and max-content sizes, which flex, grid, tables and auto widths consume.",
    d: "Min-content is the narrowest size without overflow, such as the longest unbreakable word, and max-content is the width with no wrapping. Block containers combine these from children, inline content by measuring runs, and replaced elements from their natural size and ratio. Results are used by shrink-to-fit widths, table columns, grid tracks and flex bases. Computing them can need a full measurement pass of the subtree, so they are cached. The hard part is cost: intrinsic sizes of nested content may be asked for repeatedly during a parent's algorithm.",
    k: ["Computing intrinsic sizes on demand with caching vs as part of normal layout: only requested work is done, but algorithms that ask repeatedly depend on cache hits.", "Estimating from content vs exact measurement: faster for large trees, but results can disagree with real layout."],
    p: ["Nested flex or grid containers asking for intrinsic sizes at each level can be exponential without caching.", "Intrinsic size of content with percentage sizes needs special cyclic rules or sizes oscillate."],
    v: "Lay out a tree of nested flex and grid containers with auto sizing and count intrinsic size computations. They must stay near linear in node count, and widths must match a reference layout.",
    dep: ["layout-caching", "inline-formatting", "text-shaping", "replaced-elements"]
  },
  "layout-caching": {
    s: "Reuses a box's previous layout result when the constraint space and the box's dependencies are unchanged, so unaffected subtrees skip layout entirely.",
    d: "After layout, a box stores its fragment together with the constraint space it was computed under. On the next layout, if the box is not dirty and the new constraints match in the ways that matter, the fragment is reused. A simplified check covers common cases, such as a different available block size when height does not depend on it. Subtrees below a dirty box that gave the same result can also be skipped. Hard parts are deciding which constraint values a result depended on, and invalidation of ancestors with fixed child results.",
    k: ["Caching by exact constraint match vs tracking what each result depended on: exact is simple and safe but misses reuse that dependency tracking finds.", "Caching fragments per box vs per formatting context: finer reuse for small edits, with higher memory and bookkeeping."],
    p: ["A cached result that ignored a dependency, like a percentage basis, shows stale geometry that a resize hides.", "Caching with too many distinct constraint inputs gives hit rates near zero and only costs memory."],
    v: "Edit one leaf in a large page and count boxes laid out. Only the leaf, its ancestors on the path and boxes whose constraints changed should be laid out, and the resulting tree must equal a full cold layout.",
    dep: ["constraint-space", "layout-invalidation", "intrinsic-sizing"]
  },
  "layout-invalidation": {
    s: "Marks which boxes need layout after a style or DOM change, distinguishing self-only, children and ancestor-affecting changes, and schedules the work.",
    d: "A style diff classifies a change: layout of the box itself, of its children, or of positioned or fixed descendants only. Marking walks up the tree to the nearest boundary that cannot be affected, such as a box with containment or fixed size, setting a needs-layout flag along the path and a child-dirty flag on ancestors. Layout then visits only flagged paths. DOM insertions and removals also mark the parent. The difficulty is correct boundaries: stopping too early leaves stale geometry, stopping too late relays out the whole page.",
    k: ["Marking up to a containment boundary vs always to the root: smaller relayout when boundaries exist, but each property must declare its effect on ancestors.", "Distinguishing child-only from self changes vs one flag: avoids relayout of siblings and parents, but flags must be consistent between algorithms."],
    p: ["Setting a width on a box marks only itself when the parent is a flex container whose algorithm depends on it.", "A missed ancestor mark makes a page stuck with old geometry until a resize."],
    v: "Change properties one at a time in a large tree and log the boxes laid out for each. Results must be limited to the expected boundary and the final geometry must equal a full layout.",
    dep: ["computed-style", "layout-tree", "containment", "layout-caching"]
  },
  "replaced-elements": {
    s: "Elements whose content is supplied from outside CSS layout, such as images, video, canvas and form controls, sized from intrinsic dimensions and ratio.",
    d: "Replaced boxes have a natural width, height and aspect ratio from their content, which feed width and height auto resolution, min and max constraints and object-fit placement. Images report dimensions after decoding the header, so layout may change when it arrives unless dimensions are given. Form controls are a mix: their internals are built from shadow trees or native widgets with user agent styles. Their baselines and sizes depend on platform theme and font. The difficulty is size stability, since late-arriving content shifts layout, and consistent behavior across control types.",
    k: ["Reserving space from aspect-ratio attributes vs waiting for load: no layout shift when the image arrives, but authors must provide dimensions.", "Controls built from shadow trees vs native widgets: styleable and consistent, but must emulate platform accessibility and behaviors."],
    p: ["Images without dimensions cause the page below them to jump when they load.", "Overriding control styles can remove the focus indicator or a platform-dependent minimum size."],
    v: "Load a page with images with and without dimension attributes, throttled. Layout shift must be zero for those with dimensions and measurable for the others, and form controls must render sized from their fonts.",
    dep: ["intrinsic-sizing", "image-decoding", "embedded-surfaces", "shadow-roots"]
  },
  "flex-layout": {
    s: "One-dimensional layout that distributes space among items along a main axis by grow and shrink factors, aligning them on the cross axis, with wrapping into lines.",
    d: "The algorithm determines each item's flex base size and hypothetical main size, collects items into lines, then resolves flexible lengths by repeatedly freezing items that violate min or max constraints and redistributing the remaining space. Cross sizes follow, then alignment. Items' intrinsic sizes, percentages and aspect ratios feed in. Because sizing depends on content and constraints in both axes, items may be laid out more than once. Hard parts are that repeated measurement multiplies through nesting, and caching the passes keeps cost under control.",
    k: ["Measuring items twice (content then final) vs once: correct cross sizes with stretched items and percent children, but nested containers multiply passes.", "Honoring min-content automatic minimum sizes vs allowing items to shrink to zero: avoids unintended overflow, but surprises authors with items that will not shrink."],
    p: ["Nested flex containers with percent children can be laid out exponentially many times without cached results.", "An item whose automatic minimum size is its content refuses to shrink and overflows the container."],
    v: "Lay out a row with grow, shrink, wrapping, min and max constraints and nested flex children at several widths. Compare item sizes to the specification's results and confirm the number of item layouts stays bounded.",
    dep: ["intrinsic-sizing", "constraint-space", "layout-caching", "writing-modes"]
  },
  "grid-layout": {
    s: "Two-dimensional layout that sizes rows and columns through a track sizing algorithm and places items into the resulting cells, with spans, areas and auto-placement.",
    d: "Grid places items by explicit lines or an auto-placement algorithm, creating implicit tracks as needed. Track sizing runs separately for columns then rows, resolving fixed, flexible and content-based tracks in several phases, using items' min-content and max-content contributions. Items that span several tracks distribute their size by rule. Subgrids let a nested grid share its parent's tracks. Row sizing may depend on column results, so the algorithm sometimes iterates. It is hard because the many sizing functions interact and intrinsic size queries are costly.",
    k: ["Computing track sizes from item contributions vs fixed tracks only: content adapts, but each item may be measured several times.", "Subgrid sharing parent tracks vs independent nested grids: aligned content across components, but sizing couples inner and outer layout."],
    p: ["Large implicit grids with thousands of auto-placed items can make placement quadratic if not indexed.", "Content-sized tracks with percentage items produce cyclic dependencies that fall back to special rules."],
    v: "Lay out a grid with fixed, flexible and content-sized tracks, spanning items and a subgrid at several viewport sizes. Compare tracks and item rectangles with reference output and time a grid of five thousand items.",
    dep: ["intrinsic-sizing", "constraint-space", "layout-caching", "writing-modes"]
  },
  "table-layout": {
    s: "Lays out rows, columns and cells with widths determined across the whole table, using either a fixed algorithm or one that measures content.",
    d: "Table layout builds a grid of cells from row and column structure, adding anonymous parts where needed. In fixed mode, column widths come from the first row and explicit widths, so layout is quick. In automatic mode, every cell's min and max content width contributes to column widths, which are distributed among columns within the table width. Heights come from row contents with spanning cells distributing extra height. Borders can collapse. Hard parts are spanning cells, percent widths, and the cost of measuring all cells before any can be placed.",
    k: ["Fixed table layout vs automatic: predictable and fast start for large tables, but column widths ignore content.", "Collapsing borders vs separate: tidy shared borders, but borders belong to the table, which complicates painting and cell sizing."],
    p: ["Automatic layout of a table with thousands of rows must measure every cell, causing long layouts on data updates.", "Percent widths on cells that exceed the available space are resolved by rules that surprise authors."],
    v: "Render tables with spans, percent widths, collapsed borders and long content in both algorithms and compare column widths and row heights with reference output. Update one cell in a large table and confirm only affected rows relayout.",
    dep: ["intrinsic-sizing", "layout-tree", "constraint-space", "fragmentation"]
  },
  "fragmentation": {
    s: "Splits content across columns, pages or regions, choosing break points by rules for avoidance, orphans and widows, and continuing the box's layout in the next fragment.",
    d: "A fragmentainer has a fixed block size. Layout fills it and, when content exceeds it, selects a legal break point guided by break-before, break-after and break-inside preferences, orphans and widows, and the need to avoid breaking in boxes with fixed sizes. It returns a break token recording where to resume. Each box may produce several fragments, with borders and padding sliced or cloned. Multicolumn also balances column heights. The hard part is that break choice depends on later content, requiring backtracking, and interacts with floats, tables and flex.",
    k: ["Break tokens with resumption vs laying out the whole box then slicing: layout can stop and resume per fragmentainer, but every algorithm must be break-aware.", "Balancing column heights vs filling sequentially: even columns, but needs repeated layout passes to find the smallest height that fits."],
    p: ["An unbreakable box taller than the fragmentainer must overflow or be forced to break, or layout loops.", "Break preferences that conflict can recurse into relayouts unless one is dropped by priority."],
    v: "Print a document with long paragraphs, tables and keep-together headings to pages, and render a multicolumn article. Check break positions against rules, orphans and widows, and column balance.",
    dep: ["constraint-space", "block-formatting", "floats", "table-layout"]
  },
  "writing-modes": {
    s: "Maps logical directions to physical ones so the same layout works for horizontal and vertical scripts and for left-to-right and right-to-left text.",
    d: "Layout algorithms are written in logical terms: inline size, block size, inline start, block start. The writing mode and direction of each box translate these to physical edges when positions are produced. A child with a different writing mode forms its own context with its own orientation, so sizes pass between parent and child through conversions. Text orientation, upright glyphs and baselines differ in vertical mode. The challenge is discipline: any physical assumption left in an algorithm becomes a bug for some script, and conversions at every boundary are easy to miss.",
    k: ["Logical coordinates internally and physical at the edges vs physical throughout: one algorithm serves every script, but conversion code is needed at every parent-child boundary.", "Per-box writing mode vs per-document: mixed content such as vertical labels works, but orthogonal flows complicate sizing."],
    p: ["A hard-coded width or left in one algorithm breaks vertical or right-to-left pages while looking fine in tests.", "Orthogonal children whose available size depends on their parent create sizing cycles."],
    v: "Render the same page in horizontal, vertical and right-to-left modes by changing only the writing mode and direction. Every box must be a rotated or mirrored version of the original layout, with no overlaps or clipped text.",
    dep: ["constraint-space", "layout-tree"]
  },
  "containment": {
    s: "Declares that a box's layout, style, paint or size cannot depend on or affect outside content, and lets the engine skip work for content that is off-screen.",
    d: "Containment values promise isolation: layout containment makes the box a boundary for layout invalidation, size containment lets it be sized without looking at children, paint containment clips to the box, and style containment scopes counters. Content-visibility goes further by skipping layout and paint of a subtree until it is near the viewport, using a size estimate meanwhile. Skipped content is still in the DOM and accessible, and is laid out on demand when needed for find, focus or measurement. The hard part is correct fallbacks when something asks about skipped content.",
    k: ["Skipping work for off-screen subtrees vs always laying out everything: large savings on long pages, but scroll extent depends on estimates that can shift as content materializes.", "Containment as author promise vs automatic detection: cheap and explicit, but a broken promise causes visual bugs that are hard to trace."],
    p: ["A wrong size estimate for skipped content makes the scrollbar jump as sections are rendered.", "Find, anchors and focus must force a subtree to render or they cannot reach content inside it."],
    v: "Wrap a thousand sections in skipped content and measure initial layout time and scrollbar stability. Find-in-page on a hidden section must scroll to and reveal it.",
    dep: ["layout-invalidation", "layout-caching", "paint-invalidation", "layout-tree"]
  },
  "font-matching": {
    s: "Selects the font face for a piece of text from the family list, weight, style and stretch, with per-character fallback when a face lacks a glyph.",
    d: "Style provides an ordered list of family names. The engine resolves each family to faces from web fonts the page defined, installed fonts and generic families, picking the closest weight, width and style by the specified distance rules. Text is split into runs by the first family that covers each character. When none does, system fallback consults per-script and per-language preferences, sometimes across a process boundary. It is hard because font lookups are slow, results must be cached by family and properties, and exposing the installed font list is a fingerprinting risk.",
    k: ["Per-character fallback vs per-run: correct glyph coverage for mixed scripts, but segmentation and caching are more complex.", "Exposing all installed fonts vs a limited set: authors get matching typography, but the list identifies the user's machine."],
    p: ["Fallback lookups on the main thread for each new character cause jank when text with rare scripts first appears.", "Variable font axes mismatched to requested weight produce faux bold on top of an already bold face."],
    v: "Render text mixing Latin, Arabic, CJK and emoji with a short family list. Each run must use the expected face, with no missing-glyph boxes, and a second render must hit the font cache.",
    dep: ["web-font-loading", "shape-caching", "computed-style", "segmentation-hyphenation"]
  },
  "web-font-loading": {
    s: "Downloads fonts declared by the page, decides what to show while they load, and swaps them in when ready, with consequences for layout.",
    d: "A font-face rule declares a family and sources. The font is fetched only when text using it is laid out, so loading starts late. While waiting, the font display policy decides whether to hide text briefly, show a fallback and swap later, or never swap. When the font arrives it is decoded and sanitized, and text using it is invalidated and relaid out, which may shift content. Preloading and metric overrides reduce the shift. Hard parts are shifts, flashes of invisible text, and defending the parser against malformed font files.",
    k: ["Show fallback then swap vs block briefly: text is readable at once, but layout shifts on swap unless metrics are matched.", "Loading on first use vs eagerly: avoids downloading unused fonts, but delays the first view of text that needs them."],
    p: ["Hiding text for seconds while a font loads makes pages unreadable on slow networks.", "A swapped font with different metrics shifts layout and moves what the reader was looking at."],
    v: "Load a page with a slow web font under throttling and capture frames. Confirm text policy behavior, the swap time, and the measured layout shift with and without metric overrides.",
    dep: ["font-matching", "stylesheet-loading", "layout-invalidation", "shape-caching"]
  },
  "text-shaping": {
    s: "Converts a run of characters in one font and script into positioned glyphs, applying ligatures, kerning, mark placement and script-specific reordering.",
    d: "A shaper takes text, a font, script, language, direction and feature settings, and applies the font's substitution and positioning tables to produce glyph ids with advances and offsets, plus a mapping back to characters. Complex scripts reorder and reshape letters by context. Shaping happens per run of uniform style, but ligatures and kerning mean a run cannot be split arbitrarily. Results feed line breaking and painting and are cached. The hard parts are cost on large texts, correct cluster mapping for selection and caret, and segmenting runs at the right places.",
    k: ["Shaping whole paragraphs once vs per line: far fewer calls and cached results, but line breaking can need reshaping at break points where ligatures or joining change.", "Using the font's own tables vs simplified metrics: correct typography for many scripts, but shaping is expensive and sensitive to font bugs."],
    p: ["Breaking a run inside a cluster draws wrong glyph forms or places the caret between letters that form one unit.", "Reshaping text on every keystroke in a long paragraph makes typing slow."],
    v: "Shape sample strings in Latin with ligatures, Arabic with joining, and an Indic script with reordering. Glyph sequences and cluster maps must match the reference, and selection must move by whole clusters.",
    dep: ["font-matching", "segmentation-hyphenation", "bidi-text", "shape-caching"]
  },
  "line-breaking": {
    s: "Chooses where to break a paragraph into lines using Unicode break opportunities, language rules, and the available width of each line.",
    d: "Break opportunities come from the Unicode line breaking rules, tailored by language, word-break and overflow-wrap settings, and by dictionaries for scripts without spaces. The breaker places items greedily into lines, measuring each candidate against the width left after floats, and backs up to the last opportunity when the line overflows. Hyphens, soft hyphens and trailing spaces need handling, and balanced or pretty wrapping may use a global optimization. The difficulty is agreement between break rules, shaping that may change widths at the break, and performance for long text.",
    k: ["Greedy line filling vs optimal paragraph breaking: fast and incremental, but lines can be ragged compared with a global fit.", "Dictionary-based breaking for unspaced scripts vs break anywhere: readable text for those languages, but dictionaries cost memory and time."],
    p: ["A long unbreakable string overflows its container unless an overflow rule is set.", "Trailing space hanging rules applied wrongly make right-aligned or centered lines off by one space."],
    v: "Break a multilingual paragraph at many widths with different break settings. Break positions and per-line widths must match reference output, and no line other than an unbreakable word may overflow.",
    dep: ["segmentation-hyphenation", "text-shaping", "inline-formatting", "floats"]
  },
  "bidi-text": {
    s: "Reorders mixed left-to-right and right-to-left text for display with the Unicode bidirectional algorithm, while preserving logical order for editing.",
    d: "Each character gets a bidi class, and explicit direction controls and embeddings assign levels. The algorithm resolves neutral characters and numbers, then reorders runs per line by level. Reordering happens after line breaking, because it applies to each line separately, so shaping runs must align with level runs. Selection, caret movement and hit testing must map between logical and visual positions. Isolates and the direction of block and inline elements add state. Hard parts are correct handling of brackets and numbers and the cost of bidi work in large paragraphs.",
    k: ["Resolving levels once per paragraph and reordering per line vs reordering the whole paragraph: matches the standard and handles wrapping correctly, but needs per-line run data.", "Visual vs logical selection: visual feels natural on screen, but logical keeps copied text correct."],
    p: ["Reordering before line breaking puts the wrong words at line ends.", "Neutral characters at run boundaries resolve to the wrong direction, flipping punctuation."],
    v: "Lay out sentences mixing Hebrew, Arabic, Latin and numbers with brackets at several widths. Visual order of each line must match the reference, and copying a selection must yield text in logical order.",
    dep: ["text-shaping", "segmentation-hyphenation", "inline-formatting", "writing-modes"]
  },
  "segmentation-hyphenation": {
    s: "Finds character, word, sentence and grapheme boundaries, and hyphenation points, for caret movement, selection, line breaking and spell checking.",
    d: "Grapheme boundaries determine what the user perceives as one character, which governs caret steps and deletion. Word boundaries drive double-click selection and word-wise movement, and use language-specific rules and dictionaries. Hyphenation uses pattern tables per language to find legal hyphen positions. These services work on the text of the layout, not the DOM, because adjacent nodes can form one word. The hard parts are language variation, memory for dictionaries, and consistency between selection and line breaking.",
    k: ["Shared boundary services vs per-feature code: caret, selection and wrapping agree, but changing a rule affects all of them.", "Pattern-based hyphenation vs dictionary lookups: small and fast, but lower accuracy for compound-heavy languages."],
    p: ["Treating a combining sequence as several characters lets backspace leave a stray mark.", "Segmenting words across inline element boundaries makes double-click select half a word."],
    v: "Move the caret and double-click through text with emoji sequences, combining marks, and unspaced script. Boundaries must match the Unicode test data, and hyphenation of sample words must match pattern results.",
    dep: ["text-shaping"]
  },
  "shape-caching": {
    s: "Caches shaped runs and glyph data keyed by text, font and features, so repeated or reflowed text is not shaped or rasterized again.",
    d: "A cache maps a word or run, its font, size, features and direction to the shaped result. Many pages repeat words, and relayout at a new width reuses results. Word-level caches work when breaking at spaces does not change shaping, which holds for most scripts. A glyph cache keeps rasterized or outline data for the GPU. Entries are bounded and evicted by use. The problem is correctness: the key must include every input, such as language and letter spacing, and memory must stay bounded on pages with huge text.",
    k: ["Word-level cache vs whole-run cache: higher hit rates and cheaper relayout, but valid only when boundaries are safe for the script.", "Unbounded cache for speed vs a bounded size: no recompute, but memory grows on long documents."],
    p: ["Leaving a feature setting out of the key returns the wrong glyphs for text that differs only by that setting.", "Caching across font changes after a swap leaves old glyphs until eviction."],
    v: "Reflow a long page by resizing, counting shaping calls. After the first layout, later widths must shape few new words, and glyph output must match an uncached run.",
    dep: ["text-shaping", "font-matching"]
  },
  "image-decoding": {
    s: "Turns compressed image data into pixel buffers, off the main thread, and often incrementally, producing sizes early and pixels as data arrives.",
    d: "The decoder reads headers to report dimensions and format as soon as they arrive, so layout can proceed, then decodes pixel data, progressively when the format allows. Decoding runs on worker threads and is scheduled by priority based on what is visible. Output goes to a buffer in a size and format for rasterization, possibly decoded straight to the GPU. Color profiles and orientation are applied. The hard parts are cost and memory for large images, defending against malformed data, and deciding what to decode and when.",
    k: ["Decoding at raster time on demand vs at load: lower memory for images never seen, but scrolling can stall on a late decode.", "Decoding to target size vs full size: much less memory for downscaled images, but cache entries per size or a later resize costs more."],
    p: ["A very large image decoded fully at load uses hundreds of megabytes and may crash a low-memory device.", "Malformed headers claiming huge dimensions trigger giant allocations unless limited."],
    v: "Load a page with large images and scroll quickly. Decode must run off the main thread, off-screen images should not be decoded, and peak decoded memory must stay under the cache limit.",
    dep: ["decoded-image-cache", "responsive-image-selection", "raster-scheduling"]
  },
  "decoded-image-cache": {
    s: "Keeps decoded pixel data for recently used images within a memory budget and evicts it by use, so images can be redrawn without being decoded again.",
    d: "Decoded images are large compared to their compressed form, so the cache holds them under a budget with eviction based on recency and visibility. Entries are keyed by image, size and color settings, and may live on the GPU. Raster tasks lock entries they need. A decode may be shared between multiple uses. When memory is tight, the budget shrinks and everything off-screen goes. The hard part is balancing memory against scroll smoothness and keeping decoded data from outliving its use.",
    k: ["A budgeted cache vs retaining while referenced: memory stays bounded, but evicted images must be decoded again on return.", "Locking entries during raster vs copying: no duplicates and no mid-draw eviction, but locks must be released reliably."],
    p: ["A leaked lock keeps decoded data pinned forever and slowly exhausts memory.", "Too small a budget on high-resolution screens causes a decode loop while scrolling."],
    v: "Scroll through a long gallery repeatedly and track decode counts and memory. After the first pass, revisited visible images should hit the cache, and memory must not exceed the budget.",
    dep: ["image-decoding", "raster-scheduling"]
  },
  "responsive-image-selection": {
    s: "Chooses which image source to load from candidates by viewport width, layout size and display density, and re-chooses when conditions change.",
    d: "Authors provide a set of sources with widths or densities and a sizes description of how wide the image will be laid out. The engine evaluates the sizes expression against the viewport, picks the smallest candidate that satisfies the device pixel ratio, and fetches it. Art direction chooses by media conditions. Because the choice depends on layout width, which is not known at parse time, engines use the sizes hint, and may reselect after resize. It is hard because the choice is made before layout, and the downloaded size is fixed once chosen.",
    k: ["Choosing before layout from the sizes hint vs after layout: the request starts early, but a wrong hint downloads the wrong size.", "Reselecting on resize vs keeping the first choice: sharper images on growth, but extra downloads and layout shift if the size changes."],
    p: ["A missing or wrong sizes attribute makes the engine assume full viewport width and download oversized images.", "Switching sources on resize without keeping the dimensions makes the layout jump."],
    v: "Load a page with several candidates and sizes at different viewport widths and pixel ratios. The network log must show the expected candidate, and resizing should fetch a new one only when required.",
    dep: ["image-decoding", "speculative-parsing", "replaced-elements"]
  },
  "animated-images": {
    s: "Plays multi-frame images by decoding frames on a timer and invalidating paint, with rules for pausing when not visible.",
    d: "An animated image has per-frame durations and loop counts. A timeline advances the current frame by clock, decoding the next frame ahead of time on a worker, and asks paint to redraw the image's area. Frames are cached as needed, since keeping all decoded frames of a long animation can be huge. The engine pauses or slows animation when the image is off-screen or the page is hidden and honors user preferences for reduced motion. The hard parts are memory against stutter and keeping several instances of one image in sync.",
    k: ["Decoding frames just ahead vs caching all of them: bounded memory, but slow decode causes stutter, while caching trades memory for smoothness.", "Pausing off-screen animation vs continuing: saves power, but resuming shows a jump or needs time catch-up."],
    p: ["Decoding every frame of a large animated image into memory exhausts the cache.", "Animating an image far off-screen keeps invalidating paint and wastes battery."],
    v: "Display a long animated image, scroll it off-screen and hide the page. The paint count for its area must drop to zero, and on return the animation must resume at the correct frame without a memory spike.",
    dep: ["image-decoding", "paint-invalidation", "visibility-throttling", "decoded-image-cache"]
  },
  "embedded-surfaces": {
    s: "Places other documents, video, canvas and plugin-like content in the page as boxes, each with its own producer of pixels and its own lifecycle.",
    d: "Frames embed another document that may run in a separate process, and its output arrives as a surface the compositor places in the parent's layer tree, clipped and transformed like any box. Video and canvas supply frames from decoders or script, also as surfaces, with their own timing. The parent must forward input, coordinate hit testing and sizes, and observe visibility. Cross-origin frames must not leak information through timing or geometry. Hard parts are sync between producer and compositor, and keeping the parent responsive when children are slow.",
    k: ["Out-of-process frames vs in-process: isolation and independent responsiveness, but input forwarding, hit testing and surface embedding must cross a boundary.", "Pulling frames by the compositor's clock vs pushing when produced: smooth media synchronization, but a producer that misses deadlines shows stale frames."],
    p: ["A slow embedded frame can stall the parent if layout waits on its size.", "Hit testing into a remote frame with stale geometry delivers input to the wrong place."],
    v: "Embed a cross-origin frame with a video and a canvas in a transformed container. Frames must appear aligned, clicks must reach the right element inside, and a busy child must not freeze the parent's scrolling.",
    dep: ["layer-tree", "hit-testing", "frame-presentation", "replaced-elements"]
  },
});
