// Details for the WebAssembly runtime plate, part 4: memory, tables and extended features.
ATLAS.details("wasm-runtime", {
  "linear-memory": {
    s: "A single contiguous, byte-addressable, growable array that a module reads and writes with loads and stores, addressed by integer offsets and isolated from the host's own memory.",
    d: "Memory is measured in 64 KiB pages with a minimum and optional maximum. Addresses are offsets from a base the module never sees. The runtime keeps the base and current length in the instance, and every access is checked against them. Contents are little-endian, zero-initialized and visible to the host as a byte slice. Because the module controls layout, higher-level languages build their own heaps and stacks inside it. The difficulty is that bounds safety is all the protection there is: bugs inside the module can still corrupt its own data.",
    k: ["One flat memory per module vs typed or segmented memory: a flat byte array maps directly onto existing languages, but gives no protection between objects inside the module.", "Fixed base per instance vs relocatable memory: a fixed base allows cheap addressing, but growth must reserve address space ahead of time."],
    p: ["Memory safety bugs inside the guest remain exploitable within the module, such as overwriting a function table index.", "The host holds a pointer to memory across a call that grows it, and reads from freed pages."],
    v: "Store a known pattern at several offsets, read it back through an export and through the host's view, and confirm identical bytes, then read one byte beyond the end and confirm a trap.",
    dep: ["bounds-checking", "memory-growth", "virtual-memory-reservation"]
  },
  "bounds-checking": {
    s: "The guarantee that every load and store stays inside the memory's current length, enforced either by compiler-emitted comparisons or by reserved address space and page faults.",
    d: "A 32-bit index plus offset can reach about 8 GiB, so a runtime on a 64-bit host can reserve that range per memory and mark everything past the current length inaccessible, turning out-of-range access into a fault with no explicit check. Where reservation is impossible, the compiler emits a compare against the length before each access. Checks may be hoisted or merged when the optimizer proves safety. The challenge is correctness under optimization and speculation, and picking a strategy suited to the host's address space.",
    k: ["Guard-region reservation vs explicit compare and branch: reservation costs nothing per access, but needs large address space and fault handling.", "A check per access vs hoisting checks out of loops: hoisting speeds up loops, but must preserve the exact point of the trap and the side effects before it."],
    p: ["An off-by-one in the effective address computation lets a store land past the end without a fault.", "A speculative access executes before the check resolves and leaks data through the cache."],
    v: "Access the last valid byte, then the first invalid byte, with an offset that overflows 32 bits, and confirm success on the first and traps on the others, on every tier.",
    dep: ["guard-pages", "hardware-trap-handlers", "trap-semantics"]
  },
  "guard-pages": {
    s: "Inaccessible address ranges placed after each memory so that out-of-range accesses fault, letting the runtime skip explicit comparisons on every load and store.",
    d: "The runtime reserves the memory's maximum reach plus the largest possible static offset as address space, commits only the valid portion, and leaves the rest without access permission. A fault handler turns a hit on the guard range into a trap. The same technique protects stacks. It requires a large virtual address space, so it suits 64-bit hosts and fits poorly on constrained devices. Hard parts are the handler's correctness under signals, the page tables' cost when thousands of instances each reserve gigabytes, and avoiding access across the guard through large offsets.",
    k: ["A large guard region vs smaller guards with explicit checks for big offsets: large guards remove nearly all checks, but multiply address space use per instance.", "Reserving the maximum up front vs reserving on growth: up front never moves memory, but wastes address space for small modules."],
    p: ["Reserving several gigabytes per instance exhausts the process's address space at a few thousand instances.", "A guard sized for 32-bit offsets is too small once 64-bit memories are enabled."],
    v: "Allocate a memory, read at the first byte past its end, and confirm a trap rather than a host crash; list the process's mappings and confirm the guard region is present and unreadable.",
    dep: ["virtual-memory-reservation", "hardware-trap-handlers", "linear-memory"]
  },
  "memory-growth": {
    s: "The memory.grow operation that adds pages to a memory up to its maximum, returning the old size or a failure value, and possibly moving the base address.",
    d: "Growth commits more of the reserved range or allocates a larger block and copies, updating the instance's cached base and length. Compiled code that cached the base in a register must reload it after any call that could grow. Growth consults the host's limiter, can fail, and for shared memory must be visible to all threads without moving the base. The difficulty is invalidation: every outstanding host view, and every compiled assumption about the base, must be refreshed, and growth cost with copying scales with memory size.",
    k: ["Reserve then commit vs reallocate and copy on growth: committing in place never moves data, but needs address space reserved up front.", "Caching the base in a register vs reloading each access: caching is faster, but requires reload after every call, which the compiler must track."],
    p: ["Host code retains a view of memory and reads freed pages after the guest grows.", "A module's allocator assumes growth always succeeds and dereferences a null result."],
    v: "Grow memory by one page in a loop until the limit and confirm the return values are the successive old sizes, then a failure value at the limit, with prior contents intact.",
    dep: ["linear-memory", "memory-and-table-quotas", "virtual-memory-reservation"]
  },
  "large-and-multiple-memories": {
    s: "Extensions that allow memories addressed by 64-bit indices, and several memories per module, each with its own limits, so large datasets and separated heaps are possible.",
    d: "Wider addressing lets a module hold more than 4 GiB, but guard-page tricks stop working because the reachable range is too big, so compilers return to explicit checks. Multiple memories let a module keep untrusted or shared data apart, and instructions carry a memory index. Both change the instance layout, since there is no longer one base and length. The hard part is performance on the wider case and keeping every tier's check strategy consistent across both memory kinds.",
    k: ["64-bit addresses with explicit checks vs 32-bit with guard pages: 64-bit reaches large data, but loses the free checks and slows memory-heavy code.", "Several memories vs one memory with partitions: separate memories give hardware-backed isolation between regions, but complicate code generation and instance layout."],
    p: ["A tool assumes memory index zero and miscompiles code addressing another memory.", "Wide memories are enabled and performance drops sharply because every access now carries a comparison."],
    v: "Instantiate a module with two memories, write different values at the same address in each, and confirm each reads back its own; access beyond one memory's end and confirm a trap.",
    dep: ["linear-memory", "bounds-checking", "feature-flags"]
  },
  "tables": {
    s: "Typed arrays of function or object references that code reaches only by index, so references are never raw addresses and cannot be forged or altered.",
    d: "A table stores references, null, or host objects, indexed by integer. Instructions get, set, grow, fill and copy entries. Indirect calls look up a function in a table and call it. Because code cannot read a function's address, control flow stays inside what the module put in the table. Runtimes store a pointer plus a type tag per entry for fast calls. The hard parts are keeping those tags consistent when the table is mutated, shared between modules, and sized under quotas.",
    k: ["Entries holding code pointer plus signature tag vs a lookup on each call: inline tags make calls fast, but double the per-entry size.", "Tables mutable at runtime vs read-only after init: mutable tables enable dynamic linking, but make control flow harder to analyze."],
    p: ["Growing a table moves its storage while compiled code holds the old base.", "A table entry is set from another instance and keeps that instance alive indefinitely."],
    v: "Fill a table with two functions of different types, call each by index with the correct signature, and confirm a call with the wrong signature traps while out-of-range indices also trap.",
    dep: ["indirect-calls", "memory-and-table-quotas", "data-and-element-segments"]
  },
  "indirect-calls": {
    s: "Calls through a table index with a runtime type check, so a computed call can only reach functions whose signature matches what the caller expected.",
    d: "The caller supplies a table index and an expected function type. The runtime loads the entry, checks it is non-null and that its type matches, then jumps to it. Type comparison is by canonical type identity, so the check is a single word compare. Failure traps. This gives control-flow integrity: attacker-chosen indices can only reach functions of the right type. The hard parts are keeping type identity canonical across modules, supporting subtyping, and the cost of the check on hot dispatch paths.",
    k: ["Structural type identity via canonical ids vs nominal types: structural ids allow cross-module calls, but require a global registry to canonicalize.", "Checking on every call vs eliding checks when the table is provably typed: elision is faster, but needs whole-program knowledge that modules rarely have."],
    p: ["Two modules assign different identities to the same signature, and calls between them trap spuriously.", "A null table entry is called and traps with an error that does not say which index."],
    v: "Call an entry with the matching signature and confirm the result, then call one with a mismatched signature and a null entry, and confirm distinct trap kinds for each.",
    dep: ["tables", "type-section-and-subtyping", "trap-semantics", "calling-conventions"]
  },
  "bulk-memory-operations": {
    s: "Instructions that copy, fill and initialize large regions of memory or tables in one step, with bounds checks done once for the whole range.",
    d: "memory.copy, memory.fill, memory.init and their table equivalents operate on a range, trapping if any part is out of bounds and applying nothing in that case. Overlapping copies behave as if the source were first copied aside. Runtimes implement them with optimized host routines rather than instruction loops, giving near-native speed. They also allow passive segments to be used on demand. The hard parts are atomicity of the trap and the interaction with shared memory, where a copy is not atomic with respect to other threads.",
    k: ["Single instruction with one range check vs a loop of byte operations: one instruction is much faster, but must define precisely what happens on a partial overrun.", "Calling an optimized host routine vs inline code: the host routine handles large copies well, but costs a call for tiny ones."],
    p: ["A copy that overruns writes the part before the bound and then traps, contradicting the all-or-nothing rule.", "A copy racing with another thread's write produces a mix that neither thread expected."],
    v: "Copy a region onto an overlapping region of itself and confirm the result equals copying through a temporary; copy a range extending one byte past the end and confirm a trap with no bytes changed.",
    dep: ["linear-memory", "bounds-checking", "data-and-element-segments"]
  },
  "copy-on-write-initialization": {
    s: "Maps a module's initial memory image from a file or cache and shares pages until written, so instances start fast and unmodified data costs no extra memory.",
    d: "At module creation the runtime pre-builds an image of the memory after data segments are applied. Creating an instance maps that image privately, so reads share the same physical pages and the first write to a page copies it. Instantiation cost becomes a few mapping calls instead of copying megabytes. This helps with serverless workloads that start many instances of one module. It is hard because it ties memory to the operating system's mapping behavior, and page faults on first write add unpredictable latency.",
    k: ["Private mapping of a prebuilt image vs copying segments into fresh memory: mapping starts quickly and shares memory, but first writes pay a fault.", "Resetting an instance by remapping the image vs creating a new one: remapping reuses the slot cheaply, but must ensure no state leaks through."],
    p: ["Pages that look clean are shared with another instance's dirty data after a faulty reset.", "A file-backed image is modified on disk while instances still map it."],
    v: "Start a thousand instances of a module with a 64 MiB initial image and confirm resident memory stays near one image plus per-instance dirty pages, and startup is far faster than copying.",
    dep: ["data-and-element-segments", "instance-pooling", "virtual-memory-reservation"]
  },
  "shared-memory-and-threads": {
    s: "Memories that several instances on different host threads can access at once, enabling parallel programs inside the sandbox under a defined memory model.",
    d: "A shared memory has a fixed maximum and is backed by memory every thread can see, with growth visible to all but never moving the base. The runtime provides no thread creation instruction: the host spawns threads, each running its own instance that imports the same memory. The memory model defines which interleavings are legal for atomic and non-atomic accesses. Hard parts include data races that are defined but not synchronized, host-side coordination, and the timer capability shared memory gives to attackers.",
    k: ["Host-created threads sharing a memory vs a built-in thread spawn instruction: host-created threads keep the engine simple, but leave thread lifecycle to each embedder.", "A fixed maximum size vs unlimited growth: a fixed maximum lets the base never move, but forces guessing the size at creation."],
    p: ["A non-atomic access races with a write and the module sees a torn value, which the model allows.", "Shared memory enables a high-resolution timer thread, undermining coarse clock defenses."],
    v: "Start four threads incrementing a shared counter with atomic adds a million times each, and confirm the final value is exactly four million on every tier.",
    dep: ["linear-memory", "atomic-operations", "thread-and-stack-management", "side-channel-mitigation"]
  },
  "atomic-operations": {
    s: "Indivisible read-modify-write and compare-exchange operations on shared memory, with sequentially consistent ordering, for building locks and lock-free structures.",
    d: "Atomic loads, stores, add, and, or, xor, exchange and compare-exchange act on aligned integers and are totally ordered. Compilers map them onto the host's atomic instructions or fall back to library calls where a width is unsupported. Misaligned atomic access traps. A fence instruction orders other accesses. The hard parts are mapping a single strong ordering onto weakly ordered hardware without too much cost, and ensuring optimizers do not reorder or merge atomics, which would break synchronization.",
    k: ["Sequential consistency only vs multiple ordering levels: one level is simple to reason about, but costs more on hardware with weak ordering.", "Trapping on misaligned atomics vs allowing them: trapping avoids split accesses that are not atomic, but rejects some legal-looking compiler output."],
    p: ["An optimizer treats an atomic load as a plain load and hoists it out of a spin loop, hanging the thread.", "A compare-exchange on a 64-bit value is unsupported on the target and emitted as two non-atomic steps."],
    v: "Run a lock built on compare-exchange across threads protecting a non-atomic counter, and confirm the counter is exact after many iterations on every tier and host architecture available.",
    dep: ["shared-memory-and-threads", "instruction-selection", "cpu-feature-detection"]
  },
  "wait-and-notify": {
    s: "Instructions that block a thread until a memory location changes (wait) and wake blocked threads (notify), providing the primitive for locks and condition variables without busy waiting.",
    d: "wait takes an address, an expected value and a timeout; if the value matches it parks the thread until notified or timed out, returning which happened. notify wakes up to a count of threads parked at an address. The runtime keeps a table of parked threads per address and implements parking with host primitives. Wait is not allowed on a main thread that must stay responsive. Hard parts are lost wakeups if the check and park are not atomic, fairness, and timeouts across hosts.",
    k: ["Blocking wait on memory addresses vs host-provided synchronization objects: address-based waits need no extra objects, but require a parking table keyed by address.", "Disallowing wait on interactive threads vs allowing it: disallowing protects responsiveness, but forces awkward workarounds in ported code."],
    p: ["A notify runs between the value check and the park, and the waiter sleeps forever.", "A thread waits with an infinite timeout while its notifier traps, leaving it hung."],
    v: "Park a thread on an address, notify it from another, and confirm it returns promptly with a woken result; wait with a short timeout and confirm a timed-out result.",
    dep: ["atomic-operations", "shared-memory-and-threads", "thread-and-stack-management"]
  },
  "simd": {
    s: "A 128-bit vector type and instructions that operate on packed lanes of integers or floats, letting compilers use the host's vector units for data-parallel work.",
    d: "Vector instructions add, multiply, compare, shuffle, convert and select lanes of 8, 16, 32 or 64 bits. Engines map them to host vector instructions, with a scalar fallback when none exist. Most operations have identical results on all hosts. Some relaxed variants allow host-dependent results for speed. It is hard because hosts differ in shuffles and conversions, the fallback is far slower, and the validator, interpreter and every compiler tier must support the same large instruction set.",
    k: ["Fixed-width 128-bit vectors vs hardware-width vectors: fixed width is portable and predictable, but leaves wider hardware units underused.", "Strictly deterministic operations vs relaxed variants: determinism gives the same result everywhere, but relaxed operations map to faster single instructions."],
    p: ["The runtime runs on a host without vector hardware and falls back to scalar code that is much slower than expected.", "A relaxed operation gives different results on two hosts and breaks a replicated computation."],
    v: "Run a vectorized dot product against a scalar version on large input, and confirm identical results and a speedup on a host with vector support.",
    dep: ["cpu-feature-detection", "instruction-selection", "feature-flags"]
  },
  "garbage-collected-references": {
    s: "Typed references to structs and arrays allocated in a runtime-managed heap, so languages with their own objects can compile to the format without shipping a collector.",
    d: "The proposal adds struct and array types, reference types with nullability, subtyping, casts and tests, and instructions to allocate and access fields. References are opaque: a module cannot read their bits or the heap layout. A collector in the runtime reclaims unreachable objects. Type safety on field access is enforced by validation, so no runtime checks beyond casts are needed. It is hard because the validator needs subtyping, the engine needs a collector and object layout, and it interacts with every other component.",
    k: ["Engine-managed heap with typed objects vs modules shipping their own collectors in linear memory: engine-managed heaps share the host's collector and cooperate with host objects, but fix the object model.", "Structural subtyping with canonical types vs nominal: structural allows cross-module use, but costs canonicalization work at link time."],
    p: ["A cast from a supertype checks the wrong type identity across modules and traps spuriously.", "A reference cycle between the guest heap and a host object is never collected."],
    v: "Allocate a million short-lived structs in a loop and confirm memory use stays bounded while a retained struct's fields remain readable after collections.",
    dep: ["gc-heap-and-collector", "type-section-and-subtyping", "tables"]
  },
  "gc-heap-and-collector": {
    s: "The runtime's own managed heap for guest objects, with allocation, root finding and a collector that reclaims unreachable structs and arrays.",
    d: "Allocation is usually a bump pointer in a young region with generational or mark-sweep collection behind it. Roots include globals, tables, locals on the guest stack and host handles. Compiled code must tell the collector where references live in each frame through stack maps. It must also cooperate on safe points and write barriers. Hard parts are precise stack maps in optimized code, pauses, and cycles that cross into host-owned objects the collector cannot see.",
    k: ["Generational copying vs non-moving mark-sweep: copying gives fast allocation and compaction, but moves objects, which complicates host references.", "Stack maps at every call vs conservative stack scanning: precise maps are exact, but burden every compiler tier, while conservative scanning is simple and may retain garbage."],
    p: ["A missing stack map entry in optimized code lets a live object be freed.", "A long collection pause blocks a latency-sensitive request."],
    v: "Allocate objects in a loop that creates garbage, confirm collections run and the heap size plateaus, and verify all retained objects keep their contents across collections on every tier.",
    dep: ["code-emission", "thread-and-stack-management", "host-allocator"]
  },
  "exception-handling": {
    s: "Structured throw and catch of typed exceptions inside a module, with unwinding that runs cleanup and crosses function boundaries without being a trap.",
    d: "A tag declares an exception type with payload values. throw creates an exception with a tag; try blocks list handlers that match tags, and the runtime unwinds frames to the nearest match, passing the payload. Languages with exceptions use it directly instead of emulating it with checks after every call. Implementations use unwind tables or explicit landing pads. It is hard because compilers must keep tables correct through optimization, and exceptions that cross the host boundary need defined conversion.",
    k: ["Native exception support with tables vs emulation through return codes: native support makes the normal path free, but needs unwinding in every tier.", "Catching all exceptions inside a module vs letting them reach the host: containing them keeps modules self-contained, but hides failures from embedders."],
    p: ["An exception escapes through a host frame and corrupts the host's own unwinding state.", "The unwind table for an optimized function omits a call site and the exception skips its handler."],
    v: "Throw an exception with a payload from three frames deep, catch it in the outer function, and confirm the payload value and that cleanup code in the middle frames ran once.",
    dep: ["stack-trace-capture", "type-section-and-subtyping", "control-flow-validation"]
  },
  "tail-calls": {
    s: "Return-call instructions that replace the current frame with the callee's, so deep tail recursion and continuation-passing code run in constant stack space.",
    d: "A tail call reuses the caller's frame: the arguments are moved into place and control jumps rather than calls. The validator checks the callee's results match the caller's. Compilers must handle callees needing more argument space than the caller had, which may require shuffling stack arguments. Indirect forms exist too. It is hard because it constrains the calling convention, clashes with some stack-trace and debugging expectations, and costs more on hosts with fewer argument registers.",
    k: ["Guaranteed tail calls vs optional optimization: a guarantee supports functional languages, but fixes a calling convention across tiers.", "Dropping the caller from stack traces vs keeping a marker: dropping saves stack, but makes debugging tail-recursive code harder."],
    p: ["A callee needing more stack arguments than the caller overflows the replaced frame.", "A backtrace shows a missing frame and misleads a developer."],
    v: "Run a mutually tail-recursive pair a hundred million deep and confirm no stack overflow and constant memory use, on every tier.",
    dep: ["calling-conventions", "control-flow-validation", "stack-overflow-protection"]
  },
  "feature-flags": {
    s: "Per-proposal switches that decide which instructions and types a runtime accepts, so modules using unfinished or risky features are rejected at validation time.",
    d: "Each proposal has a flag checked by the decoder and validator. A disabled feature makes its opcodes and types invalid, so the module fails before reaching any compiler tier. Toolchains record the features a module needs, and embedders compare them with what they allow. Flags change compiled code and cache keys. The difficulty is combinations: features interact, such as threads with multiple memories, and a flag enabled in the validator but not in every tier produces modules that load and then fail.",
    k: ["Validator-level enforcement vs relying on the compiler to refuse: validator checks fail early and consistently, but must be kept in step with every tier.", "Few stable bundles of features vs fully independent flags: bundles are easy to test, but force embedders to take features they do not want."],
    p: ["A flag is enabled in the validator but the baseline tier lacks the instruction and traps at run time.", "A cache keyed without feature flags serves code compiled for different settings."],
    v: "Validate the same module with a feature off and on, and confirm rejection with a message naming the feature, then successful execution on every tier once enabled.",
    dep: ["validation-algorithm", "engine-configuration"]
  },
  "stack-switching": {
    s: "Instructions to create, suspend and resume separate guest stacks, giving coroutines, generators and lightweight threads without a host thread per task.",
    d: "A continuation is a first-class reference to a suspended stack. The module creates one from a function, resumes it, and inside it can suspend with a tag, returning control and a value to the resumer. The engine allocates small stacks, switches the stack pointer and saves minimal state. Languages implement async functions, generators and green threads this way. It is hard because stacks need cheap allocation, the garbage collector and unwinder must walk suspended stacks, and trapping across a switch needs defined behavior.",
    k: ["Separate stacks switched by the engine vs transforming code into state machines: engine switching preserves natural code, but needs stack memory and engine support in every tier.", "One-shot continuations vs multi-shot: one-shot is cheap and safe, but cannot express backtracking."],
    p: ["Thousands of suspended stacks each reserve large memory and exhaust the quota.", "A suspended stack holds a borrowed resource that its owner frees before resume."],
    v: "Create a generator yielding a million values through suspend and resume, and confirm values arrive in order with memory use bounded by one stack.",
    dep: ["thread-and-stack-management", "calling-conventions", "exception-handling"]
  },
});
