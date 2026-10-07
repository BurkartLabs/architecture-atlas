// Details for the VFX compositor plate, part 1: review, farm, scripting, interface.
ATLAS.details("vfx-compositor", {
  "dailies-playback": {
    s: "Plays rendered versions of shots at full frame rate with synchronized audio so supervisors can judge motion, not just stills.",
    d: "Review players read frame sequences or encoded movies, decode ahead into a ring of buffers, and present on a fixed clock. They apply the same display color transform the artist saw, so what is approved matches what was graded. Audio is the master clock and video frames drop or repeat to stay in sync. It is hard because uncompressed high-resolution frames exceed storage bandwidth, so players must pre-cache, transcode on demand or play lower-resolution copies, and any shortcut can change what the reviewer sees.",
    k: ["Play the original frames vs play a transcoded proxy: originals show true quality but need fast storage; proxies play anywhere but can hide banding or noise.", "Audio as master clock vs video as master clock: audio-led playback keeps lip sync but drops video frames under load; video-led playback stays smooth and drifts."],
    p: ["A player that skips the display transform shows a flat or oversaturated image, and notes are written against the wrong look.", "Dropped frames during playback get mistaken for a stutter in the shot itself."],
    v: "Play a ten-second clip with a one-frame flash burned in at known positions and confirm every flash is shown exactly once at the right audio beat, with no dropped frame reported by the player's statistics.",
    dep: ["video-decode","display-transforms","playback-cache"]
  },
  "annotations-and-notes": {
    s: "Lets reviewers draw on a frame and attach text to an exact frame and region, storing each note against a specific version of a shot.",
    d: "Annotations are vector strokes or text anchored to a frame number and the image coordinate system, saved as data separate from the pixels. Notes carry author, time, status and a link to the version reviewed. The tool must keep annotations aligned if the image is later shown at another resolution or crop, so they are stored in normalized or display-window coordinates. The hard part is that notes outlive versions: feedback on version 4 has to be findable and checkable when version 5 arrives.",
    k: ["Store strokes as vector data vs bake them into images: vectors stay editable and resolution independent; baked images are easy to share but cannot be revised or hidden.", "Notes attached to a version vs attached to a shot: version-bound notes are precise; shot-bound notes persist across versions but lose their frame meaning."],
    p: ["Coordinates stored in raw pixels land in the wrong place when the proxy or crop changes.", "Notes that live only in a review session vanish when it closes and never reach the artist."],
    v: "Draw a circle on frame 112 of version 3, reopen the session at a different display resolution, and confirm the circle still encloses the same feature and the note is listed under version 3 with its author.",
    dep: ["shot-database-link","display-and-data-windows"]
  },
  "version-compare": {
    s: "Shows two versions of a shot together using wipes, side-by-side, difference and flip modes, so changes between iterations can be seen precisely.",
    d: "Both versions are decoded and brought to a common size and color space, then combined in the display path: a wipe splits the view, a difference mode subtracts and amplifies, and a flip alternates quickly. Timing alignment matters, because versions can differ in head and tail handles or frame offsets. The comparator must treat each side's color transform separately and apply them before any subtraction. It is hard because mismatched resolution, pixel aspect or color metadata creates apparent differences that are really setup errors.",
    k: ["Compare in display space vs in scene-linear space: display space matches what people see; linear space gives physically meaningful differences but looks dark and needs exposure controls.", "Align by frame number vs by timecode: frame numbers are simple; timecode survives retimes and handle changes but needs trustworthy metadata."],
    p: ["Versions rendered with different working spaces show a uniform difference that is read as an artist change.", "Frame offsets of one produce a ghosted difference everywhere that no one can explain."],
    v: "Load two versions that differ only by a known small object on frame 50, enable difference mode, and confirm the result is black everywhere except that object, on exactly frame 50.",
    dep: ["dailies-playback","image-attributes","display-transforms"]
  },
  "synced-remote-review": {
    s: "Lets people in different places watch the same frame, play position and annotations together during a live session over ordinary networks.",
    d: "One participant leads and others follow. Two designs exist: stream the picture from a host that has the media and color-managed display, or sync a command stream so each client plays local media. Streaming guarantees everyone sees the same pixels but compresses and limits quality. Command sync keeps quality but requires every site to hold identical media and color configuration. Either needs a shared clock for play, pause and scrub. The hard problems are latency, access control for unreleased material, and honest quality labelling.",
    k: ["Stream pixels vs sync commands: streaming is consistent across sites but lossy and bandwidth hungry; command sync is full quality but breaks when sites hold different media or color setups.", "Single leader vs shared control: one leader avoids fights over the playhead; shared control feels collaborative but produces chaos with many participants."],
    p: ["A compressed stream is used to judge grain, banding or edge quality it cannot show.", "Unwatermarked material streamed to a participant's personal machine leaks pre-release footage."],
    v: "Join a session from two sites, scrub to frame 200 on the leader, and confirm the follower's reported frame matches within one frame in under a second while an annotation drawn by either appears on both.",
    dep: ["dailies-playback","annotations-and-notes"]
  },
  "deliverable-rendering": {
    s: "Produces the final files a client or next stage requires, in the contracted format, resolution, color space and naming, from approved versions.",
    d: "A deliverable spec lists container, codec, bit depth, color space, frame range with handles, naming and sometimes slates and burned-in data. A deliverable pass renders the approved script with output transforms, conforms frame ranges, writes files to a staging area and checks them against the spec. Several outputs often come from one script: a master, a review copy and a stereo or alternate-ratio version. It is hard because specs are numerous and strict, and a deliverable that fails technical validation costs a full re-render and re-submission.",
    k: ["Render deliverables from the approved script vs transcode from a master: rendering is exact per format; transcoding is cheaper but compounds color and compression changes.", "Automated spec validation vs manual spot checks: automation catches every mismatch at scale; spot checks are cheap and miss rare frames."],
    p: ["Wrong color space tag on the output makes the file look right locally and wrong at the client.", "Off-by-one handle ranges lose the first or last frame of the shot."],
    v: "Render a deliverable and run the validator: confirm frame count, dimensions, bit depth and color tags match the spec, and read the first and last frame to confirm they equal the cut's head and tail.",
    dep: ["writers-and-encoders","display-transforms","render-submission"]
  },
  "shot-database-link": {
    s: "Connects each composite to a production tracking database so versions, status, frame ranges and tasks are looked up and recorded instead of typed.",
    d: "The compositor reads shot context from the tracker: frame range, resolution, color settings, plates and the version number to write. After rendering, it publishes the new version, its media and a thumbnail back. The link is usually a thin client in the scripting layer that fills a project's settings at startup and registers outputs. It is hard because the tracker is the source of truth for many people, so the compositor has to cope with it being slow, offline or changed while an artist works.",
    k: ["Read context at script open vs on every render: opening once is fast and can go stale; refreshing each render stays correct and adds failure points on the farm.", "Publish automatically vs on artist approval: automatic publishing is complete but fills the tracker with rejected attempts; manual publishing is clean and forgotten."],
    p: ["A frame range changed in the tracker after the comp was built renders the wrong length.", "Farm machines with no tracker access fail at startup if the link is not optional."],
    v: "Change a shot's frame range in the tracker, open the script, and confirm the project range updates; publish a version and confirm the tracker lists the new media with the correct version number.",
    dep: ["scripting-api","startup-hooks"]
  },
  "render-submission": {
    s: "Packages a composite as a job for the farm, capturing the script, frame range, resources and settings, and sends it to the queue.",
    d: "Submission saves a copy of the script so later edits do not change queued work, resolves the frame range, chooses output nodes, sets priority and memory or core needs, and posts a job description to the scheduler. A good submission snapshot includes environment details such as plugin versions and color configuration. It is hard because the job must be reproducible on a machine that is not the artist's: any reference to a local path, an unsaved change or an unavailable plugin turns into a failure hours later.",
    k: ["Snapshot the script at submit vs reference the live file: snapshots are reproducible and reviewable; live references let artists fix a script mid-render and also change it unnoticed.", "Submit from inside the tool vs from a separate submitter: an in-tool button is convenient; a separate submitter can validate and queue without opening a GUI."],
    p: ["Paths that exist only on the artist's workstation fail on every farm machine.", "Submitting without saving first renders an older version of the work."],
    v: "Submit a one-frame job from a clean script, then open the stored snapshot on a different machine and confirm it renders pixel-identical output to the artist's local render of the same frame.",
    dep: ["headless-render-mode","scripting-api","path-and-frame-patterns"]
  },
  "frame-chunking": {
    s: "Splits a frame range into blocks that run on separate machines, balancing scheduling overhead against parallelism and cache reuse.",
    d: "Frames in a shot are mostly independent, so a job is divided into tasks of one or more frames. Small tasks balance load and limit lost work on failure, but each pays startup cost: loading the script, plugins and caches. Large tasks amortize that cost and let temporal operators reuse neighboring frames. The scheduler picks a chunk size, and dependent frames such as retimes or temporal denoise may need overlap. The difficulty is finding a size that works across scripts of very different weights.",
    k: ["Small chunks vs large chunks: small chunks balance load and lose little to a failure; large chunks amortize startup and keep temporal caches warm.", "Contiguous chunks vs interleaved frames: contiguous ranges reuse neighbors for temporal effects; interleaving gives early previews across the whole shot."],
    p: ["One-frame tasks on a script with a long startup spend most of the farm's time loading, not rendering.", "Chunk boundaries that break temporal effects leave visible seams at the same frames every time."],
    v: "Render a shot in chunks of ten and as one single task, and confirm every frame is byte-identical, including the first frame of each chunk, while recording total wall time for both.",
    dep: ["render-submission","time-dependencies"]
  },
  "job-dependencies": {
    s: "Orders farm tasks so one job starts only after the jobs it needs, such as precomps, simulations or other shots' outputs, have completed.",
    d: "Compositing jobs often depend on cached precomps, rendered elements or cleanup passes. The scheduler holds a dependency graph of jobs and releases a job when its inputs finish successfully or satisfy a frame-level condition: frame N of the downstream can start once frame N of the upstream exists. Frame-level dependencies give pipelining but need accurate output paths. The hard parts are partial failure, where one upstream frame is missing, and stale outputs from an older run that satisfy a file-exists check.",
    k: ["Job-level dependencies vs frame-level dependencies: job-level is simple and idle between stages; frame-level pipelines work and requires reliable per-frame completion records.", "Check file existence vs check completion records: file checks need no coordination but accept partial writes; completion records are exact and need the scheduler to own them."],
    p: ["A downstream job reads a half-written upstream frame because existence alone was taken as completion.", "An old output from a previous run satisfies the dependency and the downstream renders with stale elements."],
    v: "Queue a precomp job and a dependent comp job, kill one precomp frame mid-write, and confirm the dependent frame does not start until that frame is re-rendered and marked complete.",
    dep: ["render-submission","precomp-and-freeze","path-and-frame-patterns"]
  },
  "headless-render-mode": {
    s: "Runs the compositor without a graphical interface, loading a script and rendering named outputs from the command line or an API.",
    d: "The engine, scripting layer and operators are separable from the interface, so a process can open a script, set overrides such as frame range or proxy mode, evaluate the output nodes and exit with a status code. Headless runs skip viewer-only state and GPU display context but keep everything affecting pixels. Some operators assume an interactive session or a window system and must be made safe. The hard part is parity: a headless render must match an interactive one, including expressions and callbacks that were written with a GUI in mind.",
    k: ["Same binary with a no-GUI flag vs a separate engine build: one binary guarantees parity; a separate build is lighter and risks diverging.", "Callbacks run on render vs skipped: running them preserves studio logic; skipping them is faster and can leave out setup that the output needs."],
    p: ["Operators that open a dialog or wait for a window hang forever on a farm machine.", "A startup hook that needs a user session silently changes settings only in interactive runs."],
    v: "Render one frame interactively and headlessly from the same script, then compare outputs with a pixel difference tool and confirm zero difference and a zero exit code.",
    dep: ["scripting-api","pull-evaluation","startup-hooks"]
  },
  "license-and-seat-pools": {
    s: "Tracks how many concurrent instances may run, so the farm and artists share a limited pool of seats without blocking each other.",
    d: "Render and interactive instances check out a seat from a license server, often with separate pools or cheaper render-only seats. The scheduler must know how many seats exist, hold tasks that cannot get one, and release seats when processes exit or crash. Plugins can add their own seats. The hard part is fairness and failure: a crashed process may hold a seat until a timeout, and a farm that starts hundreds of processes can exhaust the pool and block artists from opening their work.",
    k: ["Shared pool vs reserved pools: a shared pool uses every seat; reserved pools protect artists from the farm and leave seats idle.", "Seat per process vs seat per machine: per process is simple to count; per machine lets threads share and requires trust in the host's accounting."],
    p: ["A farm burst consumes every seat during the working day and artists cannot launch the tool.", "Crashed processes keep seats checked out until a long timeout expires."],
    v: "Start more render tasks than seats exist and confirm the extra tasks wait in the queue, not fail, then kill a running process and confirm its seat is returned within the configured timeout.",
    dep: ["render-submission","headless-render-mode"]
  },
  "retry-and-failure-logs": {
    s: "Retries failed tasks sensibly and records why they failed, so transient faults heal themselves and real defects are diagnosable.",
    d: "A task fails because of a script error, a missing file, an out-of-memory kill, a node crash or a machine fault. The scheduler classifies the exit status, retries on a different machine when the cause looks transient, and stops retrying after a limit. Logs capture the engine's output, the failing node and the frame. Good systems collect them per task and surface the first error. It is hard because errors that look transient, such as a network read timeout, can hide a real defect, and retrying a deterministic failure wastes the whole budget.",
    k: ["Retry automatically vs fail fast: auto retry hides flaky machines and recovers overnight runs; fail fast surfaces defects early and wastes farm idle time.", "Per-task logs vs one aggregated log: per-task logs isolate a frame's story; aggregation shows patterns across machines and loses detail."],
    p: ["A script error is retried ten times on ten machines before anyone sees the message.", "A bad machine keeps failing tasks that get blamed on the shot."],
    v: "Inject a missing-file error on one frame and confirm the task fails after the retry limit, the log names the node and path, and neighboring frames complete.",
    dep: ["render-submission","memory-budgeting","network-storage-access"]
  },
  "scripting-api": {
    s: "Exposes the node graph, parameters, frames and operations to a scripting language, so every manual action can be repeated, batched or generated.",
    d: "The API wraps nodes, their parameters, connections, the project and the render call as objects. Scripts create nodes, set values and animation, walk the graph and trigger renders. The interface itself is built on it, which keeps the two honest. Threading matters: scripts typically run on the interface thread and must not block evaluation or touch shared state from render threads. The hard part is stability, since studios write thousands of lines against it and a renamed parameter breaks shots that are years old.",
    k: ["API as the single path for the interface vs a separate internal path: one path guarantees completeness; a separate path is faster to develop and leaves scripts unable to do what artists can.", "Stable names vs cleaner names: stable names keep old scripts running; renaming improves clarity and breaks automation."],
    p: ["A script that edits the graph during a render corrupts evaluation state.", "Parameters referenced by display label break when the interface is translated or reworded."],
    v: "Run a script that creates a blur node, connects it to a read node, sets its size, and renders one frame headlessly, then confirm the output differs from the input by the expected blur.",
    dep: ["node-and-knob-model","pull-evaluation"]
  },
  "expression-language": {
    s: "A small embedded formula language that drives parameter values from other parameters, frame numbers and math, so relationships stay linked.",
    d: "Parameters accept expressions that can reference other nodes' parameters, the current frame, and functions such as interpolation and noise. The engine evaluates an expression at the time requested and records the dependency so changes upstream invalidate the result. Expressions let a single control drive many nodes without scripting. They are hard to keep safe: circular references must be detected, evaluation must be fast because it runs per frame and sometimes per pixel, and an expression can quietly depend on frame or state that the graph does not know about.",
    k: ["Expressions evaluated lazily at request vs baked into keyframes: lazy keeps links live and costs evaluation time; baked is fast and loses the relationship.", "Sandboxed formulas vs full scripting inside expressions: sandboxing is predictable and limited; full scripting is expressive and can read or change anything."],
    p: ["Two parameters referencing each other produce a loop that hangs or returns zero silently.", "An expression using a global value that is not tracked as a dependency gives stale results after caching."],
    v: "Link a transform's x position to another node's value times the frame number, scrub three frames and confirm values change linearly, then edit the source value and confirm the viewer updates.",
    dep: ["node-and-knob-model","time-dependencies","cache-invalidation"]
  },
  "custom-node-plugins": {
    s: "Lets a studio add new operators by compiling code against a published interface for images, parameters and regions.",
    d: "A plugin declares its parameters, input and output channel needs, how its region of interest relates to its output, and an engine function that computes pixels for a given region. The host loads it from a search path at startup and treats it like a built-in. A stable binary interface lets plugins survive updates. It is hard because plugins run inside the host process: a crash or a memory overrun takes down the artist's session, and a plugin that reports its region needs wrongly produces tile seams.",
    k: ["In-process plugins vs out-of-process plugins: in-process is fast with zero-copy images; out-of-process isolates crashes and pays copy and synchronization costs.", "Rich API vs minimal API: a rich API allows optimal operators; a minimal one is easier to keep stable across versions."],
    p: ["A plugin that reports too small an input region produces visible seams at tile boundaries.", "A plugin built against an older interface loads and misreads parameters after a host update."],
    v: "Load a test plugin that inverts one channel, render a frame at full and half-frame tiles, and confirm results are identical with no seams, then confirm an unload and reload leaves the host stable.",
    dep: ["node-and-knob-model","regions-of-interest","channel-sets","startup-hooks"]
  },
  "gizmos-and-macros": {
    s: "Packages a group of nodes with exposed controls as a reusable node, so complex setups are shared and updated as one unit.",
    d: "A macro is a subgraph with a chosen set of promoted parameters, saved as a file and instantiated like any node. Some systems copy the contents into each script on use; others keep a live reference to a library file so improvements propagate. Studios keep libraries of keying setups, lens effects and utility rigs. The difficulty is versioning: a macro changed centrally changes every old shot, so either the reference is frozen with the script or every shot becomes a moving target.",
    k: ["Live reference to library vs embedded copy: live references propagate fixes everywhere; embedded copies keep old shots reproducible and miss the fixes.", "Many exposed controls vs few: many controls give flexibility and a cluttered panel; few keep it usable and force artists to dive inside."],
    p: ["A library macro is edited and silently changes the look of finished shots on re-render.", "Macros that depend on a studio path fail when a script is sent to a vendor."],
    v: "Instantiate a macro in two scripts, change the library version, reopen both, and confirm the script pinned to the old version renders identically to before and the unpinned one changes.",
    dep: ["groups-and-subgraphs","scripting-api","properties-panel"]
  },
  "startup-hooks": {
    s: "Code the tool runs at launch and on events such as script open, node creation or before render, used to enforce studio settings.",
    d: "Hooks are registered callbacks: on startup, on script load, after a node is created, before and after each frame or job renders. Studios use them to set the color configuration, add menus, register plugin paths, validate scripts and publish outputs. Search paths are layered, so show, department and user settings combine in a defined order. The hard part is that hooks run in every session including the farm, so a slow hook costs hours across a render and one that fails can break all launches.",
    k: ["Layered configuration vs one shared file: layers let shows override defaults with predictable order; a single file is easy to read and cannot vary per project.", "Hooks that fail loudly vs fail softly: loud failure stops bad scripts early; soft failure keeps people working with a silent setting error."],
    p: ["A hook that queries a network service at every launch stalls every farm task by seconds.", "Order of layered search paths differs between workstations and the farm, giving different results."],
    v: "Launch the tool interactively and headlessly with the same environment, print the effective plugin paths, color configuration and hook list, and confirm both lists are identical.",
    dep: ["scripting-api","config-driven-transforms"]
  },
  "graph-editor": {
    s: "The canvas where artists create, wire, arrange and inspect nodes, with tools for selecting, grouping, disabling and navigating large graphs.",
    d: "The editor draws nodes and links, handles selection and drag, and edits the graph through the same operations as the scripting layer, which provides undo. Large comps reach thousands of nodes, so the editor needs culling, zoom levels, labels, colors and backdrops for readability. Layout is usually the artist's, because position is part of the communication between people. It is hard because it must never stall: dragging a connection triggers dependency checks and may cause the viewer to evaluate, so edits are batched and the interface thread is kept free.",
    k: ["Manual node layout vs automatic layout: manual layout encodes the artist's reasoning and takes effort; automatic layout is tidy and destroys familiar spatial memory.", "Edit immediately vs apply on release: immediate shows effects live and can trigger heavy evaluation; apply on release is calmer and less direct."],
    p: ["Inserting a node in the wrong stream changes a branch no one is looking at.", "Thousand-node graphs redraw slowly if every node is drawn even when off screen."],
    v: "Open a script with two thousand nodes, pan and zoom across it, and confirm interaction stays responsive while connecting two nodes updates the dependency and the viewer without a hang.",
    dep: ["node-and-knob-model","scripting-api","groups-and-subgraphs"]
  },
  "viewer": {
    s: "Displays the output of any node at chosen frame, channel, exposure and color view, and drives evaluation by asking the graph for visible pixels.",
    d: "The viewer requests the displayed region from the selected node, applies the display transform and exposure, and uploads pixels to the screen. Controls include channel isolation, alpha overlay, zoom, region of interest, proxy and A/B inputs. It is the main consumer of the graph: pan and zoom change the requested region, and the playhead changes the requested frame. It is hard because interactivity depends on only asking for what is visible, showing partial results as tiles finish, and not misleading the artist about which resolution or color view they see.",
    k: ["Render only the visible region vs the full frame: visible-only is fast and refreshes on every pan; full-frame gives a cache for later and delays first feedback.", "Display transform on the GPU vs the CPU: GPU is fast and may differ in precision; CPU is exact and slower at large size."],
    p: ["Viewing a proxy or low-quality mode without a clear indicator leads to judging a different image than the output.", "A stale display after an invalidation bug makes the artist think a change did nothing."],
    v: "Set a known test pattern as input, read back the viewer at 100 percent and compare pixel values to the expected display transform result at several sample positions, then change a parameter and confirm the view updates.",
    dep: ["pull-evaluation","display-transforms","regions-of-interest"]
  },
  "properties-panel": {
    s: "Shows and edits the parameters of selected nodes, with typed controls, animation state and links to expressions and other nodes.",
    d: "Each node's parameters generate controls from their declared types: sliders, color pickers, choice menus, positions and file paths. The panel indicates whether a value is constant, keyframed, linked or expression-driven, and offers per-parameter reset and animation. Values commit to the graph on release, and many edits per second must not each trigger a full evaluation. It is hard because parameters are the node's public interface to scripts and files: the panel must reflect changes made by scripts and expressions without losing the user's edit.",
    k: ["Controls generated from parameter declarations vs hand-built panels: generated controls stay consistent and need less code; hand-built panels can be much better for complex tools like keyers.", "Live update while dragging vs on release: live is satisfying and loads the engine; release-only is cheap and feels lazy."],
    p: ["A parameter edited by a script while the panel is open shows an old value and the next edit overwrites it.", "Slider ranges that clamp hide valid out-of-range values that comps rely on."],
    v: "Set a parameter by script while its panel is open and confirm the control changes immediately, then drag it and confirm the viewer follows without queuing hundreds of stale evaluations.",
    dep: ["node-and-knob-model","expression-language","curve-editor"]
  },
  "scopes-and-probes": {
    s: "Instruments for reading image values: pixel probes, histograms, waveforms and vectorscopes computed from the image at a chosen stage.",
    d: "A probe reports the channel values under the cursor in the working space, the display space or both. Scopes summarize a whole frame or region: the histogram of values, a waveform of brightness across the image, a vectorscope of chroma. They compute on the same pixels the viewer shows, or on the pre-display data, and with floating-point images need ranges beyond zero to one. They are hard because meaningful numbers depend on knowing which color space and which stage they measure, and an unlabeled number is misleading.",
    k: ["Probe working-space values vs display values: working values are what operators see; display values match the screen and hide out-of-range data.", "Scope the full frame vs the visible region: full frame is stable and slow; visible region is fast and changes as the artist pans."],
    p: ["A probe quoting display values leads an artist to match a plate to numbers that clip.", "Histogram bins fixed to zero-to-one hide highlights at ten times that value."],
    v: "Feed a flat patch with a known linear value of 0.18 and confirm the probe reads 0.18 in the working space and the expected display value, and the histogram shows a single spike at that value.",
    dep: ["viewer","working-space","display-transforms"]
  },
  "timeline-and-frame-range": {
    s: "Controls the current frame, the project range, playback and in and out points, and shows which frames are cached and which are not.",
    d: "The timeline holds the project frame range, the playback range, the frame rate and the current time. Frame numbers are the unit of all time-dependent parameters and file names. The bar indicates cached frames, keyframes and markers. Playback requests successive frames from the viewer and either holds real time or plays every frame. It is hard because real-time playback of heavy comps is impossible without caching, so the control has to be honest about whether it is showing every frame or dropping them.",
    k: ["Real-time playback with frame dropping vs every frame at any speed: real time shows motion; every-frame is accurate for checking and plays slowly.", "Frame numbers vs timecode as the primary unit: frame numbers are simple and match file names; timecode matches editorial and breaks with frame rate changes."],
    p: ["Judging motion from a playback that silently dropped frames.", "A project range that differs from the cut's range renders the wrong frames to the farm."],
    v: "Play a range of 100 frames with a numbered test sequence in every-frame mode and confirm all 100 numbers are shown in order, then in real-time mode confirm the dropped count is displayed.",
    dep: ["playback-cache","time-dependencies"]
  },
  "curve-editor": {
    s: "Edits animation curves for parameters, with keyframes, interpolation handles, tangents and retiming controls, in a graph of value against frame.",
    d: "Each animated parameter holds keyframes with interpolation: constant, linear, smooth or free tangents. The editor shows curves, lets artists drag keys, scale time and copy values, and applies filters such as smoothing or removing jitter from tracked data. Curves are evaluated at fractional frames, as motion blur requires sub-frame values. The hard part is the volume of data: tracking and solves produce a key per frame on dozens of curves, so editing needs bulk operations that preserve the shape.",
    k: ["Bezier handles vs sampled values: handles are compact and smooth to edit; sampled values are exact for tracking data and heavy to modify.", "Sub-frame evaluation vs whole frames only: sub-frame supports blur and retime correctly; whole-frame is simpler and breaks them."],
    p: ["Overshoot on smooth tangents makes a value pass its limit between keys.", "Bulk smoothing of a tracked curve removes a real, intentional shake."],
    v: "Key a value from 0 at frame 1 to 10 at frame 11 with linear interpolation, read it at frame 6 and 6.5, and confirm 5 and 5.5, then switch to constant and confirm 0 until frame 11.",
    dep: ["node-and-knob-model","time-dependencies"]
  },
  "project-files-and-autosave": {
    s: "Stores a composite as a script file that records the graph, parameters and settings, and protects work with autosave and recovery.",
    d: "A script file is a text serialization of nodes, parameters, connections, layout and project settings. Text makes diffs, merges, scripted edits and recovery possible. Autosave writes periodic copies and a crash recovery file, so a crash costs minutes. Files reference media by path, so portability depends on how paths are written, relative or tokenized. It is hard because files live for years: newer versions must read old scripts, and a script saved with a plugin missing should load with the node preserved but disabled.",
    k: ["Text format vs binary format: text allows diffs and repair by hand; binary is smaller and faster and opaque.", "Absolute vs relative or tokenized paths: absolute paths are simple and break on any move; tokens survive moves and need a resolver."],
    p: ["Opening a script without a plugin and saving it drops the missing node's settings.", "Autosave on a network share stalls the interface every few minutes."],
    v: "Save a script, kill the process during an edit, relaunch, and confirm the recovery file restores all but the last unsaved seconds, and open it on another machine to confirm paths resolve through the project root.",
    dep: ["node-and-knob-model","path-and-frame-patterns","scripting-api"]
  }
});
