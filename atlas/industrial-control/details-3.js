// Details part 3: controllers, safety instrumented systems, redundancy.
ATLAS.details("industrial-control", {
  "controller-cpu": {
    s: "The processor module of a programmable controller with its firmware, memory and communication ports, built to run one program cycle reliably for years without a reboot.",
    d: "Firmware provides the real-time executive, the program interpreter or compiled runtime, the I/O drivers and the network stacks. The module holds program and data memory, a battery or flash for retention, a real-time clock and diagnostics. It is mounted in a rack or on a rail, powered from a regulated supply, and sealed for temperature and vibration. It is hard because it must be predictable above all: no unbounded memory allocation, no background task that stretches a scan, and firmware that is updated rarely and carefully.",
    k: ["Proprietary runtime versus a general-purpose operating system: proprietary runtimes give tight, predictable timing and long support, but limit software choices and integration with standard tools.", "Rare firmware updates versus frequent patching: rare updates keep a verified baseline, but leave known flaws in place for years."],
    p: ["A firmware update changes timing or instruction behavior and a loop that was stable becomes unstable.", "A battery fails unnoticed and a power loss erases the program."],
    v: "Power-cycle a test controller with an active program and confirm it restarts to its configured state, reloads the program from flash, restores retained values and reports clock and battery status.",
    dep: ["watchdog-and-faults","scan-cycle","retentive-memory"]
  },
  "scan-cycle": {
    s: "The endless loop of reading all inputs, executing the program, writing all outputs and servicing communications, whose duration is the controller's basic time step.",
    d: "At the start of each cycle the controller copies input values into a snapshot, executes program logic against that snapshot, then writes the resulting outputs together. Housekeeping such as communication handling follows. Typical cycles run from one to a few hundred milliseconds. The cycle time grows with program size and must stay under a limit. It is hard because everything in the plant is quantized to the scan: logic cannot see events shorter than it, and any overrun delays every output.",
    k: ["Fixed-period cycle versus free-running cycle: a fixed period gives constant sample time for loops, but fails if logic overruns, while free-running is simple but varies timing.", "Snapshot of inputs versus reading inputs directly during logic: a snapshot makes logic consistent within a cycle, but adds up to one cycle of latency."],
    p: ["A pulse shorter than the scan time is missed completely, so a count is lost.", "A large loop or data copy pushes cycle time past the watchdog limit and the controller faults."],
    v: "Read the minimum, average and maximum scan time over a day of production and confirm the maximum stays under half the watchdog limit and under the shortest time constant the logic must resolve.",
    dep: ["process-image","task-scheduler","controller-cpu"]
  },
  "task-scheduler": {
    s: "The runtime's mechanism for running different parts of the program at different rates or on events: periodic fast tasks, slower tasks, and event-triggered tasks with priorities.",
    d: "Programs are assigned to tasks with a priority and an interval or trigger. A fast task may run every few milliseconds for motion, a normal task every 50 ms for sequences, and a slow one every second for statistics. Higher priority tasks preempt lower ones. Data shared between tasks needs care to stay consistent. It is hard because preemption makes behavior depend on timing, and a lower task can be starved or see a half-updated structure.",
    k: ["Preemptive priority tasks versus a single cooperative scan: preemption meets tight deadlines for fast logic, but makes shared data consistency a design problem.", "Many small tasks versus a few large ones: small tasks isolate timing, but each adds overhead and interactions that are harder to analyze."],
    p: ["A slow task reads a structure while a fast task is halfway through updating it and acts on mixed old and new values.", "A low-priority task never completes under load, and its alarms or logging silently stop."],
    v: "Load a test controller to its expected peak and confirm each task's measured period and jitter stay within its configured limits, and that the lowest-priority task still completes every cycle.",
    dep: ["scan-cycle","controller-cpu"]
  },
  "function-block-library": {
    s: "Reusable, tested program units for common equipment and calculations, such as motors, valves, interlocks, scaling and limiters, that every project instantiates rather than rewrites.",
    d: "A block has typed inputs and outputs, internal state and defined behavior in all modes, such as auto, manual and out of service. Instances are created per device and bound to I/O and to HMI faceplates. Libraries are versioned and distributed to projects. It is hard because a library is a shared dependency: a bug fix reaches every plant that updates, a change in behavior can surprise operators, and plants hesitate to update running logic.",
    k: ["Company-wide library versus vendor-supplied blocks: a company library encodes local practice and fits faceplates, but needs maintenance, while vendor blocks are supported but generic.", "Updating instances in place versus freezing versions per project: in-place updates spread fixes, but alter live behavior, so freezing is safer and leaves old bugs."],
    p: ["A block's output state after a mode change differs from what the HMI expects and the equipment starts unexpectedly.", "Different plants run different library versions, and the same fix has to be done several times."],
    v: "Test a motor block through every mode and fault input in a simulator, and confirm outputs, alarms and status bits match the block's documented truth table in every case.",
    dep: ["iec-61131-languages","task-scheduler"]
  },
  "pid-control": {
    s: "Feedback loops that compare a measured value with a target and adjust an output using proportional, integral and derivative terms, the basic engine of continuous process control.",
    d: "Each loop reads a process variable, computes error against a setpoint and drives an output, such as a valve position, at a fixed sample time. Practical blocks add output limits, anti-windup, bumpless switching between manual and automatic, filtering and gain scheduling. Cascade, ratio and feedforward structures combine loops. It is hard because tuning depends on process dynamics that change with load, fouling and wear, and because poor loops waste energy and product without ever alarming.",
    k: ["Aggressive tuning versus conservative tuning: aggressive tuning rejects disturbances quickly, but risks oscillation as the process changes, while conservative tuning is stable and slow.", "Single loops versus cascade or advanced control: advanced structures reduce variation, but need good models and are fragile when an instrument fails."],
    p: ["Integral windup when an output saturates causes a large overshoot once the valve is free to move.", "A loop left in manual after maintenance runs the process open loop for weeks."],
    v: "Make a small setpoint step on a running loop and record the response: overshoot, settling time and output movement should match the design values. Switch manual to automatic and confirm there is no output jump.",
    dep: ["scan-cycle","analog-io-modules","final-control-elements","function-block-library"]
  },
  "sequence-control": {
    s: "Logic that moves equipment through ordered steps with conditions and timeouts, such as start-up, shutdown, cleaning and transfer, usually written as a state machine.",
    d: "A sequence holds a current step, outputs for that step, and transition conditions to the next, such as a level reached or a time elapsed. Each step has a timeout that leads to a fault path. Holds and aborts must be handled from any step. Sequence charts show the flow visually. It is hard because the sequence must be correct from every starting condition, including after power loss, and each step must leave equipment safe if the sequence stops there.",
    k: ["Explicit step state machine versus nested conditions in ladder logic: explicit steps are easy to inspect and restart, but need a standard structure, while ad hoc logic is quick and impossible to trace later.", "Automatic restart after power loss versus requiring operator confirmation: automatic restart recovers quickly, but may start equipment into a changed situation."],
    p: ["A step has no timeout, so the sequence waits forever for a limit switch that has failed.", "After a controller restart, the sequence resumes at step one with equipment already part-way through the process."],
    v: "Interrupt a test sequence at every step, by stopping the controller and by raising a fault, and confirm outputs go to the documented state and the restart path is valid from each step.",
    dep: ["function-block-library","process-image","watchdog-and-faults"]
  },
  "motion-control": {
    s: "Coordinated position, speed and torque control of drives and axes at fast update rates, with profiles, gearing and synchronization between axes.",
    d: "A motion controller generates trajectories, closes position and velocity loops at sub-millisecond to millisecond rates, and sends commands to drives over a deterministic network. Axes are grouped for coordination such as gearing and cam profiles. Homing, limits and following-error checks protect machinery. It is hard because several axes must share one precise time base, and because delayed or jittery updates cause vibration, poor surface finish or mechanical damage.",
    k: ["Control loops in the drive versus in the central controller: loops in the drive give the fastest response and tolerate network jitter, while central loops allow tighter coordination but need a deterministic network.", "Software trajectory versus mechanical cam: software is flexible for recipe changes, but a fault in software can move axes into each other."],
    p: ["Network jitter causes an axis to receive late commands, and it oscillates or trips on following error.", "Software limits are used instead of hardware end limits, and a logic error drives an axis into its stops."],
    v: "Run two coupled test axes through a reference profile and record following error: it should stay within the tolerance. Pull one drive's network cable and confirm all axes stop in the specified safe way.",
    dep: ["industrial-ethernet","motor-starters-and-drives","task-scheduler"]
  },
  "process-image": {
    s: "The controller's memory copy of all input and output values for the current scan, which logic reads and writes and which the system exchanges with I/O hardware at fixed points.",
    d: "Before logic runs, input values from modules are copied into the image; logic reads and writes the image; afterwards the output image is sent to the modules. Direct reads or writes bypass it for time-critical points. Network I/O updates the image asynchronously from the controller's point of view. It is hard because the image defines what the logic sees as simultaneous, and values from slow networks can be several cycles old without any marking.",
    k: ["Image-based I/O versus direct access in logic: the image gives consistent logic and simple reasoning, but adds latency that direct access avoids for fast signals.", "Per-point quality tracking versus plain values: quality bits expose stale or failed I/O to logic, but need logic that checks and handles them."],
    p: ["Logic reads a value from a failed remote I/O rack as normal because the image keeps the last good value.", "Two tasks write the same output in the image and the last writer wins, depending on timing."],
    v: "Disconnect a remote I/O rack on a test controller and confirm its input points are flagged as bad in the image and that logic takes its defined failure action within the allowed time.",
    dep: ["remote-io-and-backplanes","analog-io-modules","digital-io-modules"]
  },
  "retentive-memory": {
    s: "The part of controller memory that keeps values through power loss and restarts, such as counters, totals, setpoints and sequence positions, as opposed to values cleared at start.",
    d: "Variables are marked retentive or not; retained ones are kept in battery-backed memory or saved to flash at power fail and restored at start. On cold start, all values reset to initial; on warm start, retained ones continue. Logic uses start-up organization to decide what to do. It is hard because deciding what must survive is a process decision: resuming a sequence from retained state may be dangerous, and clearing totals may violate records.",
    k: ["Retain a value versus reset it on start: retaining preserves totals and positions, but a stale value from before the outage may be wrong for the new situation.", "Battery-backed RAM versus flash saved at power fail: flash has no battery to replace, but needs enough stored energy to finish the save."],
    p: ["Retained setpoints persist after a firmware change and no longer match the new logic's meaning.", "A retained flag from an aborted sequence causes the sequence to skip its checks on the next start."],
    v: "Cut power on a test controller during a running sequence, restore it, and confirm retained totals and setpoints match their last values and the sequence starts from the documented restart state.",
    dep: ["controller-cpu","sequence-control"]
  },
  "watchdog-and-faults": {
    s: "Timers and checks that detect a stalled or misbehaving program or processor, then put the controller and its outputs into a defined fault state instead of continuing with unknown behavior.",
    d: "A watchdog timer must be reset by each completed scan; if it expires, the controller stops and drives outputs to configured fail-safe values such as off, hold last value, or a set value. Other checks cover memory, power, module presence and program errors, and are classed as minor faults that continue or major ones that stop. Fault logs and indicators help diagnosis. It is hard because the correct fail state depends on the equipment: off is safe for a heater and dangerous for a cooling pump.",
    k: ["Stop on any major fault versus continue with degraded function: stopping prevents unknown behavior, but halts the process for faults that could have been isolated.", "Hold last value versus drive to safe value: hold avoids a bump on a short glitch, but keeps a stale command during a long outage."],
    p: ["Output fail-state is left at the default and a fault drives a valve closed on a line that must never block.", "A minor fault is ignored for months until it combines with another and causes a stop."],
    v: "Force a test controller into a watchdog fault and confirm every output moves to its documented fail state, the fault log records cause and time, and recovery needs a deliberate restart.",
    dep: ["controller-cpu","scan-cycle"]
  },
  "sis-logic-solver": {
    s: "The certified controller that reads safety sensors, evaluates the safety logic and drives shutdown outputs, independent of the basic process control system.",
    d: "It has its own inputs, processors, memory and outputs, with internal diagnostics to detect its own faults and fail to a safe state. Logic is limited to simple, verified functions in restricted languages. Inputs are often wired separately from control signals. Changes need special tools, locks and procedures. It is hard because independence must be real: shared power, shared networks or shared engineering stations can turn two systems into one failure.",
    k: ["Separate safety controller versus safety functions inside the control system: separate hardware gives independence and a smaller certified scope, but doubles engineering tools and wiring.", "Restricted verified logic versus full programming flexibility: restriction limits error and review effort, but frustrates engineers who want convenient features."],
    p: ["The safety controller shares a network or workstation with the control system and a fault or intrusion reaches both.", "Logic changes are made like ordinary control changes, without re-verification."],
    v: "Inject each safety input on a test rig and confirm the matching output trips within its response time, then confirm the self-test detects an injected internal fault and drives the outputs safe.",
    dep: ["voting-architectures","black-channel-protocol","emergency-shutdown"]
  },
  "sil-verification": {
    s: "The calculation and documentation showing that each safety function meets its target risk reduction, from sensor through logic to final element, using failure rates, test intervals and architecture.",
    d: "A hazard analysis sets how much risk reduction a function needs, expressed as a safety integrity level. Engineers then compute the probability that the whole loop fails on demand from component failure data, diagnostic coverage, common-cause factors and proof test interval. The result must meet the target across all parts. It is hard because the answer depends on assumed failure data and test quality, and the numbers are only valid if real maintenance matches the assumptions.",
    k: ["Calculated claims from published failure data versus field-proven history: published data is consistent and auditable, but may not match the local environment.", "More redundancy versus more frequent testing: redundancy lowers failure probability continuously, but costs hardware, while frequent tests cost production time."],
    p: ["The calculation assumes a six-month proof test and the plant tests every two years.", "A component is replaced with a similar one that has a different failure rate and the verification is not redone."],
    v: "Pick one safety function and trace the verification report to the installed parts, test interval and architecture. They should match the drawings and the maintenance schedule exactly.",
    dep: ["proof-testing","voting-architectures","final-control-elements"]
  },
  "voting-architectures": {
    s: "Arrangements of redundant safety sensors or logic channels, such as one-out-of-two or two-out-of-three, that balance missed trips against false trips.",
    d: "In 1oo2 either sensor tripping causes shutdown, which favors safety but doubles false trips. In 2oo3 two of three must agree, so one failed device neither trips the plant nor blocks a real trip. Diagnostics detect a disagreeing channel and alert maintenance. The choice applies separately to sensors, logic and final elements. It is hard because redundancy adds common-cause failure risk, such as all three sensors on one blocked impulse line, and degraded voting must be handled while a channel is bypassed.",
    k: ["1oo2 versus 2oo3: 1oo2 is the cheapest redundancy and safest against missed trips, but each failure of one device stops production, while 2oo3 keeps running with one failure.", "Identical devices versus diverse devices: identical devices are simpler to stock and maintain, but share systematic faults that diverse designs avoid."],
    p: ["Three transmitters share one process tapping, and a plugged line blinds all three at once.", "A faulted channel is bypassed and the voting silently degrades to a single sensor with no one aware."],
    v: "On a test rig, fail one channel at a time and confirm the vote degrades as designed, a diagnostic alarm is raised, and a genuine trip condition on the remaining channels still shuts down.",
    dep: ["sis-logic-solver","sensors-transmitters"]
  },
  "black-channel-protocol": {
    s: "A safety communication layer that adds sequence numbers, timeouts and checks to messages, so safety data can travel over ordinary networks without trusting the network.",
    d: "Safety data is wrapped with a counter, a timestamp or watchdog, a source and destination identity and a strong checksum. The receiver verifies each message and reacts to loss, repetition, reordering, delay, corruption or masquerade by moving to the safe state. The underlying network is treated as a black channel that may fail in any way. It is hard because every possible communication fault must be detected within the safety response time, and misconfigured addresses defeat identity checks.",
    k: ["Safety over a shared network versus a dedicated safety network: shared networks cut cabling and let safety and control use one infrastructure, but exposure to network faults and load must be proved acceptable.", "Short watchdog time versus long: a short time detects faults faster, but trips on network jitter or bursts."],
    p: ["Two devices are given the same safety address and a message from one is accepted as the other.", "A busy network delays messages beyond the watchdog and causes repeated nuisance trips."],
    v: "Inject delay, loss, duplication and corruption on a test link and confirm each makes the receiver enter its configured safe state within the stated time, and that normal traffic does not.",
    dep: ["industrial-ethernet","sis-logic-solver"]
  },
  "emergency-shutdown": {
    s: "The set of automatic and manual actions that bring a process to a safe state: closing feeds, opening vents, stopping machines and isolating sections in a defined order.",
    d: "Trips are triggered by sensors through the safety logic or by operator pushbuttons. Shutdown levels range from stopping one unit to the whole plant. The actions follow a cause-and-effect matrix that lists which input drives which outputs. Outputs act on valves that fail to a specified position on loss of signal or air. Restart needs a deliberate reset after the cause is cleared. It is hard because a shutdown itself can create hazards, such as pressure surges, so order and speed matter.",
    k: ["Staged shutdown levels versus single full trip: staging limits the impact of a small fault, but needs careful analysis so a partial shutdown does not create an unsafe intermediate state.", "Latch until manual reset versus automatic restart: latching forces human review of the cause, but extends downtime."],
    p: ["Reset is allowed while the trip condition persists, and the plant restarts into the same hazard.", "The cause-and-effect matrix on paper differs from the logic that was actually built."],
    v: "Trip each shutdown level on a commissioned system or rig and compare actual valve and drive states and times with the cause-and-effect matrix line by line.",
    dep: ["sis-logic-solver","final-control-elements","motor-starters-and-drives"]
  },
  "proof-testing": {
    s: "Scheduled tests that exercise each safety function end to end to reveal hidden failures that diagnostics cannot detect, such as a valve that sticks or a sensor that is stuck.",
    d: "At the interval set in the verification, maintenance applies a real or simulated input and checks that the final element moves, in the right time, to the right position. Partial stroke tests move a valve part of its travel online. Results are recorded, failures investigated and the device repaired and retested. It is hard because full tests may need the process to stop or an override, and because skipped or superficial tests silently invalidate the safety claims.",
    k: ["Full test during shutdown versus partial online tests: full tests find more faults, but need downtime, while partial tests are done online and miss some failure modes.", "Paper procedure versus automated test sequence: automation is consistent and records itself, but needs bypass logic that is itself a risk."],
    p: ["The test is done by simulating the sensor signal, so a plugged sensing line is never found.", "A test overdue by a year is recorded as complete because nobody checks the schedule."],
    v: "Review the last proof test of one function: it should show the input applied, the output result and time, who performed it and when, and the next due date within the verified interval.",
    dep: ["sil-verification","bypass-management","final-control-elements"]
  },
  "bypass-management": {
    s: "The controlled process for disabling or overriding a safety input or output during maintenance or start-up, with authorization, compensating measures, visibility and a time limit.",
    d: "A bypass is requested, assessed, approved by the right person and applied through a key switch or a software override. A compensating measure such as manual watch is assigned and the bypass is shown on operator displays and logged. It must be removed at the end of the task and is reviewed if long. It is hard because bypasses are the usual way safety is lost in practice: forgotten, applied to the wrong point, or left on to avoid a nuisance trip.",
    k: ["Software override versus physical key switch: software bypasses are easy to track and limit, but are exposed to remote and accidental use, while key switches are deliberate but harder to audit.", "Time-limited automatic expiry versus manual removal: expiry prevents forgotten bypasses, but may trip a plant during a long job unless renewed."],
    p: ["A bypass for a start-up is left on for months and the function is not protecting anything.", "The bypass is applied to the neighboring input with a similar tag name."],
    v: "List all active bypasses at a random moment: each should have an approver, reason, compensating measure and expiry, be visible on the operator display, and correspond to real ongoing work.",
    dep: ["sis-logic-solver","audit-trail","user-roles-and-access"]
  },
  "controller-redundancy": {
    s: "Two identical controllers running the same program, with one in control and the other ready to take over, so a hardware failure does not interrupt the process.",
    d: "The primary executes logic and drives outputs; the secondary tracks its state over a synchronization link and monitors its health. On failure of the primary, detected by loss of heartbeat or a diagnostic, the secondary takes over within a scan or two. Both read the same inputs, through redundant I/O or shared remote I/O. It is hard because the takeover must be bumpless, split-brain must never happen, and software errors run identically on both so redundancy does not protect against them.",
    k: ["Hot standby versus warm or cold standby: hot standby takes over in milliseconds, but doubles synchronization complexity, while colder options are cheaper and cause a longer disturbance.", "Redundant I/O versus single I/O with redundant controllers: redundant I/O removes the module as a single point of failure, but costs wiring and channels."],
    p: ["The synchronization link fails and both controllers believe they are primary, driving the same outputs.", "A program bug crashes the primary, and the secondary runs the same code into the same crash."],
    v: "Pull the power from the primary of a running test pair and measure the output disturbance and takeover time. Outputs should hold within tolerance and the alarm should show the failover and the failed unit.",
    dep: ["state-synchronization","controller-cpu","remote-io-and-backplanes"]
  },
  "state-synchronization": {
    s: "The transfer of program variables, timers and I/O state from the primary to the secondary every cycle, so the standby can continue exactly where the primary stopped.",
    d: "At the end of each scan, or at defined points, the primary sends changed data over a dedicated link and the secondary applies it, checking it is complete. A mismatch triggers resynchronization, during which redundancy is lost. Program changes must also reach both, either by download to each or by an online update that keeps both aligned. It is hard because large data sets lengthen the scan, partial transfers leave the secondary inconsistent, and a bad state is copied faithfully.",
    k: ["Synchronize all data versus a selected subset: all data guarantees a clean takeover, but lengthens the scan, while a subset is faster and risks missing a variable that matters.", "Dedicated link versus the shared control network: dedicated links are fast and isolated, but add cables and ports, while shared links are cheap and compete with other traffic."],
    p: ["A variable added to the program is not on the synchronization list and takeover resets it.", "Resynchronization after a repair copies a corrupt state from the primary to the new secondary."],
    v: "Change a counter and a timer on a running test pair, force a switchover, and confirm both continue from their exact values without a reset or a jump.",
    dep: ["controller-redundancy","scan-cycle","process-image"]
  },
  "ring-and-parallel-redundancy": {
    s: "Network designs that keep traffic flowing after a link or switch fails, using rings that reconfigure or parallel paths that carry every message twice.",
    d: "Ring protocols detect a break and open a standby link, recovering in tens of milliseconds to a second. Parallel schemes send each frame on two independent networks and the receiver keeps the first copy, with zero recovery time. Switches monitor links and report faults. It is hard because recovery time must be shorter than the application's timeout, and because a second failure before the first is repaired, or a shared cable duct, defeats the design.",
    k: ["Ring recovery versus parallel redundant paths: rings are cheap and use one cable run, but have a recovery gap, while parallel paths lose nothing and cost double the equipment.", "Fast recovery settings versus stable settings: fast detection limits disturbance, but can cause false switchovers on noisy links."],
    p: ["Both network paths run through the same cable tray and one cut takes out both.", "The first failure is never noticed because nobody monitors the redundancy status, and the second causes the outage."],
    v: "Unplug one link in a test ring under load and measure the traffic gap. It must be shorter than the shortest device timeout. Confirm the break is alarmed with its location.",
    dep: ["industrial-ethernet"]
  },
  "server-failover": {
    s: "Pairs or clusters of supervisory, historian and batch servers where a standby takes over on failure, keeping the operator view, alarms and data collection going.",
    d: "Two servers run together, one active; they share or replicate configuration and live state, and the standby watches a heartbeat. On failover, clients reconnect to the new active node, drivers resume, and alarm states carry over. Historian collectors write to both or buffer. Virtualization sometimes provides failover at the machine level. It is hard because state that is only in memory, such as unacknowledged alarms and in-progress commands, must survive, and clients must find the new server without operator action.",
    k: ["Application-level redundancy versus virtual machine failover: application level carries live state and switches in seconds, but needs support from each product, while virtual machines are generic and restart more slowly.", "Shared storage versus replicated storage: shared storage is simple to keep consistent, but is a single point of failure, while replication removes it and adds lag."],
    p: ["Both servers become active after a network split and write conflicting data.", "After failover, alarm acknowledgments are lost and operators must re-acknowledge a screen full of alarms."],
    v: "Power off the active server of a test pair during an active alarm list and a command, and confirm clients reconnect within the target time, alarm states are preserved and the command is not duplicated.",
    dep: ["scada-server","state-synchronization","process-historian"]
  },
  "power-and-ups": {
    s: "Supply and backup of electrical power for controllers, networks and servers: redundant power supplies, batteries or uninterruptible supplies, clean grounding and ride-through of short dips.",
    d: "Control equipment usually runs on regulated low-voltage DC from redundant supplies fed from separate sources. Battery backup bridges outages and keeps a controlled shutdown possible. Servers use UPS units with shutdown signaling. Grounding and surge protection limit damage from lightning and switching. Power monitoring reports supply and battery health. It is hard because batteries age and fail unnoticed, and because a single shared feed or breaker can still take out both halves of a redundant system.",
    k: ["Redundant supplies on separate feeds versus a single feed with redundant modules: separate feeds survive upstream failure, but need more cabling and panels.", "Large central UPS versus distributed small supplies: central is easier to manage and monitor, but a fault there is plant-wide, while distributed limits the effect of a fault."],
    p: ["Batteries are never load-tested and fail at the first real outage.", "Both redundant supplies are wired from one distribution breaker and trip together."],
    v: "Cut the main feed to a test panel and confirm control continues on backup for the rated time, status alarms show the event, and servers perform an orderly shutdown at the low-battery threshold.",
    dep: ["controller-cpu"]
  },
});
