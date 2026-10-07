// Details for the firewall plate, part 5: address translation, high availability and state sync.
ATLAS.details("firewall", {
  "source-nat": {
    s: "Rewriting the source address, and usually port, of outbound traffic so many private hosts share one or a few public addresses, with replies mapped back by state.",
    d: "For a new outbound flow, a rule selects a translated source from a pool or an interface address, and the device records the mapping in the flow entry. Packets leaving get the new source; replies arriving at the translated tuple are matched to the entry and rewritten back. Translation can be one-to-one, many-to-one with port allocation, or by pool. It is hard because it multiplies state, destroys source identity for downstream logs and can break protocols that embed addresses.",
    k: ["Many-to-one with port translation vs one-to-one address mapping: many-to-one saves addresses, but limits concurrent flows per address and hides the host identity from outside logs.", "Per-flow random ports vs deterministic ranges per host: random ports resist prediction, while deterministic ranges allow compact logging and abuse tracing."],
    p: ["Outside logs record only the shared address, so abuse complaints cannot be mapped to an internal host without the translation log.", "Port exhaustion toward one popular destination stops new connections while the device looks idle."],
    v: "Make connections from two internal hosts to one server, confirm the server sees the translated address with distinct ports, and the device log pairs each with its original source and destination.",
    dep: ["nat-bindings", "port-allocation", "flow-table"]
  },
  "destination-nat": {
    s: "Rewriting the destination of inbound traffic so a public address and port reach an internal server, used to publish services and to redirect traffic.",
    d: "A rule matches the public destination, replaces it with the internal address and optionally port, and creates a flow entry so the reply source is restored. Policy is usually evaluated against the translated destination, which determines which zone pair and rules apply. It can distribute across several servers or redirect traffic for transparent proxies. The challenge is the ordering of translation, routing and policy: a rule written against the wrong address silently never matches.",
    k: ["Policy matches pre-translation addresses vs post-translation: pre-translation reads like the published service, while post-translation matches the real server and is what routing sees.", "Static mapping vs load-balanced pool: static is simple and predictable, while a pool spreads load and needs health checks the firewall may not do."],
    p: ["Port forwarding exposes an internal service with weaker security than the administrator assumed.", "A rule written with public addresses in the policy never matches because the device evaluates policy after translation."],
    v: "Publish an internal service on a public port, connect from outside, confirm the server sees the original client address, and that a packet to an unpublished port is dropped.",
    dep: ["nat-bindings", "nat-policy-ordering", "flow-table"]
  },
  "port-allocation": {
    s: "Choosing translated source ports for new flows so each tuple is unique to the destination, balancing port reuse, predictability and fairness among internal hosts.",
    d: "For many-to-one translation, the allocator picks a port from a range for each new flow, ensuring that the combination of translated address, port and destination does not collide with an existing binding. Algorithms include random, sequential and per-host blocks. Reuse of ports is allowed across different destinations, which multiplies capacity. Allocation under multiple cores needs partitioned ranges to avoid locking. The hard parts are exhaustion and fairness: one host with many flows can use up the range for everyone.",
    k: ["Per-host port blocks vs a shared pool: blocks give fairness and compact logs, while a shared pool uses ports more efficiently.", "Reuse ports across destinations vs unique per address: reuse greatly raises capacity, but peers that expect unique ports break and the bookkeeping is harder."],
    p: ["A single host with a connection leak consumes the entire port range and all users lose connectivity.", "Sequential allocation lets an off-path attacker guess the next port."],
    v: "Open enough connections from one host to exhaust its block, confirm further flows are refused with a port-exhaustion counter while another host still translates, and confirm ports free after flows close.",
    dep: ["nat-bindings"]
  },
  "nat-bindings": {
    s: "The records pairing original and translated tuples for each translated flow or mapping, used to rewrite both directions and to answer which internal host used which public port.",
    d: "A binding stores the original source and destination, the translated ones, protocol, timeout and ownership. Reverse lookup by translated tuple finds the binding for replies. Some bindings are per flow, others per endpoint, which let unsolicited inbound traffic from any peer reach a mapped port. They are exported to logs, so abuse can be traced after the fact. The challenge is volume and lifetime: millions of bindings each need accurate timers and must be synchronized to a standby.",
    k: ["Endpoint-independent mappings vs per-destination mappings: endpoint-independent works with peer applications, while per-destination is stricter and breaks them.", "Log every binding creation vs aggregate: complete traceability, with large volumes and storage costs, against compact blocks that identify a host less precisely."],
    p: ["Bindings not synchronized to the standby break every translated flow at failover.", "Without logged binding history, public address and time cannot identify the internal host."],
    v: "Create a translated flow, query the binding table for the translated tuple and confirm it returns the original tuple; fail over and confirm the same translation continues on the peer.",
    dep: ["flow-table", "timeouts-and-aging"]
  },
  "checksum-payload-fixup": {
    s: "Updating packet checksums after address changes and, for protocols that carry addresses in their data, adjusting payload bytes and the sequence numbers that follow.",
    d: "Changing an address or port invalidates the IP and transport checksums, which the device recomputes incrementally from the changed words. If a payload rewrite changes the length, as in text-based control protocols, subsequent sequence numbers must be offset for the rest of the connection in both directions. Fixups run in software or are offloaded to the network interface. The challenge is correctness across fragments, offloaded checksum states and options, and keeping offsets in sync with the peer.",
    k: ["Incremental checksum update vs full recompute: incremental is cheap and exact for small changes, while recompute is simpler and costs a pass over the data.", "Rewrite payloads vs refuse protocols that embed addresses: rewrite keeps legacy applications working, but adds a stateful parser and sequence offset tracking."],
    p: ["A packet with checksum offload pending is rewritten and leaves with a wrong checksum.", "A length-changing rewrite shifts sequence numbers, and a retransmission is translated with the wrong offset."],
    v: "Translate a packet and capture both sides, confirm the checksums on each are valid; translate a protocol with an embedded address and confirm the receiver parses it and later segments are accepted.",
    dep: ["source-nat", "hardware-offload"]
  },
  "hairpin-nat": {
    s: "Handling internal clients that reach an internal server through its public address, by translating both source and destination so the reply returns through the firewall.",
    d: "A client on the inside connects to the public address of a published server. Destination translation sends the packet to the internal server on the same network, but with the client's own address as source the server would reply directly and the client would see a source it did not contact. The firewall therefore also translates the source to its own address. It makes names work the same inside and outside. The challenge is loss of source identity at the server and complexity in rule order.",
    k: ["Hairpin translation vs split-horizon DNS: hairpin works with one name and no DNS change, while split DNS keeps client addresses and avoids loading the firewall.", "Translate source for hairpin flows only vs all internal traffic: narrow translation limits side effects, while broad is easier to write and hides all client addresses."],
    p: ["The server sees only the firewall address and cannot apply per-client access controls or logging.", "Missing hairpin rule yields the symptom that the service works from outside and fails from inside."],
    v: "Connect from an internal client to the public address of an internal server and confirm the connection works, the server sees the firewall as the source, and the log shows both translations.",
    dep: ["destination-nat", "source-nat"]
  },
  "stateless-and-nat64": {
    s: "Translation with no per-flow state, mapping addresses by fixed formula, and translation between the two address families so single-family clients can reach the other.",
    d: "Stateless one-to-one mappings rewrite the prefix and keep the host part, so no table is needed and any packet can be translated by itself. Family translation synthesizes addresses from a prefix, converts headers between the two formats and maps ICMP types and fragmentation behavior, usually with a companion DNS component that synthesizes names. It is hard because the header formats differ in options, fragment handling and size limits, and because address-embedding protocols cannot be translated.",
    k: ["Stateless mapping vs stateful: stateless scales, survives failover without sync and permits inbound reachability, while stateful allows address sharing and port reuse.", "Translate headers only vs also ALG fixups: header-only is fast and general, while payload fixups support legacy protocols at high cost."],
    p: ["A path size limit difference between families makes large packets disappear when error messages are filtered.", "Applications with literal addresses embedded in data fail through family translation."],
    v: "Reach a single-family server from a client of the other family through the translator, confirm the exchange succeeds and the server logs the mapped source; confirm a packet round-trips without any table entry in stateless mode.",
    dep: ["icmpv6-policy", "fragment-handling"]
  },
  "nat-policy-ordering": {
    s: "The fixed sequence in which translation, routing and policy evaluation occur, which determines which addresses a rule sees and which zone pair is chosen.",
    d: "On ingress the device may translate destination first, then looks up the route for the translated address, determines the egress zone, evaluates policy, and applies source translation just before transmit. Some designs evaluate policy before translation. The order is fixed by the architecture and documented for each device. It decides whether rules refer to public or private addresses and what happens when two translation rules overlap. The challenge is that this sequence is the most common source of rules that appear correct but never match.",
    k: ["Policy on pre-NAT addresses vs post-NAT: pre-NAT matches what clients see, while post-NAT matches internal reality and requires zone and route consistency.", "First-match among NAT rules vs a separate priority order: first match is easy to reason about, while priority lets groups of rules be managed independently."],
    p: ["A rule written for the public address never matches because policy is evaluated on the translated destination.", "Overlapping translation rules apply the broader one first and hide the specific one."],
    v: "Use the packet trace tool on a published service and confirm it prints translation, routing, zone, policy and source translation in order, with the addresses each rule saw, matching a live capture.",
    dep: ["hook-points", "routing-integration", "rule-ordering"]
  },
  "failover-roles": {
    s: "A pair where one firewall actively forwards traffic and the other stands ready, taking over addresses and state when the active unit or its links fail.",
    d: "The active unit owns the virtual addresses and processes traffic; the standby synchronizes configuration and state and monitors the active. On failure the standby claims the addresses, announces them to neighbors so switches update their tables, and starts forwarding. Preemption settings decide whether a recovered unit takes the role back. It is simple to reason about. The challenges are failover time, since neighbors must learn new locations, and keeping the standby's idle capacity useful and verified to work.",
    k: ["Active/passive vs active/active: passive is simpler and predictable under failure with full capacity available, while active/active uses both units and risks overload after one fails.", "Automatic preemption vs sticky roles: preemption restores intended placement, while sticky roles avoid a second disruption when a failed unit returns."],
    p: ["The standby has not received a recent policy or state sync and takes over with stale rules.", "Failover works in tests but neighbors with long address-table timers keep sending to the failed unit."],
    v: "While running a long download, power off the active unit, and confirm the standby takes over within the target time, the download continues, and the log records the role change and cause.",
    dep: ["heartbeat-election", "state-sync", "config-sync"]
  },
  "active-active-clustering": {
    s: "Several firewalls sharing the load of one logical device, with flows distributed among members and state replicated or owned so any member's failure moves its flows to others.",
    d: "Traffic is spread to members by a front-end switch, routing or the cluster itself, and each flow has an owner that holds authoritative state, with others forwarding packets to the owner if they receive them by mistake. State may be replicated to a backup owner. Capacity grows with members. It is hard because of asymmetric flows, per-flow rebalancing, scaling of shared tables like NAT port ranges, and because the control and forwarding of the cluster must work at the same speed as the traffic.",
    k: ["Flow owner with redirect vs full state replication to all: owner is memory efficient and survives member loss only with a backup, while full replication is simple and expensive at scale.", "Cluster-level load balancing vs external load balancing: internal is transparent and handles asymmetry, while external is simple and requires symmetric hashing."],
    p: ["Reverse-direction packets arrive at a member that is not the owner and are dropped as invalid.", "A shared NAT port range is divided inconsistently, and two members allocate the same binding."],
    v: "Run many flows through a three-member cluster, remove one, and confirm flows owned by it either continue via a backup or reset as designed, all within stated time, and no flow is double-translated.",
    dep: ["state-sync", "flow-hashing", "heartbeat-election"]
  },
  "heartbeat-election": {
    s: "The messages members exchange to detect each other's liveness and the rules by which exactly one is chosen active, with timers that trade detection speed for false failovers.",
    d: "Members send small keepalives over one or more dedicated links and, optionally, data interfaces. If several consecutive messages are missed, the peer is declared dead. Priority and health scores decide who becomes active, and election must give the same answer on both sides. Timers of a few hundred milliseconds are typical. The difficulty is distinguishing a dead peer from a busy or partitioned one: fast timers cause flapping when a unit is briefly overloaded.",
    k: ["Aggressive timers vs conservative: fast timers cut outage time, but a busy CPU or a brief link glitch causes needless failover.", "Multiple heartbeat paths vs one: multiple paths reduce false alarms from one failed link, but add cabling and more states to reason about."],
    p: ["A heartbeat link shared with data traffic is congested during a flood, triggering failover exactly under attack.", "Both units compute a different winner from stale health data and both claim active."],
    v: "Cut the heartbeat link while data links remain up and confirm both units agree on a single active, then restore it and verify no repeated role changes occur within an hour.",
    dep: ["path-monitoring"]
  },
  "state-sync": {
    s: "Continuous replication of connection, translation and session state to the standby, so existing flows survive failover instead of being reset.",
    d: "Changes to flow entries, bindings and dynamic data are sent to the peer over a dedicated link, either as full snapshots at start and then deltas, or batched at intervals. The standby installs the state without forwarding. After takeover, packets of existing flows match entries and continue. It costs bandwidth and CPU proportional to the connection rate, not the packet rate. The challenge is lag and consistency: a flow created just before failure may not have arrived, and sequence numbers advance faster than updates.",
    k: ["Synchronize every connection vs only long-lived ones: complete continuity, but doubles update load for short connections that nobody would miss.", "Synchronous per-flow acknowledgment vs asynchronous batches: synchronous guarantees state before packets pass, while async keeps latency low and loses the newest flows on failure."],
    p: ["Sequence numbers advanced since the last update make the standby reject packets of continuing flows as out of window.", "A heavily loaded sync link falls behind silently, and failover resets most connections."],
    v: "Open a thousand connections, fail over immediately, and count how many survive; confirm the count meets the stated target and the sync lag metric before failure explains any losses.",
    dep: ["flow-table", "nat-bindings", "sequence-validation"]
  },
  "config-sync": {
    s: "Copying committed configuration and dynamic policy data from the active unit to its peer so both enforce the same rules at all times.",
    d: "On commit the active unit sends the new configuration, and sometimes the compiled ruleset, to the peer, which applies it and acknowledges. Version and checksum comparisons detect divergence, and modes handle a peer that was offline during changes. Dynamic data such as address group members and identity mappings are synchronized separately. The challenge is atomicity across the pair: a window where units run different policies leaves failover with unexpected rules, and software version differences can make the same configuration behave differently.",
    k: ["Push compiled rulesets vs configuration only: compiled pushes are fast and identical, while config-only compiles on each unit independently and is robust to version differences.", "Commit succeeds only when the peer has applied vs best effort: guarantees symmetric policy, but a down peer blocks all changes."],
    p: ["A change made while the peer is offline is never applied, and the standby later takes over with an old policy.", "Different software versions compile the same configuration into different behavior."],
    v: "Commit a change and confirm both units report the same configuration version and checksum within seconds; disconnect the peer, commit again, reconnect, and confirm the peer converges automatically.",
    dep: ["config-model", "atomic-ruleset-swap"]
  },
  "split-brain-prevention": {
    s: "Mechanisms ensuring that when the units cannot talk, at most one keeps forwarding, using quorum, a third witness or external health checks, so addresses are not claimed twice.",
    d: "If the link between units fails while both are healthy, each sees the other as dead and may become active, leading to duplicate addresses, conflicting translations and asymmetric chaos. Prevention uses several heartbeat paths, a third-party witness or arbitration device, quorum in clusters of three or more, and rules that make a unit that loses contact with the outside network step down. The challenge is that every choice trades availability for safety, since a unit that cannot prove it should be active must be silent.",
    k: ["Witness or quorum arbitration vs peer-only decisions: arbitration prevents dual active, but adds a component whose own failure must be handled.", "Stand down on isolation vs stay active: standing down avoids conflicts, while staying active keeps service when the other unit really is down."],
    p: ["Both units become active, each reads addresses and creates conflicting state, and neighbors flip between them.", "A witness reachable only by a path that also fails with the heartbeat gives no extra protection."],
    v: "Isolate the units from each other on all heartbeat links while both stay powered, and confirm exactly one forwards; check neighbors see one address owner and rejoin occurs without a second role change.",
    dep: ["heartbeat-election", "path-monitoring"]
  },
  "path-monitoring": {
    s: "Health checks of links and upstream reachability, such as pinging a gateway, that feed failover decisions so a unit with a dead path gives up its active role.",
    d: "Beyond the heartbeat, a unit tests that its interfaces are up and that targets beyond them respond: a next hop, a server, a public address. Failures reduce the unit's health score. When the score falls below the peer's, the peer takes over. Monitors can be per interface or per route and can trigger path failover for dual-uplink designs. The difficulty is false signals: monitoring a single remote host that is itself down causes needless failovers, and tolerance settings must match upstream behavior.",
    k: ["Monitor several independent targets vs one: several avoid false failovers from one dead target, but need more probes and a quorum rule.", "Fail over the unit vs fail over only the route: unit failover is clean for hardware faults, while route failover limits disruption when only one uplink fails."],
    p: ["The monitored target stops answering probes by policy, and the firewall fails over repeatedly with nothing wrong.", "Both units lose the same upstream and fail over back and forth."],
    v: "Block the monitored gateway on the active unit only, and confirm health score drops, failover occurs within the threshold, and returns only after the check passes for the configured stable period.",
    dep: ["interfaces-and-vlans", "routing-integration"]
  },
  "rolling-upgrade": {
    s: "Upgrading the units of a pair or cluster one at a time while the others carry traffic, with version compatibility between peers so state and configuration still sync.",
    d: "The standby is upgraded and rejoins, state is resynchronized, roles are swapped, and the former active is upgraded. During the window two versions run together, so sync formats and heartbeat protocols must be compatible within a supported range. Pre-checks verify configuration compatibility and capacity. Rollback is planned. The challenge is that the first upgraded unit is untested with real traffic until it takes the active role, and incompatibilities show up only at that swap.",
    k: ["Mixed-version compatibility window vs same version only: a window allows zero-downtime upgrades, but constrains how much the sync formats may change.", "Swap roles and verify before upgrading the second unit vs upgrade both quickly: slower and safer, since a fault is found while the old version still stands by."],
    p: ["State sync formats differ between versions, so connections reset at the role swap despite the plan.", "The upgraded unit compiles the policy differently, and a behavior change is found only after it is active."],
    v: "Upgrade the standby, swap, run test traffic and a long download through it, then upgrade the other unit; confirm the download survives and the configuration and state counts match on both units.",
    dep: ["failover-roles", "state-sync", "config-sync"]
  },
});
