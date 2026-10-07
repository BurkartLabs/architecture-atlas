// Details for the WebAssembly runtime plate, part 5: execution engines.
ATLAS.details("wasm-runtime", {
  "interpreter-loop": {
    s: "The tier that executes validated code directly, one instruction at a time, with no compile step, giving instant start, small memory use and a simple reference for behavior.",
    d: "A dispatch loop reads an opcode, performs its action on an operand stack and locals, and moves to the next. Modern interpreters translate the binary into a denser internal form first so decoding does not repeat. Dispatch uses a switch, computed jumps or threaded code. Because it runs on every host, an interpreter is the portable fallback and the easiest tier to instrument for debugging, fuel and tracing. It is slow, often tens of times slower than compiled code, and branch prediction on dispatch is the main cost.",
    k: ["Interpreter as the first tier vs compiling everything: an interpreter starts at once and uses little memory, but needs a second tier for speed.", "Switch dispatch vs threaded dispatch: a switch is portable and simple, but a single shared indirect branch predicts poorly."],
    p: ["Performance cliffs: code stuck in the interpreter because tier-up never triggers runs far slower than expected.", "The interpreter and compiler disagree on an edge case such as a float conversion, and results depend on the tier."],
    v: "Run a loop-heavy benchmark on the interpreter alone and on the compiled tier; confirm identical results, startup measured in milliseconds for the interpreter, and a clear speedup for compiled code.",
    dep: ["internal-bytecode", "control-flow-side-tables", "numeric-semantics", "validation-algorithm"]
  },
  "internal-bytecode": {
    s: "A compact internal instruction format produced from the binary, with resolved indices, precomputed branch targets and fixed-width operands, so the interpreter decodes cheaply.",
    d: "The binary's variable-length encoding is costly to decode repeatedly. A translation pass rewrites each function into an internal form: operands become fixed-width, local indices become slot offsets, branches get absolute targets, and common instruction sequences fuse. Validation information such as stack heights is baked in so no runtime checks are needed. It is produced lazily per function. The hard parts are keeping the translation in step with the specification, memory overhead from the larger form, and mapping positions back to original offsets for traces.",
    k: ["Translating to an internal form vs interpreting the original binary: translation speeds up execution, but costs time and memory on first run.", "Fusing common instruction sequences vs one-to-one translation: fusion reduces dispatches, but multiplies the number of internal instructions to test."],
    p: ["The internal form loses the original offset, so traces and profiles point at wrong positions.", "Translation of a huge function allocates memory several times larger than the binary."],
    v: "Translate a function, run it, and compare output and trap offsets with a direct interpretation of the original binary; every result and every trap location must match.",
    dep: ["validation-algorithm", "control-flow-side-tables", "binary-decoder"]
  },
  "control-flow-side-tables": {
    s: "Precomputed tables that give each branch its target, stack height and arity, so the interpreter jumps without scanning ahead through nested blocks.",
    d: "Structured control flow nests blocks, loops and ifs, and a branch names a label depth. Finding its target by scanning is slow. During validation the engine records, for each branch, the destination offset, how many stack values to keep and how many to drop. The interpreter reads this table at run time. It trades memory for speed and is built lazily. The hard parts are table size on very large functions, correctness across new control constructs such as exceptions, and keeping the table in sync with any code rewriting.",
    k: ["Side table computed at validation vs scanning at runtime: tables make branches constant-time, but add memory proportional to the number of branches.", "Per-function lazy table vs eager for the module: lazy avoids work for functions never run, but adds a first-call delay."],
    p: ["A branch entry records the wrong value count and corrupts the operand stack in rarely taken paths.", "A table for a very large function consumes more memory than the function itself."],
    v: "Run a function with deeply nested blocks and branches out of several levels carrying values, and confirm the results match a reference interpreter on every branch path.",
    dep: ["control-flow-validation", "interpreter-loop"]
  },
  "numeric-semantics": {
    s: "The exact results of integer and floating-point operations, including wraparound, trapping division, rounding, saturating conversion and canonical or arithmetic NaNs.",
    d: "Integers wrap at their width and have defined shifts and rotates. Division and remainder trap on zero and on signed overflow. Floats follow IEEE 754 with round to nearest, and results of operations on NaN have defined payload rules that allow some host variation. Float-to-integer conversions either trap or saturate. Every tier must reproduce these. It is hard because host instructions differ at the edges: hardware conversions on out-of-range values, minimum and maximum with NaN, and fused versus separate multiply-add.",
    k: ["Fully specified semantics with nondeterminism only in NaN payloads vs fully deterministic NaNs: allowing payload variation lets hosts use native instructions, but means two hosts can differ bitwise.", "Trapping conversions vs saturating ones: trapping catches errors, but saturating gives defined results without a branch."],
    p: ["A compiler uses a native conversion that returns a different value for out-of-range input than the interpreter.", "A fused multiply-add is used where the specification demands two roundings, changing the last bit."],
    v: "Run a table of edge inputs (maximum integers, zero divisors, infinities, NaNs, out-of-range conversions) through every tier and confirm identical results or identical trap kinds.",
    dep: ["trap-semantics", "cpu-feature-detection"]
  },
  "baseline-compiler": {
    s: "A fast single-pass compiler that emits machine code directly from validated bytecode with simple register allocation, trading speed of generated code for very low compile time.",
    d: "It walks the function once, in the same pass as validation or immediately after, keeping the operand stack in registers or stack slots and emitting instructions per operation. There is no intermediate form and almost no optimization. Compile speed is close to the speed of reading the binary, so large modules start running quickly while the optimizing tier works in the background. The code is typically a few times slower than optimized code. It is hard because simplicity must not compromise correctness, and it must support every feature the optimizer does.",
    k: ["Single-pass emission vs building an IR first: single-pass compiles in linear time with little memory, but cannot optimize across instructions.", "Compiling the whole module at once vs per function on demand: whole-module is simple, but a large module delays the first call."],
    p: ["A feature implemented only in the optimizing tier leaves the baseline tier unable to run modules using it.", "Poor register use makes baseline code slower than a good interpreter for short call-heavy functions."],
    v: "Compile a large module with only the baseline tier and confirm compilation proceeds at several megabytes per second, with results identical to the interpreter on a test suite.",
    dep: ["code-emission", "calling-conventions", "validation-algorithm", "module-object"]
  },
  "lazy-compilation": {
    s: "Defers compiling a function until its first call, so a module with thousands of functions only pays for the ones the program actually uses.",
    d: "At module creation, functions get a stub that calls the compiler. The first call triggers compilation, patches the call target and runs the new code. Because the binary was validated up front, the lazy compile cannot fail on invalid input. This shortens startup for big modules where most functions are cold. The cost is unpredictable latency on the first call to each function and synchronization when several threads call an uncompiled function at once. Concurrent compilation with a lock keeps results consistent.",
    k: ["Lazy per-function compile vs eager whole-module compile: lazy cuts startup, but spreads delays into the running program.", "Patching call sites directly vs always calling through a table: direct patching is faster, but requires safe code modification while other threads run."],
    p: ["Several threads call the same uncompiled function and compile it concurrently, wasting work or racing on patching.", "A latency-sensitive path hits a cold function and stalls for compilation."],
    v: "Load a module with ten thousand functions, call one, and confirm only that function and its callees are compiled and startup time is far below an eager compile of the whole module.",
    dep: ["baseline-compiler", "module-object", "executable-memory-management"]
  },
  "tier-up-policy": {
    s: "The rules for deciding which functions get recompiled at a higher tier, based on call counts, loop iterations and time spent, balancing compile cost against expected speedup.",
    d: "Counters at function entry and loop back edges track heat. When one crosses a threshold, a request goes to a background compiler thread. Finished code replaces the old version for future calls. Policies may also consider function size and the compile queue length. The hard part is the thresholds: too low wastes compile time on code that runs briefly, too high leaves hot code slow. Short-lived programs may never tier up, and programs with phases need re-evaluation as behavior changes.",
    k: ["Counter-based thresholds vs sampling-based hotness: counters are precise and simple, but add instructions to every call and loop.", "Compiling in the background vs on the calling thread: background compilation never stalls the program, but delays the speedup and uses another core."],
    p: ["A compile queue fills with mediocre candidates while the genuinely hot function waits.", "Counter overhead in the baseline tier is large enough to cancel its speed advantage."],
    v: "Run a loop-heavy program that starts cold, and confirm the hot function is replaced by optimized code after a bounded number of calls, with execution time dropping and results unchanged.",
    dep: ["baseline-compiler", "optimization-passes", "on-stack-replacement"]
  },
  "on-stack-replacement": {
    s: "Switches a running function from a lower tier to a higher one in the middle of execution, typically at a loop back edge, without waiting for it to return.",
    d: "A long-running loop in a function called once never gets replaced by a normal tier-up. At a back edge the engine checks whether optimized code exists, then maps the current locals and operand stack onto the optimized frame's layout and jumps into the optimized code at the matching point. The reverse, deoptimization, drops back to a lower tier when assumptions fail. Both need precise maps between tiers. It is hard because optimized code may have reordered or removed values and entry points must be placed where state is reconstructible.",
    k: ["Supporting entry at loop headers only vs anywhere: loop headers have simple, well-defined state, but leave long straight-line code stuck at the low tier.", "Deoptimizing to the interpreter vs the baseline tier: the interpreter is simplest, but slow for the rest of the function."],
    p: ["State mapping misses a local, and the optimized code starts with a stale value.", "Repeated tier switching with failing assumptions thrashes between tiers."],
    v: "Call a function once that runs a ten-second loop, and confirm that partway through it moves to optimized code, finishing sooner than a pure baseline run with identical output.",
    dep: ["tier-up-policy", "optimization-passes", "stack-trace-capture"]
  },
  "ir-construction": {
    s: "Translates validated bytecode into a graph-based intermediate form with explicit control flow and values, the structure on which optimization passes run.",
    d: "The stack machine form is rewritten into static single assignment: each operand-stack slot and local becomes a value, block parameters carry values across joins, and loops get phi nodes. Memory accesses and calls become explicit nodes with effects. Because the bytecode is already structured and type checked, construction is a linear walk with no need for general control-flow recovery. It is hard to keep fast, since it is allocation-heavy, and to represent traps and memory effects precisely enough to optimize without changing behavior.",
    k: ["Sea-of-nodes style graph vs a block-and-instruction control-flow graph: a graph exposes more reordering, but is harder to debug and schedule.", "Representing every potential trap as an explicit effect vs implicit: explicit effects keep ordering correct, but constrain the optimizer."],
    p: ["Loop phi construction misses a local modified only on one path and miscomputes a value.", "Memory use in the compiler grows superlinearly on a single very large function."],
    v: "Build the IR for a function with nested loops and branches, run it through an IR interpreter or verifier, and confirm the same result as the bytecode interpreter plus a passing structural verification.",
    dep: ["validation-algorithm", "control-flow-validation", "numeric-semantics"]
  },
  "optimization-passes": {
    s: "Transformations on the intermediate form, such as constant folding, redundancy elimination, loop-invariant motion and dead code removal, that make code smaller and faster while preserving behavior.",
    d: "Passes run in a fixed pipeline over the graph. Constant folding and strength reduction simplify arithmetic; global value numbering removes repeated computation; loop-invariant code motion lifts work out of loops; dead-code elimination drops unused values. Each pass must respect trap and memory ordering rules from the specification, and fuel or epoch checks. The pipeline's order and cost are tuned. It is hard because passes interact, a bug is only visible on rare inputs, and a pass that gains on one program loses on another.",
    k: ["A short pipeline with big wins vs a long pipeline of many small passes: a short pipeline compiles faster, but leaves gains behind.", "Verifying the IR after each pass in development builds vs trusting passes: verification finds bugs early, but is too slow to leave enabled."],
    p: ["A pass moves a load across a store that might alias, producing a wrong value only in rare inputs.", "An optimization removes a loop's only epoch check and makes the loop uninterruptible."],
    v: "Run a benchmark suite with the pipeline on and off, confirm identical outputs on every test and a measurable speedup, and confirm differential tests pass against the interpreter.",
    dep: ["ir-construction", "trap-semantics", "fuel-metering"]
  },
  "bounds-check-elimination": {
    s: "Removes or merges the explicit comparisons guarding memory accesses when analysis proves them redundant, while preserving where and whether a trap occurs.",
    d: "On hosts without guard pages, every access carries a comparison. The optimizer can combine checks for adjacent addresses into one, hoist a check out of a loop when the range is known, and drop one dominated by an earlier equal-or-stronger check. Guard-page runtimes also fold the static offset into the check. It must keep trap behavior exact: hoisting a check above a store changes what a trapping run has already written. The hard part is proving the transformation safe with growable memory, since the length can change between accesses.",
    k: ["Combining checks vs preserving a trap at the exact failing access: combining speeds loops, but must either prove no side effect intervenes or handle a precise trap.", "Speculative hoisting with a fallback vs only provably safe hoisting: speculation reaches more loops, but needs a slow-path version."],
    p: ["A check is eliminated across a call that grows or shrinks the length assumption.", "Hoisting an out-of-range check above stores changes the memory visible after the trap."],
    v: "Run a loop that writes past the end on its last iteration; confirm the trap occurs at the same iteration and the same bytes were written as under the unoptimized build.",
    dep: ["bounds-checking", "optimization-passes", "trap-semantics", "memory-growth"]
  },
  "inlining": {
    s: "Replaces calls to small or hot functions with their bodies, removing call overhead and exposing further optimization, subject to size and recursion limits.",
    d: "The optimizer decides per call site, using callee size, call frequency and nesting depth. Inlined bodies are copied into the IR with parameters substituted, then simplified with the caller. Imports and indirect calls usually cannot be inlined, though speculative inlining with a guard can handle a likely target. Modules compiled separately offer little inlining across their boundary. It is hard because inlining grows code and compile time, can hurt instruction cache use, and complicates stack traces, which must still show the logical frames.",
    k: ["Aggressive inlining vs conservative: aggressive inlining gains speed in call-heavy code, but increases code size and compile time sharply.", "Speculative inlining of indirect calls with a type check vs only direct calls: speculation helps dynamic dispatch, but needs guard and fallback code."],
    p: ["Inlining a function with a large frame makes the caller's frame huge and risks stack overflow.", "Debug tools lose frames because inlined functions leave no record."],
    v: "Compile a call-heavy benchmark with inlining on and off, confirm identical outputs, a speed improvement with it on, and that traces still list the inlined functions by name.",
    dep: ["optimization-passes", "stack-trace-capture", "ir-construction"]
  },
  "instruction-selection": {
    s: "Chooses host machine instructions for each operation in the intermediate form, using addressing modes, fused operations and vector instructions where the target offers them.",
    d: "A pattern matcher or rule table maps IR operations to target instructions, combining where profitable: an add feeding a load becomes one addressing mode, a compare feeding a branch becomes a fused compare-and-branch. Different hosts need separate backends. Selection depends on detected CPU features, so it consults a feature mask. It is hard because every backend repeats the work, rules must reproduce exact numeric semantics, and a missing feature needs a correct fallback sequence.",
    k: ["Declarative pattern rules vs hand-written selection code: declarative rules are easier to verify, but express some host quirks awkwardly.", "One backend per host architecture vs a portable low-level layer: separate backends use each host fully, but multiply maintenance."],
    p: ["A fused operation skips a rounding step that the specification requires, changing results by one bit.", "A rule written for newer hardware is used on a host lacking the feature."],
    v: "Compile a set of arithmetic and memory microtests for each supported host, run them, and compare with the interpreter's results; every result must match bit for bit.",
    dep: ["ir-construction", "cpu-feature-detection", "numeric-semantics"]
  },
  "register-allocation": {
    s: "Assigns the values in the intermediate form to a limited set of host registers and stack slots, inserting moves and spills so every value is somewhere when it is needed.",
    d: "The allocator computes how long each value lives, then assigns registers so that overlapping values differ. Linear-scan allocators run fast with decent results, while graph-coloring and region-based ones produce better code at higher cost. When registers run out, values spill to the stack. Calling conventions and instructions with fixed register needs add constraints. It is hard because compile time must stay low for large functions, and because the allocator must also record where references and values live for stack maps and debugging.",
    k: ["Linear-scan allocation vs graph coloring: linear scan compiles quickly with decent code, but spills more often in pressure-heavy loops.", "Splitting live ranges vs whole-lifetime assignment: splitting reduces spills, but adds moves and makes the allocator more complex."],
    p: ["A spill slot is reused too early and clobbers a still-live value, producing wrong results only in large functions.", "Allocation time grows superlinearly and a single huge function stalls the background compiler."],
    v: "Compile functions with far more live values than registers, run them, and confirm results equal the interpreter's, with allocator verification enabled and reporting no overlap of live ranges.",
    dep: ["instruction-selection", "calling-conventions", "gc-heap-and-collector"]
  },
  "code-emission": {
    s: "Writes the final machine code into executable memory, resolving labels and relocations, adding function prologues and epilogues, and recording the tables needed for traps, traces and unwinding.",
    d: "An assembler layer encodes instructions into bytes with branch fixups. Alongside the code it records metadata: the trap table mapping instruction addresses to trap kinds, source position maps, stack maps and unwind data. Code is then copied into pages that become read-execute. Calls between functions use relative or indirect branches depending on distance. It is hard because metadata must be exactly right: a wrong table entry turns a clean trap into a crash, and code layout affects instruction cache behavior.",
    k: ["Relative direct calls within a module vs always indirect calls: direct calls are faster, but require code to be placed within branch range and patched safely.", "Emitting metadata inline vs separate tables: inline keeps it near the code, but separate tables keep the instruction stream dense."],
    p: ["A trap-table entry is off by one instruction, and a fault is reported as an unrelated crash.", "Code copied into executable memory is run before the instruction cache is synchronized on a host that requires it."],
    v: "Compile a module, dump its machine code and tables, and confirm every faulting instruction in a trap test has a table entry; running the tests must trap cleanly with correct kinds.",
    dep: ["executable-memory-management", "hardware-trap-handlers", "register-allocation"]
  },
  "calling-conventions": {
    s: "The rules for passing arguments and results, preserving registers and locating the instance context between guest functions, host calls and trampolines.",
    d: "A guest calling convention puts arguments in registers first and spills the rest, returns results in registers or a result area, and keeps the instance context pointer in a reserved register. Calls from the host go through an entry trampoline that converts from the native convention; calls to the host go through an exit trampoline. Multiple return values and tail calls complicate it. It is hard because every tier must agree, because stack walking and unwinding depend on it, and because changing it affects every compiled function.",
    k: ["A custom internal convention vs the host's standard one: a custom one reserves registers for the context and avoids saving, but needs trampolines at every host boundary.", "Multiple results in registers vs a memory result area: registers are faster for a few values, but a memory area scales to any number."],
    p: ["The baseline and optimizing tiers disagree on which registers a callee preserves, and values vanish across tier-crossing calls.", "A trampoline fails to restore the context register after a host call."],
    v: "Call between functions compiled in different tiers with many integer, float and multiple-result signatures, and confirm every argument and result arrives intact in both directions.",
    dep: ["instruction-selection", "register-allocation"]
  },
  "ahead-of-time-compiler": {
    s: "Compiles a whole module to machine code before it is run, with the full optimizing pipeline and no time pressure, and emits the result for later loading.",
    d: "Given a module and a target description, it validates and compiles every function with the optimizing tier, then writes code, relocations and metadata to an artifact. No interpreter or runtime compile step is needed on the target, which suits constrained devices and fast cold starts. It also allows heavier optimization and whole-module analysis. The difficulty is that the artifact is tied to a specific engine version, feature set and CPU, so it needs strict checks when loaded, and that dynamic features cannot be added after the fact.",
    k: ["Compiling ahead of time vs just in time: ahead of time gives the fastest start and no compiler at runtime, but ties the artifact to one target and engine build.", "Targeting a baseline CPU vs the exact deployment CPU: a baseline target runs everywhere, but misses vector and other features."],
    p: ["An artifact built for a CPU with a feature is loaded on one lacking it and faults.", "A host updates the engine and loads old artifacts whose layout assumptions no longer hold."],
    v: "Compile a module ahead of time, load the artifact on a host with no compiler enabled, and confirm it runs with the same outputs as the JIT build and shows a much shorter startup time.",
    dep: ["optimization-passes", "serialized-artifacts", "cross-compilation", "validation-algorithm"]
  },
  "serialized-artifacts": {
    s: "The on-disk form of compiled code and its metadata, designed to be mapped directly into memory and executed or relocated with minimal parsing.",
    d: "An artifact bundles machine code, a function table, trap and position tables, relocation records, type information and a header describing the engine version, target and features. Loading maps it, applies relocations, and makes code executable. Position-independent layouts avoid relocation. The runtime must treat it as trusted input because it can contain arbitrary machine code, so integrity matters. It is hard to keep compatible across engine versions and to prevent a tampered artifact from being run.",
    k: ["Memory-mapped position-independent artifacts vs relocated on load: mapping is nearly instant, but costs some code efficiency.", "Signing or hashing artifacts vs trusting storage: verification blocks tampered code, but needs key handling and costs time on each load."],
    p: ["A tampered cached artifact is loaded and executed with no validation, bypassing the sandbox entirely.", "A truncated artifact from a crash during writing is mapped and jumped into."],
    v: "Serialize a compiled module, deserialize it in a fresh process, and confirm identical behavior; then flip one byte of the file and confirm loading is refused by the integrity check.",
    dep: ["code-emission", "artifact-compatibility-checks", "executable-memory-management"]
  },
  "compilation-cache": {
    s: "Stores compiled artifacts keyed by the module's content hash and the engine's configuration, so repeated loads skip validation and compilation.",
    d: "The key combines a hash of the binary with the engine version, target, enabled features and compiler settings. On load, the runtime looks the key up in memory or on disk and uses the stored artifact if it passes compatibility checks; otherwise it compiles and stores the result. Caching helps serverless and browser-style workloads that reload the same modules. It is hard because eviction must bound disk use, because concurrent processes may write the same entry, and because the cache is a trust boundary that must not accept tampered files.",
    k: ["Content-addressed keys vs path or name keys: content addressing is immune to renamed or modified files, but needs hashing the whole binary.", "A shared cache across tenants vs one per tenant: sharing saves compile work, but leaks which modules other tenants run through timing."],
    p: ["Two processes write the same cache entry at once and produce a corrupt file.", "A key that omits a feature flag serves code compiled for the wrong configuration."],
    v: "Load a module twice and confirm the second load skips compilation, is an order of magnitude faster, and gives the same results; change an engine flag and confirm a cache miss.",
    dep: ["serialized-artifacts", "artifact-compatibility-checks", "engine-configuration", "module-object"]
  },
  "artifact-compatibility-checks": {
    s: "The checks that decide whether a stored compiled artifact is safe to load: engine version, target, enabled features, compiler settings and integrity.",
    d: "An artifact header records everything that affected code generation. At load time the runtime compares each field with the current engine and refuses any mismatch, then verifies a checksum or signature. A mismatch is not an error but a cue to recompile from the original binary. The checks must be conservative: loading code made under different assumptions about memory layout or CPU features can crash or corrupt memory. The difficulty is covering every input to code generation and keeping the header current as features are added.",
    k: ["Exact-match compatibility vs a compatibility range: exact match is safe and simple, but invalidates caches on every engine update.", "Checking CPU features at load vs at compile: load-time checks catch machine changes, but need feature detection on every start."],
    p: ["A new compiler option is not added to the header, and artifacts built with different options load as compatible.", "A cache is moved to a machine with an older CPU, and illegal-instruction faults appear in production."],
    v: "Produce an artifact, then change the engine version, a feature flag and the target in turn; confirm each change causes a recompile and an unchanged setup reuses the artifact.",
    dep: ["serialized-artifacts", "feature-flags", "cpu-feature-detection"]
  },
  "cross-compilation": {
    s: "Compiles a module for a different host CPU or operating system than the one doing the compiling, so artifacts can be built centrally and deployed to many device types.",
    d: "The compiler takes a target description: instruction set, available CPU features, pointer width, object format and calling convention. It generates machine code for that target and writes an artifact without running it. Fleet deployments compile once per target and ship results. The target description must match the real device exactly. Hard parts are verifying behavior on a machine you cannot run the code on, and runtime assumptions such as page size and guard-region support that depend on the target.",
    k: ["Compiling per target centrally vs compiling on the device: central compilation saves device time and memory, but needs a build per hardware variant.", "Conservative generic target vs per-model feature sets: generic output is portable, but wastes available hardware features."],
    p: ["The target description omits a feature the device lacks, and artifacts crash with illegal instructions on that model.", "Page-size assumptions baked into an artifact differ on the device's operating system."],
    v: "Cross-compile one module for a second target, run it on a device of that target, and compare outputs with a locally compiled build across the test suite.",
    dep: ["ahead-of-time-compiler", "instruction-selection", "cpu-feature-detection"]
  },
  "streaming-compilation": {
    s: "Starts decoding and compiling a module as its bytes arrive over a network, so compilation overlaps with download and finishes shortly after the last byte.",
    d: "The decoder consumes chunks and, since function bodies come in the code section, can hand each body to compile threads as soon as it is complete. Validation proceeds in parallel. By the time the download ends, most functions are already compiled. This depends on the binary's layout: sections must be in order, and function sizes are declared up front. It is hard because error handling must work with partial input, memory must be bounded for a stream of unknown length, and results must be identical to a non-streaming load.",
    k: ["Compiling while downloading vs waiting for the whole binary: overlapping hides compile time, but needs a decoder that tolerates partial input.", "A worker pool sized to the CPU vs a single compile thread: more threads shorten load time, but compete with the running program."],
    p: ["A truncated stream leaves compile threads running on bodies that will never complete.", "Streaming and non-streaming loads produce different code because of an ordering assumption."],
    v: "Load a large module over a throttled connection with and without streaming, and confirm streaming completes much sooner after the last byte and the compiled results are identical.",
    dep: ["binary-decoder", "baseline-compiler", "validation-algorithm", "thread-and-stack-management"]
  },
});
