// Details for the hardware description simulator plate, part 4: the event-driven kernel.
ATLAS.details("hdl-simulator", {
  "time-wheel": {
    s: "The time-ordered structure that holds scheduled future events and yields the next simulation time at which anything happens.",
    d: "Future events are bucketed by time. A calendar-style wheel handles near-term times in constant time with an overflow structure for distant ones; a heap or tree handles the general case. The kernel repeatedly takes the earliest time, advances the global clock to it, and processes everything scheduled there. Time is an integer count of the smallest precision unit used anywhere in the design, which decides range and rounding. Difficulty: millions of pending events at clock-heavy designs, and keeping insertion cheap since most events are scheduled only a few time units ahead.",
    k: ["Calendar wheel vs binary heap: a wheel is constant time for the common near-term case, while a heap is simpler and uniformly logarithmic.", "Sixty-four-bit integer time vs wider: sixty-four bits is fast and ample at normal precision, but overflows when precision is fine and runs are very long."],
    p: ["A very fine global precision unit makes the integer time overflow or the wheel degenerate.", "Events scheduled at the current time during processing go to the wrong bucket and are skipped."],
    v: "Schedule events at known times in random order and confirm they pop in nondecreasing time order with equal times kept in the specified order, including events inserted during processing.",
    dep: ["event-queues", "time-precision-units"]
  },
  "event-queues": {
    s: "The queues of pending value updates and process wakeups for the current time step, one per scheduling region.",
    d: "Within one time step, the language defines regions processed in order: active, inactive, nonblocking update, observed, reactive and others. Each has a queue. The kernel drains one region, which may add events to the same or other regions, until all are empty, then moves to the next time. Queues must preserve a defined order within a region where the standard specifies one and allow any order where it does not. It is hard because order freedom is a source of simulator differences, and users depend on accidental ordering anyway.",
    k: ["Strict first-in first-out order vs unspecified order: strict is predictable and portable in practice, while freedom lets optimizers reorder.", "Separate queue objects per region vs tagged entries in one queue: separate is clear and cheap to drain, while one tagged queue is compact and harder to maintain."],
    p: ["Code that relies on one tool's event order passes there and fails elsewhere.", "A region drained out of order lets nonblocking updates run before blocking ones finish."],
    v: "Write a test with two processes updating the same signal in the same time step, run under random and fixed ordering options, and confirm the standard-defined parts are identical and only undefined parts vary.",
    dep: ["active-region", "nonblocking-update-region", "delta-cycle-loop"]
  },
  "active-region": {
    s: "The region where blocking assignments, continuous assignment updates and most process execution happen within a time step.",
    d: "Processes woken by changes run here until they suspend, and each change they make schedules new evaluations into the same region. Blocking assignments take effect immediately, so later statements in the same process see the new value. Continuous assignments are re-evaluated as events in this region. Order among ready processes is unspecified. It is hard because the region repeats many times per time step, and a change to a signal in the middle may trigger processes in a sequence the code author did not intend.",
    k: ["Run each process to completion vs interleave statements: run to completion is simple and fast, but process-level atomicity is also what users rely on and not what the standard strictly guarantees in all cases.", "Evaluate continuous assignments eagerly vs lazily: eager gives immediate propagation, while lazy batches and can skip intermediate changes."],
    p: ["Blocking assignments for sequential logic create races that depend on process order.", "A zero-delay loop between two processes never leaves this region and hangs the simulation."],
    v: "Run a pair of processes exchanging a signal with blocking assignments under different process orders and confirm the standard-undefined result varies while a version using the update region does not.",
    dep: ["process-scheduler", "continuous-assignments", "event-queues"]
  },
  "nonblocking-update-region": {
    s: "The region where nonblocking assignments take effect, after all active work in the time step has run, which makes registers update together.",
    d: "A nonblocking assignment evaluates its right side immediately but defers the update. When the active region is empty, the kernel applies all deferred updates at once and the resulting changes wake processes, starting another active round. This models flip-flops capturing values on one clock edge simultaneously, so register order does not matter. The difficulty is the count of deferred updates in a design with many registers, and subtle interplay with intra-assignment delays and with assertion sampling.",
    k: ["Collect all updates then apply vs apply as encountered: collecting gives order independence for registers, but needs a list and a pass.", "Update region per time step vs per delta cycle only: tying to the time step matches the standard, and any variation shows up as race differences."],
    p: ["Mixing blocking and nonblocking assignments to one variable gives order-dependent results.", "A nonblocking assignment with a delay lands in a later time and surprises the author."],
    v: "Build a two-register swap driven by one clock using nonblocking assignments and confirm the values exchange on each edge, and that changing process order does not change the result.",
    dep: ["event-queues", "delta-cycle-loop"]
  },
  "delta-cycle-loop": {
    s: "The repeated sequence of evaluate and update steps inside one simulated time, which settles zero-delay logic before time advances.",
    d: "Zero-delay propagation happens in delta cycles: all active processes run, updates apply, newly sensitive processes run, and so on until nothing changes. Only then does time advance. Delta cycles give a consistent ordering for events that happen simultaneously in model time. They are invisible in simulated time, but a value dump at delta level shows them. A design with a combinational loop or oscillation never settles; the kernel normally detects an iteration limit and aborts. It is hard to make deltas cheap, since a single clock edge may run hundreds.",
    k: ["Report only settled values vs every delta: settled is compact and hides races, while every delta shows exactly how a glitch formed.", "Iteration limit abort vs allowing unbounded delta loops: a limit stops runaway designs with a clear message, but may cut off an intentionally long chain."],
    p: ["A zero-delay oscillation consumes the whole run's time without advancing the clock.", "Delta counts per edge grow with generate-heavy designs and slow the run."],
    v: "Run a zero-delay ring of inverters and confirm the kernel stops at the iteration limit with a message naming the loop; run a legal chain of ten assignments and confirm ten deltas then time advances.",
    dep: ["active-region", "nonblocking-update-region", "process-scheduler"]
  },
  "process-scheduler": {
    s: "Decides which ready process runs next, resumes it and suspends it again when it waits on a time, event or condition.",
    d: "Each always block, initial block, task and testbench thread is a process with a state: running, ready, waiting. When a signal changes, the scheduler marks sensitive processes ready and later runs them. Waiting forms include delays, event controls, wait statements and joins on forked threads. Many designs have hundreds of thousands of processes, mostly waiting on a clock. It is hard to choose cheap dispatch: wakeups on a clock edge touch every process sensitive to it.",
    k: ["Static scheduling order determined at compile time vs dynamic ready queue: static is quick for fixed designs, while dynamic is required for testbench threads that appear at run time.", "Run to the next suspension vs preempt at time slices: run to suspension matches language semantics, and time slicing has no place in the model."],
    p: ["Unbounded forked threads in a testbench loop exhaust memory.", "Processes that never suspend starve every other process in the time step."],
    v: "Fork ten thousand threads that each wait for a clock edge and confirm all resume on the same edge in one time step, with scheduler overhead under a stated per-wakeup cost.",
    dep: ["sensitivity-lists", "process-coroutines", "event-queues"]
  },
  "sensitivity-lists": {
    s: "The record of which signals each process waits on, used to wake only the processes affected by a change.",
    d: "For each signal, the kernel keeps a list of processes waiting on it with the edge or level condition. A change is compared against the condition (any change, rising edge) and matching processes become ready. For combinational blocks the compiler derives the list from the code. The lists are updated dynamically when a process waits on different events over time. It is hard because fan-out can be huge for a clock or reset, and because inferred lists must equal what the language defines, including partial vector and array element rules.",
    k: ["Explicit lists vs inferred lists: explicit is exact and easy to check, while inferred is convenient but depends on the compiler for correctness.", "Per-signal wait lists vs global event bus: per-signal is direct and fast to wake, and global buses are simple and scale poorly."],
    p: ["Missing a signal in a hand-written list simulates correctly but synthesizes differently.", "Edge detection from an unknown value treats a transition as an edge in one tool and not in another."],
    v: "Change one bit of a wide vector watched by a process sensitive to another bit and confirm it does not wake; change the watched bit and confirm it wakes exactly once.",
    dep: ["four-state-values", "event-queues", "syntax-tree"]
  },
  "continuous-assignments": {
    s: "Statements that keep a net equal to an expression at all times, re-evaluated whenever any input changes.",
    d: "Each continuous assignment behaves like a tiny always process sensitive to every operand. The kernel evaluates it as an event in the active region and schedules the net's new value, possibly after a delay. Nets can have several drivers, so evaluation hands off to resolution. Large designs have millions of these, so the evaluator groups them into cheap expression nodes and avoids scheduling work when the result is unchanged. Difficulty is glitches: an expression with reconvergent inputs may produce a transient value across deltas.",
    k: ["Evaluate on every input change vs coalesce per delta: every change is exact, while coalescing avoids redundant work and can hide glitches.", "Evaluate as a process vs as a data-flow node: data-flow nodes are lighter and need their own scheduling path."],
    p: ["A reconvergent path creates a one-delta glitch that a downstream edge-sensitive process mistakes for a clock.", "Zero-delay feedback through continuous assignments never settles."],
    v: "Drive an expression with reconvergent inputs through a simultaneous change and confirm the intermediate delta values match the standard's order or are hidden consistently, and the final value is correct.",
    dep: ["strength-resolution", "event-queues", "net-and-driver-graph"]
  },
  "primitive-and-path-delays": {
    s: "Models of propagation time through gates and cell paths, so gate-level simulation can reproduce timing from a library or annotated file.",
    d: "Gate primitives have rise, fall and turn-off delays, and library cells specify path delays from each input to each output, sometimes depending on state or on the edge. Delays can come from the source, a parameter, or an annotation file after layout. The kernel schedules the output change at the computed time and applies the delay mode to pulses. It is hard because gate-level designs have enormous event counts and because delay data has many variants (minimum, typical, maximum).",
    k: ["Distributed delays on each gate vs lumped path delays: distributed is closer to physical structure, while path delays match library cells and run faster.", "Pessimistic vs optimistic delay selection when conditions are unknown: pessimistic is safe for timing checks, but creates false violations."],
    p: ["Using minimum delays on one path and maximum on another yields combinations that never happen on silicon.", "A pulse narrower than the path delay is dropped without a report."],
    v: "Simulate a library cell with annotated path delays and confirm output edges appear at the annotated times for each condition, and that a narrower input pulse behaves per the selected pulse rule.",
    dep: ["inertial-and-transport-delay", "delay-annotation", "time-wheel"]
  },
  "inertial-and-transport-delay": {
    s: "The two models for what a delay does to a short pulse: inertial delay swallows pulses shorter than the delay, and transport delay passes every change.",
    d: "With inertial delay, a new scheduled change cancels a pending one that has not yet taken effect if the pulse is shorter than the delay, as real gates filter glitches. With transport delay, all changes are delayed unchanged, which models wires. Implementation: the scheduled transaction on a signal is stored with its time, and a later transaction either removes earlier pending ones or keeps them. It is hard because the exact rules for pulse rejection, plus the combination with X-valued pulses, differ by language and need careful matching.",
    k: ["Inertial by default vs transport by default: inertial gives realistic gate behavior, but surprises people expecting every change to pass.", "Rejecting pulses silently vs propagating an unknown pulse: rejecting is the physical model, and propagating unknown flags marginal pulses at a cost in pessimism."],
    p: ["Using inertial delay on a clock path deletes narrow clock pulses and the design stops running.", "Cancelled events leave stale entries in queues and slow later processing."],
    v: "Apply a pulse narrower than the delay, then a wider one, and confirm the narrow pulse vanishes under inertial delay and appears delayed under transport delay, exactly as defined.",
    dep: ["time-wheel", "event-queues", "four-state-values"]
  },
  "process-coroutines": {
    s: "The mechanism that lets a process suspend in the middle of its code and resume later with its local state intact.",
    d: "A process that waits on a clock edge in the middle of a loop needs its stack or state preserved. The simulator provides this with separate stacks (fibers or threads), or by compiling each process into a state machine whose locals live in heap memory. Switching must be cheap because it happens at every wakeup. Stack-based switching is simple for any code, and state machines are compact and fast. The hard part is memory: a million lightweight processes with kilobyte stacks cost gigabytes.",
    k: ["Separate stacks per process vs compiled state machines: stacks handle arbitrary code and nested calls, while state machines use little memory and need compiler support.", "Operating-system threads vs user-level fibers: threads allow parallelism but switch slowly, and fibers switch quickly on one core."],
    p: ["Deep recursion in a testbench task overflows a fixed-size process stack.", "Operating-system threads per process hit system limits at design scale."],
    v: "Create one million waiting processes, record resident memory per process and wakeup throughput, and confirm they stay inside the documented budget and resume with correct local variable values.",
    dep: ["memory-allocator", "worker-thread-pool"]
  },
});
