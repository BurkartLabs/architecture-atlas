// Details for the graphics editor plate, part 6: text and canvas rendering.
ATLAS.details("graphics-editor", {
  "rich-text-model": {
    s: "How styled text is stored in a node: a string with runs of character attributes, paragraph attributes, lists and links, and its merge behavior under concurrent edits.",
    d: "Text content is a sequence of characters with spans carrying font, size, weight, color, decoration, letter spacing and links. Paragraphs carry alignment, indent, spacing and list type. Styles and variables can bind to spans. In multiplayer, concurrent typing in the same node needs character-level merging, unlike most properties which merge by whole value. Text nodes also define auto-sizing behavior: fixed, auto width or auto height. It is hard because attribute spans must adjust through inserts and deletes, and because pasting rich text from other sources brings attributes that have no counterpart.",
    k: ["Character-level merging for text vs whole-property replacement: character merging preserves simultaneous typing, but adds a second merge mechanism to the system.", "Spans with ranges vs per-character attributes: ranges are compact, per-character attributes are simpler to merge and slower to store."],
    p: ["Two users typing at the same position end up with interleaved characters because positions were converted to indices.", "Pasted text brings hidden attributes that change spacing and cannot be seen in the panel."],
    v: "Have two clients type different words into one text node at the same position while a third changes the font of the middle. Confirm all converge to one text with consistent runs, and no characters are lost.",
    dep: ["property-model", "merge-semantics", "node-types"]
  },
  "text-shaping": {
    s: "Converting a string and a font into positioned glyphs, applying ligatures, kerning, contextual forms, mark placement and script-specific rules, including right-to-left and joined scripts.",
    d: "Shaping takes runs of text with one script, language and direction, and applies the font's substitution and positioning tables to select glyphs and offsets. Bidirectional text is first reordered into visual runs. Complex scripts need reordering of syllables and contextual forms. Features such as small caps, ligatures and stylistic sets are enabled per span. Results are cached per run. It is hard because correctness depends on font data, on script knowledge and on the segmentation of runs, and because each editing change must reshape only what is needed.",
    k: ["A dedicated shaping engine bundled with the editor vs the platform's text services: bundled gives identical results everywhere, but increases size and needs updates.", "Caching shaped runs vs reshaping on each layout: caching is fast for large pages, but invalidation after edits and font changes is subtle."],
    p: ["Shaping across a run boundary breaks ligatures and joins in cursive scripts.", "Different shaping on two platforms moves line breaks and the design reflows on handoff."],
    v: "Shape sample text in Latin with ligatures, in Arabic and in a script with reordering, on two platforms. Confirm glyph sequences and positions are identical, and a reference shaper agrees on every glyph.",
    dep: ["font-management", "rich-text-model"]
  },
  "paragraph-layout": {
    s: "Breaking shaped text into lines inside a box and positioning them: wrapping, alignment, justification, hyphenation, line height, truncation and vertical alignment.",
    d: "The layout engine measures shaped runs, finds line break opportunities by Unicode rules, and chooses breaks greedily or by an optimal-fit algorithm. It applies alignment, justification (by adjusting spaces and sometimes letters), indentation and line spacing. Text may also be truncated with an ellipsis after a line limit. The resulting size feeds auto layout for hugging text. Text on a path and text in shapes need additional geometry. It is hard because layout must match across platforms and the web, and be fast enough to rerun on every keystroke for large blocks.",
    k: ["Greedy line breaking vs optimal-fit: greedy is fast and predictable, but leaves ragged results that optimal-fit improves at higher cost.", "Matching a target engine's line breaking vs a custom engine: matching makes handoff accurate, but ties the editor to that engine's quirks."],
    p: ["A fractional width difference between platforms moves one word to the next line, and the layout shifts.", "Relayout of a very long text node on each keystroke drops the frame rate."],
    v: "Lay out paragraphs in four widths, with and without justification, then compare line breaks against the target runtime's rendering. Confirm breaks and heights match, and typing in a 50,000 word node stays within budget.",
    dep: ["text-shaping", "rich-text-model", "auto-layout"]
  },
  "font-management": {
    s: "Finding, loading, caching and licensing fonts: installed fonts, cloud fonts, fonts embedded in documents, and a registry that maps a family and style to font data.",
    d: "A registry lists available fonts from the operating system, from a hosted catalog and from files the document carries. When a document needs a font, the manager resolves it by family, weight and style, loads it asynchronously, and reports what is missing so designers can substitute. Font data is parsed once and shared across text runs. Collaborators may not have the same fonts. It is hard because licensing restricts embedding and sharing, because font loading is asynchronous while layout is expected to be synchronous, and because the same family name can refer to different files.",
    k: ["Embedding fonts in documents vs referencing by name: embedding guarantees fidelity, but raises licensing and size issues; names are light and break across machines.", "Local fonts only vs a hosted catalog: hosted fonts are consistent for teams, but need network and a licensing arrangement."],
    p: ["A missing font silently falls back to a default and the whole design reflows, then is saved that way.", "Two installed fonts share a family name and the wrong one is loaded on a collaborator's machine."],
    v: "Open a document on a machine missing two of its fonts. Confirm the missing fonts are listed, text keeps its original run data while previewed with fallbacks, and installing a font restores layout without edits.",
    dep: ["binary-asset-store", "file-format"]
  },
  "font-fallback-and-variable-fonts": {
    s: "Choosing substitute fonts for characters a font lacks, and supporting fonts with continuous axes (weight, width, slant, optical size) as design parameters.",
    d: "When a character has no glyph in the chosen font, a fallback chain picks another font, per script and per character, preserving the style as best it can. Color glyphs and emoji need color font support. Variable fonts expose axes with ranges; the editor stores axis values on the span and offers sliders and named instances. Axis changes alter glyph widths and so layout. It is hard because fallback choices differ between platforms and affect line breaks, and because variable font features must also survive export and handoff.",
    k: ["Fixed fallback list per script vs per-platform system fallback: a fixed list is consistent everywhere, while system fallback covers more characters automatically.", "Storing axis values vs named instances: raw values allow any design, named instances are recognizable and easier to hand off."],
    p: ["A glyph missing from the primary font appears as an empty box in export, though the canvas showed a fallback.", "Variable axis values are dropped on export to a format that only supports named styles."],
    v: "Type text mixing Latin, Cyrillic, CJK and emoji in a font that covers only Latin, and adjust a weight axis. Confirm every character renders in both canvas and export, with identical fallback fonts and widths.",
    dep: ["font-management", "text-shaping", "vector-import-export"]
  },
  "in-canvas-text-editing": {
    s: "Typing directly on the canvas: caret and selection drawing, keyboard navigation, input method composition, spell checking and clipboard, tied to the text layout.",
    d: "Editing a text node opens an input surface, often a hidden native text element, that receives keyboard and input method events, while the editor draws caret and selection from layout results. Navigation by character, word and line needs grapheme and word boundary rules. Composition for languages such as Japanese shows provisional text with underlines until committed. Spell checking and autocorrect use platform services. All edits become commands that sync. It is hard because the visible text is rendered by the editor, not the platform, so accessibility, input method placement and selection must be mirrored manually.",
    k: ["A hidden native input vs a fully custom text engine: native input gets platform features such as spell check and input methods for free, but is fiddly to align with the canvas.", "Committing text edits per keystroke vs on exit: per keystroke is collaborative, but fills history; on exit is tidy but hides live changes."],
    p: ["The input method candidate window appears in the wrong place because the caret position was not reported.", "Selecting across a text run boundary splits grapheme clusters and breaks emoji or combined characters."],
    v: "Compose Japanese text, move by words in an Arabic paragraph and spell-correct a misspelling, all on the canvas. Confirm candidate popups sit at the caret, navigation respects boundaries, and each commit is one undo step.",
    dep: ["paragraph-layout", "rich-text-model", "command-system", "pointer-event-pipeline"]
  },
  "canvas-renderer": {
    s: "The system that draws the visible part of the document each frame: it walks the scene graph, culls what is offscreen, issues draw work for each node type and composites the result.",
    d: "The renderer takes the viewport and the scene graph, culls nodes outside the view or too small to see, and draws the rest in paint order, using cached tiles for static content. It dispatches to the vector rasterizer, the raster compositor, the text renderer and the effects renderer, and manages isolated groups with offscreen buffers. Most editors draw on the GPU for speed. It is hard because the same document must look identical across devices and export, and because frame time must stay stable as documents grow beyond what fits in memory.",
    k: ["Retained scene with caching vs immediate redraw each frame: retained is much faster on large documents, but invalidation bugs show as stale pixels.", "GPU rendering vs CPU rendering: GPU is fast but varies across drivers; CPU is exact and portable but slow on large views."],
    p: ["Culling by node bounds ignores shadows and strokes, and effects pop in at the edge of the screen.", "A driver bug renders gradients differently on one vendor's hardware and nobody notices until a customer reports it."],
    v: "Pan and zoom through a 100,000-node document on a mid-range laptop. Confirm 60 frames per second without tile pop-in, nothing is clipped at viewport edges, and screenshots match the CPU reference render within tolerance.",
    dep: ["scene-graph", "vector-rasterizer", "tile-cache", "dirty-rectangles", "level-of-detail"]
  },
  "vector-rasterizer": {
    s: "Converting paths with fills and strokes into pixels with coverage-based antialiasing, on the GPU or CPU, at any scale and for any fill rule.",
    d: "The rasterizer flattens curves to a tolerance, computes coverage per pixel, applies the fill rule, then applies the paint. Approaches include scanline coverage accumulation on the CPU, tessellation of paths into triangles with antialiasing at edges, and compute-shader or analytic-coverage methods that rasterize curves directly. Strokes are expanded to outlines or drawn by dedicated shaders. Gradients and patterns are applied per pixel. It is hard because tessellation of complex self-intersecting paths is fragile, because thin features need exact coverage, and because it must be fast for paths with millions of segments.",
    k: ["Tessellate to triangles vs rasterize curves analytically in a shader: tessellation uses simple hardware paths, but analytic methods scale better and stay sharp at extreme zoom.", "Multisampling vs exact coverage: multisampling is simple, exact coverage produces better edges and matches export."],
    p: ["Tessellating a self-intersecting path with a fill rule mismatch produces holes that exports do not have.", "Hairline strokes vanish at low zoom because coverage rounds to zero."],
    v: "Render test paths (thin lines, tight curves, self-intersections, millions of segments) at five zoom levels. Confirm coverage matches a high-precision reference, hairlines remain visible, and render time stays under the frame budget.",
    dep: ["bezier-geometry", "stroke-geometry", "gpu-resource-management", "paint-model"]
  },
  "tile-cache": {
    s: "Rendered tiles of the document kept at several zoom levels, reused across frames and invalidated only where content changed, so panning and zooming mostly copy pixels.",
    d: "The viewport is divided into tiles at the current level of detail. For each visible tile the cache returns a texture if present and fresh; otherwise it schedules a render and shows a lower-resolution stand-in. Tiles are keyed by position, zoom level and content version. Eviction removes least recently used tiles under a memory budget. Edits invalidate only tiles overlapping the changed region. It is hard because rendering a tile can be slow, so stale-while-revalidate behavior must hide gaps, and because effects like blur depend on content past tile borders.",
    k: ["Showing a blurry stand-in while rendering vs waiting for the tile: stand-ins keep motion smooth, but momentarily show wrong detail.", "Caching tiles per zoom level vs only at the current one: multiple levels make zooming smooth, but use several times the memory."],
    p: ["Version keys are not bumped for a dependency change, so cached tiles show old content after a component update.", "Tile boundaries show seams because antialiasing at edges was computed per tile with no overlap."],
    v: "Pan quickly across a large document, change one shape and zoom in and out. Confirm only tiles under the shape re-render, no seams are visible, and a gap-free frame is shown during every step.",
    dep: ["dirty-rectangles", "level-of-detail", "gpu-resource-management", "change-tracking"]
  },
  "dirty-rectangles": {
    s: "Tracking the screen regions affected by an edit so only those are re-rendered and re-composited, including the extra area covered by shadows, blurs and strokes.",
    d: "Change events give the nodes that changed. For each, the renderer computes the old and new visible bounds, expanded by effects and stroke width, converts them to screen space, and merges them into a set of rectangles. Only those areas are re-rendered into the tile cache or framebuffer. Damage from overlapping nodes also covers what is beneath them. Overlays are tracked separately. It is hard because bounds must be conservative but not huge, because effects and masks enlarge damage in non-obvious ways, and because a missed region shows as a stale smear.",
    k: ["Merging damage into one bounding rectangle vs keeping a list: one rectangle is simple and cheap, but repaints empty space around scattered edits.", "Conservative bounds vs exact bounds: conservative is safe, exact saves work but risks clipping effects."],
    p: ["A background blur's source area is omitted and the blurred region stays stale when content below it moves.", "Damage for a moved node includes only the new position and leaves a ghost at the old one."],
    v: "Move a node with a shadow over a blurred panel and toggle visibility on a layer below. Confirm no ghost or stale region remains, and the repainted area is within a small factor of the visible change.",
    dep: ["change-tracking", "effects-model", "tile-cache"]
  },
  "level-of-detail": {
    s: "Drawing less when the zoom is far out: skipping tiny nodes, simplifying paths, using prerendered thumbnails for groups and text, so huge documents stay interactive.",
    d: "At each zoom the renderer decides per node how much to draw. Nodes smaller than a pixel are culled or merged into an average color; paths are simplified to the pixel tolerance; text is drawn as blocks or lines at small sizes; images use mipmaps; complex frames may be replaced by cached images. Thresholds depend on zoom and on screen density. Transitions between detail levels should be invisible. It is hard because simplification must not create visible popping, and because a document of a million nodes at 1 percent zoom would otherwise need all of them processed.",
    k: ["Replacing groups with cached images at low zoom vs always drawing children: caching is far faster, but needs invalidation and can look soft.", "Culling by size threshold vs by estimated visual contribution: size is simple, contribution is more accurate but needs more computation."],
    p: ["Tiny but high-contrast nodes such as thin lines vanish at low zoom and the design looks empty.", "Detail levels switch at a zoom where the cached image and live drawing differ in position by a pixel."],
    v: "Zoom out on a million-node document in steps, and compare frames at each step with the full-detail render. Confirm no visible popping and frame time stays near the budget even at the lowest zoom.",
    dep: ["canvas-viewport", "mipmap-pyramid", "bezier-geometry", "tile-cache"]
  },
  "effects-renderer": {
    s: "Implementation of blur, shadow, noise, background blur and blend effects as GPU passes, with bounds expansion and offscreen buffers sized for the effect.",
    d: "An effect is drawn by rendering the node into an offscreen buffer, running one or more passes (for example separable blur horizontally and vertically), and compositing the result with the correct blend mode and mask. Large blur radii use downscaling or multi-pass approximations to keep cost bounded. Background blur copies what lies beneath the node first. Buffers come from a pool to avoid reallocation. It is hard because effects multiply memory and bandwidth, and because the results of GPU approximations must match export, especially at edges and in isolated groups.",
    k: ["Exact Gaussian blur vs approximations by repeated box filters: exact is faithful, approximations are much faster and close for large radii.", "Per-node offscreen buffers vs shared buffers for runs of siblings: per-node is simple but memory-hungry; sharing is efficient but complex."],
    p: ["A large blur on a large node allocates a buffer larger than GPU limits and rendering silently fails.", "The blur edge samples outside the buffer and darkens the border."],
    v: "Render a 300-pixel blur on a large frame and a stack of nested shadows, then compare to the exported raster. Confirm edges match, memory stays bounded by the pool, and the frame completes within budget.",
    dep: ["effects-model", "gpu-resource-management", "layer-compositing"]
  },
  "gpu-resource-management": {
    s: "Allocation, upload and eviction of textures and buffers under a memory budget, with pooling, batching of draw work and recovery from lost devices.",
    d: "Textures for tiles, images and offscreen buffers come from pools to avoid allocation stalls. Uploads happen in the background and are limited per frame so they do not block drawing. A budget triggers eviction of least recently used resources, with replacements rendered again when needed. Draw calls are batched by state. If the graphics device is reset or lost, the manager rebuilds everything from the document. It is hard because limits vary widely across devices, because running out of memory can crash the whole browser tab, and because uploads of large images compete with interaction.",
    k: ["A fixed memory budget vs one that adapts to the device: adaptive uses available memory well, but requires reliable device information that many platforms hide.", "Uploading synchronously vs spreading over frames: synchronous is simple but causes jank; spreading is smooth but delays content."],
    p: ["A lost device event is not handled and the canvas stays black until reload.", "Uploading a 100-megapixel image in one frame freezes the editor for seconds."],
    v: "Open a document needing twice the available GPU memory, force a device reset and continue editing. Confirm the editor does not crash, evicts under budget, rebuilds the canvas after reset, and uploads do not stall interaction.",
    dep: ["tiled-image-store", "threading-and-workers"]
  },
  "overlay-renderer": {
    s: "Drawing the editor's own interface over the canvas: selection outlines, handles, guides, snapping lines, measurement labels, other users' cursors and tool previews, at constant screen size.",
    d: "Overlays are drawn after the document in screen space, using the viewport transform only for positions, so lines and handles keep a constant pixel width at any zoom. They update on every pointer move and so must be cheap and independent of document rendering. Elements are drawn from retained state published by tools, selection and presence. High-contrast styling keeps them visible over any content. It is hard because overlays must stay crisp on high-density displays, avoid redrawing the document beneath, and not vanish against similarly colored content.",
    k: ["A separate overlay layer vs drawing in the same pass as content: separate lets overlays update at pointer rate without touching content, but needs its own compositing.", "Drawing overlays on the GPU vs on a 2D drawing surface: a 2D surface is simple and crisp for text and lines, GPU is faster for many elements."],
    p: ["Overlay lines blur on high-density displays because positions are not snapped to device pixels.", "Selection outlines disappear over content of the same color."],
    v: "Select nodes, drag with guides active and have two collaborators present on a 200 percent display. Confirm overlay lines are crisp one-device-pixel width, remain visible over any color, and moving them does not repaint tiles.",
    dep: ["canvas-viewport", "selection-and-marquee", "snapping-and-guides", "presence-and-cursors"]
  },
  "frame-scheduling": {
    s: "Deciding what work happens in each frame and what waits: input handling first, then rendering, with background tasks sliced to fit and quality lowered during interaction.",
    d: "The scheduler runs on the display refresh. It processes input, applies pending changes, renders the damaged area and submits to the GPU, then spends leftover time on background work such as tile rendering, thumbnail generation and layout. Under load it lowers quality during motion (cheaper effects, lower-resolution tiles) and restores it when idle. Long tasks are broken into slices with time checks. Frame times are measured and reported. It is hard because the main thread is shared with the browser or operating system, and because one unsliced task causes a visible hitch.",
    k: ["Dropping quality during interaction vs maintaining it and dropping frames: lowering quality keeps motion smooth but looks soft until idle.", "Cooperative slicing of tasks vs moving them to workers: slicing is simple and shares state, workers give true parallelism but require copying data."],
    p: ["A background task runs in one long synchronous slice and the canvas drops a dozen frames.", "Quality restoration never triggers because a task keeps the editor from being idle."],
    v: "Pan continuously while thumbnails and layout run in the background on a large file. Confirm the frame time histogram has no frames longer than twice the budget, and full quality returns within a second of stopping.",
    dep: ["threading-and-workers", "performance-budgets", "canvas-renderer"]
  },
});
