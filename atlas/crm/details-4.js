// Details for the CRM plate, part 4: permissions, platform, cross-cutting concerns.
ATLAS.details("crm", {
  "authentication-and-sso": {
    s: "How users prove who they are: passwords, multi-factor checks and single sign-on through the company's identity provider, with sessions that expire.",
    d: "Most customers delegate login to an identity provider through standard federation protocols, so the CRM trusts a signed assertion and maps it to a user. Local passwords with multi-factor remain for exceptions. Sessions carry a token with idle and absolute timeouts, and can be limited by network or device. Connected apps use delegated authorization. The hard parts are mapping federated identities to existing users reliably and the account recovery paths that attackers target.",
    k: ["Federated login only vs allowing local passwords too: federation centralizes control and offboarding, while local fallbacks keep admins able to log in during an identity outage.", "Short sessions vs long sessions: short sessions limit stolen-token damage and annoy users, long ones are convenient and extend exposure."],
    p: ["A user mapped by email address is taken over after the address is reassigned to someone else.", "Disabling a user in the identity provider leaves existing sessions and API tokens valid."],
    v: "Sign in through the identity provider with multi-factor, then disable the user there. New sign-ins fail, an active session ends within the documented time, and tokens issued to that user are rejected.",
    dep: ["user-provisioning","audit-and-access-logs","api-credentials-and-limits"]
  },
  "user-provisioning": {
    s: "Creating, updating and deactivating CRM users from the company's directory, with their roles, licenses and permissions assigned automatically.",
    d: "A standard provisioning protocol or a connector syncs users and groups from the directory. Attributes such as department and manager map to roles and permission sets. Deactivation freezes the user, reassigns or queues their records, ends sessions and frees the license. Licenses and seats are counted. The difficulty is lifecycle: new hires need access on day one, leavers' records must have owners, and role changes should not leave stale permissions behind.",
    k: ["Directory-driven roles vs set manually in the CRM: directory-driven stays in step with HR, while manual assignment allows exceptions and drifts.", "Deactivate vs delete users: deactivation keeps ownership, history and audit meaning, but still counts as clutter and sometimes as a license."],
    p: ["A leaver is deactivated but their owned deals, tasks and scheduled reports keep running.", "Group-to-permission mapping adds a user to a powerful set because of a mistyped group name."],
    v: "Create a user in the directory with a department. Within minutes they exist in the CRM with the right role and permissions. Deactivating them removes access and moves their open tasks to their manager's queue.",
    dep: ["role-hierarchy","profiles-and-permission-sets","record-ownership","authentication-and-sso"]
  },
  "role-hierarchy": {
    s: "A tree of roles reflecting the organization, which gives managers access to the records of those beneath them and defines rollup paths for reports and forecasts.",
    d: "Users are assigned one role. Records owned by a user are visible, with their access level, to users in roles above. The hierarchy is also used for forecast rollups and approval routing. Sharing computations expand it into explicit access entries or evaluate it at query time. The difficulty is cost and mismatch: reorganizations change thousands of access entries, and the hierarchy for access (who can see) often differs from the one for management (who reports to whom).",
    k: ["Grant-through-hierarchy by default vs opt-in per object: default access up the tree matches how managers work, but over-shares sensitive objects like compensation or legal.", "Precomputed access entries vs evaluate on query: precomputing makes reads fast and reorganizations slow, while evaluating is cheap to change and slow to read."],
    p: ["A reorganization triggers a long recalculation during which users see wrong records.", "Using one tree for access, forecasts and approvals forces compromises none of the three needs."],
    v: "Move a role under a different parent. Managers on the new path gain access to its records, managers on the old one lose it within the documented recalculation time, and forecast rollups follow.",
    dep: ["record-ownership","sharing-rules","forecast-rollups","async-job-queue"]
  },
  "profiles-and-permission-sets": {
    s: "Bundles of object and system permissions, such as read, create, edit, delete and export, assigned to users to define what they can do before any record-level rule applies.",
    d: "A base profile gives each user a minimum set of permissions per object and setting. Permission sets add capabilities on top, and groups of sets can be assigned together. Permissions cover objects, fields, tabs, apps, API access and administrative functions. Access checks combine all assigned bundles, allowing the union. It is hard because bundles multiply: hundreds of profiles and sets drift out of understanding, and the effective permission for a user needs a tool to compute.",
    k: ["Additive permission sets vs many monolithic profiles: additive sets compose cleanly and keep the base small, while profiles are easy to explain and proliferate.", "Union of grants vs explicit denies: unions are simple to reason about, but cannot remove a power granted elsewhere without editing every bundle."],
    p: ["A permission set granting export or modify-all added for one project stays assigned forever.", "Profiles cloned and edited over the years leave no one able to say what any differs by."],
    v: "Assign a user a base profile and one extra permission set, then ask the effective-permissions report what they can do on deals. The report matches actual behavior in the UI and API for create, edit, delete and export.",
    dep: ["object-metadata","user-provisioning","field-level-security","audit-and-access-logs"]
  },
  "field-level-security": {
    s: "Per-field controls on who can see or edit each field, applied everywhere the field is exposed: pages, lists, reports, search and API.",
    d: "For each field and permission bundle, the platform records hidden, read-only or editable. The query layer strips hidden fields from results, rejects writes, and omits them from search and exports. Formulas and roll-ups that depend on hidden fields need rules about whether they leak. It is hard because the field is reachable by many paths, and every new path, such as a new API or report type, must apply the same checks or it becomes the back door.",
    k: ["Enforce in the data layer vs in each client: the data layer cannot be bypassed by a new client, while client enforcement is faster to build and always eventually leaks.", "Default new fields to visible vs hidden: visible is convenient and exposes sensitive data on creation; hidden is safe and means someone must open it up."],
    p: ["A field hidden on the page remains in search results and exports.", "A formula referencing a hidden compensation field reveals it to everyone who can read the formula."],
    v: "Hide a field from a profile. It is absent in pages, lists, reports, search results, API responses and exports for that user, and a write through the API is rejected.",
    dep: ["profiles-and-permission-sets","query-engine","object-metadata","indexing-and-search"]
  },
  "sharing-rules": {
    s: "Rules that grant access to records beyond ownership and hierarchy, by criteria or owner group, including manual shares to named users.",
    d: "The baseline is a default access level per object, such as private or public read. Sharing rules open access to groups of users for records matching criteria, such as all accounts in a region. Teams and manual shares add individuals. The platform maintains share entries or computes access at query time and applies it in lists, reports, search and API. The difficulty is scale: every record times every sharing path produces entries, and recalculating after a change must not block users.",
    k: ["Materialized share tables vs evaluating rules per query: materialized shares make reads fast and writes and recalculations heavy; evaluating avoids storage and slows large queries.", "Private defaults with sharing rules vs open defaults with restrictions: private is safe and complex to open up, while open is simple and exposes the whole customer base."],
    p: ["A bulk reassign of owners creates millions of share rows and stalls other changes.", "Overlapping rules grant access that nobody intended and nobody can explain."],
    v: "Create a criteria rule sharing a region's accounts with a group. Members see exactly those accounts in lists, search and reports, non-members do not, and removing a member removes access within the recalculation window.",
    dep: ["record-ownership","role-hierarchy","teams-and-territories","async-job-queue","query-engine"]
  },
  "teams-and-territories": {
    s: "Structures that assign accounts and deals to groups of sellers by geography, segment or product, independent of the management hierarchy.",
    d: "A territory has assignment rules, such as country, postal range or industry, and users with roles in it. The engine assigns accounts to territories by evaluating the rules, and may place one account in several. Territory membership drives access, quota and forecasts. Models are planned and versioned before activation. The difficulty is change: yearly restructuring reassigns thousands of accounts, in-flight deals must not be disrupted, and overlapping coverage must resolve to a clear owner.",
    k: ["Rule-based assignment vs manual lists: rules apply to new accounts automatically and sometimes misfile edge cases; manual lists are precise and fall behind.", "Account in one territory vs several: one is unambiguous for ownership and quota, while overlaps model specialists at the price of conflicts."],
    p: ["An activated territory model reassigns open deals mid-quarter and moves credit.", "Accounts matching no rule fall into no territory and have no seller."],
    v: "Draft a new territory model and run assignment in a simulation. The report lists accounts that would move and those unassigned. After activation, new accounts are assigned by rule and users see exactly their territories' records.",
    dep: ["accounts","sharing-rules","quotas-and-targets","record-ownership"]
  },
  "audit-and-access-logs": {
    s: "Records of administrative changes, logins and data access, kept so security reviews and investigations can show who did what and when.",
    d: "The setup audit trail records changes to configuration, permissions and users. Login history keeps source, time and result. Event logs record API calls, report runs and exports, and optionally record views. Logs stream to a security monitoring system and are retained for a set period. The hard parts are volume and tamper resistance: recording every read is huge, and logs kept only in the system being audited are as trustworthy as its administrators.",
    k: ["Log reads as well as changes vs changes only: read logs detect data theft and are very large; change-only logs are small and miss quiet copying.", "Keep logs in the CRM vs stream to an external store: in-product logs are convenient, while external storage resists tampering and survives account closure."],
    p: ["Retention shorter than the time to detect a breach leaves nothing to investigate.", "Bulk exports are not logged with their row counts, so a large data copy looks like normal use."],
    v: "Change a permission, export a report and log in from a new network. Each event appears with user, time and detail, reaches the external monitor, and cannot be altered by the administrator who made the change.",
    dep: ["change-event-stream","backup-and-retention","authentication-and-sso","user-provisioning"]
  },
  "privacy-requests": {
    s: "Handling a person's right to access, correct, export or erase their data, which means finding every place the CRM and connected systems hold it.",
    d: "A request identifies the person, then the system finds their contact, lead, activity, files, consent and derived data, including mentions in free text and notes. Access produces a package, erasure deletes or anonymizes across records while preserving what law requires, such as financial records. Connected systems get the request too. Hard parts are discovery in unstructured text, backups and copies, and balancing deletion against audit and legal retention.",
    k: ["Delete vs anonymize: deletion is clean and breaks counts and history, while anonymizing keeps statistics and risks re-identification from the remaining fields.", "Central request workflow vs per-system manual work: a workflow tracks deadlines and completeness, while manual handling does not scale and misses systems."],
    p: ["A deleted contact reappears from a synced marketing system or an old import.", "Personal data in notes and attachments is missed because search covers only structured fields."],
    v: "Submit an erasure request for a test person with records, notes, activity and a marketing sync. All structured and free-text traces are removed or anonymized, the downstream system confirms, and a log shows what was done and when.",
    dep: ["contacts","indexing-and-search","connectors-and-ipaas","backup-and-retention","privacy-and-consent"]
  },
  "multi-tenancy": {
    s: "Running many customers on shared servers and databases, each with its own data, configuration and users, kept apart by design.",
    d: "Every row and cache entry carries a tenant identifier, which the data layer adds to each query so one tenant cannot read another's data. Tenants are grouped into cells or shards for capacity and blast radius, and can be moved between them. Schema and code customization are metadata, so thousands of tenants run one deployed version. The difficulty is isolation: a missing tenant filter, a shared cache key or an unbounded query is a cross-customer incident.",
    k: ["Shared schema with a tenant column vs a database per tenant: shared schema is efficient and scales to many small tenants, while isolation is stronger per tenant and costly.", "Large cells vs many small ones: large cells use capacity well, while small cells limit the blast radius of any failure."],
    p: ["A query path missing the tenant filter returns another customer's rows.", "One tenant with very large data skews a shard and slows its neighbors."],
    v: "Run an automated cross-tenant probe that tries every API and cache path with another tenant's identifiers. None returns data, and moving a tenant between cells leaves its data intact and its users unaware.",
    dep: ["record-store","tenant-isolation-and-limits","object-metadata"]
  },
  "record-store": {
    s: "The durable storage of records and their relationships, optimized for many small transactional reads and writes with consistency across related changes.",
    d: "Records live in a transactional database, often as rows in a few wide tables with generic columns, plus indexes and a log for recovery. Relationships are stored as references. Reads go to a primary or replicas. Soft deletes keep records in a recycle bin before purge. Writes are validated, logged for change events, and indexed for search. The difficulty is the generic layout: it supports any customer schema, but makes the database's own planner and constraints less useful.",
    k: ["Read replicas for queries vs the primary only: replicas scale reads and may lag a few seconds; the primary is always current and shared with all writes.", "Soft delete with a recycle bin vs immediate removal: soft deletion allows undo and complicates every query and uniqueness rule."],
    p: ["A report read from a lagging replica shows a record as missing right after it was created.", "Soft-deleted records still count in uniqueness checks or roll-ups and confuse users."],
    v: "Write a record and read it from the primary and a replica. The primary is immediate, the replica converges within the lag target, and deleting then undeleting restores the record with its relationships.",
    dep: ["flexible-field-storage","transactions-and-locking","backup-and-retention","multi-tenancy"]
  },
  "flexible-field-storage": {
    s: "The physical layout that lets every tenant define its own fields without changing the database schema, typically generic columns mapped by metadata.",
    d: "A record's standard fields have real columns, and custom fields map to generic slots, such as numbered text, number and date columns, with metadata saying which slot holds which field per tenant. Separate index tables support filtering on custom fields. Adding a field costs a metadata write, not a table change. The difficulty is performance and limits: the number of slots per table is finite, queries must translate field names to slots, and type conversion means moving data between slots.",
    k: ["Generic slot columns vs a key-value row per field: slots keep a record in one row and are fast to read, while key-value is unlimited and slow for wide queries.", "Real columns per tenant vs metadata mapping: real columns give database features and cost schema changes on a live system, mapping makes changes instant."],
    p: ["A tenant exhausts the slots on an object and cannot add fields without cleanup.", "Filters on unindexed generic columns scan millions of rows and slow the shared database."],
    v: "Add 200 custom fields to an object and query by three of them with index flags. Values round-trip exactly, indexed filters use the index, and no table change or downtime occurs during field creation.",
    dep: ["object-metadata","multi-tenancy","indexing-and-search"]
  },
  "indexing-and-search": {
    s: "Database indexes for filtering and sorting, and a text search index for finding records by name, email and content across objects.",
    d: "Selected fields get database indexes, which tenants may request subject to limits and which the planner uses only when selective. A separate search system receives changes from the change stream, tokenizes text, stores it with sharing metadata and returns ranked results. Both must follow field-level and record-level access. Hard parts are lag between write and searchability, indexing arbitrary customer fields, and reindexing when metadata or analyzers change.",
    k: ["Index many fields vs few: more indexes speed filters and slow every write and bloat storage, while few indexes keep writes quick and leave custom filters slow.", "Rebuild indexes in the background vs offline: background rebuild keeps service up and serves partial results meanwhile; offline is simple and unavailable."],
    p: ["A filter on a low-selectivity field ignores its index and scans the whole object.", "A reindex after a schema change takes hours, during which search results are incomplete."],
    v: "Create a record and search for it by name and by a custom field. Search reflects it within the lag target, and an explain of a filtered list query shows the intended index being used on a million-row object.",
    dep: ["change-event-stream","flexible-field-storage","record-store","multi-tenancy"]
  },
  "query-engine": {
    s: "The layer that turns structured queries from the UI, API and reports into database queries, adding tenant, security and field mapping.",
    d: "A query in the platform's own language names objects, fields and filters by their metadata names. The engine resolves custom fields to storage slots, adds the tenant filter, sharing and field-security conditions, chooses indexes and joins, and applies limits. Results are mapped back to field names and types, with cursors for paging. It is hard because everything correctness-critical happens here: a missed security predicate leaks data, and a bad plan on a generic schema slows the shared database.",
    k: ["Custom query language vs raw database access: a custom language lets the platform enforce security and limits and restricts expressiveness; raw access is powerful and unsafe on shared hardware.", "Cost-based limits per query vs fixed row limits: cost limits reject only expensive queries, but are harder to explain than a number."],
    p: ["A query joining several custom relationships with no filter produces a plan that scans entire tables.", "Pagination by offset on a changing result skips or repeats rows."],
    v: "Run queries as a restricted user across objects with custom fields. Results contain only permitted rows and fields, equal a hand-written reference query, and a deliberately unbounded query is rejected with a message about its cost.",
    dep: ["object-metadata","flexible-field-storage","sharing-rules","field-level-security","record-store"]
  },
  "transactions-and-locking": {
    s: "The guarantees that a save and everything triggered by it commit together or not at all, and the locks that keep concurrent edits from corrupting related data.",
    d: "A save runs validation, triggers, roll-ups and share updates inside one transaction. Row locks protect the record and parents whose roll-ups change. Concurrent edits to the same record use optimistic checks on a version or modification time, or last-writer-wins. Long transactions are cut off by limits. The hard parts are contention on hot parents, such as an account with huge numbers of children, and deadlocks between automations that lock records in different orders.",
    k: ["Optimistic version checks vs pessimistic locks: optimistic scales and makes losing writers retry, while pessimistic is simple and blocks waiting users.", "Lock parents for roll-ups vs defer roll-up updates: locking keeps totals exact and serializes children, while deferring avoids contention and shows stale totals."],
    p: ["Many parallel loads under one parent time out waiting on its lock.", "Two automations touching the same pair of records in opposite order deadlock intermittently."],
    v: "Run 50 concurrent updates to children of a single parent. All succeed or fail with a clear retryable error, the parent roll-up equals the sum afterward, and no deadlock persists.",
    dep: ["record-store","formula-and-rollup-fields","tenant-isolation-and-limits"]
  },
  "change-event-stream": {
    s: "An ordered log of every committed change to records, published for indexing, replication, integrations, history and automation to consume.",
    d: "On commit, the platform writes events with record ID, operation, changed fields, user and sequence into a durable stream, partitioned for scale. Consumers keep their own cursors and read at their own pace. Retention allows replay for a limited period. It feeds search, the warehouse, webhooks, field history and caches. The difficulty is guarantees: the event must exist exactly when the data committed, never for a rolled-back change, and consumers must handle duplicates and reordering across partitions.",
    k: ["Write events in the same transaction vs after commit: same-transaction guarantees no lost events at the cost of write latency, while after-commit is faster and can lose events on a crash.", "Per-record ordering vs global order: per-record ordering scales and is enough for most consumers, while global order is simpler to reason about and a bottleneck."],
    p: ["An event written after commit is lost on a crash and the search index never learns of the change.", "Consumers slower than retention fall off the end of the stream and need a full rebuild."],
    v: "Make a series of changes with a forced crash between steps. Consumers see exactly the committed changes, in order per record, without duplicates beyond the documented at-least-once case, and a replay returns the same sequence.",
    dep: ["record-store","transactions-and-locking","async-job-queue"]
  },
  "async-job-queue": {
    s: "A shared queue and worker pool that runs work outside the user's request: imports, roll-ups, share recalculation, report runs, sync and scheduled automation.",
    d: "Producers enqueue jobs with a tenant, type, priority and payload. Workers claim them with a lease, run them with limits, and retry on failure with backoff. Fair scheduling gives each tenant a share so one cannot fill the queue. Idempotency keys let retries repeat safely, and poison jobs go to a dead-letter store. The difficulty is fairness and visibility: one large customer's job floods a shared queue, and admins need to see what is pending and why something has not run.",
    k: ["Per-tenant fair queues vs one global queue: fair queues prevent starvation and take more machinery, while a global queue is simple and lets one tenant block others.", "At-least-once with idempotent jobs vs exactly-once: at-least-once is practical and requires careful job design; exactly-once is nearly always an illusion."],
    p: ["A retried job that is not idempotent sends duplicate emails or double-counts a roll-up.", "A job stuck behind a huge tenant's backlog is invisible to the user who is waiting."],
    v: "Enqueue a large job from one tenant and a small one from another. The small one completes promptly, a forced worker crash causes a retry that does not duplicate its effect, and the queue view shows each state.",
    dep: ["multi-tenancy","tenant-isolation-and-limits","record-store"]
  },
  "encryption-and-keys": {
    s: "Protection of data in transit and at rest, including field-level encryption of especially sensitive values and the management and rotation of the keys.",
    d: "All traffic uses TLS. Storage is encrypted by the platform, and optionally each tenant has its own key, which can be rotated or revoked by the customer. Selected fields such as government IDs can be encrypted individually, at the cost of limited search and sorting. Keys are held in a separate key management service. Hard parts are the trade with functionality, since encrypted fields cannot be filtered or indexed normally, and key revocation making data unrecoverable.",
    k: ["Customer-held keys vs vendor-managed: customer keys give control and the ability to cut off access, while vendor keys are simpler and lose that assurance.", "Deterministic encryption vs randomized: deterministic allows exact-match search and leaks equality; randomized is safer and unsearchable."],
    p: ["Revoking a tenant key without a backup of it makes the whole tenant's data unreadable permanently.", "Encrypting a field used in filters, reports or duplicate rules silently breaks them."],
    v: "Rotate a tenant key while users work. Reads and writes continue without error, old data is rewrapped within the documented window, and revoking the key stops reads and writes to that tenant immediately.",
    dep: ["record-store","multi-tenancy","backup-and-retention"]
  },
  "backup-and-retention": {
    s: "Copies of data for disaster recovery and point-in-time restore, plus the schedules that remove or archive records, files and logs when their retention period ends.",
    d: "The platform takes continuous log archiving and periodic full copies, stores them in separate locations, and can restore a tenant to a time. Customers also export data on request. Retention policies delete or archive old activity, logs and deleted records after set periods, and backups age out too. It is hard because recovery and deletion pull against each other: a restore must not resurrect erased personal data, and a customer who wants one record back needs more than a whole-tenant restore.",
    k: ["Whole-tenant restore vs record-level restore: whole-tenant is simple and rolls back everything, while record-level fits real mistakes and needs separate tooling.", "Long backup retention vs short: long retention helps recovery and holds deleted personal data longer; short respects privacy and limits discovery of old errors."],
    p: ["A restore reintroduces records that were deleted for a privacy request.", "Backups were never test-restored and prove unusable when needed."],
    v: "Restore a test tenant to a point 24 hours ago in a separate environment. Its record counts and checksums match the source at that time, erasure requests since then are re-applied, and the elapsed time meets the recovery target.",
    dep: ["record-store","multi-tenancy","change-event-stream"]
  },
  "system-of-record": {
    s: "The decision about which system owns each fact about a customer, and what happens when two systems disagree.",
    d: "A CRM shares customers with billing, support, marketing, product and identity systems. For each field, someone must decide the master: the CRM for owner and stage, finance for billing address and price, marketing for consent. Integrations follow that ownership, and conflicts resolve to it rather than to the latest edit. Without the decision, bidirectional sync produces ping-pong overwrites and reports that cannot be reconciled. It is a cross-cutting choice because it determines the direction and ownership of nearly every integration.",
    k: ["One master per field vs symmetric sync: field ownership prevents fights and needs agreement up front, while symmetric sync is easy to start and drifts.", "CRM as hub vs a separate customer data layer: the CRM as hub is simple and couples everything to it, while a layer decouples systems and adds one more to own."],
    p: ["Two systems each treat themselves as owner of the same address field and overwrite each other.", "A customer's identity differs by system and no shared key allows records to be joined."],
    v: "List every shared field with its owner, edit it in a non-owner system, and verify the owner's value is restored, the change is logged, and a reconciliation report across systems shows zero unexplained differences.",
    dep: ["connectors-and-ipaas","field-mapping-and-transforms","erp-and-billing-sync","marketing-sync"]
  },
  "metadata-driven-schema": {
    s: "The choice to treat objects, fields, layouts, rules and automation as data that customers edit, instead of code the vendor ships.",
    d: "Because every customer sells differently, the CRM defines its data model in metadata: one codebase serves all tenants, and customization is instant and needs no deployment. Every layer, UI, query, security, reports and API, reads metadata at runtime. This gives flexibility and costs speed, tooling and predictability: generic storage, cached definitions, and customers who build programs in configuration. It is cross-cutting because every component must be generic, and none can assume a fixed field exists.",
    k: ["Metadata-driven vs code-generated schema per customer: metadata allows instant change and a single codebase, while generated schemas are faster and harder to operate at scale.", "Unlimited customization vs guardrails: freedom wins deals and creates systems nobody understands, while guardrails keep health and frustrate edge needs."],
    p: ["A component hard-codes a standard field name and breaks for tenants who renamed or hid it.", "Unmanaged customization accumulates until upgrades and performance both suffer."],
    v: "Add a custom object with fields, relationships, a layout, a validation rule and a report with no deployment. All layers expose it within minutes, and the permission and sharing model applies to it automatically.",
    dep: ["object-metadata","flexible-field-storage","custom-fields","query-engine"]
  },
  "ownership-and-visibility": {
    s: "The model by which every record has an owner and every access is derived from ownership, hierarchy, sharing and explicit grants.",
    d: "Visibility is decided on every list, search, report, API call and automation, so the model reaches every layer. The owner field starts it, the role hierarchy and sharing rules extend it, and permissions and field security restrict it. Cost is concentrated in recalculation and in query filters. Changes to ownership or structure move access for many records at once. It is cross-cutting because designs that ignore it, such as global caches or search without filters, leak data.",
    k: ["Strict private by default vs open by default: private is safe and demands more rules, while open is simple and exposes every customer to every seller.", "Owner-centric access vs group-centric: owner-centric is easy to explain and breaks for team selling, while group-centric fits teams and loses accountability."],
    p: ["A new feature, such as a global cache or summary, is built without applying the sharing filter.", "Access is evaluated differently by list, report and API, and users see inconsistent results."],
    v: "Run one query as ten users with different roles through UI, API, search, report and export. All paths return the same visible set for each user, equal to an independent oracle computed from the rules.",
    dep: ["record-ownership","role-hierarchy","sharing-rules","field-level-security","query-engine"]
  },
  "tenant-isolation-and-limits": {
    s: "The caps on queries, rows, calls, storage and job time that stop one customer's configuration or load from harming the others.",
    d: "Every execution path has a limit: records per query, queries per request, CPU time, concurrent jobs, API calls per day, storage per tenant. Limits are enforced by counters inside the platform and reported to developers. They shape customer code and integrations, which must be designed to batch. The limits are part of the product contract: too low frustrates legitimate use, too high lets a single tenant degrade a shared system. They apply across automation, API and reports alike.",
    k: ["Hard per-execution limits vs soft resource accounting: hard limits are predictable and make big operations fail, while soft accounting is flexible and risks starvation.", "Uniform limits vs tiered by plan: uniform limits are simple and fair, while tiers match what customers pay and complicate support."],
    p: ["Code tested on small data fails in production when it exceeds a limit nobody checked.", "A limit differing between API and UI paths lets one path bypass the protection of the other."],
    v: "Run a deliberately abusive tenant workload alongside normal tenants. The abusive tenant hits documented limits with clear errors, and other tenants' latency stays within its normal band.",
    dep: ["multi-tenancy","async-job-queue","transactions-and-locking","api-credentials-and-limits"]
  },
  "privacy-and-consent": {
    s: "The obligation to know what personal data is held, why, with whose permission, and to honor access, correction and erasure across every system.",
    d: "A CRM is largely a database of personal data, so privacy affects every feature: captured email, enrichment, scoring, call recordings and analytics. Each use needs a lawful basis, and consent must be stored as evidence. Data subjects can ask for what is held and for its deletion. Regional rules limit where data is stored and sent. It is cross-cutting because deletion, retention and export must reach every copy, including search indexes, backups and integrated systems.",
    k: ["Collect broadly vs minimize: broad collection enables later insight and increases liability, while minimizing reduces risk and limits future analytics.", "Regional data residency vs one global store: residency satisfies local law and fragments operations, while global storage is simpler and not allowed everywhere."],
    p: ["Features such as enrichment and scoring are added without checking the lawful basis for the data they use.", "Erasure removes the record but not its copies in search, the warehouse and exports."],
    v: "Trace one test person through every store and integration: record, search index, warehouse, backups and marketing system. Access and erasure requests complete across all of them within the legal deadline, with proof.",
    dep: ["consent-and-preferences","privacy-requests","capture-privacy","data-enrichment"]
  },
  "change-history-and-audit": {
    s: "The commitment to keep a trustworthy record of what changed, who changed it and when, for data, configuration and permissions.",
    d: "Sales numbers drive pay and public reporting, so people ask how a figure changed. Field history, forecast snapshots, approvals, setup audit trails and access logs all answer different forms of that question. Together they need consistent identity, time and retention. Without them, a changed close date or a quietly edited permission has no explanation. It is cross-cutting because each feature that mutates data must also decide what to record, and the cost grows with volume.",
    k: ["Record everything vs a chosen subset: complete trails answer any later question and cost storage and write time, while chosen subsets are cheap and miss the unforeseen.", "Mutable history in the same database vs append-only elsewhere: same-database history is simple and can be edited by the people audited, while append-only is credible and more work."],
    p: ["A feature that updates records through a bulk path skips history and leaves a gap in the trail.", "History is kept for fewer years than the disputes it is needed for."],
    v: "Change a deal amount, a permission and a workflow, through UI, API and bulk paths. Each change appears in the relevant trail with the same actor identity and timestamp, and none can be edited or removed by the actor.",
    dep: ["field-history","audit-and-access-logs","forecast-snapshots","change-event-stream"]
  },
});
