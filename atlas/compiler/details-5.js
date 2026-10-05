// Compiler plate details, part 5: testing, infrastructure, cross-cutting concerns.
ATLAS.details("compiler", {
  "regression-suites": {
    s: "Thousands of small test programs with expected outputs, diagnostics or generated code patterns, run on every change to catch behavior the change was never meant to alter.",
    d: "Tests come in kinds: parse and diagnostic tests that check exact error messages and locations, IR tests that run one pass on textual IR and match the resulting IR, code generation tests that match assembly patterns, and execution tests that compile, run and check output. Every fixed bug adds a minimal reproducer. Textual IR as a test input lets each pass be tested in isolation. A pattern-matching checker tool keeps expectations short and robust to irrelevant changes. Hard parts are brittleness of output matching, suite run time and flaky tests.",
    k: ["Test single passes on textual IR vs test end to end: isolated tests are small, fast and precise; end-to-end tests check the real pipeline and fail for distant reasons.",
        "Exact output matching vs pattern matching: exact is strict and breaks on harmless changes; patterns survive churn and can miss real regressions."],
    p: ["Tests that match entire assembly output break on every scheduling tweak, so developers regenerate expectations without reading the diff."],
    v: "Every closed bug has a test that fails on the old compiler and passes on the new one; the full suite runs on each change in a bounded time, and a deliberately introduced regression is caught.",
    dep: ["ir-verifier", "diagnostic-engine", "mid-level-ir"]
  },
  "conformance-suite": {
    s: "A language-standard-derived suite that checks the compiler accepts what the specification requires, rejects what it forbids, and gives specified behavior for everything in between.",
    d: "Each test corresponds to a clause of the language specification: a program that must compile and produce certain output, or must be rejected with a diagnostic. Suites are often independent of any one compiler, so passing is evidence of portability. They cover corner cases such as evaluation order, integer promotion, name lookup and template or generic rules that ad-hoc tests miss. Results are tracked per clause, and known failures are listed. Hard parts are specification ambiguity, tests exercising unspecified behavior and keeping up with new standard revisions.",
    k: ["Independent third-party suite vs in-house tests only: independent suites catch what the author's mental model misses; in-house tests are tailored and share the author's blind spots.",
        "Gate releases on full conformance vs track a pass rate: gating forces closure on every gap; a rate tolerates known deviations and allows shipping."],
    p: ["Tests written from a compiler's behavior rather than the specification enshrine bugs as expected results."],
    v: "Run the suite for each language mode; each failure maps to a tracked issue or an explicitly documented deviation, and the pass count never drops between releases without an entry.",
    dep: ["type-checker", "parser", "regression-suites"]
  },
  "fuzzing": {
    s: "Feeds the compiler large volumes of random or mutated programs to find crashes, hangs and assertion failures that hand-written tests never reach.",
    d: "Two styles: mutation fuzzers alter existing inputs byte by byte or token by token, guided by coverage feedback to reach new code; grammar-based generators produce syntactically valid programs, often type-correct ones, to get past the front end into optimization and code generation. A crash, hang, sanitizer report or verifier failure is a finding, automatically reduced to a small reproducer. Some fuzzers also target IR directly, running single passes. Hard parts are generating programs that are valid and interesting, deduplicating findings and avoiding programs with undefined behavior in execution-based checks.",
    k: ["Coverage-guided byte mutation vs grammar-based generation: mutation is easy and mostly dies in the parser; generation reaches deep passes and needs a generator that tracks the language.",
        "Fuzz source programs vs fuzz IR for one pass: source tests the whole pipeline; IR fuzzing hits a pass directly with shapes front ends never produce."],
    p: ["Generated programs that contain undefined behavior make differing outputs meaningless, flooding triage with false compiler bugs."],
    v: "Run a fuzzer for a fixed budget on each release candidate; every finding becomes a reduced regression test, no crashes or verifier failures remain open, and coverage of the optimizer rises over time.",
    dep: ["ir-verifier", "test-case-reduction", "sanitizers"]
  },
  "differential-testing": {
    s: "Compiles and runs the same program in different ways, with other compilers, optimization levels or an interpreter, and treats any disagreement in output as a bug.",
    d: "Because the correct answer to a random program is usually unknown, the oracle is agreement: compile at several optimization levels and compare results, or against an independent implementation or a reference interpreter of the IR. Test programs must be free of undefined behavior and nondeterminism. Generators can build programs that check themselves by design. Differences are minimized and bisected to a pass. Hard parts are creating deterministic, defined programs, handling legitimate differences such as floating-point optimizations, and triaging which side is wrong.",
    k: ["Compare optimization levels of one compiler vs compare different compilers: same-compiler comparison is simple and finds optimizer bugs; cross-compiler comparison also finds front-end disagreements and needs defined-behavior programs.",
        "Reference interpreter as oracle vs another compiled build: an interpreter is independent of code generation; compiled comparisons are faster and share more code."],
    p: ["Floating-point reassociation or uninitialized reads produce legitimate output differences, burying real miscompiles in noise."],
    v: "Run a corpus of defined-behavior generated programs at every optimization level and with a second implementation; all outputs match, and a seeded miscompile in one pass is detected within a bounded number of programs.",
    dep: ["regression-suites", "fuzzing", "mid-level-ir"]
  },
  "test-case-reduction": {
    s: "Automatically shrinks a failing program to a minimal input that still triggers the same bug, turning a thousand-line failure into a dozen lines a developer can read.",
    d: "A reducer repeatedly deletes or simplifies parts of the failing input, such as whole functions, statements, expressions or IR instructions, and keeps a change only if an interestingness test (same crash signature, same miscompile) still passes. Delta-debugging algorithms do this efficiently; syntax-aware reducers keep candidates valid so fewer attempts are wasted. For miscompiles, the test also checks the reduced program remains free of undefined behavior. Hard parts are preserving the original failure rather than drifting to another, the number of compiler invocations and keeping candidates valid.",
    k: ["Language-agnostic text reduction vs syntax-aware reduction: text reduction works for any input and wastes many invalid attempts; syntax-aware is faster and tied to the language.",
        "Strict interestingness (exact crash signature) vs loose: strict stays on the same bug; loose reduces further and may land on a different one."],
    p: ["Reducing a miscompile without checking for undefined behavior ends at a tiny program that is simply invalid, not a compiler bug."],
    v: "Reduce a set of known failures from fuzzers and bug reports: each reproducer shrinks by a large factor, still triggers the identical failure signature, and passes a validity check on the language rules.",
    dep: ["fuzzing", "regression-suites"]
  },
  "bootstrapping": {
    s: "Using the compiler to build itself in stages and confirming that later stages are identical, which tests it on a large real program and removes dependence on any external compiler.",
    d: "A first-stage compiler is built by some existing compiler. That stage-one binary then compiles the compiler source to produce stage two, which compiles it again to produce stage three. If stage two and stage three binaries are byte-identical, the compiler produces consistent code and was not skewed by the original compiler. The compiler source itself is a big, diverse test of the optimizer. Languages implemented in themselves need a bootstrap path from an earlier version or a minimal seed. Hard parts are build time, non-determinism that breaks comparisons and trusting the first stage.",
    k: ["Three-stage comparison vs two-stage build: three stages catch nondeterminism and miscompiles that differ between stage one and two compilers; two stages are quicker and weaker.",
        "Bootstrap from a prior release vs from a minimal seed: a prior release is simple and drifts away from a self-contained chain; a seed makes the chain auditable at greater effort."],
    p: ["A miscompile that compiles the compiler into a subtly different but self-consistent binary passes the byte-identity comparison and goes unnoticed."],
    v: "Build the compiler three times with itself; stage two and stage three binaries are byte-identical, and the full regression suite passes with the stage-two compiler.",
    dep: ["determinism-of-output", "regression-suites"]
  },
  "compile-time-benchmarks": {
    s: "Tracks compile time and memory per stage on representative inputs across commits, so a slow pass or a memory regression is noticed when it lands, not months later.",
    d: "A benchmark set of real programs is compiled on every change or nightly, with per-pass timers and counters (instructions retired, peak memory, number of IR instructions) recorded. Results are compared to a baseline with noise thresholds, and regressions are attributed to a commit. Run-time performance of generated code is tracked separately, since a pass can trade the two. Instruction counts are more stable than wall time. Hard parts are noise on shared machines, representative inputs and the temptation to accept small slowdowns that add up.",
    k: ["Measure instruction counts vs wall-clock time: counts are stable and precise on shared machines; wall time reflects real experience and varies with load.",
        "Gate changes on regressions vs report afterward: gating protects speed and slows development; after-the-fact reports are lenient and let regressions accumulate."],
    p: ["Many one-percent slowdowns, each below the noise threshold and accepted individually, compound into a compiler that is twice as slow in two years."],
    v: "A dashboard shows per-stage time and peak memory for each commit on a fixed corpus; introducing a deliberately slow pass is flagged against the previous commit within the noise threshold.",
    dep: ["pass-manager", "arena-allocation", "compile-time-performance"]
  },
  "arena-allocation": {
    s: "Allocates many small objects from large blocks and frees them all at once, giving fast allocation with no per-object overhead or free calls.",
    d: "Compilers create millions of tree nodes, types and instructions whose lifetimes end together, such as when a translation unit or function finishes. An arena bumps a pointer within a block, allocates a new block when full and releases everything with one call. Objects need no individual destruction, so they must not own external resources. Separate arenas per phase or per thread avoid contention. Hard parts are objects that outlive their arena, memory not being returned until the arena dies, and containers that grow inside the arena leaving dead space.",
    k: ["Bump allocation per phase vs general-purpose allocator: bump is fast and compact and cannot free individual objects; general allocation supports arbitrary lifetimes and costs more per object.",
        "One arena per thread vs shared with locking: per-thread arenas avoid synchronization and complicate sharing results across threads."],
    p: ["A pointer into an arena that outlives its release, such as one cached in a global table, becomes a dangling reference."],
    v: "Measure allocation throughput against the system allocator on a compile of a large file; run tests under a memory checker to confirm no pointers into released arenas are used, and peak memory drops as arenas are freed per phase.",
    dep: []
  },
  "string-interning": {
    s: "Stores each distinct identifier or string once and represents it by a pointer or small integer, so name comparison and hashing are constant time.",
    d: "The lexer looks each identifier up in a global table; if present it gets the existing handle, otherwise a new entry is created. Afterward, equality is a pointer comparison and the handle can index maps directly. Symbol tables, name resolution and mangling all rely on it. With parallel compilation the table needs concurrent access, typically sharded. Handles stay valid for the compile's lifetime. Hard parts are contention across threads, memory held by names never used again, and incremental or server modes where names accumulate over many edits.",
    k: ["Global table vs per-file tables: global gives uniform handles across the compile and needs concurrency; per-file tables avoid contention and require comparing by content across files.",
        "Never free names vs generational cleanup: never freeing is simple and leaks in long-lived servers; cleanup adds complexity and bounds memory."],
    p: ["A lock-protected global intern table becomes the bottleneck of a multi-threaded front end and caps scaling."],
    v: "Intern the same name from many threads and confirm one handle results. A compile of a large codebase spends under a small fraction of time in the table, and a long editing session shows bounded memory growth.",
    dep: ["arena-allocation"]
  },
  "uniquing": {
    s: "Ensures structurally identical types, constants and attributes exist only once, so equality is a pointer compare and results can be cached by pointer.",
    d: "A context object holds hash tables keyed by structure (kind and operands). Creating a pointer-to-int type first looks it up; the same object is returned every time. Because equal things are the same object, maps keyed by type or constant need no deep comparison, and sets of types are cheap. The context owns the objects for its lifetime and is the unit of thread safety, so multi-threaded compilers often use one context per thread or make it concurrent. Hard parts are garbage accumulation, concurrency and deterministic iteration order when the table is walked.",
    k: ["One shared context with locking vs one context per thread: shared allows free exchange of objects and contends; per-thread is fast and requires translation across contexts.",
        "Uniquing everything vs only types and constants: uniquing more simplifies equality and costs lookups for every creation."],
    p: ["Iterating a uniquing table in hash order to print or emit data makes output vary between runs, because pointer addresses differ."],
    v: "Create the same type via three construction routes and check pointer equality; under multi-threaded creation, exactly one object per structure exists. Output produced from the table is identical across runs.",
    dep: ["arena-allocation"]
  },
  "parallel-task-runtime": {
    s: "A scheduler that runs independent compiler work (per function, per module, per file) on multiple threads while keeping results deterministic.",
    d: "A thread pool takes tasks such as optimizing one function, generating code for one function, or parsing one file, with dependencies expressed as futures or task graphs. Work is stolen between threads to balance load. Shared structures (symbol tables, intern tables, diagnostics) must be concurrent or partitioned, and results are merged in a fixed order so output does not depend on timing. Parallel parsing, code generation and link-time optimization are the common wins; whole-function passes parallelize naturally, while interprocedural passes are harder. Hard parts are synchronization cost, deterministic merging and memory growth from concurrency.",
    k: ["Fine-grained task stealing vs coarse static partition: stealing balances uneven work and has overhead; static partitions are simple and leave threads idle when files differ in size.",
        "Parallelize inside one compile vs across many compiles: intra-compile parallelism speeds single files and complicates shared state; many separate processes are simple and use more memory."],
    p: ["Collecting diagnostics or output in completion order rather than a fixed order makes results vary from run to run."],
    v: "Compile a large input with one thread and with many; outputs are byte-identical and wall time drops near-linearly until a serial phase dominates. A thread sanitizer run reports no races.",
    dep: ["determinism-of-output", "uniquing", "string-interning"]
  },
  "virtual-file-system": {
    s: "An abstraction over file access that lets the compiler read from disk, memory overlays, archives or a remote store, and be tested without real files.",
    d: "All file operations (open, stat, list directory, read) go through an interface with implementations: the real file system, an in-memory tree for tests and editor buffers, an overlay that layers one on another, and a recorded or hermetic view for caching and distributed builds. It also normalizes paths and applies sysroot remapping. The compiler can then compile an unsaved editor buffer as if it were on disk, or run in a sandbox seeing only declared inputs. Hard parts are semantics matching a real file system (case, links, relative paths) and caching stat calls without staleness.",
    k: ["Cache directory listings and stat results vs query each time: caching speeds include searches considerably and returns stale answers if files change during a build.",
        "In-memory overlay for editors vs write to disk first: overlays give instant feedback on unsaved text and require every reader to use the abstraction."],
    p: ["Code that calls the real file system directly bypasses the overlay, so editor buffers and hermetic builds silently read stale or undeclared files."],
    v: "Run the compiler against an in-memory tree with an overlaid modified file; output reflects the overlay, and no real file system access occurs, as shown by tracing system calls.",
    dep: []
  },
  "arbitrary-precision": {
    s: "Exact integer and floating-point arithmetic of any width, used to fold constants and evaluate literals identically to the target machine regardless of the host's own types.",
    d: "Constants in source or IR can be wider than any host register, and floating-point folds must produce the same bits the target would. Arbitrary-precision integer types carry an explicit width and implement wrapping and checked operations, shifts, division and conversions with exact semantics; software floating point implements the target's formats (including half and extended precision) with chosen rounding. Constant folding, range analysis, compile-time evaluation and literal parsing all use them. Hard parts are performance on hot paths (small widths get fast paths), correct rounding in every mode and exotic formats.",
    k: ["Software floating point vs host floating point: software gives identical results for every target format on any host and is slower; host float is fast and wrong for other formats and rounding behaviors.",
        "Width-tagged integers vs host integers: tagging gives correct wrapping for any width and costs a bit more; host integers are fast and break at widths beyond hardware."],
    p: ["Folding with host floating point on a host with different extended-precision or rounding behavior bakes in constants that differ from the target's runtime results."],
    v: "Compare every operation against a reference over exhaustive small widths and edge-case operands for larger ones, including all rounding modes, and cross-check folded constants against results computed on real target hardware.",
    dep: []
  },
  "determinism-of-output": {
    s: "The property that the same input and options always produce byte-identical output, regardless of machine, time, thread scheduling or checkout path.",
    d: "Determinism makes caching, distributed builds, bootstrapping comparison and security auditing possible. Sources of nondeterminism include hash-table or pointer-order iteration, thread completion order, embedded timestamps and absolute paths, random seeds, uninitialized padding in objects and environment leakage. The cure is discipline: ordered containers where output is derived, stable sorting by content, fixed merge order from parallel stages, path remapping and scrubbing metadata. It must be tested continuously because a single violation anywhere is enough to break it.",
    k: ["Sort everything that is emitted vs rely on insertion order: sorting is deterministic and costs time and loses natural order; insertion order is free and only deterministic if inputs and scheduling are.",
        "Scrub embedded paths and times vs record them: scrubbing makes builds reproducible and removes useful provenance; recording is informative and defeats caches."],
    p: ["A map keyed by pointer address iterated during emission passes all tests and varies between runs, discovered only when a cache hit rate collapses."],
    v: "Build the same commit twice from different directories, thread counts and times; all output files compare byte-identical, and a CI job fails the moment any difference appears.",
    dep: ["uniquing", "parallel-task-runtime", "object-file-writer"]
  },
  "compile-time-performance": {
    s: "How fast the compiler runs and how much memory it uses, which directly sets developer iteration speed and build cost, and trades against code quality.",
    d: "Compile time is spent mostly in a handful of places: parsing and preprocessing repeated headers, type checking with heavy generics or overloads, optimization passes (especially superlinear ones), register allocation on huge functions and the linker. Fast paths include caching, lazy work, arenas, interning, parallelism, cheap optimization levels and incremental builds. Quadratic algorithms hide until a generated file with a ten-thousand-line function arrives. The cost of each optimization must be justified against its gain. Hard parts are finding which stage dominates on real code and holding the line against slow creep.",
    k: ["Multiple optimization tiers vs one setting: tiers let debug builds be fast and release builds thorough; one setting is simpler and serves neither well.",
        "Complexity caps with fallbacks vs unlimited algorithms: caps keep pathological inputs bounded and lose optimization on large functions; unlimited gives the best code until a huge input hangs the build."],
    p: ["A pass with a quadratic or worse algorithm passes all normal tests and takes hours on one machine-generated function in a customer's build."],
    v: "Per-pass timers and peak memory on a fixed corpus are recorded each commit; a stress test with a huge generated function, deep nesting and heavy generic instantiation finishes within a set bound.",
    dep: ["pass-manager", "arena-allocation", "parallel-task-runtime", "incremental-compilation"]
  },
  "diagnostics-quality": {
    s: "How clearly the compiler explains what went wrong and how to fix it: a property of every stage, not of the message printer alone.",
    d: "Good diagnostics need information the stages must preserve: exact spans, the original spelling of types and names, which constraint led to a type error, the expansion chain of macros and generic instantiations. They also need restraint: one error per root cause, notes pointing to related declarations, suggestions only when likely right. Quality is measured by user effort to fix the problem. Each stage must keep enough context to explain failures, which fights with optimizing representations for speed. Hard parts are cascades, errors in generated code and messages in terms of the user's program rather than the compiler's internals.",
    k: ["Spend compile time and memory to retain explanatory context vs keep representations lean: retaining context gives precise errors at the cost of speed and memory; lean forms are fast and mysterious on failure.",
        "Suggest fixes aggressively vs only when certain: aggressive suggestions help beginners and risk wrong guidance; certainty builds trust."],
    p: ["An error message phrased in terms of internal desugared forms, like iterator machinery for a loop, is accurate and incomprehensible to the author."],
    v: "A corpus of common mistakes has golden messages reviewed by humans; each produces one error at the right location with the user's spelling, and user studies or sampled reports confirm average fix time falls over releases.",
    dep: ["diagnostic-engine", "source-locations", "error-recovery", "message-rendering"]
  },
  "incrementality": {
    s: "The ability to redo only the work affected by an edit, at every scale from files in a build to individual functions in an editor session.",
    d: "Incrementality is a design property: stages must expose clean boundaries and fingerprints, and results must be stored in a form that can be reloaded. Coarse levels (object files per source file, module interfaces) are the baseline. Finer levels (per-declaration queries, per-function optimization and code generation, cached IR) need dependency tracking so that stale results are never used. The payoff is edit-to-feedback latency in milliseconds. The cost is complexity, since every global side channel becomes a potential invalidation bug. Hard parts are precise dependency edges and early cutoff.",
    k: ["Design the whole compiler around queries vs add caching onto a pass pipeline: query design gives fine-grained reuse everywhere; bolted-on caches are cheaper to build and limited to coarse stages.",
        "Trust incremental results vs periodically verify against clean builds: trust is fast and a bug lingers; periodic verification catches stale-result bugs and costs CI time."],
    p: ["A global mutable table not tracked as a dependency makes results correct on a clean build and stale after an incremental one."],
    v: "Apply a sequence of random edits, building incrementally after each; at every step the incremental output is byte-identical to a clean build of the same sources, and rebuild work is proportional to the edit.",
    dep: ["demand-driven-queries", "incremental-compilation", "dependency-files", "compilation-cache"]
  },
  "undefined-behavior-semantics": {
    s: "What the language promises about erroneous programs, and how much the optimizer may assume from it, which fixes how aggressive and how surprising optimization can be.",
    d: "Languages with undefined behavior let the compiler assume it never happens: signed overflow does not occur, pointers do not alias across types, null is not dereferenced. Optimizers exploit that to prove loop bounds, remove checks and reorder memory. The decision flows through the whole compiler: IR flags and poison values record the assumptions, analyses use them, and the front end must not introduce undefined behavior of its own. Languages that define everything (wrapping arithmetic, checked indexing) give up some optimization and gain predictability. Hard parts are internal consistency and user surprise.",
    k: ["Undefined behavior as optimization license vs fully defined semantics: license enables the best code and turns bugs into silent miscompiles; full definition is predictable and costs speed and flexibility.",
        "Deferred poison values vs immediate undefined behavior in the IR: poison allows safe speculation and is subtle to specify; immediate undefined behavior is simple and forbids hoisting."],
    p: ["Two passes with inconsistent beliefs about what is undefined, one assuming no overflow and another introducing an overflowing operation, together miscompile correct code."],
    v: "Build with sanitizers that detect each kind of undefined behavior and run the test suite clean; for each IR flag, a test shows the optimization it permits and that code without the flag is not transformed.",
    dep: ["mid-level-ir", "constant-propagation", "sanitizers", "induction-and-trip-counts"]
  },
  "retargetability": {
    s: "How cheaply the compiler can be moved to a new machine, operating system or ABI, determined by how cleanly target knowledge is separated from the rest.",
    d: "A retargetable compiler keeps language semantics in the front end, optimization in a target-neutral middle end, and every machine fact (registers, instructions, costs, ABI, object format) in a target description and a few small hooks. The boundary is imperfect: type sizes, calling conventions and alignment leak into the front end, and cost models affect the middle end. Good designs expose queries rather than conditionals scattered through passes. Adding a target is mostly data plus the irregular exceptions. Hard parts are leakage of target assumptions, keeping optimization quality on new targets and testing across all of them.",
    k: ["Table-driven shared back end vs separate hand-written back ends: shared infrastructure cuts new-target effort and constrains unusual machines; hand-written back ends can be tailored and duplicate large amounts of work.",
        "Target hooks queried by passes vs conditional code on target name: hooks keep passes clean; name checks are quick and spread target knowledge everywhere."],
    p: ["Assumptions such as a 64-bit pointer size or little-endian byte order embedded in a middle-end pass work on every target tested until the first unusual one."],
    v: "Bring up a new target against a conformance and regression suite using only target description and hook code; all target-neutral tests pass without changes to shared passes.",
    dep: ["target-description", "target-selection", "legalization", "calling-conventions"]
  },
});
