// Details for the document database plate, part 4: storage engine, platform foundation, cross-cutting concerns.
ATLAS.details("document-database", {
  "storage-engine-interface": {
    s: "The boundary between the database server and the component that stores bytes, so the engine can be swapped without changing queries or replication.",
    d: "The server asks the engine for record stores (collections), sorted data stores (indexes), transactions through recovery units, snapshots, checkpoints and statistics. The engine owns on-disk format, caching and concurrency below that line. Replication, sharding and query planning live above it. It is hard because the interface must expose enough for features like snapshots at a timestamp and durable commit points, so engines are not freely interchangeable.",
    k: ["Pluggable engine vs one built-in engine: pluggable lets different workloads pick tradeoffs; every feature must be defined in engine-neutral terms.", "Engine-owned transactions vs server-level locking: engine-owned versioning allows document-level concurrency; the server loses control of low-level ordering."],
    p: ["Assuming performance characteristics from one engine hold in another.", "A feature depending on engine behavior that the interface does not guarantee."],
    v: "Run the same workload and a consistency test suite against each supported engine and confirm identical results, with only performance and storage size differing.",
    dep: ["record-store", "mvcc-versioning", "checkpoints"]
  },
  "record-store": {
    s: "Maps a record identifier to the stored bytes of one document, holding a collection's data in the engine.",
    d: "Each document gets an internal record id (an increasing integer or the key itself) and its bytes are stored in a table organized as a B-tree or log-structured layout, keyed by that id. Secondary indexes map values to record ids, then the record store fetches the document. Some designs cluster documents by their primary key so range scans on it read sequentially. It is hard because the layout determines fragmentation, cache locality and update cost.",
    k: ["Cluster by internal id vs by primary key: internal id keeps inserts append-like; primary-key clustering saves an index hop and speeds range reads at the cost of costlier secondary lookups.", "In-place update vs append new version: in-place is compact; versioned append supports readers and snapshots at the price of cleanup."],
    p: ["Random primary keys scatter inserts across the tree and defeat cache locality.", "Frequent growth of documents causes fragmentation and rewrites."],
    v: "Insert a million documents, then measure the bytes of storage per document and the number of page reads for a primary key lookup, which should be a small constant number.",
    dep: ["page-cache", "binary-encoding", "block-compression"]
  },
  "page-cache": {
    s: "A memory region holding recently used data and index pages so most reads avoid the disk.",
    d: "The engine keeps pages of the tree structures in an internal cache sized by configuration, a large fraction of memory, in addition to the operating system's file cache. Reads find pages by identity; misses load from disk and may need decompression. Dirty pages are written back by checkpoints and eviction. Performance depends on whether the working set, mainly indexes plus hot documents, fits. It is hard because exceeding it produces a steep latency cliff.",
    k: ["Large engine cache vs leaving memory to the OS: a large cache avoids system calls and holds decompressed pages; double caching wastes memory.", "Cache sized to the working set vs sized for the whole data: sizing to the working set is economical; a shifting workload then thrashes."],
    p: ["Memory consumed by connections and sorts leaves too little for the cache, causing paging.", "Estimating working set by data size rather than by the touched index and hot data."],
    v: "Under a steady workload, watch cache hit ratio and bytes read into cache per second; both should be stable, and latency should not step up as the data set grows within the working set limit.",
    dep: ["page-eviction", "file-and-io-layer", "memory-management"]
  },
  "page-eviction": {
    s: "Background threads that choose which pages to drop from the cache when it fills, writing dirty ones first.",
    d: "As cache usage passes thresholds, eviction workers walk the trees, rank pages by recent use, and evict clean pages immediately or write dirty ones. When pressure is high, application threads are drafted to help, which shows as latency. Pages pinned by long-running operations or old versions cannot be evicted. It is hard because eviction competes with foreground work and a large burst of dirty data can stall writes.",
    k: ["Aggressive early eviction vs lazy eviction: early eviction keeps headroom and smooth latency; it wastes cache hits.", "Evict dirty pages vs wait for checkpoint: evicting dirty pages frees space under pressure; it adds write load that may amplify I/O."],
    p: ["A long open snapshot pins many versions in cache so eviction cannot free space and the system stalls.", "Eviction threads starved of CPU on a busy host."],
    v: "Fill the cache beyond its limit with a mixed workload and confirm cache stays at its target, application threads are rarely drafted into eviction, and p99 latency remains within bounds.",
    dep: ["page-cache", "mvcc-versioning", "checkpoints"]
  },
  "mvcc-versioning": {
    s: "Keeps multiple timestamped versions of a record so readers see a consistent snapshot while writers create new versions.",
    d: "Each update writes a new version tagged with a commit timestamp, and older versions remain visible to snapshots that started before it. A reader picks a read timestamp and sees the newest version at or before it. Old versions are discarded when no snapshot can need them, as determined by the oldest active timestamp and the stable timestamp. It is hard because versions consume memory and disk, and long readers or a stalled majority commit point prevent cleanup.",
    k: ["Versioned snapshots vs read locks: snapshots let readers and writers proceed without blocking; they spend storage on old versions.", "Keeping history in memory vs spilling to disk: memory is fast; a history store on disk bounds memory with higher cost for old reads."],
    p: ["A transaction or cursor held open for a long time causes version history growth and cache pressure.", "Majority commit lag extends the retention of old versions."],
    v: "Start a long snapshot read, update the same documents repeatedly, and confirm the reader still sees its original values while history size grows; close it and confirm history shrinks.",
    dep: ["clock-and-timestamps", "page-cache", "record-store"]
  },
  "document-level-locking": {
    s: "Concurrency control at the granularity of one document, so writers to different documents never wait for each other.",
    d: "Writers acquire an intent lock at database and collection level and the engine detects conflicts at the document, using version checks. Only operations that change structure, such as dropping a collection or building an index at the wrong phase, need stronger locks. Intent locks are cheap and shared. Admission tickets limit how many operations run inside the engine at once. It is hard because hot single documents still serialize, and lock queues can form behind a long exclusive operation.",
    k: ["Document-level vs collection-level locks: document-level allows high parallelism; it needs versioned conflict detection and more bookkeeping.", "Ticket limit low vs high: a low limit protects the engine from overload; it queues work and raises latency under bursts."],
    p: ["A metadata operation requiring exclusive access blocks all traffic on a collection briefly.", "Tickets exhausted by slow operations so quick ones wait."],
    v: "Run parallel writers on distinct documents and confirm throughput scales with threads; run them on one document and confirm it serializes, with lock wait metrics matching.",
    dep: ["mvcc-versioning", "thread-model"]
  },
  "write-ahead-journal": {
    s: "A sequential log of changes written to disk before they are applied to the main data files, so a crash can be recovered by replay.",
    d: "Each committed transaction appends records describing its changes to the journal, which is flushed to disk at a short interval or on request when a write concern asks for it. Data pages are written later by checkpoints. After a crash the engine starts from the last checkpoint and replays the journal. Sequential appends are fast. It is hard because the flush interval creates a window for loss of unflushed writes, and the journal can be a bottleneck on slow disks.",
    k: ["Flush on every commit vs interval flush: per-commit flush is durable immediately; interval flushing batches I/O for much higher throughput with a small loss window.", "Journal on separate device vs same device: separation reduces contention; it adds an operational and backup detail."],
    p: ["Disabling the journal to speed up writes, then losing everything since the last checkpoint on crash.", "Disk caches that acknowledge flushes without persisting them."],
    v: "Acknowledge a journaled write, kill the server process hard, restart, and confirm the write is present after recovery; repeat without journal acknowledgment and observe it may be lost.",
    dep: ["durable-flush", "file-and-io-layer"]
  },
  "checkpoints": {
    s: "Periodic consistent snapshots of all data files, written in the background, that bound how much journal must be replayed after a crash.",
    d: "Every minute or so the engine takes a stable snapshot at a timestamp, writes all dirty pages in that snapshot to new locations in the files, and atomically switches the root pointer to the new version. The old checkpoint remains valid until the switch. Journal before the checkpoint can be discarded. It is hard because writing large dirty sets takes I/O, and a checkpoint that cannot finish quickly delays journal cleanup and stalls memory.",
    k: ["Frequent checkpoints vs rare: frequent shortens recovery and bounds dirty data; it adds steady write load.", "Checkpoint at the commit point vs at the latest write: committing at the commit point enables rollback to it; it holds back the data written most recently from the checkpoint."],
    p: ["Slow disks make checkpoints overlap and cause visible latency spikes at regular intervals.", "A checkpoint taken while a long snapshot is open keeps a large amount of history."],
    v: "Watch checkpoint duration and the latency of foreground operations over several cycles; confirm duration stays well below the interval and no periodic latency spikes exceed the service target.",
    dep: ["page-cache", "write-ahead-journal", "mvcc-versioning"]
  },
  "block-compression": {
    s: "Compresses data and index blocks on disk with a general algorithm, trading CPU for smaller storage and less I/O.",
    d: "When a page is written, the engine compresses it with a configured algorithm (fast with a modest ratio, or slower with a high ratio), possibly with prefix compression on index keys. When read from disk, it is decompressed into the cache. Document data with repeated field names and values often shrinks by half or more. It is hard to choose: higher ratios use more CPU, and compression makes pages variable-size so space reuse is trickier.",
    k: ["Fast compression vs high ratio: fast keeps CPU low and gives a decent ratio; high ratio saves storage on cold data and costs CPU on each read and write.", "Compress indexes with prefix vs not: prefix compression shrinks index size; it makes in-cache key comparison slightly slower."],
    p: ["Heavily compressible test data hiding the real ratio on production data.", "CPU saturation from compression on a write-heavy host that was sized for I/O."],
    v: "Load a real sample, compare logical and on-disk sizes under each algorithm, and confirm throughput and CPU at the target workload with the chosen setting.",
    dep: ["record-store", "file-and-io-layer"]
  },
  "free-space-reuse": {
    s: "Tracks blocks that no longer hold live data and reuses them for new writes, with compaction available to return space to the file system.",
    d: "When pages are rewritten or collections shrink, old blocks go to a free list inside the files. New writes reuse them, so files do not grow forever, but they also do not shrink by themselves. A compact command or an initial resync rewrites data to release space. It is hard to forecast free space: deletes fragment the files, and operators see disk full while the database reports large reusable internal space.",
    k: ["Reuse internally vs return to the OS: internal reuse is fast and avoids file churn; disk use stays at the high-water mark until compaction or rebuild.", "Compact in place vs resync a member: in-place compact blocks or slows the collection; a resync rebuilds with no impact to the others."],
    p: ["Dropping large data and expecting disk usage to fall immediately.", "Running compaction on the primary during peak load."],
    v: "Delete half the data in a collection, observe file size unchanged and internal reusable space increased, insert new data and confirm file size does not grow, then compact and confirm it shrinks.",
    dep: ["record-store", "checkpoints"]
  },
  "recovery-on-startup": {
    s: "After a crash or restart, the engine returns to a consistent state by opening the last checkpoint, replaying the journal and then fixing replication state.",
    d: "At startup the engine loads the checkpoint with the highest valid timestamp, replays journal records after it, and discards incomplete writes. In a replica set, the server may then truncate the operation log to the stable point, reapply entries up to the commit point, and enter rollback or resync if its history diverges. Prepared transactions are reconstructed. It is hard because recovery time grows with journal length, and a failure to recover usually needs a restore.",
    k: ["Recover from checkpoint plus journal vs full verification: checkpoint recovery is quick; deeper verification is slower and catches corruption earlier.", "Truncate operation log to stable point vs trust the tail: truncation removes entries that may be uncommitted; it can require rollback after startup."],
    p: ["Long checkpoint intervals extend crash recovery to many minutes.", "Restarting automatically in a loop while the data is corrupt."],
    v: "Kill the process hard during a write workload, restart, and confirm it opens within the recovery-time target, passes collection validation, and contains every journal-acknowledged write.",
    dep: ["checkpoints", "write-ahead-journal", "oplog"]
  },
  "thread-model": {
    s: "How the server schedules work onto operating system threads: usually a thread or task per connection plus pools for background jobs.",
    d: "Listeners accept connections and hand them to workers. Models range from one thread per connection to a small pool of threads multiplexing many sockets with asynchronous I/O and a separate executor for blocking work. Background threads handle replication, checkpoints, eviction and index builds. Operations yield periodically so long scans do not starve others. It is hard because a blocking call on the wrong thread stalls many clients.",
    k: ["Thread per connection vs asynchronous multiplexing: thread-per-connection is simple and handles blocking code; it uses memory per connection and strains at many thousands.", "Fixed pool size vs elastic: fixed sizes protect the host; elastic sizes follow load with the risk of over-subscription."],
    p: ["Thousands of idle connections consume memory for thread stacks.", "A blocking disk or lock call in an I/O thread freezes unrelated connections."],
    v: "Open ten thousand idle connections and measure memory and thread count; run a mixed workload and confirm tail latency stays within target and background work does not starve foreground threads.",
    dep: ["network-layer", "memory-management"]
  },
  "memory-management": {
    s: "How the process allocates and bounds memory across the storage cache, connections, sorts, aggregations and plan data.",
    d: "A general-purpose allocator with per-thread caches serves the many small allocations of query processing, while the engine manages its cache budget separately. Operators such as sort and group have memory limits and spill to disk. Connection buffers and cursors add to the total. Memory growth and fragmentation are monitored. It is hard because the budget is shared and the sum of limits can exceed the host, leading to the operating system killing the process.",
    k: ["Strict per-operation limits vs shared pool: strict limits protect against runaway queries; they fail or spill legitimate large operations.", "Large cache fraction vs headroom: a large cache improves hit rate; low headroom risks out-of-memory kills during spikes."],
    p: ["Setting the cache to nearly all memory, then running a large aggregation that triggers the OS to kill the server.", "Allocator fragmentation causes resident memory to grow without matching data growth."],
    v: "Run the heaviest expected query alongside normal load and confirm total resident memory stays below host memory with headroom, and that operator memory limits trigger spilling not failure.",
    dep: []
  },
  "file-and-io-layer": {
    s: "The code that reads and writes data files and the journal through the operating system, including direct I/O and file locking choices.",
    d: "The engine opens files with chosen flags, reads and writes blocks at offsets, uses vectored and asynchronous calls where available, and relies on file system semantics for rename and flush. Directory layout, file descriptors and permissions are managed here. Performance depends on file system type, block size and read-ahead settings. It is hard because it inherits disk behavior: latency spikes, write caches and file system journaling modes all change durability and tail latency.",
    k: ["Buffered I/O vs direct I/O: buffered uses the OS cache and is simple; direct avoids double caching with more engine responsibility.", "One file per collection and index vs few large files: many files give isolation and simple drops; they use more descriptors and fragment the disk."],
    p: ["Running on network-mounted storage with locking semantics that do not match local files.", "File descriptor limits too low for the number of collections and indexes."],
    v: "Run a sustained write workload and verify through system I/O statistics that the write rate and latency match the storage's rated limits, and that descriptor use stays below the limit.",
    dep: []
  },
  "network-layer": {
    s: "Accepts and manages TCP connections, reads and writes framed messages and enforces connection limits and timeouts.",
    d: "A listener accepts sockets, optionally wraps them in TLS, reads length-prefixed messages and passes them to the dispatcher; replies go back the same way. Keepalive and timeouts detect dead peers. A separate path serves internal cluster traffic. Limits cap the number of concurrent connections. It is hard because network failures are partial: half-open connections, slow clients that hold buffers and packet loss produce symptoms that look like database problems.",
    k: ["Long keepalive vs short: short keepalive detects dead peers quickly; it adds traffic and can drop connections through brief network hiccups.", "Connection cap vs unlimited: a cap protects the server; clients above it fail to connect and need pooling discipline."],
    p: ["Idle firewall timeouts closing connections silently, and the next request fails.", "Slow readers holding large reply buffers and consuming memory."],
    v: "Reach the connection limit with a load generator and confirm new connections are refused cleanly while existing ones continue; cut a client's network and confirm the server frees its resources within the timeout.",
    dep: []
  },
  "clock-and-timestamps": {
    s: "A logical timestamp combining wall-clock time with a counter, used to order operations across members and to define snapshots without relying on perfectly synced clocks.",
    d: "Each operation receives a timestamp that is greater than anything the node has seen, built from seconds of wall clock plus an increment. Nodes include their latest timestamp in messages, and recipients advance their own to at least that value, so causality is preserved even when clocks differ. The operation log, snapshots, change streams and causal sessions all use these. It is hard because wall clocks still matter for expiry and for operators, and large clock jumps can cause trouble.",
    k: ["Hybrid logical clock vs physical time only: hybrid clocks preserve causality despite skew; they are not real time, so time-based features still need synced clocks.", "Cluster-wide gossip of time vs per-node time: gossip keeps cluster order consistent; it needs authentication so a bad node cannot push time into the far future."],
    p: ["A clock set far ahead on one node propagates through the cluster and makes timestamps jump.", "Using wall time from different hosts to compare events that were ordered by logical time."],
    v: "Skew one member's wall clock by a few seconds and confirm replication and causal ordering remain correct, while TTL expiry shows the expected offset; compare timestamps across members after a message exchange.",
    dep: ["network-layer"]
  },
  "durable-flush": {
    s: "Forces written data from operating system buffers to stable storage, and is the point at which a write is truly safe from power loss.",
    d: "After writing journal or data pages, the engine calls the file system's flush, which in turn asks the device to persist its cache. Group commit batches many transactions into one flush. Storage with a battery-backed cache makes flush fast; consumer disks that ignore flush make it a lie. It is hard to verify: a hardware cache that acknowledges early looks identical until a power failure.",
    k: ["Flush per commit vs group flush: per commit is simplest and slowest; group flush gives throughput by sharing the wait among transactions.", "Rely on device guarantees vs verify them: trusting the device is the default; power-loss testing finds devices that break the promise."],
    p: ["Volumes configured to ignore flush for benchmarks and left that way in production.", "Virtual disks that acknowledge writes before they are durable."],
    v: "Run a pull-the-plug or forced power-loss test with journaled acknowledgments and confirm every acknowledged write survives restart on the same storage used in production.",
    dep: ["file-and-io-layer"]
  },
  "access-pattern-modeling": {
    s: "Document shapes, embedding, key choice and indexes are all derived from the list of queries and updates the application actually makes.",
    d: "Unlike designing tables first, a document design starts from how data is read and written together, how often, and how large each piece grows. That list drives what to embed, which fields to copy, which indexes to build and what to shard on. It crosses every layer: the model, the indexes, the shard key, the cache and the transactions needed. It is hard because access patterns change, and a model tuned for yesterday's queries makes tomorrow's slow.",
    k: ["Model for the known queries vs model neutrally: tuned models are fast for the main paths; they make unforeseen queries costly and need reshaping.", "Duplicate data for reads vs normalize: duplication shortens read paths; each update must maintain all copies."],
    p: ["Copying a relational schema one-to-one into collections and paying for joins everywhere.", "Designing for read speed and ignoring write amplification from copies."],
    v: "Write down the top queries and updates with frequencies, then confirm each is served by one query or index and that explain plans and per-request document counts match the design intent.",
    dep: ["embedding-vs-referencing", "compound-index", "shard-key"]
  },
  "durability-vs-latency": {
    s: "Every acknowledged write sits somewhere between fast and safe, set by journal flush, write concern and replication distance.",
    d: "The same write can be acknowledged after memory, after one journal flush or after a majority of members across zones. Each step adds latency and removes a failure mode. The choice applies per operation and has to be made consciously for each data class: telemetry may tolerate loss, payments cannot. It touches the driver, write concern, replication and the storage engine journal. It is hard because the defaults favor speed and failures are rare enough to hide the risk.",
    k: ["Strong concern by default vs weak by default: strong default avoids silent loss; it costs latency for data that did not need it.", "Cross-region majority vs local majority: cross-region survives losing a region; it adds the inter-region round trip to every write."],
    p: ["Using defaults for critical data and learning about rollback after the first failover.", "Applying maximum durability to bulk loads, making them hours slower."],
    v: "Kill the primary during writes at each configured concern level and count which acknowledged writes were lost; the result must match the stated guarantee for each class of data.",
    dep: ["write-concern", "write-ahead-journal", "majority-commit-point"]
  },
  "consistency-tuning": {
    s: "Reads and writes choose among stale-but-fast and current-but-slow behaviors, and sessions can add ordering guarantees on top.",
    d: "Read concern, read preference, causal sessions and transactions together define what a client can observe. A reporting query may read nearby secondaries with stale data; a checkout must read its own writes. Settings are applied per operation, session or connection. They span the driver, the replication layer and the engine's snapshots. It is hard because the combination matters: the strength of the weakest setting on the path sets the guarantee.",
    k: ["Eventual reads on secondaries vs primary reads: secondary reads scale and add lag exposure; primary reads are current and concentrate load.", "Per-operation settings vs a global default: per-operation fits each use; mistakes scatter across code and are hard to audit."],
    p: ["Mixing majority writes and local reads and assuming read-your-writes.", "Analytics on secondaries expecting exact current totals."],
    v: "For each critical flow, write a test that performs its operation sequence across a failover and a lagging secondary and asserts the outcome the product requires.",
    dep: ["read-concern", "read-preference", "causal-consistency", "write-concern"]
  },
  "failure-domains-and-topology": {
    s: "Where members and shards are placed, relative to racks, zones and regions, decides which failures the cluster survives and how long recovery takes.",
    d: "A replica set's majority must survive the loss of one failure domain, so members are spread across at least three. Sharded clusters multiply that: each shard needs its own spread, and metadata servers too. Placement shapes write latency, read locality, failover behavior and backup sources. It touches replication, sharding, drivers and operations. It is hard because the cheapest layout (two zones) cannot keep a majority when one zone fails.",
    k: ["Three zones vs two: three zones keep a majority after losing one; two zones are cheaper but need an arbiter or lose availability.", "Region-local primary vs spread members: local primaries have low write latency; they require failover plans across regions."],
    p: ["Members placed on the same physical host or storage array, so one fault removes several votes.", "A two-region design in which losing the larger region loses the majority."],
    v: "Take down each failure domain in a staging cluster in turn and confirm the cluster elects a primary and serves majority writes within the target time, or fails as designed.",
    dep: ["replica-set", "primary-election", "shard-metadata"]
  },
  "schema-discipline": {
    s: "A flexible model still needs agreed field names, types and versions, enforced by validation and by tests in the code that reads and writes.",
    d: "Without a fixed schema, each writer can introduce a new shape. Teams impose discipline through validators, shared data access code, version fields and migration practice, and by watching for variants in production. It crosses the model, validation, indexes (which assume consistent types) and the application. It is hard because nothing forces it, and drift appears gradually as small exceptions.",
    k: ["Strict server validation vs application conventions: server validation protects against every writer; it slows change and needs migration planning.", "Early rigid schema vs late tightening: late tightening keeps early development fast; legacy variants then need cleaning."],
    p: ["Two services writing the same field as different types, breaking indexes and queries.", "No inventory of live shapes, so nobody knows what a collection contains."],
    v: "Run a schema inference scan over each collection and confirm the set of field names and types matches the declared schema, with zero unexpected variants above an agreed threshold.",
    dep: ["schema-validation", "schema-versioning", "type-system"]
  },
  "working-set-and-capacity": {
    s: "Performance is decided by whether indexes and hot documents fit in memory; capacity planning ties data growth to memory, disk, connections and shard count.",
    d: "As data grows past memory, reads that hit disk dominate latency. Planning estimates the hot subset, the index sizes, the write rate against disk throughput and the connection count, and decides when to add memory, replicas or shards. It touches indexing choices, the cache, compression, sharding and the operation log. It is hard because the cliff is sudden: a cluster fine at 70 percent of memory capacity can fail at 100.",
    k: ["Scale up vs scale out: bigger machines are simple and delay sharding; there is a ceiling and a large failure domain.", "Index everything vs index selectively: broad indexing speeds queries; it grows the working set and slows writes."],
    p: ["Growth tracked by data size alone, ignoring index size and the hot fraction.", "Adding shards after the cluster is saturated, when rebalancing itself needs spare capacity."],
    v: "Load test at projected size and confirm cache hit ratio, disk reads per operation and tail latency stay within targets, and extrapolate when each crosses its limit.",
    dep: ["page-cache", "secondary-btree-index", "balancer"]
  }
});
