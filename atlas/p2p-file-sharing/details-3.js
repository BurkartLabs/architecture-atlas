// Details for the peer-to-peer file sharing plate, part 3: incentives, swarm health, network edge.
ATLAS.details("p2p-file-sharing", {
  "choke-algorithm": {
    s: "Periodically selects which connected peers may download from the client, keeping a small number of upload slots filled by the best reciprocators.",
    d: "Every round, typically ten seconds, the client ranks interested peers by the rate at which they recently uploaded to it, unchokes the top few, and chokes the rest. Choking limits simultaneous uploads so each gets a useful rate and TCP behaves well. Between rounds, state is stable to avoid flapping. Difficulty comes from noise: short rate measurements fluctuate, new connections have no history, and a fixed slot count suits neither a slow nor a very fast uplink.",
    k: ["Few fixed slots versus many with fair shares: each recipient gets a usable rate and good congestion behavior, but slots must scale with upload capacity.", "Ten-second rounds: stable and cheap, but slow to react to a better partner appearing."],
    p: ["Choosing slots by instantaneous rate flips peers every round and wastes the benefit of established connections.", "A slot count fixed at four on a gigabit uplink leaves most of the capacity unused."],
    v: "Log rounds in a swarm with peers of varied upload rates; the unchoked set consistently includes the highest recent uploaders plus one rotating exploratory peer.",
    dep: ["reciprocation-ranking", "upload-slot-allocation", "peer-connection-state"]
  },
  "optimistic-unchoke": {
    s: "Rotates one extra upload slot to a randomly chosen peer, to find better partners and let newcomers get started.",
    d: "On a slower schedule than the regular rounds, often every thirty seconds, the client unchokes a peer picked at random from the choked and interested set, regardless of its past behavior. If that peer reciprocates well it may enter the regular set. New connections are given extra weight so they are tried sooner. It matters because pure reciprocation never discovers a faster peer nor serves a peer with nothing to give back yet. The hard part is the cost: capacity spent on strangers must remain a small fraction.",
    k: ["Random exploration versus ranked only: discovers better partners and bootstraps newcomers, but some uploads go to peers who never return the favor.", "Longer rotation than regular rounds: gives the peer time to show its rate, at the cost of slower exploration."],
    p: ["Skipping the optimistic slot leaves a newcomer with no pieces unable to ever obtain its first ones from reciprocators.", "Rotating too fast prevents measuring the peer's reciprocation before the slot moves on."],
    v: "Watch the unchoked set over several minutes: one slot changes every rotation to a peer not in the top group, and peers that reciprocate move into regular slots.",
    dep: ["choke-algorithm", "peer-connection-state"]
  },
  "upload-slot-allocation": {
    s: "Decides how many peers to serve at once, scaling with the available upload rate so each receives enough to be useful.",
    d: "Few slots at a high per-peer rate finish pieces quickly and make peers useful sooner, while many slots at low rates delay all of them. Clients derive slot counts from the upload limit, often roughly the square root of the rate, or adjust dynamically until the uplink is full. Reserved slots may be set aside for optimistic unchokes. The challenge is the uplink's real capacity: if unknown, slot counts are guessed from the configured limit, and too many streams make congestion worse for acknowledgments.",
    k: ["Slots scaled with measured upload rate: adapts from dial-up to fiber, but the measurement is lagging and noisy.", "Fixed slot count: predictable and simple, but wrong for most links."],
    p: ["Too many slots on a slow uplink delays acknowledgments and cuts the download rate too.", "A limit set far above the real uplink leads the client to fill the link and still believe it has spare capacity."],
    v: "Vary the configured upload limit from 50 kilobytes to 50 megabytes per second and confirm the number of unchoked peers scales with it while each receives a usable rate.",
    dep: ["choke-algorithm", "global-limits"]
  },
  "reciprocation-ranking": {
    s: "Ranks peers by how much they have recently sent to this client, so upload goes first to the ones who give back.",
    d: "The client keeps per-peer download rates over a sliding window and sorts interested peers by it. Ties and zero rates are broken randomly. Peers that have only just connected have no history and enter by optimistic unchoke. Rates are measured over payload data and ignore protocol overhead. Hard parts: windows long enough to be stable, but short enough to reflect change, and resisting peers that send junk or trivially small pieces to look generous.",
    k: ["Rank on what peers give versus what they hold: matches the incentive that matters, but a peer with nothing new to send is ranked low even if cooperative.", "Window length: longer windows are stable but slow, shorter windows track changes but flap."],
    p: ["Ranking by raw bytes including duplicates or corrupted data rewards peers that waste your bandwidth.", "Measuring over a single second makes a bursty peer jump in and out of the top group."],
    v: "Simulate peers with constant, bursty and zero rates; the ranking reflects average contribution over the window and the bursty peer does not oscillate in and out every round.",
    dep: ["peer-connection-state"]
  },
  "seed-unchoke-policy": {
    s: "When the client has the whole file, it cannot rank by what peers send back, so it chooses whom to upload to by other signals.",
    d: "A seed has no need for pieces, so reciprocation is meaningless. Simple rules unchoke peers that recently downloaded the fastest, which uses upload capacity efficiently but favors fast peers. Fairer rules rotate evenly or favor peers that were unchoked longest ago, or those with the least complete data. Hard part: preventing one fast peer from monopolizing the seed and preventing a leech that takes everything and leaves the moment it completes from consuming it all.",
    k: ["Favor fast downloaders: maximizes total throughput, but a few fast peers capture all slots and slow ones starve.", "Rotate evenly: fair and spreads pieces widely, but slots are spent on peers that cannot use them quickly."],
    p: ["A seed favoring the fastest peer leaves slow newcomers waiting indefinitely.", "Unchoking peers with the least progress wastes bandwidth if they disconnect before completing."],
    v: "Seed to ten peers of unequal speeds; with the rotation policy each makes progress and total upload stays near the limit, whereas the fastest policy shows slow peers receiving nothing.",
    dep: ["choke-algorithm", "upload-slot-allocation"]
  },
  "anti-snubbing": {
    s: "Stops uploading to peers who have unchoked us but sent no data for a long time, reserving slots for those who contribute.",
    d: "A peer is snubbed when it has not delivered a block for about a minute while the client was interested and unchoked by it. The client then removes it from regular reciprocation, only serving it through optimistic unchoke, and tries other peers. This corrects the case where a peer's rate is zero for some reason such as a full buffer or a disk stall. It is hard because slow and idle look alike: a peer on a poor link, a peer with nothing the client needs, and a free rider all show low rates.",
    k: ["Snub after a fixed idle time: quickly redirects capacity from dead peers, but can penalize peers temporarily blocked on disk or network.", "Allow recovery through optimistic slots: forgiving of transient problems, but spends slots on peers still unresponsive."],
    p: ["Marking a peer as snubbed when the client was not requesting from it unfairly cuts off a good partner.", "Never clearing the snub flag penalizes a peer indefinitely after it recovers."],
    v: "Make a test peer unchoke the client but stall all data for 60 seconds; it is marked snubbed, dropped from regular slots and returns after delivering data again.",
    dep: ["choke-algorithm", "peer-connection-state"]
  },
  "share-ratio-accounting": {
    s: "Measures uploaded bytes against downloaded bytes per transfer and overall, to drive seeding goals and tracker-enforced fairness.",
    d: "The client counts payload bytes sent and received, excluding protocol overhead and discarded data, per transfer and in total over time, and reports them in tracker announces. Private communities require a minimum ratio to keep an account. The count must survive restarts and track waste separately: failed hashes and duplicate blocks. Hard parts: agreement with the tracker's counts, which can differ by overhead or lost announces, and resisting inflated reports from modified clients.",
    k: ["Count verified payload only versus all bytes: matches what trackers care about, but needs separate waste counters.", "Self-reported statistics: trackers need no observation of the transfer, but a modified client can lie about its counts."],
    p: ["Losing counters on a crash makes a well-behaved client appear to have low ratio on a private tracker.", "Reporting only at completion misses the statistics of transfers stopped partway."],
    v: "Transfer a known number of bytes between two clients and confirm both sides' uploaded and downloaded counters match the payload within overhead, and survive a restart.",
    dep: ["tracker-client", "state-store", "peer-connection-state"]
  },
  "peer-banning": {
    s: "Refuses and disconnects peers that behave badly, such as sending corrupt data or protocol violations, and remembers them for a period.",
    d: "Triggers include repeated hash failures attributed to a peer, malformed messages, excessive request rates or listing in a blocklist. The ban applies to an address for a period, enforced at accept and connect. Counters are kept per peer and per address, with limits so one error does not ban an honest peer. Hard because of shared addresses: a ban on a translated address blocks every host behind it, and address-based bans are easy to evade, so they handle only the unsophisticated.",
    k: ["Ban by address with expiry: effective against careless faults and cheap to apply, but collateral damage behind shared addresses.", "Threshold of strikes versus immediate ban: forgives accidents like a single bad disk sector, but lets a malicious peer waste several pieces first."],
    p: ["Banning on a first hash failure bans honest peers whose disks corrupted a single block.", "A permanent ban list grows without bound and later blocks addresses reassigned to innocent users."],
    v: "Connect a test peer that always sends corrupt blocks; after the strike limit it is disconnected and its reconnection is refused until expiry, while an honest peer with one bad block remains.",
    dep: ["corrupt-peer-attribution", "ip-filtering", "listen-sockets"]
  },
  "distributed-copies": {
    s: "A measure of how many full copies of the content exist among connected peers, counting the rarest piece's holders, which tells whether the swarm can complete.",
    d: "Computed from availability counts as the minimum count plus the fraction of pieces above it, so 2.4 means every piece has at least two holders and 40 percent have three. A value below 1 means that some piece is held by no one connected, and no peer can finish until a holder appears. Interfaces display it to explain stalls. It is a lower bound over connected peers only, which makes it noisy in small swarms, and it ignores web seeds and unconnected peers.",
    k: ["Count over connected peers: cheap and available live, but under-reports a swarm that is large but poorly connected to this client.", "Single number versus piece map: simple to read, but hides whether one piece or many are missing."],
    p: ["Reading a value just below 1 as a dead swarm when a seed simply has not connected yet.", "Excluding web seeds shows a swarm as incomplete even though the file can be fully downloaded."],
    v: "Remove the only holder of one piece from a test swarm; the metric falls below 1 and the interface shows which piece is missing, then returns above 1 when a holder rejoins.",
    dep: ["availability-tracking", "swarm-inspector"]
  },
  "super-seeding": {
    s: "A mode for an initial seeder that reveals pieces to peers one at a time, so the first upload round spreads distinct pieces rather than the same ones.",
    d: "Instead of announcing a full bitfield, the seed pretends to have nothing, then tells each peer about a single piece, and sends further pieces only once that piece is seen elsewhere in the swarm. This pushes the seed's limited upload into as many different pieces as possible. It is used for the first copy of new content. The hard part is it only helps with an under-supplied swarm: with fast downloaders it can slow things down, and it confuses availability counts in other clients.",
    k: ["Controlled piece reveal: minimizes wasted upload of duplicated pieces, but a peer cannot download from the seed until it is told what to ask for.", "Using it only for initial publication: right tool for one scarce seed, but harmful once several seeds exist."],
    p: ["Leaving it on after other seeds appear reduces the swarm's download speeds by hiding pieces.", "Peers that disconnect before announcing their copy of the revealed piece make the seed resend and waste upload."],
    v: "Publish new content from one seed with 10 peers; with super-seeding, the total uploaded by the seed before the first full copy exists among peers is close to one copy, against several without it.",
    dep: ["bitfield-and-have", "availability-tracking", "seeding-goals"]
  },
  "seeding-goals": {
    s: "Rules that decide when a finished transfer stops seeding: after a share ratio, a duration, an idle period or never.",
    d: "After completion, a transfer seeds until its goal is met, then pauses, stops or is removed. Goals combine ratio, total seeding time and time with no uploads, and can be set globally, per category or per transfer. They interact with the queue: seeds beyond the active-seed limit wait their turn. The decisions affect swarm health directly, since the supply of complete copies depends on people seeding. The hard part is choosing defaults that are polite without being burdensome.",
    k: ["Ratio-based stop versus time-based: ties effort to what was given back, but a transfer in an empty swarm may never reach the ratio.", "Stop when idle: frees resources from dead swarms, but ends a seed just before the next downloader arrives."],
    p: ["Stopping at ratio 1.0 on a rare transfer removes the only seed and ends access for later peers.", "Goals that remove the transfer along with the data delete the user's files unexpectedly."],
    v: "Set a goal of 2.0 on a test transfer; seeding continues until the measured upload equals twice the size and then stops, with the state visible in the interface.",
    dep: ["share-ratio-accounting", "transfer-queue"]
  },
  "swarm-statistics": {
    s: "The counts of seeds, downloaders and completed copies as seen by the client, trackers and the DHT, shown together to describe a swarm's size.",
    d: "Sources disagree: a tracker's counts reflect those who announced to it, the DHT yields a sample of holders, and the client sees only the connected subset. The client merges them into displayed estimates, for example connected seeds out of known seeds. It is used by the user to judge whether a transfer will finish and by the queue to rank transfers. Hard parts: stale entries, duplicates across sources, and the fact that none are authoritative.",
    k: ["Show connected and known separately: honest about what is certain, but more numbers for users to interpret.", "Merge across sources: a fuller picture, but a peer reachable via two sources can be counted twice."],
    p: ["Showing a tracker's seed count as available seeds when none are reachable behind translation.", "Treating DHT peer samples as full counts understates large swarms."],
    v: "In a test swarm with known membership, compare displayed known, connected and tracker-reported counts against ground truth; the connected count is exact and the others are within the announce interval.",
    dep: ["scrape-requests", "candidate-pool", "peer-connection-state"]
  },
  "flash-crowd-handling": {
    s: "How a client and an initial seeder cope when many peers arrive at once for new content, before any piece has spread.",
    d: "At release, hundreds of peers ask a single seed for the same pieces. The seed serves a few at once by choking, and each served peer immediately becomes a source for others. Clients prefer pieces nobody else has, so the swarm quickly diverges. Backpressure matters: a seed must cap connections and accept some refusals, trackers must absorb a burst of announces, and newcomers should retry with jitter. The hard part is the first minutes, where every peer's pieces are common and the seed is the only supply.",
    k: ["Few unchoked peers served fast versus many served slowly: pieces reach other peers sooner and recirculate, but most peers wait at first.", "Randomized retry delays: spreads load and avoids synchronized stampedes, but individual peers wait longer on average."],
    p: ["A seed that accepts every connection spends memory and bandwidth on handshakes and serves nobody well.", "Synchronized reannounce after a tracker failure sends all peers back at the same moment."],
    v: "Release a test file from one seed to 200 simulated peers at once; the seed's upload is kept full, the pieces diversify within the first minutes and completion times do not scale linearly with peer count.",
    dep: ["upload-slot-allocation", "connection-limits", "rarest-first"]
  },
  "dead-swarm-detection": {
    s: "Notices transfers with no reachable sources and no progress, so they stop consuming queue slots and discovery effort.",
    d: "Signals include no connected peers for a long time, no piece progress, all peers choking, trackers reporting zero seeds and an availability below one. The client may mark a transfer stalled and let the queue skip it, reannounce more slowly or alert the user. It must tell a dead swarm from a temporarily empty one, since peers return at the next time zone's morning. The difficulty is distinguishing absence of evidence from evidence of absence.",
    k: ["Mark stalled but keep trying slowly: costs little and revives when peers return, but a pile of stalled transfers still needs periodic wakeups.", "Auto-remove after a timeout: keeps the list clean, but may delete a transfer one hour before a seeder returns."],
    p: ["Counting a transfer as active while it has no peers makes it hold one of the limited queue slots indefinitely.", "Aggressively reannouncing dead swarms draws rate limits from trackers."],
    v: "Add a transfer for content nobody holds; after the configured period it is flagged stalled, it stops occupying an active slot and reannounces back off, then resumes when a seed appears.",
    dep: ["distributed-copies", "swarm-statistics", "tracker-tiers"]
  },
  "listen-sockets": {
    s: "The sockets the client listens on for incoming peer connections and, over UDP, for the DHT and the delay-based transport.",
    d: "The client binds a TCP listener, usually on one configurable port, and a UDP socket sharing that port number for DHT and datagram transport traffic. It accepts connections, performs the handshake and hands each to the owning transfer. Binding choices include which interfaces and whether IPv6 is enabled. Hard parts: port conflicts, picking a random port in a high range, adapting when the port is blocked, and handling accept floods without exhausting descriptors.",
    k: ["One shared port for all transfers: a single mapping and firewall rule, but all swarms are visible on the same port.", "Fixed port versus random per start: easy forwarding with fixed, less easily blocked by port with random."],
    p: ["Binding to all interfaces on a machine with a VPN sends peers into the wrong network.", "Not limiting pending accepts lets a connection flood fill the descriptor budget."],
    v: "Check the process's listening sockets: TCP and UDP on the configured port, and an outside probe completes a handshake on both when the router forwards it.",
    dep: ["descriptor-budget", "event-loop"]
  },
  "outbound-connector": {
    s: "Opens connections to candidate peers at a controlled rate, within connection limits, and abandons slow attempts.",
    d: "The connector draws candidates from the pool, opens non-blocking connections up to a limit of half-open attempts, applies a short connection timeout, and passes successes to the handshake. It tries alternate transports when available, for example the delay-based UDP transport after a TCP failure. Rate limiting protects routers that crash under many half-open connections. The hard part is balance: aggressive dialing finds peers fast but overwhelms home routers, while timid dialing leaves a new transfer with few peers.",
    k: ["Limit half-open attempts: protects consumer routers and the descriptor budget, but slows swarm entry when most candidates are dead.", "Short timeouts: wastes fewer slots on unreachable peers, but can reject slow but valid distant peers."],
    p: ["Dialing hundreds of peers at once overflows a home router's connection table and drops existing flows.", "Retrying the same dead addresses faster than backoff burns dial slots for no gain."],
    v: "Start a transfer with 1,000 candidates; half-open attempts never exceed the limit, established connections reach the target within a minute, and no router state exhaustion occurs on the test network.",
    dep: ["candidate-pool", "connection-limits", "peer-handshake"]
  },
  "connection-limits": {
    s: "Caps the number of connections overall and per transfer, balancing swarm reach against memory, descriptors and home router capacity.",
    d: "Limits apply to total connections, connections per transfer, half-open attempts and unchoked uploads. When a limit is reached the client refuses incoming connections or drops the least useful existing ones, for example peers with no interesting pieces. Each connection costs buffers, timers and a descriptor, and consumer routers handle only a few thousand flows. The limits must be consistent with the descriptor budget. Difficult because more connections help discovery and reciprocity only up to a point and then waste resources.",
    k: ["Drop low-value connections to make room: always room for useful peers, but churn from dropping and reconnecting.", "Per-transfer plus global caps: stops one huge swarm from starving others, but the allocation of the global cap needs a policy."],
    p: ["Setting limits higher than the router's table size makes the whole home network unreliable.", "Counting only established connections ignores half-open and closing ones that still hold descriptors."],
    v: "Set a global limit of 200 and join several large swarms; the connection count stays at or below 200, useful peers replace useless ones, and the descriptor count stays under the process limit.",
    dep: ["descriptor-budget", "peer-connection-state"]
  },
  "port-mapping": {
    s: "Asks the home router to forward an external port to the client, using standard discovery protocols, so incoming connections can reach it.",
    d: "The client discovers the gateway, requests a mapping for its TCP and UDP port with a lease, renews before expiry and removes it on exit. It reads the external address to report to trackers. Both a family of device-control protocols and a simpler mapping protocol are used, since support varies. Hard parts are devices that report success but do not forward, leases that expire silently, double translation where the router's external address is itself private, and the security consideration that any local program can request mappings.",
    k: ["Automatic mapping versus manual forwarding: works without user effort on many routers, but is unreliable and some security guidance recommends disabling it.", "Short lease with renewal: stale mappings disappear if the client crashes, but a missed renewal drops reachability."],
    p: ["Trusting a router's success reply without testing leaves the client believing it is reachable when it is not.", "A mapping left behind after a crash exposes the port to whichever program takes it next."],
    v: "Start the client behind a router that supports mapping; the router's table shows the mapping, an outside probe connects, and the entry disappears after clean exit.",
    dep: ["listen-sockets", "reachability-probing"]
  },
  "hole-punching": {
    s: "Lets two peers that are both behind translation open a direct connection by sending to each other at the same time, coordinated through a third party.",
    d: "A relay peer or tracker that is reachable by both tells each the other's observed external address and port. Both then send packets toward each other at once, so each router creates an outbound mapping that admits the other's replies. It works with some translation types and fails with others, such as those that assign a different port per destination. Hard parts: timing, port prediction, and fallback when it fails.",
    k: ["Coordinated simultaneous open: allows direct transfers between two otherwise unreachable peers, but works only with certain translation behaviors.", "Relay through a third peer: always works when a relay exists, but costs the relay's bandwidth and adds latency."],
    p: ["Assuming the external port seen by the relay is the port a different destination will see fails on symmetric translation.", "Coordinating through a peer that is itself behind translation never starts, since the message cannot be delivered."],
    v: "Place two clients behind separate translators of a cone type, with no forwarded ports; a connection is established through a rendezvous peer and data flows directly between them.",
    dep: ["delay-based-udp-transport", "extension-protocol", "reachability-probing"]
  },
  "delay-based-udp-transport": {
    s: "A reliable stream transport over UDP that backs off when queuing delay rises, so bulk transfers do not fill router buffers and spoil other traffic.",
    d: "It provides ordered, reliable delivery with its own sequence numbers, acknowledgments and retransmission, and adjusts its window using measured one-way delay against a target of around a hundred milliseconds. When competing traffic arrives, queues grow and the transport yields. It also shares the UDP port with the DHT and enables hole punching. Hard parts: reproducing the machinery of a reliable stream, tuning the delay target, interactions with traffic shaping, and CPU cost compared to kernel TCP.",
    k: ["Delay-based backoff versus loss-based: keeps latency low for interactive traffic sharing the link, but may lose throughput against aggressive flows.", "User-space transport: works with hole punching and tuning control, but costs CPU and must reimplement reliability."],
    p: ["A target delay set too low makes the transport yield to a standing queue it caused itself and never recover speed.", "Packet size larger than the path allows fragments datagrams and stalls transfers."],
    v: "Run a transfer alongside a video call on the same link; measured latency of the call stays low, while with plain bulk streams it grows by hundreds of milliseconds.",
    dep: ["listen-sockets", "latency-aware-backoff", "event-loop"]
  },
  "dual-stack-networking": {
    s: "Supports both address families, listening and connecting over each and exchanging addresses of both kinds in discovery.",
    d: "The client binds sockets for IPv4 and IPv6, announces both addresses to trackers where permitted, and receives peers of both kinds in compact lists with separate fields. The DHT runs one table for each. Connection attempts may try both with a short preference delay. Benefits include avoiding translation on IPv6 paths, which are directly reachable. Hard parts are mismatched capabilities: a peer reachable on one family but not the other, privacy addresses that change, and swarms partitioned by family when peers support only one.",
    k: ["Run both families: more reachable peers and direct paths, but doubled state for tables and addresses.", "Prefer IPv6 with fast fallback: avoids translation, but a broken IPv6 path wastes the fallback delay."],
    p: ["Announcing a temporary privacy address that rotates leaves stale addresses in trackers.", "A host with IPv6 enabled but no route times out each attempt before trying IPv4."],
    v: "On a dual-stack host, confirm listeners on both families, tracker announces carrying both addresses, and peers connected over each family in the peer list.",
    dep: ["listen-sockets", "tracker-client", "dht-client"]
  },
  "reachability-probing": {
    s: "Determines whether the client can accept incoming connections and what address the world sees, to adapt behavior and inform the user.",
    d: "The client learns its external address from tracker replies, peers' handshakes or extension messages that report observed addresses, and checks reachability by noting whether any incoming connection arrives or by asking a service to connect back. The result changes behavior: unreachable clients rely on outbound dialing and hole punching, and show a warning. Hard because the evidence is indirect, a lack of incoming connections can mean unreachable or merely unpopular, and consensus is needed because a single peer's report can be wrong.",
    k: ["Majority of peer reports versus a single source: resistant to bad reports, but slow to converge in small swarms.", "Active connect-back test: definitive answer, but depends on an external service and reveals the client to it."],
    p: ["Concluding the client is unreachable after no incoming connections for a few minutes in a nearly empty swarm.", "Trusting one peer's claimed external address lets it make the client announce a false address."],
    v: "Test with a forwarded port and with none; the client reports reachable in the first case and unreachable in the second, and the reported external address matches the router's.",
    dep: ["listen-sockets", "peer-handshake", "extension-protocol"]
  },
  "ip-filtering": {
    s: "Refuses connections to and from address ranges listed in a blocklist or by user rules, applied before any protocol work.",
    d: "A filter holds ranges loaded from lists or typed by the user, stored as sorted intervals for fast lookup. It is checked on every inbound accept, outbound dial and when adding peers to the candidate pool. Uses include blocking known abusive hosts, restricting to local networks and applying country or provider rules. The challenge is scale and maintenance: lists have hundreds of thousands of ranges and go stale, and a mistake can block legitimate peers or the tracker itself.",
    k: ["Sorted interval lookup: fast checks at any list size, but loading and merging needs care for overlaps.", "Third-party lists versus user rules: broad coverage with no effort, but the list's accuracy and motives are out of your control."],
    p: ["Loading a list that includes the tracker's address silently blocks all announces.", "A blocklist that is never refreshed accumulates ranges since reassigned to innocent hosts."],
    v: "Load a list containing a test peer's address; its inbound and outbound connections are refused and logged, while peers outside the list connect normally and the lookup stays fast with a large list.",
    dep: ["candidate-pool", "listen-sockets"]
  },
  "stream-obfuscation": {
    s: "A handshake that makes the byte stream look random, by exchanging key material and encrypting the rest, to defeat simple pattern-based traffic shaping.",
    d: "Peers perform a key exchange with random padding, derive a stream cipher keyed from the shared secret and the content address, and then encrypt either only the handshake or the whole stream. The initial bytes contain no fixed protocol string. It does not authenticate peers or hide who is talking to whom, only the pattern of the content. Hard parts: handshake cost, detecting whether an incoming connection is obfuscated or plain, and the weakness that the cipher choice and padding patterns can themselves be fingerprinted.",
    k: ["Obfuscate the whole stream versus handshake only: whole-stream avoids payload matching, but costs CPU for every byte served.", "Allow plain fallback: compatibility with all peers, but a shaper can simply block the plain ones."],
    p: ["Treating obfuscation as privacy: the address and swarm membership are still visible to everyone and to the network path.", "Requiring it exclusively cuts the client off from the many peers that do not support it."],
    v: "Capture a connection with obfuscation required; the traffic has no recognizable protocol string, and both sides' payload decrypts identically, while a plain-only peer is refused.",
    dep: ["crypto-negotiation", "peer-handshake"]
  },
  "crypto-negotiation": {
    s: "Settles per connection whether to use plain, handshake-only or full-stream encryption, based on both peers' preferences and local policy.",
    d: "During the obfuscated handshake each side sends a bitmask of methods it supports and the one it prefers; the responder chooses. Policy settings are: forced (refuse plain), preferred (try encrypted first, fall back) or disabled. Outbound attempts that fail may be retried in the other mode. It must interoperate with the client's own detection of incoming type. Hard parts are fallback loops, downgrade attacks by a path that blocks encrypted attempts, and the cost of retrying for every candidate.",
    k: ["Prefer encryption with fallback to plain: maximum compatibility, but a downgrade is trivial for anyone who can block the first attempt.", "Forced encryption: strongest against shaping, but unreachable peers without support."],
    p: ["Retrying every failed encrypted dial as plain doubles connection attempts to dead peers.", "Disabling encryption in a country with traffic shaping makes the client look like a shaped protocol."],
    v: "Set policies on each side in all combinations and confirm the outcomes follow the policy table, with the fallback happening only where it is permitted.",
    dep: ["stream-obfuscation", "outbound-connector"]
  },
  "proxy-support": {
    s: "Sends the client's outbound connections, tracker requests and optionally datagram traffic through a configured proxy.",
    d: "Supported types include a generic socket-relay proxy and a web proxy, with optional authentication. The client can route peer connections, tracker and web seed requests, and name lookups separately. Datagram traffic such as the DHT needs a proxy that supports relaying UDP, otherwise it must be disabled to avoid leaking. Incoming connections cannot be proxied in most setups, which makes the client unreachable. Hard parts are leaks: any path that bypasses the proxy, like name lookups or UDP, exposes the real address.",
    k: ["Proxy all outbound traffic: hides the address from peers, but ends incoming connections and costs speed.", "Disable UDP features when proxied: avoids leaks, but loses the DHT and delay-based transport."],
    p: ["Resolving tracker host names locally while proxying the connection reveals browsing patterns to the local resolver.", "A proxy that supports only stream connections silently drops datagrams, so the DHT stops working with no error."],
    v: "Route traffic through a logging proxy and capture on the real interface; the only destination is the proxy, no direct peer, tracker or name lookup traffic appears, and DHT is off if UDP is unsupported.",
    dep: ["outbound-connector", "metadata-leak-controls", "tracker-client"]
  },
  "anonymity-network-support": {
    s: "Allows tracker and peer connections over a layered anonymity network, trading speed and reachability for hiding the client's address.",
    d: "Through a local gateway the client reaches destinations identified by overlay names rather than addresses, announces to trackers inside the network and finds peers there. All traffic is relayed through several hops, which hides endpoints from each other but multiplies latency and limits throughput. Clients adjust: fewer connections, longer timeouts, reduced extensions. The hard part is consistent anonymity, since any feature that embeds a real address, such as peer exchange or a reported external address, undoes it.",
    k: ["Overlay-internal swarms: strongest address protection, but small, slow swarms with high latency.", "Using the overlay only for trackers: some protection for announce traffic, but peer connections still expose the address."],
    p: ["Sending the real external address inside a tracker parameter or extension message deanonymizes the client despite the tunnel.", "Default timeouts tuned for the open internet drop every connection through a high-latency overlay."],
    v: "Run through the overlay and capture on the real interface; all traffic goes to the gateway, announces contain no real addresses, and transfers complete in the overlay's swarm.",
    dep: ["proxy-support", "metadata-leak-controls"]
  },
  "interface-binding": {
    s: "Restricts all sockets to a chosen network interface so traffic leaves only over, for example, a tunnel, and stops when that interface goes down.",
    d: "The client binds listening and outbound sockets to a specific interface or address, and may refuse to start or pause transfers if it is missing. Because the route is chosen by the client, packets cannot fall back to the default route when the tunnel drops. It must handle address changes on reconnection and rebind listeners. Hard parts: platform differences in how binding to an interface is expressed, name resolution that may use another path, and interface-down detection that is fast enough to avoid leaks.",
    k: ["Bind to interface versus rely on the routing table: no fallback leak when the interface drops, but the client must follow address changes itself.", "Kill-switch behavior on loss: nothing leaks, but transfers stop until the interface returns."],
    p: ["Binding to an address rather than an interface fails when the tunnel reconnects with a new address.", "Name resolution through the system resolver bypasses the binding and reveals lookups."],
    v: "Bind to a tunnel interface and take it down mid-transfer; no packets appear on the other interfaces and transfers resume after it returns with the new address.",
    dep: ["listen-sockets", "outbound-connector", "privacy-exposure"]
  },
  "metadata-leak-controls": {
    s: "Settings that limit what the client discloses in announces, handshakes and extensions, such as its address, client identifier and local network details.",
    d: "Controls include announcing a specific address or none to trackers, hiding the version string, not sending observed external addresses, disabling local discovery on untrusted networks and not including a peer identifier prefix that names the software. Announce parameters are chosen per transfer type. Hard parts: knowing every place an address can appear, from tracker URLs to extension messages, and balancing the usefulness of disclosure, such as an address needed for incoming connections.",
    k: ["Minimal disclosure by default: reduces fingerprinting and exposure, but some features such as reporting reachability depend on sharing.", "Per-feature toggles: fine control for advanced users, but a large surface to audit and many ways to misconfigure."],
    p: ["Disabling the DHT but not peer exchange still shares the address with every connected peer's contacts.", "A version string in the peer identifier lets observers fingerprint the client and its known vulnerabilities."],
    v: "Capture a session with all controls enabled; announces, handshakes and extension messages contain no client name or version and no address other than what the transport itself reveals.",
    dep: ["tracker-client", "peer-handshake", "extension-protocol"]
  },
  "token-bucket-limiter": {
    s: "The mechanism that enforces a rate by letting each connection draw from a bucket of byte credits that refill at the configured rate.",
    d: "Credits accumulate at the target rate up to a burst size, and an operation may send or receive only as many bytes as credits allow. When empty, sockets are not read or written until the next refill, so the operating system's buffers apply backpressure to the peer. Buckets can be chained, per connection, per transfer, per class and global, with a request passing through all of them. The difficulty is smoothness and fairness: coarse timers cause bursts, and the quota must be divided among many connections without starving some.",
    k: ["Token bucket with burst allowance: smooth average rate and tolerance for short bursts, but a big burst can briefly exceed a downstream limit.", "Pause reads to throttle download: effective via TCP backpressure, but delayed reads lengthen round trips seen by senders."],
    p: ["A timer that refills once per second makes traffic arrive in pulses that cause drops on the link.", "Dividing quota equally among connections wastes capacity that idle connections do not use."],
    v: "Set a limit of 500 kilobytes per second and transfer for a minute; average throughput is within a few percent of it with no multi-second bursts in a one-second sampled trace.",
    dep: ["event-loop", "peer-class-limits"]
  },
  "global-limits": {
    s: "Caps on total upload and download rates for the whole client, the setting most users adjust first.",
    d: "The global upload limit protects the home link, since a saturated uplink delays acknowledgments and degrades downloads. Good practice is setting it below the true uplink, such as eighty percent, leaving room for other uses. The download limit is rarely needed except to leave space for other users. Both feed the token buckets at the top of the hierarchy. Hard parts: the uplink capacity is unknown to the client and may change, and overhead such as headers and acknowledgments is not counted.",
    k: ["Upload limit below link capacity: keeps the connection responsive, but wastes some capacity for the sake of latency.", "Counting protocol overhead in the limit: the limit reflects the wire, but users see payload speeds lower than they set."],
    p: ["Leaving the upload limit unlimited saturates the uplink and cuts download speed to a fraction.", "Setting the limit far below the link slows every swarm and earns little reciprocation."],
    v: "Measure link throughput with the client idle, set the limit to 80 percent of uplink, and confirm that a concurrent speed test on another device still reaches its normal download rate.",
    dep: ["token-bucket-limiter", "alternate-speed-profiles"]
  },
  "per-torrent-limits": {
    s: "Rate and connection limits applied to a single transfer, so one swarm cannot consume everything.",
    d: "Each transfer can have its own upload and download rates, connection cap and slot count, layered under the global limits. They support priorities, for example capping a large background transfer, and they can come from categories. Implementation uses one bucket per transfer chained to the global bucket. The difficulty is composition: a transfer limit above the global one has no effect, and the unused share of an idle transfer should be available to the others rather than wasted.",
    k: ["Hierarchical limits: flexible layering of policy, but the effective rate is the minimum along a chain that users find hard to predict.", "Unused quota available to others: better use of the link, but borrowing logic adds complexity."],
    p: ["A per-transfer limit set higher than the global one gives users the false impression it is in effect.", "Limits that persist after a category change apply a rate the user no longer intends."],
    v: "Limit one of two active transfers to 100 kilobytes per second under a higher global limit; that transfer stays near 100 while the other uses the remaining capacity.",
    dep: ["token-bucket-limiter", "global-limits"]
  },
  "peer-class-limits": {
    s: "Groups connections into classes such as local network, encrypted or by transport, and gives each class its own rate limits.",
    d: "Each connection is assigned to classes by rule, and every class has a bucket. A connection must pass through the buckets of all its classes, so the effective rate is the tightest. Typical uses are limiting the delay-based transport, exempting local peers, or throttling peers of a certain type. The mechanism generalizes global and per-transfer limits. The difficulty lies in rule evaluation, since class membership can change when addresses or transports change, and the interplay of many overlapping buckets.",
    k: ["General class rules versus special cases: one mechanism covers many policies, but configuration is abstract and error-prone.", "Multiple buckets per connection: composable limits, but every transfer of data costs several accounting operations."],
    p: ["Overlapping classes accidentally multiply restrictions so a peer is throttled by a class the user forgot.", "Classes evaluated once at connect time miss later changes such as an address moving into an exempt range."],
    v: "Define a class for one subnet with its own limit; connections from that subnet obey it while others are unaffected, and an address change moves the connection to the proper class.",
    dep: ["token-bucket-limiter", "local-network-exemption"]
  },
  "local-network-exemption": {
    s: "Excludes traffic to peers on the same local network from rate limits, since it does not use the internet link.",
    d: "Peers whose addresses fall within private or link-local ranges, or on the same subnet, are classed as local and bypass the global limits. This lets two machines in a home share at network speed while the internet uplink stays limited. The rule must be correct about what is truly local: a large private range might be routed through a tunnel, and some networks are not trusted. Hard part: deciding locality from the address alone, which fails with overlapping private ranges and VPNs.",
    k: ["Treat private ranges as local: simple and usually right, but wrong when private addresses are reached through a tunnel that is the bottleneck.", "Exempt from the limit versus a separate higher limit: fastest transfers, but no protection if the local link is a slow wireless network."],
    p: ["A VPN that places remote peers in a private range makes the exemption send unlimited traffic over the tunnel.", "Exempting local peers from limits also exempts them from the uplink-protective slot count."],
    v: "Transfer between two machines on one subnet while the global limit is 100 kilobytes per second; the local transfer runs at network speed while an internet peer stays near the limit.",
    dep: ["peer-class-limits", "local-peer-discovery"]
  },
  "latency-aware-backoff": {
    s: "Reduces the client's rate when it detects that its own traffic is raising latency on the shared link, keeping interactive use responsive.",
    d: "The client measures round-trip or one-way delay, such as on its datagram transport or by probing, and compares it with a baseline. When delay rises beyond a target, it lowers its limits proportionally, and raises them again when delay returns to baseline. It acts at the transport level or by adjusting the global rate. Benefits are a link that remains usable for calls and browsing without manual limits. Difficulties: separating self-induced delay from external causes, and measuring a baseline on a link that is never idle.",
    k: ["Adaptive rate versus a static limit: follows capacity changes automatically, but can oscillate or settle too low when measurements are noisy.", "Operate on the datagram transport only: well-defined delay signals, but TCP connections remain unthrottled."],
    p: ["Taking the baseline while the link was already congested treats the congested state as normal and never backs off.", "Backing off in response to delay from other users' traffic starves the client unnecessarily."],
    v: "Start a large upload and a continuous latency probe on the same link; the probe's delay stays near the baseline plus the target, whereas with the backoff disabled it rises by hundreds of milliseconds.",
    dep: ["delay-based-udp-transport", "global-limits"]
  },
  "alternate-speed-profiles": {
    s: "A second set of limits switched on manually or by schedule, for example a quiet profile during work hours or while the user is on a call.",
    d: "A profile contains upload and download limits, and sometimes connection and slot counts. Switching replaces the active limits atomically without restarting transfers. Triggers include a toggle in the interface, a schedule, or an external signal such as a command. The profile mechanism is simple, but the design question is precedence: a manual toggle, a schedule and per-transfer limits must combine predictably. Applied limits take effect on the next refill so the change is immediate for users.",
    k: ["Named profiles with triggers: one click changes behavior, but the interplay with schedules must be explicit.", "Replace limits versus scale them: absolute values are easy to understand, but a fixed profile does not adapt to different links."],
    p: ["Forgetting that the alternate profile is on leaves the client throttled for days.", "A schedule and manual toggle that fight each other flip the profile every minute."],
    v: "Toggle the profile and observe the measured rate change within a few seconds with no connection resets, then set a schedule and confirm the switch at the scheduled minute.",
    dep: ["global-limits", "time-rules"]
  }
});
