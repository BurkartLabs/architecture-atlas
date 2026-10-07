// Details for the window system & compositor plate, part 5: outputs, input devices, foundation and cross-cutting concerns.
ATLAS.details("window-compositor", {
  "mode-setting": {
    s: "Choosing and programming the resolution, refresh rate, color depth and timing of each output, and changing them without leaving the screen in an unusable state.",
    d: "A mode is a set of timings the display controller generates. The compositor picks from the modes the monitor advertises, usually its preferred native mode, or a user's choice, then submits it through an atomic commit. Changing modes can blank the screen, so the compositor avoids it when possible, for example by keeping the mode through a login handoff. Limits come from link bandwidth, since high resolution, high refresh rate and deep color may not fit in one cable together. Custom timings are sometimes needed. It is hard because an unsupported mode may blank the monitor with no way back.",
    k: ["Always the native mode versus user-selectable modes: native gives the sharpest image, but lower modes help weak GPUs and old content.", "Test-then-apply with automatic revert versus apply immediately: revert protects against an unusable choice, but needs a timer and state for the previous mode."],
    p: ["A mode that the monitor rejects blanks the display and there is no revert, so the user cannot see to fix it.", "Link bandwidth limits silently reduce color depth after a resolution change, causing banding."],
    v: "Select each advertised mode in turn and confirm the output stays active with the expected size. Choose a deliberately unsupported mode and confirm the automatic revert restores the previous one.",
    dep: ["atomic-commit", "edid-parsing", "kernel-display-interface"]
  },
  "connector-probing": {
    s: "Detecting which monitors are connected to which ports, learning when cables are plugged or removed, and reacting without disturbing the other outputs.",
    d: "The kernel reports connector status and sends a hotplug event when it changes. The compositor re-reads the status of every connector, fetches mode lists and identification data for new ones and removes the outputs of those that disappeared. Cable and dock quirks complicate this: monitors that report disconnected while asleep, short pulses on reconnect and spurious events from unstable cables. After detection the compositor must assign an available controller and bandwidth, which may fail if there are more monitors than controllers.",
    k: ["Reprobing on every event versus debouncing: immediate reprobe responds fast, but flapping cables cause repeated layout changes and window movement.", "Treating a disconnected output as gone versus keeping it in a remembered state: remembering lets windows return when the monitor does, but needs rules for how long."],
    p: ["A monitor entering standby reports disconnect, and all windows are moved to the remaining screen.", "More displays than controllers are connected and one stays dark with no explanation."],
    v: "Unplug and replug a monitor repeatedly and put it to sleep; confirm layout changes happen only on real removal, windows return to their places, and the user is told when a connected monitor cannot be driven.",
    dep: ["kernel-display-interface", "edid-parsing", "multi-monitor-config"]
  },
  "edid-parsing": {
    s: "Reading the monitor's identification block to learn its make, model, physical size, supported modes, color characteristics and HDR and variable refresh capabilities.",
    d: "Each monitor provides a small binary block, with extension blocks, describing itself over the cable. The compositor parses manufacturer, serial, native timings, the physical size in millimeters, the color primaries, the supported refresh range and the HDR and audio capabilities. This feeds default scale, color profile matching, variable refresh enablement and persistent settings, which are keyed by monitor identity. It is hard because the data is frequently wrong or missing, such as wrong sizes on televisions, duplicated serial numbers and docks that substitute their own block.",
    k: ["Trusting identification data versus allowing overrides: trusting gives good defaults automatically, overrides are needed because the data is often wrong.", "Identifying monitors by serial versus by port: serial follows the monitor between ports, port follows the position, and both fail in some setups."],
    p: ["Two identical monitors report the same identity, and settings for one are applied to the other.", "A malformed block crashes the parser, so the monitor can never be used."],
    v: "Feed a corpus of real and corrupted identification blocks to the parser and confirm none crash or hang, that fields match a reference decoder, and that absent fields produce documented defaults.",
    dep: ["connector-probing", "kernel-display-interface"]
  },
  "multi-monitor-config": {
    s: "Arranging and enabling several outputs: position, rotation, primary choice, mode and scale per monitor, presented to the user and to clients as one consistent configuration.",
    d: "The configuration is a set of per-output settings applied together. Applying it means testing the combination for bandwidth and controller limits, committing atomically, and then telling clients about the new layout in one batch. A management protocol lets settings tools query and propose changes, with the compositor accepting or rejecting the whole proposal. It is hard because outputs depend on each other: enabling one may require lowering another's mode, and clients see transient states unless changes are applied together.",
    k: ["Whole-configuration transactions versus per-output changes: transactions prevent invalid intermediate states, but reject an entire change for a single problem.", "Compositor-owned configuration versus separate settings daemon: compositor ownership guarantees coherence, a separate daemon allows richer policy but races with the compositor."],
    p: ["Clients see the layout in two steps and windows jump twice.", "A new configuration is applied and the preview fails, leaving no active output until reverted."],
    v: "Apply a proposed configuration changing three outputs at once; confirm one atomic change on screen, a single layout update to clients, and rejection with an explanation when the combination exceeds hardware limits.",
    dep: ["output-layout", "mode-setting", "atomic-commit", "display-profile-persistence"]
  },
  "mirroring-and-cloning": {
    s: "Showing the same content on more than one output, either by sharing one framebuffer across outputs or by drawing the scene separately for each.",
    d: "In true clone mode two outputs display one framebuffer with identical timing, which is cheap but requires matching resolutions. In software mirroring the compositor renders the same region for each output at its own mode and scale, with scaling and letterboxing when the aspect ratios differ. Mirroring is used for projectors and presentations. The clone group still appears as separate outputs in the layout but overlapping. It is hard to choose a common resolution, keep one monitor from blocking another's frame, and treat different color and refresh rates.",
    k: ["Hardware clone versus separate rendering: hardware clone is nearly free, while separate rendering handles different modes and scales at the cost of GPU work per output.", "Mirroring at the lowest common resolution versus each at native: lowest common is simple, but degrades the better monitor."],
    p: ["A slow projector at a lower refresh rate drags the faster laptop screen down to its rate.", "Different aspect ratios produce stretched content rather than letterboxing."],
    v: "Mirror a laptop panel to a projector at a different resolution and aspect; confirm both show the same content without stretching, and the laptop's refresh rate is unaffected.",
    dep: ["multi-monitor-config", "gpu-compositing", "output-layout"]
  },
  "display-profile-persistence": {
    s: "Remembering the settings used for each particular set of connected monitors, so plugging in a known dock or projector restores the arrangement automatically.",
    d: "The compositor or settings service stores configurations keyed by the set of monitors present, identified from their identification data. On a hotplug or login, it looks up the set and applies the stored configuration, or a default if none exists. Laptops need distinct profiles for lid open and closed, docked and undocked. Hard parts are keys for identical monitors, partial matches when only one of a known pair is connected, and migrating stored settings across software updates.",
    k: ["Keying by the full set of monitors versus remembering each monitor separately: full sets restore exact arrangements, per-monitor memory handles new combinations better but guesses positions.", "Applying stored settings automatically versus asking: automatic is seamless, but a stale profile can produce a surprising or unusable layout."],
    p: ["Two identical monitors swap positions after a reboot because their identity is the same.", "A stored profile references a mode the monitor no longer offers, and the output stays dark."],
    v: "Dock and undock a laptop three times with different monitor sets and confirm the correct stored arrangement returns each time, and that an invalid stored mode falls back to the preferred one.",
    dep: ["edid-parsing", "multi-monitor-config", "connector-probing"]
  },
  "output-leasing": {
    s: "Handing one display output, with its controller, to a client for exclusive use, for virtual reality headsets, so the client scans out directly with minimum latency.",
    d: "A headset must be shown at precise timing, with no compositor in between. The compositor can lease the connector and its controller and planes to a client through a descriptor, removing them from its own layout. The client uses the kernel display interface directly to flip buffers on it. When the lease ends, or the client dies, the compositor takes the output back. It is hard because the compositor must keep headsets out of the desktop layout, and recover cleanly from a client that holds the lease and then crashes.",
    k: ["Leasing hardware to a client versus compositing the headset like any monitor: leasing gives the lowest latency and precise timing, but removes it from compositor control.", "Automatically leasing non-desktop displays versus requiring a request: automatic is convenient, but a client could take an output the user wanted for the desktop."],
    p: ["A crashed client never returns the lease, and the headset stays dark until restart.", "A headset is treated as a normal monitor and windows appear on it."],
    v: "Lease a headset output to a test client, kill the client, and confirm the compositor reclaims the output and its resources. Confirm the headset never appears in the desktop layout.",
    dep: ["kernel-display-interface", "client-identity", "connector-probing"]
  },
  "device-discovery": {
    s: "Finding keyboards, mice, touch screens and other input devices at startup and as they are plugged in, and classifying what each can do.",
    d: "A device manager enumerates input devices and sends events as they appear or disappear. For each, the compositor reads its capabilities: keys, relative motion, absolute positions, touch, tablet axes, switches such as laptop lid. It then opens the device, attaches a configuration, such as acceleration settings, and informs the seat. Some devices appear as several logical ones, such as a keyboard with media keys, or a mouse with a built-in keyboard interface. It is hard to classify devices correctly and to handle those that disconnect while events are in flight.",
    k: ["Event-driven hotplug versus polling: events are immediate and cheap, but depend on a working device manager and can miss devices that appear before the compositor starts.", "Classifying by reported capabilities versus a database of known devices: capabilities work for new hardware, while a database fixes known misreporting devices."],
    p: ["A device reports false capabilities, so a keyboard is treated as a mouse and pointer movement stops.", "A device disappears while a key is held, and the key stays logically pressed."],
    v: "Hot-plug a keyboard, mouse, tablet and touch screen; confirm each appears in the seat's capabilities with correct type, works at once, and that unplugging while a key is held releases the key.",
    dep: ["device-access-broker", "seat-model", "key-state-tracking"]
  },
  "device-access-broker": {
    s: "The mechanism letting the compositor open input and display devices without running as an administrator, by asking a trusted session service to open them on its behalf.",
    d: "Device files are owned by privileged users. Rather than run the compositor as root, a session service holds the privilege, opens device files for the active session and passes descriptors to the compositor over a socket. When the session loses the foreground, such as a switch to another user, the service revokes access, so inactive sessions cannot read input. On return, access is restored. This design confines privilege to a small component. Hard parts are revocation, which must stop a device in use, and ordering at login, suspend and session switch.",
    k: ["A privileged broker passing descriptors versus running the compositor as an administrator: a broker shrinks the attack surface, but adds a dependency and a protocol.", "Revoking access on session switch versus trusting the compositor to stop reading: revocation is enforced by the system, while trust relies on every compositor being correct."],
    p: ["After a session switch the compositor keeps reading from a revoked device and receives errors it does not handle.", "The broker is unavailable at boot and the compositor starts with no input at all."],
    v: "Switch to another user's session and confirm the first compositor's input devices stop delivering events and reads fail. Switch back and confirm devices resume with no restart.",
    dep: ["seat-session-manager", "kernel-display-interface", "security-and-isolation"]
  },
  "pointer-acceleration": {
    s: "Mapping raw mouse movement to pointer movement with speed-dependent curves, so slow motions are precise and fast flicks cross the screen.",
    d: "Raw counts are scaled by a function of their speed, from a flat profile (constant ratio) to an adaptive one that increases gain with speed. Settings include sensitivity and the curve. Resolution differs between devices, so counts are normalized by the device's reported resolution and sometimes by display scale. Movement is carried as fractional values to avoid losing small motions, and the result is applied to the pointer position. It is hard to get a curve that feels consistent across devices and polling rates, and games need raw, unaccelerated motion.",
    k: ["Adaptive curve versus flat profile: adaptive helps most users reach across screens quickly, while flat gives muscle-memory consistency, such as for games and drawing.", "Normalizing by device resolution versus raw counts: normalized feels the same on all mice, but depends on accurate resolution data from the device."],
    p: ["A high-polling-rate mouse feels faster because the curve operates per event rather than per time unit.", "Fractional movement is discarded, so slow motion gets stuck in dead zones."],
    v: "Move a robotic or scripted mouse at fixed physical speeds and record pointer displacement; confirm it matches the configured curve and that two devices with different resolutions give the same pointer travel.",
    dep: ["device-discovery", "input-event-routing", "pointer-grabs-and-confinement"]
  },
  "touchpad-processing": {
    s: "Interpreting touchpad contacts as pointer motion, scrolling, clicks, taps and multi-finger gestures, with smoothing, thresholds and acceleration tuned to the hardware.",
    d: "A touchpad reports several contact points with positions and pressure. Software tracks each finger, classifies the number of fingers, and decides: one finger moves the pointer, two scroll, taps become clicks within a time window, and a held click begins a drag. Scrolling continues with momentum after lift-off. Physical clicks may be reported as areas. Hard parts are false positives from resting palms, jumpy noisy data and distinguishing a tap from the start of a movement within a few milliseconds.",
    k: ["Tap-to-click enabled versus disabled by default: enabled is faster for many users, but causes accidental clicks while typing.", "Two-finger scrolling versus edge scrolling: two-finger works on any pad and is natural, edge needs precise placement but suits very small pads."],
    p: ["A palm brushing the pad while typing moves the pointer and clicks into another field.", "Noise near a resting finger makes the pointer jitter when the user is trying to hold still."],
    v: "Type for ten minutes with a resting palm on a touchpad and confirm no stray pointer moves or clicks. Perform taps, two-finger scrolls and drags with a robot finger and confirm each gesture is classified correctly.",
    dep: ["device-discovery", "palm-rejection", "pointer-acceleration", "gesture-recognition"]
  },
  "palm-rejection": {
    s: "Ignoring unintended contacts, such as a palm or thumb resting on a touchpad or touch screen, using contact size, position, pressure and whether the keyboard or pen is in use.",
    d: "Rules combine several cues: an oversized contact is a palm, a contact in an edge zone starting outside the center is likely a palm, contacts while typing are suppressed for a short time after the last key, and a pen in proximity disables touch altogether. Once a contact is classified as a palm, it stays one for its life, even if it moves into the center. It must be tuned per device, because hardware reports different sizes. The difficulty is that errors both ways are costly: a missed palm gives wrong clicks, and rejecting a real finger makes the device seem broken.",
    k: ["Suppressing touch while typing versus always accepting it: suppressing prevents accidental input, but briefly blocks legitimate quick pointer movement after typing.", "Disabling touch when the pen is near versus supporting both: disabling is reliable for drawing, while supporting both enables mixed touch and pen but needs better classification."],
    p: ["A hand resting on a tablet while drawing is read as touch input and creates stray strokes.", "A legitimate fast tap just after typing is ignored, and users think the click did not register."],
    v: "Draw with a pen with the hand resting on a touch screen and confirm no touch events reach the application. Tap just after typing and confirm that the tap is accepted after the suppression window.",
    dep: ["touchpad-processing", "tablet-handling", "device-discovery"]
  },
  "key-state-tracking": {
    s: "Maintaining which keys and modifiers are held down, generating repeat events at the configured rate, and releasing everything correctly on focus change or device loss.",
    d: "The compositor records each key's pressed state and updates the modifier state via the keymap. Auto-repeat is generated by the compositor or told to clients as a rate and delay, so that clients can repeat in their own timing. When focus changes, the new client receives the list of currently held keys. If a device disappears, its keys are released. This state is shared with shortcuts, input injection and accessibility features such as sticky keys, which change the effective modifier state. Hard parts are consistency across all of these.",
    k: ["Repeat generated by the compositor versus by clients: compositor repeat is uniform and works for all programs, while client repeat keeps rate under their control and lets games disable it.", "Sending held keys on focus change versus starting clean: sending them keeps modifiers correct for the new window, but may trigger unexpected actions."],
    p: ["A key release is missed because focus moved, and the key repeats forever in the new window.", "Sticky keys and a virtual keyboard disagree on modifier state, so shortcuts misfire."],
    v: "Hold a key and switch windows, unplug the keyboard, and toggle sticky keys; confirm in each case that repeats stop, modifier state resets correctly and no client sees an unbalanced press or release.",
    dep: ["keyboard-layout-engine", "device-discovery", "seat-model"]
  },
  "kernel-display-interface": {
    s: "The kernel's interface to display hardware: controllers, planes, connectors, memory buffers and atomic state, through which the compositor owns the screen.",
    d: "The compositor opens a display device and becomes its master, meaning it alone may change modes and flip buffers. It queries resources (controllers, connectors, planes) and their properties, creates framebuffers from buffer handles, and submits atomic commits. It receives events for hotplug and page-flip completion. Only one process can hold master at a time, so switching sessions passes it between them. Hard parts are differences between drivers in supported properties, and failures that the interface reports only as a generic error.",
    k: ["Direct kernel interface versus a user-space abstraction layer: direct gives full control and the newest features, an abstraction hides driver differences but lags and restricts.", "Single master versus shared access: single master is simple and safe, but means handoff on every session switch and no co-operation with other users of the display."],
    p: ["A driver bug or unsupported property returns an unspecific error, and the compositor cannot tell what to change.", "Master is not dropped on exit, and the next session cannot start."],
    v: "Start two sessions and switch between them repeatedly; confirm master transfers cleanly each time, and run the compositor under an error-injecting driver and confirm each failure produces a logged, specific fallback.",
    dep: ["seat-session-manager", "sync-primitives"]
  },
  "gpu-memory-allocator": {
    s: "Allocating GPU-accessible buffers with the right layout, tiling and placement for rendering, sharing with clients and scanout, including constraints from several devices.",
    d: "Buffers for frames, cursors and capture must be usable by the renderer, possibly by a video encoder, and by the display controller. The allocator is given the intended uses and the formats and modifiers each device supports, and picks a layout that works for all, or fails. Memory placement, in video memory or system memory, depends on use. Allocation can be slow and fail under memory pressure, so buffers are pooled and reused. Hard parts are the intersection across devices that were not designed to share, and eviction when memory is full.",
    k: ["A shared allocator that negotiates across all consumers versus each device allocating its own: shared negotiation enables zero-copy paths, but requires every component to describe its constraints.", "Pooling buffers versus allocating per frame: pools avoid allocation stalls and fragmentation, but hold memory when idle."],
    p: ["Memory is exhausted by many windows and capture buffers, and allocation fails in the middle of a frame.", "A buffer that is valid for rendering is unusable for scanout, which is discovered only at commit."],
    v: "Allocate buffers for each combination of use flags on every GPU and display; confirm each is accepted by the intended consumers or reported as impossible at allocation time, not at first use.",
    dep: ["kernel-display-interface", "sync-primitives"]
  },
  "sync-primitives": {
    s: "The kernel's objects for ordering work between devices and processes, fences that signal when work completes and timelines that count progress, exported as descriptors.",
    d: "A fence is created by a driver for submitted GPU work and becomes signaled when the work finishes. It is exported as a file descriptor that can be polled in an event loop, passed to other processes and waited on by other devices, such as the display controller. Timeline objects extend this with monotonically increasing values, so one object tracks many points. Both avoid the CPU waiting on the GPU. Hard parts are fences that never signal, merging many into one, and importing them across drivers.",
    k: ["Fence descriptors in the event loop versus blocking waits: descriptors keep the compositor responsive and allow combined waits, while blocking is simple but freezes the loop on a slow GPU.", "Binary fences versus timeline points: timelines are compact and flexible, but need newer drivers and more complex state."],
    p: ["A fence from a hung GPU never signals, and everything waiting on it hangs.", "Leaked fence descriptors accumulate until the process reaches its limit and fails to open anything."],
    v: "Submit GPU work with a known duration and confirm the exported fence signals at completion and can be polled with other descriptors. Hang the work and confirm the compositor times out rather than waiting forever.",
    dep: ["kernel-display-interface"]
  },
  "compositor-event-loop": {
    s: "The single loop that waits on client sockets, input devices, timers, fences and display events, and dispatches each to its handler without blocking.",
    d: "The loop sleeps in a poll call over many descriptors and runs the handler of whichever is ready. Handlers must be short, because the loop serves every client and frames. Timers drive animation, idle timeouts and repeat. Work that might block, such as reading a large file or waiting for a client, is moved to threads or made asynchronous. Some designs run rendering in a separate thread to keep input responsive. The central difficulty is guaranteeing that no handler can stall everything.",
    k: ["A single-threaded loop versus several threads for input, rendering and clients: one thread avoids locks and ordering bugs, several isolate stalls but need careful sharing of state.", "Level-triggered versus edge-triggered readiness: level-triggered is more forgiving of partial reads, edge-triggered saves wakeups but loses events if a handler forgets to drain."],
    p: ["A handler does synchronous disk access, and the pointer freezes for half a second.", "Too many descriptors are polled each iteration, and wake-up cost grows with the number of clients."],
    v: "Inject a one-second delay into a client handler and confirm pointer motion and frame presentation continue at normal rate; record the longest loop iteration over a day of use and confirm it stays within the frame budget.",
    dep: ["sync-primitives", "kernel-display-interface"]
  },
  "seat-session-manager": {
    s: "The system service that tracks which login session is active on a seat, grants it the display and input devices, and takes them away when another session becomes active.",
    d: "It starts a session on login, assigns it to a seat, and tells the compositor when it becomes active or inactive, for example on a virtual terminal switch or user change. It hands out device descriptors, as the broker, and provides power events such as suspend and lid close. The compositor must pause rendering and release devices when inactive, and restart output on return, potentially with different monitors. Hard parts are races at boot, and handling a compositor that does not respond to the pause request.",
    k: ["A system-wide session manager versus the compositor handling sessions itself: a manager enforces policy and works for every program, but is one more mandatory service.", "Compositor pauses on request versus forced revocation: cooperative pause is clean, forced revocation always works but can leave the compositor mid-operation."],
    p: ["The session switch arrives mid-frame, and the compositor submits to a revoked device and crashes.", "Suspend and resume change the monitors connected, and the compositor resumes with a stale layout."],
    v: "Switch sessions and suspend and resume the machine with a monitor change in between; confirm the compositor pauses, resumes with the actual new set of outputs, and the first frame after resume is correct.",
    dep: ["kernel-display-interface", "device-access-broker"]
  },
  "client-crash-isolation": {
    s: "Making sure a failing application affects only its own windows: the compositor cleans up everything the client owned and carries on without losing other clients or the session.",
    d: "When a connection closes, the compositor destroys its objects, removes its windows, releases buffers, drops grabs and focus, ends selections and clears any exclusive claims. Each client's resources are accounted separately so cleanup is complete. Protocol errors disconnect only the offending client. A frozen client is handled differently from a dead one, with a timeout and an unresponsive indicator. Hard parts are the shared resources that a dying client leaves in an inconsistent state, such as a grab or a half-finished drag.",
    k: ["Disconnecting on any protocol error versus tolerating errors: disconnect is safe and simple, but kills programs over harmless mistakes.", "Keeping a dead window's last frame briefly versus removing at once: keeping gives a smooth visual transition, but can mislead users into thinking it is alive."],
    p: ["A crashed client held the pointer grab, and the desktop stops responding to clicks.", "Leftover surfaces of a dead client stay visible because cleanup missed a subsurface."],
    v: "Kill clients holding every kind of resource: grab, selection, drag, layer surface and lock; confirm each is released immediately and the remaining clients and input continue to work.",
    dep: ["connection-handling", "pointer-grabs-and-confinement", "clipboard-and-selections", "scene-graph"]
  },
  "compositor-restart": {
    s: "Surviving the failure of the compositor itself, either by restarting it while keeping client applications alive, or by cleanly ending and restoring the session.",
    d: "Because the compositor owns the connection to every client, its death normally disconnects them all and loses unsaved work. Recovery strategies include a supervisor that restarts it quickly, state held outside the compositor so windows can be restored, and protocols that let clients reconnect. In practice most designs end the session, so the most valuable defense is to keep the compositor small and let shell components and extensions live in other processes. A hard design problem is what state belongs to the display server and what to the clients.",
    k: ["Keeping clients alive across a restart versus ending the session: surviving preserves work but requires clients that can reconnect and state kept elsewhere, ending is simple.", "Plugins in the compositor versus separate processes: in-process is fast and flexible, but their bugs become compositor crashes that end the session."],
    p: ["A bug in a loaded extension crashes the compositor and every open document is lost.", "A restarted compositor repeats the crash on the same input and loops forever."],
    v: "Kill the compositor under load and measure what survives: confirm either clients reconnect and windows return, or the session ends with a visible recovery screen and a crash report, and that a crash loop is detected and stopped.",
    dep: ["client-crash-isolation", "seat-session-manager", "shell-extension-api"]
  },
  "gpu-reset-recovery": {
    s: "Detecting that the GPU hung or was reset by the kernel, and rebuilding the compositor's rendering state, textures and buffers without ending the session.",
    d: "After a reset, all GPU contexts and the memory held in them are lost. The compositor learns of this through a status query or an error from a command submission. It must discard its context, create a new one, and re-import every client buffer. Client buffers owned by their own contexts may be lost as well, so clients must also recover. During the gap it can fall back to the software renderer or show the last image. Hard parts are detecting resets promptly, since submissions after one fail in confusing ways, and avoiding a loop when the same content causes the hang again.",
    k: ["Recreating the context and continuing versus restarting the compositor: recreating keeps the session, but requires every GPU resource to be rebuildable.", "Falling back to software during recovery versus freezing: software keeps the desktop responsive, but is slow at high resolutions."],
    p: ["A reset is detected late, and the compositor keeps submitting work that fails, flooding the log.", "A client buffer lost in the reset shows garbage until the client redraws it."],
    v: "Trigger a GPU reset with a deliberately hanging workload; confirm the compositor recovers within seconds, windows reappear, no crash occurs, and a client that caused the hang is disabled instead of repeating it.",
    dep: ["render-backend", "software-renderer", "texture-import-cache", "hang-detection"]
  },
  "hang-detection": {
    s: "Noticing that a client, a GPU job or the compositor itself has stopped responding, by watchdog timers and ping requests, and applying a defined remedy.",
    d: "For clients, the compositor sends periodic pings and expects a reply. A missing reply marks the window unresponsive, which the shell shows and offers to close. For GPU work, a timeout on fences detects a stuck job. For itself, a watchdog thread or a supervisor process expects a heartbeat from the main loop and kills and restarts it on silence. Choosing timeouts is hard: too short blames a client that is only busy, too long leaves the user waiting. Pings themselves must not wake sleeping clients too often.",
    k: ["Ping-based detection versus watching for commit activity: ping is accurate about the event loop, but costs wakeups, while commit activity is free but cannot tell idle from stuck.", "Automatic termination versus asking the user: automatic recovery avoids a frozen desktop, but kills work that was only slow."],
    p: ["A compositor watchdog fires during a long but legitimate operation and restarts the session.", "A client busy in a long computation is marked frozen and the user kills it, losing results."],
    v: "Stop a client with a signal and a GPU job with an infinite loop; confirm the client is flagged unresponsive within the configured time, the job is cancelled, and a briefly busy client is not flagged.",
    dep: ["connection-handling", "sync-primitives", "compositor-event-loop"]
  },
  "diagnostics-and-tracing": {
    s: "Logging, counters, frame-time traces and debug overlays that show what the compositor is doing: where frames went, which path each surface took and why a fallback happened.",
    d: "The compositor records per-frame timing for each stage, counts of missed frames and fallbacks, and the reason a surface was not put on a plane or scanned out. Traces can be written to a file in a standard format for external viewers, and live overlays show frame times and damage rectangles. A protocol debugging mode logs every message with its object. Overhead matters, so detailed tracing is off by default. Hard parts are correlating events across the client, the compositor, the GPU and the display, whose clocks differ.",
    k: ["Always-on lightweight counters versus on-demand detailed tracing: counters cost almost nothing and catch regressions, while detailed traces answer specific questions but disturb timing.", "Logging full protocol traffic versus summaries: full logs reproduce bugs but may contain sensitive text typed by the user."],
    p: ["Debug logs contain clipboard text and typed content, and are attached to a public bug report.", "Tracing adds enough overhead to hide the timing bug being investigated."],
    v: "Reproduce a known missed frame and confirm the trace names the stage, the surface and the reason, such as a plane rejection, that caused it, and that disabling tracing returns frame times to baseline.",
    dep: ["frame-scheduler", "presentation-feedback", "overlay-planes", "wire-protocol"]
  },
  "security-and-isolation": {
    s: "Cross-cutting: the display server sees every pixel and every key press, so the decision of what each client may see, send and control shapes every protocol and every component.",
    d: "A design that lets any client read other windows' pixels, inject input or grab the keyboard cannot isolate applications, whatever the sandbox does elsewhere. The compositor enforces that clients see only their own surfaces, receive input only when focused, request sensitive actions with a valid serial, and use privileged interfaces only when identified and approved. Capture, injection, global shortcuts and clipboard access are all brokered. The hard trade-off is that useful tools need exactly these capabilities, so each exception needs a permission path rather than a gap.",
    k: ["Isolation by default with brokered exceptions versus open access with trust: default isolation limits damage from any client, but tools such as recorders and automation need new mechanisms.", "Enforcing in the compositor versus in a separate policy service: in the compositor is fast and unavoidable, a policy service allows richer rules but must be consulted consistently."],
    p: ["A single privileged interface left open to every client defeats isolation for the whole desktop.", "Permissions granted once are remembered forever and used by a later compromised program."],
    v: "Run an unprivileged test client that attempts to read other windows, capture the screen, log keys, inject input and steal focus; confirm each attempt is refused and logged, with no data leaked.",
    dep: ["client-identity", "input-event-routing", "capture-permission-broker"]
  },
  "latency-budget": {
    s: "Cross-cutting: the time from an input to its visible effect is a sum across stages, and the display server must spend a fixed share on each without any one stage owning the total.",
    d: "At 60 hertz a frame is about 16 milliseconds, and an interaction crosses device sampling, input processing, client drawing, waiting for composition, composition, flipping at vblank and the panel's response. Choices such as late composition, hardware cursors, direct scanout and tearing flips each remove a stage or part of one. The budget decides how much effect work, such as blur, is affordable, and how much jitter buffering a stage may add. Without end-to-end measurement, each stage believes it is fast while the user feels lag.",
    k: ["Spending the budget on smoothness versus on lowest latency: buffering hides jitter, but adds a frame of delay for every interaction.", "A uniform policy versus per-surface policy: uniform is simple to reason about, while per-surface lets games take the low-latency path without costing the rest of the desktop."],
    p: ["Every stage adds one frame of buffering for safety, and the total delay reaches several frames unnoticed.", "Latency is measured only inside the compositor, which hides time spent in the client and panel."],
    v: "Measure input to photon with an external sensor under idle and loaded conditions; confirm the median and the worst case stay within the documented budget, and that each stage's contribution sums to the total.",
    dep: ["frame-scheduler", "direct-scanout", "cursor-surfaces", "latency-control"]
  },
  "process-and-thread-model": {
    s: "Cross-cutting: which work runs in which process and thread, what holds hardware privilege, and what is isolated so that a stall or crash in one part does not freeze or kill the rest.",
    d: "The compositor owns the display and input, so it is both the most privileged and the most critical process. Moving the shell, panels, input methods, lock screen and portals into other processes shrinks what can crash it, but each separation needs a protocol and introduces ordering races. Inside the compositor, one loop for clients and input is easiest to reason about, while a separate rendering thread protects input responsiveness from a slow GPU. The choices decide who can block whom, and how recovery works.",
    k: ["Fewer, larger processes versus many small ones: fewer is faster and simpler to coordinate, while many isolates faults and privilege at the cost of protocols and latency.", "Rendering on the main loop versus its own thread: a thread keeps input smooth under GPU load, but needs synchronization of scene state."],
    p: ["A single slow extension runs on the main loop and blocks input for every application.", "Splitting a function into two processes creates a race on focus that only appears under load."],
    v: "Inject a one-second stall into each component in turn and observe the blast radius: confirm which components freeze, which continue, and that the observed domains match the documented design.",
    dep: ["compositor-event-loop", "shell-extension-api", "compositor-restart"]
  },
  "protocol-evolution": {
    s: "Cross-cutting: the client protocol outlives any single compositor and toolkit, so how interfaces are versioned, staged and retired decides what keeps working and how fast the platform can change.",
    d: "A released interface cannot be fixed without breaking clients, so new features arrive as new interfaces or higher versions, and old ones are kept for a long time. Staging marks experimental interfaces as unstable. Compositors differ in what they implement, so clients must test for capabilities at runtime. Machine-readable definitions generate code on both sides and allow compatibility checks. The trade-off is between getting the interface right before release, which slows adoption, and releasing early and carrying mistakes forever.",
    k: ["Slow, consensus-driven stabilization versus fast experimental release: slow produces cleaner interfaces, but leaves clients to build their own workarounds in the meantime.", "Keeping old versions forever versus a deprecation schedule: forever protects old clients, but multiplies the code to test."],
    p: ["An interface stabilizes with a flaw and every compositor must support it indefinitely.", "Clients assume capabilities that one popular compositor offers, and break on others."],
    v: "Run a collection of historical clients against the current compositor and confirm each behaves as it did when released; run current clients against an older compositor and confirm graceful fallback.",
    dep: ["protocol-extensions", "global-registry", "wire-protocol"]
  },
  "hardware-variability": {
    s: "Cross-cutting: the same desktop must run on many GPUs, display controllers and monitors with different capabilities, so every optimization needs a tested fallback and every assumption about hardware is a bug candidate.",
    d: "Plane counts, supported formats and tiling, color pipeline stages, variable refresh ranges and fence behavior all differ by vendor and generation, and monitors misreport their own data. The compositor probes capabilities at runtime with test commits, and keeps slower portable paths for anything not probed successfully. A feature that works only on one hardware family tends to rot in tests. Virtual machines and remote sessions add further variants with no real display at all.",
    k: ["Probe and fall back at runtime versus a table of known hardware: probing adapts to new hardware, while a table fixes known bad cases but goes stale.", "One code path used everywhere versus specialized paths per hardware: one path is easy to test, specialization gets the best performance but multiplies test matrices."],
    p: ["An optimization is validated on one GPU family only and corrupts the screen on another.", "A fallback path is never run in testing and fails when finally needed."],
    v: "Run the same scripted session on a matrix of GPUs, monitors and a virtual machine with no GPU; confirm correct output on all, and that each fallback taken is logged with the capability that was missing.",
    dep: ["format-modifier-negotiation", "overlay-planes", "software-renderer", "edid-parsing"]
  },
  "failure-domains": {
    s: "Cross-cutting: which failures are contained to one client, one output, the GPU or the whole session, and what the user sees and loses in each case.",
    d: "A failure can occur in a client, an extension, the input stack, the GPU, a monitor link or the compositor. Each needs a defined outcome: close the client's windows, disable the extension, reset the context and redraw, or end the session. Placing risky code in separate processes, cleaning up per client, and detecting hangs with timeouts all enlarge the set of survivable failures. The aim is that the user's data and screen survive the common ones, and that rare ones fail loudly and visibly rather than freezing.",
    k: ["Containing each failure at the smallest domain versus ending the session for simplicity: containment preserves work, but requires cleanup code for every resource and path.", "Failing loudly versus masking: masking keeps things running but hides growing problems, while loud failures are noticed and fixed."],
    p: ["A cleanup path has never run before, and the first real failure leaves a stuck grab or a dark output.", "A silent fallback hides a repeated GPU reset until the whole machine becomes unstable."],
    v: "Run a fault-injection campaign that kills a client, an extension, the lock screen and the GPU context, and unplugs a monitor, and record for each the user-visible effect and recovery time against the documented outcome.",
    dep: ["client-crash-isolation", "gpu-reset-recovery", "compositor-restart", "hang-detection"]
  },
});
