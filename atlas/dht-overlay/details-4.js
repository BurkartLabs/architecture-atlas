// Details for the DHT overlay plate, part 4: attack defenses, authentication, transport, NAT traversal, cross-cutting concerns.
ATLAS.details("dht-overlay", {
  "sybil-resistance": {
    s: "Limiting how many identities one attacker can hold in the overlay, since without a cost or an authority, one machine can pretend to be thousands of nodes.",
    d: "In an open network anyone can create identifiers for free, and many attacks need only enough of them. Defenses make identities costly or scarce: binding them to network addresses or prefixes, requiring computational puzzles, using certificates from an authority, or leaning on social links. None is complete. A defense is judged by the cost per identity and by how much influence a large number still buys. It is hard because the ability to join anonymously and cheaply is the property the overlay was built to offer, and every cost also falls on honest users.",
    k: ["Costly identities versus a central issuer: costs keep the network open but cannot stop a well-funded attacker, an issuer is strong but reintroduces a trusted party.", "Limiting identities per address prefix versus per puzzle work: prefix limits are cheap to check, but cost nothing to attackers who control many address blocks."],
    p: ["Assuming one address means one node ignores shared and translated addresses, so honest users behind one are excluded.", "A puzzle cheap enough for phones is cheap for an attacker with commodity hardware."],
    v: "Attempt to join one thousand identities from one host and one address block, and confirm that the limits cap how many enter the tables of honest nodes, with the rest refused and counted.",
    dep: ["id-key-binding", "id-puzzle", "ip-diversity-limits"]
  },
  "id-key-binding": {
    s: "Deriving the node identifier from its public key, so the node can prove it owns the identifier and cannot freely pick a position.",
    d: "The identifier is the hash of the node's public key, and messages carry signatures made with the private key. Peers verify that the signing key hashes to the claimed identifier. This stops simple impersonation and spoofed identities, and lets nodes sign records. It does not stop grinding, where an attacker generates many key pairs until one hashes near a target. It is hard because the binding adds a key generation and verification step to every contact, and gives away nothing against an attacker who can generate keys cheaply.",
    k: ["Key-derived identifiers versus self-chosen ones: key binding gives authenticity at the cost of signature work, but still lets an attacker mine identifiers by brute force.", "Key rotation allowed versus fixed: rotation limits damage from a compromised key, but changes the node's position and responsibilities."],
    p: ["Accepting a claimed identifier without checking it against the key lets anyone impersonate any node.", "Grinding keys to land next to a target key is feasible for short prefixes and defeats binding alone."],
    v: "Present a message claiming identifier X signed by a key that does not hash to X, and confirm it is rejected. Present one signed by the correct key and confirm acceptance.",
    dep: ["node-id-assignment", "signed-messages"]
  },
  "id-puzzle": {
    s: "A computational puzzle that must be solved to obtain a valid identifier, so producing many identifiers or choosing a specific one costs real work.",
    d: "A valid identifier must be the hash of a public key and a nonce that meets a difficulty condition, such as a number of leading zero bits. A node searches for a nonce, which takes time, and peers verify it with one hash. The difficulty sets the price per identity. It can also require work that changes over time, so old identities expire. It is hard because hardware varies by orders of magnitude, so the difficulty that stops attackers also excludes phones, and mining targeted prefixes still costs less than mining random ones.",
    k: ["Static difficulty versus rising with network size: rising difficulty keeps the cost meaningful, but forces everyone to recompute identifiers over time.", "Puzzle in the identifier versus in a separate admission token: in the identifier ties cost to position, a token is flexible but needs a verifier."],
    p: ["Setting difficulty by laptop performance leaves botnets and specialized hardware with enormous advantage.", "A puzzle that does not bind to a key lets one solution be reused by many nodes."],
    v: "Generate an identifier at the required difficulty, confirm peers verify it with a single hash and accept it, then submit one with insufficient work and confirm rejection.",
    dep: ["node-id-assignment", "key-hash"]
  },
  "ip-diversity-limits": {
    s: "Limits on how many contacts in a bucket or table may come from one network prefix, so an attacker with many identifiers but few address blocks cannot dominate.",
    d: "When inserting a contact, the node counts how many existing entries share its address prefix and refuses the entry above a threshold, in each bucket and in the whole table. Honest networks are spread across many prefixes, while an attacker's identities are concentrated in few. This makes eclipsing a node require many different address blocks. It is hard because address space is not a clean proxy for identity: carrier-grade translation puts thousands of users behind one address, cloud providers sell many prefixes, and the limits penalize honest users in dense regions.",
    k: ["Strict diversity versus permissive: strict limits make attacks costly but exclude honest nodes in shared address ranges, permissive limits barely slow attackers.", "Checking at insertion versus also at lookup: insertion keeps the table healthy, lookup checks catch results from poisoned replies."],
    p: ["Limiting by single addresses rather than prefixes lets one operator with a block fill the table.", "Honest peers behind one large translator get refused and cannot participate."],
    v: "Offer fifty contacts from one /24 prefix to a node and confirm no more than the configured number are accepted, while fifty from different prefixes are all accepted.",
    dep: ["k-buckets", "contact-record"]
  },
  "eclipse-defense": {
    s: "Measures that prevent an attacker from surrounding a victim with its own nodes, so that every route and every answer the victim sees passes through the attacker.",
    d: "An eclipse attack fills the victim's table, or the neighborhood of a target key, with attacker nodes. The defenses combine several mechanisms: preferring long-lived contacts, limiting address diversity, keeping some contacts that were learned by lookups the node initiated and checking results across independent paths. A node can also verify its neighbors by querying for its own identifier through different routes. It is hard because the attacker needs only to win the neighborhood of one target, and the victim has no direct evidence it is eclipsed since all it sees looks consistent.",
    k: ["Static trusted contacts versus entirely dynamic tables: a few fixed trusted peers give an anchor an attacker cannot displace, but are a central point and a target.", "Cross-checking results versus trusting the closest answer: cross-checking exposes inconsistency but multiplies lookup cost."],
    p: ["A node restarting with only contacts from one source has no independent view to detect that source lying.", "An attacker that waits for churn to empty a bucket then fills it takes over without being noticed."],
    v: "In a simulation, surround a victim with attacker nodes up to the limits, and confirm that cross-path lookups still reach honest replicas for a measurable fraction of keys, and that an inconsistency alarm fires.",
    dep: ["disjoint-path-lookups", "ip-diversity-limits", "session-weighting", "id-key-binding"]
  },
  "disjoint-path-lookups": {
    s: "Running the same lookup along several routes that share no intermediate nodes, so one lying or dropping node cannot control the result.",
    d: "The lookup starts d independent searches from different first contacts and prevents them from using the same nodes, merging results at the end. A result is trusted if enough paths agree. This makes the attacker control all d paths rather than one. It multiplies lookup traffic by d and slows the slowest path. It is hard because paths cannot be fully disjoint in a small network, an attacker with a fraction f of nodes still intercepts a corresponding fraction of paths, and agreement across paths needs a rule for conflicting answers.",
    k: ["Multiple disjoint paths versus one path with verification of results: disjoint paths tolerate dropping and lying but cost d times the traffic, verification alone cannot detect a dropped answer.", "Majority agreement versus any valid answer: majority resists forged answers, accepting any verifiable answer is faster and fine for signed data."],
    p: ["Paths that share a popular intermediate node are not independent, so one attacker can sit on all of them.", "Waiting for all paths makes the lookup as slow as the worst one."],
    v: "Make ten percent of nodes drop all lookups and compare the success rate of single-path and four-path lookups, confirming the disjoint version succeeds on far more attempts at about four times the traffic.",
    dep: ["iterative-lookup", "parallel-queries"]
  },
  "poisoning-defense": {
    s: "Checks that stop false or harmful entries from entering routing tables through replies, exchanged contacts or spoofed messages.",
    d: "A node inserts a contact only after it has been verified by a direct exchange: the contact answered a request the node itself sent. Contacts learned from others' replies go to a candidate list and are probed. Entries that point to unroutable or private addresses, the node's own address, or the same address under many identifiers are rejected. It limits one liar's effect to its own entry. It is hard because verification costs probes, and the slower the table fills, the longer a newcomer is vulnerable.",
    k: ["Verify before insert versus insert and correct later: verifying keeps tables clean but delays use of new contacts, insert-first is quick but poisons lookups meanwhile.", "Accepting only contacts the node queried itself versus any heard: self-queried contacts are trustworthy, but give slower discovery."],
    p: ["Accepting contacts from unsolicited messages lets a single attacker fill many tables.", "Inserting addresses in reserved ranges makes the node send probes into private networks."],
    v: "Send a node replies containing unreachable and private addresses and its own identifier, and confirm none enters its table. Confirm a contact that answers a probe is inserted.",
    dep: ["k-buckets", "liveness-probes", "contact-record"]
  },
  "storage-attack-defense": {
    s: "Protections against hostile writes and reads: flooding a key's replicas with junk, overwriting others' data, withholding stored values or crowding out honest records.",
    d: "Defenses are layered: quotas and validation keep junk out, signatures protect updates, write tokens block spoofing, and replication across the k closest nodes means a single refusing replica does not remove data. Readers query several replicas and prefer values they can verify. Per-key limits protect popular keys. It is hard because an attacker who controls all replicas of one key, by placing nodes next to it, can still withhold or return old values, and that targeted attack is cheap for a rarely used key.",
    k: ["Verifiable values versus trusting replicas: verification lets readers reject bad data, but cannot detect withheld data.", "Per-key rate limits versus per-source limits: per-key stops hot-key floods from any source, per-source stops one noisy peer but not a distributed flood."],
    p: ["Placing nodes adjacent to a target key lets an attacker silently erase that key's data.", "A defense that rejects stores under load drops honest writers as quickly as attackers."],
    v: "Flood a key with a million junk stores from many sources and confirm the replica keeps its genuine record, serves it, and stays under its resource caps while counting rejected writes.",
    dep: ["record-validation", "storage-quotas", "k-closest-replication", "write-tokens"]
  },
  "rate-limiting": {
    s: "Capping how many requests a node answers per second from each source or overall, so floods cost the attacker more than the node.",
    d: "The node counts requests per source address or prefix over a window and drops or delays those over the limit, with separate limits per request type: stores and large replies are limited harder than simple pings. Global limits protect the process as a whole. Responses that are larger than requests are limited most strictly. It is hard because legitimate bursts exist, such as a node performing a join or a lookup storm after a partition heals, and source addresses are spoofable on datagram transports, so limits can be abused to starve a victim of service.",
    k: ["Per-source limits versus global limits: per-source is fair to honest nodes during an attack, global protects the process but lets one source starve everyone.", "Dropping excess requests versus replying with an error: dropping saves the cost of replying, errors let honest peers back off."],
    p: ["Limits keyed on spoofable addresses let an attacker exhaust a victim's quota by forging requests from its address.", "A single shared limit for all request types lets cheap pings starve expensive stores."],
    v: "Send a node one thousand requests per second from one source and confirm only the allowed rate is answered, while a second source continues to be served at full speed.",
    dep: ["address-validation-tokens", "datagram-transport"]
  },
  "signed-messages": {
    s: "Messages carrying a signature from the sender's key, proving which identifier sent them and that they were not altered in transit.",
    d: "A message includes the sender's public key or identifier and a signature over its contents, including a sequence number or timestamp and the intended recipient to prevent replay. Receivers verify before acting. Signing is used for store requests, mutable records and any message whose effect matters. Verifying every message is expensive on busy nodes, so many protocols sign only some. It is hard because signature checks cost far more CPU than the requests they protect, which is itself a denial of service lever, and replay protection needs state or clocks.",
    k: ["Signing every message versus only state-changing ones: signing everything authenticates all traffic, but lets an attacker burn CPU with bad signatures on cheap requests.", "Embedding the recipient in the signed data versus not: embedding stops replay to other nodes, at the cost of one signature per recipient."],
    p: ["Signing without a nonce or timestamp lets an old store be replayed to roll data back.", "Verifying signatures before cheap checks such as rate limits lets floods exhaust the CPU."],
    v: "Alter one byte of a signed message and confirm it is rejected, replay a valid one and confirm the replay is detected, and measure signature verification throughput against the node's request rate.",
    dep: ["id-key-binding", "transaction-ids"]
  },
  "transaction-ids": {
    s: "Random identifiers placed in each request and echoed in its reply, so a node can match answers to questions and ignore forged or stale ones.",
    d: "The sender generates an unpredictable value per request and records it with the destination and time. A reply is accepted only if it carries a matching value from the expected address. This makes blind spoofing of replies impractical when the identifier is long enough and random. It also lets the node correlate requests with the lookups that sent them. It is hard because identifiers must be unguessable, unique over the lifetime of a pending request, and cleaned up, and short ones are guessable by an off-path attacker who can send many replies.",
    k: ["Long random identifiers versus short counters: random identifiers resist off-path spoofing, counters are small and ordered but predictable.", "Binding the identifier to the destination versus a plain identifier: binding stops a reply from another node being accepted, but needs a record per pending request."],
    p: ["A sequential counter lets an attacker forge replies to the node's lookups and feed it contacts.", "Reusing an identifier too soon lets a late reply to an old request satisfy a new one."],
    v: "Send forged replies with random identifiers to a node and confirm none are accepted. Then send a genuine request and confirm only the reply with the correct identifier and source is accepted.",
    dep: ["rpc-layer"]
  },
  "address-validation-tokens": {
    s: "A cookie-like exchange that proves a request really came from its claimed source address before the node does expensive work or sends a large reply.",
    d: "When a node receives a request from an unvalidated source, it replies with a small token derived from the source address and a secret. The requester must present the token in its next request, proving it can receive packets at that address. Only then does the node send large responses or accept stores. This blocks reflection and amplification, and spoofed-source floods. It is hard because it adds a round trip to the first contact, and has to cope with peers whose address changes mid-exchange.",
    k: ["Stateless cookies versus per-peer tables: cookies need no memory under flood, but cannot be revoked and need secret rotation.", "Requiring validation for all requests versus only large replies: all requests is safest but slows every first contact, large replies only keeps cheap lookups fast."],
    p: ["Large replies sent to unvalidated addresses make the node a traffic amplifier against a victim.", "Tokens that do not expire can be shared and reused by an attacker."],
    v: "Spoof a source address and send a find-value request. Confirm the node sends back only a small token, not the value, and sends the value once the token is echoed from the real address.",
    dep: ["datagram-transport", "transaction-ids"]
  },
  "transport-encryption": {
    s: "Encrypting and authenticating the traffic between two nodes, so observers on the path cannot read queries or tamper with replies.",
    d: "Nodes run a handshake that agrees on keys, typically using their public keys, and then protect each datagram or stream with an authenticated cipher. This hides which keys a node is looking up, and stops path attackers from altering messages. Some designs encrypt only to obscure the protocol from simple traffic filters. It is hard because a handshake costs round trips and state per peer on a protocol that otherwise has none, and queries to many peers make the setup cost significant.",
    k: ["Full handshake per peer versus stateless per-message encryption: handshake gives forward secrecy but needs state, stateless encryption is lighter but weaker.", "Encrypting everything versus only values: encrypting everything hides activity patterns, but costs CPU on every cheap message."],
    p: ["Encryption without authentication lets an active attacker sit between nodes and relay everything.", "Per-peer handshake state exhausts memory when many contacts connect at once."],
    v: "Capture traffic between two nodes and confirm that no key or value appears in plaintext, and that flipping one bit in a captured datagram causes it to be rejected.",
    dep: ["signed-messages", "datagram-transport"]
  },
  "query-privacy": {
    s: "Limiting what nodes along a lookup path learn about who is searching for what, since a key often reveals the content or person the searcher is interested in.",
    d: "Every node on a lookup sees the target key and the asker's address, and the closest nodes see exactly what was requested. Mitigations include hashing keys with a secret so they cannot be linked to names, issuing decoy lookups, routing queries through intermediate peers and querying for neighborhoods rather than exact keys. Each costs latency or traffic. It is hard because the overlay's function requires revealing the key to the nodes nearest to it, so full privacy needs layering anonymity on top, at a large cost.",
    k: ["Blinded keys versus plain hash keys: blinding hides what is searched but breaks lookups by parties without the secret.", "Relaying queries through other peers versus direct queries: relaying hides the asker's address, but adds hops and trust in the relays."],
    p: ["Treating hashing as privacy ignores that anyone can hash a guessed name and compare it with observed keys.", "Decoy queries that follow a pattern are filtered out by an observer."],
    v: "Observe a lookup from a node on the path and list what it learns. Then enable the privacy option and confirm the observer can no longer link the key to a name it did not know.",
    dep: ["key-derivation", "iterative-lookup"]
  },
  "value-signature-checks": {
    s: "Readers and storing nodes verifying a value's signature or hash against its key before accepting or returning it.",
    d: "For a mutable record, the signature must verify under the key the storage location was derived from, and the sequence number must exceed the stored one. For content-addressed data, the hash of the value must equal the key. Storing nodes check on write, and readers check again on read, because they cannot trust the replica. Failures are discarded and counted. It is hard because checks cost CPU, must cover the exact bytes including the sequence, and cannot defend against a validly signed but old record without freshness rules.",
    k: ["Checking on both write and read versus write only: both stops a corrupted replica from serving bad data, but doubles verification work.", "Rejecting unsigned values versus accepting them as unverified: rejecting is safe but limits use, accepting enables simple deployments at the cost of trust."],
    p: ["Verifying the signature over the value but not the sequence number lets an old signed record be replayed.", "Skipping the check on cached copies lets an unverified value spread to readers."],
    v: "Store a value with a valid signature, then alter it on disk and confirm a reader detects the mismatch and discards it, retrying another replica.",
    dep: ["signed-messages", "key-hash"]
  },
  "wire-format": {
    s: "The byte-level encoding of requests, replies and contacts, designed to be compact, extensible and strict enough to parse safely from strangers.",
    d: "Messages have a small header with type, version and transaction identifier, followed by typed fields: identifiers, addresses, values, tokens. Contacts are packed compactly so a reply with many fits in one datagram. Encodings are either self-describing with key and value pairs, or fixed binary layouts. Parsers must reject malformed input without crashing and handle unknown fields. It is hard because the parser faces untrusted bytes, so bounds and length checks are a security matter, and the format has to remain compatible for years.",
    k: ["Self-describing encoding versus fixed binary layout: self-describing allows extension and debugging, fixed layouts are smaller and faster to parse but resist change.", "Ignoring unknown fields versus rejecting: ignoring allows evolution, rejecting catches errors but breaks old nodes."],
    p: ["A length field trusted without bounds checks lets a crafted message read or allocate beyond what it should.", "Encodings that allow two byte forms of one value make signatures and hashes disagree between implementations."],
    v: "Feed the parser one million random and truncated messages and confirm no crash and no unbounded allocation, and that round-tripping valid messages across two implementations reproduces identical bytes.",
    dep: []
  },
  "datagram-transport": {
    s: "Carrying requests and replies in single unreliable datagrams, which need no connection state and work well with NAT hole punching.",
    d: "Each message is sent as one datagram to the peer's address and port, using a single socket for all peers. There is no handshake, so a node can talk to thousands of contacts with no per-peer state. Messages must fit under the path size limit to avoid fragmentation. The same socket is used for inbound and outbound traffic so that the translator's mapping is shared. It is hard because delivery is not guaranteed or ordered, source addresses can be forged, and many networks rate limit or block the traffic.",
    k: ["Datagrams versus connections for lookups: datagrams are cheap per peer and punch through translators easily, but give no reliability, ordering or source verification.", "One shared socket versus a socket per peer: one socket keeps a single external port mapping and uses few descriptors, but concentrates load and processing on one receive loop."],
    p: ["Replies larger than the path size limit are fragmented and silently dropped by many middleboxes.", "Using a different port for each outbound request breaks the translator mapping that inbound replies need."],
    v: "Exchange ten thousand requests across a lossy link with five percent loss and confirm the retry layer completes them all, and that no message exceeds the configured maximum datagram size.",
    dep: []
  },
  "stream-transport": {
    s: "Using an ordered, reliable connection between two nodes for large values or bulk transfers that do not fit in a datagram.",
    d: "When a value is too large for a datagram, or a record set is long, the two nodes open a connection and exchange it with ordering and retransmission handled by the transport. The overlay uses datagrams for lookups and streams for bulk data. A pool of idle connections is kept for frequently used peers. It is hard because connections cost memory and a handshake, are harder to establish through translators, and attackers can open many half-open connections to exhaust a node.",
    k: ["Streams only for large transfers versus for everything: streams only keep the lookup path light, streams for everything give reliability but cost state and setup per contact.", "Connection reuse versus one per exchange: reuse saves handshakes, but pins memory and descriptors for idle peers."],
    p: ["Unbounded accepted connections let an attacker exhaust descriptors with idle connections.", "Large values fetched without a length limit fill memory when a peer sends endless data."],
    v: "Fetch a 50 MB value from a replica over a stream, confirm integrity by hash, then open the maximum allowed connections and confirm further ones are refused without affecting lookups.",
    dep: ["wire-format", "congestion-limits"]
  },
  "rpc-layer": {
    s: "The thin request and response layer on top of the transport that sends a request, tracks it by identifier, applies timeouts and delivers the reply or a failure.",
    d: "A call creates a transaction record with identifier, destination, request type and deadline, sends the datagram, and registers a callback. A reply matching the record completes the call and updates the contact's liveness and delay. A timeout triggers retransmission up to a limit and then a failure result. Inbound requests are dispatched to handlers by type. It is hard because there may be thousands of concurrent calls, timers and late replies, and the state must be cleaned up reliably.",
    k: ["Own request-response layer versus a general messaging framework: a custom layer is tiny and tuned to datagrams, but duplicates retry and timer logic.", "At-most-once versus at-least-once delivery: at-most-once avoids duplicate effects, at-least-once recovers from loss but requires idempotent handlers."],
    p: ["Leaked transaction records from calls that never finish slowly consume memory.", "A handler that blocks the receive loop delays every other call on the node."],
    v: "Issue ten thousand calls with five percent random loss and confirm each ends in a reply or a failure, and that the table of pending transactions returns to zero.",
    dep: ["datagram-transport", "wire-format", "transaction-ids", "retransmission"]
  },
  "retransmission": {
    s: "Resending a request that got no reply, with delays that grow and a limit on attempts, since datagrams are sometimes lost.",
    d: "If no reply arrives within the contact's timeout, the request is sent again, and the timeout is multiplied for the next attempt. After a few attempts the call fails and the contact's failure count rises. Lookups usually prefer to send to another candidate instead of waiting for retries. Retries must carry the same identifier or a new one depending on the design, and handlers must tolerate duplicates. It is hard because retries add load when the network is already congested, and loss and node death look the same from the sender.",
    k: ["Retry the same peer versus move to another candidate: retrying handles transient loss, moving on is faster when the peer is dead and the lookup has alternatives.", "Same identifier on retries versus new: the same identifier lets late replies match, a new identifier makes replies unambiguous for round-trip measurement."],
    p: ["Retrying without backoff during an outage multiplies traffic and delays recovery.", "Retried stores that are not idempotent create duplicate records."],
    v: "Drop the first reply to a request at the network layer and confirm one retransmission follows after the timeout, the call succeeds, and the store is applied exactly once.",
    dep: ["adaptive-timeouts", "rpc-layer"]
  },
  "congestion-limits": {
    s: "Bounds on a node's own outgoing traffic and in-flight requests so the overlay does not overload the sender's link or the receivers.",
    d: "The node limits the number of concurrent lookups, requests in flight per destination and total bytes per second, with a queue for the excess. On loss or rising delay it slows down, using the same ideas as stream congestion control. Maintenance traffic is scheduled below foreground lookups. It matters most for nodes on slow home links where a burst of refreshes can saturate the uplink and hurt the user's other traffic. It is hard because a loss signal from a remote overloaded node says nothing about the local link, and nodes on one machine compete.",
    k: ["Static caps versus adaptive rate control: static caps are predictable and protect the user's link, adaptive control uses available capacity but needs reliable delay and loss signals.", "Prioritizing lookups over maintenance versus equal share: prioritizing keeps users responsive, but lets maintenance fall behind during sustained load."],
    p: ["A burst of refreshes after an idle period saturates a home uplink and stalls the user's other applications.", "Unbounded queues turn a short overload into seconds of delay that triggers timeouts and more retries."],
    v: "Limit a node to 100 KB/s and run lookups and maintenance together, and confirm the measured outbound rate stays under the cap and lookup latency is not worse than with maintenance off by more than the target.",
    dep: ["rpc-layer", "rtt-measurement"]
  },
  "external-address-discovery": {
    s: "Learning the public address and port the Internet sees for this node, by asking peers to report the source of the packets they receive.",
    d: "A node behind a translator knows only its private address. It asks several peers what source address and port they see for its requests, and the replies report it. Agreement among independent peers is treated as the answer; disagreement indicates a translator that assigns a different port per destination. The result is what the node advertises in contacts and uses for hole punching. It is hard because a single peer can lie, the address changes when the translator rebinds, and the answer is only valid while the mapping stays open.",
    k: ["Asking several peers versus a dedicated service: peers need no infrastructure and the majority resists lies, a dedicated service is simple but a dependency.", "Re-checking periodically versus only at start: periodic checks catch rebinding and address changes, at a small constant cost."],
    p: ["Trusting one peer's report lets it make the node advertise a wrong address.", "An address learned once and never rechecked becomes wrong after the translator rebinds, and contacts to it fail."],
    v: "Place a node behind a translator, run the discovery, and confirm the result equals the translator's public address and port as seen from an external host, and updates after the mapping is changed.",
    dep: ["datagram-transport", "rpc-layer"]
  },
  "nat-type-detection": {
    s: "Classifying the translator in front of the node, such as whether it maps the same external port for all destinations, to choose the right traversal technique.",
    d: "The node sends requests from one local port to several external peers and compares the reported source ports. The same port for all means the mapping is endpoint-independent and hole punching usually works; different ports mean per-destination mapping, which needs prediction or relaying. Tests also check whether unsolicited inbound packets from new hosts are filtered. The result is stored and shared with contacts. It is hard because translator behavior depends on timeouts and load, and classifications are approximations of complex and changing behavior.",
    k: ["Detecting the type up front versus trying techniques in sequence: detection saves failed attempts, sequential trying works without a model of the translator.", "Sharing the classification with contacts versus keeping it local: sharing lets peers choose their approach, but it is self-reported and may be wrong."],
    p: ["Classifying from a single test and treating it as permanent misses translators that change behavior under load.", "Assuming all peers share the same translator behavior leads to repeated failed hole punch attempts."],
    v: "Run the detection behind translators known to be endpoint-independent and per-destination, and confirm each is classified correctly and that hole punching success rates match the prediction.",
    dep: ["external-address-discovery"]
  },
  "hole-punching": {
    s: "Having two peers behind translators send packets to each other at the same time so that each translator opens a mapping that admits the other's traffic.",
    d: "Both peers learn each other's external address through a third party, such as a node they both contact, and then send datagrams to those addresses at a coordinated moment. Each outgoing packet creates a mapping in its own translator that lets the reply from the other side in. Once both mappings exist, packets flow directly. The coordinator only exchanges addresses. It is hard because timing must align, translators with per-destination mapping defeat simple punching, and keepalives are needed to keep the hole open.",
    k: ["Coordinated punching via a third node versus relaying all traffic: punching gives direct low-latency paths and no relay cost, relaying always works but costs bandwidth and adds delay.", "Trying several candidate ports versus just the reported one: extra candidates rescue some translators, but multiply probes and look like scanning."],
    p: ["Both sides starting at different times means the first packets are dropped and the attempt gives up.", "Punching toward a stale reported address succeeds in opening nothing and wastes the attempt."],
    v: "Put two nodes behind different translators with no port forwarding, coordinate through a third, and confirm direct packets flow in both directions without the relay after the exchange.",
    dep: ["external-address-discovery", "rendezvous-points", "nat-type-detection", "nat-keepalives"]
  },
  "relay-fallback": {
    s: "Forwarding traffic through a publicly reachable third node when two peers cannot establish a direct path, at the cost of that node's bandwidth.",
    d: "When punching fails, the unreachable node holds a connection to a relay that has a public address. Others reach it by sending to the relay, which forwards over the existing connection. The relay is chosen from nodes advertising capability and low delay. Relaying makes connectivity universal but adds hops and load. It is hard because relays are scarce and attractive to attackers, they see the metadata of what they carry, and heavy use by symmetric translators can overload a few capable nodes.",
    k: ["Relay only as a fallback versus always: fallback keeps relay load low, always-relay is simpler but costly and slower.", "Volunteer relays versus operated relays: volunteers scale with the network but vary in quality and trust, operated relays are reliable but need funding."],
    p: ["A relay that goes offline strands every peer reachable only through it.", "Unmetered relaying lets an attacker consume a relay's bandwidth for free."],
    v: "Block direct paths between two nodes, confirm that traffic flows via a relay, then stop the relay and confirm that the nodes select another and resume within the failover time.",
    dep: ["service-announcements", "reachability-classification", "stream-transport"]
  },
  "port-mapping": {
    s: "Asking the local gateway to create a fixed public port for the node using a router protocol, so inbound traffic works without punching.",
    d: "The node uses a gateway discovery and control protocol to request a mapping from an external port to its own address and port, for a lease period. When granted, it advertises that public address and is reachable by anyone. Leases must be renewed, and mappings removed on exit. This turns a hidden node into a reachable one on common home routers. It is hard because support varies and is often disabled, gateways report success while carrier-level translation still blocks inbound traffic, and the protocol is unauthenticated on the local network.",
    k: ["Port mapping when available versus relying on punching alone: mapping gives a stable reachable address, but is not available everywhere and needs lease upkeep.", "Mapping the same external port as the internal one versus any: same port is easy to remember, any port avoids conflicts between devices."],
    p: ["A mapping that the router reports but that is blocked upstream makes the node advertise an address nobody can reach.", "Leaving mappings open after exit leaves stale entries on the router and misdirects traffic."],
    v: "Request a mapping from the local gateway, then test reachability from an external host to the mapped port and confirm the node answers a request from there, and that it disappears after removal.",
    dep: ["external-address-discovery", "datagram-transport"]
  },
  "nat-keepalives": {
    s: "Small periodic packets sent to keep translator mappings open, since idle mappings expire in seconds to minutes and the overlay must remain reachable.",
    d: "A translator removes a mapping after a period of inactivity, commonly between 30 and 120 seconds for datagrams. The node sends small packets to contacts in its table within that window, usually combined with liveness probes so that no extra traffic is needed. A peer that loses its mapping cannot receive requests until it sends again. It is hard because the timeout varies by translator, short intervals cost battery on mobile devices, and a table of hundreds of contacts needs many mappings kept open.",
    k: ["Keepalive interval short versus long: short intervals keep mappings reliably but cost battery and traffic, long ones risk expiry and silent unreachability.", "Probing all contacts versus a few key ones: all keeps every path open, a few keeps only those needed for inbound requests."],
    p: ["An interval longer than the translator timeout makes the node reachable only right after it sends.", "Keepalives to hundreds of contacts drain a mobile device's battery."],
    v: "Leave a node behind a translator idle with keepalives, confirm it still answers inbound requests after ten minutes, and then disable keepalives and confirm inbound requests fail after the translator timeout.",
    dep: ["liveness-probes", "nat-type-detection"]
  },
  "reachability-classification": {
    s: "Deciding, from evidence, whether a node is publicly reachable, and only then advertising it to others as a routing contact.",
    d: "A node asks peers to attempt unsolicited connections to its reported address. If enough succeed, the node is public and may act as a full routing participant, appearing in other nodes' tables. If not, it runs as a client: it performs lookups and publishes but is not added to others' routing tables and serves no stored records. Classification repeats because conditions change. It is hard because wrong classification damages the network: unreachable nodes in tables cause timeouts, while public nodes that act as clients waste capacity.",
    k: ["Client-only mode for unreachable nodes versus full participation: client mode keeps tables full of reachable peers, but reduces the nodes holding data.", "Rechecking often versus rarely: frequent checks adapt to mobility, rare ones save probes and avoid flapping."],
    p: ["A node that advertises itself as reachable when it is not fills other nodes' tables with dead entries.", "Flapping between modes causes records to move repeatedly."],
    v: "Test a node behind a translator and one with a public address, and confirm the first is classified as client-only and not added to peers' tables, while the second is listed after verification.",
    dep: ["external-address-discovery", "nat-type-detection", "rpc-layer"]
  },
  "dual-stack": {
    s: "Operating on both older and newer Internet address families, keeping separate or joint tables, so peers on either can find each other.",
    d: "A node may have addresses in both families. Some designs run two overlays, one per family, with a separate table each, and some run one overlay with contacts of both kinds and prefer one for each peer. Contact records carry several endpoints, and the transport tries the better one first. Dual-stack avoids translators when both ends have globally reachable addresses. It is hard because the two families can have different reachability and performance, and a node in one family cannot reach nodes in the other without a bridge.",
    k: ["Separate overlays per family versus one joint overlay: separate overlays are simple and keep routing consistent, a joint overlay lets nodes bridge but complicates tables and ownership.", "Preferring the newer family versus the older: the newer often avoids translation, the older is more widely deployed and reliable."],
    p: ["Advertising only an address in a family the peer cannot reach makes the contact unreachable.", "A node that bridges two families concentrates traffic and becomes a critical dependency."],
    v: "Run a node with both families and one single-family node of each kind, and confirm lookups succeed from either, with the table holding endpoints of the expected family for each peer.",
    dep: ["contact-record", "datagram-transport"]
  },
  "trust-model": {
    s: "The assumptions about who is hostile and how much of the network they may control, which determine every defense chosen and every guarantee that can be claimed.",
    d: "A design states what an attacker may do: control a fraction of nodes, choose identifiers, observe traffic, run many addresses. A weak model gives a simple and fast overlay that works among cooperating peers. A strong one adds identity costs, redundant paths and verification everywhere, with higher cost per lookup. Guarantees are always conditional, such as correctness while attackers hold less than some fraction of nodes. It is hard because the model must be chosen before deployment, and the real attacker is not required to follow it.",
    k: ["Assuming cooperative peers versus assuming a fraction are hostile: cooperation yields a simple, fast design, hostility costs redundancy and verification on every operation.", "A trusted authority for admission versus an open network: an authority gives strong guarantees but is a central point, openness gives resilience with weaker ones."],
    p: ["Deploying a design analyzed for cooperative peers on the open Internet, where attacks begin within days.", "Stating guarantees without the attacker fraction they hold for, so users assume stronger protection than exists."],
    v: "Write the attacker capabilities the design claims to handle, then run each as an experiment in simulation and on a test network, and confirm that the stated guarantee holds up to the stated fraction and degrades beyond it.",
    dep: []
  },
  "churn-assumptions": {
    s: "The assumed rate and pattern of nodes joining and leaving, which fixes refresh intervals, replica counts and how much repair traffic the network must carry.",
    d: "Designs are tuned for a session length distribution: typical lifetimes of minutes for mobile and home peers, hours or days for servers. From the median lifetime come the choices of k, refresh periods and expiry. Bursty churn, such as a mass restart or an outage, is more damaging than steady turnover. It is hard because measured networks show heavy tails, with many short sessions and a few very long ones, so averages mislead, and the real pattern shifts with time of day and software updates.",
    k: ["Design for median churn versus for the worst case: median keeps costs low, worst case protects data during outages but spends traffic constantly.", "Assuming independent failures versus correlated: independent failures make replication math simple, correlated failures such as one provider outage defeat it."],
    p: ["Setting the republish interval from average lifetime and losing data when a correlated outage removes many replicas at once.", "Testing only with steady churn and missing the failure of a mass restart."],
    v: "Replay a measured churn trace through the simulator, including an outage of thirty percent of nodes, and confirm lookup success and data availability stay above the targets.",
    dep: []
  },
  "consistency-model": {
    s: "What readers may assume about the freshness and agreement of values: typically eventual consistency, with no guarantee that two readers see the same version.",
    d: "Writes reach some replicas first and others later. Reads query a few replicas and may see different versions, and a partition or departure can leave an old value reachable. Mutable data uses sequence numbers to choose the newest seen, and immutable data avoids the question. Applications must be written for stale reads. It is hard because there is no coordinator to impose order, nodes leave carrying the only copy of a recent write, and strong consistency would need consensus among a changing replica set.",
    k: ["Eventual consistency versus quorum reads and writes: eventual is cheap and available during churn, quorums give stronger guarantees but slow every operation and fail when too many replicas are unreachable.", "Application-resolved conflicts versus last-writer-wins by sequence: application resolution is correct for rich data, sequence ordering is simple but discards concurrent updates."],
    p: ["An application that assumes a successful put is immediately visible to all readers breaks under churn.", "Treating a value read from one replica as the latest when it has been superseded elsewhere."],
    v: "Update a record, immediately read from ten different nodes, and measure the fraction returning the new version over time, confirming it converges within the documented window.",
    dep: []
  },
  "key-parameters": {
    s: "The few numbers that define the overlay's behavior, bucket size k, parallelism alpha, and the refresh and expiry intervals, and the reasoning that sets them.",
    d: "k sets both replication and table width, chosen so that all k replicas are unlikely to fail before the next refresh. Alpha sets lookup parallelism, chosen to hide slow nodes without flooding. Refresh and expiry intervals follow from churn. These parameters appear in analyses and are tuned by simulation and measurement. They interact: raising k raises storage and maintenance cost, raising alpha raises traffic and attack leverage. It is hard because the best values depend on the network size, churn and adversary, which change over the life of the network.",
    k: ["Fixed constants versus adaptive values: constants keep implementations compatible and analysis simple, adaptive values follow conditions but invite manipulation and divergence.", "Large k for safety versus small k for cost: large k tolerates more failures and attackers per neighborhood, but multiplies storage, repair and lookup response size."],
    p: ["Copying parameters from a different network with different churn leaves data under-replicated or traffic excessive.", "Different implementations choosing different k, so tables and replicas do not match."],
    v: "Sweep k and alpha in simulation under the measured churn and attacker model and confirm the chosen values meet the availability and latency targets at the lowest traffic.",
    dep: []
  },
  "hops-versus-latency": {
    s: "The trade-off between the number of overlay hops, which is bounded by the design, and the delay of each hop, which depends on where peers really are.",
    d: "Identifier-based routing ignores geography, so the logical neighbors of a node may be anywhere on the planet and each hop may cross an ocean. A lookup with a handful of hops can take seconds. Techniques that choose nearby neighbors, add routing state to cut hops, or use parallel and hedged requests improve latency at a cost in state or traffic. It is hard because the techniques compete: more routing state means more maintenance, and nearby selection reduces diversity needed against attacks.",
    k: ["Fewer hops through more state versus more hops with a small table: more state is faster per lookup, but costs maintenance traffic that grows with churn.", "Latency-aware neighbor choice versus random choice: latency-aware improves speed, random choice improves resilience and fairness."],
    p: ["Optimizing the average hop count while the tail is dominated by a few very slow peers.", "Selecting neighbors purely by delay clusters nodes in one region, so a regional outage partitions the table."],
    v: "Plot lookup latency percentiles for the plain design and each optimization on a network with realistic geography, and confirm each change shifts the percentiles as claimed without raising traffic past the budget.",
    dep: []
  },
  "incentives-and-fairness": {
    s: "Why peers would store data and answer queries for strangers, and what stops them from using the overlay without contributing.",
    d: "The overlay works only if enough nodes do work for others: answering lookups, holding replicas, relaying. Some deployments rely on altruism or on the self-interest of nodes that also need the service. Others add accounting, reputation or tit-for-tat. Unfair load is a related problem: popular keys and long-lived nodes carry more than their share. It is hard because freeloading is invisible in a network with no central observer, accounting can itself be gamed, and mechanisms that punish contribution failures hurt honest nodes with poor connections.",
    k: ["Voluntary contribution versus enforced accounting: voluntary needs no machinery and works when everyone benefits, accounting is stronger but is a target for forgery and adds overhead.", "Equal load per node versus load proportional to capacity: proportional makes better use of strong nodes, but concentrates risk on them."],
    p: ["A large share of nodes running as clients only leaves too few servers, and lookups slow and fail.", "Reputation signals that can be forged let an attacker appear highly cooperative."],
    v: "Measure the share of lookups and stores served by each node, confirm the distribution matches the capacity model, and that nodes refusing to serve are detected and deprioritized within the target time.",
    dep: []
  },
});
