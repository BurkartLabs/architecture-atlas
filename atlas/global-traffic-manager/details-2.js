// Details for the global traffic manager plate, part 2: steering policies and affinity.
ATLAS.details("global-traffic-manager", {
  "policy-chain": {
    s: "Evaluates a hostname's rules in order, each filtering or reordering the candidate list, until a final answer set remains that fits the client, constraints and current state.",
    d: "The chain starts with every endpoint in the pools a service uses. Early stages remove candidates, such as unhealthy ones, those barred by residency rules and drained sites. Middle stages rank them by geography or measured latency. Later stages split by weight or cap by capacity, and a last stage adds a fallback when the list would be empty. Each stage is a pure function of its input, which makes the chain testable. The difficulty is ordering: the same stages in a different order produce different traffic, and the effect is rarely obvious.",
    k: ["Filter then rank vs rank then filter: filtering first is cheaper and avoids ranking dead sites, while ranking first allows a fallback to the next best by the same criteria.", "Fixed stage vocabulary vs user-defined stages: a fixed set can be validated and simulated, but forces awkward workarounds for unusual needs."],
    p: ["An empty list after filtering returns no answer and every client fails, because no stage defined a last resort.", "A weight stage placed before a capacity stage assigns shares that are later cut, leaving traffic split unevenly."],
    v: "Feed the evaluator a table of client, health and capacity combinations with expected results written by hand and confirm every row matches, including rows where all candidates are filtered out.",
    dep: ["policy-definition", "health-state-store", "region-score-tables"]
  },
  "geo-steering": {
    s: "Maps a client's estimated location to a preferred site using regions, countries or custom territories, so users reach a nearby or required site without measuring anything.",
    d: "The evaluator resolves the client's address, or the resolver's, to a location through the geolocation database and then looks up that region in a table mapping territories to ordered sites. Tables are hand-curated for business reasons such as contracts, language, regulation or cost, and often override pure distance. A default site catches clients with unknown locations. The difficulty is accuracy: geographic proximity is a weak proxy for network proximity, and location data is wrong for mobile networks, corporate egress and resolvers far from their users.",
    k: ["Geography vs measured latency: geography is stable, explainable and works without data collection, but ignores network topology and sends some users on long paths.", "Fine-grained regions vs a few large ones: fine regions suit local needs, but multiply table entries and the chance that a database error lands users in the wrong place."],
    p: ["A large mobile carrier's traffic exits in one distant city, so every one of its users is steered to the wrong continent.", "The unknown-location default points at one small site that is overwhelmed by traffic nobody could place."],
    v: "Query the service from test clients in each defined region, through resolvers in the same region, and confirm each receives its mapped site. Query from an unmapped address and confirm the default.",
    dep: ["geo-database", "client-subnet-handling", "policy-chain"]
  },
  "latency-steering": {
    s: "Chooses the site with the lowest measured round-trip or load time for the client's network, using real measurements rather than assumed distance.",
    d: "For each client network the system keeps a table of scores per site built from active probes and real-user beacons. The evaluator looks up the client's network and returns the site with the best score, often among those that pass health and capacity filters. Scores are smoothed and refreshed on a schedule. A tolerance band treats sites within a few milliseconds as equal and uses weights to split among them. The difficulty is data sparsity: many networks have few measurements, and noisy samples can flip the choice repeatedly.",
    k: ["Lowest latency always vs best within a tolerance band: always-best is optimal on paper, but swings between sites and wastes caches; a band stabilizes at a small latency cost.", "Active probes vs real-user data: probes are available for every network and test paths users never use, while real-user data matches what clients experience and is sparse."],
    p: ["Sparse data for a network yields one noisy sample that sends all its users to a distant site.", "Latency steering concentrates everyone on the closest site until it overloads, because capacity was not part of the score."],
    v: "Inflate measured latency to the preferred site for one test network by injecting delay, and confirm answers for that network move to the next-best site within one refresh interval while other networks stay put.",
    dep: ["region-score-tables", "network-prefix-map", "policy-chain"]
  },
  "priority-failover": {
    s: "Returns the primary site while it is healthy and moves to ordered backups when it is not, giving a predictable active-passive arrangement.",
    d: "Each service lists endpoints in priority order. The evaluator returns the highest-priority endpoint that passes health, and only falls to the next when all earlier ones fail. Variants group sites into tiers, with load shared inside a tier and failover only between tiers. It is the simplest behavior to reason about and the easiest to rehearse. The difficulty is the passive site: it sees no traffic until the day it must take all of it, so its configuration, data freshness and capacity are the least tested part of the system.",
    k: ["Active-passive vs active-active: passive is simpler and keeps data consistent in one site, while active-active uses capacity continuously and proves every site works every day.", "Failback automatic vs manual: automatic failback restores the intended layout quickly, but can move users twice during an unstable period."],
    p: ["The backup site has stale data or lacks capacity and fails under the first real load.", "A health check that sees only the front door marks the primary healthy while its database is down."],
    v: "Fail the primary's health endpoint and confirm answers switch to the second site after the expected delay, then confirm the second site serves the full real request volume within its latency limits.",
    dep: ["policy-chain", "health-thresholds", "failback-control"]
  },
  "weighted-distribution": {
    s: "Splits traffic among eligible sites in set proportions by returning each in answers with a probability proportional to its weight.",
    d: "Each endpoint carries a weight; the evaluator picks randomly or by deterministic hash among those eligible, in proportion. Weights express capacity ratios, release canaries, cost preferences or migration progress. Zero weight keeps a site configured but idle. Because resolvers cache answers, the realized split follows resolver populations, not query counts: one large resolver holding one answer moves a lot of users together. The difficulty is that the observed share only approximates the intended one, and the error grows when few large resolvers dominate.",
    k: ["Random selection per query vs deterministic hash of the client: random converges to the target split over many queries, while hashing gives stable assignment at the cost of uneven balance among large groups.", "Weights as relative numbers vs percentages: relative numbers survive adding and removing sites, but percentages are easier for people to check."],
    p: ["A very large resolver gets one answer for the TTL and sends millions of users to a single site, far above its weight.", "Weight zero is read as unset and defaults to a nonzero value."],
    v: "Configure a seventy and thirty split and measure the share of real requests per site over an hour and a day, comparing to the target and noting which resolvers account for the deviation.",
    dep: ["policy-chain", "resolver-behavior"]
  },
  "gradual-shift": {
    s: "Moves traffic from one site to another in small timed steps, with checks between steps, for migrations, releases and capacity changes.",
    d: "A shift is a schedule: raise a target site's weight by a few percent, wait for caches to turn over, check error rates, latency and load, then continue or pause. The controller drives weights through the automation interface, and stops when a guardrail trips. The step size and wait are set from measured propagation, not from the TTL. The difficulty is that an effect cannot be seen before the previous step has propagated, so a shift that moves faster than caches can show will overshoot before the first sign of trouble.",
    k: ["Fixed steps vs adaptive steps: fixed schedules are predictable and reviewable, while adaptive ones go faster when signals are clean and are harder to predict.", "Shift by weight vs by client segment: weights are simple, but migrating by segment, such as one country at a time, makes failures localized and easier to attribute."],
    p: ["Steps are shorter than propagation time, so the next increase is applied before the last one shows its effect.", "A paused shift leaves a mixed state that nobody owns, and the migration stalls for months."],
    v: "Run a shift from zero to one hundred percent in ten steps and plot realized traffic share per step. Confirm each step stabilizes before the next, and that a forced error rate halts the schedule.",
    dep: ["weighted-distribution", "automation-api", "propagation-measurement"]
  },
  "multi-answer": {
    s: "Returns several healthy addresses in one DNS answer so clients can try another if the first fails, and so some failures need no steering change at all.",
    d: "Instead of one address, the answer carries a set, often the top few from the ordered list, sometimes shuffled. Clients and resolvers pick among them and many clients retry the next address when a connection fails, which gives sub-second recovery at the client without waiting for a TTL. Sets across sites protect against a site failure; sets within a site spread load. The difficulty is behavior: clients differ in whether they retry, in which address they prefer and in how long a failed address stays avoided, so the result is hard to predict.",
    k: ["Several sites in one answer vs one site per answer: several sites give client-side failover, but also send some users to a farther site even when the near one is healthy.", "Fixed order vs rotated order: fixed order gives most clients the best site, while rotation spreads load and costs consistency."],
    p: ["A client library picks the lowest address numerically, so ordering decisions never take effect.", "Answers with many records exceed the UDP size limit and fall back to slower transports."],
    v: "Black-hole the first address returned and measure how long real clients take to connect via the second, for each client library the service supports, comparing against the page-load target.",
    dep: ["priority-failover", "authoritative-frontend", "client-library-steering"]
  },
  "residency-constraints": {
    s: "Rules that restrict where a user's traffic may be served for legal, contractual or sovereignty reasons, overriding performance and sometimes availability.",
    d: "Constraints tie client territories to permitted sites: traffic from a regulated region may only be served from a set of approved locations, and data classes may forbid crossing a border. The evaluator applies these as a hard filter early in the chain, before ranking. Policy and legal owners define the rules; engineers implement and test them. The difficulty is the conflict with failover: when the only permitted site fails, the choice is between an outage and a violation, and that decision belongs to people, defined in advance.",
    k: ["Hard filter vs strong preference: a hard filter guarantees compliance and can cause outages, while a preference degrades gracefully and may break a legal commitment.", "Location of the user vs location of the data: user-based rules are simple, but the real obligation often attaches to where the data is stored."],
    p: ["Failover rules ignore constraints, so a failure quietly moves regulated traffic across a border.", "Location data errors place a user in the wrong territory, and the constraint is applied for the wrong country."],
    v: "From a test client in a constrained territory, fail every permitted site and confirm the behavior defined by the rule, outage or documented exception, and that no answer names a forbidden site.",
    dep: ["geo-database", "policy-chain", "privacy-and-residency"]
  },
  "cost-aware-steering": {
    s: "Takes the price of serving a request from each site into account, such as transit, committed bandwidth or energy, so cheaper capacity is used first without breaking performance goals.",
    d: "Sites have different marginal costs: committed bandwidth is free until it is used up and then expensive, some regions cost more to operate. The policy adds a cost term to the ranking, usually as a bounded preference among sites that already meet a latency or health bar. Billing data feeds back as utilization against commit. The difficulty is that cost signals are slow and monthly, while traffic shifts are fast, and a policy that chases a cheap site can degrade user experience for a small saving.",
    k: ["Cost as a tiebreaker among acceptable sites vs a weighted objective: tiebreaking cannot hurt users, while weighting saves more and can trade away latency.", "Steering on forecast spend vs actual spend: forecasts let you act before the bill, but are only as good as the traffic model."],
    p: ["The cheap site is also the farthest, and median latency rises across a large user group for a few percent of savings.", "Cost data is a month old, so the policy keeps filling a commit that has already been exceeded."],
    v: "Compare a day of traffic with and without the cost term, measuring cost per request and the latency distribution for affected clients. The latency change must stay within the stated bound.",
    dep: ["latency-steering", "utilization-weighting", "load-ingest"]
  },
  "maintenance-drain": {
    s: "Removes a site from new answers in advance of planned work so traffic leaves before the work begins and nobody is cut off mid-request.",
    d: "A drain sets the site's weight to zero or flags it draining, waits for caches to expire and connections to finish, and only then marks it ready for maintenance. A drain report shows remaining request rate and long-lived connections so the operator knows when it is safe. The same mechanism drives release windows and decommissioning. The difficulty is the tail: resolvers that stretch TTLs and clients with persistent connections keep sending traffic long after the answers changed, so a drain that ends by the clock cuts users off.",
    k: ["Drain by time vs by observed traffic: a timer is simple and predictable, but observing the remaining request rate avoids cutting off the tail.", "Drain with connection reset at the end vs wait indefinitely: a deadline guarantees the maintenance window, and resets some long sessions; waiting is gentle and unbounded."],
    p: ["The maintenance starts at the scheduled time while a measurable share of traffic still arrives.", "Drain is applied to the DNS name but not to the anycast prefix, so traffic continues."],
    v: "Start a drain and watch request rate per minute fall. Confirm the tool refuses to report the site ready while the rate or active connection count is above a stated threshold.",
    dep: ["operator-overrides", "connection-draining", "propagation-measurement"]
  },
  "client-identification": {
    s: "Decides what identifies a client for steering purposes, such as the resolver address, a client subnet, a cookie or an account, and therefore what can be kept consistent.",
    d: "DNS sees only the recursive resolver or, if sent, a truncated client subnet. HTTP-level steering sees the source address, cookies and headers. Application-level steering knows the account. Affinity can only be as precise as the identity it keys on: keying on resolver address groups many users together, and keying on a network prefix can split one user across prefixes as they move. The difficulty is that identities change: mobile clients change address, resolvers change, and an identity that is too narrow gives no stability while one too broad moves unrelated users together.",
    k: ["Resolver identity vs client subnet: resolvers are always present and stable but coarse, while subnets are more accurate and may be absent or truncated for privacy.", "Network-layer vs application-layer identity: network identity needs no cooperation from the application, while application identity survives address changes and needs integration."],
    p: ["Affinity keyed on a large shared resolver pins thousands of unrelated users to one site together.", "A client moving from Wi-Fi to mobile looks like a new client and is moved to another site mid-session."],
    v: "Run a client that changes source address mid-session and confirm what the system treats as one identity. Compare the number of distinct identities to distinct real users in a sample.",
    dep: ["client-subnet-handling", "resolver-client-mapping"]
  },
  "hash-affinity": {
    s: "Assigns each client identity to a site using a consistent hash over the healthy set, so the same identity usually gets the same site and few assignments change when the set changes.",
    d: "The evaluator hashes the client identity onto a ring or rendezvous ordering of sites. The same identity maps to the same site while the set is stable, and when a site leaves only the identities that mapped to it move, spread over the rest. No state is stored, so every answering node agrees without sharing anything. The difficulty is balance: hashing is uniform over identities, not over load, so a few heavy identities can skew a site, and weights need virtual points or weighted rendezvous to take effect.",
    k: ["Stateless hashing vs a stored assignment table: hashing needs no coordination and survives node loss, while a table can hold exceptions and gives perfect control at the cost of state.", "Ring with virtual nodes vs rendezvous hashing: rings are quick to look up and need tuning for evenness, while rendezvous is simple and exact and costs work per site."],
    p: ["A site's return after a failure reclaims its share and moves users who had settled elsewhere, breaking sessions twice.", "Different nodes use different hash seeds or site orderings and give the same client different answers."],
    v: "Assign one hundred thousand identities, remove one of five sites and confirm roughly one fifth move, all of them from the removed site. Query through different nodes and confirm identical assignments.",
    dep: ["client-identification", "weighted-distribution"]
  },
  "affinity-state": {
    s: "A stored mapping from client identity to chosen site with an expiry, used when assignments must be exact, survive policy changes and be inspected or overridden.",
    d: "On first contact the system records the choice with a timestamp and refreshes it on later contact. The table is shared across answering nodes through a replicated store or a fast cache, with an expiry matching typical session length. It supports precise rules: keep the assignment while the site is healthy, move it when it is not. It also records why each assignment exists. The difficulty is volume and failure: the table grows with clients, replicating it adds latency to the answer path, and losing it scatters every user at once.",
    k: ["Central replicated table vs local table per node: central gives consistent answers and a dependency, while local tables are fast and diverge as clients reach different nodes.", "Long expiry vs short expiry: long keeps sessions stable and holds users on a site after its performance degrades; short follows conditions and breaks continuity."],
    p: ["The state store is slower than the answer budget and queries time out under load.", "After a store failure the system rebuilds assignments from scratch and sends the whole user base to one site."],
    v: "Resolve for one thousand identities twice and confirm the same sites. Restart a node and confirm assignments persist. Fail the store and confirm the defined fallback, not an error, in answers.",
    dep: ["replicated-state", "client-identification", "affinity-breaking"]
  },
  "affinity-breaking": {
    s: "The rules for when an affinity assignment is deliberately dropped: site unhealthy, capacity exhausted, policy changed or session too old.",
    d: "Affinity is a preference, not a promise. Breaking rules list the cases where continuity gives way: the site fails health checks, it is draining, it exceeds its capacity limit, its latency is far worse than an alternative, or the assignment is older than a maximum age. Each rule has a severity, and many orders are possible: a failed site always breaks affinity, while a mere latency difference might not. The difficulty is that every break costs the user a session, so the rules must separate real harm from small gains.",
    k: ["Break on any health change vs only on sustained failure: immediate breaks protect users from failing sites, while sustained rules avoid moving many users for a brief blip.", "Move only new sessions vs move existing ones: gentle policies leave current users on a degraded site, and aggressive policies end sessions to make things better."],
    p: ["A capacity rule breaks affinity for many users at once at peak and creates a surge of logins at the neighbor.", "No maximum age exists, so assignments persist for months and users never move back to a nearer site."],
    v: "Degrade a site to the break threshold and confirm only the specified classes of assignment move, in the stated order, and that those that remain keep their site until a hard failure.",
    dep: ["affinity-state", "health-thresholds", "hysteresis-damping"]
  },
  "hysteresis-damping": {
    s: "Applies delays, margins and rate limits to decisions so brief noise in health or latency does not cause the system to shift traffic back and forth.",
    d: "Damping takes several forms. A site must fail several consecutive checks before it is removed and pass several before it returns. A new site must beat the current one by a margin before users move. The total amount of traffic allowed to change in a period is capped. These parameters trade reaction time for stability and are set from measured noise levels. The difficulty is that every damping setting adds delay to real failures, so the settings define a minimum failover time that must be accepted knowingly.",
    k: ["Count-based thresholds vs time-based windows: counts are easy to reason about but depend on probe frequency, while time windows are stable when probe rates change.", "Symmetric vs asymmetric damping: removing quickly and restoring slowly protects users from flapping sites, at the cost of leaving good capacity idle longer."],
    p: ["Damping parameters are tuned on quiet data and the system oscillates the first time latency is noisy.", "Rate caps are too low to move traffic out of a failing site before it falls over."],
    v: "Inject a one-minute health blip, then a sustained failure. Confirm the first causes no change, the second removes the site at the expected delay, and the number of moves per hour stays under the cap.",
    dep: ["health-thresholds", "stability-vs-speed"]
  },
  "failback-control": {
    s: "Governs how and when traffic returns to a preferred site after it recovers, balancing prompt restoration against another disruption and a site that is not fully ready.",
    d: "A recovered site is not automatically a ready one: caches are cold, replicas are catching up and the first checks may pass before real load works. Failback runs as a controlled ramp after a quiet period of passing checks, often with weights rising step by step and an automatic stop if errors appear. Some services deliberately never fail back automatically, to leave timing to humans. The difficulty is the trade: returning too soon fails again under load, and returning too late wastes capacity and keeps users on a worse path.",
    k: ["Automatic ramped failback vs manual: automation restores the layout without paging anyone, but a manual step lets a person confirm data is consistent first.", "Hold-down timer vs quality gates: a timer is simple and ignorant of the site's real state, while quality gates wait for evidence and need well-chosen signals."],
    p: ["A site passes a shallow check, takes full load immediately and fails again, repeating the cycle.", "Failback happens at peak time and adds a second disruption during the busiest hour."],
    v: "Recover a drained test site and confirm weight rises in stages only after the hold-down period, that errors during the ramp pause it, and that user-visible error rate stays within limits.",
    dep: ["hysteresis-damping", "slow-start-ramp", "gradual-shift"]
  },
});
