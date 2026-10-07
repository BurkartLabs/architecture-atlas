// Details for the DHCP & IPAM plate, part 3: DHCPv4 protocol, IPv6 assignment, relay and packet handling.
ATLAS.details("dhcp-ipam", {
  "discover-and-offer": {
    s: "The first exchange: a client with no address broadcasts a discover, and each server that can serve it replies with an offer of an address and terms.",
    d: "The client sends from address zero to the broadcast address with its identifier and a parameter request list. The server picks a scope, selects an address (a reservation, the client's previous address, a requested one or a free one) and answers with an offer. The offered address is held briefly, but nothing is committed, since the client may take another server's offer. The hard parts are holding addresses without exhausting pools and choosing a good candidate quickly.",
    k: ["Hold offered addresses for a few seconds vs commit nothing: holding avoids giving the same address to two clients in flight; not holding saves state but allows offer collisions.", "Offer the previous address first vs a fresh one: previous address gives stable addressing; fresh is simpler and spreads usage."],
    p: ["Many scanners send discovers and hold the whole pool in offers that are never accepted.", "Two servers offer the same address from overlapping scopes, and the client accepts one while the other keeps it held."],
    v: "Send a discover from a test client and confirm one offer arrives with an address in the pool, a lease time and the requested options, and that the server's lease table shows it as offered but not bound.",
    dep: ["packet-parser", "pool-selection", "static-reservations", "reply-addressing"]
  },
  "request-and-acknowledge": {
    s: "The second exchange: the client requests the offered address from one chosen server, and that server commits the lease and acknowledges it.",
    d: "The request names the chosen server and address, which tells other servers to withdraw their offers. The server validates the request again (address still free, scope still valid), writes the lease durably and sends the acknowledgment with final times and options. Only then does the client configure the address. If the check fails, the server answers with a negative acknowledgment. The hard parts are the durable write before reply, optional conflict probing and the DNS update, each adding latency.",
    k: ["Write then acknowledge vs acknowledge then write: write-first is safe after crashes; acknowledge-first is faster but can lose grants.", "Probe for conflicts before acknowledging vs after: before avoids handing out used addresses but delays every grant; after is faster but must recover from conflicts."],
    p: ["The acknowledgment is lost, so the client retries and the server must recognize the same request and answer idempotently.", "A slow DNS update inside the grant path delays every acknowledgment."],
    v: "Complete discover, offer, request on a test client, then confirm the lease is bound in the store with the correct times, that the client interface holds the address, and that the other server's offer is released.",
    dep: ["discover-and-offer", "write-ahead-journal", "lease-state-machine", "icmp-probe"]
  },
  "lease-state-machine": {
    s: "The set of states a lease passes through: free, offered, bound, expired, released, abandoned and backup, with defined transitions and timers.",
    d: "A lease starts free, becomes offered on a discover, bound on a request, and returns through expiry or release. Expired leases usually stay associated with their client for a period so it can get the same address back. Declined and conflicted addresses become abandoned until they are probed or time out. The failover protocol adds states for partner coordination. The hard parts are keeping transitions consistent across crashes and across partners, and having a clear rule for when an address is truly reusable.",
    k: ["Keep expired leases for reuse by the same client vs free immediately: keeping gives stable addresses; freeing maximizes capacity.", "Few simple states vs many specific ones: few states are easy to reason about; many states represent failover and abandonment precisely."],
    p: ["A lease stuck in the offered state never returns to free because the timer was not persisted across a restart.", "Expired leases are reused immediately while a client's cached lease is still valid by its own clock."],
    v: "Drive one lease through offer, bind, renew, release and expiry using a test client, reading the lease record after each step, and confirm the state and timestamps match the specification.",
    dep: ["lease-store", "lease-expiry-timer", "renew-and-rebind"]
  },
  "renew-and-rebind": {
    s: "The timers by which a bound client extends its lease: at half the lease time it asks its own server, and at seven eighths it asks any server.",
    d: "At the renewal time the client sends a unicast request to the server that granted the lease. If no answer, at the rebinding time it broadcasts to any server. If the lease expires without an answer, the client must stop using the address. The server extends the lease from the current time if the client is still valid, or sends a negative acknowledgment if not. Because many clients start together, renewals cluster. The hard parts are sizing for the load and keeping timers right across suspend and clock changes.",
    k: ["Extend from the time of renewal vs from the original start: extending from renewal is simple and gives each client a full lease; fixed schedules make renewals predictable but complicate accounting.", "Randomize renewal times slightly vs exact timers: jitter prevents synchronized storms; exact timers are easier to test."],
    p: ["A server outage longer than half the lease time produces a wave of rebind broadcasts when it recovers.", "A laptop wakes after a long sleep and uses an expired address for a moment before checking."],
    v: "Set a one-minute lease on a test client, capture traffic, and confirm a unicast request at about thirty seconds and an updated lease end in the store; block the server and confirm a broadcast at about fifty-three seconds.",
    dep: ["lease-state-machine", "lease-time-policy", "reply-addressing"]
  },
  "release-and-decline": {
    s: "Two client messages that end a lease early: release says the client is done with the address, and decline says the address is already in use by something else.",
    d: "On release the server marks the lease free, or keeps it associated with the client for quick reuse. The message is unacknowledged, so a lost release just means the lease expires normally. On decline, the server marks the address as abandoned and stops using it for a period. Decline arrives when the client's own probe saw a conflict. The hard parts are authenticating these messages, since any host can send a release for someone else's address, and processing many declines without losing the pool.",
    k: ["Honor releases immediately vs ignore them: honoring frees addresses fast; ignoring prevents a forged release from ending someone else's lease.", "Quarantine declined addresses for a fixed time vs probe and return: fixed quarantine is simple; probing returns space sooner but depends on a reliable test."],
    p: ["A forged release for a busy address frees it, and it is given to a second client while the first still uses it.", "A device with a faulty probe declines every offered address and drains the pool into the abandoned state."],
    v: "Release a lease from the owning client and confirm the lease frees; send a release for the same address from a different hardware address and confirm the server ignores it and keeps the lease bound.",
    dep: ["lease-state-machine", "decline-quarantine", "client-identification"]
  },
  "inform-handling": {
    s: "Answering a request from a host that already has an address configured by hand and only wants options, with no lease created.",
    d: "A statically configured host sends an inform with its address and asks for options. The server replies with the relevant options for the subnet that address belongs to, but creates no lease and reserves nothing. It is used to get DNS servers or a time server without losing manual addressing. It is also a way to learn about a network's configuration. The hard parts are deciding whether to answer hosts outside known scopes, and not leaking configuration to unauthorized parties.",
    k: ["Answer informs for any address vs only for known subnets: answering everywhere is helpful; restricting avoids disclosing option data to unknown hosts.", "Reply with no lease time vs a default one: no lease time follows the protocol; some clients misbehave without one, and workaround values cause confusion."],
    p: ["Inform replies are sent to a host on an unrelated subnet, leaking internal server addresses.", "An operator expects informs to appear in lease history, but nothing records them."],
    v: "Configure a test host with a static address in a known subnet, send an inform, and confirm a reply with options arrives, while the lease table gains no row and the metrics show one inform handled.",
    dep: ["packet-parser", "option-inheritance", "subnet-scope"]
  },
  "init-reboot-and-nak": {
    s: "The path for a client that remembers a previous lease: it asks to confirm the old address, and the server either agrees or sends a negative acknowledgment.",
    d: "A rebooting client skips discovery and broadcasts a request for its old address, with no server identifier. A server that knows the lease and finds it still valid acknowledges it. A server that knows the address is not valid on this network (the client moved) sends a negative acknowledgment, which forces the client back to discovery. A server that knows nothing about it should stay silent, not guess. The hard parts are getting this right across multiple servers and after state loss.",
    k: ["Authoritative server that NAKs unknown addresses vs silent: authoritative speeds recovery for moved clients; silent avoids a wrong NAK when another server owns the lease.", "Verify against lease table vs only against the subnet: lease table is precise but needs the data; subnet check is stateless and good enough for moves."],
    p: ["A non-authoritative server NAKs a valid lease held in a partner, breaking a connected client.", "After state loss, a server stays silent for known addresses, and clients wait through long timeouts."],
    v: "Reboot a test client with a valid lease and confirm an acknowledgment; move it to a different subnet and confirm a NAK triggers a fresh discovery that ends with an address in the new subnet.",
    dep: ["request-and-acknowledge", "subnet-selection", "lease-store"]
  },
  "reply-addressing": {
    s: "How the server delivers a reply to a client that does not yet have an address: broadcast, unicast to the client's hardware address, or unicast through the relay.",
    d: "A client without an address cannot answer ARP, so the server either broadcasts the reply or sends a frame directly to the client's hardware address, with the offered address as the IP destination, bypassing ARP. Clients signal their preference with a broadcast flag. Relayed replies go to the relay's address, and the relay delivers them on the local segment. The hard parts are the need for raw sockets to build such frames and clients that mishandle either mode.",
    k: ["Unicast to hardware address vs broadcast: unicast saves traffic on busy segments; broadcast works for clients that cannot receive unicast before configuration.", "Honor the client's broadcast flag vs ignore it: honoring fits all clients; ignoring simplifies code but breaks the ones that cannot receive unicast."],
    p: ["A server without raw socket access tries to unicast and the frame is dropped because ARP has no entry for the offered address.", "A relay forwards the reply as a broadcast to a segment it was not meant for."],
    v: "Capture on the client's segment while it requests with the broadcast flag set and unset, and confirm the reply destination is the broadcast address in the first case and the client's hardware address in the second.",
    dep: ["raw-and-packet-sockets", "interface-binding", "relay-agent"]
  },
  "slaac-and-router-advertisement": {
    s: "Stateless address autoconfiguration: routers advertise prefixes and flags, and hosts build their own addresses without any server tracking them.",
    d: "A router periodically and on request sends advertisements listing on-link prefixes, whether hosts may self-configure, and whether to use DHCPv6 for addresses or other information. The host forms an address by combining the prefix with an interface identifier, which may be random and temporary for privacy, and checks for duplicates before use. It also learns the default gateway and, optionally, DNS servers. The hard parts are no central record of addresses and the interplay of the advertisement flags with DHCPv6.",
    k: ["SLAAC only vs DHCPv6 for addresses: SLAAC needs no server and scales; DHCPv6 gives tracking, fixed addresses and audit.", "Stable vs temporary interface identifiers: stable ones simplify tracking and filtering; temporary ones protect privacy but make identification by address impossible."],
    p: ["Advertisement flags tell hosts to use DHCPv6 but no server is running, and hosts stay without addresses.", "A rogue advertisement on a segment redirects every host's default route."],
    v: "Bring up a test host on a segment with advertisements enabled and confirm it forms an address from the advertised prefix, passes duplicate detection, and installs the router as default gateway.",
    dep: ["ipv6-addressing-plan", "route-options"]
  },
  "stateless-dhcpv6": {
    s: "Using DHCPv6 only to deliver options such as DNS servers and search lists, while addresses come from router advertisements.",
    d: "The host sends an information request and receives configuration data, without any address binding. The server stores no per-client state, so it scales trivially and failover is just running two servers. The advertisement's other-configuration flag tells hosts to ask. It is the common arrangement for networks that want self-configured addresses with centrally managed name servers. The hard parts are hosts that ignore the flag and the absence of any record of who is on the network.",
    k: ["Stateless DHCPv6 plus SLAAC vs fully stateful: stateless is simple and light; stateful gives address-level accounting and control.", "Deliver DNS in router advertisements vs DHCPv6: advertisements need only one protocol; DHCPv6 is more widely implemented and richer."],
    p: ["Some host stacks never send the information request, and have no name servers on IPv6.", "Operators assume lease history covers these hosts, but the server holds no records for them."],
    v: "Send an information request from a test host and confirm the reply carries DNS servers and the search list, and that the server's lease store holds no entry for it.",
    dep: ["slaac-and-router-advertisement", "option-encoding", "duid-and-iaid"]
  },
  "stateful-dhcpv6": {
    s: "DHCPv6 assigning individual addresses, with the server keeping bindings per client and per interface association, much like IPv4 leases but with different identifiers.",
    d: "The client sends a solicit asking for one or more non-temporary address associations. The server advertises, then replies to the request with specific addresses and lifetimes. It keeps a binding keyed by DUID and association identifier. Addresses come from pools within a /64, often with a very large range, so allocation is by hash or by sequence rather than scanning. The hard parts are that router advertisement still supplies the gateway, and that clients can ask for multiple addresses.",
    k: ["Sequential vs hashed or random allocation inside a /64: sequential is predictable and compact; random resists scanning but makes capacity harder to reason about.", "One address per client vs several: one is simple; multiple supports hosts running many services or containers, with more state."],
    p: ["Allocating sequentially from the start of a /64 makes every client address trivially guessable.", "Operators size the pool as with IPv4, when the real limit is state size and renewal load."],
    v: "Request an address from a test client using the four-message exchange and confirm the binding in the store records the DUID, association identifier, address and lifetimes, and that the address falls in the configured pool.",
    dep: ["duid-and-iaid", "address-pools", "ipv6-lease-timers", "lease-store"]
  },
  "duid-and-iaid": {
    s: "The identifiers DHCPv6 uses: a device-wide identifier for the client and an identifier for each interface association, in place of a hardware address.",
    d: "The DUID is generated once per host and kept, usually derived from a link-layer address and time, from a vendor identifier or from a random value. Each address-bearing interface has an association identifier. The server binds leases to the pair. This decouples identity from network cards, but means the identifier is opaque and may not map to anything visible on the network. Reservations need the DUID, which can be hard to obtain in advance. The hard parts are cloned images that share DUIDs and correlating a DUID with an IPv4 host.",
    k: ["DUID tied to hardware vs generated random: hardware-derived is stable but changes with the card; random is unique per install but is lost with a reinstall.", "Reserve by DUID vs by network location: DUID follows the device; location data is visible to the network and known before the device exists."],
    p: ["Machine images cloned with the DUID stored in them cause every copy to fight over the same binding.", "The DUID cannot be found before first boot, so reservations are made after the fact and need a second pass."],
    v: "Boot two clones of one image and confirm the server shows one DUID bound to alternating addresses; change the DUID on one and confirm each then holds a separate stable binding.",
    dep: ["packet-parser"]
  },
  "prefix-delegation": {
    s: "Delegating a whole IPv6 prefix to a downstream router, which then divides it among its own subnets, usually to a customer or branch.",
    d: "A requesting router asks for a prefix association and receives, for example, a /56 with a lifetime. It carves /64 subnets from it and advertises them on its interfaces. The server tracks delegated prefixes in its own pools by prefix length. Hierarchical delegation is possible: a router that received a prefix can delegate parts of it further. The hard parts are the routing state this implies, size choices for different customer classes, and stable prefixes, since renumbering a downstream network is costly.",
    k: ["Stable prefix per customer vs dynamic from the pool: stable prefixes help hosting and filtering; dynamic prefixes make better use of space but renumber on change.", "Large delegations (/48) vs smaller (/60 or /56): large ones never run out inside the customer; small ones conserve the provider's space."],
    p: ["A returned prefix is reissued to another customer while old addresses remain in remote allow lists.", "The server allocates a delegation but no route to it exists, so the downstream network has no connectivity."],
    v: "Request a /56 from a test router, then confirm the binding is recorded, the router advertises /64 subnets from it, and a host in one of them reaches an outside address through a route installed to the delegation.",
    dep: ["duid-and-iaid", "delegated-route-install", "ipv6-addressing-plan", "lease-store"]
  },
  "delegated-route-install": {
    s: "Making a delegated prefix reachable by creating a route to it, so traffic for the delegated subnets reaches the requesting router.",
    d: "The delegating server knows the prefix and the requesting router's address, but the network must route to it. Either the server runs on the router and installs a route when it binds the delegation, or it notifies a routing component, or the relay snoops replies and installs routes. The route must be withdrawn at expiry or release. The hard parts are tight coupling of a lease server to routing state and keeping routes correct across restarts and failover.",
    k: ["Relay installs routes from observed replies vs server installs routes directly: the relay sits on the path and knows the next hop; the server knows the lease but not the topology.", "Static aggregate with the router handling it vs per-delegation routes: aggregate is simple and stable; per-delegation routes allow arbitrary placement but fill the routing table."],
    p: ["Routes stay after a delegation is released and traffic for a reused prefix goes to the old customer.", "After a server restart, bound delegations exist but no routes, and customers lose connectivity."],
    v: "Bind a delegation and read the routing table on the relay to see a route for the prefix toward the client; release it and confirm the route disappears.",
    dep: ["prefix-delegation", "relay-agent", "lease-event-hooks"]
  },
  "rapid-commit": {
    s: "A shortened exchange, in which the client sends a solicit with a rapid-commit flag and the server replies directly with a final answer, skipping advertise and request.",
    d: "Two messages replace four, so connection setup is faster and there is less state in flight. The server commits the binding on the first reply, which means a client that has multiple servers around may get commitments from several, with only one used. This option is enabled when servers are the only ones responding or when the cost of wasted addresses is low. The hard parts are the abandoned bindings from servers whose reply was not chosen and the trade-off at scale.",
    k: ["Enable rapid commit vs always use four messages: rapid commit saves round trips and server work; four messages avoid committing addresses to clients that choose another server.", "Honor rapid commit per scope vs globally: per scope allows it where servers are single; globally risks wasted addresses on segments with several servers."],
    p: ["With two servers answering, both commit addresses and one set is wasted until it expires.", "Operators enable it everywhere and cannot tell from logs which exchange a client used."],
    v: "Send a solicit with the rapid-commit flag and confirm a single reply carries the binding, and the store shows it as committed after two messages rather than four.",
    dep: ["stateful-dhcpv6", "lease-state-machine"]
  },
  "ipv6-lease-timers": {
    s: "The lifetimes in IPv6 assignments: preferred and valid lifetimes for each address, plus renewal and rebinding times for the association.",
    d: "Each address has a preferred lifetime, after which the host should avoid it for new connections, and a valid lifetime, after which it cannot be used at all. The association carries its own renewal and rebind times, which the server may set or leave for the client to choose. This split lets a network drain an address gracefully before reuse. The hard parts are mismatch between router-advertised lifetimes and DHCPv6 ones, and values so short that renewal traffic dominates.",
    k: ["Long valid with shorter preferred lifetime vs equal values: separating them allows graceful renumbering; equal values are simpler but cut connections abruptly.", "Server-set renewal times vs client defaults: server-set values give control of load; client defaults match half the lifetime and cluster."],
    p: ["Valid lifetime shorter than the preferred lifetime makes hosts drop addresses while still preferring them.", "A prefix withdrawn at the router while DHCPv6 lifetimes remain long leaves hosts using unreachable addresses."],
    v: "Assign an address with a short preferred and longer valid time to a test host, and confirm that it moves to deprecated status at the preferred time and disappears at the valid time, as seen in the host's address list.",
    dep: ["stateful-dhcpv6", "lease-time-policy"]
  },
  "relay-agent": {
    s: "A component on the router or switch that catches broadcast requests on a segment and forwards them as unicast to a configured server, then returns the reply.",
    d: "Because broadcasts do not cross routers, a relay on the client's segment wraps the request, stamps its own interface address in the gateway field so the server knows the subnet, and sends it to one or more servers. Replies come back to the relay, which delivers them locally. IPv6 relays encapsulate the client message in a relay message with the link address. The hard parts are relay configuration (a missing server address means no service on that segment) and consistent behavior across devices.",
    k: ["Relay to several servers vs one: several gives redundancy without failover state; one is simple but is a single point of failure.", "Relay on the router vs on a switch: router relay knows the subnet directly; switch relay sees the port but must be given the subnet mapping."],
    p: ["A new VLAN is built without a relay configuration, and its clients never receive an address.", "The relay source address is unreachable from the server, so replies never return."],
    v: "Send a request from a client on a remote segment and confirm the server's log shows the relay's address as gateway, an offer returns through the relay, and the client acquires an address from that segment's scope.",
    dep: ["subnet-selection", "reply-addressing"]
  },
  "relay-agent-information": {
    s: "Extra data added by the relay to a request, identifying the circuit, port or remote device the client is attached to, which the server can use but the client cannot forge.",
    d: "The relay appends sub-options such as a circuit identifier (the port or VLAN), a remote identifier (the access device) and link selection data that tells the server which subnet to use. The server echoes the option in replies so the relay can strip it. Servers match scopes, pools and reservations on this data and apply limits per port. The hard parts are that each relay vendor fills these in differently and that a request containing the option arriving from an untrusted port must be dropped.",
    k: ["Match policy on circuit data vs on client identity: circuit data is infrastructure-supplied and trustworthy; client identity follows the device but can be forged.", "Relay on every access switch vs only at the router: switch relays give port-level identity; router-only relays are simpler but see only the segment."],
    p: ["A relay option from an untrusted client port makes the server believe the client is somewhere else.", "Format of circuit identifiers differs between switch models, so reservations by port match only some devices."],
    v: "Send a relayed request with a known circuit identifier and confirm the server's log records it, the reservation by circuit matches, and the reply echoes the option back unchanged.",
    dep: ["relay-agent", "packet-parser"]
  },
  "subnet-selection": {
    s: "Choosing the correct scope for a request, using the relay's address, link selection data, the receiving interface, or a client's requested or current address.",
    d: "For directly attached clients the server uses the receiving interface's address. For relayed ones it uses the gateway address field, or a link-selection sub-option that overrides it. Some setups use a different subnet-selection option set by a trusted relay. The server finds the scope containing that address, and for shared networks may consider several. If nothing matches, the request is ignored. The hard parts are overlapping scopes and mismatched relay addresses, which silently produce wrong or no answers.",
    k: ["Strict match to a scope vs fallback to a default: strict avoids wrong answers; fallback is forgiving but can serve the wrong network.", "Trust link selection from any relay vs only from configured ones: trusting any is easy; restricting prevents an untrusted relay from choosing another tenant's subnet."],
    p: ["The relay address sits in a different prefix than the one served, and no scope matches.", "Link selection from an unauthorized source puts a client on an unrelated subnet."],
    v: "Send relayed requests with different relay addresses and link selection values, and confirm each is answered from the scope containing the effective address, and a request from an unknown relay is logged and ignored.",
    dep: ["subnet-scope", "relay-agent-information", "shared-networks"]
  },
  "packet-parser": {
    s: "The code that decodes incoming messages, validates their structure and fields, and rejects malformed or unauthorized ones before any policy runs.",
    d: "It checks lengths, magic values, option bounds, duplicate or overlapping options and message type, then builds a request object with the identifiers and options the policy layer needs. Packets arrive from untrusted hosts, so the parser must never read past a length field or loop on a crafted option list. It also normalizes data: client identifier, hostname and requested parameters. The hard parts are tolerance for the many slightly wrong clients in the world and strictness about security.",
    k: ["Strict rejection vs tolerant parsing: strict stops crafted input; tolerant serves clients with minor flaws but widens the attack surface.", "Parse into typed structure vs lazily extract fields: a typed structure is safe and reusable; lazy extraction is faster but spreads validation across the code."],
    p: ["A crafted option length causes a read beyond the packet and crashes the whole service.", "A parser rejects a widely deployed client that sends a harmless malformed field, and that client population loses service."],
    v: "Feed the parser a corpus of malformed packets, including truncated options and overlong lengths, and confirm each is rejected with a counter increment, no crash and no memory growth.",
    dep: []
  },
  "relay-chains": {
    s: "Handling requests that pass through more than one relay, including nested relay messages in IPv6 and hop count limits in IPv4.",
    d: "In IPv6, each relay wraps the message it received in a new relay message, so the server sees nested layers, each with its own link address and options. The server unwraps from the outermost layer and rebuilds the same nesting for the reply. IPv4 relays increment a hop count, and may chain via relay information options. The server uses the innermost link address to choose the subnet and may read circuit data from different levels. The hard parts are loops, depth limits and choosing which layer's data to trust.",
    k: ["Use the innermost relay's data vs outermost: innermost describes the client's segment; outermost identifies the last hop and may be better for filtering.", "Allow deep chains vs limit depth tightly: deep chains support complex topologies; a tight limit blocks loops and amplification."],
    p: ["A loop between two relays circulates a request until the hop limit, causing a storm.", "The reply is not re-wrapped in the same nesting, so an intermediate relay discards it."],
    v: "Send a request through two relay layers and confirm the server picks the subnet from the innermost link address, and the reply returns wrapped identically so the client receives it.",
    dep: ["relay-agent", "subnet-selection", "packet-parser"]
  },
  "lease-query": {
    s: "A protocol that lets a relay or access device ask the server which client holds an address or is on a given port, so it can rebuild forwarding state.",
    d: "A requester sends a query by address, hardware address or relay identifier, and the server replies with the lease data: client, address, times and relay information. Access devices use it after a restart to relearn bindings and enforce anti-spoofing filters. Some servers also support bulk queries over a stream connection for many leases. The hard parts are exposing lease data only to authorized requesters and handling large bulk transfers without hurting the grant path.",
    k: ["Allow queries from any requester vs a configured list: any is simple; a list protects client data and costs configuration.", "Bulk stream queries vs polling single queries: bulk recovers a restarted device quickly; single queries are light but slow to rebuild many entries."],
    p: ["A bulk query during business hours loads the lease store and slows live grants.", "Unrestricted queries let any host enumerate every client and address on the network."],
    v: "Query a known address from an authorized requester and confirm the reply includes the client identifier, lease times and relay data; repeat from an unauthorized one and confirm refusal.",
    dep: ["lease-store", "relay-agent-information", "roles-and-access-control"]
  },
});
