// Details for the WebAssembly runtime plate, part 3: sandboxing and limits, modules and instances.
ATLAS.details("wasm-runtime", {
  "capability-based-access": {
    s: "A module can reach only the objects the host handed it as handles, so authority comes from what was granted and never from a name or a global namespace.",
    d: "A module starts with no authority. Every file, socket, clock or service it can touch arrives as an import or a handle, and each handle is bound to specific rights. The runtime checks the handle on every call. Granting less is always possible by wrapping an import with a restricted version. This replaces access control lists with plain object references. The difficulty is design discipline: one convenient ambient import, such as a global open-by-path call, destroys the model, and revoking a granted capability needs an indirection built in from the start.",
    k: ["Capabilities passed explicitly vs ambient permission checks by identity: explicit passing is auditable and composable, but programs must be structured around it.", "Revocable capabilities through a proxy vs direct handles: proxies allow revocation, but add a call and a state check to every use."],
    p: ["A host adds a broad convenience import that grants far more authority than the module needed.", "A handle is passed to a second module, which then uses authority the host never meant to extend."],
    v: "Instantiate a module with an empty import set and confirm it can compute but cannot open a file. Add one directory handle and confirm access to exactly that subtree.",
    dep: ["imports-and-exports", "import-restriction", "resource-handles"]
  },
  "import-restriction": {
    s: "The host decides which imports to provide, so a module requesting an ungranted function fails to link instead of gaining access.",
    d: "Linking resolves each import by module name, field name and type. A host can define only the entries it wants and refuse the rest, or supply stubs that always return an error. Scanning a binary's import list before instantiation shows what authority it asks for, which is how a reviewer decides whether to run it. It is hard because import names alone do not describe risk: a general write function may be harmless on a scratch buffer and dangerous on a file.",
    k: ["Failing at link time for unknown imports vs providing trapping stubs: link-time failure is predictable and early, but blocks modules that would only call the import on a rare path.", "Allow-listing by name vs by name and type: adding the type check prevents a mismatched signature being bound to the wrong function."],
    p: ["A stub import that returns zero is treated by the module as success and corrupts data.", "An import allow-list written by name allows a different function of the same name from another module."],
    v: "List a module's imports, provide all but one, and confirm instantiation fails naming that import; then provide a stub with the wrong type and confirm a type mismatch error.",
    dep: ["imports-and-exports", "linker", "module-inspection-tools"]
  },
  "fuel-metering": {
    s: "Charges each executed instruction or block against a budget and traps when the budget runs out, giving a deterministic limit on how much work a module can do.",
    d: "The compiler inserts a counter decrement at loop headers, function entries or every basic block, and a check that traps or yields when the counter reaches zero. The interpreter does the same per instruction. The embedder sets and refills the budget. Because the count is of operations, not time, the same input runs the same number of steps on any machine. It is hard because the checks cost speed, the cost per instruction is approximate, and host calls need separate accounting.",
    k: ["Fuel counted per operation vs wall-clock deadlines: fuel is deterministic and reproducible, but costs runtime in every hot loop.", "Charging at basic-block boundaries vs per instruction: block-level charging is cheaper, but allows slightly more work than the budget before trapping."],
    p: ["A cheap-looking host import does heavy work and is charged almost nothing against the module's fuel.", "Fuel exhausted inside a start function leaves a half-initialized instance that a later call uses."],
    v: "Run an infinite loop with a budget of one million and confirm a fuel-exhausted trap after about a million operations, with the same count on two different machines.",
    dep: ["optimization-passes", "interpreter-loop", "trap-semantics"]
  },
  "epoch-interruption": {
    s: "A cheap deadline mechanism: a host timer advances a shared counter, and compiled code occasionally compares it to a limit and stops when the deadline has passed.",
    d: "Compiled code loads a global epoch value at loop back edges and function entries and compares it with the deadline stored in the store. A host thread increments the epoch on a timer. When the check fails, the guest traps or calls a host hook that can extend the deadline, yield or abort. A load and compare cost far less than a fuel decrement. The tradeoff is nondeterminism: how much work runs before the stop depends on timing, and the check still adds some loop overhead.",
    k: ["Epoch checks vs fuel counting: epochs cost one load and branch with no store, but stopping points depend on wall-clock timing.", "Trap on deadline vs yield to the host: trapping is simple and safe, but yielding lets an embedder time-slice many guests on one thread."],
    p: ["A module spends its time inside a long host call, and the epoch is never checked.", "A very long straight-line function has no back edges to check, so a deadline is missed."],
    v: "Set a 50 ms deadline, run an infinite loop, and confirm the guest stops within a small margin of that time, with the host able to resume or abort it.",
    dep: ["code-emission", "interpreter-loop", "thread-and-stack-management"]
  },
  "memory-and-table-quotas": {
    s: "Host-set caps on how large memories, tables and the whole store may grow, checked on every growth request so a module cannot consume unbounded memory.",
    d: "A limiter object is consulted before any memory.grow, table.grow or new instance. It sees current and requested sizes and can approve, deny or trap. Quotas typically cover per-memory maximum, total across the store, number of instances, tables and elements. A denied growth returns the standard failure value rather than trapping. The difficulty is accounting: reservation of address space is not the same as committed memory, and quotas must count compiled code, metadata and host-side buffers the module indirectly causes.",
    k: ["A limiter callback vs static maximums: a callback lets hosts enforce a pool-wide budget, but runs host code on a hot growth path.", "Failing growth softly vs trapping: soft failure matches the specification and lets modules recover, but poorly written modules may ignore the failure value."],
    p: ["The quota counts only linear memory, while metadata and compiled code grow without bound as modules multiply.", "A module ignores growth failure and later writes past its assumed new size, causing a trap far from the cause."],
    v: "Set a 16 MiB cap, call grow repeatedly in a loop, and confirm growth fails at the cap, total resident memory stays near it, and the module continues to run.",
    dep: ["memory-growth", "tables", "resource-accounting"]
  },
  "stack-overflow-protection": {
    s: "Keeps deep or infinite recursion in a module from crashing the host, by limiting guest stack use and trapping cleanly when the limit is hit.",
    d: "Guest calls use the native stack in compiled code. Each function prologue compares the stack pointer with a limit stored in the store and traps if it is too low, or the stack ends in a guard page and a fault handler produces the trap. The interpreter tracks depth in its own frame list. The limit has to leave room for host calls made from deep inside. It is hard because frame sizes differ by tier, so the same recursion overflows at a different depth depending on which tier runs it.",
    k: ["Explicit prologue checks vs guard-page faults: checks are portable and precise, but cost instructions in every call.", "A separate guest stack vs the native stack: a separate stack makes depth easy to bound, but adds a register and a switch on host calls."],
    p: ["A host import called near the limit has too little stack left and crashes the process.", "Behavior of deep recursion differs between tiers, so tests pass on the interpreter and fail on compiled code."],
    v: "Run an unbounded recursive function and confirm a stack-overflow trap with the host process intact, then call the same function again on the same instance and confirm it still runs.",
    dep: ["hardware-trap-handlers", "thread-and-stack-management", "trap-semantics"]
  },
  "instance-pooling": {
    s: "Preallocates slots for memories, tables and stacks and reuses them across short-lived instances, so creating an instance becomes a cheap reset rather than a series of system calls.",
    d: "A pool reserves a large address range up front, divided into fixed slots, each with its own memory area, table area and stack and guard regions. Creating an instance picks a free slot and maps its initial image; destroying it zeroes or remaps the slot. This avoids repeated mapping and unmapping, which is expensive and serializes on the address space lock. The hard part is sizing: slots must fit the largest allowed instance, and slots left dirty must be wiped completely so one tenant cannot read another's data.",
    k: ["A fixed-size slot pool vs on-demand allocation: pools make instantiation fast and predictable, but waste address space and impose a maximum size.", "Zeroing slots eagerly vs lazily on reuse: eager zeroing is safe and simple, but adds latency on teardown for dirty slots."],
    p: ["A slot is reused without clearing and leaks the previous tenant's data.", "The pool is sized for the average module, and a legitimate large module cannot be loaded."],
    v: "Create and destroy ten thousand instances in a loop, confirm each takes microseconds, and have each write a marker to memory and confirm the next occupant of a slot reads only zeros.",
    dep: ["virtual-memory-reservation", "copy-on-write-initialization", "memory-and-table-quotas"]
  },
  "side-channel-mitigation": {
    s: "Reduces what a module can learn about the host or other tenants through timing, speculative execution and cache effects, using coarse clocks and compiler-inserted barriers.",
    d: "Modules running arbitrary computation can measure time and cache state to read data they should not see. Mitigations include limiting clock resolution, disabling shared memory timers, masking indices after bounds checks so speculation cannot read out of range, and separating sensitive tenants into different processes. Compilers may insert fences or use branchless index clamping at a cost in speed. It is hard because the threat model changes as new hardware effects are found, and every mitigation costs performance.",
    k: ["Process-level isolation per tenant vs software mitigations inside one process: processes give strong separation, but cost more memory and startup per tenant.", "Speculation hardening on every memory access vs only at trust boundaries: hardening everywhere is safest, but can slow memory-heavy code noticeably."],
    p: ["Coarse clocks are defeated by a counter thread in shared memory, which acts as a high-resolution timer.", "Hardening is applied to the optimizing tier but not the baseline tier, leaving a hole during warm-up."],
    v: "Measure a known cache-timing probe from inside a module with mitigations off and on, and confirm the distinguishing signal falls to noise when they are on.",
    dep: ["clocks-and-random", "bounds-checking", "shared-memory-and-threads"]
  },
  "trap-semantics": {
    s: "The defined set of conditions that stop execution immediately and unwind to the host, such as out-of-bounds access, divide by zero, unreachable, and indirect-call type mismatch.",
    d: "A trap is not undefined behavior: the specification lists exactly which instructions can trap and which side effects have already happened. Execution stops with no handler inside the module and control returns to the embedder with a trap kind. Memory written before the trap stays written. Compilers either emit explicit checks or rely on hardware faults converted to traps. The difficulty is precision: optimizations must not reorder side effects across a trap, and every tier must trap in the same cases.",
    k: ["Precise traps vs allowing reordering around them: precise traps make behavior portable, but limit the optimizer's freedom to move loads and stores.", "Explicit check instructions vs hardware faults: explicit checks work anywhere, but hardware faults are free on the success path."],
    p: ["An optimizer hoists a load above a divide that would have trapped, and the module no longer traps where it should.", "A trap leaves globals half-updated, and a host that reuses the instance sees inconsistent state."],
    v: "Run one module that stores a value and then divides by zero on every tier; confirm each tier traps with the same kind and that the stored value is visible afterward.",
    dep: ["numeric-semantics", "hardware-trap-handlers", "bounds-checking"]
  },
  "module-object": {
    s: "The immutable result of decoding and validating a binary: types, function bodies, imports, exports and compiled code, shareable across instances and threads.",
    d: "Creating a module decodes the sections, validates every function, and either compiles it or prepares it for lazy compilation. The module then holds read-only data: the type table, import and export lists, data segments, and machine code. Because it never changes, many instances and threads can share one. It carries a unique identity used for caching. The difficulty is size and lifetime: compiled code can be much larger than the binary, and a module cannot be freed while any instance or running frame still refers to its code.",
    k: ["Eager compile at module creation vs lazy per function: eager gives predictable runtime, but delays the first instantiation; lazy starts quickly but can stall later.", "A module shared across threads vs one per thread: sharing saves memory and compile time, but needs immutable code and thread-safe reference counting."],
    p: ["A module is freed while an instance is mid-call and execution returns into unmapped code.", "Thousands of unique modules accumulate compiled code and exhaust address space."],
    v: "Create one module, instantiate it twice on two threads, and confirm memory use rises by roughly one instance's state, not another full copy of the compiled code.",
    dep: ["validation-algorithm", "binary-decoder", "baseline-compiler"]
  },
  "instance-object": {
    s: "One running copy of a module: its own memories, tables and globals, resolved imports, and the entry points for its exports.",
    d: "An instance is created from a module and a set of imports. It allocates linear memory and tables, initializes globals, copies data and element segments, then runs the start function. Compiled code finds instance state through a context pointer held in a register or the first argument. Instances are isolated: two instances of one module share code, never data. The hard parts are the context layout the compiler depends on, cleanup when instantiation fails partway, and cost when thousands of instances exist.",
    k: ["Instance state behind one context pointer vs separate registers per item: one pointer is compact and easy to pass, but adds a load to reach memory base and length.", "Per-instance memory mapped at creation vs shared copy-on-write pages: copy-on-write shares unmodified data, but adds fault handling cost on first writes."],
    p: ["A failed start function leaves a partially initialized instance that was already registered with the linker.", "Two instances accidentally share a global through a host import, defeating isolation."],
    v: "Instantiate one module twice, increment a global in the first, and confirm the second still reads its initial value while both execute the same compiled function.",
    dep: ["module-object", "linker", "globals", "linear-memory"]
  },
  "imports-and-exports": {
    s: "Typed names a module declares: imports it needs from the host or other modules, and exports it makes available, each a function, memory, table or global.",
    d: "Each import has a module name, field name and an external type. Each export has a name and a kind. Linking checks that every import is satisfied by a value of a matching type, with memories and tables checked for size compatibility. Exports are how the host calls into the guest and how modules link to each other. The difficulty is subtyping and limits: a memory with a larger minimum than the import allows must fail, and with new proposals the rules for matching reference and function types grow.",
    k: ["Name-based imports checked structurally vs numbered imports: names make linking readable and flexible, but allow collisions and require string comparison.", "Exporting memory and tables vs hiding them: exporting makes host access easy, but lets the host or other modules reach and mutate a module's state."],
    p: ["Two imports with the same name and different types are both declared, and the linker binds one value to both.", "A module exports its memory by default, and a host function mutates data the guest assumed private."],
    v: "Instantiate a module whose import expects a function of two integers with a host function of one integer, and confirm a link error naming the import and both types.",
    dep: ["type-section-and-subtyping", "module-object"]
  },
  "linker": {
    s: "Resolves a module's imports against a registry of host definitions and other instances' exports, checks types and builds the import list for instantiation.",
    d: "A linker holds a map from module and field names to values: host functions, memories, tables, globals and exports of earlier instances. Given a module, it walks the imports in order, finds each, checks the type and limits, and returns the import vector. Module linking creates chains of instances that import each other. Convenience features include aliasing, shadowing and default stubs. It is hard because name resolution policy is where capability decisions are made, and because partial failure must not leave half the graph instantiated.",
    k: ["A mutable registry of definitions vs one built immutably for each instantiation: mutable is convenient, but different tenants could see each other's definitions.", "Strict type checking at link vs lazy checking at first call: strict failure is early and clear, but forces every import to exist even if unused."],
    p: ["A shared linker registry lets one module define a name that later modules unexpectedly import.", "Link errors name the missing import but not which module asked for it."],
    v: "Register a host function and an earlier instance's export, link a third module importing both, and confirm instantiation succeeds; removing either definition fails with the import's two-part name.",
    dep: ["imports-and-exports", "module-object", "capability-based-access"]
  },
  "instantiation-and-start": {
    s: "Allocates an instance, initializes globals, tables and memory from segments, then runs the start function, failing atomically if any step traps.",
    d: "The steps happen in a fixed order: evaluate global initializers, allocate memories and tables, write element segments into tables, copy data segments into memory, then call the start function if one exists. Segment writes are bounds checked and trap when they fall outside. The start function may call imports, so it can run arbitrary host code before the host holds the instance. The difficulty is atomicity: a trap partway through must leave no visible effects and release everything allocated, and ordering of segment writes affects results.",
    k: ["Running work in a start function vs requiring an explicit init export: a start function runs automatically, but hides cost and failures inside instantiation.", "Eager data segment copying vs mapping the image copy-on-write: eager copying is simple, but slow for large initial memory."],
    p: ["A start function calls an import that re-enters the guest before instantiation is complete.", "A data segment past the memory end traps after earlier segments already applied, with the old behavior reporting a partial state."],
    v: "Instantiate a module with an out-of-bounds data segment and confirm a trap during instantiation, no instance returned, and no memory or table left registered with the store.",
    dep: ["data-and-element-segments", "globals", "constant-expressions", "instance-object"]
  },
  "globals": {
    s: "Typed variables owned by an instance, immutable or mutable, initialized from constant expressions and optionally imported or exported to share state.",
    d: "A global holds one value of a numeric, vector or reference type, with a mutability flag. Immutable globals fold into code as constants. Mutable ones live in instance memory and are read and written by load and store instructions. Imports and exports let modules and the host share them, including thread-safe shared globals in some proposals. The hard parts are mutable exported globals, which let the host change state the compiler assumed was fixed, and initialization order when globals depend on imported ones.",
    k: ["Immutable by default with explicit mutable opt-in vs all mutable: immutability lets the compiler constant-fold, but forces state into memory for anything that changes.", "Keeping globals in registers across calls vs reloading from the instance: registers are fast, but a call into another module that mutates an exported global then reads stale data."],
    p: ["A compiler caches a mutable exported global in a register across a host call, and the host's change is lost.", "A global initializer referencing a not-yet-initialized import evaluates to zero."],
    v: "Export a mutable global, have the host change it between two calls, and confirm the guest's second call observes the new value on every compiler tier.",
    dep: ["constant-expressions", "imports-and-exports", "instance-object"]
  },
  "data-and-element-segments": {
    s: "Initial contents for memory and tables, stored in the binary and either copied at instantiation (active) or kept to be copied later by instruction (passive).",
    d: "Data segments hold bytes for linear memory; element segments hold function or object references for tables. An active segment names a target and an offset expression and is applied during instantiation. A passive segment is applied only when code runs a bulk copy or init instruction, and can be dropped after use to release memory. This lets large constant tables sit in the binary without occupying memory until needed. The hard parts are bounds checks that trap, and efficient large initialization without copying everything.",
    k: ["Active segments applied at instantiation vs passive segments initialized on demand: active is simple and predictable, but costs time and memory even for data used late.", "Eager copy vs mapping segments directly from the file: mapping starts quickly, but couples memory to the file's lifetime."],
    p: ["A passive segment is used after being dropped and traps unexpectedly in code that worked in testing.", "Large active segments dominate instantiation latency for a short-lived module."],
    v: "Instantiate a module with a one-megabyte data segment and measure initialization time with eager copy and with copy-on-write mapping; both must produce the same bytes at known addresses.",
    dep: ["constant-expressions", "linear-memory", "tables", "bulk-memory-operations"]
  },
  "custom-sections": {
    s: "Named, opaque sections that the runtime ignores for execution but tools use for names, debug information, producers, source maps and application-specific data.",
    d: "Custom sections can appear anywhere between standard sections. The core spec defines no meaning for them, so a decoder skips them after bounds-checking their length. Toolchains agree on conventions for some: names, linking metadata, the producer, target features. Embedders read their own sections to attach policy or metadata to a module. They are hard to manage because they are unvalidated untrusted data, and because stripping or reordering them can break tools that depend on them.",
    k: ["Opaque skipped sections vs defined semantic sections: opaque sections let tooling evolve without engine changes, but give no guarantee of correctness or presence.", "Reading custom sections eagerly vs on request: eager reading makes metadata ready, but spends time on data most runs never use."],
    p: ["A runtime trusts a custom section describing permissions that a module author wrote themselves.", "A custom section with an enormous declared length causes a large allocation before validation."],
    v: "Add a custom section with arbitrary bytes to a valid module and confirm it still validates and runs identically; make its length exceed the file and confirm a decode error.",
    dep: ["section-structure", "decoder-limits"]
  },
});
