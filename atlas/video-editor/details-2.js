// Details for the video editor plate, part 2: color, audio, titles.
ATLAS.details("video-editor", {
  "color-pipeline": {
    s: "Converts every clip from its own camera or broadcast encoding into one working space, applies grades there, and converts to the output space for each display or delivery.",
    d: "Each source carries a declared transfer function, primaries and range. On import the pipeline attaches an input transform that maps it into a working space, often a wide-gamut linear or log space in floating point. Grades and effects run there. At the end, an output transform maps to the monitor or deliverable, with tone mapping where the ranges differ. Transforms are composed into one operation where possible. The difficulty is metadata that is missing or wrong, and the fact that each stage has to agree with the others on conventions.",
    k: ["A fixed working space for everything vs per-clip native editing: a fixed space makes grades and blends consistent, while native editing avoids conversions but makes mixing sources hard.", "Scene-referred working space vs display-referred: scene-referred keeps highlights intact for later HDR and SDR outputs, but needs a deliberate tone mapping step."],
    p: ["A clip tagged with the wrong transfer function looks washed out, and the grade is built to fix the error rather than the footage.", "Converting through an 8-bit stage in the middle destroys the precision the floating-point pipeline was meant to keep."],
    v: "Import a chart shot in each supported camera encoding, run it through the pipeline to the display space, and confirm measured patch values on the vectorscope and waveform match published reference values within tolerance.",
    dep: ["metadata-extraction","float-precision","luts-and-transforms"]
  },
  "primary-correction": {
    s: "Global controls for exposure, contrast, white balance and saturation applied to a whole image, typically as lift, gamma and gain or as curves.",
    d: "Primary tools apply a small set of math operations to every pixel in the working space. Lift, gamma and gain act on shadows, mid-tones and highlights; offset shifts everything; curves map input to output values per channel. Tools work on RGB or on luma and chroma separately. The result is stored as parameters, which can be keyframed, and is evaluated as a shader. It is hard to give controls that do what a colorist expects across wildly different encodings, because the same slider behaves differently in log than in linear.",
    k: ["Operating in the working space vs in the clip's own encoding: the working space makes controls consistent, but control ranges must be rescaled to feel natural.", "Parametric wheels vs free curves: wheels are quick and intuitive, curves give exact control but are harder to match between shots."],
    p: ["Pushing gain in an eight-bit chain clips highlights that were available in the original media.", "Saturation applied after the display transform instead of before behaves differently when the output target changes."],
    v: "Apply a known gain and gamma to a ramp chart, and confirm the output ramp's measured values follow the formula within tolerance, with no clipping beyond what the formula predicts.",
    dep: ["color-pipeline","shader-runtime","keyframes-and-curves"]
  },
  "secondary-correction": {
    s: "Corrections limited to part of the image, selected by color, luminance or shape, such as changing a sky or a skin tone without moving the rest.",
    d: "A qualifier builds a matte from ranges of hue, saturation and luma, with softness and a clean-up step that removes noise from the matte. Shapes can be combined with the matte and tracked. The grade is then applied only where the matte is white. Several secondaries are stacked as nodes or layers. Quality depends on the matte: hard edges flicker over time, and compression noise in the source creates holes. The challenge is a stable, temporally smooth matte from noisy, compressed footage.",
    k: ["Qualifying in the working space vs in the display space: working-space mattes are stable across output targets, but the ranges feel unlike what the viewer sees.", "Per-frame mattes vs temporally filtered mattes: filtering removes flicker, but can lag behind fast movement."],
    p: ["A skin-tone qualifier on compressed footage flickers because chroma noise changes the matte each frame.", "A matte built on a proxy is applied to full resolution and its edges no longer line up."],
    v: "Qualify the blue sky of a test clip, shift its hue, and confirm unselected regions are bit-identical to the input, and the matte edge does not flicker over thirty consecutive frames beyond a set tolerance.",
    dep: ["color-pipeline","masks-and-tracking","primary-correction"]
  },
  "luts-and-transforms": {
    s: "Applies color lookup tables and mathematical transforms that convert between color spaces or apply a prepared look, using interpolation between table entries.",
    d: "A one-dimensional table maps each channel independently; a three-dimensional table maps RGB triples through a grid with trilinear or tetrahedral interpolation. Tables are loaded from files, validated for size and range, and uploaded to the GPU as textures. The pipeline can bake several transforms into one table to save time, at some cost in precision. It is hard because tables have conventions for input range and shaper curves that are often not declared in the file, and large tables cost memory.",
    k: ["Tetrahedral vs trilinear interpolation: tetrahedral preserves neutral axis better, while trilinear is simpler and available on all GPU texture hardware.", "Baking a chain into one table vs evaluating each step: baked is fast, but quantization errors accumulate and the original steps cannot be adjusted."],
    p: ["A table designed for log input applied to display-referred footage crushes the image.", "A small 17-point table on a steep curve shows banding in smooth gradients."],
    v: "Apply a table to a neutral ramp, and confirm that the neutral axis stays neutral, endpoints map to the table's stated endpoints, and GPU output matches a reference evaluation to within one code value.",
    dep: ["color-pipeline","texture-management","shader-runtime"]
  },
  "hdr-and-tone-mapping": {
    s: "Handles high dynamic range sources and outputs, mapping very bright scenes to what a given display can show, and preparing metadata for HDR delivery.",
    d: "HDR workflows use wider range transfer functions and a wider gamut, with absolute brightness in nits. The editor must show HDR on a capable display while also producing an SDR version. Tone mapping compresses highlights from the mastering range to the target range, either with a fixed curve or with per-scene metadata. Export writes the mastering information required by the delivery format. The difficulty is verification: without an HDR reference display, mistakes are invisible, and an SDR conversion of a grade can look very different.",
    k: ["One HDR grade with automatic SDR derivation vs separate trim passes: automatic is cheap, while trim passes give control and cost colorist time.", "Static vs dynamic tone-mapping metadata: static is simple and widely supported, dynamic follows each scene but needs support in the delivery chain."],
    p: ["Sending HDR signal to an SDR monitor with no tone mapping makes everything look dim and gray.", "Highlights beyond the declared mastering peak are clipped when the exported metadata understates them."],
    v: "Grade a test clip with a peak-brightness patch, export HDR and SDR deliverables, and confirm the metadata matches the measured peak, the SDR version retains highlight detail, and both play correctly on their reference displays.",
    dep: ["color-pipeline","luts-and-transforms","muxing"]
  },
  "video-scopes": {
    s: "Instruments that show image values as waveforms, vectorscopes, histograms and parades, so color and exposure are judged by numbers rather than by a monitor alone.",
    d: "Scopes sample the rendered frame, or a downscaled copy, and plot values: brightness against horizontal position for the waveform, hue and saturation on a circular plot for the vectorscope. They are computed on the GPU from the post-grade frame in the output space, and update during playback. Some scopes show legal-range limits for broadcast. The challenge is cost, since a waveform needs a full pass over every pixel, and accuracy: scopes must read the same values that will be delivered.",
    k: ["Computing scopes from the full-resolution frame vs a reduced one: full is exact for fine detail, while reduced is cheap enough to update in real time.", "Scopes in the output space vs in the working space: output space shows what will be delivered, working space shows what the grade operates on."],
    p: ["Scopes fed from the proxy show different noise and levels than the final render.", "A scope reading before the display transform declares a signal legal that clips on delivery."],
    v: "Feed a chart with known patches, compare waveform and vectorscope readings with the patch values, and confirm they agree within a code value and update at playback rate without dropped frames.",
    dep: ["color-pipeline","shader-runtime","playback-engine"]
  },
  "audio-tracks": {
    s: "Holds audio clips on tracks with sample-accurate edit points, fades, gain and channel layouts, running alongside the video timeline.",
    d: "Audio clips reference sample ranges of source files and carry gain, pan, fades and channel mapping, such as mono dialogue into a stereo track. Edit points can fall between video frames, so audio positions are stored in samples or exact rational time. Short automatic fades prevent clicks at cuts. Tracks have a channel layout and feed buses in the mixer. Linked audio follows its video clip. It is hard because audio has sample precision while video has frame precision, and edits must be consistent for both.",
    k: ["Sample-accurate audio edit points vs frame-snapped: sample accuracy allows clean cuts on breaths and beats, while frame snapping keeps video and audio edits simple.", "Per-track fixed layouts vs per-clip channel mapping: fixed layouts are easy to reason about, per-clip mapping handles messy field recordings."],
    p: ["A cut without a micro-fade produces a click that is audible on speakers but not on headphones in the edit room.", "Mono sources placed on stereo tracks with wrong mapping play from only one speaker."],
    v: "Place two clips with a cut mid-waveform, render the audio, and confirm the output samples around the cut match the expected values for the chosen fade and no discontinuity larger than the fade allows is present.",
    dep: ["timeline-model","rational-time","media-file-io"]
  },
  "mixer-and-routing": {
    s: "Combines tracks through buses, sends and a master output with level, pan and automation, forming the final stereo or surround mix.",
    d: "Each track has a fader, pan, mute and solo, and feeds buses by routing. Buses group dialogue, music and effects, and apply shared processing. Automation records fader or pan moves over time as keyframes or in real time while playing. The mixer processes audio in blocks on a dedicated real-time thread with a fixed latency. The output layout is set by the project. It is hard to keep this thread free of allocation and locks, and to account for effect latency so tracks stay aligned.",
    k: ["Fixed block size processing vs variable: fixed blocks simplify effects and timing, but trade latency for stability.", "Automation as keyframes vs recorded streams: keyframes are editable and compact, while recorded streams capture human nuance but must be simplified."],
    p: ["An effect that adds latency on one bus puts that bus out of sync with the others when there is no compensation.", "An allocation or lock in the audio thread causes crackles under load that no unit test shows."],
    v: "Route a test tone through two buses with known gains and one latency-inducing effect, render, and confirm sample-level alignment after compensation and output level matching the expected gain staging.",
    dep: ["audio-tracks","audio-effects","job-system"]
  },
  "audio-effects": {
    s: "Processors applied to tracks or buses, such as equalizers, compressors, reverbs and limiters, each with parameters that can be automated and bypassed.",
    d: "Audio effects process blocks of samples with internal state, so they cannot simply be evaluated at an arbitrary time as a video effect can. Playing from a new position requires warming their state up. Offline rendering uses the same code at a higher precision or without a deadline. Each effect reports its latency, which the mixer compensates for. Parameters are smoothed to prevent clicks. The difficulty is determinism: the playback result and the export result must sound the same.",
    k: ["Stateful processors with a pre-roll when seeking vs stateless approximations: pre-roll gives correct tails and filter states, but costs time on every jump.", "Hosting third-party effects in-process vs out-of-process: in-process is fast, out-of-process contains crashes but adds latency and complexity."],
    p: ["Jumping the playhead into the middle of a reverb tail makes it start silent and then sound different from the render.", "A compressor without sidechain lookahead compensation produces a different result in export than in playback."],
    v: "Play a section from a cold start and from a pre-rolled position, render the same section offline, and confirm the three outputs match within a defined sample tolerance.",
    dep: ["plugin-host","mixer-and-routing","job-system"]
  },
  "loudness-control": {
    s: "Measures program loudness with standard methods and applies normalization or limiting, so delivered audio meets broadcast and streaming targets.",
    d: "Loudness meters follow a published algorithm: K-weighted filtering, gating of silence and short-term windows, giving integrated, short-term and momentary values and true peak. The editor shows them live and can analyze a whole mix offline. Normalization applies a gain or limiter to meet a target, such as a given integrated level and peak ceiling. Dialogue and music are sometimes measured separately. The hard parts are correct gating, true-peak detection with oversampling, and re-measuring after any later change.",
    k: ["Normalizing by gain only vs adding a limiter: gain preserves dynamics but may exceed the peak ceiling; a limiter guarantees the ceiling but alters transients.", "Measuring the whole program vs dialogue only: whole-program matches broadcast rules, while dialogue measurement suits streaming rules."],
    p: ["Measuring before the final limiter and delivering after it gives different numbers than the ones that were checked.", "Sample peak is checked instead of true peak, and the file clips after lossy encoding."],
    v: "Analyze a reference signal of known loudness, confirm the meter reads the published value, normalize a mix to target, then re-measure the exported file and confirm it meets integrated level and true-peak limits.",
    dep: ["mixer-and-routing","audio-effects","encoder-integration"]
  },
  "noise-and-repair": {
    s: "Tools that reduce hiss, hum, clicks and room noise in recorded audio, often by analyzing a sample of the noise and subtracting its spectrum.",
    d: "Repair processors work in the frequency domain. Noise reduction learns a noise profile from a silent passage, then attenuates matching components in each frame. Hum removal uses notch filters at a mains frequency and its harmonics. Click removal detects short spikes and interpolates over them. These are applied as effects or as destructive renders to new files. They are hard because aggressive settings create watery artifacts, and because speech and noise overlap in frequency.",
    k: ["Non-destructive effect vs rendered replacement: effect keeps the original recoverable, but costs CPU on every playback pass.", "Profile-based vs learned models: profile-based is predictable and light, learned models separate speech better but are heavier and can invent sound."],
    p: ["Heavy noise reduction leaves speech sounding underwater, which is unnoticed on small speakers.", "A noise profile taken from a different room settings removes parts of the voice."],
    v: "Add known noise to a clean voice recording, process it, and compare with the clean source: confirm the noise floor drops by the target amount with measured speech distortion below a stated limit.",
    dep: ["audio-effects","background-jobs"]
  },
  "sync-and-drift": {
    s: "Aligns separately recorded sound with picture, using timecode, waveform matching or a clap, and corrects slow differences in recorder clocks.",
    d: "Dual-system recording captures sound apart from the camera. Sync uses shared timecode, or finds the offset by matching the camera's scratch audio to the recorded sound. Two devices rarely run at exactly the same sample rate, so over a long take the audio drifts from the picture. The editor measures the offset at the start and end and applies a tiny resample or time-stretch. It is hard because offsets are fractions of a frame and drift is small enough to be missed until an hour into a take.",
    k: ["Waveform matching vs timecode: waveform matching works without a shared clock, but needs usable scratch audio; timecode is exact where devices were jammed.", "Resampling to remove drift vs cutting and re-syncing at intervals: resampling is continuous, while re-syncing preserves audio quality at the price of many edits."],
    p: ["A clip synced at the head is half a second off at the end of a long interview.", "Variable frame rate camera files cause the picture to lose sync against constant rate audio."],
    v: "Sync a long take at both ends, measure the offset of a sync marker at start, middle and end, and confirm all stay within a quarter of a frame after drift correction.",
    dep: ["audio-tracks","rational-time","metadata-extraction","variable-frame-rate"]
  },
  "text-layout": {
    s: "Positions and renders text for titles, applying fonts, kerning, line breaking and styling, including scripts that need shaping and right-to-left order.",
    d: "Text is converted to glyphs through shaping, which handles ligatures, accents and scripts where letters change form. Lines are broken to a box width, justified or aligned, and styled with fill, outline and shadow. Rendering produces vector outlines rasterized at the project resolution, or distance fields for scalable animation. The result is an image with alpha placed on the timeline. It is hard to be correct for all languages, and to give the same result in preview, on other machines and in export.",
    k: ["Rasterizing text per frame from vectors vs caching a bitmap: per-frame stays sharp under animated scale, while a cached bitmap is faster but blurs when scaled.", "Bundling fonts with the project vs using system fonts: bundling reproduces titles on any machine, but raises licensing concerns."],
    p: ["A missing font is silently replaced and changes the line breaks of every title.", "Shaping done in the preview but not in export causes accented or Arabic text to render wrong in deliverables."],
    v: "Render titles in a Latin, an Arabic and a Devanagari sample on two different machines, and confirm line breaks, glyph shapes and pixel output are identical to a stored reference.",
    dep: ["gpu-abstraction","media-file-io","shader-runtime"]
  },
  "title-templates": {
    s: "Reusable title designs with editable fields and built-in animation, so a lower third or credit roll can be changed by typing new text.",
    d: "A template is a small graphic project with named exposed parameters: text fields, colors, images and timing. Dropping it on the timeline creates a clip with those parameters in the inspector. Animation presets are keyframe sets scaled to the clip duration, with fixed in and out sections that hold in the middle. Templates are stored in libraries and may be shared among a team. The challenge is robustness: long names, empty fields and different frame sizes must not break the design.",
    k: ["Templates that scale animation to clip length vs fixed-duration templates: scaling fits any clip, while fixed timing is predictable but needs trimming.", "Exposing a few parameters vs the full graphic: few parameters protect the design, while full access allows customization at the risk of breaking it."],
    p: ["A template tested with short names overflows its box when a long name is typed.", "A shared template that refers to a missing local image renders blank on another machine."],
    v: "Fill a template with an empty, a normal and a very long text value, and confirm the layout adapts without overflow, the animation holds for the clip's duration and the exported frames match references.",
    dep: ["text-layout","keyframes-and-curves","project-file"]
  },
  "captions": {
    s: "Stores timed text for subtitles and closed captions, with styles, positions and languages, and delivers it as burned-in picture or as separate tracks.",
    d: "Captions are a list of text cues with start and end times, style and screen position, grouped by language track. They are authored by hand, imported from files, or produced by speech recognition and then corrected. Delivery can burn them into the image, or write them as sidecar files or as data inside the container, each with format rules for line length, reading speed and character sets. It is hard because rules differ by platform, and because a retimed or re-cut sequence must carry captions with it.",
    k: ["Captions as a track on the timeline vs separate documents: a track follows edits automatically, while separate documents suit translations that outlive a cut.", "Burned-in vs separate tracks: burned-in is guaranteed to display, while separate tracks can be turned off and translated."],
    p: ["Captions timed against a rough cut stay on screen over a scene that was later removed.", "A cue with too many characters per line is rejected by the destination platform at upload time."],
    v: "Import cues, re-cut the timeline, and confirm each cue still aligns with its spoken line; export sidecar and embedded tracks and check them against the destination validator.",
    dep: ["timeline-model","text-layout","muxing","delivery-targets"]
  },
  "shapes-and-lower-thirds": {
    s: "Vector shapes, lines and bars used to build graphics such as name straps, callouts and backgrounds, animated with the common keyframe system.",
    d: "Shapes are described as paths with fill, stroke and gradient, drawn on the GPU at the project resolution so they stay sharp at any scale. Groups combine shapes with text and masks, and presets assemble them into lower thirds that slide in, hold and out. Because they are generated, they carry alpha and need no source media. The difficulty is antialiasing quality and consistent behavior with blend modes, along with keeping complex vector scenes fast during playback.",
    k: ["Rendering vectors directly each frame vs rasterizing once: direct stays sharp under animation, while rasterizing once is cheaper for static graphics.", "Shape primitives vs imported vector artwork: primitives are lightweight and editable, while artwork brings complex designs but may use unsupported features."],
    p: ["Hairline strokes shimmer when moved because antialiasing varies with position.", "A complex imported vector slows playback so much that real-time titles drop frames."],
    v: "Animate a rounded bar across the frame and confirm its edges are smoothly antialiased at every position, alpha is correct over a checkerboard, and playback holds the full frame rate.",
    dep: ["gpu-abstraction","keyframes-and-curves","compositing-and-blending"]
  }
});
