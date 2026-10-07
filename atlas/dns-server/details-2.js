// Details for the DNS server plate, part 2: resolution engine, cache, validation and poisoning defense.
ATLAS.details("dns-server", {
  "iterative-resolution": {
    s: "The loop that answers a query from nothing: ask a root server, follow each referral to the next zone's servers, and stop when a server returns the final answer or an error.",
    d: "For a name with no cached data, the resolver finds the closest known delegation, picks one of its servers, asks, and examines the reply. An answer ends the loop; a referral adds new servers and repeats; an error or timeout triggers another server. The loop is bounded by limits on depth, total queries and elapsed time, since one lookup can fan out into dozens of upstream queries when name servers themselves need resolving. It is hard because every step handles untrusted, sometimes hostile, replies.",
    k: ["Resolving fully inside the server vs delegating to a forwarder: full resolution gives independence and validation control; forwarding is simpler and shares the upstream's cache but trusts it entirely.", "Strict work limits per query vs unlimited effort: limits stop amplification of one query into floods upstream but can fail legitimately deep or slow lookups."],
    p: ["A delegation loop between two zones, if unbounded, burns resources on every attempt.", "Chasing every name server address in a large referral lets one client query multiply into hundreds of upstream queries."],
    v: "Resolve a name with an empty cache while capturing upstream traffic and confirm the sequence root, top-level, then domain servers, with total queries and elapsed time within the configured limits.",
    dep: ["root-hints-priming","delegation-and-glue","nameserver-selection","record-cache"]
  },
  "root-hints-priming": {
    s: "The built-in list of root server addresses used to bootstrap, plus the startup query that replaces that list with the current authoritative set.",
    d: "A resolver cannot find anything without a first server. It ships with a hints file naming the root servers and their addresses. At startup it sends a priming query for the root's own name server records, replaces the hints with the signed answer, and repeats when the data expires. It is hard because the hints file ages: addresses change rarely but they do change, and a resolver with an old file still works only because some entries remain valid.",
    k: ["Hints file refreshed with software updates vs from the network: shipping with releases is trustworthy but stale in long-lived deployments; network refresh stays current and depends on the first reply being valid.", "Validating the priming answer vs trusting it: validation prevents a rogue server from becoming the apparent root; skipping it is simpler but fatal if forged."],
    p: ["A resolver image built years ago still lists a retired address and slows every cold start.", "Failing to re-prime after expiry silently shrinks the set of usable roots."],
    v: "Start with an empty cache and capture the first packets to confirm a root name server query is sent, then confirm the cached root set matches the signed answer, including its TTL.",
    dep: ["iterative-resolution","dnssec-validator"]
  },
  "delegation-and-glue": {
    s: "Handling referrals that pass authority to child zones, including the glue addresses that are required when a name server's name lies inside the zone it serves.",
    d: "A referral lists NS records for the child and, when a name server is inside the child's own domain, address records as glue, since looking them up would require reaching that very zone. The resolver caches the delegation, uses glue only for that purpose, and tries to confirm it with the child's own data. It is hard because parent and child may disagree, because glue is unauthenticated, and because servers whose names are out of zone need extra lookups that can recurse deeply.",
    k: ["Trusting parent glue vs fetching addresses again from the child: parent glue is fast but unsigned and may be stale; re-fetching adds queries but gets authoritative addresses.", "Preferring the parent's NS set vs the child's: the parent's is what routing of queries follows; the child's is what the zone owner intends, so mismatches must be handled explicitly."],
    p: ["A circular dependency, where a zone's servers are named only inside the zone and no glue is configured, makes the zone unreachable.", "Accepting glue for names outside the delegated zone is a poisoning route."],
    v: "Resolve a zone whose name servers are in-zone and confirm the resolver uses the glue to reach it, then remove the glue in a test and confirm resolution fails with a server failure rather than hanging.",
    dep: ["referral-and-glue","bailiwick-checking","iterative-resolution"]
  },
  "cname-dname-chasing": {
    s: "Following alias records, where a name maps to a canonical name or a whole subtree maps to another suffix, restarting resolution at the target and returning the full chain.",
    d: "When an answer is an alias instead of the requested type, the resolver restarts at the target and appends the alias records to the final response. Subtree aliases synthesize an alias for each name beneath the source. Chains cross zones and may involve different servers, so each hop can need its own delegation walk and validation. It is hard to bound: loops must be detected, chain length capped, and the aliased target's TTLs combined sensibly.",
    k: ["Resolver follows the chain vs authoritative server follows it in-zone: resolver following is general; in-zone chasing saves round trips when both names are in one zone but only the owner can do it.", "Caching the chain as a unit vs per record: per-record caching reuses targets across aliases but needs reassembly for each reply."],
    p: ["An alias loop without a hop limit hangs or burns resources per query.", "Combining the alias TTL with a longer target TTL returns stale data after the alias changes."],
    v: "Create a three-link alias chain ending in an address record and confirm the response lists all alias records in order with the address, then add a loop and confirm a failure within the hop limit.",
    dep: ["iterative-resolution","record-cache"]
  },
  "nameserver-selection": {
    s: "Choosing which of a zone's name servers to ask, by measured response time, recent failures and some randomness, to find a good server fast and to spread load.",
    d: "The resolver keeps per-server state: smoothed round-trip time, timeouts and whether the server supports extensions. It prefers fast servers but still probes others so a recovered server is rediscovered, and falls back through the set on timeout. Both address families and transports may be tried. It is hard because estimates are noisy, anycast can change the nearest site mid-flight, and a single outage must not make a whole zone look unreachable.",
    k: ["Always the fastest vs weighted random: always-fastest minimizes latency but overloads one server and never relearns; weighted random spreads load and adapts at slight latency cost.", "Aggressive failover vs patient retry: failing over quickly hides one dead server; patience avoids amplifying load on a server that is merely slow."],
    p: ["Marking a server dead after one lost packet on a lossy path concentrates traffic on the rest.", "Never re-probing a server previously down leaves it unused even after it recovers."],
    v: "Make one of three servers drop all queries and confirm the resolver stops preferring it within a few lookups, then restore it and confirm it is used again within the probe interval.",
    dep: ["infrastructure-cache","udp-transport"]
  },
  "query-minimization": {
    s: "Sending each upstream server only the part of the name it needs to answer at its level, instead of the full name, to limit what intermediate servers learn.",
    d: "A root server only needs to know the top-level label to give a referral. With minimization, the resolver asks it for the top label, asks that zone for the next, and so on, revealing the full name only to the final server. It costs extra queries for deep names and misbehaves with servers that answer empty-nonterminal queries incorrectly. Many implementations fall back to the full name when responses look broken.",
    k: ["Strict minimization vs relaxed: strict gives the most privacy but triggers more round trips and failures with broken servers; relaxed sends more labels per query and tolerates them.", "Querying with NS type vs the final type: NS type matches the standard and keeps referrals clean; using the final type saves a query when the same server answers."],
    p: ["Servers that return NXDOMAIN for a name that only has descendants make minimized lookups appear to fail.", "Falling back too readily to the full name quietly removes the privacy benefit."],
    v: "Capture traffic while resolving a four-label name and confirm the root sees only the last label, each level sees one more label than the last, and only the final server sees the full name.",
    dep: ["iterative-resolution","privacy-exposure"]
  },
  "forwarders-and-stubs": {
    s: "Configuration that sends queries for chosen zones to specific servers instead of walking from the root: forward zones go to a resolver, stub zones to a zone's own name servers.",
    d: "Forwarding hands the query to another recursive server and uses its answer. Stub zones store only the NS and address records for a zone and use them as the starting point for normal resolution. Typical uses are internal domains, split infrastructure and shared upstream resolvers. It is hard because forwarding removes control over validation and transport security, adds a dependency, and creates loops when two servers forward to each other.",
    k: ["Forward everything to one upstream vs forward only selected zones: all-forward simplifies and benefits from a large shared cache; selective forwarding keeps independence for the public tree and hides internal names.", "Forwarding with validation by the upstream vs validating locally: trusting upstream is cheap but needs a secure link; local validation is stronger and needs signatures passed through."],
    p: ["Two resolvers forwarding to each other for a name that neither knows loop until timeout.", "A forwarder that strips signature records disables validation without any visible error."],
    v: "Configure a forward zone to a test server and confirm queries under it reach that server and others do not, then take the forwarder down and confirm the configured fallback behavior occurs.",
    dep: ["iterative-resolution","udp-transport","dns-over-tls"]
  },
  "request-coalescing": {
    s: "Combining identical in-flight queries from many clients into one upstream lookup, so a popular uncached name causes one fetch, not thousands.",
    d: "When a query arrives for a name already being resolved, the resolver attaches the client to the existing request instead of starting another. When the answer returns, all waiting clients are answered. This protects upstream servers during cache expiry of a hot name and during outages. It is difficult because one slow or failing request now blocks many clients, and because answers may differ by view, transport or client subnet, which must be part of the match key.",
    k: ["Coalesce by name, type and class vs also by view and options: the narrow key gives the best sharing; the wider key avoids returning one client's tailored answer to another.", "Wait for the single upstream result vs allow a second attempt after a delay: waiting minimizes upstream load; a second attempt avoids all clients stalling on one lost packet."],
    p: ["Coalescing across different views leaks an internal answer to an external client.", "A single failed lookup is replicated as a failure to every waiting client at once."],
    v: "Send 1,000 simultaneous queries for one uncached name and confirm exactly one upstream query leaves the resolver and all 1,000 clients receive the same answer.",
    dep: ["record-cache","iterative-resolution"]
  },
  "record-cache": {
    s: "The in-memory store of answers and delegations the resolver has learned, indexed by name, type and class, and returned to clients until their TTLs expire.",
    d: "Each cached entry holds a record set with an expiry time, a trust ranking for where it came from, and validation status. A lookup checks for an exact entry, then for aliases, then for the nearest delegation to start resolution. Entries of lower trust, such as glue, do not replace authoritative data. It is hard because it must be extremely fast under many threads, memory-bounded, and consistent: partial updates must never show a mix of old and new record sets.",
    k: ["Caching complete record sets vs individual records: sets match how DNS answers and signs data and avoid mixing; individual records give finer expiry but allow inconsistent combinations.", "One shared cache vs per-thread caches: shared caches give the best hit rate but contend on locks; per-thread caches are fast and duplicate data."],
    p: ["Letting additional-section data override an authoritative answer lets an attacker plant records.", "A cache sized for average load collapses its hit rate when a scan sweeps through many unique names."],
    v: "Query a name twice and confirm the second answer comes without an upstream query and has a remaining TTL lower than the first, then measure the hit rate on a replayed workload against the expected value.",
    dep: ["memory-management","ttl-handling","cache-eviction"]
  },
  "cache-eviction": {
    s: "The policy that discards cached entries when memory is full or entries expire, balancing hit rate against memory and protecting valuable data from one-off lookups.",
    d: "Entries expire by TTL, and when memory runs out the cache removes entries by recency, frequency or a blend, sometimes weighting by cost to refetch. Delegations and name server data are worth keeping since losing them slows many future lookups. Eviction runs on the query path or in the background. It is hard because workloads include scans of unique names that would flush everything useful under a naive policy.",
    k: ["Least recently used vs frequency-aware policy: recency is simple and adapts quickly; frequency-aware policies resist scans and keep popular names but need more state and tuning.", "Evict at insert time vs in a background sweep: insert-time keeps memory bounded exactly but adds latency to queries; sweeps keep queries fast but can overshoot memory."],
    p: ["A scan of random names evicts the hot set and drops the hit rate for everyone.", "Evicting infrastructure data first forces repeated walks from the root."],
    v: "Fill the cache to its limit with a flood of unique names while a hot name is queried every second, and confirm the hot name remains a cache hit and memory stays within the configured bound.",
    dep: ["record-cache","memory-management"]
  },
  "ttl-handling": {
    s: "How the cache turns a received TTL into an expiry time and what it returns to clients: counting down, clamping to minimum and maximum, and respecting zero.",
    d: "On receipt the resolver records the arrival time and clamps the TTL to configured bounds. When answering from cache it returns the remaining time, so clients never keep an answer longer than the original. Maximum clamps protect the cache from absurd values; minimums reduce load but override the owner. Records in one set should share a TTL. It is difficult because the effective behavior of downstream caches and applications also matters, and TTL zero means do not reuse at all.",
    k: ["Returning remaining TTL vs the original: remaining TTL keeps total staleness near the owner's intent; returning the original TTL on every hit stretches it through each layer.", "Raising short TTLs to a floor vs honoring them: a floor cuts load and hides churn; honoring them respects fast failover plans."],
    p: ["A minimum TTL clamp longer than the owner's plan keeps old addresses alive after a cutover.", "Returning the full TTL from cache makes downstream caches hold data beyond its life."],
    v: "Publish a record with TTL 30, query through the resolver at 0, 10 and 25 seconds, and confirm the returned TTLs count down accordingly and the record is refetched after 30 seconds.",
    dep: ["record-cache"]
  },
  "negative-cache": {
    s: "Remembering that a name or record type does not exist, using the SOA's minimum value, so repeated lookups for missing data are not forwarded upstream.",
    d: "A negative response, either the name does not exist or it exists without that type, carries the zone's SOA. The resolver caches the negative result for the smaller of the SOA's TTL and its minimum field, keyed by the exact name and type or, for a nonexistent name, the whole name. In signed zones, the denial proof can also let it answer other missing names. It is hard because the negative TTL is not controlled by whoever creates the record later.",
    k: ["Caching name-level NXDOMAIN vs per-type negatives: name-level caching answers every type with one entry; per-type caching is needed for names that exist with other data.", "Long negative TTL vs short: long reduces load from typos and scans but delays visibility of new names; short makes new records visible fast at higher query cost."],
    p: ["Creating a record right after a lookup failed leaves the name invisible until the negative TTL expires.", "Treating server failure as a cached negative answer extends an outage."],
    v: "Query a missing name, create it in the zone, query again before the negative TTL ends and confirm the cached NXDOMAIN is returned, then query after expiry and confirm the new record appears.",
    dep: ["record-cache","soa-and-negative-ttl","ttl-handling"]
  },
  "serve-stale": {
    s: "Returning an expired cached answer, with a short TTL, when fresh data cannot be fetched because upstream servers are failing, so names keep working through an outage.",
    d: "When an entry has expired and the refresh attempt times out or fails, the resolver may answer with the old record for a bounded extra period instead of an error, while continuing to try the refresh in the background. It turns an authoritative outage into degraded freshness, not failure for users. It is hard because staleness is unbounded unless capped, and serving a record that was deliberately removed, such as for security, is undesirable.",
    k: ["Serving stale on failure vs always refreshing first: stale-on-failure keeps clients working when upstream is down; refresh-first never serves old data and exposes every outage.", "Short answer TTL for stale data vs normal TTL: a short TTL makes clients retry soon and pick up recovery; a normal TTL reduces load but extends staleness."],
    p: ["A stale window of days serves addresses for decommissioned services.", "Serving stale during a poisoning cleanup keeps handing out the bad record."],
    v: "Block the authoritative server after caching a record, wait for its TTL to expire, and confirm queries still return the old answer with a low TTL until the stale limit, then an error after it.",
    dep: ["record-cache","ttl-handling"]
  },
  "prefetching": {
    s: "Refreshing popular cache entries shortly before they expire, so heavily used names never present a cache miss and its latency to clients.",
    d: "When a hit arrives for an entry near expiry, for example in its final ten percent of lifetime, the resolver answers from cache and starts a background refresh. Popular names stay hot; rarely used ones simply expire. It trades extra upstream queries for lower tail latency. It is hard to tune: refreshing too aggressively wastes queries on names that stop being used, and the refresh must not extend an answer past what the owner allows.",
    k: ["Prefetch on hit near expiry vs periodic refresh of top names: hit-triggered prefetch follows real demand; a periodic list is predictable but refreshes names nobody asks for.", "Large prefetch window vs small: a large window gives a margin for slow upstreams but causes more redundant fetches."],
    p: ["Prefetching names with very short TTLs multiplies upstream queries without much latency benefit.", "Prefetch storms occur when many popular entries were cached at the same moment and expire together."],
    v: "Query a name repeatedly across its TTL and confirm one upstream query happens near the end of the lifetime, with no client-visible cache miss latency spike when the original TTL passes.",
    dep: ["record-cache","ttl-handling","iterative-resolution"]
  },
  "infrastructure-cache": {
    s: "A separate cache of facts about servers, not names: their addresses, measured round-trip times, supported extensions and recent failures.",
    d: "Whenever the resolver talks to a name server it records latency, whether the answer arrived over UDP or needed TCP, support for extensions, and whether it timed out. Later server selection uses this to choose well and to avoid known-broken servers. Entries expire quickly enough to relearn. It is hard because the data is keyed by address and often shared across zones that use the same server, and a bad entry can cause many lookups to avoid a healthy server.",
    k: ["Remembering failures for a long time vs briefly: a long memory avoids repeated timeouts on dead servers; a short one recovers quickly when a server returns.", "Keying by server address vs by server name and zone: address keys are shared and compact; name keys allow zone-specific quirks to be remembered separately."],
    p: ["Marking an extension unsupported after a single dropped packet makes every later query slower or smaller.", "Latency estimates built from a congested moment pin the resolver to a worse server."],
    v: "Query through a path where a server drops extension queries and confirm the cache records the server as extension-unsupported, then confirm later queries to it omit the option and entries expire after the configured time.",
    dep: ["record-cache","nameserver-selection","edns-options"]
  },
  "aggressive-nsec-use": {
    s: "Using cached signed denial proofs to answer queries for many different nonexistent names without asking upstream, because each proof covers a whole range of names.",
    d: "A signed NSEC record proves that no names exist between two adjacent names. A validating resolver caches it and can immediately answer NXDOMAIN for any name that falls in that range, not only the one originally asked. This neutralizes random-subdomain floods against signed zones and reduces root queries for mistyped names. It requires validated data and works well with plain denial chains; hashed chains cover ranges of hashes and give less benefit.",
    k: ["Using ranges from signed denial vs caching only exact names: ranges deliver large load savings against random queries; exact-name caching is simpler and needs no signed data.", "Trusting cached proofs until TTL vs revalidating: trusting is fast; revalidating would remove the benefit entirely."],
    p: ["A signed zone with wide stale ranges answers NXDOMAIN for a newly created name inside the range until expiry.", "Expecting the technique to work for zones using hashed denial gives much less than anticipated."],
    v: "Query a nonexistent name in a signed zone, then a second different name in the same gap, and confirm the second is answered immediately from cache with no upstream query.",
    dep: ["negative-cache","denial-proof-checking","denial-chains"]
  },
  "dnssec-validator": {
    s: "The component that checks signatures on received records against keys it has authenticated through the chain of trust, and marks each answer secure, insecure or bogus.",
    d: "For a signed answer the validator fetches the zone's public keys and the parent's digest of them, verifies signature validity windows and cryptographic checks, and repeats up to a trust anchor. Results are cached. Secure answers carry a flag to clients, bogus answers become a server failure, and unsigned zones proven unsigned are insecure. It is hard because it multiplies upstream queries, uses CPU for signature checks, and failures are usually the zone owner's mistakes that users blame on the resolver.",
    k: ["Validating in the resolver vs in each client: resolver validation protects all clients with one cache; client validation is end to end but needs support everywhere and larger responses.", "Return failure for bogus data vs return it with a flag: failure is safe by default; flagging gives users the choice but most would ignore it."],
    p: ["An expired signature in a popular zone makes it unreachable for all validating resolvers at the same moment.", "Large algorithm sets in a response risk exceeding UDP limits and fall back to TCP."],
    v: "Resolve a correctly signed name and confirm the authenticated flag is set. Resolve a test name with an altered signature and confirm a server failure code is returned with a validation error logged.",
    dep: ["trust-anchor-management","denial-proof-checking","record-cache","clock-sync"]
  },
  "trust-anchor-management": {
    s: "Maintaining the starting keys the validator trusts, usually the root's, and updating them safely when those keys change.",
    d: "Validation needs at least one key or digest believed without proof. Resolvers ship with the root's current anchor and track changes using the automated update procedure: a new key is announced, observed for a hold-down period, then trusted. Private zones may add their own anchors. It is hard because a resolver that is offline during a key change can fall out of trust, and because a mistakenly added anchor is trusted absolutely.",
    k: ["Automated anchor updates vs manual updates: automatic tracking survives root rollovers without staff; manual control avoids surprises but fails if nobody acts.", "One anchor for the root vs anchors for specific zones: root-only is simple and covers all; extra anchors allow validation of private or unsigned-parent zones but need individual maintenance."],
    p: ["A resolver image shipped with an outdated anchor and offline for months cannot validate after a rollover.", "A stale extra anchor for a zone that rotated its keys causes validation failure only for that zone."],
    v: "Start from a state with only a stored anchor, simulate a root key rollover in a test hierarchy, and confirm the new key is added after the hold-down period and validation continues without intervention.",
    dep: ["dnssec-validator","clock-sync"]
  },
  "denial-proof-checking": {
    s: "Verifying the signed records that prove a name or type does not exist, so an attacker cannot forge a negative answer to block a legitimate name.",
    d: "A negative response carries signed denial records. The validator checks that the proof covers the queried name, handles wildcard and closest-encloser cases, and confirms that the type is absent at an existing name. With hashed denial it hashes the name with the zone's parameters and compares to the hash ranges. It is hard because the logic has many cases, the iteration counts can be costly, and bugs here break otherwise correct negative answers.",
    k: ["Limiting hash iteration counts vs honoring any value: limits protect against CPU exhaustion from zones with huge counts; honoring everything is complete but exploitable.", "Treating over-limit proofs as insecure vs bogus: insecure keeps the name resolvable; bogus is strict but breaks a zone for a configuration mistake."],
    p: ["Missing the wildcard case in the proof logic accepts forged denial or rejects valid denial.", "A zone with extreme hash iterations makes each negative answer an expensive validation for the resolver."],
    v: "Query a missing name, a name with data of another type and a name matching a wildcard in a signed test zone, and confirm each returns its correct status and the validator accepts each proof.",
    dep: ["dnssec-validator","denial-chains"]
  },
  "bailiwick-checking": {
    s: "Rejecting or demoting records in a response that are outside the zone the responding server is authoritative for, so a server cannot plant data for unrelated names.",
    d: "When a server for one zone returns extra records about another, the resolver compares each record's name to the zone cut it asked about. Records inside the zone are accepted at appropriate trust; others are discarded or used only for the current query, never cached as authoritative. This is the primary defense against a malicious or compromised server poisoning the cache with records for names it does not own. It is hard because glue is legitimately outside the child zone's data but inside the parent's authority.",
    k: ["Discard out-of-zone data vs cache with low trust: discarding is safe and may require extra lookups; low-trust caching saves queries and keeps a small risk of misuse.", "Strict scoping vs permissive for known partners: strict scoping is simple and uniform; exceptions solve compatibility but each one is an attack surface."],
    p: ["Accepting additional records for a sibling domain because the name server shares a parent allows poisoning.", "Over-strict checks drop legitimate glue and make some delegations unresolvable."],
    v: "Point a test authoritative server at a zone and have it return an extra address record for an unrelated domain, then confirm the resolver does not cache it and a later query for that domain goes upstream.",
    dep: ["record-cache","delegation-and-glue"]
  },
  "source-port-randomization": {
    s: "Sending each upstream query from an unpredictable source port, in addition to a random query ID, so a spoofing attacker must guess both values to inject an answer.",
    d: "A forged reply is accepted only if it matches the address, port, query ID and question. With a fixed port, the attacker guesses a 16-bit ID. A random port from tens of thousands adds about 16 more bits. The resolver therefore opens many sockets or rebinds per query. It is hard at scale because the OS must support many sockets, firewalls and NATs in the path may rewrite ports predictably, and port exhaustion under load can force reuse.",
    k: ["Many ephemeral sockets vs a few reused ones: many sockets give strong entropy at the cost of descriptors and overhead; reusing a few is cheap and easier to guess.", "Randomness from the OS vs a built-in generator: the OS source is well vetted; a built-in generator is faster and must be seeded and reviewed carefully."],
    p: ["A NAT in front of the resolver that maps ports sequentially removes all port entropy.", "A pseudo-random generator seeded from the clock gives predictable ports."],
    v: "Capture 10,000 upstream queries and confirm source ports are spread across the allowed range with no visible sequence, and test that a forged reply with the correct ID but a wrong port is ignored.",
    dep: ["socket-layer","case-randomization"]
  },
  "case-randomization": {
    s: "Randomly changing the upper and lower case of letters in the query name and requiring the reply to repeat the exact same pattern, which adds entropy against spoofing.",
    d: "DNS names are case-insensitive for matching but servers should echo the question as sent. The resolver sends a name like ExAmPlE and accepts only a response whose question has identical letter case, gaining roughly one bit per letter. It works only if authoritative servers preserve case, so resolvers track servers that do not and stop using the technique for them. It is hard because some servers and middleboxes normalize case.",
    k: ["Always randomize vs randomize only for supporting servers: always randomizing maximizes protection and breaks servers that normalize; selective use requires state tracking and lets non-supporting servers be spoofed more easily.", "Reject mismatches vs retry without randomization: rejecting is strict and safe; retrying keeps resolution working with weaker protection."],
    p: ["Middleboxes that lowercase names cause all queries to fail or to fall back to weaker protection.", "Short names provide little entropy, so it is not a replacement for other defenses."],
    v: "Capture upstream queries and confirm the name's case pattern varies per query, then use a test server that lowercases its reply and confirm the resolver rejects it or switches to the fallback behavior.",
    dep: ["source-port-randomization","message-header"]
  },
  "response-scrubbing": {
    s: "Cleaning received responses before caching: removing records that were not asked for or not allowed, fixing ordering and rejecting malformed structures.",
    d: "After parsing a response the resolver walks each section and keeps only what is justified by the query and the answering zone. Unrelated answer records are removed, alias chains are checked, and authority and additional data are filtered by scope. Only the cleaned data enters the cache. It is difficult because the rules depend on standards that have many edge cases, and because overly strict scrubbing breaks servers that send untidy but valid answers.",
    k: ["Strict scrubbing vs lenient: strict scrubbing removes poisoning avenues; lenient keeps compatibility with sloppy servers but leaves more material to exploit.", "Scrub before validation vs after: scrubbing first reduces what signature checks must process; validating first keeps data intact for the proof."],
    p: ["Scrubbing that removes required denial records breaks validation of negative answers.", "A parser accepting records outside the section's meaning lets crafted responses add cache entries."],
    v: "Feed the resolver a crafted reply with an unrelated extra answer record and confirm the record is absent from the cache and the client's reply, while the requested answer is delivered unchanged.",
    dep: ["bailiwick-checking","resource-record-format","record-cache"]
  },
  "negative-trust-anchors": {
    s: "A temporary exemption that makes the resolver treat one failing signed domain as unsigned, so users can reach it while its owner repairs a broken signature.",
    d: "When a zone's signatures break because of an operator mistake, validating resolvers fail all its names. An administrator adds a negative anchor for that zone and the resolver skips validation below it for a limited time, then checks again. It is a pragmatic override of security for availability. It is hard because it must expire or be removed, and during the exemption the zone is open to forgery.",
    k: ["Time-limited exemption that auto-expires vs permanent entry: auto-expiry prevents forgotten holes; permanent entries are simpler and become long-lived vulnerabilities.", "Exempting the whole zone vs specific names: whole-zone exemption fixes everything at once; per-name exemption limits risk but misses other broken names."],
    p: ["An exemption added during an incident and never removed leaves the zone unprotected for years.", "Adding it before confirming the failure is the zone's fault masks a real attack."],
    v: "Break a test zone's signatures, confirm the resolver returns failures, add the exemption and confirm answers return unvalidated, then wait for its expiry and confirm validation failures resume.",
    dep: ["dnssec-validator","trust-anchor-management"]
  },
});
