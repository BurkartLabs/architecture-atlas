// Details for the debugger & profiler plate, part 4: debug information, symbolization, remote debugging, OS interfaces.
ATLAS.details("debugger-profiler", {
  "debug-info-parser": {
    s: "Reads the compiler's debug sections into a tree of entries describing compilation units, functions, variables, types and their attributes.",
    d: "Debug data is a sequence of units, each a tree of tagged entries with attributes such as name, type reference, address range and location. Abbreviation tables describe the layout of each entry kind, and references between entries use offsets. The parser decodes lazily, since a large program has hundreds of megabytes of it, and builds only the parts a command needs. It is hard because the format has several versions with different encodings, references can cross units, and vendors add extensions.",
    k: ["Parsing everything at load versus lazily on demand: eager gives fast lookups after a long start, lazy starts at once and pays on first use.", "Supporting every format version versus a recent set: broad support reads old binaries, a narrower set is easier to maintain and misses legacy builds."],
    p: ["Parsing a very large program eagerly takes minutes and looks like a hang at startup.", "A producer extension the parser does not know is skipped and a type appears incomplete."],
    v: "Load debug data from a large multi-unit program built with two format versions; confirm the parser lists the same functions, variables and types as the compiler's own dump and startup time stays under the stated limit.",
    dep: ["split-debug-info", "symbol-index-cache"]
  },
  "line-table-decoder": {
    s: "Decodes the compressed table that maps each machine address to a source file, line, column and statement boundary.",
    d: "The table is a small state machine program: opcodes advance the address and line, set the file, mark statement starts and mark the end of a sequence. Running it produces rows, sorted by address within each sequence. Lookups find the row covering an address, and reverse lookups find all addresses for a line. It is hard because optimized code gives many rows per line, rows for one line are scattered, and picking where a breakpoint on a line should go needs rules about statement boundaries and function prologues.",
    k: ["Placing a line breakpoint at the first row versus after the prologue: the first row is literal, after the prologue is where users expect arguments to be set up.", "Using only statement rows versus all rows: statements give stable stepping, all rows give finer position at the cost of jumpiness."],
    p: ["A breakpoint on a line that generated no code silently moves to the next line, confusing the user.", "Stepping bounces between lines because the compiler interleaved statements in the table."],
    v: "Resolve every row's address back through the table for a program built at high optimization; confirm each address maps to a line, forward and reverse lookups are consistent, and a line without code reports its next real line.",
    dep: ["debug-info-parser"]
  },
  "type-information": {
    s: "The description of every type in the program: base types, structures with field offsets, enumerations, pointers, arrays, functions and templates.",
    d: "Types are entries that refer to each other: a pointer to a structure whose field is an array of another type. Members have names, offsets and bit sizes. The debugger builds a type graph on demand, resolves forward declarations to full definitions possibly in another unit, and deduplicates identical types from many units. It is hard because the same type is emitted per compilation unit with small differences, incomplete types need the real definition elsewhere, and template instances are numerous.",
    k: ["Deduplicating types across units versus keeping each: deduplicating saves memory and needs a matching rule, keeping each is simple and large.", "Resolving an incomplete type eagerly versus on use: eager finds the definition early at a cost, on use is cheap and fails late."],
    p: ["A declaration-only type is shown as an opaque structure even though the full definition exists in another unit.", "Two types with the same name but different layouts in different units are merged by name and printed wrongly."],
    v: "Print a structure with nested unions, bit fields and an array of function pointers; confirm field offsets and sizes equal those the compiler reports, and an incomplete type resolves to its full definition from another unit.",
    dep: ["debug-info-parser", "symbol-index-cache"]
  },
  "location-expressions": {
    s: "Small stack-machine programs attached to a variable that compute where its value lives: a register, a memory address derived from the frame, or a constant.",
    d: "An expression is a list of operations: push a register's value, add an offset, dereference memory, push a constant, or declare that the value is in a register or is a piece of another location. The evaluator runs it with the frame's registers and returns a location, a value, or a set of pieces. It is hard because the frame base itself is an expression, because values may be composed of parts in several places, and because expressions must be evaluated with registers recovered for outer frames.",
    k: ["A general expression language versus fixed location kinds: expressions encode any compiler layout, fixed kinds are simple and cannot express optimized code.", "Evaluating on demand versus caching per frame: on demand is always right, caching saves reads and may be stale after a resume."],
    p: ["A frame base expression evaluated with a wrong stack pointer places every local at the wrong address.", "A value split across registers and memory is read from only one piece and printed truncated."],
    v: "Evaluate the location of arguments and locals for functions built with and without frame pointers and with split values; confirm each printed value equals the one the program computes at that point.",
    dep: ["debug-info-parser", "unwind-table-interpreter"]
  },
  "location-lists": {
    s: "Tables giving different locations for one variable over different address ranges, so the debugger finds the value as the compiler moves it between registers and memory.",
    d: "Each entry holds an address range and a location expression. Given the program counter, the debugger finds the range containing it, evaluates that expression, or reports the variable as not available if none matches. Range lists play the same role for scopes that cover several disjoint areas. Optimized code produces long lists with many entries per variable. It is hard because ranges are relative to a base that can change, lookup should be fast, and entry values refer to the value a register had at function entry.",
    k: ["Precise short ranges versus coarse long ranges: precise ranges are honest about where a value is valid, and make lists large.", "Saying not available versus guessing the nearest location: unavailable is correct, guessing is helpful and may show a stale value."],
    p: ["A variable shows a stale register value after the compiler reused that register, because a range was too wide.", "Using the wrong base address makes every range shift and no entry matches."],
    v: "Step through an optimized loop watching a variable that moves between two registers and memory; confirm the displayed value always equals the true one or is marked unavailable, never stale.",
    dep: ["debug-info-parser", "location-expressions"]
  },
  "scope-and-inline-tree": {
    s: "The nested structure of blocks, functions and inlined calls, each with its address ranges, which determines which names are visible at a given address.",
    d: "Functions contain lexical blocks containing variables, and inlined subroutines contain their own blocks and parameters, each tagged with the address ranges they occupy and a call site. Given an address, the debugger walks down from the function to the innermost scope. Name lookup walks outward. It is hard because ranges are non-contiguous after optimization, inlined scopes nest several levels deep, and the same source function appears many times, each with a different set of live variables.",
    k: ["Building the scope tree per query versus caching it: per query uses little memory, caching speeds repeated stops and stepping.", "Following the physical function versus the inline chain: the physical function is simple, the chain shows the source structure users expect."],
    p: ["A variable from an outer block is shown at an address where the compiler has already ended its range.", "Disjoint ranges are treated as one contiguous interval, and the scope covers unrelated code."],
    v: "At addresses inside a function with three nested blocks and two inlined calls, list visible variables and the inline chain; confirm results match the source structure at each address, including after the blocks end.",
    dep: ["debug-info-parser"]
  },
  "call-site-information": {
    s: "Compiler records at each call that say what is passed and where, letting the debugger recover argument values after registers have been reused and follow tail calls.",
    d: "At a call site the compiler can record, for each parameter, an expression for its value as of the call, often in terms of registers that are known or constants. When a frame's own register has been overwritten, the debugger evaluates the caller's recorded value to show the argument. Call sites also name the target, and in tail call chains help reconstruct missing frames. It is hard because the information is incomplete, expressions refer to values that may also be gone, and trusting it is an inference.",
    k: ["Using call site values to show entry arguments versus saying unavailable: values restore useful arguments but can be unreliable.", "Reconstructing tail-call frames versus showing the physical stack: reconstruction shows the logical path, physical is exact and omits callers that jumped."],
    p: ["A reconstructed argument is shown with a value that held at the call but was modified by the callee.", "A missing tail-call frame makes the backtrace appear to skip a caller."],
    v: "Break in an optimized callee whose argument register was reused; confirm the debugger shows the argument value recovered from the call site, matching a build with debug-friendly code, and marks values it cannot recover.",
    dep: ["debug-info-parser", "location-expressions"]
  },
  "split-debug-info": {
    s: "Stores debug data in a separate file or in per-unit pieces, so executables ship small and the debugger fetches data only for what it needs.",
    d: "A build can write debug sections to a companion file linked by a content identifier, and can keep per-object debug data unlinked, with a small index in the executable. The debugger finds the companion by identifier in a configured directory or server and merges it as if inline. A package of such pieces is compacted for the program. It is hard because the pieces must match the executable exactly, paths to unlinked objects break when builds move, and fetching from a server costs time on first use.",
    k: ["Separate files versus inline debug data: separate keeps shipped files small and requires keeping a matching archive, inline is always present and large.", "Unlinked per-object debug data versus packaging into one file: unlinked speeds linking, a package is easier to move and archive."],
    p: ["Shipping a release without archiving its debug file makes crashes in that release impossible to symbolize.", "Pieces left in the build directory are not found on another machine, so debug data is silently missing."],
    v: "Strip debug data from an executable into a companion, then debug it with the file in the search path and not; confirm symbols and lines appear only with the matching file and a mismatched file is rejected.",
    dep: ["debug-info-matching", "symbol-store"]
  },
  "symbol-index-cache": {
    s: "An on-disk index of names to debug-info entries, built once per module so later sessions can look up symbols without parsing everything.",
    d: "The indexer scans debug data and writes sorted tables of function, variable and type names with offsets into the units that define them. On load the debugger maps the index and answers name queries by binary or hash search, parsing only the units found. Some designs build it in the background while the session starts. It is hard because the index must be keyed to the exact file contents, must be rebuilt or fixed when the file changes, and building one for a very large program is a long job.",
    k: ["Building the index at link time versus in the debugger: link time is free for users and needs build support, in the debugger it works with any binary and delays first use.", "A persistent cache versus an in-memory index: persistent speeds later sessions and needs invalidation, in-memory is simple and rebuilt each time."],
    p: ["A stale cache for a rebuilt binary resolves names to offsets that no longer exist.", "A background indexer still running when a command needs it blocks the command or returns incomplete results."],
    v: "Open a very large binary twice; confirm the second session starts a large factor faster using the cache, finds identical symbols, and a rebuilt binary causes the cache to be discarded and rebuilt.",
    dep: ["debug-info-parser", "debug-info-matching"]
  },
  "debug-info-matching": {
    s: "Associates an executable with the exact debug file and source it was built from, using a content identifier rather than a name or a path.",
    d: "The linker embeds a unique identifier, a hash of the contents or a random value, in a note of the output. Debug files carry the same identifier, and symbol servers index by it. A debugger or symbolizer reads the identifier from the loaded module and requests the file with that key, then checks equality after fetching. Source files can be matched by checksums in the line table. It is hard because incremental or reproducible builds change what the identifier means, and stripping or repackaging may alter or lose it.",
    k: ["A content-derived identifier versus a build counter: content identifiers match exactly and change on any difference, counters are readable and can collide across machines.", "Rejecting a mismatched file versus warning and continuing: rejecting avoids wrong answers, warning lets someone look at a close-enough build."],
    p: ["Using a debug file with the same name from a slightly different build gives line numbers that are off by a few lines.", "A tool that strips notes removes the identifier and the module can never be matched again."],
    v: "Load a module and offer three debug files: the matching one, a rebuilt one of the same name and a stripped one; confirm only the matching file is accepted, and the others are reported as mismatched with the identifiers shown.",
    dep: []
  },
  "collection-agent": {
    s: "A small always-on process that runs the collectors on a host, enforces rates and policies, and ships raw samples with module information to central storage.",
    d: "The agent configures the kernel's sampling for the host, drains buffers, attaches process metadata such as container, service and build, and watches module loads to record identities. It batches and compresses data and uploads to a collection endpoint, retrying on failure and shedding data if local limits are hit. It is hard because it must itself be nearly free, must run unattended across a fleet and kernel versions, and must not hold sensitive data longer than allowed.",
    k: ["Symbolizing on the host versus sending raw addresses: raw addresses keep the agent small and need module records, symbolizing on the host sends readable data and is heavier.", "Continuous sampling versus periodic bursts: continuous catches rare events and costs steadily, bursts reduce cost and miss between windows."],
    p: ["An agent bug that reads too fast consumes a visible share of CPU on every host in the fleet.", "A network outage causes the agent's local queue to grow until it drops the data about the outage itself."],
    v: "Run the agent on a test host for an hour while generating a known workload; confirm its own CPU use stays under budget, uploads show the workload with correct metadata, and an upload outage causes bounded queues and a loss count.",
    dep: ["perf-event-interface", "module-map-tracking", "profile-data-store"]
  },
  "module-map-tracking": {
    s: "Records which executable or library was mapped at which address range in each process, over time, so raw sample addresses can be resolved later.",
    d: "At start and on every mapping change, the tracker records the module path, build identifier, start address, length and file offset. The kernel can emit map events into the same stream as samples, so order is preserved. Each sample is then resolved against the map in effect when it was taken. It is hard because maps change often, memory regions for generated code have no file, and processes that start and exit quickly can finish before a poll would see them.",
    k: ["Mapping events in the sample stream versus polling the maps: events are exact and in order, polling is simple and misses short-lived or changing mappings.", "Recording build identifiers at collection time versus reading files later: at collection time is certain, later reads may find a different file."],
    p: ["A process that lives for one second is gone before a poller reads its map, and its samples are unresolvable.", "A module replaced on disk while running is read later as the new version."],
    v: "Run a program that loads and unloads a library repeatedly while sampling; confirm each sample resolves into the library's functions only while it was mapped, and with the identifier of the version that actually ran.",
    dep: ["process-address-map", "debug-info-matching", "perf-event-interface"]
  },
  "address-normalization": {
    s: "Converts runtime addresses into module-relative addresses by subtracting the load base, so identical code gets identical keys across processes and runs.",
    d: "Given a sample address and a map entry, the normalizer subtracts the mapping start and adds the mapping's file offset to obtain a file offset, then converts that to a virtual address in the file's own address space using the program headers. The result with the module identifier is a stable key. It is hard because the conversion depends on segment layout, not a single base, because some modules are mapped in several pieces, and because kernel and generated code need their own rules.",
    k: ["Normalizing at collection versus at analysis: collection-time work is a cost on the host, analysis-time work needs complete maps stored.", "File offsets versus link-time virtual addresses as the stable form: file offsets are simple, virtual addresses match what symbol tables use."],
    p: ["Using a single base address for a module mapped in several segments gives offsets that are wrong for some segments.", "Skipping the normalization makes every run's samples look different and prevents aggregation."],
    v: "Run a randomized-base program ten times and aggregate samples; confirm normalized keys for each function are identical across runs, and that they resolve through the file's symbol table to the correct names.",
    dep: ["module-map-tracking", "process-address-map"]
  },
  "offline-symbolization": {
    s: "Resolves recorded addresses to function names, files and lines after collection, on another machine with access to the right debug data.",
    d: "The symbolizer reads the normalized addresses and module identifiers, obtains the debug file for each module, looks up the function and line through symbol tables, line tables and the inline tree, and expands inlined calls into several frames. Results are written into the profile or served on request. Batching by module avoids repeatedly opening large files. It is hard because debug files are huge, symbolization of millions of addresses must be fast, and missing files must degrade gracefully into module-plus-offset names.",
    k: ["Symbolizing at report time versus once at ingestion: report time uses the latest symbols and repeats work, ingestion stores names and cannot fix errors later.", "Expanding inlined frames versus naming the physical function: expansion matches the source and multiplies frames per sample."],
    p: ["A missing debug file for one library leaves unresolved addresses that fragment the profile into unique entries.", "Symbolizing with the latest build rather than the one that ran gives names of functions that did not exist."],
    v: "Symbolize a recorded profile twice, with the full symbol set and with one library's symbols removed; confirm the first has correct names and lines and the second shows that library as module and offset, not wrong names.",
    dep: ["address-normalization", "symbol-lookup", "line-table-decoder", "inline-frame-synthesis"]
  },
  "symbol-store": {
    s: "A repository of debug files indexed by build identifier, from which tools fetch the exact file for any module that appeared in a profile or crash.",
    d: "Build pipelines upload debug files keyed by identifier. Clients request by key, often through several layers: local cache, team mirror, central store. Retention policy keeps files for every released build and discards development ones. Access control limits who can fetch. It is hard because storage grows with every build, because files are large and fetches slow at first use, and because a missing file is found only when a crash from that build arrives.",
    k: ["Uploading every build versus only releases: every build supports debugging any machine, releases only keep storage manageable.", "Layered caches versus direct fetch: caches avoid repeated downloads and add invalidation questions."],
    p: ["A release goes out without its upload having completed, and no crash from it can be symbolized.", "Debug files containing source paths and internal names are served without access control."],
    v: "Upload debug files for two builds, then request each by identifier from a client with an empty cache; confirm exactly the matching file is returned, a second request is served locally, and a missing identifier fails with a clear error.",
    dep: ["debug-info-matching", "split-debug-info", "privilege-and-trust"]
  },
  "symbolization-cache": {
    s: "Remembers resolved module-and-address pairs so repeated addresses across millions of samples are resolved once.",
    d: "A cache maps module identifier and normalized address to the resolved frames. Because a small number of hot addresses account for most samples, hit rates are very high. The cache is sized by memory budget, evicts rarely used entries, and is keyed so that different symbol versions do not mix. It can be persisted between jobs. It is hard because keys must include the symbol file's identity, invalidation must follow symbol updates, and a poisoned entry would keep returning a wrong name.",
    k: ["Caching per address versus per function range: per address is simple and large, per range is compact and needs range lookup.", "Persistent versus per-job cache: persistent accelerates repeated analysis, per-job avoids stale data."],
    p: ["A cache keyed only by address returns the previous build's name after a rebuild loads at the same offsets.", "An unbounded cache fills memory when a profile contains random addresses."],
    v: "Symbolize a profile with ten million samples from fifty thousand distinct addresses; confirm the hit rate is above 99 percent, results equal an uncached run, and changing the symbol file invalidates its entries.",
    dep: ["offline-symbolization", "debug-info-matching"]
  },
  "jit-symbol-maps": {
    s: "Records the names and address ranges of code generated at run time, since no file on disk describes it.",
    d: "A runtime that compiles code in memory registers each new function with the profiler, either by writing a map file listing address, size and name, or by emitting events into the profile stream. Samples in those ranges resolve against the map in effect at the time. Code can be moved, freed and reused, so entries need time ranges. Some runtimes also write debug information or an object file for each code blob. It is hard because code is replaced under the profiler, and names must be produced cheaply by the runtime.",
    k: ["Map file written continuously versus events in the stream: a file is simple for any tool, events keep exact timing and need support in the collector.", "Naming functions by source symbol versus by address only: names make profiles readable and cost runtime work to maintain."],
    p: ["Recompiled code at the same address makes later samples resolve to the old function's name.", "A runtime that produces no map shows all generated code as a single unknown block."],
    v: "Profile a runtime executing a script with a hot function that is recompiled midway; confirm samples resolve to the right function name before and after, and the unknown-code share is near zero.",
    dep: ["module-map-tracking", "sample-attribution"]
  },
  "profile-data-store": {
    s: "A queryable store for profiles from many hosts and times, indexed by labels, so people can slice by service, version and period and compare ranges.",
    d: "Profiles arrive with labels such as service, host, build and time. The store keeps stacks in deduplicated form, with each unique stack stored once and counts per time bucket. Queries select by label and time, merge matching profiles and return a tree or table. Retention drops or downsamples old data. It is hard because cardinality of stacks is high, merges across thousands of profiles must stay fast, and label sets must stay bounded.",
    k: ["Storing merged aggregates versus raw profiles: aggregates are small and cannot answer a new question, raw profiles are flexible and large.", "Symbolized storage versus raw address storage: symbolized is quick to query, raw can be re-symbolized when better symbols arrive."],
    p: ["An unbounded label such as a request id explodes the index and slows every query.", "Retention that downsamples too aggressively removes the data needed to compare with last month."],
    v: "Ingest profiles from many hosts and two builds, then query by service and build for a one-hour range; confirm the merged result equals the sum of the inputs and returns within the stated latency.",
    dep: ["profile-interchange-format", "collection-agent", "symbolization-cache"]
  },
  "remote-stub": {
    s: "A small program or library on the target that executes the debugger's low-level requests: read and write memory and registers, set breakpoints, resume and report stops.",
    d: "The stub runs next to or inside the target, with minimal dependencies. It receives packets over a serial line, network socket or pipe, performs the operation using the local debug interface, and sends a reply. On bare metal it is linked into the program and handles traps directly. On a hosted system it is a separate process that traces the target. It is hard because it must be small and robust, must work when the target is in a bad state, and must support the target's quirks.",
    k: ["A separate stub process versus one linked into the target: separate survives target crashes and needs an operating system, linked works on bare metal and dies with the program.", "A minimal stub with all logic in the debugger versus a smarter stub: minimal is easy to port, smart reduces round trips on slow links."],
    p: ["A stub linked into a program that crashes in its own memory handling stops responding exactly when needed.", "A stub that accepts unauthenticated network connections gives anyone control of the machine."],
    v: "Connect a debugger to a stub over a network, read registers and memory, set a breakpoint, run and stop; confirm results match a local session, and kill the connection to confirm the target is left running without breakpoints.",
    dep: ["remote-protocol", "process-trace-interface", "software-breakpoints"]
  },
  "remote-protocol": {
    s: "A text-based request and reply protocol of short packets that carries debugger operations to a stub, with an escape for large transfers and extensions negotiated at connect.",
    d: "Packets are commands with a one-letter or short-name prefix and hexadecimal arguments: read memory, write registers, continue, step, insert breakpoint, query. Replies are data or error codes. At the start the two sides exchange capabilities, such as packet size, which optional features are supported, and whether multiprocess identifiers are used. It is hard because it grew by accretion across many targets, round trips dominate cost on slow links, and unknown extensions must be handled gracefully.",
    k: ["Text-encoded packets versus binary: text is easy to inspect and debug by eye, binary is smaller and faster.", "Fine-grained requests versus higher-level operations: fine-grained is simple for stubs, high-level reduces round trips."],
    p: ["A debugger assuming an extension the stub lacks sends commands that are answered with empty replies and misleading failures.", "Reading memory a byte at a time over a slow link takes minutes."],
    v: "Capture a session with a protocol logger; confirm the capabilities exchange appears first, each command has exactly one reply, and unsupported commands are answered with the defined empty reply that the debugger handles.",
    dep: ["packet-framing", "target-description", "remote-memory-register-access", "stop-replies"]
  },
  "packet-framing": {
    s: "Wraps each packet with start and end markers and a checksum, escapes special bytes, and acknowledges receipt, so the protocol survives noisy links.",
    d: "A packet starts with a marker, carries the payload, ends with a terminator and a two-digit checksum of the payload bytes. The receiver replies with an acknowledgment or a negative acknowledgment, causing a resend. Bytes that would collide with markers are escaped. Run-length encoding can compress repeated bytes. Interrupt requests are a single byte outside packets. It is hard because noise can corrupt the frame boundaries themselves, and acknowledgment can be turned off on reliable links for speed.",
    k: ["Per-packet acknowledgment versus none on reliable transports: acknowledgments guard noisy serial lines and cost a round trip, turning them off is faster on sockets.", "An out-of-band interrupt byte versus an in-band command: out-of-band can stop a running target, in-band waits for the stub to read."],
    p: ["A payload byte that matches the terminator without escaping truncates the packet and corrupts the checksum.", "Leaving acknowledgments on over a high-latency network makes each memory read a full round trip, many times slower."],
    v: "Send a corpus of payloads containing every special byte, run lengths and maximum size through a link with injected bit errors; confirm all arrive intact after resends and corrupted frames are detected.",
    dep: []
  },
  "target-description": {
    s: "A description of the target's registers, sizes, names and order, sent to the debugger so one debugger can talk to many processor variants without built-in knowledge.",
    d: "The stub provides a structured document listing register groups, each register's name, bit size, type and position in the register packet, plus the memory map showing which regions are RAM, ROM or flash. The debugger uses it to parse register packets and to choose a decode of flags and vector types. It is hard because variants and optional extensions change register sets, and a mismatch between the description and the stub's real layout causes every value to be shifted.",
    k: ["Description sent by the stub versus compiled into the debugger: stub-sent supports new variants without updates, compiled is simpler and stale for new processors.", "A memory map from the stub versus assuming all memory is RAM: a map lets the debugger use hardware breakpoints for flash, assuming RAM breaks on read-only memory."],
    p: ["A register layout mismatch shifts every register in the packet, so the stack pointer is displayed in the wrong slot.", "A missing flash region in the memory map makes the debugger try software breakpoints in flash, which fail."],
    v: "Connect to a stub for a processor with optional vector registers; confirm the register list includes exactly those present, values match a reading from the processor's own tools, and flash regions are marked read-only.",
    dep: ["remote-protocol"]
  },
  "stop-replies": {
    s: "Messages from the stub that report why the target stopped, with the thread, signal and key register values, including unsolicited notifications in non-stop mode.",
    d: "After a resume the stub answers with a stop reply containing a signal number, the thread id, and often the program counter and frame pointer, so the debugger can often avoid a separate register read. Extensions add the reason, such as a watchpoint address or a library event. In non-stop mode the stub sends notifications while others still run, queued until the debugger acknowledges. It is hard because notifications can arrive between a request and its reply, and exit and crash stops must be distinguished.",
    k: ["Including registers in the reply versus separate reads: included saves round trips on slow links and adds data to each stop.", "Asynchronous notifications versus polling for stops: notifications show stops at once, polling is simpler and slows reactions."],
    p: ["A watchpoint stop without its address in the reply leaves the debugger unable to say which variable changed.", "An unacknowledged notification blocks later notifications and appears as a thread that never stops."],
    v: "Resume, hit a hardware watchpoint and a breakpoint on different threads in non-stop mode; confirm two notifications arrive each with its thread and reason, and acknowledging one releases the next.",
    dep: ["remote-protocol", "signal-delivery"]
  },
  "multiprocess-extensions": {
    s: "Protocol additions that identify threads as process and thread pairs, letting one connection debug several processes, follow forks and handle exec.",
    d: "Thread identifiers become a process id and thread id pair. Commands select a pair or a wildcard for all threads of a process. The stub reports fork and exec events, and the debugger decides whether to follow the parent or the child and whether to detach the other. Attached children hold copies of the parent's breakpoints that must be removed or kept. It is hard because breakpoints in the memory image copied at fork exist in the child, and detaching must clean them up.",
    k: ["Following the child versus the parent after fork: the child runs the program's new work, the parent is the original thread of interest, and the choice must be made before the fork returns.", "One connection for all processes versus one per process: one is efficient and complex, per-process is simple and many sockets."],
    p: ["A child created by fork inherits inserted breakpoint instructions and crashes if the debugger does not remove them.", "Exec replaces the address space and the old breakpoint addresses become invalid without notice."],
    v: "Run a program that forks and execs under both follow modes; confirm the chosen process is stopped at the expected breakpoint, the other continues without stray traps, and its memory matches the file.",
    dep: ["remote-protocol", "process-launch", "software-breakpoints"]
  },
  "kernel-debug-link": {
    s: "Connects a debugger to a running kernel or firmware over a dedicated serial, network or hardware debug channel, with a stub in the kernel itself.",
    d: "A stub inside the kernel handles traps and speaks the packet protocol over a polled device, since interrupts and scheduling are not available at the point of a stop. When the kernel stops, all processors are brought to a halt through inter-processor signals, and the debugger reads kernel memory and per-processor registers. Hardware probes can use dedicated debug pins without a stub. It is hard because the kernel stub cannot rely on the services it is debugging, breakpoints in code used by the stub recurse, and virtual and physical memory differ.",
    k: ["A software stub in the kernel versus a hardware probe: a stub needs no extra equipment, a hardware probe can stop a kernel that is already dead.", "Polled transport versus interrupt-driven: polling works at any point of failure, interrupts can fail along with the kernel."],
    p: ["Setting a breakpoint in the code the stub itself uses causes recursive traps and a hang.", "Reading user memory by physical address returns the wrong page after the mapping changed."],
    v: "Break in a kernel function, list all processors' states, read a kernel data structure, and continue; confirm the other processors halted and resumed together and the data matches the kernel's own logs.",
    dep: ["remote-stub", "debug-registers", "remote-protocol"]
  },
  "remote-memory-register-access": {
    s: "Packets that read and write target memory and registers, with batching and size limits, and the main source of cost on slow links.",
    d: "Read and write commands take an address and length in hexadecimal and return the bytes. Register commands read the whole register file or a single register. The debugger caches memory within a stop and invalidates on resume, and combines adjacent reads into larger ones. Writes to code regions go through the stub, which may need to flush instruction caches. It is hard because link speed makes naive access very slow, and caches can hold stale values for volatile memory.",
    k: ["Caching reads within a stop versus always reading: caching saves round trips and can show stale device registers, always reading is exact and slow.", "Reading whole register files versus single registers: whole is fewer trips and more data per stop."],
    p: ["Caching a device status register hides the change that the program is waiting for.", "Writing code through the stub without flushing the instruction cache makes the processor run the old instructions."],
    v: "Read a one-megabyte region and individual registers over a rate-limited link; confirm data equals a local read, the number of round trips matches the batching policy, and a write to code takes effect on resume.",
    dep: ["remote-protocol", "cross-process-memory", "target-description"]
  },
  "process-trace-interface": {
    s: "The kernel facility that lets one process control another: attach, stop and resume threads, read and write registers, and receive notice of events.",
    d: "A tracer calls into the kernel to start tracing a target thread. From then on the target stops on signals, system calls if requested, exec, fork, clone and exit, and the tracer receives the event through a wait call. While stopped, the tracer can read and write registers and memory. Each thread must be traced separately. It is hard because only the thread that attached may control the target, requests have different rules for stopped and running threads, and the interface is a single system call with many subcommands.",
    k: ["A request-based interface versus a file-system-like interface: requests are compact and thread-affine, files are easy to script and have different permission rules.", "Tracing each thread individually versus the process: individual control matches how the kernel schedules, process-level is simpler and hides thread states."],
    p: ["Calling the interface from a different thread than the one that attached fails with a permission error that looks unrelated.", "A target already traced by another tool cannot be attached, since only one tracer is allowed."],
    v: "Attach to a stopped multi-threaded process from a helper tool, read registers of each thread, write one, and detach; confirm the target resumes with the written value and a second tracer attempt is refused.",
    dep: ["signal-delivery", "cross-process-memory", "privilege-and-trust"]
  },
  "signal-delivery": {
    s: "The kernel mechanism that notifies a process of an event and, for a traced process, first reports the signal to the tracer, which may suppress or alter it.",
    d: "When a signal is raised for a traced thread, the kernel stops it before the handler runs and notifies the tracer with the signal number and information such as the faulting address. On resume, the tracer chooses whether to inject the signal or drop it. Stops can also be group stops, from job control signals, and the tracer must tell them apart. It is hard because signals are queued and coalesced, delivered while stepping, and interact with system calls that must be restarted.",
    k: ["Suppressing versus passing a signal on resume: passing preserves program behavior, suppressing is needed to skip a fault or a stop request.", "Reading signal information on each stop versus only the number: details allow decoding of faults and cost an extra call."],
    p: ["A group stop from job control is treated as a debug stop, and the program appears frozen after continue.", "Dropping a timer signal in a runtime that depends on it hangs the program."],
    v: "Send a series of signals, including one that faults, to a traced program with different pass policies; confirm handlers run only for passed signals, fault details are decoded, and a group stop resumes correctly.",
    dep: ["process-trace-interface"]
  },
  "cross-process-memory": {
    s: "Operating system calls for reading and writing another process's memory, directly or through the tracing interface, subject to permission and page protection.",
    d: "The simplest method reads one word per call through the trace interface. Bulk methods read many pages at once through a file view of the address space or a vectored call. Writes to read-only pages need the kernel to override protection for debugging. Reads of unmapped pages fail partway, and the caller gets a short count. It is hard because other threads can change memory while it is read unless all are stopped, and large reads fall back to slow paths on some systems.",
    k: ["Word-at-a-time access versus bulk reads: word access works everywhere and is slow, bulk is far faster with permission rules.", "Reading a live process versus a stopped one: live avoids pausing and may be inconsistent, stopped is coherent and costs a pause."],
    p: ["A short read at an unmapped page boundary is treated as a full success and trailing bytes are garbage.", "Writing to code through a bulk call without the debug override fails on read-only pages."],
    v: "Read a 100 MB region word by word and in bulk and compare time and contents; read across an unmapped boundary and confirm the short count is reported, and write into a code page and read back the change.",
    dep: ["process-trace-interface"]
  },
  "debug-registers": {
    s: "Per-thread processor registers holding addresses and conditions that raise a debug exception on instruction fetch, data write or data access.",
    d: "A few address registers pair with a control register that selects, for each, the trigger kind, length and whether it is enabled. A status register says which one fired. The kernel saves and restores them per thread on context switches and exposes them through the tracing interface. Virtual machines may or may not pass them through. It is hard because the count is tiny, trigger lengths must be aligned, and the processor reports data triggers after the instruction completes.",
    k: ["Using them for breakpoints versus for watchpoints: each use takes a slot, and with four slots the choice matters.", "Per-thread settings versus system-wide: per-thread is how the kernel exposes them and demands setup for every thread, system-wide covers new threads and is rarely allowed."],
    p: ["A virtual machine that does not virtualize them accepts the setting and never raises the exception.", "A request for an unaligned eight-byte range is split into several slots and exhausts them."],
    v: "Program an execute trigger and a write trigger on a test program, run, and read the status register at each stop; confirm the correct slot is reported for each, and that a thread created later has none unless set.",
    dep: ["process-trace-interface", "trap-and-trace-flags"]
  },
  "trap-and-trace-flags": {
    s: "Processor features that raise an exception on a special breakpoint instruction or after a single instruction executes, which implement breakpoints and stepping.",
    d: "A one-byte or fixed-size breakpoint instruction raises an exception when executed, and the kernel converts it into a signal for the traced thread. A trace flag in the status register raises a debug exception after each instruction. The kernel hides the flag from the program when it is set by the tracer. It is hard because some instructions, such as system calls and flag-modifying ones, interact with the flag, and the program can read or clear it if the kernel does not hide it.",
    k: ["A one-byte trap instruction versus a longer one: one byte fits anywhere in the stream, a longer one can overwrite two instructions.", "Hardware trace flag versus emulated stepping: hardware is simple and exact, emulation works where the flag does not exist."],
    p: ["A program that saves and restores the status register captures the trace flag and propagates single-stepping to unrelated code.", "A trap instruction placed in a delay slot or the middle of a variable-length instruction changes behavior."],
    v: "Execute a trap instruction and then a single step in a test program; confirm the first raises one exception with the program counter after the trap, the second advances exactly one instruction, and the program cannot see the flag.",
    dep: ["process-trace-interface"]
  },
  "perf-event-interface": {
    s: "The kernel interface for opening counters and samples as file descriptors, with configuration of event, period, sampled fields and a shared ring buffer.",
    d: "A call opens an event described by a structure: type, event code, sampling period or frequency, which record fields to include, and which process and processor to measure. The descriptor can be read for counts, or memory-mapped to receive a ring buffer of records, including samples, mapping changes, thread starts and lost-event notices. Groups of events are scheduled together. It is hard because the structure is large and versioned, permissions depend on a system setting, and different events and containers behave differently.",
    k: ["Per-thread versus per-processor events: per-thread follows a program across processors, per-processor sees everything on a core including the kernel.", "Reading counts versus mapping a sample buffer: counts are simple and cheap, the buffer carries rich data and needs a consumer that keeps up."],
    p: ["A restrictive permission setting refuses the call, and the tool reports a vague failure.", "Opening more events than the hardware can schedule silently multiplexes them."],
    v: "Open a counting event and a sampling event on a test process; confirm the count matches expectations, the buffer receives samples with the requested fields, and a lost-event record appears when the consumer is paused.",
    dep: ["kernel-tracing-facility", "privilege-and-trust"]
  },
  "kernel-core-dump": {
    s: "The kernel path that writes a dump file when a process dies of a fatal signal, enumerating memory regions and thread registers under policy limits.",
    d: "On a fatal signal the kernel stops all threads, then walks the memory map. For each region it decides by policy and flags whether to write contents, and records register sets, signal information, and file mappings in notes. The output goes to a file or pipes to a helper. Size limits and filters can restrict it. It is hard because the process is in a poor state, large writes can take minutes while resources are held, and the helper path adds an external process during a crash.",
    k: ["Dumping to a file versus piping to a helper: a file is simple and local, a helper can compress, limit and upload at the cost of an extra moving part.", "Including shared and file-backed memory versus private only: including gives complete context and larger files, private only is smaller and loses shared data."],
    p: ["A helper that crashes or is not installed yields no dump with no message.", "A dump of a very large process fills the disk and affects other services."],
    v: "Crash a test process with a known memory pattern and a policy excluding file-backed regions; confirm the dump contains the pattern, threads' registers and notes, and omits the excluded regions as stated.",
    dep: ["process-address-map", "signal-delivery"]
  },
  "kernel-tracing-facility": {
    s: "Built-in kernel instrumentation points and a mechanism to attach handlers to functions, tracepoints and events, with low-overhead buffers.",
    d: "The kernel has static tracepoints at important places, such as scheduling and block I/O, and can place dynamic probes on most functions. Handlers can be simple recorders or verified bytecode programs. Events go to per-processor buffers read by user space. The same machinery serves user-space probes, which trap through the kernel. It is hard because probes must be safe in any context, some functions cannot be probed, and the set of tracepoints changes between kernel versions.",
    k: ["Static tracepoints versus dynamic probes: static points are stable and documented, dynamic probes reach anywhere and depend on kernel internals.", "Recording events versus aggregating in the kernel: recording gives all data and uses space, aggregation gives summaries at much lower cost."],
    p: ["A tool written against internal function names stops working after a kernel update changes them.", "Probing a function used by the tracing code itself causes recursion and is refused or hangs."],
    v: "Enable a scheduler tracepoint and a dynamic probe on a function for ten seconds under load; confirm event counts match counters the kernel keeps itself, and disabling returns all overhead to baseline.",
    dep: ["code-patch-protection", "process-address-map"]
  },
  "process-address-map": {
    s: "The kernel's description of a process's mapped memory regions, with ranges, permissions and backing files, readable by tracers and profilers.",
    d: "A file view or call lists each region with start and end, read, write and execute permissions, offset into its backing file, and the file's name. Tools use it to find loaded modules, to check whether an address is readable, to locate the stack and heap, and to compute load bases. Regions can be split or merged as the program changes protections. It is hard because the map changes at any moment, names can refer to deleted files, and anonymous regions hold generated code.",
    k: ["Reading the map on demand versus watching map-change events: on demand is simple and can be stale, events are exact and require a registered listener.", "Treating the file name as module identity versus using the build identifier: names are easy and wrong after replacement, identifiers need reading the file."],
    p: ["A file replaced on disk while mapped shows as deleted, and its symbols are read from the wrong file.", "A single module mapped as several regions is mistaken for several modules."],
    v: "Read the map of a process that loads a library and generates code; confirm the library appears with its permissions and file offsets, the generated region is anonymous and executable, and unloading removes the entries.",
    dep: []
  },
  "code-patch-protection": {
    s: "Page permissions and security policies that make code memory read-only or non-writable, which debuggers and probes must override or work around to insert traps.",
    d: "Code pages are mapped executable and not writable, and some policies refuse making them writable at all. A tracer writing through the trace interface can use a kernel override that bypasses permissions for debugging, which produces private copies of shared pages. Without it, a tool must change protections, write, and restore them. Instruction caches must be flushed after the write. It is hard because policies vary, patching shared pages must not affect other processes, and multi-threaded patching of a live instruction needs a safe sequence.",
    k: ["Writing through the trace override versus changing page protections: the override leaves program mappings unchanged, protection changes are visible to the program.", "Patching with a trap in place versus rewriting to a jump: a trap is atomic and slow, a jump is fast and needs a safe multi-step sequence."],
    p: ["Patching a shared page without making a private copy modifies the code of every process using it.", "Skipping the instruction cache flush leaves a thread executing the old bytes."],
    v: "Insert a breakpoint into a library shared by two processes, one traced; confirm only the traced process hits it, the other's memory is unchanged, and removal restores the original bytes.",
    dep: ["process-trace-interface", "cross-process-memory"]
  },
});
