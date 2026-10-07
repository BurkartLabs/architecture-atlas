// Details for the bytecode VM plate, part 3: caches, calls, values and objects, concurrency.
ATLAS.details("bytecode-vm", {
  "inline-caches": {
    s: "A small cache stored at an instruction that remembers the shape seen last time and the result of the lookup, so repeated property accesses skip the full search.",
    d: "A property-get instruction holds a slot for a shape and an offset. On execution it compares the object's shape to the cached one; on a match it reads the field at the cached offset directly. On a miss it does the full lookup and updates the cache. The same idea caches method targets, global variable cells and call targets. Caches live in a feedback array beside the code. It is hard because correctness depends on invalidation: when a shape changes, a prototype is modified or a global is deleted, cached answers may become wrong.",
    k: ["Monomorphic cache with fallback versus always doing a full lookup: caching makes the common case one compare and a load, while the miss path and invalidation add complexity.", "Caching shape and offset versus caching a pointer to the target: shape and offset survive object replacement, while a target pointer is faster for calls but needs stronger invalidation."],
    p: ["A change to a prototype's method does not invalidate caches on instances, so the old method keeps being called.", "A cache is updated on every miss at a site whose shapes alternate, wasting more time than having none."],
    v: "Run a loop reading one property of objects with a single shape and confirm via counters that the full lookup runs once. Then change a prototype method mid-loop and confirm the next call runs the new method.",
    dep: ["shapes", "property-lookup", "polymorphic-caches", "type-feedback"]
  },
  "polymorphic-caches": {
    s: "Caches that hold several shapes per site, or fall back to a shared global table when a site sees too many, so varied receivers do not thrash a single entry.",
    d: "When a site sees a second shape, the cache grows to a short list, usually two to four entries, checked in sequence. A site seeing more becomes megamorphic and switches to a global hash table keyed by shape and name, which is slower than an inline hit but faster than the full lookup. The states are monomorphic, polymorphic and megamorphic, and sites only move toward megamorphic unless reset. It is hard because choosing the limits is empirical, and a long list costs more than the lookup it avoids.",
    k: ["Small fixed polymorphic list versus unbounded growth: a short list keeps checks cheap, while unbounded growth hurts every access at a busy site.", "Global megamorphic table versus per-site fallback: a global table shares work across sites, while per-site fallback avoids contention but repeats entries."],
    p: ["A generic utility function called with many types becomes megamorphic for every caller that shares its code.", "The global megamorphic table is never cleared, and stale entries for dead shapes keep those shapes alive."],
    v: "Call one site with one, three and twenty distinct shapes and read the site's state through a debug interface. Confirm transitions to polymorphic and megamorphic occur at the configured limits, and timing steps up accordingly.",
    dep: ["inline-caches", "shapes"]
  },
  "type-feedback": {
    s: "Runtime records of the types and shapes each instruction has seen, stored per function and used to specialize instructions and guide optimizing tiers.",
    d: "A feedback vector, with one slot per instruction that benefits, is allocated for each function once it is warm. Handlers write observations into it: operand type masks for arithmetic, shapes for property access and targets for calls. The interpreter reads it for quickening, and a compiler tier reads it to decide what to assume. Feedback is kept separate from the immutable prototype. It is hard because it costs memory and write time, it can be polluted by startup behavior, and it must be reset or versioned when code changes.",
    k: ["Collecting feedback from the first call versus after warm-up: from the first call gets complete data, while after warm-up avoids memory for functions that run once.", "Per-function feedback versus per-closure feedback: per-function shares learning across closures, while per-closure is more precise but multiplies memory."],
    p: ["Feedback gathered during initialization marks a site as polymorphic, and the optimizer never specializes it for steady-state use.", "A feedback vector keeps references to objects that would otherwise be collected."],
    v: "Run a function with integers for a thousand calls and inspect its feedback vector: confirm integer-only masks at arithmetic sites and a single shape at property sites. Then pass a string and confirm the masks widen.",
    dep: ["function-prototypes", "hot-counters", "inline-caches"]
  },
  "hot-counters": {
    s: "Counters on function entries and loop back-edges that decide when code is hot enough to specialize or hand to a faster tier.",
    d: "Each function or loop carries a small counter that is incremented on entry or back-edge; when it passes a threshold the runtime triggers a promotion, such as allocating feedback, compiling a baseline version or starting an optimizing compile. Counters may decay over time so that old activity does not count forever. Thresholds balance responsiveness against wasted compile effort. It is hard because thresholds that suit one workload hurt another, and counters add a memory write to every loop iteration.",
    k: ["Counting loops separately from calls: separate counters catch single long-running loops, while call counts alone miss programs that run one hot loop once.", "Fixed thresholds versus adaptive ones: fixed thresholds are predictable, while adaptive ones follow load and compiler queue length but are harder to reason about."],
    p: ["A threshold set too low compiles startup code that runs once, and the compile queue delays the genuinely hot code.", "A long-running loop in a function entered once is never promoted because only entries are counted."],
    v: "Run a program with one hot loop entered once and a function called a million times. Confirm both cross their threshold and are promoted, and that a cold function called twice is not.",
    dep: ["function-prototypes", "jit-interface", "interrupt-polls"]
  },
  "jit-interface": {
    s: "The boundary where the interpreter hands a hot function to a compiling tier and switches execution between the two, defined in terms of frames, feedback and entry points.",
    d: "The interpreter exposes a function's bytecode and feedback to the compiler and receives back machine code with an entry point. Calls then go to the compiled code if present. Both tiers must agree on the frame layout and calling convention, or provide adapters. The compiled code may bail out to the interpreter, which requires a mapping from compiled state back to an interpreter frame. Entering a compiled loop from the middle, on-stack replacement, needs the reverse mapping. The tier itself is out of scope here. The interface is hard because both tiers must keep every observable behavior identical.",
    k: ["Shared frame layout versus translation at tier boundaries: a shared layout makes switching cheap, while translation lets each tier use its best layout at the cost of adapters.", "Compile on a background thread versus inline: background keeps pauses short, while inline is simple and deterministic but stalls the program."],
    p: ["The compiled tier and the interpreter differ on a semantic corner such as error order, so programs behave differently after promotion.", "A function is replaced while a compile of the old version finishes, and stale machine code is installed."],
    v: "Run a differential test that executes the same programs interpreter-only and with promotion forced at every function, comparing outputs and error messages. Confirm identical results, including after forced bailouts.",
    dep: ["function-prototypes", "type-feedback", "call-frames", "calling-convention"]
  },
  "calling-convention": {
    s: "The rules for how a call passes arguments, receives results and identifies the callee: which slots hold what, who clears them and how argument counts are checked.",
    d: "In a register design the caller places the callee and arguments in consecutive slots at the top of its frame, and the callee's frame starts there so no copying is needed. In a stack design arguments are pushed. The call instruction checks the callee type, the argument count and stack space, then enters the callee. Return values are copied to the caller's destination. The same convention should serve closures, methods, native functions and constructors. It is hard to keep uniform: every special case, such as variable arguments or defaults, adds a branch to the hot path.",
    k: ["Overlapping caller and callee windows versus copying arguments: overlap is free at call time, while copying is simpler but costs time proportional to argument count.", "Callee checks arity versus caller checks: callee checks cover indirect calls with one implementation, while caller checks allow skipping them for known targets."],
    p: ["A native function and a bytecode function interpret the argument window differently, and extra arguments corrupt a neighboring frame.", "Variable-argument handling shifts the window and leaves stale values that look like arguments."],
    v: "Call functions with too few, exact and too many arguments, through direct, indirect and method forms, in bytecode and native functions. Confirm results and errors match the language rules and the stack height is unchanged after each call.",
    dep: ["call-frames", "register-file-and-stack", "argument-binding"]
  },
  "call-frames": {
    s: "The records of active calls: each holds the function, the instruction pointer to resume, the base of its slots and bookkeeping for returning and unwinding.",
    d: "A frame stack, separate from or interleaved with the value stack, holds one record per active call. Records contain the closure being run, the saved instruction pointer, the base slot, the expected result count and flags such as whether the frame is native or a boundary where the loop was re-entered. Returning pops the frame and restores state. Frames are what stack traces, the debugger, the collector and the unwinder walk. It is hard because several consumers walk it at inconsistent moments, so the saved state must be exact whenever any of them can run.",
    k: ["Heap-allocated frames versus frames on a contiguous stack: heap frames make closures and coroutines simple, while a contiguous stack is faster and compact.", "Separate frame and value stacks versus one interleaved stack: separate stacks simplify scanning, while one stack has better locality and one overflow check."],
    p: ["The saved instruction pointer is stale when an error is thrown, so a stack trace reports the previous line.", "A frame record left behind after an unwind makes the next return resume in dead code."],
    v: "Throw an error five frames deep, with a native frame in the middle, and print the trace. Confirm each frame shows the right function and line, and after catching it the frame count equals the count at the catch site.",
    dep: ["register-file-and-stack", "function-prototypes"]
  },
  "argument-binding": {
    s: "Maps call arguments onto parameters: defaults, rest parameters, named arguments and variable argument lists, with checks for count and type.",
    d: "The callee prologue, or a generic helper, fills missing parameters with defaults, gathers extras into an array for a rest parameter, matches named arguments to positions and raises an error on a mismatch. Default expressions may need to run in the callee's scope. Fast paths exist for the exact-count case so that simple functions pay nothing. It is hard because the same function must behave identically whether called with a fixed list, spread from an array or called by name, and because defaults that reference earlier parameters impose order.",
    k: ["Binding in the callee prologue versus at the call site: the prologue keeps call sites small and handles indirect calls, while call-site binding allows specialization for known targets.", "Eager default evaluation versus lazy: eager is simple, while lazy lets defaults depend on state at use time but surprises users."],
    p: ["A rest parameter copies the entire argument window on every call even when it is unused, slowing hot variadic functions.", "A default expression that closes over a loop variable captures one binding shared across calls."],
    v: "Call one function with exact, missing, extra, spread and named arguments. Confirm each binds as the specification says and that the exact-count case executes no binding helper, shown by an instruction trace.",
    dep: ["calling-convention", "function-prototypes", "collection-runtime"]
  },
  "closures-and-upvalues": {
    s: "Function values that carry captured variables: a closure pairs a prototype with references to variables from enclosing scopes that outlive their frames.",
    d: "When code runs a closure-creation instruction it allocates a closure object holding the prototype and an array of upvalues built from the capture descriptors. Access to a captured variable goes through its upvalue, which points either into a live stack slot (open) or to its own storage (closed). Two closures capturing the same variable share one upvalue so writes are visible to both. It is hard because identity matters: the VM must find or create the one open upvalue per variable, and it must stay valid when the stack moves.",
    k: ["Open upvalues pointing into the stack versus allocating a cell for every captured variable: open upvalues cost nothing until escape, while cells are simpler and unaffected by stack moves.", "Flat closures copying values versus linked environment chains: flat closures make access constant time, while chains share storage naturally but lengthen with nesting."],
    p: ["Two closures created in different calls share an upvalue they should not, because lookup compared slot addresses after a stack reallocation.", "A closure keeps a whole environment alive for one captured variable, retaining large unrelated data."],
    v: "Create two closures that read and write one counter and a third in a loop capturing per-iteration variables. Confirm shared writes are visible to the right closures only, then force stack growth and check values again.",
    dep: ["function-prototypes", "upvalue-closing", "capture-analysis", "allocation-fast-path"]
  },
  "upvalue-closing": {
    s: "Moving a captured variable from its stack slot into heap storage when its scope ends, so closures keep a valid value after the frame is gone.",
    d: "The VM keeps a list of open upvalues sorted by stack position. When a scope exits, whether by a block end, a return or an unwind, a close instruction or the return path walks the list from the top down to the scope's base, copies each value into the upvalue's own field and repoints it. Closing must occur on every exit path including errors, and on coroutine yield if the stack segment is detached. It is hard because a missed path leaves an upvalue pointing at a reused stack slot.",
    k: ["Closing at block exit versus at function return only: block exit is exact for per-iteration semantics, while function return is cheaper but delays release.", "A sorted open list versus a table keyed by slot: a sorted list closes in one pass and finds existing upvalues quickly, while a table suits many captures but costs more to close."],
    p: ["An error unwinds past a scope without closing its upvalues, and a surviving closure later reads whatever the stack slot now holds.", "A loop body that captures a variable closes it on break but not on continue."],
    v: "Create closures inside loops exited by normal flow, break, continue, return and thrown errors, then call them afterward. Confirm each sees the value from its own iteration, not a reused slot.",
    dep: ["closures-and-upvalues", "exception-unwinding", "register-file-and-stack"]
  },
  "tail-calls": {
    s: "A call in tail position that reuses the caller's frame instead of adding one, so recursion and state-machine loops run in constant stack space.",
    d: "The compiler marks a call whose result is returned directly. The instruction moves the callee and arguments down into the current frame's base, replaces the frame's function and jumps to the callee's start. Upvalues of the old frame must be closed first. It guarantees constant space for proper tail recursion. It is hard because it removes frames from stack traces, interacts with debugging and exception ranges, and must handle native callees, which cannot always reuse the frame.",
    k: ["Guaranteed tail calls versus best effort: a guarantee enables recursion-based loops, while best effort is simpler and keeps traces intact but offers no space bound.", "Dropping the caller frame versus keeping a marker for traces: dropping saves memory, while a marker preserves debugging detail at a small constant cost."],
    p: ["A tail call inside a protected region is treated as a normal call or, worse, skips the handler that should have covered it.", "Tail calls to native functions grow the stack because the frame cannot be reused."],
    v: "Run a tail-recursive loop of fifty million iterations and a mutual-recursion pair, watching frame depth and memory. Confirm both stay constant, and that a tail call inside a try block still triggers its handler on error.",
    dep: ["calling-convention", "call-frames", "upvalue-closing", "exception-tables"]
  },
  "exception-unwinding": {
    s: "The process of finding a handler for a thrown error by walking frames outward, running cleanup, closing upvalues and restoring VM state to the handler's frame.",
    d: "A throw creates an error value, often capturing a trace, then the unwinder walks the frame stack from the top. For each frame it looks up the faulting offset in the exception table; if an entry covers it, it restores the stack depth, stores the error value and resumes at the handler. Otherwise it pops the frame, closes upvalues and continues. Native frames in between either propagate through return codes or use a non-local jump that skips them. It is hard because native code and finalizers in the middle must not be skipped incorrectly.",
    k: ["Non-local jump through native frames versus return-code propagation: jumps are fast and simple to write, while return codes let native code clean up reliably but need checks everywhere.", "Catching errors from every source versus separating VM faults: one mechanism is uniform, while separation lets limits and out-of-memory errors be uncatchable."],
    p: ["A non-local jump skips a native frame that held a lock or a buffer, leaking it permanently.", "An error thrown while the VM builds an error object, for example under memory exhaustion, recurses into itself."],
    v: "Throw from bytecode, from a native function and from a handler, across nested catch and cleanup blocks, with a native frame in the middle. Confirm the right handler runs, cleanup runs once, no resources leak and memory returns to baseline.",
    dep: ["exception-tables", "call-frames", "upvalue-closing", "stack-trace-capture"]
  },
  "stack-overflow-guard": {
    s: "Limits that stop runaway recursion cleanly, by capping VM frame depth and by protecting the native stack that recursion through native code consumes.",
    d: "The VM checks frame count or value-stack size on each call and raises a catchable error when a limit is hit. Native recursion, such as the interpreter recursing for each call, a recursive collector or a deep parser, uses the hardware stack and is limited by a depth counter or by checking the stack pointer against a boundary. Handling must leave enough space to run error handling. It is hard because the native stack limit depends on the platform and thread, and recursion in places like equality of deeply nested structures is easy to overlook.",
    k: ["Counting depth versus checking the stack pointer: counting is portable and deterministic, while pointer checks adapt to actual frame sizes and thread stack sizes.", "Reserving headroom for the handler versus none: headroom lets the error be reported and caught, while none is simpler but can overflow while handling overflow."],
    p: ["A deeply nested data structure makes a native recursive routine overflow the hardware stack and crash the process rather than raise an error.", "The limit is right on the main thread but wrong for threads created with small stacks."],
    v: "Run unbounded recursion in bytecode, through native callbacks and through a deeply nested structure comparison, on main and small-stack threads. Confirm each raises a catchable depth error and the process continues.",
    dep: ["call-frames", "register-file-and-stack", "thread-primitives"]
  },
  "stack-trace-capture": {
    s: "Records the chain of active functions and source positions when an error is created or a profiler samples, so a trace can be shown later.",
    d: "Capture walks the frame stack and records, for each frame, the function and the instruction offset, converting to lines lazily when the trace is printed. Capturing only offsets keeps errors cheap to create; formatting touches the line tables. Traces may be limited to a maximum depth and may include native frames with names. In async code, traces can be stitched across suspension points. It is hard because capture cost adds to every thrown error and because inlined or tail-called frames are not in the stack.",
    k: ["Capture at creation versus at throw: at creation shows where the error object was made, while at throw shows where it propagated and matches expectations in most languages.", "Raw offsets resolved lazily versus formatted strings at capture: lazy is cheap for errors never printed, while eager formatting is simpler but slows exception-heavy code."],
    p: ["Programs using exceptions for control flow spend most of their time building traces nobody reads.", "A trace holds references to frames' functions and closures and keeps large object graphs alive after the error is handled."],
    v: "Throw ten thousand errors in a loop and confirm time per throw stays within budget. Print one trace from a coroutine and a native callback and confirm function names, lines and the async stitch point appear in the right order.",
    dep: ["call-frames", "debug-info-and-line-tables", "function-prototypes"]
  },
  "value-representation": {
    s: "How one language value is stored in a machine word or two: which values are held inline and which are references to heap objects, and how the two are told apart.",
    d: "A value is a word or a pair of words. Small integers, booleans, null and perhaps floats are stored directly, while strings, objects and large numbers are pointers to heap memory. Telling them apart uses a tag stored in the word, a separate tag word, or a type header in the pointed-to object. The choice determines the cost of arithmetic, the memory per array element, and how the collector finds references. It is hard to revisit: the representation is assumed by the loop, the collector, the native API and any compiled tier.",
    k: ["One word with embedded tag versus two words with a separate tag: one word halves memory and cache use, while two words are simpler and avoid range limits on inline values.", "Inline floats versus boxed floats: inline avoids allocation in numeric code, while boxing keeps the encoding simpler and integers wider."],
    p: ["Code outside the VM assumes a value layout and breaks silently when the representation changes.", "Range limits on inline integers cause a sudden slowdown when values cross the boundary into boxed form."],
    v: "Allocate an array of ten million numbers and measure memory per element and time to sum it. Confirm values stored inline need no per-element allocation and that boundary values on either side of the inline range round-trip exactly.",
    dep: ["pointer-tagging", "nan-boxing", "boxed-values"]
  },
  "pointer-tagging": {
    s: "Using the low bits of aligned pointers, or the high bits of a word, as a type tag so small integers and pointers share one machine word.",
    d: "Heap objects are aligned, so the low bits of their addresses are zero. A value whose low bit is one can be an inline small integer, with the payload shifted up, and a value with a zero tag is a pointer. Several tag values can distinguish integers, pointers, immediate constants and perhaps floats. Tag checks are a mask and a compare; arithmetic on tagged integers can often be done without untagging. It is hard because the integer range shrinks by the tag bits, and because tag bits must be masked correctly before any pointer is used.",
    k: ["Low-bit tags versus high-bit tags: low-bit tags use alignment and are free on pointers, while high-bit tags depend on address-space size and may conflict with other uses.", "One integer tag versus several immediate tags: one tag keeps checks simplest, while several allow inline constants and characters without allocation."],
    p: ["A pointer is dereferenced with its tag bits still set, giving a misaligned or invalid access.", "Integer overflow checks are done on the tagged form incorrectly and produce off-by-one results at the range edge."],
    v: "Round-trip integers at the range boundaries and every tag kind through the VM's encode and decode functions, and run a fuzz test mixing them in arithmetic. Confirm results equal a reference using unboxed 64-bit values.",
    dep: ["value-representation", "arithmetic-fast-paths"]
  },
  "nan-boxing": {
    s: "Storing every value in one 64-bit word by hiding non-number types in the unused payload bits of floating-point not-a-number patterns.",
    d: "A double-precision number uses all bit patterns of a word except a large range of not-a-number values. The VM encodes pointers, integers, booleans and null inside that range, so any word that is not a not-a-number is a float and every other kind has a tag in the high bits. Numbers need no allocation or tag check beyond a range compare. Real not-a-number results must be canonicalized so they do not collide with tagged values. It is hard because it assumes pointers fit in the available bits and fixes the word size.",
    k: ["NaN boxing versus pointer tagging: NaN boxing gives full-range floats with no allocation, while pointer tagging keeps integers fast and does not depend on floating-point formats.", "Canonicalizing not-a-number on every float result versus at boundaries: every result is safe but slower, while boundaries are cheaper but easy to forget."],
    p: ["A computation produces a not-a-number whose bits look like a tagged pointer, and the collector follows it.", "A platform with wider address space breaks the assumption that pointers fit in the payload bits."],
    v: "Produce not-a-number values from arithmetic, parsing and native code, and pass them through the VM and the collector. Confirm each is treated as a number and prints correctly, and every tagged value survives a round trip.",
    dep: ["value-representation", "boxed-values"]
  },
  "boxed-values": {
    s: "Heap objects that wrap values that do not fit inline, such as large integers, floats in tagged schemes, strings and arbitrary-precision numbers, with a header naming their type.",
    d: "A boxed value is an allocated object with a header holding its type and collector flags, followed by a payload. Boxing allows any size and type but costs an allocation, a pointer chase and collector work. Arithmetic that produces boxed numbers is slower unless the compiler tier removes them. Small boxes for common values may be cached or shared. It is hard because boxing is invisible in the language but dominates performance in numeric loops, and equality semantics for boxed numbers must match inline ones.",
    k: ["Allocate on demand versus caching common boxes: allocation is simple and flexible, while caching saves memory and time for repeated small values but needs a lookup.", "Mutable boxes versus immutable ones: immutable boxes can be shared safely, while mutable boxes allow in-place updates in loops but complicate identity."],
    p: ["Two boxed numbers with equal values compare unequal by identity in an equality fast path that checks pointers only.", "A tight numeric loop allocates a box per iteration and spends most of its time in the collector."],
    v: "Run a numeric loop with values outside the inline range and count allocations per iteration. Confirm equality and hashing treat boxed and inline equal numbers as identical, and allocation volume matches the design's expectation.",
    dep: ["value-representation", "object-layout", "allocation-fast-path"]
  },
  "string-interning": {
    s: "Keeping one canonical copy of each distinct short string, so equality is a pointer comparison and names are stored once.",
    d: "A global hash table maps string contents to the canonical string object. Names from the constant pool, property keys and short results of string operations are interned on creation or at load. Lookups compare pointers instead of bytes, which makes property access and switch on strings cheap. Long strings are usually not interned. Entries must not keep dead strings alive forever, so the table uses weak references that the collector clears. It is hard because interning adds a lookup cost to string creation and the table is a contention point across threads.",
    k: ["Intern all strings versus only short ones and names: interning all makes equality always cheap, while limiting it avoids hashing large strings on creation.", "Weak table versus strong table: weak lets unused strings be reclaimed, while strong is simpler but grows without bound under generated names."],
    p: ["A program generating millions of unique property names grows the intern table and slows every lookup.", "The intern table is not cleared of dead entries by the collector, and a stale pointer is returned for a later equal string."],
    v: "Create the same string by concatenation in two places and confirm pointer equality when interned. Generate a million unique names, drop them, run a collection and confirm the table shrinks back near its starting size.",
    dep: ["collector-interface", "weak-refs-and-finalizers", "object-layout"]
  },
  "object-layout": {
    s: "The memory structure of a heap object: a header with type, shape and collector bits, followed by inline fields and possibly a pointer to extra storage.",
    d: "The header holds a shape or class pointer, flags such as mark bits and the object's size or kind. Fields known at allocation live inline after it in slots whose offsets the shape defines; additional properties spill into an out-of-line array. Arrays, strings and closures have their own layouts but share the header. Compact headers save memory in programs with many small objects. It is hard because the layout is assumed by the collector, the inline caches and native code, and because growing an object may require moving it or adding indirection.",
    k: ["Inline fields versus a separate property array: inline is faster and smaller for stable objects, while a separate array allows cheap growth and shape changes.", "Header carrying a shape pointer versus a small type index: a shape pointer enables direct cache checks, while a type index shrinks headers but needs a table lookup."],
    p: ["A native extension reads a field at a fixed offset, and a layout change in the VM makes it read the wrong data.", "Header bits for the collector and for the program share a word, and a concurrent update loses one of them."],
    v: "Allocate a million small objects and measure bytes per object against the computed layout size. Add properties beyond the inline capacity and confirm they spill correctly and reads return the stored values.",
    dep: ["shapes", "value-representation", "collector-interface"]
  },
  "shapes": {
    s: "Shared descriptions of an object's property names and their storage offsets, so objects built the same way share one shape and a cache can test it with one comparison.",
    d: "Adding a property to an object moves it to a new shape reached from the old one by a transition keyed on the property name, forming a tree. Objects created by the same code follow the same transitions and share shapes. A shape maps names to slot offsets and records attributes. Deleting properties or adding very many may switch the object to dictionary mode with its own hash table. It is hard because shape trees can grow without bound, and unstable property orders create many shapes that defeat caches.",
    k: ["Transition trees versus per-object dictionaries: shapes make access fast and shareable, while dictionaries handle churn cheaply but give up caching.", "Order-sensitive versus order-insensitive shapes: order-sensitive is simple and follows insertion order, while order-insensitive reduces shape count but needs canonicalization."],
    p: ["Code that adds the same properties in different orders creates many shapes for what the author sees as one type, and every site becomes polymorphic.", "Deleting a property drops an object into dictionary mode, making all later access to it slow."],
    v: "Construct a thousand objects with identical property order and a thousand with shuffled order, then inspect shape counts. Confirm the first set shares one shape and the second set's cost is visible in the shape count and access time.",
    dep: ["object-layout", "property-lookup"]
  },
  "property-lookup": {
    s: "Finding the value for a property name on an object by checking its own shape, then its prototype or class chain, with defined handling for getters and missing names.",
    d: "The generic lookup first searches the receiver's shape; if the name is absent it follows the prototype link and repeats, up to the chain's end, then returns undefined or raises an error. Properties may be data, accessors that run code, or special slots for arrays and strings. The result of a successful walk, shape plus offset plus which prototype held it, is exactly what an inline cache stores. It is hard because the chain may be changed during lookup by an accessor, and because the slow path must be correct for every special object kind.",
    k: ["Walking the chain on every miss versus flattening inherited properties into each shape: walking is simple and always current, while flattening is faster but expensive to maintain on change.", "Treating missing names as undefined versus an error: undefined is forgiving and fast, while errors catch typos earlier at the cost of guard code."],
    p: ["A getter modifies the prototype chain being walked and the lookup reads freed or inconsistent state.", "A very long prototype chain makes every miss slow and nobody notices because cached hits are fast."],
    v: "Look up own, inherited, accessor and missing properties on ordinary, array and string receivers. Confirm results and getter call counts, and that the first and later lookups agree before and after a prototype edit.",
    dep: ["shapes", "object-layout", "string-interning"]
  },
  "method-dispatch": {
    s: "Choosing which function runs for a method call on a receiver, using the receiver's type, class hierarchy or prototype chain, with caching for speed.",
    d: "A method call instruction names a method and receiver. Class-based designs index a per-class method table built at load, often a vtable for fixed slots plus a hash for others; prototype-based designs look the name up through the chain. The result is a function object called with the receiver as the first argument. Multiple dispatch or interfaces need extra tables. Call sites cache the receiver's shape and target. It is hard because overriding, late binding, redefinition and dynamic receivers all invalidate shortcuts.",
    k: ["Vtable slots versus name lookup with caching: vtables give constant-time dispatch for fixed hierarchies, while name lookup suits dynamic languages and relies on caches for speed.", "Interface dispatch via search tables versus itables per class: search tables are compact, while itables are quick but use more memory per class."],
    p: ["A method added to a superclass after load is shadowed by a stale entry in a subclass's copied method table.", "A call on null or on an unexpected type reports a message with no receiver information, making the error hard to trace."],
    v: "Call overridden, inherited, interface and dynamically added methods through a base-typed variable. Confirm the most specific method runs each time, even after redefining a method mid-run.",
    dep: ["class-loader", "property-lookup", "inline-caches", "calling-convention"]
  },
  "collection-runtime": {
    s: "The runtime implementation of arrays and hash tables: growth policy, element kinds, hashing and the iteration order that programs observe.",
    d: "Arrays are contiguous value buffers with a length and capacity that grow geometrically. Specialized element kinds, such as all integers or all floats, avoid boxing and halve memory. Hash tables use open addressing or chaining with a stored hash, resizing at a load factor, and may keep insertion order. Both are used by the VM itself for globals, constants and object dictionaries. It is hard because hashing must resist adversarial keys, mutation during iteration needs a defined result, and element kinds change when a different type is stored.",
    k: ["Insertion-ordered hash tables versus unordered: ordering gives deterministic iteration that programs come to rely on, while unordered is a little faster and smaller.", "Specialized element kinds versus uniform value arrays: specialization saves memory and speeds numeric code, while uniform arrays are simpler and avoid transitions."],
    p: ["Attacker-chosen keys that collide turn constant-time lookups into linear scans and stall the VM.", "An array silently converts to a slower general kind after one stray element and never converts back."],
    v: "Insert, delete and iterate a million keys, including colliding and mixed-type keys, and compare iteration order and contents with a model. Confirm lookup time stays flat with adversarial keys when seeded hashing is on.",
    dep: ["boxed-values", "object-layout"]
  },
  "coroutines": {
    s: "Functions that can suspend in the middle and be resumed later, each with its own call stack, switching only where the program says so.",
    d: "A coroutine owns a separate value stack and frame stack. Resume switches the interpreter to that stack and runs until it yields or returns; yield saves the position and switches back, passing a value either way. Stackful coroutines can yield from any depth of calls; stackless ones only from their own frame. Implementation inside the interpreter loop is just a pointer swap if native frames are not in between. It is hard because native frames on the stack cannot be suspended, and because open upvalues and error handlers belong to a particular stack.",
    k: ["Stackful versus stackless coroutines: stackful yield from anywhere and are flexible, while stackless need transformation and are cheaper in memory.", "Own stack per coroutine versus shared stack with copying: own stacks switch fast but use memory each, while copying shares memory but costs time per switch."],
    p: ["A coroutine yields across a native call boundary and the VM cannot resume it, raising a confusing error or crashing.", "A coroutine abandoned in the suspended state keeps its entire stack alive indefinitely."],
    v: "Create ten thousand coroutines that each yield values in turns from nested calls, then finish half and abandon half. Confirm values and order are correct, errors propagate to the resumer, and abandoned coroutines are collected.",
    dep: ["call-frames", "register-file-and-stack", "closures-and-upvalues", "thread-state-transitions"]
  },
  "generators": {
    s: "Functions that produce a sequence lazily by yielding values one at a time, implemented as a restricted coroutine driven by an iteration protocol.",
    d: "A generator function call returns an iterator object holding a suspended frame. Each request for the next value resumes the frame until its next yield, which returns a value and suspends again. The compiler marks generator prototypes, and the runtime allocates the frame on the heap or as a small coroutine. Early termination must run cleanup in the generator body. It is hard because generators interact with exceptions, return values, delegating generators and resource cleanup when the consumer stops early.",
    k: ["Heap-allocated frame versus a full coroutine stack: a heap frame is small and simple since the generator yields only from its own body, while a coroutine permits nested yields at more memory.", "Cleanup on early exit by explicit close versus on collection: explicit close is deterministic, while collection-time cleanup is easier for users but unpredictable."],
    p: ["A consumer breaks out of a loop and the generator's cleanup block never runs, leaking a file or a lock.", "A generator captures a large local environment and retains it for as long as the iterator exists."],
    v: "Consume a generator fully, partially and by throwing into it. Confirm values, return value and that a cleanup block runs exactly once on each exit, including early break and an error in the consumer.",
    dep: ["coroutines", "object-protocols", "function-prototypes"]
  },
  "fibers-and-green-threads": {
    s: "Lightweight tasks scheduled by the runtime rather than the operating system, many multiplexed onto few threads, each with its own stack of VM frames.",
    d: "A fiber is a coroutine plus scheduler metadata: state, wait reason and priority. The scheduler runs a ready fiber until it blocks or yields, then picks another. Blocking operations such as sleep, channel receive or I/O are expressed as a suspension that registers a wake-up condition. Fibers can switch cheaply because no kernel is involved. It is hard because a blocking native call blocks the whole thread and every fiber on it, and fairness requires preemption that cooperative designs lack.",
    k: ["Cooperative versus preemptive scheduling: cooperative is simple and has no races inside a fiber, while preemptive prevents a loop from starving others, using back-edge polls at some cost.", "One carrier thread versus several: one thread avoids data races on the VM, while several use more cores and need locking or isolates."],
    p: ["A fiber calling a blocking native function stalls every other fiber on the same thread with no error.", "A busy loop without yields starves timers and I/O completions indefinitely."],
    v: "Run ten thousand fibers that sleep and exchange messages, plus one fiber in a tight loop and one calling a blocking function. Confirm throughput, that timers fire within tolerance, and that the starvation cases are detected or handled as designed.",
    dep: ["coroutines", "scheduler-and-event-loop", "interrupt-polls", "thread-state-transitions"]
  },
  "async-lowering": {
    s: "Compiling async and await into suspendable state machines, so a function can wait for a result without blocking its thread.",
    d: "An async function is compiled like a generator whose yields are awaits. Calling it returns a promise; the body runs until it awaits an unfinished promise, then suspends and registers a continuation on it. When the promise settles the scheduler resumes the body with the value or error. Exceptions inside the body reject the promise. Await inside try and finally blocks must preserve their semantics across suspensions. It is hard because ordering of continuations is observable, and unhandled rejections need a policy.",
    k: ["Async as generators plus a driver versus dedicated instructions: reusing generator machinery is small and proven, while dedicated instructions avoid a layer of calls and allocation.", "Microtask queue draining after each task versus on demand: draining after each task gives predictable ordering, while on demand is simpler but varies between hosts."],
    p: ["An error in an async function with no awaiting caller is dropped silently instead of being reported.", "Continuations run in an order different from the specified one, which only shows up as occasional wrong output."],
    v: "Run a set of async functions with awaits in try, finally and loops, with rejections and mixed order of completion. Compare the recorded ordering of continuations and error handling with the specified sequence.",
    dep: ["generators", "scheduler-and-event-loop", "exception-unwinding", "desugaring"]
  },
  "scheduler-and-event-loop": {
    s: "The loop that runs ready tasks, timers and I/O completions in a defined order, and decides when the program has no more work and may exit.",
    d: "The scheduler holds a ready queue, a timer heap and a set of pending I/O handles. Each turn it runs a task, drains the microtask queue, fires due timers and polls the operating system for completed I/O, waiting if nothing is ready. Callbacks run on the loop's thread. The loop ends when no references remain that could produce more work. It is hard because ordering rules are observable, starvation between queues must be avoided, and integrating with the host's own loop requires an agreed handoff.",
    k: ["VM-owned loop versus host-driven loop: VM-owned is self-contained, while host-driven integrates with an application that already has a loop.", "Reference-counted handles versus explicit stop: counted handles let programs end naturally, while explicit stop is simpler but needs the program to call it."],
    p: ["A timer that is never cleared keeps the process alive forever after the work is done.", "A microtask that schedules another microtask without bound starves timers and I/O."],
    v: "Schedule timers, I/O completions and chained microtasks in mixed order and log execution. Confirm order matches the documented rules, the loop exits when work ends, and a runaway microtask chain is detected or bounded.",
    dep: ["clocks-and-timers", "thread-primitives", "host-callbacks"]
  },
  "global-interpreter-lock": {
    s: "A single lock that only one thread at a time may hold while running VM code, trading parallel speed for a runtime that needs little internal locking.",
    d: "A thread must hold the lock to execute bytecode or touch VM structures. It releases the lock periodically, driven by a poll or counter, and around blocking calls so other threads can run. With the lock, reference counts, caches and the heap need no fine-grained synchronization, and native extensions are simpler to write. It limits CPU parallelism to one thread. It is hard because fairness under contention is poor, switching costs add up, and removing the lock later means making every shared structure thread-safe.",
    k: ["One global lock versus fine-grained locking: one lock is simple and fast single-threaded, while fine-grained locking enables parallelism at a cost in complexity and speed.", "Lock release by timer interval versus on blocking operations only: intervals ensure fairness, while blocking-only release is cheaper but lets compute-bound threads starve others."],
    p: ["A native extension holds the lock during a long operation and stalls every other thread.", "A thread calling back into the VM from native code without reacquiring the lock corrupts shared state."],
    v: "Run compute-bound threads and I/O-bound threads together and measure throughput of each. Confirm I/O threads progress during compute work, compute threads do not scale with core count, and a stress test shows no heap corruption.",
    dep: ["thread-primitives", "interrupt-polls", "thread-state-transitions"]
  },
  "isolate-messaging": {
    s: "Passing data between isolated VM instances by copying or transferring it, so no object is ever shared between heaps.",
    d: "A sender serializes a value graph into a message buffer, or copies it directly into the receiver's heap, handling cycles and shared references inside the graph. Some buffers can be transferred without copying, giving up the sender's access. Channels or ports deliver messages to the receiver's scheduler as events. Functions and native handles usually cannot be sent. It is hard because deep copies are expensive, cycles and identity must be preserved, and the receiver must validate what it gets, since it came from another program.",
    k: ["Copy on send versus transferring ownership: copying is safe and simple, while transfer avoids cost for large buffers but invalidates the sender's reference.", "A structured-clone format versus passing raw bytes: structured formats keep object graphs intact, while raw bytes put the encoding burden on programs."],
    p: ["A message containing a cyclic structure sends the copier into infinite recursion or an enormous output.", "A sender holding a transferred buffer keeps using it, reading memory now owned by another isolate."],
    v: "Send a graph with cycles, shared subobjects and a large buffer between two isolates on separate threads. Confirm structure and identity are preserved, a transferred buffer is detached at the sender, and heaps remain independent.",
    dep: ["vm-instances-and-isolates", "scheduler-and-event-loop", "collection-runtime"]
  },
});
