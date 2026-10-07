// Details for the CDN plate, part 5: operations and reliability, cross-cutting concerns.
ATLAS.details("cdn", {
  "pop-health-monitoring": {
    s: "Continuously measures each site and server from inside and outside, such as errors, latency, saturation and routing state, and feeds automated drains, steering and alerts.",
    d: "Agents on every server report request error rates, latency percentiles, CPU, memory, disk and link utilization, and process health. Site-level aggregators combine them into a health score that drives decisions: pull a server from the balancer, shift DNS answers, withdraw routes. External probes complement internal signals, because a site can report healthy while unreachable. It is hard because signals must be fast and accurate enough to act on automatically, a monitoring failure must not look like a site failure, and a single bad signal must not drain the whole network.",
    k: ["Automatic action on health signals vs. alerting only: automatic action responds in seconds, but a faulty signal can cause its own outage, while alerting keeps humans in control and is slower.", "Local self-reporting vs. external observation: self-reporting is detailed and cheap, but misses what users see, while external observation is truthful and coarse."],
    p: ["A monitoring pipeline outage reads as every site being unhealthy and triggers mass drains.", "Averages hide a single failing server because the site's overall error rate stays low."],
    v: "Inject packet loss on one server and a link in a test site, and confirm the health score drops within the target time, the server is drained automatically, the site stays serving, and alerts name the correct component.",
    dep: ["synthetic-probing"]
  },
  "synthetic-probing": {
    s: "Scheduled test requests sent from many networks to every site and customer-style hostname, measuring availability, latency, correct content and cache behavior as a user would see them.",
    d: "Probes run from agents distributed across networks and regions, issuing requests with known expected responses: status, body hash, headers, certificate validity and cache status. They test the full path, including DNS, routing, TLS and the cache. Results build a baseline for each region and detect when a site, a prefix or a configuration change harms users. It is hard because coverage of the internet's variety is limited, probe traffic is not real traffic, and probes must not distort cache state or customers' billing.",
    k: ["Probes from cloud networks vs. real user networks: cloud probes are reliable and plentiful, while user-network probes see real problems and are harder to run.", "Probing every site separately vs. through the public path: per-site probes pinpoint failures, while public-path probes show what users reach."],
    p: ["All probes run from networks with excellent connectivity, so a problem affecting ordinary access networks never shows.", "Probe requests are counted in customer analytics and billing, polluting both."],
    v: "Break a single prefix announcement in a test and confirm probes from affected networks report failure within one probe interval, while probes elsewhere stay green, with the alert pointing at that prefix.",
    dep: []
  },
  "capacity-planning": {
    s: "Forecasts traffic and sizes sites, servers, links and interconnects months ahead, including headroom for failures, attacks, events and cache-cold traffic after shifts.",
    d: "Planners model demand by region and customer from history, product launches and known events, then compute needed throughput, storage, connections and CPU per site. They add headroom for losing a site, a link or a server batch, and for attacks. Lead times for hardware, power and interconnects, often months, force decisions in advance. Results drive purchasing, site builds and steering policy. It is hard because a few large customers cause step changes, peak is far above average, and failures concentrate load unevenly.",
    k: ["Planning for the peak plus failure of the largest component vs. for the average: peak planning avoids outages during events and failures, but leaves expensive hardware idle most of the time.", "Buying ahead of demand vs. just in time: buying ahead absorbs surprises, while just in time saves money and risks being unable to deliver for a large new customer."],
    p: ["A large customer launch doubles regional traffic and hardware lead times make it impossible to respond.", "Capacity is computed in aggregate while one site's links saturate because traffic cannot move freely."],
    v: "Replay the previous year's peak plus a simulated loss of the largest site in a model and in a load test, and confirm every remaining site and link stays under its safe utilization limit.",
    dep: ["pop-tiers-and-hardware","peering-and-transit"]
  },
  "gradual-rollouts": {
    s: "Releases new software to a small, growing share of servers with automatic checks between steps, so a faulty release is caught while few users are affected.",
    d: "A release begins on internal or low-risk sites, then moves through waves of increasing size, such as one server, one site, a region, and the world. At each wave, automated comparison of error rates, latency and resource use against a control group decides whether to continue, pause or roll back. Rollouts avoid touching all sites in one region simultaneously and honor change freezes. It is hard because defects may appear only under particular traffic or after hours, and urgent security patches pressure the schedule.",
    k: ["Long, careful waves vs. fast rollout: long waves detect slow-burn problems, but leave known vulnerabilities open longer, while fast rollouts close them and expose everyone to a bad build.", "Automatic halt on regression vs. human approval at each wave: automation is quick and consistent, while human approval adds judgment and delay."],
    p: ["A bug that only appears after a day of uptime passes every wave check because waves finish within an hour.", "The comparison group is not comparable to the updated servers, and a regression is read as noise."],
    v: "Release a build with an injected error rate increase to a test fleet and confirm the rollout halts at the first wave, rolls back automatically, and affects no more than the first wave's share of traffic.",
    dep: ["pop-health-monitoring","blast-radius-isolation"]
  },
  "config-canarying": {
    s: "Applies configuration changes, especially global ones such as rules, rulesets and routing, to a small slice of servers first and watches for harm before widening.",
    d: "Because configuration reaches every server in seconds, it is the most dangerous change class. Canarying distributes a change first to a few servers or a small share of requests, compares error and block rates against baseline, and widens in steps. Fast-path exceptions for emergency rules shorten but keep a minimal canary. Changes keep the last known good version and revert automatically on tripped alarms. It is hard because many damaging changes only show effect on specific customers' traffic, and speed and safety pull apart.",
    k: ["Staged propagation even for urgent security rules vs. immediate global push: staging prevents self-inflicted outages, but delays protection when an attack is underway.", "Canarying by server vs. by customer traffic share: by server tests the software path, while by customer traffic tests real-world effect on a fraction of users."],
    p: ["A global rule change bypasses canarying because it was labeled urgent, and blocks legitimate traffic everywhere.", "The canary slice carries too little traffic of the affected customer to show the problem."],
    v: "Push a rule that blocks a known good request pattern to a canary slice and confirm the block-rate alarm trips, the change is reverted automatically within the target time, and no server outside the slice received it.",
    dep: ["global-config-distribution","pop-health-monitoring"]
  },
  "kill-switches": {
    s: "Pre-built controls that disable a feature, rule, customer configuration or whole code path across the network within seconds, without a software release, when it is causing harm.",
    d: "Features ship behind switches that can be turned off through a separate, minimal and highly reliable channel: a small flag store polled by servers, with local defaults if it is unreachable. Switches exist at several scopes: global, product, customer and site. A tested runbook says who may flip each. Switching off must be safe in itself, falling back to a simpler behavior. It is hard because switches must work during an outage that may also affect the normal control path, and rarely used switches rot.",
    k: ["A separate, simple control path vs. the normal configuration pipeline: a separate path survives a broken pipeline, but is one more system to build and keep consistent.", "Many fine-grained switches vs. a few coarse ones: fine switches limit what is lost when disabling, while coarse switches are easy to remember and test."],
    p: ["The switch depends on the same distribution system that is down, so it cannot be thrown during the outage.", "A switch that has not been exercised in a year fails when needed because the fallback path was broken by later changes."],
    v: "In a drill, flip a switch for a feature under load and confirm it is off on all servers within the stated seconds, the fallback path serves correctly, and the same works with the main configuration pipeline disabled.",
    dep: ["global-config-distribution"]
  },
  "blast-radius-isolation": {
    s: "Structural limits that confine a failure to part of the network, such as separate software versions, address ranges, regions and customer groups, so no single fault can reach everything.",
    d: "The network is divided into cells: groups of sites or customers that receive changes at different times and, where possible, share no fate. Techniques include staggered release rings, separate DNS and address sets for different customer groups, per-customer failure isolation in shared processes, and independent control planes for critical services. Mistakes are caught in one cell before spreading. It is hard because the efficiency of a single global system fights against independence, and shared dependencies such as configuration or DNS quietly connect the cells.",
    k: ["Strong isolation between cells vs. shared global state: isolation limits any outage to a fraction of users, but duplicates infrastructure and complicates global features.", "Isolating by customer vs. by site: customer isolation protects customers from each other, while site isolation protects against infrastructure faults, and both are expensive."],
    p: ["Two supposedly separate cells depend on the same configuration service and fail together.", "One customer's heavy edge code degrades neighbors because per-customer limits were not enforced."],
    v: "Fail one cell on purpose in a drill, by pushing a faulty change to it, and confirm that traffic outside the cell is unaffected, with error rates there staying at baseline and no shared service reporting degradation.",
    dep: ["gradual-rollouts"]
  },
  "incident-response-tooling": {
    s: "The tools and practices for detecting, containing and fixing outages quickly: alerts, dashboards, drain and rollback commands, communication channels, status pages and review after the incident.",
    d: "Responders need a single view of health across sites, one-command actions to drain a site, withdraw a prefix, revert a release or flip a switch, and an audit of every change in the preceding hours, which is usually the cause. Roles such as commander and communicator are assigned. Customer communication goes through a status page that does not depend on the platform. After the incident, written reviews feed fixes. It is hard because tools are used rarely under stress, and the incident may impair the tools themselves.",
    k: ["Pre-approved powerful actions vs. approval gates during incidents: pre-approved actions let responders act in seconds, but give wide power to a few people and tools.", "Out-of-band tooling vs. tooling on the platform itself: out-of-band tools work during platform outages, while on-platform tools are convenient and fail together with the thing they fix."],
    p: ["The status page and responders' dashboards are served from the CDN, and are unavailable during a CDN outage.", "The recent-change log is incomplete, so responders spend an hour finding the change that caused the failure."],
    v: "Run a game day that breaks a site and a configuration, and measure time to detect, contain and communicate. Confirm responders used only out-of-band tools and the change log pointed to the injected cause.",
    dep: ["pop-health-monitoring","kill-switches","bgp-withdrawal-and-failover"]
  },
  "freshness-vs-hit-ratio": {
    s: "The tradeoff between serving content that is current and serving it from cache, which determines lifetimes, purge design, stale-serving rules and how much load reaches origins.",
    d: "Every stored response is a bet that it is still correct. Long lifetimes raise hit ratio and cut origin load and cost, and make updates slow or dependent on purge. Short lifetimes and revalidation keep content current at the price of latency and origin traffic. Techniques like stale-while-revalidate, soft purge, tags and versioned URLs move the balance. The decision is per content type and affects keying, storage, purge, tiering and origin sizing.",
    k: ["Version-in-the-URL with very long lifetimes vs. short lifetimes on stable URLs: versioned URLs give the best hits and need build support, while short lifetimes work for any site and cost origin load.", "Purge-driven freshness vs. time-driven freshness: purge gives exact updates with long lifetimes and requires reliable global purge, while time-driven expiry is simple and imprecise."],
    p: ["Teams set long lifetimes for convenience and discover they cannot fix wrong content quickly.", "Short lifetimes on popular content send constant revalidation load to a small origin."],
    v: "For a sample of content types, compare the measured age of served content, hit ratio and origin request rate against the targets the customer set, and confirm updates become visible within the promised time.",
    dep: ["cache-control-semantics","purge-propagation","stale-while-revalidate"]
  },
  "multi-tenant-isolation": {
    s: "Keeping customers apart on shared servers, caches, networks and processes, so that one cannot read, slow down or break another through data, resources or configuration.",
    d: "Millions of customers share the same machines. Isolation covers data, through key namespaces and verified keys; keys and certificates, through separate signing; resources, through per-customer limits on CPU, memory, connections and storage; and failures, through limits on the effect of one customer's configuration. Edge code adds sandboxes and metered resources. Abuse such as using the network to attack others must also be contained. It is the reason many features carry limits, and it must be designed in rather than added.",
    k: ["Shared infrastructure with software isolation vs. dedicated hardware: shared is cheap and dense, but depends on isolation that must never fail, while dedicated resources cost more and need less trust.", "Strict per-tenant quotas vs. best-effort sharing: quotas give predictable behavior and strand capacity, while best-effort uses everything and lets neighbors disturb each other."],
    p: ["A cache key that omits the tenant lets one customer read another's cached object on a shared hostname.", "A single customer's burst consumes shared disk throughput and slows everybody's misses."],
    v: "Run a hostile tenant that floods requests, fills storage and runs heavy edge code, and confirm other tenants' latency and hit ratio stay within their limits and no cross-tenant data is returned.",
    dep: ["cache-key-construction","function-resource-limits","private-key-isolation"]
  },
  "global-state-propagation": {
    s: "How changes to configuration, certificates, purges, rules and data reach every server, the delay and ordering each can tolerate, and what happens to servers that miss an update.",
    d: "Many kinds of state must be consistent everywhere: customer configuration, certificates, purge messages, security rules, geolocation data and key-value stores. Each has its own tolerance: purges need seconds, certificates minutes, geolocation days. They ride on shared distribution channels with versioning, signing, catch-up and last-known-good fallback. Decisions about push or pull, snapshot or delta, and acknowledgment shape correctness. The slowest path and the worst-behaved server define the real guarantee.",
    k: ["One shared distribution system vs. one per state type: one system reduces effort and spreads one failure everywhere, while separate systems isolate faults and fit each tolerance.", "Strict ordering vs. eventual convergence: ordering prevents odd interleavings and is slower, while convergence is fast and tolerates temporary inconsistency."],
    p: ["Changes applied in different orders at different sites produce behavior no one tested.", "A server partitioned for days resumes with state so old that it is unsafe to serve."],
    v: "Measure, for each kind of state, the time until every server reports the new version, and confirm the slowest server meets the target for that kind, with partitioned servers refusing to serve data older than its limit.",
    dep: ["global-config-distribution","purge-propagation","kv-replication-and-consistency"]
  },
  "blast-radius": {
    s: "How far any one mistake, whether a release, configuration, rule or operator action, can spread, and the structures, delays and limits that keep that distance small.",
    d: "A global system with fast configuration distribution can turn a typo into a worldwide outage in a minute. Containment comes from staging every change, separating cells, keeping control paths independent of data paths, having fallbacks that use the last good state, and making rollback faster than rollout. Safety work also covers people: permissions, review and tooling that make dangerous actions hard to take by accident. Each layer has its own change path, and each path needs these controls.",
    k: ["Slow staged changes everywhere vs. fast paths for emergencies: uniform staging removes the dangerous exception, but delays real emergency responses.", "Independent copies of critical services vs. one shared service: independence limits the damage of one fault, while a single service is simpler and a global single point of failure."],
    p: ["An emergency path bypasses staging, and its first use is a mistake that reaches everything.", "Rollback depends on the same system that the bad change broke."],
    v: "For each change type, inject a harmful change in a drill and measure the share of traffic affected before it is stopped, confirming it stays under the declared limit and rollback completes within target.",
    dep: ["gradual-rollouts","config-canarying","blast-radius-isolation"]
  },
  "bandwidth-economics": {
    s: "The cost structure that shapes the design: bytes delivered, transit and peering prices, hardware, and the value of every cache hit that keeps a byte off an expensive path.",
    d: "Delivering bytes is the dominant cost, so almost every choice trades hit ratio, interconnect mix, compression, tiering and site placement against price per gigabit. Cached bytes served locally cost little, while misses cross expensive links and load the origin. Customers' contracts, committed rates and regions have very different margins. Unlike latency, cost is rarely visible to engineers, so decisions need cost metrics next to performance metrics. This shapes routing, eviction by size, admission, and the choice of what to serve from where.",
    k: ["Optimizing for byte hit ratio vs. request hit ratio: byte hit ratio lowers bandwidth cost, while request hit ratio improves latency and may keep large objects out.", "Serving from the cheapest site vs. the nearest: cheapest sites save money, and nearest sites give better experience, so policies set a bounded tradeoff."],
    p: ["Optimizing latency alone shifts traffic onto expensive transit and erodes margins unnoticed for months.", "A single customer's huge downloads dominate cost but are priced like everyone else's."],
    v: "Report cost per delivered gigabit by region, customer and interconnect, alongside hit ratios and latency, and confirm a steering change shows its cost effect within a day.",
    dep: ["peering-and-transit","eviction-policy","usage-metering"]
  },
  "tail-latency-budget": {
    s: "The allowance for time spent in each stage of a request, so the slowest few percent of requests stay fast enough even with many components, retries and cache misses along the path.",
    d: "A request passes through the network path, load balancer, TLS, rules, security checks, cache lookup, possible edge code, upstream tiers and the origin. Each stage adds latency, and each rare slow event, such as a disk stall, a new handshake or a cold function, shows up in high percentiles. Budgets set time per stage, drive limits on rules and code, and justify design choices like memory tiers, connection reuse and early rejection. Measurement focuses on percentiles, not averages, and on hits and misses separately.",
    k: ["Adding checks inline vs. asynchronously: inline checks stop bad requests before they are served, but add their latency to every request, while asynchronous checks are free of delay and act after the fact.", "Optimizing the median vs. the tail: median work is easy and visible, while tail work needs isolating slow drives, bounding retries and a lot of unglamorous measurement."],
    p: ["Each new feature adds a little latency and no one owns the total, until the tail is double what it was.", "Averages look fine while one in a hundred requests waits on a stalled disk."],
    v: "Measure hit and miss latency at the 50th, 99th and 99.9th percentiles per stage using request tracing, and confirm the sum of stage budgets stays under the end-to-end target after each release.",
    dep: ["cache-server-process","memory-tier","origin-timeouts-and-retries"]
  },
});
