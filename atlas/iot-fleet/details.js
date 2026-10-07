// Details for the IoT fleet plate, part 1: consoles and integration, monitoring, registry and grouping.
ATLAS.details("iot-fleet", {
  "fleet-console": {
    s: "The web interface where operators browse devices, inspect state, launch jobs and updates, and watch fleet health without writing code against the API.",
    d: "The console is a client of the management API and holds no logic of its own. It lists devices through the search index, opens a device page that combines registry data, shadow state, recent telemetry and logs, and offers guided workflows for rollouts and bulk changes. Views are paged and filtered server side because the fleet has millions of rows. The hard part is showing a fleet honestly: counts lag behind reality, and an action on a large group needs a visible preview of how many devices it will touch.",
    k: ["Thin client over the public API vs a console with private endpoints: the thin client keeps scripts and people on identical behavior, at the cost of building every convenience view from public calls.", "Live-updating views vs refresh on demand: live views help during an incident, but a stream per open page multiplies load on the shadow and metrics stores."],
    p: ["A group action launched from a stale filter hits more devices than the operator saw in the preview.", "Fleet totals shown without an age stamp make a partial outage look like a drop in the fleet."],
    v: "Select a filtered group of 500 test devices, open the action preview, and confirm the device count matches an independent API query. Run the action and confirm per-device results appear in the console.",
    dep: ["management-api","fleet-search-index"]
  },
  "management-api": {
    s: "The authenticated programmatic interface for every fleet operation: registry changes, shadow reads and writes, commands, jobs and updates, with consistent errors, paging and idempotency.",
    d: "The API sits in front of the control services and applies authentication, tenant scoping, permission checks, rate limits and request logging in one place. Calls that start long operations return a handle to poll instead of blocking. Write calls accept an idempotency key so a retry after a timeout does not run twice. Listing endpoints use cursor paging over a stable ordering. The difficulty is evolution: partner scripts run for years, so versioning and deprecation need to be planned from the first release.",
    k: ["Asynchronous operation handles vs synchronous results: handles keep calls short and survive restarts, but every client must learn to poll or subscribe.", "Cursor paging vs offset paging: cursors stay correct while the fleet changes underneath, but clients cannot jump to an arbitrary page."],
    p: ["Retries without idempotency keys create duplicate jobs or duplicate device records after a network timeout.", "Listing endpoints that scan all tenants' data and filter afterward leak timing and cost across tenants."],
    v: "Send the same create-job request twice with one idempotency key and confirm one job exists. Call with a token scoped to another tenant and confirm a not-found response, not a forbidden one.",
    dep: ["multi-tenancy","device-registry","command-service","job-orchestrator"]
  },
  "event-export-and-webhooks": {
    s: "Pushes platform events such as device connected, update finished and alert fired to customer systems through signed callbacks or a durable stream.",
    d: "Events are written to an internal log, then delivered to subscriptions: an HTTP callback with a signature header, or a queue the customer reads. Each subscription tracks its own position and retries failed deliveries with backoff, then parks them in a dead-letter set. Delivery is at least once and ordering holds per device only. The hard part is isolating customers from each other: one slow or dead endpoint must not delay the delivery workers serving everyone else.",
    k: ["Push callbacks vs customer-pulled streams: callbacks are simple to adopt, but a slow receiver backs up on the platform; pulled streams move that cost to the customer.", "At-least-once with event ids vs exactly-once claims: at-least-once is achievable and honest, and shifts deduplication to the receiver."],
    p: ["A customer endpoint that returns errors for a day fills the retry queue and delays delivery for other tenants sharing the workers.", "Unsigned callbacks let anyone who learns the URL forge device events."],
    v: "Point a subscription at a receiver that fails the first three attempts, then succeeds. Confirm the event arrives once after retries with a valid signature, and a replay of the same id is flagged as a duplicate.",
    dep: ["shadow-change-events","multi-tenancy"]
  },
  "dashboards-and-reports": {
    s: "Charts and scheduled summaries of fleet size, activity, update progress and data volume, built from aggregated metrics rather than from scans of raw telemetry.",
    d: "Dashboards read pre-aggregated counts from the metrics store and the search index: devices per firmware version, per region, per state, and message volume per hour. Reports run on a schedule and are delivered as files or links. Aggregation is incremental, so a number is a few minutes old by design. The difficulty is definitions: what counts as active, connected or healthy must be written down once and used everywhere, or two screens will disagree and nobody will trust either.",
    k: ["Pre-aggregated rollups vs queries over raw data: rollups answer in milliseconds at any fleet size, but a new question needs a new rollup and a backfill.", "One shared definition of active devices vs per-team definitions: a shared definition keeps numbers consistent, but forces agreement among teams with different needs."],
    p: ["Counting devices by last message time makes a quiet-by-design sleeper look dead on every dashboard.", "A rollup computed in the wrong time zone shifts a day boundary and breaks month-end billing reports."],
    v: "Pick one firmware version, count its devices through the registry API, and compare with the dashboard figure after the stated aggregation delay. They must match to within the documented lag.",
    dep: ["fleet-health-metrics","fleet-search-index"]
  },
  "multi-tenancy": {
    s: "Separates customers or business units so each sees only its own devices, data and settings, with its own limits, roles and keys.",
    d: "Every record and every message carries a tenant identifier set at the platform edge from the credential, never from the request body. Storage is partitioned by tenant or filtered by it on every query, and topic namespaces are prefixed so devices of one tenant cannot address another. Roles are scoped to a tenant and to groups within it. Quotas stop one tenant from consuming shared capacity. The danger is a single code path that forgets the filter and leaks data across the boundary.",
    k: ["Shared infrastructure with tenant filters vs a dedicated stack per tenant: sharing is far cheaper per device, but isolation relies on every query being right; dedicated stacks isolate strongly and multiply operating work.", "Hierarchical tenants vs flat tenants: hierarchy models resellers and sites naturally, but permission inheritance becomes hard to reason about."],
    p: ["A background job that scans without a tenant context reads or modifies data across customers.", "Noisy-neighbor load from one tenant's reconnect storm degrades latency for everyone when quotas are missing."],
    v: "Create two tenants with overlapping device names, then using tenant A's credentials try to read, list and subscribe to tenant B's device. Every attempt must return nothing and appear in the audit log.",
    dep: ["topic-authorization","encryption-and-tenant-isolation","device-registry"]
  },
  "usage-metering-and-billing": {
    s: "Counts what each tenant uses, such as active devices, messages, storage and update bytes, and feeds those counts to invoicing and to quota enforcement.",
    d: "Meters are emitted by the broker, the ingestion pipeline and the control services as small usage events, aggregated per tenant per period, and stored separately from operational data so billing can be audited. The same counters can drive soft limits and alerts before a quota is hit. The challenge is exactness at scale: events arrive late and twice, devices are billed by the day they were active, and any dispute must be answerable from retained evidence.",
    k: ["Counting at the source vs counting from stored data: source counts are cheap and timely, but cannot be re-derived if a meter has a bug.", "Billing per active device vs per message: per-device pricing is predictable for customers, but hides heavy senders that cost the platform far more."],
    p: ["A retried batch counted twice inflates an invoice, and the customer finds it before the platform does.", "Meters reset when a service restarts and silently under-count the busiest hour."],
    v: "Send exactly 10,000 messages from test devices, including a retried batch, and confirm the tenant's usage report shows 10,000 after deduplication and matches the broker's own count.",
    dep: ["mqtt-endpoint","ingestion-pipeline","multi-tenancy"]
  },
  "third-party-integrations": {
    s: "Ready-made connectors that link the platform to customer systems such as ticketing, asset management, data warehouses and enterprise messaging.",
    d: "Connectors are built on the event export and the management API, each with its own credentials, mapping between platform fields and the external schema, and retry policy. Some pull from the platform, others receive pushes. A mapping layer handles renamed fields and units. Credentials for external systems are stored encrypted and scoped to a tenant. The difficulty is drift: external systems change their APIs on their own schedule, so each connector needs health reporting and an owner.",
    k: ["Maintained connectors vs documented building blocks: connectors reduce customer effort, but each one is a permanent maintenance commitment.", "Field mapping in configuration vs in code: configuration lets customers adapt without a release, but complex transformations soon outgrow it."],
    p: ["An expired external credential makes a connector fail silently while alerts keep piling up on the other side.", "A unit mismatch such as Celsius against Fahrenheit passes validation and corrupts the customer's records."],
    v: "Trigger a test alert and confirm a ticket appears in the external system within the documented delay with correct field values. Revoke the external credential and confirm the connector reports unhealthy.",
    dep: ["event-export-and-webhooks","management-api"]
  },
  "fleet-health-metrics": {
    s: "Aggregate measurements about the fleet itself: connected count, message rates, error rates, battery and signal distributions, and update success, broken down by firmware, model and region.",
    d: "Metrics come from the connection registry, the ingestion pipeline and periodic health reports sent by devices. They are tagged with dimensions such as model, version and carrier and stored as time series with bounded cardinality. Alerts and dashboards read them. A health report from the device is separate from the device's connection state because a device can be connected and still failing. Cardinality is the hard limit: tagging by device id turns millions of series into a store that cannot be queried.",
    k: ["Group-level dimensions vs per-device series: dimensions keep storage bounded and queries fast, but per-device detail needs a separate path.", "Device-reported health vs platform-observed health: device reports carry internal detail, but a stuck device cannot send one; platform observation catches that case."],
    p: ["Adding a high-cardinality tag such as a serial number multiplies the series count and makes the metrics store fall over.", "Averages across the fleet hide a small group of devices that are completely failing."],
    v: "Fail 50 test devices on one firmware version and confirm the per-version error rate rises within one reporting interval while the fleet-wide average barely moves, and a per-version alert fires.",
    dep: ["connection-registry","ingestion-pipeline","hot-time-series-store"]
  },
  "connectivity-status-tracking": {
    s: "Maintains whether each device is connected, when it last connected or disconnected and why, as a queryable status and a stream of changes.",
    d: "Status comes from broker connect and disconnect events, last-will messages and keepalive timeouts, written to the connection registry and published as lifecycle events. Each event carries a session id and timestamp so the order can be reconstructed even when events arrive out of order. The status view must distinguish clean disconnect, timeout and takeover by a newer session. The difficulty is that a missing keepalive can mean a dead device, a dead network path or a slow broker.",
    k: ["Event-driven status vs periodic polling: events are timely and cheap, but a lost disconnect event leaves a device shown connected until a timeout sweeps it.", "Short keepalive timeouts vs long ones: short timeouts detect loss quickly but flap on cellular links; long ones hide real outages."],
    p: ["Out-of-order connect and disconnect events leave a connected device marked offline until its next reconnect.", "A broker restart drops every session and floods the status stream with false offline events."],
    v: "Cut a test device's network without a clean disconnect, and confirm it shows offline after the keepalive timeout with a timeout reason. Reconnect it and confirm the status returns to connected with a new session id.",
    dep: ["connection-registry","retained-and-last-will","presence-and-keepalive"]
  },
  "alert-rules": {
    s: "Conditions over fleet and device metrics that raise notifications, such as a failure rate above a threshold for a firmware version, with suppression and routing.",
    d: "Rules evaluate on a schedule or on streaming data, over groups rather than single devices, and fire when a condition holds for a minimum duration. A fired alert carries the offending group, a link to details and a severity, and is routed to a person or system. Deduplication and grouping keep one cause from producing thousands of pages. The difficulty is tuning: too sensitive and operators ignore them, too lax and a failing release spreads before anyone is told.",
    k: ["Group-rate alerts vs per-device alerts: group rates catch a broken release without paging per unit, but miss one critical device that needs immediate attention.", "Alert on cause-based symptoms vs on resource thresholds: symptom alerts match what customers feel, but are slower to point at the failing part."],
    p: ["An alert per offline device during a regional outage produces thousands of notifications and buries the one that matters.", "A rule that evaluates on missing data never fires when the data source itself has stopped."],
    v: "Make 5 percent of a test group report errors for the rule's minimum duration and confirm one grouped alert fires with the group named. Stop the metrics source and confirm a no-data alert fires.",
    dep: ["fleet-health-metrics","connectivity-status-tracking","device-registry"]
  },
  "anomaly-detection": {
    s: "Learns the normal pattern of a device or group and flags departures, such as a sensor drifting or a device that suddenly sends ten times more traffic.",
    d: "Detectors run on streams or windows of telemetry and fleet metrics. They compare each device against its own history or against peers in the same group, using statistical baselines that adapt to daily and weekly cycles. Flags carry a score and the evidence window. Training data is the fleet itself, which includes already-faulty units. The difficulty is false positives: devices have seasonal behavior, firmware changes shift baselines, and an operator who sees ten wrong flags stops trusting the eleventh.",
    k: ["Comparison against own history vs against peers: own history catches drift in a unique device, but peers handle new devices with no history and sudden fleet-wide shifts.", "Fixed thresholds vs learned baselines: fixed thresholds are explainable and predictable, but cannot cover many device types without constant tuning."],
    p: ["A firmware release that changes sampling intervals shifts every baseline and floods the system with flags.", "Training on a period that included a widespread fault teaches the detector that the fault is normal."],
    v: "Inject a slow drift of 2 percent per day into one test device's readings while peers stay flat, and confirm it is flagged within the documented window while no peer is flagged.",
    dep: ["stream-processing","hot-time-series-store","fleet-groups"]
  },
  "device-log-collection": {
    s: "Gathers diagnostic logs from devices on demand or on triggers, within strict limits on bandwidth and storage, and makes them searchable per device.",
    d: "Devices keep a ring buffer of recent log lines in local memory or flash. The platform requests an upload through a command, or the device sends a bounded excerpt when an error occurs. Uploads are compressed, size-limited, rate-limited per device and tagged with firmware version and time. Logs are stored with a short retention and a search index. The difficulty is the cost of data on metered links, and secrets or personal data that can appear in log lines and must be filtered before leaving the device.",
    k: ["Pull logs on demand vs push on every error: pulling spends no bandwidth until needed, but the evidence may already be overwritten; pushing keeps evidence at a steady cost.", "Structured logs with fixed fields vs free text: structured logs search and aggregate well, but take more space and effort on the device."],
    p: ["A crash loop uploads logs repeatedly and burns through a metered data plan in a day.", "Logs containing network credentials or user identifiers are stored with broader access than the device data itself."],
    v: "Trigger a log request for a test device, confirm the upload stays within the byte cap, appears in search within a minute, and contains no value from a planted fake secret.",
    dep: ["command-service","local-persistence","cold-archive"]
  },
  "remote-diagnostics": {
    s: "Tools that let support staff query a live device's state, run safe test actions and read recent history without visiting it.",
    d: "A support view combines last-known shadow, connection history, recent telemetry, update history and logs. Active tests such as a ping, a sensor self-test or a signal scan are offered as commands with strict allow-lists and short timeouts. Everything a person does is logged. Access is time-limited and tied to a ticket. The challenge is safety: diagnostic actions run on devices that control physical equipment, so each action needs a defined, reversible effect.",
    k: ["Allow-listed diagnostic actions vs a general remote shell: the allow-list limits what a mistake can do, but cannot cover every unforeseen fault; a shell does, with far greater risk.", "Reading cached state vs live querying: cached state is instant and works offline, but may be hours old when the question is about now."],
    p: ["A diagnostic test that reboots a device mid-task interrupts equipment it controls.", "Support access with no expiry leaves standing permissions to customer devices long after the ticket closed."],
    v: "Open a support session on a test device, run the self-test action, confirm the result returns within its timeout and that the session, action and result appear in the audit trail with the ticket reference.",
    dep: ["command-service","device-shadow","command-audit-trail"]
  },
  "incident-workflow": {
    s: "The process and tooling that take an alert to a resolved problem: ownership, a shared timeline, mitigation levers such as pausing a rollout, and a review afterward.",
    d: "An alert opens an incident with a severity and an owner. The responders see affected groups, recent changes such as rollouts and configuration pushes, and controls to pause or roll back them. Mitigation levers are the key part: a stop-everything switch for campaigns, the ability to quarantine a group from commands and a way to cut off a misbehaving device class. Notes are captured in a timeline for the review. The difficulty is speed under pressure, with enough access for responders and enough audit for everyone else.",
    k: ["Pre-built mitigation controls vs ad hoc scripts during the incident: controls are fast and tested, but must be built before the incident that needs them.", "Automatic pause on failure signals vs human-decided pause: automation reacts in seconds, but can halt healthy rollouts on a noisy signal."],
    p: ["No documented way to halt a running campaign means responders race the rollout with manual commands.", "Broad emergency access granted during an incident is never withdrawn afterward."],
    v: "Start a test campaign, raise a failure alert, and confirm responders can pause the campaign in under one minute and that the pause is visible to every device group's next check-in.",
    dep: ["alert-rules","update-campaigns","job-orchestrator","command-audit-trail"]
  },
  "fleet-reliability-reports": {
    s: "Periodic measures of how well the fleet performs over time: uptime, update success, mean time between failures and data completeness, per model and version.",
    d: "Reports aggregate months of metrics, incident records and update outcomes into figures that engineering, support and customers can compare across releases. Each figure has a definition, a data source and a known blind spot. For example, uptime is measured from connection records, which cannot see a device that was healthy but out of coverage. Reports feed decisions on firmware priorities and hardware revisions. The difficulty is attribution: a rise in failures may come from firmware, hardware, carrier or customer installation.",
    k: ["Computing from retained raw events vs from stored rollups: raw events allow new questions later, but cost far more to keep and scan.", "Failure counted per device vs per device-day of exposure: exposure-based rates compare versions fairly, but need accurate records of how long each ran."],
    p: ["Comparing a new version's failure rate on early adopters against the whole fleet makes the release look better or worse than it is.", "A report that omits devices which never reconnected hides the worst failures."],
    v: "Compute update success for one completed campaign from raw job results and compare with the report's figure. Check that devices which never checked in are counted as failures, not excluded.",
    dep: ["fleet-health-metrics","incident-workflow","cold-archive"]
  },
  "device-registry": {
    s: "The authoritative record of every device: its identifier, model, owner, state, credentials binding and attributes, with fast lookup by id and by attribute.",
    d: "Each device has one record keyed by an immutable identifier, holding the model, serial, tenant, lifecycle state, firmware version, tags and a pointer to its certificate or key. The registry is read on every connection to authorize the device, so it must be fast and highly available, while search and reporting are served from a derived index. Writes arrive from provisioning, operators and the devices themselves. The hard part is scale and consistency: millions of reconnect-time reads, and bulk writes that must not stall them.",
    k: ["Key-value store with a separate search index vs one database serving both: separating them protects connection-time reads from heavy queries, but the index lags the registry.", "Immutable device id vs id derived from serial or hardware: an opaque id survives hardware swaps and relabeling, but needs a lookup table for human-friendly identifiers."],
    p: ["A bulk import that locks registry rows blocks reconnecting devices and turns an administrative job into an outage.", "Two records for one physical device after a re-provisioning split its history and commands."],
    v: "Import 100,000 test devices while 10,000 others reconnect, and confirm reconnect authorization latency stays within its limit and each device is retrievable by id, serial and tag immediately after.",
    dep: ["encryption-and-tenant-isolation"]
  },
  "device-types-and-models": {
    s: "Definitions of each hardware model or class, with its capabilities, telemetry schema, firmware lineage, limits and default configuration, shared by all devices of that kind.",
    d: "A type record names the model, the hardware revisions it covers, the telemetry and shadow schemas it uses, the firmware families that can run on it, and defaults such as reporting interval. Devices reference their type, and new units inherit its settings at provisioning. Types are versioned, because a hardware revision may change sensors but keep the name. The difficulty is the real world: a model made by three factories with two chipsets behaves as three models, and the platform needs to know which differences matter.",
    k: ["Fine-grained types per hardware revision vs one type per product name: fine types make compatibility rules accurate, but multiply schemas to maintain.", "Inheritance of defaults from types vs explicit per-device values: inheritance keeps fleets consistent, but a type change silently alters every device that did not override it."],
    p: ["Treating two hardware revisions as one type lets a firmware image reach a board it cannot boot on.", "Editing a type default changes behavior on millions of devices with no preview of the effect."],
    v: "Change a default reporting interval on a test type, then confirm only devices without an override receive the new value, and the platform lists exactly how many devices were affected.",
    dep: ["device-registry","telemetry-schema-registry"]
  },
  "device-metadata-and-tags": {
    s: "Free-form attributes and labels on devices, such as site, customer, installer and floor, used to group, search and target operations.",
    d: "Metadata is stored on the registry record as typed key-value attributes with limits on count and size. Tags are short labels set by operators, scripts or rules. Both feed the search index and dynamic groups. Some attributes are managed by the platform, such as firmware version or last seen time, and cannot be overwritten by users. The difficulty is hygiene: without naming conventions and validation, a fleet ends up with several spellings of the same site, and queries silently miss devices.",
    k: ["Typed, schema-checked attributes vs free text: typed attributes allow safe numeric and date queries, but need upfront design and migration when the schema changes.", "Device-writable attributes vs operator-only: device-written attributes stay fresh, but a compromised device can mislead the groups it falls into."],
    p: ["A device that sets its own site tag can move itself into a group with different update rules.", "Tags with inconsistent case or spelling make a targeted rollout miss part of its intended population."],
    v: "Tag 1,000 test devices through a script and confirm a query on that tag returns exactly 1,000 devices, and that an attempt by a device to overwrite a platform-managed attribute is rejected.",
    dep: ["device-registry"]
  },
  "fleet-groups": {
    s: "Named, explicitly maintained sets of devices, often nested, used as the target for commands, rollouts, permissions and policies.",
    d: "A group is a list of device ids or a node in a hierarchy such as customer, site and building. Policies, permissions and desired configuration can attach to a group and are inherited by members and subgroups. Membership changes are events that other services observe, since a device joining a group may change its allowed topics or its firmware track. The difficulty is that a device may belong to several groups with conflicting policies, so a clear precedence rule is required.",
    k: ["Strict hierarchy vs overlapping membership: hierarchy gives clear inheritance, but real fleets need cross-cutting sets such as a model across all sites.", "Policy attached to groups vs to devices: group policy scales to millions, but a single device's effective policy becomes hard to explain without a viewer."],
    p: ["A device in two groups with different update tracks receives conflicting instructions and flips between versions.", "Deleting a group without checking attached policies removes permissions for every member at once."],
    v: "Put a test device in two groups with different reporting intervals and confirm the documented precedence applies, the effective policy view explains it, and removing one group changes the result within a minute.",
    dep: ["device-registry","device-metadata-and-tags"]
  },
  "dynamic-groups-and-queries": {
    s: "Groups defined by a query over device attributes and state, such as model X below version 4 in region Y, whose membership updates as devices change.",
    d: "A saved query is evaluated against the search index, and membership is recomputed when attributes change or on a schedule. Operations targeted at a dynamic group resolve membership at a stated moment and freeze it for that operation, so a rollout does not grow while it runs. Queries can include connectivity and shadow fields. The difficulty is the index lag and the cost: recomputing thousands of dynamic groups on every attribute change needs incremental maintenance, not full rescans.",
    k: ["Resolve membership once at launch vs continuously: freezing gives a predictable rollout population, but misses devices added during the rollout.", "Incremental membership updates vs periodic recomputation: incremental updates are current but complex; recomputation is simple but lags by minutes."],
    p: ["A query using last-seen time makes membership change each minute, so a campaign target keeps shifting.", "A typo in a query that matches every device turns a canary rollout into a fleet-wide one."],
    v: "Create a dynamic group for devices below version 4, upgrade ten of them, and confirm they leave the group within the stated lag. Launch a job and confirm its target list stays fixed as devices change.",
    dep: ["fleet-search-index","device-metadata-and-tags"]
  },
  "device-lifecycle-states": {
    s: "The defined stages a device passes through, from manufactured and provisioned to active, suspended, retired or lost, and the rules for moving between them.",
    d: "State is a field on the registry record with a permitted-transition table. Each state implies behavior: a manufactured device may only connect for bootstrap, a suspended device is refused by the broker, and a retired device has its credentials revoked and its data retained or deleted per policy. Transitions emit events and are audited. The difficulty is keeping the state machine honest across systems, since billing, support and the broker each need a consistent view of whether a device is allowed to operate.",
    k: ["Centralized state machine vs states inferred by each service: central state gives one truth and a clear audit trail, but every service must read it at the right moments.", "Soft delete vs hard delete on retirement: soft delete preserves history and allows undo, but sensitive data lingers unless a purge follows."],
    p: ["A device reported lost stays able to connect because the broker caches authorization for hours.", "Billing keeps counting retired devices because it never receives the transition event."],
    v: "Move a test device to suspended and confirm the broker refuses its next connection within the cache window, billing stops counting it, and the transition is recorded with actor and reason.",
    dep: ["device-registry","connection-registry"]
  },
  "fleet-search-index": {
    s: "A search-optimized copy of registry, shadow and status fields that answers filtered, sorted and counted queries over millions of devices in milliseconds.",
    d: "A pipeline listens to registry changes, shadow updates and connection events and writes denormalized documents into a search store. Queries combine attribute filters, ranges, text matching and aggregations such as counts per version. Because it is derived, it can be rebuilt from the registry, and it is allowed to lag. Updates are batched to avoid overwhelming the index when a reconnect storm changes the state of a million devices at once. The difficulty is staleness that users see as wrong answers.",
    k: ["Derived index with eventual consistency vs querying the registry directly: the index answers rich queries fast, but may disagree with the registry for seconds or minutes.", "Indexing fast-changing fields such as last seen vs leaving them out: including them enables useful queries, but makes the index write load follow the fleet's activity."],
    p: ["Indexing every telemetry value as a field makes write volume equal ingestion volume and starves search queries.", "After a failed pipeline, the index silently serves old data while the registry has moved on."],
    v: "Change an attribute on a test device and measure the time until a search reflects it. Delete the index, rebuild from the registry, and confirm counts per version match registry counts exactly.",
    dep: ["device-registry","connectivity-status-tracking","shadow-change-events"]
  },
  "bulk-operations": {
    s: "Mechanisms for acting on thousands or millions of devices at once, such as import, tag changes, state transitions and deletions, with progress, partial failure and undo.",
    d: "A bulk request names a target set and an action, then runs as a tracked task that processes devices in batches at a controlled rate. Each device's result is recorded, so a failure on 3,000 devices is a list rather than a vague error. Imports validate before writing and can run as a dry run. Large operations are throttled to protect the registry. The difficulty is safety: the same power that makes onboarding fast makes a mistaken delete or tag overwrite instant and wide.",
    k: ["Dry run with preview vs execute directly: a preview prevents wide mistakes, but doubles the work and can be stale by the time it is approved.", "All-or-nothing bulk changes vs best effort with a results list: all-or-nothing is simple to reason about but impractical at fleet scale; best effort needs a clear failure report."],
    p: ["A script with a wrong filter deletes a customer's devices and no undo or soft-delete window exists.", "An unthrottled bulk write starves the registry and delays device connections."],
    v: "Run a dry-run import of 10,000 devices with 50 invalid rows and confirm the preview lists exactly those 50 with reasons, then run it for real and confirm only the valid rows were written.",
    dep: ["device-registry","job-orchestrator","rollout-rate-control"]
  }
});
