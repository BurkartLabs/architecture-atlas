// Details for the knowledge base plate, part 3: import/export, collaboration, permissions, history.
ATLAS.details("knowledge-base", {
  "importers": {
    s: "Converters that read content from other note tools, plain files, documents and archives and turn it into pages, preserving structure, links and attachments.",
    d: "An importer parses a source format into the block model, mapping headings, lists, tables, links and files to block types and rewriting internal links to the new identifiers. It runs as a background job with progress and a report of what could not be converted. Large imports are chunked and resumable. It reads the document model and attachment path. It is hard because source formats differ in what they can express, so fidelity is always partial, and because relinking requires a two-pass approach: create all pages first, then resolve links.",
    k: ["Best-effort conversion with a loss report versus refusing anything not mappable: best-effort gets content in, whereas strict preserves fidelity but blocks migration.", "Preserving original timestamps and authors versus stamping with the import: preserving keeps history truthful, but needs privileged write paths."],
    p: ["Links are resolved after pages are created in the wrong order and end up pointing nowhere.", "A crash partway through leaves a half-imported tree that is re-imported as duplicates."],
    v: "Import an archive of a thousand linked files with images, then compare counts of pages, links and attachments to the source; confirm a deliberately broken link and an unsupported element appear in the report; kill and resume the job without duplicates.",
    dep: ["block-tree","stable-ids","attachment-storage","rename-propagation"]
  },
  "markdown-html-export": {
    s: "Writing pages out as plain text with lightweight markup or as web pages, along with their attachments, in a form other tools can read.",
    d: "The exporter walks the block tree and emits each block as text or elements, converting links to relative paths between exported files and attachments to a directory beside them. Block types without a plain equivalent, such as databases, become tables or lose properties. A custom block falls back to its declared text. It reads the serialization format and link index. It is hard because plain formats cannot hold everything, so the exporter must choose what to degrade and say so.",
    k: ["Lossless sidecar data versus clean output only: sidecars allow faithful re-import, but clutter the files people wanted to read.", "Rewriting links to relative paths versus leaving identifiers: relative paths work offline in any viewer, but depend on page titles remaining unique in a folder."],
    p: ["Two pages with the same title export to the same filename and one silently overwrites the other.", "Database properties are dropped, so the export of a table is just a list of titles."],
    v: "Export a workspace with links, a database and attachments, open the result in a plain viewer and confirm links resolve, images show and no two pages share a filename; re-import and diff the page structure.",
    dep: ["serialization-format","internal-links","attachments-model"]
  },
  "print-export": {
    s: "Producing paginated documents from pages for printing or sending, with headers, page breaks, and a layout that differs from the screen.",
    d: "A print stylesheet or rendering pipeline lays out blocks into pages, avoiding breaks inside table rows, headings at the bottom of a page and awkward splits of images. Collapsed content is expanded and interactive blocks become static. It may run on the server through a headless renderer so output does not vary by device. It reads the block tree and media variants. It is hard because layout depends on fonts, which must be available on whichever machine renders the output.",
    k: ["Server-side rendering versus the browser's own print: server output is consistent and automatable, but costs infrastructure; the browser is free and varies by device.", "Expanding all collapsed content versus printing as seen: expanding is complete, but makes long unexpected documents."],
    p: ["A missing font on the rendering machine changes pagination and breaks wide tables.", "Embedded frames and videos print as blank rectangles."],
    v: "Export a page with a wide table, an image and collapsed sections to a paginated document on two different machines, and confirm identical page breaks and that every collapsed section appears.",
    dep: ["block-tree","media-blocks"]
  },
  "workspace-export": {
    s: "A complete backup of a workspace's content, structure and attachments, in a documented format that a person can take away and re-import.",
    d: "An administrator requests an export, and a background job walks every page the requester can read, producing a package with documents, databases as tabular files, and attachments. The result is made available as a time-limited download. Large workspaces are split into parts. It reads the block store, storage and permissions. It is hard because it is a heavy read across everything: it competes with live traffic, may take hours, and must see a consistent snapshot while people continue editing.",
    k: ["Snapshot-consistent export versus best effort during live edits: snapshots give a coherent copy, but need a snapshot mechanism and extra storage; best effort is simple and may tear.", "Exporting only what the requester can read versus everything for administrators: respecting access avoids surprise, but an admin export can omit private content that compliance needs."],
    p: ["An export with a download link that never expires leaves a copy of the whole workspace reachable.", "Running exports at peak time degrades the editing experience for everyone."],
    v: "Export a workspace while two clients edit, then re-import it into an empty workspace and compare page counts, link counts and attachment checksums; confirm the download link expires on schedule.",
    dep: ["block-store","attachment-storage","serialization-format","workspace-membership"]
  },
  "web-clipper": {
    s: "A browser extension or share target that saves a web page, selection or screenshot into the workspace as a clean note with its source address.",
    d: "The clipper extracts the main content of the current page using readability heuristics, strips scripts and styles, converts the result into blocks and downloads images into attachment storage so the note survives the original disappearing. It records the address, title and capture date. It runs in the browser with the user's session and sends to the public API or an inbox. It is hard to extract the right region on arbitrary pages, and to capture pages behind logins or loaded by scripts.",
    k: ["Saving a cleaned article versus a full-page snapshot: cleaned text reads well and indexes well, but loses layout; a snapshot is faithful and heavy.", "Copying images at clip time versus linking to the source: copying preserves the note, but costs storage and raises copyright and size questions."],
    p: ["Extraction picks navigation or comments as the main content on unusual layouts.", "A clipped page includes tracking parameters in its stored address."],
    v: "Clip an article with images and a table, delete the original page's images from the network, and confirm the note still shows them, has the source address and appears in search.",
    dep: ["capture-inbox","attachment-storage","public-api"]
  },
  "capture-inbox": {
    s: "A low-friction destination for fast capture from phones, email, voice and share sheets, collected for later sorting into the page tree.",
    d: "Captures from many entry points, such as a quick-add widget, a forwarded email or a dictated note, land as pages or blocks in an inbox location with minimal metadata, including source and time. A later triage pass moves, tags or deletes them. Email-in addresses are per workspace and must be protected against spam and spoofing. It writes through the normal edit path. It is hard to keep capture fast and offline-tolerant while still producing items that triage can understand.",
    k: ["Single inbox versus capturing straight into the right place: an inbox is quick and never blocks, but creates triage debt; direct filing is organized and slows capture.", "Open email-in addresses versus authenticated senders only: open is convenient and attracts spam; authenticated is safe and harder to use from other devices."],
    p: ["An unbounded inbox grows until nobody processes it, and useful items are lost in it.", "An inbound address that leaks lets strangers write into the workspace."],
    v: "Capture a note offline on a phone, forward an email from an allowed sender and from a stranger; confirm the first two appear in the inbox with source metadata and the third is rejected.",
    dep: ["page-tree","public-api","offline-queue"]
  },
  "web-publishing": {
    s: "Turning pages into public websites readable without an account, with custom addresses, indexing controls and a read-only rendering.",
    d: "A page is marked public, and a rendering service serves a read-only version at a stable address, optionally on a custom domain with its own certificate. Sub-pages may be included or not. Search engine visibility is a setting. The rendering strips editing controls, comments and anything marked private, and may cache aggressively at the edge. It reads the block tree and permissions. It is hard because publication changes the audience of the content, so inherited or embedded content may become public unintentionally.",
    k: ["Publishing a subtree automatically versus page by page: subtree is convenient, but exposes later additions; page by page is explicit and tedious.", "Edge caching of published pages versus rendering on request: caching handles traffic spikes, but delays unpublishing unless purged."],
    p: ["A transcluded block or linked view brings private content into a public page.", "Unpublishing takes effect in the origin but old copies remain served from caches."],
    v: "Publish a page with an embedded private block and a link to a private page; fetch it without a session and confirm no private content appears; unpublish and confirm the address returns not found, including from the edge, within the stated delay.",
    dep: ["block-tree","permission-inheritance","transclusion"]
  },
  "presence-cursors": {
    s: "Showing who else is viewing or editing a page, with avatars, colored cursors and selections, updated live.",
    d: "Each client sends small ephemeral updates: current page, cursor position and selection. The server relays them to others on the page and discards them; they are not part of the document. Positions are expressed in the document model so they can be transformed through concurrent edits. Idle clients expire after a timeout. It uses the realtime transport and selection model. It is hard to keep updates cheap with hundreds of viewers, and to avoid sending presence of people who should not be seen.",
    k: ["Ephemeral presence kept out of the document versus recorded as data: ephemeral is cheap and private, but cannot be audited or replayed.", "Showing all viewers versus a capped list: all is informative, whereas capping bounds bandwidth on popular pages."],
    p: ["Stale cursors remain after a client disconnects without closing, suggesting someone is still present.", "Presence reveals that a person is viewing a page they have no business reading, such as an HR record."],
    v: "Open the same page on three clients, move cursors and close one by cutting its network; confirm cursors follow edits to the right character and the dead client's cursor disappears within the timeout.",
    dep: ["realtime-transport","selection-model","permission-filtering"]
  },
  "concurrent-editing": {
    s: "The algorithm and service that merge simultaneous edits from many clients into one consistent document without losing anyone's changes.",
    d: "Clients apply their edits locally, then send operations to be merged. Operational transformation rewrites each operation against concurrent ones through a central order. Conflict-free replicated data types give each element an identity and merge rules, so replicas converge without central ordering. Both must handle text, tree moves and properties. The service validates operations, persists them to the operation log and broadcasts. It is hard because correctness across insert, delete, move and format cases is subtle and permanently shapes the data format.",
    k: ["Central transformation versus replicated data types: central transformation is smaller on the wire and fits a server-first design, but needs availability; replicated types merge offline and peer-to-peer, but grow metadata.", "Intent-preserving move operations versus delete and reinsert: preserving moves keeps identity, though it is far harder to merge correctly."],
    p: ["Replicas diverge permanently after rare interleavings that tests did not cover.", "Metadata from deleted content accumulates and makes documents grow without bound."],
    v: "Run randomized concurrent edit sessions with network delays and partitions between several clients and a server, then confirm that all replicas converge to identical documents and that no committed insert is lost.",
    dep: ["operation-log","block-tree","stable-ids","realtime-transport"]
  },
  "comment-threads": {
    s: "Discussions anchored to a selection of text, a block or a page, with replies, resolution and mentions, kept separate from the content itself.",
    d: "A thread stores an anchor, a list of comments and a resolved flag. Text anchors are positions in the model that must follow edits, and when the anchored text is deleted the thread becomes orphaned and is shown at the block or page level. Comments are visible only to people who can read the page and may be exported separately. It reads the selection model and writes notifications. It is hard to keep anchors in the right place under heavy concurrent editing and moves.",
    k: ["Anchors attached to text ranges versus whole blocks: ranges are precise, but break on edits; block anchors are robust and less specific.", "Comments stored with the page versus in a separate store: with the page they follow moves and copies, but are carried into duplicates and exports unless excluded."],
    p: ["Copying a page copies private discussion into a document shared with others.", "A comment anchored to deleted text disappears and the question it asked is never answered."],
    v: "Comment on a sentence, edit the text before and inside it, and move its block to another page; confirm the thread follows the sentence, then delete the text and confirm the thread remains visible as orphaned.",
    dep: ["stable-ids","selection-model","notifications"]
  },
  "notifications": {
    s: "Messages that tell people about mentions, replies, assignments and changes to pages they follow, delivered in-app, by email and to devices.",
    d: "Events from the activity stream are matched against subscriptions and preferences, grouped to avoid floods, and delivered through channels. Batching, quiet hours and per-page follow settings control volume. Content shown must obey permissions at delivery time. It reads the event stream and permission data, and writes delivery records so read states sync across devices. It is hard because the useful set is small within a very large stream, and because every channel has different delivery guarantees.",
    k: ["Digesting events into summaries versus sending each: digests reduce noise, but delay time-sensitive messages like an urgent mention.", "Sending content in the message versus a link only: content is convenient and leaks outside the workspace's access controls through email and lock screens; links are safe and need a click."],
    p: ["A notification sent before access was revoked leaks a title or excerpt afterward.", "A bulk edit by a rule generates thousands of notifications to the same person."],
    v: "Mention a user in a comment, edit the same page ten times, and confirm one grouped notification arrives per channel; revoke access before the digest sends and confirm no excerpt is included.",
    dep: ["activity-feed","event-webhooks","permission-filtering"]
  },
  "suggestion-mode": {
    s: "An editing mode in which changes are recorded as proposals that others can accept or reject, instead of altering the document directly.",
    d: "Edits in this mode are stored as a separate layer of insertions, deletions and format changes tied to their author, shown inline in a review color. Accepting applies the proposal as a normal operation; rejecting discards it. Proposals must be transformed as the underlying text changes. It reads the operation model and comment system. It is hard because a second change set rides on top of live text, so overlapping proposals, edits inside proposed text and partial acceptance all need rules.",
    k: ["Proposals as a layer over the document versus as branches: a layer is simple and visible in context, but strained by many overlapping suggestions; branches isolate work and require merge.", "Per-change acceptance versus accepting all in a pass: per-change gives control, but slows review of large edits."],
    p: ["Accepting a proposal against text that has since changed lands in the wrong place or fails silently.", "Rendering many overlapping suggestions makes the page unreadable."],
    v: "As a reviewer, suggest a deletion and an insertion; as the owner edit the surrounding text, then accept both; confirm they apply at the right positions and show correct authorship in history.",
    dep: ["operation-log","concurrent-editing","authorship-attribution"]
  },
  "tasks-reminders": {
    s: "To-do items inside pages that can be assigned, dated and collected into personal lists, with reminders at the due time.",
    d: "A checkbox block can carry an assignee, a due date and a reminder. A task index gathers them across pages by assignee for a personal view. Due dates produce scheduled reminders through the notification service. Recurring tasks create the next instance on completion. It reads the document model and writes events. It is hard because tasks live in free text, so extracting them reliably into a list must follow edits, moves and deletion, and reminders must respect time zones.",
    k: ["Tasks as blocks in pages versus rows in a task database: blocks fit the flow of notes, whereas rows support rich queries and reports.", "Reminders computed from the index versus scheduled jobs per task: an index is easy to keep consistent; per-task jobs are precise and need cancel logic."],
    p: ["A moved or deleted task still triggers its reminder.", "Assigning a task to someone who cannot see the page tells them about work they cannot open."],
    v: "Assign a dated task, move its page and mark it done; confirm the personal list shows exactly one entry throughout, the reminder fires once at the right local time, and no reminder fires after completion.",
    dep: ["block-types","notifications","stable-ids"]
  },
  "activity-feed": {
    s: "A chronological record of what changed in a page, a space or the workspace, who did it and when, for awareness and as the source of notifications.",
    d: "Edits are aggregated into events, such as 'edited page' within a session, rather than one per keystroke. Events are written to a stream with actor, target and kind, then filtered per viewer by permissions at read time. The feed supports following pages and spaces. It reads the operation log and the change feed. It is hard because the useful granularity is neither raw operations nor whole sessions, and filtering a large stream by access on read is costly.",
    k: ["Aggregating edits into session events versus recording each: aggregation is readable and small, but loses detail; raw is complete and noisy.", "Filtering at read time versus fan-out on write: read-time filtering stays correct after permission changes, but is slower; fan-out is fast and goes stale."],
    p: ["The feed names a page and its edit after the viewer's access was removed.", "Counting bulk imports and automations as human edits drowns real activity."],
    v: "Make a burst of edits as two users, then check the feed as a third with partial access; confirm one aggregated event per session per page, only visible pages listed, and counts matching the operation log.",
    dep: ["operation-log","change-feed","permission-filtering"]
  },
  "workspace-membership": {
    s: "The set of people belonging to a workspace or team space, with invitations, joining rules and removal that revokes access everywhere.",
    d: "Membership records tie a person identity to a workspace with a role. Invitations are issued by email or link and may be restricted by domain. Removing a member must end access to pages, tokens, integrations and sessions, and decide what happens to their private pages and their authored content. It reads the identity provider and writes the audit log. It is hard because membership touches every access check, so changes must propagate to caches, sync clients and long-lived tokens promptly.",
    k: ["Invite by link versus invite by named address: links are quick, but can be forwarded; named invitations are traceable and slower.", "Transferring a departing member's private pages versus deleting them: transfer preserves knowledge, but exposes content the person assumed private."],
    p: ["A removed member's tokens and device sessions keep working until they expire.", "Offline clients continue to hold the full local copy after removal."],
    v: "Remove a member while their phone is offline and their integration token is active; confirm the token is rejected immediately, the web session ends, and the phone's next sync clears access and the local copy.",
    dep: ["sso-provisioning","roles-and-groups","audit-log"]
  },
  "roles-and-groups": {
    s: "Named sets of capabilities and named sets of people used to grant access in bulk, such as owner, editor, commenter and viewer.",
    d: "A role bundles permissions on a resource: read, comment, edit, manage sharing. Groups collect members so access can be granted to a team and follow joins and leaves. Effective access is computed from direct grants and group grants, taking the most permissive unless a deny exists. Groups may be synchronized from the identity provider. It reads membership data and feeds the permission engine. It is hard because evaluating group nesting and many grants on every read is a hot path.",
    k: ["Fixed roles versus custom roles: fixed roles are easy to understand and audit, while custom roles fit odd needs and multiply the cases to verify.", "Most-permissive-wins versus explicit deny: permissive-wins is easy to reason about, but cannot carve exceptions; deny makes exceptions possible and surprising."],
    p: ["A group synchronized from the identity provider is renamed there and orphans the grants.", "Nested groups create loops or deep expansions that slow every page open."],
    v: "Grant a page to a group, add and remove a user from the group, and confirm access appears and disappears for that user within the propagation target on web, sync and search.",
    dep: ["workspace-membership","sso-provisioning"]
  },
  "permission-inheritance": {
    s: "Rules by which a page's access derives from its ancestors, and by which a page can add or remove access of its own.",
    d: "By default, a page inherits the effective access of its parent, so granting a folder grants everything inside. A page may override by adding people or restricting to a set. The evaluator walks ancestors and combines grants; results are cached per page and invalidated when any ancestor changes. Moves change inheritance and therefore visibility. It reads the page tree and roles and is called by nearly every read. It is hard because a move or grant at the root can change access to a huge subtree.",
    k: ["Inherit with local overrides versus explicit per-page grants only: inheritance is manageable at scale, but a restriction deep in the tree is easy to forget; explicit is clear and burdensome.", "Evaluating on read versus precomputing per-user effective access: on read is always correct, while precomputed is fast and costly to update on change."],
    p: ["Moving a restricted page under an open parent either exposes it or keeps it hidden depending on a rule people do not know.", "A cached result survives a grant removal and keeps access open."],
    v: "Restrict a deep page, move it under an open space, and confirm the documented outcome; then revoke a root grant and confirm access disappears for the whole subtree in web, search and sync.",
    dep: ["page-tree","roles-and-groups","derived-data-cache"]
  },
  "share-links": {
    s: "Links that grant access to a page to anyone holding them, or to anyone in the organization, with a chosen level and optional expiry.",
    d: "A link carries an unguessable token mapped to a page and a capability. Visiting it resolves the token, evaluates expiry and restrictions, and grants an access level for that request or session. Links can be disabled, rotated or set to require sign-in. They apply to a subtree or a single page. It reads the permission engine and is tied to the audit log. It is hard because possession is the credential: any copy of the link, including in logs and chat, is access.",
    k: ["Anyone-with-the-link versus named invitations: links are frictionless and impossible to scope to a person; invitations are accountable.", "Short expiry versus indefinite links: expiry limits the lifetime of leaks, but breaks bookmarks and shared documents people rely on."],
    p: ["A link posted in a public channel keeps granting access long after the discussion ended.", "Search engines index a page because its link was published somewhere crawlable."],
    v: "Create a view link with expiry, open it in a private browser, then expire and rotate it; confirm the first request works, later ones fail, and the old token never grants access again.",
    dep: ["permission-inheritance","audit-log"]
  },
  "guest-access": {
    s: "Access for people outside the organization, limited to specific pages, usually read or comment, and visible as a separate class in the member list.",
    d: "A guest is an identity with grants on individual pages and no workspace-wide rights. They see only what is shared, and the sidebar, search, mentions and people lists are filtered accordingly. Guests count against separate limits and are reviewed regularly. It uses the permission engine with a restricted default. It is hard to prevent leaks via the places where workspace content shows by default: mention suggestions, backlinks, breadcrumbs and notifications.",
    k: ["Guests as limited members versus as share-link visitors: guests have identity, audit and revocation, but need accounts; link visitors are frictionless and anonymous.", "Letting guests invite others versus forbidding it: allowing speeds collaboration, whereas forbidding keeps the audience known."],
    p: ["Autocomplete in mentions lists internal employees to a guest.", "A guest keeps access to a page that was later moved into a larger shared subtree."],
    v: "As a guest of one page, search for known internal titles, open the people picker and follow a backlink to a private page; confirm no private title, name or count is exposed in any of them.",
    dep: ["permission-inheritance","permission-filtering","breadcrumbs"]
  },
  "sso-provisioning": {
    s: "Single sign-on and automated user and group lifecycle driven by the organization's identity provider.",
    d: "Sign-in delegates to the identity provider using a standard protocol, and the workspace maps its claims to a member. A provisioning interface creates, updates and deactivates members and groups from the provider, so joiners and leavers are handled in one place. Domains can be claimed to force sign-in through the provider. It feeds membership and groups. It is hard because the two systems disagree about identity when emails change, and because deprovisioning must end live sessions and tokens quickly.",
    k: ["Matching identities by an immutable identifier versus by email: identifiers survive renames, but need mapping at setup; email is simple and breaks on change.", "Just-in-time account creation at first sign-in versus pre-provisioning only: just-in-time is easy, but makes accounts the provider never intended."],
    p: ["An email change in the provider creates a second account that owns none of the person's content.", "Deprovisioning disables sign-in but not existing sessions or tokens."],
    v: "Deactivate a user in the provider and confirm the member is deactivated through provisioning, active sessions end within the stated delay, and their authored pages remain with attribution.",
    dep: ["workspace-membership","roles-and-groups"]
  },
  "audit-log": {
    s: "A tamper-resistant record of security-relevant actions such as sign-ins, sharing changes, exports, role changes and deletions, searchable by administrators.",
    d: "Sensitive actions emit structured events with actor, target, time, source address and outcome to an append-only store separate from content. Retention is long and configurable, and events can be streamed to external monitoring. Access to the log itself is restricted and logged. It is written by the permission engine, export, membership and sharing paths. It is hard to cover every path, so that nothing important happens unlogged, and to keep entries useful without storing page content.",
    k: ["Logging metadata only versus including content snapshots: metadata avoids duplicating sensitive text, but can't show what exactly was exposed.", "Synchronous write on the action path versus asynchronous: synchronous guarantees the record, but slows and can block actions; asynchronous is fast and can drop events on a crash."],
    p: ["A new endpoint ships without emitting events, creating an unlogged path to exports.", "Administrators can edit or delete log entries through the same storage."],
    v: "Perform a share, a role change, an export and a deletion, then query the log and confirm four entries with correct actors and targets; attempt to alter an entry through the application and confirm refusal.",
    dep: ["workspace-membership","share-links"]
  },
  "encryption-keys": {
    s: "Protection of content in transit and at rest, including key management, customer-held keys and optional end-to-end encryption between clients.",
    d: "Transport uses TLS everywhere; storage encryption uses per-tenant data keys wrapped by a key service, and some systems let the customer hold the wrapping key. End-to-end designs encrypt on the client, so the server stores only ciphertext, at the cost of server-side search, previews, publishing and web access. Key rotation re-wraps keys without re-encrypting everything. It reads and protects the block store and attachment storage. It is hard because every feature that needs to read content on the server is lost or redone on the client.",
    k: ["Server-side encryption with managed keys versus end-to-end: server-side keeps search and collaboration, but trusts the operator; end-to-end removes the operator and cripples server features.", "Customer-held keys versus provider keys: customer keys give control and revocation, but a lost key means unrecoverable data."],
    p: ["Losing a customer-held key makes the workspace permanently unreadable.", "Search indexes and caches hold plaintext copies outside the encrypted store."],
    v: "Rotate the key for a workspace, confirm reads continue without downtime and all data keys are re-wrapped; inspect the search index and caches for plaintext, and revoke a customer key to confirm content becomes unreadable.",
    dep: ["block-store","attachment-storage","derived-data-cache"]
  },
  "version-snapshots": {
    s: "Periodic or event-driven saved states of a page that people can inspect and return to, kept separately from the live document.",
    d: "The system captures a snapshot after an editing session, at intervals or on demand, storing either the full state or a delta over the previous. Older versions are thinned according to a retention policy. Each version records authors and time. It reads the document state and the operation log, and stores in the block store or a dedicated history store. It is hard to balance storage with granularity, since a long-lived page edited by hundreds of people accumulates enormous history.",
    k: ["Full snapshots versus deltas: snapshots restore instantly and cost storage; deltas are compact and need replay.", "Version on every operation versus per session: per operation gives exact undo, but explodes in size; per session is compact and coarse."],
    p: ["Retention thinning removes the one version someone needed because it was never named or flagged.", "Snapshots taken mid-merge capture an inconsistent state that cannot be opened."],
    v: "Edit a page across several sessions, then open the list and confirm each session's version exists with correct authors; open an old version and confirm its content equals the document as it was at that moment.",
    dep: ["operation-log","block-store","serialization-format"]
  },
  "history-diff": {
    s: "A view of what changed between two versions of a page, showing inserted, deleted and modified blocks and text with authors.",
    d: "The diff compares two states of the block tree: first aligning blocks by identifier, then diffing text within matched blocks and showing moves as moves rather than delete and insert. Results are rendered inline in the page layout. Properties and embedded data have type-specific comparisons. It reads version snapshots. It is hard because a tree diff that handles moves, formatting and large pages quickly is more complex than a line diff, and meaningless noise from reformatting hides real change.",
    k: ["Aligning blocks by stable identifier versus by content similarity: identifiers are exact and fast, but fail across copies and imports; similarity works anywhere and guesses.", "Showing every attributed change versus a summary: full detail serves audit, whereas summaries serve review."],
    p: ["Moves reported as a delete and an insert make an innocent reorganization look like a rewrite.", "Very large pages take so long to diff that the view times out."],
    v: "Compare two versions where a block was moved, a sentence reworded and a mark added; confirm the output shows one move, one text change and one format change, with the right authors.",
    dep: ["version-snapshots","stable-ids","block-tree"]
  },
  "restore-flow": {
    s: "Returning a page, or part of one, to an earlier version, recorded as a new change so the history stays linear and the restore itself can be undone.",
    d: "Choosing a version creates a new operation set that transforms the current document into the old content, rather than rewinding the history. Partial restore copies selected blocks back. Restoring whole pages from trash also restores their place in the tree and their permissions where possible. It reads snapshots and writes through the normal operation path so collaborators see it live. It is hard to restore without clobbering later work that was intentionally kept.",
    k: ["Restore as a new forward change versus rewinding history: forward keeps the record and can be undone, while rewinding is simpler to explain and loses what happened.", "Whole-page restore only versus block-level restore: whole page is simple, whereas block-level recovers one lost paragraph without losing later edits."],
    p: ["Restoring a whole page discards a week of valid edits made after the version.", "A restored page lands under a parent that no longer exists, with permissions that no longer match."],
    v: "Restore an old version while another client is editing; confirm the result appears as an attributed change for all clients, the later content is recoverable from history, and the restore can itself be reverted.",
    dep: ["version-snapshots","operation-log","concurrent-editing"]
  },
  "authorship-attribution": {
    s: "Tracking which person wrote or changed each part of a page, shown as colors or on hover and used in history and audit.",
    d: "Each operation carries the author's identity, and the model retains attribution at the level of text runs or blocks. Display aggregates by author and time. Attribution must survive merges, moves and restores, and be dropped or anonymized on request. It reads the operation log and the rich text runs. It is hard because attribution multiplies metadata per character and complicates export, since plain formats keep no authorship, and because some changes come from automation, imports or restores that are not authored by the person who triggered them.",
    k: ["Per-character attribution versus per-block: per-character answers exactly who wrote what, and bloats storage; per-block is cheap and coarse.", "Attributing automation to the rule's author versus a system identity: the author keeps accountability, but creates false impressions of human edits."],
    p: ["Restoring or importing pages marks everything as written by the restoring user.", "A deleted user's contributions become unattributable or are shown under a raw identifier."],
    v: "Have three users edit different sentences, then merge a restore and an import; confirm each sentence shows the right author and the import and restore are labeled with their true source.",
    dep: ["operation-log","rich-text-runs"]
  },
  "deletion-retention": {
    s: "What happens when content is deleted: a recoverable trash for a period, then permanent removal, with administrative holds and legal erasure.",
    d: "Deleting moves a page to trash with its subtree, keeping it recoverable for a configured number of days. After that a purge job removes content from the store, attachments, search index and derived caches, and eventually from backups. Holds suspend purging for specified content. Erasure requests require removal from history and every copy. It touches every store. It is hard because deletion must be complete: references, caches, versions and backups each hold copies.",
    k: ["Soft delete with delayed purge versus immediate removal: soft delete forgives mistakes, but data lingers; immediate satisfies erasure and cannot be undone.", "Purging backups on schedule versus leaving them to age out: purging is thorough and expensive; aging out is simple and keeps data past the retention promise."],
    p: ["Content removed from the page remains in search results or in attachment storage.", "A hold set after deletion cannot recover content that was already purged."],
    v: "Delete a page with an attachment, wait out the retention period and confirm it is absent from the store, search index, attachment storage and caches; place a hold on a second page and confirm the purge skips it.",
    dep: ["block-store","attachment-storage","derived-data-cache","audit-log"]
  },
  "backup-snapshots": {
    s: "Whole-system copies and continuous logs from which the service can be rebuilt to a chosen moment after corruption, operator error or loss of a region.",
    d: "Periodic full snapshots of stores are combined with a continuous stream of changes, so a restore can replay to a specific time. Attachment storage is versioned or replicated. Restores can target a new environment, or one workspace, which is harder. Backups are encrypted and stored in a separate failure domain. It reads the block store and storage. It is hard because single-workspace restore from a multi-tenant backup needs extraction tooling, and because restores that have never been practiced fail when needed.",
    k: ["Whole-cluster backup versus per-tenant logical backup: whole cluster is simple and restores everything or nothing; per-tenant allows targeted recovery and costs extra tooling.", "Frequent snapshots versus continuous log shipping: snapshots are simple and lose recent changes; logs give point-in-time recovery and add moving parts."],
    p: ["A backup that has never been restored turns out to be missing attachments or keys.", "Restoring one customer's data overwrites changes made by others sharing the same store."],
    v: "Restore a single workspace to a point ten minutes before a deliberate deletion into an isolated environment, and compare page counts, attachment checksums and permissions with the source at that moment.",
    dep: ["block-store","attachment-storage","encryption-keys"]
  }
});
