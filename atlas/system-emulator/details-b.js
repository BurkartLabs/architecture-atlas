// Details for the system emulator plate, part 2: session services, netplay, scheduling.
ATLAS.details("system-emulator", {
  "state-serialization": {
    s: "Captures the complete state of the emulated machine, including registers, memory, device state and pending events, into a buffer that can later be restored exactly.",
    d: "Every component exposes a routine that writes and reads its state in a fixed order, often one routine used for both directions so they cannot drift apart. The result includes RAM, video memory, processor registers, device registers, internal counters, the scheduler's event queue and any hidden latches. Restoring must also rebuild derived data such as translated code or decoded tile caches. The difficulty is completeness: one forgotten variable, such as a half-finished DMA transfer, produces a state that loads and then misbehaves a few frames later.",
    k: ["One symmetric save and load routine per component versus separate routines: symmetric routines cannot disagree about layout, but are harder to write for fields that need conversion.", "Serialize derived caches versus rebuild them on load: rebuilding keeps states small and portable, but makes loading slower and must match the original exactly."],
    p: ["A newly added device counter is left out of serialization, and loads work until that counter matters.", "States saved during a pending event restore without the event, and a timer never fires."],
    v: "Run a title for one thousand frames, save, run one thousand more and hash the output, then restore and run again, and confirm the second hash is identical across video, audio and memory.",
    dep: ["event-scheduler", "memory-map", "determinism"]
  },
  "state-versioning": {
    s: "Tags every saved state with a format version and the settings it depends on, so older states can be upgraded, or refused with a clear message, as the emulator changes.",
    d: "A header records the format version, emulator build, hardware variant, title identity and the settings that alter behavior. Each component serializes into named, length-prefixed sections so unknown sections can be skipped and missing ones given defaults. Upgrades are small migration functions chained from old versions. The difficulty is that fixing an emulation bug often changes internal state meaning, so an old state restores into a machine whose invariants no longer hold, and no migration can recover information that was never stored.",
    k: ["Named sections with defaults versus a rigid binary layout: sections tolerate additions and removals, but cost space and need defaults that make sense for old data.", "Support old states forever versus break compatibility at major versions: supporting all keeps player progress, but accumulates migration code that is rarely tested."],
    p: ["A state from a previous build loads without error but contains a field whose meaning changed, and the machine runs off course.", "Settings that change behavior are missing from the header, so a state loads under incompatible settings."],
    v: "Keep a library of saved states from each past format version, load every one in the current build, and confirm each either resumes with matching output hashes or is rejected with a message naming the incompatibility.",
    dep: ["state-serialization", "settings-profiles", "state-compatibility"]
  },
  "rewind-buffer": {
    s: "Keeps a rolling history of recent machine states or input deltas so playback can run backwards and the person can return to a moment a few seconds ago.",
    d: "Every few frames the emulator captures state into a ring buffer sized in memory or seconds. Rewind restores the most recent entry and steps backward. To fit many seconds, snapshots are compressed, stored as differences from the previous snapshot, and sometimes combined with replaying recorded inputs forward from a keyframe. The difficulty is cost: serializing the whole machine each frame is expensive, and deltas of large memory regions are mostly unchanged bytes, so efficient diffing is essential to keep speed up.",
    k: ["Full snapshot every capture versus delta-compressed snapshots: full snapshots restore instantly, while deltas fit far more history but cost time to rebuild a state.", "Keyframes plus replay of inputs versus stored states only: replay uses little memory, but takes time to re-execute and needs exact determinism."],
    p: ["The buffer is sized for typical use and a memory-heavy title exhausts it in a second of history.", "Rewinding while audio plays produces a burst of clicks because the audio buffer is not reset to match the restored state."],
    v: "Play ten seconds, rewind five, and confirm the machine's memory hash equals the hash recorded at that earlier point, then play forward with the same inputs and confirm identical output.",
    dep: ["state-serialization", "audio-sync", "input-recording"]
  },
  "input-recording": {
    s: "Records the exact controller input for every frame, plus the starting state, so the run can be replayed identically, shared and used as a test.",
    d: "A recording stores the initial state or a power-on identity, the emulator configuration, and a frame-by-frame list of input values. Playback feeds them back at the same points in emulated time. Because the machine is deterministic, the output is identical. Recordings drive regression tests, speedrun verification, and netplay replays. The difficulty is determinism: anything that varies between runs, such as host timing, uninitialized memory or the real-time clock, breaks playback after seconds or minutes.",
    k: ["Record from power-on versus from a saved state: power-on is small and portable, but long runs are slow to re-verify, while a state anchor is fast but ties the file to a state format.", "Store per-frame input versus per-change input: per-frame is trivial to read and seek, per-change is smaller but needs sampling logic."],
    p: ["The real-time clock is read from the host, so the replay differs on a different day.", "Input is sampled at a different point in the frame when recording and playing back, shifting every action by a frame."],
    v: "Record two minutes of play, replay it on a different machine and on another day, and confirm the final frame hash and memory hash are identical to those from the original session.",
    dep: ["determinism", "input-mapping", "real-time-clock"]
  },
  "battery-saves": {
    s: "Persists the contents of the original machine's save memory or memory cards to host files, and loads them back at start, so in-game saves survive restarts.",
    d: "Original saves live in battery-backed RAM, flash or EEPROM chips inside cartridges, or in removable memory cards with their own file systems. The emulator maps this storage into the address space as the original chip did, including write protocols and erase timing for flash, and flushes it to disk on exit and periodically. Formats matter for importing saves made on real hardware. The difficulty is flushing safely: a crash before a flush loses progress, while flushing on every write wears disks and hurts frame time.",
    k: ["Flush on exit only versus periodically and on change: exit-only is cheap, but a crash loses the session, while periodic flush costs small background writes.", "Emulate the chip protocol versus expose a plain byte array: protocol emulation matches software that probes chips, but a byte array is simpler and enough for most titles."],
    p: ["Software detects the save chip type by timing a command sequence and fails to find a chip the emulator models too loosely.", "Two emulator instances write the same save file and one overwrites the other's progress."],
    v: "Save in game, close the emulator with a forced termination after the periodic flush interval, restart, and confirm the saved progress loads, then import a save file from real hardware and confirm it loads.",
    dep: ["storage-controller", "host-storage", "power-and-reset"]
  },
  "run-ahead": {
    s: "Reduces input latency by running the machine one or more frames ahead using the current input, then rolling back and showing only the predicted frame.",
    d: "Each real frame, the emulator saves state, runs the next frame or two with the latest input while discarding their audio and video, restores the saved state and runs again to present the final frame. The displayed picture then reflects input from a frame later than normal, cutting the latency the original game itself had built in. It requires fast state save and restore and fully deterministic emulation. The difficulty is cost, since each shown frame executes several times, and correctness of audio and device side effects during discarded frames.",
    k: ["Rollback by serialization versus by running a second instance: serialization uses one machine and little memory, while a second instance avoids restore cost but doubles memory and device state.", "Higher frame count versus lower: more frames remove more latency, but exceed the original's real response time and make titles feel wrong."],
    p: ["Audio produced during discarded frames leaks into the output and the sound stutters.", "Games that already respond within one frame appear to react before the button press, and the title behaves unnaturally."],
    v: "Measure input-to-display latency with a high-speed camera or an input-triggered flash test with run-ahead off and on, and confirm latency falls by the configured frames while output hashes remain identical for the same inputs.",
    dep: ["state-serialization", "determinism", "frame-pacing"]
  },
  "lockstep-netplay": {
    s: "Keeps two or more emulators in step by waiting for every player's input for each frame before any of them advances, sending only inputs over the network.",
    d: "Each machine runs the same deterministic emulator from the same starting state. Every frame, each peer sends its local input stamped with a frame number, and no peer advances until it holds all inputs for that frame. To hide latency, inputs are applied a few frames after being pressed, an input delay chosen from network round-trip time. The difficulty is that one slow peer stalls everyone, and that any non-determinism between hosts silently desynchronizes the machines.",
    k: ["Fixed input delay versus adaptive delay: fixed delay gives consistent feel, while adaptive delay tracks the network but changes timing mid-game and complicates replays.", "Peer to peer versus relay server: peer to peer has lower latency, while a relay handles firewalls and gives one place to measure, at the cost of extra delay."],
    p: ["A single dropped packet stalls all players until retransmission, and the game freezes visibly.", "A peer with slightly different host floating point behavior drifts, and the desync appears minutes later."],
    v: "Run two instances on separate hosts for thirty minutes with injected packet delay and loss, and confirm frame hashes exchanged every second always match and no instance advances without the other's input.",
    dep: ["determinism", "input-mapping", "session-setup", "desync-detection"]
  },
  "rollback-netplay": {
    s: "Runs each machine ahead using a guess for remote input and rewinds to re-simulate when the real input arrives and differs, hiding network delay from the player.",
    d: "Each peer applies its own input immediately and predicts the others, usually by repeating their last input. It saves state every frame. When a remote input arrives that differs from the prediction, the peer restores the state from that frame and re-executes forward with correct inputs, within a single display frame. The result feels local up to the rollback limit. The difficulty is speed: re-running many frames needs a very fast machine core, fast state save and restore, and audio and effects that tolerate repeated frames.",
    k: ["Rollback with prediction versus lockstep with delay: rollback feels responsive but needs fast restore and can show corrections, while lockstep never corrects but adds latency.", "Cap rollback depth versus unlimited: a cap bounds the cost per frame and forces a stall beyond it, while no cap risks falling behind permanently."],
    p: ["Sound effects triggered in mispredicted frames play twice or play and then vanish.", "A slow machine cannot re-simulate within one frame, and its stalls make the whole match unpleasant for everyone."],
    v: "Play with 100 ms simulated latency and random jitter, and confirm both players see correct game outcomes, that frame hashes match after every rollback, and that frame time stays within budget at the configured depth.",
    dep: ["state-serialization", "run-ahead", "determinism", "desync-detection"]
  },
  "session-setup": {
    s: "Establishes a netplay session: finding peers, agreeing on the title and settings, measuring delay and giving every machine the same initial state.",
    d: "Peers connect through direct addressing, a matchmaking service or a relay. They exchange identity of the title image by hash, emulator version, configuration that affects emulation, and controller assignments. One side often sends a saved state so both begin identically, or both boot from power-on with the same seed. Round-trip time is measured to choose delay. The difficulty is verification: any mismatch in version, firmware, settings or content must be caught before play, because it will otherwise surface as a desync with no obvious cause.",
    k: ["Send a full state to start versus boot together from power-on: a state allows joining mid-game but costs bandwidth, while a shared boot is small but needs identical firmware and clocks.", "Strict version match versus tolerant: strict matching prevents desyncs, but makes players update before they can connect."],
    p: ["Two players with different firmware files pass the title check and desync in the first menu.", "Peers behind address translation fail to connect and the session setup gives no useful explanation."],
    v: "Connect two peers with intentionally mismatched settings and confirm setup refuses with a message naming the differing setting, then connect matching peers and confirm both start with identical memory hashes.",
    dep: ["title-identification", "settings-profiles", "state-serialization"]
  },
  "desync-detection": {
    s: "Notices that networked machines have diverged by comparing periodic checksums of their state, and reports the first frame where they differ.",
    d: "Every few frames each peer computes a hash over key state, such as memory, registers and device state, and exchanges it with the others. A mismatch flags a desync, stops the session or triggers a resync from a state sent by one peer. For debugging, peers can log checksums per frame to find the first divergent frame, then compare component-level hashes to locate the guilty part. The difficulty is that hashing everything every frame costs time, and hashing only some state can miss a divergence until much later.",
    k: ["Hash all state versus a chosen subset: all state is thorough, but costs frame time, while a subset is fast and can miss divergence in an untested component.", "Stop on desync versus resync from a peer's state: stopping is honest and simple, while resync keeps play going but hides a bug that should be fixed."],
    p: ["The hash covers memory but not a device counter, so peers stay apparently in sync while their audio drifts apart.", "A resync after each desync hides a recurring emulation bug, and nobody learns about it."],
    v: "Deliberately introduce a host-specific difference on one peer, run a session, and confirm the system reports a desync within the check interval, naming the first divergent frame and the component whose hash differs.",
    dep: ["state-serialization", "determinism"]
  },
  "emulated-network-devices": {
    s: "Models the original machine's network, modem or local-link hardware and connects it to the host network, so software that used those features can run.",
    d: "Original software used serial modems, local link cables, broadband adapters or wireless chips. The emulator models the device registers and protocol, and bridges frames to a host socket, a virtual network, or another emulator instance. Some designs tunnel the original's local link over the internet, which adds latency the original never had. The difficulty is timing and protocol: the guest software expects responses within strict windows, so a model built from documentation fails against software written for the real chip's quirks.",
    k: ["Bridge to the host network versus a virtual private network: bridging gives real connectivity but exposes the host and varies by platform, while a virtual network is isolated and consistent.", "Emulate the chip register-level versus emulate the driver interface: register-level works for every title, but driver-level is far simpler and fits only titles using the standard driver."],
    p: ["Link cable timing across a network is too slow for software that polls at a fixed rate, and the connection drops.", "Original online services are gone, so the model works but nothing is there to talk to."],
    v: "Connect two emulator instances through the emulated link device and confirm a two-player title starts a linked session, exchanges data for ten minutes and ends without a protocol error.",
    dep: ["serial-link", "event-scheduler", "host-threading"]
  },
  "master-clock": {
    s: "The single time base, counted in the finest tick any component needs, from which every processor and device derives its own clock.",
    d: "Real machines typically derive all clocks from one crystal through dividers and multipliers. The emulator mirrors this with a master counter, often in units of the least common multiple of component rates, so that every component's cycle maps to an integer number of master ticks. Components run for a span of master ticks and report how far they got. The difficulty is range and precision: fine units make counts large and need 64-bit math, while coarse units force rounding that drifts the relationship between chips.",
    k: ["Integer master ticks versus fractional timestamps per component: integers are exact and deterministic, while fractions are flexible but accumulate rounding differences.", "Use the crystal frequency itself as the unit versus a convenient coarser unit: the crystal unit is faithful, but a coarser unit gives smaller numbers and faster comparisons."],
    p: ["Rounding a component's cycle length to a whole number makes audio drift against video over minutes.", "A counter that overflows after hours of play wraps and breaks every pending event."],
    v: "Run the machine for the equivalent of twenty-four hours of emulated time headless, and confirm the ratio of video frames to audio samples matches the original's ratio to within one sample.",
    dep: ["cycle-accuracy-model"]
  },
  "event-scheduler": {
    s: "A time-ordered queue of future events, such as timer expiries, scanline starts and DMA completions, that the core consumes to know when something other than instruction execution happens.",
    d: "Instead of ticking every device each cycle, devices schedule an event at the future time something observable will occur. The processor runs until the next event's timestamp, then the scheduler dispatches it. Events can be canceled or rescheduled when a register write changes a timer's period. The queue is a heap or sorted list, and it is part of the saved state. The difficulty is correctness of ordering for events at the same timestamp, and cost when software writes timer registers thousands of times a frame.",
    k: ["Event-driven devices versus ticking every device each cycle: events are much faster when devices are idle, but demand careful prediction of when state next changes.", "Strict ordering of same-time events by priority versus insertion order: priority matches hardware, while insertion order is simpler but can change behavior when code changes."],
    p: ["A canceled event remains in the queue and fires later, raising a spurious interrupt.", "The event queue is omitted from the saved state, so restored machines lose every pending timer and video line."],
    v: "Schedule events with identical timestamps and confirm they fire in the documented order across a hundred runs, and confirm a save state taken mid-frame restores with the same pending events and identical output.",
    dep: ["master-clock", "state-serialization"]
  },
  "component-synchronization": {
    s: "Decides how far each processor or device may run ahead of the others before they must catch up, trading speed for accuracy of interactions between them.",
    d: "Strategies range from lockstep, where every component advances one tick together, to catch-up, where each runs freely and is synchronized only when another component reads or writes shared state, to coarse slices of thousands of cycles. Catch-up needs each component to be able to run to a given time on demand. The difficulty is choosing the sync points: too coarse and software that races between chips behaves wrongly, too fine and the emulator becomes slow, sometimes by factors of ten.",
    k: ["Lockstep per cycle versus catch-up on access: lockstep is simple and exact but slow, while catch-up is much faster but each component must be resumable at arbitrary times.", "Fixed slice length versus adaptive slices: fixed slices are predictable, while adaptive slices shorten near interactions and lengthen when components are independent."],
    p: ["A slice long enough to be fast lets one processor miss a flag the other set and cleared inside the slice.", "Catch-up on a rarely used register leaves a component far behind, and a later access causes a long stall."],
    v: "Run a test program that races two processors on a shared mailbox at several slice sizes, and confirm results match the hardware reference at the configured accuracy level and differ only where documented.",
    dep: ["event-scheduler", "master-clock", "cycle-accuracy-model"]
  },
  "cycle-accuracy-model": {
    s: "The level of timing detail the emulator reproduces, from whole-instruction timing to exact cycle-by-cycle bus behavior, chosen per component.",
    d: "Levels include instruction-accurate, where each instruction takes a fixed count, cycle-counted, where each instruction advances time by its documented cycles, and bus-cycle-accurate, where each memory access happens at its exact time. Higher levels reproduce effects such as mid-instruction register reads and video writes during a scanline. Each level multiplies the work per instruction. The difficulty is knowing what the software needs: most titles run on coarse timing, while a few depend on exact cycles, so accuracy is often switchable per title.",
    k: ["Accurate at the bus-cycle level versus whole-instruction timing: bus-cycle accuracy handles timing-dependent tricks, but is several times slower and complicates translated code.", "One accuracy level for the whole machine versus per component: per component spends effort only where it matters, but needs clear boundaries between components."],
    p: ["Timing is accurate in the processor but not in DMA, and a title that starts a transfer then polls misbehaves.", "A faster mode is shipped as default and a handful of titles quietly break."],
    v: "Run the timing test suite at each accuracy level and confirm the set of passing tests grows monotonically with accuracy, and that each documented mismatch at lower levels is listed by name.",
    dep: ["master-clock", "bus-contention"]
  },
  "frame-pacing": {
    s: "Presents emulated video frames to the display at a steady rate, matching the original's refresh and the host's, without stutter or drift.",
    d: "The original machine produces frames at its own rate, such as 59.94 or 50 Hz, while the host display runs at its own rate. The emulator times frame presentation against the host clock or vertical sync and absorbs the difference, using audio as the clock, skipping or repeating frames, or adjusting audio rate slightly. The difficulty is that three clocks meet: emulated time, host display time and host audio time. Pacing only on one visibly stutters or makes audio drift against the others.",
    k: ["Pace to display sync with audio adaptation versus pace to audio with video adaptation: display sync gives smooth motion, while audio-driven pacing never glitches sound but repeats or drops frames.", "Triple buffering versus immediate presentation: buffering smooths timing but adds one frame of latency."],
    p: ["A 60 Hz display with a 59.94 Hz source drops one frame every seventeen seconds, a stutter people notice.", "Frame time spikes from one slow frame are followed by an uncontrolled burst of catch-up frames."],
    v: "Run a scrolling test pattern for ten minutes on a display with a mismatched refresh rate, and confirm a frame time log shows the planned drop or repeat count and no unplanned stalls, with audio never underrunning.",
    dep: ["audio-sync", "host-timing", "host-window-display"]
  },
  "speed-control": {
    s: "Lets the person run the machine faster or slower than real time, including fast-forward, slow motion and frame advance, by changing how much emulated time passes per host frame.",
    d: "Speed changes alter the ratio between emulated and host time. Fast-forward removes the throttle and typically skips presenting most frames and muting or time-compressing audio. Slow motion lengthens each emulated frame across more host time. Frame advance runs one frame per key press. All must not change the emulated machine's behavior, only its pacing. The difficulty is audio, which must be muted, pitch-shifted or resampled, and avoiding mixing speed changes into the deterministic state or recordings.",
    k: ["Skip rendering during fast-forward versus render every frame: skipping gives much higher speed, but needs the video unit to still advance its state correctly without output.", "Resample audio when speeding up versus mute: resampling keeps sound but shifts pitch, while muting is simple and avoids buffer problems."],
    p: ["Skipping rendering also skips a side effect that the guest reads back, and the title misbehaves only when fast-forwarding.", "The speed setting leaks into a recording, so replays vary depending on the original speed."],
    v: "Record a run, replay it at normal speed and at maximum fast-forward, and confirm both end with identical frame and memory hashes while the fast replay finishes in a fraction of the time.",
    dep: ["frame-pacing", "audio-sync", "software-renderer"]
  },
  "threaded-components": {
    s: "Runs separate emulated components, such as a video unit, a sound processor or a second processor, on different host threads and synchronizes them with the main core.",
    d: "Splitting components across threads can use multiple host cores, and match how real hardware runs chips in parallel. Components communicate through queues of timestamped commands or shared memory with defined sync points. Determinism requires that each thread sees the same data at the same emulated time regardless of host scheduling, which usually means synchronizing at fixed boundaries and applying commands in a defined order. The difficulty is that every shared datum becomes a race, and the performance gain is often smaller than the added complexity.",
    k: ["Deterministic synchronization at fixed boundaries versus free-running threads: fixed boundaries reproduce exactly, while free-running threads are faster but produce results that vary run to run.", "Thread per component versus a pool of tasks: threads per component mirror hardware and are simple, but a pool balances load better with more complex dependencies."],
    p: ["Two threads touch the same memory without a defined order, and the output changes between runs.", "Thread count is tuned on one host and the emulator runs slower than single-threaded on a machine with fewer cores."],
    v: "Run a test program a hundred times with different host thread counts and priorities, and confirm every run produces identical output hashes and the multi-threaded run is measurably faster than single-threaded on a multi-core host.",
    dep: ["component-synchronization", "host-threading", "determinism"]
  }
});
