// Details for the SDN controller plate, part 2: path computation, overlays and virtual networks, verification.
ATLAS.details("sdn-controller", {
  "shortest-path": {
    s: "Computes least-cost routes across the topology graph, giving every pair of endpoints a forwarding path using link costs that reflect distance, speed or policy.",
    d: "The controller runs a graph algorithm over the topology store, with costs from link speed, delay or administrative weights, and turns each path into per-device forwarding entries. Results are cached and updated incrementally when a link changes, because recomputing all pairs on every event is too slow at scale. The difficulty is agreement between computation and reality: a path computed on stale topology sends traffic into a dead link, and ties must be broken deterministically.",
    k: ["Compute all pairs ahead versus compute on demand: ahead gives instant first packets, on demand saves memory and table space but delays the first packet of each flow.", "Single cost metric versus several weighted: one metric is predictable, several fit richer goals but make paths hard to explain."],
    p: ["Random tie-breaking between equal paths moves flows between routes after every recomputation and reorders packets.", "Recomputing the whole graph on every link flap overloads the controller during instability."],
    v: "In a lab with two routes between hosts of different cost, confirm traffic takes the cheaper one in a packet capture. Fail a link on it and confirm traffic moves to the other with recovery time recorded.",
    dep: ["topology-store","link-port-state"]
  },
  "constrained-path": {
    s: "Finds routes that satisfy limits beyond cost, such as minimum available bandwidth, maximum delay, required or excluded nodes and link attributes.",
    d: "Links carry attributes, such as capacity, current reservation, delay and administrative tags. The algorithm prunes links that violate a constraint and searches the rest, or solves a harder multi-constraint problem heuristically, since finding a path meeting two additive limits is computationally hard. Results depend on reservations made earlier, so computations must read a consistent snapshot. The difficulty is that a feasible answer may not exist, and the failure must be explained clearly.",
    k: ["Prune then search versus exact multi-constraint solving: pruning is fast and predictable but can miss feasible paths, exact solving is slow and may not finish.", "Compute against a snapshot versus live state: snapshots are consistent but can allocate a link another request just took."],
    p: ["Two requests computed concurrently against one snapshot both claim the last of a link's bandwidth.", "'No path found' returned with no reason, so operators cannot tell whether capacity or topology is the cause."],
    v: "Request a path needing more bandwidth than the shortest route has free and confirm a longer route with capacity is chosen. Request more than any route offers and confirm a rejection names the binding link.",
    dep: ["shortest-path","bandwidth-reservation","link-port-state"]
  },
  "traffic-engineering": {
    s: "Optimizes how all traffic loads the network at once, placing flows to avoid hot links and meet demands, using measured or forecast traffic between sites.",
    d: "A traffic matrix, built from counters and samples, is the input. An optimizer assigns each demand to one or more paths so the maximum link utilization is minimized or priorities are met, and it outputs path and split-ratio changes. It runs periodically and on large failures. Moving many flows at once needs update planning to avoid transient overload. The difficulty is that demands are noisy and change fast, and an optimal-looking plan may churn many flows for little gain.",
    k: ["Periodic global optimization versus incremental local adjustment: global gets better balance, local reacts faster with less disruption.", "Optimize for minimum maximum utilization versus fairness among demands: the first protects against congestion, the second protects small flows from being starved."],
    p: ["Optimizing from a stale traffic matrix moves traffic to links that are already busy.", "A plan that reroutes thousands of flows at once causes the congestion it was meant to cure during transition."],
    v: "Drive a known demand matrix that overloads one link under shortest-path routing, run the optimizer, and confirm the peak link utilization measured from counters drops below the threshold without loss.",
    dep: ["constrained-path","counter-polling","consistent-update-planning","multipath-balancing"]
  },
  "multipath-balancing": {
    s: "Spreads traffic across several equal or near-equal paths using hash-based or weighted splitting, keeping the packets of one flow together on one path.",
    d: "The controller installs group entries whose buckets are the next hops, selected by a hash over header fields so each flow sticks to a path. Weights can skew the split in proportion to capacity. Adding or removing a path changes the hash mapping and can move existing flows unless consistent hashing is used. The hard parts are polarization, where the same hash at successive stages sends all traffic the same way, and elephant flows that a hash cannot balance.",
    k: ["Per-flow hashing versus per-packet spraying: per-flow keeps packets in order but cannot split a single large flow, per-packet balances perfectly and risks reordering.", "Static hash weights versus load-aware rebalancing: static is stable, load-aware reacts to skew but moves flows and costs updates."],
    p: ["Identical hash functions on every stage concentrate traffic on one link despite many equal paths.", "Removing one next hop remaps all flows, not just the flows on the failed path."],
    v: "Send a thousand distinct flows between two hosts over four equal paths and confirm per-path byte counters are within a documented tolerance of each other, and each flow stays on one path.",
    dep: ["group-tables","shortest-path","counter-polling"]
  },
  "backup-paths": {
    s: "Computes and installs alternate routes ahead of failures so that traffic can switch immediately when a link or node on the primary path goes down.",
    d: "For each primary path the computation finds a backup avoiding its failure domain, such as a link, a node or a shared-risk group of links sharing a conduit. Backups are installed in the data plane, using fast-failover group entries or standby rules, so the device switches locally within milliseconds without waiting for the controller. The difficulty is capacity and correctness: backups consume table space, may share a risk with the primary, and carry traffic the backup link was never sized for.",
    k: ["Preinstalled local backups versus controller-driven reroute after failure: preinstalled is millisecond fast but uses table space, reroute is flexible but takes the controller loop time.", "Link-protection versus node-protection backups: link protection is simple, node protection survives device loss but is harder to compute."],
    p: ["A backup that crosses the same physical conduit as the primary fails at the same moment.", "Backups installed but never exercised turn out to be broken at the first real failure."],
    v: "Pull the cable on a primary path link while sending a continuous probe, and measure that traffic resumes on the backup in less than the stated failover time with no controller involvement.",
    dep: ["shortest-path","group-tables","failure-detection"]
  },
  "bandwidth-reservation": {
    s: "Tracks and enforces committed bandwidth on links and queues, so admitted flows are guaranteed capacity and new requests are refused when none remains.",
    d: "Each link has a reservable capacity, and each admitted path subtracts its demand along every hop. The ledger is updated transactionally with path installation. Enforcement uses meters at the edge and queue configuration at each hop, otherwise the reservation is only bookkeeping. Priorities allow preemption of lower-class reservations. The difficulty is correctness under failure: the ledger and the devices must be reconciled after crashes, and reserved but unused capacity is wasted without oversubscription policy.",
    k: ["Strict reservation versus statistical oversubscription: strict guarantees performance but wastes capacity, oversubscription uses links well and risks congestion when reserved flows burst together.", "Reserve at admission only versus enforce in hardware: admission-only is cheap but trusts applications to stay within their rate."],
    p: ["A crash between updating the ledger and installing the path leaks reservation that is never released.", "Reservations that are never enforced let one sender exceed its grant and starve others."],
    v: "Reserve 8 Gbps on a 10 Gbps link, send 12 Gbps from the reserved sender while another flow runs, and confirm the other flow still receives its share and the excess is dropped at the meter.",
    dep: ["link-port-state","meters-queues","network-transactions"]
  },
  "source-routed-encoding": {
    s: "Encodes the whole path in each packet's header, as a list of hops or segment labels, so transit devices follow it without holding per-flow state.",
    d: "The edge device pushes a stack of labels or addresses naming the path's hops or segments, and each transit device pops the next one and forwards accordingly. The controller computes the path and programs only the ingress, which keeps the core stateless and makes changes a single-device update. The difficulty is header size: long paths need many labels, which hardware must be able to push and parse, and the controller must work out which segments to combine to stay within that limit.",
    k: ["Source-routed paths versus hop-by-hop rules: source routing moves state to the edge and speeds updates, at the cost of larger packets and ingress hardware limits.", "Strict hop lists versus loose segments: strict gives exact control, loose segments are shorter but let the network choose between waypoints."],
    p: ["A path whose label stack exceeds the ingress device's push limit is accepted by the controller and dropped by the device.", "Labels that name a failed intermediate node blackhole traffic until the edge is updated."],
    v: "Program an ingress with a three-segment path, capture packets at each hop to confirm the labels are consumed in order, and confirm transit switches hold no flow-specific entries for it.",
    dep: ["constrained-path","actions-instructions","dataplane-api"]
  },
  "overlay-tunnels": {
    s: "Encapsulated tunnels between edge devices that carry virtual-network traffic across the physical fabric using an identifier in the outer header.",
    d: "Edge devices, either hypervisor switches or top-of-rack switches, wrap each packet in an outer header addressed to the destination edge and carrying a virtual network identifier. The core forwards only on the outer header and knows nothing about tenants. The controller creates tunnel endpoints and distributes the mapping from virtual address to remote edge, replacing flooding. The difficulty is overhead and visibility: encapsulation reduces the usable packet size and hides inner flows from underlay load balancing and monitoring.",
    k: ["Full mesh of tunnels versus on-demand tunnels: full mesh is simple and fast but grows with the square of edges, on-demand scales and delays the first packet.", "Hardware encapsulation at the top of rack versus at the hypervisor: hardware is faster, the hypervisor offers finer tenant granularity and needs no special switches."],
    p: ["Tunnel overhead pushes packets past the underlay MTU, causing silent fragmentation or drops of large packets.", "Underlay load balancing hashes only on the outer header, so a tunnel carrying many flows lands on one link."],
    v: "Send a maximum-size packet between two virtual machines on different edges and confirm it arrives unfragmented, and a capture on the underlay shows the outer header with the right network identifier.",
    dep: ["virtual-network-model","endpoint-tracking","actions-instructions"]
  },
  "virtual-network-model": {
    s: "The controller's description of virtual networks, ports, subnets and their attachments, defining which endpoints are in which isolated network and how they connect.",
    d: "A virtual network owns subnets, ports bound to workloads, security rules and optional routers to other networks. Creating one allocates an identifier, and attaching a workload creates a port and triggers rule and tunnel programming on the host's edge. The model is the contract with the orchestrator that places workloads. The difficulty is consistency with that orchestrator: workloads are created and destroyed constantly, and a lost event leaves ports stale or endpoints unconnected.",
    k: ["Controller owns virtual networks versus orchestrator owns and controller follows: controller ownership gives a single source of truth, following lets the orchestrator drive but needs reconciliation.", "Allocated numeric identifiers versus derived: allocation is flexible and needs coordination, derivation is stateless but constrains naming."],
    p: ["A port left behind after a workload is deleted keeps its address reserved and its rules installed.", "Network identifiers reused too quickly let stale rules deliver packets to the new owner."],
    v: "Create a virtual network, attach two workloads on different hosts, ping between them, then delete one workload and confirm its port, address and rules disappear from every device.",
    dep: ["tenant-model","network-state-model","data-models"]
  },
  "layer2-segments": {
    s: "Virtual broadcast domains carried across the fabric, giving workloads on different hosts the appearance of one switched network.",
    d: "A segment maps to a virtual network identifier. The controller programs forwarding on known addresses and handles broadcast, multicast and unknown-destination traffic by replicating to the members' edges rather than flooding the whole fabric. It can also answer address resolution requests directly from its endpoint table so those never leave the host. The difficulty is flooding cost and loops: replication to many edges needs head-end or tree-based multicast support, and stretching a segment widely enlarges its failure domain.",
    k: ["Controller-answered address resolution versus flooded: answering saves broadcast traffic, but the controller must be right about mappings or traffic goes to the wrong host.", "Head-end replication versus underlay multicast: head-end needs no underlay support but multiplies traffic at the source, multicast is efficient and demands configuration."],
    p: ["A loop through two uplinks between segments creates a broadcast storm that takes down the whole fabric.", "Large stretched segments let one misbehaving host disturb thousands of unrelated workloads."],
    v: "Send a broadcast from one member of a three-member segment and confirm via captures that exactly the two other members' edges receive it, and no other edge sees a copy.",
    dep: ["overlay-tunnels","endpoint-tracking","group-tables"]
  },
  "virtual-routing": {
    s: "Distributed routers and gateways that connect virtual networks to each other and to the outside, implemented as forwarding rules on the edges instead of a central box.",
    d: "A virtual router holds interfaces into several virtual networks and routes between them. In distributed designs each edge device implements the routing locally, rewriting addresses and decrementing hop limits itself, so traffic between networks on the same host never leaves it. Gateways at the border translate or route toward external networks and may run dynamic routing protocols. The difficulty is state: every edge needs the relevant routes, and gateways are choke points that require redundancy and capacity planning.",
    k: ["Distributed routing at every edge versus centralized routers: distributed avoids hairpin traffic and bottlenecks but multiplies rules, centralized is simpler and a single point of load.", "Static routes from the controller versus dynamic protocols with the outside: static is predictable, dynamic adapts to upstream change but adds a protocol to operate."],
    p: ["Asymmetric paths through different gateways break stateful middleboxes that see only one direction.", "Overlapping tenant address ranges leak into a shared gateway's routing table."],
    v: "Ping between hosts in two virtual networks on the same host and confirm packets never appear on the uplink, then ping an external address and confirm exactly one gateway carries it.",
    dep: ["virtual-network-model","flow-rule-model","endpoint-tracking"]
  },
  "endpoint-tracking": {
    s: "Maintains where each workload address currently lives, learned from the orchestrator and observed traffic, and distributes it so tunnels and rules follow movement.",
    d: "Each endpoint has a virtual network, addresses, a hardware address and a current edge. Entries come from the orchestrator, from address resolution and from packet-in events, and are cross-checked. When a workload migrates, the controller updates the mapping on all interested edges and may keep a short forwarding stub at the old location. The difficulty is speed and trust: updates must arrive faster than the migration downtime, and learning from observed traffic must not let a spoofed packet steal an address.",
    k: ["Proactive distribution of all mappings versus on-demand lookups: proactive gives no first-packet delay but stores everything everywhere, on-demand scales and adds lookup latency.", "Learn from data traffic versus accept only from orchestrator: learning handles unmanaged hosts, authoritative sources prevent spoofed mappings."],
    p: ["A spoofed gratuitous address announcement redirects another workload's traffic to the attacker.", "Mapping updates reaching some edges before others cause packets to chase a moved workload and drop."],
    v: "Migrate a workload between hosts while pinging it and confirm the mapping updates on all edges, packet loss stays within the documented bound, and the old edge no longer forwards for it after the stub expires.",
    dep: ["host-table","virtual-network-model","host-discovery"]
  },
  "service-chaining": {
    s: "Steers selected traffic through an ordered list of network functions, such as firewalls or load balancers, and returns it to the normal path afterward.",
    d: "A chain definition names the functions in order and the traffic class it applies to. The controller classifies packets at the ingress, tags them with a chain identifier and position, and installs forwarding rules to each function instance and onward. It balances across instances and removes failed ones. The difficulty is keeping state symmetry, so both directions of a connection reach the same instance, and handling functions that rewrite headers, which breaks classification further down the chain.",
    k: ["Header-tagged chain state versus per-hop classification: tagging is cheap at each hop but needs functions that preserve the tag, classification works with legacy functions and costs table entries.", "Stateful instances pinned per flow versus stateless pool: pinning supports firewalls and needs symmetric hashing, stateless scales freely but suits few functions."],
    p: ["Return traffic hashing to a different firewall instance than the forward traffic breaks connection tracking.", "A failed instance stays in the chain until health checks time out, blackholing the flows pinned to it."],
    v: "Define a two-function chain, send a flow, and confirm via per-function counters that both directions pass both functions in order. Kill one instance and confirm new flows avoid it.",
    dep: ["intent-compiler","table-pipeline","endpoint-tracking"]
  },
  "microsegmentation": {
    s: "Fine-grained allow rules between individual workloads or small groups, enforced at the workload's own edge, so a compromise cannot spread laterally.",
    d: "Rules are defined by group labels, such as 'web may call app on port 8443', and compiled into entries at each workload's virtual port, with a default of deny. As labels change, the controller recomputes which entries each host needs. Statefulness is handled by connection tracking at the edge or by installing return rules. The difficulty is scale and drift: the number of rules grows with pairs of groups, and the real communication pattern must be discovered before default deny can be applied without outages.",
    k: ["Default deny with explicit allows versus allow with explicit blocks: default deny is the safe posture, but needs complete knowledge of legitimate flows before enforcement.", "Enforcement at the workload edge versus at network chokepoints: edge enforcement stops lateral movement everywhere, chokepoints need fewer rules and miss east-west traffic."],
    p: ["Turning on default deny without a learning period blocks a dependency nobody documented, and production stops.", "Rule explosion from label pairs overflows hardware tables on a dense host."],
    v: "Apply a policy permitting only web-to-app, then attempt app-to-web and web-to-database connections from a test workload and confirm both are dropped and counted on the right rule.",
    dep: ["policy-language","virtual-network-model","table-pipeline","table-capacity"]
  },
  "reachability-analysis": {
    s: "Computes from the rules themselves which packets can get from which source to which destination, so operators can see actual reachability without sending test traffic.",
    d: "Rules from all devices are modeled as functions over the set of possible header bit patterns, using compact set representations. Following a symbolic packet set through the topology yields the exact set that arrives at each point, including loops and black holes. Queries ask whether A can reach B, which packets, and through which devices. The difficulty is scale and fidelity: models must match real device semantics, including rewrite actions, and recomputation for each change must be incremental.",
    k: ["Exact symbolic analysis versus sampled test packets: symbolic covers all packets and can be costly on very large rule sets, sampling is cheap but cannot prove absence.", "Analyze controller intent versus analyze installed device state: intent finds design errors, device state finds installation errors and both are needed."],
    p: ["A model that ignores a device's rewrite behavior reports reachability that does not exist.", "Analysis run only on a copy of rules from before the latest change certifies a network that has already moved on."],
    v: "Inject a known loop by adding a conflicting rule in a lab, run the analysis, and confirm it reports the loop with the exact set of looping packets and devices, then confirm a probe packet loops.",
    dep: ["installed-rule-mirror","topology-store","flow-rule-model"]
  },
  "invariant-checker": {
    s: "Continuously tests declared network properties, such as no loops, no black holes, tenant isolation and required reachability, against every proposed or installed change.",
    d: "Invariants are written as assertions in terms of the model and evaluated by the reachability engine. Checks run before a change is committed, blocking it on violation, and after, to catch drift. Results name the violated invariant and a counterexample packet. Because the check must be fast to sit in the commit path, it is incremental and runs only on the affected slice of the network. The difficulty is writing invariants that are neither so loose they never fail nor so tight they block legitimate change.",
    k: ["Block on violation versus warn only: blocking prevents outages and can stop urgent fixes, warning keeps agility and lets errors through.", "Check the full network versus the affected slice: full checks are simplest to trust, slices are fast enough to run on every change."],
    p: ["A missing invariant for a newly added tenant means its isolation is never checked.", "Counterexamples reported as a bare failure force operators to find the offending packet by hand."],
    v: "Declare that two tenants are isolated, submit a change that would connect them, and confirm the change is rejected with a sample packet and the device where it would cross.",
    dep: ["reachability-analysis","network-transactions","tenant-model"]
  },
  "change-emulation": {
    s: "Runs a proposed change against a model or virtual copy of the network first, to predict its effect on forwarding, load and failures before any real device is touched.",
    d: "The emulation takes a snapshot of topology and rules, applies the change and the planned order of steps, and evaluates reachability and utilization with forecast traffic at each step. It can also fail components in the copy to test resilience. Fidelity ranges from a pure model to virtualized instances of real device software. The difficulty is trust: a model that differs from the real devices gives a false pass, and snapshot freshness must be checked before the result is relied on.",
    k: ["Model-based prediction versus emulated device software: models are fast and scalable, emulation catches device-specific behavior at a large cost in compute.", "Mandatory emulation for every change versus for risky changes only: mandatory is safe and slows routine work, selective needs a reliable risk rule."],
    p: ["An emulation that omits a vendor quirk passes a change that crashes that vendor's device.", "A snapshot taken before an unrelated change makes the prediction describe a network that no longer exists."],
    v: "Plan removal of a core link in emulation and confirm it predicts the exact set of flows that move and the resulting peak utilization, then perform it in a lab and compare measured to predicted.",
    dep: ["reachability-analysis","topology-store","installed-rule-mirror","consistent-update-planning"]
  },
  "live-dataplane-verification": {
    s: "Checks that real devices hold the rules the controller sent and that packets actually take the intended paths, using device state and tagged test packets in production.",
    d: "Two methods combine: reading rules back from devices and comparing them to expectation, and injecting probes marked so every hop reports what it did. Per-rule counters are compared against expected traffic, and a rule that should be hot but is idle is suspicious. The difficulty is reading consistent state from live devices that change underneath, and the cost: probe traffic and rule dumps consume device and control channel capacity.",
    k: ["Read back every rule periodically versus checksum comparison: full read is exact and expensive on large tables, checksums are cheap and only say that something differs.", "Passive counter checks versus injected probes: passive costs nothing and sees only real traffic, probes test idle paths."],
    p: ["A device that accepted a rule and silently failed to program hardware passes a software read-back.", "Probe packets that take a different hash path than real traffic miss a broken link in one bucket."],
    v: "Corrupt a hardware entry through a vendor debug interface in a lab and confirm the verifier flags the mismatch within its stated period, naming the device and the rule.",
    dep: ["installed-rule-mirror","active-probes","counter-polling","drift-detection"]
  },
  "drift-detection": {
    s: "Detects when a device's configuration or rules differ from what the controller intends, whether from manual edits, restarts, bugs or lost messages, and raises or repairs it.",
    d: "The detector compares intended state with a device's reported state, using cheap fingerprints first and full diffs on mismatch, and classifies each difference: missing, extra or altered. It knows which differences are expected, such as short-lived reactive rules and counters. Results feed alarms or the reconciliation loop. The difficulty is noise: devices add their own default entries and normalize values, so a naive comparison reports constant false drift until the controller models those.",
    k: ["Periodic polling versus event-triggered detection: polling finds anything but lags, events are immediate for changes the device reports and miss silent ones.", "Report drift versus automatic repair: reporting is safe and slow, repair is fast and can fight an operator doing emergency work."],
    p: ["Device-generated default rules treated as drift cause an endless delete-and-restore cycle.", "Comparing text of a configuration instead of its meaning flags harmless reordering as drift."],
    v: "Manually delete one rule on a lab switch and confirm drift is detected within its polling period with the exact rule identified, and, if repair is on, restored with a log entry.",
    dep: ["desired-vs-actual-state","installed-rule-mirror"]
  },
  "active-probes": {
    s: "Synthetic packets sent through the network on schedule, between chosen points, to measure reachability, latency and loss independently of real user traffic.",
    d: "Probe agents on hosts or switches send marked packets along specific paths, for example one per equal-cost path, and report arrival and timing to the controller. Results build a map of what works end to end. Probes cover idle paths and backup routes that carry no real traffic, and confirm that a path the controller thinks is healthy is. The difficulty is coverage versus cost: every pair and path cannot be probed continuously, and probes must be marked so they never leak into tenant networks.",
    k: ["Probe every path versus sample: every path finds localized faults and costs a quadratic probe load, sampling is cheap and can miss a single bad link.", "Probes in the data plane versus control-plane pings: data-plane probes exercise real forwarding, control pings only show the device is alive."],
    p: ["Probes marked in a way that devices treat as best-effort traffic miss problems affecting priority classes.", "Probes escaping from a virtual network appear as unexplained traffic in a tenant's captures."],
    v: "Run probes across all equal-cost paths, disable one link at a device with an unrelated management interface, and confirm exactly the probes using that path report loss and the others do not.",
    dep: ["topology-store","network-state-model","packet-sampling"]
  },
});
