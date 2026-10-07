// Details for the vision pipeline plate, part 3: model optimization, accelerators and perception models.
ATLAS.details("vision-pipeline", {
  "quantization": {
    s: "Represents weights and activations in low-precision integers instead of floating point, shrinking models and speeding inference at some risk to accuracy.",
    d: "Values are mapped to eight-bit or smaller integers using a scale and zero point per tensor or per channel. Post-training quantization measures value ranges on sample data; quantization-aware training simulates the rounding during training to recover accuracy. Memory traffic falls fourfold and integer units are faster and more power-efficient. Layers with wide value ranges, such as attention or final regression heads, lose the most, and mixed precision keeps them in higher precision. Quality must be checked on the task's real metric.",
    k: ["Post-training quantization vs quantization-aware training: post-training is quick and needs no labels; training-aware recovers accuracy at the cost of a training run.", "Per-tensor vs per-channel scales: per-channel is more accurate; some accelerators support only per-tensor.", "Eight-bit vs lower bit widths: lower widths shrink more and lose accuracy sharply on small models."],
    p: ["Aggregate accuracy looks fine while small-object recall falls, because a rare range was clipped.", "Calibration on daytime images makes night frames saturate and detection collapses after dark."],
    v: "Evaluate the quantized and original models on the same labeled held-out set, including night and rare classes; per-class metrics must stay within the gate and on-device outputs must match the offline quantized model.",
    dep: ["quantization-calibration-set", "model-interchange-format"]
  },
  "pruning-and-distillation": {
    s: "Reduces model size and cost by removing low-value weights or channels, or by training a small student to imitate a large teacher.",
    d: "Structured pruning removes whole channels or layers so the dense hardware actually runs faster; unstructured pruning zeros individual weights and helps only with sparse support. Distillation trains a compact model on a large model's soft outputs, often on abundant unlabeled field images. Both need retraining or fine-tuning to recover accuracy and are repeated per architecture and target. The gain is real on edge hardware and the cost is added training complexity and another model to version.",
    k: ["Structured vs unstructured pruning: structured gives real speedups on ordinary hardware; unstructured compresses more but needs sparse kernels.", "Distillation vs training the small model directly: distillation transfers behavior from a stronger teacher; it needs the teacher and extra training time.", "Prune after training vs during training: after is simple; during finds better trade-offs and costs a custom recipe."],
    p: ["A pruned model passes the average-accuracy test and loses the rare class that mattered.", "The teacher's mistakes and biases are copied into the student and then hard to find."],
    v: "Benchmark the pruned or distilled model on the target device and confirm measured latency drops as claimed, with per-class accuracy inside the gate on the full evaluation set.",
    dep: ["accuracy-regression-gate", "training-and-evaluation"]
  },
  "graph-compilation-and-fusion": {
    s: "Transforms a trained network into an optimized executable for one target: fusing operations, choosing kernels and planning memory.",
    d: "A compiler takes the exported graph and applies constant folding, operator fusion such as convolution with normalization and activation, layout changes, precision assignment and kernel autotuning for the specific hardware. It plans buffer reuse to cut peak memory. The output is a hardware-specific plan, often not portable across device variants or runtime versions. Compilation can take minutes and sometimes changes numerical results slightly, which needs to be tested.",
    k: ["Ahead-of-time vs on-device compilation: ahead-of-time produces tested artifacts and needs one per target; on-device adapts to any hardware and is slow and unrepeatable.", "Aggressive fusion vs conservative fusion: aggressive is faster; it changes rounding and can break rarely used paths.", "Autotuning vs heuristics: autotuning finds the fastest kernels and adds build time and nondeterminism."],
    p: ["A compiled plan is run on a different driver version and silently produces slightly different outputs or fails to load.", "Fusion changes numeric results enough that tuned thresholds shift."],
    v: "Compare compiled-plan outputs against the reference graph on a fixed input set, within tolerance, and measure latency and peak memory on every supported device variant.",
    dep: ["model-interchange-format", "operator-coverage-and-fallback"]
  },
  "operator-coverage-and-fallback": {
    s: "The question of which network operations each accelerator can execute, and what happens to the ones it cannot: split execution on the processor, or model redesign.",
    d: "Accelerators implement a fixed set of operators, data types and shapes. Unsupported operations force the graph to be partitioned, with segments bouncing between accelerator and processor and paying a copy at each boundary. Occasionally one unsupported operation near the output dominates latency. The compiler reports partitions; engineers then replace operations with supported equivalents or move them to post-processing. Coverage changes with each runtime release.",
    k: ["Fallback to the processor vs rewrite the model: fallback works immediately and may be slower than the processor alone; rewriting costs engineering and retraining.", "Include decoding in the model graph vs outside it: inside keeps one artifact; outside uses operations the accelerator may not support.", "Target the least capable device vs per-device variants: lowest common denominator is simple; variants give performance and multiply artifacts."],
    p: ["One unsupported activation splits the graph into a dozen partitions and latency triples.", "A runtime update adds a partition rule and a previously fast model slows down in the field."],
    v: "Dump the compiled partition report for each target and confirm that the whole graph runs on the accelerator, or that every fallback boundary count is within the budget.",
    dep: ["npu-and-dsp-delegates", "cpu-inference-path"]
  },
  "quantization-calibration-set": {
    s: "A curated sample of representative frames used to measure value ranges when quantizing, covering lighting, scenes and classes the field will present.",
    d: "Post-training quantization chooses scales from activations observed on calibration images. The set must resemble deployed input, not training-set photographs: all times of day, weather, camera types and the rare cases that stress ranges. A few hundred well-chosen frames beat thousands of similar ones. The set is versioned and stored with the model so a rebuild is reproducible, and it is refreshed from field data when the scenes change.",
    k: ["Field frames vs training images: field frames match deployment ranges; they are unlabeled and may include private content that must be handled.", "Small diverse set vs large random set: diverse small sets are cheap and need curation; large random sets are easy and over-represent common scenes.", "One set for all cameras vs per-site sets: one set is simple; per-site gives tighter ranges and many builds."],
    p: ["A calibration set of daytime frames yields scales that clip at night.", "The set contains a camera that was later replaced and no longer matches any field device."],
    v: "Compare the activation ranges from the calibration set against ranges observed on a week of field frames; the field values should fall inside the calibrated ranges for all layers apart from rare outliers.",
    dep: ["dataset-versioning"]
  },
  "accuracy-regression-gate": {
    s: "An automated check that blocks a model from release if its accuracy, per class and per slice, falls below the incumbent or an absolute floor.",
    d: "Every candidate model, and every optimized variant of it, is evaluated on a frozen test set and on slices such as night, rain, small objects and each camera type. The gate compares against the production model and thresholds set by product needs, using confidence intervals so noise is not mistaken for change. It also checks latency and memory on target hardware. A release without passing the gate cannot reach the registry as production.",
    k: ["Gate on aggregate vs gate on slices: aggregate is simple and hides regressions; slices catch them and need more labeled data and more failures to review.", "Strict thresholds vs allowing small regressions for speed: strict protects quality; allowing trade-offs makes optimization possible and needs explicit approval.", "Frozen test set vs a refreshed one: frozen allows comparison over time; refreshed tracks the field and breaks history."],
    p: ["The test set leaks into training over time and the gate approves models that are merely memorizing it.", "The gate runs on the floating-point model and the shipped quantized one regresses unnoticed."],
    v: "Submit a deliberately degraded model, such as one with a corrupted class, and confirm the gate blocks it and names the failing slice, then submit the incumbent and confirm it passes.",
    dep: ["quantization", "training-and-evaluation", "slice-based-accuracy"]
  },
  "model-interchange-format": {
    s: "A framework-neutral file format that describes a trained network's graph and weights so it can move from training tools to many inference runtimes.",
    d: "Exporting to an interchange format decouples training frameworks from deployment runtimes. The file lists operators, shapes, weights and metadata such as input names and normalization. Runtimes support particular versions of the operator set, so an export may need a specific version or rewrite to run everywhere. Dynamic shapes and custom operators are the most common sources of export failure. The format is also where preprocessing metadata should travel, so the deployed pipeline can read it.",
    k: ["Interchange format vs native format per runtime: one format simplifies the toolchain; native formats expose runtime-specific features.", "Dynamic shapes vs fixed shapes: dynamic is flexible; fixed shapes compile to faster, simpler plans.", "Include post-processing in the exported graph vs leave outside: included means one artifact and potential unsupported operations; outside is flexible and gives more places to mismatch."],
    p: ["A custom operator exports as a placeholder that loads fine and fails at first inference on the device.", "The export silently bakes in the batch size used during tracing."],
    v: "Run the exported file in the target runtime and in the training framework on 100 reference images and confirm outputs agree within tolerance, including at the smallest and largest supported input sizes.",
    dep: []
  },
  "edge-friendly-architectures": {
    s: "Network designs chosen for memory bandwidth and supported operators on small devices: lightweight convolutions, simple heads and few unusual layers.",
    d: "Parameter count is a poor proxy for speed on edge hardware; memory traffic, operator support and parallelism matter more. Architectures built from depthwise separable convolutions, reparameterizable blocks and simple necks run well on accelerators, and plain convolution stacks suit fixed-function units. Heads that avoid operators needing complex post-processing keep the graph on the accelerator. Choosing the architecture is done with measurements on the actual target, not floating-point operation counts.",
    k: ["Efficiency-designed architecture vs shrinking a large one: purpose-built networks give better trade-offs; adopting one means retraining and a new baseline.", "Transformer-style blocks vs convolutional blocks: attention captures wide context; convolutions are far better supported on current edge accelerators.", "One backbone for all tasks vs a task-specific backbone: shared saves memory and compute; specialization wins accuracy."],
    p: ["A network chosen for low operation count runs slower than a larger one because of memory-bound layers.", "A new head type is unsupported by the target runtime and the model never reaches the device."],
    v: "Measure latency, power and accuracy of candidate architectures on the actual device at the deployed resolution and choose from the measured frontier, not from published figures.",
    dep: ["operator-coverage-and-fallback"]
  },
  "gpu-inference-runtime": {
    s: "The runtime that executes compiled networks on a graphics processor, managing streams, memory, kernels and precision modes.",
    d: "It loads a plan, binds input and output buffers, launches kernels on asynchronous command streams and synchronizes results. Features include half-precision and integer modes, concurrent streams and multiple execution contexts per model. It shares the device with decoding, preprocessing and sometimes display, so contention among them determines real throughput. Driver, runtime and plan versions must agree, which is the leading source of deployment failures on fleets.",
    k: ["One context per stream vs a shared context: per-stream isolates state with more memory; shared saves memory and needs careful locking.", "Half precision vs full precision: half precision doubles throughput on supporting hardware; some layers need full precision to stay stable.", "Dedicated device for inference vs shared with other work: dedicated gives predictable latency; sharing uses fewer devices."],
    p: ["A driver update changes kernel selection and a stable pipeline gets 20 percent slower.", "Device memory fragments after weeks of loading and unloading models and allocation fails."],
    v: "Run an eight-hour load at the rated stream count and confirm latency percentiles are steady, device memory is flat, and no kernel error appears in the driver log.",
    dep: ["device-memory-management", "graph-compilation-and-fusion"]
  },
  "npu-and-dsp-delegates": {
    s: "Interfaces to fixed-function neural accelerators and signal processors, which run supported operators at high efficiency through a vendor-specific delegate.",
    d: "Low-power devices pair a processor with a neural accelerator or signal processor that runs quantized graphs at low energy. The runtime hands supported subgraphs to the delegate and keeps the rest on the processor. Delegates have strict constraints on operators, shapes and data types, often integer-only, and each has its own compiler and calibration flow. Performance claims are quoted at peak; sustained throughput depends on memory bandwidth and thermal state.",
    k: ["Delegate for the whole graph vs partial offload: whole-graph offload is efficient; partial offload with frequent boundaries can lose to the processor alone.", "Vendor-specific compiler vs generic runtime path: vendor tools extract peak performance and tie the build to one chip family.", "Integer-only execution vs mixed precision: integer-only is the most efficient; it constrains models and quantization quality."],
    p: ["Marketed peak throughput is never reached because the model is memory-bound and the unit throttles.", "A silicon revision changes numerical behavior and a quantized model's accuracy shifts."],
    v: "Run the compiled model on the delegate and on the reference runtime for 10,000 frames; outputs must agree within tolerance, and sustained frames per second at steady temperature must meet the target.",
    dep: ["operator-coverage-and-fallback", "thermal-and-power-management", "quantization"]
  },
  "cpu-inference-path": {
    s: "Running models on the general-purpose processor using vectorized kernels: the universal fallback and the whole answer on cheap devices.",
    d: "Optimized processor runtimes use vector instructions, multiple threads and quantized kernels. They support nearly every operator and run on every device, which makes them the reference and the fallback. Throughput is far below accelerators, and inference competes with decoding, tracking and networking for the same cores. Thread count tuning and core pinning matter. Small models, low frame rates and few streams are well served; large detectors at high rates are not.",
    k: ["Many threads on one model vs one thread per stream: many threads cut latency of a single frame; one per stream yields better throughput without contention.", "Processor-only deployment vs accelerator required: processor-only is cheap and simple to ship; it limits model size and stream count.", "Lower-precision kernels vs full precision: lower precision multiplies speed and needs calibration."],
    p: ["Inference threads starve the decoder and the network stack and the whole device stutters.", "A fallback silently taken in production makes a fast build run at a fifth of its speed."],
    v: "With accelerators disabled, run the full pipeline at the declared fallback stream count and confirm processor use stays below the limit and latency within the fallback budget.",
    dep: []
  },
  "device-memory-management": {
    s: "Allocation, reuse and release of memory on the accelerator for weights, activations and frames, within a fixed capacity shared with other work.",
    d: "Edge devices often share one memory pool between processor and accelerator, and have only a few gigabytes. The manager budgets weights, activation workspace per execution context, frame pools and decoder surfaces, and pre-allocates them to avoid fragmentation and out-of-memory events at runtime. Loading a second model or adding a stream is a memory decision. It reports headroom to the scheduler so overload shows up as a controlled refusal and not as a crash.",
    k: ["Pre-allocate everything vs allocate on demand: pre-allocation gives predictable behavior and wastes memory; on-demand is frugal and can fail under load.", "Share activation workspace across models vs separate: sharing saves memory and serializes those models.", "Unified memory vs separate device memory: unified avoids copies and lets contention surprise you."],
    p: ["Memory fragmentation after many model swaps leads to an allocation failure with plenty of total free memory.", "A leaking pipeline stage is invisible until the out-of-memory killer takes the whole inference process."],
    v: "Report memory by owner after startup, after a day, and after twenty model swaps; growth must stay below the stated threshold and every allocation failure must show up as a refused request, not a crash.",
    dep: []
  },
  "zero-copy-buffer-sharing": {
    s: "Passing frames between decoder, preprocessor and inference runtime as shared device buffers, avoiding copies through system memory.",
    d: "A decoded frame in device memory can be imported by the preprocessing kernel and the inference engine through shared handles, with synchronization primitives marking when each producer has finished. This removes the largest per-frame bandwidth cost. It requires that all stages agree on formats, alignment and ownership, and that the driver allows cross-component sharing. When any stage cannot import the buffer, the system must fall back to a copy while still working correctly.",
    k: ["Zero-copy everywhere vs copy at boundaries: zero-copy saves bandwidth and couples components tightly to driver features; copies are portable and cost bandwidth.", "Explicit synchronization vs implicit ordering: explicit is correct on all drivers; implicit is simpler and breaks on some.", "Shared pool owned centrally vs per-stage buffers: central ownership clarifies lifetime; per-stage is easier to build."],
    p: ["A consumer reads a buffer before the producer finished writing and tears appear in one frame in thousands.", "A driver update changes alignment rules, causing import failures that silently fall back to copying and double bandwidth use."],
    v: "Use bandwidth and copy counters from the platform's profiler to confirm that no frame crosses to system memory on the main path, and compare results against a copying reference over a long run.",
    dep: ["device-memory-management", "frame-buffer-pools"]
  },
  "thermal-and-power-management": {
    s: "Keeps sustained performance within the device's heat and power limits, by monitoring temperature and adjusting clocks, rate or model choice before the hardware throttles itself.",
    d: "Edge devices in sealed enclosures in summer heat cannot dissipate the power peak benchmarks assume. When temperature rises, firmware lowers clocks abruptly, which is visible as sudden latency changes. Software sees temperatures and power states and can reduce sampling rate, switch to a smaller model, or lower accelerator frequency in a controlled way. Battery or solar devices add an energy budget. Test conditions must include hot enclosures, not an air-conditioned lab.",
    k: ["Controlled degradation vs hardware throttling: controlled steps keep accuracy predictable; letting hardware throttle is simple and gives erratic latency.", "Performance profile fixed per site vs adaptive: fixed is predictable and wastes headroom; adaptive uses it and varies.", "Active cooling vs passive: fans add capacity and failure points; passive is silent and reliable and less powerful."],
    p: ["Midday throttling halves throughput and the dashboard shows the stream rate dropping without a cause.", "Benchmarks run cold and report capacity the device cannot sustain in its enclosure."],
    v: "Run the full load in a heat chamber at the maximum rated ambient temperature for hours and confirm sustained throughput and accuracy stay within their targets, with degradation steps logged in order.",
    dep: ["backpressure-and-load-shedding"]
  },
  "multi-accelerator-placement": {
    s: "Decides which models and streams run on which accelerators in devices that have several, including mixing a graphics processor, a neural unit and a processor.",
    d: "A device with two accelerators can run different models in parallel or split streams between them. Placement weighs each unit's speed for a given model, memory, transfer costs between them and failure isolation. It can be static per model or dynamic by load. Moving a frame between devices costs a copy, so stages that share data sit together. A failed or hot accelerator should lead to replacement on another, even at lower speed.",
    k: ["Static placement vs dynamic placement: static is predictable and easy to debug; dynamic balances load and is hard to reason about.", "Replicate a model on both units vs one model per unit: replication balances load and doubles memory; one per unit saves memory and may leave one idle.", "Keep a stage's data on one device vs split across: co-location avoids transfers; split uses more units."],
    p: ["Both models are placed on the faster unit and the other sits idle while latency rises.", "Failover moves a heavy model to the processor and starves every other function."],
    v: "Disable each accelerator in turn and confirm the remaining placement keeps all required streams running with the documented reduced capacity, and that restoring it returns to the normal placement.",
    dep: ["gpu-inference-runtime", "npu-and-dsp-delegates", "cpu-inference-path"]
  },
  "object-detection": {
    s: "A model that finds objects in an image and returns a class, a score and a bounding box for each, the workhorse of most vision pipelines.",
    d: "A backbone extracts features at several scales, a neck mixes them, and a head predicts boxes and class scores at dense locations. Single-pass detectors are fast and dominate the edge; two-stage designs refine proposals for accuracy. Output is a large set of candidate boxes that post-processing prunes. Accuracy varies strongly with object size, occlusion, viewpoint and class frequency, and is measured by precision and recall at thresholds, not by one number.",
    k: ["Anchor-based vs anchor-free heads: anchors encode prior shapes and need tuning per dataset; anchor-free is simpler to deploy and may localize small objects less well.", "Single-stage vs two-stage: single-stage is fast on the edge; two-stage is more accurate on small or crowded objects at several times the cost.", "Few broad classes vs many fine classes: broad classes are robust; fine classes are useful and harder to learn from field data."],
    p: ["A detector trained on web photographs misses people seen from a ceiling camera.", "A single confidence threshold set globally fits no individual class well."],
    v: "On a labeled held-out set drawn from the deployed cameras, report precision and recall per class, size bucket and lighting, and confirm each meets its target at the production threshold.",
    dep: ["resize-and-letterbox", "normalization-and-layout", "box-decoding"]
  },
  "box-decoding": {
    s: "Converts a detector's raw output tensors into boxes with classes and scores: applying anchors, strides, offsets and activation functions.",
    d: "Raw outputs are grid cells with offsets, scales and logits relative to anchors or points. Decoding applies activations, multiplies by stride and anchor sizes, merges objectness with class scores and filters the cells below a floor. Its location varies: inside the compiled graph, as a separate step on the processor or fused with suppression. Subtle bugs include swapped coordinate order, wrong stride per level and confusing center with corner formats.",
    k: ["Decode inside the model vs outside: inside gives one artifact and may use unsupported operations; outside is flexible and a place for version mismatch.", "Low score floor vs high floor before suppression: low keeps recall and costs time on thousands of candidates; high is fast and drops hard cases.", "Per-class vs class-agnostic scoring: per-class is accurate on overlapping classes; class-agnostic is faster."],
    p: ["Decoder constants copied from another model shift all boxes slightly, and tests with large objects pass.", "A change of input size without updating strides places boxes wrongly only at the borders."],
    v: "Run synthetic images with rectangles at known positions and confirm decoded boxes match ground truth within one pixel for every scale level and for objects at all four image corners.",
    dep: ["object-detection"]
  },
  "classification-and-attributes": {
    s: "Models that label a whole image or a cropped object with categories or properties: vehicle type, clothing color, helmet worn, door open.",
    d: "Run on crops from a detector or on the full frame, a classifier outputs a probability per label, often several independent attributes at once. Crops are resized and normalized like full frames. Attribute models are cheap but depend heavily on crop quality: motion blur, partial occlusion and tiny crops produce confident wrong answers. Combining predictions over a track's lifetime is usually more accurate than any single frame.",
    k: ["Multi-label heads vs separate classifiers: one multi-label model is efficient; separate models are independently updated and cost more.", "Classify every frame vs best crop per track: every frame is simple and wasteful; best crop saves compute and needs crop quality scoring.", "Closed set vs open set with an unknown class: closed is easier to train; open handles surprises and needs negative data."],
    p: ["Tiny crops from distant objects produce confident labels that are noise.", "A new vehicle type appears and is always forced into the nearest known class."],
    v: "Score attributes on held-out crops stratified by crop size and blur, and confirm accuracy by stratum, with an abstain option for crops below the minimum quality, meets target.",
    dep: ["object-detection", "region-of-interest-cropping"]
  },
  "semantic-segmentation": {
    s: "Models that assign a class to every pixel, such as road, floor, sky or vegetation, to describe regions rather than countable objects.",
    d: "An encoder-decoder network outputs a class map at some fraction of the input resolution. It is used for drivable or walkable area, spill and obstruction detection, background removal and region-based rules. Cost is higher than detection because output is dense, and upsampling produces ragged boundaries. Class definitions are the hard part: boundaries between categories are subjective and labeling is expensive per image.",
    k: ["Output at full resolution vs lower resolution: full resolution gives crisp edges at much higher cost; lower is fast and blurs thin structures.", "Segmentation vs detection for region rules: segmentation handles irregular shapes; detection is cheaper where boxes are enough.", "Real-time compact networks vs large accuracy-focused ones: compact ones fit the edge and lose boundaries and rare classes."],
    p: ["Boundaries flicker frame to frame and zone-entry rules fire repeatedly.", "Labelers disagree on class edges, so the model learns inconsistent boundaries and metrics plateau."],
    v: "Compute per-class intersection over union on held-out frames from each camera, and confirm the region-based rule fires correctly on staged scenarios for each class boundary.",
    dep: ["resize-and-letterbox", "mask-refinement"]
  },
  "instance-segmentation": {
    s: "Models that produce a separate pixel mask for each detected object, separating touching objects and giving precise shapes and areas.",
    d: "A detector head is extended with a mask branch, or masks are predicted as coefficients over shared prototypes and combined per instance. It gives areas for measurement, cleaner crops for classification and occlusion handling in crowds. Masks are lower resolution than the frame and are cropped to the box, then pasted into image coordinates. Cost grows with the number of instances, which varies per frame and makes latency less predictable.",
    k: ["Instance masks vs boxes plus classification: masks give shapes and accurate area at higher compute; boxes suffice for counting and location.", "Prototype-based masks vs per-instance mask heads: prototypes are fast and fixed cost; per-instance heads are precise and scale with count.", "Mask resolution: higher resolution is smoother and larger in memory; low resolution is fast and rough."],
    p: ["A crowded scene produces a hundred instances and the mask stage blows the latency budget.", "Mask areas are used for measurement without calibrating for perspective."],
    v: "On crowded and sparse test scenes, measure mask intersection over union against annotations and per-frame latency against the instance count, and confirm the worst case stays within budget.",
    dep: ["object-detection", "mask-refinement"]
  },
  "pose-and-keypoints": {
    s: "Models that locate body or object landmarks such as joints, corners or wheel centers, enabling posture, gesture and orientation analysis.",
    d: "Top-down methods detect people and then estimate keypoints in each crop; bottom-up methods find all keypoints and group them. Outputs are coordinates with confidence per point, and skeleton graphs link them. Rules for falls, unsafe lifting or gestures run on sequences of poses, not single frames. Accuracy falls with occlusion and unusual viewpoints, and keypoint jitter needs temporal smoothing.",
    k: ["Top-down vs bottom-up: top-down is accurate and its cost grows with the number of people; bottom-up has near-constant cost and groups points less reliably.", "Pose on every frame vs on triggered tracks: always on gives rich data at high cost; triggered saves compute and starts late.", "Heatmap regression vs direct coordinate regression: heatmaps are accurate and large; direct regression is compact and less precise."],
    p: ["Occluded joints are hallucinated with high confidence and a fall rule fires on a person sitting behind a desk.", "Camera elevation angles absent from training data collapse accuracy."],
    v: "Replay recorded sequences with labeled actions and confirm event precision and recall per camera angle, and keypoint error on a held-out annotated set below the specified pixel distance.",
    dep: ["object-detection", "temporal-smoothing"]
  },
  "text-reading": {
    s: "Locating and decoding text and codes in frames, such as plates, container numbers, labels and barcodes, in a detect-then-recognize sequence.",
    d: "A text detector finds regions, which are rectified and passed to a recognizer that outputs character sequences with confidence. Linear and two-dimensional codes use dedicated decoders. Input resolution matters most: characters need a minimum pixel height, so cameras are aimed and zoomed for this task. Output is validated against format rules and checksums, and read across several frames of a track to vote for the most likely string.",
    k: ["Single-frame reading vs voting across a track: single frame is fast; voting is much more accurate and delays the answer.", "Learned recognizer vs rule-based decoding for codes: codes have exact decoders that never mistake characters; learned models handle damage and perspective.", "Constrain to known formats vs unconstrained text: constraints cut errors; they reject legitimate unusual strings."],
    p: ["Confusion between similar characters yields valid-looking but wrong plate numbers that silently match a different record.", "Motion blur at night exposure wipes out characters and no read is attempted on better frames."],
    v: "Compare read strings with ground truth over a labeled set across day, night and rain, reporting exact-match rate and the share of confident wrong reads separately from no-reads.",
    dep: ["region-of-interest-cropping", "temporal-smoothing"]
  },
  "appearance-embeddings": {
    s: "Models that map an object crop to a vector so that the same instance lies close together across frames and cameras, used for re-identification and search.",
    d: "A network trained with metric learning produces a fixed-length vector per crop; distance in that space indicates likelihood of being the same object. It supports tracking across occlusion, matching across cameras and searching an archive by example. Quality depends on crop quality, pose, lighting and clothing or livery changes. Vectors of people are biometric-adjacent data and bring privacy duties.",
    k: ["Compact vectors vs high-dimensional vectors: compact vectors store and match cheaply; high dimensions separate similar instances better.", "Per-detection embeddings vs per-track aggregates: per-detection is noisy; aggregates are robust and cost latency.", "General-purpose embedding vs one trained for the target class: general works out of the box; specialized wins accuracy."],
    p: ["Two people in similar uniforms collapse to nearly the same vector and tracks swap identities.", "Embeddings from one model version are compared with a new version's and all matches become random."],
    v: "On a labeled multi-camera set, measure the rank-one match rate and the false match rate at the deployed distance threshold, separately per camera pair.",
    dep: ["object-detection", "model-registry"]
  },
  "depth-estimation": {
    s: "Estimating distance to each pixel from one or two cameras, giving scale and 3D position to detections that images alone cannot supply.",
    d: "Stereo pairs triangulate depth from disparity given calibration. Single-image networks infer relative or metric depth from learned cues, with scale ambiguity. Depth gives object height and distance for proximity alerts and volume estimates, and helps separate foreground from background. Accuracy falls with range, textureless surfaces and reflective materials. Dedicated depth sensors skip the estimation and add their own noise and range limits.",
    k: ["Stereo vs monocular estimation: stereo gives metric depth and needs two calibrated cameras; monocular works with any camera and has scale uncertainty.", "Dense depth vs depth at detected objects only: dense is expensive; object-only reads a few pixels and uses less compute.", "Learned depth vs active depth sensor: learned costs no hardware; active sensors are accurate at short range and fail in sunlight."],
    p: ["Reflective floors produce deep holes in the depth map and objects appear to float.", "Metric scale from a monocular model drifts between scenes and distance rules misfire."],
    v: "Place targets at measured distances across the working range and compare estimated against tape-measured distances, reporting error by range and surface type.",
    dep: ["camera-calibration", "multi-camera-sync"]
  },
});
