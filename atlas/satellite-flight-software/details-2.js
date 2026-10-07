// Details, part 2: command and data handling, fault management, in-flight updates.
ATLAS.details("satellite-flight-software", {
  "command-dispatcher": {
    s: "Takes each accepted command, finds the application that owns it, delivers it with its arguments, and records the outcome so ground can see what happened.",
    d: "Commands come from the uplink, the scheduler, stored sequences and the event-action engine, and all pass through the same entry point. The dispatcher looks up the target by identifier, checks its arguments and delivers the command over the software bus. It counts accepted and rejected commands and sends a verification report. It is hard because every source must be treated alike, yet some should have priority, and because a command that is accepted but never executed must be distinguishable from one that was executed and failed.",
    k: ["One dispatch path for every source versus separate paths: one path gives consistent checks and logs, but a busy source can delay an urgent one.", "Acknowledge on acceptance versus on completion: early acknowledgment is quick, but says nothing about the result, while completion reports need tracking."],
    p: ["A command counter that increments on rejection as well as acceptance misleads operators checking success.", "Commands dropped silently when the target application is not running leave no trace."],
    v: "Send a command to each application, one rejected for a bad argument and one to a stopped application, and confirm each outcome appears as a distinct verification report with matching counters.",
    dep: ["command-validation","software-bus","event-reporting"]
  },
  "command-validation": {
    s: "Checks that a command is known, well formed, in range and allowed in the current mode before it is allowed to act on hardware.",
    d: "Validation covers structure and length, argument limits, the current vehicle mode, required arming steps for hazardous commands, and the authority level of the sender. Hazardous commands such as thruster firings need a two-step arm and execute. It is hard because the rules are scattered across applications and must stay in agreement with the ground command database, and because overly strict checks block the recovery commands needed in an emergency.",
    k: ["Central validation versus validation in each application: central rules are consistent, but cannot know application-specific state, so both are usually needed.", "Arm-and-execute for hazardous commands versus single command: two steps resist mistakes, but double the time needed when seconds matter."],
    p: ["Limits copied from a document rather than the hardware allow values that physically damage a unit.", "A mode check that has no exception for recovery blocks the one command that would fix the fault."],
    v: "Send each class of bad command: unknown identifier, wrong length, out-of-range value, wrong mode and unarmed hazard. Confirm each is refused with a distinct reason and the hardware is untouched.",
    dep: ["parameter-database","command-authentication"]
  },
  "telemetry-generator": {
    s: "Builds the packets of telemetry that go to ground, selecting which values to include, how often, and in what form, according to configurable report definitions.",
    d: "Report definitions list parameters, rates and packet destinations. The generator samples values at the set rate, packs them and sends them to the recorder or the downlink. Ground can change a definition in flight to focus on a problem. It is hard because the downlink is scarce, so what to send is a continuous trade, and because definitions changed in flight must stay in step with the ground decoding database.",
    k: ["Fixed report definitions versus adjustable ones: fixed reports are simple to decode, adjustable ones allow focus on anomalies but risk ground and flight disagreeing.", "Sample at the source versus gather in one place: source sampling is precise in time, while central gathering is simpler but coarser."],
    p: ["A report changed during an anomaly is not recorded in ground documentation, so later analysts misread it.", "Sampling rates that alias a periodic signal hide a vibration or oscillation."],
    v: "Change a report definition by command, and confirm the next packet has the new contents, the new rate, and a version identifier that ground uses to select the matching decoder.",
    dep: ["housekeeping-collector","parameter-database","message-definitions"]
  },
  "housekeeping-collector": {
    s: "Gathers current values of every subsystem's health data into consistent snapshots that telemetry, FDIR and autonomy all read.",
    d: "Each application publishes its status at a set rate, and the collector assembles them into tables with a common time stamp. Other functions read the snapshot instead of polling units themselves. It decouples consumers from producers. It is hard because a snapshot must be consistent: values sampled at different times can show impossible combinations, and slow producers leave stale entries that look current.",
    k: ["Snapshots at a fixed rate versus values on change: fixed snapshots are predictable, on-change data is efficient but makes absence of change ambiguous with failure.", "Central store versus consumers asking applications directly: a store gives a single view, but becomes a dependency that every function relies on."],
    p: ["A frozen producer leaves its last value in the snapshot, so a dead sensor reads normal.", "Mixed-age values in one snapshot produce a false alarm from a combination that never existed."],
    v: "Stop one application and confirm its entries in the next snapshots are marked stale with their age, and that FDIR reports the missing data rather than reusing the last value.",
    dep: ["software-bus","onboard-time-service"]
  },
  "onboard-data-recorder": {
    s: "Non-volatile storage that holds telemetry and payload data between ground contacts, organized so it can be read out by priority and survives resets.",
    d: "Data is written to separate partitions or logical streams for housekeeping, events and payload data, each with its own policy for full conditions. Reads happen during contact, driven by the downlink manager. Bad blocks and wear are managed below it. It is hard because writes during a power loss must not corrupt old data, capacity limits what can be kept, and radiation upsets corrupt stored data over time.",
    k: ["Separate streams per data type versus a single log: separate streams protect critical data from bulk data filling the space, but fragment capacity.", "Flash versus battery-backed RAM: flash is dense but wears and needs block management, RAM is fast but small and needs power."],
    p: ["Bulk payload data fills the store and displaces the health data needed to diagnose the fault.", "A write interrupted by a brownout leaves a partial record that the reader decodes as valid."],
    v: "Write until full for each policy, cut power mid-write, and confirm on restart the store opens, earlier records are intact, and the partial record is detected and discarded.",
    dep: ["non-volatile-memory-driver","data-integrity-checks","onboard-file-system"]
  },
  "onboard-file-system": {
    s: "A simple file layer over onboard storage that lets ground list, upload, download and delete files, used for data, tables and software images.",
    d: "Files are small in number and managed by command: create, read segments, delete, checksum. The design favors robustness over features, with no hierarchy beyond a few directories, atomic updates and simple recovery after reset. Large transfers use the transfer protocol in pieces. It is hard because a general-purpose file system's recovery is too complex to prove, yet a corrupted directory can lose everything, so integrity is built in simply.",
    k: ["Simple flat store versus a full file system: a simple one is easy to verify and recover, but limits organization, while a full one is flexible but harder to prove.", "Write-once files versus in-place updates: write-once avoids partial updates, but needs garbage collection and extra space."],
    p: ["A power loss during a directory update leaves two files claiming the same space.", "Ground deleting by name a file that is also open for downlink corrupts the transfer."],
    v: "Create, replace and delete files with power cuts injected at random points during each operation, then mount and confirm every file either matches its pre- or post-operation checksum and the directory is consistent.",
    dep: ["non-volatile-memory-driver","data-integrity-checks"]
  },
  "onboard-time-service": {
    s: "Maintains spacecraft time, correlates it with ground and navigation time, and distributes it so every command, packet and measurement can be put in order.",
    d: "A hardware counter or oscillator runs continuously, and software keeps an offset to a reference time. Ground, or a navigation receiver, supplies corrections, and a pulse each second synchronizes units. Time stamps on data use this service. It is hard because the clock drifts with temperature and age, corrections must not make time go backward, and a time jump invalidates stored schedules and authentication windows.",
    k: ["Slewing the clock gradually versus stepping it: slewing keeps time monotonic and schedules intact, but takes long to correct large errors.", "Spacecraft elapsed time as primary versus a universal time scale: elapsed time never jumps, but every consumer must translate to real time."],
    p: ["A time correction applied in the middle of a command block executes some commands twice or skips them.", "A counter rollover after a long mission produces times that are decades wrong."],
    v: "Apply a known correction by command, confirm time moves smoothly with no repeated or skipped second, and compare a time-stamped event to ground measurements to confirm the offset stays within the stated bound.",
    dep: ["timers-and-system-clock","mission-time-distribution"]
  },
  "parameter-database": {
    s: "The set of configurable values, such as limits, gains, thresholds and addresses, held in tables that can be read and changed by ground without a software update.",
    d: "Each parameter has a type, range, default and an owner. They are stored in tables in protected memory and loaded at startup, so a reset reaches the last good values. Ground changes them with validated commands. Changing parameters is the main way a mission adapts after launch. It is hard because parameters interact, a valid change in one place can make the system unstable somewhere else, and nobody remembers why a value was set.",
    k: ["Parameters changeable in flight versus fixed at build: changeability allows adaptation, but also allows a wrong value to be loaded.", "Single global store versus per-application tables: a global store makes review easy, but couples every application to one format."],
    p: ["A threshold changed for an operation and never restored makes FDIR blind later.", "A table version mismatch after a software update reads old values at new offsets."],
    v: "Change a parameter by command, check it is applied and shown in telemetry with its new value, reset the processor, and confirm the value persists and each out-of-range change is refused.",
    dep: ["table-services","data-integrity-checks"]
  },
  "event-reporting": {
    s: "A uniform way for any application to report something that happened, such as a fault, a state change or a command result, with severity and a time stamp.",
    d: "Applications raise events with an identifier, severity and a few arguments. The service filters by severity, rate-limits repeated events, logs them, sends them to telemetry and offers them to subscribers such as the event-action engine. Event logs are the first thing analysts read after an anomaly. It is hard because events must be informative without flooding the link, and a fault that repeats at high rate can drown out the first, most useful message.",
    k: ["Rate-limiting repeated events versus reporting each one: limiting protects the link and the log, but can hide how often something happened.", "Fixed event identifiers versus free text: identifiers are compact and machine-readable, but are less self-explanatory to operators."],
    p: ["A flood of identical events from one failing unit overwrites the log, leaving no record of the initial fault.", "Severity levels that are applied inconsistently make filtering by severity useless."],
    v: "Trigger one event ten thousand times and confirm the first occurrences are logged in full, the rest are counted and reported as suppressed, and the log still holds the earlier unrelated events.",
    dep: ["software-bus","onboard-time-service"]
  },

  "health-monitoring": {
    s: "Continuously compares what each unit reports against what it should be doing, and signals when a unit has stopped responding, drifted or entered an unexpected state.",
    d: "Monitors cover heartbeats from applications, response from hardware units, consistency between redundant sensors, and expected state against commanded state. Each monitor has a check rate, a persistence count and an owner. Results feed fault isolation. It is hard because a monitor that is too sensitive triggers needless recovery, while one that is too relaxed lets a fault grow, and thresholds are set before real behavior is known.",
    k: ["Many specific monitors versus few general ones: specific monitors isolate faults precisely but need maintenance, while general ones are simple but give vague results.", "Persistence count versus single-sample trigger: persistence rejects glitches, but delays response to faults that develop in seconds."],
    p: ["A monitor that depends on the unit it watches stops reporting at the same moment as the fault.", "Thresholds set from ground testing trigger false alarms in the real thermal environment."],
    v: "Stop one application's heartbeat and confirm the monitor trips after exactly its persistence count, produces a single event naming the unit, and clears when the heartbeat resumes.",
    dep: ["housekeeping-collector","limit-checking","watchdog-timers"]
  },
  "limit-checking": {
    s: "Compares telemetry values against configured warning and critical limits and raises a flag when a value is out of range, for ground and for FDIR.",
    d: "Each monitored parameter has soft and hard limits, which may depend on the mode, plus a persistence count. A violation produces an event and can trigger a recovery action. Ground tools use the same limits for display. It is hard because correct limits change with mode, temperature and age, and because a limit that suppresses an alarm during a known transient can stay suppressed too long.",
    k: ["Mode-dependent limits versus a single set: mode-dependent limits reduce false alarms, but require the mode to be known and correct.", "Limits in tables versus in code: tables can be tuned in flight, but a wrong table is a new failure path."],
    p: ["Limits copied from the pre-launch database no longer match battery behavior after a year in orbit.", "A suppression set during a maneuver is never lifted, so the parameter stays unmonitored."],
    v: "Drive a simulated value through warning and critical limits in both directions, confirming events at each crossing, no event within the hysteresis band, and correct behavior after a mode change with different limits.",
    dep: ["parameter-database","housekeeping-collector","event-reporting"]
  },
  "fault-isolation": {
    s: "Works out which unit or function is actually at fault from a set of symptoms, so the recovery action targets the cause rather than whatever reported the problem.",
    d: "Symptoms from monitors are matched against a fault tree or table that maps patterns to suspects. When several explanations fit, the logic tries the cheapest or most likely action and watches whether symptoms clear. Cross-checking with redundant units can tell a faulty sensor from a real change. It is hard because one fault produces many symptoms across subsystems, and because wrongly blaming a healthy unit swaps it for a spare and masks the real problem.",
    k: ["Table-driven isolation versus model-based reasoning: tables are simple to verify, models handle novel combinations but are harder to prove correct.", "Isolate before acting versus act on first symptom: isolation avoids wrong swaps, but costs time during a fast fault."],
    p: ["A faulty bus blamed on one unit leads to the swap of every unit on the bus in turn.", "Symptoms that arrive in a different order than tested lead the logic to a wrong suspect."],
    v: "Inject each single fault in the simulator and test bed and confirm the logged suspect matches the injected unit, and that two simultaneous faults are reported with both suspects or flagged as ambiguous.",
    dep: ["health-monitoring","redundancy-manager"]
  },
  "recovery-action-tables": {
    s: "The pre-written responses to each detected fault, such as retry, reset a unit, switch to the spare or enter safe mode, with the order and limits for each.",
    d: "Each fault entry lists escalating steps: first retry, then reset the unit, then reconfigure to redundant hardware, then drop to a higher level of FDIR. Counters limit how often an action may run before it escalates. Entries can be enabled, disabled and edited by command. It is hard because the table is the design of fault tolerance in executable form, and because every entry needs testing in the flight configuration, which often cannot be done fully before launch.",
    k: ["Escalating responses versus immediate drastic action: escalation avoids needless disruption, but delays resolution of a serious fault.", "Responses editable in flight versus frozen: editing allows fixes and adaptation, while frozen tables remove a way to introduce mistakes."],
    p: ["An action that is disabled to stop nuisance trips is never re-enabled and the fault later goes unhandled.", "Two tables with overlapping triggers run conflicting actions on the same unit."],
    v: "For every table entry, trigger its fault on the test bed and confirm the actions run in the listed order, escalate at the listed counts and leave the vehicle in the documented state.",
    dep: ["fault-isolation","table-services","fdir-level-hierarchy"]
  },
  "fdir-level-hierarchy": {
    s: "The layered structure of fault handling: unit-level checks first, then subsystem, then vehicle-wide, with each level handling faults of its own scale and escalating to the next.",
    d: "Level zero is hardware protection, level one is unit or application recovery, level two is subsystem reconfiguration, and the top level is vehicle safe mode. A fault is handled at the lowest level that can resolve it; failure to resolve passes it upward with a counter. Higher levels act more drastically and interrupt more of the mission. It is hard because levels must not fight each other, and the upper levels must work when the lower ones have failed.",
    k: ["Many layers versus a flat design: layers contain the effect of each fault and keep minor faults minor, but add paths that all need testing.", "Independent upper levels versus sharing the main processor: independent hardware survives main computer failure, but adds a unit with its own faults."],
    p: ["Two levels attempting recovery at once reset a unit twice and prevent either from working.", "The top level depends on the same processor whose hang it must detect."],
    v: "Force a fault that the first level cannot clear and confirm escalation occurs at the documented count, with the event log showing each level's action, and the vehicle ending in safe mode.",
    dep: ["recovery-action-tables","watchdog-timers","safe-mode-manager"]
  },
  "safe-mode-manager": {
    s: "Puts the vehicle into a minimal, stable configuration that keeps it powered, cool and reachable, then waits for ground rather than trying to continue the mission.",
    d: "On entry it stops the payload and nonessential loads, starts the safe attitude controller, turns on the emergency link and selects the redundant computer if needed. It holds there, repeating checks, until ground commands an exit. A safe mode must work with the fewest functions and the least assumed state. It is hard because entering it correctly from every possible state is difficult, and a vehicle that enters it too easily loses the mission.",
    k: ["Safe mode as a rare last resort versus a routine response: rare use reduces mission loss, but untested paths become likely to fail, while routine use exercises them.", "Autonomous exit versus ground-only exit: ground-only exit is safer, but a short glitch then costs days of operation."],
    p: ["Safe mode entered while a heater is stuck on drains the battery before ground can respond.", "Repeated unintended entries during commissioning teach operators to treat it as normal and miss a real one."],
    v: "Trigger safe mode from each major operating state on the test bed, and confirm the vehicle reaches the sun-safe attitude, the payload is off, the beacon transmits and the power draw falls to the documented level.",
    dep: ["safe-attitude-controller","beacon-and-emergency-link","undervoltage-load-shed"]
  },
  "safe-attitude-controller": {
    s: "A simple control mode that points the solar arrays at the sun and limits spin using only the few sensors and actuators known to survive most faults.",
    d: "It uses coarse sun sensors, rate gyros if available and magnetic or reaction actuators in a simple law that does not need a star tracker or an orbit solution. Its goal is positive power and stable temperature, not accuracy. It often runs as separate, much smaller code than the normal controller. It is hard because it must start from any attitude and rate, including tumbling, and must find the sun without help.",
    k: ["Separate simple controller versus a mode of the main one: separate code does not share the main controller's bugs, but needs its own testing and maintenance.", "Sun-pointing versus spinning for stability: spinning is simple and robust but constrains antenna use, while pointing is efficient but more fragile."],
    p: ["A sun sensor blinded by albedo or reflections sends the controller in the wrong direction.", "Wheels saturated in the fault leave no authority to point, and only thrusters or torquers can recover."],
    v: "Start the controller in simulation from random attitudes and rates up to the specified tumble rate, and confirm that every case reaches sun-pointing within the time limit and keeps positive power.",
    dep: ["actuator-management","attitude-sensor-processing","unit-drivers"]
  },
  "redundancy-manager": {
    s: "Tracks which of the duplicate units is in use, switches to the spare on command or on fault, and makes sure both are never driven at once.",
    d: "It holds the configuration: which computer, bus, sensor and transmitter are prime, which are cold or hot spares. Switching sequences power, route buses and restore state in the right order. Cross-strapping lets any prime use either of two partners. It is hard because the number of possible configurations grows quickly, and because the switch must work when the active unit has failed and cannot cooperate, which also makes it hard to test.",
    k: ["Cold spares versus hot spares: cold spares save power and avoid shared faults, but need time to start and state transfer, while hot spares take over fast.", "Cross-strapped versus paired chains: cross-strapping survives more combined failures, but adds wiring and states to verify."],
    p: ["A swap that does not copy the current state to the spare makes the spare start in the wrong mode.", "Both units driving the same bus after a swap damages the line or the units."],
    v: "Power-fail the prime unit during a test, confirm the spare takes over inside the allowed time with the same state, the failed unit is isolated, and a command to switch back refuses when the old unit is flagged failed.",
    dep: ["load-switching","processor-redundancy","spacecraft-data-bus-driver"]
  },

  "software-upload-service": {
    s: "The ground-commanded process of sending new software or data to the spacecraft in many pieces, checking each piece and the whole, and only then making it usable.",
    d: "The ground splits a file into segments and sends them across passes. The service writes each into a holding area, keeps a record of what has arrived, and reports gaps. When complete, it checks length and checksum against values sent separately, and waits for a distinct command to activate. It is hard because uploads span days, can be interrupted by resets or safe modes, and must never alter the running software until the whole image is proven.",
    k: ["Stage then activate versus write directly into the target: staging protects the running image, but needs spare storage the size of the image.", "Segment-by-segment confirmation versus whole-file confirmation: segment checks find errors early, but cost link time."],
    p: ["An upload interrupted by safe mode resumes with a wrong segment offset and silently corrupts the image.", "An image validated only by length passes with a few flipped bits."],
    v: "Upload a test image over a lossy simulated link with interruptions, and confirm the final staged image matches the ground copy bit for bit by independent checksum before activation is allowed.",
    dep: ["onboard-file-system","image-integrity-check","command-validation"]
  },
  "image-integrity-check": {
    s: "Verifies that a software image is complete and unaltered using checksums or signatures before it is stored, booted or activated.",
    d: "A stored image carries a header with length, version and an integrity code. The check runs after upload, before each boot selection and periodically while stored, to catch radiation damage in non-volatile memory. A signature check can also confirm the image came from the owner. It is hard because the checker itself must not be changeable in the field, and because a long image takes real time to check at boot, when time is limited.",
    k: ["Checksum versus cryptographic signature: a checksum detects accidents cheaply, while a signature also blocks tampering but needs key management.", "Check at boot versus check on a schedule: boot checks protect each run, scheduled checks find slow damage without delaying startup."],
    p: ["A checksum that covers the image body but not its header accepts an image with a changed entry address.", "The check passes but the boot loader uses a stale cached copy."],
    v: "Flip one bit in a stored image on the bench and confirm the next check rejects it, the loader selects the alternate image, and an event names the failed image and the check that caught it.",
    dep: ["data-integrity-checks","dual-image-storage"]
  },
  "dual-image-storage": {
    s: "Keeps two or more complete software images in non-volatile memory so a new one can be tried while a known-good one stays safe.",
    d: "A boot table points to the current image, the previous image and a protected original. The loader chooses by status flags set by upload, activation and success confirmation. Each image sits in its own memory region with independent error correction. It is hard because all copies share the same radiation environment, the table selecting them is a single point of failure, and storage for several images competes with data.",
    k: ["Two images versus three or more: two allow fallback, while a third read-only golden copy covers a failed update, at the cost of memory.", "Selection table in one place versus replicated: replicated tables survive corruption, but must be updated consistently."],
    p: ["The boot selection table is itself corrupted and the loader cannot decide which image is valid.", "A new image marked good on first boot, before it has run through a full orbit, hides a late-appearing fault."],
    v: "Corrupt the active image and then the selection entry in separate bench runs, and confirm each time the vehicle boots a valid image within the required time and reports what it rejected.",
    dep: ["non-volatile-memory-driver","boot-rom-and-loader"]
  },
  "patch-loader": {
    s: "Applies small changes to running or stored software without a full image replacement, saving link time on long missions that have found a defect.",
    d: "A patch is a list of address ranges and replacement words, or a table of hooks that redirect calls to new code held in a reserved area. The loader validates the patch, writes it, optionally hooks it in at a safe point, and records what was applied so it can be removed. It is hard because patching live code touches data the program may be using, patches pile up in ways no one tested together, and the base image must be known exactly.",
    k: ["Patching in memory versus rebuilding a full image: patches are fast and small, but diverge from the verified build and accumulate.", "Reapply patches at every boot versus patch non-volatile image: reapplying is reversible by deleting the list, but makes boot longer and depends on list integrity."],
    p: ["A patch built against one build is applied to another and corrupts unrelated code.", "A patch applied while the patched function runs leaves it half old and half new."],
    v: "Apply a patch that changes a known behavior on the test bed, confirm the new behavior in telemetry, remove it by command, and confirm the original behavior returns and the memory dump matches the original image.",
    dep: ["memory-load-and-dump","image-integrity-check","application-lifecycle"]
  },
  "memory-load-and-dump": {
    s: "Direct commands to write bytes to an address in onboard memory and to read a region back to ground, the most powerful and most dangerous tools for debugging in flight.",
    d: "A load command writes a block to a given address, usually with a checksum, and a dump command downlinks a region for ground to compare with the expected contents. Dumps are how analysts find corrupted data and verify patches. Access can be limited to certain regions and requires a higher authority. It is hard because one wrong address overwrites running code or data, and because dumps of large areas take many passes.",
    k: ["Unrestricted addresses versus a table of allowed regions: unrestricted access is the most flexible during a crisis, but restricted access blocks a mistyped address from destroying the system.", "Dump in raw form versus with checksums per block: checksums help ground find corrupted blocks quickly, but cost bandwidth."],
    p: ["A load to the wrong processor in a redundant pair changes the spare rather than the prime.", "A dump taken while memory is changing gives an inconsistent picture that analysts misread."],
    v: "Load a known pattern to a test region, dump it, and confirm it matches, then send a load to a protected address and confirm it is refused with no change to memory.",
    dep: ["command-validation","data-integrity-checks"]
  },
  "table-and-parameter-update": {
    s: "The controlled process of replacing a table or parameter set in flight, validating the new values before they are applied and saving them for the next reset.",
    d: "Ground uploads a new table to a staging buffer, then commands a validate step that runs the owner's checks, and then an activate step that swaps it in at a safe moment. The result is saved to non-volatile memory, optionally with the old copy kept. It is the safest and most frequent update type. It is hard because validation must catch values that are legal alone but bad together, and because activation timing must not disturb a running control loop.",
    k: ["Validate-then-activate versus apply directly: two steps catch bad values before they act, but take more commands and passes.", "Keep the previous table versus overwrite: keeping gives a quick revert, while overwriting saves memory and simplifies bookkeeping."],
    p: ["A new gain table activated mid-cycle gives one control step with half-old and half-new values.", "A table saved to memory but never validated on reboot is loaded unchecked."],
    v: "Upload a table with one invalid value, confirm validation refuses it and the active table is unchanged, then upload a good table and confirm activation, persistence across reset and the matching version in telemetry.",
    dep: ["table-services","parameter-database","command-validation"]
  },
  "golden-image-rollback": {
    s: "A protected original software image and the logic to return to it, so a failed update or a repeated crash can always be undone without ground intervention.",
    d: "The golden image is stored in memory that cannot be written in flight, and the boot logic falls back to it after a set number of failed boots or watchdog resets of a new image. It is deliberately small and simple, enough to keep the vehicle alive and receive commands. It is hard because it must be right at launch with no chance of repair, and because falling back loses every improvement made since.",
    k: ["Minimal golden image versus a full-function copy: minimal code is easier to verify and smaller, but a vehicle running it cannot do the mission.", "Automatic rollback versus ground-controlled: automatic rollback recovers without contact, but may mask a fault that only shows up in a particular mode."],
    p: ["A rollback counter that resets on each boot never reaches its limit during a reboot loop.", "Golden image behavior drifts from the hardware, because hardware settings were changed by later updates."],
    v: "Load an image that crashes on startup, and confirm that after the configured number of failed boots the loader runs the golden image, sets the status flag, and ground can send commands.",
    dep: ["dual-image-storage","boot-rom-and-loader","watchdog-timers"]
  },
});
