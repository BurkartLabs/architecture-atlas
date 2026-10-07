// Details for the autonomous driving plate, part 3: tracking, localization, control, supervisor.
ATLAS.details("autonomous-driving", {
  "sensor-fusion": {
    s: "Combines measurements from cameras, lidar and radar into one estimate per object, weighting each sensor by how much it can be trusted for that quantity.",
    d: "Fusion can happen on raw data, on features, or on per-sensor detections. Late fusion matches detections and merges their state: position from lidar, class from cameras, velocity from radar. Each sensor's noise model sets its weight, and the weights change with conditions, such as lowering camera weight at night. The fused result is more accurate and more complete than any one input. Difficulties are mismatched timing, calibration errors that make the same object appear twice, and correlated failures that look like agreement.",
    k: ["Late fusion of detections vs early fusion of raw data: late fusion is modular and degrades gracefully; early fusion keeps more information and couples components tightly.", "Fixed sensor weights vs conditions-based weights: fixed is simple and verifiable; adaptive weights follow reality and can be wrong when the condition is misjudged."],
    p: ["A sensor with a stale timestamp is fused as if current and drags the object's position.", "Two sensors with the same blind spot agree on an empty road."],
    v: "Replay drives with one sensor artificially removed or delayed. Fused object positions stay within the stated error bound against surveyed ground truth, and the delay case is detected and reported.",
    dep: ["data-association", "timestamp-alignment", "extrinsic-calibration", "perception-confidence"]
  },
  "data-association": {
    s: "Decides which new detections belong to which existing tracks, and which are new objects, using distance, motion, appearance and class.",
    d: "At each cycle, every detection is scored against every active track with a gating test based on predicted position and uncertainty. An assignment algorithm picks the matching with the lowest total cost, leaving some detections unmatched for new tracks and some tracks unmatched. In dense scenes, such as a crowd or a lane of traffic, wrong assignments swap identities and corrupt velocities. Appearance features help separate similar objects. The method has to be fast and must degrade sensibly when detections are missing for a few frames.",
    k: ["Global optimal assignment vs greedy matching: optimal gives fewer identity swaps and costs more per cycle; greedy is fast and error-prone in clusters.", "Motion-only vs motion plus appearance cues: appearance resolves crossing objects; it depends on perception quality and adds compute."],
    p: ["Two pedestrians cross and swap identities, so each inherits the other's heading.", "A threshold that is tight for highway speeds drops legitimate matches in slow, noisy city scenes."],
    v: "Run a labeled sequence of crossing and occluding objects and count identity switches against ground-truth tracks; the count stays below the stated rate per thousand frames.",
    dep: ["multi-object-tracker", "ego-motion-compensation"]
  },
  "multi-object-tracker": {
    s: "Maintains an estimate of each object's position, velocity, size and heading over time, smoothing noisy detections and bridging short gaps.",
    d: "Each track runs a motion filter with a model suited to its class: vehicles that cannot move sideways, pedestrians that turn on the spot. Predictions are corrected by each associated detection weighted by its uncertainty. The tracker produces velocity and acceleration, which single detections cannot, and keeps objects alive through brief occlusion. The tradeoff is lag against noise: heavy smoothing hides sudden maneuvers such as a cut-in, and light smoothing makes velocities jump. Tuning of the process noise is a perennial source of subtle behavior.",
    k: ["Constant-velocity filter vs richer motion models: simple filters are robust and lag during maneuvers; richer models follow turns and break when the model is wrong.", "Track in vehicle frame vs world frame: world frame suits stationary objects; vehicle frame avoids accumulated localization error."],
    p: ["Heavy smoothing hides the start of a cut-in until the other car is already in lane.", "A noisy detection of size makes the object appear to grow and shrink, and collision checks flicker."],
    v: "Compare tracked velocity and heading against a reference measurement from instrumented target vehicles on a track, including during sudden braking and lane changes, and report error and lag.",
    dep: ["data-association", "sensor-fusion", "ego-motion-compensation"]
  },
  "track-lifecycle": {
    s: "The rules for creating, confirming, coasting and deleting tracks, which control how quickly new objects appear and how long vanished ones linger.",
    d: "A new detection starts a tentative track, which is confirmed after consistent matches and only then shown to the planner. A track with missing detections coasts on its prediction, with growing uncertainty, then is deleted. Parameters differ by class and by region of space: objects near the path are confirmed faster. Short confirmation delays false objects but delays real ones. Long coasting protects against occlusion and creates ghosts that block the road. These simple counters often decide whether the vehicle feels nervous or oblivious.",
    k: ["Fast confirmation vs slow confirmation: fast reacts to real objects and admits false ones; slow suppresses ghosts and loses reaction time.", "Delete on missed frames vs delete on uncertainty growth: frame counts are predictable; uncertainty-based deletion adapts to how well the object could be seen."],
    p: ["A track deleted during occlusion reappears as a new object with no velocity history, and prediction restarts.", "Ghost tracks from a reflection persist and cause repeated phantom braking."],
    v: "Replay recorded drives with known occlusions and count ghost tracks per hour and missed-confirmation delays against the limits assigned to each class.",
    dep: ["multi-object-tracker", "perception-confidence"]
  },
  "ego-motion-compensation": {
    s: "Corrects sensor data and tracks for the vehicle's own movement during each scan, so that measurements taken at different instants are comparable.",
    d: "A lidar sweep takes around a tenth of a second, during which the vehicle moves several meters at highway speed. Every point must be shifted into a common time using the motion estimate. Tracks are likewise carried between frames by transforming them by the vehicle's displacement. It depends on accurate odometry and timestamps, and errors show up as smeared walls and objects with phantom velocities. At high yaw rates, errors in the rotation estimate matter more than anything else.",
    k: ["Compensate per point vs per scan: per point is accurate for rotating sensors; per scan is cheap and smears fast motion.", "Use wheel odometry vs inertial data for compensation: wheels are smooth and slip on loose surfaces; inertial data is high-rate and drifts, so they are usually combined."],
    p: ["A timestamp offset of a few milliseconds produces a systematic smear that looks like a velocity error.", "Compensation uses the localization output, which jumps on a correction, and the point cloud tears."],
    v: "Drive past a flat wall at speed and turn while scanning; the reconstructed wall in the compensated cloud is flat and straight to within the sensor's noise.",
    dep: ["wheel-odometry", "timestamp-alignment", "pose-estimator"]
  },
  "world-model": {
    s: "The single consistent snapshot of the vehicle's surroundings, with objects, occupancy, lanes, signals and the vehicle's own state, that prediction and planning read.",
    d: "It publishes tracked objects with uncertainty, free-space and occupancy, road structure, signal states and ego pose in one frame and at one timestamp. Providing one view prevents each consumer from reconciling sensors separately and disagreeing. It also holds memory: an object that moved behind a truck still exists. The design question is what to include and how to represent uncertainty, since a clean list of boxes hides the doubt the planner needs. Staleness is a risk, so every element carries its age.",
    k: ["Object list vs raw occupancy as the interface: objects are compact and carry semantics; occupancy is class-agnostic and larger, and robust to misses.", "Single authoritative world model vs per-consumer views: one model is consistent; it is a single point of failure and a coordination bottleneck."],
    p: ["Consumers use data of different ages without noticing, so the planner reasons about a world that no longer exists.", "Uncertainty is dropped at the interface and the planner assumes every box is exact."],
    v: "Subscribe to the model during a drive and verify every element carries a timestamp and uncertainty; inject a one-second stall in tracking and confirm consumers see the age and the planner reacts.",
    dep: ["multi-object-tracker", "occupancy-and-free-space", "road-structure-perception", "pose-estimator", "track-lifecycle"]
  },
  "pose-estimator": {
    s: "Combines satellite positioning, inertial data, wheel motion and map matches into a continuous estimate of the vehicle's position and orientation, with uncertainty.",
    d: "A filter predicts motion from inertial and wheel measurements at high rate and corrects with satellite fixes and map matches when they arrive. It estimates sensor biases as well. The output gives a smooth path without jumps for control and a global position for planning. Each source fails differently: satellite signals bounce off buildings, wheels slip, maps have errors. The filter must weigh these correctly and recognize when the estimate has become unreliable, which is a harder question than producing the estimate.",
    k: ["Loosely coupled vs tightly coupled satellite fusion: loose is modular and easy to debug; tight uses raw measurements and works with few visible satellites.", "Smooth local pose vs globally corrected pose: smooth pose suits control; global pose suits routing, so both are published and consumers choose."],
    p: ["A correction jump from a map match is passed to control as real motion, and the vehicle swerves.", "Bias estimates drift during a long tunnel and degrade the following kilometers."],
    v: "Drive a route with surveyed reference points, including a tunnel and an urban canyon, and compare position error against a reference-grade system; error stays within bounds and the reported uncertainty covers the actual error.",
    dep: ["gnss-receiver", "inertial-measurement-unit", "wheel-odometry", "map-matching", "clock-distribution"]
  },
  "wheel-odometry": {
    s: "Dead-reckons the vehicle's motion from wheel speeds, steering angle and inertial rates when no external fix is available.",
    d: "Wheel ticks give distance and, with steering and yaw rate, heading change. A vehicle model converts them into planar motion. It is smooth and available everywhere, including tunnels. Errors accumulate: tire radius changes with load and pressure, wheels slip on ice or in hard acceleration, and heading drift grows over distance. Slip detection, using disagreement between wheels and inertial sensors, keeps the estimate honest. Odometry is the base layer for compensation and for bridging gaps in other localization sources.",
    k: ["Wheel-based vs inertial-only dead reckoning: wheels bound speed drift and slip; inertial works on any surface and drifts quickly alone.", "Estimate tire radius online vs fixed calibration: online adapts to wear and load; it can absorb real slip as a parameter change."],
    p: ["Tire pressure changes shift scale by one percent, and distances along the map are off after a long tunnel.", "Wheel slip on ice is counted as motion and the vehicle believes it has moved."],
    v: "Drive a straight surveyed 1 kilometer, then a loop with sharp turns without any external fix, and compare final distance and heading error with the reference in dry and wet conditions.",
    dep: ["chassis-sensors", "inertial-measurement-unit", "vehicle-dynamics-model"]
  },
  "map-matching": {
    s: "Aligns live lidar or camera observations with the stored map to find the vehicle's position more precisely than satellite positioning can.",
    d: "Observed features such as lane markings, poles, building edges or a dense point cloud are compared with the map, and the pose that best explains the match is found, starting from the predicted pose. The result is centimeter-level position in the map frame. It degrades where the world has changed or has too little structure, such as an empty highway or a snow-covered road. A good matcher outputs how well-constrained the solution is in each direction, because a straight tunnel constrains lateral position but not longitudinal.",
    k: ["Dense point cloud maps vs sparse landmark maps: dense maps are accurate and large; landmark maps are small and lose information in sparse scenes.", "Match on every cycle vs only when needed: every cycle bounds drift; it consumes compute and can inject jumps from poor matches."],
    p: ["A degenerate scene allows the solution to slide along the road, and longitudinal error grows unnoticed.", "Seasonal change, such as foliage or snow, causes mismatches that the map was never updated to include."],
    v: "Drive the same route in different seasons and weather and report lateral and longitudinal error against surveyed reference points, along with the fraction of time the matcher reports a degenerate constraint.",
    dep: ["hd-map-service", "lidar-sensors", "camera-sensors", "ego-motion-compensation"]
  },
  "hd-map-service": {
    s: "Serves a precise map of lanes, boundaries, signals, signs and rules, with centimeter accuracy and a version, to localization, perception and planning.",
    d: "The map stores lane geometry and connectivity, speed limits, stop lines, signal locations and which signals apply to which lane, plus landmarks for localization. The service loads tiles near the vehicle, checks versions and serves queries by position. The map gives the planner context beyond sensor range and acts as a prior for perception. Producing and updating it is expensive. Its fundamental weakness is that the world changes: a map that is trusted too much causes errors, and one trusted too little is a waste.",
    k: ["Heavy prebuilt maps vs lightweight maps with live perception: heavy maps give safety margin where covered; they limit where the vehicle can go and cost to maintain.", "Onboard storage of regions vs streaming tiles: onboard is robust to network loss; streaming stays current and fails when the network does."],
    p: ["The vehicle uses a map version that predates a lane shift and trusts it over what it sees.", "Tile boundaries introduce small discontinuities that confuse lane-keeping."],
    v: "Check the vehicle's map version against the current one on the route at startup, and load a deliberately outdated tile in a test to verify that the system flags the age and falls back to perception.",
    dep: ["map-change-detection", "secure-boot-and-update"]
  },
  "map-change-detection": {
    s: "Notices where the world no longer matches the map, such as moved lanes or new signs, and reports it for correction and for cautious behavior meanwhile.",
    d: "While driving, perception continuously compares what it sees against map content. Persistent differences, confirmed by several passes or vehicles, produce change reports with location and evidence. The vehicle may immediately trust perception more or reduce speed in the area. Reports feed a map update process with review before publication. The difficulty is distinguishing a real change from a temporary one, such as a parked truck or a work zone, and from a perception error, and doing so with few observations.",
    k: ["Report every difference vs require confirmation: reporting all is fast and noisy; confirmation by several vehicles is reliable and slow.", "Automatic publication vs human review: automatic is current; review prevents a bad update from reaching the whole fleet at once."],
    p: ["A temporary lane closure is published as a permanent change and later has to be reversed.", "A single vehicle with a miscalibrated camera floods the system with false changes."],
    v: "Move a lane marking at a test site and confirm that change reports appear after the stated number of passes, an update is published after review, and vehicles show the new geometry afterward.",
    dep: ["road-structure-perception", "fleet-ingest-pipeline", "hd-map-service"]
  },
  "lane-level-localization": {
    s: "Determines which lane the vehicle is in and its offset within it, a more robust and more directly useful quantity than absolute position.",
    d: "Lane-level position combines the global pose with visible lane markings, curbs and the map lane geometry. Planners care about position relative to lane edges and about the correct lane at a junction more than the coordinates themselves. It tolerates global drift as long as relative position is right. When markings are absent, it falls back to the global pose. Ambiguity on parallel roads and in multi-level interchanges is hard, where a few meters of error can put the vehicle on the wrong road entirely.",
    k: ["Relative-to-markings localization vs global pose with map: relative is accurate where markings exist; global works without them and is coarser.", "Hard lane assignment vs a probability over lanes: a single answer is simple; probabilities reflect uncertainty and need planners that can use them."],
    p: ["On a road with a parallel service road, the vehicle is assigned to the wrong carriageway.", "Worn markings cause a lateral offset error that grows while the system believes it is centered."],
    v: "Drive multi-lane roads, interchanges and a parallel-road section and compare the reported lane against human annotation; the wrong-lane rate and its duration are within the limit.",
    dep: ["pose-estimator", "road-structure-perception", "hd-map-service"]
  },
  "localization-integrity": {
    s: "Checks that the position estimate is trustworthy and tells the rest of the system when it is not, with a bound on possible error.",
    d: "Integrity monitoring compares independent estimates, such as satellite, map matching and odometry, and tests whether they are consistent with each other and with the filter's own uncertainty. It outputs a protection level, a bound that the true error exceeds with a very small probability. If the bound is larger than the lane margin, the planner must slow down or the supervisor degrades the mode. The challenge is detecting slow, consistent drifts and faults that all sources share, such as a bad map version or wrong coordinate frame.",
    k: ["Cross-checking sources vs trusting the filter's covariance: cross-checks catch filter overconfidence; they need truly independent sources.", "Strict integrity limits vs availability: strict limits give a safety guarantee and stop the vehicle in difficult areas."],
    p: ["Both satellite and map matching drift together, and the monitor sees agreement.", "The protection level is computed but never reaches the planner, so it has no effect."],
    v: "Inject a slow satellite drift and a position offset in the map and confirm the monitor reports reduced integrity before the true lateral error exceeds the lane margin.",
    dep: ["pose-estimator", "map-matching", "runtime-monitors"]
  },
  "longitudinal-control": {
    s: "Commands throttle and braking, or an acceleration request, to follow the planned speed profile and keep safe gaps, smoothly and without overshoot.",
    d: "A controller compares planned and measured speed and position, adds feedforward for known road grade and drag, and outputs an acceleration request. The vehicle's powertrain and brakes translate it, with different delays and nonlinearities for acceleration and braking. It has to blend smoothly between the two, avoid limit cycles at low speed, and handle changes in load and slope. In emergencies, it switches to maximum braking. The difficulty is that the actual response varies with temperature, wear and payload, while passenger comfort tolerates little oscillation.",
    k: ["Acceleration request vs torque and pressure commands: acceleration requests are portable and leave details to the vehicle; direct commands give tighter control and tie to one platform.", "Linear feedback with feedforward vs model-predictive control: simple feedback is predictable; predictive control anticipates delays and is harder to verify."],
    p: ["The brake response at very low temperature is slower than modeled, and stops overshoot the line.", "Switching between accelerating and braking at low speed produces a repeated lurching."],
    v: "Run step changes in target speed and stops at set lines with the vehicle empty and loaded; stop position error, overshoot and jerk fall within the specified limits.",
    dep: ["vehicle-dynamics-model", "actuator-delay-compensation", "drive-by-wire-gateway"]
  },
  "lateral-control": {
    s: "Commands steering to keep the vehicle on the planned path, balancing tracking accuracy against smoothness and the limits of the steering system.",
    d: "The controller computes steering from lateral offset, heading error and path curvature, using a kinematic model at low speed and a dynamic one at high speed. Feedforward from curvature does most of the work and feedback removes error. Gains change with speed, since the same steering angle has very different effects at 10 and 100 kilometers per hour. Delay in the steering actuator and path discontinuities are the main trouble. A path jump produces an abrupt steering command, so planners and controllers must agree on continuity.",
    k: ["Geometric path tracking vs model-predictive control: geometric laws are simple and predictable; predictive control handles limits and delay and costs compute and tuning.", "Speed-scheduled gains vs a single model: scheduling covers the range; transitions between gain sets must be checked."],
    p: ["A discontinuity in the planned path leads to a steering spike felt by passengers.", "Gains tuned in dry conditions oscillate on low-friction surfaces."],
    v: "Track a reference path with a double lane change at several speeds; maximum lateral error, steering rate and lateral jerk remain within their limits on dry and wet tracks.",
    dep: ["vehicle-dynamics-model", "actuator-delay-compensation", "drive-by-wire-gateway", "pose-estimator"]
  },
  "vehicle-dynamics-model": {
    s: "A mathematical model of how the vehicle responds to commands, used by control, planning and simulation to predict motion and check feasibility.",
    d: "At low speed, a kinematic bicycle model suffices. At higher speed, tire forces, load transfer and slip matter, so dynamic models with friction limits are used. Parameters such as mass, center of gravity and tire stiffness are identified from test data and may be updated online. The same model appears in planning for feasibility, in control for prediction, and in simulation. Mismatch between model and car is the usual cause of tracking problems, and unknown road friction is the biggest uncertainty.",
    k: ["Simple model vs detailed model: simple models are fast and good enough in normal driving; detailed models matter near the limits of grip.", "Fixed parameters vs online estimation: fixed is stable; online estimation follows load and wear and can drift into wrong values."],
    p: ["The planner assumes a deceleration the car cannot deliver on a wet road.", "A vehicle with a changed payload has a different response, and no one updated the parameters."],
    v: "Drive step steer and braking maneuvers on a test track and overlay the model's predicted yaw rate and speed on measurements; the prediction error stays within the model's declared accuracy.",
    dep: ["vehicle-state-feedback", "chassis-sensors"]
  },
  "actuator-delay-compensation": {
    s: "Accounts for the time between issuing a command and the vehicle responding, predicting ahead so the controller acts on where the vehicle will be.",
    d: "Steering, throttle and brakes respond after tens to hundreds of milliseconds, and the communication path adds more. Ignoring this gives oscillation. The controller estimates total delay and predicts the state forward before computing a command, or uses a model-based predictor. Delays vary by actuator, temperature and bus load. Estimating them online from the command and feedback timestamps keeps the compensation current. The hazard is overcompensation: a wrong delay estimate produces worse tracking than none at all.",
    k: ["Fixed delay constants vs measured delay: constants are simple and verifiable; measurement adapts to variation and depends on trustworthy timestamps.", "State prediction vs gain reduction: prediction keeps performance; reducing gains is simple and sacrifices tracking."],
    p: ["Bus congestion adds delay that the compensator does not know, and steering oscillates.", "The delay is measured once at room temperature, then changes in winter."],
    v: "Command a step in steering and in braking and measure the timestamped response; the actual delay matches the compensator's value, and tracking remains stable when extra delay is injected up to a stated margin.",
    dep: ["vehicle-state-feedback", "timestamp-alignment", "drive-by-wire-gateway"]
  },
  "command-limiting": {
    s: "Constrains the final commands in magnitude and rate so that no software error can ask the vehicle for something unsafe or uncomfortable.",
    d: "Before commands leave the controller, they are clipped to limits on steering angle and rate, acceleration, braking and jerk, which depend on speed and mode. Limits are a last line of defense against a bad plan, a numeric error or a stuck value. They also give comfortable motion. Limit values are derived from vehicle capability and safety analysis. If limits are too tight, the vehicle cannot avoid an obstacle it could have avoided, so emergency modes use a separate, wider set that is activated deliberately.",
    k: ["Limits in software before the interface vs also enforced at the actuator: software limits are easy to change; enforcement in the actuator survives a software failure.", "Single limit set vs mode-dependent limits: one set is simple; modes allow comfort in normal driving and capability in emergencies."],
    p: ["Limits are applied to a stale or overwritten command, and the clipped value is not what was planned.", "Comfort limits remain active during an emergency maneuver and the vehicle cannot avoid the object."],
    v: "Feed a deliberately wild command sequence at the controller input and check that output steering angle, rate and acceleration stay within limits in each mode, and that mode changes apply the new limits within the specified time.",
    dep: ["vehicle-dynamics-model", "system-mode-manager"]
  },
  "system-mode-manager": {
    s: "The state machine that decides whether the system is off, standby, driving, degraded or stopping, and grants or revokes authority to control the vehicle.",
    d: "It combines the requests of the occupant or operator, the readiness of every component, the supervisor's fault assessment and the operating domain. Only legal transitions are allowed, such as driving to degraded to stopped, and each transition is logged. It decides who is in control: the system or a human. Modes must be unambiguous and observable, since confusion about whether the system is active caused real accidents. It needs to be simple enough to verify exhaustively, and it is the heart of the safety argument.",
    k: ["Explicit finite state machine vs distributed mode logic: a single machine can be verified and logged; distributed logic is flexible and can disagree with itself.", "Automatic reversion vs requiring confirmation: automatic fallback is fast; requiring confirmation avoids surprising the occupant and can delay safety action."],
    p: ["Two components each believe they own control during a handover, and commands conflict.", "A rarely used transition has never been exercised and fails the first time it happens."],
    v: "Exhaustively drive the machine through every transition in simulation and on the bench, including faults arriving mid-transition, and confirm each reached state matches the specification and is announced to the occupant.",
    dep: ["runtime-monitors", "fault-management", "operational-design-domain"]
  },
  "runtime-monitors": {
    s: "Checks that run during driving to detect failures and implausible results: timeouts, range violations, disagreement between modules and sensors, and performance outside the trained domain.",
    d: "Monitors look at message timing, value ranges and consistency, for example whether the object list agrees with an independent radar-only view, or whether the planned path respects the map. They also check model input statistics against the training domain. Each monitor has a detection time, a threshold and a defined reaction. Tuning is the problem: too sensitive and the vehicle stops for noise, too loose and a real fault passes. Monitors must be simpler than what they watch, or they fail in the same ways.",
    k: ["Simple plausibility checks vs a second full implementation: simple checks are cheap and independent and catch gross errors; a second implementation catches subtle ones at high cost.", "Monitor every interface vs only critical ones: broad coverage finds more; it creates false alarms and maintenance burden."],
    p: ["A monitor shares code or inputs with the thing it checks, and both fail together.", "Monitor thresholds drift as models change, and no one revisits them."],
    v: "For each monitor, inject its target fault in simulation and on the bench, and confirm detection time and reaction match the specification; run a long clean drive and count false alarms.",
    dep: ["pubsub-middleware", "world-model", "hd-map-service"]
  },
  "fault-management": {
    s: "Collects the detected faults, decides their severity and which functions they affect, and triggers the defined reaction, while recording a diagnostic trace.",
    d: "Each detected fault is classified, timed, debounced and recorded. A table maps fault combinations to effects: a degraded rear radar might only limit lane changes, a failed main computer demands a stop. Persistent faults are stored for service. The component also tracks latent faults, ones that matter only if another failure occurs, by running periodic self-tests. It is hard to cover combinations and to avoid cascades where one fault generates dozens of symptoms and hides the cause.",
    k: ["Static fault tables vs dynamic reasoning: tables can be reviewed and certified; dynamic reasoning handles combinations and is hard to prove.", "Debounce faults vs react immediately: debouncing avoids flickering from noise; immediate reaction shortens the time to a safe state."],
    p: ["One root fault generates many alarms, and the response is chosen for the loudest symptom.", "A latent fault, such as a dead backup channel, goes unnoticed for months."],
    v: "Inject each single fault and a set of chosen pairs; the logged diagnosis names the root cause, the reaction matches the fault table, and the recorded trace contains enough data to reproduce it.",
    dep: ["runtime-monitors", "system-mode-manager"]
  },
  "degradation-strategy": {
    s: "Defines what the vehicle may still do after each kind of failure, such as lower speed, a restricted domain or only a safe stop, instead of treating every fault as total loss.",
    d: "Each function and sensor combination maps to a reduced capability: with one lidar lost, limit speed and stay in lane; with the map unavailable, drive only on roads where perception suffices; with the main planner lost, execute the backup path. Degradation preserves availability while keeping risk bounded. Every degraded mode needs its own validation, which multiplies testing. Passengers and other drivers must also be able to understand what the vehicle is doing, since a vehicle crawling on a highway creates risk of its own.",
    k: ["Graceful degradation vs stop immediately: degradation keeps the service running; stopping is simple and in some places, such as a fast road, is the more dangerous choice.", "Many fine-grained modes vs a few coarse ones: fine modes retain capability; coarse modes are easier to test and explain."],
    p: ["A degraded mode is reachable but has never been tested with real traffic.", "The vehicle degrades to a low speed on a fast road and becomes an obstacle."],
    v: "Disable one sensor at a time in simulation and on a test track and confirm that the vehicle enters the documented reduced mode, with speed and domain limits applied within the required time.",
    dep: ["fault-management", "system-mode-manager", "operational-design-domain"]
  },
  "minimal-risk-maneuver": {
    s: "A pre-planned, simple action, such as slowing in lane or pulling to the shoulder and stopping, that brings the vehicle to the lowest-risk state when the system cannot continue.",
    d: "The maneuver is computed in advance or by a compact backup planner that depends on few components, so that it still works when the main stack fails. It may stop in lane with hazard lights, or find a shoulder or a parking area. It considers speed, road type, traffic behind and occupants. It is the last software defense and is therefore kept intentionally simple. Choosing between stopping in a lane, which is safe from the inside and dangerous from behind, and continuing to a safer place is a hard tradeoff.",
    k: ["Stop in lane vs move to the shoulder: stopping in lane is simple and quick; the shoulder is safer from traffic and needs functioning perception and steering.", "Backup planner on a separate computer vs on the main one: separate survives a computer failure; it costs hardware and has to be kept in sync."],
    p: ["The maneuver was validated for dry roads and fails to stop in time on a wet downhill.", "A stop in the lane of a tunnel creates a larger hazard than continuing to the exit."],
    v: "Trigger the maneuver with a simulated main-computer failure at several speeds and road types; the vehicle stops within the specified distance without collision, with hazard lights on and the incident reported.",
    dep: ["independent-safety-channel", "degradation-strategy", "command-limiting"]
  },
  "independent-safety-channel": {
    s: "A separate, simpler processing path with its own sensors and computer that monitors the main stack and can take over to stop the vehicle.",
    d: "Because a complex learned stack cannot be proven correct, a smaller channel built to a higher integrity level watches for hazards: an emergency braking function working from radar, or a checker of the planned path against an independent occupancy estimate. It can veto commands or command a stop. It must not share failure causes with the main stack: different hardware, power and, ideally, algorithms. Its limits are conservative, so it causes some unnecessary braking, and balancing its false positives is a recurring tuning cost.",
    k: ["Diverse independent channel vs duplicated main stack: diversity avoids common-cause software faults; duplication gives full capability on failure and shares the same bugs.", "Veto only vs able to command a stop: veto-only is safer against false triggers; a stop command handles total loss of the main path."],
    p: ["The safety channel uses the same camera and so shares its blindness.", "Its false positives are high enough that engineers raise its thresholds until it no longer helps."],
    v: "Disable the main planner in a track test with a stopped obstacle ahead; the independent channel brakes and stops within the required distance, using only its own sensors and power.",
    dep: ["radar-sensors", "compute-hardware", "vehicle-state-feedback", "redundancy-and-diversity"]
  },
  "driver-takeover-handover": {
    s: "Manages the transfer of control between the system and a human, with warnings, time budgets and checks that the person is actually ready.",
    d: "When the system leaves its domain, it issues escalating alerts, such as visual, audible and haptic ones, and gives a defined time for the person to take over, while continuing to drive safely. Driver monitoring checks attention. If the person does not respond, the system performs a minimal risk maneuver. The reverse handover, giving control to the system, requires the system to confirm it is ready. People are slow to resume control after being passive, which is the underlying human factors problem; the time budget must be based on measurements, not hope.",
    k: ["Require a human fallback vs design for none: a human fallback is simpler for limited systems; it assumes attention that people do not reliably give.", "Strict driver monitoring vs trust: monitoring keeps the person ready; it frustrates users who then try to defeat it."],
    p: ["A takeover request arrives too late for a person who was looking away to respond.", "The mode display is ambiguous, and the person believes the system is still driving."],
    v: "In a controlled study with representative drivers, measure time to resume control after the alert across distraction states; the distribution meets the budget, and unresponsive drivers lead to a completed stop.",
    dep: ["system-mode-manager", "occupant-hmi", "minimal-risk-maneuver"]
  },
});
