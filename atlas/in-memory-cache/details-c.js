// Details for the in-memory cache plate, part 3: keyspace, memory, eviction, persistence.
ATLAS.details("in-memory-cache", {
  "logical-databases": {
    s: "Numbered separate keyspaces inside one server, selected per connection, which let unrelated data share a process but not isolate load, memory or access.",
    d: "A server holds a fixed number of databases, each with its own key table, expiry index and blocked-key registry. A connection starts in database zero and can switch. Commands to flush or count keys apply to the selected database, and some commands copy or move keys between them. They are only a namespace: all share the same thread, memory limit, eviction and persistence, and a cluster supports only one. Many deployments ignore them and use key prefixes or separate instances for real isolation.",
    k: ["Multiple databases vs key prefixes: databases give quick bulk flush of one namespace, but share every resource and do not exist in a cluster.", "Separate instances vs logical databases: separate instances isolate memory and load, but cost a process each and more operations work."],
    p: ["A flush of all databases intended for one wipes every tenant's data, since the command is easy to confuse with a single-database flush.", "Relying on databases for isolation leaves a noisy tenant able to evict or slow everyone else's keys."],
    v: "Write the same key name in two databases with different values, read from each, and confirm independent values; flush one and confirm the other is untouched while memory and statistics are shared.",
    dep: ["keyspace-table", "expiry-index"]
  },
  "keyspace-table": {
    s: "The central hash table from key name to value object, with constant-time lookup, insert and delete, and the other indexes hanging off it.",
    d: "Each entry holds a binary key string and a pointer to a value object, in a table that uses chaining or open addressing with a power-of-two bucket count. Every command that names a key goes through it. Lookup also triggers lazy expiry for a stale key and updates the access clock used by eviction. Memory per key includes the entry, the key string and the object header, so a billion small keys cost tens of gigabytes of overhead. Resizing a very large table is expensive, which is why growth is incremental.",
    k: ["Hash table vs ordered tree: a hash gives constant lookups and lower memory, but offers no ordered or prefix scan; a tree gives order at higher cost.", "Chaining vs open addressing: chaining is simple and tolerates high load, but costs a pointer per entry and cache misses; open addressing is denser but needs low load."],
    p: ["Storing hundreds of millions of tiny keys makes per-key overhead exceed the data, so memory use surprises capacity plans.", "Calling an operation that lists every key blocks the server for the full keyspace walk."],
    v: "Insert ten million keys, measure memory per key, and confirm lookup latency stays flat while the table grows through several resizes with no visible pause.",
    dep: ["incremental-rehashing", "hash-seeding", "object-header", "allocator"]
  },
  "incremental-rehashing": {
    s: "Growing or shrinking the hash table by keeping two tables and moving a few buckets at a time during normal operations, so no single command pays for a full resize.",
    d: "When load factor crosses a threshold, a second table of twice the size is allocated. Then every operation on the table, plus a periodic background step, moves a small number of buckets from the old table to the new one. During migration lookups check both, inserts go to the new one, and iterators handle both. When the old table is empty it is freed. Resizing is postponed while a snapshot child exists, to avoid copy-on-write of the table's pages, unless load becomes extreme. Memory briefly holds both tables.",
    k: ["Incremental resize vs all-at-once: incremental never stalls a request for long, but keeps two tables and more complex lookups; all-at-once is simpler but pauses seconds on huge tables.", "Delay resize during snapshot vs resize immediately: delaying limits copy-on-write memory growth, but lets chains lengthen and lookups slow meanwhile."],
    p: ["During a long snapshot the delayed resize leaves a heavily loaded table, so latency creeps up until the child exits.", "Memory use spikes by the size of the old table plus new table during growth, which can cross the memory limit unexpectedly."],
    v: "Insert keys until a resize triggers and confirm via debug output that two tables exist and the old one drains over subsequent operations, while the slowest command latency stays small.",
    dep: ["keyspace-table", "server-cron", "copy-on-write"]
  },
  "hash-seeding": {
    s: "A fast keyed hash function with a random per-process seed, chosen so attackers cannot craft keys that all collide and degrade the table to linear search.",
    d: "Key names are hashed with a fast non-cryptographic function seeded at startup from a random source. Without a secret seed, an attacker who can choose keys, such as user-supplied names, could submit many that land in one bucket, turning constant-time operations into linear ones and consuming CPU. The seed is private to the process and not saved in snapshots, so the layout differs after each restart. Hash quality and speed matter because it runs for every command, and a case-insensitive variant is used for command names.",
    k: ["Keyed fast hash vs cryptographic hash: a keyed fast hash is cheap on every lookup and defeats most flooding, but is not designed to resist a determined cryptanalytic attack.", "Random seed per process vs fixed seed: random seeds block precomputed collisions, but make iteration order and layout differ between runs."],
    p: ["A fixed or guessable seed allows a remote flooding attack by choosing keys that all share a bucket.", "Relying on iteration order of the table in tests or tools gives results that change between restarts."],
    v: "Restart the server twice with the same dataset and confirm iteration order differs, and run a collision-crafting test using a known fixed hash and confirm it cannot degrade lookups.",
    dep: ["keyspace-table"]
  },
  "expiry-index": {
    s: "A separate table mapping each key that has a deadline to its expiry time, so expiry checks and sampling avoid touching keys without one.",
    d: "Keys with a time to live have an entry in a per-database expiry table holding an absolute time in milliseconds. Setting, changing or clearing a deadline updates it, and deleting a key removes the entry. Lookups consult it to check staleness, and the active expiry cycle samples it to find expired keys. It adds memory per expiring key, and its random sampling is the basis of cheap probabilistic cleaning. In a cluster, keys per slot may also be indexed so that expiry and migration can work by slot.",
    k: ["Separate expiry table vs deadline stored in the value: a separate table keeps non-expiring keys small and allows direct sampling, but costs a lookup and extra memory for each expiring key.", "Absolute time vs relative time to live: absolute time survives restarts and replication without drift, but depends on synchronized clocks."],
    p: ["Setting an expiry on millions of keys adds notable memory overhead that capacity planning for the dataset alone does not count.", "Clock changes on the host shift absolute deadlines, expiring many keys early or keeping them past their time."],
    v: "Set deadlines on a sample of keys, query remaining time, wait past it, and confirm the keys are gone and their expiry entries removed from the count of keys with expiry.",
    dep: ["keyspace-table", "cached-clock"]
  },
  "cursor-iteration": {
    s: "A way to walk the entire keyspace or a large collection in small batches using an opaque cursor, without blocking and tolerating changes during the walk.",
    d: "Instead of listing everything in one blocking call, a scan command returns a batch plus a cursor to continue from. The cursor encodes a position in the hash table in a bit-reversed order, so the walk remains valid even if the table is resized between calls. Guarantees are weak but useful: elements present for the whole walk are returned at least once, and some may be returned more than once. Filters on pattern and type are applied after fetching, so a selective filter may return empty batches. Similar commands exist for hashes, sets and sorted sets.",
    k: ["Cursor scan vs full listing: scan never blocks for long and survives resizing, but may return duplicates and shows no consistent snapshot; a full listing is consistent but stalls.", "Server-side filters vs client-side: server-side filtering saves bandwidth, but each batch can scan many entries and return few."],
    p: ["Assuming each key is returned exactly once leads to double processing when a resize happens mid-walk.", "A strict filter produces many empty batches that look like the end of the walk; only a zero cursor means finished."],
    v: "Scan a keyspace of one million keys in batches while inserting and deleting others, and confirm every key present throughout appears at least once and the final cursor is zero.",
    dep: ["keyspace-table", "incremental-rehashing"]
  },
  "slot-key-index": {
    s: "An index grouping keys by their cluster hash slot, so slot-level operations such as counting, listing and migrating keys do not scan the whole keyspace.",
    d: "In cluster mode every key maps to one of a fixed number of slots, and the server keeps per-slot structures, either a separate table per slot or a per-slot index of key names. This makes counting keys in a slot, fetching a batch to migrate and checking whether a slot is empty cheap. It also helps expiry and eviction to work per slot. The cost is memory for the index and indirection on every key operation. Without it, resharding needs a scan of all keys to find those in one slot, which gets slow as datasets grow.",
    k: ["Per-slot tables vs one table plus an index: per-slot tables make migration and slot deletion direct, but spread memory over many small tables; one table with an index is simpler but duplicates names.", "Maintaining the index always vs only in cluster mode: only in cluster mode avoids overhead for standalone servers, but needs two code paths to keep correct."],
    p: ["An index that falls out of step with the main table makes a slot appear empty while keys remain, so they are lost in a migration.", "Many small tables add fragmentation and per-table overhead on servers with very large numbers of slots and few keys."],
    v: "Write keys across several slots, ask for the key count and a batch of keys for one slot, and confirm results match a full scan filtered by slot.",
    dep: ["keyspace-table", "hash-slots"]
  },
  "allocator": {
    s: "The general-purpose memory allocator that supplies and reclaims every value, buffer and table, whose size classes and arenas determine real memory use and fragmentation.",
    d: "The server allocates and frees huge numbers of small, varied objects, so it uses an allocator tuned for that with size classes, per-thread caches and arenas. Each request is rounded up to a size class, so actual use is larger than requested, and freed memory goes to caches or is returned to the operating system lazily. The server asks the allocator for usable sizes to account memory exactly, and for statistics on resident, active and allocated bytes. Because the process cannot easily move allocations, long-running mixed workloads fragment memory.",
    k: ["Size-class allocator vs exact-fit allocator: size classes make allocation fast and bounded, but waste a few percent per object; exact fit saves space and slows allocation.", "Returning memory to the OS eagerly vs keeping it: keeping avoids repeated page faults and is faster, but leaves the process looking larger than its live data."],
    p: ["Freeing a large share of keys does not shrink the process, because pages are partly used or retained, so operators think memory leaks.", "Modules or buffers allocated with another allocator corrupt accounting or crash when freed through the wrong one."],
    v: "Allocate and free many objects of mixed sizes, compare the allocator's allocated, active and resident figures, and confirm used memory returns near baseline after deletion within the allocator's retention window.",
    dep: []
  },
  "fragmentation": {
    s: "The gap between memory the process holds from the operating system and memory its live data uses, caused by freed holes between still-live objects that cannot be reused.",
    d: "Workloads that create many values and later delete or resize some leave holes in pages that remain partly in use, so the pages cannot be returned. The fragmentation ratio is resident memory divided by logical used memory: values above about 1.5 indicate waste, and below 1.0 signal that the operating system has swapped pages out. Patterns that worsen it include growing and shrinking values, varied size classes and mass deletes followed by small inserts. It is invisible to the eviction logic, which counts logical bytes, so a server can be killed for memory while under its limit.",
    k: ["Tolerating fragmentation vs defragmenting: tolerating costs nothing at run time but wastes RAM; defragmenting recovers memory but spends CPU and moves data on the main thread.", "Restarting to compact vs online defragmentation: a restart fully compacts but costs downtime or a failover; online avoids downtime but is gradual and imperfect."],
    p: ["A ratio below one is read as good news, when it actually means pages are being swapped to disk and latency will collapse.", "A server limited by an operating system container hits its memory ceiling from fragmentation while the configured limit is not reached."],
    v: "Fill memory with values of one size, delete half at random, insert values of another size, and confirm the fragmentation ratio rises and resident memory stays high while used memory falls.",
    dep: ["allocator", "memory-accounting"]
  },
  "active-defrag": {
    s: "A background process that moves live values into fresher memory pages, in small time-boxed steps on the main thread, so the allocator can return emptied pages.",
    d: "When fragmentation passes a threshold, the server periodically walks the keyspace and asks the allocator whether each allocation sits in a poorly used page. If so, it allocates a new copy in a better location, copies, updates the pointer and frees the old one. Work is limited to a configured share of CPU per cycle and resumes where it left off, with stronger effort as fragmentation rises. It needs allocator support to report utilization. The difficulty is correctness: every place that holds a pointer to the moved object, such as indexes and blocked-client lists, must be updated.",
    k: ["Higher CPU share vs lower: a high share reclaims memory faster but adds latency to commands; a low share is gentle and may never catch up with the workload.", "Defrag by moving values vs restarting: moving avoids downtime, but cannot compact everything and carries bugs risk for pointers held elsewhere."],
    p: ["Enabling defragmentation with an aggressive setting adds visible latency jitter on a server already near its CPU limit.", "A missed pointer update to a moved object produces use-after-free crashes that appear only under defragmentation."],
    v: "Create fragmentation, enable active defragmentation, and confirm the fragmentation ratio falls toward the target over minutes while the latency monitor shows no spike above the configured threshold.",
    dep: ["fragmentation", "allocator", "server-cron", "keyspace-table"]
  },
  "memory-accounting": {
    s: "Counting the exact bytes the server has allocated, including headers and allocator rounding, so it can compare real use against the limit and decide when to evict.",
    d: "Every allocation goes through wrappers that add the allocator-reported usable size to a counter, and every free subtracts it. The total is therefore close to what the allocator really holds for data. It deliberately differs from the resident size seen by the operating system, which includes fragmentation, code and shared libraries. Some memory is excluded from the figure compared with the limit, such as replica output buffers and the log buffer, so those do not trigger eviction of data. Accurate accounting needs every allocation, including modules', to be tracked.",
    k: ["Counting allocator usable size vs requested size: usable size is accurate for real memory but varies by allocator; requested size is portable but underestimates.", "Counter updated on every allocation vs sampled: a per-allocation counter is exact but touches a shared variable, while sampling is cheaper and less accurate."],
    p: ["The counted figure is lower than resident memory, so a server near the operating system limit is killed while counted use is under the configured limit.", "An allocation path that bypasses the wrappers is invisible, so memory grows with no eviction pressure."],
    v: "Allocate a known amount of data, read the used-memory figure, and confirm it rises by the data size plus a small known overhead; compare with the process's resident size and confirm the gap equals fragmentation and fixed overhead.",
    dep: ["allocator"]
  },
  "maxmemory-limit": {
    s: "A configured ceiling on memory used for data; before running a command that could add memory, the server frees enough, by eviction, or refuses the command.",
    d: "The limit applies to counted memory excluding certain buffers. Before each command flagged as possibly increasing memory, the server computes how far above the limit it is. If over, it invokes eviction in a loop until under the limit or no candidate is left, bounded by a time budget so one command cannot stall forever. With no eviction policy, writes return an out-of-memory error while reads continue. The limit must leave headroom for buffers, fragmentation, replication backlog and the copy-on-write cost of a snapshot, or the operating system kills the process.",
    k: ["Evict to stay under the limit vs refuse writes: eviction keeps a cache accepting writes by sacrificing old data; refusal protects data in a database use but breaks writers.", "Limit near physical memory vs generous headroom: a high limit stores more data, but a snapshot or buffer burst can exceed RAM and trigger a kill."],
    p: ["Setting the limit to total RAM leaves nothing for buffers and fork copying, so a snapshot pushes the machine into swapping or an out-of-memory kill.", "A limit with no eviction policy turns a full cache into a service that rejects every write."],
    v: "Set a small limit, write beyond it, and confirm used memory stays near the limit with the evicted-keys counter rising; switch to no eviction and confirm writes fail with an out-of-memory error.",
    dep: ["memory-accounting", "eviction-policy", "command-table"]
  },
  "lazy-free": {
    s: "Deleting large values on a helper thread instead of the main thread, so removing a huge collection or flushing a database does not stall the event loop.",
    d: "Freeing a value with millions of elements takes time proportional to its size. Lazy-free removes the key from the keyspace immediately and hands the value to a background thread that frees its memory. Unlink commands, flush with an asynchronous option, and settings for eviction, expiry and overwrites can all use it. The accounting is updated when the memory is actually released, so used memory may briefly look higher. Very small values are freed inline since handing them off would cost more than freeing them.",
    k: ["Background free vs inline free: background removes pauses from big deletes, but delays memory release and adds a hand-off cost for each value.", "Lazy by default vs opt-in per command: default lazy protects latency everywhere, but surprises operators expecting memory to drop immediately after a delete."],
    p: ["Deleting a huge collection with the synchronous command pauses the whole server for seconds, even though an asynchronous one existed.", "Memory appears unchanged right after an asynchronous delete, so operators repeat deletes or conclude it failed."],
    v: "Delete a ten-million-element set with the synchronous and asynchronous commands in turn, and confirm the first shows a long latency spike while the second returns quickly and memory falls shortly after.",
    dep: ["background-threads", "keyspace-table", "memory-accounting"]
  },
  "buffer-budget": {
    s: "Planning and limiting memory outside the dataset: client input and output buffers, the replication backlog, the log buffer, and eviction headroom for these.",
    d: "Besides values, the process holds client query and output buffers, replication buffers, the backlog, the pending log buffer and tables for tracking and subscriptions. Many of these are excluded from the eviction comparison, so they can grow while the server believes it is under its limit. A budget therefore sets per-client limits, a bound on replica buffers, and reserved headroom. Newer versions can also evict clients whose buffers use the most memory when a total client limit is crossed. The hardest cases are bursts: a mass subscribe, a large reply fan-out or a full resync.",
    k: ["Limit buffers strictly vs allow growth: strict limits protect memory but disconnect clients and replicas during bursts; generous limits survive bursts but risk memory exhaustion.", "Counting buffers toward the eviction limit vs excluding them: counting gives an honest total, but may evict data because of temporary buffer growth."],
    p: ["Replica buffers during a full resync with many replicas multiply memory use and can push the primary over its memory limit.", "Excluding buffers from the limit lets them grow unbounded when clients stop reading, until the process is killed."],
    v: "Connect a client that never reads and publish continuously; confirm the client is disconnected or evicted at the configured total limit and the process stays under its planned memory ceiling.",
    dep: ["output-buffers", "query-buffer", "replication-backlog", "memory-accounting"]
  },
  "eviction-policy": {
    s: "The setting and framework that decide which keys to remove when the memory limit is hit: all keys or only those with deadlines, by recency, frequency, randomly or by nearest expiry.",
    d: "A policy is chosen from combinations of scope and strategy: apply to all keys or only keys with an expiry, and pick by approximate least-recent use, least-frequent use, random choice or shortest time to live. A no-eviction policy refuses writes instead. When memory is over the limit, the framework samples candidate keys, ranks them using the policy, deletes the best victim, and repeats until memory is under the limit. Choosing the wrong policy for the workload wastes the cache, for example recency eviction under a scan, which flushes the working set.",
    k: ["Evict all keys vs only keys with expiry: all keys behaves like a plain cache, but only-expiring protects keys without deadlines, risking a full memory with nothing eligible.", "Recency vs frequency: recency adapts quickly to changing access, but one scan evicts popular keys; frequency keeps popular keys, but adapts slowly."],
    p: ["Choosing an expiring-keys-only policy when few keys have a deadline leaves nothing to evict, so writes fail despite a cache setup.", "A full scan by one job under a recency policy pushes the genuinely hot keys out of the cache."],
    v: "Run a skewed read workload under a small memory limit with each policy and compare hit rates, confirming the chosen policy gives the best hit rate and that evicted-keys counts rise only when memory is full.",
    dep: ["approximated-lru", "lfu-counter", "random-eviction", "ttl-eviction", "maxmemory-limit"]
  },
  "approximated-lru": {
    s: "Choosing a least-recently-used victim by sampling a few random keys and evicting the oldest, instead of maintaining an exact global recency list.",
    d: "Each object stores a coarse last-access time. To evict, the server samples a small number of random keys, typically five, and removes the one idle longest. A persistent pool of the best candidates, carried between evictions, improves the choice so that results approach exact least-recently-used ordering at a small fraction of the cost. This avoids touching a linked list on every read, which would add writes and memory per key. A larger sample size gives better accuracy at more CPU. The access clock has limited resolution, so very recent keys may tie.",
    k: ["Sampling vs exact LRU list: sampling costs no per-access bookkeeping and little memory, but sometimes evicts a key that is not the oldest.", "Larger sample vs smaller: larger samples approximate true LRU more closely, but cost more CPU on every eviction."],
    p: ["Reading a key through a path that does not update its access time makes it look idle, so a hot key is evicted.", "A small sample size on a skewed workload evicts moderately hot keys while colder ones survive."],
    v: "Fill the cache, touch a known hot subset continuously, add new keys past the limit, and confirm the hot keys survive while the oldest untouched ones are evicted, with hit rate close to an exact simulation.",
    dep: ["eviction-policy", "object-header", "cached-clock"]
  },
  "lfu-counter": {
    s: "A small logarithmic counter in each key's header that approximates how frequently it is accessed, decaying over time, so eviction removes rarely used keys.",
    d: "The header's clock field is split into a last-decrement time and an eight-bit counter. On each access, the counter increments with probability that falls as the counter rises, so eight bits represent hundreds of thousands of accesses. A decay step lowers the counter as time passes without access, so a key hot long ago does not stay forever. New keys start with a modest value so they are not evicted instantly. Eviction samples keys and removes the lowest counter. Tuning the increment factor and decay period decides how fast popularity changes are noticed.",
    k: ["Logarithmic probabilistic counter vs exact counts: eight bits per key keeps overhead tiny, but counts are approximate and noisy at low values.", "Fast decay vs slow decay: fast decay adapts quickly when popularity moves, but forgets steady keys; slow decay retains them, and takes longer to drop stale ones."],
    p: ["Switching to a frequency policy at runtime misreads old clock values as counters until each key is touched again.", "A fresh popular key with a low counter is evicted before it can build frequency, if new keys start too low."],
    v: "Access one set of keys ten thousand times and another once, fill memory, and confirm the rarely accessed keys are evicted first; read the counters with debug output and confirm they differ by orders of magnitude.",
    dep: ["eviction-policy", "object-header", "cached-clock"]
  },
  "random-eviction": {
    s: "Evicting a randomly chosen key, with no access tracking at all, which is cheapest and works acceptably when all keys are equally likely to be read.",
    d: "The server picks a random entry from the keyspace, or from the expiry index in the expiring-only variant, and deletes it. There is no metadata to maintain and no sampling decision, so eviction cost is minimal. It performs well only when access is close to uniform, and behaves poorly on skewed workloads, where it removes hot keys as often as cold ones. It is sometimes used as a baseline against which smarter policies are measured, or for data with no meaningful recency such as precomputed lookup tables.",
    k: ["Random vs tracked policies: random has zero bookkeeping and predictable cost, but ignores popularity, so hit rate suffers on skewed workloads.", "Random over all keys vs over expiring keys: all keys is uniform, while expiring-only protects permanent keys but can run out of candidates."],
    p: ["On a workload with a small hot set, random eviction drops hot keys at the same rate as cold ones and hit rate falls.", "Random choice from the expiry index only fails when memory is full of keys that have no deadline."],
    v: "Compare hit rates for uniform and skewed workloads under random eviction versus recency, and confirm random matches recency on uniform access and loses clearly on skewed access.",
    dep: ["eviction-policy", "keyspace-table", "expiry-index"]
  },
  "ttl-eviction": {
    s: "Evicting the key among sampled candidates that is closest to its expiry time, on the reasoning that it would be removed soon anyway.",
    d: "Among keys that have a deadline, the server samples several and removes the one with the nearest expiry. It uses the expiry index, not access metadata, so it needs no extra per-key fields. The approach favors keeping long-lived data and discarding short-lived data, which suits caches where the deadline reflects value. It is meaningless for keys with no deadline, so applications must set times on cache entries. If an application sets uniform deadlines, nearest expiry is the same as oldest write, which is not what recency would choose.",
    k: ["Nearest-expiry vs recency: nearest-expiry uses the application's own judgment of value, but ignores whether the key is actually being read.", "Sampling the expiry index vs a sorted index by deadline: sampling is cheap and approximate, but a sorted structure would be exact at the cost of updates on every deadline change."],
    p: ["Keys that never expire cannot be evicted by this policy, so a cache filling with them starts failing writes.", "A hot key with a short deadline is evicted before an idle key with a long one."],
    v: "Set varied deadlines on keys, fill memory, and confirm evicted keys are predominantly those with the nearest deadlines, while keys without deadlines remain.",
    dep: ["eviction-policy", "expiry-index"]
  },
  "lazy-expiry": {
    s: "Checking a key's deadline when it is accessed and deleting it on the spot if it has passed, so expired keys are never returned to clients.",
    d: "Every lookup compares the key's deadline from the expiry index with the current time. If expired, the server deletes the key, propagates a delete to replicas and the log, and treats the lookup as a miss. This is cheap and exact for keys that are read, but does nothing for keys nobody reads, which stay in memory until active expiry samples them. On replicas, the key is reported as missing without being deleted, since the primary is the one that issues deletes. Time used for the comparison is cached to avoid repeated clock reads in a command.",
    k: ["Delete on access vs report only: deleting reclaims memory immediately, but turns a read into a write that must be propagated.", "Fresh clock per lookup vs one time per command: one time per command is cheap and consistent inside a command, but can slightly misjudge long scripts."],
    p: ["Relying on lazy expiry alone leaves unread expired keys occupying memory indefinitely, which looks like a leak.", "A replica with a clock ahead of the primary would hide keys early if it applied deadlines to its own reads."],
    v: "Set a key with a one-second deadline, wait, read it, and confirm a miss and a delete appearing in the replication stream; leave another unread and confirm it persists in memory until active expiry removes it.",
    dep: ["expiry-index", "keyspace-table", "cached-clock", "expiry-propagation"]
  },
  "active-expiry": {
    s: "A periodic background cycle that samples keys with deadlines and deletes the expired ones, repeating while many samples are expired, within a strict time budget.",
    d: "Many times per second, the server picks a small random sample of keys with deadlines in each database and deletes those that have expired. If more than a set fraction, such as a quarter, of the sample was expired, it repeats immediately, up to a time limit per cycle, so a burst of expiry is cleaned quickly. The time limit keeps the loop responsive. Fast cycles run before sleeping to catch a backlog. The sampling approach scales to millions of keys, but means a share of expired keys always lingers, and a mass expiry creates a latency cost.",
    k: ["Sampling vs full expiry index scan: sampling bounds work per cycle and stays cheap, but leaves some expired keys; scanning would be thorough and block.", "Higher frequency vs lower: higher frequency clears garbage sooner, but consumes more CPU when most keys do not expire."],
    p: ["Millions of keys sharing one deadline expire together and the cycle repeatedly runs to its time limit, adding latency for clients.", "Treating expired but present keys as free memory underestimates usage; they still count until the cycle removes them."],
    v: "Expire one million keys at once, watch the expired-keys counter and latency monitor, and confirm keys are removed within seconds without a single stall above the configured expiry time limit.",
    dep: ["expiry-index", "server-cron", "expiry-propagation", "lazy-free"]
  },
  "expiry-propagation": {
    s: "Turning each expiry into an explicit delete command sent to replicas and the log, so all copies remove the same keys at the same point in the stream.",
    d: "Only the primary decides that a key has expired. When lazy or active expiry deletes a key, it writes a delete command into the replication stream and the append-only log. Replicas never expire keys on their own, since their clocks and timing could differ and make copies diverge; they only apply the delete. To keep reads correct, a replica treats a key past its deadline as missing without deleting it. Time-based commands are rewritten with absolute deadlines before propagation. This makes expiry deterministic across copies at the price of extra delete commands in the stream.",
    k: ["Explicit deletes vs each node expiring itself: explicit deletes keep every copy identical, but add traffic and depend on the primary being alive to issue them.", "Absolute deadlines vs relative durations in the stream: absolute times replay correctly after a delay, but require reasonably synchronized clocks."],
    p: ["A primary that is blocked or partitioned does not issue deletes, so replicas keep expired keys in memory though reads treat them as gone.", "Replaying a log with relative durations extends key lifetimes by the downtime."],
    v: "Expire a key on the primary, watch the replication stream for the delete, and confirm the replica's key count drops only when that delete arrives, while reads on the replica return a miss earlier.",
    dep: ["replication-stream", "append-only-log", "expiry-index"]
  },
  "snapshot-fork": {
    s: "Taking a point-in-time snapshot by forking the process; the child writes the frozen memory image to disk while the parent keeps serving clients.",
    d: "The parent calls fork, and the child receives a copy-on-write view of memory exactly as it was at that instant, so it can serialize the dataset to a file without any locking. The parent continues handling commands, and the child exits when the file is complete, replacing the old snapshot atomically by renaming. The fork itself copies page tables, which takes time proportional to memory size and can pause the parent for tens or hundreds of milliseconds on large heaps or virtual machines. Only one snapshot child runs at a time.",
    k: ["Fork snapshot vs in-process snapshot: fork needs no locks and gives a perfectly consistent image, but pauses at fork time and can double memory under write load.", "Snapshot by fork vs incremental persistence: a fork writes a complete file simply, but cost and file size grow with the dataset on every snapshot."],
    p: ["On large datasets in virtualized hosts, fork itself pauses the main thread for hundreds of milliseconds, visible as a latency spike.", "A failed fork due to insufficient memory commit settings leaves the server unable to save, while still serving traffic."],
    v: "Trigger a snapshot on a multi-gigabyte dataset while a client measures latency, and confirm the fork spike matches the reported fork time and a valid snapshot file appears after the child finishes.",
    dep: ["copy-on-write", "snapshot-format", "latency-monitor"]
  },
  "copy-on-write": {
    s: "The operating system's technique of sharing memory pages between parent and snapshot child until one writes, which makes a snapshot cheap unless the parent changes a lot of data.",
    d: "After a fork, both processes map the same physical pages read-only. When the parent writes a page, the kernel copies it first, so the child still sees the old contents. Memory use therefore grows with the amount of data the parent modifies during the snapshot, up to double in the worst case. Pages touched by reads of access clocks, resizing the hash table and defragmentation also trigger copies. Huge pages make this worse, since one small write copies a very large page, so they are usually disabled.",
    k: ["Copy-on-write sharing vs copying the dataset: sharing is nearly free for read-heavy workloads, but write-heavy workloads can double memory.", "Standard pages vs huge pages: huge pages lower page table cost, but make each write during a snapshot copy far more memory and add latency."],
    p: ["Large pages are enabled system-wide, so each small write during a snapshot copies two megabytes, ballooning memory and latency.", "A write-heavy workload during a long snapshot doubles memory and gets the process killed by the operating system."],
    v: "Run a snapshot while overwriting values at a steady rate, and confirm the sum of child and parent private memory grows in proportion to the volume of modified pages.",
    dep: ["snapshot-fork", "allocator"]
  },
  "snapshot-format": {
    s: "A compact binary file of the whole dataset: a header, then each key with its type, expiry and encoded value, ending in a checksum.",
    d: "The file begins with a version marker and metadata, then records for each database, each key with type, optional expiry and idle or frequency data, and values written in encoded form, with integers and small collections stored compactly and strings optionally compressed. A trailing checksum detects corruption. Loading is much faster than replaying commands since it rebuilds structures directly. Because the format changes between versions, newer servers read older files, but not the reverse. Module types, functions and replication information are also stored as opcodes inside the file.",
    k: ["Binary snapshot vs text command log: binary is small and fast to load, but is opaque and version-dependent; a command log is readable and portable but larger and slower to replay.", "Compressing strings vs writing raw: compression shrinks files and transfer, but costs CPU in the child and during load."],
    p: ["Loading a file written by a newer version fails on an older server, which blocks rollback after an upgrade.", "A snapshot truncated by a full disk is detected only by checksum, and a server that skips verification loads partial data."],
    v: "Write a snapshot of a mixed dataset, load it into a fresh server, and confirm key counts, types, values and expiry times match, and flip one byte and confirm the load fails the checksum.",
    dep: ["encoding-conversion", "object-header"]
  },
  "snapshot-scheduling": {
    s: "Rules for when to save automatically, such as after a number of changes within a number of seconds, plus manual and shutdown-time saves.",
    d: "Configuration lists pairs of seconds and change counts, for example save if ten thousand keys changed in sixty seconds. The cron job checks the number of changes since the last save and the elapsed time, and starts a background snapshot if any pair matches and no child is running. Saves also occur on shutdown, on commands, and for replica synchronization. After a failed background save, writes can be refused until the next success, to stop operators believing they have a backup. Scheduling trades data-loss window against fork and disk overhead.",
    k: ["Frequent snapshots vs rare: frequent saves shrink the loss window, but fork and write load rise; rare saves are cheap but lose more on a crash.", "Refuse writes after failed save vs continue: refusing makes backup failures loud, but makes a transient disk problem an outage."],
    p: ["Schedules that fire together with a replica resync start a second expensive fork, doubling the memory and I/O cost.", "A save schedule disabled on a database assumed to be a cache loses all data on restart with no warning."],
    v: "Configure a save rule of ten changes in ten seconds, make ten changes, and confirm a snapshot starts within the interval and the last-save time and change counter reset.",
    dep: ["snapshot-fork", "server-cron", "config-system"]
  },
  "append-only-log": {
    s: "A file recording every write command in order as it executes, so the dataset can be rebuilt by replaying it, giving much smaller data-loss windows than snapshots.",
    d: "After each write command executes, its effect is appended to an in-memory buffer and then written to the log file before the next loop iteration, with fsync governed by policy. Commands are rewritten into deterministic forms, for example relative expiry becomes absolute, and scripts log their effects. On restart the server replays the log to rebuild memory. The log grows without bound, so it is periodically rewritten. A manifest tracks a base file and incremental files, so a rewrite can proceed without blocking the appender.",
    k: ["Log of commands vs snapshots only: the log loses seconds of data at worst and is human-readable, but grows continuously and replays slowly.", "Single file vs base plus incremental files: multiple files let a rewrite run in the background and finish with an atomic manifest update, but need more bookkeeping."],
    p: ["A log with no rewrite grows to many times the dataset size and makes restart replay take minutes or hours.", "A full disk stops appends, and the server must decide between refusing writes and continuing without durability."],
    v: "Write keys, kill the process abruptly, restart with the log, and confirm every acknowledged write from before the last fsync is present, and replay a log from a different version with no errors.",
    dep: ["fsync-policy", "log-rewrite", "startup-loading", "expiry-propagation"]
  },
  "fsync-policy": {
    s: "The setting that decides when log writes are forced to disk: after every command, once per second, or left to the operating system.",
    d: "Writing to a file only places data in the operating system's cache; fsync forces it to the device. Always calls it before replying, which is safest and slowest, limited by disk latency. The every-second policy runs it from a background thread, so a crash loses at most about one second. The never policy leaves flushing to the operating system, which can lose tens of seconds. If an fsync lags, the server may delay writing to avoid piling up, or the main thread can stall behind a blocked write call. Disk latency spikes therefore appear as command latency.",
    k: ["Fsync every command vs every second: every command gives near-zero loss, but caps throughput at the disk's sync rate; every second keeps speed with up to a second of loss.", "Background fsync thread vs inline: background keeps the loop free, but a slow disk can still block writes when the previous sync is unfinished."],
    p: ["Disk contention from a snapshot or rewrite makes fsync slow, and writes stall while the server appears healthy.", "Assuming a write acknowledged to the client is on disk under the every-second policy leads to unexpected loss."],
    v: "Run a write load under each policy, kill the machine's process abruptly, and compare the number of lost acknowledged writes; confirm always loses none and per-second loses about one second's worth.",
    dep: ["append-only-log", "background-threads"]
  },
  "log-rewrite": {
    s: "Compacting the append-only log by writing a fresh minimal file that reproduces the current dataset, while new writes continue to be logged and then merged.",
    d: "A child forked from the parent writes the current state to a new base file, either as commands or as a snapshot-format preamble followed by commands. Meanwhile the parent keeps appending new writes to a fresh incremental file. When the child finishes, a manifest is updated atomically to point at the new base and the incremental files, and old files are removed. Rewrites start when the log has grown by a set percentage and minimum size. It carries the same fork and copy-on-write costs as a snapshot, and a disk-heavy burst.",
    k: ["Snapshot-format base vs command base: a snapshot base loads far faster and is smaller, but ties the log to the binary format; a command base is portable and slower to load.", "Automatic growth-triggered rewrite vs manual: automatic keeps the log bounded without attention, but can fire at a bad moment under load."],
    p: ["A rewrite that starts with little free disk can fill the disk with old and new files at once, halting writes.", "Rewrites happening continuously on a write-heavy server keep a child running and memory doubling most of the time."],
    v: "Grow the log by overwriting the same keys, trigger a rewrite, and confirm the new file is far smaller, replaying it gives the same dataset, and writes during the rewrite appear in the incremental file.",
    dep: ["append-only-log", "snapshot-fork", "snapshot-format", "copy-on-write"]
  },
  "startup-loading": {
    s: "Rebuilding memory at boot from the snapshot or log, preferring the log when enabled, with progress reporting and a rule for what clients see while loading.",
    d: "On start the server finds the log manifest or snapshot file, then reads it, building keys and values while still processing events enough to answer pings and report loading state. Clients get an error saying the dataset is loading until it finishes. Loading a snapshot is faster than replaying a log. Expired keys encountered are skipped by a primary, but kept by replicas until told to delete. The time to load grows with dataset size and can be minutes for tens of gigabytes, which is why replicas and failover matter for availability. Corruption checks run during load.",
    k: ["Prefer the log vs prefer the snapshot: the log has the most recent data, but takes longer to replay; the snapshot loads quickly but may be older.", "Serve while loading vs refuse: refusing avoids reading partial data, but turns a restart into a visible outage; partial serving would be inconsistent."],
    p: ["Restarting a large server for a configuration change makes the cache cold or unavailable for minutes, and the database behind it is flooded.", "A corrupt or truncated file stops startup, and without a valid backup the dataset is lost."],
    v: "Restart a server with a multi-gigabyte dataset and confirm it reports loading with a progress figure, rejects commands with a loading error, and then serves with the same key count as before.",
    dep: ["snapshot-format", "append-only-log", "truncated-log-repair"]
  },
  "truncated-log-repair": {
    s: "Handling a log whose tail was cut off by a crash: truncate to the last complete command and start, or refuse until the operator runs a repair tool.",
    d: "A crash or full disk can leave a partial command at the end of the log. By default the server can detect an incomplete final command and, if allowed, drop it and load the rest, logging a warning. Corruption in the middle is not recoverable automatically, and the server refuses to start. An offline check tool scans the file, reports the first bad offset and can truncate the file there, losing everything after it. Combined with the snapshot-format preamble, a checksum helps detect damage in the base part of the file.",
    k: ["Auto-truncate the tail vs refuse to start: auto-truncate gets the server up after an ordinary crash, but may hide a real problem; refusing is safe but needs a person.", "Truncate at first error vs skip corrupt commands: truncating guarantees a prefix-consistent state, while skipping would yield a state that never existed."],
    p: ["Repairing by truncating at the first error discards everything after it, so a damaged byte early in a large file loses most of the data.", "Disabling the tail-recovery option makes every crash during a write a manual recovery."],
    v: "Cut a few bytes from the end of the log, start the server, and confirm it loads all complete commands and logs the truncation; corrupt a byte in the middle and confirm it refuses to start.",
    dep: ["append-only-log", "startup-loading"]
  },
});
