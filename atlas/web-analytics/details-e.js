// Details for the web analytics plate, part 5: cross-cutting concerns.
ATLAS.details("web-analytics", {
  "privacy-by-design": {
    s: "Deciding up front what the platform may know about a person and building every layer to collect, keep and share no more than that.",
    d: "The choice runs through every component: whether a persistent identifier exists at all, how long raw events live, whether addresses are stored, and whether data leaves the region. Data minimization is cheapest at collection, where a field never stored never needs protecting, deleting or explaining. Controls added later must chase copies in logs, caches, exports and backups. It is hard because analytical value and privacy pull in opposite directions, and each convenience, such as a long cookie, has a privacy cost.",
    k: ["Anonymous by design versus identifiable with controls: anonymous designs avoid most obligations and risk but cannot measure returning people, while identifiable designs measure more and must carry consent, deletion and access.", "Minimizing at collection versus filtering later: collection-time minimization is safest and cheapest, while later filtering keeps flexibility but leaves a window of exposure."],
    p: ["Privacy controls are applied to the main store but not to logs, queues and exports, which keep the data.", "A new feature adds an identifier to events without any review of its privacy impact."],
    v: "Trace one test visitor's data through every store, log, queue, cache and export, and confirm that each holds only what the stated policy allows and the retention and deletion paths reach all of them.",
    dep: []
  },
  "event-time-semantics": {
    s: "Choosing which clock defines when an event happened, the device's or the server's, and how the platform handles disagreement between them.",
    d: "Every event has at least a client time, an arrival time and a processing time. Sessions, funnels and daily counts want the time the user acted, while pipelines progress by arrival. The platform must correct for device clock error, usually by comparing client send time with server receive time, and must decide how late an event may be and still change a closed day. It is hard because time zones, daylight changes, wrong device clocks and offline batching make every ordering assumption approximate.",
    k: ["Event time versus arrival time for reporting: event time reflects behavior but needs late data handling and corrections, while arrival time is stable and simple but misplaces delayed events.", "Trusting device clocks versus correcting with server time: corrected times are more consistent but add logic and rely on a network round trip, while raw device times are untouched but sometimes absurd."],
    p: ["A device with a clock set to the wrong year creates events in partitions that already expired.", "Daily reports by arrival time attribute a midnight session to the wrong day."],
    v: "Send events with deliberately skewed device clocks and late delivery, and confirm the stored event time is corrected within the stated tolerance and the day assignment matches the property's time zone.",
    dep: []
  },
  "accuracy-vs-cost": {
    s: "Deciding how much exactness the platform pays for, through sampling, sketches, rollups and retention, and being honest about the resulting error.",
    d: "Exact answers over raw events are the most expensive. Each saving, such as sampled scans, probabilistic distinct counts, coarse rollups or shorter retention, introduces an error or a limit that should be bounded and shown. Different questions deserve different tradeoffs: billing and conversion counts need exactness, while a long-tail page ranking does not. It is hard because users read every number as exact, and errors compound when approximate results are combined.",
    k: ["Exact by default versus approximate by default: exact answers avoid doubts but limit scale and speed, while approximate defaults scale but demand visible error indicators.", "One accuracy level for all metrics versus per-metric: one level is simple to explain, while per-metric levels spend precision where it matters but are more complex."],
    p: ["Approximate figures appear in an invoice or financial report and are treated as exact.", "Combining a sampled metric with an exact one produces a ratio whose error nobody can state."],
    v: "Compare approximate and exact results for a sample of reports across sizes, and confirm observed error stays within the published bound and every approximate figure is labeled as such in the interface and API.",
    dep: []
  },
  "schema-evolution": {
    s: "How event shapes, definitions and storage layouts change over years while old data stays readable and reports remain comparable.",
    d: "Sites add events and properties, rename things and change meanings. The platform needs versioned schemas, rules for compatible changes, mappings from old to new, and a way to evolve stored data without rewriting everything. Metrics must state when their definition changed. It is hard because the data outlives the code that wrote it, because consumers upgrade at different times, and because the cheapest change for the developer often silently breaks a report months later.",
    k: ["Additive-only changes versus allowing breaking ones with migration: additive-only is safe and simple but accumulates clutter, while breaking changes keep the schema clean at the cost of migrations.", "Schema on write versus schema on read: schema on write catches problems early and keeps queries fast, while schema on read accepts anything and moves every cost and error to query time."],
    p: ["A property changes meaning, for example from cents to dollars, without a new name, and the trend breaks.", "A team removes a deprecated field that historical rollups still depend on."],
    v: "Make a compatible and an incompatible schema change in a staging environment, and confirm old events still validate and query, the incompatible change is blocked or flagged, and metric history shows the change date.",
    dep: ["schema-registry"]
  },
  "tenant-isolation": {
    s: "Making sure one customer's data, load and failures cannot be seen by or affect another, in a platform where many share the same machines.",
    d: "Isolation applies at several levels: data access through tenant keys on every query, storage separation by partition or encryption key, resource limits on queries and ingestion, and separate failure domains for the largest customers. The simplest model shares everything with strict filters; the strongest gives each tenant their own stack. It is hard because a single missed filter in one new code path exposes data, and because noisy neighbors can degrade shared systems without any breach.",
    k: ["Shared infrastructure with tenant filters versus dedicated stacks: shared is efficient and easy to operate, while dedicated stacks isolate strongly but cost far more.", "Enforcing isolation in the query layer versus in storage: query-layer rules are flexible, while storage-level separation survives application bugs."],
    p: ["A new endpoint forgets the tenant filter and returns another account's rows.", "One tenant's heavy query consumes the shared pool and slows everyone."],
    v: "Using one tenant's credentials, request another tenant's identifiers on every access path, and confirm all return denials, then run a heavy query as one tenant and confirm another's latency stays within objectives.",
    dep: []
  },
  "measurement-bias": {
    s: "The systematic ways measured numbers differ from reality: blocked scripts, declined consent, cleared cookies, bots and unlinked devices.",
    d: "Every collection method misses some visitors, and the missing are not random: privacy-conscious and technical users block more, mobile apps lose events on poor networks, shared devices merge people. Metrics inherit these biases in different ways: visitor counts inflate from cleared identifiers, conversions deflate from blocked scripts. A mature platform estimates the size of the gaps, reports them next to the figures and avoids false precision. It is hard because the gap cannot be measured from inside the data itself.",
    k: ["Reporting measured numbers as they are versus adjusting for estimated loss: raw numbers are verifiable and honest about what was seen, while adjusted numbers approximate reality and rest on assumptions.", "Server-side logs as a reference versus none: logs give an independent baseline for traffic loss, but include bots and cannot see client behavior."],
    p: ["Teams compare analytics against an ad platform and decide one is broken, when each measures a different population.", "A trend caused by rising blocker use is read as falling interest."],
    v: "Compare analytics visitor and pageview counts with server access logs for the same period after bot removal, and confirm the platform's estimated unmeasured share explains the difference within a stated margin.",
    dep: []
  },
});
