// Details for the linker & loader plate, part 5: thread-local storage, randomization and caching, kernel loading, cross-cutting.
ATLAS.details("linker-loader", {
  "tls-segment-layout": {
    s: "A template of initialized and zero-filled thread-local variables from all modules, copied into each new thread's storage, with a program header describing its size and alignment.",
    d: "Thread-local variables are placed into dedicated sections that the linker merges into one template per module: an initialized part and a zero part. A program header records both sizes and the alignment. For the main program the linker knows its offset in every thread's block; for libraries the loader assigns one when the library is loaded. Creating a thread copies each module's template into that thread's block and zero-fills the rest.",
    k: ["Initialized template copied per thread vs lazily on first touch: eager copying is simple and predictable, while lazy copying saves time for threads that never use the data.", "One template per module vs one merged block: per-module templates allow libraries to load later, while a merged block would need fixed sizes at link time."],
    p: ["A large thread-local array in a library adds its full size to every thread's stack-adjacent block, including threads that never use it.", "Alignment demands larger than the allocator provides misalign thread blocks."],
    v: "Create threads, read an initialized thread-local variable in each and confirm all see the initial value, and that a write in one thread is invisible in the others.",
    dep: ["program-headers", "section-merging", "thread-block-allocation"]
  },
  "tls-access-models": {
    s: "Four ways code reaches a thread-local variable, from a fixed offset from the thread pointer to a call into the loader, depending on where the variable lives and when it loads.",
    d: "Local-exec is a fixed offset from the thread pointer, only valid in the main program. Initial-exec loads the offset from a table filled at load, valid for libraries loaded at start. Local-dynamic computes one module base through the loader and adds a constant offset, and general-dynamic calls the loader with a module and offset for each variable, valid everywhere, including libraries opened at run time. The compiler picks a model by flags and visibility; the linker may relax a general model to a faster one.",
    k: ["General-dynamic everywhere vs the fastest model that is correct: general-dynamic works in any library but costs a call per access, while faster models limit where the code can be loaded.", "Compiler-chosen at compile time vs linker-chosen: compile-time choice is simple, while linker choice sees the final output kind but needs relaxable relocations."],
    p: ["A library built with a local-exec model and loaded at run time crashes or fails to load, because its offset needs space not reserved.", "Access in a hot loop through the general model is slow enough to dominate the loop."],
    v: "Compile one thread-local access in each model, link, and confirm the disassembly shows the expected instruction sequence per model, and each returns the right per-thread value in a multi-thread test.",
    dep: ["tls-segment-layout", "relocation-types", "tls-model-relaxation"]
  },
  "tls-descriptors": {
    s: "A scheme in which each thread-local access goes through a small descriptor holding a resolver and an argument, letting the loader choose the cheapest access method per variable.",
    d: "Instead of calling a generic loader function with a module and offset, code loads a descriptor from the global table and calls its function. For variables in the main program or libraries loaded at start, the loader fills in a function that returns a constant offset; for libraries opened later it fills in one that allocates on demand. This turns the choice among models into a load-time decision with a fast common case. Descriptors need loader and compiler support to agree on the call convention.",
    k: ["Descriptor call vs the older two-argument call: descriptors give a fast path chosen by the loader, but need a special register convention and loader support.", "Eager allocation vs lazy allocation of dynamic blocks: lazy saves memory for unused libraries, but adds an allocation inside the first access."],
    p: ["A resolver function that allocates memory can be called in a signal handler context where allocation is unsafe.", "Toolchains that disagree on descriptor conventions produce binaries that crash on first access."],
    v: "Access a thread-local variable defined in a library opened at run time and confirm the first access allocates space for the thread, and subsequent accesses return the same address with no allocation.",
    dep: ["tls-access-models", "global-offset-table", "thread-block-allocation"]
  },
  "thread-block-allocation": {
    s: "Creating each thread's thread-local storage block, including the area for modules loaded at start and a table for modules loaded later.",
    d: "At thread creation, the runtime allocates a block sized for the static modules' templates, copies the templates in and sets the thread pointer to it. A per-thread table records where each module's block is, indexed by module number. Libraries opened later get their blocks allocated lazily on first access, and the table grows when necessary. When a thread ends, destructors run and blocks are freed. Memory allocation here must not itself need thread-local storage.",
    k: ["Static area sized at thread creation vs growing: a static area is fast and simple, but libraries loaded later need a separate dynamic mechanism.", "Block adjacent to the thread control structure vs separate allocation: adjacent saves an allocation and gives fixed offsets, while separate allows independent sizing."],
    p: ["A library unloaded while threads hold blocks for it leaks those blocks or leaves table entries dangling.", "Allocation of the block fails in a low-memory condition and thread creation reports a generic error."],
    v: "Start many threads, load a library with thread-local data afterward, access it in each thread and confirm each has distinct storage and memory usage grows only for threads that touched it.",
    dep: ["tls-segment-layout", "explicit-loading", "initial-process-state"]
  },
  "tls-model-relaxation": {
    s: "A linker optimization that rewrites a general thread-local access sequence into a cheaper one when the final output makes the generality unnecessary.",
    d: "The compiler emits a general sequence with relocations marked so the linker can recognize it. When building an executable, where the variable's module is known to be the program, the linker rewrites the sequence in place to the fixed-offset form, replacing the call into the loader. For variables in the same library the dynamic form may become the local one. Rewriting requires the exact expected instruction pattern, and the replaced sequence must be of the same or shorter length.",
    k: ["Relax in the linker vs rely on the compiler's choice: relaxation recovers speed without compiler knowledge, but requires strict code patterns from the compiler.", "Relax all eligible accesses vs only recognized idioms: all gives the best result, while idioms are safer and fail clearly when a pattern differs."],
    p: ["A compiler that changes its instruction scheduling between the marked instructions defeats pattern recognition, and the linker reports an error or skips.", "A rewrite that leaves the replaced bytes differently aligned breaks surrounding code."],
    v: "Link a program with a general-model access and confirm the disassembly of the output shows the cheaper sequence and no call into the loader, and that the value is still per-thread.",
    dep: ["tls-access-models", "link-time-relaxation", "relocation-processing"]
  },
  "address-space-randomization": {
    s: "Choosing random base addresses for the program, libraries, stack and heap on each run, so that an attacker cannot predict where code and data are.",
    d: "The kernel randomizes the stack, heap and mapping base, and the loader places libraries at addresses derived from it. Programs and libraries must be position-independent for this to apply to code. Randomization makes return-address and table-overwrite attacks need an information leak first, but adds relocations, and prevents prelinked addresses from being fixed. The amount of entropy is limited by the address-space size and alignment; small address spaces get little protection.",
    k: ["Randomize every run vs per boot: every run gives each process its own layout, while per boot lets caches and shared pages work across processes.", "Randomize libraries individually vs as one block: individual placement gives more entropy, but one block keeps relative offsets and lets one leak reveal all."],
    p: ["A single leaked pointer into a library reveals its base, making the rest of the protection moot.", "Programs that embed fixed addresses, such as old assembly code, crash when randomized."],
    v: "Run the same program ten times and print the address of a function, a library function, a stack variable and a heap object, confirming each varies between runs.",
    dep: ["position-independent-executables", "segment-mapping", "initial-process-state"]
  },
  "position-independent-executables": {
    s: "Executables built like shared libraries so that the program itself loads at a random address, at the cost of some indirection in its own code.",
    d: "A non-position-independent program has a fixed address, so its code is a predictable target. Building it as position-independent makes it a shared object with an entry point, loadable anywhere by the kernel or loader, and its own addresses are relocated at startup. Calls to its own functions are relative and costless, while access to preemptible globals needs the table. The linker's treatment of such programs is a mix of library and executable rules.",
    k: ["Position-independent executable vs fixed-address: position-independent allows randomization of the program too, while fixed-address is slightly faster on constrained processors and has no startup relocations.", "Relative-relocation packing: packed encodings of relocations shrink load-time cost, but need loader support that older systems lack."],
    p: ["A large program has hundreds of thousands of relative relocations, each requiring a write and a private page at start.", "Legacy tooling that expects a fixed entry address mis-resolves addresses in a core dump or profile."],
    v: "Build the program both ways and run each several times, printing the address of main, confirming one is constant and the other varies, and compare startup time.",
    dep: ["position-independent-code", "address-space-randomization", "runtime-relocation"]
  },
  "prelinking": {
    s: "Precomputing the addresses at which libraries will load and their symbol bindings, storing them in the files, so that the loader has little left to resolve at startup.",
    d: "A prelink tool assigns each library a unique address range, resolves relocations ahead of time using those addresses and writes the results into the files, with a record of the assumptions. At startup, if the libraries load where expected and none changed, the loader skips most work. It was developed to cut startup time for large programs. It conflicts with address randomization, which wants different addresses on each run, and needs to be redone whenever a library changes.",
    k: ["Prelinking on disk vs a runtime cache: prelinking on disk is zero-cost at run time, but modifies binaries, breaks checksums and defeats randomization.", "Fixed global address assignment vs per-program: global assignment avoids conflicts, but limits address space as the library set grows."],
    p: ["A library updated without re-running the tool invalidates the prelinked data, and the loader falls back to full relocation, slower than before.", "Modifying installed binaries makes package verification report them as changed."],
    v: "Prelink a program and its libraries and compare relocations processed at startup with and without, confirming a large reduction. Update one library and confirm the loader detects the mismatch and falls back.",
    dep: ["runtime-relocation", "address-assignment", "relocation-caches"]
  },
  "relocation-caches": {
    s: "Saving the outcome of relocation and symbol lookup for a set of libraries, to reuse in later processes instead of recomputing, without modifying the libraries.",
    d: "Rather than rewriting binaries, a cache keeps the resolved bindings keyed by the identity and version of each library and the order they load. Starting a program that matches an entry maps the shared results and skips lookups. Some systems build the cache for all system libraries at once, load them at a randomized but shared address and map the cache into every process. It wins startup time and memory, but only for libraries from the cache; anything else uses the normal path.",
    k: ["Shared cache for system libraries vs per-program cache: a shared cache benefits every program, while per-program caches fit custom stacks but multiply storage.", "Randomize per boot vs per process: per boot allows one shared mapping, while per process gives more entropy but defeats sharing."],
    p: ["A stale cache after an update binds to old addresses unless entries are validated by identity.", "A shared mapping at a known address across all processes helps an attacker predict library positions."],
    v: "Start a program that uses cached libraries and compare symbol lookups performed and startup time with a program using uncached copies, confirming fewer lookups and shared pages in the memory map.",
    dep: ["runtime-relocation", "build-identifiers", "address-space-randomization"]
  },
  "page-sharing": {
    s: "Letting many processes map the same physical pages of a library's code and constant data, so that memory use does not scale with the number of programs.",
    d: "A library's read-only and executable segments are mapped from the file with the system cache's pages, so every process using it shares one copy. Pages that the loader must write, such as tables and relocated data, are copied on first write and become private. The linker therefore tries to minimize writable relocated data and to group it together. Position-independent code is what makes sharing possible at different addresses in different processes.",
    k: ["Maximize shareable pages vs simplify layout: separating code, constants and relocated data increases sharing, but adds alignment padding and more mappings.", "Shared libraries vs static linking: shared libraries save memory across many programs, while static linking costs a copy per program but starts faster."],
    p: ["Text relocations or relocated constant tables make pages private in every process, silently removing the memory savings.", "Packing relocated data with ordinary data dirties extra pages."],
    v: "Run ten processes using one library and compare total and per-process memory accounting, confirming the library's code pages are counted once in shared memory and its relocated pages as private.",
    dep: ["position-independent-code", "segment-mapping", "read-only-relocations"]
  },
  "control-flow-hardening": {
    s: "Linker and loader support for features that restrict where control may transfer, such as marked landing instructions and protected return stacks, enabled only when every module supports them.",
    d: "Compilers mark each indirect-call target with a landing instruction and record the capability in a property note. The linker combines notes: the feature is enabled only if every input has it, and the procedure linkage stubs use protected forms. The loader checks the note and asks the kernel to enable the protection for the process, and libraries without support may prevent it or force it off. Return-address protection needs the loader to set up a separate stack for each thread.",
    k: ["Enable only if all modules support it vs enable and fault on violations: all-or-nothing is safe for mixed binaries, while forcing it breaks unmarked libraries but gives stronger guarantees.", "Hardened stubs by default vs optional: by default gives protection with a small size cost, while optional lets size-limited builds opt out."],
    p: ["One handwritten assembly file without the note disables the protection for the whole program without any warning.", "Libraries loaded at run time without support either break the process or silently weaken it."],
    v: "Link a program with all objects marked and check the output carries the property, then add one unmarked object and confirm the property is absent, using the note listing tool.",
    dep: ["note-sections", "procedure-linkage-table", "initial-process-state"]
  },
  "kernel-program-loader": {
    s: "The kernel code that recognizes an executable's format, validates it, builds a new address space and sets up the first thread to run.",
    d: "On a request to execute a file, the kernel reads the first bytes, picks the handler for the format and validates the header. It discards the old address space, maps the loadable segments named by program headers, and if an interpreter is named, maps it as well. It then builds the initial stack and starts the thread at the entry point. It does not resolve symbols or load libraries. Errors, such as bad headers or an unsupported machine type, are reported through an execution error with little detail.",
    k: ["Format handlers in the kernel vs a generic user-space loader: in the kernel is fast and simple, while user-space would be flexible but cost an extra process start.", "Strict header validation vs permissive: strict stops hostile files, but rejects unusual yet harmless ones."],
    p: ["A header with overlapping segments or enormous sizes can be used to attack the kernel unless every field is checked.", "The error for a missing interpreter looks like a missing program, misleading users."],
    v: "Execute a valid program, a truncated file and a program naming a missing interpreter, and confirm distinct error results for the latter two and normal start for the first.",
    dep: ["file-header", "program-headers", "segment-mapping", "initial-process-state"]
  },
  "segment-mapping": {
    s: "Mapping each loadable segment's file range into the address space at its virtual address, with extra zeroed memory where the segment's memory size exceeds its file size.",
    d: "For each loadable entry, the kernel or loader maps the file at the page containing the segment's offset, with the permissions given. If memory size exceeds file size, the remainder of the last file page is zeroed and further anonymous zero pages are mapped. File pages are shared and copied on write. The loader first reserves the whole address range of a library as one block, so that segments land at their intended relative offsets, and maps gaps as inaccessible.",
    k: ["Map files directly vs read into memory: mapping shares pages and loads lazily, but requires offsets and addresses to be congruent modulo the page size.", "Reserve one block vs map each segment independently: one block guarantees relative layout and avoids collisions, but needs an upfront size computation."],
    p: ["A segment whose offset and address are not congruent modulo the page size cannot be mapped directly.", "Partial last pages leave stale file bytes beyond the end of data unless the remainder is zeroed."],
    v: "Load a program and compare its memory map to the program headers, confirming each loadable segment is at its address with its permissions, and the zero-filled tail is anonymous memory.",
    dep: ["program-headers", "page-permissions", "address-assignment"]
  },
  "page-permissions": {
    s: "The read, write and execute bits on each mapped page, set from segment flags and tightened by the loader after relocation to enforce that memory is not both writable and executable.",
    d: "Segments carry flags that become page permissions. Code is readable and executable, constants readable, data readable and writable. Policy on many systems forbids a page being both writable and executable, so a segment with both flags fails or is downgraded. The loader temporarily changes permissions when it must patch, then restores them, and the stack's executable permission is requested by a special header entry. Granularity is the page size, which is why segments are aligned to pages.",
    k: ["Strict write-xor-execute vs allowing both: strict blocks injected code, but also blocks just-in-time generated code unless it uses explicit permission changes.", "Make the stack non-executable by default vs by request: by default is safer, but breaks old code that places trampolines on the stack."],
    p: ["A library requesting an executable stack silently makes the whole process stack executable unless policy forbids it.", "Padding between segments, if missing, forces code and data to share a page and permission."],
    v: "Load a program and inspect the memory map: confirm no region is both writable and executable, relocated tables are read-only after startup, and the stack lacks execute permission.",
    dep: ["program-headers", "segment-mapping"]
  },
  "auxiliary-vector": {
    s: "A list of key-value pairs placed on the initial stack by the kernel, giving the loader the program's header address, entry point, page size, random bytes and hardware capabilities.",
    d: "After the argument and environment pointers, the kernel places entries telling the interpreter where the program's headers are mapped, how many there are, the program's entry address, the interpreter's own base, the system page size, whether the process is privileged, a pointer to random bytes for stack protection and keys, the hardware capability bits and the address of kernel-provided helper code. The loader reads them before it can do anything else, and the program's startup code reads some of them later.",
    k: ["Values on the stack vs system calls: stack values are free and available before anything is initialized, but their set is fixed by the kernel version.", "Kernel-supplied random bytes vs loader-generated: kernel bytes are available at the start, while loader-generated ones need an entropy source the loader may not yet have."],
    p: ["A loader that assumes an entry is present on an older kernel misreads garbage.", "Trusting the privilege flag from a forgeable source would let environment-controlled loader features run in privileged programs."],
    v: "Print the auxiliary vector of a running program and confirm the header address matches the mapped program headers and the entry value equals the entry address in the file header, adjusted by load base.",
    dep: ["kernel-program-loader", "initial-process-state"]
  },
  "initial-process-state": {
    s: "What the process contains at its first instruction: a stack with arguments, environment and auxiliary vector, mapped segments, and registers set to known values.",
    d: "The kernel builds a stack containing the argument count and pointers, environment pointers and the auxiliary vector, aligns it as the calling convention requires, and sets the stack pointer. The program counter is the entry point of the program or the interpreter. Most other registers are zero; one may contain a function for the interpreter to call at exit. The thread pointer for thread-local storage is not yet set, which is why the loader must set up the first thread's block itself.",
    k: ["Everything needed on the stack vs fetched by calls: stack data requires no services at start, but increases the amount of data the kernel must build on each execution.", "Randomized stack placement vs fixed: randomized is safer, but changes the top of stack and any offsets that rely on it."],
    p: ["Startup code that assumes a particular stack alignment crashes when the kernel provides a different one.", "Environment strings, if very large, consume stack space and can make a program fail to start."],
    v: "Examine the stack at the first instruction under a debugger and confirm it begins with the argument count, followed by the arguments, a terminator, the environment and the auxiliary vector.",
    dep: ["kernel-program-loader", "auxiliary-vector"]
  },
  "abi-compatibility": {
    s: "The set of promises about calling conventions, data layout, symbol names, versions and relocation meaning that let separately built pieces work together.",
    d: "Everything the linker and loader do assumes that every object agrees on how arguments are passed, how structures are laid out, how names are formed and what each relocation type means. These are fixed in a binary interface specification per target. A library that changes any of them breaks every program that was built against it, and the failure appears at run time. Symbol versions, soname conventions and visibility rules are the tools a library has to evolve without breaking users.",
    k: ["Freeze the interface vs version it: freezing is simple and safe, but prevents fixes, while versioning allows change at the cost of tooling and permanent maintenance.", "Check compatibility at load vs trust: checking catches mismatches early with a clear error, but needs data recorded in every binary."],
    p: ["A library changes a structure's size in a minor release, and old programs corrupt memory silently.", "Mixing objects built with different standard library settings links without error and breaks at run time."],
    v: "Build a program against version one of a library, replace the library with version two on its stated compatible list, and run the program's tests unchanged. A compatibility checker should report no removed or changed exports.",
    dep: ["link-time-symbol-versioning", "runtime-symbol-versioning", "binding-and-visibility", "relocation-types"]
  },
  "link-order-semantics": {
    s: "The rule that the order of inputs, libraries, scripts and options changes the result, in which definitions win, which members are included and what initializers run first.",
    d: "Input order affects archive extraction, which of several weak definitions prevails, where sections land in the output, the order of initializers inside a library and the order in which symbols are searched at run time through the dependency list. Because it is implicit and spread across build files, it is a frequent cause of builds that work on one machine only. Deterministic ordering, explicit groups and dependencies declared on libraries rather than on the final command line reduce the risk.",
    k: ["Order-sensitive linking vs order-independent search: order-sensitive is fast and well understood, while order-independent is forgiving but may choose differently than older builds did.", "Build system derives order from dependencies vs hand-maintained lists: derived order stays correct as code changes, but requires accurate dependency declarations."],
    p: ["A refactor that reorders library lines in a build file changes which definition wins without any error.", "Parallel build systems that assemble the object list from unordered file listings produce different orders on different machines."],
    v: "Link the same set of objects and archives in two different orders and compare the symbol tables and link maps: differences should be only those the order is documented to cause, and the default build order should be identical across machines.",
    dep: ["input-ordering", "resolution-precedence", "initialization-order", "symbol-lookup-scopes"]
  },
  "link-time-vs-load-time": {
    s: "The decision of how much binding, layout and resolution to do when linking versus when starting, trading startup speed and safety against flexibility and sharing.",
    d: "Static linking resolves everything early: fast start, no dependency problems, but each program carries its libraries and cannot take library fixes without relinking. Dynamic linking defers library binding to start or first call, sharing memory and allowing updates, but spends time on every start and can fail on a different machine. Position independence, lazy binding, prelinking and caches are different points between the two. The choice affects deployment, update policy and security.",
    k: ["Static vs dynamic linking: static is self-contained and fast to start, while dynamic shares memory and allows library updates without rebuilding every program.", "Bind early vs bind late: early binding fails sooner and is hardened more easily, while late binding allows interposition, plugins and faster startup."],
    p: ["A statically linked program embeds a vulnerable library copy that is never updated by system patches.", "A dynamically linked program works in the build environment and fails to start on a customer's system with different libraries."],
    v: "Build the same program statically and dynamically and compare start time, memory per process with several copies running, and behavior after replacing a library with a patched one.",
    dep: ["lazy-binding", "immediate-binding", "relocation-processing", "runtime-relocation"]
  },
  "startup-cost-budget": {
    s: "The time and memory a process may spend between exec and main, spent on mapping, relocation, symbol lookup and initializers, and a limit that grows with every dependency.",
    d: "Each library adds mapping, relocation processing, symbol lookups against every earlier library and initializers. Programs with hundreds of libraries or large relocation tables start slowly. Measures to stay within a budget include exporting fewer symbols, packing relative relocations, using fast hash tables, lazy binding, delay loading, prelinking or caches, and avoiding heavy work in initializers. Short-lived programs and command-line tools feel it most, as do servers that restart often.",
    k: ["Spend effort on fewer dependencies vs faster loading of many: fewer dependencies helps every metric, but forces architectural changes, while faster loading is local but leaves the structure alone.", "Measure at the loader vs at the program: loader statistics isolate linking cost, while whole-process timing includes initializers and file cache effects."],
    p: ["A single dependency added for one small function adds its whole dependency tree to every start.", "A budget measured with a warm cache is exceeded on first start after a reboot."],
    v: "Measure time from exec to the first line of main with a cold and a warm file cache, and with loader statistics showing time in relocation, lookup and initializers. Compare to the stated limit.",
    dep: ["dependency-loading", "runtime-relocation", "symbol-hash-tables", "init-and-fini-arrays"]
  },
  "security-posture": {
    s: "The combination of randomization, read-only tables, non-executable data, control-flow checks and restricted environment influence that makes the loaded program hard to exploit.",
    d: "Linkers and loaders are on the attack surface twice: as parsers of untrusted files and as the component that decides memory permissions and where code goes. Defenses include position-independent code with randomized bases, sealing relocated regions, refusing writable-and-executable segments, control-flow markers, ignoring environment-controlled features in privileged programs and validating headers. Each costs something in size, startup time or compatibility, and a single input built without the feature can weaken the whole.",
    k: ["Strict policy with refusal vs warnings only: refusing is effective, but breaks legacy code at deployment, while warnings are tolerated and ignored.", "Hardening by default vs by build flag: by default protects everyone, while a flag lets projects choose and leaves many unprotected."],
    p: ["An environment variable honored by a privileged program lets any user inject code.", "A library search path writable by unprivileged users allows replacement of a library used by privileged programs."],
    v: "Run a hardening checker on each shipped binary and confirm it reports randomized base, sealed relocation region, no writable-and-executable segments and control-flow markers. Run a privileged copy with a malicious preload variable and confirm it is ignored.",
    dep: ["address-space-randomization", "read-only-relocations", "page-permissions", "control-flow-hardening"]
  },
  "reproducibility": {
    s: "The property that the same inputs, in the same order, with the same options, always produce byte-identical output, regardless of machine, time or thread scheduling.",
    d: "The linker is deterministic only if input order is fixed, tie-breaks do not depend on hashes or threads, no timestamps or absolute paths are embedded, and identifiers derive from content. Compilers, archivers and the build system must also cooperate: archives with timestamps and file listings in directory order are common sources of variation. Reproducible output enables caching, independent verification that a binary came from published source, and trustworthy comparison of builds.",
    k: ["Strict determinism vs faster nondeterministic algorithms: determinism enables caching and verification, but may cost some parallel speed or require canonical sorting.", "Normalize inputs in the build vs in the linker: normalizing at the build is simple, while linker normalization handles inputs from any producer."],
    p: ["An archive tool that stores modification times makes every build differ even when no code changed.", "A build path embedded in debug data makes outputs differ between machines."],
    v: "Build the same commit on two machines in different directories and compare the outputs with a byte comparison: they must be identical, and a rebuilt artifact must match the one published for that version.",
    dep: ["deterministic-output", "path-remapping", "build-identifiers", "input-ordering"]
  },
});
