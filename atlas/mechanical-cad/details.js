// Details for the mechanical CAD plate, part 1: modeling workspace, data management and collaboration.
ATLAS.details("mechanical-cad", {
  "viewport-navigation": {
    s: "The interactive 3D view where the model is inspected: orbit, pan, zoom, standard views, perspective or parallel projection, and the manipulators that move things directly.",
    d: "The viewport maps pointer and touch input to a camera and draws the display scene each frame. It must keep a stable pivot while orbiting, which means choosing a center of rotation from the cursor's depth sample or the model's bounds. Manipulators, such as triads and drag handles, send their results to the active command rather than editing geometry themselves. The hard part is staying interactive: camera motion must never wait for a model rebuild, so display and modeling run on separate threads or at least separate priorities.",
    k: ["Cursor-depth pivot versus model-center pivot: the first feels natural near detail but jumps when the cursor is over empty space; the second is predictable but awkward on large assemblies.", "Camera input handled on the render thread versus the UI thread: render-thread handling stays smooth during rebuilds, but needs careful state sharing with commands."],
    p: ["Orbiting around a distant or empty pivot flings the part off screen and disorients users.", "Extreme zoom ranges break depth precision, so near geometry flickers or clips away."],
    v: "Load a large assembly, start a rebuild of one part, and orbit continuously. The view should keep updating at interactive frame rates throughout the rebuild with no visible stall.",
    dep: ["display-scene-graph","gpu-renderer"]
  },
  "selection-and-filters": {
    s: "Turns a click or drag into a set of model entities such as faces, edges, bodies or components, restricted by filters that say which kinds are allowed.",
    d: "Selection starts from the picking layer, which returns display primitives under the cursor. This component translates those into model entities, applies the active filter (only edges, only faces, only components), resolves ambiguity with cycling or preselection highlight, and expands the pick through rules such as tangent chains or loops. Selected entities are held as persistent references, not raw pointers, so a selection survives a rebuild. The difficulty is intent: a user clicking in a dense region wants one particular thing, and the system must offer a way to reach occluded or coincident entities.",
    k: ["Selecting through persistent references versus direct pointers: references survive rebuilds and undo, at the cost of a lookup on every use.", "Smart expansion rules (tangent chain, loop) versus manual picking: expansion saves many clicks but sometimes selects more than intended and hides the choice."],
    p: ["A selection set that holds stale entity pointers crashes or silently selects nothing after a rebuild.", "Filters that remain active from an earlier command make clicks appear to do nothing."],
    v: "Select a chain of tangent edges with one click, edit a dimension that triggers a rebuild, and confirm the same edges are still selected and highlighted afterward.",
    dep: ["picking","persistent-naming"]
  },
  "command-framework": {
    s: "The infrastructure that defines how a tool runs: parameter input, live preview, commit or cancel, and the rules that keep commands from corrupting the model.",
    d: "Each command is a small state machine with inputs (selections, numbers), a preview that runs on a scratch copy or temporary feature, and a commit that writes into the document through a transaction. The framework owns the toolbar and keyboard mapping, enables and disables commands according to context, and routes input to whichever command is active. Preview is the costly part: running a full feature on every mouse move requires a fast incremental path, and a command that fails midway must leave nothing behind.",
    k: ["Preview as a real temporary feature versus a lightweight approximation: the real feature is exact but slow; the approximation is fast but can disagree with the committed result.", "Modal commands versus stackable commands: modal is simpler to reason about, while stackable lets users interrupt one tool to use another at the cost of nested state."],
    p: ["A cancelled command that leaves a half-built temporary feature in the model pollutes the history.", "Commands that run on the UI thread freeze the whole application during a long preview."],
    v: "Start a fillet, change its radius three times in the preview, cancel, and confirm the feature tree and the document-modified flag are exactly as before the command began.",
    dep: ["undo-redo","regeneration-engine","selection-and-filters"]
  },
  "property-editors": {
    s: "Panels and inline fields for reading and changing dimensions, feature parameters, material and appearance, with validation and unit-aware entry.",
    d: "Editors bind to parameters in the document model. Typed entries are parsed with units and expressions (a length can be entered as 2in or as a reference to another parameter), validated against limits, and then submitted as an edit that triggers a rebuild. Many editors show values from a previous rebuild while the new one is pending. The hard cases are expression errors, circular references between parameters, and showing whether a value is driven by an equation or by direct input.",
    k: ["Immediate rebuild on each keystroke versus rebuild on confirm: immediate gives feedback but can stall on heavy models; confirm is cheap but hides invalid values until the end.", "Showing driven values read-only versus editable: read-only prevents conflicts, but editable lets users break the link on purpose and then forget they did."],
    p: ["A unit mismatch, such as typing inches into a millimeter field, produces parts off by a factor of 25.4 with no warning.", "Silently overwriting an equation with a typed number removes design intent that others rely on."],
    v: "Type an expression referencing another dimension, confirm the part rebuilds, then change the referenced dimension and verify the first updates. Type a circular reference and confirm it is rejected with a clear message.",
    dep: ["parameters-equations","unit-system","document-model"]
  },
  "undo-redo": {
    s: "Reverses and reapplies user edits as atomic groups, restoring the model, selection and sometimes view state to what they were before.",
    d: "Two broad approaches exist. Command-based undo records an inverse operation for each change; snapshot-based undo records changes to document state, often by diffing the feature history and parameters, then regenerates geometry. Edits are grouped into transactions so one user action is one step. Because geometry is derived, most systems undo the recipe (features, parameters) and rebuild rather than restoring bodies. The challenge is memory on large documents and coordinating undo with external effects such as saved files or vault operations, which cannot be undone.",
    k: ["Undoing the feature recipe and rebuilding versus restoring stored geometry: recipe undo is compact but costs a rebuild per step; stored geometry is instant but uses a lot of memory.", "Per-document undo stacks versus a global stack: per-document avoids cross-file surprises, but edits that touch several documents become awkward to reverse together."],
    p: ["An undo step that does not include a selection or in-context reference change leaves assemblies pointing at the wrong parts.", "Unbounded undo history on a large assembly consumes memory until the application is killed."],
    v: "Make ten edits across a part, undo all ten, and compare the saved file's feature list and parameter values byte-for-byte against the original. Redo all ten and confirm geometry matches the pre-undo state.",
    dep: ["document-model","regeneration-engine"]
  },
  "automation-api": {
    s: "A programmatic interface to the model and application, used for macros, batch jobs and custom tools that create parts, change parameters or export data without the interface.",
    d: "The API exposes documents, features, sketches, parameters, assemblies and application commands as objects, usually with a stable versioned contract and a record-and-replay mode that turns interactive actions into script. It can run inside the application, driving the UI, or headless against the document and kernel. Headless runs are valuable for mass updates and automated checks. The challenge is surface area: every internal change risks breaking customer scripts, so the API often wraps internals through a compatibility layer instead of exposing them.",
    k: ["Stable versioned object model versus direct internal access: stability protects customer scripts, but it freezes names and behaviors that the product team would like to change.", "In-process automation versus an out-of-process service: in-process is fast but a bad script can crash the application; out-of-process isolates faults at a cost per call."],
    p: ["Scripts that assume a face index or feature name break when the history is edited, because those are not stable identifiers.", "Headless batch jobs with no license checkout or no display context fail in ways that are hard to reproduce interactively."],
    v: "Run a script headless against a hundred stored parts that sets one parameter and exports a file; confirm each file's geometry reflects the change, and that the same script gives identical output on a second run.",
    dep: ["document-model","regeneration-engine"]
  },
  "vault-checkout": {
    s: "A managed repository for design files with exclusive check-out, check-in versioning and metadata, so that two people do not silently overwrite each other's work.",
    d: "Files are stored on a server with a database of metadata, version history and references between files. A user checks a file out to a local cache, which locks it for editing on the server, edits it, and checks it in as a new version. Assemblies carry references, so check-in must include or reconcile dependent files. The system must also serve the right version of every referenced part when opening an assembly. It is difficult because CAD files are large binary documents with deep reference networks, and ordinary text merging does not work.",
    k: ["Exclusive lock-based editing versus merge-based editing: locks prevent conflicts but block parallel work and leave stale locks; merging allows parallelism but needs design-level merge logic.", "Storing whole file versions versus deltas: whole files are simple and fast to open, while deltas save space but make retrieval slower and more fragile."],
    p: ["A user who goes on vacation with files checked out blocks everyone until an administrator breaks the lock.", "Checking in a part without its modified parent assembly leaves references pointing at an older version."],
    v: "Check out a part on one machine and try to edit it on another: the second must be refused or read-only. Check in, then open the parent assembly elsewhere and confirm it loads the new version.",
    dep: ["native-file-format","revision-control"]
  },
  "revision-control": {
    s: "Assigns revision labels and lifecycle states, such as in work, in review and released, to files and assemblies and enforces what may change in each state.",
    d: "Each item has a revision scheme (letters, numbers, or both) and a state machine with permitted transitions, approvers and rules. Released revisions are immutable. A new revision is created by a change process. State rules propagate: an assembly can only be released when its components are, and parts used in released assemblies cannot be obsoleted without a change. The challenge is aligning versions (every save) with revisions (a meaningful, approved baseline) and keeping both consistent through references.",
    k: ["Separate version and revision numbering versus one number: separation distinguishes every save from an approved baseline, but users confuse the two; a single scheme is simpler but conflates draft and released history.", "Released state frozen by policy versus by technical lock: policy is flexible but relies on discipline; technical lock is strong but can block urgent fixes."],
    p: ["Releasing an assembly while a child part is still in work ships a design that nobody approved as a whole.", "Reusing a released part number for a changed part makes old drawings and purchase orders ambiguous."],
    v: "Release a part, attempt to modify it, and confirm the system refuses. Create a new revision, change it, and confirm the old revision and the assemblies that reference it remain unchanged.",
    dep: ["vault-checkout","native-file-format"]
  },
  "branching-merging": {
    s: "Lets designers work on alternate versions of a design in parallel and later combine them, with tools to compare geometry, parameters and structure.",
    d: "A branch is a copy of the design state, either of whole files or of a feature history. Merging compares two branches against a common ancestor at the level of features, parameters and assembly structure, rather than text lines. Where both changed the same feature, the system raises a conflict for the user. Geometry comparison shows what changed visually. Merging is hard because features depend on earlier ones, so a merge can produce a history that rebuilds but yields nonsense, or fails altogether.",
    k: ["Feature-level merge versus geometry-level compare only: feature-level can combine edits automatically but is fragile with dependencies; geometry compare is safe but leaves the user to redo the work.", "Cheap full-copy branches versus shared-storage branches: copies are simple and isolated but multiply storage; sharing is compact but needs reference counting and garbage collection."],
    p: ["Two branches each add a fillet to the same edge under different names, and the merge produces a history that fails on rebuild.", "Merging a branch into a stale base silently reverts edits made on the main line."],
    v: "Branch a part, change a hole diameter on one branch and add a rib on the other, merge both, and confirm the result has both changes, rebuilds without errors, and matches a hand-built reference for volume.",
    dep: ["feature-tree","dependency-graph","revision-control"]
  },
  "change-management": {
    s: "Tracks proposed, approved and implemented changes as change requests and orders that group affected items, route approvals and record why.",
    d: "A change request lists affected items and the proposed edits, goes through impact analysis, review and approval, and on approval creates new revisions of every affected item together. Impact analysis uses the reference network to find where a part is used, which assemblies, drawings and downstream records will be touched. The record becomes the audit trail for who changed what and why. The challenge is completeness: missing a where-used relationship means a changed part ships in a product nobody reviewed.",
    k: ["Requiring change orders for all released edits versus allowing minor in-place fixes: strict is auditable but slow; lenient is quick but weakens traceability.", "Automated impact lists versus engineer-curated lists: automated finds every reference but includes noise; curated is focused but misses indirect uses."],
    p: ["A change approved against a stale view of where-used skips an assembly that has since started using the part.", "Approvals routed to a person who has left stall the change with no visible owner."],
    v: "Open a change order on a widely used part and confirm the where-used list matches the references actually found by scanning all assemblies. Approve it and confirm every affected item gains a new revision in one step.",
    dep: ["revision-control","bom-management","vault-checkout"]
  },
  "bom-management": {
    s: "Maintains the bill of materials as structured data: parts, quantities, sources and attributes, derived from the assembly and extended with items that have no geometry.",
    d: "A bill of materials can be generated from the assembly structure (an engineering BOM) and then extended, for example with fasteners, adhesives, packaging and purchased items that are not modeled. Quantities are summed by part number across instances, with rules for variants and options. The BOM is a managed document with its own revision and flows to purchasing and manufacturing systems. The challenge is that the geometric structure and the manufacturing structure differ: the order parts are modeled rarely matches the order they are assembled.",
    k: ["BOM derived live from the model versus a managed separate record: live is always consistent but cannot hold unmodeled items; separate carries everything but can drift from the geometry.", "Flat BOM versus indented BOM: flat is simple for purchasing, while indented preserves the subassembly structure needed for building."],
    p: ["Two instances of parts with different part numbers but the same geometry are counted separately, or the reverse, inflating or hiding cost.", "Edits to a variant do not flow to the BOM, so purchasing orders last year's configuration."],
    v: "Build an assembly with a repeated bolt used twelve times in two subassemblies, generate the BOM, and confirm the quantity is twelve in the flat view and correctly split in the indented view.",
    dep: ["assembly-structure","configurations","revision-control"]
  },
  "concurrent-editing": {
    s: "Allows several people to work on one design at the same time, by dividing it into regions of ownership or by merging live edits.",
    d: "Two models exist. Region-based systems split an assembly so each person edits different parts at once with exclusive ownership of each, and see others' released changes when they refresh. Real-time systems apply each edit as an operation to a shared feature history or document, ordered by a server, and push it to all clients. Both depend on dividing the design into units with clear dependencies. The difficulty is that one edit early in a history can invalidate everything after it, including features a colleague is editing.",
    k: ["Ownership of whole parts versus shared editing of one history: ownership is predictable but needs careful design splitting; shared editing is flexible but hits conflicts in a single dependency chain.", "Pushing every edit live versus publishing on request: live keeps everyone current but can break a person's work mid-thought; on request lets people work stably but delays integration."],
    p: ["Two users edit parameters in the same part and the server's ordering silently makes one change override the other.", "A collaborator's change to an upstream part causes your in-progress feature to fail, with no indication of who caused it."],
    v: "Have two users edit different parts of the same assembly at the same time, then both refresh. Each should see the other's change, the assembly should rebuild, and neither's work should be lost.",
    dep: ["cloud-sync","document-model","dependency-graph"]
  },
  "review-markup": {
    s: "Lets reviewers view lightweight models and drawings, measure, comment and mark up without a full CAD license, and ties comments to specific geometry.",
    d: "A viewer loads a lightweight representation, often the display mesh plus structure and metadata, and offers sections, measurements and comment placement. Comments attach to a view, an entity or a point, and carry author, time and status. Because the underlying design changes, comments must survive revisions or be clearly marked as belonging to an older one. Markup flows back to designers as a worklist. The difficulty is anchoring: a comment on a face of one revision may not map to any face in the next.",
    k: ["Comments tied to model entities versus to screen views: entity anchors follow the design but break when entities change; view anchors always display but may point at nothing meaningful later.", "Browser-based viewing versus a desktop viewer: browser reaches everyone with no install, but is limited by download size and drawing speed on big models."],
    p: ["Reviewers comment on an out-of-date revision and the author works from comments that no longer apply.", "A viewer that shows a lightweight mesh hides small features, so reviewers approve something they never saw."],
    v: "Attach a comment to a hole in revision A, release revision B with the hole moved, and confirm the comment is marked as belonging to revision A or follows the hole, never silently floating in space.",
    dep: ["lightweight-view-formats","persistent-naming","revision-control"]
  },
  "cloud-sync": {
    s: "Stores documents on remote servers and keeps local caches in step, enabling access from many places and offline work with later reconciliation.",
    d: "Documents or their parts are uploaded to remote storage with metadata. Clients cache locally and exchange only changed blocks or files. Sync detects conflicts through version stamps; where both sides changed, it asks the user or creates a branch. Reference resolution has to work across the cache and server so opening an assembly pulls what is missing. The challenge is size and latency: a single assembly can be gigabytes spread over thousands of files, and sync must not make opening slower than local disk.",
    k: ["Syncing whole files versus changed blocks: whole files are simple but waste bandwidth on large documents; blocks are efficient but need a file format that changes locally.", "Always-online with server as truth versus offline-first with later merge: online is simpler and consistent but unusable in the field; offline-first needs conflict handling."],
    p: ["A flaky connection uploads half of a multi-file assembly, leaving the server with references to files that never arrived.", "Two offline edits to the same part produce a conflict the user cannot resolve because the file is a binary."],
    v: "Edit a part offline, reconnect, and confirm only changed data is uploaded and the server version matches. Edit the same part on two machines and confirm the conflict is reported rather than overwritten.",
    dep: ["vault-checkout","native-file-format","background-streaming"]
  },
});
