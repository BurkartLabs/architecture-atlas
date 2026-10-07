// Details for the VPN gateway plate, part 5: performance, availability, platform services and cross-cutting concerns.
ATLAS.details("vpn-gateway", {
  "cipher-speed-choice": {
    s: "Choosing algorithms whose cost per byte suits the hardware: ciphers with processor acceleration where present, and ones that run fast in software where not.",
    d: "Authenticated encryption modes that combine encryption and integrity in one pass are cheaper than separate ones. On processors with dedicated instructions, one family of block ciphers is very fast; on those without, a stream cipher designed for software is faster and resists timing attacks. Per-packet cost also includes the key schedule and setup, which dominates for small packets. It is hard because the best choice depends on the fleet of clients as well as the gateway, and on the packet size mix.",
    k: ["Block cipher with hardware instructions vs. software stream cipher: the first wins on servers and recent laptops, while the second wins on older or small devices.", "Prefer fastest suite vs. strongest margin: speed saves capacity, but conservative choices age better."],
    p: ["Benchmarking with large packets hides the per-packet overhead that dominates real traffic.", "Preferring a cipher the clients lack in hardware drains phone batteries."],
    v: "Measure throughput with realistic packet sizes for each allowed suite on the gateway hardware and on a representative low-end client, and confirm the preferred order matches the fastest working one.",
    dep: ["cipher-negotiation", "cpu-crypto-instructions"]
  },
  "cpu-crypto-instructions": {
    s: "Processor instructions that perform cipher and hashing steps directly, giving several times the throughput of plain software and avoiding cache-timing leaks.",
    d: "Modern processors provide instructions for block cipher rounds, carry-less multiplication used in authentication, and wide vector operations. Cryptographic libraries detect the features at start and select an implementation. Throughput scales with cores, and the same code on a core without the feature falls back to a slower path, sometimes silently. It is hard because virtualization or container limits can hide the features, because the library may be built without the optimized path, and because vector use can reduce clock speed on some processors.",
    k: ["Use acceleration when detected vs. a single portable path: acceleration is far faster, but means two code paths to test and keep correct.", "Dedicated crypto cores vs. general cores: dedicated parts leave general cores free, but add a fixed capacity limit."],
    p: ["A virtual machine that masks the processor features runs the cipher at a fraction of expected speed with no error.", "A library built without the optimized path makes a fast processor perform like a slow one."],
    v: "Run the library's benchmark on the deployed gateway and confirm it reports the accelerated implementation and a throughput near the documented figure per core, not the portable fallback.",
    dep: ["cipher-speed-choice", "packet-io-driver"]
  },
  "nic-crypto-offload": {
    s: "Hands encryption of tunnel packets to the network card or a dedicated accelerator, so the host processor only sets up keys and handles exceptions.",
    d: "The kernel installs the tunnel's keys and policy into the device, which then encrypts outbound packets and decrypts inbound ones in hardware at line rate. The host sees only clear packets. Inline offload processes packets as they pass; look-aside accelerators receive buffers and return results. Control-plane work such as handshakes stays on the host. It is hard because driver and device support is uneven, keys must be loaded and removed in step with rekeys, and a packet that the device cannot handle must fall back to software cleanly.",
    k: ["Inline card offload vs. look-aside accelerator: inline avoids extra copies and wins on latency, while look-aside is more flexible but adds bus traffic.", "Offload vs. more cores: offload is efficient at very high rates, but is tied to specific hardware and its feature gaps."],
    p: ["Rekeys that update the device late cause a window where packets are dropped or encrypted with the wrong key.", "Unsupported features, such as certain extended counters, quietly send traffic back through slow software."],
    v: "Enable the offload, run line-rate traffic through a tunnel and confirm host processor load drops sharply while the device counters show the packets processed and a rekey passes without loss.",
    dep: ["security-association-db", "packet-io-driver", "rekeying"]
  },
  "multicore-distribution": {
    s: "Spreads tunnel packet processing across cores by tunnel or flow, so throughput scales with cores without contention on shared tables or counters.",
    d: "A single tunnel's packets share a counter and a replay window, so one tunnel often runs on one core, while many tunnels spread across cores by hash of the index or address. Network card queues steer packets to cores and keep each flow on one. Per-core data structures avoid locks. Splitting a single heavy tunnel across cores requires counter ranges and a larger replay window. It is hard because one fast transfer can saturate a core while the rest sit idle, and reordering appears when a flow moves.",
    k: ["One core per tunnel vs. split a tunnel across cores: one core preserves order and is simple, but caps single-tunnel throughput at one core's speed.", "Per-core tables vs. shared with locks: per-core avoids contention, but means updates must be applied to every copy."],
    p: ["Hashing on outer addresses sends all site-to-site traffic to one core because there is only one address pair.", "Moving a flow between cores reorders packets and trips the replay window."],
    v: "Run many parallel transfers over many tunnels and confirm per-core load is balanced; then run one transfer over one tunnel and record the single-core limit as the documented maximum.",
    dep: ["anti-replay-window", "sequence-counters", "packet-io-driver"]
  },
  "kernel-vs-userspace-path": {
    s: "Whether packets are processed inside the operating system's networking code or in an ordinary program, trading raw speed against isolation, portability and ease of update.",
    d: "A kernel data path reads and writes packets without crossing into user space and reaches the highest rates, but a bug runs with full privilege. A user-space path copies packets in and out through a virtual device, which costs speed; kernel-bypass frameworks poll the network card directly from user space and recover much of it. Control-plane negotiation is almost always in user space. It is hard because the faster options need dedicated cores and more specific hardware, and the safer one is easier to update on devices the operator does not control.",
    k: ["Kernel data path vs. user-space: kernel is fastest and well integrated, but a flaw is a whole-system compromise and updates require reboots.", "Kernel bypass with polling vs. interrupt-driven I/O: polling reaches line rate, but burns cores even when idle."],
    p: ["A memory-safety bug in kernel code gives an attacker the whole machine, not just the tunnel.", "User-space paths with an extra copy per packet cap throughput well below the link speed."],
    v: "Measure packets per second at the smallest packet size on the same hardware for each path and confirm the figures are documented, along with host processor use at that rate.",
    dep: ["network-stack-hooks", "packet-io-driver", "privilege-separation"]
  },
  "batching-and-coalescing": {
    s: "Processes packets in groups and merges adjacent ones, so fixed per-packet costs such as system calls, lookups and interrupts are spread over many packets.",
    d: "Receive paths pick up many packets per wake-up, look up the tunnel once for a run of packets with the same index, and encrypt them as a batch. Large-receive and segmentation offload let the stack handle one big buffer in place of many small ones, though tunnel encapsulation can defeat these unless the card understands the format. Send paths queue and flush. It is hard because batching adds latency, interacts badly with small time-sensitive flows, and offloads that are not tunnel-aware silently turn off.",
    k: ["Larger batches vs. smaller: larger gives more throughput per core, but adds delay and makes voice and games worse.", "Rely on segmentation offload vs. segment in software: offload saves the host work, but only when the encapsulation is one the card supports."],
    p: ["Batching tuned on a throughput test raises latency enough to break real-time applications.", "An encapsulated flow loses large-receive handling and throughput falls by half with no error."],
    v: "Compare throughput and ninety-ninth percentile latency with batching on and off under a mixed bulk and interactive load, and confirm the chosen setting meets both targets.",
    dep: ["encap-decap-pipeline", "packet-io-driver"]
  },
  "active-passive-failover": {
    s: "A standby gateway takes over a tunnel service when the active one fails, using a shared address and replicated state so sessions continue or reconnect quickly.",
    d: "A pair of gateways exchange heartbeats. When the standby stops hearing the active unit, it claims the shared address, brings up the interfaces and takes over, ideally with the tunnels' keys and counters already replicated. Without replication, clients must re-handshake, which takes seconds and relies on their dead-peer detection. Planned switchovers drain traffic first. It is hard because split-brain, where both think they are active, causes conflicting address use, and because the failure detector must be neither too slow nor too jumpy.",
    k: ["Replicate session state vs. let clients reconnect: replication gives sub-second takeover, whereas reconnect is simpler but visible to users.", "Fast heartbeat timers vs. slow: fast detects failure quickly, but turns a busy moment into an unnecessary failover."],
    p: ["A broken heartbeat link with both units alive produces two active gateways answering the same address.", "A standby never exercised in production fails on the day it is needed because its configuration drifted."],
    v: "Power off the active unit during a transfer and confirm the standby takes the address within the target time, existing tunnels continue or reconnect automatically, and the event is logged on both units.",
    dep: ["shared-virtual-address", "state-synchronization", "dead-peer-detection"]
  },
  "active-active-cluster": {
    s: "Several gateways share the load at once, each serving a portion of clients, so capacity grows by adding nodes and a node failure affects only its share.",
    d: "Clients are distributed across members by address, by load balancer or by DNS. Each member holds its own tunnels, and cluster-wide state such as address pools, user session counts and revocation data is shared or partitioned. When a member fails, its clients reconnect to others. Some designs replicate tunnel state to a peer. It is hard because policies that count across the cluster need coordination, because return traffic must reach the member holding the tunnel, and because rebalancing after a node returns moves sessions.",
    k: ["Share-nothing members with client reconnect vs. replicated tunnels: share-nothing scales simply, while replication reduces the user-visible disruption at significant complexity.", "Static assignment of clients to members vs. dynamic: static is predictable, whereas dynamic balances load but needs more state."],
    p: ["Member-local session counting lets a user exceed a global limit by landing on different members.", "Return traffic hashed to the wrong member is dropped because it has no matching tunnel."],
    v: "Add a third member under load and confirm it receives new sessions, then remove one member and confirm only its sessions reconnect, within the target time and without exceeding any global limit.",
    dep: ["client-load-balancing", "state-synchronization", "address-pool"]
  },
  "state-synchronization": {
    s: "Copies the information a standby or peer member needs, such as keys, counters, addresses and session metadata, so it can continue work another node started.",
    d: "The active node sends updates about new tunnels, rekeys and ended sessions over a dedicated link, either per event or in periodic bulk. Counters change on every packet, so they are synchronized in coarse steps, and the standby advances them by a safety margin when it takes over so no nonce is reused. A new member first receives a full snapshot. The hard parts are bandwidth under churn, consistency after a link outage, and protecting replicated keys on the wire.",
    k: ["Replicate counters per packet vs. in jumps with a margin: per packet is exact but too costly; jumps cost a little range but are cheap and safe.", "Event-driven updates vs. periodic bulk: events keep the standby current, whereas bulk is simpler but leaves a window of lost state."],
    p: ["A standby with a stale counter reuses nonces after takeover and exposes the traffic.", "Replication over an unencrypted link sends every session key across the network in the clear."],
    v: "Fail over during a transfer and confirm the standby resumed with a counter beyond any the active unit used, the session survived, and the replication link carried only encrypted data.",
    dep: ["sequence-counters", "security-association-db", "secrets-handling"]
  },
  "shared-virtual-address": {
    s: "A service address that moves between gateways, or is announced from several, so clients dial one stable name and address regardless of which unit is active.",
    d: "The address can be moved by the active node claiming it on the local network and announcing the change, or by announcing the same prefix from several places through routing so the network picks the nearest. Clients connect to it and see the same server identity. After a move, replies must come from this address, not from the unit's own, or the client rejects them. It is hard because stale neighbor caches delay the move, and anycast sends packets of one tunnel to different members when routes change.",
    k: ["Address moved on a shared segment vs. announced by routing: a move is simple within one site, whereas routing works across sites but can split a flow between members.", "Single address vs. multiple names: one address is easy for clients, but gives no way to steer a particular user."],
    p: ["Replies sourced from a unit's own address are rejected by clients expecting the shared one.", "Anycast route changes send the packets of an existing tunnel to a member that has never heard of it."],
    v: "Trigger a failover and confirm a client's next packet reaches the new unit, the replies carry the shared address as their source, and neighbor caches update within the expected seconds.",
    dep: ["active-passive-failover", "network-stack-hooks"]
  },
  "client-load-balancing": {
    s: "Directs each connecting client to a suitable gateway based on health, load or location, through DNS, a load balancer or the client's own selection.",
    d: "Options include DNS answers weighted by load or location, a network load balancer that spreads datagram flows, and a client that probes several gateways and picks the fastest. Health checks remove failed members. Session affinity is needed so all packets of a tunnel reach one member, and the handshake and data traffic must stick together. It is hard because datagram tunnels change source ports, balancers must understand tunnel identifiers to keep affinity, and DNS caches delay removal of a failed gateway.",
    k: ["DNS-based steering vs. an in-path balancer: DNS is simple and cheap, but is slow to react and cached by resolvers.", "Client-side probing vs. server-side assignment: probing finds the best path for that user, but adds connection delay and traffic."],
    p: ["A balancer that hashes only on source port splits one tunnel's handshake and data across members.", "A low DNS expiry that resolvers ignore leaves clients dialing a dead gateway for minutes."],
    v: "Take one gateway out of service and confirm new clients are sent elsewhere within the health-check interval, while a transfer through a tunnel on a healthy member stays on that member throughout.",
    dep: ["health-probes", "active-active-cluster"]
  },
  "session-resumption": {
    s: "Lets a client that lost its tunnel reconnect quickly using a ticket or cached state from the earlier session, without repeating full authentication.",
    d: "At connect the gateway issues an encrypted ticket containing session details, or stores them keyed by an identifier. A returning client presents it, and the gateway skips the interactive steps and re-derives keys with a fresh exchange. This makes reconnects after sleep, network changes or a gateway switch nearly instant. Tickets have a short life and can be revoked. It is hard because tickets must be protected by a key shared across cluster members, and because resumption can mask account disablement.",
    k: ["Stateless tickets vs. server-side session store: tickets need no storage and work across members, but all rely on one ticket key whose exposure is serious.", "Long resumption window vs. short: a long window helps travelers on poor links, but extends access after an account is disabled."],
    p: ["A ticket key shared across the cluster and never rotated lets one leak decrypt every ticket ever issued.", "Resuming without rechecking account status keeps a terminated user connected."],
    v: "Connect, disconnect, reconnect within the window and confirm no password or factor prompt occurs, then disable the account and confirm the next resumption is refused.",
    dep: ["forward-secrecy", "reauthentication-timers"]
  },
  "mobile-roaming": {
    s: "Keeps a tunnel alive as the client's outer address changes between networks, such as moving from cellular to Wi-Fi, by updating the endpoint without a new handshake.",
    d: "When the client's address changes, it sends authenticated packets from the new address. The gateway verifies them against the existing tunnel and, once confirmed, updates the peer's address and sends replies there. A standard extension to the key exchange protocol lets the client announce the change explicitly. Datagram-based designs update the endpoint on any authenticated packet. It is hard because address updates must not be accepted from unauthenticated packets, applications may see a brief stall, and the old path can carry delayed packets.",
    k: ["Update endpoint on authenticated packet vs. require explicit announcement: implicit is seamless, while explicit gives the gateway control and a place to apply policy.", "Seamless roaming vs. reauthentication on every change: seamless keeps applications running, but a stolen session key works from anywhere."],
    p: ["Accepting an address change from an unauthenticated packet lets an attacker hijack the tunnel's return path.", "Stateful firewalls in front of the gateway drop the roamed packets because they see a new source."],
    v: "Move a client from one network to another during a continuous transfer and confirm the same tunnel continues, the gateway's peer address changes after an authenticated packet, and the stall is under the documented time.",
    dep: ["port-floating", "dead-peer-detection", "security-association-db"]
  },
  "multipath-links": {
    s: "Uses several outer paths between two gateways, such as two internet links, either for failover or to combine their bandwidth, and chooses among them per tunnel or per packet.",
    d: "Redundant tunnels over separate links are monitored, and traffic moves when one fails. More advanced designs send packets of one flow across links, which needs reordering tolerance and a bigger replay window. Path quality probes measure loss and latency so traffic can prefer the best link. It is hard because links differ in latency and size, which reorders packets and triggers retransmission, and because per-flow decisions made on stale measurements can oscillate between links.",
    k: ["Failover only vs. aggregate bandwidth: failover is predictable and simple, whereas aggregation uses all capacity but reorders packets and needs tuning.", "Per-flow assignment vs. per-packet spreading: per-flow keeps order but balances unevenly; per-packet balances but hurts transport performance."],
    p: ["Two links of different latency reorder packets enough to exceed the replay window and drop good traffic.", "Path switching on noisy measurements flaps traffic between links every few seconds."],
    v: "Fail one link during a transfer and confirm traffic moves to the other within the target time; then restore it and confirm traffic returns without a loop or duplicate delivery.",
    dep: ["site-to-site-tunnels", "anti-replay-window", "health-probes"]
  },
  "network-stack-hooks": {
    s: "The points in the operating system's networking code where the gateway intercepts packets, applies tunnel policy and reinjects results, alongside firewall and routing.",
    d: "Packets pass through ordered stages: receive, firewall pre-routing, routing decision, forwarding, post-routing, send. Encryption and decryption attach at defined points so that the firewall sees the right form, outer or inner, at each stage. Interaction with connection tracking and address translation is delicate: translation rules must exempt tunnel traffic or choose it deliberately. It is hard because the same packet traverses these stages twice, once clear and once encrypted, and rule ordering errors cause silent drops.",
    k: ["Tunnel processing before the firewall vs. after: before lets the firewall see clear inner traffic, whereas after sees only the encrypted form.", "Rely on the system's policy engine vs. a private one: the system engine integrates with existing tools, but couples the gateway to the host's behavior."],
    p: ["A translation rule that rewrites tunnel traffic breaks selectors, and the tunnel works for some addresses only.", "Firewall rules that allow the handshake port but not the data protocol leave tunnels that negotiate and then pass nothing."],
    v: "Trace a test packet through the host's stages with counters or tracing and confirm it appears as clear inner traffic at the forwarding step and as ciphertext at the send step, matching the firewall rules.",
    dep: ["packet-io-driver"]
  },
  "random-number-source": {
    s: "The supply of unpredictable bytes that generates private keys, nonces, cookies and identifiers; its quality sets the strength of every other cryptographic step.",
    d: "The system gathers entropy from hardware sources and events and feeds a generator that the gateway reads. At first boot, especially on embedded appliances or virtual machines cloned from an image, entropy may be low, and keys generated then can be weak or identical across devices. Processors provide a hardware instruction that supplements the pool. It is hard because failure is invisible: weak randomness produces keys that work normally but are guessable, and it often cannot be tested from the outside.",
    k: ["Block until the pool is seeded vs. proceed immediately: blocking delays start, whereas proceeding risks predictable first keys.", "Rely on the processor's instruction alone vs. mixing several sources: one source is simple, but a single flaw in it would expose everything."],
    p: ["Virtual machines cloned from one image start with the same state and generate identical keys.", "Generating a long-term key on first boot before the generator is seeded creates a weak key that lasts for years."],
    v: "Boot two clones of one image, generate keys on each and confirm they differ; confirm the system reports the generator as initialized before the gateway's first key generation in the boot log.",
    dep: []
  },
  "secure-key-storage": {
    s: "Where long-term private keys and secrets are kept on a gateway or client, with protection against reading by other processes, backups and anyone with physical access.",
    d: "Options range from files with strict permissions, through operating system key stores that restrict access to the process, to a hardware module or trusted chip that performs signing without exposing the key. On clients, hardware-backed stores bind the key to the device. Keys in memory are locked out of swap and dumps where possible. It is hard because the tunnel process needs to use the key constantly, and any design where the key is exportable is eventually exported by a backup or a diagnostic bundle.",
    k: ["Non-exportable hardware-backed keys vs. software keys in files: hardware keys cannot be copied off, but complicate backup, migration and support.", "Key unlocked at boot vs. on operator entry: automatic unlock lets the gateway restart unattended, but an attacker with the disk and machine also gets the key."],
    p: ["A support bundle that includes the configuration directory ships the private key to a ticket system.", "World-readable key files on a shared host expose the gateway's identity to every local user."],
    v: "Attempt to read the private key as another local user and from a backup, and confirm both fail; confirm the signing operation succeeds without the key ever appearing in the process's accessible memory dump.",
    dep: ["privilege-separation", "hardware-security-module"]
  },
  "hardware-security-module": {
    s: "A tamper-resistant device that holds issuer or gateway keys and performs signing and decryption on request, so the keys themselves never leave it.",
    d: "The gateway sends data to the module and receives signatures, authenticated by credentials and often by quorum approval for sensitive actions. Modules are used for issuer keys, for gateway identity at high security, and for ticket and wrapping keys. They have limited throughput, so per-handshake signing capacity must be sized, and network-attached ones add latency. It is hard because the module becomes a dependency and a bottleneck: loss of it or of its backup means loss of the identity, and its credentials are another secret to protect.",
    k: ["Module-held identity vs. software key: the module resists theft and extraction, but limits signing rate and adds a failure point.", "Local card vs. network-attached module: local is fast and simple, whereas network-attached serves a cluster and costs latency and a network dependency."],
    p: ["Handshake storms exceed the module's signing rate and every new connection stalls.", "A single module with no backup turns a hardware fault into a permanent loss of identity."],
    v: "Load test handshakes at the peak expected rate and confirm the module keeps up with the signing latency inside the handshake timeout, and confirm the key cannot be exported through its management interface.",
    dep: ["secrets-handling", "certificate-store"]
  },
  "certificate-store": {
    s: "The set of trusted issuer certificates, the gateway's own certificate chain and any pinned peers, with defined rules for who may add or replace entries.",
    d: "The store holds trust anchors used to validate peers, intermediate certificates used to build chains, and the gateway's own certificate with its key reference. It may be separate for different purposes so that an issuer trusted for web services is not automatically trusted for tunnels. Updates are controlled and logged. It is hard because trust that is too broad, for example the whole system set of public issuers, lets any certificate those issuers sign authenticate, and because adding or removing an anchor changes behavior for every connection.",
    k: ["A dedicated trust set for tunnels vs. the system-wide set: dedicated limits who can mint access, but must be maintained separately.", "Pinning specific peer certificates vs. trusting an issuer: pinning is strongest but needs a change at each renewal, whereas issuer trust renews smoothly."],
    p: ["Trusting every public issuer for tunnel authentication means a certificate bought for any domain could open a path.", "An intermediate missing from the served chain makes some clients fail and others, which cached it, succeed."],
    v: "List the trust anchors in use for tunnel authentication and confirm they match the documented set exactly; present a certificate from a public issuer outside that set and confirm it is refused.",
    dep: ["secure-key-storage"]
  },
  "time-sync": {
    s: "Keeping the gateway's clock correct so certificate validity, token lifetimes, key expiry and log ordering all rely on a time that matches the peers'.",
    d: "The gateway synchronizes with several network time sources or a local reference, and tracks its offset. Certificate checks compare the current time with validity dates, and tokens from the identity provider carry issue and expiry times, so a clock that is off by minutes can reject good credentials or accept expired ones. Devices without a battery-backed clock start at a default date and cannot validate certificates until they learn the time. It is hard because time sources are themselves reached over the network.",
    k: ["Several time sources with sanity checks vs. one: several detects a faulty source, but costs more to configure and reach.", "Allow small clock skew in validation vs. none: a small allowance tolerates drift, but also extends the life of an expired credential slightly."],
    p: ["A device booting with the default date rejects every certificate until it gets the time, and then cannot reach the time source through the tunnel.", "Clock drift between cluster members makes logs impossible to order during an incident."],
    v: "Set the gateway's clock ten minutes wrong in a test and confirm token validation fails with a time error and an alert reports the offset, then correct it and confirm connections resume.",
    dep: ["certificate-store"]
  },
  "privilege-separation": {
    s: "Splits the gateway into processes with different rights, so the part that parses untrusted network input has no access to keys or the system, and a flaw there is contained.",
    d: "A small privileged process holds keys and performs sensitive operations, while unprivileged workers parse handshake messages, certificates and policy input. They communicate over narrow interfaces. Workers run with restricted file access, system call filters and a separate user. Networks of untrusted peers send the gateway complex messages, so the parsing code is where a memory error is most likely to be exploited. It is hard because the split adds complexity and a performance cost at the boundary, and the narrow interfaces tend to widen over time.",
    k: ["Separate processes vs. one process with careful code: separation limits damage from a parsing flaw, but adds message passing and latency on the handshake path.", "Syscall filtering vs. trusting the worker: filtering contains an exploited worker, but needs updates whenever the code changes what it calls."],
    p: ["A worker with direct access to the key file makes the separation decorative.", "A broad system-call allowance grows during development and is never tightened again."],
    v: "Inspect the running worker's user, file access and system-call filter, and confirm it cannot open the key file or start a process; a test exploit in the parser should fail to reach key material.",
    dep: ["secure-key-storage"]
  },
  "packet-io-driver": {
    s: "The layer that moves raw packets between the network card and the gateway, through the operating system's driver and queues or a polling mode that bypasses them.",
    d: "Packets arrive in card queues and are delivered by interrupts or by polling into memory buffers. Each queue maps to a core. Receive-side scaling steers flows by hash, and checksums and segmentation can be done on the card. Buffer sizes and queue depth set the tolerance for bursts. It is hard because loss at this level is silent from the tunnel's view, the card's offload features interact with encapsulation, and at high rates the memory system and not the processor becomes the limit.",
    k: ["Interrupt-driven vs. polling: interrupts are efficient at low load and leave the cores free, but polling sustains much higher packet rates.", "Larger buffers vs. smaller: larger absorb bursts, but add queuing delay that worsens latency under load."],
    p: ["Receive queue overruns drop packets before the tunnel sees them, and only the card's own counters show it.", "Offload features that disagree about encapsulated checksums corrupt packets that look valid to the stack."],
    v: "Drive peak packet rate at the smallest size through the gateway and confirm the card's drop counters stay at zero and every queue's load is within the documented range.",
    dep: []
  },
  "trust-model": {
    s: "The decision about whom the gateway trusts, for what, and why: which issuers, which identity sources, which networks and which admins, written down before configuration.",
    d: "A tunnel extends the inside of a network to whoever authenticates, so everything depends on what authenticating means. The model names the issuers allowed to mint access, the identity provider whose assertions count, the networks and devices considered managed, and what a connected client can reach by default. It also says what the gateway itself is trusted with: whether it sees clear traffic, holds keys, or is only a relay. It is hard because broad trust is convenient and invisible, and narrowing it later breaks working access.",
    k: ["Network-level access after authentication vs. per-application access: network-level is simple and general, but a compromised client then sees everything reachable.", "Trust the gateway with clear traffic vs. end-to-end encryption through it: trusting enables inspection and filtering, but makes the gateway a prize target."],
    p: ["Treating a connected client as being inside the network means one stolen laptop reaches all internal systems.", "An undocumented trust decision gets widened by the next person who finds it blocks something."],
    v: "Write the list of issuers, identity sources and default reachable networks, then test with a credential from outside each and confirm the actual behavior matches the list exactly.",
    dep: []
  },
  "crypto-agility": {
    s: "The ability to change algorithms, key sizes and protocol versions across gateways and clients without a flag day, as weaknesses appear and new standards arrive.",
    d: "It needs negotiation or versioning in the protocol, an inventory of what each client supports, telemetry showing which suites are in use, and a path to remove old ones after clients upgrade. Post-quantum hybrids are the current driver: they must be added to the exchange without breaking clients that cannot use them. Fixed-suite protocols trade negotiation for a version change. It is hard because the slowest client sets the pace, and an algorithm cannot be retired until the last device that needs it is gone.",
    k: ["Negotiated suites vs. a fixed suite per version: negotiation lets algorithms change gradually, while a fixed suite removes downgrade attacks but forces coordinated upgrades.", "Retire early with enforced client minimums vs. wait for usage to drop: early is safer, but locks out unmanaged devices."],
    p: ["No telemetry on negotiated suites means nobody knows whether removing one will break anyone.", "Hard-coding algorithm choices in client builds makes every future change a software release."],
    v: "From connection logs, list the percentage of sessions per negotiated suite for the past month, and confirm a test client built with the next planned suite connects while the old suite is disabled for it.",
    dep: ["cipher-negotiation", "client-software-update"]
  },
  "fail-closed-vs-open": {
    s: "What the gateway does when a check cannot be completed: block traffic and access, or allow it. The answer applies to revocation, policy, identity and the whole tunnel itself.",
    d: "Every dependency can fail: the revocation responder, the identity provider, the policy store, the tunnel on a client. Failing closed denies access and disrupts work, while failing open keeps people working and may expose resources. The choice differs by case: a client that loses the tunnel can block local traffic rather than leak it onto the open network, while a revocation outage might allow cached credentials for a limited time. It is hard because the decision is usually made implicitly by whatever the code did on an error.",
    k: ["Fail closed on security checks vs. fail open for availability: closed protects resources, but turns a dependency outage into a full outage.", "Block traffic when the tunnel drops vs. let it leave directly: blocking prevents leaks on hostile networks, but strands users until reconnect."],
    p: ["A client that silently falls back to sending traffic outside the tunnel leaks it onto a hostile network.", "A policy check that returns allow on a timeout lets everyone in during the very outage an attacker caused."],
    v: "Block the revocation responder, the identity provider and the tunnel in turn in a test, and confirm each failure produces the documented outcome, blocked or allowed, and a log entry naming the reason.",
    dep: ["revocation-checking", "identity-provider-federation"]
  },
  "packet-size-budget": {
    s: "The fixed number of bytes in the path's largest packet, and how each layer of the tunnel spends part of it, leaving the rest for the user's data.",
    d: "The path allows a given packet size. The outer headers, datagram wrapper, tunnel header, counters, padding and authentication tag are subtracted, and what remains is the inner packet size. A second wrapper from a fallback transport, or a bigger key exchange message, shrinks it again. Each protocol option changes the number, so the budget has to be computed for every combination. It is hard because failures only occur for large packets, only on some paths, and only when path messages are filtered, which makes them rare and confusing.",
    k: ["Set the inner size low for every user vs. tune per path: low is uniformly safe, but costs efficiency, whereas tuning needs measurement and exceptions.", "Keep handshake messages under one packet vs. allow fragments: small messages avoid loss on filtered paths, but limit large certificate chains and post-quantum values."],
    p: ["A size computed for one cipher is used for all, and the longer tag of another breaks only some packets.", "Adding a second wrapper for the fallback transport without reducing the size recreates the black-hole problem."],
    v: "For each protocol and transport combination, send the largest packet that fits by calculation and one byte more with the do-not-fragment bit set, and confirm the first passes and the second is rejected.",
    dep: ["mtu-discovery", "mss-clamping"]
  },
  "secrets-handling": {
    s: "How every secret is created, stored, transmitted, rotated and erased: private keys, shared keys, tokens, ticket keys, session keys and administrator credentials.",
    d: "A gateway holds long-lived identity keys, short-lived session keys, shared secrets with peers and credentials for its dependencies. Each needs an owner, a storage place with a defined protection level, a rotation interval and a rule for what happens in backups, logs, dumps and support bundles. Session keys exist only in memory; long-term keys sit in hardware where possible. It is hard because secrets leak through side channels nobody designed: debug output, configuration exports, replicated state and crash dumps.",
    k: ["Central secret manager vs. secrets in local configuration: central gives rotation and audit, but adds a dependency needed at start and a place to attack.", "Rotate frequently vs. rarely: frequent limits exposure, but multiplies operational steps that can themselves fail."],
    p: ["Crash dumps that contain session keys written to a shared directory expose every active tunnel.", "A shared secret reused between test and production lets a test-network leak authenticate to the live gateway."],
    v: "Search a configuration export, a support bundle, the logs and a crash dump from a test session for the known test key bytes, and confirm none appear in any of them.",
    dep: ["secure-key-storage", "hardware-security-module"]
  },
  "state-placement-and-scale": {
    s: "Where per-session state lives, in which node's memory, replicated or partitioned, and how that determines how the gateway grows, fails over and handles bursts.",
    d: "Every tunnel has keys, counters, policy and an address, all of which must be reachable to process its next packet. Keeping them in one node's memory is fast but makes the node the failure domain. Replicating them costs bandwidth and complexity; keeping them in a shared store adds latency to the packet path. Handshake load is different from data load: thousands of clients reconnecting after an outage produce a computation spike far above steady state. It is hard because the scaling limit is often handshakes per second or tunnels per node, not megabits.",
    k: ["State in the node vs. in a shared store: in the node is fast and simple, but a failure drops its tunnels; a shared store survives failure and slows every lookup.", "Size for steady load vs. for reconnect storms: steady sizing is economical, but an outage then produces a second outage as clients return."],
    p: ["After a failure, every client reconnects at once and the handshake rate exceeds capacity, which keeps the service down.", "Sizing by throughput alone ignores the per-tunnel memory limit that stops new sessions first."],
    v: "Drop all tunnels at once in a load test and measure how long until all clients are reconnected, and confirm the peak handshake rate, memory per tunnel and recovery time stay within the stated capacity.",
    dep: ["state-synchronization", "cookie-dos-protection"]
  }
});
