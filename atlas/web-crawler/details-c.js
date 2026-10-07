// Details for the web crawler plate, part 3: URL normalization and seen set, DNS and connections.
ATLAS.details("web-crawler", {
  "url-parser": {
    s: "Splits a URL string into scheme, host, port, path, query and fragment following the standard, and rejects or repairs the malformed ones found on real pages.",
    d: "Links on the web contain spaces, raw non-ASCII characters, backslashes, missing schemes, doubled slashes and control characters. The parser applies the standard's algorithm, which browsers also follow, so the crawler sees the same address a browser would. It resolves relative references against a base, converts internationalized host names to their ASCII form, and lowercases the host. It runs on every extracted link, so it is on the hot path. It is hard because parsers disagree on edge cases, and a disagreement means the crawler fetches a different URL than a user would.",
    k: ["Browser-compatible parsing vs strict standard parsing: browser-compatible recovers links real users can click; strict is predictable and drops sloppy but working links.", "One shared parser vs per-stage parsers: shared gives consistent identity across stages; per-stage is isolated and disagrees in subtle cases."],
    p: ["Two components parsing the same string differently produce two identities for one page and break dedup.", "Unbounded URL length lets a single page push megabytes of junk into the frontier."],
    v: "Run a shared conformance table of tricky inputs (backslashes, encoded dots, odd ports, internationalized hosts, relative forms). Confirm every output equals the reference parse and that all pipeline stages return identical results.",
    dep: []
  },
  "url-normalization": {
    s: "Rewrites URLs into a canonical form by lowercasing the host, removing default ports and dot segments, sorting query parameters and normalizing escapes, so equivalent spellings match.",
    d: "Normalization applies safe rewrites that never change which resource is addressed: case folding for scheme and host, removing default ports, resolving dot segments, uppercase percent-encoding, decoding unreserved characters and dropping the fragment. Further rewrites such as sorting parameters or removing a trailing slash are heuristics that can be wrong for some sites. The output is what gets hashed for the seen set. It is hard because the line between safe and heuristic is not obvious and wrong choices merge distinct pages.",
    k: ["Only safe rewrites vs aggressive heuristics: safe never merges distinct pages and leaves duplicates; aggressive removes more duplicates and sometimes merges different pages.", "Normalizing at intake vs also at fetch: intake gives one identity in the frontier; also at fetch repairs entries produced by older rules."],
    p: ["Removing a trailing slash on a site where the two forms differ makes one section unreachable.", "Case-folding the path breaks case-sensitive servers."],
    v: "Normalize a table of equivalent URL spellings and confirm they all produce one string. Normalize a table of near-miss pairs (different case in path, different parameter values) and confirm they stay distinct.",
    dep: ["url-parser"]
  },
  "query-parameter-rules": {
    s: "Per-site or global rules that drop, sort or collapse query parameters that do not change content, such as session identifiers and tracking tags.",
    d: "Known tracking and session parameters are removed from URLs, and the remaining parameters are sorted so order does not create duplicates. For hosts with many parameter combinations, rules are learned: a parameter whose values never change the page content, shown by comparing fingerprints of fetched variants, is marked ignorable for that host. It cuts a large share of duplicate URLs. It is hard because a parameter that looks like noise on one site selects the article on another, and a wrong rule makes whole sections vanish.",
    k: ["Global blocklist of parameter names vs learned per-host rules: a global list is cheap and wrong on some hosts; learned rules fit each host and take fetches to learn.", "Dropping a parameter vs keeping it but marking low priority: dropping saves queue space; keeping is safe when the rule is wrong."],
    p: ["Dropping a parameter named like an identifier when it actually selects the page makes all pages on the site one URL.", "Learned rules based on too few samples generalize wrongly."],
    v: "Crawl a test site whose pages differ by an id parameter and also carry a session parameter. Confirm session variants collapse to one URL while the id variants remain separate and all distinct pages are fetched.",
    dep: ["url-normalization","exact-content-hash","trap-heuristics"]
  },
  "canonical-link-hints": {
    s: "Reads the canonical URL a page declares, through a link element or header, and uses it as a signal for which of several duplicate addresses to keep.",
    d: "Pages can declare a preferred address. The crawler validates the claim, since it can be wrong or malicious: the declared URL must be on the same site, fetchable, and return similar content. If accepted, duplicates are grouped under the canonical form and their links and signals are merged. Pages with a bad declaration are treated as their own canonical. It cuts duplicates that no rewrite can detect. It is hard because many declarations are mistakes, such as every page claiming the home page, and following them blindly deletes real content.",
    k: ["Trust declared canonicals vs verify content similarity: trust is cheap and exposes the crawl to mistakes; verifying needs a fetch of the target and prevents mass merging.", "Treat as directive vs as a hint to weight: directive simplifies the pipeline; a hint keeps the duplicate available when the claim looks wrong."],
    p: ["A template that sets every page's canonical to the home page collapses an entire site.", "A canonical pointing to a URL that returns an error removes the live page from the corpus."],
    v: "Crawl test pages with a correct canonical, a canonical to an unrelated page and a canonical to a 404. Confirm the first merges duplicates and the other two are ignored, with each decision logged.",
    dep: ["html-parser","url-normalization","exact-content-hash","duplicate-cluster-store"]
  },
  "host-alias-detection": {
    s: "Finds hostnames that serve identical content, such as with and without a leading label or mirrors, so they share one identity and one crawl budget.",
    d: "Candidates are found by shared address, shared redirect targets and by comparing fingerprints of the same paths across two hosts. Once two hosts are judged aliases, URLs are rewritten to one preferred host, and the aliases' queues and budgets merge. It prevents fetching a site twice under two names. It is hard because identical addresses prove nothing in shared hosting, a false merge deletes a real site from the crawl, and aliases come and go.",
    k: ["Merge aliases aggressively vs conservatively: aggressive saves much duplicate crawling and risks merging distinct sites; conservative is safe and keeps duplicates.", "Sample-path comparison vs full-site comparison: sampling is cheap and can miss differences; full comparison is certain and costs a crawl of both."],
    p: ["Hosts on one shared address get merged because the first few pages returned the same default placeholder.", "An alias set formed during an outage is never undone when the sites separate."],
    v: "Set up two names serving the same site and one unrelated name on the same address. Confirm the crawler merges the first pair after sampling and leaves the third separate, and that merging is reversible.",
    dep: ["exact-content-hash","dns-cache","redirect-handling"]
  },
  "url-filters": {
    s: "A chain of cheap checks that reject URLs by scheme, length, file extension, blocklist and pattern before they consume queue and seen-set space.",
    d: "Filters run at link intake and again before dispatch. Typical rules reject non-web schemes, very long URLs, repeating path segments, extensions for formats the crawler does not process, addresses in private ranges and hosts on the blocklist. Rules are ordered with the cheapest and most selective first. It is hard because filters are the first line of defense against traps and abuse and also the easiest way to lose content by being too eager, and each rule needs a counter showing how much it removes.",
    k: ["Filter by extension vs by content type after fetch: extension saves a fetch and is unreliable; content type is accurate and costs the request.", "Fixed rule order vs optimized by hit rate: fixed is predictable; optimized saves CPU on a hot path and makes behavior harder to read."],
    p: ["An extension rule rejects dynamic pages that happen to end in a file-like suffix.", "A filter with no counters removes content for months before anyone notices."],
    v: "Pass a labeled list of accepted and rejected URL types through the chain. Confirm each is handled as labeled and that per-rule counters report how many URLs each rule removed in a day of crawling.",
    dep: ["url-parser","blocklist-and-opt-out"]
  },
  "url-fingerprint-hash": {
    s: "Reduces a normalized URL to a fixed-size hash used as its key in the seen set, the URL state table and routing, with host and path hashed so related URLs stay together.",
    d: "A 64-bit or 128-bit hash is computed from the normalized URL. A common design hashes the host and the path separately and concatenates the parts, so all URLs of one host share a prefix, which keeps a host's records adjacent on disk and makes partitioning by host a prefix operation. The hash must be stable across versions and machines. It is hard because the size sets the collision rate: a 64-bit hash has a visible collision count at tens of billions of URLs.",
    k: ["64-bit vs 128-bit fingerprint: 64-bit halves memory and has an expected collision rate that loses some URLs; 128-bit makes collisions negligible and doubles key space.", "Host-prefixed hash vs uniform hash: host-prefixed gives locality for per-host work; uniform spreads load evenly and loses locality."],
    p: ["Changing the hash function after launch makes every existing URL look new and triggers a full re-crawl.", "Hosts with millions of URLs make a host-prefixed key skew load onto one partition."],
    v: "Hash a corpus of one billion distinct normalized URLs and count collisions; confirm the count matches the expected figure for the width used. Confirm the same URL hashes identically on every worker and release.",
    dep: ["url-normalization"]
  },
  "bloom-filter-seen-set": {
    s: "A compact probabilistic set that answers whether a URL has probably been seen already, trading a small false-positive rate for a fraction of the memory.",
    d: "Each seen URL sets several bit positions chosen by hash functions; a lookup that finds all positions set says seen. It never forgets a member, so there are no false negatives, but some unseen URLs look seen and are skipped. A filter at one percent false positives needs about ten bits per URL, versus eight bytes or more for an exact key. Filters cannot delete and fill up, so large crawls use a series of filters sized in generations. It is hard because the false-positive rate rises as it fills and the lost pages are random, not chosen.",
    k: ["Bloom filter vs exact hash set: the filter uses an order of magnitude less memory and loses a small share of new URLs; an exact set loses none and needs disk or sharding.", "One large filter vs generations of filters: one is simple and degrades past capacity; generations bound the error and complicate lookups and expiry."],
    p: ["Letting a filter pass its designed capacity silently raises false positives, and coverage drops with no error raised.", "A filter that cannot remove entries keeps rejecting a URL after the page's content moved to a new valid location."],
    v: "Insert a known set of URLs and query a disjoint set. Confirm no inserted URL is reported unseen and that the measured false-positive rate on the disjoint set matches the design target at the current fill level.",
    dep: ["url-fingerprint-hash","exact-seen-url-store"]
  },
  "exact-seen-url-store": {
    s: "A disk-backed exact record of every known URL's fingerprint and state, consulted when the approximate filter says seen or when exactness matters.",
    d: "Often sorted, merge-based files or an embedded key-value store hold fingerprint to state records. Batches of newly discovered URLs are sorted and merged against the store in bulk, which turns random lookups into sequential reads. The store also backs the URL state table. It is correct where the filter is approximate and slower by orders of magnitude per lookup. The difficulty is throughput: billions of lookups a day must be batched, and the memory cache in front must exploit locality, such as recently seen popular URLs.",
    k: ["Per-URL random lookups vs batched merge: random is simple and slow on rotating disks; batched merge is fast and delays each URL's decision to the batch boundary.", "Check filter first, exact store on a hit vs exact store always: filter-first avoids most disk work; always exact is precise and costs far more I/O."],
    p: ["Batch merge latency delays discovery of new URLs by minutes to hours.", "Lookup hot spots on popular URLs overload a partition unless a cache absorbs them."],
    v: "Feed a mixed stream of known and new fingerprints at the production rate. Confirm decisions are exact, throughput meets the target, and the store's size and lookup latency match capacity estimates.",
    dep: ["url-fingerprint-hash","url-state-table"]
  },
  "dns-resolver": {
    s: "A resolver tuned for crawling that issues very large numbers of concurrent lookups, handles timeouts and retries, and returns addresses for hostnames.",
    d: "General system resolvers are too slow and too serialized for a crawler's rate of new hostnames. Crawlers run their own asynchronous resolver, with a pool of upstream recursive servers, many queries in flight and per-server rate limits. It follows alias chains, handles negative answers and treats timeouts separately from definitive non-existence. It is hard because each new host needs a lookup that can take seconds, lookups for one domain's name servers can be slow or lame, and heavy query load makes upstream servers drop or rate-limit the crawler.",
    k: ["Own recursive resolver vs shared upstream resolver: own gives control and scale and must be operated; shared is simple and can throttle you.", "Retry across several upstreams vs fail fast: retrying recovers from flaky servers and slows the lookup; failing fast keeps the pipeline moving and loses hosts."],
    p: ["Treating a timeout as 'does not exist' marks a reachable host dead.", "An upstream resolver that silently rate-limits makes every lookup slow without errors."],
    v: "Resolve a list of one million hostnames and measure queries per second, median and tail latency, and the share of timeouts. Compare results for known hosts against a reference and check negative and failure answers are distinct.",
    dep: ["dns-cache","timeouts-and-deadlines"]
  },
  "dns-cache": {
    s: "A cache of hostname to address results, honoring record lifetimes with a configurable floor, so repeated fetches from one host do not repeat lookups.",
    d: "Entries store addresses, expiry and failure state. Because a crawl visits a host many times in short bursts, even a modest cache cuts lookup load heavily. Crawlers often impose a minimum lifetime above the record's own value, since very short lifetimes would otherwise force a lookup per request. Negative results are cached briefly. It is hard because correctness depends on lifetimes: too long and a host that moved is hit at the old address, too short and the resolver is overloaded.",
    k: ["Honor record lifetime vs enforce a minimum: honoring is correct and costs lookups; a minimum cuts load and follows moves late.", "Cache per worker vs shared cache: per worker is fast and repeats lookups across workers; shared saves lookups and adds a network dependency."],
    p: ["Caching a failure for hours turns a brief outage at a site into a day-long gap in the crawl.", "Round-robin address records cached as the first one only concentrate all traffic on one server."],
    v: "Fetch many pages from one test host and count resolver queries; confirm it is close to one per lifetime window. Change the host's address and confirm the crawler follows within the configured floor.",
    dep: ["dns-resolver"]
  },
  "dns-prefetch": {
    s: "Starts lookups for hostnames while their URLs are still waiting in the frontier, so the address is ready when the URL is dispatched.",
    d: "As URLs are routed to a worker or approach the front of the frontier, their hosts are queued for resolution ahead of need. The cache is warmed in the order the scheduler will use. Without it, the first fetch for each new host waits for a lookup, which is a large share of latency in a crawl that reaches mostly new hosts. It is hard because prefetch for URLs that are never fetched wastes resolver capacity, and prefetching too early lets entries expire before use.",
    k: ["Prefetch only imminent hosts vs everything queued: imminent saves resolver capacity and may miss; everything is simple and wastes lookups on hosts that stay unfetched.", "Prefetch by host vs per URL: per host removes repeats; per URL is wasteful for sites with many URLs."],
    p: ["Prefetching a huge discovery batch floods the resolver and slows the lookups that were needed immediately.", "Entries expire before the URL is dispatched, so the lookup is repeated."],
    v: "Compare fetch start latency for first-time hosts with prefetch on and off. Confirm that with prefetch on, the share of fetches that wait on DNS is close to zero and total resolver load stays within its limit.",
    dep: ["dns-resolver","dns-cache","fetch-batch-dispatch"]
  },
  "connection-pool": {
    s: "Keeps open connections to hosts for reuse across requests, bounded by a per-host and global limit, to avoid repeated handshakes.",
    d: "After a response, the connection stays idle in the pool until reuse or timeout. A new URL for the same host and scheme takes an existing connection, saving a TCP handshake and a TLS negotiation. The pool honors server hints on idle time, closes connections the server closed, and evicts the least recently used when the global limit is reached. It is hard because a crawler visits each host slowly, so connections idle for the whole politeness delay and may be closed by the server before reuse, and file descriptors are limited.",
    k: ["Hold connections through the politeness delay vs reconnect each time: holding saves handshakes and ties up descriptors; reconnecting is simple and costs latency and CPU.", "Per-host pool vs shared pool with global cap: per-host is simple; global cap bounds descriptors and evicts across hosts."],
    p: ["Reusing a connection the server already closed produces a spurious error on the first request.", "Descriptor exhaustion from idle connections blocks new fetches across the whole worker."],
    v: "Fetch ten pages from one test host and count TCP connections in the server log. Confirm connections are reused where the server permits, and that stale ones are detected and replaced without a failed fetch.",
    dep: ["tls-and-http2","timeouts-and-deadlines"]
  },
  "tls-and-http2": {
    s: "The secure transport and protocol clients: TLS with session resumption, certificate validation policy, and HTTP/2 multiplexing where servers support it.",
    d: "Most of the web uses TLS, and handshakes are the main CPU cost of fetching. Session resumption cuts repeat handshake cost. Certificate validation policy is a decision: strict validation avoids fetching content from impostors, while a crawler often chooses to fetch pages with expired or mismatched certificates and record the fact. HTTP/2 lets many requests share one connection, which suits a crawler for large sites and conflicts with per-host concurrency limits. It is hard because server implementations are inconsistent and protocol negotiation fails in many ways.",
    k: ["Strict certificate checking vs fetch and flag: strict is safe and misses misconfigured but legitimate sites; fetch and flag collects more and trusts content less.", "HTTP/2 multiplexing vs one request per connection: multiplexing is efficient for large sites; per-connection requests fit politeness rules more simply."],
    p: ["Multiplexed streams count as one connection while sending dozens of simultaneous requests, which breaks a per-host concurrency limit.", "Fallback from a failed protocol negotiation retries forever on broken servers."],
    v: "Fetch from test servers speaking each protocol version, with valid, expired and mismatched certificates. Confirm negotiation, resumption and the certificate policy behave as configured, and that concurrent streams count against the host limit.",
    dep: ["connection-pool","host-concurrency-limits","timeouts-and-deadlines"]
  },
  "egress-ip-pool": {
    s: "The set of source addresses the crawler fetches from, kept stable, published and reverse-resolvable so sites can identify and allow it.",
    d: "Crawlers use a known range of addresses with reverse DNS naming that proves who they are. Sites can allow the range and check claims of identity. Fetch workers choose addresses so the load on any one site's view is consistent, and IPv4 and IPv6 each have separate considerations. Changing addresses breaks site allowlists. It is hard because a poor reputation on any address, for example from one bad worker, affects all fetches from it, and because rotating addresses to evade blocks is incompatible with identification.",
    k: ["Small stable address range vs large rotating pool: stable is allowlistable and easy to verify; rotating spreads load and defeats site-owner controls.", "Dedicated addresses per product vs shared: dedicated isolate reputation; shared use fewer addresses and let one bad actor harm all."],
    p: ["A new worker fleet using unannounced addresses is blocked by sites that allowlist the published range.", "Addresses missing reverse DNS cause identity checks to fail for the whole crawl."],
    v: "Fetch from each address in the pool and confirm the reverse and forward lookups agree and match the published list. Confirm a site that allowlists the published range accepts fetches from every pool address.",
    dep: ["crawler-identification","verification-and-contact-page"]
  },
  "timeouts-and-deadlines": {
    s: "The time limits applied to connecting, to the first byte, between bytes and over the whole request, so one slow server cannot hold a fetch slot indefinitely.",
    d: "A request has several clocks: DNS, connect, TLS, time to first byte, idle time between reads and an overall deadline. Each has its own limit, and the overall deadline is the backstop. Limits are tuned so slow but working sites still succeed, while tarpits, which deliberately send a byte a second, are cut off. The deadline starts when the lease is taken, so a lease expiry cannot occur mid-fetch. It is hard because slow hosts are common and legitimate, and every second a slot is held is capacity lost.",
    k: ["Tight limits vs generous limits: tight keep fetchers busy and drop slow but valid pages; generous keep more pages and let slow hosts occupy slots.", "Fixed limits vs per-host adaptive limits: fixed are simple; adaptive suit hosts with known latency and need history."],
    p: ["Only an idle timeout leaves slow-drip responses holding a slot for hours.", "A deadline longer than the lease duration lets the URL be reissued to a second worker mid-fetch."],
    v: "Fetch from a test server that delays connect, first byte, or drips data. Confirm each case is cut off by the intended limit and the fetch slot is freed by the overall deadline regardless.",
    dep: []
  },
});
