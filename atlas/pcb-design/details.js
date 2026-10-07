// Details for the PCB design plate, part 1: workspace, versioning, extensions, schematic capture.
ATLAS.details("pcb-design", {
  "project-manager": {
    s: "Groups the schematic sheets, board, libraries, rules and output settings of one design into a project, and tracks which files belong together.",
    d: "A project is a manifest naming the root schematic, the board, the library tables, the rule sets and the output job definitions, plus per-project settings that override user defaults. Opening a project resolves each reference, reports missing libraries and loads the files into one shared document. It also holds the paths used for relative library lookup, so a project moved to another machine can still find its parts. The hard part is partial failure: a missing file or a library path valid only on one machine must produce a clear warning rather than a silently altered design.",
    k: ["Manifest with relative paths vs absolute paths: relative paths survive moving and sharing, but break when libraries live in a shared location outside the project tree.", "Project-level settings overriding user settings vs user settings only: designs reproduce on any machine, but users cannot enforce personal preferences inside someone else's project."],
    p: ["A library path that resolves on one workstation only makes a colleague open the design with silently substituted or missing symbols.", "Per-project overrides that nobody reviews leave different rule defaults in different projects of the same product line."],
    v: "Copy a project folder to a clean machine, open it, and confirm the tool lists every unresolved library reference by name instead of loading with blank symbols.",
    dep: ["native-file-format", "library-manager"]
  },
  "canvas-and-viewport": {
    s: "The zoomable, pannable drawing surface that shows schematic and board objects, with layer visibility, highlighting and display modes, kept responsive on large designs.",
    d: "The canvas converts design coordinates to screen coordinates, selects which objects are visible at the current zoom and layer set, and hands them to the rendering backend. It supports net highlighting, per-layer color and opacity, and display modes such as outline versus filled copper. It also resolves what lies under the cursor for hover and snap. It is hard because boards hold millions of primitives: redraw must be incremental, level of detail must hide sub-pixel features without lying about connectivity, and picking must stay exact at any zoom.",
    k: ["Retained scene with dirty regions vs redrawing everything each frame: far less work for small edits, at the cost of invalidation bugs that leave stale artifacts.", "Level-of-detail simplification vs exact geometry at all zooms: fast zoomed out, but a hidden thin trace can make a short invisible."],
    p: ["Hiding tiny objects when zoomed out lets the engineer believe an area is clear when a short exists.", "Picking that uses screen-space tolerance selects the wrong overlapping object on dense copper."],
    v: "Open a board with several million primitives, pan and zoom across it, and confirm frame time stays interactive while a highlighted net still lights every segment, including those smaller than a pixel.",
    dep: ["rendering-backend", "spatial-index", "design-database"]
  },
  "selection-and-edit-tools": {
    s: "The common interaction layer for choosing objects and changing them: selection filters, move, rotate, flip, align, copy, and property editing across schematic and board.",
    d: "Selection works on object identities rather than screen pixels, with filters by type, layer, net or locked state, and with box, lasso and connected-object modes. Edit commands operate on a selection and run as one transaction on the design database, so an operation either applies as a whole or leaves nothing. Property editors expose fields of the object model with validation. The hard part is consistency: the same gesture must mean the same thing on a symbol, a track and a zone, and edits must keep connectivity and rules valid or at least report what they broke.",
    k: ["Operations as transactions vs direct mutation: one undo step per user action and no half-applied edits, but long operations need careful progress and cancel handling.", "Selection by identity with filters vs by geometry only: precise, scriptable selections, but identity must survive edits or selections go stale."],
    p: ["A move that ignores locked or fixed-position objects breaks a mechanical constraint the engineer set earlier.", "Mirroring a footprint without flipping its layer-bound text and pads silently produces a part that cannot be assembled."],
    v: "Select a group of mixed objects across two layers, flip the group, and confirm pads move to the opposite copper layer, text mirrors correctly, and one undo restores the original exactly.",
    dep: ["object-model", "change-journal", "spatial-index"]
  },
  "undo-redo": {
    s: "Reverses and reapplies edits by replaying inverse changes recorded in the journal, so any sequence of user actions can be stepped back safely.",
    d: "Each user action commits one transaction to the change journal, which records the before and after state of every affected object. Undo applies the inverse, redo reapplies the forward change, and a new edit discards the redo branch. Because schematic and board edits are linked, the history either spans both editors or is kept separately with defined rules for what happens when one editor changes under the other. It is difficult because side effects such as connectivity updates, rule re-evaluation and back-annotation must also reverse, and because memory for history grows quickly on large edits.",
    k: ["Inverse-delta history vs full snapshots: small memory per step, but every operation must define a correct inverse; snapshots are simple and heavy.", "Single shared history vs one history per editor: a single history keeps cross-editor edits coherent, but one undo can change a window the user is not looking at."],
    p: ["An operation that updates an external file or index outside the journal leaves state that undo does not restore.", "Undoing past a library update leaves objects referencing a part definition that no longer matches."],
    v: "Perform a mix of edits in the schematic and board, undo them all, and confirm the design file is byte-identical to the start; then redo and confirm it matches the end state.",
    dep: ["change-journal", "object-model"]
  },
  "cross-probing": {
    s: "Selecting a part or net in one editor highlights and centers the same object in the other editors, keeping schematic, board and 3D views in step.",
    d: "The tool maps an object in one view to its counterpart through persistent identity: a symbol and its footprint share a link, and nets share a name or identifier. A selection event is published, other views resolve the counterpart and highlight it, optionally panning to it. It also extends to analysis results, so a violation, a waveform trace or a bill-of-materials row can jump to its source. The difficulty is that correspondence is not one to one: a multi-part symbol maps to one footprint, a net may be several differently named segments, and a variant may omit the part entirely.",
    k: ["Linking by stable identifier vs by reference designator: identifiers survive renumbering, but designators are what engineers type and recognize.", "Synchronous highlight in all views vs on-demand lookup: instant feedback, at the cost of work on every selection change in large designs."],
    p: ["Cross-probing by reference designator after renumbering lands on the wrong component.", "Highlighting a net by name misses bus members or labels whose names differ only by scope."],
    v: "Select a net in the schematic and confirm every pad and track of exactly that net highlights on the board, then select a footprint and confirm the matching symbol is centered.",
    dep: ["object-model", "connectivity-engine", "annotation"]
  },
  "revision-control-integration": {
    s: "Stores designs and libraries in a version control system, with files and layouts chosen so commits stay small, history is meaningful and branches can be compared.",
    d: "The tool saves designs in forms that tolerate version control: stable ordering of objects, one object per line or block where possible, and no volatile data such as timestamps in the body. It may expose commit, branch and tag actions in the interface, and records the commit used for each release. Libraries are versioned alongside or pinned by reference. It is hard because large generated outputs and cached state bloat history, and because a tool that reorders its save file on every edit makes every commit look like a rewrite.",
    k: ["Text-based native format vs compact binary: diffs and merges become possible, at the price of larger files and slower load.", "Libraries inside the project repository vs referenced by version: designs are self-contained, but shared fixes need copying to every project."],
    p: ["Saving with nondeterministic ordering makes every commit touch the whole file and hides the real change.", "Committing generated outputs with the source lets stale files from an old revision ship to the fabricator."],
    v: "Open and save an unchanged design twice and confirm the repository reports no change; then move one part and confirm the diff touches only that part's records.",
    dep: ["native-file-format", "library-manager"]
  },
  "design-diff": {
    s: "Compares two revisions of a design and shows what changed in connectivity, parts, rules and geometry, as a report and as an overlay on the drawing.",
    d: "The diff matches objects between revisions by stable identity, then compares properties, positions and connections. It reports added, removed, moved and modified items, and distinguishes electrical changes from cosmetic ones. A visual mode overlays the two revisions in distinct colors on the same canvas, and a netlist mode lists changed connections. Matching is the hard part: if identities are regenerated on save, or parts are replaced with new ones, the diff degenerates into everything removed and everything added, and reviewers stop trusting it.",
    k: ["Matching by identity vs by geometry and name: reliable when identity is stable, but heuristic matching is needed for imports and repurposed parts.", "Electrical diff vs geometric diff: a netlist diff shows what a reviewer must approve, while geometry shows how much rework layout needs; both are needed and answer different questions."],
    p: ["A diff that ignores changes to rules or stackup misses edits that alter manufacturability without touching a trace.", "Cosmetic movements drown the one connectivity change that matters."],
    v: "Change one net connection and move twenty parts, then run the diff and confirm the connection change is listed as electrical and the moves are grouped separately as geometric.",
    dep: ["object-model", "connectivity-engine", "native-file-format"]
  },
  "merge-and-conflicts": {
    s: "Combines changes made by different people to the same design, detecting conflicting edits and resolving them at the level of design objects rather than file lines.",
    d: "Merging works on the object graph: both branches are compared with their common ancestor, non-overlapping edits are combined, and overlapping edits to one object become conflicts shown to the user. Some tools avoid conflicts instead by locking regions, sheets or board areas. The result must be a consistent design: connectivity must still match the schematic, and rules must still be satisfied. It is hard because merged edits can each be valid while their combination is not, for example one branch moving a part while another routes through its old position.",
    k: ["Three-way object merge vs file locking: parallel work and fewer waits, against the risk of semantically broken combinations that locking prevents outright.", "Splitting a design into sheets or blocks to partition work vs a single flat board: fewer conflicts, but board layout is inherently shared and does not partition cleanly."],
    p: ["A textual merge of a native file produces a design that loads but contains duplicate identifiers or dangling references.", "Auto-resolving a conflict by taking one side drops the other engineer's routing without notice."],
    v: "Make one branch move a footprint and another route a trace near it, merge them, and confirm the result either reports the conflict or passes a full rule check with consistent connectivity.",
    dep: ["design-diff", "object-model", "drc-engine"]
  },
  "reusable-design-blocks": {
    s: "Saves a tested circuit with its schematic and routed layout as a block that can be placed again in other designs, with its connections and rules intact.",
    d: "A block packages a sub-schematic together with its placement and routing, defined interface pins, and the rules attached to it. Placing it copies or references the block, assigns new reference designators and maps its nets to the host design. Tools may keep a link back to the source block so updates can be offered. It is difficult because layout is relative to the board: stackup, rules and keepouts of the host differ from the origin, and linked blocks must stay in step without overwriting local adjustments.",
    k: ["Linked blocks vs copied blocks: updates propagate to every use, but a library change can unexpectedly alter shipped designs; copies are stable and drift apart.", "Reusing routed layout vs reusing schematic only: proven geometry saves effort, but it assumes a compatible stackup and rule set."],
    p: ["Placing a routed block onto a board with a different stackup keeps trace widths that no longer give the intended impedance.", "Updating linked blocks without a diff changes parts in a released design."],
    v: "Place the same block twice on one board and confirm each instance has unique designators, correctly mapped nets and passes the rule check, then change the source and confirm the update is offered rather than forced.",
    dep: ["sheet-hierarchy", "object-model", "layer-stackup"]
  },
  "review-and-markup": {
    s: "Lets reviewers view a design and attach comments to specific objects or locations, then tracks which comments are open, resolved or have led to changes.",
    d: "Comments are anchored to objects by identity or to board coordinates, carry an author and status, and are stored with the project or in a separate review record. Reviewers can use a read-only viewer or an exported document without owning the full tool. Review also covers design checks such as stating which rules were waived. The difficulty is anchoring over time: an object moved or deleted after a comment was made leaves a comment pointing at nothing, and a review of a previous revision must not be confused with the current one.",
    k: ["Comments anchored to objects vs to coordinates: object anchors follow edits, but coordinate anchors still make sense when the object is removed.", "Review data inside the design file vs external: comments travel with the design, but they pollute history and are visible in released files."],
    p: ["Comments tied to a revision that is then edited point to locations that have changed meaning.", "Review done on an exported image misses connectivity that the picture cannot show."],
    v: "Add a comment to a net, move the connected parts, and confirm the comment still points at the net; then delete the net and confirm the comment is flagged as orphaned rather than lost.",
    dep: ["object-model", "native-file-format"]
  },
  "scripting-api": {
    s: "A programmatic interface to the design database that lets users write scripts to read, query and modify designs, add checks, and automate repetitive edits.",
    d: "The API exposes the object model: iterate parts, nets and tracks, read and write properties, create objects and call selected commands. Scripts run inside the tool with access to the live document, or outside it against saved files. A transaction wrapper makes script changes undoable as one step. The hard part is stability and safety: the object model changes between releases, so a script that worked last year may fail or, worse, silently produce a different result, and a script with full write access can corrupt a design.",
    k: ["Versioned stable API vs direct access to internal types: scripts survive upgrades, but the tool must maintain compatibility layers and cannot refactor freely.", "In-process scripting vs file-based external scripts: in-process is fast and interactive, external scripts run in CI without a graphical session."],
    p: ["A script that edits objects outside a transaction leaves the connectivity model and undo history out of step.", "Scripts relying on internal units assume nanometers when the API uses another unit, scaling geometry wrongly."],
    v: "Run a script that adds a marker to every part with a given value, then confirm the count matches a direct query, a single undo removes all markers, and the design still passes its checks.",
    dep: ["object-model", "change-journal", "design-database"]
  },
  "plugin-host": {
    s: "Loads extensions that add tools, importers, checks or menu commands, with a defined lifecycle, permissions and a way to isolate or disable faulty ones.",
    d: "Plugins register with the host at startup against a declared interface version, and may add actions, panels, file formats or analyses. The host provides services such as logging, settings storage and access to the document. Isolation varies: in-process plugins are fast but can crash the tool, while out-of-process ones are safer and slower. It is hard because plugins outlive tool versions, and because a plugin that blocks the interface thread or holds a lock on the document makes the whole editor appear frozen.",
    k: ["In-process plugins vs separate processes: low overhead and direct access, but a crash or leak takes down the editor; separate processes isolate failures at the cost of marshaling every call.", "Open plugin marketplace vs curated set: wide capability, but untrusted code now runs with access to proprietary designs."],
    p: ["A plugin built against an old interface loads and misbehaves instead of being rejected.", "A plugin silently sends design data to an external service."],
    v: "Install a plugin that throws on load and confirm the editor starts, reports the failure by name and keeps working; then disable it and confirm its commands disappear.",
    dep: ["scripting-api", "object-model"]
  },
  "batch-cli": {
    s: "Runs checks, conversions and output generation without a graphical session, so continuous integration can build manufacturing files and gate changes automatically.",
    d: "A command-line entry point loads a project, runs a named operation such as rule check, netlist export, output job or format conversion, writes results to files and returns a status code. It uses the same engines as the interface, only without the canvas. Inputs and tool version must be pinned for repeatable output. It is difficult because many tools quietly depend on interface state, such as the current window, a cached layout or user-specific settings, which a headless run lacks, so results differ from what the engineer saw.",
    k: ["One engine shared by the interface and the command line vs a separate batch engine: identical results, but the core must not depend on any display.", "Failing the run on any violation vs on severity levels: a strict gate stops bad releases, but noisy warnings train people to bypass it."],
    p: ["Generating outputs in CI with a different tool version than the one engineers use changes drill data or aperture definitions.", "A run that returns success after skipping checks it could not perform lets bad designs through."],
    v: "Run the same rule check from the command line and the interface on one design and confirm the violation lists are identical, and that a deliberately introduced clearance error makes the command exit with a failure.",
    dep: ["drc-engine", "design-database", "project-manager"]
  },
  "format-converters": {
    s: "Reads and writes the file formats of other design tools and standards, translating symbols, footprints, boards and rules into this tool's object model.",
    d: "An importer parses a foreign file, maps its objects to native equivalents and reports what could not be mapped. Libraries, schematics and boards usually convert separately, and many conversions are one way. The converter must carry units, layer names, net names and pad geometry exactly, and flag anything approximated. It is hard because the models differ: one tool's padstack or zone concept may not exist in another, so a converted board can look right but carry different clearance, fill or pad behavior.",
    k: ["Strict conversion that rejects what it cannot represent vs best-effort conversion with warnings: strict is safe but frequently unusable, best-effort gets work done but can hide changes.", "Importing rules vs importing geometry only: rules preserve intent, but different rule semantics can make them mean something else."],
    p: ["A converted board has the same drawing but different zone fill settings, changing clearance silently.", "Importing a library without checking pin numbers against the symbol swaps pins."],
    v: "Import a known board from a foreign format and compare netlists before and after: confirm identical nets and pin assignments, and that every unmapped feature appears in the conversion report.",
    dep: ["object-model", "native-file-format", "pad-and-padstack-model"]
  },
  "schematic-editor": {
    s: "The editor where symbols are placed and connected to describe a circuit, showing the design as readable sheets with values, references and net names.",
    d: "The editor places symbols, draws wires, buses and labels, and edits properties, with every action committed to the design database. It maintains connectivity as the drawing changes, reports unconnected pins, and offers snapping to pin ends and grid. Drawing conventions such as junction handling, label scope and no-connect markers are part of its semantics. The difficulty is that drawing and meaning differ: two wires crossing are not connected without a junction, a label can join nets across sheets, and the drawing must convey meaning to readers while the netlist alone decides what the board gets.",
    k: ["Connectivity computed from geometry vs explicit connection objects: drawing feels natural, but accidental overlaps can create or break connections; explicit objects are exact and harder to use.", "Free placement vs enforced sheet structure: easier drawing, but without conventions large schematics become unreadable."],
    p: ["A wire end that lands near but not on a pin looks connected and is not.", "Two labels differing only in case or trailing character create separate nets that look identical."],
    v: "Draw a small circuit, export the netlist, and confirm every drawn connection appears as a net with the right pins, including one wire that visibly crosses another without joining it.",
    dep: ["connectivity-engine", "symbol-library", "design-database", "canvas-and-viewport"]
  },
  "sheet-hierarchy": {
    s: "Splits a design into multiple sheets and nested sub-sheets with defined ports, so large circuits stay readable and parts of a design can be repeated.",
    d: "A root sheet contains sheet symbols that point to child sheets, whose ports connect to pins on the parent. Sheets can be flat, with global labels crossing all of them, or truly hierarchical, with local scope. A child sheet may be instantiated multiple times, each instance getting its own designators and net prefixes. The connectivity engine resolves names through the hierarchy into a flat netlist. It is hard because net names in a repeated sheet must differ per instance while still honoring global nets, and because one stray scope rule changes what is connected.",
    k: ["Strict hierarchy with ports vs flat sheets with global labels: hierarchy limits accidental connections and supports reuse, flat sheets are quicker to draw but connect everything by name.", "Instance-based repetition vs copied sheets: one edit fixes all instances, but per-instance variation needs extra mechanisms."],
    p: ["A global label reused for two different meanings on different sheets merges unrelated nets.", "Repeated sheets whose designators collide on the board make the bill of materials ambiguous."],
    v: "Instantiate one sub-sheet three times and confirm the flat netlist contains three distinct sets of internal nets with unique designators, while a global power net connects to all three.",
    dep: ["connectivity-engine", "annotation", "wires-and-buses"]
  },
  "wires-and-buses": {
    s: "The drawing elements that express connections: wires between pins, labels that name nets, and buses that carry several related signals under one line.",
    d: "Wires connect pins and junctions, labels give nets names, and buses group signals by a naming syntax such as a prefix with an index range. Bus entries tap individual members from the bus. The connectivity engine expands bus names into member nets and matches them across sheets and ports. The hard part is the naming grammar: members, vectors and aliases must expand consistently, and ranges that do not match between a bus and its taps produce silent mismatches instead of errors.",
    k: ["Bus syntax with implicit membership vs explicit member lists: concise and scalable, but typos in ranges create nets that connect to nothing.", "Named nets by label vs by wire geometry: labels make large designs maintainable, but remove the visual proof of connection."],
    p: ["A bus taken from index zero on one sheet and index one on another shifts every signal by one position.", "Two names for one net, joined by tool-specific aliasing, produce a different net name on the board than on the schematic."],
    v: "Draw an eight-bit bus across two sheets with one member intentionally mismatched, run the electrical rules check, and confirm the mismatch is reported and the netlist lists all eight members.",
    dep: ["connectivity-engine", "schematic-editor"]
  },
  "global-nets": {
    s: "Nets such as power rails and ground that connect everywhere by name, with special symbols that declare them and rules for how they join across sheets and parts.",
    d: "A power symbol attaches a name to a net, and every use of that name joins the same net on all sheets. Power pins on parts, which may be hidden in the symbol, can implicitly connect to those names. Tools differ on whether the join is global across the whole project or scoped to a sheet. Net names for rails also carry electrical attributes in the rule system, such as voltage and current. The difficulty is hidden connections: a part with invisible power pins connects them by name, so a typo in a rail name disconnects supply without any visible gap.",
    k: ["Global power names vs explicit wired connections: simple, readable schematics, but accidental name collisions merge rails.", "Hidden power pins on symbols vs visible pins: cleaner drawing, but connections that cannot be seen cannot be reviewed."],
    p: ["Two power supplies named almost identically stay separate and one device is unpowered.", "Merging analog and digital grounds by using one global name removes the intended single-point connection."],
    v: "Rename one rail symbol on a single sheet by one character, regenerate the netlist, and confirm the electrical rules check reports an unpowered pin or a floating net.",
    dep: ["connectivity-engine", "erc", "symbol-library"]
  },
  "annotation": {
    s: "Assigns unique reference designators such as R12 or U3 to parts and keeps them consistent across sheets, board and bill of materials.",
    d: "Annotation walks the design, assigns each part a prefix by type and a unique number, and handles multi-unit parts that share one designator. Numbering can follow sheet order or position, and previously assigned designators may be locked. Forward annotation sends the result to the board, and back-annotation returns renumbering from layout. The hard part is stability: renumbering parts that are already ordered or documented breaks bills of materials and service manuals, so annotation must change as little as possible and never create duplicates.",
    k: ["Locked designators vs full renumbering: stable documentation and ordered parts, but numbering gaps and disorder accumulate over time.", "Position-based numbering vs sheet order: easier assembly and rework, but a single move changes many designators."],
    p: ["Two parts carry the same designator after merging branches, and the bill of materials silently combines them.", "Renumbering after boards were assembled makes the schematic unusable for debugging existing hardware."],
    v: "Annotate a design with several multi-unit parts and confirm all units of each part share one designator, no duplicates exist across the flat netlist, and re-running annotation changes nothing.",
    dep: ["object-model", "sheet-hierarchy"]
  },
  "design-variants": {
    s: "Describes several product configurations from one design by marking parts as fitted, omitted or substituted per variant, so one schematic and board serve all versions.",
    d: "Each part carries per-variant state: fitted, not fitted, or an alternate value or part number. A variant selects one assignment set, and outputs such as the bill of materials, assembly drawings and pick-and-place files are generated for it. Net connections stay the same; only the fitted parts differ. It is difficult because variants must stay consistent with electrical checks: a part omitted in one variant may leave a net floating or a pin unterminated, so checks and simulations need to know the active variant.",
    k: ["Per-part variant attributes vs separate design copies: one source to maintain, but every output and check must understand variants; copies diverge.", "Do-not-populate parts kept on the board vs different layouts per variant: simple and cheap, but unused footprints cost area and may affect signal quality."],
    p: ["Generating assembly files without selecting the variant ships the base configuration for every order.", "Checks run only on the full variant miss a floating pin that exists in a reduced one."],
    v: "Define two variants where one omits a pull-up, generate each bill of materials and placement file, and confirm each lists exactly its own fitted parts and the electrical check flags the floating net in the reduced one.",
    dep: ["object-model", "variant-boms", "erc"]
  },
  "netlist-generator": {
    s: "Produces the list of parts and the nets connecting their pins from the schematic, as the authoritative connectivity handed to layout.",
    d: "The generator flattens the hierarchy, resolves names, expands buses and records for each net the pins it connects, together with part attributes and the footprint each part uses. Output is either an internal structure handed directly to the board editor or an external file in a neutral format. Differences between consecutive netlists drive the change list for layout. The difficulty is determinism and naming: net names for unnamed nets must be stable between runs, or every regeneration looks like a total change and layout updates become unreliable.",
    k: ["Direct in-memory transfer to layout vs exchange through a file: in-memory is exact and fast, files allow other tools and leave an inspectable record.", "Stable generated net names vs fresh names each run: stability keeps layout rules attached to nets, but it requires persistent identity for anonymous nets."],
    p: ["Unnamed nets renamed on regeneration detach net classes and length rules assigned to them.", "A netlist produced from a stale schematic state sends the board an old connection list."],
    v: "Generate the netlist twice from an unchanged schematic and confirm the outputs are identical, then change one connection and confirm the diff lists only that net.",
    dep: ["connectivity-engine", "sheet-hierarchy", "annotation", "symbol-footprint-mapping"]
  },
  "back-annotation": {
    s: "Carries changes made in layout, such as swapped pins or renumbered parts, back to the schematic so the two descriptions stay equal.",
    d: "Layout may legitimately change connectivity: swapping equivalent pins or gates to shorten routes, or renumbering designators by position. The tool records these as changes the schematic can accept, applying them to the corresponding symbols and keeping the netlist matching. It relies on stable identity between schematic and board objects. The hard part is policy: automatic acceptance can overwrite a deliberate schematic decision, and rejection leaves the two out of step, which the parity check then reports on every cycle.",
    k: ["Back-annotation allowed vs schematic as the only source: layout can optimize pin assignments, but the schematic can change underneath a reviewed design.", "Applying changes automatically vs as a reviewed list: convenient, but unreviewed changes violate sign-off."],
    p: ["Swapping pins on a part where gates are not truly equivalent changes behavior.", "Back-annotating after the schematic has been released leaves released documents out of date."],
    v: "Swap two equivalent gate pins in layout, apply the change, and confirm the schematic shows the new pin assignments, the parity check reports no differences and the netlists of both views match.",
    dep: ["parity-check", "object-model", "annotation"]
  },
});
