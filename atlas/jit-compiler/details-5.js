// Details for the JIT compiler plate, part 5: runtime and GC integration, debugging and diagnostics.
ATLAS.details("jit-compiler", {
  "safepoints": {
    s: "Positions in generated code where a thread may be stopped and where the runtime can fully describe its state, so the collector, deoptimizer and debugger can act on it.",
    d: "Generated code is only interruptible at designated points: calls, loop back-edges and function entries. At each, the compiler records which values are heap references, so the collector can find and update them. Other points, between safepoints, have no description and cannot be stopped at. The runtime requests a stop by setting a flag or patching code, and threads poll it at the next safepoint. The difficulty is latency and density: sparse safepoints make stop-the-world pauses long, dense ones cost code size and metadata.",
    k: ["Polling at loop back-edges versus only at calls: bounded stop latency for tight loops, but a load and branch in every iteration.", "Safepoints only at calls versus anywhere with full maps: smaller tables, but a loop with no calls can block the collector indefinitely."],
    p: ["A counted loop without a poll lets one thread delay every other thread's pause for seconds.", "Allocating between safepoints with references held only in registers the map does not list loses them."],
    v: "Run a tight non-allocating loop in one thread, request a collection from another, and confirm the stop completes within a few milliseconds with every thread stopped at a recorded safepoint.",
    dep: ["stack-maps","interrupt-checks","code-objects"]
  },
  "stack-maps": {
    s: "Tables that say, for each safepoint in a compiled function, which registers and stack slots hold heap references, so the collector can find and update them.",
    d: "The register allocator and backend produce, per safepoint, a bitmap or list of locations that contain tagged object pointers, and which of them are derived pointers into the middle of an object. The collector walks each frame, finds its code object by return address, looks up the map for that offset and scans exactly those locations, updating them if objects move. Maps are compressed with deltas. The difficulty is accuracy: a missing live reference means a collected object is still used, and an extra non-reference value means a random integer is treated as a pointer.",
    k: ["Precise maps versus conservative stack scanning: exact and allows moving collectors, but every optimization must keep the maps right.", "Per-safepoint maps versus one map per function with liveness ranges: smaller and faster to build, but coarser results hold dead references longer."],
    p: ["A derived interior pointer that is not recorded points into freed memory after an object moves.", "An unboxed integer left in a slot the map calls a reference is rewritten by the collector and corrupted."],
    v: "Run a stress mode that collects at every safepoint, relocating all objects, and confirm programs still produce identical results and a heap verifier finds no dangling reference.",
    dep: ["safepoints","register-allocator","code-objects"]
  },
  "embedded-heap-references": {
    s: "Object pointers placed directly in generated code, such as a shape to compare against, which the collector must find, keep alive or weakly track, and update if the object moves.",
    d: "Optimized code embeds the shape, the callee or a constant object as an immediate or a pool entry for speed. Each such site is in the relocation table, marked strong or weak. For a moving collector, the site is rewritten with the new address after relocation and the instruction cache is flushed. Weak references to shapes let code die when its shapes are unreachable. The difficulty is that these are writes to executable memory, in the middle of collection, needing protection changes, and that a missed site becomes a dangling pointer.",
    k: ["Embedded pointers versus loading through a handle table: one fewer load and faster compare, but code must be updated when objects move.", "Strong versus weak embedded references: weak lets dead shapes free their code, but needs a post-collection pass to clear them."],
    p: ["A strong reference to a shape in rarely used code keeps a whole class hierarchy alive for the process lifetime.", "A pointer update done without an instruction cache flush runs the old address on some cores."],
    v: "Force a compacting collection of an object embedded in compiled code, then run the code and confirm it compares against the new address and produces correct results with no stale pointer found by a scan.",
    dep: ["relocation-info","code-objects","icache-coherence"]
  },
  "write-barrier-emission": {
    s: "Emits the extra instructions around heap stores that tell the collector about pointers written into older objects, as required by generational and incremental collection.",
    d: "A store of a reference into an object checks whether the target object is young and the holder old, or whether the collector is currently marking, and if so records the slot or marks the value. The fast path is a few instructions and a flag test. The optimizer removes barriers where it can prove they are unnecessary, such as a store into an object just allocated or a store of a small integer. The difficulty is that a missing barrier is a latent corruption that surfaces only after a specific collection timing.",
    k: ["Inline barrier fast path with an out-of-line slow path versus calling a stub for every store: faster, but increases code size at every store.", "Eliminating barriers on fresh allocations versus always emitting: removes real cost, but is only valid if no safepoint can occur between allocation and store."],
    p: ["Eliminating a barrier across a call that may collect leaves an old-to-young pointer unrecorded.", "Skipping the barrier for a value assumed to be an integer, when it can be a reference, loses a live object."],
    v: "Run a store-heavy workload under a collector verification mode that checks every old-to-young pointer is in the remembered set, with the optimizer on, and confirm no violation is reported.",
    dep: ["inline-allocation","safepoints","instruction-selection"]
  },
  "inline-allocation": {
    s: "Allocating objects directly in generated code by bumping a pointer in the current allocation region, with a call to the runtime only when the region is full.",
    d: "The fast path loads the allocation top and limit, adds the size, compares, stores the new top and initializes the header and fields. If the region is exhausted it calls the runtime, which may collect. Multiple allocations in one basic block are folded into a single bump and limit check. Initialization stores need no barriers. The code uses the allocation site profile to choose the old or young region. The difficulty is that the slow call is a safepoint, so the code must have a valid map and frame state at it.",
    k: ["Folding several allocations into one check versus separate checks: less work, but a large combined size may fail the fast path more often.", "Zeroing in the fast path versus pre-zeroed regions: simple and always correct, but costs stores for every object."],
    p: ["An object partially initialized when the slow path collects exposes uninitialized fields to the collector.", "Folding allocations across a call that can run code makes later objects belong to the wrong region state."],
    v: "Allocate a million small objects in an optimized loop and confirm the disassembly shows a bump and limit compare, with runtime calls only when regions fill and heap statistics agree.",
    dep: ["safepoints","stack-maps","allocation-site-profiles"]
  },
  "runtime-call-stubs": {
    s: "Adapters that let compiled code call runtime functions in the host language, saving registers, switching conventions, recording the stack position and handling exceptions on return.",
    d: "A call from generated code into the runtime goes through a stub that spills caller state, sets up the frame so the stack walker can see the transition, passes arguments in the host convention, and calls the function. On return, it checks for a pending exception and unwinds if one is set. The recorded frame lets the collector scan the generated frames below it. The difficulty is that every such call is a potential collection and deoptimization point, so the caller must have a valid map and frame state.",
    k: ["Generic stubs by argument count versus a stub per runtime function: small code and one place to get it right, but argument shuffling at every call.", "Checking exceptions after every runtime call versus using unwinding tables: simple and portable, but adds a compare and branch after each call."],
    p: ["A stub that omits the frame marker makes the collector skip the generated frames below and lose their references.", "A runtime function that triggers a collection while the caller holds an unrecorded reference corrupts it."],
    v: "Call every runtime function from optimized code under a stress mode that collects inside each call, and confirm identical output with a clean walkable stack at each call.",
    dep: ["calling-convention","stack-walking","safepoints"]
  },
  "exception-tables": {
    s: "Tables that map ranges of generated code to their handlers, so that a thrown exception unwinds to the right place with the right state.",
    d: "For each protected range, the code object lists the handler offset, the stack depth to restore and which register holds the exception. When a call throws, the runtime walks frames, searches each table for the throwing return address, and if it finds a handler, resets the frame and jumps there. If none, the frame is popped and it continues to the caller. Optimized code treats handlers as extra control edges, which constrains optimization of every call in a try region. The difficulty is correct state at the handler: values must be recoverable as the interpreter would expect.",
    k: ["Table-driven unwinding versus checking at each call: zero cost when no exception occurs, but a slower throw and a table to build and verify.", "Compiling code with handlers versus leaving it to lower tiers: simple graphs, but functions with try blocks never reach the top tier."],
    p: ["A handler range off by one instruction catches exceptions from the wrong call or misses the right one.", "State at the handler that differs from the interpreter's makes the catch block read stale variables."],
    v: "Throw from each call position inside nested try regions in optimized code and confirm the right handler runs with the right variable values, matching a run with optimization disabled.",
    dep: ["code-objects","frame-states","stack-walking"]
  },
  "stack-walking": {
    s: "Traversing the frames on a thread's stack, across all tiers and stubs, to find each function, its bytecode position and its references.",
    d: "A walker starts at the top frame and uses the frame type tag or the return address, looked up in the code cache, to know how to read each frame. It serves the collector, which scans references; the deoptimizer, which finds frames to rebuild; exception unwinding; the debugger; and the sampling profiler, which walks from a signal handler. Each user needs different data. The difficulty is robustness: the walk must succeed at any safepoint, and the profiler must walk at points that are not safepoints, in a state that may be mid-prologue.",
    k: ["Frame-pointer chains versus table-driven unwinding: very fast and simple to walk from a signal, but it costs a register and needs every stub to maintain it.", "Walking only at safepoints versus anywhere: full information available, but the profiler gets fewer samples and a skewed view."],
    p: ["A sample taken in a function prologue, before the frame is built, reads the caller's frame as the callee's.", "A stub that does not push a frame marker breaks the walk through it."],
    v: "Sample the stack from a signal handler thousands of times while running a mixed-tier workload, and confirm every sample resolves to a valid chain of functions ending at the program entry.",
    dep: ["shared-frame-layout","code-cache","code-objects"]
  },
  "interrupt-checks": {
    s: "Cheap polls in generated code at calls and loop back-edges that notice requests to stop, collect, deoptimize, install code or terminate the program.",
    d: "A thread sets a request by writing a flag or a guard word that every poll reads; the poll is a load and a conditional branch to a slow path, or a load from a protected page that traps. The slow path runs the pending request: stopping for a collection, running a handler, applying a deoptimization or installing finished code. The same mechanism implements timeouts and termination. The difficulty is the overhead in tight loops and the responsiveness of long stretches of code without polls.",
    k: ["A flag load and branch versus a trap on a protected page: portable and simple, versus a poll that is a single load but needs signal handling.", "Polling in every loop versus polling every N iterations: lower cost per iteration, but complexity from unrolled counters and a slower reaction."],
    p: ["A loop optimized without its poll delays collection requests until the loop ends.", "A poll that runs the slow path in a state without a valid frame state breaks deoptimization requested through it."],
    v: "Request a collection while a thread runs the tightest loop in the benchmark set, and confirm it reaches the slow path within a short bound and the loop's throughput stays within the stated overhead.",
    dep: ["safepoints","code-objects"]
  },
  "code-unloading": {
    s: "Freeing generated code when the functions, shapes or modules it belongs to are no longer reachable, as determined by the collector.",
    d: "Code objects are heap objects with weak links to their function and shapes. During a collection, the collector finds code whose owner is dead, or whose weak references were cleared, and queues it for unloading. Before the memory is reused, the runtime unlinks any callers that pointed at it, removes it from the registry and checks that no stack contains it. Optimized code reachable from a live function is kept as long as its dependencies hold. The difficulty is ordering and safety, since callers point directly into the instructions.",
    k: ["Unloading with the collection versus lazily afterwards: reclaims memory in one place, but lengthens the pause.", "Weak versus strong links from code to its dependencies: lets dead classes free their code, but needs fixup of the registry and callers."],
    p: ["Freeing code that is still the target of a direct call from live code jumps into reused memory.", "Dead code kept alive by a strong link from the registry keeps its entire object graph reachable."],
    v: "Create and drop many short-lived classes with compiled methods and confirm the code cache size returns to its baseline after collections, with no crash from callers.",
    dep: ["code-objects","dependency-registry","code-patching","stack-maps"]
  },
  "jit-trace-logs": {
    s: "Text or structured logs recording each compile, tier-up, bailout, installation, deoptimization and eviction with reasons, timings and sizes.",
    d: "Flags enable categories of output: compile start and end with time and size, which functions were inlined, why a compile bailed, each deoptimization with its reason and bytecode offset, and each code cache event. Output is designed to be machine-parsed as well as read, and can be written to a file per process. They are the first tool for answering why a function is slow or why startup is. The difficulty is volume and cost: logging every event on a large program produces gigabytes and slows execution, and the log itself changes timing.",
    k: ["Structured records versus free text: scripts can aggregate and diff them, but they are harder to read at a glance.", "Always-compiled-in logging versus a separate build: usable on production problems, but every event site carries a flag check."],
    p: ["Logging enabled on a timing-sensitive bug hides it by changing compile timing.", "Reasons given as vague text cannot be grouped, so the same cause appears as hundreds of distinct lines."],
    v: "Run a script with logging on and confirm each function's lifecycle is reconstructible from the log: compile, install, any deoptimization with its reason, and eviction, with matching timestamps.",
    dep: ["deopt-reporting","compilation-queue"]
  },
  "ir-visualizer": {
    s: "A viewer for the compiler's graph after each phase, letting an engineer follow how an operation was created, transformed or removed.",
    d: "The compiler can dump the graph at each phase boundary in a stable text or JSON format, with node ids, operations, types, inputs and source positions. A viewer renders it as an interactive graph with phases as tabs, search by node id or bytecode, collapsed control flow and diffs between phases. It is how engineers learn why a check survived or where a deoptimization comes from. The difficulty is size, since large graphs are unreadable without filtering, and keeping the dump format stable across compiler changes.",
    k: ["Dumping after every phase versus on request for chosen phases: complete history, but large files and slower compiles.", "A graph view versus a linear listing: shows data flow and effect order, but poorly suited to scanning a large function."],
    p: ["A dump that omits effect and control edges makes the graph look wrong when it is correct.", "Dumps from a build with different node ids do not match the source positions."],
    v: "Dump the phases for a small function and confirm the viewer can trace a chosen source expression through each phase to its final instruction, including where it was merged or removed.",
    dep: ["graph-ir","phase-pipeline","position-tables"]
  },
  "disassembler-output": {
    s: "Printing generated machine code as readable instructions, annotated with the source positions, safepoints, deoptimization exits and embedded objects they correspond to.",
    d: "A disassembler for each target reads the code object's bytes and prints instructions with addresses and offsets, interleaved with annotations from the metadata tables: this is a call, this is a safepoint, this is a guard exit to frame state N. Embedded constants print as the objects they refer to. It is used for checking that expected instructions were generated and for diagnosing miscompiles. The difficulty is keeping it complete and correct per target, because an instruction it cannot decode may be the one that matters.",
    k: ["Disassembling the code in memory versus the compiler's intermediate listing: shows exactly what runs, but loses the link to the compiler's intent unless annotated.", "A built-in disassembler versus an external tool: always matches the runtime's encodings, but is one more per-target component to maintain."],
    p: ["A disassembler that fails on a newer instruction form prints nothing for the exact code under investigation.", "Printing from a live process after patching shows a different listing than what the compiler emitted."],
    v: "Disassemble a function containing a guard, a call and a loop, and confirm each is annotated with its table entry, and that the bytes agree with a reference disassembler for the whole function.",
    dep: ["assembler","code-objects","relocation-info"]
  },
  "jit-symbolization": {
    s: "Telling external profilers and debuggers what generated code is, by emitting a map from address ranges to function names, tiers and source locations.",
    d: "System profilers see only addresses in anonymous executable memory. The runtime writes a map file, calls a registration interface, or emits a special debug format listing each code object's start, size and a name such as the function, its tier and its script location. It must also record unloads and moves so addresses are not misattributed. With it, flame graphs show JavaScript-level names. The difficulty is keeping the map current as code is installed, evicted and replaced, and the cost of writing it for thousands of functions.",
    k: ["A continuously appended map file versus an interface the profiler queries: simple and works with any tool, but the file grows and may be stale.", "Emitting symbols for all code versus only code above a size or hotness threshold: smaller maps, but small hot stubs go unnamed."],
    p: ["An address range reused by new code after eviction is attributed to the old function's name.", "No entries for stubs and builtins leave large unattributed regions in a profile."],
    v: "Profile a workload with a system profiler and confirm every sample in generated code resolves to a function, tier and location, with no samples attributed to a function that had been evicted.",
    dep: ["code-objects","code-cache","position-tables"]
  },
  "jit-sampling-attribution": {
    s: "Assigning each sample taken from a running program to the right source function and tier, including inlined callees that no longer exist as separate frames.",
    d: "A sampler interrupts a thread on a timer, walks its stack and finds, for each frame, the code object and the offset. For optimized code, the position table and inlining records say which source functions were inlined at that offset, so one machine frame is expanded to several logical frames. Samples are tagged with the tier, so time in the interpreter, baseline and optimized code can be separated. The difficulty is skid and bias, since samples land only at points the walker can describe, and inlined frames require table lookups at sample time.",
    k: ["Expanding inlined frames at sample time versus after the fact: immediate names, but slower sampling and more work in a signal handler.", "Sampling at any instruction versus only at safepoints: more accurate attribution to hot spots, but needs full tables at every offset."],
    p: ["Samples that can only be taken at safepoints systematically hide the code between them.", "An inlined function's time is charged to its caller and misleads optimization work."],
    v: "Run a benchmark whose time is known to be in an inlined helper and confirm the profile reports the helper as the top function with its own tier, not the caller.",
    dep: ["stack-walking","position-tables","jit-symbolization"]
  },
  "position-tables": {
    s: "Mappings from machine code offsets to source positions and inlining stacks, so errors, profilers and debuggers can report in terms of the original program.",
    d: "The code generator records, for ranges of instructions, the source position they came from and the chain of inlined functions at that point. Entries are compact deltas. The runtime uses them to build stack traces in exceptions, to attribute profile samples, to map breakpoints and to report deoptimization sites. After heavy optimization, one instruction may come from several positions or none, so the tables record the best available answer. The difficulty is fidelity versus size: precise tables cost memory, and code motion makes positions approximate.",
    k: ["Precise per-instruction positions versus per-safepoint positions: better profiles and debugging, but larger tables.", "Keeping tables in the code object versus recomputing from bytecode on demand: instant lookup, but memory held for all compiled code."],
    p: ["Code hoisted from a loop keeps the loop's position and makes the profile blame the wrong line.", "Tables dropped to save memory make stack traces from optimized code useless."],
    v: "Throw an error from deep within inlined code and confirm the stack trace shows each logical function and line, matching the trace produced with optimization disabled.",
    dep: ["code-objects","frame-states"]
  },
  "debugger-integration": {
    s: "Making a debugger work with optimized code: breakpoints, stepping and variable inspection, usually by returning the function to a lower tier first.",
    d: "Setting a breakpoint or stepping in a function requires the exact bytecode position and state, which optimized code does not have. The usual approach is to deoptimize the function and run it in the interpreter or baseline while the debugger is attached, with optimization of debugged functions disabled. Frames already on the stack are deoptimized eagerly so they can be inspected. Variable values come from frame states. The difficulty is that debugging changes behavior, performance and timing, and that eagerly deoptimizing frames must be done at a safe point.",
    k: ["Disabling optimization for debugged functions versus inspecting optimized frames: exact and simple semantics, but the debugged program runs slower and may behave differently.", "Deoptimizing all frames on attach versus only those with breakpoints: simplest model, but a bigger performance cliff on attach."],
    p: ["A breakpoint set in a function whose optimized frame is on the stack never fires for that activation.", "Values shown from an optimized frame are stale or optimized out and are misread as bugs."],
    v: "Attach a debugger to a program running optimized code, set a breakpoint inside a hot function, and confirm it stops with correct variables and stepping proceeds, with the function visible in a lower tier.",
    dep: ["lazy-deopt","frame-reconstruction","position-tables"]
  },
  "deopt-reporting": {
    s: "Recording every deoptimization with its reason, function, bytecode offset and guarded assumption, so the causes of repeated recompiles can be found and counted.",
    d: "At each exit, the deoptimizer logs the reason from a fixed enumeration, such as wrong shape, not a small integer, out of bounds or lost dependency, plus the function, the position and the feedback state. Counters aggregate by reason and by site, and can be exposed to tooling or telemetry. This turns an invisible slowdown into a list of named causes. The difficulty is granularity: reasons that are too broad cannot be acted on, and the logging itself must not be heavy since deoptimization can be frequent.",
    k: ["A fixed reason enumeration versus free text: aggregable and cheap, but each new kind of exit needs a new code.", "Logging each event versus aggregating counts per site: full detail for diagnosis, but unbounded volume for a function that deoptimizes in a loop."],
    p: ["A generic reason such as unknown hides the one cause that matters.", "Logging every event from a deoptimization loop fills the disk and slows the program further."],
    v: "Force three distinct deoptimizations and confirm the report lists each with the right reason, function and bytecode offset, with counts that match the number of forced events.",
    dep: ["deopt-exits","frame-reconstruction","position-tables"]
  },
  "cliff-diagnostics": {
    s: "Finding and explaining performance cliffs, where a small program change makes code several times slower because it silently left optimized code or hit a generic path.",
    d: "Typical cliffs are a shape that goes polymorphic past the cache limit, an object moving to dictionary mode, a function pinned by a bailout, an integer overflowing into doubles, or a deoptimization loop. Diagnostics combine the trace logs, deoptimization reports, feedback dumps and profile attribution to say which one. Some engines can flag a hot function that is not in the top tier, or a site that went megamorphic. The difficulty is that the cause is often far from the symptom, in how an object was built elsewhere.",
    k: ["Automatic cliff detection with warnings versus manual log reading: points straight at the cause, but adds checks and potential false alarms.", "Per-site feedback state dumps versus aggregate counters: precise root cause, but verbose and needing source mapping."],
    p: ["A cliff caused by object construction order is blamed on the access site, and the fix goes in the wrong place.", "A warning for every megamorphic site buries the one that matters."],
    v: "Introduce a known cliff, such as adding a property in a different order, and confirm the tools identify the site, the cause, and the slowdown, then confirm removing it restores the original speed.",
    dep: ["deopt-reporting","jit-trace-logs","type-feedback-vectors","jit-sampling-attribution"]
  },
  "jit-telemetry": {
    s: "Aggregate counters about compilation and deoptimization, such as compile time, code size, tier distribution and deopt rates, collected in running systems to track the compiler's health over time.",
    d: "Counters and histograms record how many functions reach each tier, time spent in compile, bytes of code installed, bailout reasons, evictions and deoptimizations per thousand calls. They are exported from the runtime or sampled by a monitoring agent and compared across versions and configurations. A rise in deoptimization rate after a release flags a regression no test caught. The difficulty is choosing metrics that predict user-visible speed and avoiding counters whose maintenance costs more than they inform.",
    k: ["Always-on aggregate counters versus detailed logging on demand: cheap, continuous and comparable across releases, but they cannot explain a single slow function.", "Per-tier time breakdown versus end-to-end timings: points at which tier caused a change, but needs the profiler's attribution to be accurate."],
    p: ["A metric averaged across all functions hides a regression in the few that matter.", "Counters reset on tier changes or restarts make trends look better than they are."],
    v: "Run a fixed benchmark across two builds and confirm the telemetry reports tier distribution, compile time and deoptimization rate, and that an injected regression moves the right metric.",
    dep: ["deopt-reporting","compilation-queue","code-cache"]
  },
  "differential-fuzzing": {
    s: "Generating random programs and running them across tiers and settings, then comparing results, to find miscompiles that hand-written tests would never reach.",
    d: "A generator produces valid programs that stress the optimizer: type changes after warmup, unusual shapes, extreme integers, exceptions in loops. Each is run in the interpreter only, with each tier forced, and with stress flags that deoptimize randomly or collect at every safepoint. Any difference in output, or a crash, is a bug, and the input is minimized. It is the main defense against silent wrong output. The difficulty is generating programs that actually get hot and reach rare optimizations, and distinguishing real differences from allowed nondeterminism.",
    k: ["Comparing tiers against the interpreter as an oracle versus asserting expected values: needs no hand-written answers, but the interpreter must itself be correct.", "Grammar-based versus mutation-based generation: valid and deep programs, versus finding unusual cases from real code, at different hit rates."],
    p: ["Generated programs that never run hot enough test only the interpreter.", "Nondeterministic builtins, such as time or randomness, cause false mismatches that hide real ones."],
    v: "Plant a known miscompile in a branch of the compiler and confirm the fuzzer finds a differing program within a bounded number of runs, and minimizes it to a small reproducer.",
    dep: ["optimizing-compiler","deopt-exits","ir-verifier","interpreter-tier"]
  }
});
