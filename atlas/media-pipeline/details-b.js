// Details for the media pipeline plate, part 2: pipeline graph, clocks and threads, resilience, video processing.
ATLAS.details("media-pipeline", {
  "pipeline-graph": {
    s: "The directed graph of processing elements and the links between their ports, built from a description and owning the data path from source to sink.",
    d: "Elements are nodes with typed input and output ports; links connect an output to an input after both agree on a format. The graph may be a simple chain for playback or branch for transcoding to several outputs and for playing audio and video from one source. A builder constructs it from a description or by automatically choosing elements that can bridge the source format to the sink. Ownership of the graph, error propagation and orderly shutdown are central. The hard part is that elements come from different authors, so the contract must be tight enough to compose and loose enough to extend.",
    k: ["Explicit hand-built graph vs. automatic assembly: explicit is predictable and debuggable, while automatic handles unknown inputs but may select a surprising or slow path.", "Fixed chain vs. general graph: a chain is simple and fast to reason about, but cannot split to several outputs or merge streams."],
    p: ["Automatic assembly picking a software element where hardware was available makes performance depend on registry order.", "Leaving an unlinked output port causes the producer to block forever on a full queue."],
    v: "Build a graph from a source with audio and video to two sinks, dump its structure and confirm every port is linked, each link shows its agreed format, and data reaches both sinks with no stage blocked.",
    dep: ["source-filter-sink", "format-negotiation", "plugin-registry"]
  },
  "source-filter-sink": {
    s: "The three roles of an element: sources produce data, filters transform it, and sinks consume it, defining what each may do and which threads it uses.",
    d: "A source creates buffers from a file, network or device. A filter reads buffers and writes transformed buffers; decoders, converters and encoders are filters with different input and output types. A sink delivers buffers to a screen, speaker, file or network and is usually where timing is enforced. Each role has a small interface: configure, process, flush, and report latency. Keeping the contract narrow lets elements be reused in many graphs. Filters differ in whether they are one-in-one-out, buffer several inputs, drop frames or emit several outputs for one input.",
    k: ["Narrow element interface vs. rich per-element capabilities: narrow composes and tests easily, but forces stateful or special cases into generic hooks.", "Sinks that enforce timing vs. a separate scheduler: timing in sinks is simple and local, but a scheduler gives global control at the cost of more coupling."],
    p: ["A filter that buffers frames without declaring its latency makes sync off by the buffered duration.", "A filter that holds frames beyond flush leaks stale pictures after a seek."],
    v: "Insert a pass-through filter and a delaying filter in a test graph and confirm the first passes data unchanged with zero added latency, while the delaying one reports its latency and sync compensates for it.",
    dep: ["pipeline-graph", "packet-and-frame-types"]
  },
  "push-pull-scheduling": {
    s: "The model deciding who drives data flow: upstream elements pushing buffers downstream as produced, or downstream elements pulling them when ready.",
    d: "In push mode a source thread produces buffers and each element hands them to the next; it suits live and network sources that cannot be paced. In pull mode a sink or downstream element requests data at a given position, which suits file sources and random access such as seeking and editing. Many graphs mix both: pull from a file, push after the demuxer. Queues between threads decouple the two. Pull makes backpressure natural, while push requires bounded queues or the producer runs ahead without limit. Mode changes during the state transition and must be negotiated.",
    k: ["Push vs. pull driving: push works for live data and keeps latency low, while pull gives precise control for random access at the cost of requiring seekable sources.", "Bounded queues between threads vs. unbounded: bounded gives backpressure and limited memory, but a stalled consumer blocks producers and can deadlock a cycle."],
    p: ["An unbounded queue behind a slow renderer grows without limit until the process runs out of memory.", "Two elements each waiting on the other to pull or push deadlock the graph at state change."],
    v: "Pause the sink of a push pipeline fed by a fast source and confirm memory use plateaus at the configured queue bounds and the source blocks or drops according to policy, then resume and see recovery without loss.",
    dep: ["pipeline-graph", "frame-queues", "pipeline-thread-model"]
  },
  "format-negotiation": {
    s: "The process by which linked elements agree on a concrete media format: codec, resolution, pixel format, sample rate and layout, within what each can accept.",
    d: "Each port advertises a set of capabilities, often as ranges and lists. When linked, the framework intersects them, asks upstream and downstream to narrow in turn and fixes a concrete format. If no common format exists the framework looks for a converter element to insert, or fails. Queries let an element ask what downstream could accept before choosing its output. Negotiation can repeat on a change such as a mid-stream resolution change or a different audio layout. Cost matters: each inserted conversion burns CPU and memory bandwidth, so preference order is part of the contract.",
    k: ["Upstream decides vs. downstream decides: upstream knows what the source holds, while downstream knows what the device can show; usually the sink's constraints win.", "Automatic converter insertion vs. fail on mismatch: insertion gets playback working, but hides expensive hidden conversions that explicit failure would reveal."],
    p: ["Preferring the first compatible format may choose an unnecessary conversion where an identical format was possible with reordering.", "Renegotiating mid-stream without flushing leaves frames of the old format in a queue that a new-format stage rejects."],
    v: "Link a decoder emitting one pixel layout to a sink accepting another, dump the negotiated result and confirm exactly one converter was inserted, then link a matching sink and confirm none was.",
    dep: ["pipeline-graph", "pixel-formats", "sample-formats", "hw-capability-probe"]
  },
  "graph-lifecycle": {
    s: "The ordered state transitions of the graph, from empty to ready to running and back, and the rules for who does what at each step.",
    d: "States commonly run from null through ready and paused to playing. Moving up allocates resources: open devices, allocate pools, start threads and, in the paused state, preroll so the first buffers sit ready at the sinks. Moving down reverses the order and must release everything, including blocked threads. Transitions can be asynchronous: a network source may take seconds to reach ready, and the application learns of completion through a message. Errors during a transition roll back to a safe state. The hard part is teardown ordering and not hanging on a thread that waits for something already freed.",
    k: ["Preroll before playing vs. start immediately: preroll makes start instant and synchronized, but costs memory and time before the first play.", "Asynchronous transitions with messages vs. blocking calls: asynchronous keeps the interface responsive, but pushes completion tracking onto the application."],
    p: ["Stopping a graph from inside a callback on one of its own threads deadlocks on a join.", "Leaving a device open on a failed transition keeps a camera or audio device busy for other applications."],
    v: "Cycle a graph through all states one hundred times and confirm file handles, threads and memory return to the starting counts every time, and a forced error in the middle transition leaves no device open.",
    dep: ["pipeline-graph", "buffer-pools", "pipeline-thread-model"]
  },
  "dynamic-reconfiguration": {
    s: "Changing a running graph without stopping it: swapping a decoder, adding a branch, switching a track or adapting to a mid-stream format change.",
    d: "Some streams change parameters in the middle, such as a new resolution after an ad insertion or a rendition switch. The graph handles this by blocking a link, draining or flushing what is in flight, inserting or replacing elements, renegotiating and unblocking. Applications also add recorders or remove outputs live. The key mechanism is a safe point where no buffer is mid-processing, usually between frames, and a marker in the stream that tells downstream stages a new configuration follows. It is difficult because stages hold state, and a stage replaced early can lose frames or break reference chains.",
    k: ["Rebuild the affected branch vs. restart the whole graph: branch rebuild is seamless but needs correct draining logic, while restart is simple but visible to the viewer.", "In-band format change markers vs. out-of-band commands: in-band stays ordered with the data, while out-of-band is simpler but races with buffers in flight."],
    p: ["Replacing a decoder before it outputs its last frames drops the final frames of the old configuration.", "A downstream element that caches negotiated format keeps using it after the stream changes, producing garbled pictures."],
    v: "Play a stream that changes resolution mid-way and confirm the renderer switches size at exactly the timestamp of the change, no frame is dropped or repeated at the boundary and audio continues unbroken.",
    dep: ["format-negotiation", "pipeline-graph", "frame-queues", "bitstream-parameter-sets"]
  },
  "plugin-registry": {
    s: "The catalog of available elements, codecs and protocols, each with its capabilities and a rank, from which graphs are assembled.",
    d: "Built-in and add-on modules register their elements with the formats they accept and produce and a priority. Lookups ask for an element able to handle a given format and return candidates in rank order, so hardware decoders can outrank software ones and a trusted implementation can outrank a new one. The registry can be populated lazily so that startup does not load every module. It also records dependencies and licenses. The difficulty is trust and predictability: an add-on can change behavior of every application, and ranking conflicts are hard to diagnose.",
    k: ["Static ranks vs. runtime probing: static ranks are predictable, but probing selects what actually works on the device at the cost of startup time.", "Loading all modules at start vs. on demand: eager loading is simple and fast at use, while lazy loading shortens startup but defers failures."],
    p: ["A broken add-on that registers at high rank for a common format makes every playback fail.", "Two modules claiming the same format with equal rank give nondeterministic selection between runs."],
    v: "List elements for one format with their ranks, disable the top-ranked one and confirm the next is chosen with a successful play, and the diagnostic output names the element that was selected and why.",
    dep: ["hw-capability-probe", "software-fallback"]
  },
  "media-clock": {
    s: "The single running timeline against which every stream's presentation timestamps are compared, deciding when each frame or audio block should be shown or played.",
    d: "A clock maps real elapsed time to media time. The pipeline picks a master: commonly the audio device clock, since audio hardware consumes samples at a steady rate and gaps are audible; otherwise the system clock or an external source. A running time is computed as clock time minus the time playback started, plus adjustments for pause and rate. Sinks wait until the clock reaches a buffer's timestamp before presenting it. The challenge is that different devices have clocks that run slightly differently, so the master must be chosen deliberately and others slaved to it.",
    k: ["Audio device as master vs. system clock as master: audio-master keeps sound continuous and drops or repeats video, while system-clock master is simple but lets audio glitch.", "One clock for the whole graph vs. per-branch clocks: one clock keeps everything in step, but captures and network streams on foreign clocks need separate translation."],
    p: ["Using wall-clock time while the machine sleeps jumps the position by the sleep duration on resume.", "Switching master clocks mid-play without rebasing shifts all timestamps and freezes video for a moment."],
    v: "Log the clock against the audio device's reported sample position for an hour and confirm the difference stays bounded by the correction logic, with no step discontinuities beyond one audio buffer.",
    dep: ["timestamps-time-bases", "audio-output-device"]
  },
  "av-sync": {
    s: "The policy that keeps picture and sound aligned, by delaying, dropping or repeating video frames relative to the audio clock.",
    d: "For each decoded video frame the renderer compares its timestamp to the clock. If the frame is early, it waits; if late by more than a threshold, it is dropped to catch up; if only slightly late, it is shown immediately. People notice sound that leads picture by a few tens of milliseconds, and sound that lags is tolerated slightly more. Audio is rarely adjusted because discontinuities are audible. The policy includes output latency of each device, which differs between speakers, wireless headphones and displays. Hard cases are heavy load, where drops cascade, and streams with inconsistent timestamps.",
    k: ["Drop late video vs. show everything late: dropping restores sync but loses frames, while showing late keeps motion intact but drifts from the sound.", "Fixed sync tolerance vs. adaptive: fixed is simple, while adaptive reduces needless corrections on noisy sources but is harder to tune."],
    p: ["Ignoring wireless audio latency leaves lips visibly ahead of sound by hundreds of milliseconds.", "Dropping frames by arrival time rather than timestamp drops reference frames that later frames need, spreading the damage."],
    v: "Play a clip with a flash and beep at known timestamps and measure with a camera and microphone, or an instrumented renderer, that picture and sound are within the target tolerance over the full length.",
    dep: ["media-clock", "output-latency-compensation", "video-renderer", "drift-correction"]
  },
  "drift-correction": {
    s: "Compensates for the small rate differences between clocks, such as capture and playback devices or sender and receiver, before they accumulate into audible or visible errors.",
    d: "Two clocks nominally at the same rate differ by tens of parts per million, which becomes a frame of difference in minutes. The corrector measures the offset between source timestamps and the local clock, estimates the rate difference and applies it slowly: resampling audio by a tiny ratio, adjusting capture timestamps or repeating or dropping a rare video frame. Corrections are limited in speed so they are inaudible. For networked sources it also runs against sender clock reports. The difficulty is separating drift from jitter, where a noisy measurement could cause the correction to chase noise.",
    k: ["Resample audio slightly vs. skip or repeat samples: resampling is inaudible but costs compute, while skipping is cheap but produces clicks for a continuous tone.", "Filter measurements heavily vs. react quickly: heavy filtering ignores jitter but is slow to follow a real change in rate."],
    p: ["Reacting to jitter as if it were drift makes pitch wobble on a congested network.", "Letting the buffer grow without correction eventually adds seconds of delay to a live call."],
    v: "Feed a stream from a source clock offset by 100 parts per million for two hours and confirm buffer fill and A/V offset remain within bounds with no audible glitches, and the correction ratio converges near the true offset.",
    dep: ["media-clock", "resampler", "jitter-buffer"]
  },
  "jitter-buffer": {
    s: "Holds incoming packets briefly to restore order and even out irregular arrival times, so playout is steady at the cost of added delay.",
    d: "Packets from a network arrive late, out of order or duplicated. The buffer sorts by sequence number or timestamp, waits a target delay before releasing each, and discards those that arrive too late. The delay adapts: it grows when arrival variation increases and shrinks when it calms, ideally during silence for audio. A target of tens to a couple hundred milliseconds is common for calls. For video, the buffer also detects missing packets and requests retransmission within the allowed delay. Hard parts are choosing the delay quickly and avoiding audible time stretching during adaptation.",
    k: ["Fixed delay vs. adaptive delay: fixed is predictable, while adaptive saves latency on good networks and survives bad ones but can change playback speed audibly.", "Wait for a late packet vs. conceal and move on: waiting preserves content but stalls everything behind it, concealment keeps time but loses data."],
    p: ["A target delay set from the worst observed spike keeps latency high long after the network recovered.", "Dropping late packets without informing the decoder causes it to treat the gap as corrupt data."],
    v: "Send a packet stream through an emulator with 50 ms jitter and 3 percent reordering, and confirm output is in order, late-discard rate stays under the target, and delay returns to baseline after the jitter stops.",
    dep: ["stream-reassembly", "media-clock", "loss-recovery"]
  },
  "buffering-watermarks": {
    s: "The thresholds on queued media that start playback, pause it for rebuffering or let the source fetch faster, balancing startup time against stalls.",
    d: "A player buffers a minimum amount before starting, buffers more to ride out network dips and stops fetching when a high mark is reached to bound memory and data use. If the buffer falls below a low mark, playback pauses and enters buffering until it recovers. Marks are expressed in time, not bytes, since bitrates vary. Different sources want different values: local files need almost none, live streams need as little as possible, and mobile data users want to avoid downloading content they may never watch. Tuning is a direct trade of startup delay for resilience.",
    k: ["Large buffer vs. small buffer: large rides out outages but delays startup and wastes data on abandoned views, while small starts fast but stalls on any dip.", "Resume at the low mark vs. at a higher resume mark: resuming early stalls again quickly, while a higher mark pauses longer but gives lasting playback."],
    p: ["Measuring the buffer in bytes makes variable-rate content stall during high-bitrate scenes.", "Resuming exactly at the stall threshold produces rapid stall and resume cycles."],
    v: "Cut the network for the length of the buffer minus a margin and confirm playback continues without a stall, then cut longer and confirm exactly one stall that ends once the resume mark is reached.",
    dep: ["frame-queues", "abr-algorithm", "player-state-machine"]
  },
  "frame-threading": {
    s: "Decodes several consecutive frames at the same time on different threads, each waiting only on the parts of its reference frames it needs.",
    d: "Frame-level parallelism lets frame N+1 start before frame N finishes, as long as the region it references is already reconstructed. Threads report progress, row by row, and dependents wait until enough rows are ready. It scales with core count for streams with many frames and adds latency of several frames, because output order must be preserved and frames finish in a pipelined way. Decoders and encoders using it need thread-safe reference handling. The difficulty is correctness: bugs appear as rare corrupted rows, and the added output delay hurts interactive uses.",
    k: ["Frame threads vs. slice threads: frame threading scales further for ordinary streams but adds frames of delay, while slice threading keeps latency low but needs the stream to contain slices.", "More threads vs. fewer: more raises throughput until dependencies and memory bandwidth limit it, then adds delay and memory with no gain."],
    p: ["Enabling frame threads for a live call adds several frames of delay to every picture.", "Races on reference frame progress corrupt a few rows only under load, making them hard to reproduce."],
    v: "Decode a long sample at 1, 4 and 8 threads and confirm output is bit-identical in every case, with throughput rising with threads and added latency matching the documented number of frames.",
    dep: ["video-decoder", "reference-frame-management", "refcounted-buffers", "pipeline-thread-model"]
  },
  "slice-threading": {
    s: "Splits one picture into horizontal bands decoded or encoded in parallel, which speeds up a single frame without adding frame delay.",
    d: "A frame is divided into slices or tiles that can be processed independently, so several threads work on one picture and the frame completes sooner. The encoder chooses how many slices to create; the decoder can only parallelize what the stream provides, and entropy decoding can be split only when slice boundaries reset it. Post-processing such as the in-loop filter may need to run across slice edges after all slices finish. It costs some compression efficiency at boundaries. It suits low-latency use and high-resolution content, and combines with frame-level parallelism.",
    k: ["Many slices vs. few: many parallelize well and aid error resilience, but reduce compression efficiency and cost bitrate at boundaries.", "Slice threading vs. frame threading for live: slice keeps one frame of delay, while frame threading gets higher throughput at the price of more delay."],
    p: ["Decoding a stream encoded with one slice per picture gives no parallelism, so adding threads changes nothing.", "Filtering across slice edges before the neighbor finishes leaves visible seams."],
    v: "Decode a stream encoded with eight slices and with one slice at eight threads, and confirm the first shows nearly linear per-frame speedup with identical output and the second shows none.",
    dep: ["video-decoder", "video-encoder", "pipeline-thread-model"]
  },
  "pipeline-thread-model": {
    s: "The assignment of pipeline work to threads: which elements share a thread, where queues decouple them and which thread owns each callback.",
    d: "A typical layout has a source or network thread, a demux thread, one decode thread per stream with its own worker pool, and render threads for video and audio. Queues sit at thread boundaries and carry backpressure. Elements run in the caller's thread unless a queue element is placed between them. Real-time audio output runs on a high-priority callback thread that must never block or allocate. Control calls from the application arrive on yet another thread, which needs serialization against streaming threads. The hard part is lock ordering and priority inversion across all of these.",
    k: ["Thread per element vs. thread per segment of the graph: per-element isolates stalls but costs context switches and memory, while per-segment is cheaper but a slow element stalls its neighbors.", "Locks in the data path vs. lock-free queues: locks are simple, while lock-free avoids priority inversion in the audio path at the price of complexity."],
    p: ["Taking a lock in the audio callback that a decode thread also holds produces glitches under load.", "Calling application code from a streaming thread while holding an internal lock deadlocks when it calls back in."],
    v: "Run a ten-minute stress with random seeks, track changes and stop-start cycles under a thread sanitizer and confirm no deadlock, no data race reports and no audio underruns at nominal load.",
    dep: ["frame-queues", "buffer-pools"]
  },
  "error-concealment": {
    s: "Hides the visible or audible effect of missing or damaged data by filling the gap with a plausible substitute until clean data resumes.",
    d: "When a decoder knows a region of a frame is lost, it can copy the co-located area from the previous frame, extrapolate motion vectors from neighbors or interpolate from surrounding pixels. For audio, concealment repeats and fades pitch periods or synthesizes a continuation of the last waveform. Concealment is limited in time: after a few frames or tens of milliseconds the substitute no longer resembles reality and fade or silence is better. Because later frames reference concealed ones, errors can propagate until the next key frame. It depends on the decoder knowing which data is bad.",
    k: ["Conceal and continue vs. freeze the last good picture: concealment keeps motion but can leave blocky errors, while freezing is clean but obviously stalls.", "Decoder-side concealment only vs. adding redundancy at the encoder: decoder-side costs nothing in bitrate, but the encoder's extra data gives much better results at a bitrate cost."],
    p: ["Concealing silently without telling the player lets damaged video play on for seconds when a resync was needed.", "Concealment applied to a lost key frame produces garbage that persists for a whole GOP."],
    v: "Remove random packets at 2 percent loss from a recorded stream and confirm the output never stalls, damaged areas heal at the next key frame, and the quality score of concealed frames is above a frozen-frame baseline.",
    dep: ["video-decoder", "audio-decoder", "reference-frame-management"]
  },
  "loss-recovery": {
    s: "Restores lost packets in transit using retransmission requests or forward error correction, within the delay budget of the stream.",
    d: "A receiver detects missing sequence numbers and either asks the sender to resend, which costs a round trip, or reconstructs data from redundant parity packets sent in advance. Retransmission suits networks with short round trips and long buffers; forward correction suits high-latency or one-to-many paths at a constant bandwidth cost. Systems combine both and adapt redundancy to measured loss. For video, a lost key frame may trigger a request for a new one. The hard part is not exceeding the latency budget: a recovery that arrives after the playout deadline is useless.",
    k: ["Retransmission vs. forward error correction: retransmission uses bandwidth only on loss but needs a round trip, while correction adds constant overhead and works within one packet time.", "Request a new key frame vs. wait for the next scheduled one: requesting heals quickly but spikes bitrate and can collapse a weak link."],
    p: ["Sending a key frame request for every lost packet creates a storm that worsens the congestion causing the loss.", "Parity groups sized for random loss fail completely on burst loss that wipes a whole group."],
    v: "Run a call through a link emulator at 5 percent random loss and then 200 ms burst loss, and confirm the stream is visually continuous in the first and recovers within the planned time after the second.",
    dep: ["jitter-buffer", "stream-reassembly", "frame-types-gop"]
  },
  "bitstream-resync": {
    s: "Finds the next safe point to resume decoding after corrupt or missing data, usually the next start code or key frame.",
    d: "Compressed streams use markers such as start codes or sync words that cannot appear in payload data. After an error the parser scans forward for the next marker, discards bytes in between and tells the decoder it must restart from a key frame or a recovery point. Some streams carry recovery points that allow gradual refresh without a full key frame. Audio frames carry sync words and checks. In containers, the demuxer re-finds packet boundaries by scanning. The pitfall is false sync: payload that looks like a marker leads to resuming at the wrong place and producing garbage.",
    k: ["Resync at any marker vs. only at key frames: any marker recovers fast but may decode against missing references, while key frames are clean but can take seconds.", "Scan with checksum validation vs. marker only: validation avoids false sync but costs CPU and requires streams that carry checks."],
    p: ["Resuming at a non-key frame whose references are lost shows smeared pictures until the next key frame.", "A sync pattern appearing inside payload makes the parser jump into the middle of a packet."],
    v: "Corrupt random 1 KB ranges in a test file and confirm the decoder resumes at the next marker each time, no crash occurs, and output after resume matches the clean decode from the next key frame onward.",
    dep: ["demuxer", "video-decoder", "bitstream-parameter-sets"]
  },
  "low-latency-mode": {
    s: "A set of configuration choices that cut end-to-end delay, such as no B-frames, small queues, slice threading and immediate output, at the cost of efficiency.",
    d: "Interactive uses such as calls, remote desktop and game streaming need delays of tens to a few hundred milliseconds. Every stage drops its buffering: the encoder disables frame reordering and look-ahead, the decoder outputs frames as soon as they are decoded, queues shrink to one or two entries, the renderer presents without waiting for a vsync-aligned deadline when it can and the audio buffer is small. Rate control uses a small buffer so bitrate cannot spike. The consequence is lower compression efficiency and less resilience, since there is no buffer to absorb a late packet.",
    k: ["Disable B-frames and look-ahead vs. keep them: removing them saves frames of delay, but costs compression efficiency and needs a higher bitrate for the same quality.", "Tiny queues vs. a safe margin: tiny queues cut delay, but any scheduling hiccup becomes a dropped or repeated frame."],
    p: ["One stage left at default buffering, such as a renderer queue of three frames, undoes the savings of all the others.", "A tight rate control buffer causes large quality drops on every scene change."],
    v: "Measure glass-to-glass delay with a clock in front of the camera and a second camera capturing both clock and screen, and confirm it stays under the target at p95 over ten minutes of varied content.",
    dep: ["video-encoder", "video-decoder", "frame-queues", "display-sync"]
  },
  "stall-recovery": {
    s: "Detects a pipeline that has stopped producing output and restores it, by rebuilding a stage, re-fetching data or reopening a device.",
    d: "A watchdog observes progress: presented frame timestamps, bytes read, decoder output counts. If nothing advances within a limit while the player believes it is playing, the recovery ladder runs: retry the read, flush and re-seek to the current position, rebuild the decoder, fall back from hardware to software, and finally report an error. For devices, it handles removal and reopening. For network sources it tries a new connection or a different rendition. The challenge is telling a legitimate wait, such as buffering on a slow link, from a stuck stage, so the watchdog needs the right signals for each.",
    k: ["Aggressive watchdog vs. patient watchdog: aggressive heals quickly but may restart a pipeline that was only waiting, while patient avoids false restarts but leaves viewers staring at a frozen picture.", "Escalating recovery ladder vs. a single full restart: the ladder preserves state when cheap steps work, but more code paths need tests."],
    p: ["Restarting from the beginning instead of the current position loses the viewer's place.", "A watchdog that counts only decoder output stays quiet when the renderer is the stuck stage."],
    v: "Inject a decoder hang during playback and confirm the watchdog detects it within the configured time, rebuilds the decoder, resumes within a second of the stall position, and records the event in diagnostics.",
    dep: ["player-state-machine", "software-fallback", "seek-controller", "playback-diagnostics"]
  },
  "pixel-formats": {
    s: "The definition of how a picture is laid out in memory: channel order, bit depth, chroma subsampling and whether planes are separate or interleaved.",
    d: "A format names the components (luma and chroma, or red, green and blue), the bits per component, the subsampling such as halved chroma resolution, packed versus planar storage and sometimes an alpha channel. Decoders produce the format the codec uses natively; displays and GPUs accept a limited list; filters accept others. Row stride and alignment add padding that every stage must respect. Higher bit depths use more memory and bandwidth. The format is part of the negotiated contract between stages, and a mismatch forces a conversion that costs time and sometimes quality.",
    k: ["Keep native decoder format vs. convert early to a common format: native avoids conversion cost, while a common format simplifies every later filter at the cost of one pass and possible precision loss.", "Planar vs. packed storage: planar suits codecs and per-plane processing, while packed suits display hardware and simple copies."],
    p: ["Ignoring row stride and treating rows as tightly packed shears the picture diagonally.", "Converting 10-bit content through an 8-bit format silently introduces banding in gradients."],
    v: "Pass a gradient test pattern through the pipeline at the native bit depth and confirm output values match input within rounding, with no banding, and that every stage logged its input format.",
    dep: ["packet-and-frame-types", "format-negotiation"]
  },
  "color-spaces": {
    s: "The set of conventions that define what pixel values mean: primaries, transfer function, matrix coefficients and whether values use full or limited range.",
    d: "Video values encode colors under a chosen set of primaries, a transfer function relating code values to light, a matrix converting between luma-chroma and red-green-blue and a range, limited with headroom or full. Streams carry these as tags; if tags are missing, defaults depend on resolution, which is a source of mistakes. Conversion between spaces needs linearization, matrix and gamut mapping. Every stage that mixes, scales or composites should work in the right space. Errors are subtle: slightly wrong colors, crushed blacks or washed-out pictures that nobody notices in unit tests.",
    k: ["Trust stream tags vs. guess from resolution: tags are exact when present, while guessing handles untagged files but is wrong for some.", "Process in the source space vs. convert to a working space first: working in source avoids conversions, while a common space makes blending and scaling correct."],
    p: ["Treating limited range as full gives washed-out blacks; the reverse crushes shadows.", "Scaling in a nonlinear space darkens fine bright detail such as stars or text edges."],
    v: "Play a color bar test clip tagged with each supported space and confirm captured pixel values of each bar match the reference to within tolerance, with correct black and white levels.",
    dep: ["pixel-formats", "scaler"]
  },
  "hdr-metadata": {
    s: "The static and per-scene information describing a high dynamic range picture's mastering display and brightness, carried alongside the video.",
    d: "HDR video uses transfer functions that encode far more brightness than standard video, plus metadata: the mastering display's primaries and peak luminance, the brightest pixel and average brightness of the content, and sometimes per-scene or per-frame dynamic data. It travels in the bitstream, the container or both. Decoders pass it along as frame side data; the renderer uses it to drive the display or to map the picture to what the display can show. Conflicts occur when container and stream disagree, or when a filter drops the side data. Missing metadata gives a dim, flat picture.",
    k: ["Static metadata vs. per-scene dynamic metadata: static is simple and widely supported, while dynamic maps each scene better but requires processing support end to end.", "Passthrough to the display vs. tone map in the pipeline: passthrough preserves the master on capable displays, while tone mapping makes the result consistent across devices."],
    p: ["A scaling or conversion filter that discards side data tags HDR content as standard and washes it out.", "Container and bitstream metadata that disagree produce different brightness depending on the player."],
    v: "Play an HDR clip through each pipeline path and confirm the side data on the final frame matches the source tags, and a luminance meter on a capable display reads the mastered peak brightness.",
    dep: ["side-data", "color-spaces", "container-metadata"]
  },
  "tone-mapping": {
    s: "Maps the brightness range of the source picture into the narrower range of the display, preserving contrast and color as well as possible.",
    d: "Converting high dynamic range to standard displays, or one range to a dimmer panel, requires compressing highlights without crushing the rest. The mapper linearizes the signal, applies a curve using the source peak and display peak, maps gamut and re-encodes. Better implementations adapt per scene using measured brightness, and desaturate highlights to avoid hue shifts. It runs on the GPU for real-time use. Hard parts are temporal stability, so brightness does not pump between frames, and skin tones, which viewers notice at once when shifted.",
    k: ["Fixed curve vs. scene-adaptive curve: fixed is stable and cheap, while adaptive preserves more detail but can flicker if not smoothed.", "Map in the pipeline vs. let the display do it: the display knows its own capabilities, while pipeline mapping gives consistency and works when the display cannot."],
    p: ["Per-frame adaptation without smoothing makes brightness pulse on flashing scenes.", "Mapping with the wrong peak value leaves highlights clipped to white or the whole picture dim."],
    v: "Map a test ramp and a clip with bright highlights to a 300-nit target and confirm the highlights keep visible gradation, skin tones stay within a hue tolerance, and frame brightness is steady across a fixed-brightness scene.",
    dep: ["hdr-metadata", "color-spaces", "scaler"]
  },
  "scaler": {
    s: "Resizes pictures and converts between pixel formats and color spaces, usually in one combined pass to save memory bandwidth.",
    d: "Scaling uses filters such as bilinear, bicubic or multi-tap windowed filters; more taps give sharper results at greater cost and risk ringing. Downscaling needs enough taps to avoid aliasing. Chroma planes are resampled differently from luma. Conversion adds matrix math and range scaling. Implementations separate horizontal and vertical passes, use fixed-point arithmetic or vector instructions, and often run on the GPU. Quality choices are visible: the same scaler feeds both the viewer and the quality metric. The hard part is doing it per frame at high resolution within the time budget while preserving color accuracy.",
    k: ["High-quality multi-tap filter vs. bilinear: multi-tap is sharper and alias-free, but costs several times more compute per frame.", "Combined scale and convert pass vs. separate passes: combined saves a full memory trip, while separate passes are easier to reuse and verify."],
    p: ["Downscaling by large factors with a bilinear filter produces aliasing and moire in fine patterns.", "Rounding chroma positions incorrectly shifts color edges by half a pixel."],
    v: "Scale a zone plate and a sharp edge target down and up, and confirm no aliasing rings appear in the plate, edge overshoot stays below a stated percentage and output color values match a reference conversion.",
    dep: ["pixel-formats", "color-spaces", "buffer-pools"]
  },
  "deinterlacer": {
    s: "Converts interlaced video, where each frame holds alternating lines from two moments, into progressive frames without combing artifacts.",
    d: "Interlaced sources store two fields per frame, captured at different times. Showing them together on a progressive display produces comb patterns on motion. Simple methods interpolate one field's lines; better ones use motion detection to keep full resolution in still areas and interpolate in moving areas; the best use motion compensation across several fields. It can output one frame per frame pair or one per field, doubling the frame rate for smoother motion. Telecined film content needs inverse telecine to recover the original frames rather than deinterlacing. Detection of the cadence and field order is the hard part.",
    k: ["Output one frame per pair vs. one per field: per pair is cheaper and keeps the frame rate, while per field gives smoother motion and doubles the cost.", "Motion-adaptive vs. simple interpolation: adaptive keeps detail but costs memory and compute, while simple halves vertical resolution everywhere."],
    p: ["Wrong field order creates judder, with motion stepping backward and forward each frame.", "Deinterlacing progressive film content softens it and adds artifacts that cannot be undone."],
    v: "Deinterlace a clip with a panning test pattern and confirm no comb lines remain on moving edges, still regions keep full resolution, and motion steps forward monotonically with no judder.",
    dep: ["video-filter-chain", "packet-and-frame-types", "pixel-formats"]
  },
  "video-filter-chain": {
    s: "An ordered series of picture-processing steps such as crop, rotate, denoise, sharpen and color correction, built from a textual or graphical description.",
    d: "A filter graph describes a chain, or a branching network, of effects. Each filter declares its input and output formats and may need several frames of context, such as temporal denoising, which adds latency. The framework inserts scalers and format converters where the formats differ and can reorder or fuse operations. Parameters can change over time through commands or expressions of the frame number. On the GPU, filters become shader passes. Complexity comes from format negotiation across many filters, memory use of intermediate frames and keeping the timestamps consistent as filters drop or add frames.",
    k: ["Description-driven graph vs. hard-coded effects: descriptions are flexible and scriptable, while hard-coded is faster to start but cannot be reconfigured.", "Fuse filters into one pass vs. keep them separate: fusion saves memory trips, but loses modularity and complicates debugging."],
    p: ["A frame-rate-changing filter that does not rewrite timestamps makes audio drift from video.", "Placing a denoiser after a scaler instead of before it wastes compute and degrades results."],
    v: "Run a chain of crop, rotate and sharpen on a test card and confirm output dimensions, orientation and pixel values match a reference render, and every output frame keeps a valid, increasing timestamp.",
    dep: ["scaler", "format-negotiation", "buffer-pools", "frame-queues"]
  },
  "overlay-compositor": {
    s: "Blends additional layers such as logos, subtitles, picture-in-picture and graphics onto video frames, respecting alpha, position and timing.",
    d: "Layers carry a pixel format, alpha channel and timing. The compositor converts layers to a common format, applies position, scale and opacity, and blends in the right color space, preferably linear. It can run on the CPU for simple cases or on the GPU, ideally on the same surface as the video to avoid copies. Each layer has its own timestamps, so the compositor chooses the layer version current for each output frame. Challenges include premultiplied versus straight alpha mismatches, protected surfaces that cannot be read and keeping text sharp when the video is scaled.",
    k: ["Composite on the GPU vs. CPU: GPU is fast and avoids copies for hardware frames, but varies by device, while CPU is portable and slow at high resolution.", "Blend in linear light vs. in encoded values: linear is physically correct, but costs conversions and differs from what many designers expect."],
    p: ["Mixing premultiplied and straight alpha produces dark or bright fringes around logos.", "Scaling the video after compositing blurs text that should have been drawn at output resolution."],
    v: "Composite a semi-transparent logo and subtitle over a gradient at two output resolutions and confirm blended pixel values match a reference render within tolerance and text edges remain sharp.",
    dep: ["scaler", "subtitle-renderer", "color-spaces", "zero-copy-surfaces"]
  },
});
