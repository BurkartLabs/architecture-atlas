// Details for the DHT overlay plate, part 3: latency optimizations, joining, churn.
ATLAS.details("dht-overlay", {
  "proximity-neighbor-selection": {
    s: "Choosing, among the contacts that are valid for a routing table slot, the one with the lowest measured round-trip time, so each hop is short without adding hops.",
    d: "Many table slots can be filled by any of several nodes, for example every node sharing a given prefix. The node measures delay to candidates and keeps the fastest. Hop count stays the same, because any valid candidate makes the same progress in identifier space, but each hop is shorter in real distance. Total lookup latency drops substantially. It is hard because delay changes with congestion and routing, measurements cost traffic, and picking only the fastest concentrates load and makes the table predictable to an attacker.",
    k: ["Proximity-chosen entries versus first-come entries: proximity cuts latency without more hops, but costs measurements and makes the table depend on changing conditions.", "Choosing the single fastest versus a random pick among the fast few: random picks spread load and resist targeting, at a small latency cost."],
    p: ["A measurement taken during a congestion spike evicts a good contact for a worse one.", "An attacker that answers pings instantly looks closest and wins table slots."],
    v: "Compare median lookup latency in a network with realistic delays with and without proximity selection, holding the hop count fixed, and confirm latency falls while the hop count stays the same.",
    dep: ["rtt-measurement", "k-buckets", "contact-record"]
  },
  "rtt-measurement": {
    s: "Estimating the round-trip time to each contact from the timing of ordinary request and response pairs, smoothing over noise, so latency-aware decisions need no extra probes.",
    d: "Every request that gets a reply gives a sample: time sent to time received. The node keeps a smoothed average and a variance for each contact, using the same method as stream transports. Samples from retransmitted requests are discarded because they are ambiguous. The estimate feeds timeouts, proximity selection and server choice. It is hard because samples are sparse for rarely used contacts, bias toward responsive peers, and include queuing delay at the remote node, which is not network distance.",
    k: ["Piggybacking on normal traffic versus dedicated probes: piggybacking is free, but gives no data on contacts we are not talking to.", "Smoothed average versus minimum observed: the average reflects typical conditions, the minimum approximates path delay but ignores real congestion."],
    p: ["Using a sample from a retransmitted request mismatches request and reply and gives a false very low or very high time.", "A busy remote node's processing delay is mistaken for a slow network path."],
    v: "Between two hosts with a known injected delay of 80 ms, confirm the estimate converges to within ten percent after twenty exchanges and follows a step change to 200 ms within a few more.",
    dep: ["rpc-layer", "contact-record"]
  },
  "network-coordinates": {
    s: "Assigning each node a position in a low-dimensional space so that distance between coordinates predicts round-trip time, allowing delay estimates to nodes never measured.",
    d: "Nodes adjust their coordinates after each measured exchange, nudging them so that coordinate distance matches the observed delay, in the style of a spring simulation. After many updates, the distance between any two nodes' coordinates approximates their delay. Contacts carry coordinates, so a node can rank candidates without probing each. It helps pick near replicas and near next hops. It is hard because the Internet violates geometric assumptions, with asymmetric and non-triangle paths, and coordinates drift and can be lied about by attackers.",
    k: ["Coordinates versus direct measurement: coordinates estimate delay to nodes never contacted, but are only approximate and need ongoing updates.", "More dimensions versus fewer: more dimensions fit real delays better, but cost message size and give more room for an attacker to cheat."],
    p: ["A node reporting false coordinates attracts or repels traffic, and can distort the whole embedding.", "Coordinates that have not converged after joining give wild estimates that mislead selection."],
    v: "Compare predicted and measured delay for one thousand random pairs and confirm the median relative error is within the documented bound, and degrades gracefully when ten percent of nodes report false positions.",
    dep: ["rtt-measurement", "contact-record"]
  },
  "wider-branching": {
    s: "Making the routing table finer, so each hop resolves several bits of the identifier instead of one, which cuts the number of hops at the cost of more contacts per node.",
    d: "A table resolving one bit per hop needs about log2 of the population hops. Grouping several bits into a digit gives a table with more entries per row but fewer rows, so hops fall to log base 2 to the power b. Each bucket covers a smaller slice of the space, so there are more buckets with similar contents. It speeds lookups because fewer round trips are needed. It is hard because table maintenance grows with the number of entries, and every entry needs probing and refreshing.",
    k: ["More bits per hop versus fewer: fewer hops and lower latency, but more routing state to store, probe and keep fresh.", "Uniform branching versus finer branching only near the target: finer near the target helps the final steps, but complicates table shape and splitting rules."],
    p: ["Increasing branching without scaling the refresh budget leaves the larger table mostly stale.", "A larger table is a bigger surface for a crawler to read in few requests."],
    v: "Run lookups in a network of ten thousand nodes with one and with four bits per hop, and confirm hops fall by roughly the predicted factor while per-node table size rises by the corresponding amount.",
    dep: ["k-buckets", "bucket-splitting", "iterative-lookup"]
  },
  "one-hop-routing": {
    s: "Keeping a full list of all members at every node, so any key is reachable in a single hop, and spreading membership changes by gossip.",
    d: "Each node holds the identifiers and addresses of every other node and maps a key to its owner locally. Joins and departures are broadcast in a hierarchy or by periodic gossip so lists converge within seconds. Lookups cost one message. It suits networks small or stable enough to afford the bandwidth, such as the nodes of one data center or consortium. It is hard because maintenance traffic grows with the population times churn, and views differ briefly, so a few lookups go to a node that is no longer the owner and must be forwarded.",
    k: ["Full membership versus logarithmic state: full membership gives the lowest latency and simplest lookup, but its update cost grows with the network size and churn.", "Gossip dissemination versus a hierarchy of aggregators: gossip has no special nodes but converges probabilistically, a hierarchy is faster but depends on its coordinators."],
    p: ["Applying it to a network with high churn spends all bandwidth on membership updates.", "Stale membership routes a request to a former owner, which must forward or fail."],
    v: "Join and then remove a node in a network of five hundred, and confirm every node's list reflects the change within the target propagation time, and that lookups meanwhile still resolve in at most two hops.",
    dep: ["ownership-rule", "partition-healing", "size-estimation"]
  },
  "adaptive-timeouts": {
    s: "Setting how long to wait for each reply from measured round-trip time and variance, so slow links are not declared dead and dead nodes are not waited on.",
    d: "The timeout for a contact is its smoothed round-trip time plus a multiple of the deviation, with a floor and a ceiling. After a timeout it grows, commonly doubling, and shrinks as replies arrive. Contacts with no history use a conservative default. This lets a lookup move on from a dead peer within a few hundred milliseconds instead of waiting several seconds. It is hard because too tight a timeout declares live peers dead and triggers duplicate requests, and too loose makes lookups wait on dead ones.",
    k: ["Per-contact timeouts versus one global timeout: per-contact adapts to each link, but needs reliable estimates that new contacts lack.", "Doubling on failure versus fixed retry: doubling is polite during congestion, fixed retries recover faster from isolated loss."],
    p: ["A global timeout set for fast nodes marks all slow mobile peers dead.", "Timeouts that never grow under real congestion cause retransmission storms that make the congestion worse."],
    v: "Inject a one-second delay into half of a node's contacts and confirm timeouts for those contacts rise within a few exchanges, and that the number of spurious retransmissions to them drops.",
    dep: ["rtt-measurement", "retransmission"]
  },
  "lookup-hedging": {
    s: "Sending a duplicate request to another candidate when the first is slower than a threshold, trading a little extra traffic for a much shorter slowest-case latency.",
    d: "After a request has been outstanding longer than a high percentile of expected reply time, the lookup sends the same request to the next best candidate, and uses whichever reply arrives first. This cuts the long tail caused by a few overloaded or half-dead peers. The extra load is a few percent of requests. It is hard because the threshold must adapt, and hedging under overload adds load exactly when the network can least afford it, so it needs a budget.",
    k: ["Hedging after a delay versus sending to all candidates immediately: delayed hedging adds little traffic, immediate duplication gives lowest latency but multiplies load.", "Fixed threshold versus percentile of recent latency: a percentile tracks conditions, but needs enough samples to be stable."],
    p: ["Hedging with no budget during an overload doubles requests to already struggling nodes.", "Hedged stores that both succeed produce duplicate writes that the receiver must handle idempotently."],
    v: "Compare the ninety-ninth percentile lookup latency with hedging on and off while a tenth of nodes are slowed, and confirm the tail falls while extra requests stay under the stated budget.",
    dep: ["parallel-queries", "adaptive-timeouts"]
  },
  "bootstrap-list": {
    s: "The initial contacts shipped with or configured into the software: addresses of nodes believed to be reachable, used only to find the first neighbors.",
    d: "A node starting with an empty table needs at least one working contact from outside the overlay. The list is compiled into the software, read from configuration, fetched from a well-known host name or published through another channel. The node contacts entries until one answers, then asks it for the nodes closest to its own identifier. After that, it no longer needs the list. It is hard because the list is a point of failure and control: it ages as nodes leave, and whoever controls it decides what part of the network a new node first sees.",
    k: ["Hard-coded addresses versus names that resolve at run time: hard-coded lists need no infrastructure but rot, names can be updated but depend on a naming service and its operator.", "A long list versus a short one: a long list survives losses and spreads load, but costs more probing and gives a hostile publisher more entries."],
    p: ["A list where every entry is long gone leaves new nodes unable to join at all.", "A compromised list sends every new node to attacker-controlled peers and eclipses them from the start."],
    v: "Start a fresh node with an empty table and a list with some dead entries, and confirm it reaches a live one within the timeout and has a populated table after the self-lookup.",
    dep: ["seed-nodes", "peer-cache"]
  },
  "seed-nodes": {
    s: "Long-running, well-connected nodes operated to be reachable at stable addresses, whose role is to answer new nodes' first requests, not to hold special authority.",
    d: "Seeds run the ordinary protocol and are listed in bootstrap lists or published under a name. They accept many short connections from newcomers and return contacts. Their addresses are stable and their capacity higher than average. A seed that disappears is replaced by editing the list. They are the one place where the overlay has an operator. It is hard because they concentrate load and trust: they see every new node, can be blocked or attacked, and a few of them define what newcomers believe the network looks like.",
    k: ["Operator-run seeds versus volunteer seeds: operated seeds are reliable and quick to fix, but are a central dependency, volunteers spread control but vary in quality.", "Seeds that return random contacts versus ones closest to the asker: random contacts spread newcomers across the network, closest contacts speed up the join but reveal the table."],
    p: ["Seeds overwhelmed during a mass restart drop requests, and nodes retry in sync and make it worse.", "Seed addresses that are blocked by a network operator keep nodes behind it from ever joining."],
    v: "Start two hundred nodes at once against a single seed and confirm all complete joining within the target time and the seed's request rate stays under its limit.",
    dep: ["find-node-rpc", "rate-limiting"]
  },
  "peer-cache": {
    s: "A local record of peers seen in earlier runs, so a returning node can rejoin without contacting bootstrap servers at all.",
    d: "As the node runs it records recently responsive contacts, favoring long-lived ones, and saves them to disk at shutdown. On the next start it tries cached peers before any bootstrap list. It reduces the load on seeds, avoids a central dependency in normal operation and rejoins quickly. It is hard because the cache decays fast on mobile or home networks, and a cache seeded by an attacker's contacts keeps pointing back to them on every restart.",
    k: ["Cache-first versus bootstrap-first: cache-first keeps seed load low and works when seeds are blocked, bootstrap-first gives a fresher view when the cache is stale.", "Caching many contacts versus few: more contacts raise the odds that one is alive after a long gap, but cost probing time at start."],
    p: ["Using a cache after months offline gives only dead contacts, and the node must silently fall back to bootstrap.", "A cache dominated by one network prefix places the node in a neighborhood chosen by someone else."],
    v: "Stop a node for ten minutes with the seeds unreachable, restart it, and confirm it joins using only cached peers with a table fill close to its previous level.",
    dep: ["table-persistence", "contact-record"]
  },
  "self-lookup-join": {
    s: "The join step in which a new node looks up its own identifier through a bootstrap contact, which finds its closest neighbors and populates its buckets along the way.",
    d: "After inserting the bootstrap contact, the node runs a lookup for its own identifier. Every node queried in the process learns about the newcomer, and every reply gives it contacts at successively closer distances. Afterward it refreshes the buckets farther than its closest neighbor by random lookups. After a few seconds, the node has a table consistent with its position and is known to those who should know it. It is hard because the join relies on the bootstrap contact's honesty, and a node close to many others generates many queries at once.",
    k: ["Looking up its own identifier versus asking the bootstrap contact for neighbors directly: the self-lookup spreads awareness of the newcomer along the path, a direct request is cheaper but leaves others unaware.", "Following with refreshes of all buckets versus waiting for demand: immediate refresh gives a full table fast, lazy fill spreads load over time."],
    p: ["A bootstrap contact that returns only attacker nodes leaves the new node with a table made of them.", "Starting service before the self-lookup finishes causes the node to answer with a nearly empty table."],
    v: "Join a node to a stable network of one thousand and confirm that within a few seconds it has contacts in most buckets, that its closest neighbors match a full scan, and that they list it in theirs.",
    dep: ["iterative-lookup", "bootstrap-list", "bucket-refresh"]
  },
  "peer-exchange": {
    s: "Peers telling each other about other peers they know in ordinary messages, so tables fill from traffic without extra lookups.",
    d: "Messages between nodes carry a few contacts known to the sender: recently useful, long-lived or in the receiver's neighborhood. The receiver treats them as candidates and probes before inserting. This spreads knowledge quickly in small or newly formed networks and helps nodes behind restrictive firewalls. It is hard because the information is unauthenticated hearsay that spreads quickly, and a malicious node can use it to push attacker-controlled contacts or the address of a victim into many tables.",
    k: ["Exchange as a side effect of messages versus explicit requests: side-channel exchange costs nothing extra, but is harder to rate limit and audit.", "Accepting exchanged contacts directly versus after verification: direct acceptance fills tables quickly, verification stops hearsay poisoning but delays use."],
    p: ["Inserting unverified exchanged contacts lets one node poison thousands of tables with the same fake entries.", "Exchanged addresses of a victim cause many nodes to send probes at it."],
    v: "Have an attacker node send fake contacts via exchange, and confirm recipients probe them, find them unresponsive, and do not insert them, while genuine contacts are added after a response.",
    dep: ["contact-record", "poisoning-defense", "liveness-probes"]
  },
  "local-discovery": {
    s: "Finding peers on the same local network by multicast or broadcast announcements, which needs no bootstrap server and works with no Internet connection.",
    d: "A node sends a periodic announcement on the local segment with its identifier and port, and listens for those of others. Nodes answering become contacts. It gives instant, free joins on a campus or home network and sometimes the only way to reach a peer behind the same translator without going through it. It is hard because it only works on one network segment, many networks block multicast, the traffic is unauthenticated so any local device can claim to be a peer, and it leaks the node's presence to the local network.",
    k: ["Multicast announcements versus a known local rendezvous: multicast needs no configuration, but is blocked on many networks.", "Always on versus on demand: always-on finds neighbors quickly, but constantly advertises the node to everyone on the segment."],
    p: ["Trusting local announcements as being trustworthy lets any device on a shared network inject contacts.", "Multiple nodes on one machine confuse each other when they share the same announcement port."],
    v: "Start two nodes on one segment with no bootstrap list and no Internet access, and confirm they discover each other within the announcement interval and exchange a lookup successfully.",
    dep: ["datagram-transport", "contact-record"]
  },
  "key-handoff-on-join": {
    s: "When a node joins, its new closest neighbors transfer the records it is now responsible for, so reads find them on the newcomer immediately.",
    d: "After the self-lookup, neighbors that hold keys closer to the newcomer than to themselves send those records to it, triggered by seeing the new contact or by the newcomer's request. The newcomer validates them and sets expiry from receipt. This restores the replica count on the nearest set. It is hard because the newcomer may be unreachable in practice or misbehaving, so handoff happens before it has proven it will keep data, and the set of keys to hand over is large for a node joining a dense neighborhood.",
    k: ["Push by the neighbors versus pull by the newcomer: push is faster and needs no request, pull lets the newcomer limit what it accepts and avoids unsolicited writes.", "Handing over records immediately versus after a probation period: immediate gives full replicas at once, probation avoids placing data on nodes that vanish within minutes."],
    p: ["Short-lived nodes receive large transfers and leave, so repeated handoff burns bandwidth for nothing.", "Handing everything over at once saturates the newcomer's link and delays its first lookups."],
    v: "Join a node with an identifier among the closest to a stored key and confirm the record is present on it within the target time and a lookup now includes the newcomer among the replicas.",
    dep: ["neighbor-change-handoff", "self-lookup-join", "record-validation"]
  },
  "liveness-probes": {
    s: "Small requests sent to contacts to learn whether they still answer, used before evicting, promoting or relying on them.",
    d: "A probe is a lightweight request such as a ping that a live node answers immediately. Nodes probe contacts that have been quiet for an interval, before replacing a bucket entry and before promoting a cached contact. A reply updates last-seen time and round-trip estimate. Probes keep the table's contents verified without lookups. It is hard because probes are needed in volume across thousands of contacts and cost bandwidth, a single lost probe is weak evidence, and an attacker can answer probes while refusing real work.",
    k: ["Probing quiet contacts on a schedule versus only on demand: scheduled probes keep the table fresh, on-demand saves traffic but leaves surprises for lookups.", "One probe versus several before declaring failure: several avoid false positives on lossy links but delay detection."],
    p: ["Probing every contact at the same interval produces periodic bursts across the network.", "A node that answers pings but drops data requests passes the check and stays in the table."],
    v: "Stop a contact and confirm it is probed within the interval, marked suspect and replaced after the configured number of failures, while a briefly lossy but live contact survives.",
    dep: ["rpc-layer", "contact-record", "adaptive-timeouts"]
  },
  "failure-detector": {
    s: "The logic that decides when a contact is treated as gone, combining missed probes, timeouts and lookup failures into a single, tunable judgment.",
    d: "Each contact has a failure counter that rises on a timeout and resets on any valid reply. Crossing a threshold marks it stale, then removes it. Thresholds can depend on how important the contact is, with bucket neighbors judged more carefully than distant ones. Detection speed and accuracy are in tension. It is hard because a network cannot tell a dead peer from a slow link, and the right trade-off depends on churn: a low threshold wastes contacts, a high one leaves dead ones in routing.",
    k: ["Fixed failure count versus accrual-style suspicion level: a fixed count is simple, a suspicion score adapts to per-contact latency, but is harder to tune.", "Treating contact failure as final versus allowing recovery: final removal keeps the table clean, recovery tolerates temporary outages but keeps dead entries longer."],
    p: ["A threshold of one timeout empties the table during a brief local network outage.", "Blaming the contact for timeouts caused by our own congestion removes healthy peers."],
    v: "Disconnect the node's own network for ten seconds and confirm the table survives, then kill a single contact and confirm it is removed within the stated detection time.",
    dep: ["liveness-probes", "staleness-counters", "adaptive-timeouts"]
  },
  "staleness-counters": {
    s: "Per-contact counts of consecutive failures to answer, used to rank which entries to try last and which to replace first.",
    d: "Each contact tracks the number of queries it has failed since it last replied. Lookups prefer contacts with zero. Entries above a threshold are skipped in lookups and become the first candidates for eviction when a replacement waits. The counter resets on success, so transient failures leave no mark. It is hard because it is a local view: a contact may be unreachable from this node only, because of routing or filtering, while healthy for everyone else.",
    k: ["Consecutive-failure count versus time since last success: counts adapt to traffic rate, time since success is simpler but penalizes contacts that were simply not asked.", "Skipping stale contacts versus trying them last: skipping saves wasted queries, trying last keeps a chance to recover a node that is only slow."],
    p: ["A counter that never resets keeps a recovered peer excluded forever.", "Counting failures caused by our own rate limiting against the contact makes honest peers look dead."],
    v: "Drop replies from one contact for five requests and confirm its counter reaches five and lookups skip it, then restore it and confirm the counter resets on the first reply.",
    dep: ["contact-record", "failure-detector"]
  },
  "graceful-leave": {
    s: "A node that shuts down on purpose tells its neighbors and hands over its stored records, so the overlay repairs immediately instead of after timeouts.",
    d: "Before exiting, the node sends a leave notice to nodes in its table, or at least its closest neighbors, and transfers the records it holds to the nodes that now become responsible. Neighbors remove it and promote replacements. Records survive without waiting for the next refresh. Most departures are crashes or sleeps, so this is an optimization. It is hard because the notice is unauthenticated and can be forged to evict a victim, and because the time on shutdown is short, especially on mobile devices that give a process seconds to exit.",
    k: ["Announcing departure versus silent exit: announcing speeds repair and preserves data, but needs authentication and is skipped by crashes anyway.", "Handing over all records versus a recent subset: all gives full continuity, a subset fits in a short shutdown window."],
    p: ["Unsigned leave messages let an attacker remove honest nodes from tables by announcing departure on their behalf.", "Relying on graceful leave for durability loses data on every crash."],
    v: "Shut a node down cleanly and confirm its closest neighbors remove it within seconds and hold its former records. Then crash a node and confirm repair happens only after the failure timeout.",
    dep: ["neighbor-change-handoff", "signed-messages", "k-closest-replication"]
  },
  "session-weighting": {
    s: "Preferring contacts that have been online longest when filling the table, because peer uptime follows a heavy tail: the longer a peer has stayed, the longer it likely will.",
    d: "The table keeps contacts in order of how long they have been known to be responsive and evicts the youngest, not the oldest, when it needs space. Peers with hours of uptime are more likely to remain than those seen for minutes. This lowers the table's failure rate and the repair traffic it needs. It also makes tables hard to flood with new identities. It is hard because it assumes a particular lifetime distribution, favors the established, which concentrates traffic on them, and is blind to a long-lived but malicious node.",
    k: ["Favoring old contacts versus favoring the newest: old contacts are more stable and resist flooding, but concentrate load and slow the entry of new nodes.", "Uptime as claimed versus as observed: observed uptime is trustworthy, claimed uptime can be inflated by an attacker."],
    p: ["A table made entirely of long-lived peers leaves a new node with little way to become visible.", "Trusting a self-reported uptime lets an attacker jump to the front of every bucket."],
    v: "Simulate a network with heavy-tailed session lengths and compare the fraction of dead entries in tables with and without age preference, confirming a lower dead fraction with preference.",
    dep: ["bucket-eviction", "contact-record", "churn-assumptions"]
  },
  "churn-estimation": {
    s: "Measuring how quickly peers arrive and leave from observed contact failures, so refresh and replication intervals can adapt to real conditions.",
    d: "A node observes the lifetime of its contacts and the rate at which they fail, producing an estimate of the median session length. From it, it can set refresh intervals, decide how often to republish and choose how aggressively to probe. In a stable network the node does less maintenance; in a volatile one it does more. It is hard because the estimate is noisy and delayed, attackers can distort it by joining and leaving rapidly, and a node's own contacts are a biased sample of the network.",
    k: ["Adaptive intervals versus fixed: adaptive intervals save traffic when stable and protect data when volatile, but can be driven by manipulated measurements.", "Local estimate versus shared network estimate: local needs no coordination, shared is more accurate but adds protocol and trust."],
    p: ["Adaptive refresh driven by an attacker's rapid churn forces every node into maximum maintenance traffic.", "Estimating from contacts that survived long enough to be recorded biases the figure toward stability."],
    v: "Change the simulated churn rate tenfold and confirm that the estimate follows within a few intervals, that refresh intervals move accordingly, and that lookup success stays above the target throughout.",
    dep: ["contact-record", "failure-detector"]
  },
  "partition-healing": {
    s: "Detecting and repairing a split of the overlay into groups that cannot reach each other, so they merge back into one network once connectivity returns.",
    d: "A partition arises when a link failure or outage separates nodes. Each side keeps operating as a smaller overlay and may re-form around its own members. When connectivity returns, nodes need a way to meet: bootstrap lists, cached peers from before and occasional random contacts. Contacts gathered from before the split reconnect the halves. It is hard because after enough time each side's tables contain only its own members and no stale links remain to connect through, and on rejoin the same keys may have been written differently on both sides.",
    k: ["Keeping old contacts around versus pruning aggressively: retained contacts are a path back after a split but cost probing, pruning keeps tables clean but loses the way home.", "Merging by seed contact versus by background random probing: seeds are reliable but central, random probing is decentralized but slow."],
    p: ["Both halves overwrite the same mutable key with different values, and sequence rules pick a winner that discards one side's update.", "A split so long that nobody retains a cross-half contact needs the bootstrap list to heal."],
    v: "Split a test network into two halves for ten minutes, reconnect them, and confirm that within the target time lookups for keys stored on either side succeed from both, with a single consistent view.",
    dep: ["bootstrap-list", "peer-cache", "signed-mutable-records"]
  },
  "size-estimation": {
    s: "Estimating the number of nodes in the overlay from local observations, such as the density of identifiers near the node, to tune parameters and detect attacks.",
    d: "In a uniform identifier space, the average distance between neighbors is inversely proportional to the population. A node measures how close its nearest neighbors are, or counts distinct contacts found by lookups, to estimate the total. Applications use it for sizing replication, choosing lookup breadth and sanity checking. An unexpectedly dense neighborhood suggests many Sybil identities near the node. It is hard because small samples are noisy, and an attacker can fake density.",
    k: ["Density-based local estimate versus a crawl: local estimates are free and continuous, crawls are more accurate but heavy.", "Using the estimate to tune parameters versus only to report it: tuning adapts the system to size, but exposes parameters to manipulation by anyone able to skew the estimate."],
    p: ["Averaging a few samples gives results that vary by factors of two between nodes.", "An attacker adding many nearby identifiers makes the network appear far larger and disables defenses that scale with size."],
    v: "Estimate the size on a simulated network of ten thousand nodes, from several nodes, and confirm the estimates lie within a stated factor. Add a thousand identifiers near one node and confirm its estimate jump is flagged.",
    dep: ["xor-metric", "k-buckets", "sybil-resistance"]
  },
});
