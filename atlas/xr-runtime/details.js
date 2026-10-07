// Details for the VR & AR runtime plate, part 1: application API, diagnostics, shell.
ATLAS.details("xr-runtime", {
  "instance-and-system-query": {
    s: "The first calls an application makes: connect to the runtime, then ask which headset is attached and what it can do, before any rendering resources exist.",
    d: "An instance object represents the application's connection to the runtime and records its name and the API version it was built against. A system query then returns a handle for the form factor requested, such as a head-mounted display, with properties like maximum layer count, supported view counts and whether tracking of hands or eyes exists. Graphics requirements are reported here too, so the application can create a compatible device. The difficulty is that this runs before the user is wearing anything, so answers may change when the headset connects or sleeps, and the runtime must report that cleanly.",
    k: ["Capability query before session creation vs probing by trial and error: applications can adapt without crashing, but the runtime must answer accurately for hardware that may be unplugged.", "Form factor as the unit of selection vs enumerating every device: applications stay portable, but device-specific tuning needs extensions."],
    p: ["Caching system properties across headset changes leaves the application with stale resolution or tracking assumptions.", "Querying graphics requirements after creating the wrong device forces a full restart of rendering."],
    v: "Launch with no headset connected and confirm a clear system-unavailable result. Connect it, repeat, and confirm the reported view count, recommended resolution and graphics requirements match the device specification.",
    dep: ["device-abstraction"]
  },
  "extension-negotiation": {
    s: "A mechanism for optional features: the application lists extensions it wants, the runtime accepts or rejects them, and unsupported ones fail early rather than mid-session.",
    d: "Runtimes advertise a list of named extensions covering hand tracking, passthrough, anchors, eye gaze, graphics bindings and vendor features. An application enables the ones it needs at instance creation; the runtime fails creation if a required one is missing. Enabled extensions add functions, structure types and sometimes events, which the application must load by name at run time. Extensions mature from vendor-specific to multi-vendor to core. The hard part is that features interact: an extension may only be valid with certain graphics bindings or session states, and the matrix of combinations is far larger than any test suite.",
    k: ["Opt-in extensions vs a monolithic API: old applications keep working and new hardware features appear fast, but portability depends on how many runtimes implement each extension.", "Failing instance creation on a missing extension vs degrading silently: the problem is visible immediately, but optional features need two code paths."],
    p: ["Assuming an extension present on one runtime exists on another produces a null function pointer crash.", "Enabling every available extension adds overhead and expands the privacy surface the user must consent to."],
    v: "Request an extension the runtime does not list and confirm instance creation fails with a named error. Request a listed one and confirm its functions resolve and return valid data.",
    dep: ["instance-and-system-query"]
  },
  "session-lifecycle": {
    s: "A state machine that moves an application from idle through ready, synchronized, visible and focused, driven by runtime events rather than by what the application asks for.",
    d: "After an application creates a session, the runtime sends state-change events. The application calls begin once the session is ready and starts the frame loop; it may be visible but not focused when a system menu is open; it must stop rendering and call end when told to stop. The state also reflects loss: the device was removed, the instance was lost, or the user asked to exit. The difficulty is that state arrives asynchronously, often while a frame is in flight, so applications must tolerate transitions at any point and release graphics resources in the right order.",
    k: ["Runtime-driven state with events vs application-driven control: the runtime can enforce system policy such as pausing, but applications must handle transitions they did not request.", "Separate visible and focused states vs one running state: applications can keep animating behind a menu, but must stop reading input while unfocused."],
    p: ["Ignoring the stop-request event keeps the application alive after the user chose to quit, and the runtime eventually kills it.", "Continuing to submit frames while not visible wastes the shared GPU budget and heats the device."],
    v: "Open the system menu over a running application and confirm a transition from focused to visible, input actions going inactive, and a clean return to focused when the menu closes.",
    dep: ["instance-and-system-query","app-focus-and-visibility"]
  },
  "view-configuration": {
    s: "Describes how many views are rendered per frame and at what size and field of view: two for a headset, or more for wide or high-resolution designs.",
    d: "The runtime returns, for the chosen configuration, the number of views, each with a recommended and maximum image size and sample count. Per-frame, it supplies a pose and field of view for each view, which are not symmetric and may include extra views for a wider peripheral display or an inset high-resolution region. The application renders each, often with a single instanced pass. The difficulty is that the recommended size accounts for lens distortion oversampling and changes with the user's interpupillary distance and performance level, so hard-coding resolutions breaks on other devices.",
    k: ["Asymmetric per-eye fields of view vs a symmetric frustum: matches real optics and saves pixels, but projection code must accept off-center matrices.", "Runtime-recommended resolution vs application-chosen: the runtime balances sharpness against distortion sampling, while the application may know its own content better."],
    p: ["Assuming two identical eyes breaks on devices with canted displays or extra peripheral views.", "Rendering at the maximum size rather than the recommended one wastes frame time without visible gain."],
    v: "Query the view configuration on two device models and confirm view count, recommended size and per-eye field of view differ as the hardware specification states, and that rendering with them produces no visible seam.",
    dep: ["instance-and-system-query"]
  },
  "reference-spaces": {
    s: "Named coordinate frames, such as seated, standing-floor and unbounded world, in which the application asks for poses so that it never touches raw sensor coordinates.",
    d: "An application creates a space and then asks the runtime where an object, such as the head or a hand, is in that space at a given time. A view space follows the head; a local space is anchored to where the session started; a floor-level space has its origin on the ground; an unbounded space spans large areas. Poses come with validity and tracking flags. The runtime handles recentering and map corrections underneath, so a space's relationship to the room can shift. The hard part is exposing a stable, simple model while the tracking system keeps revising its estimate of the world.",
    k: ["Spaces queried at a timestamp vs fixed transform snapshots: late, predicted poses are possible, but applications must query every frame instead of caching.", "Few standard spaces vs application-defined frames: simple and portable, but domain-specific needs layer on top with anchors."],
    p: ["Caching a world-space pose across tracking corrections leaves content visibly shifted from the room.", "Using a floor-level space on a device that cannot detect the floor yields a guessed height and a wrong scale."],
    v: "Walk in a loop and return to the start; confirm the head position in the local space ends within a few centimeters of zero, and the floor space reports a height matching a tape measure.",
    dep: ["coordinate-frames-and-time","visual-inertial-odometry"]
  },
  "swapchains": {
    s: "Sets of images the application renders into and the runtime reads from, with explicit acquire, wait and release steps so both sides can work at the same time.",
    d: "The application asks for a swapchain with a format, size, array layer count and usage flags. It acquires the next image, waits until the runtime has finished reading it, renders, then releases it. Formats are limited to those the compositor can sample and convert color for; color space matters because the compositor blends in a defined space. Images are shared across the application and compositor processes using external memory handles. The challenge is synchronization: an image released too early or read too late causes tearing or flicker visible only on a headset, and per-format support varies.",
    k: ["Explicit acquire, wait and release vs implicit swapping: the application controls overlap and can avoid stalls, but a missed release deadlocks the compositor.", "Array textures for both eyes vs separate images: one draw call renders both views, while some engines and formats need two swapchains."],
    p: ["Releasing the image before GPU work completes shows half-rendered frames in the headset.", "Choosing a format the runtime cannot blend in sRGB applies gamma twice and washes out the scene."],
    v: "Render a counter in each image and capture the compositor output; confirm every displayed frame shows a monotonically increasing counter with no repeated, skipped or partly drawn images over ten minutes.",
    dep: ["shared-texture-import","frame-loop"]
  },
  "frame-loop": {
    s: "The per-frame handshake: wait for the runtime's go signal and predicted display time, begin the frame, render, then end the frame with the submitted layers.",
    d: "The application calls a wait function that blocks until the runtime wants a new frame; it returns a predicted display time and a period. The application then begins the frame, locates the head and hands at the predicted time, renders, and ends the frame with its layers and the same display time. The runtime throttles the wait to keep the pipeline shallow. What makes it hard is that the wait call also paces the application, so doing work before it destroys the schedule, and a late end-frame call leads the compositor to reuse the previous frame.",
    k: ["Runtime-paced wait vs application timer: the runtime aligns work to the display and cuts latency, but the application gives up control of its own frame rate.", "Predicted display time passed to every pose query vs current time: poses match when photons arrive, but the application must plumb one timestamp through its code."],
    p: ["Updating game logic before the wait call lets the runtime's pacing drift and adds a full frame of latency.", "Querying poses at the current time instead of the predicted time makes motion look laggy and nauseating."],
    v: "Log the wait-return time, end-frame time and predicted display time for five minutes; confirm end-frame lands before the predicted display time minus the compositor margin on every frame.",
    dep: ["pose-prediction","frame-scheduler","reference-spaces"]
  },
  "layer-submission": {
    s: "How an application hands finished work to the compositor: an ordered list of layers, usually a projection layer plus optional quads, cylinders and overlays, each with a pose and a swapchain image.",
    d: "At end of frame the application submits layers with the pose and field of view it rendered with, the swapchain sub-image, blend flags for alpha, and optionally depth. The runtime re-projects each layer from those render poses to the final display pose. Layers submitted at the right pose are re-sampled instead of re-rendered, so flat UI is sharp at any resolution. The hard part is correctness of the pose and field of view recorded with each image: if they do not match what was actually rendered, the warp is wrong and the world swims.",
    k: ["Submitting poses with images vs submitting only images: the compositor can correct for late motion, but applications must record exact render parameters.", "Compositor-sampled layers vs application-drawn UI: text is sharp and cheap, but layer count and blending features are limited by the runtime."],
    p: ["Submitting a pose that differs from the one used to render makes everything appear to slide as the head turns.", "Too many layers exceeds the compositor's sampling budget and forces dropped frames."],
    v: "Submit a projection layer with a deliberately wrong pose and confirm the world visibly swims; then correct it and confirm the world stays locked while turning the head.",
    dep: ["swapchains","layer-composition","depth-submission"]
  },
  "latency-profiler": {
    s: "Measures the time from a physical head movement or button press to the change appearing on the display, using timestamps from every stage or external hardware.",
    d: "Software tracing stamps each stage: sensor capture, tracking result, application wake, render start and end, compositor receipt, scanout. External measurement points a photodiode or high-speed camera at the display while a motion rig or LED triggers an input. The tool breaks the total into stage costs and shows the distribution rather than the average. It is difficult because stage clocks differ and must be aligned, and because the figure that matters, motion-to-photon, includes the part between the last software timestamp and light leaving the panel.",
    k: ["Software timestamps vs external optical measurement: software is cheap and always on, but only a photodiode measures what the user sees, including panel response.", "Percentile reporting vs averages: spikes that cause discomfort show up, at the cost of needing many samples."],
    p: ["Trusting software timestamps alone hides display scanout and link delay that can be several milliseconds.", "Measuring only the application stage misses latency the compositor and tracking pipeline add."],
    v: "Rotate the headset on a rig through a known angle, compare a photodiode trace to the rig encoder, and confirm the reported motion-to-photon figure agrees within one millisecond of the software estimate.",
    dep: ["sensor-time-sync","display-timing","motion-to-photon-budget"]
  },
  "frame-timing-overlay": {
    s: "A live heads-up readout inside the headset showing frame rate, dropped frames, GPU and CPU time, and which reprojection mode the compositor is using.",
    d: "The compositor draws a small panel as a system overlay, fed by the same counters the profiler reads: application frame time, compositor GPU time, missed deadlines, active performance level and dynamic resolution scale. Colors flag trouble, for instance amber when reprojection starts. Because it is drawn in-headset it shows the actual experience rather than a desktop mirror. It is hard to make it cheap and unobtrusive: the overlay itself costs GPU time, and numbers read from a moving average hide the single dropped frame a person feels.",
    k: ["Always-available overlay vs a separate tool: problems are visible while wearing the device, but the overlay consumes budget and can change timing.", "Per-frame bars vs smoothed numbers: spikes are visible, but readability suffers at 90 frames per second."],
    p: ["Leaving the overlay on in performance tests hides the cost it adds.", "Showing a smoothed frame rate tells developers everything is fine while individual frames are being dropped."],
    v: "Insert a deliberate 30 millisecond stall every 200 frames and confirm the overlay shows a dropped-frame mark and the reprojection indicator at each one without a separate tool.",
    dep: ["frame-scheduler","system-overlays"]
  },
  "api-validation": {
    s: "A loader-inserted layer that checks every API call against the specification and reports misuse, such as wrong ordering, invalid handles or mismatched swapchain formats.",
    d: "The loader can place layers between application and runtime. A validation layer tracks handles, session state and call order and logs a message with the call, parameter and rule violated. It can also enforce frame-loop rules: end-frame without begin-frame, using a pose from another time base. Developers turn it on in debug builds. It is difficult because the rules are stateful and depend on events from the runtime, and because verbose checking of every call slows a latency-critical loop enough to change the behavior being debugged.",
    k: ["Separate layer vs checks built into the runtime: production runtimes stay lean, but problems on shipping builds go unnoticed.", "Strict failure vs warnings: strictness finds bugs early, but some real applications rely on behavior that is tolerated."],
    p: ["Shipping with validation enabled adds per-call cost that causes dropped frames.", "Treating a clean validation run as proof the application is correct misses timing and comfort faults it cannot see."],
    v: "Call end-frame twice without begin-frame and submit a layer with a stale swapchain image; confirm both are reported with the rule name, the offending call and the session state.",
    dep: ["runtime-discovery","session-lifecycle"]
  },
  "tracking-visualizer": {
    s: "A tool that draws what the tracking system believes: head and controller poses, hand joints, gaze rays, map points and confidence, in a window or in the headset.",
    d: "It subscribes to the same pose streams applications receive, plus internal diagnostics such as tracked feature counts, map keyframes, per-camera exposure and loss events. It renders them in a scene or overlays them on the camera images. Developers use it to see whether bad tracking comes from poor light, reflective surfaces, textureless walls or a covered camera. It is hard because the internal data is large and fast, so it needs sampling, and because exposing internals risks leaking camera imagery and room geometry, which is sensitive.",
    k: ["Internal diagnostics access vs only the public pose API: the tool explains why tracking failed, but it creates a privileged channel that must be secured.", "Overlay on live camera images vs abstract plots: the camera view is intuitive, but recording it stores images of the user's home."],
    p: ["Debug builds with the visualizer enabled leave a service that exposes camera frames to the local network.", "Reading poses from the public API alone hides internal loss events that explain jumps."],
    v: "Cover one tracking camera and confirm the visualizer shows its feature count falling to zero, the confidence flag dropping, and the pose degrading before any application sees a loss event.",
    dep: ["inside-out-slam","hand-skeleton-fitting","controller-poses"]
  },
  "record-and-replay": {
    s: "Captures a session's sensor streams and poses to a file and replays them later into the runtime, so a tracking or rendering bug can be reproduced without a person.",
    d: "Recording writes timestamped sensor samples, camera frames, controller states and input events. Replay feeds them in place of live drivers while the runtime runs normally, optionally at a different speed. It lets teams compare tracking algorithm versions on identical data and run regression tests on a build server. The difficulty is determinism: timing-dependent code, multi-threaded pipelines and clock sources make replays diverge from the original, and recorded camera data is large and personal.",
    k: ["Recording raw sensor data vs recording final poses: raw data allows re-running new algorithms, but files are huge and contain room imagery.", "Real-time replay vs as-fast-as-possible: real-time reproduces timing bugs, while fast replay makes large regression suites practical but hides them."],
    p: ["Replays that use the live clock instead of recorded timestamps produce different fusion output every run.", "Sharing recordings between teams passes along camera footage of people's homes."],
    v: "Record a walk, replay it twice through the same build, and confirm the resulting head trajectories are identical to within a millimeter; replay it through a changed algorithm and confirm the differences are reported.",
    dep: ["sensor-drivers","sensor-time-sync","device-simulator"]
  },
  "device-simulator": {
    s: "A software stand-in for a headset and controllers, with keyboard and mouse driving poses, so applications and runtime changes can be tested on a desktop.",
    d: "The simulator presents itself to the loader as a normal runtime or driver: it reports a system, view configuration and interaction profile, accepts swapchains and frame submissions and shows them in a window. Poses come from input devices or scripted paths. Continuous integration uses it to exercise the API without hardware. It is hard to avoid false confidence: it has no lens, no latency, no tracking failures and no comfort effects, so it verifies that API calls work but cannot say anything about how the experience feels.",
    k: ["Faithful simulation of timing vs a fast, simple stub: realistic timing finds pacing bugs, but a stub is cheaper and runs in any test environment.", "Scripted pose paths vs interactive control: scripts give repeatable tests, while interactive control suits exploration."],
    p: ["Passing on the simulator and shipping assumes hardware behaves the same, and misses tracking loss, latency and distortion problems.", "Simulated interaction profiles that differ from real controllers hide binding mistakes."],
    v: "Run the application's integration suite against the simulator in CI, and confirm it covers session transitions, input actions and layer submission, with at least one scripted head movement producing the expected view matrices.",
    dep: ["interaction-profiles","layer-submission"]
  },
  "crash-and-telemetry": {
    s: "Collects crash dumps, performance counters and tracking-quality statistics from real devices, so field problems that never reproduce in the lab can be found and fixed.",
    d: "The runtime records crashes of the compositor and tracking services with the state of the session, and aggregates counters such as dropped frames per hour, tracking-loss events per session, thermal throttle time and reprojection use. Uploads are batched and anonymized. Applications can contribute their own frame statistics. It is hard because the interesting data is the most sensitive: camera images, room geometry, eye and hand data and exact usage patterns, so collection must be minimized, consented and aggregated.",
    k: ["Opt-in detailed telemetry vs always-on minimal counters: detail makes failures diagnosable, but opt-in rates leave a biased and small sample.", "On-device aggregation vs raw upload: privacy improves and bandwidth falls, but root-causing needs raw traces that are no longer there."],
    p: ["Crash dumps containing camera buffers upload images of a person's home without their knowledge.", "Averages across the fleet hide a tracking failure that affects one device model or one lighting condition."],
    v: "Force a compositor crash on a test device and confirm a dump with session state and no image data reaches the collector, and that counters in the dashboard match the device's local log.",
    dep: ["permissions-and-privacy","frame-budget-governor"]
  },
  "runtime-discovery": {
    s: "The loader mechanism that finds which runtime is active on the machine, loads it, and lets API layers sit between application and runtime.",
    d: "A small loader library linked into every application reads a manifest from a well-known location, which names the active runtime's library and the API version it supports. The loader then forwards calls, applying any enabled layers such as validation. On systems with several runtimes only one is active, selectable by the user. Because the loader is part of every application, it must stay small, backward compatible for years and safe against hostile manifests. It is hard to get right when a runtime is uninstalled, upgraded mid-session or registered by two installers.",
    k: ["Single active runtime selected by the user vs per-application choice: behavior is predictable, but the system must switch the whole desktop when changing headsets.", "Loader with layers vs direct linking to a runtime: tools can hook in, at the cost of an extra call indirection and a hijack point."],
    p: ["A stale manifest pointing at an uninstalled runtime makes every XR application fail with an unhelpful error.", "Loading layers named by an environment variable in production lets malware intercept pose data."],
    v: "Install two runtimes, switch the active one, and confirm the same unmodified application connects to each in turn and reports that runtime's name; then delete one and confirm a clear failure message.",
    dep: ["device-abstraction"]
  },
  "app-focus-and-visibility": {
    s: "Rules for which application is drawn and which receives input, covering the foreground application, background ones, and the system menu opened over them.",
    d: "The runtime assigns each session a visibility and focus state. A focused application gets input and draws as normal. A visible, unfocused one is drawn, for example behind a system menu, but has input actions suspended. A hidden application keeps its session but is not composited. The runtime reports changes as events and may reduce its frame budget when it is not focused. The difficulty is making transitions seamless: input must never be lost to the wrong application and the display must never go black while one application yields to another.",
    k: ["Input follows focus only vs sharing input among visible applications: security and clarity improve, but background widgets cannot react to the user.", "Throttling unfocused applications vs full speed: GPU time goes to the active one, but background content may stutter when returning."],
    p: ["Input leaking to a background application lets it capture keystrokes meant for a password prompt.", "A transition that drops one frame shows a black flash that is uncomfortable in a headset."],
    v: "Open a system menu in a running application, press buttons on the controller, and confirm the application receives no input while still rendering, then closes and receives input again within one frame.",
    dep: ["multi-app-compositing","action-system"]
  },
  "multi-app-sessions": {
    s: "Supports several applications at once, such as a shared room with widgets from different programs, by sharing the compositor, space and input among sessions.",
    d: "In immersive mode a single application owns the whole view. In shared-space mode the runtime hosts several applications, each rendering windows or volumes that the compositor places in a common space and sorts for depth and occlusion. Each application sees only its own content and its own input. The runtime enforces fair GPU time, handles different frame rates and resolves overlap. It is hard because applications written for exclusive control now share a scarce budget, and a single poorly behaved one can hurt the experience of all.",
    k: ["Shared space with windows vs one immersive application: users can multitask and the runtime can apply uniform comfort rules, but applications lose full control of the scene.", "Runtime-controlled placement vs application-controlled: windows never block each other or the user's view, but layout looks less custom."],
    p: ["One application's slow frames can drag the shared compositor below its deadline unless isolated.", "Letting an application discover the position of others leaks what else the user is running."],
    v: "Run three applications in a shared space, make one stall for 100 milliseconds repeatedly, and confirm the other two keep presenting at the target rate while the stalled one shows a stale frame.",
    dep: ["multi-app-compositing","gpu-priority-preemption","app-focus-and-visibility"]
  },
  "home-environment": {
    s: "The default scene shown when no application is running: a virtual or passthrough home where the user launches applications and adjusts settings.",
    d: "The home is itself a runtime-owned application. It displays a virtual space or the real room, a launcher, notifications and status, and plays a part in the first-run flow where the user is guided through fitting and setting a boundary. It shares the compositor with other sessions and returns the user to a known, safe place when an application exits. It is hard because the home environment is what the user sees most, so it must be lightweight and never fail, and it must resume gracefully after the device sleeps and tracking has lost its map.",
    k: ["Passthrough home vs virtual home: the user stays aware of the room and the experience starts safe, but passthrough costs power and camera privacy.", "Home as a runtime-owned application vs a separate shell: it is tightly integrated and fast, but it enlarges the trusted code base."],
    p: ["A home that fails to load leaves the user in an empty void with no way out.", "Loading a heavy home scene on every resume delays the user and adds a cold start after each application exit."],
    v: "Exit an application and confirm the home appears within one second, at the right height, with the user's boundary visible; then sleep and wake the device and confirm it returns to the same place.",
    dep: ["system-overlays","boundary-system","multi-app-compositing"]
  },
  "system-overlays": {
    s: "Runtime-drawn interface on top of any application: menus, notifications, volume, boundary warnings and the camera-on indicator, which applications cannot hide or fake.",
    d: "System overlays are composited after application layers, in a protected layer the application cannot read back or cover. They are positioned relative to the head or hand and often follow with a lag so they do not feel stuck to the face. They open from a reserved gesture or button. The challenge is balancing interruption against safety: the boundary warning and privacy indicator must always appear, even if the application is misbehaving, while ordinary notifications should wait for a calm moment.",
    k: ["Always-on-top system layer vs applications drawing their own warnings: the user can trust indicators, but applications lose control of the full view.", "Head-locked vs world-locked overlays: head-locked panels are always reachable but cause eye strain, while world-locked ones can be lost behind the user."],
    p: ["An overlay positioned in a fixed head-locked place causes discomfort and covers the application's content.", "Letting applications render over the privacy indicator allows covert camera use."],
    v: "Trigger the boundary warning, a notification and the recording indicator while an application renders full-screen content, and confirm all appear on top and cannot be captured by the application's own screenshot.",
    dep: ["layer-composition","permissions-and-privacy"]
  },
  "headset-state": {
    s: "Tracks whether the headset is on a head, idle, asleep or charging, using proximity sensors and motion, and moves the session and display accordingly.",
    d: "A proximity sensor between the lenses and the IMU's motion data decide whether the device is being worn. On donning, the runtime wakes the display, resumes sessions and may check fit; on removal it pauses applications, turns off panels and begins a timer to sleep. It also reports battery, charging state and link state. The difficulty is false positives: a sensor covered by a hand, or a headset set on a table that is bumped, must not toggle sessions on and off, and wake must be fast enough that the user sees an image immediately.",
    k: ["Proximity sensor plus motion vs a manual power button: hands-free and quick, but unusual faces, glasses and sunlight can fool the sensor.", "Pausing applications on removal vs letting them run: it saves power and protects privacy, but multiplayer sessions may drop."],
    p: ["Treating a brief proximity dropout as removal pauses the application mid-action.", "A display that stays on when the headset is set face-up can burn in or overheat."],
    v: "Put the headset on and take it off ten times with and without glasses; confirm each wear event wakes the display within 500 milliseconds and each removal pauses the session within two seconds.",
    dep: ["proximity-and-wear-sensors","session-lifecycle"]
  },
  "permissions-and-privacy": {
    s: "The user-facing consent system for sensitive capabilities such as cameras, room data, eye gaze and hand tracking, checked when an application requests the feature.",
    d: "Features such as scene meshes, passthrough images, eye tracking and face tracking sit behind permissions. The runtime asks the user at first use, remembers the answer per application, and lets it be changed in settings. Some data is withheld unless the feature is in use and indicated. Access is enforced in the runtime, not in the application's code. The hard parts are the wording, since users do not know what a mesh reveals, and the combinatorics: data that is harmless alone, such as gaze and head pose, can identify a person together.",
    k: ["Per-capability prompts vs a single blanket permission: users understand what they grant, but too many prompts cause habituation and blind acceptance.", "Runtime enforcement vs application self-restraint: the guarantee holds even for malicious applications, but the runtime must be able to see every data path."],
    p: ["Granting camera permission to an application also gives it the scene mesh, because both come from one grant.", "Prompts shown inside a headset in the middle of an experience are accepted without being read."],
    v: "Deny eye tracking permission to an application and confirm its gaze action returns inactive and no gaze data reaches it, while a second application with permission still works.",
    dep: ["biometric-data-gating","runtime-discovery"]
  },
});
