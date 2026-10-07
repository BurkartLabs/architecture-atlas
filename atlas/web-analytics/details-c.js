// Details for the web analytics plate, part 3: event pipeline, storage, ingestion edge.
ATLAS.details("web-analytics", {
  "ingest-queue": {
    s: "A durable, partitioned log that accepts events from the edge and holds them until processing jobs have consumed them.",
    d: "The collection endpoint appends each accepted event to a partition chosen by a key, often the property or visitor, and acknowledges only after the write is replicated. Consumers read at their own pace and track offsets, so a slow or crashed job resumes without loss. The queue absorbs bursts and decouples the edge from processing. It is hard because partitioning decides ordering and hot spots, because retention must cover the longest outage, and because a full queue forces a choice between rejecting and dropping.",
    k: ["Partition by visitor versus by property: visitor keys keep one visitor's events in order for sessionization, while property keys give simple per-tenant isolation but create hot partitions for large sites.", "Acknowledging after replication versus before: waiting costs a few milliseconds but never loses an accepted event, while early acknowledgement is faster and loses data on a crash."],
    p: ["A single very large property sends all its traffic to one partition and lags while others are idle.", "Retention shorter than a processing outage means the backlog is deleted before it is read."],
    v: "Stop all consumers for ten minutes while sending a known number of events, restart them, and confirm every event is processed once and consumer lag returns to near zero.",
    dep: ["raw-event-log"]
  },
  "validation-and-schema-enforcement": {
    s: "Checks each event against its declared schema, types and limits, and routes invalid ones aside instead of storing them.",
    d: "A processing step parses the payload, verifies required fields, types, value ranges, string lengths and property counts, and normalizes formats such as timestamps and URLs. Valid events continue; invalid ones go to the dead-letter queue with the reason. Rules come from the schema registry so they change without code deploys. It is hard because strictness trades completeness for cleanliness: a rule too tight discards real data after a harmless client change, and one too loose lets malformed values break queries later.",
    k: ["Rejecting invalid events versus storing them with a flag: rejection keeps tables clean, while flagging preserves evidence and lets fixes recover the data.", "Strict types versus coercion: strict types catch client bugs early, while coercion tolerates sloppy senders but hides errors and may change values."],
    p: ["A client release sends timestamps as strings and a strict validator rejects all of its traffic.", "Unbounded property names let a buggy script create thousands of columns."],
    v: "Send an event with a wrong type, an oversized property and a missing required field, and confirm each lands in the dead-letter queue with a named reason while a valid event passes through unchanged.",
    dep: ["schema-registry", "dead-letter-queue", "event-schema"]
  },
  "schema-registry": {
    s: "The versioned catalog of event types and their properties, shared by the script, the pipeline, storage and the query layer.",
    d: "Each event type has a definition: property names, types, whether required, allowed values and a version. Producers fetch or embed the version; the pipeline validates against it; storage maps it to columns; the query layer lists it as available dimensions. Compatibility rules say which changes are safe, such as adding an optional property. It is hard because many independent systems read the same definition and are upgraded at different times, so incompatible changes break one of them.",
    k: ["Enforcing compatible changes only versus free edits: compatibility rules protect consumers and old data, while free edits are quicker but break pipelines silently.", "Central registry versus definitions embedded in each service: a registry gives one truth but becomes a dependency every component must reach, while embedded copies drift apart."],
    p: ["A property is renamed in the script but not the registry, and new events fail validation for hours.", "Removing a property that old rollups still reference breaks historical reports."],
    v: "Propose an incompatible change, such as changing a type, and confirm the registry refuses it; propose adding an optional property and confirm it is accepted and appears in the query layer's dimension list.",
    dep: ["metadata-store"]
  },
  "bot-and-spam-filtering": {
    s: "Detects and removes traffic from crawlers, scripts and fake referrers so counts reflect human visits.",
    d: "Filters combine layers: known crawler agent lists, address ranges of data centers, behavioral signals such as impossibly fast navigation or no pointer events, and lists of referrer spam domains. Each event gets a verdict and a reason, and flagged events are either dropped or stored with a marker so numbers can be recomputed. It is hard because it is an arms race with false positives on both sides: honest users on shared networks get filtered, and sophisticated bots imitate browsers.",
    k: ["Dropping bot events versus tagging them: dropping saves storage and keeps tables clean, while tagging lets rules be corrected and traffic be analyzed later at some cost.", "Filtering at the edge versus in the pipeline: the edge stops floods early and cheaply, while the pipeline has more context to judge and can revise decisions."],
    p: ["A new crawler is not on any list and inflates traffic for weeks before anyone notices a pattern.", "Filtering by data center address ranges removes real users on corporate virtual private networks."],
    v: "Request pages with a known crawler agent, a data center address and a script that skips all input, and confirm each is flagged with a reason and excluded from visitor counts while a normal browser is counted.",
    dep: ["rate-limiting-and-abuse", "stream-processing-jobs", "dimension-lookups"]
  },
  "deduplication": {
    s: "Removes repeated copies of the same event, caused by retries, replays or double firing, using a stable event identifier.",
    d: "Each event carries an identifier generated at the source. The pipeline checks it against recently seen identifiers held in a time-bounded store, and discards repeats. Storage layers also deduplicate on a key at merge time. The window must outlast retries and reprocessing. It is hard because identifiers must be generated reliably, because the dedupe state is large and must be shared across workers, and because duplicates arriving after the window expires are accepted.",
    k: ["Dedupe at ingestion with a bounded window versus at query time: ingestion dedupe keeps storage and counts clean, while query-time dedupe is exact for any age but makes every query pay for it.", "Client-generated identifiers versus content hashes: client identifiers are exact when present, while content hashes work without client help but treat two genuine identical clicks as duplicates."],
    p: ["A client retry after a timeout sends a second copy and doubles a purchase unless identifiers are checked.", "A replay older than the dedupe window reinserts events that were already counted."],
    v: "Send the same event identifier three times within and once after the dedupe window, and confirm the three in-window copies produce one stored event and the late one is handled as documented.",
    dep: ["ingest-queue", "metadata-store"]
  },
  "enrichment-workers": {
    s: "Adds derived fields to each event, such as location, device class, traffic source and parsed URL, before it is stored.",
    d: "Workers consume validated events, run a chain of enrichers in a fixed order, and emit the enriched event. Each enricher uses a local lookup, such as an address range database or a parsing rule set, so no network call is made per event. Results are written as columns. Order matters: location lookup must run before the address is anonymized. It is hard because enrichment adds latency and failure points, and because stored enrichment cannot easily be corrected afterwards.",
    k: ["Enriching at write time versus at read time: write-time enrichment makes queries fast and cheap, while read-time enrichment lets better rules apply to old data but costs on every query.", "Local lookups versus calls to external services: local lookups are fast and keep data inside, while services give fresher data but add latency, cost and data export."],
    p: ["A worker with an outdated lookup table writes wrong locations until a rollout reaches all instances.", "An enricher exception drops events instead of passing them through with a missing field."],
    v: "Send an event from a known address and agent, and confirm the stored row has the right country, device and source fields, with the address already truncated, and an unknown address stores an explicit missing value.",
    dep: ["geolocation-enrichment", "device-and-browser-parsing", "traffic-source-classification", "ip-anonymization"]
  },
  "stream-processing-jobs": {
    s: "The long-running processors that apply filters, enrichment, sessionization and aggregation to the event stream with checkpointed state.",
    d: "Jobs read partitions from the queue, keep keyed state for sessions and counts, and write outputs to storage and to downstream topics. They checkpoint offsets and state together so a crash resumes consistently. Parallelism follows partition count. Watermarks track event time progress. It is hard because state is large and must survive restarts, because skewed keys create hot workers, and because upgrades must preserve state compatibility.",
    k: ["Stateful streaming versus stateless processing with batch jobs: stateful jobs give fresh results, while stateless streaming plus batch computation is simpler but delays session and window results.", "Exactly-once through checkpoint and transactional writes versus at-least-once with idempotent sinks: the first is stronger but costs throughput, while the second is cheaper if every sink tolerates repeats."],
    p: ["A deploy that changes the state format discards state and restarts every open session.", "One hot key stalls a worker, and backpressure lags the whole job."],
    v: "Kill a worker during a load test and confirm the job restarts from its checkpoint, no events are lost or counted twice, and output lag recovers within the stated objective.",
    dep: ["ingest-queue", "event-time-semantics", "columnar-event-store"]
  },
  "dead-letter-queue": {
    s: "A holding area for events that failed validation or processing, kept with the reason so they can be inspected, fixed and replayed.",
    d: "When a step cannot handle an event, it writes the original payload, the error and context to a separate queue instead of discarding it or blocking the stream. Operators review counts by reason, fix the cause, and replay the events through the pipeline. Retention is limited and access is controlled because payloads may hold personal data. It is hard because a growing dead-letter queue is a silent data loss, and replays must remain idempotent.",
    k: ["Parking failures versus failing the whole stream: parking keeps healthy data flowing, but a poison event can hide a systemic bug unless alerts watch the volume.", "Storing full payloads versus only metadata: full payloads allow exact replay, but keep personal data in a lightly governed place."],
    p: ["Nobody monitors the queue, and a client bug drops a fifth of all events for a month.", "Replaying after the schema changed produces events that fail again or are stored incorrectly."],
    v: "Inject a malformed event, confirm it appears in the dead-letter queue with its reason and a metric increments, fix the rule, replay it, and confirm it is stored once.",
    dep: ["ingest-queue", "pipeline-monitoring"]
  },
  "raw-event-log": {
    s: "The immutable, append-only record of accepted events in their original form, kept as the source of truth for reprocessing.",
    d: "Every event that passes initial checks is written to partitioned files by arrival time, in a compact format with the schema version. Derived tables are rebuilt from it. It is never edited, except by deletion under retention or privacy rules. It is cheap object storage with occasional large reads. It is hard because it holds the most personal data, because it grows without bound, and because rebuilding from it needs enough compute and compatible old schemas.",
    k: ["Keeping raw events versus only aggregates: raw events allow any new question and any bug fix, while aggregates are far cheaper but fix the answers permanently.", "Arrival-time partitions versus event-time partitions: arrival-time files are append-only and simple, while event-time partitions suit queries but force rewriting for late data."],
    p: ["Raw logs keep full addresses past the retention policy because they live in a separate bucket nobody audits.", "Changing the file format without versioning makes old partitions unreadable."],
    v: "Pick one event, find it in the raw log by identifier, and confirm its payload equals what the client sent. Then run the retention job and confirm partitions older than the limit are gone.",
    dep: ["object-archive", "retention-policies"]
  },
  "columnar-event-store": {
    s: "The analytical database holding events in column-oriented, compressed form so scans over a few fields across billions of rows are fast.",
    d: "Events are written in batches into immutable parts, each storing every column separately, sorted by a key and compressed. Queries read only the needed columns and skip parts using partition and sparse index information. Background merges combine small parts. It is built for large scans and appends, not for single-row updates. It is hard because sort keys decide performance, because deletes and updates are expensive rewrites, and because too many small inserts create a merge backlog.",
    k: ["Column-oriented storage versus row storage: columns scan and compress far better for analytics, while rows serve single-event lookups and updates much better.", "Large batched inserts versus streaming single rows: batching is efficient and keeps parts few, while single rows are fresher but create many small parts that slow queries."],
    p: ["A sort key that does not match common filters forces scans of nearly all parts.", "A deletion request implemented as a row-level rewrite stalls merges for hours."],
    v: "Run a filtered aggregate over a month of events and confirm in the query's statistics that it read only the needed columns and skipped most parts, and returned in the stated latency.",
    dep: ["partitioning-and-ordering", "compression-and-encoding", "metadata-store"]
  },
  "partitioning-and-ordering": {
    s: "How events are divided into time and key partitions and how rows are sorted within them, which decides what each query can skip.",
    d: "Data is partitioned by day or month and often by tenant, and sorted within partitions by a key such as property, event type, then time or visitor. Queries prune partitions by time and tenant and use the sort order to narrow scans. A visitor-oriented order helps funnels and sessions. It is hard because one layout cannot serve every query: the choice favors some patterns at the cost of others, and changing it requires rewriting data.",
    k: ["Sorting by tenant then time versus visitor then time: tenant-first suits dashboards, while visitor-first speeds funnels and retention but makes broad time-range scans less efficient.", "Fine partitions versus coarse: fine partitions prune well and make deletion cheap, while too many partitions overload metadata and slow planning."],
    p: ["Partitioning by the arrival date while queries filter by event date makes every query read many partitions.", "Very large tenants dominate one partition and cause skewed work during scans."],
    v: "Query one tenant's single day and confirm from the plan that only that partition was read, then check a funnel query reads sorted ranges per visitor without a full shuffle.",
    dep: ["metadata-store"]
  },
  "compression-and-encoding": {
    s: "Column-specific encodings and general compression that shrink stored events many times over while keeping scans fast.",
    d: "Each column uses an encoding that fits its shape: dictionary encoding for repeated strings such as page paths, delta encoding for timestamps, run-length encoding for sorted flags, then a general-purpose compressor on top. Smaller data means less disk and memory traffic, so queries speed up as well as shrinking. It is hard because choices depend on the data's actual shape, because high-cardinality strings compress poorly, and because stronger compression costs decompression time.",
    k: ["Strong compression versus fast decompression: stronger settings cut storage and cost, while lighter settings keep scan latency low for frequently queried hot data.", "Dictionary encoding for URLs versus raw strings: dictionaries save much space for repeated paths, but a dictionary exploded by unique query strings loses the benefit."],
    p: ["Unique tokens in URLs make a dictionary column huge and slower than a plain one.", "Recompressing old data at a stronger level during peak hours competes with live queries."],
    v: "Compare stored bytes per million events before and after enabling encodings for the page path and timestamp columns, and confirm a scan of those columns is no slower.",
    dep: ["columnar-event-store"]
  },
  "rollup-tables": {
    s: "Compact precomputed tables of counts and sketches by time grain and dimensions, which answer most reports without touching raw events.",
    d: "Rollups are stored in the same analytical store or a smaller one, keyed by property, period and chosen dimensions. Each row holds additive measures and mergeable sketches. They are written by aggregation jobs and read by the planner. A report's speed comes from reading thousands of rows instead of billions. It is hard because each rollup is a bet on future questions, storage grows with dimension combinations, and the table must be rebuilt consistently when definitions change.",
    k: ["Rollups kept in the main store versus a separate serving store: the main store is simpler and consistent, while a separate store can be tuned for fast small reads but needs syncing.", "Keeping rollups forever versus shorter than raw data: long retention supports history after raw deletion, but must be checked against privacy rules since small groups can identify people."],
    p: ["A rollup with a unique-valued dimension is nearly as big as the raw data and gives no speedup.", "Rollups outlive raw data and retain small segments that could re-identify individuals."],
    v: "Compare a rollup's totals with a raw scan for several random days and dimensions and confirm they agree exactly for additive measures and within sketch error for distinct counts.",
    dep: ["columnar-event-store", "partitioning-and-ordering"]
  },
  "metadata-store": {
    s: "A transactional database holding accounts, properties, definitions, partition lists, schemas and job state that the rest of the platform consults.",
    d: "Unlike the event store, this is a small relational or key-value store with strong consistency. It records which properties exist, their settings, the list of data partitions and their versions, rollup definitions, goals, segments, users and permissions, and the checkpoints of batch jobs. Every query consults it to resolve names and find partitions. It is hard because it is a shared dependency on every path, so an outage stops queries, and because its changes must be consistent with the data they describe.",
    k: ["A separate transactional store versus keeping metadata in the analytical store: a transactional store gives correct small updates and strong consistency, while one system is simpler to operate but poor at frequent small writes.", "Caching metadata in each service versus reading on every request: caching keeps queries fast and survives brief outages, but stale entries cause confusing behavior after changes."],
    p: ["A stale partition list in a cache makes queries miss newly written data.", "Metadata backups taken separately from data leave a restored system pointing at partitions that do not exist."],
    v: "Change a property's setting, and confirm the change is visible in all services within the cache expiry; restore a backup to a test environment and confirm every listed partition exists.",
    dep: []
  },
  "hot-warm-cold-tiering": {
    s: "Moves data between fast, medium and cheap storage as it ages, trading query speed on old data for cost.",
    d: "Recent partitions live on fast local disks, older ones move to cheaper volumes, and the oldest sit in object storage and are fetched on demand. A scheduled mover applies age rules and updates metadata so the planner knows where each partition lives. Most queries touch recent data. It is hard because moves must be atomic from the query's perspective, because cold reads are slow and costly per request, and because a query spanning a year can unexpectedly touch cold data.",
    k: ["Age-based rules versus access-based placement: age rules are predictable and simple, while access-based placement keeps popular old data fast but needs usage tracking.", "Fetching cold data on demand versus requiring an explicit restore: on-demand reads are convenient but slow and unpredictable, while explicit restores make cost visible but add steps."],
    p: ["A scheduled report across a full year silently reads cold storage and runs for an hour.", "A partition mid-move is invisible to queries and its day shows as zero."],
    v: "Move one partition to the cold tier, query that day, and confirm the result is identical to before, the plan shows a cold read, and no query during the move returned a missing or duplicated range.",
    dep: ["metadata-store", "object-archive", "columnar-event-store"]
  },
  "object-archive": {
    s: "Cheap, durable, high-capacity storage for raw files, backups and cold partitions, accessed in large sequential reads.",
    d: "Files are stored as immutable objects in a flat namespace with prefixes by date and property. Durability comes from replication across failure zones. Access is by whole-object or range reads over HTTP, with higher latency than local disk but great throughput. Lifecycle rules delete expired objects. It is hard because object stores offer limited consistency semantics for listing and renaming, so writers use unique names and a manifest, and because per-request cost rewards large files over many small ones.",
    k: ["Few large objects versus many small ones: large objects reduce request cost and improve scan speed, while small objects arrive sooner but burden listing and the query planner.", "Lifecycle deletion by the store versus by the platform: store rules are simple and reliable, while platform-driven deletion can honor per-tenant policies and record proof."],
    p: ["Millions of tiny files from a streaming writer make listing and scanning painfully slow.", "A lifecycle rule applied to the wrong prefix deletes live data."],
    v: "Write a manifest and its files, kill the writer midway, and confirm readers see either the old complete set or the new complete set, never a partial one.",
    dep: []
  },
  "collection-endpoint": {
    s: "The HTTP service that receives events from scripts and SDKs, answers quickly and hands each accepted event to the durable queue.",
    d: "It accepts small POST requests, or GET requests for pixels, checks size and basic shape, adds server-side fields such as arrival time and request address, writes to the queue and returns an empty response. It is stateless and scales horizontally. It must answer in a few milliseconds and keep working when downstream systems are slow. It is hard because it faces the public internet: traffic spikes unpredictably, payloads are hostile, and any slowness is felt on someone else's page.",
    k: ["Responding after the queue acknowledges versus immediately: waiting never loses accepted events, while immediate responses add speed but risk silent loss.", "Doing little at the edge versus validating deeply: a thin edge stays fast and simple, while deep validation rejects bad data earlier but adds latency and a larger attack surface."],
    p: ["Slow downstream writes pile up open connections and the edge stops answering, slowing customers' pages.", "Trusting a client-supplied timestamp or address lets senders forge location and time."],
    v: "Send a burst at ten times normal rate and confirm the endpoint keeps a low median response time, every accepted event reaches the queue, and rejected ones return an explicit status.",
    dep: ["ingest-queue", "request-validation", "edge-network"]
  },
  "edge-network": {
    s: "Geographically distributed entry points that terminate connections near visitors and forward events to regional collectors.",
    d: "Requests resolve by DNS to the nearest point of presence, terminate TLS there, and are forwarded over persistent connections to a collection region. Edge nodes can serve the script from cache, apply rate limits and buffer events briefly if a region is unreachable. It reduces latency, which matters for beacons sent as pages close. It is hard because buffering at the edge creates a second place where data can be lost, and because the data's residency region must follow policy.",
    k: ["Collecting at the nearest edge versus forwarding to one region: nearest edges are faster and shield the core, but spread personal data across jurisdictions if not controlled.", "Edge buffering during outages versus rejecting: buffering preserves events through short faults, while rejecting is simpler and tells clients to retry."],
    p: ["Visitors in a region routed to a distant collector see slow pages and abandoned beacons.", "Edge nodes without persistence lose buffered events on restart."],
    v: "Make a regional collector unreachable for one minute, send traffic, and confirm edge nodes either buffer and deliver everything afterwards or return retryable errors, matching the documented policy.",
    dep: ["collection-endpoint", "data-residency"]
  },
  "request-validation": {
    s: "Cheap early checks on size, content type, origin and structure that reject obviously invalid or abusive requests before queuing.",
    d: "The edge verifies method, content length limits, content type, JSON well-formedness, that the property identifier exists and that the origin or referring site is allowed for it. It sets limits on property counts and string sizes. Rejections return specific status codes so legitimate clients can fix themselves. It is hard because anything a script can send, an attacker can forge, so identifiers are not secrets, and origin checks are only a weak filter.",
    k: ["Strict allowed-origin checks versus open collection: checks block casual forgery and cross-site pollution, but break legitimate setups with proxies and preview domains.", "Rejecting oversized requests versus truncating: rejecting is clear and safe, while truncating keeps partial data but may store misleading values."],
    p: ["No size limit lets one request carry megabytes of properties and crash the parser.", "Allowed-origin rules forget a staging domain, and its data disappears without explanation."],
    v: "Send requests with an unknown property, an oversized body, a disallowed origin and invalid JSON, and confirm each is rejected with a distinct status and none reaches the queue.",
    dep: ["metadata-store", "rate-limiting-and-abuse"]
  },
  "rate-limiting-and-abuse": {
    s: "Limits on request rates per address, property and key that stop floods, scraping of the endpoint and attempts to poison data.",
    d: "Counters track recent request volume per source address, per property and per visitor identifier, using token buckets or sliding windows held in memory shared across edge nodes. Excess requests are rejected or sampled. Property-level caps stop one tenant harming others. It must not hurt legitimate bursts, such as a page with many events or a sale event. It is hard because address-based limits catch shared networks and miss distributed attackers.",
    k: ["Rejecting excess traffic versus accepting it at reduced fidelity: rejecting protects the system plainly, while sampling keeps some signal during a flood but complicates counts.", "Limits per address versus per property: address limits stop single abusers, while property limits protect the platform but let one bad actor degrade a customer's data."],
    p: ["A corporate network behind one address is blocked and its real traffic disappears.", "A fake-event flood against a competitor's property inflates their traffic and bills."],
    v: "Send a flood from one address and confirm requests beyond the limit receive a rate-limit status, other addresses are unaffected, and counts for the property show no inflation from rejected requests.",
    dep: ["edge-network", "quotas-and-metering"]
  },
  "pixel-and-beacon-transport": {
    s: "Delivery mechanisms that work as the page unloads or without scripting: image requests and the browser's send-beacon call.",
    d: "A tracking pixel encodes the event in the query string of an image request, which works almost anywhere including email and pages without scripts. The beacon call queues a small POST that the browser sends even as the page closes. Scripts choose the best available transport and fall back to the other. Both have size limits and are fire-and-forget. It is hard because ordinary requests are cancelled on unload, because URLs get logged by intermediaries, and because there is no response to confirm delivery.",
    k: ["Beacon POST versus image GET: beacons carry more data and keep it out of URLs, while image requests work in the widest set of environments.", "Fire-and-forget versus waiting for an acknowledgement: fire-and-forget never delays the page, but cannot retry known failures."],
    p: ["Sending the final event with an ordinary request loses the time-on-page measurement of every visitor who closes the tab.", "Data in the query string of a pixel is written to proxy and server logs in clear text."],
    v: "Navigate away immediately after an event fires, with each transport, and confirm the event arrives at the collector once. Inspect network logs to confirm no personal data travels in a URL.",
    dep: ["collection-endpoint", "client-batching-queue"]
  },
  "first-party-proxy": {
    s: "Serving the script and collecting events through the customer's own domain so requests look like part of the site.",
    d: "The customer routes a path or subdomain on their site to the analytics servers through a reverse proxy or a delegated name. The script loads from, and events post to, that path. This makes the traffic first-party, so storage rules are less restricted and many blockers that match third-party hosts do not trigger. The proxy must forward the visitor's address correctly. It is hard because it adds an operational dependency to the customer's infrastructure and must forward headers, caching rules and errors faithfully.",
    k: ["Proxy through the customer's domain versus a shared domain: a proxy improves delivery and trust, while a shared domain is zero setup but is blocked more often.", "Customer-run proxy versus vendor-managed delegation: a customer proxy keeps control and flexibility, while delegation is easier but needs DNS changes and certificates."],
    p: ["A proxy that does not forward the original address makes every visitor appear to be in the data center.", "Cached responses on the proxy return stale script versions for days."],
    v: "Load a page through the proxied path, confirm the script and event requests go only to the site's own domain, and confirm the stored event shows the visitor's real country and not the proxy's.",
    dep: ["collection-endpoint", "edge-network"]
  },
  "server-side-api": {
    s: "An authenticated interface for sending events from backend systems, for actions the browser never sees, such as payments and offline conversions.",
    d: "Backend services call an HTTP endpoint with an API key and a batch of events in the same schema as browser events, including the visitor identifier and event identifier so they join the right session. Calls can carry richer data and are not affected by blockers. Batching and retries are expected. It is hard because the backend has no browser context: address, agent and cookies must be passed explicitly, and duplicate sends from both browser and server must be reconciled.",
    k: ["Authenticated keys for server calls versus open public identifiers: keys prove the sender and allow stricter limits, while open identifiers are easy but forgeable.", "Server events as a supplement versus a replacement for browser events: supplementing adds accurate outcomes to rich browsing data, while replacing is simplest but loses client context."],
    p: ["Server events without the visitor identifier cannot be joined to sessions and show up as direct traffic.", "A retry loop without event identifiers duplicates every order during an outage."],
    v: "Send a server-side purchase carrying the browser's visitor identifier, and confirm it joins the correct session, attributes to its source, and appears once even when the call is retried.",
    dep: ["collection-endpoint", "deduplication", "visitor-identification"]
  },
  "ad-blocker-resilience": {
    s: "Techniques that keep measurement working when blockers and browsers stop requests to known analytics hosts or scripts.",
    d: "Blockers match script names, paths and third-party hosts against public lists. Counter-measures include serving from the customer's domain, using neutral file and path names, rotating endpoints and sending server-side. Each raises the cost for blockers, but the arms race never ends, and circumventing a user's explicit blocking choice is an ethical and legal question, not only a technical one. The honest approach is to quantify the loss and report it.",
    k: ["Evading blocking versus respecting it: evasion improves completeness but overrides a user's visible choice, while respect keeps trust and requires reporting an undercount.", "Server-side measurement versus client changes: server-side measurement is robust but limited to what the server knows, while client changes are rich but fragile."],
    p: ["Blocked traffic skews toward technical audiences, so the measured population differs from the real one.", "Reporting numbers without noting a blocker rate leads teams to trust undercounts as exact."],
    v: "Load a test page with a popular blocker enabled and compare the server's request log with the analytics count, and confirm the platform reports the estimated share of unmeasured traffic.",
    dep: ["first-party-proxy", "server-side-api", "measurement-bias"]
  },
});
