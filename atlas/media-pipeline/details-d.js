// Details for the media pipeline plate, part 4: I/O and containers, data model, devices, cross-cutting concerns.
ATLAS.details("media-pipeline", {
  "protocol-handlers": {
    s: "Modules that open and read or write a named resource over a transport such as a file, HTTP, a real-time streaming protocol or a pipe, presenting it as bytes.",
    d: "A handler matches a resource name by scheme, opens it with options such as headers, timeouts and credentials, and exposes read, optional seek and size. HTTP handlers use range requests to support seeking and keep connections alive; they follow redirects and reconnect on failure. Streaming protocols deliver packets with their own timing instead of a seekable byte stream. Handlers can be stacked, for example decryption over HTTP. The challenges are timeouts that fit both slow and dead servers, and behavior on partial reads, since a short read from a network is normal and must not be taken as end of data.",
    k: ["Seekable range-request reads vs. forward-only streaming: range reads allow random access and resume, while forward-only is simpler and needed for live sources.", "Automatic reconnect on error vs. fail fast: reconnect rides out brief outages, but can hide a dead source for a long time."],
    p: ["Treating a short read as end of file truncates playback on slow connections.", "A missing read timeout leaves the player hanging forever on a server that accepts the connection and sends nothing."],
    v: "Open a remote file, kill the connection mid-read and confirm the handler reconnects with a range request from the right offset, the data continues without duplication and a dead server triggers the timeout error.",
    dep: ["byte-io-layer"]
  },
  "byte-io-layer": {
    s: "A buffered reader and writer over any byte source, giving demuxers and muxers uniform read, seek and write operations with efficient small accesses.",
    d: "Container parsers issue many small reads of a few bytes. The layer buffers larger blocks, tracks the logical position and supports seeking within the buffer when the target is close, or reissues a request when not. Writers use the same layer with a buffer and optional seek-back to patch headers after data is written. A read-ahead thread can fill the buffer in the background. For non-seekable sources, the layer reports that and the demuxer adapts. The hard part is sizing buffers for network latency without blocking small reads for large fetches, and handling errors consistently.",
    k: ["Large read-ahead buffer vs. small: large smooths network jitter and speeds sequential reads, but wastes memory and delays seeks that discard it.", "Seekable output requirement vs. streaming-friendly writing: seeking back to patch headers is simple, but fragmented output avoids it for live and pipes."],
    p: ["A tiny buffer on a network source issues one request per header field and crawls.", "Seeking beyond the buffer without discarding it returns stale bytes from the old position."],
    v: "Parse a file over a source with 200 ms latency and confirm the number of underlying requests stays near file size over buffer size, and seeks inside the buffer cause no new request.",
    dep: []
  },
  "format-probing": {
    s: "Detects the container format of an input and reads enough of it to list its streams, codecs, durations and parameters before playback starts.",
    d: "Probing reads the first bytes and scores each registered format by signature, extension and structure, picking the highest. It then parses headers and decodes a short stretch of data to discover missing details such as frame rate, channel layout or pixel format when the container does not state them. A bounded read size and time stop probing from consuming too much of a slow source. Results feed the pipeline builder. Probing is a tradeoff: more data gives better answers and delays startup; too little yields wrong or missing stream information.",
    k: ["Probe by signature only vs. also by content analysis: signatures are fast and reliable for clear formats, while content analysis handles damaged or headerless data at a cost.", "Larger probe window vs. faster start: a larger window finds late-appearing streams, while a smaller one starts sooner and can miss them."],
    p: ["A file with a prepended junk block fails signature matching and is rejected, though other players open it.", "A probe window too small misses an audio stream that first appears after the first video minute."],
    v: "Probe a set of files in different formats, including truncated and headerless ones, and confirm the detected format and stream list match a reference, with probing time under a stated bound.",
    dep: ["demuxer", "byte-io-layer", "container-metadata"]
  },
  "demuxer": {
    s: "Parses a container and splits it into separate elementary streams of timestamped packets, one per audio, video or subtitle track.",
    d: "The demuxer reads container structures: headers, index, sample tables or interleaved chunks, and emits packets with stream index, timestamps, duration, key frame flag and position. It handles container-specific details such as timestamp wrap, time bases, edit lists and fragmented files. For seeking it uses an index to map time to byte offset. Streams may start at different times. Damaged files require resynchronization. The hard part is the diversity of real files: encoders and tools deviate from the specification in many ways, and a demuxer's practical value is how many odd files it plays.",
    k: ["Index-based seeking vs. scanning: an index gives exact fast seeks, while scanning works for files without an index and is slow on long files.", "Strict specification adherence vs. accommodating known quirks: strict is clean, while accommodating plays real files at the cost of special cases."],
    p: ["Trusting a header duration that does not match the data shows a wrong length and a broken seek bar.", "Timestamp wraparound at 32 bits in a long file makes timestamps jump backward after hours."],
    v: "Demux a corpus of real-world files and confirm packet counts per stream, timestamp monotonicity per stream and total duration match a reference, and seeks to random points land at key frames.",
    dep: ["byte-io-layer", "seek-index", "packet-and-frame-types", "timestamps-time-bases", "container-metadata"]
  },
  "muxer": {
    s: "Interleaves encoded packets from several streams into one container file or stream, writing headers, indexes and timing correctly.",
    d: "The muxer receives packets from the encoders, checks timestamps are monotonic, orders them for interleaving and writes container structures. For files, it may write the index at the end, requiring a seek back to update the header, or at the start for fast progressive start. For streaming, fragmented layouts write self-contained pieces. It records codec configuration, durations, edit lists for priming and padding, and metadata. Constraints include per-stream timestamp offsets and a limit on how far streams may drift apart in the file. A failed write halfway must leave a usable or clearly invalid file.",
    k: ["Index at the end vs. at the start: end is simple to write and fast, while start allows immediate progressive playback and needs a second pass or reserved space.", "Fragmented output vs. one monolithic file: fragments survive crashes and suit live, while monolithic files are simpler for tools that expect a single index."],
    p: ["A crash before the index is written leaves a file that no player can open.", "Non-monotonic timestamps from a filter produce files that play with freezes or are rejected."],
    v: "Mux audio and video, kill the process mid-write and confirm a fragmented output remains playable up to the last fragment, and a completed file's reported duration equals the measured stream length.",
    dep: ["interleaving", "byte-io-layer", "container-metadata", "timestamps-time-bases"]
  },
  "interleaving": {
    s: "Orders packets from different streams so that data needed at about the same playback time is stored and read close together.",
    d: "A file read sequentially must deliver audio and video for the same moment at about the same time, or a reader would need huge buffers or constant seeks. The muxer interleaves by timestamp, within a bound such as half a second, and the demuxer reads in file order. Poorly interleaved files, such as all audio after all video, play fine locally and stall over a network. Sparse streams like subtitles are placed by time. For streaming containers the interleave bound sets the minimum buffering a client needs. The encoder's output timing and the muxer's queue limits determine the result.",
    k: ["Tight interleave vs. loose: tight needs little buffering at the reader and is better for streaming, but requires the muxer to wait for the slowest stream.", "Interleave by decode time vs. by presentation time: decode time matches reading order, while presentation time confuses streams with B-frames."],
    p: ["Audio written minutes after the video it belongs to forces a streaming client to buffer minutes of video to hear a sound.", "A muxer waiting for a sparse stream holds back all other output indefinitely."],
    v: "Analyze an output file and confirm the maximum distance in file order between packets of the same timestamp across streams stays under the configured bound, and a sequential network read plays with a small buffer.",
    dep: ["muxer", "timestamps-time-bases"]
  },
  "seek-index": {
    s: "A table mapping times to byte positions and key frames, so seeking jumps close to the target instead of scanning the file.",
    d: "Containers hold a sample table or a cue list giving, for key frames, timestamp and file offset. The demuxer binary-searches it for the key frame at or before the target. Files without an index get one built by scanning, which can take long on large or remote files, or by bisecting on byte position with timestamp probing. Fragmented and streaming content uses segment lists instead. Index entries are sparse for efficiency, so the target is refined by decoding forward. The issues are indexes that are missing, corrupt or located at the end of a remote file, which delays the first seek.",
    k: ["Dense index vs. sparse: dense seeks precisely and costs size, while sparse is compact and relies on decoding forward.", "Build the index on open vs. lazily on first seek: on open delays start, while lazy makes the first seek slow."],
    p: ["An index at the end of a remote file forces a large initial fetch before playback can start.", "A stale index after editing the file seeks to wrong positions and shows garbage."],
    v: "Seek to one hundred random times in a long file and confirm each lands on a key frame at or before the target, within the index granularity, with latency under the stated bound.",
    dep: ["demuxer", "timestamps-time-bases"]
  },
  "stream-reassembly": {
    s: "Rebuilds complete access units and elementary streams from packetized transport, such as network packets or transport stream cells, using sequence numbers and timing.",
    d: "Network protocols split frames across packets with sequence numbers, a marker for the last packet of a frame, and a timestamp on a media clock. Transport streams multiplex many programs into small cells identified by packet identifiers, carrying tables that describe programs, and clock references. The reassembler orders packets, groups them into frames, detects gaps and passes complete frames with timestamps on to decoders. It maps the timestamp clock to the pipeline clock and handles wraparound. The difficulty is that loss, reordering and clock differences all appear here, and a mistake loses frames or desynchronizes streams.",
    k: ["Wait for missing packets vs. deliver partial frames: waiting preserves frames but adds delay, while partial delivery keeps time and relies on concealment.", "Use the sender's clock reports vs. arrival time: clock reports give accurate timing, while arrival time works without them and carries network jitter."],
    p: ["Treating 32-bit timestamp wraparound as a huge jump makes the stream stall after hours of playback.", "Joining a transport stream mid-program without waiting for tables decodes nothing for several seconds."],
    v: "Feed a recorded packet capture with induced reordering and a 1 percent gap and confirm frames emerge in order with correct timestamps, gaps are reported and no frame is delivered twice.",
    dep: ["protocol-handlers", "timestamps-time-bases", "packet-and-frame-types"]
  },
  "container-metadata": {
    s: "The descriptive data stored in containers: stream parameters, durations, language tags, titles, chapters, cover art, edit lists and encoder delay values.",
    d: "Metadata comes in several layers: stream-level codec configuration, track-level language and role, file-level tags and chapters, and timing adjustments such as edit lists that trim or offset tracks. Players use it to pick tracks, show titles and apply gapless trimming and rotation flags. Different containers and tagging schemes represent the same idea differently, so a mapping layer normalizes keys. Metadata must also be carried through transcoding so it is not lost. Conflicts between container values and values found in the stream need a policy.",
    k: ["Normalize tags into one model vs. keep native keys: normalized is easy for applications, while native keys avoid losing format-specific information.", "Trust container values vs. values from the stream: container values are available early, while stream values are authoritative and found only after decoding."],
    p: ["Dropping the rotation flag during transcoding plays portrait video sideways.", "An edit list ignored by the demuxer shifts audio or shows extra frames at the start."],
    v: "Transcode a file carrying language tags, chapters, rotation and an edit list, and confirm the output reports identical values for each and plays with the same start offset.",
    dep: []
  },
  "packet-and-frame-types": {
    s: "The two core data structures: a packet holds compressed data for one stream, a frame holds decoded pictures or samples, each with timestamps and flags.",
    d: "A packet carries bytes, stream index, decode and presentation timestamps, duration, a key flag and side data. A frame carries references to planes or sample buffers, dimensions or sample count, format, presentation timestamp, color tags, a key and interlace flags and side data. Both are small headers over reference-counted buffers so they can be passed without copying. These types are the contract that every stage uses, so their fields change slowly and carefully. Mistakes in their lifecycle, such as unreferenced buffers or unset timestamps, are the most frequent source of leaks and sync errors.",
    k: ["Small header with shared buffer vs. self-contained copy: shared avoids copies of large data, but requires disciplined ownership and copy-on-write rules.", "Fixed field set vs. extensible side data: fixed fields are simple and fast, while side data carries new information without breaking the structure."],
    p: ["Modifying a frame whose buffer is shared by another stage corrupts that stage's output.", "Leaving the timestamp as an undefined value lets an unrelated stage invent one, causing drift."],
    v: "Run a long transcode under a leak checker and confirm every packet and frame allocated is released, buffer counts return to zero at exit and every frame leaving a decoder has a valid timestamp.",
    dep: ["refcounted-buffers", "timestamps-time-bases", "side-data"]
  },
  "timestamps-time-bases": {
    s: "How presentation and decode times are stored as integers counted in a rational time unit, and how they are converted between streams, filters and containers.",
    d: "Each stream has a time base, a fraction such as one over ninety thousand or one over the sample rate, and timestamps are integer counts of it. Conversion between bases uses exact integer arithmetic with rounding rules. Decode and presentation timestamps differ with B-frames. Streams may start at nonzero times, contain gaps, jump or wrap. Filters that change frame rate or speed must rewrite timestamps. Using floating point accumulates error over hours, and using one base everywhere loses precision for some rates, such as 29.97 frames per second.",
    k: ["Integer ticks in rational bases vs. floating-point seconds: integers are exact and compare reliably, while floats are simpler and drift over long runs.", "Preserve source timestamps vs. regenerate from frame counts: preserving keeps variable rates faithful, while regenerating gives clean constant rates and hides source glitches."],
    p: ["Rounding when converting bases at each stage accumulates into several frames of drift per hour.", "Comparing timestamps from streams in different time bases without conversion reorders packets."],
    v: "Remux a three-hour variable-rate file between containers with different time bases and confirm each packet's time in seconds differs from the source by less than half a tick of the finest base.",
    dep: []
  },
  "side-data": {
    s: "Optional typed attachments on packets and frames carrying information outside the core fields, such as HDR metadata, captions, rotation, motion vectors and encryption info.",
    d: "Side data is a list of typed blobs hanging off a packet or frame. Producers add items, such as a decoder attaching color volume info or caption bytes; consumers read the ones they understand and ignore others. Filters and encoders must decide whether to copy side data to their output. The set of types grows over time without changing the structure. Each type has rules about which stages may modify it and what happens when the frame is scaled or cropped, since some values, such as regions of interest, depend on dimensions.",
    k: ["Pass side data through by default vs. drop by default: passing preserves information but may carry invalid data after a transformation, while dropping is safe and loses captions and HDR tags.", "Typed blobs vs. fields in the frame: blobs extend without changing the interface, while fields are checked and discoverable."],
    p: ["A scaler that copies region side data without rescaling it points at the wrong area.", "A filter that drops side data silently removes HDR tags and captions from the transcode."],
    v: "Pass a frame with HDR, caption and rotation side data through each filter and encoder in the standard graph and confirm each type is preserved, adjusted or deliberately dropped, as documented.",
    dep: ["packet-and-frame-types", "refcounted-buffers"]
  },
  "frame-queues": {
    s: "Bounded queues between stages and threads that hold packets or frames, providing backpressure and decoupling producer and consumer rates.",
    d: "A queue holds a limited number of items measured by count, bytes or duration. A producer blocks, or drops, when it is full; a consumer blocks or reports underrun when empty. Queues support flush operations that discard everything and wake all waiters, used on seek and stop. Separate queues for compressed packets and decoded frames have different cost, since a decoded frame is large and a second of packets is small. Limits are chosen from latency and memory goals. Queue levels are also the main signal for buffering state and sync decisions.",
    k: ["Block when full vs. drop oldest: blocking never loses data and suits files, while dropping keeps live streams current at the cost of lost content.", "Limit by item count vs. by duration: count is simple, while duration keeps memory predictable across variable frame sizes and rates."],
    p: ["A flush that does not wake blocked producers leaves threads stuck during a seek.", "Counting limits on decoded frames at 4K hold gigabytes when the limit was sized for standard definition."],
    v: "Fill a queue to its limit with a stalled consumer, flush it and confirm all waiting threads wake, queue size reads zero and memory returns to the baseline within one frame time.",
    dep: ["packet-and-frame-types", "buffer-pools"]
  },
  "buffer-pools": {
    s: "Preallocated, recycled memory blocks for frames and packets, avoiding allocation on the hot path and bounding total memory.",
    d: "Allocating several megabytes per frame, many times a second, causes fragmentation and latency spikes. A pool creates blocks of a fixed size and format at setup and hands them out; a released buffer returns to the pool instead of being freed. Pools bound memory and make exhaustion visible: if the pool is empty the producer waits, which is backpressure. Hardware surface pools are fixed by the driver. Pool sizes need to cover frames in queues, references held by decoders and frames being displayed. A format change requires a new pool and a drain of the old one.",
    k: ["Fixed-size pool vs. grow on demand: fixed gives predictable memory and exposes sizing errors, while growing never stalls and hides leaks until memory runs out.", "One pool per stage vs. shared pool: per-stage isolates problems, while shared reduces total memory but lets one stage starve another."],
    p: ["A pool smaller than the sum of references, queues and display holds deadlocks the decoder.", "Returning a buffer to the pool while another stage still reads it corrupts the next frame."],
    v: "Run a transcode with pool limits at the calculated minimum and confirm no deadlock, no allocation on the hot path in a profiler, and pool occupancy never exceeds the configured bound.",
    dep: ["refcounted-buffers"]
  },
  "refcounted-buffers": {
    s: "Shared ownership of large memory blocks through a reference count, so stages can hold the same frame without copying and the memory is freed when the last holder releases it.",
    d: "Each buffer has a count of holders. Passing a frame to another stage adds a reference; releasing drops it, and the last release returns the memory to its pool. Writing requires exclusive ownership, so a writer checks whether the buffer is shared and copies if so. This lets a decoder keep a reference picture while the renderer shows it, and a filter pass data through unchanged without a copy. Counts must be atomic for use across threads. The bugs are leaks, which grow memory slowly, and premature release, which corrupts data unpredictably.",
    k: ["Reference counting with copy-on-write vs. always copy: sharing avoids megabytes of copying per frame, but needs discipline about writers and atomic counts.", "Counted handles in the API vs. manual lifetimes: counted handles prevent most mistakes at a small overhead, while manual lifetimes are lean and error-prone."],
    p: ["A missing release on an error path leaks one frame per failure, exhausting the pool after hours.", "Writing to a shared buffer in place changes a reference picture that the decoder still needs."],
    v: "Run a one-hour playback with repeated seeks under a memory checker and confirm live buffer count at the end equals the count at start, and a writer touching a shared frame produces a copy, not a changed original.",
    dep: []
  },
  "camera-capture": {
    s: "Reads video frames from a camera through the operating system's capture interface, handling format selection, frame timing and device controls.",
    d: "The capture source enumerates modes, each with resolution, frame rate and pixel format, often compressed on the camera to fit the bus. It opens the device with a chosen mode, receives frames into driver buffers and stamps them with capture time. Exposure, focus and white balance are device controls, sometimes automatic. The camera's clock differs from the system clock and drifts, so timestamps need correction. Frames can arrive late or be dropped under load, and low light lowers the delivered frame rate as exposure lengthens. Cameras are shared with other applications or exclusive, depending on the system.",
    k: ["Request compressed camera output vs. raw: compressed fits more modes on a bus and costs a decode, while raw avoids a decode and limits resolution and rate.", "Stamp frames at driver delivery vs. at hardware capture: hardware time is accurate but not always available, while delivery time adds scheduling jitter."],
    p: ["Automatic exposure lengthens in a dim room and halves the frame rate while the pipeline assumes a constant rate.", "A device already opened by another application fails with a vague error."],
    v: "Capture ten minutes at 30 frames per second, and confirm frame count, inter-frame spacing and timestamp drift against the system clock are within stated bounds, with no dropped frames at the configured load.",
    dep: ["capture-enumeration", "timestamps-time-bases", "hw-device-context"]
  },
  "microphone-capture": {
    s: "Reads audio samples from an input device in small blocks on the device's clock, with echo, gain and noise processing applied where needed.",
    d: "The capture source opens an input device at a rate and layout, and receives blocks through a callback on a real-time thread, with a few milliseconds per block. It timestamps blocks from the device's stream clock. Processing such as automatic gain, noise suppression and echo cancellation may be applied by the platform or by the application. Buffers are sized to survive scheduling hiccups without adding latency. The device clock drifts relative to others, and exclusive modes bypass system mixing for lower latency. Permissions are required, and hot-unplugging a headset must not crash the callback thread.",
    k: ["Small blocks for low latency vs. larger blocks for stability: small gives responsive calls and risks glitches, while larger tolerates scheduling jitter and adds delay.", "Platform processing vs. application processing: platform processing is tuned to the hardware, while application processing is consistent across devices."],
    p: ["Allocating memory in the real-time callback produces occasional dropouts that vanish under a debugger.", "Capture running at a rate different from the pipeline's assumed rate gives pitch-shifted audio."],
    v: "Record a reference tone for an hour and confirm sample count matches elapsed time within the drift bound, no dropouts are logged, and unplugging the device produces a clean error and stop.",
    dep: ["capture-enumeration", "drift-correction", "audio-filters"]
  },
  "screen-capture": {
    s: "Captures the display or a window as video frames, with cursor, damage tracking and, where possible, direct GPU access to avoid copies.",
    d: "The operating system exposes the composed desktop as surfaces. The capture source requests frames at a target rate, often receiving a frame only when the content changes, so a still screen produces few frames and the pipeline must repeat the last frame to keep a constant rate. Damage regions allow encoders to code only what changed. Capture from the GPU keeps frames in device memory for hardware encoding. Cursor can be captured separately and composited. Permissions, protected content and multi-display layouts with different scales complicate it. Variable frame delivery is the main timing issue.",
    k: ["Capture on change vs. fixed rate: on change saves effort for static screens, while fixed rate is easy for downstream stages and wastes work.", "GPU capture vs. CPU readback: GPU keeps frames on the device for zero-copy encoding, while readback is portable and costs bandwidth at high resolution."],
    p: ["A static screen yields no frames, and the encoder or the viewer reports a stalled stream.", "Capturing across displays of different scale factors blurs or crops one of them."],
    v: "Capture a screen showing a moving timer and then a static desktop, and confirm the output rate stays constant by repeating frames, the timer advances correctly and CPU use stays within the stated budget.",
    dep: ["capture-enumeration", "zero-copy-surfaces", "timestamps-time-bases"]
  },
  "capture-enumeration": {
    s: "Lists available cameras, microphones, displays and their supported modes, and reports when devices appear or disappear.",
    d: "The component queries the operating system for devices with stable identifiers, human-readable names and supported formats: resolutions, frame rates, sample rates and layouts. It also watches for hot-plug events and default-device changes, such as a headset connecting. Applications present choices and store the selected identifier, which must survive reboots. Some devices lie about their capabilities or report modes that fail to open, so enumeration may include test opens. Privacy permissions gate enumeration, and a device list can be empty until access is granted.",
    k: ["Stable device identifier vs. index in the list: identifiers survive reordering and reboot, while indexes change when devices are added.", "Follow system default device vs. pin a device: following keeps audio working when headsets connect, while pinning avoids surprises mid-call."],
    p: ["Storing a device by list position selects the wrong microphone after plugging in a headset.", "Names that include user-specific text may leak into logs and diagnostics."],
    v: "Plug and unplug a headset during an active call and confirm the device list updates within a second, the pipeline switches or reports correctly, and stored preferences select the same device by identifier next launch.",
    dep: []
  },
  "video-renderer": {
    s: "Presents decoded frames on the display at the right time, scaling and converting them to the output surface and dropping or repeating frames to match the display rate.",
    d: "The renderer receives frames with presentation times and waits until the clock reaches each, then submits the frame to the display system for the next refresh. It scales to the window, applies color conversion and tone mapping, and composites overlays and subtitles. It uses GPU surfaces to avoid copies. When content rate and refresh rate differ, such as 24 frames per second on a 60 hertz display, frames are shown for uneven times, which produces judder unless the display switches rate. Statistics of dropped, late and repeated frames come from here.",
    k: ["Match display refresh to content rate vs. repeat frames unevenly: matching gives smooth motion but needs display control, while uneven repetition works everywhere and judders.", "Render on a dedicated thread vs. the interface thread: dedicated avoids interface stalls affecting playback, while the interface thread is simpler and shares window state."],
    p: ["Presenting on the interface thread lets a slow menu redraw drop frames.", "Scaling to the window every frame without caching the filter state wastes GPU time on large windows."],
    v: "Play a frame-counter test clip for ten minutes and confirm every frame number appears on screen for the expected number of refreshes, with no skipped numbers and the dropped-frame counter matching observation.",
    dep: ["display-sync", "scaler", "overlay-compositor", "tone-mapping", "media-clock"]
  },
  "audio-output-device": {
    s: "Delivers audio samples to speakers or headphones through a hardware device that pulls blocks on its own clock, with a small buffer that must never run dry.",
    d: "The device runs on a hardware clock and requests blocks through a callback on a real-time thread, or the application pushes into a ring buffer. The buffer size sets latency and underrun risk. Shared mode mixes with other applications and resamples to the system format; exclusive mode bypasses mixing for lower latency. The device reports how many samples are queued, which lets the pipeline compute exactly what is being heard and anchor the media clock. Underruns cause clicks, so the feeder thread has to be prioritized and the callback must be lock-free.",
    k: ["Large buffer vs. small buffer: large survives scheduling hiccups and adds delay, while small gives responsive playback and risks audible underruns.", "Pull callback vs. push with ring buffer: callback gives the tightest timing, while a ring buffer decouples threads at a small added delay."],
    p: ["Blocking or allocating in the callback causes crackling under CPU load.", "Ignoring the device's reported queue length makes the media clock run early by the buffer size."],
    v: "Play a continuous tone at high CPU load for an hour and confirm no underruns are recorded, the recorded loopback has no gaps, and the media clock position matches loopback time within the buffer size.",
    dep: ["resampler", "channel-layouts-mixing", "media-clock", "pipeline-thread-model"]
  },
  "output-latency-compensation": {
    s: "Accounts for the fixed delay between handing samples or frames to an output device and the user seeing or hearing them, so picture and sound line up.",
    d: "Audio passes through system buffers, device buffers and, for wireless links, encoding and transmission, adding from a few to hundreds of milliseconds. Displays add processing delay, especially in game-unfriendly modes with heavy image processing. The player asks the system for its latency estimate, or lets the user calibrate with a test pattern, and shifts the video or audio presentation so they coincide at the viewer. Latency changes when the output device changes, so it is recalculated on route changes. Reported values are often wrong, which is why manual offset exists.",
    k: ["Use reported latency vs. user calibration: reported is automatic and often inaccurate, while calibration is exact for one setup and must be repeated per device.", "Delay video to match audio vs. advance audio: delaying video is easy by holding frames, while advancing audio is impossible without dropping the start."],
    p: ["Switching from speakers to wireless headphones mid-playback without updating latency leaves lips ahead of sound.", "Applying the compensation twice, in both the sink and the sync logic, doubles the shift."],
    v: "Play a flash-and-beep clip on each output route, measure the delay between flash and sound with a camera and microphone and confirm the compensated offset is within the stated tolerance for each route.",
    dep: ["audio-output-device", "av-sync", "display-sync"]
  },
  "display-sync": {
    s: "Aligns frame presentation with the display's refresh cycle, avoiding tearing and uneven frame timing, and adapting to variable refresh where available.",
    d: "Displays refresh at fixed intervals. Presenting a frame mid-scanout tears the picture, so frames are queued and swapped at the vertical blank. Content at 24, 25, 30 or 60 frames per second on a 60 hertz display requires either uneven repetition or a refresh rate switch. Variable refresh displays let the application time presentation precisely. The renderer estimates refresh timing from presentation feedback and sets the presentation target ahead of time to account for the pipeline depth. Queue depth trades latency against smoothness: a deeper present queue hides spikes and adds delay.",
    k: ["Wait for vertical blank vs. present immediately: waiting prevents tearing and adds up to a frame of delay, while immediate is lowest latency and tears.", "Switch the display refresh rate vs. resample motion: switching gives exact cadence but may blank the screen briefly, while resampling hides judder at a quality cost."],
    p: ["Estimating refresh from a single sample causes frame timing errors when the display is actually 59.94 hertz.", "A present queue left at three frames adds fifty milliseconds to every interaction."],
    v: "Play a 24 frames per second panning clip on a 60 hertz display, record the screen with a high speed camera and confirm no tearing and the expected uneven cadence, or an even cadence when the refresh rate switches.",
    dep: ["media-clock", "frame-queues"]
  },
  "time-model": {
    s: "The decision about how time is represented, which clock leads and how timestamps are rewritten, shaping every stage that moves or presents media.",
    d: "Every stream has its own time base and may start at a different offset. The design chooses integer rational timestamps, a presentation and a decode time, one master clock, and a rule for what happens when sources run on foreign clocks, such as capture devices and networks. Each stage that changes rate, delays data or inserts gaps must rewrite timestamps consistently. Changing this later is costly because timestamps appear in every packet, frame, queue and diagnostic. Drift, wraparound, discontinuities and leap handling are decided here and affect every layer from capture to render.",
    k: ["Audio-master clock vs. system-master clock: audio-master keeps sound continuous and adapts video, while system-master suits sources with no audio and lets audio drift.", "Timestamps carried end to end vs. regenerated per stage: carried preserves variable timing, while regenerated gives clean constant rates and hides source errors."],
    p: ["A stage that invents timestamps from frame counts silently breaks variable frame rate sources.", "No rule for discontinuities leaves each stage guessing, and playback freezes or races at splice points."],
    v: "Run a transcode and live playback with timestamp wraparound, a forced discontinuity and a clock drift of 100 parts per million, and confirm output timestamps are continuous and sync stays within the target.",
    dep: ["timestamps-time-bases", "media-clock", "drift-correction", "av-sync"]
  },
  "buffer-ownership": {
    s: "The rules for who may read, write, keep and release each buffer, and how large frames travel without copies yet without being overwritten.",
    d: "Frames are large and arrive at high rates, so copying is expensive and allocating is slow. The design chooses reference counting, pooled memory, a copy-on-write rule and an owner for hardware surfaces. It decides how long a decoder may hold references and how a renderer returns a displayed frame. These decisions determine memory use, latency and the class of bugs: leaks, use after release and shared writes. They also decide whether zero-copy between hardware stages is possible, and every filter's contract depends on them.",
    k: ["Shared immutable frames with copy-on-write vs. exclusive handoff: sharing allows fan-out to many consumers, while exclusive handoff is simpler and forces copies for branching.", "Bounded pools vs. unbounded allocation: pools expose sizing mistakes early and cap memory, while unbounded hides them until memory runs out."],
    p: ["A filter writing in place on a shared frame corrupts the output of an unrelated branch.", "Pool sizes calculated for one resolution exhaust at another after a mid-stream change."],
    v: "Run branching graphs, seeks and format changes for hours under a leak checker and buffer-poisoning mode and confirm no use-after-release, stable memory and pool usage within the calculated bound.",
    dep: ["refcounted-buffers", "buffer-pools", "zero-copy-surfaces", "packet-and-frame-types"]
  },
  "latency-vs-quality": {
    s: "The system-wide trade between delay and compression efficiency or smoothness: every buffer, look-ahead and reorder depth buys quality at the price of latency.",
    d: "Playback of stored content can buffer seconds, use B-frames, long look-ahead and frame threading. Live broadcast uses a few seconds, and calls and remote control use under half a second, which removes look-ahead, reordering, deep queues and large jitter buffers. The same pipeline is configured differently for each, and the settings interact: one stage left at defaults undoes the work of the others. The choice also changes resilience, because less buffering means less room to absorb network variation and slow frames.",
    k: ["One pipeline with profiles vs. separate pipelines per use: profiles share code and tests, while separate pipelines let each be tuned without compromise.", "Budget latency per stage vs. measure end to end only: budgets locate the guilty stage, while end-to-end measures what users experience and hides the cause."],
    p: ["Reusing the stored-content profile for a call adds a second of delay from default queues alone.", "Optimizing delay without measuring stalls trades a smaller number for a worse experience."],
    v: "Measure glass-to-glass delay and stall rate for each profile on the same network trace and confirm each meets its stated delay target with stall rate under its limit.",
    dep: ["low-latency-mode", "buffering-watermarks", "b-frame-reordering", "frame-queues", "jitter-buffer"]
  },
  "format-contracts": {
    s: "The agreement on how stages describe and exchange media: formats, tags, negotiation and who converts when two stages disagree.",
    d: "Every link carries a format, and the whole system depends on those descriptions being complete and honest: pixel layout, color tags, sample format, time base, side data. The design decides which fields are mandatory, what defaults apply when a stream omits them, who inserts conversions and how a mid-stream change is announced. A looser contract accepts more input and hides more bugs; a stricter one fails early. These rules are what let independent authors write elements that compose, and what keeps a color or channel-order mistake from showing up only on one device.",
    k: ["Strict formats that fail on mismatch vs. automatic conversion: strict surfaces mistakes, while automatic conversion plays more content and hides expensive paths.", "Defaults for missing tags vs. refuse untagged input: defaults play old files, while refusal avoids wrong colors that look plausible."],
    p: ["Missing color tags guessed differently by two stages produce different colors in preview and output.", "A contract that omits channel order makes surround content swap speakers only for some sources."],
    v: "Feed a matrix of formats, tagged and untagged, through the pipeline and confirm every combination either plays with the documented result or fails with a message naming the field that caused it.",
    dep: ["format-negotiation", "pixel-formats", "color-spaces", "sample-formats", "side-data"]
  },
  "hardware-variance": {
    s: "The fact that decoders, encoders, GPUs and displays differ in capability, quality and bugs, so one design must run correctly on many device classes.",
    d: "Hardware decoders support different profiles and sizes, hardware encoders differ in quality, drivers have bugs and limits on sessions and memory, and displays have different refresh rates and color capabilities. The design chooses how to detect capabilities, how to rank paths, when to fall back and how to test the matrix. A device lab, blocklists and per-device quality measurements are part of the system, not an afterthought. Software paths provide a baseline that behaves the same everywhere at a higher cost in power and compute.",
    k: ["Probe and adapt at runtime vs. ship a device database: runtime probing adapts to new devices, while a database encodes hard-won knowledge about misreporting drivers.", "Lowest common denominator output vs. best path per device: common output is predictable and simpler to test, while best path gives quality and battery life on capable devices."],
    p: ["A path tested on three models fails on the fourth, and the failure appears only in field telemetry.", "Blocklists never updated leave users on broken paths after drivers are fixed, or on removed fallbacks."],
    v: "Run the playback and encode conformance suite on each device class in the lab and confirm output checksums or quality scores meet the stated limits, with every failure mapped to a blocklist entry or a bug.",
    dep: ["hw-capability-probe", "software-fallback", "hw-device-context", "plugin-registry"]
  },
  "failure-policy": {
    s: "The decision about what each stage does with bad input, late data and device loss: conceal, skip, retry, rebuild or stop with a message.",
    d: "Real media is damaged, networks drop, devices disappear and decoders hang. The design assigns each failure a response and a layer to make it: concealment in the decoder, retry in the source, rebuilding by the pipeline, a message by the player. It also decides what a viewer sees, such as a frozen frame, a lower rendition or an error, and what telemetry records. Consistent policy prevents two layers retrying the same failure and prevents silent damage. It must be decided early because every stage needs clear error codes and clean teardown paths.",
    k: ["Fail fast with a clear error vs. degrade and continue: failing is honest and simple to diagnose, while continuing keeps the experience and can hide a persistent defect.", "Recover at the lowest layer vs. escalate to the player: low-layer recovery is fast and local, while escalation allows smarter choices such as changing rendition."],
    p: ["Two layers each retrying a failed read multiply the delay before an error is shown.", "A decoder that swallows errors hides a corrupt source until viewers complain."],
    v: "Inject corrupt data, a dropped connection, a decoder hang and a device removal one at a time and confirm each produces the documented viewer-visible behavior, one diagnostics event and no leaked threads or devices.",
    dep: ["error-concealment", "stall-recovery", "bitstream-resync", "loss-recovery", "software-fallback"]
  },
});
