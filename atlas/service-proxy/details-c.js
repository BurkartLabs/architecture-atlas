// Details for the service proxy plate, part 3: clusters and load balancing, health and resilience, upstream connections.
ATLAS.details("service-proxy", {
  "upstream-clusters": {
    s: "A named group of equivalent upstream hosts with shared settings for balancing, health checking, connection limits, protocol and TLS, which routes send traffic to.",
    d: "A cluster definition ties together a discovery method, a load balancing policy, health check and outlier settings, circuit breaker thresholds, connection pool options, upstream protocol and the transport security context. Routes refer to clusters by name, and everything about talking to a service lives in one place. Clusters are created, updated and warmed dynamically. It is hard because a cluster's settings interact, and defaults tuned for one service, such as a retry policy or a connection limit, are wrong for another.",
    k: ["One cluster per service versus per version or per zone: finer clusters give precise control and statistics, but multiply configuration and endpoint memory.", "Shared defaults versus explicit per-cluster settings: shared defaults keep configuration small, but hide behavior that differs by service."],
    p: ["A cluster inherits a connection limit meant for small services and throttles a high-volume one.", "A cluster with no healthy hosts and no panic setting returns errors with no sign of which setting caused it."],
    v: "Fetch a cluster's state from the admin interface and confirm its hosts, health flags, active connections and circuit breaker levels, then send a request and confirm counters move on that cluster only.",
    dep: ["endpoint-sets", "service-discovery", "circuit-breaking", "connection-pool"]
  },
  "endpoint-sets": {
    s: "The current list of hosts in a cluster, with address, weight, locality, health status and metadata, grouped into priority levels.",
    d: "Each endpoint has an address and port, a load balancing weight, the zone and region it runs in, a health status from checks or the registry, and key-value metadata such as version or tenant. Endpoints are organized into localities and priorities. The set is replaced or patched as discovery reports changes, and worker threads each get an immutable snapshot. It is hard because the set changes constantly, and every change must cause no more than a small, proportionate change in who receives traffic.",
    k: ["Immutable snapshots per thread versus a shared mutable list: snapshots avoid locks on the hot path, but a thread uses a slightly stale list until it receives the new one.", "Carrying metadata on endpoints versus a separate lookup: metadata allows subset selection and routing by version, but increases memory per endpoint."],
    p: ["A large cluster receives constant small updates, and rebuilding balancer structures on each one burns CPU.", "A host removed from discovery keeps receiving traffic until existing connections end."],
    v: "Replace one host in a cluster of a hundred and confirm all workers see the new set within the propagation time, and that traffic to the other ninety-nine hosts is unchanged.",
    dep: ["thread-local-config"]
  },
  "service-discovery": {
    s: "How a cluster learns its hosts: a static list, DNS resolution, or a subscription to a management server that tracks the registry.",
    d: "Static clusters list addresses in configuration. DNS clusters resolve a name periodically and use the returned addresses, either all of them or just the first. Dynamic clusters subscribe to endpoint updates from the control plane, which watches the platform. A hybrid pattern has the proxy resolve a name per request the first time it is seen. Discovery interacts with health: a host absent from discovery is removed, while a host failing checks is only marked unhealthy. It is hard because DNS has caching, truncation and ordering behavior that can hide or reorder hosts.",
    k: ["Control-plane endpoint discovery versus DNS: control-plane discovery is fast and rich in metadata, but needs the management server, while DNS works anywhere and is slow to change.", "Resolving on a timer versus on demand: a timer is predictable, but on-demand resolution responds better to churn at the cost of first-request latency."],
    p: ["DNS responses are cut at the packet limit and a large service appears to have only some of its hosts.", "A resolution failure is treated as an empty result, removing all hosts from the cluster at once."],
    v: "Change the DNS records for a cluster and confirm the host list updates within the refresh interval. Make resolution fail and confirm the proxy keeps the previous addresses rather than clearing them.",
    dep: ["endpoint-sets", "upstream-clusters", "dynamic-config-api"]
  },
  "cluster-manager": {
    s: "The component that owns every cluster: it creates, updates and removes them, warms new ones, and hands each worker a consistent view.",
    d: "On a cluster update it builds the new cluster on the main thread, starts discovery and initial health checks, and only then publishes it to workers, replacing the old one with its connection pools drained. Each worker gets its own thread-local copy of the cluster set. It also supports on-demand cluster discovery and tracks which clusters are in use. It is hard because cluster changes interact with live traffic: removing a cluster must let in-flight requests complete, and updating one must not drop pooled connections needlessly.",
    k: ["Replacing a cluster atomically versus mutating it in place: replacement is simple and safe for readers, but throws away pools and statistics unless they are carried over.", "Warming before publication versus lazy initialization: warming avoids early failures, but delays configuration and holds up dependent resources."],
    p: ["A small change recreates the cluster and discards all warm connections, causing a latency spike and a burst of handshakes.", "A cluster removal races with a request using it, and the request fails with a missing-cluster error."],
    v: "Update a cluster's setting under load, confirm requests continue with no errors, and confirm connections in use finish on the old pools while new requests use the new ones.",
    dep: ["upstream-clusters", "thread-local-config", "warming-and-ordering"]
  },
  "round-robin": {
    s: "Selects hosts in rotating order, optionally weighted, so each receives a similar share of requests regardless of how loaded it is.",
    d: "Each worker keeps a cursor into the host list and advances it on each pick, skipping unhealthy hosts. With weights, a host appears in proportion to its weight using a schedule that spaces its turns instead of clustering them. It needs no information about load, so it is cheap, predictable and easy to reason about. Since each worker has its own cursor, workers should start at random positions to avoid all selecting the same host first. It is hard because it assumes equal cost per request, which is false when requests vary or hosts differ.",
    k: ["Round robin versus load-aware choice: round robin is simple and needs no feedback, but ignores slow hosts and long requests that pile up.", "Per-worker cursors versus a shared cursor: per-worker has no contention, but the combined sequence is not a perfect rotation."],
    p: ["All workers start at the first host, sending a burst of initial requests to one instance after each restart or update.", "Equal shares go to a host that is half as fast, and its queue grows until it times out."],
    v: "Send ten thousand equal requests to a cluster of five healthy hosts and confirm each receives within a small tolerance of two thousand, then mark one unhealthy and confirm the rest share its load evenly.",
    dep: ["endpoint-sets", "worker-threads"]
  },
  "least-request": {
    s: "Prefers hosts with fewer requests currently in flight, so slower or busier hosts receive less new work.",
    d: "The proxy tracks in-flight request counts per host. The common implementation samples a few hosts at random and picks the one with the fewest active requests, avoiding the cost of a full scan, with weights applied by scaling counts. It adapts to slow hosts automatically, since their requests stay in flight longer. It works best with variable request cost and long-lived streams. It is hard because each proxy only sees its own requests, so with many proxies the counts are partial, and a newly added host with zero load can attract a flood.",
    k: ["Sampling a few hosts versus scanning all: sampling is constant time and spreads load well, but is not perfectly optimal on any single pick.", "Local in-flight counts versus fleet-wide load data: local counts are free and immediate, but undercount the load other proxies place on a host."],
    p: ["A freshly started host has zero requests and receives every pick until it is overwhelmed.", "A host failing fast has few in-flight requests and attracts more traffic, which fails too."],
    v: "Slow one host in a cluster of five and confirm over time it receives clearly fewer requests than the others, and that after it recovers its share returns to equal.",
    dep: ["endpoint-sets", "slow-start", "power-of-two"]
  },
  "power-of-two": {
    s: "Picks two hosts at random and sends the request to the better one, giving nearly the quality of a full comparison at constant cost, plus plain random selection.",
    d: "Pure random selection is the simplest policy and balances well when many requests are sent to many hosts, but has noticeable variance. Choosing two candidates and comparing a load signal such as in-flight count or recent latency removes most of that variance with almost no extra work. It also avoids herding, where many proxies all pick the same apparently best host at once. It is hard because the signal must be fresh, cheap and comparable, and a poor signal makes the second choice worthless.",
    k: ["Two random choices versus choosing the global best: two choices avoid herding and need no global state, while the global best is optimal for one proxy but synchronizes many proxies onto one host.", "Random only versus two choices: random needs no load data at all, but has higher variance and occasional uneven bursts."],
    p: ["The load signal is stale by seconds, so comparisons favor a host that has already become busy.", "A very small cluster makes both random choices frequently the same host."],
    v: "Compare the spread of per-host request counts and tail latency for random and two-choice selection over the same traffic, confirming two-choice shows visibly lower variance.",
    dep: ["endpoint-sets"]
  },
  "ring-hash": {
    s: "Maps a request's hash key onto a ring of host positions, so the same key goes to the same host and adding or removing a host moves only a fraction of keys.",
    d: "Each host is placed on a ring at many points derived from hashing its identity, with more points for higher weights. A request's key is hashed and the first host clockwise from that point is chosen, skipping unhealthy hosts. When membership changes, only keys near the affected points move. Ring size trades memory and build time against evenness: too few points produce uneven shares. It is used for cache affinity and session stickiness. It is hard because balance is statistical and can leave one host with noticeably more.",
    k: ["A larger ring versus a smaller one: more points give a more even distribution, but cost memory and rebuild time on every membership change.", "Consistent hashing versus plain modulo: consistent hashing moves few keys on change, but is less evenly balanced than a modulo over a stable list."],
    p: ["Too few ring points leave one host with twice the average load, and nobody sees it in aggregate metrics.", "When the chosen host is unhealthy the walk to the next host sends its whole load to one neighbor."],
    v: "Hash ten thousand keys, record each assignment, remove one of ten hosts and confirm about a tenth of keys moved and all of them were the removed host's. Check the per-host share is within tolerance.",
    dep: ["hash-policy", "endpoint-sets"]
  },
  "permutation-hashing": {
    s: "Builds a fixed lookup table by interleaving each host's preferences, giving consistent hashing with faster lookups and more even distribution than a ring.",
    d: "Each host generates a permutation of table slots from its identity. The table is filled by letting hosts take turns claiming their next preferred free slot, weighted for hosts with more capacity, until every slot is assigned. A lookup is a hash and an array index, with no search. The table is rebuilt on membership change and its size, usually a prime number, controls evenness. Disruption on change is small, though slightly higher than a ring. It is hard because the table build costs time proportional to its size and must be done off the hot path.",
    k: ["Table-based lookup versus a ring: lookups are constant time and shares are very even, but a rebuild moves slightly more keys than a ring and takes longer.", "A large table versus a small one: larger tables are more even and robust to many hosts, but use more memory per cluster per worker."],
    p: ["A rebuild runs on a worker thread for a large table and stalls requests while a big cluster updates.", "The table size is smaller than a hundred times the host count, and distribution is noticeably uneven."],
    v: "Fill a table for fifty hosts, confirm each host's slot share is within one percent of its weight, remove one host and measure that only about its share of keys change owner.",
    dep: ["hash-policy", "endpoint-sets"]
  },
  "locality-weighted": {
    s: "Distributes traffic among localities such as zones or regions using weights, so a proxy prefers nearby hosts but can spill over to others.",
    d: "Endpoints are grouped by locality and each group carries a weight. The balancer first picks a locality in proportion to weights, adjusted by the healthy fraction of each, then picks a host within it. Priority levels add ordered failover: traffic goes to the highest priority with enough healthy hosts, and overflows to lower ones as health falls, using an overprovisioning factor. It is hard because the arithmetic of health, weight and overflow must give predictable results when part of a locality fails.",
    k: ["Strict preference for local hosts versus weighted spreading: local preference cuts latency and cross-zone cost, but can overload a small local group, which weights smooth out.", "Priority failover versus even spreading across everything: failover keeps traffic near, but concentrates it on whatever tier is next when something fails."],
    p: ["A locality loses half its hosts and the remaining ones receive a flood because overflow is computed too late.", "Locality labels on hosts do not match those the proxy reports for itself, so the preference never applies."],
    v: "With three zones, confirm traffic prefers the local one in steady state. Fail half the local hosts and confirm part of the traffic overflows to others in the documented proportion, not all or none.",
    dep: ["endpoint-sets", "zone-aware", "active-health-checks"]
  },
  "zone-aware": {
    s: "Keeps requests within the caller's own zone when that zone has enough capacity, to cut latency and cross-zone transfer cost, and routes elsewhere when it does not.",
    d: "The proxy knows its own zone from bootstrap configuration. For each cluster it compares the share of healthy hosts in its zone against the share of traffic it receives. If the local zone has enough capacity relative to its share, requests stay local, otherwise a calculated fraction is sent to other zones so that every host sees balanced load. This is recomputed on every membership or health change. It requires a minimum cluster size and enough local hosts to avoid unbalancing. It is hard because zones send unequal volumes of traffic, so purely local routing overloads the zone with the most callers.",
    k: ["Zone-local routing versus uniform balancing: local routing saves latency and transfer charges, but needs capacity to match each zone's traffic or hosts become uneven.", "Computed residual routing versus fixed percentages: computed fractions adapt as health changes, but are harder to predict and debug."],
    p: ["One zone hosts most of the callers, and routing locally pins most traffic onto the few hosts there.", "The proxy reports no zone, and the feature silently does nothing."],
    v: "Run a cluster with equal hosts in three zones and equal callers in each, confirm nearly all traffic stays in zone, then add callers to one zone and confirm part of its traffic moves to other zones.",
    dep: ["locality-weighted", "endpoint-sets", "bootstrap-config"]
  },
  "panic-threshold": {
    s: "A safeguard that ignores health status and balances across all hosts when too few are healthy, because sending to everything beats concentrating on a few survivors.",
    d: "If the fraction of healthy hosts in a cluster or priority falls below a threshold, commonly half, the balancer treats every host as eligible regardless of health. The reasoning is that when most hosts are marked unhealthy, either checks are wrong or the service is truly failing, and funneling all traffic to the few healthy ones will overload and kill them. Panic mode is reported in statistics. It is hard because it deliberately sends requests to hosts known to be failing, and the threshold is a judgment between protecting survivors and wasting requests.",
    k: ["Panic mode versus honoring health strictly: panic prevents cascading overload of survivors, but sends real requests to hosts marked failing.", "A threshold near zero versus near fifty percent: low values trust health data longer, while high values spread load sooner and give up on health signals."],
    p: ["A faulty health check marks everything unhealthy and nobody notices because panic mode keeps traffic flowing.", "The threshold is zero, so one surviving host receives the entire cluster's load and fails."],
    v: "Mark most hosts unhealthy in a test cluster, confirm the panic statistic increments and requests spread across all hosts. Restore health and confirm panic ends and unhealthy hosts receive nothing.",
    dep: ["endpoint-sets", "active-health-checks", "passive-outlier-detection"]
  },
  "active-health-checks": {
    s: "Probes each upstream host on a schedule with a connection attempt or request, and marks it unhealthy or healthy after configured counts of failures or successes.",
    d: "The proxy sends probes of a chosen kind, TCP connect, HTTP request, RPC health call or custom payload, at an interval with jitter, expecting a response within a timeout. A host becomes unhealthy after consecutive failures and healthy again after consecutive successes, with different thresholds for each direction. Probes use their own connections so that data traffic does not mask failure. Each proxy checks independently, so a large fleet multiplies probe load on every host. It is hard because health is relative to the probe: a trivial check passes while real requests fail.",
    k: ["Shallow probes versus deep ones that exercise dependencies: shallow probes are cheap and stable, but miss real failures, while deep probes can mark every instance down when one shared dependency fails.", "Per-proxy checks versus a central health service: per-proxy checks need no extra system but scale probe load with fleet size."],
    p: ["A health endpoint always returns success while the service cannot reach its database, so traffic continues to a broken host.", "Every proxy in a large fleet probes every host each second, and the probes become a noticeable share of host load."],
    v: "Stop a service instance and measure the time until a proxy marks it unhealthy, matching interval times the failure threshold, then restart it and confirm it rejoins only after the success threshold.",
    dep: ["endpoint-sets", "timers-scheduling", "health-status-aggregation"]
  },
  "health-status-aggregation": {
    s: "Combines signals from active checks, passive detection, discovery and administrative state into one health value per host that the balancer uses.",
    d: "A host can be unhealthy because an active check failed, because outlier detection ejected it, because discovery reported it as draining or because an operator forced it out. Each source sets its own flag, and the host is eligible only if no flag is set. The aggregate decides membership in the balancer's healthy set and feeds panic and priority calculations. Draining hosts stay in service for existing sessions but receive no new work. It is hard because the sources can disagree, and recovery from each follows different rules.",
    k: ["Independent flags per source versus a single state: flags preserve the reason and let each source recover on its own terms, but make debugging a combination.", "Excluding hosts at the first failure signal versus requiring agreement: excluding on any signal protects users quickly, but amplifies false positives."],
    p: ["An outlier ejection and a health check pass flip the same host repeatedly, causing churn in the balancer.", "A host marked draining by discovery still receives new requests because the balancer reads only check health."],
    v: "Fail one host by each mechanism in turn and confirm the admin interface shows the correct flag, the balancer excludes the host, and clearing only that mechanism restores it.",
    dep: ["active-health-checks", "passive-outlier-detection", "endpoint-sets"]
  },
  "passive-outlier-detection": {
    s: "Watches real responses and temporarily removes hosts that return consecutive errors or fail success-rate comparisons with their peers, without extra probe traffic.",
    d: "Each host's recent results are tracked: consecutive server errors, connection failures and timeouts, and over a window its success rate compared with the cluster's average. A host that crosses a threshold is ejected for a period that grows with the number of previous ejections, then returned. A cap limits the share of the cluster that can be ejected at once. It is hard because the signal is real traffic, so a low-traffic host has too little data, and a bad request pattern may fail on every host and eject them all.",
    k: ["Ejection time that grows per repeat versus a fixed time: growth keeps persistent offenders out longer, but slows recovery for a host that failed briefly.", "A cap on ejected hosts versus unlimited ejection: a cap prevents ejecting an entire cluster over a shared problem, but may keep some failing hosts in service."],
    p: ["A single client sends malformed requests that error on every host, and outlier detection ejects healthy hosts.", "Low-traffic hosts never reach the minimum request count, so their failures are never detected."],
    v: "Make one host return errors, confirm it is ejected after the consecutive-error threshold, receives no traffic for the ejection period and returns afterward, with the ejection counted in statistics.",
    dep: ["endpoint-sets", "health-status-aggregation", "stats-counters"]
  },
  "circuit-breaking": {
    s: "Limits connections, pending requests, concurrent requests and retries to a cluster, rejecting excess immediately so one slow dependency cannot exhaust the proxy.",
    d: "Each cluster, and each priority within it, has counters for active connections, requests waiting for a connection, active requests and active retries, each with a maximum. When a request would exceed a limit, it is rejected fast with an overflow response and counted. Limits are enforced per proxy, so fleet-wide capacity is the limit times the number of proxies. The breaker is not stateful in the classical sense: it does not open for a period, it is a live ceiling. It is hard because correct limits depend on latency and request rate, which change.",
    k: ["Concurrency ceilings versus classical open and half-open breakers: ceilings react instantly and need no state machine, but do not stop traffic to a dead service on their own.", "Tight limits versus generous ones: tight limits protect hosts and the proxy, but reject legitimate bursts."],
    p: ["Limits are set from a quiet period and reject normal traffic when latency doubles for a moment.", "The retry limit is left at its default and a failing service receives a large multiple of the original load."],
    v: "Hold requests open at the upstream beyond the concurrency limit and confirm excess requests are rejected immediately with the overflow flag, the counter increments, and normal service resumes as soon as requests complete.",
    dep: ["upstream-clusters", "connection-pool", "retries"]
  },
  "retries": {
    s: "Re-sends a failed request to another host according to a policy of which failures qualify, how many attempts are allowed and how long to wait between them.",
    d: "A route's retry policy lists conditions: connection failure, reset, specific status codes, an explicit retriable signal from the upstream. On a match, the proxy picks a host again, optionally avoiding those already tried, waits a randomized exponential backoff and re-sends, within a per-try timeout and an overall deadline. Bodies must still be available, so retried requests are buffered. Only idempotent operations are safe to repeat blindly. It is hard because retries amplify load during failure and may repeat side effects.",
    k: ["Retrying on more conditions versus fewer: broader retry hides transient failures from callers, but multiplies load and may repeat non-idempotent work.", "Choosing a different host per attempt versus any host: avoiding tried hosts raises the chance of success, but needs the tried list and can run out of hosts."],
    p: ["Three layers each retry three times, and one failing request becomes twenty-seven upstream attempts.", "A timed-out write is retried and executed twice because the first attempt actually completed."],
    v: "Fail the first attempt on one host and confirm the request succeeds on another with the retry counted, then fail all hosts and confirm exactly the configured number of attempts occur, with backoff gaps.",
    dep: ["retry-budgets", "timeouts-deadlines", "buffering-watermarks", "upstream-clusters"]
  },
  "retry-budgets": {
    s: "Caps retries as a fraction of active requests or a minimum count, so retrying cannot multiply load on a struggling service beyond a fixed ratio.",
    d: "Instead of a fixed attempt count alone, the budget permits retries only while they are below a percentage of the cluster's current active requests, with a floor so low-traffic services can still retry. When the budget is exhausted, failures are returned immediately. The limit scales with real traffic. It is the main defense against retry storms and works together with a small per-request attempt limit. It is hard because the right percentage depends on the service's failure patterns, and a budget too tight gives up useful retries.",
    k: ["A proportional budget versus a fixed retry cap: proportional scales with traffic and bounds amplification, but a high-volume service may still send many retries in absolute terms.", "A minimum retry floor versus none: a floor keeps low-traffic services resilient, but allows a retry from every request at very low volume."],
    p: ["The budget is left unset, and a ten-second outage triggers a storm that prolongs recovery by minutes.", "Each caller layer has its own budget, so the combined amplification is the product of all of them."],
    v: "Fail an upstream completely under steady load and confirm total attempts stay near the original rate times one plus the budget fraction, with the retry-overflow counter rising once exhausted.",
    dep: ["retries", "circuit-breaking"]
  },
  "hedging": {
    s: "Sends a second copy of a request to another host when the first is slow, using whichever responds first, to cut tail latency.",
    d: "If a response has not begun within a hedge delay, set near a high latency percentile, the proxy sends the same request to a different host and keeps both in flight. The first complete response wins and the other is cancelled. Because few requests exceed the delay, the added load is small, a few percent. It is used for idempotent reads where a single slow host dominates the tail. It is hard because it duplicates work and side effects, and under overload it makes things worse unless limited by the retry budget.",
    k: ["Hedging after a delay versus sending to two hosts immediately: delayed hedging adds little load, while immediate duplication minimizes latency at double the cost.", "Hedging only reads versus all requests: reads are safe to repeat, but excluding writes leaves their tail latency unaddressed."],
    p: ["A hedge delay below the median latency doubles upstream load during normal operation.", "Cancellation is not propagated, so the slower host completes work whose result is discarded."],
    v: "Add a slow outlier host to a cluster, compare the 99th percentile latency with and without hedging, and confirm total upstream requests rise by only the hedged fraction.",
    dep: ["retries", "retry-budgets", "timeouts-deadlines"]
  },
  "timeouts-deadlines": {
    s: "Time limits at each stage, connect, per-try, per-request, idle and stream duration, and a propagated deadline so downstream work stops when the caller has given up.",
    d: "The proxy bounds connection establishment, time to first response byte, total request time, idle time on a connection and the lifetime of streaming calls. Route-level settings define per-try and overall limits, and retries must fit inside the overall one. Deadlines can be passed along in a header so each hop knows the time remaining and skips work that cannot finish. It is hard because timeouts must be nested correctly, with each inner limit shorter than the outer, or the outer layer gives up while the inner one keeps working.",
    k: ["Short timeouts versus long ones: short timeouts free resources and fail fast, but cut legitimately slow requests, and long ones hold connections during failure.", "Propagating a deadline versus independent per-hop timeouts: propagation stops useless work end to end, but requires every hop to honor the header."],
    p: ["A caller times out at five seconds while the proxy allows thirty, so the upstream does work whose result no one will read.", "A per-try timeout equal to the overall timeout leaves no time for any retry."],
    v: "Make an upstream respond after the route timeout and confirm the client receives a timeout status at that moment, the upstream sees the request cancelled, and the access log shows a timeout flag.",
    dep: ["http-connection-manager", "timers-scheduling", "upstream-clusters"]
  },
  "slow-start": {
    s: "Gradually raises a new or recovered host's share of traffic over a window, so a cold host is not flooded before caches and connections are warm.",
    d: "A host's effective weight starts low when it joins or returns to health and grows over a configured period, following a curve. During that period balancers see a reduced weight for it. This helps services with cold caches, just-in-time compilation or lazy connection setup. It interacts with least-request, where a new host with zero load would otherwise receive a flood. It is hard because the right duration is service-specific, and a window too long wastes capacity during scale-up.",
    k: ["A gradual ramp versus immediate full weight: a ramp avoids cold-start failures, but delays use of new capacity during a spike.", "Applying ramp to recovered hosts as well as new ones: it protects hosts that return from ejection, but slows return to full service."],
    p: ["A scale-out in response to a spike is blunted because new hosts take minutes to reach full weight.", "A host flapping between healthy and unhealthy restarts the ramp each time and never receives meaningful traffic."],
    v: "Add a host to a loaded cluster and chart its request share over time, confirming a smooth rise from near zero to its full proportion across the configured window.",
    dep: ["least-request", "round-robin", "endpoint-sets"]
  },
  "connection-pool": {
    s: "Keeps established upstream connections for reuse, so requests avoid new TCP and TLS handshakes, and queues requests when no connection is available.",
    d: "For each cluster and protocol, the pool holds connections that are idle, busy or connecting. A new request takes an idle connection or, for multiplexed protocols, a connection with free stream capacity, and otherwise causes a new connection, queueing the request until it is ready. Idle connections are closed after a timeout. Pools respect circuit breaker limits on connections and pending requests. It is hard because reuse risks sending a request onto a connection the upstream has just closed, which must be detected and retried safely.",
    k: ["Reusing connections versus new connections per request: reuse removes handshake latency and cost, but risks stale connections closed by the upstream.", "Queueing when at the limit versus rejecting: queueing smooths bursts, but increases latency, while rejection is fast and visible."],
    p: ["The upstream's idle timeout is shorter than the pool's, so requests land on closed connections and fail occasionally.", "Connections to a failed host sit in the pool until used, so the first request after recovery errors."],
    v: "Send a thousand sequential requests and confirm the access logs and counters show a handful of connections opened, not a thousand, and that a closed upstream connection is detected and replaced without a request error.",
    dep: ["upstream-clusters", "circuit-breaking", "per-worker-pools", "connection-lifetime"]
  },
  "per-worker-pools": {
    s: "Each worker thread keeps its own pool per cluster, so selecting a connection takes no lock, at the cost of more connections upstream in total.",
    d: "Because connections belong to the thread that created them, every worker maintains separate pools. A proxy with eight workers talking to one host may hold eight times as many connections as a single shared pool would. Limits are enforced across workers using shared atomic counters. Idle connection counts and warmup are also per worker, so a lightly used cluster keeps many partly used connections. It is hard because per-host connection counts scale with workers times proxies, which can overwhelm small upstreams.",
    k: ["Per-worker pools versus one shared pool: no locking and simple ownership, but more total connections and weaker multiplexing efficiency.", "Per-worker limits versus a global limit: global limits match real upstream capacity, but need atomic counters touched on every connection event."],
    p: ["A fleet of many proxies with many workers opens thousands of connections to one small service.", "A rarely used cluster holds an idle connection on each worker, and none is busy enough to be reused."],
    v: "Send a modest load to one host through a proxy with eight workers and count upstream connections, confirming they grow with worker count, then confirm the configured global connection limit still holds.",
    dep: ["worker-threads", "connection-ownership", "connection-pool"]
  },
  "upstream-multiplexing": {
    s: "Carries many concurrent requests over one upstream connection using a multiplexed protocol, reducing connection count but concentrating risk and head-of-line effects.",
    d: "With HTTP/2 or HTTP/3 upstream, a single connection holds many streams up to the peer's concurrent stream limit. The pool prefers existing connections with spare capacity and opens another when full. Requests from different downstream clients share a connection, so a connection-level failure resets many unrelated requests. It saves handshakes and memory. It is hard because uneven stream distribution can overload one connection, and a stalled connection blocks every stream on it when carried over a reliable ordered transport.",
    k: ["Multiplexing many requests per connection versus one request per connection: multiplexing cuts connection cost, but ties many requests to one connection's fate.", "A low stream cap per connection versus the peer's maximum: a lower cap spreads load across connections, but opens more of them."],
    p: ["One upstream connection stalls from packet loss and every request multiplexed over it is delayed together.", "A connection reaching its stream limit forces new connections in a burst, producing handshake spikes."],
    v: "Send two hundred concurrent requests upstream and confirm they share a few connections, then reset one connection and confirm only requests on that connection fail while the rest succeed.",
    dep: ["connection-pool", "http2-codec"]
  },
  "connection-lifetime": {
    s: "Rules for when upstream connections are closed: idle timeouts, maximum age, maximum requests per connection and responses to the peer's close signals.",
    d: "Idle connections are closed after a timeout shorter than the upstream's, to avoid races. A maximum connection age and a maximum request count force periodic reconnection, which lets connections rebalance onto new hosts and pick up rotated certificates. Graceful close lets in-flight streams finish. Without these limits, a connection to a long-lived host can live for weeks and hold stale state. It is hard because forced closure causes a reconnection cost across all connections at once if they were created together.",
    k: ["Closing connections periodically versus keeping them indefinitely: periodic closing spreads load and refreshes credentials, but costs handshakes.", "A fixed lifetime versus a randomized one: fixed is simple, but connections created together expire together and reconnect in a burst."],
    p: ["All connections opened at startup reach their maximum age at the same moment and cause a synchronized reconnection spike.", "A long-lived connection keeps using a rotated-out certificate until it is closed."],
    v: "Set a short maximum age, run steady traffic and confirm connections are replaced gracefully with no request failures, spread over time rather than at one instant.",
    dep: ["connection-pool", "certificate-rotation", "timers-scheduling"]
  },
  "upstream-socket-options": {
    s: "Socket-level settings applied to upstream connections: keepalive probes, buffer sizes, source address binding, marks and congestion behavior, tuned for the path to the service.",
    d: "TCP keepalive detects dead peers behind silent network failures. Buffer sizes affect throughput on high-latency paths. Binding a source address or interface selects the route and can match firewall rules, and a mark can steer traffic through policy routing. Connect timeouts and, for addresses with both families, a staggered dual-stack attempt avoid long waits on a broken path. Options can be set per cluster and per upstream address. It is hard because correct values depend on the network, and wrong ones fail only under load or after a network event.",
    k: ["Aggressive keepalive versus relying on application timeouts: aggressive keepalive finds dead peers fast, but sends more idle traffic and can drop connections across a brief outage.", "Binding a fixed source address versus letting the system choose: binding gives predictable routing and firewall behavior, but limits the number of distinct connections to one destination."],
    p: ["Keepalive is disabled, and a firewall silently drops idle flows, so the pool keeps handing out dead connections.", "A fixed source address exhausts its ports toward one destination at a high connection rate."],
    v: "Silently drop packets on an idle upstream connection and confirm the proxy detects it within the keepalive time and removes it from the pool, and that a source-bound cluster's connections show the configured address.",
    dep: ["connection-pool", "event-loop"]
  },
});
