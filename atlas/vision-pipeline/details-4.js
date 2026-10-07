// Details for the vision pipeline plate, part 4: tracking, post-processing and events.
ATLAS.details("vision-pipeline", {
  "data-association": {
    s: "Matches each frame's detections to existing tracks, using position, motion prediction and appearance similarity, so objects keep identities over time.",
    d: "A cost matrix scores every pairing of track and detection by overlap, distance from the predicted position and optionally embedding similarity. An assignment algorithm picks the lowest-cost matching, subject to gating that forbids implausible pairs. Unmatched detections start tentative tracks and unmatched tracks age out. Low-confidence detections are often kept for a second matching pass to bridge brief dropouts. Errors show up as identity switches, fragmentation and merged tracks, and grow with crowds and occlusion.",
    k: ["Motion and overlap only vs adding appearance: motion-only is cheap and fails on long occlusions; appearance recovers identity and adds embedding cost and privacy duties.", "Optimal assignment vs greedy matching: optimal gives consistent results with cubic cost in crowds; greedy is fast and occasionally swaps neighbors.", "Strict gating vs loose gating: strict avoids wrong matches and fragments tracks; loose bridges gaps and swaps identities."],
    p: ["Two people crossing paths swap identities and per-person dwell time is attributed to the wrong one.", "Low frame rate makes motion between frames exceed the gate and every fast object spawns a new track."],
    v: "Run labeled sequences with crossings and occlusions and report identity switches, fragmentation and association accuracy per sequence, at the deployed frame rate.",
    dep: ["motion-models", "object-detection", "appearance-embeddings"]
  },
  "motion-models": {
    s: "Predicts where a tracked object will be in the next frame from its recent movement, using filters that balance prediction against noisy measurements.",
    d: "A state estimator, commonly a recursive filter, holds position, size and velocity with uncertainty. It predicts the next state, then corrects with the matched detection. The prediction narrows association candidates and carries a track through missed detections. Process and measurement noise settings encode how erratic objects are and how jittery detections are, and good values differ for pedestrians, vehicles and forklifts. Camera motion breaks the assumptions and needs compensation.",
    k: ["Constant-velocity model vs richer dynamics: constant velocity is simple and robust; richer models fit turning vehicles and need more tuning.", "Image-plane tracking vs ground-plane tracking: image plane needs no calibration; ground plane gives physically plausible motion and depends on calibration.", "Trust the detector vs trust the prediction: trusting measurements follows jitter; trusting prediction lags behind real turns."],
    p: ["Noise settings tuned for walking people lose fast cars on every turn.", "Pan-tilt cameras move the whole image and every predicted position is wrong."],
    v: "Compare predicted and observed positions on recorded tracks; one-step prediction error should be within a few pixels, and tracks should survive a staged two-second occlusion.",
    dep: ["data-association"]
  },
  "track-lifecycle": {
    s: "The rules for how a track is born, confirmed, coasted through misses and finally retired, which determine false tracks, fragmentation and lag.",
    d: "A new detection becomes a tentative track and is confirmed after several consecutive hits. A confirmed track that is missed is kept alive for a limited number of frames or seconds, predicted but not reported, then deleted. Parameters set a balance: slow confirmation avoids false tracks but delays events; long retention bridges occlusion but lets ghosts linger and reuse identities wrongly. Entering and exiting regions of the image, such as door edges, may warrant different rules.",
    k: ["Fast confirmation vs slow confirmation: fast gives low latency and passes spurious detections; slow filters noise and delays alerts.", "Long retention vs short retention: long bridges occlusions; ghosts persist and counters may double count a returning object.", "Report tentative tracks vs confirmed only: tentative lowers latency; confirmed gives clean output."],
    p: ["A single false detection that persists on a poster generates a permanent confirmed track in the scene.", "Short retention makes an object that pauses behind a pillar count twice."],
    v: "Replay scenes with staged occlusions of known duration and confirm that the identity is held through occlusions shorter than the retention time, and that ghost tracks disappear within the specified time.",
    dep: ["data-association", "motion-models"]
  },
  "cross-camera-reidentification": {
    s: "Linking the same object observed by different cameras, using appearance, timing and known camera layout to produce one identity across a site.",
    d: "When an object leaves one view and appears in another, the system compares embeddings and checks whether travel time between the cameras is plausible given topology. Overlapping cameras can instead be matched by projecting to the ground plane. Matches update a global identity with a gallery of appearances. Lighting, angle and resolution differences between cameras reduce embedding quality. Errors are costly, so low-confidence links are often reported as candidates and not merged.",
    k: ["Appearance-based matching vs geometry-based matching: appearance works with non-overlapping cameras and is fooled by similar looks; geometry is precise and needs overlap and calibration.", "Merge on confidence vs report candidates: merging gives clean counts and risks wrong joins; candidates are honest and need review.", "Central gallery vs per-device matching: central sees the whole site and needs transport of embeddings; per-device keeps data local and sees less."],
    p: ["Identical uniforms cause systematic wrong merges that inflate the apparent dwell time of one person.", "Camera clock drift makes travel-time rules reject real transitions."],
    v: "Walk instrumented subjects through the site and compare the system's identity chains against known routes, reporting correct links, wrong links and missed links.",
    dep: ["appearance-embeddings", "multi-camera-sync", "camera-calibration"]
  },
  "zones-and-virtual-lines": {
    s: "Operator-drawn polygons and lines whose entry, exit and crossing by tracked objects generate the primitive facts rules depend on.",
    d: "Zones are polygons in image or ground coordinates; lines have a direction. For each track and frame the system tests which zone contains a reference point, usually the bottom center of the box, and whether the path crossed a line, and in which direction. Debouncing prevents a track jittering on a boundary from firing repeatedly. Zones are configuration with a lifecycle: they must be versioned, tied to a camera's calibration and revalidated when the view changes.",
    k: ["Image-space zones vs ground-plane zones: image-space needs nothing beyond a drawing; ground-plane zones are physically meaningful and need calibration.", "Bottom-center reference point vs box center: bottom-center approximates feet on the floor; box centers wander with occlusion and height.", "Crossing by track vs by detection: track-based is robust to jitter; detections are immediate and noisy."],
    p: ["A camera is knocked and the line sits two meters from the doorway it was drawn on.", "A track jitters across a boundary and generates ten entries in a second."],
    v: "Walk through each zone and over each line in both directions at several speeds and confirm exactly one entry or crossing is generated per pass, with the right direction.",
    dep: ["track-lifecycle", "camera-calibration"]
  },
  "trajectory-and-dwell-analysis": {
    s: "Derives behavior from tracks over time: time spent in places, speed, paths taken, loitering, queue length and flow patterns.",
    d: "Track histories are aggregated into dwell times per zone, speeds in real units, heat maps and path clusters. Rules flag loitering beyond a duration, wrong-way travel or abnormal speed. Results depend on track continuity, so fragmentation shortens dwell times and identity swaps pollute them. Aggregation windows and handling of partial tracks at the beginning and end of observation need careful definition for the numbers to mean something.",
    k: ["Per-track metrics vs aggregate flow metrics: per-track supports individual rules and is sensitive to identity errors; aggregates are robust and lose individual detail.", "Real-time evaluation vs batch evaluation: real-time enables alerts and works on partial tracks; batch is accurate on complete ones and late.", "Store full trajectories vs summaries: full trajectories allow reanalysis and are sensitive personal data; summaries are small and safer."],
    p: ["Tracks broken by occlusion make everyone's dwell time look shorter than reality.", "Speed computed in image pixels is reported as if it were meters per second."],
    v: "Have staged participants stand for known durations and walk a measured distance at known speeds, and compare the reported dwell times and speeds with the ground truth.",
    dep: ["track-lifecycle", "zones-and-virtual-lines", "camera-calibration"]
  },
  "counting-and-occupancy": {
    s: "Counting objects passing a line or present in an area, producing the numbers that business users typically care most about.",
    d: "Line counting increments per crossing in each direction. Occupancy counts tracks inside a zone at a time, or estimates counts from density maps in crowds too dense for detection. Counters need rules for re-entry, stationary objects and groups walking closely together. Counts drift over time as errors accumulate, so many deployments reset against an independent reference or sensor at known quiet times.",
    k: ["Count by line crossing vs count by occupancy snapshots: crossings give flow and accumulate errors; snapshots are self-correcting and miss short visits.", "Detection-based vs density-based counting: detection gives identities; density maps handle crowds with no individual detail.", "Report estimates with error bounds vs a single number: bounds are honest and harder to display; single numbers invite false precision."],
    p: ["Groups walking side by side are counted as one and the bias grows with busy periods.", "Accumulated errors turn a store occupancy counter negative at the end of the day."],
    v: "Compare automated counts with manual counts over a full day at several sites, including peak hours, and report the error by period and direction.",
    dep: ["zones-and-virtual-lines", "track-lifecycle"]
  },
  "non-maximum-suppression": {
    s: "Removes duplicate detections of the same object by keeping the highest-scoring box and discarding overlapping boxes above an overlap threshold.",
    d: "Detectors produce many boxes per object. Suppression sorts by score, keeps the best and removes others whose overlap with it exceeds a limit, usually per class. Variants reduce scores instead of removing, or merge overlapping boxes. It is a sequential, data-dependent step that suits processors more than accelerators, and its cost grows with candidate count. Overlap threshold is a trade-off: low merges nearby objects, high leaves duplicates. Crowds are the hard case.",
    k: ["Hard suppression vs soft suppression: hard is simple and drops adjacent real objects in crowds; soft reduces scores and keeps them, leaving more to filter.", "Per-class vs class-agnostic: per-class keeps overlapping objects of different kinds; class-agnostic removes duplicates across labels.", "Inside the model graph vs separate step: inside is one artifact and often unsupported on accelerators; separate is flexible and costs a copy."],
    p: ["People standing shoulder to shoulder are merged into one detection and counts fall in crowds.", "A candidate limit that is too low drops valid boxes before suppression."],
    v: "Test with synthetic crowds of increasing density and confirm the output count matches the true count up to the stated density, with duplicates under the stated rate.",
    dep: ["box-decoding", "confidence-thresholds"]
  },
  "confidence-thresholds": {
    s: "Chooses the score above which a prediction counts, and calibrates scores so a given value means a consistent probability of being right.",
    d: "Raw model scores are not probabilities; they depend on training and are often overconfident. Calibration, such as temperature scaling or isotonic fitting on held-out data, maps scores so that ninety percent means roughly ninety percent correct. Thresholds are set per class and per use, using precision-recall curves: a safety alert and a count have different costs of missing and of false alarms. Thresholds are tied to a model version and must be re-derived when the model or camera changes.",
    k: ["Single global threshold vs per-class thresholds: global is simple; per-class matches differing difficulty and needs more data and maintenance.", "Calibrated probabilities vs raw scores: calibration allows meaningful combination and thresholds across models; it needs held-out field data.", "Tune for recall vs tune for precision: recall catches more events and floods reviewers; precision keeps alerts trusted and misses some."],
    p: ["A model update changes score distributions and the old threshold now alarms constantly.", "Thresholds tuned on a clean test set give worse precision on messy field images."],
    v: "Plot reliability on field-sampled labeled data: predictions scored 0.8 should be correct about 80 percent of the time, and the chosen thresholds must achieve the target precision and recall on that data.",
    dep: ["object-detection", "model-registry"]
  },
  "mask-refinement": {
    s: "Cleans up raw segmentation output: upsampling to image resolution, thresholding, removing specks and holes, and smoothing edges.",
    d: "Network masks come at low resolution as probabilities. Refinement upsamples with interpolation, thresholds, applies morphological operations to remove noise and fill holes, and may snap edges to image gradients using a conditional random field or a guided filter. Polygons are extracted for storage and for geometry tests. Costs scale with image area, so refinement is often limited to the box of interest.",
    k: ["Refine edges with image guidance vs accept network edges: guidance gives crisp boundaries and costs time; network edges are cheap and soft.", "Pixel masks vs polygon outputs: polygons are compact and convenient for rules; pixel masks keep all detail.", "Refine the whole frame vs only regions of interest: whole frame is uniform and expensive; regions are cheap."],
    p: ["Aggressive hole filling closes real gaps, such as a doorway, and region rules mislead.", "Mask upsampling offsets are off by half a pixel, shifting every mask slightly."],
    v: "Overlay refined masks on frames and compare against annotations: boundary error must be below the target in pixels, and polygons must have no self-intersections over a thousand frames.",
    dep: ["semantic-segmentation", "instance-segmentation"]
  },
  "coordinate-mapping": {
    s: "Maps results from model input coordinates back to the original image, and from image coordinates to ground or world coordinates.",
    d: "Every geometric transformation applied in preprocessing, such as crop, tile offset, letterbox padding and scale, is inverted to put boxes, masks and keypoints in original frame pixels. A second mapping uses calibration to place points on a ground plane in meters, and a third applies the site map. Each mapping is a chain of transforms recorded in frame metadata. Rounding errors and a missing step produce systematic offsets that are hard to see until overlaid on the image.",
    k: ["Store transforms with the frame vs recompute from configuration: stored transforms are always correct for that frame; recomputing is lighter and breaks when configuration changes.", "Report image coordinates vs world coordinates: image coordinates are always available; world coordinates are useful and only valid when calibrated.", "Normalized vs pixel coordinates: normalized survive resolution changes; pixels are exact and tied to one size."],
    p: ["A tile offset is not added back and objects in the lower-right tile appear in the upper-left.", "Resolution of the stream changes and stored pixel coordinates in zones become wrong."],
    v: "Overlay results on the original image for frames from each camera, tile and crop mode, and confirm marked ground-truth points land within one pixel after the full chain.",
    dep: ["frame-metadata", "resize-and-letterbox", "camera-calibration"]
  },
  "temporal-smoothing": {
    s: "Combines predictions across successive frames, with filtering or voting, to reduce flicker and single-frame errors in classes, boxes, keypoints and masks.",
    d: "Frame-by-frame predictions flicker: a box changes size, a class flips, a keypoint jumps. Exponential averaging, median filters or short-window voting stabilize them. Aggregating per track, such as choosing a class by majority over frames, improves accuracy. The window adds delay and blurs fast changes, so lengths are chosen per quantity. Smoothing must not hide real transitions such as a door opening or a person falling.",
    k: ["Short window vs long window: short reacts quickly and keeps some flicker; long is stable and lags real change.", "Averaging vs voting: averaging suits continuous values; voting suits categories and ignores confidence.", "Smooth before rules vs after: before stabilizes inputs to every rule; after leaves raw data available for audit."],
    p: ["Smoothing a fall's keypoints hides the sudden motion that defines it.", "Smoothing spans a track break and blends two different objects."],
    v: "On recorded sequences, measure flicker rate before and after smoothing and the added delay on staged real transitions; flicker should fall as designed and transition delay stay within budget.",
    dep: ["track-lifecycle"]
  },
  "class-taxonomy-mapping": {
    s: "Translates a model's labels into the categories the business and the event system use, handling merges, splits, hierarchies and unknowns.",
    d: "Models are trained on label sets that rarely match product vocabulary. A mapping table groups fine classes into coarse ones, drops irrelevant ones and renames outputs. Hierarchies allow a result to be reported as car or vehicle as needed. The mapping is part of the model release, since a retrained model with a new class list breaks consumers that assumed the old one. Unmapped classes should be explicit, not silently dropped.",
    k: ["Mapping in post-processing vs in training labels: post-processing mapping is flexible and keeps model detail; relabeling in training can give better accuracy on the target categories.", "Strict versioned taxonomy vs free-form labels: strict supports safe consumers; free-form is quick and breaks them.", "Report the finest class vs the safest coarse class: fine is informative and wrong more often; coarse is reliable and less useful."],
    p: ["A new model version adds a class and downstream rules ignore it because it is not in the mapping.", "Two different labels map to the same category and their separate thresholds conflict."],
    v: "Run a coverage check that every class a model can emit maps to a defined output or an explicit drop, and replay labeled data to confirm mapped category counts equal the sum of their sources.",
    dep: ["model-registry"]
  },
  "result-fusion": {
    s: "Combines outputs from several models, cameras or sensors into a single, more reliable result, by weighting, voting or geometric agreement.",
    d: "Ensembles of models average boxes or scores; overlapping cameras confirm detections by projecting them to a common ground plane; other sensors such as radar or door contacts confirm or veto visual detections. Fusion reduces false positives and fills gaps, at the cost of more compute and an added source of error in weighting and timing. Conflicting inputs need clear rules, and the fused result must carry which sources agreed for later explanation.",
    k: ["Early fusion of features vs late fusion of decisions: early uses more information and ties models together; late is modular and loses detail.", "Require agreement vs accept any source: agreement lowers false alarms and misses single-view events; any-source maximizes recall.", "Fixed weights vs learned weights: fixed is understandable; learned adapts and can overfit to one site."],
    p: ["A camera with a stale clock is fused with others and drags positions off.", "Agreement requirements hide a real event visible to only one camera."],
    v: "Compare fused results against each source on labeled multi-camera data: false positives must fall and recall must stay within the allowed loss, and every fused result must list its contributing sources.",
    dep: ["multi-camera-sync", "coordinate-mapping", "confidence-thresholds"]
  },
  "event-rules-engine": {
    s: "Evaluates conditions over tracks, zones, attributes and time to decide when something worth reporting has happened.",
    d: "Rules combine primitives: a person entered a zone, stayed ten minutes, with no helmet, outside working hours. A rule engine evaluates them over streaming results, keeping state per track and per rule, and emits an event when the condition becomes true. Rules are authored by operators through a configuration interface, versioned and testable against recorded footage. Complexity grows quickly, and rules that interact need ordering and conflict handling. A rule is only as good as the weakest signal in it.",
    k: ["Declarative rules vs code: declarative rules are editable by operators and testable; code allows any logic and puts every change through a release.", "Evaluate on the device vs in the cloud: on device gives low latency and works offline; cloud allows complex cross-camera logic.", "Edge-triggered vs level-triggered events: edge-triggered fires once per occurrence; level-triggered repeats while true and is easier to reason about."],
    p: ["A rule with several weak conditions fires rarely in tests and constantly in a busy site.", "Rule state is lost on restart and every standing violation fires again."],
    v: "Replay a library of recorded scenarios, each labeled with the expected events, through the rules and confirm exact event sets, including after a simulated restart in the middle of a scenario.",
    dep: ["zones-and-virtual-lines", "trajectory-and-dwell-analysis", "classification-and-attributes"]
  },
  "debouncing-and-hysteresis": {
    s: "Prevents event chatter by requiring a condition to hold for a minimum time to start and to stop, and by using separate thresholds for entering and leaving a state.",
    d: "Detections flicker, so a raw condition can toggle many times a second. A debounce timer or frame count requires persistence before an event begins, and a cooldown or release delay keeps it from ending on a single missed frame. Hysteresis uses a higher threshold to enter and a lower threshold to leave. Settings trade latency against stability and must be set per event type: an intrusion alert tolerates little delay, a queue length tolerates many seconds.",
    k: ["Long persistence vs short persistence: long suppresses noise and delays alerts; short is fast and chattery.", "Frame-count windows vs time windows: counts are simple and change meaning with frame rate; time windows are stable across rates.", "Cooldown after an event vs merging events: cooldown limits rate; merging keeps a complete record of one long occurrence."],
    p: ["Persistence counted in frames shortens when the system degrades to a lower frame rate and false events increase.", "Hysteresis thresholds set too far apart leave the event stuck on after the object has gone."],
    v: "Feed a recorded flickering signal through the rule and confirm one event is generated per real occurrence, with start and end within the tolerance, at both normal and halved frame rate.",
    dep: ["event-rules-engine"]
  },
  "event-schema": {
    s: "The versioned data contract of an event: type, source, times, location, objects, confidence, evidence references and the versions of everything that produced it.",
    d: "Consumers integrate against events, so their format is a public interface. A schema defines required and optional fields, units, coordinate systems and identifiers, with a version field and compatibility rules. It carries pointers to evidence, not the evidence itself, and enough provenance to reproduce the decision. Clear event identity makes redelivery idempotent. Fields that expose personal data are marked so later stages can strip them.",
    k: ["Strict schema with versions vs flexible payloads: strict makes consumers safe and slows changes; flexible is fast and breaks consumers quietly.", "Self-contained events vs references to stored data: self-contained are easy to consume and large; references stay small and depend on storage being there.", "One event type with many fields vs many specific types: one type is easy to route and becomes vague; specific types are clear and multiply."],
    p: ["A producer adds a field with different units and a consumer interprets it as the old unit.", "No stable event identifier exists, so a retry creates duplicates downstream."],
    v: "Validate every produced event against the schema in a contract test, run an old consumer against the newest producer, and confirm redelivered events carry the same identifier.",
    dep: ["frame-metadata"]
  },
  "pre-event-ring-buffer": {
    s: "A rolling in-memory or on-disk buffer of recent video, so that evidence can include the seconds before an event was detected.",
    d: "An event is detected after it begins, so the useful clip starts earlier. A ring buffer keeps the last N seconds of compressed or raw frames per camera and overwrites the oldest. On an event, the system copies the relevant range and continues recording for the post-event period. Compressed storage costs little but must begin at a keyframe; raw frames cost memory rapidly. Size is set by the longest pre-roll required times the number of cameras.",
    k: ["Buffer compressed packets vs decoded frames: packets are small and need decoding for stills; decoded frames are instantly usable and use large memory.", "Memory vs flash storage: memory is fast and volatile; flash survives power loss and wears.", "Fixed pre-roll vs per-event pre-roll: fixed is simple; per-event avoids waste and needs configuration."],
    p: ["The ring is sized for cameras at a lower bitrate and a night-time bitrate spike overwrites the pre-roll.", "A power loss clears an in-memory buffer just when the event happened."],
    v: "Trigger test events and confirm each clip contains the full configured pre-roll before the trigger time, starts on a decodable frame, and plays to the end at the highest camera bitrate.",
    dep: ["keyframe-and-gop-handling", "frame-buffer-pools"]
  },
  "evidence-clips-and-snapshots": {
    s: "The images and short videos attached to an event so a person can quickly judge it, with overlays marking what the system saw.",
    d: "On an event, the system extracts a best-frame snapshot, often the sharpest crop, and a clip from the ring buffer, optionally with boxes and labels drawn. Stored evidence is encrypted and indexed by event identifier, with its own retention. Overlays should be rendered separately from the original, so reviewers can see both. Evidence turns a bare alert into something actionable and is the first thing reviewed when an alert is disputed.",
    k: ["Burned-in overlays vs separate metadata: burned-in works anywhere and destroys the original; separate preserves it and needs a viewer.", "Upload every clip vs upload on request: every clip is convenient and costs bandwidth and privacy exposure; on-request saves both with delay.", "Best-frame selection vs the frame at detection time: best-frame is clearer for reviewers; detection time is exactly what the system decided on."],
    p: ["The snapshot is taken at detection and shows a blurred partial object, so reviewers dismiss real events.", "Clips remain after the event record is deleted, outliving their retention."],
    v: "For a sample of events, verify that the clip and snapshot open from the event link, show the cause with the overlay, and are removed together with the event at retention expiry.",
    dep: ["pre-event-ring-buffer", "event-schema", "retention-and-deletion"]
  },
  "reliable-event-delivery": {
    s: "Moves events from the device to consumers over unreliable links, with local persistence, retry, ordering and exactly-once effects despite at-least-once delivery.",
    d: "Events are written to a local durable queue before any send, then transmitted with acknowledgment and retried with backoff. Delivery is at-least-once, so consumers deduplicate by event identifier. Ordering is guaranteed per camera or not at all, and the system documents which. Disconnected devices buffer for hours, so queue size and eviction policy matter. Large evidence uploads are separated from small event messages and prioritized below them.",
    k: ["At-least-once with deduplication vs at-most-once: at-least-once never loses events and requires idempotent consumers; at-most-once is simple and loses events at the worst time.", "Local queue on flash vs in memory: flash survives power loss and wears; memory is fast and loses data.", "Drop oldest vs drop newest when full: dropping oldest keeps recent information; dropping newest preserves the sequence."],
    p: ["After a day offline, the backlog floods the network on reconnect and delays new urgent events.", "Eviction drops alarm events along with routine counts because they share one queue."],
    v: "Disconnect a device for six hours with events flowing, reconnect and confirm every event arrives exactly once in the store, urgent events first, with no duplicates visible to the consumer.",
    dep: ["event-schema", "device-health-and-ota"]
  },
  "alert-routing-and-dedup": {
    s: "Decides who is told about an event, by what channel and how often, merging repeats so people are not overwhelmed.",
    d: "Events are mapped to recipients and channels by site, type, severity and schedule, with escalation if unacknowledged. Deduplication groups related events, such as the same object lingering, into one incident that updates. Rate limits protect recipients and downstream services. Alert fatigue is the failure that ends deployments: when most alerts are false, people stop looking, so feedback on alert quality should flow back into thresholds.",
    k: ["Group into incidents vs notify per event: incidents reduce noise and need grouping rules; per event is simple and floods.", "Push on every severity vs digest for low severity: digests protect attention and delay information.", "Acknowledgment and escalation vs fire and forget: escalation ensures a response and requires on-call structure."],
    p: ["A window reflection causes forty alerts an hour and the recipient mutes the channel for good.", "Grouping merges two separate incidents and one is never escalated."],
    v: "Replay a day of events with known duplicates and confirm the number of notifications equals the number of distinct incidents, with escalation firing for an unacknowledged high-severity one.",
    dep: ["event-schema", "event-rules-engine"]
  },
  "edge-cloud-split-of-events": {
    s: "The decision about which event logic runs on the camera device, which in the cloud, and what data crosses the network between them.",
    d: "Light decisions, such as detection, tracking and simple rules, run on the device and send small events. Cross-camera analysis, historical comparison and expensive models run in the cloud on selected clips or metadata. The split determines bandwidth, latency, offline behavior, cost and privacy exposure. It should be changeable per site, since bandwidth and policy differ, and the contract between the sides must be explicit, so a rule can move without changing consumers.",
    k: ["More on the device vs more in the cloud: device logic is fast, private and works offline and needs hardware and fleet updates; cloud logic is easy to update and costs bandwidth.", "Send metadata only vs send video: metadata is small and private; video gives full review and costs bandwidth and risk.", "Same logic in both places vs different logic: same logic is portable and requires compatible runtimes; different logic is optimized and drifts."],
    p: ["A rule moved to the cloud stops working during a network outage that the device used to ride out.", "Cloud and device versions of the same rule diverge and produce different counts."],
    v: "Cut the uplink for an hour and confirm the device-resident alert rules still fire locally and queue their events, while the cloud-only analyses resume with no data loss afterward.",
    dep: ["reliable-event-delivery", "event-rules-engine"]
  },
});
