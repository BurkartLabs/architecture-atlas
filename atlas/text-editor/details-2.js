// Details for the text editor plate, part 2: layout, rendering, syntax and structure.
ATLAS.details("text-editor", {
  "line-wrapping": {
    s: "Splits long logical lines into several display rows at the window width or a set column, at word or character boundaries, while keeping cursor movement logical.",
    d: "Wrapping computes break points from measured glyph widths, preferring spaces and punctuation, with an optional indent for continuation rows. Each logical line then owns one or more display rows, so the line height map and the viewport must be indexed by rows. Resizing the window recomputes breaks lazily for visible lines first. Up and down movement follows display rows, while home and end have two meanings. It is hard because wrapping depends on fonts and width, which makes the row count of the whole file unknown until measured.",
    k: ["Wrap by measuring in the layout engine vs. by character count: measuring is correct for proportional fonts and mixed scripts, but costs a pass over each line.", "Exact row counts for the whole file vs. estimates refined lazily: exact counts give a true scrollbar, while estimates keep large files responsive."],
    p: ["Estimated row heights make the scrollbar jump as lines are measured, and can cause a scroll anchor to drift.", "Break points inside a combining sequence or a ligature split one character into broken halves."],
    v: "Open a file with very long lines, narrow the window repeatedly, and confirm each logical line wraps without cutting graphemes, the cursor stays on the same character, and scrolling remains smooth.",
    dep: ["text-shaping-and-fallback","line-height-map","grapheme-and-width"]
  },
  "bidirectional-text": {
    s: "Displays text mixing left-to-right and right-to-left scripts in the right visual order, and maps cursor movement and selection between logical and visual order.",
    d: "Characters are stored in logical order, but the display order of each line is computed by the Unicode bidirectional algorithm, which splits a line into directional runs and reorders them. The renderer draws runs separately. Cursor keys move visually, while the cursor position itself stays a logical offset, so one logical position can appear in two places at a run boundary. Selections can become several rectangles. It is hard because the model, hit testing and rendering all disagree about what comes next.",
    k: ["Full bidirectional support vs. none: full support is required for correct display of right-to-left languages, but touches layout, cursor and selection code everywhere.", "Visual vs. logical cursor movement: visual feels natural to readers, while logical is easier to implement and predict in source code."],
    p: ["Source code with right-to-left characters inside strings or comments can be rendered so that its visual order hides what the compiler actually reads, a known attack.", "Hit testing a click on a run boundary picks the wrong logical offset."],
    v: "Open a line mixing English, Arabic and numbers. Check that display order matches the reference algorithm's output, arrow keys step through every character, and a selected range paints as the correct visual pieces.",
    dep: ["text-shaping-and-fallback","grapheme-and-width"]
  },
  "tab-stops": {
    s: "Expands tab characters to the next tab stop by display column, and controls how leading whitespace, indent size and visible whitespace markers are shown.",
    d: "A tab advances to the next multiple of the tab width counting from the line start, so its width depends on its column. Tab size, indentation by spaces or tabs, and per-language overrides are settings. The editor can detect the file's style from its content. Optional rendering marks spaces and tabs. Column calculations for the cursor, rulers and alignment must apply the same rule everywhere. It is hard because wide characters and tabs make column counts differ from character counts, and mixed indentation is common in real files.",
    k: ["Detect indentation from content vs. use the configured default: detection avoids mismatched edits to existing files, but guesses wrong on mixed files.", "Tabs rendered by width setting vs. fixed: a user-controlled width respects each reader's preference, while fixed width keeps alignment of trailing comments stable."],
    p: ["A column computed by counting characters places the cursor wrongly on lines that start with tabs.", "Detection from a few lines at the top picks a style that disagrees with most of the file."],
    v: "Open a file with mixed tabs and spaces at width four and eight. Verify that columns reported in the status bar, ruler positions and cursor placement all agree with a reference calculation.",
    dep: ["grapheme-and-width","position-mapping"]
  },
  "grapheme-and-width": {
    s: "Treats a user-perceived character as the unit for cursor movement and deletion, and measures how many display cells each one occupies, including wide and zero-width forms.",
    d: "A single visible character may consist of several code points, such as a base letter plus accents or an emoji sequence joined by zero-width joiners. Cursor movement and backspace should respect these cluster boundaries, which come from the Unicode text segmentation rules. Display width classes distinguish narrow, wide and zero-width characters for terminal-like alignment and column counts. It is hard because the rules change with each Unicode version and with fonts, and different tools disagree.",
    k: ["Move by grapheme cluster vs. by code point: clusters match what users see, but backspace may need to delete one code point of a cluster, not the whole.", "Bundle the segmentation tables vs. rely on the platform: bundled tables behave identically everywhere, but need updating, while platform tables stay current and vary."],
    p: ["Deleting half of an emoji sequence leaves a broken or different symbol.", "An outdated width table misaligns columns for newly added characters."],
    v: "Type a family emoji, a flag and a letter with three combining marks. Arrow keys cross each in one step, a selection highlights each fully, and column numbers match the reference width table.",
    dep: ["text-buffer-interface"]
  },
  "text-shaping-and-fallback": {
    s: "Converts a run of characters into positioned glyphs, applying ligatures and script rules, and substitutes other fonts for characters the primary font lacks.",
    d: "A shaping engine takes a run of one script, direction and font, and returns glyph identifiers with advances and offsets, applying features such as ligatures or contextual forms. When the font lacks a character the layout picks a fallback font and splits the run. Coding fonts with ligatures cause one glyph to cover several characters, so cursor positions must still land between the characters. It is hard because shaping is the slowest part of layout and its results depend on context.",
    k: ["Shape every line vs. use a fast path for simple text: a fast path cuts latency for plain text, but doubles the code that must agree on measurements.", "Enable programming ligatures vs. keep one glyph per character: ligatures read well to many users, but break the equal-width assumption and cursor mapping."],
    p: ["Fallback fonts with different metrics make a line taller than the others, causing jitter in scrolling.", "Caching shaped runs without including the font and features in the key reuses stale glyphs after a font change."],
    v: "Display lines of Latin, Arabic, Devanagari and emoji with a font lacking some of them. Every character is drawn, ligatures and clusters are correct, and line height does not change between lines.",
    dep: ["grapheme-and-width","glyph-rasterization"]
  },
  "line-height-map": {
    s: "A structure that records each line's height, including wrapped rows, inline widgets and folds, and converts between a vertical pixel position and a line quickly.",
    d: "To scroll to pixel Y, the editor must find which line is there, and to scroll to a line it must know the Y position. With uniform height this is a multiplication. With wrapping, inserted widgets, folded regions or mixed font sizes it needs a tree or an indexed array of cumulative heights, updated as lines change. Heights of unmeasured lines are estimated. It is hard because any change in width or content shifts everything below it.",
    k: ["Uniform line heights vs. variable: uniform heights make scrolling arithmetic and cheap, while variable heights allow widgets and wrapping at the price of a tree.", "Measure all lines vs. only visible: measuring all is exact but slow for large files, visible-only is fast but requires estimates."],
    p: ["Heights changed above the viewport without compensation make the visible text jump under the user's eyes.", "Forgetting folded regions in the map makes scrolling land on hidden lines."],
    v: "Insert an inline widget and wrap lines near the top of a long file while viewing the middle. The visible line does not move, and jumping to line 50000 lands on it exactly.",
    dep: ["line-wrapping","folding","line-index"]
  },
  "scrolling": {
    s: "Maps input from wheels, trackpads, keys and scrollbars to viewport movement, including smooth scrolling, keeping the cursor visible, and scrolling past the end.",
    d: "Scrolling combines pixel-precise input from trackpads with line-based wheel steps, applies inertia and optional animation, and clamps to the content height. Commands such as search, go to line and cursor movement ask for a position to be revealed, with rules for centering. Scroll positions are stored per editor and restored on reopen. It is hard because it spans input handling, layout and rendering, and users notice any dropped frame, so the position must update on the frame that the input arrived.",
    k: ["Smooth animated scrolling vs. instant jumps: animation helps orientation but adds latency to commands that jump, so many editors animate only wheel input.", "Scroll anchoring to the cursor line vs. to pixel offset: anchoring to a line survives edits above, while pixel anchoring is simpler but drifts."],
    p: ["Scroll handlers that do layout work synchronously drop frames during fast wheel movement.", "Revealing the cursor after every edit fights with the user's manual scrolling."],
    v: "Scroll a half-million-line file with a trackpad and with a held page-down key while recording frame times. Frames stay within the budget, and jumping to a search hit reveals it with context.",
    dep: ["line-height-map","viewport-virtualization","frame-scheduling"]
  },
  "viewport-virtualization": {
    s: "Builds layout and draws only the lines visible on screen plus a small margin, so cost depends on window size and not on file size.",
    d: "The viewport computes the first and last visible row from the scroll position and the line height map, asks layout and the highlighter for just those lines, and draws them. Lines leaving the margin are discarded and recreated on return. Row-based caches avoid repeated work while scrolling. Features that need whole-file knowledge, such as the minimap, scrollbar annotations and search match counts, must use summaries instead. It is hard because bugs show up only at the edges, such as at the top of a huge file or during a rapid jump.",
    k: ["Large overscan margin vs. small: more margin hides latency during fast scrolling, but costs layout and memory for lines that may never show.", "Recycle row elements vs. recreate: recycling cuts allocation churn, while recreating is simpler and avoids stale state."],
    p: ["A feature that quietly walks all lines, such as counting matches, restores linear cost on large files.", "Rapid jumps leave rows drawn from the previous region for a frame, showing blank or wrong lines."],
    v: "Open a million-line file and confirm the number of laid-out lines stays near the visible count plus margin at any scroll position, and that the time to jump from top to bottom is constant.",
    dep: ["line-height-map","text-shaping-and-fallback","highlight-state-cache"]
  },
  "minimap": {
    s: "A scaled-down overview of the whole file beside the scrollbar, used for orientation and quick jumping, drawn from summarized line data.",
    d: "The minimap draws each line as tiny blocks of color or reduced glyphs, with markers for search hits, changes and diagnostics, and a slider for the viewport. It uses the same syntax colors as the main view but must avoid highlighting the whole file at once, so it reads cached tokens and shows plain blocks where none exist. Clicking jumps to a position. It is hard because it is the one feature that touches all lines, so it has to be incremental and cancelable.",
    k: ["Render real tiny glyphs vs. colored blocks: glyphs look familiar but cost more to draw, while blocks are cheap and enough for orientation.", "Always on vs. disabled for large files: always on is consistent, while disabling on large files protects responsiveness."],
    p: ["Redrawing the entire minimap on every keystroke wastes frames on a file of a hundred thousand lines.", "Hidden whole-file tokenization for the minimap undoes the large-file protections."],
    v: "Open a large file and type continuously. The minimap updates within a second without affecting typing latency, shows current search hits and errors, and clicking it centers the file there.",
    dep: ["viewport-virtualization","highlight-state-cache","gpu-text-renderer"]
  },
  "accessibility-tree": {
    s: "Exposes the visible text, cursor, selection and structure to screen readers and other assistive tools through the platform's accessibility interface.",
    d: "Because text may be drawn directly on a GPU surface, the editor must separately publish what is on screen to the platform: lines, the caret, selected range, and notifications on change. Some editors keep a hidden element holding the visible lines for readers, while others build native accessibility nodes. It must announce completions, diagnostics and navigation results, and offer modes that simplify the interface. It is hard because custom-drawn text has no accessibility by default, and large files cannot all be exposed.",
    k: ["Mirror the viewport as accessible text vs. expose the whole document: viewport mirroring keeps cost bounded, while full exposure supports reader navigation across the file at much higher cost.", "Native nodes vs. hidden text element: native nodes integrate best with each platform, but multiply the code for each one."],
    p: ["Announcing every diagnostic change as the user types floods the reader and makes the editor unusable.", "A GPU-rendered editor shipped without a text mirror is invisible to screen readers."],
    v: "Using a screen reader, open a file, move the caret by character, word and line, and trigger a completion list. Each is spoken accurately, and selecting text reports the selected range.",
    dep: ["viewport-virtualization","cursors","completion-ui"]
  },
  "glyph-rasterization": {
    s: "Converts glyph outlines from a font into pixel coverage at a given size and position, with hinting and antialiasing chosen to match the platform's look.",
    d: "A rasterizer turns a vector outline into coverage values for a pixel grid, using grayscale or subpixel antialiasing, and optionally hinting to align stems to pixels. Output depends on size, scale factor and fractional position. Results are cached because rasterizing is expensive. Variable fonts add axes that change outlines, and color fonts need layered or bitmap rendering. It is hard because users are sensitive to text weight and sharpness, and each platform has different expectations.",
    k: ["Platform rasterizer vs. built-in: the platform one matches the system look and settings, while a built-in one gives identical output everywhere.", "Subpixel antialiasing vs. grayscale: subpixel text is sharper on a known display layout, but fringes on rotated, scaled or transparent surfaces."],
    p: ["Rasterizing at the wrong scale factor on a monitor switch leaves blurry text until a cache is flushed.", "Caching by character only ignores the fractional position and weight, producing uneven spacing."],
    v: "Render a test page at 100, 150 and 200 percent scale and compare against reference images from the platform rasterizer. Stems are even, weights match, and moving the window between monitors re-renders crisply.",
    dep: ["display-scaling"]
  },
  "glyph-atlas": {
    s: "A texture packed with rasterized glyph images, so the GPU can draw thousands of characters as textured rectangles from one resource.",
    d: "Each distinct glyph at a size, style and subpixel offset is rasterized once into a region of a large texture, and its coordinates are stored in a lookup table. Drawing a line becomes a list of quads referencing those regions. When the atlas fills, it evicts rarely used glyphs or grows a new page. Color glyphs go into a separate atlas. It is hard because glyph variety is huge with CJK text and emoji, and eviction and re-upload can cause a visible hitch.",
    k: ["One shared atlas vs. per-size atlases: sharing wastes less memory, while per-size atlases simplify eviction and avoid fragmentation.", "Pre-render common glyphs at startup vs. on demand: pre-rendering removes first-use hitches for Latin text but delays startup and does little for rare scripts."],
    p: ["An atlas that fills mid-frame forces a flush and re-upload, which shows as a stutter when scrolling through text in a new script.", "Keys that omit the scale factor draw glyphs at the wrong size after a monitor change."],
    v: "Scroll through a file containing many different scripts and emoji while watching atlas statistics and frame times. Hit rate is high after warm-up, evictions do not cause frames over budget, and memory stays under the cap.",
    dep: ["glyph-rasterization","text-shaping-and-fallback"]
  },
  "gpu-text-renderer": {
    s: "Draws the visible text, backgrounds, selections and cursors as batches of textured rectangles on the GPU, giving high frame rates and low latency.",
    d: "For each frame, the renderer converts visible laid-out rows into vertex data referencing atlas regions and colors, and submits a few batched draw calls with a shader for text, backgrounds and underlines. Only changed rows regenerate their vertices. It can drive very high refresh rates and large windows and keeps the main thread light. It is hard because everything the platform's document renderer gave for free, such as selection, accessibility and input method placement, must be rebuilt.",
    k: ["Direct GPU rendering vs. a document-tree renderer: direct drawing gives control of latency and scale, but requires rebuilding accessibility, selection and input integration.", "Rebuild vertices per frame vs. cache per row: caching saves work for static text, while per-frame rebuilds are simpler and remove invalidation bugs."],
    p: ["Driver differences produce corrupted text or crashes on certain graphics hardware, so a software fallback is required.", "Missing a fallback after a lost graphics device leaves a blank window."],
    v: "Type and scroll in a maximized window on a high-refresh display while capturing frame times. Frames stay under the budget, and forcing a device reset recovers the display with text intact.",
    dep: ["glyph-atlas","overlay-layers","frame-scheduling"]
  },
  "document-tree-renderer": {
    s: "Draws lines as elements in a retained document tree, letting the host's layout and text engine handle shaping, selection, accessibility and input.",
    d: "Each visible line becomes an element with styled spans, and the host engine does shaping, bidirectional layout, font fallback and painting. Virtualization keeps the element count small. Selection, find on page, accessibility and input method support work through the host. This is faster to build and inherits platform behaviors, but the editor gives up control of the paint pipeline and pays for element creation and style recalculation on every change.",
    k: ["Document tree vs. direct GPU drawing: the tree inherits accessibility and input handling, but offers less control of latency and memory.", "Reuse line elements vs. rebuild: reuse avoids style recalculation, but needs careful clearing of old state."],
    p: ["Creating thousands of elements for a large paste stalls the interface because style and layout run for all of them.", "Host text selection and the editor's own selection model disagree, giving two highlights."],
    v: "Scroll a file at maximum wheel speed and capture frame times and element counts. The element count stays constant, frames stay in budget, and screen readers read the visible lines.",
    dep: ["viewport-virtualization","text-shaping-and-fallback","accessibility-tree"]
  },
  "overlay-layers": {
    s: "Separate drawing layers for cursors, selections, search highlights, decorations and indent guides, so these update without redrawing the text beneath them.",
    d: "Selections, matches and current-line highlights are rectangles computed from layout, drawn below the text. Cursors, which blink or animate, and squiggly underlines, are drawn above or in their own layer so a blink repaints almost nothing. Decorations from extensions add colors, borders and inline widgets. Each layer has its own invalidation. It is hard because selections across wrapped lines, bidirectional runs and folds become several rectangles, and many layers multiply the cost per frame.",
    k: ["Separate layers vs. drawing everything per row: layers make blinking and selection changes cheap, while per-row drawing is simpler and keeps order consistent.", "Cursor animation vs. static: animation helps users track the cursor, but costs frames and can bother some users, so it needs a setting."],
    p: ["A blinking cursor that repaints the whole editor wastes battery and adds jitter.", "Selection rectangles that ignore folds draw highlights over hidden lines."],
    v: "Select across wrapped, folded and bidirectional lines and confirm each visible piece is highlighted with no gaps or extras. During cursor blink, profiling shows only the cursor region repainting.",
    dep: ["decorations-and-markers","line-height-map","bidirectional-text"]
  },
  "display-scaling": {
    s: "Handles screens of different pixel densities and scale factors, placing glyphs at fractional positions so text stays sharp and evenly spaced.",
    d: "Layout works in logical units, and rendering converts to physical pixels using the window's current scale factor. Glyph positions are snapped or kept fractional, depending on the renderer, and glyph caches are keyed by scale. Moving a window between screens with different scale changes everything, as does the user's zoom setting. It is hard because rounding errors accumulate along a line, making characters drift out of alignment with the column grid.",
    k: ["Snap glyphs to whole pixels vs. keep fractional positions: snapping is crisp and cacheable, while fractional placement gives even spacing and costs more cache entries.", "Scale the whole interface vs. only text: scaling everything is consistent, while text-only zoom keeps interface chrome small."],
    p: ["Rounding the advance of each glyph separately makes a monospace line a few pixels wider than expected, misaligning the selection.", "Caches not cleared on a scale change keep blurry glyphs after a monitor switch."],
    v: "Drag the window between a standard and a dense display. Text re-renders crisply at the new scale within a frame or two, a hundred-column line keeps its width in logical units, and selections stay aligned.",
    dep: []
  },
  "frame-scheduling": {
    s: "Decides when to draw: coalescing changes into one paint per display refresh, prioritizing the cursor and visible text over lower-priority work.",
    d: "Input and edits mark regions dirty. A scheduler draws at most once per refresh, and does the most urgent work first: echo the typed character, move the cursor, then update highlights, diagnostics and minimap in following frames or idle time. Work that cannot fit the budget is split across frames. It measures input-to-photon latency. It is hard because a pipeline of many components, each cheap alone, can exceed the frame budget together.",
    k: ["Render synchronously on input vs. wait for the next frame: synchronous drawing minimizes latency for a keystroke, but can draw twice per frame under bursts.", "Time-sliced low-priority work vs. background threads: slicing keeps access to main-thread state simple, while threads use more cores but need snapshots."],
    p: ["Doing the highlighter's work in the same frame as the keystroke delays the character by a visible number of milliseconds.", "Repaint requests from many listeners cause several paints per frame."],
    v: "With a high-speed camera or timestamped paint events, measure from key press to the pixel changing. The median stays within the stated budget, even while the highlighter and language server are busy.",
    dep: ["viewport-virtualization"]
  },
  "grammar-tokenizer": {
    s: "Splits each line into colored tokens using declarative pattern rules that carry state from the end of one line to the start of the next.",
    d: "A grammar is a set of regular-expression rules arranged in a stack of contexts, such as inside a string or comment. Tokenizing a line starts from the state saved at the end of the previous line and produces tokens plus a new end state. After an edit, tokenizing resumes at the changed line and continues until the end state matches the stored one. It is approximate, since regular expressions cannot capture full syntax, but it is simple, language-independent and works on incomplete code.",
    k: ["Line-oriented grammar tokenizer vs. a real parser: grammars are easy to write for any language and tolerate broken code, but are inaccurate for nested or context-dependent syntax.", "Tokenize on the main thread vs. a worker: main-thread tokenizing returns visible lines immediately, but a slow grammar stalls typing."],
    p: ["A pattern with catastrophic backtracking can hang the editor on a pathological line.", "An unterminated string in the first line carries its state to the end and colors the whole file as a string."],
    v: "Edit an opening comment delimiter near the top of a large file and see the coloring below update promptly and correctly. Then type an unterminated string and confirm tokenizing stops resuming once the state matches.",
    dep: ["highlight-state-cache","regex-engine","language-configuration"]
  },
  "incremental-parser": {
    s: "Builds a concrete syntax tree for a file and, after each edit, updates only the changed parts of the tree by reusing the unchanged subtrees.",
    d: "A parser generated from a grammar produces a tree with exact source ranges. When the buffer changes, the edit is described to the parser, which reparses starting from the changed region and reuses old subtrees where the new parse would be identical. Error recovery inserts error nodes so the rest of the tree remains usable. It gives accurate highlighting, folding and structural selection. It is hard because grammars must be written and maintained per language, and error recovery quality decides how well it works during typing.",
    k: ["Incremental tree parser vs. line grammar: the tree is accurate and supports structure features, but needs a full grammar and handles broken code less predictably.", "Parse synchronously vs. in the background: synchronous parsing keeps trees current for the next command, but long files can block."],
    p: ["Reporting edits to the parser with wrong byte or position units produces a tree that no longer matches the text.", "Poor error recovery after a missing bracket marks the rest of the file as an error and drops all highlighting."],
    v: "Type a long function character by character in a large file and check each step: the tree matches a full reparse of the same text, and the update time stays in single-digit milliseconds.",
    dep: ["change-deltas","position-mapping","embedded-languages"]
  },
  "syntax-tree-queries": {
    s: "Pattern queries run against the syntax tree to select nodes by shape, used to assign highlight colors, find folds, locate symbols and select structure.",
    d: "Instead of code walking the tree, a query language matches node patterns, such as a function call whose callee is a given name, and attaches labels called captures. Highlighting maps captures to theme scopes, folding queries mark foldable nodes, and symbol queries feed the outline. Queries run only over the visible range for speed. It is hard because queries are written per language, interact with embedded languages, and must be fast over large trees.",
    k: ["Declarative queries vs. hand-written walkers: queries are short and shared by features, but limited in what they express, so complex cases still need code.", "Run queries over the whole file vs. the viewport: whole-file runs support outlines, while viewport-only runs keep highlighting cheap."],
    p: ["A query with an unbounded pattern becomes slow on a deeply nested file.", "Capture names that differ from the theme's scopes leave tokens uncolored."],
    v: "Run the highlight query over a sample file and compare captured ranges and scope names with a stored expected list. Then time the query on a visible range of a large file and confirm it is well within a frame."
    ,
    dep: ["incremental-parser","highlight-state-cache"]
  },
  "embedded-languages": {
    s: "Handles files where one language contains another, such as markup with scripts and styles or documentation with code blocks, by parsing each region with its own grammar.",
    d: "The host language's tree or grammar identifies regions, such as a script element or a fenced block, and marks them as injections with a language name. Each region is parsed or tokenized separately and combined into one highlight result. Edits that change the region boundaries reparse both languages. Folding, comments and brackets then depend on the language at the cursor. It is hard because regions can be nested several levels, the language name must be resolved, and the boundaries change as the user types.",
    k: ["Parse injected regions as separate documents vs. in one pass: separate documents reuse each language's parser and caches, but need position translation back to the file.", "Detect the language from tags vs. configuration: tags are automatic and match the file, while configuration is predictable but incomplete."],
    p: ["Unclosed host constructs make the injected region run to the end of the file, so unrelated text takes the wrong language.", "Comment toggling uses the host language's comment style inside an injected region."],
    v: "Open a markup file with script, style and nested template regions. Each region colors according to its language, commenting a line inside it uses that language's syntax, and editing the opening tag recolors the region."
    ,
    dep: ["incremental-parser","grammar-tokenizer","language-configuration"]
  },
  "highlight-state-cache": {
    s: "Stores per-line tokenizer state and computed tokens, so highlighting a visible line or resuming after an edit does not repeat work for the lines before it.",
    d: "For each line, the cache keeps the tokenizer's end state and the resulting tokens. After an edit, entries from the changed line onward are marked stale and are recomputed lazily, first for visible lines, then in idle time. When a recomputed end state equals the old one, later lines are known to be valid and work stops. Parser-based highlighting keeps the tree and queries over ranges instead. It is hard because the cache must be invalidated by every edit and kept small for large files.",
    k: ["Cache tokens for all lines vs. only near the viewport: caching all makes returning to a region instant, but costs memory for large files.", "Stale colors while recomputing vs. block until accurate: showing old colors keeps typing fast, but flashes wrong colors briefly."],
    p: ["Missing invalidation after a multi-line edit leaves stale tokens that no longer match the text.", "Highlighting the whole file in the background on open burns the CPU for text the user may never view."],
    v: "Edit near the top of a ten-thousand-line file and measure the lines retokenized. Only changed lines and lines until the state converges are recomputed, and visible lines always show correct colors within a frame."
    ,
    dep: ["change-deltas","grammar-tokenizer","incremental-parser"]
  },
  "language-configuration": {
    s: "Declarative per-language settings: comment markers, bracket pairs, indentation rules, word patterns and file associations, which the editor uses for many features.",
    d: "A language entry lists file names and extensions that select it, line and block comment tokens, bracket and quote pairs, auto-closing rules, indentation patterns that say which lines increase or decrease indent, word definition for double-click and word movement, and folding markers. These are read by editing commands, bracket matching and auto-indent, and can come from extensions. It is hard because the same file may need different configuration inside an embedded region, and detection of the language from content is ambiguous.",
    k: ["Data-driven configuration vs. code per language: data is easy for extensions to supply, but cannot express unusual syntax rules.", "Detect language by extension only vs. also content: extensions are predictable, while content sniffing handles scripts without extensions but can misidentify."],
    p: ["An indentation pattern that is too eager re-indents lines the user placed deliberately.", "A wrong file association silently turns off all language features for a file."],
    v: "Open files of several languages and an extensionless script. The language chosen matches expectation, toggling comments uses the right markers, and auto-close and word selection follow that language's rules."
    ,
    dep: []
  },
  "folding": {
    s: "Lets users collapse regions of code into a single line, with regions derived from syntax, indentation or explicit markers, and remembers which are collapsed.",
    d: "Fold ranges come from the syntax tree, from indentation levels, from marker comments, or from a language server. Collapsing hides lines from layout, so the line height map and viewport skip them, and a placeholder marks the fold. Cursors and selections inside a fold must be handled: moving into one usually unfolds it. Fold state is stored by anchors so it survives edits, and restored on reopen. It is hard because edits inside or at the edges of folds change the ranges.",
    k: ["Syntax-based folds vs. indentation-based: syntax gives accurate regions, while indentation works in any language including broken code.", "Auto-unfold on search and cursor entry vs. keep collapsed: unfolding keeps the user from editing invisible text, but undoes the user's organization."],
    p: ["Fold state stored as line numbers drifts after edits above, so the wrong block is collapsed on reopen.", "Search results inside a fold are counted but invisible unless the fold opens."],
    v: "Collapse three nested blocks, edit above them, and check that the same blocks stay collapsed. Reopen the file and confirm they come back, and search for a hit inside a fold and see it unfold."
    ,
    dep: ["anchors-and-markers","line-height-map","incremental-parser"]
  },
  "structural-selection": {
    s: "Commands that expand or shrink the selection by syntax units, from a word to an expression, statement, block and so on, using the syntax tree.",
    d: "Given the current selection, the command finds the smallest tree node strictly containing it and selects that, keeping a history so shrinking returns to previous selections. Related commands move or swap nodes, select siblings, or jump to the enclosing block. Without a tree it falls back to brackets, indentation or paragraphs. It is hard because the tree must be current and reasonably accurate in broken code, and because multi-cursor selections each need their own expansion that may collide.",
    k: ["Syntax tree nodes vs. text heuristics: nodes are exact for valid code, while heuristics work everywhere but give uneven steps.", "Keep an expansion history vs. recompute on shrink: history gives exact reversal, but is lost when the user edits or moves."],
    p: ["Expansion in a file with parse errors jumps to the whole file because the nearest node is an error node.", "Two cursors expanding to the same node merge into one selection unexpectedly."],
    v: "In a function body, trigger expand repeatedly and record selections: token, expression, statement, block, function. Trigger shrink the same number of times and get the original selection back."
    ,
    dep: ["incremental-parser","multi-selection","language-configuration"]
  },
  "sticky-scroll-and-guides": {
    s: "Aids that show structure at a glance: scope headers pinned at the top of the view while scrolling, plus vertical lines at each indent level and highlighted bracket pairs.",
    d: "Sticky headers show the enclosing function, class or block lines above the first visible line, found from the syntax tree or indentation. Guides draw a line at each indent level and emphasize the one containing the cursor. Both are computed from the visible range and layout, and drawn as overlays. They shift the viewport's effective top, so cursor reveal and click mapping must account for the pinned rows. It is hard because pinned rows change as scrolling proceeds and can take a lot of vertical space.",
    k: ["Syntax-derived scopes vs. indentation-derived: syntax is correct in odd formatting, while indentation works with no parser.", "Limit pinned rows vs. show full chain: a limit protects text space, while the full chain gives complete context."],
    p: ["Clicking a pinned header does not scroll to its line when the hit test ignores the overlay.", "Guides computed from tabs and spaces with different widths draw at the wrong columns."],
    v: "Scroll through a long nested function and check that the pinned headers always name the enclosing scopes of the first visible line, and clicking a header jumps to that declaration."
    ,
    dep: ["incremental-parser","line-height-map","overlay-layers"]
  }
});
