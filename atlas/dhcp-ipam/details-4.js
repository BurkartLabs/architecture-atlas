// Details for the DHCP & IPAM plate, part 4: lease database, failover, address safety, DNS registration, foundation.
ATLAS.details("dhcp-ipam", {
  "lease-store": {
    s: "The durable table of every lease and binding: address, client identity, state, start, end, and the options and relay data that matter later.",
    d: "Each record is keyed by address, with an index by client identifier. It is updated on every grant, renewal, release and expiry, so the write rate is high, but each record is tiny. Reads are served from memory. The store must survive crashes with no loss of acknowledged grants. It also feeds history, failover and queries. The hard parts are keeping write cost low and bounded on a busy network, and defining what is durable (the lease) versus rebuilt (state derived from time).",
    k: ["Append-only file vs transactional database: an append-only file is fast and simple; a database gives queries and sharing but costs per-write overhead.", "Store every renewal vs only changes of state: every renewal is exact; storing only state changes reduces writes but needs recovery logic for current end times."],
    p: ["Renewals rewrite the full record every time, so a restart-time wave doubles into an I/O storm.", "The store is on slow shared storage, and grant latency follows its tail latency."],
    v: "Grant leases to many test clients, restart the server, and confirm every address, client identifier and end time reloads identically, and the number of records matches the count before the restart.",
    dep: ["write-ahead-journal", "in-memory-lease-index"]
  },
  "write-ahead-journal": {
    s: "A sequential log where each lease change is appended before it is acknowledged, so state can be rebuilt after a crash by replaying it.",
    d: "Appending is far cheaper than updating a table in place: one sequential write per change. On start, the server loads the last snapshot and replays the journal. Each entry carries enough to be idempotent, so replaying twice is harmless. The log grows without bound until compacted. The hard parts are partial writes at a crash (a torn final record must be detected and discarded) and the policy for forcing data to stable storage.",
    k: ["Force to disk on every record vs batch: forcing every record is safe; batching raises throughput but widens the loss window.", "Binary vs text records: binary is compact and quick; text can be read and repaired by hand."],
    p: ["A power loss leaves a half-written final record, and the server refuses to start rather than ignoring it.", "The journal is never compacted and replay on restart takes many minutes, delaying recovery."],
    v: "Write grants, kill the process mid-write using a fault injector, restart, and confirm replay stops cleanly at the last complete record and no acknowledged lease is missing.",
    dep: ["sync-policy", "lease-store"]
  },
  "in-memory-lease-index": {
    s: "The in-memory structures that answer which address a client holds and which addresses are free, kept in step with the durable store.",
    d: "Hash tables or trees are keyed by address, by client identifier and by expiry time, and a free list or bitmap per pool. A request hits only memory. Memory use is proportional to the number of leases, and for IPv6 pools the free structure cannot be a bitmap of the whole space. The index is rebuilt from the store at startup, which sets restart time. The hard parts are concurrency between workers and exact consistency with the durable copy.",
    k: ["Single lock vs sharded indexes: a single lock is simple and correct; sharding scales across cores but complicates multi-key operations.", "Index by identifier and address both vs address only: both give fast lookups from either direction; address only saves memory but makes client lookups scan."],
    p: ["Workers update the index and the journal in different orders, so a crash leaves them inconsistent.", "An index sized for IPv4 is used for a huge IPv6 pool and consumes all memory."],
    v: "Run a concurrent load of grants and renewals, then compare the in-memory index against the durable store with a consistency tool and confirm zero differences.",
    dep: ["lease-store"]
  },
  "lease-expiry-timer": {
    s: "The background process that finds leases past their end time, moves them to expired and eventually frees the addresses.",
    d: "A timer wheel or sorted queue holds the next expiry per lease. When one fires, the lease becomes expired, an event is emitted, DNS records may be removed and the address is held for a grace period before reuse. Doing this for millions of leases must not stall the request path, so work is spread over time. The hard parts are accuracy under clock changes, persisting the timing across restart and bursts of expiry, such as after an event ends.",
    k: ["Eager expiry vs lazy check on allocation: eager keeps counts and DNS accurate; lazy saves work but leaves stale data until needed.", "Grace period before reuse vs immediate reuse: a grace period lets the client return to its address; immediate reuse maximizes capacity."],
    p: ["A mass expiry after an event triggers thousands of DNS removals at once and floods the zone server.", "A clock jump forward expires every lease at once and drops live clients."],
    v: "Create short leases, stop renewing them, and confirm each moves to expired at its end time, emits an event and releases its address after the grace period, with no effect on request latency.",
    dep: ["in-memory-lease-index", "clock-and-time-handling", "lease-state-machine"]
  },
  "journal-compaction": {
    s: "Periodically writing a snapshot of current leases and discarding the journal behind it, to bound disk use and restart time.",
    d: "The log holds many superseded records for the same address. Compaction writes a fresh image of live state, atomically replaces the old files, and begins a new journal. It runs in a background thread or process so grants continue, and records made during the write must be carried forward. Failure partway must leave a complete old copy. The hard parts are atomic replacement, handling the disk space doubling during a compaction and scheduling around busy periods.",
    k: ["Snapshot plus journal vs rewrite everything online: snapshots are simple and safe; online rewriting avoids pauses but needs complex coordination.", "Time-based vs size-based triggers: time-based is predictable; size-based bounds recovery time in busy networks."],
    p: ["Compaction runs out of disk space midway and leaves a truncated snapshot that is mistaken for complete.", "Compaction blocks the grant path for seconds on a large table and clients retransmit."],
    v: "Fill the journal with many renewals, trigger compaction during load, then restart and confirm the state equals what it was before, the journal is small and no grant latency spike exceeds the retry interval.",
    dep: ["write-ahead-journal", "lease-store"]
  },
  "external-database-backend": {
    s: "Storing leases, reservations or configuration in a shared relational database rather than local files, so several servers and tools see the same data.",
    d: "Servers write bindings through a driver to a database that other tools can query directly, and a pair of servers can use one store. This is convenient for reporting and for reservations managed elsewhere, but every grant now depends on network round trips and the database's availability. Writes are usually synchronous. The hard parts are latency on the grant path, failure behavior when the database is unreachable and schema upgrades coordinated with server upgrades.",
    k: ["Database as primary store vs local store replicated out: primary gives one source; local-with-export keeps the grant path independent of the database.", "Synchronous writes vs queued asynchronous writes: synchronous guarantees recovery; asynchronous hides latency but can lose recent grants."],
    p: ["A database failover takes thirty seconds, and during it the server cannot grant or renew.", "Two servers write the same address concurrently and the database accepts both unless a uniqueness constraint exists."],
    v: "Grant a lease, read it straight from the database tables, then block the database and confirm the documented behavior, such as renewals continuing from memory and new grants refused, with errors counted.",
    dep: ["lease-store", "sync-policy"]
  },
  "sync-policy": {
    s: "The decision of when lease writes are forced to stable storage: on every change, in small batches, or leaving it to the operating system.",
    d: "Forcing every write guarantees an acknowledged lease survives power loss but limits throughput to the device's write speed. Batching several changes per force raises throughput and delays replies slightly. Leaving it to the operating system is fastest and loses the last seconds on a crash. The right setting depends on storage (fast flash makes forced writes cheap) and on whether a failover partner holds a copy. The hard parts are that device caches may lie about durability.",
    k: ["Force on every grant vs group commit: forcing is simplest and safest; group commit shares the cost across many grants at small added latency.", "Rely on the partner's copy vs local durability: partner copy tolerates local loss but fails if both lose power; local durability covers a single-server site."],
    p: ["A storage controller reports writes complete while holding them in volatile cache.", "Forcing writes on slow disks limits the server to a few hundred grants per second."],
    v: "Measure grants per second under each setting on the production storage, then kill power in a test environment and confirm the number of lost acknowledged leases matches the chosen setting's promise.",
    dep: ["write-ahead-journal"]
  },
  "failover-protocol": {
    s: "The protocol by which a pair of servers exchange lease updates and agree on who may allocate which addresses, so that service continues if one fails.",
    d: "Two servers exchange binding updates over a TCP connection and acknowledge them. Each tracks the partner's state: normal, communications interrupted, partner down, recovery. In normal operation both serve clients or one is primary, and every binding change is sent to the partner before or soon after the client is answered. Servers must never give out an address the partner has granted without knowing. The hard parts are partitions where each side thinks the other is dead and the safe period that follows.",
    k: ["Synchronous update to partner before reply vs asynchronous: synchronous prevents duplicate grants; asynchronous is faster but needs conservative rules after loss.", "Pair of two vs larger active group: a pair is well understood; groups scale reads but multiply coordination cases."],
    p: ["A network partition makes both servers believe the partner is down, and both allocate from the same free pool.", "Version mismatches between partners after an upgrade break the update stream and leave them out of sync."],
    v: "Run a pair, grant leases on each, and compare lease tables to confirm they match; disconnect them, grant more, reconnect, and confirm both converge on the same state with no address leased twice.",
    dep: ["lease-state-sync", "partner-down-handling", "load-balance-split", "hot-standby"]
  },
  "load-balance-split": {
    s: "A pair mode in which both servers answer clients, each owning a share of the pool by a hash of the client identifier, so load is divided.",
    d: "A deterministic hash of the client identity decides which server should answer a given request, so the two do not race. Each server also holds a portion of the free addresses and can lend more to its partner. If one fails, the other takes over the whole hash space after the partner-down transition and answers everything. The hard parts are keeping free addresses balanced between servers, since one may run out of its share while the other has plenty, and handling clients that move between servers.",
    k: ["Static hash split vs dynamic leasing of pool shares: static is simple; dynamic keeps usage balanced but needs frequent coordination.", "Equal shares vs weighted by capacity: equal is fair for equal machines; weighted fits mixed hardware."],
    p: ["One server's share of a small pool is exhausted while the partner holds free addresses, and clients get no offers.", "Both servers respond to a client because of a hash disagreement after a configuration change."],
    v: "Run a load-balanced pair, send requests from many client identifiers, and confirm roughly half are answered by each; stop one server and confirm the other then answers all after the configured delay.",
    dep: ["failover-protocol", "address-pools", "client-identification"]
  },
  "hot-standby": {
    s: "A pair mode in which one server answers everything and the other receives updates and waits, with a small reserved pool to cover the changeover.",
    d: "The standby holds a copy of all bindings and a small fraction of free addresses it can hand out on its own. If the primary fails, it begins answering after the partner-down transition. In the meantime it may serve new clients from its reserved portion. Hot standby is simpler to operate than load balancing because only one server handles the path, but the standby capacity sits idle. The hard parts are keeping the standby warm and testing that it works.",
    k: ["Hot standby vs load balancing: standby is simpler to reason about and debug; load balancing uses both servers but couples them more tightly.", "Large vs small reserved share on the standby: large keeps new clients served during outage; small keeps the primary's pool nearly whole."],
    p: ["The standby has never answered a client, and a misconfiguration is found only on the day the primary fails.", "The reserved share is exhausted during a long primary outage and new clients get no addresses."],
    v: "Stop the primary in a test, wait the configured transition period, and confirm the standby answers new discovers and renewals, and that when the primary returns the pair resynchronizes without conflicts.",
    dep: ["failover-protocol", "lease-state-sync"]
  },
  "lease-state-sync": {
    s: "The stream of binding updates between partners, with acknowledgments and a way to reconcile everything after reconnection.",
    d: "Each change (grant, renewal, release, expiry) is sent as an update with a sequence or timestamp and is acknowledged. After a disconnection, the pair exchanges what each saw while apart, either by replaying a queue of unacknowledged updates or by comparing full tables. Updates must be idempotent and ordered per address. Config differences are not part of this stream. The hard parts are bulk sync of millions of leases while serving traffic and resolving conflicting changes made during a partition.",
    k: ["Incremental queue replay vs full table comparison: replay is quick for short outages; full comparison is robust after long ones or restores.", "Newest timestamp wins vs partner-defined authority: newest wins is simple but depends on clocks; authority rules are clock-independent but need explicit state."],
    p: ["Clock skew between partners makes the wrong side's record appear newer, and a released lease is revived.", "A bulk sync overloads the partner's disk and slows its live grants."],
    v: "Disconnect partners, make different lease changes on each, reconnect, and compare both tables: confirm identical contents with no address bound to two clients and a counter of reconciled records.",
    dep: ["failover-protocol", "lease-store", "clock-and-time-handling"]
  },
  "partner-down-handling": {
    s: "The rules for when a server may take over its failed partner's addresses, given that it cannot tell a dead partner from an unreachable one.",
    d: "When communications fail, a server enters an interrupted state where it keeps serving its own share and renews existing leases, but cannot hand out addresses the partner might also grant. Only after an operator declares the partner down, or an automatic timer, does it claim the whole pool, and even then it waits out a safe period of the maximum client lead time before reusing the partner's free addresses. The hard parts are choosing automatic versus manual declaration and the delay it causes for new clients.",
    k: ["Automatic partner-down vs operator decision: automatic restores service quickly but risks split brain on a partition; manual is safe but slow at night.", "Long safe period vs short: long is safe against duplicate grants; short returns new-client service sooner."],
    p: ["Automatic takeover during a link failure causes both servers to claim the same free pool.", "An operator declares the partner down while it is alive, and both then grant."],
    v: "Isolate one server of a test pair and confirm it continues renewals but refuses new grants from the partner's share until the declared transition plus safe period, as shown in the state log.",
    dep: ["failover-protocol", "maximum-client-lead-time"]
  },
  "maximum-client-lead-time": {
    s: "The longest a client may hold a lease beyond what the partner knows about, and so the delay needed before a surviving server can safely reuse addresses.",
    d: "To avoid a round trip to the partner for every renewal, a server may give a client a lease longer than the partner has been told, by up to the lead time. If the server fails, the partner must wait at least that long before reusing those addresses, since a client may legitimately still hold them. A shorter lead time lets takeover happen faster but means more updates must be acknowledged first. The hard parts are choosing the value against lease length and the risk of setting it too small.",
    k: ["Short lead time vs long: short means the partner learns of nearly every lease and recovers quickly; long cuts update traffic but delays takeover.", "Lead time bounded by lease time vs independent value: bounded keeps it coherent; independent lets takeover tuning stay separate."],
    p: ["Lead time larger than the pool's slack means that after a failure the partner cannot grant until the delay ends, and the pool seems empty.", "Changing it on one server only gives mismatched assumptions between partners."],
    v: "Fail one server in a test, then measure the time until the survivor first grants an address from the failed server's share, and confirm it is at least the configured lead time.",
    dep: ["failover-protocol", "lease-time-policy"]
  },
  "config-synchronization": {
    s: "Keeping scopes, options and classes identical on both failover partners, since a difference means clients get different answers from each.",
    d: "Failover synchronizes lease state, not configuration, so scope definitions, options and reservations must match by other means: generated from one source, copied by a tool, or pushed through the management API. A check compares effective configurations and reports differences. Some settings must differ, such as the partner address and role. The hard parts are changes that must happen on both at once and a drifted scope that only shows up when failover occurs.",
    k: ["Push from one source vs per-server edits: one source guarantees match; per-server edits permit local exceptions that silently diverge.", "Compare on a schedule vs on every change: scheduled checks are simple; on-change checks catch drift when it happens."],
    p: ["One partner has a new DNS server in its scope and the other has the old one, so clients get different answers depending on server.", "Reservations are added to one server only, and the standby hands the device a random address."],
    v: "Change an option on one server only, run the comparison, and confirm it reports the exact difference; apply the change through the sync path and confirm the report is clean and both servers send the same option.",
    dep: ["config-as-code", "configuration-loader", "failover-protocol"]
  },
  "icmp-probe": {
    s: "A server-side echo request sent to an address before it is offered, to detect a device already using it, with a short wait for any reply.",
    d: "Before offering an address, the server pings it and waits briefly. A reply means something holds the address, so it is marked abandoned and another is chosen. The check costs latency on every grant, so it is often applied only to addresses with no history or in risky pools. Probe timeout is a compromise: long enough to catch slow replies and short enough not to delay clients. The hard parts are devices that do not answer echo and the cost at scale.",
    k: ["Probe before every offer vs only suspicious addresses: always gives the most safety; selective keeps latency low where conflicts are rare.", "Synchronous wait vs parallel pre-probing of free addresses: synchronous is simple; pre-probing hides latency but may test an address that gets used later."],
    p: ["A host with a firewall dropping echo is never detected, and its address is offered to someone else.", "A one second probe wait on every grant limits a busy server to roughly one grant per second per worker."],
    v: "Configure a test host with a static address inside the pool, make the next client request that address, and confirm the probe detects it, the address is marked abandoned and the client receives a different one.",
    dep: ["raw-and-packet-sockets", "address-pools", "decline-quarantine"]
  },
  "client-address-probe": {
    s: "The client's own check, using ARP or neighbor discovery, that an address is unused before it starts using it, with decline sent if there is a conflict.",
    d: "After receiving an acknowledgment, a well-behaved client sends probes for its new address on the local segment and waits. If anyone answers, it sends a decline and starts again. This catches conflicts that a server probe cannot, since local-segment checks pass through firewalls that block echo. In IPv6 the equivalent is duplicate address detection. The hard parts are clients that skip the check, and that the server only learns through the decline.",
    k: ["Rely on client probing vs server probing: client probing is free for the server and sees the local segment; server probing protects against clients that skip checks.", "Probe before the lease is final vs after: before avoids a bad binding; after is faster but briefly commits a conflicting address."],
    p: ["A device with an embedded stack skips the check, and the duplicate goes unnoticed until two hosts lose connectivity.", "A switch that delays learning ports drops the probe and the conflict is missed."],
    v: "Place a host with the same address as an offered one on the segment, request a lease on a compliant client, and confirm that it sends a probe, receives an answer, declines, and obtains a different address.",
    dep: ["release-and-decline", "decline-quarantine"]
  },
  "decline-quarantine": {
    s: "Marking an address as abandoned after a conflict report and holding it out of the pool for a period, or until a recheck shows it free.",
    d: "On a decline or a failed probe, the server records the address as abandoned with the time and the reporting client. It is excluded from allocation until a timer expires or an operator clears it. Some servers retest abandoned addresses periodically and return those found free. Quarantined addresses count against pool capacity, and large numbers indicate a problem such as a static device in the range or a faulty client. The hard parts are avoiding permanent loss of pool space and finding the cause.",
    k: ["Time-limited quarantine vs manual clearing: time-limited self-heals; manual clearing prevents a conflicting address returning without human attention.", "Retest before return vs return on timer: retest is accurate but needs a working probe; timer is simple but may return a still-used address."],
    p: ["A faulty client declines each address in turn and the whole pool ends up quarantined.", "Quarantined addresses never expire, and a pool silently shrinks until exhaustion."],
    v: "Decline an address from a test client, confirm the server marks it abandoned and does not offer it, then wait out the period and confirm it returns, with an event logged at each step.",
    dep: ["release-and-decline", "address-pools", "pool-exhaustion-alerts"]
  },
  "rogue-server-detection": {
    s: "Finding unauthorized DHCP servers on a segment by watching for offers and acknowledgments from addresses that are not on the approved list.",
    d: "A monitor on a segment, or the server itself, listens for server responses. It sends its own discover and compares every offer's source with the approved list. An unexpected one raises an alert with its address, hardware address and the switch port if known. Some servers refuse to answer on a segment where another server is detected, or the network blocks the port. The hard parts are monitors on every segment, and that rogue servers are often accidental, such as a home router.",
    k: ["Active probing vs passive listening: active probing detects quiet rogues on demand; passive is non-intrusive but sees only what is sent.", "Alert only vs block automatically: alerting is safe; blocking stops damage at once but acts on possibly false positives."],
    p: ["The detector's own approved server list is stale, so a legitimate new server triggers an alarm and port shutdown.", "A rogue server on a segment without a monitor goes unseen for weeks."],
    v: "Connect a test device running a second server to a monitored segment and confirm an alert naming its address and port appears within a minute, and removing it clears the alert.",
    dep: ["packet-parser", "switch-snooping-integration"]
  },
  "switch-snooping-integration": {
    s: "Cooperation with access switches that watch DHCP traffic, drop server messages from untrusted ports and record bindings of address to port.",
    d: "The switch marks uplinks toward the real servers as trusted. Server-type messages arriving on any other port are dropped. It also builds a table binding each leased address and hardware address to a port and VLAN, then uses it to drop packets with spoofed source addresses and answer ARP safely. The DHCP service must be compatible: relay information inserted by the switch should be accepted and trusted. The hard parts are keeping the switch table in sync after restarts and handling devices that move between ports.",
    k: ["Switch-enforced trust vs server-side checks: switch enforcement stops bad packets at the edge; server checks work without special hardware but cannot stop rogue offers.", "Switch inserts relay data vs relay router inserts: switch data names the port; router data names only the segment."],
    p: ["The switch binding table is lost on reboot, and until clients renew, all traffic with leased addresses is dropped.", "A server-trusted port is mislabeled, and the rogue server's offers reach clients."],
    v: "Plug a test device that sends server messages into an untrusted port and confirm the switch's counters show drops and clients still lease from the real server; confirm the binding table lists a test client's address and port.",
    dep: ["relay-agent-information", "rogue-server-detection"]
  },
  "request-flood-protection": {
    s: "Limits on packet rates and pool consumption by source, relay, port or class, so one device cannot exhaust the pool or overload the server.",
    d: "Rate limiters apply per source hardware address, per relay circuit and globally. Excess requests are dropped before expensive work, such as probes and writes. Pool-level protections cap the number of offered but unconfirmed addresses, which blocks attacks that request thousands of addresses with random identifiers. Some deployments add a challenge step. The hard parts are separating attacks from legitimate bursts, and picking limits that fit mass reconnects.",
    k: ["Drop early vs queue: dropping saves resources and relies on client retry; queues add latency and memory use but absorb short bursts.", "Limit per identifier vs per location: identifiers are forgeable; location limits resist forging but can punish a hub with many devices."],
    p: ["A forged-identifier flood fills the pool with offers, and real clients get nothing.", "Limits tuned for steady state throttle the morning boot burst and delay everyone's access."],
    v: "Send a flood of discovers with random hardware addresses from one port and confirm the server drops them past the limit, logs the source circuit, and a real client on another port still obtains an address in normal time.",
    dep: ["packet-parser", "per-client-limits", "address-pools"]
  },
  "ddns-updater": {
    s: "The component that creates, updates and deletes forward and reverse DNS records as leases are granted and end, using the standard dynamic update protocol.",
    d: "On a grant, the updater sends an update to the zone's primary server adding an address record and a pointer record. On release or expiry it removes them. Updates run asynchronously from a queue so a slow DNS server does not delay leases, with retries. Each record is accompanied by a marker recording who owns it, so another client's name is not overwritten. The hard parts are failures that leave stale or missing records and keeping DNS consistent after a server restart.",
    k: ["Server performs updates vs client does its own: server updates keep control and cover clients that cannot update; client updates avoid server load but need client credentials.", "Queue with retry vs inline: queue protects the grant path; inline is simpler and gives immediate consistency but couples lease latency to DNS."],
    p: ["A DNS outage leaves a long queue, and records for expired leases linger and point at reused addresses.", "The server restarts and has no record of which entries it created, so stale ones are never removed."],
    v: "Grant a lease with a hostname, query DNS for the forward and reverse records and confirm both point correctly; release the lease and confirm both are removed within the configured delay.",
    dep: ["fqdn-negotiation", "reverse-zone-updates", "update-authentication", "lease-event-hooks"]
  },
  "fqdn-negotiation": {
    s: "The option exchange where a client offers a hostname and flags saying who should update DNS, and the server answers with the name it will use and who is responsible.",
    d: "The client sends its desired name and a flag for whether it will update the address record itself or wants the server to. The server may accept, override with its own generated name, or tell the client to skip updates. The reply carries the final name and flags. The domain part comes from scope configuration. The hard parts are clients that send unqualified or invalid names, and policy about who may own which name.",
    k: ["Accept client names vs always generate: accepting gives meaningful names; generating prevents name abuse and collisions.", "Server updates both records vs client updates its forward record: server updating gives uniform control; client updating spares the server but needs trust."],
    p: ["A client requests a name that belongs to a server, and the update would replace its records.", "Unqualified names are accepted, and a name resolves in the wrong domain."],
    v: "Request a lease with a hostname and update flags, and confirm the acknowledgment carries the final fully qualified name and the flag indicating the server will update DNS, matching the DNS records created.",
    dep: ["option-encoding", "name-conflict-resolution", "hostname-generation"]
  },
  "hostname-generation": {
    s: "Producing a safe DNS name for a lease when the client supplies none, or an unacceptable one, usually from the address or identifier.",
    d: "The generator builds a name such as a prefix plus the address with dots replaced, or a hash of the identifier, and appends the scope's domain. Characters are sanitized to legal DNS labels, and length limits are enforced. Generated names give every lease a record so address-to-name lookups work in logs. The hard parts are stable names across address changes, collisions among generated names and meaningful names for people reading logs.",
    k: ["Name from address vs from identifier: address-based names are simple and decode easily; identifier-based names stay the same when the address changes.", "Sanitize client names vs reject them: sanitizing keeps the device named; rejecting avoids odd names but gives them no entry."],
    p: ["Generated names embed the address, and a reused address makes an old name point to a new device.", "A client name with illegal characters is rejected by the DNS server, and the update fails every time."],
    v: "Lease an address to a client that sends no hostname and one with illegal characters, and confirm the first gets a generated name and the second a sanitized legal name, each resolving in DNS.",
    dep: ["fqdn-negotiation", "ddns-updater"]
  },
  "reverse-zone-updates": {
    s: "Maintaining pointer records that map addresses to names, in the reverse zone for each subnet, as leases change.",
    d: "Each subnet has a reverse zone derived from its prefix, and the updater must know which zone and which server holds it. Prefixes not aligned to the zone boundary need delegation conventions. IPv6 reverse zones use nibble-based names, so every /64 has its own zone, and a pool with huge address space means huge zone data. The hard parts are mapping scopes to zones correctly, handling delegated reverse zones owned by others and failing gracefully when the zone server does not accept updates.",
    k: ["Update reverse for every lease vs only for static hosts: every lease gives complete log lookups; static only reduces churn and load.", "Wildcard or generated reverse records vs per-address: generated records cost little and always resolve; per-address records name real hosts."],
    p: ["A subnet's reverse zone is not configured, and every update fails and retries forever.", "A /23 subnet crosses two reverse zones, and half of the updates go to the wrong place."],
    v: "Grant a lease and query the pointer record for the address; confirm it returns the lease's name, and that the zone's serial number advanced after the update.",
    dep: ["ddns-updater", "subnet-records"]
  },
  "update-authentication": {
    s: "Proving to the DNS server that an update comes from the DHCP service, usually with a shared secret signature on each message.",
    d: "Dynamic updates change authoritative data, so the DNS server must refuse unauthenticated ones. The common method signs each update with a shared key, and the DNS server maps keys to the zones and names they may change. Keys need rotation and protection on both sides. Some deployments use network ACLs instead, which is weaker. The hard parts are key distribution across many servers, rotation without failed updates, and limiting a key to the right zones.",
    k: ["Shared secret signatures vs address-based allow lists: signatures hold across networks and spoofing; allow lists are simple but trust the network path.", "One key per DHCP server vs per zone: one per server is easy to rotate; one per zone limits the damage if a key leaks."],
    p: ["A key shared across all servers and zones is stored in plain configuration and leaks with a backup.", "Key rotation is done on one side first, and all updates fail until the other side catches up."],
    v: "Send an unsigned update and one signed with the wrong key to the zone server and confirm both are refused; send a correctly signed update and confirm it applies, with each outcome logged.",
    dep: ["ddns-updater"]
  },
  "name-conflict-resolution": {
    s: "Deciding what happens when a name is already in DNS, held by another client, by a static record or by an earlier lease of the same device.",
    d: "Before adding a record, the updater checks whether the name exists and who owns it, by a companion record that stores the owner's identifier. If the owner is the same client, the record is updated. If another client owns it, the policy is to refuse, to replace, or to modify the name with a suffix. Static records created by people must not be overwritten. The hard parts are races, since two clients may ask for one name at once, and recovering after lost ownership records.",
    k: ["Refuse on conflict vs rename the newcomer: refusing protects the existing owner; renaming gives the newcomer a name but spreads odd suffixes.", "Ownership marker records vs trusting any record: markers prevent overwrites; trusting is simpler but lets any client replace names."],
    p: ["A laptop and a docked workstation both claim the same name, and records flip between their addresses.", "Ownership records are lost, and the updater refuses to touch records it created earlier."],
    v: "Lease the same hostname to two different test clients and confirm the second is refused or renamed per policy, while the first client's records stay intact.",
    dep: ["ddns-updater", "fqdn-negotiation", "hostname-generation"]
  },
  "raw-and-packet-sockets": {
    s: "Low-level sockets that receive and send frames directly, since a client with no address cannot be reached through the normal network stack.",
    d: "Standard datagram sockets bound to the server port work for relayed and renewing traffic, but broadcasts from a client with address zero and replies addressed to a hardware address need packet-level access. The server reads from a socket that filters on the protocol port, and writes complete frames with chosen link-layer and IP headers, including checksums. This requires elevated privileges. The hard parts are portability between operating systems and performance, since filtering in the kernel avoids copying every frame.",
    k: ["Raw frame sockets for directly attached clients vs datagram sockets only: raw handles clients with no address; datagram sockets are simple and portable but serve only relayed traffic.", "Kernel packet filter vs user-space filtering: kernel filtering is efficient on busy segments; user-space is easier to write."],
    p: ["Frames sent through raw sockets carry wrong checksums when offload hides them, and clients drop the replies.", "Without the proper privilege at startup the server cannot open the socket, and fails after dropping privileges."],
    v: "Capture traffic on a directly attached client's segment and confirm the server's reply frame has a valid IP and UDP checksum, correct hardware destination, and the client accepts it and configures the address.",
    dep: ["interface-binding", "privilege-separation"]
  },
  "interface-binding": {
    s: "Choosing which network interfaces the server listens on, and associating each with its subnet, so requests are matched to scopes correctly.",
    d: "The server enumerates interfaces and addresses, listens on those enabled by configuration, and records the receiving interface for each packet. Directly attached clients are matched to scopes by the interface's address. Interfaces can appear and disappear (virtual, tunnel, container), so the binding list must be refreshed. Listening on all interfaces risks answering networks that should not be served. The hard parts are dynamic interfaces and multiple addresses on one.",
    k: ["Explicit interface list vs listen everywhere: explicit lists prevent accidental service; listening everywhere is convenient but can serve an unintended network.", "Refresh bindings on interface events vs periodic rescan: events are prompt; rescan is simpler and tolerant of missed events."],
    p: ["A new virtual interface appears and the server begins offering addresses on it to an unrelated network.", "An interface comes up after the server starts and is never bound until restart."],
    v: "Start the server with one interface enabled, send requests on another, and confirm no reply; enable the second through configuration reload and confirm a reply arrives without a restart.",
    dep: ["raw-and-packet-sockets", "subnet-scope"]
  },
  "receive-path-and-workers": {
    s: "The threads or processes that read packets from sockets, queue them and run the policy and storage work, with bounds on queue length.",
    d: "A receiver reads frames, parses them minimally and places them on a bounded queue, and workers take requests and run policy, storage and reply. Workers need access to shared lease state, so locking or partitioning by client or scope matters. Under overload the queue fills and the server drops, which is the intended behavior since clients retransmit. The hard parts are keeping slow work such as DNS and probes off the main path, and fairness between busy and quiet scopes.",
    k: ["Single-threaded event loop vs worker pool: a single thread avoids locking and is deterministic; a pool uses many cores but needs careful shared state.", "Partition workers by client hash vs shared queue: partitioning keeps one client's requests ordered; a shared queue balances load better."],
    p: ["A slow probe in a worker blocks that worker, and the queue backs up behind it.", "Two requests from the same client are handled by different workers in the wrong order, leaving an inconsistent lease."],
    v: "Drive load at several times the measured capacity and confirm the queue stays at its bound, excess is counted as dropped, latency for accepted requests stays flat and the server recovers fully when load stops.",
    dep: ["packet-parser", "in-memory-lease-index", "interface-binding"]
  },
  "clock-and-time-handling": {
    s: "How the server reads time, protects lease arithmetic from clock jumps, and keeps timestamps consistent across failover partners.",
    d: "Lease end times are absolute values compared with the current time, so a clock set forward expires everything and a clock set back extends leases. The server uses a monotonic clock for timers and wall clock for stored timestamps, and detects jumps. Partners must have reasonably synchronized clocks, and failover typically refuses to run if skew exceeds a limit. The hard parts are virtual machines whose clocks jump after pause and restore, and leap seconds.",
    k: ["Wall clock for stored times vs monotonic offsets: wall clock times survive restarts; monotonic times resist jumps but cannot be stored across boots.", "Reject large jumps vs follow them: rejecting protects state but can leave the server running with a wrong clock; following keeps in step but can mass-expire leases."],
    p: ["A virtual machine resumed after a pause jumps a day ahead and every lease expires at once.", "Failover partners differ in clock by minutes, and records from the slower one look older than they are."],
    v: "Step the clock of a test server forward and backward by an hour and confirm lease end times and timers behave per the documented rule, with a logged warning and no mass expiry of live leases.",
    dep: []
  },
  "privilege-separation": {
    s: "Splitting the service so that only a small part holds the privileges to open sockets and write configuration, and the part that parses packets runs unprivileged.",
    d: "The packet-facing code handles hostile input, so it should run as a limited user, in a restricted file system view with a minimal set of system calls permitted. A small privileged helper opens raw sockets and binds ports at startup and passes descriptors to the unprivileged process. Configuration and lease files are owned by the service account. The hard parts are reload and compaction work that need file access after privileges are dropped, and platform differences in sandboxing facilities.",
    k: ["Multi-process separation vs one process dropping privileges: multi-process isolates failures and limits damage; one process is simpler but keeps more code reachable.", "Strict system call filtering vs plain unprivileged user: strict filtering contains exploits but breaks on unexpected calls; a plain user is robust and weaker."],
    p: ["Privileges are dropped before the interface list is refreshed, and a new interface cannot be bound.", "A system call filter blocks a call used by a rarely run code path, and the process is killed during compaction."],
    v: "Inspect the running process: confirm it runs as the service user, holds no extra capabilities, and fails an attempt to open an arbitrary privileged file, while the service continues to answer clients and reload configuration.",
    dep: []
  },
  "configuration-loader": {
    s: "Reading, validating and atomically applying the configuration, with support for reload without restart and without dropping leases.",
    d: "The loader parses the file, checks it for syntax and semantic errors (overlapping scopes, pools outside subnets, unknown options, reservations in the wrong subnet), builds new in-memory structures and swaps them in. Existing leases are reconciled against the new scopes: those that no longer fit are left to expire or removed. A failed reload must leave the old configuration running. The hard parts are meaningful error messages and reconciling live leases with changed scopes.",
    k: ["Validate fully before applying vs apply as parsed: full validation avoids partial states; apply as parsed is simple but can leave a half-changed server.", "Hot reload vs restart for changes: hot reload avoids downtime; restart is simpler and clears stale state but interrupts service."],
    p: ["A reload with a typo is applied partly, and one scope is missing until noticed.", "A scope's pool is narrowed and existing leases outside it are silently dropped instead of expiring."],
    v: "Introduce a deliberate error in a copy of the configuration, reload, and confirm the server rejects it with a message naming the line and keeps serving the old configuration; then reload a valid change and confirm clients receive the new values.",
    dep: []
  },
});
