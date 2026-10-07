// Details for the web crawler plate, part 2: revisit, frontier, politeness and robots.
ATLAS.details("web-crawler", {
  "change-history-store": {
    s: "Keeps, for each URL, a compact record of past fetches: when, whether the content changed, validators and content hashes, which feeds change-rate estimation.",
    d: "Each fetch appends a small entry to the URL's history: time, status, content fingerprint, validator values and whether the page differed from last time. Older entries are summarized into counters to bound size. The revisit logic reads it to estimate how often a page changes. At billions of URLs even a few bytes per fetch add up to terabytes, so the format is tight. The hard part is that history is censored: you only learn a page changed at least once between visits, never how many times.",
    k: ["Full history per URL vs rolling summary: full history allows better models later; a summary of counts and recent entries fits memory and cannot be reinterpreted.", "Storing a hash vs the previous content: a hash is tiny and detects any change; storing content lets you measure how much changed at a large storage cost."],
    p: ["Dynamic fragments such as timestamps change the hash every visit, making a static page look like it changes constantly.", "History kept only on one worker is lost when the host moves to another."],
    v: "Fetch a test page repeatedly, altering it on a known schedule. Read the history record and confirm it shows a change at exactly those visits and none at the others, and that it survives moving the host to another worker.",
    dep: ["url-state-table","exact-content-hash"]
  },
  "change-rate-estimation": {
    s: "Estimates how often each page changes from its sparse visit history, using models that correct for the fact that several changes between visits look like one.",
    d: "A page is usually modeled as changing at random times at some rate. Observing only whether it changed since the last visit, the estimator uses the visit interval and the outcomes to infer the rate, with bias correction so frequently changing pages are not underestimated. Pages with little history borrow a prior from their host or content type. It is hard because estimates must be made from a handful of noisy observations per page, and the rate itself shifts with time of day, season and site redesigns.",
    k: ["Per-page estimate vs per-host or per-pattern prior: per-page is specific and noisy; priors are stable for new URLs and wrong for outliers.", "Simple moving average of observed changes vs censoring-aware estimator: the average is easy and biased low for fast pages; the estimator is more accurate and needs careful numerics."],
    p: ["Treating each visit with no change as proof of a low rate underestimates pages that change several times between slow visits.", "Priors from one site type applied to another misplace whole sections."],
    v: "Simulate pages with known change rates across a range, run the estimator over simulated visits, and plot estimated against true rates. Confirm the error is small and unbiased for fast pages as well as slow ones.",
    dep: ["change-history-store","host-quality-scoring"]
  },
  "revisit-scheduler": {
    s: "Chooses when each known URL should be fetched again, trading the value of fresh copies against fetch capacity.",
    d: "For each URL it combines estimated change rate, importance and the cost of a visit into a next-visit time, and it puts that URL into the frontier at that time. The usual result is not equal intervals: pages that change very fast are visited less than moderately fast ones when capacity is limited, because the visit would be stale again almost immediately. It runs continuously over billions of URLs, so it must be incremental. It is hard because the objective, which kind of staleness matters, is a product decision.",
    k: ["Visit as often as the page changes vs optimize for expected freshness: matching rate is intuitive and wasteful on very fast pages; optimization spends budget where it buys the most.", "Individual timers per URL vs bucketed time wheels: timers are precise; wheels are cheap at scale and round visits to bucket boundaries."],
    p: ["Maximizing average freshness ignores that a stale high-traffic page costs far more than a stale obscure one.", "A backlog after downtime releases all overdue URLs at once and floods the frontier."],
    v: "Over a week, compare each important page's actual age at the time of an index query with its target. Confirm the share of pages beyond target age is within the budgeted limit, and that overdue URLs drain smoothly after a pause.",
    dep: ["change-rate-estimation","front-queues","url-state-table","crawl-budget-accounting"]
  },
  "conditional-requests": {
    s: "Sends validators from the previous fetch so the server can answer that nothing changed, saving transfer and parse time on pages that rarely change.",
    d: "The crawler stores the entity tag and last-modified value from each response and sends them as conditional headers on revisits. A not-modified response costs a few hundred bytes and no parsing or storage, and the page is recorded as unchanged. Servers differ widely in whether they honor validators at all, so the crawler learns per host whether they work. It is hard because some servers return validators that change on every request, or answer not-modified incorrectly and hide real updates.",
    k: ["Trusting validators vs periodically forcing a full fetch: trusting saves the most bandwidth; periodic full fetches catch servers that wrongly say unchanged.", "Sending both validators vs only one: both maximize compatibility; sending one avoids conflicts with servers that mishandle the pair."],
    p: ["A server whose validators change on each response never returns not-modified, so the savings are zero while the code path adds complexity.", "A server that returns not-modified for pages that did change freezes them in the index."],
    v: "Revisit an unchanged test page and confirm a not-modified response with a near-empty body. Revisit a changed page and confirm a full response and an updated history entry. Check per host the validator success rate.",
    dep: ["request-builder","change-history-store","status-code-handling"]
  },
  "sitemap-lastmod-hints": {
    s: "Uses the last-modified dates in sitemaps and feeds as a hint to revisit only pages that claim to have changed, and learns how far each site can be trusted.",
    d: "On each sitemap read the crawler compares entries' dates with those recorded and queues pages whose date moved. Per host it tracks how often a claimed change turned out to be real and how often a real change went unclaimed, then weights the hint accordingly. Reliable sites get cheap, accurate refreshing. The hard part is that dates are generated by the site: many set them to the current time for every entry, others never update them.",
    k: ["Trusting the date vs ignoring it: trusting cuts revisit load sharply on reliable sites; ignoring is safe and forgoes the best free change signal.", "Per-host trust score vs global trust setting: per-host adapts to each site; global is simple and wrong for most of them."],
    p: ["Uniformly current dates for all entries make every URL look changed and the sitemap is re-fetched in full each time.", "Treating a missing date as unchanged leaves some pages never refreshed."],
    v: "For a sample of hosts, compare the share of pages with a moved date that truly changed on fetch against the share without a moved date that changed. Confirm the per-host trust scores track these two measured rates.",
    dep: ["sitemap-ingestion","change-history-store","revisit-scheduler"]
  },
  "change-significance-filter": {
    s: "Separates meaningful content changes from noise such as timestamps, counters and advertisements, so revisit and index updates react only to real change.",
    d: "After a changed fetch, the filter compares the main content of the new and old versions, ignoring boilerplate and known dynamic regions, and scores how much changed. Small changes are recorded but do not trigger downstream reprocessing or raise the revisit rate. It can use text diffs on extracted main content or similarity of fingerprints. It is hard because noise and signal look alike: a price edit is tiny and important, a rotating banner is large and meaningless.",
    k: ["Whole-page hash vs main-content similarity: the hash is exact and cheap and reacts to noise; similarity needs extraction and ignores trivial change.", "Fixed similarity threshold vs per-site learned threshold: fixed is easy; learned adapts to sites with noisy templates."],
    p: ["Ignoring small changes hides edits like a corrected price or a retraction that matter most.", "Ad rotation or a visit counter registers as change and keeps a static page at the highest revisit rate."],
    v: "Fetch a page twice with only an ad slot and a timestamp altered, then once with a one-line text correction. Confirm the first pair is classified as insignificant and the correction as a significant change.",
    dep: ["simhash-index","change-history-store","document-extractors"]
  },
  "front-queues": {
    s: "A set of queues, one per priority level, that receive scored URLs and feed the per-host queues in a biased-random order favoring higher priorities.",
    d: "URLs enter the front queue matching their score. A selector draws from a front queue, weighted toward higher priorities, and moves the URL to the back queue for its host. Keeping priority separate from host spacing lets the system rank globally without breaking politeness. The queues are large, mostly on disk, with in-memory heads. It is hard because strict priority starves low levels, and because the number of levels and their weights are tuning knobs with real effect on the corpus.",
    k: ["Strict priority vs weighted random selection: strict puts the best first and starves low priorities; weighted keeps some flow to every level.", "Few coarse levels vs many fine levels: coarse is cheap and loses ordering within a level; fine ordering costs memory and more queue management."],
    p: ["A new high-priority flood from one bad source empties every other level for hours.", "Moving URLs between levels on rescoring requires a delete that append-only queues do not support."],
    v: "Enqueue test URLs across all levels with a known weighting. Over a long run, confirm the share dequeued from each level matches the configured weights within a few percent and that the lowest level still drains.",
    dep: ["frontier-disk-spill","back-queues-per-host","url-priority-scoring"]
  },
  "back-queues-per-host": {
    s: "One queue per host, from which URLs are taken only when the host's politeness delay has passed, so requests to a host are spaced and ordered.",
    d: "Every host with pending URLs has a back queue, and each queue is assigned to at most one fetch thread at a time. After a fetch, the host gets a next-allowed time based on its delay, and the queue waits until then. A host's queue is refilled from the front queues when it empties. There are far more hosts than workers, so most queues are idle. It is hard because there can be hundreds of millions of hosts, so queue state is paged, and a host with one URL still occupies an entry.",
    k: ["One queue per host vs a pool of queues hashed from hosts: per-host is exact and heavy in memory; hashing is compact and lets one slow host delay unrelated hosts that share a queue.", "Keeping queues in memory vs paging idle ones: memory is fast; paging fits billions of hosts and adds latency when a host wakes."],
    p: ["Two threads working the same host break the delay and trigger blocking, usually after a restart or rebalance.", "A host with thousands of waiting URLs fills memory if its queue is unbounded."],
    v: "Crawl a test host with a ten-second delay and read the access log. Confirm every pair of requests is at least ten seconds apart, even after restarting the worker, and no two requests overlap.",
    dep: ["host-readiness-heap","crawl-delay-policy","front-queues"]
  },
  "host-readiness-heap": {
    s: "A time-ordered heap of hosts keyed by when each may next be contacted, so the scheduler finds ready work in logarithmic time.",
    d: "Each host with a non-empty back queue has an entry keyed by its next-allowed time. The scheduler pops the earliest, checks whether that time has passed and, if so, takes the next URL. After the fetch the host is reinserted with a later key. A heap avoids scanning hundreds of millions of hosts to find which are ready. It is hard because keys change when delays are adjusted by robots files or rate control, and because many threads contend on the heap at high rates.",
    k: ["Single global heap vs sharded heaps: global is exact and a contention point; sharded scales and may start a slightly later host first.", "Heap vs timing wheel: a heap is exact for any delay; a wheel is cheaper for huge counts and rounds times to its resolution."],
    p: ["A host's delay raised after robots parsing does not update its heap key, so it is fetched too soon.", "A stalled consumer holding a popped host removes it from the heap and it is forgotten."],
    v: "Load the heap with hosts of mixed delays and run the scheduler with a clock stub. Confirm hosts are released in key order, none before its time, and that changing a delay moves the host's release time.",
    dep: ["back-queues-per-host","crawl-delay-policy"]
  },
  "frontier-disk-spill": {
    s: "Moves most of the frontier to disk, keeping only the active heads of queues in memory, because the full queue is far larger than memory.",
    d: "The frontier at web scale is billions of URLs, so queues are written as sequential files in segments, with a small in-memory buffer at each head and tail. Reading consumes the head segment, writing appends to the tail segment, and completed segments are deleted. Sequential access keeps disk throughput high. It is hard because ordering changes such as rescoring or removing a blocked host need random access, which append-only segments do not give, so they are done lazily by dropping entries at dequeue.",
    k: ["Append-only segments vs a sorted on-disk index: segments are fast and simple; an index supports deletion and reprioritization at much higher write cost.", "Lazy filtering at dequeue vs rewriting segments: lazy is cheap and leaves dead entries in the queue; rewriting reclaims space with heavy I/O."],
    p: ["A blocklisted host's URLs stay on disk and consume read bandwidth long after the block.", "Crash during segment rollover loses or duplicates the entries in flight."],
    v: "Fill the frontier past memory size, then dequeue everything. Confirm no URL is lost or duplicated (compare counts and a set hash), memory stays at its cap, and a kill during rollover recovers to a consistent state.",
    dep: ["frontier-checkpointing","archive-file-store"]
  },
  "url-lease-and-ack": {
    s: "Hands out URLs to fetch workers as time-limited leases that must be acknowledged, so a crashed worker's URLs return to the queue instead of vanishing.",
    d: "When a worker takes a URL it is marked in-flight with an expiry. The worker acknowledges success or reports a failure class; unacknowledged leases time out and the URL is requeued. This gives at-least-once handling. Lease length is tuned to the longest normal fetch with its timeouts. It is hard because an expired lease can be reissued while the original worker is still fetching, producing duplicate fetches and a possible politeness violation, so downstream steps must tolerate repeats.",
    k: ["Short leases vs long leases: short recover quickly from crashes and risk duplicates on slow fetches; long avoid duplicates and delay recovery.", "Acknowledge per URL vs per batch: per URL is precise; per batch cuts overhead and re-queues a whole batch on a partial failure."],
    p: ["Leases shorter than the slowest legitimate fetch cause constant duplicate fetches of slow sites.", "Lease state held only in memory is lost on restart, and all in-flight URLs are silently dropped."],
    v: "Kill a fetch worker holding leased URLs. Confirm the URLs reappear in the queue after the lease expiry, are fetched once by another worker, and that no URL in the test set is lost.",
    dep: ["back-queues-per-host","fetch-worker","url-state-table"]
  },
  "fetch-batch-dispatch": {
    s: "Groups ready URLs into batches and hands them to fetch workers, keeping each worker's connections and queues busy without exceeding host limits.",
    d: "The dispatcher builds batches that contain at most one in-flight URL per host and, where possible, several different hosts, so a worker's parallel connections are all useful. Batch size balances overhead against latency to the next fetch. Workers pull batches when their pipelines have room. It is hard because a batch is composed before fetching, so any host that turns out slow holds its slot, and hosts that become ready during dispatch wait for the next batch.",
    k: ["Large batches vs small batches: large lower dispatch cost and let a slow host stall a batch; small keep fetchers busy and raise coordination traffic.", "Mixed hosts per batch vs batches per host: mixed keeps parallelism; per-host batches reuse one connection well and underuse the worker."],
    p: ["Batches that include several URLs for one host serialize behind its delay and idle the worker.", "A worker that disappears holding a large batch delays all its URLs until the lease expires."],
    v: "Run a worker with a mixed-speed test set and watch its in-flight count. Confirm connection slots stay near full, no batch holds two simultaneous requests to one host, and batch latency stays under its target.",
    dep: ["host-readiness-heap","url-lease-and-ack","fetch-worker"]
  },
  "crawl-delay-policy": {
    s: "Chooses the minimum gap between requests to each host, from the site's stated delay, a default floor and observed server behavior.",
    d: "The base delay is the larger of the crawler's default, the robots file's stated delay if any, and a delay proportional to the host's measured response time, commonly a multiple of it, so slow servers get fewer requests. Large sites are allowed more parallelism, small ones almost none. The result is stored per host and read by the readiness heap. It is hard because there is no standard definition of crawl-delay, sites state absurd values like hours, and a fair rate for a tiny server is not one for a large one.",
    k: ["Honor stated delay literally vs cap it: literal respects the site; a cap keeps the crawl useful when a site asks for one request a day.", "Delay by response time vs fixed delay: response-time delay protects slow servers automatically; fixed delay is predictable and ignores load."],
    p: ["A one-size delay leaves large sites underfetched for months and still overloads tiny ones.", "Delay stored only in memory resets on restart and the first requests come too fast."],
    v: "Serve a test host whose robots file asks for a 5 second delay and whose responses take 2 seconds. Confirm the measured gap in the access log is at least the larger of the two policy values.",
    dep: ["robots-cache","adaptive-rate-control","url-state-table"]
  },
  "adaptive-rate-control": {
    s: "Raises or lowers each host's request rate based on its response times and errors, backing off when the server shows strain.",
    d: "The controller watches latency, timeouts, 5xx responses and explicit throttling signals per host. Rising latency or errors cut the rate multiplicatively, healthy periods raise it slowly, similar to congestion control. A server's explicit back-off headers override the learned rate. It protects sites the crawler cannot see inside. It is hard because latency is noisy and depends on the page, and because errors from the site's own bugs are indistinguishable from overload caused by the crawler.",
    k: ["Multiplicative decrease with slow increase vs symmetric steps: asymmetric reacts to strain fast and recovers carefully; symmetric is simpler and oscillates.", "Per-host control vs per-IP control: per-host matches site policy; per-IP is needed where many hosts share one server."],
    p: ["Reacting to a single slow response throttles a healthy host for no reason.", "Never raising the rate after one bad day leaves the host crawled slowly for months."],
    v: "Make a test host slow down under load. Confirm the crawler's request rate drops within a few responses, holds while the host is slow, and climbs back gradually once latency returns to baseline.",
    dep: ["error-classification-metrics","timeouts-and-deadlines","per-ip-limits"]
  },
  "host-concurrency-limits": {
    s: "Caps simultaneous connections and in-flight requests per host, separately from the delay between requests.",
    d: "Most hosts get one request at a time. Larger sites and CDN-fronted ones can be allowed several, set from the host's observed capacity, the site's stated policy or the operator's agreement. The limit is enforced where URLs are leased, so it holds across workers. Hosts that share an address are limited together by the per-IP rule. It is hard because the number of safe parallel requests is unknowable from outside, and with several connections the spacing rule becomes a rate rather than a gap.",
    k: ["Conservative single connection vs graded concurrency by host size: single is safe and slow on large sites; graded is much faster and risks harming mid-sized servers.", "Limit enforced at the lease vs in the fetcher: at the lease holds across workers; in the fetcher is simpler and fails when a host moves workers."],
    p: ["Concurrency counted per worker instead of per host lets many workers combine to exceed the limit.", "Limits that ignore HTTP/2 multiplexing let one connection carry dozens of parallel streams."],
    v: "Crawl a test host with a limit of two while sampling server-side active connections. Confirm the peak never exceeds two even when the host's URLs are spread across several workers.",
    dep: ["back-queues-per-host","per-ip-limits","url-lease-and-ack"]
  },
  "per-ip-limits": {
    s: "Applies request-rate limits per server address, because many hostnames share one machine and the machine, not the name, is what is overloaded.",
    d: "After DNS resolution the crawler groups hostnames by address, or by network block for large providers, and applies a combined cap to each group. Shared hosting can put thousands of small sites behind one address; a crawl that is polite to each name can still overwhelm the server. The cap is lower for small shared servers and higher for large content networks, and can be learned from latency. It is hard because the mapping from hosts to machines changes, and the number behind a front-end address is invisible.",
    k: ["Per-address cap vs per-network-block cap: address is precise; block catches providers rotating addresses and holds back unrelated sites.", "Static limits by provider list vs learned limits: static is predictable and needs maintenance; learned adapts and can overshoot before it learns."],
    p: ["Ignoring shared hosting makes thousands of polite per-host crawls add up to an outage for one provider.", "Treating a large content network's address as a single small server throttles it far below what it handles."],
    v: "Place many test hostnames on one address and crawl all at once. Confirm combined request rate to that address stays below the per-IP cap while each hostname alone stays under its own.",
    dep: ["dns-cache","back-queues-per-host"]
  },
  "robots-fetcher": {
    s: "Fetches each host's robots file under its own rules for redirects, errors and size, and turns the HTTP outcome into an allow-all, disallow-all or parsed ruleset.",
    d: "Before any other URL on a host, its robots file is requested from the standard location, once per scheme and port as needed. A 2xx response is parsed; a 404 means no restrictions; a 5xx or network failure is treated as temporarily disallowing everything and retried; redirects are followed for a few hops. The file size is capped. It is hard because status handling decides whether the crawler stays polite: wrongly treating a server error as no rules is how sites get overrun.",
    k: ["Treat server errors as disallow-all vs allow-all: disallow-all is safe and delays crawling during outages; allow-all keeps the crawl moving and risks fetching what was forbidden.", "Fetch robots per host vs per host and port and scheme: per host is fewer requests; the full tuple matches how sites actually serve rules."],
    p: ["A transient 503 on the robots file cached as allow-all lets the crawler fetch disallowed areas for a day.", "Following many redirects from a robots request to an unrelated host applies foreign rules."],
    v: "Serve a test host with each outcome in turn: 200, 404, 503, a redirect chain and a huge file. Confirm the crawler's resulting rule set is as specified for each, and check no non-robots fetches happen during the 503 case.",
    dep: ["fetch-worker","redirect-handling","robots-parser","robots-cache"]
  },
  "robots-parser": {
    s: "Parses the robots file into per-agent groups of allow and disallow rules, tolerating the many malformed and nonstandard files seen in practice.",
    d: "The parser reads line by line, groups rules under the user-agent lines they follow, and extracts allow, disallow, crawl-delay and sitemap directives. It handles byte-order marks, comments, missing colons, unknown directives, and very long lines or files, by ignoring what it cannot understand and enforcing a size limit. Output is compiled for fast matching. It is hard because real files are full of errors and the standard leaves room for interpretation, so the safest behavior on ambiguity is the more restrictive one.",
    k: ["Strict parsing vs lenient parsing: strict rejects bad files and treats them as errors; lenient recovers intent from sloppy files and may read a typo as a rule.", "Parse at fetch time vs on use: at fetch time is fast to match and loses the original; on use keeps the raw text for debugging at higher CPU cost."],
    p: ["Treating a misspelled directive as a comment silently drops a rule the owner intended.", "Truncating a very large file at the limit can cut off a disallow rule that appears after it."],
    v: "Feed the parser a test suite of real-world-style files: bad encodings, mixed case, stray whitespace, missing agent line, oversized. Confirm the extracted rule set matches the reference expectations for each case.",
    dep: ["robots-fetcher","charset-detection"]
  },
  "robots-rule-matcher": {
    s: "Decides whether a given URL path is allowed under a ruleset, using longest-match precedence and wildcard and end-of-path patterns.",
    d: "The matcher selects the group that applies to the crawler's name, preferring the most specific agent token, then tests the URL's path and query against allow and disallow patterns. The longest matching pattern wins, and an allow beats a disallow when equally specific. Percent-encoding is normalized before comparing, and wildcards and end anchors are supported. It runs for every URL before dispatch, so it must be fast. It is hard because small differences, such as encoding of the path, change the answer.",
    k: ["Longest-match precedence vs first-match order: longest-match follows the published standard and gives consistent results; first-match is simpler and differs from many sites' expectations.", "Compiling rules into a trie or automaton vs scanning: compiled is fast for large rule sets; scanning is simple and slow on files with thousands of rules."],
    p: ["Comparing encoded and decoded forms inconsistently lets a disallowed path through by changing its escaping.", "Choosing a generic agent group when a specific one exists applies the wrong rules."],
    v: "Run a table of URL and ruleset pairs including wildcards, anchors, encoded characters and conflicting allow and disallow rules. Confirm every answer matches the published matching rules.",
    dep: ["robots-parser","url-normalization","crawler-identification"]
  },
  "robots-cache": {
    s: "Stores each host's compiled rules and delay with a bounded lifetime so robots files are fetched about once a day, not for every URL.",
    d: "Entries are keyed by host, scheme and port and hold the compiled rules, delay, fetch time and expiry. The standard guidance is to refresh at most daily, with shorter lifetimes after errors. The cache sits next to the matcher and is consulted for every dispatch; a miss triggers a robots fetch while that host's other URLs wait. It is hard because stale rules are a policy problem, not just a performance one: a site that adds a disallow expects it to be obeyed quickly, and at hundreds of millions of hosts the cache itself is large.",
    k: ["Long lifetime vs short lifetime: long saves fetches and is slow to honor new rules; short is more responsive and costs requests per host each cycle.", "Cache in each worker vs shared cache: per worker is fast and may differ between workers; shared is consistent and adds a network hop."],
    p: ["A cache lifetime measured in days leaves the crawler ignoring a site's new disallow rule.", "On a cache miss with many pending URLs, all of them trigger separate robots fetches."],
    v: "Change a test host's robots file to disallow a path. Confirm the crawler stops fetching that path within the configured cache lifetime, and measure robots requests per host per day to confirm they are bounded.",
    dep: ["robots-fetcher","robots-rule-matcher","host-partitioner"]
  },
});
