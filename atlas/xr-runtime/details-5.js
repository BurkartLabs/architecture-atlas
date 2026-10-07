// Details for the VR & AR runtime plate, part 5: hardware and drivers, cross-cutting concerns.
ATLAS.details("xr-runtime", {
  "device-abstraction": {
    s: "A driver interface that lets one runtime serve several headsets, by describing each device's displays, sensors, controllers and timing in a common form.",
    d: "A device plugin reports its displays, refresh rates, field of view, tracked components and sensor streams, and implements calls for submitting frames, reading poses and setting power state. The runtime core talks only to this interface. It makes it possible to add a headset without changing the compositor. The difficulty is that the interface cannot hide everything: display timing, tracking latency and capability differences leak through, and a lowest-common-denominator interface prevents using the strengths of each device.",
    k: ["A narrow common interface vs per-device code paths: many devices work out of the box, but device-specific strengths need extension points.", "Plugin drivers in the runtime process vs separate driver processes: a crash in a driver does not take down the compositor, at the cost of IPC latency."],
    p: ["Assuming every device has the same tracking latency breaks prediction on devices with slower links.", "A driver bug in the compositor's process crashes every running application."],
    v: "Run the same runtime build with two different device plugins and confirm both pass the same conformance suite for frame submission, pose reporting and event delivery, with each device's reported timing within tolerance.",
    dep: []
  },
  "display-driver": {
    s: "Takes control of the headset's panels from the desktop system, accepts compositor frames, and reports the timing of every refresh, in a mode that bypasses normal windowing.",
    d: "In direct mode the driver gives the compositor exclusive access to the display so the desktop does not interfere or add buffering. It configures resolution, refresh rate, persistence and sometimes variable refresh, accepts frames with their target time, and reports vertical sync and scanout timestamps. The panels may be connected through a video link with compression. It is hard because display stacks are not designed for exclusive, low-latency use: extra buffering, power management and mode changes each add delay, and failure of the driver leaves the user staring at a frozen image.",
    k: ["Direct exclusive display access vs presenting through the desktop compositor: lower latency and exact timing, but the display is unavailable for other uses and driver support varies.", "Fixed refresh vs variable: simple and predictable timing, but variable refresh helps uneven loads at a cost in prediction."],
    p: ["A desktop compositor adding one extra buffered frame silently adds a full refresh of latency.", "A display mode change at startup shows a black flash that can disorient the user."],
    v: "Present a timestamped test pattern and measure with a photodiode: confirm exclusive access removes the desktop from the path, the end-to-end display latency matches the driver's report and no extra frame is buffered.",
    dep: ["device-abstraction"]
  },
  "sensor-drivers": {
    s: "Reads cameras, inertial sensors and other devices over their buses and delivers timestamped data to the tracking system with minimal and predictable delay.",
    d: "Drivers handle each sensor's bus, such as camera serial links or inertial interfaces, configure rates and exposure, and deliver buffers with hardware timestamps. They run on real-time threads or dedicated processors and feed shared memory or zero-copy buffers. They also handle errors: lost frames, bus resets and thermal shutdown. The challenge is bounded latency and correct timestamps under load, because any unnoticed buffering or scheduling delay becomes tracking error, and different sensor generations behave differently.",
    k: ["Dedicated sensor processor vs main processor: lower and steadier latency and power, but extra firmware and a harder debug path.", "Zero-copy buffers vs copying into queues: saves bandwidth and delay, but buffer lifetimes need careful ownership rules."],
    p: ["A scheduling hiccup on a busy main processor delays IMU delivery, appearing as a pose jump.", "Silent frame drops on a camera bus make tracking think the world moved."],
    v: "Stress the main processor with heavy load for 10 minutes while recording sensor delivery; confirm no dropped frames, a worst-case delivery delay under 2 milliseconds and timestamps unchanged from idle conditions.",
    dep: ["device-abstraction"]
  },
  "tethered-and-wireless-link": {
    s: "The connection between a headset and a separate computer, either a cable or a radio link, carrying compressed video one way and tracking data the other.",
    d: "The computer renders and encodes frames, sends them over a wired or wireless link, and the headset decodes and displays them while uploading sensor data and poses. Wired links can use raw or lightly compressed video; wireless links need strong compression and handle varying bandwidth. Timewarp usually happens on the headset with the latest pose to hide the link delay. It is hard because wireless latency varies, interference and packet loss show as artifacts and stalls, and every added millisecond competes with the budget.",
    k: ["Wireless with compression vs a cable: freedom of movement, but variable latency, artifacts and battery drain; a cable is stable and high quality but restricts the user.", "Warp on the headset vs on the computer: hides link jitter with the freshest pose, but needs a capable processor in the headset."],
    p: ["A congested wireless channel gives bursts of latency that cause judder and nausea.", "Rate adaptation that reacts slowly leaves blocky video for seconds after a bandwidth drop."],
    v: "Run an hour of play on a wireless link in a congested apartment environment; confirm measured motion-to-photon at the 99th percentile stays within the documented limit and dropped frame count is below the target.",
    dep: ["video-encode-decode","display-driver","rotational-timewarp"]
  },
  "video-encode-decode": {
    s: "Hardware codecs that compress rendered frames for transmission or storage and decompress them on the other end, tuned for very low delay rather than best compression.",
    d: "The encoder runs in low-latency mode, with no frame reordering, slice-based output so transmission starts before the frame ends, and tight rate control to match the link. The decoder on the headset starts decoding partial frames. Settings trade bitrate against delay and quality, and foveated encoding can spend more bits at the gaze point. The challenge is that codecs are built for streaming and have deep buffers by default, so every setting must be configured for latency, and errors from lost packets must be concealed without waiting for retransmission.",
    k: ["Low-latency intra-refresh vs periodic keyframes: no large bursts and faster recovery from loss, but lower compression efficiency.", "Hardware codecs vs software: low power and delay, but fixed capabilities and quality settings."],
    p: ["Default codec settings buffer several frames and add a hundred milliseconds of delay.", "A lost keyframe produces a corrupted image until the next one arrives."],
    v: "Measure encode plus decode delay from frame input to decoded output with a timestamp overlay; confirm it is under 10 milliseconds at the target bitrate, and that image quality recovers within two frames after induced packet loss.",
    dep: ["device-abstraction","tethered-and-wireless-link"]
  },
  "controller-radio": {
    s: "The low-power radio connection between controllers and headset that carries button states, inertial data and haptic commands with low and predictable latency.",
    d: "Controllers send reports at a fixed rate over a short-range radio, with timestamps from their own clock. The headset estimates the clock offset and link delay to map those samples into its own time. Haptic commands travel the other way. Pairing, reconnection, battery reporting and firmware updates share the link. It is difficult because a 2.4 GHz band is crowded, so interference causes lost packets and jitter, which appear as stuttering controller poses, and the time mapping must remain accurate through them.",
    k: ["Dedicated low-latency radio vs a general wireless standard: tighter control of timing and rate, but a custom protocol and pairing flow.", "Higher report rate vs battery life: smoother tracking, but shorter controller battery life."],
    p: ["Interference in a crowded venue drops packets and makes controllers stutter.", "Clock offset estimation that fails after reconnection places controller samples at the wrong time."],
    v: "Run controllers for an hour in a venue with many radios and confirm the packet loss rate is below 1 percent, latency jitter under 2 milliseconds, and haptic commands arrive within the limit.",
    dep: ["device-abstraction","sensor-time-sync"]
  },
  "firmware-and-updates": {
    s: "The code inside the headset's microcontrollers and sensors, and the process that updates it safely together with the runtime, without leaving a device unusable.",
    d: "Headsets contain firmware for the main processor, sensor hubs, display controllers, controllers and radios. Updates are signed, delivered with the runtime, applied with rollback protection and verified after reboot. The firmware stores factory calibration and the runtime depends on compatible versions. It is hard because versions must stay consistent across components, an interrupted update on a battery-powered device is dangerous, and a security flaw in firmware that sees cameras and eyes is severe.",
    k: ["A/B partitions with rollback vs in-place update: a failed update recovers on its own, but needs double the storage.", "Frequent small updates vs rare large ones: faster security fixes and smaller risk each time, but a constant compatibility matrix to test."],
    p: ["An update that overwrites factory calibration leaves the unit with lower tracking quality forever.", "A runtime update expecting new firmware that has not yet applied causes crashes at start."],
    v: "Interrupt a firmware update by cutting power at ten random points and confirm the device boots into either the old or new version each time, with calibration intact and the runtime reporting matching versions.",
    dep: ["device-abstraction"]
  },
  "latency-budget": {
    s: "The shared allowance, tens of milliseconds, that every stage from sensor to photon must fit within, and the system-wide accounting that stops one stage from quietly spending another's share.",
    d: "Latency is the sum of sensor capture, transport, tracking, prediction, rendering, composition, link, scanout and pixel response. Because no one component owns the total, it is easy to optimize locally and still lose overall. Teams set a budget per stage, measure it end to end and enforce it in tests. Prediction and late correction hide most of it but each has an error cost. It shapes everything: pipeline depth, buffering, synchronization primitives, driver choices and whether a feature that adds a frame is acceptable at all.",
    k: ["Strict per-stage budgets vs a total only: stages cannot overspend, but budgets restrict features, while a total hides who is responsible.", "Hide latency with prediction vs remove it: prediction is general and cheap, but errors grow with the horizon, so removal remains the better fix."],
    p: ["Adding one frame of buffering for smoothness is invisible in a profile and obvious to the wearer.", "Only measuring average latency hides the tail that makes people sick."],
    v: "Report motion-to-photon, measured with an external photodiode at several rotation speeds, with a per-stage breakdown and the 99th percentile; confirm each release stays within the budget table.",
    dep: ["motion-to-photon-budget","display-timing","pose-prediction"]
  },
  "coordinate-frames-and-time": {
    s: "The agreed conventions for coordinate frames, units and clocks, without which a pose from one sensor cannot be compared with a pose from another or applied at the right moment.",
    d: "Every sensor, display, controller and anchor has its own frame; rigid transforms relate them, calibrated and stored. Handedness, axis direction and units are fixed by the standard so applications agree. Time is as important: every sample carries a timestamp on a common clock, and every query names a time. Poses are always poses of something in something at a time. The difficulty is that errors are silent: a wrong axis flip or a 3 millisecond offset produces a plausible but subtly wrong result, and transforms change when maps are corrected.",
    k: ["Explicit frames and timestamps on every pose vs implicit current state: results are correct and testable, but every API call carries more parameters.", "One system clock vs per-device clocks: simple reasoning, but needs continuous synchronization of the devices."],
    p: ["A mixed left and right handed convention mirrors the world only in some code paths.", "Using the time a pose arrived instead of the time it was measured shifts every prediction."],
    v: "Place a tracked object at a measured position in the room and confirm every consumer, sensor, compositor and application, reports it within tolerance in the same frame and timestamp; rotate the headset and confirm mirrored cases fail the test.",
    dep: ["sensor-time-sync","reference-spaces"]
  },
  "power-thermal-envelope": {
    s: "The fixed amount of heat and battery energy the device can spend, which limits sensor rates, resolution, refresh rate and every feature added to the runtime.",
    d: "A standalone headset is worn on the face and cannot have fans or vents like a desktop, so skin temperature limits cap sustained power to a few watts. Cameras, tracking, display, compositor, application and radio all draw from the same budget. Each feature, such as passthrough or eye tracking, has a power cost that must be paid by something else. Design means measuring cost per feature, deciding which degrade first and surfacing the result as performance levels. The consequences are everywhere: algorithms are chosen for energy as well as speed.",
    k: ["Always-on sensing vs on-demand: features respond instantly, but constant power use shortens runtime and heats the device.", "Fixed power budget per component vs dynamic sharing: predictable behavior and no starvation, but unused budget is wasted."],
    p: ["Adding a feature in isolation, such as full-rate eye tracking, pushes the device into throttling in long sessions.", "Testing short sessions on a cool device hides the performance seen after 40 minutes."],
    v: "Run a one-hour worst-case scenario with all features enabled, in a warm room, logging power per component and skin temperature; confirm temperature stays under the limit and the power table sums to the measured total.",
    dep: ["thermal-and-power-policy","performance-levels","frame-budget-governor"]
  },
  "sensor-privacy": {
    s: "The set of rules covering what cameras, depth sensors and body trackers can see and share, applied at every layer because the device observes the user's home and body.",
    d: "A headset continuously images the room, the hands and the eyes. That data can identify people, reveal location, health, emotion and possessions, and may capture bystanders. Policy is built in layers: minimizing what is collected, processing on the device, withholding raw images from applications, showing indicators when sensors are active, requiring consent per capability and deleting stored maps. Applications get abstractions such as planes or selection events instead of images. The tension is that every abstraction removes some capability, and a determined application can combine harmless streams to learn more than was intended.",
    k: ["Abstractions in place of raw sensor access vs open camera access: most applications never see the room, but new uses need runtime support.", "Local processing only vs cloud features: data stays on the device, but features such as shared maps need sending something out."],
    p: ["A debugging or recording feature left reachable exposes the camera feed to other software on the machine.", "Bystanders in the room are recorded and have no way to consent."],
    v: "Audit an application with no permissions using packet capture, memory inspection and API calls; confirm it receives no camera frames, room geometry or gaze, and that the sensor-active indicator matches actual sensor use.",
    dep: ["permissions-and-privacy","biometric-data-gating","passthrough-capture"]
  },
  "comfort-constraint": {
    s: "The requirement that the experience not make people ill, tired or unsafe, which sets hard limits on latency, frame rate, motion and field of view that no feature can trade away.",
    d: "Motion sickness arises from mismatch between what the eyes and the inner ear report; eye strain from focus, convergence and display flaws; fatigue from heavy or hot devices and gesture effort. Comfort is therefore a quantified constraint: maximum latency, no dropped frames, stable world locking, correct IPD and limits on artificial motion. Runtimes enforce parts of it, such as refresh rate floors, vignettes and reprojection, and expose the rest as guidance. It is hard to test because tolerance varies between people and appears minutes into a session, not in a short test.",
    k: ["Runtime-enforced comfort limits vs application guidance: protection regardless of application quality, but less freedom for applications.", "Designing for the most sensitive users vs average: fewer people get ill, but experiences are more conservative."],
    p: ["Passing short tests misses discomfort that appears after 20 minutes.", "Counting average frame rate as comfort ignores the dropped frames that cause it."],
    v: "Run a standardized 30 minute session with a panel of participants across tolerance, collecting a sickness questionnaire before and after, and confirm the median score and the share reporting moderate or worse discomfort are below the release target.",
    dep: ["comfort-vignette","motion-to-photon-budget","judder-and-persistence"]
  },
  "device-diversity": {
    s: "The range of headset hardware, from tethered desktop to standalone, see-through to opaque, with different sensors, optics and processors, which the runtime must support without becoming a set of special cases.",
    d: "Devices differ in display count and shape, lens design, tracking method, available sensors, controller types, compute and thermal limits. The API standardizes what it can and exposes the rest through extensions and capability queries. The runtime selects features at start, and applications must adapt. Conformance tests keep behavior consistent, but timing and quality still vary. The cost shows in testing, since every combination multiplies, and in design, because the common denominator limits what the best devices can show.",
    k: ["Capability-based adaptation vs target specific devices: applications run widely, but code must handle missing features and look uneven across devices.", "Common conformance suite vs per-device certification: shared behavior is cheap to verify, but devices can pass while feeling quite different."],
    p: ["Testing on one flagship device and shipping broadly exposes problems on devices with weaker tracking.", "Assuming a feature exists because the API defines it fails on devices without the hardware."],
    v: "Run the same unmodified application on at least three device classes and confirm each starts, adapts to its reported capabilities, maintains its frame rate target and passes the conformance suite.",
    dep: ["device-abstraction","extension-negotiation","interaction-profiles"]
  },
});
