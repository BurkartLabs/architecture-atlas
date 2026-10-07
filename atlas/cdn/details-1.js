// Details for the CDN plate, part 1: customer configuration, logs and billing, attack mitigation.
ATLAS.details("cdn", {
  "customer-config-model": {
    s: "The structured description of how one customer's hostnames, origins, caching, security and edge behavior should work, stored as versioned data that every site can interpret identically.",
    d: "A configuration names hostnames, origins, cache settings, security policy, redirects, header edits and edge functions, usually as a typed document with inheritance from account defaults and per-path overrides. It must be expressive enough for customers to avoid support tickets and constrained enough that the data plane can evaluate it in microseconds. The hard parts are evolving the schema while old versions still run in some sites, and keeping semantics identical across software releases so a stored setting never changes meaning.",
    k: ["Declarative settings vs. user-written rules: declarative data is easy to validate and display, but rules cover cases nobody predicted, at the cost of ordering surprises and harder analysis.", "Per-hostname documents vs. account-wide documents: small documents deploy and roll back independently, but shared settings must then be copied or resolved through inheritance."],
    p: ["Adding a field with a default that differs from earlier behavior silently changes every customer who never set it.", "Deeply nested overrides become impossible for customers to reason about, so they cannot predict which setting wins."],
    v: "Fetch the same configuration version from three sites and confirm the compiled form hashes identically. Request a path with an override and confirm the response headers show the override, not the account default.",
    dep: ["config-validation"]
  },
  "control-plane-api": {
    s: "The authenticated programmatic interface customers and their tooling use to create, read and change configuration, purge content and fetch reports, with the portal built on top of it.",
    d: "A multi-tenant service accepts changes, checks permissions, writes a new configuration version to a durable store and returns quickly while distribution continues in the background. It exposes the same operations to scripts, infrastructure tools and the web portal, with idempotency keys, rate limits per account and an audit trail. It is hard because it is a global write path for state that must stay correct for years, and because customers automate against it, so every incompatible change breaks someone's pipeline.",
    k: ["Synchronous activation vs. asynchronous deployment with status: waiting is simple for callers, but global distribution takes minutes, so honest status polling avoids long-held requests.", "Fine-grained roles vs. a few coarse ones: fine roles limit damage from leaked keys, but are tedious enough that customers fall back to full-access tokens."],
    p: ["A retried create call without an idempotency key produces duplicate hostnames or conflicting versions.", "Reads served from a lagging replica show a customer a configuration older than the one they just saved."],
    v: "Create a configuration version through the API, read it back, then poll until the status reports active in all regions and confirm a test request through a remote site reflects the change.",
    dep: ["customer-config-model","config-validation"]
  },
  "config-validation": {
    s: "Checks run before a configuration is accepted: schema, semantic rules, ownership of names, limits and a dry-run compilation, so a bad setting is rejected at the API instead of in production.",
    d: "Validation has layers. Syntax and types come first, then cross-references such as an origin that must exist, then policy checks such as plan limits, forbidden header names and regular expressions that could run in exponential time. Domain ownership is verified separately. A final dry-run compile and a sample evaluation catch errors only the real engine would find. It is hard because the validator and the data plane must agree exactly, and because the cost of a false accept is a global incident.",
    k: ["Strict rejection vs. accepting with warnings: rejection protects the fleet, but customers with a working legacy setting get blocked on unrelated edits.", "Validating with the real compiler vs. a separate checker: the real compiler cannot disagree with production, but ties validation latency to compile cost and release cadence."],
    p: ["A validator that is newer than the edge software accepts syntax some sites cannot yet run.", "Regular expressions accepted without a complexity check let one customer burn CPU on every server."],
    v: "Submit a configuration containing an unreachable origin reference, an over-limit rule count and a catastrophic regular expression, and confirm each is rejected with a specific message while a valid version is accepted.",
    dep: ["customer-config-model"]
  },
  "config-compilation": {
    s: "Turns a validated configuration into a compact, fast-to-evaluate artifact such as a decision tree or bytecode, so each request pays little to apply thousands of rules.",
    d: "Rules, matchers and overrides are merged, normalized and compiled into structures the cache server can load without parsing text: tries for path matching, bitsets for conditions, precompiled regular expressions and a flat table of actions. The compiler is versioned with the data plane so an artifact only goes to software that understands it. It is hard because rule order and inheritance must be preserved exactly, and because the artifact must load without pausing a server that is handling requests.",
    k: ["Ahead-of-time compilation vs. interpreting the source on each request: compiling moves cost off the hot path, but adds a build step, artifact versioning and a second thing that can disagree with the validator.", "One artifact per customer vs. one per site: per-customer artifacts update independently, while a combined artifact loads faster but couples every customer's changes."],
    p: ["A compiler bug that reorders two rules changes behavior for one customer and is invisible in validation.", "Loading a large artifact synchronously stalls the worker for hundreds of milliseconds on every update."],
    v: "Compile a configuration, diff the artifact hash across two compiler builds that should be equivalent, and replay one hundred recorded requests through both to confirm identical decisions.",
    dep: ["customer-config-model","config-validation"]
  },
  "global-config-distribution": {
    s: "Moves compiled configuration from the control plane to every cache server worldwide in seconds to minutes, with versioning, integrity checks and the ability to fall back to the last good version.",
    d: "A publish step puts the new artifact into a store; sites pull it through a hierarchy of relays or receive a push, then verify a signature and swap it in atomically on each server. Servers report which version they run, so the control plane can tell when a change is fully live. Because a site may be unreachable, every server keeps the last good version and keeps serving. The hard parts are partial failure, ordering across dependent changes and a fan-out that does not overload the store.",
    k: ["Push vs. pull: pushing is faster and gives immediate feedback, while pulling tolerates unreachable sites and thundering restarts but delays convergence by the polling interval.", "Whole-snapshot updates vs. deltas: snapshots are easy to verify and recover from, but waste bandwidth when one customer's change must reach every site."],
    p: ["A site cut off for a day comes back and applies several versions out of order, briefly serving stale policy.", "Version reporting that counts a download as applied hides servers that failed to load the artifact."],
    v: "Publish a distinguishable change, then query the version reported by every cache server and confirm the share on the new version reaches 100% within the stated target, with a test request showing the change.",
    dep: ["config-compilation","control-plane-api"]
  },
  "config-staging-environments": {
    s: "A separate set of servers where customers can test a configuration against real software before it reaches production, usually reached by pointing a test hostname at staging addresses.",
    d: "The staging network runs the same software and receives configuration first, with its own addresses so a customer can test with a modified hosts entry or a header. Promotion to production copies the exact artifact tested. Useful staging mirrors the production feature set, including security rules and edge code, and gives a way to see the matched rules. It is hard because staging has no real traffic, so cache behavior, load and unusual clients are not exercised, and a pass can give false confidence.",
    k: ["A shared staging fleet vs. a per-customer test slice of production: shared staging is cheap and isolated, while a production slice tests real conditions but risks real users.", "Promoting the tested artifact vs. recompiling from source: promotion guarantees what was tested is what ships, but needs artifacts to be immutable and stored."],
    p: ["Staging runs a newer software version than production, so a setting works in staging and fails after promotion.", "Customers test only the home page, and path-specific rules are never exercised."],
    v: "Push a configuration to staging, send a request to a staging address with the production hostname, confirm the new behavior appears, then promote and confirm production returns identical headers.",
    dep: ["global-config-distribution"]
  },
  "domain-onboarding": {
    s: "The workflow that lets a customer put a hostname on the network: proving control of the name, directing traffic to it, issuing a certificate and activating the configuration.",
    d: "A customer adds a hostname, proves control through a DNS record or file challenge, and then delegates traffic with an alias record or by moving authoritative DNS. The platform allocates addresses, requests a certificate and activates the configuration only after checks pass. It also guards against a second customer claiming a name still attached to someone else, such as a dangling alias after cancellation. The hard parts are takeover prevention, apex names that cannot use aliases, and onboarding without downtime for a live site.",
    k: ["Verifying ownership before serving vs. serving first and verifying later: verifying first blocks hijacks, but delays launches and frustrates customers moving a live domain.", "Shared addresses vs. dedicated addresses per customer: shared addresses are cheap and plentiful, while dedicated ones suit clients without name-based selection but cost scarce address space."],
    p: ["A removed customer's hostname still resolves to the network, letting another account claim it and serve content under that name.", "Wildcard hostnames overlap with an exact entry from a different account and the wrong configuration wins."],
    v: "Add a new hostname, complete the ownership challenge, then request it over HTTPS and confirm a valid certificate and the expected origin content. Delete it and confirm another account cannot claim it without a fresh challenge.",
    dep: ["control-plane-api","certificate-issuance"]
  },
  "rule-engine": {
    s: "Evaluates a customer's ordered conditions and actions on each request and response, such as matching a path and then rewriting headers, redirecting, setting a TTL or choosing an origin.",
    d: "Rules combine matchers on URL, headers, cookies, geography, device and request properties with actions that change caching, routing, headers or the response itself. Phases such as request received, cache lookup, origin response and response sent define what each action may touch. The engine compiles rules to run in microseconds and records which rules fired for debugging. It is hard because rule ordering and phase interactions produce surprises, and the same expression language is evaluated by security rules, caching and routing.",
    k: ["First match wins vs. all matches apply in order: first match is simple to reason about, but all-match lets small rules compose at the cost of conflicting edits.", "Rich expression language vs. a fixed set of match types: rich expressions cover real needs, but give customers ways to write slow, ambiguous or unsafe rules."],
    p: ["A redirect rule that matches its own target creates a loop that customers discover only from user complaints.", "Rules run before normalization see a different URL than rules run after, so the same intent works in one phase only."],
    v: "Send requests that match, nearly match and bypass a rule, and confirm the response headers and the debug trace show exactly the actions expected and in the declared order.",
    dep: ["config-compilation","key-normalization"]
  },
  "edge-log-generation": {
    s: "Each cache server writes a structured record per request and per upstream fetch, with fields for timing, cache status, bytes, security decisions and customer, buffered locally before shipment.",
    d: "At request end the server emits a record containing client address, hostname, path, status, bytes in and out, cache result, upstream timings, TLS details and which security rules fired. Records go to a bounded in-memory ring and an on-disk spool so a network outage does not lose data or slow requests. Field sets are configurable per customer, and sensitive fields can be redacted or hashed. It is hard because volume is huge, the logging path must never block serving, and the schema evolves over time.",
    k: ["Dropping logs under pressure vs. blocking requests: dropping protects latency, but means log gaps that billing and customers must tolerate or account for.", "Fixed schema vs. per-customer field selection: a fixed schema is cheap to ship and parse, while per-customer fields reduce volume but multiply formats."],
    p: ["Logging query strings stores tokens and personal data, producing a privacy incident from a debugging field.", "Clock drift on servers makes records appear out of order or in the wrong billing hour."],
    v: "Issue one thousand requests with known paths and cache outcomes through one server, then count the records spooled and confirm one per request with the correct cache status and byte counts.",
    dep: ["cache-server-process"]
  },
  "log-shipping-pipeline": {
    s: "Collects log records from every server, through regional aggregators into a durable stream, so downstream systems get an ordered, deduplicated and replayable feed of everything the network served.",
    d: "Servers send batches to a nearby aggregator over a compressed, authenticated stream; aggregators forward to regional queues and then a central or sharded store. Consumers for analytics, customer delivery and billing read from the queue at their own pace. Records carry sequence numbers so loss and duplicates can be measured. It is hard because retries create duplicates, partitions delay data by hours, and different consumers need different guarantees from the same feed.",
    k: ["At-least-once delivery with deduplication downstream vs. exactly-once: at-least-once is simple and robust, but every consumer must deduplicate, which costs memory and state.", "Regional processing before central transfer vs. shipping raw data: regional reduction saves expensive backbone traffic, but loses the ability to reprocess raw detail later."],
    p: ["A full spool on a server during a long outage overwrites the oldest records, leaving a hole nobody notices until billing disputes.", "One slow consumer without isolation backs up the queue and delays real-time analytics for everyone."],
    v: "Cut a site's uplink for ten minutes, restore it, and confirm the sequence numbers received from that site have no gaps and no double counts compared with the server's own request counter.",
    dep: ["edge-log-generation"]
  },
  "log-delivery-to-customers": {
    s: "Packages a customer's slice of the log stream into files or streams and pushes them to the customer's storage or collector on a schedule or continuously.",
    d: "A delivery job selects records for one customer, applies the chosen fields, sampling and redaction, compresses them in batches and writes them to a customer-owned bucket or endpoint using credentials the customer supplied. Real-time variants push small batches every few seconds. Retries handle destination outages, and failure notifications tell the customer when delivery stops. It is hard because destinations are unreliable and diverse, customers misconfigure permissions, and delivery for large customers is itself a heavy data job.",
    k: ["Continuous small pushes vs. larger periodic files: small pushes give fresh logs, but produce many objects that are costly to store and query.", "Network retries until success vs. dropping after a window: indefinite retries avoid loss but consume storage and delay the rest of the pipeline for a broken destination."],
    p: ["A customer rotates a destination credential and delivery fails silently for days before anyone looks.", "Logs for a large customer are split unevenly across files, so a downstream job sees partial hours."],
    v: "Configure delivery to a test bucket, send a known number of requests, and confirm the file appears within the promised delay with exactly that many records and the selected fields only.",
    dep: ["log-shipping-pipeline"]
  },
  "real-time-analytics": {
    s: "Aggregates the log stream into live counts and percentiles by customer, hostname, status, cache result and geography, so dashboards and alerts reflect traffic within seconds.",
    d: "Stream processors group records into small time windows and update counters, histograms and top-N sketches keyed by dimensions customers care about. Results land in a time-series store optimized for recent data, with coarser rollups kept longer. The same data drives dashboards, alerting and automated decisions such as traffic anomalies. It is hard because cardinality explodes if every URL is a dimension, late-arriving records change old windows, and approximate answers must be honest about their error.",
    k: ["Approximate sketches vs. exact counts: sketches bound memory and answer fast, but top-N and percentile errors surprise customers comparing against their own logs.", "Pre-aggregating chosen dimensions vs. storing raw events for ad hoc queries: pre-aggregation is cheap and fast, while raw storage supports new questions at much higher cost."],
    p: ["Unbounded dimensions such as full query strings blow up key counts and take the pipeline down.", "Dashboards show a dip that is only late data not yet counted, triggering a false incident."],
    v: "Generate a burst of one thousand requests to a distinctive path and confirm the dashboard shows that count, split correctly by cache status, within the stated freshness, then matches the raw logs afterwards.",
    dep: ["log-shipping-pipeline"]
  },
  "usage-metering": {
    s: "Counts what each customer consumed, such as bytes delivered, requests, compute time and security events, from authoritative records, with deduplication and an audit trail.",
    d: "Metering reads the shipped records, assigns each to an account and product, applies rules for what counts, such as excluding errors or including TLS overhead, and writes hourly or finer totals to a ledger. It runs on the complete, deduplicated stream rather than sampled analytics, and keeps enough detail to explain any number. It is hard because definitions differ between customers' contracts, data arrives late, and a small systematic undercount or overcount becomes a large money error at scale.",
    k: ["Metering on the full deduplicated stream vs. reusing sampled analytics: full metering is auditable and exact, but costs a second heavy pipeline.", "Counting bytes at the client edge vs. at the origin side: edge bytes match what customers see, while origin bytes miss cache efficiency but are easier to verify."],
    p: ["A schema change drops a field the meter relied on, undercounting a product for days.", "Late data arriving after an invoice is issued forces a credit or an unexplained correction."],
    v: "Send a known volume of traffic through a test account, then compare metered bytes and requests against the load generator's totals and confirm they agree within the documented tolerance.",
    dep: ["log-shipping-pipeline"]
  },
  "billing-and-invoicing": {
    s: "Turns metered usage into charges using each customer's plan, commitments, regional rates and discounts, then issues invoices and reports that finance and customers can reconcile.",
    d: "A rating engine applies the contract: tiered or committed volume, regional price differences, free allowances and overage. Results feed invoices, spend alerts and usage reports in the portal. Corrections arrive as credits rather than edits. The system must retain the inputs used for each charge to answer disputes. It is hard because contracts are bespoke, percentile-based billing needs the full distribution of samples, and a mistake touches money and trust rather than just availability.",
    k: ["Rating from immutable metered records vs. recomputing on demand: immutable inputs give reproducible invoices, but corrections need explicit adjustment entries.", "Standard price lists vs. per-customer contract terms: standard lists are simple to audit, while custom terms win deals and multiply the rating cases to test."],
    p: ["Rating rules updated mid-period apply new prices to earlier usage because the version was not pinned.", "A customer under attack is billed for attack traffic that the contract should have excluded."],
    v: "Rate a month of metered data for a test contract with commitments, tiers and a regional surcharge, and confirm the invoice total matches an independent hand calculation to the cent.",
    dep: ["usage-metering"]
  },
  "volumetric-ddos-mitigation": {
    s: "Absorbs and discards floods of packets or bandwidth aimed at customers, using the network's distributed capacity and early packet filters so attack traffic never reaches caches.",
    d: "Anycast spreads an attack across many sites, so each sees a fraction. At each site, router and host filters drop traffic by simple properties such as protocol, port, spoofed source ranges and known reflection signatures, at line rate. Detection compares flow statistics to baselines and installs filters automatically within seconds. It is hard because attackers change vectors constantly, filters must not drop legitimate traffic that looks similar, and capacity must exceed the biggest attack from any single regional concentration.",
    k: ["Automatic filter installation vs. human approval: automation reacts in seconds as attacks demand, but a bad signature can drop real traffic before anyone checks.", "Dropping at the router vs. at the host: router drops protect the servers and links, while host-level drops see more context but spend CPU on every packet."],
    p: ["A reflection filter on a common port also drops legitimate DNS or QUIC replies from customers' own services.", "An attack concentrated on one regional site saturates its links while global capacity looks fine."],
    v: "In a lab, replay a recorded reflection flood at 20% of a site's link capacity and confirm filters install within the target time, attack packets are dropped and a concurrent legitimate request stream shows no added errors.",
    dep: ["pop-network-fabric","anycast-prefix-design"]
  },
  "scrubbing-and-blackholing": {
    s: "Last-resort tools for attacks too big for filtering in place: diverting traffic to dedicated cleaning capacity, or dropping everything to one address at the network edge to protect the rest.",
    d: "Scrubbing diverts a target's traffic, usually by changing routing announcements, through dedicated machines that classify and drop attack packets before returning clean traffic. Blackholing instructs upstream networks to discard all traffic to one address, sacrificing that address to save shared links. Both are triggered by detection or by customer request and need rapid reversal. It is hard because diversion adds latency, return paths must not loop, and blackholing completes the attacker's goal for that target, so it is the final resort.",
    k: ["Always-on scrubbing vs. on-demand diversion: always-on blocks attacks instantly but adds latency and cost to all traffic, while on-demand saves both but leaves a gap while routing changes spread.", "Blackhole one address vs. one prefix: one address limits collateral damage, but may need many announcements and still affects the customer completely."],
    p: ["Diversion routes clean traffic back through the same path and creates a loop that doubles the damage.", "A blackhole stays in place after the attack ends because nobody owns removing it."],
    v: "Trigger diversion for a test prefix, confirm routing converges within the target time and attack-labeled test traffic is dropped, then withdraw it and confirm clean traffic returns on the direct path.",
    dep: ["bgp-announcements","volumetric-ddos-mitigation"]
  },
  "connection-flood-defense": {
    s: "Protects the servers' connection handling from floods of handshakes, half-open connections and slow clients, using stateless cookies, per-source limits and aggressive timeouts.",
    d: "Attacks that open many connections exhaust tables long before bandwidth runs out. Defenses include handshake cookies that avoid keeping state until the client proves it can receive replies, per-source and per-subnet limits, short timeouts for incomplete requests, and QUIC address validation tokens. Kernel and load balancer tables are sized and monitored for exhaustion. It is hard because limits that stop attackers also hit large networks sharing a single address, and because slow attacks look like slow real users.",
    k: ["Stateless validation vs. stored connection state: stateless cookies resist floods but limit some protocol options, while stored state is flexible and easy to exhaust.", "Per-address limits vs. per-subnet limits: per-address is precise but trivially evaded with many addresses, while per-subnet blocks shared networks and mobile carriers that use one address for many users."],
    p: ["A strict limit blocks a university or mobile carrier that places thousands of users behind one address.", "Idle timeouts set short enough to stop slow attacks cut off real clients on poor links during large downloads."],
    v: "Open fifty thousand half-open connections from a test source and confirm the connection table stays under its limit, new legitimate handshakes from another source still complete within normal time, and the flood is dropped.",
    dep: ["ecmp-and-l4-load-balancer","tls-handshake-termination"]
  },
  "application-layer-ddos": {
    s: "Detects and stops floods of well-formed HTTP requests that individually look legitimate but together overwhelm an origin or the edge, by recognizing patterns across many requests.",
    d: "These attacks use real handshakes and valid requests, often for uncacheable or expensive URLs. Detection combines request rates, cache-miss rates, error ratios and client fingerprints per hostname, then applies graded responses: challenge, slow, rate limit or block. Protection of the origin also relies on high cache hit ratios and request collapsing. It is hard because the line between a flash crowd and an attack is blurry, and because the mitigation itself must run on traffic the edge is already struggling to serve.",
    k: ["Customer-configured thresholds vs. automatic baselines: customers know their traffic, but few tune thresholds, while automatic baselines mislabel launches and sales as attacks.", "Challenging suspicious clients vs. blocking them: challenges reduce false positives against real users, but fail for non-browser clients such as APIs and cost every visitor friction."],
    p: ["A legitimate marketing spike trips automated mitigation and blocks the traffic the customer paid to attract.", "Attackers rotate through many addresses and fingerprints, so per-client limits never trigger."],
    v: "Replay an attack of ten thousand requests a second at uncacheable paths against a test hostname and confirm mitigation engages within the target time, origin request rate drops below its cap and a concurrent normal client succeeds.",
    dep: ["rate-limiting","bot-scoring-and-challenges","request-collapsing"]
  },
  "waf-rule-engine": {
    s: "Inspects requests and sometimes responses against rules that detect injection, traversal and other attacks, then allows, logs, challenges or blocks, running inline at the edge for every protected request.",
    d: "The engine parses the request into normalized parts, decodes layered encodings, and evaluates rules built from pattern matching, expression logic and scoring. Rules run in phases with a per-request time budget, since inspection of bodies is costly. Actions can be monitor-only, which logs without blocking, or enforcing. Matches record which rule fired and why. It is hard because attackers evade by encoding, applications send strange but valid input, and every rule has a performance cost multiplied by all traffic.",
    k: ["Inspecting full bodies vs. headers and the first bytes: full inspection finds more attacks, but costs CPU and memory per request and has to stream or buffer.", "Anomaly scoring vs. block on first match: scoring tolerates noisy rules and tunes sensitivity, but makes it harder for customers to know why a request was blocked."],
    p: ["A rule blocks a customer's own editor or API payloads because they contain code-like strings.", "Request bodies decoded after the rules run let encoded attacks pass untouched."],
    v: "Send a corpus of known attack strings and benign look-alikes through a protected hostname in enforcing mode and confirm the attacks are blocked, the benign requests pass and added latency stays under the stated budget.",
    dep: ["request-parsing-and-normalization","rule-engine"]
  },
  "managed-rulesets": {
    s: "Rule collections written and maintained by the platform's security team, delivered to all customers, so common attacks are covered without each customer writing their own signatures.",
    d: "Security researchers write rules for new vulnerabilities and attack techniques, test them against large samples of real traffic, and release them in groups customers can enable, tune or exclude. New rules typically ship in monitor mode first to measure false positives. Rule updates travel through the same distribution path as configuration. It is hard because a global rule runs against every customer's unique application, so a rule right for most can break a few, and urgent zero-day rules must ship fast without the usual testing period.",
    k: ["Shipping new rules in log-only mode first vs. enforcing at once: log-only finds false positives safely, but leaves customers exposed during the test period.", "Global default rulesets vs. per-customer tuning: defaults protect everyone with little effort, while tuning avoids false positives but needs customer attention that rarely happens."],
    p: ["An emergency rule released without a staged rollout blocks a major customer's checkout traffic.", "Customers add exclusions for convenience and never remove them, leaving permanent holes."],
    v: "Release a new rule in log-only mode, replay a day of sampled traffic through it, and confirm the report lists matches with sample requests and a false-positive rate below the release threshold before enforcement.",
    dep: ["waf-rule-engine","global-config-distribution"]
  },
  "bot-signals-and-fingerprints": {
    s: "Collects the observable properties of a client, such as TLS and HTTP handshake patterns, header order, address reputation and behavior over time, that help tell browsers from scripts.",
    d: "The edge computes fingerprints from the TLS client hello, HTTP/2 settings and header ordering, which are hard for simple tools to imitate exactly. It joins them with address reputation, request timing and navigation patterns, and optionally with client-side signals gathered by a script. Signals feed a score rather than a verdict. It is hard because fingerprints drift with every browser release, attackers copy real browser behavior, and privacy rules limit what can be collected and kept.",
    k: ["Passive network fingerprints vs. active client-side scripts: passive signals cost users nothing and cover every request, while scripts see richer device data but cannot reach API clients and are routinely reverse engineered.", "Per-request signals vs. session history: history catches slow, careful bots, but needs shared state across servers and expands the privacy surface."],
    p: ["A new browser release changes its handshake and a whole share of real users get flagged until fingerprints are updated.", "Shared corporate proxies make many different users look like a single automated client."],
    v: "Send requests from a real browser build, a scripted client and a scripted client mimicking the browser's headers, and confirm the recorded signals differ for each and the scores separate the first from the other two.",
    dep: ["tls-handshake-termination","http2-multiplexing","request-parsing-and-normalization"]
  },
  "bot-scoring-and-challenges": {
    s: "Combines client signals into a bot score, then lets customers apply actions by score and path, such as allow, challenge, rate limit or block, with verified good bots recognized separately.",
    d: "A model or rule set maps signals to a score per request, and customers write policies like challenging low scores on login pages while leaving a content path alone. Challenges ask the client to prove it runs a real browser, with no or minimal user effort. Known crawlers are verified by reverse lookup or published address lists so they are not blocked. It is hard because scores are probabilistic, attackers pay people to solve challenges, and every policy trades fraud against friction for real customers.",
    k: ["Machine-learned scoring vs. hand-written heuristics: models find subtle patterns and adapt, but are harder to explain to customers and to debug when they misfire.", "Visible challenges vs. invisible checks: visible challenges are strong but cost conversion, while invisible checks keep the experience clean and are easier for sophisticated bots to pass."],
    p: ["A search crawler is challenged because its address list was stale, and the customer's pages drop out of search results.", "Challenges applied to an API path break mobile apps that cannot render the challenge."],
    v: "Run a scripted login attack and a set of real browser sessions against a test policy, and confirm the script is challenged or blocked, real sessions pass without a challenge, and a verified crawler is allowed.",
    dep: ["bot-signals-and-fingerprints","rule-engine"]
  },
  "rate-limiting": {
    s: "Counts requests by a chosen key such as address, session or API key over a time window across the network, and applies an action when a customer-defined limit is exceeded.",
    d: "Counters are kept in server memory, then shared among servers in a site and sometimes across sites, so a limit holds even when requests spread over many machines. Customers select what to count, the window and the action, such as block, delay or serve a custom response. Algorithms like token buckets allow short bursts. It is hard because exact global counting is too slow, so limits are approximate, and because limits on shared addresses punish many users for one.",
    k: ["Local per-server counters vs. site-wide shared counters: local counters are fast and never fail, but multiply the effective limit by the number of servers.", "Fixed windows vs. sliding windows or token buckets: fixed windows are cheap but allow double bursts at the boundary, while sliding approaches are smoother and need more state."],
    p: ["Counting by address blocks a whole office or mobile carrier while a botnet using many addresses stays under the limit.", "Counter state lost in a server restart resets limits and lets a burst through."],
    v: "Configure a limit of ten requests per ten seconds, send twenty from one client across several servers in a site, and confirm that close to ten succeed, the rest receive the configured action and the counter resets after the window.",
    dep: ["cache-server-process","rule-engine"]
  },
});
