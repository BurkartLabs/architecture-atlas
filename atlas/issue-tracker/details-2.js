// Details for the issue tracker plate, part 2: automation, item model, workflows, hierarchy and links.
ATLAS.details("issue-tracker", {
  "rule-engine": {
    s: "Runs customer-defined rules, each a trigger, conditions and actions, against events from the tracker, with ordering, isolation and execution limits.",
    d: "Rules are stored as structured definitions owned by a project or tenant. The engine subscribes to the event log, finds candidate rules through the trigger index, evaluates conditions against the item as it is now, and executes actions through the same write path as a user. Each run is logged with its outcome. Execution is queued and limited per tenant so one rule cannot starve others. Hard because rules are a second author of data: they race with users, can cascade into each other, and fail in ways their authors cannot see.",
    k: ["Run rules asynchronously vs inside the originating transaction: asynchronous runs never slow or fail a user edit; effects appear late and may act on a changed item.", "Act as a named rule actor vs as the rule owner: a rule actor makes history clear and survives staff changes; permission checks then need a separate model for what rules may do."],
    p: ["A rule fires on a stale snapshot, overwrites a value a person just entered, and no one can tell why.", "A broken rule fails silently on every event and its owner only finds out weeks later."],
    v: "Create a rule that sets a field when an item is created, create five items quickly, and confirm each has the value, the history shows the rule as actor, and the rule's log has five successful runs.",
    dep: ["trigger-matching", "rule-conditions", "rule-actions", "loop-protection", "event-log"]
  },
  "trigger-matching": {
    s: "Selects which rules should even be considered for an event, using an index of rules by event type, project and field so most events cost almost nothing.",
    d: "A rule declares triggers such as item created, field changed, status transitioned, comment added, or a manual button. When an event arrives, the matcher looks up rules for that event type and scope instead of scanning all rules, and compares the changed fields against the rule's field filter. Bulk operations and imports may be treated as one event or many, depending on the rule setting. Hard because events arrive in large numbers and the matcher is on the hot path of every write.",
    k: ["Index rules by event and scope vs scan all rules: matching stays cheap with thousands of rules; the index must be updated when rules change.", "One trigger per rule vs several: single triggers are simple to reason about; several reduce duplication but make conditions depend on which trigger fired."],
    p: ["A rule on field change triggers on a no-op edit that writes the same value, and runs needlessly.", "A rule is enabled but missing from the index after an edit and never fires."],
    v: "Create a rule triggered by a change of one specific field, edit a different field and confirm no run is logged, then edit the specific field and confirm exactly one run.",
    dep: ["event-log", "rule-engine"]
  },
  "rule-conditions": {
    s: "Filters a triggered rule with checks on the item, its related items, the actor and the changed values, written as comparisons and queries.",
    d: "Conditions test field values, compare old and new values, look at linked items or parents, test the user's group, and may run a query to check a set. They evaluate against the current state loaded when the run starts. A condition may use smart values that read from the triggering event. Hard because conditions that look at related items cost extra reads, queries inside conditions need permissions defined, and the evaluated state may differ from the state that caused the trigger.",
    k: ["Evaluate against the item now vs the item at trigger time: current state avoids acting on stale data; the condition may no longer describe what triggered the rule.", "Allow related-item lookups vs only the triggering item: lookups express real business rules; they add cost and dependency on data in other projects."],
    p: ["A condition referencing a deleted custom field evaluates to false forever and the rule looks healthy while doing nothing.", "A related-item lookup crosses into a project the rule's owner cannot see."],
    v: "Add a condition requiring a priority value and run the rule against items with and without it, confirming only matching items proceed and the log records the failed condition for the others.",
    dep: ["query-language", "field-definitions", "link-types"]
  },
  "rule-actions": {
    s: "The set of things a rule can do: edit fields, transition, create or link items, comment, notify, call a web address and run branches over related items.",
    d: "Each action is a typed step with templated inputs, drawn from smart values that read from the event and previous steps. Actions apply through the normal write path, so validation, permissions, history and notifications all happen as for a user. Branch actions loop over related items and run nested steps. Outbound calls are limited by timeout and size. Hard because actions chain, and an early failure leaves earlier steps applied with no automatic rollback.",
    k: ["Stop at first failure vs continue: stopping avoids acting on incomplete state; continuing makes best-effort progress but can leave items inconsistent.", "Actions through the normal write path vs a privileged shortcut: validation and history are consistent; actions can fail on rules the author did not expect, such as required fields."],
    p: ["A transition action fails a workflow guard and the rule reports success for the earlier steps only.", "A smart value that resolves to empty writes an empty string into a field and erases useful data."],
    v: "Run a rule with three actions where the second is guaranteed to fail, and confirm the log shows the first applied, the second failed with the reason, and the third skipped or run according to the setting.",
    dep: ["transitions", "field-definitions", "comments-and-mentions", "webhooks-outbound"]
  },
  "loop-protection": {
    s: "Stops runaway automation by limiting rule depth, repeat runs on the same item and run rate, and by marking changes made by rules.",
    d: "Each event carries the chain of rules that caused it and a depth count. The engine refuses to run a rule that already appears in the chain, caps the chain depth, and limits how many times one rule can run on one item within a window. Tenant-wide quotas on rule executions per interval bound the worst case, and a rule that trips a limit is paused and reported. Hard because legitimate cascades exist, and limits tight enough to stop loops can also stop correct chains.",
    k: ["Chain tracking vs only rate limits: chain tracking detects true cycles exactly; rate limits are simple and catch slow loops that chain tracking misses.", "Auto-disable a looping rule vs only skip runs: disabling stops the damage and demands attention; skipping keeps the rule alive but hides the defect."],
    p: ["Two rules in different projects trigger each other through a linked item and the loop is not detected because the chain is not propagated across projects.", "A quota exhausted by one noisy rule blocks the tenant's unrelated rules."],
    v: "Create two rules that each edit a field the other watches, trigger one, and confirm the run stops at the configured depth, the rule is flagged, and the item has a bounded number of history entries.",
    dep: ["rule-engine", "event-log", "rate-limiting"]
  },
  "scheduled-rules": {
    s: "Runs rules on a timetable or when a time-based condition is met, such as items untouched for a week, against the results of a query.",
    d: "A scheduled rule has a cron-like timetable and a query that selects target items. At each tick the engine runs the query as the rule's identity and executes actions on each result, in batches. Time-based triggers such as due-date-approaching are implemented as a scan over an indexed date field. Runs must be idempotent in effect: the second tick should not repeat an action on items it already handled. Hard because queries over large projects are heavy and many tenants schedule at midnight.",
    k: ["Scan by query at each tick vs timers per item: queries are simple and always current; per-item timers fire exactly but must be rescheduled whenever dates change.", "Spread start times with jitter vs run exactly on the minute: jitter protects shared capacity; users expect rules to run on the minute they asked for."],
    p: ["A rule that comments on stale items runs every night and re-comments the same items forever.", "Daylight-saving changes cause a rule to skip or double-run on the transition day."],
    v: "Schedule a rule for items not updated in seven days with a comment action, run it twice in a row, and confirm each qualifying item gets exactly one comment and the second run reports none.",
    dep: ["rule-engine", "query-compiler", "background-jobs"]
  },
  "item-types": {
    s: "Defines the kinds of work an item can be, such as bug, task or story, each with its own fields, workflow and place in the hierarchy.",
    d: "An item type is a named template that decides which fields appear, which workflow applies, which icon is shown, and what level it occupies in the hierarchy. A project enables a subset of types through a scheme. Changing an item's type is a migration: fields that exist only on the old type are kept, hidden or dropped, and the status may need mapping into the new workflow. Hard because types are the main customization surface, and their number grows until the project is hard to navigate and report on.",
    k: ["Many specific types vs few general types: specific types allow tailored fields and workflows; too many fragment reporting and confuse people choosing one.", "Types as hierarchy levels vs independent of it: levels give a clear rollup structure; independence lets any type sit anywhere but permits odd nesting."],
    p: ["Changing an item's type silently discards values from fields not present on the new type.", "Two projects define a type with the same name but different fields, and cross-project reports mix them."],
    v: "Move an item from a type with an extra field to one without it, and confirm the move shows a preview of lost data, maps status to the new workflow, and history records the type change with the old values.",
    dep: ["field-definitions", "workflow-schemes", "hierarchy-levels"]
  },
  "field-definitions": {
    s: "The catalog of fields an item can carry, each with a type, a name, an id and options, from which screens, queries and reports are generated.",
    d: "Every field, whether built in or custom, has a stable id, a display name, a data type, validation, and a default. Queries, workflows, rules and views refer to fields by id. The catalog drives the form renderer, the query language's operators, the index mapping and the API schema. Adding a field changes all of these. Hard because the catalog is shared by everything above it, and a field's type cannot be changed safely once values exist.",
    k: ["Fields by stable id vs by name: renames are safe; every export, API and query needs id to name translation.", "One global catalog with contexts vs per-project fields: a global catalog allows cross-project reporting; it grows into hundreds of near-duplicate fields without governance."],
    p: ["Hundreds of unused custom fields accumulate and slow the form renderer and every index mapping.", "Two fields with the same display name confuse users and queries, and imports map to the wrong one."],
    v: "Add a field of a new type, confirm it appears in the create form for the right projects, can be filtered with the query language, shows in the API schema, and appears in the search index mapping.",
    dep: ["custom-field-types", "field-contexts", "field-value-storage"]
  },
  "custom-field-types": {
    s: "The kinds of values a custom field can hold, such as text, number, date, single or multi select, user, cascading select and labels, each with its own validation and query operators.",
    d: "Each type defines how a value is validated, stored, rendered, indexed, compared and formatted for export. Select types keep a list of options with their own ids and ordering, and options can be disabled without removing values. Extension apps can supply new types by implementing the same contract. Hard because every type must be supported in every layer: edit control, bulk edit, import mapping, query operators, rollups and reports, and a gap in one produces a field that works in some places only.",
    k: ["A closed set of types vs extension-defined types: a closed set is complete and consistent; extension types let customers model anything but need a contract covering each layer.", "Option ids vs option text: renames and translation are safe; imports and exports need translation to text."],
    p: ["A number field stored as text sorts alphabetically in lists and reports.", "Deleting a select option leaves items with a dangling value that fails validation on the next edit."],
    v: "Create a multi-select field with three options, set values on items, query for one option, disable that option, and confirm existing items keep the value and are still returned by the query.",
    dep: ["field-definitions", "field-value-storage", "query-language"]
  },
  "field-contexts": {
    s: "Scopes a field to specific projects and item types, with its own default value and option list per scope.",
    d: "A context binds a field to a set of projects and types and supplies the options and default that apply there. Resolution picks the context matching the item's project and type, with a global fallback. The same field can offer different options in two projects while remaining one field for reporting. Hard because overlapping contexts must be rejected or ordered, the resolution runs on every form render, query and validation, and changing a context's scope orphans values for items that fall outside it.",
    k: ["Contexts on one field vs separate fields per project: one field supports cross-project queries; per-project fields are simple but cannot be reported on together.", "Reject overlapping contexts vs apply a priority order: rejection is unambiguous; priority allows incremental overrides but people forget which one wins."],
    p: ["Narrowing a context's scope leaves existing items with values the field no longer shows or validates.", "A default value changes in one context and applies to items created by imports that expected the old default."],
    v: "Create a field with two contexts having different option lists for two projects, and confirm each project's form shows its own list while a cross-project query on the field returns items from both.",
    dep: ["field-definitions", "item-types", "item-keys"]
  },
  "screens-and-layouts": {
    s: "Decides which fields appear on the create, edit and view forms for each item type and operation, and how they are grouped into tabs and panels.",
    d: "A screen is an ordered list of fields with sections. A scheme maps operations and item types to screens, so the create form can be shorter than the view form, and a transition can show a special screen. The renderer combines the screen with field contexts, permissions and current values to build each form. Hard because a field missing from a screen is effectively unreachable for users, required fields must appear on any screen that can create an item, and the three-way mapping of screens, types and operations is hard to inspect.",
    k: ["Separate screens per operation vs one screen for everything: tailored forms reduce noise; more screens means more places where a required field can be left out.", "Admin-configured layouts vs fixed layouts: layouts fit each team; changes can break integrations and instructions that assume a field is visible."],
    p: ["A required field is removed from the create screen and users can no longer create items at all.", "Hiding a field from the screen hides its value but it remains in exports and the API, leaking data."],
    v: "Remove a field from the create screen, create an item, and confirm the form omits it, the required-field check behaves as configured, and the field still appears on the view screen with its default value.",
    dep: ["field-definitions", "field-contexts", "item-types", "field-level-security"]
  },
  "rich-text-fields": {
    s: "Long-form fields such as descriptions and comments that hold formatted text, images, mentions and code blocks in a structured document format.",
    d: "Content is stored in a structured document tree or a restricted markup, not as raw HTML. A sanitizer and renderer convert it for display, email, export and the search index, and a converter handles older wiki-style markup from imports. Embedded images and files refer to attachments by id. Mentions and item keys are nodes, so they stay valid on rename. Hard because the same content is rendered in many places, user-supplied markup is an injection risk, and conversions between formats lose information.",
    k: ["Structured document tree vs HTML storage: nodes can be validated, searched and converted exactly; the format needs a versioned schema and a migration path.", "Sanitize on write vs on render: write-time cleaning stores safe data once; render-time sanitizing protects against older stored content and newer attack patterns."],
    p: ["Pasting content from a web page brings in styles or scripts that survive into stored content and render in email clients.", "Converting imported wiki markup drops tables and nested lists without any warning."],
    v: "Paste content with a script tag, a table and a mention, save, and confirm the stored form contains no script, the table and mention render in the page and email, and the search index holds the plain text.",
    dep: ["attachments", "field-value-storage", "comments-and-mentions"]
  },
  "attachments": {
    s: "Stores files uploaded to an item with type checks, size limits, scanning, thumbnails and access control tied to the item.",
    d: "An upload goes to a service that checks size and type, scans for malware, stores the bytes in object storage under a generated key, and records metadata on the item. Downloads go through the tracker so permission checks apply, then are served via short-lived signed addresses. Thumbnails and previews are generated asynchronously. Hard because files are large and untrusted, serving user content from the same origin as the application creates security issues, and removing access to an item must also remove access to its files.",
    k: ["Serve through the tracker vs direct signed storage addresses: proxying keeps checks simple; signed addresses offload bandwidth but remain valid until they expire.", "Scan before accept vs after: scanning first blocks bad files from ever being stored; scanning later is faster for the user but exposes a window."],
    p: ["A download link shared outside the tracker keeps working after the item is restricted because the signed address is long-lived.", "A file served with a guessed content type runs as a page and executes script in the tracker's origin."],
    v: "Upload a file, download it as a permitted user and a non-permitted user, and confirm the second is refused; restrict the item and confirm a previously issued link expires within the stated lifetime.",
    dep: ["attachment-storage", "item-level-security", "background-jobs"]
  },
  "item-keys": {
    s: "Gives each item a short human-readable identifier made of a project prefix and a sequence number, and ties items to the project that owns them.",
    d: "A project has a unique key prefix, and each new item takes the next number from a per-project counter, producing identifiers like a prefix and a number. Keys appear in commit messages, URLs, emails and conversation, so they must be unique, stable and parseable. Moving an item to another project assigns a new key and keeps the old one as an alias. The project also owns the schemes for workflow, fields and permissions. Hard because counters are a contention point and keys are copied into places the tracker cannot update.",
    k: ["Per-project counter vs global id: keys are short and readable; the counter needs atomic increments, and renames of the prefix need aliases for old keys.", "Keep old keys as aliases after a move vs break them: links in other systems keep working; the alias table must be queried on every key lookup."],
    p: ["Two concurrent creates read the same counter value and one fails or, worse, both succeed with the same key.", "Renaming a project prefix breaks every commit message link and bookmark that used the old one."],
    v: "Create ten items concurrently in one project and confirm the keys are consecutive and unique; move one to another project and confirm both the new and old keys open the same item.",
    dep: ["item-store", "field-contexts"]
  },
  "state-machine": {
    s: "The directed graph of statuses and allowed transitions that an item follows, defining what states exist and which moves between them are possible.",
    d: "A workflow lists statuses, each with a category such as to do, in progress or done, and transitions between them. The current status is a field of the item, and changing it is only possible by executing a transition. The state machine is queried by boards, rules, reports and the API to ask which moves are allowed from here. Hard because customers create large workflows with dozens of statuses, changing a workflow must account for items already in each status, and reports need categories to compare projects with different workflows.",
    k: ["Explicit transitions vs any-to-any status change: explicit transitions encode process and enable guards; any-to-any is simple but loses control and meaningful history.", "Status categories on top of statuses vs only custom statuses: categories give reports a common vocabulary; they add an indirection that people must configure."],
    p: ["Removing a status from a workflow strands items that are in it with no valid transition out.", "A workflow with one path in but none out of a status makes items impossible to close."],
    v: "Load a workflow definition and for each status list the permitted transitions; confirm the API returns the same list for an item in that status, and a request for a transition not in the list is rejected.",
    dep: ["field-definitions", "item-store"]
  },
  "transitions": {
    s: "Named moves between statuses that run guards, collect any required input and apply the new status, the resolution and side effects as one operation.",
    d: "Executing a transition loads the item, checks that the transition is valid from the current status, evaluates guards, shows or accepts the transition screen, validates required fields, writes the new status and any field changes, runs post-functions, and records one history entry. The check and write must be atomic against concurrent edits, so the item's status is compared with the expected one. Hard because the sequence mixes user input, validation and side effects, and a failure midway must not leave a partial change.",
    k: ["Check and write in one transaction vs optimistic concurrency: transactions hold locks and limit throughput; optimistic checks scale but must handle conflicts and return an error to retry.", "Transition screens for extra input vs only fields already on the item: screens collect data at the moment it matters; they add forms to maintain and complicate bulk and automated use."],
    p: ["Two people click the same transition at once and post-functions run twice.", "A transition used by a rule fails because it requires screen input that automation cannot supply."],
    v: "Execute a transition from two sessions at the same time and confirm exactly one succeeds, the other receives a conflict, history has one entry and post-function side effects ran once.",
    dep: ["state-machine", "transition-guards", "post-functions", "change-history"]
  },
  "transition-guards": {
    s: "Conditions and validators attached to a transition that decide who may take it and whether the item is complete enough to do so.",
    d: "Conditions limit visibility and availability: only a role, only the assignee, only when linked items are done. Validators run on execution and return messages: a field must be filled, a comment must exist, a field value must be consistent with another. Both evaluate against current item data and the user. Guards are evaluated when listing available transitions as well as when executing, which means they run often. Hard because guards depend on external data, such as linked items or build status, and the answer may change between display and execution.",
    k: ["Conditions that hide the transition vs validators that refuse with a message: hiding keeps the interface clean; refusing explains why and teaches the process.", "Guards in configuration vs guards as scripts: configuration is safe and auditable; scripts handle any rule but are hard to review, slow and a security risk."],
    p: ["A guard checking linked items runs a query per displayed transition, and boards with many cards become slow.", "A hidden transition leaves users unable to see why an item cannot move."],
    v: "Attach a validator requiring a comment, try the transition without and with a comment as the same user, and confirm the first returns the validator message with no state change and the second succeeds.",
    dep: ["transitions", "groups-and-roles", "link-types", "field-definitions"]
  },
  "post-functions": {
    s: "Side effects that run when a transition completes, such as assigning the item, setting a field, clearing the resolution, firing an event or updating related items.",
    d: "After the status write, an ordered list of steps runs: copy a value between fields, set the assignee to the reporter, update the parent, create a linked item, and always emit the event that notifications and rules consume. Built-in steps are mandatory and extensions or scripts can add more. Ordering matters because later steps read what earlier ones wrote. Hard because failures inside the list happen after the status changed, and anything with external effects is hard to undo.",
    k: ["Run inside the transition's transaction vs after commit: inside keeps state consistent and rolls back as one; after commit allows slow or external effects but risks partial completion.", "Fixed built-in order vs user-controlled order: fixed order protects invariants; user order is flexible and easy to misconfigure."],
    p: ["A post-function that calls an external service times out and either blocks the transition or fails after the status already changed.", "A step that clears the assignee runs before one that reads it and the notification goes to nobody."],
    v: "Add a post-function setting a field to the current user on a transition, perform it as two different users, and confirm each result and a single history entry containing both the status and the field change.",
    dep: ["transitions", "event-log", "field-definitions"]
  },
  "resolution-fields": {
    s: "A field that records why an item is closed, such as fixed or duplicate, and whose presence defines whether work is done independently of status names.",
    d: "Status categories tell reports whether an item is finished; a resolution adds the reason. Transitions into a done category set it, transitions out clear it. An item with an empty resolution is unresolved, and queries, boards and reports rely on that property or on the category. The two concepts overlap, and trackers differ in which one is authoritative. Hard because stored resolution and category can disagree after a workflow change, and reports that use one while queries use the other give different answers.",
    k: ["Resolution field plus category vs category only: a resolution explains the outcome and supports reports on duplicates and rejects; two sources of truth can disagree.", "Clear resolution on reopen vs keep it: clearing keeps unresolved queries correct; keeping preserves the earlier outcome in the data but not in history."],
    p: ["A migration moves items to a done status without setting a resolution, and they show up as open in queries that test the field.", "A reopened item keeps its old resolution and is hidden from every unresolved filter."],
    v: "Close an item through a transition that sets a resolution, reopen it through another, and confirm the unresolved query includes it again while history records both the set and the clear.",
    dep: ["state-machine", "transitions", "field-definitions"]
  },
  "workflow-schemes": {
    s: "Maps item types to workflows for a project, so each kind of work in a project follows its own process.",
    d: "A project is associated with a scheme, and the scheme assigns a workflow to each item type with a default. Many projects share one scheme so an organization can change a process in one place. Changing a scheme for a project with existing items requires mapping each old status to a new one and migrating the items, which can be long and cannot be rolled back easily. Hard because sharing makes change global, while not sharing leads to many near-identical copies.",
    k: ["Shared schemes across projects vs per-project copies: one change updates all; a change that suits one team breaks another's process.", "Migration with a status mapping wizard vs forbidding change when items exist: migration lets the process evolve; it needs a long-running, observable and partly reversible job."],
    p: ["Editing a shared workflow to fit one team removes a status another team's items sit in.", "A scheme migration is interrupted halfway and items are left in statuses of the old workflow."],
    v: "Switch a test project to a new scheme with a status mapping, and confirm every item ends in a mapped status of the new workflow, history records the migration, and the count per category is unchanged.",
    dep: ["state-machine", "item-types", "background-jobs"]
  },
  "workflow-versioning": {
    s: "Keeps drafts and published versions of a workflow so edits can be reviewed and applied without disturbing items already in flight.",
    d: "Editing a live workflow creates a draft copy. When published, the system checks that every status used by items is still present or mapped, then swaps the active version atomically and records who changed what. History keeps the version in effect at the time of each transition, so old entries remain interpretable. Hard because the swap must be atomic across caches on many servers, drafts can be stale relative to concurrent changes, and the rollback of a bad publish needs the previous version retained.",
    k: ["Draft and publish vs live editing: a draft allows review and testing; live editing is quick but a half-finished edit affects everyone immediately.", "Keep every version vs only the current: versions let history and rollback be exact; they accumulate and must be pruned."],
    p: ["Two administrators edit drafts of the same workflow and the second publish discards the first one's changes.", "Servers cache the old workflow for minutes after a publish and offer transitions that no longer exist."],
    v: "Edit a draft that removes a transition, publish it, and confirm all servers stop offering that transition within the cache lifetime and the audit log records the publisher and the diff.",
    dep: ["state-machine", "audit-log", "backward-compatible-config"]
  },
  "hierarchy-levels": {
    s: "Defines how items nest, from large initiatives down through epics and stories to sub-tasks, and which parent-child pairs are allowed.",
    d: "The tracker has a configured ordered list of levels, each with item types, and a parent link on each item points to one item in a higher level. Sub-tasks are often a special lowest level that cannot exist without a parent. Moving an item re-parents it and must validate the level rule. Hierarchies can extend across projects. Hard because parent and child may be in different projects with different permissions, and tools built for a fixed three levels break when administrators add more.",
    k: ["Configurable levels vs fixed epic-story-task: configurable levels fit varied organizations; every view and report must handle an arbitrary depth.", "Single parent vs multiple parents: a single parent keeps rollups unambiguous; multiple parents model shared work but double-count in totals."],
    p: ["Deleting a parent leaves orphans that appear in no hierarchy view.", "A cross-project parent is visible to a user who cannot see the child, leaking the child's count."],
    v: "Create a three-level chain, try to set a story as the parent of an epic, and confirm the change is rejected by the level rule while a valid re-parent updates the child's path and the hierarchy view.",
    dep: ["item-types", "item-store", "permission-schemes"]
  },
  "rollups": {
    s: "Aggregates values from child items into the parent, such as total estimate, percent complete, earliest start and latest due date.",
    d: "A rollup is a computed field defined over a relation: sum, count, min, max or a ratio of done children. Values are stored on the parent and updated when a child changes, or computed at read time. Updating on write requires walking up the ancestor chain, which is the costly case when a high-level parent has thousands of descendants. Hard because rollups are derived data that must stay correct under moves, deletions and concurrent child edits, and because permissions hide some children from some viewers.",
    k: ["Store rollups and update on change vs compute on read: stored values are fast to query and sort; they must be maintained and repaired when events are lost.", "Roll up visible children only vs all children: per-viewer values are safe but not cacheable; global values are cheap and may expose hidden work."],
    p: ["A child moved to another parent is not subtracted from the old parent's total.", "A deep hierarchy causes every child edit to write to a long chain of ancestors, creating lock contention on the top item."],
    v: "Create a parent with three children of known estimates, mark one done, move one to a different parent, and confirm both parents' totals and percent complete match hand-calculated values immediately.",
    dep: ["hierarchy-levels", "field-value-storage", "event-log"]
  },
  "link-types": {
    s: "Named relationships between items, such as blocks, duplicates and relates to, each with directional wording and rules for what the link means to workflows and reports.",
    d: "A link has a type with an outward and inward name, so one stored edge reads as blocks from one side and is blocked by from the other. Links can cross projects and, with remote links, point at external objects. The tracker uses types in conditions and rules, for example refusing to close an item blocked by an open one. Marking a duplicate may close the item and merge watchers. Hard because the same edge is displayed, queried and permission-checked from both ends.",
    k: ["One stored edge with two names vs two stored edges: one edge cannot disagree with itself; queries must be able to follow it in either direction.", "Links that act on workflow vs descriptive only: behavioral links enforce process; they surprise users when an unrelated link blocks a close."],
    p: ["A link to an item in a project the viewer cannot see shows its title in the link list.", "Marking items as duplicates in a chain creates confusion about which item is canonical."],
    v: "Create a blocks link from item A to B, confirm B shows blocked by A, query for items blocked by an unresolved item returns B, and resolving A removes B from that query result.",
    dep: ["item-store", "permission-schemes", "dependency-graph"]
  },
  "dependency-graph": {
    s: "Treats blocking and ordering links as a graph so the tracker can show chains, find critical paths and warn when a plan contradicts a dependency.",
    d: "Edges of dependency link types form a directed graph over items. Queries traverse it to list everything that blocks or is blocked by an item, to a limited depth. Planning views combine the graph with dates to flag items scheduled before their blockers finish. Graph walks are done against the link store with a depth limit, or against a derived adjacency index. Hard because chains can be long and cross projects with different permissions, and answering how many items are affected by a delay needs transitive closure.",
    k: ["Walk the link table on demand vs maintain a closure index: on-demand walks are simple and current; a closure index makes impact queries fast and must be repaired on every edge change.", "Depth-limited traversal vs full traversal: limits protect the service; users get an incomplete answer that must be labeled as such."],
    p: ["A transitive query across a large hierarchy times out and the view shows a partial chain as if it were complete.", "Hidden items in the middle of a chain break the path, and the viewer sees two unrelated items."],
    v: "Build a chain of five blocking links, close the first item, and confirm the downstream view shows four items, the next one unblocked, and a date conflict flagged if the next starts before the first ended.",
    dep: ["link-types", "cycle-prevention", "permission-schemes"]
  },
  "cycle-prevention": {
    s: "Rejects links and parent changes that would create a loop, such as A blocks B blocks A or an item becoming its own ancestor.",
    d: "Before saving a directional link or re-parent, the service walks from the target along the same relationship to see whether it reaches the source. If so the write is refused with a message naming the path. The check and the insert must be atomic or concurrent writes can each pass the check and together form a cycle. Hard because the walk can be long, because simultaneous edits race, and because imported data may already contain cycles that downstream code must tolerate.",
    k: ["Check on write vs detect later in a background job: write-time checks prevent bad data; the check is costly in a deep graph and needs locking against concurrent edits.", "Refuse imported cycles vs import and flag: refusing keeps data clean; flagging allows migration to complete and requires every consumer to handle cycles."],
    p: ["Two users add opposing links at the same moment and both pass the check, creating a loop that makes rollups recurse forever.", "A migrated project contains cycles from the old system and crashes timeline rendering."],
    v: "Attempt to create A blocks B, B blocks C and C blocks A, and confirm the third write is refused naming the path; then issue two opposing writes concurrently and confirm exactly one is accepted.",
    dep: ["link-types", "hierarchy-levels", "item-store"]
  },
  "releases-and-versions": {
    s: "Named milestones and components that items are assigned to, with dates and release status, used to plan, group and report on what ships when.",
    d: "A release object has a name, dates and a state such as unreleased or released, and items link to it through fix-version and affects-version fields. Components divide a project into parts with default owners. Releasing a version may check that its items are complete and move leftovers to the next version. Release notes are generated from the items. Hard because several fields point at the same object, because version names are reused across projects, and because integrations from build systems must create and mark releases consistently.",
    k: ["Versions per project vs shared across projects: per project is simple; shared versions let one release span several projects and need ownership rules.", "Release notes generated from item data vs written by hand: generated notes stay accurate and cost no effort; they are only as good as item titles."],
    p: ["Releasing a version with unfinished items leaves them pointing at a closed release that nobody reviews.", "Two projects create a version with the same name and a cross-project query merges them."],
    v: "Create a release with five items, mark four done, release it with the leftover moved, and confirm the notes list four, the leftover now points at the next version and history records the move.",
    dep: ["field-definitions", "item-keys", "build-and-deploy-status"]
  },
});
