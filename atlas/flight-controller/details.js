// Details for the flight controller plate, part 1: operator side, links, flight modes.
ATLAS.details("flight-controller", {
  "ground-control-station": {
    s: "The operator's program for monitoring the aircraft live, sending commands, changing modes and uploading missions over the telemetry link.",
    d: "It speaks the telemetry protocol, decodes streams of state messages into instruments, maps and alerts, and sends commands that the aircraft must acknowledge. It keeps its own copy of the parameter list and mission so it can show differences. It is hard because it is the human's only view of a machine moving fast: stale data looks like current data, links drop without warning, and a wrong command sent in the wrong mode can cause a crash.",
    k: ["Show last-known state with explicit age vs hide stale data: operators see how old a reading is; the screen is busier and misread timestamps still cause mistakes.", "Operator commands as requests that must be acknowledged vs fire-and-forget: confirmed intent is safer; every command costs a round trip on a slow link."],
    p: ["A frozen display after the link drops looks identical to a hovering aircraft, so the operator keeps believing the vehicle is fine.", "Two operators connected at once issue conflicting commands with no rule for who has authority."],
    v: "Pull the telemetry antenna during a flight and confirm the station marks every value stale within a few seconds, raises a link-lost alert, and shows the correct mode when the link returns.",
    dep: ["telemetry-protocol", "command-handling"]
  },
  "mission-planning-interface": {
    s: "The part of the ground side where waypoints, altitudes, speeds and actions are drawn on a map, checked, and uploaded to the aircraft as a mission.",
    d: "The planner builds an ordered list of mission items, often over terrain and airspace data, estimates flight time and battery use, and warns about geometry that breaks limits such as turn radius or fence boundaries. Upload is a handshake: items are sent one at a time with acknowledgment, then read back to confirm. The hard part is that the planner and the aircraft must agree exactly on item meanings, coordinate frames and units.",
    k: ["Plan on the ground station and upload vs plan on the aircraft: simple aircraft software and rich tools; the aircraft cannot adapt the plan without a link.", "Altitude relative to takeoff vs altitude above sea level or terrain: relative is easy to reason about; terrain-following needs map data and a trusted position."],
    p: ["A plan drawn with one altitude reference and flown with another puts the aircraft into the ground on the first leg.", "A partial upload after a link drop leaves an old mission mixed with a new one."],
    v: "Upload a mission, download it back, and compare every item byte for byte. Then fly it in simulation and confirm the logged waypoints reached match the plan in order, with the planned altitudes.",
    dep: ["telemetry-protocol", "mission-storage"]
  },
  "tuning-interface": {
    s: "A tool for reading and changing parameters and watching control responses live, so gains and limits can be adjusted for a specific airframe.",
    d: "It lists every parameter with its metadata, lets the operator change values in flight, and plots signals such as setpoint versus measured rate from high-rate telemetry or live log streams. Changes go over the command link and are acknowledged by the parameter store. It is hard because a bad value can destabilize the aircraft within a second, and because the tool must not let a partial or out-of-range change through.",
    k: ["Apply parameter changes immediately vs on explicit commit: immediate suits tuning; a commit step prevents a half-edited set from flying at the cost of slower iteration.", "Expose all parameters vs a curated basic set: curated lowers the chance of harm; advanced users are blocked from real tuning options."],
    p: ["Raising a gain in flight with no way to revert quickly can turn a mild oscillation into loss of control.", "Parameters edited on the ground station but never read back leave the display disagreeing with the aircraft."],
    v: "Change a gain in flight, confirm the aircraft acknowledges the new value, and check the plotted response changes accordingly. Then read the value back after a reboot and verify it persisted or did not, as intended.",
    dep: ["parameter-store", "command-handling"]
  },
  "log-analysis-tools": {
    s: "Programs that open flight logs after the fact to plot signals, replay flights, detect known problems and compare runs.",
    d: "They parse the log format, align streams recorded at different rates onto a common time axis, and offer plots, maps and flight-mode timelines. Many include automatic checks: vibration level, estimator innovations, battery sag, saturation, and loop timing overruns. They are hard because logs are the evidence for every escaped bug, so format changes across versions must stay readable, and large flights must open quickly.",
    k: ["Self-describing log format vs fixed schema: self-describing logs survive version changes; they are larger and each reader must handle unknown fields.", "Automatic problem detection vs raw plots: detection catches common issues for newcomers; false alarms and misses teach people to ignore it."],
    p: ["A log missing the one stream needed to explain a crash, because logging rate or topic selection was set too low.", "Time alignment errors between streams make cause and effect appear reversed."],
    v: "Open a log from a known flight with a deliberate motor imbalance and confirm the tool shows elevated vibration in the correct window and the matching estimator warning at the same timestamp.",
    dep: ["flight-logger", "log-storage"]
  },
  "pilot-radio-link": {
    s: "The low-latency radio path from a handheld transmitter to the aircraft, carrying stick positions and switch states for manual or mode-selecting control.",
    d: "A transmitter encodes channel values and sends them in short frames many times a second, often with frequency hopping or spread spectrum for interference resistance. The receiver outputs them through a serial or pulse interface. Latency, update rate and range matter more than bandwidth. It is hard because the link is the pilot's authority: when it fails the aircraft must know within a fraction of a second, and a stuck or noisy channel must not become a command.",
    k: ["Short frames at a high rate vs larger frames at a lower rate: lower latency and faster loss detection; less room for extra channels or telemetry on the same link.", "Dedicated control link vs control over a general data link: dedicated is predictable; one link is lighter but shares failure with everything else."],
    p: ["A receiver that holds the last stick values after signal loss keeps the aircraft flying on stale input.", "A shared band with other transmitters degrades the link with no warning until range collapses."],
    v: "Power off the transmitter while the aircraft is on a bench with motors disabled, and confirm the receiver link-quality value and the controller's link-lost flag change within the expected timeout.",
    dep: ["receiver-protocol-decoding", "serial-can-drivers"]
  },
  "receiver-protocol-decoding": {
    s: "Parses the receiver's serial or pulse output into channel values with validity and link-quality flags, then maps them to roll, pitch, yaw, throttle and switches.",
    d: "Receivers use several framing formats, differing in baud rate, inversion, channel count and checksum. The decoder syncs to frame boundaries, verifies integrity, scales raw values to a normalized range, and reports whether the frame was good, a failsafe frame, or missing. A mapping step applies calibrated endpoints, deadbands and curves. It is hard because malformed frames are common in a noisy environment and decoding must be cheap and bounded in time.",
    k: ["Auto-detect the receiver protocol vs configure it explicitly: auto-detect eases setup; detection can lock onto the wrong format and wastes time at boot.", "Normalize channels in the driver vs in the control code: drivers hide formats; scaling in two places hides calibration mistakes."],
    p: ["A decoder that accepts frames without checking the checksum passes corrupted stick values straight into control.", "Receiver failsafe frames treated as valid input make the aircraft obey the receiver's preset values."],
    v: "Feed recorded frames, including corrupted and failsafe ones, to the decoder and confirm valid frames yield the expected channel values while bad frames are rejected and flagged as lost.",
    dep: ["serial-can-drivers", "pilot-radio-link"]
  },
  "telemetry-protocol": {
    s: "The message format that carries state, commands, parameters and missions between the aircraft and ground side, with identifiers, lengths and checksums.",
    d: "Messages are small binary frames with a header, message type, source system, sequence number, payload and checksum. Types cover attitude, position, battery, mode, parameters, mission items and commands. The aircraft publishes streams at set rates and answers requests. It is hard because both ends evolve independently: a new field must not break old receivers, and the format must survive bit errors, dropped packets and reordering on slow radio links.",
    k: ["Fixed-layout binary messages vs self-describing encoding: compact, cheap to parse on a small processor; adding fields needs versioning and careful compatibility rules.", "Per-message checksums plus sequence numbers vs relying on the radio's error detection: end-to-end detection catches loss anywhere; costs bytes on every message."],
    p: ["Different versions of the message definitions on each end decode a field with the wrong size and corrupt every value after it.", "Without sequence numbers, a duplicated or replayed command is indistinguishable from a new one."],
    v: "Send a stream with random bit errors and dropped packets and confirm the receiver reports the right loss counts, discards every corrupted message, and never delivers a corrupted value to the application.",
    dep: ["telemetry-radio"]
  },
  "telemetry-radio": {
    s: "The radio modem pair that carries telemetry between aircraft and ground station, trading range, data rate and power on a shared band.",
    d: "A serial-attached modem on the aircraft talks to a matching one at the ground station, handling modulation, forward error correction, hopping and retransmission. Data rate is low, often tens of kilobytes per second at best, and falls with distance. Cellular or satellite links replace it for long range. It is hard because every extra stream consumes the same limited capacity, and latency or loss varies with antenna orientation, range and interference.",
    k: ["Longer range at a lower data rate vs higher rate at shorter range: range suits survey and cargo missions; rich video or high-rate logs need the opposite.", "Cellular data link vs dedicated radio: cellular gives range with existing infrastructure; coverage gaps, variable latency and a third-party network are involved."],
    p: ["Raising stream rates until the link saturates delays the very command messages the operator needs.", "Antennas mounted near carbon fiber or the power wiring lose most of their range with no error shown."],
    v: "Fly a range test while logging link quality and message loss against distance, and confirm that at the planned maximum range loss stays within the budget and command acknowledgments still arrive.",
    dep: ["serial-can-drivers"]
  },
  "stream-scheduling": {
    s: "Decides which telemetry messages go out at which rates, and drops or slows less important ones when the link cannot carry everything.",
    d: "Each message type has a requested rate, set by default, by the ground station or by the link's measured capacity. A scheduler allocates the link's byte budget, favors command acknowledgments and critical status, and throttles bulk transfers such as parameter lists and mission downloads. It is hard because it must be fair and bounded: a large parameter download should not starve attitude updates, and the sender must never block the flight loops while waiting for the radio.",
    k: ["Fixed stream rates vs adaptive rates driven by link quality: fixed is predictable; adaptive protects the link when it is weak but changes what the operator sees without saying so.", "Priority queues vs round-robin across message types: priorities protect safety traffic; low-priority messages can wait indefinitely."],
    p: ["Sending a full parameter list at high rate saturates the link and delays the failsafe warning.", "Output buffers that grow without a bound consume memory when the radio stalls."],
    v: "Request a full parameter download over a throttled link while streaming attitude, and confirm attitude stays within its target rate and the heartbeat is never delayed beyond its period.",
    dep: ["telemetry-protocol", "load-monitoring"]
  },
  "command-handling": {
    s: "Receives commands from the ground side, validates them against the current state, executes or rejects them, and returns an acknowledgment with a result code.",
    d: "Commands include arm, change mode, take off, return, set speed and trigger payload actions. The handler checks authority, source, current mode and safety conditions, hands the request to the owning component, and reports accepted, denied, failed or in progress. Long commands report progress. It is hard because commands arrive over unreliable links: a retry must not repeat the action, and a command accepted in the wrong state can be dangerous.",
    k: ["Idempotent commands with sequence checks vs simple repeat-until-acknowledged: safe retries; extra state to track per command source.", "Reject commands that conflict with the current mode vs execute and switch modes automatically: rejection is predictable; the operator must know the right order of steps."],
    p: ["A retried disarm or takeoff command executed twice because the first acknowledgment was lost.", "Commands from any connected source accepted without checking who has authority."],
    v: "Send a takeoff command, drop the acknowledgment on the link, let the sender retry, and confirm the aircraft takes off exactly once and the second request is answered without a repeated action.",
    dep: ["telemetry-protocol", "mode-state-machine", "arming-logic"]
  },
  "link-supervision": {
    s: "Tracks whether each link is alive and healthy using heartbeats and timeouts, and reports loss and recovery to the failsafe logic.",
    d: "Each peer sends a heartbeat at a known rate. A supervisor counts time since the last valid message per link, tracks signal strength and error rates, and raises link-lost after a configurable timeout and link-regained after a stable period with hysteresis. The pilot link usually has a short timeout, the data link a longer one. It is hard because timeouts trade false alarms against slow reaction, and flapping links can trigger repeated mode changes.",
    k: ["Short timeouts vs long timeouts: short reacts quickly to real loss; brief fades trigger needless failsafes, long ones let the aircraft fly blind for seconds.", "Timeout on any message vs only heartbeat messages: any message keeps the link counted alive during busy periods; a stuck sender that only repeats data can mask a lost peer."],
    p: ["A link that flaps in and out triggers return-to-launch, cancel and return again in quick succession.", "The supervisor measures time using a clock that drifts or stalls, so timeouts fire late."],
    v: "Block the data link for a period shorter than the timeout and confirm no failsafe, then longer than the timeout and confirm link-lost is raised at the configured time and cleared only after the regain period.",
    dep: ["telemetry-protocol", "pilot-radio-link", "failsafe-manager"]
  },
  "link-security": {
    s: "Authenticates and optionally encrypts commands and telemetry so that only authorized operators can control or observe the aircraft.",
    d: "Messages carry a signature computed from a shared secret, a timestamp or counter and the content, and the aircraft rejects those that fail verification or replay an old counter. Keys are provisioned before flight and rotated on a schedule. Encryption protects payload data and positions. It is hard because the aircraft has little compute and memory, keys must be handled safely on the ground, and a lost key must not leave an aircraft unreachable.",
    k: ["Message signing with a shared key vs public-key authentication: shared keys are cheap on a small processor; public keys allow per-operator identity but cost more compute and storage.", "Fail closed on a bad signature vs accept unsigned during setup: strict is secure; a misconfigured key can lock a legitimate operator out in the field."],
    p: ["Replay of a captured command is accepted because the counter check is missing or resets on reboot.", "A default or shared key left in every unit makes the protection nominal."],
    v: "Capture a valid command and replay it after a reboot; confirm it is rejected. Then send a command with a tampered field and confirm it is rejected and counted in a security statistic.",
    dep: ["telemetry-protocol", "parameter-store"]
  },
  "mode-state-machine": {
    s: "Holds the active flight mode and enforces which transitions are allowed, selecting which controllers get which setpoints.",
    d: "Modes are nodes, requests from the pilot switch, commands, mission progress and failsafes are the edges. On each request the machine checks prerequisites such as a valid position estimate, then switches, running exit and entry actions. Failsafes can force transitions that pilot input cannot override. It is hard because the combinations multiply, and because a rejected or delayed change must produce a visible, unambiguous outcome for the pilot.",
    k: ["Explicit transition table vs mode code that decides for itself: a table is auditable and testable; scattered checks inside modes are faster to write and miss paths.", "Reject mode change when prerequisites are missing vs fall back to a lower mode: rejection is predictable; fallback can switch to something the pilot did not choose."],
    p: ["A transition from automatic back to manual with stale stick positions throws the aircraft to a sudden attitude.", "Failsafes and pilot input race to change the mode, and the last writer wins nondeterministically."],
    v: "Drive the machine through every allowed and disallowed transition in simulation and confirm each outcome matches the table, and that a forced failsafe transition cannot be overridden by switch input.",
    dep: ["estimator-health", "failsafe-manager", "message-bus"]
  },
  "arming-logic": {
    s: "The gate between a powered, idle aircraft and one allowed to spin motors, requiring checks to pass and an explicit, deliberate action.",
    d: "Arming requires that pre-flight checks pass, throttle is low, the mode permits it and the request comes from an authorized source. Once armed, motors respond to commands; disarming cuts them and is allowed in flight only under defined conditions, such as a detected landing. State is published to every component. It is hard because the logic must prevent accidental starts, which hurt people, while still allowing an emergency disarm.",
    k: ["Require a deliberate stick gesture or button hold vs a single switch: gestures resist accidental arming; they are slower and harder for novices.", "Allow in-flight disarm vs forbid it: allowing it lets an operator stop a runaway aircraft; a bumped switch can drop the vehicle from the sky."],
    p: ["Arming allowed while a check is still failing because the checks ran before a sensor warmed up.", "Auto-disarm after landing triggers while still airborne in a hover with low throttle."],
    v: "With the aircraft on the bench, attempt to arm with each pre-flight check failing in turn, and confirm arming is refused with the matching reason each time and motors never spin.",
    dep: ["preflight-checks", "mode-state-machine"]
  },
  "stabilized-modes": {
    s: "Modes where the pilot commands body attitude or rate and the controller keeps the aircraft steady, from raw acro to self-leveling angle control.",
    d: "In rate mode, stick position becomes a desired angular rate; in angle mode, it becomes a desired tilt, with the controller holding level when the sticks are centered. Throttle goes to collective thrust. These modes need only the inertial sensors, not a position estimate, so they are the fallback that still works with no satellite fix. The challenge is feel: stick curves, expo and limits determine how the aircraft responds to a human.",
    k: ["Rate mode vs self-leveling angle mode: rate mode gives full authority for skilled pilots; angle mode is forgiving but limits maneuvers and needs a good gravity reference.", "Linear stick mapping vs exponential curves: curves give fine control near center; they change the effective gain and make tuning harder to compare."],
    p: ["Switching from angle to rate mode in an unusual attitude leaves a pilot without the self-leveling they expected.", "Stick deadbands set too wide cause a slow constant drift the pilot has to hold against."],
    v: "In simulation, center the sticks from a 30 degree tilt in angle mode and confirm the aircraft levels without overshoot beyond the specified margin. In rate mode, confirm tilt stays constant.",
    dep: ["attitude-controller", "rate-controller", "setpoint-shaping"]
  },
  "altitude-position-hold": {
    s: "Modes where the aircraft holds height, and optionally horizontal position, when the pilot releases the sticks, using the estimator and satellite or visual positioning.",
    d: "Altitude hold sends a climb rate command from the stick to the vertical controller and holds the current height when it is zero. Position hold adds horizontal velocity commands and holds the last position. These modes depend on a trusted estimate, so they refuse to engage or fall back when the estimate degrades. The difficulty is smooth handoff at the edges: entering the mode with residual motion, and exiting it when positioning drops out.",
    k: ["Hold the position at the moment the sticks center vs brake to a stop first: immediate hold is simple; braking first avoids a snap-back from residual speed.", "Fall back to altitude-only vs to fully manual on position loss: a partial fallback keeps assistance; the pilot may not realize which assistance has been lost."],
    p: ["Position hold in a strong wind with a degraded fix drifts slowly while the display says holding.", "A barometer reading disturbed by prop wash makes altitude hold bob up and down."],
    v: "Fly in position hold in steady wind and confirm the logged horizontal position stays within the specified radius for a minute. Then disable satellite input and confirm the declared fallback occurs.",
    dep: ["position-controller", "thrust-altitude-control", "estimator-health"]
  },
  "automatic-takeoff-landing": {
    s: "Automates leaving the ground and returning to it: climb to a set height, descend at a controlled rate, detect touchdown and stop the motors.",
    d: "Takeoff spools motors, climbs along a profile and hands over to the next mode. Landing descends quickly at height, slows near the ground using range or barometer data, then detects contact from thrust, vertical acceleration and altitude change. Fixed-wing versions add runway alignment, flare and rotation. It is hard because ground effect disturbs sensors and estimates exactly when the margins are smallest, and because contact detection must neither miss nor trigger early.",
    k: ["Detect touchdown from thrust and acceleration vs from a switch or range sensor: inertial detection needs no extra hardware; ground effect and turbulence fool it.", "Land at the current position vs at the last takeoff point: current is always safe from a navigation view; the place may be unsuitable."],
    p: ["Disarming on a false touchdown detection a meter above the ground, ending in a drop.", "Landing in tall grass or on a slope, where contact detection never triggers and the aircraft tips."],
    v: "In flight tests, land repeatedly on flat, sloped and soft surfaces and confirm motors stop only after contact, with the logged descent rate under the limit at ground contact.",
    dep: ["thrust-altitude-control", "rangefinder", "mode-state-machine"]
  },
  "return-to-launch": {
    s: "A mode that climbs to a safe height, flies back to the recorded home position and lands, used on command or by a failsafe.",
    d: "Home is recorded at arming from the position estimate. Return climbs to a configured altitude to clear obstacles, flies a straight path home at a set speed, and then lands or hovers. Fixed-wing versions loiter. It is hard because it assumes a valid position estimate, enough battery for the trip, and a clear route; none is guaranteed when it is needed most, which is when something already went wrong.",
    k: ["Climb first then return vs return at the current altitude: climbing clears obstacles but costs energy; staying low is faster and may hit things.", "Land at home vs hover above it: landing ends the incident; hovering lets the pilot retake control when the link returns but burns battery."],
    p: ["A return altitude lower than a nearby tree line or building, so the path flies through it.", "Home recorded at a poor fix, so the aircraft returns to a point far from the real launch site."],
    v: "Trigger return from several distances and headings in a field test and confirm the logged path reaches the return altitude first, ends within the specified radius of the real launch point and lands.",
    dep: ["path-following-guidance", "geofence-enforcement", "battery-failsafe", "mode-state-machine"]
  }
});
