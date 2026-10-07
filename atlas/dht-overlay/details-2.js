// Details for the DHT overlay plate, part 2: replication and expiry, lookup, routing table, identifier space.
ATLAS.details("dht-overlay", {
  "k-closest-replication": {
    s: "Storing each value on the k nodes whose identifiers are closest to its key, so that several independent peers must fail before the value is lost.",
    d: "After a lookup returns the k closest nodes to the key, the publisher sends a store request to each. Readers query the same neighborhood, so any surviving replica can answer. The value of k is chosen from expected churn: large enough that all replicas are unlikely to leave between refreshes. Because closeness is defined by the shared metric, no directory of replicas is needed. It is hard because the set of closest nodes changes as peers come and go, so replicas drift away from where readers will look.",
    k: ["Replicating on the closest k versus on random nodes: closest-k needs no index and readers know where to look, but correlated failures in one region of the space take out all copies.", "Larger k versus smaller: larger k survives more churn, but multiplies storage, refresh traffic and the cost of every update."],
    p: ["Publishing to nodes returned by a single lookup that was poisoned places every replica on attacker nodes.", "A stale lookup result puts replicas on nodes that are no longer among the closest, so readers miss them."],
    v: "Store a value, then stop k minus one of its replicas one by one with refresh disabled. Confirm a reader still gets the value, and that it is lost only when the last replica goes.",
    dep: ["iterative-lookup", "ownership-rule", "find-node-rpc"]
  },
  "replica-maintenance": {
    s: "The background work that restores the replica count when replicas leave: nodes holding a record check their neighborhood and copy it to nodes that should now hold it.",
    d: "Each node periodically takes the records it holds, finds who currently should store them, and sends the record to any of those who lack it. Some designs compare compact summaries of each other's key sets first to avoid resending everything. Maintenance runs continuously because the closest set changes with every join and departure. It is hard because its cost scales with stored data times churn: a node holding millions of records cannot afford to republish them all frequently.",
    k: ["Holder-driven repair versus relying on publishers alone: holder-driven repair survives publishers going offline, but spends traffic on data nobody may want.", "Exchanging key digests versus pushing every record: digests save bandwidth when most replicas are healthy, but add rounds and code to reconcile differences."],
    p: ["Every replica independently re-pushing every record produces a storm of duplicate traffic after a single departure.", "A failed maintenance round that goes unnoticed leaves the replica count quietly shrinking until a value disappears."],
    v: "Store a value on k nodes, remove one replica, and confirm that within the maintenance interval a new node among the closest holds the record, with the traffic matching the record size.",
    dep: ["k-closest-replication", "neighbor-change-handoff", "local-record-store"]
  },
  "publisher-republish": {
    s: "The original publisher rewriting its values to the current closest nodes on a schedule, so data lives as long as someone keeps it fresh.",
    d: "A publisher keeps the list of items it wants available and, every interval shorter than the record lifetime, runs a lookup and stores each again. The refresh also repairs placement drift and resets expiry. If the publisher disappears, its records expire. This ties the lifetime of data to the interest of its owner, which prevents unbounded accumulation. It is hard because refresh cost grows with the number of items, and a publisher with many items must either lengthen the interval or accept that some will lapse.",
    k: ["Publisher refresh versus replica refresh: publisher refresh keeps authority with the owner and removes abandoned data, but data vanishes when the owner is offline.", "Short refresh interval versus long: short intervals keep replicas well placed, long intervals reduce traffic but risk lapse during extended churn."],
    p: ["Refresh interval close to the lifetime means one missed cycle on a flaky connection loses the data.", "Thousands of items refreshed in a single burst overload the publisher's connection and the nodes receiving them."],
    v: "Publish an item, take the publisher offline, and confirm the record remains retrievable until its lifetime ends, then expires. With the publisher online, confirm the record is rewritten each interval.",
    dep: ["iterative-lookup", "record-expiry", "k-closest-replication"]
  },
  "neighbor-change-handoff": {
    s: "When a node learns that a new peer is now closer to some keys it holds, it sends those records to the new peer so responsibility follows the neighborhood.",
    d: "On adding a new contact to its table, a node checks which of its stored keys are closer to the newcomer than to itself or to its other nearest peers, and forwards those records. This keeps the closest set up to date without waiting for the next refresh. It is local, using only information the node already has. It is hard because a node that is nearly the closest for many keys may send many records at once, a rapid sequence of arrivals causes repeated transfers, and a malicious newcomer receives data just by claiming a nearby identifier.",
    k: ["Eager handoff on every new contact versus waiting for the periodic cycle: eager handoff improves availability immediately, but causes bursts and duplicate sends under heavy churn.", "Keeping a copy after handoff versus deleting it: keeping copies adds redundancy and tolerates a bad newcomer, but wastes storage and leaves stale data."],
    p: ["Handing records to a newcomer that has not yet proven it is reachable loses them when it never responds.", "An attacker joining with identifiers near popular keys is handed the data and can then withhold it."],
    v: "Insert a new node whose identifier is closest to a stored key, and confirm the previous holder sends that record to it within seconds, and a lookup for the key now returns the newcomer.",
    dep: ["k-buckets", "local-record-store", "xor-metric"]
  },
  "record-expiry": {
    s: "A lifetime attached to every stored record so that data not refreshed by its publisher disappears, bounding storage and removing information about departed peers.",
    d: "Each record is stored with an expiry time derived from a lifetime that the publisher requests and the node caps at a maximum. Expired records are no longer served and are removed. The lifetime must exceed the refresh period by a safety margin. Different record types use different lifetimes: addresses of nodes expire quickly, long-lived content descriptions slowly. It is hard because lifetimes are a trade-off with no right value, and clocks differ, so nodes compute expiry from their own receive time, not the publisher's timestamp.",
    k: ["Node-capped lifetimes versus publisher-chosen: a cap stops anyone pinning data forever, but means long-lived data needs frequent refresh.", "Expiry from receive time versus a signed timestamp: receive time avoids relying on synchronized clocks, but each relocation of a record restarts its life."],
    p: ["Trusting a publisher-supplied expiry lets a record outlive its owner indefinitely.", "Replica copies with fresh receive times keep a deleted value alive as nodes hand it around."],
    v: "Store a record with a one-hour lifetime and confirm it is returned at fifty-nine minutes and absent at sixty-one minutes without refresh, and present again when refreshed at fifty minutes.",
    dep: ["local-record-store"]
  },
  "tombstones": {
    s: "Explicit markers that record a deleted value so that replicas and republishers do not bring it back, kept until their own expiry.",
    d: "Deleting under expiry-based storage is normally just waiting. When a faster removal is needed, the owner stores a signed marker with a higher sequence number that replaces the value. Replicas treat the marker as the current record, serve it as a deletion, and drop it when it expires. Without it, a stale replica could repopulate the others. It is hard because deletion is not guaranteed: replicas that were offline hold the old value and return it after the marker expires, and content-addressed copies cannot be revoked at all.",
    k: ["Tombstones versus plain expiry: tombstones hide data quickly and prevent resurrection, but need signed keys and add records that must themselves be stored and eventually expire.", "Long-lived tombstones versus short: long ones block more stale replicas, but occupy storage for data that no longer exists."],
    p: ["A tombstone that expires before a partitioned replica returns lets the deleted value reappear.", "Assuming deletion is permanent when copies of content-addressed data are held elsewhere gives false assurance."],
    v: "Publish a record, replace it with a tombstone, and confirm readers get a deletion result. Reintroduce an older replica and confirm the sequence rule makes it adopt the tombstone.",
    dep: ["signed-mutable-records", "record-expiry", "local-record-store"]
  },
  "path-caching": {
    s: "After a successful get, copying the value to the closest node on the lookup path that did not have it, so popular keys spread outward and hot spots cool down.",
    d: "When a lookup finds a value, the requester stores a copy on the nearest peer it queried that did not return it. Later lookups for the same key hit that cache earlier in their path. Cached copies get a shorter lifetime, roughly in proportion to their distance from the key. This reduces load on the true replicas for popular keys. It is hard because caches are not authoritative, so readers can receive stale data, and mutable values need either a short cache lifetime or a version check.",
    k: ["Caching along the path versus only at the replicas: path caching relieves hot keys without extra mechanism, but makes updates visible slowly.", "Expiry scaled by distance versus fixed: scaled expiry lets copies far from the key vanish soon, but needs each node to know the key's relative position."],
    p: ["Serving cached copies of a mutable record hands readers a version older than the publisher's latest update.", "A cache-writing request without validation lets anyone plant a value on nodes along the path."],
    v: "Fetch one key from many nodes and watch the replicas' request counters: the first reads hit them, later reads are served by path nodes and the load on the replicas falls.",
    dep: ["iterative-lookup", "record-expiry", "find-value-rpc"]
  },
  "iterative-lookup": {
    s: "The lookup in which the initiator itself repeatedly asks the closest contacts it knows for contacts closer to the target, until no closer ones are returned.",
    d: "The initiator seeds a shortlist with the closest nodes from its own table, queries several of them for nodes nearer the target, merges the replies into the shortlist, and repeats with the closest unqueried candidates. It stops when the closest known nodes have all answered. Each step at least halves the distance in a prefix-based space, so lookups take about log n steps. It is hard because replies come from strangers who may be dead, slow or lying, and the initiator carries all the state and traffic.",
    k: ["Iterative versus recursive forwarding: iterative gives the initiator control and lets it detect bad replies, but costs it a round trip per hop and exposes its address to everyone queried.", "Many queries per round versus few: more parallelism hides slow nodes but increases traffic and the load an attacker can induce."],
    p: ["Trusting the contacts in a reply lets a malicious node lead the lookup into a set of colluding peers.", "A lookup that is not bounded in rounds can run indefinitely against nodes that keep returning unreachable addresses."],
    v: "Run a lookup for a random target in a network of one thousand nodes and confirm it reaches the true closest node within the expected log-scale number of rounds, matching a full scan of the identifier list.",
    dep: ["shortlist", "parallel-queries", "find-node-rpc", "termination-rule", "k-buckets"]
  },
  "parallel-queries": {
    s: "Keeping a small number of requests in flight at once during a lookup so a slow or dead node does not stall progress.",
    d: "The lookup sends requests to alpha candidates simultaneously, and as each reply arrives sends another. A timeout frees a slot rather than ending the lookup. Alpha is small, commonly three, because each extra query multiplies traffic. Replies are folded into the shortlist as they arrive, so the fastest nodes drive the lookup. It is hard because parallelism makes the lookup nondeterministic, wastes queries on candidates that later prove farther than others, and magnifies traffic during attacks.",
    k: ["Higher alpha versus lower: higher alpha reduces tail latency under churn, but raises the number of requests per lookup roughly in proportion.", "Strictly ordered rounds versus continuous in-flight slots: rounds are easier to reason about, continuous slots do not wait for the slowest reply of a round."],
    p: ["Setting alpha high on every node in a large network multiplies background traffic and can resemble a flood.", "Counting in-flight requests incorrectly after a timeout lets the lookup stall below its parallelism or run away above it."],
    v: "Measure lookup latency with alpha of one and three with ten percent of nodes unresponsive, and confirm alpha three has a lower tail and about three times the queries per round.",
    dep: ["iterative-lookup", "adaptive-timeouts"]
  },
  "recursive-routing": {
    s: "A lookup in which each node forwards the request to the next closer node itself, so the query travels through the overlay and only the final answer returns.",
    d: "The initiator sends the request to its closest contact, which forwards it to its own closest contact to the target, and so on until a node responsible for the key replies, either directly to the initiator or back along the path. It uses fewer messages from the initiator and can exploit existing connections. It is hard because intermediate nodes hold state, any of them can silently drop or misroute the request, the initiator gets no view of progress, and replying directly requires an address the responder can reach.",
    k: ["Recursive versus iterative: recursive is lower latency per hop and saves the initiator's bandwidth, but makes failures invisible and hands control of the path to untrusted nodes.", "Reply direct versus along the path: direct replies are faster, but fail when the initiator is behind a translator that blocks the unsolicited reply."],
    p: ["A single dropping node on the path kills the lookup with no signal, and the initiator can only time out.", "Replying to the claimed source address of a request lets it be used to aim traffic at a third party."],
    v: "Route a lookup recursively across ten nodes, confirm it arrives at the closest node. Then drop messages at one node and confirm the initiator times out and retries through a different first hop.",
    dep: ["k-buckets", "rpc-layer", "ownership-rule"]
  },
  "shortlist": {
    s: "The sorted working set of candidate nodes in a lookup, ordered by distance to the target, tracking which have been queried, answered or failed.",
    d: "The shortlist holds the closest contacts known so far, capped at a fixed length. Each entry is marked untried, in flight, answered or failed. New contacts from replies are inserted by distance, and farther ones fall off the end. The next query goes to the closest untried entry. The final closest answered entries are the lookup result. It is hard because it is shared state that adversarial replies write into: an attacker can crowd it with entries just closer than honest ones.",
    k: ["Bounded shortlist versus unbounded: bounding keeps memory and work fixed, but a flood of bogus close entries can push out good ones.", "Accepting entries only from nodes already closer than the sender versus any reply: the stricter rule limits lies, but rejects honest replies when the responder knows only farther contacts."],
    p: ["Duplicate entries for one node under different addresses consume slots and distort the termination test.", "Marking an entry failed after a single timeout drops healthy nodes on a lossy link."],
    v: "Feed a lookup replies that include thousands of invented nearer identifiers and confirm the shortlist stays at its cap, and that the final result includes only nodes that actually responded.",
    dep: ["xor-metric", "contact-record"]
  },
  "termination-rule": {
    s: "The condition for ending a lookup: all of the k closest candidates have responded and a further round produced no closer nodes, or a deadline or query budget was exhausted.",
    d: "A lookup for nodes ends when the closest k entries of the shortlist are all queried and answered and no query in the last round returned a closer node. A lookup for a value ends early the moment one valid value arrives, or after enough replicas agree. A hard deadline and a cap on total queries prevent endless work against hostile or broken peers. It is hard because stopping too early returns incorrect closest sets, and stopping late costs latency; with churn, there is no moment where the result is exactly correct.",
    k: ["Stopping at the first value versus waiting for several replicas: the first value is fastest, a quorum protects against stale or forged values at the cost of more waiting.", "Exact closest set versus good enough: exactness helps placement of replicas, but costs rounds that readers do not need."],
    p: ["Terminating when the closest known node answers misses closer nodes that only a farther peer knew of.", "No query budget lets a lookup chase an endless stream of fresh fake contacts."],
    v: "Run lookups over a network of known membership and compare the returned closest set to the exact set from a full scan. Confirm the match rate meets the target and no lookup exceeds the query cap.",
    dep: ["shortlist", "iterative-lookup"]
  },
  "find-node-rpc": {
    s: "The request that asks a peer for the contacts it knows closest to a given target identifier. It is the basic step of every lookup.",
    d: "The request carries the target and the sender's identity and returns up to k contacts from the receiver's routing table nearest the target, each with identifier and address. It is stateless for the receiver: just a table read. A reply also tells the receiver the sender is alive, which can feed its table. It is hard because it is cheap to send and expensive to answer wrongly: it can be spoofed to amplify traffic, used to crawl the whole network, and its answers are unauthenticated hints, not facts.",
    k: ["Returning k contacts versus fewer: more contacts speed convergence, but give a crawler or attacker more of the table per request.", "Replying only to validated senders versus anyone: validation stops reflection abuse, but adds a round trip to every first contact."],
    p: ["A reply larger than the request sent to a spoofed source address turns the node into an amplifier.", "Returning contacts the node has never verified spreads dead or fake addresses to every asker."],
    v: "Send the request for a random target to a node and confirm it returns at most k contacts, all in its table, sorted closer to the target than the node itself in most cases.",
    dep: ["k-buckets", "rpc-layer", "contact-record"]
  },
  "find-value-rpc": {
    s: "The request that asks a peer for the value stored under a key, returning the value if held, or else the closest contacts as a find-node request would.",
    d: "The receiver checks its record store for the key. If it holds records it returns them, possibly with a token for later stores; if not it behaves like a find-node reply. A lookup for a value therefore converges toward the key and stops at the first replica that has it. Values can be large, so replies may be split or sent by stream. It is hard because there are two kinds of reply to distinguish, large replies are a reflection hazard, and a malicious node can answer every request with a fabricated value.",
    k: ["Returning the value in the same message versus pointing to it: inline replies save a round trip for small values, pointers avoid datagram size limits for large ones.", "Returning all stored entries versus a sample: all entries are complete but heavy on hot keys, sampling bounds work at the cost of repeated queries."],
    p: ["A node answering with a large value to an unvalidated source address amplifies traffic against that address.", "Accepting the first returned value without verification lets one attacker node answer for the key."],
    v: "Store a value, call the request on a replica and on a non-replica, and confirm the replica returns the value while the other returns closer contacts only.",
    dep: ["local-record-store", "find-node-rpc", "address-validation-tokens"]
  },
  "contact-record": {
    s: "The entry for one known peer: its identifier, network address and port, when it was last heard from, and counters for failures and round-trip time.",
    d: "Each contact stores the peer's identifier and one or more endpoints, the time of last successful exchange, whether the peer ever responded to a query of ours, the number of consecutive failures, and an estimate of round-trip time. These fields drive eviction, liveness probing and latency-aware choice. Contacts move between the routing table, replacement caches and the peer cache. It is hard because the address-to-identifier binding is only as trusted as the last exchange, and addresses change as peers move or restart.",
    k: ["Storing multiple addresses per peer versus one: multiple endpoints survive address changes and dual-stack, but make contact validation and dedup harder.", "Counting any message as proof of life versus only replies to our queries: any message is cheap and plentiful, but an attacker can forge it, whereas replies to our own queries show reachability."],
    p: ["Believing an identifier-to-address claim learned secondhand puts unverified contacts in the table.", "Never updating a contact's address after the peer moves leaves a live peer permanently marked dead."],
    v: "Contact a peer, kill it, and confirm its failure counter increments with each probe. Restart it on a new port and confirm the contact's address updates only after an authenticated exchange.",
    dep: ["node-id-assignment", "rtt-measurement"]
  },
  "k-buckets": {
    s: "The routing table's units: for each distance range from the node's own identifier, a list of at most k contacts, so nearby space is well covered and far space sparsely.",
    d: "Contacts are grouped by the position of the highest differing bit, or other distance range, between their identifier and the node's own. Each bucket holds up to k entries ordered by last contact. Close ranges contain few possible peers, so they stay populated; far ranges contain many possibilities, so only a sample is kept. This gives about log n buckets in use and a guarantee that some contact exists in every range that has any node. It is hard because contents are controlled by who contacts you, and buckets fill with whoever arrives first.",
    k: ["Fixed-size buckets versus size growing with distance: fixed buckets bound memory and make analysis simple, larger buckets near the node improve resilience to loss of close neighbors.", "Ordering by last-seen versus by distance within the bucket: last-seen favors reliable long-lived peers, distance order gives sharper routing but ignores stability."],
    p: ["A bucket filled with the first peers to contact the node leaves no room for better or more honest ones.", "Too small a k in a high-churn network makes whole ranges empty after a few departures."],
    v: "Inspect a node's table in a network of ten thousand: confirm about log2 of the population buckets are occupied, none holds more than k, and each occupied range contains only contacts at the right distance.",
    dep: ["contact-record", "xor-metric", "bucket-splitting", "bucket-eviction"]
  },
  "bucket-splitting": {
    s: "Dividing a bucket into two when it is full and covers the node's own identifier, so the nearest part of the space gets finer-grained coverage.",
    d: "The table starts as one bucket covering the whole space. When it fills and its range includes the node's own identifier, it splits into two halves and the contacts are redistributed. A full bucket that does not cover the node is never split, so far ranges stay coarse. Repeated splits near the node build a table that gets finer as distance shrinks. The advantage is that the node knows every peer in its neighborhood. It is hard because splitting rules differ between designs, with some also splitting a bucket on other conditions to keep more neighbors, which then affects load on those neighbors.",
    k: ["Splitting only the bucket containing the node's own range versus splitting any full bucket: restricted splitting keeps the table small, broader splitting adds contacts and routing choice at higher memory and probing cost.", "Lazy tree of buckets versus fixed array by bit position: a lazy tree handles unbalanced identifier distributions, a fixed array is simpler and faster."],
    p: ["Splitting incorrectly when the node's identifier is not in the bucket makes a table that grows without bound.", "Unbalanced identifier distributions, such as attackers choosing near ones, make one subtree consume the whole table budget."],
    v: "Add thousands of random contacts to an empty table and confirm the number of buckets grows to about log2 of the contact count, with every contact in the bucket whose range it belongs to.",
    dep: ["k-buckets", "id-space"]
  },
  "bucket-eviction": {
    s: "The rule for what happens when a new contact belongs in a full bucket: keep the old one unless it fails a liveness check, rather than replacing it automatically.",
    d: "When a contact arrives for a full bucket, the node pings the least recently seen existing contact. If it responds, it stays and the newcomer is placed in the replacement cache; if not, it is evicted and the newcomer takes its place. This favors old contacts because the longer a peer has been up, the longer it is likely to remain up. It also resists flooding by newcomers. It is hard because it assumes that peer lifetimes are heavy-tailed, and it makes it slow for a truly new, better-connected peer to enter a long-filled bucket.",
    k: ["Old-contact preference versus newest-contact preference: favoring old nodes yields stable routes and resists flooding, but can keep a bucket full of slow or misdirected peers.", "Probing before eviction versus evicting on a timer: probing avoids dropping live peers, but needs a round trip and logic for the probe's outcome."],
    p: ["Evicting without probing lets an attacker flush the table by sending a stream of fresh contacts.", "Never evicting responsive but very slow peers leaves lookups routinely waiting on them."],
    v: "Fill a bucket, then add newcomers while the oldest contact stays responsive and confirm the table is unchanged and newcomers are cached. Stop the oldest contact and confirm it is replaced.",
    dep: ["k-buckets", "liveness-probes", "replacement-cache"]
  },
  "replacement-cache": {
    s: "A small list per bucket of recently seen contacts that did not fit, kept ready to take the place of a bucket entry that dies.",
    d: "When a bucket is full and a valid new contact arrives, it is placed in the bucket's replacement cache rather than discarded. When a bucket member is declared dead, the most recently seen cached contact is promoted. This keeps buckets near full even under churn without needing a new lookup to refill them. It is hard because cached contacts are unverified in a lasting sense: they may have left by the time they are needed, so they must be probed before promotion, and the cache is a place for an attacker to queue many identities.",
    k: ["Keeping a replacement cache versus discarding overflow: a cache refills buckets immediately after failures, at the price of memory and stale entries.", "Promoting most recent versus longest-lived cache entries: most recent is more likely alive now, longest-lived is more likely to stay alive."],
    p: ["Promoting a cached contact without probing first puts a dead peer straight back into the table.", "An unbounded cache lets an attacker pre-queue identities to take over buckets as honest peers fail."],
    v: "Fill a bucket and its cache, kill a bucket member, and confirm that on detection a live cached contact is probed and promoted, and the bucket stays full.",
    dep: ["k-buckets", "contact-record"]
  },
  "bucket-refresh": {
    s: "Periodically performing a lookup for a random identifier in each bucket that has been idle, so the table stays populated and stale entries are found.",
    d: "Each bucket records when it last saw activity. If none for an interval such as an hour, the node picks a random identifier in that bucket's range and looks it up, which contacts nodes in that range and refreshes the bucket from their replies. This catches silent decay in ranges the node never otherwise queries. The cost is a steady trickle of lookups whose rate scales with the number of buckets. It is hard to set the interval: too long and the table rots, too short and the maintenance traffic dominates the node's budget.",
    k: ["Refreshing only idle buckets versus all on a timer: idle-only avoids needless traffic where ordinary lookups already keep contacts fresh, timer-based is simpler and uniform.", "Random target in the range versus a known contact: a random target explores new peers, probing known contacts only verifies the ones already held."],
    p: ["Skipping refreshes on a rarely used node leaves far buckets full of dead contacts, so its first real lookup is slow.", "Many nodes sharing one refresh interval and phase create synchronized bursts of lookups."],
    v: "Leave a node idle for several intervals while peers churn, and confirm that refresh lookups occur per idle bucket and the fraction of live contacts in its table remains above the target.",
    dep: ["iterative-lookup", "k-buckets"]
  },
  "table-persistence": {
    s: "Saving the routing table's contacts to disk and reloading them at start so a node does not begin from nothing.",
    d: "Periodically and at shutdown the node writes its contacts, with their last-seen times and identifiers, to a file. At startup it reads the file, drops entries that are too old, and probes the remainder, inserting those that answer. This is the main source of contacts for a returning node and avoids dependence on bootstrap servers. It is hard because contacts decay: after a day offline a large fraction are gone, saved addresses of mobile peers change, and the file is attacker-writable if the machine is compromised.",
    k: ["Probing every saved contact on start versus trusting saved ones: probing gives a clean table at the price of a startup burst, trusting is fast but fills the table with dead entries.", "Storing the whole table versus a few best contacts: the whole table restores routing precisely, a short list is smaller but needs a lookup to rebuild."],
    p: ["Reloading week-old contacts without probing builds a table of mostly dead peers and slow first lookups.", "A saved list that includes only the node's neighbors from one area makes its restart vulnerable to a local eclipse."],
    v: "Run a node, stop it for ten minutes, restart it, and confirm it rejoins from the saved file alone with no bootstrap contact, with a table fill within a few percent of before.",
    dep: ["contact-record", "disk-persistence"]
  },
  "id-space": {
    s: "The fixed set of identifiers shared by nodes and keys, typically all fixed-width bit strings, which gives the overlay one coordinate system for placement and routing.",
    d: "Identifiers are fixed-length values, commonly 160 or 256 bits, drawn from the output range of a hash function so that they are spread uniformly. Both node identifiers and keys live in the same space, so a key's location is a node-like position. The width is large enough that collisions are negligible and that identifier choice cannot be exhausted. It is hard because everything that assigns identifiers must agree on the width and encoding forever, and uniformity is only a statistical assumption that an attacker can violate by picking identifiers deliberately.",
    k: ["Wide identifiers versus narrow: wide ones make collisions and brute-force negligible, narrow ones are cheaper in messages and tables.", "One shared space for nodes and keys versus separate spaces: one space makes responsibility automatic, but ties node placement and data placement to one rule an attacker can target."],
    p: ["Changing the identifier width after deployment forks the network, since old nodes cannot interpret new identifiers.", "Assuming a uniform distribution when identifiers are attacker-chosen skews buckets and load."],
    v: "Generate one million identifiers from the assignment rule and confirm they are uniform across the space by bucketing the leading bits, and that there are no collisions.",
    dep: ["key-hash"]
  },
  "key-hash": {
    s: "The cryptographic hash that turns names, content and public keys into keys of the identifier width, spreading load evenly and making placement unpredictable to the unprepared.",
    d: "A collision-resistant hash maps arbitrary input to a fixed-length digest used directly as the key or node identifier. Uniform output spreads keys and nodes evenly across the space, balancing load. Using a cryptographic hash also means no one can easily craft an input with a chosen digest. It is hard because the hash choice is permanent for the network, a weakness discovered later undermines both content verification and identifier assignment, and cheap hashing makes brute-force placement of identifiers feasible.",
    k: ["A well-studied hash versus a fast non-cryptographic one: cryptographic hashes resist forged collisions and targeted placement, at the cost of CPU on very large volumes.", "Hashing once versus hashing with a salt or iteration: extra work makes brute-forcing identifiers near a target costlier, but cannot be used where all parties must derive the key independently."],
    p: ["A hash with known collision attacks lets someone craft two different values under one key.", "A different byte encoding of the input before hashing yields different keys for the same name in different clients."],
    v: "Hash standard test vectors in the implementation and compare to published digests, then check that one million random names produce keys with a uniform leading-bit distribution.",
    dep: []
  },
  "node-id-assignment": {
    s: "How a node gets its identifier: random choice, a hash of its public key, or a hash of its address, each with different effects on stability and attack resistance.",
    d: "A random identifier is simple but lets a node pick any position. A hash of the node's public key ties the identifier to a key pair, so the node can prove ownership and cannot choose its position freely. A hash of the network address ties it to where it is reachable, which resists some placement attacks but changes whenever the address does. Some designs add a puzzle so identifiers are costly to produce. It is hard because the rule must prevent an attacker from choosing an identifier near a target, while still allowing a node to keep its identifier across restarts.",
    k: ["Self-chosen random identifiers versus key-derived: random choice is trivial and cheap, key derivation allows proof of ownership and signed messages but still lets an attacker grind keys for a chosen prefix.", "Address-derived versus key-derived: address binding resists placement attacks, but breaks when a node moves, and shared addresses behind translators collide."],
    p: ["Letting nodes choose any identifier lets an attacker place a node adjacent to any key and eclipse it.", "A derivation that changes the identifier on each address change keeps the node from holding any stable responsibility."],
    v: "Start a node twice with the same key and confirm it derives the same identifier, then try to join with an identifier that does not match its key and confirm peers reject it.",
    dep: ["id-space", "key-hash"]
  },
  "xor-metric": {
    s: "A distance function that is the bitwise exclusive-or of two identifiers read as an integer. It is symmetric, and for a given point and distance there is exactly one other point.",
    d: "The distance between two identifiers is their XOR taken as a number. It is zero only for identical values, symmetric, and satisfies the triangle inequality. Its key property is unidirectionality: for any point and any distance, exactly one point lies at that distance, so lookups for a key converge to the same nodes from every direction. Symmetry also means a node learns about nodes that query it, which are the nodes that have it in their tables. It is hard to see geometrically since it is not a smooth distance, but the prefix structure it gives is what makes buckets work.",
    k: ["XOR versus ring distance: XOR is symmetric, so incoming queries teach a node about useful peers, but it has no notion of a successor, so range queries and ordering are not natural.", "Metric on the full identifier versus on a prefix: the full identifier gives a total ordering for the closest set, a prefix match is cheaper but leaves ties."],
    p: ["Mixing XOR distance for routing with numeric difference for ownership picks different nodes in different places.", "Comparing identifiers as byte arrays with the wrong endianness breaks the ordering."],
    v: "Test that distance is zero only for equal values, symmetric, and that for ten thousand random pairs and a third point the triangle inequality holds. Confirm there is one point per distance.",
    dep: ["id-space"]
  },
  "ring-metric": {
    s: "A distance that treats the identifier space as a circle and measures clockwise distance to a successor, used by designs where each key belongs to the next node around the ring.",
    d: "Identifiers are placed on a circle and distance is measured by how far one must go in one direction to reach the other. Each key belongs to its successor, the first node at or after it. Each node keeps pointers to its successor and predecessor plus a set of fingers at exponentially increasing distances. Lookups jump to the farthest finger not passing the key. It is hard because the ring must be kept correct under joins and failures through a stabilization routine, and the distance is asymmetric, so nodes cannot learn routes from the queries they receive.",
    k: ["Ring distance versus XOR: the ring gives simple ordered ownership and range scans, but asymmetric distance means routing state is built only by explicit maintenance.", "One successor versus a successor list: a list keeps the ring connected through several failures, at the cost of keeping more pointers fresh."],
    p: ["A ring with one successor pointer breaks when that node fails before stabilization repairs it.", "Skipping periodic stabilization leaves stale fingers, so lookups loop or miss the right node."],
    v: "Build a ring of one hundred nodes, remove ten at random, wait one stabilization period and confirm that every node's successor is correct and lookups for random keys reach the true owner.",
    dep: ["id-space"]
  },
  "ownership-rule": {
    s: "The definition of which nodes are responsible for a key: the k nodes nearest to it under the distance metric, or the key's successor on a ring.",
    d: "The rule turns the geometry into a responsibility assignment. For a prefix metric, a key belongs to the k nodes whose identifiers are closest to it; on a ring, to the successor and the following few. Publishers, readers and replica maintenance all use the same rule, so they meet without a directory. Nodes use it to decide whether to accept a store and to hand data over when the answer changes. It is hard because each node knows the owner set only approximately, so nodes disagree at the boundary and responsibilities overlap or have gaps during churn.",
    k: ["Strict ownership checks versus accepting any store: strict checks keep data where readers look, but reject honest stores while the node's view is imperfect.", "Overlapping responsibility versus a single owner: overlap tolerates disagreement and failures, a single owner is simpler but a point of failure."],
    p: ["Nodes with different views of the closest set disagree, so records live on nodes readers never ask.", "Treating the owner set as fixed ignores that it moves with each arrival."],
    v: "For random keys, compute the true owner set from the full membership and compare it with what lookups return and with the nodes actually holding replicas. Confirm agreement at the target rate.",
    dep: ["xor-metric", "id-space"]
  },
});
