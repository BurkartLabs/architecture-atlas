// Details for the routing daemon plate, part 2: link-state and path-vector protocol engines.
ATLAS.details("routing-daemon", {
  "hello-and-adjacency": {
    s: "Periodic greeting packets that discover neighbors on a link, check that settings agree, and decide whether to form a full adjacency.",
    d: "Each router sends hellos on every enabled interface listing the neighbors it has heard. Receiving a hello that lists oneself proves two-way communication. Parameters such as timers, area, network type and authentication must match or the neighbor is ignored. A neighbor whose hellos stop for the dead interval is declared down. Hello timers set failure detection speed, so faster hellos mean faster detection and more load. It is hard to tune because small mismatches cause adjacencies that never form with little visible reason.",
    k: ["Short hello intervals vs relying on a separate failure detector: short hellos give faster detection but load the control plane; a dedicated detector keeps hellos slow and cheap.", "Strict parameter matching vs tolerance: strictness avoids inconsistent behavior but makes misconfiguration produce silent non-adjacency."],
    p: ["A mismatched timer or area on one side leaves the neighbor stuck and the log only reports hellos being ignored.", "Many interfaces with very short timers overload the CPU on a large router."],
    v: "Connect two test routers with matching settings and confirm each lists the other as two-way within a few hello intervals; change one timer and confirm the adjacency is refused with a parameter-mismatch counter.",
    dep: ["timer-wheel","raw-packet-io","interface-state-feed"]
  },
  "neighbor-state-machine": {
    s: "The set of states a neighbor passes through, from down to fully adjacent, and the events that move it between them.",
    d: "A neighbor starts down, becomes init when a hello is heard, two-way when mutual, then exchanges database descriptions, requests missing entries, and reaches full when synchronized. Each state defines which packets are accepted and what to send next. On any error the neighbor falls back and the exchange restarts. Not every neighbor on a shared link needs to go full, which limits flooding. The difficulty is the many races: a neighbor restarting, duplicated packets and a database changing mid-exchange.",
    k: ["Full adjacency with every neighbor on a shared link vs only with a designated router: full mesh converges simply but scales quadratically in state and flooding.", "Resetting the whole adjacency on an error vs repairing it: reset is simple and loses time; repair keeps state and is much harder to get right."],
    p: ["A neighbor stuck in exchange because of mismatched maximum packet size never reaches full and the link carries no routes.", "A restarting neighbor reusing sequence values confuses a stale state machine."],
    v: "Bring up a neighbor and log each transition; confirm the sequence down, init, two-way, exchange, loading, full, and that restarting one side drops back through the states and recovers to full.",
    dep: ["hello-and-adjacency","database-exchange"]
  },
  "database-exchange": {
    s: "The synchronization procedure in which two new neighbors compare summaries of their link-state databases and request only the entries they lack.",
    d: "Neighbors first agree who leads, then send description packets summarizing each entry by identifier, sequence and age. Each side compares them with its own database and issues requests for entries that are missing or older, then receives them through the normal reliable flooding path. When no requests remain, the adjacency is full. The procedure is paced with acknowledgements so a large database does not overwhelm a small router. It is hard because the databases keep changing during the exchange and because large databases make initial synchronization slow.",
    k: ["Summaries then selective requests vs sending the entire database: summaries save bandwidth when databases are similar, with more round trips.", "Paced exchange vs as fast as possible: pacing protects slow routers; speed shortens convergence for fast ones."],
    p: ["Resynchronizing a large database after every flap amplifies a flapping link into a flooding storm.", "An interface with a smaller packet-size limit than its neighbor stalls the exchange."],
    v: "Start with a neighbor whose database differs from yours by ten entries; confirm that exactly ten entries are requested and received and the adjacency reaches full without a full transfer.",
    dep: ["link-state-database","reliable-flooding"]
  },
  "link-state-database": {
    s: "The set of all link-state advertisements known for an area, identical on every router in it, and the input to shortest-path computation.",
    d: "The database stores each advertisement by its originator and type, with sequence number, age, checksum and body. Lookups by key are constant time; iteration feeds SPF. Newer versions replace older ones; aged-out entries are purged. Because every router must hold identical copies, a mismatch is a bug signal that cannot be self-healed without comparing checksums. It grows with the network, and its size limits how big an area or level can be, which is why networks are divided into areas.",
    k: ["One flat database vs hierarchical areas: flat is simple and consistent but flooding and memory scale with the whole network; areas shrink each database at the cost of hiding detail.", "Storing parsed structures vs raw advertisements: parsed speeds SPF but costs memory; raw is compact and requires reparsing."],
    p: ["Databases diverge on two routers because of a bug or corrupted entry, and routing loops follow without any alarm.", "A router with limited memory runs out as the area grows and starts losing advertisements."],
    v: "Compute a checksum over each router's database in one area and confirm all values are identical, then remove one link and confirm all databases converge to a new identical checksum within seconds.",
    dep: ["route-memory-pools"]
  },
  "lsa-origination": {
    s: "Builds and refreshes the router's own advertisements describing its links, attached networks and external routes, and floods them when anything changes.",
    d: "The router rebuilds its advertisement whenever an interface, adjacency or attached prefix changes, increments the sequence number and floods it. Even when nothing changes it refreshes each one periodically before it ages out. Rate limits stop a flapping interface from generating a new version for every flap. Different advertisement types describe routers, shared networks, summaries and external routes. The difficulty is generating the minimum churn: spurious regeneration floods the whole area for no reason.",
    k: ["Rate-limiting regeneration vs advertising each change immediately: limits calm a flapping link but slow the news of a real failure by the limit interval.", "Refreshing periodically vs only on change: periodic refresh recovers from lost or corrupted copies, at a constant background load."],
    p: ["A flapping interface triggers regeneration and a flood on each flap and keeps every router in the area busy computing.", "A refresh timer synchronization across the network creates periodic bursts."],
    v: "Toggle one interface at a test router three times in a second and confirm a bounded number of new advertisements are flooded, with increasing sequence numbers, and all neighbors show the final state.",
    dep: ["interface-event-tracking","reliable-flooding","link-state-database"]
  },
  "reliable-flooding": {
    s: "Delivers each advertisement to every router in the area exactly as the originator wrote it, using acknowledgements, retransmission and sequence comparison.",
    d: "A router receiving a newer advertisement installs it, schedules SPF, and forwards it on all interfaces except the one it arrived on. Neighbors acknowledge, and unacknowledged copies are retransmitted. Older copies are ignored and answered with the newer. Checksums detect corruption. Flooding is the reason convergence is fast, and the reason instability is costly: every change reaches every router. Pacing and batching limit its load, and sequence number rollover and age rules have to be handled exactly to avoid stuck old data.",
    k: ["Immediate flooding vs batching: immediate propagates news fastest; batching and pacing reduce load and packet counts during storms.", "Acknowledged hop-by-hop vs end-to-end: hop-by-hop recovers locally and quickly, with more state per neighbor."],
    p: ["A misbehaving router that originates changes at high rate causes network-wide flooding and CPU exhaustion.", "Sequence numbers reaching their maximum without proper handling leave an advertisement impossible to update until it ages out."],
    v: "Originate a new advertisement from one test router and confirm every other router has the identical copy and sequence number within the expected propagation time, and no retransmissions remain pending.",
    dep: ["link-state-database","neighbor-state-machine","raw-packet-io"]
  },
  "areas-and-levels": {
    s: "A hierarchy that divides a large network into regions, each with its own database, so flooding and computation stay local and only summaries cross boundaries.",
    d: "Routers inside an area know full detail only for that area. Border routers belong to two or more levels, keep a database per area, and advertise summaries of one into the other. A backbone connects all areas. Changes inside an area are not flooded outside it, which contains instability and shrinks computation. The tradeoff is that summarized routes hide topology, so paths between areas may not be optimal, and the border routers become critical points. Designing areas around geography and failure domains matters more than size alone.",
    k: ["Many small areas vs one large area: small areas contain churn and cost, but add border routers, summarization and possible suboptimal routing.", "Two-level hierarchy vs flat with larger databases: modern hardware can handle large flat areas, avoiding border complexity, but failures reach everything."],
    p: ["An area partitioned from the backbone loses reachability to other areas even though links physically exist.", "Summarization hides a failure inside an area, so other areas keep sending traffic into a black hole."],
    v: "Fail a link inside one area and confirm routers in other areas run no shortest-path computation, while border routers update their summaries only if reachability changed.",
    dep: ["link-state-database","summarization"]
  },
  "designated-router-election": {
    s: "Chooses one router to represent a shared link, so that routers on it synchronize with that router rather than with each other.",
    d: "On a broadcast segment with n routers, a full mesh of adjacencies is n squared. Instead, hellos carry a priority, and the router with the highest priority, tiebroken by identifier, becomes designated; a backup is elected too. Others form adjacencies only with these two. The designated router describes the segment in an advertisement and floods on its behalf. Elections are not preemptive, so a router joining later does not displace the incumbent. The weakness is that a heavily loaded or unstable designated router affects every router on that link.",
    k: ["Elected representative vs a full mesh: the election cuts state and flooding sharply, but concentrates function and requires handling its failure.", "Point-to-point mode where available vs broadcast mode: point-to-point removes elections and speeds failure detection, but requires links that are really two-party."],
    p: ["A weak router winning the election because of identifier tiebreak becomes the bottleneck for the segment.", "Setting all priorities to zero leaves no representative and adjacencies never form."],
    v: "Attach five routers to one segment, confirm exactly one designated and one backup are elected, then stop the designated and confirm the backup takes over and a new backup is elected.",
    dep: ["hello-and-adjacency","neighbor-state-machine"]
  },
  "spf-computation": {
    s: "Runs a shortest-path algorithm over the link-state database to find the best route to every router and prefix, with the router itself as the root.",
    d: "The database is treated as a weighted graph with the router as the root. A priority-queue-based algorithm finds the lowest-cost path to each node; prefixes attached to a node inherit its path and cost. Equal-cost paths are all kept for multipath. The result goes to the RIB as routes with next hops. Computation time grows with the size of the area and is run after changes. It is hard because it must be exact, deterministic across routers, and fast enough not to delay other tasks.",
    k: ["Full recomputation vs incremental: full is simple and reliably correct; incremental saves work for small changes with much more complexity.", "Running on the main thread vs a worker: a worker avoids stalling keepalives; the main thread needs no synchronization over the database."],
    p: ["Two routers with different tiebreak rules for equal-cost paths choose different next hops and create a loop.", "A computation that runs too long on a large area delays hellos and causes false failure detection."],
    v: "Compute routes on a test topology with known answers including equal-cost paths, and confirm the RIB contains exactly the expected next hops and costs, then compare with a reference implementation's output.",
    dep: ["link-state-database","link-metrics","global-rib"]
  },
  "incremental-spf": {
    s: "Updates only the part of the shortest-path tree affected by a change, and recomputes prefix routes separately when only attached prefixes changed.",
    d: "If a change affects only a leaf network, no tree recomputation is needed: only the route for that prefix is updated. If a link changes, only the subtree that depended on it is rebuilt. Classification of the change decides which path to take. Savings are large for big networks where most changes are small. The risk is subtle bugs: incremental results must always equal a full computation, so implementations periodically verify or fall back to full recomputation.",
    k: ["Incremental with periodic full verification vs always full: speed on large networks, at the cost of a second code path to test and trust.", "Separating tree computation from prefix computation: prefix changes become cheap, but the data model must track which prefix hangs off which node."],
    p: ["A bug in the incremental path yields routes slightly different from a full computation, which no one notices until a loop occurs.", "A change classified as small that actually affects the tree leaves stale paths in place."],
    v: "After a sequence of random link and prefix changes in a test lab, compare the incremental result with a forced full computation and confirm they are identical for every prefix.",
    dep: ["spf-computation","link-state-database"]
  },
  "link-metrics": {
    s: "The cost assigned to each link, which the shortest-path computation minimizes, usually derived from bandwidth but configurable to steer traffic.",
    d: "Each interface has a metric: by default computed from its speed against a reference bandwidth, or set manually. The metrics are advertised, summed along paths, and used in comparisons. Traffic engineering by metric changes which links carry load. Wide metric ranges allow fine distinctions. Metrics also influence which routes are considered equal-cost. The weakness is that metric tuning is global, since a change to steer one flow may move others, and defaults based on old speed assumptions treat fast links as equal.",
    k: ["Bandwidth-derived metrics vs manual: derived values stay consistent as links change, but cap out when speeds exceed the reference; manual values are exact and drift.", "Narrow vs wide metric fields: wide allow fine control and large networks; narrow is smaller and limits path costs."],
    p: ["A reference bandwidth too low makes a one-gigabit and a hundred-gigabit link cost the same, so traffic is balanced onto the slow one.", "A manually set metric left over after maintenance steers traffic over an unintended path."],
    v: "Set a metric on one of two parallel paths in a lab, run the computation, and confirm the lower-cost path alone carries the route, then equalize the metrics and confirm both next hops appear.",
    dep: ["interface-state-feed"]
  },
  "summarization": {
    s: "Replaces many detailed routes with fewer summary routes at area borders, and uses stub or limited areas that receive a default route instead of external detail.",
    d: "A border router collapses ranges of prefixes in one area into a covering summary for others, so a change inside does not propagate. Stub areas receive no external routes, only a default, which cuts database size on small routers. The summary is advertised while any part of the range is reachable, which can hide partial failure. Careful design of address blocks per area makes summaries possible. The difficulty is that summarization trades convergence and size for precision, and requires address plans built for it.",
    k: ["Summaries hiding detail vs full detail everywhere: summaries contain churn and shrink tables, but black holes occur when a part of the range fails and the summary stays.", "Default-only stub areas vs full tables: stubs run on small routers, but lose the ability to choose among exits by destination."],
    p: ["A summary remains advertised after most of its range is unreachable, so traffic is attracted and dropped.", "Overlapping summaries from different borders create inconsistent paths for the same destinations."],
    v: "Withdraw one prefix of a summarized range inside an area and confirm no advertisement leaves the area; withdraw the whole range and confirm the summary is withdrawn after it.",
    dep: ["areas-and-levels","route-aggregation"]
  },
  "session-state-machine": {
    s: "The lifecycle of a session with a neighbor, from idle through connecting and opening to established, with the timers and errors that move it between states.",
    d: "A session begins idle, attempts a transport connection, exchanges opening messages carrying identity, timers and capabilities, confirms with keepalives, and enters established, where updates flow. Any error sends a notification and closes the transport. A hold timer expiring without a message tears down the session, and keepalives are sent at a third of that interval. Both sides may connect at once, producing a collision resolved by a defined rule. It is hard because it is the root of most operational issues, and each reset withdraws all of a neighbor's routes.",
    k: ["Long hold timers vs short: long hold times survive brief congestion, short detect failures quickly but reset sessions on load.", "Active connecting from both sides vs passive on one: both-active recovers faster but needs collision handling; passive is simpler and depends on the other side."],
    p: ["A hold timer shorter than the time the neighbor takes to process a full-table burst drops the session mid-transfer in a loop.", "Collision handling bugs create duplicate sessions, and the connection flips back and forth."],
    v: "Bring up a test session and watch the state log, then block traffic for longer than the hold time and confirm the session closes with a hold-timer notification and all neighbor routes are withdrawn.",
    dep: ["tcp-transport","timer-wheel","capability-negotiation"]
  },
  "capability-negotiation": {
    s: "The exchange in the opening message of optional features each side supports, so only features both understand are used on the session.",
    d: "Each side lists capabilities such as address families it can carry, four-byte network identifiers, graceful restart, extended message sizes and multiple paths. The session uses the intersection. A feature one side lacks is not used, and an unknown capability is ignored. This lets the protocol evolve without breaking old implementations. The weakness is that a negotiated mismatch can be subtle: a feature agreed to but implemented differently, or a required capability absent, causes the session to be refused with an error that is hard to interpret.",
    k: ["Negotiate at session start vs require a version bump: negotiation allows incremental adoption, but features are fixed for the session's life and changing them needs a reset.", "Ignoring unknown capabilities vs rejecting: ignoring keeps interoperability; rejecting finds mismatches early and breaks sessions."],
    p: ["Enabling a new feature on one side requires a session reset to renegotiate, causing an outage for a trivial change.", "A buggy implementation advertises a capability it handles incorrectly, producing malformed updates later."],
    v: "Establish sessions with neighbors that advertise different capability sets and confirm the daemon reports the negotiated intersection for each, and only uses features present in both.",
    dep: ["session-state-machine","message-codec"]
  },
  "message-codec": {
    s: "Encodes and decodes protocol messages to and from their wire format, validating every field and reporting the exact error for malformed input.",
    d: "Messages have a header with type and length, followed by fields in a defined order, some variable length and nested, such as lists of prefixes and attributes. The decoder checks bounds, lengths and values before using them and maps errors to defined responses: ignore the attribute, treat the update as withdrawn, or reset the session. It is exposed to untrusted data from the network, so it is a security boundary. It is hard because the protocol has accumulated optional and variable fields, and incorrect error handling can propagate bad data or crash.",
    k: ["Treat-as-withdraw for a malformed attribute vs session reset: withdrawing contains the damage to one route, but silently removes it; reset is simple and takes down every route.", "Hand-written decoder vs generated from a specification: hand-written is fast and tuned, but easy to get wrong on edge cases; generated is consistent."],
    p: ["A length field not checked against remaining bytes lets one crafted message crash or corrupt the daemon.", "Resetting on a single malformed optional attribute lets one neighbor's bug take down the session and all its routes."],
    v: "Feed the decoder a corpus of truncated, oversized and corrupted messages and confirm every case ends in the specified error handling, never a crash, and valid messages decode identically to a reference.",
    dep: []
  },
  "update-processing": {
    s: "Handles each received update: parses it, runs inbound policy, stores accepted routes, and triggers best-path selection for affected prefixes.",
    d: "An update lists withdrawn prefixes and new reachable prefixes with shared attributes. Withdrawals remove entries; announcements are checked for loops and sanity, then run through inbound policy, stored in the neighbor's table and compared against other candidates. Many prefixes share one set of attributes, so storing attributes once and referencing them saves memory. Work is batched and prioritized so that a full table arriving does not starve other sessions. The hard part is throughput under churn and fairness among neighbors.",
    k: ["Shared attribute storage vs per-route copies: sharing cuts memory by large factors, but needs reference counting and careful updates.", "Round-robin processing across neighbors vs first-come: round-robin keeps one noisy neighbor from delaying others, at the cost of slower completion for the noisy one."],
    p: ["A neighbor sending a large burst monopolizes the processing loop and delays keepalives of every other session.", "Withdrawals processed after a later announcement of the same prefix leave stale routes."],
    v: "Receive a full table from one test neighbor while another session carries steady updates, and confirm both complete: the full table loads within budget and the steady session never misses a keepalive.",
    dep: ["message-codec","path-attributes","policy-evaluator","adj-rib-in"]
  },
  "path-attributes": {
    s: "The properties attached to each route, such as the path of networks, origin, preference, metric and tags, that best-path selection and policy compare and modify.",
    d: "Attributes are well-known mandatory ones, such as path and next hop, and optional ones, such as tags and metric, some of which are transitive and pass through routers that do not understand them. Each has defined handling when absent or invalid. Identical attribute sets are interned so routes share them. The set grows as extensions are added, and unrecognized transitive attributes must be preserved. The difficulty is that attribute semantics are spread over specifications, and every one adds a case to the comparison.",
    k: ["Passing unknown optional attributes through vs dropping: passing allows new features to deploy across old routers, and carries any attribute abuse with it.", "Interned immutable sets vs mutable per-route attributes: interning saves memory and speeds comparison, but any modification requires building a new set."],
    p: ["An implementation that drops a transitive attribute it does not understand breaks a feature across the entire network path.", "Lack of limits on attribute sizes lets one route consume disproportionate memory."],
    v: "Send a route with an unknown optional transitive attribute through a test router and confirm it arrives unchanged at the next neighbor with the partial flag set as the specification requires.",
    dep: ["message-codec","route-memory-pools"]
  },
  "adj-rib-in": {
    s: "The per-neighbor table of routes as received, before and after inbound policy, kept so policy can be reevaluated without asking the neighbor again.",
    d: "Each neighbor has its own input table keyed by prefix, holding the original attributes and, usually, the policy result. Keeping the original allows a policy change to be applied immediately by reevaluation. It also supports the monitoring feed and explanations of why a route was filtered. The cost is memory per neighbor, which multiplied by hundreds of neighbors and million-route tables dominates daemon memory. Some implementations keep only accepted routes and use a request to neighbors to refresh instead.",
    k: ["Keeping all received routes vs only accepted: all gives instant policy changes and explanations; accepted only saves large memory and needs refresh requests.", "Per-neighbor tables vs one shared table with neighbor tags: per-neighbor is clearer and parallelizes; shared saves memory through common structure."],
    p: ["Memory scales with neighbors times table size, and adding sessions can exhaust memory unexpectedly.", "Discarding unaccepted routes makes a later policy loosening impossible to apply without a neighbor refresh."],
    v: "Count routes held for each of ten test neighbors against routes they announced, confirm they match including filtered ones, then loosen a policy and confirm newly accepted routes appear without session traffic.",
    dep: ["update-processing","route-memory-pools"]
  },
  "best-path-selection": {
    s: "The ordered tiebreak procedure that picks one best route per prefix from all candidates, comparing preference, path length, origin, metric and finally identifiers.",
    d: "For each prefix with several candidates, the daemon applies an ordered list of comparisons: highest preference, shortest path, lowest origin type, lowest metric, prefer external to internal, lowest cost to the next hop, and finally the lowest router identifier. The winner is installed and advertised. Some comparisons depend on state outside the route, like interior cost to the next hop, so a topology change can alter a result. It is hard because the procedure must be deterministic and loop-free, and one misordered step creates oscillation.",
    k: ["Strict deterministic ordering of all candidates vs pairwise comparison: deterministic ordering gives the same winner independent of arrival order, at the cost of more comparisons.", "Always comparing metrics vs only among the same neighbor network: always comparing is simple but can create inconsistent choices that oscillate."],
    p: ["Order-dependent comparison yields different winners depending on update arrival, and the network oscillates.", "A change in interior cost silently moves the best path of every route using that next hop at once."],
    v: "Present a test prefix with six candidates differing in each attribute in turn and confirm the winner changes at the step documented for each difference, and is identical regardless of arrival order.",
    dep: ["adj-rib-in","path-attributes","next-hop-resolution"]
  },
  "adj-rib-out": {
    s: "The per-neighbor record of what has been advertised, used to send only differences and to know what to withdraw.",
    d: "After best-path selection, outbound policy and attribute changes are applied per neighbor, and the result is compared with what that neighbor was last told. Only changes are sent: new announcements and withdrawals. Keeping this record lets the daemon recover from partial failures and answer what was advertised. Sharing the computed result among neighbors with equal outbound policy reduces work. The cost is memory, and the challenge is pacing: sending a full table to a new neighbor must not starve the others.",
    k: ["Storing per-neighbor output state vs recomputing on demand: stored output supports exact differences and inspection, at memory cost; recomputation saves memory and makes diffs imprecise.", "Immediate sending vs batching updates by timer: batching packs more prefixes per message and delays news."],
    p: ["Without recorded output, a policy change cannot tell which prefixes to withdraw, so the neighbor holds stale routes.", "A new neighbor receiving a full table slows updates to existing neighbors."],
    v: "Change an outbound policy affecting 1,000 prefixes and confirm exactly those prefixes appear as updates or withdrawals to the neighbor, nothing else is sent, and the neighbor's table matches afterward.",
    dep: ["best-path-selection","policy-evaluator","update-groups"]
  },
  "update-groups": {
    s: "Neighbors with identical outbound policy are grouped so the daemon computes and encodes each advertisement once and copies it to every member.",
    d: "Group membership depends on equivalence of outbound policy, session type and negotiated capabilities. For a group, the daemon runs outbound policy once, formats the update message once, and replicates it to each member's transport. Slow members use buffered copies without holding back fast ones. For routers with hundreds of neighbors, this cuts CPU by a large factor. It is hard because members differ in speed, and a single slow neighbor must not hold memory for everyone or force the group to wait.",
    k: ["Computing once per group vs per neighbor: large CPU savings, but grouping logic and slow-member handling add complexity.", "Letting slow members lag with buffered updates vs holding the group: lagging keeps fast members current, and buffers must be bounded."],
    p: ["A single slow neighbor holding shared buffers consumes unbounded memory unless it is split off or reset.", "Group membership changing after a configuration edit sends some neighbors duplicate or missed updates."],
    v: "Configure one hundred neighbors with identical policy and confirm outbound policy runs once per route, not one hundred times, by counting evaluations, while a deliberately slowed member does not delay the rest.",
    dep: ["adj-rib-out","policy-evaluator","tcp-transport"]
  },
  "route-reflection": {
    s: "A router that reflects routes learned from one internal neighbor to others, so internal routers need sessions only with reflectors, not with every router.",
    d: "Within one network, routes learned from outside must reach every router, and normally that needs a full mesh of internal sessions. A reflector accepts routes from its clients and passes them on to other clients and to non-clients, according to rules. Loop prevention uses an originator identifier and a cluster list. Reflectors reduce sessions from n squared to about n, and are usually deployed redundantly. The cost is that reflectors choose one best path for their clients, which can hide paths and change what each client would choose.",
    k: ["Reflection vs full mesh: reflection scales sessions linearly but clients see only the reflector's best path.", "Redundant reflectors in one cluster vs separate clusters: a shared cluster identifier saves memory and loses redundancy detail; separate clusters give clients more paths and more state."],
    p: ["The reflector's best path differs from what a client would select, so traffic takes a suboptimal exit or loops internally.", "Misconfigured clusters create reflection loops that the loop prevention attributes are meant to catch but silently drop routes."],
    v: "Build a topology with two reflectors and three clients, confirm that a route announced by one client reaches the others, and that stopping one reflector leaves all routes intact through the other.",
    dep: ["best-path-selection","path-attributes","session-state-machine"]
  },
  "confederations": {
    s: "A way to divide one large network into sub-networks that act like separate networks internally and appear as one externally, reducing internal session counts.",
    d: "Each sub-network has its own identifier and runs full-mesh or reflected sessions internally. Between sub-networks, sessions behave like external ones with some attributes preserved. The path records which sub-networks a route passed through using special path segments, and these are removed at the confederation's edge. It can ease migration and administrative separation. Operational complexity is high, since policy must differentiate the member boundary from the real external boundary, and it is used less often than reflection.",
    k: ["Confederation vs reflection to scale internal sessions: confederations give policy boundaries between parts and complexity; reflection is simpler and keeps one policy domain.", "Preserving local preference across member boundaries vs resetting it: preserving keeps a consistent view and can leak preferences between parts."],
    p: ["Mixing identifiers and member numbers in configuration causes sessions to be treated as the wrong type and refused.", "Path segments leaked outside the confederation expose internal structure and confuse external loop checks."],
    v: "Split a lab network into two member networks, announce an external route into one, and confirm the other receives it with a member segment in the path, and external neighbors see none.",
    dep: ["path-attributes","session-state-machine"]
  },
  "multiprotocol-extensions": {
    s: "Lets one session carry routes for several address families and services, such as IPv4, IPv6, labeled routes and virtual-network routes, each with its own tables.",
    d: "Updates carry the address family and service type with the prefixes and next hops, negotiated in capabilities. Each family has its own input and output tables and policy. This allows one session to distribute IPv6 prefixes, labeled paths for virtual networks, or other data, using the same state machine and transport. The generality makes it a distribution mechanism for much more than internet routes. The difficulty is per-family differences in next-hop format and error handling, and the memory for each family.",
    k: ["One session for all families vs a session per family: one session shares keepalive and state and a reset affects every family; separate sessions isolate failures at the cost of more sessions.", "Unified table structure vs per-family code: unified lets new families be added cheaply and hides family-specific behavior."],
    p: ["A reset caused by a problem in one family takes down all families on that session.", "Next-hop encoding differences between families cause a route to be installed with an unusable next hop."],
    v: "Run IPv4 and IPv6 families over one test session and confirm each has its own counts; break an IPv6 prefix and confirm the session stays up with the IPv4 table unaffected, per configured error handling.",
    dep: ["capability-negotiation","update-processing","message-codec"]
  },
  "add-paths": {
    s: "Allows a neighbor to advertise more than one path for the same prefix, each tagged with an identifier, so receivers can use alternatives for fast failover or load sharing.",
    d: "Normally one best path per prefix is advertised, so a receiver cannot know alternatives. With additional paths, each path has an identifier and several are sent, chosen by a selection rule such as the best two or all with a distinct next hop. Receivers keep them in their tables, and the best-path result and backups are available without waiting for new advertisements. It improves convergence and multipath. The cost is more routes and memory, and care to avoid exploding the table or re-advertising loops.",
    k: ["Advertising several paths vs only the best: several paths allow instant backup and better multipath, but multiply table size and update load.", "Sending all paths vs a limited set: all is complete and unbounded; a limited set bounds memory but may omit the useful alternative."],
    p: ["Advertising every path from every router multiplies update volume and memory with the number of exits.", "Path identifiers reused inconsistently across sessions cause a withdraw to remove the wrong path."],
    v: "Advertise a prefix from three exits with additional paths enabled, confirm the receiver holds three paths with distinct identifiers, and withdraw one to confirm failover uses a path already in memory.",
    dep: ["adj-rib-out","capability-negotiation","best-path-selection"]
  }
});
