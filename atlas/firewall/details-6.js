// Details for the firewall plate, part 6: IPv6 and fragments, performance and offload.
ATLAS.details("firewall", {
  "ipv6-extension-headers": {
    s: "Parsing the chain of optional headers between the IPv6 header and the transport header, to find the real protocol and ports and to reject abusive chains.",
    d: "Optional headers for routing, fragmentation, destination options and others are linked in a chain by next-header values, and the transport header comes after all of them. A filter must walk the chain to find the ports, bounded by a maximum depth and total length. Some headers are deprecated and dropped by policy. Because chains can be long, packets may span several buffers before the transport header appears. The hard part is that the firewall and the host must agree on what chain is valid or evasions work.",
    k: ["Walk the full chain vs match only the first header: full walking gives correct port and protocol matching, while first-header-only is fast and bypassed by inserting an extension header.", "Drop packets with deprecated or unusual headers vs forward: dropping removes whole classes of abuse, but may break rare legitimate uses and tunneling."],
    p: ["A chain deeper than the parser's limit is accepted unparsed, so port rules never apply.", "A routing header with a source-route type steers traffic around a security device."],
    v: "Send packets with zero, one, and eight extension headers before TCP, confirm a port-based deny is applied in each case, and that a chain beyond the limit is dropped with a named counter.",
    dep: ["ingress-sanity", "five-tuple-match"]
  },
  "icmpv6-policy": {
    s: "Rules for control messages the IPv6 protocol cannot work without: neighbor discovery, router advertisements, path size errors and multicast listener reports.",
    d: "Unlike older ICMP, the newer version carries address resolution and automatic configuration, so blocking it wholesale breaks connectivity. Policy must permit essential types, limit them to link-local scope where appropriate, rate-limit them and drop abusive ones such as router advertisements from untrusted hosts. Packet-too-big messages must pass for path discovery, since routers do not fragment. The challenge is that the right rule set differs per interface role, and mistakes cause silent failures or allow rogue configuration.",
    k: ["Permit essential types only vs allow all ICMPv6: a minimal list reduces attack surface, but a missing type breaks things in hard-to-diagnose ways.", "Filter on the device vs rely on switch-level protections: device filtering covers routed paths, while switch features stop rogue advertisements before they spread."],
    p: ["Blocking packet-too-big messages makes large transfers stall while small ones work.", "An accepted rogue router advertisement lets a host on the segment become everyone's gateway."],
    v: "Allow only neighbor and path-size messages, confirm hosts resolve neighbors and large transfers succeed, and confirm a router advertisement from an untrusted port is dropped and counted.",
    dep: ["match-extensions", "ipv6-extension-headers"]
  },
  "fragment-handling": {
    s: "How the device treats fragmented packets: reassemble before inspecting, filter fragments by rule, or drop them, since fragments are a classic way to hide ports and content.",
    d: "Only the first fragment carries the transport header, so port-based rules cannot judge later fragments without remembering the first. Options are virtual reassembly that tracks fragments per datagram while forwarding them, full reassembly that buffers and rebuilds the datagram for inspection, or policy that drops fragments in sensitive zones. Overlap, tiny and out-of-order fragments get strict handling. The challenge is memory and ambiguity: attackers send overlapping fragments that different stacks reassemble differently.",
    k: ["Reassemble fully vs track fragments virtually: full reassembly shows the true payload to inspection, while virtual tracking forwards faster and uses less memory.", "Drop all fragments vs allow them: dropping eliminates the evasion class and breaks tunneled and large-message traffic."],
    p: ["Reassembly buffers are exhausted by floods of incomplete datagrams that never finish.", "Overlapping fragments are reassembled one way by the firewall and another way by the host, hiding an attack."],
    v: "Send a datagram in ordered, reversed and overlapping fragments to a deny rule on its port and confirm every form is blocked; confirm incomplete datagrams time out and free buffers.",
    dep: ["packet-buffer-pools", "ingress-sanity"]
  },
  "dual-stack-policy": {
    s: "Keeping the policy for both address families equivalent, so a service blocked on one is not left open on the other, and so rules are written once where possible.",
    d: "Hosts with both address families can be reached either way, and clients often prefer the newer one. A policy written only for the older family leaves the other path unfiltered, or the reverse. Tools help by letting a single object hold both families and by flagging asymmetries. Rules differ where semantics differ, such as ICMP and fragmentation, and translation behavior. The challenge is human: audits and rule reviews cover the family people use daily, and gaps hide in the other.",
    k: ["Unified rules with objects for both families vs separate rule sets: unified avoids drift, while separate sets can express family-specific details clearly.", "Disable one family at the perimeter vs run both: disabling reduces surface, while running both prevents surprises from clients that prefer the disabled one."],
    p: ["A new server gets an address in the newer family automatically and is open because rules only covered the older one.", "Tests run only over the older family and pass while the other path is wide open."],
    v: "Run the same test matrix over both address families against each service, and confirm every allowed and denied result is identical, with differences listed and explained.",
    dep: ["address-objects", "icmpv6-policy", "interzone-policy"]
  },
  "no-nat-posture": {
    s: "The design stance that hosts are globally addressable end to end, so the firewall alone provides the boundary that translation used to give by accident.",
    d: "Without routine translation, internal hosts have public addresses and are reachable unless policy blocks them. Stateful default deny inbound takes over the incidental protection that private addressing offered. Address privacy is handled by temporary addresses and by not exposing internal prefix structure in logs and names. Prefix changes by the provider require renumbering plans. The difficulty is a cultural carry-over: teams assume translation protects them and omit rules that private addressing masked.",
    k: ["Globally routable internal hosts with deny inbound vs translated prefixes: routable keeps end-to-end function and simpler troubleshooting, while translation hides structure and complicates peer services.", "Stable prefixes vs provider-assigned changing prefixes: stable is simple for policy, while changing prefixes require objects that follow renumbering."],
    p: ["A host with a public address and a permissive default is reachable from the internet within minutes.", "Policy objects hardcode a prefix that the provider later changes."],
    v: "Scan from outside the internal prefix with the policy in place and confirm only the published services respond, while internal hosts can still initiate outbound and receive replies.",
    dep: ["default-action", "dual-stack-policy"]
  },
  "tunnel-inspection": {
    s: "Looking inside encapsulation such as generic routing, IP-in-IP and transition tunnels to apply policy to the inner packet, not just the outer one.",
    d: "A tunnel carries one packet inside another, so a policy on the outer header says nothing about the traffic within. The firewall decapsulates, applies the policy to the inner header with its own flow state and zone treatment, and optionally limits nesting. Unauthorized tunnels, including automatic transition mechanisms, are blocked or restricted. The challenge is depth and cost: nested encapsulation multiplies parsing, and unrecognized tunnels pass as opaque data.",
    k: ["Inspect inner traffic vs treat the tunnel as opaque: inspection enforces policy on the real traffic, but costs CPU, and encrypted tunnels cannot be opened.", "Allow only known tunnel endpoints vs inspect all protocols: endpoint allow-lists are precise, while protocol blocking catches unknown tunnels at the cost of breaking legitimate ones."],
    p: ["A transition tunnel carries a second path in and out that bypasses the policy written for the first.", "Unlimited nesting is accepted, letting an attacker burn parsing time."],
    v: "Send an inner packet that policy denies inside an allowed tunnel type and confirm it is dropped on the inner verdict, and confirm a tunnel to an unknown endpoint is blocked.",
    dep: ["protocol-decoders", "ipv6-extension-headers", "flow-table"]
  },
  "fast-slow-path": {
    s: "The split between a slow path that decides new flows with full policy and inspection and a fast path that forwards later packets using the stored decision with minimal work.",
    d: "The first packet of a flow goes through classification, translation, inspection setup and route lookup, which are expensive. The result is stored in the flow entry as a compact action list. Subsequent packets are matched by a hash lookup and executed straight from the entry, often on a dedicated core or in hardware. Events such as policy change, timeout or inspection needs send packets back to the slow path. The hard part is keeping both paths semantically identical and invalidating fast entries correctly.",
    k: ["Cache decisions per flow vs classify every packet: caching gives large speedups for long flows, but stale decisions persist after policy changes and short flows get no benefit.", "Punt to the slow path for unusual packets vs handle all in the fast path: simple fast path stays fast, but punted traffic can swamp the slow path."],
    p: ["Fast path entries survive a policy update and keep forwarding traffic the new rules would drop.", "A flood of single-packet flows forces every packet down the slow path and caps throughput far below line rate."],
    v: "Measure throughput of a long flow and of many one-packet flows through the same device, and confirm the first reaches line rate and the second matches the documented slow-path rate; commit a deny and confirm cached flows stop.",
    dep: ["flow-table", "atomic-ruleset-swap", "flow-core-affinity"]
  },
  "flow-core-affinity": {
    s: "Steering all packets of a flow, in both directions, to the same processing core so state is accessed without locks and caches stay warm.",
    d: "The network interface hashes the tuple and distributes packets to receive queues, one per core, so a flow always lands on one core. Per-core flow tables then need no locking. Reply packets must hash to the same core, which requires symmetric hashing or a redirect. Translation complicates this since the reply tuple differs from the request. The challenge is balance and elephants: a single heavy flow cannot be spread, so one core saturates while others idle.",
    k: ["Pin flows to cores vs share state across cores: pinning is lock-free and cache-friendly, but loses balance when flows differ widely in size.", "Symmetric hashing vs redirecting on mismatch: symmetric hashing avoids extra hops, while redirect handles translated or tunneled traffic at the cost of core-to-core messages."],
    p: ["Replies of a translated flow hash to a different core than the request and create a second, inconsistent entry.", "One large transfer saturates its core and drops, while average utilization looks low."],
    v: "Send one large and many small flows, view per-core utilization and flow counts, and confirm each flow stays on one core in both directions and the large one is the only saturated core.",
    dep: ["flow-hashing", "batched-polling"]
  },
  "batched-polling": {
    s: "Receiving and transmitting packets in groups by polling the interface rather than taking an interrupt per packet, which amortizes per-packet overhead at high rates.",
    d: "A core loops reading bursts of packets from a receive queue, processes the whole batch through each stage, then transmits. Processing a stage across a batch keeps instructions and data hot in cache and allows prefetching the next packets' data. Interrupt-driven modes are used at low load to save power. The trade is latency for efficiency, and the poll loop owns its core. The challenge is tuning burst sizes and not letting a slow stage stall the queue behind it.",
    k: ["Busy polling vs interrupts: polling gives the lowest and most stable latency at high rate, but burns a core at all times, while interrupts save power and waste cycles per packet.", "Large bursts vs small: large bursts raise throughput by amortization, but add latency and jitter for the first packet in the batch."],
    p: ["A long slow-path action in a batch loop delays every packet behind it and fills the queue.", "Polling cores starve the management processes sharing them."],
    v: "Measure packets per second and per-packet latency at several burst sizes and loads, and confirm the chosen setting reaches the target rate while keeping latency within the stated limit.",
    dep: ["packet-buffer-pools", "interfaces-and-vlans"]
  },
  "kernel-bypass": {
    s: "Reading packets from the network interface directly into the firewall's own memory in user space, avoiding the general operating system network stack for speed and control.",
    d: "The interface is mapped into a user-space process that owns its queues, using huge pages and poll-mode drivers. The firewall implements its own forwarding, state and protocol handling, with a slow path to the operating system only for traffic to the device itself. This avoids per-packet system calls, copies and general-purpose locking. The challenge is that all the services the operating system provided, from routing to neighbor resolution and diagnostics, must be rebuilt or bridged.",
    k: ["User-space data plane vs in-kernel filtering: user space gives the highest rate and custom features, while kernel filtering integrates with existing tools and costs more per packet.", "Dedicated cores and memory vs shared with the host: dedicated is predictable and fast, but wastes capacity when idle."],
    p: ["The user-space path and the operating system disagree about interface or route state, and traffic is black-holed.", "A crash of the data plane process takes down all forwarding with no kernel fallback."],
    v: "Run the same policy and traffic with the user-space and kernel paths, compare verdicts packet for packet, and measure the rate and CPU use of each, confirming the stated gain.",
    dep: ["batched-polling", "packet-buffer-pools", "interfaces-and-vlans"]
  },
  "hardware-offload": {
    s: "Moving classification, flow forwarding or cryptography onto network interface cards, switch chips or dedicated processors, so established traffic is handled without software.",
    d: "Software installs flow entries or rules into hardware tables on the NIC or switch silicon, which match packets and apply actions such as forward, drop, rewrite and count at line rate. Stateful entries are installed after the first packet is accepted and removed on close or timeout. Counters flow back to the software. The challenge is capacity and fidelity: hardware tables are small and support limited match and action types, so unsupported cases fall back to software and state must stay consistent in both.",
    k: ["Offload established flows only vs offload rules: flow offload is simple and keeps software authoritative, while rule offload scales but needs hardware to match full semantics.", "Rely on offload for throughput vs size for software rates: offload gives a large gain, while sizing for software keeps behavior predictable when tables fill."],
    p: ["A flow is removed in software while the hardware entry remains, and traffic that should be blocked still passes.", "Hardware table exhaustion makes throughput collapse to the software rate without a clear alarm."],
    v: "Establish a flow, confirm the hardware entry is installed and that software packet counters stop growing while hardware counters increase; then deny the flow and confirm the entry is removed and packets drop.",
    dep: ["fast-slow-path", "flow-table", "rule-hit-counters"]
  },
  "cache-aware-layout": {
    s: "Arranging rules, flow entries and lookup structures in memory so one packet touches as few cache lines as possible, since memory access dominates per-packet cost.",
    d: "Hot fields of a flow entry are packed into one or two cache lines, with cold data such as counters and logging details kept elsewhere. Lookup tables use compact nodes, arrays instead of linked pointers, alignment to lines, huge pages to reduce address translation cost and prefetch hints for the next lookup. Per-core data is padded to avoid false sharing. It is hard because the layout trades flexibility and simple code for speed, and the benefit disappears when the working set exceeds cache.",
    k: ["Pack hot fields tightly vs keep a natural structure: packing cuts cache misses per packet, but makes the structures awkward to extend.", "Per-core copies of tables vs shared read-only tables: copies avoid false sharing and coherence traffic, but multiply memory and updates."],
    p: ["Two cores write counters in the same cache line, and throughput halves for no visible reason.", "A new field added to the hot entry pushes it across a line, adding a miss to every packet."],
    v: "Profile cache misses per packet on a representative load before and after a layout change, and confirm the number of lines touched per lookup matches the design and the rate improves accordingly.",
    dep: ["packet-buffer-pools"]
  },
  "packet-buffer-pools": {
    s: "Preallocated, fixed-size buffers reused for packets, avoiding allocation on the hot path and bounding memory so overload becomes a drop and not an out-of-memory crash.",
    d: "At startup the device allocates pools of buffers per NIC queue or core, sized for the largest expected frame, with metadata areas for marks and parsed offsets. Receive takes a buffer, processing passes it by pointer, and transmit or drop returns it. Pools are NUMA-local to the cores and interfaces using them. The hard parts are sizing and leaks: too small a pool drops packets under burst, and a buffer held by a stuck queue or a reassembly entry is not available to anyone else.",
    k: ["Fixed pools with drop on exhaustion vs dynamic allocation: fixed pools are predictable and fast, while dynamic allocation adapts and risks latency spikes and exhaustion.", "Per-core pools vs a shared pool: per-core needs no locking, but one core's burst cannot borrow from idle neighbors."],
    p: ["Reassembly and inspection queues hold buffers for a long time and leave too few for receive, so the NIC drops frames.", "A leak on an error path slowly drains the pool until forwarding stops."],
    v: "Run traffic at full rate while monitoring pool occupancy, confirm it returns to baseline when load stops, and confirm exhaustion produces a named drop counter without crashing.",
    dep: []
  },
  "ruleset-scaling": {
    s: "How lookup time and memory behave as the rule set grows from hundreds to hundreds of thousands, and the techniques that keep both bounded.",
    d: "A linear list costs time proportional to the rule count, while compiled classifiers trade memory and build time for near-constant lookup. Scaling also depends on rule shape: wildcards and overlapping ranges inflate structures. Techniques include per-zone-pair partitioning, early flow caching so only first packets classify, hardware tables and splitting rules across devices. Build time and update cost matter as much as lookup. The challenge is that benchmarks on tidy synthetic rule sets mislead, since real sets have pathological structure.",
    k: ["Larger rule sets on one device vs partitioning across devices: one device is simpler to operate, while partitioning gives headroom and complicates policy ownership.", "Optimize for first-packet classification vs for every packet: with flow caching only first packets pay, so memory-heavy structures are acceptable if built quickly."],
    p: ["Performance tested on a clean synthetic set collapses on the real set full of overlapping wildcards.", "Commit time grows with rule count until a change takes minutes, and operators avoid making them."],
    v: "Compile real rule sets at one, ten and one hundred times the production size, and record build time, memory, first-packet and cached-packet rates, confirming growth matches the design curve.",
    dep: ["decision-tree-classifier", "bit-vector-classifier", "fast-slow-path"]
  },
});
