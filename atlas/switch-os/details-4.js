// Details for the network switch OS plate, part 4: hardware abstraction, forwarding pipeline.
ATLAS.details("switch-os", {
  "switch-abstraction-api": {
    s: "A vendor-neutral interface that models switching functions as objects with attributes, such as ports, VLANs, routes and queues, so control software can program any compliant chip.",
    d: "The API defines object types, their attributes, create, remove, set and get operations, bulk operations and notification callbacks. Orchestration agents call it; a vendor adapter implements it. Object identifiers are opaque handles. Capabilities and limits are queried rather than assumed. It is hard because a common model must cover chips that differ greatly, extensions are always needed, and the semantics of each attribute, including what happens on partial failure, must be precise enough that two vendors behave the same.",
    k: ["A fine-grained object model vs a coarse function-level API: fine-grained objects expose every capability and give exact control, but make agents large, while coarse calls are simple and hide differences poorly.", "Extensions allowed vs strict standard only: extensions let new features ship before the standard catches up, but fragment portability."],
    p: ["An attribute whose behavior is vaguely defined is implemented differently by two vendors, and the same configuration forwards differently.", "Callers ignore return codes on bulk operations and miss which entries failed."],
    v: "Run a conformance suite of object create, set, get and remove cases against the adapter and compare observed forwarding on test traffic with the documented behavior, including expected failure codes at limits.",
    dep: ["hal-object-model","vendor-sdk-adapter","capability-discovery"]
  },
  "vendor-sdk-adapter": {
    s: "The vendor-supplied layer that implements the abstraction API on top of the chip maker's proprietary driver library, translating generic objects into chip-specific calls.",
    d: "It runs as a library or a process, owns the chip's driver session, translates handles to internal identifiers, allocates tables and carries out vendor-specific initialization. It also decides how generic features map onto the chip's pipeline stages and memory. Updates from the chip vendor arrive as new versions that must be validated against the whole control plane. It is hard because it is usually closed-source, so defects cannot be fixed locally and its behavior must be observed from outside.",
    k: ["In-process library vs separate process: a library is fast and simple, but a defect crashes the caller, while a separate process isolates faults and costs an extra hop and a restart story.", "Track the vendor's newest release vs pin and backport: tracking gains features and fixes, while pinning gives stability and accumulates risk of old defects."],
    p: ["A new vendor library version changes counter or attribute semantics subtly and nothing in the build notices.", "A crash inside the closed library leaves no usable evidence beyond a core file."],
    v: "Run the abstraction conformance suite against each new library version and compare the results and the forwarding of a fixed traffic profile with the previous version before accepting it.",
    dep: ["asic-driver-and-dma","hal-object-model","table-resource-manager"]
  },
  "asic-sync-daemon": {
    s: "The process that receives hardware-bound state changes from the database, calls the abstraction API to apply them in batches, and returns notifications from the chip.",
    d: "It sits at the bottom of the orchestration chain, owning the single connection to the adapter. It serializes calls, coalesces operations into bulk requests, tracks handle mappings, and pushes learning, link and error events back to the database. Often a daemon per chip. It is hard because it is the bottleneck for programming throughput: route-scale updates must be applied in seconds, errors must be attributed to the right entry, and the daemon must be restartable without resetting the chip.",
    k: ["Single daemon for all features vs one per feature: a single daemon avoids conflicting use of the chip session and is a bottleneck, while one per feature scales and needs a shared mutex.", "Synchronous call and check vs pipelined with later error report: synchronous gives clear errors and is slow, while pipelining raises throughput and makes error attribution harder."],
    p: ["A long batch holds the daemon, and a link-down event waits behind thousands of route updates.", "A restart loses the handle mapping and the daemon can no longer remove objects it created."],
    v: "Push one hundred thousand route updates through the daemon, and confirm all reach hardware within the throughput target while a simultaneous port-down event is reflected in the database within its latency target.",
    dep: ["switch-abstraction-api","orchestration-agents","hal-event-notifications"]
  },
  "hal-object-model": {
    s: "Opaque handles and identifiers used to name hardware objects, with a mapping that lets software refer to a port, route or queue stably across calls and restarts.",
    d: "Every created object returns a handle that later calls use to modify or delete it. Handles encode a type and an identity, and objects reference one another by handle, forming a graph: a route points to a next-hop group, which points to next hops, which point to a router interface. Software maintains its own map from logical names to handles. It is hard because handles are valid only while the chip session lasts, so a restart needs a way to recover them, and dangling references cause hardware faults.",
    k: ["Opaque handles vs structured identifiers: opaque handles hide the chip's internals and are easy to change, while structured ones can be reconstructed after restart.", "Software-chosen identifiers vs hardware-allocated: software-chosen ones are predictable and survive restarts, while hardware-allocated ones suit chips with their own allocation."],
    p: ["A handle is reused after deletion and a stale reference silently points to a new object.", "After a restart the handle map is gone and objects cannot be cleaned up."],
    v: "Create a chain of dependent objects, restart the daemon, and confirm the recovered mapping lets every object be found and deleted in reverse order, leaving zero allocated objects in the chip.",
    dep: []
  },
  "capability-discovery": {
    s: "Queries the chip and platform for supported features, table sizes, queue counts and limits at startup, so software adapts instead of assuming one hardware model.",
    d: "The adapter reports which object types and attributes are supported, the maximum entries per table, number of queues and buffer pools, supported tunnel types, hash fields and counter types. Control software reads these before configuring and rejects configuration it cannot satisfy. Values may be static or depend on the profile selected. It is hard because capability data is often incomplete or optimistic, and some limits only appear at runtime when shared resources run out.",
    k: ["Query capabilities at runtime vs compile-time platform profile: runtime discovery follows the actual hardware, while compile-time profiles are testable and cannot adapt to new variants.", "Trust the reported scale vs test for it: trusting is quick, but a reported figure that assumes an empty chip fails when other features share the memory."],
    p: ["A feature reported as supported is implemented in a mode that does not combine with another configured feature.", "Software caches capabilities and does not see a profile change after reconfiguration."],
    v: "On each platform, compare reported capabilities with what is actually achievable by filling each table, and confirm software rejects configuration beyond the reported limit up front, with a message that names it.",
    dep: ["switch-abstraction-api","vendor-sdk-adapter"]
  },
  "hal-event-notifications": {
    s: "Asynchronous events from the chip to software: link state changes, address learning, aging, errors and queue alerts, delivered through callbacks and queues.",
    d: "The driver collects events from interrupts and hardware FIFOs, and the adapter turns them into notifications for the sync daemon, which publishes them into the database. Learning events arrive in batches, link events with minimal delay. Overflow of the hardware queue loses events. It is hard because events are bursty, must keep order, and must be reconciled with polled state, since a lost event leaves software believing something that is no longer true.",
    k: ["Interrupt-driven delivery vs polling: interrupts give low latency and cost context switches in a storm, while polling is steady and delays the first report.", "Batch learning events vs deliver each: batching reduces CPU and delays learning, while per-event delivery is quick for the first host and costly at scale."],
    p: ["A hardware event FIFO overflows during a loop and learned addresses never reach software.", "Link-down is processed behind a backlog of learning events and routing reacts seconds late."],
    v: "Pull a link and confirm the state change reaches the database within the latency target while the chip is also generating learning events at its maximum rate.",
    dep: ["asic-driver-and-dma","vendor-sdk-adapter"]
  },
  "kernel-table-sync": {
    s: "Mirrors routes, neighbors and interfaces between the control plane's tables and the kernel network stack, so locally terminated traffic and tools see a consistent view.",
    d: "Routing software installs selected routes into the kernel, and listens for kernel changes. Switch ports appear as kernel interfaces so packets punted to the CPU can enter the stack on the right one. Neighbor entries and addresses are mirrored too. This enables standard tools and some services to use the kernel's own networking. It is hard because the kernel table is a second copy of the truth that must stay synchronized, can overflow with a full routing table, and may react to events independently, such as removing routes when an interface flaps.",
    k: ["Install the full table in the kernel vs only the connected and default routes: full table gives the kernel a complete view but wastes memory and time, while minimal is light and limits what host services can reach.", "Kernel as source of truth vs the routing daemon: the kernel is simple and shared by all tools, while the daemon has richer state and must push it down."],
    p: ["The kernel removes routes when an interface goes down and the routing daemon's copy no longer matches.", "A full table install delays startup by minutes and starves other work."],
    v: "Add a route in the routing daemon and confirm it appears in the kernel table and in hardware, then flap the interface and confirm all three views converge to the same state.",
    dep: ["route-manager","kernel-network-stack","neighbor-manager"]
  },
  "software-switch-model": {
    s: "A software implementation of the forwarding silicon, running the same control plane without hardware, for development, testing and virtual labs.",
    d: "It implements the abstraction API in software, with tables, a simple pipeline and virtual ports connected by software links or a virtual bridge. The full control plane, containers and management interfaces run unchanged against it. It lets continuous integration test protocols, upgrades and configuration without a rack of boxes, and lets operators rehearse changes. It is hard because it cannot reproduce hardware timing, table limits and quirks, so passing here proves logic, not behavior on the chip.",
    k: ["Faithful model of a specific chip vs generic functional model: faithful models catch hardware-specific issues but cost a great deal to build, while generic ones are cheap and miss chip limits.", "Run the real control plane vs a stub: real software gives realistic tests, while stubs are fast and test less."],
    p: ["Tests pass on the software model because it has unbounded tables, and fail on real silicon at scale.", "The model forwards in order and masks reordering bugs that real hardware exposes."],
    v: "Boot a virtual topology of several instances, converge routing and overlays, send traffic end to end, and confirm the same tests give the same logical results as on a hardware pair.",
    dep: ["switch-abstraction-api","hal-object-model"]
  },
  "serdes-and-mac-ports": {
    s: "The high-speed lanes and Ethernet MAC blocks that turn electrical signals into frames, with the equalization, error correction and link training needed to run at a given speed.",
    d: "Each port consists of one or several lanes of serializer-deserializer circuits feeding a MAC that checks frame integrity, counts, and applies pause and framing rules. Link training adjusts equalization to the cable and optic, and forward error correction recovers bit errors. Lanes can be grouped into one fast port or split. It is hard because signal quality depends on the cable, the optic and the board, so settings tuned on the bench fail in the field, and errors show up as slow drops in rate, not as an outage.",
    k: ["Forward error correction on vs off: correction lets longer or noisier links work at the cost of a little latency and a need for the peer to match, while off gives minimum latency on clean links.", "Fixed equalization profile per platform vs adaptive per link: fixed profiles are predictable, while adaptive training handles variation and takes longer to bring up."],
    p: ["A marginal cable passes link-up but corrects constantly, and uncorrectable errors appear only under load.", "Peers with different forward error correction modes show link up but drop every frame."],
    v: "Run a bit-error test at full rate over the longest supported cable for an hour and confirm the pre-correction error rate is within the limit and zero frames are lost after correction.",
    dep: ["optics-management","asic-driver-and-dma"]
  },
  "packet-parser": {
    s: "The first pipeline stage: reads headers at line rate, identifies the protocols present and extracts the fields that later lookups use.",
    d: "A programmable or fixed parser walks the frame through Ethernet, tags, IP, transport and tunnel headers, recording where each starts and which fields are valid. It produces a key vector for lookups and flags for anomalies such as bad checksums or truncated headers. Depth is limited, so deep stacks of encapsulation may exceed it. It is hard because every supported protocol multiplies parsing paths, and a packet the parser misreads is looked up with the wrong key and handled incorrectly with no obvious sign.",
    k: ["Fixed-function parser vs programmable parser: fixed is faster and cheaper per port, while programmable adds new headers without new silicon at the cost of area and complexity.", "Parse deep into inner headers vs outer only: deep parsing enables hashing and policy on inner flows, but uses more pipeline resources and lowers the supported feature count."],
    p: ["A tunneled packet is hashed on outer headers only, and all flows between two endpoints land on one path.", "Unusual option headers exceed parser depth and the packet is forwarded using partial keys."],
    v: "Send packets with every supported header combination and a set of malformed ones, and confirm each is parsed to the expected fields and that malformed frames increment the relevant error counters.",
    dep: ["serdes-and-mac-ports"]
  },
  "ingress-pipeline": {
    s: "The sequence of lookups after parsing that classifies the packet, applies VLAN and ACL rules, looks up addresses and routes, and decides the egress port or group.",
    d: "Stages run in order: port and VLAN assignment, ingress ACL, MAC or route lookup, tunnel termination, next-hop resolution and ingress policing. Each stage reads from the tables and writes metadata, such as the egress target, priority and color, that travels with the packet. The order is fixed by the silicon, so features interact in ways software must understand. It is hard because the same functionality in different chips lives in different stages, producing different interactions between the same features.",
    k: ["Many narrow fixed stages vs a flexible shared match-action pool: fixed stages are efficient and predictable, while a shared pool allocates resources freely and gives less certainty of latency.", "Decisions made at ingress vs egress: ingress decisions save buffer use for dropped packets, while egress decisions see the final port and queue state."],
    p: ["An ACL placed after the routing stage sees the rewritten destination and not the original.", "Two features that each need the same stage's single lookup cannot both be enabled."],
    v: "Send packets designed to exercise each stage in sequence, with counters at each stage, and confirm the stage order observed matches the documented pipeline and the final egress choice is correct.",
    dep: ["packet-parser","mac-table","route-table","acl-tcam"]
  },
  "hashing-and-load-balancing": {
    s: "Chooses one of several equal paths or aggregation members for a packet by hashing selected header fields, keeping each flow on one path while spreading flows across all.",
    d: "A hash unit takes configurable fields, such as addresses, ports and protocol, possibly inner headers, mixes them with a seed and selects a member of a group. Different stages may use different seeds. Some chips can also rebalance by flow size or by queue load. It is hard because correlated hashes across consecutive switches polarize traffic onto a few links, elephant flows cannot be split, and changing group membership remaps flows.",
    k: ["Same hash seed on all switches vs different seeds per tier: the same seed is simple, but polarizes traffic across tiers, while varied seeds spread evenly and make paths harder to predict for troubleshooting.", "Flow-based hashing vs per-packet spraying: flow hashing keeps packets in order, while spraying balances perfectly and reorders packets within a flow."],
    p: ["Two tiers of switches use the same hash function and only half their uplinks carry traffic.", "A few very large flows land on one link and saturate it while others idle."],
    v: "Send ten thousand distinct flows through a four-member group and confirm per-member share is within a few percent of equal, then repeat across two tiers and confirm all second-tier links are used.",
    dep: ["packet-parser","nexthop-table"]
  },
  "tunnel-engine": {
    s: "The hardware block that adds and removes tunnel headers: encapsulation at the ingress endpoint and termination and decapsulation at the egress, with the associated lookups.",
    d: "On ingress to a tunnel, the engine builds the outer headers from a tunnel entry holding addresses, identifiers and TTL policy, and recirculates or continues the pipeline. On termination, it matches the outer destination and identifier, strips headers, and looks up the inner packet in the mapped domain. Capacity is limited in tunnel count and in the number of header layers it can process. It is hard because chips differ in whether decapsulation and the following lookup can occur in one pass.",
    k: ["Single-pass encapsulation and routing vs recirculation: single-pass keeps full bandwidth, while recirculation lets chips handle complex cases and halves the effective throughput for those flows.", "Copy inner QoS markings to the outer header vs fixed outer markings: copying preserves intent end to end, while fixed values protect the underlay."],
    p: ["A tunnel needing two passes silently halves throughput on a chip that must recirculate.", "TTL or ECN handling differs from what the underlay expects and packets are dropped or misclassified."],
    v: "Encapsulate and terminate traffic at line rate with a fixed set of tunnels and confirm no loss, with the packet capture showing correct outer headers and inner packets unchanged apart from expected TTL changes.",
    dep: ["packet-parser","ingress-pipeline","table-resource-manager"]
  },
  "egress-pipeline": {
    s: "The final stage after queueing: rewrites headers for the outgoing port, applies egress ACLs and VLAN tagging, updates counters and hands frames to the MAC for transmission.",
    d: "After the packet leaves its queue, egress processing decrements TTL, rewrites addresses from the next-hop entry, adds or removes tags, applies tunnel encapsulation if needed, evaluates egress rules and counts. Replicated packets such as multicast get per-copy rewrite. It is hard because the work is done per copy after replication, so a heavily replicated packet costs many times the pipeline capacity, and egress ACLs and rewrites compete for the same limited tables as ingress.",
    k: ["Rewrite at egress vs at ingress: egress rewrite is per copy, which is correct for multicast and costs bandwidth, while ingress rewrite is cheaper and fixed before replication.", "Egress ACLs enabled vs ingress only: egress rules can see the final port and header, while ingress-only saves table space and misses outgoing conditions."],
    p: ["Replicated multicast traffic saturates the egress pipeline though ingress bandwidth is modest.", "Egress counters count packets before a later drop in the pipeline and over-report delivered traffic."],
    v: "Send unicast and heavily replicated multicast traffic and confirm every output copy has correct rewritten headers and egress counters equal the frames observed on the wire.",
    dep: ["queues-and-scheduling","nexthop-table","tunnel-engine"]
  },
  "cpu-port": {
    s: "The internal port connecting the forwarding chip to the control CPU, carrying punted packets up and software-originated packets down, with its own queues and rate limits.",
    d: "Packets for the switch itself, exceptions, protocol frames and sampled traffic are queued to the CPU port and moved by DMA into memory, with metadata describing the ingress port and reason. In the other direction, software injects packets either through the pipeline or directly onto a chosen port, bypassing lookups. Bandwidth is small compared to the front panel. It is hard because everything else competes for it, and its limits define how much work the control plane can take.",
    k: ["Inject through the pipeline vs directly to a port: through the pipeline gives realistic forwarding behavior and costs a lookup, while direct injection is predictable for protocol frames and bypasses policy.", "Few large queues vs many classified queues: many queues isolate traffic classes, but consume resources and need tuning."],
    p: ["Sampled traffic and protocol frames share a queue and a burst of samples starves keepalives.", "The CPU port's DMA ring overflows under a storm and drops frames with no counter in software."],
    v: "Generate each class of CPU-bound traffic at increasing rates, and confirm that per-queue rates, drop counters on the chip and receive counters in the kernel interface agree at every step.",
    dep: ["asic-driver-and-dma","packet-trap-manager","queues-and-scheduling"]
  }
});
