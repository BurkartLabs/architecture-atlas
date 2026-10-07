// Details for the flight controller plate, part 3: control loops, mixing and actuation.
ATLAS.details("flight-controller", {
  "position-controller": {
    s: "The outermost loop: compares desired and estimated position and produces a velocity target that moves the aircraft toward the goal.",
    d: "A proportional controller on position error, with limits on horizontal and vertical speed, outputs a velocity setpoint, often with feedforward from a planned trajectory. It runs at tens of hertz because the aircraft's position changes slowly. It reads the position estimate and writes to the velocity controller. It is hard because the loop must be much slower than the loops inside it to stay stable, and because estimate delay and noise limit how aggressive it can be.",
    k: ["Proportional-only position loop vs adding an integral term: proportional with a velocity inner loop is stable and simple; steady wind offsets need the inner loop's integrator.", "Square-root shaping of speed near the target vs a linear gain: shaping gives smooth braking at set deceleration; a linear gain is simpler but overshoots at high speed."],
    p: ["A position gain high relative to the inner loop's bandwidth causes a slow oscillation around the target.", "Reacting to a position jump from a satellite fix correction by commanding a sudden large velocity."],
    v: "Command a 10 meter step in simulation and in flight, and confirm the logged response reaches the target with overshoot under the stated percentage and no sustained oscillation.",
    dep: ["velocity-controller", "position-velocity-fusion", "setpoint-shaping"]
  },
  "velocity-controller": {
    s: "Turns a velocity target into a desired acceleration, then into a tilt attitude and thrust, with an integrator that cancels wind.",
    d: "Velocity error feeds a proportional-integral-derivative law whose output is acceleration. For a multirotor, horizontal acceleration becomes a tilt of the thrust vector and vertical acceleration becomes collective thrust, compensated for hover thrust. For fixed-wing the equivalent works through airspeed and bank. It is hard because the integrator must remove steady wind or mass error without winding up during saturation, and the conversion to tilt depends on a good estimate of hover thrust.",
    k: ["Integrator with anti-windup limits vs no integrator: the integrator removes steady error; without limits it overshoots after the aircraft is held or saturated.", "Derivative term on measurement vs on error: measurement avoids kicks on setpoint steps; it makes the response slightly less sharp."],
    p: ["Integrator windup during a hold on the ground, so the first moments after takeoff tilt hard in one direction.", "A wrong hover thrust estimate after a payload change, making climb and descent asymmetric."],
    v: "Fly in a steady wind and confirm the logged velocity error settles to near zero within the time limit, and that the integrator states stay within their clamps during a ground hold.",
    dep: ["attitude-controller", "thrust-altitude-control", "setpoint-shaping", "kalman-estimator"]
  },
  "attitude-controller": {
    s: "Compares desired and estimated orientation and produces the body rates needed to correct the error, usually with a proportional gain on a rotation error.",
    d: "The orientation is represented in a form that avoids singularities, such as a unit quaternion. The error rotation is computed, split into tilt and heading parts, and multiplied by gains, with heading authority often lower than tilt. The output is a rate setpoint for the rate controller. It runs at a few hundred hertz. It is hard because wraparound and large errors need care, and because tilt must be prioritized over heading when authority is limited.",
    k: ["Quaternion error vs Euler angle error: quaternions avoid gimbal lock and handle large angles; Euler angles are easier to tune and to read in logs.", "Tilt priority over yaw when saturated vs equal priority: tilt priority keeps the aircraft upright; heading control is sacrificed first."],
    p: ["Using a quaternion and its negative interchangeably makes the aircraft take the long way around to a target.", "A heading limit left too high for a weak yaw actuator drives the motors to saturation."],
    v: "Command a 90 degree step in roll and yaw in simulation and confirm settling time and overshoot are within the specification, with the rate setpoint staying under the limit throughout.",
    dep: ["rate-controller", "attitude-estimator", "setpoint-shaping"]
  },
  "rate-controller": {
    s: "The fastest and most important loop: drives measured body angular rates to the commanded rates, producing torque requests for the mixer.",
    d: "A proportional-integral-derivative controller per axis compares the gyroscope rate with the setpoint. The derivative acts on filtered measurement, with feedforward from the setpoint. It runs at hundreds to thousands of hertz, synchronized with the gyroscope sample. Its output is a normalized torque request. It is hard because it sets the aircraft's feel and stability, it amplifies noise and vibration, and every microsecond of delay in the filters and the loop itself erodes the stability margin.",
    k: ["Running at the gyroscope rate vs a fixed slower rate: matching the sensor reduces delay and aliasing; it needs tight timing and more compute.", "Large derivative gain with heavy filtering vs light filtering: strong damping and crisp response; noise reaches the motors, heating them and costing noise margin."],
    p: ["Gyroscope noise amplified by the derivative term heats the motors and shows as audible buzz.", "A late loop iteration after a long task, so one cycle of stale output kicks the aircraft."],
    v: "In a hover, apply a small step to each axis and confirm logged rate tracking: rise time and overshoot match the target and the loop never misses a deadline across a long flight.",
    dep: ["control-allocation", "imu", "control-filters", "scheduler"]
  },
  "thrust-altitude-control": {
    s: "Controls vertical motion: turns a height or climb-rate target into collective thrust, compensating for tilt, battery voltage and changing mass.",
    d: "A height loop produces a climb rate target; a climb rate loop produces acceleration and then a thrust command. The thrust is divided by the cosine of tilt so that a tilted aircraft keeps its vertical force, and scaled for battery sag. A hover thrust estimate is learned in flight. It is hard because vertical control relies on a noisy barometer or rangefinder, and because thrust to acceleration depends on mass and battery state.",
    k: ["Learn hover thrust online vs a fixed configured value: learning adapts to payload and battery; a bad estimate during aggressive flight skews climb and descent.", "Barometer-led height vs fused height with accelerometer: accelerometer fusion is quicker and smoother; it inherits any accelerometer bias."],
    p: ["Barometer pressure shifts from wind or prop wash move the aircraft up and down while holding altitude.", "Battery sag late in flight lowers available thrust so the aircraft cannot hold height in a climb."],
    v: "Hold altitude through a battery discharge and a payload drop in flight, and confirm logged height error stays within the stated band while the learned hover thrust tracks the change.",
    dep: ["velocity-controller", "position-velocity-fusion", "barometer", "power-sensing"]
  },
  "total-energy-control": {
    s: "For fixed-wing aircraft, controls speed and height together by managing total energy with throttle and the distribution of energy with pitch.",
    d: "Throttle sets the total of kinetic and potential energy; elevator trades one for the other. The controller computes desired energy rate and balance from airspeed and height targets, and outputs throttle and pitch commands. It couples what a pilot treats as separate controls and prevents the classic mistake of pulling up to climb and stalling. It is hard because it needs reliable airspeed, and because limits on throttle or pitch break the coupling.",
    k: ["Coupled energy control vs separate height and speed loops: coupled behaves well when throttle saturates; separate loops are simpler but fight each other.", "Airspeed from a measuring sensor vs an estimate from groundspeed and wind: a sensor is direct; an estimate survives sensor loss but is less accurate."],
    p: ["A blocked or iced airspeed sensor makes the controller think the aircraft is fast and pitch up into a stall.", "No underspeed protection, so a steep climb command bleeds speed until the stall."],
    v: "Command a climb, a descent and a level speed change in simulation and in flight, and confirm airspeed stays within the safe band while height reaches the target without pitch limits being violated.",
    dep: ["airspeed-sensor", "attitude-controller", "position-velocity-fusion"]
  },
  "setpoint-shaping": {
    s: "Limits and smooths setpoints between loops so they respect speed, acceleration, tilt and rate limits and never jump discontinuously.",
    d: "Between each pair of loops a stage clamps magnitudes, limits the slew rate, and may apply a jerk-limited profile. It also handles reference frame rotation between the pilot's input and the controller's frame. These limits come from parameters and from live conditions such as battery level. It is hard because limits interact: capping tilt caps acceleration, which caps horizontal speed in wind, and a limit set in the wrong place hides the reason the aircraft feels sluggish.",
    k: ["Limit at the loop that owns the quantity vs a single global limiter: local limits are easy to reason about; they can be inconsistent across loops.", "Jerk-limited profiles vs plain rate limits: smoother motion and less airframe stress; slightly more delay and more computation."],
    p: ["Stacked limits in three loops, so the aircraft reaches only a fraction of its configured speed.", "Smoothing delay inside the control loop adds phase lag and reduces stability."],
    v: "Command a large step on each loop input and confirm the logged output never exceeds the configured limits and its derivative stays under the slew limit, with no discontinuity.",
    dep: ["parameter-store"]
  },
  "control-filters": {
    s: "Filters applied to sensor signals and controller terms to remove noise and vibration while adding as little delay as possible.",
    d: "Low-pass filters smooth gyroscope and derivative signals; notch filters remove narrow vibration peaks at motor and propeller frequencies, which can track motor speed in real time; others remove steady offsets. Each filter adds phase delay, which reduces the stability margin of the loops that use it. It is hard because noise and delay trade directly: more filtering quiets the motors and slows the response, so cutoffs are set against measured spectra.",
    k: ["Fixed notch filters vs filters that track motor speed: fixed ones are cheap and work for a known vibration source; tracking handles changing speeds but needs motor speed data.", "Filter before the derivative vs on the output: filtering the input lowers noise without delaying the proportional action; output filtering delays everything."],
    p: ["Notch frequencies set for one propeller left in place after a prop change, so vibration passes through.", "Stacked filters with long total delay, which makes the rate loop oscillate at high throttle."],
    v: "Record gyroscope spectra in a hover with the filters off and on, and confirm the motor and propeller peaks drop by the target amount while step response delay stays under the stated limit.",
    dep: ["imu", "vibration-filtering"]
  },
  "control-allocation": {
    s: "Converts requested torques and thrust into individual actuator commands, using the airframe's geometry so one controller serves many layouts.",
    d: "A matrix, or a more general optimizer, maps three torques and total thrust to each motor or surface. For a multirotor it is the effectiveness of each rotor on each axis, derived from position and spin direction. For aircraft with surfaces it includes control surface effectiveness. Outputs are normalized and sent on. It is hard because actuators saturate, effectiveness changes in flight, and failures change the matrix.",
    k: ["Fixed mixing matrix vs online optimization: a matrix is cheap, exact and predictable; an optimizer handles failures and redundant actuators but costs compute and is harder to verify.", "Priority to torque over thrust when saturated vs equal scaling: protects attitude control; sacrifices climb performance."],
    p: ["A motor numbering or spin direction mismatch in the configuration, so the aircraft flips violently at the first spin-up.", "Mixing that clips instead of redistributing, so one saturated motor loses control of an axis."],
    v: "Spin up with props removed and command each axis in turn, and confirm the measured output change on each motor has the correct sign and ratio. In flight, confirm no unexpected cross-axis coupling in logged rates.",
    dep: ["airframe-geometry", "saturation-handling", "thrust-linearization"]
  },
  "airframe-geometry": {
    s: "The configuration that describes where each actuator is, which way it spins or pushes, and how strongly it affects each axis.",
    d: "A geometry description lists rotor positions, spin directions, tilt angles and thrust coefficients, or surfaces and their deflection effects. Standard layouts come as presets, with custom ones supplied by configuration. The allocation matrix is computed from it at startup and when parameters change. It is hard because mistakes cause the most dangerous bugs, a reversed motor or swapped order, and because a generic model must cover tilting rotors and many surfaces.",
    k: ["Computing the matrix from physical geometry vs hand-written tables per airframe: geometry generalizes and is checkable; presets are simpler and well tested for common layouts.", "Nominal effectiveness vs measured per airframe: nominal works out of the box; measuring improves response at the cost of a test procedure."],
    p: ["A mirrored layout or numbering from a ground tool, so the real wiring does not match the configuration.", "A center of mass offset from the geometric center, so a constant torque offset the integrator has to absorb."],
    v: "Before first flight with props off, run a motor test that spins each output individually and confirm the physical motor identified matches the configured position and direction on the diagram.",
    dep: ["parameter-store", "parameter-validation"]
  },
  "saturation-handling": {
    s: "Keeps the controller sane when actuators hit their limits: redistributes demand, stops integrators from winding up and prioritizes stability.",
    d: "When mixed commands exceed what motors can deliver, the controller reduces thrust to preserve the torque ratios, or lowers requested yaw first. A saturation flag is fed back to the rate and velocity integrators so they stop accumulating. At the low end it keeps motors spinning slightly above idle for control authority. It is hard because naive clipping changes the direction of the demanded torque, and every loop must know when the loop below could not follow.",
    k: ["Scale all commands to preserve ratios vs clip each independently: scaling keeps the direction of the correction; clipping is simple and can turn a roll correction into a pitch error.", "Keep a minimum motor speed in flight vs allow motors to stop: a floor keeps authority and response; wasted energy and a hard landing thrust issue."],
    p: ["Integrator windup during long saturation causes a large overshoot once the demand falls back within range.", "A low-throttle command saturating motors at the minimum and losing attitude control in a fast descent."],
    v: "Command a demand that exceeds the motor limits in simulation and confirm the integrator states stop growing, the torque direction is preserved, and the aircraft recovers without overshoot once the demand is released.",
    dep: ["control-allocation", "rate-controller"]
  },
  "thrust-linearization": {
    s: "Compensates for the nonlinear relationship between a motor command and the thrust it makes, and for voltage sag, so the controller's gains stay valid.",
    d: "Thrust is roughly proportional to the square of rotor speed, and speed depends on the command and battery voltage. A mapping curve, with a configurable expo, makes the thrust response linear in the command, and a voltage scale adjusts it as the battery drops. Without it, effective gain varies with throttle and charge. It is hard because the true curve depends on the propeller and motor, and has to be identified from thrust stand or flight data.",
    k: ["Voltage compensation on every command vs fixed gains: compensation keeps feel the same through the flight; it needs an accurate voltage measure that is filtered against sag.", "A single expo parameter vs a measured lookup table: one parameter is easy to set; a table fits a particular propeller well but needs a test rig."],
    p: ["No compensation, so the aircraft handles crisply on a full battery and sluggishly on a low one.", "Compensation using noisy voltage readings that modulates thrust and feeds back into oscillations."],
    v: "Fly the same maneuver at the start and the end of a battery with compensation on, and confirm rate response and hover throttle changes stay within the stated tolerance.",
    dep: ["power-sensing", "control-allocation"]
  },
  "motor-output-protocols": {
    s: "The signaling format the controller uses to command motor drivers: analog-like pulse widths or fast digital protocols with optional telemetry back.",
    d: "Older pulse formats update at a few hundred hertz and need calibration of endpoints. Digital protocols send a value as a packet with a checksum, at higher rates and with bidirectional variants that report motor speed, temperature and errors. Outputs are generated by timers with direct memory access so the CPU is not involved. It is hard because timing is tight, outputs on a shared timer must share a rate, and a glitch directly moves a motor.",
    k: ["Digital protocol with a checksum vs pulse widths: digital removes calibration and detects corruption; it needs compatible drivers and tighter timing.", "Bidirectional telemetry from the driver vs outputs only: telemetry enables speed-tracking filters and health checks; it takes an extra wire and receive path per motor."],
    p: ["Outputs configured at the wrong protocol rate, so drivers see invalid frames and stay idle or jitter.", "Output groups sharing a timer: changing one's rate silently changes another's."],
    v: "Capture the output with a logic analyzer while commanding steps, and confirm frame timing, values and checksums match the protocol, with no missed frames over a long run.",
    dep: ["timer-pwm-drivers", "interrupts-dma"]
  },
  "surface-servo-outputs": {
    s: "Drives control surfaces and tilting mechanisms through servo signals, with trim, travel limits, reversal and rate limiting per channel.",
    d: "Each output maps a normalized command to a pulse width with configurable minimum, maximum, center and direction, plus trim and optional slew limiting to protect the linkage. Some outputs are mixed, such as elevons or flaperons that combine roll and pitch. Failsafe values are set per channel. It is hard because physical linkages differ per airframe, because a wrong endpoint binds a servo and burns it out, and because failsafe positions must be safe.",
    k: ["Configure travel limits per channel vs rely on mechanical setup alone: limits protect hardware; they must be commissioned for every build.", "Actuator output at a high update rate vs standard rate: faster rates improve response for digital servos; analog servos can overheat."],
    p: ["Reversal set incorrectly, so control is positive feedback and the aircraft diverges on the first command.", "Failsafe positions left at neutral for a surface that needs a defined deflection to glide."],
    v: "With power on and props off, sweep each control and confirm surface travel reaches both limits without binding, in the correct direction, and that failsafe moves each output to its configured safe position.",
    dep: ["control-allocation", "timer-pwm-drivers", "parameter-store"]
  },
  "actuator-failure-handling": {
    s: "Detects a failed motor or stuck surface and reconfigures allocation so the aircraft can still be controlled or landed safely.",
    d: "Detection uses motor telemetry, a mismatch between commanded and measured rate response, or a sudden rise in saturation. Reconfiguration recomputes allocation with the failed actuator removed or reduced, which can sacrifice yaw control on a multirotor with redundant rotors or switch to a spinning flight mode on a quadcopter. It is hard because a false detection removes a healthy motor and the response must be fast.",
    k: ["Reconfigure automatically vs land immediately: reconfiguration can finish the flight; it needs spare actuators and well tested logic and may trade yaw authority.", "Detect from motor telemetry vs from the response mismatch: telemetry is direct but needs hardware; response detection works with any hardware but is slow and ambiguous."],
    p: ["Removing a healthy motor on a false detection causes the crash the logic was meant to prevent.", "A configuration with no redundancy, where the mixer cannot recover and the code path is untested."],
    v: "In simulation and on a test rig, fail each motor in turn at several flight conditions and confirm detection time and the logged outcome: controlled descent or landing within the stated envelope.",
    dep: ["control-allocation", "failsafe-manager", "motor-output-protocols"]
  }
});
