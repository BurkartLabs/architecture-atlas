// Details for the FPGA toolchain plate, part 1: project and flow control, reports, on-chip debugging.
ATLAS.details("fpga-toolchain", {
  "project-model": {
    s: "The persistent description of a design project: source files, their roles, the target device, active constraint sets and the settings that apply to each stage.",
    d: "A project records which files are design sources, simulation-only files and constraints, which module is the top, which device and package are targeted, and per-stage options. Many tools keep this as a file the user can edit and version, others as a database. It hands the flow orchestrator a complete, reproducible recipe. It is hard because settings accumulate over years, referenced files move, and a project must open on another machine, with another tool version, and still mean the same thing.",
    k: ["Project as a text manifest versus a binary database: text diffs and merges in version control, but it needs a strict schema; a database is faster to open but opaque to review.", "Absolute versus relative file references: relative paths survive a clone to another machine, while absolute ones allow shared libraries without copying them."],
    p: ["Hidden per-user settings change results on a colleague's machine so the same sources give different timing.", "A moved source file leaves a stale reference that the tool silently skips, producing a design missing a module."],
    v: "Clone the project to a clean directory on a second machine, run the full flow from the manifest alone, and confirm the resulting bitstream is byte-identical to the original.",
    dep: ["compile-order-and-libraries"]
  },
  "flow-orchestrator": {
    s: "Sequences the stages from sources to bitstream, decides which ones must run, passes each stage's output to the next and stops cleanly on failure.",
    d: "The orchestrator holds a dependency graph of stages: parse, synthesize, place, route, generate bitstream. It checks whether a stage's inputs changed since its last result, runs only what is stale, and hands artifacts through the netlist store. It also enforces gates, such as refusing to write a bitstream when timing fails if the user asked for that. The difficulty is staleness: knowing precisely which inputs, options and tool versions each stage depends on, without rerunning everything or trusting an outdated result.",
    k: ["Timestamp-based versus content-hash staleness: timestamps are cheap but misfire on copied files; hashes are exact but cost reading every input.", "Fixed stage order versus a user-assembled flow: a fixed order is easy to support, while a flexible one lets experts insert optimization passes at the risk of invalid sequences."],
    p: ["A changed option that is not part of the staleness key leaves an old result in use, so the new setting appears to do nothing.", "A failed stage leaves a half-written intermediate file that the next run reads as valid."],
    v: "Change one constraint, rerun, and confirm from the log that only the stages downstream of constraint use reran while synthesis reported its result as reused.",
    dep: ["project-model", "netlist-storage", "run-manager"]
  },
  "run-manager": {
    s: "Tracks each execution of the flow as a named run with its own settings, working directory, status and results, so alternative strategies can be compared side by side.",
    d: "A run bundles a set of options, the constraint set used, a working directory and the outputs of every stage. Several runs can exist for one design, for example different optimization strategies or seeds, and may execute in parallel on separate cores or machines. Summaries expose status, worst slack and utilization per run. Challenges include isolating runs so they do not overwrite each other's intermediate files, cleaning up disk space which can reach gigabytes per run, and recording the exact inputs so a good run can be reproduced later.",
    k: ["One working directory per run versus a shared one: separate directories isolate parallel runs but multiply disk use; sharing is compact but races.", "Preset strategies versus open-ended option sets: presets are easy for beginners and comparable across designs, but hide the setting that actually mattered."],
    p: ["Parallel runs sharing a cache directory corrupt each other's intermediate files, producing sporadic failures nobody can reproduce.", "Old runs fill the disk, and the build dies partway through writing a checkpoint."],
    v: "Launch three runs with different strategies concurrently, then compare their summary tables of slack and utilization, and confirm each run's directory contains independent logs and results.",
    dep: ["project-model", "parallel-execution"]
  },
  "incremental-compilation": {
    s: "Reuses placement and routing from an earlier run for the parts of the design that did not change, so small edits finish in a fraction of a full compile.",
    d: "After a source change, the tool compares the new netlist to a reference result by name and structure, marks matching cells as unchanged, and fixes their placement and routes while processing only the new or modified logic. Hierarchical partitions can be preserved wholesale. It is valuable because large designs take hours. It is hard because reuse constrains the optimizer: preserved logic cannot be improved, and a stale reference can lock in a poor placement that new logic must route around.",
    k: ["Netlist-diff reuse versus explicit partitions: automatic matching helps any design but guesses at what is the same; explicit partitions are predictable but require the designer to plan boundaries.", "Reuse everything unchanged versus reuse only a timing-clean subset: the first is fastest, the second avoids carrying forward known-bad paths."],
    p: ["Repeated incremental edits slowly degrade quality because each one inherits the last placement, until a full compile is needed to recover frequency.", "Renamed signals break the name match, and the tool quietly redoes everything."],
    v: "Change one register's reset in a large design, run incrementally, and confirm the report states the share of cells reused, with wall time well below the original compile and no unchanged path's routing altered.",
    dep: ["design-checkpoints", "route-preservation", "netlist-storage"]
  },
  "design-checkpoints": {
    s: "A saved snapshot of the design database at one stage, including netlist, constraints, placement and routing, which can be reopened later to analyze or continue.",
    d: "A checkpoint serializes the in-memory netlist, device mapping, physical locations, routed nets and active constraints into one file. Reopening it restores the exact state without rerunning earlier stages, so a colleague can inspect a failing timing path or a script can run a trial optimization from a known point. It is hard because the format must capture every object relationship and stay loadable across tool versions, and because files are large and cannot be stored cheaply in version control.",
    k: ["Full snapshot versus differences from a baseline: full files are simple and self-contained, while deltas are small but require the baseline to stay available and untouched.", "Binary database dump versus a portable text netlist plus separate location file: dumps load fast and keep everything, text is inspectable and survives version changes."],
    p: ["A checkpoint written by one tool version fails to open in the next, discarding hours of work needed for a field issue.", "Constraints embedded in the file silently override the new constraint file the user supplied."],
    v: "Save a routed checkpoint, close the tool, reopen it in a fresh session, and confirm the timing report reproduces the same worst slack and the same number of routed nets.",
    dep: ["netlist-storage", "generic-netlist-ir"]
  },
  "batch-scripting": {
    s: "A non-interactive command interface that runs the whole flow or any stage from a script, so builds can be automated, parameterized and run in continuous integration.",
    d: "Every action a user can take in the graphical interface is exposed as a command that a script can issue: read sources, set options, run a stage, query the design, write reports. The script runs headless on a build server and exits with a status code. It is hard because the command set must stay stable across tool versions while the internals change, because queries on the design must be fast on millions of objects, and because errors must be reported to the script rather than as dialog boxes.",
    k: ["Full script parity with the graphical interface versus a reduced command set: parity lets teams automate everything but doubles the surface to maintain.", "Commands that abort on first error versus commands that return status: aborting is safe by default, returning status allows recovery logic but is easily ignored."],
    p: ["A script that works interactively hangs in batch mode because one command waits for a dialog answer.", "A warning treated as informational hides a failed read of a source file, and the flow continues with an empty design."],
    v: "Run the complete flow from a script on a machine with no display, using only the command line, and confirm it exits zero with a bitstream and a non-zero code when a source file is deliberately removed.",
    dep: ["command-engine", "flow-orchestrator"]
  },
  "utilization-reports": {
    s: "Counts how many lookup tables, registers, memories, multiplier blocks and pins the design uses against what the device provides, by stage and by hierarchy.",
    d: "The report walks the netlist and tallies each primitive type, then divides by device capacity. It can be broken down by module so the largest consumers are visible, and it differs by stage: post-synthesis numbers are estimates, post-placement numbers are final. It also shows sub-totals such as slices, control sets and clock regions, which constrain packing. It is hard because a design that fits in total can still fail on one scarce resource or in one region, so the useful number is often the tightest sub-limit.",
    k: ["Report only the headline percentages versus a per-hierarchy breakdown: headlines are quick to read but cannot say which module to shrink.", "Post-synthesis estimates versus post-placement actuals: estimates arrive early so designers can react, but can differ from final packing by several percent."],
    p: ["Reading total logic percentage as headroom, while a single scarce block type or control-set limit makes the design unplaceable.", "Comparing numbers from different stages as if they were measured the same way."],
    v: "Synthesize a design with a known instance of 100 memory blocks and confirm the report lists exactly 100 against the device capacity and attributes them to the right modules.",
    dep: ["netlist-storage", "design-hierarchy-model", "device-database"]
  },
  "timing-reports": {
    s: "Lists the paths that fail or barely meet their constraints, with each path's source, destination, per-stage delays, clock skew and slack, and summarizes slack per clock.",
    d: "After analysis, the report ranks paths by slack and prints each as a sequence of cells and nets with cumulative delay, the launch and capture clock edges, and the required time. Summaries group results by clock domain and by constraint, and mark unconstrained paths. It makes the closure loop possible: the engineer reads the dominant delay type, whether logic depth or routing, and changes the design or the constraint. It is hard because the printed detail must be accurate to the engine's model and still short enough to read.",
    k: ["Show the worst path per endpoint versus all paths: one per endpoint is compact, but many near-failing paths through shared logic are hidden.", "Separate logic delay and routing delay lines versus a single total: the split points at the fix, but depends on the delay model being trusted."],
    p: ["A clean report is read as success while large parts of the design were never constrained, so nothing was checked.", "Focusing on the single worst path while hundreds of similar ones fail for the same root cause."],
    v: "Tighten one clock period past what the design can achieve and confirm the report shows negative slack on exactly the expected path, with its listed delays summing to the arrival time.",
    dep: ["static-timing-engine", "timing-graph", "clock-definitions"]
  },
  "power-estimation": {
    s: "Estimates static and dynamic power of the design from its resources, toggle rates and operating conditions, broken down by clock, block type and hierarchy.",
    d: "Static power comes from device characterization tables for the chosen temperature and voltage. Dynamic power is computed per net and per primitive from capacitance, voltage, frequency and a toggle rate. Rates are entered by the user, propagated from defaults, or read from a simulation activity file, which is much more accurate. The result guides cooling and supply sizing. It is hard because the answer depends mostly on activity data the tool cannot know, so confidence is only as good as the vectors used.",
    k: ["Default toggle rates versus rates taken from simulation: defaults give an answer immediately but can be off by a factor of two; simulation is accurate but needs representative stimulus.", "Vectorless propagation of activity through logic versus per-net user overrides: propagation covers everything cheaply, overrides fix known outliers."],
    p: ["Using a pre-placement estimate for board design, then finding after routing that wires added considerable dynamic power.", "Estimating with typical silicon and room temperature when the product must run hot."],
    v: "Run the estimator with a simulation activity file for a known workload, measure supply current on the board under that workload, and confirm the two agree within the vendor's stated tolerance.",
    dep: ["device-database", "speed-grade-data", "routing-graph"]
  },
  "design-rule-checks": {
    s: "Automated checks on the netlist, constraints and implementation that flag errors a successful compile would not, such as unconnected clock pins or illegal I/O combinations.",
    d: "Rules run at defined stages. Early rules examine the netlist for combinational loops, unconstrained clocks, floating inputs and conflicting drivers. Later ones check pin legality, bank voltage compatibility and clock routing validity. Each finding has a severity and a rule name, and some can be waived with a recorded reason. They are valuable because many hardware faults are legal designs that simply do not work or can damage the board. It is hard to keep the false-positive rate low enough that people read the output.",
    k: ["Hard errors that stop the flow versus warnings: stopping prevents bad bitstreams, but a rule that blocks legitimate unusual designs trains users to disable all checks.", "Run all rules at the end versus each at the earliest stage that can detect it: early checks save hours, but need information that is incomplete that early."],
    p: ["Pin voltage-bank conflicts reported only as a warning among thousands, then the board is damaged.", "Waivers copied between projects after the underlying design has changed."],
    v: "Assign two outputs with incompatible voltage standards to one bank and confirm the rule check reports the conflict by pin and bank name before the bitstream stage.",
    dep: ["netlist-storage", "pin-and-io-standards", "package-pin-map"]
  },
  "schematic-viewer": {
    s: "Draws the netlist as a navigable diagram of modules, gates and connections, at the elaborated or mapped stage, so engineers can trace signals back to source.",
    d: "The viewer lays out cells and nets with a graph-drawing algorithm, shows hierarchy as expandable boxes, and cross-references each object to its HDL line. It can show the design after elaboration, after synthesis or after mapping, and highlight a selected path or fan-in cone. It is how engineers learn what the tool actually built from their text. The hard parts are layout quality on very large graphs, keeping the view responsive, and mapping optimized cells back to the source expressions they came from.",
    k: ["Layout computed on demand for a visible region versus whole-design layout: partial layout is responsive on huge designs but gives inconsistent views between sessions.", "Show optimized cells as they are versus restore names from source: raw cells are truthful, original names are easier to read but can mislead."],
    p: ["Optimization merges or renames signals, so the one an engineer is searching for does not exist in the post-synthesis view.", "A full-design view of a large netlist hangs the interface for minutes."],
    v: "Select a named register in the HDL, open the post-synthesis schematic, and confirm the cross-probe lands on the same register with its driver and load cells shown.",
    dep: ["design-hierarchy-model", "generic-netlist-ir", "netlist-storage"]
  },
  "floorplan-viewer": {
    s: "Shows the device's physical layout with placed cells, routed nets, clock regions and congestion, so users can see where logic landed and why timing or routing struggled.",
    d: "The viewer renders the device grid from the device database, then overlays placement, routes, partition regions and heat maps for utilization, congestion or timing criticality. Selecting a failing path draws it across the chip. It lets engineers notice patterns that tables miss: a long path crossing the whole device, or logic pulled toward a distant pin. It is hard because the device model has millions of objects, and the display must stay interactive while drawing the live database.",
    k: ["Draw from the live design database versus a rendered snapshot: live is always current, but contends with the running stages; a snapshot is safe and stale.", "Level-of-detail rendering versus exact drawing at all zoom levels: lower detail keeps panning smooth, but small features can disappear exactly where a diagnosis needs them."],
    p: ["Reading a single congestion heat map as the cause of failure when the real cause is a clock region overflow shown on another overlay.", "Manual edits made in the viewer are lost on the next run because they never reached the constraints."],
    v: "Open a routed design, draw the worst timing path, and confirm its cells fall on the same sites as the placement report and its length matches the listed route delay.",
    dep: ["device-database", "tile-and-site-model", "timing-graph"]
  },
  "debug-probe-insertion": {
    s: "Adds debug logic to the design to observe chosen internal signals, either by marking nets in the source or by selecting them in the synthesized netlist.",
    d: "Users mark nets to be probed through attributes in the source or by picking them after synthesis. The tool then instantiates a capture core, connects each chosen net to a probe input, and ties the core to a clock. Because synthesis may have merged or removed a net, insertion works against the post-synthesis names. The cost is real logic and memory consumed and extra routing that may disturb timing. The difficulty is that observation changes the design: it adds load to the very signals being studied.",
    k: ["Insertion in source versus after synthesis: source marks survive edits and are visible to version control, while post-synthesis picks work on any net but break when the netlist changes.", "One shared debug core versus one per clock domain: one core is small, but sampling signals from several domains in a single clock is only correct if resynchronized."],
    p: ["A probed net is optimized away, so the debug core captures a constant that looks like a hardware fault.", "Added probes shift placement and move the bug being chased."],
    v: "Mark a counter output for probing, rebuild, connect to hardware and confirm the captured waveform shows the counter incrementing at the expected rate with no missing codes.",
    dep: ["generic-netlist-ir", "embedded-logic-analyzer", "constraint-interpreter"]
  },
  "embedded-logic-analyzer": {
    s: "A block of logic placed in the fabric that samples selected signals every clock cycle into on-chip memory when a trigger condition is met.",
    d: "The core registers the probed signals, compares them with a trigger pattern each cycle, and writes samples to a circular memory. When the trigger fires it keeps recording for a programmed number of cycles, then stops and reports its buffer to the host. Windows before and after the trigger let engineers see what led to an event. It is hard because it must run at the design's clock speed, it competes for scarce memory blocks, and its depth is tiny compared with the length of the behavior being investigated.",
    k: ["Wide probe bus with shallow depth versus few probes with deep history: wide probes show many signals around an event, deep history catches slow causes, and memory limits force one or the other.", "Sample every cycle versus sample on a qualifying condition: every cycle is simple, conditional storage extends the window but adds logic that can hide events."],
    p: ["The window is too short to include the cause of the failure, only its effects.", "The analyzer's own clock is a divided or gated clock, so samples contain glitches that look like design bugs."],
    v: "Trigger on a known counter value with 25 percent pre-trigger depth and confirm the captured data places the trigger sample at the expected index, with the counter increasing across the window.",
    dep: ["trigger-logic", "capture-memory", "debug-transport"]
  },
  "trigger-logic": {
    s: "Comparators and a small state machine that decide when capture starts, from simple value matches to sequences of events across several signals.",
    d: "Triggers range from equality against a pattern with don't-care bits, through edge detection and counters, to multi-stage sequences such as seeing A, then B within N cycles. Conditions are configured at run time through registers, without a rebuild. They exist because the interesting event is rare, and capturing everything is impossible. Complexity grows with each condition: more comparator logic costs area and can limit clock frequency, while too little flexibility forces repeated rebuilds that take hours.",
    k: ["Run-time programmable triggers versus triggers fixed at build time: programmable ones allow exploring without a rebuild but cost logic; fixed ones are small and fast.", "Single-level compare versus sequential trigger states: sequences capture protocol errors that a single compare would miss, but are harder to configure correctly."],
    p: ["A trigger that never fires because the pattern assumed the wrong bit order, so the analyzer waits forever and looks broken.", "Triggering on a signal that changes only in the sampling clock's blind spot."],
    v: "Configure a two-stage trigger on a test pattern generator that emits the sequence once per second and confirm capture occurs only on that sequence and not on partial matches.",
    dep: ["debug-probe-insertion", "capture-memory"]
  },
  "capture-memory": {
    s: "The on-chip memory that stores sampled signal values until the host reads them, organized as a circular buffer of fixed width and depth.",
    d: "Block memories store one wide word per sample cycle. A write pointer wraps continuously until a trigger, then continues for the post-trigger count and stops. The host reads the buffer through the debug transport and reorders it using the pointer. Its depth times probe width is a budget taken from the design's own memory, which is why debug may not fit in a nearly full device. Hard problems include cascading memories at speed, clock crossing into the readout path, and the loss of everything on reconfiguration.",
    k: ["Large dedicated memory blocks versus external memory: on-chip memory is fast and self-contained, but limited; external memory is deep but adds a controller and interface of its own to debug.", "Compressing samples on the fly versus raw storage: compression extends history for sparse activity, but its worst case is no gain and extra logic."],
    p: ["Debug memory consumes the last free blocks, and the design that fit before no longer places.", "Reading the buffer without accounting for the wrapped pointer shows the data in the wrong order."],
    v: "Capture a counting pattern across a full buffer wrap, read it back and confirm the sequence is contiguous after reordering with the trigger sample at its programmed position.",
    dep: ["memory-primitive-mapping", "debug-transport"]
  },
  "debug-transport": {
    s: "The link between the debug cores on the chip and the host tool, usually carried over the configuration port's standard boundary-scan interface through a cable.",
    d: "A cable adapter speaks a serial test-access protocol to the chip. Inside, a hub core assigns each debug core an address, so commands and sample data are multiplexed over a single slow serial channel. The host tool discovers the cores by reading identification values, then reads and writes their registers. It is how a laptop sees into running hardware without extra pins. Hard parts are low bandwidth, which makes reading a large buffer take noticeable time, and sharing the port with programming.",
    k: ["Boundary-scan access versus a dedicated debug interface: boundary scan needs no extra pins and is present on every board, but is slow; a dedicated link is faster and costs board connections.", "Polling the core's status versus waiting for an interrupt line: polling needs only the serial link, but adds delay and traffic."],
    p: ["A scan chain with other devices after the FPGA breaks core discovery, because the tool assumed the chip was alone.", "Cable clock set too fast for a long board trace, giving intermittent read errors."],
    v: "Connect to a board with the design loaded and confirm the tool enumerates every inserted debug core with its identification value, then reads back a register written a moment earlier.",
    dep: ["programming-driver", "embedded-logic-analyzer"]
  },
  "virtual-io": {
    s: "Debug logic that exposes chosen internal registers to the host as live readable values and writable controls, acting like switches and indicators inside the chip.",
    d: "A virtual I/O core has input probes that the host polls and output registers the host sets, all over the debug transport. Engineers use them to drive a reset or mode bit during bring-up and to watch status flags without dedicated pins or a rebuild. It is useful when the board has no spare switches. It is hard because writes from the host arrive on an unrelated clock and must be synchronized, and because reading several related signals is not an atomic snapshot.",
    k: ["Asynchronous host writes synchronized into the design clock versus direct writes: synchronization is safe but delays and can drop fast pulses; direct writes risk metastability.", "Polling at a fixed rate versus event-driven updates: polling is simple and bounded in traffic, but misses short pulses between polls."],
    p: ["A multi-bit control written one bit at a time lets the design see a transient illegal value.", "Left in a production build, the writable core is an unintended control path into the chip."],
    v: "Wire a virtual output to a design's enable signal and a virtual input to its busy flag, then toggle the enable from the host and confirm the busy indication changes accordingly.",
    dep: ["debug-transport", "debug-probe-insertion"]
  },
  "state-readback": {
    s: "Reads the live values of registers and memories from the running chip through the configuration port, without having included any debug logic in the design.",
    d: "The configuration system can capture the state of all flip-flops into configuration memory, then read those frames out. A mapping file ties frame bits back to named registers and memory contents. It costs no fabric resources and lets an engineer examine a hung system after the fact. It is hard because capture is a snapshot taken at one instant, because the mapping must match the exact bitstream, and because reading some regions disturbs or stops the design in some devices.",
    k: ["Capture state through the configuration port versus insert debug cores: readback uses no logic and needs no rebuild, but is a single snapshot with no triggering; cores give history.", "Stop the clock to read versus read while running: stopping gives a consistent state, but running reads can tear across related registers."],
    p: ["Using a mapping file from a previous build, so reported register values belong to different signals.", "Readback on a design using partial reconfiguration returns frames from the module that has since been swapped out."],
    v: "Hold a design in a known state, capture and read back the frames, map them to register names and confirm each named register's value matches the one displayed by a virtual input core.",
    dep: ["configuration-frame-map", "programming-driver", "bitstream-writer"]
  },
});
