// Details, part 1: ground operations, ground link, payload, onboard scheduling.
ATLAS.details("satellite-flight-software", {
  "mission-control-system": {
    s: "The ground program that sends commands, receives and decodes telemetry, shows spacecraft state to operators and records everything that passed over the link.",
    d: "It connects to ground station networks, frames and sends commands, and decodes downlinked packets using a database that describes every telemetry point and command. Operators see calibrated values, limit states and event logs. It keeps a complete record of what was sent and received, and enforces who may send which command. It is hard because the database must match the exact flight software version in orbit, and because operators must make safe decisions from data that is minutes or hours old.",
    k: ["Database-driven decoding versus hand-coded decoders: one source of truth keeps ground and flight consistent, at the cost of tight coupling to the exact flight software release.", "Operator approval for every command versus automated procedures: approval catches mistakes but cannot keep up with busy passes."],
    p: ["Using a database from the wrong flight software version silently mis-scales telemetry, so operators act on wrong numbers.", "A command accepted by the ground system but never verified as executed is assumed done when it was not."],
    v: "Send a no-operation command during a pass and see it in the command log, acknowledged in telemetry, with a matching counter increment, then replay the recorded pass and get the same decoded values.",
    dep: ["telemetry-archive","command-planning-tool","link-protocol-stack"]
  },
  "command-planning-tool": {
    s: "Builds timelines of commands for each contact, checks them against spacecraft constraints and produces the loads that are uplinked and stored onboard.",
    d: "Planners place activities such as observations, maneuvers and downlinks on a timeline using predicted orbit events, ground station visibility and a model of power, data and thermal state. The tool expands each activity into commands, checks rules like keep-out zones and battery floors, and writes a load that matches the onboard sequence format. It is hard because a plan is valid only against a predicted state, and prediction errors accumulate across days of unattended operation.",
    k: ["Detailed ground modeling versus onboard constraint checks: ground catches issues cheaply before uplink, while onboard checks protect against model error but cost flight resources.", "Long plans versus short ones: long plans use scarce contacts well, but amplify prediction errors and are costly to replace."],
    p: ["A plan checked against yesterday's orbit solution violates a constraint once the real orbit drifts.", "Rules that exist only in operators' heads, not in the tool, are broken by the next planner."],
    v: "Generate a plan with a deliberate violation, such as a transmit during a keep-out interval, and confirm the tool rejects it. Then uplink a valid plan to the test bed and see the same execution times in telemetry.",
    dep: ["ground-flight-dynamics","constraint-checker","stored-command-sequences"]
  },
  "telemetry-archive": {
    s: "Stores every downlinked value with its time and source so engineers can trend subsystem health, find slow degradation and investigate anomalies years later.",
    d: "Packets are decoded, time-corrected from spacecraft time to ground time, and stored as time series with their calibration. Engineers query by parameter and period, plot trends, and run automated checks for drift. Raw packets are kept as well, because decoding rules are sometimes wrong and must be reapplied. It is hard because volume grows for years, time correlation has gaps and jumps, and the value of the archive appears only during the one anomaly nobody planned for.",
    k: ["Keeping raw packets as well as decoded values: costs storage, but lets errors in calibration be fixed retroactively.", "Real-time trending versus batch analysis: live alarms catch fast faults, but slow drifts such as battery fade need long windows that only batch analysis can examine."],
    p: ["Time correlation errors place events in the wrong order and make a causal chain look backward.", "Dropped packets are interpolated by display tools, so a gap looks like a flat reading."],
    v: "Pick a past anomaly and rebuild its sequence of telemetry from the archive alone, with correct ordering across two subsystems, and compare it with the operators' log from that day.",
    dep: ["telemetry-framing"]
  },
  "ground-flight-dynamics": {
    s: "Ground-side orbit and attitude computation: precise orbit solutions from tracking, maneuver design, and the predictions that other tools and the spacecraft depend on.",
    d: "Tracking data such as range and Doppler from ground stations feeds an orbit solution much more accurate than the onboard one. Flight dynamics designs maneuvers, predicts eclipses and station visibility, and produces orbit products uploaded to the spacecraft. It carries heavy models for gravity, drag and radiation pressure. It is hard because small modeling errors in drag or thrust grow into large position errors, and a maneuver planned on a stale solution misses its target.",
    k: ["Ground orbit solution versus onboard navigation receiver: ground is more accurate but delayed, while onboard fixes are current but noisier and depend on receiver health.", "Uploading orbit elements versus sending state vectors: elements are compact, but the onboard propagator must use the exact model that made them."],
    p: ["Different ground and flight models for the same quantity produce a systematic offset that looks like an actuator error.", "Maneuver burn durations computed with a wrong thruster model leave the spacecraft off its target orbit."],
    v: "After a maneuver, compare the predicted orbit change with the post-burn tracking solution and confirm the difference is inside the planned tolerance for velocity change.",
    dep: ["ranging-and-doppler","orbit-propagator"]
  },
  "spacecraft-simulator": {
    s: "A software model of the spacecraft and its environment that runs the real flight software, so operators and testers can try commands and failures without risking the vehicle.",
    d: "It simulates orbit, attitude dynamics, sensors, actuators, power and thermal behavior, and connects to the flight software through the same interfaces the real units use. Operators rehearse procedures and testers inject faults such as a failed sensor. It is hard because the simulator is only as true as its models, and because simulating the real hardware timing precisely enough to expose race conditions is much costlier than simulating the dynamics.",
    k: ["Running the real flight binary versus a re-implementation: the real binary catches real defects, but needs emulation of the processor and hardware.", "High-fidelity physical models versus fast simulation: fidelity exposes subtle coupling, but slow runs mean fewer test cases."],
    p: ["Models tuned to match one scenario hide a behavior that only appears with real hardware, and tests pass for the wrong reason.", "A simulator that never gets the real hardware's failures teaches operators that failures are clean."],
    v: "Run an eclipse entry with a sun sensor failure injected and confirm the flight software reaches the expected safe mode and the logged telemetry matches the recorded behavior of a previous real run.",
    dep: ["attitude-control-laws","safe-mode-manager"]
  },
  "flatsat-testbed": {
    s: "A table-top assembly of the real flight computer, radios and spare or engineering-model units wired as in flight, used to run the software on real hardware before launch and after.",
    d: "The flight computer sits on a bench with real interface boards, with simulated sensors and actuators where flight units cannot be used. Testers load flight images, send commands over the real link protocol, and measure timing on real buses. It stays in use during the mission as the place to test patches before they go to orbit. It is hard because few are built, schedule pressure takes them for other uses, and the bench never matches flight in every cable and connector.",
    k: ["Flight-like hardware versus emulated hardware: real units show real timing and electrical faults, but are scarce and slow to reconfigure.", "A dedicated mission-long bench versus returning units to the flight project: keeping it allows post-launch patches to be tested, at ongoing cost."],
    p: ["Patching a flight issue without a bench match for the exact flight configuration delivers an untested change.", "Test cables or ground support equipment that mask a real fault mean the bench passes where flight would fail."],
    v: "Load the intended flight image onto the bench, run the full commissioning script, and confirm each timing measurement matches its recorded flight value within the stated tolerance.",
    dep: ["board-support-package","spacecraft-data-bus-driver"]
  },

  "link-protocol-stack": {
    s: "The layered rules that turn radio bits into reliable commands and telemetry: frame formats, coding, sequence numbers and retransmission, defined to survive noise and long delays.",
    d: "Layers cover modulation and coding at the bottom, then frames with error detection, then packets that carry commands or telemetry, and for some missions a delay-tolerant transfer layer above. Standards from space agencies define frame and packet formats so ground stations can interoperate. It is hard because round trips can take seconds to hours, windows are short, and a protocol designed for terrestrial networks wastes the contact on acknowledgments.",
    k: ["Reliable retransmitting transfer versus one-way streaming: retransmission guarantees completeness, but needs a return channel and wastes contact time on long delays.", "Standard framing versus custom framing: standards give interoperable ground networks, at the cost of header overhead on very small vehicles."],
    p: ["A frame counter that wraps during a long gap makes the receiver reject valid frames.", "Coding settings chosen for the link budget at launch no longer close once the antenna degrades."],
    v: "Inject bit errors on a link test and confirm corrupted frames are discarded by the check and the correct data arrives after retransmission, with the counters on both ends matching.",
    dep: ["radio-interface-driver"]
  },
  "telecommand-reception": {
    s: "Receives uplinked frames, checks them, and passes valid command packets to the command dispatcher while rejecting anything corrupt, out of sequence or from the wrong source.",
    d: "A hardware receiver locks onto the carrier, decodes the frames and raises them to software. The software checks the error-detection field and sequence counter, extracts packets and hands them on. Low-level reception often works even when the main processor does not, so the first commands in a recovery pass through hardware decoders. It is hard because the receiver must always listen, even in the lowest-power mode, and must never accept noise as a command.",
    k: ["Hardware command decoder versus software-only reception: hardware keeps working when the processor is dead, but allows only simple commands.", "Strict sequence checking versus accepting any valid frame: strict checking blocks replays and duplicates, but one lost frame can stall uplink until resynchronized."],
    p: ["A receiver that locks onto noise during eclipse produces false command frames that waste processing and fill logs.", "Sequence counters that are lost on a reboot make the first command after recovery get rejected."],
    v: "Send a valid command, a corrupted copy and a replayed copy, and confirm only the first runs, the others increment separate reject counters, and the command counters in telemetry show exactly one accepted frame.",
    dep: ["link-protocol-stack","radio-interface-driver","command-authentication"]
  },
  "command-authentication": {
    s: "Proves a command came from an authorized operator and was not altered or replayed, using keyed integrity codes and counters before the command can act on the spacecraft.",
    d: "Each command carries a code computed with a secret key and a counter that must advance. The spacecraft rejects commands that fail the check or repeat a counter. Some commands, such as software loads or propulsion, need a stronger level than routine ones. Keys are stored in protected memory and rotated by command. It is hard because a spacecraft cannot be reset to recover from lost keys, and an authentication fault in a rescue pass can lock the owner out.",
    k: ["Authenticate every command versus only critical ones: universal checking blocks spoofing, but adds failure modes to the emergency path.", "Counter-based replay protection versus time-based: counters need no clock but get out of sync, while time windows need a reliable onboard clock."],
    p: ["A key stored in changeable memory is corrupted by an upset and the vehicle rejects all commands.", "A bypass left in for testing remains reachable in flight."],
    v: "Send commands with a wrong code, a repeated counter and a correct code, and confirm only the correct one executes and the reject reasons appear as distinct events in telemetry.",
    dep: ["data-integrity-checks","onboard-time-service"]
  },
  "telemetry-framing": {
    s: "Packs housekeeping and event data into packets and frames with time stamps and counters for downlink, so ground can decode, order and detect gaps.",
    d: "Telemetry packets from many sources get a header with an application identifier, a sequence counter and a time stamp, then are packed into fixed-length frames with error-detection and optional coding. Virtual channels separate real-time telemetry from replayed recorded data. It is hard because frame size is fixed by the link while packets vary, and because priority must be managed: when the link is short, live health data goes first and bulk science data waits.",
    k: ["Fixed-length frames versus variable frames: fixed frames let the receiver stay in lock and resynchronize easily, but waste space with idle fill.", "Separate virtual channels for real-time and recorded data: operators see current state during replay, at the cost of a more complex scheduler."],
    p: ["A packet counter that restarts after reboot looks like loss of data to the archive.", "Real-time telemetry starved by a long replay leaves operators blind during the pass."],
    v: "Downlink a test pass and confirm sequence counters are continuous per source, time stamps are monotonic, and a deliberately dropped frame appears in the archive as an exact gap.",
    dep: ["telemetry-generator","link-protocol-stack"]
  },
  "ground-pass-manager": {
    s: "Tracks the schedule of ground station contacts and configures the radio, antenna pointing and downlink priorities onboard for each one, then closes the contact cleanly.",
    d: "It holds a contact plan, either uploaded or computed, and acts on it: powering the transmitter, selecting the antenna, setting data rates and queueing recorded data in order. It watches for signal lock and terminates when the contact ends or power limits are reached. It is hard because plans are uploaded days earlier and station schedules slip, so the spacecraft must recover when the station is late, early or absent.",
    k: ["Time-driven contacts versus lock-driven contacts: time-driven is simple but wastes power if the station is late, while lock-driven needs extra logic and state.", "Prioritizing health data versus data volume per pass: health first protects the vehicle, volume first returns more science."],
    p: ["Transmitter left on after a missed contact drains the battery.", "A plan with the wrong time reference starts the radio after the visibility window has closed."],
    v: "Run a pass with a late station and confirm the transmitter turns on as scheduled, stays within its power limit, turns off after the timeout, and the queued data resumes at the next contact.",
    dep: ["onboard-scheduler","store-and-forward-downlink","load-switching"]
  },
  "store-and-forward-downlink": {
    s: "Records data while out of contact and sends it later in priority order, resuming where it left off if a pass ends early and retrying anything not acknowledged.",
    d: "Data lands in the onboard recorder tagged by source and priority. During a pass, the downlink process reads it out in order, sends it in frames and tracks what the ground has confirmed. After the pass, ground tells the spacecraft what was missing and which data can be deleted. It is hard because storage is finite and the link is slower than data generation, so the decision about what to discard, and when, determines what the mission loses.",
    k: ["Delete after send versus delete after ground confirmation: confirmation protects against loss, but needs more storage and a command round trip.", "Overwrite oldest data versus stop recording when full: overwrite keeps recent data, stopping keeps the start of an event."],
    p: ["Data deleted after downlink but received corrupted on ground is lost for good.", "A recorder that fills during a long safe mode drops the data most needed to diagnose the fault."],
    v: "Fill the recorder, interrupt a pass halfway, and confirm the next pass resumes at the first unacknowledged frame and ground reconstructs the complete file with matching checksums.",
    dep: ["onboard-data-recorder","telemetry-framing"]
  },
  "ranging-and-doppler": {
    s: "Returns signals that let ground measure distance and velocity of the spacecraft from the radio link itself, feeding orbit determination.",
    d: "The transponder either turns around a ranging tone or code, or locks onto the carrier and returns it with a known frequency ratio so ground can measure Doppler shift. Software configures the transponder, selects the mode and reports lock state. It is hard because accuracy depends on delays that must be calibrated precisely, and because the function must work at low data rates, in modes where the main computer may not be running.",
    k: ["Transponder-based ranging versus onboard navigation receiver: ranging needs no extra unit and works everywhere, but needs ground stations and gives sparse data.", "Coherent versus non-coherent turnaround: coherent gives clean velocity data, but needs an extra reference oscillator."],
    p: ["An unmodeled delay change after a mode switch biases ranging and shifts the orbit solution.", "Ranging left enabled consumes downlink bandwidth meant for telemetry."],
    v: "Track a pass and compare the measured Doppler residual with the orbit prediction; residuals should fall below the documented noise level and show no step at mode changes.",
    dep: ["radio-interface-driver"]
  },
  "beacon-and-emergency-link": {
    s: "A minimal, always-available transmission and receive path that works in low power or after a failure, giving ground a chance to find and command the vehicle.",
    d: "A simple periodic transmitter sends a small packet with basic health data, and a low-rate command path accepts a short set of recovery commands. Both avoid the main computer where possible, using a hardware sequencer or minimal code. They use wide-beam or omnidirectional antennas so pointing does not matter. It is hard because the link budget is tight, the data is minimal, and this path is used only when everything else has gone wrong, so it is rarely exercised.",
    k: ["Independent hardware beacon versus software-driven beacon: independent hardware survives computer failure, but carries less information and is harder to update.", "Rich emergency telemetry versus minimal: richer data speeds diagnosis, but needs more power and a higher rate than the link allows."],
    p: ["A beacon format that changed in a software patch cannot be decoded by ground tools prepared for the old format.", "An emergency command path never tested in flight fails the first time it is needed."],
    v: "Power the vehicle into its lowest mode on the bench, with the main computer held in reset, and receive the beacon at the specified interval, then command a recovery action through the emergency receiver.",
    dep: ["telecommand-reception","safe-mode-manager"]
  },

  "payload-controller": {
    s: "The application that operates the mission instrument: configures it, starts and stops observations, collects its output and reports its state to the vehicle.",
    d: "It exposes high-level commands such as start observation, set exposure or select band, and turns them into register writes and timed sequences for the instrument electronics. It publishes instrument health and data on the software bus. It is hard because instrument behavior is often only partly specified, timing between payload and platform events matters, and the instrument team and the platform team are usually different organizations with different assumptions.",
    k: ["Payload software inside the main flight computer versus a separate payload computer: sharing saves mass and power, but a payload fault can then affect the whole vehicle.", "High-level commands versus raw register access: high-level commands are safer, but hide capabilities that are needed when something unexpected occurs."],
    p: ["Instrument commands that arrive while it is mid-sequence leave it in an undefined state.", "Interface documents that differ from the delivered unit's behavior surface only in integrated testing."],
    v: "Command a full observation on the bench with the real instrument, and confirm the sequence of register writes, the data returned and the telemetry state transitions match the interface document step by step.",
    dep: ["software-bus","instrument-mode-manager","unit-drivers"]
  },
  "instrument-mode-manager": {
    s: "Keeps the instrument in a defined mode, checks that each requested mode change is allowed, and sequences the warm-up, operate and shutdown steps between them.",
    d: "Each mode, such as off, standby, calibration and observation, has entry conditions, a defined sequence and exit rules. A mode change request is checked against vehicle state, such as power margin and pointing, before it starts. It also tracks time-in-mode limits for parts that wear or overheat. It is hard because the allowed transitions form a graph with failure paths, and the software must handle an interrupted transition without an unsafe leftover state.",
    k: ["Explicit state machine versus ad hoc command handling: a state machine makes illegal transitions impossible and testable, but needs upfront modeling.", "Autonomous mode drop on fault versus waiting for ground: dropping quickly protects hardware, but may waste a rare observation opportunity."],
    p: ["A shutdown interrupted halfway leaves a detector powered without cooling.", "Mode timers that are not reset on a reboot allow overlong operation."],
    v: "Request every legal and illegal mode change in a test run and confirm illegal ones are rejected with a reason, and an interruption by power loss during a transition recovers to a defined mode.",
    dep: ["payload-controller","power-budget-enforcer"]
  },
  "payload-data-handler": {
    s: "Collects instrument data, wraps it in packets with metadata such as time and pointing, and routes it to the recorder or downlink.",
    d: "Instrument output arrives over a high-rate interface, often through a dedicated link or direct memory access. The handler attaches time, attitude, instrument settings and quality flags so the data can be used without further context, then stores or forwards it. It is hard because rates can exceed what the main processor can copy, buffers must absorb bursts, and lost metadata makes the data worthless even if the samples survived.",
    k: ["Hardware path directly to storage versus through the processor: direct paths handle high rates, but bypass checks that the processor can apply.", "Metadata embedded in each packet versus separate ancillary files: embedding guards against loss, but increases data volume."],
    p: ["Buffer overflow during a burst silently drops samples while counters look normal.", "Time stamps taken at processing rather than at acquisition shift data by the buffer delay."],
    v: "Run an observation at maximum rate and confirm the recorded sample count equals the instrument's own count, with time stamps within the allowed error of the acquisition clock.",
    dep: ["onboard-data-recorder","onboard-time-service","message-definitions"]
  },
  "onboard-data-compression": {
    s: "Reduces data volume before storage or downlink, using lossless or controlled lossy methods chosen to fit the link and the science requirements.",
    d: "Standard algorithms for images and spectra shrink data by factors that depend on content. The compressor may run in hardware or software, with parameters set by command per observation. It must produce a stream that ground can decode even if frames are lost, so data is split into independently decodable segments. It is hard because compression ratio varies with content, which makes downlink volume unpredictable, and because a bad parameter can ruin an observation irrecoverably.",
    k: ["Lossless versus lossy: lossless preserves all information, but saves less, while lossy fits more but sets a permanent quality limit.", "Independent segments versus a single stream: segments localize loss to one piece, but compress slightly less well."],
    p: ["A compression setting tuned on typical scenes fails to fit the link when a busy scene arrives.", "One lost frame corrupts the rest of a stream with no resynchronization points."],
    v: "Compress and decompress reference scenes of high and low content on the bench; confirm lossless data is bit-exact and lossy data stays inside its stated error, and that dropping a frame affects only its own segment.",
    dep: ["payload-data-handler"]
  },
  "pointing-coordination": {
    s: "Requests the attitude and pointing the instrument needs from the control system, and confirms the vehicle is stable and aimed before data is taken.",
    d: "The payload sends target requests, such as point at a coordinate or scan along a path, to attitude control, and waits for a pointing-ready flag including settling time. It then timestamps data with the achieved pointing. It is hard because instrument and platform have conflicting goals, such as holding still for long exposures while also needing sun on the arrays, and a handshake mistake leaves data collected while pointed at the wrong place.",
    k: ["Payload requests pointing versus planner scripts attitude directly: requests keep flexibility onboard, but need arbitration, while scripts are predictable but rigid.", "Waiting for settled flag versus fixed settling time: the flag is accurate, but fails if the flag is wrong, whereas a fixed time is simple but wasteful."],
    p: ["A pointing-ready flag set before the vehicle has settled yields smeared images.", "Conflicting payload and power requests leave the vehicle oscillating between attitudes."],
    v: "Command a slew to a target and confirm the data's recorded pointing error at the moment of exposure is within the tolerance and the exposure waited for the settled flag.",
    dep: ["attitude-control-laws","payload-controller"]
  },
  "payload-protection": {
    s: "Interlocks that switch off or safe the instrument when a condition could damage it, such as sun in the optics, overheating or a power shortfall.",
    d: "Monitors watch inputs like sun angle, detector temperature, bus voltage and vehicle mode, and force the instrument to a safe state when limits are crossed. They act through hardware inhibits where possible and run at a priority above the payload application. It is hard because protection has to be faster and simpler than what it protects, and because it must not be disabled by the same fault, such as a processor lock-up, that it is guarding against.",
    k: ["Hardware interlock versus software protection: hardware does not depend on the processor, but is hard to change after launch.", "Tight thresholds versus loose: tight ones protect the instrument but cause false trips that cost observations."],
    p: ["Protection tests run with limits widened for convenience remain widened in the flight table.", "An interlock fed by the same sensor as the control loop fails together with it."],
    v: "Drive the instrument toward a limit on the bench, such as simulated sun in the field of view, and confirm the interlock trips within the required time and holds until explicitly cleared.",
    dep: ["limit-checking","load-switching","payload-controller"]
  },

  "onboard-scheduler": {
    s: "Runs commands at their scheduled times while the spacecraft is out of contact, executing stored plans in order with accurate timing.",
    d: "It keeps a table of commands with release times, compares them to the onboard clock, and sends each to the command dispatcher when due. It supports relative and absolute times and can hold, skip or abort a sequence. The scheduler is the main way a mission runs unattended. It is hard because commands depend on state that may not match the plan, and because an error in the stored plan will be repeated faithfully, with nobody there to stop it.",
    k: ["Absolute times versus times relative to an event: absolute times are simple to plan, but break when events slip, while relative times follow events but hide the real schedule.", "Execute-all versus abort-on-failure: executing all keeps the plan on schedule but may act on a failed premise, aborting loses the rest of the plan."],
    p: ["A clock jump after time correction makes a whole block of commands due at once.", "A late-arriving command in the past is either executed immediately or silently dropped, depending on an undocumented rule."],
    v: "Load a sequence of ten timed commands, and confirm that each executes within the stated jitter of its time, in order, with the execution log time stamps matching the onboard clock.",
    dep: ["time-tagged-queue","onboard-time-service","command-dispatcher"]
  },
  "time-tagged-queue": {
    s: "The ordered store of individual commands awaiting execution, each with its release time, from which the scheduler takes whatever is next due.",
    d: "Commands arrive from ground with a time tag and are placed in a queue sorted by time. Ground can list, delete or replace entries. The queue is held in memory that survives reset, so a reboot does not discard the plan. It is hard because capacity is limited, entries must be validated on arrival and again on release, and memory corruption in the queue could release a command that nobody sent.",
    k: ["Queue in non-volatile memory versus RAM: non-volatile survives resets, but wears and is slower, while RAM is fast but loses the plan on a reboot.", "Validate on insert only versus also on release: insert-time checks are cheaper, release-time checks catch state changes and corruption."],
    p: ["Queue overflow from a long plan silently discards the final commands.", "Entries that are in the past after a long safe mode execute all at once on exit."],
    v: "Fill the queue to capacity, confirm the next insert is refused with an error, reset the processor, and confirm every remaining entry survives and executes in order.",
    dep: ["command-validation","non-volatile-memory-driver","data-integrity-checks"]
  },
  "stored-command-sequences": {
    s: "Named command scripts held onboard, such as a standard observation or a recovery procedure, that are started by one command or by an event.",
    d: "A sequence is a list of commands with relative delays and optional conditions. Ground uploads and updates them, and they can call other sequences. They are used both for routine operations and for responses written in advance, such as the steps to recover from a safe mode. It is hard because sequences are software with no compiler: errors appear only at execution, and nesting or loops can produce a runaway.",
    k: ["Sequences with conditions and loops versus straight-line lists: richer logic reduces ground effort but needs a mini-interpreter that must itself be verified.", "Many small sequences versus a few large: small ones are reusable and testable, but increase calls and bookkeeping."],
    p: ["A sequence that calls itself indirectly consumes resources until the vehicle faults.", "A sequence tested only in the simulator uses a command whose parameters changed in the flight build."],
    v: "Run each stored sequence on the test bed against the exact flight tables, with its expected telemetry checked after every step, and confirm a deliberately introduced loop is stopped by the depth limit.",
    dep: ["onboard-scheduler","command-dispatcher","constraint-checker"]
  },
  "event-action-engine": {
    s: "Matches events or telemetry conditions to predefined actions, so the spacecraft reacts in seconds without waiting for a command from the ground.",
    d: "A table pairs a trigger, such as an event identifier or a limit violation, with an action, such as start a sequence or switch a unit. The engine subscribes to events on the bus, checks the table and runs actions. It is the generic mechanism behind many autonomy functions. It is hard because rules interact: two correct rules can fight, a rule can trigger itself through its own action, and the full set is too large for anyone to hold in mind.",
    k: ["Table-driven rules versus coded logic: tables can be changed in flight, but evaluating every combination of rules is harder than reviewing code.", "Debounce counts versus immediate action: debounce rejects transient glitches, but delays the response to a real fault."],
    p: ["Two rules triggered by the same event take conflicting actions in an unpredictable order.", "A rule action that generates the event it listens for creates a loop that floods the event log."],
    v: "Inject each trigger on the bench and confirm exactly the listed action runs once, in the stated time, and that the engine's own action count and event log agree.",
    dep: ["event-reporting","stored-command-sequences","software-bus"]
  },
  "onboard-autonomy-rules": {
    s: "The set of decisions the spacecraft makes for itself between contacts: when to point, when to downlink, when to drop a task for power, and what to do on a surprise.",
    d: "These are authored as tables and small procedures, and some missions add planners that choose among goals using an onboard model. Rules draw on vehicle state, predicted events and constraints, and issue commands through the normal dispatch path. Autonomy shrinks the ground workload and shortens response times. It is hard because every rule added is untested in the real environment, and its behavior in combination with others is hard to prove complete.",
    k: ["Pre-scripted rules versus an onboard planner: scripts are predictable and easy to verify, while planners cope with surprises but are harder to certify.", "Autonomy that can cancel ground plans versus autonomy that only advises: canceling protects the vehicle, but surprises operators who did not expect the change."],
    p: ["Autonomy that acts on a bad sensor reading takes a harmful action faster than ground can notice.", "Rules written for the nominal mission stay active after a failure changes what is possible."],
    v: "Run the mission scenario set in the simulator, including surprise events, and confirm each autonomous decision appears in the event log with its cause and that ground can reconstruct why it acted.",
    dep: ["event-action-engine","constraint-checker","health-monitoring"]
  },
  "orbit-event-predictor": {
    s: "Computes upcoming orbit events such as eclipse, ground station visibility and target passes onboard, so schedules can follow the real orbit rather than a fixed time.",
    d: "Using the orbit propagator it finds when the vehicle will enter shadow, rise over a station, or cross a latitude. Other functions subscribe to these predictions to prepare, for example heating the battery or powering the transmitter. It is hard because predictions grow stale as the orbit solution ages, and because corner cases such as grazing shadows and low elevation passes cause events that appear and disappear.",
    k: ["Onboard prediction versus ground-supplied event times: onboard adapts to maneuvers and drift, but spends processing and needs an accurate state.", "Conservative margins versus exact times: margins avoid surprises, but waste power or contact time."],
    p: ["Predicted events based on an old orbit state drift by minutes after a few weeks without update.", "A time-of-event crossing the end of a time scale correction is predicted a second off."],
    v: "Compare predicted eclipse entry and exit against the actual sun sensor transition across several orbits and confirm the error stays within the budgeted margin and does not grow.",
    dep: ["orbit-propagator","onboard-time-service"]
  },
  "constraint-checker": {
    s: "Checks proposed commands and plans against rules such as battery floors, keep-out directions and thermal limits before they run, onboard as well as on the ground.",
    d: "Each constraint is a rule about vehicle state or timing: do not transmit while the antenna is stowed, do not start a heater load below a charge level. The checker evaluates a command against current state and, for plans, against predicted state. Violations block or modify the command and are reported. It is hard because the rules must be complete, consistent between ground and flight, and cheap enough to run on every command.",
    k: ["Constraints enforced both on ground and onboard: duplicate checks catch more, but must be kept in agreement or they disagree in operation.", "Block the command versus run with a warning: blocking is safe but halts operations, warnings keep the mission moving but depend on attention."],
    p: ["A constraint rule that exists in the planner but not in flight lets an unsafe command through.", "A constraint based on predicted state is wrong when the prediction is stale and blocks a valid command."],
    v: "Submit commands that violate each documented constraint and confirm each is blocked with the specific reason, and that the ground tool and the flight checker give the same verdict for the same input.",
    dep: ["parameter-database","housekeeping-collector"]
  },
});
