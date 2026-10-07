// Details for the global traffic manager plate, part 3: capacity awareness and health checking.
ATLAS.details("global-traffic-manager", {
  "capacity-model": {
    s: "An explicit estimate of how much load each site can serve within its latency and error limits, for normal operation and for failover surges.",
    d: "For each site the model holds a capacity figure in the unit that actually limits it, such as requests per second, connections or bandwidth, plus the conditions under which it holds: how many servers are in service, how warm the caches are, which dependency is the bottleneck. It is built from load tests and production observations, not from hardware counts. The model feeds weights, overflow ordering and simulations. The difficulty is that capacity is not constant: a deploy, a degraded dependency or a different traffic mix can halve the number overnight.",
    k: ["Measured from load tests vs inferred from production: tests give controlled numbers on yesterday's software, while production inference tracks reality and rarely sees the limit.", "Single number per site vs per request class: one number is easy to use, and per-class numbers reflect that expensive requests consume most of the capacity."],
    p: ["Capacity is entered once from a purchase order and is never revised as the service changes.", "The bottleneck is a shared database, so every site's stated capacity is true only if the others are idle."],
    v: "Ramp a site's load toward the stated capacity in a test window and confirm latency and error rate stay within limits up to that figure and degrade beyond it.",
    dep: ["load-ingest", "endpoint-inventory"]
  },
  "load-ingest": {
    s: "Collects current utilization from each site, such as request rate, concurrency and queue depth, fast enough for steering to react before saturation.",
    d: "Sites report load through the telemetry pipeline or are polled by the manager at intervals of seconds. Metrics are normalized against the capacity model into a utilization fraction and smoothed to remove noise without hiding a rise. A freshness timestamp accompanies every value, and stale values are discarded or weighted down. The difficulty is delay: by the time a utilization number has been collected, aggregated and distributed to answering nodes, and the answers it changes have propagated through caches, the load it described is long gone.",
    k: ["Push from sites vs poll by the manager: push is timely and needs each site to be configured correctly, while polling gives control of cadence and adds load and a single point of delay.", "Raw instantaneous values vs smoothed: raw values react quickly and jitter, while smoothing is steadier and lags a sharp rise."],
    p: ["The loop from load to steering is slower than a traffic surge, so the signal always arrives after the overload.", "A site that stops reporting is treated as having zero load and receives more traffic."],
    v: "Raise load on one site and measure the time from the load change to the corresponding weight change in answers, and confirm a silent site is marked unknown, not idle.",
    dep: ["telemetry-pipeline", "capacity-model", "time-sync"]
  },
  "headroom-reserve": {
    s: "A deliberate margin of unused capacity in each site, sized so remaining sites can absorb the traffic of a failed one without overload.",
    d: "If three sites share load evenly, each must run below about two thirds of capacity so two can carry the whole. The reserve is calculated from the failure scenarios the service promises to survive, such as one site or one region, and enforced by treating a site as full at a lower threshold than its true limit. The cost is idle hardware, so reserve is tied to business targets. The difficulty is that the reserve is invisible until needed, and growth quietly consumes it.",
    k: ["Uniform reserve per site vs reserve sized by the largest neighbor: uniform is simple, and sizing by the largest failure protects against the case that actually hurts.", "Idle reserve vs preemptible workloads in the reserve: using spare capacity for batch work recovers cost, and it must be evicted in seconds when failover starts."],
    p: ["Traffic growth consumes the reserve over a year and the next failover is the first to reveal it.", "Reserve is computed for single-site loss but a shared dependency failure takes out two at once."],
    v: "Compute failover utilization from live numbers for each single-site loss scenario and confirm all stay below the target, then confirm a drill matches the calculation closely.",
    dep: ["capacity-model", "decision-simulator", "overflow-ordering"]
  },
  "utilization-weighting": {
    s: "Adjusts each site's weight continuously from its utilization, sending less to hot sites and more to cool ones, so load evens out without manual tuning.",
    d: "A controller reads utilization per site and nudges weights toward a target, such as equalizing percentage of capacity used. Gain and step limits keep the loop stable, because answers take a TTL to take effect and a controller that expects instant feedback will overshoot. Weights stay within bounds so a failing metric cannot send all traffic to one site. The difficulty is control stability: this is a feedback loop with a long delay, and badly tuned it oscillates with a period of a few TTLs.",
    k: ["Proportional adjustment with small steps vs target-seeking jumps: small steps are stable and slow to relieve a hot site, while jumps relieve quickly and can overshoot into the neighbor.", "Equalize utilization vs minimize latency subject to a ceiling: equalizing is fair and may send nearby users far away, while the ceiling approach uses proximity until the limit."],
    p: ["The controller's period is shorter than the cache turnover, so it sees no effect and keeps pushing until it overshoots.", "A metric bug reports low utilization for a failing site and the controller sends it more traffic."],
    v: "Apply a step increase of demand and plot per-site utilization and weights over time. Confirm the loop settles within a few TTLs, without sustained oscillation, and weights stay in bounds.",
    dep: ["load-ingest", "weighted-distribution", "hysteresis-damping"]
  },
  "overflow-ordering": {
    s: "Defines which sites take the excess when a preferred site reaches its limit, and in what order, so spillover goes to places that can handle it.",
    d: "When a site's utilization crosses its ceiling, further answers divert to the next sites in a configured order, often by proximity and spare capacity. Spillover can be per client group, so one region's excess goes to a known neighbor rather than spreading over everyone. The rule combines with failover: a failed site's traffic is just a large overflow. The difficulty is cascades: a neighbor that takes overflow can cross its own ceiling and pass it on, and a poorly ordered chain walks the overload around the map.",
    k: ["Fixed spillover pairs vs dynamic spare-capacity choice: pairs are predictable and planned for, while dynamic choice uses all headroom and is harder to predict and test.", "Spill by percentage of clients vs by client group: percentages are easy to apply, and group-based spill keeps the same users together for caching and affinity."],
    p: ["Two sites are each other's overflow target, and a surge in one passes back and forth.", "Overflow goes to the nearest site regardless of its own utilization and pushes it over its limit."],
    v: "Push one site above its ceiling in a test and confirm only the excess diverts, to the configured next site, which stays within its own ceiling, and returns when load drops.",
    dep: ["capacity-model", "utilization-weighting", "policy-chain"]
  },
  "autoscale-coordination": {
    s: "Links steering to each site's autoscaler, so traffic is shifted gradually while new capacity starts, and scale-up is requested before a shift lands.",
    d: "Autoscalers add servers in minutes; steering moves traffic in seconds to a TTL. Left alone they fight: a failover lands before capacity exists, then scale-up and steering adjust each other. Coordination shares signals in both directions: the manager tells a site that a shift is coming, and the site reports its ready capacity. Weights then follow ready capacity, not requested. The difficulty is warm-up and limits: new servers are slow at first, quotas cap growth, and a region-wide failover can ask for more capacity than the neighbor's cloud can supply.",
    k: ["Predictive notice to the autoscaler vs reactive scaling after load arrives: notice avoids the gap and relies on accurate planning, while reactive is simple and always late for a sudden surge.", "Weights follow ready capacity vs target capacity: ready capacity is safe and slower, while target capacity moves faster and sends traffic to servers that are not yet serving."],
    p: ["Failover traffic arrives well before the new servers are warm, and the neighbor is overloaded for minutes.", "A scaling quota in the receiving region was never raised, so scale-up is refused at the moment it matters."],
    v: "Trigger a planned shift and confirm the receiving site's autoscaler starts before traffic arrives, and that weights follow its ready capacity so utilization remains below the ceiling throughout.",
    dep: ["load-ingest", "utilization-weighting", "gradual-shift"]
  },
  "load-shedding-handoff": {
    s: "Coordinates with sites that shed load when overloaded, so rejected requests are visible to the manager and steering can relieve the site instead of fighting it.",
    d: "An overloaded site may reject, queue or degrade requests to protect itself. Those actions are signals: rising rejection rate means steering should send less. The site reports shed rate along with utilization, and the manager treats it as a stronger signal than latency alone. In the other direction, the manager avoids sending shed traffic to an equally loaded neighbor. The difficulty is that shedding hides overload from health checks, which keep passing while real users are being turned away.",
    k: ["Treat shedding as a health signal vs as a load signal: as health it drains the site quickly and loses capacity, while as load it reduces weight and keeps serving what it can.", "Shed at the site only vs steer away first: site-level shedding is fast and local, while steering relieves the cause and acts only after delay."],
    p: ["A site sheds thirty percent of requests while every health check passes, so steering never reacts.", "Shed requests are retried by clients and double the load that caused the shedding."],
    v: "Overload a test site until it sheds and confirm its shed rate reaches the manager, that its weight drops within the target time, and that the shed rate returns to zero afterward.",
    dep: ["load-ingest", "utilization-weighting", "health-endpoint-contract"]
  },
  "probe-checks": {
    s: "The kinds of tests run against a site: connection tests, HTTP requests with content checks, TLS handshakes and scripted transactions that exercise real dependencies.",
    d: "A connect check shows that something is listening. An HTTP check requests a path and verifies status, latency and sometimes body content. A TLS check validates the certificate and chain, so an expiring certificate drains a site before users see errors. A transaction check logs in or reads and writes test data, touching real dependencies. Deeper checks catch more failures and cost more, and can themselves be the cause of load or false alarms. The difficulty is depth: shallow checks pass during real outages, and deep ones fail for reasons unrelated to serving users.",
    k: ["Shallow connect check vs deep transaction check: shallow checks are cheap and stable but miss most real failures, while deep ones match user experience and fail on dependencies not needed for most requests.", "Check the public address vs an internal one: the public path covers the network users take, and internal checks are more reliable and miss edge problems."],
    p: ["A static page check passes for hours while the application behind it returns errors.", "A deep check writes test data that nobody cleans up, filling a table."],
    v: "Break each layer in turn, listener, application, database and certificate, and confirm at least one configured check fails for each, within its expected delay.",
    dep: ["health-endpoint-contract", "probe-scheduler"]
  },
  "probe-scheduler": {
    s: "Runs each check at a set interval with jitter and timeouts from many places, balancing detection speed against the load the probes create.",
    d: "Each endpoint has an interval, such as every ten seconds, a timeout and a retry policy. Probers add random jitter so thousands of checks do not fire together, and spread checks across sites so a single prober outage does not blind the system. Results flow to the aggregation step with timestamps. Detection time is roughly the interval multiplied by the failure count plus the timeout. The difficulty is arithmetic at scale: many probers times many endpoints times short intervals can send more traffic to a site than some of its real users.",
    k: ["Short intervals vs long: short intervals detect failure quickly and add load and noise, while long intervals are cheap and extend every outage by the interval.", "Central scheduler vs distributed probers each deciding for themselves: central scheduling gives control and a single point of failure, while distributed probers are resilient and harder to coordinate."],
    p: ["Probers start together after a restart and all hit one site in the same second.", "Timeout is longer than the interval and checks pile up behind a slow site."],
    v: "Compute expected detection time from interval, count and timeout, then break a site and measure the actual delay until it is marked down. They should agree within one interval.",
    dep: ["probe-checks", "time-sync"]
  },
  "probe-vantage-points": {
    s: "The places probes run from, such as outside the network, inside each region and from several carriers, so a path problem is not mistaken for a site failure, or the reverse.",
    d: "A site can be healthy from inside its own network and unreachable from outside, or the reverse. Probes from several external networks show how real users reach the site, and probes from inside show whether the service itself works. Comparing views separates a failing site from a broken link. Vantage points are chosen to represent real client networks. The difficulty is representation: a handful of prober locations in large cloud networks do not experience the same paths as users on small carriers.",
    k: ["Many external vantage points vs few: many views separate path problems from site problems and cost money and coordination, while few are simple and mistake local trouble for global.", "Probers co-located with sites vs independent: co-located probers are easy to run and share fate with the site, while independent ones survive its failure."],
    p: ["All probers live in one cloud provider and its outage makes every site look dead.", "Probes run only from inside the site and miss an upstream routing failure users can see."],
    v: "Block one carrier's path to a site and confirm external probes from that carrier fail while others pass, and that the system reports a partial reachability problem, not a site failure.",
    dep: ["probe-checks", "quorum-aggregation"]
  },
  "health-thresholds": {
    s: "The rules that turn a stream of probe results into a state such as healthy, degraded or down: how many failures, over how long, and how many successes to recover.",
    d: "Each endpoint's state comes from a sliding window of results. A site may be marked down after three consecutive failures, degraded when error rate exceeds a fraction, and healthy again after a longer run of passes. Latency thresholds mark slow sites as degraded and reduce weight. Hysteresis keeps states from flipping with each sample. The difficulty is the choice of numbers: they decide the minimum failover time and the false-alarm rate, and no setting is right for every service.",
    k: ["Binary up or down vs graded states: binary states are simple to act on, and graded states allow weights to fall gradually before a site is removed.", "Fast removal and slow restoration vs symmetric: asymmetric rules protect users from unstable sites and delay returning healthy capacity."],
    p: ["Thresholds are copied between services with different traffic, and a low-traffic service flips state on a single failed sample.", "A latency threshold is set below normal peak latency and drains the site every evening."],
    v: "Replay a recorded probe stream containing known blips and outages and confirm the state timeline shows no change for the blips and marks the outages at the expected delay.",
    dep: ["probe-scheduler", "hysteresis-damping"]
  },
  "quorum-aggregation": {
    s: "Combines results from many probers into one verdict per endpoint, requiring agreement before removal, so one prober's bad network cannot take a site out.",
    d: "Each prober reports its own view. The aggregator computes the fraction failing across independent probers and acts only when it exceeds a quorum, such as a majority of regions. It also applies a global safety rule: never remove more than a stated share of capacity on health data alone. Disagreement is itself recorded, because it shows partial failures. The difficulty is correlated probers: ten probers in one network count as one opinion, and quorum must be counted over independent failure domains, not instances.",
    k: ["Majority across regions vs any prober failing: majority resists false alarms and slows detection of failures visible to few users, while any-fails reacts at once and drains on noise.", "Global capacity floor vs trust health fully: a floor prevents a probing fault from removing everything, and keeps serving from a site that really is down."],
    p: ["A prober fault reports every site down and, without a capacity floor, the system removes the entire fleet.", "Quorum counts prober instances in one network, and that network's outage looks like a majority."],
    v: "Make a single prober report all sites failing and confirm no state change, then fail one site from most vantage points and confirm it is removed, with the floor limiting total removals.",
    dep: ["probe-vantage-points", "health-thresholds", "health-state-store"]
  },
  "dependency-aware-health": {
    s: "Considers whether a site's critical dependencies, such as database, queue or downstream service, are working, so health reflects ability to serve and not only that the front end responds.",
    d: "A site's health endpoint can aggregate its own checks of critical dependencies and report a summary, or the manager can combine its own checks of several services. Dependencies are classed as required or optional. The state can also include replication lag or data freshness, so a site that serves stale data is marked down for services that need current data. The difficulty is blast radius: if a shared dependency fails everywhere, dependency-aware checks mark every site down together and leave nowhere to send users.",
    k: ["Report dependency state in health vs only front-end liveness: dependency-aware health matches user impact, and a shared dependency failure drains every site at the same time.", "Per-request-class health vs one status: per-class health keeps healthy functions available and is more complex for operators to read."],
    p: ["A shared dependency outage makes every site report unhealthy and the system has no valid answer.", "An optional dependency is classified as required, and a minor outage drains a site."],
    v: "Fail a required dependency in one site and confirm it is marked down, while failing an optional one only lowers weight, and confirm a shared failure triggers the floor rule, not a total drain.",
    dep: ["health-endpoint-contract", "quorum-aggregation"]
  },
  "health-endpoint-contract": {
    s: "The agreement between service teams and the manager about what a health endpoint reports, what its statuses mean and what it must never do.",
    d: "The contract specifies a path, authentication, response codes and a body with named checks, plus rules: fast response, no side effects, no unbounded dependencies and a distinct status for draining. Separate liveness, readiness and drain signals keep different meanings apart. The same endpoint is used by regional load balancers, so one definition serves both layers. The difficulty is drift: each team writes the endpoint differently and without a shared contract, the manager has to guess what a failure means.",
    k: ["One endpoint for all consumers vs separate ones for the load balancer and the global manager: one endpoint avoids disagreement, while separate ones allow different depth and probe rates.", "Status code only vs structured body: status codes are universal and crude, while structured bodies carry reasons and cost parsing and schema upkeep."],
    p: ["A health endpoint performs an expensive query and itself causes the load that makes it fail.", "The endpoint returns success while draining and the manager keeps sending new users."],
    v: "Call each service's endpoint during normal, draining and dependency-failure states and confirm the documented status and body for each, within the response time limit.",
    dep: ["probe-security"]
  },
  "lb-health-import": {
    s: "Reads health and load from regional load balancers, which already know about every server, instead of probing individual servers from outside.",
    d: "A regional load balancer tracks backend health and pool size. The manager reads a summary, such as healthy backends and available capacity, through an API or telemetry feed, and uses it for the site's overall state. A site with half its servers down is degraded, not up. Combining it with external probing gives both the internal and user views. The difficulty is trust: the load balancer's view may be wrong in the same way the service is, and when it is the one that has failed, it reports nothing at all.",
    k: ["Import load balancer summaries vs probe the VIP only: summaries show partial degradation, while VIP probes show only that some server answered.", "Trust internal health vs verify externally: internal data is richer and can miss user-visible path failures, so many designs require both to pass."],
    p: ["The load balancer itself fails and its last-reported health is used for hours.", "The summary counts servers up but not whether each can accept requests, and capacity is overestimated."],
    v: "Remove half of a site's backends and confirm the manager shows reduced capacity within the feed interval and lowers the weight, then stop the feed and confirm the data is marked stale.",
    dep: ["regional-lb-handoff", "health-state-store", "load-ingest"]
  },
  "health-state-store": {
    s: "The shared record of each endpoint's current state and its recent history, from which every answering node reads when it builds an answer.",
    d: "Aggregators write state changes with timestamps and reasons; answering nodes read a replicated copy. State is small and changes rarely compared with queries, so it is distributed on a fast path separate from configuration. History is kept for analysis and for damping decisions. Reads must be local and cheap, since evaluation happens per query. The difficulty is consistency and staleness: nodes may disagree briefly about a site's state, and a partition can leave some nodes with old state for as long as it lasts.",
    k: ["Strongly consistent store vs eventually consistent replicas: strong consistency gives one truth and blocks answers during a partition, while eventual consistency keeps answering and may briefly disagree.", "Store state transitions vs only current state: transitions support damping and audit and need more space, while current state is simple and loses the explanation."],
    p: ["A node with a stale replica keeps sending users to a site that was drained minutes ago.", "State is written with local clocks and out-of-order updates revive a site that was already marked down."],
    v: "Change an endpoint's state and measure the time until every answering node reflects it. Partition one node and confirm it reports state age so its staleness shows on dashboards.",
    dep: ["replicated-state", "config-pubsub"]
  },
  "probe-security": {
    s: "Authenticates probes and protects health endpoints, so outsiders cannot learn internal state, impersonate probers or exhaust a site with fake checks.",
    d: "Health endpoints are reachable from the internet but should answer only known probers, identified by network ranges, tokens or mutual authentication. Responses to unknown callers give no detail. In the other direction, probers verify that they reach the right site, and signed results stop forged reports from changing state. Rate limits apply to checks as to any other traffic. The difficulty is the allowlist: probing networks change, and a missed update blocks genuine probes and falsely drains a healthy site.",
    k: ["Network allowlist vs token authentication: allowlists are simple and break when prober ranges change, while tokens work from anywhere and need rotation and secure storage.", "Detailed responses to authenticated probers vs minimal responses to everyone: detail helps diagnosis, and minimal responses leak nothing if authentication fails."],
    p: ["A prober fleet moves to new addresses without notice and every site starts failing its checks.", "A detailed health response is exposed publicly and reveals dependency names and versions."],
    v: "Request a health endpoint from an unauthorized address and confirm a bare refusal. Send a forged health report to the aggregator and confirm it is rejected and logged.",
    dep: ["secrets-and-keys", "health-endpoint-contract"]
  },
});
