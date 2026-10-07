// Details for the real-time OS plate, part 3: time, memory, interrupts, protection.
ATLAS.details("real-time-os", {
  "hardware-timer-source": {
    s: "The hardware counter, with a compare interrupt, that gives the kernel its sense of time: either a periodic tick source or a programmable one-shot timer.",
    d: "A timer peripheral counts clock cycles and raises an interrupt on reload or on a compare match. The kernel configures its rate, ties the interrupt to its tick handler and reads the counter for fine timestamps. Its clock source should be stable, since drift becomes timing error everywhere, and the timer must keep running through the sleep states used. It is hard because the timer's interrupt has the highest practical priority needs and it is shared by tick, timestamping and sometimes application timers, so its configuration affects many guarantees.",
    k: ["Dedicated timer for the kernel versus sharing with the application: dedicated avoids conflicts and keeps timing guarantees clear, but uses a scarce peripheral.", "Crystal-based clock versus internal oscillator: crystal gives accuracy and stability for time-keeping, while internal oscillator saves cost and board area but drifts with temperature."],
    p: ["Changing the system clock frequency without reconfiguring the timer, so all delays are scaled wrongly.", "A timer that stops in a sleep mode, so time simply stops passing."],
    v: "Measure the tick output pin with a frequency counter over a long run and confirm it matches the configured rate within the specified tolerance, including after every power mode transition.",
    dep: ["clock-and-memory-init","interrupt-controller-and-priorities"]
  },
  "tick-counter": {
    s: "The kernel's running count of timer ticks since start, used to measure delays and timeouts and to order events in time, with a width chosen for the longest interval needed.",
    d: "At each tick interrupt the kernel increments a counter, checks whether any delayed task's wake time has arrived and moves it to ready, and applies time slicing. The counter has a fixed width, so it wraps after a known time; all comparisons are done with arithmetic that tolerates wrap. Tick rate sets resolution and overhead: a faster tick gives finer delays but more interrupts. It is hard because tick work grows with the number of tasks waking at once, so the tick handler's worst case matters.",
    k: ["Fast tick versus slow tick: a fast tick gives finer timing and shorter delay granularity, but costs processor time and energy in every interval; a slow tick is cheap but delays can round by up to a full tick.", "32-bit versus 64-bit counter: 64-bit never wraps in practice, but is not read atomically on a small core; 32-bit is atomic but wraps in weeks."],
    p: ["Comparing tick values with a plain greater-than, which fails once at wrap time.", "Assuming a delay of one tick is a full tick, when it can be anywhere from zero to one tick."],
    v: "Run a task that logs a delay of N ticks against an external time reference, confirm the measured range matches the analysis, and force the counter near wrap and confirm all delays still work.",
    dep: ["hardware-timer-source","timeouts-and-delay-lists","wraparound-safe-arithmetic"]
  },
  "tickless-idle": {
    s: "A mode that stops the periodic tick while idle and programs the timer for the next needed wake-up, saving energy by letting the processor sleep for long intervals.",
    d: "When the idle task runs and no task needs service before some time T, the kernel suppresses the tick, programs a timer to wake at T, and enters a sleep state. On waking, from the timer or any other interrupt, it measures how much time passed and adds it to the tick count in one step. This avoids many empty wake-ups. It is hard because the timer, which may stop in deep sleep, needs a separate always-on clock, and because the time spent entering and leaving sleep must be accounted for correctly.",
    k: ["Tickless versus periodic tick: tickless saves energy in long idle periods and gives exact wake-ups, but adds code in the idle path and a risk of time errors; periodic is simple and uniform.", "Minimum idle time before stopping the tick versus always: a threshold avoids stopping for intervals shorter than the entry cost, but needs tuning per chip."],
    p: ["Time lost because the wake-up was measured with a clock that stopped in sleep.", "Entering tickless sleep with a software timer due very soon, causing a late callback."],
    v: "Run with a long periodic task and measure current with a power analyzer for a full period; confirm idle current is at the sleep level and that the task's release time error stays within one clock period.",
    dep: ["tick-counter","hardware-timer-source","tick-compensation","sleep-state-selection"]
  },
  "high-resolution-clock": {
    s: "A free-running counter, often the processor's cycle counter or a fast timer, that provides microsecond or finer timestamps for measurement, scheduling decisions and timing control.",
    d: "While the tick counts in milliseconds, a hardware counter running at the processor or peripheral clock gives nanosecond-scale resolution. The kernel and application read it for traces, execution time measurement, budget enforcement and short precise delays. Counter width matters: a 32-bit counter at high speed wraps in seconds, so readers use differences or extend it in software. It is hard because reading must be cheap and consistent, and the source may stop or change rate in power modes.",
    k: ["Cycle counter in the core versus a separate timer: the core counter costs nothing to read, but tracks the core clock, which changes with frequency scaling; a separate timer keeps a fixed rate.", "Extending the counter in software versus a wider hardware counter: extension needs an interrupt on rollover and careful reads, but works on narrow timers."],
    p: ["Using a core cycle counter as a time base and having it change rate when the clock frequency is scaled.", "A rollover interrupt delayed past one full wrap, losing a whole period of time."],
    v: "Compare differences of the clock over a one-hour run with a reference time source and confirm the error is within the specified parts per million, also across clock frequency changes.",
    dep: ["hardware-timer-source","wraparound-safe-arithmetic"]
  },
  "software-timers": {
    s: "Timers implemented in the kernel that call a function after a delay or at a period, run in a timer service task so their callbacks never run in an interrupt.",
    d: "Applications create timers with a period and a callback. The kernel keeps them ordered by expiry and a service task, woken at the next expiry, runs the due callbacks. Start, stop and reset commands are sent to the task through a queue. Because callbacks run in that task, they must not block, and their combined run time delays other timers. It is hard because timer accuracy is limited by the task's priority and the queue, and a slow callback delays every later one.",
    k: ["Callbacks in a service task versus in the tick interrupt: a task keeps interrupts short and lets callbacks use kernel services, but has queue and scheduling delay; interrupt callbacks are exact but must be tiny.", "Many software timers versus hardware timers for critical timing: software timers are cheap and plentiful, but accuracy depends on the system's load; hardware gives exact timing and is limited in number."],
    p: ["A callback that blocks on a queue, stalling the timer task and all other timers.", "A timer task priority too low, so callbacks are late whenever higher tasks are busy."],
    v: "Create timers at several periods and log callback times against a hardware reference while the system is at full load, and confirm the maximum lateness stays within the allowed value.",
    dep: ["timeouts-and-delay-lists","message-queues","tick-counter"]
  },
  "timeouts-and-delay-lists": {
    s: "The ordered structure of tasks waiting for a time to pass or an object to arrive, which the tick or timer handler scans so each wakes at its time.",
    d: "Tasks that delay or block with a timeout are placed in a list sorted by wake time (or in a timing wheel) and also on any wait list of the object. At each tick, tasks whose time has arrived are moved to ready with a timeout result. Absolute delays use the same structure. Insertion into a sorted list takes time proportional to its length, while wheels give constant time. It is hard because timeouts and signals race: an object signaled in the same tick as the timeout needs one consistent outcome.",
    k: ["Sorted list versus timing wheel: a sorted list is simple and exact, but insertion time grows with the number of waiting tasks; a wheel has constant time but uses more memory and needs a defined tick resolution.", "Two lists (current and overflow) versus one with wrap-safe comparison: two lists avoid wraparound tests, but add logic when the counter wraps."],
    p: ["A task woken by a timeout and by a signal at once, treating the signal as lost.", "Timeout lists scanned in the tick handler with interrupts masked, adding latency that grows with tasks."],
    v: "Block many tasks with random timeouts and signals, check each reports the correct outcome (timeout or signaled) and wakes within one tick of its time, and measure the tick handler's maximum duration.",
    dep: ["tick-counter","wraparound-safe-arithmetic","task-control-block"]
  },
  "wraparound-safe-arithmetic": {
    s: "The practice of comparing and subtracting time values using modular arithmetic, so intervals stay correct when the counter overflows and wraps back to zero.",
    d: "With an unsigned counter of fixed width, the difference of two readings, computed modulo the width, gives the correct elapsed time as long as it is less than half the range. Comparisons cast the difference to a signed value: negative means earlier. Kernel and application time code follows this rule everywhere, instead of comparing raw values. It is hard because the bug appears only once every wrap, which may be weeks of uptime, and so evades ordinary testing.",
    k: ["Differences in modular arithmetic versus 64-bit counters that never wrap: modular is cheap and works on small cores, but needs discipline; 64-bit is simple to reason about but costs extra instructions and atomicity care.", "Limit on maximum interval of half the range versus full range: half the range is required for unambiguous order, which limits the longest timeout."],
    p: ["Comparing now >= deadline directly, which fails after the counter wraps.", "A timeout longer than half the counter range being treated as already expired."],
    v: "Start the tick counter a few seconds before the wrap and run all delays, timeouts and periodic tasks across the wrap, confirming no wake-up is early, late or lost.",
    dep: []
  },
  "time-synchronization": {
    s: "Keeping the device's clock aligned with other devices or a reference, by correcting offset and rate from timestamped messages, so distributed actions happen at agreed times.",
    d: "A device exchanges timestamped messages with a master clock over a bus or network, measures the path delay and corrects its local clock by adjusting offset and rate. Hardware timestamping at the network or bus controller removes software jitter. Corrections are applied smoothly so time does not jump backwards. It is hard because the accuracy depends on the symmetry and jitter of the path and on timestamp precision, and software timestamps add interrupt and scheduling delay.",
    k: ["Hardware timestamps versus software timestamps: hardware reach nanosecond accuracy by capturing at the wire, but need controller support; software timestamps work anywhere with microsecond to millisecond error.", "Slewing the clock versus stepping it: slewing keeps time monotonic and safe for timers, but converges slowly; stepping fixes errors at once and can break running timeouts."],
    p: ["Stepping the clock backwards and causing a periodic task to run twice or timeouts to fire early.", "Asymmetric network paths producing a constant offset that no filtering removes."],
    v: "Compare two synchronized devices' output pins on an oscilloscope over a long run with network load, and confirm the offset stays inside the required bound, including after a master change.",
    dep: ["high-resolution-clock","can-and-ethernet-drivers","hardware-timer-source"]
  },
  "static-allocation": {
    s: "Reserving all memory for tasks, stacks and kernel objects at build time as fixed arrays, so nothing can fail to allocate after startup and usage is known from the link map.",
    d: "Every task stack, control block, queue and buffer is declared with a fixed size and placed by the linker. Creation functions take pointers to this memory instead of allocating. The memory map is then complete and can be reviewed, checked against limits and analyzed. It cannot fragment and costs constant time. It is hard because sizes must be chosen in advance for the worst case, which wastes memory when typical needs are lower, and every dynamic feature must be reformulated around fixed limits.",
    k: ["Static allocation versus heap allocation at startup: static gives an exact link-time map and no heap code, but needs an edit to change a size; startup allocation is flexible but needs a heap and failure handling.", "Worst-case sizing versus typical sizing: worst case never fails but wastes memory; typical sizing saves memory and fails on rare peaks."],
    p: ["Sizing a pool for the common case and running out in a rare burst with no recovery path.", "Mixing static and heap objects so ownership and lifetime rules are no longer uniform."],
    v: "Inspect the link map to confirm every kernel object lives in a named static region, and run a long test while confirming the heap usage counter stays at zero.",
    dep: ["static-kernel-objects","linker-placement"]
  },
  "memory-pools": {
    s: "Preallocated areas divided into equal-sized blocks that are allocated and freed in constant time without fragmentation, so allocation delay and failure behavior are predictable.",
    d: "A pool owns a fixed number of blocks of one size and a free list through them. Allocation pops a block, freeing pushes it back, both in a few instructions inside a short critical section or lock-free. Several pools of different sizes cover varied needs. Allocation can fail only when the pool is empty, which is a defined, testable event. It is hard because choosing block sizes and counts needs knowledge of the worst-case usage, and a block returned to the wrong pool or freed twice corrupts the list.",
    k: ["Several pool sizes versus one general heap: pools never fragment and have constant time, but waste space inside blocks and need sizing; a heap fits any request at the cost of fragmentation and variable time.", "Blocking allocation with timeout versus immediate failure: blocking smooths short shortages, but adds waiting to the caller's response; immediate failure is bounded and needs a handler."],
    p: ["A double free returning one block to the list twice, so two tasks later share a block.", "Pool exhaustion in a rare path with no handler, which then dereferences a null result."],
    v: "Run an allocate-and-free stress with random sizes and counts across tasks and interrupts for hours; confirm the free count returns to the initial value and that the longest allocation time is constant.",
    dep: ["static-kernel-objects","scheduler-lock"]
  },
  "bounded-heap-allocators": {
    s: "A heap allocator whose worst-case time is bounded and whose fragmentation behavior is controlled, used only where pools do not fit, and often only during startup.",
    d: "Such allocators use segregated free lists by size class, with a bit map to find a fitting block in constant time, and merge neighbors on free to limit fragmentation. Some forbid freeing entirely, so the heap is a one-way allocator used during startup. Others reserve areas per subsystem so one cannot starve another. It is hard because even with bounded time, a long-running mix of sizes will fragment and a request can fail with plenty of total free memory.",
    k: ["Constant-time segregated lists versus best-fit search: constant time bounds latency, but wastes space in rounding; best-fit saves memory but its search time depends on heap state.", "Allocate-only heap versus freeing heap: allocate-only cannot fragment and is trivial, but memory never returns; freeing supports dynamic behavior and fails by fragmentation."],
    p: ["A heap that works for months in testing and fragments after a rare sequence in the field.", "Using the library heap from two tasks without a lock or with a lock that adds unbounded blocking."],
    v: "Run an accelerated aging test with the product's allocation pattern, recording largest free block over time, and confirm the largest free block never falls below the needed size and worst allocation time stays bounded.",
    dep: ["scheduler-lock","linker-placement"]
  },
  "per-task-stacks": {
    s: "A separate stack for each task, sized for its deepest call chain plus one saved context, with an additional stack for interrupt handling in many designs.",
    d: "Every task has its own stack, because a blocked task must keep its local data and return addresses while others run. Stack size = deepest call path of its code, plus space to save registers at a switch and for interrupts that nest on it unless a separate interrupt stack exists. Static analysis of call graphs and measurement of high-water marks size them. It is hard because stack depth is invisible: it depends on call paths, library calls, and rarely executed error handling.",
    k: ["Separate interrupt stack versus interrupts on task stacks: a separate stack means task stacks need not include worst-case interrupt nesting, saving memory on every task; sharing needs no extra hardware support.", "Large uniform stacks versus tuned per-task sizes: uniform is safe and simple, but wastes memory in proportion to the task count."],
    p: ["A task calling a function with a large local array that exceeds its small stack.", "Recursion with no depth limit blowing the stack on unexpected input."],
    v: "Compute the static worst-case stack depth for each task, compare with the allocated size, then confirm measured high-water marks from a fault-injection run are below the static bound.",
    dep: ["static-kernel-objects","stack-overflow-detection"]
  },
  "stack-overflow-detection": {
    s: "Checks that notice a task has used more stack than it owns, by a guard pattern, by a hardware guard region or by comparing the stack pointer on each switch.",
    d: "Software detection fills the end of each stack with a known pattern and checks it at context switches; hardware detection places a protection region or a stack-limit register at the end, trapping the access immediately. The hook then runs the fault policy. Software checks may run too late: a deep call can jump past the pattern and write other memory before the check. It is hard because the overflow often corrupts a neighbor task or control block, and the symptom appears far from the cause.",
    k: ["Pattern checked at switches versus hardware stack limit: patterns need no hardware but only detect after the fact; hardware limits stop the overflow instantly, but need a protection unit region per task.", "Large guard band versus small: a big band catches jumps past it, but costs memory for every task."],
    p: ["Relying on a pattern check while a large frame jumped over the guard and overwrote the next task's data.", "Disabling the check in release builds to save time, so overflows turn into unrelated failures."],
    v: "Force an overflow in a test task with a deep call and a large frame, and confirm the system detects it with the reaction in the policy within one switch for software, or at the instruction for hardware.",
    dep: ["per-task-stacks","mpu-region-management","fault-handlers"]
  },
  "static-kernel-objects": {
    s: "Declaring queues, semaphores, mutexes, timers and tasks as statically allocated structures supplied to the kernel at creation, instead of the kernel allocating them.",
    d: "Each creation call takes a pointer to storage defined in the application, so memory use is visible at link time and creation cannot fail from lack of heap. Many kernels offer both allocated and static creation for each object kind. The caller must make sure the storage lives as long as the object and is not shared. It is hard because the application must know each object's storage size, which depends on kernel configuration options, so a mismatch between the two is a memory error.",
    k: ["Caller-supplied storage versus kernel allocation: caller storage is predictable and heap-free, but exposes object layout to the application; kernel allocation hides details but needs a heap.", "Opaque handles versus public structures: opaque handles protect against misuse, but force allocation or fixed-size wrapper types."],
    p: ["Passing stack-allocated storage to a creation call, which becomes invalid when the function returns.", "A kernel configuration change that alters object size without rebuilding application code."],
    v: "Create every object statically, run the application, and confirm from the link map that all object memory is in static sections and the heap is not linked or is unused.",
    dep: ["linker-placement"]
  },
  "linker-placement": {
    s: "Using the linker script to place code, constants, stacks, buffers and kernel data in specific memory regions, with checks that each region has enough room and the right attributes.",
    d: "The script assigns sections to flash, fast internal memory, retained memory or external memory, and aligns regions for protection-unit boundaries. Time-critical code can be placed in fast memory, and buffers for direct memory access in memory the controller can reach. Symbols exported from the script give the kernel region boundaries for its protection setup. It is hard because placement changes timing and correctness together: the same code executes at different speed in different memory, and an alignment mistake can break a protection region.",
    k: ["Critical code in fast memory versus in flash: fast memory is quicker and more predictable, but is scarce; flash is plentiful but has wait states and contention with data reads.", "Region sizes as powers of two with alignment versus flexible placement: alignment constraints of the protection unit waste space but are mandatory on some chips."],
    p: ["Placing a direct memory access buffer in memory the controller cannot reach, so data never arrives.", "A region overflow that the linker silently allows because the check was not enabled."],
    v: "Read the link map after each build and confirm every region has remaining free space above the minimum, that critical sections are in their intended regions, and that protection regions match the exported symbols.",
    dep: ["image-layout"]
  },
  "cache-and-dma-buffers": {
    s: "Rules for memory shared between the processor and direct-memory-access hardware: where buffers live, alignment, and when to flush or invalidate caches, so both see current data.",
    d: "With a data cache, the processor may hold a newer copy than memory, and a transfer may land in memory behind the processor's stale cache line. Remedies include placing buffers in uncached regions, or flushing before a transfer out and invalidating before reading a transfer in, with buffers aligned and padded to whole cache lines. Caches also make timing less predictable, so some systems lock or disable them. It is hard because errors cause rare data corruption that looks like a hardware fault.",
    k: ["Uncached buffer region versus explicit cache maintenance: an uncached region is simple and safe, but each access is slower; maintenance keeps speed and requires correct calls at each transfer.", "Cache enabled versus disabled for the whole system: enabled gives large average speedup, but hurts determinism and analysis; disabled makes timing simple and slow."],
    p: ["A buffer not padded to a cache line, so an invalidate discards neighboring variables.", "Reading a received buffer without invalidating, getting stale data only when cached."],
    v: "Run a long transfer test with random data and checksums at full bus load with the cache enabled and confirm zero mismatches, then remove the maintenance calls on a test build and confirm the test does detect errors.",
    dep: ["dma-drivers","linker-placement"]
  },
  "vector-table": {
    s: "The table of handler addresses indexed by exception and interrupt number, which the processor consults on each event, placed at a fixed or configurable address.",
    d: "On an interrupt, hardware reads the entry for that source and jumps to its handler. The first entries cover reset and processor faults; the rest correspond to peripheral interrupts. Kernel-owned entries point to its context switch and tick handlers. The table can sit in flash, or be relocated to RAM so handlers can be changed at run time. It is hard because an unfilled or wrong entry sends control to a random place on the one event that uses it, which may occur rarely.",
    k: ["Table in flash versus relocated to RAM: flash is fixed and safe from corruption, but RAM allows run-time handler changes and costs memory and exposure.", "Default handler for unused entries that halts versus ignores: halting reveals mistakes immediately, ignoring can mask a runaway interrupt."],
    p: ["An enabled interrupt with no handler installed, jumping to the default and hanging.", "A handler name mismatch with the startup file so a weak default replaces the real handler."],
    v: "Enable every interrupt source one at a time in a test build and confirm each reaches its intended handler, and that unused entries go to a handler that logs and enters the safe state.",
    dep: ["startup-code","interrupt-controller-and-priorities"]
  },
  "interrupt-controller-and-priorities": {
    s: "The hardware that enables, masks, prioritizes and routes interrupt sources, whose priority scheme decides which interrupts may preempt others and which the kernel can mask.",
    d: "Each source has an enable bit and a priority level. The controller delivers the highest-priority pending interrupt and lets higher levels preempt lower ones. The kernel splits levels into those that may call its services, which it can mask in critical sections, and more urgent ones that it never masks but that must not use kernel calls. Preemption groups define which levels can nest. It is hard because the split must be set up correctly: a high-priority interrupt that calls a kernel function breaks the kernel's protection of its own data.",
    k: ["Kernel-safe levels versus unmaskable levels: a split keeps the most urgent interrupts at minimal latency, but they cannot use kernel calls; one range for all is simple and gives them all kernel access at higher latency.", "Fine-grained priorities versus few: fine control lets each source have its place, but increases chances of ordering errors; few levels are easier to review."],
    p: ["An interrupt above the kernel's masking threshold calling a kernel API, corrupting kernel lists.", "Priority numbers inverted in the reader's mind, since on many controllers lower numbers mean higher urgency."],
    v: "Print the configured priority of every interrupt, check each against the priority policy, and run a test where a low-priority and a high-priority source fire together, confirming the trace order.",
    dep: ["vector-table"]
  },
  "isr-entry-and-exit": {
    s: "The prologue and epilogue around interrupt handlers that save and restore registers, tell the kernel an interrupt is active and request a context switch on exit if a higher task became ready.",
    d: "On entry, hardware or code stacks the registers the handler may change; the kernel increments a nesting count so calls know they are in an interrupt. The handler runs, possibly calling interrupt-safe functions that mark tasks ready. On exit the nesting count decrements, and if it reaches zero and a higher-priority task is ready, a context switch is requested to run after the return. It is hard because small mistakes in this boundary code (a missed register, a wrong nesting count) cause failures that depend on timing.",
    k: ["Handler written in plain functions with compiler-generated entry versus hand-written assembly entry: compiler entry is easier to maintain, but may save more than needed; assembly is exact and fast and is harder to port and verify.", "Switch decision at every exit versus only at outermost exit: outermost avoids switching in the middle of nested interrupts, which keeps stack use bounded."],
    p: ["Forgetting to request a switch after giving a semaphore from an interrupt, delaying the waiting task until the next tick.", "Nesting count not decremented on an early return path."],
    v: "Release a high-priority task from an interrupt and verify through a trace that the switch happens at interrupt exit, not at the next tick, and nesting count returns to zero after each interrupt.",
    dep: ["vector-table","context-switch","interrupt-safe-apis"]
  },
  "interrupt-safe-apis": {
    s: "The subset of kernel calls designed for interrupt handlers, which never block, use only interrupt-masking for protection and report whether a higher-priority task was woken.",
    d: "Normal kernel calls may block or run the scheduler; those cannot be used in an interrupt because there is no task to block. Interrupt versions return immediately with a result if the operation cannot complete, and instead of switching, report whether a higher-priority task became ready so the handler can request a switch at exit. Only a defined set of calls (give, send, notify, set bits) is available. It is hard because calling a non-interrupt version from an interrupt is easy to do by mistake and the failure is data corruption, not an error code.",
    k: ["Separate interrupt versions of each call versus one call that detects context: separate calls are fast and explicit, but easy to misuse; detecting context is convenient and costs a check on every call.", "Allowing kernel calls in all interrupts versus only those below a threshold: threshold restricts careless use, but demands correct priority assignment."],
    p: ["Calling a blocking send from an interrupt, which waits forever or corrupts kernel lists.", "Ignoring the woken-higher-priority flag so a task is delayed until the next tick."],
    v: "Enable the kernel's context assertions and run all interrupt handlers, confirming no non-interrupt function is called from an interrupt context and each handler passes its woken flag to the exit path.",
    dep: ["interrupt-masking","isr-entry-and-exit"]
  },
  "deferred-interrupt-handling": {
    s: "Splitting interrupt work in two: a very short handler that captures the event and wakes a task, which does the long processing at task priority where it can be scheduled and preempted.",
    d: "The interrupt handler clears the source, copies or notes the minimal data, and signals a task through a notification or queue. The task, at a priority set by the work's deadline, processes the data, can block, and can be preempted by more urgent work. This keeps interrupt time short and the worst-case latency of other interrupts low. It is hard because it adds a wake-up and scheduling delay to the response, and bursts must be buffered so no event is lost before the task runs.",
    k: ["Process in the handler versus defer to a task: handler processing is the fastest response but lengthens interrupt time for everything else; deferral adds delay but keeps the system schedulable.", "Task per interrupt source versus one shared task: one task per source gives separate priorities and isolation, but costs a stack per source."],
    p: ["Doing a long copy or a computation in a handler, raising every other interrupt's latency.", "A deferred task whose queue fills during a burst and drops events silently."],
    v: "Fire the interrupt at its maximum rate, measure the longest handler duration and the interrupt-to-task time, and confirm both fit their budgets and no events are lost.",
    dep: ["task-notifications","message-queues","isr-entry-and-exit"]
  },
  "nested-interrupts": {
    s: "Allowing a higher-priority interrupt to preempt a running lower-priority handler, which reduces latency for urgent sources and adds stack use and ordering hazards.",
    d: "When nesting is allowed, the controller delivers a higher-priority interrupt while a lower one is running, saving another context. Stack depth grows with the nesting level, so the interrupt stack is sized for the worst chain. The worst-case latency of a low-priority interrupt now includes all higher ones that can interrupt it. It is hard because each additional level multiplies the combinations to analyze, and handlers that share data must protect it against higher-priority preemption.",
    k: ["Nesting enabled versus disabled: enabled keeps the latency of urgent sources low regardless of lower handlers, but adds stack and analysis cases; disabled is simple, with latency including the longest running handler.", "Many levels versus few: many levels allow precise ordering, but deepen nesting; few levels limit stack and analysis effort."],
    p: ["Nested handlers sharing a variable with no protection, producing rare corruption.", "Interrupt stack sized for one level and overrun by a rare three-level nest."],
    v: "Trigger all interrupt sources at their maximum rates simultaneously, measure peak interrupt stack use and each source's latency, and confirm both are within the analysis bounds.",
    dep: ["interrupt-controller-and-priorities","interrupt-latency-budget"]
  },
  "interrupt-masking": {
    s: "Temporarily disabling interrupts, or those below a priority threshold, to protect data shared with handlers, kept as brief as possible because it directly adds to interrupt latency.",
    d: "Code enters a critical section by raising the mask, does a few instructions, and restores the previous mask. Nesting is handled by saving and restoring the old state instead of unconditionally enabling. Kernel code uses it for list updates and counters. The longest masked interval in the whole system, including application code, is the worst-case added latency for every masked interrupt. It is hard because that figure is an emergent property: any code anywhere can lengthen it.",
    k: ["Mask by threshold versus mask all: threshold keeps urgent interrupts running, but needs controller support; mask all is universal and affects every source.", "Short critical section with copying versus lock held longer: copy out and release quickly shortens masking, but costs extra code and memory."],
    p: ["Restoring interrupts to enabled instead of the saved state, turning interrupts on inside code that had them off.", "A debug print inside a masked section stretching it to milliseconds."],
    v: "Instrument entry and exit of every masked section with a cycle counter in a stress run, report the maximum, and confirm it is below the interrupt latency budget.",
    dep: ["interrupt-controller-and-priorities"]
  },
  "interrupt-latency-budget": {
    s: "The calculated and measured upper bound on the time from a hardware event to the first useful instruction of its handler, as a sum of masking, entry and preemption terms.",
    d: "Latency = longest period during which the source is masked + hardware entry time (finishing the current instruction, stacking registers) + higher-priority handlers that run first + handler prologue. For deferred work, response adds the wake-up and scheduling of the task. Each term is bounded by analysis and checked by measurement with an external signal. It is hard because the largest term is usually somewhere nobody looked: a masked section in a driver, or a slow memory access when the handler's code is in flash.",
    k: ["Short masked sections system-wide versus relying on hardware priorities: short sections help all sources, but need discipline everywhere; priorities protect only the most urgent ones.", "Handler code in fast memory versus flash: fast memory removes wait states and contention, which tightens the bound but uses scarce memory."],
    p: ["Measuring the typical latency and quoting it as the bound, then missing the rare worst alignment.", "Forgetting the time for hardware entry and cache misses on first execution."],
    v: "Drive the interrupt line from a signal generator at random times under maximum system load and measure from line edge to handler output pin on a logic analyzer, and compare the maximum with the computed bound.",
    dep: ["interrupt-masking","nested-interrupts","isr-entry-and-exit"]
  },
  "mpu-region-management": {
    s: "Configuring the memory protection unit's regions, with base, size and permissions, so each task can access only its own memory, reconfigured at every context switch.",
    d: "The protection unit holds a small number of regions, each with an address range, access rights and attributes. The kernel keeps a region set per task and loads it when switching to that task. Common regions: the task's code, its stack, its private data, and shared buffers. Hardware enforces them on every access at no extra cost, and a violation raises a fault. It is hard because the number of regions is small and alignment rules strict, so memory layout must be planned around them, and reloading regions adds to switch time.",
    k: ["Per-task region sets reloaded at each switch versus one fixed map: per-task gives real isolation between tasks, but adds switch cost; a fixed map separates only kernel from application.", "Few coarse regions versus many fine: coarse needs little configuration and may allow more than intended, and fine gives tight isolation but is limited by region count."],
    p: ["A region wrongly sized by alignment rules, granting access to adjacent memory.", "Regions not reloaded for one task type, so it keeps the previous task's access."],
    v: "From each task, attempt reads and writes to every other task's data and to kernel memory on the running board, and confirm each access faults and the allowed accesses succeed.",
    dep: ["task-memory-domains","linker-placement","context-switch"]
  },
  "privilege-separation": {
    s: "Running application tasks in an unprivileged processor mode and the kernel in privileged mode, so tasks cannot change protection settings, disable interrupts or touch kernel state directly.",
    d: "The processor has at least two modes. Unprivileged code cannot write the protection unit, the interrupt controller or system registers; attempts fault. Tasks reach kernel services only through defined entry points that raise the privilege. The kernel's own memory is marked inaccessible to unprivileged code. Some tasks, such as trusted drivers, may stay privileged. It is hard because it forces every kernel service to have a safe entry point and means unprivileged code cannot do things it formerly did, such as masking interrupts.",
    k: ["All tasks unprivileged versus a mix: all unprivileged gives the cleanest isolation, but drivers need access through gates; mixing is easier to port and widens what a faulty trusted task can damage.", "Privileged kernel with unprivileged drivers versus the reverse: unprivileged drivers contain faults, but pay for each access to hardware through a gate."],
    p: ["Leaving a task privileged for convenience and later putting untrusted code in it.", "An application that disables interrupts directly, failing at once when moved to unprivileged mode."],
    v: "From an unprivileged task, try to write a protection register and mask interrupts directly on the target, and confirm each attempt faults and is reported by the fault handler.",
    dep: ["system-call-gate","mpu-region-management"]
  },
  "system-call-gate": {
    s: "The controlled entry point by which unprivileged tasks request kernel services, validating arguments and raising privilege only for the duration of the call.",
    d: "A task executes a trap instruction with a service number and arguments. The kernel entry code switches to privileged mode, checks the service number, validates every pointer argument against the caller's regions and every handle against its permissions, performs the operation and returns, restoring the lower privilege. Each call costs more than a plain function call. It is hard because argument validation must be complete: any unchecked pointer lets a task read or write kernel memory through the kernel's own rights.",
    k: ["Validate all arguments at the gate versus trust wrappers: complete validation closes the boundary against any task code, but costs time in every call; trusting wrappers is fast and open to a hand-made call.", "Gate on every kernel call versus only protected ones: all calls through the gate give uniform safety but add overhead to simple operations."],
    p: ["A service that accepts a pointer without checking that the caller may access it, acting as a write gadget.", "A privilege level that is not restored on an error path, leaving the task privileged."],
    v: "Call each service from an unprivileged task with invalid pointers, out-of-range numbers and forbidden handles, and confirm every call is rejected with an error and no kernel state changes.",
    dep: ["privilege-separation","kernel-object-permissions","mpu-region-management"]
  },
  "task-memory-domains": {
    s: "Groups of tasks that share a set of memory regions and permissions, giving isolation between groups and convenient sharing inside them.",
    d: "A domain defines which regions its tasks may use: code, data, stacks and shared buffers. Tasks in the same domain see each other's data; tasks in different domains see only declared shared regions. Domains map to subsystems of different integrity or origin, such as third-party code. The configuration is made at build time so the kernel needs no run-time policy. It is hard because granularity is a tradeoff: too few domains leave tasks able to corrupt each other, and too many exhaust the protection unit's regions.",
    k: ["Domain per task versus per subsystem: per task gives the strongest isolation, but needs many regions and explicit sharing; per subsystem reduces region use and allows interference inside the group.", "Static domains versus changeable at run time: static can be verified fully, and dynamic supports loading new code but needs run-time checks."],
    p: ["A shared buffer region left writable by both sides, so a bug on one side corrupts the other.", "Placing two domains' data in one aligned region, so protection covers both."],
    v: "Generate the domain table from configuration and verify with a test per domain pair that cross-domain access is blocked except through declared shared regions.",
    dep: ["mpu-region-management","kernel-configuration"]
  },
  "kernel-object-permissions": {
    s: "Rules stating which tasks may use which queues, semaphores, mutexes and timers, enforced by the kernel when an unprivileged task presents a handle.",
    d: "Each kernel object has an access list or a permission set granted to tasks or domains at creation. When an unprivileged task calls a service with an object handle, the kernel checks that the task has the right for the operation. Objects not granted are inaccessible. Permissions can also be transferred or revoked in some designs. It is hard because checks add cost to each call, and because misconfigured permissions can either block legitimate use or leave open a channel that breaks isolation.",
    k: ["Static permissions set at build versus dynamic grants: static can be analyzed and has no run-time policy code, but cannot adapt; dynamic is flexible and needs careful revocation.", "Per-task versus per-domain permissions: per-task is precise and verbose; per-domain is compact and gives every task in the domain the same rights."],
    p: ["A shared mutex accessible to a low-integrity task, allowing it to block a critical one.", "Permissions granted generously during development and never tightened."],
    v: "For each object, list the tasks with access, then attempt each operation from tasks without access on the target and confirm every attempt is refused and logged.",
    dep: ["system-call-gate","task-memory-domains"]
  },
  "fault-handlers": {
    s: "Code that runs when the processor reports a memory access violation, invalid instruction, bus error or similar fault, identifies the cause and culprit and invokes the configured reaction.",
    d: "On a fault, hardware vectors to a handler with saved context and status registers holding the cause and failing address. The handler determines which task was running, records details for later, and applies the policy: stop the task, restart it, or reset. It must work even if the task's stack is bad, so it uses its own stack. Imprecise bus errors can be reported after the offending instruction, so the culprit may need inference. It is hard because the handler itself must not fault, and must finish quickly and safely.",
    k: ["Handler runs on a dedicated stack versus the faulting task's: dedicated works even after stack overflow, but needs memory and setup; the task stack is simple and fails exactly in the case that matters.", "Stop the task versus the whole system: stopping the task contains damage and keeps service, but leaves state that peers may depend on."],
    p: ["A handler that uses the faulting task's stack after the fault came from a stack overflow.", "Misreading an imprecise bus error as belonging to the task that was running after it."],
    v: "Trigger each fault type on the target (bad pointer, misaligned access, undefined instruction, stack overflow) and confirm the handler logs the right cause, address and task, and carries out the reaction in the policy.",
    dep: ["vector-table","fault-and-restart-policy","safe-state-and-recovery"]
  },
  "safe-state-and-recovery": {
    s: "The defined, bounded sequence that puts outputs in a harmless condition after an unrecoverable fault and then either halts or restarts the system in a known state.",
    d: "Each output has a defined safe value (valve closed, motor off, brake applied) and the transition is done by simple code or by hardware that needs no software to act. After reaching it, the system reports the fault and either stays there or resets and runs a startup self-check before resuming. Recovery code runs when memory and state may be damaged, so it is minimal and uses no dynamic services. It is hard because safe depends on the application, and because an output being driven by hardware independent of the faulty software is the only truly reliable form.",
    k: ["Hardware-defined safe outputs versus software-driven: hardware needs no working software, but limits what safe can mean; software can do richer shutdown but depends on the failed system.", "Fail-stop versus fail-operational: fail-stop is simple and always safe where stopping is safe; fail-operational needs redundancy to keep functioning when a part fails."],
    p: ["A safe-state routine that waits on a mutex held by the faulted task.", "A restart that re-enables outputs before the self-check completes."],
    v: "Induce each unrecoverable fault on the target and measure on the outputs that the safe values are reached within the specified time and persist until the defined recovery completes.",
    dep: ["hardware-watchdog-driver","fault-handlers"]
  },
  "hardware-watchdog-driver": {
    s: "The driver for the independent watchdog timer that resets the processor if software does not service it in time, with settings locked so a faulty program cannot disable it.",
    d: "The watchdog counts down on its own oscillator and resets the device at zero unless serviced. The driver configures the timeout and window, and starts it; once started it cannot be stopped on most parts. Servicing happens only from the supervisor task after its checks pass. Reset cause registers let the next startup know a watchdog reset occurred. It is hard because the timeout must be long enough for the slowest legal path and short enough for a safe reaction, and some resets happen while debugging or sleeping unless handled.",
    k: ["Window watchdog versus plain timeout: a window also catches code running too fast, but demands service in a narrow interval; plain is easy to satisfy and misses runaway loops containing the service call.", "Independent oscillator versus system clock: independent keeps working if the main clock fails, but is less accurate."],
    p: ["Watchdog disabled in debug builds and never re-enabled in release testing.", "Servicing from several places so a stuck task cannot be detected."],
    v: "Stop servicing on the running device and measure time to reset with an oscilloscope, confirm it matches the configured value, and that the reset cause is read and logged after restart.",
    dep: ["startup-code","clock-and-memory-init"]
  }
});
