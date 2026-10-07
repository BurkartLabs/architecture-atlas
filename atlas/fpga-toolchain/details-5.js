// Details for the FPGA toolchain plate, part 5: device models, bitstream and programming, infrastructure, cross-cutting concerns.
ATLAS.details("fpga-toolchain", {
  "device-database": {
    s: "The compiled description of one device: its grid of tiles, site types, wiring, clock structure and legal configurations, which every physical stage reads.",
    d: "Built from the manufacturer's data or from reverse-engineered documentation, the database lists every tile and site, the primitives each site can hold, the wire segments between tiles and the switches connecting them, plus package pins and speed data. It is loaded in memory when a stage starts, often as a compact binary form. Accuracy is everything: a wrong entry gives an unroutable or invalid design. It is hard because the data is huge, differs per family, and is rarely fully documented.",
    k: ["One database format shared by all families versus per-family formats: a shared format lets generic tools serve many devices, per-family keeps exact details without compromise.", "Load the whole database versus memory-map it: loading is simple and slow to start, mapping starts fast and relies on stable layout."],
    p: ["A small error in a rarely used switch gives bitstreams that fail only for designs using it.", "Database and tool versions disagree after an update, and the tool loads incompatible data."],
    v: "For a sample of routed designs, load the output bitstream on hardware and confirm each configured primitive behaves as the database claims, including paths using the rarest switches.",
    dep: ["tile-and-site-model", "routing-fabric-model", "speed-grade-data", "package-pin-map"]
  },
  "tile-and-site-model": {
    s: "Describes the device as a grid of tiles, each containing sites where primitives can be placed, with their types, coordinates and which are adjacent or share resources.",
    d: "A tile is a repeating unit such as a logic tile, a memory column tile or an I/O tile. Each contains sites, the positions that hold one primitive instance, and the model records site types and compatible primitives. Coordinates define adjacency for chains and cascades, and clock regions group tiles. The placer uses it as its map. It is hard because devices are not uniform: columns of different types, holes for hard blocks and edges all complicate legal placement.",
    k: ["Explicit coordinates for every site versus a procedural description: explicit is simple to query and large, procedural is compact and needs generation code per family.", "Model sites as indivisible versus with internal slots: indivisible simplifies placement, internal slots allow fine packing but multiply objects."],
    p: ["Treating the grid as uniform places a cell on a site that exists only in some columns.", "Coordinates numbered differently between database and constraint syntax shift a floorplan by a column."],
    v: "Query the site list for a known region and confirm the count and types against the manufacturer's datasheet figures for that device.",
    dep: ["device-database"]
  },
  "primitive-definitions": {
    s: "The catalog of device primitives, such as lookup tables, registers, memories and arithmetic blocks, with their ports, parameters, behaviors and the sites that can hold them.",
    d: "Each primitive has a name, ports with directions and widths, parameters that configure its mode, and a behavioral model used for simulation and for equivalence checking. The mapper uses the list as its target library, and the netlist importer uses it to understand foreign netlists. It is the boundary between generic synthesis and the real silicon. It is hard because modes interact, simulation models must match the actual hardware, and the catalog grows with each device family.",
    k: ["Model primitives as behavioral code versus tables of truth and timing: behavior supports simulation and reasoning, tables are exact for configuration and limited in expressiveness.", "One generic primitive with many modes versus separate primitives per mode: one keeps libraries small, separate ones make each mode's rules explicit."],
    p: ["The simulation model differs from silicon in an initialization or edge case, so designs pass simulation and fail on the board.", "A primitive parameter left unset takes a default the user did not expect."],
    v: "Simulate each primitive's model with a directed test and compare its output to hardware captured from a programmed device, confirming equal behavior including reset and initial values.",
    dep: ["device-database"]
  },
  "routing-fabric-model": {
    s: "The description of programmable wiring: wire segment types and lengths, switch boxes, and the legal connections between them, with the configuration bits that select each.",
    d: "Wires come in lengths from neighbor links to long lines spanning the chip, joined by switch boxes that allow certain input-to-output connections. The model lists every connection, its direction, its cost and the configuration bit pattern that enables it. The router reads it through the routing graph; the bitstream writer uses the bits. Mistakes make routes illegal or short circuits. It is hard because the structure is irregular near edges and hard blocks, and because documented structure is often incomplete.",
    k: ["Complete explicit switch list versus regular pattern with exceptions: explicit lists are exact and huge, patterns are compact and risk missing irregularities.", "Store delay on each switch versus compute from type: stored values are accurate, computed ones save space."],
    p: ["An edge tile missing from the pattern makes the router use a connection that does not exist.", "Two switches with the same configuration bits give conflicting settings."],
    v: "Route every net in a test design, write the bitstream, load it, and confirm that signals propagate end to end through each route type used, including edge and long-line connections.",
    dep: ["device-database", "configuration-frame-map"]
  },
  "speed-grade-data": {
    s: "Characterized timing and power data for each speed grade and operating condition: cell delays, setup and hold times, and maximum rates of hard blocks.",
    d: "Manufacturers measure silicon and publish tables per grade, so a faster-grade part has smaller delays and costs more. The data covers each primitive's arcs by corner, wire segment delays, clock network skew, and limits such as the maximum clock for a memory. Timing analysis and power estimation read it. It is hard because the tools must apply the correct set for the user's grade, temperature and voltage, and because data is revised as production data accumulates.",
    k: ["Ship delay data with the tool versus download per device: bundled is available offline and large, downloaded is lighter and requires network and consistent versions.", "Conservative published data versus tighter measured data: conservative guarantees every part works, tighter gives more performance with higher risk."],
    p: ["A design analyzed for a faster grade than the one purchased passes timing and fails in production.", "Updated data changes slack on a frozen design, and the result no longer reproduces."],
    v: "Analyze one design under two speed grades and confirm the report names the grade used and the worst slack differs consistently with the grade's published delay differences.",
    dep: ["device-database"]
  },
  "package-pin-map": {
    s: "Maps each physical package ball or pin to its internal pad, bank and capabilities, including differential pairs, clock-capable inputs and dedicated configuration pins.",
    d: "The same silicon is sold in several packages, and each has its own pin list. The map ties each pin to an I/O site, a bank with its supply, and special roles such as clock input, high-speed transceiver or configuration. It also gives internal package delays for length matching on boards. It is what makes constraint files meaningful. It is hard because pin tables must exactly match the manufacturer's current documentation and the board's footprint.",
    k: ["Pin-to-site mapping per package versus per device: per package is exact and multiplies files, per device with a package overlay is compact.", "Include package trace delay data versus omit: including supports precise board timing, omitting keeps the file small and leaves board designers to compensate."],
    p: ["A pin assigned to a configuration-only function as ordinary I/O prevents the device from starting.", "Package revision changes differential pair mapping after the board is made."],
    v: "Compare the generated pin report against the manufacturer's package file for every assigned pin, confirming site, bank and special-function data are equal.",
    dep: ["device-database"]
  },
  "configuration-frame-map": {
    s: "Defines how each configurable element's setting maps to a location in the configuration memory, organized in frames, so settings can be written and read at known addresses.",
    d: "Configuration memory is divided into frames of fixed length, addressed by column and row. Each logic table bit, routing switch, memory initial value and option has a frame address and bit offset recorded in the map. The writer uses it to place values, readback uses it to find register state, and partial reconfiguration to target regions. It is hard because layouts are irregular, frequently undocumented, and a single wrong offset configures the wrong function.",
    k: ["Derived from vendor-supplied data versus reverse engineered: supplied is authoritative and often unavailable, reverse engineering is open and risks gaps.", "Frame-level addressing versus bit-level maps: frame addressing matches how hardware loads data, bit-level maps support per-element edits."],
    p: ["A one-bit offset error configures the neighboring function and produces behavior with no obvious cause.", "Frame length differs between device sizes and a map from one is applied to another."],
    v: "Set a single lookup table to a known function, write the bitstream, load it, and confirm via test inputs that exactly that table implements the function and no neighbor changed.",
    dep: ["routing-fabric-model", "tile-and-site-model"]
  },
  "bitstream-writer": {
    s: "Converts the routed design into the configuration bits for every lookup table, flip-flop, switch and option, and emits them in the file layout that the device loader expects.",
    d: "For each placed primitive it computes its configuration value, for each used switch the bits that enable it, and fills unused areas with defaults. Bits are arranged into frames using the frame map, with a header carrying device identification, commands and a checksum. Options set startup behavior and clocking. It is the final, unforgiving stage. It is hard because no single error is visible in the file, and correctness is proved only by the chip behaving.",
    k: ["Deterministic output from design alone versus including build metadata: deterministic output allows byte comparison and caching, metadata aids traceability but breaks hashes.", "Write all frames versus only those that differ from a base: all frames are simple and large, differences load faster and need a known starting state."],
    p: ["Timestamps embedded in the file make every build different, and releases cannot be verified by hash.", "A stale option set leaves unused pins in an unintended state."],
    v: "Generate the bitstream twice from the same checkpoint and compare bytes for equality, then load it into a device and run the acceptance test showing every function behaves as simulated.",
    dep: ["configuration-frame-map", "routing-fabric-model", "primitive-definitions"]
  },
  "bitstream-compression": {
    s: "Reduces bitstream size, typically by exploiting repeated frames and runs of unused configuration, so it fits in smaller flash and loads faster.",
    d: "Many frames are identical in sparse designs, so the writer replaces repeats with a short command, or encodes runs. The loader inside the device decompresses on the fly while reading. Smaller files cut external memory cost and configuration time, which matters when the device must be running in a short time after power up. It is hard because compression ratios depend on the design, so worst case sizing must assume none, and because the decompressor's input speed can limit the load.",
    k: ["Multi-frame write compression versus general-purpose compression: multi-frame write uses a built-in device feature and is simple, general compression is smaller and needs hardware support.", "Compress always versus only when it helps: always is uniform, conditional avoids slower loading when files barely shrink."],
    p: ["Flash sized for the compressed average runs out when a fuller design arrives.", "A bitstream compressed with an incompatible option fails to load with a generic error."],
    v: "Generate the bitstream with and without compression, confirm the compressed file is smaller by the reported ratio, load both on hardware and confirm identical behavior and a shorter or equal configuration time.",
    dep: ["bitstream-writer"]
  },
  "bitstream-security": {
    s: "Encrypts and authenticates the bitstream so that it cannot be read or cloned from external memory and only genuine images are accepted by the device.",
    d: "The tool encrypts frames with a key that is also programmed into secure storage on the device, and adds an authentication code or signature. At load the device decrypts and verifies, refusing a modified image. Options can disable readback and debug access. The key handling flow is part of manufacturing. It is hard because keys must stay secret yet usable in build systems, key loss makes a device unprogrammable, and security options can be permanently set.",
    k: ["Symmetric key stored on device versus public-key signing: symmetric is small and fast and means the key is in the factory, signing allows keys to stay private to a signer.", "Lock down debug and readback versus leave open: locking protects the design, leaving open allows field diagnosis."],
    p: ["A lost key makes the whole production lot unprogrammable.", "Key stored in a script in the build repository exposes every shipped product."],
    v: "Program a device with an encrypted image and confirm it runs, then alter a single byte of the image and confirm the device refuses to configure, and that readback returns no plaintext.",
    dep: ["bitstream-writer", "programming-driver"]
  },
  "partial-reconfiguration": {
    s: "Rewrites part of the configuration while the rest of the chip keeps running, swapping modules in defined regions without stopping the system.",
    d: "The design is divided into a static part and one or more reconfigurable regions. Each region has a fixed boundary of interface wires, and multiple alternative modules are implemented for it. The flow produces a full bitstream and a partial one per module. At run time, a controller loads a partial image into the region. It is hard because the static design must not use the region's resources, interface wires must be locked, and clocks and state must be managed during the swap.",
    k: ["Fixed interface wires versus flexible routing at the boundary: fixed wires make modules interchangeable and cost routing freedom, flexible routing needs every module rerouted together.", "Decouple the region during loading versus trust the interface: decoupling is safe and costs logic, trusting risks spurious signals."],
    p: ["Static logic placed inside the reserved region blocks every partial module.", "A module swapped while its outputs are still used drives garbage into the static design."],
    v: "Load module A, run a test, load module B into the same region while the static design runs, and confirm module B's behavior and an uninterrupted static function throughout.",
    dep: ["floorplan-constraints", "route-preservation", "bitstream-writer"]
  },
  "programming-driver": {
    s: "The host software and cable interface that sends a bitstream to the device through its configuration port and confirms that configuration completed.",
    d: "A driver talks to a programming cable over a serial protocol, steers the device's boundary-scan state machine, issues the configuration commands, streams the bitstream, and checks the status register for done and error flags. It can also target flash devices attached to the chip. It supports chains of several devices. It is hard because cable drivers are platform specific, long chains need correct bypass handling, and a failed load needs a clear cause.",
    k: ["Vendor-specific cable protocol versus open generic interface: generic works with many cables and is slower to support features, specific is faster and tied to hardware.", "Verify by readback after loading versus trust the done flag: readback proves contents and takes time, the done flag only proves a checksum matched."],
    p: ["Programming speed set above what the board's traces allow causes intermittent CRC errors.", "A chain of devices not described to the tool is programmed with the wrong image."],
    v: "Program a board, read the status register and confirm done is set with no error flags, then read the device identification back and confirm it matches the intended part.",
    dep: ["bitstream-writer", "debug-transport"]
  },
  "flash-image-builder": {
    s: "Packages one or more bitstreams, with headers and optional fallback images, into the file layout for external configuration memory, from which the device loads itself at power up.",
    d: "The builder arranges a primary image, optional fallback image and any additional data at defined flash addresses, and adds headers pointing to them. Multi-boot setups let the device try a new image and return to a known good one if it fails. Programming files can also be built for in-system update. It is hard because a flash layout error can leave the board unable to start, and update paths must survive power loss mid-write.",
    k: ["Single image versus golden plus update image: single is simple, golden fallback survives a bad update at the cost of memory.", "Image built at flash addresses fixed in the tool versus configured: fixed is easy, configured adapts to different memory sizes and mixed contents."],
    p: ["Update written over the only image and interrupted by power loss leaves the board unbootable.", "Header addresses calculated for a different flash size load garbage."],
    v: "Program a flash with primary and fallback images, power cycle and confirm the primary loads; corrupt the primary and confirm the device loads the fallback on the next power cycle.",
    dep: ["bitstream-writer", "bitstream-compression", "programming-driver"]
  },
  "netlist-storage": {
    s: "The in-memory and on-disk representation of the netlist and physical database that all stages share, with compact object tables and stable identifiers.",
    d: "Cells, nets, pins, ports and their physical attributes are stored in indexed tables, with references by integer identifiers rather than pointers so the database can be saved and loaded quickly. Stages read and write through an interface that tracks changes, and the database can be serialized to a checkpoint. Millions of objects must be created and traversed rapidly. It is hard because memory footprint, cache locality and the need for stable names conflict, and because every stage mutates the same structure.",
    k: ["Integer-handle tables versus object graph with pointers: handles compress and serialize cheaply, pointers are easy to navigate and costly to save.", "Single shared database versus per-stage copies: a shared one avoids conversion and couples stages tightly, copies isolate stages and cost memory and time."],
    p: ["A stage holds a stale handle to a deleted object and corrupts the database silently.", "Memory growth is linear with design size until a large device runs out."],
    v: "Serialize the database, reload it and compare cell, net and pin counts and a hash of the connectivity, confirming equality, while measuring that memory use per cell is within the stated budget.",
    dep: []
  },
  "parallel-execution": {
    s: "Runs independent work across threads and machines: separate runs, separate modules and partitioned sections of one algorithm, while keeping results deterministic.",
    d: "The tool can launch many runs at once, synthesize independent modules in parallel, and use several threads inside placement and routing, though much of each algorithm is sequential. A scheduler assigns tasks to cores and manages memory. Distributed builds send jobs to a farm. It is hard because shared data structures must be protected, because partitioned algorithms produce different results depending on thread timing, and because speedup flattens beyond a few cores.",
    k: ["Parallelize within a stage versus run many seeds in parallel: within a stage shortens one run and complicates determinism, many seeds uses cores simply and gives choices.", "Deterministic parallel algorithms versus fastest nondeterministic: deterministic ones reproduce and cost speed, nondeterministic ones are quicker and cannot be debugged."],
    p: ["A race condition in a parallel router gives a different result each run, which no one can reproduce.", "Eight threads run slower than four because of memory bandwidth contention."],
    v: "Run the same stage with one thread and with eight and confirm identical output files, and that wall time falls by the factor the report quotes.",
    dep: ["netlist-storage", "run-to-run-determinism"]
  },
  "command-engine": {
    s: "The interpreter that executes commands from scripts, the console and the graphical interface, with a registry of commands and a query language for design objects.",
    d: "Commands have names, arguments, help and return values, and are registered by each stage. The interpreter handles variables, control flow and error handling so users can script flows. Object queries return collections of cells, nets or pins that can be filtered by pattern or property. The graphical interface issues the same commands, so a session can be replayed. It is hard because the command language must remain stable over many releases and handle queries over millions of objects fast.",
    k: ["Embed a general-purpose scripting language versus a custom command syntax: general-purpose gives full programming and existing skills, custom is smaller and safer.", "Commands operate on object handles versus names: handles are fast and exact, names are readable and break when objects change."],
    p: ["A script depending on the order of a query's result changes behavior when the database changes.", "An undocumented command used in many scripts disappears in a release."],
    v: "Run a recorded graphical session's journal as a script on a clean install and confirm it reproduces the same design state and the same reports.",
    dep: ["netlist-storage", "message-system"]
  },
  "message-system": {
    s: "Collects, classifies and filters the messages from all stages, with severity, identifier and source location, so users and scripts can find what matters among thousands of lines.",
    d: "Each message has a unique identifier, a severity of info, warning, critical warning or error, and text with parameters. Users can raise, lower or suppress messages by identifier, and scripts can count messages by severity to fail a build. Logs go to a file and a console, and the interface groups and links them to source. It is hard because the volume is huge, because suppressed warnings hide real problems, and because identifiers must stay stable for scripts.",
    k: ["Allow suppression by identifier versus never allow: suppression keeps logs readable, and a blanket suppression hides a new bug.", "Free-form text messages versus structured records: text is easy to write, structured records support tools and filtering."],
    p: ["A warning that the netlist lost a constraint is buried among thousands and never read.", "Changing a message's text breaks scripts that parse it."],
    v: "Trigger a known warning, suppress its identifier, rerun and confirm it no longer appears, and confirm a count of warnings in the summary still reports the suppression.",
    dep: ["command-engine"]
  },
  "license-manager": {
    s: "Checks that the user is entitled to use the tool, device family and IP cores, via local files or a network license server, and limits concurrent use.",
    d: "At startup and at feature use, the tool asks for a license for the edition, device and optional features such as high-level synthesis. Licenses can be node-locked to a machine or floating from a server that counts concurrent users. Time-limited evaluation licenses are common. Some cores need their own license. It is hard because failures appear as confusing errors partway through a long run, and because the server is a single point of failure for a whole team.",
    k: ["Floating network licenses versus node-locked: floating shares a few licenses across a team and depends on the network, node-locked works offline and ties to a machine.", "Check at startup only versus continually: startup is simple, continual checks catch revocation and expire mid-run."],
    p: ["A license check at the start of the bitstream stage fails after a ten-hour run.", "A server outage stops every engineer's work at once."],
    v: "Start the tool with the license server unreachable and confirm it reports the missing feature immediately by name, and with it reachable confirm the feature is checked out and returned at exit.",
    dep: ["device-support-packages"]
  },
  "device-support-packages": {
    s: "Separately installable bundles of device databases, delay data, primitive libraries and IP for each family, so a tool installation carries only what the user needs.",
    d: "Device data is many gigabytes in total, so the base tool installs without it and the user chooses families. Each package has a version that must match the tool version, since database formats change. The package manager downloads, verifies and registers them, and the flow selects the right one from the project's device. It is hard because mismatched versions yield subtle errors, projects must record which packages they used, and older devices need older data.",
    k: ["Install all devices versus on demand: all is simple and large, on demand is small and requires downloads and care in offline environments.", "Strict tool-to-package version match versus compatibility ranges: strict avoids mistakes, ranges allow package updates without a new tool release."],
    p: ["A newer package loaded into an older tool misreads the database and gives wrong routes without any message.", "A build server lacks a family package and falls back to a similar device silently."],
    v: "Open a project targeting a family that is not installed and confirm the tool reports the missing package by name and version, then install it and confirm the flow runs.",
    dep: []
  },
  "run-to-run-determinism": {
    s: "Whether identical inputs, options and seed give a bit-identical result every time, despite threads, hash ordering, machine differences and tool version.",
    d: "Determinism needs ordered containers instead of hashed ones, fixed random seeds, thread-independent algorithms and no timestamps or host names in outputs. It allows caching, reproducible releases, fair comparison of strategies and debugging of rare failures. Without it, a bug seen once cannot be reproduced and a passing timing result cannot be rebuilt. It conflicts with raw speed in parallel algorithms, and it must be decided at the start because retrofitting it means rewriting every parallel stage.",
    k: ["Deterministic by default versus fast by default: deterministic costs some speed and makes every result reproducible, fast gains speed and loses reproducibility.", "Seed as a user option versus fixed: exposing the seed enables exploring variations, a fixed seed gives stable results and hides sensitivity."],
    p: ["A single use of address-ordered containers makes results change across machines.", "A timing result accepted from a lucky seed cannot be reproduced later."],
    v: "Run the complete flow three times on two machines with the same inputs and seed, and confirm all bitstreams hash identically.",
    dep: []
  },
  "timing-awareness-everywhere": {
    s: "Timing is a goal of nearly every stage, not just the analysis, so every stage needs delay estimates, constraints and slack, and their quality shapes the result.",
    d: "Synthesis maps for depth, placement weights nets by criticality, routing prioritizes critical nets, and optimization repairs failing paths, each using its own estimate of delay. If the estimates disagree with final analysis, early stages optimize the wrong thing. A single shared timing graph and delay model gives consistency; separate models are faster. This decision sets how closely every stage depends on the timing engine and how often it must be recomputed.",
    k: ["One shared timing engine versus per-stage estimators: shared gives consistent decisions and couples stages and slows them, estimators are fast and drift from signoff.", "Timing-driven everywhere versus only late: early timing awareness avoids late failures and costs run time, late-only is faster and reaches closure less often."],
    p: ["Estimates before routing differ from final delays, so effort goes into paths that were never critical.", "Constraints missing at synthesis mean mapping optimizes the wrong clock."],
    v: "Compare each stage's predicted worst slack to the final routed slack across a benchmark set and confirm the error shrinks at each stage and stays within a stated bound.",
    dep: []
  },
  "flat-vs-hierarchical": {
    s: "Whether the tool treats the design as one flat netlist or as independently processed blocks, which trades optimization quality against run time, reuse and stable names.",
    d: "Flat processing sees everything and optimizes across boundaries, and its run time and memory grow with total size. Hierarchical processing synthesizes, places and routes blocks separately, reuses results for unchanged ones and runs in parallel, at some quality cost and with constraints that must be written per block. Partial reconfiguration and team-based development require it. The decision touches constraints, naming, checkpoints, incremental flow and debug.",
    k: ["Flat for quality versus hierarchical for turnaround: flat is best for the final result, hierarchical is best during development.", "Boundaries chosen by tools versus by designers: tool choice needs no planning, designer choice gives predictable interfaces and requires foresight."],
    p: ["Block-level timing budgets are wrong, and blocks pass alone and fail when assembled.", "A flattening step silently ignores per-block constraints."],
    v: "Implement the same design flat and hierarchically, compare frequency, area and run time in a table, and confirm unchanged blocks are reused in the hierarchical rerun.",
    dep: ["hierarchy-handling", "incremental-compilation"]
  },
  "device-abstraction": {
    s: "How much of the tool is generic and how much knows about one device family, which decides how many families a single tool can support and how much each one costs.",
    d: "A generic architecture description, with tiles, sites, wires and primitives as data, lets one placer and router serve many devices, at the cost of missing family-specific tricks. Family-specific code can exploit unusual features. Data-driven designs put the knowledge in the device database and primitive library, so adding a family is mostly a data task. This choice determines the effort of new devices and how well the tool exploits each one.",
    k: ["Data-driven generic algorithms versus family-specific code paths: generic code supports new families cheaply and gives up family tricks, specific code gets the last few percent and multiplies maintenance.", "Describe architecture in data files versus compiled code: data files can be updated without a new release, code is faster and harder to extend."],
    p: ["A special feature one family has is unsupported in the generic path and wasted without notice.", "Generic assumptions break on a new family with an unusual structure."],
    v: "Add a small new device family using only data files and confirm the unchanged placer and router produce a design that loads and runs on it.",
    dep: ["device-database", "primitive-definitions"]
  },
  "runtime-and-memory-scaling": {
    s: "How run time and memory grow as designs and devices get larger, which limits algorithm choices in every stage and decides whether a build takes minutes or days.",
    d: "Placement and routing are heavy and nonlinear in design size, and big devices hold hundreds of millions of routing nodes. Choices such as bounded effort levels, multithreading, partitioned processing and compact data structures decide whether a design finishes at all. Each stage declares a budget and a fallback when it is exceeded. Scalability must be planned: an algorithm that is fine at ten thousand cells may be hopeless at ten million.",
    k: ["Effort levels with time limits versus run to convergence: limits bound turnaround and may return poor results, convergence is thorough and unpredictable.", "Compact integer-indexed data versus convenient objects: compact data fits large designs and is harder to code, objects are easy and exhaust memory."],
    p: ["A quadratic step is invisible on test designs and dominates on a real one.", "Memory use peaks at a stage nobody profiled and the build is killed by the host."],
    v: "Run a scaled series of designs from small to the largest the device holds and confirm per-stage time and peak memory follow a fitted curve with no stage exceeding its stated budget.",
    dep: []
  },
  "equivalence-between-stages": {
    s: "The ability to prove that each stage's output behaves like its input, so optimization and mapping errors are found by checking rather than by failed hardware.",
    d: "Formal equivalence checking compares netlists before and after a stage by matching registers and proving the combinational logic between them identical. Simulation of results against the original is cheaper and incomplete. Where transformations such as retiming move registers, checking needs sequential methods or assumptions. Having this property means every optimization pass can be trusted or tested, and it shapes how names and structure are preserved between stages.",
    k: ["Formal proof at each stage versus end-to-end simulation: formal catches every difference and costs time and setup, simulation is quick and only covers tested cases.", "Preserve register correspondence versus freedom to restructure: correspondence makes checking easy, restructuring gains optimization and needs stronger checking."],
    p: ["A tool bug in a rarely used optimization produces wrong logic that passes simulation.", "Equivalence checks skipped for speed are the stage where an error slips through."],
    v: "Run formal equivalence between the elaborated design and the final implementation netlist and confirm it reports every compare point matched, then inject a one-gate change and confirm it reports a mismatch.",
    dep: []
  },
});
