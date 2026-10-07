// Details for the DHCP & IPAM plate, part 1: cross-cutting concerns, automation, audit, inventory.
ATLAS.details("dhcp-ipam", {
  "source-of-truth": {
    s: "The decision about which system owns the meaning of an address: the inventory, the DHCP server's configuration, or what is actually seen on the wire.",
    d: "Every address has a planned state (this block is for the lab), a configured state (the server has a pool for it) and an observed state (a host answers on it). These drift apart constantly. One design makes the inventory authoritative and generates server configuration from it. Another lets servers report leases back and treats the inventory as a record. Either way, one direction of flow must win, with a defined way to detect and resolve disagreement.",
    k: ["Inventory pushes to servers vs servers report to inventory: push gives one place to edit and review; report is easier to adopt but lets the plan rot.", "Strict single owner per field vs shared editing: ownership prevents overwrite fights; shared editing is friendlier but produces silent conflicts."],
    p: ["Both an operator and a sync job edit the same scope, and the job overwrites the operator's change at the next run.", "The inventory says an address is free while a server has leased it, and a new static assignment collides."],
    v: "Change a subnet's gateway in the authoritative system, then confirm the server's served option, the inventory record and a client's received lease all show the new value, and that a manual edit elsewhere is flagged as drift.",
    dep: ["discovery-and-reconciliation", "config-as-code", "address-records"]
  },
  "lease-duration-tradeoffs": {
    s: "The choice of how long a lease lasts, which balances address reuse, renewal traffic, failover exposure and how fresh DNS and inventory data stay.",
    d: "Short leases return addresses quickly and keep DNS and history close to reality, but multiply renewal traffic and make a server outage visible sooner, because clients start losing addresses within half a lease. Long leases make a network stable through outages but strand addresses held by departed devices. Lease length is therefore set per scope: minutes for guest wireless, days for wired desktops, and effectively static for servers.",
    k: ["Short vs long leases: short frees addresses and tracks churn; long rides out server downtime and cuts renewal load.", "One global lease time vs per-scope or per-class values: one value is simple to reason about; per-scope values match each population but need documentation."],
    p: ["A guest network with a day-long lease and a small pool runs out of addresses during an event.", "Very short leases on a large network turn a brief server restart into a synchronized renewal storm."],
    v: "Fill a guest pool with short-lived test clients, let them leave, and confirm addresses return to the pool within one lease time plus the reclamation interval, while renewal request rate stays under the measured server capacity.",
    dep: ["lease-time-policy", "lease-expiry-timer", "renew-and-rebind"]
  },
  "restart-and-failure-safety": {
    s: "The set of rules that keep the service from handing out an address twice after a crash, a power loss, a restore from backup or a failover.",
    d: "A server that forgets a lease it already granted will give the same address to a second client. Safety means every grant is durably recorded before the acknowledgment leaves, the clock cannot silently go backward, and after a failure the server either has a complete lease record or waits out the maximum lease before reusing addresses. Backups of lease state are especially dangerous, since restoring one resurrects an old view of the world.",
    k: ["Durable write before reply vs reply then write: the first costs latency on every grant; the second is faster but loses recent leases on a crash.", "Waiting out leases after losing state vs trusting a stale copy: waiting causes a quiet period; trusting risks duplicate addresses."],
    p: ["A virtual machine is restored from a snapshot a week old and starts reissuing addresses that are in use.", "Power loss with unsynced journal writes loses the last seconds of acknowledgments, which surface as duplicate-address reports."],
    v: "Grant leases to ten test clients, kill the server process abruptly, restart it, and confirm each client's address is still bound to it and a new client is not offered any of them.",
    dep: ["write-ahead-journal", "sync-policy", "partner-down-handling", "clock-and-time-handling"]
  },
  "trust-on-shared-media": {
    s: "The recognition that DHCP runs on unauthenticated broadcast, so any host on the segment can answer or lie, and the controls placed at the edges to compensate.",
    d: "Clients accept the first offer they like, with no way to verify the server, and servers believe whatever identifier the client sends. A malicious or misconfigured device can run a rogue server, exhaust a pool with forged requests, or spoof a client identity to claim a reservation. The protocol cannot fix this, so the network does: switch ports are marked trusted or untrusted, relay information is added by infrastructure the client cannot forge, and servers limit what any one client can take.",
    k: ["Protocol-level authentication vs network-edge enforcement: authentication needs keys on every client and has seen little deployment; edge enforcement works with unmodified clients but depends on correct switch configuration.", "Strict reservation matching vs convenience: matching on hardware address is easy but spoofable; matching on relay-stamped port data is stronger but ties devices to ports."],
    p: ["A home router plugged in backwards answers requests on the office network and hands out the wrong gateway.", "A reservation keyed only to a hardware address is claimed by any host that copies the address."],
    v: "Attach a test host running a second server to an untrusted access port and confirm the switch drops its offers while clients keep getting leases from the real server, with a log entry for the drop.",
    dep: ["switch-snooping-integration", "rogue-server-detection", "relay-agent-information", "request-flood-protection"]
  },
  "scale-and-renewal-storms": {
    s: "The fact that load is not smooth: clients start together after outages, renew at predictable times and arrive in bursts, so capacity must be sized for synchronized peaks.",
    d: "Average request rate is a poor guide. After a building power loss every device boots at once and sends discover messages in the same second. Renewals cluster at half the lease time, so a restart can create a wave that repeats. Each grant costs a durable write, possibly a conflict probe and a DNS update, so the slowest stage sets the ceiling. Capacity work is about the burst, the queue in front of it and what clients do when answers are slow.",
    k: ["Large queues vs fast rejection under overload: queues smooth short bursts but add latency until clients retry; dropping early lets client back-off spread the load.", "Per-request durable writes vs batched writes: batching raises throughput but widens the window of lost acknowledgments."],
    p: ["A conflict probe that waits a full second per address caps throughput at a trickle during a morning boot wave.", "Dynamic DNS updates run inline with the reply and a slow zone server stalls every lease."],
    v: "Replay a recorded morning boot wave, or generate thousands of simultaneous discover messages, against a staging server and confirm the 99th percentile time to acknowledgment stays within the client's first retransmission interval.",
    dep: ["receive-path-and-workers", "write-ahead-journal", "request-flood-protection", "renew-and-rebind"]
  },
  "ipv4-ipv6-coexistence": {
    s: "The need to run two different address assignment systems side by side, with different identities, lifecycles and failure behaviors, under one inventory and one set of operators.",
    d: "IPv4 DHCP identifies clients by hardware address and hands out one address. IPv6 may self-assign addresses, use a separate protocol with its own identifiers, and delegate prefixes. A single host appears under multiple identities. Inventory, DNS names, audit history and reservations need a way to relate them, and operators need the same checks on both. Dual-stack also means two sets of leases to size, back up and fail over.",
    k: ["Unified host record vs separate v4 and v6 records: unified makes reporting and DNS easy; separate is simpler to build and avoids guessing which identifiers belong together.", "Stateful DHCPv6 vs SLAAC for hosts: stateful gives tracking and fixed addresses; SLAAC needs no server but gives limited audit trail, especially with privacy addresses."],
    p: ["A host's IPv6 privacy addresses rotate, and the audit trail cannot say who held an address last week because only SLAAC was used.", "A reservation made for IPv4 is assumed to cover IPv6, and the host receives a random address instead."],
    v: "Boot a dual-stack test host and confirm a single lookup in the inventory shows its IPv4 lease, its IPv6 address or prefix, and its DNS names, each with the identifier that tied them together.",
    dep: ["duid-and-iaid", "slaac-and-router-advertisement", "ipv6-addressing-plan", "address-records"]
  },
  "management-api": {
    s: "A programmatic interface to read and change scopes, reservations, leases and inventory records, so automation and the user interface share one path and one set of checks.",
    d: "The API exposes resources such as subnets, pools, reservations and leases, with create, update, delete and query operations. Mutations validate against policy (no overlapping pools, no reservation outside its subnet) and are applied atomically to configuration, then reloaded by the service without dropping leases. Reads need pagination and filtering, since a lease table can hold millions of rows. The hard parts are transactional multi-resource changes and keeping the running server in step with what the API reports.",
    k: ["Resource-oriented API vs command-style API: resources map to inventory and are cacheable; commands map to server actions such as reload but bury state.", "Immediate apply vs staged commit: immediate is easy for scripts; staging lets a change be reviewed and rolled back as one unit."],
    p: ["A bulk update fails halfway and leaves some subnets changed and others not, with no way to tell which.", "The API accepts a pool that the running server later rejects at reload, so a valid-looking call breaks service."],
    v: "Create a subnet, pool and reservation through the API, then confirm a real client on that subnet receives the reserved address, and that submitting an overlapping pool is rejected with an error naming the conflict.",
    dep: ["roles-and-access-control", "configuration-loader", "subnet-scope", "inventory-store"]
  },
  "config-as-code": {
    s: "Keeping the desired scopes, reservations and options in version-controlled declarative files, with a tool that compares them to the running service and applies the difference.",
    d: "The files describe the intended state. A sync tool computes a plan: create these scopes, change these options, remove these reservations. It then calls the management interface or reloads the configuration. Because the files live in source control, every change has an author, a review and a revert. Generated sections can come from the inventory so humans edit only exceptions. The difficulty is distinguishing intended removal from absence, and handling state the file cannot hold, such as live leases.",
    k: ["Full-state apply vs incremental patches: full-state corrects drift automatically but can delete things made by hand; patches are safer but let drift accumulate.", "Generated files vs hand-written files: generated files stay consistent with the inventory; hand-written files carry exceptions but go stale."],
    p: ["A merge error drops a scope from the file, and the next apply removes a whole subnet's pool.", "Two pipelines apply to the same server and overwrite each other with different versions."],
    v: "Run the plan step against a staging server with one scope removed from the file and confirm it reports exactly that deletion and no others, then confirm apply changes nothing for a clean file.",
    dep: ["management-api", "configuration-loader", "config-synchronization"]
  },
  "bulk-import-export": {
    s: "Loading and extracting large sets of subnets, reservations and addresses in tabular or structured formats, for migration, audit and spreadsheet-driven workflows.",
    d: "Import parses files, validates every row against the address plan, and applies them as one transaction or reports each failure with its line. Export writes the same shapes back out so a round trip is lossless. Migration from another system is the main use: old configuration is translated into scopes and reservations, and inventory data is mapped to the new fields. The hard part is validation with clear errors, since a thousand-row file with one overlapping subnet should say which row and why.",
    k: ["All-or-nothing import vs partial import: all-or-nothing keeps state clean; partial finishes more work but leaves an inconsistent half.", "Strict schema vs lenient parsing: strict catches typos early; lenient accepts messy spreadsheets but can store wrong values quietly."],
    p: ["A spreadsheet tool turns a dotted address into a date, and the import silently stores nonsense.", "An export that omits custom attributes makes a later re-import erase them."],
    v: "Export the full dataset, import it into an empty instance, then diff the two exports and confirm they are identical, including attributes and reservation identifiers.",
    dep: ["management-api", "address-records", "custom-attributes"]
  },
  "lease-event-hooks": {
    s: "Callbacks fired when a lease is granted, renewed, released or expired, letting other systems react, such as updating a firewall, an asset database or an alert.",
    d: "The server emits an event with the client identity, address, lease times and subnet. Delivery goes to a script, a message bus or a web endpoint. Hooks must not slow the lease path, so they run asynchronously with a bounded queue and a retry policy. Consumers see events at least once and must tolerate duplicates and reordering. A hook that blocks, crashes or floods is a recurring cause of outages, so it needs timeouts and isolation from the packet path.",
    k: ["Synchronous hook vs asynchronous queue: synchronous lets a hook veto a lease; asynchronous protects latency but cannot affect the decision.", "Event stream vs polling the lease table: events are timely and cheap per change; polling is simpler but misses short leases and costs more at scale."],
    p: ["A slow external endpoint backs up the queue until memory runs out or events are dropped silently.", "Consumers assume ordered delivery and record a release before the grant that preceded it."],
    v: "Point a hook at a test receiver, grant and release a lease, and confirm both events arrive with the correct address and identity. Stop the receiver and confirm lease replies stay as fast as before.",
    dep: ["lease-store", "lease-expiry-timer", "roles-and-access-control"]
  },
  "cli-and-client-libraries": {
    s: "A command-line tool and language bindings over the management API, used by operators for quick queries and by scripts for repeatable changes.",
    d: "The command-line tool wraps the common calls: find the lease for an address or hardware identifier, list a pool's usage, add a reservation, show recent changes. Libraries give programs typed access with authentication, retries and pagination handled. Output has a machine-readable mode so scripts do not parse tables meant for people. The hard part is stability: scripts live for years, so output formats and flags need versioning and deprecation, not casual change.",
    k: ["Thin wrapper over the API vs tool with local logic: a thin wrapper stays in step with the server; local logic can bundle multi-step workflows but drifts.", "Human-readable output by default vs machine-readable default: readable helps operators; machine-readable avoids scripts breaking when columns change."],
    p: ["A script parses the table output, and a new column shifts every field.", "A retry in the library repeats a create call that actually succeeded, producing a duplicate reservation."],
    v: "Run a lookup by address and by hardware identifier from the command line, and confirm both return the same lease that a direct API query returns, in a stable JSON form.",
    dep: ["management-api", "roles-and-access-control"]
  },
  "roles-and-access-control": {
    s: "Authentication and permissions that decide who may view or change which subnets, reservations and settings, down to the level of a single scope or address block.",
    d: "Users and service accounts authenticate against a directory or tokens, and map to roles such as read-only, site administrator or global administrator. Permissions apply to a subtree of the address hierarchy, so a branch team can manage its own blocks without touching the core. Every check happens at the API, not the screen. The difficulty is granularity: coarse roles are too powerful and fine ones become unmanageable, and automation accounts tend to be given far more rights than they need.",
    k: ["Role-based vs per-object permissions: roles are easy to audit and reason about; per-object rules fit odd cases but accumulate and are hard to review.", "Scope by address subtree vs by tag or site: subtree follows the hierarchy exactly; tags match the organization but need discipline to keep correct."],
    p: ["A shared automation token has global write access and is pasted into scripts across teams.", "Permissions checked only in the user interface let direct API calls bypass them."],
    v: "Sign in as a user limited to one site's block and confirm they can edit a reservation inside it but get a denied response, recorded in the audit log, when trying to change a neighboring block.",
    dep: ["change-audit-log", "address-space-hierarchy"]
  },
  "change-audit-log": {
    s: "An append-only record of every configuration and inventory change: who made it, when, from where, what it was before and after, and which request or ticket caused it.",
    d: "Each mutation writes an entry with the actor, the object, the old and new values and a timestamp, in the same transaction as the change so none can be missed. Entries are never edited. They feed incident review (what changed before the outage), compliance checks and rollback. Volume is modest compared to leases, but retention is long. The hard parts are capturing changes made through every path, including direct file edits, and keeping the log tamper-resistant.",
    k: ["Log in the same transaction vs log asynchronously: same transaction guarantees completeness; asynchronous is cheaper but can lose entries on a crash.", "Full before-and-after values vs change summary: full values allow exact rollback and diffing; summaries are smaller but lose detail."],
    p: ["Administrators edit the configuration file directly on the server, and the log shows nothing.", "A bulk import records one entry for thousands of changes, so nobody can see which rows were altered."],
    v: "Change a pool's range through the interface, then query the audit log and confirm one entry names the user, the old range, the new range and the source address, with a timestamp matching the change.",
    dep: ["inventory-store", "roles-and-access-control"]
  },
  "lease-history": {
    s: "A durable record of which client held which address over which time interval, kept long after the lease itself has expired and been reclaimed.",
    d: "The live lease table only holds current state. History appends a row for each binding when it ends, or on every grant and change, with address, client identifiers, start, end and the relay or port data seen. It answers questions raised weeks later by security teams: which device had this address at this time. The hard parts are volume (millions of rows a day on large networks), retention policy and timestamp accuracy, since an answer wrong by a minute names the wrong device.",
    k: ["Event log vs interval table: an event log is cheap to write but costly to query; intervals answer who-held-this-at-time-T directly but need updates on every end.", "Long retention vs short retention: long satisfies investigations and regulation; short limits storage and the privacy exposure of tracking devices."],
    p: ["A lease reclaimed by the expiry timer is never closed in the history, so the old client appears to hold the address forever.", "Clock steps make intervals overlap, and two devices appear to hold the same address."],
    v: "Lease an address to one test client, release it, lease it to a second, then query history for a time inside each period and confirm each query names only the right client.",
    dep: ["lease-store", "lease-event-hooks", "clock-and-time-handling"]
  },
  "metrics-and-utilization": {
    s: "Counters and gauges for message rates, pool usage, response times, failover state and errors, exported to monitoring systems.",
    d: "The server counts each message type received and sent, NAKs, declines, dropped packets and DNS update failures, and reports pool usage per scope as used, free and reserved addresses. Latency histograms for the grant path show storage slowness. Metrics are exposed through a pull endpoint or standard management protocols. The hard part is choosing labels: per-subnet series are useful, but per-client series explode in number and overload the monitoring system.",
    k: ["Per-subnet series vs aggregated totals: per-subnet pinpoints a full pool; totals are cheap but hide a single exhausted scope.", "Server-side counters vs derived from lease table scans: counters are cheap and fast; scans give exact state but load the store."],
    p: ["Counters reset on restart without a marker, and rate graphs show false negative dips.", "A label containing the client address creates millions of series and breaks the monitoring system."],
    v: "Generate a known number of discover messages from a test client and confirm the received, offered and acknowledged counters each rise by exactly that number, and pool usage matches the lease table.",
    dep: ["lease-store", "receive-path-and-workers"]
  },
  "pool-exhaustion-alerts": {
    s: "Alerts that fire when free addresses in a pool fall below a threshold, or when requests are being refused for lack of space, before users notice.",
    d: "An alert rule compares used to total addresses in each pool and triggers at, for example, 80 and 95 percent, with different severities. Better rules account for growth rate and lease time, since a pool filling quickly with long leases will fail sooner than its percentage suggests. Alerts must exclude reserved or excluded addresses from the denominator. The hard parts are noise from pools that are always full by design and silence when a pool is exhausted so completely that it stops generating metrics.",
    k: ["Static percentage thresholds vs trend-based prediction: static is simple and predictable; trend-based warns earlier on fast growth but is harder to tune.", "Alert per pool vs per shared network: per pool is precise; per shared network matches how clients actually draw from the space."],
    p: ["A guest pool at 100 percent every afternoon pages operators daily until they ignore all pool alerts.", "The denominator includes excluded ranges, so the alert reads healthy while real capacity is gone."],
    v: "Fill a test pool past the warning threshold with test clients and confirm the alert fires with the pool name and free count, then free addresses and confirm it clears.",
    dep: ["metrics-and-utilization", "address-pools", "exclusion-ranges"]
  },
  "packet-trace-and-debug": {
    s: "Tools that show the messages the server received and sent, the decisions made for each, and why a client got a particular answer or none at all.",
    d: "A debug mode logs each packet's decoded fields, the subnet and class it matched, the pool considered, any reason for rejection and the options attached. Captures on the wire show what the client really sent. Per-client tracing filters by identifier so one device can be followed without drowning in output. The hard parts are volume, privacy of logged identifiers, and the common situation where the server never saw the packet, which only a capture on the segment reveals.",
    k: ["Always-on decision logging vs on-demand tracing: always-on explains past incidents but is heavy; on-demand is cheap but misses the failure that already happened.", "Server-side logs vs wire capture: server logs show reasoning; capture shows what really arrived, including malformed packets the server discarded."],
    p: ["Debug logging left enabled on a busy server fills the disk and slows the grant path.", "Operators debug server policy for hours when the request was dropped by a switch before reaching it."],
    v: "Enable tracing for one test client, make it request a lease, and confirm the log shows the received discover, the chosen subnet and pool, the offer sent, and the reason if the request is refused.",
    dep: ["packet-parser", "subnet-selection", "client-classification"]
  },
  "compliance-reports": {
    s: "Scheduled and on-demand reports on address usage, undocumented devices, stale records and policy conformance, for auditors and capacity planning.",
    d: "Reports join inventory, lease history and discovery results. Typical outputs: utilization by site, subnets with no recent leases, addresses in use but missing owner data, reservations with no matching device, and changes made outside approval. They run on schedules and keep prior copies, so trends are visible. The hard parts are data quality, since a report is only as accurate as the owner and purpose fields behind it, and query cost on large history tables.",
    k: ["Precomputed snapshots vs live queries: snapshots are fast and reproducible for auditors; live queries are current but expensive and not repeatable.", "Fixed report catalog vs custom query builder: a catalog is easy to trust; a builder fits unusual questions but yields reports nobody reviews."],
    p: ["A report treats addresses with missing owner fields as compliant because the check only looks at populated rows.", "Quarterly reports are generated from live data, so rerunning one for the auditor gives different numbers."],
    v: "Seed the inventory with one unowned address and one stale subnet, run the report, and confirm both appear under the correct headings, and rerunning a saved snapshot returns identical numbers.",
    dep: ["lease-history", "address-records", "discovery-and-reconciliation"]
  },
  "address-space-hierarchy": {
    s: "The tree of address blocks from large allocations down to subnets, with parent and child containment, so any address has a defined place and owner.",
    d: "At the top sit blocks allocated to the organization, then divided by region, site, function and finally into subnets. Each node knows its parent, its children and what remains free. The tree enforces containment (a child lies inside its parent) and prevents overlap among siblings. It underpins permissions, reporting and allocation. The difficulty is that real networks are messy: legacy subnets do not align to bit boundaries of any tidy scheme, and some blocks belong to more than one purpose.",
    k: ["Strict tree vs allowing overlapping views: a strict tree guarantees no overlap; views allow multiple organizations of the same space at the cost of ambiguity.", "Deep hierarchy vs flat list with tags: deep trees mirror delegation and aggregate well; flat lists are easier to import but lose containment checks."],
    p: ["A legacy subnet that straddles two planned blocks cannot be placed and gets recorded with wrong bounds.", "Moving a block between parents without moving its children leaves orphaned subnets with a dangling path."],
    v: "Attempt to create a subnet that overlaps a sibling and one outside its parent block, and confirm both are rejected, then create a valid one and confirm parent free-space counts decrease by exactly its size.",
    dep: ["subnet-records", "inventory-store"]
  },
  "subnet-records": {
    s: "The record for each subnet or block: its prefix, purpose, gateway, VLAN, site, status and the DHCP scope or servers responsible for it.",
    d: "A subnet record holds the network address and prefix length, a status (planned, active, deprecated, reserved), the gateway and the owner, plus its link to a VLAN or routing instance and to the scope that serves it. Status transitions are checked, so a deprecated subnet cannot receive new reservations. The record drives scope generation and reporting. The hard parts are keeping the record consistent with the router's real configuration and with its scope, and representing subnets that exist in more than one place.",
    k: ["Subnet as a first-class object vs derived from addresses: first-class records hold intent before any device exists; derived views reflect reality but cannot plan.", "Linking scope by reference vs copying values: references stay in sync; copies are independent but diverge."],
    p: ["The recorded gateway is wrong or stale and generated scope options send clients to a dead router.", "A subnet marked deprecated keeps a live scope, and nobody notices the clients still leasing from it."],
    v: "Create a subnet record with a gateway and attach it to a scope, then confirm a client on that subnet receives that gateway, and marking the record deprecated blocks adding new reservations.",
    dep: ["address-space-hierarchy", "inventory-store", "subnet-scope"]
  },
  "address-records": {
    s: "The record for each individual address: state, assigned device, owner, hostname, how it was assigned and when it was last seen.",
    d: "Each address in an active subnet can have a record with status (free, leased, static, reserved, quarantined), the device identifier, the DNS name, the owner and purpose, and timestamps for last seen. Dynamic addresses are usually not stored one by one in the inventory; the lease table holds them and the inventory aggregates. Static addresses must be recorded, because nothing else knows them. The difficulty is volume for large subnets and keeping the dynamic view from the DHCP servers fresh enough to be useful.",
    k: ["Records for every address vs only for assigned ones: every-address records make free-space queries trivial; assigned-only is small and scales to large IPv6 subnets where full enumeration is impossible.", "Store dynamic leases in the inventory vs link to the server: storing gives one query point; linking avoids copying fast-changing data."],
    p: ["IPv6 subnets are modeled address by address and the table cannot hold a single /64.", "A static address is in use on a switch but absent from the records, and it is allocated again."],
    v: "Assign a static address through the inventory, then check that the next-free search skips it and a ping-based discovery run confirms the matching device, with the record's last-seen time updated.",
    dep: ["subnet-records", "inventory-store", "custom-attributes"]
  },
  "vrf-and-overlap": {
    s: "Support for separate routing domains that reuse the same private address ranges without conflict, such as tenant networks and merged organizations.",
    d: "Each routing instance (VRF) is its own address namespace. The inventory scopes every block to a namespace, so identical prefixes can coexist if they live in different ones. DHCP servers need the same distinction: a relayed request is mapped to a namespace through the relay's interface or an added identifier, then to a scope within it. The hard parts are carrying namespace through every query, preventing accidental cross-namespace operations, and presenting overlapping data without confusing operators.",
    k: ["Namespace on every record vs one global space: a namespace per record models real networks; a global space is simpler but forbids overlap entirely.", "Detect overlap automatically vs require explicit declaration: automatic detection catches mistakes; explicit declaration avoids false warnings between known-separate tenants."],
    p: ["A query omits the namespace and returns another tenant's record for the same address.", "Two tenants' relays share an interface address, and the server cannot tell which tenant's scope to use."],
    v: "Create the same /24 in two namespaces with different gateways, send relayed requests from each, and confirm each client gets an address and gateway from its own scope.",
    dep: ["address-space-hierarchy", "subnet-selection", "relay-agent-information"]
  },
  "custom-attributes": {
    s: "User-defined fields and tags attached to blocks, subnets and addresses, such as owner, cost center, security zone, ticket number or lifecycle date.",
    d: "Attributes extend the schema without code changes. Each has a type, an allowed set of values, whether it is required and which objects it applies to. Child records can inherit values from parents, so a site tag need only be set once. Attributes drive search, permissions, reports and automation (every address in the finance zone). The hard parts are governance, since free-text fields rot into inconsistent spellings, and migration when a field's meaning or allowed values change.",
    k: ["Typed fields with controlled values vs free-form tags: controlled fields keep reports clean; free tags are quick but fragment.", "Inheritance vs explicit values on every object: inheritance avoids repetition; explicit values make each record self-contained but easy to forget."],
    p: ["Owner is typed as three spellings of the same team, and reports split its addresses into three groups.", "A child overrides an inherited value and later changes at the parent do not reach it, with no visible sign."],
    v: "Define a required zone attribute, try to save a subnet without it and confirm rejection, then set it on a parent and confirm children show the inherited value in search results.",
    dep: ["inventory-store", "subnet-records"]
  },
  "discovery-and-reconciliation": {
    s: "Finding what is really using addresses, by scanning, reading lease tables and switch and router data, then comparing it with the inventory and flagging differences.",
    d: "Sources include lease reports from DHCP servers, neighbor tables from routers (ARP and NDP entries), switch address tables and active probes. Each produces observations: this address, this hardware identifier, at this time. Reconciliation matches observations to records and creates findings: unknown device on a static range, record with no activity for ninety days, address in use but marked free. Operators accept or reject each. The hard parts are accuracy, since devices are silent or firewalled, and not treating absence in a scan as proof of non-use.",
    k: ["Passive collection from infrastructure vs active scanning: passive is safe and continuous but sees only traffic; active finds quiet devices but can disturb fragile hosts and trigger security alerts.", "Auto-update inventory vs findings for review: auto-update keeps data fresh; review prevents scan noise from overwriting deliberate records."],
    p: ["A host that blocks probes appears free and its address is assigned to a second device.", "Scanning every address in a large IPv6 subnet is infeasible, so discovery quietly covers only IPv4."],
    v: "Bring up a test device on an unrecorded static address and confirm the next reconciliation run reports it as an unknown device with the hardware identifier and the switch port that saw it.",
    dep: ["address-records", "lease-query", "inventory-store"]
  },
  "inventory-store": {
    s: "The database behind the address inventory: records, hierarchy, attributes and history, with the transactional guarantees that keep the plan consistent.",
    d: "A relational store typically holds networks, addresses, namespaces, attributes and links to servers. Prefix containment and overlap checks need either specialized index types or application logic, and the next-free query must be fast on large blocks. Writes from allocation, sync jobs and people must serialize safely. The store has its own backup, migration and upgrade lifecycle, separate from DHCP lease state, which is what keeps the plan available when the servers are not.",
    k: ["Native network address types and indexes vs integers or text: native types make containment and overlap queries fast and correct; integers are portable but need hand-written range logic.", "One store for plan and leases vs separate stores: one is simple to query; separate stores keep the lease path independent of the planning system."],
    p: ["Two concurrent allocation requests both pick the same next-free block because the check and write are not atomic.", "The inventory is on the critical path for lease grants, so its outage stops address assignment."],
    v: "Run two parallel allocation requests against one block and confirm they receive different, non-overlapping subnets, and restoring last night's backup reproduces the record counts exactly.",
    dep: []
  },
});
