// Details for the linker & loader plate, part 1: driver, diagnostics, inputs.
ATLAS.details("linker-loader", {
  "linker-driver": {
    s: "The front end that parses options, expands libraries and defaults, orders inputs and runs the link phases from reading files to writing the output.",
    d: "The driver turns a command line into a plan: which objects and archives to read, which default libraries and startup files to add, which output kind to produce (executable, shared library, relocatable object) and which flags change policy. It then runs the phases in order: read inputs, resolve symbols, discard unused sections, lay out, relocate, write. The compiler front end usually invokes it with a long implicit option list, so the effective command is rarely what a developer typed.",
    k: ["Compiler-driven linking vs calling the linker directly: the compiler supplies correct startup files and default libraries, but hides the real command line and makes flag order harder to control.", "One monolithic pass vs phases with dumpable state: monolithic is faster to write, while phases let diagnostics and maps explain each decision."],
    p: ["Implicit default libraries or startup files differ between toolchains, so a link that works in one build environment fails in another.", "Option order is significant for some flags, and wrappers that reorder or deduplicate flags change which symbols resolve."],
    v: "Run the link with the driver's verbose option and confirm the printed linker command lists the startup files, default libraries and every input in the order that the resulting map shows.",
    dep: ["response-files", "input-ordering", "object-inputs"]
  },
  "response-files": {
    s: "Files holding command-line arguments, used when the list of inputs and options exceeds the operating system's limit on argument length.",
    d: "A large program has thousands of object files, and the combined command line can exceed what the operating system allows a process to receive. The driver writes arguments to a file and the linker expands it in place, so the argument order is preserved. Nested files, quoting rules and path escaping vary between tools. Build systems generate these files, which makes them the usual place to inspect what a failing link really received.",
    k: ["Expand in place vs append at the end: in-place expansion preserves order semantics, while appending is simpler but silently changes which archives satisfy which references.", "Generated per-link files vs a shared file: per-link files are exact and disposable, while shared files accumulate stale inputs."],
    p: ["Quoting or escaping differences between the build tool and the linker split a path with a space into two inputs.", "A stale response file left in a build directory is reused after the object list has changed."],
    v: "Link a program with a file list long enough to exceed the argument limit and confirm it succeeds, and that the link map shows the inputs in the same order as the file.",
    dep: ["linker-driver"]
  },
  "parallel-linking": {
    s: "Using multiple threads for the phases of a link that can run independently, such as reading and parsing inputs, scanning relocations, and copying section contents into the output.",
    d: "Reading and decompressing inputs, building per-file symbol tables, scanning relocations and writing output sections are independent per file or per section, so they parallelize. Symbol resolution and layout need a consistent global view and are harder to split. Concurrent hash tables, atomic claims on definitions and deterministic tie-breaking keep results identical to a serial link. Gains are limited by the serial portion and by memory bandwidth on very large inputs.",
    k: ["Parallel symbol resolution with atomics vs serial resolution: parallel is faster on huge link sets, but must reproduce the serial winner exactly or output varies run to run.", "Many threads vs a bounded pool: unbounded threads compete with the build system's own parallel jobs and slow the whole build."],
    p: ["A race in choosing among duplicate weak definitions yields different output on different runs.", "Linking inside a build that already uses every core makes threads contend, so the link is slower than serial."],
    v: "Link the same inputs with one thread and with many and confirm the outputs are byte-identical while the wall-clock time drops measurably on a large input set.",
    dep: ["global-symbol-table", "deterministic-output"]
  },
  "incremental-linking": {
    s: "Updating a previous output in place when only a few inputs changed, instead of relaying out and rewriting the whole program.",
    d: "The linker keeps padding between sections and a record of where each input landed. When an object changes, it patches the new contents into the old slot if it fits, or into reserved space, and reapplies only affected relocations. A full link is the fallback when layout would change. It lowers edit-link-run time for huge programs, but the output is no longer a pure function of the inputs, and the extra bookkeeping inflates the file.",
    k: ["Padded in-place patching vs always relinking: patching makes small edits near-instant, but outputs are larger and depend on edit history.", "Incremental in development only vs everywhere: restricting it to development keeps release outputs reproducible while keeping the fast loop."],
    p: ["Accumulated patches bloat the file and degrade locality until a clean link is forced.", "Shipping an incrementally linked binary produces an output that differs from a clean build of the same sources."],
    v: "Link, change one function in one object, relink, and confirm the time is a small fraction of a full link and the program runs the change. A clean link of the same inputs must give the same behavior.",
    dep: ["address-assignment", "relocation-processing", "output-file-writing"]
  },
  "output-file-writing": {
    s: "Producing the final file: choosing its size up front, copying section contents into place, filling gaps, writing headers and marking it executable.",
    d: "Once layout is fixed, the output size is known, so the linker can allocate the file, map it into its own memory and have threads write each section at its final offset. Headers and tables that depend on everything else are written last. Large outputs are written to a temporary name and renamed so a failed link does not leave a half-written program in place. Filesystem behavior, such as sparse files and memory-mapped writes, affects speed more than computation does.",
    k: ["Memory-mapped output vs buffered writes: mapping avoids copies and allows parallel writers, but a full disk or a truncated file can crash the linker with a memory fault rather than an error.", "Write then rename vs overwrite in place: renaming protects running copies and failed links, but breaks hard links and consumes double space briefly."],
    p: ["Overwriting a binary that a process is running can corrupt that process or fail with a text-busy error.", "A link killed midway leaves a truncated file that looks like a valid output to a build system."],
    v: "Kill the linker partway through a link of an existing output and confirm the previous output is unchanged. A completed link must produce a file that passes the format checker's structural validation.",
    dep: ["section-headers", "program-headers", "address-assignment"]
  },
  "deterministic-output": {
    s: "Making the same inputs always produce the same bytes, by fixing the order of everything the linker would otherwise choose by timing, hash order or environment.",
    d: "Identical output needs a defined order for inputs, symbols, sections and strings regardless of thread timing or hash table iteration. The linker also avoids embedding timestamps, absolute paths and random values, or lets the caller replace them. A build identifier derived from contents, not from time, completes the picture. This allows output caching, verification by independent rebuilds and meaningful binary diffs, and it breaks easily when one phase iterates a hash map.",
    k: ["Sorted, canonical ordering vs insertion order: sorting costs time on large tables but removes dependence on thread schedule and filesystem listing order.", "Content-derived identifiers vs random or time-based ones: content-derived lets rebuilds match, but identical contents from different source states become indistinguishable."],
    p: ["Iterating an unordered table to emit symbols makes output differ between runs, defeating build caches.", "Embedded absolute build paths make otherwise identical outputs differ between machines."],
    v: "Link twice on different machines, directories and thread counts from the same inputs and confirm a byte comparison of the outputs reports no differences.",
    dep: ["build-identifiers", "path-remapping", "input-ordering"]
  },
  "duplicate-symbol-errors": {
    s: "The error reported when two inputs both define the same strong global name, naming the symbol and the two places that define it.",
    d: "When resolution finds a second strong definition of a name, the linker cannot choose, so it stops and reports the symbol and both defining files, with source locations if line tables are available. Weak, common and grouped definitions are exempt by rule. Typical causes are a function defined in a header without an inline marker, the same library linked twice under different names, or an archive member pulled in beside an object that defines the same names.",
    k: ["Fail on any duplicate vs allow with a flag: failing is safe, while allowing the first wins and hides ODR-style bugs that surface as wrong behavior later.", "Report all duplicates vs stop at the first: all of them speeds fixing a header mistake, but produces long, noisy output."],
    p: ["Allowing duplicates to get a build through makes behavior depend on input order, and breaks when order changes.", "The message names object files in a temporary build directory, not the source files that need editing."],
    v: "Define one global function in two source files and link. Confirm the error names the symbol and both object files, and that the link produces no output file.",
    dep: ["resolution-precedence", "global-symbol-table", "debug-sections"]
  },
  "undefined-symbol-errors": {
    s: "The error reported when a reference has no definition anywhere in the inputs, naming the symbol and each file that references it.",
    d: "After all inputs and libraries are read, any symbol still undefined and not marked weak is an error. A good report lists the referencing files and, with line tables, the function or source line, and demangles names so they match source. The usual causes are a missing library, a library placed before its users on the command line, a name mismatch from different declaration conventions, or a function compiled out by configuration.",
    k: ["Report at the end vs at first use: end-of-link reports see all inputs and avoid false alarms, but delay feedback on very large links.", "Allow undefined in shared libraries vs forbid: allowing supports plugins that resolve against a host, while forbidding catches missing dependencies at link time instead of at run time."],
    p: ["A library named after its users on the command line fails to resolve, though the library exists and is found.", "Shared libraries linked with undefined symbols allowed fail only when the program runs on another machine."],
    v: "Reference a function that no input defines and confirm the error names the demangled symbol and each referencing object. Add the library after the object and confirm the link succeeds.",
    dep: ["global-symbol-table", "input-ordering", "library-search"]
  },
  "link-map": {
    s: "A text report of the final layout: every output section, which input sections landed in it, their addresses and sizes, and which symbols were discarded.",
    d: "Generated on request, the map lists output sections in address order with the contributions of each input file and section, plus alignment padding, discarded sections and the archive members that were pulled in and why. It is the first tool for size investigations and for checking that a script placed code in the right region. For large programs it is huge, so tools summarize it by file, library or symbol.",
    k: ["Verbose map with all inputs vs summary only: verbose answers every layout question but can be gigabytes on large programs, while summaries lose attribution.", "Map written during the link vs reconstructed afterward: writing during the link is exact, while reconstruction from the output cannot show discarded or folded sections."],
    p: ["Reading sizes from the map before dead code removal runs attributes space to code that is later discarded.", "Maps from different linker versions use different formats, so size-tracking scripts silently break on upgrade."],
    v: "Produce a map, pick one function, and confirm its address and section in the map equal what the symbol table and a disassembly of the output report.",
    dep: ["section-merging", "output-section-assignment", "address-assignment"]
  },
  "resolution-tracing": {
    s: "Options that report why a particular symbol resolved as it did, or why an archive member or library was loaded, by tracing the linker's decisions.",
    d: "The linker can print each input file as it is opened, the symbol that caused each archive member to be extracted, and which definition satisfied each reference. With a trace on one name, it reports every definition and reference it sees, in order. This answers questions that otherwise need guesswork: why an unwanted object is in the program, why a weak definition lost, why a library on the command line contributed nothing.",
    k: ["Always-collected trace data vs enabled on demand: always-on costs memory and time on every link, while on-demand needs a rerun to answer a question about a link that already happened.", "Trace by symbol vs by file: symbol traces answer why, while file traces show order but not causes."],
    p: ["Tracing is run with different options than the failing build, so the trace shows a different resolution.", "Trace output for large links is so long that the relevant line is never found."],
    v: "Trace one symbol defined in an archive and confirm the output names the archive member that supplied it and the first reference that caused it to be extracted.",
    dep: ["global-symbol-table", "archives", "resolution-precedence"]
  },
  "cross-reference-reports": {
    s: "A table listing each symbol with its defining file and every file that references it, used to audit dependencies and find unwanted coupling.",
    d: "The linker records, for every symbol, where it is defined and which inputs refer to it. Reports sort this by symbol or by file, and can be limited to symbols referenced from only one place. Teams use it to find unused exports, layering violations between libraries and candidates for removal. It is derived from the same relocation and symbol data the linker already holds, so cost is mostly in producing and storing the text.",
    k: ["Linker-produced reports vs post-processing the map: linker reports see exact resolution, while post-processing works with any linker but misses what was discarded.", "Whole-program reports vs per-library: whole-program shows true usage, while per-library is cheap but cannot see external users."],
    p: ["Counting references from sections that are later discarded makes dead code look used.", "References through a table or function pointer set do not appear as direct references, so seemingly unused functions are still needed."],
    v: "Generate a report and confirm a function called from exactly two files lists those two files as its referencers, and a symbol that no one references is flagged unreferenced.",
    dep: ["global-symbol-table", "relocation-sections", "dead-code-stripping"]
  },
  "loader-diagnostics": {
    s: "The dynamic linker's own debug output and error messages: which libraries it searched for, which paths it tried, which symbols bound where, and why a load failed.",
    d: "Controlled by environment settings, the loader can print each library search path tried, each library loaded, each relocation processed and each symbol lookup with the scope it found it in. Failure messages name the missing library, symbol or version. Output is large at startup, so it is selected by category. It is the only way to see run-time resolution, which differs from link-time resolution because of search paths, preloading and interposition.",
    k: ["Rich diagnostics in the production loader vs a separate debug build: shipping them allows field diagnosis, but adds code to a security-sensitive early-start component.", "Silent fallback vs hard failure on a missing optional library: fallback keeps programs running, but hides misconfiguration that shows up as missing features."],
    p: ["Enabling diagnostics slows startup enough to change a race or timing bug under investigation.", "Environment-controlled diagnostics are honored in privileged programs, leaking paths or enabling attack, unless they are ignored for them."],
    v: "Run a program with search tracing enabled and confirm the output lists every directory tried in order, then the path from which each needed library was loaded.",
    dep: ["runtime-library-search", "dependency-loading", "symbol-lookup-scopes"]
  },
  "object-inputs": {
    s: "The relocatable object files named directly on the command line, always included in full, each carrying its sections, symbols and relocations.",
    d: "Every object named explicitly is read and its sections become candidates for the output, regardless of whether anything references them. The linker validates the header, checks that the target and flags match the output, parses sections and symbol tables, and registers definitions and undefined references. It also handles objects embedded in other containers, such as bitcode for link-time optimization. Mismatched targets, incompatible floating-point conventions and version incompatibilities are caught here.",
    k: ["Strict compatibility checking vs permissive merging: strict catches mixed-convention objects early, but rejects some safe combinations.", "Eager parsing of every section vs lazy parsing on demand: lazy saves time when most sections are discarded, but defers error reporting."],
    p: ["Objects built for different conventions or standard library settings link without error and crash at run time.", "An object left over from an earlier build gets linked because a glob picked it up."],
    v: "Link two objects built for different target conventions and confirm the linker rejects the pair with a message naming both files, rather than producing an output.",
    dep: ["file-header", "section-headers", "symbol-table"]
  },
  "archives": {
    s: "A static library: a simple container of object files plus an index, from which the linker extracts only the members that define a currently undefined symbol.",
    d: "An archive holds named members one after another, with a header per member and a table mapping each defined symbol to its member. During a link, the linker scans the index, extracts a member if it defines something currently undefined, and repeats because the new member may add undefined references. Members that nothing asks for are never read. This lazy inclusion is what lets a large library cost only what the program uses, and what makes input order matter.",
    k: ["Lazy member extraction vs including the whole archive: lazy keeps programs small, but a member that is needed only for its side effects is silently left out.", "One object per function vs larger members: fine-grained members minimize unused code, but multiply file count and index size."],
    p: ["A member with only a static initializer, referenced by nothing, is dropped and its registration never runs.", "Updating an archive without refreshing its index leaves symbols that appear missing."],
    v: "Link against an archive containing three members while referencing a symbol from one and confirm the link map shows only that member, and any members it depends on, contributed sections.",
    dep: ["archive-symbol-index", "object-inputs"]
  },
  "archive-symbol-index": {
    s: "A table in an archive mapping every global symbol defined by any member to the member that defines it, letting the linker avoid reading every member.",
    d: "The index is built when the archive is created or updated, by scanning each member's symbol table. At link time the linker loads the index and checks undefined names against it, pulling a member only on a hit. For archives of bitcode objects the indexer must read the intermediate representation to find names. Formats differ in how many members they can address and whether names are sorted for binary search. A stale or missing index looks like an empty library.",
    k: ["Index in the archive vs computed by the linker: stored is fast to load, while computing at link time never goes stale but repeats work every link.", "Sorted index vs hash index: sorted allows search without loading, while hashed is faster for large archives but needs more setup."],
    p: ["Copying members between archives with a tool that does not rebuild the index leaves names undiscoverable.", "Index entries for symbols in members compiled with different flags still match, pulling in a member that later fails compatibility checks."],
    v: "List an archive's index, remove a member without updating it, and confirm the link either reports a corrupt index or the stale entry, then rebuild and confirm the link succeeds.",
    dep: ["archives", "symbol-table"]
  },
  "thin-archives": {
    s: "Archives that store only the paths of their member files, not copies, saving disk space and time when libraries are built from objects that already exist.",
    d: "A thin archive contains an index and references to object files on disk instead of their bytes. Creating it is nearly free, and linking reads the originals directly. This avoids duplicating gigabytes of objects in a large build tree. The cost is fragility: the archive is valid only while the referenced objects exist at the recorded paths, so moving, deleting or shipping the archive alone breaks it.",
    k: ["Thin references vs embedded copies: thin saves space and time in build trees, but the archive cannot be distributed or relocated without its members.", "Relative vs absolute member paths: relative survives moving the whole tree, while absolute works from anywhere but breaks on other machines."],
    p: ["A cleaned build directory removes objects that a surviving thin archive still points to, producing a missing-file error at link time.", "Packaging a thin archive as a deliverable ships something that cannot be linked elsewhere."],
    v: "Create a thin archive, link against it, then move the archive alone to another directory and confirm the link fails with a message naming the missing member paths.",
    dep: ["archives", "object-inputs"]
  },
  "library-search": {
    s: "Locating a library given by name: trying the configured directories in order, preferring a shared or a static form, and recording the result as a dependency.",
    d: "A request like link against library name finds a file by trying each directory in the search list, in order, for a shared library and then a static one, unless the command line forces a kind. Directories come from options, environment settings, toolchain defaults and, for cross builds, a sysroot. Linking against a shared library records its name, not its path, so the loader repeats a search later with a different list.",
    k: ["Search by name vs explicit full path: names allow swapping builds without edits, but make the result depend on directory order and what is installed.", "Prefer shared vs prefer static: shared saves memory and allows updates, while static avoids missing-library failures on target machines."],
    p: ["A stale library earlier in the search path shadows the intended one, so the link succeeds against the wrong version.", "Cross builds that leak host directories link against host libraries of the wrong target."],
    v: "Place two libraries of the same name in two search directories and confirm the link map and the recorded dependency show the earlier directory's version was chosen.",
    dep: ["input-ordering", "dynamic-section"]
  },
  "input-ordering": {
    s: "The rule that the command line is processed left to right, and that an archive can only satisfy references from inputs that came before it.",
    d: "Most linkers process inputs in order, keeping a set of currently undefined symbols. An object adds its undefined references; an archive is scanned once, extracting only members that satisfy what is undefined at that moment. A later object that needs something from an archive already passed will not trigger extraction. Libraries must therefore follow their users, with mutually dependent libraries repeated or grouped. Some newer linkers search archives in any order, which changes which command lines work.",
    k: ["Strict left-to-right processing vs order-independent archive search: strict matches long-standing build scripts, while order-independent is friendlier but can pull different members than existing builds expect.", "Per-library repeat vs group markers: repetition is portable, while group markers say the intent but cost extra passes."],
    p: ["Moving a library flag earlier in a build file turns a working link into a wall of undefined symbols.", "An order-independent linker accepts a command line that an order-strict linker, used elsewhere, rejects."],
    v: "Link an object that needs an archive, placing the archive first, and confirm undefined-symbol errors. Reverse the order and confirm the link succeeds.",
    dep: ["archives", "global-symbol-table", "group-resolution"]
  },
  "group-resolution": {
    s: "A command-line construct that makes the linker rescan a set of archives repeatedly until no new members are pulled in, resolving circular dependencies between them.",
    d: "Two libraries that refer to each other cannot be ordered so each follows the other. Marking them as a group tells the linker to cycle through all of them until a full pass extracts nothing new. It costs extra passes over the indexes. Without it, the alternative is listing a library twice. Overuse hides real layering problems, because circular dependencies between libraries are usually a design defect rather than a requirement.",
    k: ["Rescan group vs repeating library names: groups state the intent and are cheap to maintain, while repetition works on every linker but is easy to break during edits.", "Allow circular library dependencies vs forbid them: allowing is convenient for legacy code, while forbidding keeps the layering enforceable."],
    p: ["A group hides a dependency cycle that later prevents splitting the libraries or building them separately.", "A group containing a large archive repeats its index scan many times and noticeably slows the link."],
    v: "Link two mutually dependent archives without a group and confirm undefined-symbol errors, then wrap them in a group and confirm the link succeeds and extracts members from both.",
    dep: ["archives", "input-ordering"]
  },
  "whole-archive-inclusion": {
    s: "A mode that includes every member of an archive regardless of references, so members that register themselves through initializers are kept.",
    d: "Normal archive handling drops unreferenced members. Some code relies on a member being present for its side effects: a static initializer that registers a plugin, a table section that other code scans. Whole-archive mode extracts every member in the archive, and a matching option turns it off for later inputs. It increases output size and can create duplicate definitions among members that were never meant to be linked together.",
    k: ["Force-include with a flag vs referencing a symbol explicitly: flags are easy, while an explicit reference is local to the code that needs it and survives build changes.", "Whole-archive for shared libraries vs static linking: whole-archive builds a complete shared library from static parts, but exports and carries everything."],
    p: ["Forgetting to switch the mode off applies it to every later library, bloating the output with duplicates.", "Registration members dropped by lazy extraction leave a plugin silently missing at run time."],
    v: "Link an archive whose member only registers an item at startup, first normally and then in whole-archive mode, and confirm the registration appears only in the second program's output.",
    dep: ["archives", "initialization-order", "dead-code-stripping"]
  },
});
