// Details for the JIT compiler plate, part 1: execution tiers, hotness and tier-up, profiling and feedback.
ATLAS.details("jit-compiler", {
  "interpreter-tier": {
    s: "The first engine every function runs in: it executes bytecode directly, starts instantly, uses little memory, and collects the counters and type feedback later tiers depend on.",
    d: "A dispatch loop, often itself generated as machine code from per-opcode templates, reads one bytecode at a time and operates on a register file or operand stack in the frame. Every operation that can be specialized updates a feedback slot, and calls and loops bump hotness counters. It is also the destination of every deoptimization, so it must accept a frame built by any higher tier. The difficulty is keeping it fast enough that most cold code never needs compiling while staying simple enough to be the correctness reference.",
    k: ["Register-based versus stack-based bytecode: fewer dispatches and easier graph building, but wider instructions and a more complex frame.", "Handwritten generated dispatch versus a portable loop: much faster and tuned to the target, but each new target needs its own generator."],
    p: ["Slow feedback updates in the interpreter make every later tier start with thin or stale profiles.", "A bytecode handler that forgets to update a counter silently starves tier-up for that operation."],
    v: "Run a script with all compilation disabled and confirm it gives correct results, and that feedback vectors and hotness counters still change as the script loops.",
    dep: ["shared-frame-layout","type-feedback-vectors","hotness-counters"]
  },
  "baseline-compiler": {
    s: "A fast, single-pass compiler that turns bytecode into machine code without an intermediate graph, removing dispatch cost while keeping the interpreter's frame and feedback behavior.",
    d: "It walks the bytecode once and emits a fixed code sequence per opcode, usually calling shared stubs for complex operations and embedding inline caches directly in the code. It does no inlining or register allocation beyond a few pinned registers, so compile time is close to linear in bytecode size. Because its frames match the interpreter's, it can be entered and left at almost any bytecode. The difficulty is deciding how much to specialize: more speed means more compile time and more code memory for functions that may never get hot.",
    k: ["Baseline tier versus interpreting longer: removes dispatch overhead and can host inline caches, but spends memory and compile time on mid-warm code.", "Per-opcode templates versus light analysis: very fast compilation, but redundant loads and stores remain in the output."],
    p: ["Compiling too eagerly fills the code cache with code that runs a few times and never again.", "A baseline-only mis-sync of frame layout with the interpreter breaks deoptimization targets that assume both match."],
    v: "Force baseline-only mode on a benchmark and confirm it runs measurably faster than the interpreter while the disassembly shows one fixed sequence per bytecode and inline cache sites.",
    dep: ["interpreter-tier","shared-frame-layout","inline-caches","assembler"]
  },
  "mid-tier-compiler": {
    s: "An optional compiler between baseline and fully optimizing: it uses the graph pipeline with a short pass list and little speculation, trading peak speed for fast compilation and safe warmup.",
    d: "It reuses the graph builder and backend but runs only cheap passes, such as simple inlining and check removal, and avoids speculation that could cause expensive deoptimization. It may also gather richer profile data, like precise call counts, for the top tier. It exists because the gap between baseline and optimizing is large: waiting for the top tier leaves hot code slow, while compiling it early wastes work. The hard part is shared infrastructure that must support two very different pass configurations without doubling the maintenance cost.",
    k: ["Three tiers versus two: smoother warmup and better profiles, but more code paths, more tier transitions and more states to test.", "Profiling in the mid tier versus in the interpreter: more precise data at lower cost than interpreting, but the mid-tier code is itself slower than the top tier."],
    p: ["A mid tier compiled with stale feedback locks in poor decisions that the top tier later inherits.", "Two tiers with different frame states double the deoptimization paths and their bugs."],
    v: "Run a workload under a tracing flag and confirm functions pass through the mid tier, with compile times far below the top tier and speed between the other two.",
    dep: ["graph-ir","baseline-compiler","phase-pipeline","assembler"]
  },
  "optimizing-compiler": {
    s: "The top tier: a graph-based compiler that uses collected type feedback to speculate, then inlines, simplifies and register-allocates hot functions into code several times faster than baseline.",
    d: "It builds a graph from bytecode and feedback, adds guards for the assumptions it takes, runs the optimization pipeline, lowers to machine operations, allocates registers and emits code with the metadata for deoptimization and garbage collection. It is expensive in time and memory, so it runs rarely, on small hot sets, usually off the main thread. The difficulty is correctness under assumptions: every optimization that relies on a speculation must be undoable, and a miscompile is silent wrong output rather than a crash.",
    k: ["Aggressive speculation versus conservative compilation: much faster code when the profile holds, but repeated deoptimization when it does not.", "Whole-function compilation versus partial compilation of the hot path: simpler to reason about, but cold branches inflate the graph and slow compilation."],
    p: ["Compiling on stale or too little feedback produces code that deoptimizes immediately and wastes the compile.", "Compile time grows superlinearly on large functions with many inlined calls, delaying installation past usefulness."],
    v: "Run a hot numeric loop and confirm the trace log shows an optimized compile with inlined calls, a measured speedup over baseline, and no deoptimization once the types stay stable.",
    dep: ["graph-ir","phase-pipeline","speculation-policy","register-allocator","assembler","type-feedback-vectors"]
  },
  "shared-frame-layout": {
    s: "The agreement on where every tier keeps arguments, locals, the function reference and the return address, so execution can move between tiers without translating frames.",
    d: "Interpreter and baseline frames share one layout: fixed header slots, then registers addressed by index, so a baseline frame can be entered or left at a bytecode boundary. Optimized frames differ, with spill slots chosen by the allocator, which is why they carry frame state metadata describing how to rebuild a canonical frame. Stack walkers, exception unwinding and the debugger all rely on a small common header. The difficulty is that any change to the layout touches every generator, stub and walker, and a mismatch corrupts the stack rather than failing cleanly.",
    k: ["One common frame layout versus per-tier layouts: transitions are cheap and walkers are simple, but each tier is constrained by the shared design.", "Frame pointer chaining versus table-based unwinding: walking is fast and robust, at the cost of one reserved register."],
    p: ["Adding a slot to the header in one generator but not the stubs shifts every local and corrupts stack walks.", "An optimized frame without the common header fools the profiler's stack walker into reading garbage."],
    v: "Interrupt a running program at random points under a stack-walk stress mode and confirm every frame, in every tier, is identified with the correct function and bytecode offset.",
    dep: []
  },
  "generated-builtins": {
    s: "Language library functions and shared helpers compiled ahead of time or at startup into machine-code stubs, so every tier can call fast, correct implementations of common operations.",
    d: "Operations such as property loads on a miss, array methods, string concatenation or the generic arithmetic fallback are written once in a portable macro form and generated for the target. Compiled code calls them through a stable calling convention, and the optimizer may inline small ones into the graph. They sit between the interpreter and the compiler: they must follow the same frame and safepoint rules as optimized code. The difficulty is that they are performance-critical, shared and hand-tuned, so one bug affects every program.",
    k: ["Generated builtins versus writing them in the runtime's host language: fast and callable directly from code, but harder to write, debug and port.", "Embedded in the snapshot versus compiled at startup: faster startup and shared memory, but any change requires rebuilding the snapshot."],
    p: ["A builtin that allocates without declaring its safepoint behavior can hold a stale pointer across a collection.", "Inlining a builtin whose semantics changed in the runtime leaves the optimizer's copy behaving differently."],
    v: "Call each builtin from interpreter, baseline and optimized code with the same inputs and confirm identical results, including under forced collection at every allocation.",
    dep: ["calling-convention","runtime-call-stubs","assembler","safepoints"]
  },
  "tracing-recorder": {
    s: "In tracing designs, records the exact path of one hot loop iteration, including every operation and the type it saw, so a compiler can optimize that straight-line path.",
    d: "When a loop becomes hot, the engine switches to a recording mode that executes normally while logging each operation into a linear trace, with side exits at every branch not taken. The trace is then optimized as one basic block, which makes many analyses trivial: no merges, so types and aliasing are known exactly. Calls are inlined automatically. The difficulty is control flow: programs with many paths produce trace explosions or traces that rarely complete, and recording itself runs slowly.",
    k: ["Tracing versus method compilation: simple powerful optimization of one path and natural inlining, but poor behavior on branchy or irregular code.", "Stitching side-exit traces versus exiting to the interpreter: later traces recover from hot exits, but they multiply compiled code and bookkeeping."],
    p: ["A trace that aborts repeatedly for an unsupported operation burns recording time forever unless blacklisted.", "Loops with data-dependent branches generate a tree of near-duplicate traces that exhausts the code cache."],
    v: "Run a loop with a stable path and confirm one trace compiles and executes with no exits, then flip a branch and confirm a side trace is attached and the exit counter stops growing.",
    dep: ["back-edge-counters","interpreter-tier","guards","compilation-unit-choice"]
  },
  "compilation-unit-choice": {
    s: "The decision of what a compile covers: a whole function with its inlined callees, a loop body, a recorded trace, or a region of hot blocks within a function.",
    d: "A method-based unit compiles a function as written, so all paths are represented and control flow is natural, with hot calls inlined to widen the scope. A tracing unit covers one dynamic path. A region unit compiles only hot blocks and leaves cold ones as deopt exits. The choice affects the IR, the profile format, OSR, inlining and deoptimization everywhere downstream. It is hard to change late, because the counters, the graph builder and the frame state design all assume one model.",
    k: ["Method units versus trace units: robust on general programs and easier to cache and debug, but optimization crosses fewer dynamic boundaries without inlining.", "Whole function versus hot-region compilation: smaller graphs and faster compiles, but more exits to lower tiers on moderately warm branches."],
    p: ["Choosing method units without OSR leaves long-running loops in slow code until the function is called again.", "Regions that cut through loops without recording the live state make exits impossible to reconstruct."],
    v: "Compile a function with one hot and one never-taken branch and confirm in the compiler log that the unit includes or excludes the cold path as the design specifies, with the matching exit.",
    dep: ["tier-up-policy","graph-ir","osr-entry"]
  },
  "hotness-counters": {
    s: "Per-function counters, bumped on calls and loop iterations, whose values estimate how much time a function has consumed and so how worthwhile compiling it would be.",
    d: "A counter is incremented by interpreter handlers and baseline code, usually weighted by bytecode size so large functions tier up sooner on a per-instruction basis. Reaching a threshold or budget triggers a tier-up request. Counters live in the feedback or function metadata so they are cheap to update, with no atomics, since small races only blur the estimate. Some designs use sampling in place of counting. The difficulty is the signal quality: counts measure activity, not time spent, so a cheap function called constantly can outrank an expensive one.",
    k: ["Counting at call and back-edge sites versus timer sampling: deterministic and cheap to update, but it adds code to every function and counts invocations rather than time.", "Weighting by bytecode size versus raw counts: reflects compile cost versus payoff, but it makes thresholds harder to reason about."],
    p: ["Racy non-atomic increments across threads undercount shared functions and delay tier-up unpredictably.", "A counter reset on feedback clearing makes a hot function look cold again right after a deoptimization."],
    v: "Call one function repeatedly while a debug view shows its counter climbing, then confirm a tier-up request appears in the log within one budget of the configured threshold.",
    dep: ["type-feedback-vectors"]
  },
  "back-edge-counters": {
    s: "Counters on loop back-edges that detect a function stuck in one long-running loop, which call counts would never see, and trigger loop-level compilation and on-stack replacement.",
    d: "Every backward jump in interpreted or baseline code bumps a counter, often combined with a budget that is checked on a few instructions. When it overflows, the engine requests an optimized compile with an entry point at that loop head, then jumps into it when ready. A function called once but spinning for minutes is the case it exists for. The difficulty is overhead on tight loops and selecting the loop: nested loops need the right one, usually the outermost hot one, to avoid compiling the inner loop twice.",
    k: ["Counting every back-edge versus sampling it: precise and simple, but it adds work to the tightest loops where every cycle counts.", "Compiling the innermost versus the outermost hot loop: inner entry compiles sooner, outer entry avoids repeated transitions and enables loop nest optimization."],
    p: ["A loop that never reaches the counter check because it jumps via a different handler never gets compiled.", "OSR triggered on an inner loop each outer iteration causes repeated entry cost that exceeds the savings."],
    v: "Run one function with a single ten-million-iteration loop and confirm a compile with an OSR entry at the loop head appears in the log and the loop's per-iteration time drops mid-run.",
    dep: ["hotness-counters","osr-entry"]
  },
  "tier-up-policy": {
    s: "The rules that decide when a function is worth compiling at the next tier, balancing expected savings against compile cost, queue length and the quality of the profile so far.",
    d: "Inputs include the hotness counter, bytecode size, whether feedback has stabilized, the current queue depth and how many threads are free. A common rule is: tier up when the count passes a threshold that scales with function size, and not before feedback has been stable for some number of invocations. Aggressive policies get peak speed sooner but compile on thin profiles. The difficulty is that no single threshold fits all programs: short scripts want early compilation, servers want to wait for stable profiles, and the policy is usually the most tuned and fragile part of the engine.",
    k: ["Early tier-up versus waiting for stable feedback: faster warmup, but more deoptimizations and recompiles from immature profiles.", "Static thresholds versus adaptive ones driven by queue length and recent compile cost: self-tuning under load, but behavior is harder to predict and test."],
    p: ["A threshold tuned on one benchmark suite causes compile storms in programs with many medium-hot functions.", "Ignoring queue depth lets a burst of requests delay the one function that really matters."],
    v: "Replay a recorded warmup workload and confirm the log shows each function compiled in the order and at roughly the counter value the policy states, with no compile started on unstable feedback.",
    dep: ["hotness-counters","back-edge-counters","type-feedback-vectors","compilation-queue","compile-blacklist"]
  },
  "osr-entry": {
    s: "On-stack replacement: switching a running activation from a lower tier into optimized code at a loop head, so a long loop speeds up without waiting for the function to return and be called again.",
    d: "At a designated loop back-edge the engine checks whether an optimized version with an OSR entry exists. If so, it builds the optimized frame from the current interpreter or baseline frame, mapping live registers to the registers and stack slots the optimized code expects, then jumps in. The optimized code includes a special entry block that loads these values and then falls into the normal loop. The difficulty is correctness of the mapping: only variables live at the loop head transfer, and their types must satisfy the optimized code's assumptions.",
    k: ["OSR entry compiled as a separate variant versus one shared body: the loop is specialized for its entry types, but the compile cost is paid again for the normal entry.", "Entering only at loop heads versus at any safepoint: far simpler mapping and verification, but code between loops cannot be entered mid-way."],
    p: ["Entering OSR code with a value whose type differs from the one assumed makes the guard fail at once and loops forever through deopt and re-entry.", "Dead variables copied into optimized frames pin objects and delay garbage collection."],
    v: "Run a function with a long loop whose entry variables have stable types and confirm execution switches to optimized code mid-loop, with an identical final result and no immediate deoptimization.",
    dep: ["osr-state-transfer","back-edge-counters","shared-frame-layout","optimizing-compiler"]
  },
  "osr-state-transfer": {
    s: "The mapping that copies a live frame's values from the source tier's layout into the optimized layout at an OSR entry, converting representations and checking assumptions on the way.",
    d: "The compiler records which bytecode registers are live at the loop head and where each lives in the optimized code. At entry, a small generated stub reads them from the source frame, unboxes numbers into the representations the optimized code expects, checks types against its speculation and installs them in the new frame. If a check fails, it returns to the old tier. The difficulty is that the source frame may hold values the optimized code never saw during feedback, so the entry must be as defensive as any guard.",
    k: ["Generic entry stub that validates values versus assuming prior feedback: safe against surprising types, but costs a few checks every entry.", "Transferring only live values versus the whole frame: fewer copies and less retention, but depends on correct liveness analysis."],
    p: ["A liveness bug that omits a live variable gives the optimized loop an undefined value and wrong results.", "Stack slots for arguments updated by the interpreter after the transfer start diverge from the optimized copies."],
    v: "Trigger OSR at every iteration count in a sweep and compare final program state to a run with compilation disabled; every variable must match.",
    dep: ["shared-frame-layout","osr-entry","frame-states"]
  },
  "hotness-decay": {
    s: "Aging of hotness counters over time so that a function that was hot once, but is now idle, does not keep its compiled code and priority forever.",
    d: "Counters are periodically halved or reset, often when the collector runs or on a timer, so recent activity dominates. The same tick advances code age, which feeds eviction. It also keeps cold code from being tier-promoted because of work done long ago. The difficulty is the time constant: decay too fast and a periodic workload never reaches its threshold; decay too slowly and one early burst keeps stale code alive and the queue full.",
    k: ["Halving on a timer versus on garbage collection: wall-clock aging is predictable, while collection-tied aging follows allocation-heavy phases but varies with heap size.", "Decaying counters versus a sliding window: cheap and stateless, but a sliding window gives a cleaner rate estimate at the cost of more memory per function."],
    p: ["A periodic job that runs every minute never accumulates enough count and stays slow forever.", "Decay applied inconsistently to call and loop counters skews the choice between function and loop compilation."],
    v: "Run a hot function, then idle; confirm its counter falls through the logged decay steps and its code is marked old and becomes a candidate for eviction.",
    dep: ["hotness-counters","code-aging"]
  },
  "compile-blacklist": {
    s: "A record of functions the compiler failed on, rejected or deoptimized too often, which keeps them from being compiled again and again to no benefit.",
    d: "When a compile bails out for an unsupported construct, hits a size limit or loops in a deoptimize-recompile cycle, the function is marked with a reason and a retry policy: never, after N more invocations, or after its feedback changes. The list lives in function metadata. It stops the engine from wasting background threads on hopeless work. The difficulty is distinguishing permanent from temporary failures: blacklisting too broadly pins hot code in slow tiers, too narrowly allows compile storms.",
    k: ["Permanent blacklist versus time-limited backoff: permanent stops wasted work completely, but a changed program may deserve a retry that never comes.", "Per-function versus per-site marks: precise and keeps unaffected parts optimizable, but needs finer-grained metadata."],
    p: ["A bailout reason that is really a temporary condition, such as a full queue, blacklists a function forever.", "Failing silently without logging leaves developers puzzling why one function never gets fast."],
    v: "Compile a function that uses an unsupported construct, confirm the log records the bailout reason and that no further compile is attempted for it until the stated retry condition is met.",
    dep: ["tier-up-policy","deopt-backoff"]
  },
  "tier-down": {
    s: "Moving a function back to a lower tier and clearing its feedback and counters, either when its optimized code was invalidated or when the profile changed enough to need re-learning.",
    d: "After a deoptimization the function runs in the interpreter or baseline again, and the engine decides whether to keep or discard the existing feedback. Keeping it risks re-compiling with the same wrong assumption; discarding it throws away useful data. Policies often keep the feedback but widen the slot that caused the failure, so the next compile sees a more general type. The difficulty is making sure the next compile is actually different from the last, so the system converges instead of cycling.",
    k: ["Keeping feedback and widening the failing slot versus clearing everything: faster recovery and no relearning, but stale entries may mislead the compile.", "Immediate recompile versus waiting for new hotness: quick return to speed, but a high risk of recompiling on immature data."],
    p: ["Resetting counters without widening feedback makes the next compile identical, and it deoptimizes at the same place.", "Tiering down a function that others inlined leaves callers' optimized code running stale assumptions."],
    v: "Force a type change that invalidates optimized code and confirm the function runs in a lower tier, the failing feedback slot is more general, and the next optimized compile contains no guard for the old type.",
    dep: ["deopt-exits","type-feedback-vectors","hotness-counters","deopt-backoff"]
  },
  "type-feedback-vectors": {
    s: "A per-function array of slots, one for each feedback-collecting operation in the bytecode, recording the shapes, types, targets and counts the operation has actually seen.",
    d: "Each property access, call, arithmetic operation and comparison owns a slot. Lower-tier code writes to it as it runs: a load stores the shape it saw, a call stores the target, an addition stores which number kinds appeared. Slots move through states, uninitialized to monomorphic to polymorphic to megamorphic, and never move back without an explicit reset. The compiler reads the vector when building a graph. The difficulty is memory and sharing: vectors are heap objects, must be traced by the collector, and are expensive to allocate for functions that never run twice.",
    k: ["Feedback allocated lazily after some invocations versus at first call: saves memory for run-once code, but delays profiling of warming functions.", "Per-closure versus per-function-literal vectors: closures of the same code keep separate profiles and avoid cross-pollution, but cost more memory and relearn each time."],
    p: ["Slots that only widen make a function that was once polymorphic look polymorphic for its whole life.", "Feedback holding strong references to shapes keeps otherwise dead objects and their classes alive."],
    v: "Call a function with three different object shapes and dump its vector: the access site slot must be marked polymorphic with three entries, and the arithmetic slot must show only the number kinds used.",
    dep: ["shape-system"]
  },
  "inline-caches": {
    s: "Code at an operation site that remembers the last shape it saw and the matching fast action, so repeated property loads and calls skip the generic lookup.",
    d: "On a miss, the generic runtime does the full lookup, then rewrites the site, or stores the result in its feedback slot, so next time a shape check followed by a direct slot access or direct call suffices. The cache is both an optimization and a profile: its state records which shapes were seen. It starts uninitialized, goes monomorphic on one shape, and degrades on more. The difficulty is invalidation: a cached lookup that crossed a prototype chain is wrong if any link changes, so it needs dependencies or validity cells.",
    k: ["Patched code stubs versus data-driven handlers in feedback: stubs are faster per hit but need executable memory writes, while data handlers are safer and simpler to share.", "Caching the result versus caching a validity cell plus the result: handles prototype changes cheaply, but needs an extra load on every hit."],
    p: ["A cache that survives a prototype mutation returns the old method and runs wrong code with no error.", "A site flipping between two shapes thrashes by rewriting itself on every call."],
    v: "Run a loop reading one property on objects of one shape and confirm the site stays monomorphic with no runtime misses after the first, then mutate the prototype and confirm the next read misses.",
    dep: ["shape-system","type-feedback-vectors","code-patching"]
  },
  "polymorphic-caches": {
    s: "Inline caches that hold a short list of shape-and-action pairs, usually two to four, so sites that see a few types still avoid the generic path.",
    d: "When a monomorphic site sees a second shape, it grows into a chain or table of entries, tested in order, each leading to a specialized action. The cost grows with entry count, so the cap is small, beyond which the site goes megamorphic. For the optimizer, a polymorphic site becomes a switch on shape with each arm specialized or inlined, so the exact list matters. The difficulty is ordering and cap: most-frequent-first needs frequency data and a too-small cap loses speed for modestly varied code.",
    k: ["A small fixed cap versus a growing table: bounded cost per access and clear compiler input, but code with five types falls off a cliff.", "Ordering by recency versus by frequency: cheap to maintain, but it can place a rare shape in front of the common one."],
    p: ["A cache with more shapes than the cap silently degrades to megamorphic, and a benchmark suddenly loses half its speed.", "Entries for dead shapes accumulate, lengthening every hit's check chain."],
    v: "Drive one site with four shapes in a known ratio and confirm its state shows four entries with hit counts, and that the optimized code contains a four-way shape switch.",
    dep: ["inline-caches","shape-system","megamorphic-cache"]
  },
  "megamorphic-cache": {
    s: "A global hash table keyed by shape and property name that handles sites seeing too many shapes for any per-site cache, at roughly constant but slower cost.",
    d: "When a site exceeds the polymorphic cap, it is switched to a shared stub that hashes the receiver's shape and the name to probe a fixed-size global table. A hit gives the handler, a miss goes to the runtime and fills the entry. It is far faster than a full lookup but slower than a monomorphic hit, and it gives the optimizer nothing to specialize. The difficulty is collisions and flushing: a single table shared by every site can be thrashed by one noisy site, and must be cleared when shapes die.",
    k: ["One shared global table versus per-site tables: bounded memory and warm entries across sites, but sites interfere and collisions are hard to attribute.", "Flushing entries on garbage collection versus per-entry validity checks: simple correctness, but every collection costs a burst of misses."],
    p: ["One generic utility function called with every object in a program turns a hot site megamorphic for all of its callers.", "A table too small for the program's property set thrashes and hits the runtime constantly."],
    v: "Call one accessor with fifty distinct shapes and confirm the site is marked megamorphic, uses the global table, and that its hit rate is high after warmup.",
    dep: ["shape-system","inline-caches"]
  },
  "shape-system": {
    s: "The object model's hidden-class mechanism: objects with the same properties added in the same order share a shape, so a shape check proves the layout of an object.",
    d: "A shape lists property names with their slot offsets and links to transitions for each property added next. An object points to its shape. Checking one pointer therefore tells the code where every property sits. Dictionary-mode objects, with too many or deleted properties, give up shapes and use a hash table. The compiler treats shapes as the basic currency of speculation. The difficulty is stability: shapes that diverge by insertion order, field deletion or transitioning in constructors defeat caches and cause avoidable polymorphism.",
    k: ["Transition-tree shapes versus per-object property tables: cheap shape checks and shared metadata, but code that builds objects inconsistently creates many near-duplicate shapes.", "Tracking field representation in shapes versus only layout: enables unboxed number fields, but a representation change forces shape migration and invalidation."],
    p: ["Initializing properties in different orders in different code paths makes semantically identical objects incompatible.", "Deleting a property drops the object to dictionary mode and every access site on it goes slow."],
    v: "Build thousands of objects with identical property order and confirm they share one shape, then add the same properties in reverse order and confirm a second shape appears.",
    dep: []
  },
  "call-target-profiles": {
    s: "Records of which functions each call site actually invoked and how often, which tells the compiler whether inlining is possible and which callee to choose.",
    d: "Each call slot stores the last callee, or a small set, and a count. A site that always called one function can be speculated monomorphic, the call guarded by a check on the callee's identity, and the body inlined. Counts also feed inlining benefit estimates. Closures complicate it: the target is often a specific closure or its shared code, and which one the profile stores determines what can be assumed. The difficulty is polymorphism and megamorphism, where call sites in generic code see many targets and gain nothing.",
    k: ["Recording the closure versus the underlying code: precise, but the guard fails for each new closure from the same literal. The code identity generalizes, but it loses captured-variable knowledge.", "A single target per site versus a small set: more inlining chances for polymorphic sites, but more feedback memory and larger compiled code."],
    p: ["A shared helper called from hundreds of places shows a megamorphic profile at its callers' inlined copies too.", "A profile that records only the first target mis-speculates when behavior changes after warmup."],
    v: "Call a function through one site with a single target and confirm the optimized graph inlines it behind an identity guard, then switch targets and confirm a deoptimization naming that guard.",
    dep: ["type-feedback-vectors","hotness-counters"]
  },
  "branch-profiles": {
    s: "Counts of which way each conditional branch went, and how many iterations loops ran, used to place cold code out of line and to guess which paths deserve optimization effort.",
    d: "Interpreter and baseline code increment taken and not-taken counts at branches, or record only whether each direction was ever reached. The compiler uses that to delete paths never taken, replacing them with deoptimization exits, to order blocks so the hot path falls through, and to estimate loop trip counts for unrolling. Some engines keep only the never-taken bit, which is cheap and covers most of the value. The difficulty is misleading data: a path not yet taken during warmup may be common later, and deleting it causes a deoptimization.",
    k: ["Full counts versus a seen-or-never flag: counts enable layout and unrolling decisions, but cost memory and a store per branch.", "Pruning never-taken paths into exits versus compiling them: faster, smaller code, but a late first use costs a deoptimization and recompile."],
    p: ["Error-handling paths unseen during warmup are pruned, and the first real error deoptimizes in production.", "Counts saturating at a small width make all hot branches look equally hot."],
    v: "Run a loop whose branch is never taken in warmup and confirm the optimized graph has an exit there; then trigger the branch and confirm exactly one deoptimization at that site.",
    dep: ["type-feedback-vectors","deopt-exits"]
  },
  "arithmetic-feedback": {
    s: "Per-operation records of the number kinds an arithmetic or comparison saw, such as small integer, double, big number, string or other, so the compiler can pick a specialized representation.",
    d: "Each binary operation slot is a small set of flags. An addition that only ever saw small integers permits integer addition with an overflow check. If a double appeared once, the slot widens to number. Strings and objects widen it to any. Results feed the representation selection phase and decide which guards to emit. The difficulty is stability of the lattice: values that overflow occasionally, such as a hash computation, change the answer from integer to double in the middle of warmup and give code that is correct but slow.",
    k: ["Narrow flags that only widen versus keeping a recent-window history: monotone state is simple and converges, but one rare outlier permanently costs speed.", "Recording operand and result kinds separately: catches integer inputs overflowing to a double, but doubles feedback memory for arithmetic."],
    p: ["Integer overflow in a rarely hit branch widens a hot slot to double and slows the entire computation.", "A slot reading uninitialized after a feedback reset makes the compiler emit an unconditional deoptimization."],
    v: "Add small integers in a loop and confirm the optimized code uses integer adds with overflow checks, then pass one double and confirm a deoptimization and a recompile with number arithmetic.",
    dep: ["type-feedback-vectors"]
  },
  "allocation-site-profiles": {
    s: "Records at each allocation site of the kind and size of object created, and how long it survived, so the compiler and collector can pre-size and pretenure.",
    d: "Sites that create arrays record the element kind that the array ended up needing, so the next allocation starts with the right backing store, avoiding transitions. A site can also track how many objects survived a young collection, and if most do, the compiler emits allocation directly into the old generation. The profile is a feedback slot linked to the allocated objects themselves. The difficulty is the lag between creation and verdict, and the cost of tracking memento records for every object at a hot site.",
    k: ["Tracking survival per site versus using a global tenuring rule: better placement for stable sites, but costs per-allocation bookkeeping and extra memory.", "Feeding element kinds back to allocation versus transitioning on first write: avoids repeated representation changes, but one odd write can pessimize future arrays."],
    p: ["Pretenuring a site whose behavior changes fills the old generation with short-lived garbage.", "Memento overhead on a very hot allocation site costs more than it saves."],
    v: "Create arrays of doubles at one site and confirm later allocations there start in the double representation, and no elements-kind transition shows in the counters.",
    dep: ["type-feedback-vectors","inline-allocation"]
  },
  "warmup-versus-peak": {
    s: "The trade-off, shaping every layer, between getting code reasonably fast quickly and getting it as fast as possible eventually.",
    d: "Compile time spent early delays everything else on small machines and short programs; compile time withheld leaves hot code slow. Tier count, thresholds, profile maturity, inlining budgets and background thread count are all positions on this one axis. Interactive applications and short scripts weigh startup heavily, long-running servers weigh steady-state speed. Settings that are right for one workload are wrong for the other, so engines keep multiple configurations. The difficulty is measuring it: warmup and peak need separate benchmarks, or the tuning chases one and breaks the other.",
    k: ["Few tiers with a quick top-tier compile versus many tiers: simpler system and lower overhead, but a longer period of slow execution before the top tier.", "Shipping profiles or code from a prior run versus relearning each time: much faster warmup, but adds invalidation and storage problems."],
    p: ["Tuning only on peak throughput benchmarks makes real programs slow for their first seconds.", "Reducing compile effort to fix startup quietly lowers steady-state speed for long-lived processes."],
    v: "Plot throughput over time for a fixed workload on each configuration: confirm time-to-half-peak and final peak are both reported, and that a tuning change moves them in the documented direction.",
    dep: ["tier-up-policy"]
  },
  "unit-of-compilation": {
    s: "Whether the system compiles functions, loops, traces or hot regions, a choice that determines the shape of profiles, graphs, entry points and recovery.",
    d: "The unit decides what a counter counts, what the compiler sees as one graph, where execution can enter, where it can leave and what a cached code object represents. Method units make inlining the way to widen scope. Trace units take the path as the scope. Mixed designs use methods for general code and traces or loop units for hot loops. Because of how much depends on it, the unit is among the earliest and hardest design choices to reverse. The difficulty is that irregular, branchy code favors one unit and tight numeric loops another.",
    k: ["A single uniform unit versus per-situation units: one pipeline to build and test, but poor fit for the workloads it was not designed for.", "Compiling inlined callees as part of the caller versus separately: caller sees everything, but a callee change invalidates a larger unit."],
    p: ["A unit that cannot represent a construct, such as an exception handler inside a trace, forces a bailout for every function using it.", "Cache keys that ignore which unit a code object covers install the wrong entry point."],
    v: "For one function, list every compiled code object in the log with its unit type and entry points, and confirm each entry maps back to a source location.",
    dep: ["compilation-unit-choice","tier-up-policy"]
  },
  "deoptimization-contract": {
    s: "The rule that optimized code may assume anything the profile showed only if it can, at any assumption's failure, restore exact interpreter state and continue correctly.",
    d: "Every speculation point must have a frame state: enough information to rebuild every interpreter frame that was inlined at that point, with all live values in their boxed forms. Side effects that occurred before the exit must be ones the interpreter will not repeat. Optimizations that move or delete operations must preserve this. Violating the contract gives code that is only occasionally wrong, when an assumption fails at a point where state was not recoverable. The difficulty is that the contract constrains every pass, not just the deoptimizer, and it is checked only when a guard actually fails.",
    k: ["Precise frame state at every possible exit versus fewer exits with coarse state: simple reasoning and free movement of checks, but more metadata and more pressure on optimization.", "Eager exit at the failing guard versus lazy invalidation: eager is simple and local, lazy handles whole-code assumptions without checking inline."],
    p: ["A pass that moves a side effect across a guard makes the interpreter repeat it after deoptimizing.", "A frame state missing a live register gives the interpreter a stale value and silent wrong output."],
    v: "Run a deoptimization stress mode that forces every guard to fail once at random and confirm that program output is identical to a run with no optimization.",
    dep: ["frame-states","deopt-exits","frame-reconstruction"]
  },
  "threading-and-heap-access": {
    s: "The rules about which threads may read and write the heap, bytecode and feedback, which decide how much compilation can move off the main thread.",
    d: "The program thread mutates objects, shapes and feedback at any time. A compile thread needs to read some of them. The options are to snapshot what is needed up front on the main thread, to read live data under strict rules such as atomic or immutable fields, or to stop the program during compilation. The rule also covers the collector, which can move or free the objects a compile thread holds. The difficulty is that a missed read is a race that shows up as rare, unreproducible miscompiles or crashes.",
    k: ["Snapshot on the main thread versus concurrent reads: no races by construction, but the main thread pays for the copy and the snapshot can go stale.", "Compiling with the program stopped versus concurrently: simple and consistent, but pauses scale with function size."],
    p: ["A compile thread that reads a field the program is mid-update on embeds an inconsistent value in generated code.", "A held pointer that the collector moves points at garbage when the compile finishes."],
    v: "Run a compile stress test with an allocation-heavy mutator on another thread under a race detector and confirm no data race is reported and results match single-threaded runs.",
    dep: ["background-compile-threads","concurrent-heap-reads","concurrent-graph-building"]
  },
  "executable-memory-security": {
    s: "The policy about when generated machine code can be written and when it can be run, aimed at denying attackers a writable and executable region.",
    d: "A JIT needs to write code and then execute it, which is exactly what exploit mitigations forbid. Common policies keep pages writable or executable but never both, flipping protection around each write or mapping the same memory twice, once for each permission. Others add randomization of code addresses, constant blinding and checks on indirect branches. These affect patching, code layout, compile latency and debugging tools. The difficulty is cost: protection changes involve system calls and cross-thread synchronization, which turns every inline cache update into a measurable expense.",
    k: ["Strict write-xor-execute versus writable-and-executable pages: removes a whole attack class, but each patch needs a protection change or a dual mapping.", "Dual mappings versus toggling page permissions: no window where the executable view is writable, but twice the address space and extra bookkeeping."],
    p: ["A protection toggle left open on an error path leaves a writable and executable page for the process's life.", "Frequent permission changes serialize all threads and make inline cache updates a bottleneck."],
    v: "Scan the process's memory map during a run of patch-heavy code and confirm no page is ever mapped both writable and executable at the same time, and that patch rate has acceptable overhead.",
    dep: ["executable-memory-protection","code-patching"]
  },
  "target-portability": {
    s: "How much of the compiler is independent of the processor it runs on, and where each target's differences are confined.",
    d: "The graph passes are portable; instruction selection, the assembler, the calling convention, relocation, instruction cache handling and branch ranges are per target. A clean split lets a new target need only a backend and its builtins. Practical engines also vary in the features each target offers, such as available registers, vector widths, floating-point behavior and memory ordering, so graph operations are lowered to what exists. The difficulty is that fast paths tuned on one target embed assumptions, like cheap unaligned access or strong ordering, that quietly break correctness on another.",
    k: ["A shared graph with per-target lowering versus a per-target pipeline: much less duplication, but the common IR must model the least common denominator or grow target-specific nodes.", "Hand-written assembly builtins per target versus generated from one description: best speed, but more code to keep in step."],
    p: ["Assuming strong memory ordering produces data races only on targets with weaker ordering.", "A branch displacement that fits on one target overflows on another when code grows."],
    v: "Run the full differential test suite on each supported target and confirm identical output across all, including tests that force long branches and maximum register pressure.",
    dep: ["instruction-selection","assembler","calling-convention"]
  }
});
