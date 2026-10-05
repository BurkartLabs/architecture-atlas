// Compiler plate details, part 4: code generation, emission, runtime support.
ATLAS.details("compiler", {
  "instruction-selection": {
    s: "Maps target-independent IR operations onto target machine instructions, choosing patterns that cover the IR with the cheapest sequence of real instructions.",
    d: "The selector covers each block's dataflow graph with patterns taken from the target description. Tree or DAG matching finds multi-operation patterns (a load with an address computation folded in, a multiply-add) and picks a low-cost cover; some designs use fast greedy matching per instruction instead. The output is machine IR with virtual registers. Addressing modes, condition flags, immediate ranges and special instructions all shape the choices. Hard parts are matching on graphs rather than trees, selection speed (it touches every instruction), the volume of target patterns, and keeping the matcher correct for odd operand types.",
    k: ["Optimal DAG covering vs fast local greedy selection: covering produces better code and costs compile time; greedy selection is far faster and suits quick builds.",
        "Generated matcher from pattern descriptions vs hand-written per-target code: generated matchers are consistent and compact; hand-written code can exploit odd instructions and is laborious."],
    p: ["A pattern that folds a load into an arithmetic instruction changes the trap and ordering behavior of the load when the original had a side effect or volatile semantics."],
    v: "Compile a suite of IR snippets and compare selected sequences to goldens; run the program test suite at multiple optimization levels with a fast and a thorough selector and confirm identical behavior.",
    dep: ["mid-level-ir", "machine-ir", "target-description", "legalization"]
  },
  "legalization": {
    s: "Rewrites IR operations and types the target cannot do directly into sequences it can: wide integers split, unsupported operations expanded, odd vector sizes widened.",
    d: "Targets support only certain types and operations natively. Legalization consults the target description for each operation and type and chooses: promote to a wider type, expand into several operations (a 128-bit add as two adds with carry), split vectors, or call a runtime library routine. It runs before or interleaved with selection and often exposes new simplifications, so cleanup follows. Hard parts are the number of operation-and-type combinations, preserving semantics of flags, overflow and undefined values through expansion, and performance of expanded sequences.",
    k: ["Legalize on IR before selection vs during selection: before is simple and uniform; during lets the selector find combined instructions that a pre-split form hides.",
        "Expand inline vs call a runtime routine: inline is fast and grows code; library calls are compact for rare, complex operations."],
    p: ["Promoting a narrow integer operation to a wider type without masking afterward leaves garbage in the high bits, which a later comparison treats as significant."],
    v: "Exhaustively test small-width operations across all inputs after legalization against a reference evaluator; generate tests for every operation and type pair the target description marks as non-native.",
    dep: ["target-description", "machine-ir", "runtime-library"]
  },
  "register-allocation": {
    s: "Assigns the unlimited virtual registers of machine IR to the machine's few physical registers, inserting spills and reloads when values do not all fit.",
    d: "The allocator uses liveness to know which values are live together. Graph coloring builds an interference graph and colors it with as many colors as registers, spilling the least valuable nodes; linear scan sweeps live intervals in order, much faster and somewhat worse. Modern allocators add splitting live ranges, coalescing copies and rematerializing cheap values instead of spilling, and honor register classes and constraints from calling conventions and instructions. Spill code placement uses block frequencies. Hard parts are quality on loops, constraints such as fixed registers and pairs, and compile time on huge functions.",
    k: ["Graph coloring vs linear scan: coloring produces better code on hot loops; linear scan is far faster and suits quick builds and JIT tiers.",
        "Split live ranges aggressively vs allocate whole values: splitting avoids spilling a value everywhere when only one region is pressured; whole-value allocation is simpler and spills more."],
    p: ["Ignoring a register constraint on one instruction, such as a shift count that must live in a fixed register, produces code that assembles and silently computes the wrong value."],
    v: "After allocation, a checker confirms no two simultaneously live values share a register and every use sees its definition's value, including across spills. Program tests pass under register-starved settings that force heavy spilling.",
    dep: ["liveness-analysis", "machine-ir", "calling-conventions", "target-description"]
  },
  "instruction-scheduling": {
    s: "Orders instructions within blocks to hide latencies and use multiple execution units, without changing results.",
    d: "A scheduler builds a dependency graph of data, memory and control dependencies for a block and orders instructions using a machine model of latencies, issue width and functional units. List scheduling picks ready instructions by priority such as critical-path length. Scheduling runs before register allocation, favoring parallelism, and after it, fixing the final order, with attention to register pressure so early scheduling does not cause spilling. Superblock and software-pipelining variants cross block boundaries. Hard parts are accurate machine models, balance with pressure and keeping memory dependence information precise.",
    k: ["Schedule before allocation vs after: before exposes parallelism and can raise pressure; after sees real registers and spills but has fewer free choices.",
        "Detailed per-model pipeline description vs generic tuning: detailed models give gains on one microarchitecture; generic tuning is portable and leaves performance on the table."],
    p: ["Reordering two memory operations that the dependence graph thought independent changes behavior only when the pointers alias at run time."],
    v: "Check on a latency-bound sequence that the scheduled order interleaves independent chains, and that the program test suite behaves identically with scheduling enabled and disabled.",
    dep: ["machine-ir", "target-description", "alias-analysis", "register-allocation"]
  },
  "calling-conventions": {
    s: "The rules for how arguments, return values, saved registers and the stack are used at function boundaries, the contract that lets separately compiled code interoperate.",
    d: "A convention assigns each argument to a register or stack slot according to its type and position, defines which registers the callee must preserve and which the caller must save, where return values live, how the stack is aligned, and how variable-argument calls and large aggregates are passed. The back end implements it twice: at definitions (receiving parameters) and at call sites (passing them). The platform's ABI document is the authority, and compatibility with existing libraries is mandatory. Hard parts are aggregates split across registers, floating-point and vector arguments, variadic functions and special conventions for internal functions.",
    k: ["Follow the platform ABI everywhere vs custom conventions for internal functions: platform ABI guarantees interoperability; a custom internal convention is faster and must never be visible externally.",
        "Callee-saved vs caller-saved register balance: more callee-saved registers help call-heavy code and cost prologue work in leaf functions."],
    p: ["A mismatch of one rule, like how a small struct is split between registers, makes calls to separately compiled code receive wrong arguments with no link error."],
    v: "Link compiled test functions against code produced by another toolchain for the same ABI, passing every argument type combination and aggregate shape; all values must round-trip in both directions.",
    dep: ["target-description", "machine-ir", "stack-frame-layout"]
  },
  "stack-frame-layout": {
    s: "Decides where locals, spills, saved registers and outgoing arguments live in each function's stack frame, then inserts the prologue and epilogue that set it up and tear it down.",
    d: "After register allocation, the frame's size is known. Frame lowering orders slots by alignment and access frequency, allocates space for callee-saved registers, spill slots and locals, reserves an outgoing argument area, and replaces abstract frame references with offsets from a stack or frame pointer. Prologues adjust the stack pointer and save registers; epilogues undo it on every return path. Large frames require stack probing, and dynamic allocation requires a frame pointer. Hard parts are alignment, shrink-wrapping (saving only on paths that need it) and keeping unwind information exactly in step with the instructions.",
    k: ["Frame pointer always vs omit when possible: a frame pointer simplifies debugging, profiling and dynamic stacks and costs a register; omitting frees it and complicates unwinding.",
        "Shrink-wrap prologues vs place at entry: shrink-wrapping avoids work on early-exit paths and complicates unwind tables and block placement."],
    p: ["A frame-offset computation that ignores an alignment requirement gives misaligned vector spills, crashing only on targets that fault on unaligned access."],
    v: "Check at every instruction that unwinding from a trap yields correct caller frames, and run recursion and variable-size-allocation tests under stack-checking tools to confirm no overlap between slots.",
    dep: ["register-allocation", "calling-conventions", "unwind-info"]
  },
  "block-placement": {
    s: "Chooses the order of basic blocks in memory to make hot paths fall through and then resolves branches whose targets are too far for their encodings.",
    d: "Using branch probabilities from heuristics or profile data, the placer chains blocks so the likely successor follows its predecessor, moves cold blocks (error paths, unwinding code) out of line, and removes branches that become fallthrough. After final sizes are known, branch relaxation rewrites short-range branches into longer forms or adds trampolines where targets are out of reach, which can change sizes of other branches, so it iterates to a fixed point. Alignment padding for loop heads is added here. Hard parts are accurate frequencies, cache and predictor effects and fixed-point convergence.",
    k: ["Profile-based placement vs static heuristics: profiles place hot paths accurately; heuristics are always available and sometimes wrong on unusual control flow.",
        "Align loop headers vs pack tightly: alignment speeds fetch and increases size; tight packing saves space and may split hot loops across lines."],
    p: ["Relaxation that grows one branch can push another out of range; without iterating to a fixed point, the assembler fails or silently truncates."],
    v: "A function with a distant branch target assembles correctly with relaxation. Profile-guided builds show the hot path as a straight fallthrough sequence in the disassembly and cold blocks at the end.",
    dep: ["machine-ir", "machine-code-encoder", "profile-guided-optimization"]
  },
  "target-description": {
    s: "A declarative description of a machine: registers, instructions, encodings, costs and legal types, from which many back-end components are generated or configured.",
    d: "Rather than hard-coding each target in every pass, a table-driven description lists register files and classes, each instruction's operands, patterns, assembly syntax, binary encoding, latencies and resources, plus calling-convention and legal-operation rules. Tools process it to produce the instruction selector, assembler printer, encoder and scheduler tables. Adding a target or variant becomes mostly data. Hard parts are expressing irregular instructions in a general format, build-time cost of the generators and discoverability for people who must debug generated code.",
    k: ["Declarative descriptions with generators vs hand-written target code: descriptions share infrastructure and cut errors; hand-written code is flexible and duplicated per target.",
        "One description per feature set vs conditional features inside one: per-set descriptions are simple; feature flags avoid duplication and complicate predicates."],
    p: ["An instruction description whose encoding or operand order is wrong passes all compile tests and produces bad machine code only when that instruction is selected."],
    v: "Encode every instruction through the description and compare to an independent assembler's bytes for exhaustive operand samples; disassemble and re-encode to confirm a round trip.",
    dep: []
  },
  "assembly-printer": {
    s: "Prints machine IR as human-readable assembly text, for inspection and for toolchains that assemble separately.",
    d: "For each function the printer emits labels, directives for sections, alignment and symbol visibility, and instructions in the target's textual syntax, with operands rendered from the instruction descriptions. It also emits debug and unwind directives as text. Text output makes the compiler easy to debug and test, because tests can match patterns in assembly, and lets a separate assembler handle encoding. Many compilers use one path for text and for direct object emission, via a common streaming interface. Hard parts are syntax dialect differences, escaping odd symbol names and keeping text and binary output equivalent.",
    k: ["Emit through a common streaming interface for text and binary vs separate printers: a common interface keeps the two outputs identical; separate printers are simpler and drift.",
        "Print assembly then assemble vs encode directly: via text allows inspection and costs time; direct encoding is faster for builds."],
    p: ["A symbol name containing a quote or special character printed unescaped produces assembly that fails to assemble or assembles to a different symbol."],
    v: "Assemble the printed text with the toolchain assembler and compare to the compiler's direct object output; section contents and symbols must be identical.",
    dep: ["machine-ir", "target-description", "section-layout"]
  },
  "machine-code-encoder": {
    s: "Converts each machine instruction and its operands into the exact bytes of the target's encoding, recording fixups where addresses are not yet known.",
    d: "From the instruction descriptions, the encoder assembles opcode bits, register fields, immediates and prefixes, choosing among alternative encodings of the same instruction (short and long forms) to minimize size. Operands that depend on final addresses, such as branch targets and symbol references, produce a placeholder plus a fixup, resolved after layout or left as relocations for the linker. Variable-length encodings make sizes depend on operand values, feeding branch relaxation. Hard parts are matching the architecture manual exactly, immediate range limits and ensuring encoder and disassembler agree.",
    k: ["Shortest encoding always vs predictable fixed size: shortest saves space and makes layout iterative; fixed size simplifies layout and wastes bytes.",
        "Encoder generated from descriptions vs hand-written: generated matches the single source of truth; hand-written can handle odd encodings and risks divergence."],
    p: ["An immediate that does not fit its field silently truncates rather than erroring, creating a wrong constant only for large values."],
    v: "Encode all instructions over sampled operand sets and compare byte for byte to a reference assembler; disassembling the output yields the original instructions.",
    dep: ["target-description", "machine-ir", "relocations"]
  },
  "object-file-writer": {
    s: "Writes the relocatable object file in the platform's object file format: headers, sections, symbol table, relocations and debug and unwind data.",
    d: "A streamer collects sections with bytes, alignment and flags, symbols with sections, offsets and binding, and relocations, then serializes them in the platform format: headers, section table, string tables and index mappings. It decides which sections to merge, whether to compress debug sections and how to group comdat or one-definition sections. Output must be exactly what linkers and loaders expect. Hard parts are format variants across platforms, size limits on counts and offsets, deterministic ordering of sections and symbols, and format features such as common symbols and weak definitions.",
    k: ["Direct object writer vs assemble through an external tool: direct is fast and removes a dependency; external assemblers are mature and handle inline assembly in their own dialect.",
        "Deterministic ordered tables vs hash-order output: sorted output is reproducible and costs a sort; hash order is quick and breaks byte-identical builds."],
    p: ["Symbol or section ordering that depends on hash-table iteration produces objects differing from run to run, defeating caches and reproducible builds."],
    v: "Validate output with several independent object inspection tools and link it with more than one linker. Compile the same input twice and compare bytes.",
    dep: ["section-layout", "symbols-and-linkage", "relocations", "machine-code-encoder", "determinism-of-output"]
  },
  "relocations": {
    s: "Records places in the object code and data whose final values depend on addresses chosen by the linker or loader, and how to patch each one.",
    d: "When code refers to a symbol whose address is unknown at compile time, the compiler emits a relocation: an offset in a section, a symbol, a type describing the computation (absolute, pc-relative, page and offset, got-relative) and an addend. The linker or dynamic loader patches the bytes after assigning addresses. The choice of relocation type encodes the code model (small, large, position-independent), thread-local access models and access to far symbols. Hard parts are the sheer number of types per target, range limits that require veneers or alternate sequences, and consistency with linker expectations.",
    k: ["Position-independent code vs fixed-address code: position independence allows shared libraries and address randomization and costs indirections; fixed addresses are faster and non-relocatable.",
        "Small code model vs large: small uses short, cheap sequences and limits the program size; large works anywhere and costs instructions per reference."],
    p: ["A pc-relative reference to a symbol beyond its range fails at link time, or worse, wraps silently on a format without range checks."],
    v: "Link programs with data and code at far-apart addresses and in shared and static modes; every symbolic reference resolves correctly, and relocation dumps show only types allowed by the selected code model.",
    dep: ["machine-code-encoder", "symbols-and-linkage", "object-file-writer"]
  },
  "symbols-and-linkage": {
    s: "Defines the names the object file exports and imports, with visibility, linkage and mangling rules that govern how separate objects find each other.",
    d: "Each function and global gets a symbol name, produced by mangling the source name with its namespace, parameter types or generic arguments so overloads and templates are distinct. Linkage decides visibility: external, internal to the object, weak (overridable), one-definition-merged. Visibility attributes control dynamic export. Inline and generic functions are emitted in sections the linker can deduplicate. Hard parts are a mangling scheme stable across compiler versions, duplicate definitions of inline functions across files and keeping symbol tables small and fast for dynamic loading.",
    k: ["Mangle full type information vs source name only: full mangling supports overloads and catches signature mismatches at link time; plain names are simple and need other disambiguation.",
        "Default hidden visibility vs default exported: hidden shrinks dynamic symbol tables and enables optimization; exported is convenient and exposes internals."],
    p: ["Changing mangling rules between compiler versions makes previously built libraries fail to link or, worse, bind to the wrong overload."],
    v: "Compile overloaded and generic functions in two files and link: one definition of each shared inline function remains, symbol names demangle to the expected source names, and hidden symbols are absent from the dynamic table.",
    dep: ["object-file-writer", "generics-and-monomorphization", "name-resolution"]
  },
  "section-layout": {
    s: "Decides which output section each function and datum goes into (code, read-only data, writable data, zero-initialized, thread-local) and with what alignment.",
    d: "The compiler classifies every global: code goes to text sections, constants and string literals to read-only data, initialized variables to data, zero-initialized variables to a zero-fill section, thread-locals to their own. Options split each function or datum into its own section so the linker can drop unused ones and reorder by hotness. Layout also covers literal pools, merging identical constants and the data layout (size, alignment, padding) of aggregates. Hard parts are placing constants within reach of pc-relative loads and balancing granularity against section-count overhead.",
    k: ["One section per function vs one per file: per-function sections enable garbage collection of unused code and ordering; per-file sections are compact and coarse.",
        "Merge identical constants vs keep distinct: merging shrinks size and breaks code assuming distinct addresses for equal values."],
    p: ["Placing a modified datum in a read-only section crashes at run time on first write, and may be missed if the platform maps it writable during testing."],
    v: "Inspect section tables for programs with each storage class; functions land in code sections, constants are read-only, zero-initialized data occupies no file space, and unused function sections are removed by linker garbage collection.",
    dep: ["symbols-and-linkage", "target-description"]
  },
  "debug-info": {
    s: "Emits tables mapping machine code back to source lines, variables, types and scopes so debuggers and profilers can show the program the way its author wrote it.",
    d: "The compiler carries source locations and variable descriptions through optimization, then emits a line table (address to file, line, column), type descriptions, scope trees and location lists saying where each variable lives (a register, then a stack slot) over address ranges. The data is encoded in a compact, standardized debug information format. Optimized code makes this difficult: values are in registers briefly, code is reordered or deleted and inlined functions need inline call records. Hard parts are fidelity under optimization, large size and keeping every pass from dropping location metadata.",
    k: ["Full variable tracking in optimized code vs line tables only: full tracking enables real debugging and costs compile time and size; line-only is cheap and enough for profiles and stack traces.",
        "Separate debug files vs embedded: separate files keep shipping binaries small and require a symbol server; embedded is simple and bloats."],
    p: ["A pass that moves or deletes an instruction without carrying its location produces line tables where stepping jumps back and forth or variables show wrong values."],
    v: "Run a scripted debugger session on an optimized build: breakpoints on source lines hit the right place, variables print correct values where available, and backtraces show inlined functions as separate frames.",
    dep: ["source-locations", "machine-ir", "object-file-writer", "inlining"]
  },
  "unwind-info": {
    s: "Emits tables that describe how to restore registers and the stack pointer at every instruction, so exceptions, debuggers and profilers can walk stack frames.",
    d: "For each function, the compiler records at every instruction boundary where the return address lives and how to recover each saved register and the caller's frame, usually as a compact program of frame-adjustment operations tied to prologue and epilogue instructions. Exception handling adds tables mapping call sites to cleanup and catch handlers and the types they accept, which the runtime consults while unwinding. Hard parts are exactness (every stack-pointer change needs a matching record), epilogues in the middle of functions and unwinding through asynchronous events and signal handlers.",
    k: ["Table-driven unwinding (zero cost when no exception) vs explicit checks after calls: tables have no runtime cost on the normal path and grow the binary; explicit checks are simple and slow every call.",
        "Precise at every instruction vs only at call sites: every-instruction precision supports asynchronous unwinding and profilers and costs more table size."],
    p: ["A frame adjustment missing from the table at one instruction makes unwinding fail only when a signal or exception hits that exact point."],
    v: "Throw exceptions through every function shape including leaf, large-frame and dynamically sized frames, and interrupt a running program at random points; backtraces and cleanups must be correct each time.",
    dep: ["stack-frame-layout", "object-file-writer", "machine-ir"]
  },
  "startup-code": {
    s: "The code that runs before the program's main entry and after it returns: setting up the stack, running initializers, passing arguments and calling exit handlers.",
    d: "The linked program begins at an entry point supplied with the toolchain, which receives the initial stack and environment from the loader, initializes thread-local storage and runtime state, runs static constructors and initialization tables in the order the compiler emitted, calls main with arguments, and on return runs finalizers and exits with the result. Freestanding targets replace it with their own. The compiler cooperates by emitting initializer and finalizer tables and ordering rules. Hard parts are initialization order across files, running before the runtime library is ready and special modes (position-independent, shared, embedded).",
    k: ["Table-driven initializers vs generated init function: tables let the linker collect contributions from every file; a generated function is explicit and needs whole-program knowledge.",
        "Lazy initialization of globals on first use vs eager at startup: lazy shortens startup and adds a check per access; eager is simple and can create order dependencies."],
    p: ["Initialization order dependence between files in different translation units works by accident of link order, then breaks when the build changes."],
    v: "Build a program with global constructors in several files and print their order; run a freestanding variant without the standard startup and confirm it enters its own entry point with correct stack alignment.",
    dep: ["runtime-library", "symbols-and-linkage", "linker-invocation"]
  },
  "runtime-library": {
    s: "A small library shipped with the compiler containing helper routines that generated code calls for operations the hardware lacks, plus support for language features.",
    d: "When legalization decides an operation is too complex to inline, such as wide integer division, software floating point, or atomic operations on odd sizes, it emits a call to a routine in this library. It also provides exception and unwinding support, stack protector hooks, memory copy primitives and language-specific services like bounds failure handlers. Its calling interface is part of the compiler's contract and is versioned with the compiler. Hard parts are correctness of tricky arithmetic, performance of the hot helpers and building it for every target and mode the compiler supports.",
    k: ["Ship as source built per target vs prebuilt binaries: per-target builds match flags exactly and require a build step; prebuilt is convenient and fixed.",
        "Inline expansions vs library calls: expansions are faster and grow every use; library calls are compact and add call overhead."],
    p: ["A runtime routine compiled with a different calling convention or ABI mode than user code corrupts registers on the first call."],
    v: "Test each helper exhaustively or against arbitrary-precision references over edge-case inputs, and link programs in every supported mode to confirm all helper symbols resolve.",
    dep: ["calling-conventions", "target-selection"]
  },
  "intrinsics": {
    s: "Built-in functions that the compiler understands specially and expands inline: memory copy, bit counting, overflow-checked arithmetic, atomics, vector operations and target-specific instructions.",
    d: "Calls to recognized names or IR intrinsics are not ordinary calls. The optimizer knows their semantics (a bit count of a constant folds, a memory copy of small constant size becomes loads and stores), and the back end maps them to single instructions when the target has one or to a fallback sequence. They also let programmers reach instructions with no language equivalent. Each intrinsic needs a precise definition of side effects and undefined behavior. Hard parts are semantics consistent across targets, passing optimization legality information and the growth of the catalog.",
    k: ["Target-neutral intrinsics with fallbacks vs target-specific only: neutral ones are portable and may be slow where unsupported; target-specific ones map exactly and tie code to a machine.",
        "Treat as opaque calls vs teach optimizer semantics: opaque is safe and blocks optimization; semantic knowledge enables folding and elimination."],
    p: ["Declaring an intrinsic as having no side effects when it touches memory allows the optimizer to reorder or delete it, breaking atomics and fences."],
    v: "For each intrinsic, test constant folding, inline expansion and the fallback path against a reference implementation on edge inputs, and verify the disassembly uses the dedicated instruction where one exists.",
    dep: ["mid-level-ir", "legalization", "instruction-selection"]
  },
  "sanitizers": {
    s: "Compile-time instrumentation that inserts run-time checks for memory errors, data races, undefined behavior and uninitialized reads, with a runtime that reports them.",
    d: "An instrumentation pass runs on IR, wrapping each memory access with a check against shadow state (a compact map of which addresses are valid), inserting guards around stack objects, recording thread synchronization or checking arithmetic for overflow. A runtime library maintains shadow memory, intercepts allocation functions and prints a report with stack traces. Instrumentation must run after most optimization to see final accesses but before code that would delete the check, and must be opted into per build. Hard parts are overhead, false positives from optimization-created accesses and mixing instrumented and uninstrumented code.",
    k: ["Instrument early vs late in the pipeline: early catches accesses as written and risks optimizing checks away or slowing code; late sees final accesses and reports in terms the optimizer produced.",
        "Shadow memory checks vs lock-and-key or bounds metadata: shadow memory is fast and approximate on some errors; metadata is precise and costs more per pointer."],
    p: ["Optimizing away a check because undefined behavior was assumed absent means the sanitized build misses the very bug it was built to find."],
    v: "Run a suite of programs with seeded memory errors, races and overflows; each is reported with the right location, clean programs produce no reports, and run-time overhead stays within the documented factor.",
    dep: ["mid-level-ir", "runtime-library", "pass-manager"]
  },
  "profile-guided-optimization": {
    s: "Feeds measurements from real runs back into compilation, so inlining, block layout and other decisions favor the paths the program actually takes.",
    d: "A first build is instrumented to count edges and call targets, or sampled from a production run with a profiler. The profile is mapped back onto the IR as branch probabilities, block and call counts and indirect-call histograms. Later passes consult them: inlining hot call sites, laying out hot code contiguously, unrolling and vectorizing hot loops, devirtualizing with guards, and optimizing cold code for size. Stale profiles are the main hazard. Hard parts are matching profile data to changed source, representativeness of the training workload and the cost of the two-step build.",
    k: ["Instrumented counters vs sampling: instrumentation is exact and slows the profiling run; sampling is cheap on production and needs inference to recover counts.",
        "Strict profile matching vs tolerant matching after source edits: strict ignores stale data safely; tolerant keeps most benefit and risks mismatched attribution."],
    p: ["Training on an unrepresentative workload makes the compiler treat common real-world paths as cold and optimize them for size."],
    v: "Build with a profile from workload A; benchmark on A and on a different workload B. Hot-path speedup is visible on A, B is no worse than the unprofiled build, and the layout puts hot blocks first.",
    dep: ["inlining", "block-placement", "mid-level-ir", "coverage-instrumentation"]
  },
  "coverage-instrumentation": {
    s: "Inserts counters that record which functions, branches or lines executed, so tests can report how much code they exercised.",
    d: "An instrumentation pass allocates counters per region (function, block, branch edge) and increments them as code runs, along with a mapping from counters back to source regions stored in the object file. At exit, a runtime library writes the counts to a file that a reporting tool merges across test runs. Source-based variants count against the original structure and can report precise branch and region coverage; IR-level variants are cheaper but attribute to optimized code. It shares machinery with profile-guided instrumentation. Hard parts are overhead, threads incrementing shared counters and mapping accuracy after optimization.",
    k: ["Source-region counters vs counters on optimized IR: source regions give faithful reports and defeat some optimization; IR counters are cheap and approximate.",
        "Atomic counter increments vs plain: atomic counts are correct under threads and slow; plain increments are fast and lose counts under contention."],
    p: ["Compiling coverage builds with optimization reorders and merges regions, so reports show lines as uncovered that actually ran."],
    v: "Run a test with a known set of executed and unexecuted branches; the generated report marks exactly those lines and branches, and merging two runs gives the union of covered regions.",
    dep: ["mid-level-ir", "source-locations", "runtime-library"]
  },
});
