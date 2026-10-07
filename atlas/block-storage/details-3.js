// Details for the block storage plate, part 3: failure recovery, encryption, network and hardware.
ATLAS.details("block-storage", {
  "node-health-monitor": {
    s: "Collects heartbeats, drive error counters, latency and temperature from every node and classifies each as healthy, degraded or failed.",
    d: "Each node reports on an interval, and the monitor combines those reports with probes from other nodes and drive self-reported health data. A node that is slow, not dead, is marked degraded so placement avoids it and reads prefer other replicas. States feed the failure detector, capacity tracker and alerting. The hard part is separating a real failure from a transient one: marking nodes failed too eagerly triggers needless rebuilds, and too slowly leaves data under-replicated.",
    k: ["Heartbeats alone versus heartbeats plus performance signals: heartbeats catch dead nodes, while performance signals catch the more common slow ones.", "Central monitor versus peer-to-peer observations: central views are simple, while peer views see network asymmetries a central probe misses."],
    p: ["A node that answers heartbeats but takes seconds per write is counted healthy and stalls every volume it serves.", "Reporting through the same network that is failing hides the failure."],
    v: "Inject a one-second delay on one drive and confirm the monitor marks the node degraded within its stated window, placement stops choosing it and replica reads shift away from it.",
    dep: ["failure-detector", "capacity-tracker"]
  },
  "failure-detector": {
    s: "Decides when a node or drive is considered lost, using timeouts adapted to observed behavior and requiring agreement from several observers.",
    d: "It turns health signals into a decision that starts recovery. Fixed timeouts are simple but tuned for one environment. Adaptive detectors estimate the arrival distribution of heartbeats and compute a suspicion level. A node must be suspected by a quorum of observers so one flaky link does not condemn it. The decision is published with an epoch so recovery acts on one agreed view. The hard part is balance: a short timeout rebuilds data after a reboot that would have come back in a minute.",
    k: ["Short timeout and fast rebuild versus long timeout and fewer rebuilds: fast rebuild reduces exposure to a second failure, while a long timeout avoids copying terabytes for a restart.", "Single decision point versus distributed voting: a single point is consistent and a bottleneck, while voting is resilient but slower to converge."],
    p: ["A network partition makes a healthy rack look dead, and the system starts copying everything it holds.", "Detection delay is longer than the time to a second failure, causing data unavailability."],
    v: "Reboot a node in a test cell and confirm no rebuild starts when it returns within the grace time. Then keep it down past the threshold and confirm rebuild starts exactly once with the node recorded as failed.",
    dep: ["node-health-monitor", "epoch-manager"]
  },
  "repair-prioritizer": {
    s: "Orders the rebuild queue so chunks with the fewest remaining healthy replicas are repaired first.",
    d: "After a failure, many chunks lose a copy. The prioritizer ranks them by remaining redundancy: those with one copy left come before those with two. It accounts for how long they have been under-replicated and for volumes whose owners need the data now. As new failures occur the queue is re-ranked. The reason is arithmetic: the chance of data loss comes from a second failure hitting chunks that are already at risk, so shortest exposure first minimizes it. The hard part is keeping the ranking current at large queue sizes.",
    k: ["Repair the most endangered chunks first versus oldest first: endangered-first minimizes loss probability, while oldest-first is fair but can leave critical data waiting.", "Static ranking at failure time versus dynamic re-ranking: dynamic follows later failures but costs queue maintenance."],
    p: ["A flat first-in first-out queue leaves single-copy chunks waiting behind two-copy ones after a second failure.", "Ranking by volume importance lets a favored customer's chunks delay critical repairs of others."],
    v: "Fail two nodes sharing some groups, then confirm chunks left with a single copy complete rebuilding before any chunk that retains two, by comparing completion timestamps.",
    dep: ["re-replication-scheduler", "replica-set"]
  },
  "re-replication-scheduler": {
    s: "Creates new copies of chunks that lost a replica, choosing sources and targets so rebuild proceeds in parallel across many nodes.",
    d: "For each under-replicated chunk the scheduler picks a surviving replica as the source and a new node as the target through the placement engine, then orders a copy. Because each volume's chunks are scattered across many groups, a failed drive's data is rebuilt from many sources to many targets at once, so recovery time falls as the cluster grows. The target is added to the replica group by an epoch change. The hard part is orchestration at scale: millions of copies with limits per node and bandwidth caps.",
    k: ["Rebuild in parallel from many sources versus in one dedicated spare: parallel rebuild finishes in minutes and spreads load, while a spare is simple but takes hours and is a hotspot.", "Copy-then-join versus join-then-catch-up: copy-then-join is simple, while joining early lets the target take new writes sooner but needs a catch-up protocol."],
    p: ["Choosing the same source for many copies overloads one surviving replica.", "Copy tasks that are not idempotent produce duplicate replicas after a scheduler restart."],
    v: "Fail one drive holding a known number of chunks and confirm every affected chunk returns to full redundancy in the expected time, with copies sourced from many nodes and no node exceeding its recovery cap.",
    dep: ["repair-prioritizer", "placement-engine", "recovery-throttle", "replica-resync"]
  },
  "recovery-throttle": {
    s: "Limits the bandwidth and drive time that rebuild and migration traffic may use, so recovery does not degrade customer I/O.",
    d: "Each node and link has a budget for background work, expressed as a share of bandwidth and of drive operations, that the throttle enforces. The budget adapts: it rises when foreground load is light or when data is at high risk, and falls when latency rises. The throttle sees a single rebuild-versus-foreground tradeoff and exposes it to operators. The hard part is that speeding up rebuild shortens the risk window while slowing customers, and the right point changes with the situation.",
    k: ["Fixed share for recovery versus adaptive to risk and load: fixed is predictable, while adaptive recovers faster when it matters and needs good signals.", "Throttle at the source, target or both: throttling both is safest for the nodes involved, but needs coordination to avoid mutual waiting."],
    p: ["A throttle tuned for ordinary load makes a large failure take days to repair.", "No throttle at all lets a rebuild double customer latency fleet-wide."],
    v: "Run a rebuild under steady foreground load and confirm foreground tail latency stays inside its bound while rebuild throughput equals the configured share, and rises when the foreground load stops.",
    dep: ["node-io-scheduler", "volume-metrics"]
  },
  "correlated-failure-guard": {
    s: "Prevents planned and automated actions, such as upgrades, drains and repairs, from taking down too many members of the same replica groups at once.",
    d: "Before an operator or automation removes a node, the guard checks how many groups would drop below their safe replica count and refuses or delays the action when the result crosses a threshold. It also pauses recovery that would remove more redundancy than it adds, and detects patterns such as a rack of drives all failing in a short span. It uses the failure-domain model. The hard part is that safe rules must be enforced by every tool, since one script that bypasses the guard can cause an outage.",
    k: ["Central guard that all tools call versus per-tool rules: central enforcement is consistent, but becomes a dependency for urgent maintenance.", "Blocking actions versus warning: blocking prevents mistakes, while warnings let experienced operators act in emergencies."],
    p: ["An upgrade tool that checks nodes one at a time but not their shared groups removes a quorum.", "An emergency override left on after an incident disables protection for later maintenance."],
    v: "Request draining of two nodes that share a replica group in a cell where the rule allows one, and confirm the second request is refused with the group named, and no volume lost quorum.",
    dep: ["failure-domain-model", "replica-set", "node-health-monitor"]
  },
  "disk-lifecycle": {
    s: "Tracks each drive from installation through monitored service to retirement, including predicted failure, secure wipe and replacement.",
    d: "Each drive has a record with its model, firmware, age, written bytes and error history. Wear and error trends trigger proactive evacuation before failure, which is cheaper than a rebuild after one. Retired drives are cryptographically erased or wiped before leaving the data center. Firmware updates follow a staged rollout because drive firmware is a common source of fleet-wide faults. The hard part is acting on weak signals: acting too early wastes hardware and moves lots of data, and too late causes failures.",
    k: ["Proactive evacuation on predicted failure versus waiting for failure: evacuation avoids degraded redundancy, but replaces drives that might have lasted longer.", "Mixing drive models in a pool versus homogeneous pools: mixing eases supply, but one model's flaw can affect many replicas of the same data."],
    p: ["All drives from one batch with the same defect failing within weeks overwhelms recovery.", "A drive returned to the supplier without erasing exposes customer data."],
    v: "Simulate rising errors on a drive and confirm the system evacuates its chunks before it is marked failed, the record shows the sequence, and the drive's contents are unreadable after wipe.",
    dep: ["node-health-monitor", "crypto-erase", "migration-coordinator"]
  },
  "migration-coordinator": {
    s: "Runs controlled moves of chunk replicas between nodes, ensuring the data is copied, verified and switched in the map atomically.",
    d: "Used by the rebalancer, drain operations and type changes. It creates the new replica, streams the chunk while still accepting writes by forwarding them to both locations, verifies a checksum, then switches the chunk map to include the new location and removes the old one. Throttling and retries keep it gentle. The same machinery moves a whole volume from one type to another. The hard part is the concurrent writes during the move: no write may be missing from the new replica at the switch.",
    k: ["Dual-write during the copy versus copy then replay a log of changes: dual-write is simple and keeps the copy current, while replay avoids touching the write path but needs a catch-up phase.", "Per-chunk atomic switch versus per-node bulk switch: per-chunk limits the blast radius of a bug, but means many small metadata updates."],
    p: ["A switch performed before the final catch-up leaves the new replica missing the latest writes.", "A failed move that leaves both copies live lets deletions and updates diverge."],
    v: "Migrate a chunk under continuous writes and confirm the new replica's checksum equals the others after the switch, no acknowledged write is missing and the old location holds nothing afterward.",
    dep: ["replica-resync", "chunk-map", "epoch-manager", "recovery-throttle"]
  },
  "scrub-scheduler": {
    s: "Schedules background reads that verify every stored block against its checksum and every replica against its peers, at a rate that does not disturb customers.",
    d: "Drives and replicas can silently corrupt data, so every chunk is periodically read and verified. The scheduler spreads the work across nodes and time so each chunk is covered within a target period, such as two weeks, and prioritizes chunks not checked recently or on drives with error history. Findings are repaired from a good replica. Scrub rate is a budget separate from recovery. The hard part is that full-fleet scrubbing reads every byte repeatedly, which costs drive wear and bandwidth.",
    k: ["Scrub on a fixed cycle versus risk-driven: a fixed cycle gives a bounded guarantee, while risk-driven scrubbing focuses effort and gives no worst-case bound.", "Verifying checksums locally versus comparing replicas across the network: local is cheap and catches bit rot, while cross-replica comparison catches lost or misdirected writes."],
    p: ["Scrubbing that shares the foreground queue makes weekly latency spikes appear on schedule.", "A scrubber that only checks checksums misses a replica missing a write entirely, since both the data and its checksum are old."],
    v: "Flip a bit in one replica's stored block, wait for the scrub, and confirm the corruption is found, repaired from another replica, logged with the chunk and node, and customer reads never returned the bad bytes.",
    dep: ["checksum-engine", "consistency-scrubber", "recovery-throttle"]
  },
  "key-hierarchy": {
    s: "The layered keys that protect data: a master key in the key service, a per-volume key wrapped by it, and data encryption keys derived or wrapped per chunk or snapshot.",
    d: "Data is encrypted with data keys, which are themselves encrypted, or wrapped, by a volume key, which is wrapped by a master key held in a key service or hardware module. Only wrapped keys are stored with the volume. To use a volume the service unwraps its key by calling the key service, then caches the result in memory. Rotating the master key rewraps volume keys without touching data. The hard part is that revoking a key must make data unreadable, while recovery from a lost key is impossible by design.",
    k: ["A key per volume versus a key per chunk: per-volume is simple to manage and revoke, while per-chunk limits damage from one leaked key but multiplies key management.", "Rewrapping on rotation versus re-encrypting data: rewrapping is cheap and fast, while re-encrypting is the only way to retire a compromised data key."],
    p: ["Snapshots and clones sharing a key mean revoking a volume's key also locks every related volume.", "Deleting a key before confirming no snapshot needs it makes the snapshot permanently unreadable."],
    v: "Disable a volume's master key and confirm new reads and writes fail with a key error, then re-enable it and confirm the volume reads correctly, and the stored form of data on a drive is unintelligible without the key.",
    dep: ["key-service-client"]
  },
  "key-service-client": {
    s: "The component that asks the external key service to wrap and unwrap keys on behalf of the storage service, with authentication, retries and audit.",
    d: "Whenever a volume is created, attached or snapshotted, the storage service sends a wrapped key to the key service and gets the plaintext key back if the caller is allowed. The request includes the volume and account context so the key service can apply policy and log it. The client handles timeouts, retries and caching. Because unwrap is on the attach path, key service availability affects attach, but not running volumes whose keys are cached. The hard part is not creating a new global dependency on a service outside the storage fleet.",
    k: ["Synchronous unwrap on attach versus pre-fetching keys: synchronous is simplest and gives immediate revocation, while pre-fetching survives key service outages but delays revocation.", "Service identity per storage node versus per volume owner: node identity is simple, while owner identity gives the customer's policy direct control."],
    p: ["A key service outage blocks every attach and snapshot restore in a region.", "Retrying unwrap aggressively during an outage floods the key service when it returns."],
    v: "Block the key service while a volume is running and confirm I/O continues from cached keys, new attaches fail with a clear error, and normal service resumes within seconds of restoring access.",
    dep: ["key-hierarchy", "transit-encryption"]
  },
  "data-key-cache": {
    s: "Holds unwrapped keys in protected memory for a bounded time so each I/O does not need a key service call, and erases them on expiry or detach.",
    d: "Keys live only in memory on the frontends, nodes or offload cards that need them, never written to disk in plaintext, with a time limit and a size limit. On expiry the key is wiped and re-fetched. Entries are keyed by volume and key version. Processes that handle keys run with restricted access and no crash dumps. The hard part is the tradeoff between cache lifetime and revocation: a long lifetime survives outages and a short one revokes quickly.",
    k: ["Long cache lifetime versus short: long survives key service outages and reduces load, while short makes revocation take effect quickly.", "Keys in host memory versus in hardware: hardware protects against memory inspection, while host memory is simpler and cheaper."],
    p: ["Core dumps that include cached keys leak them to anyone with access to crash data.", "A revoked key stays usable until the cache expires, after the customer believes it is disabled."],
    v: "Revoke a key and measure the time until the first failed I/O. Confirm it equals the configured lifetime bound, and a dump of the process contains no plaintext key bytes.",
    dep: ["key-service-client", "encryption-engine"]
  },
  "encryption-engine": {
    s: "Encrypts and decrypts each block with a per-volume key at the service or on the host, binding ciphertext to its location so blocks cannot be swapped.",
    d: "Blocks are encrypted with a symmetric cipher in a mode designed for storage, using the logical block address as a tweak or nonce input so the same plaintext at different addresses gives different ciphertext. It runs where the keys are available: the host card, the frontend or the node, with hardware acceleration. Encryption happens before data leaves a trust boundary. Integrity is separate and handled by checksums. The hard part is performance at full drive speed without adding tail latency, and never reusing a nonce with the same key.",
    k: ["Encrypt on the client side versus at the storage node: client-side keeps plaintext off the network and service, while node-side makes snapshots and cloning simpler to manage.", "Length-preserving storage mode versus authenticated encryption: length-preserving fits fixed block sizes exactly, while authenticated encryption detects tampering but needs space for tags."],
    p: ["A nonce reused after a restore from snapshot leaks relationships between plaintexts.", "Software encryption on a saturated frontend core adds queueing delay visible in tail latency."],
    v: "Write known plaintext at two addresses, read the raw drive bytes and confirm they differ from the plaintext and from each other, and read back through the service to get the plaintext exactly.",
    dep: ["data-key-cache", "key-hierarchy"]
  },
  "transit-encryption": {
    s: "Encrypts and authenticates traffic between host, frontend and storage nodes so that network observers or tampering devices cannot read or modify I/O.",
    d: "Connections use a standard transport security protocol with mutual authentication, certificates for services and short-lived credentials for hosts. Inside a trusted data center some deployments rely on isolation and encrypt only between zones or regions. Hardware offload keeps the cost low. Session keys rotate. The hard part is cost versus assurance: encrypting every hop of a latency-sensitive path adds CPU and microseconds, and getting certificate rotation wrong causes sudden mass disconnection.",
    k: ["Encrypt all internal traffic versus only crossing trust boundaries: encrypting everything is simpler to reason about, while boundary-only saves cost on the hot path.", "Long-lived certificates versus short-lived with automatic renewal: short-lived limits exposure, but a failed renewal system breaks connectivity at scale."],
    p: ["Certificates expiring at the same moment on thousands of nodes disconnect the fleet together.", "Disabling verification to debug a problem and leaving it off exposes the path to impersonation."],
    v: "Capture traffic between host and frontend and confirm no plaintext block content appears, then present a connection with a certificate from the wrong authority and confirm it is refused.",
    dep: ["transport-stack"]
  },
  "access-policy": {
    s: "Decides which accounts and hosts may attach, snapshot, copy or delete a volume, using identity policies and per-volume sharing settings.",
    d: "Each API call and each attach is authorized against the caller's identity and the resource's policy, including whether the host belongs to the same account or has been explicitly granted. The attach grant carries into the data path as a credential that the protocol target verifies. Snapshot sharing with other accounts is explicit and listed. Evaluations are logged for audit. The hard part is consistency between control and data paths: a revoked permission must also invalidate credentials already issued to hosts.",
    k: ["Short-lived data-path credentials versus long-lived grants: short-lived limit damage from leaked credentials, at the cost of renewal traffic and renewal failures.", "Deny by default with explicit sharing versus open within an account: deny-by-default prevents accidental exposure, but adds steps for legitimate sharing."],
    p: ["A snapshot shared publicly by mistake exposes every block, including secrets in free space.", "Revoking an identity policy does not revoke credentials already held by a running host."],
    v: "Revoke an account's permission on a volume while attached, and confirm the next credential renewal fails, the host loses access within the stated time and the audit log records the denial.",
    dep: ["tenant-isolation", "attachment-registry"]
  },
  "crypto-erase": {
    s: "Makes deleted or recycled data unrecoverable by destroying its encryption key rather than overwriting every block.",
    d: "When a volume is deleted, its wrapped key is destroyed after a retention window. Without the key the ciphertext on any drive, replica or backup is unreadable. This is far faster than overwriting terabytes and also covers copies on failed drives that cannot be wiped. Chunks are then reclaimed normally. For a volume without encryption, space is zeroed or the drive is wiped. The hard part is that key destruction must be complete, across caches, backups and snapshots that share the key, and verifiably irreversible.",
    k: ["Key destruction versus overwriting: key destruction is instant and works on failing drives, but depends entirely on the key service handling destruction reliably.", "Retention window before destruction versus immediate: a window allows recovery from accidental deletion, but delays the guarantee."],
    p: ["A cached copy of the key outlives the deletion and the data stays readable.", "A new volume allocated onto reclaimed space reads old blocks if freed space is not zeroed or keyed uniquely."],
    v: "Delete a volume, wait for the retention window, then confirm the key is destroyed, the key service cannot unwrap it, and raw drive blocks that held its data decrypt to nothing recognizable.",
    dep: ["key-hierarchy", "trim-and-reclaim"]
  },
  "tenant-isolation": {
    s: "Keeps one customer's volumes from reading, corrupting or starving another's, through identity checks, separate keys and fair queues.",
    d: "Isolation has several layers: a request can reach only volumes its connection is authorized for, each tenant's data is encrypted with distinct keys, the frontend validates offsets against the volume size, and queues and limits stop one tenant from using another's capacity. Management traffic is separated from the data network. Memory is zeroed between uses. The hard part is shared components: a buffer reused without clearing, a cache keyed by chunk number across tenants, or a mispointed map entry crosses a boundary.",
    k: ["Shared fleet with logical isolation versus dedicated hardware per tenant: logical isolation is efficient, while dedicated hardware gives the strongest guarantee at much higher cost.", "Per-tenant keys versus one fleet key: per-tenant keys contain a key compromise, at the cost of key management overhead."],
    p: ["A cache keyed by chunk identifier alone, without volume identity, can return one tenant's data to another after identifier reuse.", "Unbounded per-tenant queue growth lets one customer exhaust shared memory."],
    v: "From one account, attempt to read another's volume by guessing its identifier and by forging offsets beyond the size. Confirm both are refused, and a memory dump of the frontend shows no plaintext from the other tenant.",
    dep: ["access-policy", "encryption-engine", "io-queue-manager"]
  },
  "storage-network": {
    s: "The data center fabric between hosts, frontends and storage nodes, designed with enough bandwidth and path diversity that no single link is a bottleneck or failure point.",
    d: "A multi-tier fabric gives every host and node equal-cost paths to every other. Traffic is spread by flow hashing or per-packet spraying. Storage traffic gets its own queues or priority class so bulk transfers and recovery do not delay latency-sensitive I/O. Oversubscription between tiers is chosen from measured demand. The hard part is the tail: a congested uplink, a failing optic dropping one percent of packets, or hash collisions on one path add milliseconds that no software above can recover.",
    k: ["Dedicated storage network versus shared with compute: dedicated is predictable and isolates faults, while shared is cheaper and flexible.", "Flow-level hashing versus packet spraying: hashing preserves ordering and is simple, while spraying balances load better but requires the transport to tolerate reordering."],
    p: ["A link dropping a few packets raises tail latency fleet-wide without any alarm for an outage.", "Oversubscription that is fine for averages saturates during rebuild and replication peaks."],
    v: "Drive all-to-all traffic at the design rate and confirm per-link utilization stays within a stated spread, packet loss is below the limit, and a single link pull changes latency by less than a stated bound.",
    dep: ["rack-topology"]
  },
  "transport-stack": {
    s: "The transport protocol and its implementation used for storage messages, tuned for small messages, low latency and many parallel connections.",
    d: "Options range from the general reliable stream protocol in the kernel, to user-space implementations that bypass the kernel with polling and zero-copy buffers, to remote memory access over the network. The stack handles connection setup, retransmission, flow control and message framing. Small writes dominate, so per-message overhead matters more than raw bandwidth. The hard part is behavior at the edges: a short packet-loss burst can trigger long retransmission timeouts, adding hundreds of milliseconds, unless the stack uses tighter timers.",
    k: ["Kernel stream protocol versus user-space bypass: the kernel is robust and well-understood, while bypass gives lower latency and CPU cost but takes on reliability code.", "One connection per volume versus multiplexing volumes on shared connections: per-volume isolates head-of-line blocking, while sharing scales to many more volumes."],
    p: ["Default retransmission timers turn a single dropped packet into a visible stall.", "Multiplexing many volumes on one stream lets one stalled request block unrelated volumes."],
    v: "Drop one packet in a hundred on a test link and compare 99.9th-percentile write latency before and after tuning timers. Confirm the tuned stack stays below a stated multiple of normal latency.",
    dep: ["storage-network", "congestion-control"]
  },
  "congestion-control": {
    s: "Adjusts sending rates based on signals from the network so queues stay short and flows share links fairly, even during synchronized bursts.",
    d: "Storage traffic is bursty and many-to-one: a read of a striped range or a rebuild makes many senders target one receiver. Algorithms use explicit congestion marking from switches, delay measurements or loss to slow down early. Credit-based schemes let receivers grant sending rights so queues never overflow. Different traffic classes get different weights. The hard part is tuning: aggressive senders give high throughput, while lazy ones leave capacity unused, and incast collapses throughput when many replies converge on one port.",
    k: ["Marking-based control with switch support versus loss-based end-to-end: marking keeps queues short and latency low, but needs consistent switch configuration.", "Receiver-driven credits versus sender-driven windows: credits prevent incast at the cost of a round trip for the first data, and windows start quickly but can overload."],
    p: ["Incast from a wide read makes throughput collapse when many nodes reply at once.", "Misconfigured marking thresholds on one switch generation make flows through it unfair."],
    v: "Have sixty-four nodes send a reply to one receiver at the same instant, and confirm goodput stays near line rate with queue depth under the stated bound and no flow gets less than half the fair share.",
    dep: ["storage-network"]
  },
  "rack-topology": {
    s: "The physical arrangement of servers into racks, power domains, network tiers and zones, recorded as the ground truth for placement and recovery.",
    d: "Inventory records for each node say which rack, switch, power feed and zone it sits in, plus the drives it holds. The record is created at installation and updated by automation when hardware moves. Racks are sized so that one rack's loss is survivable and so rebuild bandwidth after a rack failure fits the uplinks. The hard part is accuracy: topology used for failure-domain decisions is only as good as the records, and physical changes happen faster than data entry.",
    k: ["Small racks and many failure domains versus large racks: small racks limit the effect of a single failure, but cost more in switches and space.", "Automatic topology discovery versus manual records: discovery finds drift, but cannot see power feeds, so manual records remain necessary."],
    p: ["Hardware moved to a different rack without updating records breaks the assumption of independent replicas.", "Rebuild after a rack loss saturates its neighbors' uplinks because they were sized only for average load."],
    v: "Compare recorded topology against a physical audit and network discovery of one hall, and confirm no node's rack or power feed label differs. Pull one rack's power and confirm all volumes stay available.",
    dep: []
  },
  "media-pools": {
    s: "Groups of drives of one kind, such as flash for latency-sensitive volumes and spinning disks for throughput volumes, each backing a volume type.",
    d: "A pool holds nodes with a consistent drive class, controller and network, so the performance promised to a type can be reasoned about. Solid-state pools serve small random I/O with low latency, magnetic pools serve large sequential I/O at a lower cost per byte. Pools have their own capacity targets, redundancy scheme and background-work budgets. Volumes change pool by migration. The hard part is capacity planning across pools whose demand differs and shifts, and keeping a pool's performance consistent as drives age.",
    k: ["Separate pools per tier versus mixed drives with automatic tiering: separate pools give predictable performance, while mixed tiering uses flash efficiently but hides latency variation.", "Many small pools versus few large pools: small pools limit the blast radius, and large pools pack better and rebuild faster."],
    p: ["A flash pool near full slows from garbage collection inside the drives, breaking the latency promise.", "Mixed drive generations in one pool give volumes uneven latency depending on which replica answers."],
    v: "Benchmark a volume on each pool type at its advertised limits and confirm latency percentiles and throughput match the type's published targets, then repeat when the pool is at its fullness limit.",
    dep: ["rack-topology"]
  },
  "persistent-log-device": {
    s: "A fast, small, byte-addressable or low-latency device that holds the write journal so a write can be acknowledged before it reaches the main drives.",
    d: "Writes append to a journal on a device with microsecond-scale persistence, such as battery-backed memory, persistent memory or the fastest class of flash. Acknowledgement happens once the journal copy is durable, and the data is later moved to the capacity drives in larger, sequential operations. The device is small and written continuously, so endurance and capacity matter. The hard part is sizing and failure: if the log device fails, all unflushed writes on the node are lost, so durability depends on replicas elsewhere.",
    k: ["A separate journal device versus journaling on the data drive: a separate device gives low latency and lets data drives take large writes, but adds hardware and a failure point.", "Battery-backed memory versus flash for the journal: memory has the lowest latency but limited size and a power-loss dependency, flash is larger with a higher latency."],
    p: ["A journal that fills because the destage is slower than ingest suddenly stalls every write on the node.", "A power loss with a failed backup battery loses acknowledged writes on that replica."],
    v: "Cut power to a node under write load, restart it, and confirm every write acknowledged before the cut is recovered from the journal and readable after replay.",
    dep: ["write-ahead-journal"]
  },
});
