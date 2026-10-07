// Details for the 3D modeling tool plate, part 4: mesh data structures, geometry algorithms, foundation.
ATLAS.details("modeling-3d", {
  "half-edge-structure": {
    s: "A connectivity structure in which every edge is stored as two directed half-edges, each pointing to its twin, next half-edge in its face, origin vertex and face.",
    d: "Each half-edge knows its twin, the next and previous half-edges around its face, its origin vertex and its face. From these, walking around a face, around a vertex or across an edge takes constant time per step, and local operations like split, collapse and flip are small pointer changes. It handles manifold meshes cleanly. It is hard with non-manifold geometry, such as an edge shared by three faces, which it cannot represent without extension.",
    k: ["Half-edges vs full edge records: half-edges give direct orientation and fast traversal, but double the edge records; edge-centered structures are smaller and need more logic to walk.", "Manifold only vs allowing non-manifold: manifold-only keeps every query simple and valid, but rejects imported or intermediate shapes that artists create."],
    p: ["A collapse that creates a vertex with two separate fans leaves a non-manifold vertex that later traversals loop around forever.", "Pointer-based nodes scatter in memory, so traversal is cache-unfriendly on large meshes."],
    v: "Build the structure from an indexed mesh, then for every vertex walk its fan and for every face walk its loop; confirm each half-edge's twin's twin is itself and total counts satisfy Euler's formula for closed meshes.",
    dep: ["indexed-face-set", "memory-allocators", "topology-queries"]
  },
  "boundary-rep-mesh": {
    s: "A general editing mesh that stores vertices, edges, loops and faces as linked elements, supporting n-gons and non-manifold cases and rich local operations with custom data per element.",
    d: "Each face has a loop of corners, each corner links to its vertex and edge, and each edge keeps a cycle of the loops around it, so one edge can have any number of faces. Elements carry flags and custom attribute blocks. Editing operators create and delete elements through a small set of primitives that keep every link consistent. It is flexible and memory-hungry, and is built from the compact form only when entering edit mode.",
    k: ["Rich linked elements vs compact arrays: linked elements make topology edits easy and general, but cost several times the memory and are slow to iterate; arrays are compact and hard to edit.", "Radial edge cycles vs two-face edges: cycles support non-manifold shapes, but every adjacency query must handle any number of faces."],
    p: ["Converting a ten-million-polygon mesh to this form on entering edit mode takes long and uses gigabytes.", "Operators that bypass the primitives leave a dangling link, which crashes later with no relation to the cause."],
    v: "Convert a mesh to the editing form and back, and confirm vertex, face and attribute data are identical; run a validator that checks every link in both directions after a thousand random edits.",
    dep: ["attribute-domains", "topology-queries", "memory-allocators", "indexed-face-set"]
  },
  "indexed-face-set": {
    s: "The compact storage form of a mesh: arrays of positions and arrays of corner indices that group into faces, with other attributes in parallel arrays.",
    d: "Positions sit in one array, faces are described by offsets into a corner array, and each corner stores a vertex index. Edges are derived or stored separately. Attributes such as UVs and colors live in arrays indexed by vertex, face or corner. It loads, saves and uploads quickly, and is ideal for evaluation and rendering. It is poor at local topology edits, because adjacency must be computed from the arrays and inserting elements shifts indices.",
    k: ["Parallel arrays vs array of structs: parallel arrays make adding or dropping an attribute cheap and vectorize well, but gather one element from many arrays.", "Offsets for variable-size faces vs fixed triangles: offsets keep quads and n-gons, which artists need, while fixed triangles are simpler for the GPU."],
    p: ["Deleting a vertex shifts every index after it, so any stored index list becomes wrong unless remapped.", "Computing edges on demand each time is repeated work unless the result is cached and invalidated correctly."],
    v: "Load a mesh of ten million polygons, time construction and GPU upload, and confirm the memory per vertex matches the documented layout and a round trip through the editing structure is lossless.",
    dep: ["attribute-domains", "memory-allocators", "struct-serialization"]
  },
  "attribute-domains": {
    s: "Named, typed data layers stored on vertices, edges, faces or corners, such as positions, UV coordinates, colors, weights and custom values, with rules for interpolation.",
    d: "Each attribute has a name, a data type and a domain that says where it lives. Operators and nodes read and write attributes generically, so a new attribute works with existing tools. Interpolation rules decide how values mix when elements are split or merged: average, nearest, or none. Conversion between domains such as corner to vertex needs a rule. It is hard to keep interpolation correct for each type, such as normalizing directions or keeping integer ids intact.",
    k: ["Generic attribute system vs fixed built-in fields: generic scales to custom data and procedural tools, but needs type-checked, slower access paths; fixed fields are fast and inflexible.", "Per-corner vs per-vertex storage: per-corner lets UVs and normals differ at seams, but multiplies storage and complicates merging."],
    p: ["Averaging an integer id or a direction attribute during merge gives meaningless values.", "Name collisions between add-ons and built-in layers silently overwrite data."],
    v: "Add a custom float attribute on the vertex domain, subdivide the mesh, and confirm new vertices receive the interpolated value, then convert it to the face domain and confirm each value equals the corner average.",
    dep: ["indexed-face-set", "memory-allocators", "struct-serialization"]
  },
  "topology-queries": {
    s: "Operations that answer connectivity questions: which faces touch a vertex, what are an edge's neighbors, is the mesh manifold, how are components connected, and what are the boundary loops.",
    d: "Queries use the editing structure's links directly or build lookup tables from compact arrays: vertex-to-face, edge-to-face and face-to-face maps in compressed offset form. Others walk the structure, such as flood fill for connected components, loop and ring walks, and boundary tracing. Results are cached and invalidated on topology change. Hard parts are performance on large meshes, consistent results with non-manifold cases, and defining ring and loop at irregular vertices.",
    k: ["Precomputed lookup tables vs walking links: tables give fast random access on compact meshes, but must be rebuilt after edits; walking needs no cache and requires the linked form.", "Define loops by valence rules vs by user guidance: valence rules are automatic and stop at poles, and sometimes stop where an artist expects to continue."],
    p: ["A cached map survives a topology change because only positions were reported as modified, and returns neighbors that no longer exist.", "Flood fill implemented recursively overflows the stack on a mesh with a million faces."],
    v: "Compute connected components and boundary loops on a mesh built from known pieces, and confirm component and loop counts equal the construction, with each query completing within a second on ten million faces.",
    dep: ["indexed-face-set", "half-edge-structure", "boundary-rep-mesh", "memory-allocators"]
  },
  "ngon-triangulation": {
    s: "Keeps polygons of any size as editable faces and converts them to triangles for display, export and algorithms, choosing diagonals so the result is valid.",
    d: "Quads and n-gons are artist-friendly, but GPUs and many algorithms need triangles. Triangulation chooses diagonals for convex faces by shortest diagonal or ear clipping, and for concave faces or faces with holes needs a robust polygon triangulator working in the face's plane. The same choice must be used everywhere, so shading, baking and export agree. It is hard to triangulate non-planar faces consistently and to keep tessellation stable when vertices move.",
    k: ["Quads and n-gons as first-class vs triangles only: n-gons give clean edge flow and easier editing, but need triangulation and defined behavior for non-planar cases.", "Fixed diagonal rule vs best-quality diagonal per face: a fixed rule is stable and predictable between tools; quality-based changes with vertex movement and flips shading."],
    p: ["A non-planar quad triangulates differently in two tools and shows a different crease.", "Concave or self-overlapping n-gons produce triangles outside the polygon and artifacts in shading."],
    v: "Triangulate a set of convex, concave and holed faces, and confirm triangle areas sum to the polygon's area, no triangle has negative orientation, and exporting to another tool and back keeps the same diagonals.",
    dep: ["triangulation-delaunay", "indexed-face-set", "robust-predicates", "math-library"]
  },
  "normals-smoothing": {
    s: "Computes and stores surface normals, deciding which edges look smooth and which look hard through angle limits, sharp flags, custom normals or smoothing groups.",
    d: "Face normals come from geometry. Vertex normals average adjacent face normals, weighted by angle or area, within smoothing regions bounded by sharp edges, so one vertex may carry several normals at a hard edge. Custom normals can override computed ones, to fix shading on low-poly models. Normals are stored per corner and recomputed after edits. It is hard to keep custom normals valid after topology edits, and to agree on a tangent basis with downstream tools.",
    k: ["Computed normals from angle limits vs stored custom normals: computed ones follow geometry changes automatically; custom normals give exact artistic control and go stale after edits.", "Weighting by angle vs by area: angle weighting is stable on uneven triangulation, while area weighting is faster and skews toward large faces."],
    p: ["Scaling an object non-uniformly without correcting the normal matrix gives wrong lighting.", "Splitting vertices at hard edges changes vertex counts, so exported meshes have more vertices than the artist sees."],
    v: "Shade a cube with a 30 degree smoothing limit and confirm each corner has three distinct normals at the hard edges, then scale it non-uniformly and confirm lighting still agrees with a reference.",
    dep: ["attribute-domains", "creases-edge-flags", "topology-queries", "math-library"]
  },
  "creases-edge-flags": {
    s: "Per-edge and per-vertex markers such as sharp, crease weight, seam and bevel weight, that tell operators and modifiers how to treat an edge.",
    d: "These are attributes on edges or vertices holding booleans or floats. Subdivision reads crease weights to keep edges sharp, smoothing reads sharp flags, UV unwrap reads seams, and bevel reads weights. Flags are preserved across edits by the same interpolation rules as other attributes, and are edited with dedicated tools and selection by flag. It is hard to find which flag affects a given result, and to carry flags through operations that split or merge edges.",
    k: ["One purpose-specific flag per use vs a generic edge attribute: dedicated flags are discoverable and have clear meaning, but multiply code paths; a generic attribute is flexible and unclear.", "Crease as a float weight vs a boolean sharp: weights give graded sharpness for subdivision, but are harder to see and compare."],
    p: ["An edge that is split by an operator loses its crease weight on one of the halves.", "Artists mark an edge sharp and see no change, because the shading uses custom normals that override it."],
    v: "Mark an edge with crease weight 1.0 and subdivide twice, confirm the corresponding limit edge is sharp, then lower the weight to 0.5 and confirm the result lies between sharp and smooth.",
    dep: ["attribute-domains", "boundary-rep-mesh", "indexed-face-set"]
  },
  "bvh-trees": {
    s: "Spatial trees of bounding volumes over triangles or points that allow ray queries, nearest-point search and overlap tests in logarithmic time instead of testing everything.",
    d: "A tree is built by splitting primitives along an axis using a cost heuristic, storing a bounding box per node. Queries descend only into nodes the query touches. Static meshes use a high-quality build. Deforming or sculpted meshes use refit, which updates bounds without rebuilding, or incremental rebuilds of changed parts. It is hard to balance build time against query speed, and to keep trees correct while geometry changes constantly.",
    k: ["High-quality build vs fast build: quality builds speed up many queries, but take seconds on big meshes; fast builds suit dynamic data and give slower queries.", "Refit vs rebuild on deformation: refit is cheap and degrades as shapes change a lot; rebuild restores quality at a cost."],
    p: ["A tree built before a vertex edit still returns old triangles, so picks land on geometry that moved.", "Refitting repeatedly through large deformations makes bounding boxes overlap until queries slow to a crawl."],
    v: "Build over ten million triangles, run a million ray queries, and confirm results equal brute-force tests on a sample, with build time and per-query time recorded against targets.",
    dep: ["indexed-face-set", "task-scheduler", "memory-allocators", "math-library"]
  },
  "closest-point-queries": {
    s: "Finds the nearest point on a surface to a given position, or the first hit along a ray, using trees and exact triangle tests.",
    d: "Given a query point, the traversal descends the tree ordered by distance, prunes boxes farther than the best candidate, and computes exact closest points on triangles, classifying hits as face, edge or vertex. Ray queries test the ray against boxes and then triangles, returning hit position, normal, barycentric coordinates and face index. They are used by snapping, projection, baking, shrinkwrap and sculpting. The hard parts are speed at scale and degenerate triangles.",
    k: ["Exact closest-point vs approximate by sampling: exact gives reliable projection, but costs more per query; sampling is faster and can be wrong near thin features.", "Returning barycentric data vs only position: barycentric data lets callers interpolate attributes, and extends every result structure."],
    p: ["Rays that hit exactly on an edge between two triangles can report no hit due to rounding.", "Queries against a mesh with zero-area triangles return NaN distances that propagate into caller results."],
    v: "Project one million random points onto a sphere mesh and confirm each result lies on the surface within mesh tolerance and matches brute-force nearest points on a sampled subset.",
    dep: ["bvh-trees", "robust-predicates", "math-library"]
  },
  "robust-predicates": {
    s: "Geometric decision functions, such as which side of a plane a point lies on, that give a correct answer even when floating-point rounding would be wrong.",
    d: "Orientation and in-circle tests compute the sign of a determinant. A fast filter uses floating-point arithmetic with an error bound; if the result is within the bound, the test falls back to exact or adaptive-precision arithmetic. Because every higher algorithm, such as triangulation and booleans, depends on these decisions being mutually consistent, a robust predicate prevents impossible results. The hard part is performance, since exact fallback is rare but expensive, and handling inputs like NaN.",
    k: ["Adaptive exact arithmetic vs epsilon tolerances: exact never contradicts itself, but needs special arithmetic; epsilons are simple and can disagree between related tests.", "Filtering with error bounds vs always exact: filters make the common case near floating-point speed, but need provably correct bounds."],
    p: ["Epsilon-based tests used in one place and exact tests in another produce inconsistent topology.", "Compiler optimizations that reorder or fuse floating-point operations break the error bounds."],
    v: "Run orientation tests on millions of nearly collinear and nearly coplanar point sets, and confirm results match a reference exact-arithmetic implementation in every case.",
    dep: ["math-library"]
  },
  "triangulation-delaunay": {
    s: "Builds triangulations of point sets and polygons, such as Delaunay and constrained Delaunay, that avoid thin triangles and respect given boundary edges.",
    d: "A Delaunay triangulation connects points so no point lies inside another triangle's circumcircle, which maximizes the smallest angle. Incremental insertion with edge flips, or divide and conquer, builds it. Constrained versions force specific edges to appear. These are used for filling holes, meshing curves, cutting faces and generating terrain. The difficulty is robustness with collinear and cocircular points, and handling polygons with holes and overlapping constraints.",
    k: ["Delaunay criterion vs ear clipping for polygons: Delaunay gives well-shaped triangles and supports constraints, but is heavier; ear clipping is simple, works on simple polygons, and yields slivers.", "Incremental insertion vs divide and conquer: incremental handles streaming points and is simple, while divide and conquer scales better on large sets."],
    p: ["Cocircular points make the in-circle test ambiguous and produce flip loops without exact predicates.", "Constraint edges that cross each other are not detected, and the algorithm never terminates."],
    v: "Triangulate 100,000 random points and confirm every triangle satisfies the empty circumcircle test, the hull is covered with no overlaps, and constrained edges all appear in the output.",
    dep: ["robust-predicates", "math-library", "memory-allocators"]
  },
  "curve-surface-eval": {
    s: "Evaluates parametric curves and surfaces, such as Bezier, spline and NURBS forms, to points, tangents and normals, and converts them to meshes at chosen resolution.",
    d: "A curve is defined by control points and basis functions; evaluation computes positions at parameter values, with derivatives for orientation. Surfaces extend this to two parameters. Tessellation samples at a resolution chosen by length, curvature or screen size. Curves are used for paths, profiles, hair and modifiers like sweep and lattice. The hard parts are sampling adaptively without cracks between patches, trimmed surfaces, and arc-length parameterization.",
    k: ["Parametric surfaces vs polygon meshes: parametric forms are smooth and compact with exact tangents, but harder to edit locally and to combine with meshes.", "Fixed vs adaptive tessellation: fixed is simple and predictable, while adaptive saves polygons and can leave cracks at patch borders."],
    p: ["Uniform parameter steps give uneven spacing along the curve, so evenly placed objects bunch up.", "Adjacent patches tessellated at different rates leave visible cracks along their shared border."],
    v: "Evaluate a circle represented as a rational spline at 1,000 parameters and confirm every point lies within floating-point tolerance of the true radius, and tangent vectors are perpendicular to radius vectors.",
    dep: ["math-library", "task-scheduler", "memory-allocators"]
  },
  "sdf-voxels": {
    s: "Represents shape as a grid of values, such as signed distance to the surface, so operations like remeshing, booleans and smoothing become simple arithmetic on values.",
    d: "A mesh is converted by computing distance from each grid cell to the surface and storing its sign. Sparse structures store only a narrow band around the surface to keep memory low. Operations like union are min and max of two fields; smoothing is blurring. A surface is extracted again with marching or dual contouring methods. Hard parts are losing sharp features unless gradients are stored, memory at fine resolution, and choosing voxel size.",
    k: ["Dense grid vs sparse narrow band: dense is simple and fast to index, but memory grows with the cube of resolution; sparse scales with surface area, and needs a more complex structure.", "Marching extraction vs dual contouring: marching is simple and rounds sharp corners; dual contouring preserves features and can produce non-manifold output."],
    p: ["A voxel size larger than a thin feature erases it from the field.", "Extracted surfaces carry staircase noise unless the field is smoothed or sampled finely."],
    v: "Convert a mesh to a distance field and back at a given voxel size, and confirm the maximum deviation from the original is under the voxel size, with no holes or floating islands in the result.",
    dep: ["bvh-trees", "closest-point-queries", "memory-allocators", "task-scheduler"]
  },
  "memory-allocators": {
    s: "Custom allocation strategies, such as pools, arenas and tracked allocators, that keep memory use predictable and fast for millions of small elements and huge arrays.",
    d: "General-purpose allocators are too slow and fragment under mesh editing, where millions of small nodes are created and freed. Pool allocators give fixed-size blocks from chunks, arenas free everything at once, and tracked wrappers record sizes and sources for leak detection and the memory statistics shown to users. Large arrays use aligned allocations for vector instructions. The difficulty is thread contention, fragmentation over long sessions, and diagnosing leaks.",
    k: ["Pool and arena allocators vs the system allocator: pools are fast and locality-friendly, but can hold memory that the process will not return; the system allocator is simpler and slower.", "Tracking every allocation vs sampling: full tracking finds every leak and costs time and memory in release builds; sampling is cheap and misses small leaks."],
    p: ["A leak of a few kilobytes per edit goes unnoticed until a multi-hour session runs out of memory.", "Freeing memory on a different thread than the pool that owns it corrupts allocator state."],
    v: "Run a ten-hour scripted edit session in a leak-tracking build and confirm that resident memory returns to the baseline after each undo-all, with no tracked allocations left at exit.",
    dep: []
  },
  "task-scheduler": {
    s: "A pool of worker threads and a queue of tasks that spreads evaluation, extraction, baking and loading across cores while keeping the interface thread free.",
    d: "Work is broken into small tasks with dependencies, pushed to per-thread queues, and balanced by stealing from busy queues. Parallel loops split ranges over elements, such as vertices in a brush stroke. The main thread submits work and collects results without blocking. The hard parts are choosing task size so overhead is small but balance is good, avoiding data races on shared structures, and preventing deadlocks when tasks wait on others.",
    k: ["Work-stealing pool vs fixed partition: stealing balances uneven work automatically, but adds scheduling overhead; fixed partition is simple and wastes cores on skewed loads.", "Background tasks with cancellation vs run to completion: cancellation keeps the interface responsive, but every algorithm needs safe stopping points."],
    p: ["Tasks too small make scheduling cost larger than the work and scaling stops after a few cores.", "A task that blocks waiting on the main thread while the main thread waits for it deadlocks the application."],
    v: "Run a parallel loop over ten million elements at 1, 2, 4, 8 and 16 threads, and confirm speedup is near linear until memory bandwidth limits it, and that output is identical at every thread count.",
    dep: ["memory-allocators", "platform-windowing"]
  },
  "struct-serialization": {
    s: "Describes in-memory structures in a schema so the application can write them to disk, read them back, convert between versions and expose them to other systems.",
    d: "A schema lists every structure with its fields, types and sizes, usually generated from the source headers. The writer emits blocks with a copy of the schema; the reader compares it with the current one and maps fields by name, filling new fields with defaults and dropping removed ones. Pointers are written as ids and patched on load. It is hard to keep generated schemas in sync with code, handle endianness and padding differences, and avoid copying huge arrays.",
    k: ["Schema-mapped binary vs a text or tagged format: mapped binary loads fast and is compact, but is opaque and tied to naming discipline; tagged text is diffable and larger.", "Pointer patching by id vs offsets: ids permit partial loads and linking, and require a lookup table at load."],
    p: ["Renaming a field without a conversion rule loads the new field as default and loses the old data silently.", "Padding differences between compilers produce files that load correctly on one build and wrong on another."],
    v: "Serialize a structure graph, reload it with a build whose structs have an added and a removed field, and confirm shared fields are identical, added fields hold defaults and pointers resolve to the right targets.",
    dep: ["memory-allocators", "math-library"]
  },
  "math-library": {
    s: "Vector, matrix, quaternion and numeric routines used by every component, with consistent conventions for handedness, units, rotation order and precision.",
    d: "It provides small fixed-size vectors and matrices, quaternion and Euler conversions, interpolation, bounding boxes, plane and ray helpers, noise and random numbers, and vectorized bulk operations over arrays. The conventions it fixes, such as column versus row vectors, Z-up versus Y-up and rotation order, appear everywhere. Hard parts are numerical stability in decompositions, avoiding gimbal lock, and producing identical results across compilers and processors.",
    k: ["Single precision vs double precision for scene data: single is half the memory and bandwidth and matches the GPU, but drifts far from the origin; double avoids drift and doubles cost.", "Vectorized math kernels vs scalar code: vectorized code is several times faster on bulk data, but results can differ in the last bits across hardware."],
    p: ["Mixing row-major and column-major conventions transposes a matrix and produces mirrored or twisted results.", "Normalizing a zero-length vector produces NaNs that spread through every dependent computation."],
    v: "Decompose and recompose a million random matrices and confirm round-trip error stays under a tolerance; compare results from vector and scalar paths on the same inputs within a stated number of units in the last place.",
    dep: []
  },
  "platform-windowing": {
    s: "Creates windows, graphics contexts and event loops on each operating system, and hides differences in clipboard, drag-and-drop, dialogs, display scaling and multi-monitor handling.",
    d: "A native layer opens windows, receives keyboard, pointer, touch and tablet events, and translates them into the application's own events. It creates the graphics context, manages swap and presentation, reports display density, and handles system integration such as file dialogs and drag-and-drop. The hard parts are differences between operating systems and window systems, input method support, high-density and mixed-density monitors, and sleep and wake events that lose graphics resources.",
    k: ["Own thin platform layer vs a cross-platform windowing library: an own layer gives full control of events and tablets, but costs ongoing maintenance per platform; a library is quicker and limits access.", "Polling vs event callbacks for input: callbacks give low latency, and polling is simpler to reason about and adds up to a frame of delay."],
    p: ["Dragging a window between monitors of different density leaves the interface blurry or oversized until the next resize.", "The graphics context is lost on sleep or display change, and the viewport turns black."],
    v: "Move the window between two monitors of different scale, minimize, sleep and wake the machine, and confirm the interface rescales, the viewport redraws, and keyboard and tablet input keep working.",
    dep: []
  },
  "pen-tablet-input": {
    s: "Receives high-rate pen events with pressure, tilt, rotation and eraser state, and passes them to tools as smooth, timestamped samples.",
    d: "Tablets report positions and pressure at hundreds of events per second through operating-system interfaces, each with different coordinate spaces and capabilities. The input layer converts to application coordinates, keeps sub-pixel precision, reads buffered history between frames, and tags tool type, pen or eraser. Tools use the pressure and tilt to drive brushes. Hard parts are driver differences, jitter, losing events when the frame is slow, and pairing pen and touch input.",
    k: ["Using buffered history of events per frame vs only the latest: history preserves stroke shape at any frame rate, but needs timestamps and extra handling in every tool.", "Pressure curves in the application vs in the driver: application curves apply consistently across devices, while driver curves duplicate and conflict with them."],
    p: ["Taking only the newest event per frame turns a fast curve into a polyline with visible corners.", "Both driver and application pressure curves apply, and the pen feels either too hard or too soft."],
    v: "Draw a fast circle with a pen at a slow frame rate and confirm the stroke is smooth with no corners, and the recorded pressure curve matches the device's raw samples within resolution.",
    dep: ["platform-windowing"]
  },
  "logging-crash-reports": {
    s: "Writes diagnostic logs, catches crashes, and collects stack traces and session context so failures can be reproduced and fixed.",
    d: "A logging layer records categorized messages with levels to a file and a console, and can be enabled per component at runtime. A crash handler installed at startup writes a stack trace, version, graphics driver information and the last operations to a report, then tries to save a recovery file. Reports can be sent to developers if the user agrees. The difficulty is writing safely from a damaged process, symbolizing traces and protecting private data in logs.",
    k: ["Always-on verbose logging vs enabled on demand: always-on explains any failure afterward, but costs performance and disk; on-demand is cheap and misses the first occurrence.", "Automatic crash upload vs local reports only: upload finds the most common crashes quickly, and raises privacy and consent obligations."],
    p: ["A crash handler that allocates memory fails exactly when memory is corrupted, and produces no report.", "Logs contain file paths and user names that were never meant to leave the machine."],
    v: "Trigger a deliberate crash in a release build, and confirm a report is written with a symbolized stack trace, version, driver string and recent operation log, and a recovery file exists after restart.",
    dep: ["platform-windowing", "memory-allocators"]
  }
});
