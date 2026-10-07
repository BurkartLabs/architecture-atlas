// Details for the WebAssembly runtime plate, part 1: host embedding and tooling.
ATLAS.details("wasm-runtime", {
  "host-embedding-api": {
    s: "The public interface a host program uses to load a module, bind imports, instantiate it, call exports and read results, usually exposed as a stable C-style function table.",
    d: "The API is a small set of object kinds (engine, module, store, instance, function, memory, table, global) with create, inspect and destroy calls. Ownership is the core rule: who frees a module, whether an instance keeps its module alive, and which objects may cross threads. Calls into the guest return either values or a trap object. A standard header lets one embedder run on several engines, but engine-specific extensions such as fuel or pooling sit outside it. Stability is hard because every addition becomes a permanent promise to embedders.",
    k: ["Opaque handles with explicit free calls vs reference-counted smart objects: handles stay stable across language boundaries, but leaks and double frees become the embedder's problem.", "A standard shared header vs an engine-specific API: portability across engines, but only the common subset of features is reachable."],
    p: ["An embedder keeps a function reference after its store is destroyed and crashes on the next call.", "Version skew between header and library silently changes struct layouts and corrupts arguments."],
    v: "Write a host that loads a module, calls an exported add function with 2 and 3, and prints 5. Free every object and confirm a leak checker reports no outstanding allocations.",
    dep: ["engine-and-store", "host-function-bindings", "module-object"]
  },
  "engine-and-store": {
    s: "The engine holds shared compiler and configuration state; the store owns every live instance, memory, table and global created for one unit of execution.",
    d: "An engine is created once and shared by many threads: it owns compiler settings, the code cache and type registry. A store is cheap and usually single-threaded: it holds all runtime objects, host data, and the limits that apply to them. Objects are tied to their store and cannot be mixed with another's. Dropping a store frees everything in it at once, which makes per-request isolation simple. The difficulty is deciding what is shared safely and what must be private, since cross-store references would leak state between tenants.",
    k: ["One store per tenant or request vs one long-lived store: per-request stores give clean teardown and isolation, but repeat instantiation cost.", "Engine-wide code cache vs per-store compilation: sharing saves memory and time, but couples tenants through cache pressure."],
    p: ["Passing an object from one store to another is rejected at runtime, but only after the call is already made.", "A long-lived store accumulates dead instances because nothing can free part of it."],
    v: "Create two stores from one engine, instantiate the same module in each, mutate memory in one, and confirm the other's memory is unchanged while compiled code is shared.",
    dep: ["module-object", "instance-object"]
  },
  "host-function-bindings": {
    s: "Registers host-side functions as imports a module can call, with declared signatures, access to the caller's memory and a way to report errors back to the guest as traps.",
    d: "A binding pairs a function type with a host callback. When guest code calls the import, the engine switches from the guest calling convention to the host's, converts arguments, runs the callback and converts results back. The callback usually receives a caller context giving access to the instance's exports and memory. Errors raised in the host become traps. The hard parts are the cost of each crossing, reentrancy when the host calls back into the guest, and keeping host panics or exceptions from unwinding through compiled frames.",
    k: ["Typed callbacks checked at link time vs dynamically typed callbacks: static types catch mismatches early, but dynamic ones are easier to bind from scripting languages.", "Allowing reentrancy vs forbidding it: reentrancy enables callbacks and event loops, but exposes the host to the guest mutating state mid-call."],
    p: ["A host exception unwinding through guest frames corrupts the engine's stack bookkeeping.", "A hot import called a million times pays the full crossing cost each time and dominates runtime."],
    v: "Import a host function that appends to a log, call an export that invokes it three times, and confirm three log entries with the argument values the guest passed.",
    dep: ["host-embedding-api", "typed-value-marshaling", "imports-and-exports"]
  },
  "typed-value-marshaling": {
    s: "Converts between the host's values and the four numeric types, vectors and references that core modules understand, including how larger data moves through linear memory.",
    d: "Core signatures carry only 32- and 64-bit integers, 32- and 64-bit floats, vectors and opaque references. A string or struct is passed as a pointer and length into linear memory, which the host reads or writes directly. Marshaling code checks ranges before reading, copies rather than aliases when memory may grow, and handles byte order and NaN payloads. It is hard because a view into memory is invalidated by growth, and because the guest controls every pointer it passes.",
    k: ["Copying data out of memory vs borrowing a view: copies are safe against growth and concurrent writes, but cost bandwidth on large payloads.", "Trusting guest-supplied lengths after a range check vs re-validating on each use: one check is cheap, but a shared memory can change between check and use."],
    p: ["Holding a memory slice across a call into the guest, which grows memory and leaves a dangling view.", "Reading a string from shared memory without copying lets the guest alter it between validation and use."],
    v: "Pass a UTF-8 string through an export that echoes it, with the host reading it back from memory, then grow memory mid-call and confirm the host still reads the correct bytes.",
    dep: ["linear-memory", "bounds-checking", "host-function-bindings"]
  },
  "engine-configuration": {
    s: "The settings chosen when an engine is built: which proposals are accepted, which compiler tiers run, memory reservation sizes, limits and whether code may be cached.",
    d: "Configuration is fixed at engine creation because compiled code depends on it. Flags enable proposals, choose interpreter, baseline or optimizing tiers, set address space reservation per memory, stack limits, debug information and threading. Some settings change generated code, so they are part of the cache key. Defaults must be safe for untrusted input, while embedders chasing speed push toward more reservation and fewer checks. The difficulty is interaction: a setting such as guard-page size changes which bounds checks are legal.",
    k: ["Safe defaults with explicit opt-in to risky features vs permissive defaults: safe defaults protect untrusted deployments, but hide performance that embedders must discover.", "Configuration frozen at creation vs adjustable at runtime: freezing keeps compiled code valid, but forces a new engine for any change."],
    p: ["Two engines with different settings share a cache directory and load code compiled under the wrong assumptions.", "Enabling a proposal on the compiler but not the validator yields modules that decode but never run."],
    v: "Build an engine with threads disabled, load a module using shared memory, and confirm validation rejects it with a message naming the disabled feature. Enable the flag and confirm it loads.",
    dep: ["feature-flags", "memory-and-table-quotas"]
  },
  "trap-and-error-reporting": {
    s: "Surfaces failures to the embedder as typed results: trap kinds, a guest stack trace, and a clear split between invalid modules, link errors and runtime traps.",
    d: "Three families of failure exist: a binary that fails to decode or validate, an instantiation that cannot resolve imports or run initializers, and a trap during execution such as out-of-bounds access, divide by zero or unreachable. Each carries a kind code and, where possible, function names and offsets from the name section. The embedder gets a structured object rather than a crash. Hard parts are producing a trace from optimized frames and keeping messages stable enough to match on.",
    k: ["Structured error kinds vs free-form messages: kinds let hosts react programmatically, but a fixed set must grow with each proposal.", "Capturing a trace at trap time vs on request: capture is always available, but costs time on every trap including expected ones."],
    p: ["Hosts match on message text, which changes between releases and silently breaks error handling.", "A trap inside a host callback is reported as the callback's error, hiding the guest frame that caused it."],
    v: "Run modules that divide by zero, read out of bounds and import a missing function, and confirm three distinct error kinds, each with the function name where a name section exists.",
    dep: ["trap-semantics", "stack-trace-capture", "name-section-and-debug-info"]
  },
  "embedder-language-bindings": {
    s: "Wrappers that expose the embedding API idiomatically in another programming language, mapping ownership, errors and callbacks onto that language's conventions.",
    d: "A binding layer sits on the stable C-style API or links the runtime directly. It turns handles into objects with destructors, traps into exceptions or result values, and host functions into closures. It must keep garbage-collected host objects alive while the guest holds references to them, and run finalizers on the right thread. The hard problems are lifetime across two memory managers, callbacks that cross the boundary in both directions, and async host code called from a synchronous guest.",
    k: ["Thin generated wrapper vs hand-designed idiomatic API: generated wrappers track the engine closely, but feel foreign to the host language's users.", "Blocking the guest while the host awaits vs running the guest as a resumable task: blocking is simple, but ties up a host thread per waiting guest."],
    p: ["A host closure registered as an import is collected while the guest still holds it, and a later call crashes.", "Finalizers running on an arbitrary thread free engine objects while another thread is using the store."],
    v: "Register a closure in the host language as an import, trigger a garbage collection in the host, call the export again and confirm the closure still runs.",
    dep: ["host-embedding-api", "host-function-bindings"]
  },
  "name-section-and-debug-info": {
    s: "Custom sections that map function indices, locals and byte offsets back to readable names and source lines, so traces and debuggers can speak in source terms.",
    d: "The name section assigns text names to functions, locals, types and globals. Separate debug sections carry line tables, variable locations and type descriptions, or point to an external file by URL to keep the module small. Runtimes parse these lazily and never trust them for execution. The difficulty is that debug records describe the original code while the engine runs a transformed version, so offsets must be mapped through the compiler's own tables. Stripped modules lose all of it.",
    k: ["Embedded debug sections vs an external debug file: embedding travels with the module, but inflates download size by large factors.", "Parsing eagerly at load vs on first use: eager parsing speeds trace formatting, but slows startup for every run that never needs it."],
    p: ["A stale external debug file is matched to a rebuilt module and shows wrong source lines.", "Debug sections shipped to production leak source paths and variable names."],
    v: "Build the same module with and without debug information, trigger a trap, and confirm the trace shows function names and source line numbers only for the first build.",
    dep: ["custom-sections", "binary-decoder"]
  },
  "debugger-support": {
    s: "Lets a debugger set breakpoints, step, inspect locals and memory, and read the call stack of a running module, across interpreter and compiled tiers.",
    d: "A debugging session attaches through the engine and asks it to stop at chosen offsets. Interpreted code can check a breakpoint table on every instruction. Compiled code needs either a recompile with checks inserted, a patched trap instruction, or a fallback to the interpreter for the stopped function. The engine exposes locals and operand stack values by mapping optimized registers back to source variables. It is hard because optimization removes variables and reorders instructions, so there is often nothing faithful to show.",
    k: ["Debugging only at the lowest tier vs debugging at every tier: lowest-tier is faithful and simple, but runs slowly and changes timing.", "A wire protocol to an external debugger vs an in-process hook API: a protocol reuses existing tools, while hooks give embedders direct control."],
    p: ["Breakpoints set while code is being tiered up are lost when the function is replaced.", "Inspecting a local in an optimized frame reports a stale register value."],
    v: "Set a breakpoint inside a loop, run the module, and confirm it stops on the first iteration, shows the loop counter as zero, then shows one after a single step.",
    dep: ["name-section-and-debug-info", "interpreter-loop", "on-stack-replacement"]
  },
  "sampling-profiler": {
    s: "Periodically interrupts the guest, records its call stack and attributes time to functions, without instrumenting the code and with small overhead.",
    d: "A timer or epoch tick pauses execution at a safe point and walks the stack through frame pointers or unwind tables, recording function indices. Samples aggregate into a flame graph or a table with self and inclusive time. Frames from compiled code must be translated back to module functions, and time spent in host imports is attributed separately. The hard parts are unwinding through optimized frames, bias toward safe points rather than true locations, and overhead when sampling is frequent.",
    k: ["Sampling vs instrumenting every function entry: sampling adds little overhead and no code change, but misses short calls and is statistical.", "Sampling only at safe points vs asynchronous signal sampling: safe points are reliable to unwind, but skew results toward loop back edges and calls."],
    p: ["Samples land only on safe points, so a long straight-line function looks cheaper than it is.", "Inlined functions disappear from profiles unless inline records are kept."],
    v: "Run a module with one function that spins for most of its time and confirm the profile attributes the majority of samples to that function, within a few percent of an independent timer.",
    dep: ["stack-trace-capture", "epoch-interruption", "name-section-and-debug-info"]
  },
  "stack-trace-capture": {
    s: "Walks the guest's call stack on demand, in any tier, and reports function indices, byte offsets and inlined callers, usually at a trap or when asked by a profiler.",
    d: "Interpreted frames are explicit and easy to read. Compiled frames follow a calling convention, so the walker uses frame pointers or unwind tables, then maps each return address to a function through a sorted code-range index. Metadata records which call sites exist, so the walker can recover the module-level offset. Inlined calls need extra records to expand one machine frame into several logical ones. Difficulty comes from frames that cross the host boundary and from walking stacks safely while another thread runs.",
    k: ["Frame pointers vs table-driven unwinding: frame pointers walk in a few instructions, but cost a register and some code size.", "Capturing on every trap vs on demand: always capturing makes errors self-explanatory, but turns expected traps into a performance cost."],
    p: ["A return address inside a trampoline maps to no function, and the walk stops early or crashes.", "A very deep recursion produces a trace large enough to exhaust memory."],
    v: "Call through five nested functions that end in a trap and confirm the trace lists all five function names in order, with offsets that point at the call instructions.",
    dep: ["hardware-trap-handlers", "name-section-and-debug-info", "thread-and-stack-management"]
  },
  "text-format-and-disassembly": {
    s: "A readable text form of the binary format, with an assembler and disassembler so people and tests can write, read and diff modules.",
    d: "The text format writes instructions as nested or flat expressions with symbolic names for functions, locals and labels. An assembler parses it into the binary encoding, resolving names to indices. A disassembler goes the other way, using the name section when it exists and synthetic names when it does not. Spec tests, bug reports and compiler output are all stored as text. The difficulty is round trips: names, comments and layout are lost in the binary, and the text grammar tracks every new proposal.",
    k: ["A flat instruction list vs a folded expression form: flat matches the binary exactly, but folded is easier for humans to follow.", "Lossless round trips vs normalized output: lossless output preserves intent, but only a canonical form is stable enough to diff."],
    p: ["Assembling then disassembling a module produces different but equivalent text, breaking golden-file tests.", "The assembler accepts a proposal the engine's validator still rejects."],
    v: "Disassemble a module to text, assemble it back, and confirm the resulting binary is byte-identical when names are kept and executes identically when they are not.",
    dep: ["binary-decoder", "section-structure"]
  },
  "module-inspection-tools": {
    s: "Command-line tools that print a module's sections, imports, exports, sizes and instruction statistics, and that validate, strip or minimize a binary.",
    d: "Inspection tools reuse the decoder and report structure: which imports a module requires, which exports it offers, how large each section is, and which proposals it uses. Companion tools validate a binary, strip custom sections, and shrink code. Security reviewers use import lists to see what a module could ask the host for. They are hard to keep in sync with the engine, since a tool with its own decoder can accept inputs the runtime rejects, or the reverse.",
    k: ["Sharing the engine's decoder vs a separate implementation: sharing guarantees agreement, but a second implementation finds bugs in the first.", "Offline tools vs a runtime introspection API: offline tools need no host, but cannot see what linking or instantiation did."],
    p: ["A tool reports a module as valid because its validator is older than the runtime's feature set.", "Stripping a section the host depends on, such as a producer or linking record, breaks later tooling."],
    v: "Run the import listing on a module and compare it with the actual imports the runtime requests at link time; the two sets of names and types must be identical.",
    dep: ["binary-decoder", "validation-algorithm", "imports-and-exports"]
  },
  "tracing-hooks": {
    s: "Callbacks the engine fires at function entry, exit, memory growth, traps and tier changes, so embedders can log, count or reconstruct execution without patching modules.",
    d: "Hooks are enabled per engine or store and cost nothing when off. When on, the compiler inserts calls at function boundaries, or the interpreter checks a flag. Events carry function index, timestamp and sometimes arguments. They feed logging, record-and-replay, coverage and security auditing. The difficulty is overhead and observer effects: inserted calls change timing and register pressure, hooks that call back into the engine can recurse, and event volume can swamp the host.",
    k: ["Compile-time inserted hooks vs runtime checks everywhere: inserted hooks cost nothing when absent, but require recompiling to turn on.", "Synchronous callbacks vs buffered events: synchronous gives exact ordering, but a slow callback stalls the guest."],
    p: ["A hook that allocates inside a memory-growth event deadlocks the allocator.", "Tracing enabled in production emits more events than the host can drain and adds large latency."],
    v: "Enable entry and exit hooks, run a program with a known call tree, and confirm the event stream reproduces that tree exactly, with every entry matched to an exit.",
    dep: ["stack-trace-capture", "interpreter-loop", "code-emission"]
  },
  "differential-testing": {
    s: "Runs the same module through several engines or tiers and compares results, traps and memory, to find compiler and validator bugs that single-engine tests miss.",
    d: "A generator produces random but valid modules, runs each through an interpreter and one or more compilers, and compares return values, trap kinds and final memory. Mismatches are reduced to minimal cases. The spec's own test suite is run the same way. The difficulty is nondeterminism the spec allows: NaN payloads, thread interleavings, host-dependent limits and resource exhaustion, all of which must be normalized before comparing. Fuel or epoch limits keep infinite loops from hanging the harness.",
    k: ["Comparing against a reference interpreter vs against another optimizing engine: the interpreter is simple enough to trust, but slow on large inputs.", "Generating valid-by-construction modules vs mutating real ones: valid generation reaches deep compiler paths, but mutation finds bugs in realistic code shapes."],
    p: ["Allowed differences such as NaN bit patterns are reported as bugs, burying real findings in noise.", "A generator that never produces loops leaves the tier-up path untested."],
    v: "Seed a known miscompile into the optimizing tier and confirm the harness reports a mismatch against the interpreter on a generated module within a bounded number of runs.",
    dep: ["interpreter-loop", "optimization-passes", "fuel-metering", "numeric-semantics"]
  },
});
