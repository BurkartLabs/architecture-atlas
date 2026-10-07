// Details for the network switch OS plate, part 2: layer 2, routing, overlays.
ATLAS.details("switch-os", {
  "port-manager": {
    s: "Owns the lifecycle and configuration of each physical and logical port: admin state, speed, breakout, autonegotiation, link status and the events other components react to.",
    d: "The manager reads port configuration, asks the hardware layer to bring up the MAC and SerDes lanes at the chosen speed and encoding, and reports operational state changes into the state database. It handles breakout of one high-speed port into several slower ones, link training, forward error correction and flap damping. It is hard because a speed change requires reprogramming lanes, buffers and queues together, and link events arrive from hardware asynchronously and in bursts.",
    k: ["Static speed configuration vs autonegotiation: static is predictable and fast to bring up, but a mismatch with the peer leaves the link down, while negotiation adapts and takes longer and can pick a surprising mode.", "Dynamic breakout vs fixed per-platform modes: dynamic is flexible but changes the port count and every dependent configuration, while fixed modes avoid disruption."],
    p: ["A link that flaps faster than protocols converge drives repeated recomputation until damping is applied.", "Changing a port's speed leaves stale queue and buffer settings sized for the old rate."],
    v: "Bring a port up at two speeds against a lab peer and confirm operational status, negotiated mode and error counters in the state database, then pull the cable and confirm the down event is seen by the VLAN and routing components within milliseconds.",
    dep: ["state-database","switch-abstraction-api","serdes-and-mac-ports","hal-event-notifications"]
  },
  "vlan-manager": {
    s: "Maintains VLAN definitions and port membership, tagged and untagged, and programs the hardware so frames are confined to their broadcast domain.",
    d: "Configuration declares VLANs, per-port membership and tagging mode, and the manager turns that into hardware VLAN objects and membership entries. It also handles native VLAN behavior, VLAN translation, private VLANs and the association with spanning tree instances and with L3 interfaces. It is hard because membership changes arrive from configuration, from protocols and from overlay mappings, and incremental updates must not briefly merge or leak domains while entries are partly programmed.",
    k: ["Per-VLAN spanning tree vs one instance for many VLANs: per-VLAN gives better path use but scales poorly with thousands of VLANs, while a shared instance is cheap but leaves some links idle.", "Hardware VLAN objects per port vs bitmap membership: objects scale to many VLANs and ports, while bitmaps are simple but cost more memory per entry."],
    p: ["During an update a port briefly belongs to no VLAN, dropping traffic, or two, leaking it.", "Native VLAN mismatches between neighbors silently merge broadcast domains."],
    v: "Create two VLANs with overlapping ports in different modes, send tagged and untagged test frames, and confirm each frame appears only on ports of its VLAN with the expected tag state.",
    dep: ["port-manager","state-database","orchestration-agents"]
  },
  "mac-learning": {
    s: "Discovers which port each host address lives behind by observing source addresses, ages out silent entries and keeps the hardware table synchronized.",
    d: "Hardware sees a new source address and either learns it directly or notifies software, which validates, applies limits and programs the entry. A timer ages entries that stay silent, and moves are detected when an address appears on another port. Learning rate, table size and move storms matter. It is difficult because the number of new addresses per second can exceed what software can program, so many designs learn in hardware, then report in batches that software must reconcile with its own view.",
    k: ["Hardware learning vs software learning: hardware is fast and cheap on the CPU, but software has little control or visibility, while software learning allows policy at the cost of rate limits.", "Short aging time vs long: short aging reclaims table space but causes flooding when hosts are quiet, while long aging risks stale entries after a host moves."],
    p: ["A loop or a host that flaps between ports causes a constant stream of move events that overwhelms software.", "Aging in hardware and software disagree, so the software table lists entries the chip has already removed."],
    v: "Send frames from a thousand distinct source addresses and confirm each is learned on the correct port, then move one address to another port and confirm the entry moves and a move event is recorded.",
    dep: ["mac-table","hal-event-notifications","vlan-manager"]
  },
  "spanning-tree": {
    s: "Elects a loop-free subset of links in a switched layer 2 network and blocks the rest, converging again when links fail.",
    d: "Switches exchange bridge messages to elect a root, compute the best path to it and assign each port a role and state. Rapid variants converge using explicit handshakes instead of timers. Per-VLAN and multiple-instance variants run several trees. Edge ports skip the process and guards protect against unexpected messages. It is hard because a bad topology change or a single misbehaving device can trigger mass flushing of MAC tables across the network, and a missed message can create a loop that takes down the whole domain.",
    k: ["Run the protocol everywhere vs avoid layer 2 loops by design: running it protects against cabling errors, while routed fabrics remove the dependency but require layer 3 at every hop.", "Rapid handshakes vs timer-based convergence: handshakes converge in under a second, but depend on point-to-point links and on accurate link-type detection."],
    p: ["An unexpected device announcing a better root becomes the new root and reshapes forwarding network-wide.", "Hardware port state and protocol state disagree for a moment, and a port forwards when the protocol says it is blocked."],
    v: "Build a triangle of switches, check one link is blocked, then fail the active link under traffic and confirm convergence within the expected bound with no persistent broadcast storm.",
    dep: ["port-manager","vlan-manager","mac-learning","l2-loop-protection"]
  },
  "link-aggregation": {
    s: "Bundles several physical links into one logical link for capacity and resilience, negotiating membership with the peer and spreading flows across the members.",
    d: "A control protocol exchanges identity and state with the peer on each member link, selects the set that matches and enables them in the bundle. In hardware, the bundle is a group whose members are chosen by a hash of packet headers. When a member fails, hashing changes immediately. It is hard because the two ends must agree on membership before forwarding begins, both ends hash independently, and a member that fails in only one direction can create a one-way black hole unless the protocol times it out.",
    k: ["Negotiated bundle vs static bundle: negotiation detects mismatched or one-way links, while static is simpler but trusts configuration to be identical on both ends.", "Minimum active members requirement vs always up: a minimum avoids a degraded bundle carrying traffic it cannot handle, but takes the whole logical link down earlier."],
    p: ["One member's traffic is hashed unevenly, saturating a single link while others are idle.", "A member whose peer has stopped responding stays in the bundle until the slow timeout expires, and drops its share of flows."],
    v: "Bundle four links, send many flows and confirm balanced per-member counters, then pull one link and confirm only its flows are redistributed and the bundle stays up with none of the others reset.",
    dep: ["port-manager","hashing-and-load-balancing","hal-event-notifications"]
  },
  "lldp-neighbor-discovery": {
    s: "Advertises the switch's identity, port and capabilities to directly connected devices and records theirs, giving a live map of who is plugged into what.",
    d: "Each port periodically sends a frame containing the system name, port description and optional fields, and listens for the same from its neighbor, storing results with an expiry. Other features read the table: automation maps topology, voice devices receive configuration, and cable checks compare the observed neighbors to the design. It is cheap, but valuable and easy to get wrong: the frames are not forwarded, so only the adjacent device is seen, and the data is self-reported and unauthenticated.",
    k: ["Always send full detail vs minimal: full detail helps inventory and automation, but also tells an attacker with access to a port the model, software and address of the switch.", "Trust neighbor data for automation vs verify against a design: trusting is easy and reflects reality, while verification finds miscabling but needs an authoritative source."],
    p: ["Automation builds a topology from neighbor data an untrusted host can forge.", "A neighbor table entry outlives a removed cable until its hold time expires, so topology tools report links that no longer exist."],
    v: "Connect two lab switches and confirm each lists the other's name and port, then disconnect one and confirm the entry disappears no later than the advertised hold time.",
    dep: ["port-manager","state-database"]
  },
  "multicast-snooping": {
    s: "Watches group membership messages from hosts and routers so multicast frames are sent only to ports with interested receivers instead of flooded to the entire VLAN.",
    d: "The switch inspects join and leave messages, builds per-VLAN group tables mapping groups to ports and also tracks which ports lead to multicast routers. Hardware then replicates a frame only to those ports. A querier may run on the switch where no router does. It is hard because membership is soft state refreshed by timers, reports must be suppressed or aggregated for scale, and replication resources in the silicon are limited, so overflow forces fallback to flooding.",
    k: ["Snooping membership vs flooding all multicast: snooping saves bandwidth on busy VLANs but needs state and a querier, while flooding is simple and wasteful.", "Fast leave vs wait for query: fast leave frees ports immediately but is only safe with one receiver per port."],
    p: ["No querier exists in the VLAN, group state ages out, and multicast streams stop after a few minutes.", "Replication table overflow silently falls back to flooding and saturates slow ports."],
    v: "Join a group from one host on a four-host VLAN, send multicast traffic and confirm only the joined port and the router port receive it, then let the host leave and confirm delivery stops.",
    dep: ["vlan-manager","hal-event-notifications","cpu-port"]
  },
  "l2-loop-protection": {
    s: "Limits the damage from broadcast storms and loops with per-port rate limits, detection of looped frames and automatic port shutdown.",
    d: "Storm control measures broadcast, unknown unicast and multicast rate on a port and drops or shuts the port above a threshold. Loop detection sends probe frames and disables a port that receives its own. Guards block unexpected protocol frames on edge ports, or block a port that stops receiving expected protocol messages. It is difficult because legitimate bursts look like storms, and shutting a port down at the wrong place can isolate a valid host while the loop continues elsewhere.",
    k: ["Rate-limit offending traffic vs shut down the port: limiting keeps the port alive but passes a share of the storm, while shutdown stops it, and loses the legitimate traffic and needs recovery.", "Automatic recovery after a timer vs manual reset: automatic recovery restores service but may re-enable a port that is still looped."],
    p: ["A threshold set as a percentage of link speed is far above what a slow downstream device can absorb.", "A looped port shut down in a redundant pair simply moves the loop to the other link."],
    v: "Create a deliberate loop with a patch cable on a test VLAN and confirm the offending port is disabled within the detection interval, a log entry names it, and neighbor traffic recovers.",
    dep: ["port-manager","policers-and-rate-limits","spanning-tree"]
  },
  "routing-protocol-daemons": {
    s: "Processes that speak routing protocols with peers, hold neighbor sessions, run path computation and deliver best routes to the route manager.",
    d: "Each daemon owns one protocol: a link-state protocol that floods topology and runs shortest path, or a path-vector protocol that exchanges prefixes with policies between administrative domains. They keep adjacency state with timers, receive configuration and interface state from the state database, and feed their winning routes to the route manager. Large fabrics make them hard: tens of thousands of prefixes, many peers, and bursts of updates must be processed without missing keepalives.",
    k: ["Separate process per protocol vs one routing process: separation isolates faults and lets one restart alone, but duplicates memory and needs messaging between daemons.", "Incremental computation vs full recompute on every change: incremental is faster at scale but harder to verify, while full recompute is simple and spikes the CPU."],
    p: ["A flood of updates delays keepalives, sessions drop, and the resulting withdrawals create more updates.", "A daemon restarts and withdraws all its routes before graceful restart can be applied, causing a transient blackhole."],
    v: "Establish sessions with two lab peers, advertise a prefix, confirm it appears in the peer's table and in the local hardware table, then withdraw it and confirm removal throughout.",
    dep: ["route-manager","state-database","l3-interfaces","route-policy","graceful-restart"]
  },
  "route-manager": {
    s: "Collects candidate routes from all protocols and static configuration, chooses the best for each prefix and resolves them to next hops that can be programmed.",
    d: "Every source offers routes with a preference and metric. The manager keeps the RIB, selects the winner per prefix per routing instance, resolves recursive next hops through other routes, and writes results to the state database. When an interface or neighbor changes it re-resolves dependents. It is hard because resolution is transitive: one change can invalidate thousands of routes, and updates must be sent to hardware in an order that never creates a loop or a blackhole.",
    k: ["Recursive next hop resolution in software vs in hardware: software resolution is flexible, but changes to a shared next hop touch many routes, while indirection in hardware lets one update fix them all.", "Batching updates vs immediate programming: batches are faster overall but delay the first change, while immediate programming adds per-entry overhead."],
    p: ["A single flapping resolver route triggers re-resolution of a large share of the table repeatedly.", "Two protocols both claim a prefix and administrative preference ties are broken inconsistently between releases."],
    v: "Install the same prefix from two sources with different preference, confirm the lower-preference one wins, withdraw it and confirm failover, and compare the software table with the hardware table entry by entry.",
    dep: ["state-database","l3-interfaces","neighbor-manager","nexthop-group-manager","vrf-manager"]
  },
  "l3-interfaces": {
    s: "Represents routed interfaces: addresses on ports, VLAN interfaces and loopbacks, with the router MAC, MTU and the connected and local routes they imply.",
    d: "When an address is configured on a port, bridge domain or loopback, the manager creates a routing interface with a router MAC and MTU, adds a connected route and a local route that traps traffic to the switch itself, and informs routing daemons. Both IPv4 and IPv6 are handled, including link-local addresses. It is hard because address changes affect many dependents: neighbors, routes, protocol sessions and hardware objects must be created and removed in an order that never briefly forwards or traps wrongly.",
    k: ["Switched virtual interface per VLAN vs routed physical ports: virtual interfaces allow routing between VLANs, while routed ports avoid layer 2 completely and scale better in a fabric.", "Shared router MAC vs per-interface MAC: a shared MAC saves table entries, while distinct MACs make debugging clearer."],
    p: ["An MTU mismatch between the interface and the port leads to large packets that are dropped silently.", "Removing an address leaves its trap entry in hardware, so packets for that address still reach the CPU."],
    v: "Configure an address on a VLAN interface, ping it from a host and confirm the reply; then delete it and confirm the connected route, trap rule and neighbor entries are all removed.",
    dep: ["vlan-manager","port-manager","state-database","vrf-manager"]
  },
  "neighbor-manager": {
    s: "Resolves next-hop IP addresses to link-layer addresses using ARP and IPv6 neighbor discovery, and keeps those bindings fresh in software and hardware.",
    d: "When a route points to a next hop on a connected network, the manager sends a request, caches the answer with state and timers, and programs the next-hop entry. Unresolved entries trap packets to the CPU to trigger resolution. Entries refresh before they expire for active neighbors. It is hard because large layer 2 domains hold thousands of hosts, and every host appearing or moving needs table space, while a scan of the subnet can generate more resolution work than the CPU can handle.",
    k: ["Resolve on first packet vs proactive resolution: first-packet resolution saves state, but the first packets wait or drop, while proactive resolution avoids delay at the cost of unused entries.", "Refresh before expiry vs let entries age: refreshing keeps active flows from stalling, but generates continuous probe traffic."],
    p: ["A subnet scan creates thousands of unresolved entries, filling the CPU queue and starving routing traffic.", "A host moves ports and the hardware entry keeps the old port until the entry ages out."],
    v: "Send a packet to an on-link host that has not been contacted, confirm resolution completes and later packets are forwarded in hardware without touching the CPU, then move the host and confirm the entry updates.",
    dep: ["l3-interfaces","mac-learning","packet-trap-manager","nexthop-table"]
  },
  "nexthop-group-manager": {
    s: "Builds shared groups of next hops for equal-cost multipath and fast reroute, so many routes can point to one group that is edited in a single operation.",
    d: "Routes with the same set of next hops share one group object. A change to a member, such as a link going down, updates the group once and every route using it is repaired together. Members have weights, so unequal capacity paths can be balanced. The manager also maintains backup members for fast failover. It is hard because groups consume limited hardware entries, resizing a group reshuffles flows, and similar groups must be deduplicated.",
    k: ["Shared groups vs per-route next hops: sharing makes failure repair fast and saves memory, but couples many routes to one object whose update must be correct.", "Resilient hashing within a group vs plain modulo hashing: resilient keeps most flows on their path when membership changes, but wastes entries to reserve buckets."],
    p: ["Removing one member from a plain modulo group remaps most flows and reorders packets in every connection.", "Group count grows with route diversity and exhausts the next-hop table well before the route table fills."],
    v: "Point a thousand routes at a four-member group, send many flows, remove one member and confirm only that member's flows move, with one hardware update rather than a thousand.",
    dep: ["route-manager","nexthop-table","hashing-and-load-balancing"]
  },
  "vrf-manager": {
    s: "Creates independent routing instances on one switch, each with its own interfaces and tables, and controls controlled leaking of routes between them.",
    d: "A routing instance has its own interfaces, routing table, neighbor table and protocol processes. Hardware represents it by an identifier carried in table lookups. Management and customer separation use instances, as do overlays where each tenant has one. Route leaking copies selected routes between instances under policy. It is hard because every table and daemon must be instance-aware, the identifier must be available in every lookup, and per-instance resources multiply memory use.",
    k: ["Separate daemon per instance vs one daemon with multiple instances: separate processes isolate failure but cost memory and CPU per instance, while multi-instance daemons scale but share fate.", "Hardware instance identifier in every lookup vs partitioned tables: identifiers share table space flexibly, while partitions are simpler but waste space."],
    p: ["A service that is not instance-aware listens in the default instance only, leaving tenants unable to reach it.", "Leaking routes in both directions without policy creates a loop between instances."],
    v: "Create two instances with identical overlapping prefixes on different ports, confirm traffic stays inside each instance, then leak one prefix and confirm reachability only in the intended direction.",
    dep: ["l3-interfaces","route-manager","route-policy"]
  },
  "route-policy": {
    s: "A rule language for filtering, modifying and redistributing routes between protocols and peers, controlling what the switch accepts, prefers and advertises.",
    d: "A policy is a sequence of match conditions on prefix, attributes or origin, with actions such as accept, reject or set attributes. It is evaluated whenever a route enters, leaves or is redistributed. Prefix lists and communities are the common building blocks. Policies are compiled into a form evaluated by the daemons. It is hard because a small mistake has network-wide effect: a missing filter can leak a full table to a peer, and re-evaluating many routes after a policy change can occupy the CPU for seconds.",
    k: ["Default accept vs default reject at the end of a policy: default reject is safer, but a missing clause then blackholes traffic, while default accept is forgiving and leaks.", "Soft reconfiguration (re-evaluate stored routes) vs request refresh from the peer: stored routes make policy changes immediate but cost memory, while refresh costs peer cooperation and time."],
    p: ["A policy with an implicit accept at the end advertises internal prefixes to external peers.", "Editing a policy for a large table triggers re-evaluation of every route and delays keepalives."],
    v: "Apply an outbound policy that filters one prefix, confirm the peer does not receive it while others are unaffected, then remove the policy and confirm it is advertised.",
    dep: ["route-manager","routing-protocol-daemons"]
  },
  "fast-failure-detection": {
    s: "A lightweight hello protocol that detects forwarding failures between neighbors in tens of milliseconds, and notifies routing protocols and link aggregation.",
    d: "Two endpoints exchange frequent small packets, and declare the path down if several are missed. Clients such as routing sessions register for notification, so they need not wait for their own slow timers. Sessions run on the CPU or, on high-end silicon, in hardware. It is hard because very short timers depend on a CPU that is also busy with routing: a stall appears as a failure, and a tear-down cascade follows, so the packets must be prioritized and ideally offloaded.",
    k: ["CPU-based detection vs hardware-offloaded: CPU detection is flexible and needs no special silicon, but limits session count and interval, while offload scales and is less portable.", "Aggressive intervals vs conservative: aggressive intervals shrink outages, but false positives cost more than a slow failover in noisy networks."],
    p: ["A CPU busy spike delays hello transmission and the peer declares a healthy path down.", "Detection state and routing state disagree after restart, and sessions flap during upgrades."],
    v: "Establish a session at 50 ms intervals, silently drop packets on the path with a test filter, and confirm detection and the routing protocol's reaction fall within the configured multiplier times the interval.",
    dep: ["routing-protocol-daemons","cpu-port","packet-trap-manager"]
  },
  "vxlan-tunnels": {
    s: "Encapsulates layer 2 frames in UDP so segments can span a routed fabric, mapping VLANs to virtual network identifiers at tunnel endpoints.",
    d: "At the ingress endpoint, a frame in a mapped VLAN gets an outer IP and UDP header carrying a network identifier and is routed across the fabric. At the egress endpoint the headers are removed and the frame is switched in the matching VLAN. The software side manages the mapping, the list of remote endpoints and the programming of encapsulation and termination entries. It is hard because the outer header adds overhead that can exceed the MTU, and because flooding of unknown destinations must be replicated to all remote endpoints.",
    k: ["Ingress replication of flood traffic vs multicast in the underlay: ingress replication needs no multicast routing, but multiplies traffic at the source, while underlay multicast scales better and needs more of the network.", "Source port derived from inner headers vs fixed: derived ports let the underlay balance flows across paths, while fixed ones are simpler and concentrate traffic."],
    p: ["Fabric MTU not raised for the extra header leads to large frames silently dropped.", "A remote endpoint list that is stale keeps flooding frames to endpoints that no longer exist."],
    v: "Map a VLAN to an identifier on two switches, ping between hosts in that VLAN across the fabric, and capture the underlay to confirm UDP encapsulation with the right identifier and a varying source port.",
    dep: ["tunnel-endpoint-manager","tunnel-engine","vlan-manager","mac-learning"]
  },
  "evpn-control-plane": {
    s: "Distributes MAC addresses, IP addresses and endpoint reachability through a routing protocol instead of flooding and learning, so overlay endpoints know hosts without data-plane discovery.",
    d: "Switches advertise the hosts and prefixes attached to them as typed routes, carrying identifiers for the segment, route targets and endpoint addresses. Remote switches install MAC and route entries from those advertisements and add flood list members. Host mobility is signaled with sequence numbers. It is hard because the number of routes scales with hosts, route targets must be consistent, and mobility, multi-homing and duplicate detection each add rules that must interact correctly.",
    k: ["Control-plane learning vs flood-and-learn: advertisement reduces flooding and gives faster convergence, but adds route state and a protocol to debug, while flood-and-learn needs less configuration.", "Fully automated route targets vs explicit: automatic values are quick to deploy, while explicit ones allow cross-fabric and cross-tenant policy."],
    p: ["Duplicate addresses on two hosts cause continuous mobility advertisements until detection freezes them.", "A route target mismatch silently prevents hosts in one segment learning about each other."],
    v: "Attach a host on one switch and confirm its MAC and IP appear as remote entries on every other switch without any flooding, then move it and confirm all switches update within a second.",
    dep: ["routing-protocol-daemons","vxlan-tunnels","mac-learning","route-policy"]
  },
  "mlag": {
    s: "Lets a downstream device connect a link aggregation to two different switches that coordinate so it appears to be one device, giving resilience without blocked links.",
    d: "A pair of peers share a dedicated peer link and a control session. They synchronize MAC tables, address bindings, group state and aggregation identity, present a common system identity to the downstream device, and elect roles. Traffic arriving on one peer for a host behind the other crosses the peer link only when necessary. It is hard because the pair must agree on state in real time, failures are ambiguous (peer link lost versus peer dead), and a split-brain with both peers active can create loops or duplicate traffic.",
    k: ["Active-active forwarding vs active-standby: active-active uses all links and bandwidth, but requires continuous state sync and careful loop avoidance, while active-standby is simple and idles capacity.", "Dedicated keepalive path vs relying on the peer link: a separate path distinguishes peer failure from link failure, but takes another port and cable."],
    p: ["Peer link failure with both switches alive leaves both claiming the primary role and creates a split-brain.", "Software upgrades of one peer with incompatible state formats break synchronization during the window."],
    v: "Reboot one peer under traffic from a dual-attached host and confirm the host loses at most a bounded number of packets, and the pair resynchronizes MAC state when the peer returns.",
    dep: ["link-aggregation","mac-learning","state-database","fast-failure-detection"]
  },
  "anycast-gateway": {
    s: "Gives every switch in a fabric the same gateway address and MAC for a subnet, so hosts keep their default gateway as they move and routing happens at the nearest switch.",
    d: "Each leaf switch configures the shared address and MAC on its interface for the segment. Hosts resolve the gateway locally, and traffic is routed at the first hop. For hosts in other segments, symmetric routing uses a transit identifier so return traffic is routed back at the correct switch. It is hard because neighbor entries for the gateway must not be advertised as hosts, and a host that moves must see no change in gateway identity.",
    k: ["Distributed gateway on every leaf vs centralized gateway: distributed avoids hairpinning and scales, while centralized has fewer places to configure but concentrates traffic.", "Symmetric routing through a transit segment vs asymmetric routing: symmetric needs fewer segments on each switch, while asymmetric is simpler and requires every segment everywhere."],
    p: ["The shared MAC is learned as a host on a remote switch and traffic loops.", "Subnets configured on only some leaves cause blackholing for hosts that move to others."],
    v: "Move a host between two leaves while pinging its gateway and a host in another subnet, and confirm continuity with no change to its learned gateway MAC and no gratuitous resolution.",
    dep: ["l3-interfaces","evpn-control-plane","vxlan-tunnels","vrf-manager"]
  },
  "segment-routing": {
    s: "Steers packets along explicit paths by stacking a list of labels or segment identifiers in the packet header, with path state held only at the ingress switch.",
    d: "Each node advertises segment identifiers through its routing protocol. An ingress switch builds a stack that names the waypoints, and the data plane pops one at each hop. Policies choose paths by constraints such as latency or avoiding links. Hardware must push, swap and pop stacks of limited depth. It is hard because the label stack depth is bounded by silicon, controllers or daemons must compute paths consistently, and failure recovery depends on pre-computed backups.",
    k: ["Label stack in the packet vs per-hop path state: stacks remove state from the core and simplify scaling, but make packets larger and depth-limited.", "Controller-computed paths vs distributed computation: controllers see global constraints, while distributed computation survives controller loss."],
    p: ["A path that needs more labels than the chip can push is accepted by software and silently truncated.", "Controller and switch disagree on a segment's meaning after a topology change and traffic follows a stale path."],
    v: "Install a three-segment path through a lab ring that differs from the shortest path, send traffic, and confirm via per-hop counters that packets traverse the intended nodes in order.",
    dep: ["routing-protocol-daemons","nexthop-table","route-manager"]
  },
  "tunnel-endpoint-manager": {
    s: "Tracks tunnel endpoints, their reachability and the mapping from overlay segments to tunnels, and programs the corresponding encapsulation and termination state.",
    d: "The manager creates tunnel objects for each remote endpoint learned from configuration or the control protocol, binds them to underlay next hops, and installs termination entries for the local address. It tracks underlay reachability so a tunnel to an unreachable endpoint is marked down and its flood lists are updated. It is hard because endpoints can number in the thousands, share underlay paths, and change when the underlay does, and the hardware tunnel table is small.",
    k: ["One tunnel object per remote endpoint vs per segment and endpoint: per endpoint scales better in hardware, while per segment gives finer accounting at much higher entry counts.", "Underlay reachability tracked in software vs hardware: software tracking is flexible, but slower to react than hardware fast reroute."],
    p: ["An endpoint becomes unreachable and its tunnel stays in flood lists, blackholing a share of broadcast traffic.", "Tunnel table exhaustion is only noticed when new endpoints fail to install."],
    v: "Bring up tunnels to a set of remote endpoints, disconnect one in the underlay and confirm its tunnel is marked down and removed from flood lists, while the remaining tunnels carry traffic uninterrupted.",
    dep: ["route-manager","tunnel-engine","nexthop-group-manager","state-database"]
  }
});
