// Details for the debugger & profiler plate, part 2: execution control, post-mortem and replay.
ATLAS.details("debugger-profiler", {
  "process-launch": {
    s: "Starts a program under debugger control so that it stops before running user code, with the right arguments, environment, working directory and terminal.",
    d: "The debugger creates a child that asks the kernel to be traced, then executes the target program. The kernel stops the child at its first instruction or right after the exec, and the debugger reads the initial registers and module list before resuming. Many setups start the program through a shell for argument expansion, which adds an extra stop to skip. It is hard because the environment must match a normal run, the input and output terminal must be handed over cleanly, and on some systems a dynamic loader runs first and libraries are not yet mapped when the first stop occurs.",
    k: ["Launching through a shell versus direct execution: a shell expands globs and redirections as users expect, but adds an extra process and a stop that must be passed.", "Stopping at the entry point versus at main: the entry point catches early initialization problems, main is where people want to start."],
    p: ["A debugger-set environment variable differs from a normal run, so the bug does not reproduce under the debugger.", "The program reads from a terminal that the debugger also reads, so keystrokes go to the wrong process."],
    v: "Launch a program that prints its arguments, working directory and an environment variable; confirm they equal a normal run's, and the target is stopped at its first instruction with a populated register set and module list.",
    dep: ["process-trace-interface", "debug-event-loop", "process-address-map"]
  },
  "process-attach": {
    s: "Takes control of an already-running process, stops it, discovers its threads and modules, and later releases it intact.",
    d: "The debugger asks the kernel to start tracing a process id, which stops the process and its threads one by one. It then reads the memory map and module list from the target, reads debug information for each module, and builds thread state. Detach removes all inserted breakpoints, restores registers and resumes execution. It is hard because permission checks may refuse the attach, because threads that are created during the attach can be missed, and because a detach after a crash of the debugger must not leave the target stopped or full of breakpoint instructions.",
    k: ["Attaching to all threads at once versus lazily: all at once gives a consistent view, lazy is faster for large processes but races with thread creation.", "Detach that restores memory versus kill on exit: restoring keeps a production process alive, but needs reliable cleanup of every inserted breakpoint."],
    p: ["A debugger killed while attached leaves software breakpoints in the target, which crashes on the next hit.", "A thread created in the instant of attach is never traced and runs free of breakpoints."],
    v: "Attach to a running multi-threaded service, set a breakpoint, detach, and confirm the service keeps serving, its code memory is byte-identical to the file, and no thread remains in a traced state.",
    dep: ["process-trace-interface", "process-address-map", "thread-control"]
  },
  "debug-event-loop": {
    s: "The central loop that waits for the kernel to report that a traced thread stopped, decides what the stop means, and either shows it to the user or resumes silently.",
    d: "It blocks on a wait call that returns a stop reason: breakpoint trap, single-step completion, signal, thread start or exit, library load, fork or exec, or process exit. For each it identifies the thread, reads its registers and consults the breakpoint table. Internal events, such as a step-over breakpoint or a library-load notification, resume without telling the user. It is hard because events from many threads arrive in any order, events can be queued while another is handled, and a missed or double-handled event leaves a thread stopped forever.",
    k: ["Reporting each event as it arrives versus batching: immediate is simple, batching reduces churn when many threads hit the same breakpoint.", "A single event loop thread versus one per target: a single loop is simple and avoids races, and per-target threads scale to many sessions."],
    p: ["Two threads hit one breakpoint at once, and one event is forgotten, so that thread stays stopped.", "A stop reported for a thread the debugger believes already exited corrupts the thread table."],
    v: "Run a program in which eight threads hit one breakpoint simultaneously; confirm eight stop events are processed exactly once, each thread is listed with its own stop reason, and all resume correctly.",
    dep: ["process-trace-interface", "signal-delivery", "breakpoint-table"]
  },
  "breakpoint-table": {
    s: "The record of every user-requested stop point: its location spec, condition, state and the set of resolved addresses where it is currently inserted.",
    d: "Entries start from a location expression such as a function, a file and line, or an address. The debugger resolves each into addresses, which may be many for an inlined or templated function, and updates them as libraries load or reload. Inserted addresses are tracked separately from user entries, so two entries can share one address. On a stop, a hit lookup finds the entry, evaluates its condition and ignore count, then runs actions. It is hard because resolution changes while running, and breakpoints can be pending on code not yet loaded.",
    k: ["Keeping user breakpoints separate from inserted locations: one request can map to many addresses, but state must be reconciled on every load.", "Re-resolving on every module event versus once: re-resolving keeps breakpoints correct after reloads, at a cost on programs with many libraries."],
    p: ["A pending breakpoint in a library that loads later never binds because the location was misspelled and silently accepted.", "Two breakpoints on one address are removed together, so deleting one disables the other."],
    v: "Set a breakpoint on a function in a library not yet loaded, then run; confirm it becomes resolved when the library loads, stops there, and deleting a second breakpoint on the same address leaves the first working.",
    dep: ["symbol-lookup", "line-table-decoder", "software-breakpoints", "hardware-breakpoints"]
  },
  "software-breakpoints": {
    s: "Replaces an instruction with a trap instruction in the program's memory, so execution transfers to the debugger when reached.",
    d: "To insert, the debugger saves the original bytes at the address and writes the processor's breakpoint instruction. When executed it traps, the kernel stops the thread and reports a breakpoint event, and the saved program counter points just past the trap, so the debugger moves it back. To continue, the original instruction must be executed in place before reinserting. It is hard because instruction lengths vary, because other threads may run through an address while the original is temporarily restored, and because code in read-only memory needs protection changes.",
    k: ["Software traps versus hardware breakpoints: software has no count limit and works on any code, but modifies memory and cannot be used in read-only code.", "Inserting all breakpoints at resume versus keeping them in place: inserting at resume hides them while stopped, keeping them avoids repeated writes."],
    p: ["Leaving breakpoint bytes in memory while stopped makes a memory read or a core file show trap instructions instead of code.", "A breakpoint on the second byte of a multi-byte instruction corrupts the instruction stream."],
    v: "Insert breakpoints at one hundred addresses, resume until each hits, and remove them; confirm each hit reports the right address and, after removal, a byte comparison of code memory with the file shows no differences.",
    dep: ["cross-process-memory", "code-patch-protection", "trap-and-trace-flags", "breakpoint-table"]
  },
  "hardware-breakpoints": {
    s: "Uses the processor's debug registers to stop at an instruction address without modifying code, limited to a few slots per thread.",
    d: "The debugger writes an address and a condition into a debug register for each thread, and the processor raises a debug exception when the instruction is about to execute. No memory is changed, so it works on code in read-only or flash memory and is invisible to checksums. The number is small, typically four, and alignment and length rules apply. It is hard because the registers are per thread and must be set on every thread including new ones, and the slots are shared with watchpoints.",
    k: ["Hardware breakpoints versus software: hardware leaves code untouched and works in read-only memory, but a handful of slots run out quickly.", "Setting registers on all threads versus the current one: all threads is correct for a breakpoint on shared code, at the cost of tracking thread creation."],
    p: ["A new thread starts without the debug register settings, so a hardware breakpoint never fires there.", "Requesting a fifth breakpoint fails only when resuming, long after the command seemed to succeed."],
    v: "Set four hardware breakpoints in read-only code, run threads created before and after, and confirm each triggers on every thread; then request a fifth and confirm it is rejected at command time with a clear message.",
    dep: ["debug-registers", "thread-control", "breakpoint-table"]
  },
  "watchpoints": {
    s: "Stops the program when a chosen memory location is written or read, using hardware address matching or slow single-step comparison.",
    d: "The user names a variable or address. The debugger converts it to an address range and asks for a debug register that triggers on write or access of that length. When it fires, the processor stops after the instruction completes, so the report shows the instruction after the culprit. If no hardware slot fits, the fallback is single-stepping and comparing the value, which is thousands of times slower. It is hard because ranges must align and fit the register sizes, scoped watches must be deleted when their frame exits, and a watch on a local needs the frame identity.",
    k: ["Hardware watch versus single-step comparison: hardware is nearly free but limited in count and size, single-stepping handles any size at a large slowdown.", "Triggering on any write versus only on changed values: change-only reduces noise, but misses a write that stores the same value."],
    p: ["A watch on a local variable fires after the function returns, because the stack slot is reused by another function.", "The report points at the next instruction, so the actual writing line is wrongly blamed."],
    v: "Watch a global counter incremented from three places; confirm each increment stops the program with the old and new value, the reported line is the one after the store, and the watch is removed when its frame exits.",
    dep: ["debug-registers", "breakpoint-table", "single-stepping", "expression-evaluator"]
  },
  "stepping-over-breakpoint": {
    s: "Resumes a thread that is stopped on a breakpoint by executing the original instruction out of line or with the breakpoint removed, then reinstating the breakpoint.",
    d: "On resume at an inserted breakpoint, the debugger removes that breakpoint, single-steps one instruction, then reinserts it and continues. In a multi-threaded program, other threads could pass through the address while it is removed, so another strategy is to copy the instruction into a scratch area and run it there, adjusting position-dependent instructions. It is hard because relative branches and address-computing instructions need rewriting when moved, and the scratch location must be reachable.",
    k: ["Remove-step-reinsert versus displaced execution: removal is simple but briefly unprotected for other threads, displaced execution is safe and needs instruction decoding.", "Stopping other threads during the step versus letting them run: stopping them is safe but changes timing, letting them run needs displaced stepping."],
    p: ["Another thread runs through the address while the breakpoint is removed and misses a stop that should have happened.", "A relative branch executed from the scratch location jumps to the wrong target."],
    v: "Run eight threads that all loop through one breakpoint address and continue each stop for ten thousand iterations; confirm the hit count equals the total number of passes and no thread ever skips it.",
    dep: ["software-breakpoints", "single-stepping", "thread-control", "disassembler"]
  },
  "single-stepping": {
    s: "Executes exactly one machine instruction and stops again, using the processor's trace flag or an emulated next-instruction breakpoint.",
    d: "Where hardware supports it, the debugger sets a trap flag in the thread's status register and resumes, so the processor traps after one instruction. On processors without it, the debugger decodes the current instruction, determines every possible next address, including both sides of a branch, and places temporary breakpoints. Atomic sequences and system calls need care, since a step inside a load-store pair can prevent it from ever completing. It is hard because stepping interacts with signals, system calls and exceptions that arrive mid-step.",
    k: ["Hardware trace flag versus software next-address breakpoints: the flag is exact and simple, software needs a decoder and fails on indirect or atomic sequences.", "Stepping instruction by instruction versus by line: instruction steps are precise, line steps are what users want and are built from many instruction steps."],
    p: ["Stepping through a load-linked and store-conditional pair keeps clearing the reservation, so the loop never finishes.", "A signal delivered during a step makes the debugger land in the handler instead of the next instruction."],
    v: "Step through a sequence containing a branch, a call and a system call; confirm each step advances one instruction to the expected address, and that the registers differ only by that instruction's effects.",
    dep: ["trap-and-trace-flags", "process-trace-interface", "disassembler"]
  },
  "step-over-and-out": {
    s: "Source-level step commands built from instruction steps: step into calls, step over them with a return breakpoint, and finish out of the current function.",
    d: "A line step repeatedly single-steps while the program counter stays inside the current line's address ranges. On entering a call, step over runs until the return address using a temporary breakpoint with a frame check, while step into stops if the callee has line information and otherwise steps out. Finish sets a breakpoint at the caller's return address and continues. It is hard because line ranges interleave under optimization, recursion causes the temporary breakpoint to hit in a deeper frame, and calls through trampolines have no line info.",
    k: ["Stepping by instruction in a loop versus using range-stepping with breakpoints: loops are simple but slow over remote links, range stepping is fast and needs more logic.", "Skipping functions with no debug information versus stopping in them: skipping matches user intent, stopping helps when the bug is there."],
    p: ["A temporary return breakpoint hit in a recursive deeper call ends the step in the wrong frame.", "Stepping into a function through a trampoline stops at assembly with no source, which looks like a hang."],
    v: "Step over a recursive call, step into a library function without debug data, and finish from a nested frame; confirm each lands at the expected line in the expected frame depth, including the recursion case.",
    dep: ["single-stepping", "line-table-decoder", "stack-unwinder", "software-breakpoints"]
  },
  "signal-handling": {
    s: "Decides, per signal or exception, whether to stop and show it, pass it to the program, or suppress it, and keeps the program's own handlers working.",
    d: "When a thread receives a signal the kernel stops it and reports to the debugger first. A table gives per-signal policy: stop, print a notice, pass to the program on resume. Faults such as invalid memory access are reported with the faulting address and the instruction. Stepping into a signal handler needs the unwinder to know the handler frame. It is hard because some signals are used internally by runtimes at high rates, and passing or suppressing the wrong one changes the program's behavior.",
    k: ["Stopping on every signal versus a default policy of pass-silently for timers: stopping on all is complete but unusable for runtimes that use signals constantly.", "Resuming with the signal versus discarding it: passing keeps the program's behavior, discarding is needed to continue past a fault the user has fixed."],
    p: ["Discarding a signal the program relies on, such as a timer or interrupt, makes the program hang under the debugger only.", "Continuing after a fault without changing anything re-executes the same fault forever."],
    v: "Run a program that uses a timer signal and then faults; confirm the timer signal is passed without stopping, the fault stops with its address and instruction shown, and continuing after fixing the pointer lets it run on.",
    dep: ["signal-delivery", "debug-event-loop", "stack-unwinder"]
  },
  "thread-control": {
    s: "Tracks every thread of the program and decides which ones run or stay stopped during each resume, in all-stop or non-stop mode.",
    d: "The debugger learns of thread creation and exit from kernel events, keeps per-thread registers and state, and offers selection of the current thread. On resume it can run all threads, only the current one, or lock the scheduler so other threads stay stopped during a step. In non-stop mode threads are stopped and resumed individually. It is hard because stopping all threads requires interrupting each and waiting for acknowledgment, and because user-level thread libraries and coroutines have no kernel identity.",
    k: ["Resuming all threads on step versus only the current thread: all is closer to normal, one is deterministic but can deadlock waiting for another.", "All-stop versus non-stop: all-stop gives a simple consistent view, non-stop keeps other work alive but demands per-thread state in every command."],
    p: ["Single-stepping one thread while others stay stopped deadlocks when it waits on a lock another thread holds.", "A thread exiting while stopping all leaves the debugger waiting for an acknowledgment that never comes."],
    v: "Run a program with sixteen threads, break in one, list all threads with their stack tops, and step only that thread with the others locked; confirm the others' registers are unchanged and then resume all.",
    dep: ["process-trace-interface", "debug-event-loop", "signal-delivery"]
  },
  "core-dump-capture": {
    s: "Writes a file holding a process's memory, registers and mapping information at the moment of a fatal signal or on request.",
    d: "When a process dies from a fatal signal, or when a tool asks for it, the kernel or a helper writes segments for each memory region and notes for each thread's registers, signal and mappings. Policy controls the size limit, file name, which regions are included such as skipping file-backed read-only pages, and whether a helper program receives the dump on a pipe. It is hard because large processes produce enormous files, because writing happens while the process is dying under memory pressure, and because dumps contain sensitive data.",
    k: ["Full dump versus filtered dump: full is complete for deep analysis, filtered is much smaller but cannot show omitted regions.", "Kernel writes the file versus piping to a handler: a handler can compress, upload and attach metadata, but adds a dependency that can fail during a crash."],
    p: ["A size limit of zero, left from defaults, means no dump exists when the crash finally happens.", "A dump written beside the application leaks memory contents to anyone who can read that directory."],
    v: "Crash a test process under a configured policy; confirm a dump file appears, loads in the reader with the right registers and signal, and a region excluded by the policy is reported as absent.",
    dep: ["kernel-core-dump", "process-address-map", "privilege-and-trust"]
  },
  "core-dump-reader": {
    s: "Opens a dump as if it were a stopped process, serving memory and register reads from the file while rejecting anything that needs a live target.",
    d: "The reader parses the segment table, registers per thread and the mapping notes, and builds a target whose reads come from the file. For memory not stored, such as unmodified code pages, it falls back to the original executable and libraries matched by identity. The usual commands then work: backtrace, print, thread list. It is hard because the matching binaries must be the ones that crashed, because libraries on the analysis machine differ, and because commands that execute code or resume fail.",
    k: ["Reading code from the original files versus requiring it in the dump: files keep dumps small, but analysis fails if the exact build is missing.", "Allowing expression evaluation with calls versus read-only evaluation: calls cannot work without a live target, so evaluation is limited to data."],
    p: ["Analyzing a dump with a rebuilt binary of the same name produces backtraces that look plausible and are wrong.", "Missing shared libraries cause the backtrace to stop at the first library frame."],
    v: "Open a dump from a crashed test program together with the matching files; confirm the backtrace, local variables and thread list equal what a live debugger showed at the crash, and a resume command is refused.",
    dep: ["debug-info-matching", "cross-process-memory", "stack-unwinder", "process-address-map"]
  },
  "execution-recorder": {
    s: "Captures a program's execution so it can be replayed exactly, by logging every input that enters it from outside the processor.",
    d: "The recorder runs the program under its control and logs results of system calls, signals, scheduling decisions, timing sources and, on some designs, shared memory accesses between threads. It typically serializes threads onto one processor so interleavings are reproducible, or logs them. Events are counted using a hardware counter of retired branches or instructions to place them exactly. It is hard because many inputs are invisible: random instructions, timestamps, memory-mapped hardware and shared-memory races.",
    k: ["Single-processor serialization versus logging cross-thread interleavings: serialization is simple and exact, but gives up parallel speed.", "Recording at the system-call boundary versus emulating the whole machine: the boundary is fast, emulation captures everything but is far slower."],
    p: ["An instruction that reads a hardware random source or time counter is not captured, and replay diverges.", "Recording a program that uses unsupported kernel features aborts or silently mis-records."],
    v: "Record a multi-threaded program with random and timing inputs, replay it ten times, and confirm each replay produces identical output, identical system call results and the same crash at the same instruction count.",
    dep: ["nondeterminism-capture", "hardware-counters", "process-trace-interface"]
  },
  "nondeterminism-capture": {
    s: "Identifies and records every source of nondeterminism during recording, so that replay can inject the same values at the same points.",
    d: "Sources include system call results and written buffers, signal arrival points, thread schedule, clock reads, random-number instructions, and values the kernel writes into program memory. Each is logged with a position in execution, expressed as an instruction or branch count. During replay the engine intercepts the same points and supplies the logged values instead of calling the real kernel. It is hard because the list of sources grows with every new kernel and processor feature, and any miss shows up as divergence only later.",
    k: ["Intercepting each kind explicitly versus a general mechanism such as virtualization: explicit interception is cheap but needs ongoing maintenance, virtualization catches all but costs more.", "Failing loudly on unknown sources versus ignoring them: failing is safe but blocks use, ignoring risks silent divergence."],
    p: ["A new system call the recorder does not know about returns data that is not logged, and replay fails far later.", "Time-dependent code that reads a vDSO clock bypasses the interception entirely."],
    v: "Record a program that reads the clock, receives signals and uses random sources; replay and confirm every value matches, and that divergence detection reports an injected mismatch at the first differing event.",
    dep: ["execution-recorder", "signal-delivery", "hardware-counters"]
  },
  "replay-engine": {
    s: "Re-executes a recording deterministically, injecting logged inputs, and presents the result to the debugger as an ordinary stopped target.",
    d: "The engine starts the program in the same initial state and runs it while intercepting the events in the log: it supplies recorded system call results and delivers signals at the recorded instruction counts. It uses a counter to stop at an exact point, and programs a counter overflow or single-steps near it. The debugger commands see a normal target. It is hard because stopping at an exact point requires skid-free counting, and because divergence from the recording must be detected rather than followed.",
    k: ["Replaying from the start versus from checkpoints: starting is simple but slow late in a long run, checkpoints bound the cost.", "Detecting divergence by counters versus by comparing state: counters are cheap and detect most, state comparison catches subtle cases with more cost."],
    p: ["Imprecise counter overflow lands several instructions early, so a stop appears before the real event.", "Replay on a different processor model diverges because instruction counts differ."],
    v: "Replay a recording to the same instruction count twice and to a breakpoint; confirm registers and memory hash equal at that point in both, and a deliberately edited log is detected as a mismatch.",
    dep: ["execution-recorder", "hardware-counters", "replay-checkpoints", "software-breakpoints"]
  },
  "reverse-execution": {
    s: "Lets the user run backward: reverse-continue to the previous breakpoint, reverse-step, and find the last write to a variable.",
    d: "Reverse commands are built on replay. To go back one step, the engine restores the nearest earlier checkpoint and replays forward to just before the current point. Reverse-continue replays forward in segments recording the last breakpoint or watch hit, then goes to it. Watching a variable backward finds the most recent change that led to the current value. It is hard because it multiplies replay cost, and because the answer should be in source terms, so stepping back must unwind the line logic.",
    k: ["Rebuilding state by forward replay versus logging every state change: replay is compact, per-change logging gives instant steps at a large memory cost.", "Reverse stepping by instruction versus by line: instructions are exact, lines require replaying backward until the line's start."],
    p: ["Reverse-continue on a long run replays gigabytes of execution before finding anything, and appears to hang.", "A reverse watch that hits at a reused stack slot blames an unrelated earlier function."],
    v: "At a crash caused by a corrupted pointer, set a watch on the pointer and reverse-continue; confirm it stops at the exact statement that last wrote it, and a forward continue then reaches the crash again.",
    dep: ["replay-engine", "replay-checkpoints", "watchpoints"]
  },
  "replay-checkpoints": {
    s: "Saved process snapshots taken during recording or replay, so any point in the run can be reached without replaying from the very beginning.",
    d: "A checkpoint captures the address space, registers and kernel-visible state, often by forking the process and keeping the copy-on-write child suspended. During replay, going to a point restores from the nearest earlier checkpoint and runs the rest. Checkpoints are taken at intervals or at user request. It is hard because the snapshot must include all state needed to resume deterministically, such as file offsets and threads, and because retained copies of a large process consume memory.",
    k: ["Many frequent checkpoints versus few: many make navigation fast and cost memory, few save memory and slow every backward move.", "Fork-based copies versus serializing to disk: forks are fast but die with the session, serialized snapshots persist and are slower."],
    p: ["A checkpoint missing a kernel object, such as an open file offset, makes replay from it diverge.", "Hundreds of checkpoints of a large process exhaust memory and the system starts swapping."],
    v: "Take checkpoints every second in a ten-second recording; jump to the seventh second and confirm only about one second of execution is replayed and the state hash matches the one from a replay from the start.",
    dep: ["replay-engine", "process-address-map", "process-trace-interface"]
  },
});
