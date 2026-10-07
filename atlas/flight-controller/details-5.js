// Details for the flight controller plate, part 5: parameters and logging, real-time runtime, hardware abstraction, cross-cutting concerns.
ATLAS.details("flight-controller", {
  "parameter-store": {
    s: "A named, typed table of every tunable setting, kept in nonvolatile memory and readable and writable at runtime from the ground side.",
    d: "Each parameter has a name, type, default, and current value, and modules register them at startup. Changes are applied live or at the next boot, and saved atomically to flash. A change notification tells modules to reread their values. The table is exposed over the telemetry protocol. It is hard because hundreds of values interact, because defaults must stay compatible across firmware versions, and because a half-written store after power loss must not corrupt every setting.",
    k: ["Parameters changeable in flight vs only when disarmed: in flight enables tuning; some changes, such as geometry, are unsafe to apply while flying.", "Save every change immediately vs on explicit save: immediate survives power loss; frequent writes wear flash and can stall the processor."],
    p: ["A firmware update that renames a parameter and silently falls back to its default.", "Saving to flash during flight, blocking the processor long enough to miss control deadlines."],
    v: "Change several parameters, cut power mid-write repeatedly, and confirm every reboot loads a complete consistent set. Confirm a modified value is picked up by the owning module without a reboot where documented.",
    dep: ["storage-drivers", "message-bus"]
  },
  "parameter-validation": {
    s: "Metadata and checks for every parameter: type, range, units, dependencies and whether a change needs a reboot or a disarmed state.",
    d: "A schema describes each parameter's allowed range, step, units, group and a short description, and is shipped with the firmware so ground tools show it. On a set request the store checks type and range, then cross-parameter rules such as a minimum below a maximum. Violations are rejected with a reason. It is hard because the rules for valid combinations are numerous and often undocumented, and incorrect combinations cause unstable or unsafe flight.",
    k: ["Strict rejection of invalid values vs clamp to range: rejection tells the user the truth; clamping hides a typo behind a different setting.", "Metadata compiled into the firmware vs served from a separate file: compiled-in always matches the version; it uses flash space."],
    p: ["Two valid parameters whose combination demands more torque than the airframe has.", "Missing units, so a value in degrees is entered where radians are expected."],
    v: "Write out-of-range and inconsistent values from the ground tool and confirm each is rejected with a specific reason, and that the stored set remains unchanged.",
    dep: ["parameter-store"]
  },
  "autotune": {
    s: "Finds good control gains automatically by exciting the aircraft in flight, measuring its response and fitting a model.",
    d: "The pilot enables a tune mode and the software injects small steps or a frequency sweep into each axis, records the response, and estimates the dynamics. From these it computes rate gains and checks the result against stability margins. Parameters are applied and saved at the end if the pilot approves. It is hard because the aircraft is deliberately disturbed, tuning must be safe near the limits, and results depend on a clean, low vibration airframe.",
    k: ["Model-based tuning from identified dynamics vs iterative search on a measured cost: models need fewer flights and give margin guarantees; search handles unusual aircraft but takes longer.", "Tune in flight vs on a tethered ground test: flight gives realistic data; any error can cause a crash."],
    p: ["Tuning with a bent propeller or loose motor, which builds the noise into the gains.", "Aggressive excitation near an obstacle, because the pilot expected the aircraft to hold still."],
    v: "Run autotune on an aircraft with deliberately poor gains and confirm the resulting step response meets the rise time and overshoot targets, with measured gain and phase margins above the stated minimum.",
    dep: ["rate-controller", "parameter-store", "flight-logger"]
  },
  "flight-logger": {
    s: "Records time-stamped streams of sensor data, estimates, setpoints and events to storage at high rate, so any flight can be reconstructed afterward.",
    d: "Selected topics from the message bus are serialized with a header describing each message format, buffered in memory, and written to a card or flash by a low-priority task. Sample rates are chosen per topic, and logging starts at arming or earlier. The log includes parameters, mode changes and system messages. It is hard because storage is slow and bursty, and writing must never delay control; a full buffer means lost data at the moment of failure.",
    k: ["Log at the control rate vs a lower rate: full rate allows tuning and filter analysis; log sizes and storage bandwidth grow quickly.", "Start logging at boot vs at arming: boot captures pre-flight problems; it fills storage with ground time."],
    p: ["A slow card stalls writes and the buffer overflows, dropping exactly the high-rate data around an event.", "A crash that cuts power before the buffer is flushed, losing the last seconds."],
    v: "Run a full-rate flight with a worst-case slow storage card and confirm zero dropped messages, no control deadline misses, and that the final seconds before a power cut are present in the log.",
    dep: ["message-bus", "log-storage", "scheduler"]
  },
  "log-storage": {
    s: "Manages where logs go and how they are kept: file naming, card or flash layout, rotation, space reservation and download over the link.",
    d: "Logs are written to removable cards or onboard flash as numbered files. When space runs low, the oldest are removed or logging stops, depending on configuration. A directory index lets the ground side list and fetch logs, sometimes in compressed or partial form. It is hard because file systems can corrupt on power loss, and because the writing path must give bounded latency regardless of the card's behavior.",
    k: ["Removable card vs onboard flash: a card holds many flights and is easy to read out; connectors fail from vibration, onboard flash is robust but small.", "Delete oldest logs to make space vs stop logging: deleting keeps the latest flight; an investigation may need the older ones."],
    p: ["A full card with logging silently disabled, so the flight that needed investigation has no data.", "An unclean power-off leaving a corrupted file system that the next boot cannot mount."],
    v: "Fill the card, fly again, and confirm the behavior matches the configured policy and a warning appears. Cut power during a write and confirm the card mounts and earlier logs are intact.",
    dep: ["storage-drivers"]
  },
  "log-replay": {
    s: "Feeds a recorded log back through the flight software offline, so estimator and controller changes can be tested on real sensor data.",
    d: "The replay tool reads logged raw sensor and input messages, injects them into the message bus on a simulated clock, and runs the estimator or controllers as in flight, then compares new outputs with the recorded ones. It makes regression checks possible without flying. It is hard because the software must be deterministic enough for the comparison to mean anything, and because the log must carry every input, with timing.",
    k: ["Replay at recorded timing vs as fast as possible: recorded timing exposes timing faults; fast replay is quicker for regression suites.", "Replay only the estimator vs the whole stack: estimator replay is tractable; the whole stack needs closed-loop assumptions that replay cannot supply."],
    p: ["A log lacking raw sensor data, only the filtered output, so the estimator cannot be re-run on it.", "Nondeterministic code making replay results differ from run to run, so regressions cannot be seen."],
    v: "Replay the same log twice with the unchanged code and confirm identical outputs bit for bit. Then replay with a deliberate estimator change and confirm the comparison shows the expected differences.",
    dep: ["flight-logger", "message-bus", "simulation-backend"]
  },
  "event-reporting": {
    s: "Turns internal conditions into short human-readable messages and codes for the pilot and operator, with severity levels and rate limiting.",
    d: "Components publish events with a severity, a code and arguments. The reporter formats them into text, sends them over telemetry, shows them in the ground station and records them in the log. Repeated events are suppressed, and critical ones are sent again until acknowledged. It is hard because too many messages train operators to ignore them, and because a clear reason, such as why arming failed, is the difference between a quick fix and a support request.",
    k: ["Structured event codes vs free text: codes allow localization and automation; free text is quicker to write and harder to use in tools.", "Rate-limit repeats vs show every occurrence: limiting keeps the display readable; it hides how often a fault occurs."],
    p: ["Messages sent without severity, so the one critical warning is lost among informational ones.", "A message flood during a fault that fills the telemetry link and delays commands."],
    v: "Trigger each documented condition in simulation and confirm the matching event appears with the right severity at the ground station and in the log, and that a repeated fault is limited to the configured rate.",
    dep: ["message-bus", "telemetry-protocol", "flight-logger"]
  },
  "scheduler": {
    s: "Runs control and driver tasks at fixed rates with priorities, so critical loops preempt less important work and meet their deadlines.",
    d: "A real-time kernel or a cyclic executive dispatches tasks by priority and period. The rate loop runs synchronized to the gyroscope sample, outer loops at lower rates, and logging, telemetry and storage in the background. Interrupts hand data to tasks through queues. It is hard because every shared resource is a risk: a low-priority task holding a lock can block a high-priority one, and worst-case, not average, execution time decides whether deadlines are met.",
    k: ["Preemptive priority scheduling vs a fixed cyclic schedule: preemption copes with varied work; a cyclic schedule is analyzable and deterministic but rigid.", "One task per loop vs several loops in one task: separate tasks isolate faults and priorities; one task avoids switching and locking."],
    p: ["Priority inversion: a logging task holds a lock the rate loop needs and the loop misses its deadline.", "A background task given too high a priority so it starves the estimator."],
    v: "Run the full flight load on the target and record each loop's period and execution time over an hour; confirm the maximum jitter and worst-case execution time stay within the stated limits with no missed deadlines.",
    dep: ["interrupts-dma", "load-monitoring"]
  },
  "message-bus": {
    s: "A publish-subscribe channel that moves data between components, so a sensor driver, estimator and controller exchange messages without direct links.",
    d: "Components publish typed messages to topics; subscribers read the newest sample or a queue of recent ones, and can wait for an update. Messages carry timestamps and a sequence count so staleness and drops are visible. The bus uses preallocated buffers and lock-free or short-lock access so a publisher is never blocked by a slow subscriber. It is hard because it hides dependencies and timing: who reads a topic, how old the data is, and what happens when nobody does.",
    k: ["Latest-value topics vs queued topics: latest-value gives the controller the freshest data; queues keep every sample for the logger and filters at the cost of memory.", "Decoupled bus vs direct function calls: a bus makes logging, replay and substitution easy; direct calls are faster and easier to trace."],
    p: ["A subscriber that reads stale data without checking the timestamp and acts on an old estimate.", "Multiple publishers on one topic with no owner, so values interleave unpredictably."],
    v: "Publish at a known rate while a slow subscriber reads, and confirm the publisher is never delayed, latest-value readers see the newest sample, and queue readers report an exact count of dropped messages.",
    dep: ["static-memory", "scheduler"]
  },
  "loop-timing-control": {
    s: "Makes loops run at regular intervals, synchronized to sensor samples, and measures how far real timing departs from the plan.",
    d: "The fastest loop is triggered by the data-ready signal of the gyroscope, so each sample is processed immediately, and slower loops divide down from it. Time is read from a high-resolution counter, and the loop's measured period is used in the filters instead of the nominal value. Jitter and overruns are counted and logged. It is hard because control gains assume a regular sample time, and jitter or drift breaks that assumption.",
    k: ["Sensor-triggered loops vs a free-running timer: sensor-triggered has minimal delay and no aliasing; it makes the control loop depend on the sensor staying alive.", "Use measured loop period in filters vs the nominal: measured stays correct when a cycle is late; it adds noise to the calculation."],
    p: ["A sensor that stops sending data-ready pulses, so the rate loop stops with no one noticing.", "Two clocks that drift apart, so a logged time axis does not line up between processors."],
    v: "Log the interval between consecutive loop iterations for a full flight and confirm the distribution stays within the stated jitter, with no skipped iterations, and that stopping the sensor is detected within one period.",
    dep: ["scheduler", "interrupts-dma", "imu"]
  },
  "static-memory": {
    s: "Allocates all memory at startup and avoids dynamic allocation in flight, so memory use is fixed, known and free from fragmentation.",
    d: "Buffers, queues, task stacks and message storage are sized at build or boot. After startup, no component requests more memory from a general allocator. Pools of fixed-size blocks serve variable demands. Stack depth is measured against a guard value. It is hard because sizes must cover the worst case and that case is rarely tested, and because small processors have only tens or hundreds of kilobytes.",
    k: ["No dynamic allocation after boot vs a general allocator: static is deterministic and cannot run out mid-flight; it wastes memory sized for worst cases.", "Fixed-size pools vs per-component arenas: pools are fast and fragment-free; they limit what each message can hold."],
    p: ["A stack overflow in a rarely run code path that corrupts neighboring memory and crashes only in the field.", "A feature added at runtime that allocates memory, passing every test and failing after hours of flight."],
    v: "Run a long soak flight in simulation and on hardware while logging free pool and stack headroom, and confirm the minimum remaining headroom never drops below the stated margin and no allocation occurs after boot.",
    dep: ["board-support"]
  },
  "load-monitoring": {
    s: "Measures how much processor time and stack each task uses, and warns when the margin to their deadlines or limits shrinks.",
    d: "The scheduler records execution time per task and idle time, converting to a load percentage and a worst-case value. Stack watermarks show the deepest use. The results are published for logging and for the supervisor, which can shed work, such as reducing log rates, if load is too high. It is hard because the measurement must not itself add load, and because load in flight differs from load on the bench.",
    k: ["Measure by hardware counters vs software sampling: counters are accurate and cheap; they need hardware support and care around context switches.", "Shed load automatically when high vs only warn: shedding protects control loops; it silently reduces what is logged or reported."],
    p: ["A peak load that appears once per minute, such as parameter saving, is invisible in an averaged number.", "Load measured on a bench with fewer sensors and links than the real configuration."],
    v: "Enable every sensor, logging and link at maximum rates and confirm worst-case measured load stays under the stated percentage and each task's measured execution time stays within its deadline over an hour.",
    dep: ["scheduler", "message-bus"]
  },
  "bootloader-update": {
    s: "A small, separate program that starts the flight software, verifies it, and accepts new firmware over a link without bricking the board.",
    d: "On reset the bootloader checks the application image's checksum or signature and starts it, or waits for an update command. New images are received in blocks, written to flash, verified and then started. Some designs keep two image slots so a failed update reverts. It is hard because an interrupted update must be recoverable, the bootloader itself cannot be updated safely in the field, and a reset in flight must jump to the application quickly.",
    k: ["Two image slots with rollback vs one slot: two slots recover from a bad image; they halve usable flash.", "Signed images vs checksum only: signatures stop malicious or accidental wrong firmware; they need key management and more bootloader code."],
    p: ["An update interrupted by power loss, leaving a partly written image that the checksum cannot catch because it was never computed.", "A bootloader that waits for an update on every boot, delaying a reset in flight."],
    v: "Interrupt a firmware update at random points many times and confirm the board always recovers to either the old or new image. Time a reset to application start and confirm it meets the stated limit.",
    dep: ["storage-drivers", "serial-can-drivers", "board-support"]
  },
  "board-support": {
    s: "The per-board layer that describes which pins, buses, sensors and outputs exist, and sets up clocks and peripherals at boot.",
    d: "Each supported board has a description of its processor, clock tree, pin assignments, sensor wiring, output groups, storage and power monitoring, plus startup code that configures them. Higher layers ask for the second inertial sensor or the first output group, not a pin. New hardware is added by writing a board description. It is hard because boards differ in sensors, timers shared between outputs and quirks like a sensor on a shared bus, and one wrong table entry gives a board that boots and misbehaves.",
    k: ["Declarative board description vs hand-written board code: declarative is quicker to add and check; unusual hardware needs an escape hatch.", "One firmware image per board vs a configurable common image: per board is simple and tested; common reduces build count but increases run-time checks."],
    p: ["A sensor listed on the wrong bus or address, so detection fails on a variant of the board.", "A clock misconfiguration producing slightly wrong timing, so every time-based value is a few percent off."],
    v: "Boot the firmware on each supported board revision and confirm every declared sensor, output and storage device is detected with the correct identity, and output timing measured on a scope matches nominal.",
    dep: ["sensor-bus-drivers", "timer-pwm-drivers", "serial-can-drivers"]
  },
  "sensor-bus-drivers": {
    s: "Drivers for the serial buses that connect sensors, handling transfers, chip selects, timeouts and error recovery.",
    d: "Sensors connect over short-range synchronous buses at up to tens of megabits per second, or slower two-wire buses with addresses. Drivers perform register reads and writes, bulk transfers by direct memory access, and recover from stuck lines by resetting the bus. Several sensors may share a bus, so access is serialized. It is hard because a bus error or a stuck device can block every sensor on that bus, and a transfer must be bounded in time.",
    k: ["Direct memory access transfers vs polled byte transfers: DMA frees the processor and keeps timing tight; setup is complex and sharing the channels requires care.", "One bus per critical sensor vs shared buses: separate buses isolate faults and allow faster reads; they use more pins and routing."],
    p: ["A sensor holding the data line low after a glitch, blocking every device on the bus until a reset.", "Two tasks accessing one bus without a lock, interleaving transfers and returning mixed data."],
    v: "Short the data line of one sensor briefly in a bench test and confirm the driver detects the timeout, resets the bus, and the other sensors resume within the stated time, with the failure reported.",
    dep: ["interrupts-dma", "board-support"]
  },
  "timer-pwm-drivers": {
    s: "Configures hardware timers to generate output pulses and digital protocol frames, and to capture input pulse timing, without involving the processor each cycle.",
    d: "Timers produce pulse widths for servos and motor drivers at configurable rates, and DMA-driven bit streams for digital protocols. Capture units measure incoming pulse widths from receivers. Outputs on one timer share a period, so grouping matters. It is hard because the hardware has quirks, such as which pins share which timers, and because a configuration mistake changes the signal on every motor at once.",
    k: ["DMA-driven bursts vs interrupt-driven bit toggling: DMA gives exact timing with little processor cost; it needs spare channels and buffers.", "One timer group for all motors vs mixed groups: one group keeps rates identical; mixed groups allow servos at a different rate but tie rates together."],
    p: ["Pins grouped on one timer with a different required rate, which forces a rate compromise on one output.", "An output left floating or in the wrong state during boot, spinning a motor before software starts."],
    v: "Probe each output with a logic analyzer at boot and during commands, and confirm outputs stay in their safe state at power-up, then show the commanded period and pulse width within the stated tolerance.",
    dep: ["interrupts-dma", "board-support"]
  },
  "serial-can-drivers": {
    s: "Drivers for asynchronous serial ports and vehicle networks that connect receivers, radios, satellite receivers, motor drivers and companion computers.",
    d: "Each port has a baud rate, buffer and protocol parser, using interrupts or DMA to fill ring buffers. A network driver adds addressing, arbitration and error counts for devices such as smart motor drivers and sensors. Ports can be reassigned by configuration. It is hard because many different devices share limited ports, framing errors and overruns must be handled without losing data, and a flood from one device must not starve others.",
    k: ["Ring buffers filled by DMA vs byte interrupts: DMA lowers interrupt load at high baud rates; the buffer must be polled and sized for the worst delay.", "Vehicle network with addressing vs point-to-point serial: a network scales to many devices on two wires; it needs more protocol and configuration."],
    p: ["Receive buffer overrun at high baud rates, silently dropping bytes and corrupting a protocol stream.", "Two devices assigned to one port in the configuration, giving garbled data."],
    v: "Send a sustained stream at the maximum baud rate with injected framing errors and confirm the driver reports exact error and overrun counts, loses no valid frames, and recovers after each error.",
    dep: ["interrupts-dma", "board-support"]
  },
  "interrupts-dma": {
    s: "The interrupt handlers and direct memory access channels that move data and signal events with minimal processor involvement and bounded delay.",
    d: "Peripherals raise interrupts for data-ready, timer and transfer-complete events; handlers do the minimum, such as timestamping and queueing, and defer the rest to tasks. DMA channels copy data between peripherals and memory with no processor cycles. Interrupt priorities decide who preempts whom. It is hard because long handlers delay the control loop, shared data needs care, and a flood of interrupts can starve the scheduler.",
    k: ["Short handlers that signal a task vs doing the work in the handler: short handlers keep latency bounded; handing off adds a context switch and delay.", "Static priority assignment vs dynamic: static priorities can be analyzed for worst-case latency; dynamic ones adapt but are harder to bound."],
    p: ["A handler that waits on a bus transfer, blocking every lower-priority interrupt and the scheduler tick.", "A shared variable written in a handler and read by a task with no protection, producing torn values."],
    v: "Measure interrupt latency and handler duration with a scope or cycle counter under full load, and confirm the worst-case latency of the sensor interrupt stays below the stated limit.",
    dep: ["board-support"]
  },
  "storage-drivers": {
    s: "Drivers for nonvolatile memory: onboard flash for parameters and missions, and removable cards for logs, with wear and error handling.",
    d: "Flash needs erase before write, has limited erase cycles and is slow to erase; drivers present it as sectors or a simple file layer and spread writes to even wear. Cards use a block protocol with variable latency. Writes are verified, and reads are checked against checksums. It is hard because erasing a flash sector can stall the processor for tens of milliseconds, and because cards have unpredictable latency spikes.",
    k: ["Wear-leveling storage layer vs fixed locations: leveling extends flash life; a fixed layout is simpler and predictable in latency.", "Run storage operations in a separate task vs from callers: a separate task keeps others unblocked; callers see asynchronous completion."],
    p: ["A sector erase on flash that also holds executing code, stalling the control loop.", "A card write that blocks for half a second, long enough to miss several control deadlines."],
    v: "Write parameters and logs at the maximum rate while running the control loop at full load, and confirm worst-case write latency never delays the rate loop and all data reads back correctly.",
    dep: ["interrupts-dma", "board-support"]
  },
  "simulation-backend": {
    s: "A replacement for the hardware layer that feeds the flight software simulated sensors and consumes its actuator outputs, in software or with a real controller in the loop.",
    d: "In software-in-the-loop, the flight code runs on a desktop and talks to a physics simulator through a driver that implements the same sensor and output interfaces. In hardware-in-the-loop, the real board runs while a simulator supplies sensor data over a link. The simulator models dynamics, wind, sensors and failures. It is hard because the model is never the aircraft, and because timing and noise must be realistic enough for results to transfer.",
    k: ["Software-in-the-loop vs hardware-in-the-loop: software-in-the-loop is fast and scales to many runs; hardware-in-the-loop exposes timing, memory and driver problems.", "Simple physics model vs detailed aerodynamics: a simple model is fast to build and fine for logic tests; tuning needs a model matched to the real airframe."],
    p: ["Sensors modeled with no noise or delay, so tuning that works in simulation oscillates on the real aircraft.", "Simulation with a different clock rate than the flight software expects, hiding timing bugs."],
    v: "Run the same mission in simulation and on the airframe and compare logged tracks: confirm the paths agree within the stated tolerance and that injected failures trigger the same failsafe actions in both.",
    dep: ["board-support", "message-bus", "scheduler"]
  },
  "loop-rates-and-latency": {
    s: "Every loop, from the rate controller to mission logic, runs at a chosen rate, and the total delay from sensor sample to actuator output limits how stable the aircraft can be.",
    d: "Inner loops need hundreds to thousands of hertz and outer loops tens, with each loop at least several times slower than the one inside it. Delay accumulates from sensor sampling, bus transfers, filters, computation, output protocol framing and motor response, and each millisecond reduces the stability margin. It has to be decided before the components are built because every filter, bus choice and output protocol spends from the same budget.",
    k: ["Cascaded loops with a rate separation vs a single high-rate controller: cascades are simple to tune and cheap; a single controller can use full state but needs more compute and a good model.", "Higher loop rate vs lower compute load: higher rates reduce delay and improve disturbance rejection; the processor spends more time and sensors must keep up."],
    p: ["Adding a filter or a slower output protocol that quietly adds a millisecond, until the aircraft oscillates at high throttle.", "An outer loop run too close to the inner loop's rate, so the two interact and oscillate."],
    v: "Measure the end-to-end delay from a gyroscope sample to a change on the motor output pin with a scope, and confirm it stays within the budget at every loop rate configuration.",
    dep: []
  },
  "frames-and-units": {
    s: "Every quantity has a coordinate frame and a unit, and every component must agree on both: body, local world, global, and meters, radians and seconds.",
    d: "Position and velocity appear in a local north-east-down or similar frame, a global latitude-longitude frame and the body frame; attitude is relative to one of them. Sensors are mounted at arbitrary orientations. Units are SI inside and converted at the edges. It is decided up front because a sign flip or a frame mix-up in one component produces a motion that looks like a tuning problem but is a geometry error.",
    k: ["One internal convention with conversion at the boundaries vs per-module conventions: one convention keeps code clear; the boundaries need careful tested conversions.", "Quaternions inside and Euler angles for display vs angles throughout: quaternions avoid singularities; angles are what humans read in logs and tuning."],
    p: ["A north-east-down quantity used where east-north-up is expected, giving the right size and the wrong direction.", "A mixed unit, such as degrees in a configuration and radians in code, exposed only in a specific maneuver."],
    v: "Rotate the aircraft through each axis in a known sequence on the bench and confirm every logged attitude, rate and acceleration has the expected sign and magnitude in the documented frame.",
    dep: []
  },
  "failure-and-redundancy": {
    s: "Every part will fail eventually: a sensor, a link, a motor, the processor. The design decides which failures are tolerated, which are detected and what the aircraft does.",
    d: "Choices include duplicated sensors with voting, separate buses and power rails, independent termination paths, and degraded modes with less capability. Each choice trades weight, cost and complexity against survival. Detection is as important as redundancy: an undetected failure defeats it. This is settled before components exist because redundancy cuts across hardware layout, drivers, estimation and failsafe logic at once.",
    k: ["Redundant hardware vs better detection and safe degradation: redundancy survives failures; detection with safe landing is cheaper and suits light aircraft.", "Common-cause isolation vs shared parts: separate power and buses stop one fault taking everything; they cost weight, pins and layout effort."],
    p: ["Redundant sensors that share a power rail, bus or mounting, failing together.", "Redundancy never exercised in flight, so its switching logic has never run on real hardware."],
    v: "Inject each single failure in simulation, on the bench and, where safe, in flight, and confirm the aircraft's logged response matches the documented table with no uncommanded behavior.",
    dep: []
  },
  "airframe-generality": {
    s: "One flight software can serve multirotors, fixed-wing aircraft, helicopters and hybrids, or it can be built for one layout, and that choice shapes every interface.",
    d: "A general design pushes airframe differences into configuration and a few vehicle-specific modules: controllers, mixers and modes. A specific design hardwires assumptions such as four motors, and is simpler and faster. The choice affects the control allocation interface, mode set, parameter layout and testing effort. It has to be decided early because adding a new airframe type later touches the whole stack.",
    k: ["Generic allocation and shared controllers vs per-airframe code: generic reuses estimation, logging and failsafes; special cases and testing needs multiply.", "Presets for common layouts vs a fully custom description: presets are quick and tested; custom descriptions serve unusual aircraft but need validation."],
    p: ["A shared module with hidden multirotor assumptions, such as the hover thrust model, applied to a fixed-wing.", "Configuration permutations that grow faster than anyone can test."],
    v: "Run the same regression flight set on each supported airframe type in simulation and confirm each passes its own acceptance criteria with the shared modules unchanged.",
    dep: []
  },
  "safety-assurance": {
    s: "How the software earns trust: requirements, review, testing, simulation, hardware tests and flight tests, with evidence kept for each release.",
    d: "Assurance ranges from open-source hobby practice to standards-driven processes for crewed or commercial operation: traceability from requirements to tests, coding rules, coverage targets, independent review and fault injection. Flight tests close what simulation cannot. It is a cross-cutting concern because decisions such as dynamic memory, language features, third-party code and configurability decide how much evidence must be produced.",
    k: ["Heavy process with traceability vs light process with extensive testing: heavy process gives certifiable evidence; it slows change and adds cost.", "Test in simulation before flying vs fly early: simulation catches logic errors safely; real flight finds what the model misses."],
    p: ["A configuration option added without tests, so one combination has never been flown or simulated.", "Evidence tied to a software version that changes before the next flight."],
    v: "Pick a released version and trace one safety requirement to its test case, its simulation result and a logged flight test of the failure it covers, confirming all three exist and pass for that exact version.",
    dep: []
  },
  "compute-and-memory-limits": {
    s: "The processor speed, memory size, storage bandwidth, power and weight available set what algorithms are affordable, and everything must fit in them with margin.",
    d: "A small microcontroller has limited floating-point speed, memory and flash; a larger flight computer runs an operating system and vision. The limit decides whether a full Kalman filter runs at the gyroscope rate, how many sensors and log topics are supported, and whether a companion computer is needed. It must be known first because every component spends from it, and margin is lost one feature at a time.",
    k: ["Single microcontroller vs a flight controller plus a companion computer: one chip is simple and robust; heavy vision and planning need the second and add a link that can fail.", "Fixed-point arithmetic vs floating-point hardware: fixed-point runs on cheap parts; floating-point is easier to write correctly and verify."],
    p: ["A feature that fits on the bench but pushes worst-case load over its deadline in a rare combination.", "Flash nearly full, so a security fix cannot be added without removing something."],
    v: "Build the maximum configuration and log worst-case processor load, stack and memory headroom, and flash use over a full-load flight, confirming each stays under the stated margin of its limit.",
    dep: []
  }
});
