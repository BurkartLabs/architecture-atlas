// Details for the audio workstation plate, part 4: project files, rendering, devices, foundation and cross-cutting concerns.
ATLAS.details("audio-workstation", {
  "project-file-format": {
    s: "The on-disk description of a session: tracks, clips, routing, plugin settings, automation and tempo, stored apart from the large media files it points to.",
    d: "A project is a structured document, text or binary, that serializes the timeline model and mixer graph. It holds identifiers, parameters and plugin state blobs, and references media by relative or absolute path or by content id. Saving writes to a temporary file and renames it, so an interrupted save cannot destroy the old version. The format must load quickly on large sessions and stay readable by later versions. Differences between machines, such as missing plugins or different sample rates, must be recorded and reported on load.",
    k: ["Text-based vs binary storage: text diffs, merges and repairs by hand and is larger and slower to load, binary is compact and fast and opaque when corrupted.", "A single file vs a folder with media: a single file is easy to share, a folder keeps large audio out of save times and lets media be shared between versions."],
    p: ["Writing the project over the old file in place leaves a corrupt file when power fails mid-save.", "Storing absolute media paths makes the project fail to find its audio on any other machine."],
    v: "Save a large project, kill the process halfway through a second save, and reopen. The first version loads intact, and a normal save then reopens with every track, clip and plugin state equal.",
    dep: ["timeline-model", "plugin-state-and-presets"]
  },
  "audio-file-pool": {
    s: "The registry of all audio files a project uses, with their format, length, peak data and location, so many clips can share one source.",
    d: "Each imported or recorded file gets an entry holding its path, format, sample rate, channel count, duration and a content hash or id. Clips refer to entries rather than paths, so moving a file means fixing one record. The pool handles import options such as copying files into the project folder or converting their sample rate, and tracks which files are in use, so unused ones can be cleaned. It provides readers to the streaming thread. The difficulty is keeping the pool consistent with what is on disk while other programs touch the folder.",
    k: ["Copying media into the project vs linking to the original: copying makes the project portable and uses disk, linking saves space and breaks when the original moves.", "Identifying files by path vs by content hash: paths are cheap and fail on renames, hashes survive moves and cost time to compute for large files."],
    p: ["Two imported files with the same name from different folders overwrite each other in the project folder.", "Deleting a file from the pool that a past undo step still uses breaks undo."],
    v: "Import the same file twice, move the project folder to another machine, and confirm that both entries resolve, share one file when hashed, and every clip plays.",
    dep: ["audio-file-codecs"]
  },
  "sample-library-management": {
    s: "Organizes sounds, loops and instrument libraries, with tagging, search, preview at the project tempo and key and a way to import them into a session.",
    d: "A browser indexes folders of audio and presets in a database with file attributes, tags and analysis results such as tempo, key and loudness. Previewing a loop plays it time-stretched to the project's tempo through a separate output path. Dragging a sample into the project adds it to the file pool and makes a clip. Libraries can be huge, so scanning runs in the background and results are cached. The hard parts are keeping the index in step with files that are renamed or deleted outside the program and making preview instant.",
    k: ["Background indexing vs scanning on demand: background indexing makes search instant and uses disk and CPU at inconvenient times, on-demand scanning is lazy and slow for large folders.", "Analyzing on import vs on first use: on import front-loads work and gives complete search, on first use spreads the cost and leaves holes in results."],
    p: ["A library on a disconnected drive vanishes from the index, and projects that reference it show missing media.", "Previewing through the main output path adds the preview sound to a running mix or recording."],
    v: "Index a folder of 50,000 samples, search by tempo range and tag, and preview a result. Results appear in under a second and the preview plays at the project tempo without touching the main bus.",
    dep: ["tempo-detection", "audio-file-pool"]
  },
  "autosave-and-backup": {
    s: "Periodically writes recovery copies of the open project and keeps versioned backups, so a crash or mistake costs minutes of work rather than a session.",
    d: "A timer, or a count of edits, triggers a save to a separate recovery location, done on a background thread from a consistent snapshot of the model. Old copies rotate, keeping a limited number. After an abnormal exit, the next launch detects the leftover recovery file and offers it. Larger operations such as saving media-heavy projects need care not to disturb playback or recording. Backups may also include the media. The hard part is saving cheaply enough that it can run during a take.",
    k: ["Saving a full copy vs recording a journal of edits: full copies are simple to restore and take time on big projects, journals are small and quick and need replay logic.", "Autosave during recording vs deferring: saving during recording protects the take and risks disk contention, deferring keeps the disk free and risks losing the session."],
    p: ["An autosave running on the interface thread freezes the application for seconds on a large project.", "Rotating away the only good copy after a corrupt autosave leaves nothing to restore."],
    v: "Kill the process at random points during editing and recording sessions, relaunch and recover. The recovered project is at most one autosave interval behind, and the audio files recorded so far are present.",
    dep: ["project-file-format", "disk-writer"]
  },
  "undo-state-serialization": {
    s: "Stores the history of edits as reversible operations or snapshots so that undo and redo work for every change and can optionally persist across sessions.",
    d: "Each user action is recorded as a command with an inverse, or as a before and after snapshot of the affected objects. Related changes, such as a drag that moves many clips, are grouped so one undo reverses the whole gesture. Because most edits are descriptions, not audio, history is small, but operations that created media files need those files kept. History can be saved with the project, which requires commands to be serializable and tied to stable ids. Interleaving edits from several sources, such as automation recording, complicates grouping.",
    k: ["Command objects with inverses vs state snapshots: commands are compact and require a correct inverse for every action, snapshots are trivial to get right and cost memory on large projects.", "Saving history with the project vs discarding it on close: saved history allows undo after reopening and increases file size and compatibility burden."],
    p: ["An action that bypasses the command system cannot be undone and leaves the history out of step with the model.", "Undoing past an operation that deleted a media file restores a clip with nothing to play."],
    v: "Perform a hundred mixed edits including recording, undo them all and redo them all. The project compares equal to its state at each step.",
    dep: ["timeline-model", "project-file-format"]
  },
  "project-versioning": {
    s: "Handles projects saved by different program versions: a format version number, migration on load and clear behavior when a file is newer than the program.",
    d: "Each project carries the version of the format that wrote it. Loading an older file runs a chain of migrations that upgrade its structure, for example splitting a field or changing a unit. A newer file may contain features that the running program does not know, so the loader decides whether to refuse, load with warnings or preserve unknown data for round trips. Plugin versions are tracked separately, as are the program's own bug fixes that change sound. Migration code stays in the program forever, which is a growing cost.",
    k: ["Migrating on load vs keeping old readers: migration keeps one internal model and must be tested against every old version, old readers are isolated and multiply code.", "Preserving unknown fields vs dropping them: preserving lets newer files survive a round trip in an older program and requires carrying data it cannot interpret."],
    p: ["Overwriting a project with an older program version silently drops features added by a newer one.", "A migration that changes rounding changes the sound of old projects with no notice."],
    v: "Load a corpus of projects saved by every past version, migrate, render and compare against stored reference renders. Differences are only those on a documented list.",
    dep: ["project-file-format"]
  },
  "relinking-missing-media": {
    s: "Finds audio files that moved or disappeared since the project was saved, using names, sizes and content hashes, and reconnects the clips that used them.",
    d: "On load, the pool checks each entry's path. Missing entries trigger a search: first the project folder and relative locations, then user-chosen folders, matching by file name, length, format and hash. Results are shown for confirmation if ambiguous. Clips whose media is not found are kept with a placeholder, so structure and edits are not lost. Relinking by name alone is dangerous when many takes share names such as audio_01, so a content check is needed. The work should run in the background on large folder trees.",
    k: ["Automatic relink vs asking for each file: automatic is quick and can pick a wrong file with the same name, asking is safe and slow for hundreds of files.", "Matching by hash vs by name and length: hashes are reliable and require reading each candidate, name and length checks are fast and can confuse similar takes."],
    p: ["Relinking to a file with the same name but a different take plays the wrong performance with no warning.", "A placeholder for missing media that outputs silence hides the problem until the export is checked."],
    v: "Move a project's media to a renamed folder with some files renamed, relink and render. The result is bit-identical to the original, and files that cannot be found are listed.",
    dep: ["audio-file-pool"]
  },
  "offline-render-engine": {
    s: "Runs the project's graph faster than real time, without a device deadline, to produce the final audio for export or bounce.",
    d: "The renderer drives the same compiled graph as playback but pulls blocks in a loop as fast as the CPU allows, with no driver clock. Plugins are told they are rendering offline, so they can use higher quality modes. Time stretching and sample-rate conversion also switch to their best settings. Tails past the last clip are rendered until the signal decays below a threshold. Because no deadline exists, plugins that take too long still produce correct output. The aim is a render that sounds the same as playback, apart from the quality settings.",
    k: ["Same graph as playback vs a separate offline path: the same graph guarantees matching results and inherits real-time restrictions, a separate path can be faster and may diverge.", "Offline quality modes vs identical processing: higher quality sounds better and may differ from what the user heard while mixing."],
    p: ["Plugins that behave differently in offline mode, such as using more oversampling, change the sound of the final mix compared to playback.", "Rendering that stops at the last clip cuts off reverb tails."],
    v: "Render a project twice offline and once in real time. The two offline renders are bit-identical, and the real-time render differs only where documented quality modes apply.",
    dep: ["audio-graph", "summing-and-headroom", "plugin-host-wrapper"]
  },
  "export-formats": {
    s: "Encodes the rendered audio into delivery files, uncompressed, losslessly or lossily compressed, with sample rate, bit depth and channel layout chosen for each destination.",
    d: "The exporter converts the render's floating-point output to the target sample rate and bit depth, writes the container header and metadata, and encodes. Lossless codecs compress without changing samples, lossy codecs trade quality for size using psychoacoustic models and have their own overshoot behavior, which can clip even a mix that peaks below full scale. Multi-channel and object-based deliverables add layout rules. Batch export of many variants should reuse the render and only repeat the final stage.",
    k: ["Rendering once at full quality and encoding variants vs rendering for each target: one render saves time and guarantees a consistent mix, per-target rendering allows target-specific processing.", "Exporting at project rate vs at the delivery rate: project rate avoids conversion until the end, delivery rate lets the engine's processing run at the final rate."],
    p: ["A lossy encode of a mix peaking at 0 dBFS clips because the encoder's output overshoots.", "Exporting a stereo file from a surround project without a defined downmix gives an unbalanced result."],
    v: "Export one mix in each supported format, decode all back and compare against the source. Lossless decodes match bit for bit, lossy ones meet their stated error limits, and none clip.",
    dep: ["audio-file-codecs", "dithering-and-bit-depth", "sample-rate-conversion"]
  },
  "dithering-and-bit-depth": {
    s: "Reduces floating-point audio to a fixed word length, such as 16 or 24 bits, by adding shaped noise before rounding so quantization distortion becomes steady, quiet noise.",
    d: "Rounding to fewer bits creates distortion correlated with the signal, audible at low levels as grit. Adding triangular-probability noise of about one least significant bit before rounding decorrelates the error. Noise shaping filters push the noise toward frequencies where hearing is less sensitive. Dither is applied once, at the last step, on the final bit depth reduction. Applying it twice, or before other processing, adds noise with no benefit. The exporter must know whether the next stage will reduce bit depth again.",
    k: ["Triangular dither vs noise-shaped dither: triangular is neutral and simple, noise shaping lowers perceived noise in sensitive frequencies and raises it elsewhere.", "Dithering at export vs leaving it to the user's mastering stage: export-time dither is convenient and risks doubling, leaving it to a mastering chain keeps control."],
    p: ["Dithering a file that will be dithered again later stacks noise.", "Truncating instead of rounding adds a DC offset and distortion on low-level fades."],
    v: "Reduce a -90 dBFS sine to 16 bits with and without dither, then analyze the spectrum. Without dither there are harmonics, with it only a flat noise floor with the sine clearly visible.",
    dep: ["offline-render-engine"]
  },
  "loudness-normalization": {
    s: "Measures the integrated loudness and true peak of a render and applies gain to meet a delivery target, such as a given LUFS value, without clipping.",
    d: "Loudness measurement follows a published algorithm: K-weighting filters, gated block energy and an integrated value over the program. True peak uses oversampling to catch peaks between samples. Normalization measures first and then applies gain in a second pass, so the exporter renders twice or measures during the render and scales on write. Targets differ per platform. Gain alone can push true peak over the ceiling, so a limiter may also be needed, which changes the sound and should be a conscious choice.",
    k: ["Gain-only normalization vs adding a limiter: gain alone preserves dynamics and may not reach the target without clipping, a limiter meets the target and changes the music.", "Measuring during a render vs analyzing the finished file: measuring during render is fast and requires a second pass to apply, analyzing the file is exact and takes additional time."],
    p: ["Gain that reaches the loudness target but exceeds the true-peak ceiling is rejected or clipped by the delivery platform.", "A measurement that includes silence at the start and end without gating reports a lower loudness than is heard."],
    v: "Normalize a mix to -14 LUFS with a -1 dBTP ceiling, then measure the exported file with an independent meter. The integrated loudness is within 0.1 LU and the peak is under the ceiling.",
    dep: ["offline-render-engine", "gain-staging-and-metering"]
  },
  "stems-export": {
    s: "Renders groups of tracks, such as drums, bass and vocals, as separate full-length files that add up to the final mix when played together.",
    d: "Each stem is rendered by soloing its source group while including the effects that belong to it, including returns and shared processing. The stems must all start at the same sample and have the same length, so they can be re-aligned trivially by a collaborator. Master-bus processing, such as a compressor on the sum, cannot be split exactly, so stems either include the master chain, which breaks summing to the mix, or omit it. Batch rendering reuses the engine and runs the graph once per stem.",
    k: ["Stems with master processing vs without: with master processing each stem sounds finished and they will not sum to the mix, without it stems sum and sound unprocessed.", "Rendering stems sequentially vs in one pass with multiple outputs: sequential is simple and repeats the full render, a single pass saves time and requires graph support for multiple capture points."],
    p: ["Reverb returns left out of the stem they belong to make stems sound dry or leave tails in the wrong file.", "Stems rendered with different start points cannot be lined up without a reference."],
    v: "Export drums, bass and vocal stems with the master chain bypassed, sum them in a new project and null against the master-bypassed mix. The residual is below -90 dBFS.",
    dep: ["offline-render-engine", "buses-and-sends"]
  },
  "real-time-bounce": {
    s: "Records the project's output as it plays at normal speed, used when hardware inserts or external gear in the signal path make offline rendering impossible.",
    d: "Some paths include hardware effects or external synths, reached through audio interfaces, which can only run at real-time speed. The bounce plays the project from start to end through the real device and writes the output to a file, with latency compensation for the external loops. The result depends on the real-time system's behavior, so any dropout in the session ends up in the file. Monitoring the bounce is needed for the entire duration. Hardware that is not perfectly repeatable gives different results each time.",
    k: ["Real-time bounce vs offline rendering: real-time handles hardware and external gear and takes as long as the song, offline is fast and cannot include hardware.", "Capturing hardware returns once and freezing them vs live inserts: freezing makes the project deterministic, and live inserts keep adjustments available."],
    p: ["An xrun during a real-time bounce puts a click into the master and nobody listens to the whole file.", "Unaccounted hardware loop latency places the processed tracks late in the bounce."],
    v: "Bounce a project with a hardware reverb loop in real time, then check the output file for gaps with an embedded counter on a spare channel and verify alignment of the dry and wet paths.",
    dep: ["driver-abstraction", "plugin-delay-compensation", "xrun-handling"]
  },
  "metadata-and-markers": {
    s: "Writes titles, artists, identifiers, chapter markers, loop points and timestamps into the exported files in the formats each container defines.",
    d: "Exports can embed tags, cover art, ISRC codes and chapter or cue markers drawn from the project's marker track. Loop points and tempo information are stored for sample-based use. Different containers store metadata in different structures, with different limits on text encoding and size. The renderer maps project fields to the container fields. Conversions between containers lose metadata that the target cannot hold, so the exporter must report what was dropped. Broadcast files also need timestamps and loudness descriptors.",
    k: ["Writing metadata in the exporter vs a separate tagging step: in the exporter it is atomic with the file, a separate step reuses generic tools and can leave untagged files.", "Project-level fields vs per-export fields: project-level fields are entered once, per-export fields allow variants such as radio edits to carry their own data."],
    p: ["Text with non-ASCII characters is written in the wrong encoding and appears garbled in players.", "Chapter markers are placed in project time and ignore a start offset applied by the export range."],
    v: "Export with a title, an identifier code, cover art and three markers, then read the file with a separate tool. All fields match, markers sit at the right sample positions.",
    dep: ["export-formats", "timeline-model"]
  },
  "driver-abstraction": {
    s: "A uniform interface over the operating system's audio drivers: open a device, set rate and buffer size, start a stream and receive a callback with input and output buffers.",
    d: "Every platform offers one or more audio paths with different latency and sharing properties. The abstraction hides these behind a common set of calls and a single callback signature, and reports capabilities such as supported rates, channel counts and latency. Devices appear and disappear, and rates or buffer sizes may change from the control panel, so the layer emits events the engine must handle by stopping and restarting. It also converts sample formats between the device and the engine. Getting the lowest latency often requires bypassing the shared mixer of the operating system.",
    k: ["A thin common interface vs exposing each driver model's features: a thin interface keeps the engine portable and hides useful capabilities, exposing features gives control and spreads platform code through the engine.", "Callback-driven vs polling streams: callbacks give the lowest jitter and impose the real-time rules on the callback, polling is simpler to write and adds a thread's latency."],
    p: ["A device-change notification delivered on the audio thread tries to tear down the stream it is running on and deadlocks.", "Assuming a requested buffer size is honored leaves the engine with different latency than it shows."],
    v: "Open each supported driver model, play a test tone, and change rate and buffer size while running. The stream restarts cleanly, and the reported buffer size matches the actual callback size.",
    dep: ["device-enumeration", "audio-buffers-and-formats"]
  },
  "device-enumeration": {
    s: "Lists audio and MIDI devices with their channels, supported formats and names, and tracks devices as they are plugged in, removed or renamed.",
    d: "The enumerator queries the operating system for devices, keeps a model of their capabilities and watches for changes. Devices have identifiers that should stay stable across sessions, but some change with the USB port or driver update, so the project stores both an id and a name and matches loosely. When a stored device is missing, projects fall back to a default device or ask the user. Channel names given by the device are shown in the routing interface. Enumerating can be slow or even block with misbehaving drivers, so it runs off the interface thread.",
    k: ["Matching devices by id vs by name: ids are exact and change on reinstall, names survive and collide for identical interfaces.", "Polling for changes vs system notifications: notifications are immediate and platform-specific, polling is portable and delayed."],
    p: ["Two identical interfaces swap roles after a restart, and the whole session's routing is swapped.", "Enumeration on the interface thread freezes the application when a driver hangs."],
    v: "Unplug and replug an interface during a session and confirm the list updates within a second, routing reconnects to the same channels and the project does not lose its assignments.",
    dep: []
  },
  "exclusive-and-shared-modes": {
    s: "Choices between exclusive access to a device for the lowest latency and shared access through the operating system's mixer, which allows several applications at once.",
    d: "In shared mode the system mixer sums every application's audio, converts it to one format and adds its own buffering, so latency is higher and sample rate is fixed by the system setting. In exclusive mode the application talks to the device directly, in its chosen format and with small buffers, and other applications are silenced. Workstations usually default to the lowest-latency path available, and offer shared mode for convenience. Switching modes changes how rate conversion and device clocks work, and what happens if another application wants audio.",
    k: ["Exclusive access vs shared access: exclusive gives low latency and full format control and locks out other programs, shared allows system sounds and other apps and adds delay and conversion.", "Following the system sample rate vs setting the device rate: following avoids conflicts and forces conversion of project audio, setting the rate keeps quality and may interrupt other apps."],
    p: ["A system sound or call app grabs the device when the session pauses, and the workstation cannot reopen it.", "Shared mode at a mismatched sample rate converts everything silently and degrades quality."],
    v: "Measure round-trip latency in each mode and confirm exclusive mode is lower. With a second application playing, shared mode mixes both and exclusive mode reports the device as busy.",
    dep: ["driver-abstraction"]
  },
  "aggregate-devices": {
    s: "Combines several physical interfaces into one virtual device with more channels, resampling or aligning their separate clocks so they behave as a unit.",
    d: "Each interface runs on its own clock, which drifts relative to the others at a few parts per million. The aggregate designates one device as clock master and continuously resamples or buffers the others to match it, which adds latency and can add artifacts. Alternatively all devices are slaved to one external word clock. The aggregator exposes a single stream with the sum of all channels and a common callback. Starting and stopping devices together, and handling one disconnecting, are further problems.",
    k: ["Software drift correction vs shared hardware clock: software correction needs nothing but cables and adds latency and small error, a shared clock is perfect and requires clock inputs on every interface.", "Aggregating inside the operating system vs inside the application: system aggregation works for all programs and is less controllable, application aggregation tunes the correction and works for one."],
    p: ["Two interfaces without drift correction slowly slip out of sync and produce clicks every few minutes.", "Unplugging one interface of an aggregate stops the whole stream."],
    v: "Record a shared tone on two interfaces for two hours through an aggregate and compare the files. The alignment drifts by less than one sample and no clicks occur.",
    dep: ["clock-drift-correction", "sample-rate-conversion", "driver-abstraction"]
  },
  "clock-drift-correction": {
    s: "Compensates for small differences between the rates of independent clocks, such as two devices or a device and a network stream, by resampling or dropping and repeating samples.",
    d: "Two clocks nominally at 48 kHz differ by tens of parts per million, so one produces a sample more than the other every second or so. A drift corrector measures the fill level of a buffer between them or compares timestamps, estimates the ratio with a smoothing filter, and drives a variable-ratio resampler to match. Cruder methods occasionally drop or repeat a sample, which clicks. The control loop must be stable and slow, so the ratio does not wobble and add pitch modulation. It adds a bit of latency as the buffer needs a margin.",
    k: ["Smooth variable-ratio resampling vs dropping and repeating samples: resampling is inaudible and costs CPU, drop and repeat is trivial and produces periodic clicks.", "Fast vs slow control loop: fast reacts to sudden clock changes and modulates pitch, slow is inaudible and recovers slowly from disturbances."],
    p: ["A control loop that responds to buffer jitter instead of average fill makes the ratio oscillate and adds a faint warble.", "Starting the correction before the buffer reaches steady state overshoots and causes a dropout."],
    v: "Feed a 1 kHz tone through two clocks 50 ppm apart for an hour. The corrector holds the buffer fill within bounds, and the output has no clicks and no pitch modulation above 0.01 percent.",
    dep: ["sample-rate-conversion", "ring-buffers"]
  },
  "usb-audio-class-handling": {
    s: "Supports interfaces that follow the standard USB audio class, handling their format descriptors, clock sources, asynchronous transfers and plug-and-play behavior.",
    d: "A class-compliant device describes its formats, rates, channel counts and controls in descriptors, so the operating system's generic driver can talk to it with no vendor software. Audio flows in isochronous transfers on a fixed schedule, with latency that depends on the packet size and the host controller. The device usually provides the clock, with the host adjusting through feedback. The workstation has to read what the generic driver exposes, such as controls and channel names, and handle devices that need a vendor control panel for routing or monitoring.",
    k: ["Class-compliant generic drivers vs vendor drivers: generic drivers work everywhere with no install and offer higher latency and fewer controls, vendor drivers expose low latency and hardware features and need installation and maintenance.", "Asynchronous vs adaptive clocking: asynchronous uses the device's clock for low jitter and requires feedback handling, adaptive follows the host and carries more jitter."],
    p: ["A hub or controller shared with other busy devices causes sporadic dropouts that no buffer setting explains.", "A device that changes its channel count after a firmware or mode switch invalidates stored routing."],
    v: "Connect a class-compliant interface through a hub with other traffic, record a continuous counter signal for an hour, and check the file for gaps. Reported channels and formats match the descriptors.",
    dep: ["driver-abstraction", "device-enumeration"]
  },
  "network-audio-transport": {
    s: "Sends and receives multichannel audio over a local network with tight timing, so interfaces, stage boxes and other computers can be connected by ordinary cables and switches.",
    d: "Audio is packetized in short blocks, often a millisecond or less, and sent with timestamps over UDP-style transport. A shared network clock, distributed by a precision time protocol, keeps all devices on one timeline, so the receiver can place each packet at the exact sample. Redundant paths and small playout buffers absorb jitter. The workstation sees the network as a device with many channels. The network must be configured for priority of audio traffic, and a congested link produces dropouts that are hard to diagnose.",
    k: ["Network clock distribution vs local clock with correction: a network clock gives exact alignment and needs capable switches, local correction works anywhere and drifts and adds buffer latency.", "Small packets vs large: small packets give low latency and high overhead and more sensitivity to jitter, large packets are efficient and add delay."],
    p: ["Sharing the audio network with bulk file transfers causes bursts of dropouts at unpredictable times.", "A switch that does not support the clock protocol makes the devices drift in and out of lock."],
    v: "Stream 64 channels over a switch while loading the network with other traffic, count lost or late packets over an hour, and measure clock offset between endpoints. There are no losses and the offset stays within a microsecond or two.",
    dep: ["clock-drift-correction", "driver-abstraction", "ring-buffers"]
  },
  "realtime-memory-allocation": {
    s: "Memory management for the audio thread: pools and arenas allocated in advance and handed out in constant time, so the callback never calls the system allocator.",
    d: "General-purpose allocators take locks, may request memory from the operating system, and can take unbounded time. The engine instead preallocates buffers, delay lines and node state when the graph is compiled, from pools of fixed-size blocks or bump arenas. Work needing memory runs on non-real-time threads, which hand finished objects to the audio thread through queues. Freed objects return the same way. Memory locked into physical RAM avoids page faults. Memory use at peak must be predicted, because running out on the audio thread has no graceful answer.",
    k: ["Preallocating at graph compile vs allocating lazily: preallocating makes the callback predictable and wastes memory on unused paths, lazy allocation uses less and risks stalls.", "Locking memory in RAM vs normal paging: locking prevents page-fault stalls and reduces memory available to other programs."],
    p: ["Containers that resize on insert, used for convenience in node code, allocate inside the callback under load only.", "Releasing an object on the audio thread runs a destructor that calls the system allocator."],
    v: "Run the engine under a hooked allocator that fails any call from the audio thread through a long session with edits, plugin changes and project loads. No audio-thread allocation is reported.",
    dep: ["threading-primitives"]
  },
  "simd-dsp-kernels": {
    s: "Vectorized routines for the inner loops of audio processing, such as gain, mixing, filters and conversion, written to process several samples per instruction.",
    d: "Operations like adding buffers, applying gain ramps, converting integer to float and running biquad filters dominate CPU time and map well to vector instructions that act on four to sixteen samples at once. Kernels require aligned buffers and block sizes that are multiples of the vector width, with scalar code handling remainders. Different processors support different instruction sets, so the program selects an implementation at start. Results of vector and scalar versions should be identical or the difference documented. Compilers sometimes vectorize automatically, but hand-written kernels give predictable performance.",
    k: ["Hand-written intrinsics vs relying on the compiler: intrinsics are predictable and fast and harder to maintain, compiler vectorization is portable and varies between versions.", "Runtime dispatch by processor features vs one baseline: dispatch uses the best instructions everywhere and multiplies test cases, a baseline is simple and slower on newer chips."],
    p: ["A kernel that reads past the end of a buffer to fill its last vector crashes only on some allocations.", "Different instruction sets give results differing in the last bit, so renders differ between machines."],
    v: "Run each kernel against a scalar reference on random data at every alignment and block size. Output matches within one unit in the last place, and benchmarks show the expected speed-up.",
    dep: ["audio-buffers-and-formats"]
  },
  "audio-file-codecs": {
    s: "Readers and writers for audio file formats, decoding compressed and uncompressed audio into sample buffers and encoding on export, with seeking and metadata access.",
    d: "A codec layer exposes a common interface: open a file, read format information, seek to a sample and read blocks as floating-point samples. Uncompressed containers are simple and seekable at any sample. Lossless codecs need an index of frame offsets for fast seeking. Lossy codecs have encoder delay and padding, which must be removed for sample-accurate placement. Files from untrusted sources can be malformed, so decoders must be hardened. Large files over 4 GB need extended headers.",
    k: ["Decoding on the fly vs converting to an uncompressed working copy at import: on the fly saves disk and costs CPU and seek complexity, conversion costs disk and makes playback trivial.", "Writing own decoders vs using libraries: libraries save effort and carry license and security obligations, own decoders are controlled and cost development time."],
    p: ["Ignoring encoder delay in a compressed file shifts the audio by a thousand or more samples against the grid.", "Files over 4 GB written with a header that cannot represent their size are truncated and unreadable."],
    v: "Import a corpus of files from many formats including malformed ones. Valid files decode to expected samples with correct alignment, and malformed ones are rejected with an error, not a crash.",
    dep: []
  },
  "threading-primitives": {
    s: "The set of thread, atomic and synchronization building blocks the engine uses, chosen so that those touched by the audio thread never block.",
    d: "Standard mutexes and condition variables are acceptable on interface and loader threads, and forbidden on the audio thread. The engine provides atomics with defined memory ordering, wait-free flags, lock-free queues, spin locks with bounded back-off for worker threads and semaphores that the operating system can wake with low latency. Thread creation is wrapped to set priorities, affinities and names. The hard part is that a primitive that looks wait-free may block internally on some platforms, so the engine checks them on each target.",
    k: ["Spin locks with bounded spin vs operating-system mutexes: spin locks wake instantly and waste CPU and can starve under contention, mutexes sleep politely and add wake latency.", "Priority inheritance mutexes vs none: inheritance avoids priority inversion where available and is not provided everywhere."],
    p: ["A mutex taken by an interface thread and by the audio thread causes a stall whenever the interface holds it.", "An atomic type that is not lock-free on the target silently uses an internal lock."],
    v: "On each supported platform, assert that every atomic type used by the engine is lock-free and run a stress test with a tracer that flags any blocking call made from the audio thread. None are found.",
    dep: []
  },
  "settings-and-preferences": {
    s: "Stores user choices such as audio device, buffer size, plugin paths, key commands and interface layout, separate from the project and applied at startup.",
    d: "Preferences are written to a per-user configuration file or registry and loaded before the engine starts, since the audio device settings decide how the engine is built. Some are global, some per project, and some belong to a device or a screen layout. Audio setup is validated on load, because a stored device may no longer exist. Command shortcuts and control-surface mappings are user data, meant to be exported and shared. Corrupt settings must not prevent starting, so there is a safe-mode reset path.",
    k: ["Global settings vs per-project overrides: global settings are consistent across sessions and surprise on shared machines, project-level overrides make sessions self-contained and hide state.", "Applying changes live vs on restart: live changes are convenient and require every subsystem to handle reconfiguration, restart is simple and annoying."],
    p: ["A corrupted settings file that prevents startup requires users to find and delete it by hand.", "Settings saved from a crash-time state store a broken device choice for the next launch."],
    v: "Corrupt the settings file and launch. The application starts with defaults, reports the problem and keeps a copy of the bad file. Change the audio device and confirm it persists across restarts.",
    dep: []
  },
  "logging-and-crash-reports": {
    s: "Records what the engine and plugins did, in a form safe to write from real-time code, and collects diagnostics when the program fails.",
    d: "Interface and loader threads write ordinary log files. The audio thread posts fixed-size messages to a queue, which a background thread formats and writes. Counters for xruns, queue overflows and plugin timings are kept in shared memory. When the program crashes, a handler writes a minidump with a stack trace and recent log entries, and the next launch offers to send it, with the user's consent. Plugin identity is recorded with the report, since a plugin is often at fault. Privacy matters because project and device names may be personal.",
    k: ["Structured binary logs vs text: binary is fast and compact on the audio thread and needs a tool to read, text is readable and costs formatting time.", "Automatic crash report upload vs opt-in: automatic gives developers data and surprises users, opt-in respects privacy and gives fewer reports."],
    p: ["Logging from the audio thread through the normal logger blocks on its lock during a burst of messages.", "Crash reports that omit the list of loaded plugins make most crashes impossible to attribute."],
    v: "Force a crash in a test plugin during playback. The next launch finds a dump naming the plugin and the active project state, and the previous session's log shows the last messages before failure.",
    dep: ["lock-free-queues"]
  },
  "realtime-discipline": {
    s: "The rule that governs the whole program: code that touches the audio thread is written, tested and reviewed under a hard deadline, and everything else is kept away from it.",
    d: "The audio callback has a fixed period, and any wait, allocation or unbounded loop in it is audible. This shapes the whole architecture: the edit model is separate from the engine's compiled plan, communication uses queues, memory is preallocated, plugins are treated as untrusted and decoders live on other threads. The discipline is cultural as much as technical, because a single careless call in one component spoils the guarantee for all. Tooling to detect violations in tests is as important as the rules.",
    k: ["Strict separation of real-time and non-real-time code vs a shared model with locking: separation costs copying and queues and makes behavior predictable, sharing is simpler to write and fails under load.", "Enforcing rules by tooling vs by review: tooling catches violations every build, review is cheap and misses the one that matters."],
    p: ["Real-time violations hide in third-party code, library calls and logging added late, and only appear under load.", "A new feature that adds shared state with a lock passes tests on a fast machine and fails in the field."],
    v: "A continuous integration run plays a stress project with an allocation trap, lock tracer and deadline monitor attached. Any violation or missed deadline fails the build.",
    dep: ["audio-callback", "realtime-safety-rules", "lock-free-queues"]
  },
  "sample-accurate-timing": {
    s: "The decision to count time in whole samples and convert from musical and wall-clock time at defined points, so every component agrees on when something happens.",
    d: "Sound is a stream of samples, and the only exact clock is the sample counter. Positions on the timeline, event offsets, loop points, latency compensation and recorded takes all reduce to integer sample positions. Musical time is converted through the tempo map in one place. Wall-clock time from the operating system is mapped onto the sample clock only at the edges. A consistent policy for rounding prevents drift between components. Without it, bugs show up as slow slips, jitter that varies with buffer size, and renders that differ from playback.",
    k: ["Integer sample positions as the primary unit vs floating-point seconds: integers are exact and avoid accumulating error, seconds are readable and require careful rounding.", "A single conversion point for musical time vs conversions wherever needed: one point keeps rounding consistent, many points are convenient and drift apart."],
    p: ["Different parts of the code rounding the same position differently leave a one-sample offset that appears only at certain tempos.", "Mixing sample rates in positions without conversion places clips at the wrong time after a rate change."],
    v: "Run the same project at three buffer sizes and two sample rates and compare the rendered position of every attack. All land on the same musical positions, and the buffer size has no effect on timing.",
    dep: ["sample-accurate-scheduling", "tempo-map", "event-timestamps"]
  },
  "offline-vs-realtime-determinism": {
    s: "The requirement that an offline render produce the same sound as real-time playback, and that two renders of one project be identical, despite threads, plugins and hardware.",
    d: "Reproducibility needs a fixed summing order, deterministic plugin behavior, seeded random generators, and no dependence on buffer size or wall-clock time. Plugins that use random modulation or depend on host timing break it. Offline rendering usually enables higher-quality modes that real-time playback does not, which is a conscious exception. Users expect that what they mix is what they bounce, so differences must be few and documented. Bit-exact repeatability also makes automated regression testing of the engine possible.",
    k: ["Bit-exact determinism vs perceptual equivalence: bit-exact enables automated comparison and constrains parallel summing and plugin choice, perceptual equivalence is flexible and requires listening to confirm.", "Higher quality offline vs identical to playback: higher quality produces better output and risks surprise, identical output is predictable and wastes available time."],
    p: ["A plugin with free-running random modulation gives a different render each time, and the user cannot reproduce a mix.", "Worker threads summing in completion order produce results that differ by a bit between runs."],
    v: "Render a project five times and compare checksums, then render at several buffer sizes and compare. Outputs match bit for bit, with a short list of documented exceptions.",
    dep: ["summing-and-headroom", "offline-render-engine"]
  },
  "fault-isolation": {
    s: "The principle that a failure in a plugin, a driver or a file must not lose the user's session or stop the audio, achieved by separating processes, recording state and containing errors.",
    d: "Most of the code that runs in a workstation was written by other people: plugins, drivers, codecs. Isolation takes several forms: sandboxing plugins in other processes, scanning in child processes, hardening decoders against malformed files, autosaving, and presenting failures as a failed track, not a dead program. Each form costs something, in CPU, latency or complexity. The decision is how much of the cost to pay for how much safety, and it should be explicit and consistent across all components.",
    k: ["Process isolation for all plugins vs in-process by default: isolation survives any crash and costs CPU and latency, in-process is fastest and loses the session when a plugin fails.", "Failing loudly vs continuing silently: loud failures are noticed and fixed, silent continuation keeps the session going and hides degraded results."],
    p: ["A crash during recording with no isolation loses the take in progress as well as the session.", "Isolation that is only partly applied, for example for effects but not instruments, leaves the same failure mode for the rest."],
    v: "Inject a crash, a hang and a corrupt file in turn into a long session. Audio continues, the failing component is marked, and the project restores to the last autosave without data loss.",
    dep: ["plugin-sandboxing", "plugin-crash-recovery", "autosave-and-backup"]
  },
  "latency-versus-throughput": {
    s: "The trade between how quickly sound responds to a performer and how much processing the machine can fit into each deadline, set by buffer size and plugin choices.",
    d: "Small buffers lower latency and shrink the time available per block, which limits track and plugin counts and makes overhead per block significant. Large buffers allow far more processing and add delay a performer can feel. The same trade shapes parallel execution, sandboxing, stretch quality and compensation. Workflows therefore change modes: recording at small buffers with light processing, then mixing at large buffers with everything on. Architecture decides how painful that change is, whether it can be automatic and what must be re-prepared.",
    k: ["One buffer size for the whole session vs separate record and mix modes: one size is simple and a compromise, separate modes serve each task and require reconfiguring the engine safely.", "Compensating latency everywhere vs leaving armed tracks live: compensation keeps the mix exact and delays the performer, leaving tracks live keeps playing responsive and shifts alignment."],
    p: ["A project built at a large buffer size cannot be played at the small size needed for tracking.", "Latency-heavy plugins added during mixing make the project unusable for later overdubs."],
    v: "Measure the maximum track and plugin count that plays without dropouts at 64, 256 and 1024 samples, and confirm round-trip latency matches each size. The limits scale as expected.",
    dep: ["buffer-size-management", "monitoring-latency-modes", "parallel-graph-execution"]
  },
  "parameter-and-state-ownership": {
    s: "The rule for who owns each piece of state, such as a fader value, a clip position or a plugin setting, and how changes move between the interface, the model and the audio thread.",
    d: "State exists in several copies: the project model, the interface, the compiled graph and the plugin itself. Without a rule about which copy is authoritative, they diverge, and undo, automation, control surfaces and saving each see something different. A common design makes the model authoritative, sends changes to the engine as timestamped messages, and lets the engine report back what it measured, such as meters. Plugins complicate it because they hold state that the host can only see through their interface, and they can change their own parameters.",
    k: ["Model as the single source of truth vs engine as the truth: the model gives simple saving and undo and adds a message hop, the engine holds the truth for plugins and complicates persistence.", "Changes as commands vs as shared values: commands are ordered and traceable and need queues, shared atomic values are quick and lose ordering and history."],
    p: ["Two views changing the same parameter without a single owner cause feedback loops where each overwrites the other.", "A plugin that changes its own state without telling the host leaves saved projects out of date with what was heard."],
    v: "Change one parameter from the mouse, a control surface, automation and the plugin's own editor in turn, and confirm that all views, saved state and undo history agree after each change.",
    dep: ["timeline-model", "lock-free-queues", "parameter-addressing"]
  }
});
