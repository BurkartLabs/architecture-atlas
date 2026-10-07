// Details, part 3: attitude and orbit control, power, thermal and propulsion.
ATLAS.details("satellite-flight-software", {
  "attitude-sensor-processing": {
    s: "Reads gyros, sun sensors, magnetometers and similar units, converts raw counts to calibrated physical values and flags readings that are invalid or out of range.",
    d: "Each sensor has a driver that returns raw data, and this layer applies scale factors, bias, alignment to vehicle axes and temperature correction. It checks validity flags and plausible ranges, and passes values with a quality indication to the estimator. Rates are fixed by the control cycle. It is hard because calibration drifts, sensors fail in ways that look like valid data, and the alignment and sign conventions are a classic source of mistakes found only in orbit.",
    k: ["Calibration in flight software versus in the sensor unit: software calibration can be updated by table, but depends on the table being right.", "Reject suspect data versus pass with a flag: rejection protects the estimator, but starves it when many readings are marginal."],
    p: ["A sign error between sensor frame and body frame makes the controller drive the wrong way.", "A stuck sensor repeats the last value, passing every range check."],
    v: "Rotate the test bed on a table through known angles and confirm the processed vector, rate and quality flags match the reference within the sensor's specification on every axis.",
    dep: ["unit-drivers","parameter-database","timers-and-system-clock"]
  },
  "star-tracker-processing": {
    s: "Takes the star tracker's attitude solutions, checks their quality, rejects those corrupted by the sun, moon or Earth in view, and passes the good ones to the estimator.",
    d: "The unit images stars and returns an attitude quaternion with a quality measure. Software checks acquisition status, solution age and consistency with the gyro-propagated attitude, rejects outliers, and handles blinding when bright bodies enter the field. It manages the lost-in-space recovery request. It is hard because a wrong but confident solution is worse than none, and because trackers are blind during fast slews and near bright objects.",
    k: ["Trust the tracker's own quality flag versus an independent consistency check: the flag is cheap, but an independent check also catches the unit's own faults.", "Hard switching between tracker and gyro-only versus blending: switching is simple, but blending avoids jumps in attitude."],
    p: ["A false lock on a bright planet is accepted and the filter converges on a wrong attitude.", "Accepting a tracker solution delayed by processing without correcting for its age adds a lag error."],
    v: "Replay recorded tracker output including blinding intervals, and confirm outliers and blinded intervals are rejected, the gyro-propagated attitude carries through, and re-acquisition is accepted only after consistency passes.",
    dep: ["attitude-sensor-processing","unit-drivers"]
  },
  "attitude-determination": {
    s: "Combines gyro, star tracker, sun sensor and magnetometer data in a filter to produce a continuous estimate of vehicle orientation and rotation rate.",
    d: "A filter propagates attitude with gyro rates, and corrects it with each absolute measurement weighted by its noise, estimating the gyro bias as well. It outputs attitude, rate and an error estimate for the controller and the pointing logic. Different modes use different sensor sets, from coarse sun and field sensors to full star tracking. It is hard because tuning matters, the filter can silently diverge, and its modes must switch correctly as sensors come and go.",
    k: ["Full filter versus simple complementary method: a full filter is more accurate and gives an error estimate, but is harder to tune and verify.", "Estimating bias online versus calibrating it on the ground: online estimation tracks drift, but can absorb real errors into the bias."],
    p: ["A filter with its covariance wrongly tuned ignores good measurements and drifts without any alarm.", "Switching sensor sets without initializing the filter state causes a jump in estimated attitude."],
    v: "Run the filter on recorded flight sensor data, compare its output with the independent ground reconstruction, and confirm the error stays within the budget over eclipse, slews and sensor dropouts.",
    dep: ["attitude-sensor-processing","star-tracker-processing","onboard-time-service"]
  },
  "orbit-determination": {
    s: "Estimates where the spacecraft is and how fast it moves, from a navigation receiver or from orbit data uploaded from the ground, and keeps the estimate current.",
    d: "A navigation satellite receiver, where fitted, gives position and velocity that a filter refines. Without one, the onboard state is a ground-computed state vector propagated forward. The estimate supplies time-of-event predictions, pointing to ground targets and maneuver execution. It is hard because receivers lose lock, give bad fixes in some geometries, and in higher orbits may not be usable at all, leaving ground tracking as the only source.",
    k: ["Onboard receiver versus ground-supplied orbit: a receiver gives autonomy and constant updates, but adds a unit with its own faults and limits by orbit.", "Reject fixes by consistency with the propagated orbit versus accept all: rejecting protects against outliers, but can discard a good fix after a maneuver the model does not know about."],
    p: ["A receiver that tracks too few satellites returns a poor fix flagged as valid.", "An orbit not corrected for a thruster firing drifts away from reality after that firing."],
    v: "Compare the onboard orbit estimate with the ground tracking solution at several epochs, including right after a maneuver, and confirm position and velocity differences stay inside the documented error bound.",
    dep: ["orbit-propagator","unit-drivers","onboard-time-service"]
  },
  "orbit-propagator": {
    s: "Computes the spacecraft's position forward in time from its current state using a model of gravity and other forces, for planning, event prediction and pointing.",
    d: "It integrates the equations of motion with a gravity model and, where needed, drag and radiation pressure, or uses analytic approximations. Its outputs feed the event predictor, the antenna and payload pointing and sun and Earth direction computations. It is hard because accuracy needed varies by use, the model must be cheap enough for onboard processors, and errors grow with time since the last state update.",
    k: ["Numerical integration versus analytic formulas: numerical integration is more accurate and flexible, but costs more computation per step.", "Simple gravity model versus detailed field: a simple one is cheap and enough for most pointing, while a detailed field is needed for precision over days."],
    p: ["A propagator that uses a different time scale than the ground silently shifts all predictions by seconds.", "Numerical step size too large for a low orbit loses accuracy near perigee."],
    v: "Propagate from a known state for several days, compare with the ground high-fidelity ephemeris, and confirm position error grows no faster than the documented rate.",
    dep: ["onboard-time-service"]
  },
  "attitude-control-laws": {
    s: "Computes the torque needed to point at a target and hold it, comparing the estimated attitude and rate with the commanded ones at a fixed rate.",
    d: "A controller, typically with proportional, derivative and sometimes feedforward terms, turns attitude error into a torque command. Different modes use different laws: detumbling, slewing, fine pointing and safe holding. Gains, limits and mode logic are parameters. It is hard because flexible appendages, fuel slosh and delays can destabilize a law that was stable on paper, and because transitions between modes can cause jumps.",
    k: ["Gain-scheduled laws per mode versus one law for all: per-mode laws are tuned to each task, but switching them must be smooth.", "Open-loop slew then closed-loop settle versus fully closed-loop: open-loop reduces control effort, but needs accurate models of inertia."],
    p: ["A gain tuned in simulation with rigid-body inertia causes oscillation when the real structure flexes.", "Actuator saturation not handled by the control law winds up the integrator and overshoots wildly."],
    v: "Command a slew and hold on the test bed with the real dynamics simulator, and confirm settling time, overshoot and pointing error fall within the requirement, and that a saturating command recovers without sustained oscillation.",
    dep: ["attitude-determination","actuator-management","parameter-database"]
  },
  "actuator-management": {
    s: "Converts the requested torque into commands for individual wheels, magnetic torquers and thrusters, respecting each one's limits and handling failures by redistributing the load.",
    d: "For a set of reaction wheels it computes individual wheel torques from the commanded body torque using the geometry, keeps speeds away from zero crossings and limits, and shares load with torquers or thrusters when wheels saturate. If one actuator fails, the distribution changes. It is hard because the actuator configuration is part of the control law, its failure cases multiply, and wheel behavior near zero speed is nonlinear.",
    k: ["Distributing across all actuators versus dedicated axes: distribution handles failures more gracefully, but needs correct geometry and more computing.", "Wheel friction compensation versus ignoring it: compensation improves fine pointing, but needs a good friction model that changes with age."],
    p: ["A misconfigured wheel matrix sends torque to the wrong axis and the vehicle spins up.", "A failed wheel not removed from the distribution keeps being commanded and the error grows."],
    v: "Command torque on each axis with each actuator disabled in turn on the test bed, and confirm the achieved torque matches the request within tolerance in all cases that the design says are recoverable.",
    dep: ["unit-drivers","momentum-management"]
  },
  "momentum-management": {
    s: "Keeps stored angular momentum in reaction wheels within limits by dumping it through magnetic torquers or thrusters before the wheels reach their maximum speed.",
    d: "External torques from gravity gradient, drag and magnetic fields push momentum into wheels. The manager tracks total momentum, predicts saturation and schedules a dump using the torquers, which push against the magnetic field, or thrusters. It runs more slowly than the control loop. It is hard because dumping disturbs pointing, torquers work only in some orbit geometries, and thruster dumps consume propellant.",
    k: ["Continuous low-level dumping versus periodic large dumps: continuous dumping disturbs pointing little, but runs the torquers constantly and needs a good field model.", "Magnetic versus thruster unloading: magnetic costs no propellant but is weak and orbit-dependent, while thrusters are strong but finite."],
    p: ["A wrong magnetic field model makes the dump add momentum instead of removing it.", "Dumping scheduled in the middle of an observation ruins the data."],
    v: "Over several orbits in simulation with realistic disturbances, confirm wheel speeds stay below the limit, the dump events occur outside observation windows, and net momentum returns to its target.",
    dep: ["actuator-management","orbit-propagator"]
  },
  "maneuver-planner": {
    s: "Turns a desired change in orbit into burn timing, direction and duration, and runs the sequence of attitude changes, thruster firing and checks that carry it out.",
    d: "Ground normally designs the maneuver and uploads its parameters, while onboard software executes: slew to burn attitude, verify, open valves, fire for the commanded time or velocity change, then close and reorient. Monitors check chamber pressure, attitude error and elapsed time. It is hard because a thruster stuck open or an attitude error during the burn wastes propellant or puts the vehicle into the wrong orbit, with little chance to fix it.",
    k: ["Burn by duration versus by accumulated velocity change: duration is simple, but depends on thruster performance, while velocity change from accelerometers adapts but needs a good sensor.", "Ground-planned sequence versus onboard planned: ground planning is reviewed and flexible, onboard planning allows autonomous station keeping."],
    p: ["A burn started with a bad attitude estimate points thrust in the wrong direction.", "A maneuver abort that closes the valves but leaves the vehicle in burn attitude forgets to reorient it."],
    v: "Execute a test maneuver in the simulator with an injected thruster underperformance and confirm the abort or compensation limits are applied and the final orbit error matches the prediction.",
    dep: ["attitude-control-laws","propulsion-control","orbit-determination"]
  },

  "battery-state-estimator": {
    s: "Estimates how much charge remains in the battery from voltage, current and temperature, because a spacecraft cannot measure state of charge directly.",
    d: "It integrates current in and out, corrects with voltage-based estimates, and compensates for temperature and cell aging. The result drives load shedding, charge control and the planning of what the vehicle can do before the next sunlight. It is hard because batteries age and no two cells are identical, estimates drift between full-charge references, and a wrong number leads either to unnecessary shedding or to a deep discharge that damages the battery.",
    k: ["Coulomb counting versus voltage lookup: counting is accurate in short spans but drifts, while voltage is absolute but depends on temperature and load.", "Conservative margin versus tight estimate: margin protects the battery, but reduces usable energy on a mission already short of it."],
    p: ["A current sensor offset accumulates into a large state-of-charge error over days.", "An estimator that is not reinitialized after a reset restarts at a default charge, which may be wrong."],
    v: "Cycle the battery on the test bed or in a hardware simulation, and compare the estimate with measured charge at several points; the error must stay inside the budget and recover at the next full charge.",
    dep: ["analog-and-discrete-io","temperature-acquisition"]
  },
  "battery-charge-control": {
    s: "Controls how the battery is charged from the arrays, limiting voltage, current and temperature to the cell manufacturer's rules and ending charge at the right point.",
    d: "Charging follows a profile, for example constant current to a voltage limit and then taper, with checks on temperature and cell balance. Either hardware regulators or software commands set the limits, and software can reduce charging when cells are warm or imbalanced. It is hard because overcharge can cause a thermal runaway, undercharge cuts capacity, and the right profile changes as the battery ages.",
    k: ["Hardware charge regulation versus software control: hardware is independent of the computer, but software can adapt to age and temperature.", "Full charge each orbit versus a lower ceiling: full charge gives the most energy, a lower ceiling extends cell life."],
    p: ["A charge limit table not updated for aged cells keeps pushing them past their safe voltage.", "Charging while a cell is cold causes plating that reduces capacity permanently."],
    v: "Charge a battery on the bench through a full profile with temperature and current limits tested, and confirm each limit forces the correct reduction and the charge ends at the specified voltage.",
    dep: ["battery-state-estimator","load-switching","thermal-limit-protection"]
  },
  "solar-array-management": {
    s: "Points or steers the solar arrays toward the sun, regulates what they deliver, and detects when sections have degraded or are shadowed.",
    d: "Where arrays can rotate, a drive controller follows the sun using the computed sun direction, and a power regulator tracks the maximum power point or limits output. The software monitors current from each string for open or shorted sections. It is hard because arrays move relative to the body, their drive mechanisms wear, and flexing or shadowing by the vehicle itself changes output in ways that look like failures.",
    k: ["Rotating arrays versus body-mounted fixed arrays: rotating arrays collect more energy, but add a mechanism that can fail and disturb pointing.", "Maximum power tracking versus a fixed operating point: tracking gives more power, but adds control complexity and oscillation risk."],
    p: ["A drive that loses its position reference points the arrays away from the sun with no immediate alarm.", "Shadow from an antenna is read as string failure and the string is disabled."],
    v: "Over a full orbit on the test bed with a solar simulator, confirm the array angle follows the computed sun direction within the limit and each simulated string fault is flagged by the correct string.",
    dep: ["attitude-determination","orbit-propagator","unit-drivers"]
  },
  "load-switching": {
    s: "Switches power to each unit through commandable switches grouped into domains, so units can be turned on, off, reset or shed independently and in a safe order.",
    d: "Power distribution has switches, often with current limiters, for each unit or group. Software commands them and reads their status and current. Domains define what shuts down together, and sequences ensure, for example, that a heater driver is never on without its sensor. Some switches are hardware-only so that they can work without software. It is hard because switch state after a reset must be known and safe, and a stuck switch cannot be bypassed.",
    k: ["Default-on versus default-off after reset: default-on keeps essential units alive, but default-off is safer for hazardous or power-hungry loads.", "Software-controlled versus hardware-timed switching: software is flexible, but hardware-timed switching works when the processor does not."],
    p: ["A reset that turns all switches to their default state suddenly turns on a transmitter in the middle of a power-limited orbit.", "Overcurrent trips are reset automatically so a short circuit is retried endlessly."],
    v: "Command each switch on and off on the test bed and confirm commanded state, measured current and telemetry status agree, and that a reset leaves every switch in its documented default state.",
    dep: ["analog-and-discrete-io","power-budget-enforcer"]
  },
  "power-budget-enforcer": {
    s: "Tracks present and planned power consumption against generation and battery state, and refuses or delays activities that the vehicle cannot afford.",
    d: "Each unit has a known draw per mode. The enforcer sums active loads, compares with array output and charge, and accepts or blocks requests such as starting the payload or the transmitter. It also provides the margin that planning and autonomy use. It is hard because real draw differs from the budget, loads vary with temperature, and during eclipse generation is zero, so the answer depends on what comes later in the orbit.",
    k: ["Budget by modeled draw versus by measured current: modeled draw allows prediction, measured current reflects reality but only after starting the load.", "Hard refusal versus queued request: refusal protects the battery, but requests may need a retry by ground."],
    p: ["A budget built on beginning-of-life array output overestimates what the vehicle can supply years later.", "Concurrent requests that are each affordable, but not in combination, are both accepted."],
    v: "Request a series of activities exceeding the budget on the test bed and confirm the ones that exceed it are refused or delayed with the reason, and that measured bus current stays under the stated limit throughout.",
    dep: ["battery-state-estimator","housekeeping-collector"]
  },
  "undervoltage-load-shed": {
    s: "Turns off loads in a fixed priority order as battery voltage or charge falls, ending with only the equipment needed to survive and recover.",
    d: "Thresholds at decreasing levels trigger shedding steps: payload first, then non-essential heaters and transmitters, and finally everything except the computer's minimum and the receiver. A hardware comparator performs the last step independent of software. After shedding, loads stay off until ground commands recovery, or until charge has risen above a higher recovery level. It is hard because shedding must be fast, ordered and robust to a failed computer, and because thresholds must allow for sensor error.",
    k: ["Hysteresis between shed and restore versus a single threshold: hysteresis prevents oscillating on and off, but delays recovery.", "Automatic restore versus ground-commanded: automatic restore recovers the mission, but can re-enter the shed state repeatedly."],
    p: ["Shedding order that turns off a heater before the payload leaves the payload cold and damaged.", "Voltage thresholds that ignore the drop under load shed too late, when the battery is already deep discharged."],
    v: "Lower the simulated battery voltage in steps on the test bed and confirm each load turns off at its threshold in the specified order and the final hardware stage trips with the processor held in reset.",
    dep: ["load-switching","battery-state-estimator","limit-checking"]
  },
  "eclipse-handling": {
    s: "Prepares the vehicle for entering and leaving the Earth's shadow by switching to battery power, adjusting heaters and pointing, and managing the sudden change in power and temperature.",
    d: "Predicted eclipse times come from the orbit event predictor, and sun sensors or array current confirm them. Entry triggers a switch of the power source, a change of attitude mode where needed, and heater settings. Exit starts battery recharge at a controlled rate. It is hard because transitions are abrupt, sensors disagree at the edges of shadow, and long eclipse seasons can stress the battery and thermal control for weeks.",
    k: ["Predicted versus sensed eclipse boundaries: predicted times are smooth, but wrong if the orbit is stale, while sensed boundaries are right but late.", "Preheat before eclipse versus react after: preheating keeps temperatures steady, but uses power at the worst time."],
    p: ["An eclipse flag toggling at the shadow edge starts and stops the same sequence repeatedly.", "Attitude sensors that lose the sun at eclipse entry drive the controller into a bad mode."],
    v: "Over an eclipse season in the simulator, confirm each entry and exit is handled once, temperatures and battery voltage stay within limits, and the sensed boundary agrees with the predicted one within the margin.",
    dep: ["orbit-event-predictor","heater-control-loops","battery-charge-control"]
  },

  "temperature-acquisition": {
    s: "Reads every temperature sensor on a fixed cycle, converts to degrees, and flags readings that are open, shorted or implausible.",
    d: "Hundreds of thermistors or similar sensors are multiplexed through analog conversion units. Software applies calibration tables per sensor, checks for open and short readings, and publishes values with a validity flag. It is hard because sensors drift and fail, the readings are slow-changing so a stuck value is easy to miss, and every control and protection function downstream trusts these numbers.",
    k: ["Raw counts calibrated on the ground versus onboard: ground calibration allows corrections without uploads, but all onboard use needs the calibrated value.", "Voting among neighboring sensors versus treating each independently: voting finds a bad reading, but assumes nearby sensors read alike."],
    p: ["A broken sensor wire reads as a very cold value and a heater control loop drives that heater full on.", "A calibration table indexed in the wrong order assigns every sensor its neighbor's curve."],
    v: "Apply known resistances to each channel on the bench and confirm the calibrated temperature within tolerance, and that an open and a short each produce the correct flag within one cycle.",
    dep: ["analog-and-discrete-io","parameter-database"]
  },
  "heater-control-loops": {
    s: "Switches heaters on and off to keep each unit or zone between its minimum and maximum temperatures, using thermostat-like logic with setpoints held in tables.",
    d: "Each zone has a sensor, a heater, a setpoint pair and a duty limit. The loop turns the heater on below the lower setpoint and off above the upper one, or modulates power proportionally. Setpoints depend on the mode of the unit. It is hard because heaters are a large part of the power budget, a stuck-on heater is dangerous, and the same zone may be controlled by both software and independent thermostat hardware.",
    k: ["Software control versus hardware thermostats: software is adjustable and reports state, but fails with the computer, while thermostats work in any state.", "On-off control versus proportional: on-off is simple and robust, proportional keeps temperature steadier but needs tuning."],
    p: ["A sensor used by both the control loop and the protection logic fails and takes out both.", "Setpoints for a cold-case design held in the table throughout the mission waste power in the warm case."],
    v: "Run a zone through cold and hot conditions on the thermal test, and confirm it stays within the setpoint band, heater duty stays below its limit, and a sensor failure drives the loop to its documented fallback.",
    dep: ["temperature-acquisition","load-switching","parameter-database"]
  },
  "thermal-mode-manager": {
    s: "Selects thermal setpoints and heater sets for the current vehicle mode, such as survival, nominal or payload operation, and handles transitions between them.",
    d: "Each operating mode maps to a thermal configuration: which zones are controlled, to what limits, and with what priority when power is short. When the mode changes the manager loads the corresponding configuration. In safe mode it uses a reduced set with survival limits only. It is hard because the combinations of mode and environment are many, and each needs the right heater set within the power available.",
    k: ["Mode-specific tables versus continuous adaptation: tables are predictable and testable, while adaptation uses less power but is hard to verify.", "Survival heating prioritized over payload warm-up: protects the vehicle in power shortage, but delays science after recovery."],
    p: ["A mode change that fails to apply the new table keeps old limits and overheats or freezes a unit.", "Missing the safe-mode table entry for a newly added unit leaves it unheated."],
    v: "Step through every vehicle mode on the thermal test bed and confirm the active setpoints and heater set in telemetry match the table for that mode, with each zone inside its limits after settling.",
    dep: ["heater-control-loops","safe-mode-manager"]
  },
  "thermal-limit-protection": {
    s: "Independently watches temperatures against hard survival and operating limits and powers units down or heaters off when a limit is crossed.",
    d: "Protection logic reads sensors, compares with limits per unit and acts directly on power switches or heater enables, outside the normal control loop. Limits include battery cell temperature, propellant lines and detectors. Responses are latched until ground clears them. It is hard because protection must be simple and independent of the control it backs up, yet the system's many temperature limits change between modes.",
    k: ["Latched response requiring ground action versus automatic recovery: latching prevents repeated cycling at the limit, but needs a pass to restore.", "Separate sensors for protection versus shared with control: separate sensors survive one failure, but cost more mass and channels."],
    p: ["Protection limits set wider than the unit's actual limit after a test change are never reset.", "A protection response that turns off a heater driver at the cold limit makes things colder."],
    v: "Drive each protected zone past its limit with simulated sensor values and confirm the specified action occurs within the allowed time, latches, and clears only on the explicit clear command.",
    dep: ["temperature-acquisition","limit-checking","load-switching"]
  },
  "propulsion-control": {
    s: "Commands thruster valves and monitors pressures and temperatures to execute burns, with arming, interlocks and automatic closure when readings are abnormal.",
    d: "The software enables the propulsion system through staged arming, then opens valves for commanded durations or pulse trains and watches tank and line pressure, valve position and catalyst bed temperature. Any reading out of range closes the valves. Thruster pulses for attitude are timed to fractions of a second. It is hard because propulsion failures are usually irreversible, and the commanded timing has to be exact while safety interlocks must not prevent a needed burn.",
    k: ["Staged arming with separate commands versus single command: staging resists mistakes, but adds time and states to a critical sequence.", "Autonomous valve closure on out-of-range readings versus ground decision: automatic closure protects the system, but can interrupt a burn that is otherwise fine."],
    p: ["A valve command repeated after a reset fires an extra burn.", "A stuck-open valve not detected because the position sensor shares the faulty circuit."],
    v: "Run a full burn sequence with the propulsion simulator and injected stuck-open, stuck-closed and over-pressure faults, and confirm each is detected and the valves reach the documented safe state within the limit.",
    dep: ["load-switching","analog-and-discrete-io","limit-checking"]
  },
  "propellant-accounting": {
    s: "Estimates remaining propellant from tank pressure, temperature and thruster firing history, because the amount left is hard to measure in weightlessness.",
    d: "Two methods are combined: bookkeeping by integrating burn durations with thruster flow models, and gauging from pressure and temperature in the tank using gas laws. Their difference indicates a leak or a model error. The estimate sets the remaining life of the mission, and the decisions on end-of-life disposal. It is hard because each method has errors of several percent and the answer determines when the vehicle must be retired.",
    k: ["Bookkeeping versus pressure-based gauging: bookkeeping is precise per burn but accumulates error, pressure gauging has no accumulation but is noisy.", "Conservative reserve for disposal versus using all propellant: reserve secures a safe retirement, but ends useful life earlier."],
    p: ["A thruster flow model from ground tests overestimates efficiency so the vehicle runs out earlier than expected.", "A slow leak is explained away as model error until it is too late."],
    v: "After a series of burns, compare the two estimates and confirm they agree within the documented tolerance, and that an injected leak in simulation raises a discrepancy event before the margin is used.",
    dep: ["propulsion-control","temperature-acquisition"]
  },
});
