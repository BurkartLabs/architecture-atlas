// Details for the audio workstation plate, part 1: interface, timeline and recording.
ATLAS.details("audio-workstation", {
  "transport-controls": {
    s: "Play, stop, record, loop and locate controls that change the engine's playhead state and display the current position in bars, time or samples.",
    d: "Buttons and keyboard shortcuts do not move the playhead themselves. They post commands to the engine, which applies them at a buffer boundary and publishes the resulting state back for display. Position is shown in several units that must agree: samples, seconds, and bars and beats through the tempo map. Loop ranges, locators and chase behavior (should a stopped playhead return to its start point) are stored in the project. The hard part is that the interface and the audio thread disagree about the current time for a few milliseconds.",
    k: ["Commands queued to the engine vs direct state writes: the audio thread never sees half-updated state, but the display lags the true position by a buffer or more.", "Position stored in samples vs musical time: samples are exact for audio, musical time survives tempo edits, and the model has to convert between them for every display."],
    p: ["Starting playback from the interface thread by calling into the engine directly produces glitches because the call races with the callback.", "A displayed position computed from wall-clock time drifts from the audio device clock over a long session."],
    v: "Start playback at a marker, stop after ten minutes, and compare the displayed position with samples counted by the device callback. The two agree to within one buffer and do not drift.",
    dep: ["transport-and-playhead", "lock-free-queues"]
  },
  "track-headers": {
    s: "The per-track controls column: name, color, mute, solo, arm, input choice and quick access to the channel's volume, pan and plugin chain.",
    d: "Each header is a view bound to a track object that owns state shared with the mixer. Mute and solo are not simple flags: solo has to compute which other channels are implicitly muted, honor solo-safe channels, and treat buses that feed soloed tracks as audible. Changes go through the same parameter path as automation so they can be undone and recorded. The hard part is keeping several views of one channel, the header, the mixer strip and a control surface, consistent without feedback loops.",
    k: ["Solo as an exclusive vs additive state: exclusive is simpler to explain, additive supports mixing several elements together but requires solo-in-place logic through sends and buses.", "Bound view models vs views that read the engine directly: bound models give consistent undo and redraw, and add an extra copy of state to keep in sync."],
    p: ["Solo that mutes a bus feeding a soloed track silences the very sound the user asked to hear.", "A header bound to a deleted track keeps stale routing and crashes on the next redraw."],
    v: "Solo a track that sends to a reverb bus and confirm the reverb stays audible while unrelated tracks fall silent. Un-solo and check every mute state returns to its earlier value.",
    dep: ["tracks-and-lanes", "channel-strips"]
  },
  "waveform-display": {
    s: "Draws audio waveforms from precomputed peak summaries at any zoom level, so scrolling and zooming stay smooth without reading the audio files again.",
    d: "When audio is imported or recorded, a background job computes minimum and maximum values for blocks of samples at several resolutions and stores them as peak files or in a cache. The drawing code picks the level that matches the pixels per sample, then falls back to drawing real samples or interpolated curves when zoomed in far. Recording extends the peaks live from the disk writer. It is hard because files can be hours long, edited clips show only a slice of a source, and waveforms must redraw on every scroll.",
    k: ["Multi-resolution peak cache vs computing from audio on demand: the cache makes redraw instant but costs disk and must be invalidated when a file changes.", "Drawing from the engine's processed audio vs from the source file: processed output shows gain and fades truthfully, while source peaks are cheaper and independent of plugins."],
    p: ["Peak data left stale after a file was edited externally shows a waveform that does not match what is heard.", "Generating peaks for a large imported folder on the interface thread freezes the application."],
    v: "Import a one-hour file, zoom from full length to individual samples, and confirm scrolling stays responsive and peaks at maximum zoom match the actual sample values.",
    dep: ["audio-file-pool", "clips-and-regions"]
  },
  "meters-and-scopes": {
    s: "Level meters, spectrum and phase displays that show the signal at chosen points, fed from the audio thread through shared measurement values.",
    d: "The audio thread computes peak, RMS or loudness values per buffer and writes them into slots that the interface thread reads at its own refresh rate. Different meter types use different time constants and standards, and the point where a meter taps the signal (pre or post fader) matters. Spectrum analyzers need windowed transforms that run on a separate thread over copied samples. The difficulty is that meters must never block the audio callback and must not hide a peak that fell between two redraws.",
    k: ["Peak-hold values computed on the audio thread vs sampling the signal from the interface: audio-thread values never miss a peak, at the cost of a little per-buffer work.", "True-peak or oversampled metering vs sample peaks: catches inter-sample overs that clip converters, with extra processing that adds up across many channels."],
    p: ["Reading meter values with a lock the audio thread also takes can stall the callback whenever the interface redraws.", "A meter that samples the instantaneous level at its refresh rate shows a clean mix while the real signal clips."],
    v: "Play a single full-scale sample burst once and confirm the peak meter and its hold both register it, even though the burst is shorter than one redraw interval.",
    dep: ["lock-free-queues", "gain-staging-and-metering"]
  },
  "piano-roll-editor": {
    s: "A grid editor for MIDI notes where length, pitch, velocity and controller data can be drawn, moved and quantized against the project tempo map.",
    d: "The editor shows a slice of one or more MIDI clips as note rectangles against a time grid, with lanes below for velocity and continuous controllers. Edits operate on the event model and are grouped into undoable operations. Selection, snapping, scale highlighting and note chasing (what sounds when you start mid-note) all depend on the tempo map. The hard part is performance with dense data and the many cases of what a drag means when notes overlap, are selected across clips or cross a tempo change.",
    k: ["Editing the event list directly vs through a note-oriented model: a note model pairs note-on with note-off and simplifies drawing, but must handle stuck, overlapping and unmatched events in imported data.", "Grid snapping in musical time vs in samples: musical snapping stays on the beat after tempo edits, while audio-aligned snapping is needed to match recorded material."],
    p: ["Moving a note across a tempo change computes its end from the wrong tempo and shortens or lengthens it.", "Overlapping notes of the same pitch cancel each other at note-off, so a held note ends early."],
    v: "Draw a chord, drag it across a tempo change and quantize it. Play it back and confirm every note starts on the intended grid line and ends at its drawn length.",
    dep: ["midi-event-model", "tempo-map", "snapping-and-grid"]
  },
  "control-surfaces": {
    s: "Support for hardware faders, knobs and buttons that send and receive control messages, with motorized feedback so the hardware shows the software's state.",
    d: "A surface driver maps hardware controls to parameters, transport actions and views, over MIDI messages or a network protocol. Mapping layers decide which tracks sit under the eight or sixteen faders and what each knob controls for the focused plugin. For motorized or lit hardware the software must send values back and avoid echoing them. The difficulty is two-way sync: when the user moves the fader and the mouse at once, which wins, and how are stepped hardware controls resolved against smooth software values.",
    k: ["Absolute values with motorized feedback vs relative encoders: faders always match the screen, relative knobs avoid parameter jumps, and each needs different feedback handling.", "Hardware profiles stored as data vs coded per device: data profiles let users remap and share, but cannot express the unusual behaviors of complex surfaces."],
    p: ["Echoing a received value straight back to a motorized fader makes it fight the user's hand and jitter.", "Binding to the first N tracks by index breaks when a track is inserted, so every fader moves a different channel."],
    v: "Move a motorized fader by hand and confirm the on-screen value follows. Move the same fader with the mouse and confirm the hardware motor follows, with no oscillation.",
    dep: ["midi-device-io", "parameter-addressing"]
  },
  "timeline-model": {
    s: "The central data structure: an ordered, observable description of tracks, clips, markers, tempo and time signatures from which both the screen and the engine are built.",
    d: "The model holds tracks containing clips, each placed at a time with a length and a reference to source media or MIDI data. It exposes change notifications so the interface redraws and the engine recompiles only the affected parts. Time is stored in a representation that survives tempo edits, usually musical time for MIDI and sample time for audio, and the model converts. The hard part is making edits atomic and quick on large sessions while the engine reads the same data concurrently.",
    k: ["A single model shared with the engine vs separate editing and playback copies: sharing avoids drift between them but needs careful synchronization, while copies make the engine safe and cost a rebuild step.", "Persistent immutable data vs in-place mutation: immutable snapshots simplify undo and engine hand-off, and allocate heavily during large edits."],
    p: ["Engine reads of half-edited data play a moment of wrong audio or crash when a clip is deleted mid-callback.", "Mixed time units without a single conversion point produce clips that slide a few samples after each tempo edit."],
    v: "Perform one hundred random edits while playing and confirm playback never glitches, then undo all of them and verify the model compares equal to its starting snapshot.",
    dep: ["tempo-map", "clips-and-regions", "tracks-and-lanes"]
  },
  "tracks-and-lanes": {
    s: "Tracks are the vertical containers for audio, MIDI, bus and automation content; lanes subdivide a track to hold stacked takes, alternates or parameter curves.",
    d: "Each track has a type that decides which clips it accepts, an output destination and a channel strip. Folder tracks group others for display and shared control. Lanes add vertical layers within one track so overlapping takes or parameter curves have a place to live without extra channel strips. Tracks are created and deleted frequently during work and many other objects refer to them, so identity is by stable id rather than position. Large sessions with hundreds of tracks make layout and redraw cost visible.",
    k: ["Tracks that own their channel strip vs strips as separate objects: ownership keeps lifetimes simple, while separate strips allow one track to feed several chains at the cost of more bookkeeping.", "Lanes within a track vs additional tracks: lanes keep one signal path for many takes, while separate tracks give independent processing for each."],
    p: ["Referring to tracks by index makes sends and automation point at the wrong channel after a delete.", "Deleting a track with automation and sends leaves dangling references that surface later as silent routes."],
    v: "Create a session with sends from track 3 to a bus, delete track 2 and confirm the send still comes from the same instrument and the bus level is unchanged.",
    dep: ["channel-strips"]
  },
  "clips-and-regions": {
    s: "A clip is a placed reference to a span of source audio or MIDI with start, length, offset, gain and fades, so many clips can share one file.",
    d: "A clip stores its position on the timeline, which part of the source it plays (offset and length), and per-clip properties such as gain, fades, pitch and stretch settings. Splitting a clip creates two clips pointing at the same source. Overlaps are resolved by layer order or by crossfades. The engine builds a reader per active clip. Because clips are cheap references, the hard problems are rendering the right slice at a precise sample, handling clips longer than their media, and resolving overlapping clips deterministically.",
    k: ["Clips referencing shared sources vs copying audio per clip: references save disk and make edits instant, but deleting or moving a source file affects every clip that uses it.", "Per-clip processing vs clip-level rendering to new files: live clip settings stay editable, while rendered clips use less CPU and are guaranteed to sound the same on every machine."],
    p: ["A clip whose offset runs past the end of its file plays silence or a click instead of a clear error.", "Overlapping clips without an explicit layer rule sum at unity and play louder than either alone."],
    v: "Split a clip twice, move the middle piece, then glue everything back by dragging it to its original place, and confirm the rendered output is bit-identical to the unedited clip.",
    dep: ["audio-file-pool", "crossfades-and-fades"]
  },
  "non-destructive-editing": {
    s: "The rule that editing operations change clip descriptions and never overwrite source recordings, so any edit can be undone and original takes survive.",
    d: "Cuts, trims, fades, gain changes and even stretching are stored as clip properties and applied during playback. Original files are treated as read-only after recording. Operations that need new audio, such as consolidating a comp or applying an offline effect, write a new file and replace the clip reference, leaving the old file in the pool until the user purges it. The cost is accumulating state: many small edits mean many live computations in the engine, and unused files linger.",
    k: ["Live parameters vs destructive offline processing: live settings are fully reversible, and each one costs CPU on every playback.", "Keeping all rendered intermediates vs purging them: keeping preserves undo history across saves, but project folders grow into gigabytes of unused audio."],
    p: ["Offline effects written over the original file make undo impossible and corrupt every other clip that refers to it.", "Purging unused files while the undo history still refers to them breaks undo after reopening."],
    v: "Apply a fade, a gain change and a trim to a clip, save, and compare the source file's checksum before and after. The checksum is unchanged, and undo restores the clip fully.",
    dep: ["clips-and-regions", "audio-file-pool"]
  },
  "crossfades-and-fades": {
    s: "Gain ramps at clip edges that prevent clicks and blend overlapping audio, using curves that preserve level or power depending on whether the material is correlated.",
    d: "A fade is applied by the clip reader as a gain envelope across the first or last part of the clip. A crossfade overlaps two clips and ramps one down while the other ramps up. Equal-power curves keep perceived loudness for unrelated material, and equal-gain curves suit identical material shifted slightly. The editor must also handle the fact that a fade needs audio beyond the visible clip edge, from the source file handles, to look and sound right. The difficulty is applying fades sample-accurately at any stretch and zoom.",
    k: ["Equal-power vs equal-gain curves: equal-power avoids a dip for uncorrelated sources, equal-gain avoids a bump for correlated ones, and a wrong choice is audible at every edit.", "Fades as clip properties vs inserted automation: clip fades travel with the clip when it moves, while automation is more flexible but can be left behind."],
    p: ["Cutting a clip at a non-zero crossing without any fade leaves a click at every edit point.", "A crossfade that needs source audio past the clip's trimmed edge silently shortens when no spare material exists."],
    v: "Crossfade two copies of the same sine tone offset by a few samples and confirm the output has no click and the level stays within 0.5 dB through the fade.",
    dep: ["clips-and-regions", "clip-playback-readers"]
  },
  "comping": {
    s: "Assembling one best performance from several recorded takes by selecting segments from each, with crossfades hidden at the joins.",
    d: "Takes recorded in loop or punch mode are stored as stacked lanes of clips. The user sweeps across segments to select them, and the editor produces a composite of non-overlapping selected pieces with short crossfades. The comp is a view over the take lanes, so choices can be changed later. Switching takes mid-phrase demands that fades fall on quiet points. The hard part is keeping the comp, the underlying lanes and any later edits like timing correction aligned.",
    k: ["Comp as a live selection vs a flattened result: live comps let the producer revise choices late, and flattened comps are simpler to edit further and cheaper to play back.", "Automatic crossfade lengths vs per-join control: automatic is fast to work with, but fixed lengths ruin joins on transient material."],
    p: ["Editing a take after comping moves its audio out from under the selected segments, producing gaps or doubled notes.", "Joins placed on a held note make the crossfade audible as a phase swirl."],
    v: "Record five takes, comp a phrase from three of them, flatten it, and confirm the flattened clip's samples equal the live comp's rendered output.",
    dep: ["loop-recording", "crossfades-and-fades", "tracks-and-lanes"]
  },
  "snapping-and-grid": {
    s: "Rules that pull edits to musical or time positions: bars, beats, subdivisions, markers, other clip edges and zero crossings.",
    d: "The grid is derived from the tempo map and the zoom level, so it gets finer as the user zooms in. Snap targets include grid lines, clip boundaries, markers and the playhead, with the nearest in screen pixels winning. Magnetic behavior must be predictable and easy to override. Because events are positioned in musical or sample time, snapping must convert through the tempo map each time. Triplets, swing and tempo changes make grid lines unevenly spaced in time, which a simple pixel-based approach does not handle.",
    k: ["Snapping in musical time vs in samples: musical snapping follows tempo edits, sample snapping stays frozen to recorded audio, and a project often needs both.", "Fixed grid division vs zoom-adaptive: adaptive keeps the grid readable at any zoom, but the same drag lands on a different resolution depending on the view."],
    p: ["Snapping computed in pixels rather than time gives a different result at different zoom levels for the same gesture.", "Magnetic snap to a nearby clip edge overrides the user's intent when they want a free position."],
    v: "Drag a clip to the third beat of bar 9 across a tempo change at three zoom levels and confirm it lands on exactly the same musical position every time.",
    dep: ["tempo-map", "timeline-model"]
  },
  "tempo-map": {
    s: "A timeline of tempo and time-signature changes that converts between bars and beats, seconds and samples in both directions.",
    d: "Tempo is stored as a list of points with a value and a curve type: stepped, linear ramp or smooth. Converting between musical time and absolute time means integrating over those segments, which is cached for speed. Every feature that has a musical position, from MIDI notes to delay times synced to the beat, depends on this conversion. Edits to tempo must rewrite positions of audio clips that are marked as following tempo, and leave fixed-time clips alone. Rounding errors in the conversion accumulate if not handled carefully.",
    k: ["Ramps computed analytically vs by numerical stepping: analytic conversion is exact and invertible, and numerical stepping is simpler to extend to new curve types but drifts.", "Tempo changes shifting audio vs leaving it fixed: shifting keeps loops on the beat and moves recorded performances away from their real timing."],
    p: ["Converting back and forth between musical and sample time with floating-point error shifts a note by a sample on each round trip.", "A tempo change inserted mid-session silently moves all warped audio but not unwarped audio, breaking sync."],
    v: "Place notes at every beat across a ramp from 90 to 140 BPM, convert each to samples and back, and confirm the round trip returns the original positions exactly.",
    dep: []
  },
  "input-monitoring": {
    s: "Routes live input to the output so a performer hears what they are playing, either from the hardware directly or through the software chain.",
    d: "There are three paths: hardware monitoring in the interface, which has near-zero delay but no software effects; software monitoring through the engine, which includes plugins at the cost of the round-trip latency; and a hybrid where the software provides a low-latency mix of just the selected channels. Auto-monitoring switches the source depending on whether the track is armed, playing or recording. Which mode to use is a trade of latency against processing. Monitoring software chains with latency-heavy plugins quickly becomes unplayable.",
    k: ["Direct hardware monitoring vs through the software chain: hardware gives the lowest latency without effects, software lets the performer hear the final sound with delay.", "Auto-monitor switching vs always-on input: auto switching avoids doubling the signal during playback and surprises users when it flips at punch points."],
    p: ["Hardware and software monitoring both enabled produces a comb-filter doubling effect that performers mistake for a bad sound.", "A high-latency plugin on an armed track makes the performer hear themselves late and play behind the beat."],
    v: "Arm a track with a loopback cable from output to input, play a click, and measure the delay between the played and monitored clicks. It matches the reported round-trip latency within a few samples.",
    dep: ["monitoring-latency-modes", "channel-strips"]
  },
  "record-arming": {
    s: "The per-track state that decides which inputs will be written to disk and monitored, including input assignment, channel format and what happens when recording starts.",
    d: "Arming a track binds it to an input channel or pair, creates a disk writer and a destination file name, and enables monitoring according to the chosen mode. Many tracks can be armed at once for multitrack sessions, so the recorder has to scale linearly with the track count and fail safely when the disk cannot keep up. Preparation work such as opening files and allocating buffers happens at arm time, so pressing record starts instantly without stalling the audio thread.",
    k: ["Opening files at arm time vs at record start: pre-opening gives instant, glitch-free start with leftover empty files, while opening on demand wastes no files and risks a stall.", "Per-track input binding vs a global input map: per-track binding is flexible, and global maps keep multi-channel interfaces consistent across templates."],
    p: ["Arming dozens of tracks and starting record can overload the disk and drop input samples with no visible warning.", "An input assigned to a device that was unplugged since the last session records silence."],
    v: "Arm 32 tracks on a multichannel interface, record five minutes of distinct test tones per channel, and confirm every file has the expected length and contains its own channel's tone.",
    dep: ["disk-writer", "device-enumeration"]
  },
  "punch-in-out": {
    s: "Starts and stops recording automatically at set positions during playback, replacing a section of an existing take without disturbing the rest.",
    d: "The engine plays the track normally, switches the track's output to input monitoring at the punch-in point, begins writing the incoming signal to a new file, and switches back at punch-out. A pre-roll lets the performer start in time, and a short crossfade at both edges hides the join. Punch points can be set by the user or triggered by hand during playback. The difficulty is doing the switch at an exact sample on the audio thread and keeping the new material aligned to the old with the correct latency compensation.",
    k: ["Writing a new clip vs overwriting old audio: a new clip keeps the original take and is undoable, at the cost of more clips to manage.", "Fixed crossfade at punch edges vs none: crossfades hide the join when levels differ, and they blur the first transient of the new take."],
    p: ["Ignoring input latency compensation puts the punched section a few milliseconds late relative to the surrounding take.", "A punch triggered a few samples late clips the start of the first note."],
    v: "Record a click track, punch in over the middle with a loopback click, and confirm the punched clicks align with the surrounding ones to within one sample after compensation.",
    dep: ["delay-compensated-recording", "sample-accurate-scheduling", "disk-writer"]
  },
  "loop-recording": {
    s: "Records repeated passes over a looped range, storing each pass as a separate take so the best parts can be chosen later.",
    d: "As the loop wraps, the recorder closes the current take and opens a new one without losing a sample, or keeps one long file and records take boundaries as markers. Takes appear as stacked lanes. For MIDI, the same idea creates one clip per pass or merges passes into a layered pattern. Looping playback itself must be seamless, so the engine reads across the loop boundary within one buffer. The difficulty is the transition: audio from the end of one pass and the start of the next may share a single input buffer.",
    k: ["One long file with take markers vs a file per take: one file avoids any gap at the wrap, while separate files make takes easy to move, delete and archive.", "Merging MIDI passes vs keeping them separate: merging is useful for building a drum pattern, and separation keeps each performance available for comping."],
    p: ["A new file opened at the loop point loses the samples in the buffer that straddles the wrap.", "Hundreds of takes recorded during a long loop session slow the timeline and fill the disk."],
    v: "Record ten passes over a four-bar loop of a continuous tone and confirm each take is exactly the loop length in samples with no discontinuity at the join.",
    dep: ["disk-writer", "transport-and-playhead", "tracks-and-lanes"]
  },
  "count-in-and-metronome": {
    s: "Generates a click track and a pre-roll of bars before recording starts, keeping the performer in time without the click ending up in the project.",
    d: "The metronome is an internal instrument that reads the tempo map and plays accented and unaccented clicks on beat positions, scheduled sample-accurately within the audio buffer. The count-in plays for a set number of bars before the recording position is reached, then recording begins on beat one. The click is routed to a monitoring-only output so it does not mix into the stereo bus or export. It must follow tempo changes and time signatures, and may also be heard only during recording or only during the count-in.",
    k: ["A synthesized click vs sample playback: synthesis needs no files and is cheap, while samples let users pick familiar sounds at the price of loading and mixing them.", "Click on a separate monitor output vs the master: a separate output keeps it out of the mix, and users without spare outputs end up with the click in their render."],
    p: ["Scheduling clicks at buffer boundaries instead of exact sample positions makes the click wobble with the buffer size.", "A click routed through the master bus is printed into the bounce."],
    v: "Record a count-in and four bars at 120 BPM with the click routed to the monitor, then export and confirm the export contains no click and the first recorded note starts on beat one.",
    dep: ["tempo-map", "sample-accurate-scheduling"]
  },
  "disk-writer": {
    s: "A background thread that receives input buffers from the audio callback and writes them to files, keeping up with many channels without ever blocking the callback.",
    d: "The audio thread copies each input buffer into a lock-free ring buffer; a writer thread drains it in large blocks, converts the format if needed and appends to the file, updating headers periodically so a crash leaves a usable recording. Disk speed, antivirus scanning and file system pauses all cause stalls, so the ring buffer must be large enough to absorb them. If it overruns, samples are lost. Writing in sector-sized blocks reduces overhead. Reporting progress to the user without extra copies is another demand.",
    k: ["Large ring buffers vs small ones: large buffers survive disk stalls and use memory, while small ones fail fast with less to lose when the system is overloaded.", "Updating the file header on a timer vs only at stop: periodic updates let a crashed session be recovered, at the price of extra small writes."],
    p: ["An overrun in the ring buffer drops samples silently, leaving a recording with a gap nobody notices until the mix.", "A crash before the header is written leaves a file that no tool can open although the audio data is intact."],
    v: "Record 64 channels for an hour while copying large files in the background, then check every file for continuity with a counter signal fed into each input. No gaps appear.",
    dep: ["ring-buffers", "audio-buffers-and-formats", "lock-free-queues"]
  },
  "take-alignment": {
    s: "Places recorded audio on the timeline at the position the performer actually heard it, by subtracting round-trip latency from the recording start.",
    d: "Audio arrives later than it was played by the input latency, and the performer played in response to monitored output that was itself late by the output latency. The recorder subtracts the total reported round-trip from the clip's start position so recorded material lines up with the playback. The reported latency may be inaccurate, so a manual offset is stored per device. Recording alongside a loopback measurement can calibrate it. Without it, every overdub is late by a different amount for each interface.",
    k: ["Using driver-reported latency vs measured loopback: reported values need no setup, while measured values include errors that drivers omit, such as converter delay.", "Per-device offsets vs per-project offsets: per-device calibration follows the hardware around, and per-project values allow for different buffer sizes in each session."],
    p: ["Changing the buffer size after calibration makes recorded takes land at the old offset.", "A driver that under-reports latency places all overdubs consistently late, which is heard as dragging."],
    v: "Record a click played from the output through a loopback cable and confirm the recorded click lands at the exact sample of the original click after alignment, at several buffer sizes.",
    dep: ["latency-measurement", "driver-latency-reporting", "delay-compensated-recording"]
  }
});
