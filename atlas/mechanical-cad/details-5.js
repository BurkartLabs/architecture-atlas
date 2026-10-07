// Details for the mechanical CAD plate, part 5: boundary representation, kernel operations, display, foundations.
ATLAS.details("mechanical-cad", {
  "topology-graph": {
    s: "The connectivity structure of a solid: vertices, edges, faces, shells and bodies, recording which entities bound which, separately from the shapes of surfaces and curves.",
    d: "A body contains shells; a shell contains faces; a face is bounded by loops of edges; an edge is bounded by vertices. Topology says only what touches what and in which orientation, while geometry says where and what shape. Together they define a closed, orientable solid whose inside and outside are well defined. Queries such as adjacency and traversal are built on it. The difficulty is keeping topology and geometry consistent: every edge must lie on both its faces within tolerance, and every operation must update both together.",
    k: ["Separating topology from geometry versus embedding geometry in entities: separation allows the same surface to be shared and edited independently; embedding is simpler but duplicates data.", "Strict manifold solids only versus allowing non-manifold bodies: manifold is simpler and valid for solids; non-manifold supports sheets and mixed models but complicates every algorithm."],
    p: ["An edge that lies on a face's surface only approximately causes later operations to treat the two as unconnected.", "A shell with inconsistent orientation gives negative volume or inside-out results."],
    v: "Build a box and count: eight vertices, twelve edges, six faces, one shell, with Euler's formula V minus E plus F equal to two, each edge shared by exactly two faces, and consistent outward orientation.",
    dep: ["coedge-structure","surface-geometry","curve-geometry"]
  },
  "coedge-structure": {
    s: "A refinement of edges into oriented uses, one per face, which links each face's boundary loop together and makes traversing around a face or across an edge efficient.",
    d: "An edge shared by two faces gets two coedges, each belonging to one face's loop and pointing in that loop's direction. Each coedge stores its next and previous coedge in the loop and its partner on the adjacent face. Loop walking, finding neighbors and flipping orientation become pointer operations. The structure also holds per-use data, such as the 2D curve on a face's surface. The challenge is bookkeeping: every topological edit must keep all links consistent, and one broken link corrupts the model in ways that show up much later.",
    k: ["Coedge-based structure versus plain edge-face lists: coedge makes traversal quick and orientation explicit but adds objects and links to maintain; lists are simple but need searches.", "Storing partners explicitly versus finding them by search: explicit is fast to read but must be updated in every change; search is simple but slow on large faces."],
    p: ["A missing partner link makes an edge look like a boundary, and a later Boolean treats a closed solid as an open sheet.", "Orientation flags that disagree between neighbors cause faces to render inside-out."],
    v: "Walk every loop in a body by following next links and confirm each returns to its start, each coedge's partner points back to it, and the partner's direction is opposite. Run this on a model after fifty edits.",
    dep: ["topology-graph","trim-curves"]
  },
  "surface-geometry": {
    s: "The mathematical surfaces under faces: planes, cylinders, cones, spheres, tori and free-form surfaces such as NURBS, with evaluation of position, normal and curvature.",
    d: "Analytic surfaces are stored by a few parameters and evaluated by formula, which is exact and fast. Free-form surfaces use rational splines defined by control points, weights and knot vectors, with parameters in two directions. Each surface supports evaluation, derivatives, closest-point projection, and bounds. Operations such as intersection and offset are designed around these capabilities. The challenge is cost and edge cases: free-form operations are iterative and sensitive to tolerance, and rational surfaces may have singular points, such as the apex of a cone or a sphere's poles.",
    k: ["Keeping analytic surfaces as such versus converting everything to splines: analytic keeps exact algebra and speeds Booleans; splines are uniform but turn simple cases into approximations.", "Rational versus polynomial splines: rational represents circles and cones exactly; polynomial is simpler and cheaper but approximates them."],
    p: ["A cylinder converted to a spline during export loses its analytic nature, and downstream holes cannot be recognized.", "Near a singularity the surface normal is undefined and algorithms divide by zero."],
    v: "Evaluate a cylinder, a sphere and a spline surface at a grid of parameter pairs and confirm points lie within 1e-9 of the analytic values, normals are unit length and perpendicular to tangents, and closest-point returns the same parameters.",
    dep: ["numerics","curve-geometry"]
  },
  "curve-geometry": {
    s: "The mathematical curves under edges: lines, circles, ellipses, conics, splines and intersection curves, in 3D and in a surface's parameter space.",
    d: "Like surfaces, curves are analytic or free-form, with evaluation, tangent, curvature, length and closest-point services. Edges use 3D curves, and their parameter-space images on adjacent faces are stored as trim curves. Some curves, such as the intersection of two surfaces, have no closed form and are stored as approximating splines with a recorded tolerance. The challenge is consistency: the 3D curve and its two surface-space curves describe one edge and must agree within tolerance, and approximation error can accumulate through repeated operations.",
    k: ["Storing intersection curves as splines versus recomputing on demand: stored is fast but carries approximation error; recomputed is accurate but expensive.", "Parametrizing by arc length versus natural parameter: arc length is convenient for sampling and offsets but costly to maintain; natural is cheap but nonuniform."],
    p: ["An edge's 3D curve and its trim curves drift apart over repeated edits until a face boundary no longer matches its neighbor.", "Closed curves with a seam parameter produce errors when an operation spans the seam."],
    v: "Sample a spline curve at a thousand parameters and confirm tangents are continuous, length computed by integration matches a high-precision reference, and the closest point to an offset position returns the original parameter.",
    dep: ["numerics"]
  },
  "trim-curves": {
    s: "Curves expressed in a surface's own two-dimensional parameter space that mark where a face begins and ends, so a face is a bounded patch of a larger surface.",
    d: "A face is defined by an underlying surface plus one or more loops of trim curves in its parameter domain; the region inside the outer loop and outside inner loops is the face. This lets a simple unbounded surface, such as a plane, be cut into complicated faces. Edges refer to trim curves on both neighboring faces, so a point on the edge is consistent from both. The challenge is that the parameter space can be badly behaved: it wraps on periodic surfaces and compresses near singularities, making trimming and point-in-face tests delicate.",
    k: ["Trimming in parameter space versus in 3D: parameter space makes inside tests simple and exact; 3D trimming is easier to visualize but harder to classify points.", "One face on a periodic surface versus split at the seam: one face is topologically natural but must handle wraparound; splitting avoids it and adds artificial edges."],
    p: ["A trim loop that crosses a seam is read as two loops, so the face seems to have a hole or no area.", "Trim curves that do not close within tolerance give a face with an undefined interior."],
    v: "Cut a cylinder's face with a loop spanning the seam and confirm the face area matches the analytic area, point classification inside and outside agrees along the seam, and tessellation covers the face exactly once.",
    dep: ["surface-geometry","curve-geometry","coedge-structure"]
  },
  "tolerant-modeling": {
    s: "Allowing each edge and vertex to carry its own gap tolerance, so that faces from imperfect sources can be sewn into a closed solid even when they do not meet exactly.",
    d: "Real-world data meets with small gaps. Instead of forcing exact contact, tolerant modeling stores on each edge and vertex the largest distance by which adjacent geometry may differ. Algorithms treat features smaller than the tolerance as coincident. This lets imported and complex bodies remain valid solids. The cost is that algorithms need to handle varying tolerance, and tolerance can grow with every operation, since each new intersection adds error. The challenge is keeping local tolerances from growing until they exceed feature size.",
    k: ["Tolerant edges versus exact topology only: tolerant accepts real data and keeps solids closed; exact keeps algorithms simple and fast but rejects imperfect geometry.", "Global tolerance versus per-entity: global is simple to reason about; per-entity adapts to real gaps but complicates every comparison."],
    p: ["A tolerance that has grown through repeated Booleans exceeds a small feature's size and the feature vanishes.", "Exporting tolerant geometry to a system that requires exact contact produces open shells."],
    v: "Sew two faces separated by a 0.01 mm gap into a solid, then apply twenty Boolean operations and confirm the largest edge tolerance reported remains below a stated bound and the body stays valid.",
    dep: ["topology-graph","numerics","validity-checking"]
  },
  "euler-operators": {
    s: "A small set of primitive operations that add and remove vertices, edges and faces while keeping the topology valid, used as the safe building blocks for larger modeling operations.",
    d: "Each operator, such as make-edge-vertex or kill-face, changes the counts of entities by a fixed pattern that preserves Euler's formula, so a valid solid stays valid. Higher-level operations compose them: a Boolean or a fillet decomposes into splitting edges, adding faces and merging. The set is complete, in the sense that any valid body can be built from them. It gives a transaction-like safety net. The challenge is performance and expressiveness: expressing complex edits as many tiny steps is slow and hard to read, so kernels often use larger operations internally.",
    k: ["Building everything from Euler operators versus direct manipulation: operators keep topology valid by construction but add overhead; direct manipulation is faster but easy to corrupt.", "Fine-grained operators versus compound ones: fine-grained are provably valid; compound are efficient but need individual verification."],
    p: ["Bypassing the operators in one algorithm leaves a dangling edge that surfaces as a crash in a later unrelated operation.", "An operator sequence aborted in the middle leaves a body in an invalid intermediate state."],
    v: "Build a cube by applying only Euler operators and check Euler's formula holds after every step. Then apply a random sequence of valid operators and confirm the validity checker passes after each.",
    dep: ["topology-graph","coedge-structure","validity-checking"]
  },
  "validity-checking": {
    s: "Tests that a body is a legitimate solid: closed shells, consistent orientation, faces and edges that agree, no self-intersection, and tolerances within limits.",
    d: "Checks run at several levels. Topological checks verify connectivity, Euler's formula and orientation. Geometric checks verify that edges lie on their faces within tolerance, that faces do not self-intersect, and that surfaces are well-behaved. Bodies may also be tested for inside-out orientation by volume sign. Checking is run after imports and optionally after each operation. The difficulty is cost and scope: a full self-intersection test is expensive, so kernels run partial checks by default and offer a deep check on demand.",
    k: ["Checking after every operation versus only at boundaries: every operation catches errors at the source but slows rebuilds; boundaries are cheap but the origin of a defect is harder to find.", "Strict versus permissive acceptance: strict avoids downstream failures but rejects usable imported data; permissive keeps work flowing and spreads defects."],
    p: ["A body with a tiny self-intersection passes the quick check and fails a later Boolean in a way that seems unrelated.", "A deep check on a large assembly takes so long that users disable it."],
    v: "Run the checker on a library of known-good and deliberately corrupted bodies (an open shell, a flipped face, a self-intersection). It must pass every good body and flag every corrupted one with the specific defect.",
    dep: ["topology-graph","surface-geometry","tolerant-modeling"]
  },
  "boolean-ops": {
    s: "Combines solids by union, subtraction and intersection, producing a new valid solid from the faces of both inputs.",
    d: "The algorithm intersects the boundaries of two bodies, splits faces along the intersection curves, classifies each piece as inside, outside or on the other body, keeps the pieces required by the operation, and stitches them into a new shell. It relies on surface intersection and point classification. Special cases, such as coincident faces, tangent contact, and near-misses, need dedicated handling. Booleans underlie extrusion cuts, holes, sections and many other features. They are the main source of kernel failures.",
    k: ["Exact intersection versus tolerance-aware approximations: exact is clean but fragile with near-coincident geometry; tolerance-aware handles real data but can merge details that should stay apart.", "General multi-body Boolean versus pairwise sequences: general is faster for many bodies and gives consistent results; pairwise is simpler but accumulates error."],
    p: ["Two coincident faces from different bodies produce slivers or an inverted result.", "A tangent contact intersection that is computed as two points instead of a curve leaves an open shell."],
    v: "Subtract a cylinder from a block, and confirm the result's volume equals the analytic difference within tolerance, the validity check passes, and repeating with the cylinder tangent to a face gives a valid solid or a clear failure, never a corrupt body.",
    dep: ["surface-intersection","point-classification","healing-sewing","topology-graph"]
  },
  "offsetting": {
    s: "Creates a new surface or solid at a fixed distance from existing faces, used for shelling, thickening, clearances and tool compensation.",
    d: "Each face is offset along its normal by the distance; the offset surfaces are then extended or trimmed against each other where neighbors meet, and tangent faces are connected. Analytic surfaces offset to analytic ones, such as a cylinder to a larger or smaller cylinder, while free-form surfaces are approximated. Concave regions with curvature radius smaller than the offset develop self-intersections that must be trimmed away. The difficulty is these degenerate cases, which are common and need local surgery.",
    k: ["Exact analytic offset where possible versus approximating everything: analytic stays exact and fast; approximating is uniform but loses precision.", "Offsetting individual faces then repairing versus a global approach: per-face is simple and works for most shapes; global handles self-intersections better but is complex."],
    p: ["An inward offset larger than a local radius creates folds that survive trimming as bad geometry.", "Approximated free-form offsets drift beyond tolerance after several repeated offsets."],
    v: "Offset a body by 1 mm and measure the distance from a thousand sample points on the new surface to the original. All should be 1 mm within tolerance, and the result must pass validity checking.",
    dep: ["surface-geometry","surface-intersection","healing-sewing"]
  },
  "blending": {
    s: "Builds smooth transition surfaces between faces, such as constant-radius rolling-ball fillets, variable radius blends and corner patches with specified continuity.",
    d: "A blend is computed as the envelope of a ball rolling along two faces, or as a surface interpolating the boundaries with prescribed tangent and curvature conditions. The kernel builds the blend surface, trims it against the faces, and handles ends and vertices where several blends meet, using setback or corner patches. Continuity can be tangent or curvature. The difficulty is the vertex region, where three or more blends meet and no unique answer exists, plus propagation along edge chains with changing geometry.",
    k: ["Rolling-ball blends versus boundary-interpolating patches: rolling-ball has clear geometric meaning and predictable radius; patches give more control over continuity but are harder to specify.", "Tangent continuity versus curvature continuity: tangent is robust and enough for most parts; curvature continuity gives smoother reflections on surfaces but is more fragile."],
    p: ["A blend meeting a sharp corner at a very acute angle fails or produces a twisted patch.", "Blends that overrun a short adjacent edge produce a surface that no longer touches the face."],
    v: "Blend all edges of a cube with 2 mm radius and confirm the cross-section radius is 2 mm along each edge, the surfaces are tangent to the adjacent faces and corner patches are valid and continuous.",
    dep: ["surface-geometry","surface-intersection","boolean-ops"]
  },
  "surface-intersection": {
    s: "Computes the curves where two surfaces meet, including free-form surfaces, with correct handling of tangency, closed loops and multiple branches.",
    d: "Analytic pairs, such as plane and cylinder, have closed-form solutions. General pairs use a marching algorithm: find starting points by subdividing and testing bounds, then follow the curve with small steps, correcting each point back onto both surfaces. Branch points, tangent contact and closed loops need detection. The result is stored as an approximating spline with tolerance. It is the hardest and most critical numerical routine in the kernel because every Boolean, trim and blend depends on it.",
    k: ["Closed-form analytic cases versus one general marching method: closed-form is exact and fast but covers few pairs; general marching handles all pairs and costs more and can miss branches.", "Small step size versus adaptive: small is safe and slow; adaptive is efficient but can skip across a narrow feature."],
    p: ["A near-tangent intersection is missed entirely or is returned as a noisy chain of short segments.", "A small closed loop of intersection, such as a bubble, is never found because no starting point lands inside it."],
    v: "Intersect a set of surface pairs with known curves, including a tangent pair and a pair with an isolated loop. Confirm each curve is found, points lie on both surfaces within tolerance, and loop counts match the reference.",
    dep: ["surface-geometry","curve-geometry","numerics"]
  },
  "tessellation": {
    s: "Converts exact faces into triangle meshes within controlled deviation, for display, export, analysis and printing.",
    d: "Each face is meshed in its parameter space, respecting trim loops, then mapped to 3D. Edges are discretized first so adjacent faces share vertices exactly and the mesh stays watertight. Chordal deviation and angular limits control density. Normals and texture coordinates come from the surface. Results are cached with the face and invalidated on change. The challenge is conformity and speed: shared edges must be discretized once, thin faces and singular points give bad triangles, and high accuracy for large models costs memory.",
    k: ["Mesh edges first, then faces versus faces independently: edges first guarantee watertightness; independent is easier to parallelize but leaves cracks.", "Deviation-driven density versus fixed density: deviation adapts to curvature and gives efficient meshes; fixed is predictable and simpler but wastes triangles on flat areas."],
    p: ["Independent meshing of adjacent faces leaves visible cracks along shared edges.", "Narrow trimmed faces yield long slivers that shade badly or disappear."],
    v: "Tessellate a model at a 0.05 mm deviation, confirm no point on any triangle is further from the true surface than that, every interior edge is shared by two triangles, and there are no cracks when rendered.",
    dep: ["surface-geometry","trim-curves","curve-geometry"]
  },
  "point-classification": {
    s: "Answers whether a point lies inside, outside or on a solid, and supports ray casting and distance queries against its boundary.",
    d: "A ray from the point is intersected with the faces, and the parity or signed count of crossings gives inside or outside; points close to the boundary within tolerance are classified as on. Face-level tests use trim curves in parameter space. Distance queries find the nearest point on each face with spatial acceleration. These queries underlie Booleans, where every piece of one body must be classified relative to the other, and also support sensor simulation and measurement. The difficulty is degenerate rays that graze edges or vertices.",
    k: ["Ray-parity classification versus winding-number methods: ray parity is simple and fast but sensitive to grazing rays; winding number is robust on imperfect solids but costs more.", "Random ray directions versus fixed ones: random avoids systematic degeneracy; fixed is deterministic but can hit edges consistently."],
    p: ["A ray passing exactly through an edge counts two crossings or none, flipping the result.", "Open shells make the inside undefined, so queries return arbitrary answers without warning."],
    v: "Classify a million random points against a sphere and a cube with analytic answers. Confirm zero mismatches away from the boundary, and that points within tolerance of the surface are reported as on.",
    dep: ["surface-geometry","trim-curves","spatial-index"]
  },
  "healing-sewing": {
    s: "Joins separate faces or sheets along matching edges into shells and solids, and repairs small defects such as gaps, overlaps and bad orientation.",
    d: "Sewing finds edge pairs from different faces that lie within a tolerance, merges them into one shared edge and builds the connectivity. Repair passes fix orientation, remove sliver faces and zero-length edges, close small gaps by adjusting tolerances, and rebuild missing trim curves. The kernel uses it after Booleans, offsets and imports. The challenge is deciding what to merge: a loose tolerance joins edges that were separate on purpose, and a tight one leaves gaps.",
    k: ["Tolerance-driven automatic sewing versus explicit pairing: automatic is quick for imported models; explicit is safe but laborious.", "Minimal repair versus aggressive rebuilding: minimal changes less but may leave a body that fails later; aggressive produces a valid body but modifies geometry."],
    p: ["Sewing with a generous tolerance welds two parts that should be separate.", "A flipped face is fixed locally but the shell as a whole stays inconsistent."],
    v: "Sew six separate faces of a cube into a solid, then do it again with a 0.02 mm gap. Both must produce a closed valid solid whose volume matches the cube within tolerance, and report each merged edge.",
    dep: ["topology-graph","tolerant-modeling","validity-checking"]
  },
  "display-scene-graph": {
    s: "The display-side structure that holds drawable items, transforms, materials and visibility, organized to be culled and drawn quickly, and kept in step with the model.",
    d: "A scene graph mirrors the assembly hierarchy and holds display meshes, edge lines, transforms and appearance. Each frame it is traversed to cull items outside the view, order by material and draw. Updates from the modeling thread arrive as changes to nodes. It also holds temporary graphics such as previews and manipulators. The challenge is synchronization: the model changes on one thread and the display reads on another, so changes must be handed over without locks that stall drawing.",
    k: ["A separate display graph versus drawing straight from model data: separate decouples threads and formats but needs synchronization; direct is simple but ties frame rate to the model.", "Retained scene versus immediate drawing each frame: retained allows caching and culling; immediate is simple but repeats work."],
    p: ["A change applied halfway through a frame produces flicker or a mix of old and new geometry.", "The display graph holds meshes of deleted parts, a memory leak that grows during a session."],
    v: "Edit a part continuously while orbiting a large assembly and confirm no frame shows mixed old and new geometry, frame rate stays steady, and after closing the part memory returns to its prior level.",
    dep: ["gpu-renderer","tessellation","memory-management"]
  },
  "gpu-renderer": {
    s: "Draws the display scene with the graphics processor: shaded surfaces, lines, transparency, shadows and reflections, at interactive rates.",
    d: "Triangle buffers are uploaded to graphics memory and drawn by shaders that compute lighting, appearance and effects. Edges are drawn as lines or screen-aligned quads. Transparency needs depth-aware ordering. Large scenes use instancing, culling and batching to reduce draw calls, and may stream buffers in and out of graphics memory. An optional higher quality mode uses ray tracing for presentation images. The challenge is the volume of data and the many small objects: models exceed video memory and draw-call overhead dominates.",
    k: ["Rasterization versus ray tracing: rasterization is fast enough for interaction; ray tracing gives realistic images but is reserved for presentation modes.", "Batching many parts into a few buffers versus per-part buffers: batching cuts draw calls but makes per-part updates costlier; per-part is flexible but slower to draw."],
    p: ["A scene larger than video memory causes the driver to swap and the frame rate collapses.", "Transparent parts drawn in the wrong order show the wrong layers."],
    v: "Draw a model with ten million triangles while orbiting and measure the frame time per frame. Confirm it holds the target rate, no flicker occurs at depth boundaries, and transparent parts layer correctly from every angle.",
    dep: ["display-scene-graph","level-of-detail"]
  },
  "edge-silhouette-display": {
    s: "Draws feature edges and the outline of curved surfaces, so shapes read clearly in shaded and wireframe views, with hidden edges optionally dimmed or dashed.",
    d: "Model edges come from the exact topology, tessellated as polylines, so they stay crisp at any zoom. Silhouette edges, where a curved surface turns away from the viewer, depend on the view and are found on the mesh by comparing the normals of adjacent triangles or in image space. Edges are drawn with a small depth offset to avoid fighting with the surfaces. Display modes add hidden-line and wireframe. The challenge is stability and consistency with drawings, as view-dependent lines flicker when the mesh is coarse.",
    k: ["Exact model edges plus computed silhouettes versus image-space edge detection: exact edges are crisp and selectable; image-space is simple but loses identity and picks.", "Fixed line width in pixels versus in model units: pixels stay readable at any zoom; model units scale naturally but vanish when zoomed out."],
    p: ["Edges depth-fight with their faces and shimmer when the model rotates.", "A coarse mesh makes silhouettes of a cylinder jump between facets during orbit."],
    v: "Display a cylinder and a fillet in shaded-with-edges mode and orbit slowly. Silhouette lines should move smoothly without popping, model edges stay selectable, and no line flickers against its surface.",
    dep: ["gpu-renderer","tessellation","hidden-line-removal"]
  },
  "section-clipping": {
    s: "Cuts the display with clipping planes to show the inside of parts and assemblies, with caps drawn on the cut so the section looks solid.",
    d: "One or more clipping planes discard geometry on one side. Because the discarded part leaves hollow shells, caps must be drawn: stencil techniques mark where the cut lies inside a solid and fill it, or the kernel computes an exact cap by intersection. Dynamic sections move with the mouse. Exact sections can also produce curves for measurement. The difficulty is correct capping with multiple overlapping bodies and open or invalid bodies, where inside versus outside is ambiguous.",
    k: ["Stencil-based caps versus exact kernel sections: stencil is interactive and handles many bodies cheaply; exact gives measurable geometry but is slow to move.", "One cap color per body versus a uniform cut color: per body helps tell parts apart; uniform is cleaner but loses distinction."],
    p: ["An open shell makes the stencil cap flip inside out and the section appears empty.", "Overlapping bodies cancel each other's caps under parity stencil rules, leaving holes."],
    v: "Section an assembly through a bolted joint with a moving plane, confirm every solid shows a filled cap in its own color with no holes or flipped regions, and a distance measured across the cap matches the model.",
    dep: ["gpu-renderer","point-classification","boolean-ops"]
  },
  "picking": {
    s: "Determines which object lies under the cursor, using ray casts or id buffers, and returns faces, edges, vertices and positions to selection.",
    d: "Either the scene is rendered into an offscreen buffer where each primitive writes its id and the cursor pixel is read back, or a ray from the cursor is cast against a spatial index of triangles and edges. Results return the entity, depth, and 3D hit point, and edges and vertices get a pixel tolerance so they are easy to hit. Preselection highlight runs every mouse move. The challenge is speed and precision on huge scenes, and returning the right candidate when several are within the pick radius.",
    k: ["Id-buffer picking versus ray casting: id buffer is simple and fast for all visible primitives; ray casting handles hidden items and exact queries but needs an index.", "Pixel-radius tolerance for edges versus exact hits: tolerance makes thin edges selectable; exact is precise but frustrating to use."],
    p: ["Pick of a face behind a transparent part returns the front part in some modes and the back in others.", "Id buffer precision runs out on scenes with more primitives than the id format can hold."],
    v: "Hover over each of a set of known features in a test model and confirm the highlighted entity and reported 3D point match the expected face, edge or vertex, with latency below one frame on a large assembly.",
    dep: ["spatial-index","display-scene-graph","gpu-renderer"]
  },
  "document-model": {
    s: "The in-memory representation of a document: parts, features, sketches, assemblies, parameters and their relationships, with change notification and transactions.",
    d: "Objects have identities and typed properties and can reference each other, within and across documents. All edits go through transactions that record changes for undo, dependency invalidation and persistence. Observers, such as the display and the feature tree panel, are notified of changes. It owns the lifetime of geometry caches derived from the recipe. The challenge is the size and tangle of references, and thread safety: many subsystems read it while the user edits.",
    k: ["Transactional change tracking versus direct mutation: transactions give undo, consistency and notification at some overhead; direct mutation is faster but breaks undo and dependency tracking.", "Single-threaded document with background copies versus fine-grained locking: single-thread is simple and safe but needs snapshots for readers; locking allows concurrency but invites deadlock."],
    p: ["A subsystem that mutates the model outside a transaction makes undo skip the change and leaves dependents stale.", "Cross-document references that keep a closed document alive leak memory."],
    v: "Make a mixed series of edits in one transaction and confirm observers receive exactly one notification, undo restores the exact prior state including dependents, and closing the document releases all its memory.",
    dep: ["memory-management","native-file-format"]
  },
  "native-file-format": {
    s: "The on-disk representation of parts and assemblies, storing the feature recipe, sketches, references, and optionally cached geometry, with versioning for forward and backward compatibility.",
    d: "A file is a container of named sections: the recipe, parameters, references to other files, display meshes, thumbnails and optionally the exact geometry. Sections are compressed and may be read independently, so previews and structure open without loading everything. A version number and migration code upgrade older files on load. Writing must be atomic. The challenge is compatibility: files outlive the software that wrote them, newer files need to degrade gracefully in older versions, and a bug in the writer can corrupt a decade of data.",
    k: ["Storing the recipe only versus recipe plus cached geometry: recipe only is small but opens slowly because it must rebuild; cached geometry opens fast and is safer for long-term access but is larger.", "Sectioned container versus one monolithic stream: sectioned allows partial loads and updates; monolithic is simpler to write and slower to read."],
    p: ["A file saved by a newer version loses data when opened and resaved in an older one.", "Interrupted writes leave a truncated file with no valid backup."],
    v: "Save a part, reload it, and compare recipe, parameters and geometry to the original. Open a file written by an older version, and confirm it loads and migrates. Kill the process mid-save and confirm the previous file is intact.",
    dep: ["document-model","memory-management"]
  },
  "journal-recovery": {
    s: "Records edits as they happen so work can be recovered after a crash, and keeps automatic backups separate from the user's file.",
    d: "Each transaction is appended to a journal on disk, along with periodic snapshots. After an abnormal exit, the application offers to restore the last snapshot and replay the journal. The journal can also serve as a log for diagnosing bugs, since replaying it reproduces a failure. Autosave writes to a separate location so a crash during save cannot corrupt the user's file. The challenge is cost and correctness: journaling must not slow editing, and replay must be deterministic so the restored state equals the lost one.",
    k: ["Journal plus snapshots versus periodic full saves: the journal loses almost nothing but needs deterministic replay; periodic saves are simple but lose minutes of work.", "Recording at the command level versus the state-change level: commands are compact and readable; state-changes replay robustly even if the commands later change behavior."],
    p: ["A crash that happens inside the kernel mid-operation leaves a journal that replays the same crash.", "Autosave files left in a temporary folder fill the disk or are mistaken for current work."],
    v: "Make fifty edits, kill the application, restart, and recover. The restored document must match the last committed state, and replaying the journal on a clean copy must reproduce identical geometry.",
    dep: ["document-model","native-file-format","regeneration-engine"]
  },
  "unit-system": {
    s: "Defines how lengths, angles, masses and derived quantities are stored, converted, parsed and displayed, with explicit units attached to values.",
    d: "Values are stored in one internal unit system, and each document may display in another. Parsers accept entries with unit suffixes and expressions, convert them, and round for display according to precision settings. Derived quantities such as density and moment of inertia carry compound units. Import and export convert at the boundary. The challenge is silent conversion errors: a value without a unit tag is ambiguous, and rounding for display can hide values that matter for tolerances.",
    k: ["One internal unit with conversion at the edges versus keeping each value's own unit: one internal unit is simple and consistent; own units preserve entered values exactly but complicate arithmetic.", "Dimensionally checked expressions versus plain numbers: checking catches errors like adding length and mass; plain numbers are simpler but permit nonsense."],
    p: ["Display rounded to two decimals shows a tolerance of 0.005 as zero.", "Mixed-unit assemblies scale parts incorrectly when one document uses a different default."],
    v: "Enter 1 inch, 25.4 mm and 0.0254 m as a dimension, and confirm all three store the same internal value. Add 1 inch to 1 kg and confirm the expression is rejected.",
    dep: ["numerics"]
  },
  "numerics": {
    s: "The numerical routines every layer depends on: linear algebra, root finding, optimization, spline evaluation, interval arithmetic, and the tolerance conventions that give them consistent behavior.",
    d: "This library provides matrix factorization and rank detection for solvers, Newton and minimization routines for intersections and constraints, and robust geometric predicates. Resolution and angular tolerances are defined centrally so all components agree on when two points are the same. Where possible, predicates use exact or adaptive-precision arithmetic to avoid sign errors. The challenge is that floating point has limited precision and CAD models range from micrometers to kilometers, so tolerance choices at this layer decide whether the kernel is robust.",
    k: ["Absolute tolerances versus relative to model size: absolute is simple and predictable but wrong across scales; relative adapts but makes results depend on the size of the model.", "Exact predicates versus floating-point with tolerance: exact never misjudges orientation but costs time; tolerance is quick but can fail in degenerate cases."],
    p: ["A tolerance suited to millimeter parts makes a model in kilometers collapse into points.", "An unstable factorization returns a plausible but wrong answer for a nearly singular constraint system."],
    v: "Solve a battery of ill-conditioned test systems and degenerate predicate cases, and confirm results match high-precision references to the stated accuracy and that failures are reported rather than returning wrong answers.",
    dep: []
  },
  "memory-management": {
    s: "Allocation, caching and eviction of the large and varied data a CAD session holds: geometry, meshes, documents and undo state, under a fixed memory budget.",
    d: "Objects of very different lifetimes are created at high rates, so pools and region allocators reduce fragmentation and cost. Caches hold derived data such as tessellations and bodies with a policy for eviction when a limit is reached, rebuilding them on demand. Reference counting or ownership rules prevent leaks across documents. The system may track usage per document to give users control. The challenge is that every cache must be both invalidated correctly and evictable, or the session grows without bound.",
    k: ["Eviction of derived data on pressure versus failing when memory is exhausted: eviction keeps the session alive at the cost of recomputation; failing is simple but loses work.", "Reference counting versus arena allocation per document: counting frees early but pays overhead and risks cycles; arenas free in one step but hold everything until the document closes."],
    p: ["A cache that is never invalidated returns stale geometry while one that is never evicted exhausts memory.", "Cyclic references between documents keep both alive after closing."],
    v: "Open and close a large assembly twenty times and confirm memory returns to baseline each time, with peak usage staying under the configured budget when the cache limit is set low.",
    dep: []
  },
  "task-scheduling": {
    s: "Runs background work on a pool of threads with priorities and cancellation, so loading, meshing, rebuilding and checking use all cores without freezing the interface.",
    d: "Work is split into tasks with dependencies, queued by priority, and executed by worker threads. The interface thread stays free; results are posted back to it. Cancellation tokens let stale tasks stop when the user moves on. The kernel's internal parallelism uses the same pool to avoid oversubscription. The difficulty is correctness in parallel: shared model data needs careful access rules, results must merge deterministically, and a stuck task can freeze everything waiting on it.",
    k: ["A shared pool for all work versus separate pools per subsystem: shared uses cores fully and avoids oversubscription; separate isolates priorities but wastes capacity.", "Cooperative cancellation versus forced termination: cooperative leaves state consistent but depends on tasks checking; forced is immediate but can corrupt shared data."],
    p: ["Two tasks wait on each other's results through the shared pool and deadlock under load.", "A long non-cancellable kernel call keeps a worker busy after the user has left the model."],
    v: "Launch a heavy rebuild and cancel it at random points a hundred times. The document must be left unchanged each time, no worker thread stays busy, and the interface keeps responding within one frame throughout.",
    dep: ["memory-management"]
  },
  "plugin-host": {
    s: "Loads and isolates extensions that add commands, importers, features or analyses, providing them stable interfaces and containing their failures.",
    d: "Extensions are discovered, checked for version compatibility, loaded and given access to the automation interface and selected internal services. They can register commands, file types, property pages and kernel-level features. The host manages their lifecycle and permissions. Some run in separate processes so a fault does not take down the session. The challenge is stability of the interface across versions, and isolation: extensions share the process and can corrupt the model or hang the interface.",
    k: ["In-process extensions versus out-of-process: in-process are fast and deeply integrated; out-of-process are safe from crashes but pay serialization costs and have limited access.", "Wide interface access versus narrow stable API: wide enables powerful extensions but ties them to internals; narrow is stable but limits what can be built."],
    p: ["An extension compiled against an older version crashes the application after an upgrade.", "A faulty extension modifies the model outside a transaction and breaks undo."],
    v: "Install an extension that registers a command and a file type, use both, then force the extension to crash and confirm the host reports it, disables it and the open documents remain intact.",
    dep: ["automation-api","document-model"]
  },
});
