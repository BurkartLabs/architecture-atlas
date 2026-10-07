// Details for the text shaping plate, part 2: line breaking and the shaping engine.
ATLAS.details("text-shaping", {
  "break-opportunities": {
    s: "Marks the positions in a string where a line may legally break, using per-character break classes and script-specific rules, before any widths are considered.",
    d: "Each character has a line break class, such as space, hyphen, opening punctuation or ideograph, and a rule table says which class pairs allow or forbid a break between them. The result is a mandatory, allowed or forbidden mark for every gap. Style can tighten or loosen this, for example by forbidding breaks inside words or allowing a break anywhere. Computation is linear and cacheable per paragraph. The hard part is that rules are tailored per language: some scripts break anywhere between characters, and quotation, number and punctuation rules vary by locale.",
    k: ["Standard rules versus locale-tailored rules: the standard set is uniform, but tailoring avoids breaks that look wrong to native readers.", "Computing opportunities once per paragraph versus per line: once is cheap and shared, but style changes during layout can invalidate it."],
    p: ["Treating a non-breaking space or a joiner as breakable splits product names and numbers across lines.", "Stale rule data allows breaks inside newly added punctuation sequences."],
    v: "Run the published line break test cases through the function and confirm every mark matches the reference, then break a paragraph containing numbers, quotes and URLs and check no forbidden position is used.",
    dep: ["unicode-data-tables", "grapheme-clusters"]
  },
  "dictionary-segmentation": {
    s: "Finds word boundaries in scripts written without spaces, using a dictionary or statistical model, so lines can break between words and word selection works.",
    d: "Several scripts do not separate words with spaces, so break opportunities between words cannot come from character classes alone. A segmenter matches against a dictionary with longest-match or cost-based search, sometimes with a learned model for unknown words. The output adds break opportunities and word boundaries for double-click selection and search. The challenge is accuracy and cost: dictionaries are large, results are language-dependent and ambiguous, and segmentation must run on every paragraph yet stay fast enough to run on edit.",
    k: ["Dictionary matching versus a learned model: a dictionary is predictable and small to ship, while a model handles unknown words but costs memory and time.", "Falling back to per-character breaks versus segmentation: per-character is cheap and always legal, but it splits words and looks wrong."],
    p: ["A missing dictionary for a language silently falls back to breaking between every character.", "Proper names absent from the dictionary are split in the middle, so selection by word highlights fragments."],
    v: "Segment a set of sentences with known word boundaries and confirm the line breaks land only on those boundaries, and a double-click selects exactly one word, for each supported language.",
    dep: ["break-opportunities", "unicode-data-tables"]
  },
  "greedy-line-breaker": {
    s: "Fills each line with as many words as fit, then starts a new line, using shaped widths; the simple, fast strategy used by almost all interactive text.",
    d: "Starting at the paragraph start, the breaker accumulates the advance of each unbreakable segment and breaks before the first one that would overflow, at the last allowed opportunity. It handles forced breaks, collapsible spaces at line ends and a word wider than the line, which is broken at character level as a last resort. It runs in linear time and can resume mid-paragraph after an edit. The hard part is correct widths: they must come from shaped runs, since a break can change shaping at the line end through contextual forms.",
    k: ["Greedy versus global optimization: greedy is fast and incremental, but leaves ragged lines and rivers that an optimizer would avoid.", "Breaking overlong words by character versus overflowing: breaking keeps content visible, while overflow preserves the word but can be clipped."],
    p: ["Using unshaped widths to decide breaks causes lines to overflow once kerning and ligatures are applied.", "Trailing spaces counted against the line width wrap a line that visually fits."],
    v: "Lay out a long paragraph at many widths and confirm no line exceeds its width except unbreakable words, and each line break coincides with an allowed opportunity.",
    dep: ["break-opportunities", "shaper-driver", "whitespace-and-tabs"]
  },
  "optimal-paragraph-breaking": {
    s: "Chooses all breaks in a paragraph together by minimizing a cost over the whole text, giving more even spacing than line-by-line filling at the price of more computation.",
    d: "The algorithm treats the paragraph as boxes, stretchable glue and penalties, and searches for the break sequence with the lowest total badness, where badness grows with how much each line has to stretch or shrink. A dynamic program keeps candidate paths. Penalties discourage hyphens and orphans. The result changes as a whole when any word changes. The challenge is cost and interactivity: the search is more expensive than greedy filling, and a small edit may reflow the entire paragraph.",
    k: ["Whole-paragraph optimization versus greedy filling: optimization yields even gray color, but costs more and makes edits reflow distant lines.", "Strict versus flexible tolerance: strict tolerance avoids loose lines, but may fail and force a fallback pass with hyphenation."],
    p: ["Reflowing an entire paragraph on each keystroke makes typing visibly laggy in long paragraphs.", "Without a fallback pass a narrow measure has no feasible solution and the layout fails."],
    v: "Lay out the same paragraph with both strategies at a fixed width and compare the variance of line fill; the optimal result should show lower variance and the same words in order.",
    dep: ["break-opportunities", "hyphenation", "justification"]
  },
  "hyphenation": {
    s: "Finds permitted word-internal break points using language patterns or a dictionary, and draws a hyphen or equivalent mark when a line breaks there.",
    d: "Hyphenation patterns assign weights to positions in a word, and the highest odd weights mark break points, with exceptions for special words. Style controls the minimum word length, the minimum characters before and after a break and the limit on consecutive hyphenated lines. Soft hyphen characters give authors manual points. When a break is taken, a hyphen glyph is added at the line end, and in some languages spelling changes at the break. The challenge is language coverage and the shaping change when the hyphen is added.",
    k: ["Pattern-based versus dictionary hyphenation: patterns are compact and handle unseen words, while a dictionary is exact but large and incomplete.", "Automatic versus author-controlled hyphenation: automatic reduces gaps in narrow columns, but authors lose control over how names and terms break."],
    p: ["Applying English patterns to text with the wrong language tag produces nonsense breaks.", "Adding the hyphen after measuring the line makes the line overflow by one glyph."],
    v: "Lay out narrow-column text in two languages with their language tags and confirm breaks fall only at pattern-permitted points, the hyphen is drawn, and no line exceeds the column width.",
    dep: ["break-opportunities", "unicode-data-tables"]
  },
  "justification": {
    s: "Adjusts spacing in each line so both edges align, by stretching spaces, adding letter spacing or elongating letters, depending on what the script allows.",
    d: "A justified line distributes the leftover space across opportunities. In spaced scripts the space glyphs stretch first, with limits, and small letter-spacing changes follow. Some cursive scripts extend connecting strokes instead using elongation glyphs or kashida insertion. Ideographic text distributes space between characters. Justification changes glyph positions after shaping, so caret, selection and hit test data must use the final positions. The difficulty is doing it without rivers, without breaking ligature shaping, and with a different priority order per script.",
    k: ["Expanding spaces only versus spaces plus letter spacing: spaces-only preserves letterforms, but narrow lines need both to avoid huge gaps.", "Elongation versus uniform spacing in cursive scripts: elongation looks natural to readers, but depends on font support and careful selection of where to extend."],
    p: ["Letter spacing applied to a cursive script breaks the connections between letters.", "Justifying a last line or a line ended by a forced break stretches it absurdly."],
    v: "Justify a paragraph in a spaced script, an ideographic script and a cursive script, and confirm every non-final line's glyph extents equal the line width within one pixel and connected letters remain connected.",
    dep: ["greedy-line-breaker", "glyph-positioning", "whitespace-and-tabs"]
  },
  "whitespace-and-tabs": {
    s: "Applies the rules for spaces, tabs and newlines: which collapse, which are preserved, how tab stops are computed and how trailing spaces behave at line ends.",
    d: "Style selects whether runs of spaces collapse to one, whether newlines are preserved and whether lines wrap. Tabs advance to the next tab stop, defined by a width multiple or an explicit list, and the position depends on the line start, not the string. Trailing spaces at a wrap hang past the line edge or are removed. Spaces also carry widths that justification may change. The hard part is that collapsing changes character offsets, so an offset map back to the source is required for editing.",
    k: ["Collapsing at layout time versus at input: layout-time collapsing preserves the stored text, but requires a mapping for every offset query.", "Hanging trailing spaces versus removing them: hanging keeps selection and caret simple, but removal avoids spaces that extend the measured width."],
    p: ["Collapsing a space that sits between two styled runs leaves a style boundary with nothing inside it.", "Tab stops measured from the paragraph start rather than the line start misalign wrapped lines."],
    v: "Lay out text with repeated spaces, tabs and a wrap in the middle of a space run, and confirm collapsing, tab alignment and the caret offsets match the specified rules for each whitespace mode.",
    dep: ["styled-text-runs", "horizontal-metrics"]
  },
  "line-box-assembly": {
    s: "Builds each finished line: ordered runs, glyph positions, baseline, height and offsets, ready for drawing, hit testing and measurement.",
    d: "Once breaks are chosen, the assembler splits shaped runs at the breaks, reshapes the ends if needed, applies bidirectional reordering, places runs along the line with alignment, justification and indentation, and computes the line's ascent and descent from the fonts and styles used. It stacks lines into a block and records for each the logical range it covers. The result is the object that all queries use. The challenge is incremental update: changing one word should rebuild few lines, so the assembly must carry enough state to resume.",
    k: ["Rebuilding every line on change versus incremental reflow: full rebuild is simple, but incremental reflow keeps large documents responsive.", "Storing positions per glyph versus per run with advances: per glyph answers queries quickly, but uses more memory for long paragraphs."],
    p: ["Reshaping a line end after a break changes its width and wraps the line a second time.", "Alignment applied before reordering puts right-aligned text at the wrong edge."],
    v: "Edit one word in the middle of a hundred-line paragraph and confirm only the affected lines change, while the final result is identical to a full layout of the edited text.",
    dep: ["greedy-line-breaker", "bidi-reordering", "baselines-and-metrics", "shaper-driver"]
  },
  "overflow-and-ellipsis": {
    s: "Handles text that does not fit: clipping, fading, truncating at a line limit and inserting an ellipsis, in the right place for the reading direction.",
    d: "When a block has a fixed width or a maximum number of lines, the layer decides what to do with the excess. Truncation finds the last point where the text plus an ellipsis fits, shapes the ellipsis with the font of the surrounding text, and positions it at the correct edge for the direction. Multi-line truncation applies to the last allowed line. The ellipsis can be drawn in the middle of the text, for file names. The difficulty is that the ellipsis changes the width, and that truncation must not split a cluster.",
    k: ["Truncating at cluster boundaries versus glyph boundaries: clusters keep characters intact, while glyph boundaries can split a ligature or a mark from its base.", "Ellipsis at the end versus in the middle: the end is conventional, while the middle keeps the distinguishing end of long names."],
    p: ["An ellipsis drawn in a different font than the text looks mismatched in size and weight.", "Truncation in right-to-left text puts the ellipsis on the wrong side of the line."],
    v: "Truncate long strings in left-to-right and right-to-left scripts to a fixed width and confirm the result plus ellipsis fits, ends on a cluster boundary and shows the ellipsis on the reading-direction end.",
    dep: ["line-box-assembly", "grapheme-clusters"]
  },
  "vertical-text-layout": {
    s: "Lays out text in vertical lines running top to bottom, rotating or upright-orienting each character according to its script, with columns flowing right to left or left to right.",
    d: "Vertical writing sets the line direction downward, with lines progressing sideways. Ideographic characters stay upright while Latin letters and digits are usually rotated sideways or set upright in short runs. The orientation of each character comes from a property table. Fonts supply vertical metrics and alternate glyphs for punctuation, and the shaper applies vertical substitution features. The challenge is that every horizontal assumption, such as advance, baseline and caret direction, has to be generalized, including bidirectional mixing with sideways text.",
    k: ["Rotating glyphs in the rasterizer versus using font vertical glyphs: rotation works with any font, while font glyphs carry correct punctuation positions.", "Upright combined digits versus rotated digits: upright combined digits read better, but they apply only to short runs."],
    p: ["Punctuation without vertical alternates sits at the lower left of its cell instead of centered.", "Caret and selection code written for horizontal text draws rectangles of the wrong orientation."],
    v: "Lay out a vertical paragraph mixing ideographs, Latin words and digits, and confirm ideographs stand upright, Latin text is rotated consistently, punctuation uses vertical forms and selection rectangles are tall.",
    dep: ["glyph-substitution", "horizontal-metrics", "line-box-assembly", "script-itemization"]
  },
  "ruby-annotations": {
    s: "Places small annotation text above or beside base text, as used for pronunciation guides, aligning each annotation with its base and adjusting spacing so neighbors do not collide.",
    d: "A ruby pair holds base text and annotation text with an alignment rule: centered, spread across the base, or aligned to an edge. The annotation is shaped in a smaller size and positioned over the base using a style-defined side. If the annotation is wider than the base, adjacent text receives extra space or the annotation overhangs it. Line height grows to hold the annotation. The difficulty is line breaking: a pair must stay together or break at defined points, and annotations affect the line box, selection, and hit testing.",
    k: ["Annotation overhang versus widening the base: overhang keeps text compact, but needs space or collision checks with neighbors.", "Treating the pair as an atomic inline versus a breakable one: atomic is simple, but long pairs overflow narrow lines."],
    p: ["An overhanging annotation collides with punctuation or the next annotation.", "Selecting the base text without its annotation yields copied text that loses the pronunciation."],
    v: "Lay out a line of base characters with annotations of varying lengths and confirm each annotation is aligned to its base, none overlap, and the line height reserves space for them on every line that has one.",
    dep: ["line-box-assembly", "shaper-driver", "vertical-text-layout"]
  },
  "shaper-driver": {
    s: "The entry point of shaping: takes a run of text, a font and settings, orchestrates substitution and positioning, and returns glyph ids with advances, offsets and cluster indices.",
    d: "The driver normalizes the run for the font, maps characters to glyphs, chooses the shaper model for the script, builds the list of features, then runs substitution lookups followed by positioning lookups, and finally returns the glyph buffer. It also applies direction and run-level options such as letter spacing. Work is organized as a pipeline of passes over a glyph array that grows and shrinks. The challenge is correctness across fonts: rule tables are written by font authors, and the driver must interpret them exactly as other implementations do.",
    k: ["Shaping one run at a time versus whole paragraphs: runs give clean contexts, but each boundary loses contextual rules.", "Returning fixed-point versus floating-point positions: fixed-point guarantees the same results everywhere, but floating-point is simpler to scale."],
    p: ["Calling the shaper with the wrong direction or script reverses or unjoins a whole run.", "Features enabled by default in one engine but not another produce different text from the same font."],
    v: "Shape a reference string in a font with known tables and confirm glyph ids, advances and clusters match expected output from a second independent implementation.",
    dep: ["feature-selection", "glyph-substitution", "glyph-positioning", "character-to-glyph-mapping", "script-shaping-models"]
  },
  "feature-selection": {
    s: "Decides which optional font features are on for each range, combining script defaults, style properties and author settings into the final set the shaper applies.",
    d: "Fonts expose features such as standard ligatures, small capitals, fractions, tabular numbers and stylistic sets, each identified by a tag and a value. Some are required for a script and always on. Others are on by default or off until requested. Style properties translate to feature settings, and explicit settings override them. Ranges within a run can have different sets. The hard part is precedence and interaction: turning off letter spacing's ligature suppression, or enabling a set that conflicts with another, produces different glyphs depending on lookup order.",
    k: ["Script-default features versus explicit author control: defaults give correct text with no setup, while explicit control permits typographic choices at the cost of mistakes.", "Per-range features versus per-run: per-range is flexible, but forces more shaping boundaries."],
    p: ["Disabling a required feature for a complex script produces unreadable text.", "Letter spacing left on with ligatures enabled leaves ligature glyphs that ignore the spacing."],
    v: "Shape the same word with a feature on and off in a font that supports it and confirm the glyph sequence changes as expected, while required features cannot be turned off for a complex script.",
    dep: ["layout-tables", "style-resolution"]
  },
  "glyph-substitution": {
    s: "Applies the font's substitution rules: replacing one glyph with another, several with one, one with several, or choosing alternates in context, to form ligatures and contextual shapes.",
    d: "The font's substitution lookups are grouped by feature and run in a defined order on the glyph array. Types include single, multiple, alternate, ligature, contextual and chaining contextual substitutions, each matching against a glyph class or sequence with optional lookahead and backtrack. Lookup flags skip marks or ligature components. Each substitution updates cluster indices. The challenge is exact interpretation of the table semantics and performance, since a long chain of lookups on a long run can be slow and are applied on every shaped string.",
    k: ["Interpreting lookups directly versus compiling to a state machine: direct is simple and exact, while a compiled form is faster for large chains.", "Applying all lookups to the whole run versus tracking active ranges: whole-run is simple, but ranges avoid wasted work on short feature spans."],
    p: ["Ignoring lookup flags lets marks break a ligature match or be consumed by it.", "Chained contextual rules with deep nesting can make a single glyph run very slow."],
    v: "Shape sequences that should form ligatures, contextual forms and alternates in a test font and confirm the output glyph ids equal the expected ids, with cluster indices pointing at the originating characters.",
    dep: ["layout-tables", "feature-selection", "cluster-mapping"]
  },
  "glyph-positioning": {
    s: "Applies placement and advance adjustments to glyphs: pair kerning, mark offsets, cursive attachment and contextual adjustments, using the font's positioning tables.",
    d: "After substitution, positioning lookups adjust each glyph's x and y offset and advance. Types include single adjustments, pair adjustments, cursive attachment, mark-to-base, mark-to-ligature and mark-to-mark, and contextual variants. Values can be device-dependent corrections for small sizes, and variable fonts alter them by axis. The results are in font units scaled to the run size. The difficulty is ordering and accumulation: later lookups see earlier adjustments, and attachments chain across many glyphs, so errors are visible as floating accents.",
    k: ["Keeping unrounded positions versus rounding each glyph: unrounded positions preserve spacing, but rounding aligns to pixels for crisp small text.", "Applying positioning in font units then scaling versus scaling first: font units avoid rounding drift but need a final conversion."],
    p: ["Rounding advances before attachment shifts marks relative to their bases by a pixel.", "Ignoring device adjustments in a font that relies on them gives uneven spacing at small sizes."],
    v: "Shape a string with kerned pairs, stacked marks and cursive joins, then render at a large size and confirm the pair spacing, mark placement and joins match the font's specification and a reference rendering.",
    dep: ["layout-tables", "kerning", "mark-attachment", "variation-deltas"]
  },
  "kerning": {
    s: "Adjusts spacing between specific glyph pairs so shapes fit together, such as a capital A next to a capital V, using the font's pair tables or class rules.",
    d: "Kerning values live in pair adjustment tables, either as explicit glyph pairs or as class-by-class matrices that reduce size. Older fonts use a separate legacy kerning table, which some fonts carry alone. The shaper applies the adjustment to the first glyph's advance. Kerning can be turned off, and letter spacing disables it in some styles. The challenge is both lookup speed, since pairs are checked for every adjacent glyph, and correct handling when glyphs between the pair are skipped by flags or replaced by substitution.",
    k: ["Class-based versus explicit pair kerning: classes are compact, but explicit pairs allow exact fixes for particular combinations.", "Using legacy kerning when layout tables are absent versus skipping: the legacy table keeps older fonts tidy, but adds a second code path."],
    p: ["Kerning computed before ligature substitution is applied to glyphs that no longer exist.", "Disabling kerning for letter-spaced text also disables the pair adjustments of attached marks."],
    v: "Render the pairs AV, To and Ty in a font with kerning at a large size with the feature on and off and confirm the on rendering has measurably tighter advances equal to the table values.",
    dep: ["layout-tables", "feature-selection"]
  },
  "mark-attachment": {
    s: "Positions combining marks, such as accents and vowel signs, relative to their base glyphs using anchor points defined in the font.",
    d: "Each base glyph carries named anchors, and each mark glyph carries an anchor that should coincide with one of them. Mark-to-base attaches a mark to a base, mark-to-ligature picks the component of a ligature, and mark-to-mark stacks a mark above another mark. Positioning uses these anchors to compute offsets, and in some scripts marks sit on either side of the base. The hard part is fonts without anchors, where the shaper falls back to zero-width marks centered by guesswork, and the interaction with reordering of marks before attachment.",
    k: ["Anchor-based attachment versus precomposed glyphs: anchors cover any combination, while precomposed glyphs are tuned by hand but exist only for common pairs.", "Zero-width fallback for marks versus refusing to draw them: a fallback keeps text visible, but placement is often visibly off."],
    p: ["Marks attached to the wrong ligature component land on the wrong letter.", "Reordering marks after attachment places their offsets relative to the old base."],
    v: "Render a base letter with two stacked marks and a ligature with a mark on its second component, and confirm each mark's anchor coincides with its target anchor within one font unit.",
    dep: ["glyph-positioning", "layout-tables", "ligature-carets"]
  },
  "script-shaping-models": {
    s: "Script-specific logic that prepares and orders text for scripts whose shaping cannot be expressed in font tables alone, such as cursive joining and scripts with reordering vowels.",
    d: "Some scripts need steps before the font's rules run: choosing the joining form of each letter from its neighbors, decomposing and reordering characters into a canonical order, tagging each glyph with the features that apply to it, and marking syllable boundaries. Each model is a state machine over character classes defined by the script's standard, with fonts relying on the model having run first. A default model covers simple scripts. The challenge is breadth: many models exist, all must agree with how fonts are made, and updates change behavior.",
    k: ["Built-in script models versus font-only shaping: built-in models make poorly authored fonts work, but are a large amount of code to maintain.", "Following the font specification strictly versus matching observed behavior of other engines: strictness is principled, but fonts are tested against particular engines."],
    p: ["Text shaped with a default model for a script that needs its own produces unjoined letters.", "A change to a model alters glyph order and breaks fonts tuned for the previous behavior."],
    v: "Shape test strings for each supported complex script and confirm joining forms, glyph order and feature tags match the expected output produced by a reference implementation for the same font.",
    dep: ["script-itemization", "feature-selection", "syllable-reordering", "unicode-data-tables"]
  },
  "syllable-reordering": {
    s: "Rearranges characters within a syllable into the order that shaping rules expect, for scripts where vowel signs or consonant parts display before or around the base.",
    d: "In several scripts, the typed order is not the display order: a vowel sign typed after a consonant appears before it, or on both sides, and some consonants stack below. The model finds syllable boundaries with a state machine, identifies the base consonant, and moves parts into positions, tagging glyphs with the features that apply to each. After substitution, further reordering places the final glyphs. Cluster data must still map back to the typed characters. The difficulty is the number of syllable patterns and keeping caret and deletion behavior sensible.",
    k: ["Reordering characters before shaping versus glyphs after: characters keep the model simple, but glyph reordering handles forms created by substitution.", "Deleting a whole syllable versus one character on backspace: whole-syllable deletion avoids invalid text, but users expect to correct a single mistyped vowel."],
    p: ["Misidentifying the base consonant moves a vowel to the wrong side of the syllable.", "Cluster indices lost during reordering make the caret jump to unexpected positions."],
    v: "Shape syllables with pre-base vowels, below-base consonants and two-part vowels and confirm the glyph order matches the expected sequence, then step the caret and confirm it visits sensible positions.",
    dep: ["script-shaping-models", "cluster-mapping", "glyph-substitution"]
  },
  "ligature-carets": {
    s: "Supplies caret positions inside a ligature, so users can place a cursor between the characters that make up a single joined glyph.",
    d: "A ligature glyph represents several characters, yet users expect to place a caret between them. Fonts can provide caret positions per ligature, as coordinates along the glyph. Without them, the layer divides the advance equally between the component characters. The positions are used for hit testing, selection rectangles and caret movement, and they must be reordered along with the glyph in right-to-left text. The hard part is that data is often missing or wrong, and equal division is a poor guess for uneven components.",
    k: ["Using font caret data versus equal division: font data matches the shapes, but equal division is available for every font.", "Moving the caret per character versus per ligature: per character matches the typed text, while per ligature is simpler and safe for some scripts."],
    p: ["Equal division places the caret visibly off for a ligature with an uneven split, such as a wide first part.", "Right-to-left ligatures use carets in logical rather than visual order, mirroring the movement."],
    v: "Step a caret through a word containing a ligature and a ligature with three components, and confirm each stop falls between component shapes, with positions equal to font data when present.",
    dep: ["layout-tables", "cluster-mapping"]
  },
  "cluster-mapping": {
    s: "Records which input characters produced each output glyph, so offsets can be converted between text and glyphs for caret, selection, search highlighting and styling.",
    d: "Every glyph carries a cluster value pointing at the first character of the group it came from. Many-to-one cases such as ligatures share a cluster, one-to-many cases like decomposed characters repeat it, and reordering makes the values non-monotonic. Consumers use the mapping to find the glyphs for a character range and the characters for a glyph. Cluster levels control whether adjacent marks merge into the base cluster. The challenge is that substitution and reordering both rewrite the mapping, and the rest of the pipeline relies on it being right.",
    k: ["Merging marks into the base cluster versus keeping them separate: merged clusters keep editing units whole, while separate clusters allow styling marks individually.", "Per-glyph cluster values versus separate run-level maps: per-glyph is exact and local, while maps cost memory but avoid mutating glyph data."],
    p: ["A substitution that drops cluster updates makes selection highlight the wrong glyphs after a ligature forms.", "Assuming clusters are monotonic fails in right-to-left and reordered text."],
    v: "Shape strings with ligatures, decomposed marks and reordered vowels, then for every character offset convert to glyphs and back and confirm the result covers the original range without gaps.",
    dep: ["glyph-substitution"]
  },
});
