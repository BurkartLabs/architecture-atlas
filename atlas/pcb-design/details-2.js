// Details for the PCB design plate, part 2: libraries, board definition, constraints, placement and routing.
ATLAS.details("pcb-design", {
  "symbol-library": {
    s: "Stores schematic symbols: the drawn shape, pin names and numbers, electrical pin types, and the units a multi-part device is split into.",
    d: "A symbol defines graphics, a set of pins each with a number, a name, an electrical type such as input, output or power, and a position. Devices with many pins are split into units, such as gates in one package or banks of a large processor, each drawn separately but sharing one part. Attributes hold the default value, description and the footprint link. The hard part is correctness at scale: symbols for hundreds of pins are produced from datasheets by hand or script, and one wrong pin number is invisible until a board arrives.",
    k: ["Splitting a large part into functional units vs one big symbol: readable schematics, but pins are scattered across sheets and harder to audit against the datasheet.", "Pin electrical types enforced strictly vs advisory: the rules check catches conflicts, but many real parts have bidirectional or open-drain pins that need exceptions."],
    p: ["A pin number transposed in the symbol connects the wrong package pin, and the schematic still passes every check.", "Pin types marked as passive let two outputs be tied together without a warning."],
    v: "Compare a symbol's pin table against the manufacturer's pin list for the footprint package, row by row, and confirm numbers, names and types match with no missing or duplicate pins.",
    dep: ["design-database", "object-model"]
  },
  "footprint-library": {
    s: "Stores the physical land patterns of parts: pad positions and shapes, silkscreen, courtyard, assembly outline and origin, drawn to match the component package.",
    d: "A footprint lists pads with number, shape, size, drill and layer, plus outlines for silkscreen, courtyard and assembly, and a defined origin and orientation. It follows standardized land pattern conventions, adjusted for the fabricator and assembly process. It is linked to symbols by pin number. The hard part is accuracy: a pad offset by a fraction of a millimeter or a mirrored outline produces a board that cannot be soldered, and each part's dimensions come from a drawing that may disagree with other sources.",
    k: ["Footprints compliant with a density standard vs tuned per product: predictable assembly and reuse, but dense designs sometimes need smaller courtyards than the standard allows.", "Copper-only pads with separate solder paste definitions vs one combined pad definition: precise paste control, but more data to keep consistent."],
    p: ["A footprint drawn for the top view of a part rather than the bottom mirrors the pad pattern.", "Orientation conventions differing from the assembler's cause parts to be placed rotated by ninety degrees."],
    v: "Print a footprint at full scale and lay the real part on it, or overlay it on the manufacturer's land pattern drawing, and confirm each lead meets its pad and the pin one marker agrees.",
    dep: ["pad-and-padstack-model", "design-database"]
  },
  "pad-and-padstack-model": {
    s: "Defines how a pad or via looks on every layer: shape, size, drill, plating, mask and paste openings, and thermal connection style.",
    d: "A padstack lists, per copper layer, a pad shape and size, plus drill diameter, plating and the openings in solder mask and paste layers. Through-hole stacks may use different shapes on inner layers, and unused inner pads can be removed. Vias are padstacks too, with start and end layers for blind and buried types. Thermal relief and anti-pad data describe connection to planes. It is hard because the same padstack feeds rule checks, fabrication outputs and 3D models, and any ambiguity about units or layer ordering creates a fabrication error.",
    k: ["Per-layer padstack definitions vs one shape applied to all layers: exact control of inner layers and manufacturing, but more data and more chances for mismatch.", "Removing unconnected inner pads vs keeping them: better routing space and signal quality, but some fabricators and processes prefer them for registration."],
    p: ["Drill diameter given as finished size is treated as drilled size, or the reverse, so holes plate too small.", "Solder mask expansion set on the pad instead of the board rule yields masks that vary by part."],
    v: "Generate fabrication outputs for a board with through-hole, blind and microvia padstacks, and confirm in a fabrication viewer each layer shows the intended pad shape and drill hits.",
    dep: ["layer-stackup", "via-definitions"]
  },
  "footprint-generators": {
    s: "Produces footprints from parameters such as pitch, pin count and package dimensions, so families of parts have consistent, correct land patterns.",
    d: "A generator takes a package description and calculates pad positions, sizes, courtyard and outlines using the rules of a land pattern standard. Scripts, wizards or parametric templates cover common families such as chip components, leaded packages and grid arrays. Output goes into the footprint library with a record of the parameters used. It is hard because rules differ by manufacturing density level, and a generator that bakes in one set of assumptions yields footprints that are consistent but wrong for the product.",
    k: ["Generated footprints vs hand drawn: consistency and fewer typos across hundreds of parts, but unusual packages still need manual work.", "Regenerating on demand vs storing generated results: always current rules, but a shipped design can change when the generator is updated."],
    p: ["Regenerating a family with new parameters changes pad sizes on an already released board.", "A generator misreading nominal versus maximum body size produces a courtyard that is too small."],
    v: "Generate a family of packages at several pin counts and compare each footprint's pad coordinates against a hand-calculated reference for the smallest and largest members.",
    dep: ["footprint-library", "pad-and-padstack-model"]
  },
  "component-database": {
    s: "A table-driven store of real parts, each row linking a symbol, a footprint, a value and the manufacturer and supplier part numbers used on the bill of materials.",
    d: "Instead of placing a bare symbol and filling fields by hand, the engineer picks a row; the tool places the symbol with the footprint and attributes already set. Rows are maintained by a library team in a database or spreadsheet-like store. Parametric search finds parts by value, tolerance and package. It is difficult because the database ties a design to company part numbers, and part data goes stale: lifecycle status, availability and approved alternates change while the library lags behind.",
    k: ["Curated parts database vs free-form symbols with typed fields: controlled, purchasable parts and fewer bill of materials errors, but the library team becomes a bottleneck.", "Live links to the database vs copying data into the design: designs update with parts, but a database change alters released designs unless they are pinned."],
    p: ["A row pointing to the wrong footprint places many boards with parts that do not fit, because the mistake is repeated at every use.", "Database outages or renamed rows leave designs unable to resolve their parts when opened."],
    v: "Place a part from the database, then compare placed symbol, footprint and bill of materials row with the supplier datasheet's package and ordering code, and confirm they all refer to the same part.",
    dep: ["symbol-library", "footprint-library", "library-manager", "supplier-data"]
  },
  "symbol-footprint-mapping": {
    s: "Links each symbol pin to the pad of a footprint, usually by number, so that nets drawn on the schematic reach the right copper on the board.",
    d: "Mapping is typically by pin number equality, which suffices when numbering follows the package. Where it does not, an explicit table maps pin names or numbers to pad names, handling grid arrays with alphanumeric pads, parts with several footprint variants, and symbols with gates sharing pad groups. Multiple footprints may be allowed for one symbol. The hard part is verification: the mapping must be checked against the datasheet, because pins can be mapped consistently but incorrectly and nothing downstream will notice.",
    k: ["Implicit mapping by number vs explicit mapping tables: simple and obvious for most parts, but breaks on alphanumeric and multi-footprint cases that need explicit control.", "Allowing alternate footprints per symbol vs one fixed footprint: flexible for packaging choices, but the bill of materials and checks must follow the selection."],
    p: ["A symbol with pins numbered one to eight bound to a footprint whose pads are lettered leaves the board with unconnected pads.", "Choosing a different footprint after layout starts silently drops pad connections."],
    v: "For a grid array part, export the pin-to-pad table and compare it with the manufacturer's ball map, then confirm the netlist places every symbol pin on exactly one pad.",
    dep: ["symbol-library", "footprint-library", "netlist-generator"]
  },
  "model-3d-library": {
    s: "Stores solid models of components and associates each with a footprint, with position, rotation and scale offsets that place the model correctly on the board.",
    d: "Models come from manufacturers or are generated from package parameters, in a neutral solid format, and are attached to footprints with offsets in three axes. The library may use simplified shapes for speed and detailed ones for mechanical checks. Color and material are carried for realistic views. The challenge is alignment and trust: models from different sources use different origins and orientations, so each needs adjustment against the footprint, and a model that looks right can be the wrong height or have misplaced leads.",
    k: ["Simplified extruded bodies vs detailed manufacturer models: small files and fast views, but collision checks against connectors or tall parts need real geometry.", "One model per footprint vs per part number: simple, but packages with different heights share a model that is wrong for some."],
    p: ["A model with its origin at a corner rather than the pin one position floats beside its pads.", "Detailed models inflate file size and make the 3D view slow or unusable on large boards."],
    v: "Open the 3D view, overlay the pads and check each model's leads sit on their pads and its height matches the datasheet's maximum body height within tolerance.",
    dep: ["footprint-library", "model-alignment"]
  },
  "library-manager": {
    s: "Controls which libraries a design can see, where they are stored, how they are versioned and how updates and conflicts between libraries are handled.",
    d: "The manager keeps a table of library sources, with global and project scope, and resolves a part name to a definition by search order. It can embed a copy of used parts in the design, so the design survives library changes, and can compare that copy to the source and offer updates. It supports remote shared libraries with permissions. It is difficult because libraries change independently of designs: an updated pad dimension must reach new designs without changing old ones silently, and name clashes between sources must be resolved predictably.",
    k: ["Embedding used parts in the design vs always resolving live: self-contained and reproducible designs, at the cost of stale copies that must be reconciled.", "Central shared library vs per-team libraries: one source of correctness, but a slow change process and a single point of failure."],
    p: ["Two libraries containing a part with the same name give different footprints depending on search order.", "A library moved or renamed on a shared drive leaves every design with unresolved parts."],
    v: "Change a pad size in a library, open an existing design and confirm it still shows the old size with an update offered, while a new design placed after the change shows the new size.",
    dep: ["symbol-library", "footprint-library", "component-database", "design-database"]
  },
  "board-outline": {
    s: "Defines the physical shape of the board with edges, corners, slots and cutouts, and the mounting holes and edge features the mechanical design needs.",
    d: "The outline is a closed contour on a dedicated layer, with interior contours for cutouts and slots, built from lines and arcs. It may be imported from mechanical design. Outputs derive routing paths for the fabricator from it, and checks such as copper-to-edge clearance use it. Mounting holes, edge connectors and castellations are separate features with their own rules. It is hard because the contour must be exact and closed: a tiny gap or overlapping segment makes the fabricator's tooling path invalid, and units mismatches with mechanical files scale it wrongly.",
    k: ["Outline drawn in the board editor vs imported from mechanical design: the board editor is self-contained, while imports keep the mechanical model as the single source and need synchronization.", "Arcs kept as arcs vs approximated by segments: smaller files and cleaner routing paths, but some downstream tools only accept segments."],
    p: ["An open or self-intersecting outline makes the fabricator reject the files or mill an unexpected shape.", "Copper placed beyond the outline's edge clearance is cut off during routing of the board."],
    v: "Export the outline and re-import it in a fabrication viewer; confirm it is one closed contour per cutout, measures the intended dimensions, and copper clears the edge by the rule distance.",
    dep: ["geometry-kernel", "design-database", "keepout-regions"]
  },
  "layer-stackup": {
    s: "Describes the ordered layers of copper, dielectric and core with thicknesses and materials, defining what the board is physically made of.",
    d: "The stackup lists copper layers, prepreg and core in order, each with thickness, material and dielectric properties, plus surface finish and mask. Layer purposes such as signal, plane and mixed are recorded. Impedance, via structures and rule scopes depend on it, and it is sent to the fabricator for confirmation. It is hard because the numbers are nominal: the fabricator's available materials and their actual thicknesses after pressing differ from the assumption, so impedance results must be validated with the manufacturer before routing relies on them.",
    k: ["Stackup defined by the designer vs by the fabricator's standard builds: full control of impedance and thickness, but unusual stacks cost more and may not be available.", "Single stackup per board vs zone-specific stackups: simple for rigid boards, while rigid-flex needs different layers in different regions."],
    p: ["Routing high-speed nets against a stackup that the fabricator then changes leaves impedance wrong without any rule check failing.", "Layer ordering mistakes mirror the board between inner layers when files are generated."],
    v: "Send the stackup to the fabricator, obtain their proposed build with impedance calculations, and confirm thicknesses and dielectric constants match the tool's stackup within tolerance.",
    dep: ["dielectric-materials", "design-database"]
  },
  "dielectric-materials": {
    s: "A table of laminate and copper properties such as thickness, permittivity, loss tangent and roughness used by impedance and signal integrity calculations.",
    d: "Each material has electrical properties that may vary with frequency, a nominal thickness and a tolerance, and copper has weight, roughness and plating thickness. The table feeds the impedance calculator, the field solver and loss estimates for channels. Entries come from manufacturer data sheets and fabricator guidance. The hard part is that datasheet values are measured under specific conditions: permittivity at a stated frequency and resin content, which differ from the pressed board, so results are estimates with a stated error.",
    k: ["Single value per material vs frequency-dependent models: simple tables suit low speeds, while multi-gigabit channels need measured dispersion for credible loss.", "Library of generic materials vs fabricator-specific data: fast to start, but only fabricator data predicts the manufactured board."],
    p: ["Using permittivity at a low frequency for a very high-speed channel underestimates delay and loss.", "Ignoring copper roughness makes loss predictions optimistic above a few gigahertz."],
    v: "Compare the calculated impedance of a test trace against the fabricator's measured coupon report for the same stackup and confirm agreement within the quoted tolerance.",
    dep: ["layer-stackup"]
  },
  "via-definitions": {
    s: "Declares the via types a board may use, with drill sizes, pad sizes, spans for blind and buried vias, and limits on aspect ratio and annular ring.",
    d: "Each via type specifies start and end layers, drill size, pad shapes per layer and whether it is filled, capped or tented. Types include through, blind, buried and micro vias. The router picks from the allowed set, and checks enforce minimum annular ring and aspect ratio between drill and board thickness. Rules per net class can restrict which types are usable. The complexity is manufacturing: each additional via type adds lamination steps and cost, and capability differs between fabricators.",
    k: ["Through vias only vs blind and buried vias: much lower cost and simpler fabrication, but fine-pitch grid arrays may not escape without them.", "Via-in-pad with fill vs offset vias: dense and short routes, but filling adds cost and requires explicit manufacturing notes."],
    p: ["A drill-to-thickness ratio beyond the fabricator's limit passes the tool's rules but fails in plating.", "Unfilled via-in-pad draws solder away from the joint during assembly."],
    v: "Run the rule check against a fabricator capability profile for a board with microvias and confirm violations appear for a via smaller than their limit and none for those within limits.",
    dep: ["layer-stackup", "pad-and-padstack-model", "fab-capability-profiles"]
  },
  "rigid-flex-zones": {
    s: "Defines regions of a board built from different layer stacks, such as rigid sections joined by flexible ones, each with its own layers and rules.",
    d: "A zone is a polygon on the board with an assigned stackup, bend radius and rules, for example a flexible tail with fewer layers than the rigid section it joins. Routing across zones follows restrictions: traces in bends are curved and perpendicular to the bend, vias are kept out, and copper pours are hatched. Outputs have to describe each zone's layers separately. It is hard because geometry becomes three-dimensional when folded, and rules that are valid flat can be violated in the bent state.",
    k: ["Zone-based stackups on one board vs separate boards joined by connectors: fewer parts and better reliability, but a much more complex design and higher fabrication cost.", "Hatched copper in bends vs solid pours: flexibility and lower stress, but worse shielding and higher resistance."],
    p: ["A via placed within a bend region cracks after repeated flexing.", "Using one rule set across zones applies rigid-section clearances to flex layers that have different capabilities."],
    v: "Fold the board in the 3D view, check that bend regions contain no vias or pads and traces cross the bend line perpendicular, and confirm each zone's fabrication layer list is correct.",
    dep: ["layer-stackup", "board-outline", "flex-folding"]
  },
  "keepout-regions": {
    s: "Marks areas where certain objects are not allowed, such as copper, vias, components or tracks, to protect mounting, antennas, edges and mechanical features.",
    d: "A keepout is a shape with a layer set and a list of forbidden object types. The routers and checkers treat it as a restriction, and copper pours avoid it. Keepouts can come from mechanical design, such as a connector's housing, or from electrical needs such as an antenna's clear area. They can be attached to footprints so they move with the part. The difficulty is intent: a keepout that forbids copper but not vias, or applies to one layer only, leaves a gap in what the author meant to protect.",
    k: ["Keepouts attached to footprints vs placed on the board: they travel with parts and stay in sync, but need care so duplicate parts do not create overlapping regions.", "Per-object-type restrictions vs a blanket exclusion: precise control, but more settings to get wrong."],
    p: ["A keepout defined for tracks leaves a copper pour flowing through the area it was meant to clear.", "Mechanical keepouts imported at the wrong layer or position never trigger a violation."],
    v: "Draw a keepout, then attempt to route a track and place a via inside it, and confirm both are refused or flagged by the rule check; check that a pour refills around it.",
    dep: ["drc-engine", "geometry-kernel", "design-database"]
  },
  "constraint-manager": {
    s: "A single place where electrical and physical rules are defined and viewed against nets, classes and layers, so layout and checking use one consistent rule set.",
    d: "The manager presents rules as a matrix or tree: for each net or class, the width, clearance, via type, length and spacing limits, and which layers apply. Rules are stored in the design and evaluated by the rule engine and by interactive tools while routing. It can import constraints from schematic annotations, and its results feed checks and reports. The hard part is clarity: with hundreds of nets and overlapping scopes, engineers cannot tell which rule governs a given object unless the tool explains the winner and why.",
    k: ["Rules defined in one central manager vs scattered across schematic and board: one source and consistent checking, but a heavier tool that engineers must learn.", "Constraints attached in the schematic and carried to layout vs authored in layout only: intent is captured earliest, but board experts may prefer to set rules where they see the geometry."],
    p: ["A rule overridden in a narrow scope silently weakens an important constraint elsewhere.", "Constraints that exist in the design but are never evaluated by the router give a false sense of control."],
    v: "Pick a net and ask the tool which rule applies to it for clearance on a given layer; confirm the answer names the scope that wins and matches the value the router enforces when routing that net.",
    dep: ["net-classes", "rule-scopes", "clearance-and-width-rules", "electrical-constraints"]
  },
  "net-classes": {
    s: "Groups nets that share requirements, such as power, high-speed or analog, so that one set of rules applies to every member.",
    d: "A net class lists member nets, either explicitly or by pattern, and carries rules for track width, clearance, via size and diff pair gap. Classes make rules manageable: rather than per-net settings, an engineer assigns nets to classes in the schematic or board. Nets can belong to more than one class in some tools, resolved by priority. It is difficult because pattern membership can capture unintended nets, and because renaming a net removes it from a class without any warning.",
    k: ["Explicit membership vs pattern membership: explicit lists are predictable but tedious, patterns scale but surprise when new nets match.", "Single class per net vs multiple classes with priority: simple semantics, versus flexible combinations that need rules for resolving conflicts."],
    p: ["A net renamed during a schematic revision falls out of the power class and is routed at signal width.", "A pattern such as one matching a prefix pulls in unrelated nets and applies the wrong clearance."],
    v: "List every net's class after a netlist update and confirm all intended power nets sit in the power class with its widths, and that no net is classless or in an unexpected class.",
    dep: ["connectivity-engine", "constraint-manager"]
  },
  "rule-scopes": {
    s: "The system that decides which rule applies to a given object pair, using conditions on net, class, layer, area and object type, with a defined priority order.",
    d: "Each rule has a scope expression such as a net class, a layer or a region, and a priority. When two objects are checked, every matching rule is found and the highest priority wins, with the most specific scope breaking ties. Rule languages range from dialog-driven to small expression languages with queries. The engine must evaluate this fast during interactive routing. It is hard because composite conditions have subtle precedence, and an engineer cannot predict the effective rule from reading a list.",
    k: ["Priority order set by the user vs most-specific-wins automatically: explicit control, but fragile ordering; automatic is predictable but cannot express every override.", "Expression language vs dialogs: powerful and scriptable, but harder for casual users and harder to validate."],
    p: ["Two rules of equal priority both match, and the winner depends on the order of definition.", "A region-scoped rule is moved with the board outline edit and quietly changes what it covers."],
    v: "Create overlapping rules for a pair of objects, query the effective rule, and confirm the tool reports the same value that the rule check and router apply, naming the winning rule.",
    dep: ["constraint-manager", "net-classes", "spatial-index"]
  },
  "clearance-and-width-rules": {
    s: "The geometric limits for the copper: minimum spacing between objects of various types, and minimum and preferred widths of tracks.",
    d: "Clearance rules give distances between pairs of object types, such as track to pad or pad to board edge, per net class and layer. Width rules set minimum, preferred and maximum track widths, and current-carrying needs lead to wider power traces. Values are chosen to meet the fabricator's capability and, for high voltages, creepage and clearance safety standards. The difficulty is that the numbers interact: a width and clearance pair must fit through a pin pitch of a fine-pitch part, and local relaxation under a part must be allowed without opening the whole board.",
    k: ["Tight clearances everywhere vs relaxing locally under fine-pitch parts: higher yield and safety margin broadly, with exceptions only where geometry forces them.", "One global rule vs per-class values: simple but over-constrains routing, while per-class rules let power and high-voltage nets have extra margin."],
    p: ["Using the fabricator's absolute minimum everywhere leaves no margin and lowers yield.", "Missing high-voltage creepage rules lets a legal-looking board fail safety certification."],
    v: "Route a net at the minimum rule distance and check it in the fabricator's own viewer or checker with their capability limits, confirming no violation, then increase the rule and confirm the tool flags the same spots.",
    dep: ["constraint-manager", "fab-capability-profiles", "clearance-queries"]
  },
  "electrical-constraints": {
    s: "Rules expressed in electrical terms rather than geometry: target impedance, maximum length, delay matching, skew limits and maximum via count per net.",
    d: "An electrical constraint is attached to a net, a diff pair or a group, such as a length range, a matching tolerance within a bus, or a maximum number of vias. Some are specified in time rather than length, using propagation delay computed from the stackup. Routing tools show live status against them and length tuning uses them as targets. Checks flag violations. It is hard because the numbers originate in interface specifications and simulation, and unit and reference conventions, like measuring to a pad or to a die, differ.",
    k: ["Constraints in length vs in delay: length is simple and visible, but delay accounts for layer-dependent velocity and is accurate for matching across layers.", "Constraints authored by hand vs generated from interface templates: fewer mistakes with templates, but templates must match the exact part and version."],
    p: ["Matching lengths on nets routed on different layers ignores the layers' different propagation velocities.", "Package internal length is omitted, so board-level matching leaves residual skew inside the device."],
    v: "Route a matched group, then compare the tool's reported length and delay for each net with a time-domain measurement or field-solver result, and confirm the spread falls within the stated tolerance.",
    dep: ["constraint-manager", "impedance-calculator", "layer-stackup"]
  },
  "fab-capability-profiles": {
    s: "A set of limits describing what a particular manufacturer and process can build, such as minimum trace width, drill size and annular ring, used to configure rules.",
    d: "A profile stores minimums and tolerances for each manufacturing step: etch, drill, plating, mask, legend and routing. Selecting a profile fills the rule engine and via definitions with consistent limits and lets the checker compare a design with a specific fabricator's capability. Profiles come from the fabricator and are versioned. The hard part is currency and scope: capabilities depend on layer count, copper weight and finish, so a profile that is correct for a basic board is wrong for a thick copper or high layer count design.",
    k: ["Fabricator-specific profiles vs generic conservative limits: exact yield and cost on a known supplier, but changing suppliers requires revalidating the design.", "Hard limits that block routing vs advisory warnings: guarantees buildable boards, but blocks legitimate special requests negotiated with the fabricator."],
    p: ["A profile for standard boards applied to a heavy copper design hides violations of etch limits.", "An outdated profile lets a feature through that the fabricator stopped supporting."],
    v: "Select a profile, run the check on a board with one trace below its minimum width, and confirm a violation is reported referencing the profile; then load a different profile and confirm limits change.",
    dep: ["clearance-and-width-rules", "via-definitions", "dfm-analysis"]
  },
  "ratsnest": {
    s: "Shows the unrouted connections between pads as thin lines drawn from the netlist, guiding placement and routing, and updating as parts and tracks move.",
    d: "On netlist import the board editor creates parts and nets and computes, for each net, a minimal spanning set of lines between unconnected copper pieces. As parts move or tracks are routed, lines are recomputed. The import step also applies forward annotation changes, adding and removing parts, and reports mismatches. It is hard because of performance and clarity: dense boards have tens of thousands of lines that must update during dragging, and line choice affects placement decisions, so the lines should reflect shortest realistic connections.",
    k: ["Minimum spanning tree per net vs showing all pad pairs: clear and fast, but real routing topology (daisy chain or star) may differ from the drawn lines.", "Updating only affected nets while dragging vs full recompute: smooth interaction, but incremental updates need exact invalidation logic."],
    p: ["Importing a netlist with removed parts leaves orphan footprints on the board with their old nets.", "A ratsnest hidden for power nets lets an unrouted supply connection pass unnoticed."],
    v: "Import a netlist, move a part across the board and confirm its connections follow in real time; route one net and confirm its line vanishes and the connectivity engine counts it complete.",
    dep: ["connectivity-engine", "netlist-generator", "design-database"]
  },
  "interactive-placement": {
    s: "Tools for positioning parts by hand: moving, rotating and flipping footprints with alignment helpers, grouping by schematic sheet and snapping to grids and edges.",
    d: "Placement tools let an engineer arrange parts by function, replicate a placed block, align rows and distribute spacing, with the ratsnest guiding proximity. Cross-probing selects parts from the schematic, and grouping by sheet moves a circuit as one. Courtyard overlap detection warns about collisions. Placement considers height, heat, orientation for assembly and signal flow. It is hard because placement quality is mostly judgment, not rules: tools can check spacing but not whether decoupling is close enough to the pin it serves.",
    k: ["Free placement with live collision warnings vs hard collision blocking: free movement allows intermediate overlaps during rearrangement, while blocking prevents mistakes but frustrates reordering.", "Placement by schematic grouping vs by board region: keeps related parts together, but a sheet boundary is not always a physical boundary."],
    p: ["Decoupling capacitors placed on the far side of a part from its power pin add loop inductance that no rule detects.", "Parts placed on the wrong side relative to assembly constraints complicate two-sided reflow."],
    v: "Place a processor and its decoupling capacitors, then measure the distance from each capacitor's pad to the power pin and verify they meet the stated maximum, and the courtyard check reports no overlaps.",
    dep: ["ratsnest", "spatial-index", "online-drc"]
  },
  "auto-placement": {
    s: "Automatically proposes positions for parts by optimizing wire length, congestion and constraints, usually as a starting point for manual refinement.",
    d: "An auto-placer takes the netlist, outline, fixed parts and keepouts, and searches for an arrangement using methods such as force-directed or simulated annealing, scoring estimated wire length, overlap and routability. It respects groups and orientation rules. Results are usually rough and need hand placement of critical parts. It is hard because the quality measure is incomplete: it does not understand signal integrity, thermal coupling, assembly flow or mechanical needs, so a result that scores well may be unusable.",
    k: ["Fully automated placement vs seeded by fixed key parts: less effort, but good results usually need critical parts frozen first and the tool filling the rest.", "Optimizing wire length vs optimizing congestion: shorter nets favor signal quality, while congestion-aware placement favors routability on dense boards."],
    p: ["Auto-placed parts violate the thermal separation of a heat source from sensitive analog circuits.", "Placement that scores well on length produces regions too dense to route."],
    v: "Run auto-placement on a board with fixed connectors and compare total estimated wire length and routing completion rate against the manual placement of the same design.",
    dep: ["ratsnest", "interactive-placement", "spatial-index"]
  },
  "interactive-router": {
    s: "A router that follows the cursor while pushing, shoving or walking around obstacles so tracks are drawn that obey the rules at every moment.",
    d: "As the engineer drags a track end, the router computes a legal path to the cursor using the rule engine, pushing existing tracks aside within limits or routing around them, and inserts vias when changing layers. It shows clearance outlines while drawing, and supports modes such as walkaround, shove or free. It must respond in milliseconds on dense boards. The hard part is search under local rules with global consequences: a shove that is locally valid can displace many tracks, and a failed shove has to leave everything exactly as it was.",
    k: ["Push-and-shove vs walkaround only: efficient on dense boards and fewer manual redraws, but unexpected displacement of finished routing is possible.", "Optimizing the path while drawing vs exact cursor following: cleaner angles and shorter paths, but the result can differ from what the engineer's hand intended."],
    p: ["A shove moves a previously length-tuned trace and ruins its matching without any warning.", "Rules applied during drawing differ from those in the checker, so drawn tracks later fail."],
    v: "Route a net through a dense area in shove mode, then run the full rule check and confirm zero violations, and verify previously locked tracks did not move.",
    dep: ["clearance-queries", "rule-scopes", "spatial-index", "geometry-kernel"]
  },
  "differential-pair-routing": {
    s: "Routes two coupled traces together with a controlled gap and equal length, keeping the pair tightly matched along its path, through vias and around obstacles.",
    d: "The router treats the pair as a unit: it keeps the gap and width from the rule, bends both traces together, adds paired vias and handles uncoupled sections where needed, such as at pads. It reports length mismatch and uncoupled length. Pairs are defined by naming convention or explicit declaration in the schematic. It is hard because of tradeoffs: matching length needs serpentines, which break coupling, and layer changes need vias placed close together, all within a tight clearance budget.",
    k: ["Routing the pair as a unit vs two separate traces: preserves coupling and impedance, but the pair needs more space and fails to route in places single traces would.", "Tight coupling vs loose coupling: tight gives noise rejection and smaller footprint, loose gives better tolerance to fabrication variation and easier routing."],
    p: ["Large uncoupled lengths at connectors degrade the common-mode behavior the pair was intended to provide.", "Pairs defined by naming convention miss a pair whose polarity suffix was changed."],
    v: "Route an interface pair and compare the reported gap, impedance and length mismatch with the rule values along the whole length, then check with the field solver that differential impedance is within tolerance.",
    dep: ["interactive-router", "electrical-constraints", "impedance-calculator", "net-classes"]
  },
  "length-tuning": {
    s: "Adds serpentines or trombone patterns to short traces so that signals in a bus or pair reach their destinations within allowed length or delay differences.",
    d: "The tuner measures current length, including vias and package delay if available, compares it with a target or with the longest in the group, and inserts meander shapes of a given amplitude and spacing in free space. Interactive mode shows live progress; automatic mode fills tolerances. The meander must obey the clearance rule and keep spacing to avoid coupling to itself. It is hard because meanders change crosstalk and require room, so tuning late in a dense layout often fails, and changing a route afterward invalidates the matching.",
    k: ["Meander at the source end vs near the mismatch: fixing the error where it occurs preserves timing relationships along the path, while source-end tuning is easier to fit.", "Tuning to length vs delay: simple targets vs correct matching across different layers and dielectric velocities."],
    p: ["Serpentines with spacing under three trace widths couple to themselves and make the delay shorter than the length suggests.", "Tuned traces later rerouted by a shove lose their matching."],
    v: "Tune a data group to the target tolerance, then re-measure each net's length with via and package contributions included and confirm the spread is within the rule on every net.",
    dep: ["interactive-router", "electrical-constraints", "clearance-queries"]
  },
  "fanout-and-escape": {
    s: "Creates the first short tracks and vias that bring signals out from dense fine-pitch packages to routable space, usually before routing the rest.",
    d: "For grid array and fine-pitch packages, pads are too closely spaced for normal routing. A fanout tool places a dog-bone via or via-in-pad per pad with a short stub, in a pattern that follows the stackup and via rules, and plans which signals escape on which layer. Escape routing continues from these vias toward the rest of the board. It is hard because escape capacity is limited by pitch and via size, and a poor pattern for the inner pads blocks everything behind it, forcing a different via type or more layers.",
    k: ["Dog-bone fanout vs via-in-pad: dog-bones use standard fabrication and are cheaper, via-in-pad frees space but needs fill and increases cost.", "Fanout before routing vs routing directly: guaranteed access to every pin early, but an over-constrained pattern can reduce flexibility."],
    p: ["A fanout whose via pad touches adjacent pad clearance produces dozens of violations that are repeated across the whole package.", "Planning too few layers for escape forces a late stackup change."],
    v: "Fan out a grid array, count signals escaped per layer, confirm every pad has a via with no clearance violation, and verify the tool's escape plan matches the layer count in the stackup.",
    dep: ["via-definitions", "interactive-router", "layer-stackup"]
  },
  "autorouter": {
    s: "Routes many or all nets automatically by searching for tracks and vias that satisfy rules, producing a complete or partial route that engineers then refine.",
    d: "The autorouter converts the board into a routing grid or a topological graph, orders nets, finds paths with search and rip-up and retry, and optimizes the result by smoothing. It reads rules, keepouts, layers and fixed tracks, and can be limited to chosen nets. Output is committed as ordinary tracks. It is hard because the problem is intractable at scale: results vary with net ordering, quality is hard to score, and automatic routing ignores intent such as return paths, matching and aesthetic, which is why it is mostly used on low-speed nets.",
    k: ["Autorouting low-speed nets and hand routing critical ones vs routing everything by hand: saves hours on bulk connections, but the result needs cleaning and cannot be trusted for sensitive nets.", "Grid-based vs gridless search: grid methods are simpler and robust, but gridless results use space better and avoid snapping artifacts."],
    p: ["Autorouted tracks cross split planes, leaving return current paths that cause noise.", "A run that stops at ninety-five percent completion leaves a few impossible nets that need manual rework of everything around them."],
    v: "Run the autorouter on a bounded set of nets, then check completion count, run the full rule check for zero violations, and inspect that locked and critical nets were left untouched.",
    dep: ["clearance-queries", "rule-scopes", "spatial-index", "ratsnest"]
  },
  "copper-pours": {
    s: "Fills areas with copper that connects to a net, such as ground or power planes, while keeping clearance from other nets and connecting to pads with thermal relief.",
    d: "A pour is defined by an outline, a net and a layer. The fill algorithm subtracts clearance around other-net objects from the area, removes slivers and islands below a size, and creates spokes or direct connections at same-net pads. Fills are recomputed when anything changes and can be slow. Priority resolves overlapping pours. It is hard because of numerics and meaning: tiny slivers and dead islands cause manufacturing problems, a pour that fails to connect to its net is a hidden open, and fills must be recomputed before every check or output.",
    k: ["Solid fill vs hatched fill: solid gives lower impedance and current capacity, hatching helps flexibility and manufacturing balance but has higher resistance.", "Thermal relief spokes vs direct connection: easier soldering and rework, against higher inductance and lower current capacity."],
    p: ["Outputs generated from an outdated fill leave the manufactured board with copper that does not match the checked design.", "Islands of copper not connected to any net act as antennas, or cause etching defects."],
    v: "Refill all pours, run the rule check, and confirm the fill has no isolated islands, every same-net pad connects, and the copper area matches the design in a fabrication viewer.",
    dep: ["polygon-boolean-ops", "clearance-queries", "connectivity-engine", "layer-stackup"]
  },
  "via-stitching": {
    s: "Places arrays of vias to join copper areas on different layers, tying ground planes together and creating shielding fences along sensitive traces or board edges.",
    d: "Stitching tools add vias on a grid or along a path inside a pour or along a trace, with spacing derived from the highest frequency of concern, often a fraction of a wavelength. Each via must connect same-net copper on both layers, and clear all other-net objects and keepouts. Fences use the same technique along a trace on both sides. It is hard because spacing, via count and routing space compete: too few vias leave resonant slots between planes, and too many perforate the plane and cut return paths.",
    k: ["Dense stitching vs sparse stitching: better shielding and plane coupling at high frequency, but a perforated plane and higher drill cost.", "Grid stitching vs path-based fences: uniform coverage and simplicity, but fences protect specific traces with fewer vias."],
    p: ["A row of stitching vias with overlapping antipads creates a slot in the plane that interrupts return current.", "Stitching vias placed under parts or pads conflict with assembly or tenting rules."],
    v: "Add stitching to a plane pair and run the check for zero violations, then verify spacing against the highest frequency of concern and that every via ties same-net copper on all intended layers.",
    dep: ["via-definitions", "copper-pours", "clearance-queries"]
  },
});
