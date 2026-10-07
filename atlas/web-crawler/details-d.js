// Details for the web crawler plate, part 4: fetcher and HTTP handling, parsing and rendering.
ATLAS.details("web-crawler", {
  "fetch-worker": {
    s: "The process that takes leased URLs, runs the request through DNS, connection, HTTP and validation steps with thousands of requests in flight, and emits results.",
    d: "A worker is an event-driven program holding thousands of concurrent requests, each a small state machine: resolve, connect, send, read, validate, hand off. It checks robots rules and the host's delay before sending, applies limits while reading, and then emits the response body with metadata to parsing and storage, or a classified failure to the retry logic. It is hard because it is dominated by waiting, so memory per request, fairness among slow requests and a bound on total in-flight bytes decide whether it runs well.",
    k: ["Event loop with many requests vs thread per request: the event loop handles tens of thousands of slow connections cheaply; threads are simpler to write and cost memory per connection.", "Parse in the fetcher vs in a separate stage: in-process saves copying; a separate stage isolates crashes and CPU spikes from the network path."],
    p: ["CPU-heavy parsing inside the event loop stalls every other in-flight request.", "No cap on buffered bytes lets a few large responses exhaust memory."],
    v: "Run a worker against a test farm of fast, slow and hanging servers at target concurrency. Confirm in-flight count holds at the target, memory stays under its cap, and results for every URL are either a response or a classified failure.",
    dep: ["connection-pool","request-builder","status-code-handling","size-and-time-limits","robots-rule-matcher"]
  },
  "request-builder": {
    s: "Constructs each HTTP request: the crawler's identifying agent string, accepted types and encodings, language hints, conditional headers and a contact reference.",
    d: "Headers declare the crawler's name and a link to a page describing it, accept compressed encodings, and prefer text types. On revisits it adds validators from the history. It sets a referer only when the policy allows. The request is fixed by the policy, not by site: sending different identities to different sites would defeat identification. It is hard because some servers vary content by headers, so what the crawler asks for changes what it gets, and a bad header combination makes servers return errors or block the crawler.",
    k: ["Declared crawler identity vs imitating a browser: declared is honest and allows site owners to manage it; imitating gets some blocked content and breaks trust and policy.", "Request all encodings vs identity only: compressed saves bandwidth and adds decode risk; identity is simple and costs bandwidth."],
    p: ["Sending a browser-like agent string leads site owners to block unfamiliar traffic they cannot identify.", "Language or device headers that differ between visits show different content and look like change."],
    v: "Capture requests at a test server. Confirm each carries the agent string with the contact URL, the standard accept headers and validators when expected, and that the identity is identical across all workers.",
    dep: ["crawler-identification","conditional-requests"]
  },
  "redirect-handling": {
    s: "Follows redirect responses up to a limit, detects loops, treats permanent and temporary ones differently, and records the chain so the final URL gets the right identity.",
    d: "Each redirect target is normalized and passed through the same filters as any new URL: scope, robots rules, blocklist and the seen set. A host change means the next request obeys the new host's delay. Permanent redirects update the URL's canonical identity, while temporary ones keep the original. Chains are capped at a handful of hops, and loops are detected by remembering visited addresses. It is hard because following a redirect inline bypasses the politeness queue unless it is requeued, and because redirects can cross into a trap or an out-of-scope site.",
    k: ["Follow inline vs requeue the target: inline is fast and can break host limits; requeue keeps politeness exact and adds a scheduling round trip.", "Record each hop as its own URL vs only the final: recording hops preserves the link graph; only the final saves space and loses the chain."],
    p: ["Following a redirect to another host without applying that host's delay bursts requests at it.", "A permanent redirect from many URLs to one page, such as a soft error page, floods the target."],
    v: "Serve a chain of mixed permanent and temporary redirects, a loop and a cross-host hop. Confirm the chain is capped, the loop is detected, the cross-host target is queued under its own host, and the stored identity matches the redirect type.",
    dep: ["url-normalization","url-filters","back-queues-per-host","bloom-filter-seen-set"]
  },
  "status-code-handling": {
    s: "Maps each HTTP status to an action: store, follow, retry later, retry soon, or give up, and records what the crawler learned about the URL and host.",
    d: "Success statuses go to parsing; not-modified keeps the existing copy; redirects go to the redirect logic; not found and gone mark the URL as dead after a confirmation visit; forbidden and unauthorized mark it as restricted; too-many-requests and service-unavailable slow the host and respect any retry-after value; other server errors are retried with backoff. The table is explicit because the same code means different things in different contexts. It is hard because servers lie: success pages that say 'not found', and errors that are really content.",
    k: ["Delete a URL on the first not-found vs after several confirmations: first is fast and discards pages lost to a transient glitch; confirmations keep them and delay cleanup.", "Per-code rules vs per-class defaults: per-code is precise and large; per-class is small and mishandles special codes like throttling."],
    p: ["Treating a throttling response as a plain error retries immediately and makes the overload worse.", "Removing pages after one 404 during a site's deployment glitch deletes valid content from the index."],
    v: "Serve every status in the table from a test host and confirm the recorded action, retry time and host-level effect for each. Confirm retry-after values are honored to the second.",
    dep: ["retry-and-backoff","adaptive-rate-control","url-state-table","redirect-handling"]
  },
  "retry-and-backoff": {
    s: "Reschedules failed fetches with growing delays and a bounded number of attempts, distinguishing temporary faults from permanent ones.",
    d: "Failures are classified: network error, timeout, server error, throttling, DNS failure. Each class has its own retry schedule, usually exponential with jitter, and a cap on attempts after which the URL is parked and retried much later. Retries go through the normal frontier so they obey host delay. Persistent failures lower the host's score. It is hard because retries are extra load on hosts that may already be in trouble, and because a retry storm after an outage can dominate the whole crawl.",
    k: ["Immediate retry vs backoff with jitter: immediate recovers from blips and compounds overload; backoff with jitter spreads load and delays recovery.", "Retry through the frontier vs inside the worker: through the frontier honors every limit; inside the worker is faster and bypasses them."],
    p: ["Without jitter, every failed URL from an outage retries at the same moment and fails again.", "Unbounded retries on a dead host fill the queue with work that never completes."],
    v: "Fail a test host for ten minutes. Confirm retries follow the configured schedule with spread, the attempt cap is respected, URLs resume after recovery, and the host's request rate never exceeds its limit.",
    dep: ["back-queues-per-host","error-classification-metrics","host-quality-scoring"]
  },
  "compression-handling": {
    s: "Decodes compressed response bodies and defends against decompression bombs by limiting the expanded size and ratio.",
    d: "The crawler advertises supported encodings and decodes the response according to what the server declares, sometimes with several layers. Decoding is streamed with a cap on output bytes and on the expansion ratio, and aborts when either is exceeded. Servers sometimes mislabel the encoding or send unlabelled compressed data, so a fallback checks the first bytes. It is hard because a small response can expand a thousand-fold, and because limits must be applied to the decoded size rather than the wire size.",
    k: ["Decode in the fetcher vs store the compressed body: decoding makes later stages simple and costs CPU and memory; storing compressed saves space and delays decode errors.", "Absolute size cap vs ratio cap: absolute bounds memory; a ratio also catches bombs smaller than the cap."],
    p: ["Checking only the compressed size lets a tiny file expand to gigabytes in memory.", "Trusting a wrong encoding label produces garbage text and no error."],
    v: "Fetch a normal compressed page, a mislabeled one and a deliberate bomb. Confirm the first decodes correctly, the second is recovered or rejected cleanly, and the bomb is aborted at the cap with bounded memory use.",
    dep: ["size-and-time-limits","request-builder"]
  },
  "size-and-time-limits": {
    s: "Caps on response size and total fetch time, so one huge or endless response cannot consume bandwidth, memory or a fetch slot.",
    d: "Responses are read as a stream and cut at a size limit, commonly a few megabytes for pages and larger for allowed document types. A declared length above the limit is rejected before the body is read; an undeclared or false length is caught while streaming. Truncated pages may be kept and flagged or discarded depending on type. Limits differ by content class. It is hard because the right cap is a trade-off with coverage: some valid pages are large, and a truncated document may lose the links at the end.",
    k: ["Truncate at the limit vs reject whole: truncate keeps most of the content and risks broken documents; reject keeps only complete pages and loses large ones.", "One global limit vs limits per content type: global is simple; per type fit PDFs and pages separately and require correct typing first."],
    p: ["Trusting the declared length alone lets an endless stream fill disk and memory.", "Truncating a page before its footer drops the pagination links that the crawl needed."],
    v: "Fetch test files at, just below and just above the limit, with correct, missing and false length headers. Confirm each is accepted, flagged truncated or rejected as designed and that memory use never passes the cap.",
    dep: ["timeouts-and-deadlines","content-type-sniffing"]
  },
  "content-type-sniffing": {
    s: "Determines what a response actually is from its declared type, URL and leading bytes, because servers often label content wrongly.",
    d: "The declared type is taken as a hint and checked against the initial bytes: markup signatures, document magic numbers, compressed archives, binary media. A mismatch is resolved by a precedence rule, usually trusting the bytes for markup and for known binary formats. The result chooses the parser and the storage policy, and rejects types the crawl does not handle. It is hard because sniffing too aggressively treats user content as markup and too lazily skips real pages labeled as plain text, and because the rules should match what browsers do.",
    k: ["Trust the declared type vs sniff the bytes: declared is cheap and wrong on many servers; sniffing handles mislabeled files and costs a little CPU.", "Sniff only the first kilobytes vs scan more: first bytes are fast and cover most files; scanning further catches late signatures at a cost."],
    p: ["A page served as plain text but containing markup is never parsed, and its links are lost.", "A binary file served as a page is parsed as text and creates thousands of garbage links."],
    v: "Serve a set of files with correct, wrong and missing types: pages, documents, images and archives. Confirm each is routed to the right parser or rejected, and the decision and reason are stored with the record.",
    dep: ["document-extractors","html-parser"]
  },
  "charset-detection": {
    s: "Works out the character encoding of a page from headers, byte-order marks, meta declarations and byte statistics, so text decodes correctly.",
    d: "Sources are checked in a defined order: a byte-order mark, the transport header, a declaration in the first part of the markup, then statistical detection on the bytes. Decoding errors can reveal a wrong guess and trigger a retry with another candidate. The result is recorded and everything downstream works in one internal encoding. It is hard because a large share of pages declare nothing or declare wrongly, and a wrong guess still decodes into plausible-looking garbage that damages text, links and fingerprints.",
    k: ["Header first vs content declaration first: header follows the protocol and is often wrong; content declaration is usually right and requires reading the start of the page.", "Statistical detection always vs only as a fallback: always catches wrong labels at a CPU cost; fallback is cheap and trusts declarations that may be wrong."],
    p: ["A page decoded with the wrong encoding yields garbled text, and a fingerprint of that text differs from the true one.", "Detection run on a binary file produces random text and spurious links."],
    v: "Decode a corpus of pages in many encodings with correct, wrong and missing declarations. Confirm the decoded text matches the reference and that the chosen encoding and its source are recorded for each page.",
    dep: ["content-type-sniffing"]
  },
  "html-parser": {
    s: "A tolerant markup parser that builds a document tree from the broken HTML found on the web, following the standard's error-recovery rules.",
    d: "Real pages have unclosed tags, nested forms, misplaced elements and invalid attributes. The parser follows the standard's tree-construction algorithm so it produces the same tree a browser would, which keeps extracted links and text consistent with what users see. Streaming parsers extract links while reading and use little memory; tree parsers allow later passes. Depth and node limits stop pathological documents. It is hard because a hostile page can be built to exhaust time or memory, so bounded work is a security requirement.",
    k: ["Streaming parse vs full tree: streaming is fast and low memory and gives limited context; a tree allows queries and boilerplate analysis at several times the memory.", "Standard-conformant recovery vs a simplified lenient parser: conformant matches browsers; simplified is faster and misreads malformed markup."],
    p: ["Deeply nested tags or millions of attributes exhaust memory or recursion limits in the parser.", "A simplified parser handles unclosed tags differently from browsers and extracts links that do not exist."],
    v: "Parse a corpus of malformed pages and compare extracted links and text with a reference conformant implementation. Confirm adversarial inputs finish within time and memory bounds.",
    dep: ["charset-detection","content-type-sniffing"]
  },
  "link-extractor": {
    s: "Finds every outgoing reference in a page: anchors, frames, images, scripts, forms, metadata and, where possible, URLs inside script text.",
    d: "The extractor walks the parsed document, collects attributes known to hold URLs, resolves them against the base address and records the anchor text, the surrounding context and attributes such as relationship values. A heuristic pass over inline script finds URLs built from literals. The output is a list of candidate links with context for scoring. It is hard because modern pages carry thousands of links, most in navigation boilerplate, and because links assembled by script at runtime are invisible without rendering.",
    k: ["Extract only anchors vs all URL-bearing attributes: anchors are the content graph and are fast; all attributes find resources and add many junk URLs.", "Scan script text for URL literals vs ignore script: scanning finds more links and many false ones; ignoring is clean and misses script-driven navigation."],
    p: ["Treating tracking pixel and asset URLs as pages floods the frontier with non-content.", "Missing a base element resolves relative links against the wrong address."],
    v: "Extract links from test pages with each link form, a base element and script-built URLs. Confirm the output set equals the expected list, with correct absolute URLs and context for each link.",
    dep: ["html-parser","base-url-and-nofollow","url-parser"]
  },
  "base-url-and-nofollow": {
    s: "Applies the document's base address and relationship attributes such as nofollow, sponsored and user-generated to resolve links and tag them for scoring.",
    d: "A base declaration changes how every relative link resolves, and ignoring it produces wrong addresses on pages that use one. Relationship attributes mark links the author does not vouch for; the crawler can follow them for discovery while withholding importance, or skip them. The values are stored with the link in the link graph. It is hard because honoring the attribute fully reduces discovery, ignoring it spreads importance to spam, and several values can appear on one link.",
    k: ["Follow nofollow links without passing importance vs skip them: following finds more pages and treats the attribute as a ranking hint; skipping respects it as a crawling rule and loses discovery.", "Honor the first base declaration vs the last: first matches the standard; any other choice breaks the links on odd pages."],
    p: ["Ignoring a base declaration sends the crawler to thousands of invalid addresses.", "Dropping relationship values makes comment spam links count as editorial."],
    v: "Parse pages with a base element, relative and absolute links, and each relationship attribute. Confirm resolved addresses are correct and each stored link carries the right flags.",
    dep: ["html-parser","url-parser"]
  },
  "meta-robots-directives": {
    s: "Reads page-level directives, in markup tags and response headers, that tell crawlers not to index, follow links from, or archive that page.",
    d: "Directives can come from a meta element or from a response header, and per-agent variants exist. They are parsed after the fetch, stored with the page record and applied downstream: a no-index page is fetched but flagged for the index, a no-follow page's links are not followed, a no-archive page is not retained for cache or display. Because they require fetching the page, they differ from the robots file, which prevents the fetch. It is hard because directive precedence among header, markup and robots file is easy to get wrong.",
    k: ["Honor at fetch time vs at index time: fetch time prevents storing disallowed content; index time keeps the record and relies on later stages to act.", "Strictest directive wins vs latest wins: strictest is safe and removes valid pages; latest follows document order and can undo an intended restriction."],
    p: ["A no-index directive in a header is ignored because only markup tags are parsed.", "Blocking a page in the robots file prevents the crawler from ever seeing its no-index directive."],
    v: "Serve pages with each directive in markup and in headers, and conflicting combinations. Confirm each record carries the right flags and downstream stages treat flagged pages as specified.",
    dep: ["html-parser","status-code-handling","downstream-handoff"]
  },
  "render-decision": {
    s: "Decides, per page or per site, whether plain parsing is enough or the page needs a headless browser, because rendering costs far more than parsing.",
    d: "Signals include a near-empty body with large script bundles, known application shells, a framework marker, and a low link count compared with the host's neighbors. A sample of pages on a host may be rendered and compared with the plain parse; if the rendered version has much more text or links, the host is flagged for rendering. The decision is cached per host or template. It is hard because rendering everything is unaffordable and rendering too little silently loses whole sites built on script.",
    k: ["Heuristics on the raw page vs rendering a sample to compare: heuristics are cheap and miss new frameworks; sampling is accurate and costs renders.", "Per-page decision vs per-host decision: per-page is exact and expensive; per-host is cheap and treats mixed sites wrongly."],
    p: ["A script-built site parsed without rendering yields an empty page that is stored as a legitimate result.", "Rendering triggered by a weak signal on a large host consumes the render pool."],
    v: "Run the decision over a labeled set of static and script-built pages. Confirm the share of script-built pages routed to rendering and the false-render rate, and compare extracted text for both routes on a sample.",
    dep: ["html-parser","link-extractor","host-quality-scoring"]
  },
  "headless-renderer-pool": {
    s: "A pool of headless browser instances that load a page, run its scripts under limits, wait for it to settle and return the final document and discovered links.",
    d: "Each render opens a page in an isolated browser context, blocks heavy resources such as images and fonts, limits network calls and run time, waits for a quiet network period, and serializes the resulting document. Instances are recycled often to bound memory. Sub-requests the page makes are fetched through the crawler's own politeness and robots logic rather than directly. It is hard because rendering is about a hundred times the cost of fetching, pages can run forever or open dialogs, and the sandbox must contain whatever the page does.",
    k: ["Wait for a fixed time vs wait for network quiet: fixed time is predictable and misses late content; quiet detection finds more and can wait too long on pages with polling.", "Reuse browser instances vs a fresh one per page: reuse is cheaper and leaks state and memory; fresh is clean and slower."],
    p: ["Sub-requests made by the page go straight out and bypass robots rules and per-host delays.", "A page with an endless timer keeps an instance busy until the hard timeout, and the pool starves."],
    v: "Render a test script-built page and compare its extracted text and links against the expected final state. Confirm blocked resources are not fetched, sub-requests appear in the crawler's own log, and a runaway page is killed at its deadline.",
    dep: ["render-decision","fetch-worker","robots-rule-matcher","timeouts-and-deadlines"]
  },
  "document-extractors": {
    s: "Extracts text, metadata and links from non-HTML formats such as PDF files, office documents, feeds and plain text, within time and memory limits.",
    d: "Each supported type has a converter that produces text, a title, and any embedded links. Converters run in sandboxed, resource-limited processes because their input is untrusted and their parsers are large. Output is normalized to the same record shape as HTML pages so downstream stages need no special cases. It is hard because the formats are complex and malformed in the wild, extraction quality varies, and a single hostile file can crash or hang a converter.",
    k: ["Convert in-process vs in a sandboxed worker: in-process is fast and a crash takes the worker; sandboxed is safe and adds startup and copy cost.", "Support many types vs few: many increases coverage and the attack surface; few is safe and ignores large parts of the web."],
    p: ["A malformed file hangs a converter with no time limit and blocks a worker slot.", "Extracting text from scanned images yields nothing, and the page looks empty."],
    v: "Run extractors on a corpus of valid, corrupted and hostile files. Confirm text matches reference output for valid ones and that hostile ones are killed within limits without affecting other work.",
    dep: ["content-type-sniffing","size-and-time-limits"]
  },
  "structured-data-extraction": {
    s: "Pulls machine-readable annotations from pages, such as embedded JSON, microdata and meta properties, giving titles, dates, authors and entity types.",
    d: "Standard annotation formats embedded in pages describe what the page is about. The extractor reads them from the parsed document, validates against known vocabularies, and stores the results next to the page. Dates and canonical addresses found there feed change detection and canonical selection. It is hard because the annotations are authored by the site, often wrong or stuffed for ranking, and so are treated as claims to cross-check rather than facts.",
    k: ["Store raw annotation text vs parsed fields: raw preserves everything and defers interpretation; parsed is directly usable and loses unknown fields.", "Trust annotations vs cross-check against visible content: trust is simple and exploitable; cross-checking resists stuffing and costs extra processing."],
    p: ["Annotations that describe content not shown on the page are stored as true.", "A malformed block is dropped and the rest of the page's annotations are lost with it."],
    v: "Extract from pages with valid, partial and conflicting annotations. Confirm parsed fields match the expected values, malformed blocks are logged without discarding others, and conflicts with visible text are flagged.",
    dep: ["html-parser","canonical-link-hints"]
  },
});
