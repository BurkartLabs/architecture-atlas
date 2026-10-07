// Details, part 4: software bus and services, operating system, drivers, radiation tolerance, cross-cutting.
ATLAS.details("satellite-flight-software", {
  "software-bus": {
    s: "The message-passing layer through which flight applications exchange commands, telemetry and status without knowing about each other or where each one runs.",
    d: "An application publishes a message with an identifier, and the bus delivers a copy to each subscriber's queue. Pipes have fixed depth and the bus counts what is dropped. Commands, housekeeping requests and data all travel as messages. It lets applications be added, removed or replaced without changing the others. It is hard because queues are bounded, a slow subscriber drops messages, and tracing why a message did not arrive means following it through routing tables and queues.",
    k: ["Asynchronous queues versus direct calls: queues decouple applications and allow independent restart, but add latency and the possibility of loss.", "Copying messages versus passing references: copies isolate applications from each other, but cost memory and time for large data."],
    p: ["A subscriber queue that fills silently drops the commands sent to it while the sender sees success.", "Message identifiers that collide between two applications deliver a command to the wrong one."],
    v: "Publish at a rate above a subscriber's capacity and confirm the drop counters, the event naming the pipe and the subscriber, while other subscribers of the same message still receive every message.",
    dep: ["publish-subscribe-routing","message-definitions","synchronization-primitives"]
  },
  "publish-subscribe-routing": {
    s: "The tables that say which applications receive which message identifiers, set at startup and changed by command, deciding the data flow of the whole vehicle.",
    d: "Each subscriber registers interest in identifiers, optionally with a queue depth and a quality-of-service setting. The router looks up each published message and puts a copy in each matching pipe. Ground can enable or disable routes, for example to stop a faulty source. It is hard because the routing table is effectively the architecture, errors in it make silent failures, and removing a route while messages are in flight has to be safe.",
    k: ["Static routes fixed at build versus dynamic subscription: static routes are predictable and analyzable, while dynamic ones are flexible but allow surprise load.", "Per-message-ID routing versus topic hierarchies: identifiers are fast and simple, while topics are friendlier for a large system but cost lookups."],
    p: ["A disabled route left disabled after a debugging session stops a subsystem from receiving commands.", "A subscriber added late in development doubles bus load and pushes a critical task past its deadline."],
    v: "Dump the routing table in flight configuration, compare with the interface specification, then disable one route by command and confirm only that subscriber stops receiving, with the change shown in telemetry.",
    dep: ["software-bus","message-definitions"]
  },
  "message-definitions": {
    s: "The single source of truth for the layout of every command and telemetry message, from which both flight code and ground databases are generated.",
    d: "A machine-readable definition lists each message: identifier, fields, types, units, byte order, ranges and descriptions. Tools generate flight structures, ground decoders and test data from it. Standards for packet headers give a common prefix. It is hard because the definition must change as the mission matures while old data must still be decodable, and because byte order, padding and alignment differences cause the most subtle mismatches.",
    k: ["Generate code from definitions versus hand-written structures: generation keeps ground and flight in step, but makes the toolchain part of the safety case.", "Packed wire layout versus native structures: packed layout is portable between machines, but costs conversion at each boundary."],
    p: ["A field added in the middle shifts all later fields and every ground decoder reads garbage.", "Units defined in a document but not in the definition leave each team converting differently."],
    v: "Generate flight and ground code from the same definition, send each message from the flight build to the ground decoder, and confirm every field decodes to its original value including extremes.",
    dep: []
  },
  "application-lifecycle": {
    s: "Starts, stops, restarts and reloads flight applications in a defined order, tracks their state and gives each its own task, memory and message pipes.",
    d: "A startup table lists applications, their priority, stack size and entry point. The executive creates their tasks, waits for initialization, and records state. On fault, an application can be restarted alone, reloaded from storage or terminated. Each application follows the same pattern: initialize, wait for message, process, repeat. It is hard because dependencies between applications are unwritten, a restart loses state that others rely on, and initialization order is fragile.",
    k: ["Restart one application versus the whole system: single restart limits disruption, but needs applications to cope with a peer disappearing.", "Dynamic loading of applications versus all in one image: dynamic loading allows replacing one, but needs a loader and adds a point of failure."],
    p: ["An application restarted without clearing its message pipe processes stale commands from before the fault.", "A crash loop restarts the same application hundreds of times a minute and starves others."],
    v: "Kill each application in turn on the test bed and confirm it restarts in the documented time, registers again with the bus, resumes service, and that a repeated crash stops after the retry limit.",
    dep: ["executive-services","rtos-kernel","software-bus"]
  },
  "executive-services": {
    s: "The core services that run first: task and application creation, error and reset handling, performance logging and the system log that survives a processor reset.",
    d: "It brings up the framework after the boot loader, owns the list of applications and tasks, handles resets by type (power-on or processor), keeps a reset-persistent area with counters and a log, and offers performance monitoring through marked code regions. It is the part a ground controller consults first after a reboot. It is hard because it must work with the least state, tell a clean reset from a fault, and preserve the evidence of what happened before the reset.",
    k: ["Reset-persistent log in a protected memory area versus in ordinary memory: persistence preserves evidence, but the region must survive reset without being trusted blindly.", "Processor reset on application failure versus isolating the application: reset is simple and thorough, but loses all running state."],
    p: ["A log area overwritten by the reset path itself leaves no evidence of the cause.", "A power-on and processor reset treated alike makes the system ignore saved state it should have used."],
    v: "Force a processor reset from a known fault and confirm the next boot reports reset type and cause, the persistent log holds entries from before the reset, and the reset counter increments by one.",
    dep: ["rtos-kernel","board-support-package","data-integrity-checks"]
  },
  "table-services": {
    s: "Provides applications with named data tables that are loaded, validated, updated and saved in a uniform way, so parameters can be changed without touching code.",
    d: "An application registers a table with its size, a validation function and an update function. Ground loads a new version into a shadow copy, requests validation, then activates, and the service handles memory sharing and persistence. Tables hold gains, limits and routing. It is hard because shared tables can change while an application is reading them, so the service must define when an update becomes visible.",
    k: ["Shadow copy with explicit activation versus in-place edit: shadow copy avoids half-updated data, but needs twice the memory.", "Per-application validation functions versus generic checks: application checks are precise, but each is code that has to be verified."],
    p: ["An application caching a table pointer keeps using old values after the table is swapped.", "A table whose version is not checked after a software update loads with the wrong meaning."],
    v: "Update a table while its owner runs at full rate, and confirm the owner sees either the whole old or whole new table at a cycle boundary, never a mixture, and that a failed validation leaves the active table untouched.",
    dep: ["executive-services","non-volatile-memory-driver"]
  },
  "mission-time-distribution": {
    s: "Distributes the time reference to all applications and units, including the one-second pulse and the time message, and tells consumers when time has jumped.",
    d: "A master time source sends a time message each second, with a hardware pulse that marks the exact instant. Applications and units latch their local counters on the pulse. The framework makes that time available as both elapsed and universal time, and announces correction events. It is hard because correct use requires the pulse and message to be matched, distributed delays vary, and a unit that misses a pulse drifts away from the rest.",
    k: ["Hardware pulse plus message versus message only: the pulse gives microsecond alignment, while a message alone is limited by software and bus latency.", "Distributed time to every unit versus central time stamps on receipt: distribution is accurate at source, while central stamping adds the transport delay."],
    p: ["A unit using the previous second's message after a missed pulse stamps data one second off.", "Time distributed before the clock has been set from ground is treated as valid."],
    v: "Send the time pulse and message to all units on the test bed and measure the offset between local clocks with a logic analyzer; confirm each stays within the budget and that one missed pulse is flagged.",
    dep: ["timers-and-system-clock","software-bus"]
  },
  "platform-abstraction-layer": {
    s: "A thin interface that hides the operating system and board details behind a common set of calls, so the same applications run on different processors and kernels.",
    d: "It defines tasks, queues, semaphores, file access, time and memory in terms of the framework, and implements them for each supported kernel and board. Applications use only these calls. This lets the framework be reused across missions and run on a desktop for development. It is hard because the abstraction must be thin enough not to hide timing behavior that matters, and the lowest common denominator across kernels removes capabilities that missions need.",
    k: ["A thin layer versus a rich portable runtime: thin keeps timing predictable and code small, rich gives more portability but hides cost.", "Run on a desktop build versus target only: a desktop build speeds development and testing, but hides timing and memory behavior of the target."],
    p: ["Behavior that differs between the desktop and target implementations, such as priority inversion, passes tests but fails in flight.", "An application that bypasses the layer to call the kernel directly becomes unportable."],
    v: "Run the same application suite against the desktop build and the real target, and confirm identical outputs for logical behavior and measure target timing to confirm each deadline is met on hardware.",
    dep: ["rtos-kernel","board-support-package"]
  },

  "rtos-kernel": {
    s: "The kernel that runs flight tasks with fixed priorities, handles interrupts and timers, and provides the guarantees about timing on which every higher layer depends.",
    d: "It manages tasks, interrupts, synchronization and time, with bounded worst-case latency for each service. Memory is allocated at startup and not afterwards. A spacecraft kernel is small enough to be inspected completely and often certified against a safety standard. It is hard because worst-case execution time must be known, not just the average, and because one task at the wrong priority can delay a control loop beyond its deadline.",
    k: ["Small custom kernel versus a general embedded kernel: custom is simple to verify, while general has more features and wider testing across users.", "Preemptive versus cooperative scheduling: preemptive meets deadlines with less care, but adds shared-data hazards."],
    p: ["A long interrupt-disabled section in one driver delays the control loop beyond its deadline.", "Kernel behavior at the stack limit is untested, and an overflow corrupts the neighboring task."],
    v: "Run the full task set at maximum load on target hardware while measuring scheduling latency with a hardware probe, and confirm worst-case latency for each task stays under its deadline over a long run.",
    dep: ["priority-scheduler","interrupt-handling","timers-and-system-clock"]
  },
  "priority-scheduler": {
    s: "Decides which ready task runs, using fixed priorities assigned from the task's rate and deadline, so timing can be analyzed before launch.",
    d: "Rate-monotonic assignment gives faster tasks higher priority. The scheduler picks the highest-priority ready task, preempts immediately when a higher one becomes ready, and uses a time slice only among tasks of equal priority, if at all. A schedule analysis uses worst-case times of each task to prove deadlines. It is hard because the analysis assumes times that are measured, and because shared resources add blocking not in the model.",
    k: ["Fixed priorities versus dynamic deadlines: fixed priorities are simple and analyzable, dynamic scheduling uses the processor better but is harder to bound.", "Rate-based priorities versus importance-based: rate-based supports proofs, but a rare critical task may get a low priority."],
    p: ["A task with an underestimated worst-case time causes a lower-priority control loop to miss its deadline only under rare conditions.", "Priority set by importance rather than rate lets a slow task block a fast one."],
    v: "Measure each task's execution time under worst-case input on target, run the schedulability analysis with those measured values, and confirm that a long run shows zero deadline misses with margin.",
    dep: ["rtos-kernel","timers-and-system-clock"]
  },
  "interrupt-handling": {
    s: "Takes hardware events such as timers, bus messages and sensor signals, does the minimum in the handler, and passes the work to a task with bounded delay.",
    d: "Handlers acknowledge the device, read what must be read at once, and signal a task through a semaphore or queue. Interrupt priorities are assigned with the same care as task priorities. Nested interrupts are limited or forbidden. It is hard because handlers share data with tasks, a missed or doubled interrupt from a faulty device can flood the processor, and a handler that does too much extends latency for everything else.",
    k: ["Short handler plus deferred task versus doing the work in the handler: deferral keeps latency low, but adds a task switch and a queue.", "Masking a misbehaving interrupt source automatically versus letting it run: masking prevents an interrupt storm, but silences the source that may be signaling something real."],
    p: ["An interrupt storm from a faulty bus controller consumes the whole processor and starves the control loop.", "A handler that calls a service not safe in interrupt context deadlocks the kernel."],
    v: "Drive the device at its maximum interrupt rate and then at a rate ten times higher; confirm the handler stays within its time budget, the storm is detected and masked, and control loop timing remains within limits.",
    dep: ["rtos-kernel","synchronization-primitives"]
  },
  "synchronization-primitives": {
    s: "Semaphores, mutexes and queues with priority inheritance, so tasks share data safely without letting a low-priority holder block a high-priority task indefinitely.",
    d: "A mutex held by a low-priority task temporarily raises that task to the priority of the highest task waiting, so a medium task cannot preempt it. Queues pass messages with bounded copy time. Time limits on every wait keep a missing signal from becoming a permanent hang. It is hard because priority inversion arises only in rare interleavings, and because nested locks create deadlock cycles that testing seldom finds.",
    k: ["Priority inheritance versus priority ceiling: inheritance is simple and general, while ceiling gives a hard bound and avoids deadlock but needs advance knowledge of all users.", "Timed waits everywhere versus unbounded waits: timeouts convert hangs into errors, but then every caller needs an error path."],
    p: ["A mutex without priority inheritance lets a medium task block a high one, which has caused a real mission to repeatedly reset.", "Two tasks taking the same two locks in opposite order deadlock once in a million runs."],
    v: "Construct the classic three-task inversion scenario on target and confirm that the high-priority task meets its deadline with inheritance enabled; also run a long stress test with lock-order checking active and zero violations.",
    dep: ["rtos-kernel"]
  },
  "memory-protection": {
    s: "Hardware-enforced limits on which memory each task can read and write, so a bug in one application cannot overwrite another or the kernel.",
    d: "A protection unit or memory management unit defines regions with access rights per task. The kernel loads the regions at each task switch and treats a violation as a fault, reporting it and typically restarting the task. Code regions are read-only. It is hard because many small flight computers have no protection hardware, and where they do, the cost in switch time and in configuring regions has to be paid in the control loop.",
    k: ["Per-task protection versus a single shared address space: protection contains faults, but costs switch time and design effort in region setup.", "Fail the task on violation versus reset the processor: failing the task limits impact, but leaves the system running with possibly damaged data."],
    p: ["A shared region mapped writable for convenience lets a faulty application corrupt the table that every other relies on.", "A protection violation handler that itself needs the memory that was violated hangs."],
    v: "Have a test application deliberately write outside its region, and confirm the write is blocked, the violation is logged with the task and address, only that task is restarted, and others continue within their deadlines.",
    dep: ["rtos-kernel","board-support-package"]
  },
  "static-memory-pools": {
    s: "Memory that is divided into fixed-size blocks at startup and handed out in constant time, so allocation never fails unexpectedly and never fragments over years.",
    d: "At initialization the system reserves pools for messages, buffers and tasks, sized from analysis of worst-case needs. Allocation takes a block from a free list, release returns it. General-purpose heap allocation after startup is typically forbidden. Usage counters show headroom. It is hard because sizing must anticipate worst-case, an exhausted pool is a fault at the worst moment, and a leaked block becomes a failure only after months.",
    k: ["Fixed pools versus a heap: pools give constant time and no fragmentation, but waste memory in unused blocks and require sizing up front.", "Fail an allocation request versus block the caller: failing lets the caller degrade gracefully, but every caller needs a plan for failure."],
    p: ["A message buffer never released on one error path drains the pool slowly until the bus stops.", "Pool sizes set for a nominal mode run out in a rare burst of events."],
    v: "Run a soak test with fault injection at the maximum rates for the equivalent of months, and confirm the pool's free count returns to its baseline after each burst and the minimum free value stays above the margin.",
    dep: ["rtos-kernel"]
  },
  "timers-and-system-clock": {
    s: "The hardware timer and software services that give the system a steady tick, time-outs and an elapsed-time counter on which every periodic task and time stamp rests.",
    d: "A hardware counter generates a periodic interrupt for the scheduler and a free-running count for time stamps. Software timers build delays and periodic activation on top. The clock source is an oscillator with known drift. It is hard because the tick drives every deadline, jitter in it spreads through the whole system, and overflow of a counter after a year in orbit is the sort of event that no short test reveals.",
    k: ["Fixed periodic tick versus tickless timing: a tick is simple and predictable, while tickless saves power but makes timing analysis harder.", "A 32-bit counter with rollover handling versus a 64-bit counter: 64 bits never wraps in a mission, but costs more on small processors."],
    p: ["A counter rollover at about 49 days or a few years is not handled and every timer misfires at once.", "A tick interrupt delayed by a long critical section makes timers fire in a burst."],
    v: "Run the system with the counter preset to just before its rollover value, and confirm every periodic task, time-out and time stamp continues correctly across the wrap without a gap or a repeat.",
    dep: ["interrupt-handling","board-support-package"]
  },
  "partitioning-kernel": {
    s: "A kernel mode that gives each application a fixed time slot and a private memory region, so a failure in one cannot take time or memory from another.",
    d: "A static schedule divides each major cycle into windows for partitions, and memory protection isolates their spaces. Communication between partitions goes through defined channels. It allows applications of different criticality, such as payload and attitude control, to share a computer safely. It is hard because the fixed schedule wastes slack, interfaces between partitions must be designed, and the isolation depends on the hardware's protection being used correctly.",
    k: ["Partitioned computer versus separate computers: partitions save mass and power, but concentrate risk in one processor and one kernel.", "Fixed time windows versus priority scheduling: windows guarantee isolation, while priorities use the processor better but let one task starve another."],
    p: ["A partition window sized to typical load causes missed deadlines in a rare heavy cycle.", "A shared device driver outside the partitions becomes a path by which a fault crosses boundaries."],
    v: "Run one partition into an infinite loop and confirm the others still run on schedule and meet their deadlines, and that the faulty partition is stopped at the end of its window.",
    dep: ["rtos-kernel","memory-protection","priority-scheduler"]
  },

  "boot-rom-and-loader": {
    s: "The first code to run after reset: a small, fixed program that tests the hardware minimally, selects a software image, checks it and starts it.",
    d: "Stored in memory that cannot be altered in flight, the boot code sets up the processor, tests critical memory, reads the boot table, verifies the selected image and jumps to it. It falls back to alternates on failure and keeps a way to accept uploaded software even with no valid image. It is hard because it must be perfect at launch, must start from any state, and has the least information about what went wrong before the reset.",
    k: ["Minimal boot code versus a full-featured loader: minimal code is easier to prove, but leaves fewer recovery options when images are bad.", "Full memory test at every boot versus a short test: a full test finds more faults, but delays startup when it matters most."],
    p: ["A boot path that assumes memory contents from before the reset fails after a power loss that cleared them.", "A loader that waits forever for a valid image prevents the watchdog from helping."],
    v: "Reset the board from power-on and from each fault state on the bench, and confirm it reaches the application in the stated time, selects the correct image, and with no valid image enters the upload-ready state.",
    dep: ["image-integrity-check","non-volatile-memory-driver","board-support-package"]
  },
  "board-support-package": {
    s: "The board-specific code that initializes the processor, memory, clocks and interrupt controller, and connects the kernel to the particular flight computer.",
    d: "It configures memory controllers, error correction, clocks, pin functions and interrupt routing, and provides the entry points the kernel and drivers need. A change of board changes this layer and little else. It is hard because errata and undocumented behavior of the hardware appear here, a wrong register setting works on the bench and fails across temperature, and the engineers who understand the hardware are often few.",
    k: ["Writing the layer per board versus using a vendor package: per-board code is lean and understood, while a vendor package saves time but brings unreviewed code.", "Verifying settings at startup versus trusting them: checking read-back registers costs time, but catches configuration lost to radiation upsets."],
    p: ["A memory timing setting that works at room temperature fails only in the cold, causing rare resets.", "Interrupt priorities initialized differently from the design change the real-time behavior without any code change elsewhere."],
    v: "Boot the board across the temperature range in a thermal chamber while running the full task set, and confirm no memory errors, resets or timing violations are recorded.",
    dep: ["memory-edac"]
  },
  "spacecraft-data-bus-driver": {
    s: "Drives the vehicle's main data bus, sending commands to units and collecting their replies on a fixed schedule, with redundancy handling and error detection.",
    d: "The bus has one controller and many remote units, and the driver runs a cyclic schedule of transfers: each unit has slots for commands and data. It handles retries, switching to the redundant bus on repeated errors, and reports the status of each transaction. It is hard because the bus is shared by everything, a babbling unit can block the whole bus, and timing of the schedule determines data age throughout the vehicle.",
    k: ["Command-response with a single controller versus peer-to-peer messaging: command-response is deterministic and simple, but depends on one controller.", "Retry immediately versus switch buses on first error: retry avoids needless switching, but delays the real fault's discovery."],
    p: ["A unit that transmits out of turn blocks the bus until the controller isolates it.", "A schedule edited to add a unit pushes later transfers past their time window."],
    v: "Run the bus at full schedule with a injected error on each unit in turn, and confirm retries, bus switch and isolation happen as specified and the other units' data stay on time.",
    dep: ["board-support-package","interrupt-handling"]
  },
  "serial-and-spi-drivers": {
    s: "Drivers for point-to-point links and chip-level buses that connect sensors, radios and memory devices, with timeouts, framing and error counting.",
    d: "Each driver configures the controller, moves bytes with interrupts or DMA, enforces timeouts and exposes a simple read and write interface with status. Counters track framing, parity and overrun errors. It is hard because the devices at the other end vary in how they fail: some hang the bus, some return plausible stale data, and the driver is the only place where those behaviors can be contained.",
    k: ["Interrupt-driven transfers versus DMA: DMA frees the processor for high rates, but adds buffer management and completion handling.", "Blocking calls with a timeout versus asynchronous completion: blocking is simpler to use, asynchronous avoids stalling the caller but needs more states."],
    p: ["A driver without a timeout hangs its task forever when a unit stops answering.", "Receive buffers overrun at a high data rate and the lost bytes shift all later frames."],
    v: "Disconnect the device, send garbage and send a flood of data on the bench, and confirm the driver returns an error within the time-out, counts the errors, and recovers when valid traffic resumes.",
    dep: ["interrupt-handling","board-support-package"]
  },
  "analog-and-discrete-io": {
    s: "Reads analog voltages, currents and status lines and drives on-off signals, which is how software sees battery, temperatures and switch positions and commands relays and valves.",
    d: "Converters sample inputs through multiplexers on a schedule, and the driver converts counts to engineering units. Output lines are set through registers, often with a readback to confirm. Pulse commands to relays have a fixed duration. It is hard because outputs have physical consequences, input noise needs filtering without hiding real events, and a stuck multiplexer returns another channel's value.",
    k: ["Read back every output versus trust the write: readback confirms the action, but costs another read and a channel for each output.", "Sample fast and filter in software versus filter in hardware: software filtering is adjustable, but needs processing and can alias."],
    p: ["A multiplexer fault gives temperature readings that actually come from the previous channel.", "A pulse command whose duration depends on a task's timing varies with load and may be too short."],
    v: "Apply known voltages to each analog input and toggle each output on the bench; confirm readings within tolerance, readback matches the commanded state and pulse widths remain constant under full processor load.",
    dep: ["board-support-package","interrupt-handling"]
  },
  "radio-interface-driver": {
    s: "Drives the transceiver: configures frequencies, rates and modes, moves frames between software and the radio, and reads lock and signal strength.",
    d: "It writes the radio's control registers, feeds frames to the transmitter with the right timing, collects received frames, and reports lock, signal strength and temperature. Mode changes happen at pass boundaries. It is hard because transmitters must be commanded exactly and kept inside power limits, receive paths run in all modes including with a failed processor, and a configuration mistake makes the vehicle unreachable.",
    k: ["Software-controlled radio versus a fixed-function radio: software control is flexible and updatable, but a bug can silence the radio, while fixed function is reliable but rigid.", "Frequency and rate changes via stored sequence versus live command: stored changes are tested on ground, but live changes help when conditions differ."],
    p: ["A radio configuration saved in volatile memory reverts to defaults on reset, on a frequency ground is not listening to.", "Transmitter enabled with the antenna switch in the wrong position damages the output stage."],
    v: "Run an end-to-end link test with a ground station simulator at each rate and mode, and confirm lock acquisition, frame error rate and transmit power match the specification, including after a reset.",
    dep: ["serial-and-spi-drivers","analog-and-discrete-io"]
  },
  "non-volatile-memory-driver": {
    s: "Reads and writes persistent memory such as flash or magnetic RAM, handling erase blocks, wear, bad blocks and error correction so higher layers see reliable storage.",
    d: "Writes to flash must erase whole blocks first, are slow, and wear the cells. The driver maps logical to physical blocks, avoids bad ones, spreads wear, applies error correction and handles a power loss mid-operation. Faster magnetic or ferroelectric memory suits small important data. It is hard because radiation affects stored cells and controllers, and because erase and write failures can occur at any time.",
    k: ["Flash for bulk versus magnetic RAM for critical data: flash is dense and cheap per bit, while magnetic RAM has no wear, but holds far less.", "Wear leveling versus fixed mapping: leveling extends life, but makes mapping state itself something that must survive power loss."],
    p: ["A power loss during a block erase leaves it half erased, and later reads return a mix of old and new.", "A bad block discovered only on write loses data that was already acknowledged."],
    v: "Cut power at random points during writes and erases on the bench over many cycles, and confirm that after each restart all acknowledged data reads back correctly and the block map is consistent.",
    dep: ["memory-edac","board-support-package"]
  },
  "unit-drivers": {
    s: "Drivers for each sensor and actuator, such as gyros, wheels, trackers and receivers, that translate the unit's own protocol into the interface the applications use.",
    d: "A driver knows one unit's command set, data format, timing and failure modes. It initializes the unit, polls or accepts its data, checks status words and converts the unit's native format. It reports faults in a common form. Replacement of a unit means writing a new driver and leaving applications unchanged. It is hard because interface documents and the delivered unit differ, and because many faults only show up when the unit is integrated.",
    k: ["Driver per unit type with a common interface versus applications that know the units: a common interface lets units be swapped, but hides unit-specific capability.", "Driver-level fault filtering versus passing all data upward: filtering gives the application clean data, but the application cannot see the underlying fault."],
    p: ["A driver written to the document rather than the real unit fails on its first power-up on the vehicle.", "A unit's status word ignored by the driver delivers data the unit itself has marked invalid."],
    v: "Run each driver against the real engineering unit through its full command list, and confirm outputs match reference values, and that injected faults in the unit's status produce the documented driver error.",
    dep: ["spacecraft-data-bus-driver","serial-and-spi-drivers","analog-and-discrete-io"]
  },

  "memory-edac": {
    s: "Hardware error-correcting codes on memory with a background scrubber that reads and rewrites every word, so single-bit upsets are corrected before a second one makes them unrecoverable.",
    d: "Each stored word carries extra check bits. A read corrects a single flipped bit and detects a double flip. A scrubber walks the memory at a set interval, correcting and writing back. Counters report corrections by region, giving a measure of the radiation environment. It is hard because scrub rate must exceed the upset rate with margin, double errors must be handled as faults, and correction does nothing for registers and caches outside the protected memory.",
    k: ["Hardware scrubbing versus software scrubbing: hardware is fast and independent of tasks, while software needs processor time but is changeable.", "Scrub rate high versus low: high rates catch upsets sooner, but compete with the processor for memory access and increase power."],
    p: ["A scrubber that stops running after a fault allows errors to accumulate until double errors appear.", "Uncorrectable errors in code memory are handled like data errors and execution continues on corrupted instructions."],
    v: "Inject single and double bit errors in the test bed memory, and confirm single errors are corrected and counted, double errors raise the defined fault, and the scrubber clears a planted upset within one scrub interval.",
    dep: []
  },
  "watchdog-timers": {
    s: "Hardware timers that must be periodically reset by healthy software; if the software hangs, the timer expires and forces a reset or switch to the backup computer.",
    d: "The simplest kicks a single timer from a main loop. Better designs require several tasks to report progress before the timer is reset, so a hung task cannot be masked by a healthy one. An expiry triggers a processor reset, and repeated expiry escalates to a power cycle or switch to the spare. It is hard because kicking from a timer interrupt hides a hung main program, and because the timeout must be longer than the longest legitimate pause but short enough to matter.",
    k: ["Multi-task progress checks versus one kick from a single loop: multi-task checks catch partial hangs, but are more complex and can reset on a slow-but-correct task.", "External hardware watchdog versus on-chip: external is independent of the processor's faults, but adds a part and its connections."],
    p: ["A watchdog serviced from a periodic interrupt keeps running while every application is hung.", "A timeout set too tight causes resets in a rare slow path, and the vehicle enters a reset loop."],
    v: "Hang each application in turn and the whole main loop on the test bed, and confirm the watchdog expires at its set time, the reset reason is recorded, and repeated expiry escalates as designed.",
    dep: []
  },
  "latchup-protection": {
    s: "Current monitors that detect the abnormal current of a latchup, a radiation-induced short inside a chip, and cut and restore power quickly before the device is destroyed.",
    d: "A sensor compares supply current to a threshold with a response time of microseconds to milliseconds. When exceeded, a switch removes power, waits, and restores it, then the software restarts the device and checks it. Events are counted and logged. It is hard because thresholds must be above normal load peaks and below damage level, a power cycle loses the device's state, and commercial parts can latch up in ways the margin does not cover.",
    k: ["Hardware current limiter versus software monitoring: hardware reacts in time to save the part, while software is too slow but offers flexibility.", "Automatic power cycle versus ground-commanded: automatic saves the part, but cycles loads in a way the mission must tolerate."],
    p: ["A threshold set above a part's damage current lets the latchup burn it out before the limiter trips.", "A processor power cycle triggered while it writes non-volatile memory corrupts the data."],
    v: "Use a current source on the bench to simulate a latchup current step, and confirm power is removed within the specified time, restored after the delay, the device restarts and the event counter increments.",
    dep: ["load-switching"]
  },
  "processor-redundancy": {
    s: "Two or more flight computers where one runs and the other waits or runs in parallel, with a defined way to hand control from one to the other when the first fails.",
    d: "A cold spare stays off until needed, a warm spare runs but does not drive the vehicle, and a hot pair run together and check each other. A supervisor, often hardware, decides which one drives the buses. State needed for takeover is copied regularly or restored from storage. It is hard because failure of the supervisor defeats the whole scheme, and the spare may carry the same software defect as the unit that failed.",
    k: ["Cold spare versus hot spare: cold saves power and avoids shared radiation damage, but a takeover takes longer and loses recent state.", "Identical software on both versus diverse versions: identical is simpler to build, but shares every bug, while diverse versions cost twice."],
    p: ["A spare given stale state after takeover repeats actions already done, such as a thruster firing.", "A takeover caused by a software bug repeats on the spare, so both computers fail in turn."],
    v: "Fail the active computer by removing its power during a representative operation, and confirm the spare takes control within the limit, state is consistent, and no actuator receives conflicting commands.",
    dep: ["watchdog-timers","spacecraft-data-bus-driver","data-integrity-checks"]
  },
  "lockstep-and-voting": {
    s: "Running the same computation on duplicate or triplicate hardware and comparing outputs every cycle, so a radiation upset in one copy is caught or outvoted instantly.",
    d: "In lockstep, two cores execute the same instructions and a comparator flags any difference, forcing a reset. With three copies a majority vote masks the faulty one and keeps running while it is resynchronized. Voting can also apply to data in registers, and to separate units such as sensors. It is hard because the comparison logic is itself a possible failure, copies sharing a clock or supply share faults, and resynchronizing needs the state of the good copy.",
    k: ["Dual lockstep with reset versus triple voting with masking: dual detects but interrupts operation, while triple continues but needs a third copy and a voter.", "Voting at the hardware level versus in software: hardware is transparent to code, software voting allows selective protection of critical data only."],
    p: ["Copies fed by one clock fail together when a glitch hits the clock line.", "A resynchronization that copies state from the wrong copy spreads the fault to the good ones."],
    v: "Inject a bit flip into one copy on the bench or by radiation test, and confirm the comparator flags it, the output stays correct with voting or the processor resets with lockstep, and operation resumes in the specified time.",
    dep: ["watchdog-timers"]
  },
  "data-integrity-checks": {
    s: "Checksums, cyclic codes and redundant storage applied to critical data, such as tables, images and counters, so corruption is detected before it is used.",
    d: "Each protected block carries a code computed when written and checked when read or on a periodic sweep. Critical variables may be stored in triplicate or as value plus its complement. When corruption is found, the system restores from a copy, reloads from non-volatile storage or reports a fault. It is hard because protection costs time and memory, an unprotected structure is always found by the radiation, and a check that runs too rarely finds damage after it has been used.",
    k: ["Detect and reload versus correct in place: reload is simple and uses plain checksums, but needs a good copy, while correction needs more redundancy.", "Check on every use versus periodic sweep: every-use is safest but costs time in the control loop, sweeps are cheap but allow a window of exposure."],
    p: ["Checksums that cover data but not the pointer to it fail to catch a corrupted pointer.", "A code recomputed after corruption, such as updating the checksum on write of a bad value, blesses the damage."],
    v: "Flip single bits in each protected structure on the test bed and confirm each is detected within its sweep period, the correct recovery action runs, and an event identifies the structure and region.",
    dep: ["memory-edac"]
  },
  "upset-logging": {
    s: "Counters and logs of every correction, reset and latchup, kept so engineers can see the real radiation environment and the health of the protection mechanisms.",
    d: "Each protection mechanism increments a counter by type and region, and notable events are stored with a time stamp in a reset-persistent area. Telemetry reports them regularly, and ground trends upset rates against orbit position, such as the South Atlantic anomaly or solar events. It is hard because the logging code itself must survive upsets, and because rates change with solar activity, so alarms based on fixed levels either miss storms or trigger constantly.",
    k: ["Counters reported in routine telemetry versus detailed logs only on request: counters are compact and always available, while logs show detail but cost space.", "Adaptive thresholds versus fixed: adaptive thresholds follow space weather, but need history and add logic."],
    p: ["Counters held in ordinary memory are reset by the very reboot that they are meant to record.", "A rise in correction rates interpreted as sensor noise delays response to a degrading memory device."],
    v: "Inject a sequence of corrections, resets and latchups on the bench, and confirm every event is counted in the right category, survives a processor reset, and appears in the next telemetry packet.",
    dep: ["memory-edac","event-reporting","executive-services"]
  },
  "autonomy-allocation": {
    s: "The decision about which choices the spacecraft makes alone and which wait for ground, set by the delay, the contact time and the cost of a wrong decision.",
    d: "Each function sits somewhere between fully ground-directed and fully autonomous. Close-in or distant vehicles with long delays and short contacts need more onboard decisions, while low orbit vehicles with frequent passes can leave more to people. The allocation fixes how big the stored plans, rules and constraint checks must be, how much the onboard code must understand, and how operators will find out what the vehicle did.",
    k: ["More onboard autonomy versus more ground control: autonomy responds faster and uses scarce contacts better, but ground control is easier to review and to correct.", "Rules that explain themselves in events versus silent action: explained actions keep operators informed, but cost telemetry volume."],
    p: ["Autonomy added late to cover a fault is not tested in combination with existing rules.", "Operators assume ground still controls a function that was moved onboard and issue conflicting commands."],
    v: "For each autonomous function, review in a recorded flight pass that the event log shows what triggered it, what it did, and that a ground command can override or disable it.",
    dep: []
  },
  "fault-containment": {
    s: "The rules about how far a fault can spread: separate power, buses, memory and software partitions so a single failure stays in the smallest region possible.",
    d: "Fault containment regions are decided early: which units share power, which share a bus, which applications share memory and a processor. Interfaces between regions are designed to carry no fault from one side to the other, with isolation, limits and timeouts. It shapes the redundancy scheme, the FDIR levels and the partitioning of software. It is the main reason that a failure of one unit does not become a failure of the vehicle.",
    k: ["Many small regions versus few large ones: small regions limit spread, but need more interfaces, isolation and mass.", "Hardware isolation versus software isolation: hardware holds even when the software is wrong, but costs parts and is hard to change after launch."],
    p: ["A shared ground reference or supply links two regions that were assumed independent.", "A fault injected in test only at the unit level misses the failures that cross interfaces."],
    v: "Inject a fault in each region, such as a short, a babbling bus unit or a corrupted memory region, and confirm that no function outside that region misses a deadline or changes state.",
    dep: ["memory-protection","redundancy-manager","load-switching"]
  },
  "timing-determinism": {
    s: "The requirement that the time every action takes and the order of events be known and bounded, so control loops, bus schedules and fault responses meet deadlines every time.",
    d: "Determinism is designed in through fixed schedules, bounded queues, no dynamic allocation, known worst-case execution times and avoidance of unbounded waits. Time-triggered buses and static task sets are common. It decides the kernel, bus, driver and framework design. Performance features such as caches and speculation make timing harder to bound and are often restricted or disabled in critical code.",
    k: ["Time-triggered scheduling versus event-triggered: time-triggered is easy to prove, but wastes capacity, while event-triggered responds fast but is hard to bound.", "Disabling caches for predictability versus using them for speed: disabling gives provable timing, but reduces throughput several times."],
    p: ["A new software version that adds one function shifts every task's phase and breaks a bus slot alignment.", "Worst-case time measured on a benchmark that misses the real worst path gives a false margin."],
    v: "Measure end-to-end latency from sensor input to actuator output over a long run on target hardware under full load and fault injection, and confirm its maximum stays below the requirement with the stated margin.",
    dep: ["priority-scheduler","timers-and-system-clock"]
  },
  "resource-budgets": {
    s: "The division of scarce power, processor time, memory, bus bandwidth and downlink among all functions, with margins held back for growth and for surprises.",
    d: "Each resource has a total, an allocation per function and a reserve that is reduced only by a formal decision. Budgets are tracked from early design through launch, and each late change must show what it costs. In flight, the same numbers feed power enforcement, the data recorder policy and the downlink priorities. A function that exceeds its share is a defect even if the vehicle still works.",
    k: ["Large margins versus tight budgets: large margins absorb late change and aging, but waste hardware that costs mass and money.", "Static allocation versus dynamic sharing: static is predictable and analyzable, while dynamic sharing uses resources better but allows interference."],
    p: ["Margins consumed quietly through small late changes leave nothing for the one fault that needs recovery effort.", "Each team's budget is met, but the sum at the shared bus or processor is not."],
    v: "Measure real power, processor load, memory use and downlink volume in a full-mission simulation on the test bed and compare with each budget; every function must stay within its allocation and total margin remain above the required minimum.",
    dep: ["power-budget-enforcer","static-memory-pools","priority-scheduler"]
  },
  "verification-fidelity": {
    s: "How closely each test resembles flight, from unit tests through simulation and the test bed to the actual vehicle, and what each level cannot reveal.",
    d: "Every verification stage has a blind class: a simulator cannot show hardware timing quirks, a bench cannot reproduce the radiation environment, and ground testing cannot reproduce weightlessness. The plan assigns each requirement to the lowest-cost level that can really show it, and keeps a record of what was never tested in flight form. It shapes how much of the flight software gets exercised on real hardware, and which fault injections are performed.",
    k: ["More testing on high-fidelity hardware versus more in simulation: hardware finds timing and electrical problems, but is scarce, while simulation runs many cases.", "Test as you fly versus test each piece in isolation: full-system tests find interactions, but isolate failures poorly."],
    p: ["A verified-by-analysis item that depends on a model tuned to a test result is counted as independent confirmation.", "A configuration of test cables and ground equipment differs from flight and conceals a fault."],
    v: "For each safety-critical requirement, trace to the test that exercised it on flight hardware or state explicitly that it was not, and sample three of them by re-running the test and obtaining the recorded results.",
    dep: []
  },
  "unreachable-maintenance": {
    s: "The consequences of a vehicle that cannot be touched: every update, repair and diagnosis happens through a slow, intermittent link, so the software is built to be changed safely from afar.",
    d: "Because nobody can reset a switch or replace a board, the software carries its own recovery paths, update mechanisms, memory visibility and diagnostic data. Mission lifetimes of ten or more years mean the ground team and tools change, so documentation and test beds must outlast their authors. It determines the existence of the golden image, memory dump, tables for everything, and the extensive event logging.",
    k: ["Building in a way to change everything versus freezing the design: changeability allows repair, but each added path is itself a risk.", "Rich diagnostic telemetry versus bandwidth for science: diagnostics speed recovery, but compete with the data the mission exists to return."],
    p: ["After years in orbit, the one engineer who knew a mechanism has left and the documentation is wrong.", "A repair path used for the first time in flight turns out never to have been tested against the current build."],
    v: "Perform a full recovery drill on the test bed from a deliberately corrupted state using only the commands and data available over the link, and confirm a team that did not write the software can complete it from the documents.",
    dep: ["golden-image-rollback","memory-load-and-dump","upset-logging"]
  },
});
