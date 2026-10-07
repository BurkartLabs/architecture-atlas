// Details for the PCB design plate, part 4: BOM and sourcing, 3D and mechanical, database and kernel, cross-cutting concerns.
ATLAS.details("pcb-design", {
  "bom-generator": {
    s: "Produces the bill of materials: parts grouped by value and footprint with quantities, designators and manufacturer part numbers, in the columns purchasing and assembly need.",
    d: "The generator reads the design's parts, groups those with identical attributes, counts them, lists their designators and fills in columns for part numbers, descriptions and supplier references. Output goes to spreadsheet-like files or a structured format. Grouping rules decide what counts as the same part. Not-fitted parts and variants are applied. It is hard because attributes are free text: a value written two ways makes two lines for one part, and a missing part number is only noticed when someone tries to buy it.",
    k: ["Grouping by exact attribute match vs by normalized values: exact matching is predictable, but normalization merges equivalent writings and reduces purchasing mistakes.", "Generating from the schematic vs from the board: the schematic carries every part including those without footprints, whereas the board only reflects what will be placed."],
    p: ["Parts with the same value but different tolerance or voltage rating are merged into one line.", "Mechanical parts and test points missing a symbol never reach the bill of materials."],
    v: "Generate the bill of materials and count total designators against parts placed on the board; confirm every line has a manufacturer part number and the sum of quantities equals the total.",
    dep: ["design-variants", "component-database", "annotation"]
  },
  "variant-boms": {
    s: "Generates a distinct bill of materials for each product variant, listing only fitted parts and their variant-specific values or alternates.",
    d: "Each variant selects a set of fitted states and substitutions, and the BOM generator is run once per variant, optionally with a base list of common parts and a delta per variant. Output for each variant ties to its assembly files. Release management names variants and revisions together. It is hard because purchasing wants consolidated quantities across variants while assembly wants per-variant lists, and both must come from the same data without being edited by hand.",
    k: ["One master list with variant columns vs separate lists per variant: purchasing sees combined demand in one place, assembly needs filtered lists derived from it.", "Variants defined in the design vs in the product system: the design is the source of truth for electrical configuration, while a product system suits configuration across many products."],
    p: ["An assembler is sent the master list for a variant and fits parts that should be omitted.", "A part substituted in one variant is missing from the combined purchasing quantity."],
    v: "Generate lists for two variants, then verify each against the schematic's fitted states and confirm the combined quantities equal the sum of both lists.",
    dep: ["bom-generator", "design-variants"]
  },
  "supplier-data": {
    s: "Pulls pricing, stock, lead time and packaging for each part from supplier catalogs and attaches it to bill of materials lines.",
    d: "The tool queries supplier interfaces or aggregators by manufacturer part number, receives offers with quantity breaks, stock and lead time, and caches them with a timestamp. The results appear next to parts, in the library and on the bill of materials, and feed cost estimates. Credentials and rate limits control access. It is hard because the data is time-dependent and noisy: matching on part numbers can pick the wrong package or reel size, and a displayed price is only an estimate of what a purchase will cost.",
    k: ["Live queries vs cached data: current prices and stock, but slow and dependent on connectivity; caching is fast but can go stale.", "Matching by manufacturer part number vs by supplier number: manufacturer numbers are unambiguous across suppliers, but supplier numbers identify exact packaging."],
    p: ["Stock from a stale cache leads to approving a design that cannot be built because the part is unavailable.", "Matching a part number to a similar one with a different suffix gives a different package."],
    v: "Pick a sample of parts, compare the tool's displayed stock and price breaks with the supplier's live site at the same time, and confirm the manufacturer part numbers match exactly.",
    dep: ["component-database", "bom-generator"]
  },
  "lifecycle-checks": {
    s: "Flags parts that are obsolete, not recommended for new designs, in short supply or with long lead times, before a design is committed to them.",
    d: "Part lifecycle data from manufacturers and aggregators gives each part a status, end-of-life dates and sometimes a risk score. The check runs on the bill of materials and on library selections, and lists parts at risk with the severity. It can also flag single sources. It is hard because status data is incomplete and slow to update, and the risk depends on volume and horizon: a part fine for a prototype run may be a serious risk for a product that lives fifteen years.",
    k: ["Checking at library selection time vs at release: early warning prevents late redesign, but data changes by release time so a final check is still needed.", "Hard block on obsolete parts vs warning: protects against bad choices, but restricting low-volume or legacy repair work is unrealistic."],
    p: ["A part marked active in the library is obsolete in the supplier data, and the design is released with it.", "Single-source parts pass because only stock, not sourcing, is checked."],
    v: "Run the check on a bill of materials with a known end-of-life part and confirm it is flagged with its status date, and that a part with plentiful alternate sources is shown as such.",
    dep: ["supplier-data", "bom-generator", "component-database"]
  },
  "approved-alternates": {
    s: "Keeps a list of second-source and substitute parts that are verified to work in place of a primary part, and shows them on the bill of materials.",
    d: "Each part row can list alternates with their manufacturer part numbers, with notes about differences and an approval status. Purchasing can substitute at buy time from the list, and the bill of materials lists them for the assembler. Alternates are approved by engineering after checking footprint, ratings and electrical behavior. It is hard because alternates are not always equal: package height, thermal behavior or a subtle timing difference makes one acceptable in one design and not in another, so approvals must be scoped.",
    k: ["Alternates attached per part vs per design: reusable across designs, but a part acceptable in one design can fail in another.", "Open alternates list vs strictly approved list: flexible buying under shortage, but unchecked parts can enter production."],
    p: ["An alternate with different footprint tolerance fits the land pattern but is not soldered reliably.", "Approvals recorded in email never reach the data, and purchasing buys a nonequivalent part."],
    v: "Select an alternate on the bill of materials, check its footprint, ratings and pin out against the primary, and confirm the tool shows the approval status and the design it was approved for.",
    dep: ["component-database", "bom-generator", "lifecycle-checks"]
  },
  "plm-export": {
    s: "Sends the bill of materials, revisions and released outputs to a company product lifecycle or resource planning system, in its data format.",
    d: "The export maps design items to product records: assemblies, parts, quantities and documents, with revision numbers and release status. It can be file-based or service-based, and often creates new part records when none exist. Release in the design tool triggers creation of a controlled revision. It is hard because the two systems model things differently: the design tool thinks in designators and variants, the product system in item hierarchies and effectivity, and failed or partial imports leave the two systems out of agreement.",
    k: ["Design tool pushes to the product system vs the product system pulls: the push keeps release timing under the designer's control, whereas a pull enforces the product system's rules.", "One-way export vs two-way sync: simpler and clear ownership, but part data changed in the product system does not return to the design."],
    p: ["Partial import of a release creates a bill of materials that is missing a few parts without any error.", "Revision numbers in the design differ from those in the product system, so purchasing orders the wrong version."],
    v: "Release a design, then open the resulting product record and compare each line, quantity and revision against the design's bill of materials and confirm they are identical.",
    dep: ["bom-generator", "variant-boms", "revision-control-integration"]
  },
  "board-3d-viewer": {
    s: "Renders the board and its parts in three dimensions, with realistic colors for mask, copper and silkscreen, for visual checks and presentation.",
    d: "The viewer builds a model from the stackup, outline, copper, drill and mask data, and places each part's 3D model at its position, rotation and side. Users orbit, section and hide layers, and render images. It reads the same design database as the editors and updates as the board changes. It is hard because of scale: building solid geometry for every pad, track and pour on a large board is expensive, so the viewer uses simplified shapes or caches, and the picture must still be faithful enough to catch missing models and wrong orientation.",
    k: ["Real-time rasterized view vs ray-traced rendering: interactive at all times, but ray tracing gives images for documents and presentations.", "Geometry built from the full copper data vs textures from the layer images: textures are fast and small, but give less accurate edges and no solid sections."],
    p: ["A part with no 3D model is simply absent in the view, and its absence is not noticed.", "Models flipped for the bottom side appear upside down on real boards."],
    v: "Open the viewer and verify every placed part appears, bottom-side parts are mirrored correctly and polarity marks point the same way as in the assembly drawing.",
    dep: ["model-3d-library", "model-alignment", "rendering-backend", "layer-stackup"]
  },
  "model-alignment": {
    s: "Adjusts the position, rotation and scale of a 3D model relative to its footprint so that body and leads sit exactly on the pads.",
    d: "Each footprint has stored offsets for its model: translation in three axes, rotation and scale. Tools can align by picking pad and lead points, or by snapping origins. Alignment is saved in the library so every placement of the part is correct, and per-placement overrides handle special cases. It is hard because sources disagree on origin and axis conventions, so the same model needs different offsets for each footprint, and errors are visible only in three dimensions.",
    k: ["Offsets stored with the footprint vs with the model: each footprint stays independent, but a library with many footprints of one model must repeat alignment.", "Manual alignment vs automatic fitting to pads: control and no surprises, but automatic fitting scales to large libraries."],
    p: ["A model rotated a quarter turn about its own axis looks plausible but has its leads on wrong pads.", "Scaling units from inches to millimeters shrinks or grows the model by a factor that is not noticed on small parts."],
    v: "View the footprint with pads and model overlaid from above and the side, confirming leads meet pads and the model height matches the datasheet.",
    dep: ["model-3d-library", "footprint-library", "geometry-kernel"]
  },
  "solid-model-exchange": {
    s: "Writes and reads the board and its parts as a solid model in a neutral exchange standard that mechanical design tools can open.",
    d: "Export builds a solid assembly: board body with holes and cutouts, copper optionally, and each part's model positioned, with reference designators as names. Import brings in the outline, mounting holes and keepouts from mechanical design. Options control detail, such as whether to include copper, and whether parts are merged into one body. It is hard because file size and fidelity trade off, and because conversions of curved geometry and units differ between tools, so a model that looks right in one viewer shows gaps or wrong scale in another.",
    k: ["Detailed export with copper and every part vs simplified body: enables exact fit and cooling studies, but produces very large files that slow mechanical assemblies.", "Exporting as an assembly with named parts vs a single fused solid: preserves identity for updates and bills of materials, but needs more memory."],
    p: ["Millimeter and inch confusion produces a board that is twenty-five times too large in the enclosure model.", "Fusing all parts removes the ability to identify which part collides."],
    v: "Export the model, open it in a mechanical tool and measure the board dimensions, mounting hole positions and a tall part's height, confirming they match the board database.",
    dep: ["board-3d-viewer", "model-alignment", "board-outline"]
  },
  "collision-check": {
    s: "Tests the three-dimensional board assembly for interference between parts, between parts and the enclosure, and for height limits, before enclosures are made.",
    d: "The check intersects solid models of parts, connectors, mounting hardware and the enclosure shell, optionally with clearance margins, and lists the collisions with the objects involved and the penetration depth. Height keepout regions can enforce limits by area. Some checks run live while placing parts. It is hard because of model fidelity: simplified bodies miss lead and latch geometry, and detailed models are slow, so the check is limited by how good the model library is.",
    k: ["Checking in the PCB tool vs in the mechanical tool: early and live feedback during placement, while the mechanical tool has the true enclosure.", "Margin added to every body vs exact geometry: allows for tolerances in assembly, but may flag collisions that cannot occur."],
    p: ["A connector's mating plug is not part of the model, so interference with the cable shell is missed.", "Height limits applied to the board but ignoring the second side collide with the enclosure."],
    v: "Move a tall part under the enclosure's height limit, confirm a collision is reported, then move it away and confirm the report clears; check one case against a physical fit.",
    dep: ["board-3d-viewer", "model-3d-library", "mcad-sync", "keepout-regions"]
  },
  "mcad-sync": {
    s: "Keeps the board outline, mounting holes and part positions in step with the mechanical model through incremental exchange of changes in both directions.",
    d: "A sync tool tracks the objects that both disciplines care about: the outline, holes, connectors and large parts. When either side changes one, the tool produces a change set that the other side can review and accept, using identity for each object. Positions are exchanged in a common coordinate system. It is hard because changes cross a different object model each way and ownership must be clear: an outline moved on both sides at once is a conflict, and a change accepted blindly can invalidate routing.",
    k: ["Incremental change sets vs full re-export: smaller reviewable updates and clear history, but needing stable identity on both sides.", "Mechanical side owns the outline vs electrical side owns it: a single owner avoids conflicts, but the owner may not know the electrical consequences."],
    p: ["Accepting an outline change that moves a connector leaves routed tracks pointing at the old position.", "Coordinate system origin differs between tools, and every exchanged position is shifted."],
    v: "Move a connector in the mechanical model, accept the change in the PCB tool, and confirm the footprint moved the same distance and ratsnest lines updated, with an audit entry recording the change.",
    dep: ["solid-model-exchange", "board-outline", "object-model"]
  },
  "flex-folding": {
    s: "Models how a flexible or rigid-flex board bends and folds in an assembly, with bend radii, angles and the flat pattern, for fit and manufacturing checks.",
    d: "The model defines bend lines, radii and angles in the flexible zones and produces both the flat shape for fabrication and the folded 3D shape for fit. Bend radius limits are derived from the flex thickness and copper type. Routing rules in bends and part placement near them are checked against it. It is hard because geometry changes between the flat and folded states: lengths along a bend differ with the neutral axis, and fitting a folded board into an enclosure needs the same data in both pictures.",
    k: ["Parametric folds with angle and radius vs a static mechanical model: edit and re-evaluate fits quickly, but the model must handle constraints such as minimum bend radius.", "Modeling the neutral axis vs the board surface: realistic flat pattern lengths, at the cost of extra material data."],
    p: ["A radius smaller than the flex stackup allows cracks copper after a few cycles.", "Using the flat length for a folded run puts connectors a few millimeters off their mating position."],
    v: "Fold the model, check bend radius against the stackup's minimum, and compare the folded dimensions with a physical sample of the flex.",
    dep: ["rigid-flex-zones", "board-3d-viewer", "layer-stackup"]
  },
  "design-database": {
    s: "The in-memory and on-disk store of every design object, with typed collections, indexes and the consistency rules that the editors, checkers and outputs all rely on.",
    d: "The database holds schematics, boards, libraries, rules and settings as collections of typed objects with identity and relationships. Editors read and write it through transactions, and observers are told when objects change so views, connectivity and checks can update. It provides queries by type, layer, net and area. It is hard because it is the point where everything meets: performance on boards with millions of objects, memory use, and the invariant that connectivity, indexes and the object graph stay consistent through every edit and undo.",
    k: ["One shared database for schematic and board vs separate databases linked by identity: simple cross-references and synchronization, versus independent editors that can be developed and loaded separately.", "In-memory object graph vs a persistent database: very fast interaction, but loading and saving whole files costs time and memory on big designs."],
    p: ["An edit path that bypasses transactions leaves indexes and connectivity out of step with the data.", "Memory growth from history and caches makes large designs crash after long sessions."],
    v: "Load a large design, perform a thousand random edits and undos, and confirm index counts, connectivity and a full re-load from disk all agree with the in-memory state.",
    dep: ["object-model", "change-journal", "spatial-index"]
  },
  "object-model": {
    s: "The definition of every kind of design object, such as part, pad, track and net, with properties, relationships and a stable identity that survives edits and saves.",
    d: "Each object type declares its fields, relationships and invariants, for example that a pad belongs to a footprint and a track to a net and layer. Every object carries an identifier that persists across sessions, so a symbol and its footprint stay linked. The schema is versioned, and files from older versions are migrated on load. It is hard because the schema is the longest-lived decision: files, libraries, scripts and exports depend on it, and a change to what an object means affects all of them.",
    k: ["Stable identifiers generated once vs identifiers derived from names or positions: identity survives renames, but import and merge must not duplicate or reuse them.", "Rich typed objects vs generic property bags: static checks and clear semantics, while property bags make extensions and migration simpler."],
    p: ["Identifiers regenerated on save break links to comments, waivers and version diffs.", "Adding a field without a default produces files that older tools silently misread."],
    v: "Open a design, rename a part and its net, save and reload, and confirm identifiers of all objects are unchanged and links between symbol and footprint still resolve.",
    dep: ["design-database"]
  },
  "connectivity-engine": {
    s: "Computes which pins and copper belong to which net, from the netlist and the physical copper, and maintains it as the design changes.",
    d: "For the schematic it resolves wires, labels, ports and power names into nets. For the board it traces electrical continuity through tracks, vias, pads and pours to find connected copper, and compares it with the netlist to identify unrouted connections and shorts. It updates incrementally as objects change and exposes queries such as the objects on a net. It is hard because the rules for what connects are subtle, such as thermal spokes, shared pads and net ties, and because mistakes are silent: a short or open that the engine does not see passes every other check.",
    k: ["Incremental connectivity update vs recomputation on demand: smooth interactive editing on large boards, but invalidation has many subtle cases.", "Treating copper pours as nets with their fill vs as outlines only: exact connectivity from the filled shape, but a stale fill gives wrong results."],
    p: ["A zone not refilled after an edit shows connections that no longer exist.", "Deliberate net ties between two nets are reported as shorts or silently allowed with no review."],
    v: "Cut a track in the middle of a routed net and confirm the ratsnest reappears and the net is reported as unrouted; join two nets with a track and confirm a short is reported.",
    dep: ["object-model", "polygon-boolean-ops", "spatial-index"]
  },
  "change-journal": {
    s: "Records each user action as a transaction of object changes, supporting undo, redo, atomic edits, notifications to observers and recovery after a crash.",
    d: "Each transaction collects creates, modifies and deletes with the old and new values, and commits atomically, so partial failures roll back. Observers such as views, the connectivity engine and online checks receive the committed changes. The journal can also be written to disk for crash recovery and autosave. It is hard because every mutating operation must go through it, notifications must be ordered and cheap, and transactions that touch many objects, such as a pour refill or a large paste, must not stall the interface or exhaust memory.",
    k: ["Operation-level transactions vs finer-grained steps: one clear undo step per user intent, but long operations are harder to cancel safely.", "Journal persisted continuously vs only snapshots on save: robust recovery after a crash, but constant disk writes and more state to manage."],
    p: ["An observer that throws during notification leaves the remaining observers with stale data.", "A recovered journal replayed against a file that changed externally corrupts the design."],
    v: "Force-kill the tool in the middle of a large edit session and restart; confirm recovery offers the last committed state with no half-applied transaction.",
    dep: ["design-database", "object-model"]
  },
  "geometry-kernel": {
    s: "The set of exact two-dimensional shape types and operations: lines, arcs, polygons, offsets, intersections and distances, used by every editor and checker.",
    d: "The kernel defines points, segments, arcs, circles, polygons with holes and rounded shapes, and operations on them: transform, intersect, inflate, distance, containment and area. Most use integer coordinates, so results are exact. Curved shapes are kept as arcs where possible and approximated by segments where needed. It is hard because of robustness: degenerate cases such as touching edges, nearly collinear points and tiny arcs cause failures in almost every algorithm, and these are exactly the cases found at the limits of design rules.",
    k: ["Integer coordinates vs floating point: exact comparisons and repeatable results, but limited range and care needed for products and rotations.", "Native arcs vs segment approximation: exact curves and smaller data, but every operation must handle arcs, which doubles the algorithm work."],
    p: ["A polygon operation that fails on near-degenerate input returns an empty or inverted shape and no error.", "Approximating an arc differently in the checker and in the output creates a gap that the checker never saw."],
    v: "Run the kernel's operations on a suite of degenerate cases, such as touching edges and zero-length segments, and confirm results are exact and identical across repeated runs and different transformation orders.",
    dep: ["coordinate-and-units"]
  },
  "polygon-boolean-ops": {
    s: "Combines, subtracts and intersects polygons with holes and arcs, used for copper fills, mask openings, clearances and layer output.",
    d: "Given shapes, the operation computes union, difference, intersection or offset, returning polygons with correct winding and holes. Fills subtract clearance shapes from pours, mask openings are the union of pads expanded by a margin, and outputs merge overlapping features. Results are cleaned by removing slivers and tiny islands. It is hard because the operation is the main numerical bottleneck of many tasks: it must be fast on shapes with thousands of vertices, exact at touching boundaries, and stable when repeated, since pours are recomputed constantly.",
    k: ["Exact integer clipping vs tolerance-based floating point: robust and repeatable, but requires scaling and care at the limits of range.", "Recomputing the whole fill vs incremental regions: simple and correct, versus faster for small edits at the price of boundary bugs."],
    p: ["Slivers smaller than the fabricator's resolution survive cleaning and are etched as stray copper.", "Result polygons with self-touching boundaries are rejected by downstream tools."],
    v: "Fill a pour on a dense board twice and confirm identical outputs; subtract a known shape and verify the resulting area equals the original area minus the intersection area to the last coordinate unit.",
    dep: ["geometry-kernel", "coordinate-and-units"]
  },
  "spatial-index": {
    s: "A search structure that finds the objects near a point or inside a region quickly, so selection, checking and routing never scan the whole board.",
    d: "Objects are stored by bounding box in a tree or grid per layer, supporting queries for overlap, containment and nearest neighbors. The index updates as objects move, are added or removed. Rule checking asks for all pairs within a clearance, routing asks for obstacles along a path, and picking asks what is under the cursor. It is hard because it is hit constantly and must stay correct: a missed object means a missed violation, and stale entries after an edit produce phantom or missing hits.",
    k: ["Tree index vs uniform grid: trees adapt to uneven density, grids are simpler and quicker for evenly spread objects.", "One index per layer vs one combined: each query touches less data per layer, but multi-layer queries such as via checks must combine results."],
    p: ["Bounding boxes that ignore clearance expansion miss pairs just within the limit.", "An index not updated on undo returns objects that are no longer present."],
    v: "After a long sequence of random edits and undos, compare the results of index queries against a brute-force scan of all objects for many random regions and confirm they match exactly.",
    dep: ["design-database", "geometry-kernel"]
  },
  "clearance-queries": {
    s: "Answers whether two objects are closer than a given distance and by how much, using exact distances between copper shapes on the relevant layers.",
    d: "Given two shapes, such as a track and a pad or an arc and a polygon, the query computes the minimum distance, or reports that it is below the rule limit with the closest points. Pairs are found via the spatial index and filtered by net and layer. The same primitive serves the checker, the interactive router and the pour fill. It is hard because of shape variety and exactness: arcs, rounded pads and large polygons need specialized formulas, and borderline results must be identical across the router and the checker or interactive tools produce violations the checker then reports.",
    k: ["Exact distance between true shapes vs between polygonal approximations: matches fabrication data when exact, but approximation is simpler and faster.", "Distance as a boolean against the limit vs as a value: boolean is cheaper for the checker, while a value supports routing and diagnostics."],
    p: ["The router and the checker use different distance code and disagree at the limit.", "Distance computed in the plane ignores objects on different layers that connect through vias."],
    v: "Place objects at known separations, compare reported distances with analytic values, and confirm the router refuses a track at limit minus one unit and accepts it at the limit.",
    dep: ["geometry-kernel", "spatial-index", "coordinate-and-units"]
  },
  "coordinate-and-units": {
    s: "Defines the integer coordinate grid, the internal length unit and conversions to inches or millimeters for display, input and file output.",
    d: "Positions are stored as integers in a small internal unit, fine enough to represent common fabrication increments exactly, such as a nanometer. Display and input convert to user units, with rounding rules. Angles use a fixed resolution. Export formats pick their own precision, and conversions between them need defined rounding. It is hard because the unit choice limits the board size and rounding creates errors: a conversion to a coarser unit can move a pad by a fraction that closes a clearance, and the metric versus imperial grid divide design practice.",
    k: ["Fine integer unit vs coarser unit: exact representation of both metric and imperial dimensions, but a limited maximum board size with a fixed integer width.", "Rounding on input vs on output: stored data stays exact, whereas rounding on output must be applied the same way everywhere or files disagree."],
    p: ["Repeated conversion between inches and millimeters accumulates drift, so parts slowly shift from their grid.", "Output files rounded to a coarser precision than the rule limit create violations the checker never saw."],
    v: "Place a pad at an imperial grid position, export to millimeters and back, and confirm the position is unchanged to the last unit, and that no rounding closes a clearance by more than the stated tolerance.",
    dep: []
  },
  "native-file-format": {
    s: "The on-disk representation of designs and libraries, with a versioned schema, stable ordering, and migration so old files open and new files remain diffable.",
    d: "Files are text or binary serializations of the object model, with a format version, identifiers and units declared in a header. Writers emit objects in stable order and omit volatile data, so repeated saves of an unchanged design are identical. Readers validate and migrate older versions. Large designs may be split into files per sheet or layer. It is hard because the format is a promise: it outlasts the tool version that wrote it, and forward compatibility, partial recovery from corruption and load speed on large files all conflict.",
    k: ["Text serialization vs binary: diffable, mergeable and recoverable by hand, but larger and slower to parse on very large boards.", "Single file per design vs split files: easy to share as one unit, whereas split files merge better and let teams work in parallel."],
    p: ["Opening and saving in a newer version upgrades the file so older versions can no longer read it.", "A crash during save truncates the only copy of the design."],
    v: "Save an unchanged design twice and confirm the files are identical; open a file from the oldest supported version and confirm it migrates with all objects, identifiers and connectivity intact.",
    dep: ["object-model", "design-database"]
  },
  "rendering-backend": {
    s: "Draws the design on screen by converting geometry to graphics commands, using hardware acceleration where available and falling back to software drawing.",
    d: "The backend turns tracks, pads, polygons and text into batches of triangles or lines per layer, caches them on the graphics device, and redraws with transforms for pan and zoom. It handles antialiasing, layer blending and highlights, and exports vector output for printing. Arcs and thick lines are tessellated at the current zoom. It is hard because the board has millions of primitives with many layers of overlapping transparency, and the drawing must stay sharp at every zoom and never drop objects.",
    k: ["GPU-accelerated drawing vs software rasterization: fast for large boards, but driver differences cause bugs and need a fallback path.", "Caching geometry per layer vs rebuilding per frame: very fast redraws, but memory use and update logic for edits."],
    p: ["Tessellation that is too coarse at high zoom makes circles look polygonal and hides small features.", "A graphics driver bug causes a blank or corrupted display on some machines."],
    v: "Display the same large board with accelerated and software backends and compare screenshots at several zooms, confirming identical content and acceptable frame times for each.",
    dep: ["geometry-kernel", "design-database"]
  },
  "source-of-truth-and-sync": {
    s: "The decision about where connectivity and part data are defined, and how schematic, board and libraries are kept equal through forward and back flow.",
    d: "Some tools make the schematic the only source of connectivity, with the board following it. Others allow layout to change pin swaps and designators and send them back. Part data may live in the design or in the library or a database. Each choice defines what synchronization has to do: what flows forward, what returns, and who wins on conflict. The decision touches annotation, parity, variants, bill of materials and release. It is hard because every shortcut taken to keep views editable at once creates a case where the two disagree and no single side can be trusted.",
    k: ["Schematic as only source vs two-way flow: simple, predictable rules, but layout optimization such as pin swapping needs a manual round trip.", "Live synchronization vs explicit update actions: no stale views, but surprising changes appear in the other editor without the author's decision."],
    p: ["Two-way flow with no record of what changed lets the board drift from released schematics.", "Part data copied into the design from a library is later edited in one place only."],
    v: "Make a change in each direction, schematic to board and board to schematic, and confirm the parity check reports equality after sync and the change history records who changed what.",
    dep: ["parity-check", "netlist-generator", "back-annotation"]
  },
  "numeric-precision": {
    s: "The decision about coordinate resolution, integer versus floating-point representation and rounding rules, which determines exactness of every check and output.",
    d: "A fine integer grid makes comparisons exact, but limits board size and demands care when scaling or rotating. Floating-point is flexible but makes results depend on operation order and platform. Rounding must be defined at every boundary: input, internal operations and each output format. The choice affects the geometry kernel, the checker, pour fills and fabrication files, all of which must agree on borderline values. It is hard because the effects are rare and large: they appear only at the limit, where the board fails in manufacturing but passes in the tool.",
    k: ["Integer coordinates vs floating point: exact and repeatable results, versus easier arithmetic and a larger range with possible disagreement between platforms.", "Rounding once at output vs everywhere: one source of error to analyze, but intermediate rounding keeps stored data identical to what gets built."],
    p: ["Checker and exporter round differently, so a design passes and then violates in the fabrication files.", "Rotations of integer coordinates by arbitrary angles accumulate errors on repeated edits."],
    v: "Take a design with features at the exact rule limit, run the checker and the outputs, and verify the fabrication data measured in an independent viewer shows the same distances the checker reported.",
    dep: ["coordinate-and-units", "geometry-kernel", "drc-engine"]
  },
  "object-identity": {
    s: "The decision about how objects are named and tracked across edits, saves, imports and revisions, which every link, diff, merge and comment depends on.",
    d: "Identity can come from names, which humans choose and change, from positions, which move, or from generated identifiers that never change. Links between symbols and footprints, comments, waivers, variants and diffs depend on it. Imports and copy-paste must give new identifiers where needed and preserve them where links are intended. The choice also determines what a merge treats as the same object. It is hard because identity is easy to break accidentally: any path that regenerates objects, such as import, conversion or a rebuild, silently severs every link that depended on it.",
    k: ["Generated persistent identifiers vs name-based identity: robust through renames and renumbering, but humans cannot read or type them and must be shown names.", "New identity on paste vs preserved identity: avoids duplicates, but preserving is needed for round trips such as block updates."],
    p: ["Updating a part from a library creates a new object and drops all its comments and waivers.", "Copy-paste preserving identifiers creates two objects with the same identity."],
    v: "Rename a part and its net, change footprint, save, reload and run the diff against the previous revision; confirm the diff shows a modification and not a removal plus addition.",
    dep: ["object-model", "design-diff", "parity-check"]
  },
  "library-trust": {
    s: "The decision about how much a part definition can be believed, and how libraries are reviewed, versioned and pinned so errors do not reach boards.",
    d: "A part is trusted when its symbol, footprint, model and attributes have been checked against the datasheet by someone other than the author, and when the definition cannot change under a released design. Organizations use review stages, status flags, signed releases and embedded copies in designs. Downloaded or vendor-supplied libraries start at a low level of trust. It touches library manager, component database, bill of materials and release. It is hard because a library error is multiplied: one wrong pin number is used at every placement, and it is invisible to every automated check.",
    k: ["Mandatory independent review of every part vs author self-check: far fewer escaped errors, at the cost of slow library growth and a queue.", "Pinned library versions in designs vs always latest: reproducible released designs, but fixes to a library must be deliberately pulled in."],
    p: ["A vendor-supplied footprint used without review has a pad pattern that is mirrored.", "A library fix is made after release and silently changes the next revision's board."],
    v: "Pick a recently added part and trace its symbol, footprint and model to the datasheet and to the review record; confirm each is checked by a reviewer who is not the author and the design pins that version.",
    dep: ["library-manager", "component-database", "footprint-library", "symbol-library"]
  },
  "scale-and-performance": {
    s: "The decision about how large a design the tool must handle and which operations stay interactive, shaping data structures, incremental algorithms and what is deferred.",
    d: "Boards range from a few hundred objects to millions across dozens of layers. Interactive operations such as panning, dragging and routing need responses within a frame or two, while whole-board checks and fills can take seconds or minutes. Meeting these budgets decides the use of spatial indexes, incremental connectivity and checks, cached geometry and background computation. The budgets must be set early, because retrofitting incremental updates into a model built for batch operation is very difficult. It is hard because worst cases come from real designs, not benchmarks: dense grid arrays, huge pours and long histories.",
    k: ["Incremental algorithms everywhere vs full recompute with caching: smooth interaction at scale, but complexity and subtle invalidation bugs.", "Running heavy work in the background vs blocking: the interface stays responsive, but results arrive later and may be stale when the user acts."],
    p: ["Performance testing on small sample designs hides problems that appear only on the largest board.", "Background fill and check results are used before they have caught up with the latest edit."],
    v: "Load the largest real board in the test set and time pan, drag, route and full check, confirming each stays within its stated budget and memory stays under the limit after an hour of editing.",
    dep: ["spatial-index", "change-journal", "rendering-backend", "drc-engine"]
  },
  "lossy-interchange": {
    s: "The recognition that every export or import between tools drops or reinterprets something, and that exchange formats must be validated by comparing what arrives with what left.",
    d: "Fabrication images, drill files, 3D solids, netlists and foreign design formats each carry only part of the design: images lose nets, solids lose copper detail, foreign formats lack matching concepts. A tool must therefore decide what it writes, what it assumes on reading, and how it reports what could not be carried. The receiving side interprets dialects and defaults differently. It is hard because losses are quiet: the output looks correct on screen, and the first evidence of difference is a board that fails in assembly or test.",
    k: ["Writing the richest format the receiver supports vs the lowest common denominator: more information and automatic checks, versus fewer surprises across suppliers.", "Round-trip verification on every release vs trusting the exporter: catches interpretation errors early, but costs time and needs an independent reader."],
    p: ["An exported file is validated only in the tool that wrote it, which shares the same misreading.", "Defaults of the receiving tool, such as units or polarity, change meaning without any message."],
    v: "Re-import the release outputs into an independent viewer, regenerate the netlist from the images, and compare it with the schematic netlist; confirm no net differs.",
    dep: ["fab-image-export", "intelligent-fab-package", "solid-model-exchange", "format-converters"]
  },
});
