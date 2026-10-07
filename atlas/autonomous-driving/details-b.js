// Details for the autonomous driving plate, part 2: prediction, planning, perception.
ATLAS.details("autonomous-driving", {
  "agent-motion-forecasting": {
    s: "Predicts where each nearby vehicle, cyclist and pedestrian will be over the next several seconds, as a small set of weighted possible trajectories.",
    d: "From each tracked agent's recent history, the map and the surrounding layout, the model outputs several trajectories with probabilities, since a car approaching a junction may go straight or turn. Models are learned from large sets of logged driving and run on every relevant agent each planning cycle. The planner consumes the outputs as predicted occupancy over time. It is hard because behavior is multimodal, depends on other agents, and the cost of a miss is asymmetric: forgetting a rare cut-in matters far more than getting an average path slightly wrong.",
    k: ["Few high-probability modes vs many modes: few modes keep planning fast; they can omit a rare dangerous option.", "Map-conditioned vs map-free prediction: map conditioning respects lanes and rules; it fails when the map is wrong or the agent ignores the road."],
    p: ["Prediction is evaluated by average error and still misses the dangerous low-probability modes.", "Prediction latency grows with the number of agents in dense scenes and starves the planner."],
    v: "On held-out logged drives, measure the fraction of cases where the true future is within the predicted set at 3 and 6 seconds, broken down by agent type and maneuver, including rare cut-ins.",
    dep: ["world-model", "hd-map-service", "intent-classification"]
  },
  "intent-classification": {
    s: "Estimates what an agent is trying to do, such as turning, yielding, parking or crossing, from cues like signals, gaze direction, position and slowing.",
    d: "Intent classes act as a discrete prior for forecasting. Cues include turn indicators, brake lights, lane position, deceleration pattern, and for pedestrians body pose and head orientation. Output is a probability per intent, updated as evidence arrives. Some cues are very informative and unreliable at once: indicators are often wrong or absent. The work is calibrating how much to trust each cue, handling agents with conflicting signs, and not being fooled by an agent that is deliberately or accidentally ambiguous.",
    k: ["Explicit intent labels vs implicit learning inside the forecaster: explicit labels are interpretable and testable; they require labeled data and fix a taxonomy that may be wrong.", "Using appearance cues vs motion only: appearance gives early evidence; it depends on perception quality and is poor at distance."],
    p: ["A turn signal left on is treated as a firm intent and the vehicle waits needlessly or turns into a gap.", "Pedestrian pose estimation fails in low light, and intent defaults to the safe-looking choice of staying put."],
    v: "Measure, on labeled clips, how many seconds before the maneuver the correct intent reaches a stated probability, and check calibration so that reported 70 percent events happen about 70 percent of the time.",
    dep: ["multi-object-tracker", "camera-object-detection"]
  },
  "interaction-aware-prediction": {
    s: "Predicts agents' futures jointly with the vehicle's own possible plan, so that how others would react to the vehicle's actions is part of the forecast.",
    d: "Independent forecasts ignore that a driver will brake when the vehicle merges. Interaction-aware methods condition predictions on the candidate ego trajectory or model the scene as a game, producing different futures per ego choice. The planner can then weigh a merge that triggers a hard brake behind it. Cost is the main problem: conditioning multiplies prediction runs by the number of candidates. Validation is also hard, because logged data only shows reactions to what the human driver did, not to the plan being evaluated.",
    k: ["Conditioned on ego plan vs independent of it: conditioned predictions allow negotiation and avoid overcaution; independent ones are cheaper and easier to verify.", "Learned interaction model vs game-theoretic model: learned models reflect real behavior; game models are explainable and degrade out of distribution."],
    p: ["The vehicle relies on others yielding, and the prediction is wrong for one assertive driver.", "Counterfactual predictions cannot be checked against logs, so errors are found only on the road."],
    v: "In simulation with reactive agents, compare predicted responses to alternative ego plans against the simulated agents' actual responses, and confirm that errors stay inside the safety margin the planner assumes.",
    dep: ["agent-motion-forecasting", "trajectory-generation"]
  },
  "occupancy-forecasting": {
    s: "Predicts which regions of space will be occupied over time, without committing to individual objects, so that unclassified or partly seen things are still avoided.",
    d: "Rather than predicting per-object trajectories, the model outputs a grid or volume of occupancy probabilities at future times. It handles things that detection fails on: debris, strange vehicles, crowds. It can also include areas that are hidden from sensors, with a prior that something could appear. The planner checks candidate trajectories against it directly. The drawback is that without object identity it loses cues such as agent type, and probabilities for far-off times become blurred, which can make the planner timid in crowded scenes.",
    k: ["Occupancy grids vs object trajectories: grids are class-agnostic and robust to detection gaps; objects carry richer semantics and give sharper predictions.", "Predicting hidden regions vs ignoring them: modeling occlusion avoids surprises at blind corners; it can slow the vehicle for risks that do not exist."],
    p: ["Blurred far-future occupancy makes every lane look partly blocked and the vehicle stops for no reason.", "Grid resolution is too coarse to see a narrow gap that a human would use safely."],
    v: "Replay a drive with an unclassified object, such as a fallen load, and confirm that predicted occupancy keeps the region blocked in the planner's input while no detection of that class exists.",
    dep: ["occupancy-and-free-space", "world-model"]
  },
  "prediction-uncertainty": {
    s: "Quantifies how unsure the predictions are, so that the planner can keep larger margins when forecasts are poor and tighter ones when they are sharp.",
    d: "Uncertainty arises from the agent's genuine unpredictability and from model ignorance in unfamiliar scenes. Methods include mode probabilities, predicted spreads, ensembles and distance-to-training-data scores. The planner turns that into margins or conservative speed limits. Calibration is the core problem: stated confidence must match observed frequency, including on new roads. A system that is overconfident takes risks, and one that is underconfident cannot drive in traffic, so thresholds need constant tuning against real logs.",
    k: ["Ensembles vs a single model with uncertainty output: ensembles are better calibrated and multiply compute; a single model is cheap and often overconfident.", "Reporting epistemic uncertainty vs only aleatoric spread: reporting model ignorance catches unfamiliar scenes; it is hard to measure and easy to misuse as a false alarm."],
    p: ["Uncertainty is not propagated to the planner, so it is computed and ignored.", "A confidence score that was calibrated on one city is meaningless in a new one."],
    v: "Plot predicted confidence against observed hit rate on a held-out set from a new region; the curve lies near the diagonal, and low-confidence cases visibly increase planner margins in a replayed run.",
    dep: ["agent-motion-forecasting", "uncertainty-propagation"]
  },
  "route-planning": {
    s: "Finds a sequence of roads and lanes from the current position to the destination, choosing among options by distance, time, rules and the vehicle's domain.",
    d: "A graph search on the road network picks a route, considering travel time, traffic, turn costs, restricted roads and which segments the system can drive. It also yields lane-level guidance, such as which lane to be in for an upcoming exit. The route is recomputed when blocked or when the vehicle deviates. Difficulty comes from out-of-date maps, closures, and the driving system's own limits: the fastest route may pass through an unprotected turn that it handles poorly, so cost functions include capability, not only distance.",
    k: ["Fastest route vs easiest-to-drive route: fastest saves time; easier routes avoid hard maneuvers and cut intervention risk.", "Plan once vs replan continuously: continuous replanning adapts to closures; it can oscillate and confuse passengers and other drivers."],
    p: ["A route is computed through a segment outside the allowed domain, and the vehicle must stop partway.", "Replanning flips between two similar routes and causes repeated last-minute lane changes."],
    v: "Close a segment of the test map during a drive and confirm a new valid route appears within a bounded time, avoiding the closure and every excluded road.",
    dep: ["hd-map-service", "operational-design-domain", "pose-estimator"]
  },
  "behavior-planning": {
    s: "Chooses the next high-level maneuver, such as follow, change lanes, yield, overtake or stop, based on the route, rules and predicted behavior of others.",
    d: "The behavior layer runs a decision procedure, typically a state machine, a search over maneuvers or a learned policy with checks, at a few hertz. It reads the world model, predictions and route, and issues a decision plus constraints for the trajectory planner: target lane, speed limit, stop line. It must be decisive and stable. Hard cases are negotiated merges, unprotected turns and construction zones, where rules conflict with what other drivers do and a rigid rulebook produces a stalled vehicle.",
    k: ["Rule-based vs learned decision making: rules can be audited and certified; learned policies handle messy negotiation and are harder to bound.", "Hierarchical decisions vs a single combined planner: hierarchy is modular and fast; it cannot trade maneuver choice against trajectory quality in one search."],
    p: ["The vehicle oscillates between two decisions, such as overtaking and following, and passengers feel hesitation.", "A decision rule tuned for one road type produces dangerous commitment in another."],
    v: "Run the same merge scenario with ten different traffic gap sequences in simulation. The vehicle merges when a safe gap exists, waits when none does, and never changes its decision more than once per gap.",
    dep: ["route-planning", "traffic-rule-engine", "world-model", "agent-motion-forecasting"]
  },
  "traffic-rule-engine": {
    s: "Encodes road rules, such as right of way, speed limits, stop lines and lane use, in a form the planner can check each candidate against.",
    d: "Rules from regulation and local custom are turned into constraints on states and trajectories: a stop line is a point to reach at zero speed, a no-entry sign removes a lane from the graph. The engine uses map information and live perception of signals and signs and evaluates which rules apply at the current place. Real roads need exceptions, such as crossing a solid line to avoid a stopped vehicle, so rules carry priorities. Rules differ by region, change, and are ambiguous, which is why they are a data-driven component and not hard-coded.",
    k: ["Hard rules vs weighted soft rules: hard rules are predictable and provably followed; soft rules permit sensible exceptions, and make behavior less legible.", "Rules in map data vs rules observed by perception: map rules are stable and early; they go stale, while perception is current and fallible."],
    p: ["A missing speed limit in the map leads to a default that is wrong for the road.", "Strict rule compliance causes the vehicle to block traffic where local practice differs."],
    v: "Drive a test route containing each rule type in simulation and on a track, and confirm the logged rule evaluation matches an independent human annotation at each instance.",
    dep: ["hd-map-service", "traffic-signal-recognition", "world-model"]
  },
  "trajectory-generation": {
    s: "Produces candidate paths and speeds for the next several seconds that satisfy the behavior decision and the vehicle's physical limits.",
    d: "Given the target maneuver and constraints, the generator creates smooth candidates by sampling, optimization or a learned model, for example a family of lateral offsets and speed profiles in the lane's coordinate frame. Each candidate respects curvature, acceleration and jerk limits. It runs at around 10 hertz, and the best candidate from the previous cycle is a warm start for stability. The problem is covering enough variety without producing so many options that scoring cannot finish within the cycle time.",
    k: ["Sampling-based vs optimization-based generation: sampling is robust and parallel; optimization produces smoother, better-tuned trajectories but can fail to converge.", "Fixed-horizon vs adaptive-horizon planning: fixed horizons are simple; adaptive ones plan longer at highway speed and shorter in tight spaces."],
    p: ["Candidates are generated in a frame that distorts at tight curves, and tracking error appears.", "The optimizer fails silently on a hard case and returns the previous plan, which is now stale."],
    v: "Feed a scene with known obstacles and confirm every candidate emitted is dynamically feasible, checked by simulating the vehicle model along it, and that a feasible one exists whenever a human driver could pass.",
    dep: ["behavior-planning", "vehicle-dynamics-model", "speed-profile-planning"]
  },
  "candidate-scoring": {
    s: "Ranks candidate trajectories by safety, comfort, progress and rule compliance, and selects one, rejecting any that violate hard constraints.",
    d: "Each candidate is checked against hard constraints first: collisions, rule violations, dynamic limits. The survivors get a weighted cost of progress toward the goal, comfort, smoothness, distance to others, and consistency with the last choice. The lowest-cost candidate is chosen. Weights encode the vehicle's personality and must be tuned jointly across many scenarios. A small change in one weight can shift behavior everywhere, and a learned cost can hide why a plan was preferred, which complicates incident analysis.",
    k: ["Hand-tuned cost vs learned cost: hand-tuned is understandable and brittle; learned reflects human preference and is hard to explain or bound.", "Hard constraints vs penalties: hard constraints give guarantees; penalties let the planner trade small violations when nothing is feasible."],
    p: ["No candidate passes the hard checks, and the planner has no defined behavior for that case.", "A cost tweak improves one scenario and quietly worsens another that is not in the regression set."],
    v: "Run the full scenario library before and after a weight change and review the per-scenario difference report. Every regression is explained or the change is rejected.",
    dep: ["trajectory-generation", "planner-collision-checking", "traffic-rule-engine", "prediction-uncertainty"]
  },
  "planner-collision-checking": {
    s: "Tests whether a candidate trajectory would hit any observed or predicted object, with margins for uncertainty, over the vehicle's actual shape.",
    d: "The vehicle footprint is swept along the trajectory over time and compared with objects at their predicted positions and with the occupancy grid. Margins grow with prediction uncertainty and speed. Checking is called thousands of times per cycle, so it uses simplified shapes, spatial indexes and early exits. It must be conservative but not so much that narrow streets are impassable. Exactness matters: a bug here is a direct route to a collision, so it is a prime target for independent verification.",
    k: ["Simple circles vs exact polygons: circles are fast and over-approximate; polygons permit tight passing and cost more per query.", "Single margin vs uncertainty-scaled margin: scaled margins adapt to risk; they make the planner's behavior vary with perception quality."],
    p: ["Checking ignores the vehicle's trailer or mirrors, and clearances are overestimated.", "Time discretization is too coarse, so a fast object passes through a path between two sampled instants."],
    v: "Run a suite of geometry cases, including grazing contacts and fast crossers at the discretization limit, and confirm each is classified the same as a high-resolution reference check.",
    dep: ["world-model", "occupancy-forecasting", "agent-motion-forecasting"]
  },
  "speed-profile-planning": {
    s: "Chooses how fast to travel along a path over time, slowing for curves, other agents, junctions and comfort limits.",
    d: "With the path fixed, the speed profile is a one-dimensional problem in distance and time. It respects legal limits, lateral acceleration in curves, braking for stops, gaps behind other vehicles and reduced visibility. Separating path and speed makes each simpler and faster. It cannot capture cases where swerving would be better than braking, which a joint planner would find. Smooth, early braking reads as confident to passengers and other drivers, and last-second braking reads as a fault.",
    k: ["Separate path and speed planning vs joint planning: separate is fast and tractable; joint finds solutions the decoupled problem cannot.", "Comfort-optimal braking vs minimum-time braking: comfort feels smooth; emergency cases need the harder limit and a clear switch between them."],
    p: ["The profile slows for a curve using a stale friction estimate, then understeers in rain.", "Speed is planned for the predicted gap, and the vehicle brakes late when the lead car brakes harder."],
    v: "Drive a closed course with varying curvature and a braking lead vehicle; peak lateral acceleration, jerk and following gap stay inside their specified limits across all runs.",
    dep: ["vehicle-dynamics-model", "traffic-rule-engine", "world-model"]
  },
  "low-speed-and-parking-planner": {
    s: "Plans precise maneuvers at walking speed, such as parking, depot movements, tight turns and reversing, where geometry matters more than traffic prediction.",
    d: "At low speed, the vehicle plans through cluttered space using search over feasible arcs, including reversing and multi-point turns, and tracks with high precision. It relies on short-range sensors, dense occupancy and a tight footprint model. Behavior toward pedestrians and other parked vehicles is cautious. The difficulties are map-less spaces, narrow clearances measured in centimeters, and sensor blind spots close to the body, where nothing may be visible at the moment of contact.",
    k: ["Search-based planning vs optimization: search handles clutter and cusp points reliably; optimization yields smoother motion and needs a good initial guess.", "Rely on the map vs on live sensing: maps give lot layouts; live sensing handles changes and fails when markings are missing."],
    p: ["A low obstacle, such as a curb or a child's toy, sits in a sensor blind zone and is never seen.", "The planner fails to terminate in a tight space and keeps making micro-adjustments."],
    v: "Park in a set of marked and unmarked spaces with controlled clearances; success means the final pose is within the required tolerance and the minimum measured clearance never goes below the safety limit.",
    dep: ["occupancy-and-free-space", "vehicle-dynamics-model", "planner-collision-checking"]
  },
  "camera-object-detection": {
    s: "Finds and classifies vehicles, people, cyclists and other objects in camera images and estimates their position, size and heading.",
    d: "A neural network processes each frame, or a stack of frames, and outputs boxes or full 3D objects with class and confidence. Distance from a single camera is inferred from learned cues and geometry, which gets less accurate far away. Cameras give color, texture and fine semantic detail that lidar lacks. They suffer from glare, darkness, lens dirt and motion blur. The hard parts are long-tail objects, partial occlusion, and keeping latency low across many cameras at once.",
    k: ["Per-camera detection then fusion vs joint multi-camera networks: per-camera is modular and fails gracefully; joint networks reason across views and are harder to test.", "Large model vs small model: large models find rare classes; small ones fit the latency and thermal budget."],
    p: ["Detection works on common vehicles and misses an unusual one, such as a tilted forklift.", "A model trained on one camera's optics degrades when the lens or mounting changes."],
    v: "Evaluate on a labeled set stratified by range, lighting and occlusion, and report recall for pedestrians at the stopping distance for the maximum speed in the operating domain.",
    dep: ["camera-sensors", "intrinsic-calibration", "inference-runtime", "bev-feature-backbone"]
  },
  "point-cloud-detection": {
    s: "Detects and measures objects directly in lidar point clouds, giving accurate 3D position, extent and orientation independent of lighting.",
    d: "The sparse points are organized into voxels or pillars, or processed as range images, and a network predicts 3D boxes with class. Because the measurement is geometric, distance and size are accurate. Points thin out with range, small or dark objects reflect little, and rain or dust create false returns. Accumulating several scans improves density but needs motion compensation. The main challenges are distant small objects, classification from shape alone, and consistency between lidar and camera detections of the same thing.",
    k: ["Voxel networks vs range-image networks: voxels preserve 3D structure and use more memory; range images are fast and distort geometry.", "Single scan vs accumulated scans: accumulation gives density and velocity cues; it adds latency and motion errors."],
    p: ["Spray from a truck produces phantom objects that trigger braking.", "Distant pedestrians have a handful of points and are detected too late for the speed."],
    v: "Measure detection range for a pedestrian-sized target at fixed distances in clear weather and in controlled rain, and compare against the range required by the stopping distance.",
    dep: ["lidar-sensors", "ego-motion-compensation", "inference-runtime", "bev-feature-backbone"]
  },
  "radar-target-processing": {
    s: "Turns radar signals into a list of moving and stationary targets with range, direction and direct velocity measurement, working through rain, fog and darkness.",
    d: "Raw signals go through frequency transforms to produce range and Doppler maps, detection thresholds adapt to clutter, and angle estimation uses several antennas. The output includes direct radial velocity, which no other sensor provides. Resolution in angle is poor, so shape is crude and separate objects can merge. Multipath reflections from guardrails and tunnels create ghost targets, and stationary objects are hard to tell from the road infrastructure. Newer imaging radar adds elevation and denser returns.",
    k: ["Classical thresholding vs learned detection on raw data: classical is explainable and tunable; learned uses subtle patterns and needs large labeled radar data.", "Filtering out stationary targets vs keeping them: filtering reduces clutter and false braking; it risks dropping a stopped car on the road."],
    p: ["A metal sign overhead is reported as an obstacle and causes sudden braking.", "Two close vehicles merge into one target, and one is missed during a cut-in."],
    v: "Drive toward a stopped vehicle, a bridge and a manhole cover at the same speeds, and verify the stopped vehicle is reported at the required range while the bridge and cover are not.",
    dep: ["radar-sensors", "ego-motion-compensation", "clock-distribution"]
  },
  "road-structure-perception": {
    s: "Finds lane boundaries, lane centers, curbs, road edges and crosswalks from sensors, and how lanes connect, so the vehicle can drive with or without a map.",
    d: "Networks predict lane lines and road edges in the vehicle frame, and often a lane graph with connectivity at junctions. The output corrects or replaces the map when the road has changed or no map exists, and it anchors localization to the lane. Faded paint, snow, glare and construction zones with conflicting markings break it. The key decision is how to resolve disagreement between live perception and the map, which is in practice a safety-relevant arbitration with no obvious winner.",
    k: ["Perception-first vs map-first road knowledge: perception-first works anywhere and is noisy; map-first is clean and fails when the world changes.", "Predict lane lines vs predict a lane graph: lines are simple to label; a graph captures connectivity at junctions and is much harder to annotate."],
    p: ["Temporary construction lines are ignored in favor of old paint under them.", "Perception and map disagree and the system flips between them, shifting the lane center."],
    v: "Drive through a work zone with shifted lanes and compare the lane center the system used against a surveyed reference; lateral error stays below the lane half-width margin along the whole zone.",
    dep: ["camera-sensors", "lidar-sensors", "bev-feature-backbone", "hd-map-service"]
  },
  "traffic-signal-recognition": {
    s: "Detects traffic lights and signs, reads their state and meaning, and associates each with the lane it governs.",
    d: "Small, distant lights need high-resolution cameras and a narrow field of view, plus a model to find and classify their state, including arrows and flashing modes. The harder part is association: knowing which of several lights applies to the vehicle's lane, usually with the help of the map's recorded light positions. Signs are read for speed limits and restrictions. Sun glare, LED flicker aliasing with the shutter, occlusion by trucks and unusual signals such as police hand directions are the failure modes.",
    k: ["Map-assisted light lookup vs pure perception: the map tells where to look and which lane is governed; stale maps cause confident wrong associations.", "One long-range camera vs several: a single narrow camera is efficient; several cover wide intersections and need synchronization."],
    p: ["LED flicker makes a green light appear off in some frames, and the vehicle stops.", "A light facing a different road at an angled junction is associated with the vehicle's lane."],
    v: "Drive a set of intersections at varied times, including sun-facing approaches, and compare the system's recognized state and lane association at every approach against human annotation, with misses broken down by cause.",
    dep: ["camera-sensors", "hd-map-service", "hardware-triggering"]
  },
  "occupancy-and-free-space": {
    s: "Estimates which parts of the surrounding volume are occupied, empty or unknown, without needing to name what the occupying thing is.",
    d: "A network or geometric fusion produces a grid or voxel map around the vehicle with occupied, free and unknown states and sometimes velocity. This catches objects detection has no class for, and gives the planner a direct view of drivable space, including vegetation and overhangs. The unknown state matters: a hidden area is not a free one. Challenges are resolution versus memory, handling reflective or transparent surfaces, and distinguishing a drivable puddle or low debris from a hazard.",
    k: ["Dense learned occupancy vs geometric grids from lidar: learned fills in from cameras and generalizes; geometric is exact where measured and sparse elsewhere.", "Two-dimensional vs three-dimensional occupancy: 2D is cheap and misses overhangs; 3D handles bridges and low branches at much higher cost."],
    p: ["Unknown space is treated as free after a sensor dropout, and the planner drives into it.", "Vapor or exhaust plumes are marked occupied and the vehicle brakes."],
    v: "Place a set of unclassified obstacles of known size and height on the road and verify each is marked occupied from the stopping distance, then check that a covered but free road region remains marked free.",
    dep: ["lidar-sensors", "camera-sensors", "bev-feature-backbone", "ego-motion-compensation"]
  },
  "bev-feature-backbone": {
    s: "A shared neural network that converts every sensor's data into one top-down feature map that detection, lane and occupancy heads all read from.",
    d: "Camera features are lifted into a common bird's-eye frame using depth estimates or attention, and lidar and radar features are projected into the same grid. Task heads for objects, lanes and occupancy share it, saving compute and giving them a consistent view. It makes coupling strong: changing the backbone alters every downstream output. It needs accurate calibration and timing, and deals badly with sensor failure unless trained for missing inputs. Memory and latency often constrain how large the grid can be.",
    k: ["One shared backbone vs separate networks per task: sharing saves compute and aligns outputs; it couples release schedules and failure modes.", "End-to-end learned fusion vs late fusion of detections: early fusion uses more information; late fusion is modular and degrades gracefully."],
    p: ["A small calibration error shifts features and every head degrades together.", "The network was never trained with a camera missing, and one failed sensor corrupts all outputs."],
    v: "Disable each sensor in turn on a held-out set and record the change in detection and occupancy accuracy. The loss is bounded and matches the degradation the supervisor assumes.",
    dep: ["extrinsic-calibration", "timestamp-alignment", "inference-runtime"]
  },
  "perception-confidence": {
    s: "Attaches a calibrated reliability estimate to each perception output, including a measure of whether the scene is outside what the models were trained for.",
    d: "Confidence combines the network's own scores, agreement across sensors and models, image quality indicators such as blur or blockage, and out-of-distribution detectors. Downstream components use it to widen margins, discard weak detections or reduce speed. Raw network scores are poorly calibrated, so calibration is fitted on held-out data. The deeper problem is that a model can be confidently wrong on exactly the unfamiliar input that matters, which is why independent cross-checks matter more than a single score.",
    k: ["Network-reported scores vs cross-sensor agreement: scores are free and often overconfident; agreement is independent evidence and fails when sensors share a blind spot.", "Per-object confidence vs scene-level confidence: per-object drives detection thresholds; scene-level triggers the vehicle to slow down in poor conditions."],
    p: ["Confidence is high for a hallucinated object, and the system brakes hard with full certainty.", "Threshold set on a clean dataset suppresses real detections in heavy rain."],
    v: "On a dataset including rain, glare and lens blockage, plot detection precision against confidence bins and check that the low-confidence bins are where errors concentrate, and that blocked-camera cases are flagged.",
    dep: ["camera-object-detection", "point-cloud-detection", "radar-target-processing"]
  },
});
