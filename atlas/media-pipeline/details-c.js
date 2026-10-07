// Details for the media pipeline plate, part 3: audio processing, subtitles, codecs, hardware acceleration.
ATLAS.details("media-pipeline", {
  "resampler": {
    s: "Converts audio from one sample rate to another with a filter that avoids aliasing and keeps the signal intact, also used for small rate adjustments during drift correction.",
    d: "A resampler computes new samples at a different rate by low-pass filtering and interpolating, commonly with a windowed filter over many input samples. Higher filter length gives better stopband rejection and more delay and compute. Rate ratios that are simple fractions allow polyphase implementations; arbitrary ratios need interpolated filter tables. The resampler carries state across blocks so block boundaries do not click, and reports its delay so sync can compensate. Variable-ratio operation lets the pipeline absorb clock drift. Hard parts are latency in interactive paths and keeping filter state correct across seeks and format changes.",
    k: ["Long high-quality filter vs. short low-latency filter: long gives clean output and costs delay and CPU, while short suits calls but leaves audible aliasing on bright content.", "Fixed-ratio polyphase vs. variable-ratio: fixed is efficient, while variable allows drift correction at a modest extra cost."],
    p: ["Not resetting filter state after a seek leaks a short burst of old audio into the new position.", "Ignoring the filter delay shifts audio late relative to video by a few milliseconds."],
    v: "Resample a swept sine from 48 kHz to 44.1 kHz and back and confirm the spectrum shows no alias components above a stated level, passband flatness within tolerance and no discontinuity at block joins.",
    dep: ["sample-formats", "packet-and-frame-types"]
  },
  "channel-layouts-mixing": {
    s: "Describes which speaker position each audio channel feeds and converts between layouts, such as downmixing surround to stereo or upmixing mono to two channels.",
    d: "A layout names channels by position: left, right, center, low-frequency, surrounds and so on. Mixing applies a matrix of gains between input and output channels, with coefficients chosen to preserve loudness and dialog, and care taken to avoid clipping when channels sum. Sources with more channels than the device are downmixed; fewer are upmixed or passed through. The mixer also combines several sources, such as program audio and a notification, applying per-source gain. Complexity comes from channel order conventions, which differ between formats, and loudness changes after downmix.",
    k: ["Normalize downmix gains to prevent clipping vs. keep unity gain: normalizing is safe but makes surround content quieter, while unity can clip on loud scenes.", "Matrix mixing vs. letting the device mix: pipeline mixing gives consistent results, while device mixing may use better spatial processing."],
    p: ["Assuming one channel order for all inputs swaps center and low-frequency channels on some files.", "Summing channels without headroom clips during loud scenes and sounds harsh."],
    v: "Play a five-point-one test file with a distinct tone per channel through stereo and confirm each tone appears at the expected level and position in the output, the center at about minus three decibels in each side, with no clipping.",
    dep: ["sample-formats", "audio-filters"]
  },
  "sample-formats": {
    s: "The representation of audio samples in memory: integer or floating point, bit depth, and whether channels are interleaved or in separate planes.",
    d: "Decoders typically output floating-point or 16-bit integer samples, planar or interleaved, depending on the codec. Devices accept a fixed set of formats. Floating point simplifies processing and allows headroom above full scale, while integers save memory and match hardware. Converting to a lower bit depth should apply dither to avoid distortion on quiet signals. The sample format, rate and layout together form the audio format contract between stages. Planar storage suits per-channel filters, while interleaved suits device buffers and copies.",
    k: ["Float internal processing vs. integer: float avoids overflow and eases filter math, while integer uses less memory and bandwidth on small devices.", "Dither on bit-depth reduction vs. truncation: dither hides quantization distortion at a small noise cost, while truncation is cheaper but audible on fades."],
    p: ["Reading interleaved data as planar produces noise or channel swaps at half speed.", "Converting float to integer without clamping wraps loud peaks into harsh clicks."],
    v: "Convert a full-scale sine and a very quiet fade between every supported format and back, and confirm peaks never wrap, quiet material shows no stepping distortion with dither and levels match within one least significant bit.",
    dep: ["packet-and-frame-types"]
  },
  "audio-filters": {
    s: "Processing stages for decoded sound such as equalization, compression, gain, fades, echo removal and noise suppression.",
    d: "Filters operate on blocks of samples with state carried between blocks. Equalizers use cascaded recursive filters; dynamics processors track level and apply gain; noise suppressors estimate and subtract a noise profile. In calls, echo cancellation uses the played audio as a reference to subtract the loudspeaker signal from the microphone. Filters add latency from lookahead and block size, which matters for calls and live monitoring. Parameter changes must be smoothed to avoid clicks. The challenge is that these stages work in real time on a deadline of a few milliseconds per block and cannot allocate or block.",
    k: ["Lookahead in dynamics processing vs. zero latency: lookahead catches peaks cleanly but adds delay, while zero latency suits live use and may clip fast transients.", "Process at the source rate vs. at a fixed internal rate: source rate avoids conversion, while a fixed rate lets filters be designed once."],
    p: ["Changing gain instantly produces audible clicks when a parameter jumps.", "Echo cancellation given a reference that is out of time alignment cancels nothing and may distort speech."],
    v: "Pass speech with a loudspeaker playing in the room through the echo canceller and confirm residual echo drops by the target number of decibels within seconds while near-end speech remains intact.",
    dep: ["sample-formats", "resampler", "pipeline-thread-model"]
  },
  "time-stretch": {
    s: "Changes playback speed without changing pitch, so fast or slow playback remains intelligible and music keeps its key.",
    d: "Algorithms work in the time domain by overlapping and repeating or skipping short segments aligned on pitch periods, or in the frequency domain with a phase vocoder. Time-domain methods are cheap and suit speech at modest rates; frequency-domain methods handle music and extreme ratios with some smearing of transients. The stretcher consumes input at a different rate than it produces output, so the pipeline's clock and buffers must reflect the playback rate. At high rates, audio is often dropped entirely. Quality drops at large ratios and with polyphonic content.",
    k: ["Time-domain overlap methods vs. frequency-domain vocoder: time-domain is cheap and good for speech, while vocoder handles music at greater cost and transient smearing.", "Stretch audio vs. mute at non-normal rates: stretching keeps content usable, but muting is simpler and avoids artifacts at extremes."],
    p: ["Stretching without adjusting the media clock rate leaves video running at normal speed against slow audio.", "Large ratios on music produce a metallic, smeared sound that users read as a bug."],
    v: "Play speech at 1.5 times speed and confirm output duration is two thirds of the input, measured pitch is unchanged within a semitone fraction and A/V offset stays within tolerance throughout.",
    dep: ["media-clock", "transport-controls", "audio-filters"]
  },
  "loudness-normalization": {
    s: "Measures the perceived loudness of audio and applies gain so different programs play at a consistent level.",
    d: "Loudness is measured over time with a frequency-weighted, gated algorithm giving a value in loudness units relative to full scale, plus a true peak measure for limiting. An analysis pass at ingest can store the measured value as metadata, and the player applies a gain to reach a target, such as the level of the platform's standard. Applying positive gain risks clipping, so a limiter follows. Live content uses a running measurement with slower, smoothed correction. The trade-off is between consistency across programs and preserving the intended dynamics of each.",
    k: ["Measure once at ingest vs. in the player: ingest measurement is exact and stored, while player measurement works for any content but needs time to settle.", "Program loudness vs. dialog-anchored loudness: dialog anchoring keeps speech steady across films, but needs content that is tagged or detectable."],
    p: ["Measuring including long silences or applying no gate biases the result and leaves quiet programs too loud.", "Boosting quiet content without a true-peak limiter clips on reconstruction."],
    v: "Normalize ten programs of different loudness to a target and confirm each measured integrated loudness lands within 1 loudness unit of the target and no true peak exceeds the ceiling.",
    dep: ["audio-filters", "container-metadata", "sample-formats"]
  },
  "subtitle-parsers": {
    s: "Reads timed text from sidecar files or container streams into cues with start time, end time, text and styling.",
    d: "Text subtitle formats range from plain numbered cues to rich markup with positions, colors, fonts and animations. The parser decodes character encodings, normalizes time to the pipeline's timeline and produces cues that the renderer draws. For streaming, cues may arrive in segments or inside media samples. Many files have errors: overlapping cues, missing end times and mixed encodings. Language selection and the offset between subtitle and video timelines are applied here. The parser must be tolerant, since a strict one rejects files that other players show without trouble.",
    k: ["Strict parsing vs. tolerant parsing: strict gives clear errors, while tolerant plays real-world files that break the specification.", "Convert all formats to one internal cue model vs. keep format-specific features: one model simplifies rendering, while specific features keep rich styling at the cost of a bigger renderer."],
    p: ["Guessing the character encoding wrong turns accented characters into garbage.", "Cues with missing end times stay on screen forever."],
    v: "Load files in each supported format with accented text, overlapping cues and a known offset, and confirm every cue appears at its intended time with correct text and styling and in the right order.",
    dep: ["container-metadata", "timestamps-time-bases"]
  },
  "bitmap-subtitles": {
    s: "Decodes subtitles stored as small images with palettes and positions, as used on discs and in broadcast, into drawable overlays.",
    d: "Each subtitle is a run-length encoded bitmap with a color palette, a display position and start and end times, delivered in packets inside the container or as a separate stream. The decoder expands the bitmap and the palette to a pixel format with alpha. The renderer composites it at the stated position, scaled to the output size. Text cannot be restyled or searched without recognition. Subtitle packets can be sparse, with long gaps, which stalls demuxers that wait for the next subtitle packet before releasing audio and video. Handling that is the main pipeline concern.",
    k: ["Decode to bitmaps and composite vs. text recognition: compositing is faithful and simple, while recognition allows restyling but is error-prone.", "Blocking on subtitle packets vs. treating gaps as empty: blocking keeps order exact, but stalls playback during sparse streams."],
    p: ["A demuxer waiting for the next subtitle packet stalls audio and video for long gaps.", "Scaling a bitmap subtitle for a different output aspect ratio makes it look stretched."],
    v: "Play a stream with one subtitle every ten minutes and confirm audio and video play without stalls, and each bitmap appears at its position and exact start time.",
    dep: ["demuxer", "overlay-compositor", "pixel-formats"]
  },
  "caption-decoders": {
    s: "Extracts closed captions carried inside the video stream or its side data and turns them into text cues with positions and styles.",
    d: "Broadcast-style captions travel as small data packets embedded with each frame, so they are tied to video frames and arrive in decode order, not display order. The decoder reorders them to presentation order, interprets control codes for rows, colors and roll-up or pop-on modes and builds a screen state that changes over time. Two caption services and several languages may be multiplexed. Captions must survive transcoding, so the encoder must pass them through or re-embed them in the output stream. They are often lost when filters drop side data.",
    k: ["Keep captions embedded in video vs. convert to a sidecar text track: embedded stays frame-accurate, while sidecar is easier to style, select and deliver over streaming manifests.", "Render captions in the pipeline vs. in the application: pipeline rendering is consistent everywhere, while application rendering respects user style settings."],
    p: ["Reading captions in decode order shows them out of sequence when B-frames reorder pictures.", "Filters that drop side data silently remove captions from the output."],
    v: "Transcode a captioned clip and confirm every caption cue survives with the same text and a timestamp within one frame, and appears in presentation order when decoded.",
    dep: ["side-data", "b-frame-reordering", "subtitle-renderer"]
  },
  "subtitle-renderer": {
    s: "Draws subtitle and caption cues over the video with the right font, size, position and timing, handling scripts that need shaping and right-to-left order.",
    d: "For each presented frame, the renderer selects cues active at that timestamp, lays out text using font fallback and shaping for complex scripts, applies the style such as outline and background, and draws into an overlay that the compositor blends. Placement respects safe areas and the video's displayed region rather than the window. Animations and karaoke effects need frame-accurate timing. User settings for size and contrast override authored style where accessibility requires. The cost is font loading and shaping at the moment a cue appears, which can cause a visible delay if not prepared ahead.",
    k: ["Render at video resolution vs. at output resolution: video resolution is cheap but blurry when scaled, while output resolution is sharp and costs more on large displays.", "Authored style vs. user style: authored respects the creator's intent, while user style serves accessibility needs and must be allowed to win."],
    p: ["Shaping the cue on first display causes a hitch or a late appearance when fonts load.", "Placing text relative to the window instead of the video area puts it over black bars or cuts it off."],
    v: "Display cues in a left-to-right script, a right-to-left script and a script needing shaping at three window sizes and confirm correct glyph order, no clipping and appearance within one frame of the cue time.",
    dep: ["subtitle-parsers", "overlay-compositor", "video-renderer"]
  },
  "video-decoder": {
    s: "Turns a compressed video stream into pictures, following the codec standard exactly so every correct decoder produces identical output.",
    d: "The decoder parses parameter sets and slice headers, entropy-decodes syntax elements, reconstructs each block from prediction and residual using reference frames, and applies in-loop filters that clean block edges. Output may be reordered into display order. It is a state machine with a reference picture buffer and a dependency on earlier data. A decoder must tolerate bad data without crashing. Speed comes from vector instructions, parallelism and sometimes hardware. The hard parts are conformance on unusual streams, handling streams that change parameters mid-way and bounded memory use on hostile input.",
    k: ["Strict conformance vs. tolerance for broken streams: strict is correct by definition, while tolerance plays real-world files whose encoders deviated.", "Output in decode order vs. display order inside the decoder: display order is convenient for callers, but requires the decoder to hold frames and add delay."],
    p: ["A malformed stream that declares huge dimensions can allocate gigabytes unless limits are enforced.", "Ignoring a mid-stream parameter change outputs frames at the old size and corrupts memory use."],
    v: "Decode the official conformance streams and confirm the output checksum of every frame matches the reference, then decode fuzzed streams and confirm no crash and bounded memory.",
    dep: ["bitstream-parameter-sets", "reference-frame-management", "b-frame-reordering", "packet-and-frame-types", "frame-threading"]
  },
  "video-encoder": {
    s: "Compresses pictures into a standard-conforming stream, choosing predictions, block sizes and quantization to reach a quality target within a bitrate and speed budget.",
    d: "For each frame the encoder decides the frame type, partitions it into blocks, searches for the best prediction from reference frames or neighbors, transforms and quantizes the residual and entropy-codes the result. It also runs the decoder's reconstruction loop so it predicts from what the decoder will see. Presets trade speed for efficiency: more candidate modes, longer search and look-ahead save bits at higher cost. The decisions are guided by a cost function combining distortion and bits. Because the standard defines only the decoder, encoder quality varies widely, and tuning is empirical.",
    k: ["Slow thorough presets vs. fast presets: slow saves bitrate for stored content, while fast is necessary for live and costs notably more bits for equal quality.", "Optimize for a signal metric vs. perceptual quality: signal metrics are easy to measure, while perceptual tuning looks better but can lower scores."],
    p: ["Tuning on a few clips yields presets that fail on grain, animation or fast motion.", "Different encoder threading settings changing the output makes results irreproducible between machines."],
    v: "Encode a standard test set at fixed target quality with each preset and confirm bitrate falls as preset slows, speed falls accordingly and every output decodes bit-exactly in an independent decoder.",
    dep: ["rate-control", "motion-estimation", "frame-types-gop", "bitstream-parameter-sets", "slice-threading"]
  },
  "audio-decoder": {
    s: "Turns compressed audio frames into sample blocks, handling frame sync, transform reconstruction and codec-specific tools, with defined priming and padding.",
    d: "Audio codecs divide the signal into frames of hundreds to thousands of samples, transform them to the frequency domain, quantize with a psychoacoustic model and entropy-code the result. The decoder reverses this and overlaps adjacent frames, so each output block depends on the previous frame. The first frames after a seek need priming data to be correct, and the end of a stream has padding to trim. Channel configuration may change mid-stream. Decoding is cheap compared with video, but errors are audible, so concealment of lost frames and exact sample counts matter.",
    k: ["Decode to float vs. to integer: float preserves headroom and simplifies later stages, while integer saves bandwidth for simple outputs.", "Pre-roll frames after a seek vs. start decoding at the target: pre-roll yields clean audio, while starting at the target produces a short glitch from missing overlap state."],
    p: ["Skipping priming samples at the start shifts audio late and breaks gapless playback.", "A seek into the middle of a frame sequence without pre-roll produces a click."],
    v: "Decode reference streams and confirm output matches reference samples within the codec's tolerance, the total sample count equals the declared length after trimming, and a seek lands without a click.",
    dep: ["sample-formats", "container-metadata", "packet-and-frame-types", "error-concealment"]
  },
  "audio-encoder": {
    s: "Compresses audio into frames at a target bitrate or quality, using a perceptual model to spend bits where the ear notices.",
    d: "The encoder windows the signal, transforms it, decides how many bits each frequency band gets based on masking by louder neighbors, quantizes and entropy-codes. Choices include constant versus variable bitrate, channel coupling for stereo and bandwidth limits at low rates. The encoder adds a startup delay and end padding which must be recorded in metadata so players can trim. Voice-oriented encoders use low delay and different tools for interactive use. Segment boundaries for streaming require frames aligned to the segment duration, otherwise audio and video segments drift.",
    k: ["Variable bitrate vs. constant bitrate: variable gives better quality per bit, while constant is predictable for buffers and live links.", "Low-delay mode vs. high-efficiency mode: low delay serves calls with higher bitrate, while efficiency suits stored music with more delay."],
    p: ["Not writing encoder delay into metadata leaves a gap at the start of every track.", "Segmenting audio at video boundaries cuts frames in half and creates clicks at segment joins."],
    v: "Encode a reference set at three bitrates and confirm blind listening scores or an objective perceptual measure rises with bitrate, delay and padding fields are present, and segment boundaries land on frame edges.",
    dep: ["sample-formats", "resampler", "container-metadata", "rate-control"]
  },
  "frame-types-gop": {
    s: "The kinds of coded frames and how they are arranged into groups of pictures, balancing compression against random access and error containment.",
    d: "Intra frames are coded alone and can start decoding; predicted frames reference earlier frames; bi-predicted frames reference earlier and later ones and compress best. A group of pictures runs from one key frame to the next, with a pattern such as one key frame then many predicted and bi-predicted. Longer groups compress better but lengthen seek time and error recovery. Closed groups do not reference across a key frame, which suits segmenting and splicing; open groups compress slightly better but are harder to cut. Scene changes trigger extra key frames.",
    k: ["Long GOP vs. short GOP: long is efficient but slow to seek and recover, while short costs bitrate and gives fast access.", "Closed GOP vs. open GOP: closed segments and splices cleanly, while open saves a little at each key frame but breaks independent segment decoding."],
    p: ["A fixed key frame interval that ignores scene cuts wastes bits and puts a visible pulse mid-scene.", "Open GOP segments cannot be decoded alone, so a client switching rendition shows artifacts."],
    v: "Analyze an encoded stream and confirm key frames occur at the configured interval and at scene cuts, every segment begins with a decodable frame, and a random seek never needs more than one GOP of decoding.",
    dep: ["reference-frame-management", "b-frame-reordering", "packet-and-frame-types"]
  },
  "reference-frame-management": {
    s: "Tracks which decoded pictures stay available for prediction, which can be dropped, and how long each is kept.",
    d: "Predicted frames refer to earlier decoded pictures held in a decoded picture buffer. The stream signals which pictures to keep, in which order references are listed and when to evict. The decoder owns a bounded pool; every reference is memory, and its size comes from the stream's level. Output order may differ from decode order, so a picture can be both waiting for display and needed as a reference. Long-term references let the encoder keep a stable background or recover from loss. Errors in reference lists cause drift that persists until the next key frame.",
    k: ["Many reference frames vs. few: more references improve compression for complex motion, while few save memory, bandwidth and decode time.", "Long-term references for recovery vs. relying on key frames: long-term allows quick healing at low cost, but requires feedback from the receiver to be useful."],
    p: ["Releasing a picture still needed as a reference causes corruption that grows across the following frames.", "Holding references past the required count exhausts a hardware decoder's fixed surface pool."],
    v: "Decode a stream with long-term references and a deliberately lost frame and confirm drift is contained to the expected recovery point, and surface pool occupancy never exceeds the level's limit.",
    dep: ["refcounted-buffers", "frame-types-gop", "buffer-pools"]
  },
  "b-frame-reordering": {
    s: "Handles frames that depend on a later frame, so decode order differs from display order and the decoder must hold and reorder output.",
    d: "A bi-predicted frame needs a future reference, so the encoder sends that future frame first. Decode order timestamps therefore differ from presentation order timestamps. The decoder outputs frames in presentation order after holding enough pictures to be sure none earlier is still coming; the stream signals the reorder depth. The pipeline must carry both timestamps through demux, decode and output, and handle the first presentation time being later than the first decode time. The cost is added latency of the reorder depth, so low-latency modes avoid it.",
    k: ["B-frames for efficiency vs. none for latency: they save a notable share of bits, but add frames of delay and hold extra memory.", "Pyramid reference structure vs. flat: pyramid compresses further, while flat is simpler and has smaller reorder depth."],
    p: ["Using decode timestamps for display makes motion stutter in streams with B-frames.", "Negative or offset timestamps at the start of a stream make the first frames appear before time zero."],
    v: "Inspect a B-frame stream and confirm decode timestamps are monotonic, presentation timestamps are increasing in output order, and rendered motion on a panning test is evenly spaced.",
    dep: ["timestamps-time-bases", "frame-types-gop", "packet-and-frame-types"]
  },
  "rate-control": {
    s: "Chooses quantization for each frame and block so the stream meets a bitrate target or quality target within a decoder buffer model.",
    d: "Modes include constant quantizer, constant quality with bounded rate, average bitrate over multiple passes and constant bitrate for live links. A virtual decoder buffer model constrains how fast bits can arrive and how many may be queued, so a decoder that follows the standard never underflows or overflows. Two-pass encoding measures complexity first and distributes bits to hard scenes. Look-ahead gives a single pass some of that knowledge. Frame types get different quality weights, with reference frames receiving more bits. Scene changes and sudden complexity make it hard to hold a constant rate without visible quality dips.",
    k: ["Constant bitrate vs. capped constant quality: constant bitrate fits fixed pipes but wastes bits on easy scenes, while capped quality saves bits and needs headroom for peaks.", "Two-pass vs. single-pass with look-ahead: two-pass allocates best for stored content, while look-ahead approximates it for live at lower delay."],
    p: ["A buffer model set larger than the target players' buffers makes streams stall on constrained clients.", "Rate control reacting to a scene change after the fact produces a blocky frame followed by wasted bits."],
    v: "Encode a clip with an alternating still and action pattern at a target rate and confirm the measured bitrate is within a few percent of target, buffer occupancy never underflows in a model check and quality dips are bounded.",
    dep: ["frame-types-gop", "motion-estimation", "bitstream-parameter-sets"]
  },
  "motion-estimation": {
    s: "Searches reference frames for the block that best predicts each block of the current frame and records the displacement as a motion vector.",
    d: "For each block the encoder tests candidate offsets, scoring each by a difference measure plus the cost of coding the vector, refining from full-pixel to sub-pixel positions with interpolation filters. Search patterns range from exhaustive to diamond or hierarchical searches on downscaled pictures. Larger search ranges find fast motion at greater cost. Multiple references and bi-prediction multiply the work. Motion search is typically the largest share of encoder time, which is why it is a main target for hardware and for speed presets. Poor estimates give wrong predictions, leaving larger residuals to code.",
    k: ["Exhaustive search vs. pattern search: exhaustive finds the best match, but cost grows with the square of the range, while patterns are fast and can miss fast motion.", "Sub-pixel refinement vs. full-pixel only: sub-pixel improves prediction notably at moderate cost, while full-pixel is cheaper and visibly worse."],
    p: ["A search range too small for a sports clip leaves fast action with high residual and blocky output.", "Optimizing vectors only for prediction error produces noisy fields that cost more bits to code."],
    v: "Encode a panning test sequence with known motion and confirm the estimated vectors match the true displacement within a quarter pixel, and compare bitrate against a zero-vector encode to see the expected saving.",
    dep: ["reference-frame-management", "video-encoder"]
  },
  "bitstream-parameter-sets": {
    s: "The headers in a compressed stream that define picture size, profile, level, timing and tools in use, which a decoder needs before any frame.",
    d: "Parameter sets describe dimensions, color information, reference structure limits and entropy settings, and are referenced by identifier from frames. They appear in the stream at key frames or are held in the container's configuration record. A decoder must have the right set before decoding and must handle updates mid-stream. Profiles and levels state the tools used and the resource requirements, allowing a device to refuse a stream it cannot play. Streaming clients read them to select renditions. Splicing streams with different sets requires repeated headers at the join.",
    k: ["Parameter sets in-band vs. only in container config: in-band supports joining a live stream anywhere, while container-only is compact but fails after a mid-stream cut.", "Higher profile and level vs. conservative: higher gives better compression, but excludes devices that cannot decode those tools."],
    p: ["A stream missing parameter sets after a seek cannot start decoding until the next key frame.", "Declaring a level above the device limit causes refusal even though playback would work."],
    v: "Join a live stream at random points and confirm decoding starts at the first key frame, and check each rendition's declared profile and level against the manifest's advertised codec string.",
    dep: ["container-metadata", "packet-and-frame-types"]
  },
  "hw-device-context": {
    s: "The handle to a hardware media device and its memory pool, shared by decoder, filters and encoder so frames can stay on the device.",
    d: "Opening a context selects a physical device and creates the driver session, memory allocator and synchronization objects. Elements that use hardware receive the same context so surfaces created by the decoder can be used by a scaler or encoder without copying. A context has limits: number of concurrent sessions, surface pool size and supported formats. Different devices and driver versions behave differently, and contexts can be lost when a device resets or goes to sleep. The pipeline must recreate state and continue. Sharing contexts across threads needs care for locking.",
    k: ["One shared context vs. one per element: shared allows zero-copy between stages, while separate contexts are isolated but force copies through host memory.", "Create the context up front vs. lazily: up front fails early when hardware is missing, while lazy avoids loading drivers for sessions that never need hardware."],
    p: ["A device reset invalidates every surface, and elements keep using stale handles and crash.", "Creating more sessions than the hardware permits fails only at the Nth stream, in production."],
    v: "Run decode, scale and encode on one context, simulate a device reset and confirm the pipeline reports the loss, rebuilds the context and resumes at the next key frame without leaking surfaces.",
    dep: ["hw-capability-probe", "buffer-pools"]
  },
  "hw-decode": {
    s: "Decodes video on dedicated silicon or a GPU engine, giving much higher throughput and lower power than software, within the limits of the device.",
    d: "The application passes compressed packets and parameter sets to the driver, which decodes into device surfaces from a fixed pool. The surface count must cover references plus frames in flight. Output either stays on the device for zero-copy rendering or is downloaded to host memory. Supported profiles, levels, bit depths and maximum sizes vary and must be probed. Hardware may output frames in a tiled layout and conform strictly, so streams that software tolerates may fail. Error handling is thinner: a bad packet can hang the engine, so watchdogs and fallbacks matter.",
    k: ["Hardware decode vs. software decode: hardware is faster and cheaper in power, but limited in profiles and strict on broken streams, while software is flexible and costs power.", "Keep frames on the device vs. download: on-device avoids copies, but prevents CPU filters and some effects."],
    p: ["Allocating too few surfaces stalls the decoder because references hold them all.", "Downloading every frame to host memory for processing erases the speed advantage and floods bus bandwidth."],
    v: "Decode a 4K stream with hardware and compare per-frame checksums with software output, then measure CPU use and power to confirm both fall markedly, and force a corrupt packet to confirm recovery.",
    dep: ["hw-device-context", "zero-copy-surfaces", "video-decoder", "software-fallback"]
  },
  "hw-encode": {
    s: "Encodes video on dedicated hardware, giving fast, low-power encoding at somewhat lower compression efficiency than good software encoders.",
    d: "Frames arrive in device surfaces, ideally straight from decode or capture, and the engine produces a bitstream under the requested rate control. Hardware offers fewer tuning options than software: fixed pipeline stages for motion search and a limited choice of presets. Throughput is high and constant, which suits live streaming and farms optimizing cost per stream, and quality is lower per bit than slow software presets. The number of concurrent sessions can be limited. Output may differ between hardware generations, so quality gates are needed for each device class.",
    k: ["Hardware vs. software encoding for ladders: hardware gives density and low latency, while software gives better quality per bit for content watched many times.", "Use hardware rate control vs. external control: built-in is simple and fast, while external gives precise control but needs frequent reconfiguration."],
    p: ["Session limits cause the sixth concurrent encode to fail, which scheduling did not account for.", "Bitrate accuracy of a hardware engine on difficult content overshoots the target, causing stalls on constrained clients."],
    v: "Encode the same test set with hardware and software, plot quality against bitrate for both, and confirm the quality gap is within the accepted limit and the throughput meets the real-time requirement with margin.",
    dep: ["hw-device-context", "zero-copy-surfaces", "rate-control", "hw-capability-probe"]
  },
  "zero-copy-surfaces": {
    s: "Passing frames between decoder, processing and display as references to device memory, so the pixels are never copied across the bus to the host.",
    d: "A surface is a handle to a picture in device memory. When decoder, filters, compositor and renderer all use the same memory domain, a frame can flow from compressed input to screen without leaving it. Where domains differ, memory is shared by importing a handle, subject to format, tiling and synchronization rules: the consumer must wait until the producer finishes. Fences or events carry this ordering. Any stage that must read pixels on the CPU forces a download, so effects have to be done on the device. The hard parts are format compatibility and avoiding reads before writes complete.",
    k: ["Zero-copy path vs. flexible host-memory path: zero-copy saves bandwidth and power, while host memory allows any CPU filter at the cost of copies at high resolution.", "Explicit synchronization with fences vs. implicit ordering: explicit is portable and precise, while implicit is simpler and not guaranteed across drivers."],
    p: ["Presenting a surface before the decoder finishes writing it shows torn or previous-frame content.", "One CPU filter in the middle quietly forces a download and upload of every frame."],
    v: "Trace memory traffic during playback of 4K content and confirm no host-bound copies occur between decoder and display, CPU use stays low and no tearing appears in a pan test.",
    dep: ["hw-device-context", "buffer-pools", "refcounted-buffers", "video-renderer"]
  },
  "hw-capability-probe": {
    s: "Queries each device for the codecs, profiles, levels, bit depths and sizes it can decode or encode, so the pipeline can choose a working path.",
    d: "Drivers report capabilities but the reports are often incomplete or optimistic, so some systems also test by trial: create a small decoder session and decode a known sample. Results are cached per device and driver version. The probe feeds the plugin registry's ranking, the player's choice of rendition and the farm's scheduling. The capability set includes concurrent session limits and maximum surface counts. Devices change with driver updates, so cached results need versioning. A rendition advertised as playable that fails at start is the user-visible failure this component prevents.",
    k: ["Trust reported capabilities vs. verify by trial: reports are fast, while trial decoding catches false claims at a startup cost.", "Probe at startup vs. cache from earlier runs: probing is current, while caching starts fast but can go stale after a driver update."],
    p: ["A driver that reports support for a profile but fails on certain streams causes failures only on that device model.", "A cache not keyed by driver version keeps selecting a broken path after an update."],
    v: "Compare reported capabilities with trial decodes of conformance samples at each level on every device model in the test lab, and confirm every reported capability decodes and false claims are blocklisted.",
    dep: ["hw-device-context"]
  },
  "software-fallback": {
    s: "The path that switches to CPU decoding or encoding when hardware is missing, overloaded or fails, so playback continues at a higher power cost.",
    d: "Triggers include missing hardware support, a failed session creation, an unsupported stream feature, a hung engine or reaching the session limit. The fallback can happen at setup, by selecting a software element in negotiation, or in the middle of playback, by flushing, rebuilding the decoder and resuming at the next key frame or the current position. Output formats differ, so downstream stages may need renegotiation. Software costs more power and may not keep up with high resolutions on weak devices, so the player may also lower the rendition. Seamless switching needs careful state handoff.",
    k: ["Fall back automatically vs. report failure: automatic keeps playback working but hides problems and may overheat a weak device, while failure surfaces issues at the cost of unplayable content.", "Remember failures per device vs. retry hardware each time: remembering avoids repeated failures, while retrying benefits from fixes at the cost of repeated glitches."],
    p: ["Falling back to software at 4K on a weak device produces slow-motion playback worse than failing.", "Switching decoders without waiting for a key frame shows corrupt pictures after the swap."],
    v: "Disable hardware decode mid-playback and confirm playback resumes within one GOP on software, the position is preserved, and a rendition cap is applied if the device cannot keep up.",
    dep: ["hw-decode", "video-decoder", "dynamic-reconfiguration", "plugin-registry"]
  },
});
