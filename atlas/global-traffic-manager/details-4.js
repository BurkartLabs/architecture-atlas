// Details for the global traffic manager plate, part 4: geolocation and measurement, DNS answer service.
ATLAS.details("global-traffic-manager", {
  "geo-database": {
    s: "A table mapping IP address ranges to estimated locations such as country, region and city, plus attributes like network type, used to decide where a client probably is.",
    d: "The database is compiled from registry data, routing information, measurement and commercial sources, then loaded as a compact prefix tree for lookups in microseconds. Each entry carries a location and a confidence. Updates arrive weekly or daily, and prefixes are reassigned constantly as address space changes hands. The manager versions the database like configuration, so every node uses the same one. The difficulty is accuracy: city-level data is often wrong, mobile and satellite networks have no stable location, and address blocks move between countries.",
    k: ["Country-level only vs city-level: country data is more accurate and enough for compliance, while city data helps proximity and is wrong often enough to misroute.", "Roll out database updates like configuration vs apply immediately: staged rollout catches bad data before everyone gets it, and delays real corrections."],
    p: ["A database update reassigns a large block to the wrong country and its users are steered across the world.", "Different nodes load different database versions and give the same client different answers."],
    v: "Look up a set of addresses with known true locations, such as the manager's own probers, and confirm accuracy against ground truth at country and city levels before and after each update.",
    dep: ["map-refresh", "config-distribution"]
  },
  "network-prefix-map": {
    s: "A table grouping client address space into units that behave alike, such as origin networks and their prefixes, so measurements and policies attach to networks instead of single addresses.",
    d: "Steering decisions are made per client network, not per address. The map groups prefixes by the autonomous system that originates them and splits large ones when they span different regions or paths. Latency scores, location overrides and capacity-based diversions attach to these units. It is built from routing tables and measurement and updated as routing changes. The difficulty is granularity: units too large hide differences between users, and too small have no measurements and exhaust memory.",
    k: ["Group by origin network vs by fixed prefix length: origin grouping matches routing and policy, while fixed length is simple and ignores organizational boundaries.", "Adaptive splitting of large networks vs static units: adaptive splitting fixes mixed networks and adds churn in tables and scores."],
    p: ["One large network spans several countries and receives one answer, so most of its users get a distant site.", "Routing changes merge or split prefixes and scores keyed on old units are silently lost."],
    v: "Pick a large network known to span regions and confirm the map splits it, with separate scores per part. Confirm every address in a sample falls into exactly one unit.",
    dep: ["geo-database", "map-refresh"]
  },
  "resolver-client-mapping": {
    s: "Estimates which clients use which recursive resolver, and how far apart they are, because DNS-based steering sees the resolver and not the user.",
    d: "A DNS query comes from a resolver. If the resolver is near its users, steering by resolver location is accurate; if it is a public resolver serving many countries, it is not. The mapping learns the relationship by correlating DNS queries with the client addresses that later connect, using unique names or beacons. The result is a per-resolver estimate of user distribution and distance. The difficulty is that the relationship is statistical and changes: users switch resolvers and large resolvers change where they run.",
    k: ["Learn the mapping from joins of queries and connections vs assume resolver equals client: learned mapping corrects for public resolvers and needs instrumentation, while the assumption is free and wrong for a large share of users.", "Per-resolver average vs per-user distribution: an average is compact, and a distribution reveals when one resolver serves several regions."],
    p: ["A global public resolver is treated as being in one city and all its users are steered there.", "The mapping is learned during one hour and applied unchanged for weeks."],
    v: "Issue unique-name lookups from clients in several regions through one public resolver, join them with the resulting connections and confirm the measured client distribution matches the stored estimate.",
    dep: ["dns-query-logging", "rum-beacons", "client-subnet-handling"]
  },
  "client-subnet-handling": {
    s: "Uses the client network prefix that some resolvers include in queries, so steering can follow the user's location instead of the resolver's.",
    d: "When a resolver supports the DNS client subnet extension, it forwards a truncated prefix of the client address. The evaluator uses it in place of the resolver address and returns the scope it applied, so caches can store the answer per prefix. This improves accuracy for public resolvers and increases the number of distinct cache entries and query volume. Some resolvers send none, and privacy-minded ones send very short prefixes. The difficulty is coverage and cost: the information is only present sometimes, and answers that depend on it cache poorly.",
    k: ["Honor the supplied prefix vs ignore it: honoring improves accuracy and reveals more client data, while ignoring respects privacy and treats distant users as the resolver.", "Narrow scope vs wide scope in responses: narrow scope gives precise steering and fragments caches, and wide scope caches well and may serve one answer to users who differ."],
    p: ["A resolver sends a fake or wrong prefix, and the client is steered by whatever it claims.", "Wide-scope answers are cached and returned to clients in other regions with better sites."],
    v: "Query through a resolver that sends subnet data from two distant client prefixes and confirm each gets its regional answer with the correct scope, and queries without it fall back to resolver location.",
    dep: ["geo-database", "authoritative-frontend", "privacy-and-residency"]
  },
  "active-latency-probing": {
    s: "Measures round-trip time between probe points and each site on a schedule, giving latency data for networks where no real-user measurements exist yet.",
    d: "Probers placed in many networks ping or fetch a small object from every site and record latency and loss. Probes are chosen to represent client networks, and results are mapped to units in the prefix map. The data fills gaps where user traffic is thin and covers sites that currently serve nobody. It is also used to find where a new site would be better than existing ones. The difficulty is representativeness: probes sit in data centers and cloud networks, and their paths often differ from those of consumer networks.",
    k: ["Probes in client networks vs in data centers: client-network probes reflect users and are hard to obtain at scale, while data-center probes are plentiful and measure the wrong paths.", "Protocol-level ping vs application fetch: ping is cheap and ignores application behavior, while fetches measure what users feel and load the site."],
    p: ["Probers are all in a handful of large networks and their numbers are applied to everyone.", "Probe traffic to a new site is filtered by a firewall and the site looks unreachable."],
    v: "Compare active probe latency to a site with real-user latency from the same network over a week and report the correlation and bias, rejecting use for networks where it is poor.",
    dep: ["network-prefix-map", "probe-vantage-points"]
  },
  "rum-beacons": {
    s: "Small measurements sent by real clients, such as page or download timings against several sites, that show what users on each network experience.",
    d: "A snippet in a page or a client library fetches a tiny object from several candidate sites, measures timing with the platform's timing interface, and reports results with the client network. Measurements run at low rates and only after the main content has loaded, so they do not slow the user. The data shows true paths, including middle-box and last-mile effects no probe sees. The difficulty is consent and bias: only clients running the snippet report, requests need cross-origin permissions, and browser privacy features blur timings.",
    k: ["Measure all candidate sites from every client vs only the one serving: measuring all gives comparison for every network at the cost of extra requests, while only-serving data has no basis for comparison.", "Sample a small fraction vs all clients: sampling limits cost and privacy exposure, while full coverage fills sparse networks faster."],
    p: ["Beacon timings include page load noise rather than network time, and scores follow the page weight.", "A client reports from an address behind a proxy, and the measurement is credited to the wrong network."],
    v: "Run a beacon from controlled clients with injected latency to one site and confirm the reported timings and network attribution match, and the main page load time is unchanged.",
    dep: ["network-prefix-map", "privacy-and-residency"]
  },
  "rum-pipeline": {
    s: "Receives beacon reports, validates and aggregates them into per-network, per-site statistics, and delivers the results to the manager within minutes.",
    d: "Collectors accept reports, drop malformed or implausible ones, join them to the prefix map and write to a stream. A windowed aggregator computes medians and tail percentiles per network and site, with counts so consumers know how much data stands behind each number. Output is compacted into score tables distributed like configuration. The difficulty is volume and trust: reports come from untrusted clients, so an attacker can submit fake timings to attract or repel traffic, and sparse networks give statistics too thin to use.",
    k: ["Medians vs high percentiles for scoring: medians are stable and hide the poor experience of a slow minority, while percentiles capture it and are noisy with few samples.", "Real-time stream vs periodic batch: streams react within minutes and need more operational effort, and batches are simple and slower to see change."],
    p: ["A script submits thousands of fake low timings for one site and steers a network's users toward it.", "Networks with a handful of samples get scores that change completely each window."],
    v: "Submit a known distribution of synthetic reports for one network and confirm the published score matches the expected median, count and percentile, within one window.",
    dep: ["rum-beacons", "telemetry-pipeline", "measurement-filtering"]
  },
  "measurement-filtering": {
    s: "Removes outliers, spoofed reports and low-confidence data, and smooths measurements, so scores reflect network behavior and not noise or manipulation.",
    d: "Filters reject impossible values, cap the influence of any one source, and compare each report with neighbors in the same network. Statistical methods such as trimmed means, minimum sample counts and exponential smoothing produce a stable score. Where data is too sparse, the score falls back to a parent unit, such as a larger network or country, with a flag. The difficulty is that real shifts look like noise: a genuine routing change that doubles latency for a network must pass the filter, while a spike must not, and the two look alike for the first few minutes.",
    k: ["Aggressive smoothing vs light smoothing: heavy smoothing stabilizes decisions and delays real changes, while light smoothing reacts and passes noise to steering.", "Fall back to parent group vs mark unknown: falling back always gives a score and may be wrong for that network, and unknown forces the policy to use a default."],
    p: ["Filtering discards the genuine latency increase from a path failure as an outlier, and users stay on the bad path.", "A parent-group fallback applies one distant network's score to an unrelated small one."],
    v: "Inject a single spike and a sustained step into a replayed series. Confirm the score ignores the spike and follows the step within the expected number of windows.",
    dep: ["rum-pipeline", "region-score-tables"]
  },
  "region-score-tables": {
    s: "The compiled lookup that gives, for each client network, a score or ordered ranking of sites, which the evaluator reads in microseconds on every query.",
    d: "The tables combine latency measurements, geography, cost and manual overrides into one ranking per client network, built periodically and shipped with configuration as a versioned artifact. Each entry records its inputs and age. The evaluator only reads the table, which keeps per-query work small and predictable. Tables are compared to the previous version before shipping to catch large changes. The difficulty is size and staleness: millions of networks multiply into large tables, and a table is always a picture of the past.",
    k: ["Precompute rankings vs compute per query from raw scores: precomputed tables make queries fast and consistent, while per-query computation is flexible and slower.", "Rebuild everything vs incremental updates: full rebuilds are simple to verify, and incremental updates arrive sooner and risk drift."],
    p: ["A table built from corrupt input ships to every node and sends an entire region's traffic to the wrong site.", "Entries lack ages, so months-old measurements look as authoritative as yesterday's."],
    v: "Build tables from two consecutive days of data and review the diff. Confirm the share of networks changing top choice is within the expected range and every changed entry has recent supporting data.",
    dep: ["measurement-filtering", "network-prefix-map", "geo-database"]
  },
  "map-refresh": {
    s: "The schedule and checks for updating geolocation, prefix and score data, including how old each input may be before the manager stops trusting it.",
    d: "Each data source has an expected refresh cadence and a maximum age. The refresh job pulls, validates against sanity rules such as size and share of changed entries, stages the new version and ships it through configuration rollout. If a feed is late or fails validation, the previous version stays in use and an alert is raised. Age is exposed so policies can disable measurement-based rules when scores are too old. The difficulty is deciding what to do with data that is old but not yet wrong.",
    k: ["Reject a refresh that changes too much vs accept anything valid: rejection prevents a corrupt feed from spreading and can block a genuine large change such as a network acquisition.", "Expire stale data vs keep using the last good version: expiry avoids steering on an obsolete picture, while keeping it avoids losing the policy entirely."],
    p: ["A feed silently stops updating and nobody notices because the old data keeps working.", "A validation limit blocks every refresh after a real large reallocation, and the data decays for weeks."],
    v: "Withhold one feed past its maximum age and confirm an alert fires, the age is visible in answers' trace data, and the policy takes the specified fallback path.",
    dep: ["config-distribution", "telemetry-pipeline"]
  },
  "authoritative-frontend": {
    s: "The network-facing server that receives DNS queries over UDP and TCP, parses them, hands them to the evaluator and returns well-formed answers at very high rates.",
    d: "It speaks the DNS protocol: parses queries, handles truncation and fallback to TCP, supports extensions, and builds responses with correct flags and sections. It is stateless apart from the loaded configuration, so any node can answer any query. It holds the zone data for ordinary records and calls the evaluator for steered names. Performance targets are tens of thousands of queries per second per core, with latency in the microsecond range. The difficulty is protocol exactness and abuse: malformed queries, amplification attempts and floods all arrive on the same port as real traffic.",
    k: ["Custom server vs wrapper around a general nameserver: custom code is fast and tuned for steering, while a general server handles protocol edge cases that custom code gets wrong for years.", "Answer all queries vs drop suspicious ones: dropping reduces abuse and risks losing real clients behind odd resolvers."],
    p: ["Large steered answers are truncated, and resolvers that do not retry over TCP fail to resolve the name.", "A malformed query crashes the parser and a single packet takes a node down."],
    v: "Send a corpus of valid, malformed and boundary-size queries and confirm correct responses or defined refusals, no crashes, and throughput and latency at target under a sustained flood.",
    dep: ["query-evaluator", "nameserver-fleet", "query-rate-limiting"]
  },
  "query-evaluator": {
    s: "The engine that, per query, resolves the client, runs the policy chain against current health and capacity and returns the answer with its TTL.",
    d: "On each steered query the evaluator extracts the name, client address or subnet and query type, looks up the policy, maps the client to a network and location, and runs the chain against the local copies of health, capacity and score tables. Everything it reads is in memory and immutable for the duration of the call. It emits the answer, the TTL, the policy version and optionally a trace. The difficulty is the budget: policy richness has to fit in microseconds, and any lookup that goes to the network would cap throughput and add failure modes.",
    k: ["Evaluate per query vs precompute answers per client group: per-query evaluation is flexible and uses more CPU, while precomputed answers are fast and cannot express every rule.", "In-process data vs remote lookups: in-process reads are fast and mean data is copied everywhere, while remote lookups share a single copy and add latency and dependencies."],
    p: ["An evaluator that blocks on a remote call turns a data store slowdown into a DNS outage.", "Evaluation reads health and scores at slightly different instants and returns an inconsistent combination."],
    v: "Benchmark evaluation of a representative policy under load with every dependency's network disabled, and confirm throughput and tail latency targets hold with identical answers to a reference run.",
    dep: ["policy-chain", "health-state-store", "region-score-tables", "fail-static-cache"]
  },
  "ttl-selection": {
    s: "Chooses the lifetime attached to each answer, trading how fast changes take effect against query load, resolver cost and exposure to the manager's own outages.",
    d: "A short TTL lets a failover reach clients quickly and multiplies queries to the manager. A long TTL reduces load and keeps answers working through a manager outage, and slows change. TTLs can vary by name, by answer state, such as shorter when a site is degraded, or by client type. The effective lifetime is not the configured value: resolvers raise minimums, cap maximums or prefetch. The difficulty is that TTL is the main dial between agility and resilience, and no value is correct for both.",
    k: ["Short TTL, such as 30 seconds, vs long, such as 5 minutes: short responds faster and depends on constant availability of the manager, while long survives outages and delays every change.", "Fixed TTL vs adaptive: adaptive TTLs shorten during instability and lengthen when calm, and make query volume less predictable."],
    p: ["A very short TTL triples query volume, and the manager's own capacity becomes the limit during an incident.", "TTL is lowered only after an incident begins, when old answers with the long value are already cached."],
    v: "Change an answer and measure, from many resolvers, the time until each returns the new one, then compare the percentile curve to the configured TTL and report the difference.",
    dep: ["resolver-behavior", "ttl-and-propagation"]
  },
  "answer-precompute": {
    s: "Builds answers ahead of time for common client groups and caches them in memory, so most queries need a table lookup instead of a full policy evaluation.",
    d: "The control plane or the node evaluates the policy for each known client network and records the result. At query time the node finds the entry for the client's network and returns it; unusual cases fall through to the evaluator. Precomputed answers are invalidated when health, scores or weights change, and rebuilt in the background. This shifts work from the hot path to a periodic job. The difficulty is invalidation: any input change can alter many entries, and a stale entry quietly serves yesterday's decision.",
    k: ["Eager rebuild on any change vs lazy rebuild on next query: eager keeps lookups instantly correct and spends compute on entries never used, while lazy spends only on demand and adds latency at the first hit.", "Randomized weighted answers vs fixed answers per entry: randomness needs per-query work, while fixed answers are fast and make distribution depend on which network sees which."],
    p: ["Health change invalidates entries only in one cache level and some nodes keep serving the old answer.", "The precomputed table is built with a different configuration version from the evaluator's fallback path."],
    v: "Change a site's health and count queries answered from stale entries afterward. The number must fall to zero within the stated interval on every node.",
    dep: ["query-evaluator", "region-score-tables", "health-state-store"]
  },
  "alias-and-cname": {
    s: "Handles names that point to other names, including a zone's apex, so a customer-facing name can delegate steering to a managed name without breaking DNS rules.",
    d: "Most deployments publish a CNAME from the service name to a managed name the manager answers, which keeps the zone's own records simple. The apex of a zone cannot hold a CNAME, so providers offer an alias type that is resolved at query time and returned as plain address records. Chains add lookups and delay; each link has its own TTL, and the effective lifetime is the minimum along it. The difficulty is correctness at the edges: aliases interact with DNSSEC, with other records at the same name and with resolvers that limit chain length.",
    k: ["CNAME to a managed name vs authoritative zone delegation: a CNAME needs no change of the zone's nameservers and lengthens the chain, while delegation shortens lookups and hands over the whole zone.", "Alias flattening at the apex vs separate subdomain for the service: flattening keeps the bare name working and hides one resolution step, and a subdomain is simpler and requires redirects for the apex."],
    p: ["Long CNAME chains exceed a resolver's limit and the name fails to resolve for some users.", "Other records at an alias name, such as mail, are dropped or break when the alias is added."],
    v: "Resolve the apex, the subdomain and the chain from several resolvers, with and without validation, and confirm identical address answers, correct TTLs and no extra lookups beyond the documented chain.",
    dep: ["authoritative-frontend", "ttl-selection"]
  },
  "dnssec-signing": {
    s: "Signs answers so validating resolvers can detect forgery, which for dynamic steering means signing per query or ahead of time as answers change.",
    d: "Signatures cover each record set and carry validity windows. A steered name whose answer changes per client either gets a signature generated on the fly, which costs CPU and needs online keys, or draws from a small set of presigned answers. Keys are rotated on schedule and the parent zone's trust record is updated. Negative answers also need signed proof of nonexistence. The difficulty is operational: expired signatures or a missed key rollover make the name unresolvable for every validating resolver at once.",
    k: ["Online signing per query vs presigned answer sets: online signing allows any answer and keeps keys on every node, while presigned sets keep keys offline and limit the answers possible.", "Short signature validity vs long: short limits replay and demands constant re-signing, while long tolerates control plane outages and extends exposure."],
    p: ["Signatures expire during a control plane outage and validating resolvers stop resolving the name.", "A key rollover is done in the wrong order and the name fails validation until caches expire."],
    v: "Resolve through a validating resolver across a key rollover and a signature refresh and confirm no validation failure at any time. Check that signatures remain valid well beyond the longest expected outage.",
    dep: ["secrets-and-keys", "authoritative-frontend", "time-sync"]
  },
  "query-rate-limiting": {
    s: "Limits responses per client network to blunt floods and reflection attacks without blocking real users who share a resolver.",
    d: "The server tracks queries per source prefix and response type, and drops or truncates answers above a threshold, so spoofed sources cannot use it to amplify traffic against a victim. Large public resolvers send huge legitimate volume from few addresses, so they get higher limits or allowlists. Limits apply separately to existing names and to nonexistent ones. The difficulty is separating attack from success: a surge after a news event looks like a flood, and a limit that throttles a big resolver breaks many users at once.",
    k: ["Per-source limits vs global limit: per-source limits isolate abusers and are circumvented by spreading the attack, while a global limit protects the server and punishes everyone.", "Drop vs truncate over the limit: dropping is cheapest and appears as a timeout, while truncation makes legitimate resolvers retry over TCP and gives spoofed sources nothing to reflect."],
    p: ["A large resolver is rate limited during a traffic spike and its millions of users lose the name.", "Limits apply per instance and an attack spread over many nodes passes each one."],
    v: "Send a flood from one prefix and confirm responses fall to the limit while a second prefix is unaffected. Send from a known big resolver at its normal rate and confirm no drops.",
    dep: ["authoritative-frontend", "dns-query-logging"]
  },
  "resolver-behavior": {
    s: "A model of how real resolvers treat answers: minimum and maximum TTLs, prefetching, retry, server selection and caching, which determines how fast any change takes effect.",
    d: "Resolvers differ widely. Some enforce a minimum TTL of minutes, others cap long ones, some prefetch before expiry, some cache negative answers for long, and some ignore changes until restarted. They choose among nameservers by round-trip time, so queries concentrate on the fastest. The model is built from measurement of real behavior and used by the simulator and when picking TTLs. The difficulty is that the population is unobservable in general and varies with time, region and software.",
    k: ["Assume spec-compliant resolvers vs model measured behavior: assuming compliance is simple and optimistic, while measured models are accurate and costly to collect and keep current.", "One global model vs per-region models: per-region models match local resolvers more closely and need more measurement."],
    p: ["Planning assumes every resolver respects a 60 second TTL, and the real tail lasts for hours.", "A model measured on one large resolver is generalized to all."],
    v: "Change an answer and track the time each observed resolver took to switch. Compare the distribution against the model's prediction and recalibrate if the tail differs.",
    dep: ["dns-query-logging", "propagation-measurement"]
  },
  "dns-query-logging": {
    s: "Records queries and answers, with client prefix, name, answer, policy version and timing, as the raw material for debugging, measurement, capacity and abuse analysis.",
    d: "Every node logs a sample or all queries into the telemetry pipeline, with client addresses truncated or hashed according to policy. Logs are used to reconstruct what the manager answered at any moment, to measure propagation, to learn resolver-to-client relationships and to detect attacks. Volume is large, so storage tiers, sampling and retention are chosen up front. The difficulty is trade-offs between detail, cost and privacy: the useful fields are also the most sensitive.",
    k: ["Log every query vs sample: full logs allow exact reconstruction and cost heavily at scale, while sampling is cheap and misses rare events.", "Full client addresses vs truncated: full addresses support abuse analysis and expose users, while truncated prefixes protect privacy and weaken debugging."],
    p: ["Logging runs synchronously on the answer path and a slow log sink slows DNS responses.", "Logs are kept indefinitely with full addresses, which nobody has authorized."],
    v: "Send a known set of queries and confirm each appears in the log store with correct fields within the stated delay, with address truncation applied and the answer path latency unchanged.",
    dep: ["telemetry-pipeline", "privacy-and-residency"]
  },
  "nameserver-fleet": {
    s: "The set of authoritative servers spread across networks and locations, advertised in delegation, so DNS keeps working when any single server, site or provider fails.",
    d: "Delegation lists several nameservers, usually on different networks and sometimes with different operators, each possibly anycast. Resolvers pick among them by speed and retry on failure. All run the same configuration version and are monitored for agreement. Capacity is sized for attacks, not average load, and the fleet must be independent of the sites it steers, or the manager fails along with them. The difficulty is independence: a shared network, certificate or deployment pipeline quietly turns many servers into one failure domain.",
    k: ["Single operator on several networks vs several operators: one operator is easier to keep consistent, while several operators survive a provider-wide fault and drift in features and configuration.", "Dedicated fleet vs colocated with sites: dedicated fleets are independent of what they steer, and colocated nodes are cheap and fail with the site."],
    p: ["All nameservers are in the same data centers as the sites they steer, and a regional failure removes both.", "One server runs an older configuration for weeks and a share of users get different answers."],
    v: "Query every nameserver for the same names from many networks and confirm identical answers and versions. Disable one provider's servers and confirm resolution continues with no user-visible errors.",
    dep: ["authoritative-frontend", "failure-domain-independence", "config-distribution"]
  },
});
