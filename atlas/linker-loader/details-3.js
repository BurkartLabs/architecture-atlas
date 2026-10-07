// Details for the linker & loader plate, part 3: optimization, debug information, object formats.
ATLAS.details("linker-loader", {
  "dead-code-stripping": {
    s: "Discarding sections that cannot be reached from the program's entry points, exported symbols or other roots, by marking from roots through relocations.",
    d: "When each function and variable is compiled into its own section, the linker can treat sections as nodes and relocations as edges. It marks everything reachable from the entry point, exported symbols, initializer tables and sections explicitly kept, then drops the rest. This works only if the compiler emitted separate sections. Roots must include anything reached by means the linker cannot see, such as lookup by name or a section scanned at run time.",
    k: ["Section-per-function with garbage collection vs whole-object inclusion: finer sections shrink output, but increase object size, symbol count and link time.", "Aggressive removal vs keeping anything exported: aggressive gives the smallest program, while keeping exports is safe for libraries whose callers are unknown."],
    p: ["A table of registered items gathered in a custom section is discarded because nothing references it directly.", "Debug and exception data referencing a removed function must also be dropped or the output has dangling entries."],
    v: "Build a program with an unused function in its own section, link with and without stripping, and confirm the function appears in the symbol table of only the first and the output is smaller.",
    dep: ["section-headers", "relocation-sections", "global-symbol-table"]
  },
  "identical-code-folding": {
    s: "Merging functions or data with byte-identical contents and equivalent relocations into one copy, with all references pointing to the survivor.",
    d: "The linker hashes each section's bytes and its relocation targets, then groups sections that are the same, iterating because two functions that differ only by calling folded functions become identical in a later round. One copy is kept and the symbols for the others are redirected to it. Savings are significant for generated and template code. Folding breaks the rule that distinct functions have distinct addresses, which can change program behavior.",
    k: ["Safe folding of address-insignificant sections vs aggressive folding of all: safe keeps address identity where it matters, while aggressive saves more but may violate the language's guarantee of distinct function addresses.", "Hash-based grouping vs pairwise comparison: hashing scales to millions of sections, but needs a final verification against collisions."],
    p: ["Code comparing two function pointers for inequality returns equal after aggressive folding.", "Stack traces show the surviving function's name for a call to a folded one, confusing profiling and debugging."],
    v: "Link a program with two identical functions and confirm the symbol table shows both names at one address with folding on, and distinct addresses with it off.",
    dep: ["section-merging", "relocation-sections", "dead-code-stripping"]
  },
  "link-time-optimization": {
    s: "Optimizing across all objects at link time by having the linker pass intermediate-representation inputs back to the compiler, which then emits final objects for the whole program.",
    d: "Compiled with a flag, objects contain an intermediate representation instead of machine code. The linker reads their symbols, runs resolution, and gives the compiler a view of which definitions are used and exported. The compiler then inlines across files, removes unused functions and devirtualizes calls, and produces native objects that the linker lays out as usual. Partitioning the program lets this run in parallel, trading some optimization for time and memory.",
    k: ["Whole-program in one unit vs partitioned summaries: whole-program finds every optimization but needs huge memory, while partitioned scales and parallelizes at some cost in quality.", "Full optimization at link vs at compile: link-time sees everything, while compile-time keeps the link fast and the objects usable by any linker."],
    p: ["Mixing objects from different compiler versions in an LTO link fails or silently skips optimization.", "Debugging an optimized whole program is harder, since inlining across files erases the boundaries developers expect."],
    v: "Link a program where a hot function lives in another file, with and without link-time optimization, and confirm the disassembly shows the call inlined only in the optimized link.",
    dep: ["lto-symbol-handshake", "object-inputs", "global-symbol-table"]
  },
  "lto-symbol-handshake": {
    s: "The exchange in which the linker tells the compiler which symbols resolved to which definitions, and which are referenced from outside the compiled set.",
    d: "The compiler cannot decide what to delete or internalize without knowing which names the rest of the program uses. After resolution, the linker reports for each symbol whether the prevailing definition is in a compiled input, a native object or a shared library, and whether anything outside refers to it. The compiler can then hide, remove or inline names not used externally. Errors in this exchange yield undefined references to functions the compiler eliminated, or wrong code from a wrongly pruned definition.",
    k: ["Linker plugin interface vs the compiler running its own resolution: a plugin uses the linker's real resolution, but ties compiler and linker versions together.", "Conservative preservation of exported names vs full internalization: conservative is safe for libraries, while full internalization enables the strongest optimization for executables."],
    p: ["A symbol referenced only from an assembly file is not seen by the compiler and gets deleted.", "A compiler-generated runtime library call appearing after optimization has no definition in any input."],
    v: "Reference a function only from a native object, and confirm the optimized link keeps it. Remove the reference and confirm the function is absent from the output.",
    dep: ["link-time-optimization", "resolution-precedence", "export-control"]
  },
  "section-ordering": {
    s: "Placing functions and data in an order chosen for locality, so that code used together at startup or in hot paths shares pages and cache lines.",
    d: "By default sections appear in input order. An ordering file, a profile or the linker's own heuristics can instead place startup code together, hot functions together and cold code at the end, reducing page faults and instruction cache misses. Data can be arranged by access pattern to reduce paging. The linker must still honor alignment, permissions and script rules, and ordering interacts with folding and removal because the set of sections changes.",
    k: ["Ordering from a profile vs from call-graph heuristics: profiles reflect real use, while heuristics need no training run but guess.", "Fine-grained function ordering vs per-object order: function-level ordering gives the best locality, but requires per-function sections."],
    p: ["A stale ordering file lists functions that were renamed, so the intended hot set is silently no longer grouped.", "Ordering by an old profile makes new hot paths land among cold code."],
    v: "Link with and without an ordering file and compare page-fault counts during startup, confirming fewer faults when the listed functions are contiguous in the map.",
    dep: ["output-section-assignment", "profile-guided-layout", "section-merging"]
  },
  "string-merging": {
    s: "Deduplicating identical string constants across all objects, including sharing the tail of one string with a shorter string that ends the same way.",
    d: "String pools are marked mergeable with an entry size and null-termination flag. The linker collects all entries from all inputs, deduplicates them in a hash table and lays out one copy of each, optionally placing a string that is the suffix of another inside it. References are rewritten to point into the merged pool. It reduces size for programs with many repeated constants and for string tables, at the cost of hashing every string at link time.",
    k: ["Tail merging vs exact deduplication only: tail merging saves more bytes, but needs sorting by reversed string and breaks if anyone writes to a string.", "Merging data and debug strings vs only code constants: merging debug strings shrinks debug data, but costs link time on large inputs."],
    p: ["Code that expects distinct addresses for equal strings sees them equal after merging.", "A writable string placed in a mergeable section is shared and one modification corrupts others."],
    v: "Compile the same literal in five sources and confirm the linked output contains one copy while all five references resolve to its address.",
    dep: ["section-merging", "string-tables"]
  },
  "profile-guided-layout": {
    s: "Using execution profiles to arrange code across the whole program so that frequently executed and frequently co-executed functions sit close together.",
    d: "A profile from a representative run records which functions and branches execute and which call each other. The linker or a separate tool computes an order that places hot paths first and keeps callers near callees, sometimes splitting hot and cold parts of a function into separate sections. The result reduces instruction cache misses and page faults. It is only as good as the profile, and it needs the same symbol names at link time as when profiled.",
    k: ["Sampling profile from production vs instrumented test run: production reflects real use, while instrumented runs are controlled but may mismatch real workloads.", "Link-time ordering vs compile-time hot and cold splitting: link-time works across files, while compile-time sees inside functions."],
    p: ["Profiles from a different build do not match symbol names, and the layout step silently does nothing.", "Optimizing for the training workload slows other workloads whose hot paths were treated as cold."],
    v: "Link with a profile derived from a startup workload and measure startup instruction-cache misses or page faults, confirming a reduction against the same link without the profile.",
    dep: ["section-ordering", "symbol-table", "link-time-optimization"]
  },
  "debug-sections": {
    s: "Sections carrying the debugger's data: type and variable descriptions, line tables mapping addresses to source lines, call-frame information and name indexes.",
    d: "Compilers emit debug sections with references to code addresses, which are relocations the linker must apply. When sections are merged, deleted by dead code removal or folded, their debug entries must be updated or dropped. Debug data is often several times larger than the code, which makes it the main cost in link time and file size. Line tables and frame information are partly needed at run time for stack unwinding and profiling.",
    k: ["Full debug data in the binary vs split into a separate file: in the binary it travels with the program, while splitting keeps the shipped file small and the symbols retrievable.", "Merge type information at link time vs leave it per object: merging deduplicates but is slow, while leaving it makes the debugger do the work."],
    p: ["Debug entries for functions removed by garbage collection point to address zero and confuse debuggers.", "Frame tables stripped to save space break exception handling and profiling stack walks."],
    v: "Link a program with debug data, break on a function by name in a debugger, and confirm it stops at the right source line with correct local variables.",
    dep: ["section-headers", "relocation-processing", "dead-code-stripping"]
  },
  "separate-debug-files": {
    s: "A companion file holding the debug sections and the full symbol table of a binary, kept apart from the shipped file and matched to it by an identifier.",
    d: "After linking, a tool copies the debug sections into a separate file, strips them from the shipped one and adds a reference to the companion. The companion has the same section layout and addresses but no code. A debugger or crash tool finds it using the identifier or a recorded name, and applies it to the running or crashed program. This lets servers ship small binaries yet symbolize crashes later, if the companion is archived with each build.",
    k: ["Separate files vs symbol servers keyed by identifier: separate files are simple for one machine, while a server serves many versions and teams.", "Strip after link vs link directly into two outputs: stripping after works with any linker, while direct split avoids a copy of huge data."],
    p: ["The companion file for a released build is not archived, and crashes from the field can never be symbolized.", "A companion that does not match the shipped binary gives plausible but wrong function names."],
    v: "Strip a binary into a companion, run it to a crash, load the core with the companion, and confirm the backtrace shows function names and source lines. Replace the companion with a different build and confirm the mismatch is reported.",
    dep: ["debug-sections", "build-identifiers", "note-sections", "symbol-stripping"]
  },
  "build-identifiers": {
    s: "A unique value embedded in each binary, usually a hash of its contents, used to match the binary to its debug file, crash reports and source version.",
    d: "The linker computes a digest over the output's contents, or accepts a value from the build system, and stores it in a note section that appears in the loadable image. Tools read it from a file or a running process or core dump. Because it comes from content, it is stable across renames and copies. It is the key for symbol servers, update systems and caches. Computing it requires hashing the whole output, and reproducible builds need it to depend on content only.",
    k: ["Content hash vs build-system-assigned value: a content hash is automatic and matches rebuilds, while an assigned value can encode version and date but varies between identical builds.", "Hash size and speed: a short fast hash is cheap to compute, while a long one resists collisions in symbol servers."],
    p: ["Stripping tools that rewrite a binary without updating the identifier produce mismatched debug files.", "Binaries without an identifier cannot be matched to symbols, leaving crash reports unreadable."],
    v: "Read the identifier from a binary and its core dump and confirm both match the identifier recorded in the archived debug file. Rebuild unchanged inputs and confirm the identifier is the same.",
    dep: ["note-sections", "output-file-writing", "deterministic-output"]
  },
  "symbol-stripping": {
    s: "Removing symbol names, debug sections and other non-loadable data from a finished binary to reduce its size and expose less about its internals.",
    d: "A stripped binary keeps what the loader needs, the dynamic symbols and loadable sections, and drops static symbol tables, debug data and optional notes. Levels range from removing only debug data to removing all local symbols. Stripping saves space and makes reverse engineering slightly harder. It also removes the names that profilers and crash reporters rely on unless a companion debug file is kept, and rewriting the file must keep headers consistent.",
    k: ["Strip fully vs keep function names: full stripping is smallest, while keeping names allows readable backtraces without a companion file.", "Strip at link time vs afterward: at link time avoids writing data that is thrown away, while afterward lets one build produce both stripped and unstripped copies."],
    p: ["Stripping a shared library removes symbols that other programs need, if the tool treats dynamic symbols as removable.", "Stripped release binaries without archived symbols make production crashes impossible to analyze."],
    v: "Strip a binary and confirm the static symbol listing is empty while the program still runs and its dynamic symbols still resolve for other modules.",
    dep: ["symbol-table", "debug-sections", "section-headers"]
  },
  "debug-file-lookup": {
    s: "How a debugger or crash tool finds the separate debug file for a binary: by identifier under standard directories, by recorded name and checksum, or from a server.",
    d: "A binary may contain the identifier and a name with a checksum of the companion. The tool computes a path from the identifier in configured directories, falls back to the recorded name next to the binary and in a debug directory, and verifies the checksum or identifier. Remote servers keyed by identifier extend this to fleets. Search order and verification determine whether a mismatched file is ever used, which is the most damaging failure.",
    k: ["Lookup by identifier vs by file name: identifiers are exact across versions, while names are simple but ambiguous between builds.", "Verify checksums before use vs trust the first match: verifying avoids wrong symbols, but costs time and fails when files were legitimately rewritten."],
    p: ["A debugger picks up a debug file for a different build of the same name and shows wrong source lines.", "A configured network server that is slow or unreachable stalls every debugger startup."],
    v: "Place a debug file only under the identifier-derived path and confirm the debugger loads it automatically. Corrupt it and confirm the mismatch is reported instead of used.",
    dep: ["build-identifiers", "separate-debug-files", "note-sections"]
  },
  "path-remapping": {
    s: "Rewriting absolute build paths embedded in debug data and strings into stable logical ones, so outputs do not depend on where the build ran.",
    d: "Debug data records the directory of each compilation and full paths of source files, and some programs embed file paths through assertions or logging macros. Mapping options replace a build directory prefix with a fixed one at compile or link time. This makes builds on different machines produce identical bytes, and lets debuggers find sources in a different checkout by one configured prefix. It must be applied consistently in every tool that embeds paths.",
    k: ["Remap at compile time vs rewrite after link: compile-time remapping covers all embedded copies, while a post-step is simple but misses paths inside compressed or hashed data.", "Fixed logical root vs relative paths: a fixed root is easy to configure in debuggers, while relative paths need a known working directory."],
    p: ["Remapping applied to debug data but not to assertion strings leaves machine-specific paths and differing outputs.", "A remapped path that debuggers cannot resolve makes source stepping show missing files."],
    v: "Build the same source from two different directories with the mapping option and confirm the binaries are byte-identical, and that a search of each for the build directory finds nothing.",
    dep: ["debug-sections", "deterministic-output", "string-merging"]
  },
  "file-header": {
    s: "The fixed-size record at the start of an object, executable or library, identifying the format and giving the machine type, byte order, entry point and locations of the header tables.",
    d: "It starts with an identifying signature, then the word size, byte order and format version, the file kind (relocatable, executable, shared, core), the target processor and its flags, the program entry address and the offsets, sizes and counts of the program and section header tables. Every reader begins here and must validate it before trusting offsets. Corrupt or hostile headers with out-of-range offsets are a classic source of tool crashes and security bugs.",
    k: ["Fixed offsets in the header vs searching for tables: fixed offsets make reading trivial, but tables must be located consistently by every writer.", "Processor flags in the header vs implied: explicit flags allow compatibility checks across conventions, but the set must be extended as new conventions appear."],
    p: ["A reader that trusts header offsets without range checks reads outside the file on a corrupt input.", "Linking objects whose header flags disagree on conventions gives no error and bad code if the linker skips the check."],
    v: "Dump the header of a linked program and confirm the entry address equals the address of the start symbol and the table offsets point to valid headers within the file size.",
    dep: ["section-headers", "program-headers"]
  },
  "section-headers": {
    s: "The table describing each section by name, type, flags, address, file offset, size, alignment and links to related sections, used by the linker and debuggers.",
    d: "Each entry says what a section holds: code, data, uninitialized data, symbols, strings, relocations or notes, and its permissions. Sections are the linker's unit of work: it merges, orders, discards and relocates them. Entries link to each other, for instance a relocation section naming the section it patches and the symbol table it uses. The table is optional at run time, since the loader reads only program headers, so stripping tools may remove or truncate it.",
    k: ["Section table at the end of the file vs the beginning: at the end allows writing contents first and filling the table last, while at the beginning allows fast inspection.", "Explicit section links vs naming conventions: links are exact and checkable, while conventions are simple but fragile."],
    p: ["A tool that edits section contents without updating sizes and offsets leaves a table that disagrees with the data.", "Programs without section tables confuse tools that expect them, though the loader runs them fine."],
    v: "List section headers of a linked program and confirm each loadable section lies inside a loadable segment with matching flags and addresses.",
    dep: ["file-header", "string-tables"]
  },
  "program-headers": {
    s: "The table describing segments: contiguous memory regions to map, with file offset, virtual address, sizes in file and memory, and permissions, plus special entries for the interpreter, thread-local data and notes.",
    d: "The loader sees only this table. Each loadable entry says which bytes of the file go to which address, how much memory to reserve (more than the file size for zero-filled data) and whether it is readable, writable or executable. Other entries name the interpreter, point to the dynamic section, describe the thread-local template, mark the stack's permissions and identify the region to make read-only after relocation. Segments are page-aligned to map directly.",
    k: ["Few large segments vs many small ones: few segments mean fewer mappings and faster loading, while many allow tighter permissions per region.", "Separate code and data segments vs combined: separate segments enforce no-write and no-execute, but waste padding at the page boundaries."],
    p: ["A segment that is both writable and executable defeats memory protection, and some systems refuse to load it.", "File and memory sizes that disagree with section sizes produce a program that loads and then crashes on uninitialized data."],
    v: "Dump the program headers and confirm each loadable segment maps the expected sections, permissions follow the section flags, and the interpreter entry names the loader path.",
    dep: ["file-header", "section-headers"]
  },
  "symbol-table": {
    s: "An array of entries giving each symbol's name, value, size, type, binding, visibility and the section it belongs to or a marker for undefined and absolute.",
    d: "An object file has one table for linking; executables and libraries add a smaller dynamic table of the names the loader needs. Each entry has a name offset into a string table, a value that is a section offset in objects and an address in executables, and a type such as function, data or thread-local. Local symbols come before global ones, and a header field tells where globals begin. The table is the input to resolution and the output that debuggers read.",
    k: ["Separate static and dynamic tables vs one table: separate tables let stripping remove the large static one, while one table is simpler but cannot be reduced without breaking the loader.", "Indexes in relocations vs names: indexes are compact and fast, but need rewriting whenever the table is reordered."],
    p: ["Reordering symbols without updating relocation indexes makes every patch refer to the wrong symbol.", "Unnamed section symbols and file symbols inflate the table and confuse naive tools."],
    v: "Dump a symbol table, pick a function symbol, and confirm its value, size and section match the disassembly's address range and the section header of its section.",
    dep: ["string-tables", "section-headers"]
  },
  "string-tables": {
    s: "Sections holding null-terminated names referenced by offset from symbol, section and dynamic tables, so that entries stay fixed size.",
    d: "Names are concatenated in a string section, and each table refers to a name by byte offset. Separate string tables exist for section names, static symbols and dynamic symbols. Names can share tails, so a name may point into the middle of a longer one. Offsets are stable only as long as the table is not rewritten, and the linker builds new tables from scratch with deduplication. Large programs can have hundreds of megabytes of symbol names, so how names are stored and merged affects link speed and size.",
    k: ["Offset references vs inline names: offsets keep entries fixed size and allow sharing, but the strings must be located through another section.", "Tail sharing vs unique strings: tail sharing saves space, but prevents simple edits of a single name in place."],
    p: ["Editing one name in place changes every other name that shares its tail.", "An offset past the end of a table, in a corrupt file, can make a tool read arbitrary memory if not checked."],
    v: "Resolve every symbol-name offset in a linked program against its string table and confirm each lands inside the table and ends at a terminator within its bounds.",
    dep: ["section-headers"]
  },
  "relocation-sections": {
    s: "Sections listing the patches to apply to another section: each entry gives a location, a relocation type, a symbol index and, in one variant, an explicit addend.",
    d: "An object file carries one relocation section per section that needs patching, linked to its target and to a symbol table. The linker reads each entry and applies its formula. Executables and libraries carry a second set for the loader, covering what must be fixed at start. Entries are either with an explicit addend or leave the addend in the patched bytes. Packed encodings exist to shrink this table for large position-independent programs, where it can be a big share of the file.",
    k: ["Explicit addends vs implicit: explicit entries are larger but make each relocation self-contained, while implicit ones save space but need the patched bytes read first.", "Plain entries vs packed or relative-only encodings: packed encodings shrink load-time data significantly, but need a decoder in the loader."],
    p: ["A relocation entry that names a section removed by garbage collection must be dropped, or the loader processes a stale patch.", "Relocation tables for position-independent programs can take tens of megabytes and slow startup."],
    v: "List the relocation entries of a linked shared library and confirm each location lies inside a writable segment and each symbol resolves to a name or a section base.",
    dep: ["symbol-table", "section-headers", "relocation-types"]
  },
  "dynamic-section": {
    s: "A table of tagged values the loader reads from a dynamic object: required libraries, search paths, symbol and relocation table locations, initializer lists and flags.",
    d: "Located by a program header, it holds entries like the names of needed libraries, the library's own name, search path hints, addresses of the symbol, string, hash and relocation tables, sizes, the initializer and finalizer arrays, version tables and flags such as immediate binding. The loader uses it to treat each loaded object uniformly. Everything is given as an address relative to the load base, so it must be relocated or read relative to it.",
    k: ["Tagged table vs fixed record: a tagged table can add new kinds without breaking old loaders, but each reader must skip unknown tags.", "Names of libraries vs paths: names let the loader search at run time, while paths pin the location and break on other machines."],
    p: ["Unknown tags ignored by older loaders make a feature silently inactive instead of an error.", "A search path hint baked in at build time sends the program to a build directory that does not exist in production."],
    v: "Dump the dynamic section of a program and confirm each needed library is listed with the order the loader reports loading, and that the table addresses fall inside loadable segments.",
    dep: ["program-headers", "string-tables", "symbol-hash-tables"]
  },
  "note-sections": {
    s: "Sections holding typed records of metadata: build identifier, required properties, ABI tags and tool information, readable by name and type without parsing the program.",
    d: "A note is a record with an owner name, a type and a payload. They carry the build identifier, an ABI tag naming the minimum kernel version, hardening capability markers that the loader checks, and vendor-specific information. A note segment makes them readable from a running process or core dump through the program headers. The linker merges notes of the same kind and, for property notes, combines them by an intersection rule: a feature is on only if every input supports it.",
    k: ["Notes in a loadable segment vs only in sections: loadable notes are available at run time and in dumps, while section-only notes disappear when the section table is stripped.", "Intersection of properties vs union: intersection is safe, because a feature is enabled only if every input supports it, but a single old object turns it off."],
    p: ["One input object without a hardening property note silently disables the protection for the whole program.", "Tools that strip all unknown sections remove the build identifier along with unneeded notes."],
    v: "Read the notes of a linked program and confirm the build identifier is present in a loadable segment. Link one object without the hardening note and confirm the output loses the property.",
    dep: ["section-headers", "program-headers"]
  },
  "symbol-hash-tables": {
    s: "Tables built into a dynamic object that let the loader find a symbol by name quickly, using a hash of the name and a chain or filter structure.",
    d: "The loader must look up symbols by name thousands of times at startup. Each library includes a hash table over its exported symbols: an older form with buckets and chains, and a newer form that sorts symbols by hash bucket and adds a Bloom filter so a library that cannot contain the name is rejected in a few memory reads. The table is built by the linker. Faster lookups mean faster startup, and the filter matters because most lookups miss in most libraries.",
    k: ["Bloom filter plus buckets vs plain chains: the filter avoids touching most libraries on a miss, but costs space and requires symbols to be sorted in a particular order.", "Hash computed by the loader at run time vs stored per symbol: storing makes lookup cheap, but fixes the hash function in the format."],
    p: ["A library with only the old table format loads slowly in programs with many dependencies, since every miss walks a chain.", "A bug in the sort order makes the loader miss symbols that exist."],
    v: "Look up a known exported name using the table in a library and confirm it finds the same symbol the full symbol listing shows, while a missing name is rejected by the filter.",
    dep: ["symbol-table", "dynamic-section"]
  },
  "compressed-sections": {
    s: "Sections stored compressed in the file, with a small header giving the algorithm and original size, used mainly for large debug data.",
    d: "Debug sections can be many times the size of the code, and they compress well. A flag marks a section as compressed, and a header gives the algorithm and uncompressed size and alignment. Tools decompress on read. The linker can read compressed inputs, merge them and recompress outputs. Compression trades disk space and transfer time against CPU time at link and debug time. Loadable sections are normally not compressed, because the loader maps pages directly.",
    k: ["Compress debug sections vs store raw: compression cuts file size and transfer cost, but slows linking and debugger startup and prevents direct mapping.", "Per-section compression vs whole-file: per-section keeps random access for tools, while whole-file compresses better but must be unpacked entirely."],
    p: ["A tool unaware of the compression flag reads garbage from a compressed debug section.", "Recompressing very large debug data at the end of a link adds minutes to every build."],
    v: "Link with debug data compressed and confirm the file is smaller, a debugger reads it normally and the section header carries the compressed flag with the original size.",
    dep: ["section-headers", "debug-sections"]
  },
});
