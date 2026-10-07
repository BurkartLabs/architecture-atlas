// Details for the vision pipeline plate, part 2: preprocessing and inference scheduling.
ATLAS.details("vision-pipeline", {
  "color-space-conversion": {
    s: "Converts decoded frames from the video codec's luma-chroma layout into the channel order and range the model expects, usually three-channel RGB.",
    d: "Decoders emit planar or semi-planar luma and subsampled chroma, in limited or full range and with a particular color matrix. Models expect interleaved or planar red, green and blue, in a defined order. Conversion applies the right matrix and range, upsamples chroma and may be fused with resize on the accelerator. A wrong matrix or channel order does not crash anything; it shifts colors and costs a few points of accuracy that are easy to miss.",
    k: ["Convert on the accelerator vs on the processor: accelerator conversion avoids copies and is nearly free; it needs kernels for every input format.", "Convert at full resolution vs after resizing: converting after the resize costs less; chroma upsampling then happens on a smaller image with slightly different results.", "Grayscale or infrared input vs forced three channels: single channel is cheaper; most pretrained models need replicated channels."],
    p: ["Swapped red and blue channels still produce plausible detections with a few points lower accuracy that no test notices.", "Limited-range video treated as full range makes images look washed out and shifts confidence scores."],
    v: "Feed a test chart with known red, green and blue patches through the pipeline, dump the model's input tensor and confirm patch values match the training-time preprocessing within one quantization step.",
    dep: ["video-decoding"]
  },
  "resize-and-letterbox": {
    s: "Scales frames to the model's input size, preserving aspect ratio with padding where required, and records the transform for mapping results back.",
    d: "Models take fixed or bounded input sizes. Resizing uses an interpolation method, such as bilinear or area averaging, that must match training. Letterboxing pads to keep aspect ratio so objects are not stretched; stretching is simpler but changes shapes. The scale and offset are stored with the frame so coordinates can be returned to the original image. Downscaling loses the small objects detection depends on, so input size is a direct accuracy-versus-cost choice.",
    k: ["Letterbox vs stretch to fit: letterboxing preserves shape and wastes compute on padding; stretching fills the input and distorts objects, which only helps if training did the same.", "Larger input vs smaller input: larger sees small objects but cost grows with area; smaller is fast and misses distant targets.", "Interpolation fidelity vs speed: area or bicubic resampling is accurate; nearest neighbor is fast and aliases."],
    p: ["A different interpolation method than training lowers accuracy on thin or small objects without any visible problem.", "The padding offset is forgotten and every box is shifted by the padding size."],
    v: "Draw boxes on a test image with known object positions, run the full path through resize and back, and confirm boxes land on the objects within a pixel of the original image.",
    dep: ["color-space-conversion", "frame-metadata"]
  },
  "normalization-and-layout": {
    s: "Applies the per-channel scale and mean the model was trained with and arranges the tensor in the memory layout and data type the runtime expects.",
    d: "Pixel values are scaled to a numeric range and standardized per channel, then packed channel-first or channel-last in floating or integer type. Quantized models take integers with a scale and zero point, which turns normalization into part of the quantization contract. The values come from the training recipe and are easy to carry across incorrectly. Doing this fused on the accelerator avoids a slow pass over the image on the processor.",
    k: ["Normalize outside the model vs bake it into the model: baking removes a mismatch class and an extra pass; it ties the model to one input convention.", "Channel-first vs channel-last layout: each fits particular hardware; converting between them costs a transposition.", "Floating-point input vs integer input: integer is smaller and faster for quantized models; it needs exact scale agreement."],
    p: ["Mean and standard deviation of the wrong dataset are used, so scores shift and a threshold tuned on one build fails on another.", "Integer inputs saturate on bright scenes because the scale assumed a narrower range."],
    v: "Run a fixed reference image through the pipeline and through the training framework's own preprocessing; the two output tensors must match within the stated numeric tolerance.",
    dep: ["resize-and-letterbox", "model-interchange-format"]
  },
  "region-of-interest-cropping": {
    s: "Restricts processing to configured regions of the image, cutting cost and ignoring areas that cannot matter, such as sky or a neighboring property.",
    d: "Operators draw polygons or rectangles of interest per camera. The pipeline crops to their bounding box before resizing, which raises effective resolution on target, and masks excluded areas so detections there are discarded or never computed. It can also feed a second-stage model with crops from a first-stage detection, such as reading text from a located plate. Coordinates must be mapped back precisely. The region is part of the configuration of each camera and drifts out of date when scenes change.",
    k: ["Crop before inference vs filter detections afterward: cropping saves compute and raises resolution on target; filtering keeps full context for the model.", "Static regions vs learned or adaptive regions: static is predictable and manual; adaptive follows activity and is harder to audit.", "Crop with margin vs tight crop: margin keeps objects crossing the boundary intact; tight crops cut them and produce partial detections."],
    p: ["A camera is moved but the region stays, and the monitored door is now outside it.", "A tight crop cuts people at the edge in half and the model labels them wrongly or not at all."],
    v: "Place a person at each edge of the configured region, inside and just outside, and confirm detections occur only inside, and that nothing outside the region reaches the event stage.",
    dep: ["resize-and-letterbox", "camera-calibration"]
  },
  "tiling-for-small-objects": {
    s: "Splits a high-resolution frame into overlapping tiles, runs the model on each and merges the results, to catch objects too small after a single downscale.",
    d: "A 4K frame resized to a few hundred pixels erases distant people and vehicles. Tiling runs the model at native scale on overlapping windows, then maps boxes back and merges duplicates at the seams. Cost grows with the number of tiles, so systems often run a coarse full-frame pass and tile only where activity or low-confidence regions appear. Overlap must exceed the largest object that should not be split, or objects on boundaries are detected twice or not at all.",
    k: ["Tile every frame vs tile on demand: always tiling finds small objects consistently at several times the cost; on-demand saves compute but adds a second stage that can miss.", "Large overlap vs small overlap: large overlap avoids split objects and multiplies work; small overlap is cheap and leaves seam artifacts.", "Tiling vs a higher-resolution model: tiling reuses a small model; a larger input model avoids seam logic but is slower on one pass."],
    p: ["Objects on tile seams produce partial boxes that merge badly and double-count.", "Tiling every stream at once saturates the accelerator and starves other cameras."],
    v: "Place objects of known small size across tile seams and at the far end of the scene, and confirm each is detected exactly once, with box positions matching the full-resolution image within a few pixels.",
    dep: ["resize-and-letterbox", "non-maximum-suppression"]
  },
  "denoising-and-enhancement": {
    s: "Optional cleanup of low-light, hazy or compressed frames before inference: noise reduction, contrast adjustment, dehazing and sharpening.",
    d: "Night footage carries sensor noise and compression blocks, and fog or glare lowers contrast. Filters can improve model input but also change statistics the model was trained on, so improvement must be measured, not assumed. Simple histogram or gamma adjustments are cheap; learned enhancement is expensive. Enhancement belongs in the same place in training augmentation, so the model has seen its outputs. It is most valuable for a specific known failure, not applied everywhere by default.",
    k: ["Enhance before the model vs train on the raw degradation: enhancement fixes a known problem; training on noisy examples avoids the extra stage and its cost.", "Fixed filter vs adaptive filter: fixed is cheap and predictable; adaptive responds to conditions but changes input statistics frame to frame.", "Global enhancement vs per-camera setting: per-camera fits one scene; global is simple and wrong for some."],
    p: ["Sharpening amplifies compression artifacts that the detector reads as edges and objects.", "An enhancement stage added for night is left on during the day and lowers accuracy at midday."],
    v: "On a labeled night and fog set, compare detection recall and false positive rate with and without the filter; keep it only if the held-out numbers improve and the day set does not regress.",
    dep: ["color-space-conversion", "train-serve-parity"]
  },
  "motion-gating": {
    s: "Skips inference on frames where nothing has changed, using cheap frame differencing or encoder motion data, to save compute on quiet scenes.",
    d: "Compares the current frame with a background model or recent frames, or reads motion vectors from the video encoder, and runs the model only when a region changes more than a threshold. Quiet scenes can cost almost nothing. The gate must be tuned for lighting changes, shadows, trees and compression noise, which trigger it falsely, and slow or distant motion, which fails to trigger it. A periodic forced inference bounds the damage from a bad gate and catches static objects that appear and stay.",
    k: ["Gate before inference vs always infer: gating cuts load on idle cameras; it adds a place where objects can be missed entirely.", "Pixel differencing vs encoder motion vectors: vectors are free from the decoder; pixel differencing works on any source and costs processor time.", "Aggressive threshold vs sensitive threshold: aggressive saves most work; sensitive catches slow objects and fires on shadows."],
    p: ["An object that enters and stands still is never detected because the scene stopped changing after it arrived.", "Auto-exposure shifts light levels and the gate fires continuously, giving no savings."],
    v: "Replay a day of recorded footage with labeled events and compare events found with and without the gate: recall must not drop beyond the agreed margin, and compute saved should match what was projected.",
    dep: ["frame-sampling-and-dropping"]
  },
  "train-serve-parity": {
    s: "The discipline of making deployed preprocessing byte-for-byte equivalent to what the model saw in training, verified by a shared definition and golden tests.",
    d: "Training usually loads images from files with one decoder and resize routine; serving receives video frames processed through another. Differences in compression, interpolation, color range, rounding and padding produce a measurable accuracy gap. The remedy is a single declared preprocessing specification, versioned with the model and used by both sides, plus golden examples comparing tensors from each path. Where exact match is impossible, training augmentation includes the serving path's degradations.",
    k: ["One shared implementation vs two implementations kept in sync: one implementation guarantees parity; it constrains the training stack to the production runtime.", "Train on decoded video frames vs still images: video-derived data matches serving artifacts; stills are easy to label and sharper than the field.", "Tolerance-based vs exact comparison: tolerances accept benign rounding differences and can hide systematic bias."],
    p: ["The offline evaluation uses a file decoder and reports high accuracy that field footage never reaches.", "A runtime upgrade changes the resize rounding and nobody notices because the model file is unchanged."],
    v: "For a set of golden frames, compute the model input tensor through the training pipeline and the deployed pipeline; they must match within the specified tolerance, and the model's outputs on both must agree.",
    dep: ["normalization-and-layout", "resize-and-letterbox", "model-registry"]
  },
  "inference-request-queue": {
    s: "The bounded queue between preprocessing and the accelerator, holding prepared frames with their deadlines and sources until the scheduler picks them.",
    d: "Each request carries a tensor reference, the model to run, source stream, timestamp and deadline. Queues are bounded and may be per stream, per model or global. Depth is the main latency control: a deep queue absorbs bursts and adds waiting time that is invisible to throughput numbers. The queue provides the signal that drives backpressure and load shedding. Memory ownership across the queue is delicate, since tensors on the device must not be recycled while waiting.",
    k: ["Per-stream queues vs one shared queue: per-stream gives fairness and isolates a slow camera; a shared queue uses capacity more efficiently.", "Deep vs shallow queues: deep absorbs bursts and raises latency; shallow keeps results fresh and drops more.", "FIFO vs deadline-ordered: FIFO is simple; deadline ordering serves urgent work first and needs accurate deadlines."],
    p: ["A deep queue hides overload, and results arrive seconds late while all throughput metrics look fine.", "A stalled consumer leaves requests holding device buffers until the pool is empty."],
    v: "Stop the accelerator consumer for ten seconds under load and confirm queue depth reaches its bound, drops are counted, latency stays below the bound for new frames and normal flow resumes without restart.",
    dep: ["frame-buffer-pools"]
  },
  "dynamic-batching": {
    s: "Groups requests from different streams into one accelerator call, waiting a short window to fill a batch, to raise throughput per watt.",
    d: "Accelerators run much more efficiently on batches, but real-time streams cannot wait for one indefinitely. The batcher collects requests up to a preferred size or a maximum wait, whichever comes first, runs the batch and splits the outputs back to sources. Sizes are constrained to those the model was compiled for. Different models or input shapes cannot share a batch. The wait window is a direct trade of latency for throughput, and the best setting moves with load.",
    k: ["Large batch vs small batch: large batches maximize throughput; each frame waits longer and one slow frame delays all.", "Fixed batch sizes vs dynamic shapes: fixed sizes are fast and need padding; dynamic shapes avoid padding at some runtime cost.", "Per-model batching vs cross-stream batching: per model is simple; cross-stream gets bigger batches on mixed fleets."],
    p: ["A batch window sized for peak load adds 50 milliseconds to every frame at night when only one camera is active.", "One corrupt input in a batch fails the whole call and all streams lose that frame."],
    v: "Sweep offered load from one stream to the maximum and record latency percentiles and throughput; at low load latency must stay near single-frame time and at high load throughput must approach the compiled-batch ceiling.",
    dep: ["inference-request-queue", "gpu-inference-runtime"]
  },
  "model-cascade-and-routing": {
    s: "Runs a cheap model first and invokes heavier or specialized models only when needed, routing frames by confidence, content or camera.",
    d: "A small detector can screen frames, then a larger model runs on uncertain or interesting ones; a classifier can run only on crops of detected objects. Routing rules choose models per camera type or time of day. Cascades cut average cost severalfold while keeping accuracy on hard cases, but they multiply failure modes: a miss in the first stage is never seen by the second. Combined accuracy has to be measured as a system, not per model.",
    k: ["Cascade vs a single larger model: a cascade lowers average compute with a more complex flow; a single model is simpler and costs the same on every frame.", "Confidence-triggered escalation vs always running both: escalation saves work; always running both gives a full comparison and doubles cost.", "Static routing vs learned routing: static is auditable; learned adapts and is harder to reason about."],
    p: ["The first-stage threshold is tuned for low cost, and its misses never reach the accurate stage, so system recall is below either model's own.", "Stage two is overloaded by a burst of escalations and its queue delays all cameras."],
    v: "Evaluate the full cascade on a labeled set and compare recall and cost per frame against stage two alone; recall must be within the agreed margin while average compute falls as predicted.",
    dep: ["inference-request-queue", "object-detection"]
  },
  "priority-and-deadlines": {
    s: "Assigns importance and time limits to requests so that critical cameras and fresh frames are served first when capacity is short.",
    d: "Cameras differ in value: an entrance with an alarm rule outranks a background count. Frames have deadlines after which a result is useless. The scheduler orders by priority class and earliest deadline, can preempt batches under construction and discards requests already past their deadline. Priorities must be bounded so low-priority work is not starved forever, and set by policy that operators understand.",
    k: ["Strict priority vs weighted fair share: strict guarantees critical cameras and can starve others completely; weighted share keeps everyone running at reduced rate.", "Drop expired requests vs run them anyway: dropping preserves freshness; running them gives complete records for audit.", "Static priorities vs priorities from current activity: static is predictable; activity-based spends capacity where things happen."],
    p: ["A lower-priority analytics camera never runs during a long burst of alarm-camera activity and its counts have a hole.", "Misconfigured deadlines of zero cause every request to be dropped as expired."],
    v: "Overload the device with mixed-priority cameras and confirm the high-priority streams meet their deadline percentile, low-priority streams still receive at least their guaranteed share, and dropped requests are counted by class.",
    dep: ["inference-request-queue"]
  },
  "backpressure-and-load-shedding": {
    s: "Responds to overload by slowing producers or discarding work in a chosen order, so the pipeline degrades predictably instead of falling behind.",
    d: "When queues fill, the system can block upstream stages, lower the sampling rate, reduce resolution, switch to a smaller model or drop frames. The right response depends on the task: counting tolerates a lower rate, while intrusion detection tolerates only a slower model. Signals include queue depth, wait time and accelerator utilization. Shedding must be visible in monitoring so a degraded system is not mistaken for a healthy one, and it must recover by itself when load falls.",
    k: ["Block producers vs drop frames: blocking preserves every frame and propagates stalls to the cameras; dropping keeps live behavior and loses data.", "Lower rate vs lower quality: lowering rate keeps accuracy per frame; lowering resolution keeps the rate and misses small things.", "Automatic degradation vs alerting only: automatic keeps service up; it can silently run a worse model for days."],
    p: ["Blocking in the decoder backs pressure into the network and the camera drops the connection.", "Degradation sticks after the burst because there is no recovery rule and the system runs at half rate indefinitely."],
    v: "Inject a load of twice capacity for ten minutes and confirm latency stays bounded, a degradation level is reported, then remove the load and confirm full-rate operation returns within a minute.",
    dep: ["inference-request-queue", "frame-sampling-and-dropping"]
  },
  "stream-multiplexing": {
    s: "Allocates shared inference capacity among many camera streams, balancing fairness, per-stream rate and the memory each stream's state consumes.",
    d: "A device with one accelerator may serve dozens of cameras. The multiplexer interleaves their frames, maintains per-stream state such as tracker memory and background model, and enforces per-stream budgets. Adding the thirtieth camera should not make the first thirty pay unpredictably. Capacity planning counts both compute per second and per-stream memory. Stream add and remove at runtime must not disturb others.",
    k: ["Round-robin vs weighted by activity: round-robin is fair and simple; weighting gives busy cameras more at the cost of idle ones' latency.", "Hot add and remove of streams vs restart on change: hot changes keep service continuous; they need careful state cleanup.", "One process for all streams vs process per stream: shared use of the model is efficient; one fault takes down everything."],
    p: ["Adding a camera pushes the device past its capacity and every camera gets noticeably less accuracy.", "Per-stream tracker state is not freed when a camera is removed, leaking memory slowly."],
    v: "Add cameras one at a time up to the rated limit while monitoring each stream's frame rate and latency; every stream must keep its configured rate, and removing a camera must return memory to the earlier level.",
    dep: ["inference-request-queue", "priority-and-deadlines"]
  },
  "model-loading-and-warmup": {
    s: "Loads model files into accelerator memory, builds execution plans, runs warmup inferences and swaps versions without interrupting the stream of results.",
    d: "First inference on a new model often takes far longer than later ones because of memory allocation, kernel selection and cache population. The loader reads and verifies the signed file, allocates memory, compiles or deserializes the plan and runs dummy batches at each supported size before taking traffic. Updating a model loads the new one beside the old and switches atomically. Memory limits can prevent two copies from co-existing on small devices.",
    k: ["Load new beside old vs unload first: side-by-side switches without a gap and needs double the model memory; unload-first has a gap of seconds.", "Compile on the device vs ship prebuilt plans: on-device compile fits any variant and takes minutes; prebuilt plans start instantly but need one per hardware variant.", "Eager warmup vs lazy warmup: eager hides the slow first frames from users; lazy starts quickly and surprises the first requests."],
    p: ["The first frames after an update take two seconds and miss a real event during the swap.", "A corrupt download is loaded without a checksum and the device runs a broken model."],
    v: "Trigger a model update under live load and confirm no gap in results longer than one frame interval, the new version reports in telemetry and the old one's memory is released.",
    dep: ["model-registry", "device-memory-management"]
  },
  "copy-compute-pipelining": {
    s: "Overlaps transfers, preprocessing, inference and postprocessing across successive frames using separate streams or threads, so the accelerator stays busy.",
    d: "Done serially, each frame waits for upload, then compute, then download. Pipelining runs the stages of consecutive frames concurrently: while frame N computes, frame N+1 uploads and N-1 downloads. It uses double buffering, asynchronous copies and events for ordering. Gains are large on accelerators with separate copy engines and small where memory is shared. Latency per frame is unchanged or slightly worse, and correctness depends on synchronization at every handoff.",
    k: ["Deep pipeline vs shallow pipeline: deep hides every delay and holds more frames in flight; shallow keeps latency and leaves the device idle.", "Asynchronous copies with events vs blocking calls: asynchronous overlaps work; mistakes in event ordering produce intermittent corrupt frames.", "Pinned staging buffers vs pageable memory: pinned is faster and a scarce resource."],
    p: ["A missing synchronization lets compute read a buffer while the next upload overwrites it, producing rare scrambled results.", "Deeper pipelines are added to raise throughput and per-frame latency rises beyond the budget."],
    v: "Profile a timeline of the device: copy and compute should overlap and utilization should exceed the target, while a checksum of outputs over a million frames matches the serial reference.",
    dep: ["gpu-inference-runtime", "zero-copy-buffer-sharing"]
  },
});
