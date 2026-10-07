// Details for the global traffic manager plate, part 6: foundation and cross-cutting concerns.
ATLAS.details("global-traffic-manager", {
  "replicated-state": {
    s: "A store, copied across sites, that holds endpoint state, health verdicts, overrides and affinity data, so every answering node reads the same truth without crossing the network per query.",
    d: "Writers are few and readers many. State is replicated to each answering node or region, which reads locally. Writes go through a leader or a consensus group for configuration that must be consistent, and through eventually consistent gossip or streaming for fast-changing state. Every record has a version and a timestamp. During a partition the minority side keeps reading its last state. The difficulty is choosing which data needs agreement and which can disagree briefly, and being explicit about what happens at each node when the store is unreachable.",
    k: ["Consensus-based store vs eventually consistent replication: consensus gives one answer and stops writes during a partition, while eventual replication stays writable and can show different states.", "Replicate everything everywhere vs partition by region: full replication gives local reads for any query and costs bandwidth, while partitioned data is cheaper and needs remote lookups."],
    p: ["Writes need a quorum and a regional partition leaves the control plane unable to drain a failing site.", "Replication lag grows silently and nodes serve old state with no sign of it."],
    v: "Write a change at one site and measure propagation to every node. Partition a node and confirm it keeps answering from its last state and reports the age of that state.",
    dep: ["time-sync", "multi-site-control"]
  },
  "config-pubsub": {
    s: "A publish-subscribe channel that carries configuration and state changes from the control plane to subscribers, with ordering, replay and acknowledgement.",
    d: "Publishers write versioned messages to topics, such as policy, health, scores and overrides. Subscribers keep a cursor and resume from it after a restart, and receive snapshots when too far behind. Topics have separate priority so health updates are not delayed by large policy messages. Acknowledgements let the controller know which nodes have applied which version. The difficulty is ordering and gaps: a message lost or applied out of order leaves a node with a state that never existed, so every update carries a version and nodes reject gaps and request a resync.",
    k: ["Ordered log with replay vs fire-and-forget messages: a log allows recovery and verification and needs retention and consumer state, while fire-and-forget is simple and loses updates.", "One channel vs priority-separated topics: separate topics keep urgent health changes fast and add configuration to manage, while one channel is simple and subject to head-of-line delay."],
    p: ["A large policy snapshot blocks health updates behind it and a drain waits minutes.", "A node applies version 12 without 11 and ends in a state that was never published."],
    v: "Publish a sequence of versions while dropping messages to one subscriber and confirm it detects the gap, resyncs, and ends in the same state as the others, with acknowledgements reported to the controller.",
    dep: ["replicated-state"]
  },
  "control-data-split": {
    s: "Keeps the part that answers queries separate from the part that decides and distributes policy, so answering continues when the control plane is broken, slow or being changed.",
    d: "The data plane, the answering nodes, holds a compiled snapshot of everything needed and never calls the control plane while serving. The control plane gathers health, builds snapshots and distributes them. If the control plane fails, the data plane keeps serving the last snapshot. Changes flow one way and the data plane reports back state and telemetry. The difficulty is the cost of this independence: the data plane cannot react to changes while disconnected, which is why fail-static behavior and staleness limits must be designed in.",
    k: ["Compiled snapshot pushed to nodes vs live queries to a central service: snapshots survive control plane outages and can be stale, while live queries are fresh and make the control plane critical for every answer.", "Strict one-way flow vs bidirectional calls: one-way flow keeps failure domains separate, while bidirectional calls allow richer decisions and tie the planes together."],
    p: ["A data plane component quietly makes a call to the control plane on the hot path, and an outage there becomes an outage here.", "The data plane has no limit on snapshot age and serves months-old state without warning."],
    v: "Stop the entire control plane in a test and confirm the answering nodes keep serving at full rate with unchanged latency, and report the growing age of their snapshots.",
    dep: ["fail-static-cache", "config-pubsub"]
  },
  "time-sync": {
    s: "Keeps clocks on all components within a known error, because probe times, state versions, signature validity and data freshness are all compared against time.",
    d: "Nodes synchronize to several time sources over the network, or to local reference clocks where precision is needed, and monitor their own offset. Timestamps on health results, load samples and configuration let readers judge age. Signed data and signatures have validity windows that depend on agreed time. The difficulty is silent failure: a node with a wrong clock may reject valid data as expired, accept old data as fresh, or compute negative ages, and these show up as odd behavior with no obvious cause.",
    k: ["Wall-clock timestamps vs logical versions: timestamps are meaningful to people and wrong when clocks are, while version counters are reliable for ordering and say nothing about age.", "Reject data from nodes with large offsets vs accept: rejection avoids bad ordering and can remove a healthy node from service, while acceptance keeps capacity and spreads bad data."],
    p: ["A node's clock drifts ahead and it treats every fresh health result as already expired.", "Signature validity windows are shorter than the worst clock error and valid answers fail validation."],
    v: "Measure offset on every node against a reference and confirm all are within the bound. Skew one clock in a test and confirm an alert, and that its data is not trusted.",
    dep: []
  },
  "telemetry-pipeline": {
    s: "Carries metrics, logs and traces from every node to storage and alerting, separately from the data plane so a telemetry failure never slows an answer.",
    d: "Agents on each node buffer and ship counters, query logs, probe results and traces to collectors, which aggregate and store them. Pipelines are rate limited and drop under pressure, choosing which data to lose first. Metrics for alerting take a fast path, and bulk logs for analysis take a slower one. Consumers include dashboards, alerts, the measurement pipeline and capacity feeds. The difficulty is dependency: the manager reacts to telemetry, so delays and gaps in it become delays and gaps in steering, and the pipeline must not share fate with the sites it describes.",
    k: ["Lossy but non-blocking vs reliable but possibly blocking: lossy shipping never harms the answer path and drops data in the worst moments, while reliable delivery keeps data and risks backpressure.", "One pipeline for all data vs separate fast and slow paths: separation keeps alerts timely during log floods and doubles the operational surface."],
    p: ["The telemetry pipeline runs in the same region as a failing site and goes dark when it is most needed.", "Backpressure from a slow collector blocks the nodes' answer threads."],
    v: "Overload the collectors in a test and confirm answer latency stays unchanged, the alert path still delivers, and the dropped-data counters show what was lost.",
    dep: ["failure-domain-independence"]
  },
  "secrets-and-keys": {
    s: "Stores and rotates the credentials the manager uses: signing keys, probe tokens, API credentials and routing session secrets, with controlled access and an audit trail.",
    d: "Keys for DNS signing, tokens for health endpoints, credentials for cloud APIs and secrets for routing sessions are held in a protected store and delivered to the components that need them at start or on rotation. Access is by identity and logged. Rotation is scheduled and tested, with overlap so old and new both work during the change. The difficulty is that these secrets sit on the critical path of availability: an expired or rotated-away credential fails everything that depends on it at once, which is why rotation needs the same care as a deployment.",
    k: ["Central secret store with runtime fetch vs secrets baked into deployment: runtime fetch allows rotation without redeploy and depends on the store, while baked secrets are simple and hard to change.", "Short-lived credentials vs long-lived: short-lived ones limit exposure and need working renewal, while long-lived ones are simple and dangerous when leaked."],
    p: ["A credential expires on a weekend and probes, signing and routing sessions fail at once.", "Rotation replaces a key on the servers but not on a verifier and everything signed is rejected."],
    v: "Rotate every credential in a staging environment and confirm no component fails, old and new work during the overlap, and the audit log shows who accessed each secret.",
    dep: ["multi-site-control"]
  },
  "multi-site-control": {
    s: "Runs the control plane in several independent sites, so the ability to change steering survives the loss of any one of them, including the site the operators are in.",
    d: "Control components, such as the inventory, aggregators and rollout controller, run in at least three failure domains with a leader or quorum. Operators reach them through addresses that do not depend on the sites being managed. When a site fails, another takes over leadership and continues. Backup access paths, such as a minimal command-line tool with local credentials, exist in case the main interface is unavailable. The difficulty is a hidden circular dependency: if the control plane is hosted in a region it steers, or relies on a name it serves, an outage there disables the tool needed to fix it.",
    k: ["Active-active across sites vs active-passive with failover: active-active has no failover gap and needs conflict handling, while active-passive is simpler and has a takeover delay.", "Control plane inside the managed regions vs separate: inside is cheap and shares failures, while separate costs more and survives them."],
    p: ["The control plane's own name resolves through the manager and cannot be reached during the outage.", "Leadership election needs a majority and a two-site split leaves no leader."],
    v: "Disable the primary control site completely and confirm another takes over within the target time, operators can still make a drain change, and no answering node loses its snapshot.",
    dep: ["replicated-state", "failure-domain-independence"]
  },
  "fail-static-cache": {
    s: "A local copy of the last known good configuration and state on each node, kept on disk, so a node can start and answer even when nothing upstream is reachable.",
    d: "After each verified snapshot a node writes it to local storage. On restart, it loads the newest valid snapshot and serves immediately, then catches up when upstream returns. Snapshots are checksummed so a corrupt file is never loaded, and several generations are retained. Policy defines when the node should stop trusting its copy, for example when measurement data is too old. The difficulty is that serving old state is a choice with a cost: it keeps users answered and may send them to a site that has since failed.",
    k: ["Serve stale state vs return errors: serving stale keeps names resolving and risks wrong answers, while errors are honest and take the service down.", "Keep several snapshot generations vs only the latest: several allow rollback from a bad snapshot at a small storage cost, and one is simple and unrecoverable if it is the bad one."],
    p: ["A node restarts during a control plane outage with no valid snapshot and cannot answer at all.", "A corrupt snapshot is loaded because verification was skipped for speed."],
    v: "Restart nodes during a total control plane outage and confirm they load the last good snapshot and serve at full rate. Corrupt the newest snapshot and confirm the previous generation is used.",
    dep: ["control-data-split"]
  },
  "ttl-and-propagation": {
    s: "Every change in steering, from a failover to a weight shift, takes effect only as fast as caches expire, so the lifetime of cached answers sets the real speed of the whole system.",
    d: "A decision is made in seconds and reaches clients over a window shaped by TTLs, resolver behavior and long-lived connections. Policy, drills, alert targets and capacity reserves must all be written against the measured propagation curve, not the configured TTL. Short TTLs give agility and put the manager in the critical path of every lookup, while long TTLs give resilience and slow every change. Anycast and client-side retry bypass part of this, with their own limits. The difficulty is that the tail of propagation is outside anyone's control.",
    k: ["Design for the measured 99th percentile vs for the TTL: the percentile is honest and implies longer promised failover times, while the TTL is a number nobody controls.", "Reduce propagation delay vs tolerate it: bypass mechanisms such as multiple answers and client retry shorten failover and add their own complexity, while tolerating it keeps the design simple."],
    p: ["Recovery plans quote the TTL as the failover time, and the real tail is many times longer.", "TTL is raised to cut costs and every failure in the following months lasts longer."],
    v: "At each drill, publish the measured time to ninety, ninety-nine and ninety-nine point nine percent of traffic moved, and check that every stated recovery target is derived from those numbers.",
    dep: ["ttl-selection", "propagation-measurement", "resolver-behavior"]
  },
  "fail-static": {
    s: "When inputs or the control plane fail, the system keeps doing the last reasonable thing rather than stopping or acting on bad data, with known limits on how long that is acceptable.",
    d: "Each component declares what it does when its inputs are missing: keep serving the last snapshot, hold the last health state, freeze weights, or revert to a safe default. Limits define when to stop trusting, such as scores older than a day. Safety floors prevent mass action on unreliable data, such as never removing more than a share of capacity from a single feed. This is designed upfront and rehearsed, because behavior under failure cannot be improvised. The difficulty is that fail-static and responsiveness conflict: freezing is safe against bad data and unsafe against real failures.",
    k: ["Freeze on missing data vs fail open to a default: freezing keeps known-good behavior and may point at a dead site, while a default is predictable and ignores current conditions.", "Global safety floors vs trust every signal: floors stop a bad feed from causing outages and can block a correct large action."],
    p: ["A frozen state outlives the failure it was protecting against and nobody remembers it is in effect.", "Different components choose different fallbacks and the combination is incoherent."],
    v: "Cut each input in turn, health, scores, load, configuration, and confirm the documented behavior for each, an alert, and a return to normal operation when the input is restored.",
    dep: ["fail-static-cache", "control-data-split", "health-state-store"]
  },
  "failure-domain-independence": {
    s: "The traffic manager must not share a failure with the sites, networks or tools it steers, or it will fail exactly when it is needed.",
    d: "Nameservers, probers, control components, telemetry, credentials and operator access paths are placed in different networks, regions and providers from the services they manage and, where possible, from each other. Dependencies are mapped and checked for cycles, such as a control tool that resolves its own address through the manager. Drills include losing the manager's own site. The difficulty is hidden coupling: shared certificates, shared deployment pipelines, shared DNS providers and shared people create dependencies that only a failure reveals.",
    k: ["Maximum independence vs operational simplicity: separate providers and networks survive larger failures and multiply the systems to run, while one platform is simple and fails all at once.", "Operate the manager with its own tooling vs company-standard tooling: its own tooling avoids circular dependencies and duplicates effort and attention."],
    p: ["Probers, control plane and nameservers are all on one cloud provider, and its outage removes all of them.", "A deployment pipeline needed to fix the manager itself depends on a service the manager steers."],
    v: "Draw the dependency graph of every component and verify no cycle includes a steered service. Then simulate loss of each region and provider and confirm the manager remains operable.",
    dep: ["nameserver-fleet", "multi-site-control", "probe-vantage-points"]
  },
  "stability-vs-speed": {
    s: "Reacting quickly to failure and staying stable under noise pull in opposite directions, and every threshold, damping rule and TTL is a position on that trade-off.",
    d: "Fast reaction shortens outages and moves users on false alarms, and each move can break sessions, cool caches and shift load onto neighbors. Slow reaction avoids flapping and extends real outages. The choices appear in probe intervals, failure counts, measurement smoothing, rate caps on traffic movement and failback ramps. They should be chosen from measured noise and agreed outage cost, and revisited after incidents. The difficulty is that the right settings differ by service, by hour and by failure type, and one global value suits none.",
    k: ["Per-service tuning vs global defaults: per-service tuning fits each workload and creates many settings to maintain, while global defaults are consistent and wrong for some services.", "Fast on loss and slow on recovery vs symmetric: asymmetric settings favor user safety and leave good capacity idle longer."],
    p: ["Settings are tuned during a quiet month and the system oscillates in the first noisy week.", "Everything is made fast after an outage, and the next incident is a flapping storm."],
    v: "Replay a month of recorded signals through the current settings and report the number of unnecessary moves and the detection delay for each real incident, then compare with the stated targets.",
    dep: ["hysteresis-damping", "health-thresholds", "failback-control"]
  },
  "stale-and-wrong-data": {
    s: "Every decision rests on data about location, health, load and latency that is delayed, sparse or simply wrong, so the system must carry confidence and age and act accordingly.",
    d: "Locations are guesses, latency scores come from few samples, health is a snapshot and load is seconds old. Each input should carry a timestamp and a confidence, and policies should degrade gracefully as these fall: prefer geography when measurements are thin, hold weights when load data is missing. Inputs are cross-checked against each other and against outcomes such as the traffic share observed at each site. The difficulty is that wrong data looks like right data, and the system acts with full confidence on it.",
    k: ["Act on the best available data vs refuse to act without fresh data: acting keeps the system working with possible mistakes, while refusing keeps it honest and may leave a real failure unhandled.", "Cross-check against outcomes vs trust each input: outcome checks catch bad feeds and add machinery, while trusting inputs is simple and exposed to any one error."],
    p: ["A bad geolocation update is trusted fully and moves a large population to the wrong region.", "A stale score table keeps steering after a path failed, because age was never checked."],
    v: "Corrupt each input in a test, location, scores, health and load, and confirm an alert fires from an independent outcome check, and that the policy falls back as specified.",
    dep: ["map-refresh", "measurement-filtering", "fail-static-cache"]
  },
  "privacy-and-residency": {
    s: "Steering uses client addresses and locations and must keep that data minimal, short-lived and inside the places the law and contracts allow, while also honoring where traffic may be served.",
    d: "Query logs, traces, beacons and affinity tables hold client network information. Truncating addresses, limiting retention, restricting access and keeping data in the right jurisdiction are design requirements, as is deciding what the manager sends to others, such as accepting client subnet data. Residency also constrains answers: some users may only be served from some sites. Decisions are documented with the legal owner and audited. The difficulty is conflict with operations: debugging and abuse analysis want detailed data, and failover wants to cross borders.",
    k: ["Collect detailed data and restrict access vs collect less: detailed data helps debugging and creates an exposure, while less data limits both risk and capability.", "Keep telemetry in each jurisdiction vs centralize: local keeps data in place and fragments analysis, while central gives one view and moves data across borders."],
    p: ["Full client addresses sit in logs retained for years, and nobody has a legal basis for them.", "A failover rule moves regulated users to a foreign site because compliance was never part of the policy."],
    v: "Audit every store for fields, retention and location against the written policy, and run a request for deletion or a retention check and confirm data is removed from all stores within the stated period.",
    dep: ["residency-constraints", "dns-query-logging", "client-subnet-handling"]
  },
});
