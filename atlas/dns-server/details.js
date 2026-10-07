// Details for the DNS server plate, part 1: cross-cutting concerns, operations, observability, abuse protection, views.
ATLAS.details("dns-server", {
  "ttl-and-staleness": {
    s: "Every record carries a time to live that tells caches how long the answer may be reused, so each change is only fully visible after the old TTL expires everywhere.",
    d: "Zone owners pick TTLs; resolvers may clamp them; stub resolvers and applications may cache again. The result is a chain of independent caches, none of which can be recalled. Short TTLs speed up change and failover but multiply query load and make the zone's own servers a dependency for every lookup. Long TTLs absorb outages and load but freeze mistakes in place. Negative answers have their own TTL derived from the zone's SOA, so a name created just after a failed lookup can stay invisible.",
    k: ["Short TTLs vs long TTLs: short ones allow fast failover and fast mistake recovery; long ones cut load and ride out upstream outages.", "Clamping TTLs in the resolver vs honoring them exactly: clamping protects the cache and reduces churn; honoring them respects operators who plan changes around the published value."],
    p: ["Lowering a TTL only on the day of a migration does nothing, because caches hold the old long TTL until it expires.", "Negative caching of a name just before it is created makes it appear broken for minutes to hours."],
    v: "Change a record with a 60 second TTL, query repeatedly through a resolver, and confirm the old answer's remaining TTL counts down and the new answer appears within 60 seconds and not before.",
    dep: []
  },
  "trust-and-authenticity": {
    s: "The decision about which data a server believes and from whom: transport source, delegation scope, shared secrets or signatures, each with a different strength.",
    d: "Plain DNS authenticates nothing; a resolver trusts a response because it came from the expected address and port with the right identifier and question. Layers add to that: scope checks that a server may only speak for its own zone, shared-secret signatures between servers, and public-key signatures that survive caching and third parties. Each layer closes some attacks and leaves others, and each costs deployment effort, response size and a key to manage. The hard part is that failure in one layer must not silently downgrade to trusting everything.",
    k: ["Validate everything vs validate opportunistically: strict validation breaks names with mistakes in their signatures; opportunistic validation leaves forged answers accepted.", "Hop-by-hop channel security vs end-to-end signatures: encrypted channels protect the link to a resolver only, while signatures protect data across caches but not privacy."],
    p: ["A validating resolver behind a forwarder that strips signatures silently returns unvalidated answers.", "Trusting the 'authenticated data' flag from an upstream over an unprotected link restores the forgery problem."],
    v: "Serve a deliberately altered answer from a test zone and confirm a validating resolver returns a failure while a non-validating one returns the forged data, showing exactly which layer caught it.",
    dep: []
  },
  "abuse-resistance": {
    s: "The set of decisions that keep the server from being used as a weapon against others or overwhelmed by its own clients: limits, source checks, minimal answers and capacity.",
    d: "Because most DNS traffic is unauthenticated datagrams with forgeable sources, a small query can produce a much larger response sent to a victim. Authoritative servers limit repeated identical answers; resolvers restrict who may use them; both prefer short responses. Floods of unique names bypass caches and hit the authoritative side directly. The trade-off is that every defense can punish legitimate users sharing an address or behind a large resolver, so thresholds, exemptions and observation must be designed together.",
    k: ["Silent drop vs truncated reply under limits: dropping is cheapest but gives legitimate clients no signal; truncating pushes real clients to TCP while denying spoofers the amplification.", "Per-source limits vs per-name limits: source limits stop single abusers but hit shared addresses; name limits stop floods of one target but not diffuse attacks."],
    p: ["Rate limits tuned on normal traffic throttle a big resolver's legitimate bursts and cause intermittent failures.", "An open recursive resolver left reachable from the internet becomes an amplifier within days."],
    v: "Send a spoofed-source burst of identical queries from a test host and confirm replies per second to the victim address stay under the configured cap, with the excess logged as dropped or truncated.",
    dep: []
  },
  "availability-and-redundancy": {
    s: "How many independent copies of the service exist, how they fail, and how clients and resolvers find a working one when others do not answer.",
    d: "A zone lists several name servers; resolvers try them and remember which respond. Redundancy can come from multiple servers, sites, networks, software implementations and even providers. Failures that look different, such as lost routes, bad zone data or expired signatures, need different mitigations, and correlated failure is common when every copy loads the same bad file. The design question is where to put independence: it costs coordination, and untested failover paths often fail on the day they are needed.",
    k: ["More name servers vs fewer well-run ones: extra servers raise resilience but also referral size, query fan-out and operational surface to keep consistent.", "Single provider with anycast vs multiple providers: one provider is simpler to run, while several survive that provider's outage at the price of record-sync complexity."],
    p: ["All name servers sharing one network, certificate or software build fail together.", "A bad zone push replicated to every site turns redundancy into simultaneous failure."],
    v: "Block each name server in turn at the network edge while querying through a fresh resolver and confirm every query still succeeds, with time to answer reported per blocked server.",
    dep: []
  },
  "privacy-exposure": {
    s: "What the query stream reveals about people and who can see it: on the network path, at the resolver, in logs and at each authoritative server.",
    d: "Every lookup names a site a person is about to visit. Plaintext transport exposes it to anyone on the path; a resolver sees every query tied to a client; authoritative servers see the resolver, and sometimes a client subnet. Mitigations attack different points: encryption for the path, name truncation toward upstream servers, anonymized or short-lived logs, and separating the client address from the query. None is free, since each reduces what operators can debug and defend with.",
    k: ["Encrypting the client link vs minimizing data upstream: encryption hides queries from the network but not from the resolver; minimization limits what upstream servers learn but not what the resolver sees.", "Keeping full logs vs aggregating early: full logs allow forensic and abuse work but become a sensitive store; aggregates protect users and lose detail."],
    p: ["Sending the client subnet upstream for better geolocation leaks the user's network to every authoritative server.", "Logs shipped to a shared analytics system outlive the retention promised to users."],
    v: "Capture traffic on the client and upstream links of a test resolver and confirm the client link is unreadable and upstream queries contain only the labels needed at each delegation step.",
    dep: []
  },
  "interoperability": {
    s: "The need to behave correctly with every other implementation of the protocol, including old and buggy ones, while staying strict enough not to spread their mistakes.",
    d: "DNS has hundreds of specifications and a long installed base. Servers meet middleboxes that drop large or unusual packets, authoritative servers that mishandle extensions, and zones with illegal data. Implementations must decide per quirk whether to work around, reject or report it. Extensions rely on graceful degradation: an unknown option must be ignored, not an error. The difficulty is that every workaround becomes permanent, because removing it breaks someone, while strictness gets blamed for outages that originate elsewhere.",
    k: ["Strict standards behavior vs permissive workarounds: strictness keeps the ecosystem healthy and simplifies code; workarounds keep users resolving names today at the cost of long-lived special cases.", "Adopting new features early vs waiting: early adoption exercises the protocol and unlocks benefits; waiting avoids breakage from peers that mishandle the new behavior."],
    p: ["A firewall that drops responses larger than 512 bytes makes only some names fail, which is hard to diagnose.", "Servers that reply with errors to unknown extension options break every client that sends them."],
    v: "Run a conformance suite of edge-case queries against the server and a set of third-party implementations and confirm the same response code and flags for each, listing every deliberate deviation.",
    dep: []
  },
  "zone-provisioning-api": {
    s: "The programmatic interface for creating, changing and deleting zones and records, with authentication, validation and idempotent operations so automation can drive the server.",
    d: "Operators and customer portals call an API that accepts record changes, checks them for syntax and policy, writes them to the zone store and triggers publication. Good ones batch changes into one atomic version, return a change identifier, and report when every server has the new serial. It is difficult because DNS data is global and slow to correct: an API that accepts a record at the apex or a delegation without validation can break an entire domain.",
    k: ["Record-level edits vs whole-zone replacement: record edits are convenient and fast but race with each other; whole-zone replacement is atomic and easy to audit but needs the full current state.", "Synchronous completion vs accepted-then-propagating: synchronous calls are simple for clients but slow and brittle; asynchronous ones need status polling to know when changes are live."],
    p: ["Two clients editing the same name concurrently silently overwrite each other without version checks.", "Treating an accepted call as published leads to tests that fail until secondaries catch up."],
    v: "Create a record through the API, then query each authoritative instance directly and confirm the new record and an incremented serial are returned by every instance, with the change identifier reported as complete.",
    dep: ["zone-change-control","in-memory-zone-store","notify-messages"]
  },
  "config-and-reload": {
    s: "How the server reads its settings and applies changes at runtime: zones to serve, listeners, limits and keys, with validation before the new version takes effect.",
    d: "Configuration declares listening addresses, zones and their sources, access lists, keys and limits. On a reload signal the server parses and validates the new file, builds the new state beside the old, then swaps it in without dropping queries. Errors must leave the running state untouched. It is hard because some parts, such as sockets and privileges, cannot be changed live, and because a large number of zones makes a full reload slow enough to cause latency spikes.",
    k: ["Full reload vs incremental per-zone reload: full reload gives a consistent snapshot; per-zone reload scales to thousands of zones and avoids pauses but allows mixed configuration versions.", "Declarative file vs runtime control channel: files are auditable and reproducible; a control channel enables immediate change but leaves running state that differs from the file."],
    p: ["A reload that fails halfway leaves some zones on the old settings and operators believing the new ones are live.", "Changes made through the control channel vanish at the next restart because they never reached the file."],
    v: "Introduce a syntax error in the file, trigger a reload, and confirm queries keep succeeding on the old state with the error logged. Fix the error, reload, and confirm the new setting takes effect without a dropped query.",
    dep: ["zone-loader","interface-binding"]
  },
  "catalog-zones": {
    s: "A special zone whose records list the other zones a secondary should serve, so adding a zone on the primary automatically adds it everywhere.",
    d: "The primary publishes a catalog zone containing one pointer record per member zone, plus properties such as which key or primary to use. Secondaries transfer the catalog like any zone, then create and remove member zones to match. This replaces editing a configuration file on every secondary. It is hard because it adds a second control plane inside the DNS itself: a bad catalog can delete hundreds of zones, and members need consistent identifiers across implementations.",
    k: ["Catalog-driven provisioning vs configuration management tooling: catalogs use the existing transfer path and need no extra system; tooling provides review and rollback that a zone transfer does not.", "Auto-removing members when listed entries vanish vs requiring explicit removal: automatic keeps copies exact but turns a catalog glitch into an outage."],
    p: ["A truncated or empty catalog transfer can instruct secondaries to drop every zone.", "Member identifiers that differ between implementations create duplicate or orphaned zones during a migration."],
    v: "Add a member entry in the catalog on the primary and confirm a secondary begins serving the zone with the right serial after one refresh cycle, then remove the entry and confirm it stops.",
    dep: ["axfr","primary-secondary-model","config-and-reload"]
  },
  "zone-change-control": {
    s: "The review, staging and rollback process around zone edits: who proposes, what is checked automatically, how a bad change is reverted and what record is kept.",
    d: "Changes are proposed as a diff against the current zone, linted for syntax and policy such as forbidden types or removal of delegation records, approved, applied, and recorded with author and reason. A good system can revert to a previous version in seconds and holds a history of every serial. The difficulty is that DNS errors are cached widely: reverting a bad record does not undo what resolvers already hold, so prevention matters more than correction.",
    k: ["Pre-publication checks vs post-publication monitoring: checks stop obvious errors before any cache sees them; monitoring catches semantic errors that no linter can know.", "Direct edits for speed vs review for every change: review catches mistakes in important zones but slows emergency changes, so many systems add a separate break-glass path."],
    p: ["Reverting a bad record leaves the old bad value cached for the full TTL.", "A break-glass path used routinely becomes the real process and skips all checks."],
    v: "Submit a change that removes the apex name server records and confirm the check rejects it. Then apply a valid change, roll it back, and confirm the previous serial's data is served again.",
    dep: ["in-memory-zone-store","change-journal"]
  },
  "delegation-monitoring": {
    s: "Continuous checks that the parent zone's delegation, the name servers it lists and their glue match what the child zone actually serves and that each listed server answers.",
    d: "A checker queries the parent for the name server and glue records, queries every listed server for the zone's own NS and SOA, and compares. It reports lame delegations (listed servers that do not answer for the zone), mismatched sets, serial drift and expired signatures. It is hard because the parent is controlled by someone else, changes there are slow, and a mismatch may be intentional during a migration.",
    k: ["Monitor from one vantage point vs many: one is simple and cheap; many exposes routing and anycast problems but multiplies the noise and the infrastructure.", "Alert on any mismatch vs only on failure to answer: strict alerts catch drift early but fire during planned moves, so teams tend to ignore them."],
    p: ["A name server removed from service but still listed at the parent causes intermittent failures only for resolvers that pick it.", "Checking only from inside the operator network misses delegations broken for the public."],
    v: "Stop answering for a zone on one listed server and confirm the monitor reports that server as lame within one probe interval and clears the report once service resumes.",
    dep: ["delegation-and-glue","synthetic-probes"]
  },
  "multi-provider-sync": {
    s: "Keeping the same zone content identical across independent hosting providers, usually by one acting as primary and others receiving transfers, or by pushing the same data to each API.",
    d: "To survive a provider failure, a zone is served by two or more independent operators. Content moves by standard transfers or by a controller that writes each provider's interface. Signing complicates it: either one party signs and others transfer signed data, or each signs with its own keys and the parent must trust all of them. The challenge is semantics that vary between providers, such as alias records, unusual types and TTL limits.",
    k: ["Transfer from one primary vs push to every provider: transfers are simple and standard but make the primary a single point; pushes are independent but need per-provider adapters and drift checks.", "Shared signing keys vs separate keys per provider: shared keys give one consistent chain but spread secrets; separate keys limit exposure but require multi-signer coordination."],
    p: ["Provider-specific proprietary record types do not transfer and create inconsistent answers.", "Serial or signature expiry differences between providers cause validators to fail only on some answers."],
    v: "Query the same names directly on each provider's servers and confirm identical record sets, serials and signature validity windows, then take one provider offline and confirm resolution continues.",
    dep: ["axfr","zone-provisioning-api","key-roles"]
  },
  "query-logging": {
    s: "Writing a record of each query and response, with time, client, name, type and result, for debugging, abuse investigation and analytics.",
    d: "The server emits a line or structured record per transaction, or a sample of them, to a file, socket or collector. Fields include source address, transport, question, response code, response size and flags, sometimes cache outcome and latency. At high rates the logging path competes with answering, so implementations buffer or use a separate thread, and may drop events under load. It is also the most privacy-sensitive output of the server.",
    k: ["Log every query vs sample: full logs allow exact investigation but cost throughput and storage; sampling reduces both and misses rare events.", "Logging at the server vs capturing packets in the network: server logs include internal state like cache hits; packet capture adds no server load but misses decrypted queries."],
    p: ["Synchronous logging to a slow disk adds latency to every answer and drops throughput under attack.", "Logs including client addresses kept indefinitely become a liability when subpoenaed or leaked."],
    v: "Send a known query from a test client and confirm exactly one record with the expected name, type, client, transport and response code appears, then flood the server and confirm drops are counted, not silent.",
    dep: ["worker-threading","log-anonymization"]
  },
  "log-anonymization": {
    s: "Transforming query logs so they cannot be tied back to individuals, by truncating addresses, hashing identifiers, removing names or aggregating before storage.",
    d: "The logging pipeline applies transforms before data leaves the server: truncate IPv4 and IPv6 addresses to a network prefix, drop or hash names that are not in a public list, replace client addresses with rotating pseudonyms, and keep counts instead of events. Each choice keeps some analytic value and loses some. It is difficult because names themselves can identify people, such as personal hostnames, and because combining remaining fields can re-identify them.",
    k: ["Address truncation vs keyed hashing: truncation is irreversible and simple but merges many users; keyed hashing preserves per-client counts but is reversible by anyone holding the key.", "Anonymize at the source vs at the collector: at the source nothing sensitive leaves the machine; at the collector one place applies policy consistently but sees raw data."],
    p: ["Hashing names without a secret salt is undone by hashing a list of common names.", "Rotating pseudonym keys too rarely allows long-term tracking; rotating too often breaks abuse detection."],
    v: "Generate queries from known clients for known and rare names and confirm the stored output has truncated addresses and no raw rare names, while an aggregate count per prefix still matches the number sent.",
    dep: ["query-logging"]
  },
  "runtime-metrics": {
    s: "Counters and histograms exported by the server: queries by type and transport, response codes, cache hit rate, latency, dropped packets and zone serials.",
    d: "The server maintains cheap per-thread counters and merges them on demand into a statistics endpoint or push stream. Useful series include queries per second, answers by rcode, truncated replies, validation outcomes, upstream timeouts, cache size and evictions, and per-zone serial and expiry time. The trick is cardinality: per-name or per-client labels explode storage, so metrics are kept at coarse granularity and detail is left to logs.",
    k: ["Per-thread counters merged on read vs shared atomics: per-thread counters avoid contention at high rates; shared ones are simpler and exact but slow under many cores.", "Rich labels vs coarse totals: labels allow slicing during incidents, but unbounded label values break the monitoring system itself."],
    p: ["Alerting on average latency hides tail latency that users actually experience.", "Unlabeled response-code totals mix expected NXDOMAIN with real failures and hide a rising error rate."],
    v: "Run a load test with a known mix of 10,000 queries, including 1,000 for nonexistent names, and confirm the exported counters match those totals within the reporting interval.",
    dep: ["worker-threading"]
  },
  "per-query-tracing": {
    s: "A debug mode that records each step of resolving a single query, such as servers contacted, answers received, cache hits and validation steps, for troubleshooting.",
    d: "An operator enables tracing for a name or client, and the resolver records the full path: which delegation was followed, which server was asked, the timing and response of each, validation results and the final answer. The output is a tree of upstream queries. It is hard because normal resolution is optimized for speed, so capturing detail may require running a slower path, and because the real cause is often an upstream behavior that only appears under specific conditions.",
    k: ["Always-on lightweight traces vs on-demand heavy traces: always-on captures rare failures but costs memory; on-demand costs nothing normally but misses the failure that already happened.", "Tracing live traffic vs replaying in a test resolver: live shows the true environment; replay is safe but may behave differently with a cold cache."],
    p: ["Tracing with a warm cache shows a short happy path that hides the failing upstream.", "Trace output includes client queries and must be treated as sensitive data."],
    v: "Enable tracing for a name whose authoritative server is deliberately blocked, query it, and confirm the trace lists the blocked server, the timeout, the fallback server and the final answer in order.",
    dep: ["iterative-resolution","query-logging"]
  },
  "passive-dns-analytics": {
    s: "Aggregating observed responses over time to learn which names resolve to what, how traffic is distributed and what looks anomalous, without storing client identity.",
    d: "Responses from the resolver or authoritative side are streamed to an analytics store as name, type, data and counts over time windows. Operators use it for abuse investigation, outage detection, capacity planning and spotting newly registered or algorithmically generated names. It is hard because the volume is large, the data is mostly noise, and sensible retention and sharing policies must be decided up front.",
    k: ["Streaming raw responses vs pre-aggregated summaries: raw data allows new questions later at high storage cost; summaries are cheap and private but fix the questions in advance.", "Collecting at resolvers vs at authoritative servers: resolvers see client behavior; authoritative servers see only their own zones but with less privacy exposure."],
    p: ["Treating a spike in NXDOMAIN as an attack when a new client application is misconfigured wastes incident time.", "Shared passive data can reveal customer lookup patterns to the recipient."],
    v: "Resolve a set of known names, then query the analytics store and confirm each name appears once with the correct data and a count equal to the number of resolutions in the window.",
    dep: ["query-logging","log-anonymization"]
  },
  "synthetic-probes": {
    s: "Automated test queries sent from outside the server at a fixed rate to measure whether names resolve correctly, how fast, and from where.",
    d: "Probes run from several networks, resolving known names with expected answers over each transport and checking record data, flags, signatures and latency. They exercise the full path including anycast routing and the delegation chain, not just the server process. The hard part is picking vantage points that represent real users, setting expectations for names whose answers vary by location, and distinguishing a probe failure from a service failure.",
    k: ["Probing each instance directly vs through the anycast address: direct probes find a single bad site; anycast probes show what users experience but hide which site failed.", "Frequent probes vs infrequent: frequent probes give fast detection but add load and noise; infrequent ones miss short outages."],
    p: ["Probes run from the same network as the servers pass while the public sees failures.", "A probe name that is cached by the resolver tests the cache, not the authoritative path."],
    v: "Break answers on one site by corrupting its zone and confirm the probe from the nearest vantage point reports a record mismatch within two probe intervals, naming the site.",
    dep: ["iterative-resolution","anycast-announcement"]
  },
  "response-rate-limiting": {
    s: "A server-side limit on how many identical responses go to one source network per second, truncating or dropping the excess so spoofed queries cannot be reflected at a victim.",
    d: "The server keeps a table keyed by client network prefix, requested name and response kind (answer, referral, error) with a token budget. Over the limit, most responses are dropped, but every Nth is replaced by a small truncated reply, so a real client behind a limited address can retry over TCP while a spoofed victim sees little traffic. Limits are tuned per response type. It is difficult because the table can be filled by attackers and because limits also affect large legitimate resolvers.",
    k: ["Drop some and truncate some vs drop all: slip responses give real clients a way through while still starving reflected floods; pure drops are simpler but can lock out legitimate users.", "Limiting by network prefix vs exact address: prefixes defeat attackers rotating addresses within a block; exact addresses reduce collateral damage to neighbors."],
    p: ["A limit set below the burst rate of a large resolver causes unpredictable name failures for its users.", "Exempting too many networks leaves a gap attackers can find by spoofing the exempt prefixes."],
    v: "Send 1,000 identical queries per second from a spoofed source and confirm the victim receives far fewer replies than sent, with some truncated, while a genuine client at normal rate still gets full answers.",
    dep: ["udp-transport","truncation-fallback","minimal-responses"]
  },
  "recursion-acl": {
    s: "A rule list that allows recursive resolution only for authorized clients, such as an organization's own networks, and refuses it for everyone else.",
    d: "Each query that asks for recursion is checked against allowed source prefixes, optionally with authentication for encrypted transports. Denied queries get a refusal and do not touch the cache. Authoritative-only servers disable recursion entirely, so a server cannot serve both open and closed roles by accident. It is hard because source addresses can be spoofed from inside the allowed range, and because mobile or shared networks change which addresses are legitimate.",
    k: ["Address-based access vs authenticated access: addresses are simple and work with any client; authentication follows users across networks but needs encrypted transport and credential management.", "Refuse with an error vs silently drop: errors help misconfigured clients diagnose the problem; drops give scanners nothing and lower reply volume."],
    p: ["A resolver bound to all interfaces with a broad allow list becomes an open resolver the day it is deployed on a public address.", "Allow lists that include a spoofable internal range let outsiders use the cache for poisoning attempts."],
    v: "Query for an external name from an allowed network and from a disallowed one and confirm the first returns an answer and the second returns a refusal with nothing added to the cache.",
    dep: ["interface-binding","rcodes-and-flags"]
  },
  "amplification-defense": {
    s: "Measures that prevent small spoofed queries from producing large responses toward a victim: filtering at the network edge, limiting response sizes and refusing unnecessary query types.",
    d: "Defense is layered: network operators drop packets with spoofed sources at the edge; the server limits large answers over UDP; it declines or shrinks responses to types that give large answers; and it uses cookies or TCP to confirm the sender when volume is high. The amplification factor is the ratio of response to request size, and defenders try to keep it near one. The difficulty is that signed zones and large record sets have legitimately large answers.",
    k: ["Fixed UDP size cap vs requestor-advertised size: a fixed cap bounds the worst case; honoring the advertised size gives efficient large answers but trusts a field the attacker controls.", "Refuse large-answer types vs serve them with validation: refusal removes the vector but breaks some legitimate uses; serving after a cookie check preserves compatibility."],
    p: ["Disabling spoofing filters at the network edge undermines every server-side control that follows.", "Answering ANY queries with full record sets gives attackers a 50x amplification at no cost."],
    v: "Send a 60 byte spoofed query for the largest record set in a zone and confirm the UDP reply is truncated or small, and that the amplification factor measured on the wire stays below the configured bound.",
    dep: ["response-rate-limiting","dns-cookies","udp-transport"]
  },
  "dns-cookies": {
    s: "A pair of short tokens exchanged in an EDNS option that lets a server confirm a client really owns its source address before giving it a large or expensive response.",
    d: "The client sends a random client cookie. The server returns it with a server cookie computed from the client address, the client cookie and a secret. On later queries the client repeats both, proving it received the previous reply. Servers can apply rate limits only to queries without a valid cookie and skip them for validated clients. It is hard because many clients do not support it, secrets must be shared across anycast instances and rotated, and cookies do not stop attackers on the real path.",
    k: ["Require cookies vs accept them optionally: requiring them removes spoofed traffic cleanly but breaks clients without support; optional use only lightens limits for those that have them.", "One secret across all anycast instances vs per-instance secrets: shared secrets let a client reuse cookies when routing shifts; separate secrets are simpler but force repeated round trips."],
    p: ["A secret that never rotates makes captured cookies reusable indefinitely.", "Instances with different secrets reject valid cookies after a routing change and look like a client bug."],
    v: "Send a query without a cookie and note the server cookie in the reply, then repeat with it and confirm the second query is treated as validated and exempt from the limit that applied to the first.",
    dep: ["edns-options","response-rate-limiting"]
  },
  "query-flood-filtering": {
    s: "Detecting and discarding high-volume or malformed query traffic early, before parsing and resolution, using packet filters, per-source budgets and shedding priorities.",
    d: "Filtering happens as low as the platform allows: network filters drop obviously invalid packets and known bad sources; the server then applies per-source and global budgets, parses cheaply, and prioritizes traffic from known good resolvers when overloaded. Under floods, answering some clients well beats answering all slowly. The challenge is telling attack traffic from a legitimate burst, such as a popular event, using only the packet.",
    k: ["Filter in the kernel or hardware vs in the server: early filters shed load at near line rate but have limited logic; in-server filters can reason about DNS content at a much lower rate.", "Prioritize known resolvers vs treat all equally: prioritizing keeps main traffic alive in an attack but can starve new legitimate sources."],
    p: ["Filters that drop packets with unusual but legal flags break real clients.", "Shedding load by dropping random packets hurts large resolvers the same as attackers."],
    v: "Replay a recorded flood at ten times normal rate alongside normal traffic and confirm the success rate and latency for the normal traffic stay within target while excess packets are counted as dropped.",
    dep: ["kernel-bypass-io","socket-layer"]
  },
  "minimal-responses": {
    s: "Returning only what was asked for, leaving out the optional additional and authority data, so replies stay small and cannot be abused for amplification.",
    d: "A response may carry extra records that save the client a follow-up, such as addresses for name servers. Minimal mode includes only the answer and the data required to be correct, such as referral glue or negative-answer proof. Replies shrink, which reduces amplification and helps UDP fit in one packet. The trade-off is more follow-up queries from clients and resolvers that expected the extra data.",
    k: ["Minimal replies vs helpful additional data: minimal is smaller and safer; extra data saves round trips but increases size and the chance of caching unrelated information.", "Per-zone setting vs global setting: per-zone allows exceptions for zones needing extra data; global is simpler to reason about and test."],
    p: ["Removing required glue from a referral makes the delegation unresolvable for resolvers that cannot look up the server name.", "Leaving out the negative proof in a signed zone's reply makes validation fail."],
    v: "Query a name and compare reply sizes with the option on and off. Confirm the on-reply contains only the answer, and that a delegation reply still contains the glue needed to follow it.",
    dep: ["referral-and-glue","resource-record-format"]
  },
  "random-subdomain-defense": {
    s: "Protection against floods of queries for random, nonexistent names under a target domain, which defeat caching and overload that domain's authoritative servers.",
    d: "An attacker asks open resolvers for random labels under a victim zone. Each is a unique cache miss that travels to the victim's servers, while the resolvers themselves also suffer. Defenses on resolvers include limiting recursive queries per zone, using aggressive negative caching from signed denial proofs, and detecting high rates of failed lookups under one parent. Authoritative operators absorb with capacity and response limits. It is hard because the queries look legitimate individually.",
    k: ["Per-zone recursive query limits vs no limits: limits protect the victim and the resolver but throttle real traffic during legitimate surges for that zone.", "Relying on signed denial caching vs fixed limits: signed denial caching serves most random names from cache with no tuning, but only helps signed zones."],
    p: ["Limits set per resolver instance are bypassed when the attacker spreads across many instances.", "Overly tight limits on a popular zone cause an outage identical to the attack."],
    v: "Run a flood of random names under a test zone through the resolver and confirm upstream queries to that zone's server stay under the configured cap while a legitimate name under the same zone still resolves.",
    dep: ["aggressive-nsec-use","negative-cache","recursion-acl"]
  },
  "split-horizon-views": {
    s: "Serving different answers or zone sets depending on who is asking, typically one view for internal clients and another for the public internet.",
    d: "The server picks a view for each query by source address, interface or key, then answers from that view's zones and policies. Inside, a name might resolve to a private address and include internal-only zones; outside, to a public address. Each view has its own zone copies, cache and settings. It is difficult because data must be kept consistent across views, a query matching the wrong view leaks internal names, and debugging requires reproducing the asker's identity.",
    k: ["Separate servers per audience vs views on one server: separate servers isolate failures and leaks; views reduce infrastructure but one bad match can expose internal data.", "Selecting views by source address vs by authenticated identity: addresses are simple and transparent; identity is robust for roaming users but needs authenticated transport."],
    p: ["A query from a VPN or proxy address landing in the wrong view returns private addresses to the public.", "Updating a record in one view and forgetting the other makes internal and external users see different truth."],
    v: "Query the same name from an internal and an external test client and confirm each gets the answer defined for its view, and confirm an internal-only zone name returns a refusal or negative answer externally.",
    dep: ["in-memory-zone-store","recursion-acl"]
  },
  "response-policy-zones": {
    s: "A rule set expressed as zone data that rewrites or blocks answers for chosen names or addresses, used to block malware domains or redirect to a notice page.",
    d: "The resolver loads a policy zone whose records match query names, answer addresses or name servers and specify an action: return NXDOMAIN, return no data, pass through, or substitute an address. Policy zones can be transferred from a feed provider like any zone, so updates arrive within minutes. It is difficult because blocking breaks signature validation for names that are signed, because the match step runs on every query, and because over-blocking has real user impact.",
    k: ["Rewriting answers vs returning an error: rewriting can show a block notice but breaks validation and secure connections; errors are honest but give users no explanation.", "Matching names only vs also matching answer addresses: address matching catches new names on bad infrastructure but needs inspection of every answer and risks collateral blocks on shared hosting."],
    p: ["A feed containing a popular domain by mistake blocks it for every user within minutes.", "Rewritten answers for signed names make validating clients fail rather than see the notice page."],
    v: "Add a test name to the policy zone, query it, and confirm the configured action occurs. Remove it, and confirm the real answer is returned after the policy zone updates.",
    dep: ["iterative-resolution","axfr","record-cache"]
  },
  "health-checked-records": {
    s: "Records that are included in or removed from answers according to live checks of the target, so a failed server stops being returned without anyone editing the zone.",
    d: "A checker probes each target by connection, request or custom test from several locations. The authoritative server consults the results when building a response: failing targets are withheld, falling back to a secondary target or the remaining healthy set. Because answers are computed per query, signing must be online. It is hard because checks are themselves unreliable and because caches keep returning a failed address for the TTL, so the TTL must be short enough to matter.",
    k: ["Probing from many locations vs one: many locations avoid a single bad vantage point declaring a healthy target dead; one is simpler and cheaper and sees only one network's view.", "Fail closed (remove target) vs fail open (keep all if all fail): removing all targets gives an empty answer; keeping them serves a degraded service rather than nothing."],
    p: ["A checker outage that marks every target unhealthy empties the answer for the whole service.", "A TTL of an hour makes health checking useless because clients keep using the dead address."],
    v: "Stop the service on one of two targets and confirm the failing address disappears from answers within the check interval, then restart it and confirm it returns after the configured number of passes.",
    dep: ["online-signing","synthetic-probes","authoritative-answering"]
  },
  "geo-and-weighted-answers": {
    s: "Choosing among several valid answers per query by the asker's approximate location, network or a probability weight, to steer traffic to nearby or less-loaded endpoints.",
    d: "The authoritative server maps the query source, or the client subnet if provided, to a region using a location database, then selects the record set configured for that region. Weights split traffic across endpoints in proportion. Because the resolver, not the user, is usually the source, accuracy depends on how close the resolver is to the user. Caches then hold a regional answer and may serve it to users elsewhere if not careful.",
    k: ["Using the resolver's address vs the client subnet: the resolver's address needs no extra data but misplaces users of distant resolvers; client subnet is more accurate but exposes user networks and fragments caches.", "Static weights vs load-aware weights: static weights are predictable and simple; load-aware ones track real capacity but need a feedback loop that can oscillate."],
    p: ["An outdated location database sends a whole region to a distant site.", "Weights changed during an incident take a full TTL to affect clients, so overload continues longer than expected."],
    v: "Query the same name from test clients in two regions and confirm each receives the region's configured endpoint. Over 10,000 queries confirm weighted answers split within a few percent of the configured ratio.",
    dep: ["client-subnet-handling","authoritative-answering"]
  },
  "apex-alias-flattening": {
    s: "Letting the zone root name point at another name by resolving that name on the server and returning its addresses, since a plain alias record is not allowed at the apex.",
    d: "The apex of a zone must hold SOA and NS records, and standards forbid an alias there. Flattening lets the operator configure a target name and the authoritative server looks it up regularly, returning the current addresses as ordinary address records. The result follows the target's changes and satisfies the rules. It is hard because the server becomes a resolver for a dependency, caches must be refreshed within TTL, and signing requires either online signing or frequent re-signing.",
    k: ["Resolve at query time vs refresh in the background: query time is always fresh but adds latency and a dependency on each lookup; background refresh is fast but can serve stale addresses.", "Return the target's TTL vs a fixed TTL: using the target's TTL stays accurate but exposes odd values; a fixed one is predictable but may be wrong."],
    p: ["The target becoming unresolvable leaves the apex with no addresses even though the zone itself is healthy.", "Geography-dependent targets give the authoritative server's own view of the target, not the client's."],
    v: "Point the apex at a name whose address you then change, and confirm the apex answer reflects the new address within the refresh interval and carries a valid signature if the zone is signed.",
    dep: ["authoritative-answering","iterative-resolution","online-signing"]
  },
  "client-subnet-handling": {
    s: "Deciding whether to pass part of the client's address to authoritative servers through an EDNS option so they can give location-appropriate answers, and keying the cache accordingly.",
    d: "A resolver may attach a truncated client prefix to upstream queries. The authoritative server returns an answer with a scope showing how much of the prefix mattered, and the resolver caches by that scope. This restores accurate location steering for users of remote resolvers. The cost is privacy, since upstream servers learn user networks, and cache efficiency, since one name now has many cache entries by prefix.",
    k: ["Sending the prefix vs hiding it: sending enables good steering; hiding preserves privacy and a high cache hit rate at the cost of less accurate answers.", "Truncating to a short prefix vs a long one: short prefixes leak less and cache better; long ones steer more precisely and fragment the cache."],
    p: ["Sending the option to every authoritative server leaks client networks to parties that do not use it.", "An authoritative server that ignores scope returns one answer cached under many prefixes and wastes memory."],
    v: "Query through the resolver from two client prefixes and confirm upstream queries carry the configured truncated prefix, and that the cache stores separate entries only when the reply scope is nonzero.",
    dep: ["edns-options","record-cache"]
  },
  "local-overrides": {
    s: "Administrator-defined answers that take precedence over the real DNS for chosen names: internal hostnames, blocked names, test redirects and reverse lookups for private ranges.",
    d: "The resolver holds local data, either as individual records or as whole zones that it treats as authoritative, and consults them before cache or upstream. Typical uses are a lab network's names, a development override and empty answers for private reverse ranges so queries do not leak to the internet. It is hard because overrides are invisible to users and other servers, and they remain after the reason is forgotten.",
    k: ["Override as a local zone vs as a single record: a zone defines the whole subtree and avoids leaking queries; single records leave other names under the same parent resolving externally.", "Override in the resolver vs on a client's hosts file: resolver overrides serve everyone consistently; client files are isolated but drift between machines."],
    p: ["An old override for a migrated service sends users to a decommissioned address long after the cutover.", "Overriding a signed name without disabling validation for it makes validating clients reject the answer."],
    v: "Define an override for a name that also exists publicly, query through the resolver, and confirm the local value is returned and that no query for it appears in upstream traffic captures.",
    dep: ["record-cache","dnssec-validator"]
  },
});
