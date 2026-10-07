// Details for the mobile operating system plate, part 5: power and thermal, display and hardware interfaces, cross-cutting concerns.
ATLAS.details("mobile-os", {
  "power-manager": {
    s: "The service that decides the device's power state: screen on, dim, off, doze and sleep, driven by user activity, timeouts, proximity and apps' requests to stay awake.",
    d: "It tracks user activity events, screen timeout, proximity sensor and wake locks, then moves the display and processor through states, asking the display and kernel to follow. It adjusts brightness through ambient light curves, and manages low-power modes that cut background work and animations when the battery is low. Other services subscribe to state changes to pause work. It is hard because the transitions are a distributed agreement: many components must settle before the device can sleep.",
    k: ["Central policy owner with component callbacks vs each component deciding when to sleep: central policy makes behavior consistent and auditable; a stuck component keeps the whole device awake.", "Adaptive brightness learned per user vs fixed curve: learning matches preferences; it can behave inconsistently and is hard to test."],
    p: ["A single service holding a wake lock stops the device from entering sleep and drains the battery overnight.", "Proximity sensor misreads turn the screen off during a call with the phone in a pocket-shaped state."],
    v: "Leave the device idle with the screen off and confirm it reaches the deepest idle state within the target interval and the battery drain rate matches the documented standby figure.",
    dep: ["wake-locks", "suspend-resume", "sensor-hub", "hal-contracts"]
  },
  "wake-locks": {
    s: "Reference-counted requests by apps and services to keep the processor or screen on, which the platform tracks, attributes and limits.",
    d: "A component acquires a named lock of a level, such as processor-only or screen-on, and releases it when done. The power manager keeps the device awake while any lock is held. Locks carry a tag and the holder's identity, so battery attribution can charge the right app, and they usually have timeouts. Some are system-only. Misuse, usually a missed release on an error path, is the most common cause of battery drain, so the platform increasingly limits how long background apps may hold them.",
    k: ["Explicit locks with timeouts vs automatic staying awake while work runs: explicit locks are precise; forgetting to release is a drain bug.", "Platform-imposed limits for background apps vs trusting apps: limits protect battery; legitimate long operations such as sync must use scheduled jobs and foreground services."],
    p: ["A lock acquired before a network call and not released on timeout holds the device awake indefinitely.", "Locks without a descriptive tag make drains impossible to attribute."],
    v: "Hold a partial lock in a test app, turn the screen off and confirm the device stays awake and the app appears in battery attribution with the tag; release it and confirm sleep begins.",
    dep: ["power-manager", "battery-attribution"]
  },
  "idle-state-manager": {
    s: "Escalating idle modes that suspend background work, network access and alarms for apps when the device is stationary and unused, with brief maintenance windows.",
    d: "After the screen is off and the device unplugged, the manager waits, then enters light idle, which defers jobs and syncs, and later deep idle when motion is absent, which also stops network, wakes and exact alarms. At increasing intervals it opens a window so apps can run deferred work in bulk. Any motion or screen-on exits idle. High-priority messages and a short allow list are exceptions. It is hard because apps often misbehave when thawed all at once and because motion detection errs both ways.",
    k: ["Escalating states with exponentially spaced maintenance windows vs a single idle mode: escalation saves large amounts of standby power; deferred messages feel late.", "Motion-based entry vs timeout-only: motion detection avoids dozing while the user carries the device; it depends on sensor quality."],
    p: ["Apps that expect network access in deep idle fail to sync until the next window.", "Maintenance windows start many apps at once and spike CPU and radio."],
    v: "Place the device still with the screen off for an hour and confirm it enters deep idle, with network blocked for non-exempt apps, then opens a maintenance window at the documented interval and resumes on motion.",
    dep: ["power-manager", "sensor-hub", "job-scheduler"]
  },
  "suspend-resume": {
    s: "The sequence that stops devices and puts the processor into a deep sleep state, and the wake sources that bring it back, such as touch, alarms and the radio.",
    d: "The framework releases the last wake lock; the kernel freezes user space, calls each driver's suspend handler in order, and halts the processor with memory in self-refresh. Wake sources such as the power button, modem, push traffic and timers are armed in hardware. On a wake event drivers resume and the framework thaws. The device spends most of its life in this cycle. The hard part is races: a wake event arriving during suspend entry must abort it, and a driver that cannot suspend blocks it.",
    k: ["Opportunistic suspend whenever no locks are held vs explicit sleep requests: opportunistic suspend maximizes sleep with simple app logic; apps must hold a lock for any work they want done.", "Many wake sources vs few: many sources let the device react to anything; each one risks spurious wakes that waste power."],
    p: ["A driver that fails to suspend silently keeps the device out of deep sleep.", "A noisy wake source such as a chatty Wi-Fi network wakes the device continuously."],
    v: "Measure current draw in suspend and list wake reasons over a night: draw should match the vendor's idle figure and wake sources should be limited to the expected few.",
    dep: ["power-manager", "hal-contracts"]
  },
  "battery-attribution": {
    s: "Accounting that estimates how much energy each app and component used, from CPU time, radio use, wake locks, sensors and screen time, so users and the system can act on heavy consumers.",
    d: "Kernel and framework counters record CPU time per app, wake lock time, mobile radio active time, location and sensor use and screen time. A power model converts these to energy using per-component power profiles measured by the vendor, and some hardware has direct power rails. The result drives usage screens, standby bucket changes and restrictions on excessive apps. It is hard because attribution is approximate: shared costs such as the radio tail time must be split somehow.",
    k: ["Model-based estimates from usage counters vs hardware power measurement: models need no extra hardware and cover every device; they drift from reality and can be gamed.", "Charge shared work to the caller vs to the service: charging the caller reflects who asked; it hides expensive service implementations from the service author."],
    p: ["Inaccurate profiles blame the wrong app, so users uninstall a harmless one.", "Work done by a system service on behalf of an app is charged to the system and the app appears free."],
    v: "Run a known app that holds a wake lock and streams data for an hour and confirm its attributed share matches a hardware power measurement within the stated tolerance.",
    dep: ["wake-locks", "sensor-hub", "standby-buckets"]
  },
  "thermal-service": {
    s: "Reads temperature sensors across the chip, battery and skin, computes a headroom and status, and informs the platform and apps before heat becomes a problem.",
    d: "The service collects readings from the chip, battery and enclosure through the hardware interface and derives a thermal status from none to shutdown, and a headroom forecast for how much more load the device can take. Listeners such as games, the camera and the charger subscribe. The kernel has its own governor acting faster. The difficulty is that the surface temperature people feel does not equal the chip temperature, so skin models and per-device tuning are needed.",
    k: ["Predictive headroom for apps vs only discrete status levels: headroom lets apps scale gracefully before throttling; predictions can be wrong across devices and cases.", "Skin-temperature limits vs chip limits only: skin limits keep a phone comfortable to hold; they throttle performance earlier than silicon needs."],
    p: ["A case, direct sun or wireless charging raises temperatures in ways the lab model did not include.", "Apps that ignore thermal status see sudden frame drops when the kernel throttles."],
    v: "Run a sustained heavy workload and confirm the status progresses through levels in order with headroom falling, while the observed skin temperature stays under the design limit.",
    dep: ["hal-contracts", "sensor-hub"]
  },
  "thermal-mitigation": {
    s: "The actions taken as heat rises: lower processor frequencies, cap brightness, limit charging and radio use, close cameras, and in the extreme shut the device down.",
    d: "Governors in the kernel and platform apply steps in order of user impact: reduce charging current, cap frequencies on the big cores, lower the refresh rate and brightness, disable the flash or high frame-rate recording, and finally warn and shut down. Each step cuts power in a different part of the system. Hysteresis stops oscillation. It is hard because mitigations visibly harm the experience, and because they must cooperate with the apps' own scaling and with background restrictions.",
    k: ["Gradual steps ordered by user impact vs one hard throttle: gradual steps hold performance as long as possible; they take careful per-device tuning.", "Platform-imposed limits vs apps reducing load themselves: platform limits protect the hardware regardless of apps; app-level scaling gives smoother results when apps listen."],
    p: ["A mitigation that triggers too late shows as skin burns or an emergency shutdown during a call.", "Oscillation between throttled and unthrottled states causes stutter instead of a steady lower frame rate."],
    v: "Heat the device in a controlled chamber with a looping benchmark and log the frequency and brightness caps by temperature: caps must engage in the designed order and recover with hysteresis.",
    dep: ["thermal-service", "performance-hints", "frame-pacing"]
  },
  "performance-hints": {
    s: "Interfaces where apps and the system tell the scheduler what work is critical, such as a frame deadline or a game loop, so frequency and core choices fit demand.",
    d: "An app reports its target work duration and actual durations for a thread group each cycle. The system's performance service adjusts CPU frequency and core placement to meet that target with minimal energy, rather than reacting after load changes. Boost requests cover user-visible events such as app launch and scrolling. The platform ties these hints to thermal headroom. It is hard because load-based governors are always late for bursty work, and because hints can be abused for permanent boosts.",
    k: ["Explicit work-duration hints vs load-driven frequency governors: hints respond before the load appears and save energy; they require app and system cooperation.", "Platform-initiated boosts on input vs on app request: input boosts make touch feel instant; they burn power if used on every touch."],
    p: ["A hint session left open keeps the cores at high frequency when no work remains.", "Wrong target durations cause either missed frames or wasted power."],
    v: "Run a scrolling test with and without hint sessions and compare missed-frame counts and energy use: with hints, missed frames should drop at equal or lower energy.",
    dep: ["thermal-service", "frame-pacing"]
  },
  "window-manager": {
    s: "Owns the set of windows on screen, their size, position, stacking and focus, and applies rules for split screen, folding, pop-up and insets.",
    d: "Every app screen and system overlay is a window with a type that decides its layer and allowed behavior. The manager lays them out within the display and arrangement rules, delivers focus, hands insets for bars and cutouts, animates transitions, and sends configuration changes to apps. It talks to the compositor for buffers and the input dispatcher for hit areas. It is hard because windows come from untrusted apps, so overlays and flags must be policed, and because folding and resizable displays change configuration constantly.",
    k: ["Trusted window types with fixed layers vs apps choosing their own z-order: fixed layers keep security UI always on top; apps cannot cover the whole display for effects.", "Freeform and split-screen support for all apps vs only opt-in apps: support for all gives consistent multitasking; apps not designed for resizing break."],
    p: ["Overlay windows from an app covering a permission dialog enable tapjacking.", "Apps that fix their orientation or size mishandle a folded or split display."],
    v: "Open a permission dialog while a test app draws a full-screen overlay, and confirm touches pass to the system dialog only when its content is visible; resize an app in split mode and confirm it receives a configuration change.",
    dep: ["surface-compositor", "input-dispatcher", "activity-and-scene-model"]
  },
  "surface-compositor": {
    s: "Combines the buffers of every visible window and the system bars into one frame each refresh, using the display hardware's layers where possible and the GPU otherwise.",
    d: "Apps render into buffers they queue to the compositor, which holds the latest per window. On each vertical sync it decides which layers the display hardware can blend itself and which need GPU composition, sends the plan to the display interface and presents. Buffers pass through fences so the GPU, the display and the producer know when each is ready. It is hard because it is on the critical path of every frame, must never block on a slow app, and handles color, rotation, secure content and variable refresh.",
    k: ["Hardware overlays vs GPU composition: overlays use less power and memory bandwidth; hardware supports few layers and effects force fallback to the GPU.", "Triple buffering vs double buffering: triple buffers absorb jitter and keep the pipeline busy; they add a frame of latency and memory."],
    p: ["One app that delivers frames late stalls only its own window, unless the compositor waits on its fence.", "Falling back to GPU composition for every frame doubles power draw in a video app."],
    v: "Play full-screen video and capture the composition plan: the video layer should go to a hardware overlay with the GPU idle; add a translucent system overlay and confirm the fallback is limited to the needed layers.",
    dep: ["composer-hal", "frame-pacing", "window-manager"]
  },
  "composer-hal": {
    s: "The vendor-implemented interface that tells the display hardware which layers to blend, and reports vertical sync, panel modes and color capabilities.",
    d: "The compositor validates a proposed layer list with the vendor's composer implementation, which accepts layers it can handle in hardware and rejects the rest. It then commits a frame, receives a present fence and a sync timestamp. The interface also exposes refresh-rate modes, color and HDR support, power states of the panel and brightness control. Its difficulty is that it is where hardware differences show: layer count, scaling limits and blending formats vary, and bugs here produce visual corruption.",
    k: ["Validate then commit protocol vs fire and forget: validate lets the compositor adapt to hardware limits per frame; it adds a round trip to every frame.", "Stable versioned interface vs vendor-private extensions: a stable interface lets one platform drive any panel; vendor extensions unlock hardware features at the cost of fragmentation."],
    p: ["A vendor that accepts a layer it cannot actually blend produces flicker or tearing only for specific content.", "Sync timestamps that drift break frame pacing."],
    v: "Run a conformance suite that composes layer combinations and compare captured output with reference images; confirm the sync timestamps arrive at the panel's refresh interval with low jitter.",
    dep: ["hal-contracts"]
  },
  "input-dispatcher": {
    s: "Routes keyboard, touch, stylus and pointer events from the kernel to the correct window and process, applying focus, gestures, security filters and timeouts.",
    d: "Raw events from device nodes are turned into typed events and the dispatcher decides the target using window geometry from the window manager. It sends events through a channel to the app, and waits for a finish signal; if an app does not respond within the timeout, the system flags it as not responding. It enforces filters such as dropping touches on obscured windows and gives system gestures priority. It is hard because latency, ordering and security all matter, and an unresponsive target must not block others.",
    k: ["Focus-based routing for keys vs hit-test routing for touch: each matches how people expect devices to behave; mixed devices such as stylus-plus-keyboard need both.", "Block the queue until the app acknowledges vs continue dispatching: blocking keeps ordering exact; it makes one slow app delay input for itself, and the timeout must bound it."],
    p: ["Dropped obscured-touch protection allows a tiny overlay to steal taps.", "Events batched too aggressively add latency that makes drawing and scrolling feel sluggish."],
    v: "Inject a touch sequence with a timestamp and measure time to the app's handler against the latency budget; cover the target window with a trusted overlay and confirm the touch is dropped or blocked per policy.",
    dep: ["touch-pipeline", "window-manager", "transactional-ipc"]
  },
  "touch-pipeline": {
    s: "The path from the touch controller to the framework: scanning, filtering, palm rejection, coordinate calibration and prediction, producing events at the panel's report rate.",
    d: "The controller reports capacitance changes at a fixed rate. Firmware and a driver turn them into contacts with positions, pressure and size. Palm and grip rejection discards unintended contacts, and the framework resamples to align events to frames and predicts the next point to hide latency. High report rates reduce delay at the cost of power. It is hard because behavior depends on panel, noise, case, charger and humidity, and every stage trades smoothness against accuracy and delay.",
    k: ["Touch prediction vs raw points: prediction cuts perceived latency in drawing and scrolling; mispredictions show as overshoot at sudden stops.", "Firmware palm rejection vs framework-level: firmware sees raw signals and reacts quickly; framework rejection can use app and screen context and is easier to update."],
    p: ["Noise from a charger produces ghost touches that fire random taps.", "Edge touches rejected as palms break edge gestures for apps."],
    v: "Draw slow and fast strokes with a robot and compare reported and true positions: error and latency must be within budget, and a resting palm must produce no events.",
    dep: ["hal-contracts", "input-dispatcher"]
  },
  "frame-pacing": {
    s: "Aligns app rendering, composition and presentation to the display refresh so frames arrive on time, without tearing or uneven spacing, and adapts rate to content.",
    d: "The display issues a sync signal. A choreographer wakes apps slightly before it to produce a frame, and the compositor wakes later to combine what is ready. Offsets are chosen so that a frame takes the shortest path to the screen. Variable refresh lets the panel run at a lower rate for static content and a high rate for motion, with frame-rate hints from apps. It is hard because missing a deadline duplicates the previous frame and is visible, and because several processes must agree on one clock.",
    k: ["Sync-aligned production vs render as fast as possible: aligned production saves power and gives even spacing; free-running rendering lowers latency for games at higher energy.", "Adaptive refresh rate vs fixed high rate: adaptive saves substantial power on static content; switching rates can flicker and break animation timing."],
    p: ["An app drawing at an uneven interval causes visible judder, even at high average frame rates.", "Conflicting frame-rate hints between windows make the display flap between modes."],
    v: "Capture frame present timestamps during a scroll and confirm the interval variance is low, with no more than a few dropped frames per minute; play a 24-frame video and confirm the display uses a matching rate.",
    dep: ["surface-compositor", "composer-hal", "performance-hints"]
  },
  "text-input-method": {
    s: "A replaceable keyboard process that talks to the focused text field through a system channel, supplying composed text, suggestions and handwriting or voice input.",
    d: "When a text field gains focus, the system binds it to the active input method, which draws its own window and sends committed text and composing spans back through a connection. The field reports its type, such as password or number, so the keyboard can adapt and disable learning. Because the keyboard sees everything typed, the platform treats it as highly privileged: the user must enable it, and only the focused app may talk to it. It is hard because composition, cursor movement and undo must stay in sync across two processes.",
    k: ["Third-party keyboards in their own process vs a fixed system keyboard: third-party choice serves languages and accessibility; all typing passes through code the user must trust.", "Composing text in the field with spans vs at the keyboard: field-side composition keeps spelling and cursor consistent; each text widget must implement the protocol well."],
    p: ["A keyboard that logs input to servers leaks passwords unless fields mark themselves as sensitive.", "Out-of-sync cursor state between app and keyboard produces duplicated or deleted characters."],
    v: "Focus a password field and confirm the active keyboard receives the sensitive input type and disables suggestions; type with composition in a text field and confirm committed text and cursor stay consistent across rotation.",
    dep: ["window-manager", "transactional-ipc", "input-dispatcher"]
  },
  "sensor-hub": {
    s: "A low-power processor that samples accelerometers, gyroscopes and other sensors continuously, batches readings and wakes the main processor only for events such as a step or a gesture.",
    d: "Sensors connect to a small always-on chip with its own firmware. It samples at requested rates, applies calibration and simple algorithms such as step counting, significant motion and tilt detection, and writes readings to a FIFO. The main processor reads batches on a schedule or on an event. The platform exposes these as typed sensors with rate and batching limits for apps, and permission is needed for high rates and for body sensors. It is hard because it is a separate firmware and calibration drifts.",
    k: ["Batching in the hub vs streaming each sample to the main processor: batching allows long main-processor sleep; apps get data late and in bursts.", "Rate caps for apps without permission vs unrestricted rates: caps prevent keystroke or speech inference from motion data; they harm legitimate high-rate uses such as games and fitness."],
    p: ["Calibration drift gives wrong orientation or step counts that grow over weeks.", "Hub firmware bugs are fixed only by system updates, so a faulty gesture can persist."],
    v: "Record accelerometer data on a shaker table at known amplitudes and compare to reference; leave the device still with the screen off and confirm the main processor wakes only for registered events.",
    dep: ["hal-contracts"]
  },
  "camera-pipeline": {
    s: "The hardware and vendor software chain from image sensor through the image signal processor, producing preview, still and video streams with focus, exposure and color decisions.",
    d: "The sensor streams raw frames to a dedicated image processor that performs denoising, demosaicing, white balance, tone mapping and scaling, controlled by per-frame requests from the camera service. Vendor algorithms run auto-exposure, autofocus and multi-frame computational photography, sometimes using the GPU or a neural accelerator. Output buffers go to the encoder, compositor or app. It is hard because quality is mostly vendor tuning, latency from shutter to saved photo is a hard budget, and several streams share one sensor.",
    k: ["Vendor-tuned image processing vs raw access for apps: vendor tuning gives good pictures by default; raw access lets apps and professionals do their own processing at a high cost.", "Multi-frame processing vs single-shot capture: multi-frame gives better dynamic range and low-light results; it adds shutter-to-save delay and subject motion artifacts."],
    p: ["Using several streams at maximum resolution exceeds sensor or memory bandwidth on some devices.", "Zero shutter lag buffers keep recent frames in memory, which should be cleared when the camera closes."],
    v: "Capture charts and low-light scenes under known lighting and compare color error and noise to the target; measure shutter-to-saved latency over many shots.",
    dep: ["hal-contracts", "sensor-hub"]
  },
  "hal-contracts": {
    s: "Versioned interfaces between the platform and vendor-written hardware code, so the operating system can be updated without rebuilding drivers and vendor code is kept in its own process.",
    d: "Each hardware domain, such as display, audio, camera and radio, defines an interface in an interface definition language with a version and a stability guarantee. Vendors implement it in separate processes, reached through the call mechanism and registered in a vendor service registry, with their own access policy. A compatibility matrix lists which versions a device ships and the framework requires, and a test suite verifies conformance. It is hard because vendor code is large, privileged and rarely updated, and because every interface change is a multi-year migration.",
    k: ["Stable versioned interfaces with the vendor in separate processes vs drivers linked into the framework: stability lets the platform update independently and contains vendor faults; each call crosses a process boundary.", "Conformance test suite as a gate vs trust in vendors: a gate catches divergence before shipping; it can only test what it has thought of."],
    p: ["A vendor implementation that deviates from the contract works on one device and breaks on the next platform release.", "Old interface versions retained for years extend the supported surface and slow every update."],
    v: "Run the conformance suite against each vendor implementation and confirm the device's compatibility matrix validates at boot: a mismatched version must be reported and refuse to start the dependent service.",
    dep: ["service-registry", "transactional-ipc"]
  },
  "battery-budget": {
    s: "Every layer spends from a small, fixed energy budget, and design choices from radios to animation are judged by their effect on a day of use.",
    d: "A phone battery holds a few watt-hours and the user expects a day of mixed use plus long standby. Each decision borrows from that: waking the processor, keeping the radio active through its tail, lighting the screen at high refresh rate, holding the satellite receiver on. The platform therefore batches, defers, ranks and limits, and attributes use to apps so it can restrain them. The budget interacts with heat, since spending power makes both energy loss and temperature.",
    k: ["Batch and defer work for efficiency vs run work at once for latency: batching saves large amounts of power; it adds delay people notice in messages and syncs.", "Restrict apps automatically vs inform users: automation works for most people; wrong restrictions break features users depend on and are hard to diagnose."],
    p: ["A single design that wakes the device every few seconds, such as a keep-alive heartbeat, dominates standby drain.", "Per-feature savings that are not measured on real usage mixes disappear in total drain."],
    v: "Run a standard day-of-use script with realistic notifications and measure whole-day energy and standby drain on the shipped hardware, comparing against the previous release.",
    dep: ["power-manager", "job-scheduler", "idle-state-manager", "battery-attribution"]
  },
  "memory-scarcity": {
    s: "Phones have no swap to disk and many apps competing for a few gigabytes, so memory use is policed, apps are killed freely and must save state without notice.",
    d: "Without spill-to-disk, exhausting memory means killing something. The platform ranks processes by importance, keeps pages shared through the process spawner, compresses idle memory and freezes cached apps. It expects apps to save state continuously and survive a restart from nothing. All components, including system services, are designed with small resident sizes, which affects the choice of languages, caches and buffers. A design that assumes an app stays resident is wrong on a phone.",
    k: ["Compress idle memory vs kill more apps: compression keeps apps warm at a CPU and energy cost; killing frees memory at once and lengthens later starts.", "Strict per-process limits vs best-effort sharing: limits give predictability and stop leaks from spreading; they crash apps with legitimate peaks."],
    p: ["Services that cache aggressively on a 4 GB device are killed repeatedly and thrash.", "Developers who test on large-memory phones miss restoration bugs that appear daily on small ones."],
    v: "Run a standard multi-app workload on the smallest supported memory configuration and measure kill counts, cold-start fraction and stall time against the target.",
    dep: ["low-memory-killer", "process-priority-states", "process-spawner", "state-restoration"]
  },
  "privacy-by-default": {
    s: "The platform assumes that apps are curious and users cannot audit them, so access to data and sensors is denied until needed, narrowed on grant, and made visible while in use.",
    d: "Choices made in many layers add up: runtime permissions, reduced-precision grants, scoped storage, package visibility limits, clipboard and notification redaction, indicators, auto-reset and sandboxed media parsing. Each limits what an app can learn and shows the user what it uses. Business models built on collecting data push the other way, so rules need enforcement not documentation. Default privacy means features must work with less data, which constrains API design and app compatibility.",
    k: ["Deny and ask vs allow and let the user revoke: deny-and-ask puts the burden on the app to justify access; allow is smoother and leaves most users never changing defaults.", "Coarse default data vs precise on request: coarse data serves most needs and lowers harm from leaks; precise services need an extra step."],
    p: ["A new API added without a privacy review becomes a side channel that bypasses existing permission gates.", "Too many prompts teach users to approve everything, which negates the design."],
    v: "Audit every API that returns identifying or sensor data and confirm each is gated by a permission or visible indicator; run a test app with all permissions denied and list what personal data it can still obtain.",
    dep: ["runtime-permission-prompts", "storage-isolation", "privacy-indicators", "auto-reset-unused"]
  },
  "trust-boundaries": {
    s: "The system assumes every app, vendor component and network is potentially hostile, and places enforcement at defined boundaries with identity attached to every request.",
    d: "Boundaries exist between apps, between apps and the framework, between the framework and the kernel, between the kernel and vendor code, and between the main processor and secure hardware. Each enforces with a different mechanism: per-app identity, call-level caller checks, syscall filters, mandatory policy and hardware isolation. A flaw at one boundary should not give the rest. The design discipline is deciding at each service who the caller is and what they may do, and never relying on the caller's own claim.",
    k: ["Defense in depth with several independent layers vs one strong layer: several layers contain a single bug; they cost performance and complexity and each needs maintenance.", "Smaller privileged components vs large frameworks in one process: smaller components limit the effect of a bug; splitting adds calls, memory and startup time."],
    p: ["A service that trusts a caller-supplied package name instead of the kernel-supplied identity can be impersonated.", "A boundary that is added late, such as separating a media parser, requires reworking years of code."],
    v: "Attempt a privilege-escalation test suite from an unprivileged app, each targeting a separate boundary, and confirm each attempt is blocked at the intended layer with a log entry.",
    dep: ["per-app-identity", "mandatory-access-control", "syscall-filtering", "transactional-ipc", "secure-hardware-keys"]
  },
  "update-and-compatibility": {
    s: "The platform must change continuously for security and features while millions of apps and vendor drivers built for earlier versions keep working, or are deliberately broken on a schedule.",
    d: "Apps declare the platform version they target, and the framework preserves old behavior for them while applying new rules to updated ones. Security patches reach devices through system updates and component updates delivered separately from the full image. Vendor code is isolated by versioned contracts. Deprecations are announced, enforced by minimum target levels in the store, and finally by blocking installs. The balance is hard: keeping old behavior forever freezes progress, and breaking it loses apps.",
    k: ["Behavior gated by target version vs the same behavior for everyone: gating protects old apps while new apps get safer rules; the framework carries all compatibility paths forever.", "Modular components updated through the store vs only full system images: modular updates ship fixes in days; they widen the number of configurations to test."],
    p: ["Devices past their support window stay in use with unpatched vulnerabilities.", "A behavior change enforced for all apps at once breaks popular apps on the day of release."],
    v: "Run a corpus of old and new apps on the newest release and confirm old-targeted ones keep their legacy behavior while new-targeted ones show the new rules; confirm a component update installs without a full system update.",
    dep: ["app-manifest", "hal-contracts", "update-client", "store-client"]
  },
  "vendor-fragmentation": {
    s: "Thousands of device models differ in chips, screens, cameras, radios and vendor customizations, so the platform defines interfaces and tests rather than assuming hardware.",
    d: "Each device combines a system-on-chip, a panel, radios, sensors and vendor software, and ships on a chosen platform version at some patch level. Apps must run across all, so the platform specifies behavior with compatibility tests, feature flags that apps query and capability declarations. Vendors add features and skins, some of which change behavior such as aggressive background killing. The result is a range of memory size, performance, update support and bugs that has to be accepted in the architecture.",
    k: ["Compatibility test suite required for the brand vs freedom to modify: required tests keep apps portable; they limit what vendors can change and can be passed narrowly.", "Query capabilities at runtime vs assume features by version: capability queries handle devices with partial support; they require apps to handle every combination."],
    p: ["Vendor power-saving code that kills apps beyond the platform's rules breaks messaging only on that brand.", "A feature available on flagship devices and absent elsewhere leads to apps that crash on the missing hardware."],
    v: "Run the same app test suite on a matrix of low, mid and high devices from several vendors and compare failures by device; every failure should map to a documented capability difference or a filed defect.",
    dep: ["hal-contracts", "background-limits-policy", "app-manifest"]
  },
});
