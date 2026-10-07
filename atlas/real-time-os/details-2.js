// Details for the real-time OS plate, part 2: middleware, scheduling, tasks and synchronization.
ATLAS.details("real-time-os", {
  "flash-file-system": {
    s: "A file system designed for small flash devices that stores files with bounded-time operations, survives power loss mid-write and spreads wear across the medium.",
    d: "It organizes data in blocks that match flash erase units, keeps metadata in a log or copy-on-write structure so a half-finished update is never the only copy, and recovers a consistent state at mount by scanning or replaying. Operations take locks and may erase or program flash, which can stall for milliseconds. Real-time use requires bounding those stalls and running the file system in a low-priority task. It is hard because flash erase can block reads on the same chip, so a write can delay a critical task that merely reads code or data.",
    k: ["Copy-on-write log versus in-place update with journal: copy-on-write gives atomic updates and natural wear spreading, but needs spare space and a cleaning pass; in-place is compact but riskier.", "Mount-time scan versus stored checkpoints: scanning needs no extra writes but takes longer as the device fills; checkpoints mount fast but add write amplification."],
    p: ["A long erase stalling instruction fetch from the same flash bank and delaying a high-priority task.", "Power loss during metadata update leaving an unmountable volume because no atomic commit existed."],
    v: "Cut power at random points during a write loop thousands of times and confirm the volume always mounts, every committed file is intact, and the worst blocking time seen by a high-priority task stays within its budget.",
    dep: ["flash-wear-leveling","flash-and-nvm-driver","mutexes"]
  },
  "flash-wear-leveling": {
    s: "A layer that spreads writes and erases across all flash blocks, remaps worn or bad blocks and tracks erase counts so no block reaches its endurance limit early.",
    d: "A mapping from logical to physical blocks lets frequently updated data move, and an erase count per block guides where to write next. Static data is occasionally moved so that blocks holding it also take their share of wear. Bad block tables hide failed blocks. Garbage collection reclaims space, and each pass erases blocks and copies live data. It is hard because collection is bursty and can delay writes unpredictably, and the controller state must itself survive power loss.",
    k: ["Dynamic versus static wear leveling: dynamic only rotates free blocks, which is simple, but data that never changes keeps its blocks fresh while others wear out; static also moves cold data at the cost of extra erases.", "Foreground collection versus background: background keeps writes fast, but needs idle time that a busy system may not have."],
    p: ["A logging task writing the same few blocks every second until they fail, because no leveling was used.", "Collection running at the worst moment, so one write takes hundreds of milliseconds."],
    v: "Write at the product's worst-case rate for a simulated lifetime on a flash with accelerated wear, and confirm the spread of erase counts across blocks stays within the target ratio and that the longest write stays bounded.",
    dep: ["flash-and-nvm-driver"]
  },
  "network-stack": {
    s: "A protocol stack for network communication sized for small devices, with preallocated buffers, bounded queues and its own task, whose work must be given a priority below the control tasks.",
    d: "A driver passes frames to a stack task that processes link, internet and transport layers, and the application uses sockets or callbacks. Buffers come from fixed pools so allocation is constant time and exhaustion drops packets rather than blocking. Timers drive retransmission and connection cleanup. For real-time use, traffic is limited so network bursts cannot starve control work, and time-critical data can bypass the full stack. It is hard because incoming traffic is controlled by others: a flood or a malformed packet arrives at the stack's pace, not the device's.",
    k: ["Zero-copy buffer passing versus copying: zero-copy saves time and memory but demands strict ownership rules; copying is simple and safe but costs processor time and doubles memory.", "Stack in its own task versus in the driver's interrupt context: a task keeps interrupts short and the work schedulable, but adds a switch and queue delay."],
    p: ["A broadcast flood filling the buffer pool and starving the control path of buffers.", "A stack task at a high priority that turns network load into control-loop jitter."],
    v: "Send a flood of packets at line rate to the device while a control loop runs, and confirm the control loop's jitter is unchanged and that the stack drops excess packets rather than blocking.",
    dep: ["can-and-ethernet-drivers","memory-pools","message-queues","software-timers"]
  },
  "fieldbus-stacks": {
    s: "Protocol implementations for industrial and vehicle buses that carry scheduled and event messages with defined latency, layered over the controller drivers.",
    d: "These stacks take frames from a bus controller and map them to signals and services for the application. Some are time-triggered, sending messages in fixed slots from a shared clock; others are priority-arbitrated and rely on message identifiers for ordering. The stack handles addressing, segmentation of long messages, error counters and bus-off recovery. It is hard because bus timing is part of the system's real-time behavior: transmit queue depth, arbitration loss and retransmissions add latency that task analysis must include.",
    k: ["Time-triggered versus event-triggered traffic: time-triggered gives exact repeatable latency and easy analysis, but wastes bandwidth and needs global configuration; event-triggered is flexible but its latency depends on load.", "Stack in interrupt versus in task: interrupt handling reduces delay for each frame, but lengthens interrupt time and harms other deadlines."],
    p: ["A node that goes bus-off after errors and silently stops sending without any application notice.", "A transmit queue that fills during a burst and drops a high-priority message."],
    v: "Run the bus at its design load plus injected errors and confirm each message's measured latency, taken from a bus analyzer, stays within the specified maximum and error recovery completes in the stated time.",
    dep: ["can-and-ethernet-drivers","message-queues","software-timers"]
  },
  "usb-device-stack": {
    s: "A stack that lets the device appear to a host as a standard class, such as storage or serial, handling enumeration and transfers on strict host-driven timing.",
    d: "The stack answers the host's enumeration requests, then moves data through endpoints using buffers filled by direct memory access or by interrupts. The host schedules the traffic, so the device must respond within the protocol's time limits regardless of its own load. Class drivers on top turn endpoints into storage, serial or other interfaces. It is hard because the host controls the timing, and a late response during enumeration or a transfer can make the host reset the device.",
    k: ["Event handling in interrupt versus in a task: interrupt handling meets protocol timing most easily, but lengthens interrupts; a task keeps them short, but needs a high enough priority to meet host timing.", "Large endpoint buffers versus small: larger buffers decouple the application from host timing, but consume scarce memory."],
    p: ["A high-priority task running too long and missing the host's response limit, causing a disconnect.", "Unplugging mid-transfer leaving buffers owned by hardware that is never released."],
    v: "Connect to a host, enumerate, transfer a large file under full application load and confirm no resets, no timeouts in the host's protocol analyzer, and correct recovery after a forced unplug.",
    dep: ["deferred-interrupt-handling","dma-drivers","memory-pools"]
  },
  "secure-storage-and-crypto": {
    s: "Services for encryption, signing, key storage and random numbers, typically using hardware accelerators, with timing that does not leak secrets and does not block control tasks.",
    d: "Applications request operations such as verifying an update signature or protecting stored data. The service uses a hardware accelerator when present, and software otherwise, and keeps keys in protected storage not readable by application code. Operations may take milliseconds, so they run in a low-priority task or use asynchronous completion. Constant-time implementations avoid leaking secrets through timing. It is hard because heavy computation competes with deadlines, and because key handling errors are invisible until an attack.",
    k: ["Hardware accelerator versus software: hardware is fast and frees the processor, but needs a driver, concurrency control and resists bad inputs only if used correctly; software is portable but slow and uses processor time.", "Synchronous call versus asynchronous with completion callback: synchronous is simple but blocks the caller for the whole operation; asynchronous keeps the caller responsive at the cost of more states."],
    p: ["A signature check run at a high priority, stalling a control loop for tens of milliseconds.", "Keys placed in ordinary memory where a faulty task could read them."],
    v: "Verify a signature during a running control loop and confirm the loop's worst response is unchanged, and that a task outside the service cannot read the key region on the protected build.",
    dep: ["task-memory-domains","mutexes","dma-drivers"]
  },
  "logging-service": {
    s: "A bounded, non-blocking way for tasks and interrupts to record messages, buffering them for a low-priority task to write out so logging never delays real-time work.",
    d: "Callers write a compact record (an identifier and a few values, not formatted text) into a lock-free or interrupt-safe ring buffer. A low-priority task formats and sends records to a serial port, file or network. When the buffer is full, records are dropped and counted rather than blocking the caller. Levels and filters limit volume. It is hard because logging is the most common cause of timing change: formatted text in a high-priority path can cost more than the work being logged.",
    k: ["Binary compact records versus formatted text at the call site: binary costs few cycles and little memory but needs a host decoder; text is readable but slow and large.", "Drop on full versus block on full: dropping preserves timing but loses messages; blocking keeps all of them but lets a slow log sink stall the system."],
    p: ["Calling a formatting function with floating-point or heap use from an interrupt handler.", "Writing logs synchronously to a slow serial port inside a critical task."],
    v: "Log at the maximum rate from a high-priority task and an interrupt while a logic analyzer measures the task's period; confirm no change in jitter and that the drop counter reports lost records accurately.",
    dep: ["message-queues","interrupt-safe-apis","stream-and-message-buffers"]
  },
  "command-shell": {
    s: "A text interface over a serial or network link for inspecting and controlling a running device: listing tasks, reading counters and invoking test commands.",
    d: "A low-priority task reads characters, parses lines against a table of commands and runs the matched handler. Typical commands list tasks and stack marks, show load, read and write memory or registers, and trigger diagnostics. It is invaluable in development and in the field. It is hard to ship safely: commands that write memory or change state are powerful, and the shell, if left enabled, is an entry point for attack and a source of unplanned interference.",
    k: ["Shell enabled in production versus development only: enabled helps field diagnosis, but widens attack surface and adds code; development only is safer but leaves field problems harder to inspect.", "Commands run in the shell task versus posted to application tasks: running locally is simple, but handlers may touch data owned by other tasks; posting respects ownership at the cost of plumbing."],
    p: ["A command that reads a large memory range with interrupts masked, causing a latency spike.", "Debug commands left reachable on a production network port."],
    v: "Run the task-list and stack commands on a running system and compare the output with the trace and a debugger's view; then confirm the production build rejects write commands without authentication.",
    dep: ["task-control-block","stack-usage-monitor","cpu-load-measurement"]
  },
  "reentrant-standard-library": {
    s: "A subset of the standard library whose functions are safe to call from several tasks, with per-task state for items such as error codes, and without hidden heap use.",
    d: "Standard functions often keep hidden global state: an error number, a tokenizer position, a random sequence. Reentrant versions keep that state in the caller's or the task's own storage. Allocation functions are replaced by bounded allocators or removed. Formatted output is given locks or small footprints. The kernel switches the per-task state pointer at each context switch. It is hard because some functions cannot be made both small and safe, and their timing depends on their input, such as printing floating-point values.",
    k: ["Per-task library state versus global state under a lock: per-task avoids blocking but costs memory per task; a lock is small but adds blocking time to a priority analysis.", "Full formatted output versus a small custom formatter: full is complete but large and slow, while a custom one is small, bounded and lacks features."],
    p: ["Two tasks using the library's global error number and reading each other's values.", "A hidden allocation inside a library call, failing after startup when memory is fragmented."],
    v: "Run two tasks that each call the formatting and conversion functions in loops with different inputs, check results against expected output for millions of calls, and confirm no heap allocation is traced.",
    dep: ["task-control-block","bounded-heap-allocators"]
  },
  "priority-preemptive-scheduler": {
    s: "The kernel component that always runs the highest-priority ready task and preempts a lower-priority one the moment a higher-priority task becomes ready.",
    d: "On every event that can change readiness (a timer tick, a released semaphore, a posted message, a task state change) the kernel re-evaluates which task should run. If a higher-priority task is now ready, it requests a context switch, often through a software-triggered exception that runs after interrupts finish. Selection must take constant time, so ready tasks are indexed by priority. It is hard because the scheduler must be correct under every interleaving with interrupts, and its own overhead and critical sections are part of every task's blocking and response time.",
    k: ["Strict preemption versus cooperative switching at yield points: preemption gives bounded response to urgent events, but needs locking everywhere; cooperative is simpler and race-free, but response depends on the longest run between yields.", "Switching inside the interrupt return versus a deferred software exception: deferring keeps interrupt handlers short and uniform, at the cost of one more exception on the path."],
    p: ["A kernel call made with scheduling suspended that takes long and delays every higher-priority task.", "A priority change that does not re-run the selection, leaving the wrong task running."],
    v: "Release a high-priority task from an interrupt while a low-priority task runs and measure on a logic analyzer the time from the interrupt to the first instruction of the high task; confirm it is within the budget over millions of events.",
    dep: ["ready-queues","context-switch","scheduler-lock"]
  },
  "ready-queues": {
    s: "The data structure that holds tasks ready to run, indexed by priority so the next task can be found in constant time, with first-in-first-out order within a level.",
    d: "An array of lists has one list per priority level, plus a bit map where each set bit marks a non-empty level. A count-leading-zeros or find-first-set instruction on the map yields the highest ready priority in a few cycles. Insertion and removal are constant time. Tasks at equal priority rotate by queue order. It is hard because the structure is updated from interrupts and tasks, so every change is inside a critical section whose length is part of the interrupt latency budget.",
    k: ["Bit map plus per-level lists versus one sorted list: the map gives constant-time selection for any number of tasks, but limits the number of priority levels; a sorted list has no such limit but costs time proportional to length.", "Rotation at equal priority versus run to block: rotation shares time fairly among peers, but adds switches; running until blocked is faster but one peer can hog."],
    p: ["Inserting into the ready list from an interrupt without the proper critical section, corrupting the list.", "Using more priority levels than the bit map width, causing silent aliasing."],
    v: "Run a stress test that makes tasks ready and blocked from interrupts and tasks at random for hours, then verify list integrity and that selection time measured on a cycle counter stays constant as ready tasks increase.",
    dep: ["scheduler-lock"]
  },
  "rate-monotonic-assignment": {
    s: "A fixed-priority rule giving shorter-period tasks higher priority, with a known schedulability test, so a periodic set can be proved to meet deadlines before it runs.",
    d: "Priorities are assigned in order of period, with the shortest highest. For independent periodic tasks with deadlines equal to periods, a utilization test gives a sufficient bound, and exact response-time analysis gives a precise answer. When deadlines are shorter than periods, ordering by deadline is optimal among fixed priorities. Blocking and interrupt load are added to the analysis. It is hard because real tasks are not independent or strictly periodic; shared resources, jitter and sporadic events all require extended analysis to keep the proof valid.",
    k: ["Fixed priorities by rate versus dynamic priorities: fixed priorities are simple, predictable under overload and well supported, but can reach full use only for harmonic periods; dynamic priorities use the processor more fully but degrade less predictably.", "Strict rate order versus adjusted for importance: strict order keeps the proof, but may rank a critical, slow task low and need protection from overload."],
    p: ["Assuming the utilization bound guarantees schedulability when blocking was left out.", "A sporadic interrupt-driven task modeled as periodic at its mean rate."],
    v: "Compute response times for the final task table, then run the system under worst-case release alignment (all tasks released together) and confirm no measured response exceeds its computed value.",
    dep: ["priority-preemptive-scheduler","schedulability-analysis"]
  },
  "edf-scheduler": {
    s: "A scheduling policy that always runs the ready task with the nearest absolute deadline, which can use the processor fully for independent tasks but needs deadline tracking in the kernel.",
    d: "Each job gets an absolute deadline when it is released, and the ready structure is ordered by deadline, usually in a sorted list or heap. The scheduler picks the earliest. For independent preemptible tasks it is optimal: if any schedule meets all deadlines, this one does, up to full utilization. Overload behaves badly, since a late job can cause others to miss in a cascade. It is hard because insertions take time that grows with the number of ready jobs, and because shared resources need their own protocols.",
    k: ["Earliest deadline versus fixed priority: deadline ordering allows higher utilization, but its overload behavior is harder to predict and its tooling less common; fixed priority degrades more predictably.", "Sorted list versus heap for ready jobs: a list is simple and fast for few tasks, but a heap scales better in insertion time while costing more code."],
    p: ["An overrun in one task causing a chain of missed deadlines across unrelated tasks.", "Using priorities-per-task tooling and analysis on an earliest-deadline system, so analysis does not apply."],
    v: "Load a task set to ninety-five percent utilization that a fixed-priority system would fail, confirm all deadlines are met, then overload it deliberately and observe the defined overload handling.",
    dep: ["priority-preemptive-scheduler","tick-counter","schedulability-analysis"]
  },
  "time-slicing": {
    s: "Rotating the processor among ready tasks of equal priority at each timer tick, so none of them starves when no task blocks.",
    d: "At each tick, if another ready task exists at the running task's priority, the kernel moves the running task to the end of that level's queue and runs the next. The slice length is normally one tick. It does not affect tasks of different priority, since higher ones always preempt. For hard timing, equal-priority tasks have a response bound that includes the others' slices. It is hard because slicing gives no guarantees between peers, and adds a switch every tick that costs time and disrupts caches.",
    k: ["Time slicing enabled versus disabled: enabled shares time among peers and helps background work, but adds switches and makes timing between peers depend on tick length; disabled makes equal-priority tasks run to block, which is more predictable.", "Slice of one tick versus longer: one tick is simple, but a longer slice cuts overhead and delays peers more."],
    p: ["Two equal-priority tasks that were assumed to run in sequence interleaving unexpectedly.", "Slicing on a critical level so a deadline-bound task is interrupted by a peer."],
    v: "Run two equal-priority compute tasks and confirm from the trace that they alternate once per tick with the slicing enabled, and run the first to block with it disabled.",
    dep: ["priority-preemptive-scheduler","tick-counter","ready-queues"]
  },
  "priority-inheritance": {
    s: "A protocol in which a task holding a lock temporarily takes the priority of the highest-priority task waiting for it, so a medium-priority task cannot indefinitely delay the waiter.",
    d: "Priority inversion occurs when a high-priority task waits on a lock held by a low-priority task, and a medium task preempts the holder, delaying the high task for as long as the medium runs. With inheritance, the holder runs at the waiter's priority until it releases the lock, then returns to its own. Chains of locks require transitive inheritance. It is hard because it adds work to every lock operation and to priority changes, and it bounds but does not remove blocking: the waiter still waits for the holder's critical section.",
    k: ["Inheritance versus ceiling protocol: inheritance acts only when contention occurs and needs no advance knowledge, but permits chained blocking and deadlock; ceiling needs known lock users but bounds blocking to one section.", "Inheritance built into the mutex versus separate: built in is automatic and hard to forget, but binary semaphores used for signaling must not use it."],
    p: ["Using a binary semaphore for mutual exclusion, which has no inheritance, and getting an unbounded inversion.", "Long critical sections making the inherited-priority interval so long it starves unrelated tasks."],
    v: "Reproduce the three-task inversion scenario, confirm in the trace that the holder's priority rises while the high task waits, and that the high task's blocked time is no more than the holder's critical section.",
    dep: ["mutexes","task-control-block","priority-preemptive-scheduler"]
  },
  "priority-ceiling-protocol": {
    s: "A locking protocol where each lock has a ceiling equal to the top priority of its users and the holder runs at that ceiling, limiting blocking to one critical section and preventing deadlock.",
    d: "At design time the ceiling of each resource is computed from the task table. When a task locks the resource, its priority is raised immediately to the ceiling, so no other user can preempt it and request the lock. Therefore any task is blocked at most once, for at most the longest critical section of lower-priority tasks. The immediate variant needs no waiting queue at all. It is hard because the ceiling table has to be correct and complete, and it requires that all users be known at build time.",
    k: ["Immediate ceiling versus original ceiling: immediate raises priority at lock time, which is simple and cheap and needs no queues; original raises only on contention, which causes fewer needless boosts but needs more kernel logic.", "Ceiling versus inheritance: ceiling gives a tighter, deadlock-free bound with static knowledge, but undeclared lock use silently breaks the guarantee."],
    p: ["A new task using a resource without updating its ceiling, silently voiding the analysis.", "A very high ceiling on a long critical section delaying many unrelated tasks."],
    v: "Generate the ceiling table from the task and resource configuration, then run a test where a low task holds each lock and confirm no task is blocked more than one critical section.",
    dep: ["mutexes","priority-preemptive-scheduler","kernel-configuration"]
  },
  "scheduler-lock": {
    s: "A mechanism that stops task switches, or briefly masks interrupts, to protect kernel data structures and short application sections, whose length counts directly against latency.",
    d: "Two forms exist. A scheduler lock stops preemption while interrupts still run, so tasks can modify shared data but not interrupt-shared data. A critical section masks interrupts, protecting data used by interrupt handlers, and it delays every interrupt. Both nest through a counter. Kernel code uses them for a few cycles, application code should do the same. It is hard because the longest masked section anywhere in the system sets the worst-case interrupt latency for everything.",
    k: ["Masking all interrupts versus only those above a threshold: threshold masking keeps the most urgent interrupts live and bounds latency for them, but needs hardware support and careful priority design.", "Locking the scheduler versus using a mutex: a lock is the cheapest for a few instructions, but stops urgent tasks; a mutex lets them run unless they need the data."],
    p: ["Calling a blocking function while the scheduler is locked, which deadlocks or corrupts state.", "A copy loop inside a masked section that grows with a buffer size and breaks the latency budget."],
    v: "Measure the longest interrupt-masked interval across all code with a cycle counter in a stress run, and confirm it is below the latency budget and matches the figure used in the analysis.",
    dep: ["interrupt-masking","interrupt-latency-budget"]
  },
  "context-switch": {
    s: "The code that saves the running task's registers and stack pointer, selects the next task and restores its state, written to a fixed, short and deterministic path.",
    d: "On a switch request, handler code stores the processor registers (and optionally floating-point registers) on the outgoing task's stack, saves its stack pointer in its control block, asks the scheduler for the next task, loads that task's stack pointer and restores its registers. The switch is performed in a low-priority exception so it never delays interrupts. Its length is constant and part of every response time. It is hard because it is the most hardware-specific code, written in assembly, and a subtle error shows up only under unusual interleavings.",
    k: ["Lazy versus eager saving of floating-point state: lazy saves only for tasks that use it, which speeds switches, but adds a rarely taken path; eager is uniform and simpler but slower for all tasks.", "Full saves of all registers versus caller-saved only: saving less is faster, but only works at known voluntary yield points, not for preemption."],
    p: ["Forgetting to save a register that the compiler uses, corrupting a task only occasionally.", "Switching while an interrupt is nested, returning into the wrong context."],
    v: "Run two tasks that fill all registers with distinct patterns and verify them continuously while a fast timer interrupt forces switches at random points for hours, and measure switch time on a cycle counter.",
    dep: ["architecture-port-layer","task-control-block"]
  },
  "idle-task": {
    s: "The lowest-priority task that runs when nothing else is ready, usually looping or entering a low-power wait, and often hosting cleanup and measurement hooks.",
    d: "The kernel always has a task to run because the idle task never blocks. It typically executes a wait-for-interrupt instruction to save energy until the next event, calls an application idle hook, and may free resources of deleted tasks. CPU load is measured from its time share. It is hard because its hooks run at the lowest priority but with no guaranteed time, so work placed there may be starved, and anything placed there must not block, since blocking idle is a kernel failure.",
    k: ["Wait-for-interrupt in idle versus busy loop: waiting saves large amounts of energy, but adds wake-up latency and changes timing measurements; a busy loop is simplest and gives the fastest response.", "Cleanup in idle versus in the deleting task: idle keeps deletion cost off the critical path, but delays reuse of memory when the system is never idle."],
    p: ["A hook that blocks or runs long, delaying the freeing of deleted tasks.", "A system that is never idle, so idle-hosted cleanup never runs and memory leaks."],
    v: "Measure the idle share under a known load, confirm it matches the computed figure, and confirm the processor enters its wait state from the current drawn with a power analyzer.",
    dep: ["priority-preemptive-scheduler","idle-hook"]
  },
  "multicore-scheduling": {
    s: "Extending scheduling to several processor cores, by pinning tasks to cores or by migrating them, with locks that work across cores and analysis that covers shared resources.",
    d: "Partitioned scheduling gives each core its own task set and ready queue, so each core can be analyzed as a single processor, with cross-core communication through queues and shared memory. Global scheduling uses one queue for all cores, balancing load but making analysis harder and migrations costly. Cross-core locks use spin locks or inter-core interrupts. It is hard because cores share memory buses and caches, so one core's activity changes the other's timing, and standard single-core proofs no longer apply.",
    k: ["Partitioned versus global scheduling: partitioned is analyzable and keeps caches warm, but may leave capacity unused; global balances load, but migration costs and proofs are harder.", "Spin locks versus blocking across cores: spinning is fast for very short sections, but wastes the spinning core's time and creates a bound that depends on the other core's behavior."],
    p: ["Assuming single-core response analysis holds when another core saturates the shared memory bus.", "A lock held across a long section on one core while another spins at high priority."],
    v: "Run each core's critical tasks alone and then with maximum load on the other cores, and confirm the measured worst-case times grow by no more than the interference allowance in the analysis.",
    dep: ["priority-preemptive-scheduler","interrupt-controller-and-priorities","cache-and-dma-buffers"]
  },
  "task-control-block": {
    s: "The kernel's record of a task: saved stack pointer, state, priority, wait information and list links, from which the kernel reconstructs everything it needs to run, block or wake the task.",
    d: "Each task has one control block, in static memory or allocated at creation. It holds the saved stack pointer, current and base priority, state, the object it waits on and a timeout, links into ready, delay or wait lists, and optional fields for notifications, run time and library state. Kernel code reads and writes it from many paths, including interrupts. It is hard because the fields have to remain consistent through every transition, and the structure's layout is known by assembly code in the context switch.",
    k: ["Static control blocks versus allocated at run time: static avoids allocation failure and is easy to inspect, but fixes the task count; allocation allows dynamic creation at the cost of failure paths.", "Compact fields versus optional features in every block: compact saves memory per task, but optional fields make some features unavailable unless configured in."],
    p: ["Assembly code reading a field at a hard-coded offset after the structure was changed.", "Reusing a deleted task's block while a stale handle still refers to it."],
    v: "Inspect the control blocks in a debugger after tasks block, wake and change priority, and confirm the state, lists and priority fields match the trace's account of each task.",
    dep: ["static-kernel-objects"]
  },
  "task-lifecycle": {
    s: "The states a task passes through, such as ready, running, blocked, suspended and deleted, and the rules for creating, starting, suspending and removing tasks safely.",
    d: "A task is created with an entry function, priority and stack, becomes ready, runs when selected, and blocks when it waits for an object or time. It can be suspended explicitly and resumed, and it may delete itself or be deleted. Transitions move the control block between lists, and each is bounded in time. Deleting a task that holds locks or buffers is dangerous, so many systems forbid it after startup. It is hard because asynchronous deletion leaves resources owned by a task that no longer exists.",
    k: ["Tasks never deleted versus deletable: never deleted keeps the system analyzable, but cannot reclaim stacks; deletable supports dynamic features at the cost of resource-ownership rules.", "Task cooperates in its own shutdown versus kernel kills it: cooperative shutdown releases resources cleanly, but a hung task cannot comply; forced deletion always works and leaves held resources."],
    p: ["Deleting a task that holds a mutex, leaving every waiter blocked forever.", "Suspending a task from another while it is in the middle of a critical operation."],
    v: "Cycle a task through create, block, suspend, resume and delete in a loop for hours, and confirm from kernel statistics that the memory in use and object counts return to their start values each cycle.",
    dep: ["task-control-block","ready-queues"]
  },
  "message-queues": {
    s: "A bounded first-in-first-out channel of fixed-size messages between tasks or from an interrupt to a task, with blocking and timeout on both send and receive.",
    d: "A queue owns a storage area of a set number of fixed-size slots. A sender copies a message in; a receiver copies it out. If the queue is full or empty, callers may block for a bounded time, and the kernel keeps lists of waiters ordered by priority. Interrupt versions never block. Copying keeps ownership clear. It is hard because capacity decides behavior under overload: a full queue forces a choice of dropping, blocking or overwriting, and the choice must match what the receiver can tolerate.",
    k: ["Copy of the message versus pass of a pointer: copying avoids ownership problems and suits small messages, but costs time and memory for large ones; pointers are fast but need clear lifetime rules.", "Block when full versus drop or overwrite: blocking preserves every message but couples sender timing to the receiver; dropping decouples them and loses data."],
    p: ["A queue sized for the average rate that overflows during a burst and loses the one message that mattered.", "A high-priority sender blocking on a full queue held up by a low-priority receiver."],
    v: "Fill the queue from an interrupt at the maximum rate while the receiver is delayed, and confirm that the overflow handling fires as specified, that no message is corrupted and that sender blocking stays within its bound.",
    dep: ["task-control-block","interrupt-safe-apis","timeouts-and-delay-lists"]
  },
  "semaphores": {
    s: "A counter-based object for signaling and resource counting, where giving increments the count and taking waits until it is positive, usable from interrupts to wake a task.",
    d: "A binary semaphore signals an event, for example from an interrupt that tells a task data has arrived. A counting semaphore tracks available items, such as free buffers. Taking blocks the caller with a timeout if the count is zero; giving wakes the highest-priority waiter. Unlike a mutex, the giver need not be the taker, so no ownership or inheritance applies. It is hard because misuse as a lock produces unbounded priority inversion and because lost or repeated signals change counts silently.",
    k: ["Binary versus counting semaphore: binary collapses repeated events into one, which is simple but can lose events; counting preserves each, but can overflow its maximum.", "Semaphore versus direct task notification for signaling: a semaphore can be shared by several waiters; a notification is faster and lighter but targets exactly one task."],
    p: ["Using a binary semaphore as a mutex and suffering unbounded priority inversion.", "Giving a semaphore twice before it is taken and losing an event, because the count saturates."],
    v: "Signal from an interrupt at a known rate and confirm the task processes exactly the same number of events over a long run, and that the wake-up latency measured from the interrupt pin stays under its bound.",
    dep: ["task-control-block","interrupt-safe-apis","timeouts-and-delay-lists"]
  },
  "mutexes": {
    s: "A lock for mutual exclusion that has an owner, only the owner can release, and that applies a priority protocol so blocking by lower-priority tasks is bounded.",
    d: "A task takes the mutex before touching shared data and releases it after. If another task holds it, the caller blocks with a timeout. The kernel records the owner so it can apply inheritance or a ceiling, and may support recursive locking by the owner. Mutexes cannot be used from interrupts, which cannot block or own. It is hard because locks create dependencies: nested locks risk deadlock, and a critical section's length goes straight into other tasks' blocking time.",
    k: ["Short critical sections with mutexes versus lock-free structures: mutexes are simple and general, but add blocking terms; lock-free data avoids blocking, but is hard to get right and limited to simple structures.", "Recursive mutexes versus non-recursive: recursive tolerates nested calls, but can hide a design where locking scope is unclear; non-recursive makes double-locking an obvious error."],
    p: ["Taking two mutexes in different orders in two tasks, causing a deadlock.", "Calling a function that blocks (a file write) while holding a mutex needed by a critical task."],
    v: "Run the inversion scenario with three tasks and a mutex, and confirm in the trace that the high task's blocking is limited to one critical section; run a lock-order checker over all lock sites.",
    dep: ["priority-inheritance","priority-ceiling-protocol","task-control-block","timeouts-and-delay-lists"]
  },
  "event-groups": {
    s: "A set of bit flags that tasks can set and wait on in combination, allowing one task to wait for any or all of several conditions, or several tasks to be released together.",
    d: "An event group holds a word of bits, each meaning a condition. Tasks and interrupts set bits; a task waits for any bit or all bits in a mask, optionally clearing them on exit, with a timeout. Setting bits can release many waiters at once, so the time to do so depends on the waiters. It also supports rendezvous, where tasks each set a bit and wait for the full set. It is hard because the set and release time is not constant with many waiters, which matters when done from time-critical code or interrupts.",
    k: ["Event group versus several semaphores: a group waits on a combination in one call, but loses counts and ordering; semaphores keep counts but need one object and a wait per condition.", "Clear bits automatically on wake versus manually: automatic clearing avoids missed resets, but two waiters on the same bit race for it."],
    p: ["Two tasks waiting for the same bit with auto-clear, where only one wakes and the other never does.", "Setting bits from an interrupt with many waiting tasks, lengthening the interrupt unpredictably."],
    v: "Have several tasks wait on different combinations, set bits from tasks and interrupts in all orders, and confirm each task wakes exactly when its condition is met, with release time under its bound.",
    dep: ["task-control-block","interrupt-safe-apis","timeouts-and-delay-lists"]
  },
  "task-notifications": {
    s: "A lightweight signal built into every task's control block, usable as a binary semaphore, counter, flag set or one-word mailbox, faster than a separate kernel object.",
    d: "Because the notification state lives in the receiving task, no object has to be created or looked up. The sender sets, increments or overwrites a value and wakes the task if it is waiting; the task waits and reads the value. It is the cheapest way to wake a task from an interrupt. It has one receiver and no queue, so repeated notifications can overwrite or merge. It is hard because it is so easy to use that it replaces objects where a queue or counting object is needed to avoid losing events.",
    k: ["Notification versus semaphore or queue: notification is faster and needs no memory per object, but has exactly one receiver and does not buffer; objects allow several users and buffering at higher cost.", "Overwrite versus keep-first on a value: overwrite always shows the latest value, which suits state; keep-first preserves the earliest, which suits commands, and one choice is wrong for the other."],
    p: ["Two interrupts notifying one task faster than it runs, merging two events into one.", "Using the notification for two unrelated purposes in the same task and consuming each other's signals."],
    v: "Notify a waiting task from an interrupt at a known rate and measure the wake-up latency on a logic analyzer; confirm it is lower than the same path through a semaphore, and that count equals the number of events.",
    dep: ["task-control-block","interrupt-safe-apis"]
  },
  "stream-and-message-buffers": {
    s: "Byte-stream and variable-length message channels designed for a single writer and single reader, such as an interrupt feeding a task, with very low overhead and no copying beyond one pass.",
    d: "A buffer is a ring of bytes with read and write indices. A stream buffer carries a continuous byte flow, such as serial data, and a receiver can wait for a trigger level of bytes. A message buffer adds a length header for each message, so variable-length frames keep their boundaries. With one writer and one reader, no lock is needed. It is hard because the single-writer, single-reader assumption is easy to break, and breaking it produces rare corruption.",
    k: ["Stream buffer versus fixed-size message queue: stream buffers handle variable data efficiently and cheaply, but allow only one writer and reader; queues allow many users at a higher cost per message.", "Trigger level of one byte versus larger: one byte wakes the reader on every byte, giving low delay but more switches; larger levels cut overhead but add latency."],
    p: ["A second task writing to a buffer designed for one writer, corrupting indices under rare interleavings.", "A reader that waits for a trigger level that never arrives because the sender sends less."],
    v: "Stream data from an interrupt into a task at the maximum line rate for hours, and compare a checksum of received data to what was sent, confirming zero loss and bounded reader latency.",
    dep: ["interrupt-safe-apis","task-control-block"]
  },
  "deadlock-avoidance-rules": {
    s: "A set of design rules, such as a global lock order, no blocking while holding a lock and timeouts on every wait, that make circular waiting impossible or detectable.",
    d: "Deadlock needs four things together: exclusive resources, holding while waiting, no forced release and circular waiting. Rules break one of these. A global order for acquiring locks removes cycles; limiting each task to one lock at a time removes holding while waiting; ceiling protocols prevent it by construction; timeouts turn a deadlock into a detected fault. It is hard because lock orders are implicit and spread across modules, and a new call path can quietly create a cycle that only appears under one timing.",
    k: ["Prevention by lock ordering versus detection by timeout: ordering rules out the failure but needs discipline and a full lock map; timeouts catch anything, but the system must be able to recover from the reaction.", "Single global lock versus fine-grained locks: one lock cannot deadlock and is easy to reason about, but serializes everything and lengthens blocking."],
    p: ["Using infinite timeouts on lock waits, so any deadlock is silent and permanent.", "A callback invoked while a lock is held that takes another lock in the reverse order."],
    v: "Build the lock-acquisition graph from the code or from a run-time trace and confirm it is acyclic; confirm every blocking call in the source has a finite timeout and a handler for its expiry.",
    dep: ["mutexes","priority-ceiling-protocol","timeouts-and-delay-lists"]
  }
});
