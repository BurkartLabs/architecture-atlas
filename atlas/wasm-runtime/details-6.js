// Details for the WebAssembly runtime plate, part 6: front end, platform foundation, cross-cutting concerns.
ATLAS.details("wasm-runtime", {
  "binary-decoder": {
    s: "Reads the binary encoding into in-memory structures, checking magic number, version, lengths and encodings, and rejecting anything malformed before validation begins.",
    d: "The decoder reads a magic number and version, then a sequence of sections, each with an identifier and a length. Integers use a variable-length encoding with a maximum byte count, and strings must be valid UTF-8. Every length is checked against the remaining input, and counts against limits, so a hostile file cannot trigger huge allocations. The decoder is the first code to see untrusted bytes and is a prime target for attackers. It is hard because it must be exact, fast on gigabyte inputs and streaming-capable.",
    k: ["Decoding into a full structure vs lazily decoding function bodies: full decoding is simple, but wastes time on code never run.", "Rejecting any deviation vs tolerating non-canonical encodings: strictness prevents ambiguity between tools, but excludes some sloppy producers."],
    p: ["A length field is trusted before checking it against remaining input, and a small file triggers a gigabyte allocation.", "An overlong integer encoding is accepted by one tool and rejected by another, creating a validation mismatch."],
    v: "Feed the decoder a corpus of truncated, oversized and mutated binaries and confirm each is rejected with an error, with no crash, hang or allocation beyond the configured limit.",
    dep: ["section-structure", "decoder-limits"]
  },
  "section-structure": {
    s: "The layout of a module as ordered sections for types, imports, functions, tables, memory, globals, exports, start, elements, code and data, each with its own format.",
    d: "Standard sections appear in a fixed order, at most once, and custom sections may appear between them. The function section lists type indices and the code section lists bodies, so the two must have the same count. A data-count section lets validation of bulk operations proceed before the data section. Index spaces combine imports and local definitions, in that order. It is hard because the split between function declarations and bodies exists to allow streaming and parallel compilation, but makes consistency checks span two sections.",
    k: ["Fixed section order vs arbitrary order: a fixed order allows one-pass decoding, but gives producers no freedom to place data conveniently.", "Separating function signatures from bodies vs interleaving: separation allows parallel compilation, but requires a cross-check that counts match."],
    p: ["The function and code section counts differ, and a decoder that does not check reads past the end of the code section.", "Index spaces are miscomputed by forgetting imports, shifting every function index."],
    v: "Decode a module and print each section with its byte range; reorder two sections or duplicate one and confirm a decode error naming the offending section.",
    dep: ["binary-decoder", "decoder-limits"]
  },
  "type-section-and-subtyping": {
    s: "The table of function and aggregate types a module declares, with rules for when one type may be used where another is expected, including canonical identity across modules.",
    d: "Function types list parameter and result value types. With reference types and garbage-collected aggregates, the section also defines structs, arrays and recursive groups of types, with declared supertypes. Validation checks that a subtype's fields are compatible. For linking, types are canonicalized so identical structures from different modules receive the same identity. It is hard because recursive type groups need equirecursive comparison, and canonicalization must be fast and thread-safe because every indirect call check relies on it.",
    k: ["Structural types canonicalized at load vs nominal declarations: structural types let separate modules interoperate, but require canonicalization work.", "Explicit declared supertypes vs inferred compatibility: declared supertypes are cheap to check, but force authors to state relationships."],
    p: ["Canonicalization of a recursive group treats two different groups as equal and allows an unsafe cast.", "A type registry grows without bound as modules come and go."],
    v: "Load two modules declaring the same function type independently, call between them through a table, and confirm the call succeeds; change one parameter type and confirm the call traps.",
    dep: ["section-structure", "validation-algorithm"]
  },
  "validation-algorithm": {
    s: "A single linear pass over each function that type checks every instruction against a model of the operand stack, proving the code is safe before it runs.",
    d: "The validator tracks a stack of value types and a stack of control frames. Each instruction pops expected types and pushes results; branches check their targets' types; unreachable code is handled with a polymorphic stack. It also checks that every index (local, function, memory, table, global) is in range and every memory access is aligned within limits. Because it runs in linear time with no backtracking, it is fast and simple. It is hard because it is the security core: an error here means unsafe code reaches the compilers, which assume validity.",
    k: ["Validating the whole module before running vs lazily per function: whole-module validation guarantees safety up front, but delays start for large modules.", "A separate validator vs validation merged into the compiler's pass: merging saves a pass, but a compiler bug can then hide a validator bug."],
    p: ["An instruction omitted from the type rules lets ill-typed code pass and be compiled assuming types it does not have.", "The validator and the compiler disagree on a subtlety, such as unreachable-code typing, and the compiler crashes."],
    v: "Run the official specification conformance suite's invalid-module tests and confirm every case is rejected and every valid case accepted, with identical results on every build configuration.",
    dep: ["control-flow-validation", "type-section-and-subtyping", "constant-expressions", "section-structure"]
  },
  "control-flow-validation": {
    s: "Checks structured control flow: blocks, loops, ifs and branches must have matching types, labels must refer to enclosing constructs, and the operand stack must have the right shape at every join.",
    d: "Each block pushes a control frame recording its parameter and result types and the stack height at entry. A branch pops the values its target expects. At the block's end the stack must hold exactly the result types. After an unconditional branch, a return or unreachable, the rest of the block is checked with an unconstrained stack. This structure means no jump into the middle of a block is possible, so control flow is analyzable. The hard part is the unreachable state, where an incorrect rule is easy to write and rarely exercised.",
    k: ["Structured control flow with no arbitrary jumps vs unstructured gotos: structure makes validation and compilation linear, but forces compilers to convert irreducible flow.", "A polymorphic stack after unconditional branches vs requiring dead code to be removed: polymorphism accepts producer output unchanged, but is the hardest rule to implement correctly."],
    p: ["The validator mishandles an if without an else that carries parameters, and accepts a block that leaves the stack wrong.", "Branch depth indices are off by one after a nested loop, and valid code is rejected."],
    v: "Validate a battery of nested and unreachable-code cases from the specification tests, including branches with values and loops with parameters, and confirm accept and reject results all match.",
    dep: ["validation-algorithm", "type-section-and-subtyping"]
  },
  "constant-expressions": {
    s: "The restricted expression form allowed in global initializers, segment offsets and table initial values, evaluated at instantiation without running general code.",
    d: "A constant expression is a short sequence of constants, reads of immutable globals, reference creation and, in newer versions, simple integer arithmetic. Validation checks the type and that only permitted instructions appear. The runtime evaluates it during instantiation. The restriction keeps instantiation predictable and free of side effects and allows segment layouts to be computed before any code runs. It is hard because extensions to allow arithmetic enlarge what instantiation can do, and each addition needs matching validator and evaluator support.",
    k: ["A tiny fixed expression set vs general code at initialization: a tiny set makes instantiation cheap and safe, but forces runtime relocation work into the start function.", "Allowing global reads of imported values vs only local ones: imports enable relocatable data, but make evaluation depend on the host's choices."],
    p: ["An initializer reads a global that is itself defined later, and the evaluator uses an uninitialized value.", "An extension allows arithmetic that overflows and the validator and evaluator disagree on wraparound."],
    v: "Instantiate a module whose data segment offset is an imported global plus a constant, supply the import, and confirm the data appears at the computed address.",
    dep: ["validation-algorithm", "globals"]
  },
  "decoder-limits": {
    s: "Hard caps on sizes and counts in a module, such as functions, locals, types, nesting depth, body size and total module size, that bound the work any input can demand.",
    d: "The specification sets some limits and runtimes add their own for memory and time: maximum function count, locals per function, parameters, block nesting depth, string lengths and total size. The decoder enforces them as it reads. Without limits, a small file can claim billions of locals or deeply nested blocks and exhaust memory or stack in the validator or compiler. It is hard to choose values: too low rejects real programs from large toolchains, too high leaves room for abuse.",
    k: ["Fixed limits from the specification vs host-configurable limits: fixed limits are predictable across hosts, but cannot match each deployment's budget.", "Limiting nesting depth vs making the validator iterative: a depth limit is simple, but an iterative validator removes the limit as an attack and a portability problem."],
    p: ["A module declares many locals in one compact entry and forces the compiler to allocate gigabytes of frame space.", "A limit differs between hosts, and a module accepted on one is rejected on another."],
    v: "Generate modules at, one past and far beyond each limit, and confirm acceptance at the limit and a clean rejection past it, with bounded memory and time in every case.",
    dep: ["binary-decoder", "resource-accounting"]
  },
  "validation-error-reporting": {
    s: "Produces precise, actionable errors when a module is rejected: what failed, in which function, at which byte offset, and which feature or limit was involved.",
    d: "On failure the validator records a kind, a byte offset into the binary, the function index and a message such as expected an integer, found a float. With a name section the message uses the function's name. Errors are structured so tools can display them and tests can match. Good messages matter because modules are machine generated and the person debugging has no source for the binary. It is hard because messages are tied to internal states, and because error text becomes de facto interface.",
    k: ["Stopping at the first error vs collecting several: stopping is simple and fast, but forces repeated fix and retry cycles.", "Structured kinds with offsets vs plain text: structured errors are machine readable, but need a stable list to maintain."],
    p: ["A message omits the byte offset, and a developer cannot find the faulty instruction in a large generated module.", "Tools parse message text, and rewording a message breaks them."],
    v: "Validate modules with a type mismatch deep inside a function and confirm the error gives the function, byte offset, expected and actual types, and that the offset points to the instruction in a disassembly.",
    dep: ["validation-algorithm", "name-section-and-debug-info", "trap-and-error-reporting"]
  },
  "platform-abstraction-layer": {
    s: "A thin interface that isolates the runtime from operating-system differences in memory mapping, threads, signals, time and file access, so the rest of the code is portable.",
    d: "The layer defines operations the runtime needs: reserve and protect address space, create threads, install fault handlers, read clocks, open files. Each supported host implements them. Everything above uses only this interface, so porting means writing one layer. Embedded targets may supply a minimal version without virtual memory or threads, and the runtime then falls back to explicit bounds checks and an interpreter. It is hard because hosts differ in subtle semantics, such as how faults are delivered, and the abstraction must not hide differences that matter for safety.",
    k: ["A narrow interface with few primitives vs a broad one covering convenience calls: a narrow interface is cheap to port, but pushes logic into each host's implementation of the primitives.", "Compile-time selection of implementations vs runtime dispatch: compile-time selection has no cost, but cannot switch behavior without rebuilding."],
    p: ["A port implements memory protection with different semantics, and guard regions silently stop faulting.", "The layer leaks a host-specific error code that upper layers misinterpret."],
    v: "Run the runtime's conformance suite on every supported host through this layer and confirm identical pass results, with a port to a constrained target passing the same tests using the checked-memory fallback.",
    dep: ["virtual-memory-reservation", "executable-memory-management", "hardware-trap-handlers", "thread-and-stack-management"]
  },
  "virtual-memory-reservation": {
    s: "Reserves large ranges of address space without committing physical memory, then commits, protects or releases pages inside them, the basis for guard regions and cheap memory growth.",
    d: "The runtime asks the operating system for address space with no access, then changes permissions on the valid part. Growth just changes permissions further, never moving data. Releasing memory returns pages with a discard call. Address space is limited and not free: the kernel tracks each mapping, and mapping calls take a process-wide lock. Hosts impose limits on total mappings and on overcommit. It is hard because reservations of many gigabytes per instance must be tuned against the limits, and failures present only at scale.",
    k: ["Reserving the maximum address range up front vs mapping on demand: up front allows growth in place and guard regions, but costs address space and kernel bookkeeping.", "Releasing pages with a discard call vs unmapping: discard is fast and keeps the range reserved, but leaves the mapping in place."],
    p: ["The process reaches the operating system's mapping count limit well before it runs out of memory, and instantiation fails.", "Overcommit settings let a reservation succeed and the process is killed later when pages are touched."],
    v: "Instantiate instances until failure with a given reservation size, and confirm the failure is a clean quota or instantiation error rather than a crash, and that the number reached matches the address space budget.",
    dep: ["host-allocator", "platform-abstraction-layer"]
  },
  "executable-memory-management": {
    s: "Allocates pages for generated code, writes to them while not executable, then makes them executable and read-only, so memory is never writable and executable at once.",
    d: "Compiled code is placed in an arena of pages. A write phase maps them writable; after copying code and applying relocations, the runtime switches them to read and execute and flushes the instruction cache where required. Patching later, for lazy compilation and tier-up, repeats the toggle or uses a separate writable alias of the same pages. The policy of never writable-and-executable limits exploitation of any bug. It is hard because toggling permissions is slow and requires synchronizing with threads that may be running the code.",
    k: ["Toggling permissions around each patch vs a second writable mapping of the same pages: toggling is simple, but a dual mapping avoids a window where code is not executable.", "One large code arena vs per-module mappings: an arena lets code call within branch range, but complicates freeing individual modules."],
    p: ["Pages are made executable before the instruction cache is flushed, and a thread runs stale bytes.", "Code is patched while another thread executes it, and the thread sees a half-written instruction."],
    v: "Generate code, confirm the process's mappings never show a page both writable and executable, run it, then patch a function under load and confirm threads see old or new code, never a mixture.",
    dep: ["virtual-memory-reservation", "platform-abstraction-layer"]
  },
  "hardware-trap-handlers": {
    s: "Catches hardware faults raised by guest code, such as invalid memory access or divide by zero, maps the faulting address to a trap, and resumes at a safe point in the host.",
    d: "The runtime installs a handler for the host's fault mechanism. When a fault occurs, the handler checks whether the faulting instruction lies inside generated code, looks it up in the trap table to find the trap kind and a recovery address, and redirects execution to unwind to the entry point with an error. Faults from anywhere else are passed on as genuine host crashes. This replaces many explicit checks with a table. It is hard because handlers run in restricted contexts, must not be fooled by faults in host code, and interact with the embedder's own handlers.",
    k: ["Hardware faults mapped to traps vs explicit checks in code: faults make the successful path free, but need table accuracy and handler support in every embedding.", "Handler owned by the runtime vs cooperating with the embedder's: owning it is simple, but conflicts with embedders that install their own."],
    p: ["A fault in the host's own code inside a call is misreported as a guest trap and hides a real bug.", "The embedder installs its handler after the runtime's, and guest faults crash the process."],
    v: "Trigger an out-of-bounds guest access and a fault in host code; confirm the first becomes a trap with the correct kind and the second terminates with a host crash report.",
    dep: ["platform-abstraction-layer", "thread-and-stack-management", "code-emission"]
  },
  "thread-and-stack-management": {
    s: "Runs guest code on host threads with bounded native stacks, tracks per-thread state, and arranges for compile threads, timers and safepoints to work with them.",
    d: "Each running thread has a native stack that guest code uses, with a guard and a recorded limit. Per-thread state holds the store pointer, the current instance and the trap recovery point. Background compilation uses a worker pool; epoch timers use a separate thread. Safepoints let the runtime stop threads to patch code or collect garbage. It is hard because stack size has to cover worst-case guest depth plus host calls, and because thread-local state must be reachable from signal handlers.",
    k: ["Running guest code on the caller's thread vs a dedicated runtime thread pool: caller's thread is cheap and simple, but its stack size is not under the runtime's control.", "Cooperative safepoints vs signal-based interruption: safepoints are safe to reason about, but depend on the code reaching one."],
    p: ["The caller's thread has a small stack, and a deep guest call overflows before the limit check triggers.", "A thread-local lookup in a signal handler allocates and deadlocks."],
    v: "Run guest recursion on threads with small and large stacks, and confirm a clean stack-overflow trap in both with the thread still usable afterward.",
    dep: ["platform-abstraction-layer", "host-allocator"]
  },
  "cpu-feature-detection": {
    s: "Finds which optional instructions the host CPU supports, so the compiler can use vector, bit-manipulation and atomic instructions where present and fall back where not.",
    d: "At startup the runtime queries the CPU through its identification instructions or operating system calls and builds a feature mask. The compiler consults it when choosing instructions for population count, rounding, vectors and atomics. The mask is part of any cache key. Some deployments pin a baseline mask so that artifacts run on all machines. It is hard because virtualized environments may report features that are masked or migrate between hosts with different CPUs, and because untested feature combinations hide bugs.",
    k: ["Detecting at runtime vs fixing at build time: runtime detection uses every feature present, but makes behavior vary between machines.", "A fixed baseline for cached artifacts vs the exact machine's features: a baseline portable artifact runs anywhere, but gives up the newest instructions."],
    p: ["A virtual machine migrates to an older CPU and code using a newer instruction faults.", "A feature combination that no test machine has is never exercised and miscompiles."],
    v: "Force the feature mask to a minimal set and confirm the compiler emits fallback sequences and results stay identical; compare against the full mask and confirm vector instructions appear.",
    dep: ["platform-abstraction-layer"]
  },
  "host-allocator": {
    s: "The memory source for the runtime's own data: metadata, compiled-code bookkeeping, IR during compilation and instance state, separate from the guest's linear memory.",
    d: "The runtime allocates a great deal around the guest: module structures, type registries, compiler arenas, trap tables, handle tables. Compilers use arenas that free everything at once; long-lived data uses a general allocator. Embedders may supply their own allocator to count or limit use. Every allocation made on behalf of a guest should be chargeable to its store. It is hard because failures must be handled gracefully, not abort, and because allocation in signal handlers and on compile threads has different constraints.",
    k: ["Arena allocation for compilation vs general allocation: arenas are fast and free in bulk, but hold peak memory until compilation ends.", "A pluggable allocator for embedders vs the system default: pluggable allocators allow accounting and limits, but cost an indirection and must be thread-safe."],
    p: ["An allocation failure in the middle of instantiation aborts the whole process instead of failing that instance.", "Compile arenas of many concurrent compilations multiply peak memory beyond the quota."],
    v: "Install a counting allocator, instantiate and destroy a module repeatedly, and confirm allocations return to the baseline each cycle and a forced allocation failure results in an error, not an abort.",
    dep: ["platform-abstraction-layer"]
  },
  "trust-boundary": {
    s: "The line between what the runtime trusts (its own code, the host and its imports) and what it does not (the module's bytes and behavior), and which components enforce it.",
    d: "Untrusted input crosses the line at several points: the binary into the decoder, calls into the guest, and values returning from imports. Validation, bounds checks, traps, quotas and capabilities are all enforcement at this line. Compiled artifacts, debug sections and host imports are trusted by default and so must not be controlled by the module's author. The line can also move: running modules in separate processes pushes it outward. Designs fail when a component quietly trusts input from the wrong side, such as a custom section or a cached artifact.",
    k: ["Isolation by software checks in one process vs by separate processes: software is cheap and fast to start, but a runtime bug becomes a full escape.", "Treating the compiler as trusted vs verifying its output: trusting is fast, but a miscompile silently breaks the sandbox."],
    p: ["A compilation cache directory is writable by the sandboxed workload, turning cache poisoning into code execution.", "A host import trusts a pointer and length from the guest without a bounds check."],
    v: "Run a corpus of hostile modules and a fuzzer against the decoder, validator and every tier, and confirm no host memory outside the module's own regions is ever read or written.",
    dep: ["validation-algorithm", "bounds-checking", "capability-based-access", "serialized-artifacts"]
  },
  "startup-versus-peak-speed": {
    s: "The standing trade between how soon a module begins running and how fast it eventually runs, which determines the tiers, caches and compile policies a runtime needs.",
    d: "Interpreting starts immediately and runs slowly. Baseline compilation costs little and runs a few times faster. Optimizing compilation costs the most and runs fastest. Ahead-of-time artifacts remove the cost but lose flexibility. Short-lived workloads, such as a request handler, care about startup; long-running ones care about peak. Settings for lazy compilation, thresholds and caching express the choice. Mistakes show up as a runtime tuned for benchmarks that is slow on real short jobs, or the reverse.",
    k: ["Multiple tiers with promotion vs a single compiler: multiple tiers give both fast start and fast peak, but triple the engine's code and test surface.", "Warm caches and pooled instances vs cold start per request: warm state removes startup, but ties up memory and complicates isolation."],
    p: ["A runtime tuned only on long benchmarks shows terrible latency on short requests.", "Eager optimization burns compile CPU on code that runs once."],
    v: "Measure time to first result and steady-state throughput on a short job and a long job under each configuration; the chosen tiering must give the lowest first-result time and near-best throughput.",
    dep: ["tier-up-policy", "compilation-cache", "instance-pooling", "lazy-compilation"]
  },
  "memory-safety-model": {
    s: "The guarantees about memory that every layer relies on: guest accesses stay in its own memory, references cannot be forged, and control flow stays within validated code.",
    d: "Three mechanisms provide it: bounds-checked linear memory, opaque typed references and tables, and structured control flow with checked indirect calls. These make it impossible for a validated module to read or write host memory or jump to arbitrary code. Inside the module's own memory it provides no protection between its objects, so guest bugs remain. The guarantee depends on every tier implementing the checks, and any miscompile or missing check invalidates it. Compilers, handlers and the embedding API all need to preserve it.",
    k: ["Guarding the host but not the module's internals vs fine-grained protection in the module: host protection is cheap and complete, but does not stop attackers corrupting a module's own data.", "One shared model across all tiers vs per-tier assumptions: one model is easy to test, but constrains the fastest tier."],
    p: ["A compiler optimization removes a check under an assumption that fails for rarely used memory sizes.", "A host import reads memory without checking and gives the guest a read of host data."],
    v: "Fuzz modules with random memory accesses at and beyond every boundary on every tier, with host memory canaries around the runtime's structures, and confirm no canary is touched.",
    dep: ["bounds-checking", "guard-pages", "indirect-calls", "validation-algorithm"]
  },
  "host-portability": {
    s: "How far one module and one runtime can run unchanged across operating systems, CPUs and embeddings, and what each layer does when a host lacks a capability.",
    d: "Modules are portable because they depend only on the instruction set, imports and a defined memory model. The runtime isolates host differences in its platform layer, compiler backends and the system interface. Where a host lacks virtual memory, threads or executable pages, it falls back to explicit checks, an interpreter or no threads. Portability stops at the host interface: the same module needs equivalent imports. The cost of being portable is conservative defaults, lowest-common-denominator interfaces and testing every combination.",
    k: ["Strict portability with one behavior everywhere vs host-specific optimizations: strict behavior makes results reproducible, but leaves host features unused.", "Graceful fallback when a capability is missing vs failing: fallback keeps modules running, but can hide large performance differences."],
    p: ["A module runs everywhere in tests but depends on a host import only one deployment provides.", "A fallback path is untested because no development machine lacks the feature."],
    v: "Run the same module and test suite on every supported host and configuration and compare outputs byte for byte, with a record of which fallbacks each host used.",
    dep: ["platform-abstraction-layer", "system-interface-worlds", "cpu-feature-detection"]
  },
  "feature-gating": {
    s: "How a runtime decides which parts of the evolving specification to accept, and how that choice appears in validation, every execution tier, caches and the embedding API.",
    d: "The specification grows through proposals at different maturity levels. A runtime chooses which to enable by default, which behind flags, and which to refuse. Each choice touches the decoder, validator, interpreter, compilers, debugging and cache keys. Modules record the features they use, and the embedder compares them to its policy. Enabling too early invites compatibility breaks; enabling too late strands users. The discipline is testing every combination of tier and flag so that an accepted module always runs.",
    k: ["Early support behind flags vs waiting for standardization: early support gets feedback and users sooner, but risks changing semantics under them.", "Per-feature flags vs release-level bundles: flags are precise, but make the test matrix grow combinatorially."],
    p: ["A feature passes validation but only one tier implements it, so behavior depends on tier-up timing.", "Cache keys ignore the flag set and serve artifacts compiled with different features."],
    v: "For every flag combination in the supported matrix, validate and run a feature test module on every tier and confirm accept-or-reject agrees everywhere and accepted modules run correctly.",
    dep: ["feature-flags", "validation-algorithm", "artifact-compatibility-checks"]
  },
  "resource-accounting": {
    s: "How every kind of consumption, memory, compiled code, tables, handles, instances, CPU time and host work, is attributed to the tenant that caused it and capped.",
    d: "Limits exist at several levels: per memory, per store, per process and per host. Linear memory is the obvious cost, but compiled code, metadata, type registries, handle tables, stacks and pending host operations also grow because of guest actions. Time is limited by fuel, epochs or timeouts. The runtime must charge each cost to a tenant and refuse more past the cap. It is hard because many costs are shared, such as compiled code in a cache, and attribution must still be fair.",
    k: ["Strict per-tenant accounting of every cost vs accounting only for guest memory and time: full accounting prevents surprise exhaustion, but is invasive and costs overhead.", "Hard caps that fail operations vs soft limits that warn: hard caps protect the host, but make application failures sudden."],
    p: ["A tenant triggers compilation of many unique modules and exhausts code memory not covered by its quota.", "Shared cache entries are charged to nobody, so a flood of unique modules evicts everyone else's."],
    v: "Run an adversarial tenant that allocates every resource type as fast as possible, and confirm each is stopped at its configured cap while a second tenant's latency and capacity stay unchanged.",
    dep: ["memory-and-table-quotas", "fuel-metering", "host-allocator", "instance-pooling"]
  },
});
