// Details for the binary translator plate, part 1: testing, profiling, loading, system calls.
ATLAS.details("binary-translator", {
  "lockstep-state-comparison": {
    s: "Runs the same program on real source hardware or a reference interpreter and on the translator, comparing registers, flags and memory effects after every block or instruction.",
    d: "A reference executes one step, the translator executes the same step, and a harness compares architectural state: general registers, flags, vector registers and the memory written. The first mismatch names the exact guest instruction responsible. Traces can be recorded on real hardware and replayed later, so the reference need not be present. It is hard because the translator batches work: state is only precise at block exits, so comparison must either force single-instruction blocks, which changes the code under test, or compare at block boundaries and then narrow down.",
    k: ["Compare per instruction vs per block: per-instruction pinpoints faults at once but tests a different code shape than production; per-block tests real output but needs a second pass to localize.", "Live reference vs recorded trace: live needs source hardware in the loop; traces are portable and repeatable but must also record nondeterministic inputs."],
    p: ["Comparing flags the guest never reads reports false mismatches and hides real ones in the noise.", "Nondeterministic values such as timestamps or random numbers differ between runs and are blamed on the translator."],
    v: "Inject a deliberately wrong rule for one instruction and confirm the harness stops at that exact guest address, printing the differing register, before any later output diverges.",
    dep: ["guest-context","flag-emulation","semantics-specification"]
  },
  "instruction-fuzzer": {
    s: "Generates random but valid guest instructions with random operands and initial state, runs them through translation, and checks the result against a reference.",
    d: "The fuzzer builds short sequences from the instruction encoding tables, picks edge-case operand values such as zero, all ones, sign boundaries and special floating point values, sets initial registers and flags, and compares final state against a reference. It covers combinations no hand-written test would. The hard part is validity: encodings have reserved bits, undefined results and instructions that fault, so the generator needs the same knowledge as the decoder and must avoid reporting architecturally undefined outputs as bugs.",
    k: ["Purely random bytes vs grammar-guided generation: random bytes reach odd decoder paths but mostly produce invalid code; grammar-guided reaches deep semantics but misses decoder edge cases.", "Single-instruction vs sequence tests: single is easy to triage; sequences also catch interactions such as flag reuse across instructions."],
    p: ["Instructions with undefined result bits produce mismatches that look like bugs but are legitimate differences between hardware generations.", "Fuzzing only integer instructions leaves vector and floating point paths untested for months."],
    v: "Run a million generated sequences per instruction class in a nightly job and confirm zero unexplained mismatches, with a seeded known-bad rule reliably producing a reported failure within minutes.",
    dep: ["instruction-decoder","lockstep-state-comparison","semantics-specification"]
  },
  "conformance-suite": {
    s: "A fixed collection of programs that exercise each instruction, system call and behavior with known expected output, run on every change.",
    d: "These are small programs written to check one documented behavior: an arithmetic result with its flags, a rounding mode, an alignment fault, a signal delivery, a system call return value. Expected outputs come from real source hardware. They run quickly and fail precisely, so they act as the regression gate on every commit. They are hard to complete: coverage of the instruction set is large, and the interesting failures are in rarely used corners such as obsolete instructions that old programs still contain.",
    k: ["Expected values from hardware vs from the specification: hardware reflects what programs actually depend on; the specification is cleaner but leaves undefined cases open.", "Many tiny tests vs a few larger programs: tiny tests localize failures at once, larger ones find interaction bugs that tiny ones never combine."],
    p: ["Tests that print instead of asserting pass silently when output is empty because the program crashed early.", "Suites tuned on the translator's own output drift toward its bugs instead of the hardware's behavior."],
    v: "Run the whole suite on a clean checkout and confirm every case reports pass or an explicit expected-skip, with the number of executed cases matching the number listed.",
    dep: ["guest-binary-loader","syscall-trap"]
  },
  "app-compat-corpus": {
    s: "A set of real, unmodified programs run under translation with checks on their output, used to find the failures that synthetic tests miss.",
    d: "Real programs use combinations of instructions, libraries, threads, signals and memory patterns that no test author imagined: compilers, databases, interpreters, media tools, games. Each entry has a scripted run and a pass condition such as matching output or a clean exit. Failures reveal missing system calls, ordering bugs and performance cliffs. The corpus is hard to maintain: programs change versions, some are nondeterministic, and a failure may be an application bug that also occurs on real hardware.",
    k: ["Self-checking programs vs output comparison: self-checking suites need no reference run but exist for few programs; output comparison covers more at the cost of filtering noise.", "Pinned versions vs latest releases: pinned gives stable signal; latest finds new breakage earlier but makes failures harder to attribute."],
    p: ["A program that exits with success after silently skipping a failed feature passes while being broken.", "Timing-sensitive programs fail intermittently and get ignored, hiding real memory ordering bugs."],
    v: "Run the corpus on every release candidate and compare pass counts and wall time with the previous release, investigating every regression before shipping.",
    dep: ["conformance-suite"]
  },
  "translation-bisector": {
    s: "Automatically narrows a failing run down to the one block, instruction or optimization pass that produces the wrong behavior.",
    d: "When a large program misbehaves, the bisector reruns it with translation features switched on or off per guest address range, per optimization pass or per block count, halving the set until one change flips the result. A common mode runs the first N translated blocks optimized and the rest through a slow trusted path. The result is a guest address and a pass name. It is hard because failures may depend on interactions, such as two blocks that are individually correct but wrong when chained, and because runs must be deterministic enough to repeat.",
    k: ["Bisect by block count vs by address range: count is simple and always terminates; address range maps straight to a function but misses dynamically generated code.", "Bisect passes vs bisect blocks: passes identify the guilty optimization; blocks identify the guilty input; usually both are needed in sequence."],
    p: ["A nondeterministic failure makes bisection converge on a random block and blame innocent code.", "Disabling chaining or caching during bisection can hide a bug that depends on them."],
    v: "Plant a wrong rule in one optimization pass, run the bisector on a program that triggers it, and confirm it reports that pass and a guest address within the program's hot function.",
    dep: ["translation-trace-log","interpreter-tier","ir-verifier"]
  },
  "concurrency-stress-tests": {
    s: "Multi-threaded programs that hammer shared memory, atomics and ordering-sensitive patterns, run many times and on many cores to expose rare races introduced by translation.",
    d: "Typical tests include message-passing patterns, lock implementations, lock-free queues and counters, run in tight loops with thousands of repetitions. Bugs here appear as one failure in millions of runs because they depend on the exact interleaving of host threads. Tests are run on hosts with weaker memory ordering than the guest, where missing barriers show up, and under reduced timing slack. They are hard to trust: a pass proves little, and a fail may need hours of repeated runs to reproduce.",
    k: ["Litmus-style tiny patterns vs full application workloads: litmus tests give crisp ordering verdicts; applications find practical bugs but with slow, noisy signals.", "Run on the weakest-ordering host vs all hosts: the weakest finds most bugs fastest; testing on strong hosts confirms barriers are not removed wrongly."],
    p: ["Running only on a few cores or with a strong host memory model never exposes missing barriers.", "A test that passes a million iterations is reported as proof, though the failure probability was below that rate."],
    v: "Run an ordering litmus test hundreds of millions of times on the weakest host and confirm the forbidden outcome never appears, while disabling the barrier translation makes it appear within seconds.",
    dep: ["memory-ordering-bridge","atomic-translation","host-thread-mapping"]
  },
  "translator-counters": {
    s: "Counters for translations performed, cache hits and misses, chain links, time spent translating and time spent running translated code.",
    d: "Counters are incremented in the dispatcher and translation paths, kept per thread to avoid contention, and summed on request or at exit. Useful ones separate translation time from execution time, count blocks and bytes generated, record how often execution leaves translated code for the dispatcher, and tally invalidations and fallbacks. They answer whether a slowdown is a slow translator or slow translated code. The difficulty is overhead: counters inside translated blocks cost instructions on the hottest path, so they are usually sampled or compiled in only for profiling builds.",
    k: ["Always-on counters vs profiling-build counters: always-on supports field diagnosis but taxes hot paths; build-time counters are free in production and absent when you need them.", "Per-thread counters merged later vs shared atomic counters: per-thread avoids cache-line contention but loses a consistent live view."],
    p: ["Counting dispatcher entries without separating chained from unchained transitions makes a healthy cache look broken.", "Counter updates inside blocks silently halve performance of tight loops."],
    v: "Run a loop of ten million iterations and confirm the counters show a handful of translations, a high hit rate, and a dispatcher entry count near the number of unchained exits.",
    dep: ["dispatcher-loop","translation-cache","block-chaining"]
  },
  "guest-symbolization": {
    s: "Maps a guest address, or a host address inside translated code, back to a guest function name and source line using the guest's own symbol data.",
    d: "Profilers and crash tools see host addresses in translated code that exist nowhere in the guest binary. The translator keeps a map from each generated code range to the guest block that produced it, and reads symbol and line tables from the guest binary and its libraries as they load. Lookups go host address to guest address to symbol. It is hard because translated code is generated at runtime and discarded, so the map must follow evictions, and because libraries can be loaded at runtime at any address.",
    k: ["Maintain the map eagerly at translation time vs rebuild on demand: eager costs memory and time per block; on demand needs the original block data that may already be evicted.", "Use guest debug data vs export own symbol file: guest data is complete but large to parse; a custom file loads fast but must be kept in sync."],
    p: ["A stale map entry attributes samples to the wrong function after an eviction reuses the memory.", "Position-independent libraries loaded at new addresses are symbolized with the old load offset."],
    v: "Profile a program with a known hot function and confirm the top profile entry shows that guest function name, and that the same holds after the cache has been flushed mid-run.",
    dep: ["translation-cache","guest-binary-loader","patch-points"]
  },
  "translation-trace-log": {
    s: "A switchable log of every translation decision: which guest block was translated, at which tier, with which optimizations, and what host code was produced.",
    d: "On request, each translation emits a record with the guest address, the decoded instructions, the IR before and after optimization and the resulting host instructions, plus events such as chaining, invalidation and eviction. Records are filtered by address range or module. This is the primary tool for debugging a wrong translation, since it shows the exact chain from input to output. It is hard because volume is enormous, so filters must apply before formatting, and the log must not itself change timing enough to hide a race.",
    k: ["Text logs vs binary trace records: text is readable and greppable; binary is smaller and faster but needs a viewer.", "Log at translation time only vs also at execution: translation-time is cheap; execution tracing shows real paths but slows the program by orders of magnitude."],
    p: ["Logging everything fills disks in minutes on large programs and gets turned off before the failing moment.", "Formatting host disassembly in the translator pulls a large decoder dependency into production builds."],
    v: "Enable the log for one guest function and confirm it lists its blocks with decoded instructions, IR and host code, and that disabling the filter produces no output at all.",
    dep: ["ir-definition","instruction-decoder","code-emitter"]
  },
  "host-profiler-bridge": {
    s: "Lets standard host profilers attribute samples inside generated code to guest functions by publishing a map of code regions as they are created.",
    d: "Host sampling profilers record instruction pointers and look them up in loaded modules, but generated code belongs to no module. The bridge writes a small file, or calls a profiler interface, describing each generated region with a name and address range as it is emitted and removed. The profiler then shows guest function names beside real translator functions. It is hard because the information must be up to date at sample time, and because high translation rates produce huge registration files.",
    k: ["Publish every block vs publish per function or region: every block is exact but floods the profiler; per function is compact but needs reliable function boundaries.", "Perf map file vs direct profiler API: files work with any tool and need no linking; APIs give richer data but tie the build to one tool."],
    p: ["Registering regions after the profile run starts leaves early samples unnamed and skews the picture of startup cost.", "Evicted code reused at the same address gets samples attributed to the old name."],
    v: "Run a sampling profiler on a translated benchmark and confirm the top entries carry guest function names and that their total weight is within a few percent of the translated-code share from the counters.",
    dep: ["guest-symbolization","code-emitter"]
  },
  "guest-debugger-stub": {
    s: "A debug server that lets a debugger for the guest set breakpoints, step and inspect state as if the guest were running natively.",
    d: "The stub speaks a standard remote debugging protocol. Breakpoints are implemented by ending translation at the address and calling the stub, or by inserting a trap into a private copy of the code. Single-stepping forces one-instruction blocks. Registers and memory are read from the guest context, never from the host. It is hard because the guest and the debugger disagree on state unless the translator can reconstruct exact guest registers at any instruction, and because breakpoints inside already-chained blocks must unlink those blocks.",
    k: ["Breakpoints via translation boundaries vs patched guest memory: boundaries leave guest memory untouched; patching is faithful for programs that read their own code but breaks code checks.", "Step by re-translating single instructions vs interpreter stepping: re-translating tests production code; the interpreter is simpler and always precise."],
    p: ["A breakpoint set inside a chained block never fires because direct links skip the dispatcher.", "Register values shown from host state are wrong whenever the translator has cached guest registers in host registers."],
    v: "Attach a debugger, set a breakpoint inside a hot loop, and confirm it hits on every iteration with correct registers and that stepping advances exactly one guest instruction.",
    dep: ["guest-context","interpreter-tier","block-chaining","fault-address-mapping"]
  },
  "crash-reporting": {
    s: "Produces a report on translator failure that names the guest address, the translated block and the translator version, so the problem can be reproduced elsewhere.",
    d: "When the translator itself faults, or the guest crashes in a way that depends on translation, a handler collects the guest register context, the guest instruction bytes around the failure, the block's translation record, recent trace events and version information. It can write a small bundle that a developer replays offline. It is hard because the crash may be inside the translator's own locks or allocator, so the handler must be safe in that state and avoid allocation, and because a guest program's memory may contain private data that must not be uploaded.",
    k: ["Capture guest memory contents vs registers only: memory makes replay possible but may contain secrets; registers and code bytes are safe but often insufficient to reproduce.", "Report translator faults and guest faults the same way vs separately: one path is simpler; separate paths keep real guest crashes from being misfiled as translator bugs."],
    p: ["A handler that allocates memory deadlocks when the crash was caused by the allocator.", "Reports without the translator build identifier cannot be matched to source."],
    v: "Force a fault in translated code and confirm the report contains guest address, instruction bytes, block translation and build identifier, and that replaying the bundle offline reproduces the fault.",
    dep: ["host-fault-handler","translation-trace-log","guest-context"]
  },
  "guest-binary-loader": {
    s: "Reads the guest executable format, maps its segments into the guest address space at the right addresses and permissions, and finds the entry point.",
    d: "The loader parses headers, checks that the file really is for the guest instruction set, maps each loadable segment with the requested permissions, zeroes uninitialized data, applies relocations when the file is position-independent, and records the interpreter or dynamic linker named in the file. It must produce the same layout the guest kernel would have, since programs inspect their own mappings. It is hard because the host page size or address layout may conflict with the guest's, and because malformed headers must be rejected without trusting any field.",
    k: ["Use the host loader for the container format vs implement loading in the translator: the host loader is less code but cannot place segments at guest-required addresses; own loading gives full control at the cost of re-implementing format details.", "Map files directly vs copy: direct mapping shares pages and starts fast; copying makes tracking code modifications simpler."],
    p: ["Trusting segment sizes from the header allows overlapping or oversized mappings that corrupt the translator.", "Segments requiring addresses already occupied by the host's own mappings fail only on some hosts."],
    v: "Load a program and compare its segment map against the one the real guest kernel produced, address by address and permission by permission, and confirm it starts at the correct entry point.",
    dep: ["guest-address-space-layout","address-space-mapping","host-system-layer"]
  },
  "dynamic-linker-handling": {
    s: "Decides how the guest's shared libraries and its dynamic linker are loaded: run the guest's own linker translated, or resolve libraries inside the translator.",
    d: "Most guest programs name an interpreter that resolves libraries at startup. The simplest approach loads that linker as ordinary guest code and lets it do all the work through translated system calls. A faster approach resolves libraries in the translator, which can substitute host-native versions for chosen ones. It is hard because libraries carry architecture-specific code, thread-local storage models and lazy binding that call back into the linker at runtime, so substituting anything changes behavior the program may depend on.",
    k: ["Run the guest linker translated vs replace it: translated is faithful and automatic; replacing starts faster and enables native libraries but must reimplement lookup order and constructors.", "Eager vs lazy symbol binding: eager moves cost to startup and simplifies tracing; lazy matches normal behavior and delays failures to first call."],
    p: ["Replacing the linker skips constructors or version checks that some programs rely on.", "Libraries opened at runtime by name go through a path the translator never saw and fail to load."],
    v: "Run a program that opens a library at runtime and calls a function in it, and confirm both startup and runtime loading give the same output as on real source hardware.",
    dep: ["guest-binary-loader","guest-filesystem-redirection","host-library-thunking"]
  },
  "guest-address-space-layout": {
    s: "The plan for where the guest's executable, libraries, heap, stacks and mapped files live in the address space it sees, and how the translator's own memory is kept out of the way.",
    d: "The guest expects certain regions at certain addresses and a particular address limit, often smaller than the host's. The translator reserves the whole guest range early, keeps its own code, cache and data outside it, and hands guest mappings out from within. Randomized placement, stack growth direction and the zero page must match. It is hard because host systems also place their own mappings and the stack at addresses the guest wants, and because a guest that assumes a smaller address space may use unused high bits as tags.",
    k: ["Reserve the full guest range up front vs map on demand: reserving makes conflicts impossible later; on demand uses less virtual space but may find the address taken.", "Identity-map guest addresses vs offset them: identity is fastest and simplest; offsetting can dodge conflicts but adds an addition to every access."],
    p: ["A host library mapped inside the intended guest range makes loading fail on only some machines.", "Allowing guest mmap hints into the translator's reserved area lets the guest overwrite translator memory."],
    v: "Print the guest's memory map under translation and on real hardware and confirm every region, size and permission matches, and that no translator memory lies inside the guest range.",
    dep: ["address-space-mapping","host-system-layer"]
  },
  "host-library-thunking": {
    s: "Lets translated guest code call selected libraries compiled for the host directly, converting calls and data at the boundary instead of translating the library.",
    d: "For performance-critical or hardware-bound libraries such as graphics and compression, a thunk replaces the guest library function with a stub that traps into the translator, converts arguments to the host calling convention, calls the host function and converts the result. Pointers, structures and callbacks need conversion. The gain is native speed for heavy code. It is hard because every function signature must be described, structures with different layouts need copying, and callbacks into guest code need reverse thunks and a safe stack.",
    k: ["Thunk whole libraries vs only hot functions: whole libraries give uniform behavior; hot-function thunking limits the surface to maintain but mixes translated and native state.", "Generated thunks from interface descriptions vs hand-written: generated stay consistent as libraries evolve; hand-written handle awkward functions but rot."],
    p: ["A structure whose layout differs between guest and host is passed unconverted and the host library reads garbage.", "Callbacks invoked from other host threads reach guest code without a valid guest context."],
    v: "Call a thunked compression function on a known buffer from translated code, confirm the output matches the guest library's result, and measure that time spent is close to native.",
    dep: ["argument-marshaling","struct-layout-conversion","syscall-trap","helper-call-interface"]
  },
  "process-startup-state": {
    s: "Builds the initial stack, arguments, environment and auxiliary values that the guest program expects to find when its first instruction runs.",
    d: "The guest runtime reads command-line arguments, environment strings and a vector of key-value hints from the stack: page size, entry point, program header location, hardware capability bits, a random seed, the platform name. The translator constructs these from the guest binary and its own configuration. It is hard because several values describe the hardware, and guest libraries use them to choose code paths, so the capability bits must claim only what the translator implements, or programs will execute instructions it cannot translate.",
    k: ["Advertise a conservative feature set vs the full host set: conservative is safe and slower; full is faster but exposes instructions that may be translated poorly or not at all.", "Rebuild the stack vs copy the host's: rebuilding is correct for the guest ABI; copying is easy but carries host-specific values."],
    p: ["Advertising a vector extension the translator does not implement makes libraries pick unsupported code paths and crash.", "Stack alignment at entry differs by one word and breaks floating point code later."],
    v: "Dump the initial stack under translation and compare with the layout from real source hardware, confirming alignment, auxiliary entries and capability bits are the intended ones.",
    dep: ["guest-binary-loader","guest-address-space-layout","host-feature-detection"]
  },
  "guest-filesystem-redirection": {
    s: "Maps file paths the guest uses to a separate directory tree holding the guest's own libraries and data, while leaving other paths pointing at the host.",
    d: "A guest program opens libraries and configuration by absolute path, and those must resolve to files built for the guest instruction set, not the host's. A root prefix is applied to selected paths, with an allowlist for shared locations such as device and process information that should stay on the host. It applies to open, stat, exec, readlink and every other path-taking call. It is hard because relative paths, symbolic links that escape the tree and handles passed between processes can bypass the mapping or leak host files.",
    k: ["Path prefixing in the translator vs a mount namespace: prefixing needs no privilege and works anywhere; a namespace is exact and complete but may need elevated rights.", "Redirect only existing files vs all paths: redirecting only existing is flexible but ambiguous; redirecting everything is predictable but breaks host-shared locations."],
    p: ["A symbolic link inside the guest tree pointing to an absolute path escapes to the host's file of the same name.", "Redirection applied to open but forgotten for exec runs the host binary instead of the guest one."],
    v: "Open a library by its absolute path from the guest and confirm it reads the guest-tree copy, while a read of process information still reads the host's live data.",
    dep: ["syscall-trap","argument-marshaling","host-system-layer"]
  },
  "syscall-trap": {
    s: "Catches the guest's system call instruction and routes it to the translator's own handler instead of the host kernel.",
    d: "When a guest block contains a system call instruction, translation ends the block there, saves guest registers into the context and calls the syscall layer, which returns the result into the guest's result register. The call must pass through the translator because numbers and arguments differ. Translated code also needs a clean exit state: pending signals are checked on return. It is hard because the call can block, create threads, change the address space or never return, and in each case the translator's internal state must stay consistent.",
    k: ["Trap at the instruction vs emulate through a host-side filter: trapping in the translator is simple and portable; a kernel-side filter catches calls from unexpected places but needs host support.", "Handle simple calls inline vs always call out: inline handling of trivial calls is faster but duplicates logic."],
    p: ["A system call inside a block that is later chained and optimized loses its required exit point and the call is skipped.", "Results in registers are not sign-extended the way the guest expects and look like huge error numbers."],
    v: "Run a program making a few thousand calls of each common type and compare their return values and effects with a native run, including a blocked read interrupted by a signal.",
    dep: ["syscall-number-table","argument-marshaling","guest-context","entry-exit-stubs"]
  },
  "syscall-number-table": {
    s: "A table mapping each guest system call number to a handler that performs it on the host, whether by direct passthrough, conversion or emulation.",
    d: "Numbering differs between instruction sets even on the same kernel, and some calls exist only in older or newer conventions. The table maps each number to a handler category: pass through unchanged, convert arguments then pass through, emulate using other host calls, or reject. Tables are often generated from the guest and host interface descriptions. It is hard because semantics drift between versions: a call may exist on both sides with different flags, and gaps must fail with the exact error the guest would get.",
    k: ["Generated table from interface descriptions vs hand-maintained: generated tracks kernel changes cheaply; hand-maintained is easy to tweak but incomplete.", "Pass through by default vs deny by default: pass-through gets programs running quickly; deny-by-default is safer and explicit about every supported call."],
    p: ["A call number reused for a different call on the host passes through unchecked and does something unintended.", "Missing entries fail with the wrong error code, so programs take a wrong fallback path."],
    v: "Enumerate every number up to the guest limit, call each with harmless arguments, and compare return codes with a native run; every difference must be listed as known.",
    dep: ["syscall-trap","unsupported-syscall-policy"]
  },
  "argument-marshaling": {
    s: "Converts system call arguments between guest and host conventions: integer widths, pointers, flags and bit meanings.",
    d: "Arguments arrive in guest registers using the guest's size and sign conventions. Handlers widen or narrow them, translate pointers from guest to host addresses, remap flag bit values that differ between interfaces, and verify memory ranges are accessible. Output arguments are converted back after the call. It is hard because a pointer to a buffer may cross unmapped pages, because the same flag name can have different values on each side, and because a guest with smaller pointers needs every pointer in a structure converted, not just the top-level ones.",
    k: ["Copy buffers into host memory vs pass translated pointers: copying isolates the host and handles layout; passing pointers is fast and preserves semantics for large transfers.", "Validate pointers before the call vs rely on the kernel returning a fault code: validating protects the translator; relying on the kernel is faster and gives true guest error behavior."],
    p: ["Forgetting to sign-extend a 32-bit argument makes small negative numbers look huge and fails inconsistently.", "Flag values copied unchanged work on one tested path and break on another."],
    v: "For each handler, drive boundary values for every argument and compare the host-observed arguments and the guest-visible result against a reference table of expected conversions.",
    dep: ["address-translation","struct-layout-conversion","syscall-number-table"]
  },
  "struct-layout-conversion": {
    s: "Converts structures passed through system calls when their size, field order, padding or field widths differ between guest and host.",
    d: "File status, time values, directory entries, socket addresses and many others have a layout set by the interface description of each instruction set. For each, the translator reads fields from guest memory, writes them in the host layout for the call, and converts results back. Conversion code is often generated from structure descriptions. It is hard because layouts have several variants, nested structures and arrays of variable length, and because getting a single field's offset wrong yields errors visible only in specific programs.",
    k: ["Generated converters from descriptions vs hand-written: generated avoids offset mistakes; hand-written handles special cases but multiplies review burden.", "Convert in place vs into scratch buffers: in place saves memory but corrupts the guest's data on failure paths; scratch is safe and costs a copy."],
    p: ["Reading a padded field the guest never initialized leaks host stack bytes or yields unstable results.", "Time structures with different integer widths overflow after a date, producing failures years later."],
    v: "Round-trip each converted structure with randomized field values through guest-to-host and host-to-guest conversion, and confirm every field is preserved or intentionally narrowed.",
    dep: ["argument-marshaling","byte-order-conversion"]
  },
  "ioctl-translation": {
    s: "Translates device control requests, whose meaning depends on a request code and an argument structure that the translator must understand per device.",
    d: "Device control calls take a request number and a pointer to a structure whose type depends on that number. There is no generic rule, so each supported request has its own conversion: terminal settings, network interfaces, block devices, graphics, input. The request number itself encodes size and direction, which differ between interfaces. It is the long tail of system call translation. It is hard because requests are numerous, poorly documented and driver-specific, and passing an unknown one through unchanged can corrupt memory.",
    k: ["Whitelist known requests vs pass unknown through: whitelisting is safe and breaks unusual hardware; pass-through supports more but can corrupt memory when layouts differ.", "Table-driven conversion vs per-request code: tables are compact and uniform; code can handle requests with nested pointers."],
    p: ["An unknown request passed through with a differently sized structure overwrites adjacent guest memory.", "Terminal requests handled by approximate conversion break interactive programs in subtle ways."],
    v: "Issue each supported request against a real device from the guest and compare the resulting state and returned structure with a native run, and confirm an unknown request returns the documented failure code.",
    dep: ["struct-layout-conversion","argument-marshaling","unsupported-syscall-policy"]
  },
  "thread-and-futex-calls": {
    s: "Handles calls that create threads, wait on addresses and wake waiters, mapping them to host threads and the guest's synchronization primitives.",
    d: "Thread creation allocates a host thread, a guest stack and a context, sets thread-local storage and starts it at the guest's entry function. Wait and wake calls operate on guest addresses, which the translator maps to host addresses so waiters and wakers meet at the same word. Process creation and exit calls must coordinate across threads. It is hard because the guest runtime mixes these calls with atomic operations and expects the exact wakeup semantics, and because exits must stop all threads even while they sit in translated code.",
    k: ["One host thread per guest thread vs multiplexing: one-to-one gives true parallelism and simple blocking; multiplexing eases deterministic behavior but blocks everything on one blocking call.", "Pass wait calls directly to the host vs emulate queues: direct is fast and consistent; emulated queues are portable but must reproduce fairness and timeout behavior."],
    p: ["A wake sent to the translated address, not the mapped host address, never reaches the waiter.", "Thread exit that leaves translator state referencing the thread's context causes crashes later in unrelated threads."],
    v: "Run a producer and consumer using a lock and condition built on wait and wake calls for millions of handoffs, and confirm no lost wakeups and correct totals, including at process exit.",
    dep: ["host-thread-mapping","thread-local-context","address-translation"]
  },
  "unsupported-syscall-policy": {
    s: "Defines what happens when the guest makes a call the translator cannot perform: fail with a standard error, log, or stop.",
    d: "Not every call can be translated: some are tied to the guest's hardware, some are too new, some would break the translator's own control of memory or threads. The policy chooses the result: a not-implemented error, which most programs handle, a log entry for the developers, or a hard stop in strict test mode. Unsafe calls, such as those that change the translator's own mappings, are deliberately denied. It is hard because programs probe for features by calling and checking errors, so the error must match what the guest would see on an older kernel.",
    k: ["Return a not-implemented error vs abort: the error lets programs fall back and keeps running; aborting finds gaps loudly but kills programs that could have coped.", "Silent failure vs logged failure: silent keeps output clean; logging costs little and is the only way to learn which calls matter."],
    p: ["Returning success for an unimplemented call hides data loss, such as a write that never happened.", "A fallback error the guest does not expect makes the runtime abort at startup with no message."],
    v: "Call a deliberately unsupported number and confirm the guest sees the documented error, a log entry names the call and arguments, and strict mode stops with the same information.",
    dep: ["syscall-number-table"]
  },
});
