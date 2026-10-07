// Details for the knowledge base plate, part 2: databases, templates, embeds, extension.
ATLAS.details("knowledge-base", {
  "property-schema": {
    s: "The typed fields a database defines for its pages, such as text, number, date, select, person and checkbox, with rules for how each is stored, validated and shown.",
    d: "A schema is a list of properties, each with an identifier, a display name, a type and type-specific options such as the allowed values of a select. Every row stores values keyed by property identifier, so renaming a property touches only the schema. Changing a type converts or drops existing values by a defined mapping. Views, filters and formulas all read the schema. It is hard because the schema is edited live by people with rows already filled in.",
    k: ["Keying values by property identifier versus by name: identifiers make renames free, but exports and API clients must translate back to names.", "Strict typed values versus permissive text that is interpreted: strict types allow reliable filters and sorts, but make type changes lossy."],
    p: ["Changing a property from text to number silently turns unparseable values into empty ones.", "Deleting a select option leaves rows pointing at a value that no longer exists."],
    v: "Change a populated text property to a number, then review the conversion report; confirm parseable values are preserved, the rest are listed rather than silently lost, and the change can be undone from history.",
    dep: ["block-types","stable-ids","schema-versioning"]
  },
  "rows-as-pages": {
    s: "The design in which each database row is itself a full page, with its own body, history, permissions and links, plus the property values shown in the table.",
    d: "A row is a page whose parent is a database, with property values stored alongside its block content. This lets a task or a record have long-form notes, comments and attachments without a second system. Row pages are listed in views by property values and opened full-screen. The database stores no separate record. It is hard to make queries over many rows fast when each row is a heavyweight page with its own permissions, and to define which rule wins when row and database permissions differ.",
    k: ["Rows as full pages versus lightweight records with optional pages: full pages are uniform and flexible, but make bulk operations and queries heavier.", "Inheriting the database's access by default versus per-row access: inherited access is predictable, while per-row access fits private records and costs query-time checks."],
    p: ["Loading a table of ten thousand rows by loading ten thousand pages exhausts memory and time.", "A row shared by link exposes the rest of the database through its relations."],
    v: "Create a table of ten thousand rows, open it, and confirm only visible rows load their property values; open a row, write a long body and attach a file, and confirm it survives sort and filter changes.",
    dep: ["property-schema","block-tree","permission-inheritance"]
  },
  "relations": {
    s: "Properties that point from a row to rows in another database, forming joins that can be followed in both directions.",
    d: "A relation stores a list of target row identifiers. Declaring a two-way relation creates a mirror property on the target database that is kept in sync, so each side sees the other. Views display the related titles, and rollups aggregate over them. Deleting a row removes or nulls the references to it. It reads the schema and the row store, and must check permissions on the target rows. It is hard because many-to-many relations make referential integrity and cascading changes expensive.",
    k: ["Two-way mirrored relations versus one-way references: mirrors enable navigation from both ends, but every write touches two rows and can diverge if one side fails.", "Referential cleanup on delete versus tolerating dangling references: cleanup keeps data tidy, but is a write across many rows; tolerance is cheap but shows ghosts."],
    p: ["Sharing a row exposes titles of related rows in a database the viewer has no access to.", "A failed half of a mirrored write leaves a relation visible from one side only."],
    v: "Relate two rows across databases, delete one, and confirm the other loses the reference on both sides; as a viewer without access to the target database, confirm related titles are hidden.",
    dep: ["property-schema","rows-as-pages","stable-ids"]
  },
  "rollups-formulas": {
    s: "Computed properties that aggregate over related rows or evaluate an expression over a row's own properties, updating when inputs change.",
    d: "A rollup applies an aggregate such as count, sum or earliest date to a property of related rows. A formula is an expression in a small typed language with functions for text, dates, arithmetic and conditions. Results are computed on read or cached and invalidated by a dependency graph over properties. It reads the schema, relations and row values. It is hard because dependencies chain across databases, so a single edit can recompute thousands of cells, and cycles must be rejected.",
    k: ["Compute on read versus cached results with invalidation: on read is always correct but slow for large tables; caching is fast but adds a dependency graph to maintain.", "A small restricted expression language versus general scripting: restricted is safe and analyzable, but cannot express everything people want."],
    p: ["A formula referencing itself through a rollup chain loops or locks if cycles are not detected on save.", "Time-dependent formulas, such as days until a date, display stale results when cached."],
    v: "Build a chain of three dependent computed properties across two databases, edit the root value, and confirm all three update to the expected numbers; introduce a cycle and confirm it is rejected with a clear error.",
    dep: ["property-schema","relations","database-query-engine"]
  },
  "database-views": {
    s: "Alternative presentations of the same rows, such as table, board, list, calendar, gallery and timeline, each with its own settings.",
    d: "A view is a saved configuration: which layout, which properties are shown, and a filter, sort and grouping. The same rows appear in each, and edits in any view change the underlying rows. Layouts differ in what they require: a board needs a grouping property, a calendar needs a date. Views are stored with the database and can be personal or shared. It is hard because each layout has its own rendering, interaction and virtualization needs while sharing one query.",
    k: ["Shared saved views versus per-person view state: shared views give a team one picture, but people also need private filters without altering everyone's view.", "One generic query per view versus layout-specific fetching: generic is simple, but a timeline and a board want different shapes and paging."],
    p: ["Dragging a card on a board changes a property the person did not intend if a grouping property doubles as another field.", "A view that references a deleted property fails to load instead of degrading."],
    v: "Create table, board and calendar views over the same rows, drag a card to another column, and confirm the row's property changes and all three views reflect it.",
    dep: ["filters-sorts-groups","property-schema","rows-as-pages"]
  },
  "filters-sorts-groups": {
    s: "Rules that select, order and bucket the rows of a database view, built from property conditions that may be nested and combined.",
    d: "A filter is a tree of conditions with and/or combinators, each condition applying a type-specific operator to a property. Sorts are an ordered list of property and direction. Grouping buckets rows by a property value. The configuration compiles into a query for the engine. Operators depend on type: dates support relative ranges, selects support any-of. It is hard to define consistent semantics for empty values, multi-valued properties and time zones, and to show people why a row is missing.",
    k: ["Visual condition builder versus a query language: a builder is learnable for everyone, but cannot express arbitrary logic that a language can.", "Relative date filters evaluated at view time versus fixed values: relative filters stay useful but change results daily, which complicates caching and sharing."],
    p: ["Filters on a property that was renamed or retyped silently match nothing, hiding rows.", "Sorting text with a plain code-point order puts accented and capital letters in surprising places."],
    v: "Filter a table by a relative date and a multi-select, group by owner, sort by a number, and confirm the result matches the same query run directly against the stored rows, including empty values placed where documented.",
    dep: ["property-schema","database-query-engine"]
  },
  "database-query-engine": {
    s: "The component that evaluates a view's filters, sorts, groups and computed properties over rows efficiently, locally or on the server.",
    d: "It takes the schema, a compiled query and the row set, uses indexes on commonly filtered properties where available, and returns pages of results with computed values. On large tables it must paginate and avoid loading full row bodies. Some clients run the engine locally on synced rows for offline use, so a second implementation or shared code must produce identical results. It reads the block store and derived caches. It is hard to match server and client semantics exactly.",
    k: ["Server-side evaluation versus on the client: the server handles large tables, while the client allows offline and instant filtering but only over what is synced.", "Property indexes on every column versus on demand: all columns speed any filter, at the cost of write amplification on every edit."],
    p: ["Two implementations disagree on edge cases, so a view shows different rows online and offline.", "Sorting before paginating a very large table requires scanning everything and times out."],
    v: "Run a set of fifty representative queries against the same rows on the server and in the offline client and confirm identical row order and counts; time a filtered, sorted page of a million-row table.",
    dep: ["block-store","derived-data-cache","property-schema"]
  },
  "linked-views": {
    s: "A view of one database embedded in another page, with its own filter and layout, so the same data appears in context wherever it is relevant.",
    d: "A linked view stores a reference to the source database and a view configuration, and renders live results inside a page body. Edits through the linked view change the source rows. It is a block type that reads the query engine. Pages like a project hub embed several. It is hard because the embedded view runs as the reading user and must respect permissions on the source, and a page with many linked views multiplies queries on every open.",
    k: ["Linked views of one source versus copies of the data: links keep one truth and update live, but make the page depend on the source's availability and access.", "Filters scoped to the host page, such as 'rows related to this page', versus fixed filters: contextual filters make templates reusable, but need a defined meaning of 'this page'."],
    p: ["A page with a dozen linked views runs a dozen queries at load and feels slow.", "A linked view of a database the viewer cannot open reveals structure through empty headers or counts."],
    v: "Embed a filtered view in a project page, edit a row from it, and confirm the source database updates; open the page as someone without source access and confirm a placeholder rather than data or counts.",
    dep: ["database-views","database-query-engine","permission-inheritance"]
  },
  "page-templates": {
    s: "Saved page structures that people instantiate to start a new page with predefined blocks, headings and placeholders.",
    d: "A template is a page stored with a flag, containing blocks to copy. Instantiation clones the subtree with fresh identifiers, resolves variables and applies default properties. Templates are offered from menus on the new-page action. Updating a template changes only future pages. It reads the block tree and writes new pages through the normal path. It is hard to decide how much of a template's structure stays linked to it afterward, since people usually want the starting point and not a continuing dependency.",
    k: ["Copy on instantiate versus staying linked to the template: copies are independent and predictable, but never receive improvements; links propagate updates and overwrite local edits.", "Templates as ordinary pages versus a separate object type: ordinary pages are easy to edit and share, but mix with real content unless clearly marked."],
    p: ["A template that links to itself or to a private page gives every new page an inaccessible reference.", "Editing a template while someone instantiates it produces half-updated pages."],
    v: "Instantiate a template with headings, a to-do list and a mention, and confirm all blocks have new identifiers, the mention resolves and a later template edit does not change the existing page.",
    dep: ["block-tree","stable-ids","template-variables"]
  },
  "database-templates": {
    s: "Templates attached to a database that fill a new row's properties and body, with defaults and per-type variations such as a bug report or a meeting.",
    d: "A database holds one or more templates, each specifying default property values and a body. Creating a row picks one, either by explicit choice or as the default. Defaults can include relative dates and the current person. The result is an ordinary row. It reads the schema and writes through the row path. It is hard when the schema changes: a template referencing a deleted property or an option that no longer exists must degrade without blocking creation.",
    k: ["A default template applied to every new row versus choosing each time: defaults enforce consistency, but surprise people who only wanted an empty row.", "Templates referencing property identifiers versus names: identifiers survive schema renames, but make exports of templates harder to read."],
    p: ["A template with a required property default that is later removed from the schema blocks row creation with a confusing error.", "Relative defaults such as 'next Monday' are computed at template save time instead of at creation."],
    v: "Create a row from a template with a relative due date and a default owner; confirm the due date is computed at creation, and delete a referenced property and create again to confirm the row still appears.",
    dep: ["page-templates","property-schema","rows-as-pages"]
  },
  "template-variables": {
    s: "Placeholders in a template, such as the current date, current person or a chosen value, that are replaced when a page is created.",
    d: "Variables are tokens in text, property defaults or titles that the instantiation step evaluates against a context holding the date, time zone, author and the target container. Some prompt the person for a value. The substituted values become plain content. It reads the template and the creating user's context. It is hard to choose time zone and locale: a daily page created by a scheduled job must use the owner's time zone, not the server's.",
    k: ["Evaluated at creation versus kept live in the page: creation-time values are stable and simple, whereas live values stay current but turn pages into programs.", "A small fixed variable set versus user-defined variables: a fixed set is predictable and safe, while user-defined adds power and a place to hide errors."],
    p: ["Dates computed in the server time zone produce a daily note titled with yesterday's date.", "An unknown variable name is left as visible raw text in thousands of generated pages."],
    v: "Create a page from a template using date and author variables as users in two different time zones near midnight, and confirm each page shows its creator's local date and name.",
    dep: ["page-templates"]
  },
  "recurring-pages": {
    s: "Pages or rows created on a schedule from a template, such as a daily note, weekly review or monthly report.",
    d: "A recurrence stores a template, a schedule and a target location. A scheduler creates the instance at the due time and may notify the owner. It must be idempotent, so a retry does not create duplicates, and should catch up after downtime by creating missed instances. Schedules run in the owner's time zone with defined handling of daylight saving transitions. It reads the template and the automation rules. It is hard to be both reliable and quiet when many workspaces share one scheduler.",
    k: ["Creating instances ahead of time versus at the due moment: ahead means they exist for planning, but fills the workspace with future pages; at the moment keeps it clean but can run late.", "Catching up on missed runs versus skipping them: catching up preserves the series, but can flood after a long outage."],
    p: ["A retried job creates two copies because creation was not keyed by schedule and date.", "A daylight saving shift creates the same day's page twice or skips one."],
    v: "Schedule a daily page, pause the scheduler for three days, restart it, and confirm exactly the missed pages appear once each in the right time zone, with no duplicates after a forced retry.",
    dep: ["page-templates","template-variables","automation-rules"]
  },
  "automation-rules": {
    s: "Rules of the form when something happens, do something, such as changing a property when a status changes or posting a notice when a row is created.",
    d: "A rule has a trigger drawn from the event stream, optional conditions and one or more actions such as setting properties, creating pages, sending notifications or calling a webhook. Rules run in the background as the workspace, or as the rule's author, so permissions need a defined identity. Loops are limited by depth and rate. It reads the event stream and writes through normal edits. It is hard to prevent runaway cascades, and to make failures visible to people who set the rule up long ago.",
    k: ["Running as the rule's author versus as a system identity: the author's identity keeps audit trails meaningful, but breaks when that person leaves; a system identity is durable but bypasses person-level limits.", "Declarative triggers and actions versus scripted rules: declarative is safe and auditable, whereas scripts cover cases the builder did not foresee."],
    p: ["A rule that edits the property that triggers it loops until a rate limit stops it.", "A rule whose author lost access fails silently and nobody notices for weeks."],
    v: "Create a rule that sets a date when a status changes, change the status on a row, and confirm one action ran and appears in the activity log; then create a self-triggering rule and confirm it halts at the configured depth with an error.",
    dep: ["event-webhooks","operation-log","audit-log"]
  },
  "template-gallery": {
    s: "A shared collection of templates inside an organization or published publicly, from which people duplicate a ready-made setup.",
    d: "Entries are template pages or whole page trees published with a title, description and preview. Duplicating one copies the structure into the user's workspace, remapping internal links and rebuilding any databases it contains. Publishing to a wider audience adds moderation and attribution. It reads the web publishing path and the duplicate operation. It is hard because a template with relations, linked views and permissions has to be copied as a consistent set, and links to private pages must not come along.",
    k: ["Copy of the full tree on duplicate versus a lightweight starter: full copies give a complete working setup, but are heavy and carry hidden references; starters are small but need more setup.", "Open public gallery versus an organization-only one: public spreads good patterns, but needs moderation and can leak internal details in published pages."],
    p: ["Duplicating a template with relations leaves them pointing at the original's databases.", "A published template contains private names or email addresses inside comments and history."],
    v: "Publish a template containing a database with a relation and a linked view, duplicate it into a new workspace, and confirm relations and views point at the new copies and no content from the source workspace remains.",
    dep: ["page-templates","web-publishing","rename-propagation"]
  },
  "media-blocks": {
    s: "Blocks for images, video, audio and arbitrary files, with upload, preview, captions and size handling.",
    d: "Choosing a file uploads it to attachment storage and creates a block pointing at the object. Images are resized into variants, video may be transcoded or streamed with range requests, and documents get a preview. Access to the file follows the page's access through short-lived signed addresses. It reads the attachment model and storage. It is hard because uploads are large and fail partway, because offline use needs the file locally, and because a signed link must not outlive access revoked on the page.",
    k: ["Signed expiring links versus long-lived public addresses: signed links honor revocation, but break pasted or cached addresses; public ones are simple and leak.", "Resizing at upload time versus on demand: upfront variants are fast to serve, whereas on demand saves storage and costs a first-request delay."],
    p: ["A file stays reachable through an old address after the page was made private.", "A user closes the tab during upload and leaves a block pointing at a missing object."],
    v: "Upload a large image, view it on a phone, then revoke the viewer's access and confirm an old copied address stops working within the link's lifetime; kill an upload midway and confirm the block shows a failed state rather than a broken image.",
    dep: ["attachments-model","attachment-storage","permission-inheritance"]
  },
  "web-embeds": {
    s: "Blocks that show a live external page, such as a video, map, design file or form, inside a note through a sandboxed frame.",
    d: "Pasting a link is resolved against a list of known embeddable providers, or through a standard discovery protocol, to get an embeddable address and a size. The block renders it in a frame with restricted permissions. Unknown sites fall back to a link preview. It reads the link preview service and the security policy. It is hard because embedded content is third-party code in the page: it can track viewers, fail to load because of framing rules, or be changed after the author trusted it.",
    k: ["Allowlist of providers versus any address: an allowlist limits attack surface and privacy leaks, but cannot embed new services without updates.", "Loading embeds immediately versus on click: immediate is seamless, but contacts third parties for every viewer; click-to-load is private and slower."],
    p: ["A frame without a restrictive sandbox lets embedded content navigate or script the host page.", "Embeds blocked by the provider's framing rules display an empty box with no explanation."],
    v: "Embed a supported provider and an unsupported site; confirm the first renders in a frame whose sandbox attributes forbid top navigation and the second falls back to a link preview, and inspect the frame's attributes to confirm.",
    dep: ["link-previews","block-types"]
  },
  "link-previews": {
    s: "Cards showing the title, description and image of an external page when a link is pasted, fetched by the server on the viewer's behalf.",
    d: "A server-side fetcher requests the page, reads its metadata tags and caches the result. Fetching happens on the server so viewers do not contact the target and so results are consistent. It must refuse internal network addresses, limit size and redirects, and respect time limits. The preview is stored in the block so it renders offline. It is hard to avoid being used as a proxy into private networks, and to refresh previews that change.",
    k: ["Server-side fetching versus client-side: server fetching protects viewers and caches, but is an outbound request surface that needs strict controls.", "Storing the preview in the block versus refetching on view: storing is fast and offline-friendly, but shows stale titles and images."],
    p: ["Fetching an address that resolves to an internal service exposes private data in the preview.", "A very large or slow response ties up fetcher workers."],
    v: "Paste a public link and confirm a card appears and renders offline; paste an address resolving to a private network range and confirm the request is refused and logged.",
    dep: ["attachment-storage","block-types"]
  },
  "code-and-math-blocks": {
    s: "Blocks for source code with syntax coloring and for typeset equations written in a markup notation.",
    d: "A code block stores raw text and a language label, and renders it with a tokenizer for coloring, line wrapping and a copy button. A math block stores notation, rendered by a typesetting engine into markup, either inline or as a display block. Both must export as plain text with their source intact. They read the block schema. It is hard to render untrusted notation safely and fast, to keep indentation and whitespace through editing and paste, and to handle huge code blocks.",
    k: ["Storing source and rendering on view versus storing rendered output: source stays editable and portable, but rendering costs time on every open.", "Bundled tokenizers for many languages versus a few: more languages are convenient, yet increase client size."],
    p: ["Auto-formatting and smart quotes alter code characters while typing in a text block.", "A malformed equation breaks the rendering of the whole page rather than only itself."],
    v: "Paste a code sample with tabs and an equation with an error; confirm whitespace is unchanged, the equation shows an inline error without breaking the page, and exporting to text returns both sources exactly.",
    dep: ["block-types","rich-text-runs"]
  },
  "diagram-blocks": {
    s: "Blocks that render diagrams from a text description or a drawing canvas, such as flowcharts, sequence diagrams and whiteboards.",
    d: "A text-described diagram stores the definition and renders an image from it on the client or the server; a drawing block stores a scene of shapes and strokes in a structured format. Both appear as a single block in the page and export as an image plus the source. Drawing blocks may have their own collaboration and undo. It reads the block schema and attachment model. It is hard because the diagram engine is a second editor with its own state inside the first.",
    k: ["Text-defined diagrams versus freeform drawing: text diagrams diff, version and merge well, but lay out automatically; drawings are flexible and merge poorly.", "Embedding the drawing's state in the page versus as an attached file: in the page it syncs with everything else, but bloats the document; a file is separate and heavy to merge."],
    p: ["Concurrent edits to a drawing overwrite each other if the scene is stored as one value.", "Server-side rendering of untrusted definitions can be used to exhaust resources."],
    v: "Create a diagram from text, edit it from two clients concurrently, and confirm the result keeps both changes or follows the documented conflict rule; export the page and confirm the diagram appears as an image alongside its source.",
    dep: ["block-types","attachments-model","concurrent-editing"]
  },
  "plugin-runtime": {
    s: "The environment in which third-party extension code runs, isolated from the application and from other plugins, with explicit permissions.",
    d: "Plugins load into a sandbox such as an isolated frame, worker or separate process. They communicate with the host only through a message interface exposing the permitted API. A manifest declares requested capabilities, such as reading pages or network access, which the user approves. The runtime enforces limits on time and memory and can disable a misbehaving plugin. It reads the plugin API and the permission model. It is hard to give plugins enough power to be useful, such as reading the current document, without letting them read everything.",
    k: ["Strong isolation in a separate context versus running in the page: isolation contains failures and abuse, but makes every API call asynchronous and slower; in-page is fast and dangerous.", "Declared capabilities approved at install versus asked at use: install-time is simple but encourages blanket approval; at-use is safer but interrupts people."],
    p: ["A plugin with broad read access exfiltrates page content to an outside server.", "A slow plugin hook blocks the editor on every keystroke."],
    v: "Install a plugin that attempts to read a page it was not granted and to call an undeclared network address; confirm both calls are denied and logged, and that a plugin loop is stopped by the time limit.",
    dep: ["plugin-hooks","workspace-membership"]
  },
  "plugin-hooks": {
    s: "The defined points where plugins can observe or change behavior, such as commands, block rendering, editor events and sidebar panels.",
    d: "The host exposes a versioned set of registration functions and events: add a command to the menu, render a custom block, react to a page being saved or add a panel. Hooks run in order with defined error handling, so one failing plugin does not stop the rest. Mutating hooks, such as transforming text on save, are riskier than observing ones. It reads the event system and block schema. It is hard because every hook becomes a compatibility promise for years.",
    k: ["Narrow, stable hook surface versus wide access to internals: narrow keeps plugins working across releases, but limits what they can do; wide enables more and breaks at each internal change.", "Synchronous mutating hooks versus asynchronous observers: mutating hooks can enforce rules, but add latency and failure modes to core operations."],
    p: ["A plugin written against internals breaks after a minor release, and its users blame the host.", "Two plugins transforming the same text in a save hook conflict, with the result depending on load order."],
    v: "Register a hook that records every save and one that throws; confirm the first still receives every event, the failure is isolated and reported, and a plugin built for the previous API version still runs.",
    dep: ["block-types","event-webhooks"]
  },
  "custom-blocks": {
    s: "Block types and view layouts contributed by plugins or the platform, with their own data, rendering and editing behavior.",
    d: "A custom block declares a type name, a data schema, a renderer and optional editing controls. The document model stores its data opaquely, versioned with the plugin. When the plugin is absent, the block shows a placeholder and keeps the data. They interact with serialization and export, which need a fallback representation. It is hard to keep such blocks portable: a document that depends on a plugin is not fully readable without it.",
    k: ["Opaque stored data with plugin-owned rendering versus standardized block types: opaque data allows any idea, but loses meaning in export and search without the plugin.", "Plugin-defined schema migration versus host-managed: plugin-defined lets authors evolve data, but a missing plugin cannot migrate."],
    p: ["Uninstalling a plugin makes its blocks vanish from view, and users believe content was deleted.", "Custom block text is not indexed, so search misses it."],
    v: "Create a page with a custom block, uninstall the plugin, and confirm a placeholder remains with data intact; reinstall and confirm it renders again; export and confirm a documented fallback appears.",
    dep: ["block-types","plugin-runtime","serialization-format"]
  },
  "public-api": {
    s: "A documented HTTP interface for reading and writing pages, databases and comments, authenticated by tokens and bounded by rate limits.",
    d: "Resources are pages, blocks, databases and rows, exposed with JSON representations that map the internal model onto a stable external one. Access uses tokens scoped to a workspace or integration, with the integration seeing only pages explicitly shared with it. Lists are paginated and calls rate limited. Writes validate against the schema. It reads the document model and permissions. It is hard because the external shape must remain stable while the internal model evolves, and because bulk reads can load the system.",
    k: ["Integration-scoped tokens that see only shared pages versus whole-account tokens: scoped tokens limit damage, but make setup more laborious.", "A stable external schema distinct from the storage format versus exposing it directly: a separate shape gives freedom to change storage, but costs a translation layer."],
    p: ["Rate limits that are too low make real synchronization jobs impossible, and too high let one client degrade the service.", "Round-tripping a page through the API drops block types the external schema cannot express."],
    v: "Create a page with an integration token, read it back, and confirm contents match; call the API for a page not shared with the integration and confirm denial; exceed the rate limit and confirm a retry-after response.",
    dep: ["serialization-format","permission-inheritance","block-store"]
  },
  "event-webhooks": {
    s: "A stream of workspace events, such as page created or property changed, delivered to subscribed outside systems as signed HTTP requests.",
    d: "Changes are recorded as events and queued for delivery to each subscriber's address, with a signature the receiver can verify. Delivery is at least once, so the same event may arrive twice, and retries back off for a bounded time. Events carry identifiers rather than full content, and receivers fetch details through the API. Events are filtered by the permissions of the subscription. It reads the change feed. It is hard to give ordering and no loss without making slow receivers block others.",
    k: ["Thin events with identifiers versus carrying full payloads: thin events avoid leaking content to the receiver, but make receivers fetch; full payloads are convenient and widen exposure.", "At-least-once delivery with retries versus best effort: retries prevent loss, but demand idempotent receivers."],
    p: ["A receiver that does not verify the signature accepts forged events.", "An unreachable receiver builds a retry backlog until the subscription is disabled with no notice to its owner."],
    v: "Subscribe a test receiver, edit a page, and confirm a signed event arrives and verifies; fail the receiver for an hour and confirm events are redelivered once it returns and a duplicate is distinguishable by its identifier.",
    dep: ["change-feed","public-api"]
  },
  "app-integrations": {
    s: "Connections to other services, such as chat, issue trackers, calendars and storage, that sync or embed their data in notes.",
    d: "An integration authenticates against the other service on the user's behalf, mapping external objects to blocks, mentions or database rows, and synchronizing in one or both directions. Some provide link previews and live status; others import records into a database. They run on the public API and webhooks with managed credentials. It is hard because two systems each have their own permissions and rate limits, and because two-way synchronization needs a conflict rule.",
    k: ["One-way import versus two-way sync: one-way is simple and safe, whereas two-way keeps both current but needs conflict handling and loops detection.", "Syncing with the connecting user's access versus a shared service account: user access respects external permissions, but a workspace-wide view needs a shared identity that can see more than some viewers should."],
    p: ["A shared service account exposes external records to workspace members who lack access in the source system.", "Revoked or expired credentials stop a sync without any visible warning."],
    v: "Connect a test service, change a record in both systems, and confirm the change flows according to the documented direction and conflict rule, and that expiring the credential shows a reconnect prompt to the owner.",
    dep: ["public-api","event-webhooks","rows-as-pages"]
  },
  "plugin-distribution": {
    s: "How extensions are published, discovered, installed, reviewed and updated, including version pinning and removal.",
    d: "A registry lists plugins with manifests, versions and requested capabilities. Installation downloads a signed package into the workspace or device, and updates follow a policy: automatic, approved or pinned. Administrators can restrict which plugins are allowed. Review may combine automated scans and human checks. It reads the plugin runtime and workspace membership. It is hard because an auto-updating plugin is a supply chain risk, and a review is a snapshot that a later version escapes.",
    k: ["Automatic updates versus pinned versions: automatic delivers fixes quickly, but lets a compromised release reach everyone; pinning is safer and leaves users on stale code.", "Curated registry versus open publishing: curation reduces malicious plugins and slows the ecosystem; open grows fast and needs strong sandboxing."],
    p: ["A new plugin version requests more capabilities, and automatic update grants them without asking again.", "An abandoned plugin keeps running with old permissions after its author has gone."],
    v: "Publish a plugin version that adds a capability, update from the prior version, and confirm the update is held pending approval; verify the signature of an installed package against the registry's published key.",
    dep: ["plugin-runtime","workspace-membership"]
  }
});
