// Details for the graphics editor plate, part 7: color, persistence, exchange and cross-cutting concerns.
ATLAS.details("graphics-editor", {
  "color-profile-handling": {
    s: "Reading, embedding, assigning and converting between color profiles on images and documents, so numeric colors keep a defined meaning in every file.",
    d: "Every image and document has a profile that defines how numbers map to real colors: its primaries, white point and transfer curve. On import the editor reads the embedded profile, or assumes a default when none is present, and converts into the working space. On export it converts to the target profile and embeds it or not. A color management engine performs the conversions with a chosen rendering intent. It is hard because untagged files are ambiguous, because conversion between spaces can clip colors, and because profile versions and formats differ in precision.",
    k: ["Converting on import to the working space vs keeping each source in its own space: converting simplifies everything downstream, but loses the original numbers.", "Assuming a standard space for untagged files vs prompting the user: assuming is quick, prompting avoids wrong guesses at the cost of friction."],
    p: ["An untagged image is read as the wrong space and looks washed out, then is saved with that profile embedded.", "A profile is dropped on export and viewers apply a different default."],
    v: "Import the same image tagged with three profiles and an untagged version, export each with and without embedding and view in another color-managed application. Confirm each looks identical to the editor, with untagged files noted.",
    dep: ["image-codecs-and-metadata", "working-space-and-bit-depth"]
  },
  "working-space-and-bit-depth": {
    s: "The color space and numeric precision in which editing and compositing happen: a standard or wide-gamut space, with 8-bit, 16-bit or floating-point channels.",
    d: "The working space defines what colors can be represented during editing, and the bit depth determines how finely. Eight bits are small and fast but band in gradients and after repeated adjustments; 16-bit integer and floating-point formats have much more headroom, and floating point also holds values beyond the displayable range. Compositing may happen in a linear or encoded form. Documents may carry a different space than the display. It is hard because higher precision costs memory and speed, and because mixed-depth documents need defined conversion points.",
    k: ["Wide-gamut working space vs a standard small space: wide gamut keeps saturated colors for modern displays, but is clipped for typical web delivery.", "Linear-light compositing vs encoded compositing: linear is physically correct for blending and blur, but disagrees with the look most designers know."],
    p: ["Editing in 8 bits and applying several adjustments produces visible banding in skies.", "Converting a wide-gamut design to a smaller space for web clips saturated colors with no warning."],
    v: "Apply the same series of five adjustments in 8-bit and 16-bit to a smooth gradient. Confirm 16-bit shows no banding, the 8-bit version's steps are measurable, and conversion warnings list clipped colors.",
    dep: ["color-profile-handling", "tiled-image-store"]
  },
  "wide-gamut-display": {
    s: "Showing document colors correctly on displays with a different gamut and brightness range, including wide-gamut and high-dynamic-range screens, with per-display conversion.",
    d: "The renderer converts from the working space to the profile of the display the window is on, usually in a final shader step. On a wide-gamut screen, saturated colors are shown fully; on a standard screen they are mapped into gamut. Dragging a window between displays triggers conversion changes. High dynamic range adds extended brightness and needs a floating-point surface. It is hard because platforms expose display information inconsistently, because browsers may or may not color manage the canvas, and because the user cannot compare against a reference without calibration.",
    k: ["Converting in the final shader vs relying on the platform compositor: the shader is under the editor's control, but duplicates work the platform may also do and risks double conversion.", "Clipping out-of-gamut colors vs gamut mapping: clipping is simple and exact in range, mapping preserves relationships but changes colors."],
    p: ["Color is converted twice, by the editor and by the platform, and appears oversaturated.", "A window moved to a second display keeps the first display's profile."],
    v: "Display a ramp of saturated colors on a wide-gamut and a standard display and drag the window between them. Confirm the editor changes conversion on moving, with no double conversion, and a hardware measurement confirms reference colors.",
    dep: ["color-profile-handling", "canvas-renderer", "working-space-and-bit-depth"]
  },
  "soft-proofing": {
    s: "Previewing how a document will look on a specific output device, such as a printer or a small-gamut screen, by simulating its profile and showing out-of-gamut colors.",
    d: "Soft proofing converts the display view through the output device's profile and back to the display profile, so the screen shows what the device will reproduce, with its limited gamut and its rendering intent. A paper-white and black-ink simulation can be added. Out-of-gamut colors can be highlighted. Proof settings are saved per document and do not change the data. It is hard because the simulation is only as good as the output profile and display calibration, and because intent and black point handling change appearances noticeably.",
    k: ["Simulating paper white and ink black vs relative rendering: full simulation is more realistic, but makes the screen look dull and unlike normal editing.", "A proof view toggled per document vs a persistent second view: a toggle is simple, a second view helps compare but uses more rendering."],
    p: ["The proof is done with a generic profile and the printed result differs, with the designer blaming the printer.", "The proof setting is left on and a designer edits colors while looking at the simulated view."],
    v: "Proof a saturated image against a printer profile with gamut warning on, print on that device and compare with the screen. Confirm the warning marks colors that shifted, and the simulated view matches the print within tolerance.",
    dep: ["color-profile-handling", "wide-gamut-display", "print-color-separations"]
  },
  "print-color-separations": {
    s: "Preparing color for ink: conversion to CMYK and spot colors, separation into plates, overprint, black generation, ink limits and trapping, with output intents.",
    d: "Print conversion maps working colors into the device's ink space, with a black generation strategy and a total ink limit. Spot colors stay as named inks with tints and may overprint. Separations produce one plate per ink for proofs and production. Output intents embedded in PDF files state the target condition. Print files must hold images at suitable resolution and bleed. It is hard because CMYK is device-specific, because gamut mismatches shift colors, and because files made for screen need disciplined conversion without double conversion of already converted images.",
    k: ["Converting to CMYK at export vs designing in CMYK: converting late keeps screen options open, but changes colors at the last step; designing in it is predictable for print only.", "Spot colors as separate inks vs converting to process colors: separate inks are exact but cost extra plates, converting is cheaper but approximates."],
    p: ["Pure black text is converted to a four-color mix and prints with a visible halo from misregistration.", "A spot color name differs by one character and is output as two separate plates."],
    v: "Export a design with spot and process colors to a print PDF and inspect separations. Confirm spot inks are named once, black text uses only the black plate, total ink stays under the limit and the output intent is embedded.",
    dep: ["color-profile-handling", "print-and-pdf-export", "working-space-and-bit-depth"]
  },
  "file-format": {
    s: "The saved representation of a document: a container with the node tree, properties, embedded assets, schema version and metadata, designed for fast open, extension and diffing.",
    d: "A file is a container holding the serialized scene graph (often in a compact binary encoding or a structured text form), references to binary assets such as images and fonts, thumbnails and metadata, plus the schema version. Nodes are stored with ids and properties; large arrays use compressed typed storage. A design goal is to read only what is needed to show the first page. Unknown fields are kept. It is hard because formats live for decades, must be written incrementally, and need to round-trip across versions.",
    k: ["Binary encoding vs text encoding: binary is smaller and faster to parse for huge files, but is harder to inspect and debug.", "One monolithic file vs chunks for pages and assets: chunks open and save faster for large files, but add indexing and consistency work."],
    p: ["A format change makes a new file unreadable by older clients without a warning, which stops teams from collaborating.", "Large documents are parsed entirely on open and take minutes to show anything."],
    v: "Save a 5-million-node document, open it and time to first visible page, then round-trip through three schema versions. Confirm first paint is within budget and the tree is identical after the round trip.",
    dep: ["scene-graph", "document-schema-and-migration", "binary-asset-store"]
  },
  "incremental-save": {
    s: "Writing only what changed since the last save, by appending changed chunks or journal entries, so a small edit costs a small write even in a huge file.",
    d: "The saver tracks changed nodes and assets through change tracking and writes only those chunks, either by appending to a journal that is later compacted or by updating pages in a chunked container. The index is updated atomically last. Periodic full rewrites reclaim space. Cloud documents are saved by the server from the operation stream, local files by the client. It is hard because partial writes must never corrupt the file, because appended data accumulates garbage, and because saves must not block editing.",
    k: ["Append-only journal with periodic compaction vs in-place page updates: append-only is crash-safe and simple, but needs compaction and extra space.", "Saving on every change vs at intervals: continuous is safe, intervals are cheaper but expose a window of lost work."],
    p: ["The index pointer is written before the data and a crash leaves the file pointing at garbage.", "Compaction runs during editing and holds a lock that makes the interface stall."],
    v: "Edit one node in a 2 GB document and measure bytes written, then power off the machine in the middle of a save. Confirm the write is a few kilobytes and the file reopens to either the old or new state.",
    dep: ["file-format", "change-tracking", "file-integrity"]
  },
  "local-cache": {
    s: "A durable local copy of documents, assets, fonts and pending operations that makes opening fast, supports offline editing and reduces server load.",
    d: "The client stores snapshots, recent operations, thumbnails and binary assets in local storage with version keys. Opening a document loads the cached snapshot first, then catches up with the server's newer operations. A pending-operation queue holds unsynced edits. Quotas and eviction decide what stays. Users can mark files available offline. It is hard because browsers can clear storage, because quotas differ widely, and because a stale cache must never be shown as current or overwrite newer server data.",
    k: ["Caching whole documents vs only the opened pages: whole documents support offline use, but use more space and bandwidth up front.", "Trusting the cache and syncing after vs validating before showing: trusting is fast, validating avoids showing stale data but adds latency."],
    p: ["A cache entry from an older schema is loaded by a newer client and migrates incorrectly.", "Storage is cleared by the browser with unsynced operations still queued and the edits vanish."],
    v: "Open a document, go offline, edit, close and reopen offline. Confirm the document opens from cache within the budget, edits persist, and after reconnecting they sync with no loss and no stale content shown as current.",
    dep: ["file-format", "binary-asset-store", "offline-and-reconciliation"]
  },
  "binary-asset-store": {
    s: "Content-addressed storage for images, fonts, video and other large binaries, deduplicated by hash and fetched separately from the document structure.",
    d: "Assets are stored under the hash of their content, so identical files are kept once across documents and versions. The document refers to them by hash. Upload happens in the background with resumable transfers, and the client downloads assets on demand, at suitable resolutions, through a content delivery network. Reference counting or garbage collection removes unused blobs. It is hard because versions and branches retain references, so deletion needs care, and because access control must apply to hashes that anyone who knows them could request.",
    k: ["Content addressing vs per-document asset ids: hashes deduplicate and cache perfectly, but make deletion and access control subtler.", "Storing originals only vs also generated renditions: renditions load faster on small views, but add storage and invalidation logic."],
    p: ["A hash-based URL is accessible without authorization to anyone who has it.", "An asset is garbage collected while an old version still references it, and a restore fails."],
    v: "Upload the same image from two documents, delete one document and restore an old version of the other. Confirm one blob is stored, it survives the deletion while referenced, and the restore shows the image.",
    dep: ["file-format", "permissions-and-sharing"]
  },
  "autosave-and-recovery": {
    s: "Continuous protection of work: frequent background saves of local files and unsynced edits, and recovery of the last good state after a crash, power loss or forced quit.",
    d: "A background timer or change threshold writes a recovery copy to a separate location, without replacing the user's file. On start-up the editor detects an unclean shutdown, offers to restore from the recovery copy, and shows what is newer. For cloud documents, the operation queue in local storage plays this role. Saves happen off the main thread. It is hard because large documents take long to serialize, because saves must not interrupt painting, and because recovery must be trustworthy, not offer broken files.",
    k: ["A separate recovery file vs saving over the original: a separate file protects against bad saves, but needs cleanup and a clear restore flow.", "Saving at fixed time intervals vs after a number of edits: time intervals bound loss predictably, edit counts adapt to activity."],
    p: ["The recovery file is written over by the next autosave while the user is considering the restore prompt.", "Serializing on the main thread freezes painting for seconds every few minutes."],
    v: "Edit a large file for ten minutes, kill the process with no warning and restart. Confirm the recovery prompt appears, the restored file contains every edit up to the last autosave interval, and painting never stalled during saves.",
    dep: ["incremental-save", "local-cache", "snapshot-checkpoints"]
  },
  "file-integrity": {
    s: "Checks and repair that keep documents valid: checksums, atomic writes, structural validation on open, and recovery of what can be read from a damaged file.",
    d: "Writes go to a temporary file and are renamed into place, or use a journal whose last entry is verified by checksum. On open, the loader validates structure: parents exist, ids are unique, references resolve, values are within range. Damaged chunks are skipped or repaired where possible, and the user is told what was lost. Server snapshots are verified after being written. It is hard because validation of millions of nodes takes time, and because automatic repair can hide bugs or silently alter documents.",
    k: ["Strict validation that refuses to open vs lenient repair: strict is safe and surfaces bugs, lenient keeps people working but may hide damage.", "Per-chunk checksums vs a whole-file checksum: per-chunk localizes damage and speeds checks, a whole-file one is simpler."],
    p: ["Repair silently deletes nodes with dangling references and the loss is noticed weeks later.", "A write is interrupted between data and checksum and the file is declared corrupt although the data is intact."],
    v: "Corrupt random bytes in a copy of a large file, open it and run validation. Confirm the corrupted chunk is detected, the rest opens, the user sees which nodes were lost, and the original is untouched.",
    dep: ["file-format", "document-schema-and-migration"]
  },
  "raster-import-export": {
    s: "Reading and writing bitmap formats with their color profiles, bit depths, alpha and layers, and choosing compression and resolution for each target.",
    d: "Import decodes images into tiles in the working space, honoring embedded profiles, orientation and transparency. Large images are decoded progressively and downscaled when only a preview is needed. Export flattens or preserves layers depending on the format, converts to the target profile and bit depth, and chooses compression: lossless for graphics, lossy with quality settings for photos. Presets handle sizes and densities. It is hard because formats differ in alpha, depth and metadata, and because lossy compression artifacts depend on settings.",
    k: ["Decoding whole images vs streaming tiles: streaming keeps memory low for huge images, but limits which formats and operations can be used.", "Offering many formats vs a few well-supported ones: more formats help interoperability, but each needs testing for color and alpha fidelity."],
    p: ["Export drops the embedded profile and the image looks different in other viewers.", "A decoded image ignores orientation metadata and appears rotated."],
    v: "Import and export a corpus of images across formats, depths and profiles with alpha. Confirm pixel values after round trip are within the codec's tolerance, orientation is correct, and profiles are retained when selected.",
    dep: ["image-codecs-and-metadata", "color-profile-handling", "tiled-image-store"]
  },
  "vector-import-export": {
    s: "Mapping vector formats to and from the document model: paths, groups, gradients, text, clip paths and masks, deciding what becomes native and what is flattened.",
    d: "Importers parse the foreign structure and translate each element into nodes, converting transforms, styles, units and fills. Features without equivalents (filters, scripting, special blend modes) are approximated or rasterized. Exporters traverse the tree, emit paths and styles, convert effects and decide on text as live text or outlines. Round-trip tests catch drift. It is hard because formats have differing semantics for strokes, gradient spaces and text, and because messy real-world files contain constructs that the specification allows but few tools handle.",
    k: ["Exporting text as live text vs as outlines: live text stays editable but depends on fonts; outlines look identical everywhere but cannot be edited.", "Rasterizing unsupported effects vs dropping them: rasterizing keeps appearance but loses scalability, dropping keeps vectors but changes the look."],
    p: ["Gradient coordinates are interpreted in the wrong units and import looks skewed.", "An unsupported filter is silently dropped, and the exported icon loses its shadow."],
    v: "Import a corpus of real-world vector files and export them again. Confirm renders of the original and the round trip agree within a small pixel difference, and unsupported features are listed in an import report.",
    dep: ["path-model", "paint-model", "effects-model", "rich-text-model"]
  },
  "print-and-pdf-export": {
    s: "Producing print-ready documents: multi-page PDF with fonts, vectors, images at set resolutions, bleed, crop marks, color intents and compliance profiles.",
    d: "The exporter writes pages as vector content with embedded font subsets, images at chosen resolution and compression, transparency flattened or preserved per target, and optional bleed and marks. Color goes out as RGB, CMYK or spot per settings with an output intent. Compliance variants for archiving and print restrict features. A preflight check lists problems such as low-resolution images, missing fonts and ink coverage. It is hard because targets differ in transparency and color support, and because fonts and licensing limit embedding.",
    k: ["Preserving transparency vs flattening it for older workflows: preserving keeps vectors sharp, flattening is accepted everywhere but rasterizes parts of the page.", "Subsetting fonts vs embedding whole fonts: subsetting is small and license friendly, whole fonts allow later editing."],
    p: ["Transparent effects are flattened at low resolution and print soft.", "A font that forbids embedding is substituted by the exporter without a warning."],
    v: "Export a multi-page layout with bleed, transparency, spot colors and mixed fonts, and run preflight and a viewer's inspection. Confirm fonts are embedded as permitted, image resolution meets the target and the page boxes are correct.",
    dep: ["vector-import-export", "print-color-separations", "font-management", "layer-compositing"]
  },
  "clipboard-interop": {
    s: "Copying and pasting content within the editor and with other applications: native node trees, vector, image and text formats, with id remapping and style handling.",
    d: "Copy writes several representations to the system clipboard: a private format holding the node subtree, a vector format, a flat image and plain text. Paste picks the richest representation the editor understands. Pasting within a file creates new ids and rewrites internal references, and handling of linked components and styles depends on whether the source is the same library. Paste of images creates image fills or nodes. It is hard because clipboard access is permissioned and asynchronous in browsers, and because untrusted pasted content must be sanitized.",
    k: ["A private rich format vs standard formats only: private keeps everything including components, but works only between instances of the editor.", "Pasting with source styles vs matching destination styles: source styles preserve appearance, destination styles preserve consistency."],
    p: ["Pasted markup from another application is not sanitized and brings in scripts or oversized data.", "A component pasted into another file is detached silently and later library updates do not reach it."],
    v: "Copy a component instance with overrides to another file, to a text editor and to an image editor. Confirm the target file keeps the link and overrides, the text editor receives plain text, and the image editor receives a correct bitmap.",
    dep: ["node-identity-and-references", "vector-import-export", "raster-import-export"]
  },
  "export-presets-and-slices": {
    s: "Marking nodes or regions for export with sizes, scales, formats and suffixes, producing consistent asset sets for many densities and targets.",
    d: "Each node or slice stores a list of export settings: scale factor or fixed size, format, quality and a naming suffix. A batch export renders each setting, optionally on the server so it can be automated by the API. Settings can include color profile, background and trimming. Exports reuse the canvas renderer's output where fidelity requires and a separate path for formats the screen path cannot produce. It is hard because large batches are slow and memory heavy, and because names and sizes must remain stable for code that consumes them.",
    k: ["Rendering exports on the client vs on a server: the client has the file open, a server allows automation but needs a renderer that matches.", "Export settings stored on nodes vs in an external manifest: stored settings travel with the design, a manifest keeps design files clean."],
    p: ["Exports at fractional scales produce blurry edges because the size was not rounded to whole pixels.", "A renamed layer changes the exported file name and breaks the code referencing it."],
    v: "Mark ten nodes with three scales and two formats each, run the export and compare with the canvas. Confirm 60 files with stable names, correct pixel sizes, and rendering identical to the canvas at each scale.",
    dep: ["canvas-renderer", "raster-import-export", "vector-import-export", "rest-api-and-webhooks"]
  },
  "image-codecs-and-metadata": {
    s: "The encoders and decoders for image formats, plus reading and writing embedded metadata: color profile, orientation, resolution, camera data and copyright information.",
    d: "Codecs decode compressed files into pixel buffers and encode buffers back with quality, chroma subsampling and bit depth options. Many are run in a worker or compiled to portable code so they behave identically on every platform. Metadata blocks are parsed, kept with the image for round trips and optionally stripped on export for privacy or size. Animated and multi-page formats add frame handling. It is hard because decoders handle untrusted input, so they are a security risk, and because metadata conventions vary across formats.",
    k: ["Bundled codecs vs platform decoders: bundled gives identical output and control, but increases size and needs security updates.", "Preserving all metadata vs stripping by default: preserving keeps provenance and credits, stripping protects location and personal data."],
    p: ["A malformed file triggers a decoder bug and crashes or exploits the editor.", "Export keeps location metadata from a photo and publishes the maker's home address."],
    v: "Decode a fuzzed corpus of malformed images in a sandboxed worker, then export photos with the strip option. Confirm no crashes or memory errors, bad files fail cleanly, and exported files contain no location data.",
    dep: ["threading-and-workers", "color-profile-handling"]
  },
  "performance-budgets": {
    s: "Explicit limits on what each interaction may cost: frame time, input-to-pixel latency, open time, memory, sync latency and file size, enforced through measurement on real large documents.",
    d: "Budgets turn performance into requirements: for example 16 ms per frame while panning a document of 100,000 nodes, pen-to-pixel latency under 30 ms, first paint within two seconds of opening, memory under a set size, and operation round trip under 100 ms. Each budget is allocated across subsystems and checked by automated benchmarks on a corpus of real large files, and by telemetry from users. Regressions fail builds. Large files, not typical ones, set the limits. It is hard because budgets compete and large user files are rarely available to test.",
    k: ["Budgets on a representative large-file corpus vs on synthetic files: real files catch real bottlenecks, but must be collected with permission and kept current.", "Hard CI failures on regression vs trend monitoring: hard failures stop regressions early, but are noisy on shared hardware."],
    p: ["Benchmarks use small files and miss a quadratic algorithm that shows up at 100,000 nodes.", "A budget is met on a developer's workstation and missed on the low-end laptops users actually have."],
    v: "Run the benchmark suite on the large-file corpus on reference low-end hardware. Confirm each interaction meets its budget at the 95th percentile, and a deliberately slowed commit makes the suite fail.",
    dep: []
  },
  "threading-and-workers": {
    s: "Which thread or worker owns which work and data: interface, document model, rendering, decoding, layout, sync and plugins, and how they exchange messages.",
    d: "The main thread handles input and the interface. Heavy work, such as image decoding, filter processing, tile rendering, path booleans and serialization, goes to workers. Data crosses by message passing or shared memory with ownership rules; the document model has one owner thread, with immutable snapshots passed to others. Sync runs on its own thread or event loop so network jitter does not affect painting. Plugins run in isolated contexts. It is hard because shared mutable state causes races and copying large buffers costs more than the work saved.",
    k: ["Shared memory between workers vs message copying: shared memory is fast for pixel data, but needs locks and careful ownership.", "One authoritative model thread vs a model replicated in workers: one thread is simple and consistent, replication scales but doubles memory and sync logic."],
    p: ["A worker reads the model while it changes and renders a half-applied edit.", "Transferring large buffers by copying doubles memory use and stalls the main thread."],
    v: "Run a stress test of simultaneous painting, filtering, sync and a plugin on a large document under a thread sanitizer. Confirm no data races, main-thread tasks stay under the frame budget, and results match a single-threaded run.",
    dep: []
  },
  "numeric-precision": {
    s: "How numbers behave at the extremes: coordinates at huge canvases and deep zoom, accumulating transforms, curve math near degenerate cases, and color values across bit depths.",
    d: "Single-precision floats have about seven digits, so a coordinate at one million units has a resolution of a fraction of a unit, and deep zoom shows jitter. Strategies include double precision for the model, floating origins in rendering, local coordinate spaces, and tolerances scaled to magnitude. Transform products accumulate error and are recomputed from sources when exactness matters. Geometry uses robust predicates. Decisions must be made consistently by client, server and exports. It is hard because the same value is processed by many codes with different precision.",
    k: ["Double precision everywhere vs single precision on the GPU only: double avoids most issues, but GPUs use single, so a conversion step with a local origin is required.", "Fixed tolerances vs relative tolerances: fixed are simple but wrong at extremes; relative adapt but complicate comparisons."],
    p: ["Shapes placed far from the origin jitter when zoomed in because the GPU receives large absolute coordinates.", "Geometry compares floats with exact equality and booleans fail on shapes that should touch."],
    v: "Place shapes at coordinates near the limit, zoom to the maximum and run booleans on touching edges. Confirm no jitter, results agree between client and server computations, and tolerance-based tests pass at all scales.",
    dep: []
  },
  "identity-and-ids": {
    s: "How every object gets a stable, collision-free identity that survives copying, merging, branching, offline creation and export, so references never point at the wrong thing.",
    d: "Ids are created locally without coordination, from a client identifier and a counter or a random value with enough bits. They are never reused for different objects. Rules define when identity is preserved (moves, undo of delete, branch merges) and when it is replaced (paste, duplicate). References of all kinds resolve through ids, with defined behavior for missing targets. External systems, such as comments and handoff links, store ids too. It is hard because identity must be globally unique across clients that never talk to each other, and because duplication must remap every kind of reference.",
    k: ["Random identifiers vs counters per client: random need no coordination but are long, counters are short but need unique client ids and durable counter storage.", "Preserving ids across file copies vs regenerating: preserving helps merging, regenerating avoids collisions between independent copies."],
    p: ["Duplicating a file preserves ids and a later merge of the two files mixes unrelated nodes.", "A counter is reset by clearing local storage and new ids collide with old ones."],
    v: "Create nodes offline on three clients, duplicate a file and merge branches. Confirm there are no id collisions, every reference still resolves to the intended node, and duplicates have no shared ids.",
    dep: []
  },
  "offline-first-consistency": {
    s: "The decision to let clients keep a full working copy and sync later, which sets how conflicts are defined, what the server must verify and what users are told.",
    d: "An offline-first design treats the local copy as primary: edits apply immediately, queue durably and merge later. This forces operations to be small, commutative where possible and independent of server round trips, and it forces the schema, ids and merge rules to work on stale state. The server verifies and orders but does not decide intent. Users need visible sync state and clear conflict outcomes. It is hard because every feature must be designed for merging after long divergence, and because the cost of getting it wrong appears only when someone has been offline for days.",
    k: ["Server-ordered merge with a client queue vs a fully peer-to-peer CRDT: server ordering is simpler to secure and debug, while peer-to-peer works with no server at the cost of metadata growth.", "Preserving all offline edits vs dropping conflicting ones: preserving avoids loss but yields odd mixes; dropping is predictable but loses work."],
    p: ["A new feature is built assuming an online server round trip and cannot be merged after offline use.", "Users cannot tell whether edits are saved and close the tab with unsynced work."],
    v: "Edit two copies for a day offline with structural changes and reconcile. Confirm both converge, every dropped change is reported, a sync indicator reflects the pending state accurately, and closing the tab warns when queued edits remain.",
    dep: []
  },
  "backward-compatibility": {
    s: "The commitment that old files keep opening and rendering the same, and that new files degrade safely in old clients, over years of releases and many client versions open at once.",
    d: "Compatibility covers the file format, the sync protocol, the plugin API, export outputs and rendering behavior. Techniques include explicit versions, additive schema changes, preserved unknown fields, migrations, long deprecation periods and a corpus of historical files rendered and compared on every release. Protocol upgrades roll out so that old clients in open tabs continue to work or are asked to reload. It is hard because users hold files for years, because bug fixes change rendering of existing designs, and because every promise limits future changes.",
    k: ["Fixing rendering bugs for everyone vs keeping old behavior for old files: fixing improves quality, preserving avoids changing approved designs.", "Forcing client upgrades vs supporting old versions: forcing keeps the code simple, supporting is friendlier but multiplies test combinations."],
    p: ["A rendering fix shifts text by half a pixel in files that were signed off by a client.", "A protocol change is deployed while old tabs remain open, and they send operations the server misreads."],
    v: "Render a corpus of historical files with the new build and compare with stored references, and connect old client versions to the new server. Confirm differences are listed and approved, and old clients either work or reload.",
    dep: []
  },
});
