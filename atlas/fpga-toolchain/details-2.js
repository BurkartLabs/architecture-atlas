// Details for the FPGA toolchain plate, part 2: HDL front end, IP cores, high-level synthesis.
ATLAS.details("fpga-toolchain", {
  "hdl-parsers": {
    s: "Read hardware description source files and build syntax trees, accepting the standardized hardware languages and their many dialects and tool-specific extensions.",
    d: "Each supported language has its own parser that tokenizes text and produces a tree of modules, ports, declarations, processes and expressions, with source locations kept for error messages and cross-probing. Several languages can be mixed in one design. The standards are large and old, and real code leans on subsets and vendor habits, so parsers must be liberal yet precise. They are hard because errors must be reported usefully, and because a language revision can change the meaning of existing code.",
    k: ["Separate parser per language versus one shared intermediate form from the start: separate parsers are simpler to keep faithful to each standard, a shared form eases mixed-language designs but loses detail.", "Strict standard conformance versus accepting common deviations: strictness catches portability bugs, leniency lets existing code compile."],
    p: ["A construct accepted by one tool and rejected by another leaves a design that cannot move between flows.", "Error recovery that reports hundreds of follow-on errors for one missing semicolon."],
    v: "Feed a suite of conformance snippets covering each language construct and confirm every valid one produces a tree whose printed form re-parses to the identical tree, and every invalid one yields a located error.",
    dep: ["preprocessor-and-parameters", "design-hierarchy-model"]
  },
  "preprocessor-and-parameters": {
    s: "Expands text macros, conditional compilation and include files before parsing, and applies parameters and generics that customize each instance of a module.",
    d: "Macros and conditionals select code by definitions given in files or on the command line; includes pull in shared declarations. Parameters, resolved later during elaboration, change widths, depths and structure per instance. Together they let one source serve many configurations. They are hard because text substitution is invisible in later errors, definition order changes results, and a single wrong default can silently change the width of a bus across a large design.",
    k: ["Text-level macros versus typed parameters: macros are flexible but unchecked and invisible in the tree; parameters are checked and visible, but cannot change syntax.", "Defines on the command line versus in source files: command-line values vary per run without edits, but are easy to lose from a recorded build."],
    p: ["A macro defined in one file leaks into later files and alters code written by someone else.", "A parameter override with the wrong name is ignored with only a warning, leaving the default width in place."],
    v: "Build the same module with two parameter values and confirm the elaborated hierarchy shows different bus widths in each instance and the synthesis reports show matching register counts.",
    dep: ["hdl-parsers"]
  },
  "compile-order-and-libraries": {
    s: "Tracks which source files belong to which named library and in what order they must be read so that packages, types and modules are defined before use.",
    d: "Some languages require definitions before use; others resolve names after reading everything. The tool keeps a list of libraries, each with its files, and either takes an explicit order or computes one from dependencies it extracts by scanning. Third-party blocks are usually kept in their own library to avoid name clashes. It is hard because order mistakes produce confusing errors, and because the same file can appear in two libraries with different meanings.",
    k: ["Explicit user-supplied order versus automatically derived order: explicit is predictable and fast, derived saves maintenance but can fail on circular or generated dependencies.", "One flat library versus a library per vendor or team: flat is simple, separate libraries prevent module name collisions at the cost of qualified references."],
    p: ["Two modules with the same name in different directories: the tool picks one silently and builds the wrong behavior.", "Generated source files missing from the list cause stale versions to be used."],
    v: "Add a second module with a duplicate name in another library, run the front end and confirm each instance binds to the intended library and the tool lists both candidates.",
    dep: ["hdl-parsers", "project-model"]
  },
  "elaboration": {
    s: "Instantiates the module hierarchy with its actual parameters, expands loops and conditional generation, and resolves types to produce a fully concrete design for synthesis.",
    d: "Starting at the top module, elaboration evaluates parameters, unrolls generate loops, picks conditional branches and connects ports, creating one concrete instance for each use. Constant expressions are folded so widths and depths become numbers. Output is a tree of instances with behavior still described as processes and assignments. It is hard because the language allows computations during elaboration that can be arbitrarily complex, and because errors depend on the actual parameter values rather than the source text alone.",
    k: ["Elaborate each instance separately versus share work for identical ones: separate keeps names and later optimization local, sharing is faster and smaller but constrains per-instance changes.", "Fail on width mismatches versus truncate with a warning: failing finds real bugs, truncation matches what older code expects."],
    p: ["A generate condition evaluated with the wrong parameter silently removes a block, and the design synthesizes without it.", "Recursion through parameters never terminates on a bad constant."],
    v: "Elaborate a design with a generate loop of eight instances and confirm the hierarchy contains exactly eight instances with distinct indexed names and correctly sized ports.",
    dep: ["preprocessor-and-parameters", "hdl-parsers", "design-hierarchy-model"]
  },
  "design-hierarchy-model": {
    s: "The in-memory tree of modules, instances, ports and nets that represents the design, with links back to source and a stable name for every object.",
    d: "Every later stage reads this model. Objects carry names, a full hierarchical path, attributes, and a location in the original file. Stable naming is what lets constraints, debug probes and incremental compilation refer to the same object across runs. It is hard because synthesis and optimization change the structure, so the model must keep both the original names for the user and new names for derived objects, and because constraints written against hierarchy must keep working when levels are flattened.",
    k: ["Keep the original hierarchy through all stages versus flatten early: keeping it supports constraints and debugging by name, flattening exposes more optimization but loses names.", "Names generated deterministically from structure versus assigned by creation order: structural names are stable between runs, creation-order names are cheap but shift with unrelated edits."],
    p: ["Names change when an unrelated module is edited, so existing constraints stop matching and silently apply to nothing.", "Escaped special characters in names break constraint patterns."],
    v: "Rename one instance deep in the hierarchy, rebuild, and confirm a constraint that targets the old path produces a warning of no matching objects rather than silently passing.",
    dep: ["netlist-storage"]
  },
  "lint-checks": {
    s: "Static checks on source and elaborated design for risky coding, such as inferred latches, width mismatches, unused signals and multiple drivers, run before synthesis.",
    d: "Lint rules examine the tree for patterns that are legal but likely wrong: incomplete conditionals, blocking and non-blocking assignment mixing, signals read but never written, ports left unconnected, and clock domain crossings without synchronizers. Rules have severities and can be configured by project. They are cheap compared with a full compile and catch bugs that simulation misses. The difficulty is precision: too many warnings on harmless code teaches users to ignore all of them.",
    k: ["Strict default rule set versus minimal defaults: strict finds more but produces noise on legacy code; minimal is quiet and misses real defects.", "Check source text versus elaborated design: source checks are fast and point to lines, elaborated checks see actual widths and parameters."],
    p: ["Hundreds of warnings on inherited code lead the team to disable the whole checker.", "A rule matches generated code that nobody can edit, so the warning can never be fixed."],
    v: "Write a combinational process with a missing branch and confirm lint reports an inferred latch at that exact line before synthesis, and that adding the branch clears it.",
    dep: ["elaboration", "design-hierarchy-model"]
  },
  "third-party-netlist-import": {
    s: "Reads pre-synthesized netlists from other tools or encrypted vendor blocks and merges them into the design as black boxes or fully visible logic.",
    d: "Some blocks arrive as a gate-level or primitive-level netlist rather than source. The importer parses the exchange format, maps its cells to the library of the target device, and attaches the module to the hierarchy as if it were source. Constraints may arrive in a companion file. It is useful for reuse and for protecting design details. It is hard because the imported netlist may target a different primitive set, cannot be optimized across, and gives timing reports no source to point to.",
    k: ["Treat as an opaque black box versus merge for optimization: opaque keeps the block unmodified and protected, merging allows cross-boundary optimization but breaks the provider's assumptions.", "Re-map foreign primitives versus require the same library: re-mapping widens compatibility but risks behavior differences."],
    p: ["A foreign primitive with no equivalent in the target library is replaced by an empty module with only a warning.", "Imported constraints refer to hierarchy names that changed during import."],
    v: "Import a small known netlist, instantiate it in a design and confirm the post-implementation report lists its cells with the expected counts and that simulation of the result matches the block's reference outputs.",
    dep: ["design-hierarchy-model", "primitive-definitions", "netlist-storage"]
  },
  "ip-catalog": {
    s: "The browsable, versioned index of available pre-built cores and their metadata: capabilities, supported devices, license terms and compatible tool versions.",
    d: "Each entry has a name, a version, a description, supported device families and the parameters that can be set. Catalogs can be local folders, a vendor-supplied set or a repository added by the team. The catalog filters by device so only usable cores are shown, and tracks versions so a project can pin one and be told when an upgrade is available. It is hard because cores are updated independently of the tool, and an upgrade can change the interface of a block already in use.",
    k: ["Pin each project to exact core versions versus follow the latest: pinning keeps builds reproducible, following gets fixes and risks interface changes.", "Central catalog versus project-local copies: central avoids duplication, local copies make a project self-contained and archivable."],
    p: ["An updated core silently regenerates with new default parameters and changes behavior in a design that was working.", "A core is listed for a family but not for the specific device in use, and fails only at generation."],
    v: "Select a device and confirm the catalog lists only cores supporting it, then lock a core to version two, upgrade the catalog, and confirm the project still resolves version two.",
    dep: ["project-model", "device-support-packages"]
  },
  "ip-configurator": {
    s: "The parameter interface for one core: lets users choose widths, depths, modes and options, validates the combination, and shows derived values such as latency and resource use.",
    d: "Each core declares parameters with types, ranges, defaults and dependencies between them. The configurator evaluates these rules as the user edits, disables options that are not valid in the current mode, and computes outputs such as latency in cycles or the size of a memory. The choices are saved in a small settings file that is the real source of truth. It is hard because parameter dependencies form a graph that is easy to get inconsistent, and because a wrong choice is only visible as bad behavior later.",
    k: ["Rules enforced as the user types versus checked on generate: interactive checks avoid invalid states, but require the core author to express every rule declaratively.", "Store only the user's choices versus store the generated result: storing choices is small and diffable, but depends on regeneration producing the same output."],
    p: ["Two parameters set in an invalid combination produce a core that generates but fails in hardware.", "A settings file is hand-edited and drifts from what the interface would allow."],
    v: "Set a memory controller's width and depth to a combination the rules forbid and confirm the configurator refuses it with a message naming the conflicting parameters.",
    dep: ["ip-catalog", "interface-definitions"]
  },
  "ip-generation-engine": {
    s: "Produces the synthesizable sources, constraints, simulation models and documentation for a configured core, writing them to a managed location.",
    d: "Given the settings file, the generator runs the core's recipe: it evaluates templates or invokes a small program to emit hardware source specialized to the parameters, plus constraints and simulation wrappers. Outputs may be generated in advance or on demand by the flow. It is hard because generated files must be reproducible from the settings, kept apart from hand-written code, and refreshed only when the inputs change, otherwise a design can mix files from two versions.",
    k: ["Generate out of context with the core synthesized separately versus generate and synthesize with the top level: separate synthesis is cached and fast, joint synthesis allows cross-boundary optimization.", "Check generated files into version control versus regenerate on every build: checking in is simple for reviewers, regenerating keeps a single source of truth."],
    p: ["Hand edits to generated files are lost at the next regeneration.", "Generation depends on a tool version that differs on the build server, producing different sources."],
    v: "Generate a configured core twice from the same settings file and confirm the output sources are byte-identical, then change one parameter and confirm only the affected files differ.",
    dep: ["ip-configurator", "flow-orchestrator", "constraint-interpreter"]
  },
  "interface-definitions": {
    s: "Named bundles of ports and their protocol rules, such as a streaming or memory-mapped bus, so tools can connect compatible blocks by interface rather than wire by wire.",
    d: "An interface lists its signals, directions, widths and roles, and the parameters that affect them. Cores declare which interface each group of ports implements and in which role: initiator or responder. The block design tool uses this to offer legal connections and to apply automatic wiring. It is hard because real protocols have optional signals, versions with incompatible semantics and rules not captured in signal names, so matching names is not the same as compatibility.",
    k: ["Rich typed interfaces versus loose port groups by naming convention: typed interfaces catch mismatches early, conventions are quick to apply to any block but break on small variations.", "Include protocol rules such as ordering and timing in the definition versus only signals: rules enable checking, but are far harder to specify and verify."],
    p: ["Two interface versions with the same signal names connect but disagree about response ordering, giving rare data corruption.", "An optional signal tied to a constant by default hides a missing feature."],
    v: "Connect an initiator and a responder with mismatched data widths and confirm the tool flags the width mismatch at connection time and offers a width converter.",
    dep: ["design-hierarchy-model"]
  },
  "interconnect-generator": {
    s: "Builds the glue logic that connects many initiators to many targets, including address decoding, arbitration, width and clock conversion, from a list of connections.",
    d: "Given the connected interfaces, address maps and priorities, the generator emits a fabric: decoders select targets by address, arbiters share each target between initiators, and converters adapt width, protocol version or clock domain between ports. Pipeline registers can be added on long paths. It saves writing error-prone glue by hand. It is hard because the choices trade area, latency and clock frequency, and the generated fabric's critical path often becomes the timing bottleneck of the whole system.",
    k: ["Full crossbar versus shared bus: a crossbar allows parallel transfers at high area cost, a shared bus is small but serializes all traffic.", "Insert pipeline stages automatically versus on request: automatic stages help timing but add latency that software or other blocks may not expect."],
    p: ["Two targets with overlapping address ranges decode to both and corrupt data, noticed only on hardware.", "An unrelated initiator starves another under fixed priority arbitration."],
    v: "Connect two initiators to two memories with distinct address ranges, issue simultaneous accesses in simulation and confirm each reaches its intended target and the arbiter grants both in turn.",
    dep: ["interface-definitions", "block-design-canvas", "ip-generation-engine"]
  },
  "block-design-canvas": {
    s: "A graphical editor in which cores are placed as blocks and connected, with automatic wiring helpers, producing a hierarchical design that the flow treats as source.",
    d: "Users drag cores onto a canvas, then connect interfaces, clocks and resets. Helper tools propose connections and instantiate required infrastructure such as reset controllers and interconnect. The canvas is saved as a structured description that generates a top-level HDL wrapper for the flow. It speeds up system assembly. It is hard because the saved form must diff and merge reasonably, regeneration must preserve manual choices, and changes to a core's ports must propagate without breaking existing connections.",
    k: ["Save as a structured text description versus a binary project file: text can be reviewed and merged, binary is more compact and rarely survives concurrent edits.", "Automatic connection wizards versus manual wiring only: wizards remove routine errors, but can wire clocks and resets in ways a reviewer never sees."],
    p: ["A core upgrade changes one port name and the diagram silently drops the connection to it.", "Two engineers edit the same diagram and the merge produces a design that loads but is wired wrongly."],
    v: "Assemble a small system, generate its top level, and confirm that every connection drawn on the canvas appears as an identical port connection in the generated source, with no unconnected required port.",
    dep: ["interface-definitions", "ip-catalog", "ip-generation-engine"]
  },
  "encrypted-ip": {
    s: "Handles cores whose source is delivered encrypted so that tools can process and implement them, while users cannot read or modify the underlying logic.",
    d: "The provider encrypts source files with a key that the tool, and only certain tools, can decrypt in memory. The flow uses the decrypted content to synthesize but suppresses it from schematics and reports at the provider's request. Licensing may be tied to a device or a time period. It lets vendors share cores without exposing their design. It is hard because different tools support different encryption schemes, because debugging inside a hidden core is impossible, and because encrypted content must still be reproducible in the flow.",
    k: ["Encrypted source versus a pre-synthesized netlist: encrypted source is retargetable across devices and tool options, netlists are simpler to process but fixed to one family.", "Per-tool keys versus a common scheme: per-tool keys can be locked down, a common scheme makes cores portable but widens exposure if broken."],
    p: ["A tool upgrade drops support for the encryption scheme and the core no longer builds.", "An error inside the hidden core cites only the wrapper, giving the user nothing to act on."],
    v: "Include an encrypted core in a design, run synthesis, and confirm it completes with the core's resources counted in the report while its internal cell names are hidden from the schematic.",
    dep: ["ip-catalog", "license-manager", "hdl-parsers"]
  },
  "software-language-front-end": {
    s: "Parses an algorithm written in a software language and builds a compiler-style control and data flow representation that scheduling can turn into hardware.",
    d: "The front end reads functions in a restricted software language, rejects constructs that have no hardware meaning, such as unbounded recursion or dynamic allocation, and builds an intermediate representation with operations, dependencies and memory accesses. Standard optimizations such as constant folding and dead code removal run first. It is hard because software idioms assume a flat memory and sequential execution, so pointers, aliasing and loop bounds that are unknown at compile time must be analyzed or restricted.",
    k: ["Accept a large subset of the language versus a small strictly synthesizable one: a large subset eases reuse of existing code but hides expensive hardware; a small one steers users to good hardware.", "Run general compiler optimizations versus keep the user's structure: optimizations help area and speed, but reshape code the user wants to control."],
    p: ["Pointer-heavy code compiles but produces a serialized memory bottleneck the user cannot see in the source.", "Floating-point arithmetic expands into large operators nobody planned for."],
    v: "Feed a function using dynamic allocation and confirm the front end rejects it with a message naming the line, then feed a bounded-loop version and confirm it produces an intermediate representation with expected operation counts.",
    dep: ["hls-scheduling", "generic-netlist-ir"]
  },
  "hls-scheduling": {
    s: "Assigns each operation in the algorithm to a clock cycle, respecting data dependencies, the target clock period and operator delays, to minimize latency within resource limits.",
    d: "Using a delay model of the target device, the scheduler packs chains of operations into a cycle until the clock period is reached, then starts a new cycle. It balances latency against the number of operators and registers. Pragmas can constrain it. It determines the clock frequency and latency of the generated hardware. It is hard because the delay model estimates logic before placement, so a schedule that looks fast on paper can miss timing after routing.",
    k: ["Schedule with pessimistic delay estimates versus optimistic ones: pessimistic gives reliable timing but wastes cycles; optimistic is faster on paper and fails closure.", "Minimize latency first versus minimize resources first: latency-first costs more operators, resource-first gives smaller hardware that takes more cycles."],
    p: ["Estimated clock period meets the target but implementation fails because routing added delay the model never counted.", "Small source changes shift operations across cycle boundaries and change results dramatically."],
    v: "Synthesize a multiply-accumulate loop for a 10 ns clock and confirm the report lists its cycle latency, then check that the implemented design after routing meets the 10 ns period in the timing report.",
    dep: ["software-language-front-end", "delay-models", "resource-binding"]
  },
  "resource-binding": {
    s: "Chooses which hardware operator or memory port performs each scheduled operation, sharing one unit among operations in different cycles to save area.",
    d: "After scheduling, operations that never run in the same cycle can use the same multiplier or adder. Binding picks these assignments and inserts the multiplexers and registers sharing needs. It also maps operations to specific device resources such as multiplier blocks or logic implementations. The tradeoff is area against delay: sharing saves operators but multiplexers add delay and routing. It is hard because the best choice depends on placement effects the binder cannot see.",
    k: ["Aggressive operator sharing versus replicate for speed: sharing saves area, but multiplexer delay and routing can make the clock slower than replication would.", "Bind to dedicated blocks versus soft logic: dedicated blocks are efficient and fast, but they are limited in number and can be exhausted by a large algorithm."],
    p: ["A shared operator creates a long path through input multiplexers that becomes the critical path.", "Binding exhausts the multiplier blocks, and the rest silently go to slower logic."],
    v: "Compile a design with eight multiplications under a constraint to use two multipliers, and confirm the report shows two operators bound with four operations each and the interval between results matches.",
    dep: ["hls-scheduling", "dsp-packing"]
  },
  "loop-pipelining-and-unrolling": {
    s: "Overlaps successive loop iterations in hardware so a new one starts every few cycles, and replicates loop bodies to run iterations in parallel.",
    d: "Pipelining starts iteration n+1 before iteration n finishes, limited by the initiation interval, the number of cycles between iteration starts. A dependency carried between iterations or a shared memory port raises that interval. Unrolling copies the loop body so several iterations execute at once, multiplying area. Together they decide throughput. They are hard because loop-carried dependencies and memory port limits set a hard floor, and the tool must explain why it could not reach the requested interval.",
    k: ["Pipeline a loop versus unroll it: pipelining adds little area and gains throughput to the dependency limit, unrolling scales throughput with area.", "Let the tool pick factors versus set them by directive: automatic choices are convenient, explicit directives are predictable and reviewable."],
    p: ["A requested interval of one cannot be met because of a memory port conflict, and the tool quietly relaxes it.", "Unrolling a large loop explodes area beyond what the device can hold."],
    v: "Pipeline a loop with a target interval of one, read the report for the achieved interval, and confirm in simulation that outputs arrive one per cycle after the pipeline fills.",
    dep: ["hls-scheduling", "memory-partitioning"]
  },
  "interface-synthesis": {
    s: "Turns a function's arguments and return into hardware ports and handshake signals, choosing among streaming, memory-mapped, register and direct-wire forms.",
    d: "Each argument becomes a port style according to its type and directives: a scalar as a register, an array as a memory port or a stream, a stream as a handshake channel. Control ports start the block and signal completion. The choice sets how the module connects to the rest of the system. It is hard because the same function takes very different forms with different performance, and a mismatch with the surrounding interconnect shows up only when the block is integrated.",
    k: ["Streaming interfaces versus memory-mapped arrays: streams allow producer and consumer overlap and need no addressing, arrays allow random access but serialize on ports.", "Blocking handshake on every transfer versus fixed-latency ports: handshakes are safe under back-pressure, fixed latency uses less logic but assumes the surroundings never stall."],
    p: ["An array argument becomes a single-port memory, serializing accesses and halving expected throughput.", "A stream consumed more slowly than produced deadlocks when its buffer is too shallow."],
    v: "Synthesize a function with one streaming input and one streaming output, then drive it in simulation with back-pressure applied and confirm no data is lost or duplicated.",
    dep: ["software-language-front-end", "interface-definitions"]
  },
  "memory-partitioning": {
    s: "Splits arrays across several memory blocks or into registers so that more elements can be accessed in the same cycle than one block's ports allow.",
    d: "A block memory provides only a few ports. If a pipelined loop needs several reads per cycle, the tool divides the array cyclically, by blocks, or completely into registers, so different elements live in different physical memories. Each scheme matches a particular access pattern. It increases bandwidth and costs memory blocks and addressing logic. It is hard because the best scheme depends on the index pattern, and an irregular access can defeat any static partition.",
    k: ["Cyclic versus block partitioning: cyclic suits neighboring accesses within one iteration, block suits parallel loops over separate regions.", "Complete partitioning into registers versus memory blocks: registers give unlimited access with huge area, blocks are efficient but port-limited."],
    p: ["Partitioning that does not match the real index pattern leaves port conflicts and no speedup.", "Registers for a big array consume tens of thousands of flip-flops."],
    v: "Partition an array by factor four, pipeline a loop reading four neighbors, and confirm the report achieves the target interval with four memories instantiated.",
    dep: ["loop-pipelining-and-unrolling", "memory-primitive-mapping"]
  },
  "hls-cosimulation": {
    s: "Runs the original algorithm and the generated hardware against the same test inputs and compares their outputs, to prove the generated design behaves like the source.",
    d: "A testbench written in the software language feeds inputs to the function. The tool captures the data, drives it into a hardware simulation of the generated module, and checks the results against the software outputs. Passing shows functional equivalence on those inputs, not in general. It is the main way to catch scheduling and interface mistakes. It is hard because cycle-accurate hardware simulation is thousands of times slower than software, and tests that reach only common paths miss corner cases.",
    k: ["Compare outputs only versus compare cycle-level behavior too: output comparison is portable across implementations, cycle comparison catches handshake bugs but fails on any legal timing change.", "Reuse the software testbench versus write a hardware-specific one: reuse is cheap and checks intent, a dedicated bench can stress back-pressure and reset."],
    p: ["A passing run on a handful of inputs is read as proof of correctness for all.", "Numerical results differ in the last bits between hardware and software arithmetic, and the comparison is loosened until it hides real errors."],
    v: "Run cosimulation across a test vector set including boundary values, confirm the report states a pass with a count of vectors and that deliberately changing a coefficient in the hardware makes it fail.",
    dep: ["hls-scheduling", "interface-synthesis"]
  },
});
