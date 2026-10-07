// Details for the linker & loader plate, part 2: symbols and resolution, layout and relocation.
ATLAS.details("linker-loader", {
  "global-symbol-table": {
    s: "The linker's in-memory map from every symbol name to its current definition, its binding and visibility, and the files that reference it.",
    d: "As each input is read, its symbols are looked up in this table by name. A new definition is compared with the existing entry using the precedence rules, and undefined references are recorded against the name. At the end, every entry is either defined, deliberately undefined or an error. Names are interned strings in a large concurrent hash table, since a big program has millions of symbols. Local symbols are kept per file and never enter it.",
    k: ["Single global table vs per-file tables merged later: a single table resolves as it reads, while per-file tables parallelize better but need a merge step with tie-breaking.", "Interned names vs raw strings: interning makes comparison cheap and saves memory, but the table must outlive every input."],
    p: ["Name collisions between a C-style name and a decorated name that happen to match bind unrelated functions together.", "Memory use grows with symbol count, and debug-heavy programs exhaust memory on small build machines."],
    v: "Dump the final symbol table of a linked program and confirm each global referenced by two objects appears once, with the address of the single definition that the link map shows.",
    dep: ["symbol-table", "string-tables", "binding-and-visibility"]
  },
  "binding-and-visibility": {
    s: "Two symbol attributes: binding says how strongly a definition claims a name, and visibility says who outside the linked unit may see or override it.",
    d: "Binding is local, global or weak. Local symbols are private to the file; global ones take part in resolution; weak ones yield to a global definition. Visibility is default, protected, hidden or internal. Hidden symbols resolve at link time but are removed from the dynamic symbol table, so other modules cannot bind to them. Protected symbols are exported but cannot be overridden from outside. Visibility is decided at compile time and only tightened by the linker, never loosened.",
    k: ["Hidden by default vs exported by default: hiding by default shrinks the export table and enables direct calls, but requires explicit marks on every public function.", "Protected vs hidden: protected still allows outside callers and avoids interposition cost, but complicates function address comparisons across modules."],
    p: ["A symbol that a plugin needs is hidden by a blanket compile flag and fails to resolve at run time.", "Different visibility in two declarations of one name is merged to the most restrictive, surprising the author of the looser one."],
    v: "Compile a function as hidden, link it into a shared library, and confirm it is absent from the library's dynamic symbol listing but still present in the static symbol table.",
    dep: ["symbol-table", "resolution-precedence"]
  },
  "resolution-precedence": {
    s: "The rules deciding which definition wins when a name has several candidates: strong over weak, weak over common, defined over undefined, earlier over later within a kind.",
    d: "On each new candidate the linker compares it with the recorded one. Two strong definitions are an error. A strong definition replaces a weak or common one. Two weak definitions keep the first. A definition from a shared library is replaced by one in an object of the program. Archive members are only pulled for undefined names, so they never override. Shared libraries add search order across the dependency graph, so precedence also has a run-time form with different rules.",
    k: ["First-weak-wins vs size-based choice for common symbols: first-wins is deterministic by input order, while size-based picks the largest so no object's data is truncated.", "Link-time precedence equal to run-time precedence vs different: equal avoids surprises, but different rules exist because libraries are added later than the program was linked."],
    p: ["Which weak definition wins depends on input order, so reordering objects changes behavior without any error.", "A shared-library definition silently loses to a program definition of the same name, changing library behavior."],
    v: "Define one name strongly in an object and weakly in another and confirm the final symbol table shows the strong address, with no error. Remove the strong one and confirm the weak address is used.",
    dep: ["global-symbol-table", "weak-symbols", "common-symbols"]
  },
  "weak-symbols": {
    s: "Definitions or references that do not cause an error when absent or overridden, used for optional features and replaceable defaults in libraries.",
    d: "A weak definition provides a default that any strong definition replaces without complaint, which lets a library offer overridable hooks. A weak undefined reference resolves to zero if nothing defines it, letting code test whether an optional component is linked in. Weak references also do not cause archive members to be extracted, which is a subtle difference from ordinary references. In shared libraries, weak binding interacts with lookup order and dead code removal.",
    k: ["Weak default definitions vs registration callbacks: weak defaults need no runtime code, but depend on link-time presence and order.", "Testing a weak reference for zero vs a configuration flag: the zero test needs nothing extra, but optimizers and position-independent code can mishandle the null address."],
    p: ["A weak reference does not pull in an archive member, so the optional feature is absent even though the library is on the command line.", "A weak function overridden in an unexpected object changes behavior for every caller in the program."],
    v: "Link a program that calls a weak function defined in a library, then add an object with a strong definition. Confirm the call goes to the strong version and the weak one is not reachable.",
    dep: ["binding-and-visibility", "resolution-precedence"]
  },
  "common-symbols": {
    s: "Uninitialized global variables whose declarations in several files merge into one storage area sized to the largest, a legacy mechanism for tentative definitions.",
    d: "Some compilers emit an uninitialized global as common: not placed in any section, only a name, size and alignment. The linker merges all commons of that name into one block in the zero-initialized data section, using the largest size, and gives a real definition priority. Modern compilers default to emitting these as ordinary definitions, which turns the same source into duplicate-symbol errors. Common symbols also defeat per-object optimization, since the final size is unknown.",
    k: ["Common merging vs strict single definition: merging accepts old code that repeats declarations, but hides missing extern markers and mismatched types.", "Size-of-largest vs first-seen size: largest never truncates data, but silently accepts two files that disagree about a variable's type."],
    p: ["Two files declare the same name with different types and sizes, and the linker merges them without any warning.", "Switching to a compiler that does not emit commons turns working legacy code into duplicate definition errors."],
    v: "Declare an uninitialized global in two sources with different sizes and confirm the linked symbol has the larger size. Compile with commons disabled and confirm a duplicate error instead.",
    dep: ["resolution-precedence", "symbol-table", "section-merging"]
  },
  "comdat-groups": {
    s: "Named groups of sections that may appear identically in many objects, of which the linker keeps exactly one copy, used for inline functions and template instances.",
    d: "A compiler that instantiates the same inline function or template in many translation units emits it into a group keyed by a name. The linker keeps the first group with each key and discards the rest, along with the relocations and symbols they define. Groups can require sameness of content, size or nothing at all. Discarded copies leave references in other sections that must bind to the survivor. It makes duplicate definitions legal for exactly the code that must be duplicated.",
    k: ["Keep first group vs verify sameness: first is fast, but verifying catches different definitions under one name from mismatched compile flags.", "Group key by name vs by content hash: names are simple, while hashes allow merging identical code that has different names."],
    p: ["The same inline function compiled with different flags in two objects silently keeps one copy and changes behavior everywhere.", "Debug information that points into a discarded group refers to a missing section unless the linker resolves it."],
    v: "Include one header with an inline function from five sources and confirm the output contains one copy, while the map shows four discarded group sections.",
    dep: ["section-headers", "resolution-precedence", "symbol-table"]
  },
  "symbol-aliases": {
    s: "Additional names bound to the same address as another symbol, including alternate names for one function and names for platform-specific implementations.",
    d: "An alias is a second symbol with the same value and section as a target, so references through either name reach one definition. Libraries use them to expose standard names that point at internal names, and to keep old names alive after renaming. Linker options can also wrap a name, sending references to a replacement while keeping access to the original, or define a symbol from the command line. Aliases do not duplicate code, but affect address comparisons and interposition.",
    k: ["Symbol alias vs wrapper function: an alias costs nothing at run time, while a wrapper allows argument adaptation but adds a call.", "Linker-level wrapping vs source-level replacement: wrapping needs no source change and can intercept library calls, but is invisible in the source and fragile across versions."],
    p: ["Interposing on one name of an aliased pair leaves calls through the other name reaching the original.", "A wrap option applied to calls within the same object does nothing, because those calls are already resolved."],
    v: "Define an alias for a function, call it through both names, and confirm the symbol table lists both with the same address, and that a debugger reports the same function.",
    dep: ["symbol-table", "global-symbol-table"]
  },
  "export-control": {
    s: "Choosing which symbols a shared library or executable makes visible to other modules, through visibility attributes, export lists and linker options.",
    d: "The set of exported names is the library's interface. It is controlled in source by visibility markers, at link time by an export list or by hiding everything not listed, and for executables by an option that exports symbols for use by plugins. A small export set shrinks the dynamic symbol table, speeds loading and lets the optimizer call internal functions directly. Anything exported becomes compatibility surface that callers may depend on.",
    k: ["Explicit allow-list vs exporting everything: an allow-list gives a stable minimal interface, but needs maintenance as the library grows.", "Control in source vs control in a list file: source markers keep intent next to the code, while a list file allows changing exports without recompiling."],
    p: ["Exporting every internal function lets other programs depend on internals, which then cannot change.", "An executable that loads plugins exports nothing by default, and plugins fail to resolve host functions."],
    v: "Build a shared library with an export list of three functions and confirm its dynamic symbol listing shows exactly those three, and that a program calling a fourth fails to link.",
    dep: ["binding-and-visibility", "link-time-symbol-versioning", "symbol-hash-tables"]
  },
  "link-time-symbol-versioning": {
    s: "Version scripts that attach version labels to exported symbols so a library can change a function's behavior while old binaries keep binding to the old one.",
    d: "A script groups exported names under version nodes, with later nodes inheriting from earlier ones, and can mark remaining names local. The linker records each node in version definition tables of the library and records, for each program that uses it, which version of each symbol it bound to. A library can keep several implementations of one name under different versions, with a default for new links. Version tables live in dedicated sections and index the dynamic symbol table.",
    k: ["Per-symbol versions vs whole-library names: per-symbol allows precise compatibility with one file, but needs disciplined scripts and tooling.", "Keep old implementations forever vs break at a major version: keeping is safe for old binaries, but grows the library and the maintenance burden."],
    p: ["Adding a symbol to an old version node after release makes older libraries lack it and programs fail on deployment.", "A script that lists a name that no object defines is silently ignored by some linkers."],
    v: "Build a library exporting one function in two versions and link two programs against each. Confirm each calls its own version, and the dynamic symbol listing shows both version labels.",
    dep: ["export-control", "symbol-table", "runtime-symbol-versioning"]
  },
  "section-merging": {
    s: "Combining same-named or same-kind input sections from every object into one output section, concatenated in input order with alignment padding.",
    d: "Each object contributes a code section, data sections and read-only sections. The linker groups input sections into output sections by name or by pattern in a script, places them in input order and pads for each alignment. Mergeable sections such as string pools and constants are deduplicated instead of concatenated. The output section then gets one address, size and set of permissions. Which sections merge, and in what order, shapes locality, page protections and the size of the output.",
    k: ["Merge by name vs by attributes: names respect compiler intent, while attributes group sections by permissions regardless of what the compiler called them.", "Concatenate in input order vs sort by alignment: input order is predictable and keeps related code together, while sorting reduces padding."],
    p: ["Merging writable and read-only data into one page group removes the ability to protect constants.", "Padding between merged sections with large alignments wastes memory in programs with many small sections."],
    v: "Link three objects each with a code section and confirm the link map shows one output code section whose input contributions appear in command-line order with alignment gaps.",
    dep: ["section-headers", "alignment-and-padding", "output-section-assignment"]
  },
  "output-section-assignment": {
    s: "Deciding which output section and which memory segment each input section belongs to, using default rules or script patterns.",
    d: "Default rules map input section names to output sections and output sections to segments based on their flags: readable code, read-only data, writable data, zero-initialized data. Orphan sections that no rule matches are placed beside similar ones. A script can override with patterns on file and section names, which is how code is sent to fast memory or startup code is grouped. The assignment determines permissions and what the loader will map.",
    k: ["Default placement vs explicit rules: defaults work for ordinary programs, while explicit rules are required for constrained devices but must be kept in sync with new section names.", "Placing orphans next to similar sections vs at the end: next to similar keeps permissions consistent, while the end is predictable but may land in the wrong segment."],
    p: ["A new compiler version emits a section name that a script does not match, and it lands in an unintended region.", "An orphan section ends up with different permissions than the code that reads it, causing a fault at run time."],
    v: "Add a custom section to an object and confirm the link map shows it inside the intended output section, and that the program header flags of its segment match the section's flags.",
    dep: ["section-merging", "linker-scripts", "program-headers"]
  },
  "linker-scripts": {
    s: "A configuration language giving explicit control over output sections, addresses, symbol definitions and memory placement, used for firmware, kernels and special images.",
    d: "A script describes memory regions, output sections with the input patterns they collect, address expressions, alignment, and symbols defined at section boundaries so code can find the start and end of a region. Default scripts exist inside each linker, so most programs never write one. Scripts allow load addresses that differ from run addresses, as when code is stored in slow memory but copied to fast memory at startup. They are powerful and tied to a specific linker.",
    k: ["Custom script vs the built-in default: custom controls every address for constrained targets, but must be updated whenever the toolchain adds sections.", "Boundary symbols in the script vs fixed constants in code: boundary symbols follow the real layout, but code that uses them must treat them as addresses, not variables."],
    p: ["A script that omits a compiler-emitted section causes it to be placed unexpectedly or silently discarded.", "Boundary symbols read as variable values give wrong results, because the symbol's address, not its content, is the number."],
    v: "Link with a script placing one function at a fixed address and confirm the symbol table and a disassembly show the function at exactly that address.",
    dep: ["output-section-assignment", "memory-regions", "address-assignment"]
  },
  "memory-regions": {
    s: "Named address ranges with sizes and permissions declared in a script, into which output sections are placed and against which overflow is checked.",
    d: "A region says that a range of addresses exists, its size and what it may hold, such as read-only storage or fast writable memory. Output sections are assigned to regions, and the linker fails if a region overflows. Separate load and run regions describe code or data stored in one place and moved to another by startup code. Regions make size limits a link-time error instead of a runtime mystery, which matters on devices with fixed memory.",
    k: ["Declared regions with overflow errors vs unchecked placement: declared regions catch size problems at link time, but require an accurate hardware description.", "Single region vs separate load and run regions: separate regions allow copy-at-startup designs, but need startup code that copies correctly."],
    p: ["A region sized slightly larger than the real device memory lets an oversized image link and fail on hardware.", "Startup code that copies initialized data uses boundary symbols from the wrong region and loads garbage."],
    v: "Link an image larger than a declared region and confirm the linker reports overflow naming the region and the number of bytes over. Shrink the image and confirm the link succeeds.",
    dep: ["linker-scripts", "address-assignment"]
  },
  "address-assignment": {
    s: "Computing the final virtual address and file offset of every output section once sizes and order are known, including the interplay of alignment and page boundaries.",
    d: "After merging, the linker walks the output sections in order, assigning each an address aligned to its needs, and a file offset congruent to the address modulo the page size so the loader can map file pages directly. Segment boundaries are padded to page size to separate permissions. Sizes can depend on addresses, since some sections change size once symbols have addresses, so layout may iterate until stable. Every later phase depends on these numbers.",
    k: ["Congruent file offsets and addresses vs separate packing: congruence permits direct mapping without copying, while packing yields smaller files at the cost of load-time copying.", "Iterate layout until stable vs conservative sizing: iteration yields smaller code, while conservative sizing terminates predictably."],
    p: ["Layout that does not converge when shrinking one section lengthens another, causing a hang or a rare failure.", "Segments sharing a page between code and data force the loader to give both the same permissions."],
    v: "Compare the address and file offset of each loadable section in the output's section table and confirm they agree modulo the page size and that the program headers cover them.",
    dep: ["section-merging", "alignment-and-padding", "program-headers"]
  },
  "alignment-and-padding": {
    s: "Honoring each section's required alignment and inserting padding so that data and code start at addresses the hardware and the compiler's assumptions require.",
    d: "Every section declares an alignment, and the merged output section takes the largest. The linker inserts padding between inputs and between sections, and fills code padding with no-operation or trap instructions rather than zeros. Page alignment at segment boundaries separates permissions, and some data requires cache-line or vector alignment. Padding wastes space but is cheap compared with misaligned access faults or the loss of speed from crossing cache lines.",
    k: ["Large alignment for performance vs minimal padding: large alignment helps vector code and cache behavior, while minimal padding saves memory in small devices.", "Trap-filled vs zero-filled code gaps: traps catch stray execution, while zeros are cheaper and sometimes decode as valid instructions."],
    p: ["An alignment request in an object is lost when a script forces an address, producing faults on strict hardware.", "Excess padding from many small, highly aligned sections inflates the program beyond a size budget."],
    v: "Link objects with sections requiring sixty-four-byte alignment and confirm every such section address in the map is a multiple of sixty-four and the gaps are filled with the designated padding bytes.",
    dep: ["section-headers", "section-merging"]
  },
  "relocation-types": {
    s: "The catalog of patch kinds a format defines, each specifying how to compute a value from a symbol address and place and where to write it.",
    d: "A relocation names a location, a symbol, an addend and a type. The type defines the formula: an absolute address, an address relative to the instruction, an offset within the global table, a thread-local offset, and each field width and encoding. Types for position-independent code, the global offset table and thread-local access exist alongside the simple ones. They are defined per processor family in the binary interface specification, and the linker must implement each exactly, including overflow checks.",
    k: ["Many specific types vs few general ones: many types let the linker optimize and verify each case, but each needs implementation and testing.", "Addend in the relocation vs in the patched place: addend in the entry keeps the patched bytes clean, while in-place addends save table space but must be read before overwriting."],
    p: ["A value that does not fit the field, such as a branch beyond its range, is truncated unless the linker checks for overflow.", "Mixing relocation conventions between objects built with different binary interface revisions produces wrong offsets."],
    v: "Link a call across a known distance and confirm the encoded displacement in the disassembly equals target minus place plus addend. Force an out-of-range branch and confirm a range error.",
    dep: ["relocation-sections", "symbol-table"]
  },
  "relocation-processing": {
    s: "Applying each relocation: computing the value from final addresses and writing it into the section contents, or deferring it to the loader when it is not yet known.",
    d: "For each entry in each input section, the linker looks up the symbol's final address and the place's address, evaluates the formula, checks the width and writes the result into the output buffer. Relocations against symbols defined in shared libraries or needing a randomized base cannot be finished at link time, so the linker emits dynamic relocations for the loader instead, and creates table entries. A scan pass precedes application to decide which tables and thunks are needed.",
    k: ["Scan then apply vs resolve in a single pass: two passes know what tables are needed before layout, while one pass is simpler but cannot size those tables up front.", "Resolve fully at link time vs leave to the loader: link-time resolution costs nothing at start, but only works for fixed-address, self-contained code."],
    p: ["A relocation applied before a size-changing relaxation lands at the wrong address.", "A dynamic relocation against a read-only section forces writable text pages that security policies reject."],
    v: "Disassemble the linked output and confirm every direct reference resolves to the right symbol address, while the dynamic relocation listing contains only references that need load-time resolution.",
    dep: ["relocation-types", "address-assignment", "global-offset-table", "runtime-relocation"]
  },
  "range-extension-thunks": {
    s: "Small stubs the linker inserts so that a call too far away for a short branch can reach its target through a longer indirect jump.",
    d: "Fixed-width instruction sets limit direct branch distance. When layout puts a callee out of range, the linker creates a thunk within reach of the caller that loads the full address and jumps. Thunks can be shared by callers and are placed iteratively, because inserting one shifts later addresses and may push other branches out of range. They also serve for switching between instruction set modes. Thunk creation needs layout to be recomputed until stable.",
    k: ["Thunks inserted by the linker vs requiring the compiler to emit long calls: linker thunks cost nothing for near calls, while compiler long calls cost every call but need no layout loop.", "One thunk per target vs per caller region: sharing saves space, but each region must stay within reach of its own thunk."],
    p: ["Inserting a thunk shifts addresses and pushes other branches out of range, so the algorithm needs several rounds.", "A function pointer comparison that sees the thunk address rather than the function address gives unequal results."],
    v: "Link a program whose callee is placed beyond branch range with a script and confirm the call disassembles to a stub that jumps to the real target, and the program runs correctly.",
    dep: ["relocation-processing", "address-assignment"]
  },
  "link-time-relaxation": {
    s: "Replacing a long instruction sequence with a shorter one once the final distance to a target is known, and shrinking the code that follows.",
    d: "A compiler must assume the worst when it cannot know how far a target is, so it emits a long form with a relocation tagged as relaxable. At link time, if the target is near, the linker rewrites the sequence to a short form, deletes the leftover bytes and adjusts everything after. Deletion changes addresses, so the pass repeats until stable. Similar rewrites convert table-based accesses into direct ones when a symbol turns out to be local.",
    k: ["Relax at link time vs always compile the short form: relaxing gives the best code without compiler knowledge of distance, but requires moving code and updating every reference.", "Relax only calls vs relax address computations too: broader relaxation saves more bytes, but each form needs correct tracking for debug data and tables."],
    p: ["Deleting bytes without adjusting debug line tables and exception tables makes unwinding and stepping wrong.", "Relaxation across an alignment directive breaks the alignment unless padding is recomputed."],
    v: "Link a program with calls to nearby functions and confirm the disassembly shows the short form, the output is smaller than with relaxation disabled, and stepping in a debugger still lands on correct lines.",
    dep: ["relocation-processing", "address-assignment", "debug-sections"]
  },
});
