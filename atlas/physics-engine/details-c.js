// Details for the physics engine plate, part 3: world, bodies, time stepping, islands and sleeping.
ATLAS.details("physics-engine", {
  "physics-world": {
    s: "The container that owns all bodies, shapes, joints and the broadphase, holds global settings like gravity, and advances the simulation one step at a time.",
    d: "The world is the single entry point: game code creates bodies and joints in it, sets gravity and solver settings, calls step with a time delta, then reads transforms and events back. Internally it holds the body arrays, the broadphase, the pair cache, the constraint list, the island set and scratch memory. Several worlds can exist independently, for example one per level or for a preview. It is hard because it is a boundary: game code expects to change anything at any time, while the step needs a stable structure, so changes are queued or forbidden during the step.",
    k: ["One global world vs multiple independent worlds: one is simple and lets everything interact, several allow separate scenes, preview and server instances at the cost of duplicated memory and no cross-world contact.", "Direct modification vs a command queue: direct is easy to write, a queue is safe during threaded steps and delays effects until the next step."],
    p: ["Game code removes a body from a callback while the step is running, and the solver reads freed memory.", "Settings like gravity are changed mid-step by another thread, and half the bodies use the old value."],
    v: "Create a world with one dynamic box above a static floor, step for two seconds, and confirm the box rests on the floor at the expected height, asleep, and reading its transform does not change after.",
    dep: ["body-storage","step-pipeline","dynamic-aabb-tree","constraint-graph"]
  },
  "body-types": {
    s: "The three kinds of body: static bodies never move, kinematic bodies move only as commanded and push others, dynamic bodies move under forces and collisions.",
    d: "A static body has infinite mass, zero velocity and no island membership, and static-static pairs are never tested. A kinematic body has infinite mass but a velocity set by game code, so it carries dynamic bodies along without being pushed back. A dynamic body has finite mass and responds to forces. In the solver, infinite mass is an inverse mass of zero, so one code path handles all three. Type changes at runtime (a held object becomes kinematic) must update the broadphase, islands and sleep state, which is where errors occur.",
    k: ["Kinematic movement by setting velocity vs by teleporting the transform: velocity gives correct friction and carries riders, teleporting is exact placement and pushes nothing correctly.", "Static as a separate body type vs an infinitely heavy dynamic one: a separate type skips islands and pairs entirely, a heavy dynamic body is simpler and wastes work."],
    p: ["Moving a kinematic body by writing its transform leaves velocity zero, and objects resting on it slide off.", "A static body moved by game code, with no broadphase update, collides at its old position."],
    v: "Place a box on a kinematic platform and move the platform at constant velocity: confirm the box moves with it without slipping, and a static platform moved by the same code is refused or updated in the broadphase.",
    dep: ["physics-world","body-storage","mass-properties"]
  },
  "body-storage": {
    s: "How body data is laid out in memory and how game code refers to it: arrays of state, generation-checked handles, and separation of hot solver data from cold data.",
    d: "Position, orientation, velocities and inverse mass used every step live in tightly packed arrays, ideally sorted by island or awake status, while names, user pointers and shape lists sit apart. Game code holds a handle, an index plus a generation count, so a stale handle to a removed body is detected instead of silently aliasing a new one. Bodies in sleeping islands may be moved to a separate pool so awake iteration stays contiguous. The difficulty is keeping handles stable while the arrays are compacted and re-sorted.",
    k: ["Structure of arrays vs array of structures: arrays of fields vectorize and cache well in the solver, structures are simpler to debug and index.", "Generation-checked handles vs raw pointers: handles catch use after removal and survive compaction, pointers are faster and fail unpredictably."],
    p: ["Compacting the body array invalidates indices that the pair cache or joints still hold, and constraints connect the wrong bodies.", "A handle generation counter that wraps lets an old handle match a new body after long sessions."],
    v: "Create and remove ten thousand bodies in random order, then use a saved old handle: confirm it is rejected, while every live handle still reads the correct body's data.",
    dep: ["simd-data-layout","stable-ordering"]
  },
  "body-lifecycle": {
    s: "Creating, activating, deactivating and removing bodies safely, including deferred removal at the end of the step and cleanup of pairs, joints and events.",
    d: "Creation allocates storage, computes mass properties from attached shapes, inserts proxies into the broadphase and registers in an island. Removal is deferred until after the step, then removes proxies, destroys pairs with end events, deletes attached joints and clears references in the constraint graph. Disabling a body keeps it but skips simulation, useful for pooling. Bodies created during a step are held until it ends. Cleanup order is critical: pairs must end before shapes disappear, or event consumers receive pointers to freed data.",
    k: ["Deferred removal at step end vs immediate removal: deferred is safe from any callback, immediate frees memory sooner and demands that no phase is running.", "Pooling disabled bodies vs creating and destroying: pooling avoids allocation and broadphase churn, but costs memory and needs the state fully reset."],
    p: ["A removed body's joints are left alive, and the partner body keeps being pulled toward a ghost anchor.", "Disabled bodies keep their proxies in the tree, and queries still hit them."],
    v: "Remove a body that is touching two others and has a joint: confirm end events fire once, the joint is gone, its neighbours wake, and no queries or contacts reference the removed body on the next step.",
    dep: ["physics-world","body-storage","pair-manager","contact-events","constraint-graph"]
  },
  "mass-properties": {
    s: "Mass, center of mass and inertia for a body, computed from its shapes and densities or set by hand, which decide how it accelerates and rotates.",
    d: "Each shape contributes volume times density as mass, a centroid, and an inertia tensor about that centroid. The body combines them: total mass is the sum, the center of mass is the weighted centroid, and inertia is shifted by the parallel axis theorem to the combined center. The body's origin is generally not its center of mass, so forces and contacts must account for the offset. The engine stores inverse mass and inverse inertia because the solver only divides. Overrides are common for tuning vehicles and ragdolls.",
    k: ["Computing mass from density and shapes vs authoring mass directly: density keeps relative masses physical when shapes change, direct values give designers control and drift out of sync with geometry.", "Center of mass at the origin vs an offset center: an origin center is simple to reason about, an offset center is physically correct for irregular shapes and costs an extra transform."],
    p: ["Adding a shape to a body without recomputing mass leaves the center of mass where it was, and the object tumbles oddly.", "Zero or negative mass from a degenerate shape makes inverse mass infinite, and the body flies off."],
    v: "Build a body from a box and a sphere at known offsets, then confirm the reported mass and center of mass match hand calculation, and a force applied at the center produces no angular acceleration.",
    dep: ["shape-mass-integrals","inertia-tensors","body-types"]
  },
  "inertia-tensors": {
    s: "The three-by-three matrix describing resistance to rotation about each axis, stored in body space and rotated into world space each step for the solver.",
    d: "For most shapes the tensor is diagonal in a principal frame, so only three values are stored with a rotation to align them to the body. Each step the engine builds the world-space inverse inertia as R times inverse diagonal times R transposed. Torque produces angular acceleration through that matrix, so non-spherical bodies do not rotate in the direction they are pushed. Because the tensor depends on orientation, angular velocity and momentum differ for asymmetric bodies, causing the gyroscopic effect. The hard part is numerical: very elongated bodies have small and large entries that destroy precision.",
    k: ["Full tensor vs principal axes plus a frame: the full matrix needs no frame logic and stores nine floats, principal axes use less memory and make locking axes trivial.", "Computed tensors vs inflated minimum values: computed is exact for the shape, inflating small values avoids spinning too easily and breaks realism."],
    p: ["A thin rod with near-zero inertia about its axis spins at huge speed from a small off-center hit.", "The world-space tensor is cached across steps and used with a rotated body, so torque points the wrong way."],
    v: "Apply the same torque to a long box about its long and short axes and confirm angular accelerations differ by the ratio of the matching inertia values.",
    dep: ["mass-properties","shape-mass-integrals","vector-math"]
  },
  "physics-materials": {
    s: "Named sets of surface properties, mostly friction and restitution, attached to shapes or triangles and combined at each contact to give the pair's behavior.",
    d: "A material holds static and dynamic friction coefficients, restitution, and sometimes density, sound or effect tags. Shapes reference a material; meshes and heightfields can map each triangle or cell to one. At contact time the two materials are fetched and merged with a combine rule. Materials are shared data, so changing one affects every user and must be thread safe in a running step. Authoring is a production problem: a game may have hundreds of surfaces, and consistent friction across them is a design effort.",
    k: ["Per-shape materials vs per-triangle materials: per-shape is cheap and simple, per-triangle lets one mesh have mud and ice at the cost of a lookup per contact.", "A full pair table vs per-material values with combine rules: a table gives exact control for each pair and grows quadratically, combine rules scale and cannot express exceptions."],
    p: ["Materials on a mesh are looked up by triangle index after cooking reorders triangles, and surfaces mismatch.", "Designers set friction on one shape only, and the combine rule makes the effect much smaller than expected."],
    v: "Place a box on an incline with material friction below and above the tangent of the slope angle and confirm it slides in the first case and holds in the second.",
    dep: ["material-combining","friction-model","restitution-model"]
  },
  "layers-and-masks": {
    s: "Bit-based categories that say which kinds of object collide with which: each shape belongs to a layer and carries a mask of layers it responds to.",
    d: "Every shape has a category bit set and a mask. A pair is considered only if each shape's category matches the other's mask. Typical layers are static world, dynamic props, player, enemies, projectiles, triggers and debris. The rule is evaluated in the broadphase or pair manager, before any geometry is touched, so it is nearly free and sheds large costs. Layers are defined once for a game, and the matrix of who hits whom is a design document. Group-based filters, such as never collide within a ragdoll, add a second, sparser mechanism.",
    k: ["Symmetric rule (both must agree) vs one-sided rule: symmetric is clear and predictable, one-sided lets an arrow hit a wall that does not hit the arrow and surprises designers.", "A fixed number of bits vs named layers with a matrix table: bits are fast and capped at 16 or 32, a table scales further and costs a lookup."],
    p: ["Filters are changed on a shape while overlapping, and existing contacts stay alive because nothing re-evaluates the pair.", "Layer numbers are hard-coded in scripts, and inserting a layer breaks every mask."],
    v: "Make two layers that do not collide, overlap shapes from each, and confirm no pair is created and no contact exists, then change the mask and confirm the pair appears on the next step.",
    dep: ["pair-filter-callbacks","body-types"]
  },
  "step-pipeline": {
    s: "The fixed order of phases in one simulation step: apply forces, update broadphase, find pairs, build contacts, form islands, solve, integrate, report events.",
    d: "A typical step integrates velocities with forces, updates proxies in the broadphase, finds new and removed pairs, runs the narrowphase to produce manifolds, builds the constraint graph and islands, prepares constraints, runs solver iterations, integrates positions, runs continuous collision for flagged bodies, updates sleep, and finally delivers events. Phases can be reordered, and the order has consequences: velocity integration before collision gives different behavior from after. Each phase is a parallel job with barriers between them, and a barrier is where a stall can hide.",
    k: ["Detect collisions at the start of the step vs at the end: start gives contacts that match the current positions and solves them in the same step, end hides a step of latency and simplifies output ordering.", "A rigid sequence of phases vs a task graph: a sequence is easy to reason about and debug, a graph overlaps independent work and is harder to make deterministic."],
    p: ["Game code writes transforms between phases and bodies teleport while their contacts still refer to the old poses.", "Events are generated before positions are final and describe contacts that are gone by the next frame."],
    v: "Step a scene with an instrumented profiler and confirm every phase ran once in the documented order, and swapping two phases in a test build changes the final state of a stacking scene.",
    dep: ["physics-world","integrator","narrowphase-dispatch","sequential-impulses","island-builder","sweep-and-prune"]
  },
  "fixed-timestep": {
    s: "Advancing the simulation in constant-sized increments regardless of how long a frame took, accumulating leftover time so behavior does not depend on frame rate.",
    d: "A variable step changes stiffness, restitution and stacking behavior, and makes results irreproducible. The loop adds the frame's elapsed time to an accumulator and runs as many fixed steps as fit, typically sixty or one hundred twenty a second, leaving the remainder. A clamp on the number of steps per frame prevents a spiral where slow frames require more steps which makes slower frames. The remainder feeds render interpolation. The choice of rate balances stability against cost, and very low rates make small shapes tunnel.",
    k: ["Fixed step with accumulator vs variable step: fixed gives repeatability and stable tuning, variable is simple and gives results that differ with frame rate.", "Sixty hertz vs higher rates: sixty is cheap and matches displays, higher rates improve stacking and fast motion at proportionally higher cost."],
    p: ["No cap on steps per frame lets one long pause trigger hundreds of steps, which takes longer than the pause and spirals.", "Game code reads delta time from the render frame and applies forces that scale with the wrong interval."],
    v: "Run the same scene at a steady frame rate of thirty and one hundred forty-four frames per second: confirm the physics state after ten simulated seconds is identical because the step count and size are the same.",
    dep: ["step-pipeline","integrator"]
  },
  "render-interpolation": {
    s: "Blending between the last two physics states using the accumulator's leftover fraction so rendered motion is smooth even when physics steps and display frames do not line up.",
    d: "The renderer cannot show the state at the end of the latest step if the display time falls between steps, so it draws a blend of the previous and current transform, weighted by the fraction of a step that has elapsed. Positions are lerped and orientations are slerped. This adds up to one step of visual latency. Extrapolation avoids latency and overshoots on sudden changes. Bodies that teleport need their history cleared, or they streak across the screen for a frame.",
    k: ["Interpolation vs extrapolation: interpolation is always smooth and one step behind, extrapolation is current and wrong when velocity changes.", "Interpolating only visible bodies vs all bodies: visible only saves memory and time, all bodies keeps hidden ones consistent for when they appear."],
    p: ["A teleported or respawned body keeps its old previous transform and slides across the level for one frame.", "Interpolated transforms are fed back into gameplay queries, so raycasts disagree with the simulation."],
    v: "Run physics at thirty hertz with rendering at a hundred and twenty and confirm a body moving at constant speed has constant displacement between rendered frames, with no pattern of steps.",
    dep: ["fixed-timestep","body-storage","vector-math"]
  },
  "substepping": {
    s: "Dividing one step into several smaller solver steps, each with its own integration and constraint solve, to gain stability and stiffness at a cost proportional to the number of substeps.",
    d: "Rather than many solver iterations at a large step, the engine runs several small steps per frame, each running collision once or a few times and one solver iteration. Constraint error shrinks with the square of the step, so substepping handles stiff joints, heavy stacks and fast motion better than iterations alone. Cost is near-linear in substeps, though narrowphase can be reused across them. Contact manifolds may be refreshed against moved bodies rather than recomputed, which is cheaper and slightly inexact.",
    k: ["More substeps vs more iterations: substeps give better accuracy per unit cost for stiff systems, iterations are cheaper and leave persistent softness.", "Collision once per step vs once per substep: once per step is cheap and can miss changes, once per substep is accurate and multiplies narrowphase cost."],
    p: ["Substep count is fixed, and a scene with hard joints needs more substeps in some frames and wastes them in others.", "Events are emitted once per substep, and game code receives several begin events for one touch."],
    v: "Simulate a heavy box hanging from a stiff joint with one iteration and one substep, then one iteration with four substeps, and confirm the joint stretch is much smaller in the second at similar total cost.",
    dep: ["step-pipeline","soft-step-solver","integrator"]
  },
  "integrator": {
    s: "Updates velocity from forces and position from velocity each step, usually with semi-implicit Euler, and handles rotation with quaternions and optional gyroscopic correction.",
    d: "Velocities are advanced first, using gravity, applied forces and damping, then the constraint solver modifies them, then positions are advanced with the corrected velocities. This semi-implicit order is stable for stacking and cheap. Orientation advances by rotating the quaternion by the angular velocity over the step, then normalizing. Rotation about a non-symmetric inertia tensor needs a gyroscopic term or the spin of a thin object gains energy. Damping scales velocity each step. High-order integrators are rare because constraints, not integration error, dominate error.",
    k: ["Semi-implicit Euler vs a higher-order method: semi-implicit conserves stability and is cheap, higher-order is more accurate in free flight and gains little when contacts dominate.", "Explicit gyroscopic torque vs implicit gyroscopic step: explicit is cheap and can blow up for fast spinning, implicit is stable and a few operations more."],
    p: ["Position is advanced before the solve, and bodies move into penetration with no chance of correction.", "Quaternions are not renormalized, and shapes slowly shear as rounding builds up over minutes."],
    v: "Launch a ball in vacuum at an angle and confirm its path is a parabola with error below a set tolerance, and a spinning thin rod conserves angular momentum magnitude over ten seconds within a few percent.",
    dep: ["vector-math","inertia-tensors","mass-properties"]
  },
  "constraint-graph": {
    s: "A graph whose nodes are bodies and whose edges are contacts and joints, rebuilt or updated each step, which is the structure the solver and island code walk.",
    d: "Every touching pair with a manifold and every joint adds an edge between two bodies; static bodies are shared leaf nodes that do not link islands. Edges are stored in arrays with per-body adjacency so the island builder can do a depth-first search and the solver can find all constraints on a body. Edge creation and removal happens as contacts begin and end, which is frequent. It is hard to keep this structure incremental, cache-friendly and deterministic when edges change every step.",
    k: ["Rebuilding the graph every step vs updating incrementally: rebuilding is simple and costs a pass over all contacts, incremental is cheaper for a large static scene and has trickier bookkeeping.", "Treating static bodies as nodes vs as markers on edges: markers keep islands separate, nodes are simpler and join unrelated islands by the floor."],
    p: ["Static bodies are counted as links, and the entire level becomes one island and can never sleep.", "Edge ordering depends on creation timing, and the solver gives different results from run to run."],
    v: "Build two separate stacks on a shared floor and confirm the graph yields two components, with no edge between them, and each stack's contacts appear in exactly one component.",
    dep: ["contact-manifold","joint-framework","body-types"]
  },
  "island-builder": {
    s: "Finds the connected components of the constraint graph, groups bodies and constraints per island, and hands each island to the solver and sleep logic as an independent unit.",
    d: "A graph search starts from each awake dynamic body not yet visited and collects every body reachable through contacts and joints, never crossing a static body. The result is a list of islands with their bodies and constraints stored contiguously. Islands are independent, so they can be solved in parallel and slept separately. Large islands are the performance problem: a pile of a thousand boxes is one island, solved serially unless the solver also parallelizes inside. Island order should be deterministic.",
    k: ["Search from bodies each step vs union-find maintained incrementally: search is simple and cheap for typical scenes, union-find is cheaper per update and cannot split islands when contacts end.", "Solving each island separately vs one global solve: separate is parallel and cache friendly, global is simpler and wakes cost for resting bodies."],
    p: ["A single kinematic body treated as dynamic links unrelated stacks into one giant island that cannot sleep.", "Islands are built from unsorted bodies, and solver order changes with memory layout."],
    v: "Spawn three isolated piles and confirm the builder reports three islands whose body counts match the piles, and that dropping a box between two piles merges them into one next step.",
    dep: ["constraint-graph","body-storage","stable-ordering"]
  },
  "sleep-management": {
    s: "Marks bodies and whole islands as asleep when their motion stays below a threshold long enough, and removes them from solving until something touches or moves them.",
    d: "Each body tracks a motion measure combining linear and angular velocity over recent steps, and a timer of how long it stayed below threshold. An island sleeps only when every body in it has been calm for the full time, since one active body wakes the rest through constraints. Sleeping bodies are skipped by integration and the solver, and keep their contacts frozen. Thresholds are a trade-off: too high and objects freeze in mid-air at the top of a toss, too low and stacks never settle and cost full price forever.",
    k: ["Sleeping per island vs per body: per island is safe because contacts remain consistent, per body is more fine-grained and can freeze a body whose support is moving.", "Velocity thresholds vs energy thresholds: velocity is simple and mass-blind, energy accounts for mass and is harder to tune."],
    p: ["A ball at the peak of a throw has near-zero velocity for a moment and falls asleep in mid-air.", "Sleep thresholds tuned at one gravity scale are far too loose for a game in low gravity, and slow bodies freeze."],
    v: "Drop a box on the floor and confirm it sleeps after the configured time, then check the count of awake bodies and solver time drop to near zero for a scene with a thousand settled boxes.",
    dep: ["island-builder","body-storage","wake-propagation"]
  },
  "wake-propagation": {
    s: "Waking a sleeping island when a moving body touches it, a joint partner moves, a body is removed from under it, or game code applies a force.",
    d: "Wake triggers include a new contact between an awake body and a sleeping one, a force or impulse applied by game code, a change to velocity or transform, removal of a touching body, and a joint being modified. Waking an island resets timers of all its bodies and puts them back in the awake lists. Sleeping contacts must be restored with their cached impulses to avoid a transient. The risk is chain reactions: one body flickering at a boundary can repeatedly wake a large pile, costing full solver time for a small disturbance.",
    k: ["Waking on any touch vs only on impact above a threshold: any touch is correct and wakes piles for tiny disturbances, a threshold saves work and can leave a pile floating after support is removed.", "Waking the whole island vs only affected bodies: whole island is consistent and simple, partial waking is cheaper and breaks the constraint graph's assumptions."],
    p: ["Removing the floor under a sleeping stack does not wake it, and it hangs in the air.", "A body jittering at the sleep threshold wakes its neighbours every few steps, and the island never actually sleeps."],
    v: "Let a stack sleep, then remove its floor and confirm it wakes within one step and falls; then throw a light ball at it and confirm only that island wakes.",
    dep: ["sleep-management","contact-persistence","body-lifecycle"]
  },
  "graph-coloring": {
    s: "Assigning constraints to colors so that no two constraints in a color share a body, letting each color be solved in parallel without conflicting writes.",
    d: "Constraints touching the same body cannot be solved at once because both write that body's velocity. Coloring greedily assigns each constraint the lowest color not used by its bodies; the solver then processes color by color, with all constraints of a color run in parallel. Static bodies do not count, since they are not written. Many colors mean many sequential phases, and a body with many contacts forces at least that many colors. Order inside a color is arbitrary, changing the Gauss-Seidel order and thus the result compared with a serial solver.",
    k: ["Coloring for parallelism vs a serial solve: coloring scales across cores and gives a different convergence order, serial keeps the classic order and uses one core per island.", "Greedy coloring vs optimal coloring: greedy is fast and uses a few more colors, optimal is slow and barely helps."],
    p: ["Coloring is recomputed from scratch with unordered inputs and the colors, hence the solve order, vary between runs.", "A body touching hundreds of constraints creates hundreds of colors, and the final colors have one constraint each and no parallelism."],
    v: "Color a scene of piles and verify programmatically that no two constraints in any color share a dynamic body, then compare solve time on one and eight threads.",
    dep: ["constraint-graph","parallel-solving","task-scheduler"]
  }
});
