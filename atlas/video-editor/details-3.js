// Details for the video editor plate, part 3: timeline model, project and media management.
ATLAS.details("video-editor", {
  "timeline-model": {
    s: "The in-memory document that describes the edit: sequences containing tracks containing clips, with every placement, effect setting and marker, from which all output is derived.",
    d: "The model is a tree: a project holds sequences, a sequence holds tracks, a track holds an ordered list of clips and gaps. Clips carry source references, source ranges, effects and transitions. The model is the single source of truth: viewers, scopes, the renderer and exporters only read it. Changes arrive through commands that produce change events. Identity is stable, so clips keep their ids across moves. It is hard because the structure must support fast lookup by time on very long timelines, and exact, defined behavior for gaps and overlaps.",
    k: ["Ordered lists per track with computed positions vs absolute start times stored on clips: lists make ripple edits simple and prevent overlaps, while stored times make random lookup trivial but require updating many clips on every ripple.", "Immutable structure with cheap copies vs in-place mutation: immutability makes undo, snapshots and background rendering safe, at the cost of allocation churn."],
    p: ["Background render threads reading a model that the editor thread is changing see half-applied edits.", "Position lookup that scans a track linearly becomes slow with thousands of clips."],
    v: "Build a timeline of ten thousand clips, query the clip at random times, and confirm results equal a brute-force scan, lookups stay under a millisecond, and a concurrent render sees a consistent snapshot while edits continue.",
    dep: ["clips-and-references","tracks-and-lanes","rational-time"]
  },
  "tracks-and-lanes": {
    s: "Layers that hold clips in order, separated by type, with properties such as lock, mute, target, height and track-level effects.",
    d: "Video tracks stack, so the higher track covers the lower one, and audio tracks sum. Each track has flags: locked against edits, muted or hidden, targeted for the next insert, and included in sync locking. Tracks may have their own effects, such as an adjustment applied to everything beneath. Audio tracks carry a channel layout. Some editors use a magnetic main storyline and secondary lanes attached to it instead. It is hard to define precisely what lock and target mean for every edit operation.",
    k: ["Fixed track layers vs magnetic attached lanes: fixed tracks give exact control for complex edits, while attached lanes keep related clips together and reduce accidental sync loss.", "Track-level effects vs clip-level only: track effects apply a grade or a mix once, but make clip behavior depend on its track."],
    p: ["Moving a clip to another track silently drops effects that belonged to the old track.", "A hidden track still contributes to audio or render, so output differs from what is visible."],
    v: "Lock one track, mute another, run each edit verb across all tracks, and confirm locked tracks are unchanged, muted tracks are excluded from render, and track effects apply only to the clips beneath them.",
    dep: ["timeline-model"]
  },
  "clips-and-references": {
    s: "Each clip records which source media it uses, the range of that media, and its own settings, so the project never copies or alters the original files.",
    d: "A clip holds a reference to a media item in the project, a source in and out in source time, an effect list and flags. Several clips can use the same source. A media item holds the path or locator, stream layout and a fingerprint. Changing a clip never changes the file, which is what makes the system non-destructive. Relinking changes the locator without touching clips. It is hard to keep references valid across moves, renames and transcoding, and to keep many clips pointing at one item consistent.",
    k: ["Reference to a project media item vs direct file path in the clip: indirection allows one relink to fix all clips, at the cost of an extra object to keep in sync.", "Fingerprint for identity vs path only: a fingerprint finds moved media, but costs time to compute and fails when the file is re-encoded."],
    p: ["Two media items for the same file after a re-import make a relink fix only half the clips.", "A clip's source range extends past the end of a replaced, shorter file and decodes nothing."],
    v: "Use one file in a hundred clips, move the file, relink once, and confirm all clips resolve and render the same frames as before; truncate the file and confirm clips beyond its end are reported.",
    dep: ["media-bins","relinking","rational-time"]
  },
  "rational-time": {
    s: "Represents time as exact fractions of a second tied to each frame rate, so frames and audio samples fall on exact positions and errors never accumulate.",
    d: "Frame rates such as 24000/1001 cannot be written exactly in floating point. The editor stores times as integer numerators over a denominator, usually as a rational number or as ticks of a very fine timebase. Conversion between frame numbers, timecode, seconds and audio samples uses integer arithmetic with defined rounding. Drop-frame timecode is only a display convention over the same exact time. The hard part is mixed rates in one project, where a clip's frame boundaries do not align with the sequence's.",
    k: ["Rational numbers vs a fixed high-resolution tick: rationals are exact for any rate, while ticks are faster and simpler but cannot represent every rate exactly.", "Rounding to the nearest frame vs flooring when mapping between rates: nearest minimizes error, while flooring is stable and never shows a future frame."],
    p: ["Floating-point seconds accumulate error, so a ninety-minute timeline drifts by a frame by the end.", "Drop-frame timecode is treated as a real time change, which shifts every cut by seconds."],
    v: "Convert one hundred thousand frame numbers at 29.97 and 23.976 rates to time and back, and confirm the round trip is exact, and that two hours of timeline ends at the exact expected frame.",
    dep: []
  },
  "snapping-and-ripple": {
    s: "The rules that make clips jump to nearby edges and markers and that decide which material shifts when an edit changes a duration.",
    d: "Snapping computes candidate positions from clip edges, markers and the playhead, and moves a dragged clip to one within a pixel threshold. Ripple behavior propagates a change in length to everything later on the affected tracks, honoring track locks and sync locks. Rules also cover collisions, where a dragged clip overlaps another, whether it overwrites, pushes or stops. They are hard to get right because they depend on zoom, on which tracks are targeted, and on edge cases around gaps and transitions.",
    k: ["Snap threshold in screen pixels vs in time: pixel thresholds feel the same at any zoom, but the time tolerance varies and can skip small gaps.", "Overwrite on collision vs push vs refuse: overwrite is fast but destructive to neighbors, refusing is safe but interrupts the editor's flow."],
    p: ["Snapping to an edge on a hidden track moves a clip to a position with no visible reason.", "Ripple with one unlocked track and one locked track opens a hole in one and not the other."],
    v: "Drag a clip near an edge at three zoom levels and confirm it snaps to the exact frame of that edge each time; ripple-delete with mixed locks and confirm only intended tracks changed.",
    dep: ["timeline-model","tracks-and-lanes","linked-selection"]
  },
  "linked-selection": {
    s: "Keeps related clips, such as a camera shot and its sound, selected and moved together, with sync locks that protect alignment across tracks.",
    d: "Clips that came from one recording share a link group. Selecting or moving one affects the others, unless linking is turned off temporarily. Sync locks go further: an edit on one track that changes length shifts the other locked tracks by the same amount, so the whole sequence stays aligned. The model stores link groups and lock flags and the edit operations consult them. The difficulty is that people need both behaviors, so the default must be safe and overrides must be quick and visible.",
    k: ["Linking on by default with a temporary override vs off by default: default linking prevents lost sync, while overrides are needed for deliberate offsets such as J and L cuts.", "Link groups stored as ids on clips vs a separate structure: ids on clips are simple, but splitting a clip must correctly copy or break the link."],
    p: ["Splitting a linked clip leaves the audio half linked to the wrong video half.", "A temporarily disabled link is forgotten, and later moves unexpectedly leave sound behind."],
    v: "Link a video clip with its audio, move, trim and split it, and confirm both stay aligned; use an override to offset audio by ten frames and confirm the offset is shown and kept.",
    dep: ["timeline-model","tracks-and-lanes"]
  },
  "markers-and-metadata": {
    s: "Annotations on the timeline and on clips: markers with names, colors and notes, plus searchable metadata such as scene, take and keywords.",
    d: "A marker has a time or range, a type and text, and can belong to a clip, in which case it moves with it, or to the sequence. Metadata fields attach to media items and clips, and drive searches, smart bins and exports. Markers are used for review notes, chapters, beat points and to-do lists. Chapters and cue points are written out at export. The difficulty is keeping markers attached to the right moment through edits and defining how metadata merges when clips come from various systems.",
    k: ["Clip-attached markers vs sequence-time markers: attached markers follow the shot through edits, while sequence markers represent a timeline moment such as a chapter.", "Free-form metadata vs a defined schema: free-form is flexible, while a schema allows reliable searching and exchange."],
    p: ["Sequence markers do not move when material ahead of them is rippled, and end up on the wrong scene.", "Metadata edits made on a proxy item are not applied to the original item."],
    v: "Add clip and sequence markers, ripple earlier material, and confirm clip markers follow their shots while sequence markers behave as documented; export chapters and confirm they match positions.",
    dep: ["timeline-model","media-bins","rational-time"]
  },
  "multicam": {
    s: "Combines several synchronized camera angles into one source so an editor can cut between angles live while the clip plays, and revise each cut later.",
    d: "A multicam source groups clips by sync point, such as timecode, an audio waveform or a marker, onto parallel angles. In the viewer all angles are shown at once. As the clip plays, the editor picks an angle, producing a cut recorded as a switch with a time. The result stays flexible, since each switch can be changed or its angle replaced without rebuilding the edit. It is hard to decode many streams at once, and to align angles that start at different times or drift.",
    k: ["Decoding all angles at full resolution vs proxies for the viewer: full quality is exact but needs high throughput; proxies make many angles playable on modest hardware.", "Angle switches kept as live data vs flattened into cuts: live switches allow re-cutting and replacing angles, while flattened cuts are simpler to exchange."],
    p: ["Angles that start before or after the group are shown as black and no one is warned.", "Syncing by audio fails in noisy rooms and misaligns angles by a few frames."],
    v: "Build a four-angle group from clips with a clap, cut live, then replace one angle and confirm the switches persist, all angles are aligned at the clap, and playback of four streams holds frame rate.",
    dep: ["sync-and-drift","proxy-switching","playback-engine","clips-and-references"]
  },
  "edit-decision-lists": {
    s: "Exports and imports the cut as a list of events with source, timecode and transitions, so it can move to other tools such as color, sound and finishing.",
    d: "The simplest format is a cut list of events: source name, source range, record range, and transition type. Richer formats carry multiple tracks, effects, speed changes and audio levels, but each supports only a subset. Export maps the internal model to that subset and reports what is lost. Import reverses the process and matches sources by name and timecode. It is hard because every tool uses its own naming, and each mapping loses something, such as nested sequences, custom effects or exact speed ramps.",
    k: ["A simple, widely supported list vs a richer exchange format: simple lists work with almost any tool, while richer formats keep more at the price of uneven compatibility.", "Flattening the timeline before export vs preserving structure: flattening removes ambiguities, but loses editability for the receiver."],
    p: ["Reel names that differ between systems make imported clips unmatched.", "Speed ramps exported as constant speed change the length of shots in the receiving tool."],
    v: "Export a sequence, import the list into a second instance, and compare the clip positions and ranges frame by frame with the original; confirm each unsupported feature is reported rather than dropped.",
    dep: ["timeline-model","clips-and-references","markers-and-metadata"]
  },
  "project-file": {
    s: "The saved form of a project: the timeline model, bins, settings and references in a versioned format, written so that a failed save never destroys the previous copy.",
    d: "The file stores structure and settings, not media. It may be a text or binary document, or a database that is updated incrementally. A save writes to a temporary file and then replaces the original atomically, keeping a backup. The format contains a schema version so older files can be migrated. Large projects have hundreds of thousands of objects, so loading is staged and lazy. The difficulty is making saves fast and safe, and the format stable enough to be read years later.",
    k: ["Whole-document save vs incremental database: whole-document is simple and portable, while a database makes saves instant and enables partial loading but complicates sharing and recovery.", "Human-readable text vs compact binary: text is diffable and recoverable by hand, binary is smaller and faster to load."],
    p: ["Writing in place and crashing mid-save leaves a truncated file with no backup.", "Absolute paths stored in the file break when the project is opened on another computer."],
    v: "Kill the process in the middle of a save one hundred times at random points and confirm the project always opens as either the old or the new complete version, never a partial one.",
    dep: ["timeline-model","schema-migration","media-file-io"]
  },
  "autosave": {
    s: "Writes recovery copies on a schedule and after significant edits, so a crash loses at most a few minutes of work, and offers to restore them on the next launch.",
    d: "Autosave runs on a background thread, snapshotting the model and writing to a separate recovery location, with a rolling set of recent versions. It must not block editing or play with a half-changed model, so it works from an immutable snapshot or a journal of commands. On start the editor checks for unclean shutdown markers and offers recovery. Journaling every command allows replay after the last snapshot. It is hard to keep it cheap on huge projects and to avoid overwriting the user's real project file.",
    k: ["Periodic full snapshots vs a command journal: snapshots are simple but lose recent work, while a journal recovers to the last command and needs replay logic.", "Autosaving to the project file vs to separate recovery files: separate files never corrupt the real project, but need cleanup and a way to reconcile."],
    p: ["An autosave that locks the model for seconds on a large project causes visible stutter every few minutes.", "Recovery files are deleted on a clean exit of the wrong project and are gone when needed."],
    v: "Edit for a few minutes, kill the process, restart, and confirm the recovery offer appears and restores the project to within one command of the last edit.",
    dep: ["project-file","undo-history","background-jobs"]
  },
  "media-bins": {
    s: "The project's catalog of media items and sequences, organized into folders with metadata, search, smart collections and thumbnails.",
    d: "Bins hold references to media items with their analyzed properties: duration, codec, frame rate, color space, audio layout and user metadata. Users arrange items in folders, label them and search by any field. Smart bins show items matching a query and update as metadata changes. Thumbnails and waveforms are drawn from caches. The bin database must remain responsive with tens of thousands of items. The challenge is syncing the catalog to the files on disk as they change, appear or vanish.",
    k: ["Catalog stored in the project vs a shared media database: project storage is self-contained, while a shared database allows reuse across projects but requires a service.", "Virtual folders as queries vs fixed folders: queries keep organization current automatically, while fixed folders are predictable and manual."],
    p: ["Importing a folder twice creates duplicate items that make later relinking ambiguous.", "Search over unindexed metadata becomes slow on large catalogs."],
    v: "Load a catalog of fifty thousand items, run searches and smart-bin queries, and confirm results are correct against a scan of the metadata and return within a second.",
    dep: ["metadata-extraction","thumbnail-waveform-cache","clips-and-references"]
  },
  "relinking": {
    s: "Finds media that is missing or moved and reconnects project items to it, matching by name, path, timecode and fingerprint.",
    d: "When a referenced file cannot be found, the item is marked offline and its clips show a placeholder. Relinking searches a chosen location for candidates, and scores them by file name, folder structure, duration, timecode, reel name and optionally a content fingerprint. It can relink many items in one pass by learning the path change from the first. It is hard to avoid wrong matches when files have similar names, and to handle media that was transcoded, where only timecode and name still agree.",
    k: ["Automatic matching with confirmation vs fully automatic: confirmation prevents silent wrong links, while automatic saves time on large projects.", "Content fingerprints vs metadata matching: fingerprints are exact for identical files, but fail after transcoding where metadata still works."],
    p: ["A relink to a clip with the same name but different take replaces footage without any visible warning.", "Offline items render as black with no log entry in export."],
    v: "Move a media folder, run relink, and confirm every item reconnects to its identical file; inject a decoy with the same name and different duration and confirm it is not chosen.",
    dep: ["clips-and-references","metadata-extraction","media-file-io"]
  },
  "media-management": {
    s: "Copies, trims and archives only the media a project uses, so a finished or shared project can be moved with its media and no unused material.",
    d: "The tool scans sequences for used source ranges, then copies those files, optionally trimmed to the used range plus handles, into a target folder and relinks the copy of the project. It can transcode to a single intermediate format. Copies are checked for integrity. Archive mode keeps the project and media together for long-term storage. It is hard because trimming media changes timecode and file identity, and because shared items can be used in many sequences.",
    k: ["Copying whole files vs trimming to used ranges plus handles: whole files are simple and keep options open, trimmed copies save storage but limit later changes.", "Transcoding to one format vs keeping originals: one format simplifies archives, but originals avoid generation loss."],
    p: ["Trimmed media with too few handles prevents later extension or transitions at the cut.", "A copy that is not verified silently contains a truncated file."],
    v: "Consolidate a project, open the result on another machine, and confirm every clip renders the same frames as the original, the media size is reduced, and file checksums of copied ranges match.",
    dep: ["relinking","clips-and-references","media-file-io","project-file"]
  },
  "schema-migration": {
    s: "Versions the project format and upgrades older project files to the current structure on open, keeping them usable across years of software changes.",
    d: "Every project file carries a schema version. When opened, the loader applies an ordered series of migrations, each converting one version to the next, such as adding a field with a default or restructuring effects. It keeps a backup of the original and records the migration. Newer files opened in older software are either refused or opened read-only. The difficulty is long chains of migrations, effect parameters whose meaning has changed, and tests that cover real old files, not only synthetic ones.",
    k: ["Stepwise migrations vs direct conversion from each old version: stepwise code is small and testable, while direct conversion is faster but multiplies cases.", "Refusing newer files vs best-effort open: refusing prevents data loss, while best-effort lets people continue but may silently drop unknown data."],
    p: ["A migration that changes an effect's default makes old projects look different without notice.", "Upgrading in place without a backup makes it impossible to return to the older version."],
    v: "Open a library of project files from each past version, migrate, render a reference frame from each, and confirm renders match stored baselines and backups of originals exist.",
    dep: ["project-file"]
  },
  "project-interchange": {
    s: "Imports and exports whole projects to and from other editing systems, mapping sequences, effects and media where the two models overlap.",
    d: "Interchange translates between models that are not identical. An exporter writes tracks, clips, speeds, basic effects and audio levels in a documented exchange format; an importer rebuilds them, and creates placeholders for anything unsupported. Both produce a report of what was converted and what was not. Reference media is matched or copied. It is hard because behavior differs, for example in how two systems evaluate speed ramps or transitions, so identical data can render differently.",
    k: ["Lossless private format vs lowest-common-denominator format: private formats keep everything but only work between like systems, common formats work widely with less detail.", "Baking unsupported effects into new media vs dropping them: baking preserves the look, but removes the ability to adjust."],
    p: ["An unsupported effect is dropped silently, and the receiving editor assumes the picture is complete.", "Time remapping interpreted differently in the second system moves later cuts out of sync."],
    v: "Round-trip a representative sequence through the exchange format, render both versions, and confirm cut points are identical and any visual differences are limited to items listed in the conversion report.",
    dep: ["edit-decision-lists","timeline-model","media-management"]
  }
});
