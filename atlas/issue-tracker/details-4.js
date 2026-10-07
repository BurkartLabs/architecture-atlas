// Details for the issue tracker plate, part 4: storage, scaling and operations, and cross-cutting concerns.
ATLAS.details("issue-tracker", {
  "item-store": {
    s: "The source of truth for items: identity, type, project, core fields, status and timestamps, held in a transactional store with strict constraints.",
    d: "Each item row holds the stable id, key, project, type, status, creator and times, plus a version number used for optimistic concurrency. Writes go through a service that validates, checks permissions, writes the row and its history entry and the event in one transaction. Reads are served from the store, caches and indexes. It must stay small and strict because every other store is derived from it. Hard because every feature needs another column or relation, the table grows to hundreds of millions of rows, and custom fields must not make it unwieldy.",
    k: ["Core fields as columns and custom fields elsewhere vs everything in one document: columns are fast to index and constrain; documents are flexible and make cross-item queries and constraints difficult.", "Optimistic version check vs row locks: version checks avoid blocking and detect conflicting edits; callers must handle conflicts and retry."],
    p: ["Two edits to different fields of one item collide on the version check and one user's change is rejected for no visible reason.", "A long migration holds a lock on the table and blocks all writes for a tenant."],
    v: "Update an item from two sessions on different fields at the same time, and confirm both changes are retained or one gets a clear conflict, the version number increases once per accepted write, and history has matching entries.",
    dep: ["field-value-storage", "change-history", "event-log"]
  },
  "change-history": {
    s: "Records every change to an item as who, when, which field, old value and new value, supporting the history tab, reports, rollback and audit.",
    d: "Each write produces a history group with an actor and time and one row per changed field, stored with the item's version. History is append-only and queried by item for display and by field and time for reports such as burndown and cycle time. Values are stored by type, with references to option ids and user ids, rendered at read time. Hard because history is the largest table, retention conflicts with deletion requests, and rendering old values correctly after fields, options or users have been renamed or removed is difficult.",
    k: ["Store typed old and new values vs a snapshot per version: typed deltas are compact and answer field queries; snapshots make reconstruction easy and use more space.", "Same transaction as the write vs derived from the event log later: transactional history cannot diverge from the data; a derived history is cheaper on writes and can lag."],
    p: ["History rows hold option text only, and after an option is renamed old entries show a name that never existed at the time.", "The history table grows without partitioning and report queries slow the primary database."],
    v: "Change status, assignee and a custom field in one edit and confirm one history group with three rows holds old and new values, and a time-ordered replay of the item's history reproduces its current state exactly.",
    dep: ["item-store", "field-value-storage"]
  },
  "field-value-storage": {
    s: "Holds the values of custom and built-in fields in a form that can be indexed, filtered and sorted by type without a schema change per field.",
    d: "Common approaches are a typed value table keyed by item and field id with columns per data type, a document column holding all values, or a row-per-value table for multi-valued fields. Each approach needs indexes for the fields that queries filter on. Queries over custom fields join or unpack these structures. Hard because flexible schemas make queries on many fields slow, a hundred custom fields per item bloat rows, and the planner cannot estimate selectivity for generic value columns.",
    k: ["Typed value table vs document column: typed tables index and sort natively; document columns read an item in one fetch and need expression indexes for filters.", "Index every field vs selected fields: full indexing makes any filter fast and slows writes; selective indexing needs usage data and fails for unlisted fields."],
    p: ["A filter on an unindexed custom field scans millions of values and times out for large tenants.", "A text value stored in a numeric column fails on import because types are checked only in the application."],
    v: "Create fields of text, number, date and multi-select types, filter and sort on each across fifty thousand items, and confirm the explain plan uses an index and results match a direct scan.",
    dep: ["custom-field-types", "item-store", "search-index-pipeline"]
  },
  "rank-store": {
    s: "Persists the ordering values for backlogs and boards, with indexes for fast neighbor lookup and a process to rebalance when gaps run out.",
    d: "Rank values are stored per ordering context, such as a project backlog or a board, in a dedicated column or table with an index sorted by rank. Lookups find neighbors of an item and compute a value between them. When the gap between two values becomes too small, a rebalancing job redistributes ranks across the context in batches. Reads page through the index. Hard because rebalancing touches many rows while users keep dragging, and because rank is separate from other fields and must stay consistent with item creation, deletion and moves.",
    k: ["Dedicated rank per context vs one global rank: per-context ranks let boards order independently; a global rank is simple but forces one order on every view.", "Rebalance in the background in batches vs lock and rewrite: background batches keep the service available; during them, ordering is temporarily mixed and writers must tolerate it."],
    p: ["A rebalance runs while users drag and some items receive ranks from both the old and new scheme.", "Deleting an item leaves its rank value in a lookup index and a neighbor computation uses a missing item."],
    v: "Insert items repeatedly between the same two neighbors until gaps are exhausted, and confirm the rebalance runs, relative order is unchanged and a concurrent drag during it still lands in the right place.",
    dep: ["item-store", "background-jobs"]
  },
  "search-index-pipeline": {
    s: "Copies item changes from the source of truth into the search index, transforming, batching and retrying so the index follows with bounded delay.",
    d: "Changes are read from the event log or a change stream, expanded into index documents that combine fields, comments and permission data, and sent in bulk. Failed batches go to a retry queue and a dead-letter store. Version numbers on documents make out-of-order writes harmless: an older version never overwrites a newer one. A full reindex path rebuilds from the store into a new index and swaps an alias. Hard because lag is invisible to users, schema changes require reindexing everything, and the pipeline must handle spikes from bulk operations.",
    k: ["Index from the event stream vs dual write in the request: the stream decouples the write from index health; dual writes give faster visibility and can diverge on partial failure.", "Version-checked writes vs last-write-wins: version checks tolerate reordering and retries; they need a monotonic version carried everywhere."],
    p: ["A bulk import saturates the pipeline and every other tenant's new items take an hour to become searchable.", "Failed documents are dropped after the retry limit and silently missing from search."],
    v: "Create, update and delete an item, then confirm the index reflects each change within the documented lag, replay an old event and confirm the newer version is kept, and compare store and index counts for a project.",
    dep: ["event-log", "item-store", "background-jobs"]
  },
  "attachment-storage": {
    s: "Object storage for uploaded files and generated previews, addressed by opaque keys, with lifecycle rules, encryption and tenant-scoped paths.",
    d: "Files are stored outside the database under keys that include a tenant prefix and a content-derived or random id. Metadata in the item store maps names and sizes to keys. Identical content may be deduplicated by hash within a tenant. Lifecycle rules move cold data to cheaper tiers, and deletion removes objects after retention. Encryption at rest uses keys per tenant or per region. Hard because storage costs grow without bound, deletion must reach every copy including backups, and per-tenant quotas need accurate accounting.",
    k: ["Deduplicate by content hash vs store every upload: deduplication saves space on repeated files; reference counting makes deletion complicated and can leak existence across users.", "Per-tenant keys vs one key: per-tenant keys allow crypto-shredding and customer-held keys; they add key management and lookup cost."],
    p: ["Orphaned objects remain after item deletion because the cleanup job only runs on metadata.", "Quota counts include deleted files for weeks and tenants hit limits they do not actually use."],
    v: "Upload a file, delete it, and confirm the metadata is gone, the object is removed after the retention period, the quota decreases accordingly and a read by the old key fails.",
    dep: ["tenant-isolation", "background-jobs"]
  },
  "event-log": {
    s: "A durable, ordered stream of everything that happens to items, which notifications, indexing, rules, webhooks and activity feeds consume.",
    d: "Every committed change writes an event with a type, item, actor, tenant, changed fields and version, either in the same transaction through an outbox table or by capturing the database log. A relay publishes events to a queue with per-item ordering. Consumers track their own positions and process at least once. Retention allows replay for new consumers or recovery. Hard because losing an event silently breaks downstream copies, ordering matters only per item, and consumers must be idempotent.",
    k: ["Transactional outbox vs publish after commit: an outbox guarantees that every committed change produces an event; publishing after commit is simpler and loses events if the process crashes between steps.", "Per-item ordering vs global ordering: per-item ordering scales by partitioning; consumers needing cross-item order must reconstruct it."],
    p: ["A relay falls behind and every consumer, from email to search, is late at once.", "Events are published before the transaction commits and consumers act on a change that is rolled back."],
    v: "Make a change, kill the relay mid-publish, restart it, and confirm the event is delivered exactly once to each consumer's effect, and that every committed change in a test run has a matching event.",
    dep: ["item-store", "idempotent-events"]
  },
  "tenant-sharding": {
    s: "Distributes customers across database and index clusters so capacity grows by adding shards and one tenant's load stays within its shard.",
    d: "A routing layer maps a tenant to a shard holding its data and index. Requests resolve the shard from the tenant id and connect to it. New tenants are placed by capacity, and large tenants may get dedicated shards. Moving a tenant between shards copies data, replays changes, switches routing and removes the source. Hard because very large tenants do not fit the model, cross-shard queries such as global administration are expensive, and a move must be nearly invisible to users.",
    k: ["Tenant as the shard key vs sharding items within a tenant: tenant sharding keeps queries local and transactional; it cannot spread one huge tenant, which then needs special handling.", "Live tenant move with change replay vs a maintenance window: live moves avoid downtime; they need careful cutover and verification."],
    p: ["A routing cache holds the old shard after a move and writes go to the wrong place.", "One large tenant exhausts its shard's capacity and slows all small tenants placed with it."],
    v: "Move a test tenant to a different shard while a script performs reads and writes, and confirm no write is lost, the item counts match afterward and requests switch shards within the stated cutover time.",
    dep: ["tenant-isolation", "item-store", "search-index-pipeline"]
  },
  "background-jobs": {
    s: "A queue and worker pool that runs deferred and long-running work such as imports, reindexing, bulk edits, notification sending and scheduled jobs, with retries and fairness.",
    d: "Jobs are persisted with type, tenant, payload, attempt count and status, claimed by workers with leases, and retried on failure with backoff. Queues are separated by priority and cost so slow bulk work does not delay interactive tasks, and per-tenant limits keep one customer from taking all workers. Long jobs checkpoint progress so a restart resumes. Hard because jobs must be idempotent, a lease may expire while the job still runs, and fairness is easy to state and hard to enforce.",
    k: ["Per-tenant fair queues vs one shared queue: fairness protects small tenants from large ones; it adds scheduling complexity and tuning.", "At-least-once with idempotent jobs vs at-most-once: at-least-once never loses work; every job must tolerate repeats, while at-most-once is simpler and loses work on a crash."],
    p: ["A worker crashes after performing a side effect but before acknowledging, and the job runs again and repeats it.", "A single large import fills the queue and password reset emails wait behind it."],
    v: "Enqueue a thousand slow jobs for one tenant and a few interactive jobs for another, and confirm the second tenant's jobs finish promptly, a killed worker's job is retried once and its effect appears once.",
    dep: ["idempotent-events", "tenant-isolation", "rate-limiting"]
  },
  "rate-limiting": {
    s: "Caps requests, expensive queries and automation runs per tenant, user and token, returning clear errors and retry hints to protect shared capacity.",
    d: "Limits are applied at the edge and inside services using token buckets or sliding windows keyed by tenant, user, token and endpoint class. Costly operations such as exports or complex queries are weighted more than simple reads. Responses state the limit and when to retry. Internal producers, such as rules and imports, are throttled by the same machinery or by queue limits. Hard because limits must be shared across many servers, tuned to separate abuse from legitimate bursts, and explained to integrators.",
    k: ["Cost-weighted limits vs flat request counts: weighting reflects real load and is fair; callers find it hard to predict how much they can do.", "Reject at the limit vs queue and delay: rejection is cheap and gives immediate feedback; queuing smooths bursts and uses memory and hides overload."],
    p: ["A script that retries immediately on a limit response increases load and stays throttled indefinitely.", "Limits keyed only by user let one tenant with many service accounts exceed its fair share."],
    v: "Send requests above the limit from one token, confirm the excess receives rejections with a retry-after value, requests from another tenant are unaffected, and sending again after the stated delay succeeds.",
    dep: ["tenant-isolation"]
  },
  "index-rebuild": {
    s: "Rebuilds the search index or derived tables from the source of truth into a new generation and swaps it in without downtime.",
    d: "A rebuild reads items in batches from the store, produces documents under the new mapping, writes them to a fresh index, and keeps applying live changes in parallel through the pipeline. When counts and checksums match and lag is small, an alias switches readers to the new index and the old one is kept briefly for rollback. Rebuild of derived rollups and rank caches follows the same pattern. Hard because a rebuild competes with production load, takes hours for big tenants, and must handle changes that arrive during the copy.",
    k: ["Build alongside and swap an alias vs rebuild in place: alongside is safe and reversible and needs double storage; in place is cheaper and leaves the index inconsistent while it runs.", "Throttle by tenant priority vs run flat out: throttling protects live traffic and lengthens the rebuild; flat out is quick and risks incidents."],
    p: ["Changes made during the rebuild are missed because live updates only go to the old index.", "The alias is switched before the new index has caught up, and users see items vanish."],
    v: "Start a rebuild while edits continue, and at switch time compare document counts and a sampled field checksum between the store and the new index, then confirm searches during and after show no missing items.",
    dep: ["search-index-pipeline", "item-store", "background-jobs"]
  },
  "schema-migration": {
    s: "Changes database structure and stored data formats while the service keeps running, using staged, backward-compatible steps.",
    d: "Each change is split: add the new column or table, deploy code that writes both forms, backfill existing rows in throttled batches, switch reads, then remove the old structure in a later release. Migrations run per shard and are tracked so that a partial rollout is visible. Data format changes such as rich-text schemas use a version field and read-time upgrade. Hard because tables have hundreds of millions of rows, code at several versions runs at once during a rollout, and a mistake in a backfill can corrupt customer data.",
    k: ["Expand and contract in stages vs one atomic change: staging allows safe rollback and zero downtime; it takes several releases and temporary dual-write code.", "Backfill by background job vs on read: a job finishes the migration and costs load; on-read upgrade spreads cost and leaves old data around indefinitely."],
    p: ["Code that expects the new column is deployed before the migration ran on one shard and errors for those tenants.", "A backfill without a throttle saturates the database and slows every request."],
    v: "Run a staged migration on a copy of production-size data while a load script runs, and confirm no request fails, old and new code versions both read correctly during the change and row checksums match afterward.",
    dep: ["item-store", "backward-compatible-config", "background-jobs"]
  },
  "backup-restore": {
    s: "Takes consistent copies of the stores and files and restores a tenant, a project or an item to a point in time without disturbing others.",
    d: "Databases use continuous log shipping plus periodic snapshots for point-in-time recovery, and object storage uses versioning or replication. Restores target the whole shard for disasters and, harder, a single tenant or project, which means extracting its rows from a snapshot and merging them into live data. Search indexes are rebuilt, not restored. Retention and deletion rules apply to backups too. Hard because untested backups fail when needed, partial restores must remap ids and keys, and restored data may reference changes made after the snapshot.",
    k: ["Tenant-level restore by extraction vs restoring a whole shard: extraction fixes one customer's mistake without touching others; it needs tooling that understands every table and relation.", "Frequent snapshots vs log-based recovery: snapshots are simple and coarse; logs restore to the second and need retained log history."],
    p: ["A restore completes but attachments for the same period were not included and items show broken files.", "Backups are never test-restored and a silent failure is discovered during an incident."],
    v: "Delete a project in a test environment, restore it to a point five minutes earlier, and confirm items, history, links and attachments return, search is rebuilt for it, and other projects changed during the interval are untouched.",
    dep: ["item-store", "attachment-storage", "index-rebuild", "retention-and-deletion"]
  },
  "customization-scope": {
    s: "How much of the tracker customers can reconfigure, from field names to workflows to scripts, and who is allowed to do it.",
    d: "Customization is the product's main strength and its main cost. Each configurable thing, such as fields, workflows, screens, permissions and rules, creates combinations that every other layer must handle: queries across projects, reports over unlike workflows, imports into any schema. Decisions include who may configure (administrators, project owners, anyone), whether configuration is shared across projects, and where to stop short of programming. Every new option multiplies testing and support, and removing one breaks customers who built on it.",
    k: ["Shared global configuration vs per-project freedom: shared configuration enables cross-project reporting and consistency; per-project freedom suits teams and fragments the data.", "Declarative configuration vs scripting: declarative is auditable, portable and safe; scripting solves any case and makes upgrades, performance and security unpredictable."],
    p: ["Administrators add configuration for years and the system reaches thousands of fields and schemes that no one understands.", "A rule or script becomes business-critical and the person who wrote it leaves."],
    v: "List the count of fields, workflows, schemes and rules per tenant, find those unused for ninety days, and confirm tooling reports and can safely retire each one without changing any item's visible data.",
    dep: []
  },
  "multi-tenancy": {
    s: "How many customers share one deployment, and the isolation, fairness and data-placement decisions that follow from that choice.",
    d: "A tracker is usually run as one service for many customers, each with their own data, configuration, users and limits. The model chosen decides identity scoping on every key and query, storage layout, noisy-neighbor controls, regional placement for data residency, upgrade and maintenance windows, and how a single customer can be exported, restored or moved. Retrofitting tenancy into code that assumed a single customer is very expensive.",
    k: ["Shared infrastructure with logical isolation vs a dedicated stack per customer: shared is efficient and scales to many tenants; dedicated gives strong isolation and multiplies operations.", "Global user identities vs per-tenant users: global identities allow one person to join many tenants; per-tenant users keep isolation simple and duplicate accounts."],
    p: ["Some code path ignores tenant scope and a background process serves one customer's data to another.", "Region placement is decided late and moving data for residency requires migrating a live tenant."],
    v: "Run a test that creates data in two tenants and, for every table, cache key, queue, object path and index in the system, asserts no query made with one tenant's context returns the other's rows.",
    dep: ["tenant-isolation", "tenant-sharding"]
  },
  "derived-data-consistency": {
    s: "How the many derived copies of item data, such as search indexes, rollups, counters and caches, stay correct relative to the source of truth.",
    d: "The item store is the truth, and everything else is derived: search documents, rollups, board caches, activity feeds and reports. Each is updated asynchronously through events and may lag, drift or be wrong after a lost event. Choices include which reads must be current (the item page) and which may lag (search, dashboards), how drift is detected, and how repair works. Users notice lag as items missing from search or totals that do not add up.",
    k: ["Read your own writes through the store vs always read from indexes: store reads show a user their change instantly; index reads are cheap and appear stale right after an edit.", "Periodic repair by comparison vs trusting the event stream: repair detects and fixes silent loss; it costs scanning and cannot be run constantly on large tenants."],
    p: ["A board served from the index shows an item in its old column right after the user dragged it.", "A counter increments on every event, a retry counts twice, and it drifts for months before anyone notices."],
    v: "Edit an item and, for each derived store, measure the time until it reflects the change; then corrupt one derived value on purpose and confirm the repair job detects the mismatch and fixes it.",
    dep: ["search-index-pipeline", "rollups", "event-log"]
  },
  "change-history-everywhere": {
    s: "The commitment that every change, by people, rules, integrations and imports, is recorded with an actor and reason, so state can be explained and reports rebuilt.",
    d: "History is not a single table. It is a rule applied to every write path: the interface, API, bulk edits, rules, imports and migrations must all record who changed what. Reports such as cycle time depend on it, trust in automation depends on it, and compliance requires it. Deciding at the start to route all writes through one service makes this tractable; allowing shortcuts creates gaps. It also fixes how deletion, anonymization and retention interact with the record of the past.",
    k: ["One write service for all changes vs per-feature writes: one service guarantees history and validation; it can become a bottleneck for teams and a hard constraint on special cases.", "Record the reason and source for each change vs only the values: sources let people distinguish rule changes from human edits; they add a field to every history entry."],
    p: ["An integration writes directly to the store for speed and its changes appear in no history or event.", "History for imported items is generated with the importer's name and the import date, destroying the true timeline."],
    v: "Make a change through each path, interface, API, bulk edit, rule, import and migration, and confirm each produces a history entry naming the actor and source and an event consumers received.",
    dep: ["change-history", "event-log", "audit-log"]
  },
  "idempotent-events": {
    s: "The rule that every consumer of events, and every retried job, must give the same result when it receives the same event more than once or out of order.",
    d: "Queues and webhooks deliver at least once, retries repeat work, and ordering holds only per item. The system therefore carries event ids and item versions, and consumers check them before acting: ignore events at or below the version already applied, and use unique keys for side effects such as sending a message. Decisions include where deduplication state lives, how long it is kept, and what counts as the same event. Missing idempotency causes duplicate notifications, double counts and wrong states that only appear under failure.",
    k: ["Deduplicate by event id vs by item version: ids catch exact repeats; versions also ignore stale events and make out-of-order delivery safe.", "Deduplication window vs permanent record: a window bounds storage and fails for very late retries; permanent records are safe and grow."],
    p: ["A consumer reads the current item rather than the event and applies the same change twice when it replays.", "An external side effect such as a message is sent before the dedupe record is committed and a crash causes a repeat."],
    v: "Deliver the same event twice and a stale older event after a newer one to each consumer, and confirm each consumer's end state and external side effects are the same as after one in-order delivery.",
    dep: ["event-log", "background-jobs"]
  },
  "backward-compatible-config": {
    s: "The discipline of changing schemes, workflows, formats and APIs so existing customer configuration and integrations keep working across releases.",
    d: "Customer configuration is data that lives for years: workflows, field settings, saved queries, rules and API clients. New versions must read old definitions, migrate them lazily or in the background, and keep deprecated behavior for a published period. Versioned formats, feature flags for gradual rollout, and compatibility tests that run old configurations against new code are the tools. The cost of getting it wrong is that a release changes how a customer's process behaves without anyone choosing it.",
    k: ["Versioned definitions with upgraders vs one current format: versions allow old data to load unchanged and need upgrade code kept forever; one format is simple and requires a migration of everything at once.", "Long deprecation windows vs fast removal: long windows protect customers and keep old paths alive; fast removal simplifies the code and breaks integrations."],
    p: ["A new release interprets an old saved query slightly differently and changes the results people have relied on for reports.", "A removed API field breaks a script that had run unattended for years."],
    v: "Keep a corpus of real old workflows, queries, rules and API requests, run it against the new release in a test environment, and confirm identical results or a listed, announced difference for each.",
    dep: ["field-definitions", "state-machine", "query-language"]
  },
});
