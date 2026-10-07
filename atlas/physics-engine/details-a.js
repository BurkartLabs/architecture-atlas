// Details for the physics engine plate, part 1: tools and queries.
ATLAS.details("physics-engine", {
  "debug-draw": {
    s: "Renders collision shapes, bounds, contact points, normals and joint frames as lines and solid overlays on top of the game view, so simulation state can be seen instead of inferred.",
    d: "The engine walks bodies, shapes, contacts and joints and emits colored line, triangle and point primitives into a buffer that the renderer draws without lighting. Color encodes state: sleeping, awake, static, trigger. Draw calls are filtered by layer, region or body so a crowded scene stays readable. It reads the same data the solver uses, taken at the end of the step, and must not mutate anything. Difficulty comes from volume: a mesh with fifty thousand triangles drawn every frame costs more than the simulation it describes.",
    k: ["Immediate-mode drawing from live data vs a retained copy of shapes: immediate shows exactly what the solver has but runs inside the step budget, while retained is cheaper but can show stale geometry.", "Drawing the solver's view of a shape vs the artist's render mesh: the solver's view exposes margins and hulls that explain behavior, but looks wrong to people who expect the visible model."],
    p: ["Debug geometry drawn from the pre-step transform lags one step behind the render, and people chase a discrepancy that is not in the simulation.", "Drawing every mesh triangle each frame drops the frame rate so far that the bug being watched stops reproducing."],
    v: "Enable shape draw on a scene with a rotated box, a capsule and a mesh, and confirm each outline coincides with its rendered model while the box rests on the mesh without visible gap or overlap.",
    dep: ["physics-world","shape-bounds","support-mapping"]
  },
  "contact-visualizer": {
    s: "Shows each contact point, its normal, penetration depth and applied impulse, and each joint's anchors and limits, so a wobbling stack or a drifting joint can be diagnosed.",
    d: "After the solve, the visualizer reads the contact manifolds and the accumulated impulses, then draws a point per contact, an arrow along the normal scaled by impulse, and a color by depth. For joints it draws both anchor frames, the axis and the limit range, and highlights the error between anchors. It can also show the island each body belongs to and whether a constraint hit its force limit. The hard part is making numbers legible: impulses span several orders of magnitude, so scaling must be adjustable and clamped.",
    k: ["Showing impulses vs showing forces: impulses are what the solver computes, but forces (impulse divided by step) are what designers reason about, and the two differ by the step size.", "Live overlay vs recording to a timeline: an overlay is immediate, while a recorded timeline lets you scrub back to the frame where a single contact flipped."],
    p: ["Contacts are drawn after the manifold is reduced, so the points shown are not the ones that were solved against, hiding an over-reduction bug.", "Impulse arrows scaled by a fixed factor vanish on light bodies and fill the screen on heavy ones."],
    v: "Stack three boxes and confirm the visualizer shows four contacts per interface, normals pointing up, and impulses that grow toward the bottom box in proportion to the weight above it.",
    dep: ["debug-draw","contact-manifold","contact-constraints","joint-framework"]
  },
  "physics-profiler": {
    s: "Counters and timers for each stage of the step: pair counts, manifold counts, solver iterations, island sizes and time per phase, exposed so a slow scene can be explained.",
    d: "Each pipeline stage records its elapsed time and a few counters: proxies moved, pairs created, narrowphase calls, active contacts, constraint rows, bodies awake and the largest island. Timers must work from worker threads without locks, usually by writing to per-thread buffers merged after the step. Results feed an on-screen graph, a log or a capture. What makes it hard is attribution: the same time spent in the solver might come from one huge island, too many iterations or a mesh producing many contacts, and only the combination of counters tells which.",
    k: ["Always-on counters vs compiled-out profiling: always-on finds problems in shipped builds, but each counter costs cache traffic in hot loops.", "Per-stage timing vs per-island timing: per-stage is simple, but one slow island hides inside a total that looks acceptable."],
    p: ["Timers placed around task submission instead of task execution measure queuing, not work, and report a fast solver that is actually starved.", "Counters read mid-step show a mix of two steps and suggest a spike that never happened."],
    v: "Spawn a thousand boxes in a pile and confirm the profiler reports the awake body count, the pair count and a per-phase time whose parts sum to within a few percent of the whole step time.",
    dep: ["step-pipeline","island-builder","task-scheduler"]
  },
  "world-serialization": {
    s: "Writes the full dynamic state of the world, bodies, shapes, joints and cached contacts, to bytes and rebuilds an equivalent world from them.",
    d: "A save lists every body with its type, transform, velocities, sleep state and shape references, every joint with its anchors and limits, and optionally the warm-start impulses of live contacts. Shapes are stored once and referenced by index. On load, objects are created in the original order so handles and ordering match, then the broadphase and islands are rebuilt. Exact resume needs more than positions: cached impulses, the sleep timers and the contact order all change the next step. Versioning is the difficulty, because a field added later must still read old files.",
    k: ["Saving cached contacts and impulses vs rebuilding them on load: saving gives bit-exact continuation, while rebuilding yields a small velocity transient on the first step.", "Binary dump of internal arrays vs a field-by-field format: a dump is fast and exact but ties files to one engine version and platform layout.", "Referencing shared shapes by ID vs embedding them: IDs keep files small but need the shape library to be present at load."],
    p: ["Restoring bodies without the sleep timers wakes an entire settled scene and shifts everything for several steps.", "Loading in hash-table order changes body order, and any later order-dependent solve diverges from the original run."],
    v: "Run a scene for ten seconds, save, load into a fresh world, and step both for ten more seconds: positions match exactly if determinism is promised, and within a stated tolerance otherwise.",
    dep: ["physics-world","body-storage","stable-ordering","warm-starting"]
  },
  "snapshot-rollback": {
    s: "Takes cheap copies of the world each step and restores an earlier one, so a networked or replayed game can correct the past and re-simulate forward.",
    d: "Only the dynamic state needed to resume is copied: transforms, velocities, sleep flags, joint state and warm-start impulses, often into a ring buffer one entry per tick. Static geometry and shapes are not copied. On rollback the world is restored to a past tick, inputs are replayed, and the engine steps forward quickly to the present. The cost grows with body count times the rollback depth. It depends on a deterministic step, since replay that diverges from the original produces visible teleports after a correction.",
    k: ["Full copy per tick vs delta from the previous tick: full copies are simple and fast to restore, deltas use less memory but make restoring a distant tick slow.", "Rolling back the whole world vs only bodies near the correction: whole-world is always consistent, partial is cheaper but breaks where the corrected bodies touch uncorrected ones."],
    p: ["Restoring positions but not cached contacts means the first re-simulated step solves with no warm start and differs from the original.", "Event callbacks fire again during re-simulation and play a hit sound twice."],
    v: "Record sixty ticks, restore tick ten, step forward fifty times with the same inputs, and compare the final state byte for byte with the original run.",
    dep: ["world-serialization","determinism-layer","fixed-timestep","contact-events"]
  },
  "collision-asset-cooking": {
    s: "The offline step that converts authored meshes and shapes into runtime collision data: hulls, midphase trees, heightfield samples and precomputed mass properties.",
    d: "Cooking takes source triangles and produces what the runtime wants to load without further processing: a convex hull with face and edge adjacency, a triangle mesh with a bounding volume tree and per-edge flags for internal edges, a heightfield with cell material and hole data, and inertia from volume integrals. It also welds vertices, removes degenerate triangles and validates winding. Runtime assumptions are baked in here, so a hull with a wrong face order or a mesh with a hole in it surfaces as a bug in contact behavior far from the cooker.",
    k: ["Cooking at build time vs at load time: build time gives fast loading and exact validation errors, while load time lets tools and mods feed raw meshes at some start-up cost.", "Exact hulls vs simplified hulls: exact keeps the visible shape but has many faces and slow queries, simplified is fast and slightly inflated."],
    p: ["A cooked mesh format changes between engine versions and old assets load with silently wrong edge flags.", "Non-manifold or inside-out meshes pass cooking and then produce contacts with the wrong normal direction."],
    v: "Cook a cube mesh and a torus mesh, load them, and confirm the cube hull has six faces, the mesh volume is within a percent of the analytic value, and a ball rolled across an internal edge does not bounce.",
    dep: ["convex-hull-shape","triangle-mesh-shape","heightfield-shape","shape-mass-integrals","internal-edge-handling"]
  },
  "raycast-queries": {
    s: "Finds what a line segment hits first, or all it hits, returning the shape, point, normal and distance, for aiming, picking, line of sight and ground checks.",
    d: "The ray is clipped through the broadphase tree to find candidate shapes, tested against each shape with a per-type routine (slab test for boxes, quadratic for spheres, tree traversal for meshes), and results are ordered by distance. A closest-hit query shrinks the ray as hits are found so far-away shapes get culled. Options include backface culling, hitting only specific layers, and returning the material or triangle index. Difficulty: rays that start inside a shape, rays that graze edges, and thin triangles that rays slip between because of rounding.",
    k: ["Closest-hit vs all-hits: closest-hit is cheap through early termination, while all-hits is needed for penetration or transparency but cost grows with the scene.", "Ignoring shapes the ray starts inside vs reporting them at distance zero: ignoring avoids stuck characters, reporting is more honest and needed for inside tests."],
    p: ["A ray exactly on a shared mesh edge reports no hit because both triangles reject it by rounding.", "Queries run during the step see half-updated transforms and return hits against positions that never existed."],
    v: "Cast a thousand random rays at a scene with known geometry and confirm every hit lies on a shape surface within tolerance and the first hit equals the brute-force minimum distance.",
    dep: ["dynamic-aabb-tree","shape-bounds","mesh-midphase","query-filtering"]
  },
  "shape-sweeps": {
    s: "Moves a shape along a straight path and reports the first thing it touches, used for character movement, projectile checks and placing objects.",
    d: "A sweep is a swept-volume test: the broadphase is queried with the box that encloses the whole path, then each candidate gets a time-of-impact or shape-cast test between the moving shape and the target, returning a fraction along the path and a contact normal. Convex shapes use a GJK-based cast; against meshes the cast visits only nearby triangles. It is a harder problem than a ray because the contact can be an edge or a vertex and the normal must be the one the mover should slide along.",
    k: ["Sweeping the true shape vs a slightly smaller shape plus a skin: the true shape is accurate but touches surfaces exactly, while a skin keeps the mover from getting stuck at zero distance.", "Returning only the first hit vs the full list: first-hit is what movement needs, but sliding in a corner needs the second contact too."],
    p: ["A sweep that starts already overlapping returns fraction zero with an arbitrary normal, and a character stuck in a wall is pushed in a random direction.", "Rotational sweeps are approximated as linear and miss objects hit by a swinging end."],
    v: "Sweep a sphere toward a wall at an angle and confirm it stops at the fraction where its surface touches the wall, with a normal equal to the wall normal.",
    dep: ["time-of-impact","dynamic-aabb-tree","gjk-distance","query-filtering"]
  },
  "overlap-tests": {
    s: "Returns every shape that intersects a given volume at a given pose, for area damage, proximity checks, spawn clearance and sensors.",
    d: "The query volume's bounds go through the broadphase to find candidates, and each is tested for actual intersection using the same narrowphase distance or penetration routines as simulation. The result is a list of shapes, not contact points, so tests stop at the first positive answer. Variants test a point, a box, a sphere, a capsule or an arbitrary convex shape. The cost depends on the candidate count rather than the volume size alone, so a big query in a dense area can cost more than a step.",
    k: ["Boolean answer vs full penetration data: boolean is far cheaper and enough for most checks, while depth and direction are needed to push something out.", "Querying the broadphase only vs the exact shapes: bounds-only is fast and over-reports, exact is correct and costs a narrowphase call per candidate."],
    p: ["Gameplay uses a bounds-only overlap as if it were exact and damages things that are visibly nowhere near.", "A large overlap result list is allocated every frame and becomes a steady source of garbage and stalls."],
    v: "Place a sphere query next to a box so that bounds overlap but shapes do not, and confirm the exact query reports no hit while the bounds-only query reports one.",
    dep: ["dynamic-aabb-tree","narrowphase-dispatch","query-filtering","shape-bounds"]
  },
  "query-filtering": {
    s: "Decides which shapes a raycast, sweep or overlap can see, using layers, masks, body types and per-query callbacks, separately from simulation filtering.",
    d: "Each query carries a filter: a layer mask, flags for static or dynamic shapes, a list of excluded bodies, and optionally a callback invoked per candidate that can accept, ignore or stop. Filtering runs before expensive narrow tests so excluded shapes cost nothing. Queries and simulation often use different rules, since a trigger or a camera blocker is hit by queries but never collides. The challenge is consistency: layer assignments are decided by designers once and used by dozens of systems, and a mismatch makes a query miss what a bullet should hit.",
    k: ["A shared layer table for queries and simulation vs separate tables: shared is simple to author, separate allows triggers and blockers that exist only for queries.", "Callback filters vs data masks: callbacks can express any rule but are slow and block parallel queries, masks are fast and limited to what bits can say."],
    p: ["A callback that touches game objects is called from a worker thread and races with game code.", "Adding a new layer shifts bit positions in saved filter masks and silently changes which things are hit."],
    v: "Put a shape on a layer that the query mask excludes and confirm a ray through it passes through, while the same ray finds it when the mask includes that layer and the simulation still collides with it.",
    dep: ["layers-and-masks","physics-world","body-types"]
  },
  "trigger-volumes": {
    s: "Shapes that detect other bodies entering, staying in and leaving them without producing any collision response, for zones, pickups and sensors.",
    d: "A trigger is a shape flagged so the narrowphase still tests it but no constraint is created. The engine keeps the set of overlapping pairs from the previous step and compares it with the current one to emit enter, stay and exit events. Triggers can be static, attached to moving bodies, or kinematic. They participate in the broadphase like any shape. Complications include enter and exit events when either body is destroyed or put to sleep, and a trigger that needs to see sleeping bodies that never produce contact updates.",
    k: ["Triggers as ordinary shapes with a flag vs a separate sensor system: a flag reuses all shape and broadphase code, while a separate system can be cheaper and more flexible at the cost of a second path.", "Events at step time vs at query time: step time gives consistent callbacks, query time is current but can disagree with the event stream."],
    p: ["A body destroyed inside a trigger never reports exit, and zone counts stay wrong for the rest of the session.", "A fast body crosses a thin trigger between steps and no enter event ever fires."],
    v: "Move a ball through a trigger box and confirm exactly one enter, a stay event on each step inside and one exit, with no change in the ball's velocity.",
    dep: ["narrowphase-dispatch","pair-manager","contact-events","body-types"]
  },
  "contact-events": {
    s: "Reports begin, persist and end of contact between shapes, with the contact points and impulses, so game code can play sounds, apply damage or spawn effects.",
    d: "At the end of the step the engine compares each pair's contact state with the previous step to find new and ended touches, collects the manifold and the total impulse the solver applied, and queues events for game code. Events are delivered after the step finishes, never during it, because game code may add or remove bodies. Filters limit events to flagged pairs, since most contacts are uninteresting. Impulse thresholds suppress noise from resting contact, which would otherwise fire an event every step for every box on a floor.",
    k: ["Callbacks during the step vs queued events after it: callbacks give exact timing but let game code modify a world that is being solved, queued events are safe and one step late.", "Reporting every contact vs only above an impulse threshold: all contacts floods the game with resting events, a threshold hides soft touches that matter to some logic."],
    p: ["A body removed in a callback during the step leaves dangling constraint pointers and crashes in the solver.", "Begin and end events fire repeatedly for a pair flickering at a contact threshold, and sound effects stutter."],
    v: "Drop a crate on a floor and confirm one begin event with an impulse near mass times impact speed, no events while it rests, and one end event when it is lifted.",
    dep: ["contact-manifold","contact-persistence","pair-manager","sequential-impulses"]
  },
  "contact-modification": {
    s: "A hook that lets game code change or discard contacts after detection and before solving, for one-way platforms, conveyor surfaces and custom friction.",
    d: "After the narrowphase builds manifolds and before constraints are created, a callback receives each flagged pair's contact points and may remove points, change normals, friction, restitution or add a target tangent velocity. One-way platforms discard contacts whose normal opposes the approach direction. Conveyors add surface velocity. The callback runs inside the step, often on worker threads, so it must be fast and must not touch the world. It is hard because changes are applied to temporary data and must also affect persistence matching, or the next step's warm start is wrong.",
    k: ["Modifying contacts through a callback vs configuring the material: a callback handles any case but costs a call per pair, materials are free but fixed per shape.", "Mutating the manifold in place vs returning a modified copy: in place is cheap but can corrupt persistence, a copy is safe and allocates."],
    p: ["A callback that removes a contact for one step makes the pair look like it ended, and the warm-start impulse is lost when contact returns.", "A callback reading game state on a worker thread produces results that vary run to run."],
    v: "Build a one-way platform and confirm a body moving up passes through, a body moving down lands on it, and a body resting on it stays still without jitter.",
    dep: ["contact-manifold","contact-persistence","friction-model","task-scheduler"]
  }
});
