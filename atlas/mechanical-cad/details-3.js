// Details for the mechanical CAD plate, part 3: assemblies, large-assembly performance, parametric features.
ATLAS.details("mechanical-cad", {
  "component-instances": {
    s: "Placed occurrences of a part or subassembly in an assembly, each with its own transform, state and overrides while sharing one underlying definition.",
    d: "A definition holds geometry once; an instance holds a reference to it, a placement transform, visibility, appearance overrides and mate relationships. Fifty copies of a bolt are fifty instances of one definition. Edits to the definition affect all instances; changes to an instance, such as position, affect only it. Instances have stable identity so mates and drawings can refer to them. The difficulty is path-dependence: the same part used in two subassemblies is a different occurrence in each, so references have to name the full instance path.",
    k: ["Shared definitions versus copies: sharing saves memory and propagates edits, but one change can unintentionally alter every use; copies are independent but diverge and bloat.", "Instance-level overrides versus definition-level state: overrides let one use differ, at the cost of many exceptions to track."],
    p: ["Editing a shared part for one use silently changes the same part everywhere it appears.", "A mate to an occurrence by a non-unique name binds to the wrong instance after the tree is reordered."],
    v: "Place the same bolt twenty times, move one instance, and confirm only that instance moves while the file stores a single bolt definition. Edit the bolt's length and confirm all twenty update.",
    dep: ["assembly-structure","document-model"]
  },
  "assembly-structure": {
    s: "The hierarchical tree of subassemblies and parts that organizes an assembly, with rules for how it is built, how it is displayed and how it is exported to the bill of materials.",
    d: "The tree contains nodes for subassemblies and parts, each with a placement and metadata. It can reflect how the product is designed, built or serviced, and different structures may coexist as views of the same components. Operations like suppression, isolation and component replacement act on nodes. Loading follows the tree. The challenge is that the design structure rarely matches the manufacturing structure, and restructuring after the fact breaks references and mates unless these were built on stable identity.",
    k: ["One structure for design and manufacturing versus separate structures: one is simple but compromises both; separate structures fit each purpose but need synchronization.", "Deep nesting versus a flat list: deep nesting mirrors the product and allows reuse, but makes loading and mate references more complicated; flat is easy but loses meaning."],
    p: ["Moving a part to another subassembly breaks the mates that referred to its old path.", "Circular references between assemblies make the tree impossible to load."],
    v: "Move a part from one subassembly to another and confirm its mates, drawing references and BOM entry all follow it and the assembly still solves with the part in the same place.",
    dep: ["component-instances","document-model"]
  },
  "mate-constraints": {
    s: "Geometric relations between components, such as coincident, parallel, concentric and distance, and kinematic joints such as hinge or slider, that position parts and define their remaining motion.",
    d: "A mate refers to geometry on two component instances, such as a face, an axis or a point, and states a relationship. Together the mates form a constraint network. Joints package several relations into a named motion, such as a pin allowing rotation about one axis. Mate references use the persistent identity of faces, so they must survive part edits. The challenge is the quality of the network: over-constrained or conflicting mates give failure, and under-constrained assemblies move unexpectedly.",
    k: ["Geometric mates on faces versus joints between local frames: face mates are intuitive but break when faces change; frame-based joints are stable and map cleanly to simulation but need explicit frames.", "Many simple mates versus one joint: simple mates are flexible but numerous and easy to over-constrain; a joint states intent compactly."],
    p: ["A mate to a face that disappears after a part edit breaks and leaves the component floating.", "Redundant mates give the same result in nominal geometry but fail when a dimension changes slightly."],
    v: "Mate a pin concentric to a hole and coincident to a face, drag the part, and confirm it moves only along the pin axis. Change the hole diameter in the part and confirm the mates remain satisfied.",
    dep: ["persistent-naming","component-instances","surface-geometry"]
  },
  "mate-solver": {
    s: "A numerical solver that finds positions for all components so that every mate is satisfied, quickly enough to support interactive dragging.",
    d: "Components are rigid bodies with six degrees of freedom each; each mate becomes algebraic equations in their positions. Subassemblies are solved first and treated as units where possible, and graph decomposition splits the problem into independent clusters. The solver uses Newton-type iteration, starting from the current position to stay in the same configuration. Interactive dragging solves repeatedly at frame rate. The hard parts are multiple solutions (which of two valid positions to pick) and diagnosing which mates conflict when none exist.",
    k: ["Solving the whole assembly at once versus by decomposed clusters: whole is simple but scales badly; clusters are fast but need correct graph analysis.", "Staying near the previous solution versus finding the global one: staying near keeps motion continuous but can fail to reach valid positions; global search can flip configurations."],
    p: ["Dragging near a singular position makes the solver jump to a different valid configuration, flipping the mechanism.", "A conflict among hundreds of mates is reported without saying which ones are at fault."],
    v: "Drag a four-bar linkage through a full cycle and confirm every mate residual stays below tolerance at each frame, the configuration does not flip, and a deliberately conflicting mate is named in the error.",
    dep: ["mate-constraints","numerics","dof-analysis"]
  },
  "dof-analysis": {
    s: "Counts and reports the remaining freedom of each component, showing which parts are fully fixed, which can move, and in which directions.",
    d: "From the constraint graph the analysis computes the rank of the constraint Jacobian at the current position, giving the number of independent motions left for each body. It reports fully defined, under-defined and over-defined components, often with a display of free directions. This differs from a simple count, because redundant constraints reduce the apparent total without removing freedom. The difficulty is numerical: deciding rank needs thresholds, and at singular positions the true freedom differs from the generic one.",
    k: ["Rank from the numerical Jacobian versus a combinatorial count: numerical is accurate for a given position but depends on thresholds; combinatorial is fast and exact for generic cases but misses special geometry.", "Reporting per component versus per mechanism: per component is easy to show on the tree; per mechanism is more meaningful but harder to compute."],
    p: ["A mechanism at a singular position reports locked when it can in fact move after a small push.", "Redundant constraints make the count look fully defined while one part is still free."],
    v: "Build a hinge with one pin and a stop, report freedom, and confirm one rotational freedom. Add a second face mate and confirm zero freedom. Add a redundant parallel mate and confirm it is flagged as redundant.",
    dep: ["mate-solver","numerics"]
  },
  "in-context-design": {
    s: "Designing a part by referring to geometry of other parts in the assembly, including top-down layouts where one skeleton drives many components.",
    d: "A part's feature can refer to geometry of a sibling or to a master layout sketch or skeleton model in the assembly, so a change to one place moves everything that follows. Cross-file references are stored in each part and are resolved when the assembly is open. The approach captures intent that single parts cannot. The challenge is dependency: parts become unusable outside their assembly, reference loops are easy to create, and rebuild order across files has to be managed.",
    k: ["Top-down skeleton driving components versus bottom-up independent parts: top-down keeps the product consistent but couples parts to a skeleton; bottom-up keeps parts reusable but needs manual alignment.", "Live external references versus frozen copies: live stay current but break when files move; frozen are stable but go stale."],
    p: ["A part with external references opened alone shows out-of-context errors and cannot be rebuilt.", "A circular chain of references among three parts rebuilds forever or fails on every load."],
    v: "Drive two parts from one skeleton sketch, move a skeleton dimension, and confirm both update in one rebuild. Then open one part alone and confirm it shows its stored geometry and warns of missing references.",
    dep: ["dependency-graph","persistent-naming","assembly-structure"]
  },
  "configurations": {
    s: "Multiple variants of a part or assembly held in one definition, differing in dimensions, suppressed features, materials or component choices, selected by name or rule.",
    d: "A configuration stores overrides to parameters, feature suppression states, and component choices, relative to a base definition. They are used for sizes of a standard part, option packages or states such as open and closed. Selection can be explicit, from a design table, or by rules in a product configurator that generates variants from options. Each configuration yields its own geometry and BOM. The difficulty is combinatorial: a handful of options multiplies into thousands of valid variants, and each must rebuild correctly.",
    k: ["Configurations inside one file versus separate files per variant: one file is easy to manage and keeps variants in step but grows heavy; separate files are light but drift apart.", "Storing configurations explicitly versus generating on demand: stored is predictable and fast to open; generated covers unlimited combinations but is slower."],
    p: ["A configuration that suppresses a feature breaks a later feature that depended on it, yielding a rebuild error only for that variant.", "A variant is added to one level but not the parent assembly, so the BOM shows the wrong part."],
    v: "Create a fastener with five lengths as configurations, place each in an assembly, and confirm each instance has the correct geometry and BOM row. Rebuild all configurations and confirm none reports an error.",
    dep: ["design-tables","parameters-equations","rollback-suppression"]
  },
  "flexible-subassemblies": {
    s: "Subassemblies whose internal parts may move when used inside a larger assembly, such as a cylinder whose rod extends, solved together with the parent's mates.",
    d: "By default a subassembly is treated as a rigid unit. Marking it flexible hands its internal degrees of freedom to the parent solver, which then positions inner parts together with outer ones. The same subassembly instance can show different positions in different places of the product. This models actuators, springs and adjustable mechanisms. The challenge is solving cost and meaning: more freedom enlarges the solve, and the same definition may need different states in different uses, which is hard to store.",
    k: ["Rigid subassemblies versus flexible: rigid solves faster and is more stable; flexible is needed for motion within the unit but increases solver load.", "Storing positions per instance versus in the definition: per instance represents different states in one product; per definition is simpler but forces all uses to match."],
    p: ["Marking a large subassembly flexible slows every drag because the whole unit joins the solve.", "The same cylinder used twice shows the same extension in both places because state is stored in the definition."],
    v: "Use one cylinder subassembly twice, extend one rod and keep the other closed, save and reopen, and confirm each instance keeps its own rod position and the parent solves without drift.",
    dep: ["mate-solver","component-instances","assembly-structure"]
  },
  "lightweight-loading": {
    s: "Opening assemblies with only the data needed for the current task: display meshes and structure first, full geometry only for parts being edited.",
    d: "A lightweight component keeps a display mesh, bounding box, and metadata but no exact boundary representation. Parts load fully on demand when edited, measured or sectioned. Large-design modes extend this by deferring mates and rebuilding only required items. Opening time depends on the amount loaded, not the total size. The difficulty is correctness: operations such as mass properties, interference and drawings need exact geometry and either load it automatically or give incomplete results, and users may not notice which.",
    k: ["Lightweight by default versus fully loaded by default: lightweight opens quickly but some commands need to load and may stall mid-task; full loading is slow upfront but predictable.", "Mesh-only versus mesh plus exact surfaces on demand: mesh-only is smallest; on-demand brings accuracy to measurements but adds file reads."],
    p: ["A mass calculation on a lightweight assembly silently skips unloaded parts and reports too low a mass.", "Operations that trigger loading of many parts at once exhaust memory."],
    v: "Open a 20,000-part assembly in lightweight mode and time it against full mode. Compute mass properties and confirm the system loads needed parts or warns, and the result matches the full-mode value.",
    dep: ["native-file-format","level-of-detail","background-streaming"]
  },
  "level-of-detail": {
    s: "Draws simpler representations of distant or small components, such as fewer triangles or a bounding shape, to keep the frame rate up in big scenes.",
    d: "Each component has several representations at different detail levels, chosen per frame by projected size on screen and importance. Tessellation tolerance can be coarsened for far objects, small parts may be dropped entirely, and extreme distance uses a bounding volume. The choice must avoid visible popping when levels switch. Selected or edited items always use the highest detail. The challenge is generating levels for models that change, and keeping memory use under control since extra levels add data.",
    k: ["Precomputed levels versus generated on demand: precomputed switch instantly but occupy storage and go stale after edits; on-demand are current but cause hitches.", "Size-based selection versus budget-based: size-based is simple and predictable; budget-based holds the frame rate steady but changes quality unpredictably."],
    p: ["A tiny but important part, such as a retaining clip, disappears at distance and the user thinks it is missing.", "Level switches cause visible popping when the user zooms."],
    v: "Zoom out from a full assembly and verify the triangle count per frame drops sharply while the frame rate stays above the target. Zoom back in and confirm full detail returns with no popping artifacts beyond one frame.",
    dep: ["tessellation","display-scene-graph","spatial-index"]
  },
  "instance-sharing": {
    s: "Stores geometry and display data once per distinct part and draws it many times with different transforms, avoiding duplicated memory for repeated components.",
    d: "Identical parts, such as fasteners or standard components, point to one definition in memory, with each instance holding only a transform. The exact geometry, tessellation and display buffers are shared, and the renderer issues instanced draw calls for the group. Operations that need per-instance results, such as sectioning or coloring, handle them through per-instance data. The challenge is detection and invalidation: finding identical parts that were saved as separate files, and updating the shared data safely when one definition changes.",
    k: ["Instancing by definition identity versus by geometric comparison: identity is cheap and exact; comparison finds duplicates saved as separate files but costs time and risks false matches.", "Shared mutable geometry versus copy-on-write: shared is smallest; copy-on-write allows per-instance edits at the cost of tracking."],
    p: ["Parts that look identical but have different internal data, such as holes, are merged and show wrong geometry.", "Editing one instance in a shared definition mutates the data other instances are drawing."],
    v: "Load an assembly with ten thousand copies of one bolt and confirm memory use grows by the transforms only, with display geometry in memory exactly once, and that draw calls are grouped rather than ten thousand.",
    dep: ["component-instances","display-scene-graph","memory-management"]
  },
  "spatial-index": {
    s: "A hierarchy of bounding volumes or a grid over geometry that finds objects near a point, along a ray or overlapping a region without checking everything.",
    d: "Components, faces or triangles are grouped into a tree of bounding boxes. Queries descend only into volumes that could contain the answer, turning linear scans into logarithmic ones. It supports picking, culling, interference, clearance and hidden-line removal. The tree must be updated or rebuilt when parts move or change. The difficulty is balance: a poor tree degrades queries, rebuilding after every drag is expensive, and moving components need refit strategies.",
    k: ["Bounding volume tree versus uniform grid: trees adapt to uneven distributions and handle varied sizes; grids are simple and fast to update but waste memory on sparse scenes.", "Rebuilding versus refitting after movement: refitting is cheap and quick but degrades quality over time; rebuilding restores quality at higher cost."],
    p: ["A tree built once and left while parts are dragged slowly decays until queries are almost linear again.", "Boxes that are not padded by the modeling tolerance miss touching contacts."],
    v: "Run a pick and an interference query on an assembly of fifty thousand parts with and without the index. Results must be identical, and the indexed query should be faster by at least an order of magnitude.",
    dep: ["document-model","memory-management"]
  },
  "background-streaming": {
    s: "Loads, tessellates and caches components on worker threads while the user works, so large assemblies become usable before they are fully loaded.",
    d: "Priority is given to what is visible and near the camera. Worker threads read files, parse them, tessellate and place the result into caches, notifying the display when each piece is ready. Items that leave the view can be evicted. Streaming can read from a local cache or from remote storage. The challenge is coordination: work needs priorities that change with the camera, cancellation when the user moves on, and thread-safe access to shared document data.",
    k: ["Progressive loading versus load-everything-then-show: progressive makes the model usable sooner but shows incomplete scenes; load-first is consistent but slow to start.", "Aggressive prefetch versus on-demand only: prefetch hides delay but wastes memory and bandwidth; on-demand is lean but stalls on first use."],
    p: ["Cancelled loads that are not truly stopped continue to consume threads, causing slowdowns minutes later.", "Users edit a part that is still half-loaded, and the edit applies to incomplete data."],
    v: "Open a very large assembly over a slow link and confirm visible parts appear first within seconds, the interface stays responsive, and once loading finishes the scene matches a fully loaded open exactly.",
    dep: ["task-scheduling","lightweight-loading","cloud-sync"]
  },
  "envelope-simplification": {
    s: "Replaces a complex subassembly with a simplified solid or shell that keeps its external shape and attachment points, for use by other teams or in large contexts.",
    d: "An envelope can be a bounding volume, a convex hull, a shrinkwrap that covers only the outer surface with all internal parts removed, or a hand-made simplified body. Shrinkwrap is produced by rendering or voxel techniques that capture only surfaces visible from outside, then rebuilding a body. The simplified model replaces the original in context assemblies, reducing load and hiding proprietary internals. The difficulty is staying in step with the source, since a changed design must regenerate its envelope or the envelope misleads.",
    k: ["Automatic shrinkwrap versus manual simplified part: automatic is fast and tracks the source but may include unwanted detail; manual is clean but can drift away from reality.", "Convex hull versus tight wrap: hull is tiny and robust but fills concave areas other parts need; tight wrap fits true clearances but is bigger."],
    p: ["An envelope that fills a cavity makes clearance checks fail for parts that really fit.", "A stale envelope allows another team to design around a retired shape."],
    v: "Shrinkwrap an engine subassembly, replace it in a vehicle assembly, and confirm the envelope's outer shape deviates from the original by under 1 mm and no internal parts are present in the exported model.",
    dep: ["tessellation","boolean-ops","lightweight-loading"]
  },
  "parallel-rebuild": {
    s: "Rebuilds independent features, parts or assemblies on multiple threads at the same time, using the dependency structure to know what can run together.",
    d: "Within one part, the feature history is largely sequential because each step takes the previous body, so parallelism comes from independent branches and from splitting heavy kernel operations internally. Across parts, independent components rebuild concurrently when no reference links them. The scheduler walks the dependency graph and runs ready nodes on a thread pool. The challenge is that the kernel and document model must be thread-safe, and results must come out the same as sequential order, down to entity ordering.",
    k: ["Parallelism between parts versus inside operations: between parts is easier and scales with component count; inside operations helps single large parts but needs a kernel written for it.", "Deterministic merge of results versus first-finished: deterministic gives the same output every time at some wait; first-finished is faster but order-dependent."],
    p: ["A race in shared caches makes a rebuild produce different face orderings on different runs, which breaks persistent references.", "Too many threads fight over memory bandwidth and become slower than fewer."],
    v: "Rebuild a large assembly with one and with eight threads. The resulting geometry, entity identifiers and mass properties should be identical, while the eight-thread rebuild completes substantially faster.",
    dep: ["dependency-graph","task-scheduling","regeneration-engine"]
  },
  "profile-features": {
    s: "Features built from a 2D profile: extrusion along a direction and revolution about an axis, as boss or cut, with end conditions such as depth, through-all or up-to-surface.",
    d: "The feature takes a closed sketch profile, sweeps it along a line or an arc to create a volume and combines it with the existing body by union or subtraction. End conditions can be a distance, until another face, or symmetric. The operation is implemented in the kernel as a swept body followed by a Boolean. Direction and draft options extend it. The challenge is references: up-to-face end conditions depend on other geometry, and when that face changes, the feature must recompute or fail clearly.",
    k: ["Distance end conditions versus references to geometry: distance is stable and simple; references track design intent but make the feature depend on other faces.", "Combining by Boolean at creation versus keeping separate bodies: Boolean produces one clean solid; separate bodies defer the merge and allow later choices."],
    p: ["An up-to-next end condition changes the depth when a neighboring feature is added, altering a part nobody meant to edit.", "A profile with a tiny gap does not form a closed loop, so the extrusion fails or becomes a surface."],
    v: "Extrude a rectangle 10 mm with a through-hole cut using up-to-next, add a boss in the path, and confirm the cut depth updates to stop at the boss and volume changes by the expected amount.",
    dep: ["profile-detection","boolean-ops","surface-geometry"]
  },
  "sweep-loft": {
    s: "Features that move a profile along a path or blend between several profiles to create complex shapes such as pipes, rails and smoothly varying forms.",
    d: "A sweep moves a profile along a path with a rule for orientation (following the path's frame, keeping a fixed direction, or guided by rails). A loft interpolates a surface through a list of profiles and optional guide curves, with correspondence of points and tangency conditions. The kernel constructs free-form surfaces approximating the exact sweep. The difficulty is quality: twisting frames, self-intersecting results when the path curves tighter than the profile and mismatched profile vertices produce folds.",
    k: ["Exact sweep surface versus approximated spline: exact is mathematically faithful but may be complex to build; spline approximation is robust but only within a stated tolerance.", "Profile-driven versus rail-driven control: profiles are intuitive for simple shapes; rails control complex ones but need more curves and more things to fail."],
    p: ["A path with a bend radius smaller than the profile makes the swept surface self-intersect.", "Loft profiles with different vertex counts twist the surface through the intermediate sections."],
    v: "Sweep a circular profile along a path with bends and check that cross-sections perpendicular to the path remain circular with the stated diameter within tolerance, and that the solid passes the validity check.",
    dep: ["sketch-entities","surface-geometry","offsetting"]
  },
  "fillet-chamfer": {
    s: "Rounds or bevels selected edges, with constant or variable radius, producing smooth blends between faces that tolerate edits of the surrounding geometry.",
    d: "The feature takes edges, a radius or setback and a rule for how to propagate along tangent chains. The kernel's blending routines construct rolling-ball surfaces tangent to both faces and trim neighbors, with special handling where fillets meet at corners. Variable radius and setbacks add control. It is among the most failure-prone features: small faces, tight corners and thin walls give geometry that cannot be built. Order matters, so filleting late avoids most failures.",
    k: ["Fillet early in the history versus late: early keeps sketches simple and propagates with edits but breaks easily on later changes; late is robust but makes edits to the base shapes harder.", "Edge selection by reference versus by rule: reference is explicit but breaks if edges split; rule such as all edges of a face follows edits but may include unwanted ones."],
    p: ["A radius larger than the adjacent face makes the blend fail with an unhelpful message.", "Changing an upstream dimension splits an edge and only part of the fillet is applied."],
    v: "Fillet all edges of a block with 5 mm radius, check that the volume matches an analytic value and the surfaces are tangent along each blend, then increase the radius until the failure is reported with the offending edge identified.",
    dep: ["blending","persistent-naming","validity-checking"]
  },
  "shell-draft": {
    s: "Features that hollow a solid to a given wall thickness and tilt faces by an angle to allow parts to be removed from a mold or die.",
    d: "Shell removes selected faces and offsets the remaining surfaces inward or outward by the thickness, then repairs the resulting corners. Draft rotates faces about a neutral plane or parting line by the specified angle, extending or trimming neighbors. Both depend on offsetting and surface intersection and are sensitive to curvature: an offset on the inside of a tight curve collapses. Both are common in molded and cast parts, where uniform walls and draft are manufacturing requirements.",
    k: ["Shelling after detailed features versus before: after wraps all details with a wall but fails often; before gives a clean wall and requires adding details to the hollow body.", "Draft by neutral plane versus parting line: neutral plane is simple; a parting line follows real tooling splits but needs more setup."],
    p: ["A shell with thickness larger than the smallest inside radius fails because the offset surface degenerates.", "Draft applied after fillets leaves flat strips because the fillet faces were not included."],
    v: "Shell a block with one open face to 2 mm and confirm every wall measures 2 mm by probing thickness at fifty points, then apply 3 degrees draft and confirm face normals differ from the pull direction by 87 degrees.",
    dep: ["offsetting","surface-intersection","validity-checking"]
  },
  "hole-thread": {
    s: "Standard hole and thread features, such as drilled, counterbored and countersunk holes with tapped threads, defined by size tables and annotated for drawings.",
    d: "A hole feature places one or more positions by sketch point or reference, then cuts a profile chosen from a catalog: through, blind, counterbore, countersink, tapped. Parameters come from size tables for a fastener standard. Threads are usually represented as cosmetic data (a diameter and annotation) and not modeled helically, because modeled threads slow everything. The hole carries data to drawings and manufacturing. The challenge is catalog consistency: tolerances, thread depth and tap drill rules need to follow the chosen standard.",
    k: ["Cosmetic threads versus modeled helical threads: cosmetic is light and fast and enough for drawings; modeled is needed for print or simulation but costs performance.", "Catalog-driven sizes versus freely entered diameters: catalog ensures standard tooling is used; free entry allows custom sizes but misses manufacturing intent."],
    p: ["A tapped hole modeled at the nominal major diameter instead of the tap drill misleads the machinist.", "Hole position on a curved face lies along the wrong normal because the direction was not specified."],
    v: "Create an M8 tapped hole through 20 mm, then check that the drawing callout reports the thread, tap drill and depth from the standard's table, and that the model's cut diameter equals the tap drill.",
    dep: ["profile-features","sketch-entities","dimensioning"]
  },
  "pattern-mirror": {
    s: "Repeat features or bodies in linear, circular or free-form patterns, or reflect them across a plane, with the copies tied to the seed through a single definition.",
    d: "The feature stores a seed (a feature or a set), a pattern rule such as count and spacing or a table of positions, and options for skipped instances. On rebuild, the system creates each instance by transforming the seed's operation, which may be recomputed per instance or copied geometrically. Geometric copying is much faster but fails when instances meet different surroundings. The difficulty is that each instance must hit varying geometry, and one failed instance should be reported without discarding the rest.",
    k: ["Geometry-copy patterns versus fully re-evaluated patterns: copying is fast and works for simple cases; re-evaluation follows varying surroundings but takes longer per instance.", "Pattern driven by parameters versus by sketch points: parameters are compact and editable; sketch points allow irregular layouts."],
    p: ["Patterned features that hit a sloped face are copied flat and do not follow the surface.", "A pattern of a thousand features multiplies the rebuild time of the part."],
    v: "Create a circular pattern of twelve holes, change the count to eight and confirm exactly eight holes at 45 degree spacing remain, then skip one instance and confirm only that instance is absent.",
    dep: ["feature-tree","boolean-ops","parameters-equations"]
  },
  "sheet-metal": {
    s: "Features specific to bent sheet parts: flanges, bends with allowances, relief cuts, corners and unfolding to a flat pattern for cutting.",
    d: "The model is built from a base sheet with thickness and a bend rule giving how much material a bend consumes, using a K-factor or bend table. Features add flanges, tabs, hems and forms, and corner relief rules. The flat pattern is computed by unbending each bend by the allowance and laying the faces in a plane, with bend lines and positions annotated. The difficulty is that the folded and flat states must agree with the real process, and a small error in the bend rule moves holes.",
    k: ["Using a K-factor versus measured bend tables: K-factor is simple and approximates most cases; tables from the shop's own tests give real accuracy at the cost of data upkeep.", "Modeling in the folded state versus the flat state: folded matches the product, flat matches the manufacturing; supporting both needs the same model to unfold and refold."],
    p: ["Flat pattern computed with the wrong bend allowance gives holes that do not line up after bending.", "A flange too short for the press brake tooling is modeled without warning."],
    v: "Model a bracket with two 90 degree bends, unfold it, and compare the flat length to the hand-calculated developed length from the bend allowance. Fold it back and confirm all hole positions match.",
    dep: ["profile-features","dimensioning","parameters-equations"]
  },
  "direct-editing": {
    s: "Edits geometry by pushing, pulling, moving or deleting faces without regard to the feature history, useful for imported bodies and quick changes.",
    d: "The user selects faces and moves, rotates, offsets or deletes them, and the kernel rebuilds the neighboring faces by extending, intersecting and healing them. Systems may record the operation as a history feature on top, or work wholly without a history. Recognition of geometric relationships, such as keeping a hole concentric or a face tangent, guides what moves together. The challenge is robustness without history: the system has to guess intent from geometry, and the same edit can have several plausible results.",
    k: ["Direct edits recorded as features versus history-free modeling: recorded keep the history but add fragile steps at the end; history-free is simpler and faster but loses parameters.", "Preserving detected relationships by default versus only on request: default keeps design intent but may move more than the user expects; request is predictable but takes more steps."],
    p: ["Moving a face on an imported body breaks the tangency of an adjacent fillet and leaves a visible step.", "A direct edit added at the end of a history is skipped on a configuration that suppresses its base feature."],
    v: "Import a bracket, push a face by 3 mm, and confirm adjoining faces extend, holes remain concentric where expected, the body stays valid and only the intended faces changed in a before and after comparison.",
    dep: ["surface-intersection","healing-sewing","topology-graph"]
  },
});
