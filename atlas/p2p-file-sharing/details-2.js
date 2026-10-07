// Details for the peer-to-peer file sharing plate, part 2: discovery, web sources, wire protocol, piece selection.
ATLAS.details("p2p-file-sharing", {
  "tracker-client": {
    s: "Announces the client to a tracker over HTTP, reporting progress and receiving a list of peers for the swarm, repeated on the tracker's schedule.",
    d: "An announce is a request carrying the content address, a random peer identifier, the listening port, bytes uploaded, downloaded and left, and an event (started, completed, stopped). The reply holds a peer list in compact form and an interval. The client re-announces at that interval, sends stopped on exit and may request fewer or more peers. Hard parts are failure handling and honesty: trackers go down, return errors or slow responses, and statistics reported in announces drive ratio accounting on private trackers.",
    k: ["Compact peer lists versus full dictionaries: much smaller replies, but no peer identifiers and IPv6 needs a separate field.", "Honoring the tracker's interval versus announcing sooner on need: gentle on the tracker, but a stalled swarm waits long for fresh peers unless a minimum interval allows early refresh."],
    p: ["Not sending the stopped event leaves the client listed as a peer for the interval and wastes other peers' dials.", "Announcing on every start of a large queue at once floods the tracker and triggers rate limiting."],
    v: "Capture an announce and its reply against a test tracker: parameters match the transfer's real counters, the compact list decodes to the expected addresses, and a stopped event is sent on shutdown.",
    dep: ["info-hash", "tracker-tiers", "candidate-pool", "listen-sockets"]
  },
  "udp-tracker-protocol": {
    s: "A lightweight binary announce protocol over UDP that avoids connection setup and HTTP overhead for high-volume trackers.",
    d: "The client first sends a connect request and receives a short-lived connection token, which prevents spoofed-source abuse, then sends announce or scrape requests quoting the token. Messages are fixed-layout binary with transaction identifiers matched to replies. Because UDP is unreliable the client retries with exponential backoff and refreshes expired tokens. Hard parts: handling lost packets and reordering correctly, validating that reply transaction ids match, and avoiding amplification when used to probe third parties.",
    k: ["UDP with a connection token versus HTTP: far lower cost per announce for the tracker, but the client owns retransmission and timeouts.", "Binary fixed layout: compact and fast to parse, but harder to extend than self-describing messages."],
    p: ["Retrying without backoff during a tracker outage multiplies traffic exactly when the tracker is struggling.", "Reusing an expired connection token yields silent drops that look like a dead tracker."],
    v: "Run announces against a test UDP tracker that drops 30 percent of packets; the client retries with growing delays, completes the announce, and never reuses a token past its lifetime.",
    dep: ["tracker-tiers", "event-loop"]
  },
  "tracker-tiers": {
    s: "Organizes multiple trackers into ordered tiers, tries one per tier and falls back with growing delays when a tracker fails.",
    d: "The metadata may list several trackers in tiers. The client shuffles each tier, tries trackers in order until one answers, promotes a working tracker to the front of its tier, and moves on to the next tier only on failure. Failed trackers back off exponentially. Some clients announce to every tier for more peers. The difficulty is balance: too aggressive hammers broken trackers and delays the transfer, too passive leaves a healthy tracker unused because an earlier one was slow.",
    k: ["Try one tracker per tier versus announce to all: lower load and traffic, but fewer peers discovered per round.", "Exponential backoff per tracker: protects failing servers, but a briefly down tracker is ignored for longer than needed."],
    p: ["Treating a tracker timeout as permanent failure drops a tracker that returned minutes later.", "Announcing to all trackers on a public swarm with dozens of listed trackers floods them and leaks the client's address widely."],
    v: "Configure three trackers with the first down; the client announces to the second, promotes it to the front, and the first is retried only after its backoff period.",
    dep: ["tracker-client", "metainfo-file"]
  },
  "scrape-requests": {
    s: "Asks a tracker for swarm counts (seeds, downloaders, completed downloads) without joining, to display health or choose among transfers.",
    d: "A scrape takes one or more content addresses and returns the numbers of complete peers, incomplete peers and the total completions. The client uses it to show health in the interface, to decide which of many queued transfers have sources, and to trigger reannounces. Many trackers disable or rate-limit scrapes. The data is the tracker's view only, and it ignores peers found through other methods, so zero seeds may mean only that this tracker has none.",
    k: ["Scrape versus a full announce: cheap and read-only, but it gives counts only and no peers.", "Batching many addresses per request: one round trip for a whole queue, but trackers cap batch size and refuse oversized requests."],
    p: ["Showing tracker-only counts as swarm health misleads users when most peers are found through the DHT.", "Scraping a large queue every minute draws rate limits and bans."],
    v: "Scrape a known test swarm and compare counts to the tracker's records and the client's own connected peers; they agree within the announce interval.",
    dep: ["tracker-client", "swarm-statistics"]
  },
  "dht-client": {
    s: "Participates in a distributed hash table that maps content addresses to peer addresses without any central server.",
    d: "The client joins by contacting bootstrap nodes, then answers and issues queries over UDP: find nodes close to an identifier, get peers for a content address, and announce that it holds one, with tokens binding announcers to their address. A lookup iteratively queries ever closer nodes until it finds peers or exhausts candidates. It runs alongside downloads and consumes little bandwidth. Hard parts are bootstrapping, handling nodes with unreachable addresses, and resisting poisoning by nodes that return bogus peers or crowd out honest ones.",
    k: ["Iterative parallel lookups versus recursive forwarding: the client controls timing and can detect stalls, but sends more of its own packets.", "Participating as a full node versus query-only: contributes to the network's health, but costs bandwidth and exposes the client as a long-lived node."],
    p: ["Starting without any reachable bootstrap node leaves the client with an empty table and no peers for magnet links.", "A node behind translation that cannot accept queries gets added to others' tables and answers none, degrading lookups."],
    v: "Start with an empty table and bootstrap; within a minute the table holds many nodes, and a lookup for a known content address returns peer addresses that accept a handshake.",
    dep: ["dht-routing-table", "info-hash", "listen-sockets"]
  },
  "dht-routing-table": {
    s: "Keeps contact information for nodes at varying distances from the client's own identifier, organized into buckets that favor long-lived nodes.",
    d: "Each node has an identifier in the same space as content addresses. The table splits the space into buckets of a fixed number of nodes per distance range, with finer buckets near the node's own identifier. Nodes are refreshed periodically, questionable nodes are pinged and replaced when unresponsive, and long-lived nodes are preferred since they are likelier to stay. The difficulty is staleness and attack resistance: in a network with high churn tables decay quickly, and an attacker can try to fill buckets near a target.",
    k: ["Prefer old, proven nodes versus the newest: stability and resistance to flooding with fresh identities, but slow adaptation when good new nodes join.", "Bucket size: bigger buckets give more redundancy per lookup, but more memory and more maintenance traffic."],
    p: ["A table never refreshed for hours is filled with dead nodes and every lookup begins with timeouts.", "Accepting identifiers unrelated to the node's address lets one machine appear as thousands of nodes."],
    v: "Dump the table after a long run and ping a sample: most entries answer, bucket occupancy follows the expected distribution, and a restart reloads and reuses the saved table.",
    dep: ["dht-client", "state-store"]
  },
  "peer-exchange": {
    s: "Peers tell each other about other peers they are connected to, so swarms keep growing without extra tracker or DHT queries.",
    d: "Over an extension message, a peer periodically sends lists of recently added and dropped peers with flags such as encryption support and whether the peer is a seed. Receivers add them to the candidate pool. Rate limits cap the size and frequency of lists, and only peers that connected successfully are shared. Hard parts: it propagates bad information as easily as good, so entries are unverified until a connection succeeds, and it widens address exposure, which is why private transfers disable it.",
    k: ["Gossip between peers versus only central sources: reduces tracker load and finds peers quickly, but the information is secondhand and can spread attacker-chosen addresses.", "Share only recently connected peers: keeps lists fresh and short, but a peer that just joined has little to share."],
    p: ["Accepting unbounded lists lets one peer flood the candidate pool with addresses for a distributed attack on a victim.", "Sharing peer addresses for private transfers reveals community members to outsiders."],
    v: "Connect two clients that do not share a tracker through a third peer; each learns the other's address via exchange, connects, and the added and dropped lists reflect real connections.",
    dep: ["extension-protocol", "candidate-pool", "private-flag"]
  },
  "local-peer-discovery": {
    s: "Finds peers on the same local network by multicast announcements, so nearby clients exchange data over the LAN without leaving it.",
    d: "The client periodically sends a small multicast message with the content addresses it is sharing and its listening port, limited to the local network segment. Other clients with the same content connect directly. Transfers between local peers are fast and do not use the internet link. The hard parts are scope and restraint: announcements must be rate limited, must stay off other interfaces and must not include private transfers, since anyone on a shared network can hear them.",
    k: ["Multicast announcements versus manual configuration: automatic and zero setup on a LAN, but only works within one broadcast domain and can be blocked by switches.", "Announce all transfers versus opt in: more local sharing, at the cost of telling everyone on the network what you have."],
    p: ["Announcing on a public wireless network exposes your transfer list to every device on it.", "Treating local peers as ordinary peers charges their traffic against the internet rate limit."],
    v: "Run two clients on one subnet with the same content and no trackers; they connect within a minute and the transferred bytes appear only on the local interface.",
    dep: ["local-network-exemption", "private-flag", "listen-sockets"]
  },
  "candidate-pool": {
    s: "The pool of known peer addresses that might be dialed, with source, last result and priority, fed by trackers, the DHT, exchange and incoming connections.",
    d: "Each entry records address, port, source, flags, failure count, last attempt and whether it was ever connected. The connection manager draws from the pool in priority order: recently good peers, peers advertising seeds, then untested ones, skipping those backing off. Entries expire and the pool is capped per transfer. It matters because discovery returns far more addresses than useful connections: most are unreachable or busy, so ordering and pruning decide how fast a swarm is joined.",
    k: ["Rank by past success and source: quicker connection to useful peers, but newcomers may rank below dead entries with good history.", "Capped pool with eviction: bounded memory, but a hostile source can try to push out good entries with junk."],
    p: ["Retrying failing addresses at fixed short intervals wastes the dial budget on peers that will not answer.", "A pool with no expiry fills with addresses that now belong to unrelated machines, producing handshake errors against strangers."],
    v: "Feed a pool 10,000 addresses of which 50 are live; connections to live peers are established within seconds and failed entries show increasing backoff.",
    dep: ["outbound-connector", "ip-filtering"]
  },
  "web-seed-client": {
    s: "Downloads pieces from an ordinary web server holding the same files, treating it as one more source that never uploads or chokes.",
    d: "When the metadata lists a web seed URL, the client maps a piece to a byte range in a file or set of files and fetches it with a ranged request, verifying like any other piece. It runs alongside swarm peers and is scheduled by the picker as a high-capacity, always-available source. Hard parts: servers differ in range support, redirects and rate limits, some serve compressed or modified content that fails verification, and the client must not let a single server consume all the picker's choices.",
    k: ["Treat the server as a peer in the picker: a unified scheduling model, but it needs special limits since requests cost the host money.", "Larger request ranges versus piece-sized ones: fewer round trips and better throughput, but less flexibility and more waste on failure."],
    p: ["A server that ignores range headers returns the whole file for every piece request and hammers both ends.", "A mirror serving an outdated version fails every hash and gets retried endlessly unless the client bans it."],
    v: "Download a file with no peers, only a web seed; the transfer completes, every piece verifies, and server logs show ranged requests matching piece boundaries.",
    dep: ["ranged-piece-fetch", "block-assignment", "piece-verification"]
  },
  "ranged-piece-fetch": {
    s: "Turns a piece or block into the byte ranges of one or more files and requests exactly those ranges over HTTP.",
    d: "Using the file layout, the client computes which files and offsets a piece covers, issues one ranged request per file span and stitches the responses together before verification. Where files are padded or the host exposes a single archive the mapping differs. Responses are validated for status, content range and length. Hard parts are boundary correctness and handling of partial responses, redirects and servers that close the connection mid-body, which must resume from the last verified offset.",
    k: ["One request per file span versus coalescing neighbors: simple and robust, but small files in a multi-file transfer cause many tiny requests.", "Resume partial bodies versus restart the piece: saves bandwidth on flaky connections, but needs careful offset tracking."],
    p: ["Using the wrong offset where a piece crosses two files yields a piece that fails its hash for no visible reason.", "Following redirects to a different host without rechecking the URL allows a mirror to send the client elsewhere."],
    v: "Fetch a piece that straddles two files from a test server and compare the logged range requests to the expected offsets; the assembled piece hashes correctly.",
    dep: ["file-layout-mapping", "web-seed-client"]
  },
  "mirror-failover": {
    s: "Chooses among several web seed URLs and backs off from those that fail, are slow or serve content that does not verify.",
    d: "Each mirror has a health score built from error rates, speeds and hash failures. The client prefers faster, healthier mirrors, spreads load, and retires or retries failing ones with growing delays. A mirror that returns data failing verification is penalized heavily since it is wrong rather than merely slow. The challenge is distinguishing temporary failures from permanent ones, and not abusing a free mirror by opening too many connections.",
    k: ["Score-based selection versus round robin: faster mirrors carry more load, but one fast, flaky mirror can attract more failures.", "Per-host connection caps: protects donated servers, but limits peak speed when the swarm is empty."],
    p: ["Without a cap on parallel requests per host the client gets banned by the very mirror it depends on.", "A permanently demoted mirror is never retried after the operator fixes it."],
    v: "Offer three mirrors, one down and one serving corrupted data; the client completes from the third, the corrupted one is dropped after hash failures, and retries on the down one back off.",
    dep: ["web-seed-client", "hash-failure-handling"]
  },
  "browser-peer-transport": {
    s: "A transport that lets browsers join swarms using the web's peer-to-peer data channels, with signaling through a server since browsers cannot listen on sockets.",
    d: "Browser clients cannot accept raw TCP or UDP, so peers connect through data channels negotiated by exchanging offers and answers via a signaling server, often the tracker. Connection setup uses address discovery and relay fallbacks. Once open, the channel carries the same wire messages. Hard parts: signaling load on the tracker, limits on the number of simultaneous channels, no access to the filesystem for storage beyond browser quotas, and swarms that must bridge browser and native clients through bridging peers.",
    k: ["Signaling via the tracker versus a separate service: reuses existing infrastructure, but the tracker now brokers offers and must scale with connection attempts.", "Browser storage as the disk: runs without installation, but quotas and eviction limit what can be seeded."],
    p: ["Relay fallbacks carry the full data volume if direct connection fails, turning a free swarm into a bandwidth bill.", "Browser peers disappear when tabs close, so swarms made of them have extreme churn."],
    v: "Open two browser tabs with the same content; a signaling exchange appears on the tracker, a channel opens, and pieces flow between the tabs and verify.",
    dep: ["peer-handshake", "tracker-client", "message-framing"]
  },
  "peer-handshake": {
    s: "The first exchange on a connection: protocol identifier, capability bits, content address and peer identifier, which together decide whether the two peers can trade.",
    d: "Each side sends a fixed-layout message with a protocol string, reserved capability bytes, the content address and a peer identifier. The listener reads the address and decides whether it serves that content; if not, it drops the connection without replying. Matching addresses lead to an optional extension handshake. It is hard to do safely: incoming connections are unauthenticated, the handshake must not allocate state before the address is known, and an outbound connection that gets the wrong content address should be abandoned at once.",
    k: ["Content address in the first message: a peer immediately knows whether it can help, but anyone who guesses the address can probe whether you serve it.", "Fixed-layout handshake with reserved bits: simple and fast, but only a few capability bits are available without a second negotiation."],
    p: ["Allocating buffers or per-peer state before validating the content address lets floods of junk connections exhaust memory.", "Not enforcing a handshake timeout leaves slots held by connections that never speak."],
    v: "Connect to the client with a wrong content address, a truncated handshake and a slow-drip handshake; each is closed within the timeout and no state remains, while a correct handshake is answered.",
    dep: ["info-hash", "listen-sockets", "extension-protocol"]
  },
  "message-framing": {
    s: "Splits the byte stream into length-prefixed messages, each carrying a type, so the protocol can be parsed incrementally and unknown types skipped.",
    d: "After the handshake every message is a length followed by a type byte and payload, with a zero length used as keepalive. The parser accumulates bytes from the socket, extracts complete frames and dispatches by type. It enforces a maximum length per type, since the length field comes from a stranger. Large piece messages are processed in pieces to avoid copying. The difficulty is partial reads, buffer reuse, and defending against huge declared lengths, unaligned messages and floods of cheap messages that cost much to handle.",
    k: ["Length-prefixed frames: simple, extensible and resynchronization is impossible after an error, so any framing error must close the connection.", "Zero-copy handling of block payloads: far higher throughput, but buffers must outlive the receive path until written to disk."],
    p: ["Trusting the length field allows a peer to claim a four-gigabyte message and make the client allocate it.", "A parser that waits for a full frame before reading holds memory per connection for stalled senders."],
    v: "Feed the parser frames split at every byte offset and a frame with an oversized length; it reassembles the first identically and rejects the second without allocating the declared size.",
    dep: ["buffer-pool"]
  },
  "bitfield-and-have": {
    s: "How peers tell each other which pieces they hold: a bitfield after the handshake, then a have message for each newly verified piece.",
    d: "The bitfield has one bit per piece, padded to a whole byte, and is sent once, optionally replaced by have-all or have-none shortcuts in the fast extension. Afterwards each completed piece triggers a have message to every connected peer. Receivers update their view of the peer and the swarm's availability counts, and decide whether the peer is interesting. Hard parts: validating length and padding bits, sending have only after verification, and avoiding broadcast storms on large swarms.",
    k: ["Bitfield plus incremental have: complete state once and cheap updates, but cost scales with peer count times piece rate.", "Suppress have for pieces the peer already has: less traffic, but needs per-peer state and a risk of leaking that you know their contents."],
    p: ["Announcing a piece before it verifies makes peers request data that will then be withdrawn, wasting their time.", "Accepting a bitfield of the wrong length corrupts availability counts for every other peer."],
    v: "Complete a piece on one client and observe have messages to all connected peers within a moment; a peer sending a short bitfield is disconnected.",
    dep: ["message-framing", "availability-tracking", "piece-verification"]
  },
  "interest-and-choke-messages": {
    s: "The four state messages that govern a connection: interested, not interested, choke and unchoke, which together say who may request data now.",
    d: "A peer is interested if the other side has a piece it lacks. A peer is choked if the sender will not serve its requests. Both flags exist per direction, so a connection has four states and data flows only when one side is interested and the other has unchoked it. State changes are sent when they change and apply immediately to queued requests. The interplay is hard: choking drops pending requests, interest must be recomputed on every have, and sending too many toggles wastes bandwidth.",
    k: ["Explicit state in both directions: each peer can reason locally about whether data will flow, but the state must be kept in sync or requests are wasted.", "Choke drops queued requests: instant control of upload, but the downloader must re-request after an unchoke."],
    p: ["Failing to recompute interest after a have leaves the client sitting not interested while the peer now has useful pieces.", "Rapid choke and unchoke cycles waste bandwidth and starve the peer of stable service."],
    v: "Trace a connection between two clients through several rounds; state messages match each side's actual need, and no piece is sent while the receiver is choked.",
    dep: ["message-framing", "peer-connection-state"]
  },
  "request-and-piece-messages": {
    s: "The messages that actually move data: a request names a block by piece, offset and length, and the reply carries the bytes.",
    d: "Pieces are transferred in blocks, typically 16 kilobytes, to keep requests small and allow interleaving among peers. A request has piece index, begin offset and length; the reply returns those fields plus data. A cancel message withdraws a request, used in endgame. Senders validate that the block exists, that the peer is unchoked and that the length is within a cap, and read from cache or disk. Hard parts: bounding the queue of requests a peer may have outstanding, and serving random reads without making the disk the bottleneck.",
    k: ["Small blocks versus whole pieces: fine-grained scheduling across peers and fast failure recovery, but more messages per byte.", "Cap on outstanding requests per peer: protects the uploader's memory, but a low cap limits the downloader's speed on long paths."],
    p: ["Serving arbitrary offset and length requests without bounds lets a peer read beyond a piece or demand huge blocks.", "Replying to requests after a choke wastes upload on a peer that will discard it."],
    v: "Request a block range through a test client including out-of-range, oversized and post-choke requests; invalid ones are ignored or disconnect the peer, valid ones return exact bytes.",
    dep: ["message-framing", "read-cache", "request-pipelining"]
  },
  "extension-protocol": {
    s: "A negotiated layer that lets peers exchange optional messages, such as metadata chunks and peer lists, with per-connection message identifiers.",
    d: "If both handshakes set the extension capability bit, peers exchange a dictionary mapping extension names to the numeric identifiers each will use, plus values like version, request limits and metadata size. Extension messages then travel in a standard frame with a sub-identifier. New features appear as new names, with no registry needed. Difficulty lies in robustness: unknown names are ignored, advertised sizes are untrusted, and identifiers may differ in each direction.",
    k: ["Names mapped to per-connection numbers: features roll out freely and independently, but every message needs a lookup and a local table.", "Free-form dictionaries for settings: easily extended, but the parser must validate every value from a stranger."],
    p: ["Hard-coding an identifier instead of using the one the peer announced breaks interoperability with other implementations.", "Honoring an advertised queue limit of a million lets a peer pin large amounts of memory."],
    v: "Handshake with a test peer advertising an unknown extension and a known one; the unknown is ignored, the known works, and the identifiers used in each direction match what each side announced.",
    dep: ["peer-handshake", "message-framing"]
  },
  "fast-extension": {
    s: "Optional messages that speed up connection startup: shortcut have-all and have-none, explicit reject of requests, and an allowed-fast set of pieces served even when choked.",
    d: "A seed can send have-all instead of a full bitfield, and a newcomer have-none. When a request will not be served the peer sends reject instead of silent dropping, so the requester can reassign at once. The allowed-fast set is derived from the peer's address and the content address, and lets a newly connected peer get a few pieces before it has earned an unchoke. It is hard because the set must be computed identically on both sides and bounded to prevent abuse.",
    k: ["Explicit rejects versus silence: fast reassignment and fewer timeouts, but peers must always answer instead of just ignoring.", "Allowed-fast pieces for choked peers: helps newcomers bootstrap quickly, but gives every connecting peer a small free share."],
    p: ["Treating a missing reject as the signal to retry makes the client wait for the full timeout against peers that do not support the extension.", "A large allowed-fast set lets many short-lived connections drain a seed's upload for free."],
    v: "Connect a newcomer with no unchokes; it still receives the allowed-fast pieces, requests the rest are rejected explicitly, and a seed's startup uses have-all rather than a full bitfield.",
    dep: ["interest-and-choke-messages", "request-and-piece-messages", "peer-handshake"]
  },
  "peer-connection-state": {
    s: "The per-peer record of flags, bitfield, outstanding requests, rates and timers that every other component reads to make decisions.",
    d: "Each connection holds choke and interest flags in both directions, the peer's piece bitfield, requests sent and received, byte counters with moving-average rates, last-activity times, whether it is encrypted or incoming, and a client identification string. The picker, choker and bandwidth limiter all read this record. It is hard because the state is updated on the hottest path and read from many modules, so ownership and update ordering matter, and because it must clean up fully on disconnect to release requests and counts.",
    k: ["One record per connection shared by all modules: simple lookups, but every module couples to its fields.", "Rates as exponential averages versus windowed counts: smooth and cheap, but slow to react to sudden changes."],
    p: ["Leaving requests assigned to a disconnected peer's record stalls those blocks until a global timeout.", "Rate averages that never decay keep an idle peer ranked as fast and unchoked."],
    v: "Drop a connection mid-transfer; every outstanding block is released within the timeout, availability counts decrease by the peer's pieces and no stale record remains.",
    dep: ["bitfield-and-have", "interest-and-choke-messages"]
  },
  "request-pipelining": {
    s: "Keeps several block requests outstanding per peer so the link stays full across the round trip, instead of waiting for each reply.",
    d: "The client sends a queue of requests and refills it as blocks arrive. The right depth depends on bandwidth times round trip: a fast, distant peer needs dozens of blocks in flight, a slow near one only a few. Clients estimate it from observed download rate and use a floor and ceiling. Deeper queues risk wasted work if the peer chokes or the block is requested elsewhere. Hard because queue depth interacts with fairness, memory use and endgame duplication.",
    k: ["Rate-driven queue depth versus fixed depth: full links on any path, but the estimate lags when rates change.", "Deep queue per peer versus fewer peers with shallow queues: better throughput per connection, but more blocks stranded when a peer vanishes."],
    p: ["A queue of one block per round trip caps throughput of a high-latency peer to a small fraction of its link.", "Very deep queues on a peer that then chokes strand hundreds of blocks until they are cancelled and reassigned."],
    v: "Measure throughput against a simulated 200 ms peer at 10 Mbit per second; the client reaches near line rate and the queue depth settles at roughly bandwidth times delay divided by block size.",
    dep: ["request-and-piece-messages", "peer-connection-state"]
  },
  "piece-picker": {
    s: "Decides which block to request next from which peer, subject to what each peer has, what is already in flight and the transfer's priorities.",
    d: "For each peer with free request capacity the picker selects among pieces that peer holds, that we lack, and that are not fully requested. It combines policies: continue partial pieces first so they complete and verify, then choose by rarity, priority and mode. State per piece includes availability, requested and received blocks, and assigned peers. It is the heart of the download and runs thousands of times a second, so data structures must be cheap, and its policies must remain coherent as peers, priorities and endgame change.",
    k: ["Finish partial pieces before starting new ones: bounded memory and quick verification, but weaker diversity when many peers hold the same pieces.", "Per-peer selection with shared piece state: simple view per request, but multiple peers should share a piece only at the end to avoid duplicate downloads."],
    p: ["A picker that scans every piece on each call burns the CPU on large transfers.", "Allowing many peers to start different new pieces at once leaves a large number of partly downloaded pieces and wasted disk buffering."],
    v: "On a transfer with a million pieces, the picker handles a thousand peers with low CPU use, and a trace shows partial pieces complete before new ones start except by rarity or priority.",
    dep: ["availability-tracking", "rarest-first", "piece-ownership", "file-priorities"]
  },
  "availability-tracking": {
    s: "Counts, for each piece, how many connected peers hold it, so the picker can tell which pieces are scarce.",
    d: "Whenever a peer sends a bitfield or have message the counts increase; on disconnect they decrease by that peer's pieces. The picker reads these counts, often via a bucketed index that groups pieces by count so the rarest can be found without scanning. The counts cover only connected peers, not the whole swarm, so they are a partial and noisy view. The difficulty is keeping the index consistent under constant updates, and including the client's own pieces and peers that appear as seeds correctly.",
    k: ["Bucketed index by availability: constant-time rare piece lookup, but each update moves a piece between buckets.", "Counting only connected peers: cheap and available immediately, but a sample of a possibly much larger swarm."],
    p: ["Forgetting to subtract a disconnecting peer's pieces leaves phantom availability and makes rare pieces look common.", "Counting seeds as holding every piece in an index makes no difference to ranking but inflates update cost if done piece by piece."],
    v: "Connect and disconnect peers with known bitfields; per-piece counts match the true number of connected holders after each event, including for peers that disconnect mid-handshake.",
    dep: ["bitfield-and-have", "peer-connection-state"]
  },
  "rarest-first": {
    s: "Prefers requesting the pieces held by the fewest connected peers, so rare pieces spread before their holders leave.",
    d: "Among candidate pieces the picker chooses the lowest availability, breaking ties randomly so peers do not all chase the same piece. By getting rare pieces early, a client becomes useful to others and the swarm keeps every piece available even when the original seed leaves. It also improves the chance the client has something others want, which supports reciprocation. The difficulty: availability is a local estimate, ties must be randomized, and the policy conflicts with sequential needs such as streaming.",
    k: ["Rarest-first versus sequential: keeps the swarm healthy and diverse, but gives a download order unusable until completion.", "Random tie-breaking: avoids herds on one piece, but forgoes locality that would help disk reads."],
    p: ["Every client picking the same single rarest piece overloads the one holder instead of spreading the load.", "Applying rarest-first when the swarm has one seed gives no benefit and wastes request diversity on the seed's link."],
    v: "In a test swarm with one seed, run several clients and check that after the seed leaves, every piece still exists among the clients, and that a reference sequential run fails this check.",
    dep: ["availability-tracking", "piece-picker"]
  },
  "random-first-piece": {
    s: "Starts a new download with a few random pieces rather than the rarest, so the client has something to trade quickly.",
    d: "A client with no pieces cannot reciprocate, and rare pieces are often held by few peers who serve slowly. For the first handful of pieces the picker chooses at random among those available from many peers, giving a fast first completion. Once a few pieces are verified the client announces them, becomes interesting to others, and switches to rarest-first. Its value is bootstrap speed. The hard part is knowing the threshold: too many random pieces weakens diversity, too few leaves the client with nothing to offer for too long.",
    k: ["Random start versus rarest from the beginning: faster first pieces and earlier reciprocation, but slightly less diversity at the start.", "Small fixed count of pieces: simple, but the best number depends on piece size and swarm speed."],
    p: ["Staying in random mode too long reduces the swarm's piece diversity and slows overall completion.", "Choosing random pieces from a seed's link only makes new peers all fetch the same early pieces."],
    v: "Start a download in a busy swarm and log the first pieces; they are drawn at random from widely held pieces, and the first have message goes out within seconds.",
    dep: ["piece-picker", "rarest-first"]
  },
  "endgame-mode": {
    s: "Near the end, requests the remaining blocks from several peers at once and cancels duplicates, so a few slow peers cannot hold up completion.",
    d: "When every remaining block has already been requested, the client may request the same blocks from additional peers. When one copy arrives it sends cancel messages for the others. This removes the long tail where the final pieces sit with a single slow or vanished peer. The cost is duplicate bandwidth, bounded by the amount remaining. It is hard to enter and leave cleanly: entering too early wastes traffic, and cancel messages that arrive late produce duplicate data that must be discarded safely.",
    k: ["Duplicate requests at the end: removes tail latency from slow peers, but spends extra download bandwidth for a short time.", "Trigger when all remaining blocks are requested versus a fixed percentage: adapts to swarm speed, but may never trigger when peers are rate limited."],
    p: ["Entering endgame early on a large transfer downloads many blocks twice and measurably raises total traffic.", "Not cancelling after a block arrives leaves peers sending data that is dropped, wasting their upload."],
    v: "Trace the last piece of a download with one deliberately slow peer; duplicate requests go to two others, the first reply completes it, and cancels are sent for the rest.",
    dep: ["block-assignment", "request-and-piece-messages"]
  },
  "sequential-mode": {
    s: "Requests pieces in file order, so a media file can be played while downloading, at some cost to swarm health.",
    d: "The picker orders candidates by position, usually with a read-ahead window around a playback or file position and rarest-first outside it. Seeking moves the window and reprioritizes. Peers that are only sequential and never serve rare pieces reduce the swarm's diversity. Hard parts: partial pieces at the window's edge, deadlines for pieces to arrive before playback reaches them, and falling back gracefully when a needed piece is held by only a slow peer.",
    k: ["Sequential order versus rarest-first: immediate playback, but those clients hold common early pieces and contribute less to diversity.", "Window of priority pieces with rarest-first elsewhere: mixes both goals, but the window size must match bitrate and connection speed."],
    p: ["A sequential-only client in a small swarm leaves the later parts of the file with a single holder.", "Seeking far ahead without reprioritizing leaves the window waiting on pieces that were already requested for the old position."],
    v: "Start playback of a large file while downloading and seek forward; pieces near the new position become the highest priority and play begins once the window is filled, with no stalls on a sufficient link.",
    dep: ["piece-picker", "file-priorities"]
  },
  "block-assignment": {
    s: "Assigns specific blocks to specific peers and handles timeouts, rejections and disconnects by returning blocks to the pool.",
    d: "Each requested block records which peer holds it, when it was sent and whether it was cancelled. Timeouts are adaptive to the peer's observed round trip. When a request times out, is rejected or the peer disconnects, the block returns to the pool for others. Slow peers may lose work to faster ones, within limits. Hard parts: timeouts that are too short cause duplicate downloads, too long leaves blocks stalled, and many state changes for each block must stay consistent.",
    k: ["Adaptive timeouts per peer versus a global constant: efficient across varied links, but needs smoothing to avoid reacting to single outliers.", "Reassigning slow peers' blocks aggressively: faster completion, but can leave slow peers starved and idle."],
    p: ["A global 30 second timeout holds every block hostage when a peer silently disappears.", "Releasing a block without removing it from the peer's record leads to it being counted received twice."],
    v: "Suspend a peer holding requests mid-download; its blocks are reassigned after the adaptive timeout, the download proceeds and duplicate data stays near zero when the peer resumes.",
    dep: ["peer-connection-state", "piece-picker", "request-and-piece-messages"]
  },
  "piece-ownership": {
    s: "Tracks which peers contributed blocks to each partial piece, so a failed hash can be traced to likely culprits.",
    d: "While a piece is being downloaded the client records the peer that supplied each block. If the piece verifies, nothing more is needed. If it fails, the record identifies which peers touched it, supporting attribution and later banning. The picker also uses ownership to keep a piece's blocks coming from few peers, so a failure implicates a small set. Hard parts are memory for per-block records across thousands of partial pieces and deciding how much mixing of peers within one piece is acceptable.",
    k: ["Few peers per piece: failure attribution is accurate and cheap, but a single slow peer can hold a piece up.", "Per-block records: precise identification of the corrupting peer, but memory scales with in-flight blocks."],
    p: ["Letting many peers contribute to one piece makes a hash failure uninformative, and no culprit can be found.", "Dropping ownership records when a peer disconnects loses the evidence for a later hash failure."],
    v: "Inject one corrupt block from a known peer into a piece fed by three peers; the piece fails verification and the record names that peer as the contributor of the bad block.",
    dep: ["piece-picker", "corrupt-peer-attribution"]
  }
});
