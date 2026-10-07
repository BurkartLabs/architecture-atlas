// Details for the DHCP & IPAM plate, part 2: subnet planning, scopes and pools, reservations and classes, options.
ATLAS.details("dhcp-ipam", {
  "allocation-engine": {
    s: "The logic that finds a free block of a requested size in a parent range, applying alignment, policy and reservation rules, and records it atomically.",
    d: "Given a parent block and a size, the engine lists free ranges (the parent minus children, holds and reserved ranges), picks one that fits on a prefix boundary and commits it. Strategies differ: first fit packs tightly, best fit leaves large gaps, and spread-out placement leaves room to grow each child. It must serialize concurrent requests and respect holds. The hard parts are fragmentation over years and choosing a placement that leaves aggregable space for routing summarization.",
    k: ["First fit vs growth-aware placement: first fit uses space densely; leaving gaps lets subnets grow in place but spends the plan faster.", "Allocate immediately vs hold then confirm: immediate is simple; hold prevents double allocation while a request awaits approval but can strand blocks if abandoned."],
    p: ["Years of first-fit allocation scatter small subnets, leaving no contiguous block for a large site.", "Allocations ignore routing summarization, and a region's subnets cannot be advertised as one prefix."],
    v: "Request the same size from a block with two concurrent callers and confirm each gets a distinct aligned subnet, and that the parent's free-space list afterward excludes both.",
    dep: ["address-space-hierarchy", "reserved-ranges-and-holds", "inventory-store"]
  },
  "subnet-split-and-merge": {
    s: "Operations to divide a subnet into smaller ones, merge adjacent ones, and report how blocks aggregate, with the DHCP scope changes each implies.",
    d: "Splitting a /24 into four /26 subnets must carry over addresses, reservations and leases to whichever child contains them, and notify the router configuration owners. Merging requires the pieces to be adjacent and aligned, and combines scopes. Both change the gateway, broadcast address and pools. The hard part is doing this with live leases: clients keep their addresses, so a split that moves the gateway or mask strands them until renewal.",
    k: ["In-place resize vs create new and migrate: in-place keeps addresses but needs a coordinated router change; migration is cleaner but renumbers every host.", "Automatic scope rewrite vs manual follow-up: automatic avoids inconsistency; manual allows review but leaves a window where plan and server differ."],
    p: ["A merge combines two scopes and drops a reservation that fell outside the merged pool definition.", "The split changes the mask on the server before the router, and clients receive a mask that does not match their segment."],
    v: "Split a test subnet with active leases and static hosts into two, and confirm every existing lease and reservation lands in the correct child, with no address lost and the plan's free counts adding up.",
    dep: ["subnet-records", "subnet-scope", "address-records"]
  },
  "reserved-ranges-and-holds": {
    s: "Marking portions of space as unavailable to automatic allocation, either permanently (infrastructure, anycast, management) or temporarily while a request is in progress.",
    d: "Reserved ranges hold the first addresses in each subnet for gateways and infrastructure, blocks for future growth, and addresses owned by other teams. Holds are temporary claims with an expiry, placed when someone starts a request. Both are visible to the allocation engine and, for ranges inside a subnet, converted into exclusions on the DHCP scope. The hard parts are expiring stale holds and making sure a range excluded in the plan is actually excluded in the server configuration.",
    k: ["Permanent reservations vs time-limited holds: permanent protect long-term plans; time-limited prevent abandoned requests from locking space forever.", "Reserve by convention (always the first ten) vs explicit records: convention needs no data; explicit records cope with exceptions but must be maintained."],
    p: ["A hold never expires after a project is cancelled, and a large block stays unavailable for years.", "Reserved infrastructure range exists in the plan but not in the scope, so the server leases the router's address."],
    v: "Reserve a range in the plan, publish to a staging server, then exhaust the pool with test clients and confirm none receives an address from the reserved range.",
    dep: ["address-space-hierarchy", "exclusion-ranges", "inventory-store"]
  },
  "ipv6-addressing-plan": {
    s: "The structure for dividing IPv6 space: how site, function and subnet are encoded in the prefix, since sparse allocation matters more than conservation.",
    d: "An organization receives a large prefix and divides it by bits: region, site, function, then a /64 per subnet. Because /64 is the standard subnet size, addresses are not scarce and the plan optimizes for aggregation and readability instead. Delegated prefixes for downstream routers and customers get their own pools. Plans often reserve bit ranges for future levels. The hard parts are deciding bit allocations that will still fit in ten years and tracking subnets without enumerating the huge address space within them.",
    k: ["Fixed bit fields per level vs flexible variable splits: fixed fields make addresses readable and aggregation tidy; flexible splits use space efficiently but defy pattern reading.", "Track subnets only vs track hosts too: subnet-only tracking scales; host tracking needs discovery and only covers observed addresses."],
    p: ["Allocating small prefixes to subnets breaks SLAAC, which requires a 64-bit interface identifier.", "The bit plan leaves too few bits for site count, forcing a renumbering."],
    v: "Allocate a site's block and a function subnet from the plan, then confirm every subnet is a /64, nested inside the site prefix, and the covering route summarizes all of them.",
    dep: ["address-space-hierarchy", "allocation-engine", "slaac-and-router-advertisement"]
  },
  "allocation-requests": {
    s: "A workflow for asking for address space or an address, with approval, validation and automatic provisioning once approved.",
    d: "A requester states what they need: a subnet of a given size for a site, or a fixed address for a device. The system proposes a placement, routes it to the owner of the parent block for approval, then holds the space and creates inventory records. Approved requests can trigger scope creation, DNS records and notifications. The hard parts are preventing the process from becoming a bottleneck, handling urgent exceptions, and keeping requests and actual network changes connected so approved space is really used.",
    k: ["Approval for every request vs auto-approve within a quota: full approval gives control; quotas let teams move fast inside limits but need quota upkeep.", "Request creates records at once vs only after approval: at once keeps space held; after approval keeps the plan free of speculative entries."],
    p: ["Requests wait weeks for approval, and teams bypass the process by taking addresses informally.", "Approved space is never used or released, and the plan slowly fills with unneeded allocations."],
    v: "Submit a request for a /26, approve it as the block owner, and confirm the subnet, a matching scope and the requester's access appear, and the audit log links all of them to the request.",
    dep: ["allocation-engine", "roles-and-access-control", "change-audit-log"]
  },
  "reclamation-and-cleanup": {
    s: "Finding allocations and records that are no longer used, confirming with evidence, and returning them to free space.",
    d: "Evidence comes from lease history, discovery and DNS activity: a subnet with no leases in ninety days, a static address nobody answers on, a reservation for a device never seen again. Candidates are flagged to owners, then deprecated, then removed after a grace period. Removal updates the plan, the scope and DNS. The hard parts are false positives (a quiet backup server), owners who never respond, and removing records that other systems still reference.",
    k: ["Automatic reclamation vs owner confirmation: automatic recovers space reliably; confirmation avoids outages from reclaiming quiet but needed addresses.", "Hard delete vs deprecate with a grace period: hard delete is immediate; a grace period allows recovery at the cost of space held longer."],
    p: ["A seasonal system is reclaimed during its idle months and its address is reused before its next run.", "An address freed in the plan is still referenced by a firewall rule, so a new host inherits access."],
    v: "Mark a test subnet idle in lease history, run cleanup, and confirm it is flagged, deprecated after owner non-response, returned to free space after the grace period, and its scope and DNS records are removed.",
    dep: ["lease-history", "discovery-and-reconciliation", "address-records"]
  },
  "subnet-scope": {
    s: "The server-side definition that ties one subnet to its pools, lease times, options and reservations, and is the unit of policy for a network segment.",
    d: "A scope states the subnet prefix, the pools in it, the default lease time, the options to send and the reservations that apply. When a request arrives, the server matches it to a scope using the relay address or receiving interface, and everything after that is evaluated inside it. Scopes are loaded into memory and indexed for fast lookup. The hard parts are mismatches between scope and the real network: a wrong prefix or gateway affects every client in the segment.",
    k: ["Scope per subnet vs scope per shared network: per subnet is simple and isolated; per shared network lets clients draw from many ranges on one segment.", "Scope fully independent vs inheriting from global defaults: independent scopes are self-contained; inheritance reduces repetition but hides where a value comes from."],
    p: ["A scope's gateway differs from the router's real address, and every client on that segment loses connectivity.", "Overlapping scopes on one server make subnet selection ambiguous, and clients get answers from the wrong one."],
    v: "Define a scope for a test subnet, request from a client on it, and confirm the offer's address lies in the scope's pool, with the subnet mask, gateway and lease time exactly as configured.",
    dep: ["address-pools", "lease-time-policy", "option-inheritance"]
  },
  "address-pools": {
    s: "The ranges of addresses inside a scope that the server may hand out dynamically, separate from reserved, excluded and statically configured addresses.",
    d: "A pool is a start and end address, optionally with its own class restrictions or options. The server tracks which addresses are free, leased, expired but not yet reusable, abandoned or reserved. Allocation order matters: some servers pick the least recently used address, which keeps a client's previous address available for return, while others pick lowest first. The hard parts are efficient free-address lookup in huge pools and not running out because of expired leases that are held for reuse.",
    k: ["Least recently used vs lowest free address: LRU gives clients their old address back and spreads wear; lowest-first is predictable but reuses addresses immediately.", "One large pool vs several small pools with different policy: one large pool is simple; several allow class-based segregation but fragment capacity."],
    p: ["Pool boundaries overlap a statically configured device and the server leases that device's address.", "Abandoned addresses accumulate from declines and shrink the pool without anyone seeing it."],
    v: "Exhaust a pool of ten addresses with test clients and confirm exactly ten leases are issued, the eleventh client gets no offer, and the server logs a pool-exhausted event naming the pool.",
    dep: ["subnet-scope", "lease-store", "in-memory-lease-index"]
  },
  "shared-networks": {
    s: "A grouping of several subnets that share one physical segment, so a client may be served from any of them depending on availability and policy.",
    d: "When a segment has run out of addresses or has been renumbered, the router carries multiple subnets on one interface and the relay identifies only one of them. The shared network groups those subnets, and the server picks among them: usually the first with free addresses, or the one matching a class. A client keeps its address if it is still valid in any member. The hard parts are renewals when the client's address belongs to a different member, and clients that do not handle mask changes.",
    k: ["Shared network vs separate segments: sharing is a quick fix for exhaustion; separate segments give isolation and clearer fault domains.", "Prefer-oldest-subnet vs spread across members: preferring the oldest drains space in order; spreading balances usage but mixes populations."],
    p: ["A renewal request is NAKed because its address belongs to a subnet not matched by the relay address.", "Permanent use of a shared network masks a design problem, and a /24 segment is left to hold thousands of devices."],
    v: "Configure two subnets on one shared network, fill the first pool, and confirm the next client receives an address from the second with the correct mask and gateway, and an existing client renews its original address.",
    dep: ["subnet-scope", "subnet-selection", "pool-selection"]
  },
  "pool-selection": {
    s: "The logic that chooses which pool, among those a client qualifies for, supplies its address, given classes, relay data and requested addresses.",
    d: "After the scope is found, the server evaluates pools in order. A pool may be restricted to classes (phones, guests), to relay-stamped circuit identifiers or to known clients. The first eligible pool with a free address wins. A client that requests a specific address, or holds a current lease, is first checked against that. Evaluation order and fall-through behavior define who gets what when a pool is full. The hard part is that many small rules combine in ways that are hard to test by reading configuration.",
    k: ["First match wins vs best match: first match is predictable and fast; best match avoids order sensitivity but is harder to explain.", "Fall through to a general pool when a class pool is full vs refuse: fall through keeps service up; refusing preserves the class boundary, such as for guests."],
    p: ["A broad pool listed first captures clients meant for a restricted pool, which then sits empty.", "A class-restricted pool fills and phones fall into the general pool, where they get no voice options."],
    v: "Configure a class-restricted pool and a general pool, request as a member of the class and as a non-member, and confirm each lands in the intended pool, and the class pool exhausting follows the configured fallback.",
    dep: ["address-pools", "client-classification", "relay-agent-information"]
  },
  "lease-time-policy": {
    s: "The rules setting lease length per scope, class or reservation, including default, minimum and maximum values and honoring the client's requested time.",
    d: "A client may request a lease time. The server clamps it between a minimum and maximum and falls back to a default. Policy can vary by class: short for guests, long for fixed desktops. The renewal and rebind times are derived from the lease time by default at one half and seven eighths, and can be set explicitly. The hard parts are consistency with failover (lease time must exceed the lead time) and understanding how existing leases behave when the policy changes, since they keep their old length.",
    k: ["Honor client requests within bounds vs ignore them: honoring respects devices that know their needs; ignoring gives the operator uniform control.", "Change affects only new leases vs force existing ones to adopt it: new-only is safe; forcing is faster but requires shortening renewals and generates load."],
    p: ["A policy change from days to minutes is rolled out and all clients take a day to adopt it, so the expected effect is delayed.", "A client asks for an infinite lease and holds an address forever because no maximum was set."],
    v: "Set a short maximum for a class, request a very long lease as a member of it, and confirm the acknowledgment carries the clamped lease time with renewal and rebind times derived from it.",
    dep: ["subnet-scope", "client-classification", "renew-and-rebind"]
  },
  "exclusion-ranges": {
    s: "Addresses inside a pool's span that the server must never hand out, because static devices use them or they are reserved for infrastructure.",
    d: "Rather than splitting a pool around every fixed device, operators define the full range and list exclusions. The server removes those addresses from the free set at load time. Exclusions differ from reservations: an excluded address is never given out to anyone, while a reservation is given to a specific client. The hard parts are keeping exclusions in sync with devices that use static addresses, since nothing on the network enforces them, and calculating usage so that excluded addresses are not counted as capacity.",
    k: ["Exclude within a wide pool vs define several narrow pools: exclusion is easy to edit; narrow pools make boundaries explicit but multiply definitions.", "Exclusion vs reservation for printers and servers: exclusion is simple; reservation documents which device holds each address and can deliver options."],
    p: ["A new static device is configured on an address inside the pool and never added to exclusions, so a lease collides with it.", "Utilization counts excluded addresses as free, and capacity looks larger than it is."],
    v: "Add an exclusion in the middle of a pool, exhaust the pool with test clients, and confirm no lease falls inside the excluded range and the usage report counts only the real capacity.",
    dep: ["address-pools", "subnet-scope"]
  },
  "client-identification": {
    s: "How the server decides which device a request comes from: hardware address, a client identifier option, a DUID, or data stamped by the network.",
    d: "By default IPv4 clients are identified by hardware address, but a client identifier option can replace it, which lets one machine keep an address across network cards or lets virtual machines with duplicated hardware addresses be told apart. IPv6 uses the DUID. Relay-added circuit or remote identifiers describe where the client is attached. The server picks a primary identity per scope and matches reservations and leases to it. The hard parts are devices that change identifiers, and randomized hardware addresses that make clients look new on each network join.",
    k: ["Hardware address vs client identifier as the lease key: hardware address is always present; client identifier survives interface changes but not every client sends one.", "Trust client identity vs network-stamped location: client identity follows the device; location identity is unforgeable by the client but ties the address to a port."],
    p: ["Phones with randomized hardware addresses get a new lease every join and drain a guest pool.", "Cloned virtual machines share an identifier and take over each other's lease."],
    v: "Request a lease with a client identifier that differs from the hardware address, then renew using only the hardware address, and confirm the server treats them as different clients as configured.",
    dep: ["packet-parser", "duid-and-iaid", "relay-agent-information"]
  },
  "static-reservations": {
    s: "A binding of a specific client identity to a specific address, so the device always receives the same address but still configures itself by DHCP.",
    d: "A reservation names the identifier, the address and optionally a hostname and option overrides. The address must lie in the subnet, not conflict with another reservation, and be handled consistently with the pool: some servers require it outside the dynamic range, others allow it inside with protection from dynamic use. Reservations keep the central record of what a device should be, rather than leaving it to the device's own static setting. The hard parts are conflicts between reserved and already leased addresses at creation time.",
    k: ["Reservations inside the pool vs outside: inside makes the address count toward utilization and needs protection; outside keeps them simple but cuts range and fragments the plan.", "Reservation vs static address on the device: reservation centralizes and can change remotely; device-side settings work when the server is down."],
    p: ["A reservation is created for an address currently leased to another client, and both devices fight over it.", "Hardware replaced without updating the reservation, so the new unit gets a random address."],
    v: "Create a reservation for a test client, remove its existing lease and restart the client, and confirm it receives the reserved address, its options and its name, and that a different client never receives it.",
    dep: ["client-identification", "subnet-scope", "reservation-sources"]
  },
  "client-classification": {
    s: "Assigning each request to named classes based on options, vendor strings, identifiers or expressions, so policy can differ by device type.",
    d: "Classification tests packet contents: a vendor class option naming a phone model, a user class, a hardware address prefix, relay data, or arbitrary expressions. A request can match several classes. Classes then control pool eligibility, options, lease times and boot files. Evaluation happens after parsing and before pool selection, sometimes in two passes when a class depends on a reservation. The hard parts are that all these values come from the client and can be spoofed, and that expression rules grow unreadable.",
    k: ["Simple matching rules vs expression language: simple rules are safe to review; expressions are flexible but become code nobody wants to debug.", "Classify on client-supplied fields vs network-supplied fields: client fields are rich but forgeable; network fields cannot be forged by the client but identify location rather than device type."],
    p: ["A guest spoofs the phone vendor string and receives the voice network's address range.", "Class rules overlap, and the evaluation order that determines the result is undocumented."],
    v: "Send requests with and without a phone vendor string, and confirm only the former is placed in the phone class and receives the voice options, with the matched class named in the debug log.",
    dep: ["packet-parser", "vendor-options", "client-identification"]
  },
  "class-policy": {
    s: "The behavior attached to a class: which pools it may use, what options and lease times it receives, how many addresses it may hold, and whether it is refused.",
    d: "Once a client has classes, policy applies in layers: global defaults, scope settings, class overrides, then reservation overrides, with the most specific winning. Classes can also gate access: unknown devices get a restricted pool with a captive portal address and short lease, known ones the production range. The hard parts are documenting precedence and testing, since a single request evaluates many rules, and making denial for unknown clients safe for devices that cannot retry gracefully.",
    k: ["Deny unknown clients vs quarantine them: denial gives no connectivity; a quarantine pool lets a device reach a registration page but consumes addresses.", "Class overrides replace the whole option set vs merge by option: replacement is clear; merging avoids duplication but makes the effective answer harder to see."],
    p: ["A restricted class's pool is small, and an influx of unknown devices exhausts it for legitimate onboarding.", "Overrides merge differently than expected and a class removes the DNS server option entirely."],
    v: "Request as an unknown client and as a registered one on the same segment, and confirm the first gets the quarantine address range and short lease while the second gets production values.",
    dep: ["client-classification", "pool-selection", "option-inheritance"]
  },
  "reservation-sources": {
    s: "Where reservations come from: configuration files, the management API, the inventory, a database, or a lookup against an external directory at request time.",
    d: "Small sites write reservations in configuration. Larger ones generate them from the inventory or load them from a database the server queries per request, which allows thousands of reservations without a reload. Some deployments look up devices in an authentication system. A source must be consulted quickly during the grant, cached safely and invalidated when a record changes. The hard parts are consistency between sources when two define the same client and the latency of a remote lookup on the packet path.",
    k: ["Load all reservations in memory vs query per request: in memory is fast but needs reload on change; per-request is current but adds latency and a dependency.", "One authoritative source vs merge of several: one source is predictable; merging lets exceptions live locally but needs precedence rules."],
    p: ["The reservation database is unreachable, and the server either refuses known devices or gives them random addresses.", "The same device is in two sources with different addresses, and the answer depends on load order."],
    v: "Add a reservation in the authoritative source, trigger a sync, and confirm the server serves it without a restart; make the source unreachable and confirm behavior matches the documented fallback.",
    dep: ["static-reservations", "inventory-store", "external-database-backend"]
  },
  "per-client-limits": {
    s: "Caps on how many addresses, leases or requests a single client or location may consume, so one device cannot drain a pool.",
    d: "Limits can count leases per hardware address, per client identifier, per relay circuit or per port. A switch port that suddenly requests fifty addresses is a sign of a forged-identity attack or a misconfigured virtual host. Limits are enforced at grant time, with older leases possibly released to make room for newer. The hard parts are legitimate cases such as virtualization hosts with many guests, and the need for identifiers that the client cannot cheaply change.",
    k: ["Limit by client identity vs by network location: identity limits follow the device; location limits resist identity spoofing but hit legitimate hubs.", "Refuse new requests at the limit vs recycle the oldest lease: refusing is predictable; recycling keeps a device connected but can pull an address from an active session."],
    p: ["A virtualization host with thirty guests on one port trips a limit set for single devices and its guests lose addresses.", "The limit keys on hardware address, so an attacker rotates addresses to bypass it."],
    v: "Send many requests with different forged hardware addresses through one relay circuit and confirm the server stops issuing after the configured count, logging the circuit, while other circuits are unaffected.",
    dep: ["relay-agent-information", "client-identification", "request-flood-protection"]
  },
  "option-encoding": {
    s: "The wire format for configuration options: a code, a length and a value, with the server's definitions of types for each option it understands.",
    d: "Each option has a numeric code and a type: address, list of addresses, string, integer, flag or opaque bytes. Operators configure values by name; the encoder checks the type and writes bytes. IPv6 uses wider code and length fields. The server needs definitions for standard options and a way to define custom ones. The hard parts are options that carry sub-options inside them, strings that need escaping, and encoding that follows the specification but that some real clients parse incorrectly.",
    k: ["Typed option definitions vs raw hex values: typed definitions catch errors and read well; raw hex covers anything but invites mistakes.", "Strict conformance vs client-specific workarounds: strict output follows standards; workarounds make odd clients work but accumulate special cases."],
    p: ["An address-list option is configured with a hostname instead of an address and encodes garbage.", "A client that mishandles a valid but long option fails to boot, though the server is correct."],
    v: "Configure a DNS server list, capture the offer, and decode it: confirm the option code, length and each four-byte address match the configuration, and a test client applies them.",
    dep: ["packet-parser"]
  },
  "option-inheritance": {
    s: "The layering of option values from global defaults through subnet, pool, class and reservation, with later levels overriding earlier ones.",
    d: "Setting the DNS server once at the global level and overriding it for one subnet keeps configuration short. The server resolves the effective option set per request by walking levels from most general to most specific, and some options (like the router) may be required at the subnet level. Debug tools should show where each value came from. The hard parts are surprising precedence, such as a class overriding a reservation, and changes at a high level reaching hundreds of scopes at once.",
    k: ["Deep inheritance vs flat explicit configuration: inheritance is concise and consistent; flat is verbose but each scope tells its whole story.", "Override replaces vs merges lists: replace is simple to predict; merge is convenient for adding one server but can leave stale entries."],
    p: ["A global option change is meant for one site and silently changes every scope that did not override it.", "An old override in a rarely edited scope keeps pointing clients at a decommissioned server."],
    v: "Set an option globally and override it in one scope, request from both, and confirm each client receives the expected value, and the effective-configuration view names the level supplying each.",
    dep: ["option-encoding", "subnet-scope"]
  },
  "vendor-options": {
    s: "Options that carry device-specific settings, wrapped in a vendor-identifying container so different manufacturers' meanings do not collide.",
    d: "A vendor-class option from the client names the device family, and the server responds with a vendor-encapsulated option holding sub-options only that vendor's devices understand: where a phone finds its configuration server, or how an access point finds its controller. The server needs the sub-option definitions and class matching to know when to send them. The hard parts are vendor documentation quality, sub-options that need exact formats, and devices that request vendor data using a parameter request list that omits it.",
    k: ["Always send vendor data vs only when requested: always is simple and works for odd clients; only-when-requested keeps replies small and obeys the protocol.", "Define sub-options by name vs raw bytes: named definitions are readable and checked; raw bytes need no schema work but are opaque."],
    p: ["Vendor data goes to all clients on a subnet and confuses unrelated devices that treat the option as malformed.", "A sub-option's format changes with a firmware version, and old and new devices need different encodings."],
    v: "Request as a device with a given vendor class and confirm the reply carries its encapsulated sub-options in the expected format; request as another device and confirm they are absent.",
    dep: ["option-encoding", "client-classification"]
  },
  "network-boot-options": {
    s: "Options that tell a booting machine where to fetch its boot program: a server address, a file name and, for IPv6, a boot-file URL, chosen by client architecture.",
    d: "A machine in firmware sends a vendor class naming its architecture and an option listing what it understands. The server answers with the address of a file server and a file name suited to that architecture, such as a different file for legacy BIOS and UEFI. A second stage may chain to another boot program that fetches a script, so the answer depends on whether the client is firmware or already a boot loader. The hard parts are the architecture matrix and tying the answer to the right class.",
    k: ["One boot server for all architectures vs per-architecture answers: one is simple; per-architecture is necessary because firmware types need different files.", "Server-side file selection vs a loader that decides after chaining: server-side is direct; chaining lets a script choose the image but needs a second class rule to avoid a loop."],
    p: ["A client loader that already booted receives the first-stage file again and loops forever.", "The file server is changed and boot options in many scopes still point at the old address."],
    v: "Send requests mimicking a legacy BIOS client and a UEFI client, and confirm each receives its own file name and server address; then mimic a chained loader and confirm it receives the next-stage answer.",
    dep: ["client-classification", "option-encoding", "vendor-options"]
  },
  "route-options": {
    s: "Options that deliver the default gateway, additional static routes and domain search lists, so clients know how to leave their subnet and what names to expand.",
    d: "The router option gives the default gateway. Classless static route options carry destination, mask and next hop for specific prefixes, and replace the router option when present on many clients. The domain name and search list shape how short names resolve. IPv6 relies on router advertisements for the default route, so DHCPv6 delivers only name servers and search lists. The hard parts are inconsistent client support for classless routes and ordering of entries in lists.",
    k: ["DHCP static routes vs routing protocol or router advertisements: DHCP routes are easy but static; dynamic routing adapts but is not run by hosts.", "Single gateway vs list of gateways: a list gives redundancy only on clients that use it; a single address is predictable."],
    p: ["Clients get both a router option and a classless route option and ignore one, causing a different default path than planned.", "A search list is long and slows every unqualified name lookup."],
    v: "Configure a default gateway and a static route for a private prefix, then on a test client confirm the routing table contains both and that traffic to that prefix leaves by the specified next hop.",
    dep: ["option-encoding", "subnet-records"]
  },
  "option-size-limits": {
    s: "The constraints on how much configuration fits in a reply, including the minimum message size, option overload into spare header fields and long-option splitting.",
    d: "A basic IPv4 reply has limited room after the fixed header, and the client's maximum message size option may restrict it further. When options do not fit, they can overflow into the boot file and server name fields, or large options are split into concatenated pieces. The server must order options by importance, because dropped ones are silently missing. Large vendor or route lists commonly hit this. The hard parts are path MTU for relayed replies and clients that cannot reassemble.",
    k: ["Prioritize options requested by the client vs a fixed order: client priority fits the request; fixed order is simpler and makes replies reproducible.", "Use overload fields vs trim content: overload fits more but is rarely tested on clients; trimming loses information the client may need."],
    p: ["Many classless routes push the reply past the limit, and the last routes are silently dropped.", "A relayed reply is fragmented and a firewall drops the fragments, so only some clients receive answers."],
    v: "Configure a list of options that exceeds the basic limit, request with a small maximum message size, and confirm the reply stays within it, with the most important options present and the omission logged.",
    dep: ["option-encoding", "route-options"]
  },
});
