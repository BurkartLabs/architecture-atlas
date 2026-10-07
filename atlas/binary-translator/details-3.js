// Details for the binary translator plate, part 3: decoder, IR, code generation, guest CPU state.
ATLAS.details("binary-translator", {
  "guest-instruction-fetch": {
    s: "Reads guest instruction bytes from guest memory for decoding, handling page boundaries, permissions and bytes that may change between reads.",
    d: "The fetcher reads from the guest address through the guest's view of memory, checks execute permission, and returns bytes to the decoder. Variable-length encodings mean the decoder does not know how many bytes it needs until it has read some, so fetch proceeds incrementally and may cross into a page that is unmapped or not executable. A fault at that point must be reported at the right instruction, not at the start of the block. It is hard because bytes read for translation may later change, so a snapshot must be recorded for validation.",
    k: ["Fetch through the same address translation as data vs a separate path: sharing is consistent and simple; a separate path can enforce execute permission and record source pages cheaply.", "Fetch bytes once into a buffer vs on demand: buffering is simple and may read past valid memory; on demand is exact and costs more calls."],
    p: ["Reading a full buffer past the end of a mapping faults even though the instruction itself ended before the page boundary.", "Bytes snapshotted for hashing differ from the bytes decoded when another thread rewrote the page in between."],
    v: "Place an instruction so it straddles a mapped and an unmapped page and confirm the fault is reported only if the instruction truly needs the unmapped byte, at the correct guest address.",
    dep: ["address-translation","permission-mirroring"]
  },
  "instruction-decoder": {
    s: "Turns raw bytes into a structured instruction: opcode, operands, sizes, prefixes and the effect on flags and control flow.",
    d: "Decoders are driven by tables or generated from a machine-readable description of the encoding. They identify prefixes, determine opcode class, extract register and immediate fields and compute instruction length. The output is a structured record rather than text. For variable-length encodings, decoding is intricate: prefix ordering, mode-dependent operand sizes and hundreds of exceptions. It is hard because errors in the rarely used corners surface only in particular programs, and because the decoder must also say exactly where it stopped, since the next instruction begins there.",
    k: ["Hand-written decoder vs generated from a description: hand-written is fast and easy to tune; generated is consistent with documentation and easier to extend to new instructions.", "Decode to a full record vs decode lazily by field: a full record is simple to consume; lazy decoding avoids work for instructions treated generically."],
    p: ["An incorrect length for a rare prefix combination desynchronizes decoding for the rest of the block.", "Decoding accepts reserved encodings the real machine rejects, so invalid programs run when they should fault."],
    v: "Decode a large corpus of real code and fuzzer output and compare the decoded length, opcode and operands against a reference disassembler, with zero unexplained differences.",
    dep: ["guest-instruction-fetch","operand-decoding","semantics-specification"]
  },
  "operand-decoding": {
    s: "Extracts and resolves each instruction's operands: registers, immediates and memory references with base, index, scale and displacement.",
    d: "Memory operands have addressing modes combining registers, constants and segment or mode-based adjustments. The decoder resolves these into a form the IR builder can turn into an address computation, including operand size, sign extension and the rule that writing a smaller register may or may not clear the upper bits. It is hard because the same encoding can mean different sizes depending on mode and prefixes, and because address computations must wrap at the guest's width, not the host's.",
    k: ["Resolve addressing modes at decode vs in the builder: at decode keeps the builder generic; in the builder keeps the decoder pure but spreads the quirks.", "Normalize registers to a canonical set early vs keep guest names: normalizing helps optimization; guest names ease debugging and mapping."],
    p: ["Address arithmetic done at host width fails to wrap at 32 bits and reaches memory the guest could never address.", "Partial register writes treated as full writes clobber unrelated parts of a register."],
    v: "Run every addressing mode with boundary values, including wraparound at the guest width, and confirm effective addresses match a reference computation.",
    dep: ["instruction-decoder","guest-context"]
  },
  "block-boundary-rules": {
    s: "The rules that decide an instruction must end a translation block: branches, system calls, state-changing instructions, page crossings and count limits.",
    d: "The decoder classifies each instruction as ordinary, branch, call, return, system call, trap or special. Branches end a block; instructions that change translation context, such as mode switches, do too, since later bytes are decoded differently. Page crossings end a block when the next page may have different permissions or may change. These rules fix the shape of every block. It is hard because a missed rule creates subtle bugs: a state change inside a block decodes later instructions under the wrong assumptions.",
    k: ["End blocks conservatively at any uncertain instruction vs continue and fix up: conservative is safe and creates more blocks; continuing is faster and risks wrong decode state.", "Limit by instruction count vs by bytes: count bounds IR size predictably; bytes bound memory traffic and map to pages."],
    p: ["A mode-changing instruction in the middle of a block makes following instructions decode as the old mode.", "No limit on straight-line code lets giant blocks exhaust memory during optimization."],
    v: "Translate code containing each boundary class and confirm every one ends its block at the expected instruction, and that mode changes lead to differently keyed blocks.",
    dep: ["instruction-decoder","block-formation"]
  },
  "unknown-instruction-policy": {
    s: "Defines what the translator does with an encoding it does not recognize or implement: raise the guest's illegal-instruction fault, emulate, or abort.",
    d: "Unrecognized encodings may be invalid, newer than the translator's model, or valid but unimplemented. Valid unimplemented ones may be interpreted by a slow helper. Truly invalid ones must produce the exact fault the real machine gives, since programs probe for instruction support by trying and catching the fault. The translator may also report support levels to the guest so it avoids newer instructions. It is hard because the line between invalid and merely unsupported is fine and because wrong choices cause silent misbehavior.",
    k: ["Raise an illegal-instruction fault vs stop with an error: the fault is faithful and lets feature probing work; stopping reveals coverage gaps but kills the program.", "Fallback helper for unimplemented instructions vs refusing them: helpers keep programs running at low speed; refusing keeps the translator small."],
    p: ["Treating a valid new instruction as illegal makes a program disable an optimization path or abort at startup.", "Claiming support for an instruction through capability bits and then faulting on it crashes programs that trusted the claim."],
    v: "Execute an invalid encoding and an unimplemented valid one and confirm the first raises the exact guest fault and the second runs through the helper with correct results.",
    dep: ["instruction-decoder","process-startup-state","interpreter-tier"]
  },
  "semantics-specification": {
    s: "A precise, ideally machine-readable description of what each guest instruction does, from which decoder, interpreter and translation rules derive.",
    d: "Some translators write rules by hand for each instruction; others keep a structured specification of operands, effects on registers, memory and flags, and conditions, then generate interpreter code, IR builders and test cases from it. The specification records details easy to forget: which flags are undefined, whether partial writes preserve bits, behavior on overflow. It is hard to produce because vendor documents are prose with errors, and real hardware has behaviors the documents omit.",
    k: ["Generate implementations from one specification vs hand-write each path: generating keeps tiers consistent and takes tooling effort; hand-writing is quick to start and diverges.", "Follow documentation vs follow measured hardware: documentation is stable; measured hardware matches what programs actually experienced, including undefined results."],
    p: ["A specification transcribed from prose carries the document's typos into every tier of the translator.", "Undefined flag results modeled as zero break programs that happened to depend on the real hardware's values."],
    v: "Generate test cases from the specification, run them on real source hardware and on the translator, and confirm identical defined outputs for every instruction and operand class.",
    dep: ["ir-definition"]
  },
  "ir-definition": {
    s: "The host-neutral set of operations, types and values that all guest instructions are converted into before optimization and code generation.",
    d: "The IR defines integer and vector types, arithmetic and logic operations, loads and stores with ordering attributes, control flow, calls to helpers, and explicit operations for guest flags and state. Each guest instruction becomes a short sequence. A good IR makes flag computation explicit so it can be removed, and carries memory ordering and exception points. It is hard because it must be low-level enough to emit efficient host code, high-level enough for analysis, and neutral enough to target several hosts without baking in the guest's quirks.",
    k: ["Expose flags as explicit values vs hidden side effects: explicit flags let liveness remove most of them; hidden effects keep the IR small and block that optimization.", "Single static assignment vs mutable variables: SSA simplifies analysis and costs conversion steps; mutable is simpler for short blocks."],
    p: ["An IR without an exception-point marker lets passes reorder a faulting load across a store the guest should have seen.", "Operations with undefined behavior in the IR silently produce different results on different hosts."],
    v: "Build IR for the whole instruction test corpus, run the verifier and an IR interpreter, and confirm the interpreter's results equal the guest reference for every case.",
    dep: ["semantics-specification"]
  },
  "ir-builder": {
    s: "Converts decoded guest instructions into IR sequences, including loads of guest state, operation, flag computation and writes back.",
    d: "For each instruction, the builder reads source operands from the guest context or immediates, emits the operation in the IR, computes whichever flags it defines, and writes results. It also marks where faults can occur and where state must be precise. Common sequences are shared through helper routines. At block end it emits the exit with its successor information. It is hard because accuracy lives in thousands of small cases, and because the builder is where the instruction set's idiosyncrasies leave their mark on everything downstream.",
    k: ["Generate flags eagerly and let analysis delete them vs compute only what is needed: eager is correct by construction and removal relies on analysis; on-demand needs lookahead into later instructions.", "Emit helper calls for complex instructions vs expand inline: helper calls shrink code and slow execution; inline expansion is fast and increases code size."],
    p: ["A builder path forgetting to set a flag the guest reads later is visible only in programs that test it.", "State written back before a faulting store makes the guest observe a partial instruction."],
    v: "For each instruction class, compare IR execution of the built sequence with the interpreter on random inputs, including operands that make flags and faults trigger.",
    dep: ["instruction-decoder","ir-definition","guest-context","flag-emulation"]
  },
  "flag-liveness-analysis": {
    s: "Determines which condition flags a later instruction or exit might read, so flag computations nobody reads can be deleted.",
    d: "Many guest instructions set several flags, but most are overwritten before being used. The analysis walks the block backward, tracking which flags are live, and marks computations whose results are overwritten. At block exits it must assume the successor may read flags unless it knows otherwise, often through a conservative summary of what following blocks consume. It is hard because flag use can be hidden: system calls, exceptions and signal frames expose flags, and a fault between a flag-setting instruction and its overwriter must see the correct value.",
    k: ["Assume all flags live at exits vs compute successor summaries: assuming is simple and keeps many computations; summaries delete more and must be revalidated when successors change.", "Delete dead flag code vs make it lazy: deletion is free at run time; lazy evaluation keeps correctness at faults and calls with extra bookkeeping."],
    p: ["Removing flags that a faulting instruction in between could expose makes the signal handler see stale values.", "Treating a partial flag update as full kills bits that remain live."],
    v: "Translate a sequence where only the last of five arithmetic instructions' flags is read and confirm just that computation remains, with flag values identical when a signal interrupts in the middle.",
    dep: ["ir-definition","flag-emulation","lazy-flag-evaluation"]
  },
  "constant-folding": {
    s: "Replaces operations on known constant values with their results and simplifies algebraic identities at translation time.",
    d: "Immediate operands, address computations from constants and repeated moves yield many values known at translation time. The pass evaluates them, simplifies expressions such as adding zero or masking twice, and propagates constants through the block, removing branches whose condition is known. It must evaluate exactly as the guest would, at the guest's width and with the guest's overflow and shift rules. It is hard because the host language of the translator has its own integer semantics, and getting shift counts or signed overflow wrong makes translated results differ.",
    k: ["Fold aggressively vs only trivial cases: aggressive shrinks code and risks semantic mistakes in rarely used operations; trivial cases are safe and leave work.", "Fold flags with the value vs separately: together reuses analysis; separately keeps each simple and avoids coupling bugs."],
    p: ["Shift by more than the operand width folded using the translator's own rules instead of the guest's.", "Folding a load from memory assumed constant when another thread can change it."],
    v: "Run a property test comparing the folded evaluation against the interpreter for random operands and every operation and width, including shifts by zero and by the width.",
    dep: ["ir-definition","ir-verifier"]
  },
  "dead-code-elimination": {
    s: "Removes IR operations whose results are never used and which have no side effects, shrinking the block before code generation.",
    d: "After flag liveness, folding and idiom recognition, many values are unused. The pass marks values reachable from side effects and block exits, and deletes the rest. Operations with effects such as stores, calls, system calls and possibly faulting loads stay. It is simple in outline. The difficulty is the definition of a side effect: a load can fault, a division can trap, and removing them changes behavior the guest could have observed through signals.",
    k: ["Remove possibly faulting loads vs keep them: removal is faster and is wrong if the guest relies on the fault; keeping preserves exact behavior at a small cost.", "Run once vs iterate to a fixed point: once is cheap; iterating finds chains of dead values at extra translation time."],
    p: ["A dead-looking load removed from a block was the guest's deliberate probe for an unmapped page.", "Dead guest register writes removed before an exit that exposes the register to a signal frame."],
    v: "Translate a block with deliberately dead computations and confirm they vanish from host code, and that an otherwise dead load from an unmapped address still faults in the correct place.",
    dep: ["ir-definition","flag-liveness-analysis"]
  },
  "load-store-optimization": {
    s: "Reduces memory traffic by keeping guest registers in host registers across a block and removing redundant loads and stores to guest state or guest memory.",
    d: "Guest state in the context is loaded once, kept in host registers, and written back only at exits or faultable points. Within a block, repeated loads from the same guest memory address can reuse a value when no store could alias. Stores that are overwritten before being observed can be dropped. The pass needs alias reasoning and awareness of ordering rules. It is hard because guest memory is shared with other threads and devices, so assumptions valid for private data break lock-free code.",
    k: ["Treat guest memory as potentially shared vs optimize as if private: shared treatment is correct for concurrent programs and forfeits most memory optimizations; private assumption is fast and breaks synchronization code.", "Write back at every faultable point vs rely on recovery maps: write back is simple and slow; maps keep values in registers and need exact reconstruction."],
    p: ["Caching a flag variable in a register across a loop makes a wait loop spin forever.", "A store removed as redundant happened to be the first of two stores a signal handler observes."],
    v: "Run a spin-wait on a flag set by another thread under translation and confirm it exits promptly, while a purely private computation shows fewer memory operations in the generated code.",
    dep: ["ir-definition","memory-ordering-bridge","register-mapping"]
  },
  "idiom-recognition": {
    s: "Detects well-known guest instruction sequences and replaces them with a better host equivalent.",
    d: "Compilers emit patterns that have a more direct form on the host: a compare followed by a conditional branch, a multiply by a constant as shifts and adds, a common zeroing sequence, a byte swap built from shifts, a string-copy loop, a memory barrier pair. The pass matches these patterns in IR or in decoded instructions and emits a single operation. The gain can be large for hot loops. It is hard because patterns must match exactly including their side effects on flags, and a near-miss match produces a subtly wrong result.",
    k: ["Match on decoded guest instructions vs on IR: guest-level matching sees idioms in their original form; IR matching generalizes across encodings but sees them after normalization.", "A small curated set vs a large table: curated is easy to verify; a large table finds more and needs generated tests."],
    p: ["A fused compare-and-branch skips setting the flags that the following block reads.", "A pattern matched across a point where a signal could arrive hides an intermediate state."],
    v: "Verify each idiom against its unfused expansion on exhaustive small inputs and random wide inputs, including its flags, and confirm hot-loop timing improves when the pattern is enabled.",
    dep: ["ir-definition","flag-liveness-analysis","constant-folding"]
  },
  "ir-verifier": {
    s: "Checks IR for structural and type correctness after every pass, in debug builds and tests, catching optimizer bugs at the pass that caused them.",
    d: "The verifier checks that every value is defined before use, types match operations, control flow is well formed, exception points and ordering attributes are present where required, and the block ends properly. It can also compare an interpreter run of the IR before and after each pass. It runs after each transformation in testing and on a sample in production. It is hard because it must be cheap enough to run often, strict enough to catch errors, and kept in sync with every change to the IR itself.",
    k: ["Run after every pass vs only at the end: after every pass names the guilty transformation; at the end is cheaper and leaves a harder search.", "Structural checks only vs semantic equivalence checks: structural is fast and misses wrong-but-valid IR; equivalence testing catches those and runs far longer."],
    p: ["A verifier that is disabled in release builds lets a rare malformed block reach the code generator in the field.", "Rules lagging behind a new IR feature either reject valid code or pass invalid code."],
    v: "Inject a pass that produces a use of an undefined value and confirm the verifier fails right after that pass, naming it, in a debug build.",
    dep: ["ir-definition"]
  },
  "instruction-selection": {
    s: "Chooses host instructions for each IR operation, matching patterns to the best available host instruction or short sequence.",
    d: "Selection walks IR operations and maps each to host instructions, using combined forms when the host has them: load with offset, shift and add, compare and conditional move, atomic read-modify-write, bit-field operations. It tailors to the host's feature set, so the same IR yields different code on different hosts. It is hard because the host's instruction set has its own limits: immediates of restricted ranges, fixed registers for some operations, and cases where no single instruction exists.",
    k: ["Table-driven rules vs hand-written per operation: tables are compact and uniform; hand-written code can exploit special cases and gets harder to maintain.", "Select per operation vs per tree of operations: per operation is simple; trees find fused forms with more complex matching."],
    p: ["An immediate that fits in the matching host instruction only for small values, with no check for larger ones, generates a wrong constant.", "Selecting an instruction that the host family lacks works on the developer's machine only."],
    v: "Run IR-level tests on each supported host and confirm results match the IR interpreter for all operations and edge-case operands, including immediates near range limits.",
    dep: ["ir-definition","host-feature-detection","host-encoder"]
  },
  "register-allocator": {
    s: "Assigns IR values and guest registers to host registers, spilling to memory when there are not enough.",
    d: "Within a block or region, the allocator tracks which values live where and when, uses linear scan or a graph method, honors fixed-register constraints from instructions and calling conventions, and spills cold values. Guest registers mapped to fixed host registers are reserved. At exits, state must be in its canonical location. It is hard because translation time matters as much as quality, and because a host with fewer registers than the guest forces spilling in code the guest keeps entirely in registers.",
    k: ["Linear scan vs graph coloring: linear scan is fast and adequate; graph coloring produces better code and costs more translation time, which hurts for short-lived blocks.", "Fixed guest-to-host mapping vs fully dynamic allocation: fixed is simple and cheap at exits; dynamic uses registers better in a block and needs fix-up at each exit."],
    p: ["A value live across a helper call is left in a register the callee overwrites.", "Spill slots reused without regard to live ranges corrupt a value in a long block."],
    v: "Translate blocks with more live values than host registers, run them, and compare results to the IR interpreter, with a stress mode that forces spills at random points.",
    dep: ["register-mapping","instruction-selection","helper-call-interface"]
  },
  "host-encoder": {
    s: "Turns chosen host instructions into the exact bytes the host processor executes, including registers, immediates and addressing fields.",
    d: "The encoder is a library of functions, one per instruction form, that write opcode bits, operand fields and immediates into the code buffer. It validates ranges, picks short forms when available, and records the position when a later fix-up is needed. Branch offsets are patched when the target is known. It is hard because host encodings have many restricted forms and alignment rules, and because mistakes produce valid-looking code that does the wrong thing, or an illegal instruction found only when that path executes.",
    k: ["Generated encoder from a machine-readable description vs hand-written: generated avoids bit-level slips; hand-written permits shortcuts and risks silent errors.", "Choose short encodings immediately vs relax later: immediate is single-pass and may miss shorter forms; relaxation yields smaller code with a second pass."],
    p: ["An immediate out of range is silently truncated and produces a wrong but running instruction.", "Misaligned branch targets that violate the host's rules fault only on some processors."],
    v: "Encode every instruction form with boundary operands and compare the bytes against a reference assembler, then execute them on the host and confirm expected effects.",
    dep: ["code-emitter","host-feature-detection"]
  },
  "code-emitter": {
    s: "Appends generated host code to the translation cache, tracking buffer space, alignment and the mapping from host offsets to guest instructions.",
    d: "The emitter owns the current write position in executable memory. It reserves space for each block, writes encoded instructions, aligns branch targets, and records metadata: guest-to-host maps, patch points and relocations. If the block does not fit, it rolls back and requests more space. On hosts that separate instruction and data caches, it ensures written code is made visible to instruction fetch before execution. It is hard because failure in the middle of a block must leave the buffer consistent, and because visibility rules differ between hosts.",
    k: ["Emit directly into the cache vs into a scratch buffer then copy: direct is fast and risks partially visible code; scratch costs a copy and allows validating before publishing.", "Reserve worst-case space up front vs grow on demand: worst-case is simple and wastes space; on demand is compact and needs rollback."],
    p: ["Code made visible before instruction caches are synchronized executes stale bytes on some hosts only.", "A block that overflows the buffer leaves a half-written entry reachable from the lookup table."],
    v: "Fill the cache to capacity during translation and confirm that failed emission leaves no entry published, and that code written then executed on a weakly coherent host runs correctly.",
    dep: ["executable-memory-manager","write-execute-transitions","host-encoder"]
  },
  "literal-pools": {
    s: "Holds constants that do not fit in instruction immediates, such as large values, addresses and floating point constants, near the code that uses them.",
    d: "Many host instruction sets cannot embed a full-width constant. The emitter places such values in a nearby pool and uses a position-relative load. Pools are placed at block ends, in a reserved region or in the cache, and are deduplicated. Relative load reach is limited, so a block longer than the reach needs intermediate pools. It is hard because pool placement interacts with code layout, with persistent caches that need relocations, and with invalidation, which must free pools along with code.",
    k: ["Pool per block vs shared pool per region: per block frees with the block and duplicates constants; shared saves space and complicates freeing.", "Load constants from a pool vs build with several immediate instructions: a pool is compact and takes a data access; building avoids memory and costs more instructions."],
    p: ["A pool placed beyond the reach of the load instruction fails to encode and aborts translation.", "Pool entries shared between blocks are freed with the first block that dies and corrupt the others."],
    v: "Translate a long block needing hundreds of distinct large constants and confirm correct values, correct pool placement within reach, and that eviction frees the pool.",
    dep: ["code-emitter","host-encoder","patch-points"]
  },
  "patch-points": {
    s: "Marks places in generated code that will be modified later, such as chain jumps, entry counters and relocations, and records how to modify them safely.",
    d: "Each patch point records its host address, its kind, the target it currently points to and the rewrite procedure. Chaining overwrites the exit stub with a direct jump; unlinking restores the stub. Counters are switched off after promotion. Relocations adjust absolute values when code moves or loads from a persistent cache. It is hard because rewriting must be atomic with respect to other threads fetching the instruction, so patch points are laid out so a single aligned write suffices, and the host's cache synchronization rules apply.",
    k: ["Single aligned write patching vs stop-the-world patching: a single write is cheap and constrains instruction layout; stopping threads allows any change at a high pause cost.", "Record patch points per block vs scan code later: recording is exact and costs memory; scanning saves memory and is unreliable."],
    p: ["A patch point straddling a cache line is torn when another thread fetches it halfway.", "A patch applied to code already evicted writes into reused memory."],
    v: "Patch a hot jump repeatedly while eight threads execute through it and confirm no crashes or lost executions, and that every patch site is accounted for in the metadata.",
    dep: ["code-emitter","write-execute-transitions"]
  },
  "entry-exit-stubs": {
    s: "Small fixed code sequences that enter translated code from the dispatcher and leave it, saving and restoring the host registers the translator needs.",
    d: "An entry stub loads the context pointer and cached guest registers into host registers and jumps to the block. Exit stubs, one per block exit, store the next guest address and state and return to the dispatcher or to a chained block. They define the contract between translator and generated code: which registers hold the context, which are scratch, which are preserved. It is hard because the contract must stay identical in all generated code and the helpers, and any mismatch corrupts state in a way that appears much later.",
    k: ["Keep guest registers in host registers across blocks vs reload at every entry: keeping is fastest and needs matching state at every chain link; reloading is robust and costs memory traffic.", "Shared exit stub vs one per exit: shared saves space and needs an extra jump; per-exit is patchable and larger."],
    p: ["A callee-saved host register used by generated code but not restored on exit corrupts the translator's own state.", "Differently ordered saves in two stubs make chained blocks interpret registers differently."],
    v: "Call a chain of blocks that touch every guest register and confirm all values on exit match the interpreter's, with host registers outside the contract unchanged.",
    dep: ["register-mapping","guest-context","code-emitter"]
  },
  "helper-call-interface": {
    s: "The convention by which translated code calls translator routines written in the translator's own language, for complex instructions, system calls and slow paths.",
    d: "Some operations are too complex or rare to emit inline: special instructions, floating point corner cases, system calls, memory-map changes. Generated code spills live registers, passes the context pointer and arguments in host calling-convention registers, calls the helper and reloads. The helper may raise guest exceptions or change guest state. It is hard because spill and reload around every call are costly, because helpers must tell the code generator what they clobber, and because a helper that faults needs state recovery from inside the call.",
    k: ["Call helpers with the host convention vs a custom light convention: host convention is simple and standard; custom saves spills and fits only helpers written for it.", "Mark helpers as pure or side-effecting: pure helpers allow optimization and caching; side-effecting stay in order and block it."],
    p: ["A helper that changes a guest register the code generator assumed unchanged leaves a stale host copy.", "A helper raising a guest exception unwinds through generated code without a recovery map and loses state."],
    v: "Call each helper from generated code with all registers loaded with distinct values and confirm every preserved value is intact afterward and every changed value is visible to following instructions.",
    dep: ["entry-exit-stubs","register-allocator","guest-context"]
  },
  "guest-context": {
    s: "The in-memory structure holding the guest's architectural state: general registers, flags, vector registers, instruction pointer and control registers.",
    d: "Each guest thread has one context in translator memory. Translated code accesses it through a dedicated host register, or caches parts in host registers between exits. Layout is chosen so common registers are close to the base and loads are short. It is also the source for signal frames, debuggers and crash reports. It is hard because it must be exactly the guest's visible state at every observation point, while the optimizer wants to defer writes, and because vector registers make it large enough that copying it is a measurable cost.",
    k: ["One flat context vs separate hot and cold parts: flat is simple; splitting keeps frequently used registers in few cache lines and complicates snapshots.", "Store flags in guest layout vs in a host-friendly form: guest layout is trivial to expose; a host form is faster to compute and needs conversion at observation points."],
    p: ["Reading the context from another thread without synchronization returns a half-updated state.", "A layout change not reflected in helper code and signal code corrupts only some registers."],
    v: "Run a program that sets every register to a unique value, takes a signal and reads the frame, and confirm the frame contains exactly those values and flags.",
    dep: ["thread-local-context"]
  },
  "register-mapping": {
    s: "The assignment of guest registers to host registers, either fixed for the whole run or chosen per block.",
    d: "A fixed mapping pins the most-used guest registers to specific host registers so blocks start and end in a known state, making chaining trivial. When the guest has more registers than the host, the rest live in the context. Dynamic mapping lets each region choose, improving use and requiring state fix-ups at transitions. The mapping also assigns a few host registers to the context pointer and scratch use. It is hard because the guest and host rarely have matching register counts and special registers, and the choice is global across the translator.",
    k: ["Fixed mapping vs per-region mapping: fixed is simple and chain-friendly and wastes registers; per-region fits each loop at the cost of reconciliation code at exits.", "Reserve scratch registers vs allocate all: reserved scratch simplifies code generation and loses capacity; allocating everything is tight and error-prone."],
    p: ["A host register reserved by the operating system's calling convention is also mapped to a guest register and clobbered by helpers.", "Different mappings at the two ends of a chain link silently swap two registers."],
    v: "Run chained blocks where each guest register carries a unique value and confirm all values survive, with the mapping table checked against every stub and helper at build time.",
    dep: ["guest-context","entry-exit-stubs"]
  },
  "flag-emulation": {
    s: "Reproduces the guest's condition flags: carry, zero, sign, overflow and others, as the guest instruction set defines them, on a host that computes them differently.",
    d: "Guest arithmetic sets flags in specific ways, including auxiliary or parity bits, and instructions such as add-with-carry read them. The host may have the same flags with different meanings, such as inverted carry on subtraction, or none at all. The translator computes them explicitly or maps them to host flags when semantics match. It is hard because the flag rules are detailed, some are undefined, and conditional branches and moves are consumers whose conditions must be derived exactly.",
    k: ["Use host flags directly where meanings match vs always compute explicitly: host flags are free when they match; explicit computation is correct everywhere and costs several instructions.", "Keep flags in one register vs separate registers per flag: one register is compact and slow to test; separate registers make testing cheap and writing costlier."],
    p: ["Carry inverted on subtraction relative to the guest turns every borrow check upside down.", "Rotates and shifts by zero must leave flags untouched, a rule often missed."],
    v: "Exhaustively test small-width arithmetic and random wide operands for every flag-setting instruction and every conditional consumer against the reference interpreter.",
    dep: ["guest-context","semantics-specification"]
  },
  "lazy-flag-evaluation": {
    s: "Stores the operands and kind of the last flag-setting operation instead of the flags, computing flag bits only when something reads them.",
    d: "After an arithmetic instruction, the translator stores the operation type and operands in the context. Only a later branch, move or exit that reads a flag computes its value from that record. Since most flags are never read, this removes most flag work. When flags are needed at an exit, the pending record is converted into real values or carried across. It is hard because the record must capture all inputs, because several instructions update different subsets of flags, and because merging records from two paths needs care.",
    k: ["Lazy evaluation vs eager computation with dead code elimination: lazy handles flags that cross blocks cheaply; eager analysis within a block is simpler and fails at block boundaries.", "Record result and operands vs result only: result and operands allow any flag to be derived; result alone is smaller and cannot give carry or overflow."],
    p: ["Two instructions updating different flag subsets leave a record that reconstructs the wrong flag for the earlier one.", "A record not materialized before a signal makes the handler see flags that do not exist."],
    v: "Run chains of mixed flag-setting instructions followed by a read of each flag, with a signal at every position, and confirm flag values equal the eager reference.",
    dep: ["flag-emulation","guest-context","flag-liveness-analysis"]
  },
  "special-registers": {
    s: "Emulates registers and instructions beyond the general set: instruction counters, segment and base registers, control and status registers, timestamp and processor identification.",
    d: "Programs read the timestamp, processor features, thread-pointer bases and status registers. User-mode translators support a small set; whole-system translators emulate the rest. Thread-local storage is addressed through a base register the guest sets, so the translator maps it to guest memory. Time-reading instructions return values from a host clock scaled to the guest's frequency. It is hard because some of these must return plausible but not host-revealing values, and because a missing one is an illegal instruction in the guest.",
    k: ["Emulate every readable register faithfully vs return fixed plausible values: faithful is correct for diagnostics; fixed is simple and breaks programs using them for timing or identification.", "Handle thread base inline vs via helper: inline makes thread-local access fast; helper is simple and slows every thread-local variable access."],
    p: ["Timestamp values scaled from the host clock with a wrong frequency make timeouts fire early or never.", "Reading processor identification instructions returns host features the translator does not implement."],
    v: "Read each supported special register from the guest and confirm the values are in valid ranges and monotonic where required, and that thread-local variables are distinct per thread.",
    dep: ["guest-context","host-feature-detection","thread-local-context"]
  },
  "thread-local-context": {
    s: "Per-thread translator state: the guest context, the guest's thread base, return stack, signal state and scratch space, found quickly by generated code.",
    d: "Each guest thread gets its own host thread and a bundle of state that generated code reaches through a reserved register or thread-local lookup. The bundle holds the guest context, side stacks, pending signals, alternate stack information and per-thread counters. At thread creation it is allocated and at exit freed. It is hard because signal handlers may run on any thread at any time and must find this state, and because threads that cross into host libraries lose the reserved register.",
    k: ["Reserved host register for the context pointer vs lookup through thread-local storage: a register is instant and removes one from allocation; lookup frees the register and costs loads on every access.", "Allocate with the thread stack vs separately: with the stack frees automatically and is limited in size; separate allocation is flexible and must be freed explicitly."],
    p: ["A signal arriving on a thread while the reserved register holds a host value reads garbage as the context.", "State freed at thread exit while a late signal is still being delivered."],
    v: "Create and destroy ten thousand threads while sending signals at random and confirm no leaks, no crashes, and each thread reads only its own context.",
    dep: ["host-thread-mapping","translator-allocator"]
  }
});
