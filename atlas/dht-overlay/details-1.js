// Details for the DHT overlay plate, part 1: client interface, overlay services, operations, value storage.
ATLAS.details("dht-overlay", {
  "put-get-api": {
    s: "The dictionary-style interface applications call to store a value under a key and fetch it back, with asynchronous results and explicit failure and partial-result outcomes.",
    d: "The API accepts a key and a value for a put, and a key for a get. Behind it, the node runs a lookup to find the responsible peers, sends store or fetch requests, and reports how many replicas acknowledged or which values came back. Calls complete later through callbacks or futures because lookups take many round trips. It is hard because the usual dictionary promises do not hold: a get may return nothing for a key that exists, several different values, or an old value, and the caller cannot tell which.",
    k: ["Dictionary semantics versus explicit outcome reporting: simple code is tempting, but only reporting replica counts and partial results lets applications decide whether to retry.", "Blocking calls versus callbacks: blocking is easier to use but ties up threads for seconds when peers are slow."],
    p: ["Treating a successful put as durable when only one replica acknowledged leaves the value lost at the next departure.", "Treating an empty get as proof the key does not exist hides lookups that merely ran out of time."],
    v: "Put a value from one node, fetch it from a node on another network, and confirm the result reports the number of replicas reached. Stop half the replicas and confirm the get still succeeds.",
    dep: ["iterative-lookup", "key-derivation", "k-closest-replication", "async-request-handles"]
  },
  "key-derivation": {
    s: "The rule that turns an application's name, content or public key into a fixed-size key in the identifier space, so every node computes the same key for the same thing.",
    d: "Applications rarely choose raw keys. A key is typically the hash of a human-readable name, of the content itself, or of a public key plus an optional label. All parties must agree on the exact byte encoding, hash function and any salt, or they will look in different places. Derivation also decides who can write: a key derived from a public key lets only the key holder publish there. The hard part is that keys are public and predictable, so an attacker can compute which nodes will be responsible for a target key.",
    k: ["Hashing names directly versus adding a secret or rotating salt: direct hashing makes lookup trivial but lets attackers pre-position nodes next to a chosen key.", "Deriving keys from public keys versus from content: public-key keys allow updates under one address, content keys give integrity but every change produces a new key."],
    p: ["Two implementations normalizing a name differently (case, trailing separator) silently publish to different keys.", "A predictable key for a popular name concentrates both traffic and attack effort on the same few nodes."],
    v: "Derive the key for the same input in two independent implementations and compare the resulting bytes. Then look up that key and confirm both reach the same set of closest nodes.",
    dep: ["key-hash", "id-space"]
  },
  "content-addressed-values": {
    s: "Values stored under the hash of their own bytes, so any reader can verify what it received without trusting the node that served it.",
    d: "The key is the digest of the value. A fetching node recomputes the digest and rejects anything that does not match, which makes it immune to forged or corrupted copies from any peer. Values cannot change; a new version is a new key, and something else must tell readers which key is current. Large objects are split into chunks addressed by hash, with a small root record listing the chunk keys. The difficulty is that integrity does not give availability: a verifiable value can still be absent, and each chunk is a separate lookup.",
    k: ["Immutable hash-keyed values versus mutable keyed values: immutability gives free verification and safe caching, but updates need a second mechanism to point at the latest version.", "Small chunks versus large chunks: small chunks spread load and resume cheaply, but multiply lookups and metadata."],
    p: ["Serving a value without checking the digest lets one malicious replica poison caches along the path.", "A large object with one chunk on a departed node is unreadable even though the other chunks are healthy."],
    v: "Store a value, corrupt one byte on a replica's disk, fetch it, and confirm the reader rejects the bad copy and obtains a correct one from another replica.",
    dep: ["key-hash", "find-value-rpc"]
  },
  "signed-mutable-records": {
    s: "Values that can be updated in place because they carry a sequence number and a signature from the key that owns the storage location.",
    d: "The record sits under a key derived from a public key. Each update carries a higher sequence number and a signature over the value and number. Storing nodes verify the signature, accept only newer sequences, and replace the old record. Readers query several replicas and take the highest valid sequence. This gives updates without a central authority. It is hard because there is no global order: replicas can hold different versions after a partition, and a stolen private key lets an attacker overwrite forever.",
    k: ["Sequence numbers versus timestamps: sequences need no clock agreement, but a publisher that loses its counter cannot safely resume.", "Compare-and-swap on the previous sequence versus last-writer-wins: compare-and-swap catches concurrent writers, but costs an extra read and fails under churn."],
    p: ["A publisher republishing an old record with a high sequence it saved earlier rolls the value back for readers.", "Nodes that skip signature checks accept forged overwrites and spread them to other replicas."],
    v: "Publish version 1 and version 2 from one key, then offer version 1 again to a replica and confirm it is refused. Offer version 3 signed by a different key and confirm it is rejected.",
    dep: ["signed-messages", "value-signature-checks", "record-validation", "key-derivation"]
  },
  "async-request-handles": {
    s: "The objects returned by an operation that let a program await, cancel or observe a lookup or store while many are in flight at once.",
    d: "A handle represents one outstanding put, get or lookup. It carries progress such as contacts queried, replicas reached and values found so far, and supports cancellation and deadlines. Internally the node keeps a table of active operations, each holding its shortlist and pending requests, and routes incoming responses to them by transaction identifier. The challenge is lifecycle: operations are long, producers of results are remote strangers, and a handle abandoned by the caller must still release sockets, memory and pending timers.",
    k: ["Streaming partial results versus one final result: streaming lets an application act on the first answer, but consumers must handle duplicates and late conflicting values.", "Per-operation deadlines versus global limits: deadlines give predictable latency, global limits protect the node when thousands of operations run at once."],
    p: ["Handles never cancelled or timed out accumulate pending state until the node runs out of memory.", "A late response delivered to a completed handle reaches a reused identifier and corrupts an unrelated lookup."],
    v: "Start one hundred gets, cancel half, and confirm the node's active operation count and timer count fall to zero within the deadline with no stray callbacks.",
    dep: ["rpc-layer", "transaction-ids"]
  },
  "multi-value-keys": {
    s: "Allowing many publishers to store different values under the same key, so the key names a set, such as all providers of one item, rather than a single value.",
    d: "Instead of replacing the value for a key, each publisher adds an entry tagged with its own identity and expiry. A get returns a bounded sample of the set. Storing nodes cap the set size and age out entries individually. This suits indexes where many parties announce themselves under a shared name. It is hard because a popular key becomes huge and hot: every replica must hold and serve it, and the cap forces a choice of which entries to keep, which an attacker can manipulate by flooding.",
    k: ["Bounded sets with random sampling versus complete sets: bounding keeps load predictable but readers never see everything and must query more than once.", "Per-entry expiry versus per-key expiry: per-entry lets one publisher leave without affecting others, at the cost of more state to track."],
    p: ["An attacker fills a popular key's capacity with junk entries so honest publishers are refused.", "Returning the same first entries to every reader overloads those few publishers."],
    v: "Have fifty nodes announce under one key with a cap of twenty. Confirm a get returns at most twenty entries, that different readers see different subsets, and that an entry disappears after its expiry.",
    dep: ["local-record-store", "storage-quotas", "record-expiry"]
  },
  "peer-discovery-index": {
    s: "A key that stands for a group, such as one swarm or channel, under which members announce their network addresses so newcomers can find each other without any tracker.",
    d: "Members periodically store their address under a key derived from the group identifier. A joiner computes the same key, runs a lookup, and receives a sample of current members, then connects directly. Announcements carry short lifetimes so departed members fade out. It replaces a central server with the overlay. It is hard because the index is unauthenticated by default: an attacker can announce many fake addresses or addresses of a third party, and the nodes holding a popular key take disproportionate load.",
    k: ["Announcing periodically versus on change only: periodic announcements survive replica loss and self-clean, but cost steady traffic proportional to group size.", "Sampling a few members versus returning all: samples keep responses small and spread load, but small groups can look empty to an unlucky reader."],
    p: ["Fake announcements pointing at a victim's address make newcomers connect to it, turning the index into an attack tool.", "A very large group concentrates announce traffic on the few nodes nearest the key."],
    v: "Announce twenty nodes under one group key, then start a fresh node knowing only a bootstrap contact and confirm it discovers and connects to at least one member within the lookup time.",
    dep: ["multi-value-keys", "provider-records", "self-lookup-join"]
  },
  "name-resolution": {
    s: "Mapping a name to a record of addresses or keys by publishing and fetching it through the overlay, with ownership proven by a signature rather than a registrar.",
    d: "A name or a public key hashes to a key, and the owner stores a signed record there containing addresses, further keys or metadata. Resolvers look up the key, verify the signature and check expiry. Names that are human-readable need an additional rule for who may claim them, since the overlay itself has no registry. It is hard because first-come naming invites squatting, records must be republished by the owner or vanish, and resolution depends on lookups being both fast and correct under attack.",
    k: ["Self-certifying names (hash of a key) versus human-readable names: self-certifying names need no registry but are unmemorable; readable names need a separate claim and dispute scheme.", "Short record lifetimes versus long: short lifetimes make changes propagate quickly but require the owner to stay online."],
    p: ["Owner goes offline past the record lifetime and the name stops resolving even though nothing was revoked.", "A resolver that accepts the first answer lets one malicious replica redirect a name."],
    v: "Publish a signed address record, resolve it from three nodes, then update it and confirm resolvers see the new record. Forge a record with a different signer and confirm it is rejected.",
    dep: ["signed-mutable-records", "key-derivation", "record-expiry"]
  },
  "provider-records": {
    s: "Small entries saying that a particular node holds a particular piece of content, stored under the content's key so seekers find holders rather than the data itself.",
    d: "Instead of storing large values on the nodes closest to a key, the overlay stores a pointer: the key's closest nodes record which peers claim to hold the content and how to reach them. A seeker runs a lookup, gets provider entries and then fetches the content directly from a provider. Providers must refresh their announcements before expiry. This keeps overlay storage tiny and moves bulk transfer off the overlay. The hard part is trust: a pointer does not prove the provider has the data, only content addressing at fetch time does.",
    k: ["Storing pointers versus storing data on the closest nodes: pointers keep the overlay light and fast, but each fetch needs a second connection that may fail.", "Short provider lifetimes versus long: short lifetimes remove departed providers quickly but force frequent re-announcement for every item held."],
    p: ["A node holding millions of items cannot re-announce all of them within the lifetime, so most pointers expire.", "Providers announced by attackers waste seekers' time with connections that return nothing."],
    v: "Announce one item from node A, look it up from node B, confirm the response lists A's address, connect to A and verify the fetched bytes hash to the key.",
    dep: ["multi-value-keys", "content-addressed-values", "publisher-republish"]
  },
  "rendezvous-points": {
    s: "A key used as a meeting place where two peers who cannot reach each other directly leave and collect connection information, often to set up NAT traversal.",
    d: "Both peers derive the same key from a shared secret or session identifier. One stores its address candidates there; the other fetches them and connects, or both exchange candidates in turn. The node responsible for the key acts as a passive mailbox, and may also relay a short signaling exchange. This supports calls, file transfers and any pairing where addresses are not known in advance. It is hard because the mailbox is an observable point: the responsible node learns who is meeting whom, and entries must be timely or the NAT bindings they describe expire.",
    k: ["Keys from a shared secret versus from public identities: secrets hide who is meeting from observers, but need an out-of-band exchange first.", "Mailbox only versus active signaling: a mailbox is simple and stateless, active relaying is faster but ties a node to a conversation."],
    p: ["Stale candidate addresses lead the second peer to punch toward bindings that closed minutes ago.", "The mailbox node can record every pairing and who asked for it."],
    v: "Place two nodes behind separate translators, have them rendezvous on a shared key, and confirm they exchange candidates and establish a direct connection with no prior address knowledge.",
    dep: ["multi-value-keys", "hole-punching", "external-address-discovery"]
  },
  "topic-pubsub": {
    s: "Publish-subscribe built on the overlay: a topic key names the group, subscribers register near it, and messages fan out along a tree rooted at the topic's responsible node.",
    d: "Subscribers route a join request toward the topic key; each node on the path records the previous hop as a child, forming a tree. Publishers route a message to the root, which forwards it down the tree. Nodes prune children that stop responding and rebuild branches through fresh lookups. This reuses the routing table for group multicast without a separate membership service. It is hard because interior nodes carry forwarding load for others, the root is a hot spot and a single point of failure, and tree repair under churn loses messages.",
    k: ["Tree multicast versus flooding to all subscribers from the root: trees spread forwarding cost, but a failed interior node cuts off its whole subtree until repair.", "Soft-state subscriptions with periodic renewal versus explicit leave: renewal self-heals after crashes, but costs steady control traffic."],
    p: ["A popular topic's root node is overwhelmed because everything routes through it.", "A malicious interior node silently drops messages for the whole subtree beneath it."],
    v: "Subscribe one hundred nodes to a topic, publish ten messages, then stop an interior node and confirm all subscribers resume receiving after the repair interval with a count of lost messages reported.",
    dep: ["iterative-lookup", "k-buckets", "liveness-probes"]
  },
  "service-announcements": {
    s: "Entries advertising that a node offers some service, such as relaying or storage, so other nodes can find capable peers without a central directory.",
    d: "Providers publish a record under a key for a service class, listing their address, capacity and optionally a signature or proof of capability. Clients look up that key and choose providers, often by measuring them. The records follow the same expiry and refresh rules as other entries. This is how overlays find relays, bootstrap helpers and storage hosts. It is hard because advertisements are self-reported: nothing stops a node overstating capacity, and clients must measure rather than trust.",
    k: ["Trusting advertised capacity versus probing providers: trusting is cheap, probing catches liars but adds latency and load on the providers.", "One key per service class versus keys per region: a single key is simpler, regional keys keep results nearby but fragment small services."],
    p: ["Many clients choose the same advertised best provider and overload it.", "Malicious nodes advertise as relays to observe or disrupt the traffic sent through them."],
    v: "Announce relay capacity from five nodes with different true capacity, look up the service key and confirm a client's probing ranks them by measured throughput rather than the advertised value.",
    dep: ["multi-value-keys", "relay-fallback", "rtt-measurement"]
  },
  "node-parameters": {
    s: "The tunable values that define a node's behavior: bucket size, query parallelism, timeouts, expiry and refresh intervals, and storage limits.",
    d: "Parameters are fixed in the protocol specification or exposed in configuration. Some must match across the network, such as the identifier width and bucket size, because nodes assume each other's values; others are local, such as timeouts and storage caps. Defaults come from analysis of expected churn and measured deployments. The difficulty is that they interact: raising parallelism lowers latency but raises traffic and amplifies attacks, and refresh intervals trade freshness against background load that scales with network size.",
    k: ["Network-wide constants versus locally tuned values: constants keep behavior predictable and analyzable, local tuning adapts to hardware but can make a node a poor neighbor.", "Static defaults versus adaptive parameters: adaptive values respond to measured churn, but a bug or attack can drive them to extremes."],
    p: ["One implementation using a different bucket size or expiry makes records vanish early or tables fill wrongly for its neighbors.", "A copied configuration with aggressive refresh turns every node into a source of constant background traffic."],
    v: "Change one parameter on a test node, restart it, and confirm from its statistics that the effective value is in use. Confirm the node still interoperates with nodes running the defaults.",
    dep: []
  },
  "node-statistics": {
    s: "Counters and gauges a node keeps about its own behavior: table size, lookup success and latency, stored records, and traffic by message type.",
    d: "Each subsystem increments counters as it works: queries sent, timeouts, bucket fill, records held, bytes by direction, and results of lookups. A local interface exposes them to the operator and optionally to a collector. Histograms of lookup time and hop count are the most useful measures. It is hard because the node sees only its own view, which is biased: it cannot see lookups that other nodes failed, and averages hide the long tail that users actually feel.",
    k: ["Local counters only versus reporting to a collector: local-only keeps privacy and avoids a central dependency, collectors give a network view at the cost of trust and bandwidth.", "Histograms versus averages: histograms expose tail latency, at the cost of more memory and bookkeeping per metric."],
    p: ["Reporting average lookup latency hides that one lookup in twenty takes more than a minute.", "Statistics that include remote peers' addresses leak who the node talks to when shared."],
    v: "Run a known workload of one thousand lookups and confirm the counters show one thousand lookup starts, a plausible success count, and a latency histogram whose median matches independently timed lookups.",
    dep: ["iterative-lookup", "k-buckets"]
  },
  "network-crawler": {
    s: "A tool that walks the overlay by querying every node it learns about, to count nodes, map their versions and addresses and measure churn.",
    d: "The crawler starts from bootstrap contacts and repeatedly asks each node for its closest contacts to different targets, so that it eventually enumerates nearly every bucket of every reachable node. Repeated crawls give session lengths and population over time. Operators use it to measure health, and attackers use the same technique to map targets. It is hard because crawling is itself heavy traffic, nodes behind translators cannot be reached, and a crawl takes minutes, during which the network changes.",
    k: ["Complete crawl versus sampling: a crawl gives exact numbers but loads the network and gets stale mid-run, sampling is cheap but has to be modeled statistically.", "Allowing unauthenticated contact queries versus restricting them: open queries make the network observable and debuggable, and also easy to surveil."],
    p: ["A crawl counts only publicly reachable nodes and so undercounts the real population several times over.", "Aggressive crawling looks like an attack and gets the crawler's addresses blocked."],
    v: "Crawl a test network with a known number of nodes and confirm the crawler's reachable count matches within a small margin, with unreachable nodes reported separately.",
    dep: ["find-node-rpc", "k-buckets"]
  },
  "simulation-harness": {
    s: "A deterministic environment that runs thousands of virtual nodes with modeled latency, loss, churn and attackers, so protocol changes can be evaluated before deployment.",
    d: "Nodes run the real protocol logic over a simulated clock and network. A scenario defines population, join and leave processes, link delays, and adversary behavior. The harness records lookup success, hops, latency and traffic. Because it is deterministic with a seed, failures are repeatable. It is hard because results depend on the realism of the churn and latency models, and a protocol tuned to a simulator's assumptions can fail on the real Internet, where behavior has heavy tails.",
    k: ["Real protocol code in simulation versus a separate model: running the real code finds actual bugs, but needs the code to be written against an abstract clock and network.", "Measured churn traces versus synthetic distributions: traces are realistic but specific to one network, synthetic distributions are portable but may miss the tail."],
    p: ["A simulation with uniform latency hides the effect of a few very slow nodes on tail lookups.", "Scenarios that never include attackers certify defenses that do not exist."],
    v: "Run the same scenario twice with one seed and confirm byte-identical results. Then simulate fifty percent node loss and confirm the lookup success rate matches the analytical expectation within a few percent.",
    dep: ["iterative-lookup", "churn-estimation", "node-parameters"]
  },
  "protocol-versioning": {
    s: "How nodes advertise and negotiate protocol versions and features so that old and new software coexist while the network upgrades gradually.",
    d: "Messages or handshakes carry a version number and a set of supported features. A node uses the lowest common behavior with each peer and ignores unknown fields instead of rejecting them. Changes that affect the shared geometry, such as identifier width or distance metric, cannot be negotiated per peer and need a flag day or a new network. This is hard because nothing can force strangers to upgrade, and old nodes remain for years.",
    k: ["Ignoring unknown fields versus strict parsing: tolerance lets features roll out gradually, but also lets malformed messages through and hides bugs.", "Per-peer feature negotiation versus network-wide versions: negotiation allows a gradual rollout, but only for features that do not change shared structure."],
    p: ["A change to record expiry that old nodes do not honor makes data disappear or persist differently across the network.", "Rejecting unknown versions fragments the network into groups that cannot see each other."],
    v: "Connect a node running the new version to one running the previous version and confirm lookups and stores succeed in both directions, with the new feature disabled for that pair.",
    dep: ["wire-format"]
  },
  "local-record-store": {
    s: "The table in which a node holds the key-value records it is responsible for, indexed by key and carrying publisher, timestamp and expiry metadata.",
    d: "Incoming store requests that pass validation are written to a map from key to one or more records. Each record has its origin, received time and expiry. Reads serve find-value requests, and periodic scans find records due for republishing or removal. The store is usually in memory with optional persistence. It is hard because its contents are controlled by strangers: its size, key distribution and write rate are all attacker-influenced, so every structure needs hard bounds.",
    k: ["Memory-only versus persistent storage: memory is fast and simple but loses everything on restart, persistent storage keeps replicas through crashes at the cost of write load and recovery logic.", "One record per key versus a set per key: single values are simple and replaceable, sets support shared indexes but need per-entry accounting."],
    p: ["No limit on keys per publisher lets one peer fill the store with unique keys.", "Records scanned for expiry only at read time leave dead data occupying memory indefinitely."],
    v: "Store ten thousand records, restart the process, and confirm the number recovered matches the persistence design. Confirm an expired record is gone from both the read path and the memory total.",
    dep: ["record-validation", "storage-quotas", "record-expiry"]
  },
  "record-validation": {
    s: "The checks a node applies to every incoming store request before keeping a record: size, signature, key placement, sequence order and rate.",
    d: "On receipt, the node checks that the record is well formed and within size limits, that its signature verifies when one is required, that for a signed record the sequence number is newer, and that the sender's identity and address are plausible. It may also check that this node is among the closest to the key. Only then is the record accepted. It is hard because validation must be cheap enough to run on every request, since signature checks are a CPU attack surface, and strict enough that junk does not propagate to other replicas.",
    k: ["Verifying every signature on arrival versus lazily on read: eager verification keeps bad data out entirely, lazy verification saves CPU on records nobody reads.", "Requiring the node to be among the closest versus accepting any store: closeness checks stop misplaced data, but make a node reject legitimate stores while its view of the neighborhood is stale."],
    p: ["Accepting stores for keys far from the node lets attackers use it as free general storage.", "An expensive signature algorithm with no rate limit lets a flood of bogus stores exhaust the CPU."],
    v: "Send a store with a bad signature, an oversized value, a stale sequence and a valid record. Confirm only the valid record is stored and each rejection is counted with its reason.",
    dep: ["value-signature-checks", "ownership-rule", "rate-limiting"]
  },
  "storage-quotas": {
    s: "Limits on how many records, bytes and keys a node will hold in total and per publisher or per source address.",
    d: "The node tracks usage globally and per origin, using the publisher's identifier or network prefix as the accounting key. A store that would exceed a quota is refused or triggers eviction of lower-value entries. Quotas protect the node from being filled by one peer and keep the footprint predictable on small devices. They are hard because the origin is weakly authenticated: an attacker with many addresses or identifiers evades per-origin limits, and global limits then turn into a denial of service for honest writers.",
    k: ["Per-origin quotas versus a global cap alone: per-origin limits stop one peer filling the store, but are only as good as the cost of making new origins.", "Fixed quotas versus ones scaled to device capacity: scaling lets strong nodes help more, but makes capacity differ across replicas and complicates replica counting."],
    p: ["A global cap with no per-origin share lets one noisy publisher evict everyone else's records.", "Counting only value bytes and ignoring per-record metadata lets tiny records exhaust memory."],
    v: "Fill a node to its quota from one source, confirm further stores from that source are refused, and that a store from a different, honest source is still accepted.",
    dep: ["local-record-store", "ip-diversity-limits"]
  },
  "eviction-policy": {
    s: "The rule for choosing which stored records to drop when space runs out: oldest, least recently read, nearest to expiry or furthest from the node's identifier.",
    d: "When a store would exceed limits the node removes some records first. Common choices are earliest expiry, least recently requested, or furthest in identifier distance, because records near the node are the ones it is most responsible for. The policy must keep eviction consistent with replication: dropping a record that the node is one of the closest holders of reduces availability. It is hard because the best policy depends on workload, and any predictable rule can be gamed by an attacker who learns it.",
    k: ["Evicting by distance versus by recency: distance preserves the node's core responsibility, recency favors popular data but can drop the only replica of a rarely read key.", "Evicting silently versus refusing new stores: silent eviction keeps accepting writes, refusal gives publishers immediate feedback to place data elsewhere."],
    p: ["Evicting the only live replica of a value because it was read rarely loses data that was healthy.", "A recency policy lets an attacker keep junk alive by reading it constantly."],
    v: "Fill a node, add one record at a time past capacity, and confirm the evicted records match the documented rule and that records nearest to the node's identifier remain.",
    dep: ["local-record-store", "xor-metric", "record-expiry"]
  },
  "disk-persistence": {
    s: "Saving records, the routing table and publisher state to disk so a restarted node can rejoin quickly and keep serving the data it held.",
    d: "On shutdown or periodically, the node writes its records and expiry times, its contact list and its own identifier to disk. On start it reloads them, discards expired items and verifies reachability of saved contacts. This turns a restart from a full bootstrap into a quick recovery. It is hard because saved state ages: contacts are stale after hours, records may have been superseded, and writing on every change costs more than the overlay's light touch can afford.",
    k: ["Periodic snapshots versus write-ahead logging: snapshots are simple and cheap, logging loses less after a crash but adds write load and recovery code.", "Persisting the node identifier versus choosing a fresh one on each start: keeping it preserves responsibility and reputation, but fixed identifiers are easier for attackers to target."],
    p: ["Reloading expired records and serving them as current gives readers stale values.", "A corrupted saved contact file with no checksum makes the node start with garbage contacts and fail to join."],
    v: "Run a node for an hour, kill it uncleanly, restart it, and confirm it rejoins within seconds using saved contacts and still holds the unexpired records it had.",
    dep: ["local-record-store", "table-persistence", "node-id-assignment"]
  },
  "write-tokens": {
    s: "Short-lived tokens a node hands out in response to a read-type request and requires back in a store request, proving the writer really controls the address it claims.",
    d: "A node answering a lookup includes a token computed from the requester's address and a rotating secret. A later store must present a valid token, so the sender must have received replies at its claimed address. The node stores nothing per requester because the token is verifiable from the secret. Tokens expire when the secret rotates. This blocks spoofed stores and forged sources. It is hard because the token ties writes to an address, so a node whose address changes between lookup and store, or that sits behind rotating translation, is refused.",
    k: ["Stateless tokens from a rotating secret versus per-peer state: stateless tokens cost nothing under flood, but cannot be revoked for one peer before rotation.", "Short validity versus long: short validity limits replay, long validity tolerates slow publishers and retries."],
    p: ["Rotating the secret too fast invalidates tokens during a slow publish and the store silently fails.", "A token that does not bind the address can be replayed from any source."],
    v: "Request a token, store with it from the same address and confirm acceptance. Store from a different address, with an altered token and after rotation, and confirm all three are refused.",
    dep: ["address-validation-tokens", "record-validation"]
  },
});
