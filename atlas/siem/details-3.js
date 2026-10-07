// Details for the SIEM plate, part 3: platform, tenancy and access; threat intelligence and enrichment.
ATLAS.details("siem", {
  "tenancy-and-isolation": {
    s: "Separating the data, configuration and workload of different business units or customers within one deployment, so none can see or disturb another.",
    d: "Each tenant gets its own namespace for indexes, rules, cases and users, enforced at query time and in storage, with per-tenant quotas for ingest and search. Managed providers run hundreds of tenants on shared clusters; large enterprises use it for subsidiaries and regulated units. Isolation can be logical, by tags and filters, or physical, by separate clusters. The hard parts are noisy neighbors, cross-tenant leaks through shared caches or rule engines, and cost attribution.",
    k: ["Logical isolation on shared clusters vs separate clusters per tenant: shared is far cheaper and simpler to run, but a filter bug exposes data and one tenant's load affects others.", "Per-tenant rules vs shared content: shared content is maintained once, per-tenant allows local tuning but multiplies upkeep."],
    p: ["A shared result cache keyed without the tenant identifier returns one tenant's search results to another.", "One tenant's heavy scheduled search starves everyone else's alerting."],
    v: "As a user of tenant A, attempt to read, search and reference tenant B's indexes by name, by wildcard and through a saved search, and confirm every attempt returns nothing and is audited.",
    dep: ["access-control", "data-level-security", "platform-audit"]
  },
  "access-control": {
    s: "Roles and permissions that decide who may search which data, edit rules, run response actions, view cases or administer the platform, tied to the organization's identity provider.",
    d: "Users authenticate through single sign-on with multi-factor authentication, and receive roles mapped from directory groups. Permissions apply to data scope, features and actions: an analyst may search authentication logs, a hunter all data, only a lead may approve containment. Service accounts for integrations get narrow, rotated credentials. Hard because the SIEM sees everything, so its permissions are a map of the organization's secrets, and overbroad admin rights are common because they are convenient.",
    k: ["Roles by job function vs per-user grants: roles are auditable and easy to review, but real work crosses roles and invites exceptions that accumulate.", "Break-glass admin access vs strict separation: break-glass solves emergencies, but needs alerting and review or becomes the normal path."],
    p: ["Everyone in the security team holds administrator rights, so one phished account can edit rules and delete evidence.", "Integration accounts with full rights never rotate and are shared across tools."],
    v: "Log in as each defined role and attempt one allowed and one forbidden action of each type, search, rule edit, containment, export. Confirm forbidden attempts fail and are recorded.",
    dep: ["platform-audit"]
  },
  "data-level-security": {
    s: "Restricting access within the data itself, by masking or hiding fields, or by limiting which indexes, sources and rows a role can search, to protect personal and confidential content.",
    d: "Logs contain usernames, addresses, message bodies, tokens and sometimes secrets. Field-level controls mask or tokenize values for most analysts and reveal them under an approved, logged request. Index and source-level filters limit a role to its own business unit. Enforcement must occur in the search engine, not the interface, or exports and the API bypass it. The difficulty is that detections need the very values that privacy wants hidden, so hashing and reveal workflows must preserve joins.",
    k: ["Mask at ingest vs at query time: ingest masking means the sensitive value never exists in the SIEM, but cannot be recovered; query-time masking keeps it for authorized use.", "Row filters from role vs separate indexes: filters are flexible, separate indexes are harder to bypass and simpler to reason about."],
    p: ["Masking applied only in dashboards leaves raw values exposed through the search interface and the API.", "Credentials printed in logs are stored in clear text and visible to every analyst."],
    v: "As a restricted role, search for a known masked value across interface, export and API, and confirm none reveals it. Then use the reveal workflow and confirm the access is logged with a reason.",
    dep: ["access-control", "search-execution"]
  },
  "platform-audit": {
    s: "A tamper-resistant record of what users and automation do inside the SIEM: searches, exports, rule changes, role changes, deletions and logins, kept separately from the data it protects.",
    d: "Every administrative and data-access action produces an event written to a store that administrators cannot alter, often forwarded to a second system. It answers who searched for an employee's records, who disabled a rule, and who exported a month of logs. It supports audits and insider-threat detection. Hard parts include volume of search audit, capturing enough detail such as query text without capturing sensitive results, and making sure the audit store survives compromise of the SIEM administrators.",
    k: ["Audit in the same system vs an external store: same system is convenient and searchable, but an administrator can erase it; external adds independence at the cost of another integration.", "Log query text vs query and results: text is enough to reconstruct intent without duplicating sensitive data."],
    p: ["An administrator who can edit rules can also edit the audit index and cover the change.", "Search audit disabled to save space removes the only record of who looked at personal data."],
    v: "Change a rule, run a search, export results and delete a saved search as a test user. Confirm each appears in the audit store with user, time, object and outcome, and that an administrator cannot delete the entries.",
    dep: ["log-integrity-and-trust"]
  },
  "self-monitoring": {
    s: "The SIEM watching itself: ingest lag, parse failure, silent sources, rule errors, queue depth, search latency and storage, with alerts when its own health puts detection at risk.",
    d: "Metrics and logs from every component feed a health dashboard and alerts. The most important checks are about absence: a source that has stopped sending, a rule that has not run, an indexer far behind. Health is stated in terms of detection, such as which rules are currently blind because their source is silent. It is hard because failure is quiet, and because the tool that raises the alarm is the one that is broken.",
    k: ["Monitor the SIEM from inside vs from an independent system: inside is easy and rich, but an outage takes down its own alarm; independent checks catch total failure.", "Alert on component metrics vs on detection outcomes: component alerts are precise, outcome alerts describe what actually matters but are harder to define."],
    p: ["A source that stops sending raises no event, so its silence goes unnoticed for weeks.", "Rules failing with an error each run are counted as running because they did execute."],
    v: "Silence a test source, stall one indexer and break one rule's query. Confirm each raises a distinct health alert naming the affected detections within the configured interval.",
    dep: ["collector-management", "rule-lifecycle"]
  },
  "high-availability": {
    s: "Keeping collection, detection and search working through node, zone or site failure, with replication, failover and tested recovery procedures.",
    d: "Collectors buffer locally, queues and indexes replicate across nodes and zones, rule engines run as leader and standby, and a second site can take over. Recovery targets differ by function: losing search for an hour is annoying, losing detection during an attack is serious, and losing events is permanent. It is hard to get right because replication multiplies cost, failover paths are rarely exercised, and split-brain behavior in clustered components can produce duplicated alerts or lost state.",
    k: ["Active-active across zones vs active-passive: active-active uses all capacity and fails over fast, but costs more and complicates consistency; passive is simpler and idle.", "Replicate raw data vs rebuild indexes from raw: replicating indexes recovers fast, rebuilding saves storage and takes hours."],
    p: ["A standby site never tested fails at the first real use because credentials, certificates or rules were never synced.", "After failover, rule state is lost and every sliding-window detection starts empty, missing attacks in progress."],
    v: "Power off one zone during live ingest and confirm no events are lost, searches continue, rules keep firing without duplicate alerts, and the cluster rejoins cleanly when the zone returns.",
    dep: ["ingest-buffer", "hot-tier", "stateful-windows"]
  },
  "integration-api": {
    s: "Authenticated programmatic interfaces for searching, ingesting, managing rules and cases, and receiving alerts, so other tools and scripts can treat the SIEM as a service.",
    d: "An HTTP interface with token-based authentication exposes search jobs, alert and case resources, rule management, and ingestion endpoints, along with webhooks that push alerts out. It enables ticketing, orchestration, reporting and custom tooling. It needs versioning, rate limits, pagination and the same data-level access checks as the interface. The hard part is that it bypasses people: automated clients run broad searches and exports unnoticed, and long-lived tokens are an attractive target.",
    k: ["Asynchronous search jobs vs streaming results: jobs handle long searches and bound load, but require polling; streaming is simple for small queries and fragile for large.", "Fine-grained API tokens vs user-session tokens: scoped tokens limit damage and are auditable, but need a lifecycle process."],
    p: ["An integration token with full read rights is pasted into a script repository.", "An API change without versioning breaks every downstream integration at once."],
    v: "Using a token limited to one index, run a search, create a case and read an alert through the API. Confirm out-of-scope requests are refused and every call appears in the audit log.",
    dep: ["access-control", "data-level-security", "platform-audit"]
  },
  "content-sync": {
    s: "Managing rules, parsers, dashboards and playbooks as versioned files, promoted through environments by a pipeline instead of edited by hand in the live system.",
    d: "Content lives in a repository with review, history and automated checks. A pipeline validates syntax, runs tests against sample data, then deploys to a staging environment and production, and detects drift where the live system differs from the repository. This gives rollback, attribution of changes and consistent deployment across tenants. Hard because analysts edit live for speed, content depends on schema and parser versions, and secrets and environment-specific values must be kept apart from content.",
    k: ["Content as code in a repository vs edits in the interface: code gives review and rollback, but slows urgent fixes unless there is a fast path.", "One pipeline for all tenants vs per-tenant overrides: one is consistent and cheap, overrides allow local needs but cause divergence."],
    p: ["A live edit during an incident is never committed, and the next deployment overwrites it.", "Content promoted without its parser change fails on production data that staging never saw."],
    v: "Change a rule in the repository, confirm review and tests run, deploy to staging then production, and confirm the live definition matches the commit. Edit it live and confirm drift is reported.",
    dep: ["rule-lifecycle", "rule-testing", "access-control"]
  },
  "intel-ingestion": {
    s: "Pulling threat intelligence from commercial, open and community feeds, and from internal sources, into the platform in structured form with source, confidence and validity.",
    d: "Feeds arrive over polling, push or sharing protocols as lists of indicators such as addresses, domains, file hashes and patterns, with type, confidence, expiry and context. An ingestion job validates format, removes duplicates across feeds, normalizes types and records provenance. Quality varies greatly: some feeds are precise and curated, others are bulk lists full of stale or shared infrastructure. The hard part is selecting feeds by usefulness for your environment, not by indicator count.",
    k: ["Many feeds for breadth vs few curated feeds: breadth catches more but multiplies false positives; curated feeds are accurate and may miss relevant threats.", "Structured sharing format vs plain lists: structure carries confidence and context, plain lists are simpler and lose the information needed to prioritize."],
    p: ["Ingesting a feed with shared hosting addresses flags thousands of legitimate connections as malicious.", "A feed that silently stops updating leaves indicators years out of date."],
    v: "Ingest a test feed with known entries, confirm each appears with source, type, confidence and expiry, duplicates from a second feed merge into one record, and a deliberately malformed entry is rejected and counted.",
    dep: ["indicator-store"]
  },
  "indicator-store": {
    s: "A queryable database of indicators and their metadata, optimized for fast lookup of an event's values against millions of entries.",
    d: "Indicators are stored by type with keys designed for exact lookup, and optionally prefix or pattern lookup for networks and domains. Each carries source, confidence, first and last seen, tags and expiry. It must serve both batch matching against history and real-time lookups at ingest rate. Challenges include size, since feeds hold tens of millions of items, update frequency, and keeping lookups consistent while indicators change underneath running rules.",
    k: ["In-memory lookup structure vs query against the search store: memory is orders of magnitude faster for ingest-time matching, but must be rebuilt and distributed to every node.", "One record per indicator vs per source: per indicator is compact, per source preserves provenance and confidence differences."],
    p: ["A lookup table rebuilt non-atomically briefly contains no entries, and rules miss matches during the rebuild.", "Case differences or trailing dots in domains make exact lookups miss obvious matches."],
    v: "Load a million test indicators, run lookups for present and absent values at ingest rate, and confirm all hits are correct, none are missed after a table refresh, and added indicators match within the stated delay.",
    dep: ["intel-ingestion"]
  },
  "indicator-matching": {
    s: "Comparing events against the indicator store, either as they arrive or retroactively over history, and raising a match with the indicator's context and confidence.",
    d: "Real-time matching joins selected event fields, such as destination address, queried domain, file hash and user agent, against the store at ingest or in streaming rules. Retroactive matching runs when a new indicator arrives, searching past data for earlier contact. Matches are alerts or enrichment attached to events. Hard parts are the false positive rate from low-confidence indicators, cost of historical scans, and fields that differ in form, such as defanged addresses or hashes in other cases.",
    k: ["Match at ingest vs retroactively: ingest matching is cheap and immediate, retroactive scans find prior compromise by new intelligence at higher search cost.", "Alert on every match vs score by confidence: alerting on all is simple and floods analysts, scoring needs tuning to be trusted."],
    p: ["Matching on shared cloud addresses produces alerts for all customers of the same hosting provider.", "A new indicator is never searched retroactively, so a breach that began last month goes unseen."],
    v: "Add an indicator for an address seen two weeks ago and one present in a live event. Confirm the live event is matched at ingest and the retroactive job finds the historical event.",
    dep: ["indicator-store", "stateful-windows", "search-execution"]
  },
  "indicator-aging": {
    s: "Expiring, decaying and revoking indicators as they go stale, because infrastructure used by attackers is reassigned and an old match is more likely to be wrong than right.",
    d: "Each indicator has a validity period or a confidence that decays with time since last seen, and feeds may explicitly revoke entries. Aging removes or demotes them, and manual allowlists override. Different types age at different rates: addresses and domains within days or weeks, file hashes longer, behavioral patterns longest. The difficulty is deciding rates without data, and remembering that a removed indicator still matters for investigating past events, so historical matches should keep their original context.",
    k: ["Hard expiry vs decaying confidence: expiry is simple and bounded, decay keeps old signals at lower weight but requires scoring rules that use it.", "Honor feed revocations immediately vs review: immediate stops false positives fast, review avoids dropping a good indicator after a feed error."],
    p: ["Never-expiring address indicators eventually point at innocent users of recycled infrastructure.", "Deleting expired indicators erases the explanation of why an old alert fired."],
    v: "Set test indicators with short validity, wait past it, and confirm new events no longer match while old alerts still show the indicator context that triggered them.",
    dep: ["indicator-store"]
  },
  "asset-context": {
    s: "Business context about hosts, users, applications and data, such as owner, criticality, role and location, joined to events so alerts can be judged by what they affect.",
    d: "Context comes from configuration databases, directories, cloud inventories, vulnerability data and human-maintained lists. It is stored as lookup tables or an entity store keyed by hostname, address, account and cloud identifier, and attached at ingest or query. It lets a rule distinguish a scan of a test server from one of a payment system, and tells an analyst who to call. The hard part is freshness and identity: dynamic addresses, renamed hosts and departed employees make stale context confidently wrong.",
    k: ["Join at ingest vs at query time: ingest joins freeze the context as it was at the time, query-time joins use current data and can misdescribe the past.", "Single authoritative inventory vs merging several: one source is clean, but incomplete; merging covers more and needs conflict rules."],
    p: ["Dynamic address leases reassigned to different hosts attach the wrong owner and criticality to events.", "An inventory that omits cloud workloads gives them default low criticality."],
    v: "Pick ten known hosts including a recently renamed one and a recently reassigned address, and confirm events from each carry the correct owner, role and criticality as of the event time.",
    dep: ["enrichment-pipeline", "entity-resolution"]
  },
  "geo-and-reputation": {
    s: "Lookups that add geographic location, network owner, domain age, popularity and reputation to addresses and domains, helping judge whether a connection is unusual.",
    d: "Lookup databases map addresses to country, region and network owner, and domains to registration date, rank and classification. Services may be queried live with caching, or loaded as downloadable tables. The values feed rules such as impossible travel and first-time country. Accuracy is limited: address geography is approximate and wrong for mobile carriers, proxies and anonymizing services, and live lookups leak what the organization is investigating to a third party.",
    k: ["Local database vs live lookup service: local is fast, private and free per query, but ages between updates; live is current and adds delay, cost and disclosure.", "Treat location as evidence vs as a hint: evidence-grade use creates false alerts from approximate data."],
    p: ["Country derived from a corporate proxy's address makes every user appear to travel to the same place.", "Sending internal indicators to a public lookup service reveals an investigation to outsiders."],
    v: "Look up a set of addresses with known owners and locations, including a mobile carrier and a proxy, and confirm results match expectation and that the lookup tables report their last update date.",
    dep: ["enrichment-pipeline"]
  },
  "enrichment-pipeline": {
    s: "The stage that adds context to events, from lookups and joins against indicators, assets, identities and geography, either at ingest for durable fields or at query time for fresh ones.",
    d: "After normalization, a sequence of enrichers adds fields: indicator match flags, asset criticality, user department, geography. Each is a lookup with caching and a defined behavior on timeout. Ingest enrichment makes the added fields searchable and fast; query-time enrichment keeps storage small and context current. The challenges are throughput, since lookups on every event add latency, ordering of dependent enrichers, and what to do when a lookup source is down.",
    k: ["Enrich at ingest vs at query time: ingest is fast to search and fixed in time; query time is current and slower and cannot be used by streaming rules.", "Fail open vs fail closed when a lookup is down: failing open keeps events flowing without context, failing closed preserves quality and risks backlog."],
    p: ["A slow external lookup stalls the pipeline and delays every event behind it.", "Enriching with values current today records them permanently, misleading later investigations of the past."],
    v: "Disable one lookup source during ingest and confirm events continue flowing, are marked as not enriched, and are re-enriched when the source returns. Measure added latency per event.",
    dep: ["indicator-store", "ingest-buffer"]
  },
});
