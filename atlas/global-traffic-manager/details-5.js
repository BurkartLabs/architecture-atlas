// Details for the global traffic manager plate, part 5: anycast routing and load balancer integration.
ATLAS.details("global-traffic-manager", {
  "anycast-prefixes": {
    s: "Address blocks announced from several sites at once, so the network delivers each client's packets to whichever announcing site is nearest in routing terms.",
    d: "A service address is allocated from a block that is announced at every participating site. Routers elsewhere choose the best path to the prefix, normally the shortest, which usually leads to a nearby site. Different services get different prefixes so each can be withdrawn independently. Prefix length matters: the global routing table filters very small prefixes, so blocks must be large enough to propagate. The difficulty is that placement is indirect: routing preferences, not distance or load, decide which site a user reaches.",
    k: ["One prefix for all services vs one per service: one prefix is cheap and withdraws everything together, while per-service prefixes isolate failures and consume scarce address space.", "Anycast for connectionless protocols only vs for long-lived connections: connectionless traffic tolerates a path change, while long connections may be broken when routing shifts."],
    p: ["A prefix is too small to be accepted by many networks and unreachable for their users.", "One prefix serves unrelated services, and withdrawing it for one problem removes all of them."],
    v: "Probe the anycast address from many networks, record which site answers, and confirm each network reaches a plausible nearby site and every site receives some traffic.",
    dep: ["route-announcement", "catchment-monitoring"]
  },
  "route-announcement": {
    s: "The routers' sessions that advertise the anycast prefixes to upstream networks and peers, and the policies that decide where and how each route is announced.",
    d: "Each site's edge routers hold BGP sessions with transit providers and peers and announce the prefixes with attributes such as path prepending and community tags. A local agent controls announcements: it announces only while the site is healthy and withdraws when it is not. Route filters and origin validation guard against hijacks and leaks. The difficulty is that announcements are a global side effect with a convergence time of seconds to minutes, and mistakes, such as announcing to the wrong peer, are visible to the entire internet.",
    k: ["Announce from many sites vs few: many sites lower latency and spread attacks, while few are simpler to engineer and give longer paths.", "Automated announcements driven by health vs manual control: automation reacts at routing speed and can withdraw too much, while manual control is slow and safer."],
    p: ["A route leak announces the prefix to a peer that should not carry it, and traffic is attracted to a site that cannot handle it.", "The agent that withdraws routes is down with the site, so the route stays announced to a dead site."],
    v: "Withdraw a prefix at one site and observe from route monitors in other networks how long until it disappears from their tables and traffic shifts, and confirm no other site loses its announcement.",
    dep: ["anycast-prefixes", "withdrawal-on-failure", "secrets-and-keys"]
  },
  "withdrawal-on-failure": {
    s: "Automatically stops announcing a site's anycast prefix when the site cannot serve, so routing sends traffic elsewhere at network speed instead of cache speed.",
    d: "A local health agent checks the service on the same host or rack and keeps the route announced only while checks pass. On failure it withdraws, and neighboring routers choose the next best path within seconds. A fail-safe is crucial: the agent must withdraw if it dies or loses contact, which often means the route lives only as long as a heartbeat. The difficulty is correlated withdrawal: if every site's checks fail for the same reason, such as a bad deploy, all of them withdraw and the service disappears entirely.",
    k: ["Withdraw only that site vs allow a coordinated minimum announcement: independent withdrawal is fast and risks removing everything, while a floor keeps some sites announced even when unhealthy.", "Local checks vs global view: local checks are fast and survive partitions, while a global view avoids correlated mistakes and adds delay."],
    p: ["A deploy breaks the health check at every site and each withdraws, leaving the prefix unannounced.", "The withdrawing agent hangs and the route stays up for a site that returns errors."],
    v: "Stop the service at one site and measure the time until the route is withdrawn and traffic arrives elsewhere. Then break checks at every site in a test and confirm the floor keeps one announcing.",
    dep: ["route-announcement", "health-thresholds", "quorum-aggregation"]
  },
  "path-engineering": {
    s: "Tuning announcements, with prepending, communities and selective announcement, to shape which sites attract which networks' traffic when the default routing choice is poor.",
    d: "Because anycast catchments follow routing policy, operators adjust them: prepend the path to make a site less attractive, tag routes with provider communities to limit their reach, or announce only to selected peers. Changes aim to move specific networks to better sites or to drain a site gradually. Effects are indirect, vary by network and are verified from measurement. The difficulty is unpredictability: a small change can move a large unrelated population, and routing policies in other networks are not visible.",
    k: ["Prepend to shift traffic vs withdraw to drain: prepending moves some traffic gradually and imprecisely, while withdrawal moves all of it at once.", "Many fine-grained announcements vs few coarse ones: fine-grained control gives precision and more state and risk of mistakes, while coarse is simple and blunt."],
    p: ["Prepending one site pushes a large network to a far site because of a policy you cannot see.", "Communities are applied for one provider and ignored by another, giving mixed behavior."],
    v: "Apply a prepend at one site, measure before and after the share of traffic and its latency by network, and confirm only the intended networks moved. Revert and confirm the original distribution.",
    dep: ["route-announcement", "catchment-monitoring"]
  },
  "catchment-monitoring": {
    s: "Measures which site each client network actually reaches via anycast, and how that changes, so unexpected routing shifts are noticed.",
    d: "Probers around the world send requests to the anycast address and record which site responded, using a site identifier in the response. Combined with server-side logs of client prefix and site, the result is a map of catchments over time. Alerts fire on sudden changes, networks reaching distant sites, and sites with no traffic. The map is also input for capacity planning. The difficulty is coverage: routing varies by network, and the probers see only some, so poor catchments for unmonitored networks stay invisible.",
    k: ["Probe-based catchment maps vs server-side logs: probes cover networks with no traffic and are limited by prober locations, while logs reflect real users and only show sites that already receive them.", "Alert on any change vs on harmful change: any-change alerts catch routing events early and are noisy, while harmful-change alerts need a definition of harm."],
    p: ["A routing change sends one country's users to another continent, and only latency data shows it days later.", "The site identifier is spoofed or missing and attribution is wrong."],
    v: "Compare the probe-based catchment map to the server-log map for the same day and confirm they agree for overlapping networks. Trigger a controlled change and confirm an alert within minutes.",
    dep: ["anycast-prefixes", "dns-query-logging", "probe-vantage-points"]
  },
  "flap-and-ecmp-risk": {
    s: "The hazards of routing changes breaking established connections: path changes mid-session and equal-cost multipath splits sending one client's packets to different sites.",
    d: "Anycast delivers packets, not sessions. If a route changes during a connection, packets can arrive at a different site that has no record of it and answers with a reset. Routers that balance equal-cost paths by hashing may split packets of one flow across sites after a change. Short exchanges are barely affected, while long downloads and streams suffer. Mitigations include sharing connection state between sites, tunneling to the original site and keeping routing stable. The difficulty is that the problem appears only during churn, which is also when failures are being handled.",
    k: ["Stateless protocols over anycast vs stateful with session handoff: stateless is simple and robust to path changes, while session handoff supports long connections and adds shared state and cost.", "Stable routes with slow failover vs fast aggressive withdrawal: stability protects connections and delays failure response, and fast withdrawal helps failures and risks flapping."],
    p: ["A flapping peer link moves a city's users between two sites every few seconds and resets their connections.", "Load balancing across equal paths sends part of a flow to a site that has no state."],
    v: "Hold long connections open while moving routing in a test, and count resets and failures with and without the mitigations enabled, confirming the stated tolerance is met.",
    dep: ["route-announcement", "unicast-fallback"]
  },
  "attack-diversion": {
    s: "Uses the anycast footprint to absorb or redirect floods, by spreading attack traffic over many sites or steering it to scrubbing capacity.",
    d: "Anycast spreads a distributed flood across sites according to where the sources are, so each site sees only a share. Operators can also withdraw a prefix from a site being overwhelmed so traffic lands elsewhere, or announce a more specific prefix toward a scrubbing facility that filters and returns clean traffic. Playbooks specify which sites can absorb how much. The difficulty is that shifting the attack moves it rather than ends it, and moving it to a site with less capacity makes the situation worse.",
    k: ["Absorb at the edge vs divert to scrubbing: absorbing is simple and limited by site capacity, while scrubbing handles larger attacks and adds latency and an extra dependency.", "Withdraw from the hit site vs keep it announced: withdrawing relieves it and pushes the attack elsewhere, and keeping it protects other sites while degrading its own users."],
    p: ["The attacked site withdraws, the flood lands on the next one, and each falls in turn.", "Diversion to scrubbing is untested and its tunnels lack the capacity to carry real traffic."],
    v: "Run a controlled flood test against one site at a stated rate and confirm the playbook's diversion works, time to effect is measured, and legitimate traffic loss stays within the stated bound.",
    dep: ["withdrawal-on-failure", "path-engineering", "capacity-model"]
  },
  "unicast-fallback": {
    s: "A set of unique per-site addresses used alongside anycast, for diagnostics, for steering long connections and for a path that keeps working if anycast routing misbehaves.",
    d: "Each site also has its own address announced only from that site. Clients can be directed to it by DNS when a stable endpoint is needed, such as a long upload, or when anycast catchments are poor for their network. Operators use unicast addresses to test a specific site regardless of routing. A hybrid design uses anycast for the first contact and unicast for the session. The difficulty is that the unicast path inherits the weaknesses anycast avoided: its failover depends on caches again.",
    k: ["Anycast first contact then unicast session vs anycast throughout: hybrid avoids mid-session path changes and brings back dependence on resolver caches, while anycast throughout is simple and fragile for long flows.", "DNS steers unicast addresses vs client-side retry: DNS control is central and slow, while client retry adapts quickly and needs library support."],
    p: ["Clients keep using a unicast address after the site failed, and nothing steers them away until the TTL expires.", "Unicast addresses are not covered by the same health and drain logic as the anycast ones."],
    v: "Fail a site and measure how long clients holding its unicast address take to move versus clients using anycast. Confirm the numbers are within the documented limits for each path.",
    dep: ["anycast-prefixes", "multi-answer", "ttl-selection"]
  },
  "regional-lb-handoff": {
    s: "The boundary where the global manager's choice of a site becomes a regional load balancer's choice of a server, with agreed addresses, health meaning and behavior under load.",
    d: "The manager returns the address of a regional load balancer, which spreads requests over backends and keeps its own health. The two layers must agree on what healthy means, how to signal drain, which one owns affinity and what happens when the region is full. The global layer deals in sites and shares, and the regional layer deals in connections and servers. The difficulty is duplication of decisions: both layers retry, both mark things unhealthy, and conflicting views can drain a site that is fine or keep one that is not.",
    k: ["Global manager trusts regional health vs checks independently: trusting is simple and shares one mistake, while independent checks catch regional failures and may disagree.", "Affinity at the global layer vs at the regional layer: global affinity pins a site, regional affinity pins a server, and doing both keeps users on one backend after it degrades."],
    p: ["Both layers retry failed requests and a small failure multiplies into a request storm.", "The regional layer marks backends down while the global layer keeps sending full traffic to the site."],
    v: "Fail half a site's backends and confirm the regional layer routes around them, the global layer reduces weight to match remaining capacity, and the request error rate stays below the limit throughout.",
    dep: ["vip-registration", "lb-health-import", "health-endpoint-contract"]
  },
  "vip-registration": {
    s: "Keeps the manager's inventory in step with the virtual addresses that regional load balancers actually expose, whether created by hand or by automation.",
    d: "Each load balancer pool has one or more virtual addresses. When infrastructure creates, moves or deletes them, the change must reach the endpoint inventory, or the manager serves addresses that no longer exist. Registration comes from automation hooks or a periodic sync, and carries attributes such as region, capacity and health check. Removal follows the drain sequence first. The difficulty is ordering: addresses must be registered before they are advertised and drained before they are removed, and a wrong order sends users to nothing.",
    k: ["Event-driven registration vs periodic sync: events are timely and can be missed, while periodic sync repairs everything and is slower.", "Registration by the load balancer owner vs central inventory team: owners know changes first and make mistakes, while a central team is careful and becomes a delay."],
    p: ["A load balancer address is released and reassigned to a different service, and answers send users to the wrong application.", "A new VIP is published to DNS before the balancer behind it is configured and serves errors."],
    v: "Create and delete a test VIP through the normal pipeline and confirm the manager adds it only after readiness and removes it from answers before the address is released.",
    dep: ["endpoint-inventory", "service-discovery-link", "maintenance-drain"]
  },
  "redirect-steering": {
    s: "Steers users with an HTTP redirect from a front site to a better site, for cases where DNS answers are too coarse or too slow to change.",
    d: "A first request lands on an entry point, which decides using the client's actual address and current state and answers with a redirect to a specific site's hostname. The decision is per request and takes effect immediately, with none of the cache delay of DNS. It costs an extra round trip and requires the entry point to stay available. It suits web applications where first-load latency is small relative to the session. The difficulty is that the redirect target is cached by browsers and bookmarks, and breaks if that site later becomes unavailable.",
    k: ["Redirect vs DNS: redirects are precise and immediate and add a round trip and an entry point, while DNS adds nothing per request and responds slowly.", "Temporary vs permanent redirect: temporary redirects let the decision change and repeat the round trip, while permanent ones are cached and pin users."],
    p: ["The redirect entry point becomes a single point of failure for the whole service.", "A permanent redirect is cached and users keep going to a site that was retired."],
    v: "Fail the redirect target site and confirm the next request from a fresh client is redirected to a healthy site on the first try, with the round trip cost measured and within the stated limit.",
    dep: ["policy-chain", "regional-lb-handoff"]
  },
  "proxy-fallback": {
    s: "Lets a healthy site proxy requests to another when a user lands on one that cannot serve them, hiding a steering mistake or a partial failure behind extra latency.",
    d: "If a request reaches a site whose backend is unavailable or which does not hold the user's data, the site forwards it to the right site over the private backbone and returns the response. This covers stale DNS caches, anycast misrouting and data locality. The forwarding site must avoid loops, set limits on hops and mark traffic so counters and billing stay meaningful. The difficulty is that it hides problems and moves load: a proxying site carries two sites' work, and a regional failure can saturate backbone links.",
    k: ["Proxy on failure vs return an error: proxying keeps users working at higher latency and moves load invisibly, while errors show the problem and fail the request.", "Proxy over the public internet vs private backbone: the backbone is fast and costs capacity, while the public path is cheap and slower and less predictable."],
    p: ["Two sites each proxy to the other when both are unhealthy, and requests loop until timeouts.", "Proxied traffic is not counted as load on the receiving site and capacity planning is wrong."],
    v: "Send requests to a site that cannot serve them and confirm they are completed through the other site within the stated added latency, with a hop limit and a header showing the path taken.",
    dep: ["regional-lb-handoff", "capacity-model", "overflow-ordering"]
  },
  "connection-draining": {
    s: "Lets established connections finish naturally while a site or backend stops accepting new ones, so a drain does not cut off work in progress.",
    d: "When a site is drained, the manager stops giving out its address and the regional balancer stops assigning new connections to the draining servers. Existing connections continue until they end or a deadline passes, after which they are closed with a clear signal such as a protocol-level goaway. Long-lived streams, websockets and uploads need explicit handling. The difficulty is duration: some connections last for hours, and a maintenance window cannot wait for the longest of them.",
    k: ["Wait for all connections vs a hard deadline: waiting is gentle and unbounded, while a deadline fits a schedule and cuts a few sessions.", "Protocol-level goaway vs abrupt close: goaway lets clients reconnect elsewhere cleanly, and requires clients that honor it."],
    p: ["Clients with persistent connections never re-resolve, and the drain ends only at the deadline.", "The balancer starts closing connections at the moment the drain begins instead of at the deadline."],
    v: "Open long connections to a draining site and confirm new connections go elsewhere, existing ones complete, and at the deadline the rest receive a clean close signal and reconnect without errors.",
    dep: ["regional-lb-handoff", "maintenance-drain"]
  },
  "slow-start-ramp": {
    s: "Raises a new or recovered site's share gradually, so caches warm and connection pools fill before it takes full load.",
    d: "A cold site has empty caches, unestablished connections and untriggered autoscaling. The ramp assigns it a small weight that grows over minutes while latency and error signals stay good. The load balancer applies its own slow start to individual servers, and the manager applies one to the site. A ramp stops or reverses on regression. The difficulty is that two ramps stack: if the global and regional slow starts are tuned independently, a site can wait far longer than needed, or take a step too large for its servers.",
    k: ["Time-based ramp vs signal-based ramp: time-based ramps are predictable and ignore the site's actual state, while signal-based ramps adapt and depend on trustworthy signals.", "Ramp at both layers vs one: both layers protect servers and sites and slow recovery, while one layer is simpler and leaves one without protection."],
    p: ["A site returns at full weight after maintenance and its cold caches push latency up for all its users.", "The ramp's first step is below the level where servers are loaded enough to warm up, and it never progresses."],
    v: "Add a cold site and plot its weight, hit ratio and latency during the ramp. Confirm each step proceeds only when its signals are healthy and the final state matches steady-state behavior.",
    dep: ["gradual-shift", "regional-lb-handoff", "health-thresholds"]
  },
  "service-discovery-link": {
    s: "Connects the manager to the service registry or platform that knows what is deployed where, so endpoints and their state are discovered, not typed.",
    d: "The platform knows when a service version starts in a region, how many instances are up and which addresses front them. The link subscribes to those events or polls, maps them to endpoint records and pushes them into inventory with the right lifecycle state. It also sends the other direction: the manager's drain and weight decisions are visible to deployment tooling. The difficulty is trust and timing: a registry hiccup that reports zero instances must not remove a live service, so changes are validated before they take effect.",
    k: ["Registry as the source of truth vs manager inventory as the source: a registry avoids duplicate entry and makes registry mistakes into outages, while an independent inventory is slower and safer.", "Event subscription vs polling: events are fast and can be missed, polling is slow and recovers everything."],
    p: ["The registry returns an empty list during a restart and every endpoint is removed from answers.", "Service names differ between registry and manager, and new deployments are never matched."],
    v: "Deploy a new version in one region and confirm it appears in inventory in the expected state. Simulate an empty registry response and confirm the manager keeps the previous endpoints and raises an alert.",
    dep: ["endpoint-inventory", "config-validation"]
  },
  "client-library-steering": {
    s: "Puts site selection and failover logic inside the client application or its library, so it can use fresh local measurements and retry at once instead of waiting for DNS.",
    d: "A client library fetches a list of sites, measures them or receives hints, and chooses and retries by itself. It can use connection results, observed latency and server-sent hints such as drain or migrate. Because it acts per request, failover takes milliseconds. It works where the vendor controls the client, such as mobile apps and agents. The difficulty is deployment: client versions live for years, so any bug or outdated site list persists, and a mistaken library can overload one site across the entire fleet.",
    k: ["Client-side choice vs server-directed: client choice adapts fastest and spreads bugs through every installed copy, while server direction is slower and keeps logic in one place.", "Static site list shipped in the app vs fetched at runtime: shipped lists work on first launch and go stale, while fetched lists stay current and require a first successful fetch."],
    p: ["A bug in an old client version makes it hammer one site after every failure, and it cannot be fixed without an update.", "Every client retries immediately on failure and the synchronized retries overload the next site."],
    v: "Fail the preferred site and measure, from instrumented clients of each supported version, the time until requests succeed at another site, and confirm retries are jittered and bounded.",
    dep: ["multi-answer", "service-discovery-link"]
  },
});
