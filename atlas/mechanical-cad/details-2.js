// Details for the mechanical CAD plate, part 2: drawings, tolerances, simulation hooks, file exchange.
ATLAS.details("mechanical-cad", {
  "drawing-views": {
    s: "Creates 2D views of a 3D model by projecting it onto planes: front, top, side, isometric and auxiliary views, each with scale, orientation and display style.",
    d: "A view is defined by a model reference, a projection direction, a scale and a display mode. Orthographic projection of the exact boundary representation gives silhouettes and edges, which are clipped by the hidden-line stage and drawn as sheet geometry. Child views, such as projected and auxiliary ones, inherit alignment from a parent. Views are regenerated when the model changes. The difficulty is projecting curved surfaces exactly: silhouettes of free-form surfaces have to be computed rather than read off, and they are expensive on large assemblies.",
    k: ["Projecting exact geometry versus projecting the display mesh: exact gives true curves for dimensioning but is slow on assemblies; mesh is fast but yields faceted edges.", "Aligned child views versus freely placed views: alignment enforces drafting convention and moves together, but limits layout freedom on crowded sheets."],
    p: ["Views of a large assembly take minutes to regenerate and users turn off updating, so sheets silently go stale.", "Mixed first-angle and third-angle projection conventions between templates produce mirrored views."],
    v: "Create front, top and right views of a part, move a hole in the model, and confirm all three views show the hole in its new position in alignment, with no stale lines left behind.",
    dep: ["hidden-line-removal","surface-geometry","tessellation"]
  },
  "section-detail-views": {
    s: "Produces cut views through a model along a plane or path, and enlarged detail views of small regions, with the cut faces hatched according to material.",
    d: "A section view intersects the solid with a cutting plane or stepped path and keeps one side. The cut produces new faces, hatched by material or component, and conventions mean some parts, such as fasteners and ribs, are shown uncut. A detail view re-projects a circled region at larger scale. Both link back to the parent view by a cutting-line symbol. The challenge is that the cut uses a Boolean operation or intersection on every body in view, and assemblies need per-component handling of what is hatched, what is omitted and how adjacent parts are distinguished.",
    k: ["Computing the section by Boolean on exact geometry versus clipping the mesh: exact is dimensionable but slow; clipped mesh is quick but not editable as drawing geometry.", "Following the standard's rules for uncut components versus cutting everything: rule-following looks right to a drafter but needs tagging; cutting everything is automatic but misleading."],
    p: ["Coincident faces in an assembly make hatching alternate or vanish, because the cut cannot tell which body owns the face.", "A detail view's scale label is not updated after the parent view's scale changes."],
    v: "Cut a part through a stepped path crossing a bore and a rib. Confirm the cut faces are hatched, the rib is uncut if the standard calls for it, and the section label matches the cutting line.",
    dep: ["boolean-ops","drawing-views","hidden-line-removal"]
  },
  "hidden-line-removal": {
    s: "Determines which edges of a projected model are visible and which are hidden behind faces, so views can show visible lines solid and hidden lines dashed or removed.",
    d: "Given the projection direction, the algorithm tests every candidate edge against every face for occlusion, working either on exact curves or on a tessellation. Output is a set of visible and hidden curve segments with the source edge identity retained, so dimensions can attach to them. Exact methods subdivide edges at intersections with silhouettes. Spatial acceleration cuts the quadratic cost. The hard part is robustness and speed: grazing contacts, coincident edges and tangent surfaces produce dropouts or false lines, and assemblies have millions of edges.",
    k: ["Exact curve-based removal versus mesh-based: exact output is clean and dimensionable but costly and fragile; mesh-based is fast but gives approximate lines.", "Precomputing hidden lines once versus recomputing per view change: caching speeds viewing but must be invalidated on any geometry change."],
    p: ["A tangent edge on a fillet is classified as hidden in one view and visible in another, producing broken lines.", "Segments lose their link to the model edge, so dimensions attached to them detach when the view updates."],
    v: "Render a drawing of a part with a rear pocket. Confirm the pocket's edges are dashed in the front view, solid in the rear view, and that moving the part's model causes no gaps or doubled lines.",
    dep: ["spatial-index","surface-intersection","tessellation"]
  },
  "dimensioning": {
    s: "Places size and location dimensions, notes and symbols on a drawing, linked to model geometry or entered manually, and formatted to a drafting standard.",
    d: "A dimension refers to model edges, vertices or sketch entities, computes its value from them, and positions text, arrows and extension lines according to the chosen standard. Driven dimensions report the model's value; some systems can also import the model's design dimensions onto the drawing. Auto-placement arranges dimensions to avoid collision and clutter. The challenge is stability: the reference must survive a model edit, and the layout must stay legible when a dimension moves or the view rescales.",
    k: ["Retrieving model dimensions onto the drawing versus drafting them afresh: retrieved are linked and consistent but follow modeling order, not manufacturing intent; fresh ones follow how the part is inspected but can drift from the model.", "Automatic layout versus manual placement: automatic is fast but crowds in complex views; manual is clean but is lost on regeneration."],
    p: ["A dimension attached to an edge that is later split in two by a feature loses its reference and floats or disappears.", "Mixing standards between sheets, such as decimal place rules and arrow styles, makes the drawing set fail review."],
    v: "Dimension a bore diameter and a hole spacing on a drawing, change the model values, and confirm both dimensions update to the new values. Check that text, arrows and units match the selected standard.",
    dep: ["drawing-associativity","persistent-naming","hidden-line-removal"]
  },
  "gdt-frames": {
    s: "Geometric dimensioning and tolerancing symbols: feature control frames, datum labels and modifiers, attached to features and defining allowed form, orientation, location and runout.",
    d: "A feature control frame gives a characteristic (flatness, position, perpendicularity and so on), a tolerance zone, optional material-condition modifiers and an ordered list of datum references. Datum features establish the coordinate frame for measurement. The software enforces which characteristics are legal, which need datums, and formats the frame to the standard. In richer systems the frame is semantic data attached to faces, not drawn lines. The difficulty is meaning: the standard defines exact interpretation rules, and a drawing symbol that merely looks right can specify something different from what the designer intended.",
    k: ["Semantic frames tied to geometry versus drawn symbols: semantic frames can be checked and passed to inspection but require strict data entry; drawn symbols are easy but carry no machine-readable meaning.", "Checking legality of every frame versus leaving it to the user: checking prevents invalid specifications but may reject unusual valid ones."],
    p: ["A datum applied to a feature that is not stable or accessible makes the part impossible to measure repeatably.", "A position tolerance with a missing material-condition modifier is read by the shop differently from what was designed."],
    v: "Add a position tolerance to a hole pattern relative to two datums, then export the data and confirm it contains the characteristic, zone size, modifier and ordered datums attached to the right faces.",
    dep: ["dimensioning","tolerance-stackup","model-based-definition"]
  },
  "model-based-definition": {
    s: "Carries manufacturing information, such as dimensions, tolerances, notes and finishes, directly on the 3D model as product and manufacturing information instead of on a separate drawing.",
    d: "Annotations are attached to model faces and edges in 3D and organized into saved views that orient the model for each note. They are structured data, not pictures, so downstream systems for inspection and machining can read them. They are exported with the geometry in neutral formats that support semantic annotation. The effort lies in completeness and standards: the 3D model alone has to hold everything a drawing would, and receiving systems must interpret annotations the same way.",
    k: ["Annotating the model versus keeping a drawing: model annotation removes duplication and enables automation, but needs downstream systems that can consume it; drawings work with every shop but duplicate the information.", "Strict semantic annotation versus free text notes: semantic is machine-readable but constrains wording; free text is flexible but cannot be automated."],
    p: ["Annotation views that show a note but not its associated face confuse readers when several similar features exist.", "Exporting to a format that does not carry semantic annotation degrades the data to plain graphics, which nobody notices."],
    v: "Annotate a hole with diameter, depth and tolerance in a saved view, export to a neutral file, reopen it in another system, and confirm values and face associations survive and can be read as data.",
    dep: ["gdt-frames","neutral-solid-translators","persistent-naming"]
  },
  "drawing-associativity": {
    s: "The link between a drawing and its source model that makes views, dimensions and tables update when the model changes, and reports when they cannot.",
    d: "Each view stores a reference to its model and each dimension to model entities. When the model rebuilds, views are regenerated, and annotations are reattached by persistent identity; any that cannot be matched are flagged as dangling. Updates can be automatic or manual. The links cross file boundaries, so a drawing has to be opened with a matching model revision. The difficulty is the reattachment: topology can change in an edit, and the matching process uses heuristics that sometimes choose the wrong edge without telling anyone.",
    k: ["Automatic update on every change versus update on request: automatic keeps sheets right but costs time and can re-lay-out a finished sheet; on request is stable but risks stale sheets.", "Strict reattachment (fail when unsure) versus best-guess reattachment: strict creates dangling dimensions to repair; best-guess hides errors."],
    p: ["A drawing opened against the wrong model revision updates silently to different geometry.", "Best-guess reattachment moves a dimension to a neighboring edge, and the printed value is correct for the wrong feature."],
    v: "Release a drawing, change a model dimension in a new revision, and confirm the drawing flags any dangling annotations and shows a different revision stamp rather than silently showing unchecked values.",
    dep: ["persistent-naming","revision-control","regeneration-engine"]
  },
  "tolerance-stackup": {
    s: "Computes how individual part tolerances accumulate across an assembly into variation of a critical gap or dimension, by worst-case, statistical or simulated methods.",
    d: "The analyst defines a measurement chain through contributors, each a dimension with its tolerance and direction. Worst-case adds all tolerances; statistical methods add them in quadrature under assumed distributions; Monte Carlo methods sample actual distributions and 3D geometry. Results give the expected range and each contributor's share. 3D versions place tolerances in assembly context with datums and mate conditions. The difficulty is modeling: choosing the right chain, handling geometric tolerances and mating clearances, and trusting distributions that may not match the factory.",
    k: ["Worst-case versus statistical stack-up: worst-case guarantees fit but forces tight, costly tolerances; statistical allows looser parts but accepts a small rate of misfits.", "One-dimensional chains versus full 3D analysis: 1D is quick and transparent but ignores rotations and form errors; 3D captures them but needs complete geometric tolerance data."],
    p: ["A chain missing one contributor yields a comfortable result that fails on the shop floor.", "Assuming normal distributions centered on nominal when the process is skewed understates the reject rate."],
    v: "Analyze a three-part gap with known tolerances, compare the worst-case result with a hand calculation, and compare the statistical result with a simulation of a hundred thousand random assemblies. Both should agree closely.",
    dep: ["gdt-frames","mate-constraints","fits-and-limits"]
  },
  "fits-and-limits": {
    s: "Standard systems for specifying shaft and hole sizes that give a known clearance or interference, using tolerance grades and fundamental deviations to produce limits.",
    d: "A fit is specified by a basic size, a hole class and a shaft class, such as clearance, transition or interference. The system looks up deviations in tables by size range and grade and derives upper and lower limits, then the minimum and maximum clearance. It integrates with the dimension editors, so a fit code replaces explicit limits. Material and temperature effects are outside the tables. The challenge is selecting the right fit for function and process capability, as tables only state geometry.",
    k: ["Standard fit tables versus custom limits: tables are interchangeable between suppliers but may be wider than needed; custom limits optimize but need agreement with each supplier.", "Hole-basis versus shaft-basis systems: hole-basis suits common drilled-and-reamed holes and tooling; shaft-basis suits using standard shafting but costs more in hole tooling."],
    p: ["An interference fit specified without considering thermal expansion in service loosens in hot operation.", "Mixing units between the fit table and the model gives limits off by a factor of 25.4."],
    v: "Specify a clearance fit on a 25 mm shaft and hole pair, read back the limits and compare minimum and maximum clearance against the published table values. Confirm both match to the micrometer.",
    dep: ["dimensioning","unit-system"]
  },
  "mass-properties": {
    s: "Computes volume, mass, center of gravity and moments of inertia for parts and assemblies from geometry and material density.",
    d: "Volume and moments are integrals over the solid; with a boundary representation they are reduced to surface integrals through the divergence theorem and evaluated numerically with a controlled error. Each body has a density from the material library or an override, and assemblies combine bodies about a common frame. Results feed packaging, balance and simulation. The challenge is accuracy and subtlety: tolerant or overlapping bodies double-count volume, and hollow or lightweight components hide their true mass.",
    k: ["Exact surface integration versus mesh-based approximation: exact is accurate to tolerance but slower on free-form surfaces; mesh is fast but accuracy depends on facet size.", "Computing from the modeled geometry versus entering measured mass: modeled is available early but ignores unmodeled details such as welds and coatings; measured is true but only late."],
    p: ["Overlapping solids in an assembly are counted twice, inflating mass.", "Lightweight-loaded components contribute zero or stored mass depending on settings, giving a different total each session."],
    v: "Compute mass properties for a cylinder, a box and a sphere of known density and confirm each matches the analytic formula. Then assemble them and confirm the combined center of gravity matches the weighted average.",
    dep: ["surface-geometry","numerics","document-model"]
  },
  "interference-check": {
    s: "Finds places where components overlap in volume and measures the clearance where they should not touch, in static position or through motion.",
    d: "The check tests pairs of bodies, using bounding volumes to eliminate most pairs, then exact Boolean intersection or distance calculation for the remainder. It reports interference volumes and minimum distances, and can ignore intended overlaps such as press fits and threads. Dynamic checking repeats the test across a range of motion or at simulated steps. The challenge is combinatorial: n parts have n squared pairs, and tolerance and intentional contact generate many false positives users have to filter.",
    k: ["Exact Boolean interference versus mesh-based overlap detection: exact is reliable at tolerance level but slow; mesh is fast but can miss thin overlaps.", "Checking every pair versus checking against a watch list: all pairs finds surprises but is slow and noisy; a watch list is quick but misses unexpected clashes."],
    p: ["A press fit and a thread flagged as interference bury the one real collision in hundreds of results.", "Checking only the nominal position misses collisions that appear within the tolerance range."],
    v: "Place two blocks overlapping by 0.5 mm and confirm the check reports a volume of the expected size at the right location, then separate by 0.1 mm and confirm the check reports clearance of 0.1 mm.",
    dep: ["spatial-index","boolean-ops","mate-solver"]
  },
  "dfm-checks": {
    s: "Rule-based checks for whether a design can be made by a chosen process, such as minimum wall, draft angles, corner radii, hole depth ratios and bend relief.",
    d: "Rules are defined per process (machining, casting, molding, sheet metal, additive) with thresholds and applied to recognized features or measured geometry. Checks compute wall thickness by probing, draft by comparing face normals with a pull direction, and radii and depths by feature inspection. Results show as colored faces and a list. Rules come from standards and supplier guides, and need tuning. The difficulty is false alarms and missed context: a rule can flag something a skilled shop handles routinely.",
    k: ["Feature-based checks versus pure geometric measurement: feature-based gives precise advice but depends on feature recognition; geometric measurement works on any body but has less context.", "Hard-fail rules versus advisory warnings: hard-fail prevents known problems but frustrates experts; advisory warnings are easier to ignore."],
    p: ["A draft check run against the wrong pull direction flags everything or nothing.", "Rules out of date with the actual supplier's capability create either needless redesign or surprise rejects."],
    v: "Create a molded part with one wall thinner than the rule minimum and one face with zero draft. Run the check and confirm exactly those two regions are highlighted with the specific rule that each violates.",
    dep: ["mass-properties","surface-geometry","tessellation"]
  },
  "inspection-planning": {
    s: "Derives measurement plans from tolerances on the model, selecting what to measure, with which datums and probe or scan strategy, and compares results to nominal.",
    d: "Tolerances on the model identify characteristics to measure. The planner orders datum establishment and then chooses measurement points or scan regions on faces, computing probe approach and avoiding collisions. Measured results from the measuring machine or scanner are aligned to the model by datum alignment or best fit and compared, producing deviation colors and pass or fail. The difficulty lies in datum handling: measured data must be aligned exactly as the standard defines, or results differ from the specified intent.",
    k: ["Datum-based alignment versus best-fit alignment: datum-based follows the drawing's intent and is the legally meaningful result; best-fit minimizes error overall and can hide a datum problem.", "Dense scanning versus sparse probing: scanning shows the whole surface but produces large data and noise; probing is exact at points but misses between them."],
    p: ["Aligning measured data by best fit hides a part that is out of tolerance relative to its datums.", "Missing a collision check lets the probe path hit a fixture or the part."],
    v: "Inspect a part with a deliberate 0.2 mm offset on one hole. The report should show that hole outside its position tolerance relative to the datums while the best-fit alignment alone would show it nearly in tolerance.",
    dep: ["gdt-frames","model-based-definition","point-classification"]
  },
  "defeaturing": {
    s: "Simplifies a model for analysis or sharing by removing small features such as fillets, holes, logos and threads, or by replacing solids with surfaces or beams.",
    d: "Rules select features below a size threshold and remove them, then the kernel heals the surrounding faces. Idealization goes further: thin solids become mid-surfaces with thickness, long slender parts become line elements, and symmetric models are cut to a fraction. The simplified model must remain linked to the original for update. The challenge is judgment, since a tiny fillet at a stress concentration matters more than a large flat face, and removal that is automatic cannot know where the loads concentrate.",
    k: ["Rule-based automatic removal versus engineer-chosen removal: automatic is fast and repeatable but ignores physics; chosen is accurate but time-consuming and varies by person.", "Defeaturing in the CAD model versus in the mesh: CAD defeaturing keeps clean geometry and links to the source; mesh-level cleanup is quicker but loses editing."],
    p: ["Removing a fillet at a stress concentration produces an analysis that understates peak stress.", "Idealized mid-surfaces drift out of sync with the solid when the design changes."],
    v: "Defeature a part by removing every fillet smaller than 2 mm and confirm the result is a valid solid, the volume change matches the removed volume within a small error, and larger fillets are untouched.",
    dep: ["healing-sewing","feature-tree","validity-checking"]
  },
  "mesh-handoff": {
    s: "Passes geometry to a meshing tool or solver as clean surfaces or solids with named regions, so elements can be generated and results mapped back.",
    d: "The exported geometry carries faces, edges and groups identifying regions for loads, contacts and materials. Meshing requires watertight, non-overlapping bodies with sensible size control. Some systems embed a mesher; others pass geometry through a neutral file or a live link with name-based region mapping. Round-trip keeps the mesh aligned to the geometry after edits. The challenge is that named regions rely on stable identity, and an edit that renumbers faces breaks the mapping, forcing the analyst to reassign boundary conditions.",
    k: ["Live link versus file export: live link keeps regions in sync but ties the tools together; files are portable but lose association with each design change.", "Handing over solids versus surfaces: solids are simpler to mesh in 3D but include details; surfaces suit thin structures but need extra thickness data."],
    p: ["Tiny sliver faces or gaps produce poor elements or a failed mesh.", "A design change renames faces, and loads silently apply to the wrong regions."],
    v: "Export a bracket with named load and fixed faces, mesh it in the solver, change a hole position in CAD, re-export and confirm loads and constraints are re-applied to the same functional faces automatically.",
    dep: ["defeaturing","persistent-naming","neutral-solid-translators"]
  },
  "load-mapping": {
    s: "Transfers loads, constraints, contact definitions and materials from the CAD context to simulation setup, including forces derived from assembly motion.",
    d: "Setup information, such as fixed faces, pressures, bolt preloads, material assignments and contact pairs, may come from assembly mates (a revolute joint implies a pin constraint), from annotation or from the analyst. Loads from a motion study can be mapped to a structural model at chosen instants. The mapping is done by reference to model entities, so it must be stable. The difficulty is semantic gaps: a CAD mate has no stiffness or friction, and a solver needs these values the CAD data does not hold.",
    k: ["Deriving constraints from mates versus defining them separately: derived saves effort and stays consistent but encodes assumptions, such as rigid joints; separate is explicit but laborious.", "Mapping loads at one worst instant versus many time steps: one instant is fast but may miss the true worst case; many steps are thorough and costly."],
    p: ["A bolted joint derived from a mate becomes fully rigid, and the model is far stiffer than reality.", "Units of force or pressure get misread at transfer, giving results off by orders of magnitude."],
    v: "Map a known 1000 N load onto a face and confirm the solver's reported reaction force at the fixed face sums to 1000 N, with the direction and location matching the CAD definition.",
    dep: ["mesh-handoff","mate-constraints","unit-mapping"]
  },
  "motion-simulation": {
    s: "Simulates how an assembly moves under drivers and forces, giving positions, velocities, accelerations, reaction forces and swept volumes.",
    d: "The assembly's mates are converted to joints, giving a multibody system with coordinates for each rigid body. Kinematic mode drives a joint through a path and solves positions. Dynamic mode adds mass properties, forces, springs and friction and integrates the equations of motion over time. Results include interference during motion and loads for structural analysis. The hard parts are redundant constraints that make the system unsolvable, stiff equations needing small steps and contact modeling.",
    k: ["Rigid-body dynamics versus flexible-body coupling: rigid is quick and adequate for most mechanisms; flexible captures deformation effects but needs finite element data.", "Constraint-based joint formulation versus reduced coordinates: constraint-based is general but accumulates drift; reduced coordinates are stable but harder for loops."],
    p: ["Redundant mates over-constrain the mechanism, so the solver fails or gives enormous forces.", "A time step too large lets a fast contact pass through another body without detection."],
    v: "Simulate a four-bar linkage driven at constant speed. Check that the output angle against a closed-form solution at ten positions, and that the joint reaction forces balance on a static case.",
    dep: ["mate-constraints","mass-properties","mate-solver"]
  },
  "toolpath-handoff": {
    s: "Prepares part geometry, stock, fixtures and machining features for computer-aided manufacturing, either inside or through a link to a separate tool.",
    d: "The manufacturing side needs the finished part, the raw stock, setups with work coordinates and the set of machinable features. A link keeps the toolpaths associated with the geometry so a model change flags or updates the affected operations. Recognition of holes, pockets and bosses from the model reduces programming effort. The challenge is associativity: toolpaths reference faces and edges, and a change that alters topology either breaks them or quietly regenerates incorrect paths.",
    k: ["Associative toolpaths versus one-way export: associative keeps operations current but needs stable references; one-way export is robust but means reprogramming on each change.", "Feature recognition versus manual selection: recognition speeds up simple parts but misreads unusual geometry; manual is slow but certain."],
    p: ["A design change moves a pocket and the old toolpath cuts air or gouges the part.", "Stock model and part model with different origins offset the program."],
    v: "Generate a toolpath for a pocket, change the pocket depth in CAD, and confirm the operation is flagged as out of date and the regenerated path reaches the new floor depth with no remaining stock.",
    dep: ["neutral-solid-translators","persistent-naming","validity-checking"]
  },
  "additive-export": {
    s: "Prepares a model for 3D printing: orientation, support structures, slicing and export in a printable format that carries units, color and materials.",
    d: "The geometry is checked for watertightness and minimum feature size, oriented for strength and support, then sliced into layers. Some formats carry a triangle mesh with units, color and multiple materials; others pass layer data directly. Lattices and variable-density infill are built in the kernel or as implicit fields. The challenge is that print success depends on process physics that the geometry cannot show, such as overhang limits, distortion and shrinkage, and a valid file may still fail to print.",
    k: ["Exporting a mesh versus sending the exact model with print metadata: mesh is universally accepted but loses curves precision; exact with metadata keeps more but needs a receiving tool that understands it.", "Support generation in CAD versus in the slicer: in CAD it is part of the design record; in the slicer it is tuned to the machine."],
    p: ["A non-manifold edge in the exported mesh makes the slicer drop or fill regions incorrectly.", "Mixing millimeter and inch units makes a part print 25 times too large or small."],
    v: "Export a part with a thin wall to the print format, reload it, and confirm it is watertight, units are correct, the bounding box matches the CAD model within tolerance, and the thin wall is flagged.",
    dep: ["mesh-export","tessellation","validity-checking"]
  },
  "design-studies": {
    s: "Runs a model repeatedly across ranges of parameters, evaluating results such as mass, stress or clearance, to explore options or optimize.",
    d: "A study defines input parameters with ranges, outputs to measure, and a sampling plan, such as a grid, random sampling or designed experiment. Each run edits parameters, rebuilds the model, and calls analysis. Optimizers use results to choose the next point to meet constraints and objectives. Runs can be distributed in parallel. The challenge is robustness: a rebuild fails at some parameter combinations, and each failure has to be recognized as invalid instead of being treated as a result.",
    k: ["Rebuilding the full model per sample versus using surrogate models: rebuilds are exact but slow; surrogates are fast to query but have fit error that grows away from sampled points.", "Gradient-based optimizers versus sampling-based: gradient converges quickly but needs smooth responses; sampling copes with failures and noise at greater cost."],
    p: ["A rebuild that fails at some parameter values returns a stale result from the previous run, which the optimizer treats as valid.", "A study over parameters that interact through equations changes more than intended."],
    v: "Sweep a rib thickness from 1 to 5 mm in five steps, record mass for each, and confirm mass rises linearly with thickness as expected, with every point rebuilt successfully and logged.",
    dep: ["parameters-equations","regeneration-engine","parallel-rebuild"]
  },
  "neutral-solid-translators": {
    s: "Read and write standardized neutral formats, such as STEP and IGES, to move solids, surfaces, assemblies and annotations between different systems.",
    d: "An export maps the internal boundary representation, assembly structure, colors, names and optionally product annotations to the standard's entity model, which is defined by application protocols. An import reads this back, creating topology and geometry, sometimes after healing. The formats carry exact geometry but not history or constraints. The challenge is interpretation: the standard is broad, different systems use different subsets and tolerances, and geometry that is valid in one kernel can be invalid in another.",
    k: ["Exporting exact geometry versus a mesh: exact preserves precision and edits but is sensitive to kernel differences; mesh is robust but cannot be machined or dimensioned accurately.", "Strict standard compliance versus pragmatic dialects: strict is interoperable in theory; dialects work with the dominant partner systems in practice."],
    p: ["Surfaces that cross over small gaps on export arrive as unstitched sheets, not solids.", "Assembly structure arrives flattened, losing subassemblies and part names."],
    v: "Export an assembly, import it into a second system, and compare volume, surface area, bounding box and component count to the original. Differences should fall within the stated tolerance.",
    dep: ["surface-geometry","topology-graph","import-healing"]
  },
  "native-importers": {
    s: "Read the proprietary file formats of other CAD systems, often via licensed libraries, preserving more than neutral files, such as features, colors and sometimes history.",
    d: "An importer parses the other system's binary format, mapping its entities and kernel data into the host's structures. Where the source kernel is the same family, geometry transfers directly; otherwise it is converted. Some importers recover features by recognition, and parametric history is rarely portable. The challenge is that formats change with every release, and the importer must keep up with versions it has no control over, and handle files from newer or older versions.",
    k: ["Direct native readers versus neutral files only: direct preserves more data but needs ongoing maintenance as formats change; neutral files are stable but lossy.", "Recognizing features after import versus keeping a dumb solid: recognition restores editability but can mis-identify; a dumb solid is faithful but hard to modify."],
    p: ["A new release of the source system changes the format, and the importer rejects or misreads new files.", "Imported colors and names come in under the wrong component after assembly restructuring."],
    v: "Import a set of fifty files from another system, including different versions, and confirm each loads, has the correct volume against its source, and that failures are reported with a specific reason.",
    dep: ["import-healing","document-model","topology-graph"]
  },
  "mesh-export": {
    s: "Writes faceted representations, such as STL, OBJ or 3MF, with controlled tessellation quality, units and optional color and material data.",
    d: "The exporter tessellates each face to a tolerance, joins triangles across shared edges to form a watertight mesh and writes them in the chosen format. Parameters control chordal deviation and angular tolerance. Newer formats add units, multiple bodies and materials. The mesh is final geometry for printing, rendering and games, but is not editable as design geometry. The challenge is matching tolerance to purpose: too coarse and curves look faceted, too fine and files become enormous.",
    k: ["Fine tolerance versus coarse: fine is accurate and smooth but gives very large files; coarse is small but shows facets and loses precision for downstream measurement.", "Binary formats versus text formats: binary is compact and quick; text is readable and debuggable but several times larger."],
    p: ["Cracks between faces tessellated independently leave a mesh that is not watertight.", "A format with no unit field leaves the receiver guessing units."],
    v: "Export a sphere at a chord tolerance of 0.01 mm, reload it and confirm the maximum distance from the true sphere is at most 0.01 mm and that every edge is shared by exactly two triangles.",
    dep: ["tessellation","unit-mapping"]
  },
  "lightweight-view-formats": {
    s: "Compact visualization formats that carry display geometry, structure and annotation for viewing and review, but not exact editable models.",
    d: "These formats store tessellated geometry, assembly hierarchy, metadata and sometimes measurement-grade edges and annotations, compressed for fast download. Viewers on phones, browsers and tablets use them. Some retain a link to the exact geometry for precise measurements. They are produced by a translator from the native model. The challenge is balance: enough fidelity for review and measurement, small enough for network use, and with intellectual property protection by hiding exact geometry.",
    k: ["Mesh-only versus mesh with exact-geometry link: mesh-only is smallest and safest to share; the link supports exact measurement but exposes more of the design.", "Prebuilt on release versus generated on demand: prebuilt is fast to open but can be stale; on demand is current but adds delay."],
    p: ["A stale lightweight copy shows an old revision while the native model has moved on.", "Overly aggressive compression visibly distorts small features that reviewers care about."],
    v: "Generate the lightweight file for a released assembly, open it in the viewer, and confirm structure, part names, and a measured hole spacing match the native model within the stated tolerance.",
    dep: ["tessellation","mesh-export","assembly-structure"]
  },
  "import-healing": {
    s: "Repairs geometry that arrives from other systems: closing gaps, stitching faces into shells, fixing bad edges and removing sliver faces, so the result is a valid solid.",
    d: "Imported surfaces often meet within a different tolerance than the receiving kernel requires. Healing finds gaps and overlaps, adjusts edge tolerances, merges nearly coincident vertices, stitches sheets into shells, and checks orientation and closure. It may replace invalid curves with approximations. Success is tested with the kernel's validity check. The challenge is that every repair moves geometry, so the fix changes the part: loosening tolerance until the gap closes can merge features that should stay separate.",
    k: ["Raising tolerance until it stitches versus rebuilding bad faces: raising is automatic and quick but distorts small features; rebuilding preserves intent but needs manual work.", "Silent automatic healing versus a report of every change: silent is convenient; a report lets engineers see what moved and judge it."],
    p: ["A healing pass closes a gap between two intended-separate bodies and merges them.", "A solid that passes validity but has a flipped face orientation computes negative volume."],
    v: "Import a file with a known 0.05 mm gap between two faces, run healing, and confirm the result is a closed solid with the expected volume, with the report naming the repaired edge and the size of the change.",
    dep: ["healing-sewing","tolerant-modeling","validity-checking"]
  },
  "unit-mapping": {
    s: "Converts units and precision between systems at the file boundary, and between internal units and displayed units, without silent scale errors.",
    d: "Each file declares length units, and often a tolerance. On import the mapper scales geometry, parameters and tolerances into the document's unit system, and on export writes the declared unit. Internal storage is usually in one fixed unit with display conversions on top. Defaults, such as assuming millimeters when no unit is declared, are the main source of errors. The challenge is that scale also affects tolerance: a model designed in meters has a different absolute precision from one in micrometers.",
    k: ["Converting on import versus keeping the source unit internally: converting makes everything uniform but can lose precision; keeping the source unit avoids rounding but complicates mixing documents.", "Assuming a default unit when missing versus refusing the file: default is convenient and sometimes wrong; refusing is safe but irritates."],
    p: ["A file with no declared unit is read as millimeters though it was inches, and the part is 25 times too small.", "Precision tolerances scaled with geometry become too loose or too tight in the new unit."],
    v: "Export a 100 mm bar to a file declaring inches, import it back, and confirm length is 100 mm within the kernel's resolution. Import a file with no unit and confirm the application asks or warns.",
    dep: ["unit-system","tolerant-modeling"]
  },
  "reference-remapping": {
    s: "Rewrites the references between files, such as an assembly's links to parts, when files are renamed, moved, copied or received from another site.",
    d: "Documents refer to each other by path, name or unique identifier. When files change location, remapping looks them up by the best available key, applies a user-supplied search path or mapping table, and updates stored references. Copy-with-references operations produce a consistent renamed set. The vault supplies identifiers that survive renames. The challenge is ambiguity: two files with the same name in different folders, or a part that exists in several revisions, must be matched to the right one, and wrong matches silently load the wrong geometry.",
    k: ["Path-based references versus identifier-based: paths are simple and human-readable but break on moves; identifiers survive moves but need a registry to resolve.", "Automatic search of folders versus explicit mapping: search is convenient but may pick the wrong same-named file; explicit mapping is safe but tedious."],
    p: ["A name collision loads a part from an old project folder into a new assembly.", "Copying an assembly without its references leaves the copy still editing the original parts."],
    v: "Copy an assembly with references to a new folder under new names, open it, and confirm every component resolves to the copy, and that editing the copy leaves the originals byte-identical.",
    dep: ["vault-checkout","native-file-format","assembly-structure"]
  },
});
