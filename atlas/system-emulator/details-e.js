// Details for the system emulator plate, part 5: graphics and audio emulation.
ATLAS.details("system-emulator", {
  "video-chip-model": {
    s: "Models the original video hardware's registers, memory and per-line operation, including tile maps, sprites, palettes, scrolling and mid-frame register changes.",
    d: "The chip is stepped scanline by scanline or pixel by pixel, reading its registers at each point and fetching tile and sprite data from video memory. Software often changes registers mid-frame to create effects such as split screens or wavy backgrounds, so the model must apply writes at the moment they happen, not at frame end. It also produces the timing signals that drive interrupts and the processor's waiting. The difficulty is the precision of when register values take effect, and the limits, such as sprites per line, that software relies on.",
    k: ["Render per pixel versus per scanline versus per frame: per pixel handles mid-line effects but is slowest, while per frame is fastest and breaks any title that changes registers during display.", "Fetch memory at render time versus snapshot at line start: render-time fetch is exact for mid-line writes, while a line snapshot is faster and misses a few effects."],
    p: ["Registers are latched at frame start, and a split-screen effect shows the same scroll on every line.", "The sprite limit per line is not enforced, and software that uses it for flicker looks wrong."],
    v: "Run video test programs for scroll splits, sprite limits and mid-line palette changes, and confirm the frames match hardware reference captures pixel for pixel.",
    dep: ["event-scheduler", "mmio-dispatch", "memory-map"]
  },
  "software-renderer": {
    s: "Draws the emulated video output on the host processor, one pixel at a time, giving exact results without depending on host graphics hardware.",
    d: "The renderer reproduces the original rasterization rules in code: fill conventions, texture sampling, blending, fog, depth tests and pixel formats. It writes to an in-memory framebuffer that is copied to the display. Because it follows the original's arithmetic, including rounding, results can match bit for bit, which makes it the reference for a hardware-accelerated renderer. It is slow for complex 3D scenes, but needs no drivers and is deterministic. The difficulty is speed, solved with vector instructions and multiple threads, and the exact edge rules.",
    k: ["Bit-exact arithmetic versus approximations: bit-exact output matches the original and serves as a reference, while approximations are faster but diverge in small, visible ways.", "Single-threaded versus tiled multithreading: tiles use many cores for speed, but synchronization with the command stream adds complexity."],
    p: ["Texture coordinates are rounded differently than the original, so seams and shimmer appear in textured surfaces.", "A faster approximation is used by default and no longer matches the reference used in tests."],
    v: "Render a set of reference scenes with the software renderer and compare each frame against hardware captures, confirming a pixel difference of zero or documented small differences on named scenes.",
    dep: ["video-chip-model", "gpu-command-processor", "texture-cache"]
  },
  "gpu-command-processor": {
    s: "Reads the stream of drawing commands, state changes and memory transfers that the guest sends to its graphics hardware and decodes them into a form a renderer can run.",
    d: "Programmable guests send command lists through queues or registers: set state, bind textures, upload vertices, draw, copy. The processor decodes them, keeps a model of the hardware's state, and hands draws to a renderer. It must reproduce the guest's ordering and synchronization, such as fences, interrupts at end of frame and reads of results by the processor. The difficulty is the volume of undocumented command types and state interactions, and keeping the command thread and the guest's processor in step.",
    k: ["Decode commands synchronously with the guest versus on a separate thread: synchronous is deterministic and simple, while a separate thread overlaps work but needs fences to match the guest's expectations.", "Maintain a full state model versus pass commands straight through: a model enables validation and caching, but must track every state the hardware has."],
    p: ["A command type is ignored because no title tested it, and a later title draws nothing.", "The guest reads back a result before the command thread finishes, and gets an old value."],
    v: "Capture a command stream from a known title, replay it into the renderer, and confirm the output frames equal reference frames and that every command type in the stream was decoded with no unknown-command warnings.",
    dep: ["video-chip-model", "component-synchronization", "framebuffer-emulation"]
  },
  "host-api-translation": {
    s: "Converts the guest's graphics operations into calls on the host's modern graphics API so a host GPU can do the drawing quickly.",
    d: "State such as blending, depth testing and vertex formats is mapped to host pipeline objects, and the guest's draws become host draw calls. Mismatches abound: guests may support unusual primitives, texture formats, fixed-function stages or memory layouts that the host lacks. The translator emulates these with extra shader code, additional passes or fallback to the software path. It also manages host resources and synchronization. The difficulty is differing behavior: rounding, depth precision and driver bugs mean the same call gives slightly different pictures.",
    k: ["Translate to the host API directly versus through an intermediate layer: direct is faster and gives more control, while an intermediate layer supports several host APIs with one backend.", "Emulate odd guest features exactly in shaders versus skip them: exact emulation is accurate but costs speed, while skipping works for most titles and breaks a few."],
    p: ["A host driver rounds differently, and the same title renders correctly on one machine and not another.", "A rarely used guest blend mode has no equivalent, and objects appear opaque."],
    v: "Render the reference scenes on the host GPU and on the software renderer, compute the per-pixel difference, and confirm it stays below the documented threshold on every scene on at least two host drivers.",
    dep: ["gpu-command-processor", "shader-translation", "host-window-display", "software-renderer"]
  },
  "shader-translation": {
    s: "Turns the guest's fixed-function configuration or its shader programs into shaders the host GPU can run, reproducing the original arithmetic.",
    d: "Guests either configure fixed stages, such as combining textures and colors, or run their own shader programs on a custom instruction set. The translator generates host shader source or bytecode that does the same math, including precision quirks and special cases. It keys generated shaders on the guest state that affects them. It must handle control flow, texture sampling modes and format conversions. The difficulty is exactness and compile time: a perfect translation of a complex program may be slow to compile or run, and approximations change the picture.",
    k: ["Generate one shader per state combination versus one general shader driven by data: per combination is fast at run time but compiles often, while a general shader never compiles but runs slower.", "Match guest precision exactly versus use host floating point: exact precision matches the original output, while host precision is simpler and faster."],
    p: ["A guest program uses an instruction with a quirk the translator treats as the textbook version, and lighting looks wrong in one area.", "A new combination of state compiles in the middle of play, and the frame stalls for a second."],
    v: "Translate a set of guest shader programs and state combinations, render with known inputs, and confirm output values match those from the software renderer within the stated tolerance for each.",
    dep: ["gpu-command-processor", "shader-cache", "host-api-translation"]
  },
  "shader-cache": {
    s: "Stores compiled shaders keyed by the guest state that produced them, in memory and on disk, so a shader is built once and reused across frames and sessions.",
    d: "Compiling shaders costs from milliseconds to seconds. The cache maps a hash of the guest configuration to a host shader object, and writes translated source or driver binaries to disk so later runs start warm. Strategies for the first encounter include compiling on a background thread and drawing something else, or pausing until ready. The cache must be invalidated when the emulator's translation changes or the host driver updates. The difficulty is stutter: every new shader compiled during play is a visible frame spike.",
    k: ["Compile synchronously on first use versus asynchronously with a placeholder: synchronous is always correct but stutters, while asynchronous avoids stutter and shows wrong or missing objects for a moment.", "Cache driver binaries versus cache only translated source: binaries load fastest but are tied to a driver version, while source works across drivers and recompiles each session."],
    p: ["An old cache from a previous emulator version produces broken shaders after an update, with no invalidation.", "Asynchronous compilation draws nothing for several frames and the picture flashes."],
    v: "Play through a scene twice from an empty cache and then a warm one, and confirm the first run shows compile stalls in the frame time log while the second shows none, with identical frames.",
    dep: ["shader-translation", "host-storage", "host-threading"]
  },
  "texture-cache": {
    s: "Decodes the guest's texture formats into host textures and keeps them until the guest changes the memory they came from.",
    d: "Guests store textures in compressed, tiled or palette-indexed formats in their own memory layouts, and may change them at any time. The cache decodes a texture to a host format on first use, stores it keyed by address, size and format, and invalidates it when the guest writes the covered memory. Detection of writes uses page protection, hashing or dirty flags. Textures that are also render targets need special handling. The difficulty is invalidation and performance, since checking every texture each frame is costly and missed updates show stale images.",
    k: ["Detect guest writes with page protection versus hash the texture each use: protection is cheap on reads but costs on writes near textures, while hashing is simple and costs on every draw.", "Decode to a full host format versus keep compressed formats: full decode is simple and always supported, while compressed formats save memory but need host support."],
    p: ["The guest updates part of a texture by writing memory directly, and the cached copy keeps showing the old pixels.", "A texture shares a page with data written every frame, and invalidation causes constant re-decoding."],
    v: "Run a title that animates a texture through direct memory writes, and confirm the displayed texture changes on the exact frame of each write, with cache hit statistics showing reuse for unchanged textures.",
    dep: ["memory-map", "self-modifying-code", "host-api-translation"]
  },
  "framebuffer-emulation": {
    s: "Keeps the guest's drawn images and the memory the guest sees consistent, so software that reads back, copies or post-processes its framebuffer still works.",
    d: "Hardware renderers draw into guest-visible memory, and software may copy a frame into a texture, read pixels for effects or display one buffer while drawing another. The emulator draws into host render targets and must reproduce reads and copies: copying a target to guest memory, or detecting that guest memory was written and uploading it. Resolution scaling complicates it, since guest addresses assume the original size. The difficulty is cost and correctness, since synchronizing host and guest copies each frame is slow and many titles rely on partial updates.",
    k: ["Lazy synchronization versus every frame: lazy copies only when the guest reads, which is fast, but needs detection of reads and writes of those regions.", "Keep render targets at native size versus scaled: native size matches guest memory exactly, while scaled targets look better but need translation between sizes."],
    p: ["A title reads back its framebuffer for an effect, and the emulator returns the old frame, producing a missing or delayed effect.", "A target is displayed before the copy completes, so the picture tears or shows the prior frame."],
    v: "Run titles using readback effects and display-while-drawing, and confirm output frames equal software renderer frames at native size, and that scaled output differs only by scaling.",
    dep: ["gpu-command-processor", "host-api-translation", "memory-map"]
  },
  "upscaling-and-filters": {
    s: "Renders at higher resolution than the original and applies display filters, such as scanlines or smoothing, to make output suit modern screens.",
    d: "Internal resolution scaling draws the 3D scene at multiples of the original size, then presents it. Filters include texture smoothing, anti-aliasing, scanline and shadow-mask effects that imitate older displays, and corrections for the original's pixel aspect ratio. Many are shader passes applied to the finished frame. Scaling can break effects that assume native resolution, such as screen-space tricks and sprites aligned to the pixel grid. The difficulty is that improvements are not free: each changes the look, and some change behavior.",
    k: ["Scale internal rendering versus scale only the final image: internal scaling gives sharper geometry but breaks pixel-aligned effects, while final scaling is safe but only enlarges blur.", "Integer scaling versus fitting the window: integer scaling keeps pixels even, while fitting uses the whole display with uneven pixel size."],
    p: ["Upscaling shifts a screen-space effect by a pixel and shows seams or gaps around objects.", "A smoothing filter blurs text and pixel art that was designed for sharp edges."],
    v: "Render the same frames at native size and at higher scales, and confirm geometry matches, known pixel-aligned effects are not broken in the test set, and filters can be toggled with no change to emulated state.",
    dep: ["framebuffer-emulation", "host-api-translation", "host-window-display"]
  },
  "sound-chip-model": {
    s: "Models the original sound hardware's channels, registers, envelopes and mixing, producing the same waveforms the real chip would.",
    d: "Chips come in two families: synthesis chips with oscillators, noise generators, filters and envelopes driven by registers, and sample players that read waveform data from memory with pitch, volume and looping. The model updates channel state as the clock advances and reproduces quirks such as how a channel restarts, how a register write takes effect partway through a cycle, or how analog mixing saturates. The difficulty is documentation, which is often incomplete, and the sheer number of channels and effects that each add to the cost.",
    k: ["Model at the chip's native sample rate versus at an arbitrary rate: native rate is exact, while an arbitrary rate is cheaper but changes pitch and aliasing behavior.", "Emulate analog behavior such as filters and mixing nonlinearity versus ideal digital sums: analog emulation matches the sound people remember, while ideal sums are clean and easier."],
    p: ["A register write is applied at the next sample instead of the next internal cycle, and a sound effect starts a hair late with a click.", "Envelope rates are slightly wrong, and music sounds right in short clips and drifts in long ones."],
    v: "Play sound test programs for each channel type and compare the generated audio with recordings from hardware, confirming waveform shape, envelope timing and mixing level agree within the documented tolerance.",
    dep: ["event-scheduler", "mmio-dispatch", "memory-map"]
  },
  "sample-generation": {
    s: "Produces audio samples from the sound models in step with emulated time, either each cycle or in batches when the chips' state changes.",
    d: "The core can generate a sample each time the audio chip's clock ticks, or run the chip lazily and compute the span of samples up to the current time whenever software changes a register or the buffer needs more. Samples from several channels are mixed, clipped and stored in a buffer. Lazy generation saves most of the time because audio state seldom changes. The difficulty is keeping exact alignment between register writes and the samples, and doing so across threads when audio runs separately from the processor.",
    k: ["Generate on every chip cycle versus lazily to the next change: every cycle is simple and exact, while lazy generation is several times faster and needs a catch-up call at each register write.", "Mix at high internal precision versus the chip's own bit depth: high precision avoids rounding noise, while the chip's depth reproduces its distortion."],
    p: ["A register write happens before the audio is brought up to date, and the change is applied to samples that should have played earlier.", "Samples are clipped while mixing, not at output, and loud passages distort differently than hardware."],
    v: "Run a test song and capture output with writes at known cycle times, and confirm the sample at each write boundary changes exactly at the expected sample index.",
    dep: ["sound-chip-model", "event-scheduler", "component-synchronization"]
  },
  "audio-resampler": {
    s: "Converts the emulated chips' sample rate to the host audio device's rate, filtering so the result is clean and the pitch is correct.",
    d: "Original chips run at odd rates, such as 32,000 or 44,100 Hz or a multiple of a clock, and the host wants 48,000 Hz or similar. Resampling interpolates between samples with filters, from cheap linear interpolation to windowed sinc kernels that avoid aliasing. Some chips produce very high rates and need band-limited synthesis to avoid harsh artifacts. The rate ratio is adjusted slightly by the sync logic. The difficulty is quality against cost: good filters use real CPU time, and poor ones are audible as hiss or dull sound.",
    k: ["Linear interpolation versus windowed sinc: linear is cheap and adds audible aliasing, while sinc is clean and costs several times as much processing.", "Fixed rate ratio versus continuously adjusted ratio: fixed is simplest, while an adjustable ratio lets sync logic absorb clock drift without gaps."],
    p: ["A low-quality interpolation adds a high-pitched whine to chips with strong high frequencies.", "Changing the ratio in large steps creates audible pitch wobble."],
    v: "Resample a swept sine test tone and measure the output spectrum, confirming no aliasing above the stated noise floor and pitch within a few cents of the original across the sweep.",
    dep: ["sample-generation", "audio-sync"]
  },
  "audio-sync": {
    s: "Keeps audio flowing without gaps by buffering samples and adjusting speed slightly so the emulator's audio and the host device's playback stay matched.",
    d: "The emulator produces audio at its emulated rate, while the host device consumes it at its own, which differs by a fraction of a percent. A buffer between them fills or empties over time. Dynamic rate control resamples by a tiny ratio, around one part in a thousand, to hold the buffer near half full, or video pacing is adjusted instead. Underruns cause clicks, overruns cause lag. The difficulty is that emulation hiccups, such as a slow frame, can drain the buffer, and a large buffer adds noticeable delay.",
    k: ["Dynamic rate control versus dropping or repeating samples: rate control hides drift with an inaudible pitch shift, while dropping or repeating samples is simpler and causes clicks.", "Larger buffer versus smaller: a larger buffer survives slow frames, while a smaller one keeps audio close to the picture."],
    p: ["A slow frame empties the buffer and each underrun produces a click until it refills.", "The sync target is tuned on one machine and drifts into perceptible lag on another."],
    v: "Run an hour with induced frame-time spikes and confirm the buffer fill level logged stays within bounds, no underruns are counted beyond the spikes, and audio-video offset never exceeds the target.",
    dep: ["audio-resampler", "frame-pacing", "host-audio-backend"]
  },
  "dsp-emulation": {
    s: "Emulates a dedicated sound or signal processor that runs its own program to mix voices, apply effects and decode compressed audio.",
    d: "Some systems hand audio to a separate programmable chip with its own small instruction set and memory. Software loads a program, the audio microcode, which handles voices, reverb and compression. The emulator can interpret or translate that program faithfully, or recognize known microcode and replace it with host code that produces the same output, a form of high-level emulation. The difficulty is that microcode is often custom per title, and replacement only works where it is recognized, while faithful execution costs steady processor time.",
    k: ["Run the original microcode versus replace with host code: running it is exact for any title, while replacement is faster but only covers the microcode versions the emulator knows.", "Execute on a separate thread versus inline: a thread uses another core, while inline is simpler and deterministic."],
    p: ["A new microcode version is not recognized, and the high-level path produces silence or noise.", "Execution timing of the audio chip differs from hardware, and music tempo drifts against the game."],
    v: "Run each known microcode version through both the faithful and the high-level path with identical commands and confirm output audio is bit-identical, or identical within documented differences.",
    dep: ["instruction-decoder", "component-synchronization", "hle-versus-lle", "sound-chip-model"]
  }
});
