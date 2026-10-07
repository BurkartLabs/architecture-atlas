// Details for the time-series database plate, part 6: lifecycle, object storage, operations, cross-cutting concerns.
ATLAS.details("time-series-database", {
  "retention-policies": {
    s: "Configured limits on how long data is kept, by age or total size, possibly differing by tenant, metric or resolution tier.",
    d: "A policy states a maximum age, such as fifteen days for raw data and a year for downsampled data, and sometimes a size cap that deletes the oldest data when disk fills. Some systems attach retention to named policies selected at write time; others apply it per tenant or to the whole node. Retention is the largest single lever on storage cost. The difficulty is that it is enforced in units of blocks, so data lives longer than the policy until a whole block has expired.",
    k: ["Time-based retention vs size-based: time gives a predictable promise to users; size protects the disk and makes the promise depend on ingest volume.", "One retention for all data vs per-metric policies: one value is simple to explain; per-metric policies match value to cost and need ongoing curation."],
    p: ["Retention shortened without noticing that a long-range alert or report reads the removed range makes the report silently empty.", "A size cap that deletes oldest data during a cardinality spike removes history the team wanted."],
    v: "Set a one-day retention, write data spanning three days, and confirm after enforcement only blocks overlapping the last day remain and queries beyond that return no samples.",
    dep: ["block-metadata"]
  },
  "retention-enforcement": {
    s: "The background process that deletes whole blocks entirely past retention, and removes expired data in the head, applied on a regular schedule.",
    d: "Periodically the enforcer lists blocks and deletes any whose maximum time is older than the cutoff, or the oldest ones when a size limit is exceeded, removing the directory and updating in-memory state so no query still references it. Deleting a block that a running query reads must wait or use reference counting. In clustered storage, a bucket-side process does the same for uploaded blocks and tiers. The difficulty is safety: a wrong clock or a mistaken cutoff deletes data permanently, so the enforcer logs and exposes what it removed.",
    k: ["Delete whole blocks only vs trim inside blocks: whole-block deletion is a cheap file removal; trimming would rewrite the block and is never worth it for retention.", "Mark for deletion then remove after a delay vs delete immediately: a delay lets in-flight queries finish and allows recovery of a mistake; immediate frees space at once."],
    p: ["A system clock jumping forward makes retention treat every block as expired and delete it.", "A block still being read by a long query is removed under it and the query fails."],
    v: "Advance retention by one block and confirm exactly that block is deleted, a running query over it finishes normally, and the deletion is logged with block id and range.",
    dep: ["retention-policies", "block-reader"]
  },
  "series-deletion": {
    s: "An administrative request to remove selected series, optionally over a time range, for correcting bad data or meeting a legal erasure demand.",
    d: "The caller supplies matchers and a time range through an admin endpoint. The database finds the matching series in the head and in blocks, deletes head data directly, and writes tombstones for blocks. The data becomes invisible to queries at once and is physically removed when blocks are compacted, and after any object storage copies and backups are also rewritten. A cleanup call can force compaction. The difficulty is completeness: the request must reach every replica, tier and cached result, and be auditable.",
    k: ["Soft delete through tombstones vs hard rewrite: tombstones make it fast and reversible until compaction; a hard rewrite removes bytes sooner at a high I/O cost.", "Allow deletion through the API vs only by retention: an API allows corrections and compliance; disabling it removes a dangerous capability from the network."],
    p: ["A broad matcher deletes a whole metric across all history, and a tombstone cannot be undone after compaction.", "Copies in object storage, snapshots and result caches still hold the deleted data."],
    v: "Delete one series, confirm queries return nothing for it immediately, trigger cleanup, and scan block files and object storage to confirm the series' chunks are no longer present.",
    dep: ["tombstones", "head-series-map"]
  },
  "downsampling": {
    s: "Producing lower-resolution copies of old data, for example five-minute and one-hour aggregates, so long-range queries read far fewer points.",
    d: "A downsampler reads raw blocks, groups samples into fixed windows, computes aggregates per window and writes new blocks at the coarser resolution. It usually runs after a block reaches a certain age, such as forty hours for five-minute resolution. The raw data is retained for its own shorter period. Queries over long ranges then choose the coarse blocks automatically. The difficulty is that downsampling is lossy and irreversible, and correct aggregation of counters and histograms requires storing the right set of values for each window.",
    k: ["Downsample into separate blocks vs replace raw: separate blocks keep raw data for its retention and cost storage; replacement saves space and loses detail early.", "Delay downsampling vs do it quickly: delay keeps raw available for late data and debugging; quick downsampling saves storage and risks locking in incomplete data."],
    p: ["Downsampling a window before late data arrives bakes an undercount into long-range graphs.", "Averaging a counter's values instead of keeping counter semantics gives meaningless rates at long range."],
    v: "Downsample a day of one-minute data to five-minute resolution, and compare each window's aggregates with the same aggregation computed directly from raw samples; they must agree exactly.",
    dep: ["rollup-aggregates", "block-compaction"]
  },
  "rollup-aggregates": {
    s: "The set of aggregates stored per window in a downsampled series, typically count, sum, minimum, maximum and the last counter value, so many functions remain computable.",
    d: "Storing only an average per window cannot support correct sums, rates or accurate averages across series. A common design keeps five aggregates: count, sum, min, max and counter, where the counter series is the reset-adjusted last value in the window. Queries pick the aggregate that fits the function: sum over count for averages, the counter series for rates. Histograms downsample by summing bucket counts. The difficulty is that each function needs a defined mapping onto the stored aggregates, and aggregates take several times the space of one series.",
    k: ["Store five aggregates vs one: five support most functions correctly at several times the storage; one is compact and supports a few functions.", "Windows aligned to absolute time vs relative to first sample: alignment lets different series line up and merge; relative windows are simpler and break merging."],
    p: ["Taking an average of window averages across windows with different sample counts gives a skewed result.", "A counter downsampled by its last value without reset adjustment loses increases across a restart in the window."],
    v: "Compute a rate and an average from rollup aggregates over a week and compare with the same results from raw data; they should match within the tolerance expected from window alignment.",
    dep: ["chunk-format"]
  },
  "resolution-selection": {
    s: "Choosing at query time which resolution of data to read, from the query step and range, and falling back to finer data when coarser data is missing.",
    d: "Given a range and step, the engine prefers the coarsest resolution that still gives at least a couple of points per step, because it reads far less. Blocks at each resolution are indexed by range; if the coarse blocks do not yet cover the interval, it reads raw. A user can force a resolution or allow automatic selection. When a request mixes resolutions across a range, the engine stitches them together. The difficulty is correctness at boundaries between tiers and handling functions that behave differently on aggregated data.",
    k: ["Automatic selection vs explicit choice: automatic keeps dashboards fast with no effort; explicit gives users control when they need raw precision.", "Prefer coarse data when available vs always raw when present: coarse data is cheap and slightly smoothed; raw is exact and costs much more over long ranges."],
    p: ["A query over a boundary between raw and downsampled data shows a visible discontinuity in the graph.", "Applying a short rate window to coarse data with sparse points returns no data."],
    v: "Query a year range with a coarse step and confirm via statistics only the coarsest blocks were read; query the last hour and confirm raw blocks were used and results agree across the overlap.",
    dep: ["downsampling", "range-selection"]
  },
  "backfill-import": {
    s: "Loading historical data directly as blocks, bypassing the write path, for migrating from another system or filling gaps.",
    d: "A tool converts source data into the block format for time ranges that do not overlap data already stored, with proper index and chunks, and places it in the data directory or uploads it to object storage. The node picks up the new blocks on its next reload. Because blocks bypass the head, the out-of-order window and the log do not apply. Imported data respects retention. The difficulty is overlap with existing blocks, which must be avoided or reconciled by vertical compaction, and verifying the result matches the source.",
    k: ["Write blocks directly vs through the write path: blocks are fast and avoid memory use; the write path validates and replicates with the usual limits and is slow for years of data.", "Allow overlap and rely on vertical compaction vs require clean ranges: overlap is convenient and costs later compaction work; clean ranges are safe and require planning."],
    p: ["Imported blocks with timestamps in the wrong unit appear decades off and are removed by retention immediately.", "Importing into a clustered setup writes one copy, not the replication factor."],
    v: "Import a block of known samples, reload the node, and query its range; confirm sample counts and values equal the source, and that no overlap warnings appear.",
    dep: ["block-layout", "vertical-compaction"]
  },
  "block-shipper": {
    s: "Uploads each finished block to object storage after it is written, tracking which blocks are shipped so local copies can be deleted only after the upload is safe.",
    d: "After head compaction, the shipper uploads the block's files to the bucket under a tenant and block id prefix, uploading the meta file last so a half-uploaded block is never considered complete. It keeps a record of shipped block ids on local disk. After a grace period and successful upload, local blocks may be removed by retention at the local horizon, while the bucket holds them for long-term. The difficulty is failure handling: uploads are retried, and a node that dies mid-upload leaves partial objects that must be cleaned up.",
    k: ["Upload the meta file last vs first: last makes a block visible only when complete; first lets readers find it early and read partial data.", "Ship immediately vs after compaction: immediate shipping gives the earliest durability; shipping after compaction uploads fewer, larger objects."],
    p: ["Deleting local blocks before the upload is confirmed loses data if the node's disk fails.", "Two replicas each upload their own copy, and without handling, duplicates sit in the bucket."],
    v: "Write a block, confirm the shipper uploads files and the meta file last, kill the node during an upload, and confirm a restart resumes it and that no incomplete block is queryable from the bucket.",
    dep: ["block-layout", "object-store-client"]
  },
  "object-store-client": {
    s: "A uniform interface over a cloud or on-premises object store offering upload, ranged read, list and delete, with retries and timeouts.",
    d: "The client hides the storage service behind a small interface: put an object, get a byte range, list by prefix, delete, and check existence. It adds retries with backoff, per-request timeouts, concurrency limits and metrics. Ranged reads let queries fetch only the index sections and chunk ranges they need. Object stores are durable and cheap but have high latency per request and per-request pricing. The difficulty is eventual consistency in listing for some services, and request cost and rate limits.",
    k: ["Ranged reads of small pieces vs downloading whole files: ranges minimize bytes and data transfer; many small requests add latency and request cost.", "One abstraction over many stores vs optimizing for one: an abstraction allows migration and testing with local files; optimizing for one can use its special features."],
    p: ["Listing after write on a store with eventual consistency misses a just-uploaded block and compaction duplicates it.", "Thousands of tiny ranged reads per query run into the service's request rate limit."],
    v: "Upload an object, read back a byte range from the middle, and confirm bytes match; inject failures and confirm the client retries with backoff and reports error counts.",
    dep: []
  },
  "store-gateway": {
    s: "A service that serves queries over blocks in object storage, loading index headers and fetching chunk ranges on demand, sharded so each gateway handles a subset of blocks.",
    d: "On startup each gateway discovers blocks in the bucket, takes its share by hashing block ids on a ring, downloads a small index header per block, and answers series and chunk requests from the query frontend by reading ranges from the bucket. It filters out blocks outside the query range using block metadata. It caches index postings, series and chunks in memory or a shared cache. The difficulty is latency, since cold reads cost object store round trips, and resource use for gateways holding many blocks.",
    k: ["Shard blocks across gateways vs every gateway serves all: sharding bounds per-node memory and index headers; all-serving is simpler and multiplies resource use.", "Replicate block ownership vs single owner: replicas give availability during restarts and cost memory; single ownership has a gap on each restart."],
    p: ["A newly restarted gateway has empty caches, and the first queries over old ranges are very slow.", "Gateways disagreeing on block assignment produce duplicated or missing series in results."],
    v: "Query a month-old range with an empty cache and again immediately after, and confirm via statistics the second run reads from cache, with identical results and much lower latency.",
    dep: ["object-store-client", "index-header-cache", "block-reader"]
  },
  "index-header-cache": {
    s: "Caches of the pieces needed to find data in a remote block: a compact index header, plus postings, series and chunk bytes fetched from object storage.",
    d: "The index header holds the symbol table and sampled postings offsets, enough to locate postings for a matcher with a few small reads instead of loading the full index. It is built from the block and stored on local disk, then memory-mapped. Separate caches hold fetched postings lists, series entries and chunk ranges, keyed by block and offset, in memory or an external shared cache. The difficulty is sizing: headers for many blocks consume disk and memory, and cache keys must account for the byte range exactly.",
    k: ["Local index headers vs fetching the index on demand: local headers make lookups fast with a few reads; on-demand avoids local state and makes every first query slow.", "A shared external cache vs per-node memory: shared caches survive restarts and are deduplicated across nodes; per-node caches are faster and are lost on restart."],
    p: ["A cache that is smaller than the working set thrashes, and every query pays object store latency.", "A cache key that ignores the byte range returns the wrong bytes for a different request."],
    v: "Run a repeating dashboard query and confirm the cache hit ratio for postings and chunks approaches one after the first run and the object store request count per query falls accordingly.",
    dep: ["symbol-table", "postings-index"]
  },
  "bucket-compactor": {
    s: "A separate service that compacts, downsamples and applies retention to blocks directly in object storage, so ingesting nodes do not have to.",
    d: "Compactors per tenant list the bucket, plan merges of adjacent blocks, download the source blocks, merge them locally, upload the result and mark the sources for deletion. They also vertically compact replica duplicates, build downsampled blocks and apply per-tenant retention. Work is divided among compactors by hash of the tenant or time range, and a lock prevents two from taking the same group. The difficulty is resource use and consistency of the bucket: partial results and deletion marks must keep queries correct at every moment.",
    k: ["Compact in the bucket vs on ingesters: bucket-side compaction decouples storage work from ingest and scales independently; it needs download and upload for each pass.", "Mark for deletion with a delay vs delete now: a delay lets queriers refresh their block lists first; immediate deletion can break a query that has not seen the new block."],
    p: ["A compactor that falls behind leaves many small blocks and gateway query latency climbs.", "Compacting a block that is still being uploaded or is marked partial produces corrupted output."],
    v: "Upload twelve small blocks for a tenant, run the compactor, and confirm one block replaces them, sources are marked then removed after the delay, and results of a fixed query are identical.",
    dep: ["compaction-planner", "vertical-compaction", "object-store-client", "downsampling"]
  },
  "tier-management": {
    s: "Policies deciding where each block lives and for how long: local disk for recent data, object storage for long-term, and cheaper storage classes or deletion for the oldest.",
    d: "Recent blocks stay on local disk for fast queries, usually a few days to a few weeks. After upload they remain in the bucket until the bucket retention expires them, and local copies are dropped at the local horizon. Some deployments move old blocks to cheaper, slower storage classes, or keep downsampled data longer than raw data. Queries route time ranges to the right tier. The difficulty is aligning tier boundaries with query patterns, so common dashboards do not hit the slowest tier, and with cost models for storage and requests.",
    k: ["A longer local horizon vs shorter: longer keeps more queries fast and needs more disks per node; shorter is cheaper and sends more queries to object storage.", "Cheaper storage classes for old data vs one class: cheaper classes cut cost and add retrieval fees and delay; one class is predictable."],
    p: ["Moving blocks to a cold class with retrieval delay makes a long-range alert time out.", "Local horizon shorter than the upload lag leaves a window of data in neither tier."],
    v: "Age a block past the local horizon, confirm its local copy is removed only after it is present in the bucket, and queries for its range still return identical results via the gateway.",
    dep: ["block-shipper", "retention-policies", "store-gateway"]
  },
  "snapshots": {
    s: "A consistent point-in-time copy of the on-disk data, created cheaply by hard-linking immutable blocks and copying the head's log and chunk state.",
    d: "A snapshot request makes the head flush or copies its log and head chunk files, then hard-links every block directory into the snapshot path, which costs almost no space or time because blocks never change. The snapshot is a usable data directory on its own. A node can be started from it for testing or restoration. The difficulty is cost over time, because hard-linked blocks keep deleted data alive after compaction and retention, and consistency of the head portion.",
    k: ["Include the head vs blocks only: including the head captures the latest samples and needs the log copy; blocks only is instant and loses the last hours.", "Hard links vs full copies: hard links are instant and free and must stay on the same volume; full copies are portable and slow."],
    p: ["Old snapshots left in place keep compacted and deleted blocks on disk, and the disk fills.", "A snapshot taken during compaction can capture both parents and result unless coordinated."],
    v: "Take a snapshot under write load, start a separate node on it, and confirm it serves the same series and samples as the source did at snapshot time, with the snapshot taking seconds.",
    dep: ["block-layout", "wal-checkpoint-replay"]
  },
  "backup-restore": {
    s: "Copying blocks, and optionally the head, to separate durable storage on a schedule, and restoring from them after loss, corruption or a mistaken delete.",
    d: "Since blocks are immutable, backup is incremental: copy blocks not yet in the backup location, and remove those that retention deleted. A cluster using object storage already has most data protected and backs up the bucket with versioning or cross-region copies. Head data in a single node comes from a snapshot or from remote write to a second system. Restore copies blocks back and restarts the node. The difficulty is proving backups work, and aligning the backup retention window with any deletion obligations.",
    k: ["Back up blocks incrementally vs full copies: incremental is cheap and fast and needs tracking; full copies are simple and expensive.", "Replicate to a second system through remote write vs file backup: replication gives a live copy and near-zero loss; file backups protect against logical errors like deletion that replication also copies."],
    p: ["A backup that is never restored in a test turns out to be empty or incomplete after an incident.", "A delete request is replayed to the replica or old data returns when a backup older than the deletion is restored."],
    v: "Restore the latest backup onto a fresh node, run a fixed set of queries against both it and the original, and confirm identical results for all ranges older than the backup time.",
    dep: ["snapshots", "block-metadata"]
  },
  "block-verification": {
    s: "A scan that checks every block's index, chunks and metadata for consistency and corruption, and tools to repair or quarantine bad blocks.",
    d: "The verifier opens each block, validates checksums, checks that postings point at real series, that series entries refer to chunks inside their time range and that chunk sequences are in order, and compares metadata counts to what it finds. Problems are reported with block ids. Repair tools can rewrite an index, drop unreadable chunks, or move a block aside. In a cluster, blocks found bad can be replaced from a replica or from the bucket. The difficulty is cost of scanning large datasets and deciding when repair loses acceptable data.",
    k: ["Continuous background scrubbing vs on demand: continuous finds corruption early and uses I/O all the time; on demand is cheap and finds problems after they matter.", "Quarantine and restore from a copy vs repair in place: restoring a good copy is safe and needs one to exist; repair in place may lose samples."],
    p: ["A corrupt block that is found only when a query touches it returns errors for that range at the worst moment.", "Repairs that drop damaged chunks remove samples without anyone being told how many."],
    v: "Corrupt a byte in a test block's index, run verification, and confirm it reports that block and the failing check, quarantines it, and a replacement copy restores the correct query result.",
    dep: ["chunk-checksums", "block-layout"]
  },
  "self-monitoring": {
    s: "The database's own metrics about ingestion, memory, series counts, compaction, queries and errors, exposed in the same format it ingests and usually scraped by itself or a peer.",
    d: "Every component exports counters, gauges and histograms: samples appended, series in the head, log fsync time, compaction durations, failed compactions, queries by duration, limit rejections, cache hit ratios and replication lag. Alerts watch them for dropped samples, head growth, compaction backlog and failing rules. It is best monitored by a separate instance, because a database that monitors itself goes dark exactly when it fails. The difficulty is knowing which of hundreds of metrics predict trouble.",
    k: ["Monitor itself vs by a separate instance: self-monitoring is simple and fails with the system; a separate instance survives it and is another system to run.", "Detailed per-tenant metrics vs aggregate: per-tenant metrics find the noisy tenant and add series that scale with tenants; aggregates are cheap and hide it."],
    p: ["Alerting only on up misses a node that is running but dropping every write.", "Self-monitoring metrics with high-cardinality labels become the largest consumer in the database."],
    v: "Induce a failure such as a full disk or a slow log sync and confirm the matching metrics change and the corresponding alert fires on the separate monitoring instance within its evaluation interval.",
    dep: ["alerting-rules"]
  },
  "admin-api": {
    s: "Privileged endpoints for operating the node: trigger snapshots, delete series, force compaction, reload configuration, inspect ring and block state, and shut down gracefully.",
    d: "These endpoints are disabled by default and gated by separate credentials or network position, as several can destroy data. They expose block lists with metadata, cardinality statistics, ring status, tenant configuration and flush or shutdown operations that write the head to disk. Some report the state of in-flight compactions and rule groups. Actions are logged. The difficulty is safety, since a mistaken delete or a flush of a node serving traffic has large effects, and since they are often the first target of a mistaken exposure.",
    k: ["Disabled by default vs enabled: disabling avoids accidental exposure; enabling is convenient and makes dangerous calls reachable by any client.", "Separate admin listener vs the main port: a separate listener allows tight network policy; one port is simpler and mixes public and privileged paths."],
    p: ["An admin endpoint reachable from the same network as clients lets any user delete data.", "A graceful shutdown that does not flush the head makes the next start replay a long log."],
    v: "Call each admin endpoint from outside the permitted network and with the wrong credentials and confirm refusal; call permitted ones and confirm the action appears in the audit log.",
    dep: ["authn-authz"]
  },
  "format-versioning": {
    s: "Version markers on files and wire protocols, plus the rules for rolling upgrades, so new and old nodes can coexist and data written by one version stays readable.",
    d: "Block meta files, index and chunk files, log records and push-protocol messages carry version numbers. A new version reads older formats and, after an upgrade, writes new ones, and downgrade support is limited and often absent. Rolling upgrades of a cluster mean mixed versions serve writes and queries at once, so protocols must tolerate unknown fields and the ring must not change hash functions. Feature flags enable new encodings only after every node can read them. The difficulty is compatibility windows and rollbacks.",
    k: ["Write new formats immediately vs behind a flag: immediate use simplifies code and breaks downgrade; a flag allows safe rollback and takes extra steps.", "Read-only compatibility with old formats forever vs a migration step: compatibility keeps old data usable at code cost; a migration simplifies code and risks long rewrites."],
    p: ["A node upgraded and then rolled back cannot read blocks written in the new format and refuses to start.", "A new field ignored by an old receiver drops the data it carries without any error."],
    v: "Run a rolling upgrade in a test cluster under load and confirm no write errors or query failures occur, then roll one node back before the format flag is on and confirm it reads all data.",
    dep: ["block-metadata", "chunk-format"]
  },
  "cardinality-as-cost": {
    s: "The number of distinct series, not the sample rate or data volume, drives memory, index size, query time and cost, so every layer needs a budget for it.",
    d: "Each active series costs memory in the head, an index entry, postings entries and per-query metadata. Samples per series are cheap by comparison once compressed. So the dominant risk is label design, such as ids, paths or pod names, and the dominant control is limits at write time, analysis tools, relabeling and recording rules that aggregate labels away. Churn adds cost invisibly across blocks. Decisions about what may be a label must be made by producers, with the database enforcing a ceiling. The difficulty is that nobody sees the cost until it is large.",
    k: ["Limit at the database vs rely on producer discipline: enforced limits protect everyone and reject data; discipline loses nothing and fails when one team makes one mistake.", "Budget series per tenant vs globally: per-tenant budgets assign responsibility; a global budget is simple and allows one tenant to consume it all."],
    p: ["Teams add a label with unbounded values to a core metric and the first symptom is an out-of-memory kill.", "Dashboards built on raw high-cardinality series break the moment limits are introduced."],
    v: "Track active series, series per block and head memory per tenant over a week, and confirm each tenant's growth is explained by known labels, with alerts firing at eighty percent of its limit.",
    dep: ["series-and-labels", "cardinality-limits", "head-series-map", "postings-index"]
  },
  "time-semantics": {
    s: "Which clock defines a timestamp, what resolution it has, how late data is treated and how time zones and skew are handled, decided once for the whole system.",
    d: "Timestamps are usually integers since an epoch in UTC, at millisecond or finer resolution. The choice is between scrape time, which one clock assigns, and source time, which each device assigns. Clock skew produces samples in the future, which some systems reject, and in the past, which hit out-of-order limits. Alignment of intervals and evaluation steps, lookback windows for stale values, and staleness markers all depend on this choice. Day and month boundaries are computed in UTC and shown in local time. The difficulty is that errors are quiet.",
    k: ["Server-assigned timestamps vs source timestamps: server time is consistent and loses true event time; source time is accurate and exposes skew and ordering problems.", "Reject far-future samples vs accept: rejection protects against bad clocks poisoning the head; acceptance never drops data and moves the head window forward."],
    p: ["One device with a clock a day ahead advances the maximum timestamp and causes all later samples to be rejected as too old.", "Mixing second and millisecond units in imports puts data decades away from where it belongs."],
    v: "Write samples with timestamps one hour in the future and one hour in the past and confirm each is handled according to policy, with counters recording rejections and no effect on other series.",
    dep: ["out-of-order-ingest", "delta-of-delta-timestamps", "samples-and-fields"]
  },
  "durability-versus-ingest-speed": {
    s: "How often acknowledged writes are forced to stable storage, how many copies exist before acknowledging, and how much recent data a crash may lose.",
    d: "A metrics store may accept loss of a few seconds of data on a node crash in exchange for much higher ingest rates, and rely on replication and a second copy to cover it. Others sync the log on every commit. The knobs are the log sync interval, the replication factor and quorum, whether to upload blocks before deleting them, and whether a sender keeps a queue. These choices determine what the system promises after power loss or a node replacement. The difficulty is making the actual guarantee match what users believe.",
    k: ["Sync on each commit vs periodic sync: each commit loses nothing acknowledged and limits throughput; periodic sync gives high throughput and loses the last interval.", "Replication for durability vs single copy with backups: replication tolerates a node loss immediately at multiplied cost; a single copy is cheap and recovers from a backup with data loss."],
    p: ["Disks that acknowledge writes from a volatile cache make a sync setting meaningless.", "A sender queue that is dropped on restart makes an apparently durable path lose data."],
    v: "Cut power to a node under load and confirm that the data loss is no more than the documented window, and that the replicas hold the data the node lost.",
    dep: ["write-ahead-log", "replication-factor", "block-shipper"]
  },
  "single-node-versus-cluster": {
    s: "Whether to run one node or a distributed system, a choice that trades operational simplicity against capacity, availability and the cost of every query and write.",
    d: "A single node handles millions of samples per second and tens of millions of series, with all index and data local, and has no coordination, no rebalancing and trivial queries. Clustering adds sharding, replication, a ring, fan-out queries, object storage and tenancy, each with new failure modes. Many deployments stay single-node with a second copy by remote write, and move to a cluster only when series count, retention or availability demand it. Moving later is possible but not seamless. The difficulty is deciding before the pain, not after.",
    k: ["Single node plus remote write vs a cluster: single node is far simpler and has a capacity ceiling and brief outages on restart; a cluster scales and survives failures and costs expertise.", "Shard by tenant across independent instances vs one big cluster: separate instances isolate completely; one cluster uses resources better and is harder to isolate."],
    p: ["Adopting a cluster for load a single node would carry doubles the operating burden for no benefit.", "Staying on a single node past its limits makes every restart a long outage while the log replays."],
    v: "Load test a single node until ingest latency or memory exceeds its budget, record the sample rate and series count at that point, and compare with the forecast demand to decide whether it still suffices.",
    dep: ["distributor", "head-block", "remote-write-read"]
  },
  "tenant-isolation": {
    s: "Making sure one tenant's writes, queries and mistakes cannot take capacity from others, enforced at every shared resource from the front door to compaction.",
    d: "Isolation needs accounting at each shared layer: rate and series limits at ingest, per-tenant query concurrency and limits, per-tenant cache and compaction shares, shuffle sharding to reduce overlap between tenants, and per-tenant rules. Without enforcement at one layer, the weakest one decides. A noisy tenant is found through per-tenant metrics. Data isolation also matters: the tenant id must be part of every key and path. The difficulty is that isolation costs efficiency, and a gap shows up only during an incident.",
    k: ["Shared resources with limits vs dedicated resources per tenant: sharing is efficient and relies on limits being right; dedicated resources isolate fully and waste capacity.", "Shuffle sharding vs spreading over all nodes: shuffle sharding limits the blast radius to a subset; spreading maximizes parallelism and lets one tenant touch every node."],
    p: ["A compactor with no per-tenant fairness spends all its time on one tenant's backlog while others' blocks pile up.", "A query cache keyed without the tenant serves one tenant's data to another."],
    v: "Run one tenant at ten times its limit while another runs a normal workload, and confirm the second tenant's write success rate and query latency stay within their normal range.",
    dep: ["multi-tenancy", "quotas-and-rate-limits", "sharding-by-series", "query-limits"]
  },
  "degradation-under-overload": {
    s: "What the system does when demand exceeds capacity: which work is rejected, delayed or shed first, and whether ingest or queries are protected.",
    d: "Overload arrives as a burst of samples, a cardinality spike, a heavy query or a slow disk. The system needs defined responses: reject writes with retry hints rather than queue without bound, cap query concurrency and memory, shed low-priority work such as exemplars or rules before samples, and pause compaction before dropping ingest. Many designs protect ingest first, because lost samples are permanent while a slow dashboard is not. Senders must cooperate by backing off. The difficulty is that each layer reacts alone, and the combination can oscillate.",
    k: ["Protect ingest over queries vs the reverse: protecting ingest avoids permanent loss and lets dashboards slow down; protecting queries keeps people informed during incidents and drops data.", "Reject early with retry hints vs queue and absorb: early rejection bounds memory and pushes buffering to senders; queuing hides short bursts and fails hard when it fills."],
    p: ["Unbounded queues in front of the log turn a short stall into a memory exhaustion crash.", "Senders retrying in lockstep without jitter prolong recovery by hitting the node together."],
    v: "Overload a test node with a write burst and a heavy query at once, and confirm it returns overload statuses with retry hints, stays within its memory limit, and ingests normally again within seconds after the load drops.",
    dep: ["batching-and-backpressure", "query-limits", "quotas-and-rate-limits", "head-block"]
  },
});
