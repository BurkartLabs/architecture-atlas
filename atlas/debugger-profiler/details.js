// Details for the debugger & profiler plate, part 1: front ends, views, inspection, stacks and symbols.
ATLAS.details("debugger-profiler", {
  "command-line-interface": {
    s: "A text prompt that accepts commands, abbreviations and scripts, prints values and source, and remains the most complete way to drive the debugger.",
    d: "A line editor reads commands, expands abbreviations and aliases, and dispatches them to handlers in the core. Output is text meant for people: formatted values, source lines with a marker, and tables of breakpoints or threads. Command files and batch mode let the same commands run unattended, for example in a crash triage job. It is hard because the command language grows by accretion, with many options per command, user-defined commands and hooks that run on events, and because output is parsed by scripts that were never promised a stable format.",
    k: ["Abbreviation by unique prefix versus explicit short names: typing is fast, but adding a command later can make an old abbreviation ambiguous.", "Human-formatted output versus structured output: text reads well in a terminal but scripts that scrape it break whenever wording changes."],
    p: ["Scripts that scrape prompt output break silently when a new release rewords a message or adds a column.", "User hooks that run on every stop can themselves fault or loop, leaving the session unusable."],
    v: "Start a session in batch mode with a command file that sets a breakpoint, runs, prints a local and a backtrace, then exits; confirm the output contains the expected value and the process is cleanly killed.",
    dep: ["debug-event-loop", "expression-evaluator", "breakpoint-table"]
  },
  "machine-interface": {
    s: "A line-oriented structured protocol that lets programs drive the debugger and receive results and asynchronous events in a parseable form.",
    d: "Each request carries a token and a command; each result echoes the token with a success or error record containing named fields. Asynchronous records report that the target stopped, that a thread was created, or that a breakpoint changed, without being a reply to anything. Values arrive as nested tuples and lists rather than prose. It is hard because stops are asynchronous: a front end must track state transitions, tolerate events interleaved with replies, and cope with commands that are legal only while the target is stopped.",
    k: ["Token-correlated replies versus implicit ordering: tokens allow overlapping requests, but every client must match replies and handle out-of-order completion.", "A stable but frozen grammar versus an evolving one: tooling keeps working across versions, while new features arrive as awkward extensions."],
    p: ["A client that assumes the target is stopped sends a read while it runs and gets an error that looks like a bug in the target.", "Unescaped characters in string fields corrupt the record and desynchronize the parser."],
    v: "Send a numbered run command and a numbered breakpoint-insert command, then confirm each result record carries its token and that a stop event arrives asynchronously with frame, thread and reason fields.",
    dep: ["debug-event-loop", "breakpoint-table", "value-formatting"]
  },
  "debug-adapter-protocol": {
    s: "A standard message protocol between an editor and a thin adapter, so one editor integration can drive many debuggers through a common set of requests and events.",
    d: "The editor sends requests such as set breakpoints, continue, next, stack trace, scopes and variables, and the adapter replies and emits events like stopped and terminated. The adapter translates these into the real debugger's commands or library calls. Source locations, frame ids and variable references are opaque handles the adapter issues. It is hard because the protocol models a common denominator: hardware watchpoints, reverse stepping, memory views and custom formatters are optional capabilities that must be negotiated, and handles go stale as soon as the target resumes.",
    k: ["A lowest-common-denominator request set versus debugger-specific extensions: editors work with any adapter, but advanced features need capability flags and custom requests.", "Lazy variable expansion by handle versus sending full trees: it keeps stops fast on huge objects, but handles must be invalidated on every resume."],
    p: ["Reusing a variables reference after resume shows stale or wrong values because the handle now names a different frame.", "Adapters that translate breakpoint lines naively place them on lines with no code, so they never bind."],
    v: "Attach a conforming editor, set a line breakpoint, run, and confirm the adapter emits a stopped event, the stack trace request returns frames with sources, and expanding a structure returns its fields on demand.",
    dep: ["machine-interface", "breakpoint-table", "frame-pointer-unwinding"]
  },
  "graphical-front-end": {
    s: "A windowed interface showing source, call stack, variables, threads and breakpoints at once, with mouse-driven stepping and inspection.",
    d: "It subscribes to stop events and refreshes panes: the source view moves to the current line, the stack pane lists frames, the variables pane shows locals and watches, and a thread list shows what else is running. Hover reveals a value by evaluating the expression under the cursor. Edits to breakpoints in the margin are sent to the core. It is hard because every pane triggers reads of the target: expanding a large array or refreshing on each step can cost more than the step, so the front end must fetch lazily and cache until the next resume.",
    k: ["Refreshing every pane on each stop versus fetching on demand: the first is simple and always consistent, the second keeps single-stepping responsive on large programs.", "Embedding the core as a library versus talking to a separate process: embedding is faster, but a crash in the debugger takes the interface down."],
    p: ["Hover evaluation on an expression with side effects, such as a function call, changes the program while someone is merely reading it.", "Source shown from the current disk copy no longer matches what was compiled, so the highlighted line is wrong."],
    v: "Step ten times through a loop in the interface and confirm the highlighted line, the locals pane and the stack pane update each time within an interactive delay, and that the displayed source checksum matches the one recorded in the debug information.",
    dep: ["machine-interface", "stack-unwinder", "value-formatting"]
  },
  "scripting-api": {
    s: "An embeddable interpreter and object model that lets scripts walk frames, read types and values, set breakpoints with custom stop logic, and automate sessions.",
    d: "The core exposes sessions, threads, frames, symbols and values as objects in a scripting language. A script can register a breakpoint whose stop callback decides whether to halt, print a data structure by walking pointers, or generate a report from a core file. The same API usually powers pretty printers and custom commands. It is hard because script code runs inside the debugger's event handling: a slow or blocking callback stalls the target, an exception must not corrupt state, and the object model must stay valid across target resumes.",
    k: ["A rich object model versus string commands only: scripts can be precise and fast, but the API becomes a large surface to keep compatible.", "Callbacks that run on every hit versus declarative conditions: callbacks can do anything, yet every hit pays interpreter and context-switch cost."],
    p: ["A script holding a frame object across a resume reads a stale frame that no longer exists.", "A stop callback that allocates or raises exceptions deep inside event handling leaves the session half-initialized."],
    v: "Write a script that sets a breakpoint with a callback printing one argument and continuing; run a loop of one thousand calls and confirm exactly one thousand lines print with the right values and the target exits normally.",
    dep: ["expression-evaluator", "breakpoint-table", "pretty-printers"]
  },
  "profiler-command-line": {
    s: "The entry point of a profiling session: record a command or a running process for a period, then report, annotate or export what was collected.",
    d: "Typical verbs are record, report, annotate and script. Record chooses event sources, sampling frequency, call-graph method and target, then writes a data file as events arrive. Report reads the file, resolves symbols and prints a ranked table. System-wide mode needs elevated privilege and per-processor buffers. It is hard because defaults matter: a wrong event or frequency produces a plausible but misleading profile, and recording to a slow disk can lose events when buffers overflow before the writer drains them.",
    k: ["Record-then-report as separate steps versus live display: files allow repeated analysis and sharing, but live views give immediate feedback without storage.", "System-wide versus per-process recording: system-wide sees kernel and neighbors, but needs privilege and produces far more data."],
    p: ["Recording with a call-graph method the binary does not support yields flat stacks and a profile that looks shallow.", "Silently lost events from a full buffer produce a report that undercounts hot code with no visible warning."],
    v: "Record a known busy loop for five seconds, run the report, and confirm the loop's function ranks first with a percentage near its true share and the header shows a non-zero sample count and zero lost events.",
    dep: ["perf-event-interface", "sample-capture", "call-graph-aggregation"]
  },
  "call-graph-aggregation": {
    s: "Merges many stack samples into a tree or graph with self and inclusive weights per function, so cost can be read by caller and callee.",
    d: "Each sample is a list of addresses from leaf to root. Aggregation resolves them to functions, then increments the leaf's self weight and every ancestor's inclusive weight once per sample. The result is a call tree keyed by path, or a call graph keyed by function with caller and callee edges. It is hard because recursion double counts inclusive time unless handled, because merged graphs lose which caller caused which callee cost, and because truncated or wrong stacks attach weight to the wrong parent.",
    k: ["Call tree keyed by full path versus call graph keyed by function: trees preserve context but explode in size, graphs are compact but blur who is responsible.", "Counting inclusive weight once per sample versus per frame: once is correct under recursion, per frame inflates recursive functions beyond one hundred percent."],
    p: ["Recursive functions show inclusive percentages above one hundred when each frame is counted separately.", "Samples with truncated stacks cluster under a fake root, hiding the true callers."],
    v: "Profile a program whose function A calls B nine times as often as C does; confirm the graph shows B at roughly nine tenths of A's inclusive weight and that a recursive function never exceeds one hundred percent inclusive.",
    dep: ["sample-attribution", "symbol-lookup", "stack-capture"]
  },
  "flame-graphs": {
    s: "A layout where each box is a function, width is its share of samples and stacking shows the call path, making hot paths visible at a glance.",
    d: "Identical stacks are merged into a prefix tree. Each node becomes a rectangle whose width is proportional to its inclusive count, placed above its parent and sorted by name so identical frames align. Variants invert the layout, use differential coloring, or show off-CPU time. Interactive viewers zoom into a frame and search by name. It is hard because sorting by name rather than time means the horizontal axis is not a timeline, readers often misread it, and very deep or wide trees need collapsing to stay legible.",
    k: ["Alphabetical ordering versus time ordering: alphabetical merges all repeats into wide blocks, but loses when things happened, which a timeline view keeps.", "Static image versus interactive viewer: images embed in reports, while interactive views let readers zoom into narrow frames the image cannot show."],
    p: ["Reading the horizontal axis as time leads people to conclude a phase ran first when ordering is arbitrary.", "Unresolved addresses render as unique boxes that fragment the graph and hide a real hot spot."],
    v: "Render a profile of a program with two known hot functions of 70 and 30 percent; confirm the box widths match those shares within a few percent and that clicking a box zooms to its subtree.",
    dep: ["call-graph-aggregation", "symbol-lookup"]
  },
  "timeline-viewer": {
    s: "Plots events and samples along a time axis per thread or processor, showing when work ran, waited or overlapped.",
    d: "Trace events with begin and end timestamps become spans, nested by call depth within each thread track. Counters and sampled stacks are drawn as lanes beside them, and events from several processors are merged by synchronized timestamps. Zooming changes which spans are shown, collapsing tiny ones into density bars. It is hard because traces are huge, so the viewer needs indexing and level-of-detail aggregation, and because clocks on different cores or machines differ, so spans can appear to cross cause and effect.",
    k: ["Rendering raw events versus pre-aggregated tiles: raw is exact but cannot scale to billions of events, while tiles stay fast but hide short spikes.", "Per-thread tracks versus per-processor tracks: threads follow program logic, processors show scheduling and contention, and the two answer different questions."],
    p: ["Unsynchronized clocks across processors make a reply appear to arrive before its request.", "Downsampling for display hides a one-millisecond stall that was the actual latency problem."],
    v: "Trace a program with a known 200 ms lock wait on one thread; confirm the viewer shows a gap of that length in that track at its correct start time and an overlapping hold span on the owner thread.",
    dep: ["event-ring-buffers", "trace-timestamping", "profile-interchange-format"]
  },
  "differential-profiles": {
    s: "Compares two profiles, before and after a change or good and bad run, and shows which functions gained or lost weight after normalization.",
    d: "Both profiles are reduced to per-function or per-path weights, normalized by total samples or by duration, and subtracted or divided. The result highlights regressions and improvements, often as a flame graph colored by delta. It is hard because profiles of different length or sampling rate are not directly comparable, because inlining and renamed functions break matching between builds, and because ordinary run-to-run noise can look like a change unless repeated runs give a noise floor.",
    k: ["Normalizing by total samples versus by wall time: share is robust to run length but hides an overall slowdown, whereas absolute time shows it but needs equal load.", "Matching by symbol name versus by address: names survive rebuilds, addresses are exact within one build only."],
    p: ["Comparing a run with warm caches to one with cold caches reports a regression that is only startup cost.", "A function renamed or inlined in the new build appears as one vanished and one new hot spot."],
    v: "Profile a program, add a known extra 10 ms loop to one function, profile again, and confirm the diff ranks that function first with a positive delta of about the expected share while untouched functions stay within noise.",
    dep: ["call-graph-aggregation", "profile-data-store"]
  },
  "source-annotation": {
    s: "Overlays sample counts or event costs on source lines and disassembly, so the expensive statement or instruction is visible next to the code.",
    d: "Sample addresses are mapped through the line table to source lines and kept per instruction for the disassembly view. Counts are summed per line, shown as a percentage in a margin, and often colored. Counter events such as cache misses can be annotated the same way. It is hard because optimized code interleaves instructions from many lines, so one line's cost may be spread across places, and because skid shifts a sample to a later instruction than the one that was slow.",
    k: ["Per-line summaries versus per-instruction detail: lines match how people think, but instructions reveal which operation stalls once the compiler has reordered code.", "Attributing inlined code to the caller's line versus the callee's source: caller view shows total cost at the call, callee view shows the real hot statement."],
    p: ["A cost shown on the line after the slow load is really skid, so the wrong statement gets optimized.", "Source that has changed since the build annotates the wrong lines with the old counts."],
    v: "Profile a function with one deliberately slow division inside a loop; confirm the annotation view places most of the weight on that line and on the division instruction within a small neighborhood.",
    dep: ["sample-attribution", "line-table-decoder", "disassembler"]
  },
  "profile-interchange-format": {
    s: "A defined file format for profiles that stores samples, stacks, string tables and module identities compactly so different producers and viewers can exchange data.",
    d: "A typical format stores a table of samples, each with a stack of location ids and a list of values, plus tables of locations, functions, mappings and strings that stacks refer to by index. Labels attach per-sample tags such as thread or request. Compression and shared tables keep files small. It is hard because producers differ in what they know: some have only raw addresses, some have names, and the format must carry enough module identity to symbolize later, while staying backward compatible as fields are added.",
    k: ["Indexed string and location tables versus inline names: tables shrink files by a large factor, but need a reader that resolves indices.", "A fixed schema versus open key-value labels: a fixed schema is easy to validate, labels let producers add context without format changes."],
    p: ["A producer that omits module identity makes later symbolization impossible once the binary changes.", "Mixing sample value units without recording them leads a viewer to add bytes to nanoseconds."],
    v: "Write a profile with the producer, load it in a second independent viewer, and confirm top functions, sample totals, value units and module identities match the producer's own report.",
    dep: ["module-map-tracking", "address-normalization"]
  },
  "expression-parser": {
    s: "Turns text typed by the user into a syntax tree that follows the rules of the program's source language, including casts, member access and pointer arithmetic.",
    d: "A lexer and parser per supported language read expressions such as casts to types, array subscripts, member chains, address-of and comparison. Names are resolved lazily against the current frame, then globals and types. Some parsers accept language extensions, such as a register name or a repeat operator for arrays. It is hard because it must parse in the language of the frame, not its own, and because type names versus variable names are ambiguous without symbol lookup during parsing.",
    k: ["One parser per language versus a common expression language: per-language parsing matches what users expect, but multiplies maintenance across languages.", "Resolving names at parse time versus at evaluation: parse-time errors are immediate, evaluation-time resolution lets one expression run across many frames."],
    p: ["A name that is both a type and a variable parses as the wrong one and produces a baffling error.", "Templates and angle brackets confuse the parser into reading a comparison as a type argument list."],
    v: "Evaluate casts, member chains and subscripts in a stopped frame, for example a pointer cast followed by an array index, and confirm the parsed tree yields the same value as the equivalent source line.",
    dep: ["symbol-lookup", "type-information"]
  },
  "expression-evaluator": {
    s: "Computes the value of a parsed expression against the target, reading memory and registers on demand and applying the source language's typing rules.",
    d: "Each node is evaluated into a value object that records its type, its location in memory or a register, and lazily fetched contents. Operators follow the language's promotion and overflow rules. Address-of yields a pointer value without reading memory, and assignment writes through the stored location. Function calls delegate to the inferior call machinery. It is hard because values can live in registers or be pieces spread across locations, and because correct semantics require emulating the language's arithmetic with the target's endianness and sizes.",
    k: ["Lazy values versus eagerly reading memory: laziness avoids reading huge objects and keeps lvalue information, but a lazy value can change before it is used.", "Emulating arithmetic in the debugger versus running code in the target: emulation has no side effects, while target execution is accurate for exotic operations."],
    p: ["Assigning to a variable whose location is a register that is only valid in the current frame silently writes the wrong place in an outer frame.", "Arithmetic done at the debugger's integer width differs from the target's, so overflow results disagree."],
    v: "Evaluate an expression mixing narrow signed and unsigned operands that overflows in the program, and confirm the debugger prints exactly the value the program computed for the same statement.",
    dep: ["expression-parser", "location-expressions", "cross-process-memory"]
  },
  "value-formatting": {
    s: "Renders a typed value as readable text according to its type, with options for radix, string length, array limits and depth.",
    d: "Formatting walks the type: integers in chosen radix, characters and strings up to a limit, floating point with round-trip precision, pointers with the symbol they point into, enums as names or flag combinations, and structures field by field. Limits stop output on huge arrays and cyclic structures. A format letter in a command overrides the default. It is hard because output can recurse, because memory behind a pointer may be unreadable, and because the right default for a byte buffer differs from that for a counter.",
    k: ["Print everything versus enforce limits: complete output is faithful, but a million-element array or a cyclic list can hang the session without limits.", "Type-driven defaults versus user-specified formats: defaults are quick, explicit formats avoid misreading a bit field or a pointer as a number."],
    p: ["Following a bad pointer to print a string reads garbage until a limit is hit and shows nonsense as if it were data.", "A cyclic structure prints forever without a depth or visited-set guard."],
    v: "Print a struct containing a self-referential pointer, a flag enum and a long string; confirm the output shows flag names, truncates the string with an ellipsis, and stops at the cycle.",
    dep: ["type-information", "cross-process-memory", "symbol-lookup"]
  },
  "pretty-printers": {
    s: "User-extensible formatters that show a container or smart pointer by its logical contents, rather than its internal fields.",
    d: "A printer is registered for a type or a type pattern. When a value matches, the debugger calls the printer to get a summary string and an optional list of children, which a front end can expand lazily. Printers for standard containers walk internal nodes, hash buckets or pointer tags and present elements in order. They are shipped with libraries or written by developers, using the scripting API. It is hard because printers depend on a library's internal layout, which changes between versions, and because they run on possibly corrupted data.",
    k: ["Printers shipped with the library versus built into the debugger: shipping keeps them in step with layout changes, built-in ones work without installation.", "Declarative layout descriptions versus code: descriptions are safe and fast to evaluate, code can handle arbitrary pointer-tagging tricks."],
    p: ["A printer that follows a corrupted pointer chain hangs or crashes at the exact moment the container is most interesting.", "Printer and library versions drift apart, so elements display in the wrong order or as garbage."],
    v: "Print a hash map, a smart pointer and a string-like type holding known contents; confirm each displays logical elements and counts, and that the raw view still shows the internal fields when requested.",
    dep: ["scripting-api", "type-information", "value-formatting"]
  },
  "memory-register-views": {
    s: "Shows raw memory in hexadecimal, ASCII or word forms, plus general, floating-point and vector registers, with changed values highlighted.",
    d: "A memory view reads a range through the target backend and formats it by unit size and radix. Register views read the register file for the selected frame, including vector and status registers, and show decoded flag bits. Registers of outer frames are reconstructed by the unwinder from saved values, not read from hardware. It is hard because outer-frame registers may be unknown, because some memory is unreadable or a device region with read side effects, and because each refresh costs a round trip.",
    k: ["Re-reading on every stop versus caching until resume: re-reading is always right, caching saves round trips on remote targets.", "Showing all vector registers versus a selected set: complete lists overwhelm, but a hidden vector register may hold the value being debugged."],
    p: ["Reading a memory-mapped device region in a hex view triggers side effects such as clearing a status flag.", "Showing a callee-saved register of an outer frame as if it were read directly, when the unwinder could not recover it."],
    v: "At a breakpoint, view a known buffer and the stack pointer; confirm the bytes match what the program wrote, a register changed by one step is highlighted, and an outer frame's unrecoverable register is marked unavailable.",
    dep: ["cross-process-memory", "unwind-table-interpreter", "remote-memory-register-access"]
  },
  "disassembler": {
    s: "Decodes machine code at an address into instructions with symbols, branch targets and, optionally, interleaved source lines.",
    d: "The decoder reads bytes and, per instruction set, produces mnemonic, operands and length. It resolves branch targets to symbols and can mix in source lines from the line table. It must follow the current instruction set mode, which can switch within a function on some processors, and cope with variable-length encodings: starting in the middle of an instruction decodes garbage. It is hard because data embedded in code, such as jump tables, is decoded as instructions, and because breakpoints inserted in memory must be hidden from the view.",
    k: ["Linear sweep from a symbol versus following control flow: linear is simple and fast, flow-following avoids decoding embedded data at the cost of complexity.", "Showing memory as it is versus the original bytes: the original hides inserted breakpoints, raw shows exactly what will execute."],
    p: ["Starting disassembly in the middle of an instruction produces misleading output that appears to be real code.", "An inserted breakpoint instruction appears in the listing, confusing someone comparing it with the binary."],
    v: "Disassemble a function with a jump table and a software breakpoint; confirm the listing matches an offline decode of the file, the breakpoint bytes are hidden, and the table appears as data or is marked.",
    dep: ["symbol-lookup", "line-table-decoder", "cross-process-memory"]
  },
  "inferior-calls": {
    s: "Calls a function in the stopped program on the user's behalf, to evaluate expressions or run a printing helper, then restores the original state.",
    d: "The debugger saves registers, builds a call frame following the calling convention, pushes arguments, sets the return address to a trap placed at a known location, and resumes the thread. When the trap fires it collects the return value and restores registers. Allocation of strings or objects may require calling the program's own allocator. It is hard because the call can hit a breakpoint, fault, block on a lock held by a stopped thread, or leave side effects that alter the very state under investigation.",
    k: ["Running called code in the program versus emulating it: running is exact for any function, emulation avoids side effects but cannot handle I/O or system calls.", "Resuming only the current thread versus all threads: one thread is safer for locks it does not hold, but deadlocks if the function waits on another thread."],
    p: ["A call made while the heap lock is held by another stopped thread deadlocks the session.", "A function with a breakpoint inside leaves the program stopped in a half-finished injected call."],
    v: "At a breakpoint, call a pure function with two arguments and a function that returns a structure; confirm both return correct values and the register file and stack pointer are identical afterward.",
    dep: ["thread-control", "software-breakpoints", "location-expressions"]
  },
  "stack-unwinder": {
    s: "Reconstructs the chain of active calls from a stopped thread's registers and stack memory, choosing the right method per frame.",
    d: "Starting from the current registers, it finds the caller's program counter, stack pointer and saved registers, one frame at a time. For each frame it tries unwind information from the debug or exception tables, falls back to frame-pointer chains, and finally to heuristics that scan the stack for return addresses. It stops at the entry point or on invalid data. It is hard because code without unwind data, signal trampolines, assembly routines and corrupted stacks all break the usual rules, and because inlined functions need virtual frames.",
    k: ["Table-driven unwinding versus frame pointers: tables are exact for any code but require loading and interpreting data, pointers are fast but need compiler cooperation.", "Scanning the stack as a fallback versus stopping at the first failure: scanning finds more frames but may show a plausible false chain."],
    p: ["Unwinding through a signal handler frame without special handling terminates the stack at the handler.", "A heuristic scan reports a stale return address left on the stack as a real caller."],
    v: "Break inside a function reached through a signal handler and an optimized library call; confirm the backtrace shows every frame in order, including the handler boundary, and ends at the thread's entry function.",
    dep: ["unwind-table-interpreter", "frame-pointer-unwinding", "inline-frame-synthesis", "cross-process-memory"]
  },
  "frame-pointer-unwinding": {
    s: "Walks a linked chain of saved frame pointers to find callers, which is fast and needs no tables but only works if code maintains the chain.",
    d: "Each function's prologue saves the caller's frame pointer and sets its own, so the saved values form a linked list on the stack with return addresses beside them. The unwinder reads two words per frame. This is what low-overhead sampling profilers use at interrupt time, since the loop is a few memory reads. It is hard because optimizing compilers may reuse the register for other values, libraries built without the chain break it, and the leaf function may not have set up its frame yet.",
    k: ["Keeping the frame pointer register versus freeing it for general use: keeping it costs a few percent in register pressure and enables cheap unwinding everywhere.", "Unwinding in the interrupt handler versus saving raw stack for later: the handler is cheap but limited to chains, saved stacks permit table-driven unwinding offline at large data volume."],
    p: ["A library compiled without frame pointers truncates every stack passing through it, hiding the true callers.", "The leaf frame is missed because a sample landed in the prologue before the pointer was set."],
    v: "Sample a program calling through a library built with and without frame pointers; confirm full stacks appear with the first and truncated or wrong stacks with the second, and that results match the table-driven unwinder when both work.",
    dep: ["cross-process-memory"]
  },
  "unwind-table-interpreter": {
    s: "Evaluates compiler-emitted rules that say, for each code address, how to recover the caller's registers from the current frame.",
    d: "Unwind data is a compact program of operations: define the frame base as stack pointer plus offset, record that a register was saved at some offset, remember or restore state across branches. The interpreter finds the entry covering the program counter, executes the operations up to that address, and yields rules for each register. The same data serves exception handling, so it exists even without debug builds. It is hard because rules vary by address within a function, hand-written code needs manual annotation, and lookup must be fast enough for sampling.",
    k: ["Interpreting the rules on every unwind versus precompiling them into lookup tables: interpreting needs no preparation, precompiled tables are fast and safe at interrupt time.", "Trusting the tables versus validating each step: trusting is quick, validation catches bad data but adds checks to the hot path."],
    p: ["Hand-written assembly without annotations unwinds into garbage while the compiler's code is correct.", "The interpreter evaluates the rule at the return address instead of the call address, picking the wrong row after a call that never returns."],
    v: "Unwind from every instruction of a function with a conditional prologue and a stack adjustment; confirm the computed caller address and stack pointer are correct at each instruction, including inside the prologue and epilogue.",
    dep: ["debug-info-parser", "process-address-map"]
  },
  "inline-frame-synthesis": {
    s: "Expands one physical frame into several logical frames for functions the compiler inlined, so backtraces and stepping show the source's structure.",
    d: "The scope tree records, for a code range, that it came from an inlined call with a call site file and line. Given a program counter inside such a range, the debugger creates virtual frames from the innermost callee outward, all sharing one stack pointer and the same physical registers. Stepping, breakpoints on the inlined function and the up and down commands all use these virtual frames. It is hard because ranges are non-contiguous, instructions may be attributed to different scopes in turn, and stepping out of an inline must not run the whole outer function.",
    k: ["Showing virtual frames versus only physical ones: virtual frames match the source, but the apparent call has no real call instruction and no distinct stack frame.", "Breakpoints on inlined functions as a set of locations versus one: a set catches every copy, yet one source line can map to dozens of addresses."],
    p: ["Stepping out of an inlined function with the physical-frame logic runs until the real caller returns, skipping the rest of the outer function.", "Variables in an inlined frame show as unavailable because their locations were optimized away."],
    v: "Break in a function inlined at three call sites; confirm the backtrace shows the logical callee frame above its caller at each site, and that finish returns to the caller's following line, not to its caller.",
    dep: ["scope-and-inline-tree", "stack-unwinder", "location-lists"]
  },
  "symbol-lookup": {
    s: "Maps names to addresses and addresses to names, using symbol tables and debug information, for functions, variables and types in every loaded module.",
    d: "Given a name, lookup searches by scope: the current block, enclosing functions, file, then globals across modules, using an index for speed. Given an address, it finds the module, then the nearest preceding function symbol or the debug-information scope that covers it. Results prefer debug information over the symbol table. It is hard because names are not unique, overloaded and templated entities share names, stripped binaries have only exported symbols, and shared libraries load and unload during a run.",
    k: ["Using debug information first versus the symbol table first: debug data is precise and has sizes and types, the table exists even when stripped.", "Eager index building at load versus lazy indexing: eager gives instant lookups after a wait, lazy starts immediately but delays the first command."],
    p: ["An address in padding after a function resolves to the next function's name with a large offset that looks plausible.", "Multiple definitions of a static name in different files resolve to the wrong one without scope context."],
    v: "Resolve one hundred addresses sampled across the executable and two libraries, and look up their names back; confirm round trips agree, and an address in padding is reported with its offset past the symbol's size.",
    dep: ["debug-info-parser", "symbol-index-cache", "process-address-map"]
  },
  "demangler": {
    s: "Converts compiler-encoded symbol names back into readable source-level names with namespaces, parameter types and template arguments.",
    d: "Compilers encode a function's qualified name and parameter types into a flat symbol string so overloads get distinct link names. The demangler parses this scheme, which has substitutions for repeated components, and prints the source-style name. Options choose whether parameters, return types and templates are shown. It is hard because there are several incompatible schemes across compilers, nested template arguments make names thousands of characters long, and name matching in the other direction, from source name to symbol, needs the reverse.",
    k: ["Demangling for display only versus using the demangled form for matching: display-only is simple and safe, matching on demangled text is user-friendly but ambiguous.", "Full signatures versus bare names: signatures disambiguate overloads, bare names make flame graphs and tables readable."],
    p: ["Long template names make profile tables unreadable and defeat column layout unless truncated by a policy.", "Applying the wrong scheme to a symbol returns a plausible but incorrect name."],
    v: "Demangle a corpus of symbols covering overloads, nested templates and operator names, and confirm each matches the compiler's own printing of the declaration and malformed input is returned unchanged.",
    dep: []
  },
  "source-path-mapping": {
    s: "Translates source paths recorded at build time into paths that exist where the debugger runs, and verifies the file is the one compiled.",
    d: "Debug information stores the file name and compilation directory as seen by the build. The debugger applies prefix rewrite rules, searches directories, and may fetch from a source server by checksum. When a checksum is recorded it compares it to the file found. It is hard because builds happen in containers or on other machines with paths that exist nowhere else, because several versions of the same file may be present, and because showing the wrong revision of a source file silently misleads.",
    k: ["Prefix substitution rules versus searching by file name: rules are exact and fast, searching is forgiving but can pick a similarly named file.", "Fetching source on demand versus requiring a local checkout: fetching works anywhere, but needs network access and a trusted source of files."],
    p: ["A file with the same name on a search path shadows the real one and the debugger shows a different revision.", "Absolute paths from a build container match nothing, so every stop shows no source."],
    v: "Debug a binary built in another directory tree with a prefix rule configured; confirm the source opens, its checksum matches the recorded one, and a deliberately edited copy is flagged as mismatched.",
    dep: ["debug-info-parser", "line-table-decoder"]
  },
  "observer-effect": {
    s: "Every observation costs time, memory or ordering, and the tool can change the behavior it was started to investigate.",
    d: "A breakpoint changes timing and may hide a race. A sampling interrupt perturbs caches and scheduling. A probe adds instructions, and tracing adds buffer traffic that competes for memory bandwidth. Stopping one thread lets others run ahead. Bugs that disappear under the debugger and profiles that show the profiler's own cost are the same problem. Design must decide what is acceptable to perturb, measure the perturbation, and offer low-disturbance modes such as hardware breakpoints, sampling instead of tracing, and record and replay.",
    k: ["Stopping all threads versus only the one that hit: all-stop gives a consistent snapshot, per-thread stops keep timing closer to real but show inconsistent state.", "Low-rate sampling versus complete tracing: sampling disturbs less and loses short events, tracing sees everything and may change the schedule."],
    p: ["A race that vanishes whenever a breakpoint or probe is added is mistaken for fixed.", "A profile dominated by the profiler's own handler is read as the program's behavior."],
    v: "Run a known race-sensitive test with and without the tool attached many times; compare failure rates, and compare a profile's total runtime with the unobserved runtime to quantify the slowdown.",
    dep: ["single-stepping", "sampling-rate-control", "perturbation-checks"]
  },
  "debug-info-fidelity": {
    s: "Debug information describes the program the compiler intended to build, and optimization makes it incomplete or wrong, so every value and line shown carries an unstated confidence.",
    d: "Optimized code has variables with no location at some instructions, lines that jump around, inlined bodies, and values held only in registers that are reused. Tools show the best the tables say: a value may be marked unavailable, be stale from before a reassignment, or be reconstructed from an expression over other values. Design must choose between reporting less and reporting something that may mislead, and must keep precise ranges for locations and call sites.",
    k: ["Showing unavailable variables explicitly versus guessing: explicit gaps are honest but frustrating, guesses are convenient and sometimes wrong.", "Debugging optimized builds versus a separate unoptimized build: optimized shows real behavior, unoptimized is easier to inspect but may not reproduce the bug."],
    p: ["A variable shows its previous value after the compiler moved the update, and the bug is misdiagnosed.", "Stepping jumps backward in the source because instructions are scheduled out of order."],
    v: "Debug the same function built at two optimization levels; confirm the lower level shows every local, the higher level marks some unavailable rather than wrong, and a watch on a value reconstructed by the compiler gives the true value.",
    dep: ["location-lists", "line-table-decoder", "call-site-information"]
  },
  "address-identity": {
    s: "The same code or data has different addresses in the file, in memory and across runs, so every tool must say which address it means.",
    d: "Files list link-time addresses, loaders place modules at randomized bases, and just-in-time code has no file at all. A tool records an address as module identity plus offset, translates using the process's mapping at the moment of the sample, and handles modules being loaded, unloaded and replaced mid-run. A breakpoint set by line must be translated to a runtime address in each loaded module, and a profile read months later needs the exact build that ran.",
    k: ["Storing module-relative addresses versus absolute ones: relative survive randomization and reuse, absolute are simpler but only valid for that run.", "Identifying modules by path versus by content identifier: paths are readable, content identifiers stay correct when files are replaced."],
    p: ["Symbolizing a sample with the wrong build produces a confident but incorrect function name.", "A library unloaded and another mapped at the same address makes old samples resolve to the new module."],
    v: "Profile two runs with different randomized bases and a rebuilt binary in between; confirm both profiles resolve every sample to the right function using their own module identities.",
    dep: ["process-address-map", "debug-info-matching", "module-map-tracking"]
  },
  "stop-versus-run": {
    s: "A debugger halts the program to look at a consistent state, while profilers and tracers watch it keep running, and the two models need different machinery.",
    d: "Stop-the-world debugging reads memory and registers in a quiet snapshot and can run arbitrary evaluations. Run-while-observing tools take bounded actions at interrupt time, buffer events and analyze later, and must never block the program. Hybrids exist: non-stop mode stops one thread, and live inspection reads memory of a running process without halting it. The choice sets what is safe in a handler, how consistent reads can be and how long the program may be paused.",
    k: ["All-stop versus non-stop thread control: all-stop keeps state consistent and easy to reason about, non-stop disturbs less and lets services stay alive.", "Reading a live process versus stopping it: live reads avoid pauses, but pointers may change between reads."],
    p: ["Reading a linked structure from a running process follows a pointer that was freed a moment earlier.", "Heavy evaluation at interrupt time blocks the program and turns a sampler into a source of stalls."],
    v: "Inspect a multi-threaded service in all-stop and non-stop modes; confirm others remain stopped or running as configured, and that a snapshot read of shared data is consistent only in all-stop mode.",
    dep: ["thread-control", "debug-event-loop", "sample-capture"]
  },
  "privilege-and-trust": {
    s: "Inspecting another process means reading its secrets and changing its code, so access rules, symbol sources and recorded data all need explicit trust decisions.",
    d: "The operating system permits tracing only the same user's processes, or any with privilege, and may further restrict by policy. Debuggers and profilers load symbols and pretty printers that execute code, fetch debug files from servers, and write dumps that contain memory with keys and personal data. Design must decide who can attach, which auto-loaded scripts run, whether remote stubs authenticate, and how dumps and profiles are scrubbed, stored and shared.",
    k: ["Auto-loading helper scripts versus requiring approval: auto-loading makes printers just work, approval stops a malicious project directory from running code.", "Collecting full memory dumps versus stack-only reports: full dumps allow deep analysis, but include secrets and have legal weight."],
    p: ["A crash dump uploaded to a shared service contains passwords and tokens from the process's memory.", "A debugger opened in an untrusted project directory executes a script that came with the code."],
    v: "As an unprivileged user try to attach to another user's process and to a protected one; confirm both are refused with a clear reason, and check that a crash report has the scrubbing policy applied.",
    dep: ["process-trace-interface", "remote-stub", "core-dump-capture"]
  },
  "overhead-versus-fidelity": {
    s: "More detail costs more time and data, so every collector chooses a rate, a depth and a set of events that trade accuracy against disturbance.",
    d: "Doubling the sampling rate doubles interrupt cost and data volume and narrows the statistical error only by a factor of about 1.4. Deep stacks cost more per sample. Tracing every call gives exact counts at a large slowdown. Design must offer knobs, choose safe defaults for production, state the error that results, and allow adaptive modes that raise the rate for suspicious periods and drop it elsewhere.",
    k: ["Always-on low-rate profiling versus on-demand high-rate sessions: always-on catches rare problems without notice, on-demand gives detail but only when someone looks.", "Fixed rate versus adaptive rate: fixed is predictable and unbiased, adaptive saves cost but needs weights to correct the bias."],
    p: ["A high-frequency profile in production causes the latency incident it was started to investigate.", "A low rate on a short run gives too few samples, and the ranking is noise."],
    v: "Measure the same workload with the profiler off and at three sampling rates; confirm the slowdown stays under the stated budget at the default rate and the top functions agree across rates within the expected error.",
    dep: ["sampling-rate-control", "probe-cost-budget", "loss-accounting"]
  },
});
