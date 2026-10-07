// Details for the PCB design plate, part 3: rule checking, signal and power integrity, simulation hooks, manufacturing outputs.
ATLAS.details("pcb-design", {
  "drc-engine": {
    s: "Checks every object in the board against the rule set for clearance, width, drill, annular ring, connectivity and other limits, and reports violations with locations.",
    d: "The engine enumerates object pairs near each other using the spatial index, resolves the rule for each pair through the scope system, and measures the distance or property against the limit. Besides spacing it checks minimum widths, drill sizes, annular rings, silkscreen over pads, courtyard overlap, unconnected nets and short circuits between nets. Each result is a marker with the objects and measured value. It is hard because of volume and numerics: millions of objects must be checked quickly, and results at the exact limit depend on rounding and arc approximation.",
    k: ["Full check on demand vs incremental checking only of changed regions: simple and complete, versus fast but requiring correct invalidation of everything an edit affects.", "Exact geometry distance vs polygon approximation of curves: exact is accurate, approximation is faster but can disagree with the fabricator at the limit."],
    p: ["A check run before the copper pours are refilled passes a board that fails once the fill is current.", "Rounding at the limit makes the tool and the fabricator's checker disagree on borderline spacing."],
    v: "Place a deliberately violating pair of tracks at one tenth of a millimeter below the rule and confirm a violation appears with the correct measured value, then fix it and confirm the marker disappears on re-run.",
    dep: ["clearance-queries", "rule-scopes", "spatial-index", "connectivity-engine"]
  },
  "online-drc": {
    s: "Runs rule checks continuously while editing, flagging violations immediately and preventing or highlighting illegal actions as they happen.",
    d: "On every edit the engine checks only the objects touched and their neighbors, within the interactive time budget, and updates markers. In strict modes it refuses moves that would cause a violation, in advisory modes it just marks them. It is the same rule logic as the batch engine but organized for incremental work. The difficulty is correctness of incremental results: an edit can affect violations far from the changed object, such as a pour refill, so partial results must be reconciled with a full check before output.",
    k: ["Blocking illegal edits vs only marking them: no violations ever enter the design, but temporary illegal states during rearrangement become impossible.", "Checking at interactive rates with deferred checks for expensive rules: smooth editing, but some violations appear only later in a full run."],
    p: ["Online results are trusted at release and the full check is never run, missing violations from deferred rules.", "Turning off live checking on a large board for speed leaves hundreds of unnoticed errors."],
    v: "Drag a track to violate clearance and confirm the marker appears within one interaction frame; then run the full check and confirm it reports the identical set of violations.",
    dep: ["drc-engine", "spatial-index", "change-journal"]
  },
  "erc": {
    s: "Examines the schematic's connectivity for electrical mistakes such as unconnected pins, conflicting outputs, floating inputs and power pins with no supply.",
    d: "The check runs over the netlist and uses pin electrical types: two outputs on one net, an input with no driver, a power input on a net with no power output, and missing no-connect marks. A matrix defines which pin type pairs are errors, warnings or allowed. Results are placed on the schematic as markers. It is hard to tune: the pin type system is coarse, so real parts with tri-state, open-collector or bidirectional pins create many false alarms, which engineers then silence in bulk and miss real errors.",
    k: ["Strict pin-type matrix vs permissive: catches wiring mistakes early, but false positives from real parts lead engineers to ignore results.", "Checking after every edit vs on demand: instant feedback, but noise in half-finished drawings."],
    p: ["Marking pins as passive or not-connected to remove warnings hides a real floating input.", "Power flags added only to satisfy the check make an unpowered net appear powered."],
    v: "Draw a net with two outputs and a floating input, run the check and confirm both are reported with the exact pins, then correct them and confirm a clean report.",
    dep: ["connectivity-engine", "symbol-library", "global-nets"]
  },
  "parity-check": {
    s: "Compares the schematic and board for differences in parts, footprints, values and connections, and reports where the two no longer describe the same circuit.",
    d: "The check builds the netlist from each side and matches parts and nets through identity, then lists missing or extra parts, footprint mismatches, changed values and nets that connect different pins. It runs before forward and back annotation and at release. Differences can be accepted, pushed to one side or waived. It is hard because it is only as good as the identity match: renamed parts and nets read as deletions and additions, and engineers learn to accept all changes without reading them.",
    k: ["Matching by stable identity vs by name: survives renames and renumbering, but requires identity to be preserved by every operation including imports.", "Blocking release on parity differences vs warning: guarantees the board equals the schematic, but intentional differences need explicit waivers."],
    p: ["Accepting all differences on a large change list updates the board from an incomplete schematic.", "A parity check run against an old netlist file instead of the live schematic reports a clean result."],
    v: "Change a footprint on the board only and one net connection on the schematic only, run the check, and confirm exactly those two differences are reported, with the correct part and net named.",
    dep: ["netlist-generator", "connectivity-engine", "object-model", "back-annotation"]
  },
  "violation-waivers": {
    s: "Records accepted exceptions to rule violations with a reason and owner, so a known, justified deviation does not hide new problems or block release.",
    d: "A waiver ties to a specific violation, identified by rule, location and objects, and carries a justification, author and date. The report shows waived items separately from open ones. Waivers can expire or be invalidated if the geometry changes. A browser lists violations with filters and jumps to them. The hard part is waiver rot: a waiver granted for one condition keeps suppressing a worse condition at the same place, so waivers must match narrowly and drop when the underlying values move.",
    k: ["Waivers bound to exact objects and values vs to a location only: narrow waivers cannot hide new problems, while location-only waivers survive edits but may cover them.", "Free-form justification vs mandatory reason codes: easier to enter, versus consistently reviewable and searchable."],
    p: ["A waiver written for a clearance of a given value continues to pass a later, smaller clearance.", "Bulk waiving before a deadline removes the signal from the report for everyone downstream."],
    v: "Waive one violation, move the offending objects closer, and confirm the waiver no longer applies and the violation returns as open.",
    dep: ["drc-engine", "object-model", "review-and-markup"]
  },
  "dfm-analysis": {
    s: "Checks the design against manufacturing process limits beyond basic rules, such as acid traps, slivers, copper balance, drill-to-copper and solder mask bridges.",
    d: "Design for manufacturing analysis examines the generated layers rather than the editing model, looking for features that are legal by rule but hard to produce reliably: acute angle copper junctions, thin mask dams between pads, uneven copper distribution that warps the board, and drills too close to edges. Some tools run the fabricator's own rule deck. Results rank by yield risk. It is hard because limits are process-specific and statistical, and over-flagging costs time while under-flagging costs scrap.",
    k: ["Checking the designer's model vs checking generated output data: the first is fast and editable, the second sees exactly what the fabricator will receive.", "Generic limits vs a fabricator's own deck: broad usefulness, but only the fabricator's deck predicts their pass or fail."],
    p: ["Mask bridge between fine-pitch pads is too thin to be produced, so the fabricator removes it and solder bridges form.", "Unbalanced copper warps the board in reflow, and nothing in the design rules mentions it."],
    v: "Run the analysis on generated fabrication data and send the same files to the fabricator's own DFM review; confirm both flag the same significant items and that none are surprises on the fabricator side.",
    dep: ["fab-image-export", "fab-capability-profiles", "polygon-boolean-ops"]
  },
  "dfa-analysis": {
    s: "Checks assembly feasibility: spacing between parts for placement and rework, orientation consistency, fiducials, tombstoning risk and clearances for soldering and inspection.",
    d: "Design for assembly rules use courtyards, part heights and package types to find parts too close for pickup or reflow, tall parts shading small ones, missing fiducials and panel rails, and thermal imbalance on small passive pads. It also checks that polarity marks and pin one are visible on silkscreen and that test points are accessible. It is hard because assembly rules are the assembler's, not universal: nozzle sizes, solder process and rework policy vary by line.",
    k: ["Assembly rules from the assembler's capability sheet vs generic guidelines: results matching the line that will build it, at the cost of extra data per assembler.", "Hard blocking on DFA errors vs advisory: prevents unbuildable boards, but some risks are acceptable for prototypes."],
    p: ["Two-sided assembly with heavy parts on the second pass lets them fall off in reflow.", "Missing fiducials or panel rails lead to placement errors that appear only on the assembly line."],
    v: "Run the check with the assembler's profile and confirm it flags a part placed closer to a tall neighbor than the profile allows, and passes after the part is moved.",
    dep: ["drc-engine", "pick-and-place-files", "model-3d-library"]
  },
  "impedance-calculator": {
    s: "Computes the characteristic impedance of a trace from its width, spacing, copper thickness and the dielectric stack, for single-ended and differential structures.",
    d: "Given a cross-section of copper over dielectric layers, the calculator uses closed-form models or a field solver to return impedance, propagation delay and loss. Widths can be solved for a target impedance, and results feed the width rules and delay constraints. It reads layer data from the stackup and materials. It is hard because the formulas have limited validity: they assume simple geometries, ignore etch trapezoid shape and solder mask, and the manufactured stackup differs from the nominal one.",
    k: ["Closed-form formulas vs a field solver: instant answers for common structures, but only a solver is trustworthy for unusual geometries and close coupling.", "Nominal values vs tolerance ranges: a single clear number, but a range reveals whether the design tolerates fabrication variation."],
    p: ["Ignoring solder mask over the trace shifts impedance by several ohms for fine geometry.", "Calculating on a stackup the fabricator later changes leaves the design with the wrong widths."],
    v: "Calculate widths for a target impedance, have the fabricator produce a test coupon with those widths, and compare measured impedance with the tool's value within the quoted tolerance.",
    dep: ["layer-stackup", "dielectric-materials", "cross-section-solver"]
  },
  "cross-section-solver": {
    s: "A two-dimensional electromagnetic solver that computes impedance, coupling, delay and loss from the cross-section of a trace structure and its surrounding materials.",
    d: "The solver discretizes the cross-section with a mesh, solves the field equations for capacitance and inductance matrices at one or several frequencies, and derives per-unit-length parameters for coupled lines. Results feed channel models. It handles arbitrary shapes, such as trapezoidal traces, plane cutouts and coplanar structures. It is hard because mesh quality affects accuracy, and the output is only as good as the material model: roughness and frequency-dependent loss need measured data to be believable.",
    k: ["Full field solution vs analytic approximation: handles odd structures and close coupling, with greater computation time.", "Frequency-dependent material models vs a single value: accurate loss at multi-gigabit rates, but requires data many designs do not have."],
    p: ["A coarse mesh near trace corners underestimates capacitance and misreports impedance.", "Extracting once and using the result for a different part of the board where the stackup differs gives wrong values."],
    v: "Solve a structure with a known analytic answer, such as a simple microstrip, and confirm the result matches within a small percentage; then compare a complex structure with a published or measured value.",
    dep: ["dielectric-materials", "geometry-kernel"]
  },
  "io-buffer-models": {
    s: "Behavioral models of device drivers and receivers, describing their output waveforms, thresholds and capacitance without exposing transistor-level detail.",
    d: "A buffer model is a table-based description of a pin: output current against voltage for pull-up and pull-down, voltage against time under standard loads, input thresholds and pin capacitance. Such models come from device vendors in a standard text format and are assigned per pin of a part. Channel simulation uses them as sources and sinks. It is hard because the model must match the exact device, speed grade, drive setting and corner, and an incorrectly assigned or generic model gives reflections and overshoot that look plausible but are fiction.",
    k: ["Behavioral models vs transistor-level models: fast, shareable and safe for vendors, but they cannot represent every nonlinear effect and are limited in accuracy.", "Per-pin assignment by hand vs templates by interface: precise control, but interface templates reduce mistakes on large buses."],
    p: ["A model for the wrong drive strength setting gives overshoot predictions that do not match the board.", "Package parasitics left out of the buffer model misses a significant part of the discontinuity."],
    v: "Assign a model, simulate a simple point-to-point net, and compare the simulated rise time and overshoot with a bench measurement of the real device on the same net.",
    dep: ["simulation-model-assignment", "design-database"]
  },
  "channel-simulation": {
    s: "Simulates a signal path from driver to receiver, including trace, vias, connectors and package, to predict eye opening, reflections, loss and timing margin.",
    d: "The tool extracts the physical path from the board, converts each section to a model, such as transmission line segments and via models, joins them with buffer and package models, and runs a time- or frequency-domain simulation. Output is waveforms, eye diagrams and margins against an interface specification. It is hard because extraction accuracy decides everything: vias, connectors and plane gaps dominate at high rates, and their models need three-dimensional solvers or measurement, which are far costlier than line theory.",
    k: ["Pre-layout simulation with ideal lines vs post-layout with extracted geometry: early guidance to set constraints, whereas post-layout is the only one that sees the real routing.", "Time-domain vs frequency-domain analysis: time domain shows nonlinear driver behavior, frequency domain is faster for linear passive channels and statistical eye estimates."],
    p: ["Ignoring via stubs leaves a resonance that closes the eye in the real board.", "A simulation done on a placeholder net before routing is carried into sign-off unchanged."],
    v: "Simulate the routed channel, then probe the real board at the receiver and compare eye height and rise time with the simulation, confirming agreement within the stated margin.",
    dep: ["io-buffer-models", "cross-section-solver", "simulator-bridge", "layer-stackup"]
  },
  "crosstalk-analysis": {
    s: "Estimates unwanted coupling between neighboring traces from their geometry, spacing and parallel length, and flags aggressor and victim pairs that exceed a limit.",
    d: "The analysis finds segments of different nets running in parallel, computes coupling coefficients from the cross-section solver, and estimates near-end and far-end noise for the signal edge rate involved. Results are ranked per victim and can be shown as a heat map on the board. Quick screening uses rules of thumb; detailed analysis simulates the coupled lines. It is hard because the worst case depends on switching patterns and timing, which layout alone does not know.",
    k: ["Geometric screening vs full simulation: screening scans the whole board quickly, but only simulation accounts for switching patterns and terminations.", "Spacing rules in units of trace width vs absolute distances: scales with dielectric height as coupling does, but is harder to relate to the fabricator's limits."],
    p: ["Long parallel runs on adjacent layers without a plane between them couple more strongly than same-layer spacing suggests.", "Rule checks pass while an interface still fails, because spacing was checked and edge rates were not."],
    v: "Route two nets in parallel at two spacings, simulate or measure the coupled noise on a quiet victim for each and confirm the tool's estimate follows the same trend and magnitude.",
    dep: ["cross-section-solver", "channel-simulation", "spatial-index"]
  },
  "pdn-analysis": {
    s: "Analyzes the power delivery network: DC voltage drop across planes and traces, and impedance of the supply against frequency including decoupling capacitors.",
    d: "For DC, the tool meshes copper shapes and vias into a resistive network, applies loads and sources, and reports voltage at each load and current density. For AC, it builds a model of planes, capacitors with their parasitics and the regulator, then computes impedance versus frequency against a target. Results guide capacitor count and placement. It is hard because the model needs accurate load data and capacitor models, and because small things such as mounting inductance and via counts dominate high-frequency results.",
    k: ["Simple lumped rules for decoupling vs full plane-level simulation: quick and often adequate at moderate speeds, but fails to predict resonances on fast, high-current designs.", "Vendor capacitor models with bias and temperature effects vs nominal values: realistic derating, but heavy data requirements."],
    p: ["Capacitors modeled at nominal value ignore derating under bias and lose most of their capacitance in practice.", "Current density limits are checked on tracks but not through vias, which fail first."],
    v: "Compute DC drop for a load, then measure voltage at the load and the source on the real board at that current and compare the drop with the tool's result.",
    dep: ["layer-stackup", "copper-pours", "via-definitions", "simulator-bridge"]
  },
  "thermal-analysis": {
    s: "Estimates temperature rise across the board from power dissipation, copper area and airflow, to find hot spots and check that parts stay within limits.",
    d: "The analysis takes power per component, the board's copper distribution and thermal vias, and ambient and airflow conditions, and solves heat conduction through the layers and convection at the surfaces. Output is a temperature map and part junction estimates. Current and Joule heating of tracks can be coupled in. It is hard because it needs inputs that are often unknown at design time, such as true dissipation and enclosure airflow, so results are best used to compare options and not as absolute predictions.",
    k: ["Board-level conduction model vs full computational fluid dynamics of the enclosure: fast iteration on layout, but ignores real airflow, which dominates in sealed products.", "Steady-state vs transient analysis: simple and conservative, but bursty loads need transient results to assess peaks."],
    p: ["Assuming constant power for a part whose dissipation changes with its own temperature underestimates hot spots.", "Ignoring neighboring boards and the enclosure hides the real temperature rise."],
    v: "Power the board at its design load with a thermal camera or thermocouples on key parts, and compare measured temperatures with the map, confirming hot spots are in the same places.",
    dep: ["layer-stackup", "copper-pours", "model-3d-library"]
  },
  "simulation-model-assignment": {
    s: "Associates each part in the schematic with a simulation model, such as a behavioral or transistor-level description, and maps its symbol pins to the model's terminals.",
    d: "Models live in files or libraries and are attached to a symbol or a component database row, with a pin-mapping table from symbol pins to model nodes and with parameters set from part values. The assignment records which model and version, and the choice of variant, such as typical or worst case. Parts without models are replaced with ideal substitutes or flagged. It is hard because most parts have no trusted model, and a model supplied by a vendor may be for a different part, process or version.",
    k: ["Models attached to library parts vs attached per design: reuse and consistency, versus per-project control of corner and fidelity.", "Strict requirement that every part has a model vs substituting ideal parts: simulation results cover the whole circuit, but forcing models invites low-quality placeholders."],
    p: ["Pin mapping errors between symbol and model swap the roles of terminals and give plausible but wrong waveforms.", "A model for a similar part number is used for the actual part without verification."],
    v: "Simulate a stage with a known response, such as a datasheet test circuit, and compare the result with the datasheet's plotted behavior to confirm model and pin mapping are correct.",
    dep: ["symbol-library", "component-database", "object-model"]
  },
  "simulation-netlist-export": {
    s: "Writes the schematic's connectivity, parts, models and analysis settings in the text format that an external circuit solver reads.",
    d: "The exporter flattens the hierarchy, replaces each part with its model call and parameters, adds sources and analysis directives, and writes a netlist the solver understands. Net names are translated to the solver's allowed characters, ground is mapped to the solver's reference node, and variant selections are applied. The hard part is semantic fidelity: solver syntax differs in how it handles parameters, subcircuits and node naming, so an export must be tested per solver, and silent differences produce results that cannot be compared with another tool.",
    k: ["Exporting to a generic common format vs a solver-specific dialect: portability, but advanced features are available only in the specific dialect.", "Exporting the whole design vs a selected region: runs fast on the part of interest, but loading effects from the rest are lost."],
    p: ["Names with special characters get mangled differently in the netlist and in the result labels, breaking probe mapping.", "No explicit ground mapping makes the solver report floating nodes for a perfectly good circuit."],
    v: "Export a small circuit, run it in the solver, and compare node voltages with hand calculation; confirm every schematic net maps to one solver node and ground is the reference.",
    dep: ["netlist-generator", "simulation-model-assignment", "design-variants"]
  },
  "simulator-bridge": {
    s: "Starts an external solver on the exported netlist, tracks the run, collects results and handles errors, so simulation can be launched from inside the design tool.",
    d: "The bridge launches the solver as a separate process or service with the netlist and settings, monitors progress and cancels on request, and loads the result file when it finishes. Solver messages and errors are parsed and linked back to schematic items where possible. It can run batches of analyses and jobs on remote machines. It is hard because solvers are external and varied: result formats differ, runs can take hours, solver versions change numerical behavior, and failures often report an internal node name that means nothing on the schematic.",
    k: ["Out-of-process solver vs embedded library: isolates crashes and licensing and allows any solver, but exchanges data through files and needs process management.", "Local runs vs remote jobs: no setup locally, but long sweeps need a farm and a queue."],
    p: ["An upgraded solver changes convergence behavior, and previously working simulations fail or give different numbers.", "Error messages quoting solver-internal names cannot be traced to the schematic."],
    v: "Run a simulation, force a netlist error such as a missing model, and confirm the tool reports the failure referencing the schematic part, and that a corrected run returns results and loads waveforms.",
    dep: ["simulation-netlist-export", "waveform-cross-probing"]
  },
  "waveform-cross-probing": {
    s: "Links simulation results to the schematic so that clicking a net or pin shows its waveform, and selecting a waveform highlights the net it came from.",
    d: "Result files use solver node names; the tool keeps a mapping from schematic nets and pins to those names, including through hierarchy and variants. A viewer plots the signals with measurement cursors, and probes can be placed on the schematic before running. Cross-probing also supports comparing waveforms across runs. It is hard because the mapping is easily lost: name translation, flattened hierarchy and repeated sheets produce node names that do not read back to a unique schematic object.",
    k: ["Probing by schematic net vs by solver node: engineers think in nets and parts, but names must be kept reversible to find the node.", "Storing results with the design vs as disposable files: reproducible history, but large files that need cleanup and versioning."],
    p: ["A waveform shown for a net in one instance of a repeated sheet is read as another instance.", "Stale results are viewed after the schematic has changed, and engineers trust old waveforms."],
    v: "Probe a net in a repeated sub-sheet, then confirm the plotted trace matches that instance by changing a value there and seeing only that trace change.",
    dep: ["simulator-bridge", "cross-probing", "connectivity-engine"]
  },
  "sweeps-and-corners": {
    s: "Runs a simulation repeatedly across ranges of component values, temperatures and supply voltages, to see how a design behaves over tolerances and operating conditions.",
    d: "The user specifies parameters to vary, such as a resistor value, a supply voltage or a temperature, with steps, lists or statistical distributions, and a set of named corners combining worst-case settings. The bridge generates one run per combination, collects results and presents summaries such as minimum margin and yield estimate. It is hard because combinations multiply quickly, and corners from datasheets are conservative envelopes that real parts rarely hit together, while Monte Carlo needs a believable statistical model.",
    k: ["Worst-case corners vs statistical sampling: a guaranteed bound, but over-conservative designs; sampling estimates yield, but needs distribution data.", "Full factorial sweeps vs sensitivity-based reduction: exhaustive and simple, but cost grows exponentially with parameters."],
    p: ["Varying each parameter alone misses failures that appear only when two parameters shift together.", "Tolerance data of parts in the model differs from the purchased parts' real tolerance."],
    v: "Sweep a resistor in a divider over its tolerance range and confirm the reported output extremes match hand calculation at both ends of the range.",
    dep: ["simulator-bridge", "simulation-model-assignment"]
  },
  "pin-assignment-exchange": {
    s: "Exchanges pin assignments with a programmable logic design tool, so signals can be placed to simplify routing and the schematic and device constraints stay equal.",
    d: "Programmable devices let the designer choose which signal uses which pin within electrical bank and standard rules. The exchange imports a pin list from the logic tool into the symbol and netlist, or exports board-driven swaps back as constraints. It checks bank voltage compatibility and special-purpose pins. It is hard because both sides hold part of the truth: the logic tool knows timing and bank rules, the board knows routing, and swaps made on one side must be reflected on the other without losing consistency.",
    k: ["Pin assignment driven by logic tool vs by board layout: logic first guarantees timing closure, layout-driven swaps reduce routing and layers but may break timing.", "Automatic round-trip import vs manual review: speed and fewer transcription errors, but changes from another team arrive unexamined."],
    p: ["A pin swap approved on the board puts a signal in a different bank with a different voltage standard.", "A swap in the logic tool is not carried to the schematic, and the fabricated board routes the old pin."],
    v: "Swap two signals in the logic tool, import the new pin list, and confirm the schematic, netlist and board ratsnest all show the new assignment and the bank voltage check passes.",
    dep: ["back-annotation", "symbol-library", "netlist-generator"]
  },
  "fab-image-export": {
    s: "Writes each copper, mask, legend and paste layer as a vector image file that the fabricator uses to make film or direct imaging data.",
    d: "Each layer is converted to a sequence of draw and flash operations with apertures, in a widely used plain-text image format. Settings include coordinate precision, units, polarity, aperture usage and file naming per layer. Copper pours are written as filled regions, and pads and vias as flashes. The set of files is checked in a viewer before sending. It is hard because the format has many dialects and options, and errors are visual: a wrong polarity or offset yields plausible but wrong layers that the fabricator may process without noticing.",
    k: ["Extended format with embedded apertures vs legacy format with separate aperture lists: self-contained files and fewer mismatches, but older fabricators may require the legacy form.", "Fixed coordinate precision vs full precision: predictable files, but low precision rounds fine geometry and creates small violations."],
    p: ["Mixed units between image and drill files shift holes relative to pads by a constant factor.", "Exporting without refilling pours produces layers that differ from the verified design."],
    v: "Re-import the exported files in an independent viewer, overlay the layers and drill file, and compare against the design: all layers align, polarity is right, and pad positions match the board to a small tolerance.",
    dep: ["polygon-boolean-ops", "pad-and-padstack-model", "coordinate-and-units", "copper-pours"]
  },
  "drill-and-route-files": {
    s: "Produces the files that tell the drilling and routing machines where to make holes, slots and the outline, with tool sizes and plating information.",
    d: "Drill data lists tool diameters and hit coordinates, separated by plated and non-plated holes and by drill spans for blind and buried vias. Slots and the board outline are given as routed paths. Files use a plain-text machine format with a header declaring units and number format. It is hard because errors cannot be seen in the file: the coordinate format, the zero suppression and the origin must agree with the image files, and the finished-hole versus drill-size convention differs.",
    k: ["Separate files per drill span and plating vs one combined file: unambiguous for fabrication, but more files to manage and possibly misplace.", "Coordinates relative to the board origin vs the drill origin: simple when both match the image files, but a different origin shifts everything."],
    p: ["Zero suppression mismatch scales coordinates by a power of ten, putting holes far off the board.", "Plated and unplated holes mixed in one file get plated by default."],
    v: "Load drill and image files together in a viewer and confirm each hole lands in its pad center, plated flags are right, and hole counts per tool match the tool's report.",
    dep: ["via-definitions", "pad-and-padstack-model", "board-outline", "coordinate-and-units"]
  },
  "intelligent-fab-package": {
    s: "Writes one package that carries layers, drill data, stackup, netlist and component data together, so the fabricator can verify connectivity and avoid file mismatches.",
    d: "Rather than many separate files, the package holds the layer images, drills, stackup, nets and optionally parts in one structured file defined by an open standard. The fabricator imports it and compares the netlist to the copper to catch opens and shorts. Variants exist for fabrication and for assembly. It is hard because support varies: fabricators implement parts of the standard, and ambiguities lead to different interpretation, so a package that imports correctly at one supplier misbehaves at another.",
    k: ["Single intelligent package vs classic multi-file set: fewer mix-ups and netlist checking, but depends on the fabricator's import quality.", "Including the netlist vs images only: lets the fabricator find opens and shorts, but exposes more design data."],
    p: ["A fabricator that ignores the stackup section builds a default stack and impedance is wrong.", "Netlist included but never compared leaves the benefit unused."],
    v: "Import the package in the fabricator's viewer or an independent reader, and confirm the stackup, netlist and layers match; a deliberately cut trace produces an open-circuit report.",
    dep: ["fab-image-export", "drill-and-route-files", "layer-stackup", "netlist-generator"]
  },
  "pick-and-place-files": {
    s: "Lists each part's designator, position, rotation and side, used by assembly machines to place components on the board.",
    d: "The file is a table from the board database: reference, package, coordinates relative to a chosen origin, rotation and layer, filtered by variant and by fitted status. Rotation conventions differ between machines, and some parts have an origin or zero rotation that does not match the assembler's library. Fiducial locations may be included. It is hard because the convention is the assembler's: a systematic rotation offset for one package type rotates every part of that type, which is discovered only after assembly.",
    k: ["Centroid of the footprint body vs the pad pattern origin: the body centroid matches how many machines pick, but footprint origins are defined by library convention and may not match.", "Per-assembler rotation correction tables vs fixing footprints: no change to library, but the table must follow the assembler and the part."],
    p: ["Rotation zero in the footprint is a different orientation than the assembler's library, so all polarized parts of that type are rotated.", "Fitted status ignored, so unfitted parts are listed for placement."],
    v: "Overlay the file's coordinates and rotations on the board image and the assembler's package orientation chart, and confirm a sample of each package type, including polarized ones, matches.",
    dep: ["design-variants", "footprint-library", "coordinate-and-units"]
  },
  "paste-and-stencil-data": {
    s: "Defines the solder paste openings for stencil making, with aperture shapes and sizes derived from pads and adjusted for the process.",
    d: "Paste layers are generated from pads, by default equal to the pad, then adjusted: reduced to limit solder volume, split into smaller windows on large thermal pads and omitted on through-hole or tented parts. Stencil thickness and aperture ratio rules limit how small openings can be. Data goes to the stencil maker as image files. It is hard because the paste volume is a process variable: too little gives open joints and too much gives bridges, and the correct answer depends on package, stencil thickness and assembler preferences.",
    k: ["Paste defined in the footprint vs generated by board-wide rules: tuned per package, but shared board rules are easier to maintain and apply uniformly.", "Split windows on large pads vs a single large opening: avoids floating and voiding on thermal pads, at the cost of lower coverage."],
    p: ["A single large aperture on a thermal pad floats the part and produces voids.", "Paste openings on pads intended for hand soldering add unwanted solder."],
    v: "Check paste coverage per pad type against the assembler's guidelines, and inspect first-article solder joints after reflow for volume, bridging and voids.",
    dep: ["pad-and-padstack-model", "fab-image-export", "footprint-library"]
  },
  "panelization": {
    s: "Arranges multiple copies of a board, or several different boards, in one manufacturing panel with rails, fiducials, tooling holes and break-away tabs.",
    d: "The tool places board instances in a grid with gaps, adds break-away features such as tabs with perforations or routed channels, rails for conveyor handling, tooling holes and global fiducials. It generates a combined set of layer and drill files for the panel. Some work is left to the fabricator, which has its own panel sizes and rules. It is hard because panel design depends on the assembly line and the board shape, and break-away features can damage parts near the edge if clearances are missing.",
    k: ["Designer-produced panel vs fabricator-made panel: full control over tabs and fiducials, but the fabricator's panel sizes make material use better.", "V-scoring vs routed tabs: efficient for straight edges, but needs a minimum thickness and does not suit shaped boards."],
    p: ["Components too close to the break-away tab crack when the boards are separated.", "Rotated instances in one panel put polarized parts in different directions for the placement program."],
    v: "Generate the panel files, load them in a viewer and verify spacing, fiducials and tab positions, then break out one board from a sample panel and confirm parts near the edge are intact.",
    dep: ["board-outline", "fab-image-export", "drill-and-route-files"]
  },
  "fabrication-drawing": {
    s: "A drawing that states what cannot be shown in the layer images: stackup, materials, tolerances, finish, colors, impedance requirements and special instructions.",
    d: "The drawing lists layer order and thicknesses, material type, copper weights, surface finish, mask and legend colors, minimum features, hole table with sizes and counts, impedance controlled nets, quality class and test requirements, plus outline dimensions. Many items are generated from the design, others are typed notes. It is the contract between designer and fabricator. It is hard because notes contradict the data: a note asking for a finish or thickness different from the stackup in the files creates an ambiguity that the fabricator resolves their own way.",
    k: ["Generated tables vs free-text notes: tables stay correct when the design changes, but unusual requirements need free text, which can drift.", "Detailed drawing vs referencing a standard class: more precise and unambiguous, but longer and more places to be wrong."],
    p: ["Notes that conflict with the stackup in the files lead to a board built to the wrong specification.", "A drawing that is not updated after a late change describes the previous revision."],
    v: "Have a person unfamiliar with the design read the drawing next to the generated files and list every inconsistency; confirm none remain, and the hole table matches the drill file counts.",
    dep: ["layer-stackup", "drill-and-route-files", "electrical-constraints"]
  },
  "assembly-drawings": {
    s: "Drawings that show each part's position, orientation and designator on the board, used for assembly, inspection and rework.",
    d: "Assembly views show the outline, courtyard or body shape and designator of each part per side, with polarity and pin one marks and optional notes for special parts. They are generated from the board database with the variant applied, and may include zoomed regions for crowded areas. Hand assembly and rework depend on them. It is hard to make them legible: designators on dense boards overlap, and generated drawings for the base variant are wrong for variants where parts are omitted or replaced.",
    k: ["Generated from the live design vs drawn by hand: always matches the board, but crowded areas need manual adjustment of text.", "One drawing for all variants vs one per variant: simple to manage, but only per-variant drawings show what is actually fitted."],
    p: ["Designators drawn at positions that overlap other parts make rework guesses.", "Drawings generated before the last ECO show moved or removed parts."],
    v: "Compare the drawing with a populated board for several parts per variant, confirming designator, polarity and position match physical reality.",
    dep: ["design-variants", "footprint-library", "annotation"]
  },
  "bare-board-test-data": {
    s: "Exports connectivity data for electrical testing of unpopulated boards, so a test fixture or flying probe can find opens and shorts.",
    d: "The test data lists each net with the coordinates of its test points, which are pads and holes on the finished board, from the netlist and geometry. The fabricator's test system probes them, either with a custom fixture or with moving probes, and compares measured continuity and isolation with the netlist. The data may also include controlled-impedance coupon locations. It is hard because the test is only as good as the netlist it is given: if the netlist was generated from the board instead of the schematic, a design error is propagated as correct.",
    k: ["Netlist from the schematic vs from the board: the schematic catches errors that layout introduced, whereas board-derived data validates only manufacturing.", "Full testing vs sampled testing: full test finds every open and short, but costs more on high-density boards."],
    p: ["Test data derived from the board carries a layout error through, since the board matches itself.", "Test points hidden by components, mask or stencil cannot be probed and are skipped silently."],
    v: "Intentionally cut one net and short two others on a sample board, run the test with the exported data, and confirm all three faults are reported on the right nets.",
    dep: ["netlist-generator", "intelligent-fab-package", "connectivity-engine"]
  },
});
