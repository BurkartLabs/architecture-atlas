// Details for the audio workstation plate, part 3: the audio engine, the real-time thread and latency compensation.
ATLAS.details("audio-workstation", {
  "audio-graph": {
    s: "The directed graph of processing nodes, such as clip readers, instruments, effects, panners and buses, connected by audio and event edges, that defines everything the engine computes.",
    d: "Each node declares its inputs, outputs, latency and channel layout, and a process function that reads input buffers and writes output buffers. Edges carry buffers of a fixed block size. The user-visible mixer, the plugin chains and the clip playback are all expressed as nodes and edges. The graph changes while audio runs, as tracks and plugins are added, so the engine works from an immutable compiled snapshot and swaps it at a buffer boundary. Keeping the editable graph and the running one separate is the main design problem.",
    k: ["One graph for everything vs separate mixer and playback structures: one graph gives consistent latency and ordering, and every feature must be expressed as nodes.", "Pull-based evaluation vs push-based: pull computes only what the outputs need and complicates parallel scheduling, push runs everything in a fixed order and wastes work on unused branches."],
    p: ["Editing the live graph in place while the callback reads it causes crashes that appear only occasionally.", "Nodes that allocate memory in their process function cause rare dropouts that vanish under a debugger."],
    v: "Build a graph of 200 nodes, change it fifty times during playback with a test tone running, and confirm the output shows no discontinuities and no allocation occurs in the callback, using an allocation trap.",
    dep: ["graph-compiler", "audio-buffers-and-formats"]
  },
  "graph-compiler": {
    s: "Turns the editable graph into an immutable, ordered execution plan with preallocated buffers, then hands it to the audio thread without stopping playback.",
    d: "When the user changes the mixer or plugin chains, the compiler runs on a non-real-time thread. It sorts the nodes into a processing order, assigns buffers and reuses them across nodes whose lifetimes do not overlap, inserts delay-compensation nodes and channel converters, and produces a flat list of steps. The finished plan is published through an atomic pointer swap; the old plan is released by a non-real-time thread once the callback has moved on. Compilation must be fast enough that a user dragging a plugin sees no delay.",
    k: ["Recompiling the whole graph per edit vs incremental updates: full recompile is simpler and correct, and incremental updates are faster on large sessions and carry subtle bugs.", "Buffer reuse across nodes vs a buffer per edge: reuse cuts memory and cache misses, a buffer per edge is trivial to debug."],
    p: ["Freeing the old plan on the audio thread causes a stall when the last reference is dropped there.", "A compile that takes seconds on a large session leaves the user with edits that do nothing audible until it ends."],
    v: "Reorder 50 plugins on a 300-track session and time the swap. The new plan runs on the next buffer, the old plan is freed off the audio thread and no callback exceeds its time budget.",
    dep: ["audio-graph", "processing-order-and-cycles", "plugin-delay-compensation"]
  },
  "processing-order-and-cycles": {
    s: "Decides which nodes run first so every input is ready before its consumer runs, and detects or breaks cycles that would make the order undefined.",
    d: "A topological sort of the graph orders nodes by dependency. Sends, sidechains and bus returns add edges that cross the neat track-to-master structure. A true cycle has no valid order; the editor rejects it, or the compiler inserts a one-buffer delay on the feedback edge so a feedback loop becomes defined, at the cost of a small timing change. Ties between independent nodes are broken in a stable way so the result is repeatable. The ordering also determines which nodes may run in parallel.",
    k: ["Rejecting cycles vs breaking them with a delay: rejecting is safe and limits creative feedback, a delay allows it and changes the sound by at least one buffer.", "Stable ordering of independent nodes vs best-for-parallelism ordering: a stable order is reproducible, a parallel-friendly order may sum floating-point values differently from run to run."],
    p: ["A cycle introduced through a sidechain that the editor does not check hangs the compiler or produces a plan that reads uninitialized buffers.", "Unstable sort order sums channels in a different order on each compile, so renders differ by a few bits."],
    v: "Generate random graphs with and without cycles. Acyclic ones compile with every input produced before its consumer, cyclic ones are rejected or get exactly one delay per cycle.",
    dep: ["audio-graph"]
  },
  "parallel-graph-execution": {
    s: "Runs independent parts of the graph on several worker threads each cycle, so large sessions use all cores while the callback still finishes on time.",
    d: "The audio callback thread becomes the coordinator of a pool of real-time worker threads. Nodes with no unmet dependencies are queued to workers, which run them and signal dependents. The critical path through the graph, usually a long chain on one track or bus, bounds the speed-up regardless of core count. Workers spin or wait using primitives that are safe on the audio thread. The hard part is waking threads quickly enough; thread wakeup latency from the operating system can cost more than a small plugin takes to run.",
    k: ["Spinning workers vs sleeping workers: spinning wakes in microseconds and uses all cores constantly, sleeping saves power and risks wakeup delays that miss deadlines.", "Splitting by track vs by graph node: track-level splitting is simple and limited by the biggest track, node-level splitting balances better and needs a real dependency scheduler."],
    p: ["One heavy plugin on a bus that everything feeds into makes the whole session single-threaded.", "Worker threads without real-time priority get preempted and make dropouts under moderate system load."],
    v: "Run a session of 100 equal tracks on 1, 2, 4 and 8 workers and plot callback time. Time falls close to inversely with workers until it hits the critical path, with no missed deadlines.",
    dep: ["graph-compiler", "thread-priorities", "threading-primitives"]
  },
  "sample-rate-conversion": {
    s: "Converts audio between sample rates so files, devices and the project can differ, with filters that avoid aliasing and keep the passband flat.",
    d: "Files recorded at one rate are converted to the project rate when played, often at import, sometimes live. A converter interpolates between samples with a band-limited filter, typically a polyphase design of tens to hundreds of taps. Quality and cost scale with filter length and phase response. The process adds delay. The same code serves oversampling inside effects, and device rate changes. Variable-ratio conversion is needed for drift correction and varispeed. The hard part is keeping quality high at low CPU cost across many simultaneous streams.",
    k: ["Converting files at import vs during playback: at import costs disk and time once and plays cheaply, during playback saves disk and spends CPU every time.", "Linear-phase vs minimum-phase filters: linear-phase avoids phase distortion and adds latency and pre-ringing, minimum-phase has little latency and alters phase."],
    p: ["Low-quality interpolation introduces audible aliasing on bright material at high ratios.", "Converting repeatedly through several stages accumulates filter ripple and delay."],
    v: "Convert a swept sine from 96 kHz to 44.1 kHz and back, and check passband ripple below 0.1 dB and alias components below -100 dB relative to the signal.",
    dep: ["simd-dsp-kernels"]
  },
  "audio-buffers-and-formats": {
    s: "Defines how samples are laid out in memory: sample format, channel layout, interleaved or separate channels, block size and alignment.",
    d: "Inside the engine audio is usually 32-bit or 64-bit floating point, in separate per-channel arrays aligned for vector instructions, with a block size chosen at start. Devices and files use other formats, such as 16-, 24- or 32-bit integers, interleaved, so conversions happen at the edges. Buffers come from a pool, so the callback never allocates. Channel layouts include mono, stereo and surround, with defined channel order. Silence flags let nodes skip processing of buffers known to be empty, which saves much CPU.",
    k: ["32-bit float vs 64-bit float internally: 32-bit is faster and halves memory bandwidth, 64-bit gives more headroom against accumulated rounding in long chains.", "Separate channels vs interleaved: separate arrays suit vector math and per-channel processing, interleaved matches devices and costs conversion."],
    p: ["Misaligned buffers prevent vector instructions or crash on strict hardware.", "Treating a silent-flag as authoritative after a node writes to the buffer plays stale or skipped audio."],
    v: "Pass a known test file through the engine at each internal format and compare the output to a reference. Differences are limited to expected rounding, and all buffers are aligned to the vector width.",
    dep: ["realtime-memory-allocation"]
  },
  "clip-playback-readers": {
    s: "Nodes that supply audio from clips to the graph, reading ahead from disk, applying offsets, gain, fades and stretch, and starting from any playhead position.",
    d: "For each active clip a reader keeps a small cache of audio ahead of the playhead, filled by the disk streaming thread. In each callback it copies the requested slice into the output buffer, applies fades and gain, and invokes any stretching or rate conversion. Seeking mid-clip must be instant, so readers keep the beginning of every clip preloaded. When the disk falls behind, the reader reports an underrun and outputs silence. The set of active clips changes constantly with the playhead, so readers are created and retired by non-real-time code.",
    k: ["Large read-ahead caches vs small: large caches survive slow disks and use memory and slow transport starts, small caches start quickly and underrun more.", "One reader per clip vs one per track: per-clip readers are simple and many, per-track readers handle crossfades and gaps in one place and need more logic."],
    p: ["A seek into an area not yet cached outputs silence for a moment, which sounds like a missed note.", "Opening files in the callback when a clip becomes active stalls the thread for a disk seek."],
    v: "Jump to random positions in a 200-track session while playing and confirm every clip sounds from the first sample after the jump without gaps, and no file is opened on the audio thread.",
    dep: ["disk-streaming-thread", "crossfades-and-fades", "audio-file-pool"]
  },
  "summing-and-headroom": {
    s: "Adds the signals of many channels into buses and the master, with enough numeric range to avoid clipping and consistent ordering to keep results reproducible.",
    d: "Summing is a vector addition of buffers, usually in floating point so intermediate values can exceed full scale without clipping. Order matters slightly because floating-point addition is not associative, so a fixed order makes renders repeatable. Some designs sum in higher precision. Gain applied before the sum affects headroom for downstream fixed-point plugins. At the end, the master output is converted to the device or file format, where clipping and dither occur. The master channel is the point where all the earlier headroom is spent.",
    k: ["Single-precision vs double-precision summing: single is quicker and accumulates small errors across thousands of channels, double removes them and doubles memory traffic.", "A fixed summing order vs whichever finishes first: a fixed order gives identical renders, and arrival order lets workers add as soon as data is ready."],
    p: ["Parallel summing in thread-completion order gives renders that differ in the last bit from one run to the next.", "Plugins on the master that clip at full scale make the internal headroom meaningless."],
    v: "Render the same 300-track project ten times with parallel execution on and compare the output files. They are bit-identical.",
    dep: ["audio-buffers-and-formats", "processing-order-and-cycles"]
  },
  "transport-and-playhead": {
    s: "The engine's notion of where it is in the song: the playhead position, play, stop and loop state and how it advances by one block at a time.",
    d: "Each callback advances the playhead by the buffer length. At loop boundaries it splits the buffer into two segments and reads each from the right place. Relocation commands are applied at a buffer boundary and trigger declicking and the reset of state in stateful plugins such as delays. The transport publishes a time-info structure that plugins use for tempo-synced effects: position, tempo, time signature and playing state. For music-related behavior it consults the tempo map. The playhead is the clock all clips, automation and events refer to.",
    k: ["Splitting buffers at loop points vs rounding the loop to buffer size: splitting is sample-accurate and complicates every node, rounding is simple and changes the loop length.", "Resetting plugin state at relocation vs letting tails ring: resetting avoids sound from the old position, and cuts reverb tails abruptly."],
    p: ["A loop point not on a buffer boundary repeats or skips samples if the split is not handled by every node.", "Tempo-synced plugins fed stale position info after a relocate play out of step for a bar."],
    v: "Loop a one-bar region containing a single click for five minutes and count output clicks and spacing. Every spacing equals the loop length in samples exactly.",
    dep: ["tempo-map", "sample-accurate-scheduling"]
  },
  "audio-callback": {
    s: "The function the driver calls each period, on the highest-priority thread, to produce the next block of output from the latest input within a fixed time.",
    d: "The callback receives input buffers and must fill output buffers before the device needs them, usually within a few milliseconds. It drains pending commands from a queue, runs the compiled graph for one block, writes meter values, and returns. Its time budget is the buffer length minus overhead, and in practice less than that because other processes compete for the cores. It is the one place where a missed deadline is audible as a click or a gap. Everything else in the program exists to keep the work done here small and predictable.",
    k: ["Doing all processing in the driver callback vs a separate engine thread: processing in the callback has the least latency, a separate thread can use work queues and adds a block of delay.", "Fixed block size vs variable: fixed blocks simplify every node, variable blocks match some drivers and force every node to handle any size."],
    p: ["Any lock, allocation, file access or logging call in the callback occasionally blocks and drops a buffer.", "Heavy work done just under the budget in testing exceeds it once other processes load the machine."],
    v: "Play the heaviest project at the smallest supported buffer for an hour while the machine is also busy, and read the callback's maximum duration. It remains below the buffer period with margin.",
    dep: ["realtime-safety-rules", "audio-graph", "lock-free-queues"]
  },
  "realtime-safety-rules": {
    s: "The discipline for code on the audio thread: no locks, no memory allocation, no system calls that can block, no unbounded loops, and no unpredictable waits.",
    d: "A real-time function has to finish in bounded time, so anything that may wait on another thread is forbidden: mutexes, memory allocation, file and network I/O, logging, throwing exceptions and the first use of lazily-initialized data. Code uses preallocated memory, lock-free structures and wait-free operations. Tools like allocation traps, instrumented locks and static analysis check these rules. The rule is easy to state and very hard to enforce, because third-party plugins and library calls break it without any visible sign.",
    k: ["Strict wait-free guarantees vs best-effort short critical sections: wait-free is predictable and hard to design, short locks are easy and fail under priority inversion.", "Banning exceptions on the audio thread vs catching them: banning avoids hidden allocation and unwinding cost, catching adds safety against plugin bugs."],
    p: ["A logging call added during debugging allocates and takes a lock, causing dropouts in release builds.", "A priority inversion where the audio thread waits on a lock held by a low-priority thread produces long stalls."],
    v: "Run the callback under an instrumented allocator and lock tracer for a full session with edits. No allocation, lock or blocking system call is reported from the audio thread.",
    dep: ["lock-free-queues", "realtime-memory-allocation"]
  },
  "lock-free-queues": {
    s: "Single-producer, single-consumer queues that move commands, events and measurements between interface and audio threads without locks.",
    d: "A fixed-size ring of slots with separate read and write indices, updated with atomic operations and the right memory ordering, lets one thread push and another pop without waiting. Commands from the interface to the audio thread, MIDI events, meter values and messages back all use them. Queues are sized for the worst burst. When one fills, the sender must drop, coalesce or retry, never block. The challenge is correctness: memory ordering bugs appear only on some processors and only under load.",
    k: ["Queues of small copied messages vs pointers to shared objects: copies keep ownership simple and cost bandwidth, pointers are cheap and require care over who frees them.", "Dropping on overflow vs coalescing: dropping is simple, coalescing keeps the latest parameter value and loses intermediate ones, which is usually acceptable."],
    p: ["A missing memory barrier makes the consumer read a message before its data is visible, a bug that occurs once in millions of messages.", "A queue sized for typical load overflows in a burst, such as loading a project with thousands of parameter changes."],
    v: "Stress the queue with a producer sending sequenced messages at full speed on one core and a consumer on another for several hours, on several processor types. Every message arrives once and in order.",
    dep: ["threading-primitives"]
  },
  "thread-priorities": {
    s: "Assigns real-time or high priority to the audio and worker threads and sets how the operating system scheduler treats them relative to other work.",
    d: "The audio thread is promoted to the operating system's real-time class, with a stated period and computation budget on systems that support it, so the scheduler runs it before ordinary threads. Worker threads in the graph executor join the same workgroup or class. Disk, interface and analysis threads run at lower priority. Core affinity and power management also matter: a core in a low-power state may take milliseconds to wake. The hard part is that priority does not guarantee a deadline, and priority inversion shows up when a high-priority thread waits on a low one.",
    k: ["Real-time scheduling class vs high normal priority: real-time classes give predictable timing and can starve the system if misused, normal priority is safe and subject to preemption.", "Pinning threads to cores vs letting the scheduler move them: pinning gives cache stability and prevents migration, free scheduling balances load better."],
    p: ["Worker threads that are left at normal priority are preempted by background tasks and miss deadlines even though the main audio thread is fine.", "Aggressive power saving puts idle cores to sleep, so wake-up delays cause dropouts at low load."],
    v: "Run the engine with CPU load generators on every core, once with real-time priorities and once without. Only the prioritized run keeps a zero-dropout count over thirty minutes.",
    dep: ["threading-primitives"]
  },
  "disk-streaming-thread": {
    s: "A background thread that reads audio from files ahead of the playhead into memory so the audio callback never waits for the disk.",
    d: "The streamer keeps a prioritized list of readers and their cache fill levels. It reads in large aligned blocks, decodes compressed formats if needed, and writes into each reader's ring buffer. Priorities favor the readers that will run out first. Requests are re-ordered to reduce seek time on spinning disks, and the work is spread across several threads on fast storage. When a seek happens, the old requests are canceled and the new position gets filled first. A slow network drive or antivirus scan can stall it.",
    k: ["Many small reads vs a few large ones: large reads are efficient on every disk and use more cache memory per clip, small reads respond quickly and thrash on slow storage.", "Prioritizing by time to underrun vs round-robin: priority by urgency prevents the worst underruns and starves distant clips, round-robin is fair and wasteful."],
    p: ["A network drive pause stalls every reader at once and produces silence across the whole session.", "Requests queued before a seek fill caches with data the playhead has already left."],
    v: "Play a 300-track session from a throttled disk simulating 100 ms latency spikes and confirm that readers sustain with the preload size configured, and underruns are reported, not silent.",
    dep: ["ring-buffers", "clip-playback-readers", "audio-file-codecs"]
  },
  "ring-buffers": {
    s: "Fixed-size circular memory areas that carry a continuous stream of samples between threads or processes at different rates, one writing while the other reads.",
    d: "A ring has a capacity, a write position and a read position. The writer advances after writing, the reader after reading, and the difference tells how much data is available. Capacity decides how much jitter the system tolerates: bigger rings absorb longer stalls and add delay in latency-critical paths. Rings feed disk writing, disk reading, sandbox audio transfer, network audio and drift correction. When full or empty the code has to decide what to do, drop, overwrite, or output silence, and report it.",
    k: ["Power-of-two sizes with masking vs arbitrary sizes: masking makes index math cheap and wastes memory, arbitrary sizes use less and need modulo operations.", "Overwriting oldest data when full vs refusing new data: overwriting keeps the stream fresh for live monitoring, refusing keeps recordings complete."],
    p: ["Using a ring with two writers breaks the single-writer guarantee and corrupts data with no error.", "Underrun and overrun counters that nobody reads hide a degraded stream until it is audible."],
    v: "Push a counter sequence through a ring between two threads for hours while one is randomly delayed. Reader output is gapless unless an overrun was reported, and counters match the number of lost samples.",
    dep: ["lock-free-queues"]
  },
  "buffer-size-management": {
    s: "Chooses and changes the block size of the audio device, trading input-to-output latency against the processing time available per block.",
    d: "Small buffers, such as 64 samples, give low latency and tiny deadlines, so every callback must finish in about a millisecond and overhead per block dominates. Large buffers, such as 1024 or 2048, give plenty of time and add noticeable delay. Many workstations let the user change it, and some offer different sizes for recording and mixing. Changing it restarts the device and re-prepares all plugins, since plugins allocate for the maximum size. Some plugins process internally in larger blocks and add latency regardless.",
    k: ["User-selectable size vs automatic switching between record and mix modes: user selection is transparent and sometimes forgotten, automatic switching suits workflows and complicates state and plugin reset.", "Same block size for all plugins vs internal sub-blocking: a uniform size is simple, sub-blocking gives smooth automation and more calls."],
    p: ["Setting a very small buffer on a heavy project causes constant xruns that users blame on the driver.", "A plugin prepared for a smaller maximum size crashes when the host raises the buffer size without reinitializing it."],
    v: "Change the buffer size from 64 to 2048 and back during a session. Every plugin is re-prepared, playback resumes in the right place, and measured round-trip latency matches the chosen size.",
    dep: ["audio-callback", "driver-abstraction", "latency-measurement"]
  },
  "xrun-handling": {
    s: "Detects missed deadlines, where the device ran out of output or overflowed its input, and reports them while keeping the system in a consistent state.",
    d: "An underrun happens when the callback does not deliver output before the device needs it, an overrun when input is not consumed in time. Drivers report them or the host detects them by timing. The engine can respond by logging, flagging recorded audio that may contain a gap, showing an indicator, and in some designs shedding load by disabling expensive plugins or raising the buffer size. The key is to be honest: a silent dropout in a recording is much worse than a visible one, because it is discovered only after the performance.",
    k: ["Reporting every xrun to the user vs only during recording: reporting always builds trust and creates noise during harmless events, recording-only focuses on cases that damage data.", "Automatic load shedding vs leaving the session as set: shedding keeps audio running with changed sound, leaving it as is preserves the mix and keeps dropping."],
    p: ["Dropouts during recording are not marked, so the take is accepted and the gap is found in the mix.", "A counter that resets with each play start hides a slow, steady rate of xruns."],
    v: "Inject a 20 ms stall into the callback during recording. The indicator appears, the take is marked with the time of the gap, and the log records the count.",
    dep: ["audio-callback", "disk-writer", "logging-and-crash-reports"]
  },
  "denormal-protection": {
    s: "Prevents extremely small floating-point numbers from slowing processing by orders of magnitude, by flushing them to zero or adding a tiny offset.",
    d: "As filter and reverb tails decay toward silence their values become denormal numbers, which many processors handle in slow microcode paths. A callback that was fast for loud signals can suddenly take ten times longer in quiet passages. The usual defense is setting the processor's flush-to-zero and denormals-are-zero modes on every audio thread, and adding tiny noise or DC offsets in feedback paths. The mode is per thread, so worker threads must set it too, and a plugin may reset the flags and not restore them.",
    k: ["Processor flush-to-zero modes vs software offsets: processor flags cover all code with no cost and affect every calculation in the thread, offsets are local and require plugin cooperation.", "Setting flags once at thread start vs every callback: once is cheap, every callback also repairs plugins that change the mode."],
    p: ["A plugin that changes the floating-point mode and does not restore it makes the rest of the callback behave differently.", "Quiet tails cause a CPU spike that triggers dropouts at the end of a song, not during the loud part."],
    v: "Feed a decaying reverb tail into silence and plot callback time. With protection on, the time is flat; with it off, the time rises sharply in the quiet portion.",
    dep: ["audio-callback", "simd-dsp-kernels"]
  },
  "plugin-delay-compensation": {
    s: "Measures each plugin's reported latency and delays every other path by the difference, so all signals arrive at the mix aligned in time.",
    d: "Plugins such as linear-phase equalizers and lookahead limiters delay their output. The compiler sums the latency along every path to each merge point, finds the largest, and inserts delay lines on the shorter paths. Compensation is also applied to sends, sidechains and the output toward the device, and to recorded input. The graph recompiles whenever a plugin's latency changes. Delay lines must be preallocated and long enough. The complexity grows with parallel paths, feedback loops and plugins whose latency changes at run time.",
    k: ["Full compensation for every path vs excluding armed tracks: full compensation keeps the mix exact and adds playing delay, excluding armed tracks gives low-latency monitoring and misaligns them with the rest.", "Trusting reported latency vs measuring: trusting needs no setup and fails on plugins that report wrongly, measuring catches them and needs a test signal."],
    p: ["A plugin that reports zero latency but delays by hundreds of samples makes comb filtering when mixed with a dry copy.", "Latency that changes with a plugin setting, but is not re-reported, leaves paths misaligned until a manual refresh."],
    v: "Split a click to two paths, one through a lookahead plugin of 2048 samples, sum them and look at the output. With compensation there is a single click, and without it two clicks 2048 samples apart.",
    dep: ["graph-compiler", "driver-latency-reporting", "plugin-host-wrapper"]
  },
  "driver-latency-reporting": {
    s: "Obtains the input and output delay that the driver and device add beyond the buffer size, so the host can align recordings and show true round-trip latency.",
    d: "Drivers report latency in samples for input and output, which should include buffering inside the driver, converter delay and any hardware mixing. Many drivers report only the buffer and omit converter or USB transfer delay, so the figure is lower than the real one. The host uses the values to place recorded audio, to compute monitoring delays and to compensate. Values change when the buffer size or sample rate changes, and on some devices only after the stream starts. Users may add manual offsets for inaccurate drivers.",
    k: ["Using driver-reported values vs asking users to measure: reported values work without user effort and are often wrong, user measurement is accurate and often skipped.", "Querying once at device open vs re-querying on change: once is simple and goes stale when buffers change, re-querying stays right and needs handling for changes in a running stream."],
    p: ["Reading latency before the stream starts returns zero on some drivers, so the first recordings are misaligned.", "A driver that reports the buffer size as its latency ignores converter delay, leaving overdubs consistently late."],
    v: "Compare the reported round-trip latency with a loopback measurement at three buffer sizes. The difference is below a few samples, or a stored offset closes the gap.",
    dep: ["driver-abstraction"]
  },
  "latency-measurement": {
    s: "Measures the actual round-trip delay by sending a test signal out and recording it back through a loopback connection, and stores the result as a calibration.",
    d: "The tool plays a short impulse or a sweep from an output, which is connected to an input with a cable, records the return and finds the delay by locating the impulse or by cross-correlation. The result in samples includes everything: buffers, converters, driver and operating-system mixing. It is repeated several times to check stability. The stored offset is keyed to the device and buffer settings. Some devices have variable latency, so results differ between runs by a few samples and need a median.",
    k: ["Impulse detection vs sweep cross-correlation: an impulse is simple and sensitive to noise, a sweep resists noise and takes longer to run.", "Calibrating per buffer size vs a formula from a single measurement: per-size calibration catches nonlinear behavior, a formula is faster and breaks on devices with hidden fixed delays."],
    p: ["Measuring with the monitor mix enabled records a direct copy of the signal and reports near-zero latency.", "A calibration done at one sample rate is silently applied after the rate changes."],
    v: "Calibrate a device at three settings, then record a loopback click on each and check it aligns with the played click to within one sample.",
    dep: ["driver-abstraction", "audio-buffers-and-formats"]
  },
  "monitoring-latency-modes": {
    s: "Options that trade monitoring delay against processing: low-latency mode that bypasses delay-heavy plugins on armed tracks, and a full mode that keeps every effect.",
    d: "While recording, a performer needs to hear their own sound within a few milliseconds. Low-latency mode temporarily bypasses or removes plugins above a latency threshold on the armed track and sends in the live path, and may shrink the buffer size. Compensation for these tracks is turned off so they keep the shortest path. Afterwards they are restored. The switch has to be transparent to the project's mix. The risk is that the performer hears a different sound than the final mix and plays differently in response.",
    k: ["Automatically bypassing plugins over a latency limit vs warning the user: automatic bypass protects the performer's timing and changes the heard sound, a warning is honest and leaves the fix to the user.", "Smaller buffer while recording vs same buffer always: a smaller buffer lowers latency and raises the dropout risk, a constant size keeps the session stable."],
    p: ["A bypassed amp simulation leaves the guitarist hearing a thin sound and playing too softly.", "Latency mode left on during mixing leaves tracks uncompensated and out of phase."],
    v: "Arm a track with a 2048-sample lookahead limiter, enable low-latency mode, and measure monitoring delay. It drops to the base round trip, and returns to full compensation when disabled.",
    dep: ["plugin-delay-compensation", "input-monitoring", "buffer-size-management"]
  },
  "delay-compensated-recording": {
    s: "Shifts newly recorded audio earlier by the measured round-trip latency so it lines up with the material the performer was playing along to.",
    d: "While recording, the performer hears the backing tracks delayed by output latency, plays in time with what they heard, and the recording is delayed again by input latency. Placing the clip at the recording start time would put it late by the sum. The recorder therefore moves the clip earlier by the total, which includes the monitoring path's plugin latency. Compensation values come from driver reports or calibration. When monitoring runs through software, the performer may hear their own sound later, which also changes how they play.",
    k: ["Compensating at record time vs later: at record time the clip is correct immediately, later correction lets it be redone when calibration improves and needs the original offset stored.", "Applying only driver latency vs including plugin delay: driver-only is simple and ignores effects on the monitoring path, full compensation is accurate and needs per-track bookkeeping."],
    p: ["Recording from a track fed by a latency-heavy plugin places audio late by the plugin's delay.", "Applying compensation twice, once in the recorder and once in the clip, moves the take too early."],
    v: "Record a loopback click while a backing click plays, with plugins of different latencies in the monitoring path. After compensation the two clicks align within one sample in every case.",
    dep: ["driver-latency-reporting", "plugin-delay-compensation", "latency-measurement"]
  },
  "sample-accurate-scheduling": {
    s: "Starts notes, automation changes and clips at an exact sample inside a buffer instead of at the buffer start, so timing does not depend on block size.",
    d: "Events carry a sample offset within the current block. A node splits its processing at event positions or applies the event at that sample while rendering. The scheduler converts musical positions to sample positions through the tempo map and the playhead. Without offsets, all events in a buffer land at its start, adding jitter equal to the buffer length. Splitting a block at every event costs overhead on dense data, so nodes use a small sub-block size when needed. The shared timeline demands consistent rounding.",
    k: ["Splitting processing at each event vs applying events at block start: splitting is exact and costs calls and complexity, block-start application is simple and jittery.", "Computing positions in floating-point seconds vs integer samples: seconds is easy to read and accumulates error, integers are exact and need explicit conversion."],
    p: ["A plugin that ignores event offsets plays all notes of a block at its start, so timing changes with buffer size.", "Rounding event positions down in one place and to nearest in another gives drift of a sample."],
    v: "Play a sixteenth-note pattern at 64, 512 and 2048 sample buffers and compare the rendered output. All three are identical down to the sample positions of every attack.",
    dep: ["event-timestamps", "transport-and-playhead"]
  },
  "event-timestamps": {
    s: "The time stamps attached to MIDI messages, parameter changes and commands, which say when each event should take effect in terms the audio thread can use.",
    d: "Events from outside arrive stamped with a clock such as operating-system time or the device's hardware clock. The host translates them into positions relative to the current audio block, using a recorded mapping between the clock and the audio stream position. Events from the timeline already carry musical or sample positions. The mapping must be updated continuously, as clocks drift against each other. Events that arrive too late for the current block are placed in the next one, adding delay. The conversion's accuracy determines how tight live playing feels.",
    k: ["Stamping events as early as possible vs when the audio thread reads them: early stamping removes queue jitter and needs a clock mapping, late stamping is simple and inherits scheduling jitter.", "Dropping events that arrive too late vs playing them immediately: dropping keeps timing exact and loses notes, immediate playback never loses notes and sounds sloppy."],
    p: ["Clock mapping that is not corrected for drift gradually shifts live-played notes later during a long take.", "Events stamped on one clock and interpreted on another jump at every driver restart."],
    v: "Play a MIDI keyboard through a hardware loopback with known intervals for an hour and compare recorded event spacing with the source. The deviation is below a millisecond and shows no drift.",
    dep: ["clock-drift-correction"]
  }
});
