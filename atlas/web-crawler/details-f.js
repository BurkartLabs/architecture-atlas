// Details for the web crawler plate, part 6: operations, policy and the cross-cutting concerns.
ATLAS.details("web-crawler", {
  "crawl-health-dashboards": {
    s: "Dashboards showing throughput, success rates, queue depth, freshness and coverage, so operators can tell whether the crawl is healthy and productive.",
    d: "Panels cover fetches per second, bytes per second, outcome mix by class, frontier size by priority, age of important pages, new host discovery, duplicate rate and per-worker utilization. Breakdowns by host, top-level domain and worker answer where a problem is. Output quality gets its own panels, such as share of pages with extractable text. It is hard because a crawl can look busy while producing little: high throughput of duplicate or error pages is not progress, so quality and yield belong beside volume.",
    k: ["Volume metrics only vs also yield metrics: volume is easy to collect and hides waste; yield metrics expose duplicates and empty pages and need extraction data.", "Aggregate views vs per-host drill-down: aggregate shows trends; per-host finds the one host consuming budget, at cardinality cost."],
    p: ["A dashboard showing only success rate hides a crawl fetching millions of identical pages.", "Per-host metrics with unbounded cardinality overwhelm the metrics store."],
    v: "Inject known faults into a test crawl: a trap host, a slow region, a robots outage. Confirm each is visible on a dashboard within minutes and the panel identifies the affected host or worker.",
    dep: ["error-classification-metrics","url-state-table"]
  },
  "error-classification-metrics": {
    s: "Counts every failed or unusual fetch under a stable set of classes, such as DNS failure, timeout, refused connection, blocked, throttled and parse error.",
    d: "Each failure is mapped to one class at the point it happens, with host, worker and time attached. Classes are fine enough to indicate action: a rise in DNS failures points at the resolver, a rise in throttling at rate settings, a rise in blocks at identification or reputation. The same counts feed rate control and host scoring. It is hard because errors arrive as a long tail of messages from many libraries, and a poor mapping lumps different causes into one class.",
    k: ["Fixed small class set vs raw error strings: fixed gives stable graphs and alert rules; raw strings keep all detail and are unusable for aggregation.", "Classify at the source vs centrally: at source keeps context and spreads logic across components; central is consistent and loses detail."],
    p: ["An 'other' class that grows to half of all failures hides new failure modes.", "Counting a retry as a new failure inflates error rates after every outage."],
    v: "Trigger each failure type against test servers: refused connection, reset, timeout, bad certificate, 429, 503. Confirm each lands in its documented class once, with host and worker labels, and the class totals equal the number of injected failures.",
    dep: ["status-code-handling","timeouts-and-deadlines"]
  },
  "alerting-and-paging": {
    s: "Rules that notify operators when the crawl deviates from expected behavior, such as stalled queues, rising block rates, resolver failure or budget overrun.",
    d: "Alerts are tied to symptoms that need action: throughput below a floor, a growing share of 403 or 429 responses, queue age rising, a worker silent, storage near capacity, complaint volume rising. Each alert names an owner and a first step. Thresholds are relative to a baseline by time of day. It is hard because crawls are noisy and operators ignore noisy alerts; alerts that fire on every flaky host teach people to mute them, and the genuine global failure hides among them.",
    k: ["Static thresholds vs baselines with deviation detection: static are understandable and brittle over time; baselines adapt and can mask slow decay.", "Page on symptoms vs on causes: symptoms catch unknown failures with less clarity; causes are specific and miss new ones."],
    p: ["Per-host alerts for flaky sites generate hundreds of pages a day, and operators mute the channel.", "A stalled frontier produces no errors, so no alert fires without a throughput-floor rule."],
    v: "Simulate a stalled frontier, a spike of 429 responses and a dead worker. Confirm each produces exactly one page to the right owner within the target time, and a flaky single host does not.",
    dep: ["crawl-health-dashboards","error-classification-metrics"]
  },
  "bandwidth-budget-manager": {
    s: "Allocates the crawl's network capacity across workers, regions and crawl jobs, and throttles fetching so it stays within the data-center and transit limits.",
    d: "Each region has an egress and ingress limit; the manager tracks use and divides it among jobs and workers by weight. When a limit nears, it lowers fetch concurrency or pauses lower-priority work first. Large downloads count against byte budgets, not request counts. Budgets reset by day or month as the contract requires. It is hard because a crawl is bursty, bandwidth cost depends on the transit commitment, and a worker that ignores its share can starve the others or breach a commit.",
    k: ["Central allocation vs local limits per worker: central balances globally and needs frequent updates; local is simple and wastes unused capacity.", "Throttle by lowering concurrency vs by token bucket on bytes: concurrency is simple and imprecise for large files; token bucket is exact and needs a shared view."],
    p: ["Counting requests and not bytes lets a few huge downloads exceed the link.", "Budget split evenly across workers leaves some regions saturated and others idle."],
    v: "Set a low regional byte budget in a test crawl. Confirm measured egress stays at or under the limit, lower-priority jobs are slowed first, and unused share is reassigned to busy workers.",
    dep: ["crawl-scheduler","size-and-time-limits","config-and-rollout"]
  },
  "crawl-budget-accounting": {
    s: "Tracks requests, bytes and time spent per host, per crawl and per purpose, and enforces the quotas the scheduler and caps rely on.",
    d: "Counters are kept per host and per job in rolling windows, aggregated across workers through the owner of the host. They feed the scheduler's choice of what to dispatch, the per-host caps, the discovery and refresh split, and reports to the Board of what the crawl spent. Budgets are set from host quality and policy. It is hard because accounting must be cheap on the hot path, needs to remain correct across failovers and rebalances, and must not become the thing that stops the crawl.",
    k: ["Exact counters vs approximate sampled counters: exact are auditable and cost writes; sampled are cheap and drift.", "Per-host windows vs a running total per crawl: windows enforce rates and quotas; totals are simple and cannot throttle."],
    p: ["Counters lost during failover reset a host's usage and let it exceed its quota.", "Counters updated by every worker per request contend and slow the fetch path."],
    v: "Run a test crawl with a known quota per host and per job. Compare the accounting totals with the access log and confirm they agree within the allowed error, and that quota enforcement stops fetching at the limit.",
    dep: ["url-state-table","host-partitioner"]
  },
  "config-and-rollout": {
    s: "Versioned crawl configuration, covering scopes, rates, filters and rules, deployed to workers gradually with the ability to roll back.",
    d: "Configuration is stored as versioned data, validated before release, and applied to a small share of workers first while the dashboards are watched for change. It includes politeness defaults, filter rules, scope definitions, priorities and feature flags. Workers report the version they run. Changes that affect request behavior, such as lowering a delay, are the most careful. It is hard because a bad rule can hit millions of hosts in minutes, and a cache of rules in workers makes rollback slower than expected.",
    k: ["Staged rollout vs all-at-once: staged limits harm from a bad change and takes longer; all-at-once is quick and risky.", "Config as data vs config in code: data changes fast without deploys; code has review and tests and a slower release."],
    p: ["A filter with a typo blocks every URL on a popular host family before anyone notices.", "A rollback that reverts config but not the rule caches in workers leaves the bad behavior in place."],
    v: "Roll out a deliberately harmless config change to ten percent of workers, confirm only those report the new version and the metrics diverge as expected, then roll back and confirm all workers return to the old version.",
    dep: ["coordination-metadata","crawl-health-dashboards"]
  },
  "crawl-simulator": {
    s: "A model of the crawl that replays recorded or synthetic web graphs against the real scheduling and politeness logic, to test policy changes without touching real sites.",
    d: "The simulator runs the frontier, scoring, politeness and revisit logic against a virtual web with page graphs, change rates, latencies and failure behaviors drawn from real measurements. Policy changes, such as a new priority function or revisit rule, are evaluated on freshness, coverage and request rates before release. It is hard because the model is only as good as its assumptions, and the real web has behaviors it does not include, so results guide decisions and do not replace a staged live test.",
    k: ["Synthetic graph vs replay of a measured crawl: synthetic is controllable and may miss real structure; replay is realistic and fixed to what was observed.", "Run the real scheduling code vs a reimplementation: real code tests what ships; a reimplementation is faster and can diverge."],
    p: ["Tuning a policy to the simulator's assumptions makes it look better there than in production.", "A simulator that skips politeness never reveals a policy that violates host delays."],
    v: "Simulate the current policy and compare freshness, coverage and request rates with those measured in the live crawl over the same period. Confirm the simulator reproduces them within a stated margin before trusting a policy comparison.",
    dep: ["crawl-scheduler","revisit-scheduler","back-queues-per-host"]
  },
  "fetch-audit-log": {
    s: "An append-only record of every request the crawler made, with time, address, URL, outcome and the rule that allowed it, kept so complaints and incidents can be investigated.",
    d: "Each fetch writes a compact log line: timestamp, worker, source address, target host and URL, status, bytes, duration and the version of the robots rules in effect. Logs are retained for a defined period and indexed by host and time. They answer questions from site owners such as 'what did you request from my server at 3am' and prove compliance with robots rules. It is hard because the volume is billions of lines a day, so the format is terse and the retention window costs storage.",
    k: ["Log every request vs sample: every request answers any complaint; sampling saves storage and cannot prove a negative.", "Short retention vs long retention: short saves money and fails to answer late complaints; long supports investigations and legal requests at a storage cost."],
    p: ["A log without the robots rule version cannot show that a fetch was allowed at the time.", "Logs retained only on the worker that fetched are lost when that worker is replaced."],
    v: "Pick a random request from the previous week by host and time and retrieve its log entry. Confirm it shows the source address, outcome and rule version, and that a complaint query for one host returns all its requests in a time range.",
    dep: ["robots-cache","archive-file-store"]
  },
  "crawler-identification": {
    s: "The declared name of the crawler, sent in requests and matched in robots files, with a stable string and a link to a page explaining who runs it.",
    d: "The agent string includes a product token, a version and a URL describing the crawler, its purpose and how to contact the operator. The same token is the name sites use in robots groups. The identity does not vary by target site. Different crawls for different purposes use different tokens so owners can treat them separately. It is hard because changing the token breaks every site's existing rules, and because other parties impersonate popular crawlers, so identity must be verifiable by more than the string.",
    k: ["One token for all crawls vs a token per purpose: one is simple for owners; per purpose lets them allow search while blocking other uses.", "Descriptive string with contact URL vs minimal token: descriptive builds trust and costs bytes per request; minimal is compact and gives owners nothing to act on."],
    p: ["Renaming the crawler leaves old robots groups unmatched, so sites silently apply their general rules.", "Using a browser-like string causes site owners to treat the crawler as an attacker."],
    v: "Inspect requests captured at a test server and the robots matching code. Confirm the agent string is identical across workers, includes the contact URL, and that rules written for the published token apply to the crawler.",
    dep: ["verification-and-contact-page"]
  },
  "verification-and-contact-page": {
    s: "A public page and verification method that let site owners confirm a request came from the crawler and learn how to control or contact it.",
    d: "The page explains what the crawler does, which tokens and address ranges it uses, how to write rules for it, and how to report a problem. Owners verify a request by reverse lookup of the source address and a forward lookup that must match, or by a published list of address ranges. The page is hosted separately from the crawl so it stays up during incidents. It is hard because it must be kept accurate as address ranges change, and it is the first page a worried owner reads.",
    k: ["Reverse DNS verification vs published address list: reverse DNS needs no updates by owners and relies on correct records; a list is explicit and must be fetched and cached.", "Static page vs generated from configuration: static is simple and goes stale; generated stays accurate with the configuration."],
    p: ["Address ranges changed without updating the published list cause owners to block real crawler traffic.", "A contact page that is slow or down during an incident makes the crawler look abandoned."],
    v: "For each source address, run the documented reverse and forward lookups and compare with the page's list. Confirm the page loads during a simulated crawl outage, and that the contact route reaches an owned mailbox.",
    dep: ["egress-ip-pool"]
  },
  "complaint-handling": {
    s: "The process by which reports from site owners about load, content or behavior are received, triaged and resolved quickly, with the cause and fix recorded.",
    d: "Complaints arrive by a mailbox or form. Triage identifies the host from the report, looks up the audit log for requests in the stated time, and classifies the cause: legitimate rate, rule not honored, bug, impersonator. Common fixes are a lowered delay or a block for that host while a bug is repaired. Owners get a direct reply. It is hard because owners are often upset, the first reply sets whether they block the crawler for good, and complaints about impersonators look just like real ones.",
    k: ["Fast temporary block then investigate vs investigate before acting: blocking stops harm at once and may lose coverage; investigating is accurate and prolongs the problem.", "Per-case handling vs automated responses: per-case is considerate and slow; automation scales and mishandles unusual cases."],
    p: ["A complaint about a spoofed crawler is handled as a real one and the real crawler is blocked from a host.", "No record of the fix means the same host is overloaded again after a config rollout."],
    v: "File a test complaint naming a host and a time window. Confirm it reaches the queue, the audit log retrieves the matching requests, the host is slowed or blocked within the target time, and the owner receives a reply.",
    dep: ["fetch-audit-log","blocklist-and-opt-out","crawl-delay-policy"]
  },
  "blocklist-and-opt-out": {
    s: "The list of hosts, networks and patterns the crawler must never fetch, and the way owners and operators add to it, applied to every URL before dispatch.",
    d: "Entries come from owner requests, legal orders, abuse reports, and internal safety rules. They can be host, domain, network or URL pattern, with a reason and an expiry or review date. Checks run at link intake, before dispatch and on redirect targets, because stale queue entries must also be removed. Changes propagate to all workers within minutes. It is hard because a block must be effective everywhere at once, including URLs already in queues, redirect chains and rendering sub-requests.",
    k: ["Block at intake only vs at every stage: intake is cheap and leaves queued URLs; every stage is complete and costs a lookup per step.", "Domain-level blocks vs URL-level blocks: domain is simple and broad; URL-level is exact and takes more rules."],
    p: ["A blocked host is still fetched through a redirect from an allowed page.", "Queued URLs for a blocked host stay in the frontier and are fetched after the block is lifted by mistake."],
    v: "Add a test host to the blocklist and watch the access log. Confirm no request reaches it from any path, including redirects and rendering, within the propagation target, and that queued URLs for it are purged.",
    dep: ["url-filters","coordination-metadata"]
  },
  "legal-and-jurisdiction-rules": {
    s: "Rules that restrict what may be fetched, stored or retained depending on the law where the crawler, the site and the data subjects are.",
    d: "Requirements vary: limits on personal data, rules on copyright and database rights, retention periods, access that bypasses technical barriers, and requirements for notice. The crawler encodes them as policies: skip authenticated areas, honor machine-readable opt-outs, never bypass paywalls or login barriers, expire certain data, and keep records of what was taken. Legal staff define the rules and engineering enforces them as configuration. It is hard because the rules differ by region, change, and cannot be fully decided by software.",
    k: ["One strict global policy vs per-jurisdiction rules: global is simple and over-restricts; per-jurisdiction is precise and needs reliable location and legal input.", "Filter at fetch vs filter at storage or use: at fetch avoids holding data at all; at storage keeps flexibility and creates exposure."],
    p: ["Fetching behind a login by reusing a leaked cookie violates site terms and law.", "Retention rules applied in the index but not in the raw archive keep data that should have been deleted."],
    v: "For each documented rule, run a test case: a page in a restricted category, a login-gated page, a record past retention. Confirm each is skipped, flagged or deleted as the rule states, and that the audit log records the decision.",
    dep: ["blocklist-and-opt-out","archive-file-store","fetch-audit-log"]
  },
  "takedown-processing": {
    s: "The workflow for removing specific pages or whole hosts from stored data and downstream systems after a valid request, and keeping them removed on later crawls.",
    d: "A request is verified, matched to URLs or a host, and recorded. The crawler adds a block so the content is not fetched again, marks existing records, and sends tombstones downstream so the index drops the pages. Raw archive records are deleted or sealed according to policy. The request and the action are kept as evidence. It is hard because the content exists in many places: archive files, content-addressed bodies, duplicate clusters, caches and downstream indexes, and a removal that misses one copy has not removed it.",
    k: ["Delete from archives immediately vs mark and purge on compaction: immediate is complete at once and expensive on immutable files; mark and purge is cheap and leaves data for a while.", "Block by URL vs by content hash: by URL is simple and misses copies; by hash catches copies and risks blocking legitimate duplicates."],
    p: ["A page removed from the index but still in the archive reappears in a later reprocessing.", "A takedown that ignores duplicate clusters leaves identical copies at other URLs."],
    v: "Process a test takedown for a stored page. Search the archive, content store, duplicate clusters, downstream index and caches for it and confirm none returns it, then recrawl the host and confirm it is not fetched again.",
    dep: ["blocklist-and-opt-out","downstream-handoff","content-addressed-store","duplicate-cluster-store"]
  },
  "content-usage-signals": {
    s: "Reads and records machine-readable statements of how a site permits its content to be used, beyond access rules, and passes them to downstream consumers.",
    d: "Sites publish preferences in robots rules, page directives, headers and separate policy files, covering uses such as indexing, snippets, caching and training of models. The crawler collects them at fetch time, stores them with the page record and the version in force, and makes them available to every consumer so each can honor the ones that apply. The standards are young and inconsistent. It is hard because there is no single vocabulary, and a signal that is not stored at fetch time cannot be recovered later.",
    k: ["Store raw signals vs interpret them at crawl time: raw keeps flexibility as standards change; interpreted is simple for consumers and can be wrong later.", "Honor the most restrictive signal vs the most specific: restrictive is safe and loses usable content; specific follows the owner's intent and is harder to define."],
    p: ["A signal in a header is ignored because only page markup is parsed.", "Signals stored without timestamps cannot show which policy applied when the page was taken."],
    v: "Serve pages carrying signals in markup, headers and policy files. Confirm each is recorded with the page, the version and time are saved, and a consumer query for a restricted use excludes the right pages.",
    dep: ["meta-robots-directives","robots-parser","downstream-handoff"]
  },
  "unsafe-content-filters": {
    s: "Detectors that identify malware hosts, phishing, illegal material and abusive content during or after fetching, so it is not stored, served or spread by the crawler.",
    d: "Lists of known bad hosts and hashes are checked before and after fetch. Content scanners examine executables, scripts and archives in an isolated environment. Illegal material is handled by matching known hashes, quarantining, and reporting where required by law. Detected hosts are blocked and marked. It is hard because crawlers deliberately visit untrusted servers, so the fetchers and parsers themselves are an attack surface, and because false positives remove real sites while misses expose people downstream.",
    k: ["Block before fetch from lists vs scan after fetch: lists are fast and miss new threats; scanning finds more and means the crawler has already touched the content.", "Quarantine suspicious content vs discard: quarantine allows review and keeps the material; discarding is simple and loses the evidence."],
    p: ["Parsing a hostile file in the main fetch process lets it compromise the worker.", "Over-broad malware flags remove legitimate hosting providers from the crawl."],
    v: "Fetch a test set containing a benign file, a harmless malware test file and a known bad hash. Confirm each is classified correctly, the bad ones are quarantined or blocked and logged, and the fetch process remains isolated and healthy.",
    dep: ["document-extractors","blocklist-and-opt-out","fetch-worker"]
  },
  "politeness-vs-throughput": {
    s: "Every second spent waiting for a host's delay is capacity unused, so the whole crawl is organized around keeping many hosts in flight instead of going faster at each.",
    d: "A single host can only be fetched slowly, so total throughput comes from parallelism across hosts: the frontier is structured by host, the fetcher holds thousands of connections, DNS is prefetched, and distribution is by host. Politeness is a hard invariant, not a tuning knob, and every component that can send a request, including redirects, rendering sub-requests, robots fetching and retries, must go through it. The consequence is that a crawl is limited by the number of reachable hosts and their delays, not by bandwidth.",
    k: ["Strict per-host limits vs relaxed limits for large sites: strict is safe and slow on big sites; relaxed is faster and relies on estimating a site's capacity.", "Enforce politeness centrally vs at each worker: central is exact and a bottleneck; per worker is scalable and relies on host ownership being exclusive."],
    p: ["A new code path that fetches without going through the host queue, such as an icon or robots fetch, bypasses limits.", "Optimizing throughput on a few large hosts leaves the long tail unreached."],
    v: "Crawl a test farm and compare the access log of every host against its delay and concurrency limits, including robots, redirect and rendering requests. Confirm zero violations while worker utilization stays above its target.",
    dep: []
  },
  "freshness-vs-coverage": {
    s: "A fixed fetch budget must be split between discovering new pages and re-fetching known ones, and the split determines whether the corpus is broad, current, or neither.",
    d: "Every fetch spent on a revisit is not spent on a new page. Budget policy, scoring, revisit scheduling, per-host caps and conditional requests all express a position on this trade-off. Different purposes want different positions: a news-focused index weights freshness and a research corpus weights breadth. The consequence is that the scheduler must have an explicit objective, with measured freshness of important pages and measured coverage of the target web, not just a throughput number.",
    k: ["Weight freshness of popular pages vs uniform freshness: popularity weighting serves users best and neglects the long tail; uniform is fair and spends budget on pages nobody reads.", "Fixed split vs adaptive split: fixed is predictable and ignores changing conditions; adaptive follows measured staleness and discovery yield."],
    p: ["Measuring only pages fetched per day, which rewards cheap duplicates, leads the policy toward neither goal.", "Discovery growth silently consumes all capacity and freshness degrades across the corpus."],
    v: "Track two numbers daily: the age distribution of important pages and the fraction of a held-out sample of the target web that has been fetched. Confirm a policy change moves them in the intended direction.",
    dep: ["discovery-vs-refresh-balance","revisit-scheduler"]
  },
  "host-partitioning": {
    s: "Splitting the crawl by host keeps all state for a host in one place, which makes politeness cheap and cross-worker routing the main cost.",
    d: "Because delays, robots rules, connection reuse, history and queues are all per host, putting a host's work on one worker removes the need for distributed locks on the fetch path. The cost moves to link routing, since most links go to another host's owner, and to skew, since hosts vary in size by orders of magnitude. The consequence shows up everywhere: the hash key, the frontier layout, the checkpoint format, the failure and handover procedures and the capacity plan all assume it.",
    k: ["Partition by host vs by URL: host keeps politeness local and skews load; URL balances load and needs distributed coordination for every request.", "Static assignment vs dynamic with handover: static is simple and unbalanced; dynamic balances and needs careful state transfer."],
    p: ["One enormous host overloads its worker, and nothing can split it without breaking local politeness.", "Two workers that briefly share a host double its request rate."],
    v: "Inspect the assignment map and the access logs together. Confirm every host appears in the logs from exactly one worker at a time, including across failover and rebalancing, and that load per worker stays within the target skew.",
    dep: ["host-partitioner","worker-membership","cross-worker-url-routing"]
  },
  "at-least-once-and-idempotence": {
    s: "Failures, lease expiries and recoveries mean a URL may be fetched or processed more than once, so every stage must tolerate repeats and none may lose work.",
    d: "Exactly-once across independent workers and storage is not achievable at this scale, so the design chooses at-least-once delivery everywhere: leases that expire, queues that replay after a restart, batches that retry. Each consumer must then be idempotent: records keyed by URL and fetch time, writes that overwrite or merge, counters that tolerate duplicates. The consequence is that duplicates are a normal, measured quantity with an acceptable rate, and any non-idempotent step is a bug waiting for the first failover.",
    k: ["At-least-once with idempotent consumers vs attempting exactly-once: at-least-once is robust and simple to reason about; exactly-once needs expensive coordination and still fails at the edges.", "Dedupe at each stage vs once at the end: each stage limits wasted work; only at the end is simple and spreads duplicates widely."],
    p: ["A counter incremented on every attempt overstates what was fetched after a recovery.", "A non-idempotent downstream step creates two index entries for one page after a replay."],
    v: "Replay a segment of the pipeline's input twice and compare final outputs. Confirm the stored records, counters and downstream results are identical to a single run, and that the duplicate-fetch rate during a worker kill is within its budget.",
    dep: ["url-lease-and-ack","frontier-checkpointing","downstream-handoff"]
  },
  "approximate-data-structures": {
    s: "At this scale exact sets and counters do not fit in memory, so the crawler accepts small, quantified errors in return for structures hundreds of times smaller.",
    d: "Bloom filters for seen URLs, sketches for counts, hashes of fixed width for identity, fingerprints for near-duplicates and estimates of change rates are all approximations with known error behavior. The design question is where error is acceptable: a missed new URL is a random small coverage loss, a falsely merged page is a lost document, and an overstated count is a skewed decision. The consequence is that each approximate structure needs a stated error budget, a measurement of its real error and a way to detect when it exceeds that budget.",
    k: ["Approximate structures everywhere vs exact where it matters: approximate saves large amounts of memory; exact for critical state avoids rare, hard-to-explain losses.", "Fixed-size structure vs scalable generations: fixed is simple and degrades when full; generations hold error steady and cost complexity."],
    p: ["A filter over its designed capacity raises false positives and coverage falls with no error message.", "Fingerprint collisions merge two real pages, and nothing records that it happened."],
    v: "For each approximate structure, run an audit against an exact reference on a sample and report the real error rate. Confirm it is within the stated budget, and that an alert fires when fill level or collision count passes its threshold.",
    dep: ["bloom-filter-seen-set","url-fingerprint-hash","simhash-index"]
  },
  "adversarial-web": {
    s: "Some pages are built to trap, mislead or attack crawlers, so every stage that touches untrusted input must bound its work and assume the input is hostile.",
    d: "Spam sites generate endless pages and link farms to distort importance; tarpits hold connections; malformed markup and archives are built to exhaust parsers; cloaking shows crawlers different content than users; redirect chains loop. Defenses are spread through the system: size, time and depth limits, trap heuristics, host quality scoring, sandboxed converters, and validation of claims such as canonical links. The consequence is that no stage may trust the previous one's output to be bounded, and every limit needs a counter showing how often it fires.",
    k: ["Strict limits that drop some real content vs permissive limits: strict protect resources and lose rare large valid pages; permissive keep content and expose the crawler to attack.", "Detect and block in-line vs analyze offline: in-line stops harm now with simple signals; offline finds subtler abuse and acts later."],
    p: ["A limit missing from one stage, for example nesting depth in the parser, becomes the way a hostile page exhausts memory.", "Cloaked pages shown only to the crawler's address pollute the index with content users never see."],
    v: "Run a hostile test site with a tarpit, a decompression bomb, an endless calendar, a redirect loop and deeply nested markup against the crawler. Confirm each is cut off by a limit within bounded time and memory, with a counter showing the limit fired.",
    dep: ["trap-heuristics","size-and-time-limits","html-parser","host-quality-scoring"]
  },
});
