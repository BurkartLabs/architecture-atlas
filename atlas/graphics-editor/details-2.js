// Details for the graphics editor plate, part 2: tools, input, panels and navigation.
ATLAS.details("graphics-editor", {
  "pointer-event-pipeline": {
    s: "The path from raw mouse, pen and touch events to normalized pointer events with document coordinates, timestamps and capture, delivered to the active tool.",
    d: "The platform delivers events with device coordinates, buttons, modifiers and, for pens, pressure and tilt. The pipeline converts them to canvas coordinates through the current viewport transform, merges coalesced intermediate samples so fast strokes are not jagged, and assigns pointer capture so a drag continues outside the canvas. It also orders events so a tool never sees a move before its down. It is hard because high-rate pens deliver far more samples than frames, because coordinates change while the viewport pans mid-drag, and because browsers and platforms report the same hardware differently.",
    k: ["Processing every coalesced sample vs one event per frame: all samples give smooth brush strokes, but add load to the main thread.", "Converting to document coordinates early vs late: early is simple for tools, but a pan during a drag then needs corrections."],
    p: ["Dropping intermediate pen samples makes fast strokes polygonal, and the flaw appears only on high-refresh tablets.", "Losing pointer capture on leaving the window leaves a tool stuck in a drag state."],
    v: "Draw a fast circle with a pen and drag a shape past the window edge. Confirm the stroke has all hardware samples at the original rate and the drag continues, then ends cleanly on release outside.",
    dep: ["canvas-viewport", "coordinate-spaces-and-transforms"]
  },
  "pen-and-pressure-input": {
    s: "Handling of stylus data (pressure, tilt, rotation, hover, barrel buttons, eraser end) and its mapping to brush parameters through adjustable response curves.",
    d: "Pen events carry pressure from zero to one, tilt angles and sometimes rotation and speed. A response curve maps raw pressure to size, opacity or flow, since pens differ in their light-touch behavior. Hover events show a brush cursor before contact. Tablets may report in higher resolution than the screen, so positions are kept fractional. It is hard because drivers differ, because some platforms report pen input as a mouse unless a specific path is used, and because latency between the pen and the visible stroke must stay small for painting to feel right.",
    k: ["User-editable pressure curves vs fixed mapping: editable curves fit any pen and hand, but add setup that casual users never touch.", "Predicting the next stroke point vs showing only real points: prediction hides latency, but briefly draws marks that the real data contradicts."],
    p: ["A driver reports pressure as 1.0 for every point and strokes have no variation until the input path is changed.", "Tilt is applied in screen space, so rotating the canvas flips shading."],
    v: "Draw a stroke from light to heavy pressure with each supported pen and confirm width and opacity follow the configured curve without a jump at stroke start, and the barrel button switches to the eraser.",
    dep: ["pointer-event-pipeline", "brush-engine"]
  },
  "touch-and-gestures": {
    s: "Multi-touch input for navigation and editing: pinch zoom, two-finger pan and rotate, tap shortcuts, with rules to tell a gesture from a drawing touch.",
    d: "Touches are tracked by identifier and grouped into gestures. One finger or pen draws or selects; two fingers navigate the viewport; a quick multi-finger tap triggers undo or redo. Palm rejection ignores large or accidental contacts while a pen is active. Gesture recognizers run before tools receive events and can cancel a tool's stroke already in progress. It is hard because the same first touch can start a drawing or a pan, so tools need cancel and rollback, and because browsers add their own scrolling and zoom behaviors that must be disabled on the canvas.",
    k: ["Recognizing gestures with a delay vs acting immediately and canceling: delay feels sluggish, while cancel and rollback is responsive but complex to undo cleanly.", "Palm rejection by contact size vs by pen presence: size works without a pen but misfires on large fingers."],
    p: ["The first finger of a two-finger pan leaves a stray dot because the tool already committed a stroke.", "Browser pinch zoom fights the canvas gesture and scales the whole interface."],
    v: "On a tablet, rest a palm and draw with a pen, then pinch and pan with two fingers. Confirm no stray marks appear, the viewport follows the fingers smoothly, and a two-finger tap undoes one step.",
    dep: ["pointer-event-pipeline", "canvas-viewport", "tool-state-machine"]
  },
  "tool-state-machine": {
    s: "The controller that holds the active tool, routes events to it, handles temporary tool switches and modifier keys, and guarantees that an interrupted gesture ends cleanly.",
    d: "Each tool is a state machine with states such as idle, hovering, dragging and committing, and handlers for pointer, key and modifier events. A manager switches tools, supports temporary overrides like holding a key for the hand tool, and cancels the current gesture on escape or focus loss. A tool edits the document only through the command system, usually inside one transaction per gesture. It is hard because many tools share conventions yet differ in detail, and because collaborators' changes can delete the node being edited in the middle of a drag.",
    k: ["Tools as isolated state machines vs one monolithic input handler: isolated tools are testable and extensible, but shared behaviors must be factored deliberately.", "Live preview by mutating the document vs by drawing an overlay: mutation is faithful but syncs noise; overlay is cheap but can disagree with the result."],
    p: ["A remote user deletes the node being dragged and the tool keeps writing to a missing id.", "Switching tools mid-gesture commits half an edit as its own undo step."],
    v: "Start a drag, press escape, then start another and alt-tab away. Confirm both gestures cancel with the document unchanged, and the undo stack has no entries from either.",
    dep: ["command-system", "pointer-event-pipeline", "transaction-coalescing"]
  },
  "hit-testing": {
    s: "Finding which node or handle lies under a point or inside a region, accounting for transforms, strokes, clipping, hidden layers and tolerance in screen pixels.",
    d: "Hit testing walks the scene graph from the top of the z-order down, transforms the point into each node's local space and tests against its geometry. Vector shapes test against fills and stroke outlines with a tolerance that is constant in screen pixels, not in document units. Spatial indexes such as bounding volume trees avoid visiting every node. Locked, hidden and masked nodes are excluded or included by mode. It is hard on huge documents, on rotated and skewed nodes, on text and image alpha, and when selecting deep inside a nested group is wanted.",
    k: ["Geometric hit testing vs picking from a rendered id buffer: geometric is exact and cheap to update, while buffer picking matches pixels exactly but needs a render pass.", "Selecting the top group first vs the deepest node: group-first avoids accidents, deepest-first speeds detailed edits."],
    p: ["A tolerance specified in document units makes thin lines impossible to click when zoomed out.", "The spatial index is rebuilt after every move, making drags on large files stutter."],
    v: "On a file with 100,000 nodes, hover over a thin diagonal line at 10 percent and 800 percent zoom. Confirm the line is hit at both zooms within the same pixel tolerance, in under a few milliseconds.",
    dep: ["scene-graph", "coordinate-spaces-and-transforms", "curve-intersection"]
  },
  "selection-and-marquee": {
    s: "Maintaining the set of selected nodes, with click, shift, marquee and select-similar behaviors, and exposing it to tools, panels and collaborators.",
    d: "Selection is a set of node ids held in session state, separate from the document. Click selection uses hit testing; marquee selection collects nodes intersecting or fully inside a region, scoped to the current container. Operations such as select same fill or select parent change the set by property or structure. The selection feeds the property inspector, transform handles and clipboard, and is broadcast so others see what you have selected. It is hard because selected ids can disappear under remote edits, and because selection across different containers needs defined semantics.",
    k: ["Marquee on intersect vs on containment: intersect is forgiving but over-selects; containment is precise but needs a bigger drag.", "Selection stored in the document vs per session: per session avoids conflicts, but loses selection across reloads."],
    p: ["A remote deletion leaves a stale id in the selection and the inspector shows a blank panel.", "Marquee selection reaches into locked and hidden layers and moves them."],
    v: "Marquee across a frame holding groups and a locked layer. Confirm only unlocked top-level children of the current container are selected, and deleting one from another client updates your selection.",
    dep: ["hit-testing", "node-identity-and-references", "presence-and-cursors"]
  },
  "transform-handles": {
    s: "The on-canvas controls for moving, scaling, rotating and skewing the selection, with modifier behaviors for aspect ratio, center origin and numeric feedback.",
    d: "Handles are drawn on an overlay at the selection's bounding box, in screen space so they keep a constant size. Dragging a handle computes a new transform in the selection's coordinate space and applies it to every selected node, respecting each node's constraints and parent layout. Modifiers lock aspect ratio, scale from the center or snap rotation to steps. Live dimensions are shown near the cursor. It is hard because nested rotated parents, non-uniform scale of strokes and text, and multi-selection with mixed rotation all need defined rules, and because auto layout may override the requested size.",
    k: ["Scaling strokes and effects with the shape vs leaving them fixed: scaling preserves appearance, fixed values preserve design intent such as one-pixel lines.", "Bounding box in parent space vs aligned to the node's rotation: rotated boxes feel natural for one node, but are confusing for mixed selections."],
    p: ["Scaling a rotated group applies skew to children because transforms were combined in the wrong order.", "Resizing a child of an auto layout frame snaps back, leaving people unsure why."],
    v: "Select a rotated group with text and a stroked shape, drag a corner with the aspect modifier, and confirm proportions hold, strokes follow the chosen rule and the live size label matches the inspector after release.",
    dep: ["coordinate-spaces-and-transforms", "constraints", "auto-layout", "overlay-renderer", "snapping-and-guides"]
  },
  "snapping-and-guides": {
    s: "Magnetic alignment of moving objects to edges, centers, spacing, grids, guides and pixel boundaries, with visible indicators of what was matched.",
    d: "While dragging, the editor collects snap candidates from nearby nodes (edges, centers, equal spacing), the grid, user guides and the pixel grid, then finds the closest within a threshold in screen pixels. It adjusts the drag delta and draws lines showing the matches. Candidate gathering uses a spatial index to stay fast on big files, and considers only visible, relevant nodes. It is hard because snapping must feel predictable, not magnetic everywhere, because matching equal spacing needs combinatorial search, and because results must stay consistent between zoom levels.",
    k: ["Threshold in screen pixels vs document units: screen pixels feel constant at every zoom, but give different results for the same document positions.", "Snapping to all nodes vs only siblings and parent: all nodes is powerful but noisy; limited scope is calmer but misses cross-container alignment."],
    p: ["Computing candidates from every node each frame makes dragging stutter on large files.", "Snapping to hidden or off-canvas layers pulls objects toward targets nobody can see."],
    v: "Drag a box near two others with equal gaps. Confirm it snaps to equal spacing at its threshold, shows both distance indicators, and a held modifier disables snapping entirely.",
    dep: ["hit-testing", "overlay-renderer", "scene-graph"]
  },
  "pen-path-tool": {
    s: "The interactive tool for drawing and editing vector paths: placing anchors, dragging handles, converting corners to curves, joining, closing and cutting segments.",
    d: "Clicks place anchor points; click-drag pulls out Bézier handles for smooth anchors. Hovering over a segment offers to add a point, over an anchor to delete or convert it. Edits run through path editing operations on the path model while the tool draws a live preview of the next segment. Keyboard modifiers break handle symmetry, constrain angles or move the anchor under the cursor. It is hard because the tool has many small modes that depend on what is under the pointer, and because every edit must produce a valid, minimal path.",
    k: ["Mirrored handles by default vs independent handles: mirrored is faster for smooth shapes, independent allows corners and asymmetric curves with more steps.", "Editing paths as points vs as a vector network: points are familiar and match file formats, networks allow branching shapes but complicate export."],
    p: ["Hit areas for anchors and handles overlap at low zoom and the wrong one is dragged.", "Closing a path creates a duplicate end point on top of the start, producing a notch when stroked."],
    v: "Draw a heart with five anchors, convert two to corners, add a point on a segment and join to close. Confirm the exported path has no duplicate points and the stroke has no gap or notch at the join.",
    dep: ["path-editing-ops", "path-model", "hit-testing", "tool-state-machine"]
  },
  "brush-and-eraser-tools": {
    s: "The painting tools that convert a pen or mouse stroke into brush stamps on a raster layer, or into a smoothed vector stroke, with live smoothing, size and hardness controls.",
    d: "A stroke is a sequence of input samples with pressure and tilt. The tool smooths them with a stabilizer, fits a curve through the samples, and feeds the brush engine, which stamps along that curve at a set spacing. Eraser mode reduces alpha instead of adding color. On vector layers the same input is simplified into editable path points. Size, hardness, flow and blend options come from the active brush preset. It is hard because latency, smoothing and accuracy conflict, and because a stroke must be committed as one undo step even when thousands of stamps were painted.",
    k: ["Stabilizing by lagging behind the pen vs by averaging recent points: lag gives very smooth lines but feels delayed; averaging is quicker but wobbles more.", "Painting directly into the layer vs into a temporary stroke buffer: a buffer allows opacity caps and cancel, at the cost of an extra composite."],
    p: ["Stroke opacity applies per stamp instead of per stroke, so overlaps darken into blotches.", "A cancelled stroke leaves partial pixels because stamps were written to the layer directly."],
    v: "Paint a looping stroke over itself at 50 percent opacity with each smoothing level. Confirm overlaps stay uniform when the cap is on, escape removes the stroke entirely, and undo removes it in one step.",
    dep: ["brush-engine", "pen-and-pressure-input", "tiled-image-store", "tool-state-machine"]
  },
  "layers-panel": {
    s: "The tree view of the scene graph: names, visibility, locks, nesting and drag-to-reorder, kept in step with the canvas and selection at all times.",
    d: "The panel renders the node tree with expandable containers, thumbnails, visibility and lock toggles, and highlights the current selection. Dragging a row changes order or parent through commands. Search filters by name, type or property. It virtualizes rows because documents can have hundreds of thousands of nodes, and updates incrementally from change events rather than rebuilding the list. It is hard because remote edits reorder the tree while the user is dragging, and because thumbnails and expansion state for huge trees can dominate memory and time.",
    k: ["Virtualized rendering of visible rows vs a full DOM tree: virtualization scales to huge files, but complicates keyboard navigation and accessibility.", "Auto-generated thumbnails vs icons only: thumbnails help recognition, but need render work for each row."],
    p: ["A remote reorder during a drag drops the item in the wrong parent.", "Expanding a folder with 50,000 children freezes the editor while rows are created."],
    v: "Open a file with 200,000 nodes, expand the largest container and drag a row to another parent while a collaborator reorders siblings. Confirm scrolling stays smooth and the drop lands where the indicator showed.",
    dep: ["scene-graph", "change-tracking", "selection-and-marquee", "command-system"]
  },
  "property-inspector": {
    s: "The context panel that shows and edits the properties of the selection: position, size, fills, strokes, effects, text, layout and component settings, including mixed values.",
    d: "The inspector reads the selection's properties through the property model and shows controls suited to the types selected. When values differ across the selection it shows a mixed state, and an edit writes to all. Numeric fields accept expressions and units and scrub by dragging. Edits are committed as commands, with typing grouped so one change is one undo step. Variable and style bindings appear beside the value they control. It is hard because panels are dynamic across node types, and because live edits from others must update fields without overwriting what someone is typing.",
    k: ["Writing each keystroke live vs on commit: live gives instant feedback but floods sync and history; commit is calm but delays preview.", "A panel per node type vs a generic property-driven panel: generic scales to new properties automatically but is less tailored."],
    p: ["A remote update overwrites a field while its owner is typing in it.", "Editing a mixed value writes the displayed average to every node instead of the typed number."],
    v: "Select three rectangles with different corner radii, confirm the field shows mixed, type 8 and press enter. Confirm all three have radius 8 and undo restores each original value in one step.",
    dep: ["property-model", "command-system", "selection-and-marquee", "variables-and-design-tokens"]
  },
  "canvas-viewport": {
    s: "The camera over the document: zoom, pan and rotate state, the transform between screen and document space, and the policies that keep navigation smooth and bounded.",
    d: "The viewport holds an offset, a scale and optionally a rotation, and exposes functions that convert between coordinate spaces. Zoom is anchored at the pointer; scroll wheel, trackpad pinch, keyboard and fit-to-selection all feed one animation controller. Visible bounds drive what the renderer draws and what panels show. Zoom limits and precision matter, since extreme zoom pushes coordinates beyond float accuracy. It is hard to keep navigation at full frame rate on huge files and to treat wheel, trackpad and gesture events consistently across devices.",
    k: ["Zooming by multiplicative steps vs by exact percentages: multiplicative feels smooth, exact percentages are predictable for pixel work.", "Floating origin vs fixed origin: a floating origin keeps precision at extreme zoom but complicates every conversion."],
    p: ["Trackpad pinch and wheel events are conflated, so a two-finger scroll zooms instead of panning.", "At very high zoom, positions jitter because coordinates exceed single-precision accuracy."],
    v: "Zoom from 2 percent to the maximum on a point of interest with a wheel and a trackpad. Confirm the point stays under the cursor, edges do not jitter, and fit-to-selection lands exactly on the bounds.",
    dep: ["coordinate-spaces-and-transforms", "numeric-precision", "level-of-detail"]
  },
  "color-picker-and-eyedropper": {
    s: "The control for choosing colors in several models and spaces, sampling from the canvas or screen, and editing gradient stops, with gamut awareness.",
    d: "The picker shows a color in models such as hue-saturation-brightness, lightness-chroma-hue or channel values, with numeric entry and opacity. Values are stored in the document's color space and converted for display. The eyedropper samples from the rendered canvas, from a flattened image layer or from anywhere on screen, returning either the displayed value or the underlying color. Warnings show when a color is outside the working or print gamut. It is hard because a picker in one color space must edit values stored in another without drift, and sampling reads display-converted pixels that differ from document values.",
    k: ["Sampling the composited display color vs the layer's own color: composited is what you see, but includes effects and blend math that the source color lacks.", "A perceptual picker model vs a device model: perceptual makes lightness predictable, but values differ from what developers know."],
    p: ["Sampling from the display returns a value converted to the monitor profile and is then stored as if it were in the document space.", "Round-tripping through hex rounds wide-gamut colors and loses saturation."],
    v: "Pick a vivid wide-gamut color, apply it, sample it again with the eyedropper and compare channel values. Confirm they match within one unit in the document space and an out-of-gamut warning appears for the print target.",
    dep: ["color-profile-handling", "working-space-and-bit-depth", "paint-model"]
  },
  "commands-and-shortcuts": {
    s: "The registry of named actions that menus, toolbars, shortcuts, the command search and plugins all invoke, with context rules for when each action is available.",
    d: "Every action has an id, a label, an enabled predicate over the current selection and tool, and a handler. Keyboard shortcuts bind to ids per layout, can be customized and may be chords. A searchable palette lists commands and recent items. Menus are built from the registry rather than hand-coded. Handlers run inside the command system so they are undoable and synced. It is hard because shortcuts differ across keyboard layouts and platforms, because text fields must take keys before global actions, and because plugin commands can collide with built-in ones.",
    k: ["Physical key bindings vs character bindings: physical positions keep tool groups together across layouts, while characters keep mnemonics.", "A single registry vs per-surface actions: one registry keeps behavior consistent, but forces every surface to share enabled rules."],
    p: ["A shortcut fires while the user types in a text field and deletes the selected layer.", "A plugin registers a shortcut that shadows a built-in one on only some keyboard layouts."],
    v: "Open the palette, run a command by name, then invoke it by shortcut and from the menu on two keyboard layouts. Confirm each path produces an identical edit and one undo step, disabled commands are grayed consistently.",
    dep: ["command-system", "tool-state-machine"]
  },
});
