// Details for the CDN plate, part 4: origin and tiering, routing and steering, points of presence.
ATLAS.details("cdn", {
  "tiered-caching-hierarchy": {
    s: "Arranges cache servers in layers, so a miss at a small edge site asks a larger regional cache before going to the origin, concentrating misses and raising the overall hit ratio.",
    d: "Edge sites are numerous and close to users but each sees a slice of traffic. Upper tiers are fewer, larger and see misses from many edges, so objects popular across regions stay cached there. Each edge is mapped to a parent, usually by region and by hash of the key. Tiers may differ in hardware, with upper tiers having more disk. It is hard because each tier adds latency on a miss, parent failure needs a fallback, and freshness and purge semantics must stay consistent across layers.",
    k: ["Two or more tiers vs. a single layer: extra tiers raise offload and cut origin load, but add a hop and more places for stale content or failures.", "Fixed parent per edge vs. dynamic selection: fixed parents keep content concentrated and caches warm, while dynamic selection routes around failures at the cost of duplicated storage."],
    p: ["A parent tier outage sends every child straight to the origin at once and overloads it.", "Age is not carried between tiers, so an object lives twice its intended lifetime."],
    v: "Request one cold object from ten edge sites and confirm the origin sees one request, the parent shows nine hits, and each edge reports the right tier in its cache status header.",
    dep: ["origin-shielding","consistent-hashing-to-cache","origin-connection-pooling"]
  },
  "origin-shielding": {
    s: "Designates one chosen location per customer through which all cache misses must flow, so the origin sees a single source and a single copy of each object is fetched.",
    d: "A shield is an upper-tier site selected near the origin, often by measured latency. Every edge and regional tier routes misses for that customer through it. The shield collapses duplicates, holds the long tail and keeps one pool of persistent connections to the origin. Customers choose it, or the platform picks it. It is hard because the shield is a bottleneck and single point of failure for the customer's misses, the path from far edges becomes longer, and shield selection must adapt when the origin moves.",
    k: ["A single shield vs. one per region: a single shield minimizes origin requests, while regional shields cut latency and spread failure at the cost of more origin traffic.", "Platform-chosen vs. customer-chosen shield: platform choice adapts to measurements, while customer choice lets them place it beside private connections."],
    p: ["The shield site is overloaded or fails and a customer's entire miss path degrades even though other sites are healthy.", "The shield is placed far from the origin and adds a long round trip to every miss."],
    v: "Send cold requests from a dozen distant sites, then check the origin logs show every request from the shield's address only, and kill the shield in a lab and confirm failover to the secondary within the target.",
    dep: ["tiered-caching-hierarchy","origin-failover"]
  },
  "origin-connection-pooling": {
    s: "Keeps warm, reusable connections to each origin, multiplexing many fetches over them, so misses avoid the cost of new handshakes and the origin sees few, steady connections.",
    d: "Cache servers maintain pools per origin address, with limits on idle and total connections, idle timeouts shorter than the origin's own, and health-based removal. HTTP/2 or HTTP/3 to the origin multiplexes requests, while HTTP/1.1 needs one connection per request in flight. Connection reuse across servers is improved by funneling through shields. It is hard because thousands of servers each holding pools can multiply into more connections than a small origin can accept, and stale connections closed by the origin cause spurious errors.",
    k: ["Large per-server pools vs. small: large pools lower latency, but thousands of servers multiplied together can exceed the origin's connection limit.", "Reusing connections across customers on the same origin address vs. dedicated pools: sharing saves handshakes, but must never leak per-customer authentication or headers."],
    p: ["An origin closes idle connections just as the edge reuses them, producing a stream of resets on the first request after quiet periods.", "Connection counts grow with the number of servers, and the origin hits its limit during a scale-out."],
    v: "Generate a steady miss rate to a test origin and confirm the origin sees far fewer new connections than requests, idle timeouts never exceed the origin's, and the connection count stays below the configured per-origin cap.",
    dep: ["upstream-protocol-selection","origin-health-checks"]
  },
  "origin-load-balancing": {
    s: "Distributes cache misses across a customer's multiple origin servers or data centers by weight, geography or measured performance, with session affinity when required.",
    d: "A customer lists several origin addresses with weights and health state. The edge picks one per request using round robin, least load, nearest or hashing for affinity, and avoids unhealthy ones. Geographic steering sends requests to the closest origin. Passive and active health feedback adjusts choices. It is hard because the CDN sees only a slice of the origin's total load and may unbalance it, and because origin capacity changes without notice.",
    k: ["Geographic steering vs. load-based: geographic gives low latency, while load-based protects capacity but may send users to a far origin.", "Stateless balancing vs. affinity: stateless spreads load evenly, while affinity keeps sessions on one server and can create hot origins."],
    p: ["A small origin pool receives a surge from a cache purge and one member is knocked over, shifting its load to the rest.", "Hash-based affinity concentrates traffic on one origin server when one user generates most requests."],
    v: "Weight three origins 50, 30 and 20 percent, send ten thousand misses and confirm the split matches within tolerance, then fail one and confirm its share moves to the others within the health-check interval.",
    dep: ["origin-health-checks","origin-connection-pooling"]
  },
  "origin-failover": {
    s: "Switches fetches to a backup origin when the primary fails or degrades, automatically and quickly, and returns to the primary when it recovers without causing flapping.",
    d: "Failover triggers on failed health checks, repeated connection errors, timeouts or specific status codes, and moves traffic to a secondary origin or origin group in order of preference. Recovery uses a hold-down period and gradual shifting. For safety, failover can also serve stale content first. The edge may retry a failed request on another origin transparently. It is hard because partial failures are ambiguous, a backup may be underprovisioned for full load, and rapid back-and-forth switching worsens an incident.",
    k: ["Automatic failover vs. manual: automatic reacts in seconds, but can shift load onto a backup that cannot take it and make a small problem total.", "Retrying failed requests on another origin vs. returning errors: retries hide outages from users, but replaying non-idempotent requests can duplicate side effects."],
    p: ["Both origins are declared unhealthy during a brief network blip and the customer is served errors although they were fine.", "A backup origin that has never taken traffic fails immediately under real load."],
    v: "Block the primary origin in a test, confirm requests move to the backup within the configured detection time with no unhandled errors for idempotent requests, then restore it and confirm traffic returns gradually without oscillation.",
    dep: ["origin-health-checks","origin-load-balancing","stale-if-error"]
  },
  "origin-health-checks": {
    s: "Probes origins on a schedule from many locations and learns from live traffic outcomes, to decide which origin servers are healthy enough to receive requests.",
    d: "Active checks request a configured path at an interval and expect a status and sometimes content. Passive signals count errors and slow responses from real requests. Checks run from several sites so one site's network problem does not mark an origin down for everyone, and results are combined by quorum. Thresholds for consecutive failures and recoveries damp noise. It is hard because probes add load multiplied by number of sites, they test one path rather than the real application, and different sites may disagree.",
    k: ["Checking from every site vs. a few: every site gives locally accurate decisions, but multiplies probe traffic on the origin, while fewer sites are cheap and miss regional problems.", "Active probes vs. passive observation: active detects problems with no traffic, passive reflects real user experience and needs request volume."],
    p: ["Hundreds of sites probing every few seconds become a noticeable load on a small origin.", "A health path that returns success while the database behind it is down keeps sending traffic to a broken origin."],
    v: "Break a dependency behind a test origin so its health path still returns success but real requests fail, and confirm passive signals mark it unhealthy within the window, while active probes alone would not.",
    dep: ["origin-timeouts-and-retries"]
  },
  "origin-timeouts-and-retries": {
    s: "Limits how long the edge waits to connect to, send to and read from an origin, and decides when a failed fetch is retried, so slow origins cannot hold resources indefinitely.",
    d: "Separate timeouts cover connection setup, time to first byte and gaps between bytes of a response, each tuned per customer. Retries apply to idempotent requests and connection-level failures, with limits and backoff to avoid retry storms, and respect a total deadline. Timeouts also bound request collapsing, so waiters are not held forever. It is hard because too short a timeout fails requests an origin would have completed, too long ties up memory and connections, and retries multiply load during an overload.",
    k: ["Short timeouts with retries vs. long timeouts without: short timeouts bound latency and route around slow servers, but add load when the origin is slow for everyone.", "Per-customer timeouts vs. platform defaults: customer values suit slow reports and uploads, but allow customers to hold resources for long periods."],
    p: ["Retrying every timeout during an origin overload triples traffic and deepens the outage.", "A long read timeout on slow uploads lets a few clients tie up many origin connections."],
    v: "Make a test origin delay its first byte past the timeout, and confirm the edge returns the configured gateway error at the deadline, retries at most the configured number of times, and total time stays within the stated bound.",
    dep: ["origin-connection-pooling"]
  },
  "origin-authentication": {
    s: "Proves to the origin that a request came from the network, by shared secret headers, client certificates or private connections, so the origin can refuse traffic that bypasses its protections.",
    d: "Origins want to accept requests only from the network, or attackers would bypass its security by calling the origin directly. Options include a secret header added by the edge, mutual TLS with a client certificate, a published list of source addresses to allow, and private interconnects. Credentials rotate on a schedule, with old and new accepted during the change. It is hard because shared address lists change, secrets leak, and rotation is operationally fiddly for customers with many origins.",
    k: ["Address allowlists vs. cryptographic credentials: allowlists need no origin software but cover all customers sharing the addresses, while client certificates identify one customer precisely and add setup effort.", "Platform-wide credentials vs. per-customer: per-customer limits damage from a leak but multiplies key management."],
    p: ["The origin trusts any request from the network's shared addresses, so another customer can reach it by pointing their own hostname at it.", "A secret header is logged by the origin and exposed to people who should not have it."],
    v: "Send a request directly to the origin and confirm it is refused, send one through the network and confirm it is accepted, then rotate the credential and confirm there is no failed request during the overlap.",
    dep: ["origin-connection-pooling"]
  },
  "upstream-protocol-selection": {
    s: "Chooses the protocol and encryption for each origin connection, such as HTTP/1.1, HTTP/2 or HTTP/3 and TLS verification modes, according to what the origin supports and the customer's settings.",
    d: "The edge can speak the same protocol as the client or a different one upstream. HTTP/2 multiplexes over fewer connections, while older origins only speak HTTP/1.1. Customers choose whether to use TLS to the origin and how strictly to validate its certificate. The edge forwards or reconstructs headers such as the original client address. It is hard because protocol translation loses features, strict certificate validation breaks self-signed origins, and defaults chosen for safety frustrate customers with legacy servers.",
    k: ["Full certificate validation vs. permissive: validation prevents interception between edge and origin, but fails on misconfigured or private-certificate origins customers expect to work.", "Matching client protocol upstream vs. fixed upstream protocol: matching preserves features like streaming, while a fixed protocol keeps pools simple and predictable."],
    p: ["Disabling certificate checks to make an origin work leaves traffic open to interception for years.", "Header translation between protocols drops or duplicates a header the origin relies on."],
    v: "Connect through the network to origins that speak each supported protocol and confirm the selected version matches settings, an origin with an invalid certificate is refused under strict mode, and forwarded client address headers are present.",
    dep: []
  },
  "anycast-prefix-design": {
    s: "The plan for which IP address ranges are announced from which sites, balancing one global address for simplicity against separate ranges for control, isolation and failure containment.",
    d: "In anycast, the same prefix is announced from many sites and each client's routing picks a site. Operators split address space into several prefixes: some announced everywhere, some only from regional or high-capacity sites, some reserved for specific customers or tiers, and some for attack diversion. Prefix length is limited by what the internet will accept, commonly no longer than a /24 for the largest block. It is hard because routing is chosen by others, so address allocation and announcement scope are the only levers, and scarce addresses must be used efficiently.",
    k: ["A few large global prefixes vs. many small scoped prefixes: global prefixes give maximum resilience and simplicity, while scoped prefixes allow isolating customers and shifting load without affecting others.", "Dedicated customer addresses vs. shared: dedicated addresses allow per-customer control and diversion, but consume scarce addresses."],
    p: ["A routing change on a shared prefix moves traffic for every customer when only one needed adjustment.", "Prefixes announced too narrowly get filtered by networks and become unreachable for part of the internet."],
    v: "From probes in fifty networks, query a test address and confirm each reaches the intended set of sites, and that withdrawing a regional prefix shifts only the traffic mapped to it.",
    dep: ["bgp-announcements"]
  },
  "bgp-announcements": {
    s: "The routing messages each site sends to its neighbors announcing which address prefixes it can reach, shaped with path prepending, communities and filters to steer incoming traffic.",
    d: "Each site peers with transit providers and exchange partners and announces prefixes, with attributes that influence neighbors' choices: making the path look longer, tagging communities that ask the neighbor to limit propagation, or announcing more specific prefixes. Inbound traffic follows the choices of every network along the way, so operators measure and adjust. Safeguards include filters to prevent leaking others' routes and origin validation. It is hard because effects are indirect and slow to converge, and one mistaken announcement can pull in global traffic or blackhole it.",
    k: ["Prepending and communities vs. more-specific announcements: prepending and communities are gentle and reversible, but not all networks honor them, while more-specific prefixes are decisive and blunt.", "Automated announcement changes vs. human-reviewed: automation reacts to failures in seconds, while review prevents mistakes that automation spreads at speed."],
    p: ["A route leak announces a prefix to the wrong neighbor and attracts traffic the site cannot carry.", "An announcement with a mistyped prefix hijacks or blackholes someone else's addresses."],
    v: "Change an announcement attribute in a test prefix and watch routing collectors and probe measurements, confirming the intended shift in traffic share within the expected convergence time and no unintended prefixes appearing.",
    dep: ["peering-and-transit","anycast-prefix-design"]
  },
  "bgp-withdrawal-and-failover": {
    s: "Removes a site's announcements to pull traffic away, either deliberately for maintenance or automatically when the site is unhealthy, so the internet routes users to the next closest site.",
    d: "A site drain withdraws prefixes, and neighbors re-converge on other paths within seconds to a few minutes, moving connections to other sites. Automatic withdrawal is triggered by health agents that detect the site's inability to serve and must act even when the site itself is impaired. Connections in flight are broken or drained depending on mechanism. It is hard because simultaneous withdrawals can overload the neighbors, a site that withdraws wrongly drops traffic, and health agents must not take down all sites together.",
    k: ["Automatic withdrawal on failure vs. alerting humans: automatic withdrawal minimizes user impact, but a faulty health signal can withdraw many sites, while human action is slower and safer.", "Withdrawing all prefixes vs. selected ones: all is clean for maintenance, while selected sheds only some load, keeping the site useful."],
    p: ["A health check failing everywhere withdraws every site and leaves no place to send traffic.", "Neighboring sites are overloaded by a withdrawal because their spare capacity was never checked."],
    v: "Drain a test site by withdrawal, measure how long until requests stop arriving there, confirm other sites absorb them without errors and that restoring the announcement returns traffic without a spike.",
    dep: ["bgp-announcements","pop-health-monitoring","load-shedding-between-pops"]
  },
  "dns-authoritative-servers": {
    s: "The globally distributed name servers that answer queries for customer hostnames, returning addresses of the CDN's sites, with high availability and fast answers.",
    d: "Authoritative servers run in many sites on anycast addresses and answer from in-memory zone data, with signing for security extensions if enabled. Customer hostnames typically alias to names the CDN controls, so the answer can be steered per query. Answers carry short lifetimes so changes take effect quickly. The servers are a top attack target because losing them takes down every customer. It is hard because they must be extremely available, handle large floods and keep data consistent across all sites.",
    k: ["Short answer lifetimes vs. long: short lifetimes make steering and failover effective, but raise query volume and expose users to resolver delays, while long lifetimes reduce load and slow traffic shifts.", "Dynamic answers computed per query vs. precomputed maps: dynamic answers react instantly, while precomputed maps are faster and easier to make resilient."],
    p: ["All name servers share one provider or address block, and an attack or error removes every customer at once.", "A signing key rollover error makes every validating resolver treat names as nonexistent."],
    v: "Query a hostname from multiple locations and record answers, and confirm availability stays above target during a simulated flood, and verify that a changed record is visible everywhere within its stated lifetime.",
    dep: ["anycast-prefix-design"]
  },
  "dns-request-steering": {
    s: "Chooses which site's addresses to return for each DNS query, using the requester's location, network, load and site health, so users are directed to a good place.",
    d: "On each query, the steering logic consults a map of resolvers to regions or sites, current site health and capacity, and customer policies, and returns addresses accordingly. Maps are computed centrally from measurements and distributed to authoritative servers, which answer with no per-query external calls. Steering can also change by customer, to isolate a customer or by product. It is hard because the DNS query shows only the resolver, not the user, resolvers cache answers, and maps must update fast during failures without destabilizing traffic.",
    k: ["Steering by measured performance vs. by geography: performance maps are more accurate and need continual measurement, while geography is simple, stable and wrong where networks do not follow distance.", "Frequent map changes vs. stable maps: frequent changes follow load closely, but cause cache churn and oscillation, while stable maps are predictable and slow to react."],
    p: ["A large resolver serves users on another continent and every one of them is sent to a distant site.", "Maps that update too eagerly send traffic back and forth between two sites as each overloads in turn."],
    v: "Query a steered hostname from resolvers in twenty regions and confirm each receives addresses of an intended nearby site, then take one site out of service and confirm answers exclude it within the answer lifetime.",
    dep: ["dns-authoritative-servers","geolocation-database","resolver-mapping","pop-health-monitoring"]
  },
  "geolocation-database": {
    s: "Maps IP addresses to country, region, network and approximate location, used for steering, access rules, analytics and regional content decisions.",
    d: "A database built from registry data, network measurements and commercial feeds associates each address range with a location and an autonomous system. It is loaded into memory on every server, in a compact trie, and updated regularly. Customers use it in rules to restrict or localize content, and the steering system uses it to pick sites. It is hard because ranges move and are reassigned constantly, accuracy varies by region and for mobile and satellite networks, and wrong answers carry legal and business consequences.",
    k: ["Frequent database updates vs. stable snapshots: frequent updates track address changes, but alter customer-visible behavior without a deployment, while snapshots are predictable and age.", "Country-level precision vs. city-level: country is more accurate and enough for legal rules, while city-level is tempting and often wrong."],
    p: ["Blocking a country by this data blocks legitimate users on mobile or satellite networks that are mapped elsewhere.", "A database update shifts a large address range to another country and silently changes which users see regional content."],
    v: "Look up a set of addresses with known true locations and confirm accuracy at country level meets the stated target, and confirm the updated database reaches every server and an address change shows consistently across sites.",
    dep: []
  },
  "resolver-mapping": {
    s: "Learns which users are served by which recursive resolvers and how those resolvers' queries relate to user locations, using client subnet information and measurement, to steer accurately.",
    d: "Because authoritative servers see the resolver's address and not the user's, the system builds a map from resolvers to user populations by measuring connections, and uses an optional client subnet extension when resolvers provide it. Large public resolvers span regions, so they are treated specially. The map is refreshed continuously from logs. It is hard because resolver behavior and user populations shift, privacy-focused resolvers hide subnets, and maps must be accurate at scale.",
    k: ["Using the client subnet extension vs. resolver location only: the extension gives accurate answers and reduces cache sharing across users, while resolver location is private and misleading for large resolvers.", "Measuring from live connections vs. active probing: live measurement reflects real users, while active probing finds problems with no traffic."],
    p: ["A public resolver changes how it routes queries and a region's users are mapped to the wrong site for days.", "Truncated client subnets in queries map users to a network they are not on."],
    v: "Compare the site chosen by resolver mapping with the site users actually connected to, measured by latency, over a week for the top one hundred resolvers, and confirm the mismatch rate stays below the stated threshold.",
    dep: ["geolocation-database"]
  },
  "traffic-engineering": {
    s: "Directs load across sites and links using measurements of latency, capacity and cost, shifting traffic to avoid congestion, balance cost and keep every site within its safe limits.",
    d: "Controllers read link utilization, site load, latency measurements and cost data, then adjust DNS maps, announcements and prefix scope to move traffic. They respect constraints such as per-site capacity, link commitments, and customer placement rules. Moves are bounded in size and rate so results can be observed. It is hard because actions are slow and coarse, measurements are noisy, interactions between steering mechanisms oscillate, and cost and performance often disagree.",
    k: ["Automated control loops vs. operator-driven changes: automated loops react quickly to congestion, but can oscillate and misjudge, while operators are safer and slower.", "Optimizing for latency vs. for cost: latency optimization serves users best, while cost optimization uses cheaper links and can add delay."],
    p: ["Two controllers shifting traffic in opposite directions cause a back-and-forth that overloads both sites alternately.", "A move sized from stale utilization data overloads the receiving link."],
    v: "Congest a test link, then confirm the controller shifts a bounded share of traffic away within its reaction time, link utilization falls below the threshold, and the shift never exceeds the receiving sites' headroom.",
    dep: ["dns-request-steering","bgp-announcements","peering-and-transit"]
  },
  "peering-and-transit": {
    s: "The network connections that link sites to the rest of the internet: direct peering with access networks, public exchange points and paid transit, balancing cost, capacity and reach.",
    d: "Direct interconnects with large access networks give short, cheap, high-capacity paths to their users. Exchange points let many networks connect over one port. Transit buys reach to everywhere else, at a price per volume or committed rate. Each interconnect has capacity, a cost model and a routing policy, and the mix defines both the cost of delivering a byte and the quality users get. It is hard because capacity must be planned months ahead, negotiations are commercial, and congested interconnects hurt silently.",
    k: ["Direct peering vs. transit: peering is cheaper at volume and gives better control, while transit is quick to start and covers everything without negotiation.", "Overprovisioning interconnects vs. running them hot: headroom handles surges and failures, while hot links save money and risk packet loss at peak."],
    p: ["A peering link runs near saturation for weeks, causing packet loss for one network's users and nobody notices because aggregate metrics look fine.", "A single transit provider carries so much traffic that its outage cuts off a large part of the internet."],
    v: "Track utilization and loss for each interconnect during daily peaks and confirm none exceeds its planned threshold, and test that removing the largest transit provider leaves enough capacity on the remaining links.",
    dep: ["pop-network-fabric"]
  },
  "load-shedding-between-pops": {
    s: "Moves traffic from an overloaded or degraded site to neighbors in a controlled way, by adjusting DNS answers, announcements or redirects, before the site fails.",
    d: "When a site's CPU, link or connection use passes a threshold, controllers reduce its share by returning fewer of its addresses in DNS, announcing prefixes with longer paths, or redirecting some requests. Receiving sites must have headroom, so shedding is planned per pair of sites. It protects the failing site from collapse. It is hard because the shed traffic arrives with cold caches at the receiving site, causing an origin miss spike, and shedding at the wrong rate can cascade overload across a region.",
    k: ["Shedding early at a low threshold vs. late: early shedding prevents collapse and wastes capacity, while late shedding uses resources fully and risks overload before it takes effect.", "Moving whole traffic classes vs. a percentage of everything: moving classes such as bulk downloads is predictable, while percentages are simple and treat all customers alike."],
    p: ["Shed traffic lands on a site that is also near its limit, spreading the overload to the whole region.", "The receiving sites' caches are cold for the shed content and the origin is flooded with misses."],
    v: "Push a test site above its shed threshold and confirm its share falls to the target within the reaction time, receiving sites stay below their limits, and origin request rates rise by less than the stated margin.",
    dep: ["traffic-engineering","dns-request-steering","pop-health-monitoring"]
  },
  "pop-tiers-and-hardware": {
    s: "The classes of sites and server types the network uses, from small sites at exchanges to large core sites, each with a hardware profile suited to its role.",
    d: "Edge sites near users have a few to dozens of servers with fast network ports and moderate storage, optimized for hits and low latency. Core or parent sites have denser servers with large disk capacity and more memory, absorbing misses. Some sites add specialized machines for encryption offload, compute, or attack filtering. Hardware choices balance cost per delivered gigabit, power density, and the facility's constraints. It is hard because sites are leased space with limits on power, cooling and remote help, and refresh cycles last years.",
    k: ["Many small sites vs. fewer large sites: many sites put content close to users and lower latency, while fewer larger sites have better hit ratios and lower cost per byte.", "Uniform server models vs. role-specific models: uniform hardware simplifies spares and operations, while role-specific machines suit storage-heavy or compute-heavy needs at the cost of variety."],
    p: ["A site's power budget limits how many servers fit and the planned capacity cannot be installed.", "Mixed hardware generations behave differently under the same software and complicate capacity estimates."],
    v: "Measure delivered throughput and hit latency per server model under a standard load, and confirm each tier's inventory meets its capacity plan within its power and space limits.",
    dep: ["pop-network-fabric"]
  },
  "pop-network-fabric": {
    s: "The switches and routers inside a site that connect servers to upstream links and to each other, usually a simple multi-path layout built for throughput and easy failure handling.",
    d: "A leaf and spine layout gives every server several equal-cost paths through the fabric, with edge routers connecting to transit and peers. Servers attach with multiple links, and the layout is the same at every site so automation can manage them. Routing inside the site uses a standard protocol with fast failure detection. It is hard because oversubscription and microbursts cause drops that dashboards hide, firmware updates must not take a site down, and small sites cannot afford redundancy that large ones take for granted.",
    k: ["Full redundancy in every site vs. only in large sites: redundancy survives device failures and costs hardware, while small sites accept some outages for lower cost.", "Routing to the server vs. layer-2 domains: routed designs scale and contain failures, while layer-2 designs are familiar and fragile at scale."],
    p: ["Microbursts overflow switch buffers and drop packets, but average utilization graphs look healthy.", "A firmware upgrade rolled to both fabric devices at once takes the whole site offline."],
    v: "Pull one spine switch and one uplink in a test site under load and confirm throughput drops by no more than the expected share, no connections are lost beyond the failure's flows, and routing reconverges within the target.",
    dep: []
  },
  "ecmp-and-l4-load-balancer": {
    s: "Spreads incoming connections across the cache servers in a site, using equal-cost routing and a layer-4 balancer that hashes packet headers and keeps connections on the same server.",
    d: "Routers split traffic across balancer instances by hashing the connection tuple, and balancers pick a backend server by hashing and track connections, or compute the same choice consistently, so packets of one connection reach one server. For datagram protocols, connection identifiers are included. Direct server return lets servers answer clients directly, avoiding the balancer on the return path. It is hard because backend changes must not break existing connections, balancers need synchronized state or deterministic hashing, and attacks aim at this layer.",
    k: ["Stateful connection tracking vs. stateless hashing: tracking keeps connections intact through backend changes, but needs memory and is a flood target, while stateless hashing resets some connections when backends change.", "Direct server return vs. proxying replies: direct return saves balancer capacity for large downloads, but complicates addressing and inspection."],
    p: ["A change in the backend set remaps a share of live connections, and those clients see resets.", "Asymmetric routing sends return packets around the balancer and breaks connection tracking."],
    v: "Open ten thousand long-lived connections, add and remove a backend server, and confirm only the connections on the removed server fail, new connections spread evenly across the set, and none are misrouted.",
    dep: ["pop-network-fabric","consistent-hashing-to-cache"]
  },
  "consistent-hashing-to-cache": {
    s: "Maps each cache key to a particular server inside a site using a hash scheme that moves only a small share of keys when servers change.",
    d: "Storing every object on every server wastes memory and disk, so a site partitions the key space. A tier of proxies or the balancer hashes the key and forwards the request to its owner server. Variants of the scheme place keys on a ring with virtual nodes or use rendezvous scoring so that adding a server moves about one in N keys. Weights account for different server capacities. It is hard because skewed keys overload owners, owners fail, and remapping causes miss spikes.",
    k: ["Hashing by key to one owner vs. random placement: hashing multiplies effective cache size by the number of servers, but concentrates hot objects and needs a forwarding hop.", "Ring with virtual nodes vs. rendezvous hashing: rings are fast and well known, while rendezvous has simpler balance and uniform failure spreading at higher compute per lookup."],
    p: ["A server failure moves its whole share of keys to neighbors, which see a sudden miss storm.", "Different hash seeds between balancer and servers send requests to servers that do not own the object."],
    v: "Add one server to a ten-server site and measure the share of keys that move, confirm it is close to one in eleven, with balanced load afterward and no more than the expected temporary dip in hit ratio.",
    dep: ["cache-key-construction"]
  },
  "connection-draining": {
    s: "Removes a server from service gracefully by stopping new connections while letting existing requests and downloads finish, so maintenance and restarts do not cut off users.",
    d: "A drain marks the server as unavailable to new traffic in the balancer, tells clients with long-lived connections to reconnect elsewhere using protocol-level goaway signals, and waits until connections finish or a deadline passes. Only then does the process restart. Automation drains one server or batch at a time and checks the site's remaining capacity first. It is hard because some connections last hours, such as streams and large downloads, and the deadline always cuts some off.",
    k: ["Waiting for all connections vs. a fixed deadline: waiting is gentle, but delays maintenance indefinitely, while a deadline guarantees progress and breaks stragglers.", "Draining one server at a time vs. in batches: single servers are safe and slow across thousands of machines, while batches speed rollouts and risk capacity dips."],
    p: ["A drain that begins when the site is near capacity pushes the remaining servers over their limits.", "Clients ignore the goaway signal and are cut off at the deadline in the middle of a download."],
    v: "Drain a server under load and confirm no new connections arrive, in-flight requests complete, the error count stays flat across the restart, and the server rejoins with no sustained remapping.",
    dep: ["ecmp-and-l4-load-balancer","consistent-hashing-to-cache"]
  },
  "cache-server-process": {
    s: "The server software that ties the pipeline together: accepting connections, running the rules, looking up the cache, fetching from upstream and sending responses on many cores.",
    d: "A multi-threaded or multi-process event-driven server owns the connection handling, request parsing, rule evaluation, cache lookup and upstream connections, with worker-per-core designs that avoid shared locks. Extensions such as edge code and security engines plug in at defined phases. It reloads configuration without dropping connections and exposes metrics and tracing. It is hard because every feature adds latency to every request, bugs affect all customers on the machine, and reload and upgrade paths must be seamless.",
    k: ["Shared-nothing workers per core vs. a shared cache between threads: shared-nothing avoids contention but duplicates some state, while shared structures save memory and need careful locking.", "In-process features vs. separate helper processes: in-process is fast, but a crash or leak in any module takes down the cache, while helpers isolate failures at the cost of messaging."],
    p: ["A crash in a rarely used module restarts the server and drops every connection on it.", "A slow synchronous call in a worker stalls all the connections that worker owns."],
    v: "Under mixed load, reload configuration and upgrade the binary, and confirm no connections are dropped and per-core CPU use is balanced within a few percent, with tail latency unchanged through both operations.",
    dep: ["cache-index","rule-engine","request-parsing-and-normalization"]
  },
  "server-provisioning": {
    s: "The automated process that takes a new or repaired machine from racked hardware to a serving member of a site, with identical software, configuration and credentials, with no hands on site.",
    d: "A server boots over the network, is identified by its hardware, receives a standard image and configuration, joins the site's balancer and fabric, and is checked before taking traffic. Secrets arrive only after the machine proves its identity. Repairs reimage rather than patch, so state is always known. Remote hands are used only for physical work. It is hard because sites are remote, vendors vary, and thousands of machines must converge on one configuration while staying updatable.",
    k: ["Reimaging for every change vs. in-place updates: reimaging gives known state and simpler reasoning, but takes servers out longer, while in-place updates are quick and drift.", "Immutable images vs. configuration management at runtime: images are reproducible and quick to start, while runtime configuration is flexible and can diverge between machines."],
    p: ["A machine joins with a stale image or missing setting and quietly serves slightly wrong behavior.", "A site's only remote-hands contractor is unavailable for a day, so a failed machine stays out."],
    v: "Provision a batch of servers from bare metal with no human steps and confirm all pass health checks, report identical image and configuration hashes, and carry production traffic in time.",
    dep: ["pop-tiers-and-hardware","cache-server-process"]
  },
  "shard-rebalancing": {
    s: "Moves cached data and request ownership between servers when a site's membership changes, limiting the miss spike and avoiding overloading any single server during the change.",
    d: "When servers join, leave or fail, ownership of key ranges shifts. Rebalancing strategies include letting new owners fill on demand, copying hot objects from the previous owner on first request, or pre-warming new servers from peers. Changes are throttled so only a portion of the site's keys move at a time. It is hard because transfers compete with live traffic, the previous owner may be dead, and the whole site's hit ratio can dip for hours after a big change.",
    k: ["Filling on demand vs. proactive copying: on-demand is simple and causes a burst of misses, while proactive copying keeps hits and uses bandwidth and complexity.", "Immediate remapping vs. gradual movement: immediate remapping restores balance quickly, while gradual movement limits the miss spike and leaves temporary imbalance."],
    p: ["A new server enters at full weight with an empty cache and its share of requests all miss at once.", "Pre-warm transfers saturate the site's links and slow the traffic they were meant to protect."],
    v: "Add a server to a loaded test site and measure hit ratio and origin request rate over the following hour, confirming the dip stays within the stated bound and recovers to baseline in the expected time.",
    dep: ["consistent-hashing-to-cache","tiered-caching-hierarchy"]
  },
});
