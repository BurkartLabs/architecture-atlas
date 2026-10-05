// Game engine details: tools, debug, platform services, scripting, AI, UI, cross-cutting.
ATLAS.details("game-engine", {
  // ---------- tools ----------
  "editor-shell": {
    s: "The host application that hosts every editing tool: docking panels, menus, commands, selection, project loading and the plumbing that lets tools share one document model.",
    d: "The shell owns the window layout, the command registry, the selection set and the open project. Each tool (level editor, graph editors, browsers) registers panels and commands into it rather than creating its own windows. It runs the engine's own runtime code in-process so the editor shows exactly what the game will, and it routes every edit through a command layer so that undo, scripting and automation all use the same entry point. The hard part is keeping a large, long-lived application responsive while it loads gigabytes of content and while the engine inside it reloads worlds, modules and assets underneath open panels.",
    k: [
      "Editor inside the engine process versus a separate process: in-process shares code and shows true results, but an engine crash takes unsaved edits with it; out-of-process isolates crashes at the cost of a sync protocol.",
      "Retained UI versus immediate-mode panels: retained trees style and lay out better; immediate mode makes small tools cheap to write but redraws every frame and complicates accessibility.",
      "All mutations as named commands: gives undo, macros and remote control for free, but forces every tool author to model edits as data instead of poking objects directly.",
    ],
    p: [
      "Panels hold raw pointers or cached object references; a level reload or asset reimport leaves them dangling and the editor crashes on the next repaint.",
      "Tools write straight to the world, bypassing the command layer, so those edits cannot be undone and are lost when play mode ends.",
    ],
    v: "Open a large project, edit across three tools, then reload the level and reimport an asset while every panel is open. No panel shows stale data, no crash occurs, and every edit appears in the undo history.",
    dep: ["undo-redo", "reflection-and-types", "serialization"],
  },
  "undo-redo": {
    s: "A history of editing operations that lets a person step backward and forward through changes to a level or asset without corrupting other state.",
    d: "Every edit is recorded as a transaction: either a command with explicit do and undo steps, or a before-and-after snapshot of the changed properties found through reflection. Transactions group many small changes (a drag across fifty frames) into one user-visible step. The stack must survive operations that rebuild objects, such as deleting and recreating an entity, so it refers to stable identifiers rather than memory addresses. Multi-object edits, prefab overrides and cross-document changes are where it gets difficult. History also has to be scoped: play mode, reloads and external file changes each decide whether old entries remain valid.",
    k: [
      "Command objects versus property snapshots: commands are compact and exact but must be written per operation; snapshots through reflection cover everything automatically and cost memory on large selections.",
      "One global stack versus one per document: global matches user expectation in a single window but entangles unrelated assets; per-document isolates them and makes cross-asset edits awkward.",
      "Transaction grouping with open and close scopes: a drag becomes one step, but a forgotten close silently merges unrelated edits.",
    ],
    p: [
      "History stores object pointers; after undoing a delete the recreated object has a new address and later entries modify freed memory.",
      "Continuous edits like sliders push one entry per frame, so ten seconds of dragging buries real history and exhausts memory.",
    ],
    v: "Script a sequence of create, move, delete, reparent and property edits, then undo them all and compare the serialized level to the original byte for byte. Redo them all and compare to the final state.",
    dep: ["reflection-and-types", "serialization"],
  },
  "level-editor": {
    s: "The viewport and tools for placing, arranging and configuring objects in a level, with gizmos, snapping, layers and a live view of the world as it will render.",
    d: "The level editor renders the world through the engine's own renderer, adds an overlay layer for gizmos, grids and selection outlines, and translates mouse and keyboard input into commands against the world model. Picking uses either an ID buffer rendered by the GPU or ray queries against collision and bounds. It manages organization features such as layers, groups, prefab instances with per-instance overrides, and visibility filters so that artists can work on a world far too large to show at once. Its saved format must merge cleanly when several people change the same level, which strongly influences how the scene file is structured.",
    k: [
      "GPU ID-buffer picking versus CPU ray queries: ID buffers match what is drawn exactly but cost a render pass; rays are cheap but miss shader-displaced or procedural geometry.",
      "One monolithic level file versus many small per-object or per-region files: small files merge and diff well but multiply load cost and reference bookkeeping.",
      "Editing prefab instances with override deltas versus flattening them: deltas keep updates flowing from the source but make 'why is this value different' hard to answer.",
    ],
    p: [
      "Gizmo and snapping math done in the object's local space with non-uniform scale and rotated parents, so moves drift or shear children.",
      "Saving the whole level as one file; two designers editing different corners produce unresolvable merge conflicts.",
    ],
    v: "Place, rotate and parent 1,000 objects in a test level, save, reload, and confirm a screenshot and a transform dump match. Have two people edit different regions and merge their files without manual conflict resolution.",
    dep: ["editor-shell", "undo-redo", "property-inspector", "scene-graph-and-transforms", "scene-queries", "cameras-and-viewports"],
  },
  "material-and-shader-graphs": {
    s: "A node-based editor that lets artists build surface appearance and effects visually, which the engine compiles into real shader programs.",
    d: "Artists connect nodes for textures, math and inputs; the tool walks the graph, emits shader source in an intermediate form, and hands it to the shader system for compilation per target platform. A good implementation previews the result live on a mesh, reports type errors on the offending node, and exposes chosen inputs as material parameters for runtime override. Graphs compile into many variants depending on vertex format, lighting path and quality tier, so permutation count has to be tracked and capped. The difficulty is generating code that is as fast as hand-written shaders while letting non-programmers build it, and keeping old graphs valid when node semantics change.",
    k: [
      "Generate source text versus a typed intermediate representation: text is simple and debuggable, but an intermediate form makes cross-platform targeting and optimization passes much easier.",
      "Expose every node input as a parameter versus a curated set: full exposure is flexible but defeats constant folding and multiplies the cost of each instance.",
      "Graph versus code escape hatch (custom code node): code nodes let experts break out, but they bypass type checks and cannot be previewed or ported automatically.",
    ],
    p: [
      "Each toggle in a graph doubles the compiled permutations; a few dozen switches produce a shader cache that takes hours to build and gigabytes to ship.",
      "Changing a node's behavior in a new editor version silently alters the look of every existing material that uses it.",
    ],
    v: "Build a graph with a texture, a lerp and a parameter. Compile for each target, render a reference mesh, and compare against a hand-written shader's output within tolerance. Report the instruction count and permutation count.",
    dep: ["shader-system", "materials-and-pbr", "editor-shell", "undo-redo"],
  },
  "animation-graph-editor": {
    s: "The visual editor for building animation state machines and blend trees, with live preview of a character and runtime debugging of the active state.",
    d: "Animators lay out states, transitions, blend spaces and layers, and the tool saves them as a graph asset that the runtime evaluates. It previews the graph against a skeleton in the viewport, scrubs parameters, and can attach to a running game to highlight the active states and show parameter values. The editor shares data structures with the runtime animation system, so a node added once appears in both. The hard problems are showing the effect of transitions that depend on gameplay parameters, keeping huge graphs readable through sub-graphs and reuse, and validating that every path produces a legal pose.",
    k: [
      "Editor-only data converted at build time versus loading the editor graph at runtime: conversion lets the runtime be compact and fast, but creates two representations to keep in sync.",
      "Parameter-driven transitions versus event-driven ones: parameters are easy to inspect and preview, while events express gameplay intent more directly but are harder to simulate offline.",
    ],
    p: [
      "Graphs grow into thousands of nodes with copy-pasted sub-graphs; one fix must be applied in a dozen places because there is no reuse mechanism.",
      "The preview uses default parameters, so a transition that only fires with a certain speed and slope combination is never exercised before shipping.",
    ],
    v: "Open a character graph, attach to a running build, and drive a parameter sweep. The highlighted state and blend weights match what the runtime reports each frame, and the preview pose matches the in-game pose.",
    dep: ["editor-shell", "blend-trees-and-state-machines", "skeletons-and-skinning", "undo-redo"],
  },
  "asset-browser": {
    s: "A searchable view of every asset in the project, with thumbnails, filters, tags and dependency information, used to find, open, move and reference content.",
    d: "The browser queries the asset database rather than scanning the file system, so searching by type, tag, name or references is instant even with hundreds of thousands of assets. Thumbnails are generated by the offline pipeline and cached. Moving or renaming an asset must update every reference to it, which is why references use stable identifiers and the browser can show the 'used by' and 'depends on' graph before a delete. It also drives drag-and-drop into the level editor and import of new source files. Scale is the challenge: the view has to stay responsive while the database is still indexing.",
    k: [
      "Browse the file system directly versus a database index: direct browsing is simple and always accurate but slow to search; an index is fast and rich but can drift from disk if updates are missed.",
      "Rename as a file move plus reference rewriting versus a stable ID with a display name: rewriting touches many files and conflicts; IDs make renames trivial but need an indirection at load time.",
    ],
    p: [
      "The delete button checks only loaded assets, so an unloaded level that references the asset breaks silently at ship time.",
      "Thumbnails are regenerated synchronously on open, so browsing a large folder freezes the editor for minutes.",
    ],
    v: "Import 100,000 synthetic assets, then search by type and tag; results appear in under a second. Rename a texture used by a material and a level, reopen both, and confirm the references resolve.",
    dep: ["asset-database", "editor-shell", "offline-asset-pipeline"],
  },
  "property-inspector": {
    s: "A generic panel that shows and edits the properties of whatever is selected, generated automatically from the engine's type information.",
    d: "The inspector asks the reflection system for the selected object's fields, their types and metadata such as ranges, units, categories and tooltips, then builds editing widgets automatically. Edits are applied through the command layer so they are undoable, and multi-selection shows mixed values and applies changes to every object. Custom drawers override the default for types like colors, curves or asset references. Because it is generated, a gameplay programmer who adds an annotated field gets a working editor for free. The difficulty lies in nested containers, polymorphic types, prefab override display and performance with very large arrays.",
    k: [
      "Fully automatic generation versus hand-written editors per type: automatic is free and consistent but looks generic; custom drawers are polished but must be maintained as types change.",
      "Edit on every keystroke versus on commit: live edits give instant feedback but spam undo history and trigger expensive recompiles; commit-on-enter is calmer but feels laggy.",
      "Show every field versus attribute-controlled visibility: showing all is simple but exposes unsafe internals to designers.",
    ],
    p: [
      "Multi-selection applies the first object's value to all objects whenever any field is touched, wiping out differences the user did not mean to change.",
      "Large arrays create one widget per element, and a 50,000-entry list makes the panel take seconds to draw.",
    ],
    v: "Add an annotated field to a component with only code changes; it appears in the inspector with the correct range and tooltip, edits undo correctly, and survives save and reload. Select ten differing objects and verify mixed-value display.",
    dep: ["reflection-and-types", "undo-redo", "editor-shell", "serialization"],
  },
  "play-in-editor": {
    s: "The ability to run the game inside the editor with one click, then return to editing with the original level intact.",
    d: "Play mode takes the edited world and either duplicates it in memory or serializes and reloads it into a separate game world, then runs the normal game loop with real input. When play stops, the duplicate is thrown away, so changes made during play do not leak into the saved level. Options include simulating without a player, running several clients and a server in one session, and pausing to inspect or tweak values. It must faithfully match the shipped game, so it uses the same loading and spawning paths. The hard part is isolating global state, such as singletons and static caches, that survives between sessions.",
    k: [
      "Duplicate the world in memory versus serialize and reload: duplication is instant but copies editor-only state; reloading is slower but exercises the real load path and catches serialization bugs.",
      "Same process as the editor versus a launched standalone: in-process is quick and debuggable, standalone is more faithful but slower to start and harder to inspect.",
    ],
    p: [
      "Global singletons and caches persist across play sessions, so the second run behaves differently from the first and bugs cannot be reproduced.",
      "Play mode uses editor-resident assets with no cooking, so missing-from-package errors only appear in a real build.",
    ],
    v: "Start play, move objects and trigger scripts, stop, and diff the saved level against the pre-play copy; they are identical. Run ten consecutive sessions and confirm the same scripted scenario gives the same result each time.",
    dep: ["editor-shell", "game-loop", "serialization", "level-editor"],
  },
  "terrain-and-spline-tools": {
    s: "Authoring tools for sculpting heightfields, painting surface layers, scattering foliage and drawing splines for roads, rivers, rails and camera paths.",
    d: "These tools edit large data sets that are not objects: heightmaps, material weight maps, foliage density masks and curve control points. Brushes write into tiled data, and edits must be undoable without storing the whole terrain per stroke, so they save only the changed tiles. Splines produce derived geometry and gameplay data (a road mesh, a river flow field, a navigation corridor) that regenerates when control points move. Because content is huge, tools stream tiles and work on regions. The challenge is keeping authored and procedural layers cleanly separated so a rebuild does not destroy hand edits.",
    k: [
      "Store edits as per-tile deltas versus full snapshots: deltas keep undo cheap and files small but need replay logic; snapshots are simple but explode in memory on big maps.",
      "Procedural generation with hand-edit overlays versus fully hand-authored: procedural scales to large worlds, but overlays must survive regeneration or artists lose work.",
      "Splines as live generators versus baked geometry: live regeneration keeps roads editable, while baking is faster at runtime and easier to debug.",
    ],
    p: [
      "Changing one brush stroke regenerates the entire world's derived data, making each edit take seconds and discouraging iteration.",
      "Spline-derived meshes are not tied to terrain edits, so reshaping a hill leaves a road floating in the air.",
    ],
    v: "Sculpt a hill, paint two layers and draw a spline road across it. Undo each stroke; the heightmap hash returns to the previous value. Reshape the hill and confirm the road conforms without manual fixes.",
    dep: ["editor-shell", "undo-redo", "terrain-and-foliage", "level-editor"],
  },
  "build-cook-deploy": {
    s: "The automated path that turns source and content into a runnable package for a specific platform and delivers it to a device, store or server.",
    d: "A build compiles code, cooks assets into platform-specific formats, packages them into archives, signs the result and copies it to a target. It is driven from a command line so humans and CI run identical steps. Incremental builds depend on correct dependency tracking so unchanged assets are not recooked; the content cache is shared across a team. Configurations (debug, development, shipping) change what is compiled in and what tooling is stripped. The difficulty is reproducibility: the same inputs must produce the same package, and a clean build must match an incremental one.",
    k: [
      "Local incremental cooking versus a shared content cache: local is simple and private but wasteful across a team; a shared cache is much faster but needs deterministic cooking and cache invalidation.",
      "One monolithic package versus chunked packages: monolithic is simple to verify, while chunks enable patching, optional content and streamed installs.",
      "Build configurations with different code paths: stripping debug features shrinks and speeds the product but means shipping code that was tested less.",
    ],
    p: [
      "Incremental builds miss a dependency, so a fixed texture ships stale on one machine and correct on another until someone does a clean build.",
      "Shipping builds are only made at the end of a project; build-only failures such as missing stripped symbols appear days before release.",
    ],
    v: "Run the build twice from a clean checkout on two machines. Package hashes match, an incremental build after a one-texture change recooks only that texture, and the deployed build boots to the main menu on the target.",
    dep: ["cooking-and-packaging", "offline-asset-pipeline", "platform-sdks", "config-and-console-variables"],
  },
  "automated-tests-and-ci": {
    s: "Unit, integration, performance and playthrough tests run automatically on every change, so regressions in code and content are caught before they reach players.",
    d: "Continuous integration builds every change on every target platform and runs a layered set of tests: fast logic tests on isolated systems, content validation that opens every level and checks references, headless runs that load maps and simulate for a while, and performance tests that compare frame time and memory against budgets. Scripted bots or recorded input can play the game through key flows. Tests need the engine to run without a window, with a fixed time step and seeded random numbers. The hard part is flaky, slow and non-deterministic tests, which people learn to ignore.",
    k: [
      "Many headless simulation tests versus a few rendered end-to-end tests: headless is fast and stable but cannot see visual regressions; rendered tests catch them but are slow and sensitive to hardware.",
      "Fail the build on a budget regression versus reporting trends: failing enforces discipline but causes noise from machine variance; trends are quieter but get ignored.",
    ],
    p: [
      "Tests depend on wall-clock time or unseeded randomness, so they pass most days and fail without any code change, and the team stops trusting red builds.",
      "Content is validated only when someone opens it in the editor, so a broken reference on a rarely used level ships.",
    ],
    v: "Introduce a deliberate regression (a missing asset reference, a 20 percent frame-time increase). CI must fail on that change, name the cause, and pass again when it is reverted. Rerun a passing suite ten times with no flakes.",
    dep: ["build-cook-deploy", "fixed-step-and-determinism", "logging-and-assertions", "performance-budgets"],
  },
  "plugins-and-public-sdk": {
    s: "A stable, versioned interface that lets outside code and tools extend the engine and editor without modifying its source.",
    d: "Plugins are modules loaded at startup that register components, importers, editor panels or whole subsystems through a defined API. The public SDK is the subset of engine headers and tools that is promised to remain stable. Each plugin declares its dependencies and the engine version it targets, and the loader orders initialization and rejects incompatible builds. Hot loading during development requires clean shutdown and state migration. Stability is the hard part: every exposed function becomes a contract, and internal refactors have to avoid breaking third parties.",
    k: [
      "Narrow, stable C-style interface versus exposing internal classes: narrow survives engine refactors and works across compilers, but is laborious to wrap; internal classes are expressive but tie plugins to exact builds.",
      "Semantic versioning with deprecation windows versus move-fast breakage: windows keep the ecosystem alive at the cost of carrying old code.",
      "Plugins in-process versus out-of-process: in-process is fast and powerful, but a faulty plugin can crash or corrupt the host.",
    ],
    p: [
      "A plugin allocates memory with its own allocator and the engine frees it, corrupting the heap when the two differ.",
      "Unloading a plugin leaves registered callbacks or types behind, and the next event calls into unmapped code.",
    ],
    v: "Build a sample plugin against the published SDK only, load it, register a component and panel, unload and reload it ten times, and run the engine's leak report to confirm no registrations or memory remain.",
    dep: ["reflection-and-types", "platform-abstraction", "memory-allocators", "events-and-messaging"],
  },
  "multi-user-editing": {
    s: "Support for several people editing the same level or asset at once, through live synchronization, object-level locks or structured merging of changes.",
    d: "Three families exist. Lock-based systems let one person own a file or object at a time. Live-sync systems send each user's edits as operations to a server that broadcasts them, so everyone sees the same world. Merge-based systems work offline and combine versions later. All depend on the scene format: if objects have stable identifiers and each is stored separately, edits to different objects never conflict. Ordering, conflicting edits to the same property and undo across users are the hard problems, since one person's undo must not revert another's work.",
    k: [
      "Pessimistic locks versus operation-based live sync: locks are simple and never conflict but block people; live sync is fluid but needs conflict rules and a server.",
      "Per-user undo stacks versus shared history: per-user matches expectations but must tolerate objects changed by others; shared is easy but surprising.",
      "Fine-grained object files versus one scene file: fine-grained diffs and merges well but needs bulk operations and index management.",
    ],
    p: [
      "Two users reparent objects into each other and the merged scene contains a cycle that crashes on load.",
      "A user's undo reverts a change that another user built upon, leaving dangling references.",
    ],
    v: "Have two sessions edit the same level concurrently: move the same object, delete an object the other is editing, and reparent into each other. Both end with identical, loadable states and a clear conflict report.",
    dep: ["serialization", "undo-redo", "level-editor", "events-and-messaging"],
  },
  // ---------- debug ----------
  "console-and-cheats": {
    s: "An in-game command line and menu for running commands, changing variables and triggering cheats such as teleporting, spawning or skipping, used by developers and testers.",
    d: "Commands are registered by name with typed arguments and help text, then parsed from typed text, a script file or a remote connection. The console shares its variable registry with the configuration system, so any tunable can be inspected and changed live. Cheats are the same mechanism pointed at gameplay: grant items, jump to a quest stage, toggle invulnerability. Because they bypass normal rules, they are compiled out or locked in shipping builds, and any state they change should be flagged so bug reports and analytics do not treat the run as legitimate. Auto-complete and history make it usable at speed.",
    k: [
      "Registration through reflection or macros versus a central command table: automatic registration keeps commands next to their code but runs at startup; a table is explicit but drifts out of date.",
      "Strip in shipping versus gate behind a secret: stripping is safe and cannot be exploited; gating helps support diagnose live problems but is a security and cheating risk.",
    ],
    p: [
      "Console commands mutate gameplay state directly and skip validation, so QA files crashes that no real player can reach.",
      "Cheat commands remain in the shipping binary and a player discovers them, unlocking progress or server-side privileges.",
    ],
    v: "Run a script of console commands headlessly; each sets a variable or spawns an entity and the effect is visible in the world dump. In a shipping build, the same commands report unknown and no cheat symbols remain in the binary.",
    dep: ["config-and-console-variables", "logging-and-assertions", "events-and-messaging"],
  },
  "runtime-inspectors": {
    s: "Overlays and windows that show live game state, such as entity lists, component values, physics shapes, AI state and network stats, while the game runs.",
    d: "Inspectors read the world through the reflection system and draw their results with the debug-drawing and immediate-mode UI layers, so each new component is visible without extra code. They let a developer select an entity in the running game, see its values, pause, step a frame and even edit fields. Separate views visualize specific systems: collision shapes, navigation data, audio sources, streaming cells. Some can be attached remotely from a laptop to a console or phone. The risk is cost and intrusion: inspecting must not change behavior, and the tooling must be removed or disabled in shipping builds.",
    k: [
      "Inspect in-process with an overlay versus a separate remote tool: overlay is immediate but covers the game and costs frame time; remote has no screen cost but needs a protocol and connection.",
      "Read-only by default versus editable: editing is invaluable for tuning but hides bugs when values are changed and forgotten.",
    ],
    p: [
      "The inspector traverses data on the render or audio thread while the game thread mutates it, producing crashes only when the inspector is open.",
      "Overlays are left enabled in a captured performance run, so the numbers include the cost of the tooling itself.",
    ],
    v: "Select an entity in a running build, pause, change a component value, resume and see the behavior change. Capture frame time with the inspector closed and in a shipping build; the inspector adds no cost when off.",
    dep: ["reflection-and-types", "debug-drawing", "game-object-model", "config-and-console-variables"],
  },
  "profilers": {
    s: "Tools that measure where time goes each frame, by CPU function, thread and GPU pass, so performance work targets real hot spots instead of guesses.",
    d: "Instrumentation macros placed through the engine emit timestamped begin and end events into per-thread buffers; the profiler gathers them across threads and shows a timeline and an aggregated call tree. GPU timing uses hardware timestamp queries read back a few frames later. Sampling profilers complement this by catching code that was not instrumented. Counters track events like draw calls and allocations. The profiler must be cheap enough to leave on during testing. Frame-time distributions matter more than averages, so tools capture percentiles and spikes, and tie them to what the game was doing.",
    k: [
      "Instrumented scopes versus sampling: instrumentation is exact and carries names but needs maintenance; sampling covers everything with no code changes but cannot see short events or wait reasons.",
      "Always-on low-detail capture versus on-demand deep capture: always-on catches rare hitches, at some cost and memory; on-demand misses what you did not expect.",
      "Per-thread lock-free buffers versus a shared log: per-thread avoids contention that would distort results, but needs merging and clock alignment.",
    ],
    p: [
      "Reporting average frame time hides a once-per-ten-seconds hitch that players feel and complain about.",
      "CPU and GPU timelines use different clocks, so a stall appears to start before its cause and sends the investigation the wrong way.",
    ],
    v: "Add a known 5 ms busy loop to one system. The profiler attributes about 5 ms to it on the correct thread and GPU timings sum to the total pass time within a small tolerance. Overhead with capture on stays under 5 percent.",
    dep: ["profiling-hooks", "time-system", "job-system", "performance-budgets"],
  },
  "frame-capture": {
    s: "A tool that records every graphics command issued for one frame so it can be replayed and inspected, showing exactly how each pixel was produced.",
    d: "Capture intercepts calls at the render hardware interface or driver level, saves the command stream with all referenced resources, and lets the user step through each draw call, viewing bound textures, buffers, shader inputs and intermediate render targets. It answers why something looks wrong: which pass wrote this pixel, what value did the shader receive. Engines help by labeling passes and resources with readable names so a capture is understandable. Captures can be large, since they include every resource used, and replaying across different hardware or API versions is not always faithful.",
    k: [
      "Capture at the engine's own interface versus at the driver: engine-level is portable and understands your passes but misses driver behavior; driver-level shows the truth but speaks in low-level calls.",
      "Label every pass and resource versus rely on defaults: labels cost a little effort and make captures readable, while unnamed resources are practically opaque.",
    ],
    p: [
      "Resources are created without debug names, so a capture lists hundreds of 'Texture 4231' entries and nobody can find the shadow map.",
      "A bug only reproduces with streaming mid-flight or a specific GPU, and the captured replay on a developer machine looks correct.",
    ],
    v: "Capture one frame, find a chosen pixel, and trace it back to the draw call and shader that wrote it. Replay the capture on the same machine and get an identical image; every pass appears with a readable name.",
    dep: ["render-hardware-interface", "render-frame-graph", "debug-drawing"],
  },
  "memory-and-gpu-analyzers": {
    s: "Tools that track every allocation by system and tag, and GPU resource usage by type, to find leaks, fragmentation and budget overruns.",
    d: "The allocator layer tags every allocation with the owning system and records size and call site, producing snapshots that can be compared over time. Diffing two snapshots across a level load and unload reveals leaks. GPU analyzers do the same for textures, buffers and render targets, including residency and aliasing. Platforms with fixed memory budgets enforce limits per system and per category. Tools show fragmentation, peak usage and per-asset cost. The hard part is attribution: shared and pooled memory is hard to assign to a single owner, and capturing call stacks for every allocation is expensive.",
    k: [
      "Track every allocation versus sample: tracking is exact and finds small leaks but costs time and memory; sampling is cheap and finds large problems only.",
      "Tag by system at the allocator interface versus infer from call stacks: tags are cheap and stable but need discipline; stacks are automatic but costly and noisy.",
    ],
    p: [
      "Memory is tagged 'misc' at allocation, so the report says 40 percent of the heap belongs to nothing in particular.",
      "Level unload frees the objects but a cache still references them, so each transition quietly grows the heap until a crash an hour later.",
    ],
    v: "Load and unload the same level ten times and snapshot after each; the live allocation count and bytes return to the baseline within a fixed tolerance, and a deliberately leaked object is reported with its owner and call site.",
    dep: ["memory-allocators", "logging-and-assertions", "runtime-resource-manager", "profiling-hooks"],
  },
  "crash-dumps": {
    s: "Automatic capture of the program's state when it crashes, uploaded with context so developers can find the cause of failures on players' machines.",
    d: "A crash handler writes a minidump containing thread stacks and selected memory, plus a log tail, build identifier, hardware description and recent gameplay breadcrumbs. The report is uploaded to a collection service that groups similar crashes by stack signature and ranks them by frequency. Symbol files saved from each shipped build let the service turn addresses into function names, so symbols must be archived for every release. The handler has to work when the heap is corrupt or memory is exhausted, which means pre-allocated buffers and minimal code. Privacy rules govern what is included.",
    k: [
      "In-process handler versus a separate watchdog process: in-process is simple but may fail in a corrupted state; a watchdog survives it and also catches hangs, at the cost of a second process.",
      "Small minidump versus full memory dump: small uploads fast and avoids privacy risk; full is far more informative but huge and sensitive.",
      "Opt-in versus opt-out reporting: opt-out gives much better data and raises consent and legal questions.",
    ],
    p: [
      "Symbols are not archived for a shipped build, so the top crash reads as raw addresses and can never be resolved.",
      "The handler allocates memory or takes a lock while handling an out-of-memory crash, deadlocking instead of writing the report.",
    ],
    v: "Trigger a deliberate crash in a shipping build. A dump arrives at the collection service within minutes, resolves to the exact function and line with archived symbols, and includes build id, log tail and breadcrumbs.",
    dep: ["logging-and-assertions", "platform-abstraction", "memory-allocators", "telemetry-and-analytics"],
  },
  "telemetry-and-analytics": {
    s: "Structured events sent from live games to a backend, so teams can measure player behavior, performance and failures at scale.",
    d: "The game emits events with a schema (name, timestamp, session, build, properties) into a local buffer. A batching client compresses and uploads them when conditions allow, and retries on failure. The backend validates, stores and aggregates them for dashboards, funnels and alerts. The same pipeline carries performance samples (frame time by hardware class) and crash counts, making it possible to see problems that testing never will. The design questions are what to measure, how to keep volume and cost under control through sampling, how to respect consent and privacy law, and how to evolve event schemas without breaking historical analysis.",
    k: [
      "Strict schemas versus free-form properties: schemas make analysis reliable and validate at the source; free-form is quick to add and quickly becomes impossible to query.",
      "Send immediately versus batch and sample: immediate gives real-time visibility but costs battery and bandwidth; batching and sampling are cheap but delay data.",
      "Client-side event emission versus server-derived metrics: server-derived data cannot be spoofed or blocked, but sees only what crosses the network.",
    ],
    p: [
      "Events are added with no owner or purpose, volume grows without limit, and the bill arrives before anyone has made a decision with the data.",
      "Telemetry sends personal data without consent, or fails offline and silently drops the first play session of new players.",
    ],
    v: "Play a scripted session offline then online. Every expected event arrives exactly once, in order, with correct schema and build id; a deliberately malformed event is rejected and counted; no event is sent when consent is declined.",
    dep: ["events-and-messaging", "serialization", "platform-abstraction", "config-and-console-variables"],
  },
  "deterministic-replay": {
    s: "Recording inputs and random seeds so a play session can be re-run exactly, reproducing bugs, driving regression tests and powering features like killcams.",
    d: "If the simulation is a pure function of its initial state and an input stream, then storing the inputs and a seed is enough to re-create the run. A replay system captures them per fixed step, and plays them back by feeding the same stream into the same build. Checksums of world state taken every few frames detect the first divergence, which pinpoints a determinism bug. It requires a fixed time step, controlled random number generators, stable iteration order and no hidden dependence on wall-clock time or thread timing. Replays are tied to a build version unless the simulation is carefully frozen.",
    k: [
      "Record inputs versus record state snapshots: inputs are tiny but demand strict determinism; snapshots are robust to code changes but large and slower to scrub.",
      "Periodic state checksums versus full verification: checksums are cheap and find the divergence frame; full state compare finds the field but costs memory.",
    ],
    p: [
      "Iterating a hash map by pointer address produces a different order each run, so the replay drifts after a few seconds.",
      "A replay recorded on one build is played on the next; a tuning change shifts results and bug reports become unreproducible.",
    ],
    v: "Record a ten-minute session, replay it on the same build three times and on a second machine. Per-frame state checksums match at every sample point; if one is deliberately altered, the first mismatch frame is reported.",
    dep: ["determinism", "fixed-step-and-determinism", "game-loop", "time-system", "serialization"],
  },
  // ---------- plat ----------
  "platform-sdks": {
    s: "Vendor-supplied libraries for each target platform's accounts, storage, networking, input and lifecycle, wrapped behind the engine's own interface.",
    d: "Every platform provides its own APIs for sign-in, presence, saved data, achievements, entitlements and system overlays, often with strict rules about when and how they must be called. The engine defines a platform service interface (user, storage, store, session) and implements it once per platform, so game code never calls vendor functions directly. Most calls are asynchronous and can fail at any time, for example when a network drops or a user switches accounts. The SDKs are often under confidentiality, so the abstraction also keeps restricted code in separate repositories and builds.",
    k: [
      "Lowest common denominator interface versus exposing platform-specific features: common is simple for gameplay code but hides useful features; extensions give polish but spread conditionals through the game.",
      "Synchronous-looking wrappers versus explicit async with results: sync wrappers are easier to write but block threads; explicit async is honest about latency and failure.",
    ],
    p: [
      "Gameplay code calls a vendor function directly in one place; the port to the next platform then touches hundreds of files.",
      "The user signs out or the network drops mid-call and the callback arrives after the object it refers to was destroyed.",
    ],
    v: "Run an automated conformance suite against every platform implementation: sign in, read and write a save, grant an achievement, and handle a forced sign-out and offline mode. Each backend passes the same cases, including failure injection.",
    dep: ["platform-abstraction", "app-lifecycle", "events-and-messaging"],
  },
  "store-and-dlc": {
    s: "Integration with a storefront for purchases, ownership checks, downloadable content and in-game currency, including verifying what each player is allowed to use.",
    d: "The store service queries what the signed-in account owns and exposes that as entitlements: the base game, expansions, cosmetics, consumables. Purchases begin in a store overlay and complete asynchronously, so the game must handle pending, canceled, refunded and restored purchases. Downloadable content ships as separate packages mounted into the virtual file system, with content flagged by entitlement. For online games the server, not the client, verifies receipts before granting items. Cross-platform games add the difficulty that each store has its own catalog, pricing, refund and currency rules.",
    k: [
      "Server-side receipt validation versus trusting the client: server-side is the only defense against forged purchases but needs a backend; client-only is simple and trivially bypassed.",
      "Content gated by file presence versus by entitlement checks: presence is simple but pirates just copy files; entitlement checks add friction and edge cases for offline play.",
      "Consumables versus permanent unlocks as separate flows: different rules for refunds and restoration prevent duplicated or lost items.",
    ],
    p: [
      "A purchase completes after the app closed; on next launch the game never reconciles pending transactions and the player paid for nothing.",
      "A refund is processed by the store but the item remains in the player's inventory forever.",
    ],
    v: "In the store's sandbox environment, run purchase, cancel, interrupted-purchase, refund and restore flows. After each, the ownership shown in-game matches the store's record and the server's grant ledger.",
    dep: ["platform-sdks", "accounts-and-leaderboards", "virtual-file-system", "inventory"],
  },
  "cloud-saves": {
    s: "Synchronization of save data to a remote service so a player's progress follows them across devices, with rules for resolving conflicts.",
    d: "The save system writes local files; the sync layer uploads them under the user's account and downloads newer versions on launch or resume. Because two devices can change progress while offline, the layer has to detect conflict (typically with version numbers or timestamps plus a device identifier) and either merge, pick one automatically, or ask the player. Saves need a versioned format, bounded size and integrity checks so a corrupted upload does not destroy the good copy. Platforms impose quotas and certification rules about what happens when sync fails.",
    k: [
      "Whole-file sync versus structured merge: whole-file is simple and predictable, but one device always loses; structured merge preserves more progress and needs per-field rules.",
      "Last-writer-wins versus asking the player: automatic is seamless and can destroy hours of play; asking is safe and interrupts.",
    ],
    p: [
      "Device clocks differ, so timestamp comparison picks the older save as the newer one and overwrites real progress.",
      "A newer game version writes a save format an older install cannot read, and the older install treats it as corrupt and deletes it.",
    ],
    v: "With two devices, play offline on both and reconnect. The conflict is detected and resolved as designed with no data loss. Interrupt an upload halfway and confirm the previous good save is intact and still loadable.",
    dep: ["save-load", "platform-sdks", "accounts-and-leaderboards", "serialization"],
  },
  "accounts-and-leaderboards": {
    s: "Player identity, friends, presence, achievements and ranked score tables, provided by a platform or by the game's own backend.",
    d: "An identity layer maps the platform user to a stable game account, possibly linking several platforms to one profile. On top sit social features: friends lists, invites, presence, and achievements that unlock from gameplay events. Leaderboards store scores by category and period and return ranked slices, such as top ten or around the player. Because clients cannot be trusted, scores should be validated or computed on a server, and cheaters need a removal path. Privacy, age and block rules apply to all of it, and every call must tolerate offline play and rate limits.",
    k: [
      "Platform identity only versus the game's own account system: platform identity is free and trusted but locks the player to one ecosystem; an own account system enables cross-play at the cost of operating it.",
      "Client-submitted scores versus server-computed: client-submitted is trivial and easy to forge; server-computed is credible but requires the server to run the simulation or verify a replay.",
    ],
    p: [
      "Achievements unlock from a client event that a cheat tool can fire, devaluing them for everyone and, on some platforms, failing certification.",
      "Leaderboard queries hit the backend on every menu open and a popular launch day rate-limits the whole player base.",
    ],
    v: "Submit scores and unlock achievements through the real service from two linked accounts. Rankings, around-me queries and achievement state match across devices; a forged score from an unauthenticated client is rejected.",
    dep: ["platform-sdks", "events-and-messaging", "authority-and-anti-cheat"],
  },
  "live-ops-and-remote-config": {
    s: "Server-delivered settings, events and content that let a team change a live game's tuning, schedules and features without shipping a new build.",
    d: "At launch the client downloads a configuration document and keeps it cached. Values override defaults in the configuration system: drop rates, event schedules, store offers, feature flags. Targeting rules allow different values by country, platform, build or experiment group, enabling staged rollouts and A/B tests, with kill switches to turn off a broken feature immediately. The danger is that live changes are production code without a build: a bad value can break economy, crash clients or invalidate a save. Validation, versioning, audit trails and rollback are therefore as important as the delivery itself.",
    k: [
      "Fetch at launch versus continuous polling or push: launch is simple and consistent for a session; polling and push react fast but can change behavior under the player mid-game.",
      "Strongly typed validated config versus loose key-value: typed catches errors before they go live; loose is flexible and easy to break.",
      "Bundled safe defaults versus server-required: defaults let the game run offline, while server-required guarantees the latest rules but fails without a connection.",
    ],
    p: [
      "A typo in a remote value ships to all players instantly with no staging or rollback, and the team learns about it from reviews.",
      "The cached config is stale or missing at first launch offline, and the game crashes on a null value that always had a server answer.",
    ],
    v: "Publish a change to ten percent of a test cohort. Only targeted clients see it; revert via the kill switch and clients return to the prior values within the polling window. Starting offline uses bundled defaults with no errors.",
    dep: ["config-and-console-variables", "data-tables-and-curves", "telemetry-and-analytics", "platform-sdks"],
  },
  "patching": {
    s: "Delivering updates to an installed game by sending only what changed, applying them safely and leaving a working install if anything goes wrong.",
    d: "Content is packaged in chunks with manifests listing a hash per file or block. An updater compares the installed manifest to the new one, downloads changed chunks from a distribution network, verifies them and swaps them in atomically. Binary deltas shrink downloads further. Platform stores often handle distribution themselves, but the game may also run its own patcher for faster hotfixes or downloadable content. Package layout matters: if one small change rewrites a huge archive, patches balloon. Clients on very old versions need a path forward, and multiplayer games must reject clients on incompatible builds.",
    k: [
      "Large pack files versus many small chunks: large files load efficiently but a small change forces a big patch; chunks keep patches small and increase file-system overhead.",
      "Binary delta versus whole changed-file replace: delta saves bandwidth and costs build time and a fragile base version; replace is simple and robust.",
    ],
    p: [
      "An interrupted update leaves a mix of old and new files, and the game fails to start until the player reinstalls.",
      "Asset order in the package changes with each build, so a one-texture fix produces a multi-gigabyte patch.",
    ],
    v: "Patch from version N-1 and N-3 to N while killing the process at random points during download and apply. Every run ends with a bootable game matching version N hashes; patch size for a one-texture change is under a few megabytes.",
    dep: ["cooking-and-packaging", "virtual-file-system", "platform-sdks", "build-cook-deploy"],
  },
  "mod-distribution": {
    s: "A system for finding, downloading, installing and loading player-made content, with the engine providing the formats and safety limits that make it possible.",
    d: "Mods are packages of data, scripts or assets that the virtual file system mounts over or beside base content. A distribution service (the platform's workshop or the game's own) handles upload, versioning, dependencies, ratings and updates. The engine must expose a documented data format and scripting surface, load order rules, and a way to detect and disable a mod that breaks things. Security is the main concern, since scripts from strangers run on players' machines. Sandboxed scripting, capability limits and signing reduce risk. Multiplayer needs mod lists to match between server and clients.",
    k: [
      "Data-only mods versus script-capable mods: data-only is safe and limited; scripts allow total conversions and require a sandbox with limits on files, network and time.",
      "Overlay by path versus explicit patch operations: overlay is easy to author and conflicts silently; patch operations merge and are harder to write.",
      "Mods as first-class dependencies versus loose files: first-class gives versioning and resolution, at the cost of a package manager.",
    ],
    p: [
      "Two mods replace the same file; the load order silently decides which wins and a crash report blames the base game.",
      "A script mod can read the player's files or open sockets because the sandbox exposed the full standard library.",
    ],
    v: "Install two mods that touch the same asset, then toggle each and reorder them. The result follows documented order, a deliberately crashing mod is auto-disabled with a clear message, and a sandboxed script cannot open a file outside its folder.",
    dep: ["virtual-file-system", "scripting-vm-and-bindings", "data-tables-and-curves", "platform-sdks"],
  },
  "console-certification": {
    s: "The platform holder's required test list that a game must pass before release, covering suspend, sign-out, storage, controllers, error messages and performance.",
    d: "Each console maker publishes a technical requirements document with hundreds of rules, and submits the build to its own test lab. Typical rules cover what happens when the controller disconnects, the user signs out, the disc is ejected, the network drops, storage is full, or the system suspends and resumes; required wording and button icons; save data handling; startup time; and memory limits. Failing means resubmitting, which costs weeks. The practical approach is to build each requirement into the platform service layer and the lifecycle code from the start, and to run an internal checklist continuously, not at the end.",
    k: [
      "Treat requirements as engine features from day one versus a late checklist pass: early is far cheaper and pervades the design; late finds structural problems when changing them is expensive.",
      "Strict internal pre-submission lab versus relying on the holder's lab: internal tests find failures in hours; the external cycle takes days or weeks per iteration.",
    ],
    p: [
      "Suspend and resume is tested only the week before submission, and a long-lived network session or audio device does not recover.",
      "Required system messages are hard-coded text, which fails when the game is localized into a language the platform requires.",
    ],
    v: "Run the requirement list as an automated and manual matrix on target hardware: unplug controllers, sign out, fill storage, suspend for an hour and drop the network at each game state. Each case ends in the documented behavior.",
    dep: ["platform-sdks", "app-lifecycle", "save-load", "localization", "focus-and-gamepad-nav"],
  },
  "ratings-and-parental-controls": {
    s: "Content ratings metadata and platform parental settings that limit what a player can see, buy, chat about or play based on age.",
    d: "Rating boards in each region classify a game from a questionnaire and review, and stores require the result. In the engine this becomes data: content descriptors, region variants that remove or change assets (for example blood or symbols), and flags in the build. Platform parental controls expose the account's age restrictions, spending limits, chat and online-play permissions, and playtime caps, which the game must query and obey in menus, purchases and communication features. Rules differ by region and law, so these checks live in one service layer, not scattered through gameplay.",
    k: [
      "Region variants as separate builds versus runtime content flags: separate builds guarantee nothing restricted is present; flags are simpler to maintain and risk leaking restricted assets.",
      "Query parental settings once at startup versus on every sensitive action: startup is cheap but stale after a change; per-action is accurate and needs async handling.",
    ],
    p: [
      "Restricted content is disabled by a visual flag but still present in the package, and a data miner finds it, contradicting the submitted rating.",
      "Chat is hidden in one menu while an in-game text path remains, so a child account can still receive messages.",
    ],
    v: "Set a child account with chat blocked, spending capped and a region flag. Every chat entry point, purchase flow and variant asset is blocked or substituted, and a package scan finds no restricted file in that region's build.",
    dep: ["platform-sdks", "accounts-and-leaderboards", "store-and-dlc", "localization"],
  },
  // ---------- script ----------
  "scripting-vm-and-bindings": {
    s: "A language runtime embedded in the engine, plus the generated glue that exposes engine objects and functions to scripts, so gameplay can change without recompiling.",
    d: "The virtual machine runs bytecode or compiled code for a scripting language inside the game process. Bindings expose engine types, usually generated from reflection data so they stay in sync, and handle conversion of values and ownership between the two worlds. Hot reload swaps script code while the game runs. The VM must be sandboxed for untrusted content, time-limited so a runaway loop cannot freeze a frame, and integrated with the garbage collector or lifetime rules so that scripts never hold references to destroyed objects. Calls across the boundary have a cost, so hot loops stay on the native side.",
    k: [
      "Interpreted bytecode versus ahead-of-time or JIT compilation: bytecode is portable and allowed on locked-down platforms; compiled code is faster but may be forbidden on some targets.",
      "Generated bindings from reflection versus hand-written: generated stay correct automatically; hand-written can expose a cleaner, safer surface.",
      "Garbage-collected scripts versus manual or reference-counted lifetimes: GC is easy for designers but causes pauses; deterministic lifetimes avoid pauses and leak on cycles.",
    ],
    p: [
      "A script keeps a handle to an entity that was destroyed; the handle is reused by a new entity and the script silently modifies the wrong object.",
      "Garbage collection runs mid-frame and produces a periodic hitch that is blamed on rendering for weeks.",
    ],
    v: "Run a script that calls into the engine 100,000 times per frame in a profile build and measure the call overhead. Destroy an entity a script references and confirm the next access fails safely. Reload a script mid-play with state preserved.",
    dep: ["reflection-and-types", "memory-allocators", "game-object-model", "events-and-messaging"],
  },
  "visual-scripting": {
    s: "A node-and-wire editor that lets designers express gameplay logic without writing code, compiled or interpreted by the engine at runtime.",
    d: "Nodes represent events, actions, conditions and data operations; wires carry execution order and values. The graph is stored as data and either interpreted or compiled to the scripting VM or native code. Node libraries are generated from reflected engine functions so that new capabilities appear automatically. Good tooling includes live debugging that highlights firing wires, search, comments, sub-graph reuse and diff-friendly files. Graphs scale poorly if left unstructured: large ones become unreadable and slow to review, so teams set conventions on size and use functions or macros for repeated logic.",
    k: [
      "Interpret the graph versus compile it: interpretation supports instant editing and debugging; compilation runs much faster and needs a build step and debug mapping back to nodes.",
      "Visual only versus a code escape hatch: escape hatches unblock experts, but mixed projects split ownership and review practices.",
    ],
    p: [
      "Graphs are saved as one large binary blob, so two designers cannot merge changes and one person's work is discarded.",
      "A tick-driven graph runs on thousands of actors every frame and costs more than the native code it replaced.",
    ],
    v: "Build a graph with a branch, a loop and an event; run it in debug and see the active wires highlight. Compile it and confirm identical results on a test scenario, then measure per-frame cost for 1,000 instances.",
    dep: ["scripting-vm-and-bindings", "reflection-and-types", "editor-shell", "undo-redo"],
  },
  "data-tables-and-curves": {
    s: "Designer-editable tables and curves that hold game numbers such as stats, costs, drop rates and difficulty ramps outside code.",
    d: "Rows with typed columns are authored in a spreadsheet or table editor and imported as assets, keyed by stable identifiers so code and other data can reference them. Curves map an input (level, distance, time) to a value with interpolation. Because these assets are loaded at startup or on demand, the importer validates types, references and ranges so bad data fails at build time. Hot reload lets designers tune a running game. Large games hold thousands of tables, so ownership, naming and cross-table references need conventions, and some data is compiled into a compact binary form.",
    k: [
      "Spreadsheet-sourced tables versus an in-editor table tool: spreadsheets suit designers and diff badly; in-editor gives validation and references and is yet another tool to build.",
      "String keys versus numeric identifiers: strings are readable and slow to compare and easy to typo; numeric ids are fast and need generated names.",
      "Load all tables up front versus on demand: up front is simple and costs startup memory; on demand saves memory and adds hitches.",
    ],
    p: [
      "A row is renamed and a quest referencing it by string key silently resolves to nothing, discovered only when a player gets stuck.",
      "Designers change a curve and balance shifts everywhere with no history, because the file was edited directly and not versioned.",
    ],
    v: "Import a table with a bad reference, a wrong type and an out-of-range value; each is rejected with row and column. Edit a value while the game runs and see the change without restart; the compiled form matches the source.",
    dep: ["serialization", "reflection-and-types", "hot-reloading", "asset-database"],
  },
  "coroutines-and-async": {
    s: "A way to write multi-step gameplay logic as sequential code that pauses for time, events or loading and resumes later, without blocking the frame.",
    d: "A coroutine is a function that can suspend itself and be resumed by the engine on a later frame, so a cutscene reads as 'wait two seconds, play animation, wait until it finishes' instead of a state machine with a variable for each step. A scheduler holds suspended coroutines and the condition each is waiting on. Async operations such as asset loads and network requests use the same mechanism. The engine has to cancel coroutines when their owner is destroyed, and run them at defined points in the frame so ordering is predictable. Errors and cancellation across long waits are the hard parts.",
    k: [
      "Coroutines tied to an owner object versus free-running: tied lifetimes cancel automatically on destroy; free-running are flexible and leak or touch dead objects.",
      "Resume at a fixed point in the frame versus on completion: fixed points are deterministic and easy to reason about; immediate resumption is lower latency and reorders execution.",
    ],
    p: [
      "A coroutine waits on a condition that can never become true after an object is destroyed, and it lives forever, leaking memory and running checks every frame.",
      "Exceptions inside a suspended routine are swallowed by the scheduler and the sequence just stops with nothing in the log.",
    ],
    v: "Start 10,000 coroutines with owners, destroy half of the owners, and run 100 frames. Destroyed owners' routines are cancelled with no callbacks, the rest finish at the expected frames, and an injected error appears in the log.",
    dep: ["game-loop", "scripting-vm-and-bindings", "timers", "game-object-model"],
  },
  "timers": {
    s: "A scheduler that fires callbacks after a delay or at intervals, measured in game time so they obey pause and slow motion.",
    d: "Timers are stored in a priority queue or a hierarchical timing wheel ordered by expiry, and the game loop advances them once per step. They run on game time, not wall time, so pausing the game pauses them, and a replay or fixed step reproduces them exactly. Handles allow cancel and reschedule. Callbacks can create further timers, which the scheduler must handle without breaking iteration. Different clocks (gameplay, UI, real time) exist because a pause menu still needs animation. The common failure is a callback capturing an object that has been destroyed by the time it fires.",
    k: [
      "Priority queue versus timing wheel: a queue is simple and logarithmic per insert; a wheel is constant time and better for huge numbers of short timers.",
      "Multiple clocks (game, UI, real time) versus one: multiple clocks keep menus alive while paused; one is simpler and makes pause behavior awkward.",
    ],
    p: [
      "A timer callback fires after its owning entity was destroyed and dereferences freed memory.",
      "Timers use wall-clock time, so a debugger breakpoint or app suspend makes every timer fire at once on resume.",
    ],
    v: "Schedule timers at known delays, pause for ten seconds, set 0.25x time scale, and resume. Firing times follow game time exactly. Cancel timers from inside another timer's callback and confirm no crash and no stray fires.",
    dep: ["time-system", "game-loop", "events-and-messaging"],
  },
  "state-machines": {
    s: "A structure where an object is in exactly one state at a time and changes state through defined transitions, used for characters, UI flows and game phases.",
    d: "Each state owns its enter, update and exit behavior, and transitions are guarded by conditions or events. Hierarchical machines let states nest and share transitions, which avoids the explosion of states a flat machine needs. Data-driven machines are authored in tools and loaded as assets; code-driven ones are simpler and type-checked. Because gameplay events can arrive at any time, the machine must define what happens to events in states that do not handle them, and what happens when a transition is requested during another. Debugging needs the current state and recent transitions visible.",
    k: [
      "Flat versus hierarchical states: flat is easy to understand at small size; hierarchy removes duplicated transitions and complicates the order of exit and enter calls.",
      "Transitions evaluated by polling versus triggered by events: polling is easy and costs every frame; events are efficient and need disciplined sending.",
      "Code versus data-driven definition: code is safe and quick to start; data lets designers iterate and needs a tool and validation.",
    ],
    p: [
      "State exit code releases a resource that the next state's enter code expects to still exist, and the order of the two calls breaks it.",
      "A transition is requested inside an update and processed immediately, so a state is exited while its own method is still on the stack.",
    ],
    v: "Drive the machine with a scripted event sequence including illegal and simultaneous events. The recorded transition log matches the expected trace, each exit runs once per entry, and no state is left half-entered.",
    dep: ["events-and-messaging", "game-object-model", "logging-and-assertions"],
  },
  "behavior-trees": {
    s: "A tree of tasks and conditions that an AI character evaluates repeatedly to decide what to do, composed from reusable sequence, selector and decorator nodes.",
    d: "Each tick, the tree is traversed from the root; leaf nodes run actions or checks and return success, failure or running. Sequence nodes run children until one fails, selectors run until one succeeds, and decorators modify children with conditions, cooldowns or loops. Nodes read and write a shared blackboard of values. Trees are authored visually and are easy for designers to read, and subtrees can be reused. Efficiency depends on not re-evaluating everything every tick: event-driven re-evaluation, with conditions that abort lower-priority branches only when relevant data changes.",
    k: [
      "Tick the whole tree versus event-driven re-evaluation: ticking is simple and costs per agent per frame; events are efficient and require careful dependency tracking on the blackboard.",
      "Behavior tree versus utility scoring for choice: trees are predictable and authorable; utility handles many competing options more smoothly and is harder to debug.",
    ],
    p: [
      "Interrupting a running action by an aborting condition leaves it half-finished, such as a character frozen mid-animation or holding a reserved cover point.",
      "A blackboard key is written by two nodes with different meanings and the character oscillates between two behaviors.",
    ],
    v: "Run a tree against a scripted scenario and log node results per tick; the trace matches the expected branch order. Force a higher-priority condition during an action and confirm the action cleans up and the new branch runs.",
    dep: ["decision-making", "state-machines", "events-and-messaging", "timers"],
  },
  "ability-system": {
    s: "A framework for actions with costs, cooldowns, effects and modifiers, such as spells, weapons and perks, defined as data rather than special-case code.",
    d: "An ability describes requirements, costs, targeting and a sequence of effects. Effects change attributes (health, speed) instantly or for a duration through modifiers that stack by defined rules. Tags describe state ('stunned', 'burning') and gate which abilities can run. Abilities are data so designers can create hundreds of variants, with scripts for the exceptions. In multiplayer, activation is predicted locally and confirmed by the server, so attribute changes need rollback. The hard parts are the order in which modifiers combine, stacking and expiry rules, and keeping thousands of data-defined abilities balanced and bug-free.",
    k: [
      "Everything as data-defined effects versus per-ability code: data scales to many abilities and falls short for unusual mechanics, which need a code or script hook.",
      "Attribute modifiers recomputed from a list versus mutated in place: recomputing makes removal and ordering correct; mutation is cheaper and drifts when effects expire out of order.",
      "Tags for state gating versus boolean flags: tags compose and query well; flags are simple until there are hundreds.",
    ],
    p: [
      "A temporary buff is applied as 'add 10' and removed as 'subtract 10' after another effect changed the base, leaving permanent drift in the stat.",
      "Server and client evaluate cooldowns with different time sources, so predicted abilities are rejected and feel broken at high latency.",
    ],
    v: "Apply, stack, refresh and expire a set of overlapping buffs and debuffs in a test; final attributes equal the value computed from base plus active modifiers at every step, and equal the base after all expire.",
    dep: ["data-tables-and-curves", "events-and-messaging", "state-machines", "replication", "game-object-model"],
  },
  "inventory": {
    s: "The system that stores items a character owns, with stacking, slots, equipment, weight and persistence, and that exposes them to UI and gameplay.",
    d: "Items are defined in data (a definition with stable id, stack size, tags and behavior) and instantiated with per-instance state such as durability or random modifiers. Containers hold instances in slots or grids and enforce rules for stacking, capacity and what can be equipped. Operations (move, split, swap, use, drop) are transactions that either fully succeed or leave things unchanged, because failures cause duplication or loss. In multiplayer the server owns the inventory and clients send requests. Saved inventories must survive item definitions being renamed, rebalanced or removed.",
    k: [
      "Definition plus instance versus one object per item: splitting keeps memory small and data central; one object per item is simple and wastes memory in large stacks.",
      "Server-authoritative operations versus optimistic client moves: authoritative prevents duplication exploits; optimistic feels instant and needs rollback.",
      "Atomic multi-step transactions versus sequential edits: atomic cannot lose items on failure but needs a staged copy; sequential is easy and can leave half-finished moves.",
    ],
    p: [
      "A swap is implemented as remove then add; a failure or disconnect between them deletes the item, or an interrupted move duplicates it.",
      "A removed item definition makes old saves fail to load because the id resolves to nothing.",
    ],
    v: "Fuzz thousands of random move, split, drop and trade operations with injected failures and disconnects. Total item count by definition id is conserved, and every saved inventory reloads with no unknown item references.",
    dep: ["data-tables-and-curves", "save-load", "serialization", "replication"],
  },
  "quests-and-dialogue": {
    s: "The systems that track objectives and story progress and drive conversations, using authored data, conditions and world state.",
    d: "A quest is a graph or list of objectives that listen for gameplay events and update state. Dialogue is a graph of lines, choices and conditions, each line tied to a speaker, voice clip, subtitle and animation. Both read and write persistent world facts, such as flags and counters, which the save system stores. Authoring tools let writers work without a programmer, and everything is localized, with voice-over aligned to text. The difficulty is state: players do things out of order, so every quest and conversation has to handle every possible combination of earlier outcomes and still make sense.",
    k: [
      "Quests as explicit state machines versus emergent from world facts: explicit is predictable and easy to debug; fact-driven handles out-of-order play better and is harder to follow.",
      "Writer-friendly graph tools versus a plain text scripting format: graphs are approachable but hard to diff; text diffs and merges well and needs training.",
    ],
    p: [
      "A player kills a character before the quest that needs them starts, and no fallback exists, so the quest can never be completed.",
      "Localized lines vary in length and voice-over timing; subtitles and animation fall out of sync in other languages.",
    ],
    v: "Run an automated walkthrough that executes quest steps in many orders, including killing or skipping key characters. Every run reaches either completion or a defined fallback; no quest is left without reachable objectives. Save and reload mid-dialogue.",
    dep: ["data-tables-and-curves", "events-and-messaging", "save-load", "localization", "state-machines"],
  },
  // ---------- ai ----------
  "navmesh-generation": {
    s: "The offline or runtime process that converts level geometry into a mesh of walkable polygons that characters can path across.",
    d: "Generation voxelizes the collision geometry at a resolution matched to the agent's radius and height, marks voxels where the agent can stand, builds regions, traces contours and triangulates them into convex polygons with links between neighbors. Extra data such as jump links, doors, and surface or area types (water, hazard) are added by annotation. Large or changing worlds are tiled so only affected tiles rebuild when a door opens or a wall is destroyed. Different agent sizes need different meshes. The difficult cases are thin geometry, steps and slopes, and keeping dynamic rebuilds cheap enough for runtime.",
    k: [
      "Baked offline versus generated at runtime: baked is cheap and exact for static levels; runtime handles procedural or destructible worlds and costs CPU and memory.",
      "Tile size and voxel resolution: finer resolution follows geometry accurately and costs time and memory; coarse is fast and cuts corners.",
      "One mesh per agent size versus one conservative mesh: separate meshes route accurately; a single one is cheaper and wastes space for small agents.",
    ],
    p: [
      "Voxel resolution is too coarse and narrow doorways are filled in, so characters refuse to path through a door the player walks through easily.",
      "A dynamic obstacle rebuilds tiles synchronously on the game thread and each door opening causes a visible stall.",
    ],
    v: "Generate meshes for a test map with known features (stairs, narrow door, ledge). Sample random points and confirm each is reachable if and only if an agent capsule can physically walk there; rebuild a tile after moving an obstacle and time it.",
    dep: ["scene-queries", "narrowphase-and-shapes", "spatial-partitioning", "job-system"],
  },
  "pathfinding": {
    s: "Searching the navigation graph for a route between two points, typically with A* variants, and returning a smooth path that respects costs and agent size.",
    d: "A* expands polygons or graph nodes in order of cost plus a heuristic until it reaches the goal, then a funnel or string-pulling step turns the polygon corridor into straight waypoints. Area costs let characters prefer roads over swamp, and filters exclude areas some agents cannot use. Requests are queued and processed over several frames within a time budget, so hundreds of agents share the cost. Hierarchical search over clusters speeds up long routes, and paths are invalidated and repaired when the world changes. The problems are bad heuristics, huge searches for unreachable goals and the staleness of routes.",
    k: [
      "Synchronous queries versus a budgeted request queue: synchronous gives immediate answers and risks spikes; a queue bounds cost and delays answers by frames.",
      "Flat A* versus hierarchical: flat is simple and slows down on large maps; hierarchical is fast for long routes and costs precomputation and memory.",
    ],
    p: [
      "A goal inside an unreachable island sends the search across the whole navmesh every request, causing a spike each time an AI tries it.",
      "Agents follow a cached path through a door that has since closed and push against it forever.",
    ],
    v: "Issue 1,000 path requests including unreachable goals under a 1 ms per frame budget. Each returns a valid path or a failure within bounded frames, path costs match a reference search, and the per-frame cost never exceeds the budget.",
    dep: ["navmesh-generation", "job-system", "performance-budgets"],
  },
  "steering-and-crowds": {
    s: "Local movement that follows a path while avoiding other characters and obstacles, so groups move smoothly without walking through each other.",
    d: "Steering converts a path into per-frame velocity: seek the next waypoint, slow to arrive, and add separation or avoidance forces from neighbors. Reciprocal avoidance algorithms let agents choose velocities that do not collide, assuming others do the same. A spatial query finds neighbors cheaply. The result is passed to the character controller or animation as a desired velocity, with limits on acceleration and turn rate for believable motion. Crowds add shared flow fields for large groups heading to the same goal. Problems include jitter, deadlocks in corridors and conflicts between steering output and animation root motion.",
    k: [
      "Per-agent avoidance versus shared flow fields: per-agent handles varied goals and costs more per agent; flow fields are cheap for thousands of units with one goal.",
      "Steering outputs velocity versus applying movement directly: velocity lets physics and animation resolve the move; direct is simple and ignores collisions.",
    ],
    p: [
      "Two agents in a corridor each yield to the other and oscillate indefinitely because the avoidance rules are symmetric.",
      "Steering demands turns faster than the animation can play, so feet slide and characters appear to skate.",
    ],
    v: "Run 200 agents swapping positions across a plaza and through a corridor. No collisions or overlaps beyond tolerance, all arrive within a time limit, no agent is stuck, and measure per-agent cost in the frame.",
    dep: ["pathfinding", "spatial-partitioning", "character-controller", "blend-trees-and-state-machines"],
  },
  "decision-making": {
    s: "The logic that picks what an AI character does next, using state machines, behavior trees, utility scoring or planners.",
    d: "Decision making sits between perception (what the character knows) and action (movement, abilities, animation). Finite state machines suit simple characters; behavior trees give modular priority logic; utility systems score every option from weighted considerations and pick the best; goal-oriented planners search for a sequence of actions that reach a goal. Many games combine them, for example a tree choosing a high-level mode and utility choosing targets. Decisions run at a lower rate than the frame and are spread across agents. The core design problem is making behavior readable to players and debuggable by developers.",
    k: [
      "Authored logic versus planning: authored is predictable and easy to tune; planners recombine actions for emergent behavior and are hard to debug and budget.",
      "Re-decide every frame versus commit with hysteresis: every-frame responds quickly and flickers between options; commitment is stable and can feel slow to react.",
      "Central AI director versus fully independent agents: a director controls pacing and fairness; independent agents are simpler and can overwhelm the player.",
    ],
    p: [
      "Two options score almost equally and the character flips between them each decision, appearing to jitter or dither.",
      "All agents think on the same frame, creating a periodic spike when a wave of decisions lands together.",
    ],
    v: "Run a scripted scenario with fixed perception inputs and compare the chosen action sequence to expected traces. Vary scores slightly near ties and confirm no rapid flip-flopping, and stagger decision ticks for 500 agents with flat frame time.",
    dep: ["behavior-trees", "state-machines", "perception", "environment-queries"],
  },
  "perception": {
    s: "The simulated senses, such as sight, hearing and touch, that decide what an AI character knows about the world, limited to what it could plausibly sense.",
    d: "Sensors query the world on a schedule: a vision sensor tests targets inside a view cone with line-of-sight rays, a hearing sensor receives noise events with a loudness and range. Detected stimuli enter a short-term memory with a confidence and decay time, so a character remembers where it last saw the player. Team sharing can propagate knowledge to allies. Cost is controlled by spatial culling, staggered updates and limiting rays per frame. Fairness matters to players: detection should be consistent and telegraphed, not psychic, and not so strict that a character stares at the player without reacting.",
    k: [
      "Raycast line-of-sight versus approximate visibility from precomputed data: rays are exact and expensive; precomputed is cheap and wrong for dynamic cover and doors.",
      "Instant detection versus gradual awareness: gradual is fairer and more readable for stealth, and requires more states and tuning.",
    ],
    p: [
      "Every AI casts rays at the player every frame, and with a crowd the physics query budget is consumed by perception alone.",
      "Characters react to sounds through walls because noise events ignore occlusion, so players feel cheated.",
    ],
    v: "Place a target behind glass, a corner and in the dark; check detection against the expected result. Fire noise events at different distances and walls, and with 300 agents the perception cost stays within its budget.",
    dep: ["scene-queries", "spatial-partitioning", "events-and-messaging", "performance-budgets"],
  },
  "environment-queries": {
    s: "Spatial questions answered with scored candidate points, such as 'best cover position out of the enemy's sight, near me, with room to shoot'.",
    d: "A query generates candidate positions (a grid, a ring around a point, navmesh samples), filters them by hard rules (reachable, not in line of fire) and scores the survivors with weighted tests such as distance, visibility and clearance. The best one, or a random pick among the best, is returned to the decision logic. Queries run asynchronously, spread over frames, and are cached for a short time. They are authored as data so designers can tune them. Costs grow with candidates times tests, and expensive tests such as line traces are ordered last so cheap filters remove most candidates first.",
    k: [
      "Generate many candidates and score versus use a precomputed point set: generating adapts to the situation and costs more; precomputed points (hand-placed cover) are cheap and rigid.",
      "Pick the top score versus weighted random among the top few: top is optimal and predictable and exploitable; randomness is more natural.",
    ],
    p: [
      "Expensive visibility traces run on all candidates before cheap distance filters, turning one query into hundreds of raycasts.",
      "The best point is taken by several agents at once since results are not reserved, so they stack on one spot.",
    ],
    v: "Run a cover query in a test arena with known best positions; results match the expected set. Execute 100 concurrent queries and confirm cost stays under budget, and that two agents never reserve the same point.",
    dep: ["navmesh-generation", "scene-queries", "perception", "spatial-partitioning"],
  },
  "ai-debugger": {
    s: "Visualization and inspection for AI, showing paths, sensed targets, decision traces and navigation data on screen in the running game.",
    d: "Because AI failures look like personality ('why did he not attack?'), developers need to see inside. The debugger draws navmesh and paths, perception cones and memory, the active behavior tree nodes or utility scores with their weights, and blackboard values for a selected agent. It can pause and step AI ticks, and record a short history for scrubbing back after something odd happens. It is built on the runtime inspector and debug-drawing layers and fed by decision logging. Data for it is only collected when enabled, to avoid cost. Without it, tuning crowds of agents becomes guesswork.",
    k: [
      "Always log decision traces versus collect on demand: always-on catches rare events and costs memory; on demand is free and misses the incident.",
      "Visualize in the game viewport versus a separate tool: in-game keeps spatial context; a separate tool allows richer timelines and scrubbing.",
    ],
    p: [
      "Debug visualization reads AI state from another thread without locks and shows a mixture of old and new values that matches nothing real.",
      "The recorded history is capped so small that the interesting moment is gone by the time someone pauses the game.",
    ],
    v: "Select an agent in a running build and see its path, senses and active decision nodes. Pause, step one AI tick and scrub back ten seconds; shown values match the logged ones. With the debugger off, per-frame cost is unchanged.",
    dep: ["runtime-inspectors", "debug-drawing", "behavior-trees", "perception", "pathfinding"],
  },
  // ---------- ui ----------
  "widget-framework": {
    s: "The base UI toolkit of widgets, layout, styling, events and data binding on which menus and HUDs are built.",
    d: "A tree of widgets (panels, buttons, lists, text) is laid out by rules such as stacks, grids, anchors and flex-like sizing, so one screen adapts to many resolutions and aspect ratios. Styles come from shared themes. Input events route through the tree with capture and bubbling, and focus is handled by the navigation layer. Data binding connects widgets to game state so a health bar updates itself. The framework produces draw lists consumed by the UI renderer. Performance depends on avoiding full relayout and redraw each frame, using dirty flags and batching, since menus with thousands of elements can cost more than the 3D scene.",
    k: [
      "Retained widget tree versus immediate mode: retained supports styling, animation and accessibility; immediate is less code and re-evaluates everything every frame.",
      "Data binding versus manual push updates: binding removes glue code and hides when updates happen; manual is explicit and easy to forget.",
      "Authoring in a visual designer versus code: designer lets artists own screens; code is diffable and easier to refactor.",
    ],
    p: [
      "Any property change marks the whole tree dirty, so a ticking timer relayouts the entire screen every frame.",
      "Layout assumes a 16:9 screen, and ultrawide or portrait displays push controls off screen or overlap them.",
    ],
    v: "Load a screen with 5,000 widgets, change one label per frame, and verify only the affected subtree relayouts. Render it at 16:9, 21:9, 4:3 and portrait; nothing clips or overlaps, and a screenshot comparison matches approved references.",
    dep: ["text-and-ui-rendering", "events-and-messaging", "reflection-and-types", "memory-allocators"],
  },
  "focus-and-gamepad-nav": {
    s: "Moving a highlight between controls with directional input, so every screen is fully usable with a gamepad, keyboard or remote and not only a mouse.",
    d: "One widget holds focus at a time. Directional input moves focus to the nearest control in that direction, computed from layout positions or from explicit links set by the designer. Confirm and cancel actions map to select and back, and a stack of screens or modal layers decides where focus returns. When input devices change, the UI switches between pointer hover and focus highlight and updates button prompts to the device's icons. Focus must be restored sensibly after dialogs, list changes and loading. Typical issues are focus lost on a hidden control, unreachable widgets and navigation that jumps unpredictably across grids.",
    k: [
      "Automatic spatial navigation versus explicit links: automatic is free and surprising in irregular layouts; explicit is predictable and costs authoring time and maintenance.",
      "Single focus stack across all screens versus per-screen focus: a stack restores context after popups; per-screen is simple and loses position.",
    ],
    p: [
      "The focused widget is hidden or removed and focus becomes null, so a gamepad player cannot interact with the menu at all.",
      "Prompts show keyboard glyphs while the player uses a gamepad, because icon selection follows the last device with a delay or not at all.",
    ],
    v: "Walk every screen using only directional input and confirm or cancel. Every interactive control is reachable and reversible, focus is never null, closing a dialog returns focus to the opener, and prompts change within one frame of switching devices.",
    dep: ["widget-framework", "action-mapping", "device-layer", "accessibility"],
  },
  "localization": {
    s: "Making all player-facing text, audio, images and formats adaptable to each language and region, with string tables and tooling for translators.",
    d: "Source text is replaced by string keys looked up in per-language tables at runtime. Translators work from exported files with context, character limits and screenshots, and the pipeline re-imports and validates them. Strings need plural rules, gender and grammatical agreement, argument reordering, and number, date and currency formatting by region. Text length varies (German and Finnish run long), so layouts must flex. Fonts must cover the character set, and text shaping handles complex scripts. Voice, images and fonts can also be localized. Missing translations fall back to a default language visibly in development.",
    k: [
      "Keys as stable identifiers versus the English text as key: stable ids survive rewording and need tooling; text-as-key is easy and breaks translations on every edit.",
      "Format strings with named arguments versus positional: named arguments let translators reorder words; positional is simple and breaks grammar in many languages.",
      "Switch language at runtime versus restart: runtime is convenient and requires every widget to rebuild; restart is simple and annoying.",
    ],
    p: [
      "Sentences are built by concatenating translated fragments, which cannot be correct in languages with different word order or case.",
      "UI is tested only in English, so longer translations overflow buttons and truncate on ship day.",
    ],
    v: "Run the game in a pseudo-locale with expanded, accented, and right-to-left text. Every visible string comes from a table, no layout overflows, no key is missing, and plural forms render correctly for 0, 1, 2 and 5.",
    dep: ["text-shaping-and-rtl", "serialization", "data-tables-and-curves", "text-and-ui-rendering"],
  },
  "text-shaping-and-rtl": {
    s: "Turning a string into the correct sequence of glyphs and positions for every script, including ligatures, combining marks and right-to-left or mixed-direction text.",
    d: "Characters are not glyphs. Shaping applies font rules to choose glyph forms (Arabic letters change by position), apply ligatures and attach combining marks. The bidirectional algorithm reorders mixed left-to-right and right-to-left runs for display. Line breaking follows script-specific rules (no spaces in some languages), and cursors, selection and hit testing must work on the shaped result. Fallback fonts cover characters missing from the primary one. Results are cached by string and style, since shaping is costly. Layout and alignment mirror for right-to-left locales. Most failures are treating text as one glyph per character.",
    k: [
      "Use a full shaping library versus a simple glyph-per-character path: the full library is correct for all scripts and adds size; the simple path is small and breaks entire languages.",
      "Mirror the whole UI for right-to-left versus text only: whole-UI mirroring feels native and doubles layout testing; text-only is easier and feels wrong.",
    ],
    p: [
      "Arabic text renders as disconnected isolated letters in reversed order, because shaping and bidi reordering were skipped.",
      "Caret movement and selection step through glyphs, not user-perceived characters, splitting an emoji or combined letter in half.",
    ],
    v: "Render reference strings in Arabic, Hebrew, Devanagari, Thai and mixed English-numeral text, and compare to reference images. Move a caret through each and delete, with selection landing only on whole characters.",
    dep: ["text-and-ui-rendering", "localization", "containers-and-utilities"],
  },
  "accessibility": {
    s: "Features that let people with visual, hearing, motor or cognitive differences play: remapping, subtitles, scalable text, color-safe design, screen reader support and difficulty options.",
    d: "Accessibility touches every layer. UI exposes a semantic tree (roles, names, values) to the platform's screen reader and supports text scaling and high contrast. Audio has subtitles, captions that describe sounds, and separate volume channels. Input offers full rebinding, hold-versus-toggle options and one-handed schemes. Rendering avoids color-only signals and offers colorblind modes, motion reduction and flash limits. Gameplay can offer assists. Retrofitting is costly, so the cheapest approach is to make these options standard parts of the widget, input and audio systems from the start, and test with players who use them.",
    k: [
      "Semantic UI tree built into the widget framework versus bolted on later: built-in stays correct as screens change; retrofitting needs a parallel structure that rots.",
      "Per-game option screens versus platform-level settings: platform settings are consistent and cannot cover game-specific needs.",
    ],
    p: [
      "Critical information is conveyed only by color or only by sound, so players who cannot see red or hear a cue are blocked.",
      "Subtitles are on by default but tiny, low contrast and unscalable, and they cover the action.",
    ],
    v: "Play a full session with only the screen reader, then only one hand, then with color filters simulating color blindness, then muted. Every critical state is perceivable and every action reachable; subtitle size and contrast pass a measured threshold.",
    dep: ["widget-framework", "rebinding", "localization", "device-and-mixer"],
  },
  "hud-and-menus": {
    s: "The screens that present game information and let the player operate the game: health and ammo displays, maps, inventory screens, settings and the pause menu.",
    d: "HUD elements read gameplay state through bindings or events and draw over the scene, with layout that respects safe areas on televisions and notches on phones. Menus are stacks of screens with transitions, modal dialogs and shared navigation. Screens load asynchronously and show a loading state without blocking. A presentation layer separates view from game state so that UI does not own gameplay logic and can be redesigned freely. The challenges are keeping the HUD informative without clutter, scaling for every display, and ensuring screens work in every game state including pause, death, loading and disconnection.",
    k: [
      "UI reads game state directly versus through a view-model layer: direct is quick; a view model keeps logic out of widgets and makes screens testable without the game running.",
      "Screen stack with push and pop versus a flat state machine: a stack matches modal flows naturally; a state machine gives total control and more code.",
    ],
    p: [
      "Gameplay logic lives in a button's click handler, so the same action done from a hotkey behaves differently or bypasses checks.",
      "HUD elements sit at screen edges and are cut off by television overscan or a phone's camera cutout.",
    ],
    v: "Open every screen from every game state (playing, paused, dead, loading, disconnected) and navigate back. No screen is unreachable or soft-locks; safe-area overlays show all HUD elements inside bounds on each target display.",
    dep: ["widget-framework", "focus-and-gamepad-nav", "events-and-messaging", "localization", "gameplay-framework"],
  },
  "in-world-ui": {
    s: "Interface elements placed inside the 3D scene, such as health bars above heads, floating prompts, diegetic screens and VR panels.",
    d: "Widgets are either projected from world positions to screen space each frame, or rendered into a texture applied to a surface in the world. Projected elements need culling, distance scaling, fading and collision-free placement to avoid overlap. Render-to-texture panels need their own input path: a ray from the cursor or controller is intersected with the surface and converted to panel coordinates. Depth and occlusion rules decide whether elements show through walls. In virtual reality, panels must be placed at comfortable distances and have readable text at the headset's resolution. Hundreds of labels need pooling and batching.",
    k: [
      "Screen-space projected overlays versus textured quads in the world: overlays stay crisp and ignore depth; world quads fit the scene and blur at angles and distance.",
      "Pool and batch labels versus one widget per entity: pooling bounds cost with many entities and complicates lifetime handling.",
    ],
    p: [
      "Health bars for every enemy in a crowd are all drawn at once, overlapping into an unreadable pile and costing hundreds of draw calls.",
      "The pointer ray hits the panel offset by the render texture's resolution scale, so clicks land beside the button.",
    ],
    v: "Spawn 300 labeled entities; labels cull, fade and de-overlap, and the draw call count stays within budget. Point at buttons on a world panel at several angles and distances; each click lands on the intended control.",
    dep: ["widget-framework", "text-and-ui-rendering", "cameras-and-viewports", "scene-queries", "scene-graph-and-transforms"],
  },
  // ---------- cross ----------
  "threading-model": {
    s: "The decision of which work runs on which threads, how threads hand data to each other, and which data may be touched from where.",
    d: "Typical models are a main thread with offloaded tasks, a fixed set of dedicated threads (game, render, audio), or a job graph in which all work is small tasks with declared dependencies. Rendering usually runs one frame behind the simulation and reads a copy of the state. Audio and I/O threads have hard real-time or latency needs. Whatever the model, each piece of data needs a single rule: owned by one thread, immutable while shared, or protected by synchronization. Retrofitting threading into an engine built for one thread is among the most expensive changes possible, so the model is chosen early.",
    k: [
      "Dedicated threads per subsystem versus a shared job system: dedicated is simple and leaves cores idle; jobs balance load and need dependency tracking and data discipline.",
      "Double-buffered state handoff versus locking shared data: buffering gives lock-free reads and one frame of latency and memory cost; locks are simple and risk stalls and deadlocks.",
      "Main-thread-only engine APIs versus thread-safe everywhere: main-only is safe and limits scaling; thread-safe everywhere adds cost to every call.",
    ],
    p: [
      "A gameplay callback touches renderer data without synchronization; the bug occurs once per thousand frames and only on machines with more cores.",
      "A thread waits on a lock held by a thread that waits for the first, and the game freezes only under load.",
    ],
    v: "Run the full test suite under a thread sanitizer and a randomized scheduler with varied core counts (1, 2, 8, 32). No data races are reported and frame output is identical across configurations.",
    dep: ["job-system", "platform-abstraction", "memory-allocators", "game-loop"],
  },
  "data-ownership-and-lifetimes": {
    s: "The rules for who creates each object, who may keep references to it, and what happens to those references when it is destroyed.",
    d: "Games constantly create and destroy objects mid-frame, and many systems keep references to them (AI targets, UI bindings, scripts, network state). The engine picks a consistent scheme: raw pointers with strict ownership, generational handles that become invalid safely, reference counting, or garbage collection. Handles to entities and resources are common because they detect staleness cheaply and can be serialized. Destruction is deferred to a fixed point in the frame so systems do not see objects vanish mid-update. The scheme must also define cross-thread ownership and the order systems shut down in.",
    k: [
      "Generational handles versus raw pointers or smart pointers: handles detect stale references safely and need a lookup; pointers are fast and can dangle; smart pointers hide cycles and cost.",
      "Deferred destruction at end of frame versus immediate: deferred is predictable and keeps objects alive briefly; immediate frees memory sooner and breaks iteration.",
      "Garbage collection versus manual ownership: GC prevents most dangling references and adds pauses and unpredictable memory; manual is deterministic and error-prone.",
    ],
    p: [
      "A slot in a pool is reused and an old handle without a generation counter now points at an unrelated object.",
      "Reference-counted objects form a cycle (parent and child both hold strong references) and never free, so each level load leaks a little.",
    ],
    v: "Create and destroy objects randomly for a million operations while holding handles to them; every stale handle resolves to invalid and none to a live object. Load and unload a level repeatedly and live-object counts return to baseline.",
    dep: ["memory-allocators", "game-object-model", "runtime-resource-manager"],
  },
  "determinism": {
    s: "Whether the same inputs always produce exactly the same simulation result, which replays, lockstep networking and reliable tests all depend on.",
    d: "Determinism needs every source of variation controlled: a fixed time step, seeded and separated random number streams per system, a stable order of updates and iteration, and consistent floating-point behavior. Across machines it additionally needs identical compiler flags and math (or fixed-point), and no dependence on thread timing. It is a design property of the whole simulation, difficult to add later. Even if full determinism is not needed, partial guarantees (for example, deterministic on one platform) are useful. State hashes compared each frame find where two runs first diverge, which is the main debugging tool.",
    k: [
      "Floating point with strict compiler control versus fixed point: floats are fast and familiar and vary across hardware and optimizations; fixed point is exact and slower to write and limited in range.",
      "Deterministic simulation with presentation separated versus everything deterministic: separating lets visuals use anything, but needs a strict boundary the simulation never reads back from.",
      "Per-system random streams versus one global: separate streams keep one system's changes from shifting every other's outcomes.",
    ],
    p: [
      "Gameplay code reads a rendering-dependent value (animation pose, camera) so results change when graphics settings change.",
      "A compiler update or a different optimization level changes floating-point results, and replays and lockstep peers silently diverge.",
    ],
    v: "Run the same recorded input on two machines and two builds of the same source; per-frame state hashes are identical for ten thousand frames. Change graphics settings and thread count; hashes remain identical.",
    dep: ["fixed-step-and-determinism", "time-system", "math-library", "job-system", "game-loop"],
  },
  "dependencies-and-layering": {
    s: "The rule that each module may depend only on modules below it, which keeps the engine understandable, testable and buildable in parts.",
    d: "Layers from the bottom: platform and foundation, core systems, engine subsystems, gameplay, tools. Lower layers never include or call upward; communication upward uses events, callbacks or interfaces the lower layer defines. Subsystems should not depend on one another sideways, and talk through the world model or messaging. The rules are enforced by the build system, which fails on a forbidden include. Good layering lets a game ship without the editor, run the simulation without a renderer (for a dedicated server), and test a system alone. Violations accumulate quietly, since each shortcut is cheap, until nothing can be built or tested in isolation.",
    k: [
      "Strictly enforced layers in the build versus convention: enforcement keeps the structure honest and slows quick hacks; convention is flexible and erodes within a year.",
      "Interfaces and events between subsystems versus direct calls: indirection decouples and makes control flow harder to follow.",
      "Many small modules versus a few large: small modules enforce boundaries and increase build and link complexity.",
    ],
    p: [
      "A foundation library includes a gameplay header for one convenience function, and the server build now needs graphics code.",
      "Two subsystems call each other directly; changing either requires rebuilding and retesting both, and neither can run alone.",
    ],
    v: "Generate the module dependency graph from the build and check it for cycles and upward edges; the check fails the build on any. Build and run the headless server target with rendering, audio and the editor excluded.",
    dep: ["events-and-messaging", "platform-abstraction", "plugins-and-public-sdk"],
  },
  "hardware-scalability": {
    s: "How one game runs acceptably on both the weakest and strongest supported machines, by adjusting quality, resolution and features to what the hardware can do.",
    d: "The engine defines quality tiers that change resolution scale, shadow and effect quality, draw distance, simulation counts and texture detail, selected by hardware detection or benchmarking and adjustable by the player. Dynamic resolution and level-of-detail react to frame time in real time. Content is authored with fallback versions of expensive features. Memory tiers affect streaming budgets. Scalability must be a design constraint, because gameplay must not change between tiers: an enemy visible on high must be present on low. Testing the matrix of tiers and devices is expensive, so a small set of reference machines represents each.",
    k: [
      "Fixed quality presets versus continuous dynamic scaling: presets are predictable and testable; dynamic scaling keeps frame rate steady and makes visuals vary and harder to reproduce.",
      "Detect hardware by lookup table versus a first-run benchmark: tables are instant and lag behind new hardware; benchmarks are accurate and take time and can be noisy.",
    ],
    p: [
      "Low settings remove an object that gameplay depends on, such as cover or a visible enemy, giving unequal advantage between players.",
      "Only top-end and mid-range machines are tested; the minimum-spec target is checked last and misses its frame rate by half.",
    ],
    v: "Run an automated flythrough on each tier's reference machine. Frame-time percentiles meet the target for that tier, gameplay-relevant object counts are identical across tiers, and memory stays within the tier's limit.",
    dep: ["performance-budgets", "config-and-console-variables", "streaming", "render-frame-graph", "platform-abstraction"],
  },
  "performance-budgets": {
    s: "Fixed allowances of time and memory for each system per frame, set early and enforced, so that the whole game fits its frame rate and platform limits.",
    d: "For a 60 Hz game the frame has about 16.7 ms; the plan divides it among simulation, animation, physics, rendering on CPU and GPU, audio and UI, and gives each a memory ceiling and a per-frame limit on draw calls, polygons, active agents and allocations. Budgets are written down, measured by the profiler in automated runs and tracked over time, so regressions fail a build. A budget turns arguments about 'too slow' into a number and an owner. They are set on the weakest supported hardware, not on developer machines, and include headroom for spikes.",
    k: [
      "Strict per-system budgets versus a shared global budget: per-system gives clear ownership and wastes slack in idle systems; a global budget is flexible and nobody is responsible.",
      "Enforce in CI versus track as dashboards: enforcement stops regressions at the source and creates friction from noisy machines; dashboards inform and are often ignored.",
      "Budget for peak frame versus average: peak keeps worst-case moments smooth and constrains design more; average is easier to meet and allows hitches.",
    ],
    p: [
      "Budgets are measured on a high-end development PC; on the minimum-spec console every system is over and nobody owns the fix.",
      "A new feature takes a few milliseconds from the shared frame without reducing anything else, and the overrun is found at the end of the project.",
    ],
    v: "Run a standard stress scenario on the lowest-spec target and export per-system CPU, GPU and memory numbers. Each is at or under its allocated budget, and a deliberate overrun fails the automated check with the system named.",
    dep: ["profilers", "profiling-hooks", "memory-and-gpu-analyzers", "game-loop"],
  },
});
