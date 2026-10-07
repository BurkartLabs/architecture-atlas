// Details for the vision pipeline plate, part 6: monitoring, fleet deployment and cross-cutting concerns.
ATLAS.details("vision-pipeline", {
  "input-drift-detection": {
    s: "Detects that the images the system sees now differ statistically from those it was trained and validated on, an early warning of accuracy loss without labels.",
    d: "Cheap summaries of each stream, such as brightness, contrast, color histograms, object size distributions and embedding statistics, are compared with a reference window using distance measures. Gradual drift comes from seasons, dirt on lenses and new lighting; abrupt drift comes from camera replacement or relocation. Drift signals do not prove accuracy fell, only that the model is now operating outside its evidence, which is the cue to sample and label frames.",
    k: ["Pixel statistics vs embedding statistics: pixel statistics are cheap and explainable; embedding statistics reflect what matters to the model and need a stable feature extractor.", "Compare to training data vs to a recent baseline: training data defines what is supported; a recent baseline detects change and accepts a bad current state.", "Alert on any drift vs on drift with accuracy evidence: any drift is early and noisy; evidence-based alerts are credible and later."],
    p: ["Seasonal drift triggers alerts every autumn that nobody acts on, and real drift is lost among them.", "The reference window is updated automatically and slowly absorbs the very drift it should detect."],
    v: "Inject known changes, such as a dimmed lens, a shifted view and a swapped camera, into a test stream and confirm each raises a drift alert within the stated time, with a clean stream raising none.",
    dep: ["frame-metadata", "hard-example-mining"]
  },
  "confidence-monitoring": {
    s: "Tracks the distribution of model scores and detection counts over time as a label-free proxy for quality: sudden shifts suggest something changed.",
    d: "Per camera and per class, the system records histograms of confidence, objects per frame and the share of frames with no detections, and watches for changes relative to the camera's own history. A fall in mean confidence suggests degradation; zero detections for hours suggests a blocked or frozen camera. It is a proxy: confidence can stay high while accuracy falls, and fall while accuracy is fine, so it triggers investigation and does not replace labeled measurement.",
    k: ["Per-camera baselines vs fleet-wide baselines: per-camera is sensitive to local change and needs history; fleet-wide is simple and misses cameras that are always odd.", "Raw score distribution vs calibrated score: calibrated is comparable across models; raw is available at once.", "Alert on deviation vs report on dashboards: alerts are timely and fatigue people; dashboards are calm and are seldom opened."],
    p: ["Confidence stays high on a camera that is wrongly aimed, so nothing alerts.", "A model update shifts all score distributions and every camera alerts together."],
    v: "Degrade a test camera by blurring and by darkening, and confirm the monitored distribution shifts beyond the alert threshold within hours, while a month of normal operation stays inside it.",
    dep: ["confidence-thresholds", "frame-metadata"]
  },
  "field-ground-truth-audits": {
    s: "Periodic human checks of model output against reality on live cameras, producing true accuracy numbers instead of proxies.",
    d: "Auditors review a random sample of frames, events or counts from each site and compare them with what is actually in the footage, or with independent counts such as manual tallies and door sensors. Results estimate precision, recall and count error per site, per camera and per condition, with confidence intervals. Stratified sampling ensures rare conditions are covered. Audits are expensive, so their schedule follows risk, and their misses become new training data.",
    k: ["Random sampling vs targeted sampling: random gives unbiased estimates; targeted finds problems and cannot estimate overall accuracy.", "Independent sensor as truth vs human review: sensors are continuous and have their own errors; humans are flexible and costly.", "Continuous small audits vs periodic large ones: continuous catches drift sooner; periodic audits are easier to organize."],
    p: ["Audit samples are drawn from detected events only, so missed events are never examined.", "A few audited days happen to be unusually quiet and the estimate is far too optimistic."],
    v: "Compare an audit's reported accuracy with an independent staged test with known ground truth, and confirm that the confidence interval covers the known value.",
    dep: ["annotation-queue", "slice-based-accuracy"]
  },
  "latency-and-throughput-metrics": {
    s: "Measures time through each stage and the rate of frames in, processed and dropped, per stream and per device.",
    d: "Each frame carries timestamps through the stages, from capture to decode, preprocessing, queue wait, inference, post-processing and event emission. Percentiles per stage, not averages, show tail behavior that matters to real-time use. Counters for processed, skipped and dropped frames show coverage. Metrics are aggregated on the device and shipped at low rate, with detailed traces available on demand. The data feeds capacity planning and detects regressions from updates.",
    k: ["Percentiles vs averages: percentiles expose rare slow frames; averages are easy to compare and hide them.", "Per-frame tracing vs sampled tracing: per-frame is complete and expensive; sampled is cheap and may miss rare stalls.", "Measure at stage boundaries vs inside stages: boundaries are simple; inside-stage timing finds the real cause and adds instrumentation."],
    p: ["Average latency looks fine while one frame in a hundred takes three seconds and triggers late alerts.", "Dropped frames are not counted, so coverage silently falls."],
    v: "Inject a known delay in one stage and confirm the stage's latency percentile rises by that amount and the end-to-end percentile shows it, with the frame counters reconciling input against output plus drops.",
    dep: ["frame-timestamping", "frame-metadata"]
  },
  "stream-health-dashboards": {
    s: "The operator's view of every camera and device: connection state, frame rate, decode errors, image health, model version and recent events, at fleet and site level.",
    d: "A dashboard aggregates stream states and highlights the cameras needing attention, ordered by importance rather than alphabet. It links an alert to a live thumbnail, the recent history of metrics and the camera's configuration. It distinguishes camera, network, device and model problems, so the right person is called. At fleet scale, rollups per site and per hardware type reveal systematic faults. A view that is red everywhere trains people to ignore it.",
    k: ["Push alerts vs a pull dashboard: alerts demand attention and cause fatigue; dashboards require someone to look.", "Raw states vs triaged problems: triage saves time and encodes assumptions that can be wrong; raw states are honest and overwhelming.", "Live thumbnails vs metrics only: thumbnails make diagnosis immediate and expose video; metrics are private and abstract."],
    p: ["Hundreds of cameras are listed as unhealthy during a network outage that a single banner should explain.", "The dashboard shows the stream as connected because packets arrive, though the picture is frozen."],
    v: "Induce each class of failure in a lab fleet, including network loss, a frozen camera, a failed accelerator and a bad model, and confirm the dashboard names the right class within a minute.",
    dep: ["camera-health-checks", "latency-and-throughput-metrics"]
  },
  "slice-based-accuracy": {
    s: "Reporting accuracy separately for conditions that matter, such as time of day, weather, camera model, object size and site, to find where the model fails.",
    d: "Average accuracy hides localized failure. Slices are defined by metadata recorded with each sample: camera, lighting, weather, distance, occlusion and demographic attributes where lawful. Each slice needs enough labeled examples to give a usable interval, so slice definitions are balanced against sample sizes. Slice dashboards guide data collection and set release floors. Slice metadata is itself part of the schema and must be recorded at capture time.",
    k: ["Many fine slices vs few coarse slices: fine slices find problems and have too few samples for intervals; coarse slices are statistically solid and blur them.", "Slices from recorded metadata vs inferred slices: recorded is exact and needs forethought; inferred is available after the fact and noisy.", "Absolute floors vs relative to the previous model: floors protect users; relative checks stop regressions and carry old weaknesses forward."],
    p: ["A slice has twenty examples and one error swings its accuracy ten points, triggering false alarms.", "The worst slice is one nobody defined, such as a single camera model."],
    v: "Generate the slice report for a model with known weak conditions and confirm the weak slice is flagged with an interval, and that every slice shows its sample size.",
    dep: ["field-ground-truth-audits", "frame-metadata"]
  },
  "accuracy-slos-and-alerts": {
    s: "Explicit accuracy targets per use case, measured continuously from audits and proxies, with alerts and a process when the target is missed.",
    d: "An objective states, for example, that the count error stays under five percent per site per week, or that the miss rate for a critical event stays under a set rate. Measured values combine audits with proxy signals between audits. A breach opens an incident with a defined response: investigate, mitigate by raising thresholds or increasing review, and retrain. An error budget approach allows planned changes as long as the budget remains.",
    k: ["Objectives per customer use case vs one global objective: per-use-case is meaningful and multiplies the work; global is simple and fits nobody.", "Alert on proxy signals vs on audited accuracy: proxies are fast; audited accuracy is true and slow.", "Strict budgets vs relaxed: strict drives quality and slows releases; relaxed ships faster and tolerates drift."],
    p: ["The objective is defined on a quantity nobody measures, so it never alerts.", "A breach alert has no owner, and the incident drifts for weeks."],
    v: "Force an accuracy regression on a test site and confirm the objective calculation shows the breach in the expected window, an incident opens with an owner, and closing it requires the recorded corrective action.",
    dep: ["field-ground-truth-audits", "confidence-monitoring", "input-drift-detection"]
  },
  "device-provisioning": {
    s: "Bringing a new device or camera into the fleet: identity, credentials, site and camera assignment, calibration and an initial model and configuration.",
    d: "A device obtains a unique identity, ideally rooted in hardware, enrolls with the control service, receives credentials and its assignment, then downloads the right model for its hardware and the camera configuration. Installers attach cameras, draw zones and calibrate with a guided tool, and the system verifies that the view meets requirements before activating analysis. Provisioning at scale needs to be doable by people who are not engineers, and decommissioning must revoke everything.",
    k: ["Factory provisioning vs on-site enrollment: factory is consistent and requires logistics; on-site is flexible and error prone.", "Hardware-rooted identity vs shared secrets: hardware identity resists cloning and needs supporting chips; shared secrets are simple and leak.", "Guided installation checks vs trust the installer: checks catch bad angles early and add steps; trust is fast and finds problems months later."],
    p: ["A cloned device image shares credentials, and two units fight over one identity.", "A retired device keeps valid credentials and can still pull models and configuration."],
    v: "Provision a new device with a non-engineer following the written steps, and confirm it appears in the fleet with correct site, camera, model and calibration, then decommission it and confirm its credentials are rejected.",
    dep: ["model-registry", "camera-calibration", "remote-configuration"]
  },
  "model-registry": {
    s: "The versioned store of models and their metadata, signed and linked to datasets, preprocessing, thresholds and evaluation results.",
    d: "Each entry bundles the model artifacts for every hardware target with the preprocessing specification, class mapping, recommended thresholds, evaluation report, dataset version and the stage it has reached: candidate, shadow, canary or production. Artifacts are signed, and devices verify signatures before loading. Because behavior depends on the bundle, not just weights, all parts are versioned as one unit. The registry is the single answer to which model is running where.",
    k: ["Bundle everything as one versioned unit vs separate versions: one unit prevents mismatch; separate versions allow independent changes and invite incompatible combinations.", "Signed artifacts vs checksums only: signatures prove origin and need key management; checksums catch corruption only.", "Promote by stage with gates vs manual copy: gated promotion is safe; manual is quick and leaves no record."],
    p: ["A threshold file is updated separately from the model, and the pair no longer matches.", "Devices load an unsigned model from a compromised mirror."],
    v: "Attempt to load a tampered model and a model with mismatched preprocessing on a test device; both must be rejected, and the registry must show which version each device currently runs.",
    dep: ["accuracy-regression-gate"]
  },
  "staged-rollout": {
    s: "Releasing a model or software update gradually, to groups of devices ordered by risk, with automatic checks between stages.",
    d: "A rollout plan names stages, such as internal devices, a few friendly sites, a percentage of the fleet and then everyone, with soak times and gates. Each gate compares health and accuracy signals of updated devices against those not updated and halts on regression. Waves avoid updating all devices of one site or one hardware type together. Devices on poor links update slowly, and the fleet is temporarily mixed, so consumers must tolerate both versions.",
    k: ["Many small stages vs few large stages: many stages limit blast radius and take weeks; few are fast and expose more.", "Automatic halt vs human approval between stages: automatic reacts quickly and can halt on noise; human approval is thoughtful and slow.", "Rollout by site vs by random device: by site keeps each site coherent; random gives better statistics and mixed behavior within a site."],
    p: ["A stage's soak time is shorter than the day-night cycle, and a night-time regression is missed.", "The comparison group has a different hardware mix, so a difference reflects hardware and not the model."],
    v: "Roll out a deliberately faulty model to the first stage and confirm the gate halts the rollout before the second stage, with unaffected devices still on the old version.",
    dep: ["model-registry", "device-health-and-ota", "latency-and-throughput-metrics"]
  },
  "rollback-and-pinning": {
    s: "The ability to return devices to a known good model quickly, and to hold specific devices on a version regardless of rollouts.",
    d: "Devices keep the previous model and configuration on local storage, so a rollback is a switch, not a download. A fleet-wide rollback is a first-class action with the same stages and records as a rollout, but faster. Pinning holds sites that have validated a version for a regulatory or contractual reason. Rollback depends on the old model remaining compatible with the current software, with data formats, thresholds and schemas, so changes must be reversible.",
    k: ["Keep the previous version on the device vs download on demand: local is instant and uses storage; download needs connectivity when it matters most.", "Automatic rollback on health failure vs manual: automatic limits damage and can oscillate; manual is deliberate and slow.", "Pin by device vs pin by site: by device is precise; by site is easier to manage."],
    p: ["Rollback restores the old model but not its thresholds and the pair misbehaves.", "A pinned site is forgotten and runs an obsolete model for a year."],
    v: "Trigger a rollback on a test fleet under load and confirm all devices return to the previous version within the target time, with events continuing and thresholds restored with the model.",
    dep: ["model-registry", "staged-rollout"]
  },
  "remote-configuration": {
    s: "Changing camera, zone, threshold and policy settings across devices from a central service, with validation, versioning and audit.",
    d: "Configuration includes streams, regions of interest, rules, thresholds, collection campaigns and privacy settings. Changes are validated against a schema and against the device's capacity before they are applied, versioned and rolled out like software, and acknowledged with the effective version. Devices cache the last good configuration and continue if the service is unreachable. Overrides at fleet, site and camera level need a clear precedence order.",
    k: ["Central configuration with local cache vs local only: central keeps the fleet consistent and needs connectivity for changes; local is robust and drifts.", "Apply immediately vs at a safe point: immediate is responsive; safe points avoid mid-event glitches.", "Layered overrides vs flat per-camera settings: layers reduce repetition and make the effective value harder to know."],
    p: ["An invalid configuration is pushed to the whole fleet and every device restarts into a failing state.", "A site override silently masks a fleet-wide fix."],
    v: "Push a change to a test device and verify it reports the new effective version, then push an invalid configuration and confirm the device rejects it and keeps running on the last good one.",
    dep: ["device-health-and-ota"]
  },
  "hardware-variants": {
    s: "Managing the many device types in a fleet: different accelerators, memory sizes, drivers and camera interfaces, each needing its own model build and limits.",
    d: "A fleet accumulates hardware generations. Each variant needs compiled model plans, tested driver and runtime versions, and capacity numbers that determine how many streams it can carry. A build matrix produces and tests artifacts for every supported combination, with real devices in the test lab. The more variants, the more regression testing and the greater the temptation to drop old ones. Capability flags let one codebase adapt.",
    k: ["Support few variants vs many: few lowers test cost and forces hardware refresh; many extends the fleet's life and multiplies builds.", "Per-variant model builds vs one portable model: per-variant is fastest; portable is simple and slower on all.", "Capability detection at runtime vs variant-specific code: runtime detection adapts to new hardware and hides gaps; variant code is explicit."],
    p: ["A model is tested on the newest hardware and fails to load on a two-year-old variant still in the field.", "Driver versions drift across devices and identical models behave differently."],
    v: "On every variant in the lab, install the release artifacts, run the standard acceptance stream set and confirm each meets its stream count, latency and accuracy criteria before the release is allowed to reach that variant.",
    dep: ["graph-compilation-and-fusion", "model-registry"]
  },
  "device-health-and-ota": {
    s: "Monitoring each device's own condition and delivering signed software, model and configuration updates over the air with safe install and recovery.",
    d: "Devices report heartbeats with temperature, storage, memory, accelerator state, versions and error counts. Updates are downloaded in the background, verified, installed to an inactive slot and booted with a health check; failure reverts to the previous slot automatically. Updates are scheduled in maintenance windows and respect bandwidth limits. Power loss in the middle of an update must never leave a device unbootable, since many are physically hard to reach.",
    k: ["A/B slots with automatic revert vs in-place update: A/B is safe and uses double storage; in-place is compact and can brick a device.", "Delta updates vs full images: deltas save bandwidth and need exact base versions; full images are simple and large.", "Update on schedule vs on demand: scheduled keeps behavior predictable; on demand fixes urgent problems fast."],
    p: ["Power loss mid-update leaves a remote device unbootable and requires a site visit.", "Many devices download an update together and saturate the site's uplink."],
    v: "Cut power at random points during repeated update cycles on test devices, and confirm every device boots into a working version, reports its state, and completes the update on the next window.",
    dep: ["model-registry"]
  },
  "end-to-end-latency": {
    s: "The total time from light hitting the sensor to an event reaching a person or system, budgeted across every stage of the pipeline.",
    d: "Each stage consumes a share: exposure and encoding, network transit, decode buffering, sampling interval, queue wait, batching window, inference, tracking confirmation, rule persistence and delivery. Stages added for accuracy, such as persistence and voting, add latency, and queues add the most when the system is busy. The requirement differs: an intrusion alert may need two seconds, a daily count much longer. The budget must be written down and measured per stage, or each team spends all of it.",
    k: ["Tight budget with approximate results vs relaxed budget with confirmation: tight gets fast alerts with more false alarms; relaxed confirms across frames and arrives late.", "Allocate the budget centrally vs let stages optimize locally: central allocation is consistent; local optimization is autonomous and overspends.", "Measure latency per stage vs only end to end: per stage finds the cause; end to end tells you the result."],
    p: ["Every stage adds a small buffer to be safe, and together they reach several seconds that nobody chose.", "A latency target is measured at idle and missed under load."],
    v: "Flash a light or trigger a staged event in front of a camera and measure the time until the alert arrives, at idle and at full load, comparing with the per-stage sum and the target.",
    dep: ["latency-and-throughput-metrics", "dynamic-batching", "debouncing-and-hysteresis"]
  },
  "edge-cloud-placement": {
    s: "The foundational decision of which processing runs on the camera, the site gateway or the cloud, balancing latency, bandwidth, cost, privacy and update speed.",
    d: "Camera-side processing minimizes bandwidth and exposure and is limited by power and memory. Site gateways aggregate several cameras and enable multi-camera logic. The cloud offers large models and easy updates but needs bandwidth and raises privacy and cost. Most systems are hybrid, with a fast local path for alerts and a slower central path for analysis and learning. The placement shapes hardware choice, update machinery and failure modes, so it is made early and revised with difficulty.",
    k: ["Decide per function vs one placement for everything: per function matches each need and makes the system more complicated; one placement is simple and fits poorly.", "Gateway aggregation vs processing in each camera: a gateway shares expensive accelerators and is a single point of failure; per-camera chips scale linearly and cost more per stream.", "Send video to the cloud vs send results: video keeps all options open and costs bandwidth and privacy; results are cheap and final."],
    p: ["A design that streams all video to the cloud is infeasible once the site's uplink is measured.", "Business logic is split across tiers with no clear owner, and behavior depends on which tier was updated last."],
    v: "Calculate and then measure bandwidth, latency and cost per stream for each tier at a pilot site, and confirm the chosen placement meets the budgets, including with the uplink cut.",
    dep: ["edge-cloud-split-of-events", "on-device-processing", "multi-accelerator-placement"]
  },
  "time-and-ordering": {
    s: "How the system defines when something happened and in what order events occurred, across cameras, devices, delays and clock errors.",
    d: "Frames pass through queues of varying length, and events are generated after their cause, so processing time is not event time. The system must carry event time from the sensor, correct for clock offsets and decide how late data can arrive before a window closes. Cross-camera fusion, evidence clips and records from other systems depend on this. Decisions include which clock is authoritative, what resolution is needed and how to represent uncertainty.",
    k: ["Event time vs processing time: event time is correct and requires handling late arrival; processing time is simple and shifts with load.", "Wait for late data vs emit now and correct later: waiting gives final answers late; correcting is fast and makes consumers handle revisions.", "Single authoritative clock vs per-device clocks with offsets: a single clock is clean and needs infrastructure; offsets work anywhere and accumulate error."],
    p: ["Events from a device whose clock is wrong sort before the cause they respond to.", "Reports bucket events by arrival time, and a network outage makes yesterday's events appear today."],
    v: "Replay a recorded session with injected delays, reordered arrival and a skewed device clock, and confirm that event order, window membership and counts equal those of the undisturbed run.",
    dep: ["frame-timestamping", "clock-synchronization", "reliable-event-delivery"]
  },
  "version-coupling": {
    s: "The fact that a model's behavior depends on matching preprocessing, thresholds, class mappings, runtime, drivers and rules, so these must be versioned and released as a set.",
    d: "A model file alone does not define behavior. The preprocessing specification, calibration of scores, taxonomy, plan compiled for a runtime, driver version and downstream rule thresholds all interact. Changing one without the others produces regressions that no component's own tests detect. The solution is bundles with recorded versions, compatibility checks at load and in the registry, and results stamped with the versions that produced them, so any output can be explained and reproduced.",
    k: ["Bundled releases vs independent component updates: bundles prevent mismatch and slow down small fixes; independent updates are fast and risk incompatibility.", "Pin driver and runtime versions vs track latest: pinning gives reproducibility and delays fixes; tracking gets improvements and unplanned behavior change.", "Reject mismatched bundles at load vs warn: rejecting is safe and can take a camera offline; warning keeps running on an unsafe pair."],
    p: ["A routine runtime update changes numeric results, and thresholds tuned on the old runtime misfire across the fleet.", "A rule threshold tuned to one model's scores is applied to its successor."],
    v: "Change one element of a bundle, such as the resize method or driver, in a test device and confirm the load check or the regression test fails and names the mismatched element.",
    dep: ["model-registry", "train-serve-parity", "frame-metadata"]
  },
  "graceful-degradation": {
    s: "Designing each stage so that when something fails or overloads, the system keeps delivering a reduced but honest service, and says that it is reduced.",
    d: "Failures are normal: cameras drop, decoders hit corrupt data, accelerators throttle, networks partition, models are missing. For each, the design names a fallback, such as a lower rate, smaller model, last known good configuration, local buffering or a clear unavailable signal, and ensures the degraded state is visible in events and dashboards. The worst outcome is silent degradation, where outputs continue and are wrong. Degradation paths must be tested as often as the normal path.",
    k: ["Degrade and continue vs stop and report: degrading keeps service and risks quiet inaccuracy; stopping is honest and loses coverage.", "Automatic fallbacks vs operator-controlled: automatic reacts fast; operator-controlled is predictable and slow.", "Mark degraded outputs vs hide it: marking lets consumers decide; hiding keeps interfaces simple and misleads."],
    p: ["A fallback to a smaller model after thermal throttling continues for weeks, and nobody knows counts are less accurate.", "The fallback path is never exercised and fails when the first real fault arrives."],
    v: "Inject each failure in turn on a test fleet, including camera loss, decode errors, accelerator failure, uplink loss and missing model, and confirm each produces its documented fallback and a visible degraded state, then recovery.",
    dep: ["backpressure-and-load-shedding", "stream-ingest-and-reconnect", "stream-health-dashboards"]
  },
  "privacy-by-design": {
    s: "Treating privacy as a structural property: collecting the least, processing it where it is created, discarding it early, and making every exception explicit and audited.",
    d: "Privacy cannot be added at the end, because it constrains where models run, what is stored, how long, which embeddings exist and how training data is gathered. Decisions made early include on-device processing, redaction before export, short retention, purpose limits and access control. Each feature is checked for what personal data it creates, and for whether a less identifying design reaches the same goal. Legal duties vary by place, but good defaults make compliance easier everywhere.",
    k: ["Minimize data from the start vs collect broadly and restrict later: minimizing limits future uses and risk; broad collection keeps options and creates liabilities.", "Technical enforcement vs policy only: technical enforcement cannot be forgotten and constrains legitimate uses; policy is flexible and depends on discipline.", "Privacy review per feature vs one review for the platform: per feature catches new risks and slows work; one review is fast and goes stale."],
    p: ["A new analytic quietly begins storing face embeddings, which no policy or review covered.", "Debug logs and crash reports contain frames or identifiers and flow to third parties."],
    v: "Trace each type of personal data from capture to deletion in a pilot deployment, listing every place it is stored or sent, and confirm each matches the documented purpose, retention and access rules.",
    dep: ["on-device-processing", "redaction-and-blurring", "retention-and-deletion", "access-control-and-audit"]
  },
});
