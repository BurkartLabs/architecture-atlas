// Details for the mechanical CAD plate, part 6: cross-cutting concerns.
ATLAS.details("mechanical-cad", {
  "persistent-identity": {
    s: "How every face, edge, feature and component keeps a stable name across rebuilds, edits, file saves and exchange, so that references made yesterday still find the right thing today.",
    d: "Dimensions, mates, drawings, loads, toolpaths and comments all refer to geometry that the kernel recreates on every rebuild. Identity has to be designed in layers: the kernel records how entities derive from each other, the history engine maps old to new, the assembly layer names instances by path, and the data layer gives files stable identifiers. Every consumer needs a policy for lost or ambiguous references. No scheme is complete, so the visible behavior on failure matters as much as the scheme.",
    k: ["Identity from creation history versus identity from geometric matching: history is precise but fragile to restructuring; matching survives restructuring but can attach to look-alikes.", "Failing visibly on ambiguity versus repairing silently: visible failure protects correctness and costs time; silent repair keeps work moving and risks wrong attachments."],
    p: ["A reference quietly re-attaches to a neighboring face after an edit and downstream documents pass review with wrong data.", "Identity lost through neutral file exchange forces every downstream tool to re-pick its references."],
    v: "Make a set of references of each kind, run a scripted series of one hundred edits including ones that split and merge faces, and confirm each reference either follows its intended geometry or is flagged as lost, never attached to the wrong one.",
    dep: []
  },
  "numerical-tolerance": {
    s: "The conventions for how close two numbers or two points must be to count as the same, and how that error is tracked through chains of operations and across file boundaries.",
    d: "Floating point gives limited precision, real parts range over many scales, and imported data carries its producer's gaps. A system picks a resolution for lengths and angles, scales it with model size, and lets individual edges record their own error. Every operation has to decide whether near-coincident things are equal. These choices determine whether Booleans succeed, whether imports become solids, and whether exported files are accepted elsewhere. The tolerance must be consistent between kernel, sketch solver, display and exchange, or components disagree about the same geometry.",
    k: ["One global tolerance versus per-entity tolerances: global is predictable and simple; per-entity absorbs imperfect data but lets error grow unnoticed.", "Tolerance fixed in absolute units versus scaled to the model: fixed is easy to explain; scaled works for very large and very small parts but makes results size-dependent."],
    p: ["Two components using different tolerance values judge the same pair of edges as coincident and as separate, leaving a crack.", "Repeated operations let local tolerances grow until a small feature disappears."],
    v: "Run a corpus of models at three scales through a standard sequence of operations. Every result should remain valid, with maximum recorded tolerance below a stated bound, and scaling a model by a factor should scale results consistently.",
    dep: []
  },
  "rebuild-determinism": {
    s: "The guarantee that the same recipe and inputs give the same geometry and the same entity identities every time, on any machine, thread count and session.",
    d: "A history-based model is a program that is rerun constantly, and everything downstream assumes the output is stable. That demands deterministic ordering of entities, deterministic handling of ties in solvers, and parallel work that merges in a fixed order. Floating-point differences between processors or library versions can flip a decision at a threshold, and then identities downstream change. Determinism is tested by rebuilding in different environments and comparing. When the kernel or solver is upgraded, intended differences have to be separated from accidental ones.",
    k: ["Deterministic results regardless of thread count versus maximum parallel speed: deterministic merging costs some waiting but keeps identities stable; free ordering is faster and unpredictable.", "Bit-exact reproducibility versus tolerance-level equivalence: bit-exact is strict and often unachievable across platforms; tolerance equivalence is practical but needs identity rules that survive tiny differences."],
    p: ["A kernel upgrade shifts one numerical tie-break and a decade-old model rebuilds with a different face order, detaching references.", "A race in a cache gives different entity ids on alternating runs."],
    v: "Rebuild a corpus of models on different machines with different thread counts and compare entity counts, identities, volumes and mass properties. All must match, and any differences between software versions are listed and explained.",
    dep: []
  },
  "design-intent": {
    s: "The relationships a designer means a model to keep when it changes, such as centered, equal, tangent or proportional, as opposed to the particular dimensions it happens to have now.",
    d: "Intent is expressed through how the model is built: which sketch constraints are used, which dimensions drive, how features reference each other, what the parameters and equations say, and how assemblies are mated and structured. Two models with identical geometry can respond to the same edit in opposite ways because their intent differs. Intent is never stored explicitly; it is implied by the recipe. A good system makes it visible, protects it from accidental edits, and survives exchange as far as possible.",
    k: ["Capturing intent through constraints and references versus keeping plain geometry: capture lets models update correctly but demands skill and discipline; plain geometry is simple but every change is manual.", "Rigid models that resist change versus flexible ones: rigid models keep their relationships but are costly to reorganize; flexible ones are easy to change and easy to break."],
    p: ["A model dimensioned in drawing order, not function order, moves unintended features when one value changes.", "Intent lost in exchange leaves a supplier with geometry that cannot be updated consistently."],
    v: "Change each driving parameter of a reference model in turn, and confirm the geometry responds as the original designer specified, with related features moving together and unrelated ones staying fixed.",
    dep: []
  },
  "associativity": {
    s: "The links that make derived objects, such as drawings, simulations, toolpaths and bills of material, follow changes to the model they were made from.",
    d: "Many outputs are computed from the model and then enriched by people: dimensions are added to drawing views, loads are applied to meshes, operations to toolpaths. Associativity connects that enrichment to the source by references, so a change flows through. Each link has to decide what to do when the source changes: update, flag, or break. The scheme depends on persistent identity, revision control and clear ownership of which file is the source. Without it, every change means manual rework or silent staleness.",
    k: ["Live associative links versus one-way snapshots: live keeps outputs current but couples the tools and the files; snapshots are independent and go stale.", "Automatic update versus flag-and-review: automatic saves effort but can change released documents; flag-and-review is safer and adds steps."],
    p: ["A snapshot taken for an analysis is assumed current months later and the design has moved on.", "A live link into a released drawing changes it when the model is edited, without a new revision."],
    v: "Change a hole position in the model and confirm the drawing, bill of materials, simulation setup and toolpath each either update to the new position or are explicitly flagged out of date.",
    dep: []
  },
  "scale-limits": {
    s: "The sizes at which the design stops working: parts with thousands of features, assemblies with hundreds of thousands of components, and projects with many files and many simultaneous users.",
    d: "Every algorithm has a growth curve. Rebuild time grows with history length, mate solving with constraint count, interference checking with component pairs, and opening time with file count and network latency. Large systems therefore work by not doing things: loading partially, rebuilding only what changed, caching derived data and dividing the design into independent pieces. These limits shape the data model, the file structure, and how teams divide a product, and they have to be planned for before the model is large.",
    k: ["Splitting a product into many small independent files versus few large ones: small files load and rebuild selectively and allow parallel work but multiply references; large files are simple but hit limits.", "Working with approximations such as lightweight or envelope models versus exact data everywhere: approximations stay responsive but risk wrong answers; exact is correct and slow."],
    p: ["A history that grows without cleanup reaches thousands of features and every edit takes minutes.", "A calculation that silently skips unloaded components gives a wrong result with no warning on large assemblies."],
    v: "Scale a test assembly from one hundred to one hundred thousand components and plot open time, rebuild time, memory and frame rate. Each should grow no faster than the stated target, and any approximation in use should be visible in results.",
    dep: []
  },
});
