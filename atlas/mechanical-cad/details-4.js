// Details for the mechanical CAD plate, part 4: feature history and regeneration, sketches and constraints.
ATLAS.details("mechanical-cad", {
  "feature-tree": {
    s: "The ordered list of features that defines a part, each with its parameters and references, displayed as a tree and replayed in order to produce the geometry.",
    d: "The tree is the part's source: each node stores the feature type, parameters, sketch, references to earlier geometry, and state such as suppressed or failed. Geometry is a cache derived by replaying nodes from the top. The user can reorder, edit, insert before a node by rolling back, or group features. Nodes may also hold sub-trees, such as a sketch beneath its feature. The challenge is that order is both history and dependency: reordering is only legal where references permit, and editing early nodes affects everything after.",
    k: ["Linear ordered history versus a dependency graph without order: linear is easy to understand and replay; a graph allows reordering and parallelism but is harder for users to read.", "Storing the recipe as the truth versus storing the geometry: recipe allows full edits and keeps files small; geometry opens instantly and does not need rebuilding."],
    p: ["Dragging a feature earlier in the tree than the geometry it references produces errors that cascade down the list.", "Very long trees, with thousands of features, make every edit trigger a long rebuild."],
    v: "Open a part, edit a sketch dimension at the top of the tree, and confirm every later feature rebuilds with no errors. Compare the final geometry with a reference rebuilt from scratch in the same order; volume and faces must agree.",
    dep: ["document-model","dependency-graph"]
  },
  "dependency-graph": {
    s: "The directed graph of which features, sketches and parameters depend on which, used to decide what must be recomputed after a change and to detect cycles.",
    d: "Nodes are features, sketches, parameters and external references; edges record that one reads the output of another. After an edit, the engine marks everything downstream as dirty and recomputes it in topological order. The graph also drives validation: it rejects circular references, supports reordering checks, and reports where-used for a feature. Dependencies include hidden ones, such as a sketch on a face, which depends on that face. The challenge is completeness, because a missed edge means a stale result and an extra edge means needless rebuild.",
    k: ["Fine-grained dependencies per face versus per feature: per face rebuilds less and tracks exactly what changed; per feature is simple but rebuilds everything downstream.", "Graph built from declared references versus discovered by tracing reads: declared is explicit and cheap; tracing is complete but costs runtime and complexity."],
    p: ["A dependency that is tracked in the interface but not in the graph leaves a feature stale after the parameter it uses is edited.", "Cycles created through equations across files prevent opening the document."],
    v: "Edit one parameter and compare the list of features the engine rebuilds with the list obtained by rebuilding everything and diffing results. Features that differ must all be in the rebuilt set, and none outside it.",
    dep: ["feature-tree","parameters-equations"]
  },
  "regeneration-engine": {
    s: "Replays the dirty parts of a feature history after a change to produce new geometry, handling failures, caching earlier results and keeping identity stable.",
    d: "Starting from the first changed feature, the engine runs each in order: evaluate parameters, resolve references to earlier geometry, run the kernel operation, check validity, and record the new body and identifier mapping. Results of unchanged earlier steps are cached so replay starts mid-history. Failures are marked on the feature, and the engine decides whether to stop, skip or continue. The hard problems are performance on long histories and determinism: the same inputs must produce the same geometry and entity identities every time.",
    k: ["Caching intermediate bodies versus recomputing from the start: caching makes edits fast but consumes memory and must be invalidated precisely; recomputing is simple but slow.", "Stopping at the first failure versus continuing past it: stopping gives a clear first cause; continuing shows what else is affected but can produce misleading cascades."],
    p: ["A cached body not invalidated after an upstream change produces a part that does not match its parameters.", "Rebuilds in different orders give different entity identities, so downstream references attach to different faces."],
    v: "Edit the same parameter in two sessions, rebuild, save, and compare the saved geometry and entity identifiers. They must match exactly. Then perform undo and the same edit again and confirm identical results.",
    dep: ["dependency-graph","persistent-naming","validity-checking","boolean-ops"]
  },
  "rollback-suppression": {
    s: "Tools to step the model back to an earlier point in the history, or to turn individual features off, so new work can be inserted or problems isolated.",
    d: "Rollback moves an end-of-rebuild marker up the tree so later features are not evaluated and new features are inserted at that point. Suppression excludes a feature and, usually, its dependents from the rebuild while retaining their data. Both change what geometry exists and hence what references can resolve. Suppression states are stored per configuration. The challenge is reference integrity: features after the marker that refer to ones suppressed will fail or be suppressed with them, and users may not realize they changed configuration behavior.",
    k: ["Suppressing dependents automatically versus leaving them to fail: automatic keeps the model rebuilding but hides the extent of the change; failing is loud but breaks the rebuild.", "Inserting at the rollback point versus appending at the end: inserting follows the design's logic but changes later results; appending is safe but sometimes impossible geometrically."],
    p: ["Saving a part while rolled back leaves downstream users seeing partial geometry in assemblies.", "A suppressed feature that others reference is unsuppressed later and changes parts far away."],
    v: "Roll back to before a fillet, add a hole, roll forward, and confirm the fillet still applies, the hole exists, and the part rebuilds with no errors. Suppress the base extrude and confirm dependents are reported.",
    dep: ["feature-tree","regeneration-engine","dependency-graph"]
  },
  "parameters-equations": {
    s: "Named values and expressions that drive dimensions and feature settings, so one number can control many features and relationships are written as formulas.",
    d: "Parameters have names, units and values or expressions that can reference other parameters, global variables, material properties, and measurements of the model. An expression evaluator resolves dependency order and detects circularity. Changing a value triggers dependent rebuilds. Links can cross files to share values between parts. The challenge is maintainability: undocumented equations become hidden logic, units get mixed, and an expression referring to the model's own geometry creates loops.",
    k: ["Global named parameters versus per-feature dimensions: global gives one place to change design variables; per-feature is local and clear but duplicates values.", "Allowing references to measured geometry versus inputs only: measured references express more intent but create loops and slow rebuilds."],
    p: ["An equation that mixes inches and millimeters evaluates without error and yields a dimension 25.4 times off.", "Renaming a parameter breaks every external file that referred to it by name."],
    v: "Define a width parameter and a height equal to half of it, change width, and confirm height updates on rebuild. Then try to define width in terms of height and confirm the cycle is detected and refused.",
    dep: ["unit-system","document-model","dependency-graph"]
  },
  "design-tables": {
    s: "A spreadsheet-style table in which each row defines a variant by giving values to parameters and states, used to produce families of parts from one model.",
    d: "Column headers name parameters, suppression states or configuration properties, and each row is a configuration. When a row is selected, the engine sets the values and rebuilds. The table may be embedded or linked to an external spreadsheet that the engineering team maintains. It is the common way to produce standard component families, such as fasteners and fittings. The challenge is validation: rows with invalid combinations break the rebuild, and linked spreadsheets can change values without engineers noticing.",
    k: ["Embedded table versus external linked spreadsheet: embedded travels with the file; external is easy for others to maintain but can change underneath the model.", "Full explicit rows versus rules that generate rows: explicit is transparent and checkable; rules are compact but harder to audit."],
    p: ["An external table edited by a colleague changes released part sizes with no revision.", "A row with a value outside the model's valid range rebuilds with errors only when someone selects it."],
    v: "Create a table with five rows for a standard family, rebuild each and measure the key dimension in each; all five must match their table values and rebuild without errors.",
    dep: ["parameters-equations","configurations","regeneration-engine"]
  },
  "failure-diagnosis": {
    s: "Detects, locates and explains rebuild failures, naming the feature and the cause, and offering ways to repair them, such as re-selecting a lost reference.",
    d: "When a feature fails, the engine records the kernel's error, the feature, and the missing references or invalid result. A diagnosis layer translates them into messages such as a lost face, a self-intersecting result or an unclosed profile, and highlights the offending items. Repair tools let users re-attach references or replace a feature. Some systems show what changed between the last good rebuild and the failure. The difficulty is that the first failing feature is rarely the root cause: a lost reference may be the result of a small upstream edit.",
    k: ["Reporting the first failure versus the probable root cause: first failure is exact; probable cause is more useful but can be wrong.", "Continuing after failure to show everything broken versus stopping: continuing maps the damage but generates misleading follow-on errors."],
    p: ["A generic message such as rebuild error with no feature or geometry named sends users hunting through the tree.", "Repair by re-selecting a face quietly connects to the wrong one and the failure disappears while the model changes."],
    v: "Delete a face that a hole is placed on, rebuild, and confirm the hole is flagged as failed with a message naming the missing face. Re-select a new face and confirm the part rebuilds and the error clears.",
    dep: ["regeneration-engine","persistent-naming","validity-checking"]
  },
  "persistent-naming": {
    s: "The mechanism that lets a reference to a face, edge or vertex still find the same geometry after the model is rebuilt with different parameters or topology.",
    d: "Rebuilding creates new topology objects, so references cannot be raw pointers. The system assigns identifiers during feature execution, tied to how an entity was created (the edge between the extrude's side face and its top), and records the mapping through each operation, including splits and merges. A reference is resolved by looking up the identifier or by matching geometric and topological signatures. It is the central unsolved problem of history-based modeling, since no scheme is correct in all cases.",
    k: ["Naming by creation history versus matching by geometry: history is exact when operations are stable but breaks when the structure changes; geometry matching survives restructuring but can pick a similar wrong entity.", "Failing loudly when a name is ambiguous versus guessing: failing keeps the user informed but interrupts work; guessing keeps the model rebuilding at the risk of silent errors."],
    p: ["After a feature edit, a mate or dimension attaches to a neighboring face with the same shape and nobody notices.", "A split edge gives two descendants and the reference follows only one."],
    v: "Put a fillet on an edge, a dimension on a face and a mate on another face, then change an upstream feature that splits and reshapes those entities. Confirm every reference follows the intended geometry, or is reported as lost.",
    dep: ["topology-graph","surface-geometry"]
  },
  "sketch-planes": {
    s: "The planes or faces on which sketches are drawn, defining the sketch's coordinate frame and its attachment to the model so that it moves when the model changes.",
    d: "A sketch plane is a datum plane, a planar face, or a computed plane. The sketch has a local origin and axes, defined by the plane and optional references, so its 2D coordinates map to 3D positions. If the support face moves or changes, the plane follows through the persistent reference. Datum planes and axes are created from other geometry by offset, angle or three points. The challenge is attachment: sketches on faces depend on those faces, and fragile attachments are a main cause of rebuild failures.",
    k: ["Sketching on model faces versus on datum planes: faces are quick and follow the geometry but depend on topology; datum planes are stable and independent but add objects to maintain.", "Automatic orientation of the sketch axes versus explicit definition: automatic is convenient but may flip on rebuild; explicit is stable."],
    p: ["A sketch placed on a face loses its plane when the face is split by a later edit.", "The sketch's X axis flips after an upstream change, mirroring the profile."],
    v: "Sketch on a face, change the part's height so the face moves, and confirm the sketch moves with it and keeps its orientation. Then flip the base direction and confirm the sketch does not mirror.",
    dep: ["persistent-naming","surface-geometry"]
  },
  "sketch-entities": {
    s: "The 2D geometry elements drawn in a sketch, such as lines, arcs, circles, ellipses, splines and points, plus construction geometry that guides without making shapes.",
    d: "Each entity has a small set of degrees of freedom, such as the end points and radius of an arc, held in the sketch's parameter vector. Splines have control points or fit points and tangency handles. Construction entities are used for reference only. Entities carry identities that constraints and dimensions refer to. Sketch tools support trimming, offsetting, filleting, patterns and mirroring. The challenge is robust identity under editing: trimming a line produces a new entity, and constraints on the old line must move correctly.",
    k: ["Control-point splines versus fit-point splines: control-point gives smooth local shape editing but points lie off the curve; fit-point passes through chosen points but can oscillate.", "Splitting entities when trimmed versus modifying in place: splitting is simple but multiplies entities; in place preserves identity but needs rules for constraints."],
    p: ["Trimming a line deletes constraints silently because they referenced the original entity.", "A spline with many fit points wobbles and gives a feature curvature that the surfaces cannot follow."],
    v: "Draw a profile with lines, arcs and a spline, trim a corner and mirror half, then confirm entity count, endpoint coincidence and total length match a hand-computed reference, with constraints retained where meaningful.",
    dep: ["curve-geometry","sketch-planes"]
  },
  "geometric-constraints": {
    s: "Relations that fix the shape of sketch geometry without numbers: coincident, tangent, parallel, perpendicular, horizontal, equal, symmetric and concentric.",
    d: "Each constraint contributes equations among the entity parameters, such as a tangency between a line and a circle requiring the distance from the center to the line to equal the radius. They can be inferred as the user draws, based on cursor position. The solver combines them with dimensions. Constraints record design intent, such as a hole centered on a line, and their persistence matters on later edits. The challenge is quantity and conflict: automatic inference adds redundant or unintended constraints that make later edits fail.",
    k: ["Inferring constraints while drawing versus explicit adding: inference is fast and gives constrained sketches by default but can add unwanted ones; explicit is controlled but slow.", "Constraints with direction memory versus pure geometric equations: memory keeps tangent on the same side; pure equations can flip between valid solutions."],
    p: ["An accidental coincident inferred between two unrelated points locks the sketch against later changes.", "Tangent constraints flip to the other solution on rebuild when a dimension changes a lot."],
    v: "Sketch a slot with tangent arcs, change its width and length dimensions, and confirm the arcs stay tangent to the lines to within the solver tolerance and the shape does not flip.",
    dep: ["sketch-entities","constraint-solver"]
  },
  "dimensional-constraints": {
    s: "Numerical sizes and positions applied to sketch geometry, such as lengths, radii, angles and distances, that either drive the shape or report its value.",
    d: "A driving dimension adds an equation to the system that fixes a measurement; a reference dimension only displays a value. Dimensions can be given as numbers, expressions or parameter links, and become the handles for later edits and for studies. Dimension placement determines which solution the solver picks and how robust edits are. The challenge is choosing a scheme: dimensions that follow how a part is manufactured and inspected make edits natural, while ones that just fully constrain the sketch may not.",
    k: ["Dimensioning from functional datums versus chaining dimensions: functional datums give stable intent but need planning; chains are quick but accumulate and alter downstream geometry when one changes.", "Driving versus reference dimensions: driving gives control; reference gives information without constraining, preventing conflicts."],
    p: ["Changing one dimension in a chain moves everything after it, which was not intended.", "Adding a driving dimension that conflicts with existing ones turns the sketch over-defined and halts the rebuild."],
    v: "Fully dimension a bracket sketch, change each dimension in turn to a new value, and confirm the measured geometry equals the entered value each time and unrelated dimensions stay unchanged.",
    dep: ["geometric-constraints","parameters-equations","constraint-solver"]
  },
  "constraint-solver": {
    s: "A numerical solver that adjusts sketch geometry until all constraints and dimensions are satisfied, fast enough for dragging in real time.",
    d: "The system is a set of nonlinear equations in the entity parameters. The solver partitions it into small independent clusters, orders them by dependency, and solves each by Newton-style iteration using the Jacobian, starting from the current geometry so the result stays near what the user drew. Special cases such as rigid groups or recognized patterns get closed-form solutions. Under-constrained systems resolve to the nearest solution. The hard parts are robustness near singularities and picking among multiple valid answers.",
    k: ["Decomposing into clusters versus solving the whole system at once: decomposition is fast and local but needs correct graph analysis; whole system is simpler but scales badly.", "Local iteration from the current state versus global search: local keeps shapes continuous but may fail from a poor start; global can find solutions but flips configurations."],
    p: ["A singular configuration, such as two parallel lines with a perpendicular distance of zero, makes the iteration diverge or fail with no result.", "Dragging an under-constrained sketch moves distant geometry in unexpected ways."],
    v: "Solve a sketch with fifty constraints and confirm all residuals are below 1e-9 relative to size. Drag a vertex through a hundred frames and confirm each frame solves within the time budget without flipping.",
    dep: ["numerics","geometric-constraints","dimensional-constraints"]
  },
  "solver-diagnostics": {
    s: "Reports how constrained a sketch is, which geometry is still free, and which constraints conflict or are redundant, helping users repair sketches.",
    d: "After solving, the diagnostics compute the number of remaining degrees of freedom per entity and show it by color or listing. For failures they search for a minimal conflicting set of constraints, using the dependency structure and rank analysis of the Jacobian. Redundant constraints are consistent but unneeded; conflicting ones cannot be satisfied together. Suggestions include deleting or converting to reference. The difficulty is explaining: the minimal conflicting set is not unique, and the one the user sees first may not be the one they want to remove.",
    k: ["Coloring free geometry versus listing counts: color shows exactly where the freedom is; counts are compact but harder to act on.", "Suggesting a constraint to delete versus only showing the conflict set: suggestion speeds repair but can recommend the wrong one; showing the set leaves the choice with the user."],
    p: ["A redundant dimension is flagged as a conflict after an edit, even though it was fine before.", "An under-constrained sketch looks complete and moves unpredictably later when another feature depends on it."],
    v: "Over-constrain a rectangle with a redundant and then a conflicting dimension. The first must be reported as redundant, the second as a conflict naming the participating constraints, and removing it restores a fully defined state.",
    dep: ["constraint-solver","numerics"]
  },
  "profile-detection": {
    s: "Finds closed loops in a sketch, including nested and overlapping ones, and decides which regions become solid, hole or ignored when a feature uses the sketch.",
    d: "The sketch entities are assembled into a planar graph. Intersections are computed to split entities, then closed loops are found by walking the graph, with nesting determined by containment so that inner loops become holes. Users select regions or the whole sketch. Open or self-intersecting loops are reported. Gaps smaller than tolerance are bridged. The challenge is robustness: tiny gaps and overlaps are invisible on screen yet break a loop, and ambiguous overlaps have more than one valid reading.",
    k: ["Automatic region detection versus requiring a clean closed sketch: automatic is convenient and allows overlapping shapes but can pick surprising regions; clean-only is predictable but demanding.", "Gap tolerance generous versus strict: generous bridges small errors but may close intended openings; strict reveals problems but blocks work."],
    p: ["A 0.001 mm gap leaves a loop open and the extrusion yields a surface.", "Overlapping circles produce three regions and the wrong one is extruded."],
    v: "Sketch a square with a circular hole and an overlapping smaller square. Confirm the detector lists each distinct region with correct nesting, and extruding the square with the hole yields the hole through the part.",
    dep: ["sketch-entities","numerics"]
  },
  "derived-geometry": {
    s: "Sketch geometry created from model geometry: projecting edges onto the sketch plane, intersecting faces with it, or offsetting existing loops, kept linked to their sources.",
    d: "A projected entity records the source edge or face and the plane, computes its image, and updates when the source changes. Intersection curves come from the kernel's surface intersection. Offsets follow an existing loop at a distance. These entities are driven by the model, not by constraints of their own, so they supply fixed anchors for dimensions. The challenge is dependency and fragility: the sketch now depends on the other features' faces, so changes upstream can break references and make sketches unreproducible.",
    k: ["Projected linked geometry versus copying it as free geometry: linked follows changes and expresses intent but adds dependencies; copied is stable but ignores model updates.", "Converting geometry into reference by default versus driving: reference does not over-constrain; driving can add intended control."],
    p: ["A projected edge that disappears after a fillet is added upstream leaves the sketch undefined.", "A reference loop is created when a sketch projects from the feature that is built from it."],
    v: "Project an edge onto a sketch, move the edge's source feature, and confirm the projected line moves with it and any dimensions attached follow. Delete the source and confirm the sketch reports the broken reference.",
    dep: ["persistent-naming","surface-intersection","sketch-planes"]
  },
});
