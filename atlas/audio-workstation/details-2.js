// Details for the audio workstation plate, part 2: MIDI, automation, time and pitch, mixing, plugin hosting.
ATLAS.details("audio-workstation", {
  "midi-device-io": {
    s: "Opens hardware and virtual MIDI ports, receives timestamped messages from controllers and sends messages out to instruments and surfaces.",
    d: "Each port is exposed by the operating system with its own callback thread or queue. The workstation converts incoming bytes into events, stamps them with the time they arrived, and hands them to the engine through a lock-free queue. Outgoing messages are scheduled against the output clock so they leave on time. Some devices need system-exclusive dumps, running status handling and active sensing. The hard part is timestamps: the operating system's time and the audio clock differ, and jitter on the incoming side is audible as loose timing.",
    k: ["Timestamping at the driver vs at the application: driver stamps are more accurate and not always available, application stamps include thread scheduling jitter.", "Merging all ports into one stream vs keeping ports separate: one stream is simple to route, and separate ports preserve the device identity needed for per-device mapping."],
    p: ["A device hot-unplugged mid-session leaves a dead port reference that blocks the queue or crashes when written to.", "Large system-exclusive messages sent in one write overflow a slow device's buffer and are dropped."],
    v: "Loop a controller's output into the workstation, play a fast known pattern and confirm every note arrives in order with timestamp spacing within one millisecond of the performed spacing.",
    dep: ["event-timestamps", "lock-free-queues"]
  },
  "midi-event-model": {
    s: "The in-memory representation of notes, controllers, pitch bends, program changes and system messages, with a position, a channel and a stable identity for editing.",
    d: "Events are stored sorted by time with a defined tie-break so that, for example, a note-off at the same instant as a note-on of the same pitch is handled predictably. Higher-level notes pair on and off, and controllers may be stored as curves. Resolution is expressed in ticks per quarter note, or as floating positions, which determines quantization accuracy. Import of arbitrary files requires cleaning up stuck notes, running status and overlapping notes. The model must be efficient to scan for playback and flexible for editing.",
    k: ["Ticks as integers vs floating positions: integers are exact and sortable, floats avoid resolution limits but cause equality problems.", "Storing notes as paired objects vs raw on/off events: paired notes are easier to edit and draw, raw events preserve exactly what was received and what a device expects."],
    p: ["A tie-break that sends note-on before the preceding note-off of the same pitch leaves the note cut short on instruments that treat them as one voice.", "Unmatched note-on events from an imported file are held forever and hang a synth voice."],
    v: "Import a dense standard file, export it again, and compare both event lists. All events match in time, channel and order, and no note hangs when playback stops mid-song.",
    dep: []
  },
  "midi-clips-and-quantize": {
    s: "Containers of events on the timeline and the tools that correct their timing, such as quantization, groove templates, swing and humanizing.",
    d: "A MIDI clip holds events relative to its start and plays through the instrument chain on its track. Quantization snaps note starts, and optionally ends, toward a grid by a strength percentage, preserving some of the original feel. Groove templates borrow timing and velocity patterns from other clips or audio. Operations can be applied destructively or as live non-destructive properties. Transform tools handle overlaps and legato. The hard part is that each choice changes how the music feels, and the live version must be exactly reversible.",
    k: ["Live quantize vs applying it permanently: live preserves the original performance and costs extra computation each pass, while permanent edits keep playback simple.", "Quantizing note starts only vs starts and lengths: starts-only preserves articulation, and full quantization produces mechanical results that may need cleanup."],
    p: ["Quantizing overlapping notes of the same pitch collapses them into one and loses the shorter note.", "Strength percentages applied repeatedly drift events toward the grid in an uneven way."],
    v: "Quantize a played pattern at 50 percent strength, then undo, and confirm every event returns to its recorded position exactly. Check the quantized notes sit halfway between original and grid.",
    dep: ["midi-event-model", "tempo-map"]
  },
  "virtual-instruments": {
    s: "Plugins or built-in synths and samplers that turn MIDI events into audio, running inside the audio graph like an effect with an event input.",
    d: "An instrument receives a list of timestamped events for each buffer, with offsets in samples, and renders its voices into an output buffer. Sample playback instruments stream large libraries from disk with preloaded starts and a separate loader thread. Polyphony and voice stealing decide what happens when the instrument runs out of voices. Instruments may expose several audio outputs and receive sidechain input. The hard part is load: a loaded orchestral library can occupy gigabytes and take seconds to restore.",
    k: ["Instrument in the graph with its own events vs rendering MIDI to audio early: live instruments stay editable and cost CPU, while rendered audio is cheap and loses expression editing.", "Preloading sample starts in memory vs streaming everything: preloading allows instant attacks and uses RAM, streaming scales to large libraries and risks late starts."],
    p: ["Events delivered with buffer-start timestamps instead of sample offsets make notes quantized to the buffer size.", "A big library loaded on the main thread locks the interface for the duration of a project open."],
    v: "Play a fast repeated note through a sampler at a 512-sample buffer and confirm every onset lands at its scheduled sample, not rounded to the buffer start.",
    dep: ["plugin-host-wrapper", "sample-accurate-scheduling", "midi-routing"]
  },
  "midi-routing": {
    s: "Directs MIDI from controllers and clips to instruments and hardware, with channel filtering, transposition, merging and splitting between tracks.",
    d: "Each track has a MIDI input source that may be a device, another track or all inputs, and an output to an instrument, a hardware port or another track. Along the path, filters can remap channels, limit note ranges, transpose or change velocity. Multi-timbral instruments need one track per channel or a splitter. Routing changes must apply without stopping the engine. Feedback loops, where an instrument's MIDI output feeds back to its own input, must be prevented. Note off messages must follow when routing changes, so notes do not hang.",
    k: ["MIDI routed as separate graph edges vs hidden inside the audio graph: separate event routing is simpler to reason about, and a unified graph lets one scheduler order both.", "Filtering at input vs at the instrument: input filtering keeps instruments simple, while instrument-side filtering preserves what was recorded."],
    p: ["Changing a track's input while a key is held leaves a note-on with no note-off and the voice hangs.", "A loop between two tracks echoes events forever and fills the queue."],
    v: "Route one keyboard to two instruments split at middle C, hold a note on each side while changing the routing, and confirm both notes stop without any stuck voice.",
    dep: ["midi-device-io", "audio-graph"]
  },
  "midi-clock-and-sync": {
    s: "Keeps the workstation in step with external gear using clock pulses, start and stop messages, position pointers and timecode.",
    d: "As a leader, the workstation sends 24 clock pulses per quarter note on a schedule derived from the tempo map, plus start, stop and position messages. As a follower it measures the incoming pulse spacing, estimates tempo and phase, and adjusts its transport to match. Timecode-based sync locks to absolute time rather than tempo. Clock pulses need low jitter, which MIDI hardware delivers poorly. The hard part is following a drifting source without audible speed wobbles and without constantly relocating the playhead.",
    k: ["Smoothing incoming clock with a filter vs following it exactly: filtering gives a stable tempo and slow response, while following exactly tracks tempo changes and passes jitter through.", "Leading as the master vs following: leading gives sample-accurate internal timing, following is needed when a hardware sequencer is the master."],
    p: ["Reacting to every clock pulse as a tempo measurement makes playback speed visibly wobble.", "Clock sent from the interface thread rather than the audio thread arrives with irregular spacing that devices interpret as tempo changes."],
    v: "Slave the workstation to a hardware sequencer for ten minutes and compare click positions on both. The offset stays within a few milliseconds without growing.",
    dep: ["midi-device-io", "tempo-map", "event-timestamps"]
  },
  "expression-and-mpe": {
    s: "Per-note pitch, pressure and timbre control, which gives each sounding note its own continuous parameters instead of sharing them across a channel.",
    d: "Standard MIDI applies pitch bend and controllers to a whole channel, so notes in a chord cannot move independently. The per-note scheme assigns each note its own channel so every note carries its own bend, pressure and slide values. Newer event types can also address individual notes directly. The workstation must record, edit, route and quantize these, treat note channels as a group, and let instruments receive them intact. The difficulty is editing: the data is dense, belongs to individual notes, and many tools assume channel-wide controllers.",
    k: ["One channel per note vs note-addressed expression events: channel-based schemes work on older hardware, and note-addressed events are cleaner but require instrument support.", "Storing the expression as dense controller streams vs fitted curves: streams reproduce a performance exactly, and curves are easier to edit and smaller."],
    p: ["Treating the per-note channels as independent tracks scatters a single performance across many clips.", "Applying a global pitch bend range of the wrong size makes bends sound out of tune on instruments set differently."],
    v: "Record a chord where each note is bent differently, play it back and confirm each note follows its own bend, and that moving the clip keeps all channels together.",
    dep: ["midi-event-model", "virtual-instruments"]
  },
  "automation-lanes": {
    s: "Timelines of recorded or drawn values for a single parameter, shown beside the track and replayed during playback.",
    d: "A lane holds a list of breakpoints with time, value and curve shape for one parameter, identified by a stable address. At playback the engine looks up the value at the start of each buffer, or at finer steps within it, and applies it to the parameter. Lanes can belong to clips, so moving the clip moves the moves, or to the track. The editing tools include drawing, scaling, thinning dense recordings and copying between lanes. A recorded gesture produces thousands of points that need to be reduced without changing its shape.",
    k: ["Track-level lanes vs clip-level automation: track lanes are the standard picture of a mix, and clip-level automation travels with edits at the cost of more places to look.", "Storing every recorded point vs simplified breakpoints: raw points are faithful and heavy, simplified points edit easily and lose fine detail."],
    p: ["Dense recorded points cause slow redraw and heavy playback cost when never thinned.", "An automation lane linked to a deleted plugin parameter is kept hidden and still applies a stale value."],
    v: "Record a fader move for one minute, thin the lane, and compare the played values to the original. The maximum deviation is below the chosen tolerance and the point count is much lower.",
    dep: ["parameter-addressing", "timeline-model", "curve-interpolation"]
  },
  "parameter-addressing": {
    s: "The stable naming scheme that lets automation, control surfaces and presets refer to a parameter on a track, plugin or send without depending on position.",
    d: "Each parameter has an address made of the owner id, which may be a track, a send or a plugin instance, and a parameter id plus metadata: range, default, unit and whether it is stepped. Plugins publish their own parameter lists, which can change as the plugin loads or after it updates. The addressing layer maps between those lists and stable project ids, so automation continues to work across plugin versions. The hard part is handling plugins that renumber, rename or remove parameters.",
    k: ["Addresses by index vs by stable id: indices are trivial and break whenever a plugin adds a parameter, while ids survive updates and require the plugin to supply them.", "Normalized zero-to-one values vs real units: normalized values simplify automation and mapping, and real units are what users read and what hosts need for tempo-synced values."],
    p: ["Automation stored against a parameter index plays on the wrong control after a plugin update.", "Stepped parameters interpolated like continuous ones pass through meaningless values."],
    v: "Automate a plugin parameter, update the plugin to a version that inserts a new parameter before it, reopen the project and confirm the automation still drives the same control.",
    dep: ["plugin-host-wrapper"]
  },
  "automation-modes": {
    s: "Behaviors for writing automation during playback: read, write, touch, latch and trim, which decide what happens when the user releases a control.",
    d: "In read mode the lane drives the parameter. In write mode the current control position overwrites the lane for as long as playback runs. Touch writes while the control is held and then returns to the existing curve, over a ramp. Latch keeps writing at the last value after release. Trim adds a relative offset on top of the existing curve. The engine needs to know whether a control is being touched, which hardware faders report and mice do not always. The hard part is making the join with the old curve smooth.",
    k: ["Touch vs latch: touch restores the existing curve on release and is safe to use, while latch holds the last value and is faster to write but easy to leave on by mistake.", "Writing at the control rate vs only on change: writing on change keeps lanes small and misses holds, while a fixed rate captures everything and fills the lane."],
    p: ["Leaving write mode armed and pressing play overwrites a finished automation lane with a flat line.", "A touch release without a ramp creates a step that clicks on volume and filter parameters."],
    v: "Write a lane, then touch-edit the middle section and release. Play back and confirm the edited section follows the gesture and the surrounding sections are untouched, with a smooth return.",
    dep: ["automation-lanes", "control-surfaces"]
  },
  "curve-interpolation": {
    s: "The functions that compute parameter values between automation points: step, linear, exponential, smooth and user-shaped curves.",
    d: "Given two breakpoints and a curve shape, the engine computes the value at any time between them. Choices matter by parameter type: gain and frequency are perceived on exponential scales, so a linear curve in real units sounds uneven. Curves are evaluated for each sample or each small block, and the evaluation must be cheap and deterministic. Curves also have to make sense at breakpoint boundaries so there are no discontinuities in slope that cause audible artifacts. Tempo and warp curves need invertible forms.",
    k: ["Interpolating in the parameter's perceptual domain vs in raw units: perceptual interpolation sounds even and requires a defined scale for each parameter.", "Evaluating per sample vs per block: per-sample is smooth and costs more, per-block is cheaper and needs smoothing to hide the stair steps."],
    p: ["A linear ramp on a frequency parameter spends most of its time at high frequencies, so a sweep seems to rush at the end.", "Curves that overshoot between points push a bounded parameter outside its range."],
    v: "Sweep a filter from 100 Hz to 10 kHz over four seconds with exponential interpolation and confirm the measured cutoff passes 1 kHz at the two-second mark.",
    dep: []
  },
  "automation-smoothing": {
    s: "Slews parameter changes over a few milliseconds so jumps in automation or controls do not produce audible clicks in the audio.",
    d: "A parameter smoother holds the current and target values and moves between them with a short ramp, linear or one-pole, computed per sample on the audio thread. Gain, pan and filter coefficients almost always need it. Smoothing time trades responsiveness against clicks. Some parameters, such as a bypass or a mode switch, cannot be smoothed and must be crossfaded between two states. Smoothing interacts with automation resolution: if automation is applied once per buffer, the ramp must span the whole buffer.",
    k: ["Smoothing in the host vs inside each plugin: host smoothing covers every plugin parameter at once, and plugin smoothing understands its own parameters' needs.", "Short vs long ramps: short ramps keep controls responsive and let clicks through on large jumps, long ramps feel sluggish on rapid moves."],
    p: ["A buffer-sized step in gain without any ramp produces a click at every automation value change.", "Smoothing a stepped parameter such as a filter type sweeps through meaningless intermediate states."],
    v: "Jump a gain from 0 to 1 at a sample boundary with smoothing on and off and inspect the spectrum. The smoothed version has no broadband click energy above the noise floor.",
    dep: ["audio-callback"]
  },
  "time-stretch-engine": {
    s: "Changes audio duration without changing pitch, using algorithms chosen for the material: tonal, percussive, polyphonic or voice.",
    d: "Phase-vocoder methods work in the frequency domain, moving and rebuilding spectral peaks, and suit sustained tones. Time-domain overlap methods copy and splice small segments at pitch-period boundaries, and suit monophonic or rhythmic material. Transient-preserving modes detect hits and avoid smearing them. Quality degrades with extreme ratios and complex mixes. The engine must run both on the audio thread for live stretching, with latency from its analysis window, and offline for higher quality.",
    k: ["Live real-time stretching vs pre-rendering stretched audio: live stretching keeps ratios editable and costs CPU on every track, rendering frees CPU and locks the result.", "Frequency-domain vs time-domain methods: frequency methods keep complex harmony intact and soften transients, time-domain methods keep attacks sharp and glitch on polyphony."],
    p: ["A single algorithm applied to all material smears drum hits or makes sustained vocals sound metallic.", "The stretcher's internal latency is not reported, so stretched tracks play late against the rest."],
    v: "Stretch a drum loop and a sustained chord by 150 percent with each mode and compare transient sharpness and pitch. Pitch stays unchanged within a few cents and drum attacks remain short in the transient mode.",
    dep: ["transient-detection", "simd-dsp-kernels"]
  },
  "pitch-shifting": {
    s: "Changes the pitch of audio while keeping its length, with optional formant preservation so voices do not sound like cartoons when shifted.",
    d: "Pitch shifting is stretching combined with resampling: the audio is stretched by a factor and resampled back to its original length. Formant correction keeps the spectral envelope, which defines vocal character, in place while moving the harmonic structure. Monophonic correction tracks the pitch of a single voice and moves each note to a target; polyphonic editing separates notes within a chord. The hard part is artifacts at large shifts and the pitch detection that guides correction in noisy or breathy material.",
    k: ["Formant preservation vs plain shifting: preserved formants keep a voice natural over several semitones, and the computation increases and can create a processed sound.", "Pitch correction as a clip property vs as a plugin: clip-level correction travels with edits and is tied to analysis data, while a plugin is general and recomputes in the chain."],
    p: ["Shifting a voice more than a few semitones without formant handling produces an obviously artificial timbre.", "Pitch detection errors on breaths and consonants make the corrector jump by an octave."],
    v: "Shift a recorded sung note up three semitones and measure its fundamental. It lands within five cents of the target and the formant peaks stay at their original frequencies when preservation is on.",
    dep: ["time-stretch-engine", "sample-rate-conversion"]
  },
  "transient-detection": {
    s: "Finds the onsets of notes and hits in audio, producing the markers that stretching, slicing and quantization use as anchor points.",
    d: "The detector computes an onset strength signal, such as the change in spectral energy over short windows, then picks peaks above an adaptive threshold. Sensitivity controls trade missed hits against false hits from noise and sustained pitch changes. Detection runs offline after import or recording and stores the markers with the clip. Results can be edited by hand. Accuracy matters at the sample level when the markers drive quantization, so a refinement step localizes the exact attack within the window.",
    k: ["Energy-based detection vs spectral-flux methods: energy is cheap and works for drums, spectral methods catch soft or tonal onsets and cost more.", "Automatic markers vs fully manual: automatic is fast on clean tracks and needs correction on dense material, manual is exact and slow."],
    p: ["A bass or reverb tail triggers false transients, which then become unwanted warp points.", "Markers placed at the start of the detection window rather than the attack leave quantized hits late by several milliseconds."],
    v: "Run detection on a click track at 120 BPM with known sample positions. Every click is found, no extras appear, and each marker is within a few samples of the true onset.",
    dep: ["simd-dsp-kernels"]
  },
  "warp-markers": {
    s: "Anchors that tie positions in an audio clip to positions on the timeline, so the program stretches the audio between them to follow the project tempo.",
    d: "Each marker maps a source time to a timeline time. Between markers the engine applies a stretch ratio, which makes a loop follow tempo changes or lets a drummer's loose timing be tightened to the grid. Markers can be generated from detected transients or tempo, or placed by hand. The clip reader must produce correctly stretched audio at any playback start position, which needs a state that can be resumed or rebuilt. The hard part is continuity at marker boundaries when the ratio changes abruptly.",
    k: ["Many markers on every transient vs few along the beat: dense markers tighten timing completely and stress the stretcher, while sparse markers keep the feel and leave drift.", "Warping live in the clip reader vs rendering a warped file: live warping stays editable, and rendering gives exact repeatability and cuts CPU."],
    p: ["Abrupt ratio changes between adjacent markers cause audible pitch wobble or a stutter in the stretched audio.", "Starting playback inside a warped region without priming the stretcher yields a faint glitch at the start."],
    v: "Warp a loose-tempo recording to a grid with markers on each beat and confirm every transient lands within a few milliseconds of its beat line on playback from any start point.",
    dep: ["time-stretch-engine", "transient-detection", "tempo-map"]
  },
  "tempo-detection": {
    s: "Estimates the tempo and beat positions of an audio file so it can be placed on the grid or used to set the project tempo.",
    d: "The analyzer computes an onset strength envelope and looks for periodicity using autocorrelation or comb-filter banks, producing a tempo candidate with confidence. Beat tracking then finds the phase and follows tempo drift through the file. Common errors are half or double tempo and offset beats. The results seed the warp markers. Accuracy on live-played material with drift is lower than on programmed music, so the user needs to be able to tap the tempo or correct the first beat.",
    k: ["A single constant tempo vs tracking tempo drift: constant tempo is stable for programmed music, drift tracking suits live bands and is more error-prone.", "Automatic results applied directly vs shown as suggestions: direct application is quick, suggestions avoid wrong grids that a user silently builds on."],
    p: ["A half-time or double-time error shifts every beat grid line and appears correct on the first bar.", "Beat phase off by an eighth note makes every quantized edit land between the beats."],
    v: "Run detection on ten tracks with known tempos, including live-played ones, and confirm the result is correct within 0.5 percent or off by a clean factor of two flagged as ambiguous.",
    dep: ["transient-detection"]
  },
  "channel-strips": {
    s: "The standard unit of a mixer: input, insert effects, gain, pan, sends, mute and solo, and an output, arranged in a fixed signal order.",
    d: "A strip is a small subgraph: input trim, a chain of inserts, a fader, a pan or panner, post-fader inserts and sends, then output routing. Order matters, for example whether a send is taken before or after the fader. Strips exist for audio tracks, instruments, buses and the master. They share the same parameter model, so automation and control surfaces treat them uniformly. The graph is rebuilt when inserts are added, removed or reordered, which must happen while playing without interruption.",
    k: ["A fixed strip order vs a free-form chain: a fixed order is familiar and predictable, free-form allows any routing and is harder to read.", "Strips as graph nodes vs a separate mixer layer: graph nodes make the mixer and engine the same thing, and a separate layer keeps user concepts clear and needs translation."],
    p: ["Adding an insert while playing rebuilds the chain on the audio thread and drops buffers.", "Unclear pre-fader and post-fader send behavior makes a muted fader still send to reverb, or fade out without the reverb tail."],
    v: "Add, reorder and remove inserts on a playing channel while measuring the output with a test tone. The tone shows no gaps, and the new order is audible in the output spectrum.",
    dep: ["audio-graph", "plugin-host-wrapper", "buses-and-sends"]
  },
  "buses-and-sends": {
    s: "Shared mix points that tracks feed in different amounts: effect returns, submixes for groups of instruments and parallel processing paths.",
    d: "A send copies a track's signal at a chosen point, scales it and delivers it to a bus. A group bus sums several tracks so they can be processed together, then passes to the master. The graph of buses must be acyclic, or contain only deliberate feedback with a delay. Sends can be pre or post fader and may be automated. Bus processing happens only once the contributing channels have rendered, which fixes the processing order. Delay compensation must be applied along the sends, not just the main outputs.",
    k: ["Sends as additional graph edges vs as hidden copies: edges make dependencies visible to the scheduler and compensation, hidden copies are simpler and bypass delay alignment.", "Bus processing on every track instead of a group: individual processing is flexible and costs far more CPU than one shared effect."],
    p: ["A send that feeds a bus which feeds the same track back creates a loop that silences or oscillates.", "Sends skipped in latency compensation cause the reverb return to arrive earlier than the dry signal."],
    v: "Send three tracks to one reverb bus, solo-bypass the reverb and confirm null against the dry sum. Then enable it and confirm the wet signal is time-aligned with the dry.",
    dep: ["audio-graph", "plugin-delay-compensation", "processing-order-and-cycles"]
  },
  "grouping-and-vca": {
    s: "Ways to control several channels together: linked faders that move as one, and control-only groups that scale levels without any audio passing through them.",
    d: "A linked group applies one operation to every member parameter, with relative or absolute behavior. A VCA-style control group adds an offset on top of each member's own fader without summing their audio, so sub-mixes stay intact and the master fader can ride a whole drum kit. Groups can also share mute, solo and arm states. Gain from a group and from the member's own fader must combine in a defined way, in decibels and not linear, or levels will not match what the display shows.",
    k: ["Linked faders vs control-only groups: linked groups are simple and change every member's stored value, while control groups leave member levels intact and add one more layer to understand.", "Relative vs absolute group movement: relative preserves the balance and has trouble at the ends of the range, absolute is easy to predict and flattens the balance."],
    p: ["A group fader that hits a member's minimum then returns causes the balance to shift permanently.", "Multiplying group and member gain in linear terms while the display shows decibel addition makes the numbers disagree with the sound."],
    v: "Group eight faders, drag the group down by 6 dB and back, and confirm every member returns to its exact starting value and the output level matched the displayed offsets.",
    dep: ["channel-strips", "parameter-addressing"]
  },
  "routing-matrix": {
    s: "A view and data model of all signal connections between track outputs, bus inputs, plugin sidechains and hardware, with checks to prevent loops.",
    d: "The routing matrix presents sources and destinations, each with a channel count, and lets users connect any compatible pair. Underneath it edits edges in the audio graph. Channel layout mismatches, such as mono into stereo or stereo into surround, require explicit up- or down-mix rules. Hardware inputs and outputs appear alongside internal buses. The matrix verifies that a new connection does not create a cycle before accepting it, and applies the change through the graph compiler, so playback continues.",
    k: ["Rejecting loops at edit time vs allowing deliberate feedback: rejecting is safe and simple, allowing supports creative feedback with an added delay and risk of runaway gain.", "Implicit channel conversion vs explicit mix rules: implicit conversion is convenient and hides level changes, explicit rules are visible and require more setup."],
    p: ["A mono track routed to a stereo bus without a defined pan law plays 3 dB louder or only on one side.", "Rerouting to a hardware output that disappeared silently sends audio nowhere."],
    v: "Connect every pair of sources to every compatible destination in a script, verify cycles are rejected, and play a tone through each route to confirm it arrives at the intended output and no other.",
    dep: ["audio-graph", "graph-compiler", "device-enumeration"]
  },
  "pan-laws-and-surround": {
    s: "The rules for distributing a signal across stereo or surround speakers, including the gain applied at the center position so panning does not change loudness.",
    d: "A pan law defines how left and right gains vary with position. A constant-power law drops the center by about 3 dB so total acoustic power stays steady in a room, while linear laws keep amplitude and dip in power. Other laws use 4.5 or 6 dB. Surround panners extend this over speaker layouts, and immersive formats add height and object positions. The master's channel layout sets what every upstream panner must produce, and downmix for headphones or mono must be consistent with it.",
    k: ["Constant-power vs constant-gain pan law: constant-power sounds even in rooms, constant-gain sums correctly in mono and sounds quieter at the center when panned.", "Channel-based layouts vs object-based panning: channels are simple and fixed to a speaker setup, objects keep positions and need a renderer for each playback system."],
    p: ["Panning law mismatches between stems and master shift the mix level at export when folded to mono.", "A surround mix without a checked stereo downmix collapses dialog or phase-cancels in the folded version."],
    v: "Pan a noise source from left to right and measure the summed power at each position. Constant-power mode holds it within 0.5 dB, and the mono sum shows the expected 3 dB center rise.",
    dep: ["channel-strips"]
  },
  "gain-staging-and-metering": {
    s: "Keeps signal levels in a healthy range at every point in the chain, and shows peaks, averages and loudness so overload and noise are visible.",
    d: "Floating-point audio inside a workstation has huge headroom, but plugins, converters and some fixed-point processors do not. Gain staging means setting trim and fader levels so each stage receives a sensible level, and meters tap the signal at selected points to show peak, RMS or loudness. The master meter should reflect exactly what export will produce. Metering ballistics and weighting follow published standards for loudness. The challenge is that the display reflects only what meters tap, and clipping can occur between taps.",
    k: ["Floating-point internal headroom vs enforced ceilings: floating-point never clips inside the engine, and a hot signal still clips at the plugin or converter that follows.", "Pre-fader vs post-fader meter taps: pre-fader shows the incoming level for gain setting, post-fader shows the actual contribution to the mix."],
    p: ["Trusting infinite internal headroom produces a mix that sounds fine until it passes through a plugin that clips at 0 dBFS.", "Meters that show a different tap from the one being exported hide overs."],
    v: "Feed a tone at +6 dBFS through a chain with a plugin that clips, and confirm the meters on that channel show the over at the tap after the plugin and the export clips only if the master exceeds 0.",
    dep: ["meters-and-scopes", "summing-and-headroom"]
  },
  "sidechain-routing": {
    s: "Feeds a signal from one track into another plugin's control input so, for example, a kick drum can duck a bass or a voice can trigger a gate.",
    d: "A plugin that supports sidechain exposes an extra input bus. The host routes any source into that bus and treats the dependency as a graph edge, so the source is processed first. Latency of the sidechain path must be aligned with the main path, or the effect will react too early or late. The source can be tapped pre or post fader. Because it introduces a dependency between otherwise unrelated tracks, it limits parallel processing and can create loops if misrouted.",
    k: ["Sidechain as a regular graph edge vs a special side channel: regular edges keep ordering and compensation uniform, special channels are simpler and need extra rules for compensation.", "Tapping the source before vs after its fader: pre-fader keeps ducking steady when the source is turned down, post-fader follows what is heard."],
    p: ["A sidechain source that is not delay-compensated causes the ducking to start after the kick attack.", "Sidechaining a track from a bus that includes the destination creates an invisible feedback path."],
    v: "Duck a bass from a kick via sidechain with plugin-delay compensation enabled and disabled, and confirm that the gain reduction begins at the kick onset only with it enabled.",
    dep: ["audio-graph", "plugin-delay-compensation", "plugin-formats-and-api"]
  },
  "plugin-scanner": {
    s: "Finds installed plugins, loads each in an isolated process to read its description and caches the result, so a broken plugin cannot stop startup.",
    d: "The scanner searches standard folders and user-defined paths, then for each file asks the format loader for the plugin's name, vendor, categories, inputs, outputs and unique id. Loading arbitrary binaries can hang, crash or show license dialogs, so the scan runs in a child process with a timeout, and failures put the plugin on a blocklist. Results are cached by file path and modification time. The hard part is handling plugins with unusual scan behavior, such as shell plugins that contain many sub-plugins.",
    k: ["Scanning in a separate process vs in-process: separate processes survive crashes and cost startup time per plugin, in-process scanning is fast and a single bad plugin kills the application.", "Rescanning at every startup vs caching: caching makes startup instant and shows stale entries when plugins are removed or updated."],
    p: ["A plugin that opens a modal licensing dialog during the scan blocks the scanner indefinitely.", "A stale cache lists plugins that were uninstalled, and projects fail to load them with unclear errors."],
    v: "Add a deliberately crashing plugin and a hanging plugin to the scan folder, and confirm the scan completes, both are blocklisted with a reason, and all other plugins are listed.",
    dep: ["plugin-formats-and-api", "plugin-sandboxing"]
  },
  "plugin-formats-and-api": {
    s: "The interface definitions that plugins implement and hosts call: process audio, receive events, report parameters and latency, save state and open an editor.",
    d: "Each format defines a binary interface of functions or objects: initialize with sample rate and maximum buffer size, process a block with audio and event buffers, get and set parameters, report tail length and latency, and serialize state. Formats differ in threading rules, how parameters and events are timestamped, and what extension features exist. A host often supports several formats and a common internal wrapper. The difficulty is that real plugins vary widely in how closely they follow the rules, so the host must be defensive.",
    k: ["Supporting several formats through one internal wrapper vs per-format code: a wrapper reduces duplication and hides format-specific features, per-format code gets full use of each.", "Open, documented formats vs closed ones: open formats are easy to implement and test, closed formats may be required by the market and carry licensing terms."],
    p: ["Assuming the maximum block size is never exceeded leads to buffer overruns when a plugin or a driver calls with a larger block.", "Plugins that violate threading rules by taking locks in process calls cause occasional dropouts that depend on what else is running."],
    v: "Load a reference plugin from each supported format, process a test signal, and confirm identical output, reported latency and state round trip across formats.",
    dep: []
  },
  "plugin-host-wrapper": {
    s: "The host-side object that owns one plugin instance: allocates its buffers, calls it each cycle, translates events and parameters and tracks its latency and state.",
    d: "The wrapper maps the engine's buffers and events to the plugin's format, handles channel-count mismatches, applies bypass with a crossfade, and measures process time. Parameter changes from the interface or automation arrive through a queue and are delivered with sample offsets. It also reports tail length so the engine knows when to stop processing silence. Calls into the plugin come from specific threads, and the wrapper enforces that. Poorly behaved plugins require guards, such as catching exceptions and denormal protection.",
    k: ["Calling the plugin directly on the audio thread vs in a separate thread or process: direct calls are lowest latency and unsafe against crashes, remote calls isolate faults and add transfer overhead.", "Bypassing by skipping the plugin vs by crossfading: skipping is cheap and clicks on tails, crossfading hides the switch and doubles the cost for a moment."],
    p: ["Bypass that stops calling a plugin cuts its reverb tail short, leaving a click.", "A parameter change delivered on the wrong thread produces a rare crash inside the plugin."],
    v: "Insert a reverb, toggle bypass during a tail and confirm the tail fades without a click. Run a thread checker over parameter calls and see no cross-thread access.",
    dep: ["plugin-formats-and-api", "lock-free-queues", "denormal-protection"]
  },
  "plugin-sandboxing": {
    s: "Runs plugins in separate processes that exchange audio and events with the host through shared memory, so a plugin crash does not take the project down.",
    d: "The host starts a helper process per plugin or per group of plugins and shares audio buffers and event queues through shared memory regions, synchronized with signals or spin-waiting. The plugin's editor window is embedded or run alongside. Each cycle adds a hand-off between processes, which costs time and adds some jitter, so sandboxing has a measurable CPU and latency cost. A crash in the helper is detected by a watchdog and handled by the host. Getting realtime scheduling for the helper is a problem on its own.",
    k: ["One process per plugin vs shared helper: one per plugin gives full fault isolation and uses more memory and wakeups, a shared helper is cheaper and a crash takes down all its plugins.", "Spin-waiting vs OS signals between processes: spinning has low latency and burns CPU, signaling saves CPU and adds wake-up delay that can miss a deadline."],
    p: ["A helper process without real-time priority is preempted by other work and causes dropouts that the host cannot see.", "Shared memory buffers left mapped after a crash leak memory until restart."],
    v: "Force a plugin to crash during playback and confirm the host keeps playing, replaces its output with silence or bypass, and shows an error. Measure CPU overhead against in-process hosting.",
    dep: ["plugin-host-wrapper", "thread-priorities", "plugin-crash-recovery"]
  },
  "plugin-state-and-presets": {
    s: "Saves and restores a plugin's complete settings inside the project and as reusable preset files, including internal data the parameter list does not cover.",
    d: "The plugin returns an opaque block of bytes representing its state, which the host stores in the project and gives back on load, along with the plugin's id and version. Presets are the same state saved on its own, often with names and tags. Some state is large, for example sample libraries or learned models, and is better stored as references. The host also keeps per-parameter values for automation. Restoring state must happen before audio runs, and a changed plugin version may not accept old data.",
    k: ["Storing opaque state blobs vs parameter lists: blobs restore everything the plugin has, and parameter lists are inspectable and portable between versions without covering internal data.", "Embedding state in the project vs referencing external preset files: embedding makes projects self-contained and large, referencing keeps them small and breaks when files move."],
    p: ["Loading state after audio starts produces a burst of wrong sound before the preset takes effect.", "A plugin updated since the project was saved rejects the old state and loads with default settings, silently."],
    v: "Save a project with a complex plugin patch, reopen it on another machine with the same plugin version and render. The output is bit-identical to a render before saving.",
    dep: ["plugin-formats-and-api", "project-file-format"]
  },
  "parameter-exposure": {
    s: "Lists the plugin's controllable parameters with names, ranges, units and flags to the host, so they can be automated, mapped to hardware and shown in generic editors.",
    d: "On load the plugin reports each parameter's id, display name, minimum, maximum, default, step count and whether it is automatable. The host builds a generic interface from this list for plugins that have no editor and for hardware mapping. Value-to-string conversion comes from the plugin, so the host can display \"2.5 kHz\" rather than 0.43. Parameters that change in response to the plugin's own editor must be reported to the host, which records them while writing automation. Large plugins expose hundreds, so searching and grouping is needed.",
    k: ["Host-side generic editors vs plugin editors only: generic editors provide uniform control and automation, and plugin editors show the designed interface and hide parameters from other tools.", "Exposing all parameters vs a curated subset: all parameters is complete and noisy, a subset is easier to automate and misses controls users need."],
    p: ["Parameter changes made in the plugin's own window are not reported, so automation writing misses them.", "Parameter lists that change between versions leave mapped controls bound to the wrong parameter."],
    v: "Open a plugin's own editor, move a knob while in write mode and confirm the host's automation lane records the move with the correct display values.",
    dep: ["plugin-formats-and-api", "parameter-addressing"]
  },
  "plugin-ui-hosting": {
    s: "Embeds a plugin's own graphical editor in a window the host manages, handling sizing, scaling, focus and keyboard input.",
    d: "The plugin creates a native view that the host places in a window and resizes. Rendering happens on the interface thread, which the plugin shares with the host, so a slow editor can freeze the host's interface. Display scaling, multiple monitors, keyboard focus and shortcut forwarding all pass between two sets of code that were not written together. Some designs run the editor in the sandbox process and embed it. The audio thread has to be independent of the interface at all times.",
    k: ["Embedding the plugin view in the host's process vs the sandbox: in-process embedding is simple and shares the interface thread's problems, sandbox embedding isolates them and complicates focus and resizing.", "Letting plugins draw at their own size vs host-scaled: own size looks correct and fails on high-density displays, host scaling is uniform and blurs."],
    p: ["A plugin editor that blocks the interface thread freezes the host window while audio keeps playing.", "Keyboard shortcuts typed into a plugin's text field trigger host commands such as delete or play."],
    v: "Open ten plugin editors on a high-density second monitor, drag them between displays and confirm they render at the correct scale, stay responsive and keep audio uninterrupted.",
    dep: ["plugin-host-wrapper"]
  },
  "plugin-crash-recovery": {
    s: "Detects that a plugin has crashed or hung, keeps the rest of the project playing and offers a safe way to restore the plugin's last known state.",
    d: "A watchdog notices when a sandboxed plugin stops responding, or an exception handler catches a fault in-process where that is survivable. The host replaces the plugin's output with silence or a bypass, marks it failed, and keeps the last good state saved by autosave. The user can restart the plugin and restore its settings. Persistent crashers go on a blocklist for the next launch. A crash in the process that hosts the audio thread cannot be recovered, so only isolation yields real recovery.",
    k: ["Silent bypass vs muted output on failure: bypass keeps the signal chain intact and may expose a dry signal, muting is predictable and drops the track entirely.", "Restarting automatically vs on request: automatic restart restores the session fast and can loop on a persistent crash, request-based is safe and slower."],
    p: ["Recovering a plugin without its last good state loads default settings and quietly changes the mix.", "A crash during save leaves the project file half-written and unrecoverable."],
    v: "Kill a plugin's helper process during a render-free playback, confirm the audio never stops, then restart the plugin and verify its settings match the last autosave.",
    dep: ["plugin-sandboxing", "autosave-and-backup", "plugin-state-and-presets"]
  }
});
