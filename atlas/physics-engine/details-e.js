// Details for the physics engine plate, part 5: broadphase, narrowphase and continuous collision.
ATLAS.details("physics-engine", {
  "sweep-and-prune": {
    s: "A broadphase that sorts the start and end of every bounding box along one or more axes and reports pairs whose intervals overlap on all axes.",
    d: "Boxes are projected onto each axis as an interval. Endpoints are kept in sorted arrays, and when a body moves only the endpoints that moved are re-sorted with insertion sort, which is nearly free for coherent motion because order changes rarely. Overlap pairs are added or removed as endpoints swap places. It excels with many mostly static bodies and has trouble when a single large or distant body overlaps most others on an axis, or when many bodies sit in the same slab. Using multiple axes or a chosen axis mitigates it.",
    k: ["One axis vs all three: one axis is cheap and degrades on scenes spread along another axis, three axes cost more per move and prune well in any layout.", "Incremental sorting vs full re-sort each step: incremental is fast with coherence and suffers when many bodies teleport, a full sort is predictable."],
    p: ["A huge static floor box overlaps everything on two axes and every pair test goes through its interval.", "Teleporting hundreds of bodies at once turns insertion sort into a quadratic pass."],
    v: "Move one body through a field of ten thousand and confirm only the endpoints it crossed change position, and the set of reported pairs equals a brute-force test of all pairs.",
    dep: ["aabb-fattening","pair-manager","shape-bounds"]
  },
  "dynamic-aabb-tree": {
    s: "A binary tree of bounding boxes over all proxies, with insertion, removal and update as bodies move, used for pair finding and for queries.",
    d: "Leaves hold fattened boxes of shapes; internal nodes hold the union of their children. Inserting a leaf descends by lowest cost, using surface area as an estimate of query cost, then rotations rebalance. Moving a body that exits its fat box removes and reinserts it. Pairs are found by querying the tree with each moved proxy. Ray and box queries traverse it too. It handles varied sizes and non-uniform distributions well, and is the default in many engines, at the cost of pointer chasing and tree-quality drift over time.",
    k: ["Surface area heuristic insertion vs simple center distance: area gives better trees and costs more per insertion, distance is quicker and degrades queries.", "One tree for all vs separate static and dynamic trees: one is simple, separate trees avoid reinserting static data and allow dynamic-versus-static queries cheaply."],
    p: ["After thousands of insertions the tree becomes unbalanced, and queries slow by an order of magnitude without a visible cause.", "Fat boxes grow large for fast objects, and one fast body overlaps hundreds of others in the tree."],
    v: "Insert ten thousand random boxes, perform one million random queries, and compare tree results with brute force: confirm identical sets and a tree height within a small factor of the log of the count.",
    dep: ["aabb-fattening","tree-balancing","shape-bounds","pair-manager"]
  },
  "uniform-grid": {
    s: "A broadphase that divides space into equal cells and puts each proxy in the cells it covers, so overlap tests are limited to proxies sharing a cell.",
    d: "Each box maps to a range of cells; testing a pair needs only the contents of those cells. Insertion and removal are constant time, and the structure parallelizes well since cells are independent. Cell size should match typical object size: too small and large objects span many cells, too large and each cell holds many proxies. Space is usually hashed to a table to avoid allocating an unbounded grid. It is a natural fit for same-sized particles and a poor fit for mixed scales.",
    k: ["Cell size near the average object size vs the largest: average is efficient for most and makes large objects touch many cells, largest is simple and over-tests small ones.", "Dense array grid vs spatial hash: dense is fast and bounded in extent, a hash supports unbounded worlds with collisions and cache misses."],
    p: ["A single very large object registers in thousands of cells every step.", "A hash with too few buckets collides frequently, and the average cell lookup turns into a long list scan."],
    v: "Fill a grid with a hundred thousand particles of equal size, query neighbour pairs, and confirm the results equal brute force at a small fraction of the time.",
    dep: ["shape-bounds","pair-manager","simd-data-layout"]
  },
  "hierarchical-grid": {
    s: "A stack of uniform grids with increasing cell sizes, where each object goes into the level whose cell size fits it, so mixed-size scenes avoid the costs of one cell size.",
    d: "Level zero has small cells for small objects, each higher level doubles the cell size. An object is inserted into the lowest level where it fits in a few cells. A pair test checks the object's cell neighbourhood in its own level and in all larger ones, since a small body can overlap a big one that lives higher up. It combines the constant time insertion of a grid with a tolerance for varied sizes. The cost is more levels to query, and large objects at the top degrade into a list.",
    k: ["Power-of-two level sizes vs finer ratios: powers of two are simple and waste up to half a cell, finer ratios fit better and need more levels.", "Query only upward vs both directions: upward visits fewer levels and requires each pair to be found once from the smaller object."],
    p: ["Objects that grow or scale at runtime are not moved to a higher level, and queries get slower silently.", "Pairs are reported from both levels, duplicating work unless the smaller-object rule is enforced."],
    v: "Mix ten thousand small bodies with fifty large ones and confirm every overlapping pair is found exactly once, and compare timing against a single-level grid.",
    dep: ["uniform-grid","shape-bounds","pair-manager"]
  },
  "aabb-fattening": {
    s: "Enlarging each proxy's box by a margin and, for moving bodies, along their velocity, so the broadphase does not need updating every step.",
    d: "A body's box is padded by a small constant and extended in the direction of its predicted motion. While the true box stays inside the fat box, the broadphase proxy is left alone; only when it escapes is the proxy updated. This turns a per-step update for each moving body into an occasional one. Extra pairs are reported for boxes that are close but not touching, and the narrowphase discards them. Larger margins save updates and create more pairs, so the margin is a trade-off tuned to typical speeds.",
    k: ["Large margin vs small margin: large margins mean fewer updates and more false pairs, small margins mean the opposite.", "Velocity-based extension vs a constant margin: extension handles fast bodies without a big margin everywhere, and a sudden direction change leaves the box stale."],
    p: ["A margin that is zero for resting bodies makes jittering bodies update the tree on every step.", "Speculative contacts depend on the margin to find pairs that are about to touch, and a too-small margin means they are never created."],
    v: "Move a body in a straight line and count broadphase updates: confirm they occur once every several steps rather than every step, and that no pair found by brute force is missed.",
    dep: ["shape-bounds","dynamic-aabb-tree","sweep-and-prune"]
  },
  "pair-manager": {
    s: "Stores the set of overlapping proxy pairs between steps, reports pairs that started and stopped overlapping, and owns the contact data attached to each.",
    d: "Broadphase updates yield pairs added and removed. The manager keeps them in a hash keyed by the two proxy IDs (in canonical order), ensures each pair appears once, and attaches the contact object that the narrowphase fills. New pairs are filtered before creation. When a pair is removed, its contact is destroyed and an end event is queued. Ordering of pair creation must be deterministic if the solver is to be. Under heavy overlap, the pair set is the largest data structure in the engine.",
    k: ["Persistent pair set vs recomputing pairs each step: persistent keeps contact history and costs bookkeeping, recomputing is stateless and loses warm starting.", "Hash lookup vs sorted array: a hash gives constant time operations and unordered iteration, a sorted array is ordered and costs on insertion."],
    p: ["Pairs are reported in hash order, so contact order and therefore results change from run to run.", "A pair removed in the broadphase while a manifold is still referenced by a joint or an event leaves dangling data."],
    v: "Move two boxes into and out of overlap and confirm one pair is created and one destroyed exactly at the boundaries of their fat boxes, and the pair count equals brute force for a random scene.",
    dep: ["dynamic-aabb-tree","pair-filter-callbacks","contact-persistence","stable-ordering"]
  },
  "pair-filter-callbacks": {
    s: "Rules and hooks evaluated when a pair appears that decide whether it should collide at all: layer masks, collision groups, joint-connected pairs and user callbacks.",
    d: "On pair creation the manager checks, cheapest first: both static or both sleeping, layer and mask, group rules, whether a joint connects them with collision disabled, then an optional user callback that can accept, reject or set flags. The decision is cached with the pair and is rechecked only when filtering data changes. Filtering at this point is far cheaper than discarding contacts after the narrowphase. User callbacks are flexible and are called from worker threads, so they must be thread safe and fast.",
    k: ["Mask filtering vs callbacks: masks are cheap and limited to bit logic, callbacks express any rule and cost a call per new pair.", "Filtering at pair creation vs per step: at creation is cheap and misses later changes, per step is current and expensive."],
    p: ["A callback consults game state that changes, but the result is cached, so the pair behaves according to old state.", "Filtering rules that are not symmetric yield different results depending on the order of the pair."],
    v: "Create pairs that should be rejected by mask, by group and by joint exclusion, and confirm none produce contacts or events, while a pair accepted by a callback does.",
    dep: ["layers-and-masks","pair-manager","joint-framework"]
  },
  "tree-balancing": {
    s: "Keeping the dynamic bounding volume tree efficient through rotations during insertion and periodic rebuilds, so queries stay logarithmic after many updates.",
    d: "Incremental rotations during insertion swap subtrees when that reduces the surface area of internal nodes, keeping depth in check at low cost. Even so, a tree used for years degrades, so the engine periodically rebuilds part or all of it with a top-down split along the longest axis using the median or a surface area heuristic. Rebuilds can run on a background thread over a snapshot and swap in when done. Static trees are built once with a high-quality method. The tradeoff is rebuild time against query time.",
    k: ["Incremental rotations vs scheduled full rebuilds: rotations spread cost and cannot repair global structure, rebuilds restore quality and cause spikes if done at once.", "Median split vs surface area heuristic build: median is fast and good, surface area is slower and gives faster queries for uneven data."],
    p: ["A rebuild of a large tree is done in one step, and the frame time spikes visibly every few seconds.", "The tree is rebuilt while a query on another thread reads it, which yields missed or duplicate hits."],
    v: "Insert and move bodies for a minute so the tree degrades, record query time, then run the rebuild and confirm query time falls and tree depth drops with identical query results.",
    dep: ["dynamic-aabb-tree","task-scheduler"]
  },
  "narrowphase-dispatch": {
    s: "Chooses the right contact-generation routine for each pair of shape types, using a table indexed by the two types, and swaps arguments when needed.",
    d: "With a dozen shape types there are dozens of pairs. A function table maps each type pair to a routine: sphere against sphere, box against box, convex against convex through GJK, and anything against a mesh through the midphase. Routines are written for one ordering of the pair, so the dispatcher swaps arguments and flips the normal. Compound shapes expand into their children. The table makes adding a shape a matter of filling a row, and every missing entry falls back on the generic convex path, if one exists.",
    k: ["A type-pair table vs a virtual call on the shape: a table is explicit and fast, supports specialized routines per pair and requires entries for each combination.", "Falling back on generic GJK for missing pairs vs refusing: fallback always works and is slower, refusing finds missing routines early and breaks content."],
    p: ["A new shape type is added without entries in the table, and its collisions are silently ignored.", "The normal is not flipped when arguments are swapped, and bodies are pulled together instead of apart."],
    v: "Test every shape pair against a generic reference and confirm that the dispatcher's choice gives the same contact normal direction and depth within a tolerance, regardless of argument order.",
    dep: ["specialized-pair-functions","gjk-distance","mesh-midphase","compound-shape"]
  },
  "separating-axis-test": {
    s: "Tests two convex shapes by checking candidate axes for a gap between their projections, finding the axis of least overlap when they intersect.",
    d: "If two convex shapes do not overlap, some axis separates them. Candidate axes are the face normals of each shape and the cross products of edge pairs. Each axis requires projecting both shapes and comparing intervals, and the axis of smallest penetration gives the contact normal. For boxes, fifteen axes are tested; for hulls with many faces and edges the edge pairs dominate cost, and hill climbing over a precomputed adjacency graph helps. It gives exact face contacts for polyhedra, and unlike GJK it needs an explicit feature list.",
    k: ["SAT vs GJK and EPA for polyhedra: SAT is exact and gives features for clipping, GJK handles any convex shape and returns less structured results.", "Testing all edge pairs vs using adjacency: all pairs is simple and quadratic, adjacency prunes to the edges that can produce the minimum."],
    p: ["Parallel edges give a near-zero cross product that is normalized into noise and is picked as the best axis.", "Bias toward face axes is omitted, so the contact flips between face and edge normals and a box on a box flickers."],
    v: "Test a box and a rotated box in many random poses and confirm SAT agrees with brute-force overlap, and the reported axis equals the direction of minimum translation to separate.",
    dep: ["face-clipping","convex-hull-shape","box-shape","numeric-robustness"]
  },
  "gjk-distance": {
    s: "Computes the distance between two convex shapes, or detects overlap, by iteratively building a simplex inside their Minkowski difference using only support functions.",
    d: "The difference of two convex shapes is convex and contains the origin exactly when the shapes overlap. The algorithm keeps a simplex of up to four points in the difference, finds the point closest to the origin, and uses the support function in the direction of the origin to find a better point, repeating until progress stops. It works with any shape that has a support function, so spheres, capsules, boxes and hulls share one routine. Degenerate simplices and shapes that touch exactly cause the usual failures, solved with tolerance and iteration limits.",
    k: ["GJK on core shapes with margins vs on the full shape: with margins, the shapes are shrunk to a core so overlap becomes distance and EPA is rarely needed, full shape gives exact results and needs EPA.", "Warm starting from the last simplex vs from scratch: warm starting converges in one or two iterations for coherent motion, scratch is stateless and costs more."],
    p: ["A coplanar simplex makes the closest point calculation divide by a tiny determinant, and the result is a jump.", "Without an iteration limit, a numerically stalled case loops forever and freezes the frame."],
    v: "Compute distances for pairs of spheres, boxes and hulls with known analytic answers and confirm they match to a small tolerance, with iteration counts under about ten for separated shapes.",
    dep: ["support-mapping","collision-margins","epa-penetration","numeric-robustness"]
  },
  "epa-penetration": {
    s: "When GJK finds overlap, grows its simplex outward to the nearest face of the Minkowski difference, giving penetration depth and normal.",
    d: "It starts from the final GJK simplex, a tetrahedron containing the origin, and repeatedly finds the face closest to the origin, then expands the polytope in that face's normal direction using the support function. When expansion no longer moves the face outward, the face's normal and distance are the minimum translation to separate the shapes. A witness point on each shape comes from the barycentric coordinates of the closest point. Data structures for the growing polytope are heap allocated per call, or bounded, and the algorithm needs care with coplanar faces.",
    k: ["Using EPA vs core shapes with margins: EPA gives accurate depth for deep overlap and is slow and fragile, margins avoid it and give slightly rounded contacts.", "Bounded polytope size vs unbounded: bounded caps memory and time and fails on complex shapes, unbounded is complete and unpredictable."],
    p: ["A very shallow penetration gives a degenerate initial simplex with the origin on a face, and EPA returns a random normal.", "A fixed polytope buffer overflows on large hulls and the function quietly returns a wrong depth."],
    v: "Overlap two spheres and two boxes by known depths and confirm EPA returns the analytic normal and depth within a small tolerance, and the witness points lie on each shape's surface.",
    dep: ["gjk-distance","support-mapping","numeric-robustness"]
  },
  "specialized-pair-functions": {
    s: "Closed-form contact routines for common shape pairs, such as sphere and sphere, sphere and box, capsule and capsule, that are faster and more accurate than the generic convex path.",
    d: "Spheres compare center distance to radius sum. A capsule is a segment with radius, so capsule against capsule reduces to the closest points between two segments, then a sphere test. Sphere against box clamps the center to the box and measures distance. Box against box uses SAT and clipping. Each is a few dozen operations without iteration and produces exact normals, so resting contacts do not wander. They exist because the commonest pairs dominate the cost and a generic algorithm adds noise to them.",
    k: ["Specialized routines vs one generic algorithm: specialized are faster and give cleaner contacts and are more code to test, generic is small and treats everything the same.", "Returning one contact vs several for capsules: one is cheap and unstable for capsules lying side by side, two stabilizes lying capsules at modest cost."],
    p: ["Parallel capsule segments have infinitely many closest points, and the routine picks one that flips each step.", "A sphere center exactly inside a box has an undefined nearest face, and the normal flips."],
    v: "For each specialized pair, compare the output with the generic path across thousands of random poses and confirm the same overlap decision, depth within tolerance and a normal within a small angle.",
    dep: ["sphere-shape","capsule-shape","box-shape","narrowphase-dispatch"]
  },
  "mesh-midphase": {
    s: "Finds which triangles of a mesh or heightfield cells are near a shape, using a bounding volume tree over the triangles, before exact tests run.",
    d: "The moving shape's bounds, transformed into the mesh's local space and expanded by margin, are traversed through the mesh's tree. Each leaf returns a triangle that is passed to a convex-versus-triangle routine. Heightfields skip the tree and compute the range of cells directly from the bounds. Large shapes touching many triangles produce hundreds of contacts, so results are limited or reduced afterward. The tree is built at cook time and is static. Triangle winding and edge flags come from the cooked data.",
    k: ["A bounding volume tree vs a grid over triangles: a tree handles uneven triangle density, a grid is simple for uniform terrain and wastes cells on sparse regions.", "Testing every triangle in the box vs culling by normal: all triangles are correct, culling back-facing ones removes false contacts and breaks for thin double-sided geometry."],
    p: ["A large dynamic body overlapping a dense mesh generates thousands of triangle tests each step.", "Triangles are tested in the mesh's local space with the shape transformed by single-precision math, and far from the origin the contact jitters."],
    v: "Roll a sphere over a mesh and confirm that the number of triangles tested per step is a small number near the sphere, and the contacts equal those from testing every triangle.",
    dep: ["triangle-mesh-shape","heightfield-shape","dynamic-aabb-tree","shape-bounds"]
  },
  "face-clipping": {
    s: "Builds a contact manifold between two polyhedra by clipping one face against the side planes of the other, yielding up to a handful of points spread over the contact area.",
    d: "After SAT chooses a reference face on one shape and an incident face on the other (the most anti-parallel one), the incident polygon is clipped against the side planes of the reference face. Points below the reference plane are kept with their depth. The result approximates the contact patch as a polygon of up to eight points, later reduced to four. Edge-edge cases yield a single point at the closest points of the edges. Clipping gives stable contacts for stacking because points remain in the same place across steps.",
    k: ["Clipping vs sampling contact points from GJK: clipping gives the full patch in one pass and needs face data, GJK gives one point per call and needs perturbation or accumulation to form a manifold.", "Choosing the reference face by largest penetration vs a face bias: bias favors the same face over steps and prevents flipping at slight cost in accuracy."],
    p: ["The reference and incident roles flip between steps for nearly parallel faces, and the manifold jumps.", "Clipping against side planes with a tolerance that is too large keeps points outside the face, giving phantom torque."],
    v: "Rest a box on a box face and confirm four contact points at the overlapping corners, with equal depths, remaining stable to within a tiny distance over a hundred steps.",
    dep: ["separating-axis-test","convex-hull-shape","contact-manifold"]
  },
  "contact-manifold": {
    s: "The set of contact points, up to about four, with shared normal and per-point depth, that describes how two shapes touch in one step.",
    d: "A manifold ties two shapes together and holds a few points, each with positions in both bodies' local frames, a depth, a feature identifier and the accumulated impulses from last step. The normal is common. Points are added by the narrowphase; the persistent ones are updated, and those that moved apart or slid too far are dropped. Four points suffice to support a box and keep the solver stable. The manifold is the unit passed to the solver, event system and visualizer.",
    k: ["A shared normal for the manifold vs per-point normals: shared is simple and right for flat contact, per-point is needed for meshes and curved surfaces.", "Points stored in local space vs world space: local space survives motion between steps and costs a transform, world space is direct and goes stale."],
    p: ["Points are stored in world space and not updated, and persistent contacts keep reporting a separation that is no longer true.", "A manifold with only one point on a resting box lets it rock back and forth at the edge."],
    v: "Press a box against a wall and confirm the manifold has points matching the touching face, one normal and depths consistent with a known penetration, and warm-start impulses carry from step to step.",
    dep: ["narrowphase-dispatch","face-clipping","manifold-reduction","contact-persistence"]
  },
  "manifold-reduction": {
    s: "Cuts a large set of candidate contact points down to the few that best represent the contact area, usually keeping the deepest and three that span the largest polygon.",
    d: "Clipping and mesh collision can produce many points. The reduction keeps the deepest point, then the point farthest from it, then the points that maximize the area on either side of that line, giving a quadrilateral that supports the body. Fewer points means fewer solver rows and less work. Dropping too many points leaves a body unsupported and it rocks, and dropping points that alternate between steps destroys warm starting. Rules must be stable: the same inputs should keep the same four.",
    k: ["Reduce to four points vs keep more: four is cheap and enough for stable support, more gives smoother contact for large flat objects and costs solver time.", "Selecting by area vs by depth only: area gives a stable support polygon, depth only keeps the points that are closest to penetrating and can leave an object balanced on one side."],
    p: ["Reduction chooses different points each step for a near-symmetric contact, and warm-start impulses are lost.", "Points are removed before the solver sees them, so a large plank sagging between supports penetrates between the kept points."],
    v: "Press a flat plate onto a mesh with many triangle contacts and confirm four points remain, forming a polygon whose area is a large share of the contact patch and stays the same over many steps.",
    dep: ["contact-manifold","contact-persistence","mesh-midphase"]
  },
  "contact-persistence": {
    s: "Keeping a pair's contact points from one step to the next and matching new points to old ones, so impulses and identity carry over.",
    d: "At each step the new manifold from the narrowphase is compared with the old one. A new point that matches an old one by feature ID or by being within a distance tolerance in local space inherits its accumulated impulses. Old points that no longer fit are dropped, those that moved too far in the tangent direction are discarded, and new points are added. Persistence supports warm starting, friction anchors and begin/end events. When matching is wrong, impulses attach to a different point and the body gets a kick.",
    k: ["Feature-ID matching vs distance matching: IDs are exact when features are stable and fail when the shape changes, distance matching works for any shape and can mismatch close points.", "Updating old points incrementally vs regenerating each step: incremental gives persistence for free and drifts, regeneration is exact and loses history."],
    p: ["The distance threshold is bigger than the point spacing, and impulses are inherited by the wrong neighbour.", "Points persist while a body slides far, and a stale anchor drags the body back."],
    v: "Let a box rest and confirm each step's manifold keeps the same point identities and impulses within a small tolerance, and a box sliding over a surface drops and recreates points as expected.",
    dep: ["contact-manifold","pair-manager","stable-ordering"]
  },
  "internal-edge-handling": {
    s: "Prevents spurious bumps when a shape rolls over the seam between two coplanar triangles, by discarding or correcting contacts generated on internal edges and vertices.",
    d: "A ball rolling across two adjacent flat triangles can contact the shared edge instead of the faces and be pushed in the edge's direction, producing a ghost bump. The cooker flags edges as internal when neighbouring triangles are nearly coplanar and convex. At runtime, a contact on a flagged edge has its normal replaced with the triangle's face normal, or is dropped when another triangle already provides the contact. It is required for any mesh floor and difficult at concave seams and for sloped terrain with small angles.",
    k: ["Cook-time edge flags vs runtime neighbour search: flags are fast and need adjacency data in the asset, runtime search works on any mesh and costs per contact.", "Replacing the normal vs dropping the contact: replacement keeps support and can pull a body into a ridge, dropping is simple and can lose contact on a seam."],
    p: ["A concave seam is marked as internal and contacts there are removed, so objects fall through the crease.", "Edge flags are not rebuilt after mesh edits, and old flags make wrong contacts."],
    v: "Roll a ball across a flat mesh made of many triangles at speed and confirm its trajectory has no vertical or lateral deflection above a tiny tolerance when crossing seams.",
    dep: ["mesh-midphase","triangle-mesh-shape","collision-asset-cooking","contact-manifold"]
  },
  "time-of-impact": {
    s: "Computes the earliest time within a step at which two moving shapes first touch, given their linear and angular motion, so a body can be stopped at the contact.",
    d: "For a pair with known start and end transforms, the routine searches for the smallest fraction of the step where the distance between shapes falls to a target (a small separation). It uses the distance from GJK and a bound on how fast the shapes can approach to take safe steps, repeating until the gap is within tolerance. A result at fraction one means no impact. It handles rotation by bounding motion of any point on a shape. The cost is several distance queries per pair, so it runs only for flagged bodies.",
    k: ["Root finding on separation vs sampling the path: root finding is exact to tolerance and costs iterations, sampling is simple and misses brief contact between samples.", "Targeting a small positive separation vs exact touch: a separation avoids starting the next step in penetration and leaves a tiny visible gap."],
    p: ["The iteration cap is reached on a grazing case, and the routine returns a time before the contact, stalling the body there.", "Angular motion bound is too loose for a long thin shape, and it advances in tiny steps and burns the budget."],
    v: "Fire a small sphere at a thin wall at a speed that skips it in one step and confirm the TOI is the fraction at which the sphere surface meets the wall, with the body stopped there.",
    dep: ["gjk-distance","conservative-advancement","support-mapping"]
  },
  "conservative-advancement": {
    s: "Finds time of impact by repeatedly advancing the shapes by the largest step that provably cannot cause contact, based on current distance and maximum relative speed.",
    d: "At time t, the shapes are separated by distance d, and the fastest any pair of points can approach is bounded by the relative linear speed plus the angular speed times the shape's radius about its center. Advancing by d divided by that bound cannot produce contact. Repeating converges toward the impact time from below. Convergence is slow when approaching at grazing angles, since the bound uses the worst-case direction. The method is simple and robust and works with any shapes having a distance function.",
    k: ["Conservative advancement vs root-finding with brackets: advancement never overshoots and converges slowly near touching, bracketed root finding converges faster and needs more careful handling.", "A tight per-axis motion bound vs a single radius bound: per-axis is tighter and needs more math, radius is cheap and slows convergence for long shapes."],
    p: ["A fast spinning long body makes the bound huge, and advancement takes dozens of steps each with a distance query.", "A fixed iteration limit is hit near contact and the result is returned as if it were a hit."],
    v: "Spin and translate a long box toward a wall and confirm advancement converges to the same impact time as a fine brute-force sampling, in under a few dozen iterations.",
    dep: ["gjk-distance","time-of-impact","support-mapping"]
  },
  "speculative-contacts": {
    s: "Creating contacts for shapes that are close but not yet touching, with a bias that allows approach only up to the gap, so fast bodies stop at surfaces without a separate CCD pass.",
    d: "For pairs within a margin that depends on their relative speed, the narrowphase produces a contact with positive separation. The normal row has a velocity bias of separation divided by the step, so the solver permits approach exactly until the surface would be touched this step, and no further. It handles linear motion cheaply inside the same solver. It can create ghost collisions for bodies passing at an angle, since the contact assumes motion toward the normal, and rotation is only approximated.",
    k: ["Speculative contacts vs swept CCD: speculative is cheap and uniform, runs in the solver and is approximate for rotation, swept CCD is exact for the first hit and runs as a separate pass.", "A margin proportional to speed vs fixed: proportional catches fast bodies and creates more contacts, fixed is cheap and tunnels past a certain speed."],
    p: ["A body skimming past a corner at speed is stopped by a speculative contact against the corner's face normal.", "The margin is capped, and bodies faster than the cap still tunnel through thin walls."],
    v: "Fire a box at a thin wall at several speeds and confirm it stops at the wall with no tunnelling up to the configured margin, and a nearby fast pass that should miss the corner does not get stopped.",
    dep: ["contact-constraints","aabb-fattening","narrowphase-dispatch","sequential-impulses"]
  },
  "swept-ccd-pass": {
    s: "A pass after integration that sweeps flagged bodies along their motion, finds the earliest impact against static or other CCD bodies, and moves them back to that time.",
    d: "After the solver, each flagged body's path from start to end of step is swept through the broadphase. For each candidate, time of impact is computed, and the earliest is used to clamp the body to that fraction, with its velocity along the impact normal removed or reflected. Bodies that were stopped are then handled normally next step. Only motion against static geometry or other CCD bodies is swept, since sweeping everything against everything costs too much. The pass can leave a body between steps in a state that disagrees with other bodies' motions in the same step.",
    k: ["Sweeping against static only vs against all bodies: static only is cheap and handles walls and floors, all bodies prevents bullet-through-box and costs far more.", "Clamping the whole step vs sub-stepping the remainder: clamping is simple and loses motion after impact, sub-stepping is exact and costs an extra pass."],
    p: ["A body clamped to its impact time is moved while its contacts still refer to the previous position, and the next solve sees a jump.", "Two CCD bodies stop each other from different impact times, and a chain of dependencies resolves one step late."],
    v: "Fire a fast body at a stack of thin plates and confirm it stops at the first plate, its position at the impact time is on the surface, and no plate is passed through at any speed tested.",
    dep: ["time-of-impact","conservative-advancement","dynamic-aabb-tree","ccd-selection"]
  },
  "ccd-selection": {
    s: "The rule for which bodies get continuous collision, based on flags, speed relative to size and body type, since running it on everything is too expensive.",
    d: "Sweeping is costly, so only bodies likely to tunnel get it: those flagged by designers (bullets, thrown objects) and those whose motion in one step exceeds a fraction of their smallest dimension, such as half the core radius. The check is a speed against size test run after velocity integration. Static and slow bodies never qualify. Some engines promote a body automatically for a few steps after it exceeds the threshold. Misjudging the threshold either wastes budget or lets thin walls be crossed.",
    k: ["Automatic speed threshold vs explicit flags: automatic covers surprises and costs for every fast object, flags are free and rely on designers knowing what is fast.", "Threshold relative to smallest dimension vs to bounding radius: smallest dimension is correct for tunnelling and triggers on long thin objects often, radius under-triggers on them."],
    p: ["A thin projectile is not flagged and crosses a thin wall at ordinary speed.", "Every debris piece qualifies after an explosion, and CCD cost multiplies in the frame when budget is tightest."],
    v: "Launch bodies at a range of speeds with and without flags and confirm that those above the threshold are swept, those below are not, and a count of swept bodies per step stays below the configured budget.",
    dep: ["body-types","shape-bounds","swept-ccd-pass"]
  }
});
