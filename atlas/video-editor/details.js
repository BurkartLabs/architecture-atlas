// Details for the video editor plate, part 1: editing interface, collaboration, effects.
ATLAS.details("video-editor", {
  "workspace-layout": {
    s: "The arrangement of dockable panels, viewers and the timeline, saved as named layouts for tasks such as assembling, trimming, grading or mixing.",
    d: "Panels are views over shared models: the project bins, the timeline, the viewers, the inspector. A docking manager stores positions, sizes and which panels are tabbed together, and restores them per task. Panels subscribe to model change notifications, so selecting a clip in the timeline updates the inspector and the viewer without the panels knowing each other. The hard part is keeping many views of one model consistent and cheap while a playhead moves thirty or sixty times a second.",
    k: ["Views subscribing to shared models vs panels calling each other: panels can be added or removed freely, but notification storms during playback need batching.", "Per-task saved layouts vs one global layout: each job gets the right screen, at the cost of layouts drifting out of date when panels are added."],
    p: ["A panel that redraws on every playhead tick without throttling drops playback frames on slower machines.", "Restoring a layout saved on a larger monitor places panels off screen on a laptop."],
    v: "Save a layout, close two panels, move the window to a smaller display, restore the layout, and confirm every panel is visible, correctly sized and still bound to the selected clip.",
    dep: ["timeline-model","media-bins"]
  },
  "source-viewer": {
    s: "A viewer for raw media outside the timeline, where the editor plays a clip, marks the in and out points, and sends the selection to the sequence.",
    d: "The source viewer opens a clip through the same decoder path as the timeline but with its own playhead and marks. Marks are stored as source-time ranges attached to the clip reference, not to the file. Sending the range to the timeline creates a new clip that points back at the source with those bounds. It supports subclips, audio-only or video-only targeting, and match-frame, which finds the source frame for the frame under the timeline playhead. The difficulty is keeping source and timeline time bases from drifting when frame rates differ.",
    k: ["Marks stored on the project's clip reference vs on the file: marks belong to the project and never alter media, but are lost if the clip is relinked incorrectly.", "Separate source playback path vs reusing the timeline engine: the separate path is simple, but behavior can diverge from what the timeline later shows."],
    p: ["Marking in a variable-rate clip with an assumed constant rate lands one or two frames off after the edit.", "Match-frame across a speed change returns the wrong frame because the retime map was ignored."],
    v: "Mark a range in a clip, send it to the timeline, and confirm the first and last displayed frames in the timeline are identical to the marked frames in the source viewer.",
    dep: ["decoder-layer","clips-and-references","rational-time"]
  },
  "edit-operations": {
    s: "The core verbs that change the timeline: insert, overwrite, replace, lift, extract, split, ripple delete and paste, each defined precisely for gaps, tracks and linked clips.",
    d: "Each operation is a pure transformation of the timeline model given a target range, tracks and the sync-lock state. Insert pushes everything after the point later, overwrite replaces what is there, lift leaves a gap, extract closes it. The operation computes the full set of changes, including trimmed clips, new gaps and shifted markers, applies them as one transaction and records it for undo. The complexity is in edge cases: edits that split a clip, cross a transition, or touch a locked track.",
    k: ["Operations as transactions on the model vs direct mutation by UI code: every edit becomes undoable and scriptable, but each verb needs its full effect specified.", "Always preserving sync across tracks vs letting edits ripple only the targeted tracks: protection against accidental offsets costs flexibility for deliberate ones."],
    p: ["An overwrite landing on half a transition leaves a dangling transition with no second clip.", "Ripple on one track while others are unlocked puts picture and sound out of sync with no warning."],
    v: "Run each verb on a fixture timeline with clips, a gap and a transition, and compare resulting clip boundaries and total duration against a hand-computed expected table, then undo and confirm byte-identical project state.",
    dep: ["timeline-model","snapping-and-ripple","linked-selection","undo-history"]
  },
  "trim-tools": {
    s: "Tools that move cut points after the first assembly: ripple, roll, slip and slide trims, with live two-frame feedback and handle limits from the available source media.",
    d: "A trim picks one or more edit points and a mode. Ripple changes one clip's length and shifts later material, roll moves the boundary between two clips without changing total length, slip changes which part of the source a clip shows, slide moves a clip over its neighbors. The tool clamps movement to media handles and neighbor limits, and drives the viewer to show outgoing and incoming frames side by side while dragging. The hard part is making that feedback instant by requesting only the frames at the edit point, with the decoder already positioned.",
    k: ["Real-time trim preview from cached neighbor frames vs recomputing after release: instant feedback matters for frame-accurate judgment, but needs decoders kept warm near every cut.", "Clamping to source handles vs allowing and freezing: clamping is predictable, freezing is convenient but hides that media ran out."],
    p: ["Dragging a roll past the end of a clip's media produces black frames that are not noticed until export.", "Multi-track trims that mix modes on different tracks produce results editors cannot predict."],
    v: "Roll a cut by five frames and confirm total duration is unchanged, both neighbors' media bounds moved by exactly five frames, and the viewer showed the correct outgoing and incoming frames during the drag.",
    dep: ["edit-operations","frame-index","lookahead-prefetch"]
  },
  "undo-history": {
    s: "The record of every editing command, so the editor can step backward and forward through changes, including those from scripts, collaborators and background jobs.",
    d: "Each command stores enough information to reverse itself, either as an inverse operation or as a patch of the affected model parts. A stack or tree holds them, grouped so a drag or a multi-step macro undoes as one step. Commands must be deterministic and must not capture references that later edits invalidate. Undo has to cover timeline, metadata and effect settings, but should not undo derived data such as caches. The difficulty is long sessions: history can hold thousands of commands and large clip sets.",
    k: ["Inverse commands vs state snapshots: inverses are compact and fast, but every command needs a correct inverse; snapshots are simple but use memory on large projects.", "Linear undo vs a history tree: linear is easy to understand, while a tree never loses abandoned branches but is harder to present."],
    p: ["A command that reads current selection when undone, instead of when done, reverses the wrong clips.", "Undo history is dropped on autosave or project reload, so a crash recovery cannot be undone."],
    v: "Perform fifty varied edits, undo all of them and confirm the project serializes byte-identical to the starting state, then redo all and confirm it matches the final state.",
    dep: ["timeline-model","edit-operations"]
  },
  "input-mapping": {
    s: "Maps keyboard shortcuts, jog wheels, control surfaces and graphics tablets to editing commands, with user-defined bindings and per-panel context.",
    d: "Input events are translated into named commands through binding tables that depend on which panel has focus and which tool is active. Hardware such as a jog-shuttle wheel provides continuous input that is turned into variable-speed playback or frame stepping. Grading panels send many small updates that map to parameters, so they are rate-limited to avoid flooding the model. The challenge is consistency: the same command must work from a shortcut, menu, button or script, and bindings must survive keyboard layout differences between countries.",
    k: ["Binding keys by physical position vs by produced character: positional bindings keep a layout across keyboard types, but displayed names can confuse people on other layouts.", "Command layer between input and model vs handlers inside widgets: a layer allows one definition across input paths, at the cost of an indirection to maintain."],
    p: ["A shortcut conflict between a panel's local binding and a global one makes the same key do different things.", "A jog wheel mapped to absolute time rather than relative motion causes the playhead to jump at start-up."],
    v: "Bind a command to a new key, trigger it from the keyboard, the menu and a script, and confirm all three produce the same timeline change and undo entry; switch the keyboard layout and confirm the binding still works.",
    dep: ["edit-operations","undo-history"]
  },
  "multi-user-sync": {
    s: "Lets several editors change one project at the same time, either by locking parts of it or by merging their changes into a shared timeline.",
    d: "Two common approaches exist. Locking assigns bins or sequences to one editor at a time and publishes changes on save. Merging keeps a shared operation log, in which each editor's commands are ordered by a server and replayed on other clients, with conflict rules such as last-writer-wins per property. Either way, project data is split into small units that can be changed independently. It is hard because timeline edits depend on each other: two people trimming neighboring clips can produce overlap that neither saw.",
    k: ["Locks per sequence or bin vs merging fine-grained operations: locks are predictable and simple, while merging allows overlap in work but can create semantic conflicts that need a human.", "Central server as the authority vs peer replication: a server gives one order of changes, at the cost of needing a connection and a place to run."],
    p: ["Two editors ripple edits in the same sequence and the merged result silently shifts a section out of sync with audio.", "A lock held by a crashed client blocks others until an administrator releases it."],
    v: "Have two clients edit different bins and one shared sequence at once, then confirm both converge to identical project state, every conflict is flagged, and a disconnected client's changes merge or are rejected visibly on return.",
    dep: ["project-file","timeline-model","undo-history"]
  },
  "review-comments": {
    s: "Reviewers attach notes, drawings and approvals to exact frames or ranges of a rendered cut, and those notes come back as markers in the editor.",
    d: "A review copy is rendered to a streaming-friendly format, with burned-in or sidecar timecode. The reviewer's tool stores notes keyed to a frame number, a time range and a sequence version, optionally with drawn annotations stored as vectors. Back in the editor, notes are imported as markers at the matching timeline positions. The difficulty is mapping: the reviewer saw version three, but the editor has since changed the timeline, so the same frame must be found in the current cut or flagged as moved.",
    k: ["Notes keyed to version-specific frames vs to clip content: version keys are exact but go stale quickly; content keys follow the shot but can be ambiguous when a shot repeats.", "Burned-in timecode vs sidecar metadata: burned-in always matches what the reviewer saw, but spoils the picture and needs a second render."],
    p: ["A note on frame 1442 applied to a newer cut lands on a different shot with no warning.", "Reviewer tools with a different frame rate assumption produce notes off by a frame in the editor."],
    v: "Render a review copy, add a note at a known frame in the review tool, import it, and confirm the marker lands on the same visible frame; then change the timeline upstream and confirm the note is flagged as moved or stale.",
    dep: ["markers-and-metadata","version-snapshots","render-queue"]
  },
  "version-snapshots": {
    s: "Named, immutable copies of a sequence or project at a point in time, so editors can return to an earlier cut or compare two.",
    d: "A snapshot stores the timeline structure and its references, not the media. Because clips only point at sources, snapshots are small and cheap and can be taken automatically at milestones, before risky operations or on export. Comparison tools list changed clips by identity, so a moved shot is reported as moved, not as deleted and added. The hard parts are stable clip identities across edits and deciding which dependent assets, such as effect settings or captions, belong in the snapshot.",
    k: ["Snapshot copies of structure vs full change history: snapshots are simple to restore and share, but give no detail of what happened between two of them.", "Automatic frequent snapshots vs editor-named ones: automatic ones protect against mistakes but need pruning rules and names that mean something."],
    p: ["A snapshot taken without referenced titles or effect presets restores a sequence that looks different from the original.", "Restoring over the current sequence, rather than into a copy, discards work done since."],
    v: "Snapshot a sequence, make twenty edits, restore the snapshot into a new sequence and confirm the clip list, durations, effects and markers match the original, and a diff against the current cut lists exactly the twenty edits.",
    dep: ["timeline-model","project-file","clips-and-references"]
  },
  "cloud-proxy-workflow": {
    s: "Lets editors work on lightweight proxies while the full-resolution media stays on shared or remote storage, then conforms back to the originals for final output.",
    d: "Original media lives in one place, usually large shared storage. Proxies are generated near it, sent to editors, and linked to each original by identity and timecode. The editor works only with proxies, and a conform step swaps in the originals at export, either locally or on a render machine next to the storage. The project must carry both references per clip. The difficulty is correctness of the link: a proxy that is one frame shifted or a different length makes the final render differ from what was approved.",
    k: ["Editing on proxies with a final conform vs streaming originals: proxies need very little bandwidth, but color and detail judgments wait until conform.", "Rendering next to the storage vs downloading originals: moves compute instead of terabytes, at the cost of keeping a remote render environment matching the editor."],
    p: ["Proxy and original differ in frame count after a failed transcode, so everything after the glitch is off by a frame.", "Effects that behave differently at proxy and full resolution, such as blur radius in pixels, change the look at conform."],
    v: "Edit a sequence with proxies only, conform to originals on the render machine, and compare the output against a local full-resolution render frame by frame, requiring identical cut points and matching frame content.",
    dep: ["proxy-generation","proxy-switching","relinking","render-queue"]
  },
  "effect-framework": {
    s: "The common interface that built-in and third-party effects implement: declared parameters, how they request input frames, and how they render on GPU or CPU.",
    d: "An effect declares its parameters, their types and ranges, the input frames and region it needs, and the pixel formats it supports. The host passes in frames and parameter values for a given time and receives a result. The declared region lets the host render only the visible part, and declared formats allow the host to avoid conversions. Effects can be stacked on a clip, and each is evaluated in order. It is hard to define an interface stable enough for plugins from many vendors while still permitting GPU paths, high bit depth and multi-frame access.",
    k: ["Declarative parameters and requirements vs effects pulling what they need: declarations let the host schedule, cache and cull work, but limit effects with data-dependent needs.", "One interface for GPU and CPU vs separate ones: one interface keeps plugins small, but hides capabilities the best implementation could use."],
    p: ["An effect that ignores its declared region and reads outside it produces edge artifacts at tile boundaries.", "A plugin that assumes eight-bit input gives banding in a float pipeline."],
    v: "Apply a plugin effect to a clip, render the same frame through the GPU path, the CPU path and a tiled render, and confirm all three match within a defined tolerance and the effect never reads outside its declared region.",
    dep: ["plugin-host","shader-runtime","float-precision","keyframes-and-curves"]
  },
  "keyframes-and-curves": {
    s: "Stores how a parameter changes over time as keyframes with interpolation, so position, opacity, color or any effect setting can be animated.",
    d: "A parameter holds a sorted list of time-value pairs and an interpolation type between each pair: hold, linear, or a curve with tangent handles. The value at any time is found by locating the surrounding keys and evaluating the segment. Curves are edited in a graph view and in a small timeline row on the clip. Keyframe times are relative to the clip, not the sequence, so moving the clip moves its animation. Retiming complicates it: when a clip is sped up, the keyframes must scale or stay on source time.",
    k: ["Keyframe time relative to the clip vs absolute sequence time: relative keys move with the clip, but cross-clip synchronization needs extra care.", "Bezier tangents vs simple eased presets: tangents allow exact motion, but presets are faster to use and easier to keep consistent."],
    p: ["Interpolating color in the wrong space, such as nonlinear values, gives muddy mid-tones in a fade.", "Keys beyond a trimmed clip's end are kept but invisible, and reappear when the clip is extended."],
    v: "Animate opacity from 0 to 1 over 24 frames, evaluate each frame, and confirm values follow the chosen curve, hit exact endpoints, and stay stable when the clip is moved or sped up as specified.",
    dep: ["rational-time","clips-and-references"]
  },
  "transitions": {
    s: "Effects that combine the end of one clip with the start of the next, such as dissolves, wipes and dips, defined over a duration centered on or attached to a cut.",
    d: "A transition is a two-input effect with a progress parameter from 0 to 1. It needs extra source material beyond the cut, called handles, from both clips to cover its duration. Placement can be centered on the cut, ending at it or starting at it, and the timeline model records which. The renderer evaluates both clips for each frame within the transition and blends them. Audio crossfades are handled in the audio path. It is hard to handle missing handles gracefully and to keep durations right when neighbors are trimmed.",
    k: ["Transition as an object on the cut vs as a property of a clip: an object makes both neighbors symmetrical, but trimming either side must update it.", "Requiring handles vs freezing the last frame: handles give true motion, while freezing works anywhere but looks wrong in moving shots."],
    p: ["A one-second dissolve on a clip with ten frames of handle silently shortens or freezes without any indication.", "Overlapping a transition with a speed change blends frames from the wrong source moments."],
    v: "Place a 24-frame centered dissolve on a cut with enough handles, render the cut, and confirm frames before and after are untouched, the middle frame is a 50% blend, and total duration is unchanged.",
    dep: ["timeline-model","compositing-and-blending","clips-and-references"]
  },
  "transform-and-motion": {
    s: "Position, scale, rotation, crop and anchor controls that place a clip inside the frame, with resampling that keeps images sharp when they are moved or resized.",
    d: "Each clip carries a transform: translation, scale, rotation, anchor, crop and sometimes perspective. At render time the transform becomes a matrix applied by the GPU with a resampling filter. Order matters: scale before rotate differs from rotate before scale, and the anchor point decides the pivot. Non-square pixel media is corrected first. Differences in aspect ratio between source and project need rules for fit, fill and stretch. The difficulty is sharpness: repeated transforms across nested clips should be combined into one resample.",
    k: ["Composing nested transforms into one matrix vs resampling at every level: one matrix is sharper and faster, but makes effects between the levels harder to order.", "Higher quality resampling filters vs bilinear: better detail, but costs more GPU time and can add ringing."],
    p: ["Scaling a clip in two nested sequences resamples twice and visibly softens it.", "Ignoring pixel aspect ratio produces stretched or squeezed images that are only noticed on a different display."],
    v: "Place a test chart with a one-pixel grid, scale and rotate it by known amounts, and compare the rendered frame to a reference image, requiring the correct pivot, orientation and no accumulated blur beyond one resample.",
    dep: ["keyframes-and-curves","shader-runtime","compositing-and-blending"]
  },
  "compositing-and-blending": {
    s: "Combines layers into one image using alpha, blend modes and track order, defining how transparency and color mix.",
    d: "Layers are composited bottom to top using an alpha model, either straight or premultiplied, and a blend mode such as normal, add, multiply or screen. Correctness depends on working in a consistent encoding, usually linear light, with premultiplication handled at defined points. Track order, track-level effects and adjustment layers define what each layer sees below it. The result for each frame is a tree of operations. The difficulty is subtle convention differences: edges of premultiplied footage and gamma-encoded blends give halos or darkened edges.",
    k: ["Blending in linear light vs in encoded values: linear is physically correct and avoids dark fringes, but differs from the look many editors expect from older tools.", "Premultiplied alpha throughout vs straight: premultiplied composites correctly and filters cleanly, but needs conversion at each import and export."],
    p: ["Treating premultiplied footage as straight leaves a light fringe around keyed subjects.", "Compositing in 8-bit between layers causes banding in gradients that only shows after delivery compression."],
    v: "Composite a half-transparent white layer over black and a gradient in the project's working space, and confirm output values match computed linear-light blends, edges show no fringe, and results are identical on GPU and CPU.",
    dep: ["float-precision","color-pipeline","shader-runtime"]
  },
  "masks-and-tracking": {
    s: "Shapes that limit an effect to part of the frame, with motion tracking that moves those shapes to follow an object across frames.",
    d: "A mask is a closed spline with feather and opacity, animated with keyframes and applied to an effect or layer. Tracking analyzes neighboring frames to estimate the movement of a pattern, producing positions or transforms that drive a mask or an attached graphic. Trackers use feature matching and fall back to manual correction where they lose the target. Results are stored as keyframes the editor can adjust. It is hard because trackers fail on occlusion, blur and lighting change, and tracking data is tied to the source frames, not the final timing.",
    k: ["Tracking on source media vs on the rendered timeline: source tracking survives later edits, but needs the mapping from source to timeline time to be exact.", "Automatic tracking with manual correction vs fully manual keyframes: automatic is faster on easy shots, while manual remains the reliable fallback."],
    p: ["A tracker drifts slowly over long shots and the mask visibly slides off the subject by the end.", "Re-timing a tracked clip leaves the tracking data aligned to the old timing."],
    v: "Track a marker on a moving test clip, attach a mask, render, and confirm the mask edge stays within a pixel tolerance of the object on a sample of frames across the clip, including after a speed change.",
    dep: ["keyframes-and-curves","frame-index","speed-and-retiming","background-jobs"]
  },
  "speed-and-retiming": {
    s: "Changes how fast a clip plays, including constant speed, ramps, reverse and freeze frames, with frame blending or optical flow to fill in missing frames.",
    d: "A retime is a map from timeline time to source time, constant or curved. For each timeline frame the engine evaluates the map and fetches the nearest source frame, blends two neighbors, or synthesizes one using motion estimation. Slow motion needs interpolation to avoid stutter; fast motion drops frames and may need motion blur. Audio is muted, pitch-shifted or time-stretched. The map also affects effect keyframes and tracking data. It is hard to make the map exact in rational time and to keep interpolated frames free of artifacts.",
    k: ["Nearest-frame vs blended vs flow-based interpolation: flow looks smoothest on slow-motion but is costly and shows tearing at occlusions; nearest is exact but stutters.", "Source-time vs timeline-time keyframes under a retime: source-time keeps effects glued to the action, timeline-time keeps animation timing as set."],
    p: ["Reverse playback of long-GOP media is slow and drops frames, because the decoder must walk forward for each reverse frame.", "Optical flow produces ghosting around fast-moving edges that only appears in the final render."],
    v: "Apply a 50% speed change to a clip with a numbered frame counter, render, and confirm each source frame appears twice or is interpolated as configured, with total duration doubled and audio matching the chosen mode.",
    dep: ["rational-time","decoder-layer","audio-tracks","cpu-fallback"]
  },
  "nested-sequences": {
    s: "Lets one sequence appear as a single clip inside another, so a finished scene can be treated as one unit and reused or reworked in one place.",
    d: "A nested sequence is a clip whose source is another timeline. The renderer evaluates the inner timeline at the mapped time and uses its output as the clip's frames, then applies the outer clip's effects. Changes to the inner sequence show everywhere it is used. The nest has its own frame size, rate and sometimes color settings. It is hard because it multiplies cost, as the same inner scene may be evaluated more than once per frame, and because cache and render-cache identity must follow the inner contents.",
    k: ["Live reference to the inner sequence vs a flattened copy: references keep one source of truth, but a flatten step is needed for sharing and for performance.", "Rendering the nest as its own unit vs inlining its layers: a unit isolates settings and enables caching, but hides inner layers from outer blends."],
    p: ["Different frame rate or size in the nest causes resampling that is not evident from the outer timeline.", "A circular nest reference hangs the renderer unless detected."],
    v: "Nest a scene twice at different positions, change a clip inside it, and confirm both uses update on the next frame, caches for the old content are invalidated, and the project rejects a nest that would contain itself.",
    dep: ["timeline-model","cache-invalidation","frame-graph"]
  }
});
