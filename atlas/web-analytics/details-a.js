// Details for the web analytics plate, part 1: dashboards, exports, query engine.
ATLAS.details("web-analytics", {
  "dashboard-builder": {
    s: "The interface where users assemble charts, tables and filters into a saved page, each widget backed by a stored query against the metric layer.",
    d: "A dashboard is a document: a grid of widgets, each holding a query definition, a visualization type and shared controls such as date range and segment. The browser sends the definitions to the query layer, which returns series that the client draws. Global filters rewrite every widget's query at once. It is hard because many widgets fire at the same moment against a shared backend, so loading must be staged and cached, and because saved definitions outlive the metrics they reference.",
    k: ["Widgets store query definitions instead of results: pages always reflect current data and metric fixes, but every open dashboard generates load and an old definition can break when a metric is renamed.", "Shared date range and filters for the whole page versus per-widget settings: one control keeps numbers comparable, while per-widget flexibility lets viewers build charts that silently disagree."],
    p: ["A dashboard with thirty widgets opened by a whole team at nine o'clock sends hundreds of simultaneous queries and times out.", "Widgets referencing a deleted metric show empty charts that read as zero traffic."],
    v: "Open a saved dashboard, change the date range once, and confirm every widget reissues its query with the new range and the totals match the same range in the standard report.",
    dep: ["query-api-and-semantic-layer", "result-cache"]
  },
  "standard-reports": {
    s: "Predefined reports such as top pages, referrers, countries and devices that answer common questions without any setup, using fixed definitions.",
    d: "Standard reports are curated queries with fixed dimensions, sensible default sorting and a consistent layout, usually the first screen a new user sees. They read from the cheapest rollups because their shape is known in advance, so they stay fast at any scale. Their value is agreement: everyone sees the same definition of a page view or a bounce. The difficulty is choice, since each added report adds maintenance and a new place where a definition can drift from the others.",
    k: ["Fixed reports versus ad hoc exploration: fixed ones are fast, cheap and consistent, but cannot answer a question their authors did not predict.", "Top-N lists with an Other row versus full tables: capped lists render and compute quickly, but hide long-tail pages and make the total hard to reconcile."],
    p: ["A report truncated to the top hundred rows is exported and treated as complete, so its sum understates traffic.", "Two reports define the same word differently, for example unique visitors, and teams quote conflicting numbers."],
    v: "Compare the total in the top pages report against the overall pageview count for the same range, and confirm the difference equals the Other row and no more.",
    dep: ["rollup-routing", "metric-definitions"]
  },
  "realtime-view": {
    s: "A live view of current visitors, active pages and recent events, refreshed every few seconds from the newest data instead of from rollups.",
    d: "The real-time view reads from a short window of recent events held in memory or in a fast small store, bypassing slower batch rollups. It counts distinct visitors seen in the last few minutes and lists active pages and sources. Updates arrive by polling or a pushed stream. The difficulty is that fresh data is incomplete: late events, unfinished sessions and bot filtering that runs after the fact mean live numbers will not exactly match tomorrow's final figures.",
    k: ["Recent window held separately from history: very low latency, at the cost of a second code path whose counts can differ from the final reports.", "Polling versus pushed updates: polling is simple and cache friendly, while pushing feels instant but holds a connection open for every viewer."],
    p: ["Bot filtering applied only in batch lets crawler spikes appear in the live view and send people chasing a traffic surge that vanishes next day.", "Active-visitor counts include sessions that ended minutes ago because the timeout window is longer than viewers assume."],
    v: "Open the site in a fresh browser, confirm one new active visitor and the page appear within the refresh interval, then close the tab and confirm the count drops after the stated window.",
    dep: ["stream-aggregation", "ingest-queue", "bot-and-spam-filtering"]
  },
  "alerts-and-anomalies": {
    s: "Rules and statistical checks that notify people when a metric crosses a threshold or departs from its usual pattern, such as a sudden traffic drop.",
    d: "Alerts evaluate a metric query on a schedule and compare it with a fixed threshold or with an expectation derived from history, accounting for weekday and seasonal cycles. A firing alert sends a message with the metric, the window and a link back to the report. Detection must work on incomplete recent data, so evaluation often waits for the window to settle. It is hard because the useful alert is rare: too sensitive and it is ignored, too lax and it misses a broken tracker.",
    k: ["Fixed thresholds versus learned baselines: thresholds are predictable and easy to explain, while baselines adapt to seasonality but are harder to trust and tune.", "Evaluating on fresh data versus waiting for late events: waiting avoids false alarms from partial counts, but delays notice of a real outage."],
    p: ["An alert on total traffic never fires when one section of the site loses its tracking, because the rest masks the drop.", "Alert fatigue from noisy rules leads the team to mute the channel, and the real outage goes unseen."],
    v: "Block the collection endpoint in a staging copy for the alert window and confirm the traffic-drop alert fires once, names the affected property and links to the right report.",
    dep: ["query-planner", "metric-definitions", "data-quality-checks"]
  },
  "shared-links-and-embeds": {
    s: "Public or token-protected links and embeddable frames that expose a read-only report to people without accounts, such as clients or visitors.",
    d: "A share link maps an unguessable token to a saved report with fixed filters and an optional password and expiry. The server evaluates the query as the sharing user's workspace but returns only that report's data. Embeds add framing headers and a restricted view. The hazard is scope: the link must reveal only the chosen aggregates, never allow edits, and never let the viewer widen the query to other properties or to raw events.",
    k: ["Token links versus account-based sharing: tokens need no signup and are easy to hand out, but anyone who has the link can see the data and revocation depends on tracking every token.", "Public stats pages as a feature versus off by default: transparency pages build trust for open projects, but one forgotten toggle exposes business numbers."],
    p: ["A shared link that accepts query parameters lets a viewer change the filter and read data beyond what the owner meant to show.", "Links never expire, so a former contractor retains access for years."],
    v: "Open a share link in a logged-out browser, confirm only the chosen report loads, edit the URL parameters to another property, and confirm the request is refused. Revoke the token and confirm the link then fails.",
    dep: ["workspaces-and-roles", "query-api-and-semantic-layer"]
  },
  "workspaces-and-roles": {
    s: "The grouping of sites into accounts and the permissions that decide who may view, edit, export or administer each one.",
    d: "A workspace owns one or more properties, each with its own data. Members hold roles such as viewer, analyst or admin, and may be limited to specific properties or to hide certain fields. Every query passes through an authorization check that appends a property restriction before it reaches storage. Agencies and enterprises need nested accounts and single sign-on. It is hard because permission must apply on every access path, including the API, exports, shared links and scheduled emails.",
    k: ["Role-based access versus per-object grants: roles are simple to audit and administer, while per-object grants fit odd cases but become unmanageable at scale.", "Authorization in the query layer versus in each endpoint: central enforcement cannot be skipped by a new feature, but it needs every request to carry a trusted identity."],
    p: ["A scheduled email report keeps sending after the recipient loses access, because it runs under the creator's old permissions.", "An export endpoint added later skips the property check and exposes another tenant's rows."],
    v: "Create a viewer limited to one property, then request another property by identifier through the interface, the API and an export, and confirm each is denied and the denial is logged.",
    dep: ["tenant-isolation", "audit-log"]
  },
  "annotations": {
    s: "Dated notes attached to a chart or a property, recording launches, outages or campaigns so that changes in a line have a stated cause.",
    d: "An annotation is a timestamp, a short text and a scope: a property, a report or an individual user. Charts overlay them on the time axis. Some are created automatically from deployment events, tracking changes or detected anomalies. They are small but valuable: a chart without them invites guesses. Complications are time zones, since a note must land on the same day for every viewer, and visibility, since notes may hold internal remarks.",
    k: ["Manual notes versus automatic ones from integrations: manual notes carry real context, while automatic ones are complete but noisy and say little about intent.", "Property-wide versus per-report scope: broad notes explain every chart at once, but clutter reports they are irrelevant to."],
    p: ["Notes stored in the viewer's local time land on the wrong day for colleagues in other zones and appear to explain the wrong spike.", "A shared annotation exposes internal remarks on a public share link."],
    v: "Add a note for a specific day, view the chart under two different viewer time zones, and confirm the marker sits on the same calendar day in both.",
    dep: ["dashboard-builder", "workspaces-and-roles"]
  },
  "reporting-api": {
    s: "A programmatic interface for requesting aggregated metrics, breakdowns and time series with the same definitions the dashboards use.",
    d: "Clients send a query naming metrics, dimensions, filters, a date range and an ordering, and receive rows with totals and metadata about sampling or incompleteness. Authentication uses keys scoped to a property and a role. The API is the same query layer the interface uses, so results agree. It is hard to design because callers will request every combination: limits on cardinality, row counts, date span and request rate must protect the backend without breaking legitimate integrations.",
    k: ["Declarative metric-and-dimension queries versus raw SQL: declarative requests keep definitions consistent and safe to execute, but power users hit the limits of what can be expressed.", "Paginated responses versus streamed results: pages keep memory and timeouts bounded, while streaming suits big exports but is harder for clients to resume."],
    p: ["A script requesting a year of data by minute and by URL overwhelms the query layer unless cardinality and span are capped.", "The response omits a sampling flag, so a client reports approximate numbers as exact."],
    v: "Request the same metric, range and filter through the API and in the dashboard, and confirm totals match exactly and the response includes a field saying whether any sampling was applied.",
    dep: ["query-api-and-semantic-layer", "quotas-and-metering", "workspaces-and-roles"]
  },
  "scheduled-reports": {
    s: "Reports generated on a timetable and delivered as email, files or messages, such as a Monday summary of last week's traffic.",
    d: "A schedule stores a report definition, a recurrence, recipients and a format. A worker runs the query at the due time, renders a table or image, and sends it. The report should cover a closed period so numbers are settled. Delivery needs retries and a record of what was sent. It is hard because many reports fire at the same hour, because recipients include external addresses that change who sees the data, and because a failure is easy to miss.",
    k: ["Run at the due time versus pre-compute earlier: running late guarantees fresh figures but concentrates load on the hour, while pre-computing smooths load but may miss late events.", "Sending numbers in the message versus a link: inline numbers are convenient but leave a copy in mail systems, while links keep access control but get ignored."],
    p: ["Reports covering the current day send partial figures that people quote as final.", "A recipient who left the company still receives weekly business metrics because nobody reviews recipient lists."],
    v: "Schedule a report for two minutes ahead, confirm one message arrives with the period named in the subject, and that its totals equal the dashboard for the same closed range.",
    dep: ["query-api-and-semantic-layer", "workspaces-and-roles"]
  },
  "raw-data-export": {
    s: "Bulk delivery of individual events, as files or through a query interface, for teams that want to analyze data in their own tools.",
    d: "The export writes events in a columnar or line-delimited format to a bucket on a schedule, partitioned by date, or lets an authorized job read the event store directly. Files carry the schema version, and identifiers are included only as policy permits. It is hard because raw events are the most sensitive data the platform holds, because late and corrected events mean a day's file can change after delivery, and because schema changes break downstream consumers.",
    k: ["Immutable daily files versus rewriting files as late events arrive: immutable files are simple to consume, but miss late data; rewrites are complete but break consumers that already loaded the file.", "Exporting identifiers versus pseudonymous keys: real identifiers let teams join with their own data, but extend the privacy surface to every system receiving the files."],
    p: ["A consumer reads a file mid-write and loads half a day of events without noticing.", "The export ignores a deletion request, so deleted visitors persist in the customer's warehouse."],
    v: "Export one day, count its rows, and compare the count with the event store for the same day and property. Then delete one visitor and confirm the next export contains none of that visitor's events.",
    dep: ["columnar-event-store", "deletion-requests", "schema-registry"]
  },
  "warehouse-sync": {
    s: "A continuous or scheduled load of events and rollups into a customer-owned data warehouse so analytics can be joined with business data.",
    d: "A connector reads new events by offset or partition, maps them to warehouse tables, and loads them in batches or micro-batches, tracking a watermark so a failed run resumes without gaps or duplicates. Table schemas follow the event schema, with new properties added as columns or stored in a flexible field. It is hard because warehouses differ in types and quotas, because retries must be idempotent, and because upstream deletions and corrections must propagate.",
    k: ["Append-only loads with a dedupe key versus merge on write: appends are cheap and fast, while merges keep tables clean but cost more and strain the warehouse.", "Flexible JSON properties versus typed columns: JSON absorbs schema changes without migration, but typed columns are far cheaper and easier to query."],
    p: ["A retry after a timeout reloads the same batch, doubling that hour's counts in the warehouse.", "A renamed property silently starts a new column and splits one metric across two."],
    v: "Load one hour twice by forcing a retry, and confirm the warehouse row count and the sum of one metric equal the source for that hour, with no duplicates.",
    dep: ["raw-event-log", "deduplication", "schema-registry"]
  },
  "conversion-uploads": {
    s: "Sending selected conversion events to advertising platforms so campaigns can be measured and optimized without exposing the full event stream.",
    d: "When a visitor completes a goal, the system can forward a conversion record to an ad network using a click identifier captured at landing, or a hashed contact detail where permitted. It maps internal goals to the network's conversion types, applies consent rules and retries failures. The difficulty is correctness and privacy: click identifiers expire, conversions must not be double-sent, and the receiving platform's numbers will never match the analytics tool exactly.",
    k: ["Server-side upload versus a browser pixel: server uploads survive blockers and can be validated, but need the click identifier stored and carry more privacy responsibility.", "Sending only consented conversions versus all: respecting consent is lawful and clean, but reduces reported conversions and widens the gap to ad platform totals."],
    p: ["Sending both a browser pixel and a server upload for the same purchase counts it twice in the ad platform.", "Uploads sent after the identifier's attribution window are rejected without any visible error."],
    v: "Trigger a test purchase after a tagged ad click, and confirm exactly one conversion appears in the ad platform's diagnostics with the correct value and a matching identifier.",
    dep: ["goals-and-conversions", "consent-state-propagation", "attribution-models"]
  },
  "webhooks-and-streams": {
    s: "Outbound delivery of events or threshold notices to other systems as they happen, over callbacks or a subscribable stream.",
    d: "A subscriber registers an endpoint and a filter on event types. The platform signs each delivery, retries with backoff when the receiver fails, and stops after a limit while exposing delivery logs. Streams offer a lower-latency, ordered feed with offsets so consumers can resume. It is hard because receivers are unreliable and slower than the sender: delivery needs queuing per subscriber, ordering guarantees must be stated, and a misbehaving endpoint must not slow others.",
    k: ["At-least-once delivery with idempotency keys versus at-most-once: duplicates are possible but nothing is lost, which most receivers can handle; at-most-once drops events during outages.", "Push to subscriber endpoints versus pull from a stream: push is simple for receivers, while pull lets them control rate and replay but needs them to keep offsets."],
    p: ["One slow receiver blocks a shared worker pool and delays every other subscriber's deliveries.", "Unsigned callbacks let anyone post fake events to a receiver that trusts them."],
    v: "Point a subscription at an endpoint that fails twice then succeeds, and confirm one event is delivered after two retries, carries a valid signature, and appears once in the delivery log.",
    dep: ["ingest-queue", "stream-processing-jobs", "quotas-and-metering"]
  },
  "query-api-and-semantic-layer": {
    s: "The single entry point that turns a request for metrics and dimensions into storage queries, applying shared definitions, permissions and limits.",
    d: "Every consumer, whether dashboard, API, alert or export, sends the same structured request. The layer resolves metric names to definitions, adds authorization filters, validates limits, asks the planner for an execution plan and shapes the result. Because it is the only door to the data, it is where consistency is enforced. It is hard because it must be expressive enough for exploration yet safe: unbounded group-bys, huge date ranges and expensive joins can take down shared storage.",
    k: ["One layer for all consumers versus each tool querying storage directly: one layer keeps numbers identical and enforces access in a single place, but becomes a bottleneck for new capabilities.", "Strict request validation versus permissive: rejecting expensive shapes protects the backend, but frustrates analysts with legitimate large questions."],
    p: ["A new feature queries storage directly and quietly produces numbers that differ from every other report.", "Missing limits on dimensions let one request group by full URL and scan the whole store."],
    v: "Issue the same request from the dashboard, the API and a scheduled report, and confirm identical numbers. Then request an over-limit grouping and confirm it is rejected with a message naming the limit.",
    dep: ["metric-definitions", "query-planner", "workspaces-and-roles"]
  },
  "metric-definitions": {
    s: "The versioned, central statements of what each metric means: its formula, the events it counts, its filters and its unit.",
    d: "A definition names a metric such as visitors, sessions or conversion rate, and states how to compute it from events or rollups, including how bots, internal traffic and consent state are treated. Dimensions are defined the same way, with allowed values. Versioning lets a changed definition apply from a date without rewriting history silently. It is hard because definitions carry business meaning, because some metrics cannot be added across rows, and because every change shifts numbers someone has quoted.",
    k: ["Definitions in one registry versus in each report: a registry gives one answer everywhere, but makes changes a deliberate, reviewed act instead of an edit.", "Versioned definitions with effective dates versus rewriting history: versioning keeps old reports reproducible, while recomputing makes history consistent but changes past figures."],
    p: ["A rate metric defined as an average of daily rates is summed across days and gives a wrong weekly figure.", "A definition change ships without notice and the trend line shows a cliff that is not real."],
    v: "Change a filter in a metric definition with an effective date, and confirm figures before the date are unchanged while later ones reflect the new rule, with the change visible in the definition's history.",
    dep: ["event-schema", "schema-registry"]
  },
  "query-planner": {
    s: "Chooses how to answer a request: which rollups or raw tables to read, in what order, with what parallelism, within a time and cost budget.",
    d: "The planner receives a validated request and enumerates sources able to answer it: a precomputed rollup, a partial rollup plus raw data for the latest hours, or a full raw scan. It estimates cost from partition sizes and statistics, chooses the cheapest, splits work across partitions and merges partial results. Non-additive metrics such as distinct counts need mergeable sketches. It is hard because wrong estimates cause scans that run for minutes, and because stitching rollup and raw data must not double count the boundary.",
    k: ["Cost-based choice among sources versus fixed rules: cost-based plans adapt to data size, but need maintained statistics; fixed rules are predictable but waste capacity on skewed data.", "Combining a rollup with a raw tail for fresh data versus waiting for rollups: the combination gives current numbers, at the risk of overlap or gaps at the boundary."],
    p: ["A boundary between rollup and raw ranges counts one hour twice and inflates the total.", "Stale partition statistics lead the planner to a full scan for a query a rollup could answer in milliseconds."],
    v: "Run a request that spans old and recent days, inspect the plan to confirm it reads rollups plus a raw tail, and confirm the result equals a pure raw scan over the same range.",
    dep: ["rollup-routing", "columnar-event-store", "partitioning-and-ordering"]
  },
  "rollup-routing": {
    s: "Matches each request to the narrowest precomputed table that contains the needed metrics and dimensions, falling back to raw data when none does.",
    d: "Each rollup declares its time grain, dimensions and metrics. Routing checks whether a request's dimensions and filters are a subset of a rollup's dimensions and picks the smallest match. Requests needing a dimension that was not rolled up fall through to a scan of raw events. It is the main source of speed. The difficulty is coverage: the set of rollups is a guess about future questions, and every dimension added multiplies storage.",
    k: ["Many narrow rollups versus a few wide ones: narrow tables are fast but consume storage and maintenance, while wide ones cover more questions but are slower to scan.", "Automatic rollup creation from query history versus hand design: automation follows real usage, but can create costly tables for one-off questions."],
    p: ["A filter on a dimension missing from every rollup silently turns a fast report into a full scan.", "Two rollups computed from different filters disagree and routing picks whichever is smaller."],
    v: "Request a metric by country and by day, confirm it is served from the country-by-day rollup in milliseconds, then add a filter on an unrolled dimension and confirm the response flags a slower raw scan.",
    dep: ["rollup-tables", "hourly-daily-rollups"]
  },
  "sampling": {
    s: "Answering from a fraction of the data when a full scan would be too slow, and reporting how large that fraction was.",
    d: "When a request would scan more than a set number of rows, the engine reads a random or hash-based subset, computes the metric on it and scales counts up by the inverse sampling rate. Sampling by visitor identifier keeps each visitor's events together, which keeps funnels and sessions meaningful. Responses carry the rate. It is hard because error is uneven: rare segments and small conversions are misrepresented, and sampled results from different requests cannot be compared exactly.",
    k: ["Sampling by visitor versus by event: visitor-based sampling preserves journeys and distinct counts, while event sampling is simpler but breaks any analysis that spans several events.", "Sampling by default versus exact on demand: sampling keeps interactive speed on large sites, but surprises users who expect exact figures and cannot see the error."],
    p: ["A small segment sampled to a few hundred rows shows a conversion rate that swings wildly between refreshes.", "The interface hides the sampling rate, so two analysts compare figures from different samples as if they were exact."],
    v: "Run a request with sampling forced on and the same request exact, and confirm the sampled total is within its stated error, the response reports the rate, and repeating the sampled request gives identical numbers.",
    dep: ["columnar-event-store", "query-planner", "visitor-identification"]
  },
  "result-cache": {
    s: "Stores finished query results for reuse, keyed by the request and the data version, so repeated views cost almost nothing.",
    d: "The cache key combines the normalized request, the tenant and a version of the underlying data. Closed historical ranges can be cached for a long time; ranges that include today expire quickly or are refreshed in the background. Dashboards reopen the same queries constantly, so hit rates are high. It is hard because correctness depends on invalidation: backfills, late events and deletion requests change old numbers, and a stale cached value would contradict the underlying data.",
    k: ["Short expiry for current ranges versus invalidation on write: expiry is simple and bounded in staleness, while invalidation is exact but must track every change that affects a result.", "Per-tenant cache entries versus shared ones: per-tenant keys prevent any leak between accounts, at a lower hit rate for common public queries."],
    p: ["After a backfill, cached results continue to show the old totals for days.", "A cache key that omits the permission filter serves one user's restricted result to another user."],
    v: "Run a request twice and confirm the second returns from cache. Reprocess one day and confirm the next request for that day misses the cache and shows the corrected total.",
    dep: ["backfill-and-reprocessing", "tenant-isolation"]
  },
  "segment-filters": {
    s: "Reusable conditions on visitors, sessions or events, such as country is Canada or visited pricing, applied to any report.",
    d: "A segment is a boolean expression over properties at one of three scopes: event, session or visitor. The planner compiles it into a filter on the event store or, for visitor scope, into a membership lookup. Segments are saved, named and shared. It is hard because scope changes meaning: visitors who ever viewed a page and sessions that viewed a page select different rows, and evaluating visitor-level conditions across a long range is far more expensive than filtering events.",
    k: ["Evaluating segments at query time versus precomputing membership: query-time evaluation is always current and flexible, while precomputed membership is fast but stale and costly to maintain for many segments.", "Allowing arbitrary expressions versus a fixed menu of conditions: arbitrary expressions answer more questions, but permit slow shapes that a fixed menu would prevent."],
    p: ["A visitor-scoped segment applied to a session metric double counts sessions for visitors who match in some sessions only.", "Segments referencing a property that was later renamed silently match nothing."],
    v: "Define a segment for sessions that viewed a pricing page, count its sessions, and confirm the number equals a direct count of distinct sessions containing that page view in the raw events.",
    dep: ["query-planner", "user-properties", "sessionization"]
  },
});
