// Details for the system emulator plate, part 3: CPU emulation, memory map and bus.
ATLAS.details("system-emulator", {
  "instruction-decoder": {
    s: "Turns raw guest instruction bits into an operation, operands and length, in a form the interpreter or translator can act on.",
    d: "Decoding extracts opcode fields, register numbers, immediates and addressing modes. Fixed-width instruction sets decode with table lookups on bit fields, while variable-length ones need prefixes and multiple bytes read before the length is known. Decoders are often generated from a table describing the instruction set, so the interpreter, disassembler and translator share one source of truth. The difficulty is the corner cases: undefined opcodes that real hardware executes in a particular way, mode-dependent meanings and prefixes that stack.",
    k: ["Generated decoder from a table versus handwritten: generated code is consistent across tools and easy to extend, while handwritten code can be faster for hot paths but drifts from the other tools.", "Decode every time versus decode once and cache: decode every time is simplest, while caching saves the repeated work and requires invalidation when memory changes."],
    p: ["Undocumented opcodes are treated as errors, but real software uses them as shortcuts.", "A mode flag changes the meaning of the same bytes, and the cache returns a decode made under the old mode."],
    v: "Decode every possible opcode byte pattern and compare mnemonic and operands against the reference listing from the original assembler, including undocumented opcodes, and confirm zero differences.",
    dep: []
  },
  "interpreter": {
    s: "Executes guest instructions one at a time by fetching, decoding and performing each in host code, the simplest and most accurate way to run a processor.",
    d: "The loop fetches an instruction through the memory map, decodes it, performs the operation on a register file kept in host memory, updates flags and advances time. Because every step is visible, it is easy to add exact timing, breakpoints, tracing and per-instruction interrupt checks. It is also the reference against which faster modes are tested. The difficulty is speed: decode and dispatch overhead cost tens of host instructions per guest instruction, so it is typically too slow for powerful guests.",
    k: ["Switch dispatch versus table of function pointers or threaded dispatch: switch is simple and portable, while threaded dispatch lets the host predict branches better and runs faster.", "Check interrupts and events every instruction versus at intervals: every instruction is exact, while intervals are faster but delay interrupt delivery."],
    p: ["Flags are computed eagerly for every instruction, wasting most of the time since few are ever read.", "A shortcut in one rarely used instruction makes the interpreter disagree with the hardware, and the translator, copied from it, inherits the error."],
    v: "Run the single-step vector set and a boot of a known title in the interpreter, and confirm zero vector mismatches and a trace identical to the reference through the first million instructions.",
    dep: ["instruction-decoder", "memory-map", "interrupt-and-exception-handling", "event-scheduler"]
  },
  "cached-interpreter": {
    s: "An interpreter that decodes instructions once into a compact internal form and stores them, so repeated execution skips decoding and dispatches directly to handler code.",
    d: "On first execution of an address, the instruction or a short sequence is decoded into an entry holding a handler pointer and pre-extracted operands. Later runs jump through the entries without bit-field work. Sequences are grouped into basic blocks so interrupt and event checks happen once per block. The cache is invalidated when the underlying memory is written. It typically runs two to four times faster than a plain interpreter and stays portable. The difficulty is invalidation and cache memory use.",
    k: ["Cache decoded instructions versus decode each time: caching is much faster for loops, but needs invalidation on code writes and costs memory.", "Cache per instruction versus per block: per instruction is simple, while per block cuts dispatch and checks but complicates exact timing and breakpoints."],
    p: ["Code in a region of RAM is overwritten with new code and the stale cache keeps running the old instructions.", "Cache entries for code in banked memory are reused after a bank switch and execute the wrong program."],
    v: "Run a loop-heavy benchmark in the plain and cached interpreters, confirm identical output state and a measured speedup, then run a program that rewrites its own code and confirm identical results.",
    dep: ["interpreter", "instruction-decoder", "self-modifying-code"]
  },
  "block-translator": {
    s: "Translates blocks of guest instructions into native host code once and runs the generated code directly, giving the fastest execution.",
    d: "Starting at an address, the translator decodes instructions until a branch, emits equivalent host code, and stores it in a code cache. Register contents are held in host registers where possible, and memory accesses call or inline the memory fast path. Compared with interpretation it removes decode and dispatch and enables optimization across instructions. It must still be exact: flags, exceptions and timing have to be reproduced or deferred correctly. The difficulty is correctness of every instruction in generated form and the platform-specific code emitter.",
    k: ["Translate whole blocks up front versus translate lazily on first use: lazy translation starts fast and skips unused code, while up-front translation avoids pauses during play but wastes time on code never run.", "Optimize heavily versus emit simple code: optimization gives more speed, but costs translation time and creates more places for bugs."],
    p: ["A flag or exception is skipped by an optimization that assumed it would not be observed, and a rare title depends on it.", "Translation stutter appears on first execution of each new area, which feels like a performance bug in play."],
    v: "Run the vector set and the test suites in translator mode, and confirm results identical to the interpreter, then measure a benchmark and confirm a multiple of the interpreter's speed.",
    dep: ["instruction-decoder", "code-cache", "register-allocation", "lazy-flags", "page-table-fast-path", "executable-memory"]
  },
  "code-cache": {
    s: "Stores translated blocks keyed by guest address and links them to each other, so execution moves from block to block without returning to the dispatcher.",
    d: "A lookup table maps guest addresses to host code. When one block ends in a branch to a known target, its exit is patched to jump directly to the target block, so hot loops run entirely in generated code. The cache has a fixed size and is flushed or partially evicted when full. Invalidation must remove blocks when guest code changes and unlink any blocks that jumped to them. The difficulty is management: eviction, patching code that is executing, and keeping the lookup quick.",
    k: ["Flush the whole cache when full versus evict individual blocks: whole flush is simple and fast, but causes a retranslation burst, while fine eviction avoids the burst but needs per-block bookkeeping.", "Direct block linking versus returning to a dispatcher each time: linking is much faster, but makes invalidation and breakpoints harder."],
    p: ["A block is freed while another block still jumps into it, and execution lands in reused memory.", "The cache size is too small for large titles and thrashes continuously, running slower than the interpreter."],
    v: "Run a long session of a large title with cache statistics, and confirm the hit rate stays high, flushes are rare, and that after an induced flush output hashes match an uninterrupted run.",
    dep: ["block-translator", "executable-memory", "self-modifying-code"]
  },
  "register-allocation": {
    s: "Decides which guest registers live in host registers within a translated block and which are spilled to memory, to avoid needless loads and stores.",
    d: "Within a block, the translator tracks which guest registers are in which host registers, loads them on first use and writes dirty ones back at block exits and before any operation that can fault or call into the emulator. When the guest has more registers than the host, some always stay in memory. Calling convention rules decide which host registers survive calls to helper routines. The difficulty is interaction with exceptions and debugging: state must be recoverable at any point where the guest could observe it, and wrong allocation produces failures that depend on code layout.",
    k: ["Allocate per block versus keep a global mapping across blocks: per block is simple and robust, while a global mapping avoids reloads at block boundaries but constrains every block.", "Write back dirty registers eagerly versus lazily: eager write-back keeps state always correct, while lazy write-back is faster but must be flushed at exact points."],
    p: ["A helper call clobbers a host register that was holding a guest value not yet written back.", "An exception inside a block reports a stale register value because the dirty copy was never flushed."],
    v: "Run register-heavy test programs and the vector set in translator mode with allocation enabled, and confirm results match those with allocation disabled, then inject a fault mid-block and confirm all registers read correctly in the handler.",
    dep: ["block-translator"]
  },
  "lazy-flags": {
    s: "Defers computing condition flags until an instruction actually reads them, storing the operands and operation instead of the flag bits.",
    d: "Most instructions set flags that the next instruction overwrites without reading. Instead of calculating carry, zero, sign and overflow each time, the emulator records the last operation's operands and result and derives a flag only when a branch or arithmetic instruction needs it. A translator can also analyze a block to find which flag writes are dead and drop them entirely. The difficulty is that other instructions read or partly update flags, and exceptions, state saves and debuggers need the true flag word, so it must be materialized exactly when observed.",
    k: ["Lazy flags versus computing eagerly: lazy cuts most of the cost of arithmetic, but adds a deferred-state mechanism and conversion at every observation.", "Dead flag elimination within a block versus across blocks: within a block is safe and local, while across blocks removes more work but needs analysis of successor blocks."],
    p: ["A partial flag update, such as touching only carry, loses the deferred state for the other flags.", "A state saved with deferred flags stores the operation instead of the flag word, and loads fail on an interpreter build."],
    v: "Run the flag-focused test programs and vectors in each mode and confirm the materialized flag word equals the eagerly computed one after every instruction, including through exceptions and save and load.",
    dep: ["block-translator", "interpreter"]
  },
  "interrupt-and-exception-handling": {
    s: "Recognizes interrupt requests and faults at the right instruction boundary, saves processor state and transfers control to the guest's handler as the hardware would.",
    d: "Between instructions, or at block ends in translated code, the core checks the interrupt controller's line and the processor's mask. On acceptance it pushes or banks state, switches mode and jumps through a vector table. Faults raised inside an instruction, such as an invalid access, need the processor state as it was before the instruction. The difficulty is precision: delivering at the wrong boundary, such as after a delay slot or in the middle of a multi-step instruction, changes behavior in software that depends on it, and translated code must reconstruct exact state at any fault.",
    k: ["Check at every instruction versus at block boundaries: every instruction delivers on time, while block boundaries are faster and delay interrupts by up to a block.", "Precise exceptions versus approximate: precise state makes every handler correct, but costs bookkeeping in translated code that approximation avoids."],
    p: ["An interrupt arrives during a delay slot and the return address points to the wrong instruction.", "A fault in translated code leaves registers in a half-updated state, and the handler resumes with wrong values."],
    v: "Run an interrupt test suite that triggers interrupts at every position around branches and delay slots, and confirm saved return addresses and handler entry cycles match the hardware reference in every mode.",
    dep: ["interrupt-controller", "event-scheduler", "memory-map"]
  },
  "self-modifying-code": {
    s: "Detects when guest memory containing already decoded or translated code is written, and discards the stale cached form so the new code runs.",
    d: "Real software loads code into RAM, patches it, decompresses over it, or uses it as scratch data. The emulator must notice writes into pages that hold cached code. Common methods are marking pages as containing code and checking on every write, using the host's page protection to trap writes, or storing a hash of source bytes and validating before running. The difficulty is cost and frequency: code and data often share a page, so writes to data trigger constant invalidation and retranslation.",
    k: ["Page protection traps versus checking on each write: traps cost nothing on ordinary writes but are expensive when they fire, while checks add constant overhead.", "Fine-grained invalidation versus whole-page: fine-grained keeps unaffected blocks, but needs a map of which blocks cover which bytes."],
    p: ["Code and a frequently written variable share a page and the emulator spends most of its time retranslating.", "A write by DMA instead of the processor bypasses the check and the stale code keeps running."],
    v: "Run a program that decompresses code into RAM then jumps to it, and one that patches an instruction in a loop, and confirm correct output in every mode, with invalidation counts reported by the profiler.",
    dep: ["code-cache", "memory-map", "dma-engine"]
  },
  "floating-point-and-vector": {
    s: "Reproduces the guest's floating point and vector instructions, including rounding modes, special values and exact precision, using host operations or software routines.",
    d: "Host floating point rarely matches the guest bit for bit: precision, denormal handling, rounding, NaN payloads and flag semantics differ. Faithful emulation uses software implementations of the arithmetic, or host instructions plus fixups for corner cases. Vector units apply the same operation to many lanes and may saturate or use unusual formats. The difficulty is determinism and cost: software floating point is slow, and host math functions can return different results on different hosts, which breaks replays and netplay.",
    k: ["Software floating point versus host instructions with fixups: software is exact and deterministic across hosts, while host instructions are fast but need fixups that may miss cases.", "Emulate exact precision of intermediate results versus the nearest host format: exact precision matches the original, while host format is faster and usually close enough."],
    p: ["A transcendental function uses the host math library and gives different last-bit results on another operating system.", "Denormal or NaN handling differs, and physics in a title slowly diverges from the original behavior."],
    v: "Run floating point conformance vectors and a physics-heavy title on two different hosts, and confirm bit-identical register results and identical output hashes after one minute of play.",
    dep: ["instruction-decoder", "host-variance"]
  },
  "memory-map": {
    s: "The table describing which guest address ranges are RAM, ROM, device registers, mirrors of other regions or empty, and how each is accessed.",
    d: "The map is built at start from the machine definition and the loaded image. Each range records its backing, whether it is readable or writable, access width rules, and its timing. Many machines mirror regions, so several addresses reach the same storage, and some map different things on read and write. Banked regions change at run time. Every processor access goes through the map, so it also decides the cost of every load and store. The difficulty is that real maps are full of exceptions that software uses.",
    k: ["Flat table of pages versus a list of ranges: a table gives constant-time lookup for the fast path, while a range list is compact and easier to modify at run time.", "Separate maps per processor versus one shared map: separate maps match machines where each chip sees a different address space, but multiply the structure to keep consistent."],
    p: ["A mirrored region is implemented as a copy rather than an alias, and a write through one address is invisible through the other.", "Reads and writes to the same address reach different backing storage and the viewer shows only one of them."],
    v: "Write distinct values through every mirror of a region and read them through each alias, and confirm the results follow the documented map, including regions that read differently from how they write.",
    dep: ["bank-switching"]
  },
  "page-table-fast-path": {
    s: "A table of host pointers indexed by guest address, so most memory accesses resolve to a direct host memory read or write without any function calls.",
    d: "The guest address space is divided into pages, for example 4 KiB. For each page the table holds a host pointer when the page is plain RAM or ROM, or a marker when the access must take the slow path through device handlers. A load is a shift, a table lookup, an add and a memory read. Translated code inlines this sequence. Some emulators instead reserve a large host region and map guest memory at a fixed offset, letting the host's own memory protection catch invalid accesses. The difficulty is keeping the table in step with banking and mapping changes.",
    k: ["Software page table lookup versus reserving host address space with hardware faults: the table is portable and predictable, while reserved address space is faster but depends on host features and fault handling.", "Larger pages versus smaller pages: larger pages shrink the table and cache footprint, but cannot represent small regions such as a single device register."],
    p: ["A bank switch changes the mapping but the table still points at the old bank for a cached page.", "A region smaller than a page is entirely marked slow, and a hot RAM area next to a register sees every access go slowly."],
    v: "Run a memory benchmark and a bank-switching test with the fast path on and off, and confirm identical results and a large speedup, including accesses that straddle a page boundary.",
    dep: ["memory-map", "mmio-dispatch", "bank-switching"]
  },
  "mmio-dispatch": {
    s: "Routes reads and writes to device register addresses to the code that models the device, applying the access width and side effects the hardware had.",
    d: "Accesses that miss the fast path look up a handler by address range and call it with the address, width and value. Handlers may trigger side effects, such as a read that clears a flag, a write that starts a transfer or one that changes the mapping of other regions. They also bring the device up to date with the current emulated time before answering. The difficulty is volume and quirks: some registers are 8, 16 or 32 bits wide, ignore byte writes, or behave differently when accessed twice in a row.",
    k: ["Handler per register range versus a central switch per device: per range handlers are modular and testable, while a central switch makes shared quirks easier to see.", "Catch the device up on every access versus only when needed: every access is exact and simple, but costs time in busy polling loops."],
    p: ["A byte write to a 32-bit register writes zeros into the other bytes where hardware would leave them unchanged.", "A device is not synchronized before a read and returns a status value from earlier in the frame."],
    v: "Write a test that accesses each register with every width and alignment, and confirm responses and side effects match the reference table, including registers where reads clear bits.",
    dep: ["memory-map", "component-synchronization", "timers", "interrupt-controller"]
  },
  "address-translation": {
    s: "Emulates the guest processor's memory management unit, which maps virtual addresses to physical ones with permissions, for machines that have one.",
    d: "Hardware walks page tables set up by the guest operating system and caches the results in a translation lookaside buffer. The emulator reproduces the table formats, permission checks and fault generation, and usually caches translations itself. Translated code on such guests must check each access's translation, or use a software lookaside buffer in the fast path. Flushes of the guest's buffer must invalidate the emulator's cache. The difficulty is speed, since every access is a translation, and the exactness of fault behavior and buffer replacement that some software relies on.",
    k: ["Emulate the lookaside buffer behavior exactly versus use a larger private cache: exact behavior is needed by software that expects stale entries, while a larger cache is faster and almost always sufficient.", "Check permissions on every access versus at translation time: translation time caches the result and is quick, but must be invalidated on every permission change."],
    p: ["The guest flushes its translation buffer entry and the emulator's cache keeps the old mapping.", "A fault raised in the middle of a translated block leaves memory and registers in a state the guest handler does not expect."],
    v: "Run a guest operating system boot and a paging stress test that remaps, protects and unmaps regions, and confirm faults, address and permission values match the reference, with no stale mappings after flushes.",
    dep: ["memory-map", "page-table-fast-path", "interrupt-and-exception-handling"]
  },
  "bank-switching": {
    s: "Changes which chunk of a larger ROM or RAM appears at a given address range, under control of the guest software or chips on the cartridge.",
    d: "Machines with small address spaces fit large programs by switching banks: writes to certain addresses select which bank is visible. Cartridges carry mapper circuits of many designs, each with its own register layout, bank sizes and extras such as scanline counters. The emulator implements each mapper type as a module that updates the memory map and fast path tables when its registers change. The difficulty is the number of mappers, their undocumented behaviors, and bus conflicts where the written value ANDs with the ROM contents.",
    k: ["One module per mapper type versus a table-driven generic mapper: modules capture odd behavior exactly, while a generic mapper covers many simple cases with less code.", "Remap pages immediately on register write versus resolve on each access: immediate remapping keeps accesses fast, but needs care so every cached pointer is updated."],
    p: ["A mapper register write is decoded with the wrong address mask, so unrelated writes switch banks by accident.", "Bus conflicts are ignored and a title that relies on them selects the wrong bank."],
    v: "Load a test image for each mapper, switch through every bank and confirm the visible contents at the mapped addresses equal the expected data after each register write.",
    dep: ["memory-map", "mmio-dispatch"]
  },
  "dma-engine": {
    s: "Emulates hardware that copies data between memory and devices without the processor, including its timing, priority and effect on the processor.",
    d: "Software programs source, destination, length and mode, then starts a transfer. The engine moves data over time, using bus cycles that may stall or pause the processor, and can be paused by higher priority transfers. Some transfers run during video blanking, and some write to video memory with special modes. The emulator may do the copy instantly and charge the right amount of time, or move data a unit at a time. The difficulty is behavior while running: whether the processor can read the source, what a partial transfer looks like, and which code and data it can overwrite.",
    k: ["Instant copy plus time penalty versus incremental transfer: instant is faster and simpler, but software that reads memory during the transfer sees the final data too early.", "Model processor stalls exactly versus approximate: exact stalls keep timing right, but need accurate bus arbitration."],
    p: ["A transfer into code memory finishes instantly and bypasses code invalidation, so the old code runs.", "Overlapping source and destination ranges copy in the wrong direction and corrupt data."],
    v: "Run DMA test programs that transfer with overlap, during active display and with interrupts, and confirm destination contents, cycle counts and processor stall timing match the hardware reference.",
    dep: ["bus-contention", "event-scheduler", "memory-map", "self-modifying-code"]
  },
  "bus-contention": {
    s: "Models the cost when several components compete for the same bus or memory, including wait states for slow memory and delays while another unit holds the bus.",
    d: "On real machines the processor, video chip and DMA share memory, so an access can be delayed until another finishes. Different memory regions also take different numbers of cycles, with sequential accesses sometimes cheaper than random ones. The emulator charges each access its cost, and may arbitrate between requesters by priority. It matters most for software that syncs to video timing. The difficulty is the number of special cases and the cost of tracking them on every access, which can double the cost of the memory path.",
    k: ["Per-access timing versus per-instruction average: per-access timing is exact, but slows the fast path, while averages are cheaper and miss tight timing code.", "Model arbitration between requesters versus fixed penalties: arbitration is faithful, while fixed penalties are simple and enough for most titles."],
    p: ["A video chip holds the bus and the processor is not stalled, so timed code finishes early.", "Wait state counts are copied from documentation that omitted a special case, and a title drifts out of sync."],
    v: "Run a cycle-timing test program that measures instruction time from different memory regions and during video activity, and confirm measured cycle counts equal the hardware reference values.",
    dep: ["memory-map", "cycle-accuracy-model"]
  },
  "open-bus-behavior": {
    s: "Reproduces what the hardware returns when software reads an address that nothing drives, usually the last value on the bus, which some software depends on.",
    d: "When no device responds, the data lines hold whatever was last transferred, decaying slowly or returning the previous fetch. Writes to read-only space may do nothing or hit hidden registers. The emulator tracks the last value moved over the bus and returns it, or a value derived from the last opcode fetched. Software sometimes depends on it for copy protection or timing, and some chips return partly open bus bits. The difficulty is knowing exactly what real hardware does in each case, since documentation rarely covers it.",
    k: ["Return the last bus value versus return zero or all ones: last bus value matches hardware and passes accuracy tests, but needs the value tracked on every access.", "Model per-bit decay versus ignore decay: decay modeling matches rare analog behavior, but is almost never observed by software."],
    p: ["Unmapped reads return zero, and a title that tests for open bus decides the hardware is missing a chip.", "Open bus values are tracked on the fast path only, and slow path reads use stale data."],
    v: "Read a set of unmapped addresses after known bus activity and confirm the values equal those recorded from hardware for the same preceding instructions, then run the open-bus test program and confirm a pass.",
    dep: ["memory-map", "mmio-dispatch"]
  }
});
