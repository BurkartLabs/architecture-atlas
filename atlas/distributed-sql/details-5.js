// Details for the distributed SQL plate, part 5: cross-cutting concerns.
ATLAS.details("distributed-sql", {
  "consistency-and-isolation-choice": {
    s: "How strong the guarantee is that applications see, from serializable down to per-statement snapshots, and who pays when it is not enough.",
    d: "The database can promise a single serial order for all transactions, a weaker mode with fewer retries, or stale reads at a chosen age. Each choice shows up in the timestamp cache, the refresh logic, follower reads and the retry contract with clients. Stronger guarantees remove whole classes of application bugs but need retries under contention. Weaker ones are faster and familiar but push correctness into the application. The choice must be explicit per transaction or read, never implicit.",
    k: ["Strongest guarantee by default vs weakest: strongest avoids anomalies by construction; it demands retry handling from every client.", "Per-transaction choice vs one cluster setting: per-transaction choice fits mixed workloads; it multiplies the cases to test."],
    p: ["A team mixes modes and assumes the strongest everywhere, losing an invariant in one path.", "Stale reads used for an operation that needed the latest value."],
    v: "Run an anomaly test suite, covering write skew, lost updates and phantoms, under each isolation mode and confirm the set of anomalies observed matches the documented guarantee for that mode exactly.",
    dep: ["serializable-isolation", "read-committed-mode", "follower-reads"]
  },
  "failure-domains": {
    s: "The set of things that can fail together, such as a disk, node, rack, zone or region, which replica placement must keep apart.",
    d: "Every replica set is a bet that its members will not fail at the same time. Locality tags express failure domains, the allocator keeps replicas in different ones, and survival goals state how many levels must be survived. The domains also include non-hardware ones: a shared power feed, a shared network switch, a shared deployment pipeline that pushes bad configuration to all nodes. Gray failures, where a node is slow rather than dead, are harder to handle than clean crashes.",
    k: ["Many small failure domains vs few large: many give fine spread and survive more; each additional domain costs placement flexibility and latency.", "Treating slow as dead vs waiting: removing slow nodes protects latency; it can cause cascading removals under shared load."],
    p: ["Replicas spread across zones that share one upstream network device fail together.", "A software bug deployed to all nodes at once is a failure domain no placement can survive."],
    v: "Fail each level in turn, one disk, node, zone and, for region survival, a region, under load, and confirm availability and data match the declared goal at every level.",
    dep: ["localities", "survival-goals", "replica-allocator"]
  },
  "clock-assumptions": {
    s: "What the design assumes about clocks: a maximum offset between nodes, monotonic local time, and what happens when either is violated.",
    d: "Timestamps order transactions, so correctness depends on clock behavior. The system assumes clocks never differ by more than a bound and that local time does not run backward. It measures offset, widens read uncertainty by the bound, and fences nodes that exceed it. Better clocks permit a smaller bound and fewer restarts. Poor clocks do not break correctness if detected, but they take nodes down. Virtual machine pauses and leap-second handling are classical sources of violation.",
    k: ["Software time sync vs hardware time sources: software is cheap and available everywhere; the bound must be wide, so reads restart more often.", "Fence on violation vs best-effort continue: fencing preserves correctness; clock problems become outages."],
    p: ["A paused virtual machine resumes with a stale clock and serves reads it should not.", "Different time-sync daemons on different nodes disagree after a leap second."],
    v: "Inject clock skews at, near and beyond the configured maximum offset, and confirm no stale read is ever returned, with nodes beyond the bound fenced and the uncertainty restarts increasing as skew grows.",
    dep: ["hybrid-logical-clock", "clock-offset-monitoring", "uncertainty-intervals"]
  },
  "latency-vs-survivability": {
    s: "The trade-off that every additional failure the system survives costs a network round trip somewhere in the write path.",
    d: "A write is durable when a majority of its replicas have logged it. Putting that majority in one region gives millisecond writes and loses availability if the region fails. Spreading it over regions survives the loss but adds the inter-region delay to every commit. Reads have the opposite dials: leaseholder reads are local, stale reads are local everywhere, and global tables make reads local by slowing writes. Each table makes its own trade, because data differs in how it is used and how critical it is.",
    k: ["Region survival vs zone survival: region survival keeps serving through a regional outage; every write pays an inter-region round trip.", "Fresh reads vs local reads: freshness needs a visit to the leaseholder; local reads need staleness or slower writes."],
    p: ["Applying region survival to all tables when only a few need it makes the whole application slow.", "Not measuring inter-region latency before choosing; the numbers decide whether a design is usable."],
    v: "For each table choose a profile, then measure p50 and p99 for reads and writes from every region and compare against the sum of the relevant round trips predicted by the placement.",
    dep: ["survival-goals", "regional-tables", "global-tables", "quorum-commit"]
  },
  "online-everything": {
    s: "The requirement that schema changes, upgrades, rebalancing and backups all happen while the system serves traffic, without scheduled downtime.",
    d: "A cluster that must always be up cannot stop for maintenance, so every operation is a series of steps that are each safe with mixed states: two schema versions, two binary versions, a range being moved. This drives the two-version invariant, finalization gates, learner replicas and the job system. The result is a system whose operations are reliable but whose implementation is full of intermediate states and the code that reasons about them. Testing needs to exercise those mixed states.",
    k: ["Online operations vs maintenance windows: online avoids downtime; each operation needs compatibility between adjacent states.", "Automatic vs operator-driven steps: automatic reduces human error; surprising automatic movement needs rate limits and visibility."],
    p: ["Tests only run in the clean before and after states and miss mixed-state bugs.", "Two online operations, such as an upgrade and a decommission, interact in a way neither was tested for."],
    v: "Run a schema change, a rolling upgrade, a node decommission and a backup concurrently under a steady workload and confirm zero failed requests beyond retried errors and a clean final consistency check.",
    dep: ["rolling-upgrades", "two-version-invariant", "membership-change", "job-system"]
  },
  "hot-spot-avoidance": {
    s: "The design discipline of preventing any single key, range or node from receiving more load than it can serve, since scale-out cannot fix a single hot key.",
    d: "Ranges spread data and load only if keys are spread. Sequential keys, popular rows, counters and queue-like tables concentrate writes on one range and one leaseholder. The system helps with load-based splits, hash-sharded indexes, random identifiers and rebalancing by load, but data modeling must still avoid the pattern. Contention at one row, where transactions queue on a lock, is a hot spot that no sharding resolves. Detecting it early is the role of the hot range and contention views.",
    k: ["Spreading keys by hash vs preserving order: hashing removes write hot spots; range scans and ordered output get more expensive.", "Fixing in the schema vs relying on automatic splitting: schema changes remove the cause; automatic splitting helps only divisible load."],
    p: ["A single counter row updated by every request limits the whole cluster's throughput to one lock.", "An index on a timestamp column quietly makes every insert go to the same range."],
    v: "Run the production write pattern on a load test cluster and confirm that no range's request rate exceeds a small multiple of the median, and throughput scales near linearly as nodes are added.",
    dep: ["hash-sharded-indexes", "load-based-splits", "hot-range-report", "contention-events"]
  },
});
