// Details for the text shaping plate, part 1: text interface and segmentation.
ATLAS.details("text-shaping", {
  "styled-text-runs": {
    s: "The input model: a string plus attribute spans such as font, size, weight, color, language and decoration, which every later stage reads to decide how each part of the text is processed.",
    d: "Callers supply plain text and ranges carrying attributes, either as a flat list of runs or as a tree inherited from a document structure. The model must keep offsets stable under edits, so inserting a character does not shift attributes onto the wrong text. Offsets are counted in code units, code points or grapheme clusters depending on the caller, and the layer converts between them. The hard part is that attributes change at arbitrary points, including in the middle of a word or a ligature, which forces later stages to split or merge runs.",
    k: ["Flat attribute spans versus an inherited tree: spans are simple to hand to layout, but a tree preserves intent and makes style changes cheaper to apply.", "Offsets in code units versus grapheme clusters: code units are fast and match storage, but clusters match what users select and delete."],
    p: ["An attribute boundary inside a ligature or combining sequence silently breaks shaping unless the layer splits the run deliberately.", "Edits that do not shift span offsets leave color or language on the wrong characters."],
    v: "Insert a character at the start of a paragraph with a colored span in the middle, then confirm the span still covers exactly the same word after layout, in both left-to-right and right-to-left text.",
    dep: []
  },
  "style-resolution": {
    s: "Computes the final font, size, features and spacing for each run from inherited, default and explicit values, so every later stage works with concrete numbers.",
    d: "Style values arrive as keywords, relative units, percentages and unset values. Resolution walks the inheritance chain, converts units using the current font size and display scale, picks the requested font family list, and merges feature and variation settings. It also decides the effective language, which controls fallback, hyphenation and locale-specific glyph forms. The difficulty is that some properties depend on font metrics, such as units relative to character width, so resolution must call into font selection before layout can start.",
    k: ["Resolving once per run versus lazily per query: eager resolution gives later stages plain numbers, but lazy resolution avoids work for text that is never displayed.", "Absolute pixel sizes versus resolution-independent units: pixels are predictable, while relative units keep layout correct when the scale changes."],
    p: ["Relative units resolved against the wrong ancestor size make nested text drift larger or smaller without any visible rule.", "A default language left unset produces the wrong glyph forms for shared ideographic characters."],
    v: "Set a language tag on a paragraph of shared ideographic characters and confirm the chosen font and glyph forms change to match that language, while an untagged paragraph uses the system default.",
    dep: ["styled-text-runs"]
  },
  "text-measurement": {
    s: "Reports the width, height and line count of a string under given constraints without drawing it, so callers can size containers before the text is shown.",
    d: "Measurement runs the same itemization, shaping and line breaking as drawing, then returns extents rather than pixels. Callers ask for the natural width, the minimum width before a word overflows, or the height at a fixed width. Intrinsic sizing queries can force several layout passes with different constraints. The challenge is cost and agreement: measuring is called far more often than drawing, so it relies heavily on caches, and its results must match what drawing later produces or text will clip or leave gaps.",
    k: ["Measuring with the full layout pipeline versus an approximation: the full pipeline is exact, but an estimate from average glyph width is far cheaper and sometimes wrong.", "Caching measurements per string and style versus recomputing: caching saves shaping, but invalidation must track every input including font fallback state."],
    p: ["A measurement made before a fallback font finishes loading disagrees with the later drawn size, causing a visible jump.", "Measuring with rounded advances while drawing with fractional ones makes the last word wrap unexpectedly."],
    v: "Measure a paragraph at a given width, draw it into a box of exactly that size, and confirm no line is clipped and the drawn height equals the reported height to within one device pixel.",
    dep: ["shaper-driver", "line-box-assembly", "shape-result-cache"]
  },
  "text-drawing-calls": {
    s: "The API that takes shaped, positioned text and issues glyph draws to a surface, with color, transforms, clipping, decoration and optional effects such as shadows.",
    d: "Drawing accepts a laid-out paragraph or a single run with a position and transform. It translates glyph positions into device space, looks up each glyph in the cache, and emits quads or path fills in batches. Decorations such as underlines and strikethrough are drawn from font metrics, skipping descenders when asked. Selection highlights and caret rectangles are drawn from the same geometry. The hard part is keeping crisp text when transforms are non-integer, rotated or animated, since glyph caches are valid only for one size and orientation.",
    k: ["Drawing glyphs from bitmaps versus drawing outlines as paths: bitmaps are fast and crisp at one size, while paths scale and rotate freely but cost more per frame.", "Snapping the baseline to whole pixels versus keeping it fractional: snapping keeps horizontal text sharp, but animated text visibly steps."],
    p: ["Scaling a cached bitmap glyph during an animation blurs the text or makes it shimmer between frames.", "Underlines computed from the wrong font in a fallback run sit at inconsistent heights across a line."],
    v: "Draw a paragraph at several sizes and a small rotation, then inspect the output image at pixel level and confirm glyph edges are clean, baselines are level and underlines are continuous across font changes.",
    dep: ["glyph-cache-keys", "glyph-quad-batching", "compositing-handoff"]
  },
  "hit-testing": {
    s: "Maps a point on screen to a character offset and an offset back to a caret position, accounting for ligatures, combining marks and mixed-direction text.",
    d: "Given a point, hit testing finds the line, then the run, then the glyph, and finally the character boundary nearest the point. Ligatures contain several characters, so the glyph's advance is divided into equal parts or taken from ligature caret data. In bidirectional text one logical offset can map to two visual positions, so the API returns a leading and trailing edge. The difficulty is that logical order and visual order differ, and clusters are indivisible: placing a caret inside a cluster is wrong.",
    k: ["Equal division of a ligature's width versus font-supplied caret positions: equal division always works, but font data matches the designer's intent.", "A single caret position versus separate leading and trailing carets: one is simpler, but two are required at direction changes."],
    p: ["A click in the right half of a combining sequence lands the caret between a base and its mark.", "At a direction boundary the caret jumps to the far end of the opposite-direction run."],
    v: "Click at each pixel across a line mixing English and Hebrew with a ligature, record the returned offsets, and confirm they are monotonic within each direction run and never split a grapheme cluster.",
    dep: ["cluster-mapping", "bidi-reordering", "ligature-carets", "line-box-assembly"]
  },
  "selection-geometry": {
    s: "Turns a range of characters into the set of rectangles that cover it on screen, which highlight rendering, drag handles and find-in-page overlays all depend on.",
    d: "A logical range may be visually discontiguous in bidirectional text, so the result is a list of rectangles, one per run segment per line. Each rectangle's edges come from the same cluster and caret data used for hit testing. The tool also reports the line boxes touched, for scrolling a range into view. The hard part is consistency: a selection that spans a justified line, a ligature or a vertical line has to follow exactly the glyph positions that were drawn, or highlights will not line up with the text.",
    k: ["Rectangles per line segment versus one bounding box: segments match the text exactly, while a single box is trivial but misleading in mixed-direction text.", "Highlight height from line box versus from glyph extents: line boxes give a continuous band, while glyph extents look ragged between lines."],
    p: ["A range ending inside a ligature highlights the whole ligature or none of it, surprising users.", "Rectangles computed before justification is applied no longer cover the stretched glyph positions."],
    v: "Select a range crossing a line break and a direction change, and confirm the returned rectangles exactly tile the selected glyphs, with no gaps inside a run and no overlap between rectangles.",
    dep: ["hit-testing", "line-box-assembly", "bidi-reordering"]
  },
  "input-method-integration": {
    s: "Connects the text layer to composition input, reporting where the caret and composing text are, so candidate windows appear in the right place and uncommitted text is styled correctly.",
    d: "Languages typed through phonetic or stroke input produce provisional text that is replaced as the user chooses candidates. The text layer must show the composing range with distinct styling, report the caret and range rectangles from selection geometry, and accept replacements at arbitrary offsets. It also supplies surrounding text so the input service can predict. The challenge is that composition runs through layout like any text but can change on every keystroke, so incremental relayout and stable offsets matter for responsiveness.",
    k: ["Handling composition inside the layout engine versus in a separate overlay: inside gives correct line breaking, but an overlay is easier to isolate and cannot reflow text.", "Reporting full surrounding text versus a window: full text improves prediction, but large documents make each query expensive."],
    p: ["A candidate window placed from stale geometry covers the text being composed.", "Replacing composing text through code-unit offsets splits a surrogate pair and leaves invalid text."],
    v: "Compose a multi-syllable word with an input method in a wrapped paragraph and confirm the candidate window anchors to the composing range on each keystroke, including after the line wraps.",
    dep: ["selection-geometry", "styled-text-runs"]
  },
  "baselines-and-metrics": {
    s: "Defines ascent, descent, line gap and alignment baselines for each font and line, so mixed fonts and scripts align and line heights are predictable.",
    d: "Fonts publish several vertical metric sets, and tools disagree about which to trust, so the layer chooses one deterministically. Lines combine the metrics of every run on them, plus half-leading from the line-height rule, to give a line box. Different scripts use different alignment baselines: alphabetic, ideographic centered and hanging. Mixed text aligns runs to a dominant baseline and shifts others. The hard part is that metrics from different fonts do not agree, so a fallback font with a larger ascent makes a line taller than expected.",
    k: ["Using font-reported metrics versus fixed ratios: reported metrics honor the design, while ratios give stable line heights regardless of fallback.", "Dominant baseline from the first font versus the paragraph style: the style is stable, but first-font alignment adapts to the content."],
    p: ["Fallback glyphs with larger ascent push line height up for only the lines that contain them, making uneven spacing.", "Vertical metrics read from the wrong table clip the tops of accented capitals."],
    v: "Lay out a line mixing a Latin font, a fallback ideographic font and an inline symbol, and confirm all baselines align as specified and the line box height equals the maximum of the contributing metrics.",
    dep: ["horizontal-metrics", "style-resolution"]
  },
  "accessible-text": {
    s: "Exposes the text, its structure and its on-screen geometry to assistive technology, so readers, magnifiers and switch controls can follow the same text users see.",
    d: "The accessibility tree needs the plain text, the style attributes that matter, the line and word boundaries and the bounding rectangle for any character range. It also needs to tell the assistive tool what changed, for example caret moves and edits. Word and sentence boundaries use the same segmentation rules as selection. The challenge is keeping this view in sync: text that is truncated, shaped through ligatures or generated by fallback must still report the original characters, with geometry derived from selection rectangles.",
    k: ["Exposing original characters versus displayed glyphs: original characters keep speech accurate, but geometry then requires cluster mapping back to glyphs.", "Pushing change events versus answering queries on demand: events keep tools current, while on-demand queries avoid work when nothing is listening."],
    p: ["Truncated text with an ellipsis exposes the ellipsis rather than the full string, so a screen reader announces less than is available.", "Geometry reported before layout finishes places a magnifier focus box in the wrong place."],
    v: "Query the accessibility tree for a wrapped paragraph and confirm the full text, each line's bounds and the rectangle for a chosen word match the drawn pixels, then edit and confirm a change event arrives.",
    dep: ["selection-geometry", "grapheme-clusters", "overflow-and-ellipsis"]
  },
  "unicode-normalization": {
    s: "Rewrites text into a canonical form, composing or decomposing characters, so equivalent sequences are processed and matched the same way and fonts see the sequences they expect.",
    d: "The same visible character can be stored as one precomposed code point or as a base plus combining marks. Normalization rewrites text to a single form and orders combining marks by their combining class. Shaping often wants decomposed or composed forms depending on what the font covers, and some shapers normalize internally, compose where the font has the glyph and decompose where it does not. The difficulty is that normalizing the whole text changes offsets and breaks the mapping back to the original characters, so it is done on runs with an index map.",
    k: ["Normalizing the stored text versus only inside the shaper: storage normalization keeps everything consistent, but shaper-local normalization preserves the author's exact characters.", "Preferring composed versus decomposed forms: composed forms need one glyph, while decomposed forms work for fonts that lack precomposed shapes."],
    p: ["Normalization that drops the offset map breaks cursor positions and selection after shaping.", "Reordering marks by class changes the meaning of sequences in a few scripts if applied blindly."],
    v: "Shape the same letter once as one code point and once as a base plus combining mark and confirm both produce identical glyphs and widths, while cursor offsets still count the original characters.",
    dep: ["unicode-data-tables"]
  },
  "grapheme-clusters": {
    s: "Groups code points into the units users perceive as single characters, such as a base letter with marks, a syllable in some scripts or an emoji sequence, for caret, deletion and selection.",
    d: "Cluster boundaries come from a rule set using each code point's property, covering combining marks, joiners, regional indicators, prepended marks and Hangul syllable parts. Editing moves the caret by clusters, and shaping keeps a cluster in one run. Some boundaries depend on the script and need extended rules or tailoring. The hard part is that the rules are versioned with the character database, so a newly added emoji sequence is split by software with old data, and what counts as one character differs between the layers.",
    k: ["Default cluster rules versus script-tailored rules: defaults are uniform, while tailoring matches users of scripts whose natural unit is larger.", "Segmenting at input time versus on demand: precomputed boundaries make editing quick, but they must be recomputed after each edit."],
    p: ["Old data splits a newer emoji sequence, so backspace deletes half of a flag or a family.", "Counting code points for a length limit cuts a cluster in half and leaves a dangling joiner."],
    v: "Step the caret across strings containing flags, family emoji, stacked combining marks and Hangul jamo, and confirm each press moves over exactly one user-perceived character and never lands inside one.",
    dep: ["unicode-data-tables"]
  },
  "script-itemization": {
    s: "Splits text into runs by writing system, resolving common characters like punctuation and digits to a neighboring script, so the right shaping rules and fonts apply.",
    d: "Each code point carries a script property, but spaces, digits and punctuation are common to many scripts and take the script of the surrounding text. Some characters are listed as being used in several scripts, and the extension data gives that set. The itemizer scans the text, assigns runs, and handles paired punctuation so a bracket matches the script of its content. The challenge is stability: a one-character edit can change the script of the neighbors, which changes shaping and fonts for text nowhere near the edit.",
    k: ["Inheriting script from the previous run versus the following: previous is simple and streaming, but trailing punctuation then takes the wrong script.", "Using script extension data versus the single script property: extensions are more accurate for shared marks, but add lookup cost."],
    p: ["A digit at the start of a paragraph takes no script and defaults to the wrong shaper.", "Mismatched brackets in mixed scripts take different scripts, so they render in different fonts."],
    v: "Itemize a line of Latin text, Arabic text, digits and brackets, and confirm the digits and brackets join the script of their neighbors and the run boundaries fall only where the writing system changes.",
    dep: ["unicode-data-tables"]
  },
  "bidi-resolution": {
    s: "Assigns an embedding level to every character in a paragraph using the standard bidirectional algorithm, deciding which parts are left-to-right and which are right-to-left.",
    d: "Each character has a bidirectional class: strong left, strong right, number, separator and neutral. The algorithm sets the paragraph level from the first strong character or a given direction, then resolves weak types such as numbers, resolves neutrals from the surrounding strong text, and applies explicit embeddings and isolates. The output is a level per character. The difficulty is the sheer number of special cases: numbers next to punctuation, nested quotes and brackets, and explicit controls that users and generated content insert.",
    k: ["Detecting paragraph direction automatically versus taking it from style: detection suits user content, but explicit direction is predictable for interface strings.", "Isolates versus legacy embeddings: isolates keep their content from affecting neighbors, but older text uses embeddings with leakier behavior."],
    p: ["An English product name inside Arabic text takes the wrong direction for a trailing punctuation mark.", "Unbalanced explicit controls from pasted text change direction for the rest of the paragraph."],
    v: "Run the published conformance test strings through the resolver and confirm every level array matches the reference output exactly, including numbers adjacent to punctuation and nested isolates.",
    dep: ["unicode-data-tables", "script-itemization"]
  },
  "bidi-reordering": {
    s: "Rearranges the characters or runs of each line from logical order into visual order using the resolved levels, so right-to-left text reads correctly alongside left-to-right text.",
    d: "After line breaking, reordering reverses runs at each level from the highest down, producing the left-to-right visual order. Trailing whitespace is positioned at the paragraph end, not inside the reversed run. Reordering happens per line, so the same paragraph can be ordered differently depending on where it wraps. Shaping runs the other way, in logical order per run, and then runs are placed visually. The challenge is keeping a mapping from visual positions back to logical offsets for caret movement and selection.",
    k: ["Reordering runs after shaping versus reordering characters before: runs preserve shaping context within a script, while character reordering would break joined letters.", "Computing order per line versus per paragraph: per line is correct under wrapping, but it must be redone each time line widths change."],
    p: ["Reordering before line breaking places a wrapped continuation on the wrong side of the line.", "Trailing spaces included in the reversed run push the text away from the margin."],
    v: "Wrap a mixed English and Arabic paragraph at three widths and confirm each line reads correctly in visual order, with trailing spaces at the paragraph end and caret movement following visual positions.",
    dep: ["bidi-resolution", "line-box-assembly"]
  },
  "mirroring-and-isolates": {
    s: "Replaces paired characters such as brackets with their mirror image in right-to-left runs and handles isolate controls, so punctuation points the correct way.",
    d: "Characters with the mirrored property are drawn as their mirror form when their resolved level is right-to-left, either by substituting the mirror code point or by asking the font for a mirrored glyph form through a feature. Isolates and embedding controls change levels without drawing anything and must not appear as visible glyphs or alter spacing. The bracket pairing rule matches brackets by type to decide direction. The hard part is fonts that lack mirror forms for symbols, and controls that must stay invisible yet occupy a character offset.",
    k: ["Substituting mirror code points versus using glyph forms from the font: substitution works with any font, while font forms keep designer-matched shapes.", "Treating control characters as zero-width glyphs versus removing them: zero-width glyphs keep offsets aligned, but removal is simpler to draw."],
    p: ["A missing mirror glyph leaves an opening bracket facing outward in right-to-left text.", "Control characters rendered as visible boxes by a fallback font show in the middle of a sentence."],
    v: "Render a parenthesized phrase inside right-to-left text and confirm each bracket faces inward, while embedded control characters produce no visible mark and no extra width.",
    dep: ["bidi-resolution", "character-to-glyph-mapping"]
  },
  "shaping-run-builder": {
    s: "Combines script, direction, font, language and style boundaries into the final list of runs, each of which can be handed to the shaper as one unit.",
    d: "A run ends wherever any attribute that affects shaping changes: script, bidirectional level, resolved font, language, size or feature settings. The builder merges adjacent runs that agree, to give the shaper as much context as possible, because contextual rules cannot see across a boundary. It also splits runs at style changes that do not affect shaping but affect painting, such as color, while keeping shaping context. The hard part is balance: too many boundaries break ligatures and kerning, and too few paint the wrong color.",
    k: ["Splitting runs on every style change versus shaping across color changes: splitting is simple, while shaping across keeps ligatures and kerning intact through a color change.", "Run length caps for huge text versus unbounded runs: caps limit memory and latency, but may cut context at the cap."],
    p: ["A color change in the middle of a word breaks kerning or a ligature and shows a visible gap.", "A language tag that changes at each punctuation mark produces many tiny runs and slows layout."],
    v: "Build runs for a word where only the last letter is colored, shape with and without the split, and confirm glyph positions are identical while the painted colors differ at the correct glyph.",
    dep: ["script-itemization", "bidi-resolution", "per-character-fallback"]
  },
});
