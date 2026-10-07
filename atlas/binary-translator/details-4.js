// Details for the binary translator plate, part 4: memory, floating point and SIMD, host services, cross-cutting concerns.
ATLAS.details("binary-translator", {
  "address-translation": {
    s: "Converts each guest memory address into a host address for every load and store, either by a fixed offset or through a software table.",
    d: "In the cheapest scheme the guest address space is a contiguous region of the host's, so translation is one addition, or none if the guest is mapped at the same addresses. Otherwise a software page table maps guest pages to host pages and each access performs a lookup, with a small cache of recent translations. Checks for permission and alignment are added where the host's own faults would not match the guest's. It is hard because the translation sits on every memory access, the hottest path in the system, and must still produce the guest's exact faults.",
    k: ["Direct offset mapping vs software page table: direct is nearly free and requires reserving the guest range; a table is flexible about layout and slows every access.", "Rely on host faults for bad addresses vs explicit bounds checks: faults make good accesses free and need exact fault mapping; checks are portable and cost per access."],
    p: ["A guest address above the offset-mapped range wraps into translator memory instead of faulting.", "A software cache of translations not flushed on unmap lets accesses reach pages the guest unmapped."],
    v: "Access the first and last bytes of every guest mapping and one byte beyond each, from guest code, and confirm valid accesses succeed and invalid ones fault with the correct address.",
    dep: ["address-space-mapping","host-fault-handler"]
  },
  "address-space-mapping": {
    s: "Keeps the guest's view of mappings, such as allocations, file maps and protections, in step with host mappings made on its behalf.",
    d: "When the guest allocates, maps files, changes protections or frees memory, the translator performs the corresponding host operation at the translated address and updates its own table of guest regions. Granularity mismatches are handled here: a request for a guest page may need several host pages, or part of one. The table also serves the loader, fault handler and code tracking. It is hard because the guest sees only its own map, the translator must protect its private regions from guest calls, and the host may refuse placements that the guest requested.",
    k: ["Maintain a translator-side region table vs query the host: a table is fast and consistent and needs updating on every map change; querying is always current and slow and may expose translator regions.", "Honor fixed-address requests literally vs relocate when blocked: literal is faithful and fails when the host is in the way; relocating works and breaks programs that assumed the address."],
    p: ["A guest unmap of a range that includes translator-reserved pages tears down the cache.", "The table drifts from the host after a failed partial operation."],
    v: "Map, split, protect and unmap regions at awkward sizes and offsets from the guest and compare the guest-visible map and the host's actual mappings after each step for exact agreement.",
    dep: ["guest-address-space-layout","host-system-layer","page-size-reconciliation"]
  },
  "memory-ordering-bridge": {
    s: "Preserves the guest's rules about the order in which memory operations become visible to other processors when the host's rules are weaker or different.",
    d: "A guest with strong ordering assumes loads and stores appear to other threads in program order, or nearly so. A host with weaker ordering may reorder them, so translated code needs barriers, ordered loads and stores, or a host mode that provides stronger ordering. The reverse case is easier. Optimizations that reorder or merge accesses must respect the same rules. It is hard because barriers on every access are slow, but omitting them produces rare, timing-dependent errors that tests seldom reveal.",
    k: ["Barriers around every access vs ordered access instructions vs a host strong-ordering mode: barriers are portable and slow; ordered instructions are cheaper where available; a hardware mode is nearly free and not present everywhere.", "Order all accesses vs analyze which can be private: all accesses is safe and expensive; analysis speeds stack and private data and risks errors from wrong sharing assumptions."],
    p: ["A missing barrier between a data write and a flag write lets another thread see the flag before the data, once in a million runs.", "Optimizing away a barrier pair believed redundant breaks a lock-free queue."],
    v: "Run ordering litmus tests tens of millions of times on the weakest host and confirm no forbidden outcome, then remove the translation's barriers and confirm the forbidden outcome does appear.",
    dep: ["atomic-translation","host-feature-detection","load-store-optimization"]
  },
  "atomic-translation": {
    s: "Translates the guest's atomic read-modify-write and compare-and-swap operations into host operations that are equally indivisible and equally ordered.",
    d: "Guest atomic instructions come in forms such as exchange, add, compare-and-swap, and in some instruction sets locked prefixes on ordinary instructions. The host may provide direct equivalents, or only a load-reserve and store-conditional pair that must be wrapped in a retry loop. Width and alignment rules differ, and accesses crossing a cache line may need special handling. It is hard because loop-based emulation changes failure behavior, a contended retry loop may fail spuriously, and a mismatch in strength lets other threads see states the guest forbids.",
    k: ["Native host atomics vs retry loops from reserve and conditional store: native is smaller and faster where available; loops work on any host and risk livelock and spurious failure.", "Use the host's strongest ordering for every atomic vs the minimum: strongest is safe and slower; minimum is faster and needs accurate understanding of the guest ordering."],
    p: ["A compare-and-swap loop retried indefinitely because an unrelated memory access between reserve and store clears the reservation.", "An atomic crossing a cache line is split into two accesses and loses atomicity."],
    v: "Have sixteen threads increment a shared counter one hundred million times total with atomics and confirm the final total is exact, including with counters aligned across a line boundary.",
    dep: ["memory-ordering-bridge","unaligned-access-handling","host-feature-detection"]
  },
  "unaligned-access-handling": {
    s: "Makes loads and stores that are not naturally aligned behave as the guest expects, when the host traps, splits or slows them.",
    d: "Some guests allow any alignment for ordinary accesses; some hosts fault, silently split, or lose atomicity on them. The translator may emit plain accesses when the host allows, emit byte sequences, or test alignment at run time and take a slow path. Accesses that cross a page boundary may need the two pages' permissions checked separately. It is hard because a test on every access is costly, while assuming alignment breaks programs that are packed or parse binary formats.",
    k: ["Assume aligned and recover from the fault vs check every access: recovery makes aligned code free and each unaligned access very expensive; checking costs a little always and bounds the worst case.", "Retranslate sites that fault vs always handle: retranslation adapts to actual behavior and adds machinery; always handling is simple and slower."],
    p: ["A page-crossing access where only the second page is protected faults with the wrong address.", "A shared flag stored unaligned loses atomicity on a host that splits the access."],
    v: "Read and write every width at every offset around a page boundary, including with the second page unmapped, and confirm values and faults match the reference.",
    dep: ["address-translation","fault-address-mapping","host-fault-handler"]
  },
  "byte-order-conversion": {
    s: "Reverses byte order for guest memory accesses when the guest and host store multi-byte values differently.",
    d: "If guest and host agree on byte order, nothing is needed. If they differ, every multi-byte load and store is combined with a byte swap, or guest memory is stored in the guest's order and swapped on each access. Instruction fetch is affected too, since instruction words are read in the guest's order. Vector and floating point loads need lane-aware swapping. It is hard because the swap must apply to exactly the right widths, and because data crossing the boundary to the host, in system calls and thunks, must be swapped again.",
    k: ["Swap on every access vs store the host's order inside translator-managed structures: swap on every access is simple and costs instructions; converting data at boundaries is faster inside and error-prone at the boundaries.", "Use host byte-swap instructions vs shift sequences: host instructions are one operation; shifts work everywhere and are slower."],
    p: ["A structure passed to a system call is converted for some fields and not for others.", "Vector loads swapped as whole registers instead of per lane scramble element order."],
    v: "Store and load known patterns at every width, scalar and vector, and compare the bytes in memory and the register values with the reference on a real guest machine.",
    dep: ["address-translation","struct-layout-conversion","simd-lane-mapping"]
  },
  "page-size-reconciliation": {
    s: "Handles differing page sizes between guest and host, so guest mappings, protections and file offsets behave at the granularity the guest expects.",
    d: "If the host's pages are larger than the guest's, a guest mapping or protection change of a small region cannot be applied alone. The translator may round up, keep several guest pages in one host page and emulate finer permissions in software, or restrict the guest layout. Smaller host pages are simpler. File mappings need offsets that the host can honor. It is hard because rounding changes what the guest can observe, such as the size of mapped file content and the effect of protecting one page.",
    k: ["Round guest requests up to host pages vs emulate fine-grained permissions: rounding is simple and wrong for protection and guard pages; emulation is exact with software checks on accesses.", "Run the host with matching page size vs adapt: matching removes the problem where possible and limits where the translator can run."],
    p: ["A guard page one guest page long is rounded to a host page, which covers adjacent valid data.", "A file mapping at an offset not host-aligned fails, though valid for the guest."],
    v: "Create a guard page between two guest buffers and confirm access to the guard faults while access to neighbors succeeds, on a host with larger pages.",
    dep: ["address-space-mapping","permission-mirroring"]
  },
  "permission-mirroring": {
    s: "Keeps the guest's page permissions and the host's real page protections consistent, while allowing the translator its own extra protections.",
    d: "The guest sets read, write and execute permissions through its system calls. The translator records them in its region table and sets host protections accordingly, with exceptions: code pages tracked for modification are read-only on the host even if writable to the guest; executable guest data may need to be readable for translation. A fault is classified by comparing the host cause against the guest's recorded permission. It is hard because host and guest rules differ on combinations such as write-without-read, and because the translator's own protections must stay invisible.",
    k: ["Record guest permissions separately from host protections vs deriving one from the other: separate records give precision and double bookkeeping; deriving is compact and cannot represent translator-only protections.", "Make guest-executable pages readable for the translator vs copy them: readable avoids copies and exposes data; copying isolates and adds cost."],
    p: ["A page the guest made non-writable but the translator set read-only for code tracking hides the real cause of a later fault.", "Execute permission granted to the guest by default allows data pages to be translated."],
    v: "Change permissions through every combination from guest code, attempt each access type, and confirm the fault or success matches the guest's expectation and the reference.",
    dep: ["address-space-mapping","host-system-layer","host-fault-handler"]
  },
  "fp-semantics-emulation": {
    s: "Makes floating point operations produce bit-identical results to the guest's, including operations the host implements slightly differently.",
    d: "Basic operations such as add and multiply on standard formats match across modern hosts. Differences appear in fused operations, reciprocal and square-root estimates, conversion edge cases, and operations with unusual rules about which operand a NaN result takes. The translator emits host instructions where results are identical, and sequences or helper calls where not. It is hard because guest programs, notably numerical and scientific ones, depend on exact results, and because estimate instructions are implemented differently by every hardware generation.",
    k: ["Native host instructions where identical vs software for everything: native is fast and requires careful classification of which operations match; software is always exact and many times slower.", "Reproduce vendor-specific estimate tables vs use accurate results: reproducing keeps bit-for-bit compatibility; accurate results are better numerically and differ from the guest."],
    p: ["A fused multiply-add replaced by a separate multiply and add changes the final rounding in results.", "Estimate instructions that return different low bits produce different outputs after iteration."],
    v: "Run a large set of operations on edge-case inputs and compare each result bit for bit with real guest hardware, including conversions and estimate instructions.",
    dep: ["rounding-and-exception-flags","nan-denormal-handling","soft-float-fallback"]
  },
  "rounding-and-exception-flags": {
    s: "Reproduces the guest's rounding modes and floating point status flags, such as inexact and overflow, across translated operations.",
    d: "The guest sets a rounding mode in a control register and expects it to apply to following operations, then reads accumulated status flags. The host has its own modes and flags. The translator mirrors the guest's control state into the host's, or emulates modes in software when they differ, and merges host status flags into the guest register on request. Unmasked exceptions must trap precisely. It is hard because mode and flags are global, per-thread state read and changed rarely and across blocks, and because switching host mode on every operation is slow.",
    k: ["Mirror the guest mode into the host mode vs explicit rounding per operation: mirroring is free in steady state and needs sync on writes and calls; explicit rounding is local and slow.", "Collect flags lazily vs after every operation: lazy is cheap and needs a safe point to merge; per operation is exact and expensive."],
    p: ["A host mode left changed by a helper call makes later guest operations round incorrectly.", "Flags read before being merged return empty status after operations that should have set them."],
    v: "Set each rounding mode, run a set of inexact operations, read the status flags and compare modes and flags with real guest hardware, including after a call into a helper.",
    dep: ["fp-semantics-emulation","special-registers","guest-context"]
  },
  "extended-precision-emulation": {
    s: "Emulates wider-than-standard floating point formats and stack-based register models that the host does not have.",
    d: "Some guest instruction sets include an extended-precision format with 80-bit values and a register stack with top-of-stack tracking and tag words. Hosts usually lack both. The translator emulates the format in software or with paired values, tracks the stack pointer at translation time where it can, and materializes the tag word on demand. It is hard because this model carries precision state, a control word, and exception semantics that programs, particularly older ones, still use, and every operation costs many host instructions.",
    k: ["Software extended format vs map to double precision: software is exact and slow; double precision is fast and gives different results for code relying on the extra bits.", "Track stack top at translation time vs at run time: translation time is fast when stack depth is statically known and falls back when not; run time is always correct and slower."],
    p: ["Mapping to double precision gives results that differ in the last bits, breaking tests that compare to stored outputs.", "Stack overflow and underflow conditions that should produce special values are silently ignored."],
    v: "Run a set of extended-precision computations including stack overflow, underflow and precision control changes and compare each result and status word with real guest hardware.",
    dep: ["fp-semantics-emulation","soft-float-fallback","guest-context"]
  },
  "simd-lane-mapping": {
    s: "Maps the guest's vector operations and register layout onto the host's vector instructions, lane by lane.",
    d: "Vector instruction sets differ in register widths, element orderings, saturation rules, shuffles and reductions. The translator matches each guest vector instruction to one host instruction when semantics agree, or a short sequence otherwise, and keeps guest vector registers in host vector registers. Shuffle and permute instructions are the hardest, since few hosts have the same shuffle model. It is hard because there are hundreds of vector instructions with many element types and because subtle rules, such as how lanes are zeroed or how scalar operations preserve upper lanes, are easy to get wrong.",
    k: ["Direct one-to-one mapping where possible vs always through a common vector IR: direct is fast and needs per-instruction knowledge; an IR is uniform and loses host-specific forms.", "Expand to scalar code for unmatched operations vs call helpers: expansion is inline and bloats; helpers are compact and slow."],
    p: ["Upper lanes of a destination register left unchanged when the guest zeroes them, or the reverse.", "Saturating arithmetic mapped to a host instruction with different rounding gives off-by-one results."],
    v: "Test each vector instruction on random and boundary lane values and compare all lanes of the destination with real guest hardware, including partial-register and zeroing behavior.",
    dep: ["vector-width-mismatch","byte-order-conversion","register-mapping"]
  },
  "vector-width-mismatch": {
    s: "Handles guest vector registers wider or narrower than the host's, by splitting, combining or masking operations.",
    d: "If the guest has wider vectors than the host, each operation becomes two or more host operations on halves, and guest registers occupy several host registers. If the guest is narrower, the translator wastes host width and must keep upper parts defined. Operations across lanes, such as shuffles and reductions, are harder when split. It is hard because register pressure doubles, because cross-lane operations need extra data movement, and because masks and predicates in newer vector models need emulation.",
    k: ["Split wide operations into halves vs emulate with scalar loops: halves keep vector speed and need cross-half handling; scalar loops are simple and much slower.", "Advertise a narrower vector feature set to the guest vs support the widest: narrower avoids the problem and loses speed in programs that would use wide vectors; widest supports all and costs performance."],
    p: ["A cross-lane shuffle implemented on halves independently gives wrong results.", "Lane masks lost when an operation is split, so inactive lanes are modified."],
    v: "Run vector kernels with wide registers on a narrow host and compare all lanes with a reference, including cross-lane operations and masked operations.",
    dep: ["simd-lane-mapping","host-feature-detection","register-allocator"]
  },
  "nan-denormal-handling": {
    s: "Matches the guest's treatment of not-a-number values and very small numbers, which differs in which NaN payload is returned and whether small values flush to zero.",
    d: "When an operation receives a NaN, the guest rules say which operand's payload propagates and whether a default NaN is produced. Hosts differ, so the result bits may differ even when both are NaN. Denormal handling has control bits for flush-to-zero and denormals-are-zero that change results and speed. The translator inserts fixups or sets host modes. It is hard because tests on NaN payloads are rare and programs seldom depend on them until a hash or checksum over floating point data does.",
    k: ["Fix up NaN results after every operation vs trust the host: fixing is exact and costs a check per operation; trusting is free and differs in payload bits.", "Set host flush modes to match vs emulate: setting is cheap and global; emulating is selective and slow."],
    p: ["A checksum over floating point output differs because a NaN payload differs.", "A flush-to-zero mode left on in a helper changes unrelated results."],
    v: "Feed NaNs with distinct payloads and denormal values through each operation in each mode and compare the result bits with real guest hardware.",
    dep: ["fp-semantics-emulation","rounding-and-exception-flags"]
  },
  "soft-float-fallback": {
    s: "A software implementation of floating point operations used when the host's instructions cannot give the guest's exact results.",
    d: "The fallback implements the operation on integer values following the guest's specification, covering every rounding mode, special value and flag effect. It is called as a helper from generated code when the fast path's checks say the inputs are unusual, or always for operations with no host match. It is the exactness backstop and the reference for tests. It is slow, often fifty times slower than hardware, so the translator aims to reach it rarely. It is hard because the implementation must itself be verified to match real hardware.",
    k: ["Fast path with fallback on special inputs vs always software: fast path keeps common cases quick and needs reliable detection of unusual inputs; always software is simple and slow.", "Own implementation vs a library: own gives control of guest quirks; a library saves effort and may not match the guest's rules."],
    p: ["The fast-path check misses one class of inputs, so some results are quietly wrong.", "The software path has different flag behavior from the hardware path, so results change with the input value."],
    v: "Compare the fallback against real guest hardware on a large input set, and compare the fast path with fallback on the same inputs, confirming bit-identical results and flags.",
    dep: ["fp-semantics-emulation","helper-call-interface"]
  },
  "executable-memory-manager": {
    s: "Allocates and manages the memory regions that hold generated code, with the permissions and placement the host requires.",
    d: "The manager reserves address space for the translation cache, commits it as needed, and sets permissions for writing and execution. It places code near the dispatcher so short relative jumps can reach, and may keep separate regions for cold and hot code. Hosts differ on whether memory may be writable and executable together, so it supports toggling. It is hard because hosts restrict executable memory for security, because jump reach limits constrain placement, and because freeing and reusing code memory while threads run needs care.",
    k: ["One large reservation up front vs growing regions: one reservation keeps all code in jump range and needs virtual space; growth is flexible and risks far-away jumps.", "Dual-mapped memory (one writable view, one executable view) vs toggling permissions: dual mapping avoids toggling cost and doubles address use; toggling is simple and needs synchronization."],
    p: ["Memory allocated further than the jump reach of the dispatcher forces long indirect jumps everywhere.", "Code memory freed while another thread is still running in it crashes at once."],
    v: "Allocate, fill, run and free code regions repeatedly from several threads and confirm all code runs, permissions are never both writable and executable where the host forbids it, and freed memory is not executed.",
    dep: ["host-system-layer","write-execute-transitions"]
  },
  "write-execute-transitions": {
    s: "Switches generated-code memory between writable and executable, or uses dual mappings, so that code can be emitted and patched under a policy that forbids both at once.",
    d: "Hosts with strict policies require that a page is writable or executable, not both. The translator toggles protection around emission and patching, or writes through a second mapping of the same memory. Toggling affects all threads, since the page becomes unexecutable while writable, so threads must avoid it or the translator must serialize. After writing, instruction caches may need synchronization. It is hard because toggling is a system call per change and chaining patches code constantly, so naive handling makes translation dominated by protection changes.",
    k: ["Batch patches and toggle once vs toggle per patch: batching reduces calls and delays links; per patch is simple and costly.", "Dual mapping vs toggling: dual mapping avoids the pause and other threads running the code; toggling needs no extra address space."],
    p: ["A page made non-executable for a patch while another thread runs it kills the process.", "Forgetting instruction cache maintenance after the write runs stale code on only some hosts."],
    v: "Chain and unchain blocks continuously under a strict write-xor-execute host policy while eight threads run, and confirm no faults and no stale execution.",
    dep: ["executable-memory-manager","host-system-layer"]
  },
  "host-thread-mapping": {
    s: "Creates and manages the host threads that run guest threads, including their stacks, scheduling and synchronization with translator state.",
    d: "Each guest thread runs on its own host thread, with a guest stack and a translator stack. The translator tracks them for signals, exit and the stop-the-world operations eviction and patching need. Thread start installs the context register, signal stack and thread-local state before running guest code. It is hard because threads can be in many states, executing translated code, inside a helper, blocked in the host kernel, and bringing them to a safe point for cache operations must work in every state without deadlock.",
    k: ["One-to-one host threads vs multiplexed guest threads: one-to-one gives true parallelism and simple blocking; multiplexing gives control and deterministic scheduling and loses parallel speed.", "Cooperative safe points vs forced suspension by signal: cooperative is safe and delays operations; forced suspension is prompt and complicated by non-reentrant code."],
    p: ["A thread blocked in a long host call never reaches a safe point and stalls every cache flush.", "A thread started before its signal stack is installed crashes on its first fault."],
    v: "Create hundreds of threads in different states, trigger a cache flush and confirm every thread reaches a safe point within a bounded time and resumes correctly.",
    dep: ["host-system-layer","translator-allocator"]
  },
  "host-feature-detection": {
    s: "Discovers which instructions and facilities the host provides, so generation can use fast forms and avoid unsupported ones.",
    d: "At startup the translator reads processor identification and operating system hints to learn which optional instruction extensions exist: atomic operations, vector widths, byte-manipulation instructions, strong-ordering modes, page sizes. The results select code generation strategies and what features are reported to the guest. It runs once and the answer is fixed for the process, and is part of cache keys. It is hard because reported features may be unusable in practice, since the operating system must also enable them, and because a wrong guess crashes only on certain machines.",
    k: ["Detect at run time vs compile in a fixed baseline: run time adapts to each host and makes testing a matrix; a fixed baseline is simple and slow on newer hosts.", "Report host features to the guest vs a fixed guest feature set: reporting gives speed and variability between hosts; a fixed set makes behavior reproducible."],
    p: ["A feature present in hardware but not enabled by the kernel is detected and crashes on first use.", "Persisted translations from a host with a feature run on one without it."],
    v: "Run the translator on hosts with and without each optional feature, force-disable features on one host, and confirm correct output and the expected code selection in each case.",
    dep: ["host-system-layer"]
  },
  "translator-allocator": {
    s: "Manages the translator's own data: block metadata, maps, tables and per-thread state, separate from guest memory and from generated code.",
    d: "The translator allocates many small objects at translation time and frees them in bulk on eviction. A dedicated allocator, often arena-based, avoids calling the general allocator inside fault and signal handlers, where that is unsafe, and keeps translator data out of the guest's address range. Arenas are tied to translation cache regions so everything for a region is freed together. It is hard because signal handlers must allocate nothing, memory must be bounded under hostile programs, and lifetimes must match cache eviction exactly.",
    k: ["Arena per cache region vs general-purpose allocation: arenas free in one step and match eviction; general allocation is flexible and slow, and unsafe in handlers.", "Preallocate pools for handlers vs allocate on demand: preallocation is safe in handlers and wastes memory; on demand is lean and may fail at the worst time."],
    p: ["A handler calling the general allocator deadlocks when the interrupted code held its lock.", "Metadata outliving its cache region leaves pointers into freed memory."],
    v: "Run a long translation-heavy workload with periodic eviction and confirm translator memory stays bounded and returns to baseline after each flush, with no allocation observed in handlers.",
    dep: ["host-system-layer"]
  },
  "host-system-layer": {
    s: "The translator's own interface to the host operating system: memory, threads, files, signals and time, kept narrow so it can be ported and tested.",
    d: "Instead of calling the host directly everywhere, the translator uses a thin layer for memory mapping, protection changes, thread creation, signal handler installation, file access and clocks. It is separate from the guest's system calls, which are translated in a different layer, though both end in the host kernel. The layer hides differences between host operating systems, restricts what the translator may do, and allows fault injection in tests. It is hard because calls made by the translator must never be confused with the guest's, and the layer must be usable inside signal handlers.",
    k: ["Thin wrapper over host calls vs direct use throughout: a wrapper allows porting and testing; direct use is less code and spreads host assumptions across the translator.", "Fail loudly on host errors vs retry or degrade: failing is clear; degrading keeps programs running and hides resource problems."],
    p: ["A translator-side call goes through the guest system call path and is translated twice.", "The wrapper uses a facility that is unsafe inside signal handlers."],
    v: "Run the translator's tests with host-call failures injected at each call site and confirm it fails with a clear message or recovers, never corrupting guest state.",
    dep: []
  },
  "translation-strategy": {
    s: "Whether code is translated before the program runs, while it runs, or both, which determines startup cost, coverage and the cost of being wrong.",
    d: "Static translation offers optimization time and fast starts and cannot see code it cannot find. Dynamic translation sees everything that actually runs and pays at run time. Hybrids translate known code ahead and fall back for the rest. The choice shapes the cache, invalidation, persistence and the need for an interpreter. It also decides how much of the work is repeated for each run. The decision cannot be left until later because components such as the persistent cache, tiers and cache keys assume one answer.",
    k: ["Dynamic only vs static plus dynamic fallback: dynamic only is simplest and complete; a hybrid reduces startup and doubles the paths that must agree.", "Whole-program ahead-of-time vs per-function ahead-of-time: whole program optimizes more and fails on unknown code; per-function degrades gracefully."],
    p: ["A static translation is trusted for a binary that was replaced, since keys were not checked.", "A design that assumes all code is found ahead of time fails on programs that generate code."],
    v: "Run the same programs in static-plus-dynamic and dynamic-only modes and confirm identical output, with measured startup improvement and no execution of unvalidated stored code.",
    dep: ["static-pre-translation","persistent-translation-cache","block-formation"]
  },
  "fidelity-vs-speed": {
    s: "How closely translated programs must match the original machine, bit for bit and cycle for cycle, against how fast they must run.",
    d: "Exact flag values after every instruction, exact floating point rounding, strong memory ordering and precise faults are all expensive. A translator for games can relax some; one that verifies scientific results cannot. Each relaxation is a bet that programs do not depend on the dropped behavior. The decision touches the IR, the optimizer, floating point handling and memory ordering. It is hard because the programs that depend on exact behavior are rare, hard to find in advance and fail in ways that look like their own bugs.",
    k: ["Exactness by default with opt-out per program vs speed by default with opt-in exactness: exact default is safe and slower; fast default wins benchmarks and fails mysteriously.", "Uniform policy vs per-feature switches: uniform is simple to explain; switches allow tuning and create many combinations to test."],
    p: ["A relaxation chosen for speed on one benchmark silently breaks a numerical program in another domain.", "Switch combinations are untested and one interacts badly with another."],
    v: "Run each relaxation switch against the conformance suite and the compatibility corpus, and confirm failures appear only in the cases documented as accepted losses.",
    dep: ["flag-liveness-analysis","fp-semantics-emulation","memory-ordering-bridge"]
  },
  "concurrency-model": {
    s: "Which threads read and write the translation cache, the lookup tables and guest memory, and how those accesses are synchronized.",
    d: "Translation can happen on any guest thread or on helper threads; the cache can be shared or per thread; patching and eviction run concurrently with execution. The model defines locks, safe points and publication rules: how a block becomes visible, how it disappears, who may patch code. It also determines how guest atomics map to host atomics. It is hard because errors appear as rare crashes in generated code, and because the hottest paths, lookup and dispatch, cannot afford locks.",
    k: ["Global translation lock vs lock-free publication: a lock is simple and serializes startup of multi-threaded programs; lock-free scales and needs careful memory ordering.", "Shared cache vs per-thread caches: shared avoids duplication and needs synchronization; per-thread removes contention and multiplies memory."],
    p: ["A block published before its code is visible to other cores runs garbage on a weakly ordered host.", "A lock taken in the dispatcher is also needed by a signal handler on the same thread."],
    v: "Run translation-heavy multi-threaded programs on a many-core weakly ordered host for hours with stress modes on, and confirm no crashes or output differences.",
    dep: ["translation-cache","block-chaining","host-thread-mapping","atomic-translation"]
  },
  "address-space-model": {
    s: "How guest addresses relate to host addresses: identical, offset by a constant, or looked up through a software table.",
    d: "This single choice determines the cost of every memory access, how faults map back to the guest, how the loader places segments, how large the guest address space can be and whether the guest can be isolated from the translator. Identity or offset mapping makes accesses nearly free but needs a reserved region; table lookup works anywhere and costs on every access. It touches the loader, memory ordering, signals, code tracking and security. It is hard because it is nearly impossible to change late.",
    k: ["Offset mapping with a reserved region vs software translation of every access: offset is fast and needs host support for large reservations; software lookup is portable and slow.", "Guest range as a subset of the host's vs equal: subset allows translator data outside the guest's reach; equal leaves no room and needs bounds checks."],
    p: ["The guest address limit is wider than the host's available virtual address space on some systems.", "Offset mapping lets a guest pointer plus a large index reach translator memory when bounds are not enforced."],
    v: "Probe guest addresses at the edges of the range and into the translator's region from guest code and confirm correct access inside and faults outside.",
    dep: ["address-translation","address-space-mapping","guest-address-space-layout"]
  },
  "state-precision": {
    s: "How exactly the guest's registers, flags and memory must match native at each point where something can observe them: faults, signals, system calls, debuggers.",
    d: "Fully precise state at every instruction forbids reordering, caching registers and removing flag computation. Precise only at defined points, such as faultable instructions and block exits, allows most optimizations, but needs recovery maps. The decision affects the IR, the optimizer, signal delivery, debugging and deoptimization. It also decides how much metadata each block carries. It is hard because observation points are numerous: a signal can arrive at any instruction, and a debugger can stop anywhere.",
    k: ["Precise at every instruction vs at faultable points with recovery maps: every instruction is simple and slow; maps allow optimization and need complete bookkeeping.", "Precise at the interrupted instruction for all signals vs at safe points only: all signals is faithful and heavy; safe points are cheap and legal for asynchronous signals."],
    p: ["An optimization moves a faultable instruction and the recovery map does not follow.", "A debugger shows values from the context while the live ones are still in host registers."],
    v: "Interrupt randomly chosen instructions in test programs with signals and debugger stops and confirm the visible state equals the reference interpreter's state at that instruction.",
    dep: ["fault-address-mapping","deoptimization-fallback","load-store-optimization"]
  },
  "security-isolation": {
    s: "How far the guest program is trusted, and what protects the translator, the host and other programs from a guest that is faulty or hostile.",
    d: "A translator runs untrusted code, produces executable memory and sometimes caches that code on disk, each a risk. Isolation choices include keeping the translator's data outside the guest's reachable space, restricting which host calls guest calls may reach, validating every guest-supplied pointer and length, and authenticating persisted translations. A translator used as a sandbox needs stronger guarantees than one that runs a user's own programs. It is hard because the translator also needs privileged abilities, such as executable memory and signal handling.",
    k: ["Trust the guest as the user's own program vs treat it as hostile: trusting is simple and fast; hostile treatment needs bounds checks and filtering and costs speed.", "Share persistent caches between users vs keep them private: sharing saves work and enables poisoning; private caches are safe and warm slowly."],
    p: ["A guest-controlled length used to size a translator buffer overflows the translator's memory.", "A writable shared translation cache file lets one user run code as another."],
    v: "Run a corpus of hostile guest programs that attempt to read, write and jump into translator memory and to pass malformed system call arguments, and confirm each fails safely with the guest's error.",
    dep: ["address-space-mapping","argument-marshaling","cache-key-validation","executable-memory-manager"]
  }
});
