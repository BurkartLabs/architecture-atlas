// Details for the SDN controller plate, part 4: discovery, southbound protocols, flow programming, devices, cross-cutting concerns.
ATLAS.details("sdn-controller", {
  "device-onboarding": {
    s: "Brings a new device under management: it is found, authenticated, matched to an inventory record, given initial configuration and a control channel to its master.",
    d: "A device boots, obtains a management address, and finds a controller through configuration, a registry or a well-known name. It presents an identity credential, typically a certificate rooted in its manufacturer or a provisioning token. The controller validates it, assigns a role and site, pushes bootstrap configuration and opens the control channel. Zero-touch provisioning removes manual steps. The difficulty is trust at first contact: a rogue device must not be accepted, and a legitimate one must not be locked out by a broken certificate.",
    k: ["Zero-touch automatic acceptance versus operator approval: automatic scales to thousands of devices and widens the attack surface, approval is safe and slows rollouts.", "Bootstrap through a separate provisioning service versus directly by the controller: separate keeps the controller simple and adds a service to run and secure."],
    p: ["A device with a factory-default credential is accepted by anyone who can reach the controller's address.", "A reused management address causes the controller to attach one device's identity to another."],
    v: "Power on a new switch with only a provisioning credential and confirm it appears in the inventory with the correct role, receives bootstrap configuration, and establishes a secure channel. Then present a device with a bad credential and confirm rejection.",
    dep: ["control-network-bootstrap","channel-security","device-inventory","device-drivers"]
  },
  "link-discovery": {
    s: "Learns which port of which device connects to which other, by sending and receiving marked frames through every port and reporting arrivals to the controller.",
    d: "The controller instructs each device to emit periodic neighbor frames carrying device and port identity, or uses a standard neighbor protocol the device already runs. A frame received on another device's port is reported back, and the pair defines a link. Missing frames for several intervals expire it. Frames must not be forwarded as normal traffic. The difficulty is overhead and spoofing: frequent frames from every port cost bandwidth and device CPU, and forged frames can create fake links to attract traffic.",
    k: ["Controller-generated discovery frames versus the devices' own neighbor protocol: controller-generated work on any device and cost control traffic, device protocols are efficient and require support and vendor-neutral parsing.", "Short discovery interval versus long: short detects changes fast and uses more resources, long saves resources and delays detecting failures."],
    p: ["Discovery frames not authenticated let a host forge a link and divert traffic through itself.", "Non-managed switches in the middle make two devices appear directly connected, and path computation uses a link that does not exist."],
    v: "Connect two lab switches, confirm a link with correct ports appears within two discovery intervals, then insert an unmanaged switch between them and confirm the controller flags or models the change correctly.",
    dep: ["control-channel","topology-events","packet-in-handling"]
  },
  "host-discovery": {
    s: "Learns where end hosts attach, from address resolution, DHCP exchanges, gratuitous announcements and orchestrator events, and records them with their addresses.",
    d: "Rules on edge ports send selected packets, such as address resolution and DHCP, to the controller, which extracts addresses and the attachment port and creates or updates the host entry. Orchestrator integration provides authoritative bindings. Edge ports are separated from inter-switch ports so a host is never learned from a trunk. The difficulty is trust and silence: hosts that never speak are never found, and spoofed packets can forge location, so learned entries need validation and rate limiting.",
    k: ["Passive learning from traffic versus active probing: passive is quiet and misses silent hosts, active finds hosts and generates traffic and can alarm security tooling.", "Learn on any edge port versus bind to authorized addresses: open learning is easy to deploy, authorized binding prevents impersonation and needs a source of truth."],
    p: ["A host seen on an inter-switch port because of a mislabeled port is recorded at the wrong location.", "A flood of forged announcements overwhelms the controller with updates."],
    v: "Attach a new host, confirm a host entry with right address and port exists after its first DHCP or resolution packet, and that a forged announcement from another port is rejected by the validation rule.",
    dep: ["packet-in-handling","host-table","topology-store"]
  },
  "topology-events": {
    s: "Notifications of changes in devices, links, ports and hosts, published with ordering and identifiers so dependent services recompute only what changed.",
    d: "Discovery and status feeds are normalized into typed events such as device-added, link-removed or host-moved, each with a sequence number and the previous value. Events are coalesced: a burst of flaps within a short window is delivered as one. Consumers such as path computation subscribe and compute incremental updates. The difficulty is correctness under reordering and loss: a consumer that misses an event must be able to resynchronize from a snapshot, and coalescing must not hide a final state different from the delivered one.",
    k: ["Coalescing bursts versus delivering every event: coalescing protects consumers and obscures the exact history, full delivery is exact and can overwhelm during instability.", "Events carrying full new state versus only deltas: full state is robust to loss and bigger, deltas are compact and need ordered, gap-free delivery."],
    p: ["Coalescing drops an up-then-down sequence, so a consumer is left believing the final state is up.", "Consumers that never resynchronize after missing events drift permanently from the topology."],
    v: "Flap a link rapidly, then confirm consumers received a coalesced sequence ending in the true state, and that a consumer deliberately paused and resumed recovers the correct topology via snapshot.",
    dep: ["event-bus","topology-store"]
  },
  "control-network-bootstrap": {
    s: "Establishes the network over which the controller talks to devices, either dedicated out-of-band management or in-band over the managed fabric itself, before any rule is installed.",
    d: "Out-of-band networks are separate and independent of the data plane, so the controller can still repair a broken fabric. In-band control shares the fabric: devices need initial rules to reach the controller, usually via local default behavior or a bootstrap tree formed before programming, and a bad rule can cut a device off from its own controller. The difficulty is the chicken-and-egg order of bringing up a fabric from nothing and keeping the control path alive during updates.",
    k: ["Out-of-band management network versus in-band control: out-of-band is robust and costs extra cabling and switches, in-band saves them and can lock the controller out with one bad rule.", "Protected control-traffic rules that updates cannot remove versus ordinary rules: protected rules keep the control path alive, and need a priority scheme the compiler respects."],
    p: ["An update that removes the in-band path to a device strands it, and it can only be fixed by hand.", "A shared management network without isolation lets compromised hosts reach device control ports."],
    v: "Power up a fabric from empty with in-band control and confirm every device reaches the controller using only bootstrap behavior. Then install a deny-all rule set and confirm the control path remains.",
    dep: ["standalone-fallback","switch-management-plane"]
  },
  "flow-protocol": {
    s: "The standard protocol by which a controller installs, modifies, queries and removes match-and-action rules in a device and receives packets and status events from it.",
    d: "Messages are defined for flow modification, group and meter modification, statistics, packet-in and packet-out, port status and barriers. The device answers each request with an acknowledgment or an error code. A version is negotiated at connect time. Multiple controllers may connect in master, equal or standby roles. The difficulty is interpretation: the protocol defines the messages while devices differ in which table features, match fields and combinations they truly support, and error messages are often too vague to attribute the failure.",
    k: ["Rule-level protocol versus declarative configuration protocol: rule-level gives per-flow control and has high message volume, declarative configuration is compact and changes slowly.", "Rely on the latest protocol version versus support several: latest has the best features, several versions reach older devices and multiply the code to test."],
    p: ["A device accepts a rule it cannot honor in hardware and silently handles it in slow software, collapsing performance.", "Error responses with a generic code leave operators unable to see which field or table caused rejection."],
    v: "Send a rule using an unsupported match combination to a lab device and confirm a specific error is returned and recorded against the rule, and send a valid one and confirm hit counters increment on matching traffic.",
    dep: ["control-channel","capability-negotiation","flow-rule-model"]
  },
  "control-channel": {
    s: "The persistent, reliable connection between a controller instance and each device, carrying commands, replies, events and keepalives.",
    d: "Typically a TCP-based session, initiated by either side, kept alive by echo messages, and secured by channel security. The channel provides ordered delivery per device, flow control, and loss detection through keepalives. A controller serves thousands of channels with an event-driven I/O loop. On disconnect, the device keeps its tables for a configured time and the controller must reconcile on reconnect. The difficulty is that this one path is both the control plane and a point of failure and attack, so its capacity and ordering semantics shape everything.",
    k: ["Controller connects to devices versus devices connect to the controller: devices connecting out work through firewalls and need a discovered controller address, controller connecting is simpler and requires reachability inward.", "One channel for all message types versus separate channels for bulk and urgent: separate prevents bulk updates from delaying urgent ones and adds connections and state."],
    p: ["Packet-in floods occupy the channel and delay rule updates and keepalives, causing disconnects.", "Keepalive timers shorter than controller garbage-collection or scheduling pauses cause needless session resets."],
    v: "Open thousands of device sessions to a controller instance, saturate one with packet-in load, and confirm keepalives on that session continue and other sessions' latency is unaffected.",
    dep: ["channel-security"]
  },
  "channel-security": {
    s: "Authenticates both ends of every device session and protects its contents using certificates and transport encryption, so only genuine controllers can command devices.",
    d: "Each device and controller instance holds a certificate issued by a trusted authority, and both sides verify the other during session setup using mutual authentication. Certificates are short-lived or revocable and rotated automatically. The session is encrypted and integrity protected. Authorization is also needed: not every authenticated controller should write to every device. The difficulty is operational: expired or unrotated certificates take devices offline, and revocation checking needs a path that works when the network is damaged.",
    k: ["Mutual certificate authentication versus shared secrets: certificates give per-device identity and revocation and need a certificate authority, shared secrets are simple and one leak exposes every device.", "Short-lived certificates versus long-lived: short ones limit exposure and need reliable renewal, long ones are easy and risk a long compromise window."],
    p: ["A certificate expiring across a whole fleet on one date disconnects every device simultaneously.", "Devices accepting any controller certificate signed by a common authority allow other tenants' controllers to take control."],
    v: "Attempt a device session with an expired and then a revoked controller certificate, confirm both are refused and logged, and confirm a session with a valid certificate is encrypted in a packet capture.",
    dep: []
  },
  "capability-negotiation": {
    s: "Exchanges at connect time what a device supports: protocol version, tables, match fields, actions, group and meter types and numeric limits, so the controller only sends what can work.",
    d: "On connection the controller sends a features request and the device replies with its identifiers, table descriptions, port list and supported message types. Additional queries read table features in detail. The results update the inventory and drive compilation. Because the declared limits are sometimes optimistic, controllers also probe by installing and removing test rules. The difficulty is that capability descriptions are incomplete about combinations: a field may be supported alone and not alongside another.",
    k: ["Trust the advertised capabilities versus verify by probing: trusting is fast and breaks on devices that overstate, probing is accurate and slows onboarding.", "Per-device capability profiles versus a lowest-common-denominator abstraction: profiles use each device fully and complicate compilation, lowest common denominator is simple and wastes hardware."],
    p: ["A table advertised at 4,000 entries fills at 1,500 when rules use wide matches, and the compiler overflows it.", "Capabilities cached across a software upgrade are wrong afterward."],
    v: "Connect devices of two models, confirm the inventory shows their different table sizes and supported fields, and that the compiler places the same intent differently on each, with rules accepted by both.",
    dep: ["flow-protocol","device-drivers"]
  },
  "config-protocol": {
    s: "A protocol for reading and writing a device's configuration and operational data through a typed schema, with transactions, validation and rollback on the device.",
    d: "The controller edits a candidate configuration using a structured model, asks the device to validate it, and commits atomically, optionally with a confirm timer that reverts if not confirmed. It covers things the rule protocol does not: interfaces, addresses, queues, routing protocol settings, software images. Data is exchanged as structured documents with a schema negotiated at connect. The difficulty is model variety: many devices expose different schemas for the same feature, requiring translation in drivers.",
    k: ["Configuration protocol for slow-changing settings versus rule protocol for forwarding rules: each fits its change rate, and using both means two sources of truth to keep consistent.", "Full replace of the configuration versus incremental patch: full replace is deterministic and heavy and disruptive on large configurations, patch is light and complicated by ordering."],
    p: ["A full-configuration push on a device with local, unmodeled settings erases them.", "Schema mismatch between a controller model and a new device version rejects the commit with errors that do not name the field."],
    v: "Change an interface address through the protocol with a confirm timer, let the timer expire, and confirm the device reverts to its previous configuration. Repeat with confirmation and see it stay.",
    dep: ["control-channel","data-models","device-drivers"]
  },
  "dataplane-api": {
    s: "An interface for programming the forwarding pipeline itself, not only its tables, so a controller can define new header formats, tables and actions on programmable hardware.",
    d: "A pipeline program, written in a domain-specific language and compiled for the target, declares parsers, match-action tables and actions. The device exposes table entries through a runtime API that the controller calls to install and read entries, typed according to the program. This allows protocol-independent forwarding and custom features. The difficulty is coupling: the controller must know exactly which program is loaded, programs differ by target resources, and changing the program may flush every table.",
    k: ["Programmable pipelines versus fixed-function tables: programmable allows new protocols and telemetry at the cost of toolchain complexity, fixed is simpler and limited to what the chip defines.", "Controller compiled against a specific pipeline versus generic runtime discovering tables: specific is typed and fast, generic adapts to any program and gives up compile-time checking."],
    p: ["Loading a new pipeline program wipes all table entries and forwarding stops until the controller reinstalls them.", "A program that fits one chip generation exceeds the resources of the next."],
    v: "Load a pipeline program defining a custom header, install entries through the runtime API, send packets with that header, and confirm they are forwarded according to the entries and counted on the program's counters.",
    dep: ["control-channel","hardware-match-tables","forwarding-asic"]
  },
  "device-drivers": {
    s: "Adapters that translate the controller's common model and operations into each device type's real protocols, quirks, limits and software versions.",
    d: "A driver for each device family implements a small set of behaviors: connect, discover ports and tables, translate a rule to the device's table layout, apply configuration, read status. Drivers carry workarounds, such as how a device numbers tables, which match combinations it needs in which table, and how long programming takes. They are versioned with the device software. The difficulty is volume: quirks accumulate, and each new hardware generation or software version can break assumptions.",
    k: ["Thin drivers over a uniform protocol versus thick per-vendor drivers: thin is simple and cannot compensate for device deviations, thick masks differences and becomes a maintenance burden.", "Drivers built in versus loaded as plugins: built in are tested together, plugins allow adding devices without upgrading the controller."],
    p: ["A driver tested against one software version misprograms devices on the next patch release.", "Quirks hidden in drivers are undocumented, so only the driver author knows why a rule is split into two."],
    v: "Run the same intent test suite against each supported device type, in hardware, and confirm identical forwarding results and matching rule hit counters.",
    dep: ["flow-protocol","config-protocol","legacy-adapters"]
  },
  "legacy-adapters": {
    s: "Adapters that manage older equipment through command-line sessions and the simple management protocol, so the controller can include devices that cannot be programmed through modern interfaces.",
    d: "Adapters send configuration text over a remote shell session, parse command output with templates, and poll counters through the simple management protocol. They simulate transactions by saving configuration before changes and comparing afterward. They are slow, stateful and fragile: screens vary by version, prompts change, and parse failures are common. They let the controller manage the full network during migration. The difficulty is correctness of text scraping and the serialization of commands per device.",
    k: ["Wrap legacy devices behind the common model versus manage them separately: wrapping gives one view and hides limited behavior, separate management is honest and fragments tooling.", "Parse output with templates versus structured export where present: templates work anywhere and break on format changes, structured export is robust where supported."],
    p: ["A changed prompt or paging setting hangs the session and leaves the device with a half-applied command list.", "Sending commands in parallel to one device interleaves them and produces unpredictable configuration."],
    v: "Apply a change to a legacy device through the adapter, then compare its running configuration to the intended text and confirm they match. Corrupt the expected prompt and confirm the adapter aborts and reports.",
    dep: ["device-inventory"]
  },
  "flow-rule-model": {
    s: "The structure of a forwarding rule: a priority, a set of match fields, actions or instructions, timeouts and counters, installed in a table of a device.",
    d: "A packet is compared against rules in a table in priority order, and the first highest-priority match wins. The rule carries counters, an idle timeout that removes it after inactivity, a hard timeout and a cookie the controller uses to tag ownership. Overlapping rules with the same priority behave ambiguously, so the controller avoids them. The difficulty is the rule's life cycle: deciding what to install proactively and what to compute on demand, how to attribute rules to owners and how to remove exactly what one intent installed.",
    k: ["Many specific exact-match rules versus fewer wildcarded rules: exact rules give fine per-flow control and counters and use many entries, wildcards are compact and coarser.", "Cookies identifying owners versus matching on content for deletion: cookies make cleanup exact and need discipline, content matching can delete a neighbor's rule."],
    p: ["Two rules at the same priority with overlapping matches behave differently on different devices.", "A rule with no owner tag is never cleaned up when its intent is removed."],
    v: "Install rules with distinct cookies, delete by cookie, and confirm that exactly the tagged rules are removed from the device, and hit counters of the remaining rules are unchanged.",
    dep: ["match-fields","actions-instructions"]
  },
  "match-fields": {
    s: "The packet header and metadata fields a rule can examine, such as ports, addresses, protocol, VLAN or tunnel identifiers, with masks for matching ranges of values.",
    d: "Fields span layers, from ingress port and Ethernet headers through network and transport headers to tunnel identifiers and device metadata set by earlier tables. Each can be exact, masked or a prefix. Prerequisites apply: matching on a transport port requires specifying the protocol first. Wider matches use more of the hardware table's width. The difficulty is hardware restriction: a device may support each field individually but not combinations, and the choice of which fields appear in a rule determines the table it can live in.",
    k: ["Match on many fields in one rule versus split across tables: one rule is simple and needs wide, scarce entries, splitting uses narrow entries and more stages.", "Masked wildcard matches versus exact matches: wildcards need ternary memory, which is costly and small, exact matches can use cheap, larger hashed tables."],
    p: ["A match on a field without its prerequisite protocol is rejected or silently ignored by some devices.", "Overlooked header fields such as tunnel ID allow cross-tenant matches in shared tables."],
    v: "Install rules matching on a masked source prefix and an exact transport port, send packets that match, partially match and mismatch, and confirm only the matching ones hit the rule, with counters showing it.",
    dep: ["table-pipeline"]
  },
  "actions-instructions": {
    s: "What a matching rule does to a packet: forward to a port or group, drop, rewrite header fields, add or remove tunnel headers, set metadata, count, meter, or go to another table.",
    d: "Actions are collected into an action set or applied immediately in an ordered list. Typical actions are output to a port, send to the controller, set a field, push or pop a tag, decrement a hop limit and apply a meter. Instructions control flow between tables, for example jump to a later table with metadata. The order matters: a rewrite before a push differs from after. The difficulty is portability, as the set and combinations of actions vary widely and some require recirculation through the pipeline.",
    k: ["Apply actions immediately versus accumulate an action set: immediate is predictable in order, accumulation lets later tables add actions and executes in a fixed order the author must know.", "Rewrites in the fabric versus at the edge only: edge-only keeps the core simple, rewriting in the core allows features like address translation and consumes core pipeline."],
    p: ["Actions listed in an unsupported order are accepted and executed in a different order, changing the packet's output.", "A rule with no output action silently drops traffic that the author expected to forward."],
    v: "Install a rule that rewrites the destination address and forwards, send a packet, and capture its output to confirm the header contents and port are as specified.",
    dep: ["flow-rule-model"]
  },
  "table-pipeline": {
    s: "A sequence of match-action tables that a packet passes through, each stage with its own fields and size, enabling modular policy and efficient hardware use.",
    d: "Packets enter table zero and move forward through later tables as instructed, carrying metadata between them. Typical stages are classification, access control, tunnel termination, routing and output. Hardware pipelines have fixed stage layouts with different sizes and field support per stage, so the compiler maps policy to stages. Multiple tables avoid the cross-product explosion of putting independent policies in one table. The difficulty is placement: assigning rules to stages that fit their fields and size is a packing problem.",
    k: ["Multiple narrow tables versus a single wide table: multiple tables avoid cross-product rule growth and add pipeline depth and metadata handling, a single table is simple and explodes in size.", "Fixed pipeline mapping known in advance versus dynamic placement by the controller: fixed is predictable, dynamic uses hardware better and needs a placement algorithm."],
    p: ["A rule placed in a stage that cannot see the field it matches never fires, and nothing reports it.", "A missed table-miss rule lets unmatched packets be dropped or sent to the controller by default."],
    v: "Install a classification table that sets metadata and an access table that matches it, send packets from allowed and denied classes, and confirm per-table counters show the packets traversed each stage in order.",
    dep: ["flow-rule-model","hardware-match-tables"]
  },
  "group-tables": {
    s: "Reusable sets of action buckets that implement multicast, load balancing across next hops, and fast failover that depends on port liveness.",
    d: "A rule points to a group, and the group holds buckets, each a list of actions. Types include all (copy to every bucket for multicast), select (choose one bucket by hash for balancing), indirect (a shared next-hop abstraction updatable once) and fast failover (use the first bucket whose watched port is live). Because many rules share a group, changing its buckets updates them all at once. The difficulty is capacity and update semantics: groups have small limits, and changing a select group can remap flows.",
    k: ["Indirect groups for shared next hops versus per-rule actions: groups let thousands of rules change by one update and consume a scarce group table, per-rule actions need no group and make next-hop changes slow.", "Fast-failover groups in hardware versus controller-driven failover: hardware reacts in milliseconds without the controller and requires careful buckets, controller-driven is flexible and slower."],
    p: ["Adding one bucket to a select group reshuffles the hash mapping, moving most existing flows.", "A fast-failover group watching the wrong port never fails over."],
    v: "Create a fast-failover group with two buckets, send a stream, take the active port down, and confirm traffic moves to the second bucket within the device's local failover time without controller intervention.",
    dep: ["actions-instructions","hardware-match-tables"]
  },
  "meters-queues": {
    s: "Rate limiting and scheduling resources: meters police or shape flows to a rate, and queues give classes of traffic separate guaranteed or limited shares of a port.",
    d: "A rule can send matched packets to a meter, which applies bands that drop or re-mark traffic exceeding a rate and burst. Queues attached to output ports are assigned by action, each with a minimum rate, maximum rate or priority, and are configured through the configuration interface. Together they implement bandwidth guarantees and protect critical traffic. The difficulty is resources and visibility: devices have few meters and queues, burst sizes interact with buffer limits, and misconfigured meters drop traffic with little signal beyond a counter.",
    k: ["Policing at ingress versus shaping at egress: policing drops excess immediately and is cheap, shaping smooths bursts with buffering and needs queue memory.", "Per-flow meters versus per-class: per-flow gives isolation and exhausts the small meter table, per-class scales and lets flows within a class compete."],
    p: ["A meter burst size set too small drops legitimate bursts, though average rate is under the limit.", "Queue configuration made through one interface and rule assignment through another drifts apart."],
    v: "Meter a flow at 100 Mbps, send 300 Mbps, and confirm the receiver sees about 100 Mbps and the meter's drop counter matches the excess, while an unmetered flow is unaffected.",
    dep: ["actions-instructions","hardware-match-tables"]
  },
  "table-capacity": {
    s: "Tracking and managing the limited number of entries each table in each device can hold, with eviction, aggregation and placement to avoid overflow.",
    d: "The controller counts used and free entries per table from its mirror and device reports, and the compiler budgets against them. Tools include aggregating specific rules into prefixes, moving rules between tables, expiring idle rules, and evicting low-value entries under pressure. Ternary tables are small and expensive, and exact-match tables are bigger. Overflow is a hard failure: new rules are refused or, worse, older ones evicted. The difficulty is that capacity depends on rule width and the shared use of memory between table types.",
    k: ["Proactive installation of all rules versus reactive installation on demand: proactive avoids first-packet delay and uses tables for rules never used, reactive uses tables for active flows and delays first packets.", "Aggregate rules to save space versus keep them fine-grained: aggregation saves entries and loses per-flow counters and control."],
    p: ["A table that fills during a failure leaves exactly the reroute rules that were needed unable to install.", "Evicting by oldest installation instead of least use removes busy rules."],
    v: "Fill a table to its limit with synthetic rules, trigger a reroute needing new entries, and confirm the eviction policy removes only idle low-priority entries, and the controller raises a capacity alarm before overflow.",
    dep: ["hardware-match-tables","installed-rule-mirror","capability-negotiation"]
  },
  "packet-in-handling": {
    s: "The path by which packets a device cannot handle are sent to the controller, decided on, and returned to the network, along with the protection needed so this cannot overload either side.",
    d: "A table-miss or explicit rule sends a packet, or its header and an identifier, to the controller. The controller reads it, decides (learn a host, answer address resolution, install a rule) and sends back a packet-out or just installs a rule. Rate limits and per-device meters bound this traffic. Application dispatch is fast and non-blocking. The difficulty is that the path is a classic denial-of-service target: an attacker sending unknown traffic makes the controller the bottleneck, and slow decisions cause retransmissions that cause more packet-in messages.",
    k: ["Reactive per-flow setup via packet-in versus proactive rules: reactive uses tables efficiently and adds first-packet latency and controller load, proactive is fast and consumes table space.", "Send the full packet versus a truncated header with a buffer identifier: full packet is simple and uses channel bandwidth, truncated saves bandwidth and depends on device buffers."],
    p: ["A port scan from one host generates unbounded packet-in traffic that stalls control of that device.", "Buffered packets on the device expire before the controller replies and the first packet of each flow is lost."],
    v: "Send a scan of 100,000 distinct destinations through a lab edge port and confirm the packet-in rate is capped by the configured limit, other control traffic is unaffected, and legitimate new flows still get through.",
    dep: ["flow-protocol","control-channel","meters-queues"]
  },
  "forwarding-asic": {
    s: "The specialized chip that parses and forwards packets at line rate using fixed or programmable match-action pipelines, with limited table memory and no general-purpose compute.",
    d: "The chip contains a parser, several match-action stages with dedicated memories, queues and a packet buffer. It processes packets in fixed time per stage, giving deterministic latency and throughput of billions of packets per second. Rule capacity is limited by on-chip memory of different kinds, ternary for wildcard and static or hashed for exact matches. Control software talks to it through a driver that translates rules into hardware table writes. The difficulty is that capabilities, limits and update rates are specific to the chip.",
    k: ["Fixed-function pipeline versus programmable pipeline: fixed has best-known performance and power, programmable adapts to new protocols at some cost in area and tooling.", "On-chip memory only versus extending with external memory: on-chip is fast and small, external memory adds capacity and latency and cost."],
    p: ["Features that work in software emulation are unsupported in the chip's pipeline and fall back to slow paths.", "Table update rate limits mean a mass rule change takes minutes on the chip even when the controller sent it quickly."],
    v: "Run a line-rate traffic test with rules in hardware tables, confirm no loss at full rate and the counters show hardware hits, then repeat with a rule forcing software handling and observe the throughput drop.",
    dep: []
  },
  "software-switch": {
    s: "A switch implemented in software on a general-purpose host, usually at the edge of virtual networks, supporting full rule sets and tunnels with much larger tables than hardware.",
    d: "A kernel or user-space data path forwards packets using a flow cache: the first packet of a flow goes through the full rule pipeline, and the resulting decision is cached for later packets. Tables can hold millions of entries and implement rich actions such as tunnels and connection tracking. It runs next to workloads, so rules apply per virtual port. The difficulty is performance: the cache design, CPU cost per packet and interference with workloads, and the need to invalidate cache entries correctly when rules change.",
    k: ["Flow cache with slow-path upcalls versus full pipeline per packet: the cache gives high speed on established flows and delays first packets and during invalidation, full pipeline is predictable and slow.", "Kernel data path versus user-space polling data path: kernel integrates with the host and costs more per packet, user-space polling is faster and dedicates CPU cores."],
    p: ["Rule changes that invalidate the whole cache produce a sudden storm of slow-path packets.", "A software switch sharing CPU with workloads loses packets when a workload becomes busy."],
    v: "Establish many flows through a software switch, change one rule, and confirm only affected cache entries are revalidated, throughput stays within its documented dip, and no packets take stale actions after revalidation.",
    dep: ["hardware-match-tables","switch-agent"]
  },
  "hardware-match-tables": {
    s: "The on-chip memories that hold rules: ternary memory for wildcard matches with priorities, and hashed or direct memory for exact matches, each with size and speed limits.",
    d: "Ternary memory compares every entry in parallel with a mask, which supports prefixes and arbitrary wildcards at line rate and costs area and power, so it holds thousands of entries. Exact-match tables use hashing and hold hundreds of thousands. Entries have width, and wide matches take multiple slots. Updates may be slow and can disturb priority order, forcing entry shuffling. The difficulty is that capacity is not one number: it depends on rule shape, shared memory pools and update behavior.",
    k: ["Ternary versus exact-match placement of a rule: ternary is flexible and scarce, exact-match is plentiful and requires full field values.", "Insert rules with priority reordering on the device versus controller-managed priority slots: device reordering is transparent and slow, controller-managed slots are fast and complex."],
    p: ["Priority-ordered insertion into a full ternary table causes mass entry movement and a long forwarding pause.", "Wide matches consume several entries each, so a count-based capacity plan overflows early."],
    v: "Insert rules of varying match widths until the device refuses, record the count per width, and confirm the controller's capacity model matches the measured counts within the stated tolerance.",
    dep: ["forwarding-asic"]
  },
  "switch-agent": {
    s: "The software on the device that terminates the controller's protocol, translates rules into hardware or data-path programming, and reports events and statistics back.",
    d: "The agent runs on the switch's CPU, manages control sessions, maintains the software copy of tables, and programs the chip through a vendor library. It handles timeouts, counters, packet-in and out, and role changes between controller connections. Its CPU is modest, so it limits message rates. The difficulty is fidelity and speed: it must report truthfully when hardware programming completes, apply ordering barriers correctly, and not crash under message storms.",
    k: ["Acknowledge when queued versus when programmed in hardware: early acknowledgment is fast and lets ordering assumptions fail, late acknowledgment is accurate and slower.", "Single-threaded ordered processing versus parallel handling: ordered is correct and slow on a modest CPU, parallel is faster and needs careful dependency handling."],
    p: ["An agent crash restarts the control session with empty or stale software state while hardware keeps forwarding.", "An agent that accepts messages faster than it can program hardware accumulates a backlog and answers late."],
    v: "Send rules with barriers to a lab switch, and confirm by hardware table dump and test traffic that rules are active at the time the barrier reply arrives, not afterward.",
    dep: ["forwarding-asic","hardware-match-tables","control-channel"]
  },
  "standalone-fallback": {
    s: "Behavior of a device when it loses contact with every controller: it either keeps its current rules, falls back to ordinary learning-switch behavior, or stops forwarding.",
    d: "Two modes are common: secure mode keeps existing rules until they time out and drops anything that would need the controller, while standalone mode reverts to local forwarding such as MAC learning. Rule timeouts and the choice interact: rules that expire during a long outage remove forwarding even when the device is healthy. Some designs run a local routing agent as a hybrid. The difficulty is the choice itself: standalone mode can loop or bypass policy, while secure mode drops connectivity.",
    k: ["Secure mode (keep rules) versus standalone learning-switch fallback: secure preserves policy and degrades slowly, standalone keeps connectivity and can bypass security or create loops.", "Rules without timeouts versus with timeouts: no timeouts survive outages and become stale and permanent, timeouts self-clean and cut forwarding during a long outage."],
    p: ["Reverting to learning-switch mode on a redundant topology creates a loop and a broadcast storm.", "Idle timeouts on proactive rules expire during a controller outage and blackhole traffic."],
    v: "Disconnect a switch from all controllers for ten minutes under traffic, and confirm it follows the configured mode, forwarding with installed rules unchanged, then reconnect and confirm reconciliation restores consistency.",
    dep: ["switch-agent","flow-rule-model"]
  },
  "switch-management-plane": {
    s: "The device's own management interfaces and services, such as console, remote shell, software image handling, logs and local configuration, used for bootstrap and for recovery when the controller path fails.",
    d: "It includes a management Ethernet port in a separate routing context, a serial console, secure shell, image and boot management, local logging, and the agent lifecycle. It is the path for installing the agent, setting the controller address, and fixing a device the controller cannot reach. Security is critical: the credential for this plane can override everything the controller intends. The difficulty is keeping the out-of-band route working and its access controlled and audited.",
    k: ["Management plane reachable by the controller versus a separate human-only path: controller access enables automation of upgrades, separate path limits the damage of a compromised controller.", "Local configuration permitted versus read-only device: local config allows emergency repair and creates drift, read-only enforces the model and stalls recovery."],
    p: ["Shared default credentials on the management interface let an attacker reconfigure devices behind the controller's back.", "A software image upgrade that wipes the agent's configuration removes the device from management."],
    v: "Reach a switch through its management port while its data plane is down and confirm one can read state and replace the controller address, with each action in the device's local log and audit trail.",
    dep: ["switch-agent"]
  },
  "centralization-vs-distribution": {
    s: "How much decision-making sits in the controller and how much stays on devices, from fully centralized rule programming to controllers that only supply policy to local routing.",
    d: "Centralized control gives a global view and simple programming and puts the controller on the critical path for failures and new flows. Distributed protocols on devices converge without a controller and make global optimization difficult. Hybrids run local protocols for reachability and use the controller for policy, traffic engineering and overrides. The decision determines failure behavior, scale limits and what the controller must be fast enough to do, and it is hard to reverse once devices and operators depend on it.",
    k: ["Controller computes all paths versus devices run routing and the controller steers: full centralization optimizes globally and risks a control-plane outage, hybrid survives controller loss and constrains what can be optimized.", "Reactive centralization versus proactive: reactive reduces state and puts the controller in the path of new flows, proactive removes it from the data path at the cost of precomputed state."],
    p: ["Assuming the controller is always reachable, so no thought is given to what the network does when it is not.", "Hybrid designs where the controller and the local routing protocol disagree on the best path, creating loops."],
    v: "Stop every controller instance under live traffic and confirm the network behaves as the design states: existing flows continue, new flows are handled by local behavior, and after restart the controller resumes without disruption.",
    dep: []
  },
  "consistency-model": {
    s: "The guarantees about what traffic and operators see while the network changes: how stale views can be, whether packets see mixed rules, and how replicas of controller state agree.",
    d: "There are several layers: the controller's replicated store may be strongly or eventually consistent, the controller's view of the network lags the real one, and during updates the data plane passes through intermediate states. Each layer needs a defined guarantee, such as per-packet consistency for updates or bounded staleness for reads. Stronger guarantees cost latency and table space. The choice shapes the update planning, the store and the APIs, and weaker choices push complexity into applications.",
    k: ["Strong consistency for configuration versus eventual for observed state: strong prevents conflicting decisions and slows writes, eventual scales and requires applications to tolerate stale reads.", "Per-packet consistent updates versus best-effort ordering: per-packet is safe and costs doubled rules, best-effort is cheap and allows brief loops and drops."],
    p: ["Applications written assuming reads reflect the current network, which never holds under lag.", "Mixing consistency levels without documentation, so each component makes different assumptions."],
    v: "Run an update under a continuous packet stream with an assertion checker, and confirm the measured anomalies, such as loops or drops, match what the stated consistency model permits and nothing beyond.",
    dep: []
  },
  "control-loop-latency-and-scale": {
    s: "The time budget from an event to the resulting device change, and how it grows with network size, which decides what the controller can do reactively and what must be precomputed.",
    d: "A control loop includes detection, event delivery, computation, update planning, message transmission, device programming and verification. Each stage has a latency and a throughput limit, and they add up. Link failure reaction might need tens of milliseconds, host move seconds, bulk reconfiguration minutes. Scale pushes in several dimensions: devices, rules, events per second and concurrent operators. Targets must be set per loop and measured, because averages hide the tails that cause outages.",
    k: ["Precompute and install in advance versus compute at event time: precomputing reacts fastest and uses more state, computing at event time is flexible and slower.", "Scale up one instance versus partition across instances: scale up is simple with a ceiling, partitioning has no ceiling and adds coordination."],
    p: ["Optimizing average latency while the tail during a failure storm is ten times worse and decides the outage length.", "A design tested on a hundred devices that has a quadratic step meeting ten thousand."],
    v: "Measure the end-to-end time from a link failure to restored traffic at 100, 1,000 and 10,000 emulated devices, report median and 99th percentile for each, and confirm the growth matches the stated scaling target.",
    dep: []
  },
  "failure-domains-and-fail-modes": {
    s: "What breaks together and what the network does when each component fails: controller instance, whole cluster, channel, device agent, link, and how far each failure spreads.",
    d: "Each failure has a blast radius and a defined behavior, such as keep forwarding, fail closed, or degrade. Controller failures should leave the data plane running. Partitioned controllers must not both write. Bad updates are a failure of their own, since an incorrect rule pushed to every device fails everything at once, so changes are staged by region. The hard part is correlated failure: shared software, shared certificates, shared configuration and shared networks make supposedly independent components fail together.",
    k: ["Fail open versus fail closed: open preserves service and may bypass security, closed preserves policy and takes the outage.", "Stage changes by region or canary versus apply everywhere at once: staging limits blast radius and slows rollout, all at once is fast and can break everything simultaneously."],
    p: ["A change pushed to all devices at once, including the one broken rule, takes the whole network down.", "Redundant controllers that share the same database, certificates or software bug all fail together."],
    v: "Inject each listed failure in a lab one at a time, such as controller loss, channel loss and agent crash, and confirm observed behavior matches the written fail-mode table, including how long recovery takes.",
    dep: []
  },
  "control-channel-trust": {
    s: "Who is trusted to command devices and to speak for the network: the identities, certificates and authorization that determine what a compromised component can do.",
    d: "A controller that can write rules on every device is the most powerful target in the network, as it can disable security, redirect traffic or drain the fabric. Trust decisions cover device-to-controller authentication, controller-to-controller trust, application privileges and operator roles. Defenses are least privilege per application, signed changes, audit and separation between the management and data networks. The hard part is that the threat includes insiders, supply chain and compromised applications loaded into the controller.",
    k: ["Applications run with full controller privileges versus sandboxed with scoped rights: full privileges are simple and let a bad application do anything, scoped rights contain it and require a permission model.", "Central trust root versus per-site roots: central is simple to manage and a single compromise is global, per-site limits the radius and multiplies operations."],
    p: ["A third-party application loaded with full privileges is a backdoor with the controller's access to every device.", "Devices that trust any controller on the management network can be commanded by anything that reaches it."],
    v: "Attempt writes as an unauthorized application, a controller with a foreign certificate and a stale leader, and confirm each is refused at the device or API boundary and recorded in the audit log.",
    dep: []
  },
  "abstraction-and-portability": {
    s: "How much of device and vendor difference the controller hides behind common models, and the cost of hiding it, in lost features and in the work to keep adapters correct.",
    d: "A high abstraction lets applications and policies run unchanged across devices, supports mixed fleets and avoids lock-in. It also hides capabilities, so features unique to a chip are unreachable, and the translation layer becomes a large body of device-specific code. Abstractions exist at several levels: the rule model, the pipeline layout, the configuration schema and the intent model. Each must be chosen deliberately, with escape hatches that let operators reach the device directly when the abstraction fails.",
    k: ["Lowest-common-denominator model versus capability-aware model: lowest-common-denominator is portable and wastes hardware, capability-aware exploits hardware and exposes differences to applications.", "Abstraction with an escape hatch versus closed abstraction: an escape hatch handles the unexpected and lets people bypass the guarantees, closed enforces them and blocks urgent fixes."],
    p: ["A model designed around the first vendor's hardware turns out to fit no other.", "The escape hatch is used for routine work, so the abstraction is bypassed and the controller's view no longer matches the devices."],
    v: "Deploy the same intent to two different device types and confirm identical packet-level behavior in a test suite, and that a device-specific feature is reachable only through the documented escape hatch.",
    dep: []
  },
});
