// Details for the graphics editor plate, part 1: files, review, handoff, libraries, extensibility.
ATLAS.details("graphics-editor", {
  "file-browser-and-projects": {
    s: "The organizing layer above documents: teams, projects, folders, search and recent files, with each document's metadata, thumbnail and access state shown without opening it.",
    d: "A metadata service stores one record per document: owner, project, title, last editor, thumbnail reference, library links and permissions. The browser lists and searches these records and opens a document by requesting a sync session for its id. Thumbnails are produced by a renderer on the server or by the last client to save. Moving a file between projects changes who can see it, so the move must update permissions and library subscriptions atomically. It is hard because listings must stay fast with tens of thousands of files while permissions are checked per row.",
    k: ["Server-rendered thumbnails vs client-uploaded ones: server rendering is consistent and always current, but costs compute and a full renderer in the backend.", "Folder-inherited permissions vs per-file permissions: inheritance is easy to manage, but makes a single file's real access hard to explain."],
    p: ["Search indexes lag behind renames and moves, so people open stale copies believing they are current.", "Thumbnails refresh only on save, so a file that is edited live shows an outdated preview for hours."],
    v: "Rename a document, move it to another project and edit it live. Confirm the listing, search results and thumbnail all reflect the new name, location and content within seconds, for a user with access only to the new project.",
    dep: ["permissions-and-sharing", "file-format"]
  },
  "permissions-and-sharing": {
    s: "Roles and links that decide who can view, comment, edit or manage a document, evaluated on every request and every live operation.",
    d: "Access is granted to users, teams, projects and link tokens, with roles such as viewer, commenter, editor and owner. The metadata service resolves effective access and issues short-lived session tokens that the multiplayer server rechecks. Revocation must cut off an open session, not only future opens. Link sharing adds password and expiry options and optional view-only copies of libraries. It is hard because access is inherited through several levels, because plugins and API tokens act on a person's behalf, and because a revoked editor may hold unsynced offline changes.",
    k: ["Capability tokens in links vs identity-bound grants: tokens are easy to share but cannot be audited per person.", "Checking access on open only vs on every operation: open-only is cheap but leaves revoked users editing until they reconnect."],
    p: ["A user removed from a team keeps access through a still-valid link, because link and identity grants are managed separately.", "Revocation closes the metadata session but not the live socket, so the person keeps editing."],
    v: "Open a document as an editor in one session, remove that person's access from another, and confirm the editor's next operation is rejected and the connection closed within the documented revocation window.",
    dep: ["realtime-access-control"]
  },
  "comments-and-review": {
    s: "Threads of comments pinned to canvas positions or nodes, with mentions, resolution state and notifications, so reviewers can respond without editing the design.",
    d: "A comment anchors to a node id plus an offset in that node's coordinate space, so it follows the node when it moves. Threads, replies, reactions and resolved flags live in a separate store from the document, and arrive over the same live channel as presence. Mentions drive notification emails and in-app inboxes. It is hard because anchors must survive structural edits: a deleted node orphans its comments, and a node copied to another file must not carry foreign threads. Comments also need their own permission rules, since commenters cannot edit.",
    k: ["Anchoring to a node id vs to absolute canvas coordinates: node anchors follow the design, but orphan when a node is deleted or replaced.", "Comments inside the document vs in a side store: a side store keeps files small and permissions simple, but export and branch operations must carry comments explicitly."],
    p: ["Comments anchored to a frame that is later swapped for a new one vanish from view while still counting as unresolved.", "Mentions notify people who lack access to the file, leaking titles in email."],
    v: "Pin a comment to a button, move the button and resize its parent. Confirm the comment marker follows the button at every zoom level, and that deleting the button moves the thread to an orphaned list.",
    dep: ["node-identity-and-references", "presence-and-cursors", "permissions-and-sharing"]
  },
  "version-history": {
    s: "A timeline of saved states of a document, automatic and named, that people can browse, compare, restore or copy from without losing newer work.",
    d: "The server stores periodic snapshots and optionally the operation log between them. Autosaved versions are created after idle periods or by size of change; named versions are created on request with a title. Viewing a version loads that snapshot read-only in a separate session. Restoring writes the old state forward as a new change, not as a rewind, so the live history remains linear and collaborators converge on it. It is hard because retention costs storage, because large files make many snapshots expensive, and because restoring must reconcile library links and ids that have since changed.",
    k: ["Full snapshots vs operation logs between checkpoints: snapshots restore quickly but cost storage; logs are compact but require replay and a stable operation format.", "Restore as a rewind vs as a forward change: forward keeps everyone's sessions valid but leaves an extra entry in history."],
    p: ["Aggressive retention pruning deletes the one version someone needed after an accidental mass delete.", "A restore silently breaks links to a library component that was since deleted."],
    v: "Make an edit, wait for an autosave version, delete half the frames and restore the earlier version while a second user is connected. Confirm both clients show the restored content and the deletion remains in history.",
    dep: ["server-snapshots-and-compaction", "snapshot-checkpoints", "file-format"]
  },
  "branching-and-merging": {
    s: "Parallel copies of a design that diverge, are reviewed as a difference and merge back, bringing version-control workflow to a visual document.",
    d: "A branch is a fork of the document at a base version with its own operation stream. Merging compares the branch and main against the common base, node by node and property by property, applying non-conflicting changes and asking a person to choose where both edited the same property. A visual diff overlays added, removed and changed nodes. It is hard because the model is a tree with moves and reparenting, not lines of text: a node edited on one side and moved on the other must merge correctly, and conflicts must be explained visually.",
    k: ["Property-level three-way merge vs whole-node merge: property level loses less work, but more conflicts are subtle and hard to display.", "Branching with copied ids vs fresh ids: copied ids make merge trivial, but two branches must never be merged back into unrelated documents."],
    p: ["A node moved in one branch and deleted in the other produces an orphan nobody notices until export.", "Merging resets component overrides because instance references changed during the branch."],
    v: "Branch a file, change a color on one side and move the same shape on the other, then merge. Confirm both changes appear and that a conflicting color edit on both sides prompts a choice.",
    dep: ["merge-semantics", "node-identity-and-references", "version-history", "property-model"]
  },
  "prototyping-and-interactions": {
    s: "Links between frames with triggers, transitions and conditions, plus a player that runs the flow, so a static design can be clicked through like an app.",
    d: "Each interactive node stores triggers (click, hover, key, timer), actions (navigate, open overlay, set variable, scroll) and a transition with easing and duration. A player loads the frame graph and animates between states by interpolating matching nodes, often by name or id. Variables and conditions add logic. The player must reproduce the editor's rendering exactly, on devices from phones to browsers. It is hard because transitions must match layers between frames, scrolling and fixed elements need layout rules, and animation timing must stay smooth while frames load lazily.",
    k: ["Smart matching of layers between frames vs explicit pairing: matching needs little setup, but misfires when layers are renamed or duplicated.", "Running the full renderer in the player vs a simplified one: the full renderer is faithful but heavy on low-end phones."],
    p: ["Renaming a layer breaks the automatic animation between two frames without any warning.", "Overlay and scroll behaviors differ between the editor preview and the mobile player."],
    v: "Build a three-frame flow with a hover trigger and a dissolve transition. Run it in the player on a phone and in the desktop preview and confirm both reach the same frames with matching timing.",
    dep: ["scene-graph", "auto-layout", "canvas-renderer", "variables-and-design-tokens"]
  },
  "developer-handoff": {
    s: "A read-only inspection view that exposes measurements, styles, tokens, assets and generated code snippets for each node, so developers can build what the design shows.",
    d: "The inspection view resolves each node's computed values: position relative to a chosen parent, size, spacing from siblings, effective colors, type settings and the variable or style each came from. Code generators translate these into declarative styling snippets for target platforms. Assets are marked exportable with presets and downloadable. Status markers show what is ready to build. It is hard because designers draw with absolute positions while developers need relationships: spacing and constraints must be recovered, and generated code should use tokens rather than copied raw values.",
    k: ["Generated code from computed values vs from the intent (auto layout, tokens): intent produces maintainable code but only when designers modeled the intent.", "Inspection built into the editor vs a separate viewer: separate is simpler to permission, but duplicates rendering and measurement logic."],
    p: ["Generated snippets output hard-coded hex values even when a token was applied, defeating the design system.", "Measurements are shown to fractional pixels from an unrounded layout, which developers cannot reproduce."],
    v: "Inspect a button built with auto layout and a color variable. Confirm the panel shows padding, gap, corner radius and the variable name, and that the generated styling uses the token rather than a raw color.",
    dep: ["property-model", "variables-and-design-tokens", "auto-layout", "export-presets-and-slices"]
  },
  "asset-libraries": {
    s: "Published sets of components, styles and variables that other files subscribe to, with versioned updates that teams review before applying.",
    d: "A library is a document whose components, styles and variables are published as a versioned set. Consuming files hold references by stable key, not copies, and resolve them through a library cache. When a new version is published, subscribers see a pending update and choose when to accept; accepting rewrites instance references and re-resolves overrides. Search and tagging help people find assets. It is hard because renames, deletions and splits of components must keep thousands of existing instances working, and because libraries can depend on other libraries.",
    k: ["Stable keys vs name-based lookup: stable keys survive renames, but need migration if a component is recreated.", "Automatic updates vs opt-in updates: automatic keeps files consistent, but silently changes designs under review."],
    p: ["Deleting and recreating a component to fix it gives it a new key and detaches every instance.", "A library publishes while a subscriber is offline, and the offline edits are merged against changed overrides."],
    v: "Publish a library, use a component in a second file, then rename the component and change its color and publish again. Confirm the second file offers an update and keeps its instance overrides after accepting.",
    dep: ["components-and-instances", "shared-styles", "variables-and-design-tokens", "node-identity-and-references"]
  },
  "plugin-api": {
    s: "A versioned programmatic interface that lets third-party code read and edit the document, add panels and tools, and register commands, without access to editor internals.",
    d: "The API exposes a typed object model that mirrors the document: nodes, properties, styles, variables, selection, viewport and events. Edits made through it go through the normal command path, so they are undoable and synced. Plugins declare which capabilities they need in a manifest. The API is stable across editor versions through explicit version numbers and shims. It is hard because proxies must be cheap on documents with a million nodes, async calls must not interleave with live edits unpredictably, and every exposed field becomes a compatibility promise.",
    k: ["Live object proxies vs plain snapshots: proxies feel natural, but each property read crosses a boundary and can be slow or stale.", "A narrow API vs full model access: narrow is safer and easier to keep stable, but pushes power users to unsupported hacks."],
    p: ["A plugin reads thousands of properties one at a time across the sandbox boundary and takes minutes on a large file.", "An API change renames a property and silently breaks popular plugins that never updated."],
    v: "Run a plugin that recolors all rectangles in a file of 50,000 nodes. Confirm it finishes within its stated budget, the change is one undo step, and a collaborator sees it arrive as ordinary edits.",
    dep: ["command-system", "property-model", "scene-graph", "plugin-sandbox"]
  },
  "plugin-sandbox": {
    s: "The isolation boundary that runs untrusted plugin code with limited memory, time and permissions, so a plugin cannot read other data or hang the editor.",
    d: "Plugin logic runs in an isolated execution context with no direct access to the page, network, storage or other plugins. A message channel carries requests to the host, which checks the manifest's declared permissions before acting. Plugin user interface lives in a separate frame with restricted capabilities. Network access may be allowed only to listed origins. The host enforces time limits and can terminate a runaway plugin. It is hard because usefulness needs some network and file access, and each grant widens what malicious code can exfiltrate from a confidential design.",
    k: ["Strict isolation with message passing vs shared-memory access: isolation contains faults but adds latency to every call.", "Install-time permission prompts vs per-use prompts: install-time is less annoying, but people accept broad grants without reading them."],
    p: ["A plugin with network permission sends the whole document to a third-party server, which the document owner never approved.", "A plugin loops forever inside a synchronous callback and freezes the editor thread."],
    v: "Install a plugin that tries to fetch an unlisted origin and read another plugin's storage. Confirm both calls are refused, and that an infinite loop is terminated by the host within the time limit.",
    dep: ["threading-and-workers"]
  },
  "plugin-distribution": {
    s: "The marketplace, review, versioning and update path that lets people find plugins, trust them, install them in an organization and receive fixes.",
    d: "Authors publish a bundle and manifest to a registry. Review checks the declared permissions, behavior and policy compliance before listing. Organizations may restrict installs to an approved list. Updates are versioned, and some require re-consent when permissions change. Usage and crash telemetry go back to authors. It is hard because review cannot prove untrusted code safe, because a once-approved plugin can change behavior in an update, and because the editor must keep running old plugin versions on files that rely on them.",
    k: ["Manual review before listing vs automated checks plus reporting: manual catches more but slows authors; automated scales but misses subtle abuse.", "Auto-updating plugins vs pinned versions: auto-update delivers fixes, but any update can introduce harmful behavior."],
    p: ["An update adds a network permission and is auto-applied for users who dismissed the consent prompt.", "A plugin is withdrawn and every file's saved plugin data becomes unreadable."],
    v: "Publish a version needing a new permission and install the older version in a test organization. Confirm the update requires explicit re-consent, and a blocked plugin disappears from the organization's menus.",
    dep: ["plugin-api", "plugin-sandbox", "permissions-and-sharing"]
  },
  "rest-api-and-webhooks": {
    s: "Server endpoints and event notifications for reading files, nodes, comments, versions and assets from outside the editor, used by automation, documentation and build tools.",
    d: "The REST interface returns a document's tree, rendered images of chosen nodes, comments, library contents and version lists, with scoped tokens. Webhooks post events such as file updated, comment added or library published to subscriber URLs, signed so receivers can verify them. Write endpoints are narrower than read endpoints, usually limited to comments and variables. It is hard because large documents make a full-tree response huge, because rendering on request is expensive, and because rate limits must protect the live service from badly written integrations.",
    k: ["Returning full documents vs fetching by node id and depth: full responses are simple, but large files make them slow and costly.", "Webhooks vs polling: webhooks are timely but need retries and signatures; polling is simple but wasteful and slow."],
    p: ["A build script fetches the full file tree on every commit and exhausts the rate limit for the whole team.", "Webhook receivers accept unsigned requests and process forged events."],
    v: "Request one frame's image and node tree by id, then publish a library change. Confirm the node response is limited to the frame, the image matches the editor, and the webhook arrives signed within seconds.",
    dep: ["permissions-and-sharing", "server-snapshots-and-compaction", "canvas-renderer"]
  },
  "token-sync-pipelines": {
    s: "Automation that exports design variables as platform tokens and imports them back, keeping design and code values in step through a reviewed change flow.",
    d: "A pipeline reads variables and styles through the API or a plugin, converts them into a standard token format, and opens a change in the code repository. In the other direction, token changes in code update the design variables on publish. Modes (light, dark, density) map to token sets. Aliases between tokens must be preserved as references, not flattened. It is hard because the two sides have different type systems and naming rules, because both sides may change at once, and because removing a token breaks consumers that nobody knows about.",
    k: ["Design as source of truth vs code as source of truth: either gives a clear owner, but the other side must accept a one-way flow and slower changes.", "Preserving aliases vs flattening to values: aliases keep theming flexible, but some platforms cannot express them."],
    p: ["A flattened export turns every themed alias into a literal and breaks dark mode in code.", "A renamed variable is exported as a delete plus an add, and downstream code fails to build."],
    v: "Change a primary color variable in light and dark modes, run the pipeline and confirm the repository change updates both token values with aliases intact, and the build using them passes.",
    dep: ["variables-and-design-tokens", "rest-api-and-webhooks", "plugin-api"]
  },
});
