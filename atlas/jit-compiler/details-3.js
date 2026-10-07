// Details for the JIT compiler plate, part 3: optimizations and backend.
ATLAS.details("jit-compiler", {
  "inlining": {
    s: "Replacing a call with the body of the callee inside the caller's graph, which removes call overhead and, more importantly, lets the optimizer see across the former boundary.",
    d: "At a call site with a known target, the compiler builds the callee's graph, connects arguments to parameters and the return value to the call's users, and records frame states for each level so a deoptimization can rebuild both frames. After inlining, type information flows in from the caller, so checks in the callee often vanish, and allocations that did not escape become removable. The difficulty is growth: inlining compounds, code size and compile time explode, and the target must be guarded or depended on, since the call may later point elsewhere.",
    k: ["Inlining aggressively versus conservatively: more cross-function optimization, but larger code, more compile time and more frame states.", "Inlining at graph-building time versus as a separate later pass: sees feedback directly and avoids rework, but the builder becomes the place where size budgets are enforced."],
    p: ["Inlining a callee whose identity is not guarded runs the old body after the function is redefined.", "Deep inlining of a recursive function without a depth limit grows the graph until compilation is abandoned."],
    v: "Compile a hot function that calls a small helper and confirm the graph contains the helper's operations with no call node, a guard on the callee's identity, and a measured speedup.",
    dep: ["graph-ir","call-target-profiles","frame-states","guards"]
  },
  "inlining-heuristics": {
    s: "The cost model that chooses which call sites to inline and how deeply, weighing callee size, call frequency, expected savings and the remaining compilation budget.",
    d: "Typical inputs are the callee's bytecode size, the site's call count relative to the caller's, whether arguments are constants or known shapes, and a cumulative budget on total inlined size. Small callees are always inlined, large ones never, and middle ones by score. Hot sites are processed first so the budget goes where it pays. Some heuristics look one level deeper to see if inlining would unlock further inlining. The difficulty is that benefit is hard to predict before optimization runs, and a wrong choice is only visible as slower code later.",
    k: ["Static size thresholds versus benefit estimation from arguments and profile: simple and predictable, but they misjudge small hot functions that optimize away entirely.", "A global budget versus per-site limits: bounds compile time and size, but an early large inlining can starve later hotter sites."],
    p: ["Greedy early inlining spends the entire budget on a cold site discovered first.", "Counting callee size before its own inlining over-estimates cost and refuses a worthwhile wrapper."],
    v: "Compile a function with three call sites of different frequency under a tight budget and confirm from the log that the hottest are inlined first and the budget is reported as exhausted.",
    dep: ["inlining","call-target-profiles","branch-profiles"]
  },
  "polymorphic-inlining": {
    s: "Inlining several recorded callees at one call site, behind a chain of identity checks, with a deoptimization or a generic call as the fallthrough.",
    d: "If the call profile shows two or three targets, the compiler emits a switch on the callee, with each arm containing the inlined body and a final arm that exits to a lower tier or makes an ordinary call. The same applies to a polymorphic property access followed by a method call, where the receiver's shape determines the target. It is most valuable in object-oriented code with a few implementations behind an interface. The difficulty is code size, since bodies multiply, and ordering, since the most frequent target should be tested first.",
    k: ["Falling through to a generic call versus deoptimizing: handles unexpected targets safely without losing the compiled code, but the generic call may be slow and blocks later optimization.", "Capping at a small number of targets versus unlimited: bounded size, but a site with five common targets falls off to a generic call."],
    p: ["A site profiled with the arms in the wrong order tests the rare target first on every call.", "Inlining all arms of a cold site bloats code for no benefit."],
    v: "Call a site with two targets in a 90 to 10 ratio and confirm the graph tests the common one first, both bodies are inlined, and a third target takes the fallback path correctly.",
    dep: ["inlining","polymorphic-caches","call-target-profiles"]
  },
  "escape-analysis": {
    s: "Determines which allocated objects never become visible outside the compiled function, so they can be treated as local values and often never allocated at all.",
    d: "The analysis tracks each allocation through the graph and checks whether the reference is stored to the heap, passed to an unknown call, returned, or compared by identity in a way that matters. Objects that stay local are marked virtual: their fields become separate values tracked through stores and loads. It works across inlined boundaries, which is why inlining and escape analysis combine so well. The difficulty is control flow: an object that escapes on only one branch must be materialized there, and at merges, virtual states from different paths must be reconciled.",
    k: ["Flow-sensitive analysis versus a simple whole-function escape flag: removes allocations that escape only on cold paths, but is much more complex and costly.", "Treating deoptimization exits as non-escaping with rematerialization versus as escaping: removes allocation even when an exit exists, but the exit metadata grows."],
    p: ["Missing a store that leaks the reference leaves the program reading an object that was never allocated.", "An object stored in another virtual object that escapes is wrongly assumed to be local."],
    v: "Compile a loop that allocates a small vector per iteration and confirm the optimized code makes no allocation calls and the allocation counter in the runtime stays flat.",
    dep: ["graph-ir","inlining","effect-control-edges","object-rematerialization"]
  },
  "scalar-replacement": {
    s: "Splitting a non-escaping object into one value per field, kept in registers or stack slots, so its loads and stores become ordinary data flow.",
    d: "Once escape analysis proves an object is virtual, scalar replacement rewrites field stores as new definitions and field loads as uses of the latest definition, adding phi nodes at merges. The allocation node disappears. Arrays of known small length can be treated the same way. Nodes that observe the object, such as a type check, fold to constants because the shape is known. The difficulty is handling the cases where the object must come back: at a deoptimization exit, or on a branch where it escapes, so each virtual object needs a materialization recipe.",
    k: ["Replacing arrays with constant indices versus only plain objects: wins on common tuple-like code, but needs index analysis and adds nodes.", "Eager materialization at the first escape versus delayed to the last possible point: less work on non-escaping paths, but tracking state is harder."],
    p: ["Treating a field store inside a loop as a single definition ignores that it differs each iteration, and misses the phi.", "Loads from a virtual object with an unset field must produce the language's default, not garbage."],
    v: "Inspect the register-allocated output for a function using a short-lived pair of numbers and confirm the fields live in registers and no memory access to an object is present.",
    dep: ["escape-analysis","ssa-form","object-rematerialization"]
  },
  "type-check-elimination": {
    s: "Removing shape, kind and null checks that a dominating guard, a known allocation or a prior check has already established on the same value.",
    d: "After a guard on an object's shape, every later check of the same object against that shape on the same path is redundant, provided nothing in between could change the shape. The pass walks dominators, keeps a table of known facts for each value, invalidates facts at operations that may change them, and replaces redundant checks with the value itself. Allocation sites give shapes for free. Combined with inlining, it removes most of the checks that a monomorphic dispatcher would repeat. The difficulty is invalidation: any call or store that might transition the shape must clear the facts.",
    k: ["Eliminating redundant checks only versus hoisting checks out of loops: safe and simple, but misses repeated checks across iterations where the first one is loop-invariant.", "Tracking facts per value versus per abstract memory location: cheaper, but loses facts when the same object is reloaded from a field."],
    p: ["Not clearing a shape fact across a call that adds a property keeps a check removed that is now required.", "Using facts from one branch of a diamond after the merge assumes both established it."],
    v: "Compile code that reads three properties of one object and confirm only one shape check remains, then insert a call between reads and confirm the second check reappears.",
    dep: ["guards","type-lattice","effect-control-edges","graph-ir"]
  },
  "bounds-check-elimination": {
    s: "Proving an array index is within bounds from loop structure or earlier checks, so the compare and branch for each access can be removed.",
    d: "For a loop that runs an index from zero up to the array's length, every access of that index is in range and the check goes away. More generally, range analysis gives each index an interval, and any access with an interval inside zero and the known length is safe. Where a proof is only possible per loop, the compiler hoists a single check before the loop covering the whole range, with an exit if it fails. The difficulty is that the array's length must not change in the loop, and that index arithmetic must be proven not to wrap.",
    k: ["Hoisting one check before the loop versus checking each access: large savings in tight loops, but a failing check exits before any iteration runs, so state must be recoverable.", "Relying on range proofs versus on a guard that the array is of fixed length: sound and general, but the proof fails on unusual loop shapes."],
    p: ["An index offset by a constant can overflow past the end if the analysis ignores integer wrap.", "Assuming array length is constant when a call in the loop can resize it reads out of bounds."],
    v: "Compile a loop summing an array with a standard index pattern and confirm no bounds compare remains in the loop body, then run it over an index range that should fail and confirm a correct exception.",
    dep: ["range-analysis","loop-invariant-motion","guards","type-lattice"]
  },
  "range-analysis": {
    s: "Computes the possible numeric interval of each integer value, used to eliminate overflow checks, bounds checks and unnecessary conversions.",
    d: "The analysis starts from constants, array lengths and guards, and propagates intervals through arithmetic. At loop heads it must handle values that change each iteration, using widening to reach a fixpoint quickly and narrowing against loop conditions to recover precision. Results enable several others: an addition whose inputs are small cannot overflow, an index inside the array is safe, an integer that fits can skip the double conversion. The difficulty is wraparound semantics and the termination of the fixpoint over loops, which trades precision for compile time.",
    k: ["Widening aggressively versus iterating to a precise fixpoint: fast and always terminates, but loses useful bounds on counted loops.", "Per-value intervals versus relational facts between values: cheap, but cannot prove an index is below a length held in another variable."],
    p: ["Treating 32-bit integer overflow as impossible when the language wraps changes program results.", "Not narrowing at loop conditions leaves an induction variable unbounded and defeats bounds-check removal."],
    v: "Dump inferred ranges for a loop over a bounded counter and confirm the index range matches the loop bounds, and that a deliberately overflowing variant is not given a bounded range.",
    dep: ["type-lattice","graph-ir"]
  },
  "value-numbering": {
    s: "Finds pure computations that produce the same result from the same inputs and replaces duplicates with the first one.",
    d: "Each pure node is hashed by its operation and the identity of its inputs. If a node with the same hash and structure already exists in a dominating position, uses of the duplicate are redirected to it. In a floating-node graph this happens globally and incrementally as reducers create nodes. Constants, repeated address computations and repeated checks collapse. Because only pure nodes qualify, effect handling is left to load-store elimination. The difficulty is hash cost on huge graphs and avoiding merging nodes that look equal but differ by an attached frame state or type.",
    k: ["Global numbering across the whole graph versus per-block: removes more redundancy, but the later scheduling pass must rediscover the best placement.", "Numbering on structure only versus including type annotations: finds more matches, but a merged node may carry a weaker type than a user expected."],
    p: ["Merging two nodes that look identical but have different overflow behavior changes results.", "A table not updated after a reducer changes a node's inputs produces false matches."],
    v: "Compile a function repeating the same arithmetic expression three times and confirm the graph and the emitted code compute it once.",
    dep: ["graph-ir","graph-scheduler"]
  },
  "load-store-elimination": {
    s: "Removes loads that read a value already known from a prior store or load, and stores that are overwritten before anything can read them.",
    d: "The pass walks the effect chain, tracking for each object and field the last value written or read. A later load of the same field becomes that value; a store whose value is overwritten without an intervening read, call or exit becomes dead. Calls and unknown stores clear what they might alias. With shapes, a field at a fixed offset of a known-shape object can be tracked exactly. The difficulty is aliasing: two references may name the same object, and a wrong no-alias guess removes a needed read.",
    k: ["Precise per-field tracking versus clearing all knowledge at any possible alias: removes more memory traffic, but depends on accurate shape and escape information.", "Eliminating stores that deoptimization may need versus keeping them: faster, but the frame state must capture the value elsewhere."],
    p: ["Assuming two object references never alias removes a load that reads a value written through the other.", "Removing a store that an exit's rebuilt frame needed leaves the interpreter reading the old field."],
    v: "Compile code that stores to a field and reads it back in a loop and confirm there is no memory load of that field, then add an aliasing store and confirm the load returns.",
    dep: ["effect-control-edges","escape-analysis","shape-system","graph-ir"]
  },
  "loop-invariant-motion": {
    s: "Moves computations whose result does not change across iterations out of the loop, so they execute once before it.",
    d: "A pure node whose inputs are all defined outside the loop is scheduled in the loop's pre-header. Loads can move only if no store, call or exit inside the loop could change the value, which needs alias information from the effect chain. Guards are the most valuable to hoist, as a repeated shape check becomes a single check before the loop. A hoisted guard that fails must exit with a state representing the loop's entry. The difficulty is safety on possibly-zero-trip loops: hoisting something that may fault or deoptimize changes behavior if the loop would not have run.",
    k: ["Hoisting guards out of the loop versus leaving them in: removes repeated work, but the exit now happens at loop entry with a coarser state.", "Peeling the first iteration versus hoisting directly: safe for conditional code and may expose more invariants, but duplicates the loop body."],
    p: ["Hoisting a load above a store inside the loop that changes it gives stale values after the first iteration.", "Hoisting a division out of a loop that might run zero times introduces a fault that did not exist."],
    v: "Compile a loop calling a pure function on loop-invariant arguments and confirm from the scheduled blocks that the call runs once in the pre-header and only the varying work remains inside.",
    dep: ["graph-scheduler","effect-control-edges","guards"]
  },
  "loop-unrolling": {
    s: "Duplicating a loop body to cut per-iteration overhead, and peeling the first iteration so checks and setup are specialized outside the loop.",
    d: "Unrolling replicates the body several times and reduces the number of branches and induction updates, and it gives the scheduler and allocator more independent work. Peeling copies the first iteration before the loop, where checks that depend only on entry state can be resolved, leaving a leaner loop. Trip count knowledge from range analysis decides factors and handles remainder iterations. Vectorization, when present, builds on the same structure. The difficulty is code size and a cost model: unrolling a loop with calls or large bodies hurts, and mixing factors with remainder handling is error-prone.",
    k: ["Unrolling by a fixed factor versus based on estimated trip count: simple and predictable, but wastes size on short loops.", "Peeling plus unrolling versus unrolling alone: specialized first iteration and tight steady state, but the code size multiplies."],
    p: ["A remainder loop mishandling a trip count that is not a multiple of the factor skips or repeats iterations.", "Unrolling a loop with an internal exit multiplies exit metadata and frame states."],
    v: "Compile a counted loop with a trip count not divisible by the unroll factor and confirm its results are identical to the non-unrolled run for every length from zero to twice the factor.",
    dep: ["range-analysis","graph-ir","branch-profiles"]
  },
  "representation-selection": {
    s: "Chooses how each value is stored in machine code, such as raw integer, raw double, tagged pointer or boolean flag, inserting conversions only where representations meet.",
    d: "Using types and feedback, a number that is always a small integer is kept as a raw integer and never boxed. A double stays in a floating-point register. A value used both ways is converted at the boundary. Boxing happens only when a value crosses into the heap, a call or a deoptimization state. The pass propagates demands backward and availability forward, then inserts the minimum conversions. The difficulty is that a poor choice at a loop phi can introduce a conversion on every iteration.",
    k: ["Unboxed representations versus uniform tagged values: much faster arithmetic and no allocation, but conversions at every boundary and a more complex pass.", "Choosing representation by use demand versus by definition: fewer conversions overall, but needs a backward propagation and may change precision."],
    p: ["A number kept as a double where the language requires an exact integer result changes behavior at large values.", "A phi mixing integer and double inputs forces conversions inside a hot loop."],
    v: "Compile an arithmetic loop and confirm no allocation or tag operation appears in the loop body, with integer or floating-point registers carrying the values.",
    dep: ["type-lattice","arithmetic-feedback","frame-states","graph-ir"]
  },
  "dead-code-elimination": {
    s: "Deletes nodes whose results are never used and which have no side effects, and branches whose conditions are proven constant.",
    d: "A node with no users and no effect is removed, which can make its inputs unused in turn. Constant folding turns branch conditions into constants, so the not-taken side becomes unreachable and is removed, along with phi inputs from it. Speculation makes much code dead: a guard that always passes in feedback lets the generic fallback be dropped. It runs inside the reducer loop and at the end of passes that leave leftovers. The difficulty is knowing what has no side effect, since an operation that may throw or deoptimize must stay unless proven safe.",
    k: ["Removing unreachable code eagerly versus at pass boundaries: smaller graphs for later passes, but needs careful user-list and phi updates each time.", "Treating guards as removable when their result is unused versus pinning them: smaller code, but dropping a guard drops the assumption it enforced."],
    p: ["Removing a node that can throw changes which exception, if any, the program sees.", "Leaving a phi with an input from a deleted predecessor corrupts later passes."],
    v: "Compile a function with a branch that feedback shows is never taken and confirm the emitted code contains no instructions for that arm, only an exit.",
    dep: ["graph-ir","ssa-form","effect-control-edges"]
  },
  "instruction-selection": {
    s: "Matches groups of graph nodes to machine instructions, choosing addressing modes, fusing operations and deciding which values must be in registers.",
    d: "After scheduling, each block's nodes are covered by instruction patterns: an add of a shifted index plus a base becomes one address computation, a compare and branch fuse, a load with an extension becomes one instruction. The output is a low-level, near-machine form with virtual registers. Each target has its own pattern set, sharing the matcher. The difficulty is that good fusion depends on knowing a value has only one use and on the target's exact rules, and a missed pattern costs only speed, while a wrong one costs correctness.",
    k: ["Tree-pattern matching versus a hand-written case per node: systematic and extensible, but a pattern table is harder to tune than direct code.", "Fusing whenever possible versus only when the value is single-use: fewer instructions, but multi-use fusion may duplicate work."],
    p: ["Fusing a load into an instruction past a store that aliases it reorders memory operations.", "Missing a flag-setting pattern generates a separate compare for every branch."],
    v: "Compile known expression shapes, such as indexed loads and compare-and-branch, and confirm the disassembly uses the single fused instruction for each rather than separate steps.",
    dep: ["graph-scheduler","lowering-phases","register-allocator"]
  },
  "register-allocator": {
    s: "Assigns each virtual register to a machine register or a stack slot so that values live at the same time never share a location, minimizing memory traffic.",
    d: "It computes live ranges from the scheduled code, then walks them in order, giving each a physical register that is free over its whole range, or splitting and spilling when none is. Linear scan is fast; graph coloring or more advanced linear scan variants give better code at higher compile cost. Constraints include fixed registers for calls and certain instructions, and registers that frame states must be able to describe. The difficulty is the compile-time versus code-quality balance, since allocation is often the slowest backend phase.",
    k: ["Linear scan versus graph coloring: much faster compile and good-enough code, but more spills in high-pressure regions.", "Allocating the frame-state values in registers versus forcing them to the stack: faster code, but more complex deoptimization metadata."],
    p: ["Allocating a register across a call that clobbers it, because the call's clobber set was incomplete, corrupts a value.", "Heavy spilling inside an inner loop erases the benefit of every earlier optimization."],
    v: "Compile a high-pressure kernel and confirm from the disassembly that spills fall outside the inner loop, and that the allocator's verifier finds no overlapping live ranges.",
    dep: ["live-range-splitting","parallel-move-resolver","calling-convention","instruction-selection"]
  },
  "live-range-splitting": {
    s: "Breaking one value's lifetime into pieces that can live in different places, so a value is in a register where it is used and spilled where it is merely held.",
    d: "A value used heavily in a loop but also live across a long cold region can have its range split at the boundary: a register inside the loop, a stack slot elsewhere, with moves at the split points. Splits are also forced at calls, at fixed-register constraints and at block boundaries where predecessors disagree. Heuristics choose split points at the least frequent edge, using branch frequencies. The difficulty is that every split adds moves, and too many give back what splitting saved.",
    k: ["Splitting at loop boundaries versus at the point of pressure: puts moves in cold code, but needs loop and frequency information.", "Spilling the whole range versus splitting around uses: simple and compact, but memory access at every use."],
    p: ["Splitting inside a loop leaves a move on every iteration that costs more than the spill avoided.", "Mismatched locations across a block edge after splitting yield a wrong value on one path."],
    v: "Compile a loop with a value used rarely outside it and confirm from the disassembly that the value stays in a register inside the loop and the spill and reload sit outside.",
    dep: ["register-allocator","branch-profiles"]
  },
  "parallel-move-resolver": {
    s: "Turns a set of register and stack moves that must all happen at once into a safe sequence, breaking cycles with a temporary or a swap.",
    d: "At block edges, calls and phi resolution, many values must move to new locations simultaneously: A to B, B to A, C to D. Emitting them in a naive order overwrites a source before it is read. The resolver builds a dependency graph, emits moves whose destinations are not needed as sources first, and handles each cycle with a scratch register or an exchange. Memory-to-memory moves need a scratch too. The difficulty is correctness in rare cycles and the need for a free scratch location at every move site.",
    k: ["Using a reserved scratch register versus finding a free one per site: simple and always possible, but it costs one register everywhere.", "Swap instructions versus three-move rotation: fewer instructions where supported, but not available for all register classes or memory."],
    p: ["A cycle of three moves resolved as sequential assignments loses the first value.", "A memory-to-memory move without a scratch register is emitted as an invalid instruction."],
    v: "Generate random permutations of register assignments as a move set and confirm, by executing the resolved sequence, that each destination ends up with its intended source value.",
    dep: ["register-allocator","ssa-form"]
  },
  "calling-convention": {
    s: "The rules for how arguments, return values and saved registers pass between compiled code, builtins and runtime functions, shared by all tiers.",
    d: "It fixes which arguments travel in registers, which on the stack, where the callee and receiver go, which registers survive a call, and who cleans the stack. Compiled code, generated builtins and runtime functions in the host language each use the convention that suits them, with adapter stubs between. Argument count mismatches, common in dynamic languages, are handled by an adaptor frame or by the callee. The difficulty is that every tier, stub and the stack walker depend on it, and dynamic arity makes the common case and the mismatch case differ.",
    k: ["Register-based argument passing versus all on stack: faster calls, but the deoptimizer and walker must find registers saved in frames.", "Callee adapting arguments versus an adaptor frame inserted by the caller: no extra frame in the common case, but every callee has the adaptation code."],
    p: ["A callee that assumes more arguments than passed reads stack garbage if arity adaptation is skipped.", "A callee-saved register clobbered by a stub corrupts the caller's value after return."],
    v: "Call functions with fewer, equal and more arguments than parameters from every tier, and confirm the same results and a clean walkable stack at each call.",
    dep: ["shared-frame-layout","runtime-call-stubs"]
  },
  "block-layout": {
    s: "Orders the basic blocks in memory so the likely path falls through and rarely run code, such as deoptimization exits and slow paths, sits out of line.",
    d: "Using branch profiles and structure, the pass chains blocks along the most likely successor, so most branches are not taken and the instruction fetch stream is straight. Cold blocks move to the end of the function, keeping hot code compact and the instruction cache effective. Loop headers are aligned and exit stubs are pushed away. The difficulty is that profile data from lower tiers may be wrong after inlining, and that moving code changes branch distances, which can exceed a short branch's reach.",
    k: ["Profile-driven layout versus layout by structure only: better fall-through on hot paths, but depends on accurate and well-propagated counts.", "Moving cold blocks to a separate region versus the function's end: better cache behavior, but needs long branches or trampolines to reach them."],
    p: ["A profile that was gathered before inlining misorders blocks in the inlined copy.", "A cold exit placed too far away overflows a short conditional branch's range."],
    v: "Compile a function with a hot loop and a never-taken error path and confirm from the disassembly that the loop is contiguous and the error path sits after the function's last hot instruction.",
    dep: ["branch-profiles","branch-trampolines","graph-scheduler"]
  },
  "peephole-optimizer": {
    s: "A final cleanup over emitted instruction sequences that replaces small patterns with shorter or faster ones and removes redundant moves.",
    d: "After allocation, redundant moves, jumps to the next instruction, compare-with-zero sequences and extension of already-extended values appear. A pass over short windows removes them and picks encodings that are smaller, such as short immediates and compact branches. It also runs after branch relaxation, once exact distances are known. The pass is cheap and is mainly a way to recover quality lost in earlier simplifications. The difficulty is that every rewrite must be semantic-preserving including for flags, which later instructions may read.",
    k: ["Window-based peephole versus doing it during emission: separates cleanup from instruction production, but is another pass over the code.", "Many small rules versus a few high-value ones: gains accumulate, but each rule is another place a flag or alignment bug can hide."],
    p: ["Removing a compare because a previous instruction seemed to set the flags breaks a path where it did not.", "A rewrite that changes instruction length invalidates already-computed branch offsets."],
    v: "Disassemble compiled output for a large corpus and confirm no jump to the next instruction, no move of a register to itself, and identical results on the test suite with the pass on and off.",
    dep: ["register-allocator","assembler"]
  },
  "assembler": {
    s: "The component that encodes machine instructions into bytes, resolves labels and branch distances, and records the offsets the runtime needs for safepoints and patching.",
    d: "It offers one method per instruction form on each target, appends encoded bytes to a growing buffer, and maintains labels that can be bound later, with forward references patched at bind time. Short and long branch forms are chosen when distances are known, with a relaxation step. It records positions for relocation, safepoint, exception and source mapping tables. The difficulty is encoding correctness, since a wrong bit is an invisible miscompile, and generation speed, since the assembler is on the path of every compile and baseline code is almost entirely assembler time.",
    k: ["Direct emission during codegen versus building a list of instructions first: faster and lower memory, but late optimizations such as relaxation and peepholes are harder.", "Hand-written encoders versus tables generated from a specification: much less error-prone and portable across revisions, but harder to make fast."],
    p: ["A single wrong bit in a rarely used encoding produces a miscompile that appears only for particular registers.", "A label bound twice or never leaves a branch pointing at garbage."],
    v: "Assemble every instruction form with every register and compare the bytes against a reference disassembler or reference encoder, and confirm all round-trip identically.",
    dep: ["relocation-info","constant-pools"]
  },
  "relocation-info": {
    s: "Records of the positions in generated code that hold addresses or references which may need rewriting when the code moves, the target moves or the heap object it names moves.",
    d: "Each entry has an offset, a kind, such as an embedded heap pointer, a runtime function address, a code target or an absolute constant, and sometimes a mode. When the code object is copied to its final place, when a collector moves a referenced object, or when a target is patched, the table says exactly which bytes to rewrite. It is stored compactly with deltas. The difficulty is completeness: any address in the code that is missing from the table is silently left stale after a move.",
    k: ["Explicit tables versus scanning the code for address-like bytes: exact and fast, but the assembler must record every site.", "Position-independent references versus absolute addresses with relocation: no rewriting after movement, but slower instructions or an indirection."],
    p: ["An embedded object pointer missing from the table points to freed memory after a compacting collection.", "A relocation kind applied to the wrong width overwrites neighboring instruction bytes."],
    v: "Move a code object to a new address, then run it, and confirm every call, jump and constant resolves correctly, with a scan showing no address-like bytes outside the table.",
    dep: ["assembler","embedded-heap-references"]
  },
  "constant-pools": {
    s: "Areas near generated code that hold large constants, double values, addresses and jump tables, which instructions load through short pc-relative reads.",
    d: "Many targets cannot embed a full-width constant in an instruction, so the code loads it from a nearby table at a small displacement. The pool is emitted after the code or at intervals, with entries shared where equal. Branch ranges limit how far the pool can sit, so long functions place several. Entries that are heap pointers appear in the relocation table. The difficulty is range: if a pool is out of reach of a load, the assembler must insert an intermediate pool and a jump over it.",
    k: ["A single pool at the end versus multiple interleaved pools: simple and compact, but loads out of range on large functions.", "Sharing duplicate entries versus separate ones: smaller, but a patch to one site's constant must not change another's."],
    p: ["A pool placed after the last instruction but more than the displacement limit away makes the load fail to encode.", "Pool entries not scanned by the collector hold stale heap pointers."],
    v: "Compile a function large enough to exceed the pc-relative range and confirm the disassembly shows additional pools, all loads in range, and correct constants at run time.",
    dep: ["assembler","relocation-info"]
  }
});
