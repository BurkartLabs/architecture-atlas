// Details for the graphics editor plate, part 5: vector geometry and the raster pipeline.
ATLAS.details("graphics-editor", {
  "path-model": {
    s: "The representation of a shape outline: contours of anchor points with in and out handles, closed or open, fill rules and winding, plus optional vertex properties.",
    d: "A path is a list of contours; each contour is a sequence of anchors, each with a position and optional incoming and outgoing control handles, which define cubic Bézier segments between neighbors. A contour is open or closed. A fill rule (non-zero or even-odd) decides what counts as inside for overlapping contours. Corner radius and smoothing may be stored per anchor. Paths are the interchange unit for import, export, boolean operations and text outlines. It is hard because different formats encode the same shape differently, and because representation must make edits and exact geometry both cheap.",
    k: ["Cubic Bézier segments only vs also arcs and quadratic curves: cubic only gives one algorithm everywhere, but arcs and circles are only approximated.", "Anchors with handles vs command lists: anchors match how people edit, command lists match file formats and need conversion."],
    p: ["A circle stored as four cubic segments drifts from true radius, and exports compare unequal to the original.", "Winding direction is lost on import and holes fill in."],
    v: "Import a path with holes, nested contours and arcs, edit one anchor and export. Confirm fill rule and holes are preserved, and the exported outline differs from the original only at the edited anchor.",
    dep: ["bezier-geometry", "node-types"]
  },
  "bezier-geometry": {
    s: "The math of cubic curves: evaluation, subdivision, derivatives, arc length, bounding boxes, nearest point and flattening, with attention to numerical stability.",
    d: "A cubic curve is evaluated from four control points. De Casteljau subdivision splits it exactly; derivatives give tangents and curvature; bounds come from solving for derivative roots rather than from control points. Arc length and parameterization by distance need numerical integration. Flattening converts a curve to line segments within a tolerance for rendering and hit testing. It is hard because degenerate cases (coincident control points, cusps, loops, near-straight curves) break formulas that work for typical curves, and because tolerances must be set in the right coordinate space.",
    k: ["Closed-form root solving vs iterative refinement: closed form is fast, but loses accuracy near degenerate cases where iteration with bracketing stays safe.", "Fixed flattening tolerance in document units vs in screen pixels: screen-based adapts to zoom, but rebuilds on every zoom change."],
    p: ["A cusp makes the derivative zero and normal vectors for strokes become undefined, producing spikes.", "Bounds taken from control points overstate the shape and selection boxes look too large."],
    v: "Evaluate bounds, length and nearest point on a thousand random and degenerate curves against a high-precision reference. Confirm errors stay below the stated tolerance with no NaN or infinite values.",
    dep: ["numeric-precision"]
  },
  "path-editing-ops": {
    s: "The operations that change a path's structure: add, delete and move anchors, convert corner and smooth, join and split contours, reverse direction, and offset or scale a selection of points.",
    d: "Each operation takes a path and a target (anchor, segment or selection) and returns a new valid path. Adding a point on a segment splits the curve at a parameter so the shape stays identical. Deleting a point can refit neighbors to preserve the shape. Joining merges end points and handles. Operations are expressed as commands so they undo cleanly. It is hard because invariants (non-degenerate segments, consistent closure, no duplicated points) must hold after every operation, and because the same user gesture means different things for open and closed paths.",
    k: ["Delete that preserves shape by refitting vs delete that keeps neighbors' handles: refitting looks right, but changes handles the user did not touch.", "Operations on the path model vs on a vector network: the path model is simple and standard, networks handle branching better but need conversion on export."],
    p: ["Splitting a segment at the wrong parameter changes the curve's shape slightly instead of preserving it.", "Joining two endpoints at the same location leaves two coincident points and a stroke artifact."],
    v: "Insert a point on a curve, delete it, join two open paths and reverse a contour. Confirm the outline is geometrically unchanged where it should be, no zero-length segments exist, and each step is one undo.",
    dep: ["path-model", "bezier-geometry", "command-system"]
  },
  "boolean-operations": {
    s: "Combining shapes into new outlines by union, subtract, intersect and exclude, producing clean paths with correct winding and no slivers.",
    d: "The algorithm splits both shapes at all intersection points, classifies each resulting segment as inside or outside the other shape, and keeps segments according to the operation, then reconnects them into closed contours. Curves are intersected numerically or by flattening with a tolerance. Results can be live: the operation node stays editable and recomputes when operands change. It is hard because coincident edges, tangential touches and nearly overlapping curves produce intersection errors that create tiny gaps, slivers or missing regions, and it must run fast enough for interactive dragging.",
    k: ["Exact curve intersection vs flattening to polylines first: exact keeps curves smooth, but is fragile; flattening is robust but turns curves into many small segments.", "Live boolean groups vs flattening immediately: live keeps edits easy but recomputes on every change; flattening is cheap but irreversible."],
    p: ["Two shapes with a shared edge leave a hairline gap after subtraction because intersection points were off by a tiny amount.", "A live boolean over complex operands recomputes on every drag frame and drops the frame rate."],
    v: "Run all four operations on circles, stars, self-overlapping shapes and shapes with shared edges. Confirm results have no gaps or slivers, area equals the analytic value within tolerance, and drags stay at frame rate.",
    dep: ["path-model", "curve-intersection", "bezier-geometry", "numeric-precision"]
  },
  "stroke-geometry": {
    s: "Converting a path plus stroke settings into a fillable outline: width, caps, joins, miter limits, dashes, inside and outside alignment and variable width.",
    d: "A stroker walks each segment, offsets it to both sides by half the width, adds cap shapes at open ends and join shapes at corners, and returns the resulting outline. Dashing splits the path by arc length first. Inside and outside alignment offsets only one side and clips against the fill. Variable-width strokes interpolate width along the path. Offset curves are not exactly cubic, so they are approximated. It is hard because offsets of tight curves self-intersect, joins at sharp angles can spike, and results must match exported formats.",
    k: ["Stroking on the GPU in a shader vs generating outline geometry on the CPU: shader stroking is fast and resolution independent, but export and booleans still need real outlines.", "Approximating offsets with fitted cubics vs flattening: fitting keeps paths compact, flattening is simpler but yields large point counts."],
    p: ["A miter join on a very sharp corner extends far beyond the shape unless the miter limit is applied.", "Offsetting a tight inner curve produces loops that fill as stray blobs."],
    v: "Stroke a spiral, a star with sharp corners and a dashed closed curve with all caps and joins, then convert to outlines. Confirm the outlines fill identically to the live stroke, with no spikes or inner loops.",
    dep: ["bezier-geometry", "path-model", "paint-model"]
  },
  "shape-primitives": {
    s: "Parametric shapes (rectangle, ellipse, polygon, star, line, arc) that keep their parameters until converted to paths, with per-corner radii and smooth corner curves.",
    d: "A primitive stores a small set of parameters, such as size, corner radii, point count and inner ratio, and generates its path on demand. Rectangles support independent radii and a smoothing factor that blends the corner into the edge, giving continuous curvature. Ellipses support arcs and rings. Keeping primitives parametric makes them cheap in files, exact at any scale, and easy to resize with correct radii. It is hard because radii must clamp when the shape is smaller than the sum of its corners, and because conversion to path must match the rendered shape.",
    k: ["Parametric primitives vs paths from the start: parametric stays editable and tiny, but adds node types and special cases in every tool.", "Circular corner arcs vs continuous-curvature corners: circular is standard and matches code, continuous looks smoother but may not export exactly."],
    p: ["Radii larger than half the side are not clamped and the shape self-intersects.", "Resizing a star scales stroke geometry non-uniformly because the parameters were baked into a path."],
    v: "Create each primitive, set extreme radii and sizes, resize non-uniformly and convert to a path. Confirm radii clamp, the converted path renders identically, and file size remains a few bytes per shape.",
    dep: ["path-model", "node-types", "bezier-geometry"]
  },
  "path-simplification": {
    s: "Reducing the number of points on a path while keeping its shape within a tolerance, and fitting smooth Bézier curves through freehand input or traced outlines.",
    d: "Freehand strokes arrive as hundreds of points. A simplifier removes points whose removal changes the shape less than a tolerance, using algorithms based on distance to the simplified line. A curve fitter then finds cubic segments that approximate runs of points with controlled error, splitting where the error is too large or at detected corners. The same tools clean up imported or traced paths. It is hard because tolerance is a tradeoff between smoothness and fidelity, and because corners must be preserved while noise is removed.",
    k: ["Aggressive simplification vs high fidelity: fewer points are easier to edit later, but lose small deliberate details.", "Fitting in screen space vs document space: screen space adapts to what the user sees, but results change with the zoom at the time of drawing."],
    p: ["Sharp corners are smoothed into rounded blobs because corner detection thresholds were too loose.", "Tolerance applied in document units makes a tiny drawing collapse to a few points."],
    v: "Draw a signature freehand at two zoom levels and simplify. Confirm point count falls by an order of magnitude, the maximum deviation from the input stays under the stated tolerance, and corners remain sharp.",
    dep: ["bezier-geometry", "path-model", "brush-and-eraser-tools"]
  },
  "curve-intersection": {
    s: "Finding where curves cross or touch each other and themselves, robustly, for boolean operations, hit testing, snapping and stroke cleanup.",
    d: "The common method is recursive subdivision with bounding box rejection: split both curves until the boxes are small, then refine with a numerical solver. Specialized cases handle lines, tangent contact and overlapping segments. A uniform grid or a bounding volume tree reduces the pairs examined. Results must be consistent: the same intersection found from either curve produces the same point. It is hard because tangent and overlapping curves are numerically ill-conditioned, and because missing or duplicating a single intersection corrupts boolean results.",
    k: ["Exact subdivision with tolerance vs algebraic root finding: subdivision is robust and simple, but slower; algebraic methods are fast but unstable in degenerate cases.", "A fixed tolerance vs a tolerance scaled to the curve's size: scaled adapts to huge and tiny shapes, but makes results depend on scale."],
    p: ["A tangent touch is found as zero intersections from one curve and two from the other, which breaks boolean connectivity.", "Overlapping segments are reported as thousands of intersections."],
    v: "Intersect random curve pairs, tangent circles and overlapping lines and compare with a high-precision reference. Confirm intersection counts match, points agree to tolerance, and results are symmetric under swapping the operands.",
    dep: ["bezier-geometry", "numeric-precision"]
  },
  "tiled-image-store": {
    s: "Raster layers kept as a grid of fixed-size tiles that are allocated on demand, compressed when idle and swapped to disk, so big images do not need to fit in memory.",
    d: "A layer is a sparse map from tile coordinates to tile buffers, commonly 256 by 256 pixels. Empty tiles take no memory, and uniform tiles can be stored as a single value. Edits touch only the tiles under the brush, which keeps undo deltas small. A cache keeps recently used tiles in memory, compresses cold ones and spills the rest to scratch storage. Tiles can be processed in parallel by filters and compositing. It is hard because operations that span tile edges, such as blur and warp, need neighboring pixels, and because memory pressure must degrade gracefully.",
    k: ["Large tiles vs small tiles: large tiles reduce overhead and suit filters, small tiles reduce wasted work for brush edits and undo.", "Storing 8-bit vs 16-bit or float tiles: higher depth gives headroom for editing, but doubles or quadruples memory and bandwidth."],
    p: ["Filters read only inside each tile and leave visible seams at tile borders.", "The scratch file grows without bound because freed tiles are never reclaimed."],
    v: "Open a 30,000 by 30,000 pixel image, paint across tile boundaries and apply a blur. Confirm memory stays under the cap, no seams appear at tile edges, and undo restores only the touched tiles.",
    dep: ["gpu-resource-management", "numeric-precision"]
  },
  "mipmap-pyramid": {
    s: "Pre-reduced copies of each image at half resolutions, so zoomed-out views sample a small, correctly filtered version instead of the full-size pixels.",
    d: "Each level halves width and height from the one before, using a good downscaling filter. When rendering at a given zoom, the renderer picks the level whose pixel density matches the screen, and blends between two levels for smooth zooming. Pyramids are built lazily, per tile, and invalidated and rebuilt only for tiles that changed. They also speed up histograms and navigators. It is hard because pyramids cost about a third more memory, must stay in step with edits during painting, and the filter choice affects sharpness and ringing.",
    k: ["Building levels eagerly vs lazily on demand: eager gives instant zoom-out, lazy saves memory and time for images never zoomed.", "Box filtering vs a sharper filter for reduction: box is fast and stable, sharper filters preserve detail but can ring on edges."],
    p: ["A painted stroke updates the top level but not lower ones, so the zoomed-out view shows the old image.", "Linear-light data is reduced in gamma space and dark detail goes muddy."],
    v: "Paint a thin stroke, then zoom to 6 percent. Confirm the stroke appears immediately and at the correct brightness, and the renderer is sampling a lower level and not the full-size tiles.",
    dep: ["tiled-image-store", "level-of-detail", "tile-cache"]
  },
  "layer-compositing": {
    s: "Combining a stack of raster and vector layers into one image, in order, with opacity, blend modes, masks, groups and clipping, in a defined color space.",
    d: "The compositor walks the layer tree from the bottom up. For each layer it takes the layer's pixels (rendered if it is vector or text), applies its mask and opacity, and blends onto the accumulated result with its blend mode. Groups either pass through or are composited separately and then blended as one. Operations run on tiles, only for dirty regions, on the GPU where possible. It is hard because results must be identical between GPU preview, CPU export and other renderers, and because deep stacks with groups need many intermediate buffers.",
    k: ["Compositing in linear light vs in the stored encoding: linear is physically correct, while the encoded space matches what most users and other tools expect.", "Flattening layers into a cache vs recompositing each frame: caching speeds navigation, but needs correct invalidation as layers change."],
    p: ["The GPU preview and the exported file use different rounding and differ by a few levels, visible in smooth gradients.", "A group is composited without isolation and a blend mode inside it reaches layers outside."],
    v: "Composite a stack of fifty layers with groups, masks and mixed blend modes on GPU and CPU paths. Confirm the outputs differ by no more than one level per channel and match a reference render.",
    dep: ["blend-modes", "raster-masks", "z-order-and-layering", "tiled-image-store", "working-space-and-bit-depth"]
  },
  "blend-modes": {
    s: "The formulas that decide how a layer's color combines with what lies beneath it: multiply, screen, overlay, soft light, color, luminosity and others, plus opacity and fill handling.",
    d: "Each mode is a function of backdrop and source color, with alpha handling defined by a general compositing formula. Separable modes act on each channel; non-separable ones (hue, saturation, color, luminosity) work on color components together. Implementations exist as shader code and CPU code that must agree. Modes on premultiplied versus straight alpha differ, and so do results in linear versus gamma space. It is hard because published formulas have variations, and files from other tools expect specific behavior.",
    k: ["The standard compositing specification vs matching legacy tool behavior: the standard is documented and portable, while legacy matching preserves how old files look.", "Implementing modes in a shader vs on the CPU only: shaders are fast for preview, but must be verified against a CPU reference."],
    p: ["Blend modes are applied to premultiplied values in one path and straight values in another, producing dark fringes.", "Overlay is implemented with a swapped condition and looks like hard light."],
    v: "Render a test pattern of gradients and alpha edges through every blend mode on GPU and CPU. Confirm they agree within one level per channel and match published reference images for the same inputs.",
    dep: ["layer-compositing", "working-space-and-bit-depth"]
  },
  "raster-masks": {
    s: "Grayscale pixel layers attached to a layer or group that control per-pixel opacity, paintable with brushes and combinable with vector masks and selections.",
    d: "A mask holds one value per pixel, stored as its own tiled layer. White shows, black hides, gray partially hides. Masks can be painted, filled from a selection, blurred (feathered) and inverted. A layer can have a pixel mask and a vector mask whose combined result is their product. Masks may be linked to move with the layer. Rendering applies the mask during compositing, for only the dirty tiles. It is hard because masks increase memory and compositing cost, and because correct feathering and density controls must act predictably in different resolutions.",
    k: ["Masks stored as separate grayscale layers vs baked into alpha: separate masks keep edits reversible, but cost memory and an extra read per pixel.", "Feathering in pixels vs in document units: pixels are predictable on one image, document units survive resolution changes."],
    p: ["Resizing the image resamples the mask with a different filter than the layer, and edges drift.", "Linked masks fail to move with the layer when it is transformed in a group."],
    v: "Paint a soft mask on a layer, transform the layer and export at double resolution. Confirm mask edges move with the content, softness scales proportionally and no halo appears around the masked area.",
    dep: ["tiled-image-store", "layer-compositing", "pixel-selection", "masks-and-clipping-model"]
  },
  "adjustment-layers": {
    s: "Non-destructive tonal and color corrections (curves, levels, hue, color balance, gradient maps) stored as layers that affect everything below, with their own masks.",
    d: "An adjustment layer stores parameters, not pixels. At composite time it takes the accumulated image beneath it, applies a per-pixel color function (often a lookup table built from the parameters) and blends the result through its mask and opacity. Because it is a function of the layers below, changing any layer below updates the result. Adjustments run in the working color space and at its bit depth. It is hard because stacking many adjustments multiplies cost per pixel, and because the same parameters must give the same look at different bit depths and in different color spaces.",
    k: ["Adjustments as live layers vs applying them to pixels: live layers stay editable and cost compositing time every frame; applying is permanent and faster.", "Lookup tables vs per-pixel math: tables are fast for one-dimensional curves, but cannot express cross-channel effects without three-dimensional tables."],
    p: ["Curves applied in an 8-bit space cause banding that vanishes in 16-bit, so previews disagree with exports.", "An adjustment clipped to one layer is composited over the whole stack by mistake."],
    v: "Stack curves, hue and gradient-map layers with masks, toggle each and compare to the baked result. Confirm identical pixels within one level, and that editing a layer below updates the whole stack in the same frame.",
    dep: ["layer-compositing", "working-space-and-bit-depth", "raster-masks"]
  },
  "filter-pipeline": {
    s: "Applying image operations (blur, sharpen, noise, distort, convolution) to tiles with proper edge handling, as destructive edits or as editable smart filters.",
    d: "A filter declares its input region requirement: how many surrounding pixels it needs for each output tile. The pipeline fetches tiles with that margin, runs the operation on CPU or GPU, and writes the results, handling image edges by clamping or mirroring. Smart filters keep the source and the parameters and re-run when anything changes, and can be masked. Long operations run in the background with a low-resolution preview first. It is hard because large radii need large margins, and because filters must be cancelable and keep the interface responsive.",
    k: ["Previewing at reduced resolution vs at full resolution: reduced is instant but approximates; full is exact but slow on large images.", "Editable smart filters vs destructive application: smart filters allow later changes at a cost in memory and recomputation."],
    p: ["A large-radius blur reads past tile borders with missing margins and leaves visible grid lines.", "A cancelled filter leaves some tiles processed and others not."],
    v: "Apply a 200-pixel blur to a 20,000 pixel image, cancel one run midway and complete another. Confirm the cancelled run leaves the image unchanged, and the completed output has no seams versus a whole-image reference.",
    dep: ["tiled-image-store", "gpu-resource-management", "frame-scheduling"]
  },
  "brush-engine": {
    s: "The system that turns a smoothed stroke path into pixels by stamping a brush tip along it, controlled by spacing, size, flow, scatter, texture and pressure dynamics.",
    d: "A brush preset defines a tip (a shape or image), spacing as a fraction of size, and dynamics that map pressure, tilt, speed and randomness to size, opacity, angle and scatter. The engine walks along the stroke path at the spacing, computes parameters for each stamp and composites it into a temporary stroke buffer, which is then merged into the layer with a stroke-level opacity. Wet and smudge brushes sample existing pixels. Work runs in tiles on the GPU or on worker threads. It is hard because strokes need low latency while stamping thousands of times, and results must match between preview and the final commit.",
    k: ["GPU stamping vs CPU stamping: GPU is fast for large soft brushes, but is harder to make match exactly and is limited for mixing brushes.", "Spacing-based stamping vs continuous stroke rendering: stamping is flexible and handles textures; continuous stroking is smoother for hard-edged round brushes."],
    p: ["Spacing measured in pixels breaks the look when the brush is scaled for a high-resolution canvas.", "Stamp positions are rounded to whole pixels and slow strokes look jagged."],
    v: "Paint the same stroke with each preset at 25 and 400 percent zoom, and compare to the committed layer. Confirm no jaggies, identical overlap behavior, and latency from pen to pixel is within the stated budget.",
    dep: ["tiled-image-store", "pen-and-pressure-input", "blend-modes", "gpu-resource-management"]
  },
  "pixel-selection": {
    s: "Pixel-level selection masks created by marquee, lasso, color range, magic wand and edge-aware tools, refinable by feathering, growing, smoothing and adding or subtracting.",
    d: "A selection is a grayscale mask in tiled storage, where values give partial selection. Tools build it from shapes, flood fill by color similarity, edge detection or learned subject segmentation. Refinements change the mask: expand, contract, feather, smooth and invert. Selections limit where filters, fills and brushes act, and convert to masks and paths. The marching outline shown on screen is traced from the mask and updated as it changes. It is hard because edge-aware selection on hair and soft edges needs matting, and because outlines of large masks are expensive to draw.",
    k: ["Selection as a mask with partial values vs a vector outline: masks hold soft edges exactly, but cost memory; outlines are small and resolution independent.", "Flood fill on the composite vs on the active layer: composite matches what is seen, layer is predictable when editing."],
    p: ["A wand selection tolerance is evaluated in the display space, so the same click selects different regions for different working spaces.", "Tracing the outline of a noisy mask yields millions of segments and stalls the interface."],
    v: "Select a subject with the wand on a photo at two bit depths, then feather and convert to a mask. Confirm the same region is chosen in both, and the outline updates without a visible stall.",
    dep: ["tiled-image-store", "raster-masks", "filter-pipeline"]
  },
  "retouch-and-warp": {
    s: "Tools that repair or reshape pixels: clone, heal, patch, dodge and burn, smudge, and mesh, liquify and perspective warps that move pixels by a displacement field.",
    d: "Clone and heal sample source pixels at an offset and blend them into the target, with healing matching texture and adjusting tone to surroundings. Warp tools build a displacement field or a mesh and resample the image through it, with interpolation chosen for quality. Both operate on tiles and need previews that are fast and final results that are sharp. Non-destructive versions keep the source and the displacement separate. It is hard because resampling blurs pixels each time, and because strokes interacting with the field require repeatable results.",
    k: ["Non-destructive displacement fields vs applying immediately: fields allow later changes but cost memory; applying is simple and cumulative blur grows.", "Bilinear vs higher-order interpolation for warps: bilinear is fast and soft; higher-order is sharper but slower and can ring."],
    p: ["Repeated warps resample the same pixels many times and the image softens each time.", "Healing samples from a layer that moved and fills with the wrong texture."],
    v: "Clone out an object, heal the seam and apply a liquify warp, then reopen the file. Confirm the repair has no repeating pattern or visible seam, and the warp's field can still be edited.",
    dep: ["tiled-image-store", "brush-engine", "pixel-selection", "filter-pipeline"]
  },
});
