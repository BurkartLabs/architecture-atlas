// Details for the autonomous driving plate, part 1: fleet learning, simulation, safety assurance.
ATLAS.details("autonomous-driving", {
  "onboard-log-recorder": {
    s: "Writes sensor data, internal messages and vehicle state to local storage with consistent timestamps, so any moment of a drive can be reconstructed later.",
    d: "The recorder subscribes to raw sensor streams, intermediate results and the final commands, then writes them to a ring buffer and a log file on fast local storage. Compression and storage speed set what can be kept: uncompressed camera and lidar streams exceed disk bandwidth. Each message carries a hardware timestamp so streams can be aligned offline. It must not steal CPU or memory bandwidth from the driving stack, and it must survive power loss with the last seconds intact, since those are the most valuable.",
    k: ["Record raw sensor data vs only the outputs: raw data lets a new model be re-run on old drives; storage and upload costs rise steeply.", "Lossless vs lossy video compression: lossy saves bandwidth and storage; artifacts can change how a perception model behaves on replayed data."],
    p: ["Recorder load causes dropped frames in the live stack, so the logged drive is not the drive that happened.", "A power cut loses the final seconds before a crash because the buffer was not flushed."],
    v: "Pull the power during a test drive, then open the log: it ends within a fraction of a second of the cut, with no gaps and monotonic timestamps on every stream.",
    dep: ["pubsub-middleware", "timestamp-alignment", "compute-hardware"]
  },
  "event-triggers": {
    s: "Rules and small models running on the vehicle that decide which moments of a drive are worth saving and uploading, such as hard braking, disagreement between modules or rare objects.",
    d: "Uploading everything is impossible, so the vehicle evaluates conditions continuously: harsh deceleration, a driver override, a large disagreement between the planner and a human-driven shadow path, low perception confidence, a rare object class, or a fault. When one fires, a window of buffered data around it is tagged and queued. Triggers are updated remotely as the fleet team learns what it needs. The difficulty is coverage: a trigger that is too loose floods the pipeline, and one that is too tight misses exactly the unusual case nobody anticipated.",
    k: ["Hand-written rules vs learned novelty detectors: rules are predictable and auditable; learned detectors find unanticipated cases but are harder to tune and explain.", "Local decision vs upload everything to filter in the cloud: local saves bandwidth; it permanently loses whatever the trigger rejected."],
    p: ["A trigger tuned on one region fires constantly in another and exhausts the upload budget.", "Triggers never fire for the failure that matters because it produced no visible symptom."],
    v: "Replay a logged drive containing a known hard stop through the trigger set and confirm the expected window is saved, with the correct pre-roll, and that a calm drive saves nothing.",
    dep: ["onboard-log-recorder", "runtime-monitors", "perception-confidence"]
  },
  "fleet-ingest-pipeline": {
    s: "Moves selected drive data from vehicles into cloud or depot storage, then indexes, deduplicates and makes it searchable by scenario, location and conditions.",
    d: "Data leaves the vehicle over cellular links or at the depot over wired networks, is verified, decoded and registered in a catalog with metadata: time, place, weather, software version, triggers fired. Engineers and automated jobs query the catalog for, say, every unprotected left turn at dusk. The pipeline must handle many formats across software versions, privacy rules for faces and plates, and retention limits. Volume is the hard part: petabytes a month, most of it never looked at.",
    k: ["Upload over cellular vs wait for depot: cellular gives fast feedback on a failure; depot offload is cheaper and carries full-fidelity data.", "Anonymize at ingest vs on request: early removal limits exposure; it destroys detail that some later analysis would need."],
    p: ["Log format changes between software versions silently break old data, so old drives cannot be replayed.", "Metadata errors make the catalog confident but wrong, and rare scenarios become unfindable."],
    v: "Upload a drive from a test vehicle and find it within minutes through a query on its conditions; then decode it with the matching software version and compare checksums with the vehicle copy.",
    dep: ["onboard-log-recorder", "event-triggers"]
  },
  "auto-labeling": {
    s: "Produces object boxes, lanes and other ground truth for recorded drives using large offline models and the benefit of seeing the future, then has humans check the uncertain cases.",
    d: "Offline, labeling can use what the live system cannot: looking forward and backward in time, combining all sensors, running models too heavy for the vehicle, and refining tracks across a whole sequence. The result is ground truth that is cheaper than purely manual annotation. Humans review a sample and the low-confidence cases, and their corrections go back into training. The problem is bias: the auto-labeler's mistakes become the student model's mistakes, and nobody notices because both agree.",
    k: ["Fully manual vs model-assisted labeling: manual is accurate and slow; assisted scales to millions of frames but inherits the labeler's blind spots.", "Label each frame vs whole sequences: sequence labeling gives consistent tracks and velocities; it needs the entire clip and more compute."],
    p: ["Label errors correlate with model errors, so evaluation scores look good while real behavior is poor.", "Annotation guidelines drift between labeling batches, producing inconsistent class definitions."],
    v: "Take a sample of auto-labeled frames, have independent humans label them blind, and measure agreement per class. The agreement meets the target set for training data.",
    dep: ["fleet-ingest-pipeline", "extrinsic-calibration"]
  },
  "model-training-pipeline": {
    s: "The reproducible workflow that turns labeled data into trained perception and prediction models, evaluates them against fixed test sets and packages them for the vehicle.",
    d: "Datasets are versioned, split so that test scenes never appear in training, and fed to distributed training jobs. Evaluation covers aggregate accuracy and slices such as night, rain, distant objects and rare classes. A candidate model is then compiled and quantized for the onboard runtime, and its accuracy and latency are measured again, since compression changes behavior. The hard parts are reproducibility, catching regressions in slices the headline metric hides, and keeping the training stack in line with what actually runs in the car.",
    k: ["One large shared model vs many task-specific models: sharing saves compute onboard; coupling makes one team's change risk everyone's results.", "Continuous retraining vs scheduled releases: continuous retraining follows new data quickly; it makes each model harder to certify and compare."],
    p: ["A model scores better offline but regresses after quantization on the vehicle.", "Test data leaks into training through near-duplicate frames from the same drive."],
    v: "Retrain from the recorded dataset version and seed, and confirm the evaluation numbers match the stored run within noise; run the packaged model on the vehicle runtime and compare outputs with the reference.",
    dep: ["auto-labeling", "inference-runtime", "validation-metrics"]
  },
  "shadow-mode-evaluation": {
    s: "Runs a new software or model version on real vehicles without letting it control them, and compares its decisions with what the driver or the released stack did.",
    d: "A candidate planner or model executes in parallel on production data, its outputs logged but never sent to the actuators. Differences from the human driver or the active stack are flagged and reviewed. This gives realistic exposure at fleet scale before any risk is taken. It cannot show how the world would respond to the candidate's actions, since the vehicle did something else, and it consumes onboard compute that must be reserved. Interactions, such as other drivers reacting to a different plan, are invisible.",
    k: ["Shadow mode vs closed-loop simulation: shadow uses real sensing and real traffic; it cannot test consequences of its own actions.", "Compare with the human driver vs compare with the current stack: humans give independent reference; they are inconsistent, and disagreement does not always mean error."],
    p: ["Shadow compute competes with the live stack and causes latency spikes only seen on the fleet.", "Disagreements are counted as errors, burying real problems under benign differences in style."],
    v: "Run a candidate in shadow across a defined fleet slice for a set mileage, confirm zero effect on live latency, and review a sample of the flagged disagreements with their logged context.",
    dep: ["onboard-log-recorder", "compute-hardware", "validation-metrics"]
  },
  "scenario-library": {
    s: "A catalog of parameterized driving situations, drawn from real drives, accidents and engineering judgment, against which every release is tested.",
    d: "Each scenario names a road layout, actors and their behavior, and a pass criterion. Scenarios come from mined real events, regulations and crash databases, and are expanded by varying speeds, distances and timing into thousands of concrete tests. The library is organized by operational domain and tagged by hazard so coverage can be reported. It is hard to keep honest: the set only covers what someone thought of, and a library that is never pruned makes every release slower to validate.",
    k: ["Real-event scenarios vs synthetic ones: real events are plausible and unbiased by imagination; synthetic ones reach rare and dangerous cases no one has recorded.", "Fixed regression set vs growing library: a fixed set gives comparable history; growth catches new failures but changes the baseline."],
    p: ["Parameter ranges are too narrow, so the vehicle passes every scenario and still fails at a slightly different speed.", "Scenarios from one city dominate and the library under-represents others."],
    v: "Report scenario coverage against the declared operating domain, and show that a deliberately injected planner defect causes at least one scenario in the library to fail.",
    dep: ["scenario-description-language", "operational-design-domain", "fleet-ingest-pipeline"]
  },
  "scenario-description-language": {
    s: "A formal format for writing scenarios so the same description can run in different simulators, on test tracks and in coverage reports.",
    d: "A scenario file defines the map, actors, their initial states, maneuvers and triggers, plus parameter ranges and success conditions. Because it is a standard format rather than simulator code, scenarios can be shared across teams and with regulators, checked for validity and automatically combined. Translators map the description into a specific simulator or a physical test-track sequence. It is hard to express behavior precisely without over-constraining: actors that follow an exact script cannot react to the vehicle, which makes the test unrealistic.",
    k: ["Declarative scenarios vs scripted code: declarative files are portable and analyzable; complex behavior becomes awkward to describe.", "Scripted actors vs reactive actors: scripts give repeatable stimulus; reactive actors give realism, and make the test depend on the system under test."],
    p: ["Two simulators interpret the same file differently, so results are not comparable.", "Open-ended parameter ranges generate invalid scenarios, such as impossible overlaps, that waste compute."],
    v: "Run the same scenario file in two simulators and on a test track, and confirm the actors' trajectories agree within a stated tolerance.",
    dep: ["hd-map-service"]
  },
  "log-replay-resimulation": {
    s: "Feeds recorded sensor data back through the software to see what the current version would have done, either open-loop or with its own commands changing the replay.",
    d: "In open-loop replay, a recorded drive is played into a new build and its outputs are compared with the original, which is excellent for perception and localization regressions. For planning, pure replay is misleading, because the recorded world does not respond to a different decision. Resimulation therefore re-renders or edits the scene as the vehicle diverges. It requires exact timestamps, matching software versions and deterministic execution so that a difference can be attributed to the change.",
    k: ["Open-loop replay vs closed-loop resimulation: open-loop is exact and cheap; it cannot show the effect of a different action.", "Replay on desktop machines vs on target hardware: desktop is parallel and cheap; it hides timing and numerical differences found on the vehicle."],
    p: ["Non-deterministic components produce different outputs on each replay, so regressions cannot be isolated.", "Replay diverges silently once the new plan departs from the recorded path, and the results after that point are meaningless."],
    v: "Replay one logged drive twice through the same build and diff the outputs: they are bit-identical. Then replay through a new build and obtain a per-module list of changed outputs.",
    dep: ["onboard-log-recorder", "determinism-and-replayability", "timestamp-alignment"]
  },
  "closed-loop-simulation": {
    s: "Runs the whole driving stack inside a simulated world where the vehicle's commands move it and other agents react, so consequences of decisions can be judged.",
    d: "A simulator provides the map, the ego vehicle's dynamics, other actors and weather, and exchanges messages with the real software through the same interfaces as the vehicle. The loop is stepped on a simulated clock, so runs go faster or slower than real time and can be parallelized across thousands of machines. Pass criteria such as no collision, comfort limits and rule compliance are checked automatically. Fidelity is the constant tension: a fast simple model misses real behavior, a precise one is too slow for the volume that safety claims need.",
    k: ["High-fidelity vs abstract simulation: high fidelity exercises perception end to end; abstract runs orders of magnitude faster for planning tests.", "Synchronous stepping vs real-time operation: stepping makes runs repeatable; real-time operation exposes scheduling and latency issues stepping hides."],
    p: ["The vehicle passes in simulation because the simulated dynamics are more forgiving than the real car.", "Simulated pedestrians behave too politely, so interaction failures never appear."],
    v: "Run a scenario that was driven on a test track, in simulation with the same initial conditions, and confirm the simulated vehicle's speed and path match the measured run within a stated error.",
    dep: ["scenario-library", "sensor-simulation", "traffic-agent-models", "vehicle-dynamics-model"]
  },
  "sensor-simulation": {
    s: "Generates synthetic camera images, lidar points and radar returns from the simulated world, including noise, weather and the sensor's particular quirks.",
    d: "Camera simulation renders images with lens distortion, exposure and noise. Lidar simulation casts rays against the geometry with material reflectance and dropouts. Radar simulation models multipath and clutter. The models are tuned against real recordings so that perception behaves similarly on both. The hard question is the domain gap: a perception network that is perfect on synthetic data may fail on real data in ways nobody can predict, and perfect-looking images prove little about the failures that matter.",
    k: ["Physically based rendering vs learned neural rendering: physics is controllable and explainable; learned models look more real but can hide artifacts.", "Simulate raw sensor data vs object-level data: raw tests perception too; object-level is much cheaper and skips the hardest component."],
    p: ["Perception is validated on synthetic imagery that lacks the real sensor's rare artifacts, so the validation does not transfer.", "Missing sensor effects such as rolling shutter or lidar motion distortion hide bugs that appear only on the road."],
    v: "Compare detection statistics, such as range at which a pedestrian is first detected, between real recordings and simulated equivalents of the same scene, and confirm the difference lies within the declared tolerance.",
    dep: ["intrinsic-calibration", "extrinsic-calibration", "camera-sensors", "lidar-sensors"]
  },
  "traffic-agent-models": {
    s: "Behavior models for simulated drivers, cyclists and pedestrians, which range from fixed scripts to learned policies that react to the vehicle under test.",
    d: "Simple agents follow a path at a set speed. Richer ones use car-following and lane-change models, rule-based planners or policies learned from real trajectories, so they brake, yield, cut in and sometimes break rules. Adversarial agents search for behavior that makes the vehicle fail. The aim is realistic and diverse interaction at scale. The challenge is credibility: learned agents mirror their training data, scripted ones feel artificial, and a population that is too cooperative or too aggressive yields misleading safety numbers.",
    k: ["Replay recorded trajectories vs reactive models: replay is realistic for one instant; it ignores how the agent would respond to the ego's different action.", "Cooperative vs adversarial agents: cooperative ones measure typical behavior; adversarial ones find edge failures but may produce implausible situations."],
    p: ["Agents react to the vehicle in impossible ways, such as perfect braking, so the vehicle looks safer than it is.", "Adversarial search finds failures that no real driver would cause, and the team spends time on them."],
    v: "Compare distributions of time gaps, decelerations and cut-in rates from simulated traffic with the same measurements on real drives of the same road type, and confirm they agree.",
    dep: ["scenario-description-language", "hd-map-service"]
  },
  "hardware-in-the-loop": {
    s: "Connects the real onboard computers to a simulator that supplies sensor data and receives actuator commands, so that timing, drivers and hardware faults are exercised without a car.",
    d: "A test bench feeds recorded or simulated sensor streams to the actual compute units over the real sensor interfaces, and reads the outputs on the real vehicle network. Bench-level tests cover boot, timing under load, fault responses and communication failures that pure software simulation cannot show. Fault injection on the bench, such as dropping a sensor or corrupting a message, is safe here. Building the interface to inject sensor data at full rate and in sync is difficult and expensive.",
    k: ["Full hardware loop vs software-only simulation: the hardware loop finds integration and timing defects; benches are costly and few, so throughput is low.", "Raw sensor injection vs object-level injection: raw injection tests the full chain; object injection is simpler but skips perception hardware paths."],
    p: ["Bench results do not match the vehicle because wiring, power and temperature differ from the lab.", "Limited bench time makes teams skip hardware tests for ordinary changes, so defects appear late."],
    v: "Inject a loss of one camera stream at full rate on the bench and observe the system mode change, the commanded degradation, and the recorded fault code, all within the specified time.",
    dep: ["closed-loop-simulation", "compute-hardware", "fault-injection-testing", "drive-by-wire-gateway"]
  },
  "hazard-analysis": {
    s: "A structured study of how the driving system could cause harm, producing ranked hazards and the safety goals that the design must satisfy.",
    d: "Analysts list operating situations and malfunctions, for example unintended full braking on a highway, and rate each by how severe the harm would be, how likely exposure is and how controllable it is for others. The ratings set integrity levels, which in turn dictate how rigorous development must be for each function. Goals are then decomposed into requirements on specific components. The method is only as good as the imagination of the team, and driverless systems have no human fallback to credit for control, which raises every rating.",
    k: ["Top-down hazard analysis vs bottom-up fault analysis: top-down finds system-level hazards; bottom-up finds component failures, and both are needed because each misses the other's cases.", "Conservative ratings vs realistic ratings: conservative ratings are safe on paper; they raise cost and can make a function unbuildable."],
    p: ["A hazard is missed because it arises from a correct behavior in an unusual situation, not from a fault.", "Requirements are not traced to implementation, so a safety goal has no owner."],
    v: "Pick a recorded incident and confirm that the analysis already contains a hazard describing it, with a safety goal and a traced requirement that would have prevented or mitigated it.",
    dep: ["operational-design-domain"]
  },
  "safety-case": {
    s: "A structured, evidence-backed argument that the system is acceptably safe for its intended use, maintained as the software changes.",
    d: "The case states claims, such as the vehicle will not collide with a pedestrian in a defined range of conditions, then breaks each into sub-claims backed by evidence: analyses, test results, simulation statistics, field data and process records. Reviewers and regulators read it to decide whether to approve operation. Each software change must update the affected evidence. The difficulty is keeping it current and honest: evidence goes stale, and claims about learned components rest on statistics rather than on proof.",
    k: ["Argument-based vs checklist compliance: arguments handle novel designs and show reasoning; checklists are easier to audit and miss what they do not list.", "Statistical evidence vs deterministic proof: statistics can cover learned components; they need very large exposure to support a small residual risk."],
    p: ["Evidence is collected for an older software version and not invalidated after a change.", "The argument assumes independence between redundant channels that in fact share a failure cause."],
    v: "Change one component and show the tool listing exactly which claims lose their evidence and need rerunning; each claim traces to a stored, versioned artifact.",
    dep: ["hazard-analysis", "validation-metrics", "fault-injection-testing", "sotif-analysis", "road-test-program"]
  },
  "sotif-analysis": {
    s: "Analysis of hazards that arise when the system works as designed but its design or learned models cannot handle a situation, for example misreading an unusual object.",
    d: "Conventional functional safety covers faults. This analysis covers performance limits: perception errors in glare, models that have never seen a scooter, rule-based planners that assume other drivers behave. Analysts identify triggering conditions, estimate how often they occur, then reduce the unknown unsafe space through testing and design changes until the residual risk is acceptable. It never reaches completeness, so the argument ends in a claim about how much exploration was enough.",
    k: ["Systematic search of triggering conditions vs random exploration: systematic is auditable; random finds surprises nobody listed.", "Fixing the model vs restricting the domain: model fixes expand capability; domain limits give an immediate guarantee at the cost of availability."],
    p: ["Known weaknesses are recorded in a document but not turned into runtime monitors or domain limits.", "Unknown unsafe cases are assumed to be rare without measurement."],
    v: "For one documented perception limitation, show the triggering condition, the measured error rate in that condition, and the mitigation active in the vehicle when the condition is detected.",
    dep: ["operational-design-domain", "perception-confidence", "scenario-library"]
  },
  "fault-injection-testing": {
    s: "Deliberately causing failures, such as a dead sensor, corrupted message or stalled process, to confirm the system detects them and reacts as the design requires.",
    d: "Faults are injected in simulation, on a bench and sometimes on a closed track: dropping a camera, freezing a timestamp, flipping bits in a message, killing a process, or cutting a power rail. For each fault, the test checks detection time, the resulting mode, and the final vehicle behavior. Results provide evidence for diagnostic coverage claims. The difficulty is the number of combinations and the existence of faults that the injection mechanism cannot produce, such as subtle sensor degradation.",
    k: ["Injecting at message level vs at hardware level: message level is easy and automatable; hardware level finds faults that messages do not show.", "Single faults vs combinations: single faults are enumerable; real accidents often need two coincident faults that are expensive to explore."],
    p: ["The injected fault is unrealistically clean, so detection works in test and fails on messy real degradation.", "The fault list is written by the designers, who test only what they already protected against."],
    v: "Freeze one lidar's output on a bench. The monitor flags it within its specified detection time, the mode manager degrades, and the vehicle stops in the commanded way, all logged with timestamps.",
    dep: ["runtime-monitors", "fault-management", "hardware-in-the-loop"]
  },
  "validation-metrics": {
    s: "The measures used to decide whether the system is good enough: collision and violation rates, disengagements, comfort, and per-scenario pass rates with confidence bounds.",
    d: "Metrics are defined before testing and computed from simulation, closed tracks and road miles. Examples are collisions per million miles, hard-braking rate, rule violations and perception recall by distance. Because serious events are rare, claims need confidence intervals and an argument about how simulated and road miles combine. Choosing metrics is hard, because every number can be improved in ways that hurt the real goal: a vehicle that never moves has no collisions.",
    k: ["Outcome metrics vs leading indicators: outcomes are what society cares about but are rare; leading indicators such as time to collision are frequent and need validation as predictors.", "Compare against human driver rates vs absolute thresholds: human benchmarks are intuitive; they are hard to measure on matching roads and conditions."],
    p: ["Metrics are tuned after seeing results, which lets a release pass without being safer.", "Aggregate rates hide a bad slice, such as night driving or one intersection type."],
    v: "Compute a metric on a held-out set of scenarios and drives, with its confidence interval, and show that the interval width supports the claim being made, not just the point estimate.",
    dep: ["scenario-library", "closed-loop-simulation", "road-test-program"]
  },
  "road-test-program": {
    s: "The staged use of real vehicles, from closed tracks to supervised public roads to driverless operation, with rules for when each stage may begin and what is monitored.",
    d: "Testing proceeds in stages. Tracks give repeatable, dangerous scenarios using soft targets. Supervised road driving, with a safety operator able to take over, gathers exposure and finds problems. Later stages remove the operator in a limited area. Each step has entry criteria tied to metrics and exit reviews. Operators are trained, their interventions are logged and analyzed, and incidents trigger a defined investigation. The hard problem is attention: a supervisor watching a system that is nearly always right becomes inattentive.",
    k: ["Supervised driving vs simulation for exposure: road miles are real and slow to accumulate; simulation is cheap and only as real as its models.", "Single operator vs two-person team: two people improve vigilance and logging; they double cost per mile."],
    p: ["Operators intervene too late or too early, so intervention counts do not measure the system.", "Stage progression is driven by schedule pressure rather than the entry criteria."],
    v: "Pick any stage transition and produce the review record showing each entry criterion met against measured data, signed off before the vehicle moved to the new stage.",
    dep: ["safety-case", "driver-takeover-handover", "event-triggers"]
  },
});
