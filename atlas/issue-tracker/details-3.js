// Details for the issue tracker plate, part 3: permissions and audit, integrations, imports and exports.
ATLAS.details("issue-tracker", {
  "groups-and-roles": {
    s: "The identities permissions are granted to: individual users, groups synced from a directory, and project roles that mean different people in each project.",
    d: "Users come from a directory or local accounts and belong to groups. A project role such as developer or viewer is a named slot filled per project with users and groups, so a permission scheme can say that developers may edit without naming anyone. Membership is resolved at check time with caching. Directory sync adds and removes members. Hard because nested groups, deactivated accounts and sync delay all change who can do what, and every permission check expands membership, so it sits on the hottest path in the product.",
    k: ["Project roles as an indirection vs granting to groups directly: roles let one scheme serve many projects; the effective access of a person requires resolving role membership per project.", "Cache membership with a short lifetime vs resolve every check: caching keeps checks fast; revocation takes effect only after the lifetime ends."],
    p: ["A user removed from the directory keeps access until the next sync because deactivation is not pushed.", "Nested groups form a cycle or very deep chain and membership expansion becomes slow or loops."],
    v: "Add a user to a group that fills a project role, confirm they can perform the role's actions, remove them, and confirm access ends within the stated cache lifetime in the interface, search and the API.",
    dep: ["tenant-isolation"]
  },
  "permission-schemes": {
    s: "Reusable sets of rules mapping actions such as browse, create, edit, transition and delete to the roles, groups and dynamic holders that may perform them.",
    d: "A scheme lists permissions, each granted to holders: a role, a group, the item's assignee or reporter, or a custom rule. Projects reference a scheme, so one change applies to many. A check takes the user, the action and the item, finds the project's scheme, and evaluates the holders, including dynamic ones that depend on the item. Results feed queries, boards, search, notifications and the API. Hard because dynamic holders require the item to be loaded, because the same logic must be expressible as a query filter, and because deny-by-default is easily bypassed in some code path.",
    k: ["Allow-only grants vs allow and deny rules: allow-only is easy to reason about; deny rules express exceptions but make the effective result hard to predict.", "Shared schemes vs per-project schemes: shared schemes give consistent governance; one change affects every project that uses the scheme."],
    p: ["A new feature adds an endpoint that skips the scheme check and exposes items through it.", "A grant to the reporter lets someone who created an item and then lost project access keep editing it."],
    v: "Remove the edit permission from a role, then attempt an edit through the interface, the API, a bulk edit and an automation rule acting as that user, and confirm all four are refused.",
    dep: ["groups-and-roles", "item-store"]
  },
  "field-level-security": {
    s: "Restricts who can read or change particular fields, such as cost or customer data, independent of access to the item as a whole.",
    d: "A field can be marked as visible or editable only to certain roles or groups. The check applies when serializing an item for display, for the API, in exports, in notifications and in search. Queries on a hidden field must be refused or must return no information. History entries for the field are filtered too. Hard because fields leak through many side channels: sorting, counts, autocomplete, email text, charts and logs, and each must apply the same rule.",
    k: ["Enforce at serialization vs at the data layer: serialization is simple to add to one output; enforcing at the data layer prevents leaks from new outputs but touches every query path.", "Hide the field entirely vs show a placeholder: hiding leaks nothing; a placeholder tells the viewer that something exists but may be needed to explain a validation error."],
    p: ["A hidden field is excluded from the item page but appears in the CSV export and in the history tab.", "A query with a filter on the hidden field lets a user infer values by observing whether items match."],
    v: "Mark a field as restricted, then as an unprivileged user look for its value on the item page, API, export, email, history, search and by filtering on it, and confirm none reveal it.",
    dep: ["permission-schemes", "field-definitions", "change-history"]
  },
  "item-level-security": {
    s: "Hides individual items from people who otherwise have project access, through security levels or per-item restrictions set at creation or later.",
    d: "An item may carry a security level, a named restriction whose members are defined by a scheme. Checks combine project permission with level membership. Child items, links, comments and notifications must honor the level of the item they belong to. Changing the level triggers reindexing and recomputation of what watchers may see. Hard because level membership must be included in every query as a filter, derived counts and rollups must not reveal restricted items, and a level change must propagate to every derived copy.",
    k: ["Security levels as named sets vs per-item access lists: named sets are manageable and easy to audit; per-item lists give precise control at a cost in storage and administration.", "Level inherited by sub-items vs set separately: inheritance prevents leaks; it surprises users when a child needs a different audience."],
    p: ["Raising an item's level does not remove existing watchers, who continue to receive details by email.", "A rollup on a parent counts restricted children, letting viewers infer their existence and size."],
    v: "Restrict an item to a group, then as a non-member check the item URL, search, board, parent rollup, activity feed and notifications, and confirm the item appears nowhere and the rollup excludes it.",
    dep: ["permission-schemes", "groups-and-roles", "search-permission-filtering"]
  },
  "audit-log": {
    s: "An append-only record of administrative and security-relevant actions, such as permission changes, scheme edits, logins and exports, for review and compliance.",
    d: "Each entry records who, what, when, from where and the before and after of the changed object. It is distinct from item history, which records data edits. Entries are written in the same transaction as the change or through a durable queue, stored append-only, and exposed with filters and export to external monitoring systems. Hard because it must be complete, a missed code path is an undetectable gap, tamper-evident, and retained for years while the volume grows.",
    k: ["Write in the same transaction vs asynchronously: transactional writes cannot be lost when the change succeeds; they add latency and a failure mode to every administrative action.", "Log at the service layer vs at the data layer: service-layer entries are meaningful to humans; data-layer capture catches every change but lacks intent."],
    p: ["A bulk administrative operation writes one summary entry and loses who changed each item.", "Entries record scheme ids only, and after deletion nobody can tell which scheme was modified."],
    v: "Change a permission scheme, add a user to a role and export data, then confirm three entries exist with actor, time, source address and before and after values, and that no operation in the audit API can alter them.",
    dep: ["event-log", "retention-and-deletion", "tenant-isolation"]
  },
  "retention-and-deletion": {
    s: "Policies for how long items, comments, history and attachments are kept, and how deletion requests are honored without breaking links and reports.",
    d: "Customers choose between soft deletion, which hides an item and allows restore, and permanent removal. Retention jobs purge items older than a window, and privacy requests remove a person's content or anonymize their identity in history. Deletion has to cascade to attachments, search indexes, caches, backups and exports according to policy. Hard because deletion conflicts with audit and history, references to deleted items remain in links and commits, and derived data such as metrics is built from the removed content.",
    k: ["Soft delete with later purge vs immediate removal: soft deletion recovers mistakes; data stays around, appears in unexpected queries and complicates privacy promises.", "Anonymize authors vs delete their content: anonymizing keeps threads intelligible; deleting honors strict requests but leaves gaps in conversations."],
    p: ["A deleted item remains in the search index or cached views and can still be opened by direct link.", "Purging attachments without checking references leaves broken images in other items."],
    v: "Delete an item and an attachment, then confirm the item vanishes from the interface, search, API and feeds, the file is unreachable by an old link, and the purge job later removes the stored object.",
    dep: ["item-store", "attachment-storage", "search-index-pipeline", "backup-restore"]
  },
  "tenant-isolation": {
    s: "Ensures each customer's data, configuration and load stay separate in a shared service, through scoping on every query and separate keys, quotas and storage paths.",
    d: "Each request is bound to a tenant identity that scopes every database query, cache key, index document, object path and background job. The tenant id is part of every key and is applied below application logic, in a data access layer or row-level policy, so a missing filter cannot be written by accident. Quotas bound each tenant's resource use. Encryption keys may be per tenant. Hard because one missing tenant filter leaks data between customers, and noisy tenants consume shared capacity.",
    k: ["Shared tables with a tenant column vs separate databases per tenant: shared tables use resources efficiently and scale to many small tenants; separate databases isolate strongly but multiply operations.", "Enforce scoping in a data layer vs in each query: central enforcement makes omissions impossible; it complicates legitimate cross-tenant administration."],
    p: ["A cache key built without the tenant id returns one customer's page to another.", "A background job processes a message without restoring the tenant context and runs with elevated scope."],
    v: "Create identical item keys in two tenants, request one's items with the other's credentials through the API, search, cache and file download paths, and confirm every path returns nothing or an authorization error.",
    dep: []
  },
  "commit-linking": {
    s: "Associates commits and branches with items by recognizing item keys in messages and branch names, and shows them on the item.",
    d: "A code host sends push events to the tracker or the tracker polls it. A parser scans commit messages and branch names for item keys, creates a link record between item and commit with author, time and file summary, and shows development activity on the item. Smart commit syntax may also add comments or transitions. Hard because key patterns appear in unrelated text, history can be rewritten by rebases, hosts differ in event formats, and each link must respect which repositories and items the viewer may see.",
    k: ["Parse keys from messages vs explicit linking in the host: parsing needs no extra steps from developers; false matches and mistyped keys create wrong links.", "Smart commands in messages vs separate actions: commands save clicks; they let anyone with commit rights drive workflow without the transition's permission checks unless mapped to a user."],
    p: ["A rebase or squash changes commit ids and the item keeps links to commits that no longer exist.", "A pattern such as a library name and version number matches a project key and links unrelated commits."],
    v: "Push a commit with an item key in its message and a branch named with another key, and confirm both items show the commit with author and time, and a commit mentioning a nonexistent key creates no link.",
    dep: ["item-keys", "webhooks-outbound", "oauth-and-tokens", "event-log"]
  },
  "pull-request-sync": {
    s: "Reflects the state of code review on the item, showing open, merged or declined pull requests, and can move the item when review state changes.",
    d: "Events from the code host about pull requests are matched to items by key in the title, description or branch. The tracker stores a summary with state, reviewers and checks, and updates it on each event. Rules can then transition the item when a pull request opens or merges. Events may arrive out of order or be duplicated, so updates carry versions or timestamps. Hard because authorization to the host is per user or per installation, and a missed event leaves the item showing a stale state.",
    k: ["Event-driven updates vs periodic reconciliation: events are fast and cheap; missed deliveries need a reconciliation pass to repair state.", "Transition on merge by rule vs by people: automation keeps the board honest; a merge does not always mean released or verified."],
    p: ["Out-of-order events show a merged request as open again.", "A pull request with several item keys moves all of them to done when it merges, including partly finished ones."],
    v: "Open, update, close without merging and reopen a pull request mentioning one key, and confirm the item's development panel shows each state in order and a replayed older event does not revert the latest.",
    dep: ["commit-linking", "rule-engine", "idempotent-events"]
  },
  "build-and-deploy-status": {
    s: "Receives build, test and deployment results from delivery systems and attaches them to the items and releases they contain.",
    d: "A build system posts events that carry commit ids or item keys and the status of a pipeline or deployment to an environment. The tracker maps them to items via commit links, shows the state on the item and release, and may mark a version as released when a production deployment succeeds. Rules and guards can read this state. Hard because identity of what shipped is indirect, through commits to items, and because deployments to several environments produce many states for one item.",
    k: ["Link by commits vs by explicit item list in the event: commits are automatic; an explicit list is exact but requires the pipeline to supply it.", "Show latest status per environment vs full history: latest status is compact and answers what is live where; history helps investigations."],
    p: ["A rollback is recorded as a successful deployment and items appear released when they are not live.", "Events from a pipeline without credentials checks let anyone post a fake successful deployment."],
    v: "Send a signed deployment event for a commit linked to an item, confirm the item shows production as deployed with time and build link, and that an unsigned event is rejected and logged.",
    dep: ["commit-linking", "releases-and-versions", "oauth-and-tokens"]
  },
  "webhooks-outbound": {
    s: "Posts signed JSON events to customer-supplied addresses when items change, with filtering, retries, ordering hints and delivery logs.",
    d: "A subscription names an event set, optionally a query to filter items, and a target address with a secret. The dispatcher builds a payload from the event, signs it with the secret, delivers it with a timeout, and retries failures with backoff before disabling the target. Delivery logs show attempts and responses. Hard because payloads must respect permissions of the subscription's owner, delivery is at-least-once and unordered, and targets can be slow, malicious or internal addresses, which makes server-side request forgery a real risk.",
    k: ["At-least-once with idempotency keys vs best effort: receivers can process exactly once with the key; the sender must keep and retry events, which costs storage and queueing.", "Block internal addresses vs allow any target: blocking prevents the tracker from being used to probe the network; it forbids legitimate on-premises receivers unless an allowlist exists."],
    p: ["A target that returns errors for days is retried constantly and wastes queue capacity.", "A redirect from a public address to an internal one bypasses the address check."],
    v: "Subscribe to item-created, create an item, and confirm one signed delivery arrives with a valid signature; make the target fail twice and confirm retries with the same event id, then success, and the log shows three attempts.",
    dep: ["event-log", "background-jobs", "rate-limiting", "idempotent-events"]
  },
  "app-framework": {
    s: "Lets third parties extend the tracker with new panels, fields, gadgets, workflow functions and automation actions, running in isolation with declared permissions.",
    d: "An extension declares its modules and the scopes it needs in a manifest. The platform loads its interface in a sandboxed frame or runs its code in a restricted runtime, mediates calls to the tracker's API using the installing tenant's scopes, and meters usage. Installation is per tenant, upgrades are versioned, and the platform can disable a misbehaving extension. Hard because untrusted code touches customer data, every extension point is a long-term compatibility promise, and a slow extension in a hot path slows the host.",
    k: ["Out-of-process extensions calling the API vs in-process plugins: out-of-process contains failures and security issues; in-process is faster and more powerful but can crash or leak across tenants.", "Fine-grained scopes vs broad access: narrow scopes limit damage; many scopes burden developers and users approving them."],
    p: ["An extension module on the issue view loads slowly and delays the whole page.", "An upgrade requests broader scopes and is auto-approved for tenants that never reviewed the change."],
    v: "Install an extension that adds a panel with a read-only scope, confirm it shows data, then attempt a write through it and confirm the platform refuses and logs the denied call.",
    dep: ["rest-api", "oauth-and-tokens", "custom-field-types", "tenant-isolation"]
  },
  "oauth-and-tokens": {
    s: "Authorizes integrations and scripts through delegated grants and revocable personal tokens with scopes, expiry and audit.",
    d: "Integrations register as clients and are granted access by a user or administrator through an authorization flow that issues short-lived access tokens and refresh tokens. Scripts use personal or service-account tokens. Each token carries scopes and acts as an identity subject to the permission model. Tokens can be listed, expired and revoked, and use is logged. Hard because secrets leak into repositories and logs, a token acts with its owner's rights unless scoped, and revocation must take effect across all servers promptly.",
    k: ["Short-lived tokens with refresh vs long-lived tokens: short lifetimes limit exposure; clients must handle refresh and failure, so scripts often ask for long-lived ones.", "Tokens act as users vs as separate service accounts: acting as a user is easy; service accounts survive staff changes and are visible in audit."],
    p: ["An integration token created by an employee stops working when the employee's account is deactivated, breaking a production pipeline.", "A token committed to a public repository stays valid for months with no scope limits."],
    v: "Issue a token with a read-only scope, call a read endpoint and a write endpoint, confirm the write is refused, then revoke the token and confirm the next read fails within the stated propagation time.",
    dep: ["groups-and-roles", "permission-schemes", "audit-log"]
  },
  "rest-api": {
    s: "A versioned HTTP interface exposing items, fields, transitions, queries and configuration as JSON, with pagination, expansion and consistent errors.",
    d: "Resources map to items, projects, fields, workflows and so on, using standard methods and status codes. Search endpoints accept the query language and return pages by cursor. Field values are exchanged by field id with the schema available through a metadata endpoint. Writes go through the same validation and permission paths as the interface. Hard because the API is a compatibility contract with thousands of scripts, so changes need versions and deprecation windows, and because custom fields make the shape of an item depend on the tenant.",
    k: ["Field ids in payloads vs field names: ids are stable across renames; callers must look them up before they can build requests.", "Cursor pagination vs offsets: cursors stay consistent when data changes and scale; offsets are simple and let clients jump to a page but skip or repeat items."],
    p: ["A client reads a page, items are edited in between, and the next page repeats or skips items.", "An endpoint returns a field the caller cannot see in the interface because the API path skipped the serializer's checks."],
    v: "Fetch the schema, create an item with a custom field by id, fetch it back, paginate a result set of three hundred items with concurrent edits, and confirm no duplicate keys and no permission-restricted fields appear.",
    dep: ["field-definitions", "query-compiler", "permission-schemes", "rate-limiting"]
  },
  "csv-import": {
    s: "Creates or updates items from a spreadsheet file by mapping columns to fields, with parsing rules for dates, users, select options and multi-value cells.",
    d: "The user uploads a file, previews it, maps each column to a field, and sets conversion options such as date format and delimiter. The importer parses rows, resolves users and options by name or id, validates each row with the same rules as manual entry, and queues the creation. Rows can create parents before children through a reference column. Results list created, updated and failed rows. Hard because spreadsheets are ambiguous: encodings, quoting, dates, and names that match several users or options.",
    k: ["Validate everything before creating vs create valid rows and report failures: pre-validation avoids partial imports; it needs a full pass and cannot catch problems that arise only at write time.", "Match options and users by name vs by id: names are what people have in spreadsheets; ids are exact and names can be duplicated."],
    p: ["A date column in a regional format is parsed with the wrong order and every date is silently wrong.", "A retry of a failed import creates duplicates of the rows that already succeeded."],
    v: "Import a file of fifty rows with a bad date in three, mapped to fields with a parent reference column, and confirm forty-seven items are created with correct parents, three failures list row and reason, and re-running skips the created ones.",
    dep: ["field-definitions", "import-validation", "background-jobs", "item-keys"]
  },
  "migration-mapping": {
    s: "Translates another tracker's projects, statuses, fields, users and link types into this tracker's configuration before bringing data across.",
    d: "A migration reads the source system through its API or a dump, analyses its configuration, and proposes a mapping: source statuses to workflow statuses, custom fields to fields and contexts, link types, and users by email. The administrator edits the mapping, then runs a trial import into a staging tenant. A final cutover applies an incremental update to pick up changes since the trial. Hard because the models never match exactly, some concepts have no equivalent, and a mapping error is multiplied across every item.",
    k: ["Map to existing configuration vs generate new configuration: mapping to existing keeps the target tidy; generating preserves the source's meaning and can pollute the target with unused fields.", "Trial run plus incremental cutover vs one-time big bang: trials find mapping errors cheaply and shorten the freeze; they add steps and require a way to sync deltas."],
    p: ["Users are matched on display names and a former employee's work is attributed to a different person with the same name.", "Source statuses with no counterpart are mapped to the first status, and finished work reappears as new."],
    v: "Run a trial migration of a sample project, then compare per-status counts, per-user assignments, link counts and a sample of fifty items field by field against the source, and confirm all match or are listed as known differences.",
    dep: ["csv-import", "history-preservation", "field-contexts", "workflow-schemes"]
  },
  "bulk-export": {
    s: "Produces files or streams of items, comments, history and attachments for backup, analysis or leaving the product, honoring permissions and field security.",
    d: "An export job runs a query as the requesting user, streams items into a file, and may include comments, history and attachments in a package. Large exports run in the background and produce a time-limited download. A full-tenant export for administrators covers all projects and configuration. Alongside it, incremental feeds provide changes since a cursor for data warehouses. Hard because exports must scale to millions of items without exhausting memory, and every output path must respect field and item security.",
    k: ["Streaming from a snapshot vs live paging: a snapshot is consistent and costs storage and time; live paging is cheap and can miss or repeat items edited during the export.", "Export as the requesting user vs as an administrator: user-scoped exports respect permissions; complete exports for migration need elevated rights and careful auditing."],
    p: ["A large export holds a long transaction that blocks cleanup and slows the database.", "The download address is guessable or never expires, and the file of customer data stays reachable."],
    v: "Export a project with restricted fields and items as a user without access to them, and confirm the file omits those, the header lists fields by id and name, and the download link expires at the stated time.",
    dep: ["query-compiler", "field-level-security", "background-jobs", "audit-log"]
  },
  "import-validation": {
    s: "Checks imported data against the target configuration before and during import, reporting each problem with row, field and a suggested fix.",
    d: "Validation reuses the rules of manual entry: required fields on the target screens, option lists, workflow statuses, permission to create, user existence, uniqueness of keys, and valid links. It runs as a dry run that produces a report, and again during the real import because the data or configuration may change in between. Errors are grouped by cause so one mapping fix resolves hundreds of rows. Hard because validation depends on tenant configuration, and imports may need to bypass rules, such as creating items in a state that normal transitions cannot reach.",
    k: ["Same rules as the interface vs relaxed import rules: identical rules keep data consistent; relaxed rules make historical data importable but create items that cannot be edited normally.", "Fail on first error vs collect all: collecting errors lets people fix a file once; it needs more memory and care to avoid cascading messages."],
    p: ["A dry run passes, the configuration changes before the real run, and the import fails halfway.", "Hundreds of errors are listed individually and the single mapping mistake behind them is not visible."],
    v: "Run a dry run on a file with a missing required field in ten rows and an unknown user in five, and confirm the report groups them as two causes with row numbers and that no items were created.",
    dep: ["field-definitions", "permission-schemes", "state-machine", "screens-and-layouts"]
  },
  "history-preservation": {
    s: "Keeps original creation dates, authors, comments, status changes and key mappings when data is imported, so imported items look like they were always there.",
    d: "The importer can write items with historical timestamps and authors, replay status changes into the history store, and attach comments with their original author and time. It records a mapping from source ids to new keys so links and references can be rewritten. Users who no longer exist become placeholder identities. Hard because normal write paths stamp the current time and actor, so imports need a privileged path that bypasses side effects such as notifications and rules, while still producing correct indexes and derived data.",
    k: ["Replay history as events vs store it as imported text: replay supports metrics such as cycle time; text is simpler and cannot feed reports.", "Placeholder users for missing authors vs attribute to the importer: placeholders keep attribution meaningful; attributing to the importer is simple and misleads reviewers."],
    p: ["An import triggers notifications and rules for every historical event and floods customers.", "Imported items have no change history and cycle-time reports for the migrated period show nothing."],
    v: "Import items with a creation date from three years ago and a recorded status history, and confirm created dates and authors are preserved, cycle-time reports include them, and no notification or rule ran.",
    dep: ["change-history", "item-store", "rule-engine", "notification-rules"]
  },
});
