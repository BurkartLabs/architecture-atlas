// Details for the web analytics plate, part 4: tracking script, consent, privacy controls.
ATLAS.details("web-analytics", {
  "tracking-script": {
    s: "A small piece of code loaded on each page that observes visits and interactions and sends them to the collector, without slowing or breaking the site.",
    d: "The script loads asynchronously, reads page state such as URL, referrer, title, screen size and language, builds events, and sends them. It must be tiny, because every byte is paid by every visitor, and defensive, because it runs beside unknown code on someone else's page. It avoids global names, catches its own errors and never blocks rendering. It is hard because it cannot assume anything about the page: styles, other scripts, content security policies and old browsers all vary.",
    k: ["A minimal script versus a feature-rich one: minimal scripts load fast and are easy to audit, while richer ones capture more behavior but cost performance and widen the privacy surface.", "Loading asynchronously versus inline: asynchronous loading never blocks the page but may miss an immediate exit, while inline is earlier but delays rendering."],
    p: ["An exception in the script breaks the host page's own scripts because errors were not caught.", "A strict content security policy blocks the script or its endpoint, and no data arrives."],
    v: "Load a page with the script and a throttled connection, confirm rendering is not delayed, one pageview is sent, and forcing an internal error does not raise an error visible to the page.",
    dep: ["event-schema", "client-batching-queue", "pixel-and-beacon-transport"]
  },
  "event-schema": {
    s: "The agreed shape of an event: required fields, standard properties, custom properties and how names, types and units are expressed.",
    d: "Each event has a name, a timestamp, identifiers for property, visitor and session, context such as page and device, and a map of custom properties. Standard names exist for pageviews, outbound clicks and commerce, while custom events are free-named within limits. The schema is the contract between the script, the pipeline and every report. It is hard because it must last for years: a poor name or unit chosen early is repeated in every row, and changing it later means migrating or dual-reading history.",
    k: ["Few standard events with rich properties versus many specific events: fewer events keep analysis consistent and queries simple, while many specific events are explicit but fragment reports.", "Flat properties versus nested objects: flat properties map cleanly to columns and are easy to query, while nesting models real data such as cart items but needs careful flattening."],
    p: ["Inconsistent naming such as signup, sign_up and Signed Up splits one action into three metrics.", "Storing time as a local string instead of a standard timestamp breaks ordering across time zones."],
    v: "Validate a sample of events from the live script against the schema definition and confirm zero violations, and that every standard event name in the reports maps to exactly one schema entry.",
    dep: ["schema-registry"]
  },
  "automatic-pageviews": {
    s: "The default event sent on each page load, carrying URL, referrer, title and campaign parameters with no code from the site owner.",
    d: "On load, the script emits a pageview with the cleaned URL, the referrer, the title and any campaign parameters from the query string. URLs are normalized: fragments and known tracking or session parameters are stripped, and the host is lowercased. Pages restored from the browser's back-forward cache or prerendered in the background need special handling so they count once, and only when actually shown. It is hard because the definition of a view is subtle: reloads, prefetch and background tabs all complicate counting.",
    k: ["Counting on load versus when the page becomes visible: load counting is simple but includes prerendered and background pages, while visibility counting is more accurate but needs extra logic.", "Stripping query parameters versus keeping them: stripping merges duplicates and removes personal data, while keeping them preserves meaningful variants such as search terms."],
    p: ["Session identifiers or email addresses in the URL are stored in every pageview.", "Prerendered pages count as views for visitors who never saw them."],
    v: "Load a page with tracking parameters and a fragment, and confirm one pageview is stored with a cleaned URL, the campaign fields extracted, and no personal parameters retained.",
    dep: ["tracking-script", "event-schema"]
  },
  "spa-route-tracking": {
    s: "Detects in-page navigation in applications that change the address without a full load, so each screen counts as a view.",
    d: "Single-page applications change content through the browser's history interface rather than loading new documents. The script hooks the history calls and the back-forward event, waits for the title and content to settle, then sends a pageview with the new path and the previous one as referrer. Frameworks may fire several changes during one transition, which must be coalesced. It is hard because there is no single standard event for a route change, and timing decides whether the title is already correct.",
    k: ["Hooking the history interface automatically versus manual calls from the app: automatic hooking needs no developer effort but can double count, while manual calls are exact but are forgotten.", "Sending on route change versus after content renders: immediate sending is simple but captures stale titles, while waiting is correct but adds delay and complexity."],
    p: ["Redirects inside the application send two pageviews for one navigation.", "The initial load and the first route change are both reported as the entry page."],
    v: "Navigate through three screens in a test application including the back button, and confirm exactly three pageviews with correct paths, titles and previous-page referrers.",
    dep: ["tracking-script", "automatic-pageviews"]
  },
  "custom-events-api": {
    s: "A function the site calls to record its own events, such as sign-up or video play, with named properties and optional value.",
    d: "The script exposes a small function taking an event name and a properties object. Calls made before the script has loaded are queued and replayed. The script adds standard context, validates against limits and sends. Developers also use declarative attributes on elements to avoid writing code. It is hard because the quality of data depends on how developers use it: names drift, properties hold personal data by accident, and events fire in loops or on every scroll.",
    k: ["Free-form event names versus a declared tracking plan: free names are quick for developers, while a plan keeps names consistent and lets the platform reject unknown ones.", "Imperative calls versus declarative attributes: calls give full control, while attributes let non-developers tag elements but are limited to simple clicks."],
    p: ["A call inside a scroll handler sends thousands of events per visit.", "Developers pass email addresses or names as properties without realizing."],
    v: "Call the function before the script loads and after, with a property of each allowed type, and confirm both events arrive once, in order, with typed values stored and an over-limit property rejected.",
    dep: ["event-schema", "tracking-script", "tracking-plan-governance"]
  },
  "tag-manager-layer": {
    s: "A container that lets non-developers add, change and trigger tracking tags and rules through a console, without a site release.",
    d: "The site includes one container snippet that loads a versioned configuration of tags, triggers and variables. Triggers watch for clicks, form submissions or data layer messages, and fire tags that send events to analytics or other systems. Changes are published as versions with preview and rollback. It is hard because it shifts power from engineers to marketing, and an unreviewed change can leak data, slow the site or break tracking site-wide in seconds.",
    k: ["A tag manager versus hard-coded tracking: a manager makes changes fast and independent of releases, while hard-coded tracking is reviewed with the code and less likely to cause surprises.", "Reading from a structured data layer versus scraping the page: a data layer is stable when the page design changes, while scraping needs no developer work but breaks silently."],
    p: ["A tag added by a marketer sends form field contents to a third party.", "A selector-based trigger stops matching after a redesign and a conversion count falls to zero."],
    v: "Publish a new tag version in preview, confirm it fires only on its trigger with the right payload, publish it, then roll back and confirm the tag stops firing.",
    dep: ["custom-events-api", "consent-state-propagation", "tracking-script"]
  },
  "client-batching-queue": {
    s: "A small buffer in the browser that holds events briefly, sends them together, and keeps unsent events across page loads and offline periods.",
    d: "Events are placed in memory and often in local storage, then flushed on a timer, a size threshold, or when the page is hidden or closing. Batching reduces requests and power use. Each event keeps its identifier so retries are safe. Failed sends back off. It is hard because pages can close at any instant, so the final flush must use a transport that survives unload, and because stored queues must respect consent and length limits.",
    k: ["Flush on a timer versus only on exit: timers send data promptly and lose less on crashes, while exit-only sends fewer requests but loses everything if the tab dies.", "Persisting queued events versus memory only: persistence survives reloads and offline use, while memory is simple and avoids storing personal data on the device."],
    p: ["A queue persisted before consent is granted sends events that should never have been collected.", "Unbounded retries on a failing endpoint grow stored events until storage is full."],
    v: "Go offline, trigger events, reload, return online, and confirm every event is delivered exactly once with its original timestamp, and that queued events are discarded if consent is withdrawn first.",
    dep: ["pixel-and-beacon-transport", "consent-state-propagation"]
  },
  "sdk-versioning": {
    s: "How the script and mobile or server SDKs are versioned, released and kept compatible with the pipeline as old copies stay in the wild for years.",
    d: "Every event carries the SDK name and version. Scripts hosted by the platform can be updated centrally, while self-hosted bundles, mobile apps and server libraries run old versions for long periods. The pipeline accepts several schema versions and maps old shapes to the current one. Releases roll out gradually, with the ability to pause. It is hard because behavior changes, such as how sessions start, alter metrics across the boundary, and you cannot recall an old app version.",
    k: ["Centrally updated script versus pinned copies: central updates fix bugs everywhere at once, while pinned copies give customers stability and an audit trail but fragment the fleet.", "Backward-compatible pipeline versus forcing upgrades: accepting old versions keeps data flowing from stale apps, but accumulates mapping code that must be maintained."],
    p: ["A script update changes how pageviews are counted and every chart shows a step change on the release day.", "An old mobile version sends a deprecated shape that the pipeline no longer maps, and its users vanish."],
    v: "Roll out a new script version to one percent of traffic and compare metrics for the two versions, then confirm events from an older supported version still validate and map to the current schema.",
    dep: ["event-schema", "schema-registry", "validation-and-schema-enforcement"]
  },
  "consent-integration": {
    s: "The connection to a consent banner or management platform so that collection, storage and sharing follow the visitor's recorded choice.",
    d: "The site's consent tool records a choice per purpose, such as measurement or advertising, and exposes it through an event and a readable state. The script reads that state before setting identifiers or sending events, and changes behavior when the choice changes. Modes range from sending nothing before consent, to sending cookieless events, to sending full events. It is hard because law and policy differ by region, because choices change at any time, and because the script often loads before the banner has answered.",
    k: ["Collecting nothing before consent versus cookieless measurement: waiting is the most conservative, while cookieless measurement keeps basic counts but must be justified as not needing consent.", "Region-specific behavior versus one global behavior: region rules match local law and keep more data where allowed, while a single strict rule is simpler and safer but undercounts."],
    p: ["The script fires its first pageview before the consent state loads and so collects without permission.", "A withdrawn consent does not stop later events because the script cached the first answer."],
    v: "Load the page in a region requiring consent, confirm no identifier or stored value is created until accepting, then withdraw consent and confirm sending stops and stored identifiers are cleared.",
    dep: ["consent-state-propagation", "tracking-script"]
  },
  "consent-state-propagation": {
    s: "Carries each visitor's consent choices from the browser into every event and every downstream destination so later stages can honor them.",
    d: "The script attaches the consent state, per purpose, to each event. The pipeline reads it to decide whether to store identifiers, keep events, join to identity or forward to other systems. Destinations such as ad uploads and audience exports check it again. Choices have timestamps and a version of the policy accepted. It is hard because the state must travel through batching, retries and server-side calls without being lost, and a missing value must default to the safe choice.",
    k: ["Consent as a field on every event versus a lookup by visitor: per-event fields are self-contained and auditable, while lookups save space but fail when the identifier is missing.", "Defaulting unknown consent to denied versus allowed: denied is safe and lawful, while allowed preserves data volume but is hard to defend."],
    p: ["Server-side events omit the consent field and are treated as granted.", "A visitor's withdrawal reaches the browser but not the audience already synced to an ad system."],
    v: "Send events with each consent state and confirm denied events carry no identifier in storage, are excluded from exports to advertising systems, and an event with no state is treated as denied.",
    dep: ["event-schema", "stream-processing-jobs"]
  },
  "first-party-cookies": {
    s: "Small values stored by the site's own domain that hold the visitor identifier and session state across page loads.",
    d: "The script writes a cookie or local storage entry with a random visitor identifier and, optionally, session timing. It sets expiry, path, same-site and secure attributes. Reading it on later visits recognizes returning visitors. Browsers limit the lifetime of script-written values and clear them under tracking prevention, and users delete them. It is hard because the value is both useful and regulated, and any value that identifies a visitor over time may require consent.",
    k: ["Cookies versus local storage: cookies are sent to the server and readable by it, while local storage stays on the device and is easier to keep out of requests.", "Long expiry versus short: long expiry preserves identity but invites the browser's caps and raises privacy risk, while short expiry respects the browser's limits and splits repeat visitors."],
    p: ["A cookie scoped to a subdomain makes the same person a new visitor on the main site.", "A script-set cookie capped at seven days makes returning visitors look new."],
    v: "Visit, close the browser and revisit within and after the browser's cap, and confirm the identifier persists exactly as long as the stated lifetime and is absent after cookies are cleared.",
    dep: ["consent-integration", "visitor-identification"]
  },
  "cookieless-visitor-hash": {
    s: "Counts visitors without storing anything on their device, by hashing coarse request attributes with a secret that rotates regularly.",
    d: "At the server, the visitor identifier is computed from a secret salt, the site, the truncated address and the user agent, and the salt is replaced on a schedule, often daily, with old salts destroyed. Within a day, requests from the same browser share an identifier; across days they cannot be linked. No cookie or device storage is used. It is hard because the design deliberately limits what can be measured: no returning-visitor tracking beyond the rotation, and shared networks collide.",
    k: ["Rotating salt versus a persistent hash: rotation prevents long-term tracking and supports a no-consent claim, while persistent hashes are effectively identifiers and lose that privacy benefit.", "Including more attributes versus fewer: more attributes reduce collisions between users, while fewer reduce fingerprinting risk and better support the privacy claim."],
    p: ["Keeping old salts makes the daily hashes linkable, quietly turning anonymous data into tracked identifiers.", "Two people behind one office network with the same browser merge into one visitor."],
    v: "Send requests from one browser across a salt rotation and confirm they get different identifiers after rotation, and confirm the old salt cannot be found anywhere in storage.",
    dep: ["ip-anonymization", "privacy-by-design"]
  },
  "privacy-signals": {
    s: "Browser-sent opt-out indicators, such as global privacy control and do-not-track, that the platform can read and honor automatically.",
    d: "The browser exposes a flag in a request header and in script, stating that the person asks not to be tracked or sold to. The script and the edge read it, and the platform treats it as a refusal of the relevant purposes, stopping identifiers or sharing. Some laws require honoring it; others leave it to policy. It is hard because the signals have different legal weight by region, because they conflict with explicit banner choices, and because honoring them reduces counts.",
    k: ["Honoring the signal automatically versus only where required: automatic honoring is simple and respectful, while region-based honoring preserves more data but needs reliable location.", "Signal overrides banner versus banner overrides signal: a stricter-wins rule protects privacy, while letting an explicit later choice win respects the person's most recent decision."],
    p: ["The signal is read in the script but not at the server, so server-side events ignore it.", "Counting people who send it as zero visitors hides them from reports entirely instead of counting them anonymously."],
    v: "Send requests with the signal on and off, and confirm that with it on no identifier is stored and no data is forwarded, while an anonymous aggregate pageview is still counted.",
    dep: ["consent-state-propagation", "collection-endpoint"]
  },
  "conversion-modeling": {
    s: "Statistical estimation of conversions that could not be observed because of declined consent or blocked tracking, based on the observed population.",
    d: "For visitors who did not consent, the platform collects only aggregate, identifier-free signals. A model trained on consented visitors with similar characteristics, such as device and source, estimates how many unobserved conversions occurred and adds them to reported totals, marked as modeled. It is hard because models rest on the assumption that unobserved and observed visitors behave alike, which is rarely exact, and because blending estimates with measured counts needs clear labeling.",
    k: ["Reporting modeled totals versus observed only: modeled totals approximate reality and aid decisions, while observed-only figures are verifiable but systematically low.", "Modeling in the platform versus exporting to the customer: in-platform modeling is turnkey, while exporting lets customers choose assumptions at the cost of effort."],
    p: ["Modeled and observed numbers are mixed in one column without a flag and people treat estimates as measurements.", "Consent rates differ sharply between audiences, so the model assumption fails and overstates conversions."],
    v: "Hold out a consented subset, hide its identifiers, run the model, and confirm the estimated conversion count lands within the stated error of the true count for that subset.",
    dep: ["measurement-bias", "consent-state-propagation", "goals-and-conversions"]
  },
  "ip-anonymization": {
    s: "Truncates or removes the network address of each request, so full addresses are never stored with events.",
    d: "After any needed lookups, the pipeline zeroes the final part of an address, for instance the last octet of a four-part address or the final bits of a longer one, or discards it entirely. The same applies to logs at the edge and proxies. It must run early and everywhere, including debugging output and crash reports. It is hard because truncated addresses still carry some information, because the address may pass through components before the pipeline, and because any copy left in a log defeats the purpose.",
    k: ["Truncation versus complete removal: truncation keeps coarse location and network data for analysis, while removal is stronger but loses geographic and bot signals.", "Anonymizing at the edge versus in the pipeline: edge anonymization means full addresses never travel inside the system, while pipeline anonymization allows richer enrichment but exposes the address to more components."],
    p: ["Load balancer access logs keep the full address long after events are anonymized.", "Truncating before geolocation lookup removes accuracy, while truncating after lookup but after logging gains nothing."],
    v: "Send a request from a known address and search events, queues, logs and backups for it. Confirm only the truncated form appears, and the lookup still produced the right country.",
    dep: ["collection-endpoint", "privacy-by-design"]
  },
  "pii-detection-and-scrubbing": {
    s: "Finds and removes personal data that leaks into URLs, titles and properties, such as email addresses, names or tokens, before storage.",
    d: "Scrubbers apply pattern rules to fields likely to carry personal data: URL paths and query strings, page titles, referrers and free-text properties. Matches are removed or replaced by a placeholder. Allowlists of safe parameters are stronger than blocklists. Scans also run over stored data to find leaks. It is hard because personal data comes in unpredictable forms, because false positives remove useful values, and because the leak is usually caused by an application bug the platform cannot see.",
    k: ["Allowlist of known safe fields versus blocklist of patterns: an allowlist is safe by default but drops unknown useful data, while a blocklist keeps more but misses new patterns.", "Scrubbing at collection versus after storage: scrubbing at collection prevents storage of the data, while after-the-fact scrubbing can fix leaks but only after exposure."],
    p: ["A password-reset token in a URL is stored in every pageview because only email patterns were scrubbed.", "Page titles containing customer names are exported to a warehouse."],
    v: "Send events whose URL, title and properties contain an email address, a phone number and a token, and confirm none appears in storage, rollups or exports while ordinary values are unchanged.",
    dep: ["validation-and-schema-enforcement", "automatic-pageviews", "privacy-by-design"]
  },
  "retention-policies": {
    s: "Rules that delete or reduce data after a stated time, applied automatically to raw events, rollups, logs and exports.",
    d: "Each data class has a retention period: raw events might be kept for months, rollups for years, and operational logs for days. A scheduled job drops expired partitions, and reduces precision, such as removing visitor identifiers while keeping counts. Policies are set per tenant within platform limits. It is hard because data exists in many copies, including caches, backups, exports and the dead-letter queue, and deletion must reach all of them and be provable.",
    k: ["Dropping whole partitions versus deleting rows: dropping is fast and cheap but removes everything for that day, while row deletion is selective but expensive in a columnar store.", "One retention period for all data versus per-class periods: one period is easy to reason about, while per-class periods minimize risk but multiply the places to check."],
    p: ["Backups retain events for years beyond the stated period, contradicting the policy.", "Rollups keep fine-grained small groups after the raw data is gone and allow re-identification."],
    v: "Set a short retention on a test property, wait past it, and confirm raw partitions, caches and the dead-letter queue contain no events older than the limit, with the deletion run recorded.",
    dep: ["raw-event-log", "columnar-event-store", "audit-log"]
  },
  "deletion-requests": {
    s: "Processing of requests to erase everything held about a person, across raw events, rollups, exports and backups.",
    d: "A request names a visitor or user identifier. The system finds all events for that person, including stitched identities, then deletes or anonymizes them in raw storage and the event store, removes the person from audiences and propagates the request to warehouses and ad destinations. A record states what was done and when. It is hard because columnar stores are poor at row deletion, because aggregates and sketches cannot be un-counted, and because deadlines are legally fixed.",
    k: ["Batching deletions into periodic rewrites versus deleting immediately: batching is efficient and keeps merges healthy, while immediate deletion is fast to honor but costly in an append-oriented store.", "Deleting individual events versus removing the identifier and keeping the event: removing identifiers is cheap and keeps aggregate counts intact, but must be proven irreversible."],
    p: ["Anonymous history linked before login is missed because only the user identifier was searched.", "The request reaches the main store but not the exports and backups, and the person's data persists elsewhere."],
    v: "Create a test visitor with events, exports and an audience entry, submit a deletion, and confirm a search by every linked identifier finds nothing in storage, exports or audiences, with a completion record.",
    dep: ["columnar-event-store", "identity-stitching", "audit-log"]
  },
  "data-residency": {
    s: "Keeps each tenant's data within chosen regions, from edge collection through storage and processing to backups.",
    d: "A tenant is assigned a region. The edge routes collection to that region's collectors, the queue, store and backups stay inside it, and the query layer for that tenant runs there. Control-plane metadata may be global but holds no personal data. Cross-region exports require explicit settings. It is hard because shortcuts such as global caches, shared monitoring and support tooling can move data across borders unnoticed, and because every region duplicates the full stack.",
    k: ["Full regional stacks versus a central stack with regional storage: full stacks keep processing local and satisfy strict rules, while central processing is cheaper but moves data across borders.", "Region fixed at account creation versus movable: fixed placement is simple and clear, while moving a tenant is a big migration that needs deletion in the old region."],
    p: ["Debug logs shipped to a global monitoring service include event payloads from a regional tenant.", "A global dashboard cache holds results containing regional personal data."],
    v: "Send events from a tenant assigned to one region from a visitor elsewhere, and confirm by network and storage inspection that no copy appears outside the chosen region, including logs and backups.",
    dep: ["edge-network", "object-archive", "tenant-isolation"]
  },
  "field-level-encryption": {
    s: "Encrypts sensitive fields such as identifiers with keys held separately, so a copy of storage alone does not reveal them.",
    d: "Selected columns are encrypted or tokenized before writing, using per-tenant keys stored in a key service. Queries needing the value decrypt in a controlled path, while most analytics use the encrypted form for grouping, which works when the encryption is deterministic. Destroying a tenant's key makes its data unreadable, an efficient way to delete. It is hard because encryption defeats compression and many query operations, and key management becomes the critical dependency.",
    k: ["Deterministic encryption versus randomized: deterministic keeps grouping and joins possible but reveals equal values, while randomized hides patterns and prevents grouping.", "Per-tenant keys versus one platform key: per-tenant keys isolate customers and enable crypto-shredding, at the cost of key management overhead and cache pressure."],
    p: ["Losing or rotating a key without re-encrypting makes years of events unreadable.", "Decrypting in the query layer logs plaintext values in query traces."],
    v: "Read a storage file directly and confirm the identifier column is unreadable, then run a grouped query through the normal path and confirm it works, and that destroying the tenant's key makes the column undecryptable.",
    dep: ["columnar-event-store", "tenant-isolation", "privacy-by-design"]
  },
  "audit-log": {
    s: "A tamper-evident record of who accessed, changed, exported or deleted data and settings, retained longer than ordinary logs.",
    d: "Sensitive actions append a structured entry with actor, time, action, target and outcome: permission changes, exports, key use, deletion runs and policy edits. Entries go to a write-once store separate from normal systems. Access is restricted and itself logged. It supports investigations and proof of compliance. It is hard because it must capture enough to answer questions later without storing personal data itself, and because a log that can be edited is worthless as evidence.",
    k: ["Append-only storage with chained hashes versus ordinary tables: chaining makes tampering detectable, while ordinary tables are simpler but give weaker evidence.", "Logging every read versus only sensitive actions: logging every read is complete but huge and noisy, while selective logging stays useful if the sensitive set is chosen well."],
    p: ["The log records the action but not the target, so an export cannot be traced to a property.", "Administrators can delete audit entries, and the evidence disappears when it is most needed."],
    v: "Perform an export, a permission change and a deletion, and confirm each appears with actor and target, and that an attempted edit of an entry is detected by the integrity check.",
    dep: []
  },
  "pipeline-monitoring": {
    s: "Measures volume, latency, lag and error rates at every stage so that missing or delayed data is noticed before users find it.",
    d: "Each stage reports counters: events received, accepted, rejected by reason and written, along with consumer lag and end-to-end delay from event to queryable. Dashboards compare stages and per-property volume against expected patterns. Alerts fire when volume drops, lag grows or rejections spike. It is hard because the key failure is the absence of data: a broken script produces no errors, only a flat line, so monitoring needs baselines and per-tenant checks.",
    k: ["Per-tenant volume checks versus global ones: per-tenant checks catch one customer's broken script, while global checks are cheaper but hide a single tenant's loss in the total.", "Black-box probes versus internal counters: synthetic events measure what users experience end to end, while counters show where inside the system it went wrong."],
    p: ["A global traffic alert never fires because one large tenant masks the loss of hundreds of small ones.", "Counters measure events written but not queryable, so a lagging rollup job is invisible."],
    v: "Inject a synthetic event at the edge every minute and confirm it becomes queryable within the stated delay, and stopping a consumer raises a lag alert within the alert window.",
    dep: ["ingest-queue", "stream-processing-jobs", "dead-letter-queue"]
  },
  "data-quality-checks": {
    s: "Automated tests on stored data that detect broken tracking, impossible values and divergence between sources, such as a sudden drop of one event type.",
    d: "Scheduled checks run queries over recent data: required events present per property, ratios between related events such as add to cart and purchase, value ranges, fraction of unknown dimension values, and agreement between rollups and raw counts. Failures open an incident and notify the owner. Results are stored so trends are visible. It is hard because normal behavior varies, so thresholds must be tuned per property, and because a check that never fails gives false comfort.",
    k: ["Fixed expectations versus learned baselines: fixed rules are clear and cheap, while learned baselines follow seasonality but are harder to explain.", "Reconciling rollups with raw data continuously versus occasionally: continuous reconciliation finds drift quickly but consumes compute, while occasional checks are cheap but late."],
    p: ["A check on total pageviews passes while the purchase event is silently missing after a site release.", "Thresholds copied from a large site flood a small property with false alarms."],
    v: "Remove a single event type from a test property's traffic and confirm the missing-event check fails within its interval, names the property and event, and opens an incident.",
    dep: ["rollup-tables", "columnar-event-store", "tracking-plan-governance"]
  },
  "tracking-plan-governance": {
    s: "The process and tooling that define, review and version the events and properties a site is meant to send, and compare live traffic against that plan.",
    d: "A tracking plan lists each event, when it fires, its properties, types and owners. Changes go through review. The platform compares incoming events with the plan and reports unplanned events, missing properties and type mismatches, and can block violations. Plans are versioned alongside site releases. It is hard because it is a people process more than a technical one: teams under deadline add events ad hoc, and an unenforced plan is ignored within months.",
    k: ["Blocking unplanned events versus reporting them: blocking keeps data clean but loses real behavior during mistakes, while reporting preserves data and relies on follow-up.", "A central plan owner versus team-owned plans: central ownership gives consistency, while team ownership scales and keeps knowledge close but drifts."],
    p: ["The plan document is updated after releases instead of before, and no longer matches reality.", "A strict blocker silently drops a new product's events during launch week."],
    v: "Send an unplanned event and one with a wrong property type, and confirm both appear in the violations report with the sending version, and that a plan change is reflected in what the report accepts.",
    dep: ["schema-registry", "validation-and-schema-enforcement"]
  },
  "capacity-and-cost-control": {
    s: "Planning and limiting compute, storage and query spend as event volume, retention and dimension counts grow.",
    d: "Cost splits across collection, processing, storage, and queries. Controls include sampling, retention tiers, rollup pruning, query cost limits and compression. Capacity planning projects partitions, consumer throughput and merge capacity from traffic growth and launch events. Usage per tenant is attributed so heavy users are visible. It is hard because costs are driven by a few behaviors, such as high-cardinality properties and unbounded queries, and because spikes arrive without warning.",
    k: ["Autoscaling versus provisioned capacity: autoscaling follows spikes and saves on quiet periods, while provisioned capacity is predictable but wasteful or overwhelmed.", "Charging by event volume versus by data stored: event pricing is simple and matches ingestion cost, while storage pricing matches long-term cost but is harder to predict."],
    p: ["One customer adding a unique value as a property multiplies storage in a week.", "A viral page triples traffic and the queue backs up because consumer capacity did not scale."],
    v: "Replay a tripled traffic load against a staging copy and confirm collectors, queue and jobs keep within latency objectives, and a per-tenant cost report attributes the extra load to the right property.",
    dep: ["quotas-and-metering", "pipeline-monitoring", "hot-warm-cold-tiering"]
  },
  "quotas-and-metering": {
    s: "Counts each tenant's events, queries and storage, and enforces plan limits with graceful responses when they are exceeded.",
    d: "Counters accumulate per tenant at the edge and in the query layer, are aggregated into usage records and compared to limits. Behaviors beyond a limit are defined: continue and bill, throttle, sample, or reject with a clear status. Usage is exposed to customers and to billing. It is hard because counts must be accurate enough to bill yet cheap enough not to slow the edge, and because enforcement at the edge uses slightly stale data.",
    k: ["Hard limits versus soft limits with overage billing: hard limits protect the platform but lose customer data, while soft limits keep data and risk surprising bills.", "Exact counters versus approximate: exact counts support billing disputes but need coordination, while approximate counters are cheap and good enough for enforcement."],
    p: ["A hard limit drops data on a busy day and the customer's traffic report has a hole they cannot recover.", "Metering counts rejected or bot events, and customers pay for traffic they never wanted."],
    v: "Exceed a test tenant's event limit and confirm behavior matches the documented policy, usage counters match the number sent within tolerance, and a notice is delivered before the limit.",
    dep: ["rate-limiting-and-abuse", "metadata-store", "tenant-isolation"]
  },
  "deploy-and-migration": {
    s: "Rolling out new code, schema changes and data migrations to the pipeline and store without losing or double counting events.",
    d: "Stateless edge and workers are replaced gradually with health checks and quick rollback. Stateful jobs drain or checkpoint before restart. Schema changes follow expand-and-contract: add the new, write both, migrate, then remove the old. Large data migrations copy partitions in the background and switch atomically. It is hard because events keep arriving during every change, so old and new code must run side by side, and a bad deploy corrupts data rather than only failing.",
    k: ["Rolling updates versus blue-green cutover: rolling updates need compatible versions side by side but use little capacity, while blue-green is cleaner but duplicates the fleet.", "Migrating in place versus writing a new copy and swapping: in place saves storage but is hard to undo, while a copy is safe and reversible but costs time and space."],
    p: ["A deploy renames a column while an older worker still writes the old name and events fail validation.", "A job restarted without a drain double counts the interval since its last checkpoint."],
    v: "Deploy a new version during steady traffic and confirm the count of events accepted equals the count stored, with no gap or duplicate in the minutes around the rollout, and rollback restores the earlier version.",
    dep: ["stream-processing-jobs", "schema-registry", "metadata-store"]
  },
});
