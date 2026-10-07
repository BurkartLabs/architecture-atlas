// Details for the real-time OS plate, part 1: cross-cutting concerns, assurance, analysis, application.
ATLAS.details("real-time-os", {
  "worst-case-timing-budget": {
    s: "The rule that every task and interrupt is judged by its slowest possible run, not its average, and each deadline is given an explicit allowance that all contributors must fit inside.",
    d: "A deadline is split into pieces: interrupt latency, kernel overhead, blocking by lower-priority tasks, the task's own execution and preemption by higher ones. Each piece gets a number from measurement or analysis, and the sum must be below the deadline with margin. Average speed is irrelevant, since one late response is a failure. It is hard because the worst case is rarely observed in testing: it needs a rare cache state, an unlucky interrupt overlap or a flash wait state that only appears occasionally.",
    k: ["Budget from analysis versus from measurement: analysis gives safe bounds but is pessimistic and needs tool support; measurement is realistic but can miss the rare worst path.", "Large margin versus tight margin: slack absorbs unmodeled effects and future changes, but costs a faster and more expensive processor."],
    p: ["Using the longest observed time as the worst case, then missing a deadline when a rarer path appears in the field.", "Adding a feature that increases one task's run time and never re-checking the lower-priority tasks it now preempts."],
    v: "Pick the tightest deadline, list every term in its budget with its source, then run a stress load with all interrupt sources firing and confirm the measured maximum response stays under the summed bound.",
    dep: ["schedulability-analysis","wcet-analysis"]
  },
  "static-versus-dynamic-configuration": {
    s: "The decision about what is fixed at build time (tasks, queues, priorities, memory) versus created at run time, which determines predictability, footprint and how the system can fail.",
    d: "A static system declares every task, queue, timer and buffer in configuration; the linker places them and the kernel initializes them at startup. A dynamic system creates and deletes objects while running, drawing from a heap or pools. Static builds cannot run out of memory after boot and can be analyzed completely. Dynamic builds are more flexible for plug-in features. The difficulty is that a mixed system inherits the analysis burden of the dynamic part while giving up none of the static part's rigidity.",
    k: ["Static objects versus run-time creation: no allocation failures and a complete analysis, but changing the task set means rebuilding the image.", "One-time dynamic creation at startup versus anytime creation: startup-only keeps flexibility for configuration yet freezes the system before it enters its real-time phase."],
    p: ["Creating a queue in a running task and getting a null result because the pool was exhausted by earlier fragmentation.", "Letting a configuration tool and the source disagree about the number of tasks, so the kernel silently truncates the list."],
    v: "Boot the image, record free memory at the end of startup, run a long soak under full load and confirm free memory does not change and no allocation call appears in the post-startup trace.",
    dep: ["static-allocation","kernel-configuration"]
  },
  "determinism-over-throughput": {
    s: "The design stance that a bounded, repeatable response time beats a faster average, so kernel paths avoid unbounded loops, hidden locks and data-dependent cost.",
    d: "Kernel operations are written so their cost depends on a fixed bound, not on how many tasks or objects exist: ready queues indexed by priority, bit maps to find the next task, constant-time pool allocation. Features that speed up the average, such as large caches, speculative execution, lazy work and background cleanup, are limited or placed where their worst case is known. It is hard because the hardware itself undermines determinism through caches, buses shared with direct memory access and flash wait states, so software discipline alone is not enough.",
    k: ["Constant-time structures versus compact adaptive ones: bit maps and arrays cost memory but never degrade; lists are smaller yet grow with load.", "Cache enabled versus disabled or locked: enabled gives much higher average speed, but makes the worst case hard to bound and often much worse than the average."],
    p: ["A kernel call that walks a list whose length grows with the number of tasks, so latency creeps up as the product gains features.", "Bounding software time while ignoring bus contention from direct memory access, so the real worst case is several times the analyzed one."],
    v: "Run the same operation with 5, 50 and 500 objects present and confirm its measured maximum time stays flat, using a cycle counter over a long run that includes interrupt storms.",
    dep: ["ready-queues","memory-pools"]
  },
  "priority-assignment-discipline": {
    s: "The rule for choosing and changing task priorities from timing facts (periods, deadlines, blocking), not from perceived importance, together with the controls that stop accidental drift.",
    d: "Priorities encode the scheduling policy. With fixed priorities the usual rule gives shorter periods or deadlines higher priority; tasks that wait on shared resources need a protocol that bounds blocking. Priorities are held in one central table so a reviewer can see the whole ordering. Interrupt priorities are a separate ordering that always outranks tasks, and the kernel's own timer and deferred-handling tasks need chosen levels. It is hard because importance and urgency differ: a vital task with a long deadline should rank below a minor task with a short one.",
    k: ["Central priority table versus priorities set at each task's creation: central review catches inversions and gaps, but couples every module to one shared file.", "Few priority levels versus many: few levels keep analysis simple and force shared levels with first-in order, but cause more interference between unrelated tasks."],
    p: ["Raising a task's priority to fix one missed deadline, which starves lower-priority tasks and moves the failure elsewhere.", "Two tasks at the same level assumed to run in a particular order, which holds in testing and breaks after a harmless change."],
    v: "Print the full priority table from the running system and confirm that every task's rank follows from its period and blocking, and that the analysis tool reports all deadlines met with that exact table.",
    dep: ["rate-monotonic-assignment","priority-inheritance","schedulability-analysis"]
  },
  "failure-containment": {
    s: "The set of decisions that stop one fault, whether a stuck task, a corrupted buffer or a bad interrupt, from spreading into the rest of the system or into a unsafe output.",
    d: "Containment works at several levels: memory protection to confine a task, timeouts on every wait, watchdogs that expect proof of progress, budget enforcement that stops an overrunning task, and a defined safe state for outputs. Each level detects a different failure and reacts differently: restart a task, restart the device, or hold actuators in a known position. It is hard because detection alone is not enough; the reaction must itself be bounded and must not depend on the failed component being healthy.",
    k: ["Restart the faulty task versus reset the whole device: task restart keeps other functions alive, but may leave shared state inconsistent; reset is simple and clean but interrupts everything.", "Detect with hardware protection versus software checks: hardware catches wild writes immediately at small run-time cost, but needs the chip feature and careful region layout."],
    p: ["A watchdog serviced from a timer interrupt, which keeps running while every task is dead and hides the failure.", "A fault handler that logs to a file system the faulted task was in the middle of using."],
    v: "Inject a fault into one task (write outside its memory, spin forever) on the real board and confirm the system reaches its defined reaction within the specified time while the other tasks keep meeting their deadlines.",
    dep: ["mpu-region-management","watchdog-supervision","safe-state-and-recovery","fault-handlers"]
  },
  "memory-and-code-footprint": {
    s: "The constraint that the kernel and application must fit in kilobytes of memory, which shapes every option: configurable features, compile-time removal, and what each object costs.",
    d: "Devices may have tens of kilobytes of working memory and a few hundred of flash. The kernel is therefore built from optional modules selected by a configuration file, and unused features cost nothing. Each task needs a stack, a control block and sometimes a queue, so the count of tasks is itself a budget. Stack sizing dominates: too small overflows, too large wastes scarce memory. It is hard because the numbers interact; a logging feature adds a task, its stack and a queue, and the saving made elsewhere is lost.",
    k: ["Many small tasks versus few larger ones: small tasks give cleaner timing structure, but each pays a stack and control block that can exceed its working data.", "Feature removal at build time versus run-time switches: build-time removal saves code and removes risk, but means maintaining several tested variants."],
    p: ["Sizing a stack from one test run, then overflowing it on an error path that was never exercised.", "Enabling one convenience option that quietly links in a large library and pushes the image past the flash limit near release."],
    v: "Read the link map for the release image and confirm code, constants and static data fit with the agreed spare margin, and check the high-water marks of all stacks after a full test campaign.",
    dep: ["kernel-configuration","per-task-stacks","static-kernel-objects"]
  },
  "safety-case-and-standards": {
    s: "The structured argument, written against an applicable functional-safety standard, that the software is acceptably safe, with each claim tied to evidence and to the integrity level assigned.",
    d: "The standard for the industry (road vehicles, aircraft, medical devices, industry, railways) sets an integrity level from the hazard analysis, and each level demands specific activities: reviews, test depth, independence of verifiers, tool rigor. The safety case lists claims, assumptions and the evidence for each, including assumptions the kernel makes about the hardware and about the application. It is hard because a kernel is only a component: its claims hold only if the application follows the usage rules, and the case must say so in a form an assessor can check.",
    k: ["Certifying a generic kernel once versus certifying the kernel inside each product: reuse cuts cost, but each product still has to demonstrate that its configuration and usage match the assumptions.", "Highest integrity level for everything versus partitioning by level: one level is simple to argue, but forces maximum rigor on code that does not need it."],
    p: ["An assumption of use that the application team never reads, so the evidence is valid on paper and invalid for the product.", "A late change in integrity level after the architecture is fixed, forcing rework of partitioning and test evidence."],
    v: "Pick any claim in the case, follow its link to a requirement, a design element, a test result and a review record, and confirm each exists, is current and covers the shipped configuration.",
    dep: ["requirements-traceability","freedom-from-interference"]
  },
  "requirements-traceability": {
    s: "A maintained map from each requirement to the design elements, code and tests that implement and verify it, in both directions, so gaps and orphans are visible.",
    d: "Each kernel requirement, for example a bound on the time to release a mutex, has an identifier. Design documents, source files and test cases cite those identifiers, and a tool extracts the links into a matrix. Forward checks find requirements with no test; backward checks find code or tests that serve no requirement, which are either unneeded or signs of an undocumented behavior. It is hard because the links rot: files are renamed and tests split, and the matrix silently keeps pointing at old names unless it is rebuilt and checked on every change.",
    k: ["Links kept in source comments versus in a separate database: comments move with the code and are reviewed with it, but are harder to query and audit across the whole project.", "Fine-grained requirements versus broad ones: fine ones are easy to test precisely, but multiply the trace links and the review effort."],
    p: ["A requirement linked to a test that passes without actually checking the stated behavior.", "Generated code with no traceability, which an assessor treats as missing evidence."],
    v: "Run the traceability check in the build and confirm it reports zero untested requirements and zero unreferenced code units, then change one requirement ID and confirm the check fails.",
    dep: ["safety-case-and-standards"]
  },
  "structural-coverage-analysis": {
    s: "Measurement of which statements, branches or condition combinations of the kernel were executed by the tests, used to show the tests exercise all of the code or explain why some is left.",
    d: "Instrumented or hardware-trace builds record executed code while the requirement-based tests run. Higher integrity levels demand more: statement coverage, then branch coverage, then modified condition and decision coverage, which needs each condition shown to change the outcome by itself. Uncovered code is investigated: missing test, dead code to remove, or defensive code needing a justification. It is hard because instrumentation changes timing and code size, and coverage measured on a host build may not match what runs on the target.",
    k: ["Instrumented source versus on-target trace: instrumentation is easy and portable but alters timing; hardware trace measures the real binary but needs expensive debug hardware.", "Coverage on optimized code versus unoptimized: optimized matches production, but the compiler merges and removes branches so the mapping to source gets hard to judge."],
    p: ["Chasing a coverage number with tests that call functions but check nothing.", "Measuring coverage on a build with different compiler options from the shipped one, so the evidence does not describe the real binary."],
    v: "Run the full requirement-based test set on the target with coverage on and confirm the report lists every uncovered branch with a recorded disposition, and none without one.",
    dep: ["requirements-traceability","qualified-toolchain"]
  },
  "certification-evidence-package": {
    s: "The bundle of plans, designs, test results, reviews and configuration records delivered to an assessor to show the kernel and its configuration meet the required standard.",
    d: "It typically holds a plan for software aspects, requirements and design, verification reports, coverage results, a list of known anomalies, a configuration index naming exact versions of source, tools and settings, and a safety manual stating how the kernel must be used. Vendors sell it as a ready package; the product team adds the evidence for its own configuration and application. It is hard because every item must refer to the same frozen version, and one changed line in a header can invalidate test evidence for the entire package.",
    k: ["Buying a pre-certified package versus producing evidence in house: bought evidence saves years but fixes the supported chips, compilers and options; in-house gives freedom at much greater cost.", "Freezing the kernel version versus updating for fixes: frozen keeps the evidence valid, but means known defects stay unless each fix is re-justified."],
    p: ["Building the product with a different compiler flag than the one the evidence covers.", "A tool or library update that silently changes generated code after the evidence was collected."],
    v: "Rebuild the delivered release from the archived sources and tools and confirm the binary is bit-identical to the one the evidence was gathered against.",
    dep: ["structural-coverage-analysis","requirements-traceability","qualified-toolchain"]
  },
  "coding-standard-conformance": {
    s: "Checking that kernel and application source follow a restricted coding standard that forbids constructs with undefined, unbounded or hard-to-analyze behavior, with each exception justified in writing.",
    d: "The rules ban or limit recursion, dynamic allocation after startup, unbounded loops, implicit conversions, function pointers of unknown target and other constructs that defeat analysis. A static analysis tool checks the rules in the build; each deviation is recorded with a reason and approved. Rules make timing and stack analysis possible because they bound what the code can do. It is hard because the rules conflict with practical code at the edges: low-level register access and context switching need constructs the standard disallows, and each such case needs a reviewed exception.",
    k: ["Strict rule set with recorded deviations versus a looser style guide: strict enables analysis and audit, but costs developer time and sometimes awkward code.", "Enforcing in the build versus at review: build enforcement is consistent and cheap per change, but tools produce false positives that need triage."],
    p: ["Suppressing a warning with a blanket comment instead of a justified deviation, which hides real violations later.", "Accepting a vendor library that does not follow the rules, then having to wrap and test it as if it were untrusted."],
    v: "Run the checker over the release sources and confirm zero unjustified violations, then add a deliberate banned construct on a branch and confirm the build fails.",
    dep: ["qualified-toolchain"]
  },
  "qualified-toolchain": {
    s: "The compiler, linker, analyzers and test tools that have been shown to be trustworthy for the integrity level, either by prior qualification or by checks on their output.",
    d: "A tool error can put a fault into a safe design, so standards require confidence in the tools. Confidence comes from a vendor's qualification kit, from validation suites that test the compiler against its specification, or from independent checking of the output, for example comparing coverage or running a second analyzer. The tool versions and options are frozen and recorded. It is hard because modern compilers are large and change often, and optimization levels differ in how much risk they bring, so the qualified set of options is narrow.",
    k: ["Qualifying the tool versus checking its output: qualification is done once and reused, but covers one version and options; output checks work with any tool but add effort per build.", "Low optimization versus high: low gives code that maps cleanly to source and is easier to verify, but is slower and larger, which the timing budget may not allow."],
    p: ["A compiler upgrade for a bug fix that invalidates the qualification and the stored test evidence.", "Using a code generator whose output is never reviewed or qualified."],
    v: "Compile the tool vendor's validation suite with the exact release options and confirm every case passes, and record the compiler version and option string in the configuration index.",
    dep: []
  },
  "freedom-from-interference": {
    s: "The demonstrated property that a fault in a lower-integrity task cannot corrupt the memory, timing or resources of a higher-integrity one running on the same processor.",
    d: "Three channels are controlled: spatial interference through memory protection regions, temporal interference through priorities, budgets and bounded blocking, and interference through shared resources such as peripherals and communication objects. The kernel provides the mechanisms; the integrator configures them and shows with tests and analysis that each channel is closed. It is hard because the guarantee depends on correct hardware setup, and shared hardware such as buses, caches and direct memory access can couple tasks in ways software cannot see.",
    k: ["Spatial isolation by protection hardware versus by trust in code: hardware isolation holds even for buggy code, but needs regions to be assigned and costs switch time.", "Temporal budgets enforced by the kernel versus relying on measured margins: enforcement stops an overrun at once, but needs a precise timer and adds overhead on every switch."],
    p: ["Two tasks of different integrity writing the same peripheral register, which no memory region separates.", "A low-integrity task that holds a lock longer than its documented limit and delays a critical one."],
    v: "Run a deliberately faulty low-integrity task (wild write, endless loop, lock hogging) and confirm the high-integrity task's data is unchanged and its response times stay inside their bounds.",
    dep: ["mpu-region-management","priority-ceiling-protocol","kernel-object-permissions"]
  },
  "event-trace-recorder": {
    s: "A low-overhead recorder in the kernel that timestamps events such as task switches, interrupts and object operations into a buffer, for later reading on a host.",
    d: "Hooks at kernel entry points write small fixed-size records (event type, object, timestamp) into a ring buffer in memory. A host tool reads the buffer after a stop, or streams it through a debug link or serial port. Timestamps come from a free-running cycle counter. The recorder must cost a few cycles per event and must itself be safe to call from interrupts. It is hard because tracing perturbs timing, and the buffer is small, so a long run overwrites the interesting moment before anyone reads it.",
    k: ["Snapshot ring buffer versus continuous streaming: a ring is cheap and needs no link but keeps only recent events; streaming keeps all of them but needs bandwidth and can drop events when saturated.", "Recording every event versus selected classes: everything gives the full picture but raises overhead and fills memory; selection is lighter but can omit the cause."],
    p: ["Leaving trace hooks on in the release, so measured timing differs from what was verified.", "Reading the buffer after a crash that overwrote the lines holding the cause."],
    v: "Trigger a known sequence of an interrupt, a semaphore give and a task switch, then read the trace and confirm the three events appear in order with timestamps that match a logic analyzer within a few cycles.",
    dep: ["hardware-timer-source","interrupt-safe-apis"]
  },
  "trace-visualizer": {
    s: "A host tool that turns recorded kernel events into a timeline of tasks and interrupts, with statistics on run time, blocking and response, to show what the scheduler actually did.",
    d: "The tool decodes records using the kernel's event table and draws one row per task and interrupt with bars for running, ready and blocked states. It computes per-task execution time, response time, preemption counts and the longest blocking and lets the user step to a particular event. It shows priority inversion, missed periods and overlong critical sections at a glance. It is hard because correctness depends on exact timestamps and complete data; a dropped event makes the display lie about who was running.",
    k: ["Offline analysis versus live display: offline can process large captures with exact statistics, but live view finds problems while the device is in the situation that causes them.", "Generic timeline versus application-aware markers: generic works for any task set, but user markers tie the display to the product's own phases and requirements."],
    p: ["Reading an event gap as idle time when the recorder actually dropped records.", "Trusting displayed averages while the problem is a single outlier visible only in the maximum."],
    v: "Run a task set with a known period and a deliberate priority inversion, open the capture and confirm the tool shows the period within a microsecond and highlights the inversion interval.",
    dep: ["event-trace-recorder"]
  },
  "stack-usage-monitor": {
    s: "Measurement of how much of each task's stack and the interrupt stack has ever been used, by filling stacks with a known pattern and finding the high-water mark.",
    d: "At task creation the stack is filled with a marker value. A monitor scans from the far end to find the first overwritten word, giving the deepest use so far. Reports compare the high-water mark to the size and flag tasks above a threshold. Static analysis of call graphs gives an upper bound that complements the measured value. It is hard because measurement shows only paths that were exercised, and interrupt nesting, error handling and library calls can push depth far beyond what normal runs reach.",
    k: ["Measured high-water marks versus static call-graph analysis: measurement is easy and real but can miss untested paths; analysis gives a bound but needs a clean call graph and gets pessimistic with indirect calls.", "Large margin on all stacks versus tuned sizes: margin protects against the unseen path, but across many tasks it consumes memory that small devices lack."],
    p: ["Judging stack size from a passing test that never triggered the deepest error path.", "Forgetting that each interrupt nesting level adds a saved context to whichever stack the processor is using."],
    v: "Run the full test campaign including fault injection, dump each stack's high-water mark and confirm none exceeds the agreed fraction of its size, and that the static bound is below the allocation.",
    dep: ["per-task-stacks","stack-overflow-detection"]
  },
  "cpu-load-measurement": {
    s: "A measurement of how much processor time is consumed by each task and interrupt, usually from time spent in the idle task or from per-task run-time counters.",
    d: "The kernel accumulates, per task, the ticks or cycles spent running, using a counter at each context switch. Load is the share not spent in idle. Per-task figures show which function dominates and how much headroom exists. Sampling a time base faster than the tick gives better resolution than counting ticks alone. It is hard because average load says little about deadlines: a system at forty percent average can still miss one when several tasks align, so load is a warning signal, not proof.",
    k: ["Counting at each context switch versus statistical sampling: switch counting is exact but adds work to the hottest kernel path; sampling is cheap but misses short bursts.", "Measuring on the target versus in simulation: target figures include real memory and bus effects, but simulation can run far more scenarios."],
    p: ["Reading a low average load as safe while a periodic burst misses its deadline.", "Measuring with a coarse tick so short tasks appear to take zero time."],
    v: "Run a task with a known thirty percent duty and confirm the reported load is within a few points of it, then raise the duty and see the idle share fall by the same amount.",
    dep: ["context-switch","high-resolution-clock","idle-task"]
  },
  "timing-measurement-hooks": {
    s: "Instrumentation points that capture the execution time or latency of chosen code paths, such as interrupt entry to task start, using a cycle counter or a toggled pin.",
    d: "Code reads a free-running counter at the start and end of a region and records the difference and its maximum. For events that cross hardware, such as input pin to output pin, a pin toggle watched on an oscilloscope or logic analyzer gives a measurement that does not depend on the software clock. Results feed the timing budget. It is hard to cover the worst case: the measured path must be provoked under the slowest cache, interrupt and bus conditions, and the hook itself should not change the path.",
    k: ["Counter reads in software versus external pin toggles: software is easy to automate and log, but pin toggles measure real end-to-end latency including hardware.", "Always-on hooks versus build-time hooks: always on catches rare events in the field, but costs cycles and code space in every product."],
    p: ["Recording only the last measurement instead of the maximum, losing the outlier that matters.", "Measuring with interrupts on and ignoring that the region was interrupted, inflating or hiding the figure."],
    v: "Measure input-pin-to-output-pin response on a logic analyzer over a million events with background load, and confirm the maximum is below the deadline and agrees with the software hook.",
    dep: ["high-resolution-clock"]
  },
  "wcet-analysis": {
    s: "Computing or bounding the longest time a piece of code can take on the target, by static path and hardware analysis or by measurement with a safety margin.",
    d: "Static tools read the binary, build the control flow graph, bound loops from annotations, and model the pipeline, caches and memory timing to compute a guaranteed upper bound. Measurement-based methods run instrumented tests that provoke long paths and add a margin. Hybrid methods measure small blocks and combine them by analysis. The result per task feeds schedulability analysis. It is hard because modern processors have features such as caches, deep pipelines and shared buses whose state changes the time of each instruction, so exact bounds are expensive and often loose.",
    k: ["Static analysis versus measurement: static gives a safe bound without needing the worst input, but needs a faithful hardware model and loop bounds; measurement is realistic but cannot prove it saw the worst path.", "Simple processor versus fast one: a simple core with no cache is easy to bound, but a faster core may be needed to fit the work at all."],
    p: ["A loop bound annotation that is wrong or out of date, making the computed bound unsafe.", "Analyzing one function but ignoring the time spent in interrupts and the kernel calls it makes."],
    v: "Compare the computed bound against the maximum measured over a stress campaign for each analyzed task, confirming the bound is higher than every measurement and the gap is explained.",
    dep: ["timing-measurement-hooks","qualified-toolchain"]
  },
  "schedulability-analysis": {
    s: "A calculation, from task periods, deadlines, worst-case run times and blocking, that proves all deadlines are met under the chosen scheduling policy, before the system runs.",
    d: "For fixed priorities, response-time analysis computes each task's worst response by iterating: its own run time plus blocking plus interference from every higher-priority task released during that time, until the value settles. For earliest-deadline-first, a utilization or demand test applies. Interrupts, kernel overhead and release jitter are modeled as extra tasks or terms. It is hard because the inputs are estimates: an optimistic run time or a forgotten blocking source makes a proof that a field failure disproves.",
    k: ["Utilization bound tests versus exact response-time analysis: a bound is quick and conservative, but rejects feasible sets; exact analysis accepts more sets and shows margins, at the cost of tooling.", "Analyzing at design time versus checking at run time: design-time analysis is thorough and free at run time, but a run-time admission test can accept new tasks safely, at a cost in overhead."],
    p: ["Leaving out kernel overhead and interrupt service time, so every computed response is too optimistic.", "Treating a sporadic event as periodic at its average rate when bursts arrive faster."],
    v: "Feed the real task table and measured worst-case times to the analysis tool, then compare each computed response time against the maximum observed in a worst-case load test; none may exceed its computed bound.",
    dep: ["wcet-analysis","priority-preemptive-scheduler","interrupt-latency-budget"]
  },
  "assertions-and-fault-log": {
    s: "Runtime checks on kernel and application invariants, with a small persistent log that records what failed, where and when, so field failures can be diagnosed.",
    d: "Assertions test conditions such as a valid object pointer, a non-negative count or a stack canary. On failure, a handler captures the program counter, task identity, selected registers and a timestamp into a log held in memory that survives reset, then moves to the defined safe state. The log is read after the restart or uploaded. It is hard because the handler runs when the system is already inconsistent: it must avoid locks, allocation and anything the failure may have damaged, and finish in bounded time.",
    k: ["Assertions kept in release versus compiled out: kept catches field corruption early, but adds code, time and a new failure path; removed saves resources but leaves faults to cause later, stranger errors.", "Log in retained memory versus in flash: retained memory is fast and safe to write from a fault, but is lost on power loss; flash persists but is slow and risky from a fault."],
    p: ["An assertion handler that calls the same service that failed and recurses into another fault.", "A full log that stops recording, so the second failure of a chain is never seen."],
    v: "Trigger a forced assertion on the board, observe the safe state reached within the specified time, and after restart read a log entry that names the correct task, address and time.",
    dep: ["safe-state-and-recovery","fault-handlers"]
  },
  "task-decomposition": {
    s: "Dividing the application into tasks by timing and rate of change, so each task has one period or trigger, one deadline and a bounded amount of work.",
    d: "Work is grouped by how often and how urgently it must run: a fast control loop, a slower sensor filter, an event handler for a button, a background logger. Each group becomes a task with a priority from its deadline. Too few tasks makes long ones that block urgent work; too many adds stack memory and switching overhead. The decomposition decides which data is shared, and so which queues and locks are needed. It is hard because requirements change, and a task that grows gradually can break the budget for the tasks beneath it.",
    k: ["Task per timing requirement versus task per feature: timing-based tasks make analysis direct, but spreads one feature across several tasks that must cooperate.", "Few large tasks with internal state machines versus many small tasks: few save memory and switching, but each long run blocks lower ones; many give finer control at higher cost."],
    p: ["A single task doing a fast control loop and a slow file write, so the write blocks the loop.", "Splitting by module so a time-critical path crosses four tasks and picks up four wake-up delays."],
    v: "List every task with its period or trigger, deadline, worst-case run time and priority, and confirm each has a single timing role and that the schedulability analysis passes for exactly this list.",
    dep: ["priority-assignment-discipline","schedulability-analysis"]
  },
  "periodic-task-pattern": {
    s: "A task that runs once per fixed period, waking at absolute times from a periodic delay rather than sleeping for a relative time, so it does not drift.",
    d: "The task loops: wait until the next release time, do its work, compute the following release as the previous plus the period. Using an absolute delay call keeps a constant rate even when the work time varies. The task checks that the work finished before the next release and counts or reports overruns. The pattern gives analyzable timing: a known period, a worst-case run time and a deadline. It is hard to handle overrun: if work takes longer than the period, the task should skip, catch up or fail loudly, and each choice has different effects.",
    k: ["Absolute-time release versus relative delay: absolute holds the rate without drift; relative is simpler but accumulates error equal to the run time in every cycle.", "Skipping missed releases versus running late to catch up: skipping keeps recent data fresh but loses samples; catching up preserves counts but creates a burst that squeezes lower tasks."],
    p: ["Using a relative delay in a control loop so the sample rate drifts with load.", "Ignoring an overrun counter, so a slow degradation is never noticed until a deadline is missed."],
    v: "Log the wake-up time of the task for ten thousand periods under full system load and confirm the release jitter stays under the allowed value and no release is missed.",
    dep: ["timeouts-and-delay-lists","wraparound-safe-arithmetic","task-decomposition"]
  },
  "event-driven-task-pattern": {
    s: "A task that blocks on a queue, semaphore or notification and runs only when an event arrives, so it uses no processor time while idle and reacts at its priority.",
    d: "The task waits with a timeout for work to be signaled by an interrupt or another task, processes one event or a bounded batch, then waits again. Priority reflects the event's urgency. The worst-case response is the wake-up path (kernel overhead plus any higher-priority work) plus the processing time. For bursts, a queue buffers events. It is hard because event rates are not fixed: an unbounded burst can overload the system, so the design needs a maximum rate, a bounded queue and a defined action on overflow.",
    k: ["Blocking wait with timeout versus polling: blocking costs nothing while idle and responds fast, but needs a kernel object; polling is simple but wastes time and adds a delay of up to one polling period.", "Queue of events versus a flag set: a queue keeps every event and ordering, but costs memory and can fill; a flag is minimal but collapses repeated events into one."],
    p: ["No bound on the event rate, so a noisy input starves lower-priority tasks.", "Waiting forever without timeout, so a missing event stalls the task silently."],
    v: "Drive the event source at its specified maximum rate and a burst of ten times that, and confirm the task's response stays within its deadline at the maximum and that the overflow action fires correctly in the burst.",
    dep: ["message-queues","task-notifications","interrupt-safe-apis"]
  },
  "state-machine-framework": {
    s: "A small library for running state machines inside tasks, with explicit states, events and transitions, so behavior is a table that can be reviewed and tested.",
    d: "Each machine has a current state, a table or switch mapping state and event to an action and next state, and an event queue. Actions are run to completion: they never block, so the task returns to wait for the next event with bounded delay. Hierarchical variants share behavior between states. The structure makes sequences, such as startup or a protocol, easier to verify than nested conditions. It is hard because actions that block or loop break the run-to-completion rule and make timing unbounded, and the number of states and transitions grows quickly.",
    k: ["Table-driven versus code-driven machines: tables are easy to review, check for missing transitions and generate from models, but are less flexible than code for unusual logic.", "Run-to-completion actions versus blocking in actions: run-to-completion bounds the response time of each event, but forces long operations to be split into steps."],
    p: ["Calling a blocking kernel function inside an action, which stalls all later events of that machine.", "Events arriving in a state with no defined transition and being silently dropped."],
    v: "Run an exhaustive event-by-state test over the table on the target, and confirm every combination has a defined result and that the longest action meets its bound.",
    dep: ["event-driven-task-pattern","message-queues"]
  },
  "watchdog-supervision": {
    s: "A monitor task that expects each critical task to report progress within a deadline and refreshes the hardware watchdog only when all of them have, so any stall leads to a reset.",
    d: "Each supervised task sends a checkpoint (an alive signal, often with a sequence check) at least once per its period. A supervisor, running at a high priority, verifies that every task checked in within its window, in the right order, and only then services the hardware watchdog. A missing report starts the configured reaction. It is hard to get right: a supervisor that merely checks 'the task exists' misses a task spinning in a loop, and servicing from one place such as an interrupt defeats the whole mechanism.",
    k: ["Aggregated supervision by one task versus each task servicing the watchdog: one supervisor proves all tasks are alive; individual servicing is simpler but any one task can keep the dog fed for others.", "Window watchdog versus timeout watchdog: a window also catches code that runs too fast or loops through the service call, but demands precise timing of the refresh."],
    p: ["Refreshing the watchdog from a timer interrupt, which keeps working while the application is dead.", "A timeout set so long that a hung actuator task does real damage before the reset."],
    v: "Suspend each supervised task in turn on the running device and confirm that the reset or reaction happens within the configured limit every time, and that normal operation never triggers it over a long soak.",
    dep: ["hardware-watchdog-driver","task-lifecycle","software-timers"]
  },
  "fault-and-restart-policy": {
    s: "The defined response to each class of failure, such as a task overrun, an assertion or a protection fault: ignore, retry, restart the task, restart the device or enter a safe state.",
    d: "A table maps each detected fault to a reaction, a severity and a limit on repetition. A restart counter prevents endless loops: after several restarts in a window the system escalates to a higher reaction. Reaction code uses only bounded operations and runs from a known-good context. Outputs go to defined safe values before recovery. It is hard because reactions interact with state: restarting one task while others hold references to its queue or hold a lock it owned can create a second, worse failure.",
    k: ["Escalating reactions versus fixed reaction: escalation avoids both overreacting to a transient and looping on a persistent fault, but needs counters and thresholds that must be tuned and tested.", "Restart the task alone versus restart the device: single restart limits the outage, but the surviving tasks must tolerate the loss of a peer."],
    p: ["Restarting a faulty task in a tight loop that consumes all processor time.", "A restart that does not release the locks and buffers the old task held, leaking resources until a hang."],
    v: "Inject each fault class on the target and confirm the logged reaction matches the policy table, that outputs reach safe values, and that a repeating fault escalates after exactly the configured count.",
    dep: ["safe-state-and-recovery","fault-handlers","assertions-and-fault-log"]
  },
  "build-variants": {
    s: "Managing the several builds of one product (hardware revisions, feature sets, debug and release) from one source tree, with a record of which kernel options each uses.",
    d: "Variants differ in the task set, driver selection, kernel options such as tracing or protection, and board parameters. A build system selects a configuration, generates the kernel configuration header and the linker script, and names the output with version and variant. Each variant has its own timing and memory budget. It is hard because every variant is a separate system to test and certify; a conditional that is true in only one variant is code that is rarely tested elsewhere.",
    k: ["One configurable codebase versus separate branches: one codebase shares fixes and keeps variants consistent, but each conditional adds cases to test; branches are simpler per product, but diverge.", "Few release variants versus many tailored ones: few reduce test burden, but carry unused features in every device; many save footprint at the cost of test effort."],
    p: ["Testing the debug variant and shipping the release variant with different timing from the one verified.", "A configuration option that changes struct layout in one variant, causing mismatches with a prebuilt library."],
    v: "Build every shipped variant from a clean checkout, list its resolved kernel options and size report, and confirm the release variant used in the timing tests has the same option set as the one shipped.",
    dep: ["kernel-configuration","image-layout"]
  }
});
