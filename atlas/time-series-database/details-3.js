// Details for the time-series database plate, part 3: clustering, replication, tenancy and protection.
ATLAS.details("time-series-database", {
  "distributor": {
    s: "The stateless front door of a cluster: validates incoming writes, applies limits, hashes each series to its owners and forwards to them in parallel.",
    d: "A distributor receives a write request, authenticates the tenant, checks per-tenant rate and cardinality limits, applies deduplication of redundant senders, and splits the series by the hash of tenant and label set. It sends each group to the nodes that own those hash ranges and waits for a quorum of acknowledgments. It holds no data and scales horizontally behind a load balancer. The difficulty is its cost on the hot path: every series is hashed and copied, and it must stay consistent with the ring view held by storage nodes.",
    k: ["Stateless distributors vs routing in clients: distributors centralize limits and rolling changes; clients that route directly save a hop but must know ring state.", "Fail the request on any limit breach vs drop only offending series: whole-request failure is simple and visible; per-series drops keep good data flowing but need careful error reporting."],
    p: ["A stale ring view sends samples to a node that no longer owns the series, which then rejects or stores them in the wrong place.", "A single huge request is split into thousands of small downstream calls and amplifies load."],
    v: "Send a batch of series through a distributor and confirm each series arrives at exactly the replication-factor owners named by the ring, and the quorum success is returned only after the required acknowledgments.",
    dep: ["ring-membership", "sharding-by-series", "replication-factor", "quotas-and-rate-limits"]
  },
  "ring-membership": {
    s: "The shared view of which nodes exist, their health and which hash ranges each owns, maintained by gossip or a coordination service.",
    d: "Each node registers with a token set that places it on a hash ring and sends heartbeats. Peers learn changes by gossip or by watching a consistent key-value store. A node moves through joining, active, leaving and unhealthy states, and the ring routes around those that stop heartbeating. Owners of a series are the next nodes clockwise from its hash, chosen across zones when configured. The difficulty is consistency of views: during changes different components briefly disagree, and a flapping node can cause repeated reshuffles.",
    k: ["Gossip vs a consistent store: gossip has no central dependency and tolerates partitions; a consistent store gives one authoritative view but is another system to run.", "Many tokens per node vs few: many tokens spread load evenly and make joins cheap; few tokens are simpler but leave imbalanced shares."],
    p: ["A node that appears healthy to the ring but cannot reach storage receives writes it cannot persist.", "A network partition produces two rings, each believing the other's nodes are gone."],
    v: "Stop a node and confirm every other member marks it unhealthy within the heartbeat timeout, the ring routes new writes elsewhere, and its tokens return to service when it restarts.",
    dep: []
  },
  "sharding-by-series": {
    s: "Assigning each series to owner nodes by hashing its identity, so load spreads evenly and one series' samples always land on the same nodes.",
    d: "The hash of tenant and label set picks a position on the ring, and the replication-factor nodes next on the ring own it. All samples for a series go to the same owners, so each owner holds a complete series and can compress and serve it without cross-node coordination. Queries must contact every node that could own matching series, because label selectors cannot say where series live. The difficulty is skew: a few series can be far hotter than others, and a tenant with many series spreads cost unevenly unless shuffle sharding limits where it lands.",
    k: ["Shard by series hash vs by time: series sharding balances ingest and keeps series whole; it forces queries to fan out to all nodes, where time sharding limits fan-out but concentrates writes.", "Shuffle sharding per tenant vs all nodes: a subset limits blast radius of a noisy tenant; it reduces the parallelism and capacity available to each tenant."],
    p: ["A single metric with a billion samples per hour overloads its owners while the rest of the cluster sits idle.", "Changing the hash input or label ordering reshards everything and splits historical series."],
    v: "Write one million distinct series and confirm each node's active series count is within a small percentage of the mean, and that a query for one series contacts only its replicas on the write side.",
    dep: ["series-identity-hashing", "ring-membership"]
  },
  "time-partitioning": {
    s: "Dividing data into time-bounded units, such as blocks or shard groups, that are placed, replicated, compacted and expired as whole units.",
    d: "Whether or not series are hashed across nodes, storage is partitioned by time: each block covers a fixed window, typically two hours at first and longer after compaction. Some clustered systems assign whole time ranges to node groups, so recent data lives on hot nodes and old ranges on others. Queries prune partitions outside their range. Retention drops a partition at once by deleting its directory. The difficulty is choosing window size: small windows increase file count and index overhead, large windows hold more in memory and delay compaction and deletion.",
    k: ["Short time windows vs long: short windows speed flush and deletion and limit lost work; long windows reduce per-block overhead and improve compression.", "Time partitions across hash shards vs time-only placement: combining both spreads writes and keeps pruning; time-only placement makes recent partitions hot spots."],
    p: ["A partition boundary that cuts a long query window leaves an extra block open for every query, multiplying lookups.", "Clock skew across nodes assigns the same sample to different partitions on different replicas."],
    v: "Query a window that straddles two partitions and confirm exactly those two partitions are opened, and deleting the older one by retention removes its files without touching the newer.",
    dep: ["block-layout"]
  },
  "replication-factor": {
    s: "The number of nodes that hold each series, and the quorum of acknowledgments a write or read needs before it is considered successful.",
    d: "With a factor of three, each series is written to three owners, preferably in different zones. A write succeeds when a majority acknowledge, so one node can fail or restart without rejecting writes. Reads query all replicas and merge, which also repairs gaps caused by a replica that missed data. Replicas ingest independently and may differ slightly in sample timing, chunk boundaries and compaction. The difficulty is cost, since storage and ingest multiply by the factor, and consistency: a replica that missed writes returns holes until repaired.",
    k: ["Write quorum of a majority vs all replicas: majority tolerates failures with high availability; requiring all makes copies identical but halts writes when any node is down.", "Replicate at ingest vs rely on object storage durability: ingest replication protects recent data on local disks; relying on object storage alone loses whatever is not yet uploaded."],
    p: ["Two replicas in the same zone fail together, and quorum is lost despite the nominal factor.", "Replicas that disagree on timestamps are not deduplicated at query time, doubling reported values."],
    v: "Kill one of three replicas during a write load and confirm writes continue without errors; restart it and confirm queries across all replicas return identical data after catch-up.",
    dep: ["ring-membership", "sharding-by-series"]
  },
  "hinted-handoff": {
    s: "When an owner is down, another node temporarily stores the write and forwards it when the owner returns, so a brief outage causes no lost replicas.",
    d: "If a target replica fails to acknowledge, the coordinator or a neighbor writes the sample to a local hint queue with the intended destination. A background process retries delivery when the destination becomes healthy again, in order, and drops hints older than a maximum window. Hints are written to disk so they survive restarts of the holder. It improves replica convergence for short outages without a full repair. The difficulty is storage and replay load: a long outage accumulates large hints, and a flood on recovery can overload the recovering node.",
    k: ["Hints with a time limit vs unlimited: a limit bounds disk use and replay storms; data older than the limit needs a different repair.", "Hint at the coordinator vs a neighbor: coordinator hints are simple; neighbor hints survive coordinator loss but require more protocol."],
    p: ["Replaying hints at full speed on recovery pushes the node out of memory just as it rejoins.", "Hints beyond the retention window are silently discarded, leaving a permanent gap in one replica."],
    v: "Stop a replica for ten minutes under load, restart it, and confirm hints drain at the configured rate, the replica's sample count catches up, and no new gaps appear compared with the other replicas.",
    dep: ["replication-factor", "write-ahead-log"]
  },
  "rebalancing": {
    s: "Moving series ownership when nodes join or leave, with the old and new owners both serving until the new one has the data it needs.",
    d: "When a node joins it takes tokens on the ring and begins receiving new writes for its ranges. Data already on other nodes is not moved immediately; the new node serves recent data, and older data stays where it is until blocks are handed off or read through object storage. Leaving nodes flush their head to blocks and hand off ownership. Because blocks are time ranges rather than series, moving data means shipping files. The difficulty is doing this without gaps in queries, without double-counting during overlap, and without overloading the network.",
    k: ["Lazy handoff on writes vs bulk series transfer: lazy needs no bulk copy and keeps nodes available; the new node is cold until it has enough history, so reads must still reach the old owners.", "Flush on leave vs rely on replicas: flushing preserves local data and is clean; relying on replicas is faster but reduces the safety margin while it happens."],
    p: ["A node removed without a flush loses the unflushed head if the other replicas also missed those writes.", "Scaling out several nodes at once creates a thundering herd of ownership changes."],
    v: "Add a node during steady ingest and confirm write error rate stays flat, queries return identical results before and after, and the new node's active series count rises as ownership shifts.",
    dep: ["ring-membership", "head-truncation"]
  },
  "query-fanout": {
    s: "Sending a query to every node and store that might hold matching data, then merging, deduplicating and combining their partial answers.",
    d: "Because series are sharded by hash, a selector cannot be routed to one node. The query frontend asks all owners in the tenant's shard set, plus the object storage gateway for older ranges, and each returns series for its time slice. Results are merged by label set, replicas are deduplicated, and the final aggregation completes. Requests carry the time bounds so nodes skip irrelevant data. The difficulty is tail latency: the query waits for the slowest participant, so hedged requests, timeouts and partial-result policies matter.",
    k: ["Wait for all vs return partial results: waiting gives complete answers; partial answers keep latency bounded and must be flagged to users.", "Query all replicas vs a quorum subset: all replicas repair gaps and verify consistency at a cost; a subset reads less but may miss data one replica holds."],
    p: ["One slow node pushes the 99th-percentile query latency to its own, even though others return quickly.", "Queries sent to nodes in the process of leaving return truncated series without an error."],
    v: "Query a selector matching series on every node, take one node offline, and confirm the response is complete from the remaining replicas, or is marked partial if quorum is lost.",
    dep: ["ring-membership", "series-iterators", "store-gateway"]
  },
  "remote-write-read": {
    s: "Protocols for streaming samples to another database as they are ingested, and for reading series back from an external store during queries.",
    d: "Remote write reads the write-ahead log, batches samples and forwards them to a remote endpoint with the binary push protocol, with sharded senders, a bounded queue and retries on temporary errors. It copies data to a long-term store or a central cluster. Remote read lets the query engine request series for a time range and matchers from an external endpoint and merge them with local data. The difficulty is lag and loss: if the remote is slow, the queue overflows and data is dropped, so lag must be visible, and remote read returns raw samples rather than pushed-down aggregates.",
    k: ["Stream from the log vs from the head: reading the log lets the sender catch up after restart; reading the head is simpler but loses data during outages.", "Remote read vs federating through remote write: remote read leaves data in place at the cost of query latency; copying keeps queries fast and doubles storage."],
    p: ["A remote endpoint slower than ingest makes the sender queue fill, then samples are dropped while local storage looks healthy.", "A remote read of a large range returns every raw sample and exhausts memory."],
    v: "Write to a local node with remote write configured, and confirm the remote's sample count matches the local count within the lag shown by the sender's queue metrics; pause the remote and watch the lag rise and then recover.",
    dep: ["binary-push-protocol", "write-ahead-log", "batching-and-backpressure"]
  },
  "ha-deduplication": {
    s: "Accepting data from two or more redundant senders for the same targets, and storing only one copy by electing a leader and dropping the other's samples.",
    d: "Two identical agents scrape the same targets so one failing does not cause gaps. Each tags its writes with a cluster name and replica name. The distributor elects one replica per cluster as leader, stored with a timestamp, and accepts only its samples; the other's are dropped. If the leader stops sending for a configured timeout, the other is elected. The difficulty is the handover: samples near the switch can be lost or duplicated, and a leader that is up but sending stale data wins the election while hurting quality.",
    k: ["Leader election at the receiver vs both stored and deduplicated at query time: election saves storage and index cost; query-time dedup is simpler and tolerates split senders but doubles cost.", "Short failover timeout vs long: short timeout minimizes gaps and risks flapping on a slow network; long timeout avoids flapping and leaves a larger gap."],
    p: ["Replica labels left on the stored series double the series count and defeat the dedup.", "Two senders that disagree on external labels are treated as different clusters and both stored."],
    v: "Run two redundant senders, kill the elected leader, and confirm the other takes over after the timeout, with the stored series showing no more than one gap of that length and no duplicate samples.",
    dep: ["distributor", "series-and-labels"]
  },
  "multi-tenancy": {
    s: "Keeping many teams' data in one deployment by tagging every request with a tenant identity that scopes storage, index, queries and limits.",
    d: "A tenant id is carried on each write and read, typically in a header set by an authenticating gateway. The id becomes part of the series hash and of storage paths, so tenants never see each other's data, and each has its own limits, retention and rule groups. Compactors and caches operate per tenant. Cross-tenant queries are an explicit, opt-in feature that merges and labels results. The difficulty is isolation under load: one tenant's heavy query or burst must not degrade others, which requires per-tenant accounting at every shared resource.",
    k: ["Tenant as a hard partition vs a label: a partition gives real isolation, per-tenant limits and deletion; a label is simpler but anyone who can edit the matcher can read other tenants.", "Shared infrastructure vs a cluster per tenant: sharing is far cheaper and denser; separate clusters isolate completely at a high operational cost."],
    p: ["A missing tenant header is treated as a default tenant, and data from many sources mixes silently.", "Per-tenant limits that are not enforced on the compactor let one tenant's backlog starve everyone's compaction."],
    v: "Write the same series name to two tenants and confirm each tenant's query returns only its own samples, and that deleting one tenant's data leaves the other's untouched.",
    dep: ["authn-authz", "series-identity-hashing", "quotas-and-rate-limits"]
  },
  "authn-authz": {
    s: "Verifying who is calling and which tenants and operations they may use, usually at a gateway in front of the database rather than inside it.",
    d: "Writers and readers present credentials such as tokens or client certificates. A gateway authenticates them, maps the identity to one or more tenant ids, and injects the tenant header; the database trusts it only from that gateway. Authorization separates write, read, rule management and administrative actions. Transport encryption protects data in flight. Some systems add read-only roles per tenant. The difficulty is the trust boundary: if the tenant header can be set by a client, authentication is meaningless, so the database must be reachable only through the gateway.",
    k: ["Authenticate at a gateway vs inside the database: a gateway reuses the organization's identity system; in-database checks avoid trusting a header but duplicate that integration.", "Broad per-tenant tokens vs fine-grained roles: broad tokens are easy to issue; fine-grained roles limit damage from a leaked credential but are tedious to manage."],
    p: ["Exposing the database port directly lets any client claim any tenant by setting the header.", "Long-lived write tokens embedded in agent images are leaked and cannot be rotated quickly."],
    v: "Send a read request with a tenant header directly to the database port from outside the gateway and confirm it is refused; send it through the gateway with a token for another tenant and confirm access is denied.",
    dep: ["multi-tenancy"]
  },
  "quotas-and-rate-limits": {
    s: "Per-tenant ceilings on ingest rate, burst size, active series, query concurrency and rule counts, enforced at the point of entry with clear rejection reasons.",
    d: "A token bucket per tenant limits samples per second with a burst allowance. Other limits cap active series per tenant and per metric, label count and length, request size, exemplars and rules. Limits live in a configuration that can be reloaded and overridden per tenant. When a write exceeds a limit, the request or the offending series is rejected with a status that tells the sender whether to retry. The difficulty is making limits fair across a cluster: the tenant's global rate must be divided among distributors, which see only local traffic.",
    k: ["Local per-distributor limits vs a global limit: local limits need no coordination and are cheap; global limits are accurate but need shared counters or a rate estimate.", "Hard rejection vs throttling: rejection protects shared resources immediately; throttling smooths bursts but ties up connections and memory."],
    p: ["A limit that returns a retryable status for a permanent breach makes senders retry forever and multiplies load.", "Dividing a tenant's limit evenly across distributors rejects traffic when load balancing is uneven."],
    v: "Send traffic at twice a tenant's limit and confirm roughly half is accepted, the rest rejected with a status naming the limit, and a second tenant's writes are unaffected.",
    dep: ["multi-tenancy"]
  },
  "cardinality-limits": {
    s: "Hard limits on the number of active series per tenant, per metric and per label, that reject new series once exceeded, to stop memory and index growth.",
    d: "The write path counts active series per tenant and per metric name. When a new label set would exceed a limit, the sample is rejected with an error naming the tenant, metric and limit, while samples for existing series continue. Limits also bound the number of labels per series, label name and value length, and distinct values per label. Counts are approximate in a cluster because each node sees a share. The difficulty is that the damage is done by series creation, so limits must trigger before memory is committed, and legitimate growth must be distinguished from a runaway label.",
    k: ["Reject new series at the limit vs evict old series: rejecting protects existing data and tells the owner what happened; eviction hides the problem but removes data someone relies on.", "Global limit vs per-metric limit: a global limit caps total cost; per-metric limits isolate one runaway metric from the rest of the tenant's data."],
    p: ["A deployment that restarts pods with a new pod name each time creates a fresh set of series per restart and hits the limit within days.", "Approximate counting across nodes lets a tenant exceed the limit by the number of nodes."],
    v: "Write series with a label that has unbounded values until the limit is reached and confirm new series are rejected with a clear error, existing series keep ingesting, and head memory stops growing.",
    dep: ["head-series-map", "series-identity-hashing"]
  },
  "cardinality-analysis": {
    s: "Tools that show which metrics and labels contribute the most series, label value counts and churn, so operators can find and fix the cause of growth.",
    d: "The head and blocks can report the top metric names by series count, the top labels by distinct values, and the label pairs with the most series. A statistics endpoint exposes this for the current head, and per-tenant views aggregate across nodes. Some systems track series created per interval as churn. These reports usually come from the index, so they cost little. They are consulted when limits fire or memory grows. The difficulty is attribution across layers: the biggest label is often added by a relabeling rule or an agent, not by the application owner.",
    k: ["Computed on demand from the index vs tracked continuously: on demand costs nothing normally and can be slow when needed; continuous tracking shows trends but adds hot-path overhead.", "Per-tenant summaries vs global: per-tenant views point to the owner; global views find shared problems such as a common exporter."],
    p: ["Looking only at current head statistics misses a metric that had a one-day spike and is gone but still occupies blocks.", "Top-series reports with no attribution to the source leave teams unsure whose change caused growth."],
    v: "Create a metric with 50,000 series from one label and confirm the analysis endpoint ranks it first with the correct series count and names the offending label.",
    dep: ["postings-index", "label-value-index"]
  },
});
