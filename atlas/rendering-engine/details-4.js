// Details for the rendering engine plate, part 4: paint, compositing, animation and scrolling, frame pipeline, cross-cutting concerns.
ATLAS.details("rendering-engine", {
  "paint-invalidation": {
    s: "Tracks which regions of which layers need their drawing recorded again after a change, so unchanged content is not repainted.",
    d: "A style diff that affects only appearance, or a geometry change, marks the owning box as needing paint. Marks propagate to the layer or chunk that contains it, and to the old and new areas when something moves. At paint time, only dirty parts are re-recorded, and the dirty rectangles are passed on so raster re-renders only those tiles. Changes in stacking, clipping or scroll can change grouping and cause broader invalidation. The hard part is being precise: invalidating too little leaves visual artifacts, and too much repaints a whole layer for a small change.",
    k: ["Tracking invalidation per box vs per layer: precise rectangles reduce raster, but every property change must say which area it affects.", "Invalidating old and new bounds on moves vs only the new: no ghost pixels, but moving content costs twice the area."],
    p: ["Forgetting the old position of a moved element leaves a trail of stale pixels.", "Invalidating a full-screen background for every small update wastes raster time."],
    v: "Change a single element's color on a large page with paint flashing enabled. Only that element's rectangle should be repainted, and a screenshot must match a fresh render of the final state.",
    dep: ["computed-style", "layout-tree", "display-item-caching", "damage-tracking"]
  },
  "stacking-contexts": {
    s: "Groups boxes into independent z-ordering scopes, created by positioning with z-index, opacity, transforms, filters and similar properties, which define paint order.",
    d: "Within a stacking context, descendants paint in a defined order: background, negative z-index children, in-flow blocks, floats, inline content, then positive z-index children. Children that create their own contexts are painted atomically as units. Properties such as opacity, transform, filter, mix-blend-mode and isolation create contexts, because they need their group rendered as a whole. The result is a tree that differs from the DOM tree, and is the base for hit testing and layers. The difficulty is correct ordering with the many triggers, and the cost of unexpected contexts.",
    k: ["Contexts created implicitly by effect properties vs only by explicit z-index: effects can apply to a group as a unit, but authors get surprises in layering.", "Atomic painting of a context vs interleaving its descendants: correct visual grouping, but it forces offscreen surfaces for opacity and filters."],
    p: ["An ancestor with opacity below one traps descendants' z-index inside it, so a dropdown cannot rise above neighbors.", "Applying filters on large containers forces large offscreen surfaces and memory growth."],
    v: "Build overlapping content with nested contexts via z-index, opacity and transforms. Rendered stacking must match the specification's order, and hit testing must pick the topmost visible element.",
    dep: ["paint-order", "computed-style", "layout-tree"]
  },
  "paint-order": {
    s: "The fixed sequence in which a box's parts are painted within a stacking context, from backgrounds and borders through floats and text to outlines and overlays.",
    d: "For each stacking context the painter walks the layout tree several times, once per phase: block backgrounds, floats, inline content and foreground, then outlines. Within each phase, boxes are visited in tree order. Atomic children such as inline-blocks and positioned boxes are painted in whole at their step. Scrolling containers and clips apply state to everything inside them. Table cells and collapsing borders have special phases. The point is that visual overlap is deterministic. It is hard since the order must match the specification across every box type, and must be reproduced for hit testing in reverse.",
    k: ["Multiple walks per context vs one walk with sorting: simple and matches the specification, but touches boxes several times.", "Painting in the specified phases vs a simplified order: exact compatibility, but any new box type must say where it participates."],
    p: ["Painting floats in the wrong phase makes their background cover or be covered by inline text unexpectedly.", "Hit testing that does not mirror paint order picks elements that are visually behind."],
    v: "Render a test page with overlapping floats, inline blocks, positioned boxes and outlines, and compare the output pixel for pixel with reference renderings from the conformance suite.",
    dep: ["stacking-contexts", "layout-tree", "display-lists"]
  },
  "display-lists": {
    s: "The recorded sequence of drawing commands for a layer, such as fills, images, text blobs and clips, which raster replays later on another thread.",
    d: "Painting does not draw. It produces items: rectangles, rounded borders, glyph runs, images and shadows, bracketed by state items for transforms, clips and effects. The list is immutable once recorded, and can be replayed multiple times, at different scales and to different tiles. Recording on the main thread and replay on raster threads decouple them. Lists can be large, so they are compact and indexed spatially, letting raster skip items outside a tile. The hard parts are keeping recording cheap, size under control, and making replay deterministic.",
    k: ["Recording commands vs drawing immediately: replays at any scale and raster off the main thread, but memory is spent on the list and main thread pays recording cost.", "A spatial index on the list vs linear replay: tiles skip irrelevant items, but building the index costs time on each new recording."],
    p: ["A huge list from an unclipped giant element is replayed for every tile.", "Items that capture mutable state, such as pointers into live data, make replay later read changed values."],
    v: "Record a page's display list, replay it into tiles at two scales and compare with a direct paint. Outputs must be identical, and tiles outside an item's bounds must not execute it.",
    dep: ["paint-order", "property-trees", "tiling", "gpu-raster"]
  },
  "property-trees": {
    s: "Separate trees for transforms, clips, effects and scrolls, shared by many display items, so state changes apply without re-recording content.",
    d: "Rather than nesting state around each item, each item references nodes in four trees: transform, clip, effect, and scroll. A node stores its parent and its own contribution, such as a matrix or rectangle. Combining ancestors gives an item's final state, and results are cached. A scroll offset or an animated transform changes one node, not the recorded content. The compositor holds the same trees and updates them each frame. The hard part is correctness of relationships between the trees, such as clips that depend on scrolls, and building them from the layout tree.",
    k: ["Separate trees for transform, clip, effect and scroll vs a single state stack: independent updates and sharing, but cross-tree dependencies need explicit handling.", "Passing the trees to the compositor vs flattening to layers: compositor-driven changes are cheap, but the compositor must implement the same math."],
    p: ["A clip that should move with a scroller but sits in the wrong tree stays fixed while content scrolls.", "A property tree rebuilt from scratch for every frame costs time proportional to page size."],
    v: "Change a transform and a scroll offset on a large page and confirm no re-recording occurs, only property tree updates, and that the output matches a full rebuild.",
    dep: ["stacking-contexts", "layer-tree", "compositor-animations", "scroll-containers"]
  },
  "clips-masks-effects": {
    s: "Applies rounded clips, masks, opacity groups, filters and blend modes to painted content, deciding when an offscreen surface is needed.",
    d: "Simple clips, such as rectangles, apply as scissor regions. Rounded and path clips use shader or mask techniques. Opacity, filters, masks and blend modes apply to a group as a whole, so the group is drawn to an offscreen surface and composited with the effect, unless it can be folded into a single draw. Backdrop effects read what is behind. Surfaces cost memory and bandwidth, so the engine tries to avoid them with fast paths. The difficulty is that visual correctness requires grouping, and performance requires its avoidance.",
    k: ["Offscreen surfaces per effect vs folding into draws: always correct, but each surface costs memory and a render pass.", "Rounded clips by mask vs by shader per draw: shaders avoid surfaces, but need support in every draw type."],
    p: ["Large blurs or backdrop filters on full-screen elements make frames take longer than the budget on weak GPUs.", "Nesting many opacity groups multiplies offscreen passes."],
    v: "Render a page with nested opacity, rounded clips, blur and blend modes. Output must match a reference in a software renderer, and a GPU trace should show the expected count of offscreen passes.",
    dep: ["stacking-contexts", "property-trees", "gpu-raster", "display-lists"]
  },
  "display-item-caching": {
    s: "Reuses the recorded drawing items of unchanged parts of the page between frames, so repaint only records what is new.",
    d: "Each paintable box owns a client record of its items, with a stable identity. On a new paint, a box that is not invalidated and whose items are still valid is copied by reference to the new list, preserving order. Chunks of items with the same property state are matched with the previous frame to find what changed. Only invalidated boxes re-record. The compositor can reuse layers when their chunks match. It is hard because validity depends on any property tree state and paint order, and cache bookkeeping must itself be cheaper than recording.",
    k: ["Caching per box with identity vs rerecording everything: much less work for small changes, but each box must be correctly invalidated.", "Chunk matching across frames vs fresh layers: stable layers reuse raster, but matching costs time and can mismatch after reordering."],
    p: ["A box that changes appearance without invalidating its cached items keeps painting its old look.", "Cached items referencing destroyed boxes cause crashes on reuse."],
    v: "Change one element on a large page across frames and count recorded items. Recording must touch only the changed element, and the resulting display list must equal a full re-record.",
    dep: ["paint-invalidation", "display-lists", "layer-tree"]
  },
  "layer-promotion": {
    s: "Decides which parts of the page get their own compositing layer, based on animation, scrolling, transforms, overlap and memory cost.",
    d: "A layer is promoted when it benefits from independent movement or isolation: it scrolls, has a compositor animation, has a transform or opacity that changes, or hosts video or a surface. Content painting above a promoted layer must be promoted too if it overlaps, to preserve order. Too many layers cost memory and slow compositing, so the engine merges or squashes layers when possible. Promotion hints from style, such as will-change, are advisory. The hard parts are overlap testing, which can cause an explosion of layers, and deciding when promotion costs more than it saves.",
    k: ["Promoting on likelihood of change vs only while changing: movements start instantly, but memory and raster are spent early.", "Squashing overlapped content into shared layers vs separate layers: fewer layers, but a change repaints the shared layer."],
    p: ["Content overlapping an animated layer gets promoted implicitly, and a page can end with hundreds of large layers.", "Declaring a change hint on many elements permanently reserves memory."],
    v: "Animate one element on a page with overlapping content and dump the layer tree. Only layers needed for the animation and its overlaps should exist, with total layer memory within the expected bound.",
    dep: ["stacking-contexts", "property-trees", "compositor-animations", "layer-tree"]
  },
  "layer-tree": {
    s: "The set of layers, each with bounds, content or children, and property tree references, that the compositor draws to form a frame.",
    d: "A layer holds a size, a pointer to its content, such as a display list, solid color or surface, and ids into the property trees that give its state. The main thread builds and updates the layer tree, and commits it to the compositor, which keeps its own copy to draw from. Pieces such as scroll offsets and animation state are owned by the compositor between commits. The structure determines raster granularity, memory, and what can change cheaply. The hard parts are keeping the two copies consistent and rebuilding minimal layers on change.",
    k: ["Two copies with commit vs shared structure with locks: the compositor never waits for the main thread, but copying and consistency rules add work.", "Fine-grained layers vs fewer large layers: cheap independent updates vs lower memory and fewer draw calls."],
    p: ["A layer rebuilt each frame cannot reuse raster, so every frame repaints.", "Compositor-owned state overwritten by a stale commit makes scroll position jump back."],
    v: "Dump the layer tree before and after changes of different kinds. Layer identity and raster must persist for unchanged content, and scroll positions must survive commits during an ongoing scroll.",
    dep: ["layer-promotion", "property-trees", "display-lists", "compositor-thread"]
  },
  "compositor-thread": {
    s: "A thread that owns the layer tree copy and produces frames by updating scrolls and animations, drawing tiles and presenting, independent of main-thread work.",
    d: "On each begin-frame signal the compositor ticks its animations, applies scroll updates from input, updates the property trees, decides which tiles are visible, and draws a frame from the rasterized tiles, skipping work when nothing changed. It handles input for scroll and pinch first, forwarding the rest to the main thread. It also manages raster priorities and memory. The compositor must always make its deadline, so it does no work whose cost is unbounded. The hard part is staying responsive while the main thread is busy, and staying correct when it catches up.",
    k: ["A separate compositor thread vs doing everything on the main thread: scrolling and animation survive main-thread jank, but state must be partitioned and synchronized.", "Compositor-handled input vs main-first: smooth scroll, but behaviors that depend on script need explicit fallback."],
    p: ["Content that is not yet rastered shows as a blank checkerboard when scrolling outruns raster.", "Doing a blocking call into the main thread from the compositor reintroduces jank."],
    v: "Block the main thread for a second while scrolling and running a transform animation. The compositor's frame rate must stay at the display's rate, with checkerboarding only in not-yet-rastered regions.",
    dep: ["layer-tree", "tiling", "threaded-scrolling", "compositor-animations", "begin-frame"]
  },
  "tiling": {
    s: "Divides large layers into fixed-size tiles that are rasterized, cached and drawn independently, so only the needed ones consume memory and time.",
    d: "Each layer is cut into a grid of tiles, typically a few hundred pixels on a side, with resolution scaled to the current zoom. The engine keeps tiles for the visible area plus a margin in the direction of scrolling, and assigns priorities by distance from the viewport. Invalidations mark only intersecting tiles. A low-resolution version can fill gaps temporarily. Memory budgets limit how many tiles exist at once. Hard parts are prediction of where the user will scroll, tile size trade-offs, and keeping tiles consistent when layers change scale during animation.",
    k: ["Small tiles vs large: finer invalidation and memory control, but more draw calls, more seams and more raster-task overhead.", "Rastering ahead of scroll vs on demand: fewer checkerboards, but wasted work when the user stops or changes direction."],
    p: ["Fast scrolling past rastered tiles shows blank areas because the margin was too small.", "Rastering at a transient high scale during a pinch consumes memory for tiles never displayed."],
    v: "Fling-scroll a long page and record the fraction of frames with missing tiles. Tile memory must stay within budget and only tiles intersecting a change should re-raster on invalidation.",
    dep: ["layer-tree", "raster-scheduling", "gpu-raster", "damage-tracking"]
  },
  "gpu-raster": {
    s: "Replays display lists into tile textures using the graphics processor, drawing paths, text and images with shaders instead of on the CPU.",
    d: "Raster workers replay a tile's display items through a 2D drawing library backed by the GPU, issuing commands into a command buffer that is executed in a separate GPU process. Paths are tessellated or drawn analytically, glyphs come from atlases, and images are uploaded or already on the GPU. Output is a texture the compositor samples. CPU raster remains as a fallback for unsupported content or devices. The hard parts are consistent output across drivers, avoiding stalls from uploads and state changes, and graceful recovery from a lost GPU context.",
    k: ["GPU rasterization vs CPU: much faster on complex pages and large screens, but uneven driver quality and higher setup costs on simple content.", "Rastering into tiles vs directly to the screen each frame: cached results reused across frames, but memory for textures and a copy per frame."],
    p: ["A driver bug that renders one primitive wrongly appears on a subset of devices and is hard to reproduce.", "A lost context mid-frame without recovery leaves blank tiles until reload."],
    v: "Rasterize a complex page on GPU and CPU paths and compare screenshots within a small tolerance. Then force a context loss and confirm the page recovers without reload.",
    dep: ["display-lists", "tiling", "decoded-image-cache", "clips-masks-effects"]
  },
  "raster-scheduling": {
    s: "Orders and budgets the work of rasterizing tiles and decoding images, giving priority to what is visible now, then what is about to be.",
    d: "The compositor's tile manager assigns each tile a priority: visible and high resolution first, then near the viewport, then others. It limits memory and work per frame and sends tasks to raster workers, together with the image decodes they need. Tasks for tiles no longer relevant are cancelled. Before showing a new frame, the engine may wait for important tiles so that content does not flash. The balance is between latency, smooth scrolling and power. Hard parts are choosing budgets and avoiding priority inversion when a high-priority tile waits for a decode.",
    k: ["Strict priority by visibility vs fairness: the visible area is ready first, but low-priority tiles may be starved on busy pages.", "Waiting for visible tiles before drawing vs drawing immediately: no flashes of blank content, but a slow tile delays the frame."],
    p: ["A tile waiting on a low-priority image decode blocks a visible tile.", "Cancelling raster for a tile that becomes visible again wastes work already done."],
    v: "Scroll quickly through content with many images and trace raster tasks. Visible tiles must complete before offscreen ones, and cancelled work must stop promptly.",
    dep: ["tiling", "gpu-raster", "image-decoding", "task-prioritization"]
  },
  "damage-tracking": {
    s: "Records which screen regions changed in a frame so that only those are redrawn and presented, saving power and bandwidth.",
    d: "As layers update, the compositor accumulates damage rectangles from changed tiles, moving layers and animated properties. At draw time it limits drawing to the union of those rectangles, and tells the window system which part of the surface changed, so the display can skip the rest. If nothing changed, no frame is produced. Complications include effects that read neighboring pixels, such as blur, which expand damage beyond the changed area, and buffer age, which determines how much prior damage must be redrawn.",
    k: ["Tracking damage vs redrawing the full frame: less GPU and display work on small changes, but bookkeeping and buffer-age handling add complexity.", "Union of rectangles vs list: simple and fast, but wastes area if two small changes are far apart."],
    p: ["Ignoring that a filter expands its footprint leaves seams around the damaged area.", "Wrong buffer age assumptions leave stale pixels from earlier frames."],
    v: "Update a small element each frame on a large page with damage rectangle visualization on. Only its area plus any effect expansion should be redrawn, and screenshots must match a full redraw.",
    dep: ["compositor-thread", "tiling", "frame-presentation"]
  },
  "frame-presentation": {
    s: "Submits the compositor's finished frame to the display system and handles timing, acknowledgments, and latency reporting.",
    d: "A frame consists of draw instructions for tiles and surfaces. It is submitted to a display component that aggregates surfaces from all producers, such as embedded frames, draws them, and swaps buffers at the display refresh. The engine receives acknowledgments for each begin-frame signal, and presentation feedback with the actual display time. It uses this to pace the next frames, throttle when behind, and measure latency. Hard parts are staying in sync with the display's refresh, handling variable refresh rates, and not building up a queue of frames that adds latency.",
    k: ["Limiting frames in flight vs pipelining deeply: lower input latency, but less tolerance for a slow frame.", "Presenting on the vsync signal vs as soon as ready: no tearing, but a missed deadline waits a full interval."],
    p: ["Submitting more frames than the display consumes grows a queue and adds latency.", "Presenting a frame built from a stale commit shows old content right after a state change."],
    v: "Record presentation timestamps for a steady animation. Frames must arrive at display intervals, with latency from input to presentation inside the budget, and no growth in queued frames.",
    dep: ["compositor-thread", "damage-tracking", "begin-frame"]
  },
  "animation-timelines": {
    s: "Provide the clock that animations follow, either document time or scroll progress, and compute each animation's current progress from it.",
    d: "An animation has an effect, a timing model of delay, duration, iterations and fill, and a timeline. The default timeline tracks document time, advancing once per frame, so all animations in a frame see the same time. Scroll and view timelines map progress to the scroll position of an element. Each frame, the engine samples active animations, computes progress and applies the resulting values in the cascade's animation origin. Play state, playback rate and finish promises are handled here. The hard part is keeping timing consistent between the main and compositor threads and avoiding work for inactive animations.",
    k: ["A single frame time for all animations vs per-animation clocks: synchronized animations and deterministic tests, but long frames delay everyone's progress.", "Scroll-driven timelines vs script listening to scroll: runs off the main thread and without jitter, but behavior is limited to what the timeline model expresses."],
    p: ["Reading the timeline mid-frame from script returns stale time and mismatched progress.", "Animations that are never cancelled keep the engine producing frames for invisible work."],
    v: "Start several animations with different delays and durations and sample their values on successive frames. Values must match timing function results at the frame time, with the same time for all animations in one frame.",
    dep: ["transitions-keyframes", "frame-lifecycle", "scroll-containers", "animation-frame-callbacks"]
  },
  "transitions-keyframes": {
    s: "Declarative animation: transitions interpolate between the old and new computed value after a change, and keyframes define multi-step animations.",
    d: "When a computed value changes and a transition is defined, the engine starts an animation from the old to the new value. Keyframe animations are defined by named rules with offsets and per-keyframe easing. Each sample interpolates values by type: numbers, lengths, colors, transforms, lists. Results enter the cascade above normal rules but below important ones. Animations affect style every frame, so they can trigger layout or paint depending on the property. The hard parts are interpolation of mismatched values, interruption and reversal mid-transition, and the cost of properties that need layout.",
    k: ["Interpolating computed values vs specified: stable results even when rules change, but values must be captured at the start and remain valid.", "Animating layout properties vs only compositor-friendly ones: any property can be animated, but those needing layout run every frame on the main thread."],
    p: ["Animating width or top triggers layout every frame and drops frames on complex pages.", "Reversing a transition without using its current progress makes it jump."],
    v: "Transition a property, interrupt it halfway and reverse it. The reverse must start from the current value with proportionally shortened time, and the per-frame stages run must match the property class.",
    dep: ["animation-timelines", "computed-style", "cascade-resolution", "compositor-animations"]
  },
  "compositor-animations": {
    s: "Runs eligible animations, mainly transform, opacity and filter, on the compositor thread so they stay smooth when the main thread is busy.",
    d: "An animation can move to the compositor if it only changes properties that the compositor can apply, the target is in its own layer or can be, and it does not depend on script. The main thread sends the animation's timing and keyframes, and the compositor takes over sampling each frame, updating property tree nodes. Start times are synchronized with the main thread's idea of time. When an animation finishes, or a conflicting change occurs, control returns. The hard parts are deciding eligibility, keeping the main thread's view of the animated value consistent, and fallback.",
    k: ["Offloading eligible animations vs running all on the main thread: animations survive jank, but only a limited property set qualifies and needs layers.", "Syncing start times through commit vs starting independently: aligned with other animations, but there is a one-frame delay to hand off."],
    p: ["An animation that silently falls back to the main thread because of an ineligible property stutters when script runs.", "Reading the animated value from script during compositor animation can show stale or interpolated values."],
    v: "Run a transform animation, block the main thread for a second, and record frames. The animation must continue at full rate, and an ineligible variant must visibly stall.",
    dep: ["transitions-keyframes", "property-trees", "layer-promotion", "compositor-thread"]
  },
  "scroll-containers": {
    s: "Elements that clip and scroll their content, tracking scroll offset and extent, and exposing it to layout, paint, script and the compositor.",
    d: "Overflow of auto or scroll makes a box a scroll container. Layout computes scrollable overflow from descendants' extents, and the scroll area bounds the offset. The offset is stored once and shared with paint, which applies it as a transform in the scroll property tree, and with the compositor, which can update it without the main thread. Script reads and writes it, and scroll events are fired once per frame. Nested scrollers hand off, with chaining and overscroll rules. The hard parts are offset ownership between threads, and consistent geometry with scrollbars and sticky content.",
    k: ["Offset owned by the compositor during gestures vs always by the main thread: smooth scrolling, but script reads may lag and sync is needed on commit.", "Scrollbars taking layout space vs overlay: classic layout with predictable room, but a width change if the type changes."],
    p: ["Programmatic scrolls racing with gestures can be overwritten by a stale offset on commit.", "Scrollable overflow computed without transforms of descendants gives wrong extent."],
    v: "Scroll nested containers by wheel and script while the main thread is idle and busy. Offsets reported must be consistent, chaining must follow rules, and scroll events must arrive once per frame.",
    dep: ["layout-tree", "property-trees", "threaded-scrolling", "scroll-anchoring"]
  },
  "scroll-anchoring": {
    s: "Adjusts the scroll offset when content above the viewport changes size, so what the reader is looking at stays in place.",
    d: "Before layout, the engine selects an anchor node in the viewport, such as the first visible element. After layout, it measures how the anchor moved and adds that difference to the scroll offset, cancelling the visual jump. Selection avoids nodes that are absolutely positioned or in suppressed subtrees, and anchoring is suppressed by user scrolling in progress or by author opt-out. The hard parts are heuristics for choosing a stable anchor, avoiding feedback loops with content that responds to scroll, and interactions with other scroll adjustments.",
    k: ["Automatic anchoring vs leaving shifts to authors: fewer jumps from late-loading content, but sometimes it moves content authors expected to stay.", "Anchoring on the first visible node vs on the deepest: stable and cheap vs more precise but slower to select."],
    p: ["A loop between anchoring and a scroll-triggered layout change makes the page drift continuously.", "An anchor inside content that is removed has no fallback and the view jumps."],
    v: "Scroll partway down a page and insert a tall element above the viewport. The visible content must stay at the same screen position, and the scroll offset must change by the inserted height.",
    dep: ["scroll-containers", "layout-invalidation", "hit-testing"]
  },
  "scroll-snap": {
    s: "Constrains scrolling to end at defined snap positions in a container, choosing the target by the gesture's direction and velocity.",
    d: "Snap areas on children define alignments with the container's snapport. After layout, the engine collects snap positions per axis. When a gesture ends, it predicts where it would land, picks the best snap position by proximity or direction, and animates to it on the compositor. Programmatic scrolls and keyboard navigation also snap. Positions must be recomputed when layout changes, with an attempt to stay on the same snap area. Hard parts are matching platform feel for fling and choosing between mandatory and proximity behavior.",
    k: ["Mandatory vs proximity snapping: predictable stops, but a very tall item can become unreachable inside, while proximity leaves free scrolling near edges.", "Computing snap positions from layout each time vs caching: always current, but extra work after each layout."],
    p: ["Snap areas larger than the viewport trap users unless scrolling inside them is allowed.", "After a resize without recomputation, the container snaps to old positions."],
    v: "Flick through a carousel with mandatory snapping at several velocities and after resizing. The scroll must end exactly on a snap position in the direction of the flick, and stay on the same item after resize.",
    dep: ["scroll-containers", "threaded-scrolling", "layout-tree"]
  },
  "threaded-scrolling": {
    s: "Handles scroll gestures on the compositor thread, using a cached hit-test of scrollable regions, and falls back to the main thread when script must be consulted.",
    d: "The compositor knows which regions have scroll handlers, are scrollable, or have listeners that may cancel. For a gesture it finds the scroller, then scrolls immediately and tells the main thread afterward, unless a blocking listener region contains the touch, in which case it waits. Fling momentum is simulated there too. Main-thread-dependent behavior, such as scroll-linked effects through script, lags by a frame or more. The hard parts are keeping the region information fresh, and correct fallbacks when handlers appear after the cache was built.",
    k: ["Compositor scrolling with passive listeners vs main-thread scrolling: no jank when script is busy, but handlers cannot prevent scrolling unless the region is registered.", "Pre-computed non-fast regions vs asking on each gesture: instant start, but the data can be stale after layout changes."],
    p: ["Content whose region information is outdated is scrolled by the compositor against the author's intent.", "Scroll-linked script effects look jerky because they run behind compositor offsets."],
    v: "Scroll with the main thread blocked, with and without a blocking handler in the region. Scrolling must be smooth in the first case and held until the handler runs in the second.",
    dep: ["scroll-containers", "compositor-thread", "input-event-intake", "hit-testing"]
  },
  "sticky-positioning": {
    s: "Keeps an element in place within its scroll container's viewport between constraints, switching between normal flow position and a pinned one as the user scrolls.",
    d: "A sticky box lays out in flow, and then its offset is adjusted by the scroll position within limits: its containing block's edges and the sticky insets. The adjustment is computed from the scroll offset after layout, and applied as a transform in the property trees, so the compositor can update it during scrolling without the main thread. The box's constraint rectangles must be computed from layout results and updated on changes. Hard parts are the dependence on the nearest scroller, nested stickies, and the interaction with layout shifts and containment.",
    k: ["Compositor-applied sticky offsets vs main-thread updates: pinned elements stay in sync with scroll, but layout must provide constraints to the compositor.", "Sticky as paint-time offset vs layout-time shift: no relayout on scroll, but the box keeps its original space and can overlap content."],
    p: ["A parent with overflow hidden between the sticky box and its scroller makes it silently non-sticky.", "Sticky elements whose constraints are stale after layout jump away from the correct place."],
    v: "Scroll a long list with sticky headers, nested stickies and a main thread blocked by script. Headers must stay pinned smoothly and be pushed out by the next one at the container's end.",
    dep: ["scroll-containers", "property-trees", "positioned-boxes"]
  },
  "frame-lifecycle": {
    s: "The fixed sequence of stages in one rendering update: script and animation callbacks, style, layout, paint, compositing preparation, and commit.",
    d: "A frame starts with a begin-frame signal. The main thread runs timers and input, then animation callbacks, then updates in order: style recalculation, layout, pre-paint to build property trees, paint to record display lists, and commit to the compositor. Each stage runs only if its input is dirty, and each can be forced early by a read. Each stage's output is the next one's input, and dirty bits record who needs what. The hard part is the discipline of one direction: a stage that invalidates an earlier one causes a loop of repeated work.",
    k: ["A fixed stage order with dirty flags vs fully lazy pull evaluation: predictable cost and clean caching, but a stage that reaches back forces an early rerun.", "Running all stages every frame when dirty vs spreading across frames: freshness each frame, but a long frame blows the budget."],
    p: ["An observer or script that changes layout after paint forces a second update and a longer frame.", "Skipping a stage whose dirty flag was not set because of a bookkeeping bug leaves old pixels."],
    v: "Trace one frame with a small DOM change. Style, layout, paint and commit durations must each appear once and be proportional to the change, and clean stages must be absent.",
    dep: ["animation-frame-callbacks", "style-invalidation", "layout-invalidation", "paint-invalidation", "main-thread-commit"]
  },
  "begin-frame": {
    s: "The periodic signal tied to the display refresh that tells the main thread and compositor to produce a frame, carrying a time and a deadline.",
    d: "The display side issues a begin-frame with a frame time, a deadline and an interval. The compositor receives it, and if the main thread has pending visual updates or animation callbacks, forwards it. Each participant answers with an acknowledgment whether or not it produced a frame, so the display knows when to stop waiting. If there is nothing to render, the stream is stopped to save power, and restarts when something becomes dirty. Hard parts are variable refresh rates, multiple displays, and skipping frames when the main thread is late.",
    k: ["Demand-driven signals vs always ticking: saves power when idle, but each invalidation needs a request that starts the loop.", "Giving the main thread a deadline vs unlimited time: bounded latency, but late work misses the frame and waits for the next."],
    p: ["A missed request leaves the page stuck without frames until something else wakes it.", "Using local timers instead of the signal makes animations drift from the display."],
    v: "Log begin-frame and acknowledgment events on an idle page and during animation. The stream must stop when idle, restart within one interval of a change, and match the display's rate.",
    dep: ["frame-presentation", "compositor-thread", "main-thread-commit"]
  },
  "animation-frame-callbacks": {
    s: "Script callbacks that run once per frame just before style and layout, giving code a safe point to update visuals in sync with the display.",
    d: "On each rendering opportunity, the engine runs the queued callbacks with the frame time, in registration order. Callbacks registered during a run wait for the next frame. After them, the observers and then style, layout and paint run. Because callbacks run at the start, writes they make are batched into the same frame's update. They are skipped when the page is hidden, so they stop animations. Hard parts are cost of long callbacks, which delay the frame, and not mixing reads and writes within them, which would force layout repeatedly.",
    k: ["Once-per-frame callbacks before style vs timers: aligned with the display and batched writes, but suspended in hidden pages.", "A shared frame time for all callbacks vs per-call timestamps: consistent animation state, but not suitable for measuring elapsed work."],
    p: ["Reading layout, then writing, in each callback forces a layout for every callback.", "Assuming callbacks run in hidden pages leaves logic stalled until the page returns."],
    v: "Register several callbacks and log their times across frames. They must run once per frame in order, share a timestamp, and stop while the page is hidden.",
    dep: ["frame-lifecycle", "animation-timelines", "visibility-throttling", "forced-layout"]
  },
  "main-thread-commit": {
    s: "Copies the main thread's new layer, property and display list data to the compositor in one atomic step, briefly synchronizing the two threads.",
    d: "After paint, the main thread sends the changed layer properties, property trees and display lists to the compositor. During the commit, the main thread is blocked while data is copied or swapped, so the compositor sees a consistent snapshot. Afterward, the compositor works from its copy, and the main thread may begin the next frame. Compositor-owned state, such as scroll offsets, is merged back. Commit duration adds directly to main-thread time, so it must be proportional to what changed. It is hard because correctness requires atomicity and performance requires doing very little inside the lock.",
    k: ["A blocking commit vs a lock-free handoff: simple and consistent, but adds main-thread latency, which must be kept small.", "Incremental commits of changed data vs full tree copies: cost proportional to change, with bookkeeping on what changed."],
    p: ["A commit of large display lists with no sharing makes each frame cost more than the work that created them.", "Merging compositor state incorrectly reverts a scroll in progress."],
    v: "Trace commit durations on frames with small and large changes. Commit time must scale with the amount changed, and scroll offsets updated during the commit window must not revert.",
    dep: ["layer-tree", "display-lists", "property-trees", "compositor-thread"]
  },
  "render-blocking": {
    s: "Rules for what must be loaded before the first rendering update, such as critical style sheets and fonts, and when first paint is allowed.",
    d: "The engine holds the first rendering opportunity until resources marked render-blocking are ready, mainly style sheets in the head, and optionally scripts and a declared set of elements. It also waits for the body to exist, or for a timeout. After that, it may paint partial content as the parser continues. Metrics track the first paint and largest content paint. The aim is to avoid flashes of unstyled content without waiting for everything. The hard parts are deciding blocking sets, and tuning timeouts so a slow resource cannot hold the page forever.",
    k: ["Blocking first paint on critical styles vs painting immediately: no unstyled flash, but a slow sheet delays everything.", "A timeout on blocking resources vs waiting indefinitely: pages always show eventually, but could show unstyled content when the timeout fires."],
    p: ["Putting a large sheet that is not needed for first view in the head delays first paint.", "Late-discovered blocking resources restart the wait after the page has begun to show."],
    v: "Load a page with a slow critical sheet and a slow non-critical one, and capture frames. First paint must wait for only the critical one, and its time must match the metric reported.",
    dep: ["stylesheet-loading", "parser-blocking-scripts", "frame-lifecycle", "web-font-loading"]
  },
  "visibility-throttling": {
    s: "Reduces or stops rendering and timers for pages and frames that are hidden, occluded or off-screen, to save power and give resources to visible content.",
    d: "Visibility states come from the shell: visible, hidden, occluded. When hidden, begin-frame stops reaching the page, animation callbacks stop, timers are throttled to a low rate, and decoded images and tiles are released. Cross-origin frames that are scrolled out of view may be throttled independently. When the page becomes visible again, the engine restores state and schedules a frame. The tricky parts are work that must continue, such as audio and network handling, and noticing visibility changes quickly enough to avoid showing stale frames.",
    k: ["Stopping rendering for hidden pages vs continuing at low rate: large power savings, but state that depends on animation callbacks stops advancing.", "Releasing memory on hide vs keeping it: lower footprint, but a slow first frame on return."],
    p: ["Code that depends on timers or frames for correctness breaks in hidden pages.", "Frames throttled while actually visible, due to a wrong occlusion signal, look frozen."],
    v: "Hide a page running animations and timers and log activity. Animation callbacks must stop, timers fall to the throttle rate, and on showing again the first frame must appear within one interval.",
    dep: ["begin-frame", "timers-and-idle", "animation-frame-callbacks", "decoded-image-cache"]
  },
  "task-prioritization": {
    s: "Chooses which main-thread task runs next, giving input and rendering priority over background work and avoiding starvation.",
    d: "Tasks are posted to queues by source and type, each with a priority. The scheduler picks the highest-priority ready task, boosts rendering when a frame is due, and gives input high priority while a gesture is active. Background tasks such as timers and idle work run when higher classes are empty, and are aged to avoid starvation. Long tasks are measured. The scheduler may also use frame deadlines to decide whether to run more tasks before the next frame. Hard parts are tuning policy for different workloads and the fact that tasks cannot be preempted.",
    k: ["Priority queues with aging vs strict priorities: the interactive work wins, but low-priority work is delayed predictably instead of starved.", "Splitting work into small tasks vs one big task: responsiveness improves, but total throughput drops slightly and logic is more complex."],
    p: ["A priority assigned too high to a chatty source starves input.", "A task longer than a frame delays rendering and input however well the scheduler works."],
    v: "Run a page with continuous timers and a busy script and measure input latency. Input events should run before queued timers, and no queue should wait longer than its aging bound.",
    dep: ["event-loop-tasks", "frame-lifecycle", "begin-frame"]
  },
  "incremental-invalidation": {
    s: "The shared design in which every stage records what changed and what it affects, so later stages redo only that part, rather than the whole page.",
    d: "Each stage has its own dirty bits and a way to propagate them: DOM mutations mark style, style diffs mark layout, layout changes mark paint, and paint changes mark compositor tiles. Each stage's boundary decides how far a mark travels, and caches such as style sharing, layout fragments, display items and raster tiles let unaffected parts be reused. The cost of a change is therefore proportional to its effect. The challenge is that every cache needs a precise, tested invalidation rule, and an error shows up only as stale pixels in some other case.",
    k: ["Conservative marking with broad boundaries vs precise tracking: simple and safe, but a small change can cost a large update.", "Per-stage dirty flags vs a global version number: precise reuse, but many places that must be kept consistent."],
    p: ["A single missed invalidation produces a visual bug that only appears after a specific sequence of edits.", "Over-invalidation hides in performance data, as everything works but each frame costs too much."],
    v: "Run randomized edit sequences on a page, and after each one compare the incrementally updated rendering with a fresh full render of the same state. Any difference identifies a missing invalidation.",
    dep: ["style-invalidation", "layout-invalidation", "paint-invalidation", "damage-tracking"]
  },
  "thread-ownership": {
    s: "The decision of which thread may read and write which data, with the main thread owning the document and other threads working on copies or immutable snapshots.",
    d: "The main thread owns the DOM, style and layout, which are mutable and not thread-safe. The compositor owns its layer copy and scroll and animation state. Raster, decode and parse helpers work on immutable inputs, such as display lists, compressed bytes and token buffers, and return results by message. Data crosses by commit or by posting tasks. The result is that most of the engine needs no locks, but anything shared has an explicit handoff. It is hard because every performance feature wants to move work off the main thread, and each move needs a clear owner.",
    k: ["Single-threaded document ownership vs fine-grained locking: simple and fast without locks, but the main thread is the bottleneck for script, style and layout.", "Immutable snapshots handed to workers vs shared mutable data: no races, but copying costs and results can be stale on arrival."],
    p: ["A worker holding a pointer into main-thread data after the document changes reads freed or modified state.", "Moving a stage to another thread without defining who owns its inputs leads to rare, hard-to-reproduce races."],
    v: "Run the full test suite and a stress page under a thread sanitizer. No data race may be reported, and handoff points must be the only places where data crosses threads.",
    dep: ["main-thread-commit", "compositor-thread", "image-decoding", "event-loop-tasks"]
  },
  "web-compatibility": {
    s: "The obligation to render existing pages exactly as other engines do, including quirks, error recovery and historical behavior, which constrains every design choice.",
    d: "Content is written against behavior, not specifications, so the engine must reproduce documented quirks, such as parsing recovery, quirks mode layout, and legacy properties. Standards bodies write specifications from observed behavior, and conformance suites shared among engines measure agreement. New features ship behind flags, are measured for usage, and can be removed only when usage is negligible. Interop issues are tracked as bugs. The cost is large amounts of special-case code, but the alternative is breaking pages. The hard part is deciding when a quirk can be dropped, since the evidence is only usage data.",
    k: ["Preserving quirks vs a clean behavior model: old pages keep working, but code carries permanent special cases.", "Shipping new features early behind flags vs waiting for specifications to settle: faster feedback from authors, but changes later can break pages that adopted them."],
    p: ["Fixing a behavior to follow the specification can break a popular site that depended on the old behavior.", "Divergent behavior in one engine becomes the de facto standard authors code against."],
    v: "Run the shared conformance suites and a corpus of real pages, comparing results with other engines. Differences must each be either an explained deliberate deviation or a tracked bug.",
    dep: ["tree-builder", "error-recovery", "block-formatting", "cascade-resolution"]
  },
  "privacy-and-isolation": {
    s: "The rules that stop a page, or content embedded in it, from learning things it should not, such as the user's history, other origins' data, or their machine's fonts.",
    d: "Several features leak by design and are limited. Visited-link styling is restricted so script cannot read history from computed style, and painting differs only in permitted properties. Cross-origin images, frames and fonts are opaque to script, and timing is coarsened. Geometry and hit tests do not cross into other origins' content. Fonts and other system details are limited to reduce fingerprinting. Out-of-process frames add hardware-level separation. The difficulty is that rendering is the natural side channel: any observable difference, from size to timing, may carry data.",
    k: ["Restricting what rendering exposes vs full fidelity: protects history and other origins, but removes legitimate capabilities and complicates some designs.", "Coarsened timers vs precise timers: less side-channel leakage, but harms precise performance measurement and some media timing."],
    p: ["A new styling feature that reads visited state without the restriction leaks browsing history.", "Layout or paint timing that varies with cross-origin content size reveals information about it."],
    v: "Attempt to infer visited links through computed style, geometry and timing from script on a test page. All results must be identical for visited and unvisited links.",
    dep: ["embedded-surfaces", "font-matching", "cssom", "hit-testing"]
  },
  "memory-and-lifetime": {
    s: "How the engine keeps its large, interlinked object graphs, shared with script, from leaking or being freed while still in use, and keeps footprint bounded.",
    d: "The engine holds several large graphs: DOM nodes, computed styles, layout boxes, fragments, display lists, decoded images and tiles. Some are owned by the document and freed with it, some are reference-counted, and some are traced by the script collector. Caches have budgets and eviction. Memory pressure signals shrink them. Memory use scales with page complexity and screen size, such as tiles and decoded images. The hard parts are cross-heap cycles with script, detached trees kept alive by one reference, and finding where memory actually went.",
    k: ["Garbage-collected objects with tracing vs reference counting: cycles are collected and ownership is simpler, but pauses and tracing code must be managed.", "Hard budgets with eviction vs unbounded caches: footprint is predictable, but eviction causes recomputation, visible as jank."],
    p: ["A detached subtree retained by one closure leaks everything it references, including styles and images.", "Budgets tuned for one device class cause thrash on a different one."],
    v: "Open and navigate through many pages, then force collection and compare memory at the start and end. It must return to a baseline within tolerance, and no detached document may remain.",
    dep: ["node-wrappers", "decoded-image-cache", "tiling", "computed-style"]
  },
  "performance-budgets": {
    s: "The per-frame and per-interaction time limits that each stage must stay within, which drive where the engine adds caching, parallelism and approximation.",
    d: "At sixty frames a second the whole frame has about sixteen milliseconds, and input responses should land in about a hundred. Stages share this: script, style, layout, paint and commit on the main thread, with the compositor having its own deadline. Instrumentation records per-stage times, long tasks, layout shifts and dropped frames, from both lab traces and field data. Budgets guide choices such as skipping work, lowering raster quality while scrolling, or spreading work over frames. The hard part is that cost depends on content, so the worst page, not the average, sets the design.",
    k: ["Strict per-stage budgets vs best-effort: bounded latency and clear priorities, but work that cannot fit must be deferred or degraded.", "Lab benchmarks vs field data: repeatable measurements vs real devices and content, which differ by orders of magnitude."],
    p: ["Optimizing the average frame while ignoring the slowest ones leaves visible jank at exactly the worst moments.", "Instrumentation that costs too much changes the thing being measured."],
    v: "Record frame times for scripted interactions on a mid-range device with a large page. The ninety-fifth percentile frame must stay inside the budget, and every longer frame must be attributable to a named stage in the trace.",
    dep: ["frame-lifecycle", "task-prioritization", "layout-caching", "raster-scheduling"]
  },
});
