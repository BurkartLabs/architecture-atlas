// Details for the web crawler plate, part 1: seeds & discovery, prioritization & scheduling.
ATLAS.details("web-crawler", {
  "seed-lists": {
    s: "The initial set of URLs or hosts a crawl starts from, chosen to reach as much of the target web as possible in few hops.",
    d: "Seeds come from earlier crawls, curated directories, popular-site rankings and operator lists. A good seed set is wide, covering many unrelated hosts, so the link graph fans out quickly instead of spending the first days inside one cluster. Each seed is normalized and enters the frontier at a high priority. The difficulty is bias: the crawl can only reach what the seeds connect to, so a narrow or stale list silently shapes what the whole corpus contains.",
    k: ["Curated seeds vs seeds from the previous crawl: curated lists are cleaner and controllable; old crawl output is far larger but inherits its coverage gaps and dead hosts.", "Few high-quality seeds vs many seeds: few seeds start fast and are easy to audit; many seeds shorten the path to the long tail but admit spam early."],
    p: ["A seed list dominated by one language or region yields a corpus that is skewed in the same way and nobody notices until coverage is measured.", "Seeds that redirect, or have died, burn early budget on errors."],
    v: "After one day of crawling from the seed list, count distinct hosts reached and the share of pages by top-level domain and language. Compare against the target distribution and confirm no cluster holds more than the expected share.",
    dep: ["url-normalization","front-queues"]
  },
  "sitemap-ingestion": {
    s: "Reads sitemap files that sites publish, including index files that point to other sitemaps, to learn URLs, last-modified dates and hints without following links.",
    d: "Sitemaps are located through the robots file or conventional paths, fetched like any other resource, then parsed as XML, plain text or feed formats, often compressed. An index sitemap lists child sitemaps, which are fetched recursively. Entries feed URLs to the frontier and last-modified values to the revisit logic. Hard parts: files with tens of thousands of entries, malformed XML, URLs that belong to a different host than the sitemap (which must be rejected unless the owner proves control), and sitemaps that list junk.",
    k: ["Trusting sitemap URLs as high priority vs treating them as ordinary discoveries: trust finds deep pages quickly; it lets a careless or hostile site flood the frontier.", "Streaming parse vs loading the file whole: streaming survives huge files with bounded memory; it cannot validate the whole document before using the first entries."],
    p: ["Cross-host entries accepted without a check let one site direct the crawler at another site's pages.", "Last-modified values that always equal today make every URL look changed and defeat revisit planning."],
    v: "Point the crawler at a test site whose sitemap index lists three child files, one compressed and one with a bad entry. Confirm every valid URL enters the frontier, the bad entry is logged and skipped, and cross-host entries are dropped.",
    dep: ["robots-parser","fetch-worker","front-queues","sitemap-lastmod-hints"]
  },
  "feed-and-ping-polling": {
    s: "Watches syndication feeds and receives change notifications to learn about new pages within minutes, long before link-following or sitemap rereads would.",
    d: "Feeds are polled on a schedule that adapts to how often each one actually produces new entries. Some sites also push pings or webhooks announcing changed URLs, which are validated and queued. New entries become high-priority URLs with a freshness hint. It is hard because polling cost scales with the number of feeds, not new items; the poll interval must balance staleness against load, and push channels need protection against spoofed notifications.",
    k: ["Fixed poll interval vs adaptive interval per feed: fixed is simple and predictable; adaptive saves most requests but needs per-feed history and can lag after a burst.", "Accepting push notifications as truth vs just as a hint to fetch: truth is fastest; a hint costs one fetch but cannot be abused to inject content."],
    p: ["Polling thousands of dead feeds at a fixed rate wastes fetch budget that discovery needs.", "Unauthenticated ping endpoints get used to make the crawler hit arbitrary third-party URLs."],
    v: "Publish a new entry to a monitored test feed and measure the time until its URL is fetched. Confirm it falls inside the target latency, and that a feed unchanged for a week is polled less often than an active one.",
    dep: ["fetch-worker","front-queues","change-rate-estimation","host-concurrency-limits"]
  },
  "url-submission-api": {
    s: "An endpoint through which site owners or other systems hand URLs to the crawler directly, subject to authentication, rate limits and validation.",
    d: "Submissions are accepted over an authenticated interface, checked for syntax, scope and blocklist status, then enqueued with a priority tied to who submitted them. Per-submitter quotas stop one client from consuming the crawl. The response tells the caller whether the URL was new, already known or refused, so callers do not resubmit. It is hard because it is an unauthenticated-by-nature input to a system that fetches arbitrary addresses: it must refuse internal addresses and avoid becoming a way to aim traffic at a victim.",
    k: ["Immediate priority for submitted URLs vs ordinary scoring: immediate priority rewards the submitter and fits freshness needs; it invites abuse unless quotas are strict.", "Synchronous fetch-on-submit vs queue-and-return: synchronous gives instant feedback; queueing protects politeness limits and keeps the API fast."],
    p: ["Accepting URLs that resolve to private network addresses lets callers probe internal services through the crawler.", "No per-submitter quota allows one script to push millions of low-value URLs."],
    v: "Submit a public URL, a duplicate, a blocklisted host and an address resolving to a private range. Confirm the first is queued, the duplicate reported as known, and the last two refused with distinct reasons.",
    dep: ["url-normalization","blocklist-and-opt-out","url-filters","front-queues"]
  },
  "domain-list-ingestion": {
    s: "Imports lists of registered domain names from registries and zone data so whole hosts can be discovered even when no page links to them.",
    d: "Zone files, registration feeds and passive name data provide names of newly created and existing domains. The ingester diffs each list against the known set, adds each new domain's root page and conventional paths as seeds, and records provenance. It finds the new sites that link-following reaches last. The difficulty is volume and quality: a large share of newly registered names are parked, spam or never serve content, so they should enter at low priority until a first fetch shows they are real.",
    k: ["Crawl every new domain vs sample and score: crawling all gives full coverage; scoring first saves budget but delays good sites.", "Bulk import vs incremental diffs: bulk is simple; diffs keep the frontier from refilling with names already known."],
    p: ["Parked domains returning the same placeholder page for thousands of names flood the corpus with duplicates.", "Lists with unusual internationalized names break if conversion to ASCII form is skipped."],
    v: "Ingest a list containing known live, parked and non-resolving domains. Confirm each live domain gets its root fetched within the expected window, parked ones are flagged after first fetch, and non-resolving ones are retried on a decaying schedule.",
    dep: ["dns-resolver","host-quality-scoring","url-normalization","front-queues"]
  },
  "discovered-link-intake": {
    s: "Receives the outlinks extracted from fetched pages, normalizes and filters them, and sends the survivors on to the seen-set check and the frontier.",
    d: "A fetched page may contain hundreds of links. The intake canonicalizes each one, applies scope and filter rules, hashes it for the seen-set lookup, and attaches context for scoring: the source page, anchor text and depth. Links for hosts owned by another worker are routed over the network in batches. Hard because link volume is the main load on the frontier and the seen set, so every rule that cuts links early saves work downstream, but a rule that cuts too much loses coverage.",
    k: ["Filtering links before vs after the seen-set check: before saves lookups; after keeps one place for the rules and gives cleaner counters.", "Per-link messages vs batches: per-link is simple and fresh; batches cut network overhead several-fold but delay discovery slightly."],
    p: ["Links from a page inside a trap multiply into the frontier faster than they can be rejected.", "Dropping the source page and anchor context removes the signals scoring needs."],
    v: "Fetch a test page with known links, including duplicates, off-scope and fragment-only ones. Confirm exactly the expected set reaches the frontier, each with source and anchor attached, and that counts match the extractor's output.",
    dep: ["link-extractor","url-normalization","url-filters","bloom-filter-seen-set","cross-worker-url-routing"]
  },
  "index-feedback-urls": {
    s: "Uses signals from the search index and its users, such as popular queries, clicked results and missing pages, to nominate URLs to crawl or refresh.",
    d: "The index side reports which known URLs are heavily queried, which link targets appear in the link graph but were never fetched, and which pages produced complaints or stale results. These nominations enter the frontier with a boost. It closes the loop between what users need and what the crawler fetches. The hard part is feedback bias: boosting what is already popular starves new content, and the signals arrive in a different system with a different notion of identity for pages.",
    k: ["Boosting popular pages vs exploring unknown ones: boosting keeps visible results fresh; exploration finds new popular pages before they are known.", "Pulling signals in batches vs streaming them: batches are simpler and cheap; streaming reacts to breaking events within minutes."],
    p: ["Mapping index document identities to crawler URL keys incorrectly sends boosts to the wrong pages.", "A popularity feedback loop fills the budget with already-fresh pages and lets the long tail go stale."],
    v: "Mark a known URL as heavily queried in the index and confirm its revisit interval shortens at the next scheduling cycle. Mark a linked-but-unfetched URL missing and confirm it is fetched within the target window.",
    dep: ["link-graph-store","url-priority-scoring","revisit-scheduler","url-state-table"]
  },
  "url-priority-scoring": {
    s: "Assigns each URL a numeric priority from signals such as source importance, depth, host quality, anchor text and past change rate, deciding what is fetched first.",
    d: "Scores combine cheap features available before fetching: where the link was found, how many sources point to it, how deep it is, how good the host looks, and predicted freshness need. The score selects the front queue the URL enters. Scores are recomputed as new evidence arrives, such as another inlink. The hard part is that the scorer sees only what is known before the page is fetched, so it is always a prediction, and its errors decide what the corpus never contains.",
    k: ["Hand-tuned weights vs learned model: hand-tuned is explainable and stable; learned adapts to the corpus but needs labeled outcomes and drifts.", "Rescoring continuously vs at enqueue only: continuous keeps order accurate; enqueue-only is cheap and leaves old queue entries ranked by stale evidence."],
    p: ["Heavy weight on inlink counts lets link farms push junk to the top of the queue.", "Scores never updated after enqueue leave old, hopeless URLs ahead of newly valuable ones."],
    v: "Take a sample of URLs and fetch them regardless of score. Plot score against later outcomes such as page usefulness and duplication, and confirm higher score bands have clearly higher useful-page rates.",
    dep: ["importance-propagation","host-quality-scoring","front-queues","focused-crawl-classifier"]
  },
  "importance-propagation": {
    s: "Estimates page importance from the link graph, passing score along links in rounds, so URLs pointed to by important pages are crawled sooner.",
    d: "An incremental importance estimate runs on the discovered link graph, either in periodic batch iterations or as running credit that each fetched page distributes to its outlinks. Newly found URLs inherit part of their parents' score before any content is seen. It is cheap relative to a full ranking pass and approximates what the index will later compute. It is hard because the graph is incomplete and changes as the crawl runs, and early estimates are noisy and biased toward whatever was fetched first.",
    k: ["Batch iterations over the whole graph vs incremental credit passing: batch is accurate and simple to reason about; incremental is continuous and cheap but drifts.", "Per-page vs per-host importance: per-page is precise and expensive; per-host is small enough to keep in memory and loses within-site differences."],
    p: ["Crawl order itself shapes the estimate, so early-fetched sites look more important than they are.", "Pages with huge outlink counts dilute their credit so far that good targets get nothing."],
    v: "Crawl a synthetic graph with a known hub-and-spoke shape. Confirm the hub's targets receive higher priority than isolated pages and that the estimate converges to within tolerance of the full computation.",
    dep: ["link-graph-store","discovered-link-intake","url-priority-scoring"]
  },
  "scope-and-depth-rules": {
    s: "Declarative rules that bound a crawl by domain, path, depth, language or hop count from a seed, so it covers a defined slice of the web.",
    d: "Operators write scope as allow and deny patterns on hosts, paths and top-level domains, plus a maximum link depth from a seed and rules such as stay-on-site. Rules apply at link intake and again before dispatch, because rules change while URLs wait. Each crawl job carries its own scope, so a broad crawl and a small targeted one can share workers. The hard part is expressing scope precisely enough: patterns that are too loose drift into the open web, too tight lose redirected or CDN-hosted resources.",
    k: ["Checking scope at intake only vs also at dispatch: intake-only is cheap; dispatch checks apply rule changes to already queued URLs at the cost of a lookup per fetch.", "Hop-count depth limit vs path-depth limit: hop count bounds drift from seeds; path depth bounds directory walks but allows unbounded link chains."],
    p: ["A redirect from an in-scope host to an out-of-scope one is either blocked wrongly or followed, silently widening the crawl.", "Changing scope without purging the frontier leaves old out-of-scope URLs to be fetched for days."],
    v: "Run a crawl with a scope of one domain and depth three over a test site that links outward. Confirm no out-of-scope host is ever requested in the access log and no page deeper than three hops appears.",
    dep: ["url-filters","front-queues","config-and-rollout"]
  },
  "host-quality-scoring": {
    s: "Rates each host as likely valuable, thin or spam from its observed history, and uses the rating to scale how much crawl budget the host gets.",
    d: "Features include the ratio of useful to duplicate or empty pages found so far, error rates, response speed, the share of pages that are boilerplate, link-graph standing and spam signals. The score sets how many pages per day the host is allowed and how its URLs are ranked against others. It protects budget from hosts that generate endless low-value content. It is hard because early samples are small and misleading, and a rating that is too harsh starves a good site that simply had a slow start.",
    k: ["Strict early cutoffs vs gradual budget growth: cutoffs save budget quickly; gradual growth avoids punishing slow starters but spends more on bad hosts first.", "Rating the host vs rating subtrees: host-level is simple; subtree-level separates a good blog from spam on the same domain but multiplies state."],
    p: ["One bad subdomain lowers the score of a whole large site hosting good content elsewhere.", "A score that is only ever lowered never gives a cleaned-up site a second chance."],
    v: "Seed the crawl with known spam hosts and known quality hosts. After a sample of pages each, confirm the spam hosts' allowed daily budget has fallen and the quality hosts' has risen, and list any misrated host for review.",
    dep: ["url-state-table","exact-content-hash","soft-404-detection","error-classification-metrics"]
  },
  "discovery-vs-refresh-balance": {
    s: "Splits fetch capacity between finding new URLs and revisiting known ones, a share that the operator or a controller sets and adjusts.",
    d: "A fixed share of each scheduling cycle goes to refresh and the rest to discovery, or a controller moves the split based on measured staleness of important pages and the yield of new pages. Each pool has its own queues so one cannot starve the other when the other is backlogged. It is a policy decision more than a mechanism: the right split depends on whether the corpus is judged on completeness or on freshness, and the web grows and changes at rates nobody sets.",
    k: ["Fixed split vs feedback-controlled split: fixed is predictable and easy to explain; controlled tracks real staleness and yield but can oscillate.", "Separate queues per pool vs one queue with weights: separate queues isolate backlogs; one queue is simpler and shares capacity automatically."],
    p: ["A large discovery backlog silently stops all refreshes, and the index goes stale over a few weeks.", "Controllers tuned on short windows oscillate every cycle and waste capacity."],
    v: "Measure, per day, the fraction of fetches that are new URLs versus revisits and the age distribution of important pages. Confirm the split matches the configured policy and that staleness stays under its target when discovery is overloaded.",
    dep: ["revisit-scheduler","front-queues","crawl-scheduler","crawl-budget-accounting"]
  },
  "focused-crawl-classifier": {
    s: "Predicts from a link's context whether the page it leads to will be relevant to the crawl's topic, so topic-focused crawls spend budget on likely hits.",
    d: "For a topical crawl, a lightweight classifier scores unfetched links using the anchor text, surrounding words, the URL itself and the topic score of the parent page. High-scoring links are fetched sooner, and the classifier can be retrained as fetched pages are labeled. It must be fast enough to run on every extracted link. The hard part is tunneling: relevant pages are often reached only through irrelevant ones, so a strict classifier cuts off whole regions it should have crossed.",
    k: ["Strict threshold vs soft ranking: a threshold saves budget and may lose content behind weak pages; soft ranking keeps reach and spends more.", "Context features only vs fetching the target to check: context is cheap and imprecise; fetching is exact and costs the budget it was meant to save."],
    p: ["Training on already-crawled pages biases the model toward the topic regions the crawl found first.", "Allowing zero low-score hops traps the crawl in one cluster."],
    v: "Hold out a labeled sample of target pages. Run the focused crawl and a plain breadth-first crawl for equal fetch counts, and confirm the focused one finds clearly more relevant pages, with its harvest rate reported.",
    dep: ["discovered-link-intake","url-priority-scoring","html-parser"]
  },
  "crawl-scheduler": {
    s: "The component that decides the order work leaves the frontier by combining priority, host readiness, budgets and pool shares into fetch assignments.",
    d: "Each cycle it looks at which hosts are ready under their politeness limits, which have budget left, and the highest-priority URLs waiting for those hosts, then emits batches for fetch workers. It enforces per-host and per-crawl budgets, the discovery and refresh split, and any scope changes. The scheduler needs a global enough view to be fair but must run locally to stay fast, and it has to keep thousands of fetch slots full without ever breaking a host's limit.",
    k: ["Central scheduler vs one scheduler per partition: central gives global fairness and is a bottleneck; per-partition scales and needs budgets divided in advance.", "Pull model, workers asking for work, vs push assignment: pull balances load naturally; push allows tighter global planning and wastes work when a worker stalls."],
    p: ["A scheduler that is idle-waiting on one slow host starves fetchers while other hosts have ready work.", "Budgets divided evenly across partitions leave capacity unused in partitions with fewer hosts."],
    v: "Run a load test with a mix of fast, slow and rate-limited hosts. Confirm fetch slots stay above the target utilization, no host exceeds its configured rate in the access log, and high-priority URLs leave the frontier first.",
    dep: ["front-queues","back-queues-per-host","host-readiness-heap","crawl-budget-accounting","fetch-batch-dispatch"]
  },
});
