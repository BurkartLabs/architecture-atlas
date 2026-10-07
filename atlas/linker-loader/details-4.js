// Details for the linker & loader plate, part 4: dynamic linker, initialization and runtime loading, position independence.
ATLAS.details("linker-loader", {
  "interpreter-handoff": {
    s: "The step where the kernel maps the program, sees an interpreter path in its headers, maps the dynamic linker too and starts execution there instead of at the program.",
    d: "A dynamic executable names an interpreter in a program header. The kernel maps the program's segments and the interpreter's, then passes control to the interpreter's entry with the initial stack holding arguments, environment and the auxiliary vector, which tells it where the program's headers and entry point are. The interpreter finishes setup and finally jumps to the program's entry. A statically linked program has no interpreter and starts directly.",
    k: ["Interpreter named by absolute path vs found by search: an absolute path is simple and secure, but fixes the loader's location across all systems the binary runs on.", "Kernel maps the interpreter vs user space maps everything: kernel mapping keeps the kernel simple for each format, but the interpreter must be self-contained."],
    p: ["A binary built for one system names an interpreter path that does not exist elsewhere, and the error says the program is not found.", "The interpreter and program disagree on version of the format, and the process dies before printing anything."],
    v: "Run a dynamic program under a system call tracer and confirm the kernel maps the interpreter named in the program headers and the first user instruction executed is in the interpreter.",
    dep: ["kernel-program-loader", "program-headers", "auxiliary-vector"]
  },
  "loader-bootstrap": {
    s: "The first code of the dynamic linker, which must relocate itself and find its own tables using no library functions and no global symbols it has not yet fixed up.",
    d: "The loader is a shared library that runs before anything else exists. It computes its own load address from the auxiliary vector or by position-relative code, processes its own relocations using only local data, sets up a minimal allocator and thread pointer, and only then calls ordinary routines. It is built with special flags that avoid external references, stack protection and anything needing initialization. A mistake in this phase crashes with no usable diagnostics.",
    k: ["Self-relocating bootstrap vs relying on the kernel: self-relocation allows a randomized loader address without kernel help, but the first code must be written with extreme restrictions.", "Own allocator vs shared allocator: a minimal private allocator avoids dependencies, but its memory cannot be reused by the program."],
    p: ["A compiler optimization that inserts a call to a library helper in the bootstrap code crashes before relocation is finished.", "Using a global variable before self-relocation reads an unrelocated pointer and faults."],
    v: "Start a program under a debugger, stop at the loader's first instruction and step through, confirming its own relocations are applied before the first call through a global table.",
    dep: ["interpreter-handoff", "auxiliary-vector", "runtime-relocation"]
  },
  "dependency-loading": {
    s: "Reading the program's list of needed libraries, finding and mapping each, and recursively loading what they need, producing an ordered set of loaded objects.",
    d: "Starting from the dynamic section of the program, the loader takes each needed name, searches for it, opens it, checks it is not already loaded under that name or identity, maps its segments and reads its own needed list. The traversal order is breadth-first, and the resulting order defines symbol lookup order and initialization order. Mapping uses the program headers; the loader reserves one contiguous address range then maps segments within it, keeping gaps as inaccessible pages.",
    k: ["Breadth-first load order vs depth-first: breadth-first gives a stable, easily explained lookup order, while depth-first matches initialization needs more naturally.", "Load everything at start vs on demand: loading everything fails early and predictably, while on-demand delays startup cost but may fail mid-run."],
    p: ["Two libraries with the same internal name but different paths are loaded once, silently sharing one.", "A missing optional-looking dependency stops the program before its first line runs."],
    v: "Run a program whose library depends on two others and confirm the loader trace lists the program's needs first, then theirs, with each library mapped once at a distinct address range.",
    dep: ["dynamic-section", "runtime-library-search", "segment-mapping", "program-headers"]
  },
  "runtime-library-search": {
    s: "The loader's ordered search for a named library: the program's embedded paths, environment-supplied paths, a cache of known libraries and default system directories.",
    d: "Given a name without a slash, the loader tries, in order, directories embedded in the program or library, directories from an environment setting, other embedded directories that apply only to direct dependencies, a cache file built from system configuration, and fixed default directories. Embedded paths can use a token for the program's own location, making relocatable installs possible. Names with a slash are used as paths. Privileged programs ignore environment-supplied paths.",
    k: ["Embedded relative-to-program paths vs system-wide configuration: embedded paths make a package self-contained, while system configuration lets administrators replace libraries centrally.", "Cache file vs scanning directories: a cache avoids directory reads at start, but must be regenerated after every installation."],
    p: ["A stale cache after installing a library makes the loader pick the older copy or fail to find the new one.", "An embedded path pointing at a writable directory lets an attacker place a malicious library there."],
    v: "Install a library in two search locations and confirm the loader's search trace shows it checking each in documented order and loading from the first match, and that a privileged copy of the program ignores the environment path.",
    dep: ["dynamic-section", "library-search", "loader-diagnostics"]
  },
  "symbol-lookup-scopes": {
    s: "The ordered list of loaded objects searched for a name: the program, preloaded libraries, then dependencies in load order, with separate scopes for libraries loaded later.",
    d: "To bind a reference the loader searches the global scope in order: the main program, any preloaded libraries, and each dependency in breadth-first order, using each object's symbol hash. The first definition found wins, which is how a program can override a library function. Libraries opened explicitly may have local scopes, searched before the global one or only for themselves. Each lookup checks versions and visibility. This order is the run-time form of link-time precedence.",
    k: ["Global flat scope vs per-library scopes: flat scope allows overriding and sharing, while per-library scopes keep plugins from interfering with each other.", "Search the defining library first vs global order: first-in-library keeps internal calls internal, while global order allows interposition of internal calls too."],
    p: ["Two libraries each exporting the same name bind callers in other libraries to whichever comes first in load order.", "A plugin's private copy of a common library and the host's copy both load, and objects passed between them break."],
    v: "Define the same function in the program and a library and confirm a call from the library reaches the program's version. Mark the library as bound to itself and confirm it reaches its own.",
    dep: ["dependency-loading", "symbol-hash-tables", "resolution-precedence", "preload-and-interposition"]
  },
  "runtime-relocation": {
    s: "Applying the dynamic relocations of every loaded object: adjusting stored addresses for the load base, filling table entries with resolved symbol addresses and setting up thread-local data offsets.",
    d: "After mapping, the loader processes each object's relocation tables. Relative entries add the load base to stored pointers. Symbolic entries look up a name and write its address into a data location or a global table entry. Function-call entries may be deferred. The loader makes writable temporarily any region it must patch, and afterward can seal regions read-only. For large programs this is the largest part of startup, dominated by symbol lookups and by touching pages that are then copied.",
    k: ["Relocate everything at load vs relative only, resolve symbols lazily: everything at load gives predictable runtime and earlier failure, while lazy resolution shortens startup.", "Process objects in reverse dependency order vs forward: reverse ensures dependencies are ready, but complicates interposition."],
    p: ["Every relocated page becomes private to the process, so memory that would be shared across processes is copied.", "A relocation against a symbol that does not exist is a startup error with immediate binding, but a mid-run crash with lazy binding."],
    v: "Count relocations processed at startup with the loader's statistics output and confirm the number equals the total entries in all loaded objects' tables, with symbolic lookups listed separately.",
    dep: ["relocation-sections", "symbol-lookup-scopes", "global-offset-table", "read-only-relocations"]
  },
  "runtime-symbol-versioning": {
    s: "Matching each reference to a specific version of a symbol in a library, using version requirements recorded in the program and version definitions in the library.",
    d: "A program records, for each library, the versions it requires and for each symbol which one it bound to. At lookup the loader finds the symbol and checks its version against the library's definition table. If a required version is absent the loader fails with a message naming it. Hidden versions are skipped. References without version information bind to the default version. This lets a library evolve one function's behavior without breaking older programs that expect the old behavior.",
    k: ["Strict version checking vs name-only lookup: strict checking catches use of a too-old library at start, while name-only is simpler but silently binds to a wrong implementation.", "Default version for unversioned references vs oldest: default is the newest, while oldest preserves the behavior of code built before versions existed."],
    p: ["A program built against a newer library fails at start on an older system with a missing-version error.", "Unversioned references from plugins resolve to the newest implementation, not the one they were written for."],
    v: "Run a program built against a version of a library that is absent on the target and confirm the loader reports the missing version by name, and that it runs after installing a library that defines it.",
    dep: ["link-time-symbol-versioning", "symbol-lookup-scopes", "dynamic-section"]
  },
  "preload-and-interposition": {
    s: "Inserting a library ahead of all others in lookup order, by environment setting or configuration, so its definitions replace those of later libraries.",
    d: "Preloaded libraries are loaded right after the program and searched before regular dependencies, so they can replace allocation, file or network functions to add tracing, testing or sanitizing. The replacement can find the original through a special lookup that skips itself. It only intercepts calls that go through the global tables: calls within a library that were bound directly, or to hidden symbols, are unaffected. It is disabled for privileged programs.",
    k: ["Interposition on by default for exported functions vs direct internal binding: interposable is flexible for tools, while direct binding avoids table calls and is faster.", "Environment-driven vs file-driven preload: environment is per-process and easy, while file-driven applies system-wide and is riskier."],
    p: ["A preload that replaces an allocation function is called before it can initialize and crashes at start.", "Interposing a function that the library also calls internally by a direct call leaves most calls untouched."],
    v: "Preload a library defining a replacement for a library function, run the program, and confirm calls from the program reach the replacement while the replacement can call the original through next-definition lookup.",
    dep: ["symbol-lookup-scopes", "explicit-symbol-lookup", "binding-and-visibility"]
  },
  "audit-interface": {
    s: "A set of callbacks a designated library can register to observe and modify the loader's decisions: library searches, loads, symbol bindings and calls through the procedure table.",
    d: "An audit library is loaded in its own namespace and receives notifications as the loader searches for each name, opens each object, binds each symbol and, optionally, as each lazily bound call is made. It can change the path found, replace the resolved address or record events. This is how profilers and tracers observe dynamic calls without modifying programs. It costs performance for every event, and a bug in the auditor affects the whole process.",
    k: ["Auditing in the loader vs binary instrumentation: loader callbacks see binding exactly, while instrumentation sees everything but is heavier and architecture specific.", "Separate namespace for the auditor vs shared: a separate namespace avoids interference, but duplicates libraries and memory."],
    p: ["An auditor that allocates memory or calls library functions during early callbacks causes recursion or crashes.", "Auditing forces lazy-binding paths to stay active, changing timing for the program under study."],
    v: "Run a program with an audit library that logs bindings and confirm it prints each bound symbol with the library that defined it, matching the loader's own binding trace.",
    dep: ["symbol-lookup-scopes", "runtime-library-search", "lazy-binding"]
  },
  "init-and-fini-arrays": {
    s: "Arrays of function pointers in each object that the loader calls after relocation (initializers) and at unload or exit (finalizers).",
    d: "Compilers place constructors for global objects and functions marked as initializers in an array section, and destructors and finalizers in another. The dynamic section tells the loader where each array lies. After relocating an object, the loader calls its initializers in array order; at exit or unload it calls finalizers in reverse. Older formats use a single function entry instead, and priority levels order functions within one object. Initializers run arbitrary code, so errors here prevent the program from starting.",
    k: ["Array of pointers vs one function per object: arrays allow many entries and priorities without generating a wrapper, while a single function is simpler but needs a generated body.", "Priority numbers within one object vs strictly link order: priorities give control inside a library, but order across libraries is still decided by dependencies."],
    p: ["An initializer that uses a facility from a library not yet initialized crashes or misbehaves.", "Exceptions thrown from an initializer have no handler and terminate the process before main."],
    v: "Define three initializers with priorities in one library and confirm a trace shows them running in priority order before main, and finalizers running in the reverse order at exit.",
    dep: ["dynamic-section", "initialization-order", "relocation-processing"]
  },
  "initialization-order": {
    s: "The sequence in which libraries' initializers run: dependencies first, in an order derived from the dependency graph, with cycles broken by a fixed rule.",
    d: "The loader sorts the loaded objects so that each object's dependencies run their initializers before it does, then the program's own run last before main. Where dependencies form a cycle, one is chosen to run first without its prerequisite being ready. Finalizers run in the reverse order. Within a single object, constructors of global objects in different source files run in link order, which is a long-standing source of order-dependent bugs, since nothing orders objects within a library.",
    k: ["Topological order of libraries vs load order: topological order matches dependencies, but costs a sort and gives a different order from lookup order.", "Lazy initialization on first use vs static constructors: lazy avoids order problems within a library, but adds a check on each use."],
    p: ["Two global objects in different source files, one using the other during construction, work or crash depending on link order.", "A dependency cycle between two libraries lets one initializer run before the other's is complete."],
    v: "Build two libraries where B depends on A, each logging its initializer, and confirm A's runs first. Reverse link order of two objects inside one library and observe the changed order.",
    dep: ["init-and-fini-arrays", "dependency-loading", "input-ordering"]
  },
  "explicit-loading": {
    s: "A program's request to the loader to load a library by name or path while it is running, returning a handle used to look up symbols and unload it.",
    d: "The call takes a name and flags: whether to resolve all symbols immediately or lazily, and whether the library's symbols join the global scope or stay local. The loader does the same search, mapping, relocation and initialization as at startup, and returns a handle or an error string. It is the basis of plugins, optional features and language extension modules. Because code is added to a process with threads running, the loader serializes it with a lock.",
    k: ["Global vs local symbol visibility for loaded libraries: global lets later libraries link against it, while local prevents plugins from clashing.", "Immediate vs lazy resolution on open: immediate reports missing symbols at open, while lazy leaves failures for the first call."],
    p: ["Calling the loader from within an initializer of a library being loaded deadlocks on the loader lock.", "Loading two plugins that each bundle a different version of a common library produces symbol clashes."],
    v: "Load a plugin library at run time by path, look up a function in it, call it and confirm it returns the expected value, then confirm the library appears in the process's memory map.",
    dep: ["dependency-loading", "runtime-relocation", "init-and-fini-arrays", "symbol-lookup-scopes"]
  },
  "explicit-symbol-lookup": {
    s: "Finding a symbol's address at run time by name, in one library, in the global scope or in the libraries after the caller.",
    d: "A lookup call takes a handle or a special value meaning global scope, or next definition after the caller, plus a name, and returns an address or fails. The address of a function can be cast and called; data addresses are used directly. Lookups follow the same scope and version rules as automatic binding, with a default version unless the call names one. Plugin interfaces typically look up one entry point by a fixed name, and tools use it to find the original after interposing.",
    k: ["Lookup by string name vs link-time binding: name lookup supports optional and replaceable code, but gives up type checking and cannot be seen by the linker.", "One entry point returning a table vs many lookups: one table is atomic and versionable, while many lookups are flexible but slower and harder to keep consistent."],
    p: ["A name mismatch from decoration yields a null result, which is called and crashes.", "Looking up a function pointer and caching it past an unload leaves a dangling address."],
    v: "Look up a function by name in a loaded library and in the global scope and confirm the returned addresses equal the addresses shown by the symbol table plus the library's load base.",
    dep: ["explicit-loading", "symbol-lookup-scopes", "runtime-symbol-versioning"]
  },
  "unloading": {
    s: "Removing a library from the process when its last user releases it: running finalizers, unmapping segments and removing its symbols from lookup scopes.",
    d: "When the reference count of a library reaches zero, the loader runs its finalizers, removes it from the scope lists, releases thread-local data it owned and unmaps its address range. Whether memory is actually freed depends on whether anything still points into it: function pointers, vtables, registered callbacks, thread-local destructors, or a library that marked itself as non-unloadable. Many libraries are never safely unloadable, so the call is a hint rather than a guarantee.",
    k: ["Real unmapping vs keeping libraries resident: unmapping returns memory and allows updates, but any retained pointer into the library becomes a crash.", "Library marks itself unloadable vs default permanent: opt-out protects libraries with global registrations, while default permanent wastes memory for plugins that are fine to unload."],
    p: ["A thread created by a plugin is still running plugin code when the library is unmapped, and it faults.", "Callbacks registered with the host and never removed point into freed address space after unload."],
    v: "Load a library, call it, unload it and confirm its finalizer ran, its address range no longer appears in the memory map, and a stored pointer into it faults rather than runs.",
    dep: ["load-reference-counting", "init-and-fini-arrays", "explicit-loading"]
  },
  "load-reference-counting": {
    s: "Counting how many users keep each library loaded, from the program's dependencies and explicit open calls, so that unloading happens only when none remain.",
    d: "Each library has a count raised by every open call and by every loaded library that depends on it, and lowered by close and by the unloading of a dependent. A library loaded at startup as a dependency of the program is never unloaded. Cycles of dependencies complicate counting, as do libraries that were loaded with a flag that makes them permanent. The loader must perform these updates under its lock, and finalizers must be able to run in a defined order.",
    k: ["Count per open call vs a simple loaded flag: counts handle nested users correctly, but a missed close leaks the library for the life of the process.", "Permanent flag for libraries with thread-local data or registrations: permanent is safe, but prevents unload for plugin systems that rely on it."],
    p: ["An unbalanced pair of open and close calls either leaks libraries or unloads one still in use.", "A cycle among plugins keeps each other loaded forever."],
    v: "Open the same library twice, close it once and confirm it is still mapped, close it again and confirm it is gone, using the process memory map after each step.",
    dep: ["dependency-loading", "explicit-loading"]
  },
  "delay-loaded-libraries": {
    s: "A library that is not loaded at startup but on the first call into it, through stubs generated by the linker, to defer cost for rarely used features.",
    d: "The linker creates a table and stubs for functions of a delay-loaded library. The first call goes through a helper that loads the library by name, resolves the function, patches the table entry and continues. Startup avoids loading, relocating and initializing the library, which matters for programs that use a feature seldom. Failure to load surfaces at the first call rather than at start, so programs need a way to handle it.",
    k: ["Delay load vs load at start: delay lowers startup time and memory, but moves failures into the middle of execution.", "Linker-generated stubs vs manual open and lookup: stubs keep source code ordinary, while manual calls make failure handling explicit."],
    p: ["A library missing on the target is discovered only when a user reaches the feature, and the program has no error path there.", "Delay-loaded libraries are loaded inside a lock or signal handler context where loading is unsafe."],
    v: "Link against a delay-loaded library and confirm it does not appear in the memory map at startup, appears after the first call into it, and that a missing library produces the handled error.",
    dep: ["explicit-loading", "procedure-linkage-table", "lazy-binding"]
  },
  "position-independent-code": {
    s: "Code generated to work at any load address, referencing data and functions relative to the instruction pointer or through the global offset table, needing no changes to its text.",
    d: "Code uses addresses relative to the current position for things in the same module, and loads addresses of things that may be elsewhere from the global offset table, whose entries the loader fills. Text stays unmodified, so pages can be shared by every process using the library. The costs are an extra indirection for external data, an extra instruction sequence for function addresses and, on processors lacking relative addressing, a register reserved to hold the table base.",
    k: ["Position-independent vs fixed-address code: position-independent code is shareable and randomizable, while fixed-address code is a bit faster and needs no table, but cannot be shared at different addresses.", "Assume symbols may be preempted vs assume local: assuming preemptible is correct for interposition, but forces every global access through a table."],
    p: ["Linking non-position-independent objects into a shared library fails or creates text relocations.", "Inline assembly using absolute addresses breaks position independence silently."],
    v: "Link a shared library, load it at two different addresses in two processes and confirm both work, and that the library's code pages are identical and shared between them.",
    dep: ["global-offset-table", "relocation-types", "text-relocations"]
  },
  "global-offset-table": {
    s: "A table of addresses in a module's data, filled by the loader, through which position-independent code reaches globals and functions whose addresses are not known until load time.",
    d: "Code loads a global's address from a table entry at a fixed offset from itself, then uses it. Each entry has a dynamic relocation that the loader resolves to the symbol's address in whatever module defines it. Entries for function calls are in a separate part that may be filled lazily. Because the table is writable data at load time, it is an attractive target for attackers, so it is made read-only after relocation where eager binding is used.",
    k: ["One table for data and calls vs separate tables: separate tables allow one to be sealed read-only while the other stays writable for lazy binding.", "Entries resolved at load vs relative to the module: load-resolved entries support interposition, while module-relative entries are cheaper but fix the binding."],
    p: ["A writable table that stays writable lets an overwritten entry redirect every call through it.", "Large numbers of entries each need a dynamic relocation, slowing startup."],
    v: "Dump a loaded library's table in a debugger before and after relocation and confirm each entry holds the address of the symbol that the relocation names, and is read-only after sealing.",
    dep: ["relocation-sections", "runtime-relocation", "read-only-relocations"]
  },
  "procedure-linkage-table": {
    s: "A set of small stubs, one per external function, through which calls pass so the target can be resolved on first use and the call site stays unmodified.",
    d: "A call to an external function targets a stub in the module. The stub jumps through a table entry. Initially the entry points back into the stub's own second half, which pushes the entry's index and jumps to the loader's resolver; the resolver finds the target, overwrites the entry and jumps there. Later calls go straight to the target. With immediate binding the entries are filled at load and the stub is just an indirect jump. Variants use extra checking instructions for control-flow protection.",
    k: ["Stubs and table entries vs patching call instructions: stubs keep code pages unmodified and shareable, while patching saves an indirection but needs writable text.", "Compact stubs vs aligned and padded: compact stubs save space, while aligned stubs may carry protection instructions."],
    p: ["Taking the address of an external function in different modules yields different stub addresses unless the loader canonicalizes them.", "Stubs add an extra jump for every external call, measurable in tight call-heavy code."],
    v: "Call an external function twice under a debugger and confirm the first call enters the resolver and the table entry changes to the function's address, while the second call skips the resolver.",
    dep: ["global-offset-table", "lazy-binding", "relocation-processing"]
  },
  "lazy-binding": {
    s: "Resolving a function's address at its first call instead of at load, spreading lookup cost over the run and skipping functions never called.",
    d: "Entries for function calls start pointing at the resolver. On first call the resolver identifies the function and library from the entry's relocation, searches the scopes, writes the address and transfers control. Many programs call few of the functions they link, so startup shrinks. The costs are the first-call delay at an unpredictable time, a writable table for the life of the process, and runtime failures for names that do not resolve, discovered when the call happens.",
    k: ["Lazy vs immediate binding: lazy gives faster startup, while immediate gives predictable timing, earlier failure and a sealed table.", "Lazy for everything vs only for large libraries: selective lazy binding balances startup against safety, but needs configuration."],
    p: ["A real-time or latency-sensitive thread takes a lookup delay on its first call to a function.", "A missing function is found only when the code path runs in production, killing the process mid-task."],
    v: "Run a program with lazy binding and trace calls: confirm functions never called are never looked up, and that the same program with immediate binding looks up all of them at startup.",
    dep: ["procedure-linkage-table", "global-offset-table", "symbol-lookup-scopes"]
  },
  "immediate-binding": {
    s: "Resolving every symbol, including function calls, before the program starts, so that all failures appear at launch and the tables can be made read-only.",
    d: "Selected by a link flag, a loader environment setting or a flag in the object, the loader processes all call relocations during startup, not at first call. Missing functions are found before main runs, startup time is higher and the function-call table can be sealed read-only after relocation. It is the usual choice for security-hardened builds and for programs where first-call latency is unacceptable.",
    k: ["Immediate binding by default vs by request: by default is safe and predictable, while by request keeps the faster startup of lazy binding for tools and short programs.", "Per-object flag vs global setting: per-object lets one library demand it, while a global setting overrides every library uniformly."],
    p: ["A program that links hundreds of libraries and calls few of them starts noticeably slower.", "A function referenced only on a rare path but missing from the target stops the whole program at startup."],
    v: "Start a program with immediate binding and confirm the loader trace shows every call relocation processed before main, and the function table pages are read-only in the memory map.",
    dep: ["runtime-relocation", "read-only-relocations", "global-offset-table"]
  },
  "read-only-relocations": {
    s: "Making the regions that were patched during relocation read-only before the program runs, so that tables of addresses cannot be overwritten by an attacker.",
    d: "Data such as the global offset table, constant pointer arrays and virtual dispatch tables must be writable while the loader fills them but are never legitimately written afterward. The linker groups them into a region marked in the program headers; once relocation is done, the loader changes the pages to read-only. With immediate binding this covers the whole function table. Cost is one more protection call and some page alignment padding.",
    k: ["Seal after relocation vs leave writable: sealing blocks table overwrites, but prevents lazy binding of the sealed entries and some self-modifying tricks.", "Group relocated data into one region vs scatter: one region needs a single protection call and little padding waste, but constrains layout."],
    p: ["Libraries compiled without placing constant tables in the relocated region leave them writable, and the protection is partial.", "Code that deliberately patches a table at run time faults after sealing."],
    v: "Inspect the process memory map after startup and confirm the relocated region is read-only, then confirm a write to a table entry from a test program faults.",
    dep: ["program-headers", "global-offset-table", "page-permissions"]
  },
  "copy-relocations": {
    s: "A link-time trick for non-position-independent executables: the linker copies a shared library's data object into the program's own data and redirects all references to the copy.",
    d: "An executable that references a library variable by absolute address cannot use a table entry. The linker reserves space in the executable's zero-initialized data, and a dynamic relocation tells the loader to copy the library's initial value into it at startup. Library code is then bound by the loader to the copy through normal lookup. All modules thereby see one object at the program's address. It makes size and layout of the variable part of the library's interface.",
    k: ["Copy relocation vs access through the table: copy saves an indirection in non-position-independent code, but freezes the object's size into the program.", "Allow in executables only vs everywhere: allowing it in position-independent builds removes a cost, but leaves pointer identity surprises for shared libraries."],
    p: ["The library later grows the variable, and the old program copy is too small, corrupting its neighbors.", "Pointer comparisons of the variable's address give different results in modules that were not bound to the copy."],
    v: "Link an executable referencing a library variable and confirm a copy relocation appears, the variable's address is inside the executable's data, and library code sees the same address.",
    dep: ["runtime-relocation", "relocation-types", "symbol-lookup-scopes"]
  },
  "indirect-functions": {
    s: "Symbols whose address is the result of calling a resolver at load time, used to choose among implementations by processor capability.",
    d: "A function marked as indirect has a resolver that returns the address of the implementation to use, for example a vectorized copy routine when the processor supports it. The loader calls the resolver during relocation and stores the result in the table entry. Resolvers run very early, before much of the program is initialized, so they may use only simple code and data. Static executables run them during startup, using entries processed by the startup code.",
    k: ["Load-time dispatch vs checking a flag at each call: load-time dispatch has no per-call cost, while a flag check is simpler but costs a branch on each call.", "Resolver per function vs a shared capability record: per-function resolvers are flexible, while a shared record is computed once and read by all."],
    p: ["A resolver calling a function that itself needs resolving crashes during relocation.", "A resolver reading uninitialized capability data selects the generic slow routine silently."],
    v: "Run a program on a machine with and without a processor feature and confirm a trace shows the resolver choosing the matching implementation each time, and calls reach it.",
    dep: ["runtime-relocation", "global-offset-table", "relocation-types"]
  },
  "text-relocations": {
    s: "Dynamic relocations that patch the code section itself, a sign that code was not compiled as position-independent and one that most systems now reject.",
    d: "When a shared library contains absolute addresses in code, the loader must write to the text pages, making them writable and private to each process. This defeats sharing, costs memory and startup time, and conflicts with policies that forbid writable code. The linker can warn or refuse. Text relocations arise from handwritten assembly, objects built without position-independent flags, or old libraries. Detecting them is a standard link-time check.",
    k: ["Refuse text relocations vs allow with a warning: refusing enforces security and sharing, while allowing keeps legacy libraries working.", "Fix in the source vs link-time workaround: fixing the code removes the problem, while a workaround leaves each process with its own copy of the text."],
    p: ["A single assembly file with an absolute address gives the entire library text relocations.", "Systems that forbid writable executable memory fail to load the library with an opaque error."],
    v: "Link a library with one absolute reference in code and confirm the dynamic section reports a text-relocation flag, and that the loader fails or warns on a system that forbids it.",
    dep: ["position-independent-code", "relocation-sections", "page-permissions"]
  },
});
