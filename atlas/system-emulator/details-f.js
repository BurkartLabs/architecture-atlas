// Details for the system emulator plate, part 6: host platform layer and cross-cutting concerns.
ATLAS.details("system-emulator", {
  "host-window-display": {
    s: "Creates the window, manages full screen and refresh rate, and presents finished frames to the host display with correct size, aspect ratio and color.",
    d: "The layer opens a window or full-screen surface, creates the graphics context, and presents each frame with or without waiting for vertical sync. It handles resizing, display scaling on high-density screens, aspect ratio correction for non-square original pixels, multiple monitors, and color space conversion. It reports the display's refresh rate so frame pacing can adapt. The difficulty is variation between host systems in sync behavior, compositors, latency and mode switching, which gives the same emulator different smoothness on different machines.",
    k: ["Present with vertical sync versus immediate: sync prevents tearing and gives smooth motion, while immediate presentation lowers latency and may tear.", "Exclusive full screen versus borderless window: exclusive can reduce latency and set the refresh rate, while borderless switches smoothly and works with overlays."],
    p: ["The compositor adds a frame of delay that the emulator cannot see, and latency measurements disagree with what the code reports.", "A change of monitor mid-session leaves the emulator pacing to the old refresh rate."],
    v: "Display a moving test pattern at each supported mode and measure frame delivery times with an external capture or timestamp log, confirming no tearing under sync and the expected number of dropped frames.",
    dep: ["host-timing"]
  },
  "host-audio-backend": {
    s: "Opens the host's audio output device and supplies it with samples through a callback or a ring buffer, handling device changes and format differences.",
    d: "The backend negotiates a sample rate, channel layout and buffer size, then either pulls samples in a callback running on a high-priority audio thread or has the emulator push into a ring buffer. It reports the device's actual latency and buffer fill. It must survive devices being unplugged, sample rate changes and exclusive mode requests. The difficulty is the real-time constraint: the audio callback must never block or take long, and talking to the emulation thread requires lock-free structures and care to avoid underruns.",
    k: ["Pull callback versus push to a ring buffer: callback has the lowest latency and the strictest timing rules, while a ring buffer decouples threads with a bit more delay.", "Small buffer versus large: small buffers reduce delay but underrun on any scheduling hiccup, while large buffers are safe and lag."],
    p: ["The callback takes a lock held by the emulation thread, and audio crackles whenever a frame is slow.", "The device is unplugged and the backend keeps writing to a dead stream, so audio never returns."],
    v: "Play a continuous tone for an hour while loading the host with other work, and confirm the logged underrun count is zero or matches the induced load, and that switching output devices resumes sound within a second.",
    dep: ["host-threading"]
  },
  "host-input-backend": {
    s: "Reads keyboards, pads, mice, touch screens and motion sensors from the host, and delivers events or polled state to the emulator.",
    d: "The backend enumerates devices, reports connections and removals, and reads state through event queues or polling. Pads vary in layout, so a database of known devices translates reports into standard controls. Some hosts need windows to have focus to receive keys, and offer separate raw input paths with lower latency. Rumble and motion are exposed as extras. The difficulty is differences between host systems and the long tail of unusual devices, plus keeping input reading on a thread that is not blocked by slow frames.",
    k: ["Poll once per frame versus event callbacks: polling gives deterministic sampling points, while events minimize latency and need a queue to stay deterministic.", "Use a database of known pad layouts versus ask the user to map: a database works out of the box, while manual mapping covers any device and costs setup time."],
    p: ["A pad reports buttons in a layout not in the database, so the face buttons are swapped and nobody knows why.", "Focus changes while a key is held, and the release is never delivered, so the button sticks."],
    v: "Press every control on several pad models and a keyboard, log the events with timestamps, and confirm every press and release arrives once, in order, with latency under the target, including after a focus change.",
    dep: ["host-threading"]
  },
  "host-threading": {
    s: "Provides threads, locks, queues and priorities across host systems, and defines how the emulator's parts hand work and data to each other safely.",
    d: "The emulator uses threads for the core, rendering, audio, disk access and the user interface. This layer wraps host thread creation, priority and affinity, and provides primitives such as mutexes, condition variables, atomic operations and lock-free queues. It defines which thread may touch emulated state. Real-time threads, like audio, must avoid blocking. The difficulty is that races are rare and host-dependent: a bug that appears once in a thousand runs on one machine is common on another, and differing memory ordering across host processors hides defects.",
    k: ["One owner thread for machine state versus shared state with locks: single ownership avoids races and is easier to make deterministic, while locks allow parallel access at the price of contention and bugs.", "Lock-free queues between threads versus locked queues: lock-free never blocks the audio or core threads but is hard to get right, while locks are simple and risk priority inversion."],
    p: ["A data race passes every test on a strongly ordered host and corrupts state on a weakly ordered one.", "A low-priority thread holds a lock needed by the audio thread, and sound stutters."],
    v: "Run the stress test suite under a race detector and with randomized scheduling for a day on hosts with different memory ordering, and confirm zero reports and identical output hashes in every run.",
    dep: []
  },
  "executable-memory": {
    s: "Allocates, protects and flushes memory that holds generated host code, following each host system's rules for making data executable.",
    d: "Translated code is written into memory as data and then run as code. Hosts differ on how: some require toggling a region between writable and executable, some forbid writable executable pages, and some require explicit instruction cache flushes after writing. The layer reserves an arena, hands out space to the translator, applies protection changes in the correct order, and releases it when the cache is flushed. The difficulty is these rules vary and are enforced by security features, and some hosts forbid generating code at all, forcing an interpreter.",
    k: ["Map the same memory twice, writable and executable, versus toggle protection: dual mapping avoids toggling costs and races, but uses address space and is unsupported on some hosts.", "Fall back to interpreter when code generation is forbidden versus fail: the fallback keeps working at a lower speed, while failing is honest but locks out the platform."],
    p: ["The instruction cache is not flushed after writing code on a host that needs it, and the processor runs stale bytes.", "Protection toggles from two threads race and one thread executes a page while it is writable."],
    v: "Generate, run and replace code blocks repeatedly across threads on each supported host, with the cache flush path enabled, and confirm zero crashes and identical outputs over a million block replacements.",
    dep: ["host-threading"]
  },
  "host-timing": {
    s: "Provides a monotonic high-resolution clock and precise sleeping, which frame pacing and throttling use to hold the machine at the right speed.",
    d: "The layer exposes a clock that never goes backwards, with resolution of microseconds or better, and ways to wait until a time. Hosts' sleep functions wake late by up to several milliseconds, so waiting is a mix of sleeping for most of the interval and spinning for the remainder, or using timers synced to vertical sync. It also reads counters that can differ across cores. The difficulty is that scheduling jitter on a busy host makes any single frame time unreliable, and the cost of spinning burns power.",
    k: ["Sleep then spin for precision versus sleep only: sleep then spin hits times within microseconds but uses processor time and power, while sleep only is efficient and coarse.", "Use the display's sync signal as the timer versus a software timer: display sync gives smooth presentation, while a software timer works without a display and drifts against it."],
    p: ["A sleep that wakes late by several milliseconds drops a frame at random intervals.", "Processor frequency changes alter the timing of a spin loop calibrated at startup."],
    v: "Log requested versus actual wake times for ten thousand frame waits under load, and confirm the median error is under a millisecond and the worst case stays within the pacing tolerance.",
    dep: []
  },
  "host-storage": {
    s: "Reads and writes the host files the emulator needs, such as images, firmware, saves, caches and settings, in the right folders and with safe write behavior.",
    d: "The layer finds user data and cache directories per host convention, reads large images with buffering or memory mapping, handles paths and encodings, and writes saves atomically by writing a temporary file and renaming it. It deals with read-only locations, removable media and files being changed by other programs. Archives are opened in place with random access. The difficulty is portability of paths, case sensitivity and permissions, and avoiding corrupting a save file if the process dies during a write.",
    k: ["Atomic write by temporary file and rename versus in-place write: atomic write survives a crash with either old or new data, while in-place is simpler and can leave a half-written file.", "Memory-map large images versus read on demand: mapping is fast and simple, while explicit reads work for archives and network storage and need caching."],
    p: ["A crash during a save write leaves a truncated file, and the next start loses all progress.", "A path with non-ASCII characters works on one host and fails to open on another."],
    v: "Kill the process at random moments during repeated save writes and confirm the save file is always either the complete old version or the complete new version, and open a file under a path with unusual characters on each host.",
    dep: []
  },
  "accuracy-versus-speed": {
    s: "The standing decision about how much of the original hardware's behavior to reproduce, which determines both which software runs correctly and how fast a host must be.",
    d: "Every component has a range of fidelity, from approximate behavior that runs most software to exact reproduction of every cycle and bus access. Higher fidelity costs host time, often by a large factor, and is needed only by a small part of the library. Projects choose a default, offer switchable levels, and sometimes provide different cores. The decision reaches into scheduling, memory, graphics and audio simultaneously. The difficulty is that fidelity is not additive: raising one component's accuracy yields nothing if another still approximates the thing software measures.",
    k: ["Accuracy as the default versus speed as the default: accurate defaults run everything but need a fast host, while fast defaults suit weak devices and break a few titles.", "Per-title accuracy settings versus one global level: per-title settings spend effort where needed, but make results harder to compare and test."],
    p: ["A speed shortcut passes the test suite because no test covers it, and breaks a title months later.", "The accurate and fast cores diverge in behavior and bug fixes land in only one of them."],
    v: "Run the same test corpus at every accuracy level on a reference host, and publish the pass count and speed for each, confirming the pass count rises with accuracy and the speed cost is within the documented range.",
    dep: ["cycle-accuracy-model", "component-synchronization", "interpreter", "block-translator"]
  },
  "determinism": {
    s: "The property that the same starting state and the same inputs always produce the same output, on every host, which recordings, rewind, tests and netplay all rely on.",
    d: "Determinism needs every source of variation eliminated or controlled: host time, uninitialized memory, thread scheduling, floating point differences, hash table iteration order and random numbers. All randomness is seeded from emulated state, and all clocks derive from the master clock. It must hold across hosts and builds to make shared recordings possible. The difficulty is that it is easy to break by accident: one read of the host clock or one uninitialized variable, and replays drift after minutes, in ways that are very hard to trace.",
    k: ["Strict determinism across hosts versus only within one host: across hosts supports shared recordings and netplay, but forbids host floating point and some optimizations.", "Detect divergence with checksums continuously versus trust the design: continuous checks catch accidents early at a small cost, while trust finds them only when a replay fails."],
    p: ["A variable left uninitialized happens to be zero on one host and not on another, and runs differ.", "A new feature reads the host clock for a convenience and quietly ends cross-host replays."],
    v: "Run the same recording on every supported host and build configuration and confirm identical state hashes at every checkpoint frame for the whole run, and fail the build if any differ.",
    dep: ["master-clock", "power-and-reset", "real-time-clock", "floating-point-and-vector", "state-serialization"]
  },
  "hle-versus-lle": {
    s: "The choice between running the original code and hardware logic faithfully, low-level, and replacing it with equivalent emulator code that does the same job faster, high-level.",
    d: "Low-level emulation runs the real firmware, microcode or chip behavior, and is exact for anything the original did, including software the authors never saw. High-level emulation recognizes what the guest asks for and does it natively, avoiding the cost and needing no original files. It is faster and sometimes easier, but each title must hit paths that were implemented and tested. Many emulators mix both and let people choose per component. The difficulty is knowing which behavior titles depend on, which is only learned by running them.",
    k: ["High-level replacement versus faithful low-level execution: high level is fast and needs no original code, while low level is exact and needs original files and more time.", "Choose per component versus one global mode: per component can use high level only where it is proven, but multiplies the configurations to test."],
    p: ["A high-level routine covers common cases and silently does the wrong thing for one title that uses the rest.", "The low-level path works but needs firmware the person does not have, and the high-level fallback is less tested."],
    v: "Run the same title set with each component in high-level and low-level mode, compare output frames and audio, and confirm every difference is listed with a known cause in the compatibility notes.",
    dep: ["hle-kernel-calls", "hle-system-services", "firmware-loader", "dsp-emulation", "coprocessors"]
  },
  "threading-model": {
    s: "The decision about which parts of the machine run on which host threads, and how shared state is handed over, which shapes speed, determinism and the difficulty of every bug.",
    d: "Options range from one thread running everything in order, through separate threads for rendering and audio fed by queues, to separate threads for emulated processors. Machine state is owned by one thread, and other threads receive copies, commands or snapshots at defined points. Where threads touch emulated timing, synchronization must be at emulated-time boundaries so results do not depend on host scheduling. The difficulty is that every additional thread adds possible nondeterminism, and the speed gains are often smaller than expected because the work is chained.",
    k: ["Single emulation thread with worker threads for output versus multithreaded emulation: single thread is deterministic and easy to debug, while multithreading scales across cores and is hard to keep repeatable.", "Synchronize at emulated-time boundaries versus free-running: boundaries repeat exactly, while free-running is fastest and cannot be replayed."],
    p: ["A rendering thread reads machine state mid-update and shows a torn frame.", "A new thread is added to speed up one title, and replays of every title start to differ."],
    v: "Run the corpus with one, two and eight worker threads, and confirm identical output hashes for every title and a measured speedup that matches the profile, with a race detector reporting nothing.",
    dep: ["threaded-components", "host-threading", "gpu-command-processor", "audio-sync"]
  },
  "state-compatibility": {
    s: "The policy for how long saved states, recordings and save files from older versions keep working, and what is done when behavior changes underneath them.",
    d: "Fixing an emulation bug changes behavior, so a recording made before the fix may play out differently after it, and a saved state may hold values whose meaning changed. Projects decide what to guarantee: states across versions, recordings across versions, save files forever. They tag everything with versions and settings, keep migration code for the formats they promise, and give clear errors for the rest. The difficulty is that accuracy improvements and compatibility conflict: the better the emulator becomes, the less it can promise about old recordings.",
    k: ["Guarantee old recordings keep working versus allow fixes to change behavior: a guarantee preserves history such as verified runs but freezes bugs, while allowing fixes improves accuracy and orphans recordings.", "Stamp recordings with the emulator version and run old versions for them versus migrate: stamping is faithful and storage-heavy, while migration is convenient and limited."],
    p: ["A fix changes timing by one cycle, and every recorded speedrun desyncs without warning.", "A state loads under a newer build and silently continues in a subtly wrong machine."],
    v: "Keep a library of states and recordings from each past release, replay each under the current build, and confirm each one either reproduces its recorded output or is rejected with a message naming the version incompatibility.",
    dep: ["state-versioning", "state-serialization", "input-recording", "battery-saves"]
  },
  "host-variance": {
    s: "The set of differences between host systems, in processors, math, memory ordering, graphics drivers and timing, that the emulator must hide so the guest sees the same machine everywhere.",
    d: "Hosts differ in floating point details, memory ordering, page sizes, instruction cache rules, graphics driver rounding and bugs, audio latency, input devices and timer resolution. The emulator isolates these behind the host layer, uses software implementations where exactness matters, and tests on several hosts. Anything that reaches the guest, such as floating point results or timing, must be identical, while anything only reaching output, such as presentation, may differ. The difficulty is finding the leak: variance enters through small, unexpected channels.",
    k: ["Software implementation of sensitive operations versus host operations: software is identical everywhere and slower, while host operations are fast and differ between machines.", "Test on a matrix of hosts versus one reference host: a matrix finds variance but costs infrastructure, while one host is cheap and hides cross-host bugs."],
    p: ["A graphics driver update changes rounding, and reference images made on another machine no longer match.", "A weakly ordered host exposes a missing memory barrier that the development machine never showed."],
    v: "Run the determinism corpus and the render comparison on every supported host and driver in the test matrix, and confirm identical machine-state hashes and rendered outputs within the stated tolerance.",
    dep: ["floating-point-and-vector", "host-api-translation", "host-threading", "executable-memory", "host-timing"]
  }
});
