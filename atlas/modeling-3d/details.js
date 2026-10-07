// Details for the 3D modeling tool plate, part 1: workspace, selection and edit tools, scripting.
ATLAS.details("modeling-3d", {
  "window-area-system": {
    s: "Divides the application window into resizable areas, each hosting one editor type such as viewport, timeline or node editor, and saves the arrangement as a workspace.",
    d: "A window holds a tree of screens, each split into areas, and each area holds a space: the state of one editor instance. Areas have regions for header, tool shelf, main content and sidebars. The window system routes events to the area under the pointer, schedules redraws only for areas marked dirty, and serializes layouts into the document. It is hard because many areas show the same data, so a change in one must invalidate exactly the others that depend on it.",
    k: ["Area-based tiling vs free-floating windows: tiling keeps every editor visible and predictable, but small screens and multi-monitor setups need detachable windows that complicate event routing.", "Per-area redraw flags vs redraw everything: flags save work on large scenes, but a missed notification leaves a stale panel on screen."],
    p: ["A space with state tied to a deleted object keeps a dangling pointer and crashes when the area redraws.", "Layouts saved in the document override the user's preferred workspace when a colleague opens the file."],
    v: "Open the same scene in two viewports, move an object in one, and confirm the other redraws in the same frame while an unrelated timeline area is not redrawn, visible in a redraw counter.",
    dep: ["widget-layout", "input-keymaps", "platform-windowing"]
  },
  "widget-layout": {
    s: "Builds panels and buttons from declarative descriptions, handles layout, drawing and text input, and keeps controls scaled correctly on any display density.",
    d: "Panels are written as functions that emit rows, columns and buttons bound to properties. A layout pass measures widgets and places them; a draw pass renders them through the same GPU layer as the viewport. Buttons read and write properties through the reflection system, so a drag on a slider changes data and triggers undo. Hard parts include text shaping for many scripts, display scaling, tooltips, and keeping layout fast when a panel shows thousands of rows.",
    k: ["Immediate-style rebuild each redraw vs retained widget tree: rebuild is simple and always matches data, but long lists need clipping and virtualization to stay fast.", "Own toolkit vs native OS controls: an own toolkit looks identical everywhere and can embed viewports, but loses accessibility and system text input behaviors."],
    p: ["Fixed pixel sizes make panels unreadable on high-density displays or after the user changes interface scale.", "Text fields that ignore input-method composition break entry for languages that need it."],
    v: "Set interface scale to 200 percent and then 75 percent, and confirm every panel stays readable, nothing overlaps, and a list of 10,000 rows scrolls at interactive frame rate.",
    dep: ["property-reflection", "gpu-abstraction", "platform-windowing"]
  },
  "property-editors": {
    s: "Panels that show and edit the properties of the active object, modifier, material or tool, generated from the property definitions rather than written by hand per field.",
    d: "An editor resolves a context such as the active object, then walks its property definitions and emits a widget per property, honoring ranges, units, enum lists and visibility rules. Edits go through the property system so they validate, notify dependents, record undo and can be driven by keyframes or drivers. The hard part is context: panels must show the right data for the active selection, pinned data, or a data path chosen by the user.",
    k: ["Generated panels vs hand-built forms: generated panels stay consistent with data and scripting, but unusual layouts need escape hatches.", "Showing all properties vs only relevant ones: full lists are discoverable, but dense for newcomers; conditional visibility needs careful rules or settings seem to vanish."],
    p: ["A panel that caches the active object keeps editing the old object after selection changes.", "Property units that differ between display and storage cause values to be entered in the wrong scale."],
    v: "Add a new property in the data definition only, reload, and confirm it appears in the right panel, saves into the file, responds to undo, and can be keyframed without extra interface code.",
    dep: ["widget-layout", "property-reflection", "undo-stack", "operator-framework"]
  },
  "outliner-data-browser": {
    s: "A tree view of everything in the document: objects, collections, materials, images and other data, with filters, drag-and-drop reparenting and visibility toggles.",
    d: "The outliner builds a tree from the scene hierarchy or from raw data categories, and lets users search, rename, hide and select items. Drag-and-drop issues the same operators as other editors. Because the tree can contain every datablock, it must be built lazily and incrementally. The difficulty is staying in sync with a document that changes constantly, and showing orphaned or linked data without confusing it with live scene content.",
    k: ["Rebuilding the tree on change vs patching it: rebuilding is simple, but on scenes with tens of thousands of objects it stalls the interface.", "Several views (scene, data, library) vs one: separate views suit different tasks, but users must learn which one shows what."],
    p: ["Hiding an object in the tree and in the viewport are separate flags, so artists cannot tell why an object does not show.", "Selection in the tree and in the viewport drift apart when only one of them is notified of a change."],
    v: "In a scene of 50,000 objects, type a filter, rename one object and drag another into a collection; confirm each step completes within a frame or two and the viewport reflects the change.",
    dep: ["object-hierarchy", "collections-visibility", "datablocks-refcount", "widget-layout"]
  },
  "input-keymaps": {
    s: "Maps raw keys, mouse buttons, gestures and tablet events to named operators through customizable keymaps that vary by editor and mode.",
    d: "Events enter from the window layer and are matched against keymaps stacked by specificity: global, editor, mode, then active tool. A keymap item names an operator, its properties, a modifier combination and an event type such as press, click, drag or double-click. Modal operators capture input until they finish. The difficulty is ambiguity: click versus drag, chorded modifiers, international layouts, and conflicts between add-ons and user edits.",
    k: ["Context-stacked keymaps vs one flat table: stacking lets the same key do the right thing per mode, but debugging which map consumed an event takes tooling.", "Click-versus-drag detection with a movement threshold: allows both on one button, but adds latency to the first interaction and feels wrong with a tablet pen."],
    p: ["Shortcuts bound by position on one keyboard layout land on unreachable keys on another layout.", "An add-on that registers a key without a conflict check silently shadows a built-in action."],
    v: "Rebind one shortcut, then confirm that it fires the operator in the edited editor only, that a conflict report lists any other map using the key, and that the binding survives a restart.",
    dep: ["operator-framework", "platform-windowing", "pen-tablet-input"]
  },
  "selection-system": {
    s: "Tracks which objects, vertices, edges, faces, bones or other elements are selected, with an active element, modes and operations to grow, invert and filter the set.",
    d: "Selection state is stored as flags on elements and as ordered history, so the most recent element can act as the active one. Object selection lives in the scene; element selection lives in the edit data and has separate vertex, edge and face modes that must stay consistent: selecting all vertices of a face selects the face. Box, lasso, circle and linked selection use picking. The difficulty is consistency across modes, undo, and very large meshes where flag updates themselves cost time.",
    k: ["Selection flags stored on elements vs a separate set: flags give constant-time checks and fast iteration of neighbors, but selection is entangled with mesh data and its copies.", "Flush between modes eagerly vs lazily: eager flush keeps modes correct at all times, lazy flush is faster for bulk operations but needs an explicit sync step."],
    p: ["Switching selection mode with a stale flush leaves a face selected whose vertices are not, so the next operator acts on a different set than shown.", "Selection history grows unbounded on long sessions and slows operations that read it."],
    v: "On a million-face mesh, box-select half the faces, switch to vertex mode and back, and confirm the selected count is identical and the whole sequence completes without a visible stall.",
    dep: ["picking-hit-testing", "topology-queries", "attribute-domains", "edit-modes"]
  },
  "picking-hit-testing": {
    s: "Finds which object or element lies under the cursor or inside a region, using ray tests, projected distance tests or an off-screen identifier buffer.",
    d: "Three techniques are common. Ray casts test the cursor ray against bounding trees and exact triangles. Screen-space tests project element positions and measure pixel distance, good for vertices and edges. A GPU id buffer renders each element in a unique color and reads back the pixel under the cursor. Each handles occlusion differently. The hard part is choosing the technique that matches the cost, accuracy and X-ray behavior the artist expects, and keeping it fast on dense meshes.",
    k: ["GPU id buffer vs CPU ray test: the buffer respects exactly what is drawn and handles dense meshes, but needs an extra render and a read-back that can stall.", "Pixel-distance tests vs ray tests for vertices: pixel tests feel forgiving at any zoom, but ignore depth, so hidden vertices can win without an occlusion check."],
    p: ["Reading back a buffer synchronously every pointer move stalls the pipeline on slower GPUs and makes the cursor lag.", "Ties between overlapping elements are resolved by memory order, so the picked item changes between sessions."],
    v: "Hover over a vertex hidden behind a face in solid mode and confirm it is not picked, then enable X-ray and confirm it is. Measure that pick time on a ten-million-triangle mesh stays below one frame.",
    dep: ["gpu-selection-buffer", "bvh-trees", "closest-point-queries", "transform-evaluation"]
  },
  "transform-tools": {
    s: "Move, rotate and scale interactively, in selectable pivot points and coordinate spaces, with numeric input and live preview, applied to objects or mesh elements.",
    d: "A transform tool gathers the selected items into a working set, computes a pivot, and maps pointer motion to a matrix in a chosen space such as world, local or view. It writes results back each frame while keeping the originals so it can cancel. Proportional falloff, axis locks and numeric typing all modify the same pipeline. Complexity comes from hierarchies, where moving a parent and child together must not double-transform, and from scale with rotation, which can shear.",
    k: ["Storing originals and recomputing from them vs accumulating deltas: recompute is exact and cancelable, but needs memory proportional to the selection.", "Per-item pivots vs one shared pivot: per-item pivots suit scatter edits, one pivot suits group moves; mixing them needs clear UI state."],
    p: ["Non-uniform scale on a rotated parent shears its children, and the shear cannot be represented by a simple transform on the child.", "Cancelling mid-drag after a snapped transform restores floating-point-rounded values rather than the originals."],
    v: "Select 100,000 vertices, drag a move with typed numeric offset, press cancel and confirm vertex positions are bit-identical to before, then repeat and confirm the offset is applied exactly once.",
    dep: ["selection-system", "snapping-constraints", "gizmos", "transform-evaluation", "math-library"]
  },
  "snapping-constraints": {
    s: "Constrains transforms to grids, vertices, edges, faces, axes and angles so that parts line up exactly, as the artist moves the pointer.",
    d: "While a tool runs, the snapping system proposes target points near the cursor using the same spatial structures as picking, filtered by element type, selection and visibility, and returns the closest one with a preview marker. Constraints project the motion onto axes or planes. Rotation snaps to increments. Hardest are the cost on huge scenes, ties between candidates, snapping to evaluated geometry from modifiers, and keeping snap targets stable as the view changes.",
    k: ["Snapping to evaluated vs original geometry: evaluated matches what is seen, but is slower and breaks when the modifier result changes under the cursor.", "Screen-space distance threshold vs world-space: pixel thresholds feel consistent at any zoom, while world thresholds are reproducible but unusable when zoomed far out."],
    p: ["Snapping to a mesh that is itself being transformed creates feedback and the object jitters or runs away.", "Candidates in hidden collections are included, so points snap to geometry the artist cannot see."],
    v: "Move a vertex toward another vertex until the snap marker appears, release, and confirm positions match within floating-point equality, including when the target sits under an active mirror modifier.",
    dep: ["picking-hit-testing", "bvh-trees", "collections-visibility", "transform-tools"]
  },
  "gizmos": {
    s: "On-screen handles drawn in the scene for moving, rotating, scaling and adjusting object properties directly, such as light cone angle or camera focal point.",
    d: "A gizmo is a small drawable with its own hit test and drag behavior. Groups of gizmos appear for the active tool or object type. On press, the gizmo captures the pointer, converts motion into a change to a bound property and reports it through the same property system as panels. The difficult parts are drawing at a constant screen size under perspective, picking thin handles, and resolving overlap between handles and scene objects.",
    k: ["Gizmos bound to properties vs custom handlers: property binding gives undo, keyframing and scripting for free, but unusual behaviors still need custom code.", "Constant screen-size handles vs world-size handles: constant size stay usable at any zoom, but they stop reflecting real scale."],
    p: ["A handle clicked at a grazing angle maps pointer motion to a huge change because the plane is nearly parallel to the view ray.", "Gizmos drawn with depth testing disappear inside geometry and cannot be grabbed."],
    v: "Drag a light's cone-angle gizmo, confirm the property updates live in the panel, undo restores the earlier value, and the handle remains grabbable when the light is inside a mesh.",
    dep: ["picking-hit-testing", "property-reflection", "operator-framework", "overlays-wireframe"]
  },
  "operator-framework": {
    s: "Wraps every user action as a named operator with properties, a poll that says when it may run, and execute and modal phases, so actions can be recorded, repeated and scripted.",
    d: "An operator declares its name, properties and a poll function that checks context. When invoked it may run once or go modal, handling events until it finishes or cancels. Results report whether the data changed, which drives undo pushes and redraws. Because menus, shortcuts, scripts and macros all call operators, behavior is identical across entry points. Difficulty lies in context: operators run in different editors and threads and must not assume which area is active.",
    k: ["Everything as an operator vs direct function calls from the interface: operators give undo, repeat and scripting uniformly, but add ceremony and overhead for trivial actions.", "Modal operators that own input vs state in the editor: modal is simple to write, but nested modals and cancellation paths multiply."],
    p: ["An operator that changes data without reporting it skips the undo push, so one action cannot be undone.", "Polls that are slow make menus lag, because every menu item is polled each redraw."],
    v: "Run an operator from a menu, a shortcut and a script with the same properties and confirm the results are identical, the undo list gets one entry, and the repeat-last command reproduces it.",
    dep: ["undo-stack", "property-reflection", "edit-modes", "scripting-api"]
  },
  "edit-modes": {
    s: "Switches the active object between states such as object, edit, sculpt, paint and pose, each with its own data representation, tools, keymap and undo behavior.",
    d: "Entering a mode converts the object's compact data into the representation that mode edits: for mesh editing, a connected structure with adjacency; for sculpting, a spatial tree. Leaving it writes the result back. Tools, shelf, overlays and keymaps change with the mode. Multi-object editing lets several objects share one mode. The hard part is conversion cost on large meshes and keeping the invariant that exactly one representation is authoritative at a time.",
    k: ["Convert on enter and leave vs edit the stored data directly: conversion enables rich local operations, but costs seconds on huge meshes and can lose data that the editing form cannot hold.", "One shared mode for all selected objects vs per-object modes: shared is easier to reason about, per-object matches mixed workflows but complicates tools."],
    p: ["A crash while in edit mode loses the changes held only in the editing structure unless autosave converts it back.", "Scripts that read mesh data in edit mode see the stale stored copy rather than the edits."],
    v: "Enter edit mode on a ten-million-triangle mesh, move a vertex, leave the mode, and confirm the object holds the change, the time stays under a few seconds, and no attribute was dropped.",
    dep: ["boundary-rep-mesh", "operator-framework", "edit-mode-undo", "selection-system"]
  },
  "scripting-api": {
    s: "A programmable interface to the document, operators and interface, so artists and studios can automate tasks and write tools in a scripting language.",
    d: "The API exposes datablocks, their properties and operators through bindings generated from the property definitions, so it grows as the application does. Scripts can read and write data, register operators and panels, and run interactively in a console. Access to large arrays such as vertex positions goes through bulk buffer copies, not per-element calls. The difficulty is stability: the data model is the public interface, so any rename breaks scripts, and unsafe edits can corrupt data or crash.",
    k: ["Generated bindings vs hand-written wrappers: generated bindings cover everything and stay in sync, but they expose internal structure as the public contract.", "Per-element access vs bulk buffer access: per-element is easy to use, but orders of magnitude slower on large meshes."],
    p: ["A script iterating over a million vertices with per-element calls appears to hang the interface.", "Holding a reference to a datablock across an undo step points at freed memory and crashes."],
    v: "Run a script that creates a mesh of one million vertices using buffer access, confirm it finishes within seconds, then undo and confirm the object disappears and the script's old reference reports invalid, not crashes.",
    dep: ["property-reflection", "operator-framework", "datablocks-refcount", "attribute-domains"]
  },
  "property-reflection": {
    s: "A registry describing every data structure's fields, types, ranges, units and relations at runtime, driving interface generation, scripting, keyframing and serialization hooks.",
    d: "Each structure registers a schema listing its properties, with getters and setters, defaults, limits, and update callbacks. Paths such as an object's location or a modifier's strength name any property uniquely, and animation, drivers and the interface use those paths. Because the schema is the one source of truth, a field added once appears everywhere. The difficulty is performance and lifetime: lookups by path are slow in hot loops, and setters must validate and notify consistently.",
    k: ["A runtime schema vs code-generated accessors: runtime schema supports dynamic add-on properties and paths, but adds lookup overhead and indirection on every access.", "Notify-on-set vs polling for changes: notification is precise and cheap to react to, but every setter must remember to send it."],
    p: ["A setter that forgets to flag the dependency graph leaves the viewport showing the previous value.", "Renaming a property breaks stored animation paths in files saved before the change."],
    v: "Register a new float property on a datablock, then confirm it appears in a panel, can be keyframed, is readable by script by its path, and saves into and loads from a file without any further code.",
    dep: ["struct-serialization", "datablocks-refcount", "dependency-graph"]
  },
  "addon-packaging": {
    s: "Discovers, loads, enables and isolates user-supplied extensions, with metadata, version checks and per-add-on preferences.",
    d: "An add-on is a folder or archive containing code and a manifest that declares its name, version, permissions and the minimum host version. The loader scans configured paths, imports enabled add-ons, calls their register functions and unregisters on disable. It stores preferences per add-on. Hard parts are dependency conflicts between add-ons, API drift between host versions, loading code from untrusted sources, and getting a clean unload so new versions apply without restart.",
    k: ["In-process add-ons vs separate processes: in-process is fast and can touch data directly, but a bug or malicious add-on can crash or take over the application.", "Declared host-version ranges vs best-effort load: declared ranges prevent known breakage, but force authors to re-release for every host update."],
    p: ["An add-on that fails to unregister leaves operators and keymap items behind and breaks the next enable.", "Two add-ons bundling different copies of a shared library load whichever imports first, and one breaks."],
    v: "Install an add-on from an archive, enable it, restart, confirm its operator is present, disable it, and confirm no operator, panel or keymap entry from it remains in the registry.",
    dep: ["scripting-api", "event-hooks", "operator-framework", "logging-crash-reports"]
  },
  "event-hooks": {
    s: "Callbacks that scripts register to run on application events: file load and save, frame change, undo, selection change and depsgraph updates.",
    d: "The application keeps lists of handlers per event type. At the relevant moment, such as just before a file saves or after the frame changes, it calls each handler with a small context. Handlers let pipeline tools validate scenes, fix paths or sync external databases. The challenge is cost and safety: handlers on frequent events like frame change run on the critical path, and a handler that edits data during an update can trigger itself recursively.",
    k: ["Synchronous handlers vs queued callbacks: synchronous runs at a well-defined moment and can veto, but slow handlers block the interface; queued is smoother but runs after the state has moved on.", "Global handler lists vs per-add-on scoped handlers: scoped handlers are cleaned on disable, while global lists leak when authors forget."],
    p: ["A frame-change handler that edits an object triggers another frame update and loops indefinitely.", "Handlers registered on each reload of a script accumulate duplicates and run many times."],
    v: "Register a save handler that stamps a custom property, save the file, and confirm the property is in the file once; reload the script ten times and confirm the handler still runs exactly once.",
    dep: ["scripting-api", "dependency-graph", "native-file-format"]
  },
  "headless-batch": {
    s: "Runs the application without a window to convert files, bake, render or process scenes from the command line, in build pipelines and on servers.",
    d: "A background mode skips window creation and the interface, loads a file, runs scripts or operators and exits with a status code. Many operators assume an interface context, such as an active area, so the batch path must supply or avoid it. Output goes through the same file and render code as interactive use. It is hard to keep headless runs deterministic and independent from user preferences, display availability and GPU presence.",
    k: ["Same code with a null interface vs a separate batch library: a null interface reuses all behavior and fixes, but operators that need interface context fail in confusing ways.", "Loading user preferences vs a clean default profile: preferences make results match the artist's, but break reproducibility on build machines."],
    p: ["An operator that polls for a viewport fails headless, and the script reports success because the exit code is ignored.", "A server without a GPU hangs when a script triggers viewport drawing."],
    v: "On a machine with no display, run a command-line conversion of a scene to an interchange format, confirm a nonzero exit code on a missing input, and that two runs produce byte-identical output.",
    dep: ["scripting-api", "interchange-formats", "platform-windowing", "logging-crash-reports"]
  },
  "destructive-vs-nondestructive": {
    s: "Whether an edit permanently rewrites the base data or is stored as a recipe applied on top, which shapes undo, performance, file size and every tool's design.",
    d: "Destructive edits change the mesh in place: simple, fast, and compact on disk. Non-destructive edits keep the base and a list of operations, such as modifiers, shape keys or graphs, and recompute the result. The second approach allows revision and reuse, but needs caching, dependency tracking and a way to bake results. Most tools mix both, and the boundary between them, such as when a modifier is applied, is where users lose work or performance.",
    k: ["Keep the recipe vs bake early: the recipe allows late changes and sharing, but evaluation cost grows with the stack; baking is fast to display and hard to revise.", "Procedural graphs vs direct editing: graphs give variation and reuse, but make small manual fixes awkward because there is nowhere to attach them."],
    p: ["A late edit in a long stack changes everything above it, so unrelated fixes reappear or vanish.", "Applying a modifier discards the recipe, and the artist cannot recover the earlier parameters."],
    v: "Change a parameter at the bottom of a five-modifier stack and confirm the result updates correctly while the base mesh stays byte-identical; then apply the stack and confirm the result is the same shape.",
    dep: []
  },
  "data-ownership-and-mutation": {
    s: "Which component owns each piece of data, who may modify it and when, which determines threading, undo, caching and what happens when two systems want the same mesh.",
    d: "Every mesh, image and scene graph has an owner. Editors that mutate data must tell dependents; evaluators that read it must see a consistent snapshot. Common solutions are an original-versus-evaluated split, copy-on-write, and reference counting. Choices here decide whether the viewport can draw while a script edits, whether undo can restore exactly, and whether evaluation can run on other threads without locks.",
    k: ["Copy-on-write evaluation vs locks on shared data: copies let readers run without blocking, but cost memory and need cheap sharing of unchanged parts.", "Single mutation point vs free access: a single point makes undo and notification reliable, but forces every tool to go through it, even for small edits."],
    p: ["A tool that mutates the evaluated copy loses its change at the next evaluation.", "Two threads sharing a lazily built cache without a lock produce intermittent corruption that appears only on large scenes."],
    v: "Run a script that edits a mesh in a loop while the viewport animates; confirm the viewport never shows a half-updated mesh and a thread-checking build reports no data race.",
    dep: []
  },
  "interactive-latency": {
    s: "The time between an input event and the pixels that show its result, which determines whether tools feel direct, and must hold even while heavy work runs.",
    d: "Brush strokes, drags and orbiting need results within one or two frames. That requires doing local work on the input path, deferring expensive recomputation, and never blocking the interface thread on evaluation, file access or script code. Techniques include incremental updates, level-of-detail in the viewport, background computation with cancellation, and showing a fast approximation until the exact result is ready.",
    k: ["Approximate preview then exact result vs wait for exact: preview keeps the tool responsive, but users can act on a result that later changes.", "Cancel-and-restart of background work vs let it finish: cancellation keeps latency low during rapid edits, but requires every algorithm to be interruptible."],
    p: ["A synchronous file or script call on the interface thread freezes the window for seconds.", "Input events queue during a long frame and replay later, so a brush stroke lands in the wrong place."],
    v: "Record input-to-photon latency with a high-speed camera or a frame-timestamp test during a brush stroke on a heavy mesh, and confirm the 95th percentile stays under a stated budget such as two frames.",
    dep: []
  },
  "scale-and-performance-budgets": {
    s: "How many polygons, objects, textures and modifiers a scene may hold while staying interactive, and how each subsystem's time and memory are budgeted to meet that.",
    d: "A scene can hold millions of triangles, thousands of objects and gigabytes of textures. Each frame, evaluation, extraction, upload and drawing share a small time budget, and memory is split between CPU, GPU and caches. Approaches include spatial trees, level-of-detail, instancing, lazy evaluation, streaming and multithreading. Budgets are set per operation, and tools degrade gracefully, for example drawing bounding boxes while a huge scene is orbited.",
    k: ["Adaptive quality during interaction vs constant quality: adaptive keeps frame rate, but visible popping can confuse judgment of the real result.", "Aggressive caching vs low memory use: caches make repeated edits fast, but multiple copies of large meshes can exhaust memory."],
    p: ["Per-object cost that is invisible on a hundred objects dominates when a scene has a hundred thousand.", "Memory growth in undo history and caches is only noticed when the machine starts swapping."],
    v: "Load a scene of ten million triangles and 50,000 objects, orbit the camera, and confirm the frame rate and peak memory stay within the documented budget with the profiler showing no single subsystem over its share.",
    dep: []
  },
  "numerical-robustness": {
    s: "How the tool behaves when floating-point arithmetic, degenerate geometry and extreme scales push operations into cases that the textbook algorithm does not handle.",
    d: "Single-precision positions, nearly coplanar faces, zero-area triangles and objects far from the origin all produce wrong answers, such as booleans that leave holes or normals that flip. Robust code uses exact or adaptive predicates for decisions, tolerances chosen relative to scale, and cleanup passes. Every algorithm should either handle a degenerate case or say clearly that it cannot, so the artist can fix the input.",
    k: ["Exact arithmetic for decisions vs tolerance-based comparison: exact predicates never misclassify, but cost more; tolerances are fast, and fail on scale changes.", "Double precision for storage vs single: double avoids jitter far from the origin, but doubles memory and GPU conversions."],
    p: ["A boolean on two coplanar faces produces holes that appear only after later edits.", "An object placed ten kilometers from the origin shows vertices jittering because positions lose precision."],
    v: "Run a boolean on a corpus of known degenerate inputs, such as coplanar faces and shared edges, and confirm each result is a closed manifold mesh or reports a clear error, with zero silent holes.",
    dep: []
  },
  "file-compatibility-and-longevity": {
    s: "Whether files saved years ago still open, whether new files open in older versions, and how data can be exchanged with other tools without losing meaning.",
    d: "A document outlives the version of the tool that wrote it. Formats need version tags, additive changes, defaults for fields that old files lack, and rules for what an older version does with unknown fields. Interchange formats lose information, because every tool has different concepts. Practical policy sets how long old files load, whether newer files can be opened read-only, and how migration happens.",
    k: ["Forward compatibility by preserving unknown data vs refusing to load: preserving lets older versions open newer files, but the data they cannot edit can become inconsistent.", "A frozen simple format vs an evolving rich one: simple lasts, but cannot express new features without extensions."],
    p: ["A change to a default value silently alters the look of files saved before the change.", "Saving over a new file in an older version drops fields the old version did not know about."],
    v: "Open a corpus of files from every supported earlier version, save them, reload them and render; confirm the images match references within tolerance and no data-loss warnings appear for supported features.",
    dep: []
  }
});
