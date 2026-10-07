// Details for the vision pipeline plate, part 1: capture, decoding, calibration and timing.
ATLAS.details("vision-pipeline", {
  "camera-sensors-and-optics": {
    s: "The physical imager, lens, shutter and exposure settings that determine what information a frame can contain before any software touches it.",
    d: "Sensor size, lens focal length, aperture, shutter type and exposure control set resolution on target, motion blur, noise and dynamic range. Fixed-focus lenses, infrared cut filters and illuminators decide night behavior. The pipeline can only recover what the optics captured, so a face at forty pixels wide or a license plate blurred by a slow shutter cannot be fixed by a better model. What makes it hard is that installation is permanent and varied: mounting height, angle, glare and weather differ at every site.",
    k: ["Global shutter vs rolling shutter: global avoids skew on fast motion; it costs more and has lower sensitivity.", "Wide field of view vs pixels on target: one wide camera covers more area; distant objects fall below the size models can detect.", "Fixed exposure vs auto exposure: auto handles changing light; it makes brightness, and so model input statistics, vary frame to frame."],
    p: ["A camera installed at a steep angle makes people look unlike the training data and detection quietly degrades.", "Auto exposure pumping at dusk produces flicker that the motion gate reads as constant activity."],
    v: "At each installation, place a target of known size at the farthest required distance and confirm it spans at least the minimum pixels the model needs, in both daylight and night mode.",
    dep: []
  },
  "image-signal-processing": {
    s: "Converts raw sensor data into viewable images: demosaicing, white balance, noise reduction, tone mapping and sharpening, in hardware or software.",
    d: "Raw sensor samples pass through a chain of stages that interpolate color, correct lens shading, balance white, suppress noise and compress dynamic range. Cameras with built-in processing apply a fixed tuning before encoding; embedded boards run their own hardware stage. Tuning is aimed at human eyes, which is not always what a model wants: aggressive sharpening or noise reduction can create artifacts the model never saw in training. Parameters often change silently with firmware updates, which makes this a hidden dependency of model accuracy.",
    k: ["Tuning for human viewing vs tuning for model input: pleasing images are easy to review; flattening, sharpening and tone curves may shift detection accuracy.", "Hardware ISP vs software processing: hardware is fast and low power; software is more flexible but costs processor time on every frame."],
    p: ["A camera firmware update changes sharpening and white balance, and accuracy drops with no change in the pipeline's own code.", "Heavy temporal noise reduction smears moving objects into ghosts that detectors split or miss."],
    v: "Capture the same chart under fixed lighting before and after a firmware or tuning change and compare the model's detection scores on the saved frames; the difference should stay within the accuracy gate.",
    dep: ["camera-sensors-and-optics"]
  },
  "stream-transport-protocols": {
    s: "The standard protocols that carry video from cameras across networks: real-time streaming over UDP or TCP, HTTP segment delivery and device discovery.",
    d: "Cameras typically publish compressed video through a real-time streaming protocol with separate control and media channels, or over HTTP in segments. Media may travel over UDP, which is low latency but loses packets, or interleaved on TCP, which is reliable but stalls under loss. Authentication, multicast, encryption and discovery standards vary by camera vendor and age. The hard part is interoperability: nominally standard cameras differ in timestamp handling, keyframe interval, codec profiles and how they react to many simultaneous clients.",
    k: ["UDP vs TCP-interleaved transport: UDP gives lower latency; lost packets corrupt frames until the next keyframe while TCP adds delay under loss.", "Pulling from cameras vs cameras pushing to a server: pull keeps cameras simple; push works through firewalls and scales connection setup differently.", "Per-pipeline connections vs a shared restream: restreaming spares the camera's limited sessions; it adds a hop and a failure point."],
    p: ["Opening several consumers on one camera exceeds its session limit and the oldest stream is dropped without error.", "Packet loss on a congested wireless link yields smeared frames that models read as phantom objects."],
    v: "Stream from a camera across a network with five percent injected packet loss and confirm that corrupted frames are detected and skipped rather than passed on, and that delivery resumes within one keyframe interval.",
    dep: ["camera-sensors-and-optics"]
  },
  "stream-ingest-and-reconnect": {
    s: "Maintains the connection to each camera: opens, authenticates, detects stalls, reconnects with backoff and reports stream state.",
    d: "An ingest worker per camera pulls packets, tracks the last arrival time, and declares a stream stalled after a timeout. It reconnects with jittered exponential backoff so a restarting network does not produce a thundering herd of connection attempts, and it resets decoder state on reconnect. It publishes states such as connecting, live and failed that monitoring reads. Hard cases include cameras that accept the connection but send nothing, cameras that change resolution mid-stream after a reboot, and credentials that rotate.",
    k: ["Aggressive vs patient reconnect: quick retry restores coverage sooner; it can lock out a camera or flood a recovering network.", "Per-stream process vs shared worker pool: isolation contains a crashing decoder; many processes cost memory on small devices.", "Silent retry vs surfaced failure: retries hide short glitches; operators then miss a flapping camera that loses ten percent of footage."],
    p: ["A camera that connects but streams black frames counts as healthy because packets are arriving.", "All cameras reconnect on the same schedule after a switch reboot and overload the network again."],
    v: "Unplug a camera for ninety seconds and confirm the stream state changes to failed within the stall timeout, retries back off, and video resumes within seconds of reconnection with no restart of other streams.",
    dep: ["stream-transport-protocols", "camera-health-checks"]
  },
  "video-decoding": {
    s: "Turns compressed video bitstreams into raw frames, handling codec profiles, reference frames, resolution changes and corrupted data.",
    d: "Inter-frame codecs encode most frames as differences from earlier ones, so the decoder keeps reference frames and must process packets in order. It outputs raw pictures in a planar or semi-planar format, with presentation timestamps. Decoding cost scales with resolution and bitrate and is often the first bottleneck on a many-camera device. It must tolerate truncated packets, parameter sets that change mid-stream and streams that start between keyframes. Decode errors should reset to the next keyframe, not crash the worker.",
    k: ["Software decode vs hardware decode: software handles any stream; hardware cuts processor use sharply but limits profiles, count of streams and output formats.", "Decode every frame vs keyframes only: full decode keeps motion detail; keyframe decode multiplies stream capacity at a coarse sampling rate.", "Low-delay decoding vs output reordering: low delay suits real time; streams with bidirectional frames need buffering that adds latency."],
    p: ["Decoding after packet loss without waiting for a keyframe produces gray, smeared frames that look like valid input.", "Hardware decoder sessions are exhausted by a few high-resolution cameras and new streams fail with a vague error."],
    v: "Feed a recorded stream with deliberately dropped packets and confirm that frames flagged corrupt are not passed to inference, that decoding recovers at the next keyframe, and that decoder memory stays flat over a day.",
    dep: ["stream-ingest-and-reconnect", "frame-buffer-pools"]
  },
  "hardware-decode-offload": {
    s: "Uses dedicated fixed-function video blocks on the graphics or system chip to decode streams, freeing the processor and keeping frames in device memory.",
    d: "Decode engines accept compressed packets through a driver interface and write decoded surfaces to device memory, usually in a semi-planar format with hardware-specific alignment. The pipeline then converts and resizes on the same device, so the frame never visits system memory. Each engine supports particular codecs, profiles, maximum resolutions and a limited number of concurrent sessions, and on some devices scales better across streams than decode throughput suggests. The difficulty is capability discovery and graceful fallback when a stream falls outside what the engine supports.",
    k: ["Hardware surfaces end to end vs copy to system memory: staying on device saves bandwidth; every processing step must then be a device operation.", "Fixed session pool vs on-demand sessions: a pool avoids exhaustion surprises; it wastes capacity when streams are few.", "Fallback to software when unsupported: keeps cameras working; it can quietly saturate the processor at scale."],
    p: ["A camera switched to a profile the engine does not support falls back to software and the device overheats under load.", "Memory alignment padding is ignored, so the cropped image shows a green stripe or shifted pixels."],
    v: "Run the maximum number of cameras the device is rated for and confirm via driver counters that every stream is on the hardware path, processor load stays within its budget and no frame is copied to system memory.",
    dep: ["video-decoding", "device-memory-management"]
  },
  "keyframe-and-gop-handling": {
    s: "Manages the structure of compressed video groups of pictures: where independent frames occur, how decoding starts, and how seeks and clips are cut.",
    d: "Only keyframes can be decoded alone; other frames depend on earlier ones. The camera's keyframe interval therefore controls how long a decoder waits to start or recover, how coarse a seek can be and how a clip can be cut without re-encoding. The system tracks keyframes in its buffers so evidence clips begin on one, and so a rewind to a few seconds before an event is possible. Cameras differ on adjustable intervals and on smart modes that vary the interval with motion, which makes timing unpredictable.",
    k: ["Short keyframe interval vs bitrate: short intervals recover quickly and cut easily; they raise bandwidth and storage.", "Cutting clips on keyframes vs re-encoding: keyframe cuts are instant and lossless; re-encoding gives exact boundaries but costs compute.", "Requesting a keyframe on demand vs waiting: on-demand recovers quickly; not every camera honors the request."],
    p: ["A smart-codec mode stretches intervals to ten seconds and a reconnect leaves the decoder blind for that long.", "Clips cut at the event time start with undecodable frames and the first seconds are gray."],
    v: "Cut a clip starting two seconds before a test event and play it in a standard player: it must start on a decodable frame and show the full interval with no gray frames at the start.",
    dep: ["video-decoding", "frame-metadata"]
  },
  "frame-buffer-pools": {
    s: "Preallocated pools of frame memory, reference-counted and shared between decoder, preprocessor and models, so the pipeline does not allocate per frame.",
    d: "A frame arrives as a large block, and every stage that retains it holds a reference. A pool hands out fixed-size buffers and recycles them when the last reference is released, bounding memory and avoiding allocator stalls. Pool size encodes policy: when exhausted, the producer waits or drops. Buffers may live in system memory, pinned memory or device memory, each with different transfer costs. The hard problem is lifetime: a stage that forgets to release a buffer slowly starves the pipeline, and one that releases early lets the decoder overwrite pixels still in use.",
    k: ["Fixed pool with drop on exhaustion vs unbounded growth: a fixed pool caps memory and exposes overload; unbounded growth hides overload until memory runs out.", "Reference counting vs copy on handoff: sharing avoids copies; the ownership rules are subtle across threads and devices.", "One pool per stream vs a shared pool: per-stream isolates faults; a shared pool uses memory more efficiently."],
    p: ["A leak in one rare error path leaks a buffer per event and the device stalls after several days.", "A stage holds a frame longer than expected for clip evidence and the pool empties during a burst."],
    v: "Run a soak test for 72 hours with injected errors and confirm pool utilization returns to its idle level after each burst and in-flight buffers never exceed the configured size.",
    dep: []
  },
  "frame-sampling-and-dropping": {
    s: "Chooses which decoded frames enter the pipeline, thinning high-rate streams to the rate the task needs and discarding stale frames under load.",
    d: "Streams run at 15 to 60 frames per second, but many tasks need only a few. A sampler picks frames by fixed interval, by elapsed time or by activity, and discards the rest before expensive steps. Under load, it should prefer the newest frame over a queue of old ones, since an answer about the past is rarely useful. Sampling interacts with tracking, which needs enough overlap between frames to associate objects, and with timestamps, which must record the real capture time of the frame chosen.",
    k: ["Fixed-interval vs adaptive sampling: fixed is predictable for tracking and cost; adaptive spends compute where things move but gives uneven time steps.", "Latest-frame-wins vs process-all: latest keeps latency low; process-all preserves every frame for audit at the price of falling behind.", "Dropping before vs after decode: dropping before saves decode work but is limited to keyframes in inter-coded streams."],
    p: ["Sampling at one frame per second misses a fast object entirely or breaks tracking continuity.", "Dropped frames are not counted, so reported throughput looks healthy while coverage is half of what was configured."],
    v: "Under a synthetic overload of three times capacity, confirm that end-to-end latency stays below its bound, the newest frames are processed and a counter reports the exact number of frames dropped per stream.",
    dep: ["video-decoding", "frame-timestamping"]
  },
  "clock-synchronization": {
    s: "Keeps device and camera clocks aligned to a shared reference so timestamps from different sources can be compared and ordered.",
    d: "Devices discipline their clocks with network time protocols, precision time protocols or satellite time, and cameras may run on their own. The pipeline measures offset and drift per source and either corrects timestamps or flags sources beyond tolerance. Precision needs differ: event logs tolerate hundreds of milliseconds, while multi-camera fusion may need a few. Clocks step after boot or a sync correction, so monotonic and wall-clock readings must not be confused. Devices without a battery-backed clock start at a wrong date.",
    k: ["Sync cameras to the device vs the device to cameras: using one reference is simple; cameras that cannot sync require offset estimation instead.", "Stepping vs slewing a clock correction: slewing keeps time monotonic; stepping converges quickly but breaks event ordering.", "Wall-clock timestamps vs monotonic counters: wall time can be correlated across devices; monotonic never goes backward within one."],
    p: ["A device boots with the wrong date, stamps a day of events in 1970 and they are discarded by retention rules.", "A clock step during an event makes the duration negative or doubles it."],
    v: "Compare the timestamp each camera and device assigns to a flash visible to all, repeated daily, and confirm the spread stays under the stated tolerance, with out-of-tolerance sources alerting.",
    dep: []
  },
  "frame-timestamping": {
    s: "Assigns each frame a time that reflects when light hit the sensor, not when the software received or decoded it.",
    d: "Several times exist for one frame: exposure start, camera encode, network arrival, decode completion and inference completion. The pipeline should carry the camera's capture time when it can be trusted, mapped through the clock offset, and fall back to arrival time minus an estimated latency otherwise. Timestamps travel with the frame through every stage into events and clips. Errors matter when linking video to external records such as a door sensor or a speed reading, and when fusing cameras.",
    k: ["Camera-supplied vs arrival-time stamps: camera stamps exclude network jitter; some cameras emit wrong or reset values.", "Per-frame latency compensation vs a constant offset: per-frame is accurate; a constant is simple but drifts with load.", "One timeline vs several named timestamps: carrying all keeps diagnosis possible; consumers pick the wrong one more easily."],
    p: ["Arrival time under load makes a delayed frame look like it happened later, so an event is attributed to the wrong minute.", "Camera timestamps wrap or reset after a reboot and a tracker treats the jump as a gap."],
    v: "Point a camera at a running clock display, record frames, and confirm the shown time matches the frame's stamped capture time within the stated tolerance at idle and at full load.",
    dep: ["clock-synchronization"]
  },
  "multi-camera-sync": {
    s: "Aligns frames across cameras that view the same space, either by hardware trigger or by matching timestamps within a tolerance.",
    d: "Fusing views, triangulating depth or following a person between cameras requires frames captured at nearly the same instant. Hardware trigger lines expose all sensors together; otherwise the pipeline buffers per camera and groups frames whose stamps fall within a window. Cameras with differing frame rates and jitter complicate grouping. A wait for a slow camera adds latency, while an impatient group proceeds without it. The group's quality is a function of the worst clock in the set.",
    k: ["Hardware trigger vs software alignment: triggering gives true simultaneity but needs wiring and capable cameras; software alignment works anywhere with tolerance error.", "Wait for all cameras vs proceed with a subset: waiting is consistent but late; proceeding keeps latency and loses a view.", "Tight vs loose tolerance window: tight avoids mismatched motion; loose tolerates jitter but pairs frames from different instants."],
    p: ["One camera with a drifting clock gradually pairs frames half a second apart and fused positions smear.", "A stalled camera blocks every group until the timeout, stalling the whole site."],
    v: "Wave a marker across overlapping views and confirm the fused position error stays within bounds, and that unplugging one camera lets groups continue after the configured wait.",
    dep: ["frame-timestamping", "clock-synchronization"]
  },
  "camera-calibration": {
    s: "Determines each camera's lens distortion, intrinsic parameters and position in the world, so image coordinates map to real-world measurements.",
    d: "Intrinsic calibration estimates focal length, principal point and distortion from images of a known pattern. Extrinsic calibration finds the camera's pose relative to a site coordinate frame using reference points on the ground or other cameras. With these, a pixel can be projected onto a ground plane and distances, speeds and zone areas expressed in meters. Calibration is invalidated by a bumped mount, a lens refocus or a zoom change. Verification requires checking known distances in situ.",
    k: ["Full calibration vs a ground-plane homography: full calibration supports 3D and fusion; a homography needs only four points but is valid on one plane.", "Calibrate once at install vs continuous self-calibration: once is simple; continuous catches bumped cameras at the cost of complexity.", "Undistort the image vs undistort the results: undistorting images costs compute on every frame; transforming only outputs is cheap but models see distorted input."],
    p: ["A camera nudged by wind shifts the zones relative to the scene and counts crossing lines wrongly.", "Calibration stored against a camera's address survives a camera swap and is applied to a different lens."],
    v: "Measure two known distances on the ground in the image using the calibration and compare with a tape measure; the error must stay within the tolerance, and be rechecked after any physical service.",
    dep: ["camera-sensors-and-optics"]
  },
  "camera-health-checks": {
    s: "Detects cameras that are connected but not useful: blocked, blurred, dark, frozen, moved or tampered with.",
    d: "Cheap per-frame statistics, such as mean brightness, sharpness, frame-to-frame difference and histogram distance from a reference scene, flag lens obstruction, defocus, lights off, frozen video and sudden view change. Comparing against a stored reference image detects a camera that has moved. These checks run before inference so that a failure is reported as a camera problem and not as zero detections. Thresholds depend on the scene: a camera in a dark warehouse is legitimately dim.",
    k: ["Statistical checks vs a learned scene-change model: statistics are cheap and explainable; a model handles complicated scenes at the cost of inference.", "Alerting immediately vs after persistence: immediate catches tampering; persistence avoids alarms for a passing truck blocking the view.", "Per-camera learned baselines vs global thresholds: baselines fit each scene but need a settling period."],
    p: ["A frozen frame from a hung encoder passes every brightness test and yields hours of empty results.", "Rain on the lens blurs the image gradually, and a blur threshold set from a clean day never fires."],
    v: "Cover a camera lens, point it at a wall, and unplug its video in turn; confirm each produces its distinct health alert within the persistence window and no detections are reported as normal.",
    dep: ["frame-metadata"]
  },
  "frame-metadata": {
    s: "The record that travels with every frame: source, timestamps, sequence number, resolution, codec state, calibration and pipeline versions.",
    d: "Each frame is wrapped with an envelope carrying identity and context so later stages and consumers need not guess. Fields include camera and site ids, capture and arrival times, a monotonic sequence number that exposes dropped frames, geometry after any crop or resize, the active calibration and the versions of preprocessing and models. Results are written back with the same envelope, making any output traceable to its input. It must stay small and stable, because schema changes ripple through every stage.",
    k: ["Rich envelope vs minimal envelope: rich metadata makes debugging and audit possible; it adds bytes to every frame and coupling between stages.", "Sidecar metadata vs embedding in the frame buffer: sidecars keep buffers generic; embedding guarantees the two cannot separate.", "Versioned schema vs free-form fields: versioning supports safe evolution; free-form is quick and breaks silently."],
    p: ["A resize step drops the original geometry, so boxes cannot be mapped back and every result is shifted.", "Sequence numbers are reset on reconnect, hiding the gap from monitoring."],
    v: "Take an event's output and trace it back to the exact camera, time, calibration and model versions that produced it, then re-run those inputs and reproduce the same detection.",
    dep: []
  },
});
