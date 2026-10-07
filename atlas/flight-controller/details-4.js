// Details for the flight controller plate, part 4: state estimation, sensors, calibration.
ATLAS.details("flight-controller", {
  "attitude-estimator": {
    s: "Estimates the aircraft's orientation by integrating gyroscope rates and correcting drift using gravity from the accelerometer and heading from the magnetometer.",
    d: "The gyroscope gives a smooth but drifting rate; the accelerometer gives a noisy but unbiased gravity direction when not accelerating; the magnetometer gives heading. A complementary or similar filter blends them with a gain that trades trust. Output is a quaternion at the control rate. It is hard because during sustained acceleration the accelerometer's gravity reading is wrong, and near magnetic disturbances the heading reference is wrong.",
    k: ["Simple complementary filter vs full Kalman filter: complementary is cheap and robust for attitude alone; a Kalman filter uses uncertainty and sensor bias estimates but costs compute.", "Trust the accelerometer less during acceleration vs a fixed gain: adaptive trust avoids tilt errors in turns; it needs a measure of acceleration that may itself be wrong."],
    p: ["Sustained coordinated turns where the accelerometer reads a false vertical, tilting the horizon estimate.", "Heading corrected by a magnetometer disturbed by motor current, so yaw drifts with throttle."],
    v: "Compare estimated roll and pitch against a precise reference on a rotating test rig and in flight with an independent attitude source, and confirm error stays within the specification through turns and climbs.",
    dep: ["imu", "magnetometer", "delay-compensation"]
  },
  "kalman-estimator": {
    s: "A filter that tracks orientation, velocity, position and sensor biases together, weighting each measurement by its estimated uncertainty.",
    d: "The state is predicted forward each cycle using gyroscope and accelerometer data as inputs, then corrected by measurements from satellite positioning, barometer, magnetometer and others. A covariance matrix tracks uncertainty, and the gain follows from it. Sensor biases are part of the state and are learned in flight. It is hard because it is nonlinear, sensitive to tuning, expensive on small processors, and a bad measurement can poison the whole state.",
    k: ["One large joint filter vs several small decoupled filters: joint filters handle correlations and bias estimation correctly; decoupled ones are cheaper and easier to debug but less accurate.", "Error-state formulation vs full-state: error state avoids singularities and keeps linearization small; it complicates the code."],
    p: ["Noise values copied from another airframe, so the filter trusts a sensor too much or too little.", "Covariance losing positive definiteness through rounding, producing NaN states that spread to every controller."],
    v: "Replay a recorded flight with known ground truth through the filter and confirm estimation error and reported uncertainty are consistent: errors fall inside the reported bounds about as often as expected.",
    dep: ["attitude-estimator", "innovation-gating", "delay-compensation", "imu", "gnss-receiver"]
  },
  "position-velocity-fusion": {
    s: "Combines satellite fixes, barometric height, optical flow and visual or range data with inertial prediction into smooth position and velocity estimates.",
    d: "Each source arrives at a different rate, delay and accuracy. Fusion applies each one as a measurement with an appropriate noise level and, when a source drops out, keeps predicting from inertial data with growing uncertainty. It can switch height references, such as barometer to rangefinder near the ground. It is hard because the sources disagree in ways that are not simple noise: reference frames differ, fixes jump, and filter state can be pulled wrongly by one bad source.",
    k: ["Satellite positioning as primary vs local sensors as primary: satellite gives absolute position; local sensors work indoors and are smoother but drift over time.", "Switch height source abruptly vs blend: abrupt is simple; a blend avoids a step in the height estimate and the control reaction to it."],
    p: ["A fix that jumps by several meters is applied directly and the aircraft lurches to correct the apparent error.", "Optical flow with no texture or light is treated as zero velocity, so the aircraft drifts without knowing."],
    v: "Fly a closed path indoors and outdoors, comparing the estimated final position against the true start point, and confirm closure error is within the stated limit with each source dropped out in turn.",
    dep: ["kalman-estimator", "gnss-receiver", "barometer", "optical-flow", "rangefinder"]
  },
  "innovation-gating": {
    s: "Rejects measurements that disagree with the filter's prediction by more than their expected uncertainty, protecting the state from bad data.",
    d: "For each measurement the filter computes the innovation, the difference between measurement and prediction, and compares its size with the expected variance. Above a threshold, measured in standard deviations, the sample is rejected. Repeated rejection starts a recovery: reset the state to the measurement or stop using that sensor. It is hard because a gate that is too tight rejects a good sensor after a real maneuver, and too loose lets bad data in.",
    k: ["Tight gate at a few standard deviations vs a loose one: tight resists glitches; it can lock out a good sensor after the estimate has drifted.", "Reset the state after prolonged rejection vs keep rejecting: resetting recovers from a bad estimate; the reset step can itself be wrong and cause a sudden jump."],
    p: ["After a long satellite outage the estimate has drifted farther than the gate, so the returning good fixes are rejected forever.", "Gate thresholds that are not scaled by the sensor's declared accuracy."],
    v: "Inject a single large outlier and a slow bias into a replayed sensor stream, and confirm the outlier is rejected, the filter recovers from the long bias through a defined reset, and the rejection counters in the log reflect both.",
    dep: ["kalman-estimator"]
  },
  "delay-compensation": {
    s: "Aligns sensors with different latencies to the time they were actually measured, so each measurement is applied to the correct moment of the filter's history.",
    d: "Satellite positions can be a few hundred milliseconds old, vision measurements longer, and inertial data arrives immediately. Each sample is timestamped at the moment of measurement, and the estimator keeps a short history of its states so it can apply the measurement to the matching past state and then propagate forward. It is hard because it requires accurate clocks and per-sensor latency values; an error of tens of milliseconds can drive oscillation.",
    k: ["Fusion time horizon delayed to the slowest sensor vs applying all samples as they arrive: a delayed horizon gives correct timing; the output must be extrapolated to the present.", "Hardware timestamps at the sensor vs timestamps at software receipt: hardware timestamps are accurate; they need supporting sensors and synchronization."],
    p: ["Latency configured from a datasheet that does not match the real driver pipeline.", "Clock drift between the sensor and the controller accumulating into growing timing error."],
    v: "Shake the aircraft in a known pattern and compare timestamped inertial and satellite velocity traces; confirm the estimator's delay parameters make the traces align within a few milliseconds.",
    dep: ["kalman-estimator", "message-bus", "scheduler"]
  },
  "wind-estimation": {
    s: "Estimates the wind vector from the difference between groundspeed and airspeed, or from the aircraft's tilt and drag, for navigation and landing.",
    d: "With an airspeed sensor, wind is groundspeed minus true airspeed in the same frame, tracked slowly by the filter. Without one, an estimate comes from the tilt needed to hold position, or a drag model. The wind estimate feeds path following, return energy estimates and landing approaches. It is hard because it needs good heading and airspeed, and because gusts and aircraft maneuvers change the apparent signal.",
    k: ["Direct estimate from airspeed vs from an aircraft drag or tilt model: direct is accurate with a good sensor; the model works without extra hardware but is crude.", "Slow smoothing vs fast tracking: slow gives a stable wind estimate for planning; fast follows gusts for control but adds noise."],
    p: ["An airspeed sensor scale error appearing as a constant wind that shifts every path decision.", "A wrong heading estimate rotating the wind vector, so crosswind compensation points the wrong way."],
    v: "Fly a circle in steady wind and confirm the estimated wind direction and speed stay within the stated tolerance of an independent anemometer reading, with the estimate settling within a set time.",
    dep: ["kalman-estimator", "airspeed-sensor"]
  },
  "sensor-selection": {
    s: "Chooses which of several redundant sensors feeds the estimator, comparing them against each other and switching away from one that disagrees.",
    d: "Aircraft with two or three inertial units, barometers or magnetometers monitor each against the others and against the filter's prediction. A voter or a score picks the primary, with hysteresis so it does not flip repeatedly. Some designs run several estimator instances in parallel, each on a different sensor set, and select the best. It is hard because two sensors that disagree give no obvious winner, and a failing one may be the one with the lower noise.",
    k: ["Voting with three or more sensors vs a primary with a backup: voting identifies the bad one; a pair can only detect disagreement.", "Parallel estimator instances vs a single estimator with selected inputs: instances survive a bad sensor without reset; they multiply compute and memory."],
    p: ["Switching sensors causes a step in the estimate that the controllers respond to violently.", "Two sensors on one shared bus failing together, so redundancy exists only on paper."],
    v: "Inject a drifting fault and a stuck value into one of three sensors during flight in simulation, and confirm the selector switches away within the stated time and the estimate stays within bounds across the switch.",
    dep: ["sensor-health-monitoring", "estimator-health", "imu"]
  },
  "estimator-health": {
    s: "Reports whether the estimate is trustworthy: convergence, test ratios, accuracy bounds and which sources are being used.",
    d: "The filter publishes flags and numbers: attitude, horizontal position and vertical position validity, velocity accuracy, innovation test ratios per sensor, and which aiding sources are active. Modes and failsafes read these to decide what flight is allowed. Hysteresis keeps flags from toggling. It is hard because the flags should reflect real accuracy, not just internal consistency, and a filter can be confidently wrong.",
    k: ["Derive health from reported uncertainty vs from innovation consistency: uncertainty is cheap and predictive; innovation tests catch a filter that is confidently wrong.", "Binary flags vs graded accuracy numbers: flags make decisions simple; numbers allow modes to set their own thresholds."],
    p: ["A health flag that clears too early after a fault, so position hold re-engages before the estimate has converged.", "Thresholds identical for all modes, blocking a manual mode that needs only attitude."],
    v: "Cover the satellite antenna and confirm position validity drops within the stated time and blocked modes refuse to engage. Uncover it and confirm validity returns only after the estimate converges.",
    dep: ["kalman-estimator", "innovation-gating"]
  },
  "imu": {
    s: "A combined gyroscope and accelerometer that measures angular rate and specific force at high rate, the primary input to attitude estimation and rate control.",
    d: "A micromachined inertial chip is read over a serial bus at a few kilohertz, often with a data-ready signal to sample at precise instants. Its output is scaled to physical units, rotated into the body frame, and timestamped. Several chips can be on one board. It is hard because the gyroscope is the heart of stabilization and every one of its flaws matters: noise, bias that changes with temperature, vibration sensitivity, and sampling delay.",
    k: ["Read on the chip's data-ready interrupt vs on a software timer: interrupts give accurate sample timing and lower delay; they need pin routing and interrupt handling.", "Hardware low-pass inside the chip vs oversampling and filtering in software: in-chip is cheap; software filtering gives control of delay and notches."],
    p: ["Propeller vibration aliasing into the gyroscope band and appearing as slow drift or noise.", "A bus error returning a repeated old sample that looks valid, so the loop runs on stale data."],
    v: "Log raw samples on the bench and in a hover, and confirm sample intervals are regular within a stated jitter, noise density is as specified, and vibration at the motor frequencies is below the limit.",
    dep: ["sensor-bus-drivers", "interrupts-dma", "board-support"]
  },
  "barometer": {
    s: "Measures air pressure to infer altitude changes, giving a smooth but weather-dependent vertical reference.",
    d: "A pressure sensor is read at tens of hertz and converted to height relative to the pressure at startup. It is accurate for short-term changes and drifts with weather and temperature. Airflow over the sensor causes errors, so it is placed in a shielded, vented enclosure. It is hard because the reading is disturbed by propeller wash, wind gusts and light hitting the sensor, and because it measures pressure, not height.",
    k: ["Barometer as the main height reference vs satellite height: barometric is smooth and relative to takeoff; satellite height is absolute and noisier with larger errors.", "Software compensation for temperature vs a thermally stable mount: compensation is cheap; a stable mount removes the problem at the source."],
    p: ["An exposed sensor that reads a pressure drop in forward flight, so the aircraft thinks it climbed.", "Direct sunlight on the chip causing slow height drift in the first minutes of a flight."],
    v: "Fly at constant true height while changing speed and throttle, and confirm logged barometric height stays within the stated band, with no step when the airframe's vents are covered.",
    dep: ["sensor-bus-drivers", "temperature-compensation"]
  },
  "gnss-receiver": {
    s: "Provides absolute position and velocity from satellite signals, with accuracy and quality indicators, for navigation and long-term drift correction.",
    d: "The receiver outputs position, velocity, time and quality data at 5 to 20 hertz over a serial link, with a message set that includes accuracy estimates, number of satellites and fix type. Corrections from a base station or network improve it to centimeters. It is hard because accuracy varies with sky view, interference and multipath; errors are not random noise but slow wanders and jumps, and the aircraft's own electronics can jam it.",
    k: ["Single receiver vs dual receivers giving heading: dual receivers measure heading without a magnetometer; they cost weight, power and antenna placement effort.", "Raw positions with the receiver's accuracy fields vs fixed noise values: using reported accuracy adapts the filter; the reported values may be overconfident."],
    p: ["Antenna placed near the camera or power wiring, losing satellites in a way that appears only in flight.", "Position jumps after a fix type change, applied by the filter as real motion."],
    v: "Log fixes in a stationary test for an hour and in flight, and confirm the horizontal error stays within the stated accuracy bound and the satellite count and fix type reflect antenna placement and interference.",
    dep: ["serial-can-drivers", "estimator-health"]
  },
  "magnetometer": {
    s: "Measures the magnetic field to provide a heading reference, which is otherwise unobservable without satellite motion or a second antenna.",
    d: "A three-axis sensor reads the field in the body frame; the estimator rotates it into the world frame and compares it to the expected field direction at the location. Errors come from hard-iron offsets, soft-iron distortion, and currents in nearby wires and motors. The sensor is often mounted on a mast or in a separate module away from the power system. It is hard because heading errors compound into position errors.",
    k: ["Rely on the compass for heading vs infer heading from motion: the compass works when stationary; motion-based heading works in disturbed areas but only when moving.", "Compensate for motor current in software vs mount away from currents: software compensation needs a calibration; distance removes the cause."],
    p: ["Calibration done next to a steel table, so heading is wrong in every other location.", "Heading that rotates as throttle increases because wiring current creates a field."],
    v: "Rotate the aircraft through a full turn on the ground and confirm measured heading error is within the specified limit at every angle, with and without motors running.",
    dep: ["sensor-bus-drivers", "sensor-calibration"]
  },
  "rangefinder": {
    s: "Measures distance to the ground or an obstacle with a light or sound pulse, giving precise low-altitude height for landing and terrain following.",
    d: "A laser or ultrasonic sensor reports distance at tens of hertz over a serial or bus link or a pulse width, with a valid range and a quality indicator. For height above ground it must be corrected for tilt. The estimator uses it near the ground, where the barometer is least accurate. It is hard because surfaces change readings: water, glass, grass and bright sun give no return or false ones.",
    k: ["Laser sensor vs ultrasonic sensor: laser has a narrow beam and long range; ultrasonic is cheaper and works on glass but has a wide cone and short range.", "Use only below a set height vs at all heights: low-only avoids long-range noise; a gap in coverage needs a clean handoff."],
    p: ["Reading the ground below tall grass or reflections off water as an altitude, causing a climb or sudden descent.", "No tilt correction, so a banked aircraft over a slope reads longer than its true height."],
    v: "Hover over grass, asphalt, water-like and glass surfaces and confirm logged range stays valid or flagged invalid as expected, with height errors small enough that automatic landing is unaffected.",
    dep: ["sensor-bus-drivers", "serial-can-drivers"]
  },
  "optical-flow": {
    s: "A downward camera that measures apparent ground motion, giving horizontal velocity for position hold where satellites are unavailable.",
    d: "An image sensor with a small processor tracks texture between frames and reports angular motion in radians per second with a quality value. Combined with range and gyroscope rate, it gives velocity in meters per second. It is used indoors, under bridges and near buildings. It is hard because it needs light and texture, requires accurate height to scale motion, and the rotation of the aircraft must be subtracted exactly.",
    k: ["Flow from a dedicated module vs from a general camera in software: a module is low latency and cheap on compute; a general camera allows richer vision at higher cost.", "Fuse flow as velocity vs as raw angular motion: raw motion handles scale properly; velocity is simpler to use."],
    p: ["A plain, shiny or dark floor produces low quality flow that the filter still uses, so the aircraft drifts.", "A wrong range value scales velocity incorrectly, so the aircraft overshoots every move."],
    v: "Fly over textured and plain surfaces at several heights and confirm the flow quality flag drops on poor surfaces, the estimator ignores it, and velocity error on good surfaces is under the stated limit.",
    dep: ["sensor-bus-drivers", "rangefinder", "imu"]
  },
  "airspeed-sensor": {
    s: "Measures the speed of air past the aircraft using a pressure difference from a tube, needed for stall protection and energy control on fixed-wing.",
    d: "A differential pressure sensor reads the difference between the tube facing the airflow and a static port. Speed follows from the square root of the difference scaled by air density. The sensor is calibrated for offset on the ground and checked in flight against groundspeed and wind. It is hard because tubes can ice or block, the offset drifts, and readings near zero are noisy.",
    k: ["Direct measurement vs an estimate from groundspeed and wind: direct gives true airspeed for stall protection; the estimate survives sensor loss but cannot protect against a stall in changing wind.", "Zero the offset before takeoff vs continuously: a ground zero is simple; continuous estimation tracks drift but can be fooled in flight."],
    p: ["A blocked tube holds the last pressure while the aircraft actually changes speed.", "Zeroing the sensor in wind, which gives a permanent offset."],
    v: "Compare measured airspeed with groundspeed on opposite headings in calm air, and confirm the two agree within the stated tolerance. Cover the tube and confirm the failure is detected within the stated time.",
    dep: ["sensor-bus-drivers", "sensor-calibration"]
  },
  "power-sensing": {
    s: "Measures battery voltage and current to track power use and charge consumed, and to scale motor commands for voltage sag.",
    d: "A divider and an analog input measure voltage, and a shunt or magnetic sensor measures current, often in a power module that also feeds a regulated supply to the controller. Values are filtered, calibrated against a multimeter, and integrated into charge consumed. Some modules report over a digital bus. It is hard because the signals are noisy at motor switching frequencies, scale factors vary per module, and the measurement must stay accurate through temperature.",
    k: ["Analog power module vs digital smart battery reporting: analog is simple and universal; digital gives cell data and state of charge but needs a compatible battery.", "Calibrate scale against a reference vs trusting nominal values: calibration gives accurate charge counting; it needs a manual procedure and instruments."],
    p: ["A scale error of 10 percent in the current reading, so remaining charge is wrong from the first minute.", "A brownout on the main supply from a regulator that sags at high motor current, resetting the processor."],
    v: "Fly at constant load while comparing logged voltage and consumed charge against a precision meter, and confirm both agree within the stated tolerance at the start, middle and end of the discharge.",
    dep: ["board-support", "sensor-calibration"]
  },
  "sensor-calibration": {
    s: "Procedures that measure each sensor's offset, scale and orientation error so the estimator receives corrected data.",
    d: "Accelerometer calibration places the aircraft in six orientations; gyroscope calibration measures bias while still; magnetometer calibration rotates the aircraft through all directions to fit an ellipsoid. Results are stored as parameters with the sensor's identity, and also refined in flight by the estimator. Calibration can be guided by the ground station. It is hard because users perform it badly, in wrong places, and an invalid calibration looks like a valid one.",
    k: ["Manual calibration procedures vs continuous automatic calibration in flight: manual is explicit and verifiable; automatic removes user steps but may adapt to a wrong reference.", "Calibration tied to sensor identity vs to a slot: identity survives swaps and detects a replaced part; it complicates configuration."],
    p: ["Calibrating the accelerometer on a tilted bench so every level reading is off by a few degrees.", "Calibration data reused after a sensor replacement, so the new part gets another part's offsets."],
    v: "After calibration, place the aircraft level and in each other orientation and confirm the corrected readings match gravity within the stated tolerance, and that the stored calibration is attributed to the right sensor.",
    dep: ["parameter-store", "imu", "magnetometer"]
  },
  "temperature-compensation": {
    s: "Corrects sensor offsets and scale that change with temperature, using a model fitted from a thermal calibration run.",
    d: "Gyroscope bias and accelerometer offset move with chip temperature, and the board heats during flight. A polynomial or table maps temperature to correction. The coefficients come from heating and cooling the board while logging stationary outputs. Some sensors have internal compensation. It is hard because the fit must cover the operating range, boards warm unevenly, and the fitting step adds to production or setup time.",
    k: ["Per-unit thermal calibration vs a generic model for the part: per-unit is accurate; it needs oven time on every board.", "Correct with a polynomial in software vs rely on internal compensation: software gives control and visibility; internal compensation costs nothing but may be poor."],
    p: ["A cold-start flight outside the calibrated temperature range extrapolates the polynomial wildly.", "Heating from the processor warming one sensor faster than the model assumes, so the correction lags."],
    v: "Log a stationary gyroscope from cold to operating temperature with compensation on and off, and confirm residual drift with compensation stays below the stated bound over the full temperature range.",
    dep: ["imu", "barometer", "parameter-store"]
  },
  "vibration-filtering": {
    s: "Reduces vibration reaching the sensors through mounting design and signal filtering so that motor and propeller noise does not corrupt estimates.",
    d: "Soft mounts isolate the inertial unit from the frame; software adds notch filters at motor and propeller frequencies and low-pass filters on accelerometer data. The software also measures vibration level and clipping, which warns of a saturated accelerometer. It is hard because the best fix is mechanical, and software hides a problem the airframe still has: a bent propeller or a loose motor shows up in the data first.",
    k: ["Soft mounting vs rigid mounting with filtering: soft mounts cut noise before it reaches the sensor; they add resonance and attitude lag if done badly.", "Report vibration to the pilot vs only log it: reporting warns before it causes a crash; thresholds that are too sensitive cause false alarms."],
    p: ["Accelerometer clipping that goes unnoticed, so the estimator integrates incorrect acceleration and drifts.", "A filter tuned on the bench with props off, so the real frequencies are missed."],
    v: "Spin up on a tethered test and in hover, and confirm the logged vibration metric and accelerometer clipping count are below the limit, with spectrum peaks reduced by the target amount after filtering.",
    dep: ["imu", "control-filters"]
  },
  "sensor-health-monitoring": {
    s: "Checks each sensor for stale data, stuck values, impossible readings, noise and disagreement with its neighbors, and raises faults.",
    d: "Monitors look at sample rate, timestamps, range limits, variance and changes between readings, and compare redundant units and the estimator's prediction. Each failure type has a debounce time before it is declared. Results go to selection, failsafe and pre-flight logic. It is hard because failures are subtle: a stuck value is a perfectly valid number, and the threshold between noisy and broken depends on the sensor.",
    k: ["Rule-based checks per sensor type vs model-based consistency checks: rules are simple and transparent; consistency checks find subtle faults but can blame the wrong sensor.", "Short debounce vs long debounce: short reacts fast to real failures; false triggers from brief glitches cause unnecessary failsafes."],
    p: ["A frozen sensor repeating its last value never trips a range check.", "Thresholds taken from a quiet bench, flagging a healthy sensor in the vibration of real flight."],
    v: "Inject stuck, noisy, offset and missing-data faults in each sensor in simulation, and confirm each is detected within its stated time with no false alarms over a long fault-free flight.",
    dep: ["imu", "sensor-bus-drivers", "message-bus"]
  },
  "radio-esc-calibration": {
    s: "Procedures that teach the controller the radio's stick endpoints and the motor drivers' throttle range, so commands map to what the hardware expects.",
    d: "Radio calibration records minimum, center and maximum for each channel, with checks that channels are assigned and not reversed. Motor driver calibration, for pulse-based drivers, sends maximum then minimum throttle so the driver learns its range. Digital protocols remove most of it. It is hard because the motor driver procedure is done with power on and a mistake can start motors at full throttle.",
    k: ["Guided calibration wizard vs documented manual steps: a wizard reduces errors; it needs the ground station and a defined safe state.", "Calibrate on every setup vs ship with factory defaults: calibration gives correct ranges; defaults work for matched parts and fail silently on others."],
    p: ["Motor driver calibration run with propellers attached, spinning them at full throttle.", "A channel center point recorded with a stick not at rest, giving a permanent offset."],
    v: "After calibration, move each stick through its full range while logging the normalized values, and confirm minimum, center and maximum read as exact expected values and that every motor starts at the same throttle level.",
    dep: ["pilot-radio-link", "motor-output-protocols", "parameter-store"]
  }
});
