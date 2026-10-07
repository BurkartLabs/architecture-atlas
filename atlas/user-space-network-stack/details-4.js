// Details part 4: memory & buffers, rings & batching.
ATLAS.details("user-space-network-stack", {
  "huge-page-backing": {
    s: "Backs packet memory with huge pages (megabytes or gigabytes each), so a few address translations cover the whole pool and the card sees physically contiguous regions.",
    d: "At startup the stack reserves huge pages from the operating system, maps them into its address space and records their physical addresses. One translation entry then covers a large span, which avoids the translation-cache misses that ordinary small pages cause when walking a large buffer pool. Pages are pinned so they cannot move or be swapped. The difficulty is availability: huge pages must be reserved ahead of time on the right memory node, fragmentation can prevent allocating them later, and unused reservations are wasted memory.",
    k: ["Huge pages vs. regular pages: huge pages cut translation misses and give contiguity for DMA, but must be reserved early and cannot be shared with other uses.", "Larger gigabyte pages vs. two-megabyte pages: gigabyte pages minimize translations and are inflexible to place per node; two-megabyte pages are easier to obtain and balance."],
    p: ["Reservation succeeds on the wrong NUMA node, so every packet access crosses the interconnect.", "Memory fragmented by earlier use leaves too few free huge pages at startup, and the stack falls back to smaller pools."],
    v: "Start the stack and confirm from the memory map that pool pages are huge pages on the intended node, pinned, with translation-miss counters near zero at line rate and the number of pages equal to the configured size.",
    dep: ["numa-topology", "dma-mapping"]
  },
  "packet-buffer-pools": {
    s: "Fixed-size buffers allocated once and recycled continuously, so the data path never calls a general allocator and every buffer is already mapped for DMA.",
    d: "A pool is an array of equal buffers each holding a descriptor, headroom, data space and tailroom, stored in a ring of free entries. Receive takes buffers from the pool to fill the card's descriptors; freeing returns them. Pools exist per memory node and sometimes per packet size. The size must cover the in-flight packets of every queue, ring, timer and socket. It is hard to size: too small causes drops under bursts, too large wastes memory, and a leak is only noticed when the pool is empty.",
    k: ["One pool per size class vs. one size for everything: size classes waste less memory for mixed traffic and complicate receive, which must pick a size before it sees the packet.", "Pool per NUMA node vs. one global: per node keeps accesses local and strands memory on one node when load shifts."],
    p: ["A single buffer leak per thousand packets drains the pool in minutes and stops all receive with no error until then.", "Pool sized to ring depth alone ignores buffers held in reassembly, send queues and application hands, causing early exhaustion."],
    v: "Run at full load for an hour while tracking pool occupancy: confirm it settles at a stable plateau equal to the computed in-flight need, returns to the full count at idle, and any leak shows as a monotonic climb.",
    dep: ["huge-page-backing", "buffer-layout", "per-core-caches", "numa-aware-allocation"]
  },
  "per-core-caches": {
    s: "A small stash of free buffers kept privately by each core, refilled from and flushed to the shared pool in batches, so most allocations need no synchronization.",
    d: "Allocating takes from the core's local array; when empty, it grabs a batch from the shared pool ring, and when full, it returns a batch. Most operations are plain memory accesses. Cache size trades synchronization frequency against buffers stranded on idle cores. The difficulty is imbalance: a core that only frees (a transmit core) and another that only allocates (a receive core) need constant batch transfers, and unreturned buffers in many idle caches can starve a busy core.",
    k: ["Large caches vs. small: large caches reduce shared-ring traffic and can hold thousands of buffers hostage on idle cores; small caches share better and synchronize more.", "Batch refill vs. single-buffer refill: batches amortize the atomic operation across many buffers and can overshoot the need."],
    p: ["Many lightly used cores each hold a full cache, so the shared pool appears exhausted while memory is plentiful.", "A core that terminates without flushing its cache loses those buffers permanently."],
    v: "Run a receive-core to transmit-core handoff at line rate and confirm shared-ring operations per packet fall near one per batch, total buffers equal pool size when caches are flushed, and no core holds more than its limit.",
    dep: ["packet-buffer-pools", "lockless-rings", "core-pinning"]
  },
  "buffer-layout": {
    s: "The fixed layout of each buffer: metadata, headroom for prepended headers, packet data and tailroom, arranged so hot fields share the first cache line.",
    d: "Metadata holds length, offsets, ports, offload flags, hash, timestamp and a pointer to the next segment. The first cache line contains what every packet touches and the second what only some stages need. Headroom lets headers be prepended without moving data, and the data area is aligned so payload starts at a cache-friendly offset. The design is tight because every byte of metadata is paid for on every packet, and a field added late can push the hot set onto another cache line and cost measurable throughput.",
    k: ["Metadata inside the buffer vs. in a separate array: inline gives one fetch for both, while separate arrays pack tightly and allow scanning metadata without touching data.", "Generous headroom vs. minimal: generous headroom supports encapsulation without copying and wastes memory in every buffer."],
    p: ["A field added to metadata crosses a cache-line boundary and every packet now takes an extra miss.", "Insufficient headroom for a tunnel header forces a copy on a path that was designed to be zero-copy."],
    v: "Inspect a profile at line rate and confirm the hot metadata fields are in the first cache line, no stage takes more than one miss on metadata per packet, and headroom is enough for the deepest supported encapsulation.",
    dep: ["huge-page-backing", "cache-line-discipline"]
  },
  "chained-buffers": {
    s: "Links several buffers into one logical packet using a next pointer, so large frames, headers added separately, and scattered payload need no copy into one contiguous region.",
    d: "The first buffer carries the packet's total length and segment count, each segment its own length and next pointer. Protocol code walks the chain when it needs bytes, and the card transmits the chain through scatter-gather. Headers can sit in a small buffer pointing at shared payload, which makes sending the same data to many receivers cheap. The cost is every consumer that assumed contiguity: parsers, checksums and cryptography must handle chains, and many bugs hide in the boundary between segments.",
    k: ["Chains vs. forcing contiguity: chains avoid copies and support large frames from small pools, but every parser must handle boundaries.", "Indirect buffers sharing one payload vs. copying per receiver: sharing makes multicast and retransmission nearly free and requires reference counting."],
    p: ["A header split across two segments is read as contiguous, and the parser reads past the first segment's end.", "Freeing a chain by freeing only the first buffer leaks the rest."],
    v: "Send and receive packets whose headers straddle segment boundaries at every offset, and confirm byte-exact parsing and delivery, with pool occupancy returning to baseline after the test.",
    dep: ["buffer-layout", "buffer-lifetime", "scatter-gather-dma"]
  },
  "dma-mapping": {
    s: "Establishes the address translations and pinning that let the card read and write packet memory directly, with the card's view of an address possibly differing from the CPU's.",
    d: "Memory given to the card must stay in place and be addressable by it: either by physical address, or by an I/O virtual address translated by the IOMMU. The stack registers its pools once at startup so no mapping happens per packet. Each buffer's descriptor stores the address the card should use. The challenge is that a wrong address is a silent corruption or a fault: the card writes through the translation and a mistaken mapping corrupts memory, or if the IOMMU blocks it, loses the packet.",
    k: ["Physical addresses vs. I/O virtual addresses: physical addresses are simple and fast and let a bad address overwrite any memory; I/O virtual addresses are protected and cost translation lookups.", "Mapping the whole pool once vs. per-buffer mapping: whole-pool mapping removes per-packet cost and requires memory to be pinned up front."],
    p: ["Memory freed or moved while the card still holds its address leads to the card overwriting unrelated data.", "Translation-cache misses in the IOMMU at high packet rates cost throughput that no CPU profile shows."],
    v: "Run a long soak with IOMMU fault logging enabled and confirm zero translation faults, all pool memory registered before traffic starts, and checksums of received data that match the sender over billions of packets.",
    dep: ["huge-page-backing", "iommu-isolation", "userspace-device-access"]
  },
  "numa-aware-allocation": {
    s: "Places each buffer pool, flow table and queue on the memory node closest to the cores and card that use it, avoiding slower cross-socket memory traffic.",
    d: "At startup the stack discovers which node each network card and each core belongs to, then allocates per-node pools, tables and rings on the matching node. A queue is served by a core on the card's node; flow state lives with its core. Cross-node traffic is unavoidable for some paths (a packet received on one node, processed on another), and the stack tracks it. It is hard because the defaults of allocators place memory where the allocating thread happened to run, and mistakes show only as lower throughput.",
    k: ["Strict node-local placement vs. interleaving across nodes: local placement gives the lowest latency but needs matching cores and cards; interleaving evens bandwidth and removes locality.", "Per-node copies of read-mostly tables vs. one shared: copies make lookups local and need updates applied to each; shared is simpler and remote for half the cores."],
    p: ["Allocating the pool from a setup thread running on the wrong node puts every packet on remote memory.", "A card on one node served by cores from another doubles memory traffic across the interconnect."],
    v: "Read per-node memory statistics and counters for remote accesses while at line rate, and confirm pools and tables reside on the card's node, remote access ratio is below the target, and moving a core to the wrong node visibly lowers throughput.",
    dep: ["numa-topology", "huge-page-backing"]
  },
  "buffer-lifetime": {
    s: "The rules for who owns a packet buffer at each moment, from allocation by the receive path to its return to the pool, including shared references.",
    d: "A buffer is owned by the card's receive ring, then by software stages, possibly by a send queue awaiting acknowledgment, the application, a trace ring, or the transmit ring. Reference counts support sharing: retransmission queues and multicast copies hold extra references. The final release returns the buffer to the pool. It is the hardest cross-cutting rule in the stack: every path (including errors, drops and shutdown) must release exactly once, and a missing release leaks while a double release corrupts live packets.",
    k: ["Reference counts vs. single ownership with copies: counts allow zero-copy sharing and need atomic or per-core accounting; single ownership is simple and copies at every share point.", "Atomic counts vs. per-core non-atomic counts: atomics are always safe and cost a locked instruction each; non-atomic counts are fast and restrict sharing to one core."],
    p: ["An error path that drops a packet without freeing it leaks one buffer per error until the pool is empty.", "A double free puts the same buffer in the pool twice, and two packets then overwrite each other."],
    v: "Run a fault-injection test that drops, truncates and aborts at every stage, and confirm that after quiescing the free count equals the pool size exactly and a debug mode with ownership tags reports no double release.",
    dep: ["packet-buffer-pools", "per-core-caches"]
  },
  "memory-exhaustion": {
    s: "Defines behavior when pools, tables or rings run out: which allocations fail, what is dropped, how the condition is reported and how the stack recovers.",
    d: "Every fixed-size resource has a limit and a defined failure: receive refills fail and the card drops packets, new connections are refused, reassembly rejects fragments. Reserve pools keep room for critical traffic (control messages, handshake responses) when general pools are drained. Recovery means memory returns as load falls, without restart. The difficulty is cascades: exhausting a pool stops receive refill, which stops traffic, which stops frees from the application, which keeps the pool empty.",
    k: ["Reserving buffers for critical traffic vs. one shared pool: reservation keeps control traffic alive in overload and removes capacity from normal use.", "Failing allocations visibly vs. blocking: failure keeps the loop running and requires every caller to handle it; blocking is easy and can deadlock a polling core."],
    p: ["With the pool empty, no buffers are available to send the reset or acknowledgment that would release the peer's resources.", "A refill failure on the receive ring leaves the ring half empty after memory returns, so receive never fully recovers."],
    v: "Deliberately starve the pool, then release the load, and confirm critical traffic keeps working during starvation, each failure is counted by reason, and throughput returns to baseline within seconds without restart.",
    dep: ["packet-buffer-pools", "drop-reason-accounting", "backpressure-and-shedding"]
  },
  "lockless-rings": {
    s: "Fixed-size circular queues that producers and consumers update through atomic head and tail indexes, passing packet pointers between cores without locks.",
    d: "A ring is an array of pointers with a producer index and a consumer index on separate cache lines. Single-producer single-consumer rings need only ordered stores; multi-producer variants reserve space with a compare-and-swap, then publish in order. Burst enqueue and dequeue move many entries per index update. Sizes are powers of two for cheap wrapping. The hard part is subtlety: memory-ordering mistakes cause rare corruptions, and a multi-producer ring can stall all producers when one is preempted between reserving and publishing.",
    k: ["Single-producer single-consumer rings vs. multi-producer: single-pair rings are fastest and require many rings in an all-to-all layout; multi-producer saves rings at the cost of contention and a stall hazard.", "Ring of pointers vs. ring of full packet copies: pointers keep entries small and require buffers to stay valid; copies are isolated and cost memory bandwidth."],
    p: ["A preempted producer holding a reserved slot blocks every later producer behind it.", "Missing a memory barrier lets the consumer read a slot's pointer before the data it points to is visible."],
    v: "Run producer and consumer cores for a day with randomized burst sizes and a checksum on each entry, and confirm no loss, duplication or reordering, and that ring occupancy stays within bounds under a slow consumer.",
    dep: ["cache-line-discipline", "core-pinning"]
  },
  "burst-batching": {
    s: "Handles packets in groups (typically 16 to 64), amortizing fixed costs (ring updates, function calls, table setup) across the group so per-packet cost falls.",
    d: "The driver returns an array of packets in one call; each stage processes the whole array, loops over it in tight code, and passes it on. Batching improves instruction-cache use, enables prefetching a few packets ahead and makes vectorized code possible. Larger batches mean more throughput and more latency: a packet waits for the rest of its batch. Under light load, bursts are small and cost is higher per packet, which is why batch size should adapt to arrival rate.",
    k: ["Large fixed bursts vs. adaptive: large bursts maximize throughput and add latency at low load; adaptive keeps latency low and varies cost per packet.", "Stage-at-a-time over the batch vs. packet-at-a-time through all stages: stage-at-a-time keeps code and tables hot and delays the first packet; packet-at-a-time lowers latency and thrashes the instruction cache."],
    p: ["A batch that waits to fill before processing adds up to a full batch time of latency under light traffic.", "One slow or malformed packet in a batch delays the other packets that arrived with it."],
    v: "Sweep batch size from 1 to 64 under light and heavy load and plot throughput and latency: confirm throughput saturates by the chosen size and median latency at low load stays within the budget.",
    dep: ["lockless-rings", "prefetching", "vectorized-paths"]
  },
  "prefetching": {
    s: "Issues memory loads for packet headers and table entries a few packets ahead of use, so the data is in cache when the code reaches it.",
    d: "While packet N is processed, the code issues prefetch instructions for packet N+k's header and the flow-table bucket for its hash. Because memory latency is far larger than the processing time of one packet, overlapping fetches with work hides it. Distances are tuned empirically per platform. The challenge is that prefetching is invisible when it works and a loss when wrong: too early and the line is evicted before use, too late and it does nothing, and prefetching useless addresses wastes bandwidth.",
    k: ["Software prefetch with tuned distance vs. relying on hardware prefetchers: software handles irregular access like hash lookups, while hardware only predicts sequential patterns.", "Prefetching table buckets in a first pass over the batch vs. on demand: a separate pass overlaps all fetches and adds a loop."],
    p: ["A prefetch distance tuned on one processor family is too short on another with higher memory latency.", "Prefetching entries for packets later dropped wastes bandwidth under attack traffic."],
    v: "Profile cache-miss counters with prefetching on and off at line rate and confirm cycles per packet fall measurably, last-level misses on flow entries drop, and the gain persists for random-tuple traffic.",
    dep: ["burst-batching", "flow-table", "cache-line-discipline"]
  },
  "cache-line-discipline": {
    s: "Arranges data structures and thread ownership so that cores do not share cache lines they write, which would otherwise bounce between caches and stall both.",
    d: "Hot per-core data is padded and aligned to 64 bytes so two cores' variables never occupy one line. Read-mostly data is separated from written data. Ring indexes are placed on separate lines from the ring array. Structures are laid out so the fields used together are adjacent. It is hard because false sharing is invisible in code: two unrelated counters sitting in one line behave correctly and run several times slower, and a casual edit that reorders fields undoes the layout.",
    k: ["Padding to cache-line size vs. compact packing: padding prevents false sharing at the cost of memory and cache capacity; packing fits more in cache and risks contention.", "Per-core copies merged on read vs. shared writable data: copies need no coherence traffic and complicate reading; shared data is simple and slow under writes."],
    p: ["Two adjacent per-core counters share one line, and throughput falls as cores are added.", "A structure resized by a new field no longer fits its intended number of lines."],
    v: "Count cache-line transfers between cores with hardware counters while scaling cores from 1 to 16: confirm throughput scales near linearly and cross-core invalidations per packet stay near zero.",
    dep: ["numa-topology"]
  },
  "transmit-flush": {
    s: "Collects outgoing packets into a per-queue buffer and writes them to the card together, with the doorbell write that tells it to send, so one register write covers many packets.",
    d: "Packets are staged in a small array and handed to the driver when the batch is full or the loop iteration ends. The driver fills descriptors and performs one doorbell write, an uncached register access that is far more expensive than a memory write. Flush timing controls latency: flushing every iteration bounds delay, waiting for a full batch maximizes throughput. The difficulty is correct flushing at every exit path, because a packet left in the staging array when traffic stops is delayed indefinitely.",
    k: ["Flush at the end of every loop iteration vs. only when full: per iteration bounds latency to one loop time and sends small batches under light load; only-when-full is efficient and delays tail packets.", "Single doorbell per batch vs. per packet: a single write amortizes a costly operation and delays the first packet in the batch."],
    p: ["A staging array not flushed when traffic ceases leaves the last few packets unsent until more arrive.", "Full transmit descriptors cause staged packets to be dropped without being counted."],
    v: "Send one packet per second and confirm it leaves the card within one loop interval, then send at line rate and confirm doorbell writes per second are a small fraction of the packet rate.",
    dep: ["burst-batching", "descriptor-rings", "poll-mode-driver"]
  },
  "inter-core-messaging": {
    s: "Passes packets and commands between cores over rings, so state stays owned by one core while any other core can ask it to act.",
    d: "Each pair of communicating cores, or each owner, has a ring for messages: packets forwarded to the owning core, control commands, buffer returns, timer requests. The sender enqueues and continues; the owner picks up messages in its loop. All-to-all topologies of single-producer rings avoid contention at the price of many rings. Latency is one loop time plus the cache transfer. The challenge is scale and ordering: many cores means many rings to poll, and messages that overtake one another break protocol assumptions.",
    k: ["Message passing to the owner vs. shared state with locks: messaging keeps data single-writer and costs a hop; locks permit direct access and contend and cache-bounce.", "One ring per sender-receiver pair vs. one shared ring per receiver: pairs need no atomics and scale poorly in count; shared rings are few and contended."],
    p: ["A receiver polling hundreds of idle rings wastes cycles on empty checks every loop.", "Commands sent through a different ring than earlier data arrive before it, and act on stale state."],
    v: "Have every core send messages to every other at a high rate, and confirm ordering per sender-receiver pair, no loss, and that latency stays within two loop iterations plus cache transfer at the 99.9th percentile.",
    dep: ["lockless-rings", "core-pinning", "cache-line-discipline"]
  },
});
