// Details for the flight controller plate, part 2: mission and navigation, failsafes and safety.
ATLAS.details("flight-controller", {
  "mission-executor": {
    s: "Steps through the stored mission, issuing each item as a target and deciding when it is complete and what comes next.",
    d: "The executor reads the current item, converts it into a position or action target, and watches for completion: reaching an acceptance radius, finishing a loiter time, or a payload action acknowledging. It handles jumps, repeats, conditional items and resumption after a pause. It is hard because items have different completion rules, and because interruptions such as a mode change, battery failsafe or link loss must leave the mission in a state that can be resumed or abandoned cleanly.",
    k: ["Acceptance radius by distance vs by passing the waypoint plane: a radius is simple; at speed it either cuts corners or never triggers in wind, while a plane test always fires.", "Resume at the interrupted item vs restart the mission: resuming saves time and energy; the aircraft may be far from the path and need a rejoin leg."],
    p: ["A waypoint never reached because wind pushes the aircraft past without entering the acceptance radius.", "Mission progress held in memory only, so a reboot in flight loses the current item."],
    v: "Run a mission with a pause and resume in the middle, and confirm the log shows each item reached exactly once, the resume continues from the right item, and the final item completes.",
    dep: ["mission-storage", "path-generation", "mode-state-machine"]
  },
  "mission-storage": {
    s: "Stores the mission items in nonvolatile memory with integrity checks so that an uploaded plan survives power loss and can be read back.",
    d: "Items are saved as fixed records with a count, a version and a checksum, written to a reserved flash or card area. Upload writes to a staging area and switches atomically after verification. Items include position, frame, altitude reference, command type and parameters. It is hard because writes can be interrupted by power loss, flash wears with many updates, and old versions of the record layout must still load after a firmware update.",
    k: ["Stage and swap atomically vs overwrite in place: staging never leaves a half-written mission; it doubles the space needed.", "Store in the aircraft vs always reload from the ground station at boot: local storage works offline; a stale mission may be flown by mistake."],
    p: ["An interrupted upload leaves a mix of old and new items that passes a simple count check.", "A format change in a firmware update silently reinterprets stored altitudes in the wrong frame."],
    v: "Interrupt an upload by cutting power at random points many times and confirm every reboot shows either the complete old mission or the complete new one, never a mixture, and the checksum matches.",
    dep: ["storage-drivers", "parameter-store"]
  },
  "path-generation": {
    s: "Turns a sequence of waypoints into a smooth, flyable path or trajectory with speeds and accelerations the aircraft can actually achieve.",
    d: "Straight legs between waypoints are joined with arcs or splines respecting turn radius for fixed-wing and acceleration and jerk limits for multirotors. A trajectory generator adds a time profile, giving position, velocity and acceleration setpoints that the controllers can track. It is hard because the ideal path ignores wind, mass changes and actuator limits, so a path that looks achievable on the plan may not be flyable.",
    k: ["Time-parameterized trajectory vs a geometric path with speed chosen separately: trajectories give feedforward and smoother tracking; they commit to a schedule wind can break.", "Cut corners for speed vs stop at each waypoint: cutting saves energy and time; precise inspection or payload tasks need the stop."],
    p: ["A path demanding more turn rate or acceleration than the airframe has, so tracking error grows each leg.", "Replanning every cycle in a way that produces jumps in the setpoint."],
    v: "Fly a path with sharp turns and compare logged position against the commanded path; confirm the tracking error stays within the stated margin and commanded accelerations stay under the limits.",
    dep: ["position-controller", "setpoint-shaping"]
  },
  "path-following-guidance": {
    s: "Computes the commands that keep the aircraft on the line between waypoints, pulling it back when wind or error pushes it off.",
    d: "Guidance uses cross-track error and along-track progress to pick a target: a lookahead point on the path for fixed-wing, a velocity vector toward the path for multirotors. Output feeds the position controller or, for fixed-wing, bank angle and speed commands. It is hard because gains must handle both a small offset and a large rejoin from far away, and because tight turns in strong wind can make a naive law oscillate or overshoot.",
    k: ["Lookahead point following vs pure cross-track correction: lookahead gives smooth convergence; its distance must scale with speed and path curvature.", "Constant groundspeed vs constant airspeed: groundspeed keeps timing simple; into a headwind a fixed-wing can approach a stall."],
    p: ["A lookahead distance that is too short makes the aircraft weave along the path.", "Following the line from far away with no rejoin geometry, flying an aggressive diagonal across a restricted zone."],
    v: "In simulation with a steady crosswind, fly a straight leg and confirm cross-track error decays smoothly to under the stated limit with no oscillation, and holds there to the end of the leg.",
    dep: ["position-controller", "path-generation", "wind-estimation"]
  },
  "geofence-enforcement": {
    s: "Checks the aircraft's position and altitude against polygons and ceilings, and triggers a defined action before or when it crosses the boundary.",
    d: "Fences are stored shapes: inclusion areas, exclusion areas and a maximum altitude or distance. Each cycle the component tests the position estimate, plus a predicted position a few seconds ahead, and raises a breach with a configured action: warn, brake, return or land. Fence uploads are validated for self-intersection. It is hard because the estimate has error, boundaries move with updated airspace rules, and a reaction that is too abrupt can itself cause harm.",
    k: ["Check the predicted position vs only the current one: prediction acts before breach; it triggers early and can block legitimate flight near edges.", "Hard action at the boundary vs a soft buffer zone that slows the aircraft: hard is simple and strict; soft is gentler but needs the controller to cooperate."],
    p: ["A fence uploaded in the wrong coordinate order is read as an exclusion zone covering the launch point.", "Breach action of return flying through another exclusion zone on the way home."],
    v: "Fly toward a fence boundary in simulation and in a field test and confirm the logged action starts before the position error budget is used up, and the aircraft stops or turns inside the boundary.",
    dep: ["position-velocity-fusion", "failsafe-manager", "mission-storage"]
  },
  "obstacle-avoidance": {
    s: "Uses distance and vision sensors to detect obstacles and modify the path or velocity setpoints so the aircraft passes or stops short of them.",
    d: "A sensor suite builds a local map or a set of range readings. A planner either adjusts the velocity command by pushing away from obstacles, or searches for a collision-free path around them. The result enters between the mission or pilot request and the position controller. It is hard because sensors have limited field of view, thin objects like wires are missed, and the aircraft needs braking distance, so detection range must scale with speed.",
    k: ["Reactive velocity adjustment vs map-based replanning: reactive is cheap and fast; planning handles dead ends but needs memory, compute and a good map.", "Stop short of obstacles vs go around them: stopping is safe and predictable; missions that must pass a gap cannot progress."],
    p: ["Reflective or transparent surfaces and thin wires are invisible to the sensor, giving false clearance.", "The aircraft slows near an obstacle but cannot see behind itself while backing away."],
    v: "Fly toward a known obstacle at increasing speeds and confirm the logged stop distance stays above the minimum clearance at the top rated speed, and that none of the runs touch it.",
    dep: ["rangefinder", "optical-flow", "position-controller", "setpoint-shaping"]
  },
  "offboard-control": {
    s: "Accepts position, velocity or attitude setpoints from an external computer, so outside software can fly the aircraft while the flight controller keeps it safe.",
    d: "A companion computer sends setpoints at a steady rate over a serial or network link. The flight controller accepts them only in an offboard mode, validates frame and limits, and drops back to a safe mode if the stream stops for more than a short timeout. This lets complex navigation or vision run on a more powerful processor. It is hard because the link adds latency, and because the controller must trust the stream without being fooled by a frozen sender.",
    k: ["Require a continuous setpoint stream before entering the mode vs allow entry first: requiring it prevents entering with no commands; makes mode switching a two-step process.", "Offboard commands limited by the flight controller vs full trust: limits keep a faulty companion from flying the aircraft too fast; they restrict legitimate agile flight."],
    p: ["The companion computer hangs but the link stays alive with a repeated last setpoint, so the aircraft flies on stale commands.", "Frame mismatch: the companion sends velocity in the world frame, the controller reads it as body frame."],
    v: "Stop the setpoint stream in offboard mode and confirm the aircraft leaves the mode within the configured timeout into its fallback behavior, and that every accepted setpoint is within configured limits.",
    dep: ["position-controller", "velocity-controller", "serial-can-drivers", "failsafe-manager"]
  },
  "failsafe-manager": {
    s: "Collects fault conditions from every monitor, ranks them, and selects the single response the aircraft should take, with the right precedence.",
    d: "Inputs include link loss, low battery, sensor failure, geofence breach, estimator fault and crash detection. Each has a configured action, such as warn, hold, return, land or terminate. When several conditions hold, the manager picks the most severe action and prevents it from being lowered until the condition clears or the pilot takes over. It is hard because actions interact: returning home needs position, and returning after link loss may be pointless if the battery is too low.",
    k: ["One central manager vs each monitor triggering its own action: central gives a consistent priority order; it concentrates risk and a bug in it disables every response.", "Latch the action until landing vs release when the fault clears: latching avoids flapping; releasing lets a recovered link return control to the pilot."],
    p: ["Two monitors request different actions at once and a later one overwrites the earlier higher-severity action.", "A configured action that needs a sensor which is the very thing that failed, so it can never run."],
    v: "Inject every fault individually and in pairs in simulation, and confirm the logged action matches the documented priority table in each case, with the higher-severity action never replaced by a lower one.",
    dep: ["mode-state-machine", "link-supervision", "battery-failsafe", "sensor-failure-response"]
  },
  "preflight-checks": {
    s: "A set of checks run before arming that confirm sensors, calibration, power, home position and settings are good enough to fly.",
    d: "Checks cover sensor presence and sanity, calibration validity, estimator convergence, satellite fix quality, battery level and voltage, link quality, parameter consistency, and mode availability. Each returns pass or fail with a reason shown to the user. Some are warnings, others block arming. It is hard to choose thresholds: too strict and users disable them, too loose and they miss real faults, and checks must complete quickly or pilots skip waiting.",
    k: ["Block arming on any failed check vs warn and allow override: blocking prevents unsafe flights; overrides serve experts but get used routinely.", "Run checks once at arming vs continuously on the ground: continuous shows live status for the user; once is simple but reports surprises at the last moment."],
    p: ["Checks that pass because a sensor reports a plausible constant value even though it is disconnected.", "A reason code shown only in the log, so the pilot sees only that arming failed."],
    v: "Disconnect each sensor in turn and confirm arming is blocked with a specific reason message each time, and that the aircraft arms normally when every sensor is connected and calibrated.",
    dep: ["sensor-health-monitoring", "estimator-health", "sensor-calibration", "power-sensing"]
  },
  "battery-failsafe": {
    s: "Estimates remaining energy and flight time from voltage, current and a battery model, and triggers warnings and automatic return or landing as it falls.",
    d: "Voltage alone is misleading because it sags under load, so the monitor integrates current to track consumed charge and corrects for load and temperature. Two or three thresholds raise a warning, then a return, then an emergency landing. A smarter version estimates the energy needed to get home and compares it to what remains. It is hard because the battery's real capacity falls with age and cold, so any fixed number will eventually be wrong.",
    k: ["Voltage thresholds vs charge counting with a model: voltage needs no setup; charge counting gives true remaining energy but depends on a correct capacity setting and a full start.", "Compare against estimated return energy vs a fixed reserve: dynamic estimates use the whole battery; they depend on wind and path assumptions that may be wrong."],
    p: ["Voltage that recovers when the throttle drops, clearing a warning just before the next climb collapses it.", "A capacity parameter left at its default for a different battery, so remaining energy is wrong from takeoff."],
    v: "Fly with a deliberately small battery and confirm each threshold triggers at the planned remaining charge, the return starts in time, and the aircraft lands with at least the planned reserve left.",
    dep: ["power-sensing", "failsafe-manager", "return-to-launch"]
  },
  "link-loss-response": {
    s: "Defines what the aircraft does when the pilot link, data link or both are lost: continue the mission, hold, return, land or terminate.",
    d: "The response depends on the mode and the lost link. Lost pilot link during a manual flight usually triggers hold or return; lost data link during an autonomous mission may let the mission continue. A delay allows brief fades to pass, then actions can escalate over time: hold for a period, return, then land. It is hard because there is no single right answer: the safest action depends on terrain, airspace and cause.",
    k: ["Escalating actions after set delays vs one immediate action: escalation tolerates brief fades and gives time to reconnect; the aircraft remains in danger longer.", "Continue the mission on data-link loss vs return: continuing completes autonomous work; returning is more cautious but wastes the flight."],
    p: ["A return triggered by link loss in a valley, where the straight path home flies into rising terrain.", "The response cancels the mission, so regaining the link finds the aircraft in a mode the operator does not expect."],
    v: "Disable each link in turn in simulation and in a field test, and confirm the logged action sequence and its timing match the configured response for the active mode.",
    dep: ["link-supervision", "failsafe-manager", "return-to-launch"]
  },
  "sensor-failure-response": {
    s: "Reacts when a sensor stops working or becomes untrustworthy: switch to a backup, degrade the mode, or land, depending on what was lost.",
    d: "Each sensor type has a ladder of responses. A failed magnetometer may be dropped in favor of gyro-integrated heading; a lost satellite fix removes position-based modes; failed inertial sensors with no backup mean an immediate landing. The component reads health flags from the monitors and the estimator and requests mode or action changes. It is hard to decide what the aircraft can do safely with each degraded combination, and the combinations multiply.",
    k: ["Automatic fallback to a degraded mode vs notify the pilot and wait: automatic acts in time; unexpected mode changes can surprise a pilot mid-maneuver.", "Redundant sensors with voting vs a single sensor with diagnostics: voting survives one failure; costs weight, power and the logic to select between them."],
    p: ["A sensor that fails by returning plausible but wrong values is never flagged, so no fallback occurs.", "The fallback relies on a second sensor that shares the same failure, such as the same power rail."],
    v: "Freeze, offset and disconnect each sensor in simulation, and confirm the aircraft detects the fault within the stated time and ends in the documented degraded mode without losing control.",
    dep: ["sensor-health-monitoring", "sensor-selection", "failsafe-manager"]
  },
  "crash-detection": {
    s: "Recognizes that the aircraft has flipped, crashed or is out of control and disarms the motors to reduce harm and fire risk.",
    d: "Signals include extreme tilt past the recoverable angle while on the ground, sudden deceleration, a failed attitude controller whose output stays saturated while error grows, and loss of expected response. When conditions hold for a short time the motors are stopped and the event is logged. Some designs also detect a flip after takeoff and allow a deliberate turtle mode. It is hard because aggressive aerobatics look like a crash.",
    k: ["Disarm automatically on a detected crash vs only warn: automatic cuts spinning blades near people; a false detection in the air drops the aircraft.", "Time-based persistence of conditions vs immediate trigger: persistence rejects spikes; it lets spinning props run longer after a real crash."],
    p: ["Disarming during a hard maneuver because the attitude exceeded a limit for just long enough.", "A crash on soft ground gives no impact signature and the motors keep spinning on the grass."],
    v: "Flip the aircraft by hand on the bench with motors enabled in a safe fixture, and confirm the motors stop within the stated time. Then fly aggressive maneuvers and confirm no false triggers.",
    dep: ["attitude-controller", "imu", "arming-logic", "saturation-handling"]
  },
  "flight-termination": {
    s: "The last-resort action that stops the aircraft from flying by cutting motors, deploying a parachute or commanding a controlled descent.",
    d: "Termination is triggered by a few severe conditions: loss of control, violation of a hard boundary, or explicit command through an independent path. It sets outputs to a fixed safe state, which for multirotors means motors off and for fixed-wing may mean surfaces to a spiral dive or a parachute release. It is hard because it must work when everything else has failed, so it is usually a separate, tiny piece of logic with its own power or processor.",
    k: ["Independent termination path vs through the main software: independence works after a software failure; it is another piece of hardware and logic to certify and maintain.", "Parachute deployment vs motor cut: a parachute reduces ground impact; it adds weight and a risk of deploying inside the propellers."],
    p: ["A termination that cuts power while the aircraft is over people because the trigger had no check on location.", "The independent path shares a power rail with the main controller and dies with it."],
    v: "On a safe test rig, trigger termination through each path, including with the main processor halted, and confirm outputs reach the safe state within the specified time every time.",
    dep: ["failsafe-manager", "supervisor-watchdog", "motor-output-protocols"]
  },
  "supervisor-watchdog": {
    s: "Detects that the flight software itself has hung or crashed, and resets it quickly or hands control to a minimal safe backup.",
    d: "A hardware watchdog timer resets the processor if software stops refreshing it. A software supervisor checks that each critical task has run recently, that loop times are within bounds, and that data is fresh, and refreshes the hardware timer only when all of these hold. After a reset in flight the controller reboots and resumes control using preserved state. It is hard because a reset in flight must be fast and must not discard what the controller needs to recover.",
    k: ["Refresh the watchdog from a low-priority loop vs from every critical task: low priority detects any starvation; per-task checks locate the fault but are easier to get wrong.", "Reset the processor on a hang vs enter a degraded mode: reset clears most faults; in flight it costs a gap with no control."],
    p: ["A refresh placed in an interrupt handler keeps the timer alive even though the control loop is dead.", "A reset in flight loses the armed state, so the restarted controller disarms and drops the aircraft."],
    v: "Deliberately hang the rate controller task in a bench test and confirm the watchdog resets the processor within the configured period, and that in simulated flight the aircraft recovers control within the budget.",
    dep: ["scheduler", "load-monitoring", "bootloader-update"]
  }
});
