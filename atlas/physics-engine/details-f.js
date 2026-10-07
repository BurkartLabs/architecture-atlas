// Details for the physics engine plate, part 6: shapes, foundation and cross-cutting concerns.
ATLAS.details("physics-engine", {
  "sphere-shape": {
    s: "The simplest collision shape, a center and radius, with closed-form tests, rotation-invariant inertia and no orientation to track.",
    d: "A sphere's support point is center plus radius times the direction, its bounds are the center plus or minus the radius, and its inertia is the same about every axis. Pairs with most shapes reduce to a point-versus-shape distance. Rotation of the body has no effect on collision, so a sphere rolls only through friction acting on the solver's rotational state. It is the cheapest shape and a common approximation for particles, projectiles and cloth proxies. Its smooth surface is also why a sphere rolls on a mesh without catching internal edges.",
    k: ["Sphere for approximate collision vs the true shape: a sphere is fast and robust and looks wrong for elongated objects, a true shape matches visually at higher cost.", "Rolling friction on or off: on stops spheres rolling forever and costs an extra row, off lets them roll until sleep."],
    p: ["A sphere used for a character rolls and slides unnaturally on slopes where a capsule would hold.", "Scaling a sphere non-uniformly turns it into an ellipsoid that the engine cannot represent."],
    v: "Roll a sphere down a plane at a known angle and confirm its linear acceleration matches the analytic value for a solid ball, with its contact point and rotation consistent with rolling without slipping.",
    dep: ["support-mapping","shape-bounds","shape-mass-integrals"]
  },
  "box-shape": {
    s: "A rectangular solid defined by half-extents in its local frame, with exact face and edge structure that makes stacking stable.",
    d: "A box's support point comes from the sign of each axis of the direction, its inertia is a closed form diagonal, and it has six faces, twelve edges and eight vertices. Box against box uses SAT with fifteen axes, followed by clipping. Boxes in a stack get four-point manifolds that remain stable. A box is the usual choice for crates, walls and buildings. It is also the standard proxy for anything roughly rectangular, since a box tests faster than a hull. Rotated boxes need an oriented bounds computation for the broadphase.",
    k: ["Box vs convex hull for rectangular objects: a box has specialized fast routines and exact inertia, a hull is general and slower.", "Axis-aligned bounds from a rotated box vs oriented bounds: aligned bounds are cheap for the broadphase and loose at 45 degrees, oriented bounds are tight and cost more to test."],
    p: ["A box with a very small half-extent along one axis acts as a plane, and thin boxes tunnel and make unstable stacks.", "Half-extent versus full-extent mix-ups double or halve box sizes throughout content."],
    v: "Stack a box on a box with a small offset and confirm a four-point manifold, stable rest, and toppling exactly when the center of mass passes beyond the supporting edge.",
    dep: ["support-mapping","shape-mass-integrals","shape-bounds","face-clipping"]
  },
  "capsule-shape": {
    s: "A line segment swept by a radius, giving a smooth, hemisphere-capped solid that slides over edges, used for characters and limbs.",
    d: "A capsule's support point is the endpoint of the segment closer to the direction, plus the radius. It collides as a segment with thickness, so capsule against anything reduces to closest points between a segment and the other shape, then a distance against the radius. Its rounded ends slide over ledges and its smooth sides roll, which is why it suits characters and ragdoll limbs. Inertia has a closed form combining cylinder and hemispheres. Lying capsules in contact with a plane give a two-point manifold.",
    k: ["Capsule vs cylinder for characters: capsules slide and never catch edges, cylinders match doorways and catch on every ledge.", "One contact vs two for a lying capsule: one is cheap and lets it rock, two supports it stably."],
    p: ["A capsule with height less than twice its radius is invalid, and shape code returns nonsense unless it clamps.", "A standing capsule on a slope with one point contact slides slowly because friction acts at one point."],
    v: "Lay a capsule on a plane and confirm two contact points at the ends of the cylindrical segment, and confirm it rolls down a slope at a rate matching the analytic result.",
    dep: ["support-mapping","shape-mass-integrals","shape-bounds","specialized-pair-functions"]
  },
  "convex-hull-shape": {
    s: "The smallest convex solid enclosing a set of points, stored as vertices, faces and edge adjacency, for any compact object a box does not fit.",
    d: "A hull stores its vertices, face planes with vertex lists, and edge connectivity, made at cook time by a hull builder. The support function finds the extreme vertex, accelerated by hill climbing over adjacency so cost is not linear in vertex count. Faces and edges feed SAT and clipping. Hulls are limited in size (often 64 to 255 vertices) to keep queries fast. A concave object is decomposed into several hulls, each a separate shape. Quality of the hull matters: sliver faces and near-duplicate vertices produce unstable contacts.",
    k: ["Few vertices vs many: a few give fast queries and a rougher shape, many follow the visual shape and slow every query.", "Storing face and edge data vs support only: face data enables SAT and exact contact manifolds, support only is smaller and falls back on GJK."],
    p: ["A hull built from nearly coplanar points has sliver faces with unstable normals, and contacts flip between them.", "A hull exceeds the vertex limit, and the builder drops vertices that make a visible dent."],
    v: "Build a hull from a scattered point set and confirm every input point lies inside or on it, every face is planar within tolerance, and the support function matches a brute-force search for random directions.",
    dep: ["support-mapping","collision-asset-cooking","shape-mass-integrals","separating-axis-test"]
  },
  "triangle-mesh-shape": {
    s: "A static surface made of triangles with a bounding volume tree and edge adjacency, for level geometry that is too complex for convex pieces.",
    d: "A mesh stores vertices, indices, per-triangle material and flags, a tree over triangles and adjacency data. It has no volume, so dynamic bodies cannot be made from it and it is usually static, or moved kinematically. Contacts are generated per triangle for the portion of the moving shape's bounds. Thin triangles let fast bodies tunnel since no interior exists, and winding order defines which side is solid for one-sided tests. Memory and cooking time are large, and a mesh with holes or overlapping parts causes unpredictable contacts.",
    k: ["Mesh collision vs several convex hulls: a mesh is exact and heavy and needs midphase, hulls are fast and need decomposition work.", "One-sided vs two-sided triangles: one-sided avoids contacts from the back and lets bodies escape from inside, two-sided is robust against flaws and causes thin-geometry artifacts."],
    p: ["A dynamic body tunnels through a mesh because the mesh has no thickness and the body moves more than its size in a step.", "Using a mesh as a dynamic shape fails because there is no mass or inertia to compute."],
    v: "Drop spheres, boxes and capsules onto a mesh floor with a ramp and a gap, and confirm every one rests on the surface at the correct height with no sinking, and none passes through the gap's edges.",
    dep: ["mesh-midphase","collision-asset-cooking","internal-edge-handling","shape-bounds"]
  },
  "heightfield-shape": {
    s: "A regular grid of height samples used for terrain, with fast cell lookup, per-cell materials and holes, much lighter than a mesh of the same area.",
    d: "A heightfield stores a two-dimensional array of heights with a horizontal scale, and each cell is two triangles whose diagonal choice is stored. A moving shape's bounds are mapped to a range of cells, and the triangles in those cells are tested, with no tree needed. Cell materials and hole flags are stored per cell. Memory is a few bytes per sample. It cannot represent overhangs or caves, and sharp features smaller than a cell are lost. The diagonal choice changes the shape of a saddle and must match the render mesh.",
    k: ["Heightfield vs triangle mesh for terrain: a heightfield is compact and fast with no overhangs, a mesh handles caves at far greater cost.", "Sample resolution matched to render vs coarser: matched avoids visible mismatch, coarser saves memory and lets vehicles sink into small bumps."],
    p: ["The collision diagonal differs from the render diagonal, and objects float or sink on saddles.", "A height quantized to 16 bits makes visible steps on long gentle slopes, and rolling objects stutter."],
    v: "Roll a ball across a heightfield and confirm its contact height matches the interpolated surface within tolerance, and holes let it fall through while neighbouring cells hold.",
    dep: ["mesh-midphase","collision-asset-cooking","shape-bounds","internal-edge-handling"]
  },
  "compound-shape": {
    s: "A set of child shapes with local transforms combined in one body, so a complex object is built from simple convex parts.",
    d: "Each child has its own shape and offset. The body's mass properties are summed over children, and its bounds enclose all of them. In the broadphase the whole compound is one proxy, or its children are inserted individually; in the narrowphase, a small tree over children culls those not near the other shape. Events and materials can report the child that was hit. Concave objects are made by decomposing into convex hulls. Cost grows with child count, and nested compounds are usually flattened.",
    k: ["Compound of children in one body vs separate bodies with joints: compound is perfectly rigid and cheap, joints allow breaking and cost solver time.", "One broadphase proxy vs one per child: one is cheap and over-tests large compounds, per-child is precise and multiplies pairs."],
    p: ["Children overlap, and mass is counted twice in the overlap, so the body is too heavy.", "Adding a child at runtime without recomputing mass and bounds leaves the body inconsistent."],
    v: "Build an L-shaped compound from two boxes and confirm its center of mass matches hand calculation, a ball hits the correct child, and the compound rests stably on either leg.",
    dep: ["box-shape","convex-hull-shape","mass-properties","shape-bounds"]
  },
  "support-mapping": {
    s: "The single function every convex shape provides: the point of the shape furthest in a given direction, which is all that GJK, EPA and sweeps need.",
    d: "A support function takes a direction in the shape's local space and returns the extreme point. For a sphere it is the center plus the scaled direction; for a box it is the corner by signs; for a capsule it is an endpoint plus the radius; for a hull it is the best vertex found by hill climbing. Transforms are applied by rotating the direction into local space and the point back out. Generic algorithms run on any shape with this function, so adding a shape means writing one routine. It is called many times per query, so it is a hot path.",
    k: ["Support function vs explicit feature lists: support is small and universal and gives no features for clipping, feature lists enable exact manifolds.", "Hill climbing vs scanning all vertices: climbing is sublinear for large hulls and can fail with degenerate adjacency, scanning is simple and linear."],
    p: ["The direction is not transformed into local space, and the result is correct only for unrotated bodies.", "Hill climbing gets stuck on a plateau of equal-support vertices and returns a point that is not extreme."],
    v: "For each shape type and random rotations, compare the support output with the brute-force maximum of the dot product over a dense sample of surface points and confirm they agree to tolerance.",
    dep: ["vector-math"]
  },
  "collision-margins": {
    s: "A small skin around shapes: either an inflation that rounds corners and keeps GJK away from touching, or a contact offset that keeps resting bodies slightly apart.",
    d: "Convex shapes are stored as a core plus a margin; GJK works on the core so overlap of the full shapes is a distance test between cores, avoiding the exact-touch degeneracies. Margins also give contacts a safe separation so resting bodies hover a fraction of a unit apart instead of exactly touching, which stabilizes detection. Typical values are one percent of size or a fixed small length. Margins round box corners slightly and the visible gap must be hidden by matching render offsets. Large margins on small objects are visible.",
    k: ["A margin on shapes vs none: a margin makes contacts stable and cheap and rounds geometry slightly, none is exact and needs EPA and tolerance handling.", "A fixed margin vs one proportional to size: proportional scales with content and gives big gaps on huge objects, fixed is predictable and unsuitable for tiny things."],
    p: ["A box with a margin larger than its half-extent has a negative core and collapses.", "Visible floating between resting objects is caused by margins that are not compensated in the render."],
    v: "Rest a box on a floor and measure the gap between surfaces: confirm it equals the configured margin, constant over time, and does not vary with orientation.",
    dep: ["gjk-distance","support-mapping","convex-hull-shape"]
  },
  "shape-bounds": {
    s: "The axis-aligned box that encloses a shape at its current pose, used by the broadphase and queries, computed per shape type from support functions or closed forms.",
    d: "For a transformed shape, bounds come from support points along the six axis directions, or from closed forms: a sphere adds its radius, a box uses the absolute values of its rotation matrix, a hull transforms its vertices or uses support queries. Compound and mesh shapes cache local bounds and transform them. Bounds are padded by margins for the broadphase. The tightness of the bounds sets the number of false pairs, and they must be recomputed whenever a body moves or a shape changes.",
    k: ["Computing bounds from support queries vs from stored vertices: support is generic and cheap per shape, vertices are exact and cost per vertex.", "Axis-aligned bounds vs oriented or sphere bounds: aligned are cheap to compare and loose for rotated shapes, oriented are tight and slower in the broadphase."],
    p: ["Bounds of a rotated long capsule are computed from the unrotated shape, and the broadphase misses pairs.", "Bounds are not updated after a shape's size changes at runtime, and collisions disappear."],
    v: "For random shapes and poses, compare computed bounds with a brute-force min and max over dense surface samples and confirm they contain all samples and are tight to a small tolerance.",
    dep: ["support-mapping","vector-math"]
  },
  "shape-mass-integrals": {
    s: "Closed-form or numerical integration of a shape's volume, centroid and inertia tensor, which feeds the body's mass properties.",
    d: "Spheres, boxes, capsules and cylinders have closed forms. For a convex hull or a closed triangle mesh the volume integrals are computed by summing signed tetrahedra from a reference point to each face, which also yields the centroid and the second moments for the inertia tensor. The result is multiplied by density. Inertia is about the centroid, then shifted by the parallel axis theorem when the shape is placed in a body at an offset. A mesh with holes or flipped faces gives wrong or negative volume.",
    k: ["Exact integrals from the mesh vs approximation by a bounding box: exact is correct for irregular shapes, a box is trivial and wrong for anything non-rectangular.", "Computing at cook time vs at load: cook time is free at runtime, load time handles runtime-built shapes."],
    p: ["A mesh with inverted faces gives negative volume and negative mass, which then becomes a huge inverse mass.", "Inertia is computed about the origin rather than the centroid, and the body wobbles on spin."],
    v: "Compute volume, centroid and inertia of a cube, sphere mesh and L-shaped hull and compare with known analytic values: volumes agree within a percent and the tensors within a few percent.",
    dep: ["vector-math","inertia-tensors"]
  },
  "vector-math": {
    s: "The vectors, matrices, quaternions and transforms used everywhere, including the cross products, rotations and normalizations that define how stable the simulation is.",
    d: "Positions and velocities are three-component vectors, orientations are unit quaternions or matrices, and transforms combine a rotation and translation. The collision and solver code builds from dot and cross products, matrix-vector multiplies and quaternion integration. Normalization appears constantly and must handle near-zero inputs safely. Small decisions matter: column-major or row-major, right-handed or left-handed, which side a transform composes on. Errors in this layer propagate everywhere and are hard to see, because the whole stack is built on top of it.",
    k: ["Single vs double precision: single is fast and halves memory and breaks down at large coordinates, double is accurate and slower and wider.", "Quaternion vs matrix orientation: quaternions are compact and need normalization, matrices avoid conversion for transforms and drift away from orthonormal."],
    p: ["Normalizing a zero-length vector yields not-a-number values that propagate through the solver and wipe the world.", "A handedness mismatch with the game's coordinate system flips rotation directions in joints."],
    v: "Run a property test on random inputs: rotating a vector by a quaternion and its inverse returns the original within a tiny tolerance, and a rotation matrix from a quaternion has determinant one.",
    dep: []
  },
  "simd-data-layout": {
    s: "Arranging body and constraint data and using vector instructions so the solver and collision code process several items at once with few cache misses.",
    d: "Hot loops process four or eight items per instruction when data is stored as separate arrays of x, y and z values, and when constraints are batched into groups of the same type. The solver gathers body data for a batch, computes with wide registers, and scatters results. Memory is allocated aligned, hot fields are kept apart from cold ones, and data is ordered so that neighbours in space are neighbours in memory. It can double solver speed, and it constrains the design: variable-length loops, branching and gather-scatter conflicts cost the gain back.",
    k: ["Wide batches across constraints vs vectors inside a constraint: batches use the hardware fully and need coloring or conflict handling, inner vectors are simple and use a fraction of the width.", "Structure of arrays vs array of structures: arrays of fields are vector-friendly and awkward to debug, structures are natural and waste bandwidth."],
    p: ["Two constraints in one batch write the same body and the later write silently overwrites the first.", "Misaligned loads crash on one platform and merely slow down on another."],
    v: "Run the solver with scalar and vectorized paths on the same scene and confirm equal results within the determinism contract, with measured speedup on the solve phase.",
    dep: ["vector-math","graph-coloring"]
  },
  "task-scheduler": {
    s: "A pool of worker threads that runs the phases of the step as parallel tasks, with dependencies and work stealing, and is shared with the game when possible.",
    d: "The step is split into tasks: update proxies, find pairs, run narrowphase on pair batches, solve islands or color groups, integrate bodies, update sleep. Tasks are submitted to a job system with dependencies, and workers take tasks from queues, stealing when idle. Phases end at barriers where all workers must finish. Granularity matters: tasks too small waste time on scheduling, too large leave workers idle. Sharing threads with rendering and AI needs coordination of priorities. Results should not depend on which worker ran which task.",
    k: ["A dedicated physics thread pool vs the shared job system: dedicated is predictable and wastes cores when idle, shared uses all cores and competes with other work.", "Fine-grained tasks vs one task per island: fine tasks balance load and cost overhead, per-island is cheap and unbalanced for one huge island."],
    p: ["A worker blocks inside a task waiting for another, and with every worker doing so the pool deadlocks.", "A task writes shared data without a barrier, giving races that appear on high core count machines only."],
    v: "Run the step on one, four and sixteen threads and confirm the profiler shows busy workers during parallel phases and the state is equal under the determinism contract, with time falling as threads are added.",
    dep: ["step-memory-arenas","stable-ordering"]
  },
  "parallel-solving": {
    s: "Solving constraints on several threads, either one island per task or color by color within an island, with attention to ordering so results stay repeatable.",
    d: "Islands are independent, so they are distributed across threads with larger islands first. A single large island is solved by graph coloring: constraints in one color run in parallel, colors in sequence. Jacobi-style solvers are fully parallel and converge more slowly. Joint-contact interaction and body updates go through barriers. Large mass-ratio scenes need more iterations in parallel versions, since the ordering is no longer the best sequential one. Scheduling must be stable to preserve determinism across thread counts.",
    k: ["Island-level parallelism vs constraint-level: island-level is simple and has no benefit for one big pile, constraint-level scales inside an island and needs coloring.", "Sequential order preserved vs color order: preserved gives identical results to a single thread and limits parallelism, color order is parallel and changes the answer."],
    p: ["A single giant island is solved on one core while others idle, and frame time does not improve with more cores.", "Results change with thread count because island assignment changes the order of solving."],
    v: "Solve a scene with one large pile and several small ones on one and many threads, and confirm the speedup on the pile (from coloring) and bit-identical results if the engine promises thread-count independence.",
    dep: ["graph-coloring","island-builder","task-scheduler","simd-data-layout"]
  },
  "determinism-layer": {
    s: "The set of rules that make the same inputs produce the same state on every machine and run: fixed order, no hardware-dependent math, fixed step and controlled threading.",
    d: "Sources of divergence include floating-point behavior that differs between instruction sets (fused multiply-add, extended precision), math library functions that differ between platforms, hash ordering, thread scheduling and uninitialized memory. The layer fixes them: compile flags that forbid contraction, own implementations of sine, cosine and square root, sorted iteration, deterministic parallel schedules and the fixed time step. It costs speed and rules out some optimizations. It is needed for lockstep networking and replays, and is tested by running the same inputs on different hardware and comparing state hashes.",
    k: ["Bit-exact determinism vs same-machine repeatability: bit-exact works across platforms and costs performance and constrains code, repeatability is cheap and diverges between machines.", "Fixed-point arithmetic vs controlled floating-point: fixed point is exact and slow and range-limited, controlled floating point is faster and fragile under compiler changes."],
    p: ["A compiler update changes instruction fusion, and two builds of the same game diverge after a minute.", "A single unordered container iteration sneaks in and desyncs only when a certain pair of bodies touches."],
    v: "Run a long scripted scenario on two different machines and builds, hash the full world state each step, and confirm the hashes are identical for every step.",
    dep: ["stable-ordering","vector-math","fixed-timestep","parallel-solving"]
  },
  "large-world-precision": {
    s: "Keeping simulation accurate far from the origin, where single-precision numbers lose resolution, by recentering the world, using local frames or higher precision for positions.",
    d: "A single-precision float has about seven digits, so at ten kilometers from the origin the smallest step is about a millimeter and at a hundred kilometers it is a centimeter. Contacts jitter, thin shapes tunnel and joints drift. Remedies: floating origin that shifts all bodies when the player moves far, per-region local frames, double-precision positions with single-precision relative math, or tiling a large world into separate simulation cells. Each has costs at the borders, where bodies and queries must be handed between frames.",
    k: ["Double-precision positions vs floating origin: doubles are simple everywhere and cost memory and bandwidth, a floating origin keeps single precision and demands that all systems shift together.", "One world with a large extent vs separate cells: one world is simple and imprecise far away, cells are precise and need handoff logic at borders."],
    p: ["A floating origin shifts the physics world but not cached contacts, and every contact jumps by the shift distance.", "A mesh authored far from its own origin has vertices with large coordinates and loses precision before any physics runs."],
    v: "Place a stack of boxes at one hundred kilometers from the origin and confirm it rests without jitter within the same tolerance as at the origin, and a shift of the origin changes no relative positions.",
    dep: ["vector-math","numeric-robustness","physics-world"]
  },
  "numeric-robustness": {
    s: "Techniques that stop floating-point edge cases from becoming collision failures: tolerances, safe normalization, consistent orientation tests and handling of near-degenerate geometry.",
    d: "Rounding makes parallel edges look slightly non-parallel, points on a plane slightly off it, and tiny triangles unmeasurable. Robust code uses tolerances sized to scale, avoids dividing by small values, normalizes with a fallback direction, prefers predicates that give consistent answers (the same pair of triangles always gives the same orientation), and clamps outputs to valid ranges. It also guards against non-finite values at module boundaries. The constants chosen interact: one tolerance too tight causes flicker, another too loose causes visible gaps.",
    k: ["Absolute tolerances vs relative to scale: absolute is simple and breaks when world scale changes, relative works across scales and needs a scale estimate.", "Failing loudly on invalid input vs repairing silently: failing finds bugs early and crashes shipped games, repair keeps running and hides data errors."],
    p: ["A single not-a-number value enters a body and spreads through contacts until every body disappears.", "A tolerance tuned for meter-scale objects is used for millimeter-scale props and everything touches everything."],
    v: "Feed the collision routines degenerate inputs (zero-area triangles, coincident points, parallel edges, huge and tiny scales) and confirm all outputs are finite, no routine hangs and results stay consistent across repeated calls.",
    dep: ["vector-math"]
  },
  "step-memory-arenas": {
    s: "Memory that is allocated at the start of a step from a linear pool and freed all at once at its end, for contacts, constraints and scratch data.",
    d: "A step creates thousands of short-lived objects: manifolds, constraint rows, island lists, query results. Allocating each from the general heap is slow and fragments memory. An arena is a large block bump-allocated in order and reset when the step finishes, making allocation a pointer increment with no frees. Each worker thread gets its own arena or chunk to avoid contention. Size is chosen from the previous step's peak, with a fallback when exceeded. Pointers into the arena must not escape the step, which is the main source of bugs.",
    k: ["Per-step arena vs general allocator: an arena is fast and trivially cheap to free and requires careful lifetime discipline, a general allocator is flexible and slower.", "A fixed capacity vs growing on demand: fixed gives predictable memory and fails on spikes, growing never fails and may allocate in the middle of a frame."],
    p: ["A pointer to arena data is kept by an event consumer after the step, and it reads recycled memory next frame.", "An explosion creates more contacts than the arena holds, and the engine silently drops them."],
    v: "Run a scene with a spike of ten times the usual contacts and confirm the arena grows or reports overflow, no allocation from the general heap occurs during steady state, and memory use returns to normal.",
    dep: []
  },
  "stable-ordering": {
    s: "Giving bodies, pairs and constraints identifiers and sort keys that do not depend on memory addresses or hash order, so iteration order is repeatable.",
    d: "Each body, shape and joint receives an ID from a creation counter. Pairs are keyed by the sorted pair of IDs. Where the engine would iterate a hash table or a list that depends on timing, it sorts by ID first, or keeps an ordered structure. Constraints are solved in a defined order, such as sorted by body IDs, and islands are ordered by their lowest body ID. This turns a nondeterministic ordering into a fixed one at some sorting cost, and is a precondition for determinism, replay and rollback.",
    k: ["Sorting each step vs keeping ordered containers: sorting is simple and costs a pass, ordered containers keep order for free and cost on every insert.", "IDs from a counter vs from the memory slot: counter IDs are stable under compaction, slot IDs are cheap and change when memory is reused."],
    p: ["An ID is reused after a body is removed and an old contact pair is matched to a new body.", "Sorting by pointer values looks stable and changes between runs when the allocator behaves differently."],
    v: "Run a scene twice with different allocation histories and confirm the sequence of pairs, constraints and islands built each step is identical, and the final state hash matches.",
    dep: []
  },
  "determinism-policy": {
    s: "Whether the engine promises identical results across runs, builds and machines, which decides how many other choices are free: threading, math libraries, containers and compiler flags.",
    d: "A game that needs lockstep networking, replays or rollback must be deterministic from the first design decision, because retrofitting it means auditing every container, every parallel loop and every math call. A game that only needs plausible behavior can use the full speed of the hardware and accept that two runs differ. The policy also sets the test strategy: state hashes per step, cross-machine runs and tolerances for comparison. It touches the solver order, threading, memory layout, serialization and the choice of floating-point or fixed-point arithmetic.",
    k: ["Cross-platform bit-exact vs same-binary repeatable vs none: exactness enables lockstep play and costs performance and discipline, repeatable is enough for replays on one machine, none is fastest.", "Deciding at the start vs adding later: at the start costs little per feature, later requires reviewing the whole engine and usually fails."],
    p: ["Determinism is claimed but never tested across machines, and the first online match desyncs.", "A feature added by another team uses an unordered container, silently breaking exactness months later."],
    v: "A continuous test runs a scripted scenario on every build target, hashes the world each step and fails the build on any difference between targets.",
    dep: ["determinism-layer","stable-ordering","parallel-solving","fixed-timestep"]
  },
  "threading-policy": {
    s: "How many threads touch the world and when: single-threaded step, parallel phases inside the step, or the step on its own thread overlapping with game code.",
    d: "Options range from a single thread (simple, deterministic, limited by one core) through parallel phases with barriers to running the simulation a frame behind the game on a separate thread. The choice sets what game code may do while the step runs: nothing, read-only queries or deferred commands. It affects event delivery, query consistency, latency of player input and how the engine shares cores with rendering. Every public function needs a documented rule about when it may be called, and breaking those rules produces rare crashes.",
    k: ["Step on its own thread vs inside the game loop: its own thread overlaps work and adds a frame of latency and synchronization, inside the loop is simple and serializes.", "Queries during the step vs only between steps: during is convenient and sees inconsistent data, between is consistent and limits when gameplay can ask."],
    p: ["Game code reads transforms while the step writes them, and sees one body at a new position and its neighbour at the old.", "Callbacks invoked from worker threads touch non-thread-safe game systems, and crashes appear only under load."],
    v: "Run a stress scene with queries and commands issued from game threads every frame under a thread sanitizer and confirm no data race is reported and results match a single-threaded run under the determinism contract.",
    dep: ["task-scheduler","parallel-solving","body-lifecycle","step-pipeline"]
  },
  "units-and-tolerances": {
    s: "The scale the engine assumes (meters, kilograms, seconds) and the tolerances tied to it, which fix the size range where shapes, speeds and forces behave well.",
    d: "Solver slop, margins, sleep thresholds, restitution thresholds and speculative margins are absolute numbers tuned for objects of about a meter and speeds of a few meters per second. A game built in centimeters, or with giant robots, breaks those assumptions: everything is too sticky or too loose. Mass ratios, shape sizes and gravity all follow from the unit choice. Choose units to match the engine, scale content to fit, and expose tolerances as scaled settings so they are not hard-coded in the code that runs deep in the pipeline.",
    k: ["Real-world units vs game-scale units: real units make tuning intuitive and need content scaled to match, game units follow the artists' tools and need every tolerance retuned.", "Global tolerances vs per-body scaling: global is simple and wrong for a mix of sizes, per-body adapts and adds complexity."],
    p: ["Content imported in centimeters is simulated as if in meters, and everything is a hundred times too large and falls slowly.", "Mixing tiny props and huge buildings in one world makes one set of tolerances wrong for one of them."],
    v: "Build the same scene at two scales with scaled settings and confirm the behavior (rest, bounce, stack height) is the same within tolerance, and unscaled settings visibly differ.",
    dep: ["collision-margins","sleep-management","position-correction","numeric-robustness"]
  },
  "stability-vs-accuracy": {
    s: "The standing trade-off in every layer: approximate, damped and slightly soft behavior is stable and cheap, while exact behavior is expensive and breaks in edge cases.",
    d: "Real-time engines solve approximately, correct errors gradually, add damping, clamp velocities and let objects overlap a little because exact answers are not achievable in the time budget and make stacks and joints explode. Each choice trades accuracy for stability: iteration counts, softness, margins, slop, restitution thresholds. The right point depends on the game: a stacking puzzle needs stillness, a racing game needs plausible dynamics, a robotics simulator needs accuracy. Tuning is a product decision, as much as a technical one, and affects every phase.",
    k: ["Damped and soft vs exact: soft is calm and a little unreal, exact is faithful and prone to jitter and blow-up.", "Tuning for the worst scene vs the typical one: worst-case settings are robust and expensive, typical settings are cheap and fail in rare cases players find."],
    p: ["A setting tuned for one demo scene gives bad results in the real levels with different mass ratios.", "Damping added to hide jitter removes the energy that gameplay depends on, and thrown objects feel dead."],
    v: "A regression scene set (tall stack, heavy-light chain, fast projectile, vehicle landing, ragdoll drop) is run on each change and its metrics (settling time, penetration, energy drift) stay inside recorded bounds.",
    dep: ["soft-step-solver","position-correction","collision-margins","sleep-management"]
  },
  "data-layout-policy": {
    s: "How simulation data is arranged in memory, by island or by type, hot apart from cold, which decides cache behavior and parallelism across the pipeline.",
    d: "Body state, shape data, contacts and constraints can be stored by object (easy to understand, poor locality) or in arrays grouped by use (fast, harder to modify). The decision determines how handles work, how removal compacts storage, which loops vectorize and how islands are scheduled. Sorting bodies by island or by spatial region keeps work for one task in one memory region. Data written by the solver is kept away from data read by queries to limit contention. Changing this late touches almost every file.",
    k: ["Arrays grouped by use vs objects with all their data: arrays are fast and make removal and handles harder, objects are intuitive and cause cache misses.", "Sorting data by island or location vs insertion order: sorting improves locality and costs a pass and invalidates indices."],
    p: ["Cold data (names, user pointers) sits next to hot state, and each body's solver access pulls in a cache line of unused fields.", "Indices into arrays are exposed to game code, and compaction invalidates them."],
    v: "Profile cache misses and solve time on a scene of ten thousand bodies in insertion order and in island order, and confirm the sorted layout has fewer misses and a faster solve with identical results.",
    dep: ["body-storage","simd-data-layout","island-builder","step-memory-arenas"]
  },
  "gameplay-authority": {
    s: "Which system is the source of truth for each object's transform: physics drives the visual, the game drives a kinematic body, or a mix, with rules for handoff.",
    d: "For a crate, physics owns the transform and the game reads it. For a moving platform or a character, game logic owns it and physics follows through kinematic motion. For a ragdoll or a grabbed object, ownership changes during play. Each handoff needs rules: write velocity not transform for kinematic bodies, clear history when teleporting, apply forces from game code only at defined points in the step. Networked games add a third authority, the server, and corrections must be fed to the world without teleporting bodies through others.",
    k: ["Physics-authoritative objects vs game-authoritative objects: physics-authoritative looks natural and is hard to control precisely, game-authoritative is exact and pushes other bodies unrealistically.", "Handing over instantly vs blending: instant is simple and visible as a pop, blending hides it and takes steps during which ownership is unclear."],
    p: ["Both animation and physics write to the same transform in one frame, and the last writer wins at random.", "A teleport does not reset velocity, and the body arrives with the speed it had at the old location."],
    v: "Switch a held object between kinematic and dynamic repeatedly and confirm positions are continuous through each switch, velocity at release matches the hand's velocity, and no object ends up written by two systems.",
    dep: ["body-types","fixed-timestep","render-interpolation","body-lifecycle"]
  }
});
