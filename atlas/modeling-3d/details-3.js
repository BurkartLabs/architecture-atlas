// Details for the 3D modeling tool plate, part 3: scene, materials, undo and files, viewport.
ATLAS.details("modeling-3d", {
  "object-hierarchy": {
    s: "The tree of objects connected by parent-child relations, where each child's transform is relative to its parent, plus the types of object such as mesh, light, camera and empty.",
    d: "Each object stores a local transform, an optional parent and a pointer to its data, such as a mesh or light. The world transform is the product of the chain. Parenting records an inverse matrix so the child does not jump at the moment of linking. Parent types include plain objects, bones, vertices and curves. It is hard because parent relations must be acyclic, parent changes must preserve the visible position, and evaluation order must follow the tree.",
    k: ["Stored parent inverse matrix vs recomputing local transform: storing keeps the child still when parenting without altering its values, but hides an invisible transform that confuses scripts.", "Single parent vs multiple parents: a tree is simple to evaluate and display; multiple parents need constraints and cannot be shown as a tree."],
    p: ["Unparenting without applying the parent's transform makes an object jump to its local coordinates in the world.", "Deep hierarchies of thousands of empties slow evaluation even when nothing moves."],
    v: "Parent a cube to a rotated parent, confirm it does not move, then clear the parent with keep transform and confirm the world position and rotation are unchanged within floating-point tolerance.",
    dep: ["transform-evaluation", "datablocks-refcount", "math-library"]
  },
  "transform-evaluation": {
    s: "Computes final world matrices for all objects each frame from local transforms, parents, constraints and animation, in a dependency-respecting order.",
    d: "The evaluator multiplies local matrices down the hierarchy, applies animation values first and constraints afterward, and stores the world matrix for the viewport, picking and renderers. Matrices are decomposed into location, rotation and scale only when the user edits them. It must handle rotation modes, negative scale, shear from non-uniform scale, and precision at large coordinates. Evaluation of independent subtrees can run in parallel.",
    k: ["Matrices vs separate location-rotation-scale: matrices compose quickly and represent shear, but cannot be edited or interpolated without decomposition; separate parts are editable and cannot hold shear.", "Recompute everything vs only dirty subtrees: dirty tracking skips static scenes, but a missed invalidation shows stale positions."],
    p: ["Negative scale flips triangle winding, so faces render inside out unless the renderer detects it.", "Float precision at coordinates far from the origin produces visible jitter in child objects."],
    v: "Animate a parent with scale and rotation over 100 frames, and confirm the child's world matrix at each frame equals the independently computed product, and that static siblings are not re-evaluated.",
    dep: ["object-hierarchy", "dependency-graph", "math-library", "task-scheduler"]
  },
  "dependency-graph": {
    s: "A directed graph recording which data depends on which others, used to evaluate only what changed and in a valid order, often across threads.",
    d: "Nodes represent properties, objects and evaluations such as animation, transform, modifiers and shading updates. Edges mean one needs the other first. When something changes, the graph tags it and everything downstream, then evaluates the tagged nodes in topological order, possibly in parallel. Evaluation happens on copies, so the original data stays editable. It is hard because relations are discovered from code that may be incomplete, cycles must be detected and reported, and copies must be kept in sync.",
    k: ["Explicit declared relations vs inferred by running code: declared relations are correct and fast, but every feature must remember to declare them.", "Evaluate on a copy of the scene vs in place: copies allow threading and cancellation, but need synchronization and double the memory for changed data."],
    p: ["A missing relation shows as a viewport that lags one frame behind, only for certain object combinations.", "A dependency cycle disables evaluation of the whole group without telling the artist which link caused it."],
    v: "Change one object's property in a scene of thousands of objects and confirm only the object and its dependents are re-evaluated, shown by an evaluation counter, with results equal to a full re-evaluation.",
    dep: ["property-reflection", "task-scheduler", "datablocks-refcount"]
  },
  "collections-visibility": {
    s: "Groups of objects organized into nested sets, with flags for hiding, selecting and rendering them, so large scenes can be managed in parts.",
    d: "A collection holds objects and child collections, and an object may live in several. Per-layer state controls whether each collection is excluded, hidden in the viewport, disabled for selection or disabled for render. The flags combine, which makes the final visibility a function of several states. It is hard to explain to users why an object is not visible, and to evaluate quickly in scenes with large numbers of objects.",
    k: ["Objects in many collections vs exactly one: many gives flexible grouping and instance reuse, but makes visibility ambiguous when collections disagree.", "Separate viewport and render visibility vs one flag: separate flags help keep heavy objects out of the viewport, but outputs may then differ from what is seen."],
    p: ["An object hidden by an excluded parent collection looks identical to one hidden individually, so artists hunt in the wrong place.", "Hidden objects still participate in evaluation and physics, and consume time."],
    v: "Put an object in two collections, hide one, and confirm the object stays visible; exclude both and confirm it vanishes from viewport, selection and render, and the outliner reports why.",
    dep: ["object-hierarchy", "datablocks-refcount", "dependency-graph"]
  },
  "instancing-linking": {
    s: "Reuses the same data in many places: linked duplicates share one mesh, and instances place a whole collection many times without copying geometry.",
    d: "A linked duplicate is a new object that points to the same mesh datablock, so editing the mesh changes all. Collection instances reference a collection and apply a transform. Particle and node-based instancing generate thousands of references. The renderers and viewport draw instances efficiently with one GPU buffer and many transforms. It is hard to make instances editable, to make them unique when needed, and to track references for deletion and saving.",
    k: ["Shared datablock vs unique copy: sharing saves memory and keeps variants consistent, but changing one copy requires an explicit make-unique step.", "Instance references vs realized geometry: references scale to millions of copies, but not every tool can edit or export them without realizing."],
    p: ["Editing a shared mesh changes every linked copy, which surprises artists who thought they edited one.", "Exporting instances to a format without instancing expands them and inflates the file."],
    v: "Create 10,000 linked duplicates, confirm memory grows by one mesh plus per-object overhead, edit the shared mesh once and verify every instance updates; make one unique and confirm only it keeps the old shape.",
    dep: ["datablocks-refcount", "object-hierarchy", "gpu-batch-cache", "collections-visibility"]
  },
  "datablocks-refcount": {
    s: "The document's storage model: typed, named data units such as meshes, materials and images that reference each other and are freed when nothing uses them.",
    d: "Everything that can be shared is a datablock with a unique name, a reference count and a type-specific payload. Objects point to meshes, meshes to materials, materials to images. Saving writes datablocks that are in use. Reference counts determine whether data survives an orphan state until the next save. It is hard to keep counts correct across undo, linking, copy and script operations, and to prevent dangling pointers when a datablock is freed while another thread reads it.",
    k: ["Reference counting vs garbage collection: counts free data promptly and deterministically, but require every pointer assignment to maintain them and cannot collect cycles.", "Names as identifiers vs unique ids: names are friendly for users and scripts, but renaming and library collisions need disambiguation."],
    p: ["A script that forgets to increment the count frees a mesh still used by an object and crashes on the next draw.", "Orphan data with zero users disappears at save, and artists lose work they believed was kept."],
    v: "Delete the last object that uses a mesh, confirm the mesh persists with zero users in the data view, save and reload, and confirm it is gone unless it was given a fake user.",
    dep: ["struct-serialization", "memory-allocators"]
  },
  "library-overrides": {
    s: "Links data from another file, read-only, and optionally overrides chosen properties locally, so teams share assets that remain updatable at the source.",
    d: "A linked datablock is loaded from another file by path and name and cannot be edited in place. An override creates a local layer: the original data plus a list of changed properties stored as differences. When the source changes, reloading reapplies the differences on top. This enables rigs and sets that many artists share. It is hard to resolve differences when the source changes structure, keep paths valid across machines, and make overrides understandable.",
    k: ["Link with overrides vs append a full copy: linking keeps assets updatable and files small, but breaks when paths or names change; appending is robust and diverges.", "Override by property diffs vs full local copy: diffs can follow source updates, but can fail to apply when the source changes shape."],
    p: ["A moved library file turns every linked asset into a missing placeholder when opened on another machine.", "Overrides referencing a renamed bone in the source silently drop their changes after update."],
    v: "Link a rig from another file, override one control's color, change the source rig's mesh, reload, and confirm the mesh update appears and the color override is retained.",
    dep: ["datablocks-refcount", "native-file-format", "versioning-compat", "property-reflection"]
  },
  "material-model": {
    s: "The set of parameters, such as base color, roughness, metalness and transparency, that describe how a surface interacts with light, usually following a layered physically based model.",
    d: "A material stores inputs for a common shading model so that assets behave plausibly under any lighting. Each input can be a constant or driven by textures and nodes. The same description feeds the viewport approximation and the final renderers through translators. It is hard to define a model rich enough for production, simple enough for artists, and mappable onto different renderers, game engines and interchange formats that each have slightly different equations.",
    k: ["One universal model vs per-renderer materials: one model avoids authoring twice, but results differ per renderer and some features cannot be expressed in all.", "Metalness workflow vs specular workflow: metalness is simple and constrains inputs to plausible values, while specular gives more freedom and invites implausible combinations."],
    p: ["Converting to another renderer drops layers like clear coat or subsurface scattering, so appearance changes without warning.", "Out-of-range values, such as a base color above one, look fine in one renderer and blow out in another."],
    v: "Render a sphere with the same material in the viewport and in the final renderer under the same lighting, and confirm color and highlight position agree within a stated tolerance in a side-by-side comparison.",
    dep: ["shader-node-graph", "image-textures-color", "datablocks-refcount"]
  },
  "shader-node-graph": {
    s: "A visual graph of nodes that compute surface properties from textures, math and geometry data, compiled into shaders for the viewport and renderers.",
    d: "Nodes have typed sockets: colors, vectors, floats and shader closures. The editor stores nodes and links. At evaluation, the graph is topologically sorted, constants folded, and code generated for a target such as the GPU shading language or a renderer's own representation. Group nodes allow reuse. The hard parts are type conversion between sockets, targets that support different node subsets, and compile times that grow with graph size.",
    k: ["One graph, many backends vs separate graphs per backend: one graph keeps authoring single, but unsupported nodes must be approximated or ignored in some targets.", "Code generation vs interpreting the graph at runtime: generated code is fast, while interpretation avoids compile stalls and is slower per sample."],
    p: ["A node unsupported by the viewport shows as black or gray and the artist cannot judge the material.", "Disconnected or cyclic links produce no error until compile, and the failure is shown far from the cause."],
    v: "Build a graph with a texture, a color ramp and a mix node, check the viewport and render outputs agree, then add a cycle and confirm the editor flags the offending link immediately.",
    dep: ["material-model", "viewport-shader-compile", "image-textures-color", "property-reflection"]
  },
  "image-textures-color": {
    s: "Loads and samples images used as textures, and manages their color spaces, bit depth, mipmaps and filtering so colors are correct in editing and rendering.",
    d: "Images load from files into memory and then to the GPU with a format matching their meaning: color data is converted from its stored space to linear before lighting, while data such as normals and roughness is kept as is. Mipmaps and anisotropic filtering control shimmer. A color management layer converts between working, display and output spaces. It is hard to get every image tagged correctly, handle huge textures, and keep display transforms consistent.",
    k: ["Linear working space with display transform vs working in display space: linear is physically correct for blending and lighting, but needs a conversion at every input and output.", "Load full images vs streamed or tiled: full loads are simple, but a scene with many 8K images exhausts memory."],
    p: ["A roughness map tagged as color gets gamma-converted and makes surfaces unexpectedly shiny.", "Different display transforms between viewport and render make the same texture look different."],
    v: "Display a gray ramp image in the viewport and in a rendered result and confirm pixel values agree through the display transform; flip the color-space tag and confirm the change is visible and reversible.",
    dep: ["gpu-abstraction", "memory-allocators", "interchange-formats", "task-scheduler"]
  },
  "viewport-shader-compile": {
    s: "Translates material graphs into GPU programs for the viewport, caching compiled variants and compiling in the background so the interface keeps responding.",
    d: "Each material and draw mode combination may need a different program. The compiler generates source from the node graph plus pass-specific code, hands it to the driver, and caches the binary by hash. Until the program is ready, a placeholder draws. The hard part is compile latency, which can be seconds for complex graphs, and the combinatorial growth of variants for shading modes, lights and attributes.",
    k: ["Asynchronous compile with placeholder vs blocking compile: async keeps the interface alive, but users see temporary wrong materials and must wait for the final look.", "Many specialized variants vs one uber-shader: specialized programs are fast to run, but numerous to compile; an uber-shader compiles once, and runs slower."],
    p: ["A driver that fails silently on a long program leaves a permanent magenta or black material.", "Shader cache files persist across driver updates and cause crashes until they are cleared."],
    v: "Open a scene with 200 distinct materials and confirm the interface stays responsive during compilation, placeholder materials resolve to the final look, and the second launch loads from cache with far less compile time.",
    dep: ["shader-node-graph", "gpu-abstraction", "task-scheduler", "draw-manager"]
  },
  "baking": {
    s: "Renders surface properties, such as lighting, normals, ambient occlusion or curvature, from geometry into image textures through the model's UV layout.",
    d: "For each texel of the target image, the baker finds the surface point through the UV map, casts rays to a source mesh or computes the quantity directly, and writes the result. Typical uses are transferring high-resolution detail onto a low-resolution model as a normal map, and precomputing lighting. Tangent-space consistency, cage distance and padding at seams must be right. It is hard to avoid ray misses, artifacts at hard edges and a mismatch with the tangent basis used downstream.",
    k: ["Cage-guided ray casts vs uniform ray offset: cages control hit points on concave shapes, but need authoring; uniform offsets are quick and miss on tight areas.", "Bake to textures vs vertex data: textures capture high resolution; vertex baking needs no UVs and is limited by vertex density."],
    p: ["A tangent basis that differs from the game engine's makes baked normal maps look inverted in lighting.", "Overlapping UVs average results from different surface regions and produce striped artifacts."],
    v: "Bake a normal map from a high-resolution sculpt onto a low-resolution mesh, render the low mesh with the map, and confirm that silhouettes and shading match the source within a visually negligible error, without seams.",
    dep: ["uv-editor", "bvh-trees", "closest-point-queries", "image-textures-color", "normals-smoothing"]
  },
  "material-previews": {
    s: "Small rendered thumbnails of materials and assets shown in browsers and panels, generated in the background and cached.",
    d: "A preview renders a sphere or custom shape with the material under a standard lighting setup into a small image, using a lightweight pipeline. Previews update when the material changes and are stored in the file or a cache. They run at low priority so editing is not slowed. The difficulty is staleness, cost when hundreds of previews are requested at once, and keeping them representative when a material depends on scene data.",
    k: ["Background rendering with a queue vs render on demand: a queue keeps the browser filled without stalls, but spends time on previews nobody looks at.", "Previews stored in files vs regenerated: stored previews appear at once on load, but add size and can be out of date."],
    p: ["Opening an asset library with thousands of materials triggers thousands of preview renders and freezes the interface.", "A preview that depends on a missing texture shows a default and does not update when the texture returns."],
    v: "Open a library with 2,000 materials, scroll quickly, and confirm only visible thumbnails render, interface frame rate stays responsive, and a changed material's preview updates within a second.",
    dep: ["shader-node-graph", "task-scheduler", "viewport-shader-compile", "asset-library"]
  },
  "undo-stack": {
    s: "A history of document states or changes that lets the artist step backward and forward, usually storing full snapshots, differences or reversible commands.",
    d: "After each operator that changes data, the system pushes a step. Restoring a step swaps the document back to the stored state, then notifies dependent systems. Techniques include memory-file snapshots, which store the whole document in compact form with sharing of unchanged parts, and per-command reversible operations. A step limit and memory cap keep it bounded. Hard issues include references held by scripts, UI state that is not part of undo, and cost on scenes of gigabytes.",
    k: ["Snapshot undo vs command-based undo: snapshots are generic and easy to make correct, but cost memory on large documents; commands are compact and need every operator to supply its reverse.", "Global undo vs per-editor undo: global gives one timeline and simple expectations, but a small paint stroke can sit between large scene edits."],
    p: ["An operator that changes data without pushing a step makes later undos jump over its change.", "Undo memory grows silently over a long session until the machine starts swapping."],
    v: "Perform 100 mixed operations, undo all of them, and confirm the document is byte-identical to the start; redo all and confirm the final state equals the original end state, and peak memory stays under the configured cap.",
    dep: ["datablocks-refcount", "struct-serialization", "memory-allocators", "operator-framework"]
  },
  "edit-mode-undo": {
    s: "Specialized undo for modes with a transient editing structure, such as mesh edit and sculpt, storing only the changed parts so steps stay small on large meshes.",
    d: "While editing a mesh, a full snapshot per step would copy millions of elements. Instead the system stores a compact copy of the editing structure, or in sculpt mode just the nodes touched by the stroke, and restores those. Steps are linked to the mode's own history and merged with the global timeline on exit. It is hard because partial restores must update spatial trees and caches, and because switching modes requires reconciling two histories.",
    k: ["Store dirty chunks only vs the whole mesh: chunks cut memory by orders of magnitude on large meshes, but need accurate dirty tracking.", "Separate mode history vs one unified history: separate histories are simpler per mode, but confuse users when they undo across a mode switch."],
    p: ["Chunk-based sculpt undo misses a vertex touched by a smoothing pass and leaves a faint dent after undo.", "Leaving edit mode with unflushed steps drops them from the global history."],
    v: "Sculpt 50 strokes on a ten-million-vertex mesh, undo all, and confirm positions return to the original bit-exact, while peak undo memory stays at a small fraction of 50 full copies.",
    dep: ["undo-stack", "edit-modes", "bvh-trees", "attribute-domains"]
  },
  "native-file-format": {
    s: "The application's own file layout, which stores every datablock with its type and version, designed to load fast and to preserve everything needed to continue editing.",
    d: "The file holds blocks of raw structure memory with a header describing types and sizes, plus a schema so old files can be mapped to new structures. Loading reads blocks, patches pointers by id and runs version fixes. Large arrays like meshes are stored as contiguous buffers, optionally compressed. Writing happens to a temporary file and then a rename, so a failed save cannot corrupt the original. Compatibility is the difficulty: any field change needs a migration.",
    k: ["Raw structure dump vs a self-describing serialization: dumps load fastest, but tie the format to memory layout; self-describing is slower and easier to evolve.", "One file with everything vs separate files for large data: one file is easy to share, but huge files take long to save and load in full."],
    p: ["A save interrupted by a crash or full disk truncates the file if the write is not atomic.", "A field whose meaning changes without a version bump loads incorrectly in old files without any error."],
    v: "Save a scene with every datablock type, reload it in a fresh process, and diff the document contents field by field; then kill the process during a save and confirm the previous file is intact and loadable.",
    dep: ["struct-serialization", "datablocks-refcount", "versioning-compat", "memory-allocators"]
  },
  "interchange-formats": {
    s: "Importers and exporters for common exchange formats, mapping the tool's meshes, materials, rigs and animation to other software, with loss reports for what cannot be expressed.",
    d: "Each format has its own conventions for axes, units, handedness, normals, materials and skeleton orientation. The exporter converts the evaluated scene, bakes modifiers, triangulates if required, and writes data. The importer builds datablocks from the file. Formats vary in what they support, from simple triangle lists to full scene description with layers and variants. It is hard to round-trip exactly, handle huge files efficiently and make the conversion choices visible to the user.",
    k: ["Export evaluated geometry vs original: evaluated matches what artists see, but loses the modifiers' editability and may produce huge meshes; original stays compact and may differ from the intended result.", "Strict mapping with warnings vs best-effort silent conversion: strictness exposes loss, but frustrates users who only want a file out."],
    p: ["Axis and unit conventions differ, so a model arrives rotated by ninety degrees or a hundred times too large.", "Normals recomputed on import destroy hard-edge shading that the artist set up deliberately."],
    v: "Export a scene with a textured, skinned mesh and animation to an interchange format and import it again; confirm vertex counts, UV positions, bone orientations and animation values match within a stated tolerance, and that unsupported features are listed in a report.",
    dep: ["attribute-domains", "armatures-bones", "material-model", "normals-smoothing", "ngon-triangulation"]
  },
  "autosave-recovery": {
    s: "Periodically writes recoverable copies of the session in the background, so a crash or power loss costs minutes of work, not hours.",
    d: "A timer saves the current document, or the undo memory file, to a separate location without disturbing the main file or interrupting editing. A crash handler tries to write a final recovery file. At next start, the application offers the latest recovery copy. Writes should avoid stalls on large scenes, and recovery files need to be cleaned when no longer useful. Hard parts are saving while in edit modes, with data not yet written back, and the cost of saving large documents often.",
    k: ["Timer-based saves vs saving after every change: timers are cheap and predictable, but lose recent work; per-change journaling loses nothing and costs write bandwidth.", "Saving the undo memory file vs a full file write: the memory file is quick and incremental, but cannot capture in-progress edit-mode data until it is flushed."],
    p: ["Autosave during a long sculpt stroke saves the document before the stroke's edit-mode data is committed.", "Recovery files in a temp folder are cleaned by the operating system after a reboot."],
    v: "Kill the process during an edit session, restart, and confirm the application offers recovery, and the recovered scene matches the last autosave within the configured interval, with all object data intact.",
    dep: ["native-file-format", "undo-stack", "edit-modes", "logging-crash-reports"]
  },
  "versioning-compat": {
    s: "Rules and code that upgrade older documents to the current structures on load, and guard what older versions do with newer files.",
    d: "The file carries a version number. After loading, a chain of version fixes runs in order from the file's version to current, each adding defaults, renaming properties or converting units. Newer files opened in older versions load with unknown data preserved when possible, or with a warning. It is hard to test the whole matrix of old versions, to change defaults without altering old files' appearance, and to remove old code without stranding old files.",
    k: ["A chain of small migrations vs a single converter per version: chains are simple to add to, but long chains are slow and old steps rarely run in tests.", "Loading unknown data with a warning vs blocking: loading permits use of newer files, but risks saving them back with data loss."],
    p: ["Dropping an old migration breaks files that nobody opens often until a customer does.", "A new default applied to old files changes how their materials and modifiers behave."],
    v: "Load a corpus with one file from each prior release, render each, and compare against stored reference images from the version that saved it; every pair must match within tolerance or have an approved difference noted.",
    dep: ["native-file-format", "struct-serialization", "property-reflection"]
  },
  "asset-library": {
    s: "A catalog of reusable models, materials, poses and node groups, browsable and draggable into scenes, with metadata, thumbnails and tags.",
    d: "Assets are marked in their source files with a catalog, tags and a preview. A library indexes a folder of files and exposes its marked assets without loading the whole files. Dragging into a scene either links or appends the data. Libraries can be local or shared on network storage, and may be organized in catalogs with a hierarchy. It is hard to keep indexes in sync with files, reconcile duplicates and handle sharing and permissions.",
    k: ["Index in a database vs scan files on demand: a database makes search instant, but goes out of sync; scanning is always right, and slow on big libraries.", "Link on drag vs append on drag: linking keeps the asset updatable, but breaks when the library moves; appending is self-contained and diverges."],
    p: ["A library on a slow network drive blocks the browser while it scans.", "Two files with the same asset name produce ambiguous links after one is moved."],
    v: "Index a library of 10,000 assets on a network share, search by tag in under a second after the first scan, drag one into a scene, and confirm the result links with the right path and renders correctly.",
    dep: ["library-overrides", "native-file-format", "material-previews", "datablocks-refcount"]
  },
  "draw-manager": {
    s: "Coordinates how the viewport draws a frame: gathers visible objects, builds draw calls for each pass, orders them and submits them to the GPU.",
    d: "Each redraw, the manager asks every visible object which passes it participates in, extracts what it needs from the evaluated data into cached batches, sorts calls by pass, shader and state, and issues them. Engines and overlays, such as selection outlines and gizmos, plug into the same pass system. The hard parts are keeping per-frame CPU overhead low with tens of thousands of objects, avoiding redundant state changes, and making extraction multithreaded.",
    k: ["Pass-based multi-engine design vs one monolithic renderer: pluggable passes allow overlays, preview and external renderers to share infrastructure, but adds coordination of buffers and ordering.", "Sorting by state vs by depth: state sorting reduces GPU overhead, while depth sorting is needed for transparency and conflicts with it."],
    p: ["CPU time per draw call dominates with many small objects, so frame rate falls even though the GPU is idle.", "A pass that forgets to restore GPU state corrupts later passes and produces intermittent visual glitches."],
    v: "Open a scene with 100,000 small objects, orbit, and confirm in a frame profiler that CPU submission time stays within the frame budget and draw calls are reduced by instancing and batching.",
    dep: ["gpu-batch-cache", "gpu-abstraction", "shading-modes", "dependency-graph", "task-scheduler"]
  },
  "shading-modes": {
    s: "Selectable ways to display the scene while editing: wireframe, flat solid color, matcap, textured lighting and material preview with environment lighting.",
    d: "Each mode picks shaders, lights and data to draw. Solid mode is cheap and shows form with studio lighting or matcaps. Material preview uses the real material parameters with image-based lighting. Rendered mode previews the final renderer's progressive output. Modes trade fidelity for speed. The hard part is making cheaper modes honest about shape, avoiding misleading results such as inverted normals looking fine, and switching quickly without reloading all data.",
    k: ["Cheap solid mode for editing vs always-accurate preview: solid is fast on any machine and shows form clearly, but can hide material and lighting problems until the final render.", "Matcap lighting vs scene lighting: matcaps are stable under rotation and fast, but ignore the scene's lights and cannot show shadows."],
    p: ["Back-face culling hides inverted faces in a mode that artists use for most of their work.", "A material preview that uses different environment lighting from the final render misleads color decisions."],
    v: "Cycle through every mode on a scene with an intentionally inverted face and confirm the face is clearly indicated in at least one mode, and each switch completes in under a second.",
    dep: ["draw-manager", "viewport-lighting-ao", "viewport-shader-compile", "material-model"]
  },
  "overlays-wireframe": {
    s: "Extra drawing layered over the shaded model: wireframes, edges, vertices, face orientation, normals, grids, bone shapes, lights and measurements.",
    d: "Overlays are drawn in dedicated passes after the main shading, often with depth bias so lines sit on surfaces without z-fighting. In edit mode they show element selection and topology; in other modes they show helpers. Thick, anti-aliased lines and screen-size points are expanded in shaders. The hard parts are keeping a dense wireframe legible, drawing millions of edges quickly, and giving each overlay its own depth behavior.",
    k: ["Geometry-shader or instanced line quads vs hardware lines: shader-expanded lines give consistent width and anti-aliasing, but cost extra vertex work; hardware lines are cheap and limited.", "Depth-biased overlay vs separate depth buffer: bias is simple and approximate; a separate buffer is exact and uses more memory."],
    p: ["Dense wireframes on a ten-million-triangle mesh turn into solid color and hide the shape.", "Depth bias that works at one zoom produces z-fighting at another."],
    v: "Display wireframe and normals overlays on a dense mesh while orbiting, and confirm edges stay one pixel wide, never show through unrelated surfaces, and frame rate remains interactive.",
    dep: ["draw-manager", "gpu-batch-cache", "gpu-abstraction", "attribute-domains"]
  },
  "gpu-batch-cache": {
    s: "Holds the mesh data converted into GPU buffers, extracted once per change and reused by many passes, so drawing does not reprocess the mesh each frame.",
    d: "Extraction turns the evaluated mesh, with its n-gons, shared vertices and attribute domains, into triangle, line and point buffers with the attributes shaders need. Each buffer type is requested only if some pass uses it, and rebuilt only when relevant data changes. Partial updates handle position-only changes. It is hard because the CPU structure and the GPU layout differ, extraction can take as long as the rest of the frame, and memory duplicates per buffer.",
    k: ["Extract lazily per requested buffer vs all at once: lazy saves work and memory, but causes hitches when a new mode first needs a buffer.", "Partial buffer update vs full re-upload: partial is fast for sculpting and animation, but needs precise change tracking per attribute."],
    p: ["Cached buffers are not invalidated when only a vertex attribute changes, and the viewport shows stale colors.", "Duplicating every buffer per object multiplies GPU memory for large scenes with many instances."],
    v: "Move one vertex of a million-vertex mesh and confirm only the position buffer is re-uploaded in a GPU capture, while the index buffer is untouched and the displayed change appears the same frame.",
    dep: ["attribute-domains", "ngon-triangulation", "gpu-abstraction", "memory-allocators", "task-scheduler"]
  },
  "gpu-selection-buffer": {
    s: "Renders objects or elements in unique colors into an off-screen buffer, so a pixel read answers what is under the cursor or inside a box with exact visibility.",
    d: "The selection pass draws each element with an id encoded as a color, using the same geometry and depth as the visible scene. A pointer query reads a small region or the whole buffer, and decodes ids. This respects occlusion and gives exact results without CPU ray casts. The hard parts are read-back latency, id range limits for huge meshes, thin features that fall between pixels, and re-rendering when the view or geometry changes.",
    k: ["Rendering ids with the view vs analytic CPU tests: ids match the picture and handle any shading effect, but need GPU sync and are limited by resolution.", "Cache the id buffer between queries vs re-render each time: caching makes box select fast, but must be invalidated by any view or data change."],
    p: ["Vertices smaller than a pixel never win picking, so the artist cannot select them without zooming.", "Reading the buffer back immediately blocks the CPU until the GPU finishes the frame."],
    v: "Box-select a region on a dense mesh in solid mode and confirm only visible elements are selected; then count the selection against a reference CPU computation with occlusion and confirm both sets match.",
    dep: ["gpu-abstraction", "draw-manager", "gpu-batch-cache", "selection-system"]
  },
  "xray-outline": {
    s: "Draws object silhouettes, see-through transparency and selection outlines, so artists can see selected objects behind others and judge shape edges.",
    d: "Outline passes render object ids or depth into a buffer and detect edges with a screen-space filter, then draw colored lines for selected and active objects. X-ray renders surfaces semi-transparent with depth peeling, or without depth writes, so elements behind are visible and pickable. Hard parts include consistent outline width at any resolution, avoiding artifacts at intersections, and transparency order for overlapping surfaces without sorting.",
    k: ["Screen-space edge detection vs geometry-based outlines: screen-space is simple and independent of mesh complexity, but shows artifacts on thin features; geometry outlines are exact and need extra geometry.", "Order-independent blending vs sorted transparency: order-independent avoids sorting cost, but approximates when many layers overlap."],
    p: ["Outlines thicken and thin with display scaling unless they are specified in device pixels.", "Selected objects inside another solid object disappear from view, so artists believe the selection failed."],
    v: "Select an object hidden inside another and confirm its outline is visible in X-ray mode at constant width at two display scale settings, and picking through the transparent surface chooses it.",
    dep: ["draw-manager", "gpu-selection-buffer", "gpu-abstraction", "overlays-wireframe"]
  },
  "viewport-lighting-ao": {
    s: "Cheap lighting aids for editing: studio lights, matcaps, ambient occlusion, soft shadows and environment maps that give readable shading without a full render.",
    d: "Screen-space ambient occlusion darkens creases using the depth buffer; shadow maps provide simple cast shadows; environment lighting uses a pre-filtered image. These approximate global illumination at a small cost and make form readable while modeling. They are tuned for stable, noise-free output. The challenges are artifacts from screen-space methods at screen edges, light leaks, and consistent appearance across GPUs.",
    k: ["Screen-space effects vs precomputed or ray-based: screen-space runs on any GPU in constant time, but only sees what is on screen; ray-based is correct and needs newer hardware.", "Fixed studio light vs scene lights: studio lighting is stable and comparable across scenes, but cannot preview the lighting that will ship."],
    p: ["Screen-space occlusion halos around objects at depth discontinuities look like geometry that does not exist.", "Shadow bias tuned for a human-sized model produces light leaks on a very small or very large one."],
    v: "Render a scene of a creased mesh with ambient occlusion on and off, orbit, and confirm darkening appears only in creases, is stable with camera motion, and costs a bounded amount of frame time as measured by a GPU timer.",
    dep: ["draw-manager", "gpu-abstraction", "shading-modes", "image-textures-color"]
  },
  "gpu-abstraction": {
    s: "A thin layer over the graphics API that offers buffers, textures, shaders and draw commands in one interface, so the viewport code runs on several APIs and drivers.",
    d: "The layer wraps resources and state in objects, translates shader source to each backend's language, and records commands into batches. It hides differences in coordinate conventions, texture formats and synchronization. It also tracks state to avoid redundant calls, and provides debug naming and capture markers. It is hard to expose enough control for performance without leaking each API's quirks, and to handle driver bugs on many GPUs.",
    k: ["Thin wrapper over one API vs abstraction over several: one API is simpler and fastest to build, but leaves the application tied to that API's lifetime on each platform.", "Immediate state setting vs recorded command lists: immediate is easy to write, but recorded lists enable threading and match modern APIs."],
    p: ["A driver bug that affects only one vendor's GPU is invisible in testing on others and appears in the field.", "Leaking a GPU resource per frame goes unnoticed until the card runs out of memory hours later."],
    v: "Run the same scene on each supported backend and compare captured frames pixel by pixel within a small tolerance, and watch GPU memory stay flat over a ten-minute interaction loop.",
    dep: ["platform-windowing", "memory-allocators", "logging-crash-reports"]
  }
});
